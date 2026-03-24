# APEX-SENTINEL — AI Pipeline
## W1 | PROJECTAPEX Doc 06/21 | 2026-03-24

---

## 1. Pipeline Overview

APEX-SENTINEL operates a **5-gate ML pipeline** where each gate ingests raw sensor data, applies AI inference, enriches detections with metadata, and feeds confidence-weighted events downstream. The pipeline is designed for **sub-100ms end-to-end latency** on the acoustic/RF path (Gates 3–4) and gracefully degrades when nodes drop offline.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  GATE 1          GATE 2          GATE 3           GATE 4        GATE 5  │
│  Radar/ATC    Traffic Infra    Acoustic+RF      Prediction     Action   │
│  30s–10min     1s–10s          100ms–1s          <100ms        <10ms   │
│                                                                          │
│  ┌─────────┐  ┌─────────┐   ┌──────────────┐  ┌────────┐  ┌────────┐ │
│  │C-Band   │  │ANPR     │   │YAMNet TFLite │  │EKF+    │  │Alert  │ │
│  │Doppler  │→ │YOLOv8n  │→  │480KB ondevice│→ │LSTM    │→ │CoT    │ │
│  │Weather  │  │24GHz    │   │RTL-SDR 900MHz│  │predict │  │ATAK   │ │
│  │Radar    │  │Doppler  │   │WiFi RSSI     │  │track   │  │NATS   │ │
│  └─────────┘  └─────────┘   └──────────────┘  └────────┘  └────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Gate 1 — Weather & ATC Radar (Long-Range Cueing)

### 2.1 Purpose
Pre-cue downstream gates based on macro-level airspace data. Not real-time — feeds threat context windows.

### 2.2 Data Sources
| Source | Protocol | Latency | Shahed RCS | Notes |
|--------|----------|---------|------------|-------|
| C-band weather radar | ODIM HDF5 / Sigmet | 30s–10min | ~0.1m² detectable | National met service feed |
| ATC secondary radar | ASTERIX Cat 21 | 4.8s | Mode-S transponder | Civil aircraft only |
| ADS-B / OpenSky | JSON REST | 5s | Transponder equipped | FlightAware, OpenSky API |
| Military STANAG (future) | STANAG 4607 | classified | yes | Phase 2 |

### 2.3 ML Models at Gate 1
- **Radar anomaly classifier**: Gradient Boosted Trees (XGBoost, 2.1MB)
  - Input: RCS, velocity, altitude profile, approach vector
  - Output: P(drone), P(bird), P(fixed-wing), P(helicopter) — confidence [0,1]
  - Training: INDIGO AirGuard dataset + OpenSky historical + synthetic augmentation
- **Track initiator**: JPDA (Joint Probabilistic Data Association) for multi-target
- **Clutter filter**: CFAR (Constant False Alarm Rate) — eliminates weather returns

### 2.4 Output Event Schema (NATS: `sentinel.gate1.cue`)
```json
{
  "event_id": "g1-uuid",
  "gate": 1,
  "timestamp_us": 1711234567890000,
  "lat": 48.2234,
  "lon": 24.3341,
  "alt_m": 150,
  "velocity_ms": 58,
  "bearing_deg": 234,
  "rcs_m2": 0.08,
  "confidence": 0.71,
  "threat_class": "fpv_drone",
  "track_id": "TRK-001",
  "cue_radius_m": 5000,
  "ttl_s": 120
}
```

---

## 3. Gate 2 — Traffic Infrastructure as Sensor Gates

### 3.1 Repurposed Hardware
| Device | Sensor Capability | Drone Detection Method | Latency |
|--------|------------------|----------------------|---------|
| 24GHz Doppler speed radar | Doppler velocity | Microdoppler signature, RCS anomaly | 1–2s |
| 77GHz FMCW automotive radar | Range + velocity + angle | 3D position, Doppler cluster | 200ms |
| ANPR camera (4K RTSP) | Visual | YOLOv8n aerial object detection | 500ms |
| Traffic camera (RTSP H.264) | Visual wide-angle | YOLOv8n + background subtraction | 1s |
| PTZ security camera | Visual + zoom | YOLOv8n + optical flow tracker | 800ms |

### 3.2 Computer Vision Pipeline (YOLOv8n)
```
RTSP Stream → FFmpeg frame grab (1fps) → Resize 640×640
→ YOLOv8n inference (CPU: 180ms, GPU: 12ms)
→ NMS post-processing
→ Aerial class filter (drone, fixed-wing, helicopter, bird)
→ Kalman tracker (SORT algorithm)
→ Bounding box + confidence → Gate 2 event
```

