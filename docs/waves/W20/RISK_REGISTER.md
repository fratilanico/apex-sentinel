# W20 RISK REGISTER — Operator Workflow Engine

## Risk Summary

| ID | Category | Risk | Likelihood | Impact | Score | Status |
|----|----------|------|-----------|--------|-------|--------|
| RR-W20-01 | Operational | Operator alert fatigue causing SLA breaches | HIGH | HIGH | 9 | OPEN |
| RR-W20-02 | Operational | False positive escalation costs | MEDIUM | HIGH | 6 | OPEN |
| RR-W20-03 | Operational | SLA gaming by operators | MEDIUM | MEDIUM | 4 | OPEN |
| RR-W20-04 | Technical | Clock skew on edge node causing SLA miscalculation | MEDIUM | HIGH | 6 | OPEN |
| RR-W20-05 | Technical | Hash chain performance degradation at scale | LOW | MEDIUM | 2 | MONITORING |
| RR-W20-06 | Technical | Escalation Telegram delivery failure | MEDIUM | HIGH | 6 | OPEN |
| RR-W20-07 | Legal/Regulatory | GDPR erasure conflicting with CNCAN/NATO retention | MEDIUM | HIGH | 6 | OPEN |
| RR-W20-08 | Legal/Regulatory | Audit trail admissibility in regulatory proceedings | LOW | HIGH | 3 | MONITORING |
| RR-W20-09 | Security | Audit log tampering by insider | LOW | CRITICAL | 4 | OPEN |
| RR-W20-10 | Strategic | Incident grouping masking separate threats | LOW | HIGH | 3 | MONITORING |
| RR-W20-11 | Operational | Shift handover not acknowledged | MEDIUM | MEDIUM | 4 | OPEN |
| RR-W20-12 | Technical | W19 ThreatIntelPicture schema changes breaking W20 | LOW | HIGH | 3 | MONITORING |

*Score = Likelihood (1-3) × Impact (1-3): 1-3 LOW, 4-6 MEDIUM, 7-9 HIGH*

---

## RR-W20-01: Operator Alert Fatigue (Alert Overload)

**Risk:** High-volume drone activity at a busy airport (e.g., OTP during summer peak) generates dozens of alerts per hour. Operators, overwhelmed by alerts, may:
- Acknowledge all alerts immediately without investigation (acknowledge-and-dismiss behavior)
- Miss genuine threat alerts buried in false-positive noise
- Experience cognitive burnout, leading to slower response times over multi-hour shifts

**Root cause analysis:**
- W5/W6 acoustic and RF sensors have a known false positive rate of ~15% in high-noise environments (takeoff/landing engine noise confuses acoustic models)
- AWNING YELLOW threshold set at ThreatScore ≥ 0.60 — in high-traffic zones this may fire on legitimate aircraft
- Alert visual design (W21 scope) will determine cognitive load

**Likelihood:** HIGH (airports during peak operations)
**Impact:** HIGH (missed genuine threat, regulatory SLA breach)
**Mitigation:**

1. **Zone-specific alert rate monitoring:** SlaComplianceTracker tracks alert volume per zone. If >10 NEW alerts/hour sustained for >30 minutes, emit alert_volume_warning event.

2. **Alert deduplication upstream (W19 responsibility):** Ensure W19 does not emit duplicate ZoneBreaches for the same physical event. IncidentManager correlation helps but does not solve the root cause.

3. **Operator fatigue early warning (W21 scope):** Track MTTA (mean time to acknowledge) per operator per shift. If MTTA increases >3σ above operator's baseline, surface fatigue warning to supervisor.

4. **False positive feedback loop:** outcome='FALSE_POSITIVE' from resolveAlert() feeds back to W22 ML training data — over time, false positive rate should decrease.

5. **Alert severity filtering for operators:** MultiSiteOperatorView allows filtering by minAwningLevel. Operators can choose to view only ORANGE+ in high-volume periods (accepted risk decision logged in AuditTrail).

**Residual risk:** MEDIUM (mitigations reduce but do not eliminate fatigue risk)

---

## RR-W20-02: False Positive Escalation Costs

**Risk:** EscalationMatrix triggers notifications to AACR, ROMATSA, IGAV, SRI, or NATO CAOC based on AWNING level + SLA breach. A false-positive escalation to:
- **AACR**: generates a mandatory case file — AACR officer workload, potential regulatory friction
- **NATO CAOC Uedem**: generates a SALUTE report — NATO staff workload, relationship credibility risk
- **SRI**: triggers intelligence service attention — disproportionate response to sensor noise
- **IGAV**: may dispatch helicopter — significant operational cost (€2,000+/flight hour)

