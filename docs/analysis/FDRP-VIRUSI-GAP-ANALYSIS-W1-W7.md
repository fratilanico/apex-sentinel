# APEX-SENTINEL — FDRP + VIRUSI Gap Analysis
## W1 through W7 Complete | Post-SQA-Book-Embedding Edition
### Date: 2026-03-25 | Status: CONDITIONAL-GO (3 P0 blockers remain)

---

## CONTEXT

This report supersedes the W1-W6 version. W7 is now complete (803/803 tests, 56 test files,
source modules expanded from 51 to ~63). The analysis incorporates:
- Full W7 code review (10 new source modules, 174 new tests)
- Two SQA textbook deep-analysis agent outputs (FUTURE-SQA-BOOK-IMPLEMENTATION.md, SQA-TEXTBOOK-IMPLEMENTATION.md)
- W7 DESIGN.md, ARCHITECTURE.md, SESSION_STATE.md
- INDIGO team decisions from 24-25 March 2026 WhatsApp log
- Stryker mutation testing framework: configured but never executed (gap)

### Cumulative test count by wave

| Wave | New tests | Cumulative |
|------|-----------|------------|
| W1   | 83        | 83         |
| W2   | ~117      | ~200       |
| W3   | ~110      | ~310       |
| W4   | ~98       | ~408       |
| W5   | 76        | 484        |
| W6   | 145       | 629        |
| W7   | 174       | 803        |

---

## DIMENSION 1: Detection Accuracy

**VERDICT: AMBER (recovering from RED — W7 fixes P0 sample rate breach)**

### What W7 Fixed

- DatasetPipeline migrated from 22050Hz → 16kHz (FR-W7-01 COMPLETE)
  - Dual-rate ingestion shim supports legacy 22050Hz field nodes during transition window
  - Polyphase resample: 147:160 ratio, ~2ms overhead on RPi 4 — acceptable
  - n_fft: 1024 → 512, hop_length: 220 → 160, fmax: 8000 → 7800 Hz (Nyquist safety margin)
  - EC3 guard: AcousticProfileLibrary now throws SampleRateMismatchError on 22050Hz input
- Gerbera acoustic profile added (FR-W7-02): ICE 2-stroke, f0 167–217 Hz, dominant harmonics 334–651 Hz
- Shahed-131/Geran-1 profile added: higher RPM than Shahed-136, distinct harmonic ladder
- Shahed-238/Geran-3 turbine profile added: jet engine 3–8kHz dominant band — separate turbine routing path
- BearingTriangulator WLS implemented (FR-W7-05): GPS-jam-resilient bearing-line intersection
- TerminalPhaseDetector FSM implemented (FR-W7-03): 4-indicator compound condition

### Remaining Gaps

**Gap 1: Per-profile recall gates not tested against real INDIGO corpus**
```
FR-OR-01 oracle tests require DATASET_VERSION = 'brave1-v2.3-16khz'
Pinned dataset loader: NOT YET INTEGRATED into CI
Gerbera recall gate (≥0.92): DEFINED in SQA docs, NOT in test suite
Shahed-238 recall gate (≥0.95): DEFINED, NOT automated
Target: loadPinnedDataset() helper must ship before field trial
```

**Gap 2: Simpson's Paradox in aggregated recall metrics**
```
Aggregated accuracy across all drone classes can mask poor per-class performance.
A model with 95% aggregate may have 40% Shahed-238 recall (rare turbine class).
Simpson's Paradox guard test: NOT written (P1 — add to W8)
```

**Gap 3: Motorcycle false positive rate unvalidated in Romanian urban context**
- Wild Hornets dataset (3000+ field recordings): referenced in FRs, integration not confirmed in CI
- TAU Urban Scenes 2022 + Bucharest traffic augmentation: not yet integrated
- Romanian urban noise baseline: undefined

**Gap 4: 16kHz migration window — legacy nodes still broadcast 22050Hz**
- Dual-rate shim is a temporary bridge, not a permanent solution
- W6-firmware nodes are not yet upgraded in production fleet

