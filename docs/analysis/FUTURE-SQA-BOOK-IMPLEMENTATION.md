# The Future of Software Quality Assurance (Springer 2020) — APEX-SENTINEL Implementation Guide
# Source: Four deep-analysis agents covering all book chapters (Chunks 1–4)
# Date: 2026-03-25

---

## Executive Summary — Top 5 P0 Findings

1. **The learning-safety decoupling is a regulatory requirement, not a best practice.** The German Ethics Commission's ruling (cited by Linz, Chapter 5) mandates that self-learning components must be architecturally isolated from safety-critical functions until the learning can be formally verified. For SENTINEL: YAMNetFineTuner MUST NOT be able to modify AcousticProfileLibrary inference weights during live detection. This is not optional — it is a condition for lawful deployment. No current W7 test verifies that the promotion gate exists and blocks live updates. That test must be written before W7 execute.

2. **The 22050Hz → 16kHz mismatch is a mutation-class constant fault that slipped through the existing test suite.** Chunk 3 (Smith, mutation testing chapter) identifies constant replacement (CRP) as a mutation operator. The fact that the current suite did not catch the wrong sample rate means no test asserts the DatasetPipeline sample rate value. A CRP mutant replacing 16000 with 22050 would survive the W6 suite. This is proof that mutation score complements and outperforms coverage metrics for catching real faults in safety-critical systems.

3. **APEX-SENTINEL sits in the "Chaotic" Cynefin domain where 100% of requirements are potentially subconscious.** Chunk 4 (van Loenhoud) explicitly names autonomous combat robots and friend-or-foe systems as the canonical examples of this category. The implication: no test suite derived purely from written specifications will be complete. Apprenticing with INDIGO field operators before W7 plan phase is the primary mechanism for surfacing untested operational requirements — not optional.

4. **Fail-operational, not fail-safe, is the required architecture for all detection layers.** Chunk 2 (Linz, Chapter 5) states this explicitly: a system that goes silent on fault is more dangerous than a degraded system. SENTINEL currently has no documented or tested fail-operational behavior. If the acoustic pipeline fails, the system must not emit false "all-clear" signals. Tests must inject subsystem failures and assert continued operation on remaining layers.

5. **Mutation score is now a tort liability baseline, not an optional quality indicator.** Chunk 3 (Schieferdecker) frames state-of-the-art methods as a legal obligation proportionate to system criticality. For a system adjacent to kinetic response (jammer, net-gun, SkyNet), not applying mutation testing to FalsePositiveGuard and TerminalPhaseDetector is professionally indefensible under the "responsible software engineering" standard. Stryker must be added before W7 ships.

---

## Part 1 — Change-Driven Testing: TIA/TGA Integration for SENTINEL

### 1.1 The Core Principle

Amann & Juergens (Chapter 1, CQSE GmbH) demonstrated empirically across 100+ industrial systems: TIA selects tests that find 90%+ of bugs while running only 2% of the suite runtime. The mechanism: bugs can only be introduced through changes, so only tests covering changed code need to run per commit.

Key validated findings:
- 99.3% of randomly injected bugs found by impacted tests (12-system controlled study)
- 90%+ bug-finding rate in 2% of suite runtime across 100+ systems
- Practical example from the book: 6,500-test suite reduced to 6 impacted tests → 1.5 min CI feedback vs. 45 min full-suite run

For SENTINEL's 906-test suite — which includes expensive YAMNet forward passes and NATS JetStream integration tests — per-commit feedback is slow. TIA fixes this without sacrificing safety: the full suite runs on PR merge and nightly.

### 1.2 Change Impact Graph: Which Test Files Map to Which Source Modules

When a source module changes, TIA selects these test files:

```
src/acoustic/AcousticProfileLibrary.ts
  → tests/acoustic/FR-W7-02-acoustic-profile-library-v2.test.ts
  → tests/acoustic/FR-W6-01-acoustic-profile.test.ts
  → tests/ml/FR-W7-12-metamorphic-relations.test.ts
  → tests/ml/FR-W7-11-simpsons-paradox-audit.test.ts
  → tests/adversarial/AT-01-near-boundary-frequency.test.ts
  → tests/adversarial/AT-02-adversarial-bird-call.test.ts
  → tests/adversarial/AT-06-model-boundary-probing.test.ts

src/yamnet/YAMNetFineTuner.ts
  → tests/acoustic/FR-W3-04-yamnet-finetune.test.ts
  → tests/ml/FR-W7-12-metamorphic-relations.test.ts
  → tests/chaos/CE-04-model-load-failure.test.ts
  → tests/chaos/CE-08-concept-drift-detection.test.ts

src/detection/FalsePositiveGuard.ts
  → tests/detection/FR-W4-01-false-positive-guard.test.ts
  → tests/adversarial/AT-03-replay-attack.test.ts
  → tests/adversarial/AT-04-spectral-masking.test.ts

src/detection/TerminalPhaseDetector.ts  [W7 — zero-tolerance list]
  → tests/detection/FR-W7-03-terminal-phase-detector.test.ts
  → tests/detection/FR-W7-03-terminal-phase-fsm-complete.test.ts  [to create]
  → tests/integration/FR-W7-journey-*.test.ts

src/fusion/MultiNodeFusion.ts
  → tests/fusion/FR-W6-04-multi-node-fusion.test.ts
  → tests/chaos/CE-01-node-failure-mid-triangulation.test.ts
  → tests/chaos/CE-03-clock-skew.test.ts

src/pipeline/SentinelPipeline.ts
  → tests/pipeline/FR-W6-sentinel-pipeline.test.ts
  → tests/integration/FR-W7-journey-*.test.ts
  → tests/chaos/CE-02-nats-partition.test.ts

src/pipeline/DatasetPipeline.ts
  → tests/pipeline/FR-W7-01-dataset-16khz.test.ts
  → tests/chaos/CE-05-sample-rate-drift.test.ts

src/edge/EdgeDeployer.ts
  → tests/edge/FR-W6-edge-deployer.test.ts
  → tests/chaos/CE-06-hardware-divergence-regression.test.ts

src/output/BearingTriangulator.ts
  → tests/output/FR-W7-05-bearing-triangulator.test.ts

src/rf/ElrsFingerprint.ts
  → tests/rf/FR-W7-04-elrs-fingerprint.test.ts
```

### 1.3 TIA-Lite Implementation: `scripts/tia-select.ts`

A ~100-line TypeScript script reads git diff and the static impact map to select only affected tests:

```typescript
// scripts/tia-select.ts
// Run: npx tsx scripts/tia-select.ts | xargs npx vitest run

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const SENTINEL_ROOT = process.cwd();

// Static impact map — update when new source↔test relationships are added
const IMPACT_MAP: Record<string, string[]> = {
  'src/acoustic/AcousticProfileLibrary.ts': [
    'tests/acoustic/FR-W7-02-acoustic-profile-library-v2.test.ts',
    'tests/acoustic/FR-W6-01-acoustic-profile.test.ts',
    'tests/ml/FR-W7-12-metamorphic-relations.test.ts',
    'tests/adversarial/AT-01-near-boundary-frequency.test.ts',
  ],
  'src/yamnet/YAMNetFineTuner.ts': [
    'tests/acoustic/FR-W3-04-yamnet-finetune.test.ts',
    'tests/ml/FR-W7-12-metamorphic-relations.test.ts',
    'tests/chaos/CE-04-model-load-failure.test.ts',
  ],
  'src/detection/FalsePositiveGuard.ts': [
    'tests/detection/FR-W4-01-false-positive-guard.test.ts',
    'tests/adversarial/AT-03-replay-attack.test.ts',
    'tests/adversarial/AT-04-spectral-masking.test.ts',
  ],
  'src/detection/TerminalPhaseDetector.ts': [
    'tests/detection/FR-W7-03-terminal-phase-detector.test.ts',
    'tests/detection/FR-W7-03-terminal-phase-fsm-complete.test.ts',
  ],
  'src/fusion/MultiNodeFusion.ts': [
    'tests/fusion/FR-W6-04-multi-node-fusion.test.ts',
    'tests/chaos/CE-01-node-failure-mid-triangulation.test.ts',
    'tests/chaos/CE-03-clock-skew.test.ts',
  ],
  'src/pipeline/DatasetPipeline.ts': [
    'tests/pipeline/FR-W7-01-dataset-16khz.test.ts',
    'tests/chaos/CE-05-sample-rate-drift.test.ts',
  ],
};

function getChangedFiles(): string[] {
  const output = execSync('git diff HEAD~1 --name-only', { encoding: 'utf8' });
  return output.trim().split('\n').filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));
}

const changedFiles = getChangedFiles();
const selected = new Set<string>();

for (const changed of changedFiles) {
  const normalised = changed.replace(/^.*\/(src\/)/, '$1');
  if (IMPACT_MAP[normalised]) {
    for (const test of IMPACT_MAP[normalised]) {
      if (existsSync(path.join(SENTINEL_ROOT, test))) {
        selected.add(test);
      }
    }
  }
}

if (selected.size === 0) {
  // No impact map hit — fall back to full suite
  process.stdout.write('--reporter=verbose\n');
} else {
  [...selected].forEach(t => process.stdout.write(t + '\n'));
}
```

CI integration:

```yaml
# Per-commit fast feedback (TIA-selected):
- name: TIA-selected tests
  run: |
    SELECTED=$(npx tsx scripts/tia-select.ts)
    if echo "$SELECTED" | grep -q '\-\-reporter'; then
      npx vitest run --coverage
    else
      npx vitest run $SELECTED
    fi

# PR merge gate — full suite always:
- name: Full suite (PR gate)
  if: github.event_name == 'pull_request'
  run: npx vitest run --coverage
```

### 1.4 TGA: Test Gap Identification Gate for wave:complete

TGA rule (Amann & Juergens): any function introduced in a wave with zero coverage is an explicit test gap. Finding: untested code is 5× more likely to contain bugs. The wave:complete gate must refuse to pass if uncovered functions exist on the zero-tolerance list.

Zero-tolerance TGA list for W7 (TerminalPhaseDetector is SIL 2+ equivalent):

- `TerminalPhaseDetector.evaluate()` — speed + course + altitude + RF silence combination logic
- `TerminalPhaseDetector.reset()` — state machine recovery path
- `ElrsFingerprint.detectRfSilence()` — RF silence as terminal-phase indicator
- `DatasetPipeline.resampleTo16kHz()` — the DATA BREACH fix
- `BearingTriangulator.solveWLS()` — geometric solver
- coordinate injection path in `SentinelPipeline` (replacing hardcoded 51.5/4.9)

Add to `wave-formation.sh` in `cmd_complete()`:

```bash
echo "TGA gate: Checking W7 zero-tolerance function coverage..."
CRITICAL_FUNCS=("TerminalPhaseDetector" "detectRfSilence" "resampleTo16kHz" "solveWLS" "coordinateInject")
tga_fails=0
for func in "${CRITICAL_FUNCS[@]}"; do
  test_refs=$(grep -rl "$func" tests/ 2>/dev/null | wc -l)
  if [ "$test_refs" -eq 0 ]; then
    echo "[✗] TGA FAIL: $func has zero test references — write tests before complete"
    ((tga_fails++))
  fi
done
if [ "$tga_fails" -gt 0 ]; then
  echo "[✗] TGA gate FAILED — ${tga_fails} critical functions uncovered"
  exit 1
fi
echo "[✓] TGA gate PASS"
```

### 1.5 TGA Disposition Protocol

Every uncovered W7 function must be explicitly categorised before wave:complete:

| Category | SENTINEL Example | Required Action |
|---|---|---|
| Safety-critical path | TerminalPhaseDetector.evaluate() | Write automated test — zero exceptions |
| Error handler, non-critical | log/debug formatters, diagnostic paths | Manual verification once, justification logged |
| Equivalent mutant / dead code | Commented-out profile registration stub | Delete the code |
| Infrastructure-only | EdgeDeployer OS-specific path builder | Documented deferral with justification in RISK_REGISTER |

Amann & Juergens: "leaving test gaps is quite reasonable" for category 2–4, but never for category 1.

---

## Part 2 — AI/ML Testing Oracles: Solving the Oracle Problem for SENTINEL

### 2.1 The Oracle Problem Stated Precisely

Bath (Chapter 2, NG Tester): "Because AI applications are continuously learning and updating their knowledge bases, the definition of expected results is difficult." Marselis (Chapter 6): "Testing AI with AI means testing a system you don't fully understand with another system you don't fully understand — piling up uncertainties."

For SENTINEL three oracle gaps exist:

- **YAMNetFineTuner**: Classifies audio against profiles. Ground truth (is this field recording actually a Shahed-238 turbine?) is uncertain without curated BRAVE1Format datasets.
- **AcousticProfileLibrary**: Probabilistic confidence outputs. Binary `toBe('shahed-238')` assertions misrepresent the system — a confidence of 0.64 vs. 0.66 at a 0.65 threshold is the real test boundary.
- **TerminalPhaseDetector**: Multi-signal fusion. No single deterministic ground truth oracle exists for the combined (speed + course + altitude + RF silence) signal under field noise.

### 2.2 Solution 1: Pinned Dataset Oracle Tests

Chunks 1 and 2 converge on the same answer: curated golden datasets with known ground truth labels ARE the oracle. Tests against pinned datasets are deterministic — fixed dataset version, fixed model checkpoint, fixed random seed.

