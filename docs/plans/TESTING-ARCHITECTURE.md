# APEX-SENTINEL — Testing Architecture
## 4D QA Framework | TIA + Mutation + BDD + PBT | Post-W7 Complete
### Date: 2026-03-25 | Tests: 803/803 GREEN | 56 test files

---

## 1. TEST PYRAMID (actual numbers)

```
                                    ╔═══════════════════╗
                                    ║  E2E / JOURNEY    ║ 4 files
                                    ║  ~60 tests        ║ FR-W6-journey, FR-W7-journey
                                    ╚═══════════════════╝
                              ╔═══════════════════════════════╗
                              ║  API INTEGRATION TESTS        ║ 12 files
                              ║  ~185 tests                   ║ Pipeline, effectors, NATS,
                              ║                               ║ edge, predict publish, RF
                              ╚═══════════════════════════════╝
                    ╔═════════════════════════════════════════════════╗
                    ║  COMPONENT / SUBSYSTEM TESTS                    ║ 25 files
                    ║  ~360 tests                                     ║ Fusion, prediction, mobile,
                    ║                                                 ║ dashboard, output, ML
                    ╚═════════════════════════════════════════════════╝
          ╔══════════════════════════════════════════════════════════════════╗
          ║  UNIT TESTS                                                      ║ 15 files
          ║  ~198 tests                                                      ║ Acoustic, FFT, VAD,
          ║                                                                  ║ EKF, BVA, privacy, relay
          ╚══════════════════════════════════════════════════════════════════╝

Total: 803 tests | 56 files | 100% pass rate
```

### Breakdown by directory

| Directory          | Files | Tests (est) | Layer              |
|--------------------|-------|-------------|--------------------|
| tests/acoustic/    | 4     | ~80         | Unit + component   |
| tests/ml/          | 7     | ~130        | Component          |
| tests/detection/   | 1     | ~25         | Unit (FSM)         |
| tests/fusion/      | 2     | ~35         | Component          |
| tests/prediction/  | 6     | ~120        | Component          |
| tests/rf/          | 2     | ~20         | Unit               |
| tests/output/      | 5     | ~75         | Integration        |
| tests/integration/ | 4     | ~60         | Integration + E2E  |
| tests/mobile/      | 5     | ~115        | Component          |
| tests/dashboard/   | 5     | ~55         | Component          |
| tests/alerts/      | 2     | ~25         | Integration        |
| tests/relay/       | 1     | ~28         | Integration        |
| tests/correlation/ | 1     | ~16         | Integration        |
| tests/edge/        | 2     | ~40         | Integration        |
| tests/infra/       | 2     | ~30         | Component          |
| tests/privacy/     | 1     | ~12         | Unit               |
| tests/tracking/    | 2     | ~20         | Component          |
| tests/node/        | 1     | ~10         | Integration        |
| tests/nats/        | 1     | ~19         | Integration        |
| tests/deploy/      | 1     | ~15         | Integration        |
| tests/ui/          | 1     | ~10         | Integration        |
| tests/unit/        | 1     | ~20         | Unit (BVA)         |
| tests/helpers/     | 1     | 0 (helper)  | Test infrastructure|

---

## 2. 4D QA FRAMEWORK — CURRENT vs TARGET STATE

### Dimension 1: TDD (Test-Driven Development)

| Aspect                    | Current State (W7)                        | W8 Target                              |
|---------------------------|-------------------------------------------|----------------------------------------|
| TDD adherence             | All W1-W7 FRs written TDD-RED first       | Maintain — W8 batch RED plan documented|
| FR-named describe blocks  | 100% compliant                            | 100% (non-negotiable)                  |
| Coverage: statement       | ~95.66% (W6 baseline)                     | ≥ 95%                                  |
| Coverage: branch          | ~89.22% (W6 baseline)                     | ≥ 90%                                  |
| Coverage: functions       | ~97.19% (W6 baseline)                     | ≥ 97%                                  |
| MC/DC for TerminalPhase   | NOT MET — branch coverage only            | 8-10 test pairs in W8                  |
| DRE: 16kHz defect class   | 100% (W7 fixed)                           | Maintain                               |
| DRE: learning-safety      | 0% (not tested)                           | 100% (FR-W8-ETHICS-01)                 |

