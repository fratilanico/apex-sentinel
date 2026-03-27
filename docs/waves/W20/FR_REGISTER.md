# W20 FR REGISTER — Operator Workflow Engine

## FR Summary

| FR | Name | Source File | Tests | Priority | Status |
|----|------|-------------|-------|----------|--------|
| FR-W20-01 | AlertAcknowledgmentEngine | src/workflow/alert-acknowledgment-engine.ts | 13 | P0 | NOT STARTED |
| FR-W20-02 | IncidentManager | src/workflow/incident-manager.ts | 14 | P0 | NOT STARTED |
| FR-W20-03 | EscalationMatrix | src/workflow/escalation-matrix.ts | 12 | P0 | NOT STARTED |
| FR-W20-04 | OperatorShiftHandover | src/workflow/operator-shift-handover.ts | 10 | P1 | NOT STARTED |
| FR-W20-05 | SlaComplianceTracker | src/workflow/sla-compliance-tracker.ts | 11 | P0 | NOT STARTED |
| FR-W20-06 | AuditTrailExporter | src/workflow/audit-trail-exporter.ts | 11 | P0 | NOT STARTED |
| FR-W20-07 | MultiSiteOperatorView | src/workflow/multi-site-operator-view.ts | 12 | P1 | NOT STARTED |
| FR-W20-08 | W20OperatorWorkflowPipeline | src/workflow/w20-operator-workflow-pipeline.ts | 13 | P0 | NOT STARTED |

**Total: 8 FRs, 96 tests**

---

## FR-W20-01: AlertAcknowledgmentEngine

**Description:** Manages the full Alert lifecycle via a strict FSM with SLA enforcement. Every drone detection alert created from W19 ZoneBreach passes through this engine. Operators must acknowledge alerts within zone-specific SLA windows or SLA breach events are emitted and escalation chains may be triggered.

**Input:**
- ZoneBreach (from W19 ThreatIntelPicture)
- AwningLevel (from W19)
- Operator actions: acknowledge, beginInvestigation, resolveAlert

**Output:**
- Alert (in various states)
- SlaRecord (per transition)
- Events: alert_new, sla_breach

**FSM:**
```
NEW ──acknowledge()──► ACKNOWLEDGED ──beginInvestigation()──► INVESTIGATING ──resolveAlert()──► RESOLVED ──(24h)──► ARCHIVED
```
No backward transitions permitted. FSM is append-only (transitions array grows, status pointer advances).

**SLA Gates:**
| Zone | Ack SLA | Authority |
|------|---------|-----------|
| airport | 60s | ICAO Annex 11 / ROMATSA OPS-UAS-001 |
| nuclear | 30s | CNCAN Order 400/2021 Art.18(2) |
| military | 30s | SMFA Directive 2019-UAS-03 |
| government | 120s | SPP Protocol 2020 Art.12 |

**Error conditions:**
- DuplicateAlertError: same correlationId ingested twice
- InvalidTransitionError: transition not valid from current status
- ValidationError: required fields missing

**Acceptance:** 13 tests GREEN per TEST_STRATEGY.md

---

## FR-W20-02: IncidentManager

**Description:** Groups correlated alerts into Incidents to reduce operator cognitive load and produce a unified record for regulatory reporting. Correlation uses a 10-minute sliding window per zone.

**Input:**
- Alert[] (from AlertAcknowledgmentEngine)
- Operator actions: closeIncident, generateIncidentReport

**Output:**
- Incident (in various states)
- IncidentReport (on closure)
- Events: incident_opened

**Incident lifecycle:**
```
OPEN ──(first ack)──► ACTIVE ──(all investigating)──► MONITORING ──(all resolved)──► CLOSED
```

**Correlation algorithm:**
- Key = `{zoneId}:{floor(detectedAt / 600_000)}`
- Same key + OPEN/ACTIVE status → add to existing Incident
- Different key → new Incident

**IncidentReport fields:** incidentId, zoneId, duration, alertIds, timeline, outcome, escalationsTriggered, slaCompliant, regulatoryReportRequired

**Acceptance:** 14 tests GREEN per TEST_STRATEGY.md

---

## FR-W20-03: EscalationMatrix

**Description:** Defines and enforces escalation chains per zone type. Automatically triggers escalation when AWNING level and SLA breach conditions are met. Ensures appropriate Romanian and NATO authorities are notified without operator intervention.

**Input:**
- Incident (from IncidentManager)
- SlaBreachEvent (from SlaComplianceTracker)
- Zone type configuration

**Output:**
- EscalationAction (trigger decision)
- Escalation record (on execution)
- Events: escalation_triggered

**Chains (summarized):**
- airport: Operator → Airport Security → AACR → ROMATSA → IGAV
- nuclear: Operator → Site Security (SNN) → SNN Directorate → AACR + CNCAN → SRI
- military: Operator → Base Commander → SMFA J3 → NATO CAOC Uedem
- government: Operator → SPP Chief → SPP Operations → SRI

**Trigger conditions:**
- airport/government: AWNING=RED + ack SLA breach
- nuclear: AWNING=ORANGE+ (any duration)
- military: AWNING=YELLOW+ (any duration)

**Acceptance:** 12 tests GREEN per TEST_STRATEGY.md

