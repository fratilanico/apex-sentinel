# APEX-SENTINEL — ARTIFACT_REGISTRY.md
## Wave 7: Hardware Integration + Data Pipeline Rectification + Terminal Phase Detection
### Date: 2026-03-25 | Status: PLANNED

---

## Registry Format

Columns: **Path** | **Type** | **FR** | **Description** | **Status**

Types: `new` (created in W7) | `modify` (existing file changed) | `migration` | `doc` | `fixture` | `script`

Statuses: `planned` | `tdd-red` | `in-progress` | `done`

---

## New Source Files (10)

| Path | Type | FR | Description | Status |
|------|------|----|-------------|--------|
| `src/ml/dataset-pipeline-v2.ts` | new | FR-W7-01 | DatasetPipeline rewrite at 16kHz. Canonical sample rate 16000Hz throughout. Wild Hornets dataset integration via secure transfer script. Telegram OSINT clips treated as supplementary augmentation only (require confidence > 0.70 against Wild Hornets labels). Outputs: `DatasetSplit` with train/val/test arrays of 16kHz-normalized 960ms windows. Audio normalized to -23 LUFS after 16kHz resampling (if source is non-16kHz). Augmentation: time-stretch ±10%, pitch-shift ±2 semitones, additive field noise at -15 to -30 dB SNR. Stratified 80/10/10 split by drone model label. | planned |
| `src/ml/acoustic-profile-library-v2.ts` | new | FR-W7-02 | AcousticProfileLibraryV2. Extends W6 with 3 new profiles. Gerbera: FPV piston profile (fundamental ~120Hz, high-frequency modulation). Shahed-131: piston profile (similar to Shahed-136 MADO-20 but smaller displacement, ~60Hz fundamental). Shahed-238: jet turbine profile (dominant energy 3000–8000Hz, broadband noise floor, minimal sub-500Hz content — separate model path). Pre-screening router: computes energy in 3–8kHz band; if > -40 dBFS routes to turbine model (`yamnet-turbine-v1.onnx`), else routes to piston model (`yamnet-16khz-v1.onnx`). Backward compatible: V1 profiles (Shahed-136, Lancet-3, Mavic Mini, Orlan-10) are loaded from Supabase on startup. | planned |
| `src/detection/terminal-phase-detector.ts` | new | FR-W7-03 | TerminalPhaseDetector. 5-state FSM: `CRUISE` → `MANEUVERING` → `SUSPECTED_TERMINAL` → `CONFIRMED_TERMINAL` → `IMPACT_IMMINENT`. Four indicator inputs per track: (1) speed delta > 15% over 5s, (2) bearing rate < 2°/s for 3s sustained, (3) altitude rate < -2m/s for 3s sustained, (4) RF silence detected on ELRS channel for > 2s. FSM advances state on indicator threshold crossing; requires 3 of 4 indicators for `CONFIRMED_TERMINAL`; all 4 for `IMPACT_IMMINENT`. Each state transition emits a typed NATS event on `TERMINAL_PHASE` stream and logs to Supabase `terminal_phase_events`. Configurable thresholds per deployment environment. | planned |
| `src/rf/elrs-fingerprint.ts` | new | FR-W7-04 | ElrsFingerprint. RTL-SDR interface for 900MHz band monitoring (868–915MHz). Burst detection algorithm: identifies ELRS frequency-hopping pattern (≥ 400Hz hop rate, 80-channel spread, ~500µs burst timing). Outputs: `ElrsDetection` with estimated RSSI, channel sequence fingerprint, burst cadence, confidence score. Synthetic signal test fixture built in for CI (no hardware required for tests). Integrates with TerminalPhaseDetector for RF silence detection (indicator 4): publishes to `DETECTIONS` stream on `sentinel.detections.rf.elrs` subject. Graceful degradation if RTL-SDR hardware absent (software-only mode). | planned |
| `src/fusion/bearing-triangulator.ts` | new | FR-W7-05 | BearingTriangulator. Accepts N bearing reports (azimuth + elevation from each directional node) and computes source position via line-of-bearing intersection (least-squares for N > 2, analytical for N = 2). Node capability check: only nodes with `capabilities.bearingCapable = true` contribute bearing data. NATS input: subscribes to `BEARING_REPORTS` stream (`sentinel.bearing.>` subject). Output: `TriangulatedPosition` (lat, lon, alt, confidence, contributingNodes). Weighted by node health score and signal strength. Falls back to TdoaCorrelator result when < 2 bearing-capable nodes visible. CoordinateRegistry integration for node positions. | planned |
| `src/output/ptz-slave-output.ts` | new | FR-W7-06 | PtzSlaveOutput. ONVIF Profile S PTZ control via `onvif` npm package. Accepts `PtzCommand` (pan-degrees, tilt-degrees, zoom-level, trackId) at up to 100Hz from SentinelPipeline. Internal rate limiter: max 1 PTZ command per 500ms per camera (prevents camera saturation). ONVIF device discovery on startup. Multi-camera support: each tracked target assigned to the nearest available camera. PTZ command log published to NATS `PTZ_BEARING` stream and Supabase `ptz_command_log` table. Mock ONVIF device for tests (no real camera required). | planned |
| `src/output/jammer-activation.ts` | new | FR-W7-07 | JammerActivation. Async NATS publisher to `JAMMER_COMMANDS` stream (`sentinel.jammer.command.>` subjects). Two jammer channels: `jammer.900mhz` (FPV ELRS jammer) and `jammer.1575mhz` (GPS L1 jammer). Activation triggers: `CONFIRMED_TERMINAL` state from TerminalPhaseDetector. Command schema: `{ jammerId, channel, activateMs, trackId, triggerReason, timestamp }`. ACK listener on `sentinel.jammer.ack.>` — logs confirmation to Supabase `jammer_commands` table. Safety: 30-second maximum activation duration enforced in command schema. Operator override: manual deactivation command. | planned |
| `src/output/physical-intercept-coordinator.ts` | new | FR-W7-08 | PhysicalInterceptCoordinator. SkyNet net-gun activation. Publishes BRAVE1-extended command JSON to NATS `SKYNET_ACTIVATION` stream (`sentinel.skynet.command.>` subject). BRAVE1 extension block: `{ skynet_intercept: { targetTrackId, interceptorId, firingAzimuth, firingElevation, netRadius, activateAt } }`. Activation triggers: `IMPACT_IMMINENT` state from TerminalPhaseDetector + jammer ACK confirmed. Pre-activation checklist: track confidence > 0.85, Monte Carlo 90th-percentile impact ellipse < 50m radius, BearingTriangulator confirmation. Activation log to Supabase `skynet_activations`. | planned |
| `src/integration/sentinel-pipeline-v2.ts` | new | FR-W7-09 | SentinelPipelineV2. Full pipeline rewrite integrating all W7 modules. Coordinate injection at startup from `NODE_LAT`/`NODE_LON`/`NODE_ALT_M` env vars. CoordinateRegistry singleton with NATS `NODE_HEALTH` stream subscription for mobile node position updates. Event bus extended with new typed events: `TERMINAL_PHASE_CHANGE`, `JAMMER_ACTIVATED`, `PTZ_AIM_UPDATE`, `SKYNET_ARMED`. Pipeline stages: AudioCapture (16kHz) → AcousticProfileV2 → YAMNetInference → FalsePositiveGuard → ElrsFingerprint (parallel) → BearingTriangulator → TdoaSolver → TerminalPhaseDetector → [PtzSlaveOutput, JammerActivation, PhysicalInterceptCoordinator] → CursorOfTruth → BRAVE1Format → NatsPublish. | planned |
| `src/ui/demo-dashboard/` | new | FR-W7-10 | Next.js 14 App Router application. TypeScript. Components: `TrackListPanel` (live track table, terminal phase badges), `ThreatHeatmap` (MapGL-based, threat probability overlay), `AcousticConfidencePanel` (per-track profile match bars), `TerminalPhaseIndicator` (FSM state display), `JammerStatusPanel` (900MHz + 1575MHz activation status), `PtzFeedPanel` (ONVIF snapshot preview). Realtime: Supabase Realtime subscriptions on `tracks`, `terminal_phase_events`, `jammer_commands`. Package: `src/ui/demo-dashboard/package.json` (isolated from sensor pipeline deps). | planned |

