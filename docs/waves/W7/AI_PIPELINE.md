# APEX-SENTINEL W7 — AI Pipeline

> Wave: W7 — Hardware Integration Layer + Data Pipeline Rectification + Terminal Phase Detection
> Last updated: 2026-03-25
> Status: PLANNING
> Critical fix: 22050Hz → 16kHz migration (DATA BREACH with INDIGO training data)

---

## 1. Overview

W7 executes three parallel ML tracks:

1. **Pipeline Rectification** — migrate entire DatasetPipeline from 22050Hz to 16kHz to align with INDIGO AirGuard standard and Wild Hornets field dataset. All W1–W6 inference parameters are re-derived at the correct sample rate.
2. **Acoustic Profile Expansion** — add three new threat profiles: Gerbera (piston), Shahed-131 (small piston, higher RPM), Shahed-238 (jet turbine — completely different frequency domain from all prior piston models).
3. **Hybrid Inference for Terminal Phase** — TerminalPhaseDetector uses a 4-indicator finite state machine fusing ML probabilities with deterministic rule-based thresholds. ELRS 900MHz burst classification adds an RF fingerprint ML layer.

All inference remains on-node (edge devices). The VM gateway `http://4.231.218.96:7429/chat` (claude-sonnet-4-6) is used exclusively for CursorOfTruth tactical formatting. No inference decisions pass through Claude API.

---

## 2. Critical: 22050Hz → 16kHz Migration

### 2.1 Why This Is a Data Breach

INDIGO AirGuard pipeline produces all training data at 16kHz. The W6 DatasetPipeline ingested those files and resampled them UP from 16kHz to 22050Hz. This corrupts spectral content above 8kHz (Nyquist of 16kHz source) by introducing resampling artifacts. Fine-tuning on upsampled data causes the model to learn resampling artifacts, not acoustic signatures.

The Shahed-238 turbine profile is especially affected: its dominant energy (3–8kHz) falls exactly in the range distorted by upsampling from 16kHz.

### 2.2 Correction

All pipeline parameters must be re-derived at 16kHz:

```typescript
// W6 (WRONG — caused spectral corruption)
interface MelSpectrogramConfig_W6_DEPRECATED {
  sampleRate: 22050;      // Hz — WRONG: above INDIGO source rate
  windowSize: 2.0;
  hopSize: 0.5;
  nMels: 128;
  fMin: 80;
  fMax: 8000;
  nFFT: 2048;
  hopLength: 512;
}

// W7 (CORRECT — aligned with INDIGO 16kHz standard)
interface MelSpectrogramConfig {
  sampleRate: 16000;      // Hz — INDIGO AirGuard standard
  windowSize: 0.975;      // seconds — yields 15,600 samples at 16kHz
  hopSize: 0.49;          // seconds — ~50% overlap, 7,800 samples
  nMels: 128;             // mel filterbank bins (unchanged)
  fMin: 80;               // Hz (unchanged)
  fMax: 8000;             // Hz — Nyquist of 16kHz is exactly 8kHz
  nFFT: 1024;             // FFT points — recalculated for 16kHz
  hopLength: 256;         // samples — recalculated for 16kHz
}
```

### 2.3 Segment Length Rationale

0.975s × 16000 = 15,600 samples. This is the standard YAMNet input window at 16kHz. It aligns with:
- YAMNet's original 0.975s frame at 16kHz (Google's intended input)
- INDIGO AirGuard 1-second analysis windows (0.025s tolerance for windowing overhead)
- Wild Hornets field recordings (variable length, segmented to 0.975s tiles)

### 2.4 Regression Impact

Every module that hardcodes 22050 must be patched:

| Module | Parameter | W6 Value | W7 Value |
|---|---|---|---|
| DatasetPipeline | sampleRate | 22050 | 16000 |
| YAMNetFineTuner | inputSampleRate | 22050 | 16000 |
| AcousticProfileLibrary | referenceSampleRate | 22050 | 16000 |
| MelSpectrogramConfig | nFFT | 2048 | 1024 |
| MelSpectrogramConfig | hopLength | 512 | 256 |
| MelSpectrogramConfig | windowSize | 2.0s | 0.975s |
| EdgeDeployer | onnxInputShape | [1, 96, 64] | [1, 64, 64] |

