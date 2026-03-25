# APEX-SENTINEL — ARCHITECTURE.md
## Wave 6: Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
### Wave 6 | Project: APEX-SENTINEL | Version: 6.0.0
### Date: 2026-03-25 | Status: APPROVED

---

## 1. SYSTEM ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  EDGE NODE (RPi 4 / Jetson Nano)                                               │
│                                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────────────┐   │
│  │  USB Mic     │   │  ring buffer │   │  TFLite Inference Engine         │   │
│  │  22050 Hz    │──▶│  2s × 22050  │──▶│  YAMNet (frozen) + fine-tune head│   │
│  │  mono float32│   │  hop 0.5s    │   │  INT8 quantized, <50MB           │   │
│  └──────────────┘   └──────────────┘   └─────────────┬────────────────────┘   │
│                                                        │ ClassificationResult   │
│  ┌─────────────────────────────────────────────────────▼────────────────────┐  │
│  │  edge-runner.ts (SentinelPipeline wrapper for RPi)                       │  │
│  │  VAD → FFT → Classifier → FalsePositiveGuard → DetectionEvent           │  │
│  └──────────────────────────────────┬───────────────────────────────────────┘  │
│                                      │                                          │
│  ┌───────────────────────────────────▼──────────────────────────────────────┐  │
│  │  SQLite offline buffer (detection_buffer)                                │  │
│  │  Flush to NATS on reconnect, batch=50                                    │  │
│  └───────────────────────────────────┬──────────────────────────────────────┘  │
│                                      │ NATS publish sentinel.detections.{nodeId}│
└──────────────────────────────────────┼─────────────────────────────────────────┘
                                       │ TLS/mTLS (existing W2 cert infra)
                           ┌───────────▼──────────────────────────────────────┐
                           │  NATS JetStream (fortress / gateway-01)          │
                           │  Streams:                                         │
                           │    sentinel.detections.>   (per-node raw)        │
                           │    sentinel.fusion.detections  (fused)           │
                           │    sentinel.predictions.>  (W5 EKF)             │
                           │    sentinel.risk.>         (W6 heatmaps)        │
                           │    sentinel.cot.>          (CoT events)         │
                           │    NODE_HEALTH              (heartbeats)        │
                           └───────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼─────────────────────────────────────────┐
│  FORTRESS VM (94.176.2.48)  — systemd: apex-sentinel-w6.service              │
│                                                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐   │
│  │  SentinelPipeline.ts                                                   │   │
│  │                                                                        │   │
│  │  NATS Consumer                                                         │   │
│  │    ↓ sentinel.detections.>                                             │   │
│  │  MultiNodeFusion.ts                                                    │   │
│  │    SensorFusion.ts (acoustic weight × confidence + RF + TDoA / GDOP)  │   │
│  │    ↓ FusedDetectionEvent                                               │   │
│  │  TrackManager (W1) → TdoaCorrelator (W2) → MultiTrackEKFManager (W5)  │   │
│  │    ↓ EKF state + covariance                                            │   │
│  │  PolynomialPredictor (W5) → ImpactEstimator (W5)                       │   │
│  │    ↓                                                                   │   │
│  │  MonteCarlo.ts → RiskHeatmap.ts                                        │   │
│  │    ↓ publish sentinel.risk.{trackId}                                   │   │
│  │  CotGenerator (W1, updated CoT types) → CotRelay (W2)                 │   │
│  │    ↓ TCP multicast → ATAK tablets                                      │   │
│  │  PredictionPublisher (W5) → Supabase RT                                │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────┬───────────────────────────────────────┘
                                         │
                          ┌──────────────▼──────────────┐
                          │  Supabase bymfcnwfyxuivinuzurr│
                          │  (eu-west-2 London)          │
                          │                              │
                          │  Tables (W6 additions):      │
                          │    acoustic_detections       │
                          │    acoustic_training_data    │
                          │    risk_heatmaps             │
                          │    fp_suppression_log        │
                          │    brave1_detections         │
                          │    review_queue              │
                          │    node_health_log           │
                          │                              │
                          │  Storage buckets:            │
                          │    acoustic-training-data    │
                          │    tflite-models             │
                          └──────────────────────────────┘
```

---

## 2. MODULE INVENTORY

### 2.1 W6 New Modules

```
src/
  ml/
    yamnet-finetune.ts        # TF.js fine-tuning wrapper + TFLite export
    acoustic-classifier.ts    # 3-class inference: shahed/lancet/fp
    false-positive-guard.ts   # Tunable suppression layer
  ingestion/
    dataset-pipeline.ts       # yt-dlp + Telegram orchestrator
    audio-segmenter.ts        # FFmpeg 2s window segmentation
    brave1-importer.ts        # Ukrainian defense data format
  fusion/
    multi-node-fusion.ts      # Cross-node TDoA + confidence fusion
    sensor-fusion.ts          # Acoustic + RF + TDoA weight calculator
  risk/
    monte-carlo.ts            # 1000-path ballistic simulation
    risk-heatmap.ts           # 50m grid P(impact) computation
  integration/
    SentinelPipeline.ts       # Top-level orchestrator (ILifecycle)
    edge-runner.ts            # RPi/Jetson Nano deployment entry point
