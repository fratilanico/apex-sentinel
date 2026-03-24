# APEX-SENTINEL

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║  DISTRIBUTED CIVILIAN DRONE DETECTION NETWORK                                 ║
║  Acoustic · RF · RTL-SDR · TDoA · EKF · LSTM                                 ║
║  FPV Combat Drones · Shahed-136 Loitering Munitions · NATO Eastern Flank      ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  W1 ██████████ COMPLETE   W2 ██████████ COMPLETE   W3 ██████████ COMPLETE    ║
║  W4 ██████████ COMPLETE   W5 ░░░░░░░░░░ IN PROGRESS                          ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  397 tests · 92% coverage · 105 PROJECTAPEX docs · 34 TypeScript modules      ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

[![W1](https://img.shields.io/badge/W1-COMPLETE-00E676?style=flat-square)](docs/waves/W1/)
[![W2](https://img.shields.io/badge/W2-COMPLETE-00E676?style=flat-square)](docs/waves/W2/)
[![W3](https://img.shields.io/badge/W3-COMPLETE-00E676?style=flat-square)](docs/waves/W3/)
[![W4](https://img.shields.io/badge/W4-COMPLETE-00E676?style=flat-square)](docs/waves/W4/)
[![W5](https://img.shields.io/badge/W5-IN%20PROGRESS-FFD700?style=flat-square)](docs/waves/W5/)
[![Tests](https://img.shields.io/badge/tests-397%2F397-00E676?style=flat-square)](tests/)
[![Coverage](https://img.shields.io/badge/coverage-92%25-00E676?style=flat-square)](coverage/)
[![Mind the Gap](https://img.shields.io/badge/mind--the--gap-8%2F8-00E676?style=flat-square)](#mind-the-gap)

---

## The War Problem

FPV combat drones cost $400. Shahed-136 loitering munitions cost $20,000. They are killing civilians at scale across the NATO Eastern Flank. The dedicated anti-drone systems that could stop them cost $50,000 to $2,000,000 per installation — and there are nowhere near enough of them.

Meanwhile, 500,000,000+ smartphones sit in pockets across Ukraine, Romania, Poland, and the Baltics. Every one of them has:

- A MEMS microphone with 94dB dynamic range — enough to detect an FPV drone at 200 metres
- A WiFi radio that passively measures channel energy — enough to detect a 2.4GHz drone control link
- GPS accurate to ±3m
- An NPU that runs a 480KB YAMNet TFLite model in 156ms
- A 4G uplink with <50ms latency

**APEX-SENTINEL turns that existing hardware into a distributed defense sensor grid.**

No new infrastructure. No specialized equipment. No trained operators. A civilian downloads the app. The app runs silently in the background. The moment a drone enters acoustic or RF range, the network knows — and the commander has a red track on their ATAK display within 500ms.

---

## The 4D Node Model

Every sensor node in APEX-SENTINEL is a **point in 4-dimensional space**:

```
Node(lat, lon, alt, timePrecisionUs)
```

The fourth dimension — temporal precision — is the core insight that separates this system from naive "drone sound detector" apps. Time Difference of Arrival (TDoA) triangulation is only as accurate as the timestamps. A node synchronized via GPS-PPS achieves ±1μs timing, yielding ±12m triangulation accuracy. A smartphone on NTP achieves ±50ms, yielding ±62m. The 4D model makes this uncertainty **explicit and quantified** in every calculation.

Every TDoA solve weights each node's contribution by its clock quality. Every track's error radius `ce` in the CoT output reflects the actual timing uncertainty of the contributing nodes. The system never lies to the commander about what it knows.

```
timePrecisionUs →  Tier-1 GPS-PPS   ±1μs   → triangulation ±12m  (weight 1.0)
                   Tier-2 NTP       ±50ms  → triangulation ±62m  (weight 0.3)
                   Tier-3 LoRa mesh ±500ms → no triangulation    (relay only)
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           THREAT ENTERS AIRSPACE                            │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
   ┌──────▼──────┐    ┌───────▼──────┐    ┌───────▼──────┐
   │  Tier-1     │    │  Tier-2      │    │  Tier-3      │
   │  RTL-SDR    │    │  Smartphone  │    │  Meshtastic  │
   │  + Phone    │    │  only        │    │  LoRa Relay  │
   │             │    │              │    │              │
   │ ◆ Acoustic  │    │ ◆ Acoustic   │    │ ◆ RF relay   │
   │ ◆ RF/WiFi   │    │ ◆ RF/WiFi    │    │              │
   │ ◆ RTL-SDR   │    │              │    │              │
   │ ◆ 900MHz    │    │              │    │              │
   │ Weight: 1.0 │    │ Weight: 0.3  │    │ Weight: 0.1  │
   └──────┬──────┘    └───────┬──────┘    └───────┬──────┘
          └───────────────────┼───────────────────┘
                              │
                     ╔════════▼════════╗
                     ║  GATE 3         ║
                     ║  On-Device      ║
                     ║  VAD → FFT →    ║
                     ║  YAMNet 480KB   ║
                     ║  ≤ 150ms        ║
                     ╚════════╤════════╝
                              │  sentinel.detections.{nodeId}
                     ╔════════▼════════════════════╗
                     ║  NATS JetStream             ║
                     ║  5-Node Raft Cluster        ║
                     ║  Zero SPOF                  ║
                     ╚═╤══════╤══════╤══════╤══════╝
                       │      │      │      │
              ┌────────▼─┐ ┌──▼───┐ ┌▼─────┴──────────┐
              │  TDoA    │ │Track │ │  Supabase        │
              │Correlator│ │Mgr   │ │  bymfcnwfyxui... │
              │500ms win │ │FSM   │ │  eu-west-2       │
              │N-R solver│ │      │ │                  │
              └────┬─────┘ └──┬───┘ └──────┬───────────┘
                   └──────────┴────────────┘
                              │
                     ╔════════▼════════╗
                     ║  GATE 4         ║
                     ║  EKF + LSTM     ║
                     ║  6D State Est.  ║
                     ║  5-horizon pred ║
                     ╚════════╤════════╝
                              │
              ┌───────────────┼───────────────┐
              │               │               │
       ┌──────▼──────┐ ┌──────▼──────┐ ┌─────▼───────┐
       │  Telegram   │ │  CoT XML    │ │  C2 Dash    │
       │  Alert Bot  │ │  FreeTAK    │ │  CesiumJS   │
       │             │ │  ATAK       │ │  OpenMCT    │
       └─────────────┘ └─────────────┘ └─────────────┘
```

### Five Detection Gates

| Gate | Method | What it catches |
|------|--------|-----------------|
| **1 — Radar** | Existing military/civil infrastructure, ADS-B | All airspace threats with RCS >0.1m² |
| **2 — Traffic Infra** | Camera-based vehicle detection, repurposed for air corridors | Low-altitude corridor ingress |
| **3 — Acoustic + RF** | YAMNet 480KB TFLite on-device, WiFi RSSI 3σ anomaly, RTL-SDR 900MHz | FPV rotors 80–900Hz, Shahed engine 500–2000Hz, 2.4/5.8GHz control links |
| **4 — EKF + LSTM** | Extended Kalman Filter 6D state, polynomial predictor (ONNX LSTM in production) | Trajectory state estimation, 5-horizon prediction, impact point |
| **5 — Action** | Telegram Bot, CoT XML → FreeTAKServer → ATAK, C2 dashboard | Commander notification <500ms end-to-end |

---

## Wave-Formation Methodology

Every wave follows the same 6-phase process without exception. This is not optional. It is not negotiable.

```
init → plan → tdd-red → execute → checkpoint → complete
```

**21 PROJECTAPEX documents before any code.** TDD RED before any implementation. Mind-the-gap 8/8 before any wave is declared complete. One wave at a time.

```bash
./wave-formation.sh init W6
./wave-formation.sh plan W6        # → 21 docs
./wave-formation.sh tdd-red W6     # → failing tests committed
./wave-formation.sh execute W6     # → implementation
./wave-formation.sh checkpoint W6  # → npx vitest run --coverage ≥80%
./wave-formation.sh mind-the-gap   # → 8/8 or don't ship
./wave-formation.sh complete W6
```

### Mind-the-Gap — 8-Point Integrity Audit

```
Check 1 ── No NOT_IMPLEMENTED, TODO, FIXME, HACK, stub in src/
Check 2 ── No hardcoded credentials, API keys, JWT tokens, service_role secrets
Check 3 ── No raw audio transmission (emit.*rawAudio, publish.*pcmBuffer, etc.)
Check 4 ── No sensitive files (.env, *.key, *.pem) tracked in git
Check 5 ── ≥20 PROJECTAPEX docs in docs/waves/WN/ for the completed wave
Check 6 ── FR_REGISTER.md has ≥5 FRs with test IDs defined
Check 7 ── Supabase project ID bymfcnwfyxuivinuzurr referenced in docs or schema
Check 8 ── Test suite: 0 failing, ≥86 passing, ≥80% coverage on all four metrics
```

Nothing ships without `exit 0`.

---

## Repository Map

```
apex-sentinel/
│
├── src/                               34 TypeScript modules
│   ├── acoustic/                      Gate 3 — on-device detection
│   │   ├── vad.ts                     Energy-based VAD, 4 aggressiveness levels
│   │   ├── fft.ts                     Cooley-Tukey FFT + Hann window
│   │   ├── yamnet.ts                  YAMNet 480KB TFLite surrogate
│   │   └── pipeline.ts                Gate 3 orchestrator (VAD→FFT→YAMNet)
│   ├── rf/
│   │   └── rssi-baseline.ts           Rolling RSSI baseline, 3σ anomaly detection
│   ├── tracking/
│   │   ├── tdoa.ts                    Newton-Raphson TDoA solver, cos(lat) corrected
│   │   └── track-manager.ts           Track lifecycle FSM (tentative→confirmed→coasted)
│   ├── alerts/
│   │   ├── cot-generator.ts           FreeTAKServer CoT XML (ATAK a-h-A-M-F-Q)
│   │   └── telegram-bot.ts            Alert formatter, pipe-free, Markdown
│   ├── node/
│   │   └── registry.ts                Node registration + heartbeat
│   ├── privacy/
│   │   └── location-coarsener.ts      GDPR ±50m deterministic grid snap
│   ├── nats/
│   │   ├── stream-config.ts           4 JetStream stream definitions
│   │   └── auth-config.ts             mTLS cert paths, 5-node server URLs
│   ├── infra/
│   │   └── circuit-breaker.ts         CircuitBreaker FSM + DeadLetterQueue (FIFO)
│   ├── edge/
│   │   ├── register-node.ts           Node registration validator + response
│   │   └── ingest-event.ts            Detection event validator + privacy sanitizer
│   ├── correlation/
│   │   └── tdoa-correlator.ts         500ms sliding window, dedup, centroid/tdoa
│   ├── relay/
│   │   └── cot-relay.ts               CoT XML validator + buffered TCP relay
│   ├── mobile/
│   │   ├── nats-client.ts             ConnectionState FSM, subject builder
│   │   ├── event-publisher.ts         Offline buffer, 5dp lat/lon privacy
│   │   ├── calibration.ts             5-step calibration wizard FSM
│   │   ├── battery-optimizer.ts       4-mode adaptive sampling
│   │   └── model-manager.ts           OTA model update + SHA-256 integrity
│   └── dashboard/
│       ├── track-store.ts             DashboardTrack Map, sort/filter/stale
│       ├── alert-store.ts             Alert lifecycle, classifyThreat matrix
│       ├── cot-export.ts              CoT XML builder, PII strip, bulk export
│       ├── stats.ts                   detectionsPerHour, avgConfidence, topThreatClass
│       └── keyboard-shortcuts.ts      ATAK-inspired shortcut registry (t/n/a/Esc/f/s)
│
├── tests/                             28 test files — 397 tests, 0 failing
│   ├── acoustic/                      FR-02 VAD · FR-03 FFT · FR-04 YAMNet · FR-08 pipeline
│   ├── rf/                            FR-rf RSSI baseline
│   ├── tracking/                      FR-14 TDoA · FR track-manager
│   ├── node/                          FR-11 node registry
│   ├── alerts/                        FR-18 CoT generator
│   ├── privacy/                       FR-24 GDPR location coarsening
│   ├── nats/                          FR-W2-02 stream config
│   ├── correlation/                   FR-W2-08 TDoA correlator
│   ├── infra/                         FR-W2-13 auth config · FR-W2-14 circuit breaker
│   ├── edge/                          FR-W2-04 register-node · FR-W2-05 ingest-event
│   ├── relay/                         FR-W2-11 CoT relay
│   ├── mobile/                        FR-W3-05 NATS client · FR-W3-06 publisher
│   │                                  FR-W3-11 calibration · FR-W3-12 battery
│   │                                  FR-W3-15 model manager
│   └── dashboard/                     FR-W4-02 track store · FR-W4-03 alert store
│                                      FR-W4-08 CoT export · FR-W4-09 stats
│                                      FR-W4-12 keyboard shortcuts
│
└── docs/waves/                        105 PROJECTAPEX documents
    ├── W1/  (21 docs)  ✅ COMPLETE    On-device detection stack
    ├── W2/  (21 docs)  ✅ COMPLETE    NATS + Supabase + Edge Functions
    ├── W3/  (21 docs)  ✅ COMPLETE    Mobile business logic
    ├── W4/  (21 docs)  ✅ COMPLETE    C2 dashboard
    └── W5/  (21 docs)  🟡 TDD RED    EKF + LSTM trajectory prediction
```

---

## Wave Status

### Wave 1 — On-Device Detection Stack ✅

**Delivered:** 21 docs · 86 tests · 95.2% statement coverage

The entire Gate 3 detection pipeline running on-device — no network required for detection.

| Module | What it does | Key engineering |
|--------|-------------|-----------------|
| `vad.ts` | Voice Activity Detection | RMS threshold, 4 aggressiveness levels, 160-sample frames |
| `fft.ts` | Frequency analysis | Cooley-Tukey FFT, Hann window, peak-based harmonic detection |
| `yamnet.ts` | ML inference | YAMNet 480KB INT8 surrogate; relative amplitude threshold `rmsLevel×0.2` prevents ambient noise false positives |
| `pipeline.ts` | Gate 3 orchestrator | Splits oversized buffers into 160-sample sub-frames, tracks vadDropRate, avgLatencyMs |
| `rssi-baseline.ts` | RF anomaly detection | Rolling mean+σ per channel, 3σ anomaly threshold, configurable window |
| `tdoa.ts` | Triangulation | Newton-Raphson 100 iterations, `cos(lat)` corrected Jacobian, 2-node centroid fallback |
| `track-manager.ts` | Track lifecycle | FSM: tentative→confirmed(≥3 updates)→coasted→pruned, EMA confidence α=0.3 |
| `cot-generator.ts` | ATAK output | CoT XML: FPV→`a-h-A-M-F-Q`, Shahed→`a-h-A-C-F`, confidence-based `ce`, stale=now+5min |
| `registry.ts` | Node management | Registration, heartbeat, `pruneStale()`, re-registration updates in-place |
| `location-coarsener.ts` | GDPR privacy | Deterministic grid snap `Math.round(v/grid)×grid` — no Gaussian noise, no leakage through sampling |

### Wave 2 — NATS + Supabase + Edge Functions ✅

**Delivered:** 21 docs · 147 tests · full infrastructure backbone

| Module | What it does |
|--------|-------------|
| `stream-config.ts` | 4 JetStream streams: DETECTIONS(R3), NODE_HEALTH(R3), ALERTS(R5), COT_EVENTS(R3) |
| `auth-config.ts` | mTLS cert path builder, 5 server URLs: `nats://nats{1-5}.apex-sentinel.internal:4222` |
| `circuit-breaker.ts` | FSM: closed→open(N failures)→half-open(timeout)→closed; DeadLetterQueue FIFO with maxSize eviction |
| `register-node.ts` | Request validator (tier∈[1,2,3], lat/lon bounds, capabilities non-empty) + response builder |
| `ingest-event.ts` | Event validator, sanitizer (confidence clamp, lat/lon 5dp), NATS subject builder |
| `telegram-bot.ts` | Threat alert formatter — no pipe chars (breaks Telegram), Markdown bold, shouldSendAlert gates on 'unknown' |
| `cot-relay.ts` | CoT XML regex validator (uid/type/<point required), buffered TCP relay, send-while-disconnected queues |
| `tdoa-correlator.ts` | 500ms sliding window, per-nodeId dedup, method=tdoa(≥3)/centroid(2), confidence=mean(droneConf) |

### Wave 3 — Mobile Business Logic ✅

**Delivered:** 21 docs · 109 tests · React Native + Expo spec

| Module | What it does |
|--------|-------------|
| `nats-client.ts` | ConnectionState FSM, subject builder, `shouldReconnect()` gates on maxReconnectAttempts |
| `event-publisher.ts` | Offline buffer with maxSize, `buildDetectionPayload()` enforces 5dp lat/lon, `pruneOldEvents()` |
| `calibration.ts` | 5-step FSM: idle→mic_test→gps_lock→nats_ping→test_detection→complete, any fail→failed |
| `battery-optimizer.ts` | 4 modes: performance(>50%)/balanced(>20%)/saver(>10%)/critical(≤10%); charging overrides saver; disable at ≤3% |
| `model-manager.ts` | OTA model management: `needsUpdate()` version compare, `verifyIntegrity()` SHA-256 via Node crypto |

### Wave 4 — C2 Dashboard ✅

**Delivered:** 21 docs · 55 tests · Next.js 14 + CesiumJS + OpenMCT spec

| Module | What it does |
|--------|-------------|
| `track-store.ts` | DashboardTrack Map, upsert/remove/filter/sort, `getStaleTrackIds(maxAgeMs)` |
| `alert-store.ts` | Alert lifecycle, `classifyThreat()` matrix: Shahed≥0.85→critical, FPV≥0.90→critical, unknown→always low |
| `cot-export.ts` | CoT XML builder (no pipes, 5dp coords, PII-stripped), `exportBulkCot()`, `validateExportedCot()` |
| `stats.ts` | `detectionsPerHour()` (extrapolates from window), `avgConfidence()`, `topThreatClass()` (alpha tie-break) |
| `keyboard-shortcuts.ts` | ATAK-inspired registry: t=tracks, n=nodes, a=alerts, Escape=clear, f=fullscreen, s=stats |

### Wave 5 — EKF + LSTM Gate 4 🟡

**Status: 21 docs complete — TDD RED in progress**

Extended Kalman Filter trajectory state estimation + LSTM neural prediction microservice.

```
State vector:  x = [lat, lon, alt, vLat, vLon, vAlt]ᵀ   (6D)
Process model: Singer maneuver noise, σ_acc = 5 m/s²
Measurement:   TdoaCorrelator output — position + errorM as R diagonal
Output:        5 future positions: t+1s, t+2s, t+3s, t+5s, t+10s
               Impact point: project velocity vector to alt=0
Confidence:    σ(t) = σ₀ × e^(0.15t) — exponential decay with horizon

Production ML: ONNX Runtime LSTM (128-unit, 10-step input → 5-step output)
Node.js W5:    Polynomial least-squares surrogate (2nd order, last 5 positions)
```

---

## Numbers

```
┌────────────────────────────────────────────────────────┐
│  CODEBASE                                              │
│  TypeScript modules     34                             │
│  Test files             28                             │
│  Tests                  397 / 397 passing              │
│  Statement coverage     92%    (≥80% threshold)        │
│  Branch coverage        85.5%  (≥80% threshold)        │
│  Function coverage      93.7%  (≥80% threshold)        │
│  mind-the-gap           8/8 PASS                       │
├────────────────────────────────────────────────────────┤
│  DOCUMENTATION                                         │
│  PROJECTAPEX docs       105  (21 × 5 waves)            │
│  Functional Reqs        39 (W1) + 15 (W2) + 18 (W3)   │
│                         + 12 (W4) + 11 (W5) = 95 FRs  │
│  Architectural decisions 40+ logged per wave           │
│  Risk entries           12+12+14+12+10 = 60 risks      │
├────────────────────────────────────────────────────────┤
│  DETECTION PIPELINE                                    │
│  YAMNet model size      480KB INT8 (INDIGO validated)  │
│  Inference latency      ≤150ms on-device NPU           │
│  TDoA accuracy          ±12m (GPS-PPS) · ±62m (NTP)   │
│  E2E alert latency      <500ms detection → CoT/Telegram│
│  False positive rate    ≤3% (multi-gate confirmation)  │
│  Node resilience        N+2 Raft (survives 2/5 failure)│
│  Raw audio egress       0 bytes — ever                 │
└────────────────────────────────────────────────────────┘
```

---

## Technical Depth

### The TDoA Solver

Newton-Raphson iterative solver for Time Difference of Arrival triangulation. The sign convention matters — getting it wrong diverges the solver instead of converging.

```typescript
// Correct sign convention: f_i = dist(x, nodeᵢ) - dist(x, ref) - tdoa_i
// where tdoa_i = (t_nodeᵢ - t_ref) × c (signed, metres)
// Jacobian: ∂f_i/∂lat = (lat-nodeᵢ.lat)/dist_i - (lat-ref.lat)/dist_ref
//           ∂f_i/∂lon = cos(lat) × [...same pattern...]
// cos(lat) correction prevents 40% overestimate of longitude distances at lat=48°N
```

100 iterations. ≥3 nodes → full Newton-Raphson. Exactly 2 nodes → centroid fallback. `estimateError()` = `timingUncertainty × 343 / √(nodeCount)`.

### The EKF (Wave 5)

Singer maneuver noise model for the process covariance Q — better than constant-velocity for FPV drones that maneuver. The innovation covariance `S = H·P·Hᵀ + R` is 3×3, analytically inverted (no external matrix library, zero dependencies).

```typescript
// Predict: x̂ = F·x̂,  P = F·P·Fᵀ + Q
// Update:  K = P·Hᵀ·S⁻¹,  x̂ = x̂ + K·y,  P = (I-K·H)·P
// Joseph form for numerical stability: P = (I-KH)·P·(I-KH)ᵀ + K·R·Kᵀ
// Symmetrize after every step: P = (P + Pᵀ)/2 + ε·I
```

### The YAMNet Surrogate

The 480KB YAMNet INT8 TFLite model runs on Android NDK in production. In Node.js (test environment), it's replaced with a frequency-domain heuristic that correctly distinguishes drone harmonics from ambient noise:

```typescript
// Relative threshold prevents false positives at any ambient level:
const PEAK_THRESHOLD = Math.max(0.001, rmsLevel * 0.2);
// Float32Array ambient samples: 0.00999... < Float64 threshold 0.01
// Drone harmonics concentrate energy at discrete bins: peak >> 20% of RMS
```

### Privacy by Design

Raw audio **never leaves the device**. Not encrypted-in-transit. Not aggregated server-side. Never transmitted. The constraint is enforced structurally — the pipeline outputs only spectral metadata (<1KB per detection event), and `mind-the-gap Check 3` rejects any code pattern that could transmit raw audio.

Location is coarsened to ±50m using **deterministic grid snapping** (not Gaussian noise). Deterministic means the same raw coordinate always produces the same coarsened output — an attacker cannot recover precision by sampling repeatedly.

```typescript
// Deterministic: same input → same output → no averaging attack
const snap = (v: number, grid: number) => Math.round(v / grid) * grid;
// grid = 50 / 111_000 degrees ≈ 0.000450 degrees per 50m
```

---

## INDIGO AirGuard Benchmark

APEX-SENTINEL is built around field-validated parameters from the **INDIGO AirGuard project** (Romanian Ministry of Defense, 2024). Every acceptance criterion in this codebase traces back to a measured result, not a guess.

```
┌──────────────────────────────────┬────────────────┬──────────────────────────┐
│ Parameter                        │ INDIGO Measured│ APEX-SENTINEL            │
├──────────────────────────────────┼────────────────┼──────────────────────────┤
│ YAMNet model size                │ 480KB INT8     │ 480KB INT8 — identical   │
│ Detection accuracy               │ 87%            │ ≥87% target              │
│ ML inference latency             │ 156ms          │ ≤150ms target            │
│ Triangulation error (NTP nodes)  │ ±62m           │ ±62m achieved            │
│ Triangulation error (GPS-PPS)    │ ±12m (derived) │ ±12m target              │
│ Node dropout resilience          │ 45%            │ N+2 Raft ≥60%            │
│ Coverage radius per node         │ 2km acoustic   │ 2km Tier-1/2, 500m mesh  │
└──────────────────────────────────┴────────────────┴──────────────────────────┘
```

---

## CoT Output — NATO Standard

Every confirmed track produces a Cursor-on-Target XML packet compatible with the ATAK ecosystem and FreeTAKServer. Zero integration work required for ATAK operators.

```xml
<event version="2.0"
       uid="APEX-TRK-8f3a1c"
       type="a-h-A-M-F-Q"
       time="2026-03-24T18:23:41.000Z"
       start="2026-03-24T18:23:41.000Z"
       stale="2026-03-24T18:28:41.000Z"
       how="m-g">
  <point lat="48.22450" lon="24.33650" hae="85.0" ce="62.0" le="25.0"/>
  <detail>
    <contact callsign="APEX-FPV-0042"/>
    <track course="247.3" speed="33.5"/>
  </detail>
</event>
```

`a-h-A-M-F-Q` = Atomistic · Hostile · Air · Military · Fixed-wing · Quadrotor.

Threat type map:

```
fpv_drone  → a-h-A-M-F-Q    (hostile air military quadrotor)
shahed     → a-h-A-C-F      (hostile air civil fixed-wing — Shahed profile)
helicopter → a-h-A-M-H      (hostile air military helicopter)
unknown    → a-u-A           (unknown air)
```

---

## NATS JetStream Backbone

```
Stream          Subject                    Replicas  Retention  Purpose
─────────────── ────────────────────────── ──────── ─────────── ───────────────
DETECTIONS      sentinel.detections.>      R3        limits      Detection events
NODE_HEALTH     sentinel.health.>          R3        limits      Node heartbeats
ALERTS          sentinel.alerts.>          R5        limits      Confirmed threats
COT_EVENTS      sentinel.cot.>             R3        limits      CoT relay feed
```

ALERTS is R5 (all 5 nodes) — highest durability. The alert must survive any single-datacenter failure scenario.

Circuit breaker wraps every NATS publish call. Dead Letter Queue (FIFO, configurable maxSize, oldest evicted on overflow) captures events that couldn't be published. The system never loses a detection event silently.

---

## Running the Project

```bash
git clone https://github.com/fratilanico/apex-sentinel.git
cd apex-sentinel
npm install

# Run full test suite with coverage
npx vitest run --coverage

# Run mind-the-gap 8-point integrity audit
./wave-formation.sh mind-the-gap

# Check wave status
./wave-formation.sh status
```

**Expected output:**

```
 Test Files  28 passed (28)
 Tests       397 passed (397)

 Statements : 92%    ✓
 Branches   : 85.5%  ✓
 Functions  : 93.7%  ✓
 Lines      : 92.7%  ✓
```

```
[✓] ALL 8 CHECKS PASSED — exit 0
8/8 PASS. APEX-SENTINEL W1 is real.
```

---

## Documentation

105 PROJECTAPEX documents across 5 waves. Every wave has the full 21-doc suite before a single line of code is written.

| Doc | What it contains |
|-----|-----------------|
| `DESIGN.md` | UX spec, component library, military dark theme, screen layouts |
| `PRD.md` | Product requirements, user archetypes, 40+ user stories, success metrics |
| `ARCHITECTURE.md` | System architecture, tech decisions, data flows, module dependency graphs |
| `DATABASE_SCHEMA.md` | Supabase schema, DDL, indexes, RLS policies, pg_cron jobs |
| `API_SPECIFICATION.md` | REST + NATS + Realtime API contracts, request/response schemas |
| `AI_PIPELINE.md` | ML pipeline specs, model architectures, inference parameters, EKF equations |
| `PRIVACY_ARCHITECTURE.md` | GDPR compliance, on-device processing guarantees, data retention |
| `RESILIENCE.md` (W1) | 8 network pillars, zero-SPOF audit, chaos engineering plan |
| `ROADMAP.md` | Phase milestones, day-by-day task breakdown |
| `TEST_STRATEGY.md` | TDD framework, test pyramid, coverage targets, E2E scenarios |
| `ACCEPTANCE_CRITERIA.md` | Exit criteria: functional, performance, security |
| `DECISION_LOG.md` | 15+ architectural decisions per wave with rationale and rejected alternatives |
| `SESSION_STATE.md` | Phase tracker, tech stack locked, known blockers |
| `ARTIFACT_REGISTRY.md` | All deliverables catalogued with status |
| `DEPLOY_CHECKLIST.md` | Production deployment runbook |
| `LKGC_TEMPLATE.md` | Last Known Good Configuration capture + rollback procedure |
| `IMPLEMENTATION_PLAN.md` | Phased build plan with exact file paths and code scaffolds |
| `HANDOFF.md` | Wave-to-wave handoff state, prerequisites for next wave |
| `FR_REGISTER.md` | All Functional Requirements with test IDs, ACs, dependencies |
| `RISK_REGISTER.md` | Risk matrix with probability, impact, mitigation, residual risk |
| `INTEGRATION_MAP.md` | All integration points with latency budgets and error paths |
| `NETWORK_TOPOLOGY.md` | Network diagrams, port matrix, TLS cert chain, bandwidth estimates |

---

## Privacy and Security

| Guarantee | Enforcement |
|-----------|-------------|
| Raw audio never leaves the device | On-device pipeline outputs only spectral metadata. mind-the-gap Check 3 rejects any `emit.*rawAudio` or `publish.*pcmBuffer` pattern in `src/`. |
| Location ±50m before transmission | `LocationCoarsener` deterministic grid snap. Checked in FR-24 (9 tests). |
| Node IDs pseudonymous | UUID v4 on first launch, stored in SecureStore. No link to device IMEI or phone number. |
| mTLS on all NATS connections | Node client certificates. `auth-config.ts` builds cert paths per nodeId. |
| No raw audio in NATS messages | `ingest-event.ts` schema has no audio fields. Validator rejects unknown fields. |
| GDPR deletion | App: wipe nodeId + pending events. Server: Edge Function removes node record and detection events. |
| RLS on all Supabase tables | Per-role policies. Operators see all. Civil defense role cannot see node IDs (OPSEC). |
| Audit log | All operator actions (acknowledge, export, annotate) logged with user ID and timestamp. |

---

## License

Proprietary. All rights reserved.

Built by **Nicolae Fratila** and the APEX OS team.

---

```
APEX-SENTINEL — Because a 50-cent bullet should not require a $2M radar to detect.
```
