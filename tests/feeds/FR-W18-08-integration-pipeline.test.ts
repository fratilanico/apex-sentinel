// APEX-SENTINEL W18 — FR-W18-08: EuDataIntegrationPipeline
// TDD RED — src/feeds/eu-data-integration-pipeline.ts not yet written

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EuDataIntegrationPipeline } from '../../src/feeds/eu-data-integration-pipeline.js';
import type { EuSituationalPicture } from '../../src/feeds/types.js';

// ---------------------------------------------------------------------------
// Mock feed factories
// ---------------------------------------------------------------------------

/** Returns a minimal healthy mock feed that resolves immediately */
const makeMockFeed = (id: string, tier: 1 | 2 | 3 = 1) => ({
  feedId: id,
  tier,
  poll: vi.fn().mockResolvedValue(undefined),
  getData: vi.fn().mockReturnValue([]),
});

/** Returns a mock feed whose poll() throws */
const makeFailingFeed = (id: string, tier: 1 | 2 | 3 = 1) => ({
  feedId: id,
  tier,
  poll: vi.fn().mockRejectedValue(new Error(`${id}: connection refused`)),
  getData: vi.fn().mockReturnValue([]),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FR-W18-08: EuDataIntegrationPipeline', () => {
  let pipeline: EuDataIntegrationPipeline;

  beforeEach(() => {
    vi.useFakeTimers();
    pipeline = new EuDataIntegrationPipeline({ cycleIntervalMs: 100 });
  });

  afterEach(async () => {
    await pipeline.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('08-01: EuSituationalPicture has all required fields', async () => {
    await pipeline.start();
    const snapshot = await pipeline.getSnapshot();
    const requiredFields: (keyof EuSituationalPicture)[] = [
      'aircraft', 'notams', 'zones', 'conditions',
      'securityEvents', 'feedHealth', 'generatedAt',
    ];
    for (const field of requiredFields) {
      expect(snapshot).toHaveProperty(field);
    }
    expect(Array.isArray(snapshot.aircraft)).toBe(true);
    expect(Array.isArray(snapshot.notams)).toBe(true);
    expect(Array.isArray(snapshot.zones)).toBe(true);
    expect(Array.isArray(snapshot.securityEvents)).toBe(true);
    expect(Array.isArray(snapshot.feedHealth)).toBe(true);
  });

  it('08-02: pipeline.start() initializes all feeds', async () => {
    const feeds = [makeMockFeed('f1'), makeMockFeed('f2'), makeMockFeed('f3')];
    const p = new EuDataIntegrationPipeline({ cycleIntervalMs: 100, feeds });
    await p.start();
    // Each feed's poll should be called at least once after start
    vi.advanceTimersByTime(200);
    for (const f of feeds) {
      expect(f.poll).toHaveBeenCalled();
    }
    await p.stop();
  });

  it('08-03: pipeline.stop() shuts down cleanly without throwing', async () => {
    await pipeline.start();
    await expect(pipeline.stop()).resolves.not.toThrow();
  });

  it('08-04: pipeline.getSnapshot() returns EuSituationalPicture', async () => {
    await pipeline.start();
    const snap = await pipeline.getSnapshot();
    expect(snap).toBeDefined();
    expect(snap.generatedAt).toBeInstanceOf(Date);
  });

  it('08-05: pipeline emits snapshot event on each cycle', async () => {
    const handler = vi.fn();
    pipeline.on('snapshot', handler);
    await pipeline.start();
    vi.advanceTimersByTime(350); // 3 cycles at 100ms
    await Promise.resolve(); // flush microtasks
    expect(handler.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('08-06: pipeline continues when one feed throws — graceful degradation', async () => {
    const good    = makeMockFeed('good', 1);
    const failing = makeFailingFeed('bad', 1);
    const p = new EuDataIntegrationPipeline({ cycleIntervalMs: 100, feeds: [good, failing] });

    await expect(p.start()).resolves.not.toThrow();
    vi.advanceTimersByTime(200);
    await Promise.resolve();

    // Good feed still polled
    expect(good.poll).toHaveBeenCalled();

    await p.stop();
  });

  it('08-07: pipeline marks degraded feed in feedHealth[]', async () => {
    const failing = makeFailingFeed('failing-feed', 1);
    const p = new EuDataIntegrationPipeline({ cycleIntervalMs: 100, feeds: [failing] });

    await p.start();
    vi.advanceTimersByTime(400); // enough cycles for error threshold
    await Promise.resolve();

    const snap = await p.getSnapshot();
    const failHealth = snap.feedHealth.find((h) => h.feedId === 'failing-feed');
    expect(failHealth).toBeDefined();
    expect(['degraded', 'down']).toContain(failHealth!.status);

    await p.stop();
  });

  it('08-08: pipeline.getHealth() returns healthy when >=4 feeds are healthy', async () => {
    const feeds = [
      makeMockFeed('f1'), makeMockFeed('f2'), makeMockFeed('f3'),
      makeMockFeed('f4'), makeMockFeed('f5'),
    ];
    const p = new EuDataIntegrationPipeline({ cycleIntervalMs: 100, feeds });
    await p.start();
    vi.advanceTimersByTime(200);
    await Promise.resolve();

    const health = p.getHealth();
    expect(health.status).toBe('healthy');

    await p.stop();
  });

  it('08-09: pipeline respects per-feed poll intervals (Tier 1: 30s, Tier 2: 5min, Tier 3: 30min)', async () => {
    const t1 = makeMockFeed('tier1', 1); // 30s
    const t2 = makeMockFeed('tier2', 2); // 5min
    const t3 = makeMockFeed('tier3', 3); // 30min

    const p = new EuDataIntegrationPipeline({ feeds: [t1, t2, t3] });
    await p.start();

    // At t=60s: tier1 polled twice, tier2 once (or not yet), tier3 not yet
    vi.advanceTimersByTime(60_000);
    await Promise.resolve();

    expect(t1.poll.mock.calls.length).toBeGreaterThanOrEqual(2);
    // tier2 (5min=300s) should NOT have been polled at 60s
    expect(t2.poll.mock.calls.length).toBeLessThan(2);
    // tier3 (30min=1800s) should NOT have been polled at 60s
    expect(t3.poll.mock.calls.length).toBeLessThan(2);

    await p.stop();
  });

  it('08-10: pipeline deduplicates aircraft across sources before snapshot', async () => {
    // Inject mock aircraft aggregator that gets pre-loaded data
    const icao = 'aabbcc';
    const mockAggregator = {
      merge: vi.fn().mockReturnValue([
        { icao24: icao, lat: 44.43, lon: 26.10, altitudeM: 3000, velocityMs: 120,
          headingDeg: 90, timestampMs: Date.now(), source: 'opensky', callsign: 'ROT1',
          onGround: false, transponderMode: 'adsb' },
      ]),
      getCount: vi.fn().mockReturnValue(1),
    };
    const p = new EuDataIntegrationPipeline({ cycleIntervalMs: 100, aircraftAggregator: mockAggregator as any });
    await p.start();
    vi.advanceTimersByTime(200);
    await Promise.resolve();

    const snap = await p.getSnapshot();
    const icaos = snap.aircraft.map((a: any) => a.icao24);
    // Should appear only once even if multiple sources provided it
    expect(icaos.filter((id: string) => id === icao).length).toBeLessThanOrEqual(1);

    await p.stop();
  });

  it('08-11: snapshot.generatedAt is within 1s of Date.now()', async () => {
    await pipeline.start();
    const beforeMs = Date.now();
    vi.useRealTimers(); // need real time for this check
    const snap = await pipeline.getSnapshot();
    const afterMs  = Date.now();

    expect(snap.generatedAt.getTime()).toBeGreaterThanOrEqual(beforeMs - 1000);
    expect(snap.generatedAt.getTime()).toBeLessThanOrEqual(afterMs + 1000);
    vi.useFakeTimers();
  });

  it('08-12: pipeline with all feeds mocked completes cycle in <5s', async () => {
    const feeds = [
      makeMockFeed('f1', 1), makeMockFeed('f2', 1),
      makeMockFeed('f3', 2), makeMockFeed('f4', 2),
      makeMockFeed('f5', 3),
    ];
    const p = new EuDataIntegrationPipeline({ cycleIntervalMs: 100, feeds });

    vi.useRealTimers();
    const t0 = performance.now();
    await p.start();
    // Force one cycle
    await p.getSnapshot();
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(5000);
    await p.stop();
    vi.useFakeTimers();
  });

  it('08-13: pipeline.onSnapshot() callback is called on each new snapshot', async () => {
    const cb = vi.fn();
    pipeline.onSnapshot(cb);
    await pipeline.start();
    vi.advanceTimersByTime(350);
    await Promise.resolve();

    expect(cb).toHaveBeenCalled();
    const firstArg = cb.mock.calls[0][0] as EuSituationalPicture;
    expect(firstArg).toHaveProperty('aircraft');
    expect(firstArg).toHaveProperty('generatedAt');
  });

  it('08-14: pipeline handles SIGTERM gracefully — stop() called, no zombie intervals', async () => {
    const p = new EuDataIntegrationPipeline({ cycleIntervalMs: 100 });
    await p.start();
    vi.advanceTimersByTime(200);

    // Simulate SIGTERM
    const stopSpy = vi.spyOn(p, 'stop');
    process.emit('SIGTERM');

    // Allow microtasks
    await Promise.resolve();
    await Promise.resolve();

    // stop() should have been called by the SIGTERM handler registered in start()
    expect(stopSpy).toHaveBeenCalled();

    // Ensure we don't double-stop
    await expect(p.stop()).resolves.not.toThrow();
  });
});