**Likelihood:** MEDIUM (false positive rate in W1–W19 pipeline is ~15% per W_AI_TESTING_LAYER bias audit)
**Impact:** HIGH (financial cost, authority relationship damage, credibility erosion)
**Mitigation:**

1. **Escalation dry-run mode:** `escalationConfig.dryRun: true` in non-production deployments. All escalation logic executes, but external notifications are logged not sent.

2. **Dual-confirm for highest escalation levels:** Level 3+ escalations (NATO CAOC, SRI) require operator confirmation within 60 seconds before sending, unless AwningLevel=RED AND SLA breach >5 minutes (unambiguous genuine incident).

3. **False positive rate dashboard (W22 scope):** Track escalations that result in outcome='FALSE_POSITIVE'. Report to site security manager weekly. Threshold: >10% false escalation rate triggers EscalationMatrix threshold review.

4. **Escalation consequence documentation:** DECISION_LOG DL-W20-04 documents why each authority was chosen. This reduces the risk of inappropriate escalation due to misconfiguration.

**Residual risk:** LOW-MEDIUM (dual-confirm mitigates expensive Level 3+ escalations)

---

## RR-W20-03: SLA Gaming by Operators

**Risk:** Operators, aware that acknowledgment SLA compliance is tracked and reported, may:
- **Rapid acknowledge without review:** click acknowledge immediately to stop SLA timer without actually reviewing the alert
- **Pre-emptive investigation:** move alert to INVESTIGATING before actually starting investigation to reset resolve SLA
- **Outcome misclassification:** mark genuine detections as FALSE_POSITIVE to avoid escalation overhead

**Likelihood:** MEDIUM (common in SLA-driven environments, documented in security operations research)
**Impact:** MEDIUM (degrades detection quality, misleads compliance metrics, may mask genuine threats)
**Mitigation:**

1. **Required actionNote on INVESTIGATING transition:** beginInvestigation() requires non-empty actionNote. Auditors can review notes for substance.

2. **Outcome distribution monitoring (W22 scope):** Track FALSE_POSITIVE rate per operator. Statistical outliers (operator with >50% FALSE_POSITIVE rate when zone average is 15%) flagged for supervisor review.

3. **AuditTrail transparency:** All transitions are immutable and logged with timestamps. Supervisor can see: acknowledge at T+2s, no action for 25 minutes, then investigate. Pattern analysis possible.

4. **Training:** Shift handover includes privacy reminder and SLA compliance coaching. Operators informed that gaming is detectable and has regulatory consequences under CNCAN/NATO frameworks.

5. **Deliberate exclusion of SLA target from operator-facing UI (W21 design recommendation):** Do not show operators their personal SLA compliance percentage in real time. Show zone aggregate only. This reduces individual incentive to game.

**Residual risk:** LOW-MEDIUM (structural mitigations in place, gaming remains possible but auditable)

---

## RR-W20-04: Clock Skew on Edge Node

**Risk:** RPi4 edge nodes run without guaranteed NTP synchronization in some deployment scenarios (air-gapped military networks, poor connectivity at remote government buildings). Clock drift of ±30 seconds causes:
- Incorrect SLA deadline computation
- Erroneous SLA breach events
- Incorrect shift handover timing

**Likelihood:** MEDIUM (deployment at military/government sites may have connectivity restrictions)
**Impact:** HIGH (false SLA breaches trigger unwarranted escalation; missed real SLA breaches miss genuine escalation)
**Mitigation:**

1. **Monotonic clock for SLA measurement:** SlaComplianceTracker measures elapsed time using `process.hrtime.bigint()` (monotonic, not wall clock) for duration measurement. Wall clock `Date.now()` is used only for absolute timestamps and SLA deadline display.

2. **NTP requirement in DEPLOY_CHECKLIST:** systemd-timesyncd or chrony required on all edge nodes. Deployment blocked if last NTP sync >5 minutes ago.

3. **Clock drift tolerance in tests:** Tests use injected `clockFn: () => number`. All SLA assertions include ±1000ms tolerance.

4. **Configuration option: `slaToleranceMs`:** Default 1000ms. Can be increased to 5000ms for known poor-connectivity sites.

**Residual risk:** LOW (monotonic clock for measurement eliminates drift impact on SLA math)

---

## RR-W20-05: Hash Chain Performance at Scale

**Risk:** AuditTrailExporter.appendEntry() performs a SHA-256 computation on every operator action. Under high alert volume (1000 actions/hour for 90 days = 2.16M entries), chain traversal for verification becomes slow.

