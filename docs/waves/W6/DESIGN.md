# APEX-SENTINEL — DESIGN.md
## Wave 6: Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
### Wave 6 | Project: APEX-SENTINEL | Version: 6.0.0
### Date: 2026-03-25 | Status: APPROVED
### Supabase: bymfcnwfyxuivinuzurr (eu-west-2 London)

---

## 1. DESIGN MANDATE

W6 closes the full detection loop: raw acoustic capture on edge hardware → fine-tuned ML classifier → multi-node fusion → EKF trajectory prediction (W5) → Monte Carlo risk heatmap → ATAK CoT delivery. This is the INDIGO AirGuard hackathon deliverable. Every design decision below is optimized for operational reality on a Ukrainian front-line deployment: RPi 4 hardware, NATS over cellular mesh, intermittent connectivity, and zero tolerance for false alarms that exhaust operator attention.

---

## 2. ACOUSTIC PHYSICS — DESIGN CONSTRAINTS

### 2.1 Shahed-136 / Geranium-2 Acoustic Signature

The Shahed-136 uses a Mado MD-550 piston engine, approximately 50cc displacement, 4-stroke cycle. Design constraints derived from acoustic physics:

```
Fundamental frequency (f0):
  RPM_cruise = 7000–9000 RPM
  4-stroke cycle: power stroke every 2 crankshaft revolutions
  f0 = RPM / (2 × 60) = 7000/120 to 9000/120 = 58–75 Hz

First harmonic (2f0):  116–150 Hz  ← dominant in air propagation
Second harmonic (3f0): 174–225 Hz
Third harmonic (4f0):  232–300 Hz

Audible range at distance:
  - Open field, calm night: 2–5 km
  - Urban environment: 0.5–1.5 km (reflections, noise floor)
  - Wind >15 km/h: detection range drops 40–60%

Propagation model (spherical spreading + atmospheric absorption):
  SPL(d) = SPL(1m) - 20·log10(d) - α·d
  α_100Hz ≈ 0.003 dB/m at 20°C, 60% humidity
  SPL(1m) estimated 100–110 dB for Shahed at cruise
  Detection threshold: ~35–40 dB above ambient noise floor
  At 2km: SPL ≈ 100 - 20·log10(2000) - 0.003·2000 ≈ 100 - 66 - 6 = 28 dB → at noise floor
  At 1km: SPL ≈ 100 - 60 - 3 = 37 dB → detectable in quiet conditions
```

This dictates mel spectrogram parameters:
- `fmin = 80 Hz` (below f0 to capture onset)
- `fmax = 8000 Hz` (harmonic content, wind noise rejection above 8kHz)
- `n_mels = 128` (adequate resolution in 80–400 Hz band)
- `sample_rate = 22050 Hz` (Nyquist at 11025 Hz, adequate for 8kHz content)

### 2.2 Lancet-3 Acoustic Signature

Lancet-3 uses a brushless DC motor driving a pusher propeller:
```
Motor frequencies:
  Pole pairs: typically 7–14 (N7P14 to N12P4 configurations)
  RPM: 8000–15000 at cruise
  Electrical frequency: RPM × (poles/2) / 60
  For N14P: 12000 × 7 / 60 = 1400 Hz fundamental
  Harmonics: 2800, 4200, 5600 Hz

Propeller blade pass frequency:
  3-blade prop at 12000 RPM: 3 × 12000/60 = 600 Hz
  With harmonics: 1200, 1800 Hz
```

This requires separate mel spectrogram parameters:
- `fmin = 500 Hz`
- `fmax = 8000 Hz`
- `n_mels = 64` (less resolution needed — narrower band)

### 2.3 Critical False Positive Analysis

50cc motorcycle (Honda Super Cub, Yamaha PW50):
- Same displacement class as Mado MD-550
- RPM at idle: 1500–2000, cruising: 5000–8000
- f0 = 42–67 Hz, harmonics in exact same 100–400 Hz band
- **This is the #1 false positive threat — physically indistinguishable by frequency alone**
- Discriminator must use: Doppler shift rate, temporal pattern (continuous vs acceleration/deceleration), spatial persistence

