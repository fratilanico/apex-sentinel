// APEX-SENTINEL — W6 Monte Carlo Propagator Tests
// FR-W6-06 | tests/prediction/FR-W6-06-monte-carlo.test.ts
// Uncertainty quantification for impact estimation

import { describe, it, expect, beforeEach } from 'vitest';
import { MonteCarloPropagator } from '../../src/prediction/monte-carlo-propagator.js';
import type { EKFState } from '../../src/prediction/types.js';

function makeEKFState(overrides: Partial<EKFState> = {}): EKFState {
  return {
    lat: 51.5,
    lon: 4.9,
    alt: 200,
    vLat: 0,
    vLon: 0,
    vAlt: -10, // descending at 10m/s → impact in 20s
    confidence: 0.9,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('FR-W6-06: MonteCarloPropagator', () => {
  let propagator: MonteCarloPropagator;

  beforeEach(() => {
    propagator = new MonteCarloPropagator({ nSamples: 1000 });
  });

  // --- propagate ---

  it('FR-W6-06-01: GIVEN EKF state descending, WHEN propagate called, THEN returns 1000 impact samples', () => {
    const state = makeEKFState();
    const result = propagator.propagate(state);
    expect(result.sampleCount).toBe(1000);
    expect(result.impactSamples.length).toBeGreaterThan(0);
  });

  it('FR-W6-06-02: GIVEN EKF state ascending (vAlt > 0), WHEN propagate called, THEN impactSamples is empty, confidence95RadiusM is 0', () => {
    const state = makeEKFState({ vAlt: 5 }); // ascending
    const result = propagator.propagate(state);
    expect(result.impactSamples.length).toBe(0);
    expect(result.confidence95RadiusM).toBe(0);
  });

  it('FR-W6-06-03: GIVEN alt=0 (already impacted), WHEN propagate called, THEN all samples at current lat/lon with t=0', () => {
    const state = makeEKFState({ alt: 0, vAlt: -5 });
    const result = propagator.propagate(state);
    expect(result.impactSamples.length).toBeGreaterThan(0);
    // All samples should have timeToImpact ≈ 0
    const avgTime = result.impactSamples.reduce((s, x) => s + x.timeToImpact, 0) / result.impactSamples.length;
    expect(avgTime).toBeLessThan(1); // near-immediate
  });

  it('FR-W6-06-04: GIVEN high-confidence EKF (low position noise), WHEN propagate called, THEN 95th percentile radius <500m', () => {
    const state = makeEKFState({ confidence: 0.95, alt: 500, vAlt: -20 });
    const result = propagator.propagate(state, { positionNoiseSigmaM: 10 }); // tight
    expect(result.confidence95RadiusM).toBeLessThan(500);
  });

  it('FR-W6-06-05: GIVEN low-confidence EKF (high position noise), WHEN propagate called, THEN 95th percentile radius > tight case', () => {
    const state = makeEKFState({ confidence: 0.5, alt: 500, vAlt: -5 });
    const tightResult = propagator.propagate(makeEKFState({ confidence: 0.95, alt: 500, vAlt: -5 }), { positionNoiseSigmaM: 10 });
    const looseResult = propagator.propagate(state, { positionNoiseSigmaM: 200 }); // large noise
    expect(looseResult.confidence95RadiusM).toBeGreaterThan(tightResult.confidence95RadiusM);
  });

  // --- getImpactDistribution ---

  it('FR-W6-06-06: GIVEN propagated result, WHEN getImpactDistribution called, THEN returns meanLat, meanLon, stdLat, stdLon', () => {
    const state = makeEKFState();
    propagator.propagate(state);
    const dist = propagator.getImpactDistribution();
    expect(typeof dist.meanLat).toBe('number');
    expect(typeof dist.meanLon).toBe('number');
    expect(typeof dist.stdLat).toBe('number');
    expect(typeof dist.stdLon).toBe('number');
    expect(isFinite(dist.meanLat)).toBe(true);
  });

  it('FR-W6-06-07: GIVEN no propagation done, WHEN getImpactDistribution called, THEN returns null', () => {
    const dist = propagator.getImpactDistribution();
    expect(dist).toBeNull();
  });

  // --- get95thPercentileBounds ---

  it('FR-W6-06-08: GIVEN propagated result with impact samples, WHEN get95thPercentileBounds called, THEN returns radius in meters', () => {
    const state = makeEKFState();
    propagator.propagate(state);
    const bounds = propagator.get95thPercentileBounds();
    expect(bounds).not.toBeNull();
    expect(bounds!.radiusM).toBeGreaterThan(0);
    expect(bounds!.centerLat).toBeCloseTo(51.5, 1);
  });

  it('FR-W6-06-09: GIVEN no impact samples (ascending track), WHEN get95thPercentileBounds called, THEN returns null', () => {
    const state = makeEKFState({ vAlt: 10 });
    propagator.propagate(state);
    const bounds = propagator.get95thPercentileBounds();
    expect(bounds).toBeNull();
  });

  // --- performance ---

  it('FR-W6-06-10: GIVEN 1000 samples, WHEN propagate called, THEN completes in <500ms', () => {
    const state = makeEKFState();
    const start = performance.now();
    propagator.propagate(state);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500); // 500ms gate — accounts for coverage instrumentation overhead
  });

  // --- meanLat near impact point ---

  it('FR-W6-06-11: GIVEN descending at vLat=0.001 deg/s for 20s, WHEN getImpactDistribution called, THEN meanLat near lat + vLat*20', () => {
    const state = makeEKFState({
      lat: 51.5,
      vLat: 0.001,
      alt: 200,
      vAlt: -10, // 20s to impact
    });
    propagator.propagate(state, { positionNoiseSigmaM: 1 }); // very tight
    const dist = propagator.getImpactDistribution();
    // Expected impact lat ≈ 51.5 + 0.001 * 20 = 51.52
    expect(dist!.meanLat).toBeCloseTo(51.52, 1);
  });

  // --- sampleCount ---

  it('FR-W6-06-12: GIVEN custom nSamples=500, WHEN propagate called, THEN result.sampleCount is 500', () => {
    const custom = new MonteCarloPropagator({ nSamples: 500 });
    const result = custom.propagate(makeEKFState());
    expect(result.sampleCount).toBe(500);
  });

  // --- stdDev increases with noise ---

  it('FR-W6-06-13: GIVEN large velocity noise, WHEN propagate called, THEN stdLat > small noise case', () => {
    const state = makeEKFState();
    const tightProp = new MonteCarloPropagator({ nSamples: 1000 });
    const looseProp = new MonteCarloPropagator({ nSamples: 1000 });
    // tight: very small velocity noise
    tightProp.propagate(state, { velocityNoiseSigma: 5e-6 });
    // loose: much larger velocity noise (100x)
    looseProp.propagate(state, { velocityNoiseSigma: 5e-4 });
    const tightDist = tightProp.getImpactDistribution();
    const looseDist = looseProp.getImpactDistribution();
    expect(looseDist!.stdLat).toBeGreaterThan(tightDist!.stdLat);
  });

  // --- confidence gate ---

  it('FR-W6-06-14: GIVEN EKF confidence < 0.4 (below gate), WHEN propagate called, THEN impactSamples is empty', () => {
    const state = makeEKFState({ confidence: 0.3, vAlt: -10 });
    const result = propagator.propagate(state);
    expect(result.impactSamples.length).toBe(0);
  });

  it('FR-W6-06-15: GIVEN EKF confidence exactly 0.4 (at gate), WHEN propagate called, THEN impactSamples has entries (gate is exclusive <)', () => {
    const state = makeEKFState({ confidence: 0.4, vAlt: -10 });
    const result = propagator.propagate(state);
    expect(result.impactSamples.length).toBeGreaterThan(0);
  });
});
