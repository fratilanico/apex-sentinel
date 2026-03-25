# APEX-SENTINEL W7 — ML Testing Deep Dive
# Book-Grounded Specifications for Military-Grade Acoustic Detection

> Source: *Artificial Intelligence and Software Testing* (Smith, Black, Davenport, Olszewska, Rohler, Wright)
> Applies to: APEX-SENTINEL W7 — YAMNet 16kHz acoustic drone detection
> Date: 2026-03-25
> Status: IMPLEMENTABLE SPECIFICATION — all items are actionable, not theoretical

---

## Book Foundations Referenced Throughout

These are the direct grounding citations used in all specifications below. Abbreviated inline.

**[CONF-MATRIX]** Smith et al. §4 "Testing Metrics" — confusion matrix, asymmetric FP/FN cost.
> "Not only does this mean we have two separate modes of failure, but the impact of those failures
> may be very different. Predicting someone has a disease, incorrectly, has a very different impact
> from incorrectly predicting someone does not have the same disease. In the former, they may find
> out through follow-up tests and predictions. In the latter they may not get tested again."

**[SIMPSONS]** Smith et al. §3 "Simpson's Paradox" — aggregate accuracy hides per-group collapse.
> "Simpson's paradox is a phenomenon where the trend in separate groups can disappear, or even be
> reversed, when the groups are combined."
> + Berkeley admissions: overall numbers looked fine, per-department numbers showed opposite bias.

**[BONFERRONI]** Smith et al. §3 statistical significance for multi-class bias testing.
> "If we perform the experiments first then choose the characteristic... a simple solution is the
> Bonferroni–Dunn correction... α* = α/n if we have n different directions of bias."
> For 5 drone classes at α=0.05: α* = 0.01 per class.

**[PIPELINE-VS-MODEL]** Smith et al. §4 "Levels of Testing" — pipeline testing ≠ model testing.
> "It is necessary to thoroughly test the end-to-end data flows, and statistically test the overall
> system in later stages." Three pitfalls: experimenter bias, pipeline bypassed in model test,
> third-party AI-as-a-service not tested at all.

**[NORTHCUTT]** Northcutt et al. 2021 — 3.4% label error rate in popular ML benchmarks.
> "A study in 2021 found a 3.4 per cent label error rate across popular benchmarks."

**[DATASHEETS]** Gebru et al. 2021 — every dataset needs a datasheet.
> "By analogy [with electronic component datasheets] we propose that every dataset be accompanied
> with a datasheet that documents its motivation, composition, collection process, recommended
> uses, and so on."

---

## 1. ACCEPTANCE CRITERIA MATRIX — Per-Drone-Profile P/R/F1 Thresholds

### 1.1 Asymmetric Cost Rationale (Military Context)

In standard ML practice the book states FP and FN costs are asymmetric and must be weighted
differently. In SENTINEL's context the asymmetry is extreme:

- **FN (missed detection) = target reaches impact without intercept** — lethal outcome.
- **FP (false alert) = operator responds to non-threat** — resource cost, alert fatigue.

FN cost >> FP cost for all kamikaze profiles. This inverts standard ML intuition (where
precision is often optimized first). SENTINEL must be recall-first, precision-acceptable.

The FalsePositiveGuard already provides three independent suppression gates to keep FP rate
manageable while recall thresholds remain high. W7's per-profile thresholds formalize this.

### 1.2 Per-Profile Acceptance Criteria Table

Each row specifies the minimum acceptable metric values at inference time on the W7 holdout
test set (stratified per-class, minimum 200 samples per class per the [SIMPSONS] mitigation).

