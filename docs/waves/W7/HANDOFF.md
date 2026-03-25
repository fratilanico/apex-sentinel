# APEX-SENTINEL W7 — Handoff Document
## Wave 7: Hardware Integration + Data Pipeline Rectification + Terminal Phase
## Status: PLANNED | Date: 2026-03-25
## Supabase: bymfcnwfyxuivinuzurr (eu-west-2)

---

## 1. WAVE IDENTITY

| Field | Value |
|-------|-------|
| Wave | W7 |
| Project | APEX-SENTINEL |
| Supabase project | bymfcnwfyxuivinuzurr (eu-west-2) |
| Repo | /Users/nico/projects/apex-sentinel |
| Branch | main |
| Previous wave | W6 — COMPLETE (629 tests, 95.66% stmt / 89.22% branch / 97.19% funcs) |
| W7 estimated test count | 228 |
| W7 target combined total | ~857 tests |

---

## 2. WHAT W1-W6 DELIVERED (FOUNDATION FOR W7)

### W1 — Core Acoustic Detection (80 tests)
- VAD, FFT, YAMNetSurrogate, AcousticPipeline, RollingRssiBaseline, TdoaSolver, TrackManager, NodeRegistry
- Foundation: raw PCM → acoustic detection event

### W2 — Mesh + Relay Layer (90 tests)
- NATS JetStream streams, mTLS, CircuitBreaker, EdgeFunctions, TelegramBot, CotRelay, TdoaCorrelator
- Foundation: multi-node mesh communication backbone

### W3 — Node Lifecycle + Calibration (80 tests)
- NatsClientFSM, EventPublisher, CalibrationStateMachine, BatteryOptimizer, ModelManager
- Foundation: autonomous node management and model versioning

### W4 — Dashboard + Persistence (70 tests)
- TrackStore, AlertStore, CotExport, StatsAggregator, KeyboardShortcuts
- Foundation: Supabase persistence and operator-facing data

### W5 — Prediction Engine (164 tests)
- EKFInstance (Singer Q, 6D state), MatrixOps, PolynomialPredictor, ImpactEstimator, PredictionPublisher, MultiTrackEKFManager
- Foundation: trajectory prediction and ground impact estimation

### W6 — Military Acoustic Intelligence + Edge Deployment (145 tests)
- AcousticProfileLibrary (4 seed profiles: Shahed-136, Lancet-3, Mavic Mini, Orlan-10)
- YAMNetFineTuner (ONNX export, training metrics)
- FalsePositiveGuard (confidence gate, Doppler, temporal, RF cross-check)
- DatasetPipeline (**22050Hz — BROKEN, W7 P0 fix**)
- MultiNodeFusion (TDOA + acoustic fusion)
- MonteCarloPropagator (impact uncertainty Monte Carlo)
- EdgeDeployer (RPi4 / Jetson deployment bundle)
- SentinelPipeline (**hardcoded {lat:51.5, lon:4.9} — BROKEN, W7 P0 fix**)
- CursorOfTruth (CoT XML v2)
- BRAVE1Format (BRAVE-1 standard output)

**Known W6 defects being fixed in W7:**
1. `DatasetPipeline.TARGET_SAMPLE_RATE = 22050` — must be 16000 (INDIGO team confirmed)
2. `SentinelPipeline` hardcoded coordinate fallback at lat:51.5 lon:4.9 — must be removed

---

## 3. WHAT W7 DELIVERS

### 3.1 Data Pipeline Rectification (P0)
- `DatasetPipelineV2` with `TARGET_SAMPLE_RATE = 16000`
- `AudioResampler` for converting legacy 22050Hz fixtures
- All model training and inference now aligned to 16kHz hardware
- Migration script: `scripts/migrate-fixtures-16khz.ts`

