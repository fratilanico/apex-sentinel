# APEX-SENTINEL W5 — FUNCTIONAL REQUIREMENTS REGISTER
## W5 | PROJECTAPEX Doc 19/20 | 2026-03-24

> Wave: W5 — EKF + LSTM Trajectory Prediction (Gate 4)
> Supabase: bymfcnwfyxuivinuzurr (eu-west-2)
> FRs: FR-W5-01 through FR-W5-11

---

## FR Register Summary

```
FR-ID       Title                                    Priority  Status    Test Count
─────────────────────────────────────────────────────────────────────────────────
FR-W5-01    EKF predict step                         P0        PENDING   8
FR-W5-02    EKF update step                          P0        PENDING   7
FR-W5-03    EKF covariance positive-definite         P0        PENDING   5
FR-W5-04    Polynomial surrogate predictor           P0        PENDING   6
FR-W5-05    5-horizon output                         P0        PENDING   6
FR-W5-06    Impact estimator                         P0        PENDING   8
FR-W5-07    Prediction publisher (NATS)              P0        PENDING   8
FR-W5-08    Track enrichment (Supabase)              P0        PENDING   7
FR-W5-09    Confidence decay                         P1        PENDING   6
FR-W5-10    MultiTrackEKFManager                     P0        PENDING   10
FR-W5-11    EKF coast on missing measurement         P1        PENDING   4
─────────────────────────────────────────────────────────────────────────────────
TOTAL                                                           ≥75 tests
```

---

## FR-W5-01: EKF Predict Step

```
FR-ID:        FR-W5-01
Title:        EKF predict step — state propagates via constant-velocity model,
              process covariance grows via Singer noise
Priority:     P0 (blocks all downstream FRs)
Status:       PENDING
Depends on:   MatrixOps (ART-W5-002)
Implements:   EKFInstance.predict(dt: number): void
```

### Description
The EKF predict step advances the 6D state vector forward in time by `dt` seconds
using a constant-velocity kinematic model. The process covariance P grows according
to the Singer maneuver noise model with spectral density q_c.

State transition equations:
```
x_{k+1} = F * x_k

where F = [I₃   dt*I₃]  (6×6)
          [0₃   I₃   ]

Expanding:
  lat_{k+1}  = lat_k  + dt * vLat_k
  lon_{k+1}  = lon_k  + dt * vLon_k
  alt_{k+1}  = alt_k  + dt * vAlt_k
  vLat_{k+1} = vLat_k                 (constant velocity assumption)
  vLon_{k+1} = vLon_k
  vAlt_{k+1} = vAlt_k

P_{k+1} = F * P_k * Fᵀ + Q
```

### Acceptance Criteria
```
AC-W5-01-01: Given state [51.5, -0.1, 100, 1e-4, 0, 0] and dt=1.0s,
             predict step yields lat = 51.5001 ± 1e-10 (constant velocity)
AC-W5-01-02: Given zero velocity and dt=1.0s, position components unchanged
             within 1e-10 degrees/metres
AC-W5-01-03: Covariance trace after predict > covariance trace before predict
             (process noise causes covariance growth)
AC-W5-01-04: Predict with dt=0.1s gives smaller covariance growth than dt=1.0s
             (Singer Q scales with dt — Q[0][0] ∝ dt⁵/20)
AC-W5-01-05: Predict step does not modify R (measurement noise matrix) — R is
             only constructed during update step
AC-W5-01-06: Predict with dt=2.0s followed by predict with dt=1.0s equals
             predict with dt=3.0s (for state; P is non-linear but must be PD)
AC-W5-01-07: Covariance is symmetric after predict (|P[i][j] - P[j][i]| < 1e-14)
AC-W5-01-08: Calling predict before initialize throws EKFNotInitializedError
```

