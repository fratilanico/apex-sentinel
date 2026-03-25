# AI Testing Book — Implementation Plan for APEX-SENTINEL W7
# Source: "Artificial Intelligence and Software Testing" (BCS, 2022)
# Author: REVIEWER 2 | Date: 2026-03-25

---

## 1. Executive Summary

The BCS 2022 book on AI testing introduced three core arguments that directly apply to APEX-SENTINEL:

**1. Aggregate coverage metrics lie in ML systems.** An 80% branch coverage number tells you nothing about per-class recall. A classifier that achieves 99% accuracy by always predicting the majority class would pass every conventional coverage gate. For a threat-detection system where a missed Shahed-238 = failed intercept, this is unacceptable. The fix is per-profile precision/recall gates as first-class CI requirements, not post-hoc reports.

**2. ML classifiers need metamorphic oracles because ground truth is unavailable at test time.** You cannot assert `expect(classify(audio)).toBe('shahed-136')` without a pre-labelled ground truth corpus — and you certainly cannot do that in a unit test. What you CAN assert is a set of relations: noise-added audio should give the same or lower confidence (not higher), louder audio at same SNR should give the same label, silence should give no detections. These are Metamorphic Relations (MRs). They replace the missing oracle.

**3. Operational robustness requires chaos and adversarial tests.** Hardware fails. Models encounter distribution-shifted inputs. An adversarial bird call near Shahed resonance frequency should suppress — not trigger — a CRITICAL alert. These failure modes are not found by unit tests against synthetic fixtures. They require deliberate chaos injection (CE-01 to CE-08) and adversarial pattern testing (AT-01 to AT-06).

**Net impact on W7:** 4 new functional requirements (FR-W7-11 through FR-W7-14), 13 new test files, and updated coverage gate policy in CI.

---

## 2. Oracle Gap Analysis

The following W7 FRs have no conventional assertion oracle — the expected output of the classifier cannot be pre-computed in a unit test context:

| FR | Component | Oracle Gap | Resolution |
|---|---|---|---|
| FR-W7-02 | AcousticProfileLibrary v2 | Cannot assert correct classification of novel profiles without a labelled corpus | MR-04, MR-06, MR-12 (profile separation + silence) |
| FR-W7-07 | JammerActivation | Cannot assert correct suppression vs. activation without knowing ground truth | FalsePositiveGuardV2 + suppressionImmune flag (DD2) |
| FR-W7-09 | SentinelPipelineV2 | End-to-end classification oracle requires full audio corpus | MR-01, MR-03, MR-10 (noise, SNR, sample rate invariance) |

These gaps are closed by the Metamorphic Relations test suite (FR-W7-12) and the consistency oracle snapshot approach.

---

## 3. New Test Files Required

### 3.1 Test Helper Infrastructure

| File | Purpose |
|---|---|
| `tests/helpers/synthetic-audio-factory.ts` | Generates synthetic audio waveforms for metamorphic inputs: pure tones, piston drone simulations, turbine simulations, silence, additive noise, chirps |
| `tests/helpers/elrs-signal-factory.ts` | Already specified in TEST_STRATEGY §5.4 — confirm it exists |
| `tests/helpers/consistency-oracle-snapshot.json` | Baseline classification snapshots for regression oracle |

### 3.2 ML Testing Extensions

| File | FR | Test Count |
|---|---|---|
| `tests/ml/consistency-oracle.test.ts` | FR-W7-12 | 18 |
| `tests/ml/FR-W7-11-simpsons-paradox-audit.test.ts` | FR-W7-11 | 12 |
| `tests/ml/FR-W7-12-metamorphic-relations.test.ts` | FR-W7-12 | 24 |

### 3.3 Adversarial Test Files

| File | AT # | Description | Test Count |
|---|---|---|---|
| `tests/adversarial/AT-01-near-boundary-frequency.test.ts` | AT-01 | Inputs at classification boundary (e.g. 1999Hz vs 2001Hz routing threshold) | 8 |
| `tests/adversarial/AT-02-adversarial-bird-call.test.ts` | AT-02 | Bird calls with harmonics near Shahed piston fundamental (300–400Hz) — must not trigger CRITICAL | 6 |
| `tests/adversarial/AT-03-replay-attack.test.ts` | AT-03 | Repeated identical audio segments — FalsePositiveGuard must detect correlation and suppress after N occurrences | 6 |
| `tests/adversarial/AT-04-spectral-masking.test.ts` | AT-04 | High-amplitude noise injected at exact profile frequencies to mask target signal | 8 |
| `tests/adversarial/AT-05-sample-rate-confusion.test.ts` | AT-05 | 22050Hz audio passed as 16kHz — must be caught by SampleRateMismatchError, not silently misclassified | 6 |
| `tests/adversarial/AT-06-model-boundary-probing.test.ts` | AT-06 | Gradual frequency sweep across turbine/piston boundary — confirms classifier is not brittle at exact 2000Hz | 10 |