```

### 2.2 W1–W5 Modules Used (Unchanged)

```
src/acoustic/vad.ts                      # W1 Voice Activity Detection
src/acoustic/fft.ts                      # W1 Cooley-Tukey FFT
src/acoustic/yamnet-surrogate.ts         # W1 (replaced by ml/acoustic-classifier.ts in W6)
src/tracking/TrackManager.ts             # W1 Track lifecycle
src/relay/CotGenerator.ts               # W1 (CoT type mapping updated)
src/correlation/TdoaCorrelator.ts        # W2 Time-difference-of-arrival
src/relay/CotRelay.ts                    # W2 TCP → ATAK
src/nats/NatsClient.ts                   # W3 FSM-based NATS client
src/nats/EventPublisher.ts              # W3 NATS publish helpers
src/prediction/MultiTrackEKFManager.ts  # W5 EKF fleet manager
src/prediction/PredictionPublisher.ts   # W5 NATS + Supabase publish
src/prediction/EKFInstance.ts           # W5 Singer Q model
src/prediction/PolynomialPredictor.ts   # W5 5-horizon forecasting
src/prediction/ImpactEstimator.ts       # W5 Ground intersection
```

---

## 3. DATA FLOW

### 3.1 Real-Time Detection Flow

```
T=0ms:    USB mic samples 0.5s chunk (11025 samples at 22050 Hz)
T=5ms:    VAD checks chunk energy — if below threshold, skip
T=10ms:   FFT computes power spectrum, extract mel features
T=15ms:   Ring buffer updated with new chunk (2s total)
T=20ms:   Resample 2s buffer 22050→16000 Hz
T=30ms:   YAMNet preprocessing: log-mel spectrogram
T=80ms:   YAMNet forward pass (frozen base)
T=120ms:  Classification head forward pass → ClassificationResult
T=125ms:  FalsePositiveGuard evaluation
T=130ms:  If P(shahed) > 0.7 AND P(fp) < 0.3: emit DetectionEvent
T=140ms:  Publish to NATS sentinel.detections.{nodeId}

(Multi-node path, on Fortress VM:)
T=200ms:  NATS consumer receives DetectionEvent
T=210ms:  MultiNodeFusion correlates with other node events in ±5s window
T=230ms:  If ≥2 correlated nodes: compute fused position (TDoA/Chan-Taylor)
T=250ms:  TrackManager updates or creates Track
T=280ms:  MultiTrackEKFManager predict/update cycle
T=300ms:  PolynomialPredictor generates 5-horizon trajectory
T=350ms:  ImpactEstimator finds ground intersection
T=400ms:  MonteCarlo runs 1000 simulations
T=500ms:  RiskHeatmap computes 50m grid
T=510ms:  Publish sentinel.risk.{trackId} to NATS
T=520ms:  If track confirmed (≥3 detections): CotGenerator → CotRelay → ATAK
T=5000ms: ATAK tablet displays alert (CoT received)
```

### 3.2 Training Data Flow

```
dataset-pipeline.ts
  → yt-dlp download (external, Python subprocess)
  → audio-segmenter.ts (FFmpeg, 2s windows)
  → Supabase storage upload (acoustic-training-data bucket)
  → review_queue table insert (label = auto-labeled)
  → Human reviewer labels in review UI (future)
  → yamnet-finetune.ts training run (Python/TF.js, GPU VM)
  → Export TFLite model to tflite-models bucket
  → edge-runner.ts downloads model on startup
```

---

## 4. INTERFACE CONTRACTS

### 4.1 Core TypeScript Interfaces

```typescript
// Classification output
interface ClassificationResult {
  label: 'shahed' | 'lancet' | 'false_positive' | 'ambient';
  confidence: number;
  probabilities: Record<'shahed' | 'lancet' | 'false_positive' | 'ambient', number>;
  processingTimeMs: number;
  modelVersion: string;
  windowStartMs: number;
  windowEndMs: number;
}

// Acoustic detection event (published to NATS)
interface AcousticDetectionEvent {
  id: string;                 // UUID
  nodeId: string;
  detectedAt: string;         // ISO 8601
  classification: ClassificationResult;
  position: { lat: number; lon: number; alt: number } | null;
  snr: number;                // Signal-to-noise ratio dB
  dopplerRate: number | null; // Hz/s, null if insufficient data
  rawMelFeatures?: number[];  // Optional, for logging
}

