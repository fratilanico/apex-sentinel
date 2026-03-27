# W20 HANDOFF — W20 → W21 Interface Contracts

## Handoff Summary

W20 (Operator Workflow Engine) delivers all human-operator coordination logic as a headless TypeScript module. W21 (Production UI) consumes W20's output to render the operator dashboard in a web browser. This document defines the exact interface contracts that W21 must consume without modification.

---

## W20 Completion Criteria Before W21 Can Start

```
[ ] 96/96 W20 tests GREEN
[ ] 3035/3035 full suite GREEN
[ ] src/workflow/types.ts locked (no breaking changes after W21 starts)
[ ] OperatorWorkflowState type stabilized
[ ] All EventEmitter events documented and stable
[ ] NATS workflow.state subject live on all edge nodes
[ ] W14 SSE integration verified (workflow state flowing to dashboard SSE)
```

---

## Interface Contract 1: OperatorWorkflowState

This is the primary data structure W21 renders. It is updated on every `process()` call.

```typescript
// LOCKED — W21 must not require changes to this type
interface OperatorWorkflowState {
  incidents: Incident[];           // all non-CLOSED incidents
  alerts: Alert[];                 // all non-ARCHIVED alerts
  escalations: Escalation[];       // all escalations from last 24h
  slaStatus: SlaStatus;            // rolling 24h compliance
  handoverDue: boolean;            // true when within 5min of shift boundary
  generatedAt: number;             // epoch ms
}
```

W21 receives this via:
1. **W14 SSE stream** — real-time push on state changes
2. **HTTP GET /api/workflow/state** — initial page load (W21 REST endpoint wrapping W20)

---

## Interface Contract 2: EventEmitter API

W21's server-side event bridge subscribes to these events to push updates to connected browsers via Server-Sent Events:

```typescript
pipeline.on('alert_new', (alert: Alert) => {
  // Push to browser: show new alert notification toast
  // Expected frequency: 0–20 per hour in normal operation
})

pipeline.on('sla_breach', (event: SlaBreachEvent) => {
  // Push to browser: SLA breach banner with countdown
  // Expected frequency: rare (<5% of alerts)
})

pipeline.on('escalation_triggered', (escalation: Escalation) => {
  // Push to browser: escalation panel update
  // Expected frequency: very rare (<1% of alerts)
})

pipeline.on('incident_opened', (incident: Incident) => {
  // Push to browser: new incident in incident list
  // Expected frequency: lower than alert_new (grouping reduces count)
})

pipeline.on('handover_ready', (handover: ShiftHandover) => {
  // Push to browser: handover modal with briefing content
  // Expected frequency: 3× per day
})
```

---

## Interface Contract 3: Operator Action Methods

W21's API layer calls these methods on behalf of authenticated operators. W21 must implement an authentication layer that resolves HTTP session → operatorId before calling W20.

```typescript
// W21 calls these on user action
pipeline.alertEngine.acknowledge(alertId, operatorId, actionNote?)
pipeline.alertEngine.beginInvestigation(alertId, operatorId, actionNote)
pipeline.alertEngine.resolveAlert(alertId, operatorId, outcome, resolutionNote)

pipeline.incidentManager.closeIncident(incidentId, operatorId, outcome)
pipeline.incidentManager.generateIncidentReport(incidentId)  // returns IncidentReport

pipeline.escalationMatrix.acknowledgeEscalation(escalationId, operatorId)
pipeline.escalationMatrix.executeEscalation(action, operatorId)  // manual escalation

pipeline.shiftHandover.generateHandover(outgoingOperatorId)
pipeline.shiftHandover.acknowledgeHandover(handoverId, incomingOperatorId)

pipeline.auditExporter.exportJSON(filter)
pipeline.auditExporter.exportCSV(filter)

pipeline.multiSiteView.getOperatorView(operatorId, filter?)
pipeline.multiSiteView.assignOperator(zoneId, operatorId)
```

---

## Interface Contract 4: Alert and Incident Read API

W21 renders these as lists/detail views:

```typescript
pipeline.alertEngine.getAlert(alertId)             → Alert | undefined
pipeline.alertEngine.getActiveAlerts(filter?)      → Alert[]

pipeline.incidentManager.getIncident(incidentId)   → Incident | undefined
pipeline.incidentManager.getActiveIncidents(filter?)→ Incident[]

pipeline.slaTracker.computeCompliance()             → SlaStatus
pipeline.slaTracker.checkSla(alert)                 → SlaCheckResult

pipeline.multiSiteView.getOperatorView(operatorId)  → OperatorViewState
```

---

## Interface Contract 5: NATS Subjects for Cross-Process Consumers

W21 server may run in a separate process from the W20 module. NATS subjects provide cross-process state access:

```
workflow.state     — full OperatorWorkflowState summary (every 30s)
workflow.escalation — per-escalation event payload
```

W21 subscribes to `workflow.state` to maintain a local cache for fast HTTP response.

---

## W21 Responsibilities (NOT W20)

W20 does NOT provide:
- HTTP endpoints (W21 implements REST/GraphQL wrapping W20 methods)
- Authentication / session management (W21 implements, resolves to operatorId)
- Browser rendering (W21 implements React/Svelte components)
- Mobile push notifications (W21 scope, W20 only provides EventEmitter + Telegram)
- Historical analytics charts (W22 scope)
- PDF report generation (W21 scope — W20 provides the data, W21 formats the PDF)
- Drag-and-drop zone assignment (W21 UI feature, calls W20's assignOperator())

---

## Breaking Change Policy

Any change to types in `src/workflow/types.ts` after W21 starts requires:
1. W21 team review and explicit sign-off
2. New type version with backward-compatible migration
3. Test update across both W20 and W21 test suites

Fields that will NOT change (W21 depends on these):
- `Alert.id`, `Alert.status`, `Alert.awningLevel`, `Alert.threatScore`, `Alert.zoneId`
- `Incident.id`, `Incident.status`, `Incident.alertIds`, `Incident.maxAwningLevel`
- `Escalation.id`, `Escalation.authority`, `Escalation.level`
- `OperatorWorkflowState` top-level keys

---

## W21 Suggested Architecture

Based on W20's interface contracts, W21's recommended architecture:

```
W21 Production UI
├── Next.js (SSR + API routes)
│     ├── /api/workflow/state    → wraps pipeline.process() output
│     ├── /api/alerts/[id]/ack   → calls pipeline.alertEngine.acknowledge()
│     ├── /api/incidents/[id]    → calls pipeline.incidentManager.getIncident()
│     ├── /api/audit/export      → calls pipeline.auditExporter.exportCSV()
│     └── /api/sse               → wraps W14 SSE stream with auth
├── React components
│     ├── AlertList              → renders Alert[] sorted by awningLevel
│     ├── IncidentPanel          → renders Incident detail with timeline
│     ├── EscalationBanner       → renders Escalation chain progress
│     ├── SlaCountdown           → renders SlaCheckResult countdown timer
│     ├── MultiSiteMap           → renders OperatorViewState on Leaflet map
│     └── HandoverModal          → renders ShiftHandover.telegramMessage formatted
└── Auth
      ├── NextAuth.js or similar
      └── operatorId = session.user.operatorToken (set by employer's SSO)
```

---

## W21 Start Criteria

W21 wave:init may begin only when:
1. `src/workflow/types.ts` is committed and stable
2. `W20OperatorWorkflowPipeline` constructor is importable from `dist/workflow/`
3. All 5 EventEmitter events are documented with TypeScript payload types
4. This HANDOFF.md is reviewed and signed off by W21 implementation lead
