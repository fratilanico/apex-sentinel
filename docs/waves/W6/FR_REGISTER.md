# APEX-SENTINEL — Functional Requirements Register
# All waves W1–W6 | Last updated: 2026-03-25

---

## Summary

| Wave | FR Count | Status |
|------|----------|--------|
| W1 | 8 | DONE |
| W2 | 7 | DONE |
| W3 | 5 | DONE |
| W4 | 5 | DONE |
| W5 | 6 | DONE |
| W6 | 10 | PLANNED |
| **TOTAL** | **41** | |

---

## W1 — Core Acoustic Detection Layer

| FR ID | Title | Wave | Status | Test File | AC Count | Priority |
|-------|-------|------|--------|-----------|----------|----------|
| FR-W1-01 | VoiceActivityDetector | W1 | DONE | `__tests__/acoustic/vad.test.ts` | 8 | P0 |
| FR-W1-02 | FFTProcessor | W1 | DONE | `__tests__/acoustic/fft.test.ts` | 8 | P0 |
| FR-W1-03 | YAMNetSurrogate | W1 | DONE | `__tests__/acoustic/yamnet-surrogate.test.ts` | 6 | P0 |
| FR-W1-04 | AcousticPipeline | W1 | DONE | `__tests__/pipeline/acoustic-pipeline.test.ts` | 10 | P0 |
| FR-W1-05 | RollingRssiBaseline | W1 | DONE | `__tests__/rf/rolling-rssi.test.ts` | 8 | P1 |
| FR-W1-06 | TdoaSolver | W1 | DONE | `__tests__/correlation/tdoa-solver.test.ts` | 10 | P0 |
| FR-W1-07 | TrackManager | W1 | DONE | `__tests__/tracking/track-manager.test.ts` | 12 | P0 |
| FR-W1-08 | NodeRegistry | W1 | DONE | `__tests__/node/node-registry.test.ts` | 8 | P1 |

### W1 Acceptance Criteria Detail

**FR-W1-01 VoiceActivityDetector**
- AC-01: Detects audio energy above configurable threshold (default 0.6 RMS)
- AC-02: Returns false for silence frames (RMS < threshold)
- AC-03: Returns true for frames containing acoustic events
- AC-04: Configurable window size (default 2048 samples)
- AC-05: Processes frames in <1ms on x86-cpu
- AC-06: Handles Float32Array input
- AC-07: Reports frame energy value alongside boolean decision
- AC-08: Threshold adjustable at runtime without restart

**FR-W1-02 FFTProcessor**
- AC-01: Computes FFT on PCM Float32Array input
- AC-02: Returns frequency bins with amplitude
- AC-03: Supports configurable FFT size (512/1024/2048)
- AC-04: Returns power spectral density (magnitude squared)
- AC-05: Identifies dominant frequency in result
- AC-06: Handles zero-padded input for non-power-of-2 lengths
- AC-07: Processing time <2ms for 2048-sample frame
- AC-08: Output bin count = FFT_size / 2 + 1

**FR-W1-03 YAMNetSurrogate**
- AC-01: Accepts mel-spectrogram Float32Array input
- AC-02: Returns classification label and confidence 0-1
- AC-03: Default labels include 'shahed-136', 'lancet-3', 'unknown', 'noise'
- AC-04: Confidence sum across all labels = 1.0
- AC-05: Supports synchronous and async inference
- AC-06: Returns 'unknown' label for unrecognised patterns

**FR-W1-04 AcousticPipeline**
- AC-01: Chains VAD → FFT → YAMNet in single call
- AC-02: Returns AcousticDetection with all intermediate results
- AC-03: Skips FFT+YAMNet when VAD returns false (performance gate)
- AC-04: Configurable per-module via PipelineConfig
- AC-05: Emits detection events via callback
- AC-06: Handles errors in any stage without crashing pipeline
- AC-07: Processes 50 frames/second without queuing
- AC-08: Thread-safe for concurrent frame input
- AC-09: Records processing latency per frame
- AC-10: Returns null for silent frames

