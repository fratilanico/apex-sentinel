# APEX-SENTINEL — API_SPECIFICATION.md
## Wave 6: Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
### Wave 6 | Project: APEX-SENTINEL | Version: 6.0.0
### Date: 2026-03-25 | Status: APPROVED
### Supabase: bymfcnwfyxuivinuzurr (eu-west-2 London)

---

## 1. API OVERVIEW

W6 introduces the following new interfaces:

| Module | Interface Type | Direction | Consumer |
|---|---|---|---|
| `AcousticProfileLibrary` | TypeScript class | Internal | AcousticClassifier, FalsePositiveGuard |
| `YAMNetFineTuner` | TypeScript class | Internal / CLI | ML pipeline (offline training) |
| `FalsePositiveGuard` | TypeScript class | Internal | SentinelPipeline |
| `DatasetPipeline` | TypeScript class | CLI / batch | ML dataset engineer |
| `MultiNodeFusion` | TypeScript class | Internal | SentinelPipeline on Fortress |
| `MonteCarloPropagator` | TypeScript class | Internal | SentinelPipeline |
| `EdgeDeployer` | TypeScript class | CLI | DevOps / ML engineer |
| `SentinelPipeline` | TypeScript class | systemd entry | Production service |
| `CursorOfTruth` | TypeScript class | Internal | CotRelay |
| `BRAVE1Format` | TypeScript class | Internal / CLI | Integration partners |
| `sentinel.detections.acoustic` | NATS subject | Edge → Fortress | MultiNodeFusion |
| `sentinel.fusion.detections` | NATS subject | Fortress → Consumers | INDIGO AirGuard |
| `sentinel.risk.{trackId}` | NATS subject | Fortress → Dashboard | ATAK overlay |
| `sentinel.node.health.{nodeId}` | NATS subject | Edge → Ops | Health monitoring |

---

## 2. SHARED TYPES

All W6 modules share the following TypeScript type definitions.

```typescript
// src/ml/types.ts

export type DroneType = 'shahed-136' | 'lancet-3' | 'mavic-3' | 'orlan-10' | 'fpv-generic';
export type FalsePositiveClass = 'motorcycle-50cc' | 'generator-diesel' | 'lawnmower' | 'chainsaw' | 'ultralight' | 'ambient';
export type AcousticLabel = DroneType | FalsePositiveClass | 'unknown';
export type SplitType = 'train' | 'validation' | 'test' | 'unassigned';
export type DeviceTarget = 'rpi4' | 'jetson-nano' | 'x86';

export interface DroneAcousticProfile {
  droneType: DroneType;
  frequencyRange: [number, number];     // [fMin_hz, fMax_hz] — fundamental + harmonics
  rpmRange: [number, number];           // [rpmMin, rpmMax] at cruise
  dominantHarmonics: number[];          // Normalized amplitudes [1.0, 0.8, 0.5, ...]
  confidenceThreshold: number;          // Minimum classifier confidence to emit detection
  falsePositiveRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  notes: string;
}

export interface ClassificationResult {
  label: AcousticLabel;
  confidence: number;                   // 0.0–1.0, max of probabilities
  probabilities: Record<AcousticLabel, number>;
  processingTimeMs: number;
  modelVersion: string;                 // e.g. "yamnet-shahed-v1.2.0"
  windowStartMs: number;
  windowEndMs: number;
}

export interface AcousticDetectionEvent {
  id: string;                           // UUID v4
  nodeId: string;
  detectedAt: string;                   // ISO 8601 UTC
  classification: ClassificationResult;
  position: { lat: number; lon: number; alt: number } | null;
  snrDb: number;
  dopplerRateHzS: number | null;
}

export interface EKFState {
  lat: number;
  lon: number;
  alt: number;
  vLat: number;
  vLon: number;
  vAlt: number;
  covarianceDiag: [number, number, number, number, number, number];
}

export interface ILifecycle {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}
```

---

## 3. AcousticProfileLibrary

**File:** `src/ml/AcousticProfileLibrary.ts`
**Purpose:** Runtime catalogue of drone acoustic signatures. Used by classifier and false-positive guard.

### 3.1 Constructor

```typescript
class AcousticProfileLibrary {
  constructor(options?: { profilesPath?: string })
}
```

**Parameters:**
- `options.profilesPath` — optional path to JSON file with additional profiles. Defaults to built-in profiles for shahed-136, lancet-3, mavic-3, orlan-10.

**Built-in profiles loaded on construction (4 total):**

| droneType | frequencyRange | rpmRange | falsePositiveRisk |
|---|---|---|---|
| shahed-136 | [58, 400] | [7000, 9000] | CRITICAL (50cc moto overlap) |
| lancet-3 | [600, 5600] | [8000, 15000] | MEDIUM |
| mavic-3 | [100, 300] | [6000, 9000] | HIGH |
| orlan-10 | [40, 250] | [4500, 6500] | HIGH |

---

### 3.2 getProfile

```typescript
getProfile(droneType: DroneType): DroneAcousticProfile | null
```

Returns the acoustic profile for the given drone type, or `null` if not found.

**Example:**
```typescript
const lib = new AcousticProfileLibrary();
const profile = lib.getProfile('shahed-136');
// profile.frequencyRange → [58, 400]
// profile.falsePositiveRisk → 'CRITICAL'
```

