# APEX-SENTINEL — INTEGRATION_MAP.md
## Wave 6: Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
### Wave 6 | Project: APEX-SENTINEL | Version: 6.0.0
### Date: 2026-03-25 | Status: APPROVED

---

## 1. INTEGRATION MAP OVERVIEW

This document maps all internal module-to-module integrations and external system integrations for W6. It covers data contracts, communication protocols, and error handling at each integration boundary.

---

## 2. INTERNAL MODULE INTEGRATION MAP

### 2.1 W6 Module → W6 Module

```
AudioCapture (edge-runner.ts)
  │ raw PCM Float32Array chunks (22050 Hz)
  ↓
VAD (W1 src/acoustic/vad.ts)
  │ boolean: voice/sound activity detected
  ↓ [IF activity detected]
FFT (W1 src/acoustic/fft.ts)
  │ Float32Array: magnitude spectrum
  │ number: estimated fundamental frequency f0
  ↓
AcousticClassifier (W6 src/ml/acoustic-classifier.ts)
  │ ClassificationResult: {label, confidence, probabilities, processingTimeMs, modelVersion}
  ↓
FalsePositiveGuard (W6 src/ml/false-positive-guard.ts)
  │ AssessmentResult: {shouldAlert, suppressionReason}
  ↓ [IF shouldAlert === true]
AcousticDetectionEvent: {id, nodeId, detectedAt, classification, position, snr, dopplerRate}
  │
  ├──→ NATS publish: sentinel.detections.{nodeId} (primary path)
  └──→ SQLite offline buffer (fallback when NATS unavailable)
```

### 2.2 W6 Module → W1-W5 Module (Fortress Mode)

```
NATS Consumer (sentinel.detections.>)
  │ AcousticDetectionEvent[]
  ↓
MultiNodeFusion (W6 src/fusion/multi-node-fusion.ts)
  │ calls W2 TdoaCorrelator.correlate(nodePositions, tdoas)
  │ FusedDetectionEvent: {fusedPosition, fusedConfidence, droneType, gdop, multiNode}
  ↓
TrackManager (W1 src/tracking/TrackManager.ts)
  │ calls update(fusedDetection)
  │ Track: {id, status, detectionCount, confirmedAt, drone_type}
  ↓
MultiTrackEKFManager (W5 src/prediction/MultiTrackEKFManager.ts)
  │ calls predict(trackId) + update(trackId, measurement)
  │ EKFState: {lat, lon, alt, vLat, vLon, vAlt, covarianceDiag}
  ↓
  ├──→ PolynomialPredictor (W5) → 5-horizon trajectory
  ├──→ ImpactEstimator (W5) → ground intersection point
  └──→ MonteCarlo (W6 src/risk/monte-carlo.ts)
         │ 1000 impact samples
         ↓
         RiskHeatmap (W6 src/risk/risk-heatmap.ts)
           │ HeatmapCells[]: {lat, lon, probability, cellSizeM}
           ↓
         PredictionPublisher (W5) → NATS sentinel.risk.{trackId}
                                  → Supabase risk_heatmaps table

Track confirmed (detectionCount >= 3, within 30s window)
  ↓
CotGenerator (W1, updated W6 CoT type mapping)
  │ CoT XML string: type a-h-A-C-F | a-h-A-M-F-Q | a-u-A
  ↓
CotRelay (W2 src/relay/CotRelay.ts)
  │ TCP multicast
  ↓
ATAK tablet
```

---

## 3. EXTERNAL SYSTEM INTEGRATIONS

### 3.1 NATS JetStream (fortress / gateway-01)

```
Integration type: Message queue (publish/subscribe)
Protocol: NATS 2.x with mTLS (W2 cert infrastructure)
Authentication: Client certificates per node (node-specific)

Edge → NATS:
  Subject: sentinel.detections.{nodeId}
  Schema: AcousticDetectionEvent (JSON)
  Rate: up to 2/s per node during active detection
  QoS: WorkQueue (exactly-once delivery attempt)

Fortress → NATS:
  Subject: sentinel.fusion.detections    Schema: FusedDetectionEvent
  Subject: sentinel.risk.{trackId}       Schema: RiskHeatmapEvent
  Subject: sentinel.cot.{trackId}        Schema: NatsCoTEvent
  Subject: sentinel.node.health.{nodeId} Schema: NodeHealth (edge publishes)

Error handling:
  NATS unavailable → SQLite offline buffer on edge
  NATS reconnect → flush offline buffer, batch=50
  Reconnect backoff: 1s, 2s, 4s, 8s, max 60s
  NatsClient state machine: DISCONNECTED → CONNECTING → CONNECTED → DISCONNECTED (W3)
```

