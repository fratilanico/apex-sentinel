# APEX-SENTINEL — ARTIFACT_REGISTRY.md
## Wave 6: Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
### Date: 2026-03-25 | Status: PLANNED

---

## Registry Format

Columns: **Path** | **Type** | **FR** | **Description** | **Status**

Types: `new` (created in W6) | `modify` (existing file changed) | `migration` | `doc`

Statuses: `planned` | `tdd-red` | `in-progress` | `done`

---

## New Source Files (10)

| Path | Type | FR | Description | Status |
|------|------|----|-------------|--------|
| `src/ml/acoustic-profile-library.ts` | new | FR-W6-01 | Drone acoustic signature catalog. Stores per-model harmonic profiles (fundamental Hz, harmonic ratios, modulation patterns). Provides `match(spectral)` returning confidence per drone model. Initialized with 4 profiles: Shahed-136, Lancet-3, Mavic Mini, Orlan-10. | planned |
| `src/ml/yamnnet-finetuner.ts` | new | FR-W6-02 | YAMNet-512 fine-tuning pipeline. Loads base model, applies drone-specific dataset, exports to ONNX (FP32/INT8/FP16). Tracks training metrics (loss, F1 per class). Integrates with DatasetPipeline for train/val/test splits. | planned |
| `src/ml/false-positive-guard.ts` | new | FR-W6-03 | False positive suppression. 10s rolling temporal buffer per detection. Computes Doppler shift trajectory. Rejects events with Doppler > 1.5 kHz over 10s window (vehicle pass-by signature). Outputs suppressed/confirmed classification with confidence. | planned |
| `src/ml/dataset-pipeline.ts` | new | FR-W6-04 | Audio dataset ingestion. Downloads from Telegram OSINT channels + field recording uploads. Normalizes to -23 LUFS (EBU R128). Augments (time-stretch ±10%, pitch-shift ±2 semitones, additive noise at -15 to -30 dB SNR). Splits 80/10/10 stratified by drone model. | planned |
| `src/fusion/multi-node-fusion.ts` | new | FR-W6-05 | Cross-node acoustic event correlation. Receives detection reports from N nodes. Applies inverse distance weighting (1/d²). Requires minimum 3 nodes for fused result, falls back to single-node for 1–2 nodes. Outputs fused detection with localization confidence ellipse. | planned |
| `src/prediction/monte-carlo-propagator.ts` | new | FR-W6-06 | Monte Carlo impact uncertainty. Samples 1000 trajectory perturbations from EKF covariance. Propagates each sample to ground intercept. Returns 50th, 90th, 99th percentile impact ellipses. Integrates with MultiTrackEKFManager for per-track uncertainty. | planned |
| `src/deploy/edge-deployer.ts` | new | FR-W6-07 | Edge device deployment manager. Downloads ONNX model from Supabase storage. Selects quantization level: INT8 for ARM64 CPU (RPi4), FP16 for CUDA (Jetson Nano). Generates device manifest JSON. Validates model inference on dummy input before activation. | planned |
| `src/integration/sentinel-pipeline.ts` | new | FR-W6-08 | Full pipeline integration layer. Event bus connecting all W6 modules. Stages: AudioCapture → AcousticProfile → YAMNetInference → FalsePositiveGuard → MultiNodeFusion → MonteCarloPropagator → CursorOfTruth → BRAVE1Format → NatsPublish. Supports offline mode with NATS buffering. | planned |
| `src/output/cursor-of-truth.ts` | new | FR-W6-09 | Tactical situation report generator. Primary: Claude claude-sonnet-4-6 via VM gateway (http://4.231.218.96:7429/chat). Fallback: deterministic SALUTE/9-liner template. Input: fused detection + Monte Carlo ellipse + acoustic profile match. Output: operator-readable tactical assessment. | planned |
| `src/output/brave1-format.ts` | new | FR-W6-10 | NATO BRAVE1 JSON format encoder. Wraps CoT fields in BRAVE1 envelope. Includes acoustic confidence, fusion node count, Monte Carlo ellipse parameters. Compatible with ATAK and Ukrainian C2 BRAVE1 REST API. | planned |

---

## New Test Files (10)

| Path | Type | FR | Test Count | Description | Status |
|------|------|----|-----------|-------------|--------|
| `tests/ml/FR-W6-01-acoustic-profile.test.ts` | new | FR-W6-01 | 15 | AcousticProfileLibrary: profile loading, match confidence scoring, Shahed-136 detection, Lancet-3 detection, false negative rate, profile serialization, normalize input, harmonic ratio validation, modulation pattern match, multi-profile disambiguation, confidence threshold, unknown drone handling, profile CRUD, frequency range validation, performance <1ms | planned |
| `tests/ml/FR-W6-02-yamnnet-finetuner.test.ts` | new | FR-W6-02 | 15 | YAMNetFineTuner: model load, dataset intake, forward pass, loss computation, epoch iteration, early stopping, ONNX FP32 export, ONNX INT8 export, ONNX FP16 export, model version metadata, Supabase upload, inference validation post-export, training metrics logging, class weight balancing, checkpoint save/restore | planned |
| `tests/ml/FR-W6-03-false-positive-guard.test.ts` | new | FR-W6-03 | 15 | FalsePositiveGuard: buffer initialization, Doppler shift computation, motorcycle rejection (>1.5 kHz), drone pass-through, hovering drone, truck idle engine, 10s window expiry, multi-event buffer, suppression log, confidence output, edge case zero Doppler, high-noise environment, temporal persistence check, concurrent track isolation, reset buffer | planned |
| `tests/ml/FR-W6-04-dataset-pipeline.test.ts` | new | FR-W6-04 | 10 | DatasetPipeline: Telegram download, field recording ingest, LUFS normalization, time-stretch augmentation, noise augmentation, stratified split, label validation, duplicate detection, dataset statistics, export format | planned |
| `tests/fusion/FR-W6-05-multi-node-fusion.test.ts` | new | FR-W6-05 | 15 | MultiNodeFusion: 3-node fusion, 4-node fusion, single-node fallback, 2-node fallback, IDW weight computation, node health weighting, confidence ellipse output, temporal alignment, stale report rejection (>5s), fusion latency <10ms, fused position accuracy, conflicting reports handling, stream fusion, node dropout resilience, output schema validation | planned |
| `tests/prediction/FR-W6-06-monte-carlo.test.ts` | new | FR-W6-06 | 15 | MonteCarloPropagator: 1000 sample generation, covariance sampling, trajectory propagation, ground intercept computation, 50th percentile ellipse, 90th percentile ellipse, 99th percentile ellipse, computation time <30ms, integration with EKF state, low-covariance tight ellipse, high-covariance wide ellipse, invalid state rejection, ellipse serialization, multi-track parallel propagation, deterministic seed mode | planned |
| `tests/deploy/FR-W6-07-edge-deployer.test.ts` | new | FR-W6-07 | 10 | EdgeDeployer: Supabase model download, INT8 selection for ARM64, FP16 selection for CUDA, device manifest generation, inference validation, version comparison, rollback to previous model, download timeout handling, checksum verification, manifest serialization | planned |
| `tests/integration/FR-W6-08-sentinel-pipeline.test.ts` | new | FR-W6-08 | 15 | SentinelPipeline: pipeline start/stop, audio event ingestion, end-to-end detection flow, NATS publish on detection, false positive suppression through pipeline, multi-node event merge, offline NATS buffer, flush on reconnect, event bus typed emissions, module isolation, pipeline metrics, error recovery, concurrent track handling, graceful shutdown, memory leak check | planned |
| `tests/output/FR-W6-09-cursor-of-truth.test.ts` | new | FR-W6-09 | 10 | CursorOfTruth: VM gateway call, template fallback on gateway failure, structured input parsing, tactical report format, SALUTE format fields, detection confidence in report, Monte Carlo ellipse in report, Shahed-136 specific language, response time <5s, circuit breaker integration | planned |
| `tests/output/FR-W6-10-brave1-format.test.ts` | new | FR-W6-10 | 10 | BRAVE1Format: JSON schema validation, CoT field embedding, acoustic confidence field, fusion node count field, Monte Carlo ellipse parameters, ATAK backward compatibility, BRAVE1 REST API format, timestamp encoding, coordinate format (WGS84), serialization determinism | planned |

**Total new tests: 130**
**Total tests post-W6: 614 (484 existing + 130 new)**

---

## New Documentation Files (20)

| Path | Type | Description | Status |
|------|------|-------------|--------|
| `docs/waves/W6/DESIGN.md` | doc | W6 high-level design: acoustic intelligence architecture, edge deployment topology, BRAVE1 integration pattern | planned |
| `docs/waves/W6/PRD.md` | doc | Product requirements: W6 user stories, acceptance criteria summary, INDIGO AirGuard integration requirements | planned |
| `docs/waves/W6/ARCHITECTURE.md` | doc | System architecture: module interaction diagram, event bus flow, edge node deployment diagram, NATS topic map | planned |
| `docs/waves/W6/DATABASE_SCHEMA.md` | doc | New tables: acoustic_profiles, ml_model_versions, dataset_clips, fusion_events, monte_carlo_results | planned |
| `docs/waves/W6/API_SPECIFICATION.md` | doc | New API contracts: EdgeDeployer device manifest schema, BRAVE1 JSON schema, CursorOfTruth input/output types | planned |
| `docs/waves/W6/AI_PIPELINE.md` | doc | ML pipeline: YAMNet fine-tuning flow, dataset pipeline, ONNX quantization steps, model versioning | planned |
| `docs/waves/W6/PRIVACY_ARCHITECTURE.md` | doc | Privacy: audio data retention policy, Telegram OSINT data handling, GDPR compliance for acoustic recordings | planned |
| `docs/waves/W6/ROADMAP.md` | doc | W6 delivery milestones, W7 preview (dataset expansion, Bayesian fusion), W8 preview (federated learning) | planned |
| `docs/waves/W6/TEST_STRATEGY.md` | doc | Test strategy: 130 new tests breakdown, coverage targets, integration test approach for SentinelPipeline | planned |
| `docs/waves/W6/ACCEPTANCE_CRITERIA.md` | doc | FR-by-FR acceptance criteria: pass/fail definition for each of 10 FRs | planned |
| `docs/waves/W6/DECISION_LOG.md` | doc | This repository's ADR log — 15 ADRs covering all W6 architectural decisions | done |
| `docs/waves/W6/SESSION_STATE.md` | doc | Wave session state at init — W1-W5 summary, W6 scope, current test baseline | done |
| `docs/waves/W6/ARTIFACT_REGISTRY.md` | doc | This file — all W6 artifacts with status tracking | done |
| `docs/waves/W6/DEPLOY_CHECKLIST.md` | doc | Pre/post deployment checklist: 614 tests, migration 006, ONNX upload, acoustic profile seed | done |
| `docs/waves/W6/LKGC_TEMPLATE.md` | doc | Last Known Good Configuration — W5 LKGC + W6 rollback/forward procedures | done |
| `docs/waves/W6/IMPLEMENTATION_PLAN.md` | doc | Module-by-module implementation order, dependency graph, estimated effort per FR | planned |
| `docs/waves/W6/HANDOFF.md` | doc | Wave handoff document: what was built, known gaps, W7 entry conditions | planned |
| `docs/waves/W6/FR_REGISTER.md` | doc | Formal FR register: FR-W6-01 through FR-W6-10 with priority, complexity, owner | planned |
| `docs/waves/W6/RISK_REGISTER.md` | doc | Risk register: dataset availability risk, ONNX RPi4 compilation risk, BRAVE1 spec change risk | planned |
| `docs/waves/W6/INTEGRATION_MAP.md` | doc | Integration map: INDIGO AirGuard integration, NATS topic bindings, Supabase table dependencies | planned |

---

## New Database Migration (1)

| Path | Type | FR | Description | Status |
|------|------|----|-------------|--------|
| `supabase/migrations/006_w6_acoustic_intelligence.sql` | migration | FR-W6-01, FR-W6-02, FR-W6-04, FR-W6-06 | Creates tables: `acoustic_profiles` (drone signature catalog), `ml_model_versions` (ONNX artifact registry), `dataset_clips` (training data metadata), `fusion_events` (multi-node correlation log), `monte_carlo_results` (impact uncertainty history). Adds Supabase Storage bucket `ml-models`. | planned |

---

## Modified Existing Files (3)

| Path | Type | FR | Change Description | Status |
|------|------|----|-------------------|--------|
| `src/prediction/types.ts` | modify | FR-W6-06 | Add `MonteCarloResult` interface: `{ sampleCount: number; ellipse50: ImpactEllipse; ellipse90: ImpactEllipse; ellipse99: ImpactEllipse; computationMs: number }`. Add `ImpactEllipse` interface: `{ centerLat: number; centerLon: number; semiMajorM: number; semiMinorM: number; rotationDeg: number }` | planned |
| `package.json` | modify | FR-W6-07 | Add `onnxruntime-node` dependency (~50 MB). Update version to `2.0.0`. | planned |
| `memory/MEMORY.md` | modify | — | Update W6 status at wave-complete | planned |

---

## Artifact Counts Summary

| Category | Count |
|----------|-------|
| New source files | 10 |
| New test files | 10 |
| New documentation files | 20 |
| New migrations | 1 |
| Modified files | 3 |
| **Total artifacts** | **44** |

---

## Completion Tracking

Progress is updated at each wave-formation phase:

- `planned` → set at W6 INIT (this file)
- `tdd-red` → set when test file committed RED
- `in-progress` → set when source file implementation begins
- `done` → set when tests GREEN and coverage verified
