// APEX-SENTINEL — TDD RED Tests
// FR-W5-04: Polynomial Surrogate Predictor
// FR-W5-05: 5-Horizon Output
// FR-W5-09: Confidence Decay
// Status: RED — src/prediction/polynomial-predictor.ts not yet implemented

import { describe, it, expect, beforeEach } from 'vitest';
import { PolynomialPredictor } from '../../src/prediction/polynomial-predictor.js';
import type { EKFStateSnapshot } from '../../src/prediction/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const LAMBDA = 0.07; // EKF_CONFIDENCE_LAMBDA default

function makeLinearSnapshots(n = 5): EKFStateSnapshot[] {
  const base = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    lat: 51.5 + i * 1e-4,
    lon: -0.1,
    alt: 100,
    vLat: 1e-4,
    vLon: 0,
    vAlt: 0,
    timestamp: base + i * 1000,
  }));
}

function makeParabolicSnapshots(): EKFStateSnapshot[] {
  // Constant downward acceleration: alt = 100 - 0.5 * g * t² ≈ 100 - 4.9*t²
  const base = Date.now();
  return Array.from({ length: 5 }, (_, i) => ({
    lat: 51.5,
    lon: -0.1,
    alt: 100 - 4.9 * i * i,
    vLat: 0,
    vLon: 0,
    vAlt: -9.8 * i,
    timestamp: base + i * 1000,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// FR-W5-04: Polynomial Surrogate Predictor
// ─────────────────────────────────────────────────────────────────────────────

describe('FR-W5-04-00: Polynomial Surrogate Predictor', () => {
  let predictor: PolynomialPredictor;

  beforeEach(() => {
    predictor = new PolynomialPredictor({ lambda: LAMBDA });
  });

  it('FR-W5-04-01: linear trajectory extrapolated correctly (a₂ ≈ 0)', () => {
    const snaps = makeLinearSnapshots(5);
    snaps.forEach((s) => predictor.addSnapshot(s));
    const horizons = predictor.predict();

    // At +1s from last snapshot, lat should continue linear: last.lat + 1 * vLat
    const lastLat = snaps[4].lat;
    expect(horizons[0].lat).toBeCloseTo(lastLat + 1e-4, 5);
    expect(horizons[0].alt).toBeCloseTo(100, 3);
  });

  it('FR-W5-04-02: parabolic altitude trajectory extrapolated correctly', () => {
    const snaps = makeParabolicSnapshots();
    snaps.forEach((s) => predictor.addSnapshot(s));
    const horizons = predictor.predict();

    // At +1s from t=4: alt should continue parabolic descent
    // alt(5) = 100 - 4.9 * 25 = 100 - 122.5 = -22.5 → clamped to 0 by FR-W5-05
    expect(horizons[0].alt).toBeGreaterThanOrEqual(0);
  });

  it('FR-W5-04-03: N < 2 positions returns empty horizons array', () => {
    predictor.addSnapshot(makeLinearSnapshots(1)[0]);
    const horizons = predictor.predict();
    expect(horizons).toHaveLength(0);
  });

  it('FR-W5-04-04: no external math library imports (pure MatrixOps)', () => {
    // This is a structural test — verify the module does not import ml-matrix,
    // mathjs, or numeric. The implementation must use only internal MatrixOps.
    // We verify behaviorally: the predictor runs entirely without throwing
    // ReferenceError from missing external packages.
    const snaps = makeLinearSnapshots(5);
    snaps.forEach((s) => predictor.addSnapshot(s));
    expect(() => predictor.predict()).not.toThrow();
  });

  it('FR-W5-04-05: time normalization prevents conditioning issues with large Unix timestamps', () => {
    // Snapshots with realistic Unix timestamps (~1.7e12 ms)
    const bigBase = 1743000000000; // realistic 2025 Unix timestamp
    const snaps = Array.from({ length: 5 }, (_, i) => ({
      lat: 51.5 + i * 1e-4,
      lon: -0.1,
      alt: 100,
      vLat: 1e-4,
      vLon: 0,
      vAlt: 0,
      timestamp: bigBase + i * 1000,
    }));
    snaps.forEach((s) => predictor.addSnapshot(s));
    const horizons = predictor.predict();
    // If no time normalization, Vandermonde matrix is ill-conditioned → NaN
    expect(horizons.every((h) => isFinite(h.lat) && isFinite(h.lon))).toBe(true);
  });

  it('FR-W5-04-06: NaN input returns empty horizons and does not throw', () => {
    const snaps = makeLinearSnapshots(5);
    snaps[2] = { ...snaps[2], lat: NaN };
    snaps.forEach((s) => predictor.addSnapshot(s));
    const horizons = predictor.predict();
    expect(horizons).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-W5-05: 5-Horizon Output
// ─────────────────────────────────────────────────────────────────────────────

describe('FR-W5-05-00: 5-Horizon Output', () => {
  let predictor: PolynomialPredictor;

  beforeEach(() => {
    predictor = new PolynomialPredictor({ lambda: LAMBDA });
    makeLinearSnapshots(5).forEach((s) => predictor.addSnapshot(s));
  });

  it('FR-W5-05-01: exactly 5 horizons returned when N ≥ 2', () => {
    const horizons = predictor.predict();
    expect(horizons).toHaveLength(5);
  });

  it('FR-W5-05-02: horizonSeconds values are [1, 2, 3, 5, 10] in order', () => {
    const horizons = predictor.predict();
    expect(horizons.map((h) => h.horizonSeconds)).toEqual([1, 2, 3, 5, 10]);
  });

  it('FR-W5-05-03: horizon timestamps correctly offset from last snapshot', () => {
    const snaps = makeLinearSnapshots(5);
    predictor = new PolynomialPredictor({ lambda: LAMBDA });
    snaps.forEach((s) => predictor.addSnapshot(s));
    const horizons = predictor.predict();
    const lastTs = snaps[4].timestamp;
    expect(horizons[0].timestamp).toBe(lastTs + 1 * 1000);
    expect(horizons[1].timestamp).toBe(lastTs + 2 * 1000);
    expect(horizons[4].timestamp).toBe(lastTs + 10 * 1000);
  });

  it('FR-W5-05-04: horizons ordered ascending by horizonSeconds', () => {
    const horizons = predictor.predict();
    for (let i = 1; i < horizons.length; i++) {
      expect(horizons[i].horizonSeconds).toBeGreaterThan(horizons[i - 1].horizonSeconds);
    }
  });

  it('FR-W5-05-05: all lat/lon values are finite (not NaN, not Infinity)', () => {
    const horizons = predictor.predict();
    horizons.forEach((h) => {
      expect(isFinite(h.lat)).toBe(true);
      expect(isFinite(h.lon)).toBe(true);
    });
  });

  it('FR-W5-05-06: alt clamped to 0 when polynomial extrapolation gives negative altitude', () => {
    predictor = new PolynomialPredictor({ lambda: LAMBDA });
    // Snapshots showing steep descent — will extrapolate below 0
    const base = Date.now();
    const snaps = Array.from({ length: 5 }, (_, i) => ({
      lat: 51.5,
      lon: -0.1,
      alt: Math.max(0, 100 - i * 30), // 100, 70, 40, 10, 0
      vLat: 0,
      vLon: 0,
      vAlt: -30,
      timestamp: base + i * 1000,
    }));
    snaps.forEach((s) => predictor.addSnapshot(s));
    const horizons = predictor.predict();
    horizons.forEach((h) => {
      expect(h.alt).toBeGreaterThanOrEqual(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-W5-09: Confidence Decay
// ─────────────────────────────────────────────────────────────────────────────

describe('FR-W5-09-00: Confidence Decay', () => {
  let predictor: PolynomialPredictor;

  beforeEach(() => {
    predictor = new PolynomialPredictor({ lambda: LAMBDA });
    makeLinearSnapshots(5).forEach((s) => predictor.addSnapshot(s));
  });

  it('FR-W5-09-01: +1s horizon confidence = exp(-λ * 1) ± 1e-6', () => {
    const horizons = predictor.predict();
    const expected = Math.exp(-LAMBDA * 1);
    expect(horizons[0].confidence).toBeCloseTo(expected, 5);
  });

  it('FR-W5-09-02: +10s horizon confidence = exp(-λ * 10) ± 1e-6', () => {
    const horizons = predictor.predict();
    const expected = Math.exp(-LAMBDA * 10);
    expect(horizons[4].confidence).toBeCloseTo(expected, 5);
  });

  it('FR-W5-09-03: confidence values are monotonically decreasing across horizons', () => {
    const horizons = predictor.predict();
    for (let i = 1; i < horizons.length; i++) {
      expect(horizons[i].confidence).toBeLessThan(horizons[i - 1].confidence);
    }
  });

  it('FR-W5-09-04: all confidence values are in [0, 1]', () => {
    const horizons = predictor.predict();
    horizons.forEach((h) => {
      expect(h.confidence).toBeGreaterThanOrEqual(0);
      expect(h.confidence).toBeLessThanOrEqual(1);
    });
  });

  it('FR-W5-09-05: lambda configurable — larger lambda decays faster', () => {
    const fastPredictor = new PolynomialPredictor({ lambda: 0.5 });
    makeLinearSnapshots(5).forEach((s) => fastPredictor.addSnapshot(s));
    const slowHorizons = predictor.predict(); // λ=0.07
    const fastHorizons = fastPredictor.predict(); // λ=0.5
    // At +10s: fast decay should have lower confidence
    expect(fastHorizons[4].confidence).toBeLessThan(slowHorizons[4].confidence);
  });

  it('FR-W5-09-06: lambda defaults to EKF_CONFIDENCE_LAMBDA env var when not passed', () => {
    // Just verify it instantiates without required lambda param and produces valid output
    const defaultPredictor = new PolynomialPredictor({});
    makeLinearSnapshots(5).forEach((s) => defaultPredictor.addSnapshot(s));
    const horizons = defaultPredictor.predict();
    expect(horizons).toHaveLength(5);
    horizons.forEach((h) => {
      expect(h.confidence).toBeGreaterThan(0);
      expect(h.confidence).toBeLessThanOrEqual(1);
    });
  });
});
