# W13 AI PIPELINE

## No New AI Models
W13 is a notification/delivery layer. AI computation happens in upstream waves (W10-W12).

## AI Inputs Consumed
- `AwningAlert.awningLevel` — computed by AwningIntegrationPipeline (W10)
- `AwningAlert.droneType` — classified by AcousticProfileLibrary + RFFingerprinter
- `AwningAlert.trajectory` — predicted by Stage35TrajectoryPredictor (EKF, W10)
- `IntelBrief` — assembled by IntelligencePipelineOrchestrator (W11)

## Formatting Intelligence
- TelegramAlertComposer applies rule-based formatting (not ML)
- ETA columns in trajectory block: tSeconds values from TrajectoryPrediction[]
- Intel brief max 5 lines: take first 5 non-empty lines from IntelBrief.summary

## Future AI Candidates (W14+)
- Severity escalation predictor: learn from operator response times to RED alerts
- Operator fatigue detector: adapt rate limits based on historical alert density
