# APEX-SENTINEL — Functional Requirements Register
# All waves W1–W7 | Last updated: 2026-03-25

---

## Summary

| Wave | FR Count | Status | Test Count |
|------|----------|--------|------------|
| W1 | 8 | DONE | 80 |
| W2 | 7 | DONE | 90 |
| W3 | 5 | DONE | 80 |
| W4 | 5 | DONE | 70 |
| W5 | 6 | DONE | 164 |
| W6 | 10 | DONE | 145 |
| W7 | 10 | PLANNED | 228 (est.) |
| **TOTAL** | **51** | | **~857** |

---

## W1 — Core Acoustic Detection Layer

| FR ID | Title | Wave | Status | Test File | AC Count | Priority |
|-------|-------|------|--------|-----------|----------|----------|
| FR-W1-01 | VoiceActivityDetector | W1 | DONE | `__tests__/acoustic/vad.test.ts` | 8 | P0 |
| FR-W1-02 | FFTProcessor | W1 | DONE | `__tests__/acoustic/fft.test.ts` | 8 | P0 |
| FR-W1-03 | YAMNetSurrogate | W1 | DONE | `__tests__/acoustic/yamnet-surrogate.test.ts` | 6 | P0 |
| FR-W1-04 | AcousticPipeline | W1 | DONE | `__tests__/pipeline/acoustic-pipeline.test.ts` | 10 | P0 |
| FR-W1-05 | RollingRssiBaseline | W1 | DONE | `__tests__/rf/rolling-rssi.test.ts` | 8 | P1 |
| FR-W1-06 | TdoaSolver | W1 | DONE | `__tests__/correlation/tdoa-solver.test.ts` | 10 | P0 |
| FR-W1-07 | TrackManager | W1 | DONE | `__tests__/tracking/track-manager.test.ts` | 12 | P0 |
| FR-W1-08 | NodeRegistry | W1 | DONE | `__tests__/node/node-registry.test.ts` | 8 | P1 |

---

## W2 — Mesh Network + Relay Layer

| FR ID | Title | Wave | Status | Test File | AC Count | Priority |
|-------|-------|------|--------|-----------|----------|----------|
| FR-W2-01 | NatsStreamManager | W2 | DONE | `__tests__/nats/nats-stream-manager.test.ts` | 8 | P0 |
| FR-W2-02 | MtlsCertManager | W2 | DONE | `__tests__/infra/mtls-cert-manager.test.ts` | 6 | P0 |
| FR-W2-03 | CircuitBreaker | W2 | DONE | `__tests__/infra/circuit-breaker.test.ts` | 10 | P0 |
| FR-W2-04 | EdgeFunctions | W2 | DONE | `__tests__/edge/edge-functions.test.ts` | 8 | P1 |
| FR-W2-05 | TelegramBot | W2 | DONE | `__tests__/relay/telegram-bot.test.ts` | 10 | P1 |
| FR-W2-06 | CotRelay | W2 | DONE | `__tests__/relay/cot-relay.test.ts` | 8 | P1 |
| FR-W2-07 | TdoaCorrelator | W2 | DONE | `__tests__/correlation/tdoa-correlator.test.ts` | 12 | P0 |

---

## W3 — Node Lifecycle + Calibration

| FR ID | Title | Wave | Status | Test File | AC Count | Priority |
|-------|-------|------|--------|-----------|----------|----------|
| FR-W3-01 | NatsClientFSM | W3 | DONE | `__tests__/nats/nats-client-fsm.test.ts` | 10 | P0 |
| FR-W3-02 | EventPublisher | W3 | DONE | `__tests__/nats/event-publisher.test.ts` | 8 | P0 |
| FR-W3-03 | CalibrationStateMachine | W3 | DONE | `__tests__/node/calibration-fsm.test.ts` | 10 | P0 |
| FR-W3-04 | BatteryOptimizer | W3 | DONE | `__tests__/node/battery-optimizer.test.ts` | 8 | P1 |
| FR-W3-05 | ModelManager | W3 | DONE | `__tests__/deploy/model-manager.test.ts` | 8 | P1 |

---

## W4 — Dashboard + Persistence Layer

| FR ID | Title | Wave | Status | Test File | AC Count | Priority |
|-------|-------|------|--------|-----------|----------|----------|
| FR-W4-01 | TrackStore | W4 | DONE | `__tests__/alerts/track-store.test.ts` | 10 | P0 |
| FR-W4-02 | AlertStore | W4 | DONE | `__tests__/alerts/alert-store.test.ts` | 10 | P0 |
| FR-W4-03 | CotExport | W4 | DONE | `__tests__/relay/cot-export.test.ts` | 8 | P1 |
| FR-W4-04 | StatsAggregator | W4 | DONE | `__tests__/dashboard/stats.test.ts` | 8 | P1 |
| FR-W4-05 | KeyboardShortcuts | W4 | DONE | `__tests__/dashboard/keyboard-shortcuts.test.ts` | 6 | P2 |

