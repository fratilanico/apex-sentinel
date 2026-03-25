// APEX-SENTINEL — EKF Instance (Extended Kalman Filter)
// W5 | src/prediction/ekf.ts
//
// 6D state vector: x = [lat, lon, alt, vLat, vLon, vAlt]
// Singer maneuver noise model for process covariance Q.
// Joseph form symmetrization + epsilon inflation for numerical stability.

import {
  matMul,
  transpose,
  matAdd,
  symmetrize,
  epsilonInflate,
  det3x3,
  matInv3x3,
} from './matrix-ops.js';

export interface EKFConfig {
  qc: number;          // Singer process noise spectral density (m²/s³)
  sigmaLatM?: number;  // Measurement noise lat (metres, converted to degrees)
  sigmaLonM?: number;  // Measurement noise lon (metres)
  sigmaAltM?: number;  // Measurement noise alt (metres)
}

export interface EKFStateVector {
  lat: number;
  lon: number;
  alt: number;
  vLat: number;
  vLon: number;
  vAlt: number;
}

const DEG_PER_M = 1 / 111_000;
const DEFAULT_P_DIAG = 1e-2; // Initial covariance diagonal

function makeDefaultP(): number[][] {
  const P: number[][] = Array.from({ length: 6 }, () => Array(6).fill(0));
  for (let i = 0; i < 6; i++) P[i][i] = DEFAULT_P_DIAG;
  return P;
}

/** Singer Q — process noise for constant-velocity + maneuver noise */
function singerQ(qc: number, dt: number): number[][] {
  const Q: number[][] = Array.from({ length: 6 }, () => Array(6).fill(0));
  // Axis pairs: (lat,vLat)=(0,3), (lon,vLon)=(1,4), (alt,vAlt)=(2,5)
  const pairs = [
    [0, 3],
    [1, 4],
    [2, 5],
  ] as const;
  for (const [pi, vi] of pairs) {
    Q[pi][pi] = qc * (dt ** 5) / 20;
    Q[pi][vi] = qc * (dt ** 4) / 8;
    Q[vi][pi] = qc * (dt ** 4) / 8;
    Q[vi][vi] = qc * (dt ** 3) / 3;
  }
  return Q;
}

/** State transition matrix F (6×6) */
function stateTransitionF(dt: number): number[][] {
  return [
    [1, 0, 0, dt, 0, 0],
    [0, 1, 0, 0, dt, 0],
    [0, 0, 1, 0, 0, dt],
    [0, 0, 0, 1, 0, 0],
    [0, 0, 0, 0, 1, 0],
    [0, 0, 0, 0, 0, 1],
  ];
}

/** Observation matrix H (3×6) — position selector */
const H: number[][] = [
  [1, 0, 0, 0, 0, 0],
  [0, 1, 0, 0, 0, 0],
  [0, 0, 1, 0, 0, 0],
];

const HT = transpose(H);

const I6: number[][] = Array.from({ length: 6 }, (_, i) =>
  Array.from({ length: 6 }, (_, j) => (i === j ? 1 : 0))
);

export class EKFInstance {
  private x: number[] = [0, 0, 0, 0, 0, 0]; // [lat,lon,alt,vLat,vLon,vAlt]
  private P: number[][] = makeDefaultP();
  private initialized = false;
  private lastK: number[][] = Array.from({ length: 6 }, () => Array(3).fill(0));
  private readonly config: Required<EKFConfig>;

  constructor(config: EKFConfig) {
    this.config = {
      qc: config.qc,
      sigmaLatM: config.sigmaLatM ?? 10,
      sigmaLonM: config.sigmaLonM ?? 10,
      sigmaAltM: config.sigmaAltM ?? 15,
    };
  }

  initialize(state: EKFStateVector, P?: number[][]): void {
    this.x = [state.lat, state.lon, state.alt, state.vLat, state.vLon, state.vAlt];
    this.P = P ? P.map((row) => [...row]) : makeDefaultP();
    this.initialized = true;
  }

