# APEX-SENTINEL W10 — Privacy Architecture

> Wave: W10 | Theme: NATO AWNING Framework Publisher + Stage 3.5 Trajectory Prediction
> Status: PLAN | Date: 2026-03-26

---

## Data Classification

| Data | Classification | Retention |
|------|---------------|-----------|
| AWNING alert level | RESTRICTED | Session only |
| Trajectory predictions | RESTRICTED | Session only |
| Audit trail entries | SECRET | Session ring buffer (1000 max) |
| OperatorId in audit | CONFIDENTIAL | Session only |
| Coverage grid | UNCLASSIFIED | Computed on demand |

---

## GDPR Considerations

### Position Data
Trajectory predictions derived from detected drone positions — not from persons. No personal data processed.

### OperatorId
Optional field in audit entries. If provided, must be a role identifier (e.g., "OPS-1") not a personal name. System does not validate this — operator policy governs.

### Immutability
Audit entries are frozen. This supports GDPR right-to-audit (Art. 30 records of processing). However, there is no right to erasure for security audit logs under GDPR Art. 17(3)(d) — public security.

---

## Military / EUDIS Compliance

W10 operates within EUDIS "Defending Airspace" rules:
- No civilian surveillance (detection of drones only, not persons).
- Alert IDs are not correlated with personal identities.
- AWNING level publication is restricted to authorized NATS consumers.
- Trajectory data has no PII component.

---

## Data Minimization

- PositionFix: lat/lon/alt/ts only — no device ID or operator identity.
- AwningAlert: drone type string — not individual drone serial (not available from acoustic/RF).
- Coverage grid: spatial statistics only — no sensor node identities published externally.

---

## Audit Trail Security

- Ring buffer in memory — cleared on restart (no persistence to disk in W10).
- Object.freeze on entries prevents tampering in-process.
- For persistent audit, W11 can add Supabase write-once table.