**Likelihood:** LOW (typical deployment: 50–200 actions/day, well within bounds)
**Impact:** MEDIUM (slow verification delays audit export for regulatory submission)
**Mitigation:**

1. **Sequential write, lazy verify:** appendEntry() is O(1) (only hashes the current entry). verifyChain() is only called on demand (audit export, not hot path).

2. **Chain segment exports:** exportJSON(filter) can export sub-chains (by date range) for verification without traversing the full chain.

3. **Benchmark gate:** Implementation must benchmark verifyChain() for 10,000 entries. Must complete <5 seconds. If not: implement checkpoint hashes every 1000 entries.

**Residual risk:** LOW

---

## RR-W20-06: Escalation Telegram Delivery Failure

**Risk:** W13 Telegram bot loses connection (APEX-SENTINEL network issue, Telegram API downtime) during a genuine AWNING=RED incident. Escalation notification to AACR/SRI is not delivered. Authority is not notified within SLA.

**Likelihood:** MEDIUM (network instability on edge devices is a known issue per W18 resilience work)
**Impact:** HIGH (regulatory SLA breach, potential safety incident without authority response)
**Mitigation:**

1. **W18 resilience patterns:** W13 TelegramBot already implements reconnect with exponential backoff (W18 deliverable). W20 relies on this.

2. **Escalation retry queue:** EscalationMatrix maintains an internal queue of pending notifications. If Telegram send fails, retry×3 with 30s backoff. After 3 failures: emit `escalation_send_failed` event and log to AuditTrail with action='ESCALATION_NOTIFICATION_FAILED'.

3. **Fallback notification (W21 scope):** W21 production UI renders undelivered escalation notifications prominently. Operator can manually initiate contact via alternative channel.

4. **Monitoring:** `escalation_send_failed` events trigger NATS publish to system.alerts topic, captured by W16 SystemHealthDashboard.

**Residual risk:** MEDIUM (Telegram is a single point of failure; alternative notification channel is W21+ scope)

---

## RR-W20-07: GDPR Erasure vs. Nuclear/NATO Retention Conflict

**Risk:** An operator employed at Cernavodă nuclear plant invokes GDPR Art.17 right to erasure. Their operatorId appears in 7-year retention nuclear audit logs. GDPR erasure obligation conflicts with CNCAN Order 400/2021 7-year retention obligation.

**Likelihood:** MEDIUM (operator turnover at nuclear sites is moderate; Art.17 requests are not uncommon after employment ends)
**Impact:** HIGH (regulatory non-compliance with either GDPR or CNCAN, depending on which obligation is honored)
**Mitigation:**

1. **GDPR Art.17(3)(b) exception:** Storage for "the prevention, investigation, detection or prosecution of criminal offences or the execution of criminal penalties" can override erasure right. Nuclear security incidents fall under Law 319/2006 (Romanian criminal liability for security breaches) — GDPR Art.17(3)(b) exception applies.

2. **Documented resolution procedure:** PRIVACY_ARCHITECTURE.md §Right to Erasure defines the exact procedure: apply erasure_pending flag, defer execution to after CNCAN retention period expires (7 years from event date).

3. **DPO review process:** All Art.17 requests for nuclear/military records require DPO sign-off before response to data subject.

4. **Pseudonymization at 90-day mark:** At 90 days, operatorId is replaced with `[OP-NUCLEAR-REDACTED-GDPR17]` (not the full GDPR erasure token, but still pseudonymized) in non-legally-required fields. This partially satisfies the spirit of erasure.

**Residual risk:** MEDIUM (legal uncertainty remains; DPO oversight required)

---

## RR-W20-08: Audit Trail Admissibility

**Risk:** In a regulatory investigation (CNCAN, AACR, IGAV), APEX-SENTINEL audit trail is submitted as evidence. Authority questions the admissibility of a SHA-256 hash chain generated by a commercial software system without formal certification.

**Likelihood:** LOW (rare for software audit logs to be challenged on technical grounds in Romanian courts)
**Impact:** HIGH (if inadmissible, APEX-SENTINEL loses its regulatory compliance value proposition)
**Mitigation:**

1. **Open verification:** The hash chain verification algorithm is documented in PRIVACY_ARCHITECTURE.md and can be reproduced by any SHA-256 tool. Verifier does not need APEX-SENTINEL software.

2. **Timestamp corroboration:** AuditEntry timestamps can be corroborated against NATS message logs (separate system) and Telegram message timestamps (third-party system). Cross-validation provides independent admissibility support.

