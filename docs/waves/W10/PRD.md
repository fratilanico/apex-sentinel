# APEX-SENTINEL W10 — Product Requirements Document

> Wave: W10 | Theme: NATO AWNING Framework Publisher + Stage 3.5 Trajectory Prediction
> Status: PLAN | Date: 2026-03-26

---

## Problem Statement

APEX-SENTINEL can detect, classify, and enrich drone threats. It cannot communicate those threats in NATO-standard formats, predict intercept trajectories, or identify coverage gaps. EUDIS hackathon "Defending Airspace" judges require a complete operational picture: detection → classification → prediction → alert.

---

## User Stories

1. **As an operator**, I want to see AWNING WHITE/YELLOW/RED on my dashboard so I can act without interpreting raw scores.
2. **As a command system**, I want structured NATS messages on `awning.alert` with stage, drone type, trajectory, and alert ID so I can route to intervention units.
3. **As a mission planner**, I want trajectory predictions at 30s/60s/120s so I can pre-position countermeasures.
4. **As an intelligence analyst**, I want coverage gap maps showing blind spots overlapping historical OSINT events so I can recommend sensor repositioning.
5. **As a compliance officer**, I want an immutable after-action audit trail of all stage transitions with evidence records.
6. **As a system integrator**, I want AlertThrottleGate to prevent oscillation storms from overwhelming operators.

---

## Functional Requirements

| FR | Name | Priority |
|----|------|----------|
| FR-W10-01 | AwningLevelPublisher | P0 |
| FR-W10-02 | StageClassifier | P0 |
| FR-W10-03 | Stage35TrajectoryPredictor | P0 |
| FR-W10-04 | PredictiveGapAnalyzer | P1 |
| FR-W10-05 | NatoAlertFormatter | P0 |
| FR-W10-06 | AlertThrottleGate | P0 |
| FR-W10-07 | StageTransitionAudit | P1 |
| FR-W10-08 | AwningIntegrationPipeline | P0 |

---

## Non-Functional Requirements

- TypeScript strict mode, no new npm packages.
- All logic unit-testable without real NATS.
- EKF convergence within 3 position updates.
- Alert ID globally unique within session.
- Audit entries immutable after write (Object.freeze or equivalent).
- Test coverage ≥ 80% branches/functions/lines/statements.
- Minimum 10 tests per FR, ~100 total.

---

## Acceptance Criteria

- All 8 FRs implemented and tested GREEN.
- `npx vitest run --project p2` passes all W10 tests.
- Wave checkpoint passes with zero failures.
- Git commit includes all 8 source + 8 test files.
