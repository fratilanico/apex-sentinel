# APEX-SENTINEL — PRD.md
## Wave 7: Hardware Integration Layer + Data Pipeline Rectification + Terminal Phase Detection
### Wave 7 | Project: APEX-SENTINEL | Version: 7.0.0
### Date: 2026-03-25 | Status: APPROVED
### Supabase: bymfcnwfyxuivinuzurr (eu-west-2 London)

---

## 1. PRODUCT CONTEXT

### 1.1 Background

APEX-SENTINEL W1–W6 delivered a complete drone detection pipeline: acoustic classification (YAMNet fine-tuned), multi-node fusion, EKF trajectory prediction, Monte Carlo risk propagation, false positive suppression, and ATAK CoT output. The system has 629 tests, 95.66% statement coverage, and is deployable on RPi 4 / Jetson Nano edge hardware.

W7 addresses three critical gaps identified at the INDIGO review meeting (George, Cat, Liviu):

**Gap 1 — Data compatibility breach**: Our 22050Hz sample rate is incompatible with INDIGO's entire training corpus (16kHz). Every model trained before W7 migration is suspect. This is a P0 blocker before any new training begins.

**Gap 2 — Missing threat profiles**: Gerbera, Shahed-131, and Shahed-238 (jet engine) are not in our AcousticProfileLibrary. The Shahed-238 jet variant is actively deployed and our classifier would emit `unknown` instead of an actionable threat class.

**Gap 3 — No hardware effector layer**: The system can detect and track but cannot direct cameras, activate jammers, or coordinate physical intercept. The Radisson demo requires live PTZ slaving and simulated jammer/SkyNet activation.

### 1.2 Stakeholders

| Stakeholder | Role | W7 Requirements |
|---|---|---|
| George (INDIGO team lead) | Hardware integration, field deployment | BearingTriangulator (phone GPS+compass), PTZ ONVIF protocol, ELRS RF module |
| Cat (INDIGO acoustic lead) | ML model quality, dataset pipeline | 16kHz migration, new acoustic profiles, retrained YAMNet fine-tune head |
| Liviu (strategic, INDIGO partner) | Demo quality, BRAVE1 data partnership | Radisson demo dashboard, BRAVE1 data feed, briefing-ready UI |
| BRAVE1 (Ukrainian MoD data partner) | Training data, operational validation | Dataset schema compatibility, BRAVE1 detection format unchanged |
| Nico (APEX OS founder) | Architecture, code quality | TDD compliance, W7 tests ≥ 200 new, all existing 629 passing |

### 1.3 W7 Theme

> Wave 7 converts APEX-SENTINEL from a detection-and-alert system into a full counter-UAS engagement layer: detect → classify → track → predict → slave PTZ → activate jammer → coordinate physical intercept. The 16kHz migration ensures the system can be trained on real-world battlefield data.

---

## 2. FUNCTIONAL REQUIREMENTS

### FR-W7-01: DatasetPipeline 16kHz Migration

**Priority**: P0 — Must ship before any new model training

**User story**: As Cat (acoustic lead), I need the entire audio pipeline to operate at 16kHz so that I can train YAMNet fine-tune heads on INDIGO's existing 16kHz dataset without resampling artifacts.

**Acceptance criteria**:
- [ ] `AudioCapture.SAMPLE_RATE` constant changed to `16000` (was `22050`)
- [ ] Ring buffer resized: `2 × 16000 = 32000` samples
- [ ] Hop size: `8000` samples (0.5s at 16kHz)
- [ ] `n_fft` updated to `512` (was `1024`) — maintains ~32ms window at 16kHz
- [ ] `hop_length` updated to `160` (was `220`) — maintains 10ms frame shift
- [ ] `fmax` updated to `7800` Hz (Nyquist safety margin at 8000Hz)
- [ ] Resample shim added: accepts 22050Hz input, transparently resamples to 16000Hz for backward compat
- [ ] All W6 spectrogram tests updated to new parameters and passing
- [ ] DatasetPipeline integration test: ingest 16kHz WAV, produce spectrogram, verify shape `[128, T]`
- [ ] Unit test: resample shim preserves energy within ±1dB across 80–7800Hz
- [ ] Performance test: resample shim adds < 5ms on target hardware (RPi 4 ARM Cortex-A72)