**FR-W1-06 TdoaSolver**
- AC-01: Solves TDOA for 3+ nodes using hyperbolic positioning
- AC-02: Returns lat/lon with confidence
- AC-03: Handles co-linear node degenerate case gracefully
- AC-04: Confidence degrades with node count below 4
- AC-05: Accepts node positions as lat/lon pairs
- AC-06: Speed of sound configurable (default 343 m/s)
- AC-07: Returns null when solution cannot converge
- AC-08: Solver converges in <50 iterations
- AC-09: Position error <10m with ideal geometry
- AC-10: Reports GDOP (geometric dilution of precision)

**FR-W1-07 TrackManager**
- AC-01: Creates new track from first DetectionInput
- AC-02: Updates existing track when same trackId received
- AC-03: Evicts stale tracks after configurable TTL (default 60s)
- AC-04: Returns all active tracks
- AC-05: Returns single track by ID
- AC-06: Throws when track not found
- AC-07: Track count correctly reflects create/evict lifecycle
- AC-08: Thread-safe concurrent updates
- AC-09: Emits track:created and track:updated events
- AC-10: Track confidence decays over time without updates
- AC-11: Supports manual track deletion
- AC-12: Returns track history (last N positions)

---

## W2 — Mesh Network + Relay Layer

| FR ID | Title | Wave | Status | Test File | AC Count | Priority |
|-------|-------|------|--------|-----------|----------|----------|
| FR-W2-01 | NatsStreamManager | W2 | DONE | `__tests__/nats/nats-stream-manager.test.ts` | 8 | P0 |
| FR-W2-02 | MtlsCertManager | W2 | DONE | `__tests__/infra/mtls-cert-manager.test.ts` | 6 | P0 |
| FR-W2-03 | CircuitBreaker | W2 | DONE | `__tests__/infra/circuit-breaker.test.ts` | 10 | P0 |
| FR-W2-04 | EdgeFunctions | W2 | DONE | `__tests__/edge/edge-functions.test.ts` | 8 | P1 |
| FR-W2-05 | TelegramBot | W2 | DONE | `__tests__/relay/telegram-bot.test.ts` | 10 | P1 |
| FR-W2-06 | CotRelay | W2 | DONE | `__tests__/relay/cot-relay.test.ts` | 8 | P1 |
| FR-W2-07 | TdoaCorrelator | W2 | DONE | `__tests__/correlation/tdoa-correlator.test.ts` | 12 | P0 |

### W2 Acceptance Criteria Detail

**FR-W2-03 CircuitBreaker**
- AC-01: Starts in CLOSED state
- AC-02: Transitions to OPEN after N consecutive failures (default 5)
- AC-03: OPEN state rejects calls immediately without executing
- AC-04: Transitions to HALF-OPEN after timeout (default 30s)
- AC-05: HALF-OPEN allows single probe call
- AC-06: Successful probe → CLOSED; failed probe → OPEN
- AC-07: Failure count resets on successful call in CLOSED
- AC-08: State transitions emit events
- AC-09: Current state and failure count observable
- AC-10: Configurable failure threshold and timeout

**FR-W2-07 TdoaCorrelator**
- AC-01: Correlates TDOA reports from multiple nodes for same detection
- AC-02: Groups reports within configurable time window (default 500ms)
- AC-03: Calls TdoaSolver when >= 3 nodes report same event
- AC-04: Returns correlated position with multi-node confidence
- AC-05: Discards stale reports (configurable TTL)
- AC-06: Handles duplicate reports from same node
- AC-07: Reports correlation quality metric
- AC-08: Configurable maximum node count per correlation
- AC-09: Thread-safe concurrent report arrival
- AC-10: Emits correlation:complete event
- AC-11: Handles partial correlation (2 nodes) with reduced confidence
- AC-12: Supports manual flush of correlation buffer

---

## W3 — Node Lifecycle + Calibration

