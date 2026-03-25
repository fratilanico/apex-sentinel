# APEX-SENTINEL — PRD.md
## Wave 6: Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
### Wave 6 | Project: APEX-SENTINEL | Version: 6.0.0
### Date: 2026-03-25 | Status: APPROVED
### Supabase: bymfcnwfyxuivinuzurr (eu-west-2 London)

---

## 1. PRODUCT CONTEXT

### 1.1 Problem Statement

Front-line air defense units defending against Shahed-136 (Geranium-2) and Lancet-3 drones currently rely on:
1. Radar (expensive, jammed, detectable by adversary)
2. Human spotters (fatigue, night blindness, limited range)
3. Visual cameras (weather/night dependent)

Acoustic detection fills a critical gap: passive, low-cost, covert, 24/7 capability. The Ukrainian Ground Forces and Territorial Defense units report ~80% of Shahed attacks occur at night between 02:00–05:00 local time, when human vigilance is lowest.

### 1.2 INDIGO AirGuard Hackathon Requirements

This wave is driven by INDIGO AirGuard program requirements submitted 2026-03-20:
- Working demo on RPi 4 hardware
- Live ATAK integration (CoT delivery to EUD tablets)
- False positive rate < 5% in field conditions
- End-to-end latency: audio capture → ATAK alert < 5 seconds
- Offline capability (no continuous internet required)

### 1.3 W6 as Completion Wave

W1–W5 built the infrastructure (VAD, FFT, YAMNet surrogate, NATS mesh, mTLS, TrackManager, EKF, prediction). W6 replaces the YAMNet surrogate with a fine-tuned model trained on real Shahed audio, wires everything into a single deployable pipeline, and adds Monte Carlo risk heatmapping for operator situational awareness.

---

## 2. FUNCTIONAL REQUIREMENTS

### FR-W6-01: YAMNet Fine-Tuning Pipeline for Shahed-136

**Priority:** P0 — Hackathon blocker
**Owner:** ML team

**User story:** As a detection system, I need a fine-tuned acoustic classifier so that I can distinguish Shahed-136 engine noise from ambient sounds with >90% precision.

**Acceptance criteria:**
- AC-01-01: Fine-tuning pipeline accepts WAV files at 22050 Hz, mono, float32
- AC-01-02: Pipeline resamples to 16kHz for YAMNet preprocessing
- AC-01-03: Frozen YAMNet base produces 1024-dim embeddings per 0.96s frame
- AC-01-04: Classification head trained with Adam(lr=1e-4), batch=32
- AC-01-05: EarlyStopping(patience=10) prevents overfitting
- AC-01-06: Training metrics logged: loss, accuracy, precision, recall, F1 per epoch
- AC-01-07: Final model exported as TFLite with INT8 quantization
- AC-01-08: Model achieves ≥90% precision on held-out test set (shahed vs motorcycle)
- AC-01-09: Model file size ≤ 50 MB post-quantization
- AC-01-10: TypeScript wrapper `yamnet-finetune.ts` exposes `classify(audioBuffer: Float32Array): ClassificationResult`

**Technical specification:**
```typescript
interface ClassificationResult {
  label: 'shahed' | 'lancet' | 'false_positive' | 'ambient';
  confidence: number;          // 0.0–1.0
  probabilities: {
    shahed: number;
    lancet: number;
    false_positive: number;
    ambient: number;
  };
  processingTimeMs: number;
  modelVersion: string;        // e.g. "yamnet-shahed-v1.0.0"
  windowStartMs: number;
  windowEndMs: number;
}
```

---

### FR-W6-02: Lancet-3 Electric Motor Classifier

**Priority:** P1
**Owner:** ML team

**User story:** As a detection system, I need to classify Lancet-3 electric motor signatures so that operators know whether a threat is a cruise missile (Shahed) or loitering munition (Lancet).

