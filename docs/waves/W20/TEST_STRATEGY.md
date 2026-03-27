# W20 TEST STRATEGY — Operator Workflow Engine

## Test Framework

- Runtime: Node.js (CJS, `.test.cjs`)
- Framework: Node `assert` (consistent with existing APEX-SENTINEL test suite)
- Execution: `node --test infra/__tests__/sentinel-w20-*.test.cjs`
- Coverage target: ≥80% branches/functions/lines/statements
- Total W20 tests: 96

---

## Test File Structure

```
infra/__tests__/
├── sentinel-w20-alert-acknowledgment.test.cjs    FR-W20-01  13 tests
├── sentinel-w20-incident-manager.test.cjs        FR-W20-02  14 tests
├── sentinel-w20-escalation-matrix.test.cjs       FR-W20-03  12 tests
├── sentinel-w20-shift-handover.test.cjs          FR-W20-04  10 tests
├── sentinel-w20-sla-compliance-tracker.test.cjs  FR-W20-05  11 tests
├── sentinel-w20-audit-trail-exporter.test.cjs    FR-W20-06  11 tests
├── sentinel-w20-multi-site-operator-view.test.cjs FR-W20-07 12 tests
└── sentinel-w20-workflow-pipeline.test.cjs       FR-W20-08  13 tests
```

---

## FR-W20-01: AlertAcknowledgmentEngine (13 tests)

```
describe('FR-W20-01: AlertAcknowledgmentEngine') {
  01: ingestAlert creates Alert in NEW status with correct SLA deadlines
  02: acknowledge transitions NEW → ACKNOWLEDGED within SLA → COMPLIANT SlaRecord
  03: acknowledge transitions NEW → ACKNOWLEDGED after SLA → SLA_BREACH SlaRecord + sla_breach event
  04: acknowledge requires non-empty operatorId → throws ValidationError
  05: acknowledge on non-NEW alert → throws InvalidTransitionError
  06: beginInvestigation transitions ACKNOWLEDGED → INVESTIGATING with actionNote
  07: beginInvestigation requires non-empty actionNote → throws ValidationError
  08: resolveAlert transitions INVESTIGATING → RESOLVED with outcome
  09: resolveAlert records RESOLVE SlaRecord (COMPLIANT if within 30min)
  10: resolveAlert with outcome=FALSE_POSITIVE records correctly
  11: getActiveAlerts filters by status correctly
  12: getActiveAlerts filters by zoneType correctly
  13: duplicate alert (same correlationId) → throws DuplicateAlertError
}
```

**Test data patterns:**
- Airport zone: slaAckDeadline = detectedAt + 60_000
- Nuclear zone: slaAckDeadline = detectedAt + 30_000
- Military zone: slaAckDeadline = detectedAt + 30_000
- Government zone: slaAckDeadline = detectedAt + 120_000

**Clock injection:** All tests inject `clockFn: () => number` to control time.

---

## FR-W20-02: IncidentManager (14 tests)

```
describe('FR-W20-02: IncidentManager') {
  01: correlate single alert creates new Incident in OPEN status
  02: correlate two alerts from same zone within 10min → grouped into same Incident
  03: correlate two alerts from same zone 11min apart → separate Incidents
  04: correlate alerts from different zones → separate Incidents
  05: incident transitions OPEN → ACTIVE when first constituent alert is ACKNOWLEDGED
  06: incident transitions ACTIVE → MONITORING when all alerts are INVESTIGATING
  07: incident transitions MONITORING → CLOSED when all alerts are RESOLVED
  08: closeIncident with outcome='DRONE_CONFIRMED' generates correct IncidentReport
  09: IncidentReport includes correct timeline with all transitions
  10: IncidentReport.slaCompliant = true when all constituent alerts acked within SLA
  11: IncidentReport.slaCompliant = false when any constituent alert breached SLA
  12: getActiveIncidents returns only non-CLOSED incidents
  13: getActiveIncidents filter by assignedOperator works
  14: maxAwningLevel on Incident tracks worst level across all constituent alerts
}
```

---

## FR-W20-03: EscalationMatrix (12 tests)

```
describe('FR-W20-03: EscalationMatrix') {
  01: airport AWNING=RED + ack SLA breach → evaluateEscalation returns Level 2 (AACR)
  02: airport AWNING=CLEAR → evaluateEscalation returns null
  03: nuclear AWNING=ORANGE → evaluateEscalation returns Level 1 (Site Security)
  04: nuclear AWNING=ORANGE + 10min → evaluateEscalation returns Level 2 (SNN)
  05: military AWNING=YELLOW → evaluateEscalation returns Level 1 (Base Commander)
  06: military AWNING=YELLOW + 20min → evaluateEscalation returns Level 3 (NATO CAOC)
  07: government AWNING=RED → evaluateEscalation returns Level 1 (SPP)
  08: executeEscalation creates Escalation record and emits escalation_triggered
  09: acknowledgeEscalation sets acknowledged=true on Escalation
  10: getEscalationChain returns correct chain for each zone type (4 assertions)
  11: manual escalation (triggeredBy=operatorId) creates Escalation with trigger=MANUAL
  12: subsequent escalation of already-escalated incident increments level correctly
}
```

---

## FR-W20-04: OperatorShiftHandover (10 tests)