### Dimension 2: BDD (Behavior-Driven Development)

| Aspect                    | Current State (W7)                        | W8 Target                              |
|---------------------------|-------------------------------------------|----------------------------------------|
| BDD scenarios             | 4 (FR-W7-journey-hardware-integration)    | 15+ (operator-sourced)                 |
| Operator review           | None — scenarios not reviewed by INDIGO   | Mandatory before W8 execute            |
| Cynefin domain            | Chaotic — subconscious requirements exist | Apprenticeship session before W8 plan  |
| Given/When/Then format    | Partial — journey tests use prose         | Formalize top-10 scenarios             |
| BDD tool                  | Vitest + prose describe blocks            | Consider vitest-cucumber for W9        |

**Top 5 BDD scenarios needed for W8 (to be validated with INDIGO operators):**
```
Scenario 1: Shahed-238 turbine jet detected at night (no visible signature)
  Given: RTL-SDR RF monitor detects ELRS silence for 2s
  And:   Acoustic node detects 6.2kHz dominant frequency band
  When:  TerminalPhaseDetector receives compound signal
  Then:  TERMINAL state fires within 800ms
  And:   JammerActivation sends 900MHz command within 200ms of TERMINAL
  And:   PTZ camera slews to bearing within 500ms

Scenario 2: Motorcycle false positive suppressed (Romanian urban)
  Given: Acoustic node detects 180Hz fundamental (motorcycle idling)
  And:   FalsePositiveGuard receives Doppler signature matching road-speed vehicle
  When:  Confidence gate evaluates
  Then:  No ClassificationEvent is emitted
  And:   No operator alert fires

Scenario 3: Multi-drone track with simultaneous Shahed-136 and Lancet-3
  Given: Node A detects Shahed-136 from bearing 045°
  And:   Node B detects Lancet-3 from bearing 120°
  When:  MultiNodeFusion processes concurrent detections
  Then:  Two distinct tracks are maintained (not merged)
  And:   EKF state is independent per track

Scenario 4: Node failure mid-mission (CE-01 equivalent in BDD format)
  Given: 3-node acoustic mesh is operational
  When:  Node C loses power mid-triangulation
  Then:  TdoaSolver continues with nodes A and B
  And:   Position uncertainty increases (not suppressed)
  And:   NODE_HEALTH alert fires for Node C

Scenario 5: Model update during live detection (learning-safety)
  Given: AcousticProfileLibrary is actively classifying audio
  When:  YAMNetFineTuner requests weight promotion
  Then:  Weight update is QUEUED (not applied)
  And:   Ongoing classification completes with unchanged weights
  And:   Promotion applies only after current inference frame completes
```

### Dimension 3: PBT (Property-Based Testing)

| Aspect                    | Current State (W7)                        | W8 Target                              |
|---------------------------|-------------------------------------------|----------------------------------------|
| Metamorphic relations     | 0 (defined in docs, not yet coded)        | 5 MRs in tests/ml/FR-W8-07-MR.test.ts |
| PBT framework             | Not installed                             | fast-check (npm install -D fast-check) |
| BVA tests                 | 20 (FR-W7-15-BVA)                         | 60+ (expand sub-condition boundaries)  |
| Property: EKF trace(P)    | Not tested                                | Add: P.trace monotone non-increasing   |
| Property: BearingTriangulator | Not tested                            | Add: commutativity, uncertainty bounds |

**Metamorphic relations target (W8 — 5 MRs):**
```
MR-01: SPL scaling invariance
  Input audio × scale k (after LUFS normalization) → same droneType classification

MR-02: Phase shift invariance
  Phase rotate by 90° → confidence changes < 5%

MR-03: Detection superposition
  ambient → no detection; ambient + Shahed-136 at +10dB SNR → detection within 3 frames

MR-04: BearingTriangulator commutativity
  nodes [A,B,C] → position P; nodes [C,B,A] → same position P (within 1m)

MR-05: MonteCarloPropagator rotation invariance
  Rotate track 180° → impact_radius unchanged (only bearing changes)
```

