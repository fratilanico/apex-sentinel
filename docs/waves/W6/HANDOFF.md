# APEX-SENTINEL W6 — Handoff Document
# Wave: Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
# Status: W6 INIT COMPLETE — TDD RED phase starting
# Date: 2026-03-25

---

## Wave Identification

| Field | Value |
|-------|-------|
| Wave | W6 |
| Project | APEX-SENTINEL |
| Supabase project | bymfcnwfyxuivinuzurr (eu-west-2) |
| Repo | /Users/nico/projects/apex-sentinel |
| Branch | main |
| Status | INIT COMPLETE — 20 docs written, entering TDD RED |

---

## What Was Built in W1–W5

### W1 — Core Acoustic Detection Layer (80 tests)
- **VAD** — Voice Activity Detection on raw PCM frames
- **FFT** — Fast Fourier Transform with frequency binning
- **YAMNet Surrogate** — stub/interface for ML classification (real model in W6)
- **AcousticPipeline** — end-to-end VAD → FFT → classify flow
- **RollingRssiBaseline** — rolling RSSI baseline for RF anomaly detection
- **TdoaSolver** — Time Difference of Arrival position solver (hyperbolic)
- **TrackManager** — creates and updates drone tracks
- **NodeRegistry** — register/deregister sensor nodes with capabilities

### W2 — Mesh Network + Relay Layer (90 tests)
- **NATS JetStream streams** — durable subject-per-track publish/subscribe
- **mTLS** — mutual TLS cert management for node-to-hub comms
- **CircuitBreaker** — 3-state FSM (closed/open/half-open) with failure threshold
- **EdgeFunctions** — Supabase edge function wrappers (track upsert, alert insert)
- **TelegramBot** — threat notification bot with inline keyboard
- **CotRelay** — Cursor on Target relay (CoT XML format, v1)
- **TdoaCorrelator** — multi-node TDoA correlation with position confidence

### W3 — Node Lifecycle + Calibration (80 tests)
- **NatsClient FSM** — connecting/connected/disconnected state machine with auto-reconnect
- **EventPublisher** — typed NATS event publisher with schema validation
- **CalibrationStateMachine** — node acoustic calibration flow (idle → calibrating → ready)
- **BatteryOptimizer** — duty-cycle scheduler for edge node power management
- **ModelManager** — model versioning, local cache, update check via Supabase Storage

### W4 — Dashboard + Persistence Layer (70 tests)
- **TrackStore** — Supabase-backed track persistence with real-time subscriptions
- **AlertStore** — alert creation, acknowledgement, severity escalation
- **CotExport** — export tracks as CoT XML v2 (compatible with ATAK)
- **Stats** — operational statistics aggregator (detection rates, FP rates)
- **KeyboardShortcuts** — operator keyboard shortcut registry for dashboard

### W5 — Prediction Engine (164 tests, 484 total)
- **EKFInstance** — Extended Kalman Filter (Singer Q model, 6D state: lat/lon/alt + velocities)
- **MatrixOps** — matrix multiply, transpose, inverse, determinant (no external deps)
- **PolynomialPredictor** — 5-horizon polynomial extrapolation (5s, 15s, 30s, 60s, 120s)
- **ImpactEstimator** — ground impact point estimation from velocity vector
- **PredictionPublisher** — NATS + Supabase dual publish for prediction results
- **MultiTrackEKFManager** — manages up to 1000 concurrent EKF tracks, <5ms/track

**Coverage after W5:** 95.38% statements / 87.55% branches / 97.03% functions — all ≥80%

---

## W6 TDD RED Phase — Test Files to Write

Write ALL test files first. Every test must FAIL before implementation begins.

