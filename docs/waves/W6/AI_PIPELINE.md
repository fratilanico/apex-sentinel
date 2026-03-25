# APEX-SENTINEL W6 — AI Pipeline

> Wave: W6 — Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
> Last updated: 2026-03-25
> Status: PLANNING

---

## 1. Overview

W6 introduces production-grade ML inference into APEX-SENTINEL. The W1 YAMNet surrogate (AudioSet classes mapped to drone categories) is replaced with a fine-tuned model trained on real drone audio collected from OSINT channels and field recordings. The pipeline covers the full ML lifecycle: data ingestion → augmentation → fine-tuning → evaluation → ONNX export → quantized edge deployment.

All inference runs on-node (edge devices). Claude API (`claude-sonnet-4-6` via VM gateway `http://4.231.218.96:7429/chat`) is used exclusively for tactical Chain-of-Thought formatting in CursorOfTruth, NOT for inference decisions.

---

## 2. Model Architecture

### 2.1 Base Model: Google AudioSet YAMNet-512

| Property | Value |
|---|---|
| Architecture | MobileNetV1 depthwise-separable CNN |
| Input | 96ms log-mel spectrogram patches |
| Output classes | 521 AudioSet categories |
| Embedding dim | 512 |
| Parameters | ~3.7M |
| Pretrained on | AudioSet (2M clips, 632 hours) |
| License | Apache 2.0 |

### 2.2 Fine-tuned Head: APEX DroneNet-10

The final 2 layers of YAMNet are replaced with a 10-class classification head for drone taxonomy:

```
YAMNet backbone (frozen 90%)
  └── Dense(512) [pretrained, frozen]
  └── Dense(256) [pretrained, frozen]
  └── Dense(128) [pretrained, trainable — last 10%]
  └── Dense(64, activation='relu') [NEW]
  └── Dropout(0.3) [NEW]
  └── Dense(10, activation='softmax') [NEW — drone head]
```

### 2.3 Target Class Taxonomy (10 classes)

| Class ID | Label | Frequency Range | Platform |
|---|---|---|---|
| 0 | `shahed-136` | 100–400 Hz | FPV/loiter |
| 1 | `lancet-3` | 1–4 kHz | Fixed-wing EO |
| 2 | `fpv-racing` | 200–800 Hz | Commercial FPV |
| 3 | `quadcopter-commercial` | 400 Hz–1.2 kHz | DJI/commercial |
| 4 | `fixed-wing-electric` | 800 Hz–2 kHz | Fixed-wing |
| 5 | `helicopter-small` | 60–200 Hz | Piston helo |
| 6 | `motorcycle-50cc` | 100–400 Hz | FALSE POSITIVE |
| 7 | `truck-diesel` | 50–150 Hz | FALSE POSITIVE |
| 8 | `generator-petrol` | 100–300 Hz | FALSE POSITIVE |
| 9 | `background-noise` | — | Rejection class |

Classes 6–8 are false-positive classes trained explicitly so the model learns to discriminate them.

---

## 3. Feature Extraction Pipeline

### 3.1 Mel Spectrogram Parameters

```typescript
interface MelSpectrogramConfig {
  sampleRate: 22050;      // Hz — INDIGO AirGuard standard
  windowSize: 2.0;        // seconds per frame
  hopSize: 0.5;           // seconds — 75% overlap
  nMels: 128;             // mel filterbank bins
  fMin: 80;               // Hz — minimum frequency
  fMax: 8000;             // Hz — maximum frequency
  nFFT: 2048;             // FFT points
  hopLength: 512;         // samples between frames
}
```

**Output shape per 2s window:** `[128, 87]` (n_mels × time_frames)

Time frames calculation:
```
samples = 2.0s × 22050 = 44100
frames = floor((44100 - 2048) / 512) + 1 = 83 → padded to 87
```

### 3.2 Audio Preprocessing Chain

```
Raw PCM (any sample rate)
  → Resample to 22050 Hz (librosa resampy)
  → Convert stereo to mono (channel avg)
  → Normalize peak amplitude to [-1.0, 1.0]
  → Apply pre-emphasis filter (coef=0.97)
  → Frame at windowSize=2s, hopSize=0.5s
  → Compute STFT (nFFT=2048, hopLength=512)
  → Apply mel filterbank (nMels=128, fMin=80, fMax=8000)
  → Log mel spectrogram: log10(max(mel, 1e-9))
  → Normalize per-frame (mean=0, std=1)
```

---

## 4. Transfer Learning Pipeline

### 4.1 Training Configuration

```typescript
interface TrainingConfig {
  epochs: 50;
  batchSize: 32;
  learningRate: 1e-4;         // Adam optimizer
  lrSchedule: 'cosine_decay'; // warmup 5 epochs
  frozenLayers: 0.9;          // freeze first 90% of YAMNet
  validationSplit: 0.1;
  earlyStoppingPatience: 5;
  dataAugmentation: {
    speedPerturbation: [0.9, 1.1];   // ±10%
    pitchShift: [-2, 2];              // semitones
    addNoise: 0.05;                   // SNR ~26dB
    timeStretch: [0.8, 1.2];
    randomCrop: true;
  };
}
```

