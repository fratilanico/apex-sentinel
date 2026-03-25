# APEX-SENTINEL W6 — Acceptance Criteria

> Wave: W6 — Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
> Last updated: 2026-03-25
> Format: BDD (Given / When / Then)
> Total ACs: 44 | Per FR: 3–5

---

## FR-W6-01: AcousticProfileLibrary

**Summary:** Manages the drone acoustic taxonomy database. Provides frequency-based profile lookup and full profile retrieval for 10 target classes (8 drone classes + 2 false-positive classes).

---

**AC-01 — Shahed-136 frequency match**

```
GIVEN a frequency range of 150Hz to 300Hz
  AND the AcousticProfileLibrary is initialized with default profiles
WHEN matchFrequency({ fMin: 150, fMax: 300 }) is called
THEN the result is not null
  AND result.label === 'shahed-136'
  AND result.confidence > 0.8
```

**AC-02 — Lancet-3 frequency match**

```
GIVEN a frequency range of 1500Hz to 3500Hz
  AND the AcousticProfileLibrary is initialized with default profiles
WHEN matchFrequency({ fMin: 1500, fMax: 3500 }) is called
THEN the result is not null
  AND result.label === 'lancet-3'
  AND result.confidence > 0.7
```

**AC-03 — Full profile retrieval**

```
GIVEN the drone type identifier "shahed-136"
WHEN getProfile("shahed-136") is called
THEN the result is not null
  AND result.rpmRange[0] === 7000
  AND result.rpmRange[1] === 9000
  AND result.freqMin === 100
  AND result.freqMax === 400
  AND result.label === 'shahed-136'
  AND result.id is a non-empty string
```

**AC-04 — Unknown drone type error**

```
GIVEN a drone type identifier "phantom-x" that does not exist in the library
WHEN getProfile("phantom-x") is called
THEN a DroneProfileNotFoundError is thrown
  AND the error message includes the string "phantom-x"
```

**AC-05 — Full library enumeration**

```
GIVEN the AcousticProfileLibrary is initialized with default profiles
WHEN getAllProfiles() is called
THEN the result is an array
  AND result.length >= 4
  AND every item in result has a unique id field
  AND at least one item has label === 'motorcycle-50cc' (false positive class present)
```

---

## FR-W6-02: YAMNetFineTuner

**Summary:** Manages the transfer learning pipeline. Loads the YAMNet-512 base model, fine-tunes the top 10% of layers with a 10-class drone taxonomy head, and exports to ONNX opset 17.

---

**AC-06 — Loss decreases across epochs**

```
GIVEN a mock dataset of 1000 audio clips (10 classes, balanced)
  AND the YAMNetFineTuner is configured with batchSize=32
WHEN trainEpoch() is called twice (epoch 1, then epoch 2)
THEN the loss reported in epoch 2 is less than the loss reported in epoch 1
```

**AC-07 — ONNX export produces a file**

```
GIVEN a YAMNetFineTuner that has completed at least 1 training epoch
  AND an output path "/tmp/dronenet-test.onnx"
WHEN exportONNX({ outputPath: "/tmp/dronenet-test.onnx" }) is called
THEN a file is written to "/tmp/dronenet-test.onnx"
  AND the file is non-empty (size > 0 bytes)
  AND no error is thrown
```

**AC-08 — Validation accuracy meets threshold**

```
GIVEN a trained YAMNetFineTuner with a mock validation set of 100 clips
WHEN evaluate() is called
THEN result.accuracy >= 0.90
  AND result.false_positive_rate <= 0.05
  AND result has shape { accuracy: number, false_positive_rate: number, per_class_accuracy: Record<string, number> }
```

**AC-09 — Mel spectrogram shape**

```
GIVEN a 2-second audio window sampled at 22050Hz (44100 samples)
  AND MelSpectrogramConfig: { nMels: 128, nFFT: 2048, hopLength: 512, fMin: 80, fMax: 8000 }
WHEN computeMelSpectrogram() is called with this audio frame
THEN the output shape is [128, 87]
  AND output[i][j] is a finite number for all i, j
  AND output is normalized (per-frame mean ≈ 0, std ≈ 1)
```

**AC-10 — Training metrics shape**