| # | Test File | Source File | Test Count | Priority |
|---|-----------|------------|-----------|----------|
| 1 | `__tests__/ml/acoustic-profile-library.test.ts` | `src/ml/acoustic-profile-library.ts` | 20 | P0 |
| 2 | `__tests__/ml/yamnnet-finetuner.test.ts` | `src/ml/yamnnet-finetuner.ts` | 18 | P0 |
| 3 | `__tests__/ml/false-positive-guard.test.ts` | `src/ml/false-positive-guard.ts` | 22 | P0 |
| 4 | `__tests__/ml/dataset-pipeline.test.ts` | `src/ml/dataset-pipeline.ts` | 18 | P0 |
| 5 | `__tests__/fusion/multi-node-fusion.test.ts` | `src/fusion/multi-node-fusion.ts` | 20 | P0 |
| 6 | `__tests__/prediction/monte-carlo-propagator.test.ts` | `src/prediction/monte-carlo-propagator.ts` | 18 | P1 |
| 7 | `__tests__/deploy/edge-deployer.test.ts` | `src/deploy/edge-deployer.ts` | 18 | P1 |
| 8 | `__tests__/integration/sentinel-pipeline.test.ts` | `src/integration/sentinel-pipeline.ts` | 22 | P1 |
| 9 | `__tests__/output/cursor-of-truth.test.ts` | `src/output/cursor-of-truth.ts` | 16 | P2 |
| 10 | `__tests__/output/brave1-format.test.ts` | `src/output/brave1-format.ts` | 16 | P2 |
| | **TOTAL W6** | | **188** | |

**Verify RED:** `npx vitest run 2>&1 | grep -E "FAIL|Tests"` — all 188 should show FAIL.

---

## W6 Source Files to Implement (Execute Phase)

Implement in this exact order (dependencies first):

```
1. src/ml/acoustic-profile-library.ts     (no deps)
2. src/ml/dataset-pipeline.ts             (depends on #1)
3. src/ml/yamnnet-finetuner.ts            (no internal deps, DI backend)
4. src/ml/false-positive-guard.ts         (no internal deps)
5. src/fusion/multi-node-fusion.ts        (no internal deps)
6. src/prediction/monte-carlo-propagator.ts  (depends on W5 ekf + impact-estimator)
7. src/deploy/edge-deployer.ts            (no internal deps, DI onnx runner)
8. src/output/brave1-format.ts            (depends on TacticalReport type)
9. src/output/cursor-of-truth.ts          (depends on #8)
10. src/integration/sentinel-pipeline.ts  (depends on #1,#3,#4,#5 + W5 modules)
```

---

## Key Gotchas

### FalsePositiveGuard — Motorcycle Problem (CRITICAL)
50cc motorcycle at ~150-200m produces an acoustic signature **identical** to Shahed-136:
- Both have 100-400Hz fundamental
- Both peak around 200-250Hz at close range
- Doppler shift alone is insufficient at low speed

**Three checks ALL required in sequence:**
1. Doppler speed check: if derived speed >60 km/h → vehicle
2. Temporal linearity: if heading variance <5° across 30s window AND speed >40 km/h → vehicle
3. RF cross-check (if RTL-SDR present): no 900MHz FPV burst → likely not FPV drone

Missing any one check will produce false alarms. The order matters — doppler first (cheapest).

### YAMNetFineTuner — Dependency Injection
ONNX Runtime cannot be imported in unit tests (optional peer dependency, may not be installed).
Always inject `ModelBackend` interface:

```typescript
const mockBackend: ModelBackend = {
  forward: vi.fn().mockResolvedValue(new Float32Array([0.9, 0.05, 0.05])),
  loadWeights: vi.fn().mockResolvedValue(undefined),
  exportONNX: vi.fn().mockResolvedValue(undefined),
};
const tuner = new YAMNetFineTuner(DEFAULT_TRAINING_CONFIG, mockBackend);
```

### MonteCarloPropagator — Performance Constraint
1000 samples must complete in <5ms. Use diagonal covariance (NOT Cholesky decomposition):
- Diagonal = independent perturbation per dimension
- Cholesky = correlated perturbation (correct but 3-4x slower)
- For this use case, diagonal is sufficient accuracy at 1/3 the compute cost
- If benchmark shows >5ms: reduce to 500 samples via config, not code change

### SentinelPipeline — Offline Buffer
When NATS disconnects, DO NOT throw. Buffer up to 1000 frames in memory.
- Cap enforced: when buffer.length >= 1000, `buffer.shift()` before `buffer.push()`
- Drain automatically on 'nats:connected' event
- `drainOfflineBuffer()` is also callable manually
- Buffer is in-memory only — restart loses buffered frames (acceptable for tactical use)

### CursorOfTruth — VM Gateway Only
**NEVER call Anthropic API directly. NEVER use ANTHROPIC_API_KEY.**
Always POST to `http://4.231.218.96:7429/chat`. If gateway is unreachable, use `templateFallback()`.
Test by injecting `HttpClient` interface (mock POST response).

