# W12 INTEGRATION MAP

## Inbound Dependencies (W12 consumes these)
| Module | Source | Used By |
|--------|--------|---------|
| StageClassifier | src/nato/stage-classifier.ts | RfPipelineIntegration |
| ThreatContextEnricher | src/intel/ | RfPipelineIntegration |
| BearingTriangulator (acoustic) | src/acoustic/ | RfFusionEngine (type only) |
| Node crypto | Node.js built-in | RfPrivacyFilter |

## Outbound Dependencies (W12 provides these)
| Module | Consumers |
|--------|-----------|
| FhssPatternAnalyzer | MultiProtocolRfClassifier, RfPipelineIntegration |
| MultiProtocolRfClassifier | RfSessionTracker, RfPipelineIntegration |
| RfBearingEstimator | RfFusionEngine, RfPipelineIntegration |
| SpectrumAnomalyDetector | RfPipelineIntegration |
| RfFusionEngine | RfPipelineIntegration |
| RfSessionTracker | RfPipelineIntegration |
| RfPrivacyFilter | RfPipelineIntegration (filters before NATS publish) |
| RfPipelineIntegration | AWNING stage machine, NATS bus |

## NATS Topics
| Topic | Direction | Publisher | Subscriber |
|-------|-----------|-----------|------------|
| sentinel.rf.detections | Outbound | RfPipelineIntegration (via RfPrivacyFilter) | Dashboard, AWNING |
| sentinel.rf.anomalies | Outbound | RfPipelineIntegration | Alert engine |
| sentinel.awning.stage | Outbound | RfPipelineIntegration | Tactical display |

## Event Bus (Internal)
RfPipelineIntegration uses Node EventEmitter internally:
- `rf:detection` → triggers classification + session tracking
- `rf:anomaly` → triggers anomaly alert
- `rf:session:closed` → checks pre-terminal flag
