# APEX-SENTINEL W5 — IMPLEMENTATION PLAN
## W5 | PROJECTAPEX Doc 17/20 | 2026-03-24

> Wave: W5 — EKF + LSTM Trajectory Prediction (Gate 4)
> Total duration: 35 days (5 phases × 7 days)
> Supabase: bymfcnwfyxuivinuzurr (eu-west-2)

---

## Overview

```
Phase  Days    Deliverable                            Tests Added
──────────────────────────────────────────────────────────────────
P1     1-7     EKFInstance + MatrixOps                35 (unit)
P2     8-14    PolynomialPredictor + ImpactEstimator  20 (unit)
P3     15-21   MultiTrackEKFManager + NATS consumer   10 (unit) + 8 (integration)
P4     22-28   PredictionPublisher + TrackEnrichment  15 (unit) + 7 (integration)
P5     29-35   systemd deploy + E2E + W4 integration  5 (E2E)
──────────────────────────────────────────────────────────────────
TOTAL                                                 ≥85 tests
```

---

## Phase 1: EKFInstance + MatrixOps (Days 1-7)

### Day 1 — File structure + MatrixOps TDD RED

Create file structure:
```
src/
  ekf/
    MatrixOps.ts
    EKFInstance.ts
    MultiTrackEKFManager.ts
    __tests__/
      MatrixOps.test.ts
      EKFInstance.test.ts
      MultiTrackEKFManager.test.ts
  predictor/
    PolynomialPredictor.ts
    ImpactEstimator.ts
    __tests__/
      PolynomialPredictor.test.ts
      ImpactEstimator.test.ts
  publisher/
    PredictionPublisher.ts
    __tests__/
      PredictionPublisher.test.ts
  service/
    TrackEnrichmentService.ts
    HealthServer.ts
    main.ts
    __tests__/
      TrackEnrichmentService.test.ts
  types/
    ekf.types.ts
  nats/
    NatsClient.ts
infra/
  systemd/
    apex-sentinel-ekf.service
  docker-compose.test.yml
supabase/
  migrations/
    005_ekf_predicted_trajectory.sql
    006_ekf_tracks_audit.sql
    007_ekf_config.sql
  functions/
    get-track-predictions/index.ts
    get-ekf-health/index.ts
scripts/
  ekf-benchmark.ts
  capture-lkgc.sh
  measure-prediction-latency.ts
```

Write failing tests for MatrixOps (TDD RED — commit with message "test(w5): TDD RED MatrixOps"):
```typescript
// src/ekf/__tests__/MatrixOps.test.ts
import { describe, it, expect } from 'vitest';
import {
  matMul, matAdd, matSub, matTranspose, matScale,
  matInv2x2, matInv3x3, matIdentity, matZero,
  matSymmetrize, matIsPositiveDefinite,
  matDet2x2, matDet3x3, matVecMul, vecSub, vecAdd
} from '../MatrixOps.js';

describe('FR-W5-01: MatrixOps — core matrix operations', () => {
  describe('matMul', () => {
    it('multiplies 2×2 identity by arbitrary matrix → same matrix', () => {
      const I = matIdentity(2);
      const A = [[3, 4], [5, 6]];
      expect(matMul(I, A)).toEqual(A);
    });
    it('multiplies 3×3 matrices correctly', () => {
      const A = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
      const B = matIdentity(3);
      expect(matMul(A, B)).toEqual(A);
    });
    it('multiplies 6×6 identity produces input unchanged', () => {
      const I = matIdentity(6);
      const A = Array.from({length:6}, (_,i) => Array.from({length:6}, (_,j) => i*6+j+1));
      expect(matMul(I, A)).toEqual(A);
    });
    it('throws on dimension mismatch', () => {
      expect(() => matMul([[1,2]], [[1],[2],[3]])).toThrow();
    });
  });

  describe('matTranspose', () => {
    it('transposes rectangular matrix', () => {
      const A = [[1, 2, 3], [4, 5, 6]];
      expect(matTranspose(A)).toEqual([[1,4],[2,5],[3,6]]);
    });
    it('double-transpose returns original', () => {
      const A = [[1,2],[3,4],[5,6]];
      expect(matTranspose(matTranspose(A))).toEqual(A);
    });
  });

  describe('matInv2x2', () => {
    it('inverts [[1,0],[0,1]] → identity', () => {
      expect(matInv2x2(matIdentity(2))).toEqual(matIdentity(2));
    });
    it('inverts [[2,1],[1,1]] correctly', () => {
      const A = [[2,1],[1,1]];
      const inv = matInv2x2(A);
      const result = matMul(A, inv);
      // Result should be identity (within floating point tolerance)
      expect(result[0][0]).toBeCloseTo(1, 10);
      expect(result[1][1]).toBeCloseTo(1, 10);
      expect(result[0][1]).toBeCloseTo(0, 10);
    });
    it('throws on singular matrix', () => {
      expect(() => matInv2x2([[1,2],[2,4]])).toThrow();
    });
  });

  describe('matInv3x3', () => {
    it('inverts identity → identity', () => {
      const result = matInv3x3(matIdentity(3));
      expect(result[0][0]).toBeCloseTo(1, 10);
    });
    it('A * inv(A) ≈ I for non-singular 3×3', () => {
      const A = [[2,1,0],[1,3,1],[0,1,2]];
      const inv = matInv3x3(A);
      const prod = matMul(A, inv);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
          expect(prod[i][j]).toBeCloseTo(i===j ? 1 : 0, 8);
    });
    it('throws on singular matrix', () => {
      expect(() => matInv3x3([[1,2,3],[2,4,6],[1,2,3]])).toThrow();
    });
  });

  describe('matSymmetrize', () => {
    it('returns symmetric matrix from asymmetric input', () => {
      const A = [[1,2],[3,4]];
      const S = matSymmetrize(A);
      expect(S[0][1]).toBeCloseTo(S[1][0], 10);
    });
  });

  describe('matIsPositiveDefinite', () => {
    it('identifies 2×2 SPD matrix as positive definite', () => {
      expect(matIsPositiveDefinite([[4,1],[1,2]])).toBe(true);
    });
    it('identifies identity as positive definite', () => {
      expect(matIsPositiveDefinite(matIdentity(3))).toBe(true);
    });
    it('identifies near-singular matrix as not positive definite', () => {
      expect(matIsPositiveDefinite([[1e-25, 0],[0, 1e-25]])).toBe(false);
    });
  });
});
```

