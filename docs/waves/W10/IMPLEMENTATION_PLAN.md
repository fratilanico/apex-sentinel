# APEX-SENTINEL W10 — Implementation Plan

> Wave: W10 | Theme: NATO AWNING Framework Publisher + Stage 3.5 Trajectory Prediction
> Status: PLAN | Date: 2026-03-26

---

## Execution Order

### Phase 1: TDD RED (write all tests, no src)
1. Write tests/nato/FR-W10-01-awning-level-publisher.test.ts
2. Write tests/nato/FR-W10-02-stage-classifier.test.ts
3. Write tests/nato/FR-W10-03-stage35-trajectory.test.ts
4. Write tests/nato/FR-W10-04-predictive-gap.test.ts
5. Write tests/nato/FR-W10-05-nato-alert-formatter.test.ts
6. Write tests/nato/FR-W10-06-alert-throttle-gate.test.ts
7. Write tests/nato/FR-W10-07-stage-transition-audit.test.ts
8. Write tests/nato/FR-W10-08-awning-integration.test.ts
9. Run `bash wave-formation.sh tdd-red W10` → confirm FAIL

### Phase 2: Execute (implement all source files)

**Dependency order** (leaf → root):
1. src/nato/stage-classifier.ts (no deps)
2. src/nato/stage35-trajectory-predictor.ts (no deps)
3. src/nato/predictive-gap-analyzer.ts (no deps)
4. src/nato/stage-transition-audit.ts (no deps)
5. src/nato/awning-level-publisher.ts (no deps)
6. src/nato/alert-throttle-gate.ts (no deps)
7. src/nato/nato-alert-formatter.ts (no deps)
8. src/nato/awning-integration-pipeline.ts (depends on all above)

### Phase 3: Checkpoint
- `bash wave-formation.sh checkpoint W10`
- Fix all failures iteratively
- Rerun until PASS

### Phase 4: Complete
- `bash wave-formation.sh complete W10`
- Git commit: feat(nato): W10 AWNING Framework + Stage 3.5 EKF trajectory

---

## Implementation Notes

### EKF (stage35-trajectory-predictor.ts)
- 6x6 matrix operations: matMul, matAdd, matTranspose, matInvert3x3 (3x3 innovation covariance)
- Use Float64Array for state vector x
- Use nested number[][] for covariance P
- Predict step: x = F*x, P = F*P*F' + Q
- Update step: K = P*H'*(H*P*H'+R)^-1, x = x+K*(z-H*x), P = (I-K*H)*P

### AwningLevelPublisher hysteresis
- Track `consecutiveElevatedCount` per level
- On de-escalation attempt: increment counter; apply only if count >= 2
- On escalation: immediate, reset counter

### AlertThrottleGate debounce
- Store lastLevelChangeMs per level pair
- shouldAllow returns false if now - lastLevelChangeMs < 30000
- Exception: escalation to RED always allowed (immediate)