---

## New Test Files (10+)

| Path | Type | FR | Target Count | Key Test Cases | Status |
|------|------|----|-------------|----------------|--------|
| `tests/ml/FR-W7-01-dataset-pipeline-v2.test.ts` | new | FR-W7-01 | 15 | 16kHz output validation, Wild Hornets ingest, OSINT confidence gate (< 0.70 rejected), -23 LUFS normalization at 16kHz, augmentation produces 16kHz output, stratified split by drone model, duplicate clip detection, dataset statistics report, label validation, corrupted clip handling, empty directory handling, clip duration validation (min 500ms), metadata CSV export, multi-class distribution, split reproducibility with seed | planned |
| `tests/ml/FR-W7-02-acoustic-profile-library-v2.test.ts` | new | FR-W7-02 | 15 | Gerbera profile loaded, Shahed-131 profile loaded, Shahed-238 turbine profile loaded, turbine pre-screening routes to turbine model, piston pre-screening routes to piston model, borderline energy routing (just below -40 dBFS threshold), V1 profiles still loaded (backward compat), multi-profile match (two profiles similar score), turbine model confidence scoring, piston model confidence on turbine audio (near-zero expected), profile CRUD still works, confidence threshold per profile, unknown drone (all profiles low confidence), new profile add via API, performance < 2ms on 16kHz frame | planned |
| `tests/detection/FR-W7-03-terminal-phase-detector.test.ts` | new | FR-W7-03 | 20 | CRUISE initial state, speed increase transitions to MANEUVERING, course commitment transitions to SUSPECTED_TERMINAL, altitude descent transitions, RF silence detected, 3-of-4 indicators triggers CONFIRMED_TERMINAL, all-4 triggers IMPACT_IMMINENT, FSM resets on track lost, FSM does not advance on single indicator alone, temporal window validation (speed delta must persist 5s), bearing rate threshold configurable, altitude rate threshold configurable, RF silence threshold configurable (2s min), NATS event emitted on each transition, Supabase log write on CONFIRMED_TERMINAL, false positive suppression (brief speed spike not sustained), concurrent track FSMs isolated, FSM serialize/deserialize state, threshold config override, IMPACT_IMMINENT triggers JammerActivation check | planned |
| `tests/rf/FR-W7-04-elrs-fingerprint.test.ts` | new | FR-W7-04 | 12 | Synthetic ELRS burst detected, non-ELRS 900MHz rejected, hop rate ≥ 400Hz confirmed, 80-channel spread validated, burst cadence ~500µs, RSSI estimation, RF silence detection (no ELRS burst for 2s), channel sequence fingerprint, confidence score computation, graceful degradation without RTL-SDR hardware, integration with DETECTIONS stream publish, concurrent ELRS + other 900MHz signal separation | planned |
| `tests/fusion/FR-W7-05-bearing-triangulator.test.ts` | new | FR-W7-05 | 15 | 2-node bearing intersection (analytical), 3-node bearing intersection (least-squares), 4-node bearing intersection, non-bearing-capable node excluded, GPS-jammed scenario (TDOA unavailable, bearing only), bearing-only position vs TDOA position fusion, node health weighting in bearing estimate, stale bearing report rejected (> 5s old), minimum bearing separation validation (< 5° collinear bearing rejected), confidence output, CoordinateRegistry position injection, output schema validation, triangulation accuracy simulation, NATS BEARING_REPORTS subscription, fallback to TDOA when bearing unavailable | planned |
| `tests/output/FR-W7-06-ptz-slave-output.test.ts` | new | FR-W7-06 | 12 | Mock ONVIF PTZ command accepted, pan/tilt angles computed from bearing/elevation, zoom level from track distance, rate limiter: second command within 500ms rejected, rate limiter resets after 500ms, multi-camera target assignment (nearest camera), NATS PTZ_BEARING publish, Supabase ptz_command_log write, camera offline graceful handling, manual override command, PTZ home position on track lost, ONVIF auth credentials validation | planned |
| `tests/output/FR-W7-07-jammer-activation.test.ts` | new | FR-W7-07 | 12 | 900MHz channel activated on CONFIRMED_TERMINAL, 1575MHz channel activated on CONFIRMED_TERMINAL, NATS JAMMER_COMMANDS publish, command schema validation, max activation duration enforced (30s), ACK listener logs to Supabase, manual deactivation command, jammer offline graceful handling, duplicate activation guard (already active), deactivation on track lost, concurrent channel activation, command audit log format | planned |
| `tests/output/FR-W7-08-physical-intercept-coordinator.test.ts` | new | FR-W7-08 | 12 | SkyNet command published on IMPACT_IMMINENT, BRAVE1 extension block schema valid, pre-activation checklist: confidence > 0.85 required, pre-activation checklist: Monte Carlo ellipse < 50m required, pre-activation checklist: jammer ACK required, SKYNET_ACTIVATION stream publish, Supabase skynet_activations write, interceptor ID assignment, firing azimuth/elevation from BearingTriangulator, netRadius field validation, NATS R5 replication confirmed, failed pre-checklist blocks activation | planned |
| `tests/integration/FR-W7-09-sentinel-pipeline-v2.test.ts` | new | FR-W7-09 | 15 | Pipeline starts with coordinate injection, coordinate registry loads NODE_LAT/NODE_LON, NATS NODE_HEALTH updates coordinate registry, full end-to-end: audio → terminal phase event, all 5 new NATS streams subscribed, 16kHz audio capture validated, parallel ElrsFingerprint execution, BearingTriangulator receives bearing reports, TerminalPhaseDetector integrated in pipeline, PTZ command emitted on detection, jammer command blocked without CONFIRMED_TERMINAL, SkyNet blocked without IMPACT_IMMINENT, offline NATS buffer still works, graceful shutdown all hardware outputs, pipeline metrics include new stages | planned |
| `tests/ui/FR-W7-10-demo-dashboard.test.ts` | new | FR-W7-10 | 8 | TrackListPanel renders track data, terminal phase badge shows CONFIRMED_TERMINAL, heatmap renders with mock track positions, AcousticConfidencePanel shows profile scores, JammerStatusPanel shows active/inactive state, TerminalPhaseIndicator shows FSM state, Supabase Realtime subscription initializes, track list updates on new Supabase event | planned |