**Throws:** Never. Returns `null` if droneType unknown.

---

### 3.3 getAllProfiles

```typescript
getAllProfiles(): DroneAcousticProfile[]
```

Returns all registered profiles as an array. Order is insertion order (built-ins first).

**Returns:** Array length ≥ 4 (built-ins always present).

---

### 3.4 matchFrequency

```typescript
matchFrequency(hz: number, rpm: number): MatchResult | null
```

Finds the best-matching drone profile given a detected fundamental frequency and RPM estimate.

```typescript
interface MatchResult {
  profile: DroneAcousticProfile;
  similarityScore: number;      // 0.0–1.0
  frequencyMatch: boolean;      // hz within profile.frequencyRange ± 20%
  rpmMatch: boolean;            // rpm within profile.rpmRange ± 10%
}
```

**Algorithm:**
1. For each profile: `freqScore = 1 - |hz - midHz| / (rangeHz / 2)` clamped to [0, 1]
2. `rpmScore = 1 - |rpm - midRpm| / (rangeRpm / 2)` clamped to [0, 1]
3. `similarityScore = 0.6 × freqScore + 0.4 × rpmScore`
4. Return the profile with highest `similarityScore` if > 0.3, else `null`

**Throws:** `TypeError` if hz ≤ 0 or rpm < 0.

---

### 3.5 addProfile

```typescript
addProfile(profile: DroneAcousticProfile): void
```

Adds a new profile to the library. If `droneType` already exists, overwrites.

**Throws:** `ValidationError` if required fields missing or frequencyRange[0] ≥ frequencyRange[1].

---

### 3.6 removeProfile

```typescript
removeProfile(droneType: DroneType | string): void
```

Removes a profile by drone type.

**Throws:** `ProfileNotFoundError` if droneType not registered.

---

## 4. YAMNetFineTuner

**File:** `src/ml/YAMNetFineTuner.ts`
**Purpose:** Manages the YAMNet fine-tuning training loop and ONNX export. Intended to run on GPU-equipped training machine, not on edge nodes.

### 4.1 Constructor

```typescript
class YAMNetFineTuner {
  constructor(options: {
    yamnetModelPath: string;          // Path to YAMNet SavedModel (TF Hub download)
    sampleRate?: number;              // Default 22050
    windowSizeS?: number;            // Default 2.0
    hopSizeS?: number;               // Default 0.5
    nMels?: number;                  // Default 128
    fMin?: number;                   // Default 80
    fMax?: number;                   // Default 8000
    headHiddenUnits?: number;        // Default 256
    dropoutRate?: number;            // Default 0.4
    learningRate?: number;           // Default 1e-4
    numClasses?: number;             // Default 3 (shahed/lancet/false_positive)
  })
}
```

---

### 4.2 loadDataset

```typescript
loadDataset(path: string): Promise<DatasetStats>
```

Loads a dataset directory. Expected structure:
```
path/
  train/
    shahed-136/   *.wav (22050 Hz mono float32)
    lancet-3/
    false_positive/
  validation/
    ...
  test/
    ...
```

```typescript
interface DatasetStats {
  totalSamples: number;
  splitCounts: Record<SplitType, number>;
  classCounts: Record<string, number>;
  totalDurationS: number;
  sampleRate: number;             // Validated (must be 22050)
  classImbalanceRatio: number;    // max_class_count / min_class_count
}
```

**Throws:**
- `DatasetError` if directory not found or structure invalid
- `DatasetError` if any .wav file is not 22050 Hz mono
- `DatasetError` if any split has < 10 samples

---

### 4.3 trainEpoch

```typescript
trainEpoch(batchSize?: number): Promise<TrainingMetrics>
```

Runs one full training epoch over the training split.

```typescript
interface TrainingMetrics {
  epoch: number;
  loss: number;
  accuracy: number;
  valLoss: number;
  valAccuracy: number;
  learningRate: number;
  durationMs: number;
  perClassMetrics: Record<string, { precision: number; recall: number; f1: number }>;
}
```

**Throws:** `TrainingError` if dataset not loaded first (call `loadDataset` before `trainEpoch`).

**Notes:**
- YAMNet base layers are frozen (not updated). Only classification head weights update.
- `batchSize` defaults to 32. Reduce to 16 on machines with < 8GB GPU VRAM.

---

### 4.4 evaluate

```typescript
evaluate(): Promise<EvaluationMetrics>
```

Runs inference on the held-out test split (never used during training).

```typescript
interface EvaluationMetrics {
  testLoss: number;
  testAccuracy: number;
  aucRoc: number;
  perClassMetrics: Record<string, {
    precision: number;
    recall: number;
    f1: number;
    support: number;     // Number of test samples in this class
  }>;
  falsePositiveRate: number;    // FP / (FP + TN) across all non-drone classes
  confusionMatrix: number[][];  // numClasses × numClasses
}
```

**Throws:** `EvaluationError` if test split is empty.

---

### 4.5 exportONNX

```typescript
exportONNX(outputPath: string): Promise<ExportResult>
```

Converts the trained model to ONNX format with INT8 quantization.

