# APEX-SENTINEL W17 — AI PIPELINE

## AI Components in Demo Layer

W17 does not introduce new AI models. It surfaces existing AI pipeline results through demo scenarios and benchmark data.

### AI Components Demonstrated in W17 Scenarios

#### 1. YAMNet Acoustic Classifier (W3, W6)
- Input: 16kHz audio frame (1s window)
- Output: threat class + confidence score
- Demo evidence: detection events in CHALLENGE_01_PERIMETER (confidence: 0.88)
- Benchmark: `detection_latency` benchmark covers feature extraction

#### 2. WildHornets Discriminator (W6)
- Input: acoustic feature vector
- Output: CIVILIAN | MILITARY classification
- Demo evidence: CHALLENGE_02_URBAN false_positive_suppression event (confidence: 0.91)

#### 3. MonteCarlo Trajectory Propagator (W8)
- Input: track state (lat, lon, speed, course, alt)
- Output: 1000-particle ETA distribution
- Demo evidence: CHALLENGE_02_TRAJECTORY trajectory_prediction (stage: 3.5, eta_s: 30)

#### 4. RF Protocol Fingerprinter (W11)
- Input: RF spectrum snapshot
- Output: protocol classification (ELRS/WiFi/BT/LoRa)
- Demo evidence: FULL_PIPELINE intel_brief references ELRS 900MHz uplink

### AI Quality Metrics (from W17 Scorecard)
- FPR: <5% (FalsePositiveGuard + WildHornets)
- Acoustic detection confidence threshold: ≥0.75 before AWNING escalation
- Trajectory confidence: 0.89 at Stage 3.5
- RF classification accuracy: >95% on test set

### Benchmark Relevance
PerformanceBenchmarkSuite `detection_latency` benchmark simulates the acoustic feature extraction workload (FFT over 16000-sample frame) and verifies p99 <100ms SLA.