---

## FR-W20-04: OperatorShiftHandover

**Description:** Generates structured shift handover briefings at 8-hour shift boundaries (06:00, 14:00, 22:00 EET/UTC+2). Ensures incoming operator has complete situational awareness without verbal briefing dependency.

**Input:**
- Active Incidents (from IncidentManager)
- Unresolved Alerts (from AlertAcknowledgmentEngine)
- Zone status (from MultiSiteOperatorView)
- Detection stats (from SlaComplianceTracker)

**Output:**
- ShiftHandover (structured JSON)
- ShiftHandover.telegramMessage (Telegram-formatted string, <4096 chars)
- Events: handover_ready

**Shift boundaries:** 04:00 UTC (= 06:00 UTC+2 summer / 05:00 UTC+2 winter)
Note: Romania uses EET (UTC+2) in winter, EEST (UTC+3) in summer. Implementation uses configurable offset.

**Telegram message sections:**
1. Header: "SHIFT HANDOVER — {site} — {date} {time}"
2. Active incidents (count + worst severity)
3. Unresolved alerts (count + oldest)
4. Zone status table (zone → AWNING level)
5. 24h detection stats
6. Pending AACR notifications
7. Footer: "Prepared by: {outgoingOperatorId}"

**Acceptance:** 10 tests GREEN per TEST_STRATEGY.md

---

## FR-W20-05: SlaComplianceTracker

**Description:** Measures and tracks SLA compliance for all alert lifecycle events. Maintains a rolling 24-hour window of SlaRecords and computes compliance percentages for operational reporting.

**Input:**
- SLA events from AlertAcknowledgmentEngine (ack, resolve, AACR notif timestamps)
- Clock function (injectable for testing)

**Output:**
- SlaRecord (per event)
- SlaStatus (rolling compliance percentages)
- SlaBreachEvent (when SLA exceeded)
- SlaCheckResult (current status of individual alert)

**SLA thresholds:**
- ACK: airport=60s, nuclear=30s, military=30s, government=120s
- RESOLVE: 30min (all zones)
- AACR_NOTIF: 15min (all RED AWNING events)

**Rolling window:** 24 hours. Records older than 24h are excluded from computeCompliance(). Window evicts oldest 10% at 10_000 record capacity.

**Acceptance:** 11 tests GREEN per TEST_STRATEGY.md

---

## FR-W20-06: AuditTrailExporter

**Description:** Maintains a GDPR-compliant, tamper-evident audit trail of all operator actions using a SHA-256 forward-linked hash chain. Supports export in JSON (internal), CSV (AACR regulatory), and implements GDPR Art.17 erasure via pseudonymization (not deletion).

**Input:**
- OperatorAction (from all W20 modules via appendEntry() calls)

**Output:**
- AuditEntry[] (hash-chained log)
- JSON export
- CSV export (AACR format)
- Chain verification result

**Hash chain:** each entry = SHA-256(prevHash + ts + operatorId + actionType + resourceId + metadata)

**Retention:**
- Standard zones: 90 days raw, 1 year aggregated
- Nuclear: 7 years raw (CNCAN mandate)
- Military: 5 years raw (NATO mandate)

**GDPR erasure:** replaces operatorId with `[REDACTED-GDPR-ART17-{hash}]`, recomputes affected hashes, chain remains valid.

**Acceptance:** 11 tests GREEN per TEST_STRATEGY.md

---

## FR-W20-07: MultiSiteOperatorView

**Description:** Aggregates state from multiple protected zones into a priority-sorted operator view. Enables a single operator to monitor multiple sites simultaneously with a single health score driving alert priority.

**Input:**
- Zone configurations (from ConfigurationManager W16)
- Zone state updates (awning level, incident count, alert count, SLA compliance)

**Output:**
- OperatorViewState (sorted zone list + aggregate metrics)
- Zone health scores (0–100)
- Overall site health score (MIN of zones)

**Health score formula:**
```
score = 100 - awningPenalty - alertPenalty - incidentPenalty - slaPenalty
awningPenalty: CLEAR=0, YELLOW=15, ORANGE=30, RED=50
alertPenalty: min(unackedAlerts × 5, 30)
incidentPenalty: min(openIncidents × 10, 20)
slaPenalty: max(0, (100 - slaCompliance24h) × 0.2)  // max 20
```

**Acceptance:** 12 tests GREEN per TEST_STRATEGY.md

---

## FR-W20-08: W20OperatorWorkflowPipeline

**Description:** Orchestrates all FR-W20-01 through FR-W20-07 modules into a single cohesive pipeline. Consumes ThreatIntelPicture from W19 and produces OperatorWorkflowState for downstream consumers (W13, W14, W21).

**Input:**
- ThreatIntelPicture (from W19)
- Operator actions (forwarded to sub-modules)

**Output:**
- OperatorWorkflowState
- 5 event types (alert_new, sla_breach, escalation_triggered, incident_opened, handover_ready)
- NATS workflow.state publish

**Idempotency:** process() deduplicates alerts by correlationId — calling with identical ThreatIntelPicture twice does not create duplicate records.

**Acceptance:** 13 tests GREEN per TEST_STRATEGY.md