### 3.2 Supabase (bymfcnwfyxuivinuzurr, eu-west-2)

```
Integration type: PostgreSQL (via Supabase JS v2) + Realtime
Authentication: service_role JWT (backend), anon JWT (dashboard)
RLS: enabled on all W6 tables

Write paths:
  acoustic_detections:     INSERT on each non-suppressed detection
  fp_suppression_log:      INSERT on each suppressed detection
  risk_heatmaps:           INSERT/UPSERT on each Monte Carlo computation (every 10s per track)
  node_health_log:         INSERT on each 30s heartbeat
  acoustic_training_data:  INSERT via dataset-pipeline.ts
  brave1_detections:       INSERT via brave1-importer.ts

Realtime subscriptions:
  acoustic_detections → INSERT events → dashboard live feed
  risk_heatmaps → INSERT events → dashboard heatmap update

Error handling:
  Supabase write failure → log error, increment supabase_write_errors metric
  If Supabase unavailable on startup → fail fast with clear error (non-retryable init failure)
  If Supabase unavailable during operation → queue in-memory (max 1000 items), flush on reconnect
```

### 3.3 ATAK / CoT TCP

```
Integration type: TCP multicast (CotRelay, W2)
Protocol: Cursor on Target (CoT) XML, TCP port 8087 (standard ATAK SA port)
Authentication: None (local network assumed; ATAK on same LAN/VPN)

W6 CoT types added:
  a-h-A-C-F   → Shahed-136 (Air, Hostile, Conventional Fixed-wing)
  a-h-A-M-F-Q → Lancet-3 (Air, Hostile, Military Fixed-wing Quadrotor)
  a-u-A       → Unconfirmed (Air, Unknown)

CoT detail block W6 additions:
  <remarks>APEX-SENTINEL acoustic confidence=0.87 class=shahed nodes=3 model=yamnet-shahed-v1.0.0</remarks>
  <impact_zone lat_mean="48.91" lon_mean="37.79" radius_95pct_m="450" />

Error handling:
  CotRelay TCP disconnect → reconnect with backoff (W2 existing behavior)
  CoT XML generation error (NaN in EKF state) → skip CoT, log error, do NOT crash
```

### 3.4 YAMNet TF Hub (training only)

```
Integration type: One-time download during training (not runtime)
URL: https://tfhub.dev/google/yamnet/1
License: CC-BY 4.0 (attribution required)
Cached locally: /models/yamnet_base/ (never re-downloaded during inference)

Edge nodes: DO NOT contact TF Hub. Model is pre-bundled.
```

### 3.5 yt-dlp (dataset ingestion, training phase only)

```
Integration type: CLI subprocess
Command: yt-dlp --extract-audio --audio-format wav --postprocessor-args "-ar 22050 -ac 1" ...
Authentication: None (public YouTube)
Rate limiting: max 50 downloads per session to avoid IP blocks
Legal: For defense research purposes only. No redistribution.

Error handling:
  yt-dlp not found → IngestError("yt-dlp not installed. Run: pip install yt-dlp")
  Download fails → log error, skip, continue with next URL
  Private/deleted video → log warning, skip
```

### 3.6 FFmpeg (audio normalization and segmentation)

```
Integration type: CLI subprocess
Required version: ≥ 6.0
Commands used:
  Normalization: ffmpeg -i input -ar 22050 -ac 1 -af "loudnorm=I=-23" output.wav
  Segmentation: via Node.js Float32Array manipulation (no FFmpeg for segmentation)

Error handling:
  FFmpeg not found → IngestError("FFmpeg not installed")
  Normalization fails → log error, use original file without normalization
```