**Non-functional**: Migration is backward compatible during transition window. Zero data loss.

---

### FR-W7-02: AcousticProfileLibrary Expansion

**Priority**: P0 — Required for complete threat classification

**User story**: As Cat, I need acoustic profiles for Gerbera, Shahed-131, and Shahed-238 so that the classifier can correctly identify all currently-deployed Russian drone variants rather than returning `unknown`.

**Acceptance criteria**:
- [ ] `AcousticProfileLibrary.getProfile('gerbera')` returns complete profile with frequency bands, harmonic structure, temporal patterns
- [ ] `AcousticProfileLibrary.getProfile('shahed-131')` returns complete profile distinct from `shahed-136`
- [ ] `AcousticProfileLibrary.getProfile('shahed-238')` returns jet engine profile (turbine shaft harmonics, broadband combustion signature 3–8kHz)
- [ ] Two-tower classifier architecture: `PistonClassifier` and `JetClassifier` — Shahed-238 routes to JetClassifier
- [ ] Profile unit tests: each profile has min 10 unit tests covering frequency bounds, harmonic ratios, temporal duration constraints
- [ ] Cross-confusion test: Shahed-238 spectrogram does NOT trigger Shahed-136 classification (spectral centroid discrimination: <1200Hz = piston, >2000Hz = jet)
- [ ] Integration test: DatasetPipeline → AcousticProfileLibrary classification round-trip with synthetic spectrograms for all 3 new classes
- [ ] All 3 profiles included in YAMNet fine-tune training manifest (`training/manifest-w7.json`)

---

### FR-W7-03: TerminalPhaseDetector

**Priority**: P0 — Core W7 feature, required for all hardware effectors

**User story**: As a field operator, I need the system to automatically recognize when a drone transitions from cruise to terminal attack phase so that countermeasures can be activated within the 4–12 second window before impact.

**Acceptance criteria**:
- [ ] `TerminalPhaseDetector` class implements 4-indicator FSM with states: `CRUISE | ALERT | TERMINAL | IMPACT`
- [ ] Indicator 1 (SPEED_INCREASE): fires when EKF velocity > 1.25× 30s rolling average
- [ ] Indicator 2 (COURSE_CORRECTION): fires on snap-lock heading pattern: |dΨ/dt| > 8°/s for >2s then |dΨ/dt| < 1°/s
- [ ] Indicator 3 (ALTITUDE_DESCENT): fires when dz/dt < -15 m/s sustained for >1.5s; fallback: dSPL/dt > +3 dB/s
- [ ] Indicator 4 (RF_SILENCE): fires when ELRS RSSI drops >20dB in <3s (FPV drones only)
- [ ] State transition: CRUISE→ALERT on any 1 indicator; ALERT→TERMINAL on ≥3 indicators within 5s
- [ ] Hysteresis: ALERT→CRUISE requires all indicators clear for 3 consecutive seconds
- [ ] Drone class weights: RF_SILENCE has weight=0 for Shahed/Gerbera (no RF link)
- [ ] FSM state changes published to NATS subject `sentinel.terminal.{trackId}`
- [ ] TERMINAL state event includes: `{ trackId, droneClass, indicators: string[], confidence: number, t_unix_ms: number }`
- [ ] Unit tests: ≥20 tests covering all state transitions, hysteresis, drone class weight matrix
- [ ] Simulation test: synthetic EKF trajectory with embedded terminal phase — detector fires within 800ms of ground truth transition

---

### FR-W7-04: ELRS 900MHz RF Fingerprint Module