```
┌───────────────┬──────────┬─────────────┬───────────┬───────────┬──────────────────────────────────────────────┐
│ Profile       │ Min      │ Min Recall  │ Min F1    │ Max FNR   │ Rationale                                    │
│               │ Precision│ (Sensitivity│           │           │                                              │
├───────────────┼──────────┼─────────────┼───────────┼───────────┼──────────────────────────────────────────────┤
│ shahed-238    │ 0.70     │ 0.97        │ 0.82      │ 0.03      │ Jet turbine, 3-8kHz — completely separate    │
│ (jet turbine) │          │             │           │           │ frequency domain from piston profiles.        │
│               │          │             │           │           │ Terminal phase threat: sub-90s to impact.    │
│               │          │             │           │           │ 0% detection at aggregate 95% ACC is the     │
│               │          │             │           │           │ Simpson's Paradox scenario. FNR ≤ 3% means   │
│               │          │             │           │           │ ≤3 misses per 100 approaches.                │
├───────────────┼──────────┼─────────────┼───────────┼───────────┼──────────────────────────────────────────────┤
│ shahed-136    │ 0.72     │ 0.95        │ 0.82      │ 0.05      │ 1-way kamikaze mission. High FP risk from    │
│ (piston       │          │             │           │           │ 50cc motorcycle signature (identical          │
│ ~167Hz)       │          │             │           │           │ acoustic). FalsePositiveGuard 3-gate          │
│               │          │             │           │           │ suppression keeps precision acceptable.      │
│               │          │             │           │           │ Recall priority: 5% FNR = 1 miss per 20.    │
├───────────────┼──────────┼─────────────┼───────────┼───────────┼──────────────────────────────────────────────┤
│ shahed-131    │ 0.72     │ 0.95        │ 0.82      │ 0.05      │ Same piston band as shahed-136 (150-400Hz).  │
│ (piston       │          │             │           │           │ Higher RPM range distinguishes it. Kamikaze  │
│ ~150-400Hz)   │          │             │           │           │ mission profile = same lethal FN cost as     │
│               │          │             │           │           │ shahed-136. Threshold identical.             │
├───────────────┼──────────┼─────────────┼───────────┼───────────┼──────────────────────────────────────────────┤
│ gerbera       │ 0.75     │ 0.93        │ 0.83      │ 0.07      │ Piston 167-217Hz. Reconnaissance profile —  │
│ (piston       │          │             │           │           │ not necessarily terminal. FN cost lower than │
│ ~167-217Hz)   │          │             │           │           │ kamikaze but still operationally critical    │
│               │          │             │           │           │ (ISR enables follow-on strike). 7% FNR      │
│               │          │             │           │           │ acceptable; higher precision to avoid ISR    │
│               │          │             │           │           │ chasing false ghosts.                        │
├───────────────┼──────────┼─────────────┼───────────┼───────────┼──────────────────────────────────────────────┤
│ fpv-quad      │ 0.80     │ 0.90        │ 0.85      │ 0.10      │ Pilot-controlled FPV. 2-10s RF silence       │
│ (electric     │          │             │           │           │ before impact. Acoustic detection is only    │
│ quadcopter)   │          │             │           │           │ one layer — RF-silence correlation is        │
│               │          │             │           │           │ primary discriminator. Higher precision      │
│               │          │             │           │           │ threshold justified: multi-sensor fusion     │
│               │          │             │           │           │ reduces FN risk. 10% FNR acceptable given    │
│               │          │             │           │           │ RF layer redundancy.                         │
└───────────────┴──────────┴─────────────┴───────────┴───────────┴──────────────────────────────────────────────┘
```

### 1.3 Aggregate Accuracy — What It Is Permitted to Gate

Aggregate accuracy ≥ 0.90 is a necessary but **not sufficient** gate. A build passes only when
ALL of the following conditions hold simultaneously:

1. Each per-profile recall >= its profile-specific minimum (table above)
2. Each per-profile F1 >= its profile-specific minimum
3. shahed-238 recall >= 0.97 (this one is non-negotiable — tested independently)
4. Aggregate accuracy >= 0.90 (catches total collapse)
5. Bonferroni-corrected per-class bias test passes (see §2)

**A build that achieves 95% aggregate accuracy while shahed-238 recall = 0% MUST FAIL.**

This is the explicit Simpson's Paradox guard. The test suite in §2 enforces it.

---

## 2. SIMPSON'S PARADOX AUDIT — 4 Vitest Tests

These four tests expose per-profile accuracy collapse hidden by aggregate metrics. They are
mandatory additions to `tests/ml/FR-W7-02-acoustic-profiles-expanded.test.ts`.

The tests use a synthetic confusion matrix fixture injected at the evaluator boundary.
No live model required — tests run against the metric computation logic itself.