### 3.2 New Threat Profiles
- **Gerbera** — piston kamikaze, ~80-180Hz fundamental, heavy low-frequency content
- **Shahed-131** — smaller piston, higher RPM (~150-400Hz), easily confused with Shahed-136
- **Shahed-238** — turbine, 3000-8000Hz dominant, `requiresSeparateModel: true`
- All profiles annotated at 16kHz, with `modelClass` discriminator (piston/turbine/electric)

### 3.3 Terminal Phase Detection FSM
- `TerminalPhaseDetector` — 4-state FSM: CRUISE → APPROACH → TERMINAL → IMPACT
- Inputs: EKF state (speed, heading, altitude), ElrsRfFingerprint (rfSilent)
- Publishes to NATS `TERMINAL_PHASE` subject
- Abort/loiter transitions supported (TERMINAL → APPROACH on RF link resumption)

### 3.4 ELRS RF Fingerprinting
- `ElrsRfFingerprint` — detects Foxeer TRX1003 FHSS bursts at 868/915MHz
- Distinguishes ELRS packet regularity from urban 900MHz noise (GSM, LoRa)
- Emits `rfSilent=true` when packet loss > 0.8 for >= 2 seconds
- NATS subject: `BEARING_REPORTS` (RF observations)

### 3.5 Bearing Triangulation
- `BearingTriangulator` — weighted Stansfield least-squares intersection
- Handles: mobile phone bearings (weight 0.4), fixed node bearings (weight 1.0)
- Handles: degenerate collinear case (returns `degenerate: true`)
- Outlier rejection: 2σ Mahalanobis distance
- NATS subject: `BEARING_REPORTS`

### 3.6 SentinelPipelineV2
- Replaces hardcoded lat:51.5 lon:4.9 with real TdoaSolver.solve() result
- Returns `null` position when solver cannot converge — never a fake coordinate
- Fusion strategy: TDOA primary + BearingTriangulator secondary, weighted average option

### 3.7 PTZ Camera Slaving (ONVIF)
- `PtzSlaveOutput` — 100Hz bearing updates via ONVIF RelativeMove
- Targets Dahua PTZ hardware (tested against ONVIF mock in W7)
- EKF t+8ms prediction lead (one servo response latency ahead)
- NATS subject: `PTZ_BEARING`
- Fallback: AbsoluteMove for incompatible firmware

### 3.8 Jammer Activation
- `JammerActivation` — drone class to frequency channel map
- FPV → 900MHz, Shahed-* → 1575MHz GPS L1, unknown → disabled
- Never activates on FalsePositiveGuard-suppressed tracks
- NATS subject: `JAMMER_COMMANDS`

### 3.9 Physical Intercept Coordinator (SkyNet)
- `PhysicalInterceptCoordinator` — pre-positions net-gun based on ImpactPrediction
- Confidence gate: > 0.6 required to issue fire command
- `SkyNetUnitRegistry` — manages available units by status and range
- NATS subject: `SKYNET_ACTIVATION`
- **W7 limitation: SkyNet API is simulated. No real hardware tested in W7.**

### 3.10 Demo Dashboard
- Next.js 14 App Router, Leaflet track map, SSE feed from SentinelPipelineV2
- Supabase `tracks` table real-time subscription
- Alert log with severity, Leaflet heatmap of detection density
- Operator authentication (NextAuth.js, single account for demo)
- **W7 limitation: demo-grade auth, not production-hardened**

---

## 4. WHAT W8 MUST BUILD ON TOP OF W7

### 4.1 Field Trial with Real Hardware
W7 implements and tests all hardware interfaces against mocks. W8 must execute field trials:
- **Dahua PTZ camera** — real ONVIF RelativeMove test, calibrate pan/tilt mapping to bearing
- **ELRS RF receiver** — field test with actual drone FHSS signal, tune burst detection parameters
- **Acoustic nodes** — outdoor deployment, characterise ambient noise floor per site
- W8 must produce a calibration protocol document: node placement, acoustic baseline, RF baseline