// Fused detection (multi-node output)
interface FusedDetectionEvent {
  id: string;
  trackId: string | null;    // null if no existing track matched
  detectedAt: string;
  sourceNodeIds: string[];
  fusedPosition: { lat: number; lon: number; alt: number };
  fusedConfidence: number;
  droneType: 'shahed' | 'lancet' | 'unknown';
  gdop: number;
  multiNode: boolean;
}

// Risk heatmap cell
interface HeatmapCell {
  lat: number;
  lon: number;
  probability: number;        // 0.001–1.0 (pruned below 0.001)
  cellSizeM: 50;
}

// Risk heatmap event (published to NATS)
interface RiskHeatmapEvent {
  trackId: string;
  generatedAt: string;
  simulationCount: number;    // Always 1000
  cells: HeatmapCell[];
  totalCells: number;
  computeTimeMs: number;
  ekfStateSnapshot: EKFState;
}

// Pipeline lifecycle
interface ILifecycle {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

// Node health
interface NodeHealth {
  nodeId: string;
  timestamp: string;
  uptimeS: number;
  detectionCount: number;
  lastDetectionAt: string | null;
  natsConnected: boolean;
  offlineBufferSize: number;
  cpuPercent: number;
  memoryMB: number;
  modelVersion: string;
}
```

---

## 5. NATS STREAM TOPOLOGY (W6 ADDITIONS)

```
Stream: SENTINEL_DETECTIONS_V2
  Subjects: sentinel.detections.>
  Retention: WorkQueuePolicy
  MaxAge: 1h
  MaxMsgs: 100000
  Replicas: 1

Stream: SENTINEL_FUSION
  Subjects: sentinel.fusion.detections
  Retention: LimitsPolicy
  MaxAge: 1h

Stream: SENTINEL_RISK
  Subjects: sentinel.risk.>
  Retention: LimitsPolicy
  MaxAge: 24h
  MaxMsgSize: 1MB  (heatmap JSONB can be large)

Stream: NODE_HEALTH
  Subjects: sentinel.node.health.>
  Retention: LimitsPolicy
  MaxAge: 24h
```

---

## 6. DEPLOYMENT TOPOLOGY

```
┌─────────────────────────────────────────────────────┐
│  Field Deployment (per observation post)            │
│                                                     │
│  1x RPi 4 (4GB)                                     │
│    Service: apex-sentinel-edge.service              │
│    Runs: edge-runner.ts + TFLite inference          │
│    Power: 5W nominal, battery pack ~48h             │
│                                                     │
│  1x USB microphone (cardioid, windscreen)           │
│    Mounted on mast at ~3m elevation                  │
│  1x LTE dongle or WiFi to mesh network              │
└──────────────────────┬──────────────────────────────┘
                       │ NATS/mTLS over cellular
                       ▼
┌──────────────────────────────────────────────────────┐
│  Fortress VM (central processing)                   │
│    Runs: apex-sentinel-w6.service                   │
│    Handles: multi-node fusion, EKF, heatmap, CoT    │
└──────────────────────┬───────────────────────────────┘
                       │ TCP multicast
                       ▼
┌─────────────────────────────────────────────────────┐
│  ATAK EUD (tablet, Android)                         │
│    Displays: drone tracks, heatmaps, CoT markers    │
└─────────────────────────────────────────────────────┘
```

---

## 7. SYSTEMD UNIT FILES

### 7.1 Edge Node Service

```ini
# /etc/systemd/system/apex-sentinel-edge.service
[Unit]
Description=APEX-SENTINEL Edge Acoustic Detector
After=network.target sound.target

[Service]
Type=simple
User=sentinel
WorkingDirectory=/opt/apex-sentinel
ExecStart=/usr/bin/node dist/integration/edge-runner.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=NATS_URL=nats://fortress.apex-os.net:4222
Environment=NODE_ID=rpi4-node-01
Environment=MODEL_PATH=/opt/apex-sentinel/models/yamnet-shahed-v1.tflite
MemoryLimit=500M
CPUQuota=80%

[Install]
WantedBy=multi-user.target
```

### 7.2 Fortress Pipeline Service

```ini
# /etc/systemd/system/apex-sentinel-w6.service
[Unit]
Description=APEX-SENTINEL W6 Fusion Pipeline
After=network.target nats.service

[Service]
Type=simple
User=sentinel
WorkingDirectory=/opt/apex-sentinel
ExecStart=/usr/bin/node dist/integration/SentinelPipeline.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=NATS_URL=nats://localhost:4222
Environment=SUPABASE_URL=https://bymfcnwfyxuivinuzurr.supabase.co
EnvironmentFile=/etc/apex-sentinel/secrets.env

[Install]
WantedBy=multi-user.target
```