### Day 2 — MatrixOps GREEN

```typescript
// src/ekf/MatrixOps.ts
export function matMul(A: number[][], B: number[][]): number[][] {
  const rows = A.length;
  const inner = B.length;
  if (A[0].length !== inner) {
    throw new Error(`matMul dimension mismatch: A[${rows}×${A[0].length}] × B[${inner}×${B[0].length}]`);
  }
  const cols = B[0].length;
  const C: number[][] = matZero(rows, cols);
  for (let i = 0; i < rows; i++)
    for (let k = 0; k < inner; k++)
      for (let j = 0; j < cols; j++)
        C[i][j] += A[i][k] * B[k][j];
  return C;
}

export function matAdd(A: number[][], B: number[][]): number[][] {
  return A.map((row, i) => row.map((v, j) => v + B[i][j]));
}

export function matSub(A: number[][], B: number[][]): number[][] {
  return A.map((row, i) => row.map((v, j) => v - B[i][j]));
}

export function matTranspose(A: number[][]): number[][] {
  const rows = A.length, cols = A[0].length;
  const T: number[][] = matZero(cols, rows);
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      T[j][i] = A[i][j];
  return T;
}

export function matScale(A: number[][], s: number): number[][] {
  return A.map(row => row.map(v => v * s));
}

export function matIdentity(n: number): number[][] {
  return Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => i === j ? 1 : 0));
}

export function matZero(rows: number, cols: number): number[][] {
  return Array.from({length: rows}, () => new Array(cols).fill(0));
}

export function matDet2x2(A: number[][]): number {
  return A[0][0] * A[1][1] - A[0][1] * A[1][0];
}

export function matDet3x3(A: number[][]): number {
  return A[0][0] * (A[1][1]*A[2][2] - A[1][2]*A[2][1])
       - A[0][1] * (A[1][0]*A[2][2] - A[1][2]*A[2][0])
       + A[0][2] * (A[1][0]*A[2][1] - A[1][1]*A[2][0]);
}

export function matInv2x2(A: number[][]): number[][] {
  const det = matDet2x2(A);
  if (Math.abs(det) < 1e-14) throw new Error('matInv2x2: singular matrix (det ≈ 0)');
  return matScale([[ A[1][1], -A[0][1]], [-A[1][0],  A[0][0]]], 1 / det);
}

export function matInv3x3(A: number[][]): number[][] {
  const det = matDet3x3(A);
  if (Math.abs(det) < 1e-14) throw new Error('matInv3x3: singular matrix (det ≈ 0)');
  const inv: number[][] = matZero(3, 3);
  inv[0][0] =  (A[1][1]*A[2][2] - A[1][2]*A[2][1]) / det;
  inv[0][1] = -(A[0][1]*A[2][2] - A[0][2]*A[2][1]) / det;
  inv[0][2] =  (A[0][1]*A[1][2] - A[0][2]*A[1][1]) / det;
  inv[1][0] = -(A[1][0]*A[2][2] - A[1][2]*A[2][0]) / det;
  inv[1][1] =  (A[0][0]*A[2][2] - A[0][2]*A[2][0]) / det;
  inv[1][2] = -(A[0][0]*A[1][2] - A[0][2]*A[1][0]) / det;
  inv[2][0] =  (A[1][0]*A[2][1] - A[1][1]*A[2][0]) / det;
  inv[2][1] = -(A[0][0]*A[2][1] - A[0][1]*A[2][0]) / det;
  inv[2][2] =  (A[0][0]*A[1][1] - A[0][1]*A[1][0]) / det;
  return inv;
}

export function matSymmetrize(A: number[][]): number[][] {
  const T = matTranspose(A);
  return matScale(matAdd(A, T), 0.5);
}

export function matIsPositiveDefinite(A: number[][]): boolean {
  // Sylvester criterion: all leading principal minors > threshold
  const threshold = 1e-20;
  if (A.length === 2) return matDet2x2(A) > threshold && A[0][0] > threshold;
  if (A.length === 3) return matDet3x3(A) > threshold
    && matDet2x2([[A[0][0],A[0][1]],[A[1][0],A[1][1]]]) > threshold
    && A[0][0] > threshold;
  // For larger matrices: check all diagonal elements > threshold
  return A.every((row, i) => row[i] > threshold);
}

export function matVecMul(A: number[][], v: number[]): number[] {
  return A.map(row => row.reduce((sum, a, j) => sum + a * v[j], 0));
}

export function vecSub(a: number[], b: number[]): number[] {
  return a.map((v, i) => v - b[i]);
}

export function vecAdd(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + b[i]);
}
```