**Acceptance criteria:**
- AC-02-01: Classifier handles 1–4 kHz frequency range for electric motor detection
- AC-02-02: Separate mel spectrogram params: fmin=500Hz, fmax=8000Hz, n_mels=64
- AC-02-03: Lancet precision ≥ 70% on test set (harder target, less training data)
- AC-02-04: Output included in ClassificationResult.probabilities.lancet
- AC-02-05: Model trained jointly with Shahed (shared classification head)

**Note:** Lancet acoustic detection range is ~200–500m vs Shahed 2–5km. Acoustic detection serves as confirmation when visual/RF detection already triggered. Precision requirement lowered accordingly.

---

### FR-W6-03: False Positive Classifier

**Priority:** P0 — Field usability blocker
**Owner:** ML team

**User story:** As a front-line operator, I need the system to avoid alerting on motorcycle traffic and generator noise so that I don't exhaust attention on false alarms.

**Acceptance criteria:**
- AC-03-01: 5-class training: shahed_piston | lancet_electric | motorcycle_50cc | generator_diesel | ambient
- AC-03-02: FalsePositiveGuard wraps AcousticClassifier output
- AC-03-03: If P(false_positive) > 0.3 AND P(shahed) < 0.8: suppress detection
- AC-03-04: False positive rate ≤ 5% at precision ≥ 90% operating point
- AC-03-05: FalsePositiveGuard exposes tunable threshold: `setFpThreshold(threshold: number)`
- AC-03-06: All suppression decisions logged to Supabase `fp_suppression_log` table
- AC-03-07: Motorcycle discrimination uses Doppler shift rate feature (additional to mel spectrogram)

**Doppler shift rate feature:**
```
Motorcycle on road: max Doppler rate ≈ ±20 Hz/s (approaching then receding)
Shahed-136 in cruise: slow, nearly constant heading → max Doppler rate ≈ ±3 Hz/s
Feature: d(f0)/dt measured over 5s window → appended to YAMNet embedding before classification head
```

---

### FR-W6-04: Acoustic Dataset Ingestion Pipeline

**Priority:** P1
**Owner:** ML team

**User story:** As a training data engineer, I need an automated pipeline to collect, segment, and label audio from public sources so that the classifier has sufficient training data.

**Acceptance criteria:**
- AC-04-01: `yt-dlp` scraper accepts search query, downloads audio only (no video)
- AC-04-02: FFmpeg extracts WAV at 22050 Hz, mono, from downloaded media
- AC-04-03: Segmenter produces 2s windows with 0.5s hop, zero-padded at boundaries
- AC-04-04: Each segment stored with metadata: source_url, segment_start_ms, label, confidence
- AC-04-05: Telegram OSINT scraper polls channels: @ukraine_war_footage, @militaryosint
- AC-04-06: Auto-labeler: if source video title contains known keywords → assign preliminary label
  - Keywords → shahed: ["шахед", "shaheed", "shahed", "geranium", "герань", "дрон атака"]
  - Keywords → false_positive: ["мотоцикл", "motorcycle", "generator", "газонокосилка"]
- AC-04-07: Human review queue: all auto-labeled clips pushed to `review_queue` Supabase table
- AC-04-08: Supabase storage bucket `acoustic-training-data` holds WAV segments
- AC-04-09: Pipeline produces manifest CSV: path, label, duration_s, source, reviewed

---

### FR-W6-05: Multi-Node Correlated Acoustic Inference

**Priority:** P1
**Owner:** Fusion team

**User story:** As a network operator with multiple sensor nodes, I need cross-node acoustic correlation so that I get more accurate position estimates than any single node can provide.

**Acceptance criteria:**
- AC-05-01: MultiNodeFusion accepts DetectionEvent from ≥2 nodes with acoustic confidence ≥ 0.5
- AC-05-02: Time-alignment: events within ±5s window are considered correlatable
- AC-05-03: TDoA cross-correlation using existing W1 TdoaCorrelator (extended for acoustic)
- AC-05-04: Fusion weights: acoustic × confidence, RF × RSSI_quality, TDoA × (1/GDOP)
- AC-05-05: GDOP gate: if GDOP > 5.0 → discard TDoA contribution
- AC-05-06: Fused detection published to NATS `sentinel.fusion.detections`
- AC-05-07: Fused confidence = harmonic mean of contributing node confidences, weighted by distance to estimated position
- AC-05-08: If only 1 node detects: publish single-node detection with flag `multi_node: false`

