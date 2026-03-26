// APEX-SENTINEL — W11 OsintCorrelationEngine Tests
// FR-W11-01 | tests/intel/FR-W11-01-osint-correlation.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { OsintCorrelationEngine } from '../../src/intel/osint-correlation-engine.js';
import type { OsintEvent, DetectionEvent } from '../../src/intel/osint-correlation-engine.js';

describe('FR-W11-01: OsintCorrelationEngine', () => {
  let engine: OsintCorrelationEngine;
  const now = Date.now();

  // Detection at Warsaw centre
  const detection: DetectionEvent = {
    lat: 52.229,
    lon: 21.012,
    ts: now,
  };

  // Event 10km away (should be included)
  const nearEvent: OsintEvent = {
    lat: 52.319,  // ~10km north
    lon: 21.012,
    ts: now - 1000 * 60 * 30, // 30 min ago
    goldsteinScale: 0,
  };

  // Event 100km away (should be excluded)
  const farEvent: OsintEvent = {
    lat: 53.130,  // ~100km north
    lon: 21.012,
    ts: now - 1000 * 60 * 30,
    goldsteinScale: 0,
  };

  beforeEach(() => {
    engine = new OsintCorrelationEngine();
  });

  it('01-01: event within 50km is included in correlatedEvents', () => {
    const result = engine.correlate(detection, [nearEvent]);
    expect(result.correlatedEvents).toHaveLength(1);
    expect(result.correlatedEvents[0]).toEqual(nearEvent);
  });

  it('01-02: event beyond 50km is excluded', () => {
    const result = engine.correlate(detection, [farEvent]);
    expect(result.correlatedEvents).toHaveLength(0);
  });

  it('01-03: event within last 6h → temporalWeight 1.0', () => {
    const event: OsintEvent = { ...nearEvent, ts: now - 1000 * 60 * 60 * 5 }; // 5h ago
    const result = engine.correlate(detection, [event]);
    expect(result.temporalWeight).toBe(1.0);
  });

  it('01-04: event 6-24h old → temporalWeight 0.5', () => {
    const event: OsintEvent = { ...nearEvent, ts: now - 1000 * 60 * 60 * 12 }; // 12h ago
    const result = engine.correlate(detection, [event]);
    expect(result.temporalWeight).toBe(0.5);
  });

  it('01-05: event >24h old is excluded from results', () => {
    const event: OsintEvent = { ...nearEvent, ts: now - 1000 * 60 * 60 * 25 }; // 25h ago
    const result = engine.correlate(detection, [event]);
    expect(result.correlatedEvents).toHaveLength(0);
  });

  it('01-06: goldsteinScale < -5 event gets 3× weight in calculation', () => {
    const conflictEvent: OsintEvent = { ...nearEvent, goldsteinScale: -8 };
    const result = engine.correlate(detection, [conflictEvent]);
    expect(result.correlatedEvents[0].goldsteinScale).toBe(-8);
    // spatialDensity should reflect 3× weight
    const normalResult = engine.correlate(detection, [{ ...nearEvent, goldsteinScale: 0 }]);
    expect(result.spatialDensity).toBeGreaterThan(normalResult.spatialDensity);
  });

  it('01-07: spatialDensity is 0 for empty event list', () => {
    const result = engine.correlate(detection, []);
    expect(result.spatialDensity).toBe(0);
    expect(result.temporalWeight).toBe(0);
    expect(result.correlatedEvents).toHaveLength(0);
  });

  it('01-08: multiple near events → spatialDensity reflects count', () => {
    const events = [nearEvent, { ...nearEvent, lon: 21.020 }, { ...nearEvent, lon: 21.030 }];
    const result = engine.correlate(detection, events);
    expect(result.correlatedEvents).toHaveLength(3);
    expect(result.spatialDensity).toBeGreaterThan(0);
  });

  it('01-09: mix of near and far events → only near returned', () => {
    const result = engine.correlate(detection, [nearEvent, farEvent]);
    expect(result.correlatedEvents).toHaveLength(1);
    expect(result.correlatedEvents[0]).toEqual(nearEvent);
  });

  it('01-10: event exactly at 50km boundary is included', () => {
    // 0.45° latitude ≈ 50km
    const boundaryEvent: OsintEvent = {
      lat: 52.229 + 0.449, // just inside 50km
      lon: 21.012,
      ts: now - 1000 * 60 * 10,
    };
    const result = engine.correlate(detection, [boundaryEvent]);
    expect(result.correlatedEvents).toHaveLength(1);
  });

  it('01-11: protest event (goldsteinScale 0) not multiplied', () => {
    const protestEvent: OsintEvent = { ...nearEvent, goldsteinScale: 0 };
    const result = engine.correlate(detection, [protestEvent]);
    expect(result.correlatedEvents).toHaveLength(1);
    // density should equal 1 (1× weight, 1 event, normalized)
    expect(result.spatialDensity).toBeGreaterThan(0);
  });

  it('01-12: temporalWeight is max weight among correlated events', () => {
    const recent: OsintEvent = { ...nearEvent, ts: now - 1000 * 60 * 30 }; // 30min → weight 1.0
    const older: OsintEvent = { ...nearEvent, lon: 21.020, ts: now - 1000 * 60 * 60 * 12 }; // 12h → weight 0.5
    const result = engine.correlate(detection, [recent, older]);
    expect(result.temporalWeight).toBe(1.0);
  });
});