### Day 3 — EKFInstance TDD RED

```typescript
// src/ekf/__tests__/EKFInstance.test.ts — TDD RED (failing tests)
import { describe, it, expect, beforeEach } from 'vitest';
import { EKFInstance } from '../EKFInstance.js';
import type { Position3D } from '../../types/ekf.types.js';

describe('FR-W5-01: EKF predict step — state propagates, covariance grows', () => {
  let ekf: EKFInstance;
  beforeEach(() => {
    ekf = new EKFInstance({
      maneuverSpectralDensity: 0.1,
      sigmaLatDeg: 0.00005,
      sigmaLonDeg: 0.00005,
      sigmaAltM: 10.0,
    });
    ekf.initialize({ lat: 51.5, lon: -0.1, alt: 100, timestamp: 1000 });
  });

  it('predicts state forward by dt=1.0s using constant velocity', () => {
    const stateBefore = ekf.getState();
    ekf.predict(1.0);
    const stateAfter = ekf.getState();
    // With zero velocity, position should not change (within float precision)
    expect(stateAfter.lat).toBeCloseTo(stateBefore.lat + stateBefore.vLat * 1.0, 10);
    expect(stateAfter.lon).toBeCloseTo(stateBefore.lon + stateBefore.vLon * 1.0, 10);
    expect(stateAfter.alt).toBeCloseTo(stateBefore.alt + stateBefore.vAlt * 1.0, 10);
  });

  it('predict step grows covariance (trace of P increases)', () => {
    const traceBefore = ekf.getCovarianceTrace();
    ekf.predict(1.0);
    const traceAfter = ekf.getCovarianceTrace();
    expect(traceAfter).toBeGreaterThan(traceBefore);
  });

  it('predict with non-zero velocity propagates position correctly', () => {
    ekf.initialize({ lat: 51.5, lon: -0.1, alt: 100, timestamp: 0 });
    ekf.setVelocity(1e-4, 1e-4, -1.0); // moving NE, descending
    ekf.predict(1.0);
    const s = ekf.getState();
    expect(s.lat).toBeCloseTo(51.5 + 1e-4, 8);
    expect(s.lon).toBeCloseTo(-0.1 + 1e-4, 8);
    expect(s.alt).toBeCloseTo(99.0, 6);
  });
});

describe('FR-W5-02: EKF update step — converges toward measurement', () => {
  it('update step reduces position covariance', () => {
    const ekf = new EKFInstance({ maneuverSpectralDensity: 0.1,
      sigmaLatDeg: 0.00005, sigmaLonDeg: 0.00005, sigmaAltM: 10.0 });
    ekf.initialize({ lat: 51.5, lon: -0.1, alt: 100, timestamp: 0 });
    const traceBefore = ekf.getCovarianceTrace();
    const measurement: Position3D = { lat: 51.5002, lon: -0.0998, alt: 102, timestamp: 1000 };
    ekf.update(measurement);
    const traceAfter = ekf.getCovarianceTrace();
    expect(traceAfter).toBeLessThan(traceBefore);
  });

  it('update pulls state toward measurement', () => {
    const ekf = new EKFInstance({ maneuverSpectralDensity: 0.1,
      sigmaLatDeg: 0.00005, sigmaLonDeg: 0.00005, sigmaAltM: 10.0 });
    ekf.initialize({ lat: 51.5, lon: -0.1, alt: 100, timestamp: 0 });
    const measurement: Position3D = { lat: 51.51, lon: -0.09, alt: 110, timestamp: 1000 };
    ekf.update(measurement);
    const s = ekf.getState();
    // State should have moved toward measurement (not necessarily equal — depends on K)
    expect(s.lat).toBeGreaterThan(51.5);
    expect(s.alt).toBeGreaterThan(100);
  });
});

describe('FR-W5-03: EKF covariance positive-definite after 100 iterations', () => {
  it('covariance remains positive-definite after 100 predict+update cycles', () => {
    const ekf = new EKFInstance({ maneuverSpectralDensity: 0.1,
      sigmaLatDeg: 0.00005, sigmaLonDeg: 0.00005, sigmaAltM: 10.0 });
    ekf.initialize({ lat: 51.5, lon: -0.1, alt: 100, timestamp: 0 });
    for (let i = 0; i < 100; i++) {
      ekf.predict(1.0);
      const noise = () => (Math.random() - 0.5) * 0.0001;
      ekf.update({ lat: 51.5 + noise(), lon: -0.1 + noise(), alt: 100 + noise()*100, timestamp: i*1000 });
    }
    expect(ekf.isPositiveDefinite()).toBe(true);
  });
});

describe('FR-W5-11: EKF coast on missing measurement (predict-only)', () => {
  it('coast step runs predict without update', () => {
    const ekf = new EKFInstance({ maneuverSpectralDensity: 0.1,
      sigmaLatDeg: 0.00005, sigmaLonDeg: 0.00005, sigmaAltM: 10.0 });
    ekf.initialize({ lat: 51.5, lon: -0.1, alt: 100, timestamp: 0 });
    ekf.setVelocity(1e-4, 0, 0);
    ekf.coast(2.0); // 2-second coast
    const s = ekf.getState();
    expect(s.lat).toBeCloseTo(51.5 + 2e-4, 8);
  });
});
```