---

## W5 — Prediction Engine

| FR ID | Title | Wave | Status | Test File | AC Count | Priority |
|-------|-------|------|--------|-----------|----------|----------|
| FR-W5-01 | EKFInstance | W5 | DONE | `__tests__/prediction/ekf.test.ts` | 10 | P0 |
| FR-W5-02 | MatrixOps | W5 | DONE | `__tests__/prediction/matrix-ops.test.ts` | 10 | P0 |
| FR-W5-03 | PolynomialPredictor | W5 | DONE | `__tests__/prediction/polynomial-predictor.test.ts` | 8 | P0 |
| FR-W5-04 | ImpactEstimator | W5 | DONE | `__tests__/prediction/impact-estimator.test.ts` | 8 | P0 |
| FR-W5-05 | PredictionPublisher | W5 | DONE | `__tests__/prediction/prediction-publisher.test.ts` | 6 | P0 |
| FR-W5-06 | MultiTrackEKFManager | W5 | DONE | `__tests__/prediction/multi-track-manager.test.ts` | 10 | P0 |

---

## W6 — Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment

| FR ID | Title | Wave | Status | Test File | AC Count | Priority |
|-------|-------|------|--------|-----------|----------|----------|
| FR-W6-01 | AcousticProfileLibrary | W6 | DONE | `__tests__/ml/acoustic-profile-library.test.ts` | 10 | P0 |
| FR-W6-02 | YAMNetFineTuner | W6 | DONE | `__tests__/ml/yamnnet-finetuner.test.ts` | 10 | P0 |
| FR-W6-03 | FalsePositiveGuard | W6 | DONE | `__tests__/ml/false-positive-guard.test.ts` | 12 | P0 |
| FR-W6-04 | DatasetPipeline | W6 | DONE (DEFECTIVE — W7 fixes 22050Hz) | `__tests__/ml/dataset-pipeline.test.ts` | 10 | P0 |
| FR-W6-05 | MultiNodeFusion | W6 | DONE | `__tests__/fusion/multi-node-fusion.test.ts` | 10 | P0 |
| FR-W6-06 | MonteCarloPropagator | W6 | DONE | `__tests__/prediction/monte-carlo-propagator.test.ts` | 8 | P1 |
| FR-W6-07 | EdgeDeployer | W6 | DONE | `__tests__/deploy/edge-deployer.test.ts` | 8 | P1 |
| FR-W6-08 | SentinelPipeline | W6 | DONE (DEFECTIVE — W7 removes hardcoded coord) | `__tests__/integration/sentinel-pipeline.test.ts` | 12 | P1 |
| FR-W6-09 | CursorOfTruth | W6 | DONE | `__tests__/output/cursor-of-truth.test.ts` | 8 | P2 |
| FR-W6-10 | BRAVE1Format | W6 | DONE | `__tests__/output/brave1-format.test.ts` | 8 | P2 |

---

## W7 — Hardware Integration + Data Pipeline Rectification + Terminal Phase

| FR ID | Title | Wave | Status | Test File | AC Count | Priority |
|-------|-------|------|--------|-----------|----------|----------|
| FR-W7-01 | DatasetPipelineV2 (16kHz) | W7 | PLANNED | `__tests__/ml/dataset-pipeline-v2.test.ts` | 7 | P0 |
| FR-W7-02 | AcousticProfileLibrary + Gerbera/Shahed-131/238 | W7 | PLANNED | `__tests__/ml/acoustic-profile-library-v2.test.ts` | 7 | P0 |
| FR-W7-03 | TerminalPhaseDetector | W7 | PLANNED | `__tests__/tracking/terminal-phase-detector.test.ts` | 8 | P0 |
| FR-W7-04 | ElrsRfFingerprint | W7 | PLANNED | `__tests__/rf/elrs-rf-fingerprint.test.ts` | 7 | P0 |
| FR-W7-05 | BearingTriangulator | W7 | PLANNED | `__tests__/fusion/bearing-triangulator.test.ts` | 8 | P0 |
| FR-W7-06 | PtzSlaveOutput | W7 | PLANNED | `__tests__/output/ptz-slave-output.test.ts` | 7 | P1 |
| FR-W7-07 | JammerActivation | W7 | PLANNED | `__tests__/output/jammer-activation.test.ts` | 8 | P1 |
| FR-W7-08 | PhysicalInterceptCoordinator | W7 | PLANNED | `__tests__/output/physical-intercept-coordinator.test.ts` | 8 | P1 |
| FR-W7-09 | SentinelPipelineV2 (TdoaSolver injection) | W7 | PLANNED | `__tests__/integration/sentinel-pipeline-v2.test.ts` | 6 | P0 |
| FR-W7-10 | DemoDashboard | W7 | PLANNED | `__tests__/dashboard/demo-dashboard.test.ts` | 7 | P0 |