```typescript
// tests/ml/FR-W7-11-simpsons-paradox-audit.test.ts
// FR-W7-11 | Simpson's Paradox Guard — per-profile accuracy audit
// Source: Smith et al. §3 Simpson's Paradox — aggregate statistics can be actively misleading

import { describe, it, expect } from 'vitest';
import { computePerProfileMetrics, computeAggregateAccuracy } from '../../src/ml/profile-metrics';
import type { ConfusionMatrix, ProfileMetrics } from '../../src/ml/profile-metrics';

// ---------------------------------------------------------------------------
// Fixture: The Simpson's Paradox scenario APEX-SENTINEL must detect and block.
// Aggregate accuracy = 95.0% looks passing.
// shahed-238 recall = 0.0% — jet turbine profile undetectable.
// This exact scenario would pass a naive aggregate-only gate.
// ---------------------------------------------------------------------------
const SIMPSONS_FIXTURE: ConfusionMatrix = {
  // rows = actual class, cols = predicted class
  // classes: ['shahed-238', 'shahed-136', 'shahed-131', 'gerbera', 'fpv-quad', 'background']
  // shahed-238: 50 actual, 0 detected correctly (all predicted as 'background')
  matrix: [
    //  s238  s136  s131  gerb  fpv   bg
    [    0,    0,    0,    0,    0,   50],  // actual shahed-238 — 0% recall
    [    0,  190,    2,    0,    0,    8],  // actual shahed-136 — 95% recall
    [    0,    3,  188,    0,    0,    9],  // actual shahed-131 — 94% recall
    [    0,    0,    0,  186,    0,   14],  // actual gerbera    — 93% recall
    [    0,    0,    0,    0,  192,    8],  // actual fpv-quad   — 96% recall
    [    2,    4,    3,    2,    1, 1388],  // actual background — 99.3% recall
  ],
  classLabels: ['shahed-238', 'shahed-136', 'shahed-131', 'gerbera', 'fpv-quad', 'background'],
};

describe('FR-W7-11: Simpson\'s Paradox Audit — per-profile accuracy collapse detection', () => {

  it('SP-01: aggregate accuracy PASSES naive 90% threshold on the paradox fixture', () => {
    // This test DOCUMENTS the failure mode — aggregate looks fine.
    // If this test fails, the fixture is wrong.
    const aggregateAcc = computeAggregateAccuracy(SIMPSONS_FIXTURE);
    // total correct: 0+190+188+186+192+1388 = 2144 out of 2250 = 95.3%
    expect(aggregateAcc).toBeGreaterThan(0.90);
    // The naive gate WOULD pass this — that is the problem.
  });

  it('SP-02: shahed-238 per-profile recall is 0.0 in the paradox fixture — the collapsed class', () => {
    // This is the actual danger. The jet turbine profile is undetectable.
    // All shahed-238 samples were classified as background.
    const metrics: ProfileMetrics = computePerProfileMetrics(SIMPSONS_FIXTURE, 'shahed-238');
    expect(metrics.recall).toBe(0);
    expect(metrics.truePositives).toBe(0);
    expect(metrics.falseNegatives).toBe(50);
    // Verify: an evaluator that only checks aggregate would not catch this.
    const aggregateAcc = computeAggregateAccuracy(SIMPSONS_FIXTURE);
    expect(aggregateAcc).toBeGreaterThan(0.90); // still passes aggregate gate
    // This combination — high aggregate + zero profile recall — is the paradox scenario.
  });

  it('SP-03: per-profile gate rejects the paradox fixture even though aggregate passes', () => {
    // This is the guard that MUST exist in the CI acceptance gate.
    // Acceptance thresholds from docs/waves/W7/ML-TESTING-DEEP-DIVE.md §1.2
    const PROFILE_RECALL_THRESHOLDS: Record<string, number> = {
      'shahed-238': 0.97,
      'shahed-136': 0.95,
      'shahed-131': 0.95,
      'gerbera':    0.93,
      'fpv-quad':   0.90,
    };

    const threatProfiles = ['shahed-238', 'shahed-136', 'shahed-131', 'gerbera', 'fpv-quad'];
    const violations: Array<{ profile: string; actual: number; required: number }> = [];

    for (const profile of threatProfiles) {
      const metrics = computePerProfileMetrics(SIMPSONS_FIXTURE, profile);
      const required = PROFILE_RECALL_THRESHOLDS[profile];
      if (metrics.recall < required) {
        violations.push({ profile, actual: metrics.recall, required });
      }
    }

    // In the paradox fixture, shahed-238 recall = 0 < 0.97 — must surface as violation
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some(v => v.profile === 'shahed-238')).toBe(true);
    // This test confirms: per-profile gating catches what aggregate hides.
  });

  it('SP-04: Bonferroni-corrected significance test detects class imbalance skew in holdout set', () => {
    // Source: Smith et al. §3 — Bonferroni-Dunn correction for multiple class testing.
    // "If we have n different directions of bias, replace α by α* = α/n"
    // For 5 threat classes: α* = 0.05/5 = 0.01
    // This test checks that the holdout set has no class so underrepresented that
    // any per-class significance test would be invalid (n < 30 = unreliable statistic).
    //
    // This is a DATA QUALITY test, not a model accuracy test.

    const BONFERRONI_ALPHA = 0.05 / 5; // 0.01
    const MIN_SAMPLES_PER_CLASS = 30;  // below this, chi-square test is not reliable
    const EXPECTED_MIN_REPRESENTATION = 0.02; // each threat class should be >= 2% of holdout

    // Count samples per class from the fixture
    const classCounts = SIMPSONS_FIXTURE.matrix.map((row, i) => ({
      label: SIMPSONS_FIXTURE.classLabels[i],
      count: row.reduce((sum, n) => sum + n, 0),
    }));

    const total = classCounts.reduce((sum, c) => sum + c.count, 0);
    const threatClassCounts = classCounts.filter(c =>
      ['shahed-238', 'shahed-136', 'shahed-131', 'gerbera', 'fpv-quad'].includes(c.label)
    );

    for (const cls of threatClassCounts) {
      // Each threat class must have enough samples for significance testing
      expect(cls.count).toBeGreaterThanOrEqual(MIN_SAMPLES_PER_CLASS);
      // Each threat class must have at least 2% representation
      expect(cls.count / total).toBeGreaterThanOrEqual(EXPECTED_MIN_REPRESENTATION);
    }

    // The Bonferroni alpha is exposed for use in statistical significance tests
    // run against real holdout data (not enforced here, documented for the data scientist)
    expect(BONFERRONI_ALPHA).toBe(0.01);
  });

});
```

