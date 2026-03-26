// APEX-SENTINEL — W10 StageClassifier Tests
// FR-W10-02 | tests/nato/FR-W10-02-stage-classifier.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { StageClassifier, type DetectionInput } from '../../src/nato/stage-classifier.js';

describe('FR-W10-02: StageClassifier', () => {
  let classifier: StageClassifier;

  beforeEach(() => {
    classifier = new StageClassifier();
  });

  const baseDetection: DetectionInput = {
    acousticConfidence: 0.75,
    rfFingerprintMatch: false,
    adsbCorrelated: false,
    remoteIdWithin500m: false,
  };

  it('02-01: acoustic ≥ 0.75, no RF → Stage 1', () => {
    const result = classifier.classify({ ...baseDetection, acousticConfidence: 0.75 });
    expect(result.stage).toBe(1);
  });

  it('02-02: acoustic 0.9, no RF → Stage 1', () => {
    const result = classifier.classify({ ...baseDetection, acousticConfidence: 0.9 });
    expect(result.stage).toBe(1);
  });

  it('02-03: acoustic < 0.75 → no stage (below threshold)', () => {
    const result = classifier.classify({ ...baseDetection, acousticConfidence: 0.74 });
    expect(result.stage).toBeNull();
  });

  it('02-04: acoustic 0.0 → no stage', () => {
    const result = classifier.classify({ ...baseDetection, acousticConfidence: 0.0 });
    expect(result.stage).toBeNull();
  });

  it('02-05: acoustic ≥ 0.75 + RF match → Stage 2', () => {
    const result = classifier.classify({ ...baseDetection, rfFingerprintMatch: true });
    expect(result.stage).toBe(2);
  });

  it('02-06: Stage 2 + ADS-B correlated → Stage 3', () => {
    const result = classifier.classify({ ...baseDetection, rfFingerprintMatch: true, adsbCorrelated: true });
    expect(result.stage).toBe(3);
  });

  it('02-07: Stage 2 + RemoteID within 500m → Stage 3', () => {
    const result = classifier.classify({ ...baseDetection, rfFingerprintMatch: true, remoteIdWithin500m: true });
    expect(result.stage).toBe(3);
  });

  it('02-08: Stage 3 requires Stage 2 first (ADS-B alone with no RF does not reach Stage 3)', () => {
    const result = classifier.classify({ ...baseDetection, adsbCorrelated: true });
    expect(result.stage).toBe(1); // only Stage 1 without RF
  });

  it('02-09: result includes confidence field', () => {
    const result = classifier.classify(baseDetection);
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('02-10: result includes evidence list', () => {
    const result = classifier.classify({ ...baseDetection, rfFingerprintMatch: true });
    expect(Array.isArray(result.evidence)).toBe(true);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('02-11: Stage 3 evidence includes all sensor types', () => {
    const result = classifier.classify({
      ...baseDetection,
      rfFingerprintMatch: true,
      adsbCorrelated: true,
    });
    const evidenceStr = result.evidence.join(' ');
    expect(evidenceStr).toMatch(/acoustic/i);
    expect(evidenceStr).toMatch(/rf|radio/i);
    expect(evidenceStr).toMatch(/adsb|ads-b/i);
  });

  it('02-12: Stage 1 confidence equals acousticConfidence', () => {
    const result = classifier.classify({ ...baseDetection, acousticConfidence: 0.87 });
    expect(result.confidence).toBe(0.87);
  });
});