### Test IDs
```
TEST-W5-01-001: predict propagates position with non-zero velocity (AC-01)
TEST-W5-01-002: predict does not change position with zero velocity (AC-02)
TEST-W5-01-003: covariance grows after predict (AC-03)
TEST-W5-01-004: Singer Q scales correctly with dt (AC-04)
TEST-W5-01-005: R not modified during predict (AC-05)
TEST-W5-01-006: sequential predict gives correct compound position (AC-06)
TEST-W5-01-007: P symmetric after predict (AC-07)
TEST-W5-01-008: predict before initialize throws (AC-08)
```

---

## FR-W5-02: EKF Update Step

```
FR-ID:        FR-W5-02
Title:        EKF update step — state converges toward measurement,
              covariance shrinks
Priority:     P0
Status:       PENDING
Depends on:   FR-W5-01 (EKFInstance initialized), MatrixOps
Implements:   EKFInstance.update(measurement: Position3D): void
```

### Description
The EKF update step incorporates a new position measurement from TdoaCorrelator.
Kalman gain K weights the measurement against the current state estimate. The
state moves toward the measurement; the covariance shrinks.

Update equations:
```
y   = z - H * x_k             (innovation)
S   = H * P_k * Hᵀ + R        (innovation covariance, 3×3)
K   = P_k * Hᵀ * S⁻¹          (Kalman gain, 6×3)
x   = x_k + K * y             (state update)
P   = (I - K*H) * P_k         (covariance update)

H = [I₃  0₃]   (3×6 — position selector)
R = diag(σ_lat², σ_lon², σ_alt²)
```

### Acceptance Criteria
```
AC-W5-02-01: After update, |state.lat - measurement.lat| < |prior_state.lat - measurement.lat|
             (state moves toward measurement, not away)
AC-W5-02-02: After update, covariance trace < pre-update covariance trace
             (Kalman update reduces uncertainty)
AC-W5-02-03: After update, covariance is symmetric
             (ensured by symmetrize after update)
AC-W5-02-04: Kalman gain K has shape 6×3 (verified by inspection in unit test)
AC-W5-02-05: After update with measurement exactly equal to predicted state,
             innovation y = [0,0,0] and state unchanged (identity measurement)
AC-W5-02-06: Calling update before initialize calls initialize internally
             (first measurement auto-initializes)
AC-W5-02-07: State velocity components (vLat, vLon, vAlt) are updated implicitly
             via the K*y term (K rows 3-5 are non-zero when P off-diagonals non-zero)
```

### Test IDs
```
TEST-W5-02-001: state moves toward measurement after update (AC-01)
TEST-W5-02-002: covariance shrinks after update (AC-02)
TEST-W5-02-003: P symmetric after update (AC-03)
TEST-W5-02-004: Kalman gain K dimensions correct (AC-04)
TEST-W5-02-005: zero innovation leaves state unchanged (AC-05)
TEST-W5-02-006: first update on uninitialized EKF auto-initializes (AC-06)
TEST-W5-02-007: velocity implicitly updated (AC-07)
```

---

## FR-W5-03: EKF Covariance Positive-Definite (Numerical Stability)

```
FR-ID:        FR-W5-03
Title:        EKF covariance remains positive-definite after 100+ iterations
Priority:     P0
Status:       PENDING
Depends on:   FR-W5-01, FR-W5-02
Implements:   EKFInstance.isPositiveDefinite(): boolean
              EKFInstance symmetrize + epsilon inflation logic
```

### Description
After many predict+update cycles, floating-point errors can cause the covariance
matrix to lose symmetry or positive-definiteness, causing the Kalman gain to become
undefined (matrix inversion failure) or negative. Mitigation:
- Symmetrize P after each step: P = (P + Pᵀ) / 2
- Epsilon diagonal inflation: P[i][i] += 1e-9 after each step
- Health check: if det(P_3×3 position submatrix) < 1e-20, log WARN and reinitialize

