# APEX-SENTINEL W5 — ARTIFACT REGISTRY
## W5 | PROJECTAPEX Doc 14/20 | 2026-03-24

> Wave: W5 — EKF + LSTM Trajectory Prediction (Gate 4)
> All W5 deliverables, ownership, acceptance criteria, and storage locations.
> Supabase: bymfcnwfyxuivinuzurr (eu-west-2)

---

## 1. Registry Overview

```
Category                              Count         Status
─────────────────────────────────────────────────────────────
Core TypeScript classes               6 classes     PENDING
NATS integration module               1 module      PENDING
Supabase migrations (W5)              3 migrations  PENDING
Supabase Edge Functions (W5)          2 functions   PENDING
Matrix operations library             1 module      PENDING
Vitest unit test suite                ≥65 tests     PENDING
Integration test suite                ≥15 tests     PENDING
E2E test suite (docker-compose)       ≥5 tests      PENDING
systemd service unit file             1 unit file   PENDING
Health check HTTP server              1 module      PENDING
Docker Compose (test stack)           1 file        PENDING
TypeScript type declarations          1 file        PENDING
```

Total W5 test target: ≥ 85 tests
Cumulative W1-W5 target: ≥ 482 tests

---

## 2. Core TypeScript Classes

### ART-W5-001: EKFInstance
```
artifact_id:   ART-W5-001
name:          EKFInstance
type:          TypeScript class
path:          src/ekf/EKFInstance.ts
test_file:     src/ekf/__tests__/EKFInstance.test.ts
test_count:    20 unit tests
owner:         W5 execution
FR_coverage:   FR-W5-01, FR-W5-02, FR-W5-03, FR-W5-11
depends_on:    src/ekf/MatrixOps.ts
exports:       EKFInstance (default), EKFState (type), EKFConfig (type)

Responsibilities:
  - Maintains 6D state vector x = [lat,lon,alt,vLat,vLon,vAlt]
  - Maintains 6×6 covariance matrix P
  - predict(dt: number): void — constant-velocity state transition + Singer Q
  - update(measurement: Position3D): void — measurement residual + Kalman gain
  - getState(): EKFState — immutable snapshot
  - isPositiveDefinite(): boolean — numerical health check
  - symmetrize(): void — enforces P = (P + Pᵀ) / 2

State vector representation:
  x[0] = lat (decimal degrees WGS84)
  x[1] = lon (decimal degrees WGS84)
  x[2] = alt (metres AMSL)
  x[3] = vLat (degrees/second)
  x[4] = vLon (degrees/second)
  x[5] = vAlt (metres/second)

Predict step equations:
  x_k+1 = F * x_k
  P_k+1 = F * P_k * Fᵀ + Q
  where F = block([[I₃, Δt*I₃], [0₃, I₃]])

Update step equations:
  y = z - H * x_k        (innovation / residual)
  S = H * P_k * Hᵀ + R   (innovation covariance)
  K = P_k * Hᵀ * S⁻¹     (Kalman gain)
  x_k+1 = x_k + K * y
  P_k+1 = (I - K*H) * P_k

Numerical stability:
  After update: P = (P + Pᵀ)/2  (symmetrize)
  After predict: P[i][i] += 1e-9  (epsilon inflation)
  If det(P_pos_submatrix) < 1e-20: log WARN + reinitialize P from R*10
```

