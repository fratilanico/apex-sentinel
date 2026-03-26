# W12 ARCHITECTURE — RF Spectrum Deepening

## Module Map

```
src/rf2/
  fhss-pattern-analyzer.ts        FR-W12-01
  multi-protocol-rf-classifier.ts FR-W12-02
  rf-bearing-estimator.ts         FR-W12-03
  spectrum-anomaly-detector.ts    FR-W12-04
  rf-fusion-engine.ts             FR-W12-05
  rf-session-tracker.ts           FR-W12-06
  rf-privacy-filter.ts            FR-W12-07
  rf-pipeline-integration.ts      FR-W12-08
```

## Data Flow

```
Raw RF Samples
    │
    ▼
FhssPatternAnalyzer ──► MultiProtocolRfClassifier ──► RfSessionTracker
    │                           │                           │
    │                    SpectrumAnomalyDetector             │
    │                           │                           │
    ▼                           ▼                           ▼
RfBearingEstimator ──► RfFusionEngine ◄── AcousticBearing (BearingTriangulator)
    │                           │
    ▼                           ▼
RfPrivacyFilter          RfPipelineIntegration
    │                           │
    ▼                           ▼
NATS publish             AWNING Stage Classifier
                         ThreatContextEnricher
```

## Integration Points
- `src/nato/stage-classifier.ts` — ELRS 900 confirmed → Stage 1→2 upgrade
- `src/intel/threat-timeline-builder.ts` — RF sessions appended as timeline events
- `src/fusion/` — acoustic bearing input to RfFusionEngine
- NATS subject `sentinel.rf.detections` — filtered output from RfPrivacyFilter

## Error Hierarchy
```
SentinelRfError (base)
  InsufficientNodesError  — <3 nodes in RfBearingEstimator
  AnomalyParseError       — malformed spectrum input
  SessionStateError       — invalid session transition
```
