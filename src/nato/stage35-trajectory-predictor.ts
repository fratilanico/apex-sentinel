// APEX-SENTINEL — W10 Stage35TrajectoryPredictor
// FR-W10-03 | src/nato/stage35-trajectory-predictor.ts
// EKF-based trajectory prediction for Stage 3.5

// ── Types ────────────────────────────────────────────────────────────────────

export interface PositionFix {
  lat: number;       // degrees
  lon: number;       // degrees
  altMeters: number;
  ts: number;        // epoch ms
}

export interface TrajectoryPrediction {
  lat: number;
  lon: number;
  altM: number;
  confidenceRadius_m: number;
  tSeconds: number;
}

// ── Matrix helpers (6x6 for EKF) ─────────────────────────────────────────────

type Mat = number[][];

function matZero(n: number, m: number): Mat {
  return Array.from({ length: n }, () => Array(m).fill(0));
}

function matIdentity(n: number): Mat {
  const I = matZero(n, n);
  for (let i = 0; i < n; i++) I[i][i] = 1;
  return I;
}

function matMul(A: Mat, B: Mat): Mat {
  const rows = A.length;
  const cols = B[0].length;
  const inner = B.length;
  const C = matZero(rows, cols);
  for (let i = 0; i < rows; i++)
    for (let k = 0; k < inner; k++)
      if (A[i][k] !== 0)
        for (let j = 0; j < cols; j++)
          C[i][j] += A[i][k] * B[k][j];
  return C;
}

function matAdd(A: Mat, B: Mat): Mat {
  return A.map((row, i) => row.map((v, j) => v + B[i][j]));
}

function matSub(A: Mat, B: Mat): Mat {
  return A.map((row, i) => row.map((v, j) => v - B[i][j]));
}

function matTranspose(A: Mat): Mat {
  const rows = A.length;
  const cols = A[0].length;
  const T = matZero(cols, rows);
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      T[j][i] = A[i][j];
  return T;
}

/** Invert a 3x3 matrix via Cramer's rule */
function mat3x3Inv(m: Mat): Mat {
  const a = m[0][0], b = m[0][1], c = m[0][2];
  const d = m[1][0], e = m[1][1], f = m[1][2];
  const g = m[2][0], h = m[2][1], k = m[2][2];
  const det = a*(e*k-f*h) - b*(d*k-f*g) + c*(d*h-e*g);
  if (Math.abs(det) < 1e-15) {
    // Singular — return scaled identity as fallback
    return matIdentity(3).map(row => row.map(v => v * 1e6));
  }
  const inv = [
    [(e*k-f*h)/det, (c*h-b*k)/det, (b*f-c*e)/det],
    [(f*g-d*k)/det, (a*k-c*g)/det, (c*d-a*f)/det],
    [(d*h-e*g)/det, (b*g-a*h)/det, (a*e-b*d)/det],
  ];
  return inv;
}

// ── EKF State ────────────────────────────────────────────────────────────────

// State: [lat, lon, alt, vLat, vLon, vAlt] (6-dimensional)
const N = 6;

// Process noise (position: 1e-8, velocity: 1e-10 deg²/s²)
const Q_POS = 1e-8;
const Q_VEL = 1e-10;

// Measurement noise (GPS accuracy ~5m = ~4.5e-5 deg)
const R_POS = (4.5e-5) ** 2;

// H matrix: measures position (lat, lon, alt) only
const H: Mat = [
  [1, 0, 0, 0, 0, 0],
  [0, 1, 0, 0, 0, 0],
  [0, 0, 1, 0, 0, 0],
];

// ── Stage35TrajectoryPredictor ────────────────────────────────────────────────

export class Stage35TrajectoryPredictor {
  private x: number[] = [0, 0, 0, 0, 0, 0]; // state
  private P: Mat = matIdentity(N).map(row => row.map(v => v * 1.0)); // covariance
  private lastTs: number | null = null;
  private fixCount = 0;
  private initialized = false;