---

## 3. Model Architecture

### 3.1 Base Model: YAMNet at 16kHz

YAMNet was originally designed for 16kHz audio. W6's use of 22050Hz was a departure from spec. W7 restores correct operation.

```
Input: 0.975s mono audio @ 16kHz (15,600 samples)
  ↓
Log-Mel Spectrogram [64 frames × 64 mel bins] at 16kHz
  ↓
YAMNet backbone (MobileNetV1, 3.7M params, Apache 2.0)
  ├── 14 depthwise-separable conv blocks (frozen in transfer learning)
  └── Global average pooling → 1024-dim embedding
  ↓
APEX DroneNet-13 head (W7 expanded from W6's 10-class)
  ├── Dense(256, relu)
  ├── BatchNorm
  ├── Dropout(0.35)
  └── Dense(13, softmax)
```

### 3.2 W7 Class Taxonomy (13 classes)

Three new classes added over W6's 10:

| Class ID | Label | Frequency Range | Engine Type | New in W7 |
|---|---|---|---|---|
| 0 | `shahed-136` | 100–400 Hz | Piston (MADO MD-550) | No |
| 1 | `lancet-3` | 1–4 kHz | Electric brushless | No |
| 2 | `fpv-racing` | 200–800 Hz | Electric brushless | No |
| 3 | `quadcopter-commercial` | 400 Hz–1.2 kHz | Electric brushless | No |
| 4 | `fixed-wing-electric` | 800 Hz–2 kHz | Electric brushless | No |
| 5 | `helicopter-small` | 60–200 Hz | Piston | No |
| 6 | `motorcycle-50cc` | 100–400 Hz | FALSE POSITIVE | No |
| 7 | `truck-diesel` | 50–150 Hz | FALSE POSITIVE | No |
| 8 | `generator-petrol` | 100–300 Hz | FALSE POSITIVE | No |
| 9 | `background-noise` | — | Rejection | No |
| 10 | `gerbera` | 200–600 Hz | Piston (boxer engine) | **YES** |
| 11 | `shahed-131` | 300–800 Hz | Piston (higher RPM) | **YES** |
| 12 | `shahed-238` | 3000–8000 Hz | JET TURBINE (micro turbojet) | **YES** |

### 3.3 Shahed-238 Turbine — Separate Model Branch

Shahed-238 uses a micro turbojet engine. Its acoustic signature is fundamentally different from all piston/electric models. A single shared model head cannot adequately discriminate turbine from piston because:

- Piston fundamental: 50–800 Hz (RPM/2 for 4-stroke)
- Turbine fundamental: 3,000–8,000 Hz (blade pass frequency at 30,000–80,000 RPM)
- Harmonic structure: turbine produces dense harmonic comb above 3kHz; piston produces sparse low harmonics

W7 introduces a **turbine branch** in the classification head:

```
YAMNet embedding (1024-dim)
  ├── Piston/Electric Branch
  │     Dense(256, relu) → Dense(12, softmax)
  │     classes: shahed-136, lancet-3, fpv, quad, fw-elec, heli,
  │              motorcycle, truck, generator, noise, gerbera, shahed-131
  │
  └── Turbine Branch
        Dense(128, relu) → Dense(2, softmax)
        classes: shahed-238, background-noise
        Activated only when spectral centroid > 2000 Hz
```

The routing logic:

```typescript
interface ClassificationRouter {
  spectralCentroid: number;  // Hz
  turbineThreshold: 2000;    // Hz — routes to turbine branch if exceeded
}

function route(embedding: Float32Array, centroid: number): string {
  if (centroid > 2000) {
    return turbineBranch.classify(embedding);
  }
  return pistonBranch.classify(embedding);
}
```

---

## 4. New Acoustic Profiles — W7