**Model**: YOLOv8n fine-tuned on:
- VisDrone 2021 dataset (10,209 images, 54,503 drone annotations)
- Custom augmented dataset: Ukrainian FPV footage (synthetic)
- INDIGO AirGuard validation set (87% accuracy benchmark)

**Inference targets**:
- CPU (Raspberry Pi 4): 180ms/frame @ 1fps
- CPU (x86 edge node): 45ms/frame @ 5fps
- GPU (NVIDIA Jetson Nano): 12ms/frame @ 20fps

### 3.3 Microdoppler Analysis (24GHz Radar)
FPV drone rotor blade tip velocity creates characteristic microdoppler signature distinct from birds, insects, and vehicles:

```
Raw I/Q → STFT (window: 512, hop: 64) → Spectrogram image (224×224)
→ ResNet-18 (fine-tuned, 11MB) → 5-class classifier:
  - fpv_drone (2-4 rotors, 100-400Hz blade freq)
  - fixed_wing (no blade signature)
  - helicopter (slow rotor, 5-30Hz)
  - bird (irregular, 8-80Hz wingbeat)
  - vehicle_noise (ground clutter)
```

### 3.4 Output Event Schema (NATS: `sentinel.gate2.detection`)
```json
{
  "event_id": "g2-uuid",
  "gate": 2,
  "source_type": "doppler_radar|camera_yolo|anpr",
  "node_id": "traffic-node-04",
  "timestamp_us": 1711234567890000,
  "lat": 48.2241,
  "lon": 24.3350,
  "alt_m": 45,
  "confidence": 0.83,
  "threat_class": "fpv_drone",
  "visual_bbox": {"x": 320, "y": 180, "w": 48, "h": 32},
  "doppler_velocity_ms": 22.4,
  "frame_ref": "s3://sentinel-frames/2026/03/24/g2-uuid.jpg",
  "gate1_track_id": "TRK-001"
}
```

---

## 4. Gate 3 — Acoustic + RF Mesh (Real-Time Detection)

### 4.1 Acoustic Pipeline (Smartphones + RPi)

#### YAMNet TFLite Model
- **Size**: 480KB (quantized INT8)
- **Architecture**: MobileNet V1 + depthwise separable convolutions
- **Input**: Log-mel spectrogram, 64 bands, 96 frames (0.975s window)
- **Classes of interest**: `drone` (class 427), `helicopter` (class 430), mechanical_noise
- **INDIGO AirGuard benchmark**: 87% detection accuracy, 156ms ML latency

#### Frequency Analysis
```
Microphone input (48kHz) → Butterworth bandpass (500–2000Hz)
→ FFT (2048 samples, 50% overlap) → Energy spectrum
→ YAMNet inference (every 500ms)
→ Peak frequency tracking (FPV: 100–400Hz harmonics)
→ Acoustic confidence score [0,1]
```

#### Multi-Node Triangulation
Using TDOA (Time Difference of Arrival) across ≥3 nodes:
```
For nodes A, B, C with timestamps t_A, t_B, t_C:
  Δt_AB = t_A - t_B (NATS clock sync via GPS-PPS: ±1μs, smartphone: ±50ms)

Hyperbolic equations → Newton-Raphson solver
→ Position estimate (lat, lon, alt)
→ Error ellipse based on timing precision
→ INDIGO benchmark: ±62m with 3 smartphone nodes
→ Expected with GPS-PPS tier: ±5m
```

#### Clock Synchronization
| Node Type | Clock Source | Precision | TDOA Weight |
|-----------|-------------|-----------|-------------|
| RPi + GPS-PPS | u-blox M8N | ±1μs | 1.0 (full weight) |
| RPi NTP | pool.ntp.org | ±1ms | 0.7 |
| Android with GPS lock | Android GPS | ±50ms | 0.3 |
| Android no GPS | NATS sync | ±200ms | 0.1 |

### 4.2 RF/EMF Pipeline

#### WiFi Channel Energy Anomaly
FPV drones using 5.8GHz video transmission + 2.4GHz control link create detectable RSSI floor elevation:

```
WiFi interface (monitor mode) → Channel hopper (100ms/channel)
→ Per-channel RSSI histogram (1s window, 100 samples)
→ Baseline model (5-min rolling mean ± 2σ)
→ Anomaly detection: RSSI > baseline + 3σ
→ Frequency correlation (2.4GHz + 5.8GHz simultaneous? → high confidence)
→ RF confidence score [0,1]
```

**Thresholds (empirically validated, INDIGO AirGuard)**:
- 2.4GHz elevation: >8dBm above baseline → suspicious
- 5.8GHz elevation: >12dBm above baseline → suspicious
- Both simultaneous: high confidence FPV drone

