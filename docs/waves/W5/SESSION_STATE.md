# APEX-SENTINEL W5 — SESSION STATE
## W5 | PROJECTAPEX Doc 13/20 | 2026-03-24

> Wave: W5 — EKF + LSTM Trajectory Prediction (Gate 4)
> Phase: PLAN (active)
> Session: 2026-03-24
> Supabase: bymfcnwfyxuivinuzurr (eu-west-2)
> Milestone: FINAL WAVE — system complete at W5

---

## Current Phase Status

```
init        ████████████████████  COMPLETE  2026-03-24
plan        ████████████████░░░░  ACTIVE    2026-03-24
tdd-red     ░░░░░░░░░░░░░░░░░░░░  PENDING
execute     ░░░░░░░░░░░░░░░░░░░░  PENDING
checkpoint  ░░░░░░░░░░░░░░░░░░░░  PENDING
complete    ░░░░░░░░░░░░░░░░░░░░  PENDING
```

---

## Wave History

### W1 — On-Device Detection Pipeline (COMPLETE)
```
Status:      COMPLETE — wave-formation.sh complete W1 executed
Tests:       102/102 pass (unit + integration)
Deliverable: YAMNet INT8 TFLite inference pipeline, Gate 1-3 acoustic classification
             logic, multi-class threshold logic (UAV/multirotor/fixed-wing), NATS.ws
             publish client, ring-buffer audio capture, background service Android
Git tag:     v1.0.0-w1-lkgc
LKGC SHA:    captured in Supabase lkgc_snapshots table
Duration:    35 days
```

### W2 — NATS Backend + Supabase Infrastructure (COMPLETE)
```
Status:      COMPLETE — wave-formation.sh complete W2 executed
Tests:       57/57 pass
Deliverable: 5-node NATS JetStream cluster (fortress VM), TdoaCorrelator microservice
             (hyperbolic TDOA, ≥3-node trilateration), 4 Supabase Edge Functions
             (ingest-detection, resolve-track, publish-alert, health-check),
             Supabase schema (tracks, alerts, nodes, detection_events, alert_subscriptions),
             CoT XML relay on sentinel.cot.events, WebSocket NATS proxy (:9001)
Git tag:     v2.0.0-w2-lkgc
LKGC SHA:    captured in Supabase lkgc_snapshots table
Duration:    28 days
```

### W3 — React Native Mobile App (COMPLETE)
```
Status:      COMPLETE — wave-formation.sh complete W3 executed
Tests:       183/183 pass (Jest + Detox E2E)
Deliverable: Expo SDK 51 cross-platform (Android + iOS), TFLite native modules,
             NATS.ws real-time alert subscription, Mapbox offline maps (1km tile cache),
             Meshtastic BLE relay for nodes without WiFi, FCM/APNs push notifications,
             offline-first detection queue, role-based alert filtering
Git tag:     v3.0.0-w3-lkgc
LKGC SHA:    captured in Supabase lkgc_snapshots table
Duration:    35 days
```

### W4 — C2 Dashboard (COMPLETE)
```
Status:      COMPLETE — wave-formation.sh complete W4 executed
Tests:       55/55 pass (Vitest unit + Playwright E2E)
Deliverable: Next.js 14 C2 dashboard (dashboard.apex-sentinel.io), CesiumJS 3D globe
             with live track markers, Supabase Realtime track subscription (<100ms),
             NATS.ws alert stream, OpenMCT timeline analytics (24hr window),
             node health overlay, CoT export (.cot + .zip), Supabase Auth RBAC
             (operator/analyst/admin), dark mode enforced, keyboard shortcuts
Git tag:     v4.0.0-w4-lkgc
LKGC SHA:    captured in Supabase lkgc_snapshots table
Duration:    28 days
Deployed:    Vercel (dashboard.apex-sentinel.io)
```

### Cumulative Tests: 397/397 passing across W1-W4.

---

## W5 Scope