---

### FR-W6-06: Monte Carlo Trajectory Risk Heatmap

**Priority:** P1
**Owner:** Risk team

**User story:** As a civil defense coordinator, I need a probability map of where a detected drone might impact so that I can prioritize evacuation and intercept resources.

**Acceptance criteria:**
- AC-06-01: Monte Carlo runs N=1000 simulations per confirmed track
- AC-06-02: Each simulation samples initial state from N(ekf_state, P_covariance)
- AC-06-03: Trajectory integration: 1s time steps, constant-velocity + gravity correction
- AC-06-04: Grid: 50m cells, extent ±5km from estimated impact
- AC-06-05: P(impact) per cell = simulations landing in cell / 1000
- AC-06-06: Cells with P < 0.001 pruned from output (storage efficiency)
- AC-06-07: Heatmap stored in Supabase `risk_heatmaps` table as JSONB
- AC-06-08: NATS publish: `sentinel.risk.{trackId}` on each heatmap update
- AC-06-09: Heatmap regenerated every 10s while track is CONFIRMED
- AC-06-10: Runtime budget: entire Monte Carlo computation < 100ms on Fortress VM

---

### FR-W6-07: Edge Deployment (RPi 4 / Jetson Nano)

**Priority:** P0 — Hackathon demo blocker
**Owner:** Edge team

**User story:** As a field deployment engineer, I need the detection system to run on a Raspberry Pi 4 so that nodes can be deployed at low cost with no specialized hardware.

**Acceptance criteria:**
- AC-07-01: `edge-runner.ts` starts audio capture, inference loop, and NATS client
- AC-07-02: Audio capture: `arecord` subprocess, 22050 Hz, mono, signed 16-bit PCM
- AC-07-03: Ring buffer: 2s × 22050 samples, new inference every 0.5s (hop)
- AC-07-04: Inference: TFLite runtime, <200ms per 2s window on RPi 4
- AC-07-05: Memory footprint: ≤ 500 MB RSS (RPi 4 hard limit)
- AC-07-06: Offline SQLite buffer: detections stored when NATS unavailable
- AC-07-07: On NATS reconnect: flush offline buffer in batches of 50
- AC-07-08: NODE_HEALTH published every 30s: {nodeId, uptime, detectionCount, lastDetectionAt, natsConnected}
- AC-07-09: Graceful shutdown on SIGTERM: stop audio capture, flush buffer, close NATS

---

### FR-W6-08: Full Integration Layer

**Priority:** P0 — Completion gate
**Owner:** Integration team

**User story:** As a system integrator, I need a single orchestrator that wires all W1–W6 modules together so that deployment requires starting one service.

**Acceptance criteria:**
- AC-08-01: `SentinelPipeline.ts` implements `ILifecycle { start(), stop() }`
- AC-08-02: All W1–W5 modules instantiated and wired via dependency injection
- AC-08-03: Startup sequence: NATS → Supabase → TrackManager → EKF → Classifier → AudioCapture
- AC-08-04: Shutdown sequence: AudioCapture → Classifier → TrackManager → EKF → Supabase → NATS
- AC-08-05: Heartbeat: NODE_HEALTH to NATS every 30s
- AC-08-06: Error isolation: one module failure does not crash pipeline (error boundaries per component)
- AC-08-07: Metrics: pipeline.detections.total, pipeline.fps_suppressed, pipeline.nats_reconnects
- AC-08-08: Startup time: all modules initialized < 10s on RPi 4

---

### FR-W6-09: ATAK CoT Output

**Priority:** P0 — Hackathon demo blocker
**Owner:** Integration team

**User story:** As an ATAK tablet operator, I receive CoT events showing drone type, position, and confidence so that I can task intercept assets.

