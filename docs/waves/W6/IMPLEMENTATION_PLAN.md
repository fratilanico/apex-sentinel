# APEX-SENTINEL W6 — Implementation Plan
# Wave: Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
# Date: 2026-03-25 | Status: INIT COMPLETE — TDD RED starting

---

## Overview

W6 delivers the acoustic intelligence layer: drone signature library, fine-tuned YAMNet classifier,
false-positive suppression, dataset pipeline, multi-node sensor fusion, Monte Carlo impact
propagation, edge deployment, end-to-end integration pipeline, tactical output, and BRAVE1 format
export. Ten source files, ten test files, TDD RED before any implementation line.

---

## Directory Structure (New W6 Modules)

```
src/
├── ml/
│   ├── acoustic-profile-library.ts     FR-W6-01
│   ├── yamnnet-finetuner.ts            FR-W6-02
│   ├── false-positive-guard.ts         FR-W6-03
│   └── dataset-pipeline.ts             FR-W6-04
├── fusion/
│   └── multi-node-fusion.ts            FR-W6-05
├── prediction/
│   ├── monte-carlo-propagator.ts       FR-W6-06
│   ├── types.ts                        (W5 — extend only, do not break)
│   └── ... (W5 existing)
├── deploy/
│   └── edge-deployer.ts                FR-W6-07
├── integration/
│   └── sentinel-pipeline.ts            FR-W6-08
└── output/
    ├── cursor-of-truth.ts              FR-W6-09
    └── brave1-format.ts                FR-W6-10

__tests__/
├── ml/
│   ├── acoustic-profile-library.test.ts
│   ├── yamnnet-finetuner.test.ts
│   ├── false-positive-guard.test.ts
│   └── dataset-pipeline.test.ts
├── fusion/
│   └── multi-node-fusion.test.ts
├── prediction/
│   └── monte-carlo-propagator.test.ts
├── deploy/
│   └── edge-deployer.test.ts
├── integration/
│   └── sentinel-pipeline.test.ts
└── output/
    ├── cursor-of-truth.test.ts
    └── brave1-format.test.ts
```

---

## Import Graph (W6 Dependencies)

```
sentinel-pipeline.ts
  ├── acoustic-profile-library.ts
  ├── yamnnet-finetuner.ts
  ├── false-positive-guard.ts
  ├── multi-node-fusion.ts
  ├── ../prediction/ekf.ts           (W5)
  ├── ../prediction/multi-track-manager.ts  (W5)
  ├── ../prediction/prediction-publisher.ts (W5)
  └── cursor-of-truth.ts

cursor-of-truth.ts
  ├── ../prediction/types.ts         (W5)
  └── brave1-format.ts

multi-node-fusion.ts
  └── (no internal deps — standalone)

monte-carlo-propagator.ts
  ├── ../prediction/ekf.ts           (W5)
  ├── ../prediction/impact-estimator.ts (W5)
  └── ../prediction/types.ts         (W5)

edge-deployer.ts
  └── (ONNX Runtime — external only)

dataset-pipeline.ts
  └── acoustic-profile-library.ts
```

---

## Execute Phase Command Sequence

```bash
# 1. Ensure W5 baseline still green
cd /Users/nico/projects/apex-sentinel
npx vitest run --coverage

# 2. Create directories
mkdir -p src/ml src/fusion src/deploy src/integration src/output
mkdir -p __tests__/ml __tests__/fusion __tests__/deploy __tests__/integration __tests__/output

# 3. TDD RED — write all test files first, verify they fail
# (see per-task test sections below)
npx vitest run 2>&1 | grep -E "FAIL|PASS|Tests"

# 4. Implement source files one by one (T01 → T10)
# After each file: npx vitest run src/ml/<file> --coverage

# 5. Checkpoint: all tests green, coverage ≥80%
npx vitest run --coverage
npm run build
npx tsc --noEmit

# 6. Wave complete
./wave-formation.sh complete W6
```

---

## Task W6-T01: AcousticProfileLibrary

**File:** `src/ml/acoustic-profile-library.ts`
**Test file:** `__tests__/ml/acoustic-profile-library.test.ts`
**Test count target:** 20 unit tests

### Interfaces

```typescript
export interface DroneAcousticProfile {
  id: string;
  droneType: 'shahed-136' | 'lancet-3' | 'mavic-mini' | 'orlan-10' | string;
  frequencyRange: [number, number];   // Hz [min, max]
  peakFrequency: number;              // Hz
  rpmRange: [number, number];         // RPM [min, max]
  signalType: 'piston' | 'electric' | 'turbine';
  detectionRangeKm: number;
  falsePositiveRisk: 'high' | 'medium' | 'low';
  countermeasureNotes: string;
}

export interface FrequencyMatch {
  profile: DroneAcousticProfile;
  overlapHz: number;        // Hz overlap with query range
  overlapRatio: number;     // 0-1, fraction of query range covered
  score: number;            // composite match score 0-1
}

export class DroneProfileNotFoundError extends Error {
  constructor(public readonly profileId: string) {
    super(`Drone profile not found: ${profileId}`);
    this.name = 'DroneProfileNotFoundError';
  }
}
```

### Built-in Profiles (hardcoded seed data)

```typescript
const SEED_PROFILES: DroneAcousticProfile[] = [
  {
    id: 'shahed-136',
    droneType: 'shahed-136',
    frequencyRange: [100, 400],
    peakFrequency: 230,
    rpmRange: [7000, 9000],
    signalType: 'piston',
    detectionRangeKm: 3.5,
    falsePositiveRisk: 'high',
    countermeasureNotes: '50cc motorcycle acoustically identical. Require Doppler + temporal + RF.',
  },
  {
    id: 'lancet-3',
    droneType: 'lancet-3',
    frequencyRange: [1000, 4000],
    peakFrequency: 2200,
    rpmRange: [12000, 20000],
    signalType: 'electric',
    detectionRangeKm: 1.5,
    falsePositiveRisk: 'low',
    countermeasureNotes: 'Electric motor — clean harmonic series. Less FP risk.',
  },
  {
    id: 'mavic-mini',
    droneType: 'mavic-mini',
    frequencyRange: [800, 3500],
    peakFrequency: 1800,
    rpmRange: [8000, 16000],
    signalType: 'electric',
    detectionRangeKm: 0.5,
    falsePositiveRisk: 'medium',
    countermeasureNotes: 'Commercial FPV. Short range. Usually benign.',
  },
  {
    id: 'orlan-10',
    droneType: 'orlan-10',
    frequencyRange: [80, 300],
    peakFrequency: 150,
    rpmRange: [5000, 7500],
    signalType: 'piston',
    detectionRangeKm: 5.0,
    falsePositiveRisk: 'medium',
    countermeasureNotes: 'ISR platform. Heavier than Shahed. Lower RPM band.',
  },
];
```