### 4.2 TdoaSolver Node Placement Calibration Protocol
W7's `SentinelPipelineV2` uses `TdoaSolver.solve()` but the solver's accuracy depends on node geometry (GDOP). W8 must:
- Define minimum node placement requirements (e.g., no more than 3 collinear nodes, spread > 200m)
- Produce a `CalibrationProtocol.md` for field teams
- Implement `GeometryAdvisor` that scores proposed node placements against GDOP threshold

### 4.3 Multi-Threat Simultaneous Tracking
W7 tracks single threats through the pipeline. W8 must:
- Test simultaneous Lancet + Shahed-136 co-presence (classification crosstalk)
- `MultiThreatCoordinator` — prevents single jammer activation from interfering with tracking a second simultaneous threat
- `JammerDeconfliction` — ensure 900MHz and 1575MHz activation do not occur simultaneously on overlapping frequency bands

### 4.4 Acoustic Node Weatherproofing Specification
All W1-W7 acoustic code assumes clean signal delivery. W8 must:
- Define weatherproofing enclosure spec for outdoor nodes (IP rating, acoustic baffle design)
- Implement `WeatherCompensation` in VAD/FFT — rain noise filter, wind noise rejection
- Characterise microphone sensitivity degradation at temperature extremes (-20°C to +55°C)

### 4.5 5-Node Mesh Physical Deployment Guide
W7 focuses on software. W8 must produce:
- Physical hardware bill of materials (RPi4 vs Jetson, microphone type, PoE or battery)
- Network topology guide (WireGuard mesh vs NATS bridge per node)
- Node firmware update procedure via `EdgeDeployer` (W6)
- Site survey checklist

### 4.6 Wild Hornets Dataset (CRITICAL BLOCKER)
If the Wild Hornets dataset (3000+ field recordings) was not obtained during W7, W8 must make this P0. Without it:
- Gerbera model accuracy will be <70% (synthetic augmentation insufficient)
- Shahed-131 vs Shahed-136 discrimination will be unreliable
- The W7 `AcousticProfileLibrary` profiles are spec-complete but the backing ONNX models will not reach deployment quality

W8 Wild Hornets integration:
- Ingest via `DatasetPipelineV2` (16kHz, confirmed compatible)
- Re-train `YAMNetFineTuner` with augmented Wild Hornets corpus
- Evaluate on holdout set: target ≥90% classification accuracy, ≤5% FP rate
- Export new ONNX model versions: piston-v2.onnx, turbine-v1.onnx (Shahed-238 separate class)

### 4.7 Shahed-238 Turbine Model
W7 adds the Shahed-238 profile with `requiresSeparateModel: true` as a placeholder. No actual training data exists for turbine drones in the current dataset. W8 must:
- Obtain turbine UAV recordings (synthetic jet turbine audio as interim training data)
- Build a separate ONNX model class: `turbine-classifier.onnx`
- Add turbine frequency range as a heuristic gate (3000-8000Hz dominant) to catch turbines with the piston model until turbine model is trained

### 4.8 Production Dashboard Auth
W7's DemoDashboard uses single-account NextAuth for demo purposes. W8 must:
- Multi-operator RBAC (operator / supervisor / admin)
- Audit log of all jammer activations and SkyNet fire commands
- Session timeout and 2FA for operator accounts
- TLS certificate for production endpoint

### 4.9 SkyNet API Documentation and Real Integration
W7 implements a generic `SkyNetFireCommand` schema. George (INDIGO team) must provide the actual SkyNet net-gun API spec before W8. W8 deliverable: validated SkyNet integration with real hardware command format.

---

## 5. KNOWN W7 LIMITATIONS