#### RTL-SDR Narrowband SDR (900MHz Shahed)
```
RTL-SDR (25–1750MHz) → 2.4Msps @ 915MHz center
→ Power spectral density (FFT 8192pt)
→ Shahed Geranium autopilot signature detection:
  - 915MHz ISM band FSK carrier
  - FHSS pattern correlation
→ SDR confidence [0,1]
```

### 4.3 Sensor Fusion (Gate 3)
```
Acoustic: 0.87 × P_acoustic + 0.13 × 0
RF RSSI:  0.73 × P_rf + 0.27 × 0
SDR:      0.91 × P_sdr + 0.09 × 0

Fused = weighted_mean([P_acoustic × w_a, P_rf × w_rf, P_sdr × w_sdr])
where weights sum to 1.0, adjusted by node tier quality

If fused > 0.65 → emit Gate 3 detection event
```

### 4.4 Output Event Schema (NATS: `sentinel.gate3.detection`)
```json
{
  "event_id": "g3-uuid",
  "gate": 3,
  "timestamp_us": 1711234567890000,
  "contributing_nodes": ["node-01", "node-04", "node-07"],
  "estimated_lat": 48.2248,
  "estimated_lon": 24.3362,
  "estimated_alt_m": 30,
  "position_error_m": 62,
  "acoustic_confidence": 0.82,
  "rf_confidence": 0.67,
  "sdr_confidence": 0.91,
  "fused_confidence": 0.79,
  "threat_class": "fpv_drone",
  "peak_freq_hz": 234,
  "rssi_anomaly_db": 14.2,
  "sdr_freq_mhz": 915.3,
  "gate2_correlation": "g2-uuid",
  "gate1_track_id": "TRK-001"
}
```

---

## 5. Gate 4 — EKF+LSTM Prediction Layer

### 5.1 Extended Kalman Filter (EKF)
Tracks non-linear motion of FPV drones and loitering munitions:

**State vector**: `x = [lat, lon, alt, v_lat, v_lon, v_alt, a_lat, a_lon, a_alt]`

**Motion model**: Constant acceleration (FPV), constant velocity (Shahed cruise)

**Measurement model**:
- Gate 1/2 detections: full 3D position
- Gate 3 acoustic TDOA: 3D position with error ellipse
- Gate 3 RF: bearing-only (2D constraint)

**EKF update equations**:
```
Predict:  x̂⁻ = f(x̂, u)
          P⁻ = F·P·Fᵀ + Q

Update:   K = P⁻·Hᵀ·(H·P⁻·Hᵀ + R)⁻¹
          x̂ = x̂⁻ + K·(z - h(x̂⁻))
          P = (I - K·H)·P⁻
```

### 5.2 LSTM Intent Predictor
Predicts threat trajectory 5–30 seconds ahead:

```
Input sequence: last 20 EKF state vectors (20 × 9 = 180 features)
→ LSTM (2 layers, 128 hidden units, bidirectional)
→ Dense (64 → 32 → 3)
→ Output: predicted (Δlat, Δlon, Δalt) at t+5s, t+10s, t+30s
```

**Training data**:
- Synthetic FPV drone trajectories (10,000 sequences)
- Simulated Shahed cruise paths (5,000 sequences)
- Ukrainian war footage trajectories (500 real sequences)

**Prediction use cases**:
- Pre-cue Gate 3 nodes in predicted flight path
- Calculate estimated impact zone
- Trigger early warning for critical infrastructure
- Generate intercept geometry for kinetic/EW response

### 5.3 Track Management
- Multi-hypothesis tracker: maintains top-5 hypotheses per target
- Track fusion: JPDA-based multi-sensor track association
- Track lifecycle: `tentative (3 updates)` → `confirmed` → `coasted (15s)` → `dropped`
- Consistent hash ring assignment: tracks distributed across Track Manager instances by `geo_sector`

### 5.4 Output Event Schema (NATS: `sentinel.gate4.track`)
```json
{
  "track_id": "TRK-001",
  "gate": 4,
  "state": "confirmed",
  "timestamp_us": 1711234567890000,
  "position": {"lat": 48.2255, "lon": 24.3370, "alt_m": 28},
  "velocity": {"v_lat_ms": -4.2, "v_lon_ms": 8.7, "v_alt_ms": -0.5},
  "covariance_matrix": [[...], [...], [...]],
  "predicted_5s": {"lat": 48.2234, "lon": 24.3414, "alt_m": 26},
  "predicted_30s": {"lat": 48.2151, "lon": 24.3630, "alt_m": 18},
  "threat_class": "fpv_drone",
  "combined_confidence": 0.91,
  "contributing_gates": [1, 2, 3],
  "lstm_intent": "attack_run",
  "estimated_impact_zone": {"lat": 48.2090, "lon": 24.3820, "radius_m": 150},
  "time_to_impact_s": 47
}
```

---

## 6. Gate 5 — Action Layer