### Methods

```typescript
export class AcousticProfileLibrary {
  private profiles: Map<string, DroneAcousticProfile>;

  constructor(seed: DroneAcousticProfile[] = SEED_PROFILES) {}

  getProfile(id: string): DroneAcousticProfile           // throws DroneProfileNotFoundError
  getAllProfiles(): DroneAcousticProfile[]
  addProfile(profile: DroneAcousticProfile): void         // throws if id already exists
  removeProfile(id: string): void                         // throws DroneProfileNotFoundError

  matchFrequency(freqMin: number, freqMax: number): FrequencyMatch[]
  // Algorithm:
  // for each profile p:
  //   overlapMin = max(freqMin, p.frequencyRange[0])
  //   overlapMax = min(freqMax, p.frequencyRange[1])
  //   if overlapMax <= overlapMin: skip (no overlap)
  //   overlapHz = overlapMax - overlapMin
  //   queryWidth = freqMax - freqMin
  //   overlapRatio = overlapHz / queryWidth
  //   peakInRange = freqMin <= p.peakFrequency <= freqMax ? 1 : 0.5
  //   score = (overlapRatio * 0.7) + (peakInRange * 0.3)
  // return sorted by score desc
}
```

### Implementation Order

1. Define interfaces and error class (export all)
2. Define SEED_PROFILES constant
3. Implement constructor with Map initialisation
4. Implement `getProfile` / `getAllProfiles`
5. Implement `addProfile` (duplicate check) / `removeProfile`
6. Implement `matchFrequency` — overlap arithmetic then sort
7. Export singleton: `export const acousticProfileLibrary = new AcousticProfileLibrary()`

### TDD RED — Test Cases

```typescript
describe('FR-W6-01: AcousticProfileLibrary', () => {
  it('returns Shahed-136 profile by id')
  it('throws DroneProfileNotFoundError for unknown id')
  it('returns all 4 seed profiles')
  it('adds a custom profile')
  it('throws on duplicate id add')
  it('removes a profile')
  it('throws DroneProfileNotFoundError on remove of missing')
  it('matchFrequency returns Shahed-136 for 150-350Hz query')
  it('matchFrequency returns Lancet-3 for 1500-3000Hz query')
  it('matchFrequency returns empty for 10000-15000Hz query')
  it('matchFrequency sorts by score descending')
  it('matchFrequency overlapRatio is 1.0 when query fully inside profile range')
  it('matchFrequency includes peak bonus when peakFrequency inside query')
  it('matchFrequency excludes peak bonus when peakFrequency outside query')
  it('singleton export exists')
  it('addProfile and then getProfile roundtrip')
  it('matchFrequency works after profile added')
  it('matchFrequency works after profile removed')
  it('overlapHz computed correctly for partial overlap')
  it('score bounded 0-1 for all seed profiles')
})
```

---

## Task W6-T02: YAMNetFineTuner

**File:** `src/ml/yamnnet-finetuner.ts`
**Test file:** `__tests__/ml/yamnnet-finetuner.test.ts`
**Test count target:** 18 unit tests

### Interfaces

```typescript
export interface TrainingConfig {
  sampleRate: number;           // 22050
  windowSizeSeconds: number;    // 2.0
  hopSizeSeconds: number;       // 0.5
  nMels: number;                // 128
  fMin: number;                 // 80
  fMax: number;                 // 8000
  batchSize: number;            // 32
  epochs: number;               // 50
  learningRate: number;         // 1e-4
}

export interface TrainingMetrics {
  epoch: number;
  loss: number;
  valAccuracy: number;          // 0-1
  falsePositiveRate: number;    // 0-1
  droneClassAccuracy: number;   // 0-1
}

export interface ModelMetadata {
  version: string;
  trainedAt: number;
  config: TrainingConfig;
  finalMetrics: TrainingMetrics;
  onnxPath: string;
}

export interface ModelBackend {
  forward(melSpectrogram: Float32Array): Promise<Float32Array>;
  loadWeights(path: string): Promise<void>;
  exportONNX(outputPath: string): Promise<void>;
}

export class YAMNetFineTuner {
  constructor(
    private config: TrainingConfig,
    private backend: ModelBackend   // injected — use MockModelBackend in tests
  ) {}

  async loadDataset(datasetDir: string): Promise<number>
  // Returns count of loaded samples. Reads .wav files, computes mel spectrograms.
  // Does NOT call filesystem in unit tests — dataset injected via setDataset()
  setDataset(samples: Array<{mel: Float32Array; label: string}>): void

  async trainEpoch(epoch: number): Promise<TrainingMetrics>
  // Pseudocode:
  // shuffle dataset
  // for batch in batches(dataset, config.batchSize):
  //   preds = backend.forward(batch.mels)
  //   loss = crossEntropyLoss(preds, batch.labels)
  //   backprop (mock in tests — backend.forward returns mock logits)
  // valMetrics = evaluate(valSet)
  // return TrainingMetrics

  async evaluate(samples?: Array<{mel: Float32Array; label: string}>): Promise<TrainingMetrics>
  async exportONNX(outputPath: string): Promise<ModelMetadata>
  getMetrics(): TrainingMetrics[]
  getConfig(): TrainingConfig
}

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  sampleRate: 22050,
  windowSizeSeconds: 2.0,
  hopSizeSeconds: 0.5,
  nMels: 128,
  fMin: 80,
  fMax: 8000,
  batchSize: 32,
  epochs: 50,
  learningRate: 1e-4,
};
```

### Implementation Order