---

## W7 Acceptance Criteria Detail

### FR-W7-01 — DatasetPipelineV2 (16kHz Migration)

**Rationale:** INDIGO team field hardware runs at 16kHz. W6 DatasetPipeline was built at 22050Hz. This is a category error — mel spectrograms computed at different sample rates are incompatible. All downstream models depend on this constant. This is a data-breach-level defect, not a performance issue.

**Acceptance Criteria:**

- AC-01: `TARGET_SAMPLE_RATE` exported constant equals `16000` (not 22050)
- AC-02: `ingest()` rejects items where `item.sampleRate !== 16000` with a typed `SampleRateMismatchError` (not generic Error)
- AC-03: `AudioResampler.resample(pcm, 22050, 16000)` returns a Float32Array with length ratio = 16000/22050 (±0.5%)
- AC-04: Resampled output has no DC offset artefact (output mean absolute value < 1e-4)
- AC-05: Mel spectrogram frequency bins computed at 16kHz have Nyquist at 8000Hz (not 11025Hz as at 22050Hz)
- AC-06: `split()` output is deterministic post-migration — same `djb2` hash, same train/val/test splits as W6
- AC-07: `augment()` preserves `sampleRate: 16000` on output item — does not silently change it

---

### FR-W7-02 — AcousticProfileLibrary + New Threat Profiles

**Rationale:** Three confirmed threat types missing from W6 library: Gerbera (piston kamikaze, different frequency band than Shahed-136), Shahed-131 (higher RPM piston variant), Shahed-238 (turbine — completely separate acoustic class requiring separate ONNX model). Confirmed as gaps by INDIGO team Cat/George.

**Acceptance Criteria:**

- AC-01: `getProfile('gerbera')` returns `AcousticProfile` with `fundamentalFreqMin: 80`, `fundamentalFreqMax: 180`, `modelClass: 'piston'`
- AC-02: `getProfile('shahed-131')` returns profile with `fundamentalFreqMin: 150`, `fundamentalFreqMax: 400`, `typicalRpmRange[0] >= 3000`
- AC-03: `getProfile('shahed-238')` returns profile with `modelClass: 'turbine'`, `dominantFreqMin: 3000`, `requiresSeparateModel: true`
- AC-04: `matchFrequency(3000, 8000)` returns `shahed-238` as top result (turbine range)
- AC-05: `matchFrequency(80, 500)` does NOT return `shahed-238` (turbine does not match piston range)
- AC-06: All W7 profiles have `sampleRateHz: 16000` — not 22050
- AC-07: `getProfile('shahed-136')` still works (backwards compatibility, W6 profile preserved)

---

### FR-W7-03 — TerminalPhaseDetector

**Rationale:** The system must distinguish between a drone in cruise flight and one in terminal attack phase. Terminal phase detection enables pre-emptive interception rather than reactive response. The FSM uses four independent indicators: speed, heading lock, altitude descent rate, and RF link silence — requiring multiple to transition forward, preventing false TERMINAL declarations.

**Acceptance Criteria:**

- AC-01: Initial state is `CRUISE` for all new tracks
- AC-02: `CRUISE → APPROACH` transition fires when `speedExceedsThreshold OR headingLockedToTarget` AND `altitude < approachAltitudeM (default 500m AGL)`
- AC-03: `APPROACH → TERMINAL` transition fires when `rfLinkSilent AND altitudeDescentRate` (both required)
- AC-04: `CRUISE → TERMINAL` direct skip allowed when all 4 indicators true simultaneously (fast-moving low-altitude RF-silent descending contact)
- AC-05: `TERMINAL → IMPACT` fires when estimated altitude < 50m AGL from EKF
- AC-06: Abort/loiter: `TERMINAL → APPROACH` when `rfLinkSilent` becomes `false` AND altitude stabilises (loitering munition abort manoeuvre)
- AC-07: `confidence` output is sum of active indicators / 4 (0.25, 0.5, 0.75, 1.0 possible values)
- AC-08: `TerminalPhaseTransition.triggeredBy` records which indicator caused the transition