  /**
   * Feed a new position fix into the EKF.
   */
  update(fix: PositionFix): void {
    if (!this.initialized) {
      // Initialize state with first fix
      this.x = [fix.lat, fix.lon, fix.altMeters, 0, 0, 0];
      this.P = matIdentity(N).map((row, i) => row.map((v, j) => {
        if (i !== j) return 0;
        return i < 3 ? R_POS * 100 : 1e-6; // large initial velocity uncertainty
      }));
      this.lastTs = fix.ts;
      this.initialized = true;
      this.fixCount = 1;
      return;
    }

    const dt = Math.max((fix.ts - (this.lastTs ?? fix.ts)) / 1000, 0.001); // seconds
    this.lastTs = fix.ts;

    // Build F (transition matrix)
    const F = matIdentity(N);
    F[0][3] = dt;
    F[1][4] = dt;
    F[2][5] = dt;

    // Build Q (process noise)
    const Q = matZero(N, N);
    const dt2 = dt * dt;
    const dt3 = dt2 * dt;
    const dt4 = dt3 * dt;
    // Position-velocity coupling
    Q[0][0] = Q_POS * dt4 / 4; Q[0][3] = Q_POS * dt3 / 2;
    Q[1][1] = Q_POS * dt4 / 4; Q[1][4] = Q_POS * dt3 / 2;
    Q[2][2] = Q_POS * dt4 / 4; Q[2][5] = Q_POS * dt3 / 2;
    Q[3][0] = Q_POS * dt3 / 2; Q[3][3] = Q_VEL * dt2;
    Q[4][1] = Q_POS * dt3 / 2; Q[4][4] = Q_VEL * dt2;
    Q[5][2] = Q_POS * dt3 / 2; Q[5][5] = Q_VEL * dt2;

    // Predict
    const xVec = this.x;
    const xPred = [
      xVec[0] + xVec[3] * dt,
      xVec[1] + xVec[4] * dt,
      xVec[2] + xVec[5] * dt,
      xVec[3],
      xVec[4],
      xVec[5],
    ];
    const FP = matMul(F, this.P);
    const FPFt = matMul(FP, matTranspose(F));
    const PPred = matAdd(FPFt, Q);

    // Update (measurement)
    const R: Mat = [
      [R_POS, 0, 0],
      [0, R_POS, 0],
      [0, 0, R_POS * 100], // altitude less precise
    ];

    const z = [fix.lat, fix.lon, fix.altMeters];
    const HPPred = matMul(H, PPred);
    const HPPredHt = matMul(HPPred, matTranspose(H));
    const S = matAdd(HPPredHt, R); // 3x3
    const Sinv = mat3x3Inv(S);
    const PHt = matMul(PPred, matTranspose(H));
    const K = matMul(PHt, Sinv); // 6x3 Kalman gain

    // Innovation
    const innov = [
      z[0] - (H[0][0] * xPred[0]),
      z[1] - (H[1][1] * xPred[1]),
      z[2] - (H[2][2] * xPred[2]),
    ];

    // State update
    const xNew = xPred.slice();
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < 3; j++) {
        xNew[i] += K[i][j] * innov[j];
      }
    }

    // Covariance update: P = (I - KH) * PPred
    const KH = matMul(K, H);
    const IKH = matSub(matIdentity(N), KH);
    const PNew = matMul(IKH, PPred);

    this.x = xNew;
    this.P = PNew;
    this.fixCount++;
  }

  /**
   * Predict intercept points at given time horizons (seconds).
   * Default: [30, 60, 120].
   */
  predict(horizons: number[] = [30, 60, 120]): TrajectoryPrediction[] {
    if (!this.initialized) {
      // No data — return zeros with max uncertainty
      return horizons.map(t => ({
        lat: 0, lon: 0, altM: 0,
        confidenceRadius_m: 5000,
        tSeconds: t,
      }));
    }

    return horizons.map(tSec => {
      const lat = this.x[0] + this.x[3] * tSec;
      const lon = this.x[1] + this.x[4] * tSec;
      const altM = this.x[2] + this.x[5] * tSec;

      // Confidence radius: from position covariance + extrapolation uncertainty
      const sigmaLat = Math.sqrt(Math.max(0, this.P[0][0]));
      const sigmaLon = Math.sqrt(Math.max(0, this.P[1][1]));
      const sigmaPos = Math.sqrt(sigmaLat ** 2 + sigmaLon ** 2);

      // Extrapolation uncertainty grows with time
      const extrapolationNoise = Math.sqrt(Q_VEL) * tSec;
      const totalSigmaDeg = sigmaPos + extrapolationNoise;

      // Convert degrees to meters (approximate at 45°N)
      const DEG_TO_M = 111000;
      let radius = totalSigmaDeg * DEG_TO_M;

      // Inflate for low fix count (not yet converged)
      if (this.fixCount < 3) {
        radius = Math.max(radius, 1000);
      }

      // Clamp to practical bounds
      radius = Math.max(50, Math.min(5000, radius));

      return { lat, lon, altM, confidenceRadius_m: radius, tSeconds: tSec };
    });
  }

  reset(): void {
    this.x = [0, 0, 0, 0, 0, 0];
    this.P = matIdentity(N);
    this.lastTs = null;
    this.fixCount = 0;
    this.initialized = false;
  }
}
