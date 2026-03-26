// APEX-SENTINEL — W9 LiveFeedAdapter
// FR-W9-08 | src/ui/demo-dashboard/live-feed-adapter.ts

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { type DataFeedBroker, type FusedMessage } from '../../feeds/data-feed-broker.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SseChunk {
  event: string;
  data: string;
  id: string;
  retry: number;
}

interface SseStream {
  write(chunk: string): void;
  end?(): void;
}

const KNOWN_FEED_TYPES = new Set(['adsb', 'weather', 'alerts', 'alert', 'osint', 'remote_id']);

const FEED_TYPE_TO_SSE_EVENT: Record<string, string> = {
  adsb: 'aircraft',
  weather: 'weather',
  alerts: 'alert',
  alert: 'alert',
  osint: 'osint',
  remote_id: 'remote_id',
};

const HEARTBEAT_INTERVAL_MS = 5_000;
const SSE_RETRY_MS = 3_000;

// ── LiveFeedAdapter ──────────────────────────────────────────────────────────

export class LiveFeedAdapter extends EventEmitter {
  private readonly broker: DataFeedBroker;
  private streams: SseStream[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private boundHandler: ((msg: FusedMessage) => void) | null = null;

  constructor(broker: DataFeedBroker) {
    super();
    this.broker = broker;
  }

  getBroker(): DataFeedBroker {
    return this.broker;
  }

  /** Register a stream for fanout. Must be called before start() to be wired in. */
  addStream(stream: SseStream): void {
    if (!this.streams.includes(stream)) {
      this.streams.push(stream);
    }
  }

  start(stream?: SseStream): void {
    if (stream) {
      this.addStream(stream);
    }

    // Only register the broker listener once
    if (this.boundHandler) return;

    this.boundHandler = (msg: FusedMessage) => this.handleFused(msg);
    (this.broker as unknown as EventEmitter).on('feed.fused', this.boundHandler);

    // Heartbeat: emit every 5s if no data
    this.heartbeatTimer = setInterval(() => {
      const chunk = this.formatSse('heartbeat', { ts: Date.now() }, randomUUID());
      for (const s of this.streams) {
        s.write(chunk);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    if (this.boundHandler) {
      (this.broker as unknown as EventEmitter).off('feed.fused', this.boundHandler);
      this.boundHandler = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.streams = [];
  }

  private handleFused(msg: FusedMessage): void {
    const feedType = msg.feedType;

    if (!KNOWN_FEED_TYPES.has(feedType)) {
      console.warn(`LiveFeedAdapter: unknown feedType "${feedType}" — skipping`);
      return;
    }

    const sseEvent = FEED_TYPE_TO_SSE_EVENT[feedType];
    const data = this.buildPayload(feedType, msg);
    const chunk = this.formatSse(sseEvent, data, msg.id ?? randomUUID());

    for (const s of this.streams) {
      s.write(chunk);
    }
  }

  private buildPayload(feedType: string, msg: FusedMessage): Record<string, unknown> {
    const payload = msg.payload as Record<string, unknown> ?? {};

    if (feedType === 'adsb') {
      // Privacy: strip lat/lon/icao24 — only summary fields allowed
      return {
        aircraftCount: typeof payload.aircraftCount === 'number'
          ? payload.aircraftCount
          : (Array.isArray(payload.aircraft) ? payload.aircraft.length : 0),
        anomalyFlags: payload.anomalyFlags ?? [],
        squawkAlerts: payload.squawkAlerts ?? [],
      };
    }

    if (feedType === 'alert' || feedType === 'alerts') {
      return {
        activeAlertCount: 1,
        id: payload.id,
        severity: payload.severity,
        message: payload.message,
      };
    }

    if (feedType === 'weather') {
      return {
        wind: payload.wind,
        visibilityKm: payload.visibilityKm,
      };
    }

    if (feedType === 'osint') {
      return {
        sourceUrl: payload.sourceUrl,
        summary: payload.summary,
      };
    }

    if (feedType === 'remote_id') {
      return {
        operatorId: payload.operatorId,
        uasId: payload.uasId,
      };
    }

    return payload;
  }

  private formatSse(event: string, data: Record<string, unknown>, id: string): string {
    return [
      `event: ${event}`,
      `data: ${JSON.stringify(data)}`,
      `id: ${id}`,
      `retry: ${SSE_RETRY_MS}`,
      '',
      '',
    ].join('\n');
  }
}