| FR ID | Title | Wave | Status | Test File | AC Count | Priority |
|-------|-------|------|--------|-----------|----------|----------|
| FR-W3-01 | NatsClientFSM | W3 | DONE | `__tests__/nats/nats-client-fsm.test.ts` | 10 | P0 |
| FR-W3-02 | EventPublisher | W3 | DONE | `__tests__/nats/event-publisher.test.ts` | 8 | P0 |
| FR-W3-03 | CalibrationStateMachine | W3 | DONE | `__tests__/node/calibration-fsm.test.ts` | 10 | P0 |
| FR-W3-04 | BatteryOptimizer | W3 | DONE | `__tests__/node/battery-optimizer.test.ts` | 8 | P1 |
| FR-W3-05 | ModelManager | W3 | DONE | `__tests__/deploy/model-manager.test.ts` | 8 | P1 |

### W3 Acceptance Criteria Detail

**FR-W3-01 NatsClientFSM**
- AC-01: States: DISCONNECTED → CONNECTING → CONNECTED → DISCONNECTED
- AC-02: Auto-reconnect on disconnect with exponential backoff
- AC-03: Max reconnect attempts configurable (default 10)
- AC-04: Exposes current state as observable
- AC-05: Emits state transition events
- AC-06: Queues outbound messages during CONNECTING state
- AC-07: Delivers queued messages on CONNECTED
- AC-08: Supports graceful disconnect (drain in-flight messages)
- AC-09: Reports connection latency
- AC-10: Thread-safe state transitions

**FR-W3-03 CalibrationStateMachine**
- AC-01: States: IDLE → CALIBRATING → READY → FAILED
- AC-02: Calibration requires minimum 30s of background noise
- AC-03: Computes ambient noise floor baseline
- AC-04: Rejects calibration if noise floor too high (>-20dBFS)
- AC-05: READY state stores calibration parameters
- AC-06: FAILED state stores failure reason
- AC-07: Supports recalibration (READY → CALIBRATING)
- AC-08: Calibration progress reported as 0-100%
- AC-09: Timeout after 120s → FAILED
- AC-10: Calibration result persisted to Supabase

---

## W4 — Dashboard + Persistence Layer

| FR ID | Title | Wave | Status | Test File | AC Count | Priority |
|-------|-------|------|--------|-----------|----------|----------|
| FR-W4-01 | TrackStore | W4 | DONE | `__tests__/alerts/track-store.test.ts` | 10 | P0 |
| FR-W4-02 | AlertStore | W4 | DONE | `__tests__/alerts/alert-store.test.ts` | 10 | P0 |
| FR-W4-03 | CotExport | W4 | DONE | `__tests__/relay/cot-export.test.ts` | 8 | P1 |
| FR-W4-04 | StatsAggregator | W4 | DONE | `__tests__/dashboard/stats.test.ts` | 8 | P1 |
| FR-W4-05 | KeyboardShortcuts | W4 | DONE | `__tests__/dashboard/keyboard-shortcuts.test.ts` | 6 | P2 |

### W4 Acceptance Criteria Detail

**FR-W4-01 TrackStore**
- AC-01: Persists track to Supabase on create
- AC-02: Updates existing track row on position update
- AC-03: Subscribes to Supabase real-time channel for remote updates
- AC-04: Local cache with <1ms read latency
- AC-05: Returns all active tracks from local cache
- AC-06: Evicts tracks beyond TTL from cache and DB
- AC-07: Handles Supabase errors gracefully (swallow, log)
- AC-08: created_at is set once on create, never updated on update
- AC-09: Bulk upsert for multi-track synchronisation
- AC-10: Real-time subscription triggers local cache update

**FR-W4-02 AlertStore**
- AC-01: Creates alert with severity: LOW | MEDIUM | HIGH | CRITICAL
- AC-02: Acknowledges alert by ID (sets acknowledged_at)
- AC-03: Queries alerts by severity
- AC-04: Queries alerts by time range
- AC-05: Unacknowledged alert count observable
- AC-06: Persists to Supabase alert_events table
- AC-07: Emits alert:created event
- AC-08: Emits alert:acknowledged event
- AC-09: Returns most recent N alerts
- AC-10: CRITICAL alerts trigger Telegram notification

---