### ART-W5-002: MatrixOps
```
artifact_id:   ART-W5-002
name:          MatrixOps
type:          TypeScript module (pure functions)
path:          src/ekf/MatrixOps.ts
test_file:     src/ekf/__tests__/MatrixOps.test.ts
test_count:    15 unit tests
owner:         W5 execution
FR_coverage:   FR-W5-01, FR-W5-02, FR-W5-03
depends_on:    none (zero dependencies — plain JS arrays)

Exported functions:
  matMul(A: number[][], B: number[][]): number[][]
  matAdd(A: number[][], B: number[][]): number[][]
  matSub(A: number[][], B: number[][]): number[][]
  matTranspose(A: number[][]): number[][]
  matScale(A: number[][], s: number): number[][]
  matInv2x2(A: number[][]): number[][]
  matInv3x3(A: number[][]): number[][]
  matIdentity(n: number): number[][]
  matZero(rows: number, cols: number): number[][]
  matSymmetrize(A: number[][]): number[][]
  matIsPositiveDefinite(A: number[][]): boolean
  matDet2x2(A: number[][]): number
  matDet3x3(A: number[][]): number
  matVecMul(A: number[][], v: number[]): number[]
  vecSub(a: number[], b: number[]): number[]
  vecAdd(a: number[], b: number[]): number[]

Performance target:
  6×6 matMul: < 0.01ms (Node.js 20 benchmark)
  Full predict+update cycle: < 1ms
```

### ART-W5-003: PolynomialPredictor
```
artifact_id:   ART-W5-003
name:          PolynomialPredictor
type:          TypeScript class
path:          src/predictor/PolynomialPredictor.ts
test_file:     src/predictor/__tests__/PolynomialPredictor.test.ts
test_count:    12 unit tests
owner:         W5 execution
FR_coverage:   FR-W5-04, FR-W5-05, FR-W5-09
depends_on:    none

Responsibilities:
  - Accepts circular buffer of last N EKF state snapshots (default N=5)
  - Fits 2nd-degree polynomial to lat(t), lon(t), alt(t) separately (least-squares)
  - Extrapolates to 5 prediction horizons: +1s, +2s, +3s, +5s, +10s
  - Computes per-horizon confidence via exponential decay:
      confidence(h) = exp(-λ * h)  where λ = 0.07 (default)
      → +1s: 0.93, +2s: 0.87, +3s: 0.81, +5s: 0.70, +10s: 0.50
  - Returns PredictionHorizon[] with { lat, lon, alt, timestamp, confidence }
  - ONNX hot-swap interface: if OnnxPredictor present, delegates; else polynomial

Polynomial fit method:
  For each axis (lat, lon, alt):
    Given points (t_i, y_i) for i=0..N-1
    Fit y = a₀ + a₁t + a₂t²  via normal equations (Aᵀ A)⁻¹ Aᵀ y
    A = Vandermonde matrix [[1, t_i, t_i²]]
    Coefficients a = (AᵀA)⁻¹ Aᵀ y
    Extrapolate: y(t) = a₀ + a₁(t_now + h) + a₂(t_now + h)²

Failure modes handled:
  - N < 2 positions: return empty predictions, log WARN
  - Degenerate Vandermonde (all timestamps equal): fall back to constant extrapolation
  - Any NaN/Infinity in coefficients: return empty, log ERROR
```

### ART-W5-004: ImpactEstimator
```
artifact_id:   ART-W5-004
name:          ImpactEstimator
type:          TypeScript class
path:          src/predictor/ImpactEstimator.ts
test_file:     src/predictor/__tests__/ImpactEstimator.test.ts
test_count:    8 unit tests
owner:         W5 execution
FR_coverage:   FR-W5-06, FR-W5-09
depends_on:    ART-W5-001 (EKFState)

Responsibilities:
  - Takes current EKFState (position + velocity)
  - Computes time to impact: t_impact = -alt / vAlt  (when vAlt < 0)
  - Computes impact position: lat_i = lat + vLat * t_impact,
                               lon_i = lon + vLon * t_impact
  - Applies confidence gate: if confidence < EKF_CONFIDENCE_GATE (0.4), return null
  - Returns ImpactEstimate | null: { lat, lon, timestamp, timeToImpactSeconds, confidence }
  - Bounds check: t_impact must be in [0.5, 300] seconds; outside range → null

Edge cases:
  - vAlt ≥ 0 (ascending or level): return null (no impact estimate)
  - alt ≤ 0: already on ground → return immediate impact at current lat/lon
  - Very low confidence from PolynomialPredictor: gate blocks publish
```