**Score: 5.5/10** (up from 3.5 — P0 sample rate breach fixed; new profiles added; oracle tests remain outstanding)

---

## DIMENSION 2: Privacy Architecture

**VERDICT: GREEN (unchanged from W6)**

- LocationCoarsener: ±50m GDPR coarsening — correct
- CursorOfTruth: 4dp + ±0.0009° jitter — validated
- BRAVE1Format: PII-stripped CoT
- EdgeDeployer: no raw audio transmitted off-node
- Zero raw coordinates in NATS streams
- Hardware effector layer (PTZ, jammer, SkyNet) does not expose location beyond coarsened grid
- JammerActivation and PhysicalInterceptCoordinator: commands do not carry operator PII

**Score: 8.5/10** (unchanged)

---

## DIMENSION 3: Resilience

**VERDICT: AMBER (unchanged; new hardware effector paths untested under fault)**

### Working (retained from W6)
- NATS JetStream 5-node Raft (R3/R5)
- Circuit breaker FSM + DLQ
- SentinelPipeline offline buffer (1000 frames) — W6
- BatteryOptimizer 4-mode FSM
- NATS NatsClient FSM with reconnect + exponential backoff

### W7 Additions
- SentinelPipelineV2 replaces hardcoded 51.5/4.9 with CoordinateRegistry from NODE_LAT/NODE_LON env vars + NATS NODE_HEALTH updates (FR-W7-09)
- JammerActivation: async NATS command, idempotency key, ACK timeout with retry cap
- PhysicalInterceptCoordinator: SKYNET_ACTIVATION stream R5 (highest replication — intercept commands not losable)

### Remaining Gaps

**Fail-Operational not tested (P0 — from SQA book embedding)**
```
Linz (FUTURE-SQA book, Chapter 5): fail-operational is required for safety-critical systems.
A system that goes silent on fault is more dangerous than a degraded system.
If acoustic pipeline fails: system must not emit false "all-clear" signals.
Current state: NO chaos tests inject full subsystem failure and assert continued operation.
tests/chaos/ directory referenced in TIA map — directory is EMPTY in current codebase.
```

**SentinelPipeline offline buffer drain on reconnect**: still not implemented (W6 gap persists)
**Array.shift() O(n) eviction** in offline buffer: not replaced with circular buffer (debt)

**Score: 7.0/10** (unchanged — new effector resilience paths add surface area without corresponding fault tests)

---

## DIMENSION 4: Test Architecture

**VERDICT: GREEN (W7 complete — 803 tests, strong coverage)**

### Current State
- 803/803 tests GREEN (100% pass rate)
- 56 test files, 63+ source modules
- Coverage from W6 (W7 coverage run not yet captured in SESSION_STATE):
  - W6 baseline: 95.66% stmt / 89.22% branch / 97.19% funcs
  - W7 adds 174 tests — expect branch coverage improvement, but unconfirmed
- FR-named describe blocks — fully compliant
- Journey tests: FR-W7-journey-hardware-integration.test.ts added
- BDD: 4 scenarios written in W7 (FR-W7-journey files) — first BDD coverage in project

### New W7 Testing Additions
- FR-W7-03-terminal-phase-detector.test.ts (detection layer)
- FR-W7-05-bearing-triangulator.test.ts (fusion layer)
- FR-W7-04-elrs-rf-fingerprint.test.ts (RF layer)
- FR-W7-01-dataset-pipeline-16khz.test.ts (ML layer — DATA BREACH fix)
- FR-W7-02-acoustic-profile-expansion.test.ts (ML layer — 3 new profiles)
- FR-W7-06-ptz-slave-output.test.ts, FR-W7-07-jammer-activation.test.ts, FR-W7-08-physical-intercept-coordinator.test.ts (output/effector layer)
- FR-W7-10-demo-dashboard.test.ts (UI layer — first UI tests)
- FR-W7-15-label-audit.test.ts (29 tests — highest per-file count, label auditor)
- FR-W7-15-boundary-value-analysis.test.ts (20 BVA tests — SQA book embedding)