### 3.4 Chaos Engineering Test Files

| File | CE # | Description | Test Count |
|---|---|---|---|
| `tests/chaos/CE-01-node-failure-mid-triangulation.test.ts` | CE-01 | Node drops out mid-sequence during BearingTriangulator — result degrades gracefully, does not throw | 8 |
| `tests/chaos/CE-02-nats-partition.test.ts` | CE-02 | NATS connection drops for 5s — pipeline queues messages, delivers on reconnect without data loss | 6 |
| `tests/chaos/CE-03-clock-skew.test.ts` | CE-03 | Node timestamps diverge by 200ms — TDOA solver detects inconsistency, flags result as DEGRADED | 8 |
| `tests/chaos/CE-04-model-load-failure.test.ts` | CE-04 | ONNX model file missing or corrupt — EdgeDeployer falls back to YAMNetSurrogate, logs warning | 6 |
| `tests/chaos/CE-05-sample-rate-drift.test.ts` | CE-05 | Audio input drifts from 16000Hz to 16050Hz over 60s (ADC clock drift) — pipeline detects and warns | 6 |
| `tests/chaos/CE-06-hardware-divergence-regression.test.ts` | CE-06 | EdgeDeployer produces different spectrogram on RPi4 vs Jetson for identical input — regression gate catches delta > 0.001 | 8 |
| `tests/chaos/CE-07-memory-pressure.test.ts` | CE-07 | Audio ring buffer under memory pressure — oldest frames dropped cleanly, no segfault simulation | 6 |
| `tests/chaos/CE-08-concept-drift-detection.test.ts` | CE-08 | Input audio distribution shifts over time (simulated seasonal/operational change) — drift detector raises alert when KL divergence exceeds threshold | 10 |

### 3.5 Data Pipeline Tests (16kHz migration)

These are already covered by FR-W7-01 (`tests/pipeline/FR-W7-01-dataset-16khz.test.ts`). The following 10 additional data quality tests are added to FR-W7-11:

```
1. Wild Hornets baseline: dataset contains >= 3000 field recordings at 16kHz
2. Gerbera profile: minimum 200 labelled samples
3. Shahed-131 profile: minimum 200 labelled samples
4. Shahed-238 profile: minimum 200 labelled samples (turbine — jet engine 3-8kHz energy)
5. All samples pass SNR >= 6dB gate
6. No duplicate hashes in training set (deduplication)
7. Train/val/test split is stratified by drone class (class imbalance check)
8. Val set has minimum 50 samples per class
9. Dataset datasheet completeness check (Gebru et al. — all 7 fields present)
10. No samples with sampleRate != 16000 in any split
```

---

## 4. Metamorphic Relations — Full Specification

### MR Definition Format

Each MR defines a source test input S, a follow-up input S', a transformation T, and the expected output relation R(f(S), f(S')).

### Priority MRs for W7

**MR-01 — Additive Noise Invariance (FR-W7-09)**
- S: Clean audio of Shahed-136 piston signature
- T: Add white noise at SNR=20dB
- S': Noisy version of same audio
- R: `f(S').label === f(S).label` AND `f(S').confidence <= f(S).confidence`
- Vitest skeleton:
```typescript
describe('MR-01: Additive Noise — label preserved, confidence non-increasing', () => {
  it('shahed-136 label preserved at SNR=20dB noise addition', async () => {
    const clean = SyntheticAudioFactory.pistonDrone({ freqHz: 280, durationMs: 975 });
    const noisy = SyntheticAudioFactory.addNoise(clean, { snrDb: 20 });
    const rClean = await classifier.classify(clean);
    const rNoisy = await classifier.classify(noisy);
    expect(rNoisy.label).toBe(rClean.label);
    expect(rNoisy.confidence).toBeLessThanOrEqual(rClean.confidence + 0.01);
  });
});
```

