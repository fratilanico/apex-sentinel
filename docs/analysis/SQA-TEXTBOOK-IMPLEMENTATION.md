# Software Testing and Quality Assurance (MCA, Nirali Prakashan) — APEX-SENTINEL Implementation Guide
# Source: Full textbook deep analysis — 4 agent chunks covering all 8 chapters
# Date: 2026-03-25

---

## Executive Summary — Top 5 P0 Findings

1. **Cost of Quality for SENTINEL has unbounded external failure costs.** The textbook's 3-category model (Prevention + Appraisal + Failure) when applied to SENTINEL yields an asymmetric result: every false negative (missed drone) is an external failure cost with no financial cap. The ROI on prevention costs — 16kHz migration, profile completeness for Shahed-131/238/Gerbera, TerminalPhaseDetector — is effectively infinite. The 22050Hz DATA BREACH was an internal failure cost that almost became an external failure cost. The correct framing: prevention is not a budget line, it is force protection.

2. **DRE for the 16kHz migration is currently 0%.** Defect Removal Efficiency = (defects removed during phase / total latent defects) × 100%. The sample rate mismatch defect was latent in the W6 suite — zero tests asserted the pipeline sample rate. DRE = 0% for this defect class. The W7 mandate is: write the failing test first (TDD-RED), implement the fix, assert DRE = 100% for the 16kHz defect class before any other W7 work proceeds.

3. **The 89.22% branch coverage gap from W6 maps directly to false-negative risk in FalsePositiveGuard.** Pareto principle: the uncovered 10.78% of branches are not uniformly distributed across the codebase. The acoustic profile decision boundary (the 2kHz piston/turbine routing threshold, per-class probability cutoffs, and BearingTriangulator WLS convergence path) are the 20% of code that will produce 80% of field failures. Pareto analysis of the uncovered branches is W7 P0 work.

4. **TerminalPhaseDetector needs MC/DC coverage, not just branch coverage.** The compound condition (speed threshold AND RF silence AND course-toward-threat AND altitude below limit) has 4 sub-conditions. Branch coverage satisfies with 2 test cases. MC/DC — which DO-178C requires for safety-critical logic — needs each sub-condition to independently toggle the decision. Minimum: 8–10 test pairs. This is the textbook's "Multiple Condition Coverage" applied to a SIL 2+ equivalent component.

5. **The metamorphic test pattern from `/Users/nico/apex-os-core/infra/__tests__/metamorphic.test.cjs` has NOT been ported to SENTINEL.** SQA-TESTING-CHUNK-4 identifies this as the single most important technique SENTINEL is not using. The SQA textbook cannot answer the oracle problem for ML systems; the answer (metamorphic relations) exists in the kernel tests and must be imported into `tests/ml/`.

---

## Part 1 — QA/QC/SQA Foundation Applied to SENTINEL

### 1.1 QA vs. QC vs. SQA — Applied Definitions

The textbook makes precise distinctions that matter for SENTINEL's quality governance:

| Dimension | QC (Quality Control) | QA (Quality Assurance) |
|---|---|---|
| Orientation | Product-oriented | Process-oriented |
| Mode | Reactive — find defects in the final product | Proactive — prevent defects from arising |
| SENTINEL application | Test suite execution, coverage reports, FP/FN rate | SQA plan, process compliance, wave-formation protocol |

**SQA** = the umbrella. Per the textbook: "SQA is an umbrella activity applied throughout the software process." For SENTINEL, SQA is the wave-formation methodology itself — not just the test suite but the entire process: requirement elicitation → design review → TDD-RED → execute → checkpoint → complete.

### 1.2 McCall's Quality Factors — SENTINEL-Specific Mapping

The 11 McCall factors across three categories, applied to a real-time acoustic threat detection system:

**Product Operation (highest priority for SENTINEL):**

| Factor | SENTINEL Criticality | Test Implication |
|---|---|---|
| Correctness | CRITICAL — wrong classification = missed threat | Per-profile recall gates (FR-OR-01) |
| Reliability | CRITICAL — must operate 24/7 in field | Endurance test: 8-hour inference loop |
| Efficiency | HIGH — 100ms latency SLO for terminal phase | Stage-level latency decomposition tests |
| Integrity | HIGH — prevent unauthorized actuation | FR-ETHICS-01: human confirmation gate |
| Usability | MEDIUM — operator alert format matters | Telegram format checks (mind-the-gap Check 14) |

**Product Transition (edge deployment context):**

| Factor | SENTINEL Relevance | Test Implication |
|---|---|---|
| Portability | HIGH — RPi4 INT8 AND Jetson FP16 | CE-06: hardware divergence regression |
| Interoperability | HIGH — NATS JetStream, BRAVE1Format, ATAK CoT | Thread-based integration tests per event type |
| Reusability | MEDIUM — acoustic profile library reused across nodes | AcousticProfileLibrary API stability tests |

**Product Revision:**

| Factor | SENTINEL Relevance | Test Implication |
|---|---|---|
| Maintainability | HIGH — new drone variants appear constantly | V(G) cyclomatic complexity gate ≤ 20 |
| Testability | HIGH — acoustic ML is hard to test | Metamorphic relations + oracle tests |
| Flexibility | MEDIUM — profile thresholds must be configurable | Attribute-based partition tests for FPG |

### 1.3 Cost of Quality Model — SENTINEL-Specific Analysis

The textbook's three-category model applied to SENTINEL reveals the asymmetry:

**Prevention costs (invest here — ROI is infinite for Severity-1 defect classes):**
- 16kHz pipeline adoption (the DATA BREACH fix — this is a prevention cost for every future test run)
- Adding Gerbera, Shahed-131, Shahed-238 acoustic profiles
- TerminalPhaseDetector development and TDD-RED phase
- Wild Hornets dataset acquisition (3000+ field recordings for negative class coverage)
- ELRS 900MHz RF fingerprinting

**Appraisal costs:**
- Running 906-test suite on every commit (the CI infrastructure cost)
- Cross-validation across acoustic profile library against pinned datasets
- FalsePositiveGuard calibration runs