### ART-W5-005: MultiTrackEKFManager
```
artifact_id:   ART-W5-005
name:          MultiTrackEKFManager
type:          TypeScript class
path:          src/ekf/MultiTrackEKFManager.ts
test_file:     src/ekf/__tests__/MultiTrackEKFManager.test.ts
test_count:    10 unit tests
owner:         W5 execution
FR_coverage:   FR-W5-10, FR-W5-11
depends_on:    ART-W5-001, ART-W5-002

Responsibilities:
  - Manages Map<trackId, { ekf: EKFInstance, predictor: PolynomialPredictor,
                            lastSeen: number, stateHistory: EKFState[] }>
  - processDetection(msg: DetectionMessage): PredictionResult
      → upserts EKFInstance for trackId
      → calls ekf.predict(dt) then ekf.update(measurement)
      → appends state to stateHistory (circular buffer, max 10)
      → calls PolynomialPredictor.predict(stateHistory)
      → calls ImpactEstimator.estimate(currentState)
      → returns PredictionResult
  - coastTrack(trackId: string): void
      → calls ekf.predict(dt) without update (dead-reckoning)
  - dropStale(): string[]
      → removes tracks with lastSeen > EKF_TRACK_DROPOUT_SECONDS
      → returns array of dropped trackIds
  - getActiveTracks(): string[]
  - bootstrapFromSupabase(tracks: ConfirmedTrack[]): Promise<void>
      → initializes EKFInstance for each confirmed track on service startup

Dropout logic:
  setInterval(() => manager.dropStale(), 5000) every 5 seconds
  Dropped tracks: log INFO + publish sentinel.tracks.dropped.{trackId}
```

### ART-W5-006: PredictionPublisher
```
artifact_id:   ART-W5-006
name:          PredictionPublisher
type:          TypeScript class
path:          src/publisher/PredictionPublisher.ts
test_file:     src/publisher/__tests__/PredictionPublisher.test.ts
test_count:    8 unit tests (mocked NATS + Supabase)
owner:         W5 execution
FR_coverage:   FR-W5-07, FR-W5-08
depends_on:    ART-W5-005, NATS connection, Supabase client

Responsibilities:
  - publishToNats(trackId, result: PredictionResult): Promise<void>
      → subject: sentinel.predictions.{trackId}
      → payload: { trackId, horizons: PredictionHorizon[], impactEstimate,
                   ekfState, timestamp }
      → JetStream publish with ack
  - publishToSupabase(trackId, result: PredictionResult): Promise<void>
      → upsert to tracks table: predicted_trajectory (JSONB), prediction_updated_at
      → upsert uses trackId as conflict key
  - publishBatch(results: Map<string, PredictionResult>): Promise<void>
      → parallel Promise.all over per-track publishes
      → catches per-track errors without killing batch (log + continue)
  - Metrics: tracks published count, last publish timestamp, error rate
```

### ART-W5-007: TrackEnrichmentService
```
artifact_id:   ART-W5-007
name:          TrackEnrichmentService
type:          TypeScript class
path:          src/service/TrackEnrichmentService.ts
test_file:     src/service/__tests__/TrackEnrichmentService.test.ts
test_count:    7 unit tests (mocked)
owner:         W5 execution
FR_coverage:   FR-W5-07, FR-W5-08, FR-W5-10
depends_on:    ART-W5-005, ART-W5-006, NATS consumer

Responsibilities:
  - Main service orchestrator (entry point for systemd process)
  - Initializes NATS JetStream pull consumer on SENTINEL stream
  - Calls manager.bootstrapFromSupabase() on startup
  - Pull loop: fetch(maxMessages=10, expires=1000ms) → processDetection → publish
  - Registers SIGTERM/SIGINT handlers for graceful shutdown
  - Starts health check HTTP server on :9090
  - Starts stale-track cleanup interval (5s)
  - Exposes metrics: active tracks count, processed messages/s, NATS lag

Entry point:
  src/service/main.ts → new TrackEnrichmentService(config).start()
```

