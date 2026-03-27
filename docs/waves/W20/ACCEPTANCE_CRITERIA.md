# W20 ACCEPTANCE CRITERIA — Operator Workflow Engine

## Wave Acceptance Gate

W20 is ACCEPTED when ALL of the following criteria are met:

```
[ ] 96 W20 tests GREEN (node --test sentinel-w20-*.test.cjs)
[ ] 0 pre-existing test regressions (full 2939-test suite)
[ ] npx tsc --noEmit: 0 errors in src/workflow/
[ ] All 8 FRs implemented with source files in src/workflow/
[ ] HANDOFF.md W21 interface contracts locked
[ ] AuditTrailExporter.verifyChain() passes on 1000-entry chain
```

---

## FR-W20-01: AlertAcknowledgmentEngine

### AC-W20-01-01: Alert FSM completeness
**Given** an Alert is created from a ZoneBreach
**When** the Alert is created
**Then** status = 'NEW', slaAckDeadline = detectedAt + zoneTypeSlaMs, slaResolveDeadline = detectedAt + 1_800_000
**And** transitions array contains exactly zero entries

### AC-W20-01-02: Acknowledgment within SLA
**Given** an Alert in NEW status with airport zone (slaAckMs = 60_000)
**When** acknowledge() is called at T+45_000ms
**Then** status = 'ACKNOWLEDGED'
**And** SlaRecord is created with result='COMPLIANT', elapsedMs=45_000
**And** no sla_breach event is emitted

### AC-W20-01-03: SLA breach detection
**Given** an Alert in NEW status with nuclear zone (slaAckMs = 30_000)
**When** acknowledge() is called at T+35_000ms
**Then** status = 'ACKNOWLEDGED'
**And** SlaRecord is created with result='BREACH', elapsedMs=35_000
**And** sla_breach event is emitted with overrunMs=5_000

### AC-W20-01-04: Invalid transition rejection
**Given** an Alert in RESOLVED status
**When** acknowledge() is called
**Then** throws InvalidTransitionError
**And** Alert status remains RESOLVED (unchanged)

### AC-W20-01-05: Operator identity required
**Given** an Alert in NEW status
**When** acknowledge('', '') is called
**Then** throws ValidationError('operatorId required')

### AC-W20-01-06: Resolution captures outcome
**Given** an Alert in INVESTIGATING status
**When** resolveAlert(id, operatorId, 'FALSE_POSITIVE', note) is called
**Then** status = 'RESOLVED'
**And** last transition.outcome = 'FALSE_POSITIVE'

### AC-W20-01-07: SLA thresholds per zone type
| Zone | Ack SLA | Resolve SLA |
|------|---------|-------------|
| airport | 60_000ms | 1_800_000ms |
| nuclear | 30_000ms | 1_800_000ms |
| military | 30_000ms | 1_800_000ms |
| government | 120_000ms | 1_800_000ms |

---

## FR-W20-02: IncidentManager

### AC-W20-02-01: Alert grouping within window
**Given** two Alerts from zone 'OTP-NORTH' with detectedAt 5 minutes apart
**When** correlate([alert1, alert2]) is called
**Then** exactly one Incident is created containing both alertIds

### AC-W20-02-02: Alert grouping outside window
**Given** two Alerts from zone 'OTP-NORTH' with detectedAt 11 minutes apart
**When** correlate([alert1, alert2]) is called
**Then** two separate Incidents are created

### AC-W20-02-03: Cross-zone isolation
**Given** two Alerts from zones 'OTP-NORTH' and 'OTP-SOUTH' with same timestamp
**When** correlate([alert1, alert2]) is called
**Then** two separate Incidents are created (one per zone)

### AC-W20-02-04: Incident lifecycle follows alert lifecycle
**Given** an Incident with all constituent alerts in RESOLVED status
**When** IncidentManager evaluates completion
**Then** Incident.status transitions to MONITORING
**And** closeIncident() becomes available

### AC-W20-02-05: IncidentReport completeness
**Given** a CLOSED Incident with 3 constituent alerts
**When** generateIncidentReport() is called
**Then** report contains: incidentId, zoneId, duration, alertIds (3), timeline, outcome, escalationsTriggered
**And** duration = closedAt - openedAt

### AC-W20-02-06: maxAwningLevel tracks worst
**Given** an Incident with alerts at YELLOW, then ORANGE, then YELLOW
**When** Incident is updated with each alert
**Then** maxAwningLevel = 'ORANGE' (worst seen, not reset on decrease)

---

## FR-W20-03: EscalationMatrix

### AC-W20-03-01: Airport escalation chain
**Given** airport zone, AWNING=RED, ack SLA breached by >0ms
**When** evaluateEscalation() is called
**Then** returns EscalationAction with authority='AACR_DUTY_OFFICER', level=2

### AC-W20-03-02: Nuclear escalation triggers at ORANGE
**Given** nuclear zone, AWNING=ORANGE
**When** evaluateEscalation() is called at T+0
**Then** returns EscalationAction with authority='SITE_SECURITY_COMMANDER', level=1

### AC-W20-03-03: Military CAOC escalation
**Given** military zone, AWNING=YELLOW, incident open for >20min
**When** evaluateEscalation() is called
**Then** returns EscalationAction with authority='NATO_CAOC_UEDEM', level=3

### AC-W20-03-04: No escalation on CLEAR
**Given** any zone, AWNING=CLEAR
**When** evaluateEscalation() is called
**Then** returns null

