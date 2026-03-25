# APEX-SENTINEL — ACCEPTANCE_CRITERIA.md
## Wave 6: Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
### Wave 6 | Project: APEX-SENTINEL | Version: 6.0.0
### Date: 2026-03-25 | Status: APPROVED

---

## 1. ACCEPTANCE FRAMEWORK

Each acceptance criterion is written in Given/When/Then format. All criteria must pass before W6 is marked `wave:complete`. Verification method noted per criterion: automated test (AT), manual test (MT), benchmark (BM), or review (RV).

---

## 2. FR-W6-01: YAMNet Fine-Tuning Pipeline

**AC-01-01** | Verification: AT
```
Given: An AcousticClassifier instance with yamnet-shahed-v1.tflite loaded
When: classify(Float32Array(44100), 0) is called
Then: Returns ClassificationResult with label, confidence, probabilities (4 keys), processingTimeMs, modelVersion, windowStartMs, windowEndMs
And: probabilities values sum to 1.0 ±0.001
And: confidence === max(probabilities values) ±0.0001
```

**AC-01-02** | Verification: BM
```
Given: Held-out test set (15% of dataset, 300+ labeled clips)
When: YAMNet fine-tuned model runs inference on all test clips
Then: Shahed class precision ≥ 90%
And:  Shahed class recall ≥ 80%
And:  AUC-ROC (shahed vs rest) ≥ 0.95
And:  Motorcycle clips classified as shahed < 10% of the time (confusion matrix check)
```

**AC-01-03** | Verification: BM
```
Given: yamnet-shahed-v1.tflite model file
When: File size checked
Then: File size ≤ 50 MB
```

**AC-01-04** | Verification: AT
```
Given: AcousticClassifier with model loaded
When: classify() called 20 times consecutively
Then: Node.js heap growth ≤ 20 MB (no tensor leak)
And:  Each call completes in < 500ms
```

**AC-01-05** | Verification: AT
```
Given: AcousticClassifier not yet loaded
When: classify() called before load()
Then: Throws ModelNotLoadedError
```

---

## 3. FR-W6-02: Lancet Classifier

**AC-02-01** | Verification: BM
```
Given: Held-out Lancet test set (50+ labeled clips)
When: Fine-tuned model runs inference on all Lancet test clips
Then: Lancet precision ≥ 70%
And:  Lancet recall ≥ 60%
```

**AC-02-02** | Verification: AT
```
Given: Synthetic 1400 Hz sine wave (2s at 22050 Hz)
When: classify() called on this buffer
Then: result.label === 'lancet'
And:  result.probabilities.lancet > result.probabilities.shahed
```

**AC-02-03** | Verification: AT
```
Given: Synthetic Shahed harmonic buffer [120, 240, 360 Hz]
When: classify() called
Then: result.label === 'shahed'
And:  result.probabilities.shahed > result.probabilities.lancet
```

**AC-02-04** | Verification: RV
```
Given: Model training configuration
When: Mel spectrogram parameters reviewed for Lancet path
Then: fmin=500Hz, fmax=8000Hz, n_mels=64 are applied for Lancet-band analysis
And:  These differ from Shahed path: fmin=80Hz, fmax=8000Hz, n_mels=128
```

---

## 4. FR-W6-03: False Positive Classifier

**AC-03-01** | Verification: AT
```
Given: FalsePositiveGuard with default threshold 0.3
When: ClassificationResult with P(fp)=0.45, P(shahed)=0.50 is evaluated
Then: result.suppressed === true
And:  result.reason contains 'P(fp)=0.45'
```

**AC-03-02** | Verification: AT
```
Given: FalsePositiveGuard with default threshold 0.3
When: ClassificationResult with P(fp)=0.20, P(shahed)=0.75 is evaluated
Then: result.suppressed === false
```

**AC-03-03** | Verification: AT
```
Given: FalsePositiveGuard evaluating detection with dopplerRate=25.0 Hz/s
When: evaluate() called (regardless of probability values)
Then: result.suppressed === true
And:  result.reason contains 'doppler'
```

**AC-03-04** | Verification: BM + AT
```
Given: 200 motorcycle 50cc audio test clips
When: Full pipeline (classifier + FPGuard) processes each clip
Then: ≤ 10 clips (≤ 5%) result in unsuppressed shahed/lancet detection
```

**AC-03-05** | Verification: AT
```
Given: FalsePositiveGuard
When: setFpThreshold(-0.1) or setFpThreshold(1.1) called
Then: Throws RangeError
```

**AC-03-06** | Verification: AT
```
Given: Suppression event occurs
When: Suppression decision is logged
Then: fp_suppression_log entry created with: node_id, detected_at, prob_fp, threshold_used, reason
```

---

## 5. FR-W6-04: Dataset Ingestion Pipeline