---

## 3. Supabase Migrations (W5)

### ART-W5-008: Migration 005 — predicted_trajectory column
```
artifact_id:   ART-W5-008
name:          005_ekf_predicted_trajectory
type:          Supabase SQL migration
path:          supabase/migrations/005_ekf_predicted_trajectory.sql
owner:         W5 execution
FR_coverage:   FR-W5-08
applies_to:    public.tracks table

Changes:
  ALTER TABLE tracks
    ADD COLUMN predicted_trajectory JSONB,
    ADD COLUMN prediction_updated_at TIMESTAMPTZ,
    ADD COLUMN ekf_state JSONB,
    ADD COLUMN ekf_covariance_trace FLOAT8;

  CREATE INDEX CONCURRENTLY idx_tracks_prediction_updated_at
    ON tracks(prediction_updated_at DESC)
    WHERE prediction_updated_at IS NOT NULL;

  COMMENT ON COLUMN tracks.predicted_trajectory IS
    'JSON array of PredictionHorizon: [{lat,lon,alt,timestamp,confidence,horizonSeconds}]';
  COMMENT ON COLUMN tracks.ekf_state IS
    'Snapshot of EKF state vector at last update: {lat,lon,alt,vLat,vLon,vAlt}';
```

### ART-W5-009: Migration 006 — ekf_tracks_audit
```
artifact_id:   ART-W5-009
name:          006_ekf_tracks_audit
type:          Supabase SQL migration
path:          supabase/migrations/006_ekf_tracks_audit.sql
owner:         W5 execution
FR_coverage:   FR-W5-10, operational audit trail

Changes:
  CREATE TABLE ekf_track_events (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    track_id      UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    event_type    TEXT NOT NULL CHECK (event_type IN ('init','predict','update','coast','drop')),
    ekf_state     JSONB,
    measurement   JSONB,
    innovation    FLOAT8[],
    created_at    TIMESTAMPTZ DEFAULT now() NOT NULL
  );

  CREATE INDEX idx_ekf_track_events_track_id
    ON ekf_track_events(track_id, created_at DESC);

  -- Partition by day after 30 days of data (post-W5 ops task)
  -- RLS: service_role only (no direct client access)
  ALTER TABLE ekf_track_events ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "service_role_only" ON ekf_track_events
    USING (auth.role() = 'service_role');
```

### ART-W5-010: Migration 007 — ekf_config table
```
artifact_id:   ART-W5-010
name:          007_ekf_config
type:          Supabase SQL migration
path:          supabase/migrations/007_ekf_config.sql
owner:         W5 execution
FR_coverage:   operational tunability

Changes:
  CREATE TABLE ekf_config (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    config_key          TEXT UNIQUE NOT NULL,
    config_value        TEXT NOT NULL,
    description         TEXT,
    updated_at          TIMESTAMPTZ DEFAULT now() NOT NULL
  );

  INSERT INTO ekf_config (config_key, config_value, description) VALUES
    ('maneuver_spectral_density', '0.1',     'Singer q_c in m²/s³'),
    ('sigma_lat_deg',             '0.00005', 'TdoaCorrelator lat uncertainty (degrees)'),
    ('sigma_lon_deg',             '0.00005', 'TdoaCorrelator lon uncertainty (degrees)'),
    ('sigma_alt_m',               '10.0',    'TdoaCorrelator alt uncertainty (metres)'),
    ('track_dropout_seconds',     '15',      'Seconds before EKF drops stale track'),
    ('confidence_gate',           '0.4',     'Minimum confidence to publish impact estimate'),
    ('prediction_lambda',         '0.07',    'Exponential confidence decay rate');

  -- Service reads this table on startup; ENV overrides take precedence
```

---

## 4. Supabase Edge Functions (W5)