1. Define all interfaces and export DEFAULT_TRAINING_CONFIG
2. Define ModelBackend interface (for DI)
3. Implement YAMNetFineTuner constructor
4. Implement `setDataset` and `getConfig`
5. Implement `getMetrics` (returns copy of internal metrics array)
6. Implement `trainEpoch` — batch logic, call backend.forward, compute mock loss
7. Implement `evaluate` — compute accuracy and FP rate from predictions
8. Implement `exportONNX` — delegate to backend, build ModelMetadata
9. Implement `loadDataset` — filesystem path scan (integration only)

### Key Algorithm — mel spectrogram frame count

```
framesPerWindow = ceil(sampleRate * windowSizeSeconds)  // 44100
hopFrames       = ceil(sampleRate * hopSizeSeconds)      // 11025
// For a 10-second audio clip at 22050Hz:
// totalSamples = 220500
// numWindows   = floor((totalSamples - framesPerWindow) / hopFrames) + 1 = 16
```

### TDD RED — Test Cases

```typescript
describe('FR-W6-02: YAMNetFineTuner', () => {
  it('constructs with DEFAULT_TRAINING_CONFIG')
  it('setDataset stores samples accessible to trainEpoch')
  it('trainEpoch returns TrainingMetrics with correct epoch number')
  it('trainEpoch calls backend.forward at least once')
  it('trainEpoch loss is finite positive number')
  it('evaluate returns valAccuracy between 0 and 1')
  it('evaluate returns falsePositiveRate between 0 and 1')
  it('evaluate returns droneClassAccuracy between 0 and 1')
  it('getMetrics returns empty array before training')
  it('getMetrics length equals number of epochs trained')
  it('exportONNX returns ModelMetadata with correct config')
  it('exportONNX calls backend.exportONNX with provided path')
  it('exportONNX sets trainedAt to current timestamp')
  it('DEFAULT_TRAINING_CONFIG has sampleRate 22050')
  it('DEFAULT_TRAINING_CONFIG has nMels 128')
  it('DEFAULT_TRAINING_CONFIG has fMin 80 and fMax 8000')
  it('getConfig returns config passed to constructor')
  it('multiple trainEpoch calls accumulate metrics')
})
```

---

## Task W6-T03: FalsePositiveGuard

**File:** `src/ml/false-positive-guard.ts`
**Test file:** `__tests__/ml/false-positive-guard.test.ts`
**Test count target:** 22 unit tests

### Interfaces

```typescript
export interface TemporalSample {
  lat: number;
  lon: number;
  timestamp: number;      // Unix ms
  speed: number;          // km/h (Doppler-derived)
  heading: number;        // degrees 0-360
}

export interface FalsePositiveAssessment {
  isFalsePositive: boolean;
  confidence: number;     // 0-1, confidence that classification is correct
  reason: 'low-confidence' | 'temporal-linear' | 'doppler-vehicle' | 'rf-cross-check-fail' | null;
  details: string;
}

export interface RFSample {
  timestamp: number;
  frequencyMHz: number;   // 900 for FPV command link
  rssi: number;           // dBm
  lat: number;
  lon: number;
}

export interface FalsePositiveGuardConfig {
  minYamnetConfidence: number;  // default 0.85
  maxVehicleSpeedKmh: number;   // default 60 (above = vehicle)
  temporalWindowMs: number;     // default 30000 (30s)
  rfCrossCheckEnabled: boolean; // default false (RTL-SDR optional)
  rfCorrelationDistanceKm: number; // default 0.5
}
```

### Assessment Logic (State Machine)

```
assess(yamnetConfidence, temporalSamples, rfSamples?):
  Step 1 — Confidence gate:
    if yamnetConfidence < config.minYamnetConfidence:
      return { isFalsePositive: true, reason: 'low-confidence', ... }

  Step 2 — Doppler vehicle check:
    maxSpeed = max(s.speed for s in temporalSamples)
    if maxSpeed > config.maxVehicleSpeedKmh:
      return { isFalsePositive: true, reason: 'doppler-vehicle', ... }

  Step 3 — Temporal linearity check:
    if temporalSamples.length >= 3:
      compute heading variance across samples
      if headingVariance < 5 degrees AND all speeds > 40 km/h:
        return { isFalsePositive: true, reason: 'temporal-linear', ... }

  Step 4 — RF cross-check (optional):
    if config.rfCrossCheckEnabled AND rfSamples provided:
      find RF samples within rfCorrelationDistanceKm of centroid
      if no 900MHz burst found in temporal window:
        return { isFalsePositive: true, reason: 'rf-cross-check-fail', ... }

  return { isFalsePositive: false, confidence: yamnetConfidence, reason: null }
```

### Implementation Order

1. Define all interfaces and default config
2. Export `DEFAULT_FPG_CONFIG`
3. Implement `headingVariance` helper (circular variance for angles)
4. Implement `haversineKm` helper for RF distance check
5. Implement `assess` — four-step logic in order
6. Implement `FalsePositiveGuard` class with constructor and `assess` method
7. Export singleton with default config

### TDD RED — Test Cases

```typescript
describe('FR-W6-03: FalsePositiveGuard', () => {
  it('returns not-FP for high-confidence drone with slow speed')
  it('returns FP with low-confidence reason when yamnetConfidence < 0.85')
  it('returns FP with doppler-vehicle when speed > 60kmh')
  it('returns not-FP when speed exactly 60kmh (boundary)')
  it('returns FP with temporal-linear for 3+ samples heading < 5deg variance, speed > 40')
  it('does not flag temporal-linear with only 2 samples')
  it('does not flag temporal-linear when heading variance > 5deg')
  it('rf-cross-check skipped when rfCrossCheckEnabled false')
  it('rf-cross-check returns FP when no 900MHz burst found near track')
  it('rf-cross-check passes when 900MHz burst found within distance threshold')
  it('confidence returned equals yamnetConfidence when not FP')
  it('confidence > 0.5 when FP detected via doppler')
  it('50cc motorcycle scenario: high acoustic confidence blocked by temporal-linear')
  it('shahed-136 genuine: passes all 4 steps at low speed')
  it('custom config with minYamnetConfidence 0.90 rejects 0.87 confidence')
  it('headingVariance handles 359 → 1 degree wraparound correctly')
  it('assess works with empty rfSamples array')
  it('assess works with null rfSamples when rf disabled')
  it('details string is non-empty string for all FP reasons')
  it('details string is empty or null for non-FP')
  it('DEFAULT_FPG_CONFIG has correct values')
  it('constructor accepts partial config override via spread')
})
```