### 4.1 Gerbera (Piston Boxer Engine)

Gerbera is a Ukrainian loitering munition with a boxer (opposed-piston) engine configuration. Boxer engines produce a distinctive even-order harmonic suppression pattern.

```typescript
const gerberaProfile: AcousticProfile = {
  id: 'gerbera',
  label: 'gerbera',
  engineType: 'piston-boxer',
  rpmRange: [6000, 9000],           // RPM at cruise
  fundamentalFreqRange: [200, 300], // Hz — (RPM/60) * cylinders/2
  harmonicCount: 6,
  harmonicSpacing: 'even-order-suppressed',
  freqMin: 200,
  freqMax: 600,
  propellerBladePass: 400,          // Hz — 2-blade prop at ~12,000 RPM equiv
  spectralCentroid: 380,            // Hz typical
  falsePositiveRisk: 'medium',      // overlaps agricultural machinery
  trainingDataSource: 'wild-hornets-field-recordings',
  minConfidenceThreshold: 0.72,
};
```

### 4.2 Shahed-131 (Small Piston, Higher RPM)

Shahed-131 is a smaller variant with higher rotational speed. Key discriminators vs Shahed-136: higher fundamental frequency, thinner propeller, less low-frequency rumble.

```typescript
const shahed131Profile: AcousticProfile = {
  id: 'shahed-131',
  label: 'shahed-131',
  engineType: 'piston-2stroke',
  rpmRange: [9000, 14000],          // RPM at cruise — significantly higher than Shahed-136
  fundamentalFreqRange: [300, 467], // Hz — RPM/60 for 2-stroke
  harmonicCount: 8,
  freqMin: 300,
  freqMax: 800,
  spectralCentroid: 520,            // Hz typical
  falsePositiveRisk: 'medium',      // overlaps small moped/chainsaw at distance
  trainingDataSource: 'wild-hornets-field-recordings',
  minConfidenceThreshold: 0.75,
};
```

### 4.3 Shahed-238 (Jet Turbine — Micro Turbojet)

This is the most operationally significant new profile. The micro turbojet acoustic signature requires entirely different feature extraction focus.

```typescript
const shahed238Profile: AcousticProfile = {
  id: 'shahed-238',
  label: 'shahed-238',
  engineType: 'jet-turbine-micro',
  shaftSpeedRange: [30000, 80000],  // RPM — micro turbojet operating range
  fundamentalFreqRange: [3000, 8000], // Hz — blade pass frequency dominant
  harmonicCount: 12,                // dense harmonic comb
  freqMin: 3000,
  freqMax: 8000,
  spectralCentroid: 5500,           // Hz typical at cruise
  distinctiveFeatures: [
    'high-frequency-whine',
    'turbine-whine-harmonics',
    'exhaust-broadband-hiss',
    'blade-pass-comb-3kHz-plus',
  ],
  falsePositiveRisk: 'low',         // turbine at drone scale is distinctive
  trainingDataSource: 'wild-hornets-field-recordings',
  minConfidenceThreshold: 0.80,     // high confidence required given counter-measure implications
  routingBranch: 'turbine',         // MUST use turbine branch
};
```

---

## 5. Wild Hornets Dataset Integration

### 5.1 Dataset Overview

Wild Hornets is a Ukrainian field recording dataset with 3,000+ recordings of real drones in operational conditions. It is the highest-quality labeled drone audio corpus available for Eastern European threat profiles.

```
Dataset: Wild Hornets Field Recordings
Source: INDIGO partnership (Ukrainian acoustic intelligence unit)
Size: 3,000+ recordings
Format: WAV, 16kHz, mono (INDIGO standard)
Labels: RAVEN annotation format (start/end/class)
Geographic: Ukrainian front-line urban + agricultural environments
Conditions: Day/night, wind (0–30 km/h), rain (light), varying SNR
Classes covered: shahed-136, shahed-131, shahed-238, gerbera, lancet-3, fpv-racing
```

### 5.2 Ingestion Pipeline