### Acceptance Criteria
```
AC-W5-03-01: After 100 predict+update cycles with noisy measurements,
             EKFInstance.isPositiveDefinite() returns true
AC-W5-03-02: After 100 predict-only (coast) cycles,
             EKFInstance.isPositiveDefinite() returns true
             (covariance grows but stays PD due to Singer Q being PSD)
AC-W5-03-03: P remains symmetric to 1e-12 tolerance after each cycle
AC-W5-03-04: If manually injected degenerate covariance (det → 0), EKFInstance
             detects via isPositiveDefinite() and reinitializes from last measurement
AC-W5-03-05: Epsilon inflation is applied — P[i][i] > 1e-9 for all i after any step
```

### Test IDs
```
TEST-W5-03-001: 100 cycles with noisy measurements → PD maintained (AC-01)
TEST-W5-03-002: 100 coast cycles → PD maintained (AC-02)
TEST-W5-03-003: P symmetric to 1e-12 after mixed cycles (AC-03)
TEST-W5-03-004: degenerate P triggers reinitialization (AC-04)
TEST-W5-03-005: epsilon inflation applied (AC-05)
```

---

## FR-W5-04: Polynomial Surrogate Predictor

```
FR-ID:        FR-W5-04
Title:        Polynomial surrogate predictor — fits quadratic to last 5 EKF
              state estimates and extrapolates to 5 horizons
Priority:     P0
Status:       PENDING
Depends on:   FR-W5-01, FR-W5-02 (EKF states as input)
Implements:   PolynomialPredictor class
```

### Description
PolynomialPredictor takes the last N (default 5) EKF state snapshots and fits
a 2nd-degree polynomial to each axis (lat, lon, alt) independently using
least-squares. The fitted polynomial is then evaluated at +1s, +2s, +3s, +5s, +10s.

### Acceptance Criteria
```
AC-W5-04-01: Given 5 collinear positions at constant velocity, polynomial fit
             extrapolates to the correct linear continuation (a₂ ≈ 0)
AC-W5-04-02: Given 5 positions on a parabolic trajectory (constant acceleration),
             polynomial fit correctly extrapolates the parabola
AC-W5-04-03: With N < 2 positions, returns empty horizons array (not an error)
AC-W5-04-04: Fit coefficients are computed without requiring external math libraries
             (pure MatrixOps: matInv3x3 for normal equations)
AC-W5-04-05: Time normalization applied: t₀ = first_timestamp subtracted before fit
             (prevents Vandermonde conditioning issues with large Unix timestamps)
AC-W5-04-06: NaN or Infinity in input states returns empty horizons, logs ERROR
```

### Test IDs
```
TEST-W5-04-001: linear trajectory extrapolated correctly (AC-01)
TEST-W5-04-002: parabolic trajectory extrapolated correctly (AC-02)
TEST-W5-04-003: N<2 returns empty array (AC-03)
TEST-W5-04-004: no external math dependencies (AC-04)
TEST-W5-04-005: time normalization prevents conditioning issues (AC-05)
TEST-W5-04-006: NaN input returns empty + logs error (AC-06)
```

---

## FR-W5-05: 5-Horizon Output

```
FR-ID:        FR-W5-05
Title:        Prediction output contains exactly 5 horizons at +1s,+2s,+3s,+5s,+10s
Priority:     P0
Status:       PENDING
Depends on:   FR-W5-04
Implements:   PolynomialPredictor.predict(): PredictionHorizon[]
```

### Description
When sufficient data is available (N ≥ 2 positions), the predictor must return
exactly 5 PredictionHorizon objects with horizonSeconds = [1, 2, 3, 5, 10].
Each horizon has a timestamp = now + horizonSeconds * 1000 and a confidence
computed by exponential decay.