```typescript
interface ExportResult {
  outputPath: string;
  fileSizeBytes: number;
  quantization: 'INT8' | 'FP16' | 'FP32';
  onnxOpsetVersion: number;
  inferenceTimeMs: number;    // Single sample benchmark on export machine
  checksumSha256: string;
}
```

**Throws:**
- `ExportError` if model not trained (accuracy = 0)
- `ExportError` if outputPath directory does not exist
- `ExportError` if quantized model file exceeds 100MB

---

### 4.6 getMetrics

```typescript
getMetrics(): TrainingMetrics[]
```

Returns the training metrics history (one entry per epoch trained). Returns empty array if no epochs run.

---

## 5. FalsePositiveGuard

**File:** `src/ml/FalsePositiveGuard.ts`
**Purpose:** Wraps `AcousticClassifier` output with temporal analysis and Doppler-based false positive suppression.

### 5.1 Constructor

```typescript
class FalsePositiveGuard {
  constructor(options?: {
    fpThreshold?: number;          // Default 0.30 — suppress if P(fp) > this
    droneMinConfidence?: number;   // Default 0.70 — require P(drone) > this to emit
    temporalWindowS?: number;      // Default 10.0 — rolling window for temporal checks
    dopplerTransientThreshold?: number;  // Default 20.0 Hz/s — motorcycle Doppler threshold
    rfCrossCheckEnabled?: boolean; // Default true
    rfCrossCheckWindowMs?: number; // Default 30000 — 30s
  })
}
```

---

### 5.2 assess

```typescript
assess(
  detection: ClassificationResult,
  context: DetectionContext
): AssessmentResult
```

```typescript
interface DetectionContext {
  trackId: string | null;
  dopplerRateHzS: number | null;
  rfDetectedInWindow: boolean;     // True if RF detection in past rfCrossCheckWindowMs
  nodeId: string;
  timestamp: string;               // ISO 8601
}

interface AssessmentResult {
  shouldAlert: boolean;
  finalConfidence: number;
  falsePositiveProbability: number;
  suppressionReason: SuppressionReason | null;
  adjustedProbabilities: Record<AcousticLabel, number>;
}

type SuppressionReason =
  | 'FP_PROBABILITY_EXCEEDS_THRESHOLD'
  | 'DRONE_CONFIDENCE_BELOW_MINIMUM'
  | 'DOPPLER_TRANSIENT'
  | 'NO_RF_CORRELATION'
  | 'TEMPORAL_PATTERN_INCONSISTENT';
```

**Logic (in order, first match wins):**
1. If `dopplerRateHzS !== null && abs(dopplerRateHzS) > dopplerTransientThreshold` → suppress, reason: `DOPPLER_TRANSIENT`
2. If `rfCrossCheckEnabled && !rfDetectedInWindow && P(drone) < 0.80` → adjust `falsePositiveProbability += 0.20`
3. If `detection.probabilities.false_positive > fpThreshold && detection.confidence < droneMinConfidence` → suppress, reason: `FP_PROBABILITY_EXCEEDS_THRESHOLD`
4. If `detection.confidence < droneMinConfidence` → suppress, reason: `DRONE_CONFIDENCE_BELOW_MINIMUM`
5. Otherwise → emit (shouldAlert: true)

---

### 5.3 addTemporalSample

```typescript
addTemporalSample(sample: TemporalSample): void
```

```typescript
interface TemporalSample {
  trackId: string;
  timestamp: string;
  confidence: number;
  label: AcousticLabel;
  dopplerRateHzS: number | null;
}
```

Adds a sample to the rolling temporal window for a track. Samples older than `temporalWindowS` are evicted automatically.

---

### 5.4 clearWindow

```typescript
clearWindow(trackId?: string): void
```

Clears the temporal window. If `trackId` provided, clears only that track's window. If omitted, clears all windows.

---

### 5.5 getWindowStats

```typescript
getWindowStats(trackId: string): WindowStats
```

```typescript
interface WindowStats {
  trackId: string;
  sampleCount: number;
  windowDurationS: number;
  meanConfidence: number;
  meanDopplerRateHzS: number | null;
  maxDopplerRateHzS: number | null;
  dominantLabel: AcousticLabel | null;
  labelDistribution: Record<AcousticLabel, number>;   // Fraction 0.0–1.0
}
```

**Throws:** `TrackNotFoundError` if trackId has no samples in window.

---

### 5.6 shouldSuppressAlert

```typescript
shouldSuppressAlert(trackId: string): SuppressDecision
```

```typescript
interface SuppressDecision {
  suppress: boolean;
  reason: SuppressionReason | null;
  confidence: number;
}
```

Evaluates the full temporal window for a track and returns a final suppress/emit decision. Used after at least 3 samples are in the window to reduce transient false negatives.

---

### 5.7 setFpThreshold

```typescript
setFpThreshold(threshold: number): void
```

Dynamically adjust the false-positive suppression threshold. Useful for daytime (higher threshold, more permissive) vs nighttime (lower threshold, more sensitive) operating modes.

**Throws:** `RangeError` if threshold < 0.0 or > 1.0.

---

## 6. DatasetPipeline

**File:** `src/ingestion/DatasetPipeline.ts`
**Purpose:** Ingests audio from Telegram OSINT channels and field recordings, normalizes, augments, and splits for ML training.

### 6.1 Constructor