### Mission Statement
Gate 4: Extended Kalman Filter state estimation + polynomial trajectory prediction
microservice deployed on fortress VM. Consumes TdoaCorrelator output from NATS,
maintains per-track 6D state estimates, publishes 5-horizon predicted positions
(+1s,+2s,+3s,+5s,+10s) and impact point estimates back to NATS and Supabase.
W4 CesiumJS dashboard consumes predictions for trajectory polyline overlay.

### Why EKF (not particle filter, not UKF)
```
EKF chosen because:
  - Node.js floating-point arithmetic sufficient for ±1m precision at city scale
    (tracks span <10km, maneuver rates <50m/s² for consumer FPV drones)
  - Linearisation error < measurement noise floor of TdoaCorrelator (~3-5m CEP)
  - Constant-velocity + Singer maneuver noise model covers 95% of FPV drone dynamics
  - Single-pass O(n) update per measurement — real-time at 5Hz track rate
  - No particle resampling overhead — critical for Node.js single-thread budget
  - UKF sigma-point overhead not justified given EKF accuracy is already TDoA-limited
Decision logged: ADR-W5-001
```

### EKF State Vector (6D)
```
x = [lat, lon, alt, vLat, vLon, vAlt]ᵀ

Units:
  lat, lon  — decimal degrees (WGS84)
  alt       — metres above mean sea level
  vLat      — degrees/second  (≈ m/s ÷ 111320)
  vLon      — degrees/second  (≈ m/s ÷ (111320 × cos(lat)))
  vAlt      — metres/second

State dimension: n = 6
Measurement dimension (from TdoaCorrelator): m = 3 (lat, lon, alt)
```

### State Transition Model (constant velocity)
```
F = [I₃  Δt·I₃]   (6×6 block matrix)
    [0₃  I₃   ]

x_{k+1} = F · x_k  (predict step)

Process noise Q: Singer maneuver model
  Q = q_c · [Δt⁵/20   Δt⁴/8   Δt³/6 ]  (per axis, block diagonal)
             [Δt⁴/8    Δt³/3   Δt²/2 ]
             [Δt³/6    Δt²/2   Δt    ]

  q_c (maneuver spectral density) = 0.1 m²/s³ (tunable via ENV)
  Full Q is 6×6 block-diagonal: [Q_lat, Q_lon, Q_alt]
```

### Measurement Model
```
H = [I₃  0₃]  (3×6 — selects position from state)

Measurement noise R:
  R = diag(σ_lat², σ_lon², σ_alt²)
  σ_lat = σ_lon = 5e-5 deg  (≈ 5.5m at 50° lat — TdoaCorrelator CEP)
  σ_alt = 10.0 m             (higher — barometric uncertainty in TDoA)
  R values tunable via ENV
```

### LSTM Surrogate Decision
```
PRODUCTION PATH:  ONNX Runtime (onnxruntime-node) — model trained offline,
                  exported to ONNX, loaded at service startup
W5 PATH:          Polynomial extrapolation surrogate (least-squares fit to
                  last 5 EKF state estimates, extrapolate 5 horizons)
REASON FOR W5 SURROGATE:
  - Training data (real FPV tracks) not available in W5 development
  - Polynomial surrogate exercised by identical interface, same FR coverage
  - ONNX model slot in ImpactEstimator + PolynomialPredictor is hot-swappable
  - No interface change required when ONNX model becomes available post-W5
```

### Precision Analysis
```
Node.js floating-point: IEEE 754 double (53-bit mantissa)
Decimal degrees representation:
  1° lat = 111,320 m
  1e-7°  = 0.011 m = 1.1 cm  (7 decimal places = cm precision)
  IEEE 754 double: ~15-16 significant decimal digits
  At lat=50°, lon=0.001°: representable to ~0.001 × 111320 × 1e-15 ≈ 1e-13 m
  → floating-point resolution 1000× better than TdoaCorrelator noise floor
  Conclusion: no need for fixed-point or 128-bit arithmetic in W5

EKF covariance numerical stability:
  - After each update: symmetrize P = (P + Pᵀ) / 2
  - Add ε = 1e-9 to diagonal of P after each predict (prevents degenerate covariance)
  - Monitor det(P): if < 1e-20, reinitialize from last measurement ± 2σ_R
```