| Limitation | Impact | W8 Resolution |
|------------|--------|---------------|
| SkyNet interface simulated — no real hardware tested | Fire commands unvalidated | Field trial W8 |
| PTZ ONVIF tested against mock only | Camera firmware differences unknown | Dahua real-device test W8 |
| Demo dashboard auth is single-account NextAuth | Not production-grade | RBAC + 2FA W8 |
| Shahed-238 turbine — no training data | Profile is heuristic-only | Wild Hornets / synthetic corpus W8 |
| ELRS fingerprint tuned on simulated bursts | Real-world false positive rate unknown | Field RF test W8 |
| BearingTriangulator uses phone compass (±5°) | Mobile bearing accuracy insufficient for precision intercept | Radar bearing input W8 |
| SentinelPipelineV2 returns null on no TDOA convergence | Dashboard shows gap | Multi-path fallback strategy W8 |

---

## 6. NATS SUBJECTS INTRODUCED IN W7

| Subject | Publisher | Consumer | QoS |
|---------|-----------|----------|-----|
| `TERMINAL_PHASE` | TerminalPhaseDetector | AlertStore, DemoDashboard | JetStream durable |
| `BEARING_REPORTS` | BearingTriangulator | MultiNodeFusion | JetStream durable |
| `PTZ_BEARING` | PtzSlaveOutput | Dahua PTZ (ONVIF) | at-most-once |
| `JAMMER_COMMANDS` | JammerActivation | jammer-controller consumer | JetStream durable |
| `SKYNET_ACTIVATION` | PhysicalInterceptCoordinator | skynet-controller consumer | JetStream durable |

Pre-existing subjects (W1-W6, unchanged):
- `sentinel.detections.{nodeId}` — acoustic detections
- `sentinel.tracks.{trackId}` — track updates
- `sentinel.alerts` — alert events
- `sentinel.predictions.{trackId}` — EKF + polynomial predictions

---

## 7. SUPABASE SCHEMA ADDITIONS IN W7

New tables required (migrations in `supabase/migrations/W7/`):

```sql
-- skynet_units: physical interception unit registry
CREATE TABLE skynet_units (
  unit_id TEXT PRIMARY KEY,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  alt_m DOUBLE PRECISION DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ready',
  max_range_m INTEGER NOT NULL,
  bearing_coverage_min INTEGER NOT NULL,
  bearing_coverage_max INTEGER NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- jammer_activations: audit log of all jammer commands
CREATE TABLE jammer_activations (
  command_id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  drone_class TEXT NOT NULL,
  channel TEXT NOT NULL,
  activated BOOLEAN NOT NULL,
  suppressed_reason TEXT,
  activated_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL,
  confidence DOUBLE PRECISION NOT NULL
);

-- terminal_phase_events: FSM transition audit
CREATE TABLE terminal_phase_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  track_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  transitioned_at TIMESTAMPTZ NOT NULL,
  indicators JSONB NOT NULL
);
```

---

## 8. W7 EXIT CRITERIA

All of the following must be true before W8 can be initialised:

- [ ] 228 new W7 tests passing (or exceeded)
- [ ] Combined test total ≥ 857
- [ ] Coverage: ≥80% branches, ≥95% statements, ≥97% functions
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm run build` — zero errors
- [ ] DemoDashboard deployed and accessible at known URL
- [ ] Supabase W7 migrations applied to bymfcnwfyxuivinuzurr
- [ ] `wave-formation.sh complete W7` executed
- [ ] This HANDOFF.md reviewed and countersigned by Nico
- [ ] MEMORY.md updated with W7 status

---

## 9. CONTACTS AND ASSETS

| Entity | Details |
|--------|---------|
| INDIGO team contact | Cat / George — confirmed 16kHz pipeline, Wild Hornets dataset source |
| Dahua PTZ hardware | Procurement required for W8 field trial |
| SkyNet API spec | George to provide before W8 init |
| Wild Hornets dataset | 3000+ field recordings — source to be confirmed W7 or W8 |
| Foxeer TRX1003 spec | ELRS 900MHz receiver, confirmed Russian FPV RF link hardware |

---

*Handoff document version 7.0.0 — 2026-03-25*
*Next wave: W8 — Field Trial + Multi-Threat + Production Hardening*