---

### FR-W7-04 — ElrsRfFingerprint

**Rationale:** ELRS (ExpressLRS) is the confirmed RC link for Foxeer TRX1003-equipped Russian FPV drones. Its FHSS pattern at 868/915MHz with highly regular inter-packet intervals is distinguishable from urban GSM/LoRa noise. When the operator loses or cuts the RC link before terminal phase, detecting this `rfSilent=true` event is a strong indicator of autonomous terminal phase.

**Acceptance Criteria:**

- AC-01: ELRS burst pattern recognised by interval regularity: `intervalStdDevMs < 0.5ms` at 500Hz packet rate
- AC-02: Non-ELRS traffic (irregular intervals, `intervalStdDevMs > 2ms`) rejected — `isElrsLike: false`
- AC-03: `packetLossRate` calculated as `(expectedPackets - observedPackets) / expectedPackets` over configurable window
- AC-04: `rfSilent: true` emitted when `packetLossRate > 0.8` for >= 2 continuous seconds
- AC-05: `rfSilent: false` emitted within 500ms of link resumption (packetLossRate drops below threshold)
- AC-06: 868MHz and 915MHz bands monitored independently — separate `ElrsPacketStats` per band
- AC-07: Zero observations in window returns `isElrsLike: false` (not an error, not a crash)

---

### FR-W7-05 — BearingTriangulator

**Rationale:** TDOA requires precise time-synchronised nodes. Bearing-only triangulation enables position estimation from mobile observers (phones, dismounted operators) who can only report a direction, not a TDOA. The weighted fusion correctly down-weights mobile phone compass bearings (±5°) vs fixed acoustic node bearings (±1°).

**Acceptance Criteria:**

- AC-01: 3 non-collinear `BearingReport` inputs produce a `TriangulationResult` with `degenerate: false` and `confidenceM` < 1000m
- AC-02: Mobile phone reports (`source: 'mobile-phone'`) receive weight 0.4; fixed nodes receive weight 1.0 in the Stansfield least-squares solve
- AC-03: Collinear inputs detected by cross-product magnitude < 1e-6 → `degenerate: true`, `confidenceM: Infinity`
- AC-04: Outlier rejection removes reports with residual > 2σ from the mean; re-solves without them and lists them in `rejectedReports`
- AC-05: Single-report input returns `degenerate: true` (no intersection possible)
- AC-06: 6-report overdetermined system has lower `confidenceM` than 3-report system (overdetermination improves accuracy)
- AC-07: `gdop` value > 5 when all reporters are within 10° arc (poor geometry)
- AC-08: `processingTimeMs` recorded for every triangulation call

---

### FR-W7-06 — PtzSlaveOutput

**Rationale:** PTZ cameras are the persistent tracking effector that keeps optics on a detected drone. Slaving the camera to EKF-predicted bearing at 100Hz with an 8ms lead compensates for servo latency. ONVIF RelativeMove is preferred over AbsoluteMove because it generates smaller command corrections, reducing servo oscillation.

**Acceptance Criteria:**

- AC-01: ONVIF `RelativeMove` SOAP payload is correctly constructed with `panTilt.x` and `panTilt.y` from bearing/elevation delta
- AC-02: When camera returns HTTP 400 on `RelativeMove`, system retries with `AbsoluteMove` (firmware compatibility fallback)
- AC-03: Publish rate does not exceed configured `publishRateHz` (default 100Hz) — tested with mock timer
- AC-04: Bearing for each PTZ command derived from EKF predicted state at `now + bearingLeadTimeMs` (default 8ms)
- AC-05: `PTZ_BEARING` NATS subject receives one `PtzBearingCommand` per cycle
- AC-06: Camera unreachable (TCP timeout) does not crash the output loop — logs error, skips cycle
- AC-07: `bearingDeg` 0-360 correctly maps to ONVIF normalised pan range [-1, +1]

---

### FR-W7-07 — JammerActivation

**Rationale:** Different drone types use different navigation and control RF links. Jamming the wrong frequency wastes power and has no effect. The class-to-channel map is determined by confirmed RF usage: FPV drones use ELRS 900MHz RC link; Shahed variants use GPS L1 (1575MHz) for autonomous navigation. Unknown classification MUST NOT trigger jamming.

**Acceptance Criteria:**

