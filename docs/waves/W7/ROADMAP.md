# APEX-SENTINEL W7–W10 Roadmap

> Wave: W7 — Hardware Integration Layer + Data Pipeline Rectification + Terminal Phase Detection
> Last updated: 2026-03-25
> Status: PLANNING
> Roadmap horizon: W7 (2026-03) → W10 (2026-09)

---

## 1. Executive Summary

APEX-SENTINEL transitions in W7 from software-complete prototype to hardware-integrated field system. The W1–W6 foundation (629 tests, 95.66% coverage, BRAVE1 output, edge deployment) is proven in simulation. W7 closes the gap between simulation and real-world deployment by integrating physical sensors, correcting the 16kHz data breach, and adding terminal phase detection that enables kinetic response.

W8 achieves field trial readiness with multi-node mesh deployment and simultaneous multi-threat tracking. W9 matures the ML models on real field data. W10 integrates with NATO systems and expands to multi-country node registry.

---

## 2. Wave Summary Table

| Wave | Theme | Target Date | Tests (cumulative) | FDRP Score Target |
|---|---|---|---|---|
| W6 | Acoustic Intelligence + Edge Deploy | 2026-03-25 | 629 | 0.71 |
| **W7** | **Hardware Integration + Data Fix + Terminal Phase** | **2026-04-15** | **750+** | **0.79** |
| W8 | Field Trial Readiness | 2026-06-01 | 900+ | 0.85 |
| W9 | Model Maturation + OTA | 2026-07-15 | 1000+ | 0.90 |
| W10 | NATO Integration | 2026-09-30 | 1100+ | 0.94 |

---

## 3. Wave 7 — Hardware Integration Layer (2026-04-15)

### 3.1 Theme

W7 is the integration wave. It connects the acoustic intelligence stack to physical hardware: ELRS RF receivers, ONVIF PTZ cameras, jammer hardware, SkyNet intercept units. It fixes the 22050Hz → 16kHz data breach and adds TerminalPhaseDetector for kinetic response timing.

### 3.2 Milestone Gates

**Gate W7-G1: 16kHz Migration Verified (2026-03-31)**
- All 629 W1–W6 tests still passing after sampleRate change
- Spectrogram unit tests verify 16kHz output: fMax = 8000 Hz (Nyquist), nFFT = 1024
- New YAMNet ONNX model exported at 16kHz and validated on 20 held-out Wild Hornets samples
- CI/CD pipeline enforces `sampleRate === 16000` via ESLint custom rule

**Gate W7-G2: New Acoustic Profiles Integrated (2026-04-05)**
- AcousticProfileLibrary contains Gerbera, Shahed-131, Shahed-238 profiles
- matchFrequency() returns Shahed-238 for queries in 3000–8000 Hz range
- Turbine branch routing verified: spectral centroid > 2000 Hz triggers turbine path
- FDRP tactical accuracy target: Shahed-238 recall ≥ 0.80 in simulation

**Gate W7-G3: Terminal Phase Detector FSM Complete (2026-04-08)**
- 4-indicator FSM implemented with all state transitions
- Each indicator independently unit tested (15 test cases minimum)
- All-4-combined scenario produces confidence ≥ 0.90
- Single indicator never reaches TERMINAL_CONFIRMED state

**Gate W7-G4: Hardware Interface Modules Complete (2026-04-12)**
- ELRS RF module: burst detection, silence detection, FHSS classifier loaded
- PtzSlaveOutput: ONVIF XML formation verified in tests, 100Hz publish rate confirmed
- JammerActivation: channel selection correct by drone class, auth token gate working
- BearingTriangulator: least-squares intersection correct for 3-node and 4-node cases

**Gate W7-G5: TdoaSolver Coordinate Injection (2026-04-13)**
- SentinelPipeline no longer references hardcoded 51.5/4.9 coordinates
- Node registry provides real observer coordinates (coarsened ±50m)
- TdoaSolver unit tests use parameterized coordinates, no literals

**Gate W7-G6: Demo Dashboard Live (2026-04-14)**
- React/Next.js dashboard renders live tracks from NATS subscription
- Heatmap updates on new detection events
- Alert log shows last 50 events with classification + confidence
- Demo mode anonymizes data for Radisson presentation