```typescript
// tests/oracle/FR-OR-01-profile-recall-gates.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { AcousticProfileLibrary } from '../../src/acoustic/AcousticProfileLibrary';
import { loadPinnedDataset } from '../helpers/pinned-dataset-loader';

// NEVER update DATASET_VERSION without a documented migration decision
const DATASET_VERSION = 'brave1-v2.3-16khz';

describe('FR-OR-01: Recall gates — per-profile oracle tests', () => {
  let library: AcousticProfileLibrary;
  let shahed238Samples: Float32Array[];
  let gerberaSamples:   Float32Array[];
  let shahed131Samples: Float32Array[];
  let ambientSamples:   Float32Array[];

  beforeAll(async () => {
    library = new AcousticProfileLibrary({ sampleRate: 16000 });
    await library.loadProfiles();
    shahed238Samples = await loadPinnedDataset(DATASET_VERSION, 'shahed-238', 50);
    gerberaSamples   = await loadPinnedDataset(DATASET_VERSION, 'gerbera', 50);
    shahed131Samples = await loadPinnedDataset(DATASET_VERSION, 'shahed-131', 50);
    ambientSamples   = await loadPinnedDataset(DATASET_VERSION, 'ambient', 200);
  });

  describe('Shahed-238 turbine (jet engine 3–8kHz)', () => {
    it('recall >= 0.95 at production threshold', async () => {
      let detected = 0;
      for (const sample of shahed238Samples) {
        const result = await library.classify(sample);
        if (result.droneType === 'shahed-238' && result.confidence >= 0.65) detected++;
      }
      expect(detected / shahed238Samples.length).toBeGreaterThanOrEqual(0.95);
    });
  });

  describe('Gerbera profile', () => {
    it('recall >= 0.92 at production threshold', async () => {
      let detected = 0;
      for (const sample of gerberaSamples) {
        const result = await library.classify(sample);
        if (result.droneType === 'gerbera' && result.confidence >= 0.65) detected++;
      }
      expect(detected / gerberaSamples.length).toBeGreaterThanOrEqual(0.92);
    });
  });

  describe('Shahed-131 piston engine', () => {
    it('recall >= 0.93 at production threshold', async () => {
      let detected = 0;
      for (const sample of shahed131Samples) {
        const result = await library.classify(sample);
        if (result.droneType === 'shahed-131' && result.confidence >= 0.65) detected++;
      }
      expect(detected / shahed131Samples.length).toBeGreaterThanOrEqual(0.93);
    });
  });

  describe('Ambient noise rejection (overfitting guard)', () => {
    it('precision >= 0.85: ambient samples must NOT trigger alerts', async () => {
      let falsePositives = 0;
      for (const sample of ambientSamples) {
        const result = await library.classify(sample);
        if (result.confidence >= 0.65 && result.droneType !== null) falsePositives++;
      }
      const precision = 1 - (falsePositives / ambientSamples.length);
      expect(precision).toBeGreaterThanOrEqual(0.85);
    });
  });
});
```

### 2.3 Solution 2: Metamorphic Testing Patterns

Where ground truth is unavailable at runtime, Metamorphic Relations (MRs) replace the oracle. The metamorphic test pattern already exists in the kernel at `/Users/nico/apex-os-core/infra/__tests__/metamorphic.test.cjs` but has NOT been ported to SENTINEL. Chunk 4 (SQA-TESTING-CHUNK-4) explicitly identifies this as the biggest gap vs. the AI Testing book.

Core MRs for SENTINEL (additions to existing FR-W7-12 suite):

```typescript
// tests/ml/FR-W7-12-metamorphic-relations.test.ts — book-derived additions

describe('MR-NOISE: Additive noise must not increase confidence', () => {
  it('confidence(audio + noise) <= confidence(audio) + tolerance', async () => {
    const clean = await loadFixture('shahed-136-clean.wav');
    const noisy = addWhiteNoise(clean, { snrDb: 6 });
    const r1 = await library.classify(clean);
    const r2 = await library.classify(noisy);
    // Metamorphic relation: noise degrades or equals clean confidence
    expect(r2.confidence).toBeLessThanOrEqual(r1.confidence + 0.05);
  });
});

describe('MR-SILENCE: Silence must return no-detection for all profiles', () => {
  it('silence buffer returns confidence <= 0.1', async () => {
    const silence = createSilenceBuffer(16000, 1.0);
    const result = await library.classify(silence);
    expect(result.confidence).toBeLessThanOrEqual(0.1);
    expect(result.droneType).toBeNull();
  });
});

describe('MR-SAMPLERATE: 22050Hz audio must throw, not silently misclassify', () => {
  it('wrong sample rate raises SampleRateMismatchError', async () => {
    const wrongRate = await loadFixture('shahed-238-22050hz.wav');
    await expect(library.classify(wrongRate)).rejects.toThrow('SampleRateMismatchError');
  });
});

describe('MR-AMPLITUDE: Higher amplitude at same SNR must not change label', () => {
  it('amplified audio produces same droneType', async () => {
    const original  = await loadFixture('gerbera-nominal.wav');
    const amplified = amplifyBuffer(original, { gainDb: 6 });
    const r1 = await library.classify(original);
    const r2 = await library.classify(amplified);
    expect(r2.droneType).toBe(r1.droneType);
  });
});

describe('MR-TURBINE: Shahed-238 spectral energy must concentrate in 3–8kHz', () => {
  it('spectral centroid of detected Shahed-238 is within turbine band', async () => {
    const sample = await loadFixture('shahed-238-jet-engine.wav');
    const result  = await library.classifyWithFeatures(sample);
    expect(result.spectralCentroid).toBeGreaterThanOrEqual(3000);
    expect(result.spectralCentroid).toBeLessThanOrEqual(8000);
  });
});
```

### 2.4 Oracle Test Suite — Full File Inventory

These run on the FULL suite schedule (not TIA-selected) because they validate the ML oracle properties:

| File | FR | Oracle Type | Threshold |
|---|---|---|---|
| `tests/oracle/FR-OR-01-profile-recall-gates.test.ts` | FR-OR-01 | Pinned dataset recall | ≥0.95 (Shahed-238), ≥0.92 (Gerbera), ≥0.93 (Shahed-131) |
| `tests/oracle/FR-OR-02-precision-ambient-rejection.test.ts` | FR-OR-02 | Pinned dataset precision | ≥0.85 all profiles |
| `tests/oracle/FR-OR-03-terminal-phase-oracle.test.ts` | FR-OR-03 | Scenario oracle (all 4 signals) | 100% terminal phase detection on INDIGO scenarios |
| `tests/oracle/FR-OR-04-per-profile-f1.test.ts` | FR-OR-04 | F1 gate per class | ≥0.90 per profile |
| `tests/oracle/FR-OR-05-learning-safety-decoupling.test.ts` | FR-OR-05 | Architecture gate | Promotion gate blocks unsafe models (see Part 2.6) |

### 2.5 Simpson's Paradox Guard

Marselis (Chapter 6) warns about aggregate accuracy hiding per-class failures. If 95% of samples are ambient noise and the classifier learns to always predict "no-drone," it achieves 95% aggregate accuracy with 0% recall on all drone classes. This guard is a permanent CI fixture from W7.