**Internal failure costs (defects caught before operational deployment):**
- False negative rate during test: missed drone in synthetic/recorded test scenario
- Wrong frequency band: 22050Hz model misses 3–8kHz turbine signatures
- Coordinate hardcoding (51.5/4.9) producing wrong threat vector

**External failure costs — the critical category:**

A false negative in production = missed drone = potential kinetic event. Cost is not financial:
- Human casualties / asset destruction
- Operational mission failure
- Loss of operator confidence (system removed from use = systematic failure of the entire investment)

**Six Sigma frame:** At 3σ performance (66,807 DPMO), at 100 drone events/day = 6–7 missed detections/day. Operationally catastrophic. SENTINEL must target ≥5σ (233 DPMO) — near-zero false negatives. This is achievable because drone events are not truly random; acoustic signatures are discriminable with sufficient training data at the correct sample rate.

### 1.4 DRE Target for W7

`DRE = (Defects removed during development phase / Total latent defects) × 100%`

W6 branch coverage gap = 10.78% of conditional logic untested. Each uncovered branch is a potential false-negative path. The W7 DRE target:

| Defect Class | Current DRE | W7 Target |
|---|---|---|
| 16kHz sample rate | 0% (not tested) | 100% |
| TerminalPhaseDetector compound condition | 0% (not built) | ≥90% |
| Coordinate injection path | 0% (hardcoded, not injected) | 100% |
| FPG threshold boundary | ~70% (happy path tested) | ≥95% |
| Gerbera/Shahed-131/238 profiles | 0% (not present) | ≥80% branch |

---

## Part 2 — Test Design Techniques (Full Hierarchy, SENTINEL-Specific)

### 2.1 Equivalence Class Partitioning for AcousticProfileLibrary

ECP rules applied to the audio input domain:

**Input: sample rate (expected: exactly 16000)**
- EC1 (valid): `sampleRate === 16000` — the only valid class
- EC2 (invalid below): `sampleRate < 16000` (e.g., 8000Hz phone audio) → SampleRateMismatchError
- EC3 (invalid above): `sampleRate > 16000` (e.g., 22050Hz, 44100Hz) → SampleRateMismatchError

**Input: audio duration (valid: 0.96s – 10s)**
- EC4 (valid): `0.96 <= durationSec <= 10.0` — single YAMNet inference window
- EC5 (invalid short): `durationSec < 0.96` — insufficient for one YAMNet frame
- EC6 (invalid long): `durationSec > 10.0` — exceeds ring buffer, should truncate with warning
- EC7 (boundary): exactly `durationSec === 0.96` (one frame exactly)
- EC8 (zero): `durationSec === 0` — should throw, not silently classify

**Input: channel count**
- EC9 (valid): mono (1 channel)
- EC10 (invalid): stereo (2 channels) without downmix → must either auto-downmix or throw

**Output: confidence score (any float32 audio)**
- EC11 (normal): `0 <= confidence <= 1` — always required
- EC12 (error): `confidence === NaN` — must be caught and converted to 0.0
- EC13 (error): `confidence === Infinity` — must be caught and clamped

```typescript
// tests/acoustic/FR-W7-ECP-audio-input-validation.test.ts
describe('FR-W7-ECP-01: AcousticProfileLibrary input validation (ECP)', () => {

  describe('Sample rate equivalence classes', () => {
    it('EC1: 16000Hz is accepted', async () => {
      const buf = createAudioBuffer({ sampleRate: 16000, durationSec: 1.0 });
      await expect(library.classify(buf)).resolves.toBeDefined();
    });
    it('EC2: 8000Hz throws SampleRateMismatchError', async () => {
      const buf = createAudioBuffer({ sampleRate: 8000, durationSec: 1.0 });
      await expect(library.classify(buf)).rejects.toThrow('SampleRateMismatchError');
    });
    it('EC3: 22050Hz throws SampleRateMismatchError (the DATA BREACH guard)', async () => {
      const buf = createAudioBuffer({ sampleRate: 22050, durationSec: 1.0 });
      await expect(library.classify(buf)).rejects.toThrow('SampleRateMismatchError');
    });
    it('EC3b: 44100Hz throws SampleRateMismatchError', async () => {
      const buf = createAudioBuffer({ sampleRate: 44100, durationSec: 1.0 });
      await expect(library.classify(buf)).rejects.toThrow('SampleRateMismatchError');
    });
  });

  describe('Duration equivalence classes', () => {
    it('EC4: 1.0s duration is accepted', ...);
    it('EC5: 0.5s (below 0.96s minimum) throws InsufficientDurationError', ...);
    it('EC7: exactly 0.96s is accepted (boundary)', ...);
    it('EC8: 0s duration throws', ...);
  });

  describe('Channel count equivalence classes', () => {
    it('EC9: mono input classifies normally', ...);
    it('EC10: stereo input triggers auto-downmix with warning log', ...);
  });
});
```

### 2.2 Boundary Value Analysis for Classification Thresholds

BVA rationale (textbook): "The density of defect is more towards the boundaries." For SENTINEL, classification threshold boundaries are where false positives and false negatives are born.

**Shahed-238 threshold: 0.65 (example)**

| Value | Type | Expected Behavior |
|---|---|---|
| 0.6499 | BLB (just below lower) | SUPPRESS — must not emit |
| 0.65 | LB (on lower bound) | EMIT — boundary is inclusive |
| 0.6501 | ALB (just above lower) | EMIT |

**Float precision note:** never use `=== 0.65` — use `Math.abs(confidence - threshold) < Number.EPSILON` in assertions.

**Error-guessing additions (beyond standard BVA):**
- `confidence === 0.0` — null signal / model failure return
- `confidence === 1.0` — maximum confidence (overfit signal or test fixture artefact)
- `confidence === NaN` — model numerical instability
- `confidence === -Infinity` — model log-softmax underflow