```
GIVEN a YAMNetFineTuner that has completed 5 training epochs
WHEN getMetrics() is called
THEN the result is an array of length 5
  AND each item has shape { epoch: number, loss: number, val_accuracy: number, false_positive_rate: number }
  AND item[0].epoch === 1
  AND item[4].epoch === 5
```

---

## FR-W6-03: FalsePositiveGuard

**Summary:** Post-processes YAMNet detections to eliminate false positives. Applies confidence threshold, Doppler analysis, temporal pattern recognition, and RF cross-correlation to discriminate between real drones and civilian false positives (motorcycles, generators, trucks).

---

**AC-11 — Temporal-linear pattern flags motorcycle**

```
GIVEN a detection with:
  - acousticConfidence: 0.92 (above threshold)
  - rfPresent: false
  - temporalPattern: 'linear'
  - speedEstimate: 65 km/h (above 60 km/h vehicle threshold)
WHEN assess(detection) is called
THEN result.isFalsePositive === true
  AND result.reason === "temporal-linear"
```

**AC-12 — RF + circular pattern confirms drone**

```
GIVEN a detection with:
  - acousticConfidence: 0.88
  - rfPresent: true
  - rfFrequencyHz: 900_000_000
  - temporalPattern: 'circular'
  - speedEstimate: 35 km/h
WHEN assess(detection) is called
THEN result.isFalsePositive === false
  AND result.reason is null
```

**AC-13 — High-speed linear track is a vehicle**

```
GIVEN a 10-second temporal window containing 3 acoustic detections
  AND all 3 detections are at consistent speed > 60 km/h
  AND all 3 detections follow a linear trajectory (no bearing change > 15°)
WHEN assess() is called on the third detection
THEN result.isFalsePositive === true
  AND result.reason === "vehicle-speed-pattern"
```

**AC-14 — Low confidence auto-flag**

```
GIVEN a detection with:
  - acousticConfidence: 0.72 (below 0.85 threshold)
  - rfPresent: true
  - temporalPattern: 'circular'
WHEN assess(detection) is called
THEN result.isFalsePositive === true
  AND result.reason === "low-confidence"
  AND the RF and temporal pattern are NOT evaluated (confidence check is first gate)
```

**AC-15 — Doppler shift indicates vehicle approach speed**

```
GIVEN a detection with:
  - acousticConfidence: 0.90
  - dopplerShiftKHz: 2.5 (corresponding to ~80 km/h approach speed)
  - temporalPattern: 'linear'
WHEN assess(detection) is called
THEN result.isFalsePositive === true
  AND result.reason includes "doppler"
  AND result.estimatedSpeedKmh > 60
```

---

## FR-W6-04: DatasetPipeline

**Summary:** Manages acquisition and preparation of training data. Ingests audio from OSINT sources and field recordings, normalizes to 22050Hz, applies augmentation, and exports TFRecord/ONNX-compatible datasets.

---

**AC-16 — Ingest resamples and normalizes**

```
GIVEN an audio file at 44100Hz sample rate
  AND the file contains a 2-second tone at 200Hz
WHEN ingest({ filePath, label: 'shahed-136', source: 'field_recording' }) is called
THEN the resulting clip is stored at 22050Hz (resampled)
  AND peak amplitude is normalized to [-1.0, 1.0]
  AND the dataset_items table is updated with { filename, label, sample_rate: 22050, duration_ms: 2000 }
  AND the raw audio bytes are NOT stored in the database
```

**AC-17 — Split ratio is exact**

```
GIVEN a dataset with exactly 500 items
WHEN split({ trainRatio: 0.8, valRatio: 0.1, testRatio: 0.1 }) is called
THEN result.train.length === 400
  AND result.val.length === 50
  AND result.test.length === 50
  AND result.train.length + result.val.length + result.test.length === 500
```

**AC-18 — Augmentation modifies audio**

```
GIVEN an audio clip of 2 seconds at 22050Hz
WHEN augment(clip, { speed: 1.1, noise: 0.05 }) is called
THEN the returned clip has different length from input (speed perturbation applied)
  AND the returned clip is not identical to the input (noise applied)
  AND the returned clip is normalized to [-1.0, 1.0]
```

**AC-19 — TFRecord export**

```
GIVEN a dataset with 50 ingested clips
  AND an output path "/tmp/dataset.tfrecord"
WHEN exportTFRecord({ outputPath: "/tmp/dataset.tfrecord" }) is called
THEN a file is written at the output path
  AND the file is non-empty
  AND no error is thrown
```