```
describe('FR-W20-04: OperatorShiftHandover') {
  01: generateHandover produces ShiftHandover with all required fields
  02: generateHandover includes all activeIncidents (non-CLOSED)
  03: generateHandover includes all unresolvedAlerts (not RESOLVED/ARCHIVED)
  04: generateHandover detectionStats24h counts correctly
  05: generateHandover pendingAacrNotifications lists alerts with aacrNotificationRequired=true
  06: ShiftHandover.telegramMessage is non-empty formatted string
  07: generateHandover emits handover_ready event
  08: acknowledgeHandover sets acknowledged=true and acknowledgedBy
  09: checkShiftBoundary returns true at shift boundary (06:00/14:00/22:00 UTC+2)
  10: generateHandover appends HANDOVER_GENERATED AuditEntry
}
```

---

## FR-W20-05: SlaComplianceTracker (11 tests)

```
describe('FR-W20-05: SlaComplianceTracker') {
  01: recordEvent COMPLIANT increments compliant count
  02: recordEvent BREACH increments breach count and emits sla_breach
  03: computeCompliance returns 100 when all records COMPLIANT
  04: computeCompliance returns 0 when all records BREACH
  05: computeCompliance returns 75 for 3:1 compliant:breach ratio
  06: rolling 24h window excludes records older than 24h
  07: checkSla on alert within ack SLA returns ackBreached=false
  08: checkSla on alert past ack SLA returns ackBreached=true, remainingAckMs<0
  09: checkSla on alert within resolve SLA returns resolveBreached=false
  10: SlaBreachEvent includes correct overrunMs calculation
  11: rolling window evicts oldest 10% when at 10_000 record capacity
}
```

---

## FR-W20-06: AuditTrailExporter (11 tests)

```
describe('FR-W20-06: AuditTrailExporter') {
  01: appendEntry creates AuditEntry with correct SHA-256 hash
  02: appendEntry genesis entry has prevHash = '0'.repeat(64)
  03: appendEntry second entry prevHash = first entry hash
  04: verifyChain returns {valid: true} on unmodified chain
  05: verifyChain returns {valid: false, firstInvalidAt: N} on tampered entry
  06: exportJSON filters by operatorId correctly
  07: exportJSON filters by resourceId correctly
  08: exportJSON filters by since/until correctly
  09: exportCSV produces valid CSV with correct column headers
  10: eraseOperator replaces operatorId with REDACTED token in all entries
  11: eraseOperator does NOT delete entries (chain integrity preserved)
}
```

---

## FR-W20-07: MultiSiteOperatorView (12 tests)

```
describe('FR-W20-07: MultiSiteOperatorView') {
  01: addZone registers zone in site map
  02: getOperatorView returns all zones sorted by healthScore ascending (worst first)
  03: healthScore: AWNING=RED zone has score ≤50
  04: healthScore: AWNING=CLEAR + 0 unacked alerts = 100
  05: overallHealthScore = MIN of all zone health scores
  06: getOperatorView filter by zoneType returns only matching zones
  07: getOperatorView totalActiveIncidents sums correctly across zones
  08: getOperatorView totalUnacknowledgedAlerts sums correctly
  09: assignOperator sets zone assignment correctly
  10: getOperatorView shows assignedToMe=true for operator's assigned zones
  11: updateZoneState updates awning and recalculates healthScore
  12: getOperatorView filter by minAwningLevel excludes lower-severity zones
}
```

---

## FR-W20-08: W20OperatorWorkflowPipeline (13 tests)

```
describe('FR-W20-08: W20OperatorWorkflowPipeline') {
  01: process(tip) with one ZoneBreach creates one Alert → returns OperatorWorkflowState
  02: process(tip) emits alert_new for each new Alert
  03: process(tip) with two correlated breaches creates one Incident → emits incident_opened
  04: process(tip) with AWNING=RED + expired SLA → emits escalation_triggered
  05: process(tip) with AWNING=CLEAR → no escalation triggered
  06: slaStatus in OperatorWorkflowState reflects SlaComplianceTracker.computeCompliance()
  07: handoverDue=true when shift boundary is within 5min
  08: handoverDue=false when not near shift boundary
  09: process() at shift boundary emits handover_ready
  10: all operator actions via pipeline are captured in AuditTrailExporter
  11: OperatorWorkflowState.escalations includes all triggered Escalations
  12: multi-zone tip creates Alerts in correct zones without cross-contamination
  13: process() on identical tip twice does NOT create duplicate Alerts (idempotent ingest)
}
```

---

## Integration Test: W19→W20 End-to-End

In addition to unit tests, one integration test file validates the full pipeline:

```
infra/__tests__/sentinel-w20-integration.test.cjs
  E2E-01: Full flow: ZoneBreach → Alert → Incident → Escalation → Handover
  E2E-02: AACR notification SLA compliance flow
  E2E-03: Multi-zone airport+nuclear simultaneous detection
```

---

## Test Data Factory

All W20 tests share a factory module `sentinel-w20-fixtures.cjs`:

```javascript
// Standard fixtures
makeZoneBreach(override = {}) → ZoneBreach
makeAlert(override = {}) → Alert
makeIncident(override = {}) → Incident
makeThreatIntelPicture(override = {}) → ThreatIntelPicture
makeSlaBreachEvent(override = {}) → SlaBreachEvent

// Clock injection
makeClock(fixedMs) → { now: () => fixedMs }
advanceClock(clock, deltaMs) → updates clock
```

---

## Regression Integration

W20 tests run as part of the existing sentinel test suite. Full suite command:

```bash
node --test infra/__tests__/sentinel-w*.test.cjs
```

W20 must not break any of the 2939 existing tests. Coverage check:

```bash
node --test --experimental-test-coverage infra/__tests__/sentinel-w20-*.test.cjs
```

---

## Failure Criteria

A W20 implementation commit is REJECTED if:
- Any of the 96 W20 tests fail
- Any of the 2939 pre-existing tests regress
- Coverage <80% on any W20 source file
- `npx tsc --noEmit` reports errors in `src/workflow/`