**Gate W7-W7-COMPLETE: CI GREEN (2026-04-15)**
- `npx vitest run --coverage` → 750+ tests passing, ≥80% coverage all metrics
- `npx tsc --noEmit` → 0 errors
- `npm run build` → no build errors
- Wave pushed to origin/main

### 3.3 FR Delivery Schedule

| FR | Module | Delivery Date | Owner |
|---|---|---|---|
| FR-W7-01 | DatasetPipeline 16kHz | 2026-03-31 | Core |
| FR-W7-02 | AcousticProfileLibrary expansion | 2026-04-05 | ML |
| FR-W7-03 | TerminalPhaseDetector | 2026-04-08 | Fusion |
| FR-W7-04 | ELRS RF Module | 2026-04-09 | Hardware |
| FR-W7-05 | BearingTriangulator | 2026-04-10 | Fusion |
| FR-W7-06 | PtzSlaveOutput | 2026-04-11 | Hardware |
| FR-W7-07 | JammerActivation | 2026-04-12 | Hardware |
| FR-W7-08 | PhysicalInterceptCoordinator | 2026-04-12 | Fusion |
| FR-W7-09 | TdoaSolver coordinate injection | 2026-04-13 | Core |
| FR-W7-10 | Demo Dashboard | 2026-04-14 | Frontend |

### 3.4 FDRP Score Targets — W7

FDRP (Field Deployment Readiness Protocol) scoring:

| Category | W6 Score | W7 Target | Delta |
|---|---|---|---|
| Acoustic detection accuracy | 0.82 | 0.85 | +0.03 |
| New threat profiles (Gerbera/Shahed-131/238) | N/A | 0.80 | new |
| Terminal phase detection | N/A | 0.88 | new |
| RF link monitoring | N/A | 0.75 | new |
| Hardware integration | 0.0 | 0.70 | new |
| Data pipeline correctness | 0.45 (22050Hz wrong) | 0.95 | +0.50 |
| **Overall FDRP** | **0.71** | **0.79** | **+0.08** |

### 3.5 INDIGO Partnership Milestones — W7

| Milestone | Description | Date |
|---|---|---|
| 16kHz alignment confirmed | Send INDIGO sample output at 16kHz for validation | 2026-04-01 |
| Wild Hornets dataset access | Receive 3000+ recordings from INDIGO via secure transfer | 2026-04-03 |
| Shahed-238 profile validation | INDIGO reviews and signs off turbine profile parameters | 2026-04-07 |
| Model benchmark exchange | Share W7 DroneNet-13 F1 scores with INDIGO for comparison | 2026-04-15 |

### 3.6 Risks in W7

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Wild Hornets dataset delayed by INDIGO | Medium | High | Fallback: OSINT YouTube recordings + synthetic augmentation |
| Shahed-238 recall below 0.80 (insufficient training data) | High | Medium | Accept lower recall for W7, target maturation in W9 |
| ONVIF PTZ camera protocol incompatibility | Low | Low | Test against 3 ONVIF reference implementations |
| ELRS burst pattern changes (firmware update) | Low | Medium | Retrain FHSS classifier on new captures |
| Jammer hardware serial port driver OS incompatibility | Medium | Low | Abstract behind SerialPort mock for CI, test on real HW separately |

---

## 4. Wave 8 — Field Trial Readiness (2026-06-01)

### 4.1 Theme

W8 moves APEX-SENTINEL from integration testing to operational readiness. The system must handle real field conditions: hardware calibration drift, multi-threat simultaneous tracking, 5-node mesh stability over 72-hour continuous operation.

### 4.2 Key Deliverables

**FR-W8-01: Hardware Calibration Protocol**
- Automated calibration routine for each hardware component (microphone, RF receiver, GPS)
- Microphone: frequency response calibration using reference tone sweep (1kHz reference)
- GPS: baseline drift measurement and SBAS correction verification
- RF receiver: noise floor characterization per deployment site
- Calibration results persisted to Supabase `calibration_records` table

**FR-W8-02: 5-Node Mesh Stability**
- NATS JetStream mesh tested with 5 physical nodes
- Network partition tolerance: system continues with 3/5 nodes active
- Node re-join without data loss (persistent consumer offset resume)
- Heartbeat monitoring: node declared DEAD after 10s without heartbeat