### MonteCarloResult — Null Impact Handling
`ImpactEstimator.estimate()` returns `null` when the drone trajectory does not intersect ground
(e.g., climbing, horizontal at high altitude). The MC propagator must handle null gracefully:
- Filter null estimates before computing stats
- If ALL 1000 samples return null: return `sampleCount: 0`, `confidence95RadiusM: 0`

### DatasetPipeline — Hash Split Determinism
The djb2 hash MUST produce the same split for the same item ID across runs.
Do not use `Math.random()` for split assignment. Do not sort by insertion order.
Test: same 100 IDs in different insertion order must produce identical split assignments.

---

## Environment Setup

```bash
cd /Users/nico/projects/apex-sentinel

# Install dependencies
npm install

# Verify W1-W5 baseline still green before starting W6
npx vitest run --coverage

# Expected: 484 tests passing, ≥80% coverage
```

---

## Wave-Formation Command Sequence

```bash
# (Already done — W6 INIT complete, 20 docs written)

# Phase 2: TDD RED
./wave-formation.sh tdd-red W6
# Write all 10 test files → verify all FAIL
# Commit: "test(w6): tdd-red — 188 failing tests for W6 acoustic intelligence"

# Phase 3: Execute
./wave-formation.sh execute W6
# Implement T01 → T10 in dependency order
# After each: npx vitest run __tests__/<module>/<file>.test.ts

# Phase 4: Checkpoint
./wave-formation.sh checkpoint W6
# Run full suite + coverage + build + tsc
npx vitest run --coverage
npm run build
npx tsc --noEmit

# Phase 5: Complete
./wave-formation.sh complete W6
# All 672+ tests green, coverage ≥80%, push to main
```

---

## INDIGO AirGuard Integration

**Partner:** INDIGO AirGuard team (hackathon partners)
**Expectation:** Integration demo showing acoustic detection pipeline end-to-end
**What they provided:** Acoustic intelligence data for Shahed-136 and Lancet-3 signatures

**Demo scope for W6 complete:**
1. `AcousticProfileLibrary` — show profile match for their provided frequency data
2. `FalsePositiveGuard` — demonstrate motorcycle discrimination
3. `SentinelPipeline` — audio frame in → classified detection out
4. `CursorOfTruth` — human-readable tactical report
5. `BRAVE1Format` — interoperable message export

**Integration point:** `SentinelPipeline.processAudioFrame()` is the entry point.
Feed it `AudioFrame` objects with their field recording samples.

---

## Supabase Schema (W6 additions needed)

New tables to add via migration (not yet created — do in execute phase):

```sql
-- Acoustic detections table
create table acoustic_detections (
  id uuid primary key default gen_random_uuid(),
  track_id text not null,
  node_id text not null,
  drone_type text,
  yamnet_confidence float,
  is_false_positive boolean default false,
  fp_reason text,
  frequency_peak_hz float,
  timestamp bigint not null,
  lat float,
  lon float,
  created_at timestamptz default now()
);

-- ML model versions table
create table ml_model_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  onnx_path text,
  device_type text,
  precision text,
  val_accuracy float,
  false_positive_rate float,
  trained_at bigint,
  created_at timestamptz default now()
);
```

---

## Files Changed / Created in W6 INIT

```
docs/waves/W6/
├── DESIGN.md
├── PRD.md
├── ARCHITECTURE.md
├── DATABASE_SCHEMA.md
├── AI_PIPELINE.md
├── IMPLEMENTATION_PLAN.md   ← this wave
├── HANDOFF.md               ← this file
├── FR_REGISTER.md
├── RISK_REGISTER.md
└── INTEGRATION_MAP.md
```

---

## Notes for Next Agent

- W5 EKF types are in `src/prediction/types.ts` — import from there, do NOT redefine
- `ImpactEstimator` is in `src/prediction/impact-estimator.ts` — inject it into MonteCarloPropagator
- NATS mTLS certs are in `infra/certs/` — already set up in W2/W3, do not regenerate
- Fortress IP: 100.68.152.56 (Tailscale) — NATS hub runs here
- VM gateway: http://4.231.218.96:7429/chat — CursorOfTruth uses this
- When mind-the-gap check runs, it checks 14 FDRP dimensions — ensure W6 docs cover privacy (PII in audio datasets), security (dataset poisoning), and operational safety (false negative risk)