## W5 — Prediction Engine

| FR ID | Title | Wave | Status | Test File | AC Count | Priority |
|-------|-------|------|--------|-----------|----------|----------|
| FR-W5-01 | EKFInstance | W5 | DONE | `__tests__/prediction/ekf.test.ts` | 30 | P0 |
| FR-W5-02 | MatrixOps | W5 | DONE | `__tests__/prediction/matrix-ops.test.ts` | 25 | P0 |
| FR-W5-03 | PolynomialPredictor | W5 | DONE | `__tests__/prediction/polynomial-predictor.test.ts` | 20 | P0 |
| FR-W5-04 | ImpactEstimator | W5 | DONE | `__tests__/prediction/impact-estimator.test.ts` | 20 | P0 |
| FR-W5-05 | PredictionPublisher | W5 | DONE | `__tests__/prediction/prediction-publisher.test.ts` | 15 | P0 |
| FR-W5-06 | MultiTrackEKFManager | W5 | DONE | `__tests__/prediction/multi-track-manager.test.ts` | 20 | P0 |

### W5 Acceptance Criteria Detail

**FR-W5-01 EKFInstance**
- AC-01: Singer Q model (6D state: lat, lon, alt, vLat, vLon, vAlt)
- AC-02: State covariance tracked and updated each step
- AC-03: Kalman gain computed correctly per update
- AC-04: predict() advances state by dt seconds
- AC-05: update() corrects state from observation
- AC-06: Confidence derived from covariance trace
- AC-07: Handles missing observations (predict only)
- AC-08: State snapshot exportable as EKFStateSnapshot
- AC-09: Numerical stability — no NaN or Inf in state
- AC-10: Reset to initial state on trackId change

**FR-W5-06 MultiTrackEKFManager**
- AC-01: Manages up to 1000 concurrent tracks
- AC-02: Creates new EKFInstance on first DetectionInput for track
- AC-03: Routes DetectionInput to correct EKFInstance by trackId
- AC-04: Evicts stale tracks after 120s without updates
- AC-05: processAll() updates all tracks in <5ms total
- AC-06: Returns PredictionResult for each updated track
- AC-07: Thread-safe concurrent DetectionInput arrival
- AC-08: Track count observable
- AC-09: Bulk update API for batch DetectionInput processing
- AC-10: Emits track:evicted event on stale eviction

---

## W6 — Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment

| FR ID | Title | Wave | Status | Test File | AC Count | Priority |
|-------|-------|------|--------|-----------|----------|----------|
| FR-W6-01 | AcousticProfileLibrary | W6 | PLANNED | `__tests__/ml/acoustic-profile-library.test.ts` | 10 | P0 |
| FR-W6-02 | YAMNetFineTuner | W6 | PLANNED | `__tests__/ml/yamnnet-finetuner.test.ts` | 10 | P0 |
| FR-W6-03 | FalsePositiveGuard | W6 | PLANNED | `__tests__/ml/false-positive-guard.test.ts` | 12 | P0 |
| FR-W6-04 | DatasetPipeline | W6 | PLANNED | `__tests__/ml/dataset-pipeline.test.ts` | 10 | P0 |
| FR-W6-05 | MultiNodeFusion | W6 | PLANNED | `__tests__/fusion/multi-node-fusion.test.ts` | 10 | P0 |
| FR-W6-06 | MonteCarloPropagator | W6 | PLANNED | `__tests__/prediction/monte-carlo-propagator.test.ts` | 8 | P1 |
| FR-W6-07 | EdgeDeployer | W6 | PLANNED | `__tests__/deploy/edge-deployer.test.ts` | 8 | P1 |
| FR-W6-08 | SentinelPipeline | W6 | PLANNED | `__tests__/integration/sentinel-pipeline.test.ts` | 12 | P1 |
| FR-W6-09 | CursorOfTruth | W6 | PLANNED | `__tests__/output/cursor-of-truth.test.ts` | 8 | P2 |
| FR-W6-10 | BRAVE1Format | W6 | PLANNED | `__tests__/output/brave1-format.test.ts` | 8 | P2 |