- AC-01: `droneClass: 'fpv'` maps to `channel: '900MHz'`
- AC-02: `droneClass: 'shahed-136'` maps to `channel: '1575MHz'`
- AC-03: `droneClass: 'shahed-238'` maps to `channel: '1575MHz'` (turbine Shahed still GPS-navigated)
- AC-04: `droneClass: 'unknown'` maps to `channel: 'disabled'` — `activated: false`, no NATS publish
- AC-05: `FalsePositiveGuard.isFalsePositive === true` → `activated: false`, `suppressedReason: 'false-positive'`
- AC-06: `classification.confidence < 0.85` → `activated: false`, `suppressedReason: 'below-confidence'`
- AC-07: Second activation attempt on same `trackId` while previous command active → `suppressedReason: 'already-active'`
- AC-08: Valid activation publishes to NATS `JAMMER_COMMANDS` with correct `JammerCommand` schema

---

### FR-W7-08 — PhysicalInterceptCoordinator

**Rationale:** The SkyNet net-gun is the last-resort physical intercept layer. It must only fire when the impact prediction is high-confidence AND a unit is within effective range AND the unit is ready. The 0.6 confidence gate prevents accidental deployment against uncertain tracks. Fire timing is calculated from current drone speed and intercept geometry.

**Acceptance Criteria:**

- AC-01: `confidence > 0.6` on `ImpactPrediction` is required to issue `SkyNetFireCommand` — below this returns `issued: false`
- AC-02: `SkyNetUnit.status !== 'ready'` → `rejectedReason: 'unit-not-ready'`, `issued: false`
- AC-03: No unit within `unit.maxRangeM` of predicted impact point → `rejectedReason: 'no-unit-in-range'`, `issued: false`
- AC-04: `getNearestUnit()` correctly sorts by haversine distance from `impactPrediction.lat/lon`
- AC-05: `fireAtS` calculation accounts for projectile travel time based on range and unit specs
- AC-06: Valid command published to NATS `SKYNET_ACTIVATION` with complete `SkyNetFireCommand` schema
- AC-07: `commandId` is unique per command (UUID v4)
- AC-08: `elevationDeg` calculated from altitude delta between unit and predicted impact point using arctangent

---

### FR-W7-09 — SentinelPipelineV2 (TdoaSolver Coordinate Injection)

**Rationale:** W6's SentinelPipeline contained `{lat: 51.5, lon: 4.9}` as a hardcoded fallback position. In production, this would assign all unresolved tracks to a fixed point in the Netherlands, corrupting impact prediction, intercept coordination, and dashboard display. The fix is to return `null` position when TDOA cannot converge — the caller must handle the null case.

**Acceptance Criteria:**

- AC-01: `TdoaSolver.solve()` is called with actual node positions — no hardcoded `{lat: 51.5, lon: 4.9}` anywhere in `SentinelPipelineV2`
- AC-02: When `TdoaSolver.solve()` returns `null` (non-convergent), `PipelinePositionResult.lat` and `.lon` are `null`
- AC-03: `PipelinePositionResult.fallbackUsed` is always `false` — the field exists to document the contract, not to enable silent fallback
- AC-04: `BearingTriangulator` result fused with TDOA result when both are available (`fusionStrategy: 'weighted-average'`)
- AC-05: When only BearingTriangulator result is available, `source: 'bearing'` is returned
- AC-06: `SentinelPipeline` (V1) is marked `@deprecated` with JSDoc pointing to `SentinelPipelineV2`

---

### FR-W7-10 — DemoDashboard

**Rationale:** The Radisson demonstration requires a live-display dashboard showing real-time drone tracks, alert log, and heatmap of detection density. This must be operational before other W7 hardware FRs to enable the demo booking to proceed — it is a P0 commercial blocker even though it depends on all other FRs for full functionality (SSE feed can operate with mock data during development).

**Acceptance Criteria:**

- AC-01: SSE route (`/api/tracks/sse`) emits `DashboardTrack` events on Supabase real-time `tracks` table insert
- AC-02: Leaflet map renders track markers at correct lat/lon from SSE feed
- AC-03: Alert log displays all unacknowledged alerts sorted by severity (CRITICAL first)
- AC-04: Operator auth: unauthenticated requests to dashboard pages redirect to `/login`
- AC-05: Detection heatmap updates on new `DashboardTrack` event (Leaflet.heat layer)
- AC-06: `OperatorStatus` panel shows: node count, active tracks, last detection timestamp, system health
- AC-07: Dashboard loads in < 3s on 10Mbps connection (Lighthouse performance score ≥ 80)

---

*FR Register version 7.0.0 — W1-W7 complete — 51 FRs total*