### Day 4-5 — EKFInstance GREEN

```typescript
// src/ekf/EKFInstance.ts
import {
  matMul, matAdd, matTranspose, matScale, matSub,
  matIdentity, matZero, matInv3x3, matSymmetrize,
  matIsPositiveDefinite, matVecMul, vecSub
} from './MatrixOps.js';
import type { EKFState, EKFConfig, Position3D } from '../types/ekf.types.js';

const EPSILON = 1e-9;

export class EKFInstance {
  // State vector: [lat, lon, alt, vLat, vLon, vAlt]
  private x: number[] = new Array(6).fill(0);
  // Covariance matrix: 6×6
  private P: number[][] = matIdentity(6);
  private readonly config: EKFConfig;
  private initialized = false;
  private lastTimestamp = 0;

  constructor(config: EKFConfig) {
    this.config = config;
  }

  initialize(pos: Position3D): void {
    this.x = [pos.lat, pos.lon, pos.alt, 0, 0, 0];
    // Initial covariance: 10× measurement noise
    const sLat2 = (this.config.sigmaLatDeg ** 2) * 10;
    const sLon2 = (this.config.sigmaLonDeg ** 2) * 10;
    const sAlt2 = (this.config.sigmaAltM ** 2) * 10;
    const sV = 1.0; // 1 deg/s or 1 m/s initial velocity uncertainty
    this.P = [
      [sLat2, 0, 0,    0,  0,  0],
      [0, sLon2, 0,    0,  0,  0],
      [0, 0, sAlt2,    0,  0,  0],
      [0, 0, 0,    sV,  0,  0],
      [0, 0, 0,    0,  sV,  0],
      [0, 0, 0,    0,  0,  sV],
    ];
    this.initialized = true;
    this.lastTimestamp = pos.timestamp;
  }

  // For testing: set velocity directly
  setVelocity(vLat: number, vLon: number, vAlt: number): void {
    this.x[3] = vLat; this.x[4] = vLon; this.x[5] = vAlt;
  }

  predict(dt: number): void {
    if (!this.initialized) throw new Error('EKFInstance.predict: not initialized');
    // F = [[I₃, dt*I₃], [0₃, I₃]]
    const F = this._buildF(dt);
    // x_new = F * x
    this.x = matVecMul(F, this.x);
    // P_new = F * P * Fᵀ + Q
    const Ft = matTranspose(F);
    const Q = this._buildQ(dt);
    this.P = matAdd(matMul(matMul(F, this.P), Ft), Q);
    // Symmetrize + epsilon inflate diagonal for numerical stability
    this.P = matSymmetrize(this.P);
    for (let i = 0; i < 6; i++) this.P[i][i] += EPSILON;
  }

  update(measurement: Position3D): void {
    if (!this.initialized) {
      this.initialize(measurement);
      return;
    }
    // H = [I₃  0₃]  (3×6)
    const H = this._buildH();
    // Innovation: y = z - H*x
    const z = [measurement.lat, measurement.lon, measurement.alt];
    const Hx = matVecMul(H, this.x);
    const y = vecSub(z, Hx);
    // Innovation covariance: S = H*P*Hᵀ + R
    const Ht = matTranspose(H);
    const R = this._buildR();
    const S = matAdd(matMul(matMul(H, this.P), Ht), R);
    // Kalman gain: K = P*Hᵀ*S⁻¹
    // S is 3×3 — use matInv3x3
    const Sinv = matInv3x3(S);
    const K = matMul(matMul(this.P, Ht), Sinv);  // 6×3
    // State update: x = x + K*y
    const Ky = matVecMul(K, y);
    this.x = this.x.map((v, i) => v + Ky[i]);
    // Covariance update: P = (I - K*H) * P
    const I6 = matIdentity(6);
    const KH = matMul(K, H);  // 6×6
    const IKH = matSub(I6, KH);
    this.P = matMul(IKH, this.P);
    // Symmetrize + epsilon diagonal
    this.P = matSymmetrize(this.P);
    for (let i = 0; i < 6; i++) this.P[i][i] += EPSILON;
    this.lastTimestamp = measurement.timestamp;
    // Numerical health check
    if (!this.isPositiveDefinite()) {
      console.warn('[EKFInstance] Covariance lost positive-definiteness — reinitializing P');
      this.initialize(measurement);
    }
  }

  coast(dt: number): void {
    this.predict(dt);
    // No measurement update — predict-only (dead-reckoning)
  }

  getState(): EKFState {
    return {
      lat: this.x[0], lon: this.x[1], alt: this.x[2],
      vLat: this.x[3], vLon: this.x[4], vAlt: this.x[5],
      timestamp: this.lastTimestamp,
    };
  }

  getCovarianceTrace(): number {
    return this.P.reduce((sum, row, i) => sum + row[i], 0);
  }

  isPositiveDefinite(): boolean {
    return matIsPositiveDefinite(this.P);
  }

  // F matrix: 6×6 constant-velocity state transition
  private _buildF(dt: number): number[][] {
    const F = matIdentity(6);
    F[0][3] = dt; F[1][4] = dt; F[2][5] = dt;
    return F;
  }

  // Singer maneuver noise model: 3×3 block (repeated for lat,lon,alt)
  private _buildSingerBlock(dt: number): number[][] {
    const q = this.config.maneuverSpectralDensity;
    return [
      [q * (dt**5)/20,   q * (dt**4)/8,   q * (dt**3)/6],
      [q * (dt**4)/8,    q * (dt**3)/3,   q * (dt**2)/2],
      [q * (dt**3)/6,    q * (dt**2)/2,   q * dt       ],
    ];
  }

  // Q: 6×6 block-diagonal [Qlat, Qlon, Qalt] — each axis independent
  private _buildQ(dt: number): number[][] {
    const Q = matZero(6, 6);
    const block = this._buildSingerBlock(dt);
    // Axis indices: lat=[0,3], lon=[1,4], alt=[2,5]
    const axes = [[0,3],[1,4],[2,5]];
    for (const [pos, vel] of axes) {
      Q[pos][pos] = block[0][0];
      Q[pos][vel] = block[0][2];
      Q[vel][pos] = block[2][0];
      Q[vel][vel] = block[2][2];
    }
    return Q;
  }

  // H = [I₃  0₃]: selects position subvector
  private _buildH(): number[][] {
    const H = matZero(3, 6);
    H[0][0] = 1; H[1][1] = 1; H[2][2] = 1;
    return H;
  }

  // Measurement noise R: 3×3 diagonal
  private _buildR(): number[][] {
    const sLat2 = this.config.sigmaLatDeg ** 2;
    const sLon2 = this.config.sigmaLonDeg ** 2;
    const sAlt2 = this.config.sigmaAltM  ** 2;
    return [[sLat2,0,0],[0,sLon2,0],[0,0,sAlt2]];
  }
}
```