**Total new tests: ~136**
**Total tests post-W7: ~765 (629 existing + ~136 new)**

---

## New Documentation Files (20)

| Path | Type | Description | Status |
|------|------|-------------|--------|
| `docs/waves/W7/DESIGN.md` | doc | W7 high-level design: hardware integration architecture, FSM design, terminal phase doctrine, sensor-to-intercept pipeline | planned |
| `docs/waves/W7/PRD.md` | doc | Product requirements: W7 user stories, Radisson demo acceptance criteria, INDIGO integration requirements for W7 | planned |
| `docs/waves/W7/ARCHITECTURE.md` | doc | System architecture: full sensor-to-intercept pipeline diagram, NATS topic map with W7 streams, hardware integration topology | planned |
| `docs/waves/W7/DATABASE_SCHEMA.md` | doc | Migration 007 schema: terminal_phase_events, jammer_commands, skynet_activations, bearing_reports, ptz_command_log | planned |
| `docs/waves/W7/API_SPECIFICATION.md` | doc | New API contracts: TerminalPhaseDetector FSM event schema, BRAVE1 skynet_intercept extension, JAMMER_COMMANDS schema, BEARING_REPORTS schema, ONVIF PTZ command wrapper | planned |
| `docs/waves/W7/AI_PIPELINE.md` | doc | 16kHz ML pipeline: Wild Hornets ingestion, turbine model training, model routing architecture, yamnet-16khz-v1.onnx + yamnet-turbine-v1.onnx versioning | planned |
| `docs/waves/W7/PRIVACY_ARCHITECTURE.md` | doc | Privacy: jammer activation logging (PII implications of intercept commands), SkyNet audit trail, physical intercept data retention policy | planned |
| `docs/waves/W7/ROADMAP.md` | doc | W7 delivery milestones, W8 preview (federated learning across nodes), W9 preview (STANAG 4607 full compliance) | planned |
| `docs/waves/W7/TEST_STRATEGY.md` | doc | Test strategy: ~136 new tests breakdown, hardware mock patterns (ONVIF mock, jammer mock, RTL-SDR synthetic fixture), FSM test methodology | planned |
| `docs/waves/W7/ACCEPTANCE_CRITERIA.md` | doc | FR-by-FR acceptance criteria: FSM state transition validation, hardware mock integration tests, 16kHz pipeline correctness | planned |
| `docs/waves/W7/DECISION_LOG.md` | doc | This repository's ADR log — 11 ADRs covering all W7 architectural decisions | done |
| `docs/waves/W7/SESSION_STATE.md` | doc | Wave session state at init — W1-W6 summary, W7 scope, current test baseline, NATS state | done |
| `docs/waves/W7/ARTIFACT_REGISTRY.md` | doc | This file — all W7 artifacts with status tracking | done |
| `docs/waves/W7/DEPLOY_CHECKLIST.md` | doc | Pre/post deployment checklist: ~729 tests, migration 007, NATS streams, hardware integration tests | done |
| `docs/waves/W7/LKGC_TEMPLATE.md` | doc | Last Known Good Configuration — W6 LKGC + W7 rollback/forward recovery procedures | done |
| `docs/waves/W7/IMPLEMENTATION_PLAN.md` | doc | Module-by-module implementation order, dependency graph, P0 before P1 before P2, estimated effort per FR | planned |
| `docs/waves/W7/HANDOFF.md` | doc | Wave handoff: what was built, known gaps, W8 entry conditions | planned |
| `docs/waves/W7/FR_REGISTER.md` | doc | Formal FR register: FR-W7-01 through FR-W7-10 with priority, complexity, owner | planned |
| `docs/waves/W7/RISK_REGISTER.md` | doc | Risk register: Wild Hornets data access risk, SkyNet schema approval risk, ONVIF camera availability risk, jammer regulatory risk | planned |
| `docs/waves/W7/INTEGRATION_MAP.md` | doc | Integration map: INDIGO AirGuard hardware integration, NATS topic bindings, Supabase table dependencies, SkyNet command interface | planned |

