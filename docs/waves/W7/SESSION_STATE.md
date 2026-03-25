# APEX-SENTINEL — SESSION_STATE.md
## Wave 7: Hardware Integration + Data Pipeline Rectification + Terminal Phase Detection
### Date: 2026-03-25 | Phase: W7 INIT — writing 20 PROJECTAPEX docs

---

## Wave Status

| Field | Value |
|-------|-------|
| Current wave | W7 |
| Phase | INIT — writing 20 PROJECTAPEX docs |
| Wave-formation phase | `init` |
| Date started | 2026-03-25 |
| Blocking issues | None |
| Prerequisites met | W6 COMPLETE — 629/629 tests GREEN, 14/14 mind-the-gap, pushed to main |
| Next action | `./wave-formation.sh tdd-red W7` — write 100+ RED tests across 10 new test files |

---

## W1–W6 Completion Summary

### W1 — Acoustic Pipeline Baseline
- **Status:** COMPLETE
- **Delivered:** AcousticPipeline, YAMNet surrogate, FFT, VAD, RF RSSI baseline, location coarsener
- **Test count at W1 complete:** 83 tests

### W2 — NATS JetStream + Correlation + Alerts
- **Status:** COMPLETE
- **Delivered:** 5 JetStream stream definitions, TDOA correlator, CoT generator, Telegram bot, CoT relay, edge functions
- **Cumulative tests:** ~200

### W3 — Mobile Business Logic
- **Status:** COMPLETE
- **Delivered:** NatsClient (reconnection + backoff), BatteryOptimizer, ModelManager, CalibrationRoutine, EventPublisher, CircuitBreaker
- **Cumulative tests:** ~310

### W4 — C2 Dashboard (TrackStore, AlertStore)
- **Status:** COMPLETE
- **Delivered:** TrackManager (Kalman), TDOA hyperbolic positioning, TrackStore, AlertStore, CoT export, keyboard shortcuts, stats, node registry
- **Cumulative tests:** ~408

### W5 — EKF Prediction Engine
- **Status:** COMPLETE
- **Test count:** 484 GREEN
- **mind-the-gap:** 14/14 PASS
- **Delivered:** ExtendedKalmanFilter (Singer Q, 6D), PolynomialPredictor (5 horizons), ImpactEstimator, PredictionPublisher, MultiTrackEKFManager (1000 tracks < 5ms/track), MatrixOps

### W6 — Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
- **Status:** COMPLETE
- **Test count:** 629 GREEN (484 W1-W5 + 145 W6)
- **mind-the-gap:** 14/14 PASS
- **Coverage:** 95.66% stmt / 89.22% branch / 97.19% funcs — all ≥ 80%
- **Git HEAD at W6 complete:** `3bc44be679e42823486eac16a83e3f2e5e47dfee`
- **Commit message:** `feat(W6): execute — 10 source modules, 629/629 GREEN, 14/14 mind-the-gap`
- **Delivered:**
  - `src/ml/acoustic-profile-library.ts` — 4 drone profiles (Shahed-136, Lancet-3, Mavic Mini, Orlan-10)
  - `src/ml/yamnnet-finetuner.ts` — YAMNet-512 fine-tuning + ONNX export (FP32/INT8/FP16)
  - `src/ml/false-positive-guard.ts` — Doppler-based vehicle rejection, 10s temporal buffer
  - `src/ml/dataset-pipeline.ts` — Telegram OSINT ingestion, -23 LUFS normalization, 80/10/10 split
  - `src/fusion/multi-node-fusion.ts` — IDW cross-node acoustic fusion (min 3 nodes)
  - `src/prediction/monte-carlo-propagator.ts` — 1000-sample impact uncertainty
  - `src/deploy/edge-deployer.ts` — ONNX deploy to RPi4 (INT8) and Jetson Nano (FP16)
  - `src/integration/sentinel-pipeline.ts` — Event bus integration layer
  - `src/output/cursor-of-truth.ts` — Claude claude-sonnet-4-6 tactical reports + template fallback
  - `src/output/brave1-format.ts` — NATO BRAVE1 JSON output