**Priority**: P1 — Required for RF_SILENCE indicator and FPV terminal detection

**User story**: As George, I need the system to monitor ELRS 900MHz control link presence so that FPV terminal phase can be detected via RF silence even when acoustic signature is ambiguous.

**Acceptance criteria**:
- [ ] `ElrsMonitor` class interfaces with RTL-SDR (or dedicated ELRS monitor hardware) via USB
- [ ] Detects ELRS 900MHz band activity: 902–928 MHz, packet rate 50–500Hz
- [ ] Reports RSSI in dBm, packet rate, and link quality percentage
- [ ] Emits `ElrsLinkLostEvent` when: RSSI drops >20dB in <3s OR packet rate drops to 0
- [ ] Drone association: correlates ELRS signal direction (if directional antenna) with tracked FPV bearing
- [ ] Publishes to NATS: `sentinel.rf.elrs.{nodeId}` — `{ rssi_dbm, packet_rate_hz, link_quality_pct, t_unix_ms }`
- [ ] Graceful degradation: if no RTL-SDR hardware present, ElrsMonitor operates in simulation mode
- [ ] Unit tests: ≥15 tests covering RSSI threshold logic, packet rate detection, link-lost event timing
- [ ] Mock hardware tests: full pipeline test with mock RTL-SDR interface

---

### FR-W7-05: BearingTriangulator

**Priority**: P1 — Required for mobile node position fixing, TdoaSolver fallback

**User story**: As George, I need field operators with phones to submit acoustic bearing reports and have the server compute a target position via triangulation so that we can operate without fixed node infrastructure.

**Acceptance criteria**:
- [ ] `BearingTriangulator` class accepts `BearingReport[]` input
- [ ] `BearingReport` schema: `{ nodeId, lat, lng, bearing_deg, uncertainty_deg, t_unix_ms, acoustic_confidence }`
- [ ] Implements least-squares bearing intersection: builds matrix A from [sin(θ), -cos(θ)] rows, solves via (AᵀA)⁻¹Aᵀb
- [ ] Handles N ≥ 2 reports; returns null if N < 2
- [ ] Reports position uncertainty (1σ ellipse) based on individual bearing uncertainties
- [ ] Temporal gating: only uses reports within 2s window (drone moves during collection)
- [ ] Fuses with TdoaSolver output via Kalman filter when both available (FR-W7-09)
- [ ] Unit tests: ≥15 tests including 2-node perfect intersection, 4-node overdetermined, degenerate geometry (collinear nodes)
- [ ] Accuracy test: with simulated ±7° bearing uncertainty at 500m range → position error < 80m (1σ)

---

### FR-W7-06: PtzSlaveOutput

**Priority**: P1 — Required for Radisson demo

**User story**: As Liviu, I need the demo to show a Dahua PTZ camera automatically slaving to a detected drone bearing at 100Hz so that the Radisson audience can see the system direct a physical camera.

**Acceptance criteria**:
- [ ] `PtzSlaveOutput` class maintains persistent TCP connection to Dahua camera via ONVIF/SOAP
- [ ] Supports ONVIF AbsoluteMove (initial acquisition) and ContinuousMove (tracking)
- [ ] Update rate: 100Hz bearing updates → 100Hz ContinuousMove commands
- [ ] 6–8ms lookahead compensation: commands target predicted position at T + 115ms
- [ ] Bearing source: primary = EKF bearing; fallback = BearingTriangulator bearing
- [ ] Camera configuration: lat/lng/alt, pan/tilt range, ONVIF endpoint URL, auth credentials (env vars)
- [ ] Handles ONVIF auth (HTTP Digest): WS-Security SOAP header generation
- [ ] Reconnect on TCP drop: exponential backoff, base 100ms, max 5s
- [ ] Publishes PTZ command log to NATS: `sentinel.ptz.commands.{cameraId}`
- [ ] Unit tests: ≥15 tests including ONVIF XML generation, bearing-to-PTZ coordinate conversion, lookahead math
- [ ] Integration test with mock ONVIF server: full command sequence from TERMINAL event to ContinuousMove