**To make these tests pass, implement** `src/ml/profile-metrics.ts`:

```typescript
// src/ml/profile-metrics.ts — skeleton for the tests above

export interface ConfusionMatrix {
  matrix: number[][];
  classLabels: string[];
}

export interface ProfileMetrics {
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
}

export function computePerProfileMetrics(cm: ConfusionMatrix, className: string): ProfileMetrics;
export function computeAggregateAccuracy(cm: ConfusionMatrix): number;
```

---

## 3. DATA PIPELINE TEST CHECKLIST — 16kHz Migration

### 3.1 Grounding

The book distinguishes pipeline testing from model testing explicitly [PIPELINE-VS-MODEL]:
> "The data pipeline could erroneously transform certain values... leading to incorrect predictions.
> The data pipeline could pass null values for some fields incorrectly... leading to incorrect
> training and missing outputs. The data pipeline could duplicate some records incorrectly...
> skewing the model."

These 10 tests must pass **independent of model accuracy**. They test data transformation
correctness, not prediction quality. They belong in `tests/pipeline/FR-W7-01-dataset-16khz.test.ts`.

### 3.2 Pipeline Tests

```
PIPELINE-01: TARGET_SAMPLE_RATE constant
  Given: DatasetPipeline module is imported
  When: TARGET_SAMPLE_RATE is read
  Then: value === 16000 (not 22050, not any other value)
  Test type: Unit — no audio processing required
  Failure = regression to old constant

PIPELINE-02: Legacy WAV resampler — 22050Hz input
  Given: a WAV file with sampleRate = 22050
  When: LegacyResamplerShim.resample(buffer) is called
  Then: output.sampleRate === 16000
    AND output.samples.length === Math.round(input.samples.length * 16000 / 22050) ± 1
    AND output.durationSeconds matches input.durationSeconds within 1ms tolerance
  Test type: Unit — synthetic PCM buffer, no file IO

PIPELINE-03: Native 16kHz passthrough — no resampling applied
  Given: a WAV file with sampleRate = 16000
  When: DatasetPipeline.ingest(file) is called
  Then: no resampling operation is invoked (spy/mock counter = 0)
    AND output chunk sampleRate === 16000
  Test type: Unit — verify no unnecessary resampling on already-correct input

PIPELINE-04: FFT window size matches 16kHz Nyquist
  Given: FFTProcessor is configured with default settings at 16kHz
  When: windowSize and hopSize are read from the processor
  Then: windowSize results in frequency resolution ≥ 10Hz
    (windowSize ≥ 16000/10 = 1600 samples)
    AND max representable frequency = 16000/2 = 8000Hz
    AND Shahed-238 3-8kHz band is within [0, 8000Hz]
  Test type: Unit — arithmetic check, no audio required
  Critical: at 22050Hz this test was silently wrong (Nyquist = 11025Hz, but YAMNet only
  uses 0-8kHz, so extra resolution was wasted and feature indices were wrong)

PIPELINE-05: YAMNet mel-spectrogram input shape at 16kHz
  Given: YAMNetFeatureExtractor receives a 16kHz PCM chunk
  When: extractFeatures(chunk) is called
  Then: output tensor shape === [1, 96, 64] (YAMNet spec: 96 frames × 64 mel bins)
    AND no shape mismatch error is thrown
  Test type: Component — mocked TensorFlow.js, verifies preprocessing only

PIPELINE-06: No 22050 magic number in source tree
  Given: the full src/ directory
  When: a text search for the literal integer 22050 is performed
  Then: zero occurrences found outside of:
    - error messages / comments explaining the old value
    - test fixtures explicitly labeled as 'legacy' input
  Test type: Static analysis / grep — CI script check
  Implementation: `grep -r "22050" src/ | grep -v "//\|legacy\|comment"` returns empty

PIPELINE-07: Acoustic chunk duration invariant
  Given: AudioCapture running at 16kHz with chunkDurationMs = 975 (YAMNet window)
  When: captureChunk() returns a buffer
  Then: samples.length === 16000 * 0.975 = 15600 ± 1 sample
    AND chunk.durationSeconds === 0.975 ± 0.001
  Test type: Unit — synthetic buffer check

PIPELINE-08: Pipeline rejects mismatched sample rate without silent resampling
  Given: a PCM buffer with sampleRate = 44100 (not 22050, not 16000)
  When: DatasetPipeline.ingest(buffer) is called without the legacy shim
  Then: throws SampleRateMismatchError with message including "expected 16000, got 44100"
    AND no prediction is made on the malformed input
  Test type: Unit — error boundary validation
  Rationale: silent resampling of arbitrary rates would corrupt features without warning

PIPELINE-09: Batch ingest preserves no duplicate records
  Given: a batch of 100 audio files where 10 are exact duplicates (same hash)
  When: DatasetPipeline.ingestBatch(files) is called
  Then: deduplication removes the 10 duplicates
    AND output contains exactly 90 unique samples
    AND a deduplication warning is logged with count
  Test type: Unit — in-memory fixture
  Source: Smith et al. §4 — "the data pipeline could duplicate some records incorrectly,
  skewing the model towards the values in those records"

PIPELINE-10: End-to-end pipeline produces classification output at 16kHz
  Given: a synthetic 975ms PCM buffer at 16kHz containing a 167Hz sine wave
    (synthetic Shahed-136 fundamental)
  When: the full pipeline runs: ingest → resample-check → FFT → YAMNet features → classify
  Then: the pipeline completes without error
    AND output.profileId is a string (not null/undefined)
    AND output.sampleRate === 16000 at every stage boundary (verified via stage spy)
  Test type: Integration (all mocked IO) — the only end-to-end pipeline test in this set
  Failure here = pipeline stage boundary mismatch, not model accuracy
```