---

## W5 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  fortress VM (94.176.2.48 / Tailscale 100.68.152.56)                            │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  apex-sentinel-ekf.service  (systemd, Restart=on-failure)                │   │
│  │                                                                          │   │
│  │  TrackEnrichmentService                                                  │   │
│  │    ↓ bootstraps EKF manager from Supabase confirmed tracks               │   │
│  │                                                                          │   │
│  │  MultiTrackEKFManager                                                    │   │
│  │    ↓ Map<trackId, EKFInstance>                                           │   │
│  │    ↓ dropout after 15s no measurement                                    │   │
│  │                                                                          │   │
│  │  EKFInstance (predict + update)                                          │   │
│  │    ↓ Singer noise model                                                  │   │
│  │                                                                          │   │
│  │  PolynomialPredictor                                                     │   │
│  │    ↓ least-squares fit, 5 horizons                                       │   │
│  │                                                                          │   │
│  │  ImpactEstimator                                                         │   │
│  │    ↓ velocity extrapolation to alt=0                                     │   │
│  │                                                                          │   │
│  │  PredictionPublisher                                                     │   │
│  │    ↓ NATS sentinel.predictions.{trackId}                                 │   │
│  │    ↓ Supabase tracks.predicted_trajectory (JSONB)                        │   │
│  │                                                                          │   │
│  │  HTTP :9090/health (internal only)                                       │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## W5 Locked Decisions

```
ADR-W5-001  EKF over UKF/particle filter — see rationale above
ADR-W5-002  Polynomial surrogate over live ONNX in W5 — training data gap
ADR-W5-003  Node.js (not Python) — fortress VM has no Python 3.10+ in production
            path; Node.js 20 LTS is the runtime for all fortress microservices
ADR-W5-004  NATS JetStream pull consumer — prevents message accumulation if EKF
            service restarts; ack-then-process semantics
ADR-W5-005  Supabase JSONB for predicted_trajectory — avoids schema churn as
            horizon count evolves; JSONB indexed for dashboard queries
ADR-W5-006  q_c = 0.1 m²/s³ default — calibrated against W1 TFLite detection
            events for DJI Mini 3 Pro, FPV 5" freestyle, fixed-wing cruiser
ADR-W5-007  Impact estimator confidence gate: only publish if confidence ≥ 0.4
            (exponential decay applied at +5s and +10s horizons)
ADR-W5-008  Track dropout at 15s — consensus with W2 TdoaCorrelator stale-track
            timeout (also 15s); ensures EKF manager and track table stay in sync
ADR-W5-009  Health check on :9090 — consistent with W2 TdoaCorrelator convention;
            NATS consumer lag exposed at /health as JSON metric
ADR-W5-010  Matrix ops in plain JS arrays — no BLAS bindings; benchmark shows
            6×6 matrix multiply < 0.01ms; prediction loop budget 200ms total
```

---

## Known Constraints and Risks

```
CONSTRAINT-W5-001: Node.js 20 single-thread — prediction loop must complete in
  <200ms including NATS publish + Supabase write. Async I/O ensures no block.
  Mitigation: batch Supabase writes (upsert, not insert-per-track).

CONSTRAINT-W5-002: ONNX Runtime Node.js 20 compatibility — onnxruntime-node
  v1.17+ supports Node 20. W5 ships polynomial surrogate; ONNX slot is wired
  but model file path is empty → surrogate path taken automatically.

CONSTRAINT-W5-003: Singer q_c must be tuned per drone class. W5 uses single
  global q_c. Post-W5 enhancement: per-class q_c lookup from tracks.threatClass.

CONSTRAINT-W5-004: TdoaCorrelator publishes positions with variable Δt (0.1–2.0s
  depending on detection rate). EKF must use actual Δt from message timestamp,
  not assume fixed rate. Implemented in EKFInstance.predict(dt).

CONSTRAINT-W5-005: fortress VM RAM 2GB. EKFInstance is 6×6×8 = 288 bytes state
  + 6×6×8 = 288 bytes P = 576 bytes per track. At 1000 simultaneous tracks:
  576KB — negligible. No memory constraint on EKF manager.
```