### Acceptance Criteria
```
AC-W5-05-01: Output array has exactly 5 elements when N ≥ 2
AC-W5-05-02: horizonSeconds values are [1, 2, 3, 5, 10] (exact, in order)
AC-W5-05-03: Each horizon timestamp = lastStateTimestamp + horizonSeconds * 1000
AC-W5-05-04: Horizons are ordered ascending by horizonSeconds
AC-W5-05-05: All lat/lon values are finite (not NaN, not Infinity)
AC-W5-05-06: All alt values are finite and ≥ 0 (clamped to 0 if polynomial
             extrapolation produces negative altitude)
```

### Test IDs
```
TEST-W5-05-001: exactly 5 horizons returned (AC-01)
TEST-W5-05-002: horizonSeconds = [1,2,3,5,10] (AC-02)
TEST-W5-05-003: timestamps correctly offset from last state (AC-03)
TEST-W5-05-004: horizons ordered ascending (AC-04)
TEST-W5-05-005: no NaN/Infinity in lat/lon (AC-05)
TEST-W5-05-006: alt clamped to 0 on negative extrapolation (AC-06)
```

---

## FR-W5-06: Impact Estimator

```
FR-ID:        FR-W5-06
Title:        Impact estimator projects velocity vector to alt=0 and returns
              estimated impact point with confidence
Priority:     P0
Status:       PENDING
Depends on:   FR-W5-01 (EKFState), FR-W5-09 (confidence)
Implements:   ImpactEstimator.estimate(state: EKFState): ImpactEstimate | null
```

### Description
When a drone is descending (vAlt < 0), project its current EKF state forward
at constant velocity to the ground (alt = 0). Apply confidence gate: if
confidence < EKF_CONFIDENCE_GATE (default 0.4), return null. Apply bounds check:
timeToImpact must be within [0.5s, 300s].

### Acceptance Criteria
```
AC-W5-06-01: Given alt=100m, vAlt=-2m/s → timeToImpact = 50s
AC-W5-06-02: Given vLat=1e-4 deg/s, vAlt=-2m/s, alt=100m →
             impactLat = lat + 1e-4 * 50 (linear extrapolation)
AC-W5-06-03: Given vAlt = 0 (level) → returns null
AC-W5-06-04: Given vAlt > 0 (ascending) → returns null
AC-W5-06-05: timeToImpact < 0.5s → returns null (already at ground)
AC-W5-06-06: timeToImpact > 300s → returns null (too far future, low confidence)
AC-W5-06-07: confidence < EKF_CONFIDENCE_GATE (0.4) → returns null
AC-W5-06-08: alt ≤ 0 → returns immediate impact at current lat/lon with
             timeToImpactSeconds = 0
```

### Test IDs
```
TEST-W5-06-001: correct timeToImpact from alt + vAlt (AC-01)
TEST-W5-06-002: correct impact lat/lon extrapolation (AC-02)
TEST-W5-06-003: level flight returns null (AC-03)
TEST-W5-06-004: ascending flight returns null (AC-04)
TEST-W5-06-005: very fast descent (t<0.5s) returns null (AC-05)
TEST-W5-06-006: very slow descent (t>300s) returns null (AC-06)
TEST-W5-06-007: low confidence gated out (AC-07)
TEST-W5-06-008: drone already at ground returns immediate impact (AC-08)
```

---

## FR-W5-07: Prediction Publisher (NATS)

```
FR-ID:        FR-W5-07
Title:        Prediction publisher emits prediction to NATS JetStream on
              sentinel.predictions.{trackId} with ack semantics
Priority:     P0
Status:       PENDING
Depends on:   FR-W5-05, FR-W5-06, NatsClient
Implements:   PredictionPublisher.publishToNats()
```

### Description
For each processed track, publish a PredictionMessage to NATS JetStream.
Subject format: `sentinel.predictions.{trackId}`. Use JetStream publish with
ack (not core NATS pub) to ensure at-least-once delivery semantics.

