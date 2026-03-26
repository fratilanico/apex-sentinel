// APEX-SENTINEL — W9 ThreatContextEnricher Tests
// FR-W9-07 | tests/detection/FR-W9-07-threat-context-enricher.test.ts
// TDD RED phase — src/detection/threat-context-enricher does not exist yet

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThreatContextEnricher, type EnrichedDetection } from '../../src/detection/threat-context-enricher.js';
import { type DetectionEvent } from '../../src/detection/detection-engine.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeDetectionEvent(overrides: Partial<DetectionEvent> = {}): DetectionEvent {
  return {
    id: 'det-001',
    droneType: 'Shahed-131',
    confidence: 0.91,
    nodeId: 'node-alpha',
    detectedAt: new Date().toISOString(),
    lat: 48.2,
    lon: 25.3,
    altMeters: 180,
    ...overrides,
  };
}

function makeNatsMock() {
  const subscribers: Map<string, Array<(msg: unknown) => void>> = new Map();
  return {
    publish: vi.fn(),
    subscribe: vi.fn((subject: string, handler: (msg: unknown) => void) => {
      if (!subscribers.has(subject)) subscribers.set(subject, []);
      subscribers.get(subject)!.push(handler);
    }),
    _trigger: (subject: string, msg: unknown) => {
      const handlers = subscribers.get(subject) ?? [];
      handlers.forEach(h => h(msg));
    },
    _subscribers: subscribers,
  };
}

function makeFeedBrokerMock() {
  return {
    getFeedSnapshot: vi.fn().mockResolvedValue({
      adsb: [],
      weather: { visibilityMeters: 5000, windSpeedMps: 3 },
      alerts: [],
      osint: [],
      remoteId: [],
    }),
  };
}

// ── Describe block ─────────────────────────────────────────────────────────