### 4.2 Training Data Requirements

| Split | Count | Duration |
|---|---|---|
| Train | ≥800 clips | ≥800 × 2s = 27 min |
| Validation | ≥100 clips | ≥3.3 min |
| Test | ≥100 clips | ≥3.3 min |
| Total minimum | 1000 clips | ~33 min |

Per-class minimum: 80 training clips.

### 4.3 Loss Function

```
Loss = CrossEntropyLoss + λ × FalsePositiveRegularizer
λ = 2.0   (heavily penalize false negatives on classes 0,1)
```

The FalsePositiveRegularizer adds extra penalty when the model confuses `shahed-136` (class 0) with `motorcycle-50cc` (class 6) or `generator-petrol` (class 8), given the life-safety consequences of a missed detection.

---

## 5. Inference Pipeline

### 5.1 End-to-End Flow

```
AudioFrame (22050 samples, Float32[])
  │
  ▼
VAD (Voice Activity Detection — W1)
  │ silence? → discard
  ▼
FFT Feature Extraction
  │
  ▼
Mel Spectrogram [128, 87]
  │
  ▼
ONNX Runtime (YAMNet fine-tuned)
  │
  ▼
Logits [10] → Softmax → Probabilities [10]
  │
  ▼
Top-1 class + confidence
  │
  ├── confidence < 0.85 → FalsePositiveGuard: LOW_CONFIDENCE
  │
  ▼
FalsePositiveGuard
  │ cross-check RF, Doppler, temporal pattern
  ▼
AcousticDetection {
  trackId, droneClass, confidence,
  isFalsePositive, reason
}
  │
  ▼
TrackManager (W5) → EKF update
  │
  ▼
NATS JetStream publish: acoustic.detections
```

### 5.2 Confidence Thresholds

| Threshold | Action |
|---|---|
| `confidence < 0.85` | Discard — FalsePositiveGuard flags `LOW_CONFIDENCE` |
| `0.85 ≤ confidence < 0.90` | Tentative detection — require RF corroboration |
| `confidence ≥ 0.90` | Confirmed detection — proceed to track update |
| `confidence ≥ 0.95` | High-confidence — publish BRAVE1 alert |

---

## 6. FalsePositiveGuard Logic

### 6.1 Motorcycle / Shahed Discrimination

The 50cc motorcycle shares a 100–400 Hz piston signature identical to Shahed-136. Three cross-checks are applied:

```typescript
interface FalsePositiveAssessment {
  acousticConfidence: number;
  rfPresent: boolean;           // RF burst at 900MHz/2.4GHz
  dopplerShift: number;         // kHz — from FFT phase delta
  temporalPattern: 'linear' | 'circular' | 'hovering' | 'unknown';
  speedEstimate: number;        // km/h — from Doppler
}

// Discrimination rules (in priority order):
// 1. speedEstimate > 60 km/h AND temporalPattern === 'linear' → VEHICLE
// 2. dopplerShift > 2.0 kHz (>80 km/h approach) → VEHICLE
// 3. rfPresent === false AND temporalPattern === 'linear' → LIKELY_VEHICLE
// 4. rfPresent === true AND temporalPattern !== 'linear' → DRONE_CONFIRMED
```

### 6.2 Guard Decision Matrix

| RF Present | Doppler | Temporal | Verdict |
|---|---|---|---|
| Yes | Any | Circular/hover | DRONE |
| Yes | >2kHz | Linear | VEHICLE (drone would not exceed 80km/h in approach) |
| No | <1kHz | Circular | POSSIBLE DRONE — tentative |
| No | >2kHz | Linear | VEHICLE |
| No | Any | Unknown | LOW_CONFIDENCE |
| Any | Any | confidence <0.85 | LOW_CONFIDENCE |

---

## 7. Claude API Usage — CursorOfTruth

### 7.1 Model Selection

```
Model: claude-sonnet-4-6
Endpoint: http://4.231.218.96:7429/chat  (VM gateway — NEVER use ANTHROPIC_API_KEY directly)
Token budget: 500 input / 200 output
Temperature: 0.1  (near-deterministic for tactical reports)
Max retries: 2
Timeout: 8000ms
Fallback: template-based CoT (no API call)
```

### 7.2 Prompt Template — CursorOfTruth

```typescript
const CURSOR_OF_TRUTH_PROMPT = `You are APEX-SENTINEL tactical AI. Generate a concise military situation report.

DETECTION DATA:
- Track ID: {trackId}
- Drone class: {droneClass} (confidence: {confidence})
- Position: {lat}°N, {lon}°E (coarsened ±50m)
- Altitude: {altitude}m HAE
- Speed: {speed} m/s
- Heading: {heading}°
- Time: {timestamp} UTC

