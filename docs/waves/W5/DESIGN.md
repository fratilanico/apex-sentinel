# APEX-SENTINEL — DESIGN.md
## Gate 4: EKF + LSTM Trajectory Prediction
### Wave 5 | Project: APEX-SENTINEL | Version: 5.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. DESIGN OVERVIEW

### 1.1 What W5 Builds

W5 is a **headless Node.js microservice** — no UI, no HTTP server, no browser. It consumes real-time detection events and track records from W1–W4 infrastructure, applies Extended Kalman Filter (EKF) state estimation, runs polynomial trajectory extrapolation (LSTM surrogate for W5, ONNX Runtime in W6), computes impact point estimates, and publishes predictions back to:

1. **NATS** — `sentinel.predictions.{trackId}` and `sentinel.impacts.{trackId}`
2. **Supabase** — `predicted_trajectory` column on `tracks` table, `track_positions`, `predicted_trajectories`, `impact_estimates` tables

The W4 CesiumJS dashboard consumes these predictions passively via Supabase Realtime and NATS.ws. No W5 changes to the dashboard beyond rendering the new prediction overlay (polyline + impact marker).

### 1.2 System Boundary

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  INPUTS (consumed by W5)                                                     │
│                                                                              │
│  NATS: sentinel.detections.>    ← TdoaCorrelator detection events (W3)       │
│  Supabase Realtime: tracks      ← confirmed track records (W3 writes)        │
│  Supabase: tracks table         ← initial load of active tracks on startup   │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                         ┌─────────────▼──────────────┐
                         │  APEX-SENTINEL W5 SERVICE   │
                         │                             │
                         │  ┌─────────────────────┐   │
                         │  │  MultiTrackManager   │   │
                         │  │  Map<id,EKFInstance> │   │
                         │  └────────┬────────────┘   │
                         │           │                 │
                         │  ┌────────▼────────────┐   │
                         │  │  EKFPredictor        │   │
                         │  │  predict() + update()│   │
                         │  └────────┬────────────┘   │
                         │           │                 │
                         │  ┌────────▼────────────┐   │
                         │  │  TrajectoryForecaster│   │
                         │  │  polynomial/ONNX     │   │
                         │  └────────┬────────────┘   │
                         │           │                 │
                         │  ┌────────▼────────────┐   │
                         │  │  ImpactEstimator     │   │
                         │  │  project to alt=0    │   │
                         │  └────────┬────────────┘   │
                         │           │                 │
                         │  ┌────────▼────────────┐   │
                         │  │  PredictionPublisher │   │
                         │  │  NATS + Supabase     │   │
                         │  └─────────────────────┘   │
                         └─────────────┬───────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────┐
│  OUTPUTS (produced by W5)                                                    │
│                                                                              │
│  NATS: sentinel.predictions.{trackId}  → W4 dashboard NATS.ws consumer      │
│  NATS: sentinel.impacts.{trackId}      → W4 dashboard NATS.ws consumer      │
│  Supabase: tracks.predicted_trajectory → W4 dashboard Realtime consumer     │
│  Supabase: track_positions             → OpenMCT telemetry source            │
│  Supabase: predicted_trajectories      → history + audit                     │
│  Supabase: impact_estimates            → C2 commander overlay                │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. PREDICTION OUTPUT SCHEMA

### 2.1 Predicted Trajectory (5-point polyline for CesiumJS)

