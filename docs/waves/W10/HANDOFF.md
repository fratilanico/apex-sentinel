# APEX-SENTINEL W10 — Handoff Document

> Wave: W10 | Theme: NATO AWNING Framework Publisher + Stage 3.5 Trajectory Prediction
> Status: PLAN | Date: 2026-03-26

---

## What Was Built in W10

- **AwningLevelPublisher**: maps enriched detections to NATO AWNING WHITE/YELLOW/RED levels
- **StageClassifier**: classifies detections into Stage 1/2/3 based on sensor evidence
- **Stage35TrajectoryPredictor**: EKF-based intercept point prediction at 30/60/120s
- **PredictiveGapAnalyzer**: coverage blind-spot identification on 0.1° grid
- **NatoAlertFormatter**: structured alert with ID, trajectory, and operator summary
- **AlertThrottleGate**: de-bounce and de-escalation hysteresis
- **StageTransitionAudit**: immutable ring-buffer audit trail
- **AwningIntegrationPipeline**: end-to-end wiring of all components

---

## What the Next Developer Needs to Know

### NATS Subjects (W10 additions)
- `awning.level` — published by AwningLevelPublisher after each enriched detection
- `awning.alert` — published by AwningIntegrationPipeline with full AwningAlert struct

### Integration Point with W9
- W9 publishes `detection.enriched` (EnrichedDetection with contextScore)
- W10 subscribes to `detection.enriched` via AwningIntegrationPipeline.start()

### Key Constraints
- No new npm packages — only node:crypto and events built-ins
- EKF needs ≥3 position fixes to produce stable velocity estimate
- De-escalation requires 3 consecutive non-RED readings (AlertThrottleGate)
- Audit entries are Object.frozen — cannot be modified after write

---

## W11 Recommendations

1. Persist audit trail to Supabase (write-once table `sentinel_audit_log`)
2. Add WebSocket push for live AWNING level on dashboard
3. Real NATS server integration test (NATS.ws or NATS server in Docker)
4. Multi-drone simultaneous tracking in AwningIntegrationPipeline
5. BRAVE1 format export for Ukrainian C2 system

---

## Test Count at W10 Complete

W1-W9: ~1860 tests
W10 addition: ~98 tests
Total target: ~1958 tests