### ART-W5-011: Edge Function — get-track-predictions
```
artifact_id:   ART-W5-011
name:          get-track-predictions
type:          Supabase Edge Function (Deno)
path:          supabase/functions/get-track-predictions/index.ts
owner:         W5 execution
FR_coverage:   FR-W5-08 (dashboard consumption)

Endpoint:    GET /functions/v1/get-track-predictions?trackId={uuid}
Auth:        Bearer token (Supabase JWT, role: operator/analyst/admin)
Response:    { trackId, ekfState, predictedTrajectory: PredictionHorizon[],
              impactEstimate: ImpactEstimate | null, predictionUpdatedAt }
Latency SLA: < 50ms (served from Supabase eu-west-2 close to fortress VM)
Error:       404 if trackId not found; 403 if role < operator
```

### ART-W5-012: Edge Function — get-ekf-health
```
artifact_id:   ART-W5-012
name:          get-ekf-health
type:          Supabase Edge Function (Deno)
path:          supabase/functions/get-ekf-health/index.ts
owner:         W5 execution
FR_coverage:   operational monitoring

Endpoint:    GET /functions/v1/get-ekf-health
Auth:        service_role only (internal monitoring)
Response:    { activeTrackCount, processedMessagesPerSecond, natsConsumerLag,
              lastProcessedAt, ekfServiceUptime, supabaseWriteLatencyMs }
Source:      Reads from ekf_config table + recent ekf_track_events count
```

---

## 5. Test Suites

### ART-W5-013: Vitest Unit Suite
```
artifact_id:   ART-W5-013
name:          W5 Vitest unit tests
type:          Vitest test suite
path:          src/**/__tests__/*.test.ts
owner:         W5 tdd-red → execute phases
test_count:    ≥ 65 tests
FR_coverage:   FR-W5-01 through FR-W5-11

Test file map:
  src/ekf/__tests__/MatrixOps.test.ts          15 tests  FR-W5-01,02,03
  src/ekf/__tests__/EKFInstance.test.ts         20 tests  FR-W5-01,02,03,11
  src/predictor/__tests__/PolynomialPredictor.test.ts  12 tests  FR-W5-04,05,09
  src/predictor/__tests__/ImpactEstimator.test.ts       8 tests  FR-W5-06,09
  src/ekf/__tests__/MultiTrackEKFManager.test.ts       10 tests  FR-W5-10,11
  src/publisher/__tests__/PredictionPublisher.test.ts   8 tests  FR-W5-07,08
  src/service/__tests__/TrackEnrichmentService.test.ts  7 tests  FR-W5-07,08

Vitest config: vitest.config.ts (existing — no changes needed)
Coverage gate: ≥80% branches, functions, lines, statements (existing gate)
```

### ART-W5-014: Integration Test Suite
```
artifact_id:   ART-W5-014
name:          W5 integration tests
type:          Vitest integration tests (mocked external services)
path:          tests/integration/ekf-pipeline.integration.test.ts
owner:         W5 execute phase
test_count:    ≥ 15 tests
FR_coverage:   FR-W5-07, FR-W5-08, FR-W5-10, FR-W5-11

Scope:
  - Full detection → EKF → predict → publish pipeline with NATS mock
  - Track dropout lifecycle: init → process → stale → drop
  - Bootstrap from Supabase mock data
  - Batch publish correctness
  - NATS consumer ack semantics (no double-process)
```

### ART-W5-015: E2E Test Suite
```
artifact_id:   ART-W5-015
name:          W5 E2E tests
type:          Vitest E2E (real NATS via docker-compose, Supabase staging)
path:          tests/e2e/ekf-e2e.test.ts
owner:         W5 execute phase (post-P3)
test_count:    ≥ 5 tests
FR_coverage:   FR-W5-07, FR-W5-08, end-to-end latency

Scope:
  - Real NATS JetStream (docker-compose up nats)
  - Supabase staging (bymfcnwfyxuivinuzurr staging branch)
  - Inject synthetic detection messages, verify NATS prediction publish
  - Verify Supabase tracks.predicted_trajectory updated
  - Latency assertion: TDoA inject → prediction publish ≤ 200ms
  - CesiumJS not tested here (W4 dashboard has its own test suite)
```