### Dimension 4: MBT (Model-Based Testing)

| Aspect                    | Current State (W7)                        | W8 Target                              |
|---------------------------|-------------------------------------------|----------------------------------------|
| FSM state coverage        | TerminalPhaseDetector: 5 states tested    | Full state × event matrix verified     |
| FSM transition coverage   | Partial (main path + reset)               | All 12 transitions in W8 MC/DC suite   |
| TIA graph (state model)   | Defined in docs, not in CI                | Operational in W8 CI                   |
| Mutation model            | Stryker configured, never run             | Run in W8, score ≥ 80%                 |

---

## 3. TIA IMPACT GRAPH

When a source module changes, these test files must run (minimum TIA selection):

```
src/ml/acoustic-profile-library.ts
  → tests/ml/FR-W6-01-acoustic-profile.test.ts
  → tests/ml/FR-W7-02-acoustic-profile-expansion.test.ts
  → tests/unit/FR-W7-15-boundary-value-analysis.test.ts
  → tests/oracle/FR-OR-01-profile-recall-gates.test.ts        [W8 — add when created]
  → tests/oracle/FR-W8-02-simpsons-paradox-guard.test.ts      [W8 — add when created]

src/ml/false-positive-guard.ts
  → tests/ml/FR-W6-03-false-positive-guard.test.ts

src/detection/terminal-phase-detector.ts
  → tests/detection/FR-W7-03-terminal-phase-detector.test.ts
  → tests/detection/FR-W8-MCDC-01-terminal-phase-mcdc.test.ts [W8 — add when created]
  → tests/integration/FR-W7-journey-hardware-integration.test.ts

src/ml/dataset-pipeline.ts
  → tests/ml/FR-W6-04-dataset-pipeline.test.ts
  → tests/ml/FR-W7-01-dataset-pipeline-16khz.test.ts

src/ml/yamnnet-finetuner.ts
  → tests/ml/FR-W6-02-yamnnet-finetuner.test.ts
  → tests/oracle/FR-W8-ETHICS-01-learning-safety.test.ts      [W8 — add when created]

src/fusion/multi-node-fusion.ts
  → tests/fusion/FR-W6-05-multi-node-fusion.test.ts
  → tests/chaos/CE-01-node-failure-mid-triangulation.test.ts  [W8 — add when created]
  → tests/chaos/CE-03-clock-skew.test.ts                      [W8 — add when created]

src/fusion/bearing-triangulator.ts
  → tests/fusion/FR-W7-05-bearing-triangulator.test.ts
  → tests/ml/FR-W8-07-metamorphic-relations.test.ts           [W8 — add when created]

src/integration/sentinel-pipeline.ts / sentinel-pipeline-v2.ts
  → tests/integration/FR-W6-08-sentinel-pipeline.test.ts
  → tests/integration/FR-W7-09-sentinel-pipeline-v2.test.ts
  → tests/integration/FR-W7-journey-hardware-integration.test.ts
  → tests/chaos/CE-02-nats-partition.test.ts                  [W8 — add when created]

src/output/ptz-slave-output.ts
  → tests/output/FR-W7-06-ptz-slave-output.test.ts
  → tests/integration/FR-W7-journey-hardware-integration.test.ts

src/output/jammer-activation.ts
  → tests/output/FR-W7-07-jammer-activation.test.ts
  → tests/chaos/CE-07-terminal-phase-fail-operational.test.ts [W8 — add when created]

src/output/physical-intercept-coordinator.ts
  → tests/output/FR-W7-08-physical-intercept-coordinator.test.ts

src/prediction/ekf.ts
  → tests/prediction/FR-W5-01-02-03-ekf.test.ts

src/prediction/monte-carlo-propagator.ts
  → tests/prediction/FR-W6-06-monte-carlo.test.ts
  → tests/ml/FR-W8-07-metamorphic-relations.test.ts           [MR-05 rotation invariance]

src/rf/elrs-fingerprint.ts
  → tests/rf/FR-W7-04-elrs-rf-fingerprint.test.ts
  → tests/detection/FR-W7-03-terminal-phase-detector.test.ts  [RF silence indicator]
  → tests/chaos/CE-07-terminal-phase-fail-operational.test.ts [W8 — RF module failure]

src/deploy/edge-deployer.ts
  → tests/deploy/FR-W6-07-edge-deployer.test.ts
  → tests/chaos/CE-06-hardware-divergence-regression.test.ts  [W8 — add when created]

src/mobile/nats-client.ts
  → tests/mobile/FR-W3-05-nats-client.test.ts
  → tests/chaos/CE-02-nats-partition.test.ts                  [W8 — add when created]
```

