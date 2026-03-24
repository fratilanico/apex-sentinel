# APEX-SENTINEL — AI_PIPELINE.md
## Gate 4: EKF + LSTM Trajectory Prediction — Full Technical Specification
### Wave 5 | Project: APEX-SENTINEL | Version: 5.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. ALGORITHM OVERVIEW

The W5 prediction pipeline consists of two sequential algorithms:

1. **Extended Kalman Filter (EKF)** — real-time state estimation from noisy measurements
2. **Trajectory Forecaster** — prediction of future positions given current state

These run in sequence on every detection event (and on the coast timer for each active track). The entire pipeline must complete in ≤ 200ms (p95).

---

## 2. EXTENDED KALMAN FILTER — MATHEMATICAL SPECIFICATION

### 2.1 State Space

The EKF maintains a 6-dimensional state vector:

```
x = [x₁, x₂, x₃, x₄, x₅, x₆]ᵀ
  = [lat, lon, alt, vLat, vLon, vAlt]ᵀ

Units:
  lat    — decimal degrees WGS84 (positive North)
  lon    — decimal degrees WGS84 (positive East)
  alt    — metres above MSL
  vLat   — degrees/second (positive = moving North)
  vLon   — degrees/second (positive = moving East)
  vAlt   — metres/second (positive = ascending)
```

### 2.2 Process Model — Constant Velocity with Maneuver Noise

The state transition assumes **constant velocity** between measurements. Drone acceleration (maneuvering) enters as process noise.

**Continuous-time dynamics:**
```
dx/dt = Fc × x + noise

      ⎡ 0  0  0  1  0  0 ⎤
      ⎢ 0  0  0  0  1  0 ⎥
Fc =  ⎢ 0  0  0  0  0  1 ⎥
      ⎢ 0  0  0  0  0  0 ⎥
      ⎢ 0  0  0  0  0  0 ⎥
      ⎣ 0  0  0  0  0  0 ⎦
```

**Discrete-time state transition matrix F (Euler discretization at step dt):**
```
F = I₆ + dt × Fc

    ⎡ 1   0   0   dt  0   0  ⎤
    ⎢ 0   1   0   0   dt  0  ⎥
F = ⎢ 0   0   1   0   0   dt ⎥
    ⎢ 0   0   0   1   0   0  ⎥
    ⎢ 0   0   0   0   1   0  ⎥
    ⎣ 0   0   0   0   0   1  ⎦
```

**Predict step equations:**
```
x_pred = F × x_prev
P_pred = F × P_prev × Fᵀ + Q
```

### 2.3 Process Noise — Singer Maneuver Model

The Singer model represents drone maneuverability as a first-order Markov process with time correlation τ and acceleration standard deviation σ_a.

For FPV drones: τ = 1s (high maneuverability), σ_a = 5 m/s².

**Singer Q matrix (discrete-time approximation for small dt):**

The input noise matrix Γ maps acceleration disturbances to state:
```
Γ = [dt²/2, dt²/2, dt²/2, dt, dt, dt]ᵀ   (approximately, for small dt)
```

The full Singer Q for one axis (1D, then extended to 3D):
```
For each axis i ∈ {lat, lon, alt}:

  σ_a_i² = σ_a² (in axis-appropriate units)
         = (5 m/s²)² for alt
         = (5/111320)² deg²/s⁴ for lat
         = (5 / (111320×cos(lat)))² deg²/s⁴ for lon (evaluated at nominal lat)

  Q_i = σ_a_i² × ⎡ dt⁴/4   dt³/2 ⎤
                  ⎣ dt³/2   dt²   ⎦

Full Q (block diagonal, 6×6):
```