**Acceptance criteria:**
- AC-09-01: Shahed-136 confirmed track → CoT type `a-h-A-C-F`
- AC-09-02: Lancet-3 confirmed track → CoT type `a-h-A-M-F-Q`
- AC-09-03: Unconfirmed candidate → CoT type `a-u-A`
- AC-09-04: Track confirmed after ≥3 acoustic detections within 30s window
- AC-09-05: CoT `<remarks>` includes: confidence, classifier version, node count
- AC-09-06: CoT stale time: 60s
- AC-09-07: CotRelay (W2) used unchanged for TCP multicast to ATAK
- AC-09-08: CoT generation triggered within 1s of track confirmation

---

### FR-W6-10: BRAVE1 / Ukrainian Defense Data Format

**Priority:** P2
**Owner:** Ingestion team

**User story:** As a data integration engineer, I need to import historical detection data from Ukrainian defense partners so that the system can be calibrated against known incidents.

**Acceptance criteria:**
- AC-10-01: `brave1-importer.ts` accepts CSV and JSON input
- AC-10-02: CSV schema: lat,lon,alt,timestamp,drone_type,confidence,audio_file_ref
- AC-10-03: JSON schema: array of objects with same fields, snake_case
- AC-10-04: Normalization to `DetectionInput` interface (W5 type)
- AC-10-05: Backfill to Supabase `brave1_detections` table
- AC-10-06: Audio file references resolved from Supabase storage if present
- AC-10-07: Duplicate detection: skip records where (lat, lon, timestamp) within 10m/1s of existing
- AC-10-08: Import progress logged: records_processed, records_inserted, duplicates_skipped, errors

---

## 3. NON-FUNCTIONAL REQUIREMENTS

### 3.1 Performance

| Metric | Target | Hard Limit |
|---|---|---|
| Edge inference latency | <200ms/window | 500ms (miss = drop frame) |
| Pipeline end-to-end (audio → ATAK) | <5s | 10s |
| Monte Carlo computation | <100ms | 500ms |
| NATS publish latency | <50ms p99 | 200ms |
| Memory RSS (edge) | <400MB | 500MB |
| CPU (edge, RPi 4) | <80% | 95% |

### 3.2 Reliability

- Edge node: restart on crash via systemd `Restart=on-failure`
- NATS disconnect: automatic reconnect with exponential backoff (1s, 2s, 4s, 8s, max 60s)
- Supabase disconnect: queue writes in memory, flush on reconnect (max 1000 items)
- Model load failure: fail fast with clear error, do not start audio capture

### 3.3 Accuracy

| Metric | Target | Measurement |
|---|---|---|
| Shahed precision | ≥90% | Held-out test set |
| Shahed recall | ≥80% | Held-out test set |
| False positive rate | ≤5% | Field test (motorcycle, generator) |
| Lancet precision | ≥70% | Held-out test set |
| AUC-ROC (shahed vs all) | ≥0.95 | Test set |

### 3.4 Security

- mTLS on all NATS connections (existing W2 infrastructure)
- Node authentication via node-specific certificates
- No audio data transmitted raw over NATS (features only, not PCM)
- Supabase RLS enforced on all tables

---

## 4. CONSTRAINTS

1. **Training hardware:** YAMNet fine-tuning requires GPU (laptop/VM). Edge devices run inference only.
2. **Dataset size:** 3-day hackathon limits dataset to ~2000–3000 labeled clips.
3. **TFLite runtime on Node.js:** requires `@tensorflow/tfjs-node` or Python subprocess for TFLite. Design accommodates Python sidecar if needed.
4. **YAMNet license:** CC-BY 4.0. Attribution required in system documentation.
5. **yt-dlp legal:** scraping is for research/defense purposes. No redistribution of source audio.

---

## 5. OUT OF SCOPE (W6)

- GPU-accelerated training on edge (future W7)
- Real-time model retraining from field detections (future W7)
- Video + acoustic fusion (camera integration)
- Direction-finding antenna arrays (beamforming)
- Integration with Nota-A radar systems
- Mobile app (ATAK already handles display)