Diesel generator (2–5 kVA):
- RPM: 1500 or 3000 (50/60 Hz synchronous)
- f0: 25 Hz (1500 RPM) or 50 Hz (3000 RPM)
- Harmonics: regular integer multiples
- Stationary: no Doppler shift over time
- Discriminator: zero Doppler shift, stable amplitude

Lawnmower:
- RPM: 2800–3600
- f0: 47–60 Hz
- Stationary or slow-moving (<5 km/h)
- Discriminator: low/zero Doppler

---

## 3. ML ARCHITECTURE DESIGN

### 3.1 Transfer Learning Strategy

YAMNet (Google AudioSet pre-trained) provides 521-class audio embeddings from MobileNet V1 backbone operating on log-mel spectrograms. Design decision: freeze YAMNet base, train only the classification head.

```
Base architecture:
  YAMNet (TF1 SavedModel) → 1024-dim embedding per 0.96s frame
  Input: waveform float32, 16kHz (resample 22050→16000 before YAMNet)

Fine-tuned head (binary):
  Dense(256, activation='relu')
  Dropout(0.4)
  Dense(1, activation='sigmoid')
  → P(drone) ∈ [0, 1]

Fine-tuned head (3-class):
  Dense(256, activation='relu')
  Dropout(0.4)
  Dense(128, activation='relu')
  Dense(3, activation='softmax')
  → [P(shahed), P(lancet), P(false_positive)]

Loss: SparseCategoricalCrossentropy (3-class), BinaryCrossentropy (binary)
Optimizer: Adam(lr=1e-4) — slow LR critical for frozen base transfer
Batch size: 32 (fits RPi RAM for inference; training on laptop/VM)
Epochs: 50 with EarlyStopping(patience=10, monitor='val_loss')
```

### 3.2 Inference Pipeline (Edge)

```
USB Mic (22050 Hz, mono, float32)
  → Ring buffer (2s × 22050 = 44100 samples)
  → Hop every 0.5s (11025 samples)
  → Resample: 22050 → 16000 (scipy.signal.resample or librosa)
  → YAMNet preprocessing: log-mel spectrogram (64 mel bins, 25ms frame, 10ms hop, 16kHz)
  → YAMNet forward pass (frozen): 1024-dim embedding
  → Classification head forward pass: 3-class softmax
  → Threshold: P(shahed) > 0.7 → DETECTION_CANDIDATE
  → False-positive guard: P(false_positive) < 0.3 → confirm candidate
  → Output: AcousticDetection event
```

### 3.3 TFLite Conversion for Edge

```
Training: Python (TensorFlow 2.x, GPU), exports SavedModel
Conversion: tf.lite.TFLiteConverter.from_saved_model()
  → Quantization: tf.lite.Optimize.DEFAULT (INT8 post-training)
  → Representative dataset: 100 samples for calibration
Edge inference: TFLite runtime (C++ or Python binding)
  → RPi 4 (ARM Cortex-A72): ~150ms per 2s window (target: <200ms)
  → Jetson Nano: ~50ms per window (GPU-accelerated)
```

---

## 4. MULTI-NODE FUSION DESIGN

### 4.1 Acoustic Event Cross-Correlation

When N ≥ 2 nodes detect the same target, TDoA cross-correlation provides position estimate:

```
Nodes A, B separated by distance d_AB
Sound arrives at A at t_A, at B at t_B
TDOA: Δt = t_A - t_B
Distance difference: Δd = Δt × c_sound (c = 343 m/s at 20°C)
Hyperbola: all points where |PA - PB| = Δd

With 3+ nodes: 3 hyperbolae intersect at unique point
Solver: Fang's method (closed-form) or Bancroft algorithm (least-squares)
Current W1 TDoA solver: already implements Chan-Taylor algorithm
W6: extend to accept acoustic confidence-weighted measurements
```