### Day 6-7 — P1 integration + commit

- Run: `npx vitest run --coverage` → 35 tests pass, MatrixOps + EKFInstance
- Commit: `feat(w5-p1): EKFInstance + MatrixOps GREEN — 35/35 tests pass`
- Push to main (workers clone from origin/main per CLAUDE.md rule)

---

## Phase 2: PolynomialPredictor + ImpactEstimator (Days 8-14)

### Day 8-9 — PolynomialPredictor TDD RED + GREEN

Key algorithm — least-squares quadratic fit:
```typescript
// src/predictor/PolynomialPredictor.ts (core fit function)

/**
 * Fits y = a₀ + a₁t + a₂t² using normal equations.
 * A = Vandermonde matrix [[1, t_i, t_i²]]
 * Coefficients: a = (AᵀA)⁻¹ Aᵀ y
 * Uses plain 3×3 matrix inversion from MatrixOps.
 */
function fitQuadratic(times: number[], values: number[]): [number, number, number] {
  const n = times.length;
  if (n < 2) throw new Error('Insufficient data for polynomial fit (need ≥2 points)');
  // Normalize times to improve conditioning: t' = t - t[0]
  const t0 = times[0];
  const ts = times.map(t => t - t0);
  // Build Aᵀ A and Aᵀ y (degree=2 → 3×3 system)
  let [s0,s1,s2,s3,s4,sy0,sy1,sy2] = [0,0,0,0,0,0,0,0];
  for (let i = 0; i < n; i++) {
    const t=ts[i], t2=t*t, t3=t2*t, t4=t2*t2;
    s0+=1; s1+=t; s2+=t2; s3+=t3; s4+=t4;
    sy0+=values[i]; sy1+=values[i]*t; sy2+=values[i]*t2;
  }
  const ATA = [[s0,s1,s2],[s1,s2,s3],[s2,s3,s4]];
  const ATy = [sy0, sy1, sy2];
  // Solve using matInv3x3 or fall back to linear if degenerate
  let coeffs: number[];
  try {
    const inv = matInv3x3(ATA);
    coeffs = matVecMul(inv, ATy);
  } catch {
    // Degenerate: fall back to linear fit (2-param)
    const det2 = s0*s2 - s1*s1;
    if (Math.abs(det2) < 1e-14) return [values[0], 0, 0]; // constant
    coeffs = [(s2*sy0-s1*sy1)/det2, (s0*sy1-s1*sy0)/det2, 0];
  }
  return [coeffs[0], coeffs[1], coeffs[2]];
}
```

