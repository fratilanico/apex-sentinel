# APEX-SENTINEL W10 — Risk Register

> Wave: W10 | Theme: NATO AWNING Framework Publisher + Stage 3.5 Trajectory Prediction
> Status: PLAN | Date: 2026-03-26

---

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|-----------|
| R-01 | EKF numerical instability (P matrix diverges) | LOW | HIGH | Clamp P diagonal values; reset on divergence |
| R-02 | Alert ID collision if clock jumps backward | LOW | MEDIUM | Use atomic counter + timestamp; UUID fallback |
| R-03 | AlertThrottleGate blocks real threats | LOW | HIGH | Escalation is always immediate; only de-escalation is throttled |
| R-04 | Object.freeze missing deep object properties | MEDIUM | MEDIUM | Shallow freeze sufficient for flat entry struct; document assumption |
| R-05 | Grid computation slow for large bbox | LOW | LOW | 0.1° grid for Romania (5.2°×4.7° = ~2500 cells) — instant |
| R-06 | Stage 3 false positive from ADS-B noise | LOW | MEDIUM | ADS-B correlation requires explicit flag from W9 enricher |
| R-07 | Test import errors due to .js extension | LOW | HIGH | Match existing pattern: all imports use .js extensions |
| R-08 | Wave formation checkpoint script failure | LOW | LOW | Investigate and fix; do not skip |

---

## Accepted Risks

- **Restart resets audit trail**: In-memory only for W10. Accepted — W11 adds persistence.
- **EKF velocity estimate noisy for <3 fixes**: inflated confidence radius communicates uncertainty.
- **AWNING counter resets on restart**: Day-based counter — max 9999 alerts/day, well within ops volume.