```typescript
interface PredictionOutput {
  trackId: string;
  generatedAt: string;          // ISO 8601 UTC
  ekfState: EKFStateVector;     // current best estimate
  ekfCovarianceDiag: number[];  // [P11,P22,P33,P44,P55,P66] covariance diagonal
  predictions: PredictedPoint[]; // 5 future positions
  impactEstimate: ImpactEstimate | null;
  confidence: number;           // 0.0–1.0 at t+1s horizon
  modelVersion: string;         // 'polynomial-v1' | 'onnx-lstm-v1'
}

interface PredictedPoint {
  horizonSeconds: number;       // 1, 2, 3, 5, 10
  lat: number;                  // WGS84 degrees
  lon: number;                  // WGS84 degrees
  alt: number;                  // metres MSL
  confidence: number;           // 0.0–1.0, decays with horizon
  sigmaM: number;               // 1-sigma position uncertainty in metres
}

interface ImpactEstimate {
  lat: number;
  lon: number;
  estimatedAt: string;          // ISO 8601 UTC — when drone will hit ground
  confidenceRadius: number;     // metres, 95% confidence circle
  confidence: number;           // 0.0–1.0
}
```

### 2.2 EKF State Vector

```
State x = [lat, lon, alt, vLat, vLon, vAlt]
         = [degrees, degrees, metres, deg/s, deg/s, m/s]
```

Note: velocity components `vLat` and `vLon` are in degrees/second. For distance computation, multiply by 111,320 m/deg (lat) and 111,320 × cos(lat) m/deg (lon). `vAlt` is metres/second.

---

## 3. W4 CESIUMJS PREDICTION OVERLAY

### 3.1 Predicted Trajectory Polyline

The W4 dashboard adds a polyline entity for each active track showing the 5 predicted positions. Rendering spec:

```
Current position (EKF best estimate)
   → t+1s  (confidence ~0.95) — bright yellow #FFD700, width 3px
   → t+2s  (confidence ~0.80) — yellow-orange #FFA500, width 3px
   → t+3s  (confidence ~0.67) — orange #FF8C00, width 2px
   → t+5s  (confidence ~0.47) — amber-grey #C0A060, width 2px
   → t+10s (confidence ~0.22) — grey #808080, width 1px
```

Confidence colour mapping (linear interpolation in HSL):
- confidence = 1.0 → hsl(51, 100%, 50%) — pure yellow
- confidence = 0.5 → hsl(30, 80%, 50%)  — orange
- confidence = 0.0 → hsl(0, 0%, 50%)    — grey

CesiumJS entity pseudocode:
```javascript
viewer.entities.add({
  id: `prediction-polyline-${trackId}`,
  polyline: {
    positions: Cesium.Cartesian3.fromDegreesArrayHeights(
      predictions.flatMap(p => [p.lon, p.lat, p.alt])
    ),
    material: new Cesium.PolylineGlowMaterialProperty({
      glowPower: 0.1,
      color: Cesium.Color.YELLOW
    }),
    width: 3,
    clampToGround: false
  }
});
```

For per-segment gradient, split into 4 individual polyline entities (each segment a separate entity with its own colour).

### 3.2 Impact Point Marker

Red X on the CesiumJS globe at the projected ground impact location:

```javascript
viewer.entities.add({
  id: `impact-${trackId}`,
  position: Cesium.Cartesian3.fromDegrees(impact.lon, impact.lat, 0),
  billboard: {
    image: '/icons/impact-x-red.png',   // 32×32 SVG cross
    scale: 1.0,
    color: Cesium.Color.RED,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
  },
  label: {
    text: `IMPACT ±${impact.confidenceRadius}m`,
    font: '12px monospace',
    fillColor: Cesium.Color.RED,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 2,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM
  },
  ellipse: {
    semiMajorAxis: impact.confidenceRadius,
    semiMinorAxis: impact.confidenceRadius,
    material: Cesium.Color.RED.withAlpha(0.15),
    outline: true,
    outlineColor: Cesium.Color.RED.withAlpha(0.6)
  }
});
```

The confidence circle (ellipse entity) visualises the ±50m uncertainty radius. Colour opacity scales with `impact.confidence`.

### 3.3 Realtime Update Loop

The W4 dashboard uses Supabase Realtime to receive `tracks` table updates. When `predicted_trajectory` column is updated by W5, CesiumJS entities are refreshed:

```
Supabase Realtime UPDATE event on tracks
  → payload.new.predicted_trajectory !== null
  → parse PredictionOutput from JSONB
  → remove old prediction entities for trackId
  → add new polyline entities (5 segments)
  → add/update impact marker entity
  → update OpenMCT telemetry buffer
```

Debounce: 250ms — do not re-render faster than 4Hz per track.

---

## 4. EKF STATE VISUALIZATION IN OPENMCT

### 4.1 OpenMCT Telemetry Source

W5 writes EKF state estimates to `track_positions` table at every predict/update cycle (nominally 1 Hz). The W4 OpenMCT panel subscribes to this table as a telemetry source via the `get-predictions` Edge Function.

### 4.2 Six State Variables

OpenMCT displays 6 time-series plots per track:

| Channel | Units | Expected Range (FPV drone) | Alarm Threshold |
|---------|-------|---------------------------|-----------------|
| ekf.lat | degrees | 48.0 – 52.0 (Central Europe) | outside AOI bbox |
| ekf.lon | degrees | 22.0 – 40.0 | outside AOI bbox |
| ekf.alt | metres MSL | 0 – 500 | > 300m (high altitude) |
| ekf.vLat | deg/s | -0.003 – +0.003 (~330m/s) | abs > 0.0004 (fast) |
| ekf.vLon | deg/s | -0.003 – +0.003 | abs > 0.0004 |
| ekf.vAlt | m/s | -10 – +10 | < -5 (rapid descent) |

### 4.3 Covariance Display

OpenMCT shows a separate panel with covariance diagonal elements P11–P66. P11, P22, P33 (position covariance) should grow during coast phases and shrink after measurement updates. Expected behaviour:

- **Predict step (no measurement)**: P grows at rate governed by Q matrix
- **Update step (measurement received)**: P shrinks proportional to measurement quality (R matrix)
- **Steady-state** (constant velocity, regular measurements): P converges to ~25–100 m² for position elements

Anomaly: if P11 or P22 > 10,000 m² (100m sigma), track is flagged as `COASTING_UNCERTAIN` and confidence output is clamped to 0.1.

---

## 5. EKF ALGORITHM FLOW DIAGRAMS

### 5.1 Predict Step

```
INPUT: x_prev (6×1), P_prev (6×6), dt (seconds since last cycle)

Step 1: Build state transition matrix F
┌─────────────────────────────────────────────────────────┐
│  F = I₆ + dt × Fc                                       │
│                                                         │
│  where Fc (continuous dynamics matrix) =                │
│  ┌ 0  0  0  1  0  0 ┐                                   │
│  │ 0  0  0  0  1  0 │                                   │
│  │ 0  0  0  0  0  1 │                                   │
│  │ 0  0  0  0  0  0 │                                   │
│  │ 0  0  0  0  0  0 │                                   │
│  └ 0  0  0  0  0  0 ┘                                   │
│                                                         │
│  F (discrete, constant velocity) =                      │
│  ┌ 1  0  0  dt  0   0  ┐                                │
│  │ 0  1  0  0   dt  0  │                                │
│  │ 0  0  1  0   0   dt │                                │
│  │ 0  0  0  1   0   0  │                                │
│  │ 0  0  0  0   1   0  │                                │
│  └ 0  0  0  0   0   1  ┘                                │
└─────────────────────────────────────────────────────────┘

Step 2: State prediction
  x_pred = F × x_prev

Step 3: Build process noise matrix Q (Singer model)
  σ_a = 5 m/s² (drone maneuvering acceleration std dev)
  Q = σ_a² × Γ × Γᵀ  (see AI_PIPELINE.md §4 for full Q derivation)

Step 4: Covariance prediction
  P_pred = F × P_prev × Fᵀ + Q

OUTPUT: x_pred (6×1), P_pred (6×6)
```

### 5.2 Update Step