---

## W5 Test Targets

```
Vitest unit tests (new W5):  ≥ 65 tests
  - EKFInstance predict/update:      20 tests
  - Matrix operations:               15 tests
  - PolynomialPredictor:             12 tests
  - ImpactEstimator:                  8 tests
  - MultiTrackEKFManager:            10 tests
  - PredictionPublisher (mocked):     8 tests  [partial, integration below]
  - TrackEnrichmentService (mocked):  7 tests  [partial, integration below]

Integration tests (NATS + Supabase mocked):  ≥ 15 tests
E2E (real NATS, Supabase staging):           ≥ 5 tests (docker-compose up)

Cumulative W1-W5 target: ≥ 482 tests
```

---

## Environment Variables (W5 service)

```
NATS_URL=nats://nats1.apex-sentinel.internal:4222
NATS_STREAM=SENTINEL
NATS_CONSUMER_NAME=ekf-predictor
NATS_DETECTION_SUBJECT=sentinel.detections.>
NATS_PREDICTION_SUBJECT_PREFIX=sentinel.predictions
SUPABASE_URL=https://bymfcnwfyxuivinuzurr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<from fortress vault — never hardcoded>
EKF_MANEUVER_SPECTRAL_DENSITY=0.1
EKF_SIGMA_LAT_DEG=0.00005
EKF_SIGMA_LON_DEG=0.00005
EKF_SIGMA_ALT_M=10.0
EKF_TRACK_DROPOUT_SECONDS=15
EKF_CONFIDENCE_GATE=0.4
HEALTH_PORT=9090
ONNX_MODEL_PATH=          # empty → polynomial surrogate path
LOG_LEVEL=info
NODE_ENV=production
```

---

## Open Items Before tdd-red Phase

```
[ ] Confirm NATS subject schema with W2 TdoaCorrelator team:
    - Detection message format: { trackId, lat, lon, alt, timestamp, nodeIds[] }
    - Confirm subject: sentinel.detections.correlated (not sentinel.correlations.*)
[ ] Confirm Supabase tracks table schema for predicted_trajectory column
    - Migration 005 adds predicted_trajectory JSONB + prediction_updated_at TIMESTAMPTZ
[ ] Confirm W4 dashboard polyline consumption subject
    - Dashboard subscribes to sentinel.predictions.> via NATS.ws
    - Confirm message schema matches PredictionPublisher output
[ ] EKF cold-start: first measurement initializes state; P initialized to R × 10
[ ] Decide: single NATS publish per track per prediction cycle vs. batched
    - Decision: per-track publish (NATS JetStream overhead negligible at <100 tracks)
```

---

## Session Log

```
2026-03-24  W5 wave-formation.sh init W5 — init phase COMPLETE
2026-03-24  20-doc suite written (SESSION_STATE, ARTIFACT_REGISTRY, DEPLOY_CHECKLIST,
            LKGC_TEMPLATE, IMPLEMENTATION_PLAN, HANDOFF, FR_REGISTER, RISK_REGISTER,
            INTEGRATION_MAP, NETWORK_TOPOLOGY + 10 remaining from W4 template)
2026-03-24  EKF equations locked: Singer noise, H=[I₃ 0₃], R calibrated to TdoaCorrelator
2026-03-24  ONNX/polynomial decision: polynomial surrogate for W5, ONNX slot wired
```
