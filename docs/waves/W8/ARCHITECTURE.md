# APEX-SENTINEL W8 — Architecture Document

> Wave: W8 | Theme: Field Trial Readiness + Operator UX
> Status: PLANNING | Date: 2026-03-26

---

## System Architecture Overview (Post-W8)

```
┌──────────────────────────────────────────────────────────────────────┐
│                        OPERATOR LAYER (W8 NEW)                       │
│  ┌─────────────────────┐   ┌────────────────────────────────────┐    │
│  │  Mobile App (Expo)  │   │   Dashboard (Next.js 14 + Leaflet) │    │
│  │  - Calibration      │   │   - Live track map                 │    │
│  │  - Detection view   │   │   - Alert log                      │    │
│  │  - Node health      │   │   - PTZ bearing control            │    │
│  └──────────┬──────────┘   └─────────────────┬──────────────────┘    │
└─────────────┼───────────────────────────────┼────────────────────────┘
              │ NATS                          │ HTTP SSE
              ▼                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        GATEWAY LAYER (fortress)                      │
│  ┌──────────────────┐   ┌──────────────────┐   ┌─────────────────┐  │
│  │  Dashboard API   │   │  CotRelay (ATAK) │   │  TelegramBot   │  │
│  │  (Node HTTP)     │   │  CoT XML output  │   │  alert push    │  │
│  └──────────────────┘   └──────────────────┘   └─────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  NATS JetStream Backbone  (mTLS, 5-node Raft, KV for OTA)   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└────────────────────────┬─────────────────────────────────────────────┘
                         │
     ┌───────────────────┼───────────────────┐
     ▼                   ▼                   ▼
┌────────────┐    ┌────────────┐    ┌────────────┐
│  Node A    │    │  Node B    │    │  Node C    │
│  RPi4/     │    │  Jetson    │    │  RPi4/     │
│  Jetson    │    │  Nano      │    │  Jetson    │
│            │    │            │    │            │
│  AudioCap  │    │  AudioCap  │    │  AudioCap  │
│  16kHz ✓   │    │  16kHz ✓   │    │  16kHz OTA │
│  YAMNet    │    │  YAMNet    │    │  YAMNet    │
│  480KB     │    │  480KB     │    │  480KB     │
└──────┬─────┘    └──────┬─────┘    └──────┬─────┘
       │                 │                 │
       └─────────TDoA NATS events──────────┘
                         │
            ┌────────────▼─────────────┐
            │  SentinelPipelineV2      │
            │  TDoA → EKF → Terminal   │
            │  BearingTriangulator     │
            │  MultiNodeFusion         │
            │  FalsePositiveGuard      │
            └────────────┬─────────────┘
                         │
            ┌────────────▼─────────────┐
            │  OUTPUT LAYER (W7)       │
            │  PTZ slave  (ONVIF)      │
            │  JammerActivation        │
            │  PhysicalIntercept       │
            │  BRAVE1 format           │
            └──────────────────────────┘
```

---

## W8 Architecture Changes

### 1. OTA Controller Layer

```
NATS KV "firmware" store
  - firmware:latest        → { version, sha256, url, minNodes }
  - firmware:node/<id>     → { currentVersion, status, lastUpdate }

OtaController (W8-08):
  - Polls KV manifest on boot + every 60s
  - Downloads package if version mismatch
  - Verifies SHA-256 signature
  - Applies update via node-specific mechanism (RPi: systemd, Jetson: OTA bundle)
  - Runs HealthCheck: audio capture test + YAMNet inference test
  - On failure: reverts to previous version, publishes firmware:node/<id>.status=rollback
```

### 2. Recall Oracle Gate Layer

```
DatasetPipeline (W8-01):
  1. Load BRAVE1-v2.3-16khz pinned corpus (50+ recordings per profile)
  2. Run AcousticProfileLibrary.classify() on each recording
  3. Compute per-profile precision, recall, F1
  4. Assert gates:
     - shahed_136:  recall ≥ 0.87, precision ≥ 0.85
     - shahed_131:  recall ≥ 0.85, precision ≥ 0.83
     - shahed_238:  recall ≥ 0.95, precision ≥ 0.90  (turbine — critical)
     - gerbera:     recall ≥ 0.92, precision ≥ 0.88
     - quad_rotor:  recall ≥ 0.88, precision ≥ 0.86
  5. Block npm run export-model if any gate fails
  6. Emit per-profile metrics to Supabase metrics table
```