---

## 6. PERSONAS

### 6.1 Field Operator

**Name:** Sergeant Mykola (composite front-line operator)
**Context:** Deployed 5–15 km from front line, 12-hour watch rotation, RPi4 node in weatherproof box
**Primary need:** Reliable alert that fires only for real threats. No false alarms during normal traffic hours.
**Frustration with current state:** Prior to W6, alert fires for every motorcycle on the road at dawn. Operator silenced the system after 3 nights.
**W6 success condition:** ≤1 false alert per 4-hour watch shift. Alert within 10 seconds of Shahed entering 3km detection range.

### 6.2 C2 Intelligence Analyst

**Name:** Lieutenant Anna (composite operations center analyst)
**Context:** 50–100 km from front, monitors ATAK dashboard tracking 5–20 active threats simultaneously
**Primary need:** Track enrichment (drone type, confidence, predicted impact zone) to brief evacuation decisions
**Frustration with current state:** W5 CoT contains position and velocity but no acoustic classification, no impact probability ring
**W6 success condition:** Every CoT update includes drone type (shahed/lancet), acoustic confidence, and Monte Carlo 95th-percentile impact radius visible on ATAK

### 6.3 INDIGO AirGuard Integration Engineer

**Context:** Hackathon partner, integrates APEX-SENTINEL feeds into wider AirGuard sensor fusion platform
**Interface:** NATS subscriptions + REST API
**Primary need:** Consume `sentinel.detections.acoustic` and `sentinel.risk.*` without custom parsing
**W6 success condition:** AirGuard platform receives W6 events with no custom adapter code required

### 6.4 ML Dataset Engineer

**Context:** Internal team member ingesting OSINT audio daily for continuous model improvement
**Primary need:** One-command pipeline that ingests a Telegram channel dump, segments audio, auto-labels, uploads to Supabase
**W6 success condition:** `npx ts-node ingestion/dataset-pipeline.ts --source telegram --channel @ukraine_war_footage` produces labeled clips in Supabase storage within 5 minutes

---

## 7. USER STORIES

### 7.1 Field Operator Stories

**US-W6-01:** As a field operator, I want acoustic classification to run locally on my RPi4 so that detection works when cellular is jammed.

**US-W6-02:** As a field operator, I want false positives suppressed for 50cc motorcycles so that I do not get paged during morning traffic.

**US-W6-03:** As a field operator, I want the node to buffer detections in SQLite when NATS is unavailable and flush automatically on reconnect so that no events are lost during connectivity gaps.

**US-W6-04:** As a field operator, I want a node health heartbeat every 30 seconds so that the ops center can see if my node is alive without requiring me to check manually.

**US-W6-05:** As a field operator, I want graceful shutdown on SIGTERM so that audio capture and NATS connections close cleanly during systemd service restarts.

### 7.2 Analyst Stories

**US-W6-06:** As an analyst, I want the ATAK CoT marker to display drone type (Shahed vs Lancet) so that I can immediately task the appropriate intercept asset.

**US-W6-07:** As an analyst, I want Monte Carlo impact probability rings on the ATAK map so that I can brief civil defense on evacuation zones based on statistical worst-case estimates.

**US-W6-08:** As an analyst, I want multi-node fusion to produce a single CoT marker per drone rather than one per sensor node so that the ATAK display is not cluttered.

**US-W6-09:** As an analyst, I want risk heatmaps updated every 10 seconds on active confirmed tracks so that my situational picture reflects the latest EKF state.

**US-W6-10:** As an analyst, I want a 7-day acoustic detection history queryable via Supabase so that I can run post-incident analysis without accessing raw NATS logs.

### 7.3 Dataset Engineer Stories

**US-W6-11:** As a dataset engineer, I want the ingestion pipeline to auto-label clips based on source URL keywords so that I can process 500+ clips per day without manual review.

