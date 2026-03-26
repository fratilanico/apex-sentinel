# APEX-SENTINEL W8 — Implementation Plan

> Wave: W8 | Execution order optimized for P0 first | Date: 2026-03-26

---

## Phase 1: Quality Gates (Days 1-5) — P0 first

### Step 1.1: FR-W8-10 — Learning-Safety Gate (P0)

**Why first:** Resolves all 15 `.todo()` tests. Unblocks mind-the-gap reaching 19/19 with no todos.

```
Files to create:
  src/ml/model-handle-registry.ts
  tests/unit/FR-W8-10-learning-safety-gate.test.ts  ← TDD RED first

Files to modify:
  src/ml/yamnet-finetuner.ts       — add promoteModel()
  src/ml/acoustic-profile-library.ts — add setActiveModel()

TDD RED: Write 16 tests → commit RED
Implement: promoteModel() + setActiveModel() + audit
Supabase: migration 0086_model_promotion_audit.sql
TDD GREEN: All 16 tests passing
```

**Key implementation notes:**
- `promoteModel()` must use a symbol-based ModelHandle (not plain string) to prevent forgery
- Atomic swap: use a single assignment `this._activeWeights = handle.weights`
- Audit write: use fire-and-forget Supabase insert (don't block inference on DB write)

### Step 1.2: FR-W8-01 — Per-Profile Recall Oracle (P0)

```
Files to create:
  src/ml/recall-oracle-gate.ts
  scripts/download-dataset.sh
  scripts/export-model.sh
  tests/ml/FR-W8-01-recall-oracle.test.ts  ← TDD RED first

External: Download BRAVE1-v2.3-16khz, pin in Supabase Storage
Supabase: migration 0088_per_profile_recall_metrics.sql

TDD RED: Write 16 tests → commit RED
Implement: RecallOracleGate.run() → gated export
TDD GREEN: All 16 tests passing
```

### Step 1.3: FR-W8-02 — Simpson's Paradox Oracle (P1)

```
Files to create:
  src/ml/consistency-oracle-w8.ts
  tests/ml/FR-W8-02-simpsons-oracle.test.ts  ← TDD RED first

TDD RED: Write 12 tests → commit RED
Implement: ConsistencyOracle.check() → paradox detection
Integrate into FR-W8-01 pipeline (called after per-class metrics computed)
TDD GREEN: All 12 tests passing
```

---

## Phase 2: Hardware Integration (Days 6-9) — P1

### Step 2.1: FR-W8-07 — Multi-Threat Tracking (P1)

```
Files to create:
  src/tracking/multi-threat-resolver.ts
  tests/tracking/FR-W8-07-multi-threat.test.ts  ← TDD RED first

Modify:
  src/tracking/track-manager.ts — add TDoA deconfliction + collision detection

Supabase: migration 0089_multi_threat_sessions.sql

TDD RED: Write 20 tests → commit RED
Implement: collision detection + swarm event + eviction
TDD GREEN: All 20 passing
```

### Step 2.2: FR-W8-08 — Firmware OTA Controller (P1)

```
Files to create:
  src/node/ota-controller.ts
  tests/node/FR-W8-08-ota-controller.test.ts  ← TDD RED first

Supabase: migration 0087_firmware_ota_log.sql

TDD RED: Write 12 tests → commit RED
Implement: OtaController (manifest check, download, verify, apply, rollback)
TDD GREEN: All 12 passing
Privacy regression: GDPR coarsening + 16kHz sample rate tests
```

### Step 2.3: FR-W8-03 — PTZ Integration (P1)

```
Files to create:
  src/output/ptz-integration-client.ts
  tests/hardware/FR-W8-03-ptz-integration.test.ts

Install: onvif-simulator npm package

TDD RED: Write 8 tests → commit RED
Implement: PtzIntegrationClient wrapping PtzSlaveOutput with ONVIF simulator
TDD GREEN: All 8 passing
```

### Step 2.4: FR-W8-04 — ELRS RF Field Validation (P1)

```
Files to create:
  src/rf/elrs-field-validator.ts
  tests/rf/FR-W8-04-elrs-field.test.ts

TDD RED: Write 10 tests → commit RED
Implement: ElrsFieldValidator with tuning envelope
TDD GREEN: All 10 passing
```

---

## Phase 3: CI Quality (Days 10-11) — P2

### Step 3.1: FR-W8-12 — Stryker Mutation CI (Day 10)

```
Modify:
  package.json — add "test:mutation" script
  .github/workflows/ci.yml — add mutation gate (or equivalent)

Implementation: One-liner (Stryker config already exists)
Verify: npm run test:mutation → score ≥85%
```

### Step 3.2: FR-W8-11 — Chaos Engineering (Day 10-11)

```
Files to create:
  tests/chaos/FR-W8-11-chaos.test.ts

TDD RED: Write 20 tests → commit RED
Implement: Chaos test helpers (NATS partition mock, clock skew injection)
TDD GREEN: All 20 passing
```

---

## Phase 4: Operator UX (Days 12-20) — W8.2

### Step 4.1: FR-W8-06 — Dashboard Next.js (Days 12-16)

```
Create: dashboard/ directory (Next.js 14)
npx create-next-app@14 dashboard --typescript --app --no-tailwind

Components (in order):
  1. /api/tracks SSE route (wired to NATS)
  2. MapPanel (Leaflet + leaflet-heat)
  3. TrackList (sorted by severity)
  4. AlertLog (scrollable)
  5. BearingControl (POST /api/ptz/bearing)
  6. /health endpoint

Tests: 25 (RTL + Playwright E2E)
```

### Step 4.2: FR-W8-05 — Mobile React Native (Days 17-21)

```
Create: mobile/ directory (Expo 51)
npx create-expo-app mobile --template blank-typescript

Screens (in order):
  1. CalibrationWizard (5 steps, wired to CalibrationStateMachine)
  2. DetectionView (NATS subscription, track list + icons)
  3. NodeHealthPanel (health metrics, OTA progress)

Tests: 35 (RTL + integration + 5 E2E)
```

### Step 4.3: FR-W8-09 — Wild Hornets (Day 22)

```
Files to create:
  src/ml/wild-hornets-loader.ts
  scripts/download-wild-hornets.sh
  tests/ml/FR-W8-09-wild-hornets.test.ts

TDD RED → implement → TDD GREEN
FPR target: <5% on augmented corpus
```

---

## Final Steps (Day 23)

1. Privacy regression tests: `tests/privacy/FR-W8-privacy-regression.test.ts`
2. Full test run: `npx vitest run --coverage` — must show ≥1800 passing
3. `./wave-formation.sh mind-the-gap W8` — must show 19/19
4. `npm run export-model` — recall oracle gate
5. `npm run test:mutation` — Stryker ≥85%
6. Update FR_REGISTER: all W8 FRs → DONE
7. `./wave-formation.sh complete W8`
8. Push + Telegram notification
9. Update TAIKAI submission page
