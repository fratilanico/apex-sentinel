# APEX-SENTINEL — Architecture Overview
## Post-W7 Complete | Hardware Integration + Data Pipeline Rectification + Terminal Phase Detection
### Date: 2026-03-25 | Version: 7.0.0 | Tests: 803/803 GREEN

---

## 1. SYSTEM DIAGRAM

```
╔══════════════════════════════════════════════════════════════════════════════════════════╗
║  LAYER 0 — EDGE SENSOR NODES                                                            ║
║                                                                                          ║
║  ┌────────────────────────┐  ┌─────────────────────────┐  ┌──────────────────────────┐ ║
║  │  Fixed Acoustic Node   │  │  Mobile Node             │  │  RF Monitor Node         │ ║
║  │  (RPi 4 — TFLite INT8) │  │  (Phone / Ruggedized)    │  │  (RTL-SDR 900MHz)        │ ║
║  │                        │  │                          │  │                          │ ║
║  │  USB mic 16kHz mono    │  │  16kHz + GPS + Compass   │  │  902–928 MHz scan        │ ║
║  │  AcousticPipeline      │  │  BearingReport emit       │  │  ELRS burst detect       │ ║
║  │  YAMNet ONNX INT8      │  │  CoordinateRegistry       │  │  ElrsFingerprint         │ ║
║  │  EdgeDeployer firmware │  │  EventPublisher           │  │  RssiBaseline 3σ         │ ║
║  └───────────┬────────────┘  └───────────┬─────────────┘  └────────────┬─────────────┘ ║
║              │ sentinel.detections.>     │ sentinel.bearing.>           │ sentinel.rf.> ║
╚══════════════╪═══════════════════════════╪═════════════════════════════╪════════════════╝
               │                           │                              │
               ▼                           ▼                              ▼
╔══════════════════════════════════════════════════════════════════════════════════════════╗
║  LAYER 1 — NATS JETSTREAM (Fortress VM / Gateway-01)                                    ║
║                                                                                          ║
║  W1-W6 Streams:              W7 New Streams:                                             ║
║  ┌──────────────────────┐    ┌───────────────────────┐  ┌──────────────────────────┐   ║
║  │ DETECTIONS R3 24h    │    │ TERMINAL_PHASE R3      │  │ SKYNET_ACTIVATION R5     │   ║
║  │ NODE_HEALTH R3 5min  │    │ JAMMER_COMMANDS R3     │  │ (highest replication —   │   ║
║  │ ALERTS R5 7 days     │    │ PTZ_BEARING R3 100Hz   │  │  intercept cmds critical)│   ║
║  │ COT_EVENTS R3 24h    │    │ BEARING_REPORTS R3     │  └──────────────────────────┘   ║
║  └──────────────────────┘    └───────────────────────┘                                   ║
╚══════════════════════════════════════════════════════════════════════════════════════════╝
               │
               ▼
╔══════════════════════════════════════════════════════════════════════════════════════════╗
║  LAYER 2 — SENTINEL PIPELINE (Fortress VM — systemd apex-sentinel-w7.service)           ║
║                                                                                          ║
║  ┌──────────────────────────────────────────────────────────────────────────────────┐   ║
║  │  SentinelPipelineV2 (FR-W7-09)                                                   │   ║
║  │  CoordinateRegistry: reads NODE_LAT/NODE_LON env + NATS NODE_HEALTH updates      │   ║
║  │  (replaces hardcoded 51.5/4.9 from W6)                                           │   ║
║  │                                                                                   │   ║
║  │  ┌─────────────────┐  ┌──────────────────────┐  ┌──────────────────────────┐   │   ║
║  │  │ MultiNodeFusion  │  │ EKF 6D Singer Q       │  │ MonteCarloPropagator    │   │   ║
║  │  │ IDW (W6)        │  │ MultiTrackEKFManager   │  │ 1000 samples 95th pctil │   │   ║
║  │  │ min 3 nodes     │  │ < 5ms/track (W5)       │  │ (W6)                    │   │   ║
║  │  └────────┬────────┘  └──────────┬─────────────┘  └────────────┬────────────┘   │   ║
║  │           │                      │                              │                │   ║
║  │  ┌────────▼──────────────────────▼──────────────────────────────▼────────────┐  │   ║
║  │  │  TdoaSolver (W1 + W7 CoordinateRegistry injection)                        │  │   ║
║  │  │  + BearingTriangulator WLS (W7) — GPS-jam-resilient positioning            │  │   ║
║  │  └──────────────────────────────────┬─────────────────────────────────────────┘  │   ║
║  │                                     │                                            │   ║
║  │  ┌──────────────────────────────────▼────────────────────────────────────────┐  │   ║
║  │  │  TerminalPhaseDetector (W7 — FR-W7-03)                                    │  │   ║
║  │  │  4-indicator compound FSM:                                                 │  │   ║
║  │  │    SPEED_INCREASE ∧ COURSE_COMMITMENT ∧ ALTITUDE_DESCENT ∧ RF_SILENCE    │  │   ║
║  │  │  5 states: CRUISE → SUSPECT → COMMIT → TERMINAL → IMPACT                  │  │   ║
║  │  │  Fires within 800ms of state transition                                    │  │   ║
║  │  │  Publishes: sentinel.terminal.{trackId}                                    │  │   ║
║  │  └──────────────────────────────────┬─────────────────────────────────────────┘  │   ║
║  └─────────────────────────────────────┼──────────────────────────────────────────--┘   ║
║                                        │                                                 ║
║  ┌─────────────────────────────────────▼─────────────────────────────────────────────┐  ║
║  │  HARDWARE EFFECTOR LAYER (W7 new)                                                  │  ║
║  │                                                                                    │  ║
║  │  ┌────────────────────┐  ┌──────────────────────┐  ┌─────────────────────────┐   │  ║
║  │  │  PtzSlaveOutput    │  │  JammerActivation    │  │  PhysInterceptCoord     │   │  ║
║  │  │  ONVIF Profile S   │  │  ELRS → 900MHz jam   │  │  SkyNet net-gun R5      │   │  ║
║  │  │  100Hz bearing     │  │  GPS → L1 1575MHz jam│  │  MonteCarlo 95th pctil  │   │  ║
║  │  │  500ms PTZ limit   │  │  async NATS cmd      │  │  NATS SKYNET_ACTIVATION │   │  ║
║  │  │  6-8ms lookahead   │  │  idempotency key     │  │  pre-position < 500ms   │   │  ║
║  │  └─────────┬──────────┘  └──────────┬───────────┘  └────────────┬────────────┘   │  ║
║  └────────────┼───────────────────────-┼──────────────────────────-┼────────────────┘  ║
╚═══════════════╪════════════════════════╪══════════════════════════-╪═══════════════════╝
                │                        │                           │
                ▼                        ▼                           ▼
╔══════════════════╗  ╔═════════════════════════╗  ╔═════════════════════════════════════╗
║  Dahua PTZ       ║  ║  RF Jammer Hardware      ║  ║  SkyNet Net-Gun Turret              ║
║  SD49425XB       ║  ║  ELRS 900MHz / GPS L1    ║  ║  NATS consumer                      ║
║  ONVIF/SOAP TCP  ║  ║  REST or serial ctrl     ║  ║  Motor slew + fire actuator          ║
╚══════════════════╝  ╚═════════════════════════╝  ╚═════════════════════════════════════╝

OUTPUT LAYER — runs alongside pipeline:
┌────────────────────────────────────────────────────────────────────────────────────┐
│  CursorOfTruth (W6) — Claude claude-sonnet-4-6 tactical reports + template fallback     │
│  BRAVE1Format (W6)  — NATO BRAVE1 JSON output, NATS CoT stream                    │
│  TelegramBot (W2)   — operator alerts                                              │
│  DemoDashboard (W7) — Next.js: live tracks, heatmap, terminal phase, jammer status│
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. MODULE INVENTORY

### acoustic/ (src/acoustic/)
| Module              | Wave | Purpose                                   | Tests           |
|---------------------|------|-------------------------------------------|-----------------|
| pipeline.ts         | W1   | 16kHz ring buffer, YAMNet frame splitting | FR-08-pipeline  |
| fft.ts              | W1   | FFT analysis, mel spectrogram             | FR-03-fft       |
| vad.ts              | W1   | Voice activity detection gate             | FR-02-vad       |
| yamnet.ts           | W1   | YAMNet surrogate (ONNX runtime wrapper)   | FR-04-yamnet    |

### ml/ (src/ml/)
| Module                    | Wave | Purpose                                              | Tests                        |
|---------------------------|------|------------------------------------------------------|------------------------------|
| acoustic-profile-library  | W6+W7| 7 drone profiles; turbine routing; 16kHz guard       | FR-W6-01, FR-W7-02           |
| dataset-pipeline          | W6+W7| 16kHz ingestion, OSINT, Wild Hornets, LUFS norm      | FR-W6-04, FR-W7-01           |
| false-positive-guard      | W6   | 3-gate: Doppler + confidence + temporal-linear       | FR-W6-03                     |
| yamnnet-finetuner         | W6   | YAMNet-512 ONNX FP32/INT8/FP16 export               | FR-W6-02                     |
| label-auditor             | W7   | Dataset label integrity audit (29 tests)             | FR-W7-15-label-audit         |

### detection/ (src/detection/)
| Module                    | Wave | Purpose                                              | Tests                        |
|---------------------------|------|------------------------------------------------------|------------------------------|
| terminal-phase-detector   | W7   | 4-indicator FSM: speed+course+alt+RF silence         | FR-W7-03                     |

### fusion/ (src/fusion/)
| Module                    | Wave | Purpose                                              | Tests                        |
|---------------------------|------|------------------------------------------------------|------------------------------|
| multi-node-fusion         | W6   | IDW acoustic fusion across ≥3 nodes                  | FR-W6-05                     |
| bearing-triangulator      | W7   | WLS bearing-line intersection (GPS-jam resilient)    | FR-W7-05                     |

### prediction/ (src/prediction/)
| Module                    | Wave | Purpose                                              | Tests                        |
|---------------------------|------|------------------------------------------------------|------------------------------|
| ekf.ts                    | W5   | Extended Kalman Filter 6D Singer Q model             | FR-W5-01-02-03               |
| multi-track-manager       | W5   | 1000 simultaneous EKF tracks < 5ms/track             | FR-W5-10-11                  |
| monte-carlo-propagator    | W6   | 1000-sample impact uncertainty, 95th percentile      | FR-W6-06                     |
| polynomial-predictor      | W5   | 5-horizon polynomial regression predictor            | FR-W5-04-05-09               |
| impact-estimator          | W5   | Time-to-impact from altitude+velocity state          | FR-W5-06                     |
| prediction-publisher      | W5   | NATS + Supabase publish (dual write)                 | FR-W5-07-08                  |

### rf/ (src/rf/)
| Module                    | Wave | Purpose                                              | Tests                        |
|---------------------------|------|------------------------------------------------------|------------------------------|
| rssi-baseline             | W1   | Rolling RSSI baseline, 3σ anomaly detection          | FR-rf-rssi-baseline          |
| elrs-fingerprint          | W7   | ELRS 900MHz FPV control link burst detection         | FR-W7-04                     |

### output/ (src/output/)
| Module                    | Wave | Purpose                                              | Tests                        |
|---------------------------|------|------------------------------------------------------|------------------------------|
| cursor-of-truth           | W6   | Claude tactical report + template fallback           | FR-W6-09                     |
| brave1-format             | W6   | NATO BRAVE1 JSON output                              | FR-W6-10                     |
| ptz-slave-output          | W7   | ONVIF PTZ control, 100Hz bearing, 500ms rate limit   | FR-W7-06                     |
| jammer-activation         | W7   | 900MHz ELRS + GPS L1 jammer async NATS command       | FR-W7-07                     |
| physical-intercept-coord  | W7   | SkyNet net-gun pre-position via NATS R5              | FR-W7-08                     |

### integration/ (src/integration/)
| Module                    | Wave | Purpose                                              | Tests                        |
|---------------------------|------|------------------------------------------------------|------------------------------|
| sentinel-pipeline.ts      | W6   | Event bus integration layer (W6 baseline)            | FR-W6-08, FR-W6-journey      |
| sentinel-pipeline-v2.ts   | W7   | CoordinateRegistry injection; no hardcoded coords    | FR-W7-09, FR-W7-journey-hw   |

### mobile/ (src/mobile/)
| Module                    | Wave | Purpose                                              | Tests                        |
|---------------------------|------|------------------------------------------------------|------------------------------|
| nats-client               | W3   | NATS reconnect FSM + exponential backoff             | FR-W3-05                     |
| battery-optimizer         | W3   | 4-mode FSM (FULL/BALANCED/POWER_SAVE/EMERGENCY)      | FR-W3-12                     |
| model-manager             | W3   | OTA ONNX fetch + SHA-256 verify                      | FR-W3-15                     |
| calibration               | W3   | Node acoustic calibration routine                    | FR-W3-11                     |
| event-publisher           | W3   | NATS event publish with circuit breaker wrap         | FR-W3-06                     |

### Other modules (alerts/, correlation/, dashboard/, deploy/, edge/, infra/, nats/, node/, privacy/, relay/, tracking/, ui/)
- See tests/\*/ for corresponding test coverage — all covered with FR-named describe blocks

---

## 3. DATA FLOW

```
AUDIO INPUT (16kHz, mono, USB mic on RPi4)
    │
    ▼ src/acoustic/pipeline.ts
    │  2s ring buffer, 0.5s hop
    │  AcousticPipeline.ingest()
    │
    ▼ src/acoustic/vad.ts
    │  Energy gate — suppress silence frames
    │
    ▼ src/acoustic/fft.ts
    │  512-point FFT, 128-mel spectrogram
    │  fmin=80Hz, fmax=7800Hz, 16kHz Nyquist safe
    │
    ▼ src/ml/acoustic-profile-library.ts
    │  YAMNet ONNX inference (1024-dim embedding per 0.96s frame)
    │  Profile routing: piston model (50-500Hz) or turbine model (3-8kHz)
    │  7 profiles: Shahed-136, Shahed-131, Shahed-238, Gerbera, Lancet-3, Orlan-10, Mavic Mini
    │  Output: { droneType, confidence, frequencyBand, harmonicPattern }
    │
    ▼ src/ml/false-positive-guard.ts
    │  Gate 1: confidence ≥ threshold (per-profile, BVA-tested)
    │  Gate 2: Doppler consistency (vehicle rejection)
    │  Gate 3: temporal-linear pattern (10s history buffer)
    │  Output: ClassificationEvent | null
    │
    │  NATS publish: sentinel.detections.{nodeId}
    │
    ▼ LAYER 1: NATS DETECTIONS stream (R3, 24h)
    │
    ▼ src/fusion/multi-node-fusion.ts
    │  IDW (Inverse Distance Weighting) across ≥3 nodes
    │  Node weight = 1/distance² to estimated source
    │  Output: FusedDetectionEvent { lat, lon, confidence, nodeCount }
    │
    ▼ src/tracking/tdoa.ts + src/fusion/bearing-triangulator.ts
    │  TdoaSolver: hyperbolic TDOA positioning (time-difference of arrival)
    │  BearingTriangulator: WLS bearing-line intersection (GPS-jam resilient)
    │  CoordinateRegistry: node positions from env vars + NATS NODE_HEALTH
    │  Output: PositionEstimate { lat, lon, uncertainty_m }
    │
    ▼ src/prediction/ekf.ts (6D Singer Q model)
    │  State: [lat, lon, alt, v_lat, v_lon, v_alt]
    │  Process noise: Singer Q (correlated acceleration model)
    │  Output: EkfState { x, P, innovation, mahalanobisDistance }
    │
    ▼ src/prediction/monte-carlo-propagator.ts
    │  1000 samples from EKF state distribution
    │  Physics: gravity + drag + wind perturbation
    │  Output: ImpactEstimate { lat, lon, radius_95th_pctile_m, timeToImpact_s }
    │
    ▼ src/detection/terminal-phase-detector.ts
    │  Compound FSM: CRUISE → SUSPECT → COMMIT → TERMINAL → IMPACT
    │  4-indicator compound condition:
    │    speed_increase: v ≥ cruise_baseline × 1.2
    │    course_commitment: bearing_variance < 5° over last 10s
    │    altitude_descent: d(alt)/dt < -2 m/s
    │    rf_silence: ELRS link missing ≥ 2s
    │  Fires < 800ms from state transition
    │  Publishes: sentinel.terminal.{trackId}
    │
    ├──────────────────────────────────────────────────┐
    │                                                   │
    ▼                                                   ▼