**AC-20 — Stats on empty dataset**

```
GIVEN a DatasetPipeline with no ingested items (freshly initialized)
WHEN getStats() is called
THEN result.total === 0
  AND result.byLabel is an empty object {}
  AND result.bySource is an empty object {}
```

---

## FR-W6-05: MultiNodeFusion

**Summary:** Aggregates acoustic detections from multiple APEX-SENTINEL nodes. Uses inverse-distance weighting and majority voting to produce a consensus detection with higher confidence than any individual node.

---

**AC-21 — Consensus confidence calculation**

```
GIVEN 3 nodes report the same trackId with:
  - Node A: confidence=0.9, distance=500m
  - Node B: confidence=0.8, distance=1200m
  - Node C: confidence=0.7, distance=800m
WHEN fuse({ trackId, reports: [A, B, C] }) is called
THEN result.fusedConfidence > 0.85
  AND result.droneClass is the class reported by majority
  AND result.contributingNodes contains all three node IDs
```

**AC-22 — Inverse-distance weighting**

```
GIVEN 2 nodes report the same track:
  - Node A: confidence=0.8, distance=300m (closer)
  - Node B: confidence=0.8, distance=900m (farther)
WHEN fuse() is called
THEN Node A receives weight >= 3x weight of Node B (inverse distance ratio: 900/300 = 3)
  AND result.fusedConfidence is closer to Node A's confidence than Node B's
```

**AC-23 — Majority vote overrides false positive**

```
GIVEN 3 nodes report on the same track:
  - Node A: droneClass='shahed-136', isFalsePositive=false
  - Node B: droneClass='shahed-136', isFalsePositive=false
  - Node C: droneClass='motorcycle-50cc', isFalsePositive=true
WHEN fuse() is called
THEN result.isFalsePositive === false
  AND result.droneClass === 'shahed-136'
```

**AC-24 — Stale report removal**

```
GIVEN a node report was added with timestamp T
  AND maxAgeMs is set to 5000 (5 seconds)
  AND clearStale() is called at time T + 6000ms (6 seconds later)
THEN the report is no longer present in the fusion state
  AND getConsensus() returns null for that track
```

**AC-25 — No reports returns null**

```
GIVEN a MultiNodeFusion instance with no reports for track "track-xyz"
WHEN getConsensus("track-xyz") is called
THEN the result is null
```

---

## FR-W6-06: MonteCarloPropagator

**Summary:** Generates a probabilistic impact distribution by propagating EKF state uncertainty through N Monte Carlo samples. Replaces the deterministic impact estimate from W5 with a 95th-percentile confidence ellipse.

---

**AC-26 — Sample count**

```
GIVEN an EKF state with position uncertainty of +/-50m (covariance diagonal ~2500)
  AND the track is descending (vAlt < 0)
WHEN propagate(1000) is called
THEN the result contains exactly 1000 impact samples
  AND each sample has { lat: number, lon: number, alt: 0 }
```

**AC-27 — 95th percentile ellipse**

```
GIVEN 1000 Monte Carlo samples produced by propagate(1000)
WHEN get95thPercentileBounds() is called
THEN the returned ellipse contains at least 950 of the 1000 samples
  AND result has shape { centerLat, centerLon, semiMajorMeters, semiMinorMeters, rotationDeg }
```

**AC-28 — Ascending track has no impact**

```
GIVEN an EKF state where vAlt > 0 (drone is ascending)
WHEN propagate(1000) is called
THEN result.samples is an empty array (length === 0)
  AND result.confidence === 0
  AND result.reason === "ascending-track"
```

**AC-29 — High-confidence EKF produces tight ellipse**

```
GIVEN an EKF state with covariance trace < 1 (high confidence, sub-meter uncertainty)
WHEN propagate(1000) is called
  AND get95thPercentileBounds() is called on the result
THEN result.semiMajorMeters < 200
```

**AC-30 — Low-confidence EKF produces wide ellipse**

```
GIVEN an EKF state with covariance trace > 100 (low confidence, high uncertainty)
WHEN propagate(1000) is called
  AND get95thPercentileBounds() is called on the result
THEN result.semiMajorMeters > 1000
```

---

## FR-W6-07: EdgeDeployer

**Summary:** Quantizes ONNX models for edge hardware targets and validates deployment suitability. Produces INT8 models for Raspberry Pi 4 and FP16 models for Jetson Nano, with per-device configuration manifests.