---

## New Database Migration (1)

| Path | Type | FR | Description | Status |
|------|------|----|-------------|--------|
| `supabase/migrations/007_w7_hardware_integration.sql` | migration | FR-W7-03, FR-W7-05, FR-W7-06, FR-W7-07, FR-W7-08 | Creates tables: `terminal_phase_events` (FSM state log per track), `jammer_commands` (jammer activation audit), `skynet_activations` (physical intercept audit), `bearing_reports` (node-level bearing estimates), `ptz_command_log` (PTZ command history). Extends `nodes` table with `capabilities jsonb` column. Extends `ml_model_versions` with `frequency_domain text` column ('piston' or 'turbine'). | planned |

---

## New NATS Streams (5)

| Stream Name | Subject Pattern | Replicas | Retention | Max Age | FR |
|-------------|----------------|---------|-----------|---------|-----|
| `JAMMER_COMMANDS` | `sentinel.jammer.>` | 3 | limits | 7 days | FR-W7-07 |
| `PTZ_BEARING` | `sentinel.ptz.>` | 3 | limits | 1h | FR-W7-06 |
| `SKYNET_ACTIVATION` | `sentinel.skynet.>` | 5 | limits | 30 days | FR-W7-08 |
| `TERMINAL_PHASE` | `sentinel.terminal.>` | 3 | limits | 7 days | FR-W7-03 |
| `BEARING_REPORTS` | `sentinel.bearing.>` | 3 | limits | 5min | FR-W7-05 |