```typescript
// tests/ml/FR-W7-11-simpsons-paradox-audit.test.ts — addition
describe('FR-W7-11: Simpson Paradox Guard', () => {
  it('per-class recall must be >= 0.85 for every drone class regardless of aggregate', async () => {
    const classes = ['shahed-136', 'shahed-131', 'shahed-238', 'gerbera'];
    for (const cls of classes) {
      const classRecall = await computeClassRecall(library, pinnedDataset, cls);
      expect(classRecall).toBeGreaterThanOrEqual(0.85);
    }
  });

  it('no class recall more than 10% below aggregate recall', async () => {
    const aggregateRecall = await computeAggregateRecall(library, pinnedDataset);
    const classes = ['shahed-136', 'shahed-131', 'shahed-238', 'gerbera'];
    for (const cls of classes) {
      const classRecall = await computeClassRecall(library, pinnedDataset, cls);
      expect(classRecall).toBeGreaterThanOrEqual(aggregateRecall - 0.10);
    }
  });
});
```

### 2.6 Learning-Safety Decoupling Test Suite

Mandatory per German Ethics Commission ruling quoted by Linz: "As long as there is no sufficient certainty that self-learning systems can correctly assess these situations or comply with safety requirements, decoupling of self-learning systems from safety-critical functions should be prescribed."

```typescript
// tests/oracle/FR-OR-05-learning-safety-decoupling.test.ts

describe('FR-OR-05: Learning-Safety Decoupling (IEC 61508 / German Ethics Commission)', () => {

  describe('Promotion gate blocks unsafe model updates', () => {
    it('model with any per-class F1 < 0.90 must NOT be promoted to production', async () => {
      const badModel = await loadModelWithDegradedF1(0.75);
      const gate = new ModelPromotionGate({ minF1PerClass: 0.90 });
      const result = await gate.evaluate(badModel, testDataset);
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('F1 below threshold');
    });

    it('model that regresses on W6-LKGC samples must NOT be promoted', async () => {
      const regressedModel = await loadModelWithRegressionOnKnownGood();
      const gate = new ModelPromotionGate({ lkgcDataset: 'w6-lkgc-samples' });
      const result = await gate.evaluate(regressedModel, testDataset);
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('regression on LKGC');
    });

    it('model that passes FalsePositiveGuard suite is approved', async () => {
      const goodModel = await loadCurrentProductionModel();
      const gate = new ModelPromotionGate({ minF1PerClass: 0.90, lkgcDataset: 'w6-lkgc-samples' });
      const result = await gate.evaluate(goodModel, testDataset);
      expect(result.approved).toBe(true);
    });
  });

  describe('Live inference path is immutable during training', () => {
    it('YAMNetFineTuner.train() must NOT change AcousticProfileLibrary.classify() output', async () => {
      const library = new AcousticProfileLibrary();
      await library.loadProfiles();
      const baselineResult = await library.classify(testAudio);

      // Training run is architecturally isolated from inference path
      const tuner = new YAMNetFineTuner({ isolated: true });
      await tuner.trainEpoch(trainingBatch);

      const afterTrainingResult = await library.classify(testAudio);
      expect(afterTrainingResult.droneType).toBe(baselineResult.droneType);
      expect(afterTrainingResult.confidence).toBeCloseTo(baselineResult.confidence, 4);
    });
  });
});
```

### 2.7 Fail-Operational vs Fail-Safe: Module-by-Module Assignment

Linz (Chapter 5): "Autonomous systems should have appropriate fail-operational capabilities. A self-driving car should pilot to the side, park, and notify — not stop in the middle of a highway."

| Module | Required Mode | Test Pattern |
|---|---|---|
| AcousticProfileLibrary | Fail-operational | RF detection continues; no false all-clear emitted |
| YAMNetFineTuner (inference) | Fail-operational + fallback | Fall back to YAMNetSurrogate on model load failure |
| TerminalPhaseDetector | Fail-operational + DEGRADED alert | Must emit DEGRADED state, never silent failure |
| MultiNodeFusion | Fail-operational with quorum | If < 2 nodes, reduce confidence but continue |
| SentinelPipeline | Fail-operational | Continues on any single subsystem failure |
| DatasetPipeline (training) | Fail-safe acceptable | Training can halt — does not affect live detection |
| JammerActivation | Fail-safe (conservative) | On ambiguity, do NOT activate jammer |

Test pattern for fail-operational:

```typescript
// tests/chaos/CE-FAILOP-01-acoustic-layer-failure.test.ts

describe('FR-FAILOP-01: Fail-Operational under acoustic pipeline failure', () => {

  it('RF detection continues when acoustic layer throws', async () => {
    const pipeline = new SentinelPipeline();
    await pipeline.simulateAcousticFailure();
    const rfEvent = generateRfEvent({ frequency: 915e6, profile: 'elrs-900' });
    const result  = await pipeline.processRfEvent(rfEvent);
    expect(result.status).toBe('RF_ONLY_DEGRADED');
    expect(result.rfAlert).toBeDefined();
  });

  it('operator alert emitted within 500ms of acoustic layer failure', async () => {
    const alerts: string[] = [];
    const pipeline = new SentinelPipeline({ onAlert: (a) => alerts.push(a) });
    const start = Date.now();
    await pipeline.simulateAcousticFailure();
    expect(Date.now() - start).toBeLessThan(500);
    expect(alerts).toContain('ACOUSTIC_LAYER_DEGRADED');
  });

  it('does NOT return false all-clear when acoustic is down', async () => {
    const pipeline = new SentinelPipeline();
    await pipeline.simulateAcousticFailure();
    const status = await pipeline.getSystemStatus();
    expect(status.allClear).toBe(false);
    expect(status.degraded).toBe(true);
  });
});
```

---

## Part 3 — Mutation Testing Integration for SENTINEL

### 3.1 Stryker TypeScript Configuration

Install:

```bash
cd /Users/nico/projects/apex-sentinel
npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner
```

`stryker.config.json`:

```json
{
  "testRunner": "vitest",
  "mutate": [
    "src/acoustic/**/*.ts",
    "src/yamnet/**/*.ts",
    "src/detection/FalsePositiveGuard.ts",
    "src/detection/TerminalPhaseDetector.ts",
    "src/fusion/MultiNodeFusion.ts",
    "src/output/BearingTriangulator.ts",
    "src/prediction/MonteCarloPropagator.ts",
    "!src/**/*.test.ts",
    "!src/**/*.d.ts"
  ],
  "thresholds": {
    "high": 80,
    "low": 65,
    "break": 50
  },
  "timeoutMS": 60000,
  "concurrency": 4,
  "reporters": ["html", "json", "progress"],
  "htmlReporter": {
    "fileName": "reports/mutation/index.html"
  },
  "incremental": true,
  "incrementalFile": "reports/mutation/stryker-incremental.json"
}
```

### 3.2 Mutation Operators Ranked by SENTINEL Risk

The most dangerous mutations are those that silently pass the existing test suite while changing safety-critical behavior:

| Priority | Operator | Code Example | Why Critical |
|---|---|---|---|
| P0 | ROR (Relational) | `confidence > 0.65` → `confidence >= 0.65` or `> 0.35` | Off-by-one at classification boundary = wrong detection rate |
| P0 | LCR (Logical Connector) | `isDrone && isHostile` → `isDrone \|\| isHostile` | AND→OR makes the guard trivially passable |
| P0 | UOI (Unary negation) | `isHostile` → `!isHostile` | Inverts the detection decision entirely |
| P0 | CRP (Constant Replace) | `16000` → `22050` | The 22050Hz DATA BREACH was exactly this mutation surviving untested |
| P1 | AOR (Arithmetic) | `3000 + bandWidth` → `3000 - bandWidth` | Wrong frequency band → missed turbine signatures |
| P1 | SDL (Statement Delete) | Delete guard condition in FalsePositiveGuard | Tests must verify the guard actually does work |
| P2 | Condition negate | `if (!buffer)` → `if (buffer)` | Null-check inversion causing false positives |
| P2 | SVR (Variable Replace) | `this.threshold` → `this.minConfidence` | Swapping threshold fields misconfigures precision/recall |

Smith (Chapter "Chasing Mutants") on the 22050Hz analogy: "Code coverage only tells you the logic and branches which have been executed — it doesn't tell you whether your tests are effectively detecting failures." The sample rate constant was executed in every test. No test asserted its value.

### 3.3 Priority Order: Modules Get Mutation Testing First

Ranked by consequence of a surviving mutant reaching production:

1. **FalsePositiveGuard** — last line before false positive actuation triggers jammer or net-gun
2. **YAMNetFineTuner** (inference boundary conditions) — classification threshold constants
3. **AcousticProfileLibrary** — profile matching logic and frequency band definitions
4. **TerminalPhaseDetector** (W7) — speed + course + altitude + RF silence combination logic
5. **MonteCarloPropagator** — trajectory propagation boundary conditions
6. **BearingTriangulator.solveWLS()** — geometric solver correctness

Lower priority (still included in nightly full run):
- DatasetPipeline (data integrity, not classification)
- EdgeDeployer (infrastructure)
- BRAVE1Format (serialisation, well-defined schema)

### 3.4 Survival Rate Thresholds and CI Gate Schedule

Progressive tightening aligned with wave delivery:

```
W7 execute phase — observation mode (non-blocking):
  npx stryker run
  Goal: establish baseline score, identify surviving mutant locations

W7 complete gate — critical path blocking:
  npx stryker run --mutate "src/detection/FalsePositiveGuard.ts,src/yamnet/**/*.ts"
  Break threshold: score < 50%  (stryker "break" config)
  Low threshold:   score < 65%  (warning only)

W8 nightly — full suite blocking:
  npx stryker run
  Critical path (FPG + YAMNet + AcousticProfileLibrary): score must be >= 75%
  Full suite: score must be >= 60%
```

The dual-metric signal to watch:

| Coverage | Mutation Score | Meaning |
|---|---|---|
| ≥80% | ≥75% | Strong confidence in test suite — release ready |
| ≥80% | <60% | Tests execute code but assertions are weak — dangerous false security |
| <80% | N/A | Fix coverage first |
| ≥80% | 50–65% | Known gap area — check surviving mutants for threshold constants |

### 3.5 The 22050Hz Constant as a Concrete Mutation Kill Example

The mutation `DatasetPipeline.SAMPLE_RATE = 22050` (replacing 16000) survived W6. These two tests kill it permanently:

```typescript
// tests/pipeline/FR-W7-01-dataset-16khz.test.ts — mutation kill additions

it('SAMPLE_RATE constant equals 16000 — kills CRP mutant (22050)', () => {
  expect(DatasetPipeline.SAMPLE_RATE).toBe(16000);
});

it('pipeline throws SampleRateMismatchError for 22050Hz audio — kills CRP + ROR mutants', async () => {
  const wrongRate = createAudioBuffer({ sampleRate: 22050, durationSec: 1.0 });
  await expect(pipeline.ingest(wrongRate)).rejects.toThrow('SampleRateMismatchError');
});
```

### 3.6 Surviving Mutant Triage Protocol

With potentially hundreds of surviving mutants, triage prevents analysis paralysis:

**Tier 1 — wave:complete blocker (must kill before shipping W7):**
- Any surviving mutant in FalsePositiveGuard that changes a EMIT/SUPPRESS decision
- Any surviving mutant in TerminalPhaseDetector that changes TERMINAL state entry condition
- Any surviving mutant in AcousticProfileLibrary that changes droneType output

**Tier 2 — kill before W8:**
- Surviving mutants in MonteCarloPropagator confidence/trajectory logic
- Surviving mutants in MultiNodeFusion weight computation

**Tier 3 — investigate as potential dead code:**
- Equivalent mutants (behavior unchanged regardless of mutation) → likely dead code, delete
- Surviving mutants in logging/instrumentation paths → acceptable, document and defer

---

## Part 4 — 4D QA Framework Embedding

### 4.1 The Four Dimensions Defined

The book chapters collectively define four complementary testing dimensions that SENTINEL must operate in simultaneously:

| Dimension | Method | SENTINEL Layer | Current Status |
|---|---|---|---|
| TDD | Unit + Component (Vitest, FR-named describes) | Source modules | Present — 906 tests |
| BDD | Scenario + Journey (describe/it as Gherkin) | Acceptance, Integration | Partial — journey tests exist |
| PBT | Property-Based (fast-check or equivalent) | ML invariant boundaries | MISSING |
| MBT | Model-Based (FSM catalogue + ALFUS layers) | TerminalPhaseDetector, pipeline layers | MISSING |

### 4.2 TDD Layer: Gaps Identified by Book Analysis

**Gap 1 — MC/DC coverage on compound guards**

FalsePositiveGuard condition: `(confidence >= threshold) && (spectralMatch) && (temporalPersistence) && (!highNoise)`. Branch coverage with 2 test cases is insufficient. MC/DC requires each sub-condition to independently toggle the decision outcome.

```typescript
// Current (branch coverage only — 2 tests):
it('emits alert when all conditions met', ...); // C1=T, C2=T, C3=T, C4=F → EMIT
it('suppresses below threshold', ...);          // C1=F → SUPPRESS

// Required MC/DC additions (8 test pairs):
it('C1=T, C2=F, C3=T, C4=F → SUPPRESS: spectral mismatch dominates', ...);
it('C1=T, C2=T, C3=F, C4=F → HOLD: no temporal persistence', ...);
it('C1=T, C2=T, C3=T, C4=T → SUPPRESS: high noise environment', ...);
// Each condition must independently affect the decision
```

**Gap 2 — Attribute-based partition tests for ML class objects**

Per Ch. 8 OO testing rules (SQA-TESTING-CHUNK-4): for each attribute in AcousticProfileLibrary (frequencyRange, confidenceThreshold, temporalWindow), there must be tests that (a) read it, (b) modify it, (c) neither use nor modify it. This catches side-effect bugs in attribute mutation — critical for a safety-of-life system.

**Gap 3 — Minimum behavioral life history for SentinelPipeline**

Define the minimum operation sequence: `init → ingest → fuse → predict → output → teardown`. Generate 5+ random permutations that remain valid (multiple ingests before fuse, fuse with single event, predict with stale state). This validates that the pipeline handles operation ordering variations that field deployment produces: sensor bursts, dropped events, out-of-order NATS messages.