### Acceptance Criteria
```
AC-W5-07-01: Published subject matches sentinel.predictions.{trackId} exactly
AC-W5-07-02: Message payload contains: trackId, timestamp, ekfState, horizons[],
             impactEstimate (null or ImpactEstimate), processedAt
AC-W5-07-03: JetStream publish awaits ack before returning (not fire-and-forget)
AC-W5-07-04: If NATS publish fails (connection error), error is logged and caught
             without crashing the prediction loop (non-fatal per-track error)
AC-W5-07-05: horizons array in published message is empty when N < 2 positions
             (not missing/undefined)
AC-W5-07-06: publishBatch processes all tracks; one track failure does not
             skip other tracks in the batch
AC-W5-07-07: processedAt timestamp is set immediately before publish (for latency
             measurement) — not the same as measurement timestamp
AC-W5-07-08: Tracks with empty horizons still publish (ekfState alone is useful)
```

### Test IDs
```
TEST-W5-07-001: subject format correct (AC-01)
TEST-W5-07-002: payload schema complete (AC-02)
TEST-W5-07-003: awaits NATS ack (AC-03)
TEST-W5-07-004: NATS error caught, loop continues (AC-04)
TEST-W5-07-005: empty horizons serialized as [] not undefined (AC-05)
TEST-W5-07-006: batch publish continues on single track error (AC-06)
TEST-W5-07-007: processedAt stamped before publish (AC-07)
TEST-W5-07-008: empty-horizon tracks still published (AC-08)
```

---

## FR-W5-08: Track Enrichment (Supabase)

```
FR-ID:        FR-W5-08
Title:        Track enrichment — upsert predicted_trajectory and ekf_state
              to Supabase tracks table after each prediction cycle
Priority:     P0
Status:       PENDING
Depends on:   FR-W5-05, FR-W5-07, Supabase client, Migration 005
Implements:   PredictionPublisher.publishToSupabase()
```

### Description
After publishing to NATS, upsert the prediction result to the Supabase tracks
table. The upsert uses trackId as the conflict key. Columns updated:
predicted_trajectory (JSONB), prediction_updated_at (TIMESTAMPTZ), ekf_state (JSONB),
ekf_covariance_trace (FLOAT8).

Batch upserts are used when processing multiple tracks per cycle to reduce
Supabase API call count.

### Acceptance Criteria
```
AC-W5-08-01: tracks.predicted_trajectory contains array of 5 PredictionHorizon
             objects (or empty array) as JSONB
AC-W5-08-02: tracks.prediction_updated_at is updated to current UTC time
             on each upsert (not null after first enrichment)
AC-W5-08-03: tracks.ekf_state contains {lat,lon,alt,vLat,vLon,vAlt,timestamp}
AC-W5-08-04: Upsert uses trackId as conflict key (no duplicate rows)
AC-W5-08-05: Batch upsert processes ≥10 tracks in a single Supabase API call
             (reduces round-trip overhead)
AC-W5-08-06: Supabase write error (5xx or timeout) is caught and logged;
             NATS publish is NOT rolled back (NATS and Supabase are independent)
AC-W5-08-07: If trackId does not exist in tracks table (track dropped before
             upsert completes), upsert creates a minimal row with available data
```

### Test IDs
```
TEST-W5-08-001: predicted_trajectory JSONB has 5 horizons (AC-01)
TEST-W5-08-002: prediction_updated_at updated on upsert (AC-02)
TEST-W5-08-003: ekf_state JSONB contains all 6 state components (AC-03)
TEST-W5-08-004: no duplicate rows on repeated upsert (AC-04)
TEST-W5-08-005: batch upsert issues single API call for multiple tracks (AC-05)
TEST-W5-08-006: Supabase error does not affect NATS publish (AC-06)
TEST-W5-08-007: upsert creates row if trackId missing (AC-07)
```

---

## FR-W5-09: Confidence Decay