**SKYNET_ACTIVATION R5 and 30-day retention: intercept commands are legal/operational records.**

---

## New Schema Definitions

### BRAVE1 V2 Extension Block (SkyNet Intercept)

```typescript
interface BRAVE1SkyNetExtension {
  skynet_intercept: {
    version: '2.0';
    targetTrackId: string;
    interceptorId: string;
    firingAzimuth: number;    // degrees true north
    firingElevation: number;  // degrees above horizon
    netRadiusM: number;       // net deployment radius in meters
    activateAt: string;       // ISO 8601 UTC timestamp
    authorizedBy: string;     // operator ID
    triggerState: 'IMPACT_IMMINENT';
    preChecklistPassed: boolean;
    monteCarloEllipse90RadiusM: number;
    trackConfidence: number;
  }
}
```

### BRAVE1 V2 Extension Block (Jammer)

```typescript
interface BRAVE1JammerExtension {
  jammer_activation: {
    version: '2.0';
    jammerId: string;
    channel: '900mhz_fpv' | '1575mhz_gps';
    activateMs: number;       // max 30000
    trackId: string;
    triggerReason: string;
    triggerState: 'CONFIRMED_TERMINAL' | 'IMPACT_IMMINENT';
    timestamp: string;        // ISO 8601 UTC
  }
}
```