### Persistent Gaps

**Mutation score: 0% (P0)**
```
Stryker configured in W7 but never executed.
The 22050Hz constant fault SURVIVED the W6 suite — proof that coverage ≠ mutation safety.
CRP (constant replacement) mutant on TARGET_SAMPLE_RATE would still survive if not caught by
the new EC3 guard test.
Zero mutation score on FalsePositiveGuard (AMBER vector for jammer activation path).
TerminalPhaseDetector compound condition: MC/DC not verified — needs 8-10 test pairs.
```

**Learning-safety decoupling not tested (P0)**
```
FUTURE-SQA book (Linz, Chapter 5): YAMNetFineTuner MUST NOT modify AcousticProfileLibrary
inference weights during live detection. German Ethics Commission ruling: self-learning
components must be architecturally isolated from safety-critical functions.
Current state: no test asserts that the promotion gate blocks live weight updates.
```

**mind-the-gap: 14/14 PASS (W6 baseline) — W7 gate not yet run**
```
W7 adds hardware effector modules. mind-the-gap must be re-run against 803-test suite
before wave:complete is declared. Expected to pass, but not confirmed.
```

**Score: 8.5/10** (down from 9.0 — mutation score gap is a real defect, not cosmetic)

---

## DIMENSION 5: Architecture Completeness

**VERDICT: GREEN (W7 closes all critical P0 architectural gaps from W6)**

### Complete After W7

```
Layer 0 — Edge Sensor:
  AcousticPipeline (W1) — 16kHz (fixed W7)
  FFT + VAD (W1)
  YAMNetFineTuner ONNX (W6)
  EdgeDeployer RPi4/Jetson (W6) — dual-rate shim in W7
  RSSI baseline (W1)
  ElrsFingerprint (W7 — ELRS 900MHz FPV control link burst detection)

Layer 1 — NATS JetStream:
  5 streams W1-W6 + 5 new streams W7 (JAMMER_COMMANDS, PTZ_BEARING,
  SKYNET_ACTIVATION R5, TERMINAL_PHASE, BEARING_REPORTS)

Layer 2 — Fusion + Prediction:
  TdoaSolver (W1) — now with CoordinateRegistry (W7, FR-W7-09)
  MultiNodeFusion IDW (W6)
  EKF 6D Singer Q (W5)
  MonteCarloPropagator 1000-sample (W6)
  BearingTriangulator WLS (W7 — GPS-jam resilient)

Layer 3 — Detection:
  AcousticProfileLibrary — 7 profiles (Shahed-136, Lancet-3, Mavic Mini, Orlan-10,
    Gerbera, Shahed-131, Shahed-238 turbine) (W6 + W7)
  FalsePositiveGuard 3-gate Doppler (W6)
  TerminalPhaseDetector 4-indicator FSM (W7)

Layer 4 — Output:
  CursorOfTruth (W6)
  BRAVE1Format (W6)
  PtzSlaveOutput ONVIF 100Hz (W7)
  JammerActivation 900MHz + GPS L1 (W7)
  PhysicalInterceptCoordinator SkyNet net-gun (W7)

Layer 5 — UI:
  DemoDashboard Next.js (W7 — live track list, heatmap, terminal phase indicator)
```

### Remaining Gaps

**BRAVE1 → ATAK TAK Server bridge**: not implemented (W10 per roadmap)
**Mohajer-06/10, ZALA KUB profiles**: not in AcousticProfileLibrary (W9 debt)
**Multi-threat simultaneous track**: Lancet + Shahed-136 co-presence not tested (W8)

**Score: 8.0/10** (up from 6.5 — TerminalPhaseDetector, BearingTriangulator, coordinate injection all done)

---

## DIMENSION 6: Security Posture (VIRUSI Matrix)

**VERDICT: AMBER — 6.5/10**