---

## Task W6-T04: DatasetPipeline

**File:** `src/ml/dataset-pipeline.ts`
**Test file:** `__tests__/ml/dataset-pipeline.test.ts`
**Test count target:** 18 unit tests

### Interfaces

```typescript
export interface DatasetItem {
  id: string;
  source: 'telegram' | 'field' | 'synthetic';
  filename: string;
  droneLabel: string;         // 'shahed-136' | 'lancet-3' | etc.
  durationSeconds: number;
  sampleRate: number;
  augmented: boolean;
  augmentParams?: AugmentOptions;
  split: 'train' | 'val' | 'test' | null;
}

export interface AugmentOptions {
  speed?: number;       // 0.5-2.0, multiplicative
  pitch?: number;       // semitones, -6 to +6
  noiseLevel?: number;  // 0-1 (fraction of signal amplitude)
  reverb?: boolean;
}

export interface DatasetStats {
  total: number;
  byLabel: Record<string, number>;
  bySplit: { train: number; val: number; test: number; unassigned: number };
  bySource: Record<string, number>;
  augmentedCount: number;
  durationSecondsTotal: number;
}

export interface SplitConfig {
  trainRatio: number;   // default 0.7
  valRatio: number;     // default 0.15
  testRatio: number;    // default 0.15
  seed?: string;        // for deterministic hash-based shuffle
}
```

### Methods

```typescript
export class DatasetPipeline {
  private items: Map<string, DatasetItem> = new Map();

  ingest(items: DatasetItem[]): number
  // Returns count ingested. Throws on duplicate id.

  augment(id: string, options: AugmentOptions): DatasetItem
  // Creates new item with augmented: true, new id = `${id}-aug-${hash(options)}`
  // Does NOT call actual DSP — augmentation is metadata-tracked
  // (actual DSP happens in YAMNetFineTuner.loadDataset)

  split(config?: SplitConfig): void
  // Deterministic: sort items by id, hash each id, assign to split by hash % 100:
  //   0-69 → train, 70-84 → val, 85-99 → test
  // Preserves augmented items in same split as their source

  getStats(): DatasetStats

  getItemsByLabel(label: string): DatasetItem[]
  getItemsBySplit(split: 'train' | 'val' | 'test'): DatasetItem[]

  exportTFRecord(outputPath: string, split: 'train' | 'val' | 'test'): Promise<number>
  // Returns count of records exported. No actual TFRecord writing in unit tests.
  // Inject fileWriter for testability.

  clear(): void
}

// Deterministic hash for split assignment:
function hashId(id: string): number {
  // djb2 hash mod 100
  let hash = 5381;
  for (const ch of id) hash = ((hash << 5) + hash) + ch.charCodeAt(0);
  return Math.abs(hash) % 100;
}
```

### Implementation Order

1. Define all interfaces, export SplitConfig default
2. Implement `hashId` helper (djb2)
3. Implement constructor and `clear`
4. Implement `ingest` (duplicate check, Map.set)
5. Implement `getItemsByLabel` / `getItemsBySplit`
6. Implement `augment` — clone item, set augmented flag, generate new id
7. Implement `split` — deterministic assignment via hashId
8. Implement `getStats` — aggregate all counts
9. Implement `exportTFRecord` — inject fileWriter, return count

### TDD RED — Test Cases

```typescript
describe('FR-W6-04: DatasetPipeline', () => {
  it('ingest returns count of items added')
  it('ingest throws on duplicate id')
  it('getStats returns correct totals after ingest')
  it('getStats byLabel counts correctly')
  it('getStats augmentedCount is 0 before augmentation')
  it('augment creates new item with augmented flag true')
  it('augment new id is different from source id')
  it('augment increments augmentedCount in stats')
  it('split assigns all items to a split')
  it('split is deterministic — same ids → same splits')
  it('split ratios approximately 70/15/15 for large dataset')
  it('getItemsBySplit returns correct items after split')
  it('getItemsByLabel returns correct items')
  it('clear removes all items')
  it('stats durationSecondsTotal sums correctly')
  it('split preserves augmented items in same split as source')
  it('ingest from telegram source tracked in bySource')
  it('hashId is deterministic for same input')
})
```

---

## Task W6-T05: MultiNodeFusion

**File:** `src/fusion/multi-node-fusion.ts`
**Test file:** `__tests__/fusion/multi-node-fusion.test.ts`
**Test count target:** 20 unit tests

### Interfaces

```typescript
export interface NodeReport {
  nodeId: string;
  trackId: string;
  confidence: number;         // 0-1
  lat: number;
  lon: number;
  distanceKm: number;         // sensor-to-target distance
  timestamp: number;          // Unix ms
}

export interface FusionConsensus {
  trackId: string;
  fusedConfidence: number;    // inverse-distance weighted
  lat: number;                // IDW-weighted centroid
  lon: number;
  nodeCount: number;
  agreement: boolean;         // ≥ 2/3 majority
  contributingNodes: string[];
  fusedAt: number;
}

export interface FusionConfig {
  maxAgeMs: number;           // discard reports older than this (default 10000)
  minNodes: number;           // minimum nodes to produce consensus (default 2)
  consensusThreshold: number; // fraction required for agreement (default 0.667)
  minConfidence: number;      // discard reports below this (default 0.5)
}
```

### Algorithm — Inverse Distance Weighting

```
fuseReports(reports: NodeReport[]): FusionConsensus

1. Filter: drop reports where distanceKm === 0 (avoid div/0), confidence < minConfidence,
           age > maxAgeMs
2. If filtered.length < minNodes: throw FusionInsufficientNodesError

3. Compute weights:
   w_i = 1 / distanceKm_i
   wSum = Σ w_i

4. Fused position:
   fusedLat = Σ(w_i * lat_i) / wSum
   fusedLon = Σ(w_i * lon_i) / wSum

5. Fused confidence:
   fusedConf = Σ(w_i * confidence_i) / wSum

6. Majority vote:
   nodesAboveConfidence = reports.filter(r => r.confidence >= 0.7).length
   agreement = nodesAboveConfidence / reports.length >= consensusThreshold

7. Return FusionConsensus
```