### ONVIF PTZ Bearing Command Schema

```typescript
interface PtzCommand {
  cameraId: string;
  trackId: string;
  panDegrees: number;       // 0–359.9, true north bearing
  tiltDegrees: number;      // -90 (down) to +90 (up)
  zoomLevel: number;        // 0.0–1.0 normalized
  source: 'bearing_triangulator' | 'tdoa_solver' | 'manual';
  timestamp: string;        // ISO 8601 UTC
  confidence: number;       // 0–1
}
```

### TerminalPhaseDetector FSM Event Schema

```typescript
interface TerminalPhaseEvent {
  trackId: string;
  fromState: TerminalPhaseState;
  toState: TerminalPhaseState;
  triggeredBy: TerminalPhaseIndicator[];
  indicatorValues: {
    speedDeltaPct?: number;
    bearingRateDegPerSec?: number;
    altitudeRateMPerSec?: number;
    rfSilenceDurationMs?: number;
  };
  timestamp: string;          // ISO 8601 UTC
  nodeId: string;
}

type TerminalPhaseState =
  'CRUISE' | 'MANEUVERING' | 'SUSPECTED_TERMINAL' | 'CONFIRMED_TERMINAL' | 'IMPACT_IMMINENT';

type TerminalPhaseIndicator =
  'SPEED_INCREASE' | 'COURSE_COMMITMENT' | 'ALTITUDE_DESCENT' | 'RF_SILENCE';
```

---

## New Model Artifacts

| Artifact | Format | Target Hardware | Quantization | Size (est.) | Source |
|----------|--------|----------------|-------------|-------------|--------|
| `yamnet-16khz-v1.onnx` | ONNX | All (base) | FP32 | ~14 MB | YAMNet fine-tuned on Wild Hornets 16kHz corpus |
| `yamnet-16khz-v1-int8.onnx` | ONNX | RPi4 ARM64 | INT8 | ~3.5 MB | Quantized from FP32 using ONNX Runtime quantize_dynamic |
| `yamnet-16khz-v1-fp16.onnx` | ONNX | Jetson Nano CUDA | FP16 | ~7 MB | FP16 export for Tensor Core inference |
| `yamnet-turbine-v1.onnx` | ONNX | All (base) | FP32 | ~14 MB | YAMNet fine-tuned on turbine drone audio (Shahed-238 class) |
| `yamnet-turbine-v1-int8.onnx` | ONNX | RPi4 ARM64 | INT8 | ~3.5 MB | INT8 quantized turbine model |

**Total edge model footprint on RPi4: ~7 MB (int8 piston + int8 turbine)**
**Total edge model footprint on Jetson: ~21 MB (fp16 piston + fp16 turbine + fp32 base)**

---

## New Scripts and Fixtures