```typescript
// tests/detection/FR-W7-BVA-thresholds.test.ts
describe('FR-W7-BVA-01: Confidence threshold boundary value analysis', () => {

  const PROFILES = [
    { name: 'shahed-238', threshold: 0.65 },
    { name: 'fpv-quad',   threshold: 0.85 },
    { name: 'gerbera',    threshold: 0.70 },  // confirm threshold before finalising
  ];

  for (const { name, threshold } of PROFILES) {
    const below = parseFloat((threshold - 0.0001).toFixed(4));
    const above = parseFloat((threshold + 0.0001).toFixed(4));

    describe(`${name} (threshold: ${threshold})`, () => {
      it(`BLB: ${below} → SUPPRESS`, async () => {
        const result = await fpg.evaluate({ droneType: name, confidence: below });
        expect(result.action).toBe('SUPPRESS');
      });
      it(`LB: ${threshold} → EMIT (inclusive boundary)`, async () => {
        const result = await fpg.evaluate({ droneType: name, confidence: threshold });
        expect(result.action).toBe('EMIT');
      });
      it(`ALB: ${above} → EMIT`, async () => {
        const result = await fpg.evaluate({ droneType: name, confidence: above });
        expect(result.action).toBe('EMIT');
      });
    });
  }

  describe('Error-guessing additions', () => {
    it('confidence NaN → SUPPRESS, no throw', async () => {
      const result = await fpg.evaluate({ droneType: 'shahed-238', confidence: NaN });
      expect(result.action).toBe('SUPPRESS');
    });
    it('confidence 0.0 → SUPPRESS', async () => {
      const result = await fpg.evaluate({ droneType: 'shahed-238', confidence: 0.0 });
      expect(result.action).toBe('SUPPRESS');
    });
    it('confidence 1.0 → EMIT', async () => {
      const result = await fpg.evaluate({ droneType: 'shahed-238', confidence: 1.0 });
      expect(result.action).toBe('EMIT');
    });
  });
});
```

### 2.3 Decision Table Testing for FalsePositiveGuard

The FalsePositiveGuard has 4 binary input conditions, yielding 16 possible combinations reduced to 6 meaningful rules via don't-care simplification:

**Conditions:**
- C1: `confidence >= threshold`
- C2: `spectralConsistencyScore >= 0.7` (spectral flatness in expected band)
- C3: `temporalPersistenceFrames >= 3` (sustained detection for ≥ 3 frames)
- C4: `ambientNoiseFlag === true` (high ambient noise detected)

**Decision table (simplified, per textbook §5.2.1 method):**

| Rule | C1 | C2 | C3 | C4 | Action |
|---|---|---|---|---|---|
| R1 | T | T | T | F | EMIT — all conditions met, clean environment |
| R2 | T | T | T | T | SUPPRESS — high noise, suppress to prevent FP storm |
| R3 | T | T | F | X | HOLD — await persistence (3-frame window) |
| R4 | T | F | X | X | SUPPRESS — spectral mismatch overrides confidence |
| R5 | F | X | X | X | SUPPRESS — below confidence threshold |
| R6 | T | T | T | F | EMIT — same as R1, used for different profile |

Each rule = one test case. Generate using the cause-effect graph method: causes = C1–C4, effects = EMIT/SUPPRESS/HOLD.

```typescript
// tests/detection/FR-W7-DT-false-positive-guard.test.ts
describe('FR-W7-DT-01: FalsePositiveGuard decision table', () => {

  const PROFILES = ['shahed-238', 'fpv-quad', 'gerbera'];

  for (const profile of PROFILES) {
    describe(`Profile: ${profile}`, () => {

      it('R1: C1=T, C2=T, C3=T, C4=F → EMIT', async () => {
        const result = await fpg.evaluate({
          profile, confidence: 0.75, spectralConsistency: 0.80,
          temporalPersistence: 4, ambientNoiseHigh: false,
        });
        expect(result.action).toBe('EMIT');
      });

      it('R2: C1=T, C2=T, C3=T, C4=T → SUPPRESS (noisy env)', async () => {
        const result = await fpg.evaluate({
          profile, confidence: 0.75, spectralConsistency: 0.80,
          temporalPersistence: 4, ambientNoiseHigh: true,
        });
        expect(result.action).toBe('SUPPRESS');
        expect(result.reason).toContain('ambient_noise');
      });

      it('R3: C1=T, C2=T, C3=F, C4=F → HOLD (no temporal persistence)', async () => {
        const result = await fpg.evaluate({
          profile, confidence: 0.75, spectralConsistency: 0.80,
          temporalPersistence: 1, ambientNoiseHigh: false,
        });
        expect(result.action).toBe('HOLD');
      });

      it('R4: C1=T, C2=F, C3=T, C4=F → SUPPRESS (spectral mismatch)', async () => {
        const result = await fpg.evaluate({
          profile, confidence: 0.75, spectralConsistency: 0.50,  // below 0.7
          temporalPersistence: 4, ambientNoiseHigh: false,
        });
        expect(result.action).toBe('SUPPRESS');
        expect(result.reason).toContain('spectral_mismatch');
      });

      it('R5: C1=F, C2=T, C3=T, C4=F → SUPPRESS (below confidence)', async () => {
        const result = await fpg.evaluate({
          profile, confidence: 0.40, spectralConsistency: 0.85,
          temporalPersistence: 4, ambientNoiseHigh: false,
        });
        expect(result.action).toBe('SUPPRESS');
      });
    });
  }
});
```

### 2.4 MC/DC Coverage for TerminalPhaseDetector

The textbook's "Multiple Condition Coverage" (= MC/DC in DO-178C terminology) for the compound 4-condition gate in TerminalPhaseDetector:

**Compound condition:** `speedExceedsThreshold && rfSilenceDetected && courseTowardThreat && altitudeBelowLimit`

MC/DC requires: each condition must independently toggle the decision outcome. This needs pairs of test cases differing only in one condition.