### Additional Methods

```typescript
export class MultiNodeFusion {
  constructor(private config: FusionConfig = DEFAULT_FUSION_CONFIG) {}

  fuseReports(reports: NodeReport[]): FusionConsensus
  fuseByTrackId(reports: NodeReport[]): Map<string, FusionConsensus>
  // Groups by trackId, calls fuseReports per group

  addReport(report: NodeReport): void
  // Stores in internal buffer keyed by nodeId+trackId

  getBufferedConsensus(trackId: string): FusionConsensus | null
  clearBuffer(): void
}

export class FusionInsufficientNodesError extends Error {
  constructor(public trackId: string, public nodeCount: number) {
    super(`Insufficient nodes for fusion of track ${trackId}: ${nodeCount}`);
    this.name = 'FusionInsufficientNodesError';
  }
}
```

### TDD RED — Test Cases

```typescript
describe('FR-W6-05: MultiNodeFusion', () => {
  it('fuseReports returns weighted centroid for 2 nodes')
  it('fuseReports returns weighted centroid for 3 nodes')
  it('closer node has higher weight than distant node')
  it('fusedConfidence is weighted average not simple average')
  it('agreement true when >=2/3 nodes have confidence >= 0.7')
  it('agreement false when <2/3 nodes have confidence >= 0.7')
  it('throws FusionInsufficientNodesError with fewer than minNodes')
  it('filters out reports older than maxAgeMs')
  it('filters out reports with distanceKm === 0')
  it('filters out reports below minConfidence')
  it('fuseByTrackId groups correctly by trackId')
  it('fuseByTrackId handles multiple tracks simultaneously')
  it('addReport stores in buffer')
  it('getBufferedConsensus returns null for unknown trackId')
  it('getBufferedConsensus fuses buffered reports')
  it('clearBuffer removes all stored reports')
  it('nodeCount reflects actual contributing nodes after filtering')
  it('contributingNodes list matches node ids used')
  it('consensus with single valid node (minNodes=1) returns that node position')
  it('identical positions from 3 nodes returns exact position')
})
```

---

## Task W6-T06: MonteCarloPropagator

**File:** `src/prediction/monte-carlo-propagator.ts`
**Test file:** `__tests__/prediction/monte-carlo-propagator.test.ts`
**Test count target:** 18 unit tests

### Interfaces

```typescript
import { EKFState, ImpactEstimate } from './types';

export interface MonteCarloConfig {
  sampleCount: number;        // default 1000 (reduce to 500 if >5ms)
  positionSigmaM: number;     // default 50 (metres, lat/lon uncertainty)
  velocitySigmaMs: number;    // default 2  (m/s velocity uncertainty)
  altitudeSigmaM: number;     // default 30
  percentileForRadius: number; // default 95
}

export interface MonteCarloResult {
  trackId: string;
  impactSamples: Array<{ lat: number; lon: number; timeToImpact: number }>;
  meanLat: number;
  meanLon: number;
  stdLat: number;
  stdLon: number;
  confidence95RadiusM: number;  // metres radius containing 95% of samples
  sampleCount: number;          // may be less than config if nulls filtered
  computedInMs: number;
}
```

### Algorithm — Diagonal Covariance Sampling

```
propagate(trackId, ekfState, config):
  start = performance.now()
  samples = []

  // Convert position sigma from metres to degrees
  latSigmaDeg  = positionSigmaM / 111320
  lonSigmaDeg  = positionSigmaM / (111320 * cos(ekfState.lat * PI/180))
  vLatSigma    = velocitySigmaMs / 111320
  vLonSigma    = velocitySigmaMs / (111320 * cos(ekfState.lat * PI/180))

  for i in 0..sampleCount:
    perturbedState = {
      lat:  ekfState.lat  + sampleGaussian(0, latSigmaDeg),
      lon:  ekfState.lon  + sampleGaussian(0, lonSigmaDeg),
      alt:  ekfState.alt  + sampleGaussian(0, altitudeSigmaM),
      vLat: ekfState.vLat + sampleGaussian(0, vLatSigma),
      vLon: ekfState.vLon + sampleGaussian(0, vLonSigma),
      vAlt: ekfState.vAlt + sampleGaussian(0, velocitySigmaMs),
    }
    impact = ImpactEstimator.estimate(perturbedState)
    if impact !== null:
      samples.push({ lat: impact.lat, lon: impact.lon, timeToImpact: impact.timeToImpactSeconds })

  meanLat = mean(samples.map(s => s.lat))
  meanLon = mean(samples.map(s => s.lon))
  stdLat  = std(samples.map(s => s.lat))
  stdLon  = std(samples.map(s => s.lon))

  // 95% radius: sort distances from mean, take 95th percentile
  distances = samples.map(s => haversineM(s.lat, s.lon, meanLat, meanLon))
  distances.sort()
  p95 = distances[floor(0.95 * distances.length)]

  computedInMs = performance.now() - start
  return MonteCarloResult
```

### Gaussian Sampling (Box-Muller)

```typescript
function sampleGaussian(mean: number, sigma: number): number {
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sigma * z;
}
```

### Implementation Order

1. Define interfaces, export defaults
2. Implement `sampleGaussian` (Box-Muller)
3. Implement `haversineM` helper (metres)
4. Implement `propagate` — main loop + stats
5. Implement `MonteCarloPropagator` class wrapping `propagate`
6. Inject `ImpactEstimator` for testability

### TDD RED — Test Cases