---

## 4. DATASET QUALITY SCORING — Datasheets for Datasets Framework

### 4.1 Grounding

Gebru et al. 2021 [DATASHEETS] proposes every dataset carry a datasheet covering:
motivation, composition, collection process, preprocessing, uses, distribution, maintenance.

Northcutt et al. 2021 [NORTHCUTT] found 3.4% label error rate in popular ML benchmarks.
> For SENTINEL's 200-sample-per-class holdout set: 3.4% = 7 mislabeled samples.
> At 97% recall requirement for shahed-238, 7 label errors in a 200-sample class could move
> the measured recall ±3.5% — enough to flip pass/fail at the gate.

This section specifies what must be documented and what mitigation is required before
the W7 holdout set is considered valid for acceptance gating.

### 4.2 Required Datasheet Fields — SENTINEL Acoustic Corpus

Create `docs/datasets/ACOUSTIC-CORPUS-DATASHEET.md` with the following sections.
Each field is marked REQUIRED or RECOMMENDED. Missing REQUIRED fields = dataset not approved.

```
SECTION 1 — MOTIVATION (REQUIRED)
  1.1 Purpose: what task does this dataset serve?
      Expected: "YAMNet fine-tuning and acceptance testing for acoustic drone detection
                 at 16kHz in field conditions."
  1.2 Who created it and under what authority?
      Expected: INDIGO team + APEX OS / Nicolae Fratila. Date range.
  1.3 Funding: who funded collection?
      Expected: organization name or "proprietary / classified"

SECTION 2 — COMPOSITION (REQUIRED)
  2.1 Total sample count per class:
      shahed-238: N recordings, total M seconds
      shahed-136: N recordings, total M seconds
      shahed-131: N recordings, total M seconds
      gerbera:    N recordings, total M seconds
      fpv-quad:   N recordings, total M seconds
      background: N recordings, total M seconds
  2.2 Train/validation/test split percentages
  2.3 Unique field recording sessions (not augmented duplicates) per class
  2.4 Are samples independent? (cross-contamination risk: same flight session
      appearing in both train and test = data leakage)
  2.5 Any known label errors at time of publication? (required field, may be 0)

SECTION 3 — COLLECTION PROCESS (REQUIRED)
  3.1 Recording hardware: microphone type, placement, distance from source
  3.2 Environmental conditions: urban/rural, wind speed, ambient noise dB
  3.3 Collection sample rate at recording: was it 16kHz native or downsampled?
      CRITICAL for SENTINEL: if recorded at 44.1kHz and downsampled, document
      the downsampling algorithm used (sinc interpolation vs. linear vs. other)
  3.4 Recording distance from drone: meters (affects SNR, harmonic structure)
  3.5 Drone flight profile: hover, approach, terminal, departure — label applied
  3.6 Geographic region (for ambient noise profile characterization)

SECTION 4 — PREPROCESSING (REQUIRED)
  4.1 Was the corpus resampled to 16kHz? When? By whom?
      If yes: algorithm used, software version, date
      If no: confirm native 16kHz
  4.2 Normalization: peak, RMS, or none?
  4.3 Silence trimming: threshold used?
  4.4 Augmentation applied to training split: noise injection, pitch shift,
      time stretch — document all transformations and parameters
  4.5 Are augmented samples present in the test split? (must be NO)

SECTION 5 — LABEL QUALITY (REQUIRED)
  5.1 Labeling method: expert annotation, automated, crowd-sourced?
  5.2 Number of independent annotators per sample
  5.3 Inter-annotator agreement score (Cohen's Kappa or Fleiss' Kappa)
      Required minimum: κ ≥ 0.80 for threat class labels
  5.4 Label error rate estimate (apply Northcutt 2021 methodology or equivalent)
  5.5 If estimated label error rate > 2%: describe mitigation applied before
      corpus is used for acceptance gating

SECTION 6 — DISTRIBUTION (REQUIRED)
  6.1 Can this dataset be shared with INDIGO team for cross-validation?
  6.2 Export control / classification status
  6.3 License

SECTION 7 — MAINTENANCE (RECOMMENDED)
  7.1 How will new profiles (Shahed-238 jet turbine real recordings) be added?
  7.2 Versioning scheme (corpus version string, git tag)
  7.3 Who is responsible for label error remediation?
```