---

**AC-31 — INT8 quantization reduces model size**

```
GIVEN an ONNX FP32 model with file size S bytes
WHEN quantize({ model, targetDevice: "rpi4" }) is called
THEN the returned INT8 model has file size < S x 0.5
  AND the INT8 model is a valid ONNX file (non-empty, readable by onnxruntime-node mock)
```

**AC-32 — Jetson Nano manifest has CUDA config**

```
GIVEN a target device "jetson-nano"
  AND a valid ONNX model path
WHEN createManifest({ targetDevice: "jetson-nano", modelPath }) is called
THEN result is a valid JSON object
  AND result.device === "jetson-nano"
  AND result.precision === "fp16"
  AND result.cudaConfig is defined (not undefined)
  AND result.latencyTargetMs === 50
```

**AC-33 — RPi4 inference latency validation**

```
GIVEN a quantized INT8 ONNX model deployed on a simulated RPi4 runtime
WHEN validateDeployment({ device: "rpi4", modelPath, testAudioPath }) is called
  AND mock inference returns in 150ms
THEN validation passes (no error thrown)
  AND result.latencyP95Ms < 200
```

**AC-34 — Corrupt model throws diagnostic error**

```
GIVEN a zero-byte (corrupt) ONNX file at modelPath
WHEN validateDeployment({ device: "rpi4", modelPath }) is called
THEN an EdgeDeploymentError is thrown
  AND error.device === "rpi4"
  AND error.modelPath === modelPath
  AND error.diagnosticInfo is a non-empty string
```

---

## FR-W6-08: SentinelPipeline

**Summary:** End-to-end orchestrator connecting all W6 modules. Accepts raw audio frames and passes them through the full detection chain: VAD -> FFT -> YAMNet -> FalsePositiveGuard -> TrackManager -> EKF -> NATS publish.

---

**AC-35 — Full pipeline processing chain**

```
GIVEN the SentinelPipeline has been started (start() called)
  AND all 6 modules are initialized (VAD, FFT, YAMNet, FPGuard, TrackManager, EKF)
  AND NATS is mocked
WHEN processAudioFrame(frame22050Samples) is called
THEN the frame passes through VAD check
  AND FFT features are extracted
  AND YAMNet classification is called
  AND FalsePositiveGuard.assess() is called
  AND TrackManager.update() is called
  AND EKF.predict() is called
  AND NatsClient.publish() is called once with subject 'acoustic.detections'
```

**AC-36 — Status after start**

```
GIVEN the SentinelPipeline has been started
WHEN getStatus() is called
THEN result.running === true
  AND result.activeModules === 6
  AND result.dropsPerSecond === 0
  AND result.processedFrames >= 0
```

**AC-37 — NATS disconnect does not crash pipeline**

```
GIVEN the SentinelPipeline is running
  AND NatsClient.publish() throws a connection error
WHEN processAudioFrame(frame) is called
THEN no error is thrown by processAudioFrame()
  AND result is buffered internally (result.buffered === true)
  AND a 'nats-disconnected' event is emitted by the pipeline
```

**AC-38 — Pipeline not running throws error**

```
GIVEN the SentinelPipeline has NOT been started (start() never called)
WHEN processAudioFrame(frame) is called
THEN a PipelineNotRunningError is thrown
  AND error.message includes "start()"
```

---

## FR-W6-09: CursorOfTruth

**Summary:** Formats EKF state and impact estimates into human-readable tactical situation reports. Uses Claude API (claude-sonnet-4-6) for Chain-of-Thought formatting. Falls back to deterministic template when Claude is unavailable.

---

**AC-39 — Tactical report format with Claude available**

```
GIVEN an EKF state at lat=47.1234N, lon=26.3456E, alt=450m, hdg=280, speed=55m/s
  AND an impact estimate at lat=47.0990N, lon=26.2100E
  AND Claude API is available (mock returns a valid 3-line response)
WHEN format({ ekfState, impactEstimate }) is called
THEN the result is a string with exactly 3 lines (split by newline)
  AND line 1 starts with "THREAT:"
  AND line 2 starts with "POSIT:"
  AND line 3 starts with "ACTION:"
  AND the coordinates in the output are coarsened to +/-50m (not raw EKF precision)
```