```typescript
class DatasetPipeline {
  constructor(options: {
    supabaseUrl: string;
    supabaseKey: string;
    storageBucket?: string;       // Default 'acoustic-training-data'
    tempDir?: string;             // Default '/tmp/apex-sentinel-dataset'
    targetSampleRate?: number;    // Default 22050
    windowSizeS?: number;         // Default 2.0
    hopSizeS?: number;            // Default 0.5
  })
}
```

---

### 6.2 ingest

```typescript
ingest(options: IngestOptions): Promise<IngestResult>
```

```typescript
interface IngestOptions {
  source: 'telegram' | 'youtube' | 'field';
  sourceUrl?: string;             // YouTube URL or local file path
  telegramChannel?: string;       // e.g. '@ukraine_war_footage'
  label: AcousticLabel;
  labelConfidence?: number;       // Default 0.5 for auto-labeled
  maxDurationS?: number;          // Default 3600 (1 hour) to prevent runaway downloads
}

interface IngestResult {
  itemsCreated: number;
  totalDurationS: number;
  storagePathsCreated: string[];
  reviewQueueItemsCreated: number;
  errors: string[];
}
```

**Process:**
1. Download audio via `yt-dlp` (YouTube) or Telegram API (Telegram)
2. Convert to WAV 22050 Hz mono via FFmpeg
3. Segment into 2s windows with 0.5s hop (zero-pad final window)
4. Upload WAV segments to Supabase storage bucket
5. Insert `acoustic_training_data` row per segment with `split = 'unassigned'`
6. Insert `review_queue` row per segment (for human labeling)

**Throws:** `IngestError` wrapping underlying yt-dlp or FFmpeg error with stderr output.

---

### 6.3 augment

```typescript
augment(itemId: string, options: AugmentOptions): Promise<AugmentResult>
```

```typescript
interface AugmentOptions {
  pitchShiftSemitones?: number;    // e.g. +2 or -2
  timeStretchRatio?: number;       // e.g. 1.1 (10% faster)
  noiseSnrDb?: number;             // e.g. 20 (20dB SNR additive noise)
  reverbIrProfile?: 'open-field' | 'urban' | 'forest';
}

interface AugmentResult {
  originalItemId: string;
  augmentedItemId: string;         // New UUID in acoustic_training_data
  storagePath: string;
  augmentationType: string;        // Human-readable description
}
```

Creates one new `acoustic_training_data` row with `augmented = true` and `augmentation_type` set. The augmented item inherits the human label (if reviewed) or auto label of the original.

**Throws:** `AugmentError` if original item not found or FFmpeg augmentation fails.

---

### 6.4 split

```typescript
split(ratio: { train: number; validation: number; test: number }): Promise<SplitResult>
```

```typescript
interface SplitResult {
  trainCount: number;
  validationCount: number;
  testCount: number;
  classDistribution: Record<string, { train: number; validation: number; test: number }>;
  imbalanceWarnings: string[];    // e.g. "shahed:train overrepresented by 12%"
}
```

Assigns `split` field on all `unassigned` reviewed items (human_label not null). Stratified by class.

**Throws:**
- `SplitError` if ratio values don't sum to 1.0 ± 0.001
- `SplitError` if fewer than 30 reviewed items available

---

### 6.5 exportTFRecord

```typescript
exportTFRecord(outputPath: string): Promise<ExportStats>
```

Exports all `split != null` items to TFRecord format for TensorFlow training.

```typescript
interface ExportStats {
  trainRecords: number;
  validationRecords: number;
  testRecords: number;
  outputPath: string;
  fileSizeBytes: number;
}
```

**Throws:** `ExportError` if output directory does not exist.

---

### 6.6 getStats

```typescript
getStats(): Promise<DatasetPipelineStats>
```

```typescript
interface DatasetPipelineStats {
  totalItems: number;
  reviewedItems: number;
  augmentedItems: number;
  itemsBySplit: Record<SplitType, number>;
  itemsByLabel: Record<string, number>;
  totalDurationS: number;
  storageUsedBytes: number;
  reviewQueuePending: number;
}
```

---

## 7. MultiNodeFusion

**File:** `src/fusion/MultiNodeFusion.ts`
**Purpose:** Fuses acoustic detections from multiple APEX-SENTINEL nodes into a single track event with TDoA-assisted position estimate.

### 7.1 Constructor

```typescript
class MultiNodeFusion {
  constructor(options?: {
    correlationWindowMs?: number;    // Default 5000 — events within ±5s are correlatable
    staleAgeMs?: number;             // Default 30000 — reports older than 30s are stale
    minNodesForTdoa?: number;        // Default 3 — minimum nodes for TDoA position
    singleNodeConfidencePenalty?: number;  // Default 0.3 — subtract from confidence if 1 node
    gdopThreshold?: number;          // Default 5.0 — discard TDoA if GDOP exceeds this
  })
}
```

---

### 7.2 addNodeReport

```typescript
addNodeReport(nodeId: string, detection: AcousticDetectionEvent): void
```

Adds an acoustic detection from a specific node to the fusion window. Reports for the same approximate time period are grouped for cross-correlation.

**Throws:** `ValidationError` if detection.nodeId !== nodeId.

---

### 7.3 fuse

```typescript
fuse(): FusionResult[]
```

