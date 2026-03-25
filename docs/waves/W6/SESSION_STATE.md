# APEX-SENTINEL — SESSION_STATE.md
## Wave 6: Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
### Date: 2026-03-25 | Phase: W6 INIT

---

## Wave Status

| Field | Value |
|-------|-------|
| Current wave | W6 |
| Phase | INIT — writing 20 PROJECTAPEX docs |
| Wave-formation phase | `init` |
| Date started | 2026-03-25 |
| Blocking issues | None |
| Next action | `./wave-formation.sh tdd-red W6` — write 130 RED tests |

---

## W1–W5 Completion Summary

### W1 — Acoustic Pipeline Baseline
- **Status:** COMPLETE
- **Delivered:**
  - `src/acoustic/pipeline.ts` — AcousticPipeline (VAD + FFT + YAMNet chain)
  - `src/acoustic/yamnet.ts` — YAMNet surrogate (frequency-domain heuristics)
  - `src/acoustic/fft.ts` — FFT with Hann windowing
  - `src/acoustic/vad.ts` — Voice Activity Detection (energy-based)
  - `src/acoustic/types.ts` — SpectralAnalysis, YamNetResult, AcousticDetection
  - `src/rf/rssi-baseline.ts` — RF RSSI baseline
  - `src/privacy/location-coarsener.ts` — GPS coarsening for civilian data
- **Test count at W1 complete:** 83 tests

### W2 — NATS JetStream + Correlation + Alerts
- **Status:** COMPLETE
- **Delivered:**
  - `src/nats/stream-config.ts` — 5 JetStream stream definitions
  - `src/nats/auth-config.ts` — NATS auth + TLS config
  - `src/correlation/tdoa-correlator.ts` — TDOA multi-node correlation
  - `src/alerts/cot-generator.ts` — Cursor-on-Target XML generator
  - `src/alerts/telegram-bot.ts` — Telegram bot alerting
  - `src/relay/cot-relay.ts` — CoT relay to ATAK
  - `src/edge/ingest-event.ts` — Edge function: detection ingest
  - `src/edge/register-node.ts` — Edge function: node registration
- **Cumulative tests:** ~200

### W3 — Mobile Business Logic (NatsClient, BatteryOptimizer, ModelManager)
- **Status:** COMPLETE
- **Delivered:**
  - `src/mobile/nats-client.ts` — NatsClient with reconnection + backoff
  - `src/mobile/battery-optimizer.ts` — Adaptive inference frequency
  - `src/mobile/model-manager.ts` — On-device model lifecycle
  - `src/mobile/calibration.ts` — Acoustic calibration routine
  - `src/mobile/event-publisher.ts` — Mobile event publisher
  - `src/infra/circuit-breaker.ts` — CircuitBreaker (CLOSED/OPEN/HALF_OPEN)
- **Cumulative tests:** ~310

### W4 — C2 Dashboard (TrackStore, AlertStore)
- **Status:** COMPLETE
- **Delivered:**
  - `src/tracking/track-manager.ts` — TrackManager with Kalman state
  - `src/tracking/tdoa.ts` — TDOA hyperbolic positioning
  - `src/dashboard/track-store.ts` — TrackStore (Supabase-backed)
  - `src/dashboard/alert-store.ts` — AlertStore (persistence + query)
  - `src/dashboard/cot-export.ts` — CoT export for ATAK
  - `src/dashboard/keyboard-shortcuts.ts` — Operator keyboard shortcuts
  - `src/dashboard/stats.ts` — Live detection statistics
  - `src/node/registry.ts` — Node registry (health + capabilities)
- **Cumulative tests:** ~408

### W5 — EKF Prediction Engine
- **Status:** COMPLETE
- **Test count:** 484 GREEN
- **mind-the-gap:** 14/14 PASS (2026-03-25)
- **Delivered:**
  - `src/prediction/ekf.ts` — ExtendedKalmanFilter (Singer Q model, 6D state)
  - `src/prediction/polynomial-predictor.ts` — PolynomialPredictor (5 horizons: 5s–120s)
  - `src/prediction/impact-estimator.ts` — ImpactEstimator (deterministic footprint)
  - `src/prediction/prediction-publisher.ts` — PredictionPublisher (NATS + Supabase)
  - `src/prediction/multi-track-manager.ts` — MultiTrackEKFManager (1000 tracks, <5ms/track)
  - `src/prediction/matrix-ops.ts` — Matrix algebra helpers (6×6 operations)
  - `src/prediction/types.ts` — EKFState, PredictionResult, ImpactEstimate
