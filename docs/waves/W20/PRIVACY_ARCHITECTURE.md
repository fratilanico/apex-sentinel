# W20 PRIVACY ARCHITECTURE — Operator Workflow Engine

## Regulatory Framework

W20 processes personal data of security operators employed at critical national infrastructure sites. The applicable regulations are:

| Regulation | Scope | Key Articles |
|-----------|-------|-------------|
| GDPR (EU 2016/679) | Operator personal data | Art.5, 13, 17, 22, 25, 32, Art.5(1)(e) |
| Romanian Law 190/2018 | GDPR national implementation | §4 (law enforcement exemptions) |
| NIS2 Directive (EU 2022/2555) | Critical infrastructure security logging | Art.21 (security measures) |
| EU AI Act (EU 2024/1689) | High-risk AI transparency | Art.13, 14, 29 |
| CNCAN Order 400/2021 | Nuclear security logging retention | §18 (7-year minimum retention) |

---

## Personal Data Inventory

### Data Subject: Security Operator

| Field | Location | Sensitivity | Legal Basis |
|-------|----------|-------------|-------------|
| `operatorId` | Alert.transitions, AuditEntry, SlaRecord | Low (pseudonymous ID) | Legitimate interest (Art.6(1)(f)) |
| `operatorId` → real name | NOT stored in W20 | N/A | Identity resolved by employer's HR system |
| `ipAddress` | OperatorAction.ipAddress | Medium | Legitimate interest (security monitoring) |
| Acknowledgment timestamps | AlertTransition.ts | Low | Contractual obligation (Art.6(1)(b)) |
| Action notes | AlertTransition.actionNote | Medium (may contain PII) | Legitimate interest |
| Shift handover content | ShiftHandover.generatedBy | Low | Contractual obligation |

### Data Subject: Suspected Drone Operator (Adversary)

W20 does NOT store any data about drone operators. Drone detection data (RF signatures, acoustic patterns) is processed by W1–W19 and referenced in W20 only via correlation IDs — no biometric or identity data reaches W20.

---

## Data Minimization (GDPR Art.5(1)(c))

**Principle:** W20 collects the minimum personal data necessary for security logging and SLA compliance.

| Decision | Minimization rationale |
|---------|----------------------|
| `operatorId` is a pseudonymous token | Real names not needed for SLA tracking or audit |
| `ipAddress` is optional in OperatorAction | Network forensics need only if incident review required |
| `actionNote` is operator-authored free text | Operators instructed (in shift briefing) not to include third-party PII |
| ShiftHandover stores Incident summaries, not full Alert details | Full details queryable on demand, not pre-embedded |

---

## Retention and Storage Limitation (GDPR Art.5(1)(e))

### Standard Zones (airport, government)

| Data | Raw Retention | Anonymized/Aggregated | Deletion Method |
|------|-------------|----------------------|----------------|
| operator_audit_log | 90 days | 1 year (operator_id → '[OP-REDACTED]') | Scheduled job: DELETE WHERE ts < (NOW - 90d) |
| operator_sla_records | 90 days | 1 year (operator_id stripped) | Same |
| operator_shift_handovers | 90 days | None | Same |
| In-process Alert state | Until ARCHIVED | Not retained | GC on archive (>24h after RESOLVED) |
| In-process Incident state | Until CLOSED + 24h | Not retained | GC after close |

### Nuclear Sites (CNCAN exception)

CNCAN Order 400/2021 §18 mandates 7-year retention of all security incident logs at nuclear installations. For Cernavodă:
- `operator_audit_log` entries tagged `zone_type='nuclear'`: retained 7 years
- Operator IDs in nuclear logs: pseudonymous for first 90 days, then replaced with `[OP-NUCLEAR-REDACTED-GDPR17]`
- CNCAN export: generated via AuditTrailExporter CSV with operator_id redacted

### Military Zones (NATO retention)

NATO security incidents may be subject to 5-year retention per STANAG 4670. Military zone audit logs are flagged `nato_classified=true` and excluded from automated GDPR deletion jobs. Manual review required.

---

## Right to Erasure (GDPR Art.17) vs. Security Retention Obligation

**Conflict:** An operator may invoke their Art.17 right to have their operator ID removed from audit logs. Security retention obligations (NIS2 Art.21, CNCAN, NATO) may override this right.

**Resolution framework:**