### 4.3 Label Error Mitigation Protocol (Northcutt 3.4% Baseline)

Applying [NORTHCUTT] directly: at 3.4% error rate on a 1000-sample corpus, expect ~34 errors.
These are asymmetrically dangerous: a mislabeled shahed-238 sample in the background class
causes the model to learn "jet turbine audio = background" — directly producing the
Simpson's Paradox failure mode described in §1.

**Required mitigation before W7 acceptance gate:**

```
LABEL-AUDIT-01: Automated consistency check
  For each sample in the test split:
    Extract peak frequency via FFT
    Verify it falls within the expected band for the labeled class:
      shahed-238: peak in [3000, 8000Hz]
      shahed-136: peak in [100, 400Hz]
      shahed-131: peak in [100, 400Hz]
      gerbera:    peak in [100, 400Hz]
      fpv-quad:   peak in [800, 3000Hz]
    Flag any sample where peak frequency is outside the expected band.
    Flag count must be < 1% of total test samples to proceed.

LABEL-AUDIT-02: Expert review of flagged samples
  All samples flagged in LABEL-AUDIT-01 must be reviewed by at least
  one domain expert (acoustic engineer or INDIGO team member) before
  the test split is locked.

LABEL-AUDIT-03: Cross-class bleed detection
  For shahed-238 specifically:
    Verify that no training split sample labeled 'background' contains
    a strong 3-8kHz tonal component (which would be unlabeled shahed-238).
    Method: compute spectral centroid for all 'background' samples.
    Any sample with centroid > 2000Hz flagged for review.
```

---

## 5. FALSEPOSITIVEGUARD UPGRADE SPEC

### 5.1 Current State

The existing `FalsePositiveGuard` (W6, `src/ml/false-positive-guard.ts`) is binary:

```typescript
// Current: single confidence threshold for all profiles
assess(input: AssessInput): FalsePositiveAssessment {
  if (input.yamnetConfidence < this.confidenceThreshold) {
    return { isFalsePositive: true, ... };
  }
  // ... doppler and temporal gates
  return { isFalsePositive: false, ... };
}
```

Single `confidenceThreshold: 0.85` applied uniformly. No per-profile thresholds.
No recall/precision tracking. No operationally differentiated FN weighting.

### 5.2 Problem

From [CONF-MATRIX]: "the impact of those failures may be very different." A 0.85 confidence
gate that suppresses a shahed-238 detection is operationally catastrophic. The same 0.85 gate
suppressing an FPV quad detection may be operationally acceptable (RF layer provides redundancy).

The current guard cannot express this distinction. It is recall-blind.

### 5.3 TypeScript Interface — Upgraded FalsePositiveGuard

