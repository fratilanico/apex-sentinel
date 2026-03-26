# APEX-SENTINEL W10 — Roadmap

> Wave: W10 | Theme: NATO AWNING Framework Publisher + Stage 3.5 Trajectory Prediction
> Status: PLAN | Date: 2026-03-26

---

## W10 Deliverables (This Wave)

- [ ] FR-W10-01: AwningLevelPublisher + hysteresis
- [ ] FR-W10-02: StageClassifier (Stage 1/2/3)
- [ ] FR-W10-03: Stage35TrajectoryPredictor (EKF)
- [ ] FR-W10-04: PredictiveGapAnalyzer (coverage grid)
- [ ] FR-W10-05: NatoAlertFormatter (alertId, summary)
- [ ] FR-W10-06: AlertThrottleGate (debounce, de-escalation)
- [ ] FR-W10-07: StageTransitionAudit (immutable ring buffer)
- [ ] FR-W10-08: AwningIntegrationPipeline (end-to-end wiring)
- [ ] 100 tests, all GREEN
- [ ] Wave checkpoint + complete

---

## W11 Planned (Next Wave)

- Persistent audit trail to Supabase (write-once table)
- WebSocket dashboard: live AWNING level + trajectory visualization
- Multi-sensor fusion scoring (upgrade contextScore with W10 stage)
- BRAVE1 format export for Ukrainian C2 system integration
- Real NATS server integration test (replace mock)

---

## W12+ Horizon

- GPU-accelerated EKF (WebGPU or CUDA on Azure GPU VM)
- Swarm tracking: multi-drone simultaneous trajectory prediction
- Counter-UAS recommendation engine: intercept vector suggestions
- Romanian SMURD civil protection direct API integration
- NATO STANAG 4670 alert format compliance