```
Art.17 Request received for operatorId X
    │
    ├── Is any audit entry tagged nuclear=true or nato_classified=true?
    │     YES → Inform subject: erasure deferred per CNCAN/STANAG exception (Art.17(3)(b))
    │            Set erasure_pending=true, apply erasure after retention period expires
    │     NO ↓
    │
    ├── Is any audit entry within last 30 days (active SLA investigation)?
    │     YES → Defer erasure until all associated Incidents are CLOSED
    │     NO ↓
    │
    └── Replace operator_id with '[REDACTED-GDPR-ART17-{hash}]'
          hash = SHA-256(operatorId + erasure_date)  // allows dedup without reversibility
          Do NOT delete AuditEntry rows (hash chain integrity)
          Record erasure in operator_audit_log as ERASURE_EXECUTED action
```

**Implementation:** `AuditTrailExporter.eraseOperator(operatorId: string): ErasureResult`

---

## Privacy by Design (GDPR Art.25)

### Design Decisions with Privacy Impact

**PBD-01: Hash chain prevents silent deletion**
The SHA-256 hash chain in AuditTrailExporter means any row deletion breaks chain integrity. This is by design — it prevents both tampering AND silent GDPR erasure that could hide security incidents. Erasure is implemented as pseudonymization, not deletion.

**PBD-02: Operator ID pseudonymization at collection**
operatorId is assigned by the employer's identity system. W20 never receives or stores the operator's real name, email, or employee ID. The mapping operatorId→person exists only in the employer's HR system.

**PBD-03: Shift handover Telegram message — personal data considerations**
ShiftHandover.telegramMessage is sent via W13 to a Telegram group. This message includes:
- Active incident counts (not personal data)
- Unacknowledged alert counts (not personal data)
- `generatedBy: operatorId` — pseudonymous token, low risk
- No real names or contact details

Risk assessment: LOW. Telegram group is restricted to shift supervisors.

**PBD-04: Action notes may contain free-form PII**
Operators may inadvertently enter PII in actionNote fields (e.g., "Notified John Smith from AACR"). Mitigation:
- Operator training during shift briefing (ShiftHandover includes privacy reminder)
- Post-90-day anonymization scrubs actionNote content
- GDPR Article 29 Working Party guidance on free-text fields: acceptable with training

**PBD-05: IP address collection is opt-in**
`OperatorAction.ipAddress` is optional. W21 UI will only populate this field if the site's Data Protection Officer (DPO) has confirmed it in the site privacy configuration.

---

## Data Subject Rights Implementation

| Right | Implementation | Response SLA |
|-------|---------------|-------------|
| Art.13/14 (information) | Privacy notice displayed on operator dashboard login | At collection |
| Art.15 (access) | `AuditTrailExporter.exportJSON({operatorId})` → operator self-service | 30 days |
| Art.16 (rectification) | Action notes: operatorId can amend via `addAmendmentNote()` | 30 days |
| Art.17 (erasure) | `AuditTrailExporter.eraseOperator()` with nuclear/NATO exceptions | 30 days |
| Art.20 (portability) | `AuditTrailExporter.exportJSON()` in machine-readable format | 30 days |
| Art.22 (automated decisions) | No automated decisions about operators — all FSM transitions are operator-initiated | N/A |

---

## Security Measures (GDPR Art.32)

| Measure | Implementation |
|---------|---------------|
| Encryption at rest | Supabase TLS + row-level encryption for operator_audit_log |
| Encryption in transit | TLS 1.3 for all Supabase connections; NATS TLS for internal bus |
| Access control | operatorId-scoped reads: operators can only access their own records |
| Audit log integrity | SHA-256 hash chain — tamper evidence |
| Pseudonymization | operatorId is not a real name — pseudonymized at source |
| Breach notification | Any hash chain integrity failure triggers immediate NATS alert → W13 Telegram to DPO |

---

## DPIA (Data Protection Impact Assessment) Summary

**Necessity assessment:** Processing is necessary for the legitimate interest of securing critical national infrastructure. Alternative non-personal-data approaches (anonymous logging) are not feasible because SLA accountability requires operator-specific timestamps.

**Proportionality:** Minimum data collected. 90-day raw retention is proportionate to operational review cycles.

**Risk rating:** MEDIUM overall. LOW for standard zones. HIGH for nuclear (7-year retention, CNCAN oversight).

**Residual risks after mitigation:**
1. Telegram group compromise → shift handover PII exposure. Mitigated by pseudonymous operatorId.
2. Supabase breach → audit log exposure. Mitigated by pseudonymization.
3. Nuclear log re-identification → 7-year retention increases risk. Mitigated by stronger pseudonymization at 90-day mark.