```typescript
// tests/detection/FR-W7-03-terminal-phase-detector-mcdc.test.ts
describe('FR-W7-MCDC-01: TerminalPhaseDetector MC/DC coverage', () => {

  // Baseline: all 4 conditions TRUE → TERMINAL
  const base = {
    speedKmh: 250,       // exceeds 180 km/h threshold
    rfSilent: true,
    courseTowardThreat: true,
    altitudeM: 150,      // below 200m limit
  };

  it('Baseline: all TRUE → TERMINAL state entered', async () => {
    const result = await detector.evaluate(base);
    expect(result.state).toBe('TERMINAL');
  });

  // C1 pair: speed independently toggles
  it('C1=F (speed below threshold), all others T → NOT TERMINAL', async () => {
    const result = await detector.evaluate({ ...base, speedKmh: 80 });
    expect(result.state).not.toBe('TERMINAL');
  });

  // C2 pair: RF silence independently toggles
  it('C2=F (RF still present), all others T → NOT TERMINAL', async () => {
    const result = await detector.evaluate({ ...base, rfSilent: false });
    expect(result.state).not.toBe('TERMINAL');
  });

  // C3 pair: course independently toggles
  it('C3=F (course away from threat), all others T → NOT TERMINAL', async () => {
    const result = await detector.evaluate({ ...base, courseTowardThreat: false });
    expect(result.state).not.toBe('TERMINAL');
  });

  // C4 pair: altitude independently toggles
  it('C4=F (altitude above 200m), all others T → NOT TERMINAL', async () => {
    const result = await detector.evaluate({ ...base, altitudeM: 350 });
    expect(result.state).not.toBe('TERMINAL');
  });

  // Negative tests: illegal FSM transitions
  it('CRUISE → TERMINAL (skipping APPROACH) is rejected', async () => {
    const detector = new TerminalPhaseDetector({ initialState: 'CRUISE' });
    const result = await detector.forceTransition('TERMINAL');
    expect(result.accepted).toBe(false);
    expect(result.state).toBe('CRUISE');
  });

  it('TERMINAL → APPROACH revert is rejected', async () => {
    const detector = new TerminalPhaseDetector({ initialState: 'TERMINAL' });
    const result = await detector.forceTransition('APPROACH');
    expect(result.accepted).toBe(false);
    expect(result.state).toBe('TERMINAL');  // must not regress
  });
});
```

### 2.5 Cyclomatic Complexity (V(G)) Analysis for Key Modules

The textbook's formula: `V(G) = e - n + 2p` where e = edges, n = nodes, p = connected components. Risk table from textbook Table 7.8:

| V(G) | Risk | Testability |
|---|---|---|
| 1–10 | Simple | High |
| 11–20 | Moderate | Medium |
| 21–40 | Low testability | Low |
| >40 | Untestable | Very low |

**SENTINEL modules estimated V(G):**

| Module | Estimated V(G) | Action Required |
|---|---|---|
| FalsePositiveGuard.evaluate() | ~12–15 | MC/DC tests + decision table |
| TerminalPhaseDetector.evaluate() | ~15–20 (4-condition compound) | MC/DC as above, aim for ≤15 |
| MultiNodeFusion.correlate() | ~18–25 | Refactor if >20 to improve testability |
| MonteCarloPropagator.predict() | ~15–20 | Path coverage for key trajectory variants |
| BearingTriangulator.solveWLS() | ~10–12 | BVA on degenerate geometry |

The textbook rule: number of test cases needed ≥ V(G) for adequate path coverage. For TerminalPhaseDetector.evaluate() with V(G) ≈ 18, the current 3–4 tests are far short of the required minimum.

---

## Part 3 — OO Testing (Ch. 8) Applied to SENTINEL Classes

### 3.1 Class State Testing: Required Coverage for Three Key Classes

Per Ch. 8: "Every class must test all operations associated with the object, set and interrogate all attributes, exercise the object in all possible states."

**AcousticProfileLibrary:**
- Operations: `loadProfiles()`, `classify()`, `classifyWithFeatures()`, `getProfileNames()`, `reconfigureThreshold()`
- Attributes: `sampleRate`, `profiles`, `confidenceThresholds`, `temporalWindowMs`
- States: UNLOADED, LOADED, CLASSIFYING, ERROR
- Test gap: no test exercises the ERROR state or validates reconfiguration side effects

**TerminalPhaseDetector:**
- Operations: `evaluate()`, `reset()`, `getState()`, `forceTransition()` (admin only)
- Attributes: `currentState`, `speedThreshold`, `altitudeLimit`, `rfSilenceDurationMs`
- States: CRUISE, APPROACH, TERMINAL, IMPACT
- Test gap: APPROACH→IMPACT direct path (altitude drops to zero before all 4 indicators fire) and TERMINAL→CRUISE reset under RF-link-restored

**FalsePositiveGuard:**
- Operations: `evaluate()`, `reconfigure()`, `resetTemporalWindow()`, `getConfig()`
- Attributes: `temporalWindowMs`, `dopplerThresholdKmh`, `noiseSuppressionActive`
- Attribute partition (from textbook Ch. 8 OO testing):
  - Operations that READ an attribute: `getConfig()` reads `temporalWindowMs`
  - Operations that MODIFY an attribute: `reconfigure()` writes `temporalWindowMs`
  - Operations that use neither: `resetTemporalWindow()` (clears buffer, ignores `temporalWindowMs` value itself)
  - This partition catches side-effect bugs in attribute mutation

### 3.2 State Transition Diagram (STD) Breadth-First Coverage

Textbook rule: "breadth-first traversal of the state model — test one transition at a time, only use previously-tested transitions to reach new ones."

**TerminalPhaseDetector FSM — full transition matrix:**

```
CRUISE → APPROACH: speed increasing + altitude decreasing + heading stability
APPROACH → TERMINAL: RF silence + dive angle > 45° + speed > threshold
TERMINAL → IMPACT: altitude < 50m + acceleration spike
APPROACH → IMPACT: altitude drops to 0 before full TERMINAL criteria (edge case)
TERMINAL → CRUISE: RF link restored + speed drops (false alarm reset)
```

**Breadth-first test order (per textbook §8.1.2):**