**TIA script location:** `scripts/tia-select.ts`
**Status:** Defined in FUTURE-SQA-BOOK-IMPLEMENTATION.md — NOT YET COMMITTED to repo.
**W8 action:** Commit script, update CI yml.

---

## 4. P0/P1/P2 REGRESSION TIER BREAKDOWN

### P0 — Zero-tolerance (block merge, run on every commit via TIA)

These modules are adjacent to kinetic response or have safety-critical decision logic.
Any regression is a merge blocker, regardless of test count.

| Module                       | Reason for P0                              | TIA-selected tests                        |
|------------------------------|--------------------------------------------|-------------------------------------------|
| FalsePositiveGuard           | 3-gate blocking jammer activation path     | FR-W6-03 (full)                           |
| TerminalPhaseDetector        | FSM that triggers physical intercept       | FR-W7-03 + W8-MCDC-01 (when written)      |
| AcousticProfileLibrary       | Classification accuracy is force protection| FR-W6-01 + FR-W7-02 + BVA                 |
| JammerActivation             | Physical RF emission                       | FR-W7-07 + CE-07 (when written)           |
| PhysicalInterceptCoordinator | Net-gun activation                         | FR-W7-08                                  |
| DatasetPipeline (16kHz gate) | Sample rate guard = DATA BREACH prevention | FR-W7-01 (EC3 test is P0)                 |

### P1 — Field-trial blockers (run on PR merge, fail PR if broken)

| Module                       | Reason for P1                              | Test files                                |
|------------------------------|--------------------------------------------|-------------------------------------------|
| BearingTriangulator          | Positioning accuracy affects targeting     | FR-W7-05                                  |
| ElrsFingerprint              | RF silence = terminal phase trigger        | FR-W7-04                                  |
| MonteCarloPropagator         | Impact radius feeds SkyNet pre-position    | FR-W6-06                                  |
| EKF / MultiTrackManager      | Tracking accuracy                          | FR-W5-01-02-03 + FR-W5-10-11              |
| SentinelPipelineV2           | Integration layer — CoordRegistry          | FR-W7-09 + journey tests                  |
| PtzSlaveOutput               | Camera slew accuracy                       | FR-W7-06                                  |

### P2 — Nightly + mutation (run nightly and in weekly Stryker job)

| Module                       | Reason for P2                              | Test files                                |
|------------------------------|--------------------------------------------|-------------------------------------------|
| NatsClient FSM               | Reconnect logic — important but not kinetic| FR-W3-05                                  |
| BatteryOptimizer             | Node power management                      | FR-W3-12                                  |
| ModelManager                 | OTA model fetch + verify                   | FR-W3-15                                  |
| DemoDashboard API            | UI layer — not safety path                 | FR-W7-10                                  |
| TelegramBot                  | Alert delivery — degraded gracefully       | FR-W2-09                                  |
| All chaos tests (W8)         | Fault injection — nightly only             | CE-01..CE-08                              |

---

## 5. MUTATION TESTING PLAN

### Configuration

**Stryker target modules (7 modules, W8 first run):**