```typescript
interface WildHornetsIngestionConfig {
  sourcePath: string;               // local mount point or S3 path
  targetSampleRate: 16000;          // Hz — already native, no resampling needed
  segmentLength: 0.975;             // seconds
  minSNR: 6;                        // dB — reject below this
  labelFormat: 'raven-selection-table';
  outputFormat: 'tfrecord' | 'numpy-npz';
  validateSpectralContent: true;    // verify 16kHz Nyquist compliance
}
```

### 5.3 Label Verification

Every Wild Hornets recording goes through label verification:

1. Spectral centroid check: if label is `shahed-238` but centroid < 2000Hz → flag for human review
2. Duration check: recordings < 0.5s discarded (insufficient context)
3. SNR estimation (RMS signal / RMS noise floor): < 6dB rejected
4. Duplicate detection: MD5 hash of raw audio bytes, deduplicate before split

### 5.4 Train/Val/Test Split

```
Total Wild Hornets: 3,000+ recordings → ~18,000 segments after tiling
Split:
  Train: 70%  → ~12,600 segments
  Val:   15%  → ~2,700 segments
  Test:  15%  → ~2,700 segments

Stratification: per-class balanced, per-recording-location balanced
  (prevent geographic leakage: don't split same field recording across train/test)
```

---

## 6. Data Augmentation Strategy

### 6.1 Romanian Urban Noise

The primary deployment environment is Romanian urban/peri-urban. Augmentation must simulate local noise conditions.

```typescript
interface RomanianUrbanAugmentation {
  sources: [
    'bucharest-traffic-recordings',   // dense urban traffic, tram, bus
    'industrial-zona-industriala',     // Ploiesti oil refinery hum, factory HVAC
    'agricultural-transylvania',       // tractor, combine harvester, chainsaw
    'river-valley-reverb',            // Danube/Olt valley multipath
  ];
  snrRange: [0, 20];                  // dB — augment at various SNR levels
  probabilityPerSample: 0.6;          // 60% of training samples get noise mixed
}
```

### 6.2 TAU Urban Acoustic Scenes 2022

TAU Urban 2022 is the DCASE challenge dataset providing calibrated urban acoustic scenes across 12 European cities (including Bucharest-adjacent soundscapes). Used as background noise source.

```typescript
interface TAUAugmentationConfig {
  dataset: 'TAU-Urban-Acoustic-Scenes-2022-Mobile';
  scenes: [
    'airport',          // relevant: similar to open-air perimeter
    'park',             // relevant: outdoor open space
    'street-traffic',   // relevant: urban deployment
    'shopping-mall',    // NOT used — indoor, irrelevant
  ];
  resampleTo: 16000;    // Hz — TAU provides at 44.1kHz, must downsample
  normalizeRMS: -23;    // LUFS — normalize before mixing
}
```

### 6.3 Full Augmentation Chain

```
Raw segment (0.975s @ 16kHz)
  ├── [60% prob] Mix Romanian urban noise at SNR ∈ [0, 20] dB
  ├── [40% prob] Mix TAU Urban scene at SNR ∈ [5, 25] dB
  ├── [30% prob] Apply SpecAugment (time masking: max 40 frames, freq masking: max 20 bins)
  ├── [20% prob] Time stretch (rate ∈ [0.9, 1.1]) — simulates speed variation
  ├── [20% prob] Pitch shift (±1 semitone) — simulates altitude/airspeed effects
  ├── [15% prob] Apply room impulse response (open-field IR from Romanian sites)
  └── [10% prob] Clip distortion (simulate microphone saturation at close range)
```

SpecAugment is applied in spectrogram domain AFTER mel computation, not on raw waveform.

---

## 7. YAMNet Fine-Tuning at 16kHz

### 7.1 Training Configuration