OUTPUT LAYER:                                  HARDWARE EFFECTOR LAYER:
    │                                                   │
    ├─ src/output/cursor-of-truth.ts             ├─ src/output/ptz-slave-output.ts
    │  Claude tactical report                    │  ONVIF bearing/elevation → PTZ camera
    │                                            │  6-8ms prediction lookahead
    ├─ src/output/brave1-format.ts               │
    │  NATO BRAVE1 JSON → NATS CoT stream        ├─ src/output/jammer-activation.ts
    │                                            │  900MHz ELRS jam + GPS L1 jam
    ├─ src/alerts/telegram-bot.ts               │  Async NATS command + idempotency key
    │  Operator Telegram alert                   │
    │                                            └─ src/output/physical-intercept-coordinator.ts
    └─ src/ui/demo-dashboard/api.ts                 SkyNet net-gun NATS R5 command
       Next.js dashboard API                        MonteCarlo 95th percentile targeting
       live tracks + heatmap + terminal phase
```

---

## 4. TEST COVERAGE PER LAYER

| Layer                   | Source modules | Test files | Approx tests | Notes                              |
|-------------------------|---------------|------------|-------------|------------------------------------|
| Edge/acoustic           | 4             | 4          | ~80         | VAD, FFT, YAMNet, pipeline         |
| ML/profile              | 5             | 7          | ~130        | Profile library, FPG, dataset, FT  |
| Detection               | 1             | 1          | ~25         | TerminalPhaseDetector FSM          |
| Fusion                  | 2             | 2          | ~35         | MultiNodeFusion + BearingTriang    |
| Prediction              | 6             | 6          | ~120        | EKF, manager, MC, predictor, pub   |
| RF                      | 2             | 2          | ~20         | RSSI baseline + ELRS fingerprint   |
| Output/effector         | 5             | 5          | ~75         | PTZ, Jammer, SkyNet, CoT, BRAVE1   |
| Integration/pipeline    | 2             | 4          | ~60         | SentinelPipeline + journey tests   |
| Mobile/infra            | 7             | 7          | ~115        | NATS, battery, model mgr, calib    |
| Dashboard/UI            | 6             | 5          | ~55         | TrackStore, AlertStore, UI, stats  |
| Privacy/alerts/relay    | 5             | 4          | ~55         | CoT, Telegram, relay, privacy      |
| Edge/node/NATS/correl   | 5             | 6          | ~65         | Node registry, streams, TDOA       |
| BVA (cross-cutting)     | —             | 1          | 20          | FR-W7-15-boundary-value-analysis   |
| **TOTAL**               | **~63**       | **56**     | **~803**    | 100% pass                          |

---

## 5. SQA TECHNIQUE MAP PER LAYER

| Layer                   | Primary SQA Technique        | Rationale                                                                 |
|-------------------------|------------------------------|---------------------------------------------------------------------------|
| AcousticProfileLibrary  | BVA + Oracle (pinned dataset)| Classification thresholds are boundary-dense; oracle needed for ML output |
| FalsePositiveGuard      | Mutation testing (Stryker)   | 3-gate decision logic; CRP mutants are the dominant fault class           |
| TerminalPhaseDetector   | MC/DC + Mutation             | 4-condition compound; SIL-2 equivalent; each sub-cond must toggle alone   |
| YAMNetFineTuner         | OO lifecycle + Chaos         | Model load/unload/promote lifecycle; fail-operational on load failure      |
| DatasetPipeline         | ECP + BVA                    | Sample rate EC (valid=16000, invalid=22050/44100/8000); duration BVA      |
| BearingTriangulator     | PBT (property-based)         | WLS geometric properties: commutativity, uncertainty monotonicity         |
| MultiNodeFusion         | Chaos injection              | Fault: node dropout during triangulation; CE-01 missing node              |
| SentinelPipeline        | Journey/BDD                  | End-to-end behavioral scenarios from operator perspective                 |
| MonteCarloPropagator    | Metamorphic testing          | MR: rotate input by 180° → impact point mirrors; SPL scale invariance     |
| EKF                     | Unit + property-based        | Kalman gain bounds, trace(P) monotone decrease, innovation whiteness       |
| NATS/infrastructure     | TIA (targeted selection)     | High-frequency change layer; TIA reduces CI feedback from 45min to ~2min  |
| Hardware effectors      | Integration + mock contract  | ONVIF/REST interfaces; mock contracts for PTZ, jammer, SkyNet             |

---

## 6. DEPLOYMENT TOPOLOGY

```
┌──────────────────────────────────────────────────────────────────────┐
│  FORTRESS VM (94.176.2.48 / Tailscale)                               │
│                                                                       │
│  systemd: apex-sentinel-w7.service                                   │
│  SentinelPipelineV2 + TerminalPhaseDetector + Hardware Effectors     │
│  NATS JetStream: 5-node Raft cluster                                 │
│  Supabase: bymfcnwfyxuivinuzurr (eu-west-2, London)                 │
│  DemoDashboard: Next.js on port 3000                                 │
└──────────────────────────────────────────────────────────────────────┘
         │ NATS TLS
         │ sentinel.detections.> (inbound from edge)
         │ sentinel.terminal.>, sentinel.jammer.>, sentinel.skynet.> (outbound to effectors)
         │
