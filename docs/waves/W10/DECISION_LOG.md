# APEX-SENTINEL W10 — Decision Log

> Wave: W10 | Theme: NATO AWNING Framework Publisher + Stage 3.5 Trajectory Prediction
> Status: PLAN | Date: 2026-03-26

---

## DEC-W10-001: Pure TypeScript EKF (no numeric library)

**Decision**: Implement EKF in vanilla TypeScript using flat arrays.
**Rationale**: No new npm packages allowed. EKF for 6-state constant-velocity model is straightforward enough without a matrix library. Avoids dependency risk.
**Trade-off**: More verbose code; matrix multiply hand-written. Acceptable for 6x6 matrices.

---

## DEC-W10-002: Rule-based Stage Classification (not ML)

**Decision**: Stage 1/2/3 classification uses deterministic rules, not a trained model.
**Rationale**: NATO operational stages are regulatory definitions. They must be explainable and auditable. ML confidence scores cannot override a regulatory threshold.
**Trade-off**: No learning from new sensor patterns. Accepted — W11 can add ML confidence layer on top.

---

## DEC-W10-003: Object.freeze for Audit Immutability

**Decision**: AuditEntry objects are frozen immediately after construction.
**Rationale**: Immutability guarantee for after-action review. Prevents accidental mutation. Simpler than write-once DB in W10.
**Trade-off**: Entries lost on restart. Acceptable for W10 — W11 adds persistence.

---

## DEC-W10-004: 0.1° Grid for Coverage Analysis

**Decision**: PredictiveGapAnalyzer uses 0.1° cells (same as W9 GDELT grid).
**Rationale**: Consistency with existing spatial analysis. At 45°N, 0.1° ≈ 7.8km × 11.1km — coarse enough to be fast, fine enough to identify sensor positioning gaps.
**Trade-off**: Cannot identify sub-10km blind spots. Sufficient for strategic gap analysis.

---

## DEC-W10-005: Escalation Immediate, De-escalation Delayed

**Decision**: AlertThrottleGate escalates to RED immediately but requires 3 consecutive non-RED before de-escalating.
**Rationale**: Asymmetric: missing a real threat is worse than a brief false alarm. Operator trust requires that RED is not cancelled immediately by a single low reading.
**Trade-off**: Could maintain RED for up to 90s on a transient. Acceptable — operators can manually override.

---

## DEC-W10-006: AWNING Alert ID Format

**Decision**: `AWNING-{YYYYMMDD}-{seq:04d}` format, counter resets on restart.
**Rationale**: Human-readable, includes date for cross-referencing with incident logs. Seq allows 9999 alerts/day — far above operational volume.
**Trade-off**: Not globally unique across restarts. W11 can add UUID suffix if needed.
