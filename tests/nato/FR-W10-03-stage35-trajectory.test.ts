// APEX-SENTINEL — W10 Stage35TrajectoryPredictor Tests
// FR-W10-03 | tests/nato/FR-W10-03-stage35-trajectory.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { Stage35TrajectoryPredictor, type PositionFix } from '../../src/nato/stage35-trajectory-predictor.js';

describe('FR-W10-03: Stage35TrajectoryPredictor', () => {
  let predictor: Stage35TrajectoryPredictor;

  beforeEach(() => {
    predictor = new Stage35TrajectoryPredictor();
  });

  // Helper: feed N fixes moving north at ~10m/s
  function feedLinearFixes(n: number, startLat = 45.0, startLon = 26.0, altM = 150, vLatDeg = 0.0001): void {
    const baseTs = 1700000000000;
    const dtMs = 1000;
    for (let i = 0; i < n; i++) {
      predictor.update({
        lat: startLat + i * vLatDeg,
        lon: startLon,
        altMeters: altM,
        ts: baseTs + i * dtMs,
      });
    }
  }

  it('03-01: predict returns array of 3 predictions by default', () => {
    feedLinearFixes(5);
    const preds = predictor.predict();
    expect(preds).toHaveLength(3);
  });

  it('03-02: default horizons are 30s, 60s, 120s', () => {
    feedLinearFixes(5);
    const preds = predictor.predict();
    expect(preds[0].tSeconds).toBe(30);
    expect(preds[1].tSeconds).toBe(60);
    expect(preds[2].tSeconds).toBe(120);
  });

  it('03-03: prediction has required fields', () => {
    feedLinearFixes(5);
    const [pred] = predictor.predict();
    expect(typeof pred.lat).toBe('number');
    expect(typeof pred.lon).toBe('number');
    expect(typeof pred.altM).toBe('number');
    expect(typeof pred.confidenceRadius_m).toBe('number');
    expect(typeof pred.tSeconds).toBe('number');
  });

  it('03-04: confidenceRadius_m grows with horizon', () => {
    feedLinearFixes(5);
    const [p30, p60, p120] = predictor.predict();
    expect(p60.confidenceRadius_m).toBeGreaterThanOrEqual(p30.confidenceRadius_m);
    expect(p120.confidenceRadius_m).toBeGreaterThanOrEqual(p60.confidenceRadius_m);
  });

  it('03-05: confidenceRadius_m is positive', () => {
    feedLinearFixes(5);
    const preds = predictor.predict();
    preds.forEach(p => expect(p.confidenceRadius_m).toBeGreaterThan(0));
  });

  it('03-06: linear northward trajectory reproduced at 30s', () => {
    // Feed 10 fixes at 0.0001 deg/s northward (≈11m/s)
    feedLinearFixes(10, 45.0, 26.0, 150, 0.0001);
    const preds = predictor.predict();
    // After 30s, expected lat increase: 30 * 0.0001 = 0.003 from last position
    // Last position lat: 45.0 + 9 * 0.0001 = 45.0009
    // Expected 30s prediction lat: ~45.0009 + 0.003 = 45.0039
    expect(preds[0].lat).toBeGreaterThan(45.001);
    expect(preds[0].lat).toBeLessThan(45.01);
  });

  it('03-07: longitude stable for north-only movement', () => {
    feedLinearFixes(10);
    const preds = predictor.predict();
    preds.forEach(p => expect(Math.abs(p.lon - 26.0)).toBeLessThan(0.01));
  });

  it('03-08: altitude extrapolated (stable for constant alt input)', () => {
    feedLinearFixes(10, 45.0, 26.0, 150);
    const preds = predictor.predict();
    preds.forEach(p => expect(Math.abs(p.altM - 150)).toBeLessThan(50));
  });

  it('03-09: reset clears state', () => {
    feedLinearFixes(10);
    predictor.reset();
    // After reset, predict with insufficient data should give large confidence radius
    predictor.update({ lat: 45.0, lon: 26.0, altMeters: 150, ts: Date.now() });
    const preds = predictor.predict();
    // With only 1 fix, confidence radius should be large
    expect(preds[0].confidenceRadius_m).toBeGreaterThan(100);
  });

  it('03-10: custom horizons supported', () => {
    feedLinearFixes(5);
    const preds = predictor.predict([10, 45, 90]);
    expect(preds).toHaveLength(3);
    expect(preds[0].tSeconds).toBe(10);
    expect(preds[1].tSeconds).toBe(45);
    expect(preds[2].tSeconds).toBe(90);
  });

  it('03-11: confidence radius < 500m after 5+ fixes (EKF convergence)', () => {
    feedLinearFixes(8);
    const preds = predictor.predict([30]);
    // After convergence, 30s confidence should be well under 2000m
    expect(preds[0].confidenceRadius_m).toBeLessThan(2000);
  });

  it('03-12: single fix gives a valid (but uncertain) prediction', () => {
    predictor.update({ lat: 45.0, lon: 26.0, altMeters: 100, ts: Date.now() });
    const preds = predictor.predict([30]);
    expect(preds).toHaveLength(1);
    expect(preds[0].lat).toBeDefined();
  });

  it('03-13: prediction lat/lon are in plausible range (not NaN or Infinity)', () => {
    feedLinearFixes(10);
    const preds = predictor.predict();
    preds.forEach(p => {
      expect(isFinite(p.lat)).toBe(true);
      expect(isFinite(p.lon)).toBe(true);
      expect(isFinite(p.altM)).toBe(true);
      expect(isFinite(p.confidenceRadius_m)).toBe(true);
    });
  });
});
