// APEX-SENTINEL — W9 DataFeedBroker Tests
// FR-W9-06 | tests/feeds/FR-W9-06-data-feed-broker.test.ts
// TDD RED phase — src/feeds/data-feed-broker does not exist yet

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataFeedBroker, type FeedClient, type FusedMessage } from '../../src/feeds/data-feed-broker.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeFeedClient(type: string): FeedClient & { _emitData: (payload: unknown) => void } {
  const listeners: Array<(data: unknown) => void> = [];
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((event: string, handler: (data: unknown) => void) => {
      if (event === 'data') listeners.push(handler);
    }),
    _emitData: (payload: unknown) => listeners.forEach(h => h(payload)),
    type,
  } as unknown as FeedClient & { _emitData: (payload: unknown) => void };
}

function makeNatsMock() {
  return {
    publish: vi.fn(),
    subscribe: vi.fn(),
  };
}

// ── Describe block ─────────────────────────────────────────────────────────

describe('FR-W9-06: DataFeedBroker — NATS feed.* aggregator', () => {

  let broker: DataFeedBroker;
  let nats: ReturnType<typeof makeNatsMock>;
  let adsbClient: ReturnType<typeof makeFeedClient>;
  let weatherClient: ReturnType<typeof makeFeedClient>;
  let alertsClient: ReturnType<typeof makeFeedClient>;
  let osintClient: ReturnType<typeof makeFeedClient>;
  let remoteIdClient: ReturnType<typeof makeFeedClient>;

  beforeEach(() => {
    nats = makeNatsMock();
    adsbClient = makeFeedClient('adsb');
    weatherClient = makeFeedClient('weather');
    alertsClient = makeFeedClient('alerts');
    osintClient = makeFeedClient('osint');
    remoteIdClient = makeFeedClient('remote_id');

    broker = new DataFeedBroker(nats, [
      adsbClient,
      weatherClient,
      alertsClient,
      osintClient,
      remoteIdClient,
    ]);
  });

  // ── Unit tests ──────────────────────────────────────────────────────────

  it('FR-W9-06-U01: Constructor accepts nats client and array of FeedClient', () => {
    expect(broker).toBeInstanceOf(DataFeedBroker);
    expect(broker).toBeDefined();
  });

  it('FR-W9-06-U02: start() calls start on all feed clients', async () => {
    await broker.start();
    expect(adsbClient.start).toHaveBeenCalledTimes(1);
    expect(weatherClient.start).toHaveBeenCalledTimes(1);
    expect(alertsClient.start).toHaveBeenCalledTimes(1);
    expect(osintClient.start).toHaveBeenCalledTimes(1);
    expect(remoteIdClient.start).toHaveBeenCalledTimes(1);
  });

  it('FR-W9-06-U03: stop() calls stop on all feed clients', async () => {
    await broker.start();
    await broker.stop();
    expect(adsbClient.stop).toHaveBeenCalledTimes(1);
    expect(weatherClient.stop).toHaveBeenCalledTimes(1);
    expect(alertsClient.stop).toHaveBeenCalledTimes(1);
    expect(osintClient.stop).toHaveBeenCalledTimes(1);
    expect(remoteIdClient.stop).toHaveBeenCalledTimes(1);
  });

  it('FR-W9-06-U04: Publishes to feed.fused within 5s of start', async () => {
    await broker.start();
    adsbClient._emitData({ icao: 'ABC123', lat: 48.0, lon: 25.0 });
    expect(nats.publish).toHaveBeenCalledWith('feed.fused', expect.any(Object));
  });

  it('FR-W9-06-U05: FusedMessage has: id, ts, subject, payload, sourceHash', async () => {
    await broker.start();
    adsbClient._emitData({ icao: 'ABC123', lat: 48.0, lon: 25.0 });
    const call = nats.publish.mock.calls[0];
    expect(call[0]).toBe('feed.fused');
    const msg: FusedMessage = call[1];
    expect(msg).toHaveProperty('id');
    expect(msg).toHaveProperty('ts');
    expect(msg).toHaveProperty('subject');
    expect(msg).toHaveProperty('payload');
    expect(msg).toHaveProperty('sourceHash');
  });

  it('FR-W9-06-U06: sourceHash is SHA-256 of JSON payload (deduplication key)', async () => {
    await broker.start();
    const payload = { icao: 'DEF456', lat: 49.0, lon: 26.0 };
    adsbClient._emitData(payload);
    const msg: FusedMessage = nats.publish.mock.calls[0][1];
    // SHA-256 hex is 64 chars
    expect(msg.sourceHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('FR-W9-06-U07: Duplicate message (same sourceHash within 30s) NOT republished', async () => {
    await broker.start();
    const payload = { icao: 'DUP001', lat: 48.5, lon: 25.5 };
    adsbClient._emitData(payload);
    adsbClient._emitData(payload); // exact duplicate
    expect(nats.publish).toHaveBeenCalledTimes(1);
  });

  it('FR-W9-06-U08: Different sourceHash (different content) republished even in 30s window', async () => {
    await broker.start();
    adsbClient._emitData({ icao: 'AAA', lat: 48.0, lon: 25.0 });
    adsbClient._emitData({ icao: 'BBB', lat: 49.0, lon: 26.0 }); // different content
    expect(nats.publish).toHaveBeenCalledTimes(2);
  });

  it('FR-W9-06-U09: One feed client failing does not stop others', async () => {
    (adsbClient.start as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('ADS-B connection failed'));
    await broker.start(); // should not throw
    // other clients still started
    expect(weatherClient.start).toHaveBeenCalledTimes(1);
    expect(alertsClient.start).toHaveBeenCalledTimes(1);
    expect(osintClient.start).toHaveBeenCalledTimes(1);
    expect(remoteIdClient.start).toHaveBeenCalledTimes(1);
  });

  it('FR-W9-06-U10: All 5 feed types represented in feed.fused stream (adsb, weather, alerts, osint, remote_id)', async () => {
    await broker.start();
    adsbClient._emitData({ type: 'adsb', data: 1 });
    weatherClient._emitData({ type: 'weather', data: 2 });
    alertsClient._emitData({ type: 'alerts', data: 3 });
    osintClient._emitData({ type: 'osint', data: 4 });
    remoteIdClient._emitData({ type: 'remote_id', data: 5 });

    const publishedSubjects = nats.publish.mock.calls.map((c: unknown[]) => c[0]);
    expect(publishedSubjects.filter((s: string) => s === 'feed.fused')).toHaveLength(5);

    const feedTypes = nats.publish.mock.calls.map((c: unknown[]) => (c[1] as FusedMessage).feedType);
    expect(feedTypes).toContain('adsb');
    expect(feedTypes).toContain('weather');
    expect(feedTypes).toContain('alerts');
    expect(feedTypes).toContain('osint');
    expect(feedTypes).toContain('remote_id');
  });

  it('FR-W9-06-U11: NATS publish called with correct subject (feed.fused)', async () => {
    await broker.start();
    adsbClient._emitData({ icao: 'TEST' });
    const [subject] = nats.publish.mock.calls[0];
    expect(subject).toBe('feed.fused');
  });

  it('FR-W9-06-U12: Back-pressure: >200 msg/s causes throttling (some messages dropped, no crash)', async () => {
    await broker.start();
    // Emit 300 messages synchronously — broker must not throw
    for (let i = 0; i < 300; i++) {
      adsbClient._emitData({ seq: i, lat: Math.random(), lon: Math.random() });
    }
    // Some messages published, but must be fewer than 300 (throttle engaged)
    const published = nats.publish.mock.calls.length;
    expect(published).toBeLessThan(300);
    expect(published).toBeGreaterThan(0);
  });

  it('FR-W9-06-U13: 4h TTL: messages older than 4h evicted from dedup cache', async () => {
    await broker.start();
    const payload = { icao: 'TTL001', lat: 48.0, lon: 25.0 };
    adsbClient._emitData(payload);
    expect(nats.publish).toHaveBeenCalledTimes(1);

    // Advance clock past 4h TTL
    broker.runGC(Date.now() + 4 * 60 * 60 * 1000 + 1);

    // Same payload should be accepted again (cache evicted)
    adsbClient._emitData(payload);
    expect(nats.publish).toHaveBeenCalledTimes(2);
  });

  it('FR-W9-06-U14: GC runs every 60s to clear expired entries', async () => {
    await broker.start();
    const gcSpy = vi.spyOn(broker, 'runGC');
    // Simulate two 60s ticks
    broker.tickGC(Date.now() + 60_000);
    broker.tickGC(Date.now() + 120_000);
    expect(gcSpy).toHaveBeenCalledTimes(2);
  });

  it('FR-W9-06-U15: feed.fused message envelope includes original subject and feed type', async () => {
    await broker.start();
    adsbClient._emitData({ icao: 'XYZ', lat: 48.1, lon: 25.1 });
    const msg: FusedMessage = nats.publish.mock.calls[0][1];
    expect(msg.subject).toBeDefined();
    expect(msg.feedType).toBe('adsb');
  });

  it('FR-W9-06-U16: FeedClient interface: { start(): Promise<void>, stop(): Promise<void>, on(event, handler): void }', () => {
    const client: FeedClient = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    };
    // Type-level test: if FeedClient interface is correct, this compiles
    expect(typeof client.start).toBe('function');
    expect(typeof client.stop).toBe('function');
    expect(typeof client.on).toBe('function');
  });

  it('FR-W9-06-U17: DataFeedBroker emits "started" event after all clients start', async () => {
    const handler = vi.fn();
    broker.on('started', handler);
    await broker.start();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('FR-W9-06-U18: DataFeedBroker emits "error" event when any client throws (does not crash)', async () => {
    const errorHandler = vi.fn();
    broker.on('error', errorHandler);
    (adsbClient.start as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('feed down'));
    await broker.start();
    expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({ message: 'feed down' }));
  });

  it('FR-W9-06-U19: Metrics: broker.getStats() returns { messagesPublished, duplicatesDropped, clientErrors }', async () => {
    await broker.start();
    const payload = { icao: 'STAT1', lat: 48.0, lon: 25.0 };
    adsbClient._emitData(payload);
    adsbClient._emitData(payload); // duplicate — dropped

    const stats = broker.getStats();
    expect(stats).toHaveProperty('messagesPublished');
    expect(stats).toHaveProperty('duplicatesDropped');
    expect(stats).toHaveProperty('clientErrors');
    expect(stats.messagesPublished).toBe(1);
    expect(stats.duplicatesDropped).toBe(1);
  });

  it('FR-W9-06-U20: NATS connection failure on start() propagates as thrown error', async () => {
    const failingNats = { publish: vi.fn(), subscribe: vi.fn() };
    const errorBroker = new DataFeedBroker(failingNats, [adsbClient]);
    // Simulate NATS being unreachable — broker must surface the error
    (failingNats.publish as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('NATS connection refused');
    });
    await errorBroker.start();
    // After start, emitting data that tries to publish must surface error via 'error' event or stats
    const errorHandler = vi.fn();
    errorBroker.on('error', errorHandler);
    adsbClient._emitData({ icao: 'FAIL' });
    expect(errorHandler).toHaveBeenCalled();
  });
});