```typescript
describe('FR-W6-06: MonteCarloPropagator', () => {
  it('returns MonteCarloResult with correct trackId')
  it('sampleCount in result <= config.sampleCount')
  it('meanLat and meanLon are finite numbers')
  it('stdLat and stdLon are non-negative')
  it('confidence95RadiusM is positive')
  it('impactSamples array length equals sampleCount in result')
  it('computedInMs is positive')
  it('1000 samples complete in <10ms (performance)')
  it('500 samples complete in <5ms (performance)')
  it('results are probabilistic — two runs differ slightly')
  it('higher positionSigma produces larger confidence95RadiusM')
  it('lower positionSigma produces smaller confidence95RadiusM')
  it('sampleGaussian produces mean close to 0 for 10000 samples')
  it('sampleGaussian standard deviation close to sigma for 10000 samples')
  it('all impactSamples have finite lat, lon, timeToImpact')
  it('propagate with ImpactEstimator returning null for all samples returns 0 impactSamples')
  it('haversineM returns 0 for identical points')
  it('confidence95RadiusM larger than stdLat converted to metres')
})
```

---

## Task W6-T07: EdgeDeployer

**File:** `src/deploy/edge-deployer.ts`
**Test file:** `__tests__/deploy/edge-deployer.test.ts`
**Test count target:** 18 unit tests

### Interfaces

```typescript
export type DeviceType = 'rpi4' | 'jetson-nano' | 'x86-cpu';

export interface DeploymentManifest {
  deviceType: DeviceType;
  modelPath: string;
  precision: 'fp32' | 'fp16' | 'int8';
  maxMemoryMB: number;
  inferenceLatencyMs: number;   // measured during validateDeployment
  dependencies: string[];
  createdAt: number;
  version: string;
}

export interface DeviceProfile {
  deviceType: DeviceType;
  maxMemoryMB: number;
  preferredPrecision: 'fp32' | 'fp16' | 'int8';
  onnxRuntimeVersion: string;
  dependencies: string[];
}

export class EdgeDeploymentError extends Error {
  constructor(
    message: string,
    public readonly diagnostic: string
  ) {
    super(message);
    this.name = 'EdgeDeploymentError';
  }
}
```

### Device Profiles (built-in)

```typescript
const DEVICE_PROFILES: Record<DeviceType, DeviceProfile> = {
  'rpi4': {
    deviceType: 'rpi4',
    maxMemoryMB: 512,
    preferredPrecision: 'int8',
    onnxRuntimeVersion: '1.16.3',
    dependencies: ['onnxruntime-linux-aarch64', 'libusb-1.0'],
  },
  'jetson-nano': {
    deviceType: 'jetson-nano',
    maxMemoryMB: 2048,
    preferredPrecision: 'fp16',
    onnxRuntimeVersion: '1.16.3',
    dependencies: ['onnxruntime-linux-aarch64-gpu', 'cuda-11.4'],
  },
  'x86-cpu': {
    deviceType: 'x86-cpu',
    maxMemoryMB: 4096,
    preferredPrecision: 'fp32',
    onnxRuntimeVersion: '1.18.0',
    dependencies: ['onnxruntime'],
  },
};
```

### Methods

```typescript
export class EdgeDeployer {
  constructor(private onnxRunner: ONNXRunner) {}  // injected for testability

  getDeviceProfile(deviceType: DeviceType): DeviceProfile
  createManifest(deviceType: DeviceType, modelPath: string): DeploymentManifest
  quantize(modelPath: string, precision: 'fp16' | 'int8', outputPath: string): Promise<string>
  // Returns output path. Delegates to onnxRunner.quantize.

  validateDeployment(manifest: DeploymentManifest): Promise<boolean>
  // 1. Load model via onnxRunner.load(manifest.modelPath)
  // 2. Run test inference with zero-tensor input
  // 3. Measure latency
  // 4. Check latency vs manifest.inferenceLatencyMs threshold
  // 5. Throw EdgeDeploymentError if model fails to load or inference errors

  deploy(deviceType: DeviceType, modelPath: string): Promise<DeploymentManifest>
  // createManifest → quantize → validateDeployment → return manifest
}

export interface ONNXRunner {
  load(modelPath: string): Promise<void>;
  infer(input: Float32Array): Promise<Float32Array>;
  quantize(inputPath: string, precision: string, outputPath: string): Promise<void>;
  measureLatencyMs(): number;
}
```

### Implementation Order

1. Define interfaces, error class, device profiles
2. Implement `getDeviceProfile`
3. Implement `createManifest`
4. Implement `quantize` — delegate to onnxRunner
5. Implement `validateDeployment` — load + infer + latency check
6. Implement `deploy` — orchestrate
7. Export `DEVICE_PROFILES`

### TDD RED — Test Cases

```typescript
describe('FR-W6-07: EdgeDeployer', () => {
  it('getDeviceProfile returns correct profile for rpi4')
  it('getDeviceProfile returns correct profile for jetson-nano')
  it('getDeviceProfile returns correct profile for x86-cpu')
  it('createManifest sets deviceType correctly')
  it('createManifest uses preferredPrecision from device profile')
  it('createManifest sets createdAt to current timestamp')
  it('quantize calls onnxRunner.quantize with correct args')
  it('quantize returns output path')
  it('validateDeployment calls onnxRunner.load')
  it('validateDeployment calls onnxRunner.infer')
  it('validateDeployment returns true when model loads and infers')
  it('validateDeployment throws EdgeDeploymentError when load fails')
  it('validateDeployment throws EdgeDeploymentError when infer fails')
  it('EdgeDeploymentError has diagnostic field')
  it('deploy calls quantize then validateDeployment')
  it('deploy returns manifest with measured inferenceLatencyMs')
  it('rpi4 manifest maxMemoryMB is 512')
  it('jetson-nano manifest preferredPrecision is fp16')
})
```

---

## Task W6-T08: SentinelPipeline

**File:** `src/integration/sentinel-pipeline.ts`
**Test file:** `__tests__/integration/sentinel-pipeline.test.ts`
**Test count target:** 22 unit tests

### Interfaces

```typescript
export interface PipelineConfig {
  natsUrl: string;                // default 'nats://100.68.152.56:4222'
  offlineBufferSize: number;      // default 1000 frames max
  vadThreshold: number;           // default 0.6
  yamnetConfidenceThreshold: number; // default 0.85
}

export interface PipelineStatus {
  running: boolean;
  activeModules: string[];
  dropsPerSecond: number;
  processedFrames: number;
  bufferedFrames: number;
  lastFrameAt: number | null;
}

export interface AudioFrame {
  nodeId: string;
  trackId: string;
  samples: Float32Array;
  sampleRate: number;
  timestamp: number;
  lat: number;
  lon: number;
}

export interface ProcessedFrame {
  frame: AudioFrame;
  yamnetConfidence: number;
  fpAssessment: FalsePositiveAssessment;
  publishedToNats: boolean;
  buffered: boolean;
}

export class PipelineNotRunningError extends Error {
  constructor() {
    super('SentinelPipeline is not running. Call start() first.');
    this.name = 'PipelineNotRunningError';
  }
}
```