```python
# W7 Training config (Python — training runs off-node on GPU server)
training_config = {
    'base_model': 'yamnet',
    'sample_rate': 16000,          # CORRECTED from W6's 22050
    'segment_length_s': 0.975,
    'batch_size': 64,
    'epochs': 50,
    'learning_rate': 1e-4,
    'lr_schedule': 'cosine_decay_restarts',
    'weight_decay': 1e-5,
    'freeze_backbone': True,       # freeze YAMNet backbone for first 20 epochs
    'unfreeze_after_epoch': 20,    # fine-tune last 2 backbone blocks after epoch 20
    'optimizer': 'AdamW',
    'loss': 'categorical_crossentropy',
    'label_smoothing': 0.1,
    'mixed_precision': 'float16',  # for GPU training
    'early_stopping_patience': 8,
    'checkpoint_metric': 'val_f1_macro',
}
```

### 7.2 Class Imbalance Handling

Wild Hornets has strong class imbalance (Shahed-136 over-represented, Shahed-238 and Gerbera under-represented due to operational rarity).

```
Class weights (inverse frequency):
  shahed-136:          1.0   (reference)
  lancet-3:            1.8
  fpv-racing:          2.1
  quadcopter-commercial: 1.4
  fixed-wing-electric: 2.3
  helicopter-small:    2.8
  motorcycle-50cc:     1.2   (false positive — abundant)
  truck-diesel:        1.1   (false positive — abundant)
  generator-petrol:    1.3   (false positive — moderate)
  background-noise:    0.9   (abundant)
  gerbera:             3.5   (rare — limited field recordings)
  shahed-131:          2.9   (rare)
  shahed-238:          4.2   (very rare — turbine jets seldom captured)
```

### 7.3 Evaluation Metrics

Primary metric: **macro F1** (equal weight across all 13 classes).

Secondary metrics:
- Per-class recall for threat classes (shahed-136, shahed-131, shahed-238, gerbera, lancet-3) — must be ≥ 0.85
- False positive rate for false-positive classes (motorcycle, truck, generator) — must be ≤ 0.05
- Confusion matrix inspection: turbine vs piston misclassification rate — must be < 0.02

```typescript
interface EvaluationThresholds {
  macroF1: 0.88;                    // minimum acceptable
  threatClassRecall: 0.85;          // per-class, all threat classes
  falsePositiveClassFPR: 0.05;      // max FP rate on FP classes
  turbinePistonMixupRate: 0.02;     // shahed-238 confused as piston or vice versa
}
```

---

## 8. ELRS 900MHz RF Fingerprint ML

### 8.1 FHSS Burst Pattern Overview

ExpressLRS (ELRS) 900MHz uses frequency-hopping spread spectrum. The control link hops across ~80 channels in the 868–928 MHz band. Key characteristics for ML classification:

- Hop interval: 4ms at 250Hz packet rate; 2ms at 500Hz; 1ms at 1000Hz
- Burst duration: 1–3ms per channel
- Power: typically 100–250mW EIRP (FPV control link)
- Pattern: pseudo-random but deterministic per binding phrase
- Link cut behavior: operators disable transmitter 2–10 seconds before impact (kamikaze mode)

### 8.2 RF Feature Extraction

Input to RF classifier: power spectral density sweep of 868–928 MHz band, sampled at 1 MHz resolution, 10ms windows.

```typescript
interface RFFeatureVector {
  bandPowerProfile: Float32Array;   // 60 bins × 10ms = 600 values (PSD at 1MHz res)
  burstDetected: boolean;           // energy > threshold in any 1MHz bin
  burstDuration_ms: number;
  hopIntervalEstimate_ms: number;
  channelCount: number;             // distinct channels visited in last 100ms
  linkQualityEstimate: number;      // 0–1: fraction of expected packets received
  silenceDuration_ms: number;       // time since last burst — key for terminal phase
}
```

### 8.3 FHSS Burst Classifier

A lightweight CNN classifies 100ms RF spectrograms into: `elrs-fpv`, `elrs-long-range`, `other-fhss`, `noise`.

