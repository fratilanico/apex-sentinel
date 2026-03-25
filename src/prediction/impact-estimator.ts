// APEX-SENTINEL — Impact Estimator
// W5 | src/prediction/impact-estimator.ts
//
// Projects current EKF velocity to alt = 0 for time-to-impact.
// Returns null when flight is level/ascending, outside time bounds,
// or confidence is below the configured gate.

import type { EKFState, ImpactEstimate } from './types.js';

const MIN_IMPACT_SECONDS = 0.5;
const MAX_IMPACT_SECONDS = 300;

export interface ImpactEstimatorConfig {
  confidenceGate: number;
}

export class ImpactEstimator {
  private readonly confidenceGate: number;

  constructor(config: ImpactEstimatorConfig) {
    this.confidenceGate = config.confidenceGate;
  }

  estimate(state: EKFState): ImpactEstimate | null {
    // Drone already on the ground — immediate impact
    if (state.alt <= 0) {
      return {
        lat: state.lat,
        lon: state.lon,
        timeToImpactSeconds: 0,
        confidence: state.confidence,
      };
    }

    // Confidence gate
    if (state.confidence < this.confidenceGate) return null;

    // Must be descending
    if (state.vAlt >= 0) return null;

    const timeToImpact = state.alt / (-state.vAlt);

    // Time bounds
    if (timeToImpact < MIN_IMPACT_SECONDS || timeToImpact > MAX_IMPACT_SECONDS) return null;

    return {
      lat: state.lat + state.vLat * timeToImpact,
      lon: state.lon + state.vLon * timeToImpact,
      timeToImpactSeconds: timeToImpact,
      confidence: state.confidence,
    };
  }
}