| Module                           | Dominant fault class       | CRP constants to guard              | Target score |
|----------------------------------|----------------------------|-------------------------------------|-------------|
| src/ml/false-positive-guard.ts   | ROR, LCR, CRP              | confidence thresholds, 3σ value     | ≥ 80%       |
| src/detection/terminal-phase-detector.ts | CRP, ROR, LCR     | speed×1.2, -2 m/s, 5°, 2s RF       | ≥ 80%       |
| src/ml/acoustic-profile-library.ts | CRP, AOR               | 16000 sample rate, 0.65 threshold   | ≥ 80%       |
| src/fusion/bearing-triangulator.ts | AOR, ROR               | WLS convergence epsilon             | ≥ 70%       |
| src/output/jammer-activation.ts  | LCR, ROR                   | activation condition gate           | ≥ 75%       |
| src/prediction/ekf.ts            | AOR, CRP                   | Singer Q parameter, process noise   | ≥ 70%       |
| src/prediction/monte-carlo-propagator.ts | CRP, AOR         | 1000 samples, 0.95 percentile       | ≥ 70%       |

### Operators

```
CRP — Constant Replacement: 16000 → 22050, 0.65 → 0.64, 1.2 → 1.1, 2.0 → 1.9, 5.0 → 4.9
AOR — Arithmetic Operator: + → -, × → ÷, ** → * (Singer Q matrix math)
ROR — Relational Operator: >= → >, < → <=, === → !==
LCR — Logical Connector: && → ||, || → &&, ! → remove
BCR — Boolean Condition: condition → true, condition → false (short-circuit kills)
```

### Schedule

```
W8 (manual baseline):
  npx stryker run --files src/ml/false-positive-guard.ts
  npx stryker run --files src/detection/terminal-phase-detector.ts
  npx stryker run --files src/ml/acoustic-profile-library.ts
  → Document baseline scores in docs/waves/W8/DECISION_LOG.md

W8 CI integration (weekly, NOT per-commit):
  GitHub Actions job: .github/workflows/mutation.yml
  Schedule: cron 0 2 * * 0 (Sunday 02:00 UTC)
  Run: npx stryker run
  Gate: fail if any P0 module score < 80%

Why NOT per-commit:
  Stryker on 3 P0 modules: estimated ~20 min
  TIA per-commit: 2-min feedback loop is the priority
  Full Stryker: weekly is sufficient for safety-critical velocity
```

---

## 6. MIND-THE-GAP — 19 CHECKS (W8 target)

The W6 mind-the-gap suite has 14 checks. W8 expands to 19 with SQA book embedding additions.

### Current 14 checks (W6 format)

| Check | Description                                              | W7 Status | W8 Status |
|-------|----------------------------------------------------------|-----------|-----------|
| 1     | All tests pass (100%)                                    | PASS      | Maintain  |
| 2     | Statement coverage ≥ 80%                                 | PASS      | Maintain  |
| 3     | Branch coverage ≥ 80%                                    | PASS      | Maintain  |
| 4     | Function coverage ≥ 80%                                  | PASS      | Maintain  |
| 5     | FR-named describe blocks (all test files)                | PASS      | Maintain  |
| 6     | No hardcoded test timeouts > 10s                         | PASS      | Maintain  |
| 7     | No `test.only` / `it.only` in committed tests            | PASS      | Maintain  |
| 8     | TypeScript strict mode (npx tsc --noEmit passes)         | PASS      | Maintain  |
| 9     | Build passes (npm run build)                             | PASS      | Maintain  |
| 10    | No console.log in source modules (src/)                  | PASS      | Maintain  |
| 11    | BRAVE1Format output schema validation                    | PASS      | Maintain  |
| 12    | CursorOfTruth template fallback tested                   | PASS      | Maintain  |
| 13    | NATS stream config: all required streams defined         | PASS      | Maintain  |
| 14    | Telegram alert format: box-drawing chars (no pipe tables)| PASS      | Maintain  |

### 5 new checks added in W8