### 4.3 BDD Layer: New Scenarios from Book Analysis

BDD scenarios derived from operational context (Mitev, Chapter 7 + van Loenhoud, Chapter on subconscious requirements):

```typescript
// tests/bdd/FR-W7-BDD-terminal-phase.test.ts

describe('Feature: Terminal Phase Detection (FR-W7-03)', () => {

  describe('Scenario: Shahed-238 executing terminal dive', () => {
    it('Given drone is in APPROACH state with ELRS RF link active', ...);
    it('When RF link drops AND speed > 180 km/h AND altitude < 200m AND course toward threat', ...);
    it('Then system transitions to TERMINAL within 150ms', ...);
    it('And INTERCEPT_ALERT emitted to NATS sentinel.detections.*', ...);
    it('And PTZ receives slew-to-cue command within 200ms', ...);
  });

  describe('Scenario: Civilian FPV drone battery-saver RF drop', () => {
    it('Given FPV drone hovering at 50m altitude, speed < 20 km/h', ...);
    it('When RF link drops (battery-saver mode, not terminal behavior)', ...);
    it('Then system does NOT transition to TERMINAL', ...);
    it('Because speed threshold is not met (hover pattern recognised)', ...);
    it('And no actuation command is emitted', ...);
  });

  describe('Scenario: Degraded detection — acoustic sensor offline', () => {
    it('Given acoustic sensor has failed (ACOUSTIC_LAYER_DEGRADED emitted)', ...);
    it('When ELRS 915MHz signal detected with terminal-phase characteristics', ...);
    it('Then system emits RF_TERMINAL_DEGRADED alert (not silence)', ...);
    it('And operator receives DEGRADED_MODE notification within 500ms', ...);
  });

  describe('Scenario: Multiple simultaneous terminal threats', () => {
    it('Given two Shahed-136 drones approaching from 180° and 270°', ...);
    it('When both enter terminal phase simultaneously', ...);
    it('Then two independent INTERCEPT_ALERT events are emitted', ...);
    it('And jammer assignment prioritises by estimated impact time', ...);
  });
});
```

### 4.4 PBT Layer: Property-Based Testing (MISSING — Implement for W8)

Fast-check integration for SENTINEL ML and geometric invariants:

```typescript
// tests/pbt/FR-PBT-01-acoustic-classifier-invariants.test.ts
import fc from 'fast-check';
import { describe, it } from 'vitest';

describe('FR-PBT-01: AcousticProfileLibrary invariants', () => {

  it('confidence is always in [0, 1] for any float32 audio input', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float32Array({ minLength: 16000, maxLength: 80000 }),
        async (audioData) => {
          const result = await library.classify(new Float32Array(audioData));
          return result.confidence >= 0 && result.confidence <= 1;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('droneType is always from known profile set or null', async () => {
    const KNOWN_PROFILES = ['shahed-136', 'shahed-131', 'shahed-238', 'gerbera', null];
    await fc.assert(
      fc.asyncProperty(
        fc.float32Array({ minLength: 16000, maxLength: 48000 }),
        async (audioData) => {
          const result = await library.classify(new Float32Array(audioData));
          return KNOWN_PROFILES.includes(result.droneType);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('BearingTriangulator returns bearing in [0, 360) for any valid lat/lon input', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.float({ min: -89, max: 89 }),
          fc.float({ min: -179, max: 179 }),
          fc.float({ min: -89, max: 89 }),
          fc.float({ min: -179, max: 179 }),
        ),
        ([lat1, lon1, lat2, lon2]) => {
          if (Math.abs(lat1 - lat2) < 0.0001 && Math.abs(lon1 - lon2) < 0.0001) return true;
          const bearing = BearingTriangulator.computeBearing(lat1, lon1, lat2, lon2);
          return bearing >= 0 && bearing < 360;
        }
      )
    );
  });

  it('MonteCarloPropagator output coordinates never exceed valid bounds', () => {
    fc.assert(
      fc.property(
        fc.record({
          lat: fc.float({ min: -80, max: 80 }),
          lon: fc.float({ min: -170, max: 170 }),
          speedKmh: fc.float({ min: 0, max: 400 }),
          bearingDeg: fc.float({ min: 0, max: 360 }),
        }),
        ({ lat, lon, speedKmh, bearingDeg }) => {
          const predictions = propagator.predict({ lat, lon, speedKmh, bearingDeg }, 5);
          return predictions.every(p => Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180);
        }
      )
    );
  });
});
```

### 4.5 MBT Layer: Model-Based Testing via ALFUS

Linz (Chapter 5) proposes the ALFUS 5-layer perception-action chain as the formal model for autonomous system testing. SENTINEL maps directly:

```
Layer 1 — Sensing (unit tests):
  Modules: AcousticProfileLibrary.ingestFrame(), ElrsFingerprint.detectSignal()
  Coverage: FR-W1-*-acoustic-sensing, FR-W7-04-elrs-fingerprint
  Gap: BearingTriangulator sensor-array boundary input validation

Layer 2 — Perceiving (unit/component tests):
  Modules: YAMNetFineTuner, FalsePositiveGuard, AcousticProfileLibrary.classify()
  Coverage: FR-W3-*, FR-W4-*, FR-OR-01 to FR-OR-04
  Gap: Wild Hornets negative class (3000+ recordings, no tests yet)

Layer 3 — Analyzing (component/integration tests):
  Modules: TerminalPhaseDetector, MultiNodeFusion, EKF state estimator
  Coverage: FR-W7-03 (partial), FR-W5-ekf-*
  Gap: TerminalPhaseDetector FSM negative transitions and fail-operational paths

Layer 4 — Planning (integration tests):
  Modules: SentinelPipeline, JammerActivation, PTZ slew-to-cue
  Coverage: FR-W6-sentinel-pipeline, FR-W7-06-jammer-activation
  Gap: Fail-operational planning with partial sensor data

Layer 5 — Acting (E2E/system tests):
  Modules: EdgeDeployer, BRAVE1Format, CursorOfTruth, Telegram relay
  Coverage: FR-W6-edge-deployer, FR-W6-brave1
  Gap: Hardware-in-loop latency gates on RPi4/Jetson
```

Each ALFUS layer must have a non-zero test count before wave:complete. A zero test count at any layer is a safety gap, not just a coverage gap.

### 4.6 Gap Analysis by Dimension — W7 State

| Dimension | Test Count W6 | Target W8 | Gap Type |
|---|---|---|---|
| TDD (unit) | ~400 | ~500 | +MC/DC tests, attribute partition tests, life history random |
| BDD (scenario) | ~50 journey | ~120 | +BDD terminal phase, jammer, degraded-mode scenarios |
| PBT (property) | 0 | ~40 | New: fast-check integration (W8 P0) |
| MBT (model-based) | 0 | ~60 | New: ALFUS layer tagging, FSM scenario catalogue |
| Oracle (ML) | ~30 metamorphic | ~80 | +pinned dataset oracle, per-profile recall gates |
| Mutation (Stryker) | 0 | baseline in W7 | New: stryker install + baseline run |