```
FR-ID:        FR-W5-09
Title:        Confidence decays exponentially with prediction horizon; impact
              estimate gated below threshold
Priority:     P1
Status:       PENDING
Depends on:   FR-W5-04, FR-W5-05, FR-W5-06
Implements:   PolynomialPredictor confidence calculation,
              ImpactEstimator confidence gate
```

### Description
Prediction confidence models the increasing uncertainty of extrapolated positions.
Formula: confidence(h) = exp(-λ * h) where λ = EKF_CONFIDENCE_LAMBDA (default 0.07)
and h is the horizon in seconds.

Expected values at default λ=0.07:
```
+1s:  confidence = exp(-0.07) = 0.9324
+2s:  confidence = exp(-0.14) = 0.8694
+3s:  confidence = exp(-0.21) = 0.8106
+5s:  confidence = exp(-0.35) = 0.7047
+10s: confidence = exp(-0.70) = 0.4966
```

Impact estimate confidence gated at EKF_CONFIDENCE_GATE (default 0.4).

### Acceptance Criteria
```
AC-W5-09-01: +1s horizon confidence = exp(-λ * 1) ± 1e-6 (λ from config)
AC-W5-09-02: +10s horizon confidence = exp(-λ * 10) ± 1e-6
AC-W5-09-03: confidence values are monotonically decreasing across horizons
AC-W5-09-04: confidence values are all in [0, 1] range
AC-W5-09-05: impact estimate with timeToImpact=60s yields
             confidence = exp(-0.07*60) = 0.0150 < gate (0.4) → returns null
AC-W5-09-06: λ is configurable via environment variable (not hardcoded)
```

### Test IDs
```
TEST-W5-09-001: +1s confidence value correct (AC-01)
TEST-W5-09-002: +10s confidence value correct (AC-02)
TEST-W5-09-003: confidence monotonically decreasing (AC-03)
TEST-W5-09-004: confidence in [0,1] for all horizons (AC-04)
TEST-W5-09-005: long timeToImpact gated by confidence (AC-05)
TEST-W5-09-006: lambda configurable via env (AC-06)
```

---

## FR-W5-10: MultiTrackEKFManager

```
FR-ID:        FR-W5-10
Title:        MultiTrackEKFManager maintains one EKFInstance per active track;
              drops stale tracks after EKF_TRACK_DROPOUT_SECONDS (default 15s)
Priority:     P0
Status:       PENDING
Depends on:   FR-W5-01, FR-W5-02, FR-W5-03, FR-W5-04, FR-W5-05, FR-W5-06
Implements:   MultiTrackEKFManager class
```

### Description
Central coordinator for per-track state management. Uses Map<trackId, TrackEntry>
where TrackEntry holds EKFInstance, PolynomialPredictor, lastSeen timestamp, and
stateHistory circular buffer. Stale tracks are dropped by a 5-second interval
timer. Bootstrap reads confirmed tracks from Supabase on service startup.

### Acceptance Criteria
```
AC-W5-10-01: First detection for a new trackId creates a new EKFInstance
             (not shared with other tracks)
AC-W5-10-02: Second detection for same trackId reuses same EKFInstance
             (state history is preserved across calls)
AC-W5-10-03: processDetection returns PredictionResult with non-null horizons
             after ≥2 measurements for same track
AC-W5-10-04: dropStale() removes tracks where (now - lastSeen) > dropout threshold
AC-W5-10-05: getActiveTracks() returns only non-dropped track IDs
AC-W5-10-06: Track state does not cross-contaminate between different trackIds
             (isolated EKFInstance per track)
AC-W5-10-07: bootstrapFromSupabase initializes EKFInstance for each confirmed track
             with position from Supabase and zero velocity
AC-W5-10-08: dropStale() returns array of dropped trackId strings (for logging)
AC-W5-10-09: After dropout, new detection for same trackId creates fresh EKFInstance
             (not resurrection of stale state)
AC-W5-10-10: Manager handles 1000 simultaneous tracks without performance degradation
             (processDetection < 5ms per track at 1000-track load)
```

