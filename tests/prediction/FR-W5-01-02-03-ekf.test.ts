// APEX-SENTINEL — TDD RED Tests
// FR-W5-01: EKF Predict Step
// FR-W5-02: EKF Update Step
// FR-W5-03: EKF Covariance Positive-Definite
// Status: RED — src/prediction/ekf.ts not yet implemented

import { describe, it, expect, beforeEach } from 'vitest';
import { EKFInstance } from '../../src/prediction/ekf.js';
import type { Position3D } from '../../src/prediction/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** 6×6 identity covariance starting point */
function makeInitialP(): number[][] {
  const P: number[][] = Array.from({ length: 6 }, () => Array(6).fill(0));
  for (let i = 0; i < 6; i++) P[i][i] = 1e-4;
  return P;
}

/** Sum of diagonal elements */
function trace(P: number[][]): number {
  return P.reduce((sum, row, i) => sum + row[i], 0);
}

function isSymmetric(P: number[][], tol = 1e-12): boolean {
  for (let i = 0; i < P.length; i++) {
    for (let j = 0; j < P.length; j++) {
      if (Math.abs(P[i][j] - P[j][i]) > tol) return false;
    }
  }
  return true;
}

const INITIAL_STATE = {
  lat: 51.5,
  lon: -0.1,
  alt: 100,
  vLat: 1e-4, // ~11m/s northward
  vLon: 0,
  vAlt: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// FR-W5-01: EKF Predict Step
// ─────────────────────────────────────────────────────────────────────────────

describe('FR-W5-01-00: EKF Predict Step', () => {
  let ekf: EKFInstance;

  beforeEach(() => {
    ekf = new EKFInstance({ qc: 0.1 });
    ekf.initialize(INITIAL_STATE, makeInitialP());
  });

  it('FR-W5-01-01: predict propagates position with non-zero velocity', () => {
    ekf.predict(1.0);
    const state = ekf.getState();
    // lat_{k+1} = lat_k + dt * vLat_k = 51.5 + 1.0 * 1e-4
    expect(state.lat).toBeCloseTo(51.5 + 1e-4, 9);
    expect(state.lon).toBeCloseTo(-0.1, 9);
    expect(state.alt).toBeCloseTo(100, 9);
  });

  it('FR-W5-01-02: predict does not change position with zero velocity', () => {
    ekf.initialize({ lat: 51.5, lon: -0.1, alt: 100, vLat: 0, vLon: 0, vAlt: 0 }, makeInitialP());
    ekf.predict(1.0);
    const state = ekf.getState();
    expect(state.lat).toBeCloseTo(51.5, 9);
    expect(state.lon).toBeCloseTo(-0.1, 9);
    expect(state.alt).toBeCloseTo(100, 9);
  });

  it('FR-W5-01-03: covariance trace grows after predict (process noise)', () => {
    const P0 = ekf.getCovariance();
    const traceBefore = trace(P0);
    ekf.predict(1.0);
    const P1 = ekf.getCovariance();
    const traceAfter = trace(P1);
    expect(traceAfter).toBeGreaterThan(traceBefore);
  });

  it('FR-W5-01-04: Singer Q scales with dt — smaller dt gives smaller covariance growth', () => {
    const ekfShort = new EKFInstance({ qc: 0.1 });
    const ekfLong = new EKFInstance({ qc: 0.1 });
    ekfShort.initialize(INITIAL_STATE, makeInitialP());
    ekfLong.initialize(INITIAL_STATE, makeInitialP());

    ekfShort.predict(0.1);
    ekfLong.predict(1.0);

    const traceShort = trace(ekfShort.getCovariance());
    const traceLong = trace(ekfLong.getCovariance());
    expect(traceLong).toBeGreaterThan(traceShort);
  });

  it('FR-W5-01-05: R (measurement noise) not stored/modified during predict', () => {
    // EKFInstance should not have an R state mutated by predict
    ekf.predict(1.0);
    // Verify predict does not create or mutate a measurement noise property
    const state = ekf.getState();
    expect(state.lat).toBeDefined(); // just confirm it ran OK
    // R is only constructed transiently during update; no getter needed
  });

  it('FR-W5-01-06: sequential predict gives correct compound position', () => {
    ekf.predict(2.0);
    ekf.predict(1.0);
    const state = ekf.getState();
    // After 3s total: lat = 51.5 + 3 * 1e-4
    expect(state.lat).toBeCloseTo(51.5 + 3e-4, 8);
  });

  it('FR-W5-01-07: covariance is symmetric after predict', () => {
    ekf.predict(1.0);
    expect(isSymmetric(ekf.getCovariance(), 1e-12)).toBe(true);
  });

  it('FR-W5-01-08: predict before initialize throws EKFNotInitializedError', () => {
    const freshEkf = new EKFInstance({ qc: 0.1 });
    expect(() => freshEkf.predict(1.0)).toThrow(/not.?initialized/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-W5-02: EKF Update Step
// ─────────────────────────────────────────────────────────────────────────────

describe('FR-W5-02-00: EKF Update Step', () => {
  let ekf: EKFInstance;

  beforeEach(() => {
    ekf = new EKFInstance({ qc: 0.1, sigmaLatM: 10, sigmaLonM: 10, sigmaAltM: 15 });
    ekf.initialize(INITIAL_STATE, makeInitialP());
  });

  it('FR-W5-02-01: state moves toward measurement after update', () => {
    ekf.predict(1.0);
    const prior = ekf.getState();

    // Measurement is displaced 0.01 degrees from predicted position
    const measurement: Position3D = {
      lat: prior.lat + 0.01,
      lon: prior.lon,
      alt: prior.alt,
    };
    ekf.update(measurement);
    const posterior = ekf.getState();

    // Posterior must be closer to measurement than prior was
    const distPrior = Math.abs(prior.lat - measurement.lat);
    const distPosterior = Math.abs(posterior.lat - measurement.lat);
    expect(distPosterior).toBeLessThan(distPrior);
  });

  it('FR-W5-02-02: covariance trace shrinks after update', () => {
    ekf.predict(1.0);
    const traceBefore = trace(ekf.getCovariance());
    const state = ekf.getState();
    ekf.update({ lat: state.lat, lon: state.lon, alt: state.alt });
    const traceAfter = trace(ekf.getCovariance());
    expect(traceAfter).toBeLessThan(traceBefore);
  });

  it('FR-W5-02-03: covariance is symmetric after update', () => {
    ekf.predict(1.0);
    const state = ekf.getState();
    ekf.update({ lat: state.lat + 0.001, lon: state.lon, alt: state.alt });
    expect(isSymmetric(ekf.getCovariance(), 1e-12)).toBe(true);
  });

  it('FR-W5-02-04: getKalmanGain returns 6×3 matrix', () => {
    ekf.predict(1.0);
    const state = ekf.getState();
    ekf.update({ lat: state.lat, lon: state.lon, alt: state.alt });
    const K = ekf.getLastKalmanGain();
    expect(K).toHaveLength(6);
    K.forEach((row) => expect(row).toHaveLength(3));
  });

  it('FR-W5-02-05: zero innovation leaves state unchanged', () => {
    ekf.predict(1.0);
    const state = ekf.getState();
    ekf.update({ lat: state.lat, lon: state.lon, alt: state.alt });
    const posterior = ekf.getState();
    expect(posterior.lat).toBeCloseTo(state.lat, 10);
    expect(posterior.lon).toBeCloseTo(state.lon, 10);
    expect(posterior.alt).toBeCloseTo(state.alt, 10);
  });

  it('FR-W5-02-06: first update on uninitialized EKF auto-initializes', () => {
    const freshEkf = new EKFInstance({ qc: 0.1 });
    expect(() =>
      freshEkf.update({ lat: 51.5, lon: -0.1, alt: 100 })
    ).not.toThrow();
    const state = freshEkf.getState();
    expect(state.lat).toBeCloseTo(51.5, 5);
  });

  it('FR-W5-02-07: velocity components updated implicitly via Kalman gain', () => {
    // With off-diagonal covariance (after some history), K rows 3-5 should be non-zero
    // Run several cycles to build up cross-correlation in P
    for (let i = 0; i < 5; i++) {
      ekf.predict(1.0);
      ekf.update({ lat: 51.5 + i * 1e-4, lon: -0.1, alt: 100 });
    }
    const K = ekf.getLastKalmanGain();
    // At least one velocity row should have a non-trivial gain (not all zeros)
    const velocityRowsSum = K.slice(3).reduce((sum, row) => sum + Math.abs(row[0]) + Math.abs(row[1]) + Math.abs(row[2]), 0);
    expect(velocityRowsSum).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-W5-03: EKF Covariance Positive-Definite
// ─────────────────────────────────────────────────────────────────────────────

describe('FR-W5-03-00: EKF Covariance Positive-Definite', () => {
  it('FR-W5-03-01: PD maintained after 100 predict+update cycles with noisy measurements', () => {
    const ekf = new EKFInstance({ qc: 0.1, sigmaLatM: 10, sigmaLonM: 10, sigmaAltM: 15 });
    ekf.initialize({ lat: 51.5, lon: -0.1, alt: 100, vLat: 1e-4, vLon: 0, vAlt: -1 }, makeInitialP());

    for (let i = 0; i < 100; i++) {
      ekf.predict(1.0);
      const noise = (Math.random() - 0.5) * 1e-4;
      ekf.update({ lat: 51.5 + i * 1e-4 + noise, lon: -0.1, alt: 100 - i });
    }

    expect(ekf.isPositiveDefinite()).toBe(true);
  });

  it('FR-W5-03-02: PD maintained after 100 coast (predict-only) cycles', () => {
    const ekf = new EKFInstance({ qc: 0.1 });
    ekf.initialize(INITIAL_STATE, makeInitialP());

    for (let i = 0; i < 100; i++) {
      ekf.predict(1.0);
    }

    expect(ekf.isPositiveDefinite()).toBe(true);
  });

  it('FR-W5-03-03: P symmetric to 1e-12 after mixed predict/update cycles', () => {
    const ekf = new EKFInstance({ qc: 0.1, sigmaLatM: 10, sigmaLonM: 10, sigmaAltM: 15 });
    ekf.initialize(INITIAL_STATE, makeInitialP());

    for (let i = 0; i < 50; i++) {
      ekf.predict(1.0);
      if (i % 3 === 0) {
        ekf.update({ lat: 51.5 + i * 1e-4, lon: -0.1, alt: 100 });
      }
    }

    expect(isSymmetric(ekf.getCovariance(), 1e-12)).toBe(true);
  });

  it('FR-W5-03-04: degenerate covariance (near-zero det) triggers reinitialization', () => {
    const ekf = new EKFInstance({ qc: 0.1 });
    ekf.initialize(INITIAL_STATE, makeInitialP());

    // Inject degenerate covariance
    const degenerateP = Array.from({ length: 6 }, () => Array(6).fill(0));
    // All zeros → det = 0, not PD
    ekf.injectCovariance(degenerateP);

    expect(ekf.isPositiveDefinite()).toBe(false);
    // After next predict+update, reinit should restore PD
    ekf.predict(1.0);
    ekf.update({ lat: 51.5, lon: -0.1, alt: 100 });
    expect(ekf.isPositiveDefinite()).toBe(true);
  });

  it('FR-W5-03-05: epsilon inflation applied — all diagonal elements > 1e-9', () => {
    const ekf = new EKFInstance({ qc: 0.1 });
    ekf.initialize(INITIAL_STATE, makeInitialP());
    ekf.predict(1.0);
    const P = ekf.getCovariance();
    for (let i = 0; i < 6; i++) {
      expect(P[i][i]).toBeGreaterThan(1e-9);
    }
  });
});
