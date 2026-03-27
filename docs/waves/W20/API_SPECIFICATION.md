# W20 API SPECIFICATION — Operator Workflow Engine

## API Style

W20 exposes a TypeScript class API (no HTTP server — W20 is an embedded module). External consumers (W14 dashboard, W21 UI) communicate via:
1. **Method calls** on W20OperatorWorkflowPipeline instance (same process)
2. **EventEmitter events** for push notifications
3. **NATS subject `workflow.state`** for cross-process consumers

For W21 HTTP/REST surface, see HANDOFF.md.

---

## AlertAcknowledgmentEngine API

### `ingestAlert(zoneBreach: ZoneBreach, awningLevel: AwningLevel): Alert`

Creates a new Alert in NEW status from a W19 ZoneBreach.

**Parameters:**
- `zoneBreach`: ZoneBreach from W19 ThreatIntelPicture
- `awningLevel`: AwningLevel from W19 for the zone

**Returns:** Alert (immediately in NEW status, SLA deadlines computed)

**Side effects:**
- Emits `alert_new` event with Alert payload
- Starts SLA countdown timer
- Appends AuditEntry(INCIDENT_CREATED)

**Errors:**
- `DuplicateAlertError`: if `zoneBreach.correlationId` already exists in alertStore

---

### `acknowledge(alertId: string, operatorId: string, actionNote?: string): Alert`

Transitions Alert: NEW → ACKNOWLEDGED.

**Parameters:**
- `alertId`: UUID of the Alert
- `operatorId`: authenticated operator identifier
- `actionNote`: optional initial action description

**Returns:** Alert (updated)

**Side effects:**
- Records SlaRecord (ACK, elapsed, result=COMPLIANT|BREACH)
- Appends AuditEntry(ALERT_ACKNOWLEDGED)
- If SLA already breached: emits `sla_breach` event

**Errors:**
- `AlertNotFoundError`: alertId not in store
- `InvalidTransitionError`: Alert not in NEW status
- `ValidationError`: operatorId is empty

---

### `beginInvestigation(alertId: string, operatorId: string, actionNote: string): Alert`

Transitions Alert: ACKNOWLEDGED → INVESTIGATING.

**Parameters:**
- `alertId`: UUID
- `operatorId`: authenticated operator
- `actionNote`: required — what action is being taken

**Returns:** Alert (updated)

**Errors:**
- `InvalidTransitionError`: Alert not in ACKNOWLEDGED status
- `ValidationError`: actionNote is empty

---

### `resolveAlert(alertId: string, operatorId: string, outcome: AlertOutcome, resolutionNote: string): Alert`

Transitions Alert: INVESTIGATING → RESOLVED.

**Parameters:**
- `alertId`: UUID
- `operatorId`: authenticated operator
- `outcome`: 'DRONE_CONFIRMED' | 'FALSE_POSITIVE' | 'UNRESOLVED'
- `resolutionNote`: required description of resolution

**Returns:** Alert (updated)

**Side effects:**
- Records SlaRecord (RESOLVE)
- Appends AuditEntry(ALERT_RESOLVED)
- If parent Incident exists: triggers IncidentManager.checkIncidentCompletion()

---

### `getAlert(alertId: string): Alert | undefined`

Returns current Alert state.

---

### `getActiveAlerts(filter?: AlertFilter): Alert[]`

Returns all alerts NOT in ARCHIVED status.

**Filter options:**
```typescript
interface AlertFilter {
  zoneId?: string;
  zoneType?: ZoneType;
  status?: AlertStatus[];
  awningLevel?: AwningLevel[];
  operatorId?: string;
  since?: number;     // epoch ms
}
```

---

## IncidentManager API

### `correlate(alerts: Alert[]): Incident[]`

Groups alerts into incidents using 10-minute sliding window.

**Returns:** Array of Incidents (new and updated)

**Side effects:**
- Emits `incident_opened` for each new Incident
- Updates `incident.alertIds` for existing incidents

---

### `getIncident(incidentId: string): Incident | undefined`

---

### `getActiveIncidents(filter?: IncidentFilter): Incident[]`

**Filter options:**
```typescript
interface IncidentFilter {
  zoneId?: string;
  status?: IncidentStatus[];
  maxAwningLevel?: AwningLevel;
  assignedOperator?: string;
}
```

---

### `closeIncident(incidentId: string, operatorId: string, outcome: IncidentOutcome): IncidentReport`

Transitions: MONITORING → CLOSED. Generates IncidentReport.

**Side effects:**
- Appends AuditEntry(INCIDENT_CLOSED)
- Stores IncidentReport on Incident.report

---

### `generateIncidentReport(incidentId: string): IncidentReport`

Generates report for any incident (does not change status).

---

## EscalationMatrix API

### `evaluateEscalation(incident: Incident, slaBreach: SlaBreachEvent | null): EscalationAction | null`

Evaluates whether escalation is needed.

**Returns:** EscalationAction if escalation should be triggered, null otherwise.

```typescript
interface EscalationAction {
  incidentId: string;
  currentLevel: number;
  nextLevel: number;
  authority: EscalationAuthority;
  trigger: 'SLA_BREACH' | 'AWNING_LEVEL' | 'MANUAL';
  message: string;   // pre-formatted notification message
}
```

---

### `executeEscalation(action: EscalationAction, triggeredBy: string): Escalation`

Creates and records an Escalation.

