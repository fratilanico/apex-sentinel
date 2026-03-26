// APEX-SENTINEL — W9 DataFeedBroker
// FR-W9-06 | src/feeds/data-feed-broker.ts

import { EventEmitter } from 'events';
import { createHash, randomUUID } from 'crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export type FeedType = 'adsb' | 'weather' | 'alerts' | 'osint' | 'remote_id';

export interface FeedClient {
  start(): Promise<void>;
  stop(): Promise<void>;
  on(event: 'data', handler: (data: unknown) => void): void;
  type?: string;
}

export interface FusedMessage {
  id: string;
  ts: string;
  subject: string;
  payload: unknown;
  sourceHash: string;
  feedType: string;
}

interface NatsClient {
  publish(subject: string, data: unknown): void;
  subscribe?(subject: string, handler: (msg: unknown) => void): void;
}

interface DedupEntry {
  hash: string;
  addedAt: number;
}

interface BrokerStats {
  messagesPublished: number;
  duplicatesDropped: number;
  clientErrors: number;
}

// ── Token bucket for back-pressure ──────────────────────────────────────────

class TokenBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillRateMs: number;
  private lastRefill: number;

  constructor(capacity: number, refillRateMs: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRateMs = refillRateMs;
    this.lastRefill = Date.now();
  }

  tryConsume(): boolean {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const refilled = Math.floor(elapsed / this.refillRateMs) * this.capacity;
    if (refilled > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + refilled);
      this.lastRefill = now;
    }
    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    return false;
  }
}

// ── DataFeedBroker ───────────────────────────────────────────────────────────

export class DataFeedBroker extends EventEmitter {
  private readonly nats: NatsClient;
  private readonly feeds: FeedClient[];
  private readonly dedupCache = new Map<string, DedupEntry>();
  private readonly stats: BrokerStats = {
    messagesPublished: 0,
    duplicatesDropped: 0,
    clientErrors: 0,
  };
  // Token bucket: 200 msg/s → refill 200 tokens per 1000ms
  private readonly bucket = new TokenBucket(200, 1000);

  constructor(
    natsOrOptions: NatsClient | {
      nats: NatsClient;
      adsbClient?: { start(): Promise<void>; stop(): Promise<void>; on?: (e: string, h: (d: unknown) => void) => void };
      civilProtectionClient?: { start(): Promise<void>; stop(): Promise<void>; on?: (e: string, h: (d: unknown) => void) => void };
      openMeteoClient?: { start(): Promise<void>; stop(): Promise<void>; on?: (e: string, h: (d: unknown) => void) => void };
      [key: string]: unknown;
    },
    feeds?: FeedClient[]
  ) {
    super();
    if (feeds !== undefined) {
      // Positional form: (nats, feeds[])
      this.nats = natsOrOptions as NatsClient;
      this.feeds = feeds;
    } else if (typeof natsOrOptions === 'object' && 'nats' in natsOrOptions) {
      // Named object form: { nats, adsbClient, civilProtectionClient, ... }
      const opts = natsOrOptions as { nats: NatsClient; [key: string]: unknown };
      this.nats = opts.nats;
      const namedClients = Object.entries(opts)
        .filter(([k]) => k !== 'nats')
        .map(([, v]) => v)
        .filter((v): v is FeedClient =>
          v != null &&
          typeof v === 'object' &&
          typeof (v as FeedClient).start === 'function' &&
          typeof (v as FeedClient).stop === 'function'
        );
      this.feeds = namedClients;
    } else {
      // Fallback: treat as nats with empty feeds
      this.nats = natsOrOptions as NatsClient;
      this.feeds = [];
    }
  }

  async start(): Promise<void> {
    for (const feed of this.feeds) {
      try {
        await feed.start();
        // If the client supports event-driven data, wire it
        if (typeof feed.on === 'function') {
          feed.on('data', (payload: unknown) => this.handleData(feed, payload));
        }
        // If the client has getter methods, poll once immediately
        await this.pollClientGetters(feed);
      } catch (err) {
        this.stats.clientErrors++;
        if (this.listenerCount('error') > 0) {
          this.emit('error', err as Error);
        }
      }
    }
    this.emit('started');
  }

  private async pollClientGetters(feed: FeedClient): Promise<void> {
    const c = feed as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    const getters: Array<[string, string]> = [
      ['getAircraft', 'adsb'],
      ['getActiveAlerts', 'alerts'],
      ['getWeather', 'weather'],
      ['getCurrent', 'weather'],
      ['getEvents', 'osint'],
    ];
    for (const [method, feedType] of getters) {
      if (typeof c[method] === 'function') {
        try {
          const data = await c[method]();
          const snapshot = this._lastSnapshot ?? {};
          snapshot[feedType] = data;
          this._lastSnapshot = snapshot;
          const typedFeed = { ...feed, type: feedType } as FeedClient;
          this.handleData(typedFeed, { [feedType]: data });
        } catch {
          // ignore getter errors
        }
      }
    }
  }

  async stop(): Promise<void> {
    for (const feed of this.feeds) {
      try {
        await feed.stop();
      } catch {
        // ignore stop errors
      }
    }
    this.removeAllListeners();
  }

  private handleData(feed: FeedClient, payload: unknown): void {
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');

    // Dedup check
    if (this.dedupCache.has(hash)) {
      this.stats.duplicatesDropped++;
      return;
    }

    // Back-pressure
    if (!this.bucket.tryConsume()) {
      this.stats.duplicatesDropped++;
      return;
    }

    // Add to dedup cache with TTL 30s
    this.dedupCache.set(hash, { hash, addedAt: Date.now() });

    const feedType = (feed as FeedClient & { type?: string }).type ?? 'unknown';
    const msg: FusedMessage = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      subject: `feed.${feedType}`,
      payload,
      sourceHash: hash,
      feedType,
    };

    try {
      this.nats.publish('feed.fused', msg);
      this.emit('feed.fused', msg);
      this.stats.messagesPublished++;
    } catch (err) {
      this.stats.clientErrors++;
      if (this.listenerCount('error') > 0) {
        this.emit('error', err as Error);
      }
    }
  }

  /** Run dedup cache GC — evict entries older than 4h. */
  runGC(nowMs?: number): void {
    const now = nowMs ?? Date.now();
    const TTL_4H = 4 * 60 * 60 * 1000;
    for (const [key, entry] of this.dedupCache.entries()) {
      if (now - entry.addedAt >= TTL_4H) {
        this.dedupCache.delete(key);
      }
    }
  }

  /** Trigger a single GC tick (called by callers to simulate 60s interval). */
  tickGC(nowMs?: number): void {
    this.runGC(nowMs);
  }

  getStats(): BrokerStats {
    return { ...this.stats };
  }

  /**
   * Returns the latest snapshot from the in-memory feed cache for a given feed type.
   * Used by ThreatContextEnricher when broker is passed directly as feedBroker.
   */
  async getFeedSnapshot(_feedType: string): Promise<unknown> {
    const snap = this._lastSnapshot ?? {};
    // Normalize to the shape ThreatContextEnricher expects
    return {
      adsb: snap['adsb'] ?? [],
      alerts: snap['alerts'] ?? [],
      weather: snap['weather'] ?? null,
      osint: snap['osint'] ?? [],
      remoteId: snap['remote_id'] ?? [],
    };
  }

  /** Internal: updated by handleData for snapshot access */
  private _lastSnapshot: Record<string, unknown> | null = null;
}