**AC-40 — No impact projected message**

```
GIVEN an EKF state with vAlt > 0 (ascending track)
  AND impactEstimate is null
WHEN format({ ekfState, impactEstimate: null }) is called
THEN the report contains the string "NO IMPACT PROJECTED"
  AND the report still includes the THREAT line with drone class and confidence
```

**AC-41 — Template fallback when Claude unavailable**

```
GIVEN Claude API throws a NetworkError or returns after 8000ms timeout
WHEN format({ ekfState, impactEstimate }) is called
THEN no error is thrown
  AND the result is a non-empty string
  AND the result contains all three sections (THREAT, POSIT, ACTION)
  AND the result does NOT contain any error message about Claude
```

---

## FR-W6-10: BRAVE1Format

**Summary:** Encodes APEX-SENTINEL detections into BRAVE1 JSON format (NATO CoT-compatible). Supports encode, decode, and validation operations. Used as the wire format for alerting systems.

---

**AC-42 — Encode produces required fields**

```
GIVEN a CoT message with:
  - nodeId: "sentinel-node-abc123"
  - trackId: "track-001"
  - droneClass: "shahed-136"
  - lat: 47.1234, lon: 26.3456
  - altHae: 450
  - circularError: 75
  - timestamp: "2026-03-25T14:30:00Z"
  - remarks: "THREAT: SHAHED-136 CONFIDENCE 92%"
WHEN encode(cotMessage) is called
THEN the result is a valid JSON object
  AND result.type is a non-empty string
  AND result.uid === "sentinel-sentinel-node-abc123-track-001"
  AND result.time === "2026-03-25T14:30:00Z"
  AND result.lat === 47.1234
  AND result.lon === 26.3456
  AND result.ce === 75
  AND result.hae === 450
  AND result.remarks === "THREAT: SHAHED-136 CONFIDENCE 92%"
```

**AC-43 — Decode round-trip**

```
GIVEN a BRAVE1 JSON message produced by encode()
WHEN decode(brave1Message) is called
THEN the result is a CoT-equivalent structure
  AND result.lat is within 0.0001 degrees of the original lat
  AND result.lon is within 0.0001 degrees of the original lon
  AND result.remarks === the original remarks string
  AND no error is thrown
```

**AC-44 — Validation catches bad payload**

```
GIVEN a BRAVE1 payload with:
  - missing "uid" field
  - lat value of 200 (outside valid range [-90, 90])
WHEN validate(invalidPayload) is called
THEN result.valid === false
  AND result.errors is an array with at least 2 items
  AND one error contains "uid"
  AND one error contains "lat"
  AND each error item has shape { field: string, message: string }
```

---

## Acceptance Criteria Summary Table