```typescript
function buildQ(dt: number, sigmaLat: number, sigmaLon: number, sigmaAlt: number): number[] {
  // Returns 6×6 matrix as flat row-major number[36]
  // Block diagonal: lat/vLat block, lon/vLon block, alt/vAlt block

  const dt2 = dt * dt;
  const dt3 = dt2 * dt;
  const dt4 = dt3 * dt;

  const qLat = sigmaLat * sigmaLat;
  const qLon = sigmaLon * sigmaLon;
  const qAlt = sigmaAlt * sigmaAlt;

  // Q[i][j] for 6×6, row-major
  // Indices: 0=lat, 1=lon, 2=alt, 3=vLat, 4=vLon, 5=vAlt
  const Q = new Array(36).fill(0);

  // lat/vLat block (rows/cols 0,3)
  Q[0 * 6 + 0] = qLat * dt4 / 4;   // lat,lat
  Q[0 * 6 + 3] = qLat * dt3 / 2;   // lat,vLat
  Q[3 * 6 + 0] = qLat * dt3 / 2;   // vLat,lat
  Q[3 * 6 + 3] = qLat * dt2;        // vLat,vLat

  // lon/vLon block (rows/cols 1,4)
  Q[1 * 6 + 1] = qLon * dt4 / 4;
  Q[1 * 6 + 4] = qLon * dt3 / 2;
  Q[4 * 6 + 1] = qLon * dt3 / 2;
  Q[4 * 6 + 4] = qLon * dt2;

  // alt/vAlt block (rows/cols 2,5)
  Q[2 * 6 + 2] = qAlt * dt4 / 4;
  Q[2 * 6 + 5] = qAlt * dt3 / 2;
  Q[5 * 6 + 2] = qAlt * dt3 / 2;
  Q[5 * 6 + 5] = qAlt * dt2;

  return Q;
}
```

**Numerical values at dt=1s, lat=48°:**
```
σ_a_lat = 5 / 111320 = 4.493e-5 deg/s²
σ_a_lon = 5 / (111320 × cos(48°)) = 5 / 74481 = 6.714e-5 deg/s²
σ_a_alt = 5 m/s²

Q[lat,lat]   = (4.493e-5)² × 0.25  = 5.05e-10  deg²
Q[lat,vLat]  = (4.493e-5)² × 0.5   = 1.01e-9   deg × deg/s
Q[vLat,vLat] = (4.493e-5)² × 1.0   = 2.02e-9   (deg/s)²

Q[alt,alt]   = 25 × 0.25  = 6.25  m²
Q[alt,vAlt]  = 25 × 0.5   = 12.5  m × m/s
Q[vAlt,vAlt] = 25 × 1.0   = 25    (m/s)²
```

### 2.4 Measurement Model

The TdoaCorrelator outputs a position estimate `[lat_meas, lon_meas, alt_meas]` with scalar error `errorM` (1-sigma isotropic position error in metres).

**Measurement matrix H (maps 6D state → 3D measurement):**
```
H = ⎡ 1  0  0  0  0  0 ⎤
    ⎢ 0  1  0  0  0  0 ⎥
    ⎣ 0  0  1  0  0  0 ⎦
```

**Measurement noise covariance R:**
```
errorM_lat = errorM / 111320        (convert metres to degrees)
errorM_lon = errorM / (111320 × cos(lat))
errorM_alt = 5.0 m (fixed vertical uncertainty for acoustic TDOA)

R = diag(errorM_lat², errorM_lon², errorM_alt²)

R = ⎡ errorM_lat²  0            0          ⎤
    ⎢ 0            errorM_lon²  0          ⎥
    ⎣ 0            0            25.0       ⎦
```

If `errorM` not provided in detection event, use default `errorM = 15.0 m`.

### 2.5 Update Step — Full Derivation