```typescript
interface FusionResult {
  id: string;                           // UUID v4
  detectedAt: string;                   // ISO 8601, earliest contributing event
  sourceNodeIds: string[];
  fusedPosition: { lat: number; lon: number; alt: number } | null;
  fusedConfidence: number;
  droneType: DroneType | 'unknown';
  tdoaPositionUsed: boolean;            // true if ≥3 nodes and GDOP < threshold
  gdop: number | null;
  singleNodeOnly: boolean;
  multiNode: boolean;
}
```

Performs cross-correlation of all node reports within the current window. Returns one `FusionResult` per correlated cluster.

**Position algorithm:**
- 1 node: `fusedPosition = nodeGpsPosition` (confidence - singleNodeConfidencePenalty)
- 2 nodes: midpoint of TDoA hyperbola (single hyperbola constraint only)
- 3+ nodes: Chan-Taylor TDoA intersection (uses existing `TdoaCorrelator` from W2)

**Confidence algorithm:**
```
fusedConfidence = harmonicMean(nodeConfidences × distanceWeights)
distanceWeight_i = 1 / (distance(nodePos_i, estimatedTarget) + 1)
```

---

### 7.4 getConsensus

```typescript
getConsensus(trackId: string): FusionResult | null
```

Returns the latest fusion result for a given track ID. Returns `null` if no fusion result exists for that track.

---

### 7.5 clearStale

```typescript
clearStale(maxAgeMs?: number): number
```

Removes node reports older than `maxAgeMs` (defaults to constructor `staleAgeMs`). Returns the count of reports removed.

---

## 8. MonteCarloPropagator

**File:** `src/risk/MonteCarloPropagator.ts`
**Purpose:** Runs N=1000 ballistic simulations from the current EKF state to produce impact point distribution and uncertainty bounds.

### 8.1 Constructor

```typescript
class MonteCarloPropagator {
  constructor(options?: {
    nSamples?: number;          // Default 1000
    timeStepS?: number;         // Default 1.0 — integration time step
    maxSimTimeS?: number;       // Default 600 — abort simulation after 10 minutes
    droneType?: DroneType;      // Default 'shahed-136' (aerodynamic constants)
  })
}
```

**Aerodynamic constants by drone type:**

| droneType | mass_kg | wingArea_m2 | dragCoeff | terminalVelocity_ms |
|---|---|---|---|---|
| shahed-136 | 200 | 3.5 | 0.025 | 51 |
| lancet-3 | 5 | 0.3 | 0.030 | 40 |
| mavic-3 | 0.9 | 0.08 | 0.040 | 15 |
| orlan-10 | 14 | 1.8 | 0.028 | 35 |

---

### 8.2 propagate

```typescript
propagate(ekfState: EKFState, nSamples?: number): Promise<PropagationResult>
```

```typescript
interface PropagationResult {
  trackId?: string;
  computedAt: string;           // ISO 8601
  nSamples: number;
  computeTimeMs: number;
  impactPoints: Array<{ lat: number; lon: number }>;   // Length = nSamples
  meanImpactLat: number;
  meanImpactLon: number;
  stdImpactLatDeg: number;
  stdImpactLonDeg: number;
  confidence95RadiusM: number;  // Radius in metres enclosing 95% of impact points
  medianImpactLat: number;
  medianImpactLon: number;
}
```

**Per-sample algorithm:**
1. Sample initial state: `state_i ~ N(ekfState, diag(ekfState.covarianceDiag))`
2. Integrate with Euler method at `timeStepS` increments:
   - Apply drag: `a_drag = -0.5 × rhoAir × dragCoeff × wingArea × v² / mass`
   - Apply gravity: `a_z = -9.81 m/s²`
   - Update position: `lat += vLat × dt`, `lon += vLon × dt`, `alt += vAlt × dt`
3. Terminate when `alt ≤ 0` (ground impact)
4. Record `(lat, lon)` of termination point

**Throws:** `PropagationError` if `nSamples > 10000` (budget guard) or if ekfState.alt < 0.

---

### 8.3 getImpactDistribution

```typescript
getImpactDistribution(): ImpactDistribution
```

```typescript
interface ImpactDistribution {
  cells: Array<{
    lat: number;
    lon: number;
    probability: number;          // Count / nSamples
    cellSizeM: 50;
  }>;
  totalCells: number;             // After pruning P < 0.001
  peakCell: { lat: number; lon: number; probability: number };
  computedAt: string;
}
```

**Throws:** `StateError` if `propagate()` has not been called yet.

---

### 8.4 get95thPercentileBounds

```typescript
get95thPercentileBounds(): BoundingBox
```

```typescript
interface BoundingBox {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  centerLat: number;
  centerLon: number;
  radiusM: number;           // Approximate circular radius
  enclosedSampleFraction: number;   // Should be ≥ 0.95
}
```

Returns the smallest axis-aligned bounding box enclosing at least 95% of simulated impact points.

**Throws:** `StateError` if `propagate()` has not been called yet.

---

## 9. EdgeDeployer

**File:** `src/edge/EdgeDeployer.ts`
**Purpose:** Quantizes ONNX models for edge targets and generates deployment manifests.

### 9.1 Constructor