```typescript
// tests/detection/FR-W7-03-terminal-phase-fsm-complete.test.ts
describe('FR-W7-STD-01: TerminalPhaseDetector FSM breadth-first coverage', () => {

  // Level 1: from initial state only
  it('BF-01: CRUISE state is the initial state', ...);

  // Level 2: transitions from CRUISE (using only BF-01 as precondition)
  it('BF-02: CRUISE → APPROACH when speed/altitude/heading criteria met', ...);
  it('BF-03: CRUISE → CRUISE self-loop on non-triggering updates', ...);
  it('BF-04: CRUISE → TERMINAL (illegal skip) is REJECTED', ...);

  // Level 3: transitions from APPROACH (using BF-02 as precondition)
  it('BF-05: APPROACH → TERMINAL when all 4 RF+speed+altitude+course criteria met', ...);
  it('BF-06: APPROACH → CRUISE revert when threat reassessed as non-terminal', ...);
  it('BF-07: APPROACH → IMPACT when altitude drops to 0 before TERMINAL criteria', ...);

  // Level 4: transitions from TERMINAL (using BF-05 as precondition)
  it('BF-08: TERMINAL → IMPACT when altitude < 50m + acceleration spike', ...);
  it('BF-09: TERMINAL → CRUISE reset when RF link restored AND speed drops', ...);
  it('BF-10: TERMINAL → APPROACH (regression) is REJECTED', ...);
  it('BF-11: IMPACT → IMPACT (idempotent, multiple evaluate() calls)', ...);

  // Timing tests (fail-operational):
  it('BF-12: INTERCEPT_ALERT emitted within 150ms of TERMINAL entry', ...);
  it('BF-13: DEGRADED_DETECTION emitted if acoustic sensor drops during TERMINAL', ...);
});
```

### 3.3 Thread-Based Integration Testing for NATS Event Flows

Ch. 8 definition: "thread-based testing integrates the set of classes required to respond to ONE input or event." For SENTINEL, the five primary event threads:

| Thread | Event | Classes Integrated | Test File |
|---|---|---|---|
| Thread-A | RF ingest | ElrsFingerprint → NodeRegistry → TdoaSolver → EKF | FR-W7-thread-A-rf-ingest.test.ts |
| Thread-B | Acoustic event | AcousticProfileLibrary → FalsePositiveGuard → MultiNodeFusion | FR-W7-thread-B-acoustic-event.test.ts |
| Thread-C | EKF update → output | EKF → MonteCarloPropagator → BRAVE1Format → Telegram | FR-W7-thread-C-ekf-to-output.test.ts |
| Thread-D | Terminal phase → actuation | TerminalPhaseDetector → JammerActivation → PTZ | FR-W7-thread-D-terminal-actuation.test.ts |
| Thread-E | Node management | NodeRegistry → MultiNodeFusion heartbeat → degraded-node exclusion | FR-W7-thread-E-node-management.test.ts |

Each thread test has a single end-to-end test with mocked boundaries at the input and output. Regression run after each thread is added.

**Client-error focus (Ch. 8 explicitly):** "integration testing attempts to find errors in the CLIENT object, not the server." For SENTINEL:

```typescript
// Client-error integration tests for cross-module call sites
describe('FR-W7-CLIENT-01: Client-error integration tests', () => {

  it('MultiNodeFusion handles MonteCarloPropagator returning null state', async () => {
    const mockPropagator = { predict: () => null };
    const fusion = new MultiNodeFusion({ propagator: mockPropagator });
    // Client (MultiNodeFusion) must handle null gracefully — not the server's test
    const result = await fusion.correlate(validSensorData);
    expect(result.status).toBe('DEGRADED');
    expect(result.error).toContain('propagator_null');
  });

  it('SentinelPipeline handles CursorOfTruth throwing on empty track store', async () => {
    const mockCursorOfTruth = { record: () => { throw new Error('empty_track_store'); } };
    const pipeline = new SentinelPipeline({ cursorOfTruth: mockCursorOfTruth });
    // Pipeline must NOT crash — it must log the failure and continue
    const result = await pipeline.processEvent(validAcousticEvent);
    expect(result.status).toBe('PARTIAL');
    expect(result.trackRecorded).toBe(false);
  });

  it('BRAVE1Format handles network timeout from transmitter', async () => {
    const mockTransmitter = { send: () => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 100)) };
    const brave1 = new BRAVE1Format({ transmitter: mockTransmitter });
    // Client (BRAVE1Format) must queue and retry — not throw
    const result = await brave1.transmit(validThreatData);
    expect(result.queued).toBe(true);
    expect(result.transmitted).toBe(false);
  });
});
```

---

## Part 4 — Regression Triage: P0/P1/P2 Classification

The textbook's 10%/25%/65% regression priority split, applied to SENTINEL's current test distribution.

### 4.1 P0 (~90 tests — build gate, every commit)

Every commit must pass these. Failure = CI block, no exceptions.

| Module | FR | Test Count | File Pattern |
|---|---|---|---|
| DatasetPipeline 16kHz gate | FR-W7-01 | ~15 | `tests/pipeline/FR-W7-01-*` |
| AcousticProfileLibrary basic classify | FR-W6-01 | ~10 | `tests/acoustic/FR-W6-01-*` |
| FalsePositiveGuard smoke | FR-W4-01 (subset) | ~12 | `tests/detection/FR-W4-01-smoke-*` |
| TerminalPhaseDetector basic FSM | FR-W7-03 | ~8 | `tests/detection/FR-W7-03-smoke-*` |
| SentinelPipeline happy path | FR-W6-sentinel | ~10 | `tests/pipeline/FR-W6-sentinel-smoke-*` |
| NATS JetStream connectivity | FR-W2-nats | ~8 | `tests/nats/FR-W2-*-smoke-*` |
| BRAVE1Format basic output | FR-W6-brave1 | ~8 | `tests/output/FR-W6-brave1-smoke-*` |
| CursorOfTruth write/read | FR-W6-cursor | ~8 | `tests/tracking/FR-W6-cursor-smoke-*` |
| TypeScript compile gate | — | 1 | `npx tsc --noEmit` |

### 4.2 P1 (~225 tests — PR merge gate)

Run on every PR merge. The core quality assurance layer.

| Module / Feature | FR | Test Count | File Pattern |
|---|---|---|---|
| YAMNet profile classification | FR-W3-04 | ~30 | `tests/acoustic/FR-W3-*` |
| FalsePositiveGuard full suite | FR-W4-01 | ~35 | `tests/detection/FR-W4-*` |
| BearingTriangulator | FR-W7-05 | ~20 | `tests/output/FR-W7-05-*` |
| ElrsFingerprint | FR-W7-04 | ~20 | `tests/rf/FR-W7-04-*` |
| MultiNodeFusion correlation | FR-W6-04 | ~25 | `tests/fusion/FR-W6-04-*` |
| EKF state estimation | FR-W5-* | ~30 | `tests/prediction/FR-W5-*` |
| EdgeDeployer RPi4/Jetson | FR-W6-edge | ~25 | `tests/edge/FR-W6-*` |
| TerminalPhaseDetector full MC/DC | FR-W7-03 | ~20 | `tests/detection/FR-W7-03-*` |
| Metamorphic relations | FR-W7-12 | ~24 | `tests/ml/FR-W7-12-*` |

