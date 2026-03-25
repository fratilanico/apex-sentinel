# APEX-SENTINEL — W8 Planning Document
## Theme: Verification Hardening + Field Trial Gate
### Date: 2026-03-25 | Prereq: W7 COMPLETE (803/803 tests GREEN)

---

## 1. MANDATE

W7 delivered all structural components: 16kHz migration, 3 new threat profiles, TerminalPhaseDetector FSM,
BearingTriangulator WLS, ELRS fingerprinting, PTZ/Jammer/SkyNet effectors, coordinate injection, demo
dashboard. W8's mandate is NOT to build new features. It is to prove W7 is correct under adversarial
conditions, mutation-verify its decision logic, and establish the recall gates and fail-operational
harness required before the INDIGO field trial.

**W8 is the last wave before joint testing with INDIGO. No field trial proceeds without W8 complete.**

---

## 2. P0 ITEMS FROM FDRP W1-W7 (must address in W8)

### P0-1: Mutation score — Stryker never run

**Problem:** The 22050Hz → 16kHz constant fault survived 629 tests in W6 because no test asserted
TARGET_SAMPLE_RATE === 16000. CRP (constant replacement) is the dominant mutation operator class for
safety-critical numeric constants. FalsePositiveGuard and TerminalPhaseDetector both contain constant
thresholds (confidence threshold, speed multiplier, RF silence duration, altitude rate of change) that
could be mutated without the current suite catching the fault.

**W8 action:**
1. Run `npx stryker run --files src/ml/false-positive-guard.ts` → establish baseline mutation score
2. Run `npx stryker run --files src/detection/terminal-phase-detector.ts` → establish baseline
3. Run `npx stryker run --files src/ml/acoustic-profile-library.ts` → turbine routing gate
4. Target: ≥80% mutation score on all 3 modules
5. Add to wave-formation.sh checkpoint gate: fail if score < 80%

**Stryker configuration additions for W8:**
```
Mutation operators required:
  CRP — constant replacement (catches 22050-class faults)
  AOR — arithmetic operator replacement (±, ×, ÷ in threshold math)
  ROR — relational operator replacement (>=, >, ==, <=)
  LCR — logical connector replacement (&&, ||, !)
  BCR — boolean condition replacement

Modules under mutation (W8 scope):
  src/ml/false-positive-guard.ts     (3-gate decision)
  src/detection/terminal-phase-detector.ts  (4-indicator FSM)
  src/ml/acoustic-profile-library.ts  (confidence routing, turbine threshold)
```

### P0-2: Learning-safety decoupling test missing

**Problem:** FUTURE-SQA book (Linz, Chapter 5): self-learning components must be architecturally
isolated from safety-critical functions. YAMNetFineTuner MUST NOT push updated weights to
AcousticProfileLibrary while it is in CLASSIFYING state. No test verifies this gate.

**FR-W8-04: Learning-safety decoupling test suite**

Test requirements:
```
describe('FR-W8-ETHICS-01: Learning-safety decoupling', () => {
  it('weight promotion is QUEUED when AcousticProfileLibrary is in CLASSIFYING state')
  it('weight promotion is APPLIED only when pipeline is in IDLE state')
  it('in-flight classification is not interrupted by a weight push')
  it('promotion gate cannot be bypassed by calling loadWeights() directly during inference')
  it('promotion log records who requested the update and when it was applied')
})
```

Acceptance criteria: Any direct call to AcousticProfileLibrary.updateWeights() during an active
classify() call must result in QUEUED status, not immediate application. Verified by injecting a
concurrent classify() and updateWeights() call with a mutex guard assertion.

### P0-3: TerminalPhaseDetector MC/DC coverage incomplete

**Problem:** 4-condition compound gate: speed_increase ∧ RF_silence ∧ course_commitment ∧ altitude_descent.
Branch coverage satisfies with 2 test cases (all-true, all-false). MC/DC (DO-178C / SIL-2 equivalent)
requires each sub-condition to independently toggle the compound decision.

**FR-W8-MCDC-01: MC/DC test table for TerminalPhaseDetector**

Minimum 8 test pairs:
```
Pair 1: speed only false → compound false vs all-true → compound true (isolates speed)
Pair 2: RF_silence only false → compound false vs all-true → compound true (isolates RF)
Pair 3: course only false → compound false vs all-true → compound true (isolates course)
Pair 4: altitude only false → compound false vs all-true → compound true (isolates alt)
Plus boundary cases: all false, exactly 3/4 true (all 4 permutations), edge of speed threshold
```

