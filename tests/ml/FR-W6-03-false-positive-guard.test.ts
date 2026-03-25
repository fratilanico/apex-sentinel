// APEX-SENTINEL — W6 False Positive Guard Tests
// FR-W6-03 | tests/ml/FR-W6-03-false-positive-guard.test.ts
// CRITICAL: 50cc motorcycle = identical acoustic to Shahed-136 piston signature
// Must discriminate via Doppler + temporal pattern + RF cross-correlation

import { describe, it, expect, beforeEach } from 'vitest';
import { FalsePositiveGuard } from '../../src/ml/false-positive-guard.js';
import type { TemporalSample, FalsePositiveAssessment } from '../../src/ml/false-positive-guard.js';

function makeSample(lat: number, lon: number, timestamp: number, speedKmh: number, heading: number): TemporalSample {
  return { lat, lon, timestamp, speedKmh, heading };
}

describe('FR-W6-03: FalsePositiveGuard', () => {
  let guard: FalsePositiveGuard;

  beforeEach(() => {
    guard = new FalsePositiveGuard({ temporalWindowMs: 10_000, dopplerThresholdKmh: 60 });
  });

  // --- Low confidence gate ---

  it('FR-W6-03-01: GIVEN yamnetConfidence < 0.85, WHEN assess called, THEN isFalsePositive true, reason "low-confidence"', () => {
    const result = guard.assess({ yamnetConfidence: 0.72, hasRfSignal: true, trackId: 'TRK-A' });
    expect(result.isFalsePositive).toBe(true);
    expect(result.reason).toBe('low-confidence');
  });

  it('FR-W6-03-02: GIVEN yamnetConfidence exactly 0.85, WHEN assess called, THEN NOT low-confidence (boundary)', () => {
    const result = guard.assess({ yamnetConfidence: 0.85, hasRfSignal: true, trackId: 'TRK-A' });
    expect(result.reason).not.toBe('low-confidence');
  });

  // --- Temporal linear pattern (vehicle) ---

  it('FR-W6-03-03: GIVEN linear track at >60km/h for 10s, WHEN assess called, THEN flags as temporal-linear vehicle', () => {
    // Simulate motorcycle at 80km/h moving in a straight line
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      guard.addTemporalSample({
        trackId: 'TRK-B',
        sample: makeSample(51.5 + i * 0.002, 4.9, now + i * 2000, 80, 0),
      });
    }
    const result = guard.assess({ yamnetConfidence: 0.91, hasRfSignal: false, trackId: 'TRK-B' });
    expect(result.isFalsePositive).toBe(true);
    expect(result.reason).toBe('temporal-linear');
  });

  it('FR-W6-03-04: GIVEN circling pattern (drone-like), WHEN assess called, THEN NOT flagged as linear vehicle', () => {
    const now = Date.now();
    // Circular path: heading changes significantly
    const headings = [0, 90, 180, 270, 359];
    headings.forEach((heading, i) => {
      const angle = (i * 72 * Math.PI) / 180;
      guard.addTemporalSample({
        trackId: 'TRK-C',
        sample: makeSample(51.5 + 0.001 * Math.sin(angle), 4.9 + 0.001 * Math.cos(angle), now + i * 2000, 30, heading),
      });
    });
    const result = guard.assess({ yamnetConfidence: 0.92, hasRfSignal: true, trackId: 'TRK-C' });
    expect(result.isFalsePositive).toBe(false);
  });

  // --- Doppler shift (vehicle speed) ---

  it('FR-W6-03-05: GIVEN Doppler shift indicating v > 60km/h linear, WHEN assess called, THEN flags doppler-vehicle', () => {
    const result = guard.assess({
      yamnetConfidence: 0.88,
      hasRfSignal: false,
      trackId: 'TRK-D',
      dopplerShiftKmh: 75, // approaching at 75km/h — too fast for drone
    });
    expect(result.isFalsePositive).toBe(true);
    expect(result.reason).toBe('doppler-vehicle');
  });

  it('FR-W6-03-06: GIVEN Doppler shift within drone speed range (<60km/h), WHEN assess called, THEN NOT doppler-vehicle', () => {
    const result = guard.assess({
      yamnetConfidence: 0.90,
      hasRfSignal: true,
      trackId: 'TRK-E',
      dopplerShiftKmh: 40, // drone cruise speed
    });
    expect(result.reason).not.toBe('doppler-vehicle');
  });

  // --- RF cross-check ---

  it('FR-W6-03-07: GIVEN confidence 0.92, RF 900MHz detected, no linear pattern, WHEN assess called, THEN NOT false positive', () => {
    const result = guard.assess({
      yamnetConfidence: 0.92,
      hasRfSignal: true,
      trackId: 'TRK-F',
    });
    expect(result.isFalsePositive).toBe(false);
  });

  it('FR-W6-03-08: GIVEN confidence 0.92, NO RF signal, no temporal data, WHEN assess called, THEN isFalsePositive false (acoustic alone is valid)', () => {
    // High confidence + no temporal evidence of vehicle = don't suppress
    const result = guard.assess({
      yamnetConfidence: 0.92,
      hasRfSignal: false,
      trackId: 'TRK-G',
    });
    // Without other evidence, a high-confidence detection should not be suppressed
    expect(result.isFalsePositive).toBe(false);
  });

  // --- clearWindow ---

  it('FR-W6-03-09: GIVEN temporal samples added, WHEN clearWindow called, THEN assess no longer sees old samples', () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      guard.addTemporalSample({
        trackId: 'TRK-H',
        sample: makeSample(51.5 + i * 0.002, 4.9, now + i * 2000, 80, 0),
      });
    }
    guard.clearWindow('TRK-H');
    // After clearing, should not have enough data to flag as vehicle
    const result = guard.assess({ yamnetConfidence: 0.91, hasRfSignal: false, trackId: 'TRK-H' });
    expect(result.reason).not.toBe('temporal-linear');
  });

  // --- getWindowStats ---

  it('FR-W6-03-10: GIVEN 3 samples added for trackId, WHEN getWindowStats called, THEN returns count 3', () => {
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      guard.addTemporalSample({
        trackId: 'TRK-I',
        sample: makeSample(51.5, 4.9, now + i * 1000, 50, 0),
      });
    }
    const stats = guard.getWindowStats('TRK-I');
    expect(stats.count).toBe(3);
  });

  it('FR-W6-03-11: GIVEN no samples for trackId, WHEN getWindowStats called, THEN returns count 0', () => {
    const stats = guard.getWindowStats('UNKNOWN-TRACK');
    expect(stats.count).toBe(0);
  });

  // --- shouldSuppressAlert ---

  it('FR-W6-03-12: GIVEN false positive assessment, WHEN shouldSuppressAlert called, THEN returns true', () => {
    // Feed linear track to establish vehicle pattern
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      guard.addTemporalSample({
        trackId: 'TRK-J',
        sample: makeSample(51.5 + i * 0.003, 4.9, now + i * 2000, 90, 0),
      });
    }
    const assessment = guard.assess({ yamnetConfidence: 0.91, hasRfSignal: false, trackId: 'TRK-J' });
    const suppress = guard.shouldSuppressAlert('TRK-J', assessment);
    expect(suppress).toBe(true);
  });

  it('FR-W6-03-13: GIVEN true detection, WHEN shouldSuppressAlert called, THEN returns false', () => {
    const assessment: FalsePositiveAssessment = {
      isFalsePositive: false,
      confidence: 0.93,
      reason: null,
    };
    const suppress = guard.shouldSuppressAlert('TRK-K', assessment);
    expect(suppress).toBe(false);
  });

  // --- Assessment confidence ---

  it('FR-W6-03-14: GIVEN true positive assessment, WHEN confidence checked, THEN >0', () => {
    const result = guard.assess({ yamnetConfidence: 0.95, hasRfSignal: true, trackId: 'TRK-L' });
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('FR-W6-03-15: GIVEN multiple false positive signals stacked (low confidence + linear), WHEN assess called, THEN reason is "low-confidence" (evaluated first)', () => {
    // Low confidence is checked first — other signals are moot
    const result = guard.assess({
      yamnetConfidence: 0.60,
      hasRfSignal: false,
      trackId: 'TRK-M',
      dopplerShiftKmh: 80,
    });
    expect(result.isFalsePositive).toBe(true);
    expect(result.reason).toBe('low-confidence');
  });
});