### 4.3 P2 (~590 tests — nightly/wave:complete)

Run nightly and as a wave:complete gate. Includes adversarial, chaos, oracle, and property tests.

| Feature | FR | Test Count | File Pattern |
|---|---|---|---|
| Chaos engineering (CE-01 to CE-08) | CE-* | ~64 | `tests/chaos/CE-*` |
| Adversarial inputs (AT-01 to AT-06) | AT-* | ~44 | `tests/adversarial/AT-*` |
| ML oracle gates | FR-OR-01 to FR-OR-05 | ~40 | `tests/oracle/FR-OR-*` |
| Simpson's paradox audit | FR-W7-11 | ~12 | `tests/ml/FR-W7-11-*` |
| BDD journey tests | FR-W7-journey | ~30 | `tests/integration/FR-W7-journey-*` |
| Privacy + GDPR | FR-W3-privacy | ~25 | `tests/privacy/FR-W3-*` |
| Property-based tests (W8) | FR-PBT-01 | ~40 | `tests/pbt/FR-PBT-*` |
| Full wave W1–W6 baseline | FR-W1 to FR-W6 | ~335 | `tests/**/FR-W[1-6]-*` |

### 4.4 CI Configuration

```bash
# P0: every commit (< 60 seconds target)
vitest run --testPathPattern="(smoke|FR-W7-01|FR-W4-01-smoke|FR-W6-sentinel-smoke)"

# P1: PR merge gate (< 5 minutes target)
vitest run --testPathPattern="(FR-W3|FR-W4|FR-W5|FR-W6|FR-W7-03|FR-W7-04|FR-W7-05|FR-W7-12)"

# P2: nightly (no time limit — full confidence)
vitest run --coverage
npx stryker run  # mutation gate
```

Impact-criticality matrix for selection method:

| Criticality | Method |
|---|---|
| LOW | Few test cases from any priority |
| MEDIUM | All P0 + all P1 + P2 if available time |
| HIGH (16kHz migration, TerminalPhaseDetector) | All P0 + all P1 + carefully selected P2 |

The 16kHz migration is HIGH criticality — run P0 + P1 + all `tests/pipeline/FR-W7-01-*` + `tests/chaos/CE-05-*` on every commit touching DatasetPipeline.

---

## Part 5 — Defect Severity/Priority Metadata in CI

### 5.1 Four-Level Severity Scale for SENTINEL

Adapted from the textbook's 1–4 severity scale:

| Severity | Label | SENTINEL Definition | Examples |
|---|---|---|---|
| 1 | CRITICAL | Missed threat / false actuation / mission failure | Wrong sample rate (22050Hz); missing Shahed-238 profile; coordinate hardcoding; TerminalPhaseDetector all-FALSE compound condition |
| 2 | HIGH | Degraded detection / incorrect data / partial failure | FPG spectral mismatch logic error; EKF state covariance divergence; MultiNodeFusion quorum error |
| 3 | MEDIUM | Performance degradation / latency breach | Inference >100ms; NATS consumer lag > 1000 messages; memory leak in audio ring buffer |
| 4 | LOW | Cosmetic / reporting / formatting | Telegram message format; log verbosity; test fixture naming |

### 5.2 Annotating Vitest Tests with Severity Metadata

```typescript
// Pattern for severity annotation in test descriptions
describe('FR-W7-SEVERITY-01: Severity-1 defect tests', () => {

  it('[SEV-1] 22050Hz audio must throw SampleRateMismatchError — CRITICAL', async () => {
    const wrongRate = createAudioBuffer({ sampleRate: 22050, durationSec: 1.0 });
    await expect(pipeline.ingest(wrongRate)).rejects.toThrow('SampleRateMismatchError');
  });

  it('[SEV-1] Shahed-238 recall >= 0.95 at production threshold — CRITICAL', async () => {
    const recall = await computeRecall(library, pinnedDataset, 'shahed-238');
    expect(recall).toBeGreaterThanOrEqual(0.95);
  });

  it('[SEV-1] Coordinate injection must not use hardcoded 51.5/4.9 — CRITICAL', async () => {
    const output = await pipeline.processEvent(testEvent, { lat: 48.2, lon: 16.37 });
    expect(output.coordinates.lat).toBeCloseTo(48.2, 2);  // Vienna, not Netherlands default
    expect(output.coordinates.lat).not.toBeCloseTo(51.5, 1);  // MUST NOT be hardcoded
  });
});
```

### 5.3 CI Output Enrichment — Severity-Critical Failure Reporting

Add to `package.json` scripts:

```json
{
  "scripts": {
    "test:ci": "vitest run --reporter=json --outputFile=reports/test-results.json",
    "test:severity": "node scripts/severity-report.ts"
  }
}
```

`scripts/severity-report.ts` — parse test results and flag Severity-1 failures:

```typescript
// scripts/severity-report.ts
import results from '../reports/test-results.json';

const sev1Failures = results.testResults
  .flatMap(r => r.assertionResults)
  .filter(t => t.status === 'failed' && t.fullName.includes('[SEV-1]'));

if (sev1Failures.length > 0) {
  console.error(`\n[SEVERITY-1 FAILURES] ${sev1Failures.length} critical test(s) failed:`);
  sev1Failures.forEach(t => console.error(`  - ${t.fullName}`));
  process.exit(1);  // Separate exit code from general test failure for CI filtering
}
```

---

## Part 6 — mind-the-gap Integration (Textbook-Derived Additions)

Additions to `wave-formation.sh` `cmd_mind_the_gap()` based on SQA textbook findings:

### New Check: V(G) Cyclomatic Complexity Gate