- **Coverage:** 95.38% stmt / 87.55% branch / 97.03% funcs

---

## W6 Scope Summary

**Gate 5: Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment**

### Functional Requirements

| FR | Module | Description |
|----|--------|-------------|
| FR-W6-01 | AcousticProfileLibrary | Drone acoustic signature catalog (4 initial profiles) |
| FR-W6-02 | YAMNetFineTuner | Fine-tuning pipeline + ONNX export |
| FR-W6-03 | FalsePositiveGuard | Motorcycle/vehicle discrimination via Doppler + temporal |
| FR-W6-04 | DatasetPipeline | Telegram OSINT + field recording ingestion + augmentation |
| FR-W6-05 | MultiNodeFusion | Cross-node acoustic correlation with IDW |
| FR-W6-06 | MonteCarloPropagator | Impact uncertainty quantification (1000 samples) |
| FR-W6-07 | EdgeDeployer | ONNX export + RPi4 INT8 + Jetson FP16 device manifests |
| FR-W6-08 | SentinelPipeline | Full integration layer (event bus architecture) |
| FR-W6-09 | CursorOfTruth | Tactical CoT output via Claude claude-sonnet-4-6 + template fallback |
| FR-W6-10 | BRAVE1Format | NATO tactical BRAVE1 JSON format output |

---

## Current Test Baseline

| Metric | Value |
|--------|-------|
| Total tests | 484 |
| Passing | 484 (100%) |
| Statement coverage | 95.38% |
| Branch coverage | 87.55% |
| Function coverage | 97.03% |
| mind-the-gap score | 14/14 PASS |

**W6 target:** 614 total tests (484 existing + 130 new RED → GREEN)

---

## External Context: INDIGO AirGuard

INDIGO AirGuard is a hackathon team integrating APEX-SENTINEL as their acoustic detection backbone. They have provided:
- Shahed-136 acoustic profile intelligence from Kherson field recordings (2025-2026 campaign)
- False positive dataset: 340 motorcycle/truck events from roadside deployments
- BRAVE1 format specification requirements (FR-W6-10)

Their integration timeline requires W6 SentinelPipeline and BRAVE1Format complete by 2026-04-15.

---

## What Is In Progress

- W6 INIT: Writing 20 PROJECTAPEX docs in `docs/waves/W6/`
- DECISION_LOG.md: Complete (15 ADRs)
- SESSION_STATE.md: This file
- ARTIFACT_REGISTRY.md: In progress
- DEPLOY_CHECKLIST.md: In progress
- LKGC_TEMPLATE.md: In progress
- Remaining 15 docs: Queued for wave-formation.sh plan phase

---

## What Is Blocked

Nothing is currently blocked.

Pending prerequisites:
- ONNX Runtime build for RPi4 ARM64: community pre-built wheels available at `https://github.com/nknytk/built-onnxruntime-for-raspberrypi-linux`
- Shahed-136 audio dataset: INDIGO AirGuard to provide labeled clips via secure transfer before tdd-red W6
- Supabase migration 006: to be applied post-tdd-red

---

## Environment State

| Component | State |
|-----------|-------|
| Node.js | v20.x (ESM modules) |
| TypeScript | 5.8.2 (strict mode) |
| Vitest | 3.0.9 |
| Supabase project | bymfcnwfyxuivinuzurr (eu-west-2) |
| Last migration applied | 005_w5_prediction_engine.sql (pending confirmation) |
| NATS streams | DETECTIONS R3, NODE_HEALTH R3, ALERTS R5, COT_EVENTS R3 |
| Active src modules | 41 |
| Git HEAD | 1c536c9 |

---

## Next Actions (Ordered)

1. Complete remaining 15 W6 docs (`./wave-formation.sh plan W6`)
2. `./wave-formation.sh tdd-red W6` — write 130 failing tests across 10 test files
3. Commit RED tests: `git commit -m "tdd-red: W6 acoustic intelligence — 130 tests RED"`
4. Apply Supabase migration 006_w6_acoustic_intelligence.sql
5. `./wave-formation.sh execute W6` — implement 10 new source modules
6. `./wave-formation.sh checkpoint W6` — verify 614/614 GREEN + coverage ≥80%
7. `./wave-formation.sh complete W6` — tag `w6-complete`, update MEMORY.md