| Vector       | W6 Score | W7 Score | Delta | Status | Notes                                                        |
|--------------|----------|----------|-------|--------|--------------------------------------------------------------|
| V — Vulnerability | 5/10 | 5.5/10 | +0.5 | AMBER | EC3 SampleRateMismatchError guard closes one injection vector; BRAVE1 timing oracle UUID not yet replaced |
| I — Integrity     | 7/10 | 7.5/10 | +0.5 | GREEN | SHA-256 model verification; LabelAuditor adds dataset integrity checks (29 tests) |
| R — Resilience    | 7/10 | 7.0/10 | =    | GREEN | SKYNET_ACTIVATION R5 added; fail-operational not tested — held flat |
| U — User/Access   | 6/10 | 6.0/10 | =    | AMBER | No operator auth layer; no RBAC; human confirmation gate (FR-ETHICS-01) documented but not implemented |
| S — Sensitivity   | 8/10 | 8.5/10 | +0.5 | GREEN | PTZ/jammer/SkyNet commands do not leak PII; coordinate coarsening extends to effector layer |
| I — Incidents     | 5/10 | 5.5/10 | +0.5 | AMBER | JammerActivation + SkyNet now write audit logs to NATS streams; no anomaly detection on command stream |

**Adversarial AI vector (opened in W6, not closed in W7):**
- Russian FPV drones use RK3588 NPU (6 TOPS): potentially able to detect and evade acoustic
  countermeasures in future iterations.
- SENTINEL must achieve terminal phase detection latency < 200ms to stay ahead of adversary
  evasion loop.
- TerminalPhaseDetector FSM fires within 800ms (W7 spec) — NOT within 200ms for worst-case
  adversarial scenario. This is a W8 P1 item.

**Score: 6.5/10** (up from 6.3)

---

## DIMENSION 7: Operational Readiness

**VERDICT: AMBER (up from RED — demo dashboard delivered, coordinate injection fixed)**

### What W7 Delivers for Field Readiness

1. DemoDashboard: live track list + heatmap + terminal phase indicator + jammer status + PTZ feed (FR-W7-10)
2. Coordinate injection fixed: SentinelPipelineV2 reads NODE_LAT/NODE_LON from env + NATS NODE_HEALTH
3. 16kHz pipeline: aligned with INDIGO training corpus — models are now trainable on INDIGO data
4. Three new threat profiles: Gerbera, Shahed-131, Shahed-238 — operators can now detect these classes
5. PTZ auto-slaving: ONVIF camera aims at drone bearing/elevation at 100Hz, 500ms PTZ rate limit
6. RF fingerprinting: ELRS 900MHz link detection closes detection gap on FPV control link identification

### Remaining Gaps Before Field Trial

1. **No field-validated false positive rate** — all scenarios are synthetic; Romanian urban noise baseline undefined
2. **No real hardware integration test** — tests use ONVIF/NATS mocks; no Dahua SD49425XB in CI loop
3. **Wild Hornets dataset** (3000+ recordings) referenced but integration not confirmed in CI
4. **Demo dashboard not deployed** — exists as code; not accessible at a live URL for INDIGO review meeting (Radisson)
5. **Python↔TypeScript boundary contract**: INDIGO runs Flask + Python YAMNet; our TypeScript pipeline interop undefined
6. **5-node mesh deployment scripts**: not written (W8 scope)

**Score: 5.5/10** (up from 3.0 — dashboard delivered, coordinate injection fixed; field trial still blocked on real hardware and data)

---

## DIMENSION 8: INDIGO Benchmark Alignment

**VERDICT: AMBER → GREEN (architecturally ahead; data parity nearly achieved with W7)**

### Status After W7