**FR-W8-03: Simultaneous Multi-Threat Tracking**
- Track management for up to 10 simultaneous threats
- Track ID assignment and maintenance through occlusion (drone behind building)
- Track merge/split logic (two drones converging → diverging)
- Priority queue: TERMINAL_CONFIRMED threats get preferential countermeasure resources

**FR-W8-04: Environmental Filtering Improvement**
- Wind noise rejection: adaptive high-pass filter at deployment site wind speed
- Rain noise: spectral subtraction calibrated to local rain noise profile
- Temperature correction: acoustic speed of sound correction at local temperature
- Night mode: lower detection threshold acceptable due to reduced false positive rate

**FR-W8-05: After-Action Report Generator**
- Per-incident PDF report generation: timeline, track plot, classification confidence, countermeasures activated
- Report signed with operator credentials for chain-of-custody
- Required for Law 59/2019 incident reporting to STS

**FR-W8-06: OTA Update Framework**
- APEX-SENTINEL nodes check for model updates from secure model registry
- ONNX model push with rollback on performance regression
- Configuration push (threshold updates, profile additions) without node restart

### 4.3 Field Trial Readiness Gate

Field trial is authorized when ALL conditions met:
- [ ] 72-hour continuous operation without unplanned restart on 3-node mesh
- [ ] ≤ 2 false positives per hour in Romanian urban noise environment (measured in simulation)
- [ ] Shahed-136 detection at 1.5km range confirmed (acoustic simulation at -10dB SNR)
- [ ] TerminalPhaseDetector latency: < 500ms from all-4-indicators-true to event emit
- [ ] Jammer activation authorization token workflow end-to-end tested
- [ ] After-action report generates successfully on test incident

### 4.4 FDRP Score Targets — W8

| Category | W7 Target | W8 Target | Delta |
|---|---|---|---|
| Acoustic detection accuracy | 0.85 | 0.88 | +0.03 |
| Multi-threat tracking | 0.50 | 0.82 | +0.32 |
| Hardware calibration | N/A | 0.85 | new |
| Mesh stability (5-node) | 0.70 | 0.90 | +0.20 |
| Environmental robustness | 0.60 | 0.80 | +0.20 |
| **Overall FDRP** | **0.79** | **0.85** | **+0.06** |

### 4.5 INDIGO Partnership Milestones — W8

| Milestone | Description | Date |
|---|---|---|
| Field trial coordination | Define Romanian trial site with INDIGO team | 2026-05-01 |
| Hardware complement handoff | Exchange node hardware specs for interoperability | 2026-05-10 |
| Joint calibration protocol | Agree on shared calibration reference tones and procedures | 2026-05-20 |
| Trial date confirmed | Confirm joint field trial date and location | 2026-05-25 |

---

## 5. Wave 9 — Model Maturation + OTA (2026-07-15)

### 5.1 Theme

W9 takes the W7 base model and retrains it on real field data collected during W8 trials. This is the model maturation wave. The INDIGO partnership provides battlefield recordings that are inaccessible through any open-source channel.

### 5.2 Key Deliverables

**FR-W9-01: Production Fine-tune on Field Data**
- Retrain DroneNet-13 on W8 field recordings (expected 500–1,500 new labeled samples)
- Combine with Wild Hornets base dataset (weighted: 70% Wild Hornets, 30% field data)
- Target: macro F1 ≥ 0.91, threat class recall ≥ 0.88