Confidence decay (tests must verify):
```
lambda = 0.07 (default)
confidence(h) = exp(-0.07 * h)
+1s:  0.932
+2s:  0.869
+3s:  0.811
+5s:  0.704
+10s: 0.496
```

### Day 10-11 — ImpactEstimator TDD RED + GREEN

Impact point calculation:
```typescript
// src/predictor/ImpactEstimator.ts (core estimate function)
estimate(state: EKFState): ImpactEstimate | null {
  const { lat, lon, alt, vLat, vLon, vAlt } = state;
  // Only estimate if descending
  if (vAlt >= 0) return null;
  // Time to impact: t = -alt / vAlt
  const t = -alt / vAlt;
  // Bounds: must be 0.5..300 seconds
  if (t < 0.5 || t > 300) return null;
  // Impact position (linear extrapolation from current state)
  const impactLat = lat + vLat * t;
  const impactLon = lon + vLon * t;
  // Confidence: based on alt and velocity certainty
  // Simple model: confidence degrades with longer time-to-impact
  const confidence = Math.exp(-0.07 * t);
  if (confidence < this.config.confidenceGate) return null;
  return {
    lat: impactLat,
    lon: impactLon,
    timestamp: state.timestamp + t * 1000,
    timeToImpactSeconds: t,
    confidence,
  };
}
```

### Day 12-14 — P2 commit

- Run: `npx vitest run --coverage` → 55 tests pass (P1: 35 + P2: 20)
- Commit: `feat(w5-p2): PolynomialPredictor + ImpactEstimator GREEN — 55/55`

---

## Phase 3: MultiTrackEKFManager + NATS Integration (Days 15-21)

### Day 15-16 — MultiTrackEKFManager TDD RED + GREEN

Key test cases (10 unit tests):
```typescript
describe('FR-W5-10: MultiTrackEKFManager — one EKF per track, dropout at 15s', () => {
  it('creates new EKFInstance on first detection for unknown trackId')
  it('reuses existing EKFInstance on subsequent detections for same trackId')
  it('calls predict+update on each processDetection call')
  it('returns PredictionResult with 5 horizons on each processDetection call')
  it('drops track after lastSeen exceeds dropout threshold')
  it('returns dropped trackIds from dropStale()')
  it('getActiveTracks() returns only non-stale tracks')
  it('coastTrack runs predict-only step without update')
  it('bootstrapFromSupabase initializes EKF for each confirmed track')
  it('handles concurrent tracks without state cross-contamination')
});
```

### Day 17-18 — NATS Consumer Integration