```
INPUT: x_pred (6×1), P_pred (6×6),
       measurement z = [lat_meas, lon_meas, alt_meas] (3×1),
       measurement noise R = diag(errorM², errorM², errorM_v²) (3×3)

Step 1: Measurement matrix H (maps state → measurement space)
  H = ┌ 1  0  0  0  0  0 ┐
      │ 0  1  0  0  0  0 │
      └ 0  0  1  0  0  0 ┘

Step 2: Innovation (residual)
  y = z - H × x_pred

Step 3: Innovation covariance
  S = H × P_pred × Hᵀ + R

Step 4: Kalman gain
  K = P_pred × Hᵀ × S⁻¹   (S is 3×3, invert directly — no numerical issues at 3×3)

Step 5: State update
  x_upd = x_pred + K × y

Step 6: Covariance update (Joseph form for numerical stability)
  IKH = I₆ - K × H
  P_upd = IKH × P_pred × IKHᵀ + K × R × Kᵀ

OUTPUT: x_upd (6×1), P_upd (6×6)

NOTE: Joseph form used (not simplified P_upd = (I-KH)×P_pred) because it
guarantees P remains symmetric positive-definite even with floating-point
rounding over hundreds of iterations.
```

### 5.3 Full Cycle (Predict → Update → Publish)

```
┌──────────────────────────────────────────────────────────────────┐
│  NATS detection event arrives                                     │
│  subject: sentinel.detections.{nodeId}                           │
│  payload: { trackId, lat, lon, alt, errorM, timestamp }          │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│  MultiTrackManager.handleDetection(event)                        │
│                                                                  │
│  1. Lookup EKFInstance for trackId                               │
│     → if not found: create new EKFInstance, initialize state     │
│       from (lat, lon, alt, 0, 0, 0) with large P₀               │
│                                                                  │
│  2. Compute dt = event.timestamp - ekf.lastUpdateTime            │
│     → if dt > 15s: log COAST_DROPOUT, delete EKFInstance, return │
│     → if dt <= 0: log STALE_MEASUREMENT, skip measurement update │
│                                                                  │
│  3. EKF Predict step (always runs)                               │
│     → x_pred, P_pred = ekf.predict(dt)                          │
│                                                                  │
│  4. EKF Update step (if measurement available)                   │
│     → z = [event.lat, event.lon, event.alt]                     │
│     → R = diag(errorM², errorM², 25)  — 5m vertical noise       │
│     → x_upd, P_upd = ekf.update(z, R)                           │
│                                                                  │
│  5. Write state to track_positions table (async, non-blocking)   │
│                                                                  │
│  6. Run TrajectoryForecaster on last 10 EKF states               │
│     → if history < 3 points: skip forecast, use linear project.  │
│     → predict(horizons=[1,2,3,5,10]) → PredictedPoint[]          │
│                                                                  │
│  7. Run ImpactEstimator(x_upd, predictions)                      │
│     → if alt > 0 and vAlt < 0: compute impact                   │
│     → else: impactEstimate = null                                │
│                                                                  │
│  8. Build PredictionOutput, compute confidence                   │
│                                                                  │
│  9. PredictionPublisher.publish(PredictionOutput)                │
│     → NATS publish sentinel.predictions.{trackId}               │
│     → NATS publish sentinel.impacts.{trackId} (if impact)       │
│     → Supabase upsert tracks.predicted_trajectory                │
│     → Supabase insert predicted_trajectories record              │
│     → Supabase upsert impact_estimates (if impact)              │
└──────────────────────────────────────────────────────────────────┘
```

### 5.4 Coast (No Measurement) Cycle

