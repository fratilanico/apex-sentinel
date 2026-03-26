// APEX-SENTINEL — W11 AnomalyCorrelationEngine Tests
// FR-W11-02 | tests/intel/FR-W11-02-anomaly-correlation.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { AnomalyCorrelationEngine } from '../../src/intel/anomaly-correlation-engine.js';
import type { DetectionEvent } from '../../src/intel/anomaly-correlation-engine.js';

describe('FR-W11-02: AnomalyCorrelationEngine', () => {
  let engine: AnomalyCorrelationEngine;
  const now = Date.now();

  beforeEach(() => {
    engine = new AnomalyCorrelationEngine();
  });

  it('02-01: acoustic present + no ADS-B → transponder_off_pattern', () => {
    const events: DetectionEvent[] = [
      {
        lat: 52.0, lon: 21.0, ts: now,
        acousticPresent: true, adsbPresent: false, remoteIdPresent: false,
      },
    ];
    const results = engine.detectAnomalies(events);
    expect(results.some(r => r.anomalyType === 'transponder_off_pattern')).toBe(true);
  });

  it('02-02: remoteID present + no ADS-B → transponder_off_pattern', () => {
    const events: DetectionEvent[] = [
      {
        lat: 52.0, lon: 21.0, ts: now,
        acousticPresent: false, adsbPresent: false, remoteIdPresent: true,
      },
    ];
    const results = engine.detectAnomalies(events);
    expect(results.some(r => r.anomalyType === 'transponder_off_pattern')).toBe(true);
  });

  it('02-03: altitude drop >500ft in <30s → altitude_drop_terminal', () => {
    const events: DetectionEvent[] = [
      { lat: 52.0, lon: 21.0, ts: now - 20000, altFt: 1000 },
      { lat: 52.0, lon: 21.0, ts: now, altFt: 400 }, // dropped 600ft in 20s
    ];
    const results = engine.detectAnomalies(events);
    expect(results.some(r => r.anomalyType === 'altitude_drop_terminal')).toBe(true);
  });

  it('02-04: altitude drop ≤500ft in <30s → no altitude anomaly', () => {
    const events: DetectionEvent[] = [
      { lat: 52.0, lon: 21.0, ts: now - 20000, altFt: 1000 },
      { lat: 52.0, lon: 21.0, ts: now, altFt: 600 }, // dropped 400ft — below threshold
    ];
    const results = engine.detectAnomalies(events);
    expect(results.some(r => r.anomalyType === 'altitude_drop_terminal')).toBe(false);
  });

  it('02-05: altitude drop >500ft but >30s apart → no altitude anomaly', () => {
    const events: DetectionEvent[] = [
      { lat: 52.0, lon: 21.0, ts: now - 60000, altFt: 1000 }, // 60s ago
      { lat: 52.0, lon: 21.0, ts: now, altFt: 400 }, // 600ft drop but over 60s
    ];
    const results = engine.detectAnomalies(events);
    expect(results.some(r => r.anomalyType === 'altitude_drop_terminal')).toBe(false);
  });

  it('02-06: confidence is between 0 and 1', () => {
    const events: DetectionEvent[] = [
      {
        lat: 52.0, lon: 21.0, ts: now,
        acousticPresent: true, adsbPresent: false,
      },
    ];
    const results = engine.detectAnomalies(events);
    for (const r of results) {
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('02-07: correlatedSources lists which signals triggered anomaly', () => {
    const events: DetectionEvent[] = [
      {
        lat: 52.0, lon: 21.0, ts: now,
        acousticPresent: true, remoteIdPresent: true, adsbPresent: false,
      },
    ];
    const results = engine.detectAnomalies(events);
    const anomaly = results.find(r => r.anomalyType === 'transponder_off_pattern');
    expect(anomaly).toBeDefined();
    expect(anomaly!.correlatedSources).toContain('acoustic');
    expect(anomaly!.correlatedSources).toContain('remote_id');
  });

  it('02-08: no anomaly when evidence insufficient (adsb present, no acoustic, no remote_id)', () => {
    const events: DetectionEvent[] = [
      {
        lat: 52.0, lon: 21.0, ts: now,
        acousticPresent: false, adsbPresent: true, remoteIdPresent: false,
      },
    ];
    const results = engine.detectAnomalies(events);
    expect(results.some(r => r.anomalyType === 'transponder_off_pattern')).toBe(false);
  });

  it('02-09: empty events array → empty results', () => {
    const results = engine.detectAnomalies([]);
    expect(results).toHaveLength(0);
  });

  it('02-10: each anomaly result has ts field', () => {
    const events: DetectionEvent[] = [
      {
        lat: 52.0, lon: 21.0, ts: now,
        acousticPresent: true, adsbPresent: false,
      },
    ];
    const results = engine.detectAnomalies(events);
    for (const r of results) {
      expect(typeof r.ts).toBe('number');
    }
  });

  it('02-11: both anomaly types detected in single pass when applicable', () => {
    const events: DetectionEvent[] = [
      {
        lat: 52.0, lon: 21.0, ts: now - 20000,
        altFt: 1200, acousticPresent: true, adsbPresent: false,
      },
      {
        lat: 52.0, lon: 21.0, ts: now,
        altFt: 500, acousticPresent: true, adsbPresent: false,
      },
    ];
    const results = engine.detectAnomalies(events);
    const types = results.map(r => r.anomalyType);
    expect(types).toContain('transponder_off_pattern');
    expect(types).toContain('altitude_drop_terminal');
  });

  it('02-12: anomaly confidence increases when both acoustic and remoteID present', () => {
    const singleSource: DetectionEvent[] = [
      { lat: 52.0, lon: 21.0, ts: now, acousticPresent: true, adsbPresent: false },
    ];
    const dualSource: DetectionEvent[] = [
      { lat: 52.0, lon: 21.0, ts: now, acousticPresent: true, remoteIdPresent: true, adsbPresent: false },
    ];
    const single = engine.detectAnomalies(singleSource).find(r => r.anomalyType === 'transponder_off_pattern');
    const dual = engine.detectAnomalies(dualSource).find(r => r.anomalyType === 'transponder_off_pattern');
    expect(dual!.confidence).toBeGreaterThanOrEqual(single!.confidence);
  });
});