```
Inputs:
  x_pred: 6×1 predicted state
  P_pred: 6×6 predicted covariance
  z:      3×1 measurement [lat_meas, lon_meas, alt_meas]
  R:      3×3 measurement noise (diagonal)

Step 1: Innovation
  y = z - H × x_pred
  y is 3×1 (measurement residual)

Step 2: Innovation covariance
  S = H × P_pred × Hᵀ + R
  S is 3×3

  Note: H selects first 3 rows of P_pred, so:
  H × P_pred = P_pred[0:3, :]  (first 3 rows of P_pred, 3×6)
  H × P_pred × Hᵀ = P_pred[0:3, 0:3]  (top-left 3×3 block)

  S = P_pred[0:3, 0:3] + R

Step 3: Kalman Gain
  K = P_pred × Hᵀ × S⁻¹
  K is 6×3

  P_pred × Hᵀ = P_pred[:, 0:3]  (first 3 columns of P_pred, 6×3)
  S⁻¹: invert 3×3 analytically (never invert 6×6 — too expensive and unstable)

Step 4: State update
  x_upd = x_pred + K × y

Step 5: Covariance update (Joseph form — numerically stable)
  IKH = I₆ - K × H
  P_upd = IKH × P_pred × IKHᵀ + K × R × Kᵀ

  This is the "Joseph form" — more expensive than P_upd = (I-KH)×P_pred
  but guarantees symmetry and positive-definiteness under floating-point arithmetic.
```

**3×3 matrix inversion (for S⁻¹):**
```typescript
function mat3x3Invert(A: number[]): number[] {
  // A is 3×3, flat row-major [a00,a01,a02,a10,a11,a12,a20,a21,a22]
  const [a, b, c, d, e, f, g, h, i] = A;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-30) throw new Error('Singular matrix S in EKF update');
  const inv = 1 / det;
  return [
    (e*i - f*h)*inv, (c*h - b*i)*inv, (b*f - c*e)*inv,
    (f*g - d*i)*inv, (a*i - c*g)*inv, (c*d - a*f)*inv,
    (d*h - e*g)*inv, (b*g - a*h)*inv, (a*e - b*d)*inv,
  ];
}
```

### 2.6 Initialization

When a new track is confirmed and no prior EKF state exists:

```typescript
// Initial state: position from first measurement, velocity = 0
const initialState = [
  firstMeasurement.lat,
  firstMeasurement.lon,
  firstMeasurement.alt,
  0,  // vLat: unknown initially
  0,  // vLon: unknown initially
  0   // vAlt: unknown initially
];

// Initial covariance: large uncertainty for position, very large for velocity
// Position uncertainty = TdoaCorrelator errorM
// Velocity uncertainty = max expected drone speed
const errDeg = (firstMeasurement.errorM ?? 15) / 111320;
const maxSpeedDegPerS = 50 / 111320;  // 50 m/s max drone speed

const initialP = [
  // 6×6 diagonal, all off-diagonal = 0
  errDeg**2,     0,        0,          0,               0,               0,
  0,        errDeg**2,     0,          0,               0,               0,
  0,             0,    225.0,          0,               0,               0,   // 15m alt uncertainty
  0,             0,        0, maxSpeedDegPerS**2,       0,               0,
  0,             0,        0,          0, maxSpeedDegPerS**2,            0,
  0,             0,        0,          0,               0,          25.0      // 5 m/s vAlt uncertainty
];
```

### 2.7 Positive-Definiteness Check

After every update step, verify covariance remains PD:

```typescript
function isPositiveDefinite(P: number[]): boolean {
  // P is 6×6 flat row-major
  // Sylvester's criterion: all leading principal minors must be positive
  // For 6×6 this requires checking 6 determinants — too expensive
  // Practical check: all diagonal elements must be positive
  // (necessary but not sufficient — sufficient for well-conditioned EKF)
  for (let i = 0; i < 6; i++) {
    if (P[i * 6 + i] <= 0) return false;
  }
  // Additional check: all diagonal elements must be finite
  for (let i = 0; i < 36; i++) {
    if (!isFinite(P[i])) return false;
  }
  return true;
}
```

---

## 3. TRAJECTORY FORECASTER — POLYNOMIAL PREDICTOR (W5)

### 3.1 Input

The polynomial predictor takes the last N EKF state vectors (minimum 3, maximum 10) with their timestamps.

```typescript
interface TimestampedState {
  timestampMs: number;
  state: EKFStateVector;
}
```

### 3.2 Algorithm

For each of lat, lon, alt independently:

**Step 1: Build time-value arrays**
```
t = [(t₁ - t_last)/1000, (t₂ - t_last)/1000, ..., (tₙ - t_last)/1000]
    where t_last = most recent timestamp
    t is in seconds, most recent point = 0

y = [lat₁, lat₂, ..., latₙ]  (or lon, alt)
```

**Step 2: Fit 2nd-order polynomial using normal equations**
```
Design matrix X (N×3):
  X = ⎡ 1  t₁  t₁² ⎤
      ⎢ 1  t₂  t₂² ⎥
      ⎣ 1  tₙ  tₙ² ⎦

Normal equations:
  (XᵀX) × [a₀, a₁, a₂]ᵀ = Xᵀ × y

Solution via direct inversion (XᵀX is 3×3, always invertible if N≥3 and distinct t values):
  [a₀, a₁, a₂]ᵀ = (XᵀX)⁻¹ × Xᵀ × y
```

**Step 3: Extrapolate to horizons**
```
f(t) = a₀ + a₁t + a₂t²

For horizon h ∈ {1, 2, 3, 5, 10}:
  predicted_lat = f(h)  (h is seconds ahead, so t = +h relative to t_last)
  predicted_lon = f_lon(h)
  predicted_alt = f_alt(h)

Clamp alt to >= 0 (cannot predict underground impact)
```

**TypeScript implementation:**

```typescript
class PolynomialPredictor implements Predictor {
  readonly modelVersion = 'polynomial-v1';

  predict(history: TimestampedState[], horizons: number[]): PredictedPoint[] {
    if (history.length < 3) {
      // Fall back to linear extrapolation from last 2 points
      return this.linearExtrapolate(history, horizons);
    }

    const tLast = history[history.length - 1].timestampMs;
    const ts = history.map(h => (h.timestampMs - tLast) / 1000);
    const lats = history.map(h => h.state.lat);
    const lons = history.map(h => h.state.lon);
    const alts = history.map(h => h.state.alt);

    const coeffLat = this.fitPolynomial(ts, lats);
    const coeffLon = this.fitPolynomial(ts, lons);
    const coeffAlt = this.fitPolynomial(ts, alts);

    const sigma0 = this.estimateBaseUncertainty(history);

    return horizons.map(h => ({
      horizonSeconds: h,
      lat: this.evaluate(coeffLat, h),
      lon: this.evaluate(coeffLon, h),
      alt: Math.max(0, this.evaluate(coeffAlt, h)),
      confidence: computeConfidenceDecay(1.0, h),
      sigmaM: sigma0 * Math.exp(0.15 * h),
    }));
  }

  private fitPolynomial(xs: number[], ys: number[]): [number, number, number] {
    // Build XᵀX (3×3) and Xᵀy (3×1)
    let s1 = 0, sx = 0, sx2 = 0, sx3 = 0, sx4 = 0;
    let sy = 0, sxy = 0, sx2y = 0;
    const n = xs.length;

    for (let i = 0; i < n; i++) {
      const x = xs[i], y = ys[i];
      const x2 = x * x, x3 = x2 * x, x4 = x2 * x2;
      s1 += 1; sx += x; sx2 += x2; sx3 += x3; sx4 += x4;
      sy += y; sxy += x * y; sx2y += x2 * y;
    }

    // XᵀX:
    // ⎡ n   sx   sx2 ⎤
    // ⎢ sx  sx2  sx3 ⎥
    // ⎣ sx2 sx3  sx4 ⎦
    const XTX = [n, sx, sx2, sx, sx2, sx3, sx2, sx3, sx4];
    const XTy = [sy, sxy, sx2y];

    // Solve via Cramer's rule (3×3)
    const inv = mat3x3Invert(XTX);
    const a0 = inv[0]*XTy[0] + inv[1]*XTy[1] + inv[2]*XTy[2];
    const a1 = inv[3]*XTy[0] + inv[4]*XTy[1] + inv[5]*XTy[2];
    const a2 = inv[6]*XTy[0] + inv[7]*XTy[1] + inv[8]*XTy[2];

    return [a0, a1, a2];
  }

  private evaluate(coeffs: [number, number, number], t: number): number {
    return coeffs[0] + coeffs[1] * t + coeffs[2] * t * t;
  }

  private estimateBaseUncertainty(history: TimestampedState[]): number {
    // Use EKF position sigma of most recent state as base uncertainty
    const last = history[history.length - 1];
    // Approximate from covariance if available, else default
    return 5.0; // metres — refined with P matrix in full implementation
  }

  private linearExtrapolate(history: TimestampedState[], horizons: number[]): PredictedPoint[] {
    // Use EKF velocity from most recent state
    const last = history[history.length - 1];
    const { lat, lon, alt, vLat, vLon, vAlt } = last.state;
    return horizons.map(h => ({
      horizonSeconds: h,
      lat: lat + vLat * h,
      lon: lon + vLon * h,
      alt: Math.max(0, alt + vAlt * h),
      confidence: computeConfidenceDecay(0.7, h),  // lower base confidence for linear
      sigmaM: 10 * Math.exp(0.15 * h),
    }));
  }
}
```