┌────────▼──────────────────────────────────────────────────────────────┐
│  GATEWAY-01 (10.13.37.1 — WireGuard)                                 │
│  Worker swarm / openclaw_tasks_v2 consumer                            │
└───────────────────────────────────────────────────────────────────────┘
         │ NATS publish over WireGuard
         │
┌────────▼──────────────────────────────────────────────────────────────┐
│  EDGE NODES (field deployment — 5-node mesh target for W8)            │
│  RPi 4 (INT8 ONNX) + Mobile phones + RTL-SDR RF monitors             │
│  NODE_LAT / NODE_LON env vars read by CoordinateRegistry              │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 7. KEY ARCHITECTURAL DECISIONS (post-W7)

| Decision                                    | Rationale                                                            | Wave |
|---------------------------------------------|----------------------------------------------------------------------|------|
| 16kHz as sole valid sample rate             | INDIGO corpus + YAMNet native spec; EC3 guard enforced at API level  | W7   |
| Turbine routing path (Shahed-238)           | Turbine 3-8kHz cannot share piston 50-500Hz mel bin space           | W7   |
| TerminalPhaseDetector fires within 800ms    | 4-12s window between terminal phase transition and impact            | W7   |
| SKYNET_ACTIVATION R5 (5 replicas)           | Intercept commands must not be lost; highest criticality stream      | W7   |
| CoordinateRegistry replaces hardcoded 51.5/4.9 | Hardcoded coords produced wrong threat vectors in field          | W7   |
| WLS BearingTriangulator alongside TdoaSolver | Resilience: GPS jamming degrades TDoA; bearing lines still work     | W7   |
| DemoDashboard as W7 deliverable             | INDIGO Radisson meeting needs running demo, not just API             | W7   |
| Learning-safety decoupling (not yet tested) | YAMNetFineTuner must not push weights to live inference path         | W8   |