```typescript
// src/ml/false-positive-guard-v2.ts
// FR-W7-XX | Asymmetric per-profile precision/recall guard
//
// Upgrade from binary pass/fail to per-profile threshold evaluation.
// Source: Smith et al. §4 [CONF-MATRIX] — asymmetric FP/FN cost in safety-critical systems.

// ---- Profile-level threshold definition ----

export type DroneProfileId =
  | 'shahed-238'
  | 'shahed-136'
  | 'shahed-131'
  | 'gerbera'
  | 'fpv-quad'
  | 'background';

export interface ProfileThreshold {
  profileId: DroneProfileId;

  // Minimum YAMNet confidence to NOT suppress this detection.
  // Lower value = higher recall, more FPs allowed through = recall-favored.
  // Higher value = higher precision, more FNs suppressed = precision-favored.
  //
  // Military rationale:
  //   shahed-238: 0.65 (accept lower confidence to avoid missing jet turbine)
  //   shahed-136: 0.70 (accept modest FP rate due to motorcycle confusion risk)
  //   fpv-quad:   0.85 (RF layer provides redundancy; stricter confidence gate acceptable)
  minConfidence: number;

  // False Negative cost weight (1.0 = normal, 10.0 = catastrophic to miss).
  // Used by downstream alert prioritization, not by the guard itself.
  // Documents operational cost for audit trail and alert routing.
  fnCostWeight: number;

  // If true: even if isFalsePositive would be true on other gates,
  // a detection above minConfidence for this profile is NEVER suppressed.
  // Use for profiles where FN cost is so high that suppression is unacceptable
  // regardless of other signals. Set true for shahed-238 terminal phase.
  suppressionImmune: boolean;
}

export interface AsymmetricGuardConfig {
  profileThresholds: ProfileThreshold[];

  // Fallback threshold for profiles not explicitly listed
  defaultMinConfidence: number;

  // Temporal and doppler gates remain unchanged from V1
  temporalWindowMs: number;
  dopplerThresholdKmh: number;
}

// ---- Extended assessment result ----

export interface AsymmetricAssessment {
  // Was this flagged as a false positive?
  isFalsePositive: boolean;

  // The YAMNet confidence score
  confidence: number;

  // Which gate triggered (if isFalsePositive = true)
  reason: 'low-confidence' | 'temporal-linear' | 'doppler-vehicle' | null;

  // Profile-specific threshold that was applied
  appliedThreshold: number;

  // FN cost weight for this profile (from ProfileThreshold.fnCostWeight)
  // Passed through so downstream alert router can prioritize
  fnCostWeight: number;

  // If suppressionImmune=true for this profile, this gate was bypassed
  suppressionImmunityApplied: boolean;
}

// ---- Input — extends V1 with profileId ----

export interface AsymmetricAssessInput {
  yamnetConfidence: number;
  hasRfSignal: boolean;
  trackId: string;
  profileId: DroneProfileId;         // NEW — which profile was detected
  dopplerShiftKmh?: number;
}

// ---- Guard class ----

export class FalsePositiveGuardV2 {
  private readonly config: AsymmetricGuardConfig;
  private readonly windows: Map<string, WindowEntry>;

  constructor(config: AsymmetricGuardConfig);

  assess(input: AsymmetricAssessInput): AsymmetricAssessment;

  // V1 compatibility shim — wraps assess() using defaultMinConfidence
  assessLegacy(input: AssessInput): FalsePositiveAssessment;

  addTemporalSample(input: { trackId: string; sample: TemporalSample }): void;
  clearWindow(trackId: string): void;
}

// ---- Recommended default configuration ----
// Paste this into the factory/config layer, NOT hardcoded into the class.

export const DEFAULT_ASYMMETRIC_CONFIG: AsymmetricGuardConfig = {
  defaultMinConfidence: 0.85,
  temporalWindowMs: 10_000,
  dopplerThresholdKmh: 60,
  profileThresholds: [
    {
      profileId: 'shahed-238',
      minConfidence: 0.65,   // jet turbine, completely different frequency domain,
                              // lower confidence gate acceptable to maximize recall
      fnCostWeight: 10.0,    // terminal phase — catastrophic to miss
      suppressionImmune: true, // NEVER suppress a shahed-238 detection above confidence gate
    },
    {
      profileId: 'shahed-136',
      minConfidence: 0.70,   // motorcycle confusion requires 3-gate suppression but
                              // confidence gate should be lower than default to keep recall high
      fnCostWeight: 9.0,
      suppressionImmune: false,
    },
    {
      profileId: 'shahed-131',
      minConfidence: 0.70,
      fnCostWeight: 9.0,
      suppressionImmune: false,
    },
    {
      profileId: 'gerbera',
      minConfidence: 0.75,   // reconnaissance — high cost but not terminal
      fnCostWeight: 6.0,
      suppressionImmune: false,
    },
    {
      profileId: 'fpv-quad',
      minConfidence: 0.85,   // RF layer provides redundancy; tighter confidence gate OK
      fnCostWeight: 4.0,
      suppressionImmune: false,
    },
  ],
};
```

### 5.4 Migration Path from V1 to V2

```
Step 1: Implement FalsePositiveGuardV2 in src/ml/false-positive-guard-v2.ts
Step 2: Add assessLegacy() shim so all existing W6 callers work unchanged
Step 3: Add new per-profile tests in tests/ml/FR-W7-XX-fp-guard-v2.test.ts
Step 4: Run full test suite — all 629 existing tests must remain GREEN
Step 5: Wire up profileId in SentinelPipeline.detect() call site
Step 6: Remove V1 FalsePositiveGuard after all callers migrated (W8 cleanup)
```

### 5.5 Key Behavior Change — suppressionImmune for shahed-238

The single most important behavioral change from V1 to V2:

```typescript
// V1 behavior (current):
if (input.yamnetConfidence < 0.85) {
  return { isFalsePositive: true, ... }; // suppress ALL profiles at 0.85
}

// V2 behavior for shahed-238 (required):
const threshold = this.getProfileThreshold(input.profileId);
if (threshold.suppressionImmune && input.yamnetConfidence >= threshold.minConfidence) {
  // Even if doppler or temporal gate would suppress this — DO NOT SUPPRESS.
  // A shahed-238 at 0.66 confidence with an anomalous doppler reading still fires an alert.
  return {
    isFalsePositive: false,
    suppressionImmunityApplied: true,
    fnCostWeight: threshold.fnCostWeight,
    ...
  };
}
```