```typescript
class EdgeDeployer {
  constructor(options?: {
    memorBudgets?: Record<DeviceTarget, number>;  // MB, default: { rpi4: 512, 'jetson-nano': 2048, x86: 8192 }
    targetLatencyMs?: Record<DeviceTarget, number>;  // Default: { rpi4: 200, 'jetson-nano': 50, x86: 20 }
  })
}
```

---

### 9.2 quantize

```typescript
quantize(modelPath: string, targetDevice: DeviceTarget): Promise<QuantizeResult>
```

```typescript
interface QuantizeResult {
  outputPath: string;           // e.g. /path/to/yamnet-shahed-v1-rpi4-int8.onnx
  originalSizeBytes: number;
  quantizedSizeBytes: number;
  compressionRatio: number;
  quantization: 'INT8' | 'FP16';
  validationAccuracyDrop: number;   // Fraction — should be < 0.02
  checksumSha256: string;
}
```

**Quantization strategy by device:**
- `rpi4`: INT8 (post-training quantization, representative dataset required for calibration)
- `jetson-nano`: FP16 (GPU supports FP16 natively; better accuracy than INT8 at same speed)
- `x86`: FP32 (no quantization; used for accuracy benchmarking only)

**Throws:** `QuantizeError` if model file > 200MB (too large for edge regardless of quantization).

---

### 9.3 createManifest

```typescript
createManifest(
  quantizeResult: QuantizeResult,
  deviceType: DeviceTarget
): Promise<DeploymentManifest>
```

```typescript
interface DeploymentManifest {
  manifestVersion: '1.0';
  deviceType: DeviceTarget;
  targetArch: 'arm64' | 'aarch64' | 'x86_64';
  modelUri: string;             // Supabase storage URL
  modelChecksum: string;        // SHA256
  modelSizeBytes: number;
  runtimeVersion: string;       // onnxruntime version
  memoryBudgetMB: number;
  targetLatencyMs: number;
  nodeEnv: Record<string, string>;    // Required env vars for edge-runner.ts
  installScript: string;              // Shell commands to install on device
  generatedAt: string;
}
```

Writes manifest as `deployment-manifest-{deviceType}.json` in same directory as quantized model.

---

### 9.4 validateDeployment

```typescript
validateDeployment(
  deviceType: DeviceTarget,
  manifest: DeploymentManifest
): Promise<DeploymentValidationResult>
```

```typescript
interface DeploymentValidationResult {
  passed: boolean;
  modelLoaded: boolean;
  inferencePassed: boolean;
  inferenceTimeMs: number;
  memoryUsedMB: number;
  failures: string[];
}
```

Runs a local validation cycle: loads the quantized ONNX model, runs one inference pass with synthetic input, measures latency and memory, and compares against manifest targets.

**Throws:** `ValidationError` if ONNX Runtime cannot load the model (corrupt or incompatible opset).

---

## 10. SentinelPipeline

**File:** `src/integration/SentinelPipeline.ts`
**Purpose:** Top-level orchestrator. Implements `ILifecycle`. Wires all W1–W6 modules together via internal event bus.

### 10.1 Constructor

```typescript
class SentinelPipeline implements ILifecycle {
  constructor(config: SentinelPipelineConfig)
}

interface SentinelPipelineConfig {
  natsUrl: string;
  supabaseUrl: string;
  supabaseKey: string;
  nodeId: string;
  modelPath: string;            // Path to ONNX model
  mode: 'edge' | 'fortress';   // Edge: runs local audio capture; Fortress: consumes NATS only
  audioDeviceId?: string;       // ALSA device, only for mode='edge'
  fpThreshold?: number;         // Default 0.30
  confirmationThreshold?: number;  // Default 3 detections within 30s
  heartbeatIntervalS?: number;  // Default 30
}
```

---

### 10.2 start

```typescript
start(): Promise<void>
```

Starts all modules in dependency order:
1. NatsClient.connect()
2. Supabase client initialization
3. AcousticProfileLibrary load
4. AcousticClassifier load ONNX model
5. FalsePositiveGuard initialize
6. MultiNodeFusion initialize (fortress mode only)
7. MultiTrackEKFManager initialize (fortress mode only)
8. MonteCarloPropagator initialize (fortress mode only)
9. CotGenerator initialize
10. AudioCapture start (edge mode only)
11. Heartbeat timer start

**Throws:** `PipelineStartError` with root cause if any module fails to initialize.

---

### 10.3 stop

```typescript
stop(): Promise<void>
```

Stops all modules in reverse order. Flushes SQLite offline buffer before closing NATS. Waits up to 5 seconds for graceful shutdown; forces exit if exceeded.

---

### 10.4 processAudioFrame

```typescript
processAudioFrame(frame: Float32Array): Promise<void>
```

Processes a single audio frame through the pipeline. Called automatically by AudioCapture in normal operation; exposed for testing.

**Parameters:**
- `frame` — Float32Array of `sampleRate × windowSizeS` samples (typically 44100 at 22050Hz × 2s)

**Throws:** `PipelineError` if pipeline not running (call `start()` first).

---

### 10.5 getStatus

```typescript
getStatus(): PipelineStatus
```

```typescript
interface PipelineStatus {
  running: boolean;
  mode: 'edge' | 'fortress';
  uptimeS: number;
  modules: Array<{
    name: string;
    healthy: boolean;
    lastActivityAt: string | null;
    errorCount: number;
  }>;
  metrics: PipelineMetrics;
}
```