**MR-03 — SNR Monotonicity (FR-W7-09)**
- S: Audio at SNR=30dB
- T: Decrease SNR to 10dB
- R: `f(S').confidence <= f(S).confidence`
- Direction: confidence must not increase as signal quality degrades

**MR-04 — Profile Separation (FR-W7-02)**
- S: Gerbera audio (200–600Hz piston)
- S': Shahed-238 audio (3000–8000Hz turbine)
- R: `f(S).label !== f(S').label` (must not confuse piston and turbine)

**MR-06 — Silence Oracle (FR-W7-02, FR-W7-09)**
- S: Any target audio
- T: Replace all samples with zeros
- R: `f(S').detectionCount === 0` AND `f(S').label === 'silence'`
- This is the most important sanity check: silence must never produce a detection.

**MR-10 — Sample Rate Boundary (FR-W7-01)**
- S: Audio at exactly 16000Hz
- T: Resample to 22050Hz, attempt classification without resampling back
- R: `f(S')` throws `SampleRateMismatchError` — no silent misclassification

**MR-12 — Temporal Consistency (FR-W7-02)**
- S: 1-second audio segment T[0:1]
- S': Subsequent 1-second segment T[1:2] from same continuous recording
- T: Both processed independently
- R: Labels should be consistent (Shahed-136 does not become Gerbera mid-flight); allow ±1 label change over 5 consecutive windows before flagging inconsistency

### Remaining MRs (lower priority, implement after P0-P1)

| MR | Name | Transformation | Relation |
|---|---|---|---|
| MR-02 | Amplitude Scaling | Scale amplitude ×0.5 | Same label, confidence within ±0.05 |
| MR-05 | Channel Permutation | Swap left/right on stereo input | Same label (symmetric) |
| MR-07 | Pitch Shift | ±100 cents | Same label for profiles with wide freq range |
| MR-08 | Time Stretch | ±10% | Same label (drone RPM varies ±10% in flight) |
| MR-09 | Overlap Addition | Two simultaneous drone audio streams | At least one detection per source present |
| MR-11 | Doppler Simulation | Shift fundamental freq ±3% for approaching drone | Same label as static target |

---

## 5. Per-Profile Acceptance Thresholds (FR-W7-11)

These gates are **CI blockers** — W7 cannot be marked complete unless all pass. They supplement, not replace, the 80% aggregate coverage gate.

| Profile | Recall Gate | FNR Ceiling | Precision Floor | Notes |
|---|---|---|---|---|
| shahed-238 | Recall ≥ 0.97 | FNR ≤ 0.03 | Precision ≥ 0.80 | Turbine = highest damage class. Asymmetric: FN cost >> FP cost |
| shahed-136 | Recall ≥ 0.95 | FNR ≤ 0.05 | Precision ≥ 0.82 | Primary loitering munition threat |
| shahed-131 | Recall ≥ 0.95 | FNR ≤ 0.05 | Precision ≥ 0.80 | Higher RPM piston variant |
| gerbera | Recall ≥ 0.93 | FNR ≤ 0.07 | Precision ≥ 0.85 | Distinct piston band, lower strategic priority |
| fpv-quad | Recall ≥ 0.90 | FNR ≤ 0.10 | Precision ≥ 0.88 | Lower damage class, higher FP tolerance |

**FalsePositiveGuardV2 interface change required:**

```typescript
export interface FPGuardDecision {
  suppress: boolean;
  suppressionImmune: boolean;  // NEW: shahed-238 bypasses suppression even at borderline confidence
  reason?: 'false-positive' | 'low-confidence' | 'already-active' | 'immune-override';
}

// shahed-238 is suppressionImmune = true because FN cost is existential
function isSuppresionImmune(droneClass: string): boolean {
  return droneClass === 'shahed-238';
}
```

### Simpson's Paradox Tests (4 required for FR-W7-11)

Simpson's Paradox occurs when aggregate recall appears acceptable but one subgroup (e.g. night-time recordings, specific terrain) has catastrophically low recall masked by high recall elsewhere.

```typescript
describe('FR-W7-11: Simpson\'s Paradox Audit', () => {
  it('shahed-238 recall is >= 0.97 on daytime recordings alone', async () => { /* ... */ });
  it('shahed-238 recall is >= 0.97 on nighttime recordings alone', async () => { /* ... */ });
  it('shahed-238 recall is >= 0.97 on urban acoustic background', async () => { /* ... */ });
  it('shahed-238 recall is >= 0.97 on rural/open-field background', async () => { /* ... */ });
});
```