---

## 3. W8 FUNCTIONAL REQUIREMENTS

### FR-W8-01: Per-profile recall gates in CI (oracle tests with pinned dataset)

**Motivation:** The oracle problem for ML systems. AcousticProfileLibrary confidence output has no
deterministic ground truth for arbitrary audio. Solution: pinned dataset with known ground truth labels.

**Implementation:**
```typescript
// tests/oracle/FR-OR-01-profile-recall-gates.test.ts
// Requires: DATASET_VERSION = 'brave1-v2.3-16khz'
// Per-profile recall gates (minimum recall at production threshold):

const RECALL_GATES = {
  'shahed-238':  { threshold: 0.65, minRecall: 0.95, samples: 50 },  // turbine — P0 miss
  'shahed-131':  { threshold: 0.65, minRecall: 0.93, samples: 50 },
  'shahed-136':  { threshold: 0.65, minRecall: 0.95, samples: 100 }, // primary threat
  'gerbera':     { threshold: 0.65, minRecall: 0.92, samples: 50 },
  'lancet-3':    { threshold: 0.60, minRecall: 0.90, samples: 30 },
  'orlan-10':    { threshold: 0.60, minRecall: 0.90, samples: 30 },
};
```

**Dependency:** `tests/helpers/pinned-dataset-loader.ts` must be implemented. Loads from
`tests/fixtures/datasets/{DATASET_VERSION}/{droneType}/*.wav` — checked into git-lfs or
loaded from a versioned S3 bucket.

**gate:** wave-formation.sh checkpoint W8 fails if any profile recall falls below its gate.

### FR-W8-02: Simpson's Paradox guard

**Motivation:** Aggregate accuracy can mask poor per-class recall. A model with 95% aggregate
accuracy may have 40% Shahed-238 recall (rare turbine class under-represented in training data).

**Implementation:**
```typescript
// tests/oracle/FR-W8-02-simpsons-paradox-guard.test.ts
it('per-class recall is NOT masked by aggregate accuracy', async () => {
  // Run classification on balanced per-class dataset (equal samples per class)
  // Assert: for every class, individual recall >= gate (not just weighted average)
  // Fail if aggregate looks good but any single class fails its gate
})
```

Per SQA-TEXTBOOK (Pareto): the acoustic profile decision boundary for Shahed-238 turbine is in
the 20% of code producing 80% of field failures. Per-class gates enforce this.

### FR-W8-03: Fail-operational chaos test harness (CE-01 through CE-08)

**Motivation:** FUTURE-SQA book (Linz, Chapter 5): fail-operational is required architecture. A
system that goes silent on fault is more dangerous than a degraded system.

**tests/chaos/ — 8 chaos scenarios:**
```
CE-01: node-failure-mid-triangulation
  Inject: MultiNodeFusion receives only 2 of 3 required nodes mid-stream
  Assert: system degrades to 2-node triangulation with increased uncertainty, does NOT go silent

CE-02: nats-partition
  Inject: NATS JetStream consumer loses connection for 5s
  Assert: SentinelPipeline offline buffer fills, drains on reconnect, no events lost

CE-03: clock-skew
  Inject: 1 of 3 TDOA nodes has +200ms clock skew
  Assert: TdoaSolver detects skew via Mahalanobis threshold, down-weights affected node

CE-04: model-load-failure
  Inject: EdgeDeployer returns corrupted ONNX artifact (SHA-256 mismatch)
  Assert: ModelManager refuses load, falls back to previous verified model, emits alert

CE-05: sample-rate-drift
  Inject: Legacy RPi4 node broadcasts 22050Hz stream during migration window
  Assert: DatasetPipeline dual-rate shim resamples to 16kHz, does not crash pipeline

CE-06: hardware-divergence-regression
  Inject: RPi4 INT8 output vs Jetson FP16 output for identical audio input
  Assert: classification results differ by < 5% confidence (hardware parity gate)

CE-07: terminal-phase-detector-component-failure
  Inject: RF module returns null (RTL-SDR offline)
  Assert: TerminalPhaseDetector continues on 3/4 indicators, marks RF_SILENT as UNKNOWN
  not as FALSE (fail-operational, not fail-silent)

CE-08: concept-drift-detection
  Inject: Audio stream gradually shifts mel distribution over 100 frames
  Assert: FalsePositiveGuard temporal-linear gate detects drift, raises concept-drift alert
```