```
Input: 60 freq bins × 10 time steps (100ms @ 10ms resolution)
  ↓
Conv2D(32, 3×3, relu)
  ↓
MaxPool(2×2)
  ↓
Conv2D(64, 3×3, relu)
  ↓
GlobalAvgPool
  ↓
Dense(32, relu)
  ↓
Dense(4, softmax)   [elrs-fpv | elrs-lr | other-fhss | noise]
```

Parameters: ~85K — fits in RPi4 RAM alongside acoustic model.

### 8.4 Link Silence Detection

The most operationally critical behavior: detecting when the operator cuts the ELRS link (2–10 seconds before impact in kamikaze mode).

```typescript
interface LinkSilenceDetector {
  rollingWindowMs: 2000;            // 2-second window
  silenceThresholdMs: 800;          // no burst detected for 800ms = silence flag
  lastBurstTimestamp: number;
  silenceFlagActive: boolean;

  computeSilenceDuration(): number;
  isSilenceConfirmed(minDurationMs: number): boolean;
}
```

Link silence is one of the 4 TerminalPhaseDetector indicators. It must be false-positive safe: legitimate out-of-range loss also produces silence. The FSM requires all 4 indicators simultaneously.

---

## 9. TerminalPhaseDetector — Hybrid Rule/ML FSM

### 9.1 Four-Indicator FSM Design

The TerminalPhaseDetector is not purely ML — it is a finite state machine with 4 binary indicators. Each indicator can be ML-derived or rule-based.

```
States: CRUISE → DESCENDING → TERMINAL_CANDIDATE → TERMINAL_CONFIRMED

Transition to TERMINAL_CONFIRMED requires all 4 indicators TRUE simultaneously
for a sustained window of ≥500ms.
```

### 9.2 Indicator Definitions

**Indicator 1: Speed Threshold**
```typescript
interface SpeedIndicator {
  method: 'rule-based';
  inputSource: 'EKF vLat/vLon state vector';
  threshold_ms: 50;                 // m/s — above this = fast approach
  sustainedWindowMs: 300;
  logic: 'ground_speed > threshold for sustainedWindow';
}
```

**Indicator 2: Heading Variance**
```typescript
interface HeadingVarianceIndicator {
  method: 'rule-based';
  inputSource: 'EKF heading estimate (degrees)';
  varianceThreshold_degrees: 45;    // heading variance < 45° over window = locked heading
  windowMs: 1000;
  logic: 'heading_variance(last 1s) < 45 degrees';
}
```

**Indicator 3: Altitude Descent Rate**
```typescript
interface DescentRateIndicator {
  method: 'rule-based';
  inputSource: 'EKF altitude state or barometric input';
  descentRateThreshold_ms: 5;       // m/s — descending faster than 5 m/s
  sustainedWindowMs: 500;
  logic: 'altitude_rate < -5 m/s for 500ms';
}
```

**Indicator 4: RF Silence**
```typescript
interface RFSilenceIndicator {
  method: 'ml-assisted';
  inputSource: 'LinkSilenceDetector from ELRS 900MHz module';
  silenceThresholdMs: 800;
  priorBurstRequired: true;         // must have seen bursts before silence counts
  logic: 'prior_burst_seen AND silence_duration > 800ms';
}
```

### 9.3 FSM State Transitions

```
CRUISE:
  → DESCENDING when: descentRate indicator = TRUE for 500ms

DESCENDING:
  → TERMINAL_CANDIDATE when: descentRate + headingVariance + speedThreshold = all TRUE
  → CRUISE when: descentRate = FALSE for 2s

TERMINAL_CANDIDATE:
  → TERMINAL_CONFIRMED when: all 4 indicators TRUE for ≥500ms simultaneously
  → DESCENDING when: speedThreshold or headingVariance reverts FALSE

TERMINAL_CONFIRMED:
  Emits TERMINAL_PHASE event with confidence 0.9 + indicator_bonus
  → CRUISE when: altitude < minimum_operating_altitude (assumed impact)
```

### 9.4 Confidence Scoring