**FR-W9-02: OTA Model Push**
- Production use of W8 OTA update framework
- DroneNet-14 (matured from W7's -13) pushed to all field nodes
- A/B test: 20% of nodes on new model, 80% on W8 model — compare live false positive rate
- Auto-rollback if new model's FPR > old model's FPR by ≥ 0.02

**FR-W9-03: Continuous Learning Pipeline**
- Operator-confirmed detections automatically flagged as high-quality training samples
- Rejected detections (false positives confirmed by operator) added to FP training pool
- Weekly retraining cycle: new samples → augment → fine-tune → evaluate → push if better

**FR-W9-04: Shahed-238 Recall Improvement**
- W7 Shahed-238 recall is expected to be ≤ 0.80 due to training data scarcity
- W9 targets ≥ 0.87 recall using field recordings of real turbine drones
- If insufficient real samples: synthetic turbine audio generation from physical simulation

**FR-W9-05: AcousticProfileLibrary v2**
- Expand to 18+ classes based on W8 field encounters
- BRAVE1 data partnership activation: receive profile data from partner nations
- New profiles anticipated: Mohajer-6, Orlan-10, Lancet-3 sub-variants

### 5.3 BRAVE1 Data Partnership Activation Criteria

BRAVE1 (Ukrainian Defense Industry Hub) data partnership is activated when:

1. APEX-SENTINEL achieves FDRP ≥ 0.85 (W8 target)
2. INDIGO AirGuard cross-compatibility verified (bearing report format alignment)
3. Romanian MoD signs data sharing MoU with BRAVE1 counterpart
4. APEX-SENTINEL passes BRAVE1 format audit (output verified against BRAVE1 schema v2.1)
5. Secure transfer channel established (mutual TLS, BRAVE1-approved cipher suite)

Expected activation date: 2026-07-01 (aligned with W9 start).

### 5.4 FDRP Score Targets — W9

| Category | W8 Target | W9 Target | Delta |
|---|---|---|---|
| Acoustic detection accuracy | 0.88 | 0.91 | +0.03 |
| Shahed-238 recall | 0.80 | 0.87 | +0.07 |
| Model freshness (field data %) | 0% | 30% | new |
| Continuous learning pipeline | N/A | 0.80 | new |
| BRAVE1 data quality | N/A | 0.85 | new |
| **Overall FDRP** | **0.85** | **0.90** | **+0.05** |

---

## 6. Wave 10 — NATO Integration (2026-09-30)

### 6.1 Theme

W10 elevates APEX-SENTINEL from a national system to a NATO-compatible C-UAS platform. The key integration is ATAK (Android Team Awareness Kit) via CoT (Cursor on Target) relay, enabling any ATAK-equipped unit to receive APEX-SENTINEL threat tracks.

### 6.2 Key Deliverables

**FR-W10-01: ATAK CoT Relay**
- APEX-SENTINEL threat tracks → CoT XML → ATAK via TAK Server (FreeTAKServer or official TAK Server)
- CoT event type: `a-h-A-M-F-Q` (hostile air, unmanned fixed-wing)
- CoT UID format: `APEX-SENTINEL-{threatId}`
- Update rate: 2 Hz for CRUISE state, 10 Hz for TERMINAL_CONFIRMED
- TAK Server authentication: certificate-based mutual TLS

**FR-W10-02: Multi-Country Node Registry**
- Supabase node registry expanded to multi-tenant
- Each country/organization gets isolated tenant namespace
- Cross-tenant sharing: opt-in, per-threat, with bilateral consent
- Node registry API: authenticated with JWT (sub = org_id)

**FR-W10-03: STANAG 4586 Interface (UAS C2)**
- STANAG 4586 is the NATO standard for UAS C2 interoperability
- W10 implements STANAG 4586 Part 2: VSM (Vehicle Specific Module) interface for intercept coordination
- PhysicalInterceptCoordinator output translated to STANAG 4586 launch authorization format

**FR-W10-04: Intelligence Report Export**
- After-action reports formatted for NATO INTREP (Intelligence Report) format
- STANAG 2022 complaint serialization
- Classified header support (NATO marking: NATO RESTRICTED / NATO CONFIDENTIAL)

**FR-W10-05: Multi-Country Calibration Registry**
- Acoustic profiles calibrated to specific geographic/urban environments
- Partner nation profile contributions via BRAVE1 data pipeline
- Profile version registry: each profile has version, source, validation status
- Rollback: revert to previous profile version if new version degrades performance

### 6.3 NATO Integration Dependencies

| Dependency | Owner | Required By |
|---|---|---|
| TAK Server instance (NATO) | Operator | FR-W10-01 |
| STANAG 4586 reference implementation | NATO NCSA | FR-W10-03 |
| NATO PKI certificates | NATO NCIA | FR-W10-01, FR-W10-04 |
| BRAVE1 profile data pipeline auth | BRAVE1 | FR-W10-05 |
| Partner nation bilateral data MoU | Romanian MoD | FR-W10-02 |

### 6.4 FDRP Score Targets — W10

| Category | W9 Target | W10 Target | Delta |
|---|---|---|---|
| Acoustic detection accuracy | 0.91 | 0.92 | +0.01 |
| NATO interoperability (CoT/STANAG) | N/A | 0.88 | new |
| Multi-country node registry | N/A | 0.85 | new |
| Intelligence report quality | 0.80 | 0.90 | +0.10 |
| Overall system reliability (MTBF) | 72h | 720h | ×10 |
| **Overall FDRP** | **0.90** | **0.94** | **+0.04** |

---

## 7. Cross-Wave Dependency Graph

```
W6 (COMPLETE — 2026-03-25)
│   Outputs: YAMNet ONNX (22050Hz), EdgeDeployer, BRAVE1Format, CursorOfTruth
│
W7 (2026-04-15)
│   Depends on: W6 ONNX model → retrain at 16kHz
│   Depends on: INDIGO Wild Hornets dataset (external)
│   Outputs: DroneNet-13 (16kHz), TerminalPhaseDetector, ELRS RF Module,
│            BearingTriangulator, PtzSlaveOutput, JammerActivation,
│            PhysicalInterceptCoordinator, Demo Dashboard
│
W8 (2026-06-01)
│   Depends on: W7 hardware modules (integration tested)
│   Depends on: Physical hardware (5 RPi4/Jetson nodes, ELRS receiver, PTZ camera)
│   Outputs: Calibration Protocol, Field Trial data, OTA Framework, AAR Generator
│
W9 (2026-07-15)
│   Depends on: W8 field recordings (training data)
│   Depends on: BRAVE1 data partnership (activation criteria met in W8)
│   Outputs: DroneNet-14 (field-trained), Continuous Learning Pipeline, AcousticProfileLibrary v2
│
W10 (2026-09-30)
    Depends on: W9 model maturity (FDRP ≥ 0.90)
    Depends on: NATO PKI, TAK Server access, STANAG 4586 reference implementation
    Outputs: ATAK CoT Relay, Multi-Country Registry, STANAG 4586 interface, INTREP export
```

---

## 8. Test Count Trajectory

| Wave | New Tests | Cumulative | Coverage Target |
|---|---|---|---|
| W1–W6 | — | 629 | 95.66% stmt |
| W7 | 121+ | 750+ | ≥80% all metrics |
| W8 | 150+ | 900+ | ≥82% all metrics |
| W9 | 100+ | 1000+ | ≥83% all metrics |
| W10 | 100+ | 1100+ | ≥84% all metrics |

---

## 9. Infrastructure Scaling Plan

| Wave | Nodes | NATS Config | Supabase Plan |
|---|---|---|---|
| W7 | 1–3 (simulation) | Single JetStream | Pro |
| W8 | 5 (field trial) | 3-node NATS cluster | Pro + pgBouncer |
| W9 | 10 (expanded trial) | 5-node NATS cluster | Pro + read replica |
| W10 | 50+ (NATO integration) | Regional NATS clusters | Enterprise |

---

## 10. Key Dates Summary

```
2026-03-25  W6 COMPLETE — pushed to origin/main
2026-03-31  W7 Gate G1 — 16kHz migration verified
2026-04-05  W7 Gate G2 — new profiles integrated
2026-04-08  W7 Gate G3 — TerminalPhaseDetector FSM complete
2026-04-12  W7 Gate G4 — all hardware modules complete
2026-04-13  W7 Gate G5 — TdoaSolver injection complete
2026-04-14  W7 Gate G6 — demo dashboard live
2026-04-15  W7 COMPLETE — CI green, pushed to origin/main
2026-04-15  Radisson demo meeting — dashboard demo
2026-05-01  W8 init — field trial planning begins
2026-05-25  Field trial date confirmed with INDIGO
2026-06-01  W8 COMPLETE — field trial readiness certified
2026-07-01  BRAVE1 data partnership activation (if W8 FDRP ≥ 0.85)
2026-07-15  W9 COMPLETE — DroneNet-14 deployed to field nodes
2026-09-01  W10 init — NATO integration begins
2026-09-30  W10 COMPLETE — ATAK CoT relay live, STANAG 4586 interface live
```

---

*End of ROADMAP.md — W7*