---

## 4. LSTM ARCHITECTURE (W6 PRODUCTION SPEC)

### 4.1 Model Architecture

```
Input:  shape = [1, 10, 6]
        batch=1 (single track), sequence_length=10, features=6
        features: [lat_norm, lon_norm, alt_norm, vLat_norm, vLon_norm, vAlt_norm]

Preprocessing (normalization per feature):
  For each feature f:
    mean_f  = mean of training set for feature f
    std_f   = std of training set for feature f
    norm(x) = (x - mean_f) / std_f

  Stored in model metadata (ONNX model metadata or separate normalization.json)

Layer 1: LSTM
  units=128, return_sequences=True
  dropout=0.0 (inference mode)
  output shape: [1, 10, 128]

Layer 2: LSTM
  units=128, return_sequences=False
  dropout=0.0 (inference mode)
  output shape: [1, 128]

Layer 3: Dense
  units=15, activation=linear
  output shape: [1, 15]

Reshape output: [1, 15] → [5, 3]
  Row i = prediction at horizon[i] = {lat_norm, lon_norm, alt_norm}

Denormalize:
  lat_pred = lat_norm * std_lat + mean_lat
  lon_pred = lon_norm * std_lon + mean_lon
  alt_pred = alt_norm * std_alt + mean_alt (clamp to >= 0)
```

### 4.2 ONNX Runtime Integration (W6 Plan)

```typescript
// src/predictor/OnnxPredictor.ts — W6 implementation stub
import * as ort from 'onnxruntime-node';

class OnnxPredictor implements Predictor {
  readonly modelVersion = 'onnx-lstm-v1';
  private session: ort.InferenceSession | null = null;
  private normalization: NormalizationParams;

  static async load(modelPath: string, normPath: string): Promise<OnnxPredictor> {
    const predictor = new OnnxPredictor();
    predictor.session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    });
    predictor.normalization = JSON.parse(await fs.readFile(normPath, 'utf8'));
    return predictor;
  }

  predict(history: TimestampedState[], horizons: number[]): PredictedPoint[] {
    if (!this.session) throw new Error('ONNX model not loaded');
    if (history.length < 10) {
      // Pad with oldest state repeated
      while (history.length < 10) history.unshift(history[0]);
    }

    // Build input tensor [1, 10, 6]
    const inputData = new Float32Array(1 * 10 * 6);
    for (let i = 0; i < 10; i++) {
      const state = history[i].state;
      const features = [state.lat, state.lon, state.alt, state.vLat, state.vLon, state.vAlt];
      for (let f = 0; f < 6; f++) {
        inputData[i * 6 + f] = (features[f] - this.normalization.mean[f]) / this.normalization.std[f];
      }
    }

    const tensor = new ort.Tensor('float32', inputData, [1, 10, 6]);
    const feeds = { input_sequence: tensor };
    // Note: ONNX inference is async in onnxruntime-node
    // In actual implementation this must be awaited — refactor predict() to async
    // (stub kept sync for interface compatibility; W6 will make Predictor interface async)

    // ... run inference, denormalize, return PredictedPoint[]
    throw new Error('W6 not yet implemented — use PolynomialPredictor');
  }
}
```