```typescript
// src/nats/NatsClient.ts — NATS JetStream pull consumer
import { connect, JetStreamClient, NatsConnection, StringCodec } from 'nats';

export class NatsClient {
  private conn: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private readonly sc = StringCodec();

  async connect(natsUrl: string): Promise<void> {
    this.conn = await connect({ servers: natsUrl });
    this.js = this.conn.jetstream();
  }

  async createPullConsumer(stream: string, consumer: string, filterSubject: string) {
    const jsm = await this.conn!.jetstreamManager();
    await jsm.consumers.add(stream, {
      durable_name: consumer,
      filter_subject: filterSubject,
      ack_policy: 'explicit',
    }).catch(() => {}); // ignore if already exists
    return this.js!.consumers.get(stream, consumer);
  }

  async publish(subject: string, payload: unknown): Promise<void> {
    await this.js!.publish(subject, this.sc.encode(JSON.stringify(payload)));
  }

  async close(): Promise<void> {
    await this.conn?.drain();
    await this.conn?.close();
  }
}
```

### Day 19-21 — Supabase migrations + integration tests

Write 3 SQL migration files (005, 006, 007).
Write 8 integration tests (mocked NATS + Supabase).

- Run: `npx vitest run --coverage` → 73 tests pass
- Commit: `feat(w5-p3): MultiTrackEKFManager + NATS consumer GREEN — 73/73`

---

## Phase 4: PredictionPublisher + TrackEnrichmentService (Days 22-28)

### Day 22-23 — PredictionPublisher TDD RED + GREEN

NATS publish message schema (locked):
```typescript
// sentinel.predictions.{trackId}
interface PredictionMessage {
  trackId: string;
  timestamp: number;           // Unix ms
  ekfState: EKFState;
  horizons: PredictionHorizon[];
  impactEstimate: ImpactEstimate | null;
  processedAt: number;         // Unix ms (for latency measurement)
}
```

Supabase upsert (batched):
```typescript
// PredictionPublisher.publishToSupabase
const updates = results.map(([trackId, result]) => ({
  id: trackId,
  predicted_trajectory: result.horizons,
  ekf_state: result.ekfState,
  prediction_updated_at: new Date(result.timestamp).toISOString(),
  ekf_covariance_trace: result.covarianceTrace,
}));
await supabase.from('tracks').upsert(updates, { onConflict: 'id' });
```

### Day 24-25 — TrackEnrichmentService orchestration

Main service entry point:
```typescript
// src/service/main.ts
import { TrackEnrichmentService } from './TrackEnrichmentService.js';
import { loadConfig } from './config.js';

const config = loadConfig(); // reads from ENV
const service = new TrackEnrichmentService(config);

process.on('SIGTERM', () => service.stop());
process.on('SIGINT',  () => service.stop());

service.start().catch(err => {
  console.error('[main] Service failed to start:', err);
  process.exit(1);
});
```

### Day 26-27 — Edge Functions

```typescript
// supabase/functions/get-track-predictions/index.ts
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
  const url = new URL(req.url);
  const trackId = url.searchParams.get('trackId');
  if (!trackId) return new Response('Missing trackId', { status: 400 });

  const authHeader = req.headers.get('Authorization');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader! } } }
  );

  const { data, error } = await supabase
    .from('tracks')
    .select('id, ekf_state, predicted_trajectory, prediction_updated_at')
    .eq('id', trackId)
    .single();

  if (error || !data) return new Response('Not Found', { status: 404 });
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  });
});
```

### Day 28 — P4 commit

- Run: `npx vitest run --coverage` → 80 tests pass
- Commit: `feat(w5-p4): PredictionPublisher + TrackEnrichmentService GREEN — 80/80`

---

## Phase 5: systemd Deploy + E2E + W4 Integration (Days 29-35)

### Day 29-30 — systemd unit file

```ini
# infra/systemd/apex-sentinel-ekf.service
[Unit]
Description=APEX Sentinel EKF Trajectory Prediction Service
After=network.target nats.service
Requires=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/apex-sentinel/ekf
EnvironmentFile=/etc/apex-sentinel/ekf.env
# timeout 300 wrapper is MANDATORY per project rules (prevents eternal hang)
ExecStart=timeout 300 node --experimental-vm-modules dist/service/main.js
Restart=on-failure
# NOT Restart=always — restart storm prevention (CLAUDE.md non-negotiable rule #2)
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=apex-sentinel-ekf
# Memory limit: 256MB (EKF state is tiny; limit prevents OOM on shared VM)
MemoryLimit=256M
# Kill timeout: give 30s for graceful SIGTERM drain
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

### Day 31-32 — E2E tests (docker-compose)

```typescript
// tests/e2e/ekf-e2e.test.ts
describe('W5 E2E: Detection → EKF → NATS prediction', () => {
  it('publishes prediction within 200ms of detection injection')
  it('Supabase tracks.predicted_trajectory updated after detection')
  it('handles 10 simultaneous tracks without cross-contamination')
  it('stale track dropped after 15s coasting')
  it('/health returns ok after 60s steady-state operation')
});
```

### Day 33-34 — W4 CesiumJS polyline integration

```typescript
// packages/dashboard/src/lib/nats-prediction-subscriber.ts (W4 dashboard)
// Subscribe to sentinel.predictions.> and update TrackStore
const sub = nc.subscribe('sentinel.predictions.*');
for await (const msg of sub) {
  const prediction = JSON.parse(sc.decode(msg.data)) as PredictionMessage;
  useTrackStore.getState().setPrediction(prediction.trackId, prediction);
}

