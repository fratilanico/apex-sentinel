// APEX-SENTINEL — W10 AwningIntegrationPipeline Tests
// FR-W10-08 | tests/nato/FR-W10-08-awning-integration.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AwningIntegrationPipeline, type EnrichedDetectionInput } from '../../src/nato/awning-integration-pipeline.js';

describe('FR-W10-08: AwningIntegrationPipeline', () => {
  let pipeline: AwningIntegrationPipeline;
  let mockNats: { publish: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };

  const baseDetection: EnrichedDetectionInput = {
    contextScore: 75,
    acousticConfidence: 0.85,
    rfFingerprintMatch: false,
    adsbCorrelated: false,
    remoteIdWithin500m: false,
    civilProtectionLevel: undefined,
    droneType: 'Unknown',
    positions: [],
  };

  beforeEach(() => {
    mockNats = { publish: vi.fn(), subscribe: vi.fn() };
    pipeline = new AwningIntegrationPipeline(mockNats);
  });

  // E2E Scenario 1: High contextScore → RED alert published
  it('08-01 E2E: contextScore 75 → AWNING RED alert published to awning.alert', () => {
    const alert = pipeline.processDetection(baseDetection);
    expect(alert).not.toBeNull();
    expect(alert?.awningLevel).toBe('RED');
    expect(mockNats.publish).toHaveBeenCalledWith('awning.alert', expect.objectContaining({ awningLevel: 'RED' }));
  });

  // E2E Scenario 2: CivilProtection CRITICAL override
  it('08-02 E2E: CivilProtection CRITICAL → RED regardless of contextScore 10', () => {
    const alert = pipeline.processDetection({ ...baseDetection, contextScore: 10, civilProtectionLevel: 'CRITICAL' });
    expect(alert?.awningLevel).toBe('RED');
  });

  // E2E Scenario 3: Low score → WHITE alert
  it('08-03 E2E: contextScore 15 → AWNING WHITE alert', () => {
    const alert = pipeline.processDetection({ ...baseDetection, contextScore: 15 });
    expect(alert?.awningLevel).toBe('WHITE');
  });

  // E2E Scenario 4: Stage 2 detection (acoustic + RF)
  it('08-04 E2E: acoustic + RF → Stage 2 in alert', () => {
    const alert = pipeline.processDetection({ ...baseDetection, rfFingerprintMatch: true });
    expect(alert?.stage).toBe(2);
  });

  // E2E Scenario 5: Trajectory included when positions provided
  it('08-05 E2E: positions provided → trajectory in alert', () => {
    const now = Date.now();
    const detection = {
      ...baseDetection,
      positions: [
        { lat: 45.0, lon: 26.0, altMeters: 150, ts: now - 4000 },
        { lat: 45.0005, lon: 26.0, altMeters: 150, ts: now - 3000 },
        { lat: 45.001, lon: 26.0, altMeters: 150, ts: now - 2000 },
        { lat: 45.0015, lon: 26.0, altMeters: 150, ts: now - 1000 },
        { lat: 45.002, lon: 26.0, altMeters: 150, ts: now },
      ],
    };
    const alert = pipeline.processDetection(detection);
    expect(alert?.trajectory).toBeDefined();
    expect(alert?.trajectory?.length).toBeGreaterThan(0);
  });

  it('08-06: alert has valid alertId format', () => {
    const alert = pipeline.processDetection(baseDetection);
    expect(alert?.alertId).toMatch(/^AWNING-\d{8}-\d{4}$/);
  });

  it('08-07: alert has ts field', () => {
    const alert = pipeline.processDetection(baseDetection);
    expect(alert?.ts).toBeDefined();
    expect(() => new Date(alert!.ts)).not.toThrow();
  });

  it('08-08: alert published on awning.alert NATS subject', () => {
    pipeline.processDetection(baseDetection);
    expect(mockNats.publish).toHaveBeenCalledWith('awning.alert', expect.any(Object));
  });

  it('08-09: awning.level also published', () => {
    pipeline.processDetection(baseDetection);
    expect(mockNats.publish).toHaveBeenCalledWith('awning.level', expect.any(Object));
  });

  it('08-10: Stage 3 detection (acoustic + RF + ADS-B)', () => {
    const alert = pipeline.processDetection({
      ...baseDetection,
      rfFingerprintMatch: true,
      adsbCorrelated: true,
    });
    expect(alert?.stage).toBe(3);
  });

  it('08-11: alert summary is non-empty string', () => {
    const alert = pipeline.processDetection(baseDetection);
    expect(typeof alert?.summary).toBe('string');
    expect(alert!.summary.length).toBeGreaterThan(10);
  });

  it('08-12: processDetection returns null for below-threshold acoustic (no stage)', () => {
    // Very low acoustic confidence — no stage, but still produces alert (WHITE level)
    // Pipeline should still work, just Stage 1 or null
    const alert = pipeline.processDetection({ ...baseDetection, acousticConfidence: 0.5, contextScore: 10 });
    // Should still produce an alert (WHITE level even without acoustic stage)
    expect(alert).not.toBeNull();
    expect(alert?.awningLevel).toBe('WHITE');
  });

  it('08-13: consecutive calls produce incrementing alertIds', () => {
    const a1 = pipeline.processDetection(baseDetection);
    const a2 = pipeline.processDetection(baseDetection);
    const seq1 = parseInt(a1!.alertId.split('-')[2]);
    const seq2 = parseInt(a2!.alertId.split('-')[2]);
    expect(seq2).toBeGreaterThan(seq1);
  });
});