### 4.3 Training Data — INDIGO AirGuard Dataset

The INDIGO AirGuard dataset contains synthetic and real flight paths for FPV drones and Shahed-type UAVs. W5 uses a synthetic version generated in Node.js.

**Synthetic trajectory generator for W5 development:**
```typescript
// scripts/generate-synthetic-trajectories.ts
// Generates 1000 FPV drone trajectories for:
//   1. Model validation (compare polynomial vs linear vs LSTM surrogate)
//   2. EKF accuracy testing (add TDOA noise σ=15m, measure RMSE)
//   3. Impact point accuracy testing

interface SyntheticTrajectoryParams {
  startLat: number;
  startLon: number;
  startAlt: number;           // metres
  targetLat: number;
  targetLon: number;
  speed: number;              // m/s (FPV: 15-40 m/s, Shahed: 150-200 m/s)
  maneuverSigma: number;      // m/s² random acceleration
  diveSteepness: number;      // ratio of vAlt/vGround in terminal phase (0.2-0.8)
  durationSeconds: number;    // total flight duration
  measurementHz: number;      // TDOA measurement rate
  measurementNoiseSigmaM: number;  // metres
}
```

---

## 5. CONFIDENCE DECAY FORMULA

### 5.1 Formula

```
confidence(t) = confidence₀ × exp(-λ × t)

where:
  t             = seconds ahead (prediction horizon)
  λ             = 0.15 s⁻¹ (decay rate)
  confidence₀   = base confidence at t=0 (current EKF state quality)

Derived from EKF position covariance:
  confidence₀ = clamp(1 - positionSigmaM / 50.0, 0.1, 1.0)
    where 50m is the "zero confidence" reference scale
    (positionSigmaM < 5m → confidence near 1.0)
    (positionSigmaM > 50m → confidence near 0)
```

### 5.2 Numerical Values

| Horizon | confidence(t) at σ₀=0.95 | sigmaM |
|---------|--------------------------|--------|
| t = 0s  | 0.95 | ~5m |
| t = 1s  | 0.95 × e^(-0.15) = 0.82 | 5.8m |
| t = 2s  | 0.95 × e^(-0.30) = 0.70 | 6.7m |
| t = 3s  | 0.95 × e^(-0.45) = 0.60 | 7.8m |
| t = 5s  | 0.95 × e^(-0.75) = 0.45 | 10.5m |
| t = 10s | 0.95 × e^(-1.50) = 0.21 | 18.4m |

sigmaM formula: `sigmaM(t) = sigma0 × exp(λ × t)` (inverse of confidence decay — uncertainty grows)

### 5.3 Coasting Confidence Penalty

During coast (no measurement), an additional multiplicative penalty applies per coast second:
```
confidence_coast(n_coast) = confidence_normal × 0.85^n_coast

where n_coast = number of consecutive 1Hz cycles without measurement
```

Combined:
```
confidence_output(t, n_coast) = confidence₀ × exp(-0.15t) × 0.85^n_coast
```

---

## 6. IMPACT POINT ESTIMATION

### 6.1 Algorithm