describe('FR-W9-07: ThreatContextEnricher', () => {

  let enricher: ThreatContextEnricher;
  let nats: ReturnType<typeof makeNatsMock>;
  let feedBroker: ReturnType<typeof makeFeedBrokerMock>;
  let detection: DetectionEvent;

  beforeEach(() => {
    nats = makeNatsMock();
    feedBroker = makeFeedBrokerMock();
    enricher = new ThreatContextEnricher(nats, feedBroker);
    detection = makeDetectionEvent();
  });

  // ── Unit tests ──────────────────────────────────────────────────────────

  it('FR-W9-07-U01: Constructor accepts nats client and feedBroker', () => {
    expect(enricher).toBeInstanceOf(ThreatContextEnricher);
    expect(enricher).toBeDefined();
  });

  it('FR-W9-07-U02: start() subscribes to detection.* NATS subject', async () => {
    await enricher.start();
    expect(nats.subscribe).toHaveBeenCalledWith(
      expect.stringMatching(/^detection\.\*/),
      expect.any(Function)
    );
  });

  it('FR-W9-07-U03: Enriches detection with context within 200ms', async () => {
    const start = Date.now();
    const result = await enricher.enrichDetection(detection);
    const elapsed = Date.now() - start;
    expect(result).toBeDefined();
    expect(elapsed).toBeLessThan(200);
  });

  it('FR-W9-07-U04: EnrichedDetection has: originalDetection, context, contextScore, enrichedAt', async () => {
    const result: EnrichedDetection = await enricher.enrichDetection(detection);
    expect(result).toHaveProperty('originalDetection');
    expect(result).toHaveProperty('context');
    expect(result).toHaveProperty('contextScore');
    expect(result).toHaveProperty('enrichedAt');
  });

  it('FR-W9-07-U05: context has: nearestAircraftKm, activeAlertLevel, weatherSnapshot, osintEventCount, remoteIdBeaconsNearby', async () => {
    const result: EnrichedDetection = await enricher.enrichDetection(detection);
    const ctx = result.context;
    expect(ctx).toHaveProperty('nearestAircraftKm');
    expect(ctx).toHaveProperty('activeAlertLevel');
    expect(ctx).toHaveProperty('weatherSnapshot');
    expect(ctx).toHaveProperty('osintEventCount');
    expect(ctx).toHaveProperty('remoteIdBeaconsNearby');
  });

  it('FR-W9-07-U06: contextScore 0-100 computed from weighted formula', async () => {
    const result: EnrichedDetection = await enricher.enrichDetection(detection);
    expect(result.contextScore).toBeGreaterThanOrEqual(0);
    expect(result.contextScore).toBeLessThanOrEqual(100);
  });

  it('FR-W9-07-U07: Active CRITICAL alert → contextScore +40 (alert weight)', async () => {
    feedBroker.getFeedSnapshot.mockResolvedValue({
      adsb: [],
      weather: { visibilityMeters: 5000, windSpeedMps: 3 },
      alerts: [{ level: 'CRITICAL', areaKm: 5, activeSince: new Date().toISOString() }],
      osint: [],
      remoteId: [],
    });
    const result = await enricher.enrichDetection(detection);
    // Baseline is 0 with no other signals, CRITICAL adds 40
    expect(result.contextScore).toBeGreaterThanOrEqual(40);
  });

  it('FR-W9-07-U08: ADS-B aircraft within 2km with squawk 7700 → contextScore +30', async () => {
    feedBroker.getFeedSnapshot.mockResolvedValue({
      adsb: [{ icao: 'ABC', lat: 48.2, lon: 25.3, squawk: '7700', altFt: 600 }], // ~0km
      weather: { visibilityMeters: 5000, windSpeedMps: 3 },
      alerts: [],
      osint: [],
      remoteId: [],
    });
    const result = await enricher.enrichDetection(detection);
    expect(result.contextScore).toBeGreaterThanOrEqual(30);
  });

  it('FR-W9-07-U09: Weather visibility <500m → contextScore +5 (degraded sensors noted)', async () => {
    feedBroker.getFeedSnapshot.mockResolvedValue({
      adsb: [],
      weather: { visibilityMeters: 400, windSpeedMps: 3 },
      alerts: [],
      osint: [],
      remoteId: [],
    });
    const result = await enricher.enrichDetection(detection);
    expect(result.contextScore).toBeGreaterThanOrEqual(5);
    expect(result.context.weatherSnapshot?.visibilityMeters).toBe(400);
  });

  it('FR-W9-07-U10: OSINT events >3 in area in 15min → contextScore +10', async () => {
    const now = new Date();
    feedBroker.getFeedSnapshot.mockResolvedValue({
      adsb: [],
      weather: { visibilityMeters: 5000, windSpeedMps: 3 },
      alerts: [],
      osint: [
        { lat: 48.2, lon: 25.3, ts: now.toISOString() },
        { lat: 48.21, lon: 25.31, ts: now.toISOString() },
        { lat: 48.19, lon: 25.29, ts: now.toISOString() },
        { lat: 48.2, lon: 25.32, ts: now.toISOString() },
      ],
      remoteId: [],
    });
    const result = await enricher.enrichDetection(detection);
    expect(result.contextScore).toBeGreaterThanOrEqual(10);
    expect(result.context.osintEventCount).toBeGreaterThan(3);
  });

  it('FR-W9-07-U11: RemoteId beacon within 500m → contextScore +20', async () => {
    feedBroker.getFeedSnapshot.mockResolvedValue({
      adsb: [],
      weather: { visibilityMeters: 5000, windSpeedMps: 3 },
      alerts: [],
      osint: [],
      remoteId: [{ lat: 48.2, lon: 25.3, beaconId: 'rid-001', distanceM: 300 }], // within 500m
    });
    const result = await enricher.enrichDetection(detection);
    expect(result.contextScore).toBeGreaterThanOrEqual(20);
    expect(result.context.remoteIdBeaconsNearby).toBeGreaterThanOrEqual(1);
  });

  it('FR-W9-07-U12: No feed data available → contextScore 0, context fields null/empty', async () => {
    feedBroker.getFeedSnapshot.mockResolvedValue({
      adsb: [],
      weather: null,
      alerts: [],
      osint: [],
      remoteId: [],
    });
    const result = await enricher.enrichDetection(detection);
    expect(result.contextScore).toBe(0);
    expect(result.context.weatherSnapshot).toBeNull();
    expect(result.context.nearestAircraftKm).toBeNull();
    expect(result.context.activeAlertLevel).toBeNull();
    expect(result.context.osintEventCount).toBe(0);
    expect(result.context.remoteIdBeaconsNearby).toBe(0);
  });

  it('FR-W9-07-U13: enrichDetection() completes within 200ms (uses Promise.race with 200ms timeout)', async () => {
    // Slow feed snapshot — must be raced against 200ms timeout
    feedBroker.getFeedSnapshot.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ adsb: [], weather: null, alerts: [], osint: [], remoteId: [] }), 50))
    );
    const t0 = Date.now();
    const result = await enricher.enrichDetection(detection);
    expect(Date.now() - t0).toBeLessThan(200);
    expect(result).toBeDefined();
  });

  it('FR-W9-07-U14: Detection not enriched (timeout) published as-is with contextScore: -1', async () => {
    // Feed snapshot exceeds 200ms
    feedBroker.getFeedSnapshot.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({}), 300))
    );
    const result = await enricher.enrichDetection(detection);
    expect(result.contextScore).toBe(-1);
    expect(result.originalDetection).toEqual(detection);
  }, 1000);

  it('FR-W9-07-U15: Publishes to detection.enriched NATS subject', async () => {
    await enricher.start();
    await enricher.enrichDetection(detection);
    expect(nats.publish).toHaveBeenCalledWith(
      'detection.enriched',
      expect.objectContaining({ originalDetection: expect.objectContaining({ id: detection.id }) })
    );
  });

  it('FR-W9-07-U16: Multiple concurrent enrichments processed independently (no state leakage)', async () => {
    const detections = [
      makeDetectionEvent({ id: 'det-A', droneType: 'Shahed-131' }),
      makeDetectionEvent({ id: 'det-B', droneType: 'Gerbera' }),
      makeDetectionEvent({ id: 'det-C', droneType: 'Shahed-238' }),
    ];

    const results = await Promise.all(detections.map(d => enricher.enrichDetection(d)));

    expect(results).toHaveLength(3);
    expect(results[0].originalDetection.id).toBe('det-A');
    expect(results[1].originalDetection.id).toBe('det-B');
    expect(results[2].originalDetection.id).toBe('det-C');
    // Scores may differ but each result is independent
    const ids = results.map(r => r.originalDetection.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('FR-W9-07-U17: enrichDetection() idempotent: same detectionId returns same result', async () => {
    const result1 = await enricher.enrichDetection(detection);
    const result2 = await enricher.enrichDetection(detection);
    expect(result1.contextScore).toBe(result2.contextScore);
    expect(result1.originalDetection.id).toBe(result2.originalDetection.id);
  });

  it('FR-W9-07-U18: ThreatContextEnricher emits "enriched" event with EnrichedDetection', async () => {
    const handler = vi.fn();
    enricher.on('enriched', handler);
    await enricher.enrichDetection(detection);
    expect(handler).toHaveBeenCalledTimes(1);
    const payload: EnrichedDetection = handler.mock.calls[0][0];
    expect(payload).toHaveProperty('originalDetection');
    expect(payload).toHaveProperty('contextScore');
    expect(payload).toHaveProperty('enrichedAt');
  });
});
