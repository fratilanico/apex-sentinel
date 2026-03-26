# APEX-SENTINEL W10 — Functional Requirements Register

> Wave: W10 | Theme: NATO AWNING Framework Publisher + Stage 3.5 Trajectory Prediction
> Status: PLAN | Date: 2026-03-26

---

## FR Registry

| FR ID | Name | Source File | Test File | Test Count | Priority | Status |
|-------|------|-------------|-----------|-----------|----------|--------|
| FR-W10-01 | AwningLevelPublisher | src/nato/awning-level-publisher.ts | tests/nato/FR-W10-01-awning-level-publisher.test.ts | 13 | P0 | PENDING |
| FR-W10-02 | StageClassifier | src/nato/stage-classifier.ts | tests/nato/FR-W10-02-stage-classifier.test.ts | 12 | P0 | PENDING |
| FR-W10-03 | Stage35TrajectoryPredictor | src/nato/stage35-trajectory-predictor.ts | tests/nato/FR-W10-03-stage35-trajectory.test.ts | 13 | P0 | PENDING |
| FR-W10-04 | PredictiveGapAnalyzer | src/nato/predictive-gap-analyzer.ts | tests/nato/FR-W10-04-predictive-gap.test.ts | 12 | P1 | PENDING |
| FR-W10-05 | NatoAlertFormatter | src/nato/nato-alert-formatter.ts | tests/nato/FR-W10-05-nato-alert-formatter.test.ts | 11 | P0 | PENDING |
| FR-W10-06 | AlertThrottleGate | src/nato/alert-throttle-gate.ts | tests/nato/FR-W10-06-alert-throttle-gate.test.ts | 12 | P0 | PENDING |
| FR-W10-07 | StageTransitionAudit | src/nato/stage-transition-audit.ts | tests/nato/FR-W10-07-stage-transition-audit.test.ts | 12 | P1 | PENDING |
| FR-W10-08 | AwningIntegrationPipeline | src/nato/awning-integration-pipeline.ts | tests/nato/FR-W10-08-awning-integration.test.ts | 13 | P0 | PENDING |

**Total: 98 tests**

---

## FR Detail

### FR-W10-01: AwningLevelPublisher
- Derives AWNING level from contextScore (0-29=WHITE, 30-59=YELLOW, 60-100=RED)
- CivilProtection CRITICAL → always RED
- Hysteresis: 2 consecutive elevated readings before de-escalation
- Publishes to NATS `awning.level`

### FR-W10-02: StageClassifier
- Stage 1: acoustic ≥ 0.75, no RF
- Stage 2: acoustic ≥ 0.75 + RF fingerprint match
- Stage 3: Stage 2 + ADS-B correlation OR RemoteID within 500m

### FR-W10-03: Stage35TrajectoryPredictor
- EKF 6-state constant-velocity model
- Predicts at 30s, 60s, 120s
- Returns confidenceRadius_m (grows with horizon)
- Converges after 3+ fixes

### FR-W10-04: PredictiveGapAnalyzer
- 0.1° grid cells
- Blind spot: > 3.5km from nearest node
- Cross-references OSINT events for risk level

### FR-W10-05: NatoAlertFormatter
- Alert ID: AWNING-{YYYYMMDD}-{seq:04d}
- Trajectory format string
- Human-readable Telegram summary

### FR-W10-06: AlertThrottleGate
- 30s debounce on level changes
- De-escalation: 3 consecutive non-RED
- Escalation to RED: immediate
- Last 10 level history

### FR-W10-07: StageTransitionAudit
- Immutable entries (Object.freeze)
- Ring buffer: 1000 max
- replay() with optional time range filter

### FR-W10-08: AwningIntegrationPipeline
- Subscribes detection.enriched
- Routes: StageClassifier → AwningLevelPublisher → NatoAlertFormatter
- Publishes awning.alert
- 5+ E2E scenarios tested
