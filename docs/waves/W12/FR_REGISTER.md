# W12 FR REGISTER

| FR | Title | Module | Tests | Priority | Status |
|----|-------|--------|-------|----------|--------|
| FR-W12-01 | FhssPatternAnalyzer | src/rf2/fhss-pattern-analyzer.ts | 12 | P0 | Pending |
| FR-W12-02 | MultiProtocolRfClassifier | src/rf2/multi-protocol-rf-classifier.ts | 14 | P0 | Pending |
| FR-W12-03 | RfBearingEstimator | src/rf2/rf-bearing-estimator.ts | 12 | P0 | Pending |
| FR-W12-04 | SpectrumAnomalyDetector | src/rf2/spectrum-anomaly-detector.ts | 12 | P0 | Pending |
| FR-W12-05 | RfFusionEngine | src/rf2/rf-fusion-engine.ts | 12 | P0 | Pending |
| FR-W12-06 | RfSessionTracker | src/rf2/rf-session-tracker.ts | 13 | P0 | Pending |
| FR-W12-07 | RfPrivacyFilter | src/rf2/rf-privacy-filter.ts | 11 | P0 | Pending |
| FR-W12-08 | RfPipelineIntegration | src/rf2/rf-pipeline-integration.ts | 13 | P0 | Pending |

## FR Detail

### FR-W12-01: FhssPatternAnalyzer
Detects FHSS frequency hopping patterns. Identifies ELRS 900, DJI OcuSync 2.4G,
TBS Crossfire from frequency + timing samples. Min 3 samples required.

### FR-W12-02: MultiProtocolRfClassifier
Classifies RF detections into known drone control protocols. Confidence scoring.
Returns `unknown` below 0.60 threshold.

### FR-W12-03: RfBearingEstimator
Estimates transmitter position from multi-node RSSI observations using free-space
path loss model. Requires ≥3 nodes.

### FR-W12-04: SpectrumAnomalyDetector
Detects jamming (broadband noise elevation), GPS spoofing (1575.42 MHz anomaly),
and replay attacks (duplicate packet hash within 100 ms).

### FR-W12-05: RfFusionEngine
Fuses RF bearing estimate with acoustic bearing estimate. Spatial/temporal agreement
scoring. Conflict flag when divergence > 1 km.

### FR-W12-06: RfSessionTracker
Tracks RF link sessions by protocol + bearing. 60 s inactivity timeout. Pre-terminal
silence flag when session ends within 500 m of known target.

### FR-W12-07: RfPrivacyFilter
GDPR-compliant RF event filter. MAC hashing, raw packet content stripping, bearing
coarsening.

### FR-W12-08: RfPipelineIntegration
Integrates RF layer with AWNING stage classifier and ThreatContextEnricher.
ELRS 900 confirmed → Stage 1→2 upgrade. RF silence → Stage 3 trigger.
