// APEX-SENTINEL — Matrix Operations (pure, no external deps)
// Used by EKFInstance and PolynomialPredictor

/** General N×M matrix multiplication */
export function matMul(A: number[][], B: number[][]): number[][] {
  const rows = A.length;
  const cols = B[0].length;
  const inner = B.length;
  const C: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      for (let k = 0; k < inner; k++)
        C[i][j] += A[i][k] * B[k][j];
  return C;
}

/** Matrix transpose */
export function transpose(A: number[][]): number[][] {
  const rows = A.length;
  const cols = A[0].length;
  const T: number[][] = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      T[j][i] = A[i][j];
  return T;
}

/** Element-wise addition of two same-dimension matrices */
export function matAdd(A: number[][], B: number[][]): number[][] {
  return A.map((row, i) => row.map((v, j) => v + B[i][j]));
}

/** Symmetrize: P = (P + Pᵀ) / 2 */
export function symmetrize(P: number[][]): number[][] {
  const n = P.length;
  const S: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      S[i][j] = (P[i][j] + P[j][i]) / 2;
  return S;
}

/** Epsilon inflation: add eps to all diagonal elements */
export function epsilonInflate(P: number[][], eps = 1e-9): number[][] {
  const n = P.length;
  const out = P.map((row) => [...row]);
  for (let i = 0; i < n; i++) out[i][i] += eps;
  return out;
}

/** 3×3 determinant */
export function det3x3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

/** Analytical 3×3 matrix inverse via cofactors */
export function matInv3x3(m: number[][]): number[][] {
  const det = det3x3(m);
  if (Math.abs(det) < 1e-20) throw new Error('SINGULAR_MATRIX_3x3');
  const inv = 1 / det;
  return [
    [
      (m[1][1] * m[2][2] - m[1][2] * m[2][1]) * inv,
      (m[0][2] * m[2][1] - m[0][1] * m[2][2]) * inv,
      (m[0][1] * m[1][2] - m[0][2] * m[1][1]) * inv,
    ],
    [
      (m[1][2] * m[2][0] - m[1][0] * m[2][2]) * inv,
      (m[0][0] * m[2][2] - m[0][2] * m[2][0]) * inv,
      (m[0][2] * m[1][0] - m[0][0] * m[1][2]) * inv,
    ],
    [
      (m[1][0] * m[2][1] - m[1][1] * m[2][0]) * inv,
      (m[0][1] * m[2][0] - m[0][0] * m[2][1]) * inv,
      (m[0][0] * m[1][1] - m[0][1] * m[1][0]) * inv,
    ],
  ];
}

/**
 * Fit quadratic y = a₂*t² + a₁*t + a₀ to N points via normal equations.
 * Returns [a₂, a₁, a₀].
 * N < 2: returns [0, 0, 0].
 * N = 2: falls back to linear (a₂ = 0).
 */
export function fitQuadratic(
  times: number[],
  values: number[]
): [number, number, number] {
  const n = times.length;
  if (n < 2) return [0, 0, values[0] ?? 0];

  if (n === 2) {
    const dt = times[1] - times[0];
    const slope = dt === 0 ? 0 : (values[1] - values[0]) / dt;
    const intercept = values[0] - slope * times[0];
    return [0, slope, intercept];
  }

  // Build X^T * X (3×3) and X^T * y (3×1)
  let s0 = n,
    s1 = 0,
    s2 = 0,
    s3 = 0,
    s4 = 0;
  let sy0 = 0,
    sy1 = 0,
    sy2 = 0;

  for (let i = 0; i < n; i++) {
    const t = times[i];
    const t2 = t * t;
    const t3 = t2 * t;
    const t4 = t2 * t2;
    const y = values[i];
    s1 += t;
    s2 += t2;
    s3 += t3;
    s4 += t4;
    sy0 += y;
    sy1 += t * y;
    sy2 += t2 * y;
  }

  const XTX: number[][] = [
    [s4, s3, s2],
    [s3, s2, s1],
    [s2, s1, s0],
  ];
  const XTy = [sy2, sy1, sy0];

  let inv: number[][];
  try {
    inv = matInv3x3(XTX);
  } catch {
    // Fallback to linear if normal equations are singular
    const dt = times[n - 1] - times[0];
    const slope = dt === 0 ? 0 : (values[n - 1] - values[0]) / dt;
    const intercept = values[0] - slope * times[0];
    return [0, slope, intercept];
  }

  const coeffs = inv.map((row) =>
    row.reduce((sum, v, j) => sum + v * XTy[j], 0)
  );
  return [coeffs[0], coeffs[1], coeffs[2]];
}

/** Evaluate quadratic a₂*t² + a₁*t + a₀ at time t */
export function evalQuadratic(
  coeffs: [number, number, number],
  t: number
): number {
  return coeffs[0] * t * t + coeffs[1] * t + coeffs[2];
}