---

## 6. SyntheticAudioFactory — Interface Specification

Path: `tests/helpers/synthetic-audio-factory.ts`

```typescript
export interface SyntheticAudioOptions {
  durationMs: number;
  sampleRateHz?: number;  // default 16000
  amplitudeDb?: number;   // default -12 dBFS
}

export interface PistonDroneOptions extends SyntheticAudioOptions {
  fundamentalFreqHz: number;    // e.g. 280 for shahed-136
  harmonics?: number[];         // multipliers, e.g. [1, 2, 3] for first 3 harmonics
  rpmJitter?: number;           // ±Hz variation to simulate RPM fluctuation
}

export interface TurbineDroneOptions extends SyntheticAudioOptions {
  spectralCentroidHz: number;   // e.g. 5000 for shahed-238
  bandwidthHz: number;          // turbine broadband width
}

export class SyntheticAudioFactory {
  static silence(opts: SyntheticAudioOptions): Float32Array;
  static pistonDrone(opts: PistonDroneOptions): Float32Array;
  static turbineDrone(opts: TurbineDroneOptions): Float32Array;
  static addNoise(audio: Float32Array, opts: { snrDb: number }): Float32Array;
  static addWhiteNoise(audio: Float32Array, amplitude: number): Float32Array;
  static concatenate(segments: Float32Array[]): Float32Array;
  static mix(a: Float32Array, b: Float32Array, ratio?: number): Float32Array;
  static resample(audio: Float32Array, fromHz: number, toHz: number): Float32Array;
  static generateChirp(fromHz: number, toHz: number, opts: SyntheticAudioOptions): Float32Array;
}
```

---

## 7. Consistency Oracle — Design

Path: `tests/ml/consistency-oracle.test.ts`

The consistency oracle maintains a snapshot JSON of expected outputs for a canonical set of synthetic audio inputs. On each CI run, the oracle re-runs all inputs and compares against the snapshot. Any regression (label flip or confidence delta > 0.05) fails the build.

```typescript
// tests/helpers/consistency-oracle-snapshot.json (generated, committed)
{
  "version": "W7.0",
  "generated": "2026-03-25",
  "entries": [
    {
      "id": "shahed136-clean-280hz",
      "inputDescription": "Piston 280Hz, -12dBFS, 975ms, 16kHz",
      "expectedLabel": "shahed-136",
      "expectedConfidenceMin": 0.85,
      "expectedConfidenceMax": 1.0
    },
    {
      "id": "shahed238-turbine-5000hz",
      "inputDescription": "Turbine broadband 3-8kHz, -12dBFS, 975ms, 16kHz",
      "expectedLabel": "shahed-238",
      "expectedConfidenceMin": 0.87,
      "expectedConfidenceMax": 1.0
    },
    {
      "id": "silence-975ms",
      "inputDescription": "All-zero signal, 975ms, 16kHz",
      "expectedLabel": "silence",
      "expectedConfidenceMin": 0.99,
      "expectedConfidenceMax": 1.0
    }
    // ... 15+ entries total
  ]
}
```

```typescript
describe('Consistency Oracle — classification regression gate', () => {
  const snapshot = loadSnapshot('tests/helpers/consistency-oracle-snapshot.json');

  for (const entry of snapshot.entries) {
    it(`[${entry.id}] label and confidence within snapshot bounds`, async () => {
      const audio = SyntheticAudioFactory.fromDescription(entry.inputDescription);
      const result = await classifier.classify(audio);
      expect(result.label).toBe(entry.expectedLabel);
      expect(result.confidence).toBeGreaterThanOrEqual(entry.expectedConfidenceMin);
      expect(result.confidence).toBeLessThanOrEqual(entry.expectedConfidenceMax);
    });
  }
});
```

---

## 8. Concept Drift Detection Harness

Path: `tests/chaos/CE-08-concept-drift-detection.test.ts`

The drift detector monitors KL divergence between the current 7-day rolling input distribution and the training distribution baseline.

```typescript
// src/ml/drift-detector.ts interface
export interface DriftDetectorConfig {
  klDivergenceThreshold: number;  // default 0.15
  windowDays: number;             // default 7
  alertChannel: 'nats' | 'telegram';
}

export class ConceptDriftDetector {
  ingest(embedding: Float32Array): void;
  getKLDivergence(): number;
  isDriftDetected(): boolean;
  getAlert(): DriftAlert | null;
}
```

