# APEX-SENTINEL W10 — Integration Map

> Wave: W10 | Theme: NATO AWNING Framework Publisher + Stage 3.5 Trajectory Prediction
> Status: PLAN | Date: 2026-03-26

---

## Integration Points

### W10 ← W9 (Consumes)

| W9 Output | W10 Consumer | Field Used |
|-----------|-------------|-----------|
| detection.enriched NATS | AwningIntegrationPipeline | contextScore, positions |
| EnrichedDetection.contextScore | AwningLevelPublisher | score → WHITE/YELLOW/RED |
| EnrichedDetection.context.activeAlertLevel | AwningLevelPublisher | CRITICAL → RED override |
| DetectionEvent.acousticConfidence | StageClassifier | Stage 1/2/3 |
| DetectionEvent.rfFingerprintMatch | StageClassifier | Stage 2 condition |
| DetectionEvent.adsbCorrelated | StageClassifier | Stage 3 condition |
| DetectionEvent.remoteIdNearby | StageClassifier | Stage 3 condition |
| DetectionEvent.positions[] | Stage35TrajectoryPredictor | EKF input |

### W10 → Dashboard (Produces)

| W10 Output | Subject | Consumer |
|-----------|---------|---------|
| awning.level | NATS | Dashboard live feed (W11) |
| awning.alert | NATS | Dashboard alerts panel, Telegram bot |

### W10 Internal Flow

```
detection.enriched
    │
    ▼
AwningIntegrationPipeline.processDetection()
    │
    ├──► StageClassifier.classify()
    │         └──► Stage35TrajectoryPredictor.predict() (if positions available)
    │
    ├──► AwningLevelPublisher.deriveLevel()
    │         └──► AlertThrottleGate.shouldAllow()
    │
    ├──► NatoAlertFormatter.format()
    │
    ├──► StageTransitionAudit.record()
    │
    └──► nats.publish('awning.alert', alert)
```

---

## External Dependencies (W10 adds none)

W10 uses only:
- `node:crypto` (randomUUID for audit entries)
- `events` (EventEmitter for pipeline)
- TypeScript built-ins

---

## NATS Subject Namespace

```
feed.*          — W9 input feeds (read only by W10)
detection.*     — W9 detection pipeline
awning.level    — W10 new
awning.alert    — W10 new
```