This directly addresses the FNR ≤ 3% requirement for shahed-238 from §1.2.

---

## 6. INTEGRATION INTO EXISTING W7 TEST FILES

### Where each deliverable hooks into the existing test plan

```
tests/ml/FR-W7-02-acoustic-profiles-expanded.test.ts
  — Add: per-profile metric computation tests (§2 depends on this)
  — Add: ProfileMetrics interface test coverage

tests/ml/FR-W7-11-simpsons-paradox-audit.test.ts  [NEW FILE]
  — All 4 Simpson's Paradox audit tests (§2)
  — Depends on: src/ml/profile-metrics.ts [NEW]

tests/pipeline/FR-W7-01-dataset-16khz.test.ts
  — Expand: add PIPELINE-06 through PIPELINE-10 from §3
  — PIPELINE-06 is a static analysis test run as a Vitest test via child_process

tests/ml/FR-W7-12-fp-guard-v2.test.ts  [NEW FILE]
  — FalsePositiveGuardV2 unit tests
  — Must include: suppressionImmune=true prevents suppression even when doppler gate fires
  — Must include: per-profile confidence gate applied correctly per ProfileThreshold
  — Must include: assessLegacy() returns same result as V1 for all V1 fixture cases

docs/datasets/ACOUSTIC-CORPUS-DATASHEET.md  [NEW FILE]
  — Fill in per §4.2 before W7 acceptance gate is run
```

### New source files required

```
src/ml/profile-metrics.ts          — ConfusionMatrix, computePerProfileMetrics, computeAggregateAccuracy
src/ml/false-positive-guard-v2.ts  — FalsePositiveGuardV2 with AsymmetricGuardConfig
docs/datasets/ACOUSTIC-CORPUS-DATASHEET.md  — dataset provenance documentation
```

---

## 7. CI ACCEPTANCE GATE CHANGES

Add to the W7 acceptance gate script (or vitest.config.ts thresholds) the following
explicit checks that run AFTER the standard coverage gate:

```
Gate 1 (existing): npx vitest run --coverage
  Pass condition: all ≥80% branches/functions/lines/statements

Gate 2 (NEW — Simpson's Paradox guard):
  Run: npx tsx scripts/check-per-profile-metrics.ts
  Input: holdout set confusion matrix (generated by test run)
  Pass condition: ALL per-profile recall thresholds from §1.2 are met
  Fail message: "Per-profile recall gate FAILED. Check for Simpson's Paradox scenario.
                 shahed-238 recall: X.XX (required: 0.97)"

Gate 3 (NEW — dataset quality):
  Run: npx tsx scripts/check-dataset-datasheet.ts
  Input: docs/datasets/ACOUSTIC-CORPUS-DATASHEET.md
  Pass condition: all REQUIRED sections populated, label error rate < 2%
  Fail message: "Dataset datasheet incomplete or label error rate exceeds threshold"

Gate 4 (existing + extended): npm run build && npx tsc --noEmit
  No change
```

---

## Summary of Deliverable Status

```
┌────────────────────────────────────────┬───────────────────────────────────────────┐
│ Deliverable                            │ Status / Action Required                  │
├────────────────────────────────────────┼───────────────────────────────────────────┤
│ §1 Acceptance Criteria Matrix          │ COMPLETE — paste into                     │
│                                        │ ACCEPTANCE_CRITERIA.md §FR-W7-11          │
├────────────────────────────────────────┼───────────────────────────────────────────┤
│ §2 Simpson's Paradox — 4 Vitest tests  │ COMPLETE — create                         │
│                                        │ tests/ml/FR-W7-11-simpsons-paradox.test.ts│
│                                        │ + implement src/ml/profile-metrics.ts     │
├────────────────────────────────────────┼───────────────────────────────────────────┤
│ §3 Pipeline test checklist (10 tests)  │ COMPLETE — add to                         │
│                                        │ FR-W7-01-dataset-16khz.test.ts            │
├────────────────────────────────────────┼───────────────────────────────────────────┤
│ §4 Dataset datasheet + label audit     │ TEMPLATE COMPLETE — fill in               │
│                                        │ docs/datasets/ACOUSTIC-CORPUS-DATASHEET.md│
│                                        │ with real corpus metadata                 │
├────────────────────────────────────────┼───────────────────────────────────────────┤
│ §5 FalsePositiveGuardV2 TypeScript     │ COMPLETE — implement                      │
│    interface + config                  │ src/ml/false-positive-guard-v2.ts         │
├────────────────────────────────────────┼───────────────────────────────────────────┤
│ §6 Test file integration map           │ COMPLETE — wiring documented              │
├────────────────────────────────────────┼───────────────────────────────────────────┤
│ §7 CI gate changes                     │ COMPLETE — add Gates 2+3 to               │
│                                        │ wave-formation checkpoint script          │
└────────────────────────────────────────┴───────────────────────────────────────────┘
```