---

## W7 Scope Summary

**Wave Theme:** Hardware Integration + Data Pipeline Rectification + Terminal Phase Detection

W7 is the first wave introducing real hardware actuator integration (PTZ cameras, RF jammers, net-gun interceptors) alongside two critical correctness fixes from W6 gap analysis: the 16kHz sample rate rectification and the hardcoded coordinate injection problem.

### Functional Requirements

| FR | Module | Priority | Description |
|----|--------|----------|-------------|
| FR-W7-01 | DatasetPipelineV2 | P0 | Rewrite DatasetPipeline at 16kHz. Fix data integrity gap from W6. Wild Hornets dataset integration. |
| FR-W7-02 | AcousticProfileLibraryV2 | P0 | Add Gerbera profile, Shahed-131 profile, Shahed-238 turbine profile (3–8kHz jet engine). Separate turbine model routing. |
| FR-W7-03 | TerminalPhaseDetector | P0 | 4-indicator FSM: speed increase, course commitment, altitude descent, RF silence (2–10s before impact). 5 states. |
| FR-W7-04 | ElrsFingerprint | P1 | RTL-SDR fingerprinting of ELRS 900MHz FPV control links. Burst detection on synthetic signal. |
| FR-W7-05 | BearingTriangulator | P1 | Bearing-line intersection triangulation. Complements TdoaSolver. Resilient to GPS jamming. |
| FR-W7-06 | PtzSlaveOutput | P1 | ONVIF Profile S PTZ control. Auto-aim camera at drone bearing/elevation. 100Hz bearing updates, 500ms PTZ rate limit. |
| FR-W7-07 | JammerActivation | P2 | Async NATS command to 900MHz FPV jammer + 1575MHz GPS jammer. JAMMER_COMMANDS stream. |
| FR-W7-08 | PhysicalInterceptCoordinator | P2 | SkyNet net-gun activation via BRAVE1/NATS. SKYNET_ACTIVATION stream R5. |
| FR-W7-09 | TdoaSolverInjection | P0 | Replace hardcoded 51.5/4.9 coordinates. CoordinateRegistry from NODE_LAT/NODE_LON env vars + NATS NODE_HEALTH updates. |
| FR-W7-10 | DemoDashboard | P1 | React/Next.js dashboard: live track list, threat heatmap, terminal phase indicator, jammer status, PTZ feed. |

---

## Current Test Baseline (W6 Complete State)

| Metric | Value |
|--------|-------|
| Total tests | 629 |
| Passing | 629 (100%) |
| Statement coverage | 95.66% |
| Branch coverage | 89.22% |
| Function coverage | 97.19% |
| mind-the-gap score | 14/14 PASS |
| Last migration applied | 006_w6_acoustic_intelligence.sql |
| Active source modules | 51 (41 W1-W5 + 10 W6) |

**W7 target:** ~729 total tests (629 existing + ~100 new RED → GREEN)

---

## Git State at W7 INIT

| Field | Value |
|-------|-------|
| Branch | main |
| HEAD commit | `3bc44be679e42823486eac16a83e3f2e5e47dfee` |
| HEAD message | `docs(analysis): surgical document analysis + FDRP W1-W6 final report` |
| Remote | origin/main — in sync |
| Tag `w6-complete` | To be created at formal W6 sign-off before W7 tdd-red begins |

---

## Supabase State

| Field | Value |
|-------|-------|
| Project ID | bymfcnwfyxuivinuzurr |
| Region | eu-west-2 |
| Last migration | 006_w6_acoustic_intelligence.sql |
| Next migration | 007_w7_hardware_integration.sql |

### Tables Present at W7 INIT