---

### FR-W7-07: JammerActivation Event Channel

**Priority**: P1 — Required for demo and operational capability

**User story**: As a site commander, I need the system to automatically select and activate the appropriate RF jammer when a drone enters terminal phase so that the correct frequency band is jammed without manual selection.

**Acceptance criteria**:
- [ ] `JammerActivation` class subscribes to `sentinel.terminal.>` NATS subject
- [ ] Drone class → jammer frequency mapping: FPV/ELRS → 902–928MHz; Shahed/Gerbera → GPS L1 1575.42MHz
- [ ] Two authorization modes: `AUTO` (immediate activate) and `CONFIRM` (wait up to 5s for operator confirm)
- [ ] Activation command published to NATS: `sentinel.jammer.commands` — `{ frequency_mhz, power_dbm, direction_deg, authorize_id, t_unix_ms }`
- [ ] Hardware interface: REST call to jammer controller (or simulation mode if no hardware)
- [ ] Deactivation conditions: track lost >10s, IMPACT confirmed, manual override, duty cycle limit (120s max)
- [ ] Audit trail: every activation/deactivation logged to Supabase `jammer_events` table
- [ ] Unit tests: ≥15 tests covering all drone classes, both auth modes, deactivation triggers, duty cycle
- [ ] Safety test: simultaneous activation requests for multiple tracks — each gets independent jammer slot

---

### FR-W7-08: PhysicalInterceptCoordinator

**Priority**: P2 — Demo feature, full operational use post-W7

**User story**: As a site commander, I need the SkyNet net-gun to automatically pre-position and receive a fire timing command when a drone is in terminal phase so that physical intercept is possible without manual aiming.

**Acceptance criteria**:
- [ ] `PhysicalInterceptCoordinator` subscribes to TERMINAL phase events and MonteCarloPropagator output
- [ ] Selects intercept point: first trajectory waypoint within altitude 15–80m and range <200m
- [ ] Pre-position command issued at: t_intercept - 2500ms (motor slew margin)
- [ ] Fire command issued at: t_intercept - (range/35 × 1000)ms (net flight time)
- [ ] Net-gun pre-position command published to NATS: `sentinel.skynet.preposition`
- [ ] Net-gun fire command published to NATS: `sentinel.skynet.fire`
- [ ] Safety interlocks: alt > 5m, position uncertainty < 30m, no friendly within 50m
- [ ] Authorization required: policy defaults to `CONFIRM`, supports `FULL_AUTO`
- [ ] Unit tests: ≥15 tests covering intercept point selection, timing math, safety interlocks
- [ ] Simulation test: synthetic trajectory through engagement envelope → fire command within ±100ms of optimal

---

### FR-W7-09: TdoaSolver → SentinelPipeline Coordinate Injection

**Priority**: P1 — Removes hardcoded 51.5/4.9 coordinates (critical operational bug)

**User story**: As an operator deploying APEX-SENTINEL to any location, I need the system to use real node coordinates from the database instead of hardcoded lat/lng so that the system works outside the default test location (51.5°N, 4.9°E).

**Acceptance criteria**:
- [ ] All hardcoded `lat: 51.5, lng: 4.9` references replaced with dynamic node coordinate lookup
- [ ] Node coordinates sourced from: `hardware_nodes` Supabase table (new W7 table) at startup
- [ ] `TdoaSolver` constructor accepts `NodeRegistry` dependency (previously hardcoded)
- [ ] `SentinelPipeline` initializes TdoaSolver with NodeRegistry loaded from Supabase
- [ ] `NodeRegistry.getNode(nodeId)` returns `{ nodeId, lat, lng, alt, type }`
- [ ] Fallback: if Supabase unavailable, load from local `config/nodes.json`
- [ ] Config validation: pipeline refuses to start if <2 acoustic nodes registered
- [ ] Unit tests: ≥10 tests covering node registry load, TdoaSolver with dynamic coords, fallback to local config
- [ ] Regression test: existing W5/W6 TDOA tests updated to use NodeRegistry pattern (not hardcoded)