IMPACT ESTIMATE:
{impactEstimate}

Generate a 3-line tactical report:
LINE 1: THREAT ASSESSMENT (class, confidence, threat level LOW/MEDIUM/HIGH/CRITICAL)
LINE 2: CURRENT POSITION and movement vector
LINE 3: RECOMMENDED ACTION

Respond in English. No preamble. No extra lines.`;
```

### 7.3 Fallback Template

If Claude is unavailable (timeout / quota / network):

```
THREAT: {droneClass.toUpperCase()} — CONFIDENCE {confidence*100}% — {threatLevel}
POSIT: {lat}°N {lon}°E ALT {altitude}m HDG {heading}° SPD {speed}m/s
ACTION: {recommendedAction}
```

`recommendedAction` computed locally from threat level lookup table.

### 7.4 Model Versioning

```sql
-- Supabase table: ml_model_versions
CREATE TABLE ml_model_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version     TEXT NOT NULL,          -- e.g. "dronenet-10-v1.2.0"
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  onnx_path   TEXT NOT NULL,          -- Supabase Storage path
  accuracy    FLOAT8,
  false_positive_rate FLOAT8,
  is_active   BOOLEAN DEFAULT FALSE,  -- only one active at a time
  device_targets TEXT[] DEFAULT '{}', -- ['rpi4', 'jetson-nano', 'x86']
  quantization TEXT,                  -- 'fp32', 'fp16', 'int8'
  opset       INT DEFAULT 17,
  notes       TEXT
);
```

Active model constraint: trigger ensures only one `is_active = TRUE` per `device_targets` target.

---

## 8. ONNX Export and Edge Quantization

### 8.1 Export Configuration

```typescript
interface ONNXExportConfig {
  opset: 17;                    // ONNX opset version
  inputShape: [1, 128, 87];     // [batch, n_mels, time_frames]
  outputShape: [1, 10];         // [batch, n_classes]
  dynamicAxes: { input: { 0: 'batch' }, output: { 0: 'batch' } };
}
```

### 8.2 Quantization Targets

| Device | Precision | Inference Target | Memory |
|---|---|---|---|
| Raspberry Pi 4 (4GB) | INT8 | <200ms per 2s frame | <100MB |
| Jetson Nano (4GB) | FP16 | <50ms per 2s frame | <200MB |
| x86 server | FP32 | <20ms per 2s frame | <500MB |

INT8 quantization uses post-training quantization (PTQ) with 100-clip calibration dataset. Expected size reduction: >50% vs FP32.

### 8.3 Performance Validation

After each export, `EdgeDeployer.validateDeployment()` runs:
1. Load ONNX model on target runtime
2. Run 10 inference passes on test spectrograms
3. Assert P95 latency < target threshold
4. Assert output matches FP32 baseline within tolerance 0.01

---

## 9. DatasetPipeline — OSINT Data Sources

| Source | Format | Cadence | Label method |
|---|---|---|---|
| Telegram OSINT channels | .ogg / .mp3 | Manual pull | Human review + crowd |
| Field recordings (UA) | .wav 44100Hz | Periodic | Expert annotator |
| Synthetic augmentation | .wav 22050Hz | On-demand | Programmatic |
| Existing AudioSet | .flac | One-time | Mapped from AudioSet labels |

All data is ingested via `DatasetPipeline.ingest()` which resamples to 22050Hz and stores metadata in `dataset_items` table (no raw audio in DB).

---

## 10. MultiNodeFusion — Acoustic Consensus

When 3+ APEX-SENTINEL nodes detect the same track:

```typescript
// Fusion weight per node:
weight_i = (1 / distance_i) × reputation_i × recentness_i

// Consensus confidence:
confidence_fused = Σ(weight_i × confidence_i) / Σ(weight_i)

// Majority override:
// If ≥2/3 nodes agree on class → override minority
```

Tracks from different nodes are correlated by:
1. Spatial proximity (EKF-predicted position within 500m)
2. Temporal proximity (detection within 5s)
3. Acoustic class match (same top-1 class)

---

## 11. Performance Summary

| Metric | W1 Surrogate | W6 Fine-tuned |
|---|---|---|
| Classes | 521 AudioSet | 10 drone taxonomy |
| Accuracy | ~60% (proxy) | ≥90% (target) |
| False positive rate | High (motorcycle confusion) | <5% (with FalsePositiveGuard) |
| Inference (RPi4) | N/A | <200ms |
| Inference (Jetson) | N/A | <50ms |
| Model size (FP32) | 17MB | ~5MB (head only fine-tuned) |
| Model size (INT8) | N/A | <2.5MB |

---

*Generated: 2026-03-25 | APEX-SENTINEL W6 | AI_PIPELINE.md*