| Table | Wave | Purpose |
|-------|------|---------|
| `nodes` | W1 | Sensor node registry |
| `detections` | W1 | Raw acoustic/RF detections |
| `tracks` | W2/W4 | Correlated drone tracks |
| `alerts` | W2 | Generated alerts |
| `cot_events` | W2 | CoT relay events |
| `node_health` | W3 | Node health history |
| `predictions` | W5 | EKF prediction results |
| `impact_estimates` | W5 | ImpactEstimator results |
| `acoustic_profiles` | W6 | Drone acoustic signature catalog |
| `ml_model_versions` | W6 | ONNX artifact registry |
| `dataset_clips` | W6 | Training data metadata |
| `fusion_events` | W6 | Multi-node correlation log |
| `monte_carlo_results` | W6 | Impact uncertainty history |

### Tables to be Added in W7 (Migration 007)

| Table | FR | Purpose |
|-------|-----|---------|
| `terminal_phase_events` | FR-W7-03 | FSM state transition log per track |
| `jammer_commands` | FR-W7-07 | Jammer activation command audit log |
| `skynet_activations` | FR-W7-08 | Physical intercept command audit log |
| `bearing_reports` | FR-W7-05 | Node-level bearing estimates |
| `ptz_command_log` | FR-W7-06 | PTZ command history |

---

## NATS JetStream State

### Existing Streams (W1-W6)

| Stream | Subjects | Replicas | Retention | Max Age |
|--------|---------|---------|-----------|---------|
| DETECTIONS | `sentinel.detections.>` | 3 | limits | 24h |
| NODE_HEALTH | `sentinel.health.>` | 3 | limits | 5min |
| ALERTS | `sentinel.alerts.>` | 5 | limits | 7 days |
| COT_EVENTS | `sentinel.cot.>` | 3 | limits | 24h |

### New NATS Streams to Create in W7

| Stream | Subjects | Replicas | Purpose | FR |
|--------|---------|---------|---------|-----|
| JAMMER_COMMANDS | `sentinel.jammer.>` | 3 | Jammer activation commands + ACKs | FR-W7-07 |
| PTZ_BEARING | `sentinel.ptz.>` | 3 | PTZ bearing updates at 100Hz, rate-limited to camera | FR-W7-06 |
| SKYNET_ACTIVATION | `sentinel.skynet.>` | 5 | Physical intercept commands (high replication — critical) | FR-W7-08 |
| TERMINAL_PHASE | `sentinel.terminal.>` | 3 | Terminal phase FSM state transitions | FR-W7-03 |
| BEARING_REPORTS | `sentinel.bearing.>` | 3 | Node-level bearing estimates for triangulation | FR-W7-05 |

**SKYNET_ACTIVATION uses R5 (same as ALERTS) — intercept commands must not be lost.**

---

## Environment State

| Component | State |
|-----------|-------|
| Node.js | v20.x (ESM modules) |
| TypeScript | 5.8.2 (strict mode) |
| Vitest | 3.0.9 |
| Supabase project | bymfcnwfyxuivinuzurr (eu-west-2) |
| NATS streams | 4 existing (DETECTIONS, NODE_HEALTH, ALERTS, COT_EVENTS) |
| Active src modules | 51 |
| onnxruntime-node | Added in W6 |

### New Dependencies Expected in W7

| Package | Purpose | Size |
|---------|---------|------|
| `onvif` | ONVIF Profile S PTZ control | ~2 MB |
| `rtl-sdr` (optional) | RTL-SDR USB interface (Node.js binding) | ~5 MB |
| Next.js (UI only) | Demo dashboard (separate package.json) | ~200 MB |
| React (UI only) | Demo dashboard | Bundled with Next.js |

---

## W7 New Source Modules (10)

