// APEX-SENTINEL — Polynomial Surrogate Predictor
// W5 | src/prediction/polynomial-predictor.ts
//
// Fits a quadratic to the last N EKF snapshots per axis.
// Extrapolates to 5 horizons: +1, +2, +3, +5, +10 seconds.
// Confidence decay: exp(-lambda * horizonSeconds).

import { fitQuadratic, evalQuadratic } from './matrix-ops.js';
import type { EKFStateSnapshot, PredictionHorizon } from './types.js';

const HORIZON_SECONDS = [1, 2, 3, 5, 10] as const;
const DEFAULT_LAMBDA = 0.07;
const MAX_SNAPSHOTS = 20;

export interface PolynomialPredictorConfig {
  lambda?: number;
}

export class PolynomialPredictor {
  private snapshots: EKFStateSnapshot[] = [];
  private readonly lambda: number;

  constructor(config: PolynomialPredictorConfig) {
    this.lambda = config.lambda ??
      (process.env.EKF_CONFIDENCE_LAMBDA
        ? parseFloat(process.env.EKF_CONFIDENCE_LAMBDA)
        : DEFAULT_LAMBDA);
  }

  addSnapshot(snap: EKFStateSnapshot): void {
    this.snapshots.push(snap);
    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots.shift();
    }
  }

  predict(): PredictionHorizon[] {
    const n = this.snapshots.length;
    if (n < 2) return [];

    // Time-normalize: t[i] = (timestamp[i] - timestamp[0]) / 1000 (seconds)
    const t0 = this.snapshots[0].timestamp;
    const times = this.snapshots.map((s) => (s.timestamp - t0) / 1000);
    const lats = this.snapshots.map((s) => s.lat);
    const lons = this.snapshots.map((s) => s.lon);
    const alts = this.snapshots.map((s) => s.alt);

    // NaN guard
    for (const arr of [lats, lons, alts]) {
      if (arr.some((v) => !isFinite(v))) return [];
    }

    const cLat = fitQuadratic(times, lats);
    const cLon = fitQuadratic(times, lons);
    const cAlt = fitQuadratic(times, alts);

    const lastSnap = this.snapshots[n - 1];
    const tLast = (lastSnap.timestamp - t0) / 1000;

    const horizons: PredictionHorizon[] = HORIZON_SECONDS.map((h) => {
      const tFuture = tLast + h;
      const lat = evalQuadratic(cLat, tFuture);
      const lon = evalQuadratic(cLon, tFuture);
      const alt = Math.max(0, evalQuadratic(cAlt, tFuture));
      const confidence = Math.exp(-this.lambda * h);

      return {
        horizonSeconds: h,
        lat,
        lon,
        alt,
        confidence,
        timestamp: lastSnap.timestamp + h * 1000,
      };
    });

    // Final NaN guard on output
    if (horizons.some((h) => !isFinite(h.lat) || !isFinite(h.lon))) {
      return [];
    }

    return horizons;
  }

  reset(): void {
    this.snapshots = [];
  }
}