---

## Part 5 — mind-the-gap Integration

The existing 14-check mind-the-gap audit in `wave-formation.sh` runs checks 1–8 (TDD/code quality) and checks 9–14 (FDRP dimensions). These five new checks extend it based on book findings. Add them inside `cmd_mind_the_gap()` before the results summary:

### Check 15: Oracle Coverage Check

```bash
echo -e "\n${CYAN}Check 15 [ORACLE]: ML oracle test files present...${RESET}"
oracle_count=$(find tests/oracle -name "FR-OR-*.test.ts" 2>/dev/null | wc -l)
if [ "$oracle_count" -lt 3 ]; then
  echo -e "${RED}[✗] Check 15 FAIL — ${oracle_count}/3 oracle test files (need FR-OR-01, FR-OR-02, FR-OR-03)${RESET}"
  ((fail_count++))
else
  echo -e "${GREEN}[✓] Check 15 PASS — ${oracle_count} oracle test files${RESET}"
  ((pass++))
fi
```

### Check 16: Mutation Report Present

```bash
echo -e "\n${CYAN}Check 16 [MUTATION]: Stryker config + report present...${RESET}"
if [ -f "stryker.config.json" ]; then
  if [ -f "reports/mutation/mutation-testing-report.json" ]; then
    MUT_SCORE=$(node -e "
      try {
        const r = require('./reports/mutation/mutation-testing-report.json');
        const files = Object.values(r.files || {});
        const killed = files.reduce((s,f) => s + (f.killed || 0), 0);
        const survived = files.reduce((s,f) => s + (f.survived || 0), 0);
        const total = killed + survived;
        console.log(total > 0 ? Math.round(100 * killed / total) : 0);
      } catch(e) { console.log(0); }
    " 2>/dev/null || echo "0")
    if [ "$MUT_SCORE" -lt 50 ]; then
      echo -e "${RED}[✗] Check 16 FAIL — Mutation score ${MUT_SCORE}% < 50% minimum${RESET}"
      ((fail_count++))
    else
      echo -e "${GREEN}[✓] Check 16 PASS — Mutation score ${MUT_SCORE}%${RESET}"
      ((pass++))
    fi
  else
    echo -e "${YELLOW}[~] Check 16 WARN — stryker.config.json present but no report yet${RESET}"
    echo -e "    Run: npx stryker run  (non-blocking in W7)"
    ((pass++))  # Non-blocking in W7, becomes blocking in W8
  fi
else
  echo -e "${RED}[✗] Check 16 FAIL — stryker.config.json missing${RESET}"
  ((fail_count++))
fi
```

### Check 17: TGA Critical Function Coverage

```bash
echo -e "\n${CYAN}Check 17 [TGA]: W7 zero-tolerance functions have test references...${RESET}"
CRITICAL_FUNCS=("TerminalPhaseDetector" "detectRfSilence" "resampleTo16kHz" "solveWLS")
tga_fail=0
for func in "${CRITICAL_FUNCS[@]}"; do
  refs=$(grep -rl "$func" tests/ 2>/dev/null | wc -l)
  if [ "$refs" -eq 0 ]; then
    echo -e "  ${RED}[✗] $func — zero test references${RESET}"
    ((tga_fail++))
  else
    echo -e "  ${GREEN}[✓] $func — ${refs} test file(s)${RESET}"
  fi
done
if [ "$tga_fail" -gt 0 ]; then
  echo -e "${RED}[✗] Check 17 FAIL — ${tga_fail} critical W7 functions uncovered${RESET}"
  ((fail_count++))
else
  echo -e "${GREEN}[✓] Check 17 PASS — all critical W7 functions covered${RESET}"
  ((pass++))
fi
```

### Check 18: Learning-Safety Decoupling Test Present

```bash
echo -e "\n${CYAN}Check 18 [ETHICS]: Learning-safety decoupling test present...${RESET}"
if grep -rl "ModelPromotionGate\|FR-OR-05\|learning.safety\|decoupl.*train" tests/ 2>/dev/null | grep -q .; then
  echo -e "${GREEN}[✓] Check 18 PASS — Learning-safety decoupling tests found${RESET}"
  ((pass++))
else
  echo -e "${RED}[✗] Check 18 FAIL — No learning-safety decoupling tests${RESET}"
  echo -e "    Create: tests/oracle/FR-OR-05-learning-safety-decoupling.test.ts"
  ((fail_count++))
fi
```

### Check 19: Fail-Operational Behavior Tested

```bash
echo -e "\n${CYAN}Check 19 [FAILOP]: Fail-operational tests present...${RESET}"
failop_count=$(grep -rl "simulateAcousticFailure\|ACOUSTIC_LAYER_DEGRADED\|FR-FAILOP\|fail.oper" tests/ 2>/dev/null | wc -l)
if [ "$failop_count" -lt 2 ]; then
  echo -e "${RED}[✗] Check 19 FAIL — ${failop_count}/2 fail-operational test files${RESET}"
  echo -e "    Create: tests/chaos/CE-FAILOP-01-acoustic-layer-failure.test.ts"
  ((fail_count++))
else
  echo -e "${GREEN}[✓] Check 19 PASS — ${failop_count} fail-operational test files${RESET}"
  ((pass++))
fi
```

Update the title line in `cmd_mind_the_gap()`:

```bash
echo -e "${BOLD}  APEX-SENTINEL — Mind-the-Gap 19-Point Audit     ${RESET}"
echo -e "${BOLD}  Checks 1-8: TDD/Code · 9-14: FDRP · 15-19: ML/Ethics ${RESET}"
```

Update the results counter:
```bash
echo -e "${BOLD}  Mind-the-Gap Results: ${pass}/19 checks passed   ${RESET}"
```

---

## Part 6 — Next Wave (W8) Testing Requirements

### 6.1 Per-Profile Recall Gates as Blocking CI Requirements

Every W8 deployment must pass per-profile recall gates. These are not optional metrics — they are blocking CI gates:

```typescript
// tests/oracle/W8-recall-gate.test.ts
const RECALL_GATES: Record<string, number> = {
  'shahed-136': 0.95,
  'shahed-131': 0.93,   // piston engine
  'shahed-238': 0.95,   // jet turbine 3–8kHz — highest priority
  'gerbera':    0.92,
  'fpv-quad':   0.88,   // small FPV — harder to detect acoustically
};

describe('W8 Recall Gates (blocking CI requirement)', () => {
  for (const [profile, minRecall] of Object.entries(RECALL_GATES)) {
    it(`${profile} recall >= ${minRecall}`, async () => {
      const recall = await computeRecall(library, pinnedDataset, profile);
      expect(recall).toBeGreaterThanOrEqual(minRecall);
    });
  }
});
```

### 6.2 Simpson's Paradox Guard (Permanent Blocking from W8)

The guard introduced in W7 becomes a permanent blocking gate. If any class drops below its per-class baseline while aggregate improves, the build fails and model promotion is rejected.