```
┌──────────────────────────────────────────────────────────────────┐
│  Timer fires at 1 Hz for each active EKF with no recent update  │
│                                                                  │
│  FOR each (trackId, ekf) in MultiTrackManager.instances:         │
│    sinceLastUpdate = now - ekf.lastUpdateTime                    │
│                                                                  │
│    if sinceLastUpdate > 15s:                                     │
│      → publish COAST_DROPOUT event                               │
│      → delete EKF instance                                       │
│      → update tracks.status = 'LOST' in Supabase                │
│      → CONTINUE                                                  │
│                                                                  │
│    if sinceLastUpdate > 2s (no recent measurement):             │
│      → run predict(dt=1s) only — no update step                 │
│      → confidence clamped to max(0.1, confidence × 0.85)        │
│        per coast second                                          │
│      → publish predictions with COASTING flag                   │
│                                                                  │
│    UPDATE tracks.last_seen = now (heartbeat)                     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. LSTM INPUT/OUTPUT TENSOR SHAPES

### 6.1 Production ONNX LSTM (W6)

**Model architecture:**
```
Input layer:   [batch=1, seq_len=10, features=6]
                features = [lat, lon, alt, vLat, vLon, vAlt]
                (normalized: mean=0, std=1 per feature)

LSTM layer 1:  units=128, return_sequences=True
               output: [1, 10, 128]

Dropout:       rate=0.2 (training only)

LSTM layer 2:  units=128, return_sequences=False
               output: [1, 128]

Dense layer:   units=15, activation=linear
               output: [1, 15]
               reshape to [5, 3] = 5 horizons × (lat, lon, alt)

Denormalize output using input statistics
```

**ONNX model file:** `models/lstm-trajectory-v1.onnx`
**Input tensor name:** `input_sequence`
**Output tensor name:** `predictions`
**Input shape:** `[1, 10, 6]` (dynamic batch not used — always 1 track at a time)
**Output shape:** `[1, 15]` (reshape to `[5, 3]` in application code)

### 6.2 W5 Polynomial Surrogate (Shipped in W5)

The polynomial surrogate does not use tensors. It takes the last N EKF state vectors (minimum 3, up to 10) and fits a 2nd-order polynomial to each of lat, lon, alt independently.

**Input:** `EKFStateVector[]` — array of up to 10 recent states with timestamps
**Output:** `PredictedPoint[]` — 5 points at horizons [1, 2, 3, 5, 10] seconds

Polynomial fit uses least-squares regression on `(t, value)` pairs:
```
f(t) = a₀ + a₁t + a₂t²

Fitted independently for:
  lat(t): 2nd-order polynomial over last N lat values
  lon(t): 2nd-order polynomial over last N lon values
  alt(t): 2nd-order polynomial over last N alt values

Coefficients from normal equations: [a₀,a₁,a₂] = (XᵀX)⁻¹ × Xᵀy
```

---

## 7. COORDINATE SYSTEM CONVENTIONS

### 7.1 WGS84 for All External Interfaces

All inputs and outputs use **WGS84 geodetic coordinates**:
- `lat`: decimal degrees, -90 to +90 (positive = North)
- `lon`: decimal degrees, -180 to +180 (positive = East)
- `alt`: metres above mean sea level (MSL)

### 7.2 EKF Internal State Units

The EKF state vector stores lat/lon in **decimal degrees** (not radians, not metres). This is intentional — it avoids the need for ENU conversion at the cost of a slightly non-uniform distance metric.

**Scale factors for distance calculation:**
```
1 degree latitude  ≈ 111,320 metres
1 degree longitude ≈ 111,320 × cos(lat) metres

For operational area lat ≈ 48°N (Ukraine/Eastern Europe):
  1 deg lat ≈ 111,320 m
  1 deg lon ≈ 111,320 × cos(48°) ≈ 74,480 m
```

**Process noise in degree units:**
```
σ_a = 5 m/s² maneuvering uncertainty

Convert to deg/s² for lat dimension:
  σ_a_lat = 5 / 111320 ≈ 4.49 × 10⁻⁵ deg/s²

Convert to deg/s² for lon dimension (at lat 48°):
  σ_a_lon = 5 / 74480 ≈ 6.71 × 10⁻⁵ deg/s²