| Check | Description                                                      | W8 Status |
|-------|------------------------------------------------------------------|-----------|
| 15    | Mutation score ≥ 80% on P0 modules (FPG + TerminalPhase + APL)  | FAIL (0%) |
| 16    | Learning-safety decoupling gate test GREEN                       | FAIL (not written) |
| 17    | Fail-operational: CE-07 (RF module null) test GREEN              | FAIL (not written) |
| 18    | Per-profile recall gates: ≥1 oracle test per drone profile       | FAIL (not in CI) |
| 19    | TIA script committed and CI yml references tia-select.ts         | FAIL (not committed) |

**W8 target: 18/19 PASS minimum (Check 18 may need dataset infrastructure before CI-green)**

### How to fix each failing check

**Check 15 (Mutation score):**
```bash
npx stryker run
# Fix surviving mutants by adding tests that distinguish the mutation
# Example: CRP mutant TARGET_SAMPLE_RATE = 22050 survives
# Fix: add explicit assert(datasetPipeline.sampleRate === 16000) in unit test
```

**Check 16 (Learning-safety):**
```
Write tests/oracle/FR-W8-ETHICS-01-learning-safety-decoupling.test.ts
Implement YAMNetFineTuner.requestPromotion() → returns 'QUEUED' when pipeline active
Add PromotionGate class that AcousticProfileLibrary checks before applying weights
```

**Check 17 (Fail-operational CE-07):**
```
Write tests/chaos/CE-07-terminal-phase-fail-operational.test.ts
Modify TerminalPhaseDetector to handle null RF input as UNKNOWN (not FALSE)
Assert: compound condition evaluates on 3/4 indicators with RF status = UNKNOWN
Assert: system does NOT go silent; marks track as DEGRADED_DETECTION
```

**Check 18 (Per-profile recall gates):**
```
Implement tests/helpers/pinned-dataset-loader.ts
Acquire BRAVE1 v2.3 16kHz dataset (from INDIGO team — minimum 50 samples/class)
Write tests/oracle/FR-OR-01-profile-recall-gates.test.ts
Add to CI: only runs on PR merge (expensive — dataset loading time)
```

**Check 19 (TIA script):**
```
git add scripts/tia-select.ts && git commit
Update .github/workflows/ci.yml:
  - name: TIA-selected tests (per commit)
    run: SELECTED=$(npx tsx scripts/tia-select.ts) && npx vitest run $SELECTED
  - name: Full suite (PR gate)
    if: github.event_name == 'pull_request'
    run: npx vitest run --coverage
```

---

## 7. CI PIPELINE FLOW

```
COMMIT PUSH
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  TIA-selected tests (FAST — ~2 min)                 │
│                                                     │
│  npx tsx scripts/tia-select.ts → changed file list  │
│  npx vitest run [TIA-selected test files]            │
│                                                     │
│  FAIL → block push (P0 violation)                   │
│  PASS → continue                                    │
└─────────────────────────────────────────────────────┘
    │
    ▼ (P0 tests always run regardless of TIA)
┌─────────────────────────────────────────────────────┐
│  P0 zero-tolerance suite (mandatory per commit)     │
│                                                     │
│  tests/ml/FR-W6-03-false-positive-guard.test.ts     │
│  tests/detection/FR-W7-03-terminal-phase.test.ts    │
│  tests/output/FR-W7-07-jammer-activation.test.ts    │
│  tests/output/FR-W7-08-physical-intercept.test.ts   │
│  tests/ml/FR-W7-01-dataset-pipeline-16khz.test.ts   │
│                                                     │
│  FAIL → block push immediately                      │
└─────────────────────────────────────────────────────┘
    │
    ▼ (PR merge trigger)
┌─────────────────────────────────────────────────────┐
│  Full suite + coverage gate (PR merge — ~5 min)     │
│                                                     │
│  npx vitest run --coverage                          │
│  Assert: stmt ≥ 80%, branch ≥ 80%, funcs ≥ 80%    │
│  Assert: 100% tests pass                            │
│  npx tsc --noEmit (TypeScript strict)               │
│  npm run build                                      │
│                                                     │
│  FAIL → block PR merge                              │
└─────────────────────────────────────────────────────┘
    │
    ▼ (nightly scheduled job — 02:00 UTC)
┌─────────────────────────────────────────────────────┐
│  Nightly: P2 regression + oracle tests (~15 min)    │
│                                                     │
│  npx vitest run --reporter=verbose                  │
│  P2 tier test files (all)                           │
│  tests/chaos/ — all CE- files (when written)        │
│  tests/oracle/ — recall gates (when written)        │
│                                                     │
│  FAIL → Telegram alert to operator                  │
└─────────────────────────────────────────────────────┘
    │
    ▼ (weekly scheduled job — Sunday 02:00 UTC)
┌─────────────────────────────────────────────────────┐
│  Weekly: Mutation testing + mind-the-gap (~30 min)  │
│                                                     │
│  npx stryker run                                    │
│  Assert: FPG mutation score ≥ 80%                   │
│  Assert: TerminalPhaseDetector score ≥ 80%          │
│  Assert: AcousticProfileLibrary score ≥ 80%         │
│  Run mind-the-gap 19 checks                         │
│                                                     │
│  FAIL → Telegram alert: "mutation regression"       │
│  PASS → Telegram alert: "weekly quality GREEN"      │
└─────────────────────────────────────────────────────┘
```