### 6.3 Fail-Operational Test Harness — Full 5-Combination Matrix

W8 must test every failure combination in the 3-layer protection stack:

| Failure | Expected Behavior | Test File |
|---|---|---|
| Acoustic DOWN, RF UP | RF_ONLY_DEGRADED mode, alert emitted | CE-FAILOP-01 |
| Acoustic UP, RF DOWN | ACOUSTIC_ONLY_DEGRADED, alert emitted | CE-FAILOP-02 |
| Acoustic DOWN, RF DOWN | TOTAL_SENSOR_LOSS, EMERGENCY alert | CE-FAILOP-03 |
| All sensors UP, NATS DOWN | LOCAL_BUFFER mode, replay on reconnect | CE-02 (existing) |
| All sensors UP, NATS DOWN, 30+ min | EMERGENCY_LOCAL_ONLY, periodic NATS retry | CE-FAILOP-04 |

### 6.4 Learning-Safety Decoupling Expansion (W8)

W7 establishes the promotion gate. W8 adds:
- Formal model card validation (Gebru et al. 2019 datasheet — all 7 required fields present)
- Catastrophic forgetting test: W7 profiles must not degrade after W8 fine-tuning
- Distribution shift detector integration test: KL divergence alert threshold validated

### 6.5 Wild Hornets Dataset (W8 P0)

3000+ field recordings required as negative class before W8 model training:

```typescript
it('Wild Hornets dataset: >= 3000 recordings at 16kHz', async () => {
  const ds = await loadWildHornetsDataset();
  expect(ds.recordings.length).toBeGreaterThanOrEqual(3000);
  expect(ds.recordings.every(r => r.sampleRate === 16000)).toBe(true);
});
```

### 6.6 Subconscious Requirements Discovered by Book Analysis

Van Loenhoud (Chunk 4) documents the requirements nobody wrote because "everyone knows." These must be tested explicitly in W7/W8 before field deployment:

| Subconscious Requirement | Test | Priority |
|---|---|---|
| Detection degrades gracefully under wind/rain (not fails binary) | CE-05 (sample rate drift analog), add SNR degradation test | W7 |
| Confidence expressed at boundary (0.45–0.55 range), not just high-confidence | BVA on FPG thresholds | W7 |
| Anti-profiles (non-threat spectral overlaps: motorcycles, industrial equipment) included | Ambient rejection oracle | W7 |
| 16kHz is INDIGO operational standard (was never written down) | FR-W7-01 | W7 P0 — address immediately |
| Coordinate provenance traceable to verified source, not hardcoded | Coordinate injection tests | W7 |
| Thermal throttling on Jetson/RPi4 at 85°C does not degrade output silently | CE-06 extension | W8 |
| BRAVE1 receiver offline 30s: data buffered, not lost | CE-02 extension | W8 |

---

## Appendix — Full Technique Inventory (All 4 Chunks Mapped to SENTINEL)

### Chunk 1 (Amann/Juergens — CDT; Bath — NG Tester; Faber — DevOps; Gerrard — TSP)

| Technique | Chapter | SENTINEL Mapping | Status |
|---|---|---|---|
| TIA — Test Impact Analysis | Amann/Juergens | scripts/tia-select.ts | To build |
| TGA — Test Gap Analysis | Amann/Juergens | wave:complete gate on W7 functions | To add |
| Ticket coverage | Amann/Juergens | Check 17 (mind-the-gap) | New |
| Oracle problem → pinned datasets | Bath | tests/oracle/FR-OR-01 to FR-OR-04 | To create |
| Underfitting → recall guard | Bath | FR-OR-01 recall ≥ 0.95 | To create |
| Overfitting → precision guard | Bath | FR-OR-02 precision ≥ 0.85 | To create |
| Monitoring as continuous testing | Faber | EdgeDeployer inference.metrics NATS | To design |
| T-shaped model → agent routing | Bath | Gemini/Codex/Opus in CLAUDE.md | Present |

### Chunk 2 (Linz — Autonomous Systems; Marselis — Digital Age; Mitev — Acceptance)

| Technique | Chapter | SENTINEL Mapping | Status |
|---|---|---|---|
| ALFUS 5-layer test decomposition | Linz | MBT coverage map — Part 4 | To apply |
| Fail-operational specification | Linz | tests/chaos/CE-FAILOP-* | To create |
| Scenario-based test catalogue | Linz | SCENARIO_PARAMETERS | Defined in Part 4 |
| Learning-safety decoupling gate | Linz + German Ethics | FR-OR-05 | To create |
| Tolerance-boundary ML testing | Marselis | BVA + FalsePositiveGuard tests | Partial |
| Adversarial red team requirement | EU Ethics/Linz | tests/adversarial/ | Partially present |
| Three-approach acceptance mix | Mitev | FR + workflow + data tests | Wave-formation gate |
| Independent acceptance reviewer | Mitev | Opus reviewer role in APEX-OS | Governance present |

### Chunk 3 (Schieferdecker — Responsible SE; Smith — Mutation; Tannian — Design Thinking)

| Technique | Chapter | SENTINEL Mapping | Status |
|---|---|---|---|
| Mutation testing (Stryker JS) | Smith | stryker.config.json — Part 3 | To install |
| ROR/LCR/CRP priority operators | Smith | FPG thresholds, sample rate constant | Part 3.2 |
| Incremental mutation per PR | Smith | stryker --incremental --since | CI config |
| Decision sovereignty tests | Schieferdecker | FR-ETHICS-01 (human-in-loop) | To create |
| Algo.Rules compliance column | Schieferdecker | W7 RISK_REGISTER | To add |
| Kill-switch manageability test | Algo.Rule 7 | Emergency stop within 200ms | To create |
| Proportionality by FP consequence | EU Ethics | FR-ETHICS-02 (FP class tests) | To create |

### Chunk 4 (van Loenhoud — Subconscious Req; van Solingen — Agile; van Veenendaal — NG Tester)

| Technique | Chapter | SENTINEL Mapping | Status |
|---|---|---|---|
| Subconscious requirements register | van Loenhoud | SUBCONSCIOUS_REQ_REGISTER doc | To create as W7 deliverable |
| Kano migration review at wave boundary | van Loenhoud | 30-min sweep at wave:complete | Process addition |
| Cynefin chaotic → experience-based primary | van Loenhoud | Error guessing + adversarial | Applied via tests/adversarial/ |
| Apprenticing with INDIGO operators | van Loenhoud | Pre-W7 plan phase 1–2 day session | Action item |
| BDD / Specification by Example | van Loenhoud | tests/bdd/ — expand from journey tests | To create |
| Anti-profile (non-threat spectra) testing | van Loenhoud | Subconscious req: motorcycles, FPV civil | FR-OR-02 scope extension |
| T-shaped domain knowledge requirement | van Veenendaal | Acoustic physics briefing before W7 | Pre-W7 action |
| Experience-based as primary in chaotic | van Loenhoud | Error guessing on adversarial inputs | tests/adversarial/ |