### 4.2 Sensor Fusion Weights

```typescript
interface FusionWeights {
  acoustic: number;    // 0.0–1.0, weighted by classifier confidence × SNR
  rf: number;          // 0.0–1.0, based on RSSI quality
  tdoa: number;        // 0.0–1.0, based on GDOP (geometric dilution of precision)
}

// Fusion rule: weighted average with quality gating
// If acoustic.confidence < 0.5: acoustic weight → 0 (suppress low-confidence)
// If GDOP > 5.0: tdoa weight → 0 (poor geometry)
// Fused position: P_fused = Σ(w_i × P_i) / Σ(w_i)
```

---

## 5. MONTE CARLO RISK HEATMAP DESIGN

### 5.1 Simulation Approach

```
Input: EKF state vector (lat, lon, alt, vLat, vLon, vAlt) + covariance P
N = 1000 simulations
Per simulation:
  1. Sample initial state from N(x_ekf, P)
  2. Integrate trajectory: simple ballistic with Shahed aerodynamic model
     - Cruise: constant velocity (terminal guidance phase)
     - Dive: nose-down at ~30° angle when fuel expires
     - Fuel model: estimate from distance to target if known
  3. Find ground intersection (alt = 0)
  4. Record impact lat/lon

Output:
  50m grid cells covering ±5km from estimated impact point
  P(impact) per cell = count(simulations landing in cell) / 1000
  Serialized as: { cells: [{lat, lon, probability}], generatedAt, trackId }
```

### 5.2 Aerodynamic Constants (Shahed-136)

```
Mass: ~200 kg
Wing area: ~3.5 m²
Drag coefficient: ~0.025 (cruise, low AoA)
Lift coefficient: ~0.5 at cruise AoA
Terminal velocity (powered): 185 km/h ≈ 51 m/s
Glide ratio (unpowered): ~10:1
Dive profile: final 2–5 km, altitude decreases from ~100m to impact
```

---

## 6. EDGE DEPLOYMENT DESIGN

### 6.1 Hardware Targets

```
Tier 1 — Raspberry Pi 4 (4GB RAM):
  CPU: ARM Cortex-A72, 4-core @ 1.8 GHz
  RAM budget: 500 MB hard limit (OS + runtime + model)
  Model size target: <50 MB (post-quantization TFLite)
  Inference latency target: <200ms per 2s window
  Audio interface: USB microphone via ALSA (arecord)
  Connectivity: WiFi 2.4/5GHz or LTE dongle

Tier 2 — Jetson Nano (4GB):
  GPU: 128-core Maxwell
  Model: same TFLite, uses GPU delegate
  Inference latency: <50ms

Tier 3 — BEELINK mini PC (Intel N100):
  x86, 16GB RAM, runs full TensorFlow inference
  Reference platform for accuracy benchmarking
```

### 6.2 Offline Mode Design

```
NATS connectivity: assumed intermittent in field deployment
Offline buffer: SQLite local DB (detection_buffer table)
  Columns: id, detected_at, lat, lon, confidence, classifier_output, synced

Flush strategy:
  On NATS reconnect → read all unsynced → publish in batches of 50
  After confirmed publish: set synced = true
  Retention: delete synced records older than 24h

Heartbeat: publish NODE_HEALTH every 30s when online
  Offline: accumulate missed heartbeats counter
  On reconnect: send missed_heartbeats count in first NODE_HEALTH
```

---

## 7. ATAK COT INTEGRATION DESIGN

### 7.1 CoT Type Mapping

```
Shahed-136 (confirmed ≥3 detections):
  CoT type: a-h-A-C-F  (Air, Hostile, Airspace, Conventional, Fixed-wing)
  How: "h" = hostile, "C" = conventional (cruise missile category)

FPV / Lancet (confirmed ≥3 detections):
  CoT type: a-h-A-M-F-Q  (Air, Hostile, Airspace, Military, Fixed-wing, Quadrotor)

Unconfirmed candidate (1–2 detections):
  CoT type: a-u-A  (Air, Unknown)

CoT stale time: 60s (Shahed slow-moving enough that 60s is safe)
CoT start time: detection timestamp
CoT detail: <remarks>APEX-SENTINEL acoustic confidence=0.87 class=shahed</remarks>
```