---

## 6. Infrastructure Artifacts

### ART-W5-016: systemd Service Unit
```
artifact_id:   ART-W5-016
name:          apex-sentinel-ekf.service
type:          systemd unit file
path:          infra/systemd/apex-sentinel-ekf.service
deploy_path:   /etc/systemd/system/apex-sentinel-ekf.service  (fortress VM)
owner:         W5 execute + deploy phases
FR_coverage:   operational

Key directives:
  Restart=on-failure     (NOT Restart=always — per CLAUDE.md non-negotiable rule)
  RestartSec=10
  ExecStart with timeout 300 wrapper before node invocation (per CLAUDE.md rule)
  EnvironmentFile=/etc/apex-sentinel/ekf.env
  StandardOutput=journal
  StandardError=journal
```

### ART-W5-017: Health Check HTTP Server
```
artifact_id:   ART-W5-017
name:          HealthServer
type:          TypeScript module
path:          src/service/HealthServer.ts
owner:         W5 execute phase
FR_coverage:   operational, DEPLOY_CHECKLIST gate

GET /health → { status: 'ok'|'degraded', activeTracks, natsConnected,
                supabaseReachable, uptimeSeconds, processedTotal,
                natsConsumerLag, lastProcessedAt }
Binds to 127.0.0.1:9090 (localhost only — no external exposure)
```

### ART-W5-018: Docker Compose Test Stack
```
artifact_id:   ART-W5-018
name:          docker-compose.test.yml
type:          Docker Compose file
path:          infra/docker-compose.test.yml
owner:         W5 execute phase (E2E tests only)
FR_coverage:   ART-W5-015

Services:
  nats: nats:2.10-alpine with JetStream enabled
  (Supabase: staging project — no local Supabase needed)

Usage:
  docker-compose -f infra/docker-compose.test.yml up -d
  npx vitest run tests/e2e/
  docker-compose -f infra/docker-compose.test.yml down
```

### ART-W5-019: TypeScript Type Declarations
```
artifact_id:   ART-W5-019
name:          W5 shared types
type:          TypeScript declaration file
path:          src/types/ekf.types.ts
owner:         W5 execution
FR_coverage:   all FRs (type safety)

Key types:
  EKFState         { lat, lon, alt, vLat, vLon, vAlt, timestamp }
  EKFConfig        { maneuverSpectralDensity, sigmaLatDeg, sigmaLonDeg, sigmaAltM, ... }
  Position3D       { lat, lon, alt, timestamp }
  PredictionHorizon { lat, lon, alt, timestamp, confidence, horizonSeconds }
  PredictionResult  { trackId, horizons, impactEstimate, ekfState, timestamp }
  ImpactEstimate   { lat, lon, timestamp, timeToImpactSeconds, confidence }
  DetectionMessage  { trackId, lat, lon, alt, timestamp, nodeIds, correlationScore }
  ConfirmedTrack    { id, lat, lon, alt, threatClass, lastSeen, status }
```

---

## 7. Cumulative Artifact Summary (W1-W5)

```
Wave  Deliverable Type              Count   Tests
──────────────────────────────────────────────────────
W1    TFLite inference pipeline      7       102
W2    NATS/TdoaCorrelator/Edge Fns   12      57
W3    React Native mobile app        18      183
W4    Next.js C2 dashboard           22      55
W5    EKF microservice               19      ≥85
──────────────────────────────────────────────────────
TOTAL                                78      ≥482
```

All artifacts tagged at LKGC: `v5.0.0-w5-lkgc`
All artifacts listed in Supabase `lkgc_snapshots` table on completion.