| Path | FR | Description |
|------|-----|-------------|
| `src/ml/dataset-pipeline-v2.ts` | FR-W7-01 | 16kHz DatasetPipeline rewrite. Wild Hornets integration. OSINT supplementary only. |
| `src/ml/acoustic-profile-library-v2.ts` | FR-W7-02 | AcousticProfileLibrary with Gerbera, Shahed-131, Shahed-238 turbine. Turbine routing. |
| `src/detection/terminal-phase-detector.ts` | FR-W7-03 | TerminalPhaseDetector FSM (5 states, 4 indicators). |
| `src/rf/elrs-fingerprint.ts` | FR-W7-04 | ELRS 900MHz burst detection. RTL-SDR interface. |
| `src/fusion/bearing-triangulator.ts` | FR-W7-05 | Bearing-line intersection algorithm. Complements TdoaCorrelator. |
| `src/output/ptz-slave-output.ts` | FR-W7-06 | ONVIF PTZ control. 100Hz bearing input, 500ms rate limit. |
| `src/output/jammer-activation.ts` | FR-W7-07 | NATS async jammer command publisher. 900MHz + 1575MHz channels. |
| `src/output/physical-intercept-coordinator.ts` | FR-W7-08 | SkyNet activation. BRAVE1 extension. SKYNET_ACTIVATION stream. |
| `src/integration/sentinel-pipeline-v2.ts` | FR-W7-09 | SentinelPipeline with coordinate injection, new streams, hardware integration. |
| `src/ui/demo-dashboard/` | FR-W7-10 | Next.js app. Track list, heatmap, terminal phase indicator, jammer/PTZ status. |

---

## What Is Blocked

Nothing is currently blocked.

### Pending Prerequisites

| Prerequisite | Owner | Required By |
|-------------|-------|-------------|
| Wild Hornets dataset access (INDIGO data sharing agreement) | INDIGO team | FR-W7-01 tdd-red |
| Foxeer TRX1003 ELRS signal capture (synthetic fixture OK for tests) | Nico | FR-W7-04 tests |
| ONVIF PTZ camera (Dahua or Hikvision) for hardware integration test | Nico | FR-W7-06 smoke test |
| SkyNet net-gun command schema from George | George (INDIGO) | FR-W7-08 implementation |
| Radisson demo date confirmed | Nico | FR-W7-10 timeline |

---

## What Was Identified in W6 Analysis That W7 Fixes

### P0 Gap Fixes (Must ship in W7)

1. **22050Hz → 16kHz** (ADR-W7-001): DatasetPipeline data integrity fix. All training data and inference must be at 16kHz.
2. **Hardcoded coordinates** (ADR-W7-011): TdoaSolver uses `lat=51.5, lon=4.9` in production paths. Every real deployment produces wrong position estimates. Fix via coordinate injection.
3. **Missing drone profiles** (ADR-W7-002): Gerbera, Shahed-131, and Shahed-238 jet profiles missing. Shahed-238 jet turbine is a completely separate frequency domain requiring a separate model.

### P1 Capability Additions

4. **Terminal phase detection**: The most critical missing C-UAS capability. No current code detects the transition from cruise to terminal attack phase.
5. **RF link detection**: ELRS 900MHz fingerprinting was flagged in W6 analysis as missing. RTL-SDR hardware already specified.
6. **PTZ camera integration**: Operator response time depends on automatically aiming a camera at the detected bearing.
7. **BearingTriangulator**: GPS jamming resilience gap. TDOA-only positioning fails when OPFOR deploys GPS jammers.

---

## Next Actions (Ordered)

1. Complete remaining 15 W7 docs (`./wave-formation.sh plan W7`)
2. `./wave-formation.sh tdd-red W7` — write ~100 failing tests across 10 test files
3. Commit RED tests: `git commit -m "tdd-red: W7 hardware integration — 100+ tests RED"`
4. Apply Supabase migration 007_w7_hardware_integration.sql
5. Create NATS streams: JAMMER_COMMANDS, PTZ_BEARING, SKYNET_ACTIVATION, TERMINAL_PHASE, BEARING_REPORTS
6. `./wave-formation.sh execute W7` — implement 10 new source modules
7. `./wave-formation.sh checkpoint W7` — verify ~729/729 GREEN + coverage ≥ 80%
8. `./wave-formation.sh complete W7` — tag `w7-complete`, update MEMORY.md