| Path | Type | FR | Description | Status |
|------|------|----|-------------|--------|
| `scripts/ingest-wild-hornets.ts` | script | FR-W7-01 | Wild Hornets dataset secure transfer and validation. Verifies 16kHz format. Runs DatasetPipelineV2. Outputs split manifest. | planned |
| `scripts/create-w7-nats-streams.sh` | script | All | Creates 5 new NATS JetStream streams (JAMMER_COMMANDS, PTZ_BEARING, SKYNET_ACTIVATION, TERMINAL_PHASE, BEARING_REPORTS). Idempotent (checks before create). | planned |
| `tests/fixtures/elrs-900mhz-synthetic.json` | fixture | FR-W7-04 | Synthetic ELRS 900MHz burst signal fixture for CI tests. 200ms of IQ samples representing valid ELRS hopping pattern. No hardware required. | planned |
| `tests/fixtures/onvif-ptz-mock.ts` | fixture | FR-W7-06 | Mock ONVIF device server. Accepts PTZ commands, records them for test assertions. Returns ONVIF-compliant SOAP responses. | planned |
| `tests/fixtures/wild-hornets-16khz-sample.wav` | fixture | FR-W7-01 | 5-second 16kHz Shahed-136 acoustic sample (public domain field recording). Used for DatasetPipelineV2 unit tests without full dataset access. | planned |
| `scripts/migrate-w6-profiles-to-16khz.ts` | script | FR-W7-01 | One-time migration: re-processes all W6-era dataset clips through the 16kHz pipeline. Writes new `dataset_clips` rows with `sample_rate_hz=16000`. Old rows marked `deprecated=true`. | planned |

---

## Modified Existing Files (5)

| Path | Type | FR | Change Description | Status |
|------|------|----|-------------------|--------|
| `src/ml/dataset-pipeline.ts` | modify | FR-W7-01 | Add `@deprecated` JSDoc comment. Add export alias `DatasetPipelineV1`. No behavior change — V1 kept for test backward compatibility. | planned |
| `src/node/types.ts` | modify | FR-W7-05 | Extend `NodeCapabilities` interface: add `bearingCapable: boolean`, `hasDirectionalArray: boolean`, `rtlSdrAvailable: boolean` fields. | planned |
| `src/nats/stream-config.ts` | modify | FR-W7-03,05,06,07,08 | Add 5 new stream definitions: `JAMMER_COMMANDS`, `PTZ_BEARING`, `SKYNET_ACTIVATION`, `TERMINAL_PHASE`, `BEARING_REPORTS`. | planned |
| `src/output/brave1-format.ts` | modify | FR-W7-07,08 | Add `BRAVE1SkyNetExtension` and `BRAVE1JammerExtension` fields to BRAVE1 output envelope. Version bump to `brave1-format-version: '2.0'`. | planned |
| `memory/MEMORY.md` | modify | — | Update W7 status at wave-complete | planned |

---

## Artifact Counts Summary

| Category | Count |
|----------|-------|
| New source files | 10 |
| New test files | 10 |
| New ONNX model artifacts | 5 |
| New documentation files | 20 |
| New database migrations | 1 |
| New NATS streams | 5 |
| New scripts | 4 |
| New test fixtures | 3 |
| Modified files | 5 |
| **Total artifacts** | **63** |

---

## Completion Tracking

Progress updated at each wave-formation phase:

- `planned` → set at W7 INIT (this file)
- `tdd-red` → set when test file committed RED
- `in-progress` → set when source file implementation begins
- `done` → set when tests GREEN and coverage verified

### P0 Items (Must Complete Before P1)

1. FR-W7-01: DatasetPipelineV2 (16kHz fix — data integrity P0)
2. FR-W7-09: TdoaSolverInjection / SentinelPipelineV2 coordinate fix (correctness P0)
3. FR-W7-02: AcousticProfileLibraryV2 (Shahed-238 turbine model)
4. FR-W7-03: TerminalPhaseDetector (core C-UAS capability)

### P1 Items

5. FR-W7-04: ElrsFingerprint
6. FR-W7-05: BearingTriangulator
7. FR-W7-06: PtzSlaveOutput
8. FR-W7-10: DemoDashboard

### P2 Items (Require P0 + P1 Complete)

9. FR-W7-07: JammerActivation
10. FR-W7-08: PhysicalInterceptCoordinator