```typescript
function computeTerminalConfidence(indicators: IndicatorState): number {
  const weights = {
    speed:        0.25,
    headingLock:  0.30,
    descentRate:  0.25,
    rfSilence:    0.20,
  };

  const rawScore =
    (indicators.speed ? weights.speed : 0) +
    (indicators.headingLock ? weights.headingLock : 0) +
    (indicators.descentRate ? weights.descentRate : 0) +
    (indicators.rfSilence ? weights.rfSilence : 0);

  // Minimum 0.9 when all 4 active — floor prevents false leniency
  if (indicators.allActive) {
    return Math.max(0.90, rawScore);
  }
  return rawScore;
}
```

---

## 10. ONNX Export and Edge Quantization

### 10.1 Export Pipeline

Training produces a TensorFlow SavedModel. Export chain:

```
TF SavedModel (float32, ~14MB)
  ↓  tf2onnx --opset 17
ONNX FP32 model (~14MB)
  ↓  onnxruntime quantization (static INT8)
ONNX INT8 model (~3.5MB)  ← RPi4 deployment artifact
  ↓  ONNX FP16 conversion (for Jetson Nano)
ONNX FP16 model (~7MB)   ← Jetson Nano deployment artifact
```

### 10.2 Quantization Calibration at 16kHz

INT8 quantization requires a calibration dataset. The calibration set must use 16kHz audio.

```typescript
interface QuantizationCalibrationConfig {
  calibrationSetSize: 200;          // samples — enough for activation range estimation
  sampleRate: 16000;                // MUST match training — was 22050 in W6
  perChannelQuantization: true;
  activationCalibration: 'percentile-99.99';
  weightQuantization: 'symmetric';
}
```

### 10.3 Inference Latency Targets (16kHz corrected)

| Device | Model | Latency | Throughput |
|---|---|---|---|
| RPi4 (INT8) | DroneNet-13 piston branch | < 45ms | 22 inferences/s |
| RPi4 (INT8) | DroneNet-13 turbine branch | < 20ms | 50 inferences/s |
| Jetson Nano (FP16) | DroneNet-13 piston branch | < 12ms | 83 inferences/s |
| Jetson Nano (FP16) | DroneNet-13 turbine branch | < 6ms | 167 inferences/s |
| Jetson Nano (FP16) | FHSS Burst Classifier | < 3ms | 333 inferences/s |

Turbine branch is cheaper because the model is smaller (2-class head vs 12-class).

### 10.4 W7 Model Artifacts

```
artifacts/models/W7/
├── dronenet-13-fp32.onnx           (full precision, training output)
├── dronenet-13-int8-rpi4.onnx      (RPi4 deployment)
├── dronenet-13-fp16-jetson.onnx    (Jetson deployment)
├── fhss-classifier-int8.onnx       (ELRS RF classifier, both devices)
├── calibration-dataset-16khz/      (200 samples for quant calibration)
├── class_labels_w7.json            (13-class label map)
└── model_card_w7.md                (performance metrics, training data provenance)
```

---

## 11. Model Card — W7

| Property | Value |
|---|---|
| Model name | APEX DroneNet-13 W7 |
| Base | YAMNet (Google, Apache 2.0) |
| Sample rate | **16kHz** (corrected from W6 22050Hz) |
| Segment length | 0.975 seconds |
| Classes | 13 (10 original + gerbera + shahed-131 + shahed-238) |
| Training data | Wild Hornets 3000+ + augmented with Romanian urban + TAU 2022 |
| Val macro F1 target | ≥ 0.88 |
| Threat class recall target | ≥ 0.85 per class |
| INT8 latency RPi4 | < 45ms |
| FP16 latency Jetson | < 12ms |
| ONNX opset | 17 |
| License | Apache 2.0 (YAMNet base) + APEX proprietary (head + training data) |
| Known limitations | Shahed-238 recall may be lower (< 5% of training data) |
| Intended use | Military C-UAS acoustic detection, Romania operational area |
| Out-of-scope | Civilian surveillance, crowd monitoring, personal tracking |

---

*End of AI_PIPELINE.md — W7*