| Capability              | INDIGO (Cat/George)            | APEX-SENTINEL W7              |
|-------------------------|--------------------------------|-------------------------------|
| Sample rate             | 16kHz                          | 16kHz (fixed W7)              |
| YAMNet pipeline         | YAMNet + RandomForest          | YAMNet ONNX (FP32/INT8/FP16)  |
| Training corpus size    | 279 Shahed-136 segments        | Wild Hornets (3000+) + BRAVE1 |
| Drone profiles          | Shahed-136, limited others     | 7 profiles (W6+W7)            |
| Monte Carlo             | 10-50 paths (non-physics)      | 1000-sample EKF-seeded        |
| EKF tracking            | None                           | 6D Singer Q                   |
| TDoA                    | None                           | TdoaSolver + BearingTriangulator |
| Multi-node fusion       | Single node                    | IDW multi-node (min 3)        |
| Terminal phase          | None                           | 4-indicator FSM (W7)          |
| RF fingerprinting       | None                           | ELRS 900MHz (W7)              |
| Demo running            | Flask localhost:5000 heatmap   | Next.js DemoDashboard (W7)    |
| Privacy (GDPR)          | Unknown                        | LocationCoarsener ±50m        |
| Output format           | Custom JSON                    | BRAVE1 NATO + CoT             |

**Score: 7.5/10** (up from 6.5 — data parity nearly achieved; demo delivered; no field trial yet)

---

## DIMENSION 9: SQA Process Maturity (NEW — added from book embedding)

**VERDICT: AMBER — process strong, gap tooling absent**

### What the Book Embedding Confirmed

From FUTURE-SQA-BOOK-IMPLEMENTATION.md (Springer 2020, Amann/Linz/Smith/van Loenhoud):

**TIA (Test Impact Analysis):** DEFINED in W7 docs as `scripts/tia-select.ts` with full IMPACT_MAP.
Current state: script defined in documentation, not yet committed to codebase. CI has not been updated
to use TIA. Impact: full 803-test suite runs on every commit instead of targeted subset.

**Stryker mutation testing:** Configured (stryker.config.js referenced in W7 docs), NEVER EXECUTED.
The 22050Hz → 16kHz constant fault is the proof-of-concept case: it survived W6's 629-test suite
because no test asserted TARGET_SAMPLE_RATE === 16000. A CRP (constant replacement) mutant would
still survive on any module where constant values are assumed but not asserted.
Current mutation score: 0% (no baseline established).
Target: ≥80% mutation score on FalsePositiveGuard, TerminalPhaseDetector, AcousticProfileLibrary.

**BDD (Behavior-Driven Development):** 4 scenarios in W7 journey tests. Coverage is minimal.
INDIGO field operators have not reviewed or contributed scenarios. van Loenhoud's Cynefin analysis:
SENTINEL sits in the Chaotic domain — subconscious operational requirements exist that cannot be
surfaced through written specs alone. Operator apprenticeship is the primary elicitation mechanism,
not documentation.

**OO Lifecycle testing (FUTURE-SQA, Part 3):** Not applied. Object lifecycle tests for
AcousticProfileLibrary (construction → load → classify → reset → dispose) have not been written.
Defects in construction or disposal paths are invisible to unit tests that assume a correctly-
initialized object.

**BVA (Boundary Value Analysis) for classification thresholds:** 20 BVA tests added in W7
(FR-W7-15-boundary-value-analysis.test.ts). Covers confidence boundary at threshold ± epsilon
for all 7 profiles. This is the most complete SQA technique application in the codebase.

**DRE (Defect Removal Efficiency):**
```
16kHz defect class: DRE = 100% (W7 fixed and tested)
TerminalPhaseDetector compound condition: DRE ~60% (FSM implemented; MC/DC not verified)
FPG threshold boundary: DRE ~85% (BVA tests added)
Coordinate injection path: DRE = 100% (hardcode removed, CoordinateRegistry tested)
Gerbera/Shahed-131/238 profiles: DRE ~70% (profiles added; oracle recall gates not in CI)
Learning-safety decoupling: DRE = 0% (not tested)
```

**Score: 5.5/10** (new dimension — process methodology is sound but tooling (mutation, TIA scripts,
oracle dataset loader, chaos tests) is defined but not operational)