**AC-04-01** | Verification: AT + MT
```
Given: yt-dlp installed, search query "Shahed drone sound"
When: dataset-pipeline.ts run with --source youtube --query "Shahed drone sound" --limit 5
Then: ≥ 5 audio files downloaded as WAV at 22050 Hz mono
And:  acoustic_training_data records inserted in Supabase
And:  auto_label set from keyword matching
```

**AC-04-02** | Verification: AT
```
Given: 90-second WAV file at 22050 Hz
When: audio-segmenter.ts processes it with window=2s, hop=0.5s
Then: Produces floor((90 - 2) / 0.5) + 1 = 177 segments
And:  Each segment is exactly 44100 samples
And:  Each segment has startMs and endMs metadata
```

**AC-04-03** | Verification: AT
```
Given: WAV filename containing "shahed"
When: auto-labeler processes source URL "youtube.com/watch?v=abc [шахед звук]"
Then: auto_label = 'shahed'
And:  review_queue entry created with priority = 5 (medium)
```

**AC-04-04** | Verification: AT
```
Given: Silent audio segment (RMS < threshold)
When: segmenter processes it
Then: Segment is skipped (not saved to training data)
```

---

## 6. FR-W6-05: Multi-Node Fusion

**AC-05-01** | Verification: AT
```
Given: Two nodes (A at 48.9200N 37.7800E, B at 48.9300N 37.7900E)
When: Both detect same Shahed with TDOA Δt = 0.85s
Then: Fused position returned within 300m of true position (using Chan-Taylor)
And:  FusedDetectionEvent.multiNode === true
And:  FusedDetectionEvent.sourceNodeIds.length === 2
```

**AC-05-02** | Verification: AT
```
Given: GDOP = 6.2 (poor geometry)
When: MultiNodeFusion.fuse() called
Then: TDoA contribution weight = 0 (gated out)
And:  fusedPosition uses acoustic confidence weighting only
```

**AC-05-03** | Verification: AT
```
Given: Only one node detects target
When: MultiNodeFusion.fuse() called with single detection
Then: FusedDetectionEvent.multiNode === false
And:  fusedPosition = single node position
And:  No error thrown
```

**AC-05-04** | Verification: AT
```
Given: Two detections with timestamps 10s apart (outside ±5s window)
When: MultiNodeFusion correlation attempted
Then: Detections NOT correlated (treated as separate events)
```

**AC-05-05** | Verification: AT
```
Given: Node B detection has acoustic confidence 0.40 (below 0.50 gate)
When: MultiNodeFusion.fuse() called
Then: Node B contribution excluded from fusion
And:  Result is single-node (Node A only)
```

---

## 7. FR-W6-06: Monte Carlo Risk Heatmap

**AC-06-01** | Verification: AT
```
Given: EKF state with position (48.92N, 37.78E, 125m alt) and velocity towards SE
When: MonteCarlo.simulate() called with N=1000
Then: Returns exactly 1000 impact points
And:  All impact points have lat in [20, 70] and lon in [20, 60] (Eastern Europe bounds check)
```

**AC-06-02** | Verification: BM
```
Given: Typical EKF covariance (lat_var=1.2e-8, lon_var=1.1e-8)
When: MonteCarlo.simulate() + RiskHeatmap.compute() called
Then: Entire computation completes in < 100ms on benchmark machine (Node.js, x86_64)
```

**AC-06-03** | Verification: AT
```
Given: 1000 impact points concentrated near (48.91N, 37.795E)
When: RiskHeatmap.compute() called
Then: Probabilities sum to 1.0 ±0.02 (rounding/pruning tolerance)
And:  No cell has probability < 0.001
And:  Peak cell within 200m of concentration center
```

**AC-06-04** | Verification: AT
```
Given: Heatmap computed for track "track-abc"
When: NATS publish called
Then: Event on subject "sentinel.risk.track-abc" with schema "sentinel.risk.v1"
And:  Event contains trackId, cells, peakImpactLat, peakImpactLon, computeTimeMs
```

---

## 8. FR-W6-07: Edge Deployment

**AC-07-01** | Verification: BM (simulated RPi constraints via --max-old-space-size=500)
```
Given: edge-runner.ts started with Node.js --max-old-space-size=500
When: 60 seconds of inference run (120 windows at 0.5s hop)
Then: Process does not crash (OOMKilled)
And:  RSS memory stays below 500 MB
```

**AC-07-02** | Verification: AT
```
Given: NATS connection fails on startup
When: edge-runner.ts attempts to connect
Then: Local SQLite buffer initialized
And:  Detections written to detection_buffer table
And:  No crash or unhandled rejection
```