### Event Bus

```typescript
// Internal event bus — subscribe/publish pattern
type EventType =
  | 'frame:received'
  | 'frame:classified'
  | 'frame:filtered'
  | 'frame:published'
  | 'frame:buffered'
  | 'nats:connected'
  | 'nats:disconnected'
  | 'pipeline:started'
  | 'pipeline:stopped';

class EventBus {
  private handlers: Map<EventType, Function[]> = new Map();
  on(event: EventType, handler: Function): void
  off(event: EventType, handler: Function): void
  emit(event: EventType, data?: unknown): void
}
```

### Processing Flow

```
processAudioFrame(frame: AudioFrame): Promise<ProcessedFrame>
  throws PipelineNotRunningError if not running

  1. VAD: if energy(frame.samples) < vadThreshold → skip (not a detection event)
  2. FPG pre-check: if recent temporal samples suggest vehicle → skip
  3. YAMNet classify: confidence = yamnetBackend.classify(frame)
  4. FP assessment: fpGuard.assess(confidence, temporalHistory)
  5. If fpAssessment.isFalsePositive → emit 'frame:filtered', return
  6. DetectionInput → TrackManager update → EKF update
  7. Publish to NATS:
     - if NATS connected: publish, emit 'frame:published'
     - if NATS offline:   push to offlineBuffer (cap 1000), emit 'frame:buffered'
                          if buffer at cap, drop oldest (shift)
  8. Return ProcessedFrame
```

### Offline Buffer Drain

```typescript
async drainOfflineBuffer(): Promise<number>
// Drain buffered frames to NATS when connection restored
// Returns count of frames drained
// Called automatically on 'nats:connected' event
```

### Implementation Order

1. Define all interfaces, error class, EventBus
2. Implement `start()` / `stop()` — set running flag, emit events
3. Implement `getStatus()` — return PipelineStatus snapshot
4. Implement `on()` / `off()` event subscription (delegates to EventBus)
5. Implement VAD helper (RMS energy)
6. Implement `processAudioFrame` — full pipeline (all backends injected)
7. Implement offline buffer (circular, cap 1000)
8. Implement `drainOfflineBuffer`

### TDD RED — Test Cases (22)

```typescript
describe('FR-W6-08: SentinelPipeline', () => {
  it('start() sets running to true')
  it('stop() sets running to false')
  it('processAudioFrame throws PipelineNotRunningError when stopped')
  it('getStatus returns running: false before start')
  it('getStatus returns running: true after start')
  it('processAudioFrame increments processedFrames count')
  it('processAudioFrame skips low-energy frames (VAD gate)')
  it('processAudioFrame returns filtered when FP guard triggers')
  it('processAudioFrame publishes to NATS when connected')
  it('processAudioFrame buffers when NATS disconnected')
  it('offline buffer does not exceed 1000 frames')
  it('offline buffer drops oldest when at capacity')
  it('drainOfflineBuffer clears buffer on NATS reconnect')
  it('drainOfflineBuffer returns count of drained frames')
  it('event bus emits frame:received on each processAudioFrame call')
  it('event bus emits frame:published when NATS connected')
  it('event bus emits frame:buffered when NATS offline')
  it('event bus emits nats:disconnected when NATS goes offline')
  it('on() registers handler, off() removes it')
  it('multiple handlers can subscribe to same event')
  it('bufferedFrames count in status reflects current buffer size')
  it('start() emits pipeline:started event')
})
```

---

## Task W6-T09: CursorOfTruth

**File:** `src/output/cursor-of-truth.ts`
**Test file:** `__tests__/output/cursor-of-truth.test.ts`
**Test count target:** 16 unit tests

### Interfaces

```typescript
export interface TacticalReport {
  trackId: string;
  classification: string;       // 'shahed-136' | 'lancet-3' | etc.
  confidence: number;
  location: {
    lat: number;
    lon: number;
    coarsened: true;            // always true — coords coarsened by ~500m for OPSEC
  };
  velocity: {
    speedKmh: number;
    heading: number;
    altitude: number;
  };
  impactProjection: ImpactEstimate | null;
  timestamp: number;
  nodeCount: number;
}

export interface CursorConfig {
  vmGatewayUrl: string;         // http://4.231.218.96:7429/chat — NEVER ANTHROPIC_API_KEY
  model: string;                // 'claude-sonnet-4-6'
  fallbackToTemplate: boolean;  // default true
  timeoutMs: number;            // default 5000
}
```

### Coordinate Coarsening

```typescript
// Coarsen lat/lon to ~500m grid to prevent precise targeting by unauthorised viewers
function coarsenCoordinate(deg: number, gridSize: number = 0.005): number {
  return Math.round(deg / gridSize) * gridSize;
}
```

### VM Gateway Call (NEVER use ANTHROPIC_API_KEY)

```typescript
async format(report: TacticalReport): Promise<string>
// 1. Build prompt: "Generate a 2-sentence tactical assessment for: ..."
// 2. POST to vmGatewayUrl with { model, messages: [{role:'user', content: prompt}] }
// 3. timeout: config.timeoutMs
// 4. On success: return response text
// 5. On failure (network, timeout, non-200): if fallbackToTemplate → use template
//    else throw CursorOfTruthError

function templateFallback(report: TacticalReport): string {
  return `THREAT ALERT: ${report.classification.toUpperCase()} detected with ${(report.confidence * 100).toFixed(0)}% confidence. ` +
    `Tracking ${report.nodeCount} node(s). ` +
    (report.impactProjection
      ? `Estimated impact in ${report.impactProjection.timeToImpactSeconds.toFixed(0)}s.`
      : 'Impact projection unavailable.');
}
```

### Methods