**US-W6-12:** As a dataset engineer, I want uncertain auto-labels pushed to a review_queue table so that human reviewers can correct the most ambiguous clips first (sorted by priority).

**US-W6-13:** As a dataset engineer, I want augmentation (pitch, time-stretch, noise) to triple the effective dataset size so that the classifier generalizes to varied field conditions.

**US-W6-14:** As a dataset engineer, I want a dataset stats command that shows counts per split per class so that I can identify class imbalance before starting a training run.

### 7.4 Integration Partner Stories

**US-W6-15:** As an INDIGO AirGuard engineer, I want APEX-SENTINEL to publish fusion events to `sentinel.fusion.detections` with a stable JSON schema so that I can write a subscriber without custom format negotiation.

**US-W6-16:** As an INDIGO AirGuard engineer, I want BRAVE1 format import support so that I can backfill APEX-SENTINEL Supabase with historical Ukrainian defense partner data.

---

## 8. DEPENDENCIES AND ASSUMPTIONS

### 8.1 Technical Dependencies

| Dependency | Version | Risk | Fallback |
|---|---|---|---|
| `@tensorflow/tfjs-node` | ≥4.x | Medium (ARM build) | Python sidecar for TFLite |
| `onnxruntime-node` | ≥1.17 | Low | — |
| YAMNet SavedModel (TF Hub) | 1.0 | Low (cached) | Locally bundled weights |
| NATS JetStream | 2.x | Low (W3 deployed) | — |
| Supabase JS v2 | ≥2.39 | Low | — |
| SQLite (better-sqlite3) | ≥9.x | Low | — |
| `yt-dlp` | latest | Medium (API changes) | Manual download |
| FFmpeg | ≥6.x | Low | — |

### 8.2 Data Dependencies

| Dependency | Status | Risk |
|---|---|---|
| Shahed audio (≥200 source videos) | In collection | HIGH |
| Motorcycle 50cc audio (≥200 clips) | Sourced from FreeSound | LOW |
| Generator / lawnmower audio | Sourced from FreeSound | LOW |
| Battlefield ambient audio | Sourced from OSINT | MEDIUM |
| INDIGO AirGuard BRAVE1 historical dataset | Awaiting partner | HIGH |

### 8.3 Assumptions

1. RPi4 nodes run Raspberry Pi OS 64-bit (Bookworm), Node.js 20 LTS installed
2. NATS cluster already deployed on fortress (W3). No new NATS infra needed.
3. Supabase `tracks` table already exists with `id UUID` primary key (W1 migration)
4. Operators have ATAK 4.x installed with multicast CoT configured on their network
5. Training is performed on a GPU machine (laptop/VM). Edge devices run inference only.
6. INDIGO AirGuard will accept NATS subscription + REST endpoint as integration surface

---

## 9. ACCEPTANCE SUMMARY TABLE

| FR | Priority | Acceptance Gate | Target Metric |
|---|---|---|---|
| FR-W6-01 (YAMNet fine-tune) | P0 | Test set F1 ≥ 0.90 | ≥90% Shahed precision |
| FR-W6-02 (Lancet classifier) | P1 | Test set F1 ≥ 0.70 | ≥70% Lancet precision |
| FR-W6-03 (FP classifier) | P0 | FP rate ≤ 5% | Motorcycle suppression |
| FR-W6-04 (Dataset pipeline) | P1 | Stats report generated | 2000+ labeled clips |
| FR-W6-05 (Multi-node fusion) | P1 | Integration test ≥2 nodes | TDoA CEP < 200m |
| FR-W6-06 (Monte Carlo) | P1 | Compute < 100ms N=1000 | 95th pct bounds correct |
| FR-W6-07 (Edge deploy) | P0 | RPi4 benchmark < 200ms | RAM < 512MB |
| FR-W6-08 (Integration layer) | P0 | All modules start/stop | Startup < 10s |
| FR-W6-09 (CoT output) | P0 | ATAK receives alert | Latency < 5s |
| FR-W6-10 (BRAVE1 import) | P2 | Import test dataset | 0 duplicates, clean dedup |