**Side effects:**
- Emits `escalation_triggered` event
- Appends AuditEntry(ESCALATION_TRIGGERED)
- Sends notification via W13 Telegram (if configured)

---

### `getEscalationChain(zoneType: ZoneType): EscalationChain`

Returns the escalation chain definition for a zone type.

---

### `acknowledgeEscalation(escalationId: string, operatorId: string): Escalation`

Records that an authority has acknowledged the escalation notification.

---

## SlaComplianceTracker API

### `recordEvent(alertId: string, zoneType: ZoneType, eventType: SlaEventType, elapsedMs: number): SlaRecord`

Records an SLA measurement.

---

### `computeCompliance(): SlaStatus`

Returns rolling 24h compliance percentages.

---

### `checkSla(alert: Alert): SlaCheckResult`

Checks current SLA status for a specific alert.

```typescript
interface SlaCheckResult {
  ackDeadlineMs: number;
  ackElapsedMs: number;
  ackBreached: boolean;
  resolveDeadlineMs: number;
  resolveElapsedMs: number;
  resolveBreached: boolean;
  remainingAckMs: number;   // negative if breached
  remainingResolveMs: number;
}
```

---

### Event: `sla_breach`

```typescript
// emitted when any SLA is exceeded
pipeline.on('sla_breach', (event: SlaBreachEvent) => { ... });
```

---

## AuditTrailExporter API

### `appendEntry(action: OperatorAction): AuditEntry`

Appends a new entry to the hash chain.

---

### `verifyChain(): { valid: boolean; firstInvalidAt?: number }`

Verifies SHA-256 chain integrity. Returns invalid position if tampered.

---

### `exportJSON(filter: AuditFilter): AuditEntry[]`

```typescript
interface AuditFilter {
  operatorId?: string;
  resourceId?: string;
  actionTypes?: OperatorActionType[];
  since?: number;    // epoch ms
  until?: number;    // epoch ms
}
```

---

### `exportCSV(filter: AuditFilter): string`

CSV format for AACR regulatory submission:
```
sequence_no,ts_iso,operator_id,action_type,resource_type,resource_id,hash
```

---

### `getChainHead(): string`

Returns current SHA-256 chain head hash.

---

## MultiSiteOperatorView API

### `addZone(zone: ZoneConfig): void`

```typescript
interface ZoneConfig {
  zoneId: string;
  zoneType: ZoneType;
  displayName: string;
  assignedOperatorIds: string[];
}
```

---

### `updateZoneState(zoneId: string, update: ZoneStateUpdate): void`

```typescript
interface ZoneStateUpdate {
  currentAwning?: AwningLevel;
  activeIncidentCount?: number;
  unacknowledgedAlertCount?: number;
  slaCompliance24h?: number;
}
```

---

### `getOperatorView(operatorId: string, filter?: ZoneFilter): OperatorViewState`

```typescript
interface ZoneFilter {
  zoneTypes?: ZoneType[];
  minAwningLevel?: AwningLevel;
}

interface ZoneViewEntry {
  zoneId: string;
  zoneType: ZoneType;
  displayName: string;
  currentAwning: AwningLevel;
  activeIncidents: number;
  unacknowledgedAlerts: number;
  slaCompliance24h: number;
  healthScore: number;          // 0–100
  assignedToMe: boolean;
}

interface OperatorViewState {
  zones: ZoneViewEntry[];             // sorted: worst health first
  totalActiveIncidents: number;
  totalUnacknowledgedAlerts: number;
  overallHealthScore: number;         // MIN of zone health scores
  generatedAt: number;                // epoch ms
}
```

---

## OperatorShiftHandover API

### `generateHandover(outgoingOperatorId: string): ShiftHandover`

Generates a shift handover briefing.

**Side effects:**
- Emits `handover_ready` event
- Appends AuditEntry(HANDOVER_GENERATED)

---

### `acknowledgeHandover(handoverId: string, incomingOperatorId: string): ShiftHandover`

Records incoming operator acknowledgment.

**Side effects:**
- Appends AuditEntry(HANDOVER_ACKNOWLEDGED)

---

## W20OperatorWorkflowPipeline API

### `process(tip: ThreatIntelPicture): OperatorWorkflowState`

Main entry point. Processes W19 output into operator workflow state.

```typescript
interface OperatorWorkflowState {
  incidents: Incident[];
  alerts: Alert[];
  escalations: Escalation[];
  slaStatus: SlaStatus;
  handoverDue: boolean;
  generatedAt: number;
}
```

---

### Events

```typescript
pipeline.on('alert_new', (alert: Alert) => {})
pipeline.on('sla_breach', (event: SlaBreachEvent) => {})
pipeline.on('escalation_triggered', (escalation: Escalation) => {})
pipeline.on('incident_opened', (incident: Incident) => {})
pipeline.on('handover_ready', (handover: ShiftHandover) => {})
```

---

## NATS Interface

### Subject: `workflow.state`

Published every 30 seconds (or on any significant state change).

```typescript
// payload on workflow.state
{
  ts: number;
  incidentCount: number;
  activeAlertCount: number;
  unackedAlertCount: number;
  slaCompliance: number;
  worstAwning: AwningLevel;
  handoverDue: boolean;
}
```

### Subject: `workflow.escalation`

Published on each escalation trigger.

```typescript
{
  ts: number;
  incidentId: string;
  zoneType: ZoneType;
  level: number;
  authority: EscalationAuthority;
  trigger: string;
}
```