---

### FR-W7-10: Demo Dashboard

**Priority**: P1 — Required for Radisson meeting

**User story**: As Liviu presenting to the Radisson audience, I need a live web dashboard showing drone tracks, threat classification, terminal phase status, PTZ bearing, and jammer/SkyNet activation state so that non-technical stakeholders can understand the system capability in real time.

**Acceptance criteria**:
- [ ] Single-page web app (React + Tailwind) served from port 3001
- [ ] Live map component (Leaflet): shows acoustic nodes, drone tracks, Monte Carlo 95th pct ellipse
- [ ] Track table: drone class, confidence, speed, altitude, phase (CRUISE/ALERT/TERMINAL)
- [ ] Terminal phase panel: 4-indicator status lights (SPEED/COURSE/ALTITUDE/RF), FSM state badge
- [ ] PTZ panel: live bearing display, camera connection status, update rate (Hz)
- [ ] Jammer panel: active frequency, authorization mode, duty cycle bar
- [ ] SkyNet panel: pre-position status, intercept point (lat/lng), fire countdown timer
- [ ] WebSocket feed: server pushes all state updates via WS at 10Hz
- [ ] Mobile-responsive: readable on 10-inch tablet (demo hardware)
- [ ] Dark theme (military dispatch center aesthetic)
- [ ] Unit tests: ≥10 React component tests; WebSocket feed integration test

---

## 3. PRIORITY MATRIX

```
P0 (Ship-blocking — Wave cannot complete without):
  FR-W7-01  DatasetPipeline 16kHz migration
  FR-W7-02  AcousticProfileLibrary expansion (3 new profiles)
  FR-W7-03  TerminalPhaseDetector (4-indicator FSM)

P1 (Core value — Required for demo and operational use):
  FR-W7-04  ELRS 900MHz RF module
  FR-W7-05  BearingTriangulator
  FR-W7-06  PtzSlaveOutput (ONVIF)
  FR-W7-07  JammerActivation event channel
  FR-W7-09  TdoaSolver coordinate injection (remove hardcoded lat/lng)
  FR-W7-10  Demo dashboard

P2 (Valuable — Completes engagement loop, can slip to W8 if needed):
  FR-W7-08  PhysicalInterceptCoordinator (SkyNet)
```

---

## 4. SUCCESS METRICS

### 4.1 Technical Metrics

| Metric | W6 Baseline | W7 Target | Measurement |
|---|---|---|---|
| Test count | 629 | ≥ 830 (200+ new) | `npx vitest run` |
| Statement coverage | 95.66% | ≥ 90% (new code included) | `--coverage` |
| Branch coverage | 89.22% | ≥ 85% | `--coverage` |
| Function coverage | 97.19% | ≥ 90% | `--coverage` |
| TerminalPhaseDetector latency | N/A | < 800ms from ground truth | Simulation test |
| PTZ end-to-end latency | N/A | < 120ms | Integration test |
| BearingTriangulator accuracy | N/A | < 80m 1σ at 500m range | Simulation test |
| 16kHz migration: energy preservation | N/A | ±1 dB across 80–7800Hz | Unit test |

### 4.2 Operational Metrics (Radisson Demo)

| Scenario | Pass Criterion |
|---|---|
| Shahed-136 detection | Classification in <5s, confidence >0.8 |
| Shahed-238 (jet) detection | Classified as jet, NOT confused with piston |
| Terminal phase detection | FSM reaches TERMINAL within 10s of simulated dive |
| PTZ acquisition | Camera frames drone track within 3s of TERMINAL event |
| Jammer activation | Visual confirmation on dashboard within 1s of TERMINAL |
| SkyNet pre-position | Countdown timer visible, fire command issued at correct T |