**AC-07-03** | Verification: AT
```
Given: 25 detections buffered in SQLite while NATS offline
When: NATS reconnects
Then: All 25 detections published to NATS within 10s
And:  SQLite records marked synced=true
```

**AC-07-04** | Verification: AT
```
Given: edge-runner.ts running
When: SIGTERM sent
Then: Audio capture stops
And:  NATS connection closed cleanly
And:  Process exits with code 0 within 5s
```

**AC-07-05** | Verification: AT
```
Given: edge-runner running for 30s
When: NODE_HEALTH interval fires
Then: NATS message published to sentinel.node.health.{nodeId}
And:  Contains: nodeId, uptimeS, detectionCount, natsConnected, memoryMB, modelVersion
```

---

## 9. FR-W6-08: Full Integration Layer

**AC-08-01** | Verification: AT
```
Given: SentinelPipeline with all modules mocked
When: start() called
Then: All modules started in correct order: NATS → Supabase → TrackManager → EKF → Classifier → AudioCapture
And:  isRunning() === true within 10s
```

**AC-08-02** | Verification: AT
```
Given: AcousticClassifier module throws on classify()
When: SentinelPipeline processes detection
Then: Error is caught and logged
And:  pipeline.isRunning() still === true (no crash)
And:  pipeline.getMetrics().classifierErrors incremented
```

**AC-08-03** | Verification: AT
```
Given: SentinelPipeline running, then stop() called
When: stop() completes
Then: All modules stopped in reverse order
And:  No pending timers remain (process can exit cleanly)
```

---

## 10. FR-W6-09: ATAK CoT Output

**AC-09-01** | Verification: AT
```
Given: Track with drone_type='shahed', confirmed=true (≥3 detections)
When: CotGenerator.generate() called
Then: cotType === 'a-h-A-C-F'
And:  CoT XML includes <remarks> with confidence, classifier version, node count
And:  stale attribute = detectedAt + 60s
```

**AC-09-02** | Verification: AT
```
Given: Track with drone_type='lancet', confirmed=true
When: CotGenerator.generate() called
Then: cotType === 'a-h-A-M-F-Q'
```

**AC-09-03** | Verification: AT
```
Given: Track with 1 detection (unconfirmed)
When: CotGenerator.generate() called
Then: cotType === 'a-u-A'
```

**AC-09-04** | Verification: AT
```
Given: 3 shahed detections injected within 30s window
When: SentinelPipeline processes them
Then: Track confirmed_at set
And:  CotGenerator fired within 1s of confirmation
And:  NATS event on sentinel.cot.{trackId} published
```

---

## 11. FR-W6-10: BRAVE1 Data Format

**AC-10-01** | Verification: AT
```
Given: CSV file with columns: lat,lon,alt,timestamp,drone_type,confidence,audio_file_ref
When: brave1-importer.ts processes it
Then: All valid rows inserted to brave1_detections table
And:  Import summary returned: recordsProcessed, recordsInserted, duplicatesSkipped, errors
```

**AC-10-02** | Verification: AT
```
Given: CSV with duplicate row (same lat/lon/timestamp within tolerance)
When: brave1-importer.ts processes it
Then: Duplicate row skipped
And:  duplicatesSkipped count incremented
And:  No database error thrown
```

**AC-10-03** | Verification: AT
```
Given: Row with invalid timestamp format "2026/03/24"
When: brave1-importer.ts processes it
Then: Row logged to errorDetails
And:  errors count incremented
And:  Other valid rows still processed
```

---

## 12. NON-FUNCTIONAL ACCEPTANCE

**NFR-01 — Edge Performance** | Verification: BM
```
Given: RPi 4 4GB running Node.js 20 with --max-old-space-size=500
When: Continuous inference for 60s (120 windows)
Then: Mean inference time per window < 200ms
And:  P99 inference time < 350ms
And:  No frames dropped (buffer overflow)
```

**NFR-02 — Pipeline Latency** | Verification: MT (hackathon demo)
```
Given: RPi4 edge node, Fortress pipeline, ATAK tablet
When: Audio with Shahed harmonic content played near RPi4 microphone
Then: ATAK CoT marker appears within 5s of audio start
```

**NFR-03 — Test Coverage** | Verification: AT (CI gate)
```
Given: npx vitest run --coverage executed after W6 implementation
When: Coverage report generated
Then: branches ≥ 80%, functions ≥ 80%, lines ≥ 80%, statements ≥ 80%
And:  Total tests ≥ 614 (484 existing + 130 new)
And:  All tests GREEN (0 failures)
```

**NFR-04 — mind-the-gap** | Verification: AT
```
When: mind-the-gap skill run on W6 documents
Then: 14/14 PASS
```

**NFR-05 — TypeScript** | Verification: AT
```
When: npx tsc --noEmit run on full codebase with W6 additions
Then: 0 type errors
```