### FR-W8-05: Mutation score gate in CI

**Implementation (stryker.config.js additions):**
```json
{
  "mutate": [
    "src/ml/false-positive-guard.ts",
    "src/detection/terminal-phase-detector.ts",
    "src/ml/acoustic-profile-library.ts"
  ],
  "thresholds": {
    "high": 80,
    "low": 60,
    "break": 60
  }
}
```

**CI gate:** wave-formation.sh checkpoint W8 runs `npx stryker run` and fails if mutationScore < 80.
Add to GitHub Actions as a weekly scheduled job (not per-commit — mutation takes ~20 min).

### FR-W8-06: BVA regression suite expansion

Current: 20 BVA tests in FR-W7-15-boundary-value-analysis.test.ts.
W8 target: 60+ tests.

**Expansions required:**
```
TerminalPhaseDetector sub-condition boundaries:
  speed threshold: baseline × 1.2 — test at ×1.1999, ×1.2, ×1.2001
  altitude descent rate: -2.0 m/s — test at -1.9999, -2.0, -2.0001
  RF silence window: 2.0s — test at 1.9999s, 2.0s, 2.0001s
  course bearing variance: 5° — test at 4.9999°, 5.0°, 5.0001°

BearingTriangulator WLS:
  Convergence threshold boundary: test at min/max bearing line divergence
  Node count boundary: test at exactly 2 nodes (below minimum) vs 3 (minimum valid)

MonteCarloPropagator:
  95th percentile boundary: test that impact_radius at exactly 0.95 quantile is correct
  Sample count boundary: test at 999, 1000, 1001 samples
```

### FR-W8-07: PBT metamorphic expansion

Current metamorphic tests: none (referenced in SQA docs, not yet in test suite).

**Metamorphic relations for W8:**
```
MR-01: Frequency invariance
  Input: audio clip at SPL X → classification result R
  Transform: scale SPL by k (re-normalize to same LUFS)
  Assert: R.droneType unchanged (loudness should not change class)

MR-02: Phase invariance
  Input: Shahed-136 audio at phase P
  Transform: phase-shift by 90°
  Assert: classification confidence changes < 5%

MR-03: Superposition consistency
  Input: ambient noise only → no detection
  Transform: add Shahed-136 at SNR +10dB
  Assert: detection fires within 3 inference frames

MR-04: BearingTriangulator commutativity
  Input: 3 bearing lines from nodes A, B, C
  Transform: reorder nodes as C, B, A
  Assert: WLS result position differs by < 1m

MR-05: MonteCarloPropagator rotation invariance
  Input: track heading North at speed V
  Transform: rotate entire scenario 180° (heading South)
  Assert: impact_radius unchanged (physics is rotation-invariant)
```

**Implementation:** `tests/ml/FR-W8-07-metamorphic-relations.test.ts`

### FR-W8-08: 5-node mesh deployment scripts

```bash
# scripts/deploy-mesh.sh
# Deploys SENTINEL firmware to 5 RPi4 nodes via SSH
# Sets NODE_LAT, NODE_LON, NODE_ID, NATS_URL per node
# Runs health check: confirms sentinel.health.{nodeId} appears within 30s
```

### FR-W8-09: TIA script operational in CI

Commit `scripts/tia-select.ts` (defined in FUTURE-SQA docs, not yet committed).
Update `.github/workflows/ci.yml` per the TIA-lite spec:
- Per-commit: TIA-selected tests only (~2-min feedback)
- PR merge gate: full 803+ test suite
- Nightly: full suite + Stryker mutation run

### FR-W8-10: TerminalPhaseDetector latency profiling

**Problem:** W7 DESIGN specifies 800ms fire latency. Adversary RK3588 NPU evasion loop target < 200ms.
**Action:** Profile TerminalPhaseDetector.evaluate() on RPi4 hardware with synthetic EKF state stream.
Document achievable latency SLO. If 800ms is not achievable in < 200ms, document the gap and escalate.

---

## 4. TDD RED PHASE PLAN

Before any W8 implementation begins, write failing tests in this order:

**Batch 1 (P0 — must be RED before any code):**
```
1. tests/chaos/CE-07-terminal-phase-fail-operational.test.ts
   — RF module returns null; assert system continues on 3/4 indicators
   — Must be RED (TerminalPhaseDetector does not yet handle null RF input)

2. tests/oracle/FR-W8-ETHICS-01-learning-safety-decoupling.test.ts
   — Concurrent classify() + updateWeights() → assert QUEUED
   — Must be RED (no promotion gate exists)

3. tests/detection/FR-W8-MCDC-01-terminal-phase-mcdc.test.ts
   — 8 MC/DC test pairs for 4-condition compound gate
   — Likely partial RED (some pairs already covered, some not)
```

**Batch 2 (P1 — after P0 RED committed):**
```
4. tests/oracle/FR-OR-01-profile-recall-gates.test.ts
   — Per-profile recall ≥ 0.92–0.95 against pinned dataset
   — RED until pinned-dataset-loader.ts is implemented

5. tests/oracle/FR-W8-02-simpsons-paradox-guard.test.ts
   — Per-class recall assertion (not aggregate)
   — RED until balanced test dataset assembled

6. tests/chaos/CE-01 through CE-06, CE-08
   — 7 chaos scenarios
   — All RED on first commit
```

**Batch 3 (P2 — after P1 RED committed):**
```
7. tests/ml/FR-W8-07-metamorphic-relations.test.ts
   — 5 MRs (frequency invariance, phase, superposition, BearingTriangulator commutativity, MC rotation)
   — RED (metamorphic test infrastructure not yet built)

8. tests/detection/FR-W7-BVA-expansion.test.ts
   — 40 additional BVA test cases (sub-condition boundaries for TerminalPhaseDetector)
   — RED on boundary values not yet boundary-tested
```

**TDD-RED commit message format:**
```
test(W8-tdd-red): W8 RED suite — chaos+oracle+mcdc+metamorphic

803 existing GREEN (untouched) + N new RED tests
RED by design — W8 execute phase will make them GREEN

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

---

## 5. DEPENDENCIES AND SEQUENCING

```
PREREQUISITE (before W8 init):
  1. Stryker baseline run → mutation score documented (P0-1)
  2. Operator apprenticeship session with INDIGO (Cat/George) → BDD scenarios
  3. DemoDashboard deployed to URL → INDIGO review before Radisson meeting
  4. Confirm Wild Hornets dataset accessible in CI fixtures

W8 SEQUENCE:
  Day 1-2: W8 init — 20 PROJECTAPEX docs, reuse-scan, Telegram notification
  Day 3:   W8 plan — FR table, DRE targets, Stryker baseline
  Day 4-5: W8 tdd-red — Batch 1 (P0 RED), commit, push
  Day 6:   W8 tdd-red — Batch 2 (P1 RED), commit, push
  Day 7:   W8 tdd-red — Batch 3 (P2 RED), commit, push
  Day 8-14: W8 execute — CE-01..CE-08, oracle tests, MC/DC, BVA expansion, learning-safety gate
  Day 15:  W8 checkpoint — mind-the-gap, coverage, Stryker CI integration
  Day 16:  W8 complete — all gates GREEN, tag w8-complete, MEMORY.md update