---

## VIRUSI SCORE MATRIX

| Dimension                    | W1-W5 | W1-W6 | W1-W7 | Delta W6→W7 |
|------------------------------|-------|-------|-------|-------------|
| 1. Detection Accuracy        | 6.0   | 3.5   | 5.5   | ⬆ +2.0     |
| 2. Privacy Architecture      | 8.5   | 8.5   | 8.5   | =           |
| 3. Resilience                | 6.5   | 7.0   | 7.0   | =           |
| 4. Test Architecture         | 7.5   | 9.0   | 8.5   | ⬇ -0.5     |
| 5. Architecture Completeness | 5.5   | 6.5   | 8.0   | ⬆ +1.5     |
| 6. Security (VIRUSI)         | 6.3   | 6.3   | 6.5   | ⬆ +0.2     |
| 7. Operational Readiness     | 4.0   | 3.0   | 5.5   | ⬆ +2.5     |
| 8. INDIGO Benchmark          | 5.0   | 6.5   | 7.5   | ⬆ +1.0     |
| 9. SQA Process Maturity      | —     | —     | 5.5   | NEW         |
| **WEIGHTED AVERAGE**         | **6.0** | **6.3** | **6.9** | **⬆ +0.6** |

Weight rationale: Dimensions 1, 4, 5, 7 carry 1.5× weight (operational correctness + field trial).
Dimensions 2, 3, 6 carry 1.0× weight. Dimensions 8, 9 carry 0.75× weight (benchmark + process).

---

## P0 BLOCKERS (must fix before W8 execute)

### P0-1: Mutation score baseline — Stryker has never run
```
Risk: FalsePositiveGuard and TerminalPhaseDetector contain decision logic adjacent to kinetic
response (jammer, SkyNet). Professional engineering standard (Schieferdecker, FUTURE-SQA Chapter 3)
requires state-of-the-art methods proportionate to criticality. Not running Stryker is
professionally indefensible for a system that can activate a physical interceptor.
Action: Run npx stryker run on FalsePositiveGuard + TerminalPhaseDetector before W8 execute.
Target: ≥80% mutation score on these two modules.
Gate: wave-formation.sh checkpoint W8 must fail if stryker score < 80%.
```

### P0-2: Learning-safety decoupling test missing
```
Risk: If YAMNetFineTuner can modify AcousticProfileLibrary weights during live detection,
a training job triggered by field data could destabilize the inference model mid-operation.
German Ethics Commission ruling (Linz, Chapter 5): self-learning must be isolated from
safety-critical functions until formally verified. No current test asserts this gate exists.
Action: Write FR-W8-ETHICS-01 test that injects a weight-update call from YAMNetFineTuner
while AcousticProfileLibrary is in CLASSIFYING state and asserts the update is QUEUED,
not applied.
```

### P0-3: TerminalPhaseDetector MC/DC coverage incomplete
```
Compound condition: speed_increase AND RF_silence AND course_commitment AND altitude_descent.
Branch coverage (2 test cases) is insufficient. DO-178C / SIL-2 equivalent requires MC/DC:
each sub-condition must independently toggle the compound decision.
Minimum: 8-10 test pairs for the 4-condition gate.
Current: test file exists (FR-W7-03-terminal-phase-detector.test.ts) but MC/DC not verified.
Action: Add FR-W8-MCDC-01 test suite with explicit MC/DC table for the 4-sub-condition gate.
```

---

## P1 GAPS (fix in W8)

1. **Oracle recall gates in CI**: FR-OR-01 (per-profile recall ≥ 0.92–0.95) must be automated
   with pinned dataset loader. Currently defined in SQA docs, not in test suite.

2. **Simpson's Paradox guard**: Aggregated accuracy can mask poor per-class recall. Add
   FR-W8-SIMPSONS-01: assert per-class recall separately (not averaged) before model promotion.