CE-08 test:
```typescript
it('raises drift alert when KL divergence exceeds threshold', () => {
  const detector = new ConceptDriftDetector({ klDivergenceThreshold: 0.15, windowDays: 7 });
  const baseline = generateBaselineDistribution('shahed-136');
  for (let i = 0; i < 1000; i++) detector.ingest(baseline.sample());
  // Now inject shifted distribution (different acoustic environment)
  const shifted = generateShiftedDistribution('shahed-136', { centroidShiftHz: 40 });
  for (let i = 0; i < 1000; i++) detector.ingest(shifted.sample());
  expect(detector.isDriftDetected()).toBe(true);
  expect(detector.getKLDivergence()).toBeGreaterThan(0.15);
});
```

---

## 9. EdgeDeployer Hardware Divergence Gate (CE-06)

The critical fix from DD3: RPi4 and Jetson may produce slightly different spectrograms for the same input due to floating point implementation differences (ARM NEON vs Jetson CUDA). The regression gate asserts the delta is within tolerance.

```typescript
describe('CE-06: EdgeDeployer Hardware Divergence Regression Gate', () => {
  it('RPi4 spectrogram output differs from Jetson by < 0.001 L2 norm', () => {
    const audio = SyntheticAudioFactory.pistonDrone({ fundamentalFreqHz: 280, durationMs: 975 });
    const rpi4Result = mockRPi4Deployer.computeSpectrogram(audio);
    const jetsonResult = mockJetsonDeployer.computeSpectrogram(audio);
    const l2Delta = computeL2Norm(rpi4Result, jetsonResult);
    expect(l2Delta).toBeLessThan(0.001);
  });

  it('classification label is identical across RPi4 and Jetson for canonical inputs', () => {
    const canonicalInputs = ConsistencyOracle.getCanonicalInputs();
    for (const input of canonicalInputs) {
      const rpi4Label = mockRPi4Deployer.classify(input.audio);
      const jetsonLabel = mockJetsonDeployer.classify(input.audio);
      expect(rpi4Label).toBe(jetsonLabel);
    }
  });
});
```

---

## 10. SpectralAnalysis energyBands Fix (Critical — DD3)

The current `SpectralAnalysis.energyBands` definition is missing the turbine band. This must be added before FR-W7-02 tests can pass:

```typescript
// src/ml/spectral-analysis.ts — CURRENT (W6, DEFECTIVE for shahed-238)
const ENERGY_BANDS = {
  sub_bass: [20, 60],
  bass: [60, 250],
  piston_low: [80, 400],
  piston_high: [400, 1200],
};

// REQUIRED (W7)
const ENERGY_BANDS = {
  sub_bass: [20, 60],
  bass: [60, 250],
  piston_low: [80, 400],
  piston_high: [400, 1200],
  turbine: [3000, 8000],   // ADD THIS — shahed-238 jet engine, micro-turbine KJ66 class
};
```

This fix is required for `matchFrequency(3000, 8000)` to return `shahed-238` as per FR-W7-02 AC-04.

---

## 11. New FR Definitions

### FR-W7-11: Per-Profile Metrics Gate (Simpson's Paradox Prevention)

**Rationale:** Aggregate recall hides per-class failures. A classifier achieving 95% aggregate recall on a balanced test set may have 70% recall on shahed-238 (masked by 99% recall on easier classes). This is the statistical Simpson's Paradox. The fix is mandatory per-profile recall gates in CI.

**Acceptance Criteria:**
- AC-01: CI pipeline runs per-profile precision/recall computation on the W7 evaluation set
- AC-02: shahed-238 recall >= 0.97 (FNR <= 0.03) — build fails if not met
- AC-03: shahed-136 recall >= 0.95 — build fails if not met
- AC-04: shahed-131 recall >= 0.95 — build fails if not met
- AC-05: gerbera recall >= 0.93 — build fails if not met
- AC-06: fpv-quad recall >= 0.90 — build fails if not met
- AC-07: Simpson's Paradox audit: per-subgroup recall computed for day/night/urban/rural splits
- AC-08: Dataset datasheet (Gebru et al.) present and complete for all W7 training data
- AC-09: FalsePositiveGuardV2 implements `suppressionImmune` flag for shahed-238
- AC-10: Wild Hornets dataset >= 3000 samples at 16kHz present in training corpus