---

### 10.6 getMetrics

```typescript
getMetrics(): PipelineMetrics
```

```typescript
interface PipelineMetrics {
  framesProcessed: number;
  detectionsEmitted: number;
  fpsSuppressed: number;         // False positives suppressed by FalsePositiveGuard
  tracksActive: number;
  tracksConfirmed: number;
  natsMessagesPublished: number;
  natsReconnects: number;
  supabaseWriteErrors: number;
  offlineBufferSize: number;
  averageFrameLatencyMs: number;
}
```

---

## 11. CursorOfTruth

**File:** `src/integration/CursorOfTruth.ts`
**Purpose:** Generates CoT XML events enriched with W6 acoustic classification, EKF state, and Monte Carlo impact data.

### 11.1 format

```typescript
format(options: CotFormatOptions): string
```

```typescript
interface CotFormatOptions {
  trackId: string;
  droneType: DroneType | 'unknown';
  ekfState: EKFState;
  acousticConfidence: number;
  modelVersion: string;
  nodeCount: number;                       // Number of nodes contributing
  impactDistribution?: ImpactDistribution; // Optional Monte Carlo output
  bounds95?: BoundingBox;                  // Optional 95th pct bounds
  detectedAt: string;                      // ISO 8601
  staleTimeSec?: number;                   // Default 60
}
```

**Returns:** Valid CoT XML string conforming to CoT schema version 2.0.

**CoT type mapping:**
| droneType | cotType | remarks prefix |
|---|---|---|
| shahed-136 | `a-h-A-C-F` | `SHAHED-136` |
| lancet-3 | `a-h-A-M-F-Q` | `LANCET-3` |
| mavic-3 | `a-h-A-M-F-Q` | `FPV/MAVIC` |
| unknown | `a-u-A` | `UNIDENTIFIED-DRONE` |

**Detail block example:**
```xml
<detail>
  <remarks>APEX-SENTINEL acoustic confidence=0.87 class=shahed-136 nodes=3 model=yamnet-shahed-v1.2.0</remarks>
  <impact_zone lat_mean="48.5234" lon_mean="35.1123" radius_95pct_m="450" />
</detail>
```

**Throws:** `CotFormatError` if ekfState contains NaN values.

---

### 11.2 formatBatch

```typescript
formatBatch(results: CotFormatOptions[]): string
```

Formats multiple tracks into a single CoT XML document. Wraps multiple `<event>` elements.

**Returns:** CoT XML string with one `<event>` per input item.

**Throws:** `CotFormatError` if `results` is empty.

---

## 12. BRAVE1Format

**File:** `src/integration/BRAVE1Format.ts`
**Purpose:** Encodes and decodes NATO BRAVE-1 compatible tactical messages. Schema version 2.1.

### 12.1 encode

```typescript
encode(cot: string): BRAVE1Message
```

```typescript
interface BRAVE1Message {
  schemaVersion: '2.1';
  messageType: 'DETECTION' | 'TRACK_UPDATE' | 'IMPACT_ESTIMATE' | 'TRACK_LOST';
  messageId: string;                    // UUID v4
  generatedAt: string;                  // ISO 8601
  source: 'APEX-SENTINEL';
  track: {
    trackId: string;
    threatClassification: string;       // NATO threat code, e.g. "AIR_HOSTILE_FIXED_WING"
    position: {
      mgrs: string;                     // MGRS format, 10-digit precision
      altitude_m: number;
      altitudeReference: 'MSL' | 'AGL';
    };
    velocity: {
      heading_deg: number;
      speed_ms: number;
      verticalRate_ms: number;
    };
    confidence: number;                 // 0.0–1.0
    acousticSignature?: string;         // e.g. "PISTON_100-400HZ"
    rfDetected: boolean;
  };
  impactEstimate?: {
    position: { mgrs: string; altitude_m: 0 };
    confidence95RadiusM: number;
    estimatedAt: string;
  };
}
```

**Threat classification mapping:**
| droneType | NATO code |
|---|---|
| shahed-136 | `AIR_HOSTILE_FIXED_WING_CRUISE_MISSILE` |
| lancet-3 | `AIR_HOSTILE_LOITERING_MUNITION` |
| mavic-3 | `AIR_HOSTILE_ROTARY_WING_SMALL` |
| unknown | `AIR_UNKNOWN` |

**Throws:** `EncodingError` if CoT XML cannot be parsed.

---

### 12.2 decode

```typescript
decode(message: BRAVE1Message): BRAVE1DecodeResult
```

```typescript
interface BRAVE1DecodeResult {
  trackId: string;
  position: { lat: number; lon: number; alt: number };  // WGS84 (decoded from MGRS)
  heading_deg: number;
  speed_ms: number;
  confidence: number;
  droneType: DroneType | 'unknown';
  hasImpactEstimate: boolean;
  impactLat?: number;
  impactLon?: number;
}
```

Decodes a BRAVE1Message back to internal format. Used when consuming messages from AirGuard or other BRAVE-1 producers.

**Throws:** `DecodingError` with field path if any mandatory field is malformed.

---

### 12.3 validate

```typescript
validate(message: BRAVE1Message): ValidationReport
```