3. **Fail-operational chaos tests**: tests/chaos/ directory referenced in TIA impact map but
   empty. Write CE-01 through CE-08 per FUTURE-SQA TIA map. Assert system continues on remaining
   layers when any single layer fails.

4. **BDD scenario expansion**: 4 scenarios (W7) is a start. Expand to 15+ with INDIGO operator
   input. Operator apprenticeship before W8 plan phase per van Loenhoud Cynefin recommendation.

5. **TIA script operational**: `scripts/tia-select.ts` defined in docs — must be committed and
   CI updated to use it. Current CI runs full 803-test suite on every commit.

6. **TerminalPhaseDetector latency**: 800ms spec (W7 DESIGN) vs. 200ms adversarial target
   (adversary RK3588 NPU evasion loop). Resolve: profile latency on RPi4 hardware, define
   achievable SLO.

7. **Wild Hornets dataset CI integration**: 3000+ recordings referenced in multiple FRs. Confirm
   dataset is accessible and integrated into DatasetPipeline test fixtures, not just referenced.

8. **BRAVE1 UUID timing oracle**: Replace with crypto UUID v4. Security gap V-vector.

---

## P2 DEBT (W9+)

1. **ATAK TAK Server bridge** — CursorOfTruth → ATAK relay (W10 per roadmap)
2. **Mohajer-06/10 profiles** — Iranian drones in Russian inventory (W9)
3. **ZALA KUB acoustic** — near-silent electric quad; RF detection primary (W9)
4. **Circular buffer eviction** — replace Array.shift() O(n) in offline buffer (W9)
5. **5-node mesh deployment scripts** — W8 scope per WAVE PLAN
6. **mTLS enforcement end-to-end** — currently not enforced on all NATS connections (W9)
7. **RBAC operator auth layer** — no role-based access control exists (W9)
8. **Python↔TypeScript interop contract** — INDIGO Flask integration boundary undefined (W8 plan item)
9. **Multi-threat simultaneous tracking** — Lancet + Shahed-136 co-presence (W8)
10. **BRAVE1 v2 signed (non-repudiation)** — W10

---

## W8 RECOMMENDATION

**Theme: Verification Hardening + Field Trial Gate**

W7 delivered all structural components. W8's mandate is to prove they work correctly under
adversarial conditions, with mutation-verified logic, fail-operational behavior, and per-profile
recall gates that are automated and pinned.

**Prerequisites before W8 tdd-red:**
1. Stryker run on FalsePositiveGuard + TerminalPhaseDetector → establish baseline mutation score
2. Operator apprenticeship session with INDIGO (Cat/George) — surface subconscious requirements
3. DemoDashboard deployed to a URL accessible before the Radisson meeting

**W8 FRs (proposed):**
```
FR-W8-01: Per-profile recall gates in CI (oracle tests with pinned dataset)
FR-W8-02: Simpson's Paradox guard (per-class recall, not aggregated)
FR-W8-03: Fail-operational chaos test harness (CE-01 through CE-08)
FR-W8-04: Learning-safety decoupling test suite (promotion gate isolation)
FR-W8-05: Mutation score gate ≥80% (Stryker CI integration on P0 modules)
FR-W8-06: BVA regression suite expansion (from 20 → 60+ test cases)
FR-W8-07: PBT metamorphic expansion (frequency invariance, SPL normalization MRs)
FR-W8-08: MC/DC test suite for TerminalPhaseDetector (8-10 test pairs)
FR-W8-09: TIA script operational in CI (per-commit fast feedback)
FR-W8-10: 5-node mesh deployment scripts + calibration protocol
```

**W8 target:** ≥900 tests, mutation score ≥80% on P0 modules, 14+/19 mind-the-gap PASS.

---

*FDRP+VIRUSI Analysis — APEX OS Claude — 2026-03-25*
*Based on: 803 tests, 56 test files, W1-W7 code review, 2 SQA textbook deep-analysis outputs, 10 external INDIGO documents*
*Supersedes: FDRP-VIRUSI-GAP-ANALYSIS-W1-W6.md*