```typescript
export class CursorOfTruth {
  constructor(
    private config: CursorConfig,
    private httpClient: HttpClient   // injected — mock in tests
  ) {}

  format(report: TacticalReport): Promise<string>
  coarsenReport(report: TacticalReport): TacticalReport  // applies coordinate coarsening
  buildPrompt(report: TacticalReport): string
}

export interface HttpClient {
  post(url: string, body: unknown, timeoutMs: number): Promise<{ status: number; body: string }>;
}
```

### Implementation Order

1. Define interfaces, coarsenCoordinate helper
2. Implement `templateFallback`
3. Implement `buildPrompt`
4. Implement `coarsenReport` (applies coarsenCoordinate to lat/lon)
5. Implement `format` — VM gateway call + fallback logic
6. Never import ANTHROPIC_API_KEY — always use vmGatewayUrl

### TDD RED — Test Cases

```typescript
describe('FR-W6-09: CursorOfTruth', () => {
  it('format calls VM gateway URL not Anthropic API')
  it('format returns template when gateway returns 500')
  it('format returns template when gateway times out')
  it('format returns gateway response on 200')
  it('coarsenReport rounds lat to ~0.005 degree grid')
  it('coarsenReport rounds lon to ~0.005 degree grid')
  it('coarsenReport preserves all other fields')
  it('buildPrompt includes classification')
  it('buildPrompt includes confidence as percentage')
  it('buildPrompt includes node count')
  it('templateFallback includes classification in uppercase')
  it('templateFallback includes confidence percentage')
  it('templateFallback includes timeToImpact when impactProjection present')
  it('templateFallback says "unavailable" when impactProjection null')
  it('format calls coarsenReport before sending to gateway')
  it('config.fallbackToTemplate false throws on gateway error')
})
```

---

## Task W6-T10: BRAVE1Format

**File:** `src/output/brave1-format.ts`
**Test file:** `__tests__/output/brave1-format.test.ts`
**Test count target:** 16 unit tests

### Interfaces

```typescript
export interface BRAVE1Message {
  type: string;       // 'a-f-A' (assumed friendly air) or 'a-h-A' (hostile air)
  uid: string;        // UUID
  time: string;       // ISO8601 UTC
  lat: number;        // WGS84 decimal degrees
  lon: number;        // WGS84 decimal degrees
  ce: number;         // circular error estimate (metres)
  hae: number;        // height above ellipsoid (metres)
  remarks: string;    // free-text tactical notes
  callsign: string;   // track identifier
  how: string;        // 'm-g' (machine generated)
  version: '1' | '2';
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface TransmitConfig {
  endpointUrl: string;
  timeoutMs: number;
  retries: number;
}
```

### Methods

```typescript
export class BRAVE1Format {
  constructor(private httpClient?: HttpClient) {}

  encode(report: TacticalReport): BRAVE1Message
  // Map:
  // type = confidence > 0.7 ? 'a-h-A' : 'a-f-A'
  // uid = crypto.randomUUID()
  // time = new Date(report.timestamp).toISOString()
  // lat = report.location.lat  (already coarsened)
  // lon = report.location.lon
  // ce = confidence95RadiusM from impactProjection or 500 (default)
  // hae = report.velocity.altitude
  // remarks = `${report.classification} | conf:${(report.confidence*100).toFixed(0)}% | nodes:${report.nodeCount}`
  // callsign = `SENTINEL-${report.trackId}`
  // how = 'm-g'
  // version = '2'

  decode(message: BRAVE1Message): Partial<TacticalReport>
  // Reverse mapping — partial because not all TacticalReport fields present in BRAVE1

  validate(message: BRAVE1Message): ValidationResult
  // Required: type, uid, time, lat, lon, ce, hae, callsign, how
  // lat: -90 to 90, lon: -180 to 180, ce: > 0

  async transmit(message: BRAVE1Message, config: TransmitConfig): Promise<boolean>
  // POST JSON to endpointUrl
  // Retry config.retries times on non-200
  // Return true on success, false on failure after all retries
}
```

### Implementation Order

1. Define all interfaces
2. Implement `validate` — check required fields and value ranges
3. Implement `encode` — map TacticalReport → BRAVE1Message
4. Implement `decode` — map BRAVE1Message → Partial<TacticalReport>
5. Implement `transmit` — POST + retry loop

### TDD RED — Test Cases

```typescript
describe('FR-W6-10: BRAVE1Format', () => {
  it('encode sets type to a-h-A for confidence > 0.7')
  it('encode sets type to a-f-A for confidence <= 0.7')
  it('encode sets uid as valid UUID')
  it('encode sets time as valid ISO8601 string')
  it('encode sets lat and lon from report location')
  it('encode sets hae from velocity.altitude')
  it('encode sets how to m-g')
  it('encode sets callsign with SENTINEL- prefix')
  it('encode sets version to 2')
  it('decode extracts classification from remarks')
  it('validate returns valid: true for well-formed message')
  it('validate returns error for missing uid')
  it('validate returns error for lat outside -90..90')
  it('validate returns error for lon outside -180..180')
  it('validate returns error for ce <= 0')
  it('transmit calls httpClient.post with correct URL')
})
```

---

## Summary Table

| Task | File | Tests | Key Complexity |
|------|------|-------|----------------|
| W6-T01 | acoustic-profile-library.ts | 20 | Frequency overlap scoring |
| W6-T02 | yamnnet-finetuner.ts | 18 | DI backend, mel spectrogram config |
| W6-T03 | false-positive-guard.ts | 22 | 4-step FP logic, circular heading variance |
| W6-T04 | dataset-pipeline.ts | 18 | Deterministic hash split |
| W6-T05 | multi-node-fusion.ts | 20 | IDW weighting, majority vote |
| W6-T06 | monte-carlo-propagator.ts | 18 | Box-Muller, perf <5ms |
| W6-T07 | edge-deployer.ts | 18 | ONNX DI, device profiles |
| W6-T08 | sentinel-pipeline.ts | 22 | Event bus, offline buffer |
| W6-T09 | cursor-of-truth.ts | 16 | VM gateway, coord coarsen |
| W6-T10 | brave1-format.ts | 16 | Encode/decode/validate |
| **TOTAL** | | **188** | |

Target: 484 (W1-W5) + 188 (W6) = **672+ tests** after W6 complete.