```bash
echo -e "\n${CYAN}Check VG [CC]: Cyclomatic complexity on high-risk modules...${RESET}"
# Requires: npx ts-complex or eslint complexity rule
if command -v npx &>/dev/null; then
  # Check for files with estimated high complexity via line count proxy
  # (Full V(G) requires a complexity tool — install ts-complex for W7)
  HIGH_CC=$(find src/detection src/fusion src/prediction -name "*.ts" ! -name "*.test.ts" \
    -exec grep -c "if\|else\|switch\|case\|while\|for\|&&\|||" {} + 2>/dev/null \
    | awk -F: '$2 > 25 {print $1 " (est. V(G) > 20: " $2 " control points)"}')
  if [ -n "$HIGH_CC" ]; then
    echo -e "${YELLOW}[~] CC WARN — Potential high-complexity modules (manual V(G) check recommended):${RESET}"
    echo "$HIGH_CC"
    # Non-blocking: add ts-complex gate for W8
    ((pass++))
  else
    echo -e "${GREEN}[✓] CC PASS — No obviously high-complexity modules detected${RESET}"
    ((pass++))
  fi
fi
```

### New Check: Severity-1 Regression Test Presence

```bash
echo -e "\n${CYAN}Check SEV1 [DEFECT]: Severity-1 regression tests present...${RESET}"
sev1_count=$(grep -rl "\[SEV-1\]" tests/ 2>/dev/null | wc -l)
if [ "$sev1_count" -lt 3 ]; then
  echo -e "${RED}[✗] SEV1 FAIL — Only ${sev1_count}/3+ Severity-1 annotated test files${RESET}"
  echo -e "    Required: sample rate guard, coordinate injection guard, Shahed-238 recall gate"
  ((fail_count++))
else
  echo -e "${GREEN}[✓] SEV1 PASS — ${sev1_count} test files with Severity-1 annotations${RESET}"
  ((pass++))
fi
```

### New Check: DRE Tracking for 16kHz Defect Class

```bash
echo -e "\n${CYAN}Check DRE [16KHZ]: 16kHz sample rate defect class fully tested...${RESET}"
khz16_tests=$(grep -rl "16000\|SampleRateMismatchError\|16kHz\|16khz" tests/ 2>/dev/null | wc -l)
khz22_guards=$(grep -rl "22050\|toThrow.*SampleRate\|rejects.*22050" tests/ 2>/dev/null | wc -l)
if [ "$khz22_guards" -lt 2 ]; then
  echo -e "${RED}[✗] DRE FAIL — Only ${khz22_guards} tests guard against 22050Hz (DATA BREACH class)${RESET}"
  echo -e "    Must have: SampleRateMismatchError test + SAMPLE_RATE constant assertion"
  ((fail_count++))
else
  echo -e "${GREEN}[✓] DRE PASS — ${khz16_tests} 16kHz tests, ${khz22_guards} 22050Hz guard tests${RESET}"
  ((pass++))
fi
```

---

## Part 7 — BDD Test Scenarios (Gherkin/describe Format)

Converting key acceptance criteria to BDD scenarios using Vitest describe/it as Gherkin substitute. These are the scenario tests that address Mitev's "write acceptance tests immediately after requirements, before development is complete" principle.

### FR-W7-02: Gerbera Detection

```typescript
// tests/bdd/FR-W7-02-BDD-gerbera-detection.test.ts
describe('Feature: Gerbera Drone Detection (FR-W7-02)', () => {

  describe('Scenario: Gerbera detected in nominal conditions', () => {
    it('Given: AcousticProfileLibrary loaded with Gerbera profile at 16kHz', async () => {
      expect(library.hasProfile('gerbera')).toBe(true);
      expect(library.sampleRate).toBe(16000);
    });
    it('When: Gerbera acoustic signature presented at SNR >= 0dB', async () => {
      gerberaResult = await library.classify(gerberaFixture_0dB_SNR);
    });
    it('Then: droneType === "gerbera" with confidence >= 0.70', () => {
      expect(gerberaResult.droneType).toBe('gerbera');
      expect(gerberaResult.confidence).toBeGreaterThanOrEqual(0.70);
    });
  });

  describe('Scenario: Gerbera not confused with Shahed-136 (piston vs. piston)', () => {
    it('Given: Shahed-136 acoustic sample presented', async () => {
      shahedResult = await library.classify(shahed136Fixture);
    });
    it('Then: classified as shahed-136, NOT gerbera', () => {
      expect(shahedResult.droneType).toBe('shahed-136');
      expect(shahedResult.droneType).not.toBe('gerbera');
    });
  });
});
```

### FR-W7-06: Jammer Activation

```typescript
// tests/bdd/FR-W7-06-BDD-jammer-activation.test.ts
describe('Feature: RF Jammer Activation (FR-W7-06)', () => {

  describe('Scenario: Jammer activated on confirmed hostile threat', () => {
    it('Given: TerminalPhaseDetector has entered TERMINAL state', ...);
    it('And: ThreatClassifier confirms droneType is in hostile category', ...);
    it('When: JammerActivation.activate() is called', ...);
    it('Then: jammer command published to NATS within 100ms', ...);
    it('And: CursorOfTruth logs activation event with operator ID', ...);
  });

  describe('Scenario: Jammer NOT activated on civilian FPV (FalsePositiveGuard)', () => {
    it('Given: FalsePositiveGuard returns SUPPRESS for civilian FPV confidence', ...);
    it('When: actuation pathway is evaluated', ...);
    it('Then: no jammer command is issued', ...);
    it('And: reason "fpg_suppress" is logged to CursorOfTruth', ...);
  });

  describe('Scenario: Human confirmation required before activation', () => {
    it('Given: threat classification is HOSTILE', ...);
    it('When: JammerActivation.activate() is called without operator_id', ...);
    it('Then: activation is rejected with OperatorConfirmationRequired error', ...);
  });
});
```

### FR-W7-15: TerminalPhaseDetector (Full BDD Coverage)