// CesiumJS polyline rendering
// packages/dashboard/src/components/globe/PredictionPolyline.tsx
// For each track with prediction: render Cesium.PolylineGraphics
// Points: [currentPosition, +1s, +2s, +3s, +5s, +10s]
// Alpha: lerp(1.0 → 0.3) based on confidence
// Color: same as threat class marker, 30% alpha fade
```

### Day 35 — Final verification + LKGC

- Run full test suite: `npx vitest run --coverage` → ≥85 tests pass
- Run E2E: `docker-compose -f infra/docker-compose.test.yml up -d && npx vitest run tests/e2e/`
- Deploy to fortress: follow DEPLOY_CHECKLIST.md
- Capture LKGC: `./scripts/capture-lkgc.sh post-deploy`
- Run: `./wave-formation.sh complete W5`
- Commit: `feat(w5-complete): W5 COMPLETE — EKF microservice deployed, 482 cumulative tests`
- Tag: `git tag v5.0.0-w5-lkgc && git push origin v5.0.0-w5-lkgc`

---

## Dependency Graph

```
MatrixOps ──────────────────────┐
                                 ↓
ekf.types ──── EKFInstance ──── MultiTrackEKFManager ──── TrackEnrichmentService
                                         ↓                        ↓
                              PolynomialPredictor         NatsClient (consumer)
                                         ↓                        ↓
                               ImpactEstimator         PredictionPublisher
                                         ↓                   ↙     ↘
                               PredictionResult      NATS   Supabase
```

---

## TypeScript Types Reference

```typescript
// src/types/ekf.types.ts

export interface EKFConfig {
  maneuverSpectralDensity: number;  // q_c in m²/s³ (default: 0.1)
  sigmaLatDeg: number;              // TdoaCorrelator lat noise (default: 0.00005)
  sigmaLonDeg: number;              // TdoaCorrelator lon noise (default: 0.00005)
  sigmaAltM: number;                // TdoaCorrelator alt noise m (default: 10.0)
  trackDropoutSeconds?: number;     // Stale track timeout (default: 15)
  confidenceGate?: number;          // Min confidence to publish impact (default: 0.4)
  predictionLambda?: number;        // Confidence decay rate (default: 0.07)
}

export interface EKFState {
  lat: number;        // decimal degrees WGS84
  lon: number;        // decimal degrees WGS84
  alt: number;        // metres AMSL
  vLat: number;       // degrees/second
  vLon: number;       // degrees/second
  vAlt: number;       // metres/second
  timestamp: number;  // Unix milliseconds
}

export interface Position3D {
  lat: number;
  lon: number;
  alt: number;
  timestamp: number;
}

export interface PredictionHorizon {
  lat: number;
  lon: number;
  alt: number;
  timestamp: number;       // Unix ms (now + horizonSeconds * 1000)
  horizonSeconds: number;  // 1, 2, 3, 5, or 10
  confidence: number;      // 0..1 (exponential decay)
}

export interface ImpactEstimate {
  lat: number;
  lon: number;
  timestamp: number;           // Unix ms of estimated impact
  timeToImpactSeconds: number;
  confidence: number;
}

export interface PredictionResult {
  trackId: string;
  horizons: PredictionHorizon[];  // 5 entries, or empty if insufficient data
  impactEstimate: ImpactEstimate | null;
  ekfState: EKFState;
  covarianceTrace: number;
  timestamp: number;  // Unix ms of this prediction
}

export interface DetectionMessage {
  trackId: string;
  lat: number;
  lon: number;
  alt: number;
  timestamp: number;  // Unix ms
  nodeIds: string[];
  correlationScore: number;
}

export interface ConfirmedTrack {
  id: string;
  lat: number;
  lon: number;
  alt: number;
  threatClass: string;
  lastSeen: number;   // Unix ms
  status: 'confirmed' | 'tentative' | 'lost';
}
```