Alt dimension remains in m/s²: σ_a_alt = 5 m/s²
```

### 7.3 Why Not ENU Local Coordinates?

ENU (East-North-Up) local coordinates centered at a reference origin offer better numerical uniformity. However:
1. Multi-track scenarios with tracks 100+ km apart require different origins per track
2. Converting back to WGS84 for each publish adds complexity
3. For areas ≤ 200 km × 200 km (typical drone threat envelope), WGS84 degree-based EKF has negligible error (< 0.1% at 48° lat)
4. Simplicity wins for W5 — ENU considered for W7 field hardening

See DECISION_LOG.md §DL-W5-06 for full rationale.

### 7.4 Altitude Reference

- All altitudes: **metres above MSL** (same as W3 TdoaCorrelator output)
- Ground level for impact estimation: **alt = 0** (sea level proxy)
- For higher-fidelity impact estimation (W7): integrate SRTM elevation data for actual terrain height

**Impact estimation note:** In most operational areas (Ukraine flatlands), elevation variation ≤ 200m. Using alt=0 introduces ≤ 200m impact point error. Acceptable for 200ms latency budget of W5. Terrain-corrected impact (W7 scope).

---

## 8. SERVICE DESIGN

### 8.1 Process Architecture

W5 is a single Node.js 20 process. No child workers, no cluster. Rationale: EKF instances are stateful and must not be split across workers without shared state synchronization. Single process handles up to 50 simultaneous tracks within the 200ms latency budget (benchmarked in TEST_STRATEGY.md).

### 8.2 Memory Model

```
MultiTrackManager state (in-process, volatile):
  Map<trackId: string, EKFInstance> — one per active track

EKFInstance contains:
  - state: Float64Array(6)     — x vector
  - covariance: Float64Array(36) — P matrix, row-major
  - history: CircularBuffer<{timestamp, state}>(size=10) — for LSTM input
  - lastUpdateTime: number     — Unix ms
  - createdAt: number          — Unix ms
  - coastCount: number         — consecutive coast cycles

Total per instance: ~500 bytes
At 50 tracks: ~25 KB — negligible
At 1000 tracks: ~500 KB — still fine
```

On process restart, state is lost. EKF reinitializes from the next measurement received. Supabase `track_positions` table preserves historical estimates for continuity across restarts.

### 8.3 Publish Rate Control

To avoid Supabase write spam, the publisher implements a **token bucket** rate limiter:
- Max 10 Supabase writes/second across all tracks
- NATS publishes: unlimited (NATS handles backpressure)
- If Supabase bucket empty: buffer the update, flush on next available token
- Oldest buffered update wins (drop intermediate — commander sees latest state)

### 8.4 Startup Sequence

```
1. Load environment variables (.env / systemd EnvironmentFile)
2. Connect to NATS (retry with exponential backoff, max 30s)
3. Connect to Supabase client (service role key)
4. Load active tracks from Supabase:
   SELECT id, last_known_lat, last_known_lon, last_known_alt,
          last_seen, status
   FROM tracks
   WHERE status IN ('CONFIRMED', 'ACTIVE')
   AND last_seen > NOW() - INTERVAL '60 seconds'