```typescript
// tests/bdd/FR-W7-15-BDD-terminal-phase.test.ts
describe('Feature: Terminal Phase Detection (FR-W7-15)', () => {

  describe('Scenario: Nominal Shahed-238 terminal dive detection', () => {
    it('Given: system tracking Shahed-238 in APPROACH state', ...);
    it('And: all 4 sensors (speed, RF, course, altitude) are active', ...);
    it('When: RF link drops AND speed > 250 km/h AND altitude < 200m AND course toward threat', ...);
    it('Then: TerminalPhaseDetector transitions to TERMINAL within 150ms', ...);
    it('And: INTERCEPT_ALERT emitted to NATS', ...);
    it('And: PTZ slew-to-cue command generated within 200ms', ...);
  });

  describe('Scenario: TerminalPhaseDetector fail-operational under acoustic failure', () => {
    it('Given: acoustic sensor has failed (ACOUSTIC_LAYER_DEGRADED state)', ...);
    it('When: RF fingerprint and EKF track both confirm terminal indicators', ...);
    it('Then: RF_TERMINAL_DEGRADED alert is emitted (not silence)', ...);
    it('And: system does NOT enter false all-clear state', ...);
  });

  describe('Scenario: RF silence from civilian FPV battery-saver mode', () => {
    it('Given: consumer FPV drone hovering at 50m, speed < 20 km/h', ...);
    it('When: FPV operator enables battery-saver, RF link drops', ...);
    it('Then: TerminalPhaseDetector stays in CRUISE (speed threshold not met)', ...);
    it('And: no actuation command is generated', ...);
  });
});
```

---

## Appendix — Full Technique Inventory (All 4 Chunks)

### SQA-TESTING-CHUNK-1 (Chapters 1–3: QA Fundamentals, Quality Models, Reviews)

| Technique | Chapter | SENTINEL Module | Status |
|---|---|---|---|
| Cost of Quality (Prevention/Appraisal/Failure) | Ch.1 | All modules — framework | Conceptual — apply per wave |
| McCall's quality factors | Ch.1 | 11 factors mapped in Part 1 | Framework for test prioritisation |
| DRE tracking | Ch.1 | 16kHz defect class | mind-the-gap Check DRE (new) |
| Defect severity 1–4 | Ch.2 | [SEV-1] annotation pattern | Part 5 — to implement |
| SQA activities catalogue (7 SEI activities) | Ch.1 | V&V planning, config management | Wave-formation process |
| Formal inspection (6-stage process) | Ch.3 | Code review gates | Model checkpoint review |

### SQA-TESTING-CHUNK-2 (Chapters 4–5: Testing Techniques, Coverage Criteria)

| Technique | Chapter | SENTINEL Module | Status |
|---|---|---|---|
| ECP (Equivalence Class Partitioning) | Ch.4 | Audio input validation | Part 2.1 — concrete classes defined |
| BVA (Boundary Value Analysis) | Ch.4 | FPG confidence thresholds | Part 2.2 — 6-point pattern |
| Decision table testing | Ch.5 | FalsePositiveGuard 4-condition | Part 2.3 — 6-rule table |
| MC/DC (Multiple Condition Coverage) | Ch.5 | TerminalPhaseDetector compound | Part 2.4 — 8 test pairs |
| Mutation testing (defect seeding) | Ch.5 | FPG, YAMNet, AcousticLib | Part 3 — Stryker config |
| Path coverage + V(G) | Ch.5/7 | Key modules | mind-the-gap Check VG |
| State-based testing | Ch.5 | TerminalPhaseDetector FSM | Part 3.2 — STD breadth-first |
| Error guessing | Ch.4 | NaN/Infinity/empty buffer | Added to BVA sections |

### SQA-TESTING-CHUNK-3 (Chapters 6–7: Test Management, Automation, Performance, Regression)

| Technique | Chapter | SENTINEL Module | Status |
|---|---|---|---|
| Regression P0/P1/P2 classification | Ch.6 | All 906 tests | Part 4 — full triage table |
| Performance: throughput saturation point | Ch.6 | Inference pipeline | Stage-level latency decomposition |
| Endurance/longevity testing | Ch.6 | Acoustic ring buffer + NATS | 8h loop test — to add |
| Stress testing (10× interrupt rate) | Ch.6 | SentinelPipeline burst | Chaos CE-07 analog |
| Zero-volume testing | Ch.6 | Silence/flat-spectrum audio | MR-SILENCE metamorphic |
| Thread-based integration | Ch.8 | NATS event threads A–E | Part 3.3 — 5 threads defined |
| V(G) cyclomatic complexity gate | Ch.7 | FPG, TerminalPhaseDetector | mind-the-gap Check VG (new) |
| Sandwich integration strategy | Ch.6 | SentinelPipeline ↔ AcousticLib | Applied in journey tests |
| Data-flow anomaly analysis | Ch.7 | Coordinate injection (W7) | Static analysis on coord refactor |

### SQA-TESTING-CHUNK-4 (Chapter 8: OO Testing, Web Testing, CAST Tools)

| Technique | Chapter | SENTINEL Module | Status |
|---|---|---|---|
| Class state testing (all ops, attrs, states) | Ch.8 §8.1 | AcousticProfileLibrary, FPG, TerminalPhaseDetector | Part 3.1 — gap analysis |
| STD breadth-first traversal | Ch.8 | TerminalPhaseDetector FSM | Part 3.2 — BF-01 to BF-13 |
| Attribute-based partition testing | Ch.8 | FalsePositiveGuard | Part 3.1 — read/modify/neither |
| Thread-based integration testing | Ch.8 | NATS event threads | Part 3.3 — 5 threads |
| Use-based integration (independent → dependent) | Ch.8 | AcousticLib → FPG → MultiNodeFusion → SentinelPipeline | Integration layer order |
| Client-error focus in integration | Ch.8 | MultiNodeFusion calling MonteCarloPropagator | Part 3.3 — FR-W7-CLIENT-01 |
| Minimum behavioral life history | Ch.8 | SentinelPipeline | Operation sequence random permutations |
| Fault-based testing with taxonomy | Ch.8 | FPG boundary, EKF covariance, TDOA spoofing | tests/adversarial/ — FR-FAULT-01 to add |
| Metamorphic relations (from AI book, gap identified) | — | YAMNet, AcousticLib | tests/ml/FR-W7-12-* — port from apex-os-core |