| AC | FR | Scenario | Pass Criteria |
|---|---|---|---|
| AC-01 | W6-01 | Shahed-136 frequency match | confidence > 0.8, label === 'shahed-136' |
| AC-02 | W6-01 | Lancet-3 frequency match | label === 'lancet-3' |
| AC-03 | W6-01 | Full profile retrieval | rpmRange [7000,9000], all fields present |
| AC-04 | W6-01 | Unknown drone type | DroneProfileNotFoundError thrown |
| AC-05 | W6-01 | Full library enumeration | >=4 profiles, motorcycle class present |
| AC-06 | W6-02 | Loss decreases across epochs | epoch2.loss < epoch1.loss |
| AC-07 | W6-02 | ONNX export produces file | file written, non-empty |
| AC-08 | W6-02 | Validation accuracy | accuracy >= 0.90, FPR <= 0.05 |
| AC-09 | W6-02 | Mel spectrogram shape | [128, 87], normalized |
| AC-10 | W6-02 | Training metrics shape | array[5] with epoch/loss/val_accuracy/FPR |
| AC-11 | W6-03 | Motorcycle temporal-linear flag | isFalsePositive=true, reason="temporal-linear" |
| AC-12 | W6-03 | RF + circular confirms drone | isFalsePositive=false |
| AC-13 | W6-03 | High-speed linear is vehicle | isFalsePositive=true, reason="vehicle-speed-pattern" |
| AC-14 | W6-03 | Low confidence auto-flag | isFalsePositive=true, reason="low-confidence" |
| AC-15 | W6-03 | Doppler shift vehicle indicator | isFalsePositive=true, speed > 60 km/h |
| AC-16 | W6-04 | Ingest resamples and normalizes | 22050Hz, peak normalized, no raw bytes in DB |
| AC-17 | W6-04 | Split ratio exact | train=400, val=50, test=50 |
| AC-18 | W6-04 | Augmentation modifies audio | length changed, values differ, normalized |
| AC-19 | W6-04 | TFRecord export | file written, non-empty |
| AC-20 | W6-04 | Stats on empty dataset | total=0, empty byLabel, empty bySource |
| AC-21 | W6-05 | Consensus confidence calculation | fusedConfidence > 0.85 |
| AC-22 | W6-05 | Inverse-distance weighting | closer node >=3x weight of farther node |
| AC-23 | W6-05 | Majority vote overrides FP | droneClass='shahed-136', isFalsePositive=false |
| AC-24 | W6-05 | Stale report removal | report removed after maxAgeMs |
| AC-25 | W6-05 | No reports returns null | getConsensus returns null |
| AC-26 | W6-06 | Sample count | exactly 1000 samples |
| AC-27 | W6-06 | 95th percentile ellipse | >=950 of 1000 samples inside ellipse |
| AC-28 | W6-06 | Ascending track no impact | samples=[], confidence=0 |
| AC-29 | W6-06 | High-confidence tight ellipse | semiMajorMeters < 200 |
| AC-30 | W6-06 | Low-confidence wide ellipse | semiMajorMeters > 1000 |
| AC-31 | W6-07 | INT8 reduces size >50% | size < originalSize x 0.5 |
| AC-32 | W6-07 | Jetson Nano manifest has CUDA | precision=fp16, cudaConfig defined |
| AC-33 | W6-07 | RPi4 latency validation | P95 < 200ms |
| AC-34 | W6-07 | Corrupt model throws diagnostic | EdgeDeploymentError with diagnosticInfo |
| AC-35 | W6-08 | Full pipeline chain | all 6 modules called, NATS publish called |
| AC-36 | W6-08 | Status after start | running=true, activeModules=6, drops=0 |
| AC-37 | W6-08 | NATS disconnect resilience | no throw, result buffered, event emitted |
| AC-38 | W6-08 | Not running throws error | PipelineNotRunningError thrown |
| AC-39 | W6-09 | Tactical report format | 3 lines, THREAT/POSIT/ACTION, coarsened coords |
| AC-40 | W6-09 | No impact projected | "NO IMPACT PROJECTED" in report |
| AC-41 | W6-09 | Template fallback | no error, 3 sections present, no Claude error message |
| AC-42 | W6-10 | Encode required fields | all 8 required fields present and correct |
| AC-43 | W6-10 | Decode round-trip | lat/lon within 0.0001 degrees, remarks preserved |
| AC-44 | W6-10 | Validation catches bad payload | valid=false, errors for uid and lat |

---

## TypeScript Types Reference

Key types that acceptance criteria are validated against:

```typescript
// AcousticProfileLibrary
interface DroneProfile {
  id: string;
  label: string;
  freqMin: number;       // Hz
  freqMax: number;       // Hz
  rpmRange: [number, number];
  source: 'indigo-airguard' | 'field' | 'osint';
  confidence: number;
}

// FalsePositiveGuard
interface FalsePositiveAssessment {
  isFalsePositive: boolean;
  reason: string | null;
  estimatedSpeedKmh?: number;
}

// MultiNodeFusion
interface FusedDetection {
  trackId: string;
  droneClass: string;
  fusedConfidence: number;
  isFalsePositive: boolean;
  contributingNodes: string[];
  timestamp: Date;
}

// MonteCarloPropagator
interface MonteCarloResult {
  samples: Array<{ lat: number; lon: number; alt: number }>;
  confidence: number;
  reason?: string;
}
interface ImpactEllipse {
  centerLat: number;
  centerLon: number;
  semiMajorMeters: number;
  semiMinorMeters: number;
  rotationDeg: number;
}

// BRAVE1Format
interface BRAVE1Message {
  type: string;
  uid: string;
  time: string;        // ISO 8601 UTC
  lat: number;
  lon: number;
  ce: number;          // circular error (m)
  hae: number;         // height above ellipsoid (m)
  remarks: string;
}
interface ValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
}
```

---

*Generated: 2026-03-25 | APEX-SENTINEL W6 | ACCEPTANCE_CRITERIA.md*