  /** Predict step: propagate state and covariance forward by dt seconds */
  predict(dt: number): void {
    if (!this.initialized) {
      throw new Error('EKF_NOT_INITIALIZED: call initialize() or update() before predict()');
    }
    const F = stateTransitionF(dt);
    const FT = transpose(F);

    // x = F * x
    const newX = F.map((row) => row.reduce((sum, v, j) => sum + v * this.x[j], 0));

    // P = F * P * F^T + Q
    const FPFT = matMul(matMul(F, this.P), FT);
    const Q = singerQ(this.config.qc, dt);
    let newP = matAdd(FPFT, Q);
    newP = symmetrize(newP);
    newP = epsilonInflate(newP);

    this.x = newX;
    this.P = newP;
  }

  /** Coast = predict-only, no measurement incorporated */
  coast(dt: number): void {
    this.predict(dt);
  }

  /** Update step: incorporate position measurement */
  update(measurement: { lat: number; lon: number; alt: number }): void {
    if (!this.initialized) {
      // Auto-initialize from first measurement with zero velocity
      this.initialize({
        lat: measurement.lat,
        lon: measurement.lon,
        alt: measurement.alt,
        vLat: 0,
        vLon: 0,
        vAlt: 0,
      });
      return;
    }

    // Build measurement noise R (3×3) in degrees²/m²
    const sigLat = this.config.sigmaLatM * DEG_PER_M;
    const sigLon =
      this.config.sigmaLonM *
      DEG_PER_M *
      (1 / Math.max(Math.cos((this.x[0] * Math.PI) / 180), 0.001));
    const sigAlt = this.config.sigmaAltM;
    const R: number[][] = [
      [sigLat * sigLat, 0, 0],
      [0, sigLon * sigLon, 0],
      [0, 0, sigAlt * sigAlt],
    ];

    // Innovation: y = z - H*x
    const z = [measurement.lat, measurement.lon, measurement.alt];
    const Hx = H.map((row) => row.reduce((s, v, j) => s + v * this.x[j], 0));
    const y = z.map((zv, i) => zv - Hx[i]);

    // Innovation covariance: S = H*P*H^T + R
    const HPHT = matMul(matMul(H, this.P), HT);
    const S: number[][] = matAdd(HPHT, R);

    // Kalman gain: K = P*H^T * S^-1  (6×3)
    let Sinv: number[][];
    try {
      Sinv = matInv3x3(S);
    } catch {
      // S is singular — skip update
      return;
    }
    const PHT = matMul(this.P, HT);
    const K = matMul(PHT, Sinv);
    this.lastK = K;

    // State update: x = x + K*y
    const Ky = K.map((row) => row.reduce((s, v, j) => s + v * y[j], 0));
    this.x = this.x.map((v, i) => v + Ky[i]);

    // Covariance update: P = (I - K*H)*P
    const KH = matMul(K, H);
    const IKH = I6.map((row, i) => row.map((v, j) => v - KH[i][j]));
    let newP = matMul(IKH, this.P);
    newP = symmetrize(newP);
    newP = epsilonInflate(newP);
    this.P = newP;
  }

  getState(): EKFStateVector {
    return {
      lat: this.x[0],
      lon: this.x[1],
      alt: this.x[2],
      vLat: this.x[3],
      vLon: this.x[4],
      vAlt: this.x[5],
    };
  }

  getCovariance(): number[][] {
    return this.P.map((row) => [...row]);
  }

  getLastKalmanGain(): number[][] {
    return this.lastK.map((row) => [...row]);
  }

  isPositiveDefinite(): boolean {
    const P = this.P;
    // Symmetry check
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++)
        if (Math.abs(P[i][j] - P[j][i]) > 1e-10) return false;
    // All diagonal positive
    for (let i = 0; i < 6; i++) if (P[i][i] <= 0) return false;
    // Position block determinant > threshold
    const posBlock = [
      [P[0][0], P[0][1], P[0][2]],
      [P[1][0], P[1][1], P[1][2]],
      [P[2][0], P[2][1], P[2][2]],
    ];
    return det3x3(posBlock) > 1e-20;
  }

  /** Inject a covariance matrix (for testing degenerate cases) */
  injectCovariance(P: number[][]): void {
    this.P = P.map((row) => [...row]);
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