```typescript
interface ValidationReport {
  valid: boolean;
  errors: Array<{ field: string; rule: string; value: unknown }>;
  warnings: Array<{ field: string; message: string }>;
}
```

Validates a BRAVE1Message against the v2.1 schema. Does not throw — returns error list.

**Mandatory fields checked:** `schemaVersion`, `messageId`, `generatedAt`, `source`, `track.trackId`, `track.threatClassification`, `track.position.mgrs`, `track.confidence`.

---

### 12.4 transmit

```typescript
transmit(message: BRAVE1Message, endpoint: string): Promise<TransmitResult>
```

```typescript
interface TransmitResult {
  acked: boolean;
  httpStatus: number;
  responseTimeMs: number;
  retryCount: number;
  errorMessage?: string;
}
```

Posts the BRAVE1Message to an HTTP endpoint via POST with `Content-Type: application/brave1+json`.

**Retry policy:** Up to 3 retries on 5xx or timeout. Exponential backoff: 1s, 2s, 4s.

**Throws:** `TransmitError` if all retries exhausted or endpoint URL is invalid.

---

## 13. NATS SUBJECTS (W6)

### 13.1 sentinel.detections.acoustic.{nodeId}

**Direction:** Edge node → Fortress
**Schema:** `AcousticDetectionEvent` (see §2 Shared Types)
**QoS:** JetStream (WorkQueue), 1h retention
**Publish rate:** Up to 2 events/s per node when drone detected

---

### 13.2 sentinel.fusion.detections

**Direction:** Fortress → All consumers (INDIGO AirGuard, dashboard)
**Schema:** `FusionResult` (see §7.3 fuse)
**QoS:** JetStream (Limits), 1h retention
**Publish rate:** 1 event per fused detection cluster (up to 1/s during active tracks)

---

### 13.3 sentinel.risk.{trackId}

**Direction:** Fortress → Dashboard
**Schema:** `RiskHeatmapEvent`
```typescript
interface RiskHeatmapEvent {
  trackId: string;
  generatedAt: string;
  simulationCount: 1000;
  cells: Array<{ lat: number; lon: number; probability: number; cellSizeM: 50 }>;
  totalCells: number;
  computeTimeMs: number;
  peakImpactLat: number;
  peakImpactLon: number;
  confidence95RadiusM: number;
}
```
**QoS:** JetStream (Limits), 24h retention, MaxMsgSize 1MB
**Publish rate:** Every 10s per confirmed track

---

### 13.4 sentinel.node.health.{nodeId}

**Direction:** Edge node → Ops
**Schema:** `NodeHealth` (see §10.6 getMetrics)
**QoS:** JetStream (Limits), 24h retention
**Publish rate:** Every 30s per node

---

## 14. ERROR TYPES

```typescript
// src/errors.ts

export class ProfileNotFoundError extends Error { constructor(droneType: string) }
export class ValidationError extends Error { constructor(message: string, field?: string) }
export class DatasetError extends Error { constructor(message: string) }
export class TrainingError extends Error { constructor(message: string) }
export class EvaluationError extends Error { constructor(message: string) }
export class ExportError extends Error { constructor(message: string) }
export class IngestError extends Error { constructor(message: string, stderr?: string) }
export class AugmentError extends Error { constructor(message: string) }
export class SplitError extends Error { constructor(message: string) }
export class PropagationError extends Error { constructor(message: string) }
export class StateError extends Error { constructor(message: string) }
export class QuantizeError extends Error { constructor(message: string) }
export class PipelineStartError extends Error { constructor(message: string, cause: Error) }
export class PipelineError extends Error { constructor(message: string) }
export class CotFormatError extends Error { constructor(message: string) }
export class EncodingError extends Error { constructor(message: string) }
export class DecodingError extends Error { constructor(message: string, field?: string) }
export class TransmitError extends Error { constructor(message: string) }
export class TrackNotFoundError extends Error { constructor(trackId: string) }
export class BRAVE1ValidationError extends Error {
  constructor(message: string, public errors: ValidationReport['errors']) {}
}
```

---

## 15. INTERFACE COMPATIBILITY MATRIX

| W6 Module | Consumes From | Publishes To |
|---|---|---|
| AcousticProfileLibrary | — (built-in data) | AcousticClassifier, FalsePositiveGuard |
| YAMNetFineTuner | DatasetPipeline (files) | tflite-models bucket, EdgeDeployer |
| FalsePositiveGuard | AcousticClassifier output | SentinelPipeline event bus |
| DatasetPipeline | Telegram / YouTube / field | acoustic-training-data bucket, Supabase |
| MultiNodeFusion | NATS sentinel.detections.acoustic.* | sentinel.fusion.detections |
| MonteCarloPropagator | EKFState (W5 MultiTrackEKFManager) | RiskHeatmapEvent, sentinel.risk.* |
| EdgeDeployer | ONNX model file | deployment manifests, validation reports |
| SentinelPipeline | AudioCapture / NATS / all modules | sentinel.fusion.*, sentinel.risk.*, sentinel.cot.* |
| CursorOfTruth | EKFState, PropagationResult | CoT XML → CotRelay (W2) |
| BRAVE1Format | CursorOfTruth CoT XML | HTTP endpoint, sentinel.brave1.* |