### Test IDs
```
TEST-W5-10-001: new trackId creates new EKFInstance (AC-01)
TEST-W5-10-002: same trackId reuses EKFInstance (AC-02)
TEST-W5-10-003: 2+ measurements → non-null horizons (AC-03)
TEST-W5-10-004: stale track dropped by dropStale() (AC-04)
TEST-W5-10-005: getActiveTracks excludes dropped tracks (AC-05)
TEST-W5-10-006: no state cross-contamination between tracks (AC-06)
TEST-W5-10-007: bootstrap from Supabase mock (AC-07)
TEST-W5-10-008: dropStale returns dropped IDs (AC-08)
TEST-W5-10-009: fresh EKF after dropout + re-detection (AC-09)
TEST-W5-10-010: 1000-track load test < 5ms per track (AC-10)
```

---

## FR-W5-11: EKF Coast on Missing Measurement

```
FR-ID:        FR-W5-11
Title:        EKF coasts (predict-only, no update) when no measurement received
              within the expected interval; state dead-reckons forward
Priority:     P1
Status:       PENDING
Depends on:   FR-W5-01
Implements:   EKFInstance.coast(dt: number): void
              MultiTrackEKFManager.coastTrack(trackId: string): void
```

### Description
Between detections, the EKF should continue to propagate state forward using
only the predict step. This allows the dashboard to show smooth track motion
even when a node's detections are momentarily absent. Coast mode runs until
either a new measurement arrives (triggers update) or the dropout timeout fires
(track removed).

### Acceptance Criteria
```
AC-W5-11-01: coast(dt) advances state position by dt * velocity (same as predict)
AC-W5-11-02: coast(dt) grows covariance (same as predict — uncertainty increases)
AC-W5-11-03: coast does NOT call the update step (no measurement incorporated)
AC-W5-11-04: State after coast followed by update is different from state after
             update without coast (coast advances the prior before update)
AC-W5-11-05: coastTrack called for trackId not in manager logs a WARN and returns
             (no crash, no state creation)
```

### Test IDs
```
TEST-W5-11-001: coast advances position by dt*velocity (AC-01)
TEST-W5-11-002: coast grows covariance (AC-02)
TEST-W5-11-003: coast does not call update internally (AC-03)
TEST-W5-11-004: coast-then-update differs from update alone (AC-04)
TEST-W5-11-005: coastTrack on unknown ID logs warn, does not crash (AC-05)
```

---

## FR Change Log

```
Version   Date        Change
──────────────────────────────────────────────────────────────────
1.0.0     2026-03-24  Initial FR register. FR-W5-01 to FR-W5-11 defined.
                      All priority and dependency decisions locked.
                      No changes expected before tdd-red phase.
```

---

## Traceability Matrix

```
FR-ID       ART (implements)                        Migration       Edge Fn
──────────────────────────────────────────────────────────────────────────────
FR-W5-01    ART-W5-001 EKFInstance                  —               —
FR-W5-02    ART-W5-001 EKFInstance                  —               —
FR-W5-03    ART-W5-001 EKFInstance                  —               —
FR-W5-04    ART-W5-003 PolynomialPredictor           —               —
FR-W5-05    ART-W5-003 PolynomialPredictor           —               ART-W5-011
FR-W5-06    ART-W5-004 ImpactEstimator               —               —
FR-W5-07    ART-W5-006 PredictionPublisher           —               —
FR-W5-08    ART-W5-006 PredictionPublisher           ART-W5-008 005  ART-W5-011
FR-W5-09    ART-W5-003, ART-W5-004                  —               —
FR-W5-10    ART-W5-005 MultiTrackEKFManager          ART-W5-009 006  ART-W5-012
FR-W5-11    ART-W5-001, ART-W5-005                  —               —
```