BLOCKED ON:
  - FR-W8-01 (oracle recall gates): requires pinned dataset loader + BRAVE1 v2.3 16kHz dataset
  - FR-W8-02 (Simpson's Paradox): requires balanced per-class test fixtures
  - CE-06 (hardware divergence): requires RPi4 + Jetson hardware in CI loop (or hardware emulation)
  - FR-W8-08 (mesh deploy scripts): requires 5 RPi4 nodes with SSH access

UNBLOCKED (can start immediately):
  - P0-1 (Stryker run): just run npx stryker run
  - P0-2 (learning-safety test): write test against existing architecture
  - P0-3 (MC/DC): write test cases against existing TerminalPhaseDetector
  - CE-01..CE-05, CE-07, CE-08: all use existing mocks/test infrastructure
```

---

## 6. WAVE-FORMATION CHECKLIST FOR W8

### init phase
```
[ ] Create docs/waves/W8/ directory
[ ] Write all 20 PROJECTAPEX docs (DESIGN, PRD, ARCHITECTURE, DATABASE_SCHEMA, API_SPECIFICATION,
    AI_PIPELINE, PRIVACY_ARCHITECTURE, ROADMAP, TEST_STRATEGY, ACCEPTANCE_CRITERIA, DECISION_LOG,
    SESSION_STATE, ARTIFACT_REGISTRY, DEPLOY_CHECKLIST, LKGC_TEMPLATE, IMPLEMENTATION_PLAN,
    HANDOFF, FR_REGISTER, RISK_REGISTER, INTEGRATION_MAP)
[ ] Run ./scripts/reuse-scan.sh — check FFMS for reusable components before building
[ ] Telegram notification: "W8 init complete — 20 docs written"
[ ] Operator apprenticeship session booked with INDIGO (before plan phase)
```

### plan phase
```
[ ] FR table with 10 FRs (FR-W8-01 through FR-W8-10)
[ ] DRE targets per defect class (from FDRP W1-W7 P0/P1 list)
[ ] Stryker baseline run and mutation score documented in DECISION_LOG
[ ] TIA impact map updated with W8 new test files
[ ] BDD scenario review with INDIGO operator input
[ ] Telegram notification: "W8 plan approved"
```

### tdd-red phase
```
[ ] Batch 1 RED committed + pushed (3 P0 RED test files)
[ ] Batch 2 RED committed + pushed (6 P1 RED test files)
[ ] Batch 3 RED committed + pushed (2 P2 RED test files)
[ ] All existing 803 tests still GREEN after RED additions
[ ] Telegram notification: "W8 tdd-red — N RED tests added, 803 GREEN unchanged"
```

### execute phase
```
[ ] CE-01..CE-08 implementation (chaos test harness)
[ ] FR-W8-ETHICS-01 learning-safety gate implementation
[ ] FR-W8-MCDC-01 MC/DC test pairs (GREEN)
[ ] Oracle recall gates GREEN (requires pinned-dataset-loader.ts)
[ ] Simpson's Paradox guard GREEN
[ ] Metamorphic relations GREEN (5 MRs)
[ ] BVA expansion GREEN (40 new BVA tests)
[ ] Stryker CI integration in .github/workflows/ci.yml
[ ] TIA script committed + CI updated
[ ] 5-node mesh deployment scripts
[ ] All tests GREEN (target ≥ 900 total)
```

### checkpoint phase
```
[ ] npx vitest run --coverage → ≥80% branch coverage (all layers)
[ ] npx stryker run → ≥80% mutation score (FPG + TerminalPhaseDetector + AcousticProfileLibrary)
[ ] mind-the-gap: target 18/19 PASS (new check for fail-operational and mutation gate)
[ ] npm run build (no TypeScript errors)
[ ] npx tsc --noEmit (strict mode)
[ ] Telegram notification: checkpoint results
```

### complete phase
```
[ ] All gates GREEN
[ ] MEMORY.md updated: W8 COMPLETE — N tests, mutation score X%, mind-the-gap Y/19
[ ] FDRP updated: FDRP-VIRUSI-GAP-ANALYSIS-W1-W8.md
[ ] Tag: git tag w8-complete
[ ] Push: git push origin main --tags
[ ] Telegram notification: "W8 COMPLETE — field trial gate OPEN"
```

---

## 7. W8 ACCEPTANCE CRITERIA SUMMARY

| Criterion                              | Gate                       | Current State     |
|----------------------------------------|----------------------------|-------------------|
| All tests GREEN                        | 100% pass                  | 803/803 GREEN     |
| Statement coverage                     | ≥ 80%                      | ~95% (W7 est)     |
| Branch coverage                        | ≥ 80%                      | ~89% (W6 est)     |
| Mutation score (P0 modules)            | ≥ 80%                      | 0% (never run)    |
| Chaos test harness                     | CE-01..CE-08 all GREEN     | Not written       |
| Learning-safety decoupling             | Promotion gate test GREEN  | Not written       |
| TerminalPhaseDetector MC/DC            | 8-10 pairs GREEN           | Partial           |
| Per-profile recall gates               | ≥ 0.92–0.95 per profile    | Not in CI         |
| Simpson's Paradox guard                | Per-class recall asserted  | Not written       |
| TIA script operational                 | CI uses TIA per commit     | Not committed     |
| mind-the-gap                           | ≥ 18/19                    | 14/14 (W7 format) |

---

*W8 Planning Document — APEX OS Claude — 2026-03-25*
*Based on: FDRP W1-W7, FUTURE-SQA-BOOK-IMPLEMENTATION.md, SQA-TEXTBOOK-IMPLEMENTATION.md*
*Prerequisite: W7 COMPLETE (803/803 tests GREEN, pushed to main)*