### W6 Acceptance Criteria Detail

**FR-W6-01 AcousticProfileLibrary**
- AC-01: Ships with 4 seed profiles (Shahed-136, Lancet-3, Mavic Mini, Orlan-10)
- AC-02: `getProfile(id)` returns correct profile or throws `DroneProfileNotFoundError`
- AC-03: `matchFrequency(min, max)` returns profiles with frequency overlap
- AC-04: Match scored by overlap ratio (0-1) + peak frequency bonus
- AC-05: Results sorted by score descending
- AC-06: `addProfile` throws on duplicate ID
- AC-07: `removeProfile` throws `DroneProfileNotFoundError` for missing ID
- AC-08: Singleton export available
- AC-09: Custom profiles persist through session
- AC-10: Shahed-136 profile annotates 50cc motorcycle false positive risk as 'high'

**FR-W6-02 YAMNetFineTuner**
- AC-01: Default config: 22050Hz SR, 2s window, 0.5s hop, 128 mels, fmin=80, fmax=8000
- AC-02: ModelBackend injected — unit tests use mock, integration uses ONNX Runtime
- AC-03: `trainEpoch(n)` returns TrainingMetrics with all required fields
- AC-04: `evaluate()` returns metrics including falsePositiveRate
- AC-05: `exportONNX()` returns ModelMetadata with version and trainedAt
- AC-06: `getMetrics()` returns one entry per trained epoch
- AC-07: learningRate default 1e-4
- AC-08: batchSize default 32
- AC-09: Training does not mutate input dataset
- AC-10: Metrics include droneClassAccuracy (class-specific, not overall)

**FR-W6-03 FalsePositiveGuard**
- AC-01: Rejects detection when yamnetConfidence < 0.85 (configurable)
- AC-02: Rejects detection when Doppler-derived speed > 60 km/h
- AC-03: Rejects detection when temporal samples show linear heading variance < 5° AND speed > 40 km/h over 30s window
- AC-04: RF cross-check optional — enabled only when RTL-SDR hardware present
- AC-05: RF cross-check rejects if no 900MHz burst within 0.5km of track centroid
- AC-06: Steps evaluated in order (confidence → doppler → temporal → rf)
- AC-07: All four reasons ('low-confidence', 'temporal-linear', 'doppler-vehicle', 'rf-cross-check-fail') supported
- AC-08: Heading variance uses circular statistics (handles 359°→1° wraparound)
- AC-09: Returns non-null `reason` for every FP decision
- AC-10: Returns `reason: null` for genuine detections
- AC-11: Works with empty `rfSamples` when rf disabled
- AC-12: Confidence field in result reflects yamnetConfidence input

**FR-W6-04 DatasetPipeline**
- AC-01: `ingest()` accepts DatasetItem array, returns count
- AC-02: Duplicate IDs throw on ingest
- AC-03: `augment()` creates new item with augmented: true and unique ID
- AC-04: `split()` assigns all items deterministically (djb2 hash mod 100)
- AC-05: Split ratios: 70% train / 15% val / 15% test
- AC-06: Same item IDs always produce same split regardless of insertion order
- AC-07: `getStats()` returns correct totals, byLabel, bySplit, bySource
- AC-08: `exportTFRecord()` accepts fileWriter injection for unit tests
- AC-09: `clear()` removes all items
- AC-10: Augmented items tracked separately in stats.augmentedCount

**FR-W6-05 MultiNodeFusion**
- AC-01: Inverse-distance weighting: w_i = 1/distanceKm_i
- AC-02: fusedLat and fusedLon are IDW-weighted centroids
- AC-03: fusedConfidence is IDW-weighted average of node confidences
- AC-04: agreement = true when ≥ 2/3 of nodes have confidence ≥ 0.7
- AC-05: Throws `FusionInsufficientNodesError` when fewer than minNodes reports available
- AC-06: Reports with distanceKm=0 are filtered (avoid division by zero)
- AC-07: Reports older than maxAgeMs (default 10000ms) are filtered
- AC-08: Reports below minConfidence (default 0.5) are filtered
- AC-09: `fuseByTrackId()` handles multiple tracks in one call
- AC-10: contributingNodes list contains node IDs used in fusion