3. **Formal certification (post-hackathon):** Pursue ISO 27001 certification for APEX-SENTINEL audit log module. ISO 27001 certification significantly strengthens admissibility arguments.

**Residual risk:** LOW (hash chain is standard practice; challenge would be novel in Romanian jurisprudence)

---

## RR-W20-09: Insider Audit Log Tampering

**Risk:** A compromised administrator with direct Supabase access modifies audit log records after the fact to conceal their own or a colleague's actions during a security incident.

**Likelihood:** LOW (requires Supabase admin credentials + knowledge of hash chain structure)
**Impact:** CRITICAL (undermines entire audit trail, regulatory and legal consequences)
**Mitigation:**

1. **SHA-256 hash chain:** Any modification to any record invalidates all subsequent hashes. verifyChain() detects tampering.

2. **In-process chain state:** The running APEX-SENTINEL process holds `prevHash` in memory. Any Supabase modification that does not update the in-process state will be caught on next appendEntry() when prevHash mismatch is detected.

3. **Chain head publishing:** Export chainHead hash daily to a tamper-resistant store (Telegram channel message, which is timestamped and immutable). Allows independent verification of chain state at any point in time.

4. **Supabase RLS:** Row-level security prevents direct INSERT/UPDATE from anon key. Only service role can write — reduces attack surface.

**Residual risk:** LOW

---

## RR-W20-10: Incident Grouping Masking Separate Threats

**Risk:** Two independent drone operators launch drones from different sides of a nuclear plant simultaneously. IncidentManager groups them into one incident because they're in the same zone within 10 minutes. The single incident may receive lower escalation than two simultaneous independent incidents would warrant.

**Likelihood:** LOW (coordinated multi-vector attack on Romanian critical infrastructure is sophisticated)
**Impact:** HIGH (under-escalation during coordinated attack scenario)
**Mitigation:**

1. **maxAwningLevel tracking:** Incident always reflects the worst AWNING level across all constituent alerts. If one detection is ORANGE and another RED, the incident is RED.

2. **Alert count visibility:** IncidentReport.alertIds shows operator how many constituent detections are grouped. Operator can manually request split-incident via W21 UI (W21 scope).

3. **maxThreatScore tracking:** Incident records the highest ThreatScore seen. Two high-threat alerts in one incident = higher maxThreatScore → stronger escalation signal.

**Residual risk:** LOW (maxAwningLevel and count visibility provide sufficient signal)

---

## RR-W20-11: Shift Handover Not Acknowledged

**Risk:** Outgoing operator generates handover. Incoming operator does not acknowledge it (missed Telegram message, delayed arrival, system issue). Situational awareness gap at shift boundary.

**Likelihood:** MEDIUM (shift transitions are organizationally stressful moments)
**Impact:** MEDIUM (incoming operator starts shift without full picture; may miss active incident)
**Mitigation:**

1. **Acknowledgment tracking:** ShiftHandover.acknowledged flag visible to shift supervisor. Unacknowledged handovers older than 15 minutes trigger a reminder notification.

2. **Handover content in UI (W21 scope):** ShiftHandover is displayed as a modal on the W21 dashboard on operator login. Cannot be dismissed without clicking "Acknowledged" or "Skip and accept risk" (audit logged either way).

3. **Active incident persistence:** OPEN/ACTIVE Incidents do not expire or change state at shift boundary. They persist in the OperatorWorkflowState regardless of handover acknowledgment.

**Residual risk:** LOW

---

## RR-W20-12: W19 ThreatIntelPicture Schema Changes

**Risk:** Post-W20, W19 adds new fields or changes existing field names in ThreatIntelPicture. W20 process() breaks silently (TypeScript catches named field access at compile time, but metadata fields are often loosely typed).

**Likelihood:** LOW (W19 is COMPLETE; changes are unlikely before hackathon)
**Impact:** HIGH (W20 silently drops data or crashes, affecting all 8 FRs)
**Mitigation:**

1. **TypeScript strict mode:** `"strict": true` in tsconfig.json catches property access on incorrect types at compile time.

2. **W19 ThreatIntelPicture type ownership:** Type is defined in `src/intel/types.ts` (W19). W20 imports it. Any W19 type change breaks W20 TypeScript build — visible immediately.

3. **Integration test:** `infra/__tests__/sentinel-w20-integration.test.cjs` E2E-01 uses the actual W19 type. Would fail if W19 type changes incompatibly.

**Residual risk:** LOW (TypeScript build system catches this class of error)