**Test file:** `tests/ml/FR-W7-11-simpsons-paradox-audit.test.ts`
**Test count:** 12

---

### FR-W7-12: Metamorphic Relations Test Suite

**Rationale:** Classification-level oracle gap: for new profiles (gerbera, shahed-131, shahed-238) there is no pre-labelled ground truth usable in unit tests. Metamorphic testing provides oracle-free verification by testing input-output relations rather than expected outputs.

**Acceptance Criteria:**
- AC-01: MR-01 (noise invariance): label preserved at SNR >= 20dB; confidence non-increasing
- AC-02: MR-03 (SNR monotonicity): confidence decreases as SNR decreases from 30dB to 10dB
- AC-03: MR-04 (profile separation): gerbera (200–600Hz) and shahed-238 (3000–8000Hz) never receive same label
- AC-04: MR-06 (silence oracle): all-zero input produces zero detections and label='silence'
- AC-05: MR-10 (sample rate boundary): 22050Hz audio passed as 16kHz → SampleRateMismatchError (not silent misclassification)
- AC-06: MR-12 (temporal consistency): label stable across consecutive 975ms windows of continuous drone recording
- AC-07: MR-02, MR-05, MR-07, MR-08 implemented (lower priority, see §4)
- AC-08: Consistency oracle snapshot committed to repo; any regression (label flip or confidence delta > 0.05) fails CI
- AC-09: SyntheticAudioFactory helper available at `tests/helpers/synthetic-audio-factory.ts`
- AC-10: All MR tests use FR-named describe blocks per naming convention

**Test files:**
- `tests/ml/FR-W7-12-metamorphic-relations.test.ts` — 24 tests
- `tests/ml/consistency-oracle.test.ts` — 18 tests

---

### FR-W7-13: Adversarial Robustness Suite

**Rationale:** Real-world acoustic environments contain adversarial-like inputs: birds with harmonics near piston fundamentals, urban machinery overlapping Shahed frequency bands, deliberate acoustic spoofing. The system must suppress (not trigger on) these inputs, and must not be brittle at classification boundaries.

**Acceptance Criteria:**
- AC-01: AT-01 (boundary frequency): inputs at freqHz=1999 and freqHz=2001 route to correct branch (piston/turbine)
- AC-02: AT-02 (bird call): bird calls with harmonics in 300–400Hz range do not trigger CRITICAL alert
- AC-03: AT-03 (replay attack): identical audio segment repeated >3 times in <10s → FalsePositiveGuard suppresses after first 2 activations
- AC-04: AT-04 (spectral masking): classification degrades gracefully (confidence drop, not wrong label) when target frequency is masked by high-amplitude noise
- AC-05: AT-05 (sample rate confusion): 22050Hz audio rejected with typed error before reaching classifier
- AC-06: AT-06 (boundary probing): frequency sweep 1000–3000Hz does not produce erratic label flips (at most 1 transition at 2000Hz boundary)
- AC-07: No adversarial test input causes an unhandled exception (all failures are typed errors or graceful degradation)

**Test files:**
- `tests/adversarial/AT-01-near-boundary-frequency.test.ts` — 8 tests
- `tests/adversarial/AT-02-adversarial-bird-call.test.ts` — 6 tests
- `tests/adversarial/AT-03-replay-attack.test.ts` — 6 tests
- `tests/adversarial/AT-04-spectral-masking.test.ts` — 8 tests
- `tests/adversarial/AT-05-sample-rate-confusion.test.ts` — 6 tests
- `tests/adversarial/AT-06-model-boundary-probing.test.ts` — 10 tests

**Total:** 44 tests

---

### FR-W7-14: Chaos Engineering Gates

**Rationale:** Hardware fails in the field. NATS partitions. Clocks drift. Models corrupt. The system must degrade gracefully — continuing to operate in reduced capacity — rather than crashing the pipeline. Chaos tests inject these failures deliberately and assert on graceful degradation, not on ideal-case behaviour.