**FR-W6-06 MonteCarloPropagator**
- AC-01: Default 1000 samples, positionSigma=50m, velocitySigma=2m/s
- AC-02: Uses Box-Muller Gaussian sampling
- AC-03: Diagonal covariance (NOT Cholesky) for speed
- AC-04: 1000 samples complete in <10ms, 500 samples in <5ms
- AC-05: Returns meanLat, meanLon, stdLat, stdLon
- AC-06: confidence95RadiusM = 95th percentile of sample distances from mean
- AC-07: Handles null ImpactEstimator results (filters, does not throw)
- AC-08: `computedInMs` field accurately reflects wall-clock time

**FR-W6-07 EdgeDeployer**
- AC-01: Supports rpi4 (int8, 512MB), jetson-nano (fp16, 2GB), x86-cpu (fp32, 4GB)
- AC-02: `createManifest()` uses device profile's preferred precision
- AC-03: `quantize()` delegates to injected ONNXRunner
- AC-04: `validateDeployment()` runs test inference and measures latency
- AC-05: `validateDeployment()` throws `EdgeDeploymentError` with `diagnostic` field on failure
- AC-06: `deploy()` orchestrates: createManifest → quantize → validate
- AC-07: ONNXRunner injected for testability
- AC-08: Device profiles available as exported constant DEVICE_PROFILES

**FR-W6-08 SentinelPipeline**
- AC-01: `start()` / `stop()` lifecycle control
- AC-02: `processAudioFrame()` throws `PipelineNotRunningError` when stopped
- AC-03: VAD energy gate rejects silent frames
- AC-04: FalsePositiveGuard integrated in processing flow
- AC-05: Results published to NATS when connected
- AC-06: Results buffered (max 1000) when NATS offline — no throw
- AC-07: Oldest frame dropped when buffer at capacity (not newest)
- AC-08: `drainOfflineBuffer()` flushes to NATS on reconnect
- AC-09: Internal EventBus supports subscription via `on()` / `off()`
- AC-10: `getStatus()` returns accurate PipelineStatus snapshot
- AC-11: processedFrames counter increments on every call
- AC-12: Module dependencies (YAMNet, FPG, TrackManager) injected

**FR-W6-09 CursorOfTruth**
- AC-01: POSTs to VM gateway URL (http://4.231.218.96:7429/chat) — never ANTHROPIC_API_KEY
- AC-02: Uses model `claude-sonnet-4-6`
- AC-03: `coarsenReport()` rounds coordinates to 0.005° grid (~500m)
- AC-04: Template fallback used when gateway unavailable
- AC-05: Template includes classification, confidence, nodeCount, timeToImpact
- AC-06: HttpClient injected for unit tests
- AC-07: Timeout default 5000ms
- AC-08: `config.fallbackToTemplate: false` causes throw on gateway error

**FR-W6-10 BRAVE1Format**
- AC-01: `encode()` maps TacticalReport → BRAVE1Message
- AC-02: type = 'a-h-A' for confidence > 0.7, 'a-f-A' otherwise
- AC-03: uid is valid UUID v4
- AC-04: time is ISO8601 UTC string
- AC-05: how = 'm-g' (machine generated)
- AC-06: version field = '2'
- AC-07: `validate()` checks all required fields and value ranges
- AC-08: `decode()` reverses encode (partial TacticalReport)
- AC-09: `transmit()` retries on non-200 up to configured retry count

---

## FR Status Counts

| Status | Count |
|--------|-------|
| DONE | 31 |
| PLANNED | 10 |
| IN PROGRESS | 0 |
| BLOCKED | 0 |
| **TOTAL** | **41** |

---

## Priority Distribution

| Priority | Count | Waves |
|----------|-------|-------|
| P0 | 22 | W1-W6 critical path |
| P1 | 14 | W1-W6 important |
| P2 | 5 | W4-W6 nice-to-have |