### 4.3 Data Quality Metrics

| Metric | Target |
|---|---|
| False terminal rate (simulated cruise) | < 2% |
| Missed terminal rate (simulated dive) | < 5% |
| Gerbera vs Shahed-136 confusion | < 3% |
| Shahed-238 vs piston confusion | < 1% (spectral centroid discrimination) |

---

## 5. NON-FUNCTIONAL REQUIREMENTS

### 5.1 Latency Requirements

```
Component                    Requirement         Hard Limit
──────────────────────────────────────────────────────────
TerminalPhaseDetector        < 800ms             1000ms
PTZ bearing update           100Hz (10ms period) 8ms per command
Full PTZ latency (E2E)       < 120ms             150ms
Jammer activation            < 600ms from TERMINAL 1000ms
NATS message delivery        < 10ms              50ms
Dashboard WebSocket update   10Hz (100ms)        200ms
BearingReport ingestion      < 50ms per report   200ms
SkyNet pre-position command  < 2500ms from TERMINAL 5000ms
```

### 5.2 Reliability Requirements

```
Component                    Requirement
──────────────────────────────────────────────────────────
PtzSlaveOutput reconnect     Auto-reconnect within 5s of TCP drop
ELRS monitor                 Graceful degradation if hardware absent
DatasetPipeline              No data loss on 22050Hz→16kHz transition
JammerActivation             Deactivate within 200ms of track loss (fail-safe)
Demo dashboard               Zero visible errors during Radisson demo
```

### 5.3 Security Requirements

```
- PTZ camera credentials: stored in env vars only, never in code or Supabase
- Jammer activation: audit log (non-repudiation) for every activation event
- SkyNet fire commands: require authorization token in NATS message header
- BearingReport ingestion: API key authentication per mobile node
- Dashboard: read-only public view; command panel requires session auth
```

---

## 6. OUT OF SCOPE — W7

The following are explicitly deferred to W8 or later:

- Full INDIGO corpus retraining (W7 sets up pipeline; retraining is a separate GPU workload)
- Multi-camera PTZ orchestration (W7: single camera; W8: multi-camera sweep coordination)
- ELRS direction finding (W7: presence only; W8: direction via antenna array)
- SkyNet multi-drone engagement (W7: single track; W8: priority queue for simultaneous threats)
- Mobile app (Android/iOS) for BearingTriangulator nodes (W7: CLI + browser; W8: native app)
- GPS spoofing countermeasures for Shahed (W7: GPS jamming only; GPS spoof is W9)

---

## 7. STAKEHOLDER SIGN-OFF REQUIREMENTS

### Radisson Demo Checklist (Liviu)
- [ ] Dashboard live on tablet browser before demo
- [ ] PTZ camera physically connected and responding to ONVIF
- [ ] Jammer hardware present OR clear simulation mode indicator on dashboard
- [ ] At least 2 acoustic nodes registered in hardware_nodes table
- [ ] Pre-demo dry run completed with Cat and George 24h before

### INDIGO Technical Sign-off (Cat/George)
- [ ] 16kHz migration verified with INDIGO reference WAV file (Cat to provide)
- [ ] Shahed-238 profile frequency bounds reviewed and approved by Cat
- [ ] BearingTriangulator test with George's phone hardware passing
- [ ] ELRS monitor detected ELRS signal from test FPV in controlled environment

### Architecture Review (Nico)
- [ ] All 10 FRs have TDD-compliant test suites (describe blocks match FR-W7-XX naming)
- [ ] Wave-formation phases complete: init → plan → tdd-red → execute → checkpoint → complete
- [ ] Coverage gates: ≥80% branches/functions/lines/statements
- [ ] `npx vitest run --coverage` + `npx tsc --noEmit` both pass clean