### 3.7 INDIGO AirGuard Platform

```
Integration type: NATS subscriber (their platform consumes our events)
Subjects consumed by AirGuard: sentinel.fusion.detections, sentinel.risk.>
Schema: stable — breaking changes require version bump and coordination
Authentication: Separate NATS credentials issued to AirGuard subscriber
SLA: Best-effort (hackathon context; production SLA to be defined in partnership agreement)

Error handling (on their side, our responsibility is schema stability):
  We MUST NOT change sentinel.fusion.detections schema without 2-week notice
  New fields in existing schemas are additive (backward compatible)
  Removed fields require schema version bump
```

### 3.8 BRAVE1 / Ukrainian Defense Partners

```
Integration type: File-based import (CSV or JSON)
Direction: Partner → APEX-SENTINEL (one-way import)
Format: {lat, lon, alt, timestamp, drone_type, confidence, audio_file_ref}
Trigger: Manual import via brave1-importer.ts CLI or Edge Function POST /brave1-import
Deduplication: UNIQUE constraint on dedup_key prevents double-import
Audio files: Optional reference only. Actual audio stored in partner's system.
```

---

## 4. ERROR BOUNDARY MAP

```
Module boundary errors and propagation rules:

AcousticClassifier.classify() error
  → Caught in SentinelPipeline.processAudioFrame()
  → Increments metrics.classifierErrors
  → Does NOT propagate → pipeline continues

FalsePositiveGuard.evaluate() error
  → Same as above: caught, logged, pipeline continues

NATS publish error
  → Caught in EventPublisher
  → Falls back to SQLite offline buffer
  → Does NOT propagate

Supabase write error
  → Caught in PredictionPublisher / direct inserts
  → Queued in-memory
  → Does NOT propagate to caller

CotRelay TCP error
  → Caught in CotRelay (W2 existing behavior)
  → Reconnect queued
  → Does NOT propagate

EKF NaN state
  → Detected in EKFInstance.predict()
  → Track marked as LOST (not CONFIRMED)
  → CoT not generated for this track
  → New track will be created on next detection

SentinelPipeline.start() errors
  → ModelNotFoundError → FATAL: logs error, exits with code 1
  → SupabaseConnectionError → FATAL: logs error, exits with code 1
  → NatsConnectionError → NON-FATAL: starts in offline mode (edge), or FATAL (fortress)
```

---

## 5. SEQUENCE DIAGRAM: HACKATHON DEMO FLOW

```
RPi4 Mic    VAD/FFT    Classifier    FPGuard    NATS    Fortress    ATAK
    │           │           │           │          │        │          │
T=0 │──audio──▶│           │           │          │        │          │
T=5 │          │──features▶│           │          │        │          │
T=80│          │           │──result──▶│          │        │          │
T=125│         │           │           │──pass────▶│        │          │
T=200│         │           │           │          │──fuse──▶│          │
T=250│         │           │           │          │        │──EKF───▶  │
T=400│         │           │           │          │        │──MC────▶  │
T=510│         │           │           │          │        │──risk──▶  │
T=600│         │[3rd detect, track confirmed]      │        │──CoT──────▶│
T=5000│        │           │           │          │        │          │◀─displays
```

---

## 6. VERSION COMPATIBILITY MATRIX

| W6 Module | Depends On | Min Version | Breaking Change Risk |
|---|---|---|---|
| AcousticClassifier | @tensorflow/tfjs-node | 4.x | MEDIUM (ARM build issues) |
| edge-runner.ts | better-sqlite3 | 9.x | LOW |
| MultiNodeFusion | TdoaCorrelator (W2) | W2 interface | LOW (stable W2 API) |
| MonteCarlo | EKFInstance (W5) | W5 EKFState type | LOW (stable W5 type) |
| SentinelPipeline | All W1-W5 modules | W5 release | MEDIUM (any W5 API change) |
| RiskHeatmap | Supabase JS | 2.39+ | LOW |
| brave1-importer | Supabase JS | 2.39+ | LOW |
| CotGenerator (updated) | W1 CotGenerator | W1 interface | LOW (additive change) |