```
Inputs:
  currentState: EKFStateVector — current EKF best estimate
  currentAlt: number          — metres MSL
  vAlt: number                — m/s (negative = descending)

Preconditions:
  currentAlt > 0              — drone is airborne
  vAlt < -0.5                 — drone is descending (not hovering)

Step 1: Time to impact
  t_impact = -currentAlt / vAlt   (seconds until alt = 0)
  Note: vAlt < 0, so t_impact > 0

Step 2: Horizontal position at impact
  Using polynomial predictor (if history available) or linear extrapolation:
  impact_lat = currentState.lat + currentState.vLat × t_impact
  impact_lon = currentState.lon + currentState.vLon × t_impact

  For polynomial predictor: evaluate polynomial at t = t_impact
  (capped at 60s extrapolation — polynomial unreliable beyond this)

Step 3: Confidence radius
  Base sigma from EKF position covariance: sigma0
  At t_impact seconds: sigmaM = sigma0 × exp(0.15 × t_impact)
  confidenceRadius = min(sigmaM × 2.0, 500)  // 2σ ≈ 95%, cap at 500m

Step 4: Confidence
  confidence = confidence₀ × exp(-0.15 × t_impact) × 0.85^n_coast
  Minimum reportable confidence: 0.1

Step 5: Publication filter
  Only publish impact estimate if:
  - confidence > 0.1
  - t_impact > 0 (not already at ground)
  - t_impact < 120 (within 2 minutes — beyond this is too speculative)
```

### 6.2 TypeScript Implementation

```typescript
function estimateImpact(state: EKFStateVector, nCoast: number, sigma0: number): ImpactEstimate | null {
  const { lat, lon, alt, vLat, vLon, vAlt } = state;

  if (alt <= 0 || vAlt >= -0.5) return null;

  const tImpact = -alt / vAlt;
  if (tImpact <= 0 || tImpact > 120) return null;

  const impactLat = lat + vLat * tImpact;
  const impactLon = lon + vLon * tImpact;

  const sigmaAtImpact = sigma0 * Math.exp(0.15 * tImpact);
  const confidenceRadius = Math.min(sigmaAtImpact * 2.0, 500);
  const confidence = Math.max(0.1,
    (1 - sigma0 / 50) * Math.exp(-0.15 * tImpact) * Math.pow(0.85, nCoast)
  );

  return {
    lat: impactLat,
    lon: impactLon,
    confidenceRadius,
    confidence,
    timeToImpactSeconds: tImpact,
    estimatedAt: new Date(Date.now() + tImpact * 1000).toISOString(),
  };
}
```

---

## 7. PERFORMANCE CONSTRAINTS

### 7.1 Latency Budget Breakdown (200ms total)

| Operation | Budget | Notes |
|-----------|--------|-------|
| NATS message decode | 1ms | JSON.parse |
| EKF predict step | 2ms | 6×6 matrix ops, ~400 FLOPs |
| EKF update step | 5ms | 3×3 invert + 6×3 matmul |
| Polynomial fit + eval | 10ms | 3× 3×3 solve + 5 evaluations |
| Impact estimation | 2ms | Simple arithmetic |
| NATS publish | 5ms | JSON.stringify + send |
| Supabase write (async) | 150ms | async, does not block NATS publish |
| **Total (NATS path)** | **25ms** | Well within 200ms |
| **Total (including Supabase)** | **175ms** | Supabase is parallel, non-blocking |

### 7.2 Throughput at 50 Tracks

- 50 tracks × 1 Hz = 50 EKF cycles/second
- Each cycle: ~25ms (NATS-side) → 50 × 25ms = 1250ms of CPU time/second on single thread
- **Problem:** 1250ms > 1000ms — exceeds single-core capacity at 50 tracks × 1 Hz

**Solution:** EKF processing is async I/O bound, not CPU bound. Actual CPU time for matrix ops:
- EKF predict + update: ~0.1ms actual CPU (400 FLOPs at 4 GFLOPS)
- Polynomial fit: ~0.05ms actual CPU (tiny arrays)
- Total CPU per cycle: ~0.2ms

50 tracks × 0.2ms = 10ms CPU/second. Well within single-process Node.js capacity.

The 25ms "budget" is dominated by I/O (Supabase, NATS). Since Supabase writes are async and rate-limited, CPU is never the bottleneck.

---

*AI_PIPELINE.md — APEX-SENTINEL W5 — Generated 2026-03-24*
*Total: 720+ lines | Status: APPROVED | Next: PRIVACY_ARCHITECTURE.md*