### 6.1 Alert Routing Rules
```
confidence < 0.50 → Log only, no alert
confidence 0.50–0.65 → Operator notification (low priority)
confidence 0.65–0.80 → Active alert + CoT broadcast
confidence > 0.80 → Critical alert + all channels
```

### 6.2 CoT XML Generation (FreeTAKServer)
Every confirmed track generates a Cursor-on-Target event:
```xml
<event version="2.0"
       uid="APEX-SENTINEL-TRK-001"
       type="a-h-A-M-F"
       how="m-g"
       time="2026-03-24T12:00:00Z"
       start="2026-03-24T12:00:00Z"
       stale="2026-03-24T12:05:00Z">
  <point lat="48.2255" lon="24.3370" hae="28"
         ce="50" le="10"/>
  <detail>
    <contact callsign="DRONE-TRK-001"/>
    <track course="234" speed="22.4"/>
    <remarks>APEX-SENTINEL: FPV drone, confidence 0.91,
              predicted impact 47s, zone 48.2090,24.3820</remarks>
  </detail>
</event>
```

### 6.3 CesiumJS CZML Output
Real-time 3D track updates to C2 dashboard:
```json
{
  "id": "TRK-001",
  "position": {
    "epoch": "2026-03-24T12:00:00Z",
    "cartographicDegrees": [24.3370, 48.2255, 28]
  },
  "polyline": {
    "positions": { "references": ["TRK-001#position"] },
    "material": { "solidColor": { "color": { "rgba": [255, 0, 0, 255] } } }
  },
  "properties": {
    "threat_class": "fpv_drone",
    "confidence": 0.91,
    "predicted_impact": "2026-03-24T12:00:47Z"
  }
}
```

---

## 7. Model Inventory

| Model | Size | Framework | Gate | Latency | Accuracy |
|-------|------|-----------|------|---------|----------|
| YAMNet TFLite (quantized) | 480KB | TFLite | 3 | 156ms | 87% |
| YOLOv8n (CV, fine-tuned) | 6.2MB | ONNX | 2 | 45–180ms | 84% |
| ResNet-18 microdoppler | 11MB | PyTorch → TorchScript | 2 | 22ms | 79% |
| XGBoost radar classifier | 2.1MB | XGBoost JSON | 1 | 8ms | 91% |
| LSTM trajectory predictor | 1.8MB | TFLite | 4 | 12ms | RMSE 8.4m@5s |
| EKF tracker | N/A (algorithm) | C++ / Rust | 4 | <1ms | — |

---

## 8. Training Pipeline

### 8.1 Data Sources
- INDIGO AirGuard validated dataset (Romanian hackathon, 87% benchmark)
- VisDrone 2021 (computer vision)
- OpenSky Network historical tracks
- Synthetic augmentation: DroneAugment tooling (rotation, noise injection, weather sim)

### 8.2 MLflow Experiment Tracking
```
Tracking URI: http://mlflow.apex-sentinel.internal:5000
Artifact store: s3://apex-sentinel-ml-artifacts/
Model registry: mlflow models (production/staging/archived)
```

### 8.3 Model Deployment
1. Train → MLflow experiment run
2. Evaluate against INDIGO AirGuard benchmark (must ≥87% accuracy)
3. Register as `staging` in MLflow registry
4. Edge packaging: TFLite/ONNX conversion + INT8 quantization
5. OTA push via NATS `sentinel.model.update` subject
6. Canary deploy: 10% nodes → 24h soak → full rollout
7. Promote to `production` in MLflow

---

## 9. Privacy & On-Device Inference

- **No raw audio leaves device** — YAMNet inference is 100% on-device
- Only confidence scores, frequency peaks, and timestamps transmitted
- WiFi RSSI samples: RSSI values only, no SSID, no MAC addresses
- User location: transmitted only when `confidence > 0.50`
- See `PRIVACY_ARCHITECTURE.md` for full data minimization spec

---

## 10. Performance Targets

| Metric | Target | INDIGO Benchmark |
|--------|--------|-----------------|
| Acoustic detection latency | <200ms | 156ms ✓ |
| RF detection latency | <500ms | N/A |
| Gate 3 end-to-end | <1s | ~800ms |
| Gate 4 prediction | <100ms | N/A |
| Full pipeline (G1→G5) | <30min (G1 cueing) | — |
| False positive rate | <5% per 100 events | 13% (INDIGO baseline) |
| Detection range (acoustic) | >150m | 150m ✓ |
| Triangulation accuracy | <100m (smartphones) | ±62m ✓ |
| Node resilience | >45% nodes offline | 45% ✓ (INDIGO) |

---

*APEX-SENTINEL W1 | AI_PIPELINE.md | PROJECTAPEX Doc 06/21*