5. Initialize EKF instances for each loaded track
6. Subscribe to Supabase Realtime tracks table (INSERT/UPDATE events)
7. Subscribe to NATS sentinel.detections.> (pull consumer)
8. Start coast timer (1 Hz setInterval)
9. Log startup complete, track count, NATS subjects
```

### 8.5 Graceful Shutdown

SIGTERM handler:
1. Stop accepting new NATS messages
2. Flush pending Supabase writes (max 5s timeout)
3. Drain NATS connection
4. Log shutdown complete

---

## 9. W4 DASHBOARD INTEGRATION CHANGES

### 9.1 Minimal W4 Changes Required

W4 dashboard receives prediction data passively. Changes needed:

**File: `src/lib/cesium/prediction-overlay.ts`** (new file)
- Function: `renderPredictionOverlay(viewer, trackId, prediction)`
- Creates/updates 5 polyline segment entities + 1 impact marker entity
- Called from Supabase Realtime handler on tracks table update

**File: `src/stores/trackStore.ts`** (add field)
- Add `predictedTrajectory: PredictionOutput | null` to track slice
- Update Realtime handler to populate this field

**File: `src/components/cesium/TrackLayer.tsx`** (minor update)
- On track update, call `renderPredictionOverlay` if `predictedTrajectory` present
- On track deletion, call `clearPredictionOverlay(viewer, trackId)`

**File: `src/components/openmct/EkfStatePlugin.ts`** (new file)
- OpenMCT telemetry plugin for EKF state channels (6 state vars + 6 covariance diag)
- Source: `get-predictions` Edge Function (polling 1s interval per track)

No changes to NATS subscription logic — prediction subjects already match `sentinel.>` wildcard subscription.

### 9.2 NATS.ws Prediction Handler

```typescript
// In W4 NatsProvider.tsx — add to existing message router:
if (subject.startsWith('sentinel.predictions.')) {
  const trackId = subject.split('.')[2];
  const prediction = JSON.parse(sc.decode(msg.data)) as PredictionOutput;
  trackStore.getState().setPrediction(trackId, prediction);
  renderPredictionOverlay(cesiumViewer, trackId, prediction);
}

if (subject.startsWith('sentinel.impacts.')) {
  const trackId = subject.split('.')[2];
  const impact = JSON.parse(sc.decode(msg.data)) as ImpactEstimate;
  renderImpactMarker(cesiumViewer, trackId, impact);
}
```

---

## 10. DESIGN CONSTRAINTS AND NON-GOALS

### 10.1 Design Constraints

| Constraint | Value | Source |
|-----------|-------|--------|
| Prediction latency | ≤ 200ms from detection event to NATS publish | PRD §3.1 |
| Process noise σ | 5 m/s² (drone maneuvering) | AI_PIPELINE.md §3.2 |
| Coast timeout | 15 seconds | DECISION_LOG §DL-W5-10 |
| Prediction horizons | 1, 2, 3, 5, 10 seconds | PRD §2.3 |
| EKF state dimension | 6 (no acceleration state) | DECISION_LOG §DL-W5-01 |
| Matrix library | Plain JS arrays, zero deps | DECISION_LOG §DL-W5-06 |
| Node.js version | 20 LTS | ARCHITECTURE.md §2.1 |
| TypeScript | strict mode | ARCHITECTURE.md §2.1 |

### 10.2 Non-Goals for W5

- ONNX Runtime integration (W6 scope)
- Terrain-corrected impact estimation (W7)
- Multi-sensor fusion beyond TdoaCorrelator (W7)
- Maneuver detection / IMM filter (W7)
- Track association / data association (handled by W3)
- Android app prediction display (W6)
- Ballistic trajectory model (not applicable for FPV drones)
- Bearing-only measurements (TdoaCorrelator always provides 3D position)

---

## 11. DESIGN DECISIONS SUMMARY

| Decision | Choice | Alternative Rejected |
|---------|--------|---------------------|
| Filter type | EKF | Particle filter (too slow for 200ms) |
| Process model | Constant velocity + Singer Q | Constant acceleration (over-parameterized) |
| Coordinate frame | WGS84 degrees | ENU metres (added complexity) |
| LSTM surrogate | Polynomial extrapolation | TensorFlow.js (heavy) |
| Matrix code | Plain JS Float64Array | mathjs / ml-matrix (dependencies) |
| State dimension | 6 | 9 (acceleration would need IMM) |
| Publish transport | NATS + Supabase dual | NATS only (dashboard needs DB persistence) |
| Coast handling | 15s timeout | 30s (too far for FPV drone at 30m/s) |

---

*DESIGN.md — APEX-SENTINEL W5 — Generated 2026-03-24*
*Total: 650+ lines | Status: APPROVED | Next: PRD.md*