### 3. Learning-Safety IEC 61508 Promotion Gate

```
YAMNetFineTuner (W8-10 addition):
  - train()       — unchanged; mutates internal weight buffer only
  - promoteModel(metrics: EvalMetrics): PromotionResult
      1. Validates metrics against thresholds (same as oracle gates)
      2. If pass: atomically swaps weight buffer into AcousticProfileLibrary
      3. If fail: returns { promoted: false, reason, gap }
      4. Logs PROMOTION_AUDIT event to Supabase with operator ID
  - getPromotionStatus(): PromotionStatus

AcousticProfileLibrary (W8-10 addition):
  - setActiveModel(handle: ModelHandle): void
      Replaces active classifier — callable only via promoteModel() handle
      Direct mutation throws SAFETY_GATE_VIOLATION error
```

### 4. Multi-Threat Track Architecture (W8-07)

```
TrackManager (existing, enhanced):
  Current: simple Map<trackId, TrackState>
  W8 change:
    - Add TDoA deconfliction: if two TDoA solves yield positions <50m apart,
      assign new track ID only if acoustic signature differs (cosine distance >0.3)
    - Track collision detection: alert if two tracks converge to <10m separation
      (possible coordinated attack)
    - Track eviction: remove tracks stale >30s (no new TDoA events)
    - Capacity: ≥8 concurrent tracks without lock contention
```

### 5. Dashboard Frontend Architecture (W8-06)

```
Next.js 14 App Router:
  app/
    layout.tsx          — JWT auth check, NATS SSE init
    page.tsx            — Dashboard shell (3-panel)
    api/
      tracks/route.ts   — SSE stream from NATS
      alerts/route.ts   — Alert log HTTP GET
      ptz/route.ts      — PTZ bearing POST → NATS publish

Components:
  MapPanel.tsx          — Leaflet 2D + leaflet-heat heatmap
  TrackList.tsx         — Sorted by severity, clickable
  AlertLog.tsx          — Scrollable, auto-scroll to latest
  BearingControl.tsx    — Slider + bearing indicator
```

### 6. Mobile App Architecture (W8-05)

```
React Native (Expo 51 Managed):
  app/
    (tabs)/
      index.tsx         — Detection live view
      calibrate.tsx     — Node calibration wizard
      health.tsx        — Node health dashboard
  services/
    natsClient.ts       — Wraps NatsClientFSM TypeScript module
    calibration.ts      — Wraps CalibrationStateMachine
    battery.ts          — Wraps BatteryOptimizer

NativeModules:
  ApexAudio.mm/.kt      — Audio capture → NATS stream (16kHz PCM)
  (Only native module; all logic in TypeScript)
```

---

## Data Flow: Detection Event (End-to-End W8)

```
Field Node                Gateway (fortress)         Operator
──────────────────────────────────────────────────────────────
1. AudioCapture(16kHz)
2. YAMNet.infer()
3. NATS publish acoustic.event
                          4. SentinelPipelineV2
                             TdoaSolver.solve()
                             EKF.predict()
                             TerminalPhase.check()
                          5. TrackManager.update()
                          6. Dashboard API SSE emit
                          7. CotRelay.publish()
                          8. TelegramBot.alert()
                                                     9. Map updates (<1s)
                                                     10. Operator PTZ cmd
                          11. PTZ ONVIF command
                          12. PTZ ACK (<2s)
```

---

## Dependency Map

```
W8-01 (recall oracle)     ← BRAVE1 dataset (external download, pin before W8)
W8-02 (simpson paradox)   ← W8-01 gates
W8-03 (PTZ integration)   ← onvif-simulator npm
W8-04 (ELRS field)        ← RTL-SDR hardware (field team)
W8-05 (mobile UI)         ← existing mobile/*.ts, Expo 51
W8-06 (dashboard UI)      ← existing dashboard/api.ts, Next.js 14
W8-07 (multi-threat)      ← TrackManager (existing)
W8-08 (OTA)               ← NATS JetStream KV (existing)
W8-09 (wild hornets)      ← Wild Hornets dataset (external download)
W8-10 (learning safety)   ← YAMNetFineTuner, AcousticProfileLibrary
W8-11 (chaos)             ← NATS partition API
W8-12 (stryker)           ← stryker.config.json (exists)
```