---

## 8. DATASET DESIGN

### 8.1 Target Dataset Composition

```
Positive class (drone):
  Shahed-136:  ≥ 200 unique source videos, yielding ~2000 × 2s clips
  Lancet-3:    ≥ 50 unique source videos, yielding ~500 × 2s clips

Negative class (false positives):
  50cc motorcycle:    ≥ 200 clips (CRITICAL — must match Shahed harmonic range)
  Generator diesel:   ≥ 100 clips
  Lawnmower:          ≥ 100 clips
  Ultralight/PPG:     ≥ 50 clips
  Ambient battlefield: ≥ 200 clips (wind, artillery, vehicle traffic)

Train / validation / test split:
  70% / 15% / 15%
  Stratified by class
  Test set NEVER used during training — held out for final evaluation only

Augmentation (training only):
  Time stretch: ±10%
  Pitch shift: ±2 semitones
  Additive noise: SNR 10–30 dB (battlefield ambient)
  Room impulse response convolution: 3 IR profiles (open field, urban, forest)
```

---

## 9. INTEGRATION PIPELINE DESIGN

### 9.1 SentinelPipeline Component Wiring

```
AudioCapture (W6 edge-runner)
  → VAD (W1 src/acoustic/vad.ts)
  → FFT (W1 src/acoustic/fft.ts)
  → AcousticClassifier (W6 src/ml/acoustic-classifier.ts)
  → FalsePositiveGuard (W6 src/ml/false-positive-guard.ts)
  → TrackManager (W1 src/tracking/TrackManager.ts)
  → TdoaCorrelator (W2 src/correlation/TdoaCorrelator.ts) [multi-node]
  → MultiNodeFusion (W6 src/fusion/multi-node-fusion.ts)
  → MultiTrackEKFManager (W5 src/prediction/MultiTrackEKFManager.ts)
  → PredictionPublisher (W5 src/prediction/PredictionPublisher.ts)
  → MonteCarlo (W6 src/risk/monte-carlo.ts)
  → RiskHeatmap (W6 src/risk/risk-heatmap.ts)
  → CotGenerator (W1 src/relay/CotGenerator.ts) [updated CoT types]
  → CotRelay (W2 src/relay/CotRelay.ts) → ATAK tablet
  → EventPublisher (W3 src/nats/EventPublisher.ts) → NATS streams
```

All components must implement `ILifecycle { start(): Promise<void>; stop(): Promise<void> }`. SentinelPipeline orchestrates ordered startup and graceful shutdown via `process.on('SIGTERM')` and `process.on('SIGINT')`.

---

## 10. DESIGN DECISIONS SUMMARY

| Decision | Choice | Rationale |
|---|---|---|
| ML runtime on edge | TFLite INT8 | <200ms on RPi, <50MB model |
| Transfer base | YAMNet (frozen) | Best pre-trained audio embeddings, MIT license |
| 3-class vs binary | 3-class (shahed/lancet/fp) | Operator needs threat type, not just drone/no-drone |
| False positive guard | Separate inference pass | Can tune FP threshold independently of TP threshold |
| Monte Carlo N | 1000 | ~50ms compute, sufficient for 50m grid resolution |
| Grid resolution | 50m cells | Matches Shahed CEP (~50m in dive phase) |
| CoT stale time | 60s | Shahed max displacement in 60s ≈ 3km, acceptable |
| Offline buffer | SQLite | Zero dependency, works without NATS |
| Dataset scraping | yt-dlp + Telegram | Best public sources for verified Shahed audio |
| Sample rate | 22050 Hz | Industry standard, covers 8kHz target, half of 44.1kHz |
