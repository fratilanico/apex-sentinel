// APEX-SENTINEL — W9 Dashboard Live Feed Wiring Tests
// FR-W9-08 | tests/feeds/FR-W9-08-dashboard-live-feeds.test.ts
// Covers LiveFeedAdapter SSE routing, privacy invariants, and multi-client fanout.
// TDD-RED: all imports reference non-existent modules — tests MUST fail initially.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LiveFeedAdapter } from '../../src/ui/demo-dashboard/live-feed-adapter.js';
import { DataFeedBroker } from '../../src/feeds/data-feed-broker.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const makeBroker = () => ({
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  removeAllListeners: vi.fn(),
});

type BrokerMock = ReturnType<typeof makeBroker>;

/** Minimal writable SSE stream mock — collects written chunks. */
const makeSseStream = () => {
  const chunks: string[] = [];
  return {
    write: vi.fn((chunk: string) => { chunks.push(chunk); }),
    end: vi.fn(),
    chunks,
  };
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FUSED_ADSB = {
  feedType: 'adsb',
  payload: {
    aircraftCount: 4,
    anomalyFlags: ['squawk_7700'],
  },
  ts: Date.now(),
};

const FUSED_WEATHER = {
  feedType: 'weather',
  payload: {
    wind: { speedKts: 12, dirDeg: 270 },
    visibilityKm: 8,
  },
  ts: Date.now(),
};

const FUSED_ALERT = {
  feedType: 'alert',
  payload: {
    id: 'ALT-001',
    severity: 'critical',
    message: 'Unidentified UAV in restricted zone',
  },
  ts: Date.now(),
};

const FUSED_OSINT = {
  feedType: 'osint',
  payload: {
    sourceUrl: 'https://example.com/report',
    summary: 'Social media reports of drone activity',
  },
  ts: Date.now(),
};

const FUSED_REMOTE_ID = {
  feedType: 'remote_id',
  payload: {
    operatorId: 'OP-RO-00001',
    uasId: 'UAS-XYZ-99',
  },
  ts: Date.now(),
};

const FUSED_UNKNOWN = {
  feedType: 'unknown_source',
  payload: { raw: 'some-data' },
  ts: Date.now(),
};

// ---------------------------------------------------------------------------

describe('FR-W9-08: Dashboard Live Feed Wiring', () => {

  let broker: BrokerMock;
  let adapter: LiveFeedAdapter;
  let stream: ReturnType<typeof makeSseStream>;

  beforeEach(() => {
    broker = makeBroker();
    stream = makeSseStream();
    adapter = new LiveFeedAdapter(broker as unknown as DataFeedBroker);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // ── Constructor / wiring ──────────────────────────────────────────────────

  it('FR-W9-08-U01: GIVEN a DataFeedBroker instance, WHEN LiveFeedAdapter constructed, THEN adapter stores broker reference without throwing', () => {
    expect(() => new LiveFeedAdapter(broker as unknown as DataFeedBroker)).not.toThrow();
    expect(adapter.getBroker()).toBe(broker);
  });

  it('FR-W9-08-U02: GIVEN adapter constructed, WHEN start() called with SSE stream, THEN adapter registers listener on broker "feed.fused" event', () => {
    adapter.start(stream);
    expect(broker.on).toHaveBeenCalledWith('feed.fused', expect.any(Function));
  });

  // ── Feed-type → SSE event-type routing ───────────────────────────────────

  it('FR-W9-08-U03: GIVEN ADS-B fused message, WHEN broker emits "feed.fused" with feedType=adsb, THEN SSE event type is "aircraft"', () => {
    adapter.start(stream);
    const handler = broker.on.mock.calls.find(([evt]: [string]) => evt === 'feed.fused')?.[1];
    handler(FUSED_ADSB);
    const written = stream.chunks.join('');
    expect(written).toContain('event: aircraft');
  });

  it('FR-W9-08-U04: GIVEN weather fused message, WHEN broker emits "feed.fused" with feedType=weather, THEN SSE event type is "weather"', () => {
    adapter.start(stream);
    const handler = broker.on.mock.calls.find(([evt]: [string]) => evt === 'feed.fused')?.[1];
    handler(FUSED_WEATHER);
    const written = stream.chunks.join('');
    expect(written).toContain('event: weather');
  });

  it('FR-W9-08-U05: GIVEN alert fused message, WHEN broker emits "feed.fused" with feedType=alert, THEN SSE event type is "alert"', () => {
    adapter.start(stream);
    const handler = broker.on.mock.calls.find(([evt]: [string]) => evt === 'feed.fused')?.[1];
    handler(FUSED_ALERT);
    const written = stream.chunks.join('');
    expect(written).toContain('event: alert');
  });

  it('FR-W9-08-U06: GIVEN OSINT fused message, WHEN broker emits "feed.fused" with feedType=osint, THEN SSE event type is "osint"', () => {
    adapter.start(stream);
    const handler = broker.on.mock.calls.find(([evt]: [string]) => evt === 'feed.fused')?.[1];
    handler(FUSED_OSINT);
    const written = stream.chunks.join('');
    expect(written).toContain('event: osint');
  });

  it('FR-W9-08-U07: GIVEN Remote ID fused message, WHEN broker emits "feed.fused" with feedType=remote_id, THEN SSE event type is "remote_id"', () => {
    adapter.start(stream);
    const handler = broker.on.mock.calls.find(([evt]: [string]) => evt === 'feed.fused')?.[1];
    handler(FUSED_REMOTE_ID);
    const written = stream.chunks.join('');
    expect(written).toContain('event: remote_id');
  });

  // ── Heartbeat ─────────────────────────────────────────────────────────────

  it('FR-W9-08-U08: GIVEN adapter started and no feed data arrives, WHEN 5 seconds elapse, THEN a heartbeat SSE event is written to the stream', () => {
    vi.useFakeTimers();
    adapter.start(stream);
    vi.advanceTimersByTime(5_000);
    const written = stream.chunks.join('');
    expect(written).toContain('event: heartbeat');
  });

  // ── SSE event structure ───────────────────────────────────────────────────

  it('FR-W9-08-U09: GIVEN any fused event routed through adapter, WHEN SSE chunk written, THEN chunk contains: event, data (valid JSON), id, retry fields', () => {
    adapter.start(stream);
    const handler = broker.on.mock.calls.find(([evt]: [string]) => evt === 'feed.fused')?.[1];
    handler(FUSED_ALERT);
    const written = stream.chunks.join('');
    expect(written).toMatch(/event: \w+/);
    expect(written).toMatch(/data: \{.*\}/);
    expect(written).toMatch(/id: \w+/);
    expect(written).toMatch(/retry: \d+/);
    // data must parse as JSON
    const dataLine = written.split('\n').find(l => l.startsWith('data: '));
    expect(() => JSON.parse(dataLine!.replace('data: ', ''))).not.toThrow();
  });

  // ── Snapshot visibility ───────────────────────────────────────────────────

  it('FR-W9-08-U10: GIVEN ADS-B fused message with aircraftCount, WHEN SSE event emitted, THEN data payload includes aircraftCount as a number', () => {
    adapter.start(stream);
    const handler = broker.on.mock.calls.find(([evt]: [string]) => evt === 'feed.fused')?.[1];
    handler(FUSED_ADSB);
    const dataLine = stream.chunks.join('').split('\n').find(l => l.startsWith('data: '));
    const parsed = JSON.parse(dataLine!.replace('data: ', ''));
    expect(typeof parsed.aircraftCount).toBe('number');
  });

  it('FR-W9-08-U11: GIVEN alert fused message, WHEN SSE event emitted, THEN data payload includes activeAlertCount as a number', () => {
    adapter.start(stream);
    const handler = broker.on.mock.calls.find(([evt]: [string]) => evt === 'feed.fused')?.[1];
    handler(FUSED_ALERT);
    const dataLine = stream.chunks.join('').split('\n').find(l => l.startsWith('data: '));
    const parsed = JSON.parse(dataLine!.replace('data: ', ''));
    expect(typeof parsed.activeAlertCount).toBe('number');
  });

  it('FR-W9-08-U12: GIVEN weather fused message, WHEN SSE event emitted, THEN data payload includes wind and visibilityKm fields', () => {
    adapter.start(stream);
    const handler = broker.on.mock.calls.find(([evt]: [string]) => evt === 'feed.fused')?.[1];
    handler(FUSED_WEATHER);
    const dataLine = stream.chunks.join('').split('\n').find(l => l.startsWith('data: '));
    const parsed = JSON.parse(dataLine!.replace('data: ', ''));
    expect(parsed).toHaveProperty('wind');
    expect(parsed).toHaveProperty('visibilityKm');
  });

  // ── Privacy invariant ─────────────────────────────────────────────────────

  it('FR-W9-08-U13: GIVEN ADS-B message containing raw aircraft positions (lat/lon), WHEN SSE event emitted, THEN data payload must NOT include lat, lon, or icao24 fields', () => {
    const adsbWithPositions = {
      ...FUSED_ADSB,
      payload: {
        aircraftCount: 2,
        anomalyFlags: [],
        // these raw fields must be stripped
        aircraft: [
          { icao24: 'AABBCC', lat: 45.1, lon: 26.5, alt_baro: 8000 },
        ],
      },
    };
    adapter.start(stream);
    const handler = broker.on.mock.calls.find(([evt]: [string]) => evt === 'feed.fused')?.[1];
    handler(adsbWithPositions);
    const written = stream.chunks.join('');
    // The full written output must not leak PII position data
    expect(written).not.toMatch(/"lat"\s*:/);
    expect(written).not.toMatch(/"lon"\s*:/);
    expect(written).not.toMatch(/"icao24"\s*:/);
  });

  // ── Unknown feed type ─────────────────────────────────────────────────────

  it('FR-W9-08-U14: GIVEN fused message with unrecognised feedType, WHEN broker emits it, THEN adapter logs a warning and does NOT write an SSE event chunk', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    adapter.start(stream);
    const handler = broker.on.mock.calls.find(([evt]: [string]) => evt === 'feed.fused')?.[1];
    handler(FUSED_UNKNOWN);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unknown_source'));
    expect(stream.write).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // ── Lifecycle / teardown ──────────────────────────────────────────────────

  it('FR-W9-08-U15: GIVEN adapter started, WHEN stop() called, THEN broker.off is called to remove the "feed.fused" listener', () => {
    adapter.start(stream);
    adapter.stop();
    expect(broker.off).toHaveBeenCalledWith('feed.fused', expect.any(Function));
  });

  // ── Multi-client fanout ───────────────────────────────────────────────────

  it('FR-W9-08-U16: GIVEN two simultaneous SSE connections, WHEN a fused event arrives, THEN both streams receive the SSE chunk (EventEmitter fanout)', () => {
    const stream2 = makeSseStream();
    // Register two SSE streams on the same adapter
    adapter.addStream(stream);
    adapter.addStream(stream2);
    adapter.start(stream); // start() should wire broker once, fanout to all registered streams

    const handler = broker.on.mock.calls.find(([evt]: [string]) => evt === 'feed.fused')?.[1];
    handler(FUSED_WEATHER);

    expect(stream.write).toHaveBeenCalled();
    expect(stream2.write).toHaveBeenCalled();
  });
});
