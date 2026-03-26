// APEX-SENTINEL — W6 Monte Carlo Propagator
// FR-W6-06 | src/prediction/monte-carlo-propagator.ts
//
// Uncertainty quantification for impact estimation.
// Samples from EKF state distribution, propagates each sample through ImpactEstimator.
// Returns 95th percentile impact ellipse.
// Uses diagonal covariance approximation for performance (<50ms for 1000 samples).

import type { EKFState } from './types.js';
import { ImpactEstimator } from './impact-estimator.js';

export interface MonteCarloResult {
  impactSamples: Array<{ lat: number; lon: number; timeToImpact: number }>;
  sampleCount: number;
  confidence95RadiusM: number;
}

export interface ImpactDistribution {
  meanLat: number;
  meanLon: number;
  stdLat: number;
  stdLon: number;
}

export interface PercentileBounds {
  centerLat: number;
  centerLon: number;
  radiusM: number;
}

export interface PropagateOptions {
  positionNoiseSigmaM?: number;   // 1-sigma position noise in meters (default 50)
  velocityNoiseSigma?: number;    // 1-sigma velocity noise in deg/s (default 5e-5 ≈ 0.5m/s at 51°N)
}

export interface MonteCarloPropagatorConfig {
  nSamples: number;
  confidenceGate?: number; // default 0.4
}

// Degrees-per-meter approximation at 51°N
const LAT_DEG_PER_M = 1 / 111_320;
const LON_DEG_PER_M = 1 / 71_700;

function randn(): number {
  // Box-Muller transform
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class MonteCarloPropagator {
  private readonly nSamples: number;
  private readonly confidenceGate: number;
  private readonly impactEstimator: ImpactEstimator;
  private lastResult: MonteCarloResult | null = null;
  private lastDistribution: ImpactDistribution | null = null;

  constructor(config: MonteCarloPropagatorConfig) {
    this.nSamples = config.nSamples;
    this.confidenceGate = config.confidenceGate ?? 0.4;
    this.impactEstimator = new ImpactEstimator({ confidenceGate: this.confidenceGate });
  }

  propagate(state: EKFState, options?: PropagateOptions): MonteCarloResult {
    // Confidence gate
    if (state.confidence < this.confidenceGate) {
      const result: MonteCarloResult = { impactSamples: [], sampleCount: this.nSamples, confidence95RadiusM: 0 };
      this.lastResult = result;
      this.lastDistribution = null;
      return result;
    }

    // Ascending track — no ground impact possible; skip Monte Carlo
    if (state.vAlt > 0 && state.alt > 0) {
      const result: MonteCarloResult = { impactSamples: [], sampleCount: this.nSamples, confidence95RadiusM: 0 };
      this.lastResult = result;
      this.lastDistribution = null;
      return result;
    }

    const posSigmaM = options?.positionNoiseSigmaM ?? 50;
    const velSigma = options?.velocityNoiseSigma ?? 5e-5; // 5e-5 deg/s ≈ 5.5m/s lat, 3.6m/s lon
    const posSigmaLat = posSigmaM * LAT_DEG_PER_M;
    const posSigmaLon = posSigmaM * LON_DEG_PER_M;

    const impacts: Array<{ lat: number; lon: number; timeToImpact: number }> = [];

    // Special case: already on the ground → all samples are immediate impact
    const alreadyImpacted = state.alt <= 0;

    for (let i = 0; i < this.nSamples; i++) {
      // Sample perturbations
      const sampledState: EKFState = {
        ...state,
        lat: state.lat + randn() * posSigmaLat,
        lon: state.lon + randn() * posSigmaLon,
        // If already on ground, keep alt at 0 so all samples show immediate impact
        alt: alreadyImpacted ? 0 : Math.max(0, state.alt + randn() * posSigmaM),
        vLat: state.vLat + randn() * velSigma,
        vLon: state.vLon + randn() * velSigma,
        vAlt: alreadyImpacted ? -1 : state.vAlt + randn() * (velSigma * 10), // ensure vAlt < 0 for grounded
      };

      const impact = this.impactEstimator.estimate(sampledState);
      if (impact !== null) {
        impacts.push({ lat: impact.lat, lon: impact.lon, timeToImpact: impact.timeToImpactSeconds });
      }
    }

    // Compute 95th percentile radius if we have samples
    let confidence95RadiusM = 0;
    let distribution: ImpactDistribution | null = null;

    if (impacts.length > 0) {
      const meanLat = impacts.reduce((s, p) => s + p.lat, 0) / impacts.length;
      const meanLon = impacts.reduce((s, p) => s + p.lon, 0) / impacts.length;
      const stdLat = Math.sqrt(impacts.reduce((s, p) => s + (p.lat - meanLat) ** 2, 0) / impacts.length);
      const stdLon = Math.sqrt(impacts.reduce((s, p) => s + (p.lon - meanLon) ** 2, 0) / impacts.length);

      distribution = { meanLat, meanLon, stdLat, stdLon };

      // 95th percentile = sort distances from mean, take 95th
      const distances = impacts.map(p => haversineM(meanLat, meanLon, p.lat, p.lon)).sort((a, b) => a - b);
      const p95idx = Math.floor(distances.length * 0.95);
      confidence95RadiusM = distances[Math.min(p95idx, distances.length - 1)];
    }

    const result: MonteCarloResult = {
      impactSamples: impacts,
      sampleCount: this.nSamples,
      confidence95RadiusM,
    };
    this.lastResult = result;
    this.lastDistribution = distribution;
    return result;
  }

  getImpactDistribution(): ImpactDistribution | null {
    return this.lastDistribution;
  }

  get95thPercentileBounds(): PercentileBounds | null {
    if (!this.lastResult || this.lastResult.impactSamples.length === 0) return null;
    const dist = this.lastDistribution!;
    return {
      centerLat: dist.meanLat,
      centerLon: dist.meanLon,
      radiusM: this.lastResult.confidence95RadiusM,
    };
  }
}
