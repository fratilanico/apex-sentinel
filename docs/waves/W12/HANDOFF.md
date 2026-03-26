# W12 HANDOFF

## What Was Built
8 new TypeScript modules in src/rf2/ implementing RF spectrum deepening:
1. FhssPatternAnalyzer — FHSS protocol detection
2. MultiProtocolRfClassifier — ranked protocol classification
3. RfBearingEstimator — RSSI-based least-squares position estimation
4. SpectrumAnomalyDetector — jamming/spoofing/replay detection
5. RfFusionEngine — RF + acoustic fusion
6. RfSessionTracker — session lifecycle management
7. RfPrivacyFilter — GDPR-compliant MAC hashing
8. RfPipelineIntegration — AWNING/ThreatContextEnricher wiring

## What Was NOT Changed
- src/rf/ (W7/W8) — untouched
- src/nato/ (W10) — untouched
- src/intel/ (W11) — untouched
- supabase/migrations/ — no new migrations

## Known Limitations / W13 Items
- 22050 Hz acoustic pipeline still needs migration to 16 kHz (DATA BREACH risk)
- Gerbera, Shahed-131, Shahed-238 acoustic profiles still missing
- RfBearingEstimator accuracy degrades with <4 nodes (works but ~500 m accuracy)
- RF session state is in-process only — not persisted across process restarts

## Integration Notes for Next Developer
- RfPipelineIntegration expects stage-classifier.ts to export `StageClassifier` class
- NATS subject for RF output: `sentinel.rf.detections`
- To add new RF protocols: add entry to PROTOCOL_TEMPLATES in fhss-pattern-analyzer.ts
  and PROTOCOL_PROFILES in multi-protocol-rf-classifier.ts