### AC-W20-03-05: Escalation event emission
**When** executeEscalation(action) is called
**Then** emits 'escalation_triggered' event with Escalation payload
**And** Escalation.notificationSent = true (async Telegram send attempted)

---

## FR-W20-04: OperatorShiftHandover

### AC-W20-04-01: Handover completeness
**When** generateHandover(operatorId) is called
**Then** ShiftHandover contains: activeIncidents, unresolvedAlerts, zoneStatus, detectionStats24h, pendingAacrNotifications, telegramMessage

### AC-W20-04-02: Handover at shift boundary
**Given** system clock is within 5min of 06:00/14:00/22:00 UTC+2
**When** checkShiftBoundary() is called
**Then** returns true

### AC-W20-04-03: Telegram message format
**When** generateHandover() is called
**Then** telegramMessage starts with "SHIFT HANDOVER"
**And** contains active incident count
**And** contains unresolved alert count
**And** contains zone status summary
**And** length < 4096 characters (Telegram message limit)

### AC-W20-04-04: Handover acknowledgment
**Given** a ShiftHandover with acknowledged=false
**When** acknowledgeHandover(id, incomingOperatorId) is called
**Then** acknowledged=true, acknowledgedBy=incomingOperatorId, acknowledgedAt is set

---

## FR-W20-05: SlaComplianceTracker

### AC-W20-05-01: Compliance computation accuracy
**Given** 8 COMPLIANT and 2 BREACH records in rolling window
**When** computeCompliance() is called
**Then** ackCompliance = 80

### AC-W20-05-02: Rolling window correctness
**Given** 5 BREACH records from 25 hours ago and 5 COMPLIANT records from 1 hour ago
**When** computeCompliance() is called
**Then** ackCompliance = 100 (old records excluded)

### AC-W20-05-03: SLA breach event precision
**Given** nuclear zone alert acknowledged at T+35_000ms (SLA = 30_000ms)
**When** SlaBreachEvent is emitted
**Then** overrunMs = 5_000

---

## FR-W20-06: AuditTrailExporter

### AC-W20-06-01: Hash chain integrity
**Given** a chain of N AuditEntries
**When** verifyChain() is called
**Then** returns {valid: true}

### AC-W20-06-02: Tamper detection
**Given** an AuditEntry at position 5 has its action.operatorId mutated
**When** verifyChain() is called
**Then** returns {valid: false, firstInvalidAt: 5}

### AC-W20-06-03: Genesis entry
**Given** AuditTrailExporter is freshly initialized
**When** first appendEntry() is called
**Then** AuditEntry.prevHash = '0'.repeat(64)

### AC-W20-06-04: GDPR erasure preserves chain
**Given** operator 'OP-42' has 5 entries in the chain
**When** eraseOperator('OP-42') is called
**Then** all 5 entries still exist
**And** operator_id in each is '[REDACTED-GDPR-ART17-{hash}]'
**And** verifyChain() still returns {valid: true} (hashes updated coherently)

### AC-W20-06-05: CSV export format
**When** exportCSV({}) is called
**Then** first row = 'sequence_no,ts_iso,operator_id,action_type,resource_type,resource_id,hash'
**And** each subsequent row has exactly 7 comma-separated fields

---

## FR-W20-07: MultiSiteOperatorView

### AC-W20-07-01: Worst zone drives overall score
**Given** three zones with healthScores 90, 45, 80
**When** getOperatorView() is called
**Then** overallHealthScore = 45

### AC-W20-07-02: Zone sort order
**When** getOperatorView() is called
**Then** zones are sorted ascending by healthScore (lowest/worst first)

### AC-W20-07-03: AWNING=RED health penalty
**Given** a zone with AWNING=RED, 0 unacked alerts, 0 incidents, 100% SLA
**When** healthScore is computed
**Then** healthScore ≤ 50 (RED penalty = 50)

---

## FR-W20-08: W20OperatorWorkflowPipeline

### AC-W20-08-01: Idempotent alert ingest
**Given** process(tip) called twice with identical ThreatIntelPicture
**When** second call is processed
**Then** no duplicate Alerts are created (correlationId dedup)
**And** OperatorWorkflowState.alerts count is unchanged

### AC-W20-08-02: Event emission completeness
**Given** a ThreatIntelPicture with 2 correlated AWNING=RED breaches and expired SLA
**When** process(tip) is called
**Then** events emitted in order: 'alert_new'×2, 'incident_opened'×1, 'sla_breach'×2, 'escalation_triggered'×1

### AC-W20-08-03: OperatorWorkflowState structure
**When** process(tip) returns
**Then** result has keys: incidents, alerts, escalations, slaStatus, handoverDue, generatedAt
**And** all arrays are non-null (may be empty)
**And** slaStatus has keys: ackCompliance, resolveCompliance, aacrNotifCompliance

---

## Non-Functional Acceptance Criteria

| Criterion | Threshold | Measurement |
|-----------|-----------|-------------|
| Alert FSM transition latency | <10ms | jest fake timer, synchronous test |
| SlaComplianceTracker.computeCompliance() for 1000 records | <5ms | performance.now() |
| AuditTrailExporter.appendEntry() | <20ms | performance.now() |
| MultiSiteOperatorView.getOperatorView() for 20 zones | <50ms | performance.now() |
| W20 memory footprint (1000 alerts, 100 incidents) | <30MB | process.memoryUsage().heapUsed |
| TypeScript compilation | 0 errors | npx tsc --noEmit |
