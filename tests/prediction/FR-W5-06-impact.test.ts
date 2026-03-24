// APEX-SENTINEL — TDD RED Tests
// FR-W5-06: Impact Estimator
// Status: RED — src/prediction/impact-estimator.ts not yet implemented

import { describe, it, expect } from 'vitest';
import { ImpactEstimator } from '../../src/prediction/impact-estimator.js';
import type { EKFState } from '../../src/prediction/types.js';

const EKF_CONFIDENCE_GATE = 0.4;

function makeState(overrides: Partial<EKFState> = {}): EKFState {
  return {
    lat: 51.5,
    lon: -0.1,
    alt: 100,
    vLat: 1e-4,
    vLon: 0,
    vAlt: -2.0, // descending
    confidence: 0.8,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('FR-W5-06-00: Impact Estimator', () => {
  const estimator = new ImpactEstimator({ confidenceGate: EKF_CONFIDENCE_GATE });

  it('FR-W5-06-01: correct timeToImpact from alt=100m, vAlt=-2m/s → 50s', () => {
    const state = makeState({ alt: 100, vAlt: -2.0 });
    const result = estimator.estimate(state);
    expect(result).not.toBeNull();
    expect(result!.timeToImpactSeconds).toBeCloseTo(50, 3);
  });

  it('FR-W5-06-02: correct impact lat extrapolation', () => {
    const state = makeState({ lat: 51.5, vLat: 1e-4, alt: 100, vAlt: -2.0 });
    const result = estimator.estimate(state);
    expect(result).not.toBeNull();
    // impactLat = 51.5 + 1e-4 * 50
    expect(result!.lat).toBeCloseTo(51.5 + 1e-4 * 50, 7);
  });

  it('FR-W5-06-03: level flight (vAlt=0) returns null', () => {
    const state = makeState({ vAlt: 0 });
    expect(estimator.estimate(state)).toBeNull();
  });

  it('FR-W5-06-04: ascending flight (vAlt>0) returns null', () => {
    const state = makeState({ vAlt: 2.5 });
    expect(estimator.estimate(state)).toBeNull();
  });

  it('FR-W5-06-05: very fast descent (timeToImpact < 0.5s) returns null', () => {
    // alt=0.4m, vAlt=-1m/s → t = 0.4s < 0.5
    const state = makeState({ alt: 0.4, vAlt: -1.0 });
    expect(estimator.estimate(state)).toBeNull();
  });

  it('FR-W5-06-06: very slow descent (timeToImpact > 300s) returns null', () => {
    // alt=1000m, vAlt=-3m/s → t = 333s > 300
    const state = makeState({ alt: 1000, vAlt: -3.0 });
    expect(estimator.estimate(state)).toBeNull();
  });

  it('FR-W5-06-07: confidence below gate (< 0.4) returns null', () => {
    const state = makeState({ confidence: 0.3, vAlt: -2.0, alt: 100 });
    expect(estimator.estimate(state)).toBeNull();
  });

  it('FR-W5-06-08: drone already at ground (alt ≤ 0) returns immediate impact', () => {
    const state = makeState({ alt: 0, vAlt: -1.0 });
    const result = estimator.estimate(state);
    expect(result).not.toBeNull();
    expect(result!.timeToImpactSeconds).toBe(0);
    expect(result!.lat).toBeCloseTo(state.lat, 8);
    expect(result!.lon).toBeCloseTo(state.lon, 8);
  });
});