**Acceptance Criteria:**
- AC-01: CE-01 (node failure): BearingTriangulator continues with n-1 nodes; marks result as DEGRADED
- AC-02: CE-02 (NATS partition): pipeline queues up to 100 events during partition; delivers all on reconnect
- AC-03: CE-03 (clock skew): TdoaSolver detects timestamp divergence > 200ms; flags DEGRADED, does not produce corrupted position
- AC-04: CE-04 (model failure): EdgeDeployer falls back to YAMNetSurrogate on ONNX load failure; logs WARNING
- AC-05: CE-05 (sample rate drift): DatasetPipelineV2 detects sampleRate drift > 0.5%; raises DriftWarning
- AC-06: CE-06 (hardware divergence): RPi4 vs Jetson spectrogram delta < 0.001 L2 norm for canonical inputs
- AC-07: CE-07 (memory pressure): ring buffer drops oldest frames cleanly; no OOM error propagation
- AC-08: CE-08 (concept drift): ConceptDriftDetector raises alert when KL divergence > 0.15 over 7-day window

**Test files:**
- `tests/chaos/CE-01-node-failure-mid-triangulation.test.ts` — 8 tests
- `tests/chaos/CE-02-nats-partition.test.ts` — 6 tests
- `tests/chaos/CE-03-clock-skew.test.ts` — 8 tests
- `tests/chaos/CE-04-model-load-failure.test.ts` — 6 tests
- `tests/chaos/CE-05-sample-rate-drift.test.ts` — 6 tests
- `tests/chaos/CE-06-hardware-divergence-regression.test.ts` — 8 tests
- `tests/chaos/CE-07-memory-pressure.test.ts` — 6 tests
- `tests/chaos/CE-08-concept-drift-detection.test.ts` — 10 tests

**Total:** 58 tests

---

## 12. Implementation Priority Order

### P0 — Blockers (must complete before any W7 execute phase)

1. `tests/helpers/synthetic-audio-factory.ts` — all other ML tests depend on it
2. `SpectralAnalysis.energyBands` turbine fix — blocks FR-W7-02 AC-04
3. `FalsePositiveGuardV2` suppressionImmune interface — blocks FR-W7-11 AC-09
4. MR-06 (silence oracle) — fastest oracle gap closure, 2 tests
5. MR-04 (profile separation) — confirms gerbera/shahed-238 routing correct
6. MR-10 (sample rate boundary) — confirms 16kHz migration correctness

### P1 — High priority (complete during execute phase)

7. `tests/ml/consistency-oracle.test.ts` + snapshot generation
8. `tests/ml/FR-W7-11-simpsons-paradox-audit.test.ts`
9. `tests/ml/FR-W7-12-metamorphic-relations.test.ts` (MR-01, MR-03, MR-12)
10. AT-02 (bird call adversarial) — highest real-world relevance
11. AT-05 (sample rate confusion) — closes data breach risk
12. CE-04 (model load failure) — most likely field failure mode
13. CE-06 (hardware divergence) — RPi4/Jetson regression gate

### P2 — Complete before checkpoint

14. AT-01, AT-03, AT-04, AT-06 (remaining adversarial)
15. CE-01, CE-02, CE-03 (node/NATS/clock chaos)
16. MR-02, MR-05, MR-07, MR-08, MR-09, MR-11 (secondary MRs)
17. CE-05, CE-07, CE-08 (secondary chaos)

---

## 13. Updated Test Count Summary

| Category | Files | Tests |
|---|---|---|
| W7 FRs already in TEST_STRATEGY (FR-W7-01 to FR-W7-10) | 10 | 121 |
| FR-W7-11: Per-Profile Metrics Gate | 1 | 12 |
| FR-W7-12: Metamorphic Relations + Consistency Oracle | 2 | 42 |
| FR-W7-13: Adversarial Robustness | 6 | 44 |
| FR-W7-14: Chaos Engineering | 8 | 58 |
| **W7 ML Extensions Total** | **17** | **156** |
| **W7 Grand Total** | **27** | **277** |
| **Cumulative (629 + 277)** | | **906** |

---

## 14. Dataset Quality Scoring Framework (Gebru et al. Datasheets)

All W7 training data must have a completed datasheet covering:

1. **Motivation** — why was this data collected? Who funded it?
2. **Composition** — what does it contain? Class distribution? Known imbalances?
3. **Collection process** — how was it recorded? Hardware? Location? Time of day?
4. **Preprocessing** — what cleaning/resampling was applied? By whom?
5. **Uses** — what is it intended for? What is it NOT suitable for?
6. **Distribution** — how is it shared? License?
7. **Maintenance** — who maintains it? Update cadence?

This is AC-08 of FR-W7-11. The absence of any field is a CI build failure.

---

*AI-TESTING-BOOK-IMPLEMENTATION.md — APEX-SENTINEL W7 | REVIEWER 2 | 2026-03-25*