---

## 8. TEST NAMING CONVENTIONS

All test files MUST follow FR-named format. Violations block wave:complete.

```
Pattern: tests/{layer}/FR-{wave}-{id}-{description}.test.ts

Examples:
  tests/ml/FR-W7-01-dataset-pipeline-16khz.test.ts     ✓
  tests/detection/FR-W7-03-terminal-phase-detector.test.ts  ✓
  tests/oracle/FR-OR-01-profile-recall-gates.test.ts    ✓  (cross-wave oracle = FR-OR)
  tests/chaos/CE-01-node-failure-mid-triangulation.test.ts  ✓  (chaos = CE)
  tests/ml/acoustic-profile-test.test.ts                ✗  (no FR prefix — not compliant)

Internal describe block:
  describe('FR-W7-03-00: TerminalPhaseDetector FSM', () => {
    it('FR-W7-03-01: CRUISE → SUSPECT transition fires when speed > 1.2× baseline', ...
    it('FR-W7-03-02: SUSPECT → COMMIT transition fires when course commitment < 5° variance', ...
  })
```

---

## 9. COVERAGE TARGETS BY LAYER (W8)

| Layer                       | Stmt target | Branch target | Notes                              |
|-----------------------------|-------------|---------------|------------------------------------|
| acoustic/                   | ≥ 95%       | ≥ 90%         | Low complexity — should be 100%    |
| ml/ (profiles, pipeline)    | ≥ 95%       | ≥ 92%         | Oracle tests will push branch up   |
| detection/ (TerminalPhase)  | ≥ 100%      | ≥ 95%         | SIL-2 equivalent — no excuse       |
| fusion/                     | ≥ 95%       | ≥ 90%         |                                    |
| prediction/                 | ≥ 95%       | ≥ 88%         | EKF numerical paths are complex    |
| rf/                         | ≥ 90%       | ≥ 85%         |                                    |
| output/effectors            | ≥ 90%       | ≥ 85%         | Hardware mock paths                |
| integration/pipeline        | ≥ 90%       | ≥ 82%         | Chaos tests will add branch paths  |
| mobile/infra                | ≥ 92%       | ≥ 88%         |                                    |
| **Overall**                 | **≥ 95%**   | **≥ 90%**     | W8 target (up from W6: 89.22%)     |

---

*Testing Architecture — APEX OS Claude — 2026-03-25*
*Based on: 803 tests, 56 files, FUTURE-SQA-BOOK-IMPLEMENTATION.md, SQA-TEXTBOOK-IMPLEMENTATION.md*
*Supersedes: TEST_STRATEGY.md in docs/waves/W7/ (wave-scoped; this is project-scoped)*
