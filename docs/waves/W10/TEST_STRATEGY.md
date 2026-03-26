# APEX-SENTINEL W10 — Test Strategy

> Wave: W10 | Theme: NATO AWNING Framework Publisher + Stage 3.5 Trajectory Prediction
> Status: PLAN | Date: 2026-03-26

---

## Test Pyramid (W10)

### Unit Tests (~80 tests across 8 FRs)
- FR-W10-01: 13 tests — AWNING score bands, CivilProtection override, hysteresis, publish
- FR-W10-02: 12 tests — Stage 1/2/3 classification, boundary conditions, confidence thresholds
- FR-W10-03: 13 tests — EKF state update, prediction horizons, confidence radius, convergence
- FR-W10-04: 12 tests — grid generation, blind spot detection, OSINT cross-reference, risk levels
- FR-W10-05: 11 tests — alert ID format, trajectory format, Telegram summary, struct fields
- FR-W10-06: 12 tests — debounce 30s, de-escalation 3-count, escalation immediate, history
- FR-W10-07: 12 tests — record entry, freeze, ring buffer eviction, replay, immutability
- FR-W10-08: 13 tests — pipeline wiring, 5 E2E scenarios, NATS publish/subscribe

### Integration Tests (~20 tests in FR-W10-08)
- End-to-end: acoustic detection → AWNING RED → awning.alert published
- CivilProtection override scenario
- Trajectory prediction in alert
- De-escalation sequence
- Coverage gap flagging in pipeline

---

## Test Framework

- Vitest globals (describe, it, expect, vi, beforeEach)
- FR-named describe blocks: `describe('FR-W10-01: AwningLevelPublisher', () => {})`
- No real NATS — mock NatsClient in tests
- vi.spyOn for publish verification
- vi.useFakeTimers where needed for debounce tests

---

## TDD RED Phase

All test files written before implementation. Expected failures:
- Cannot find module '../../src/nato/...' — source files not yet created
- All 100 tests fail with import errors

TDD RED commit hash recorded in SESSION_STATE.md before execution begins.

---

## Coverage Requirements

- Branches: ≥ 80%
- Functions: ≥ 80%
- Lines: ≥ 80%
- Statements: ≥ 80%

---

## Test File Locations

```
tests/nato/FR-W10-01-awning-level-publisher.test.ts
tests/nato/FR-W10-02-stage-classifier.test.ts
tests/nato/FR-W10-03-stage35-trajectory.test.ts
tests/nato/FR-W10-04-predictive-gap.test.ts
tests/nato/FR-W10-05-nato-alert-formatter.test.ts
tests/nato/FR-W10-06-alert-throttle-gate.test.ts
tests/nato/FR-W10-07-stage-transition-audit.test.ts
tests/nato/FR-W10-08-awning-integration.test.ts
```
