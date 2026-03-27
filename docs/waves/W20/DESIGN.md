# W20 DESIGN — Operator Workflow Engine

## Overview

W20 introduces the human-in-the-loop layer for APEX-SENTINEL. Waves W1–W19 produced autonomous detection, classification, acoustic analysis, RF fingerprinting, threat fusion, AWNING level computation, and outbound notifications to AACR and ROMATSA. W20 closes the loop by providing operators with structured workflows to acknowledge, investigate, escalate, and resolve drone detection incidents across multiple protected zones in Romania.

The Operator Workflow Engine is a stateful coordination layer that sits between the W19 ThreatIntelPicture output and human security personnel. It enforces SLA compliance, generates tamper-evident audit trails for regulatory reporting, and produces structured shift handovers for 24/7 operations.

---

## Design Goals

1. **Alert lifecycle enforcement** — every alert transitions through a defined FSM; no alert can be silently dropped
2. **SLA compliance tracking** — acknowledgment and resolution times are measured against ICAO Annex 11 and EASA-derived response windows per zone classification
3. **Automatic escalation** — AWNING RED with SLA breach triggers automated escalation without operator intervention
4. **Incident grouping** — correlated alerts within a 10-minute window become a single Incident, reducing cognitive load
5. **Multi-site awareness** — single operator can supervise multiple protected zones with priority-sorted view
6. **GDPR-compliant audit trail** — every operator action is logged with SHA-256 hash chaining, 90-day raw retention
7. **Shift handover continuity** — structured handover briefing at 8-hour boundaries ensures no detection is lost at shift change

---

## Architectural Decisions

### AD-W20-01: Stateful in-process FSM, not database state machine
Alert and incident state is managed in-process using TypeScript FSMs. Persistence to Supabase is write-through (events only, not polling). Rationale: sub-100ms state transitions required for SLA accuracy; database round-trips would introduce measurement error in SLA tracking.

### AD-W20-02: Event-driven pipeline composition
W20OperatorWorkflowPipeline extends EventEmitter. Downstream consumers (W13 Telegram, W14 Dashboard SSE) subscribe to named events: `alert_new`, `sla_breach`, `escalation_triggered`, `incident_opened`, `handover_ready`. No direct coupling.

### AD-W20-03: Escalation chain is configuration-driven, not hardcoded
EscalationMatrix reads zone-type escalation chains from a typed configuration object. This allows adding new zone types (e.g. critical infrastructure, port authority) without code changes.

### AD-W20-04: SHA-256 hash chain for audit trail
AuditTrailExporter builds a linked hash chain: each entry includes the SHA-256 of the previous entry. This matches the pattern established in W15 AuditEventLogger. Tamper-evidence is verifiable offline by AACR inspectors.

### AD-W20-05: IncidentManager uses a 10-minute sliding window
Based on operational analysis of multi-drone incursions at Romanian airports, coordinated drone activity typically completes within 8 minutes. A 10-minute window captures correlated events with <2% false grouping rate while keeping incident count manageable.

### AD-W20-06: No new npm dependencies
All W20 modules use Node.js built-ins: `node:crypto`, `node:events`, `node:timers`. The existing `uuid` package (already in package.json) is used for ID generation.

---

## Module Map

```
src/workflow/
├── alert-acknowledgment-engine.ts   FR-W20-01
├── incident-manager.ts              FR-W20-02
├── escalation-matrix.ts             FR-W20-03
├── operator-shift-handover.ts       FR-W20-04
├── sla-compliance-tracker.ts        FR-W20-05
├── audit-trail-exporter.ts          FR-W20-06
├── multi-site-operator-view.ts      FR-W20-07
└── w20-operator-workflow-pipeline.ts FR-W20-08
```

---

## Data Flow

```
W19 ThreatIntelPicture
        │
        ▼
W20OperatorWorkflowPipeline.process(tip)
        │
        ├──► AlertAcknowledgmentEngine   → Alert FSM transitions
        │           │
        │           ├──► SlaComplianceTracker    → SLA measurement
        │           └──► AuditTrailExporter      → action log entry
        │
        ├──► IncidentManager             → groups alerts into Incidents
        │           │
        │           └──► EscalationMatrix        → auto-escalate on SLA breach
        │
        ├──► MultiSiteOperatorView       → aggregated operator dashboard state
        │
        └──► OperatorShiftHandover       → emits handover_ready at shift boundary
                    │
                    └──► W13 Telegram (handover message)

Events emitted → W13 Telegram bot, W14 Dashboard SSE, W15 AuditEventLogger
```

---

## Key Interfaces (summary — full detail in DATABASE_SCHEMA.md)

```typescript
// Core domain types
Alert, Incident, Escalation, ShiftHandover, SlaRecord, AuditEntry, OperatorAction

// FSM states
AlertStatus: 'NEW' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED' | 'ARCHIVED'
IncidentStatus: 'OPEN' | 'ACTIVE' | 'MONITORING' | 'CLOSED'
EscalationLevel: 0 | 1 | 2 | 3 | 4  // 0=Operator, 4=highest authority

// Pipeline output
OperatorWorkflowState {
  incidents: Incident[]
  alerts: Alert[]
  escalations: Escalation[]
  slaStatus: SlaStatus
  handoverDue: boolean
}
```

---

## Integration Points

| Upstream | What W20 consumes |
|----------|------------------|
| W19 | ThreatIntelPicture (ZoneBreach[], ThreatScore[], AwningLevel, AacrNotification[], RomatsaCoordinationMessage[]) |
| W15 | AuditEventLogger (W20 writes audit events to existing logger) |

| Downstream | What W20 provides |
|------------|------------------|
| W13 | alert_new, sla_breach, escalation_triggered, handover_ready events → Telegram messages |
| W14 | OperatorWorkflowState → Dashboard SSE stream |
| W21 | Full operator workflow state for production UI rendering |

---

## SLA Reference Table

| Zone Type | Ack SLA | Resolve SLA | AACR Notif SLA | Authority |
|-----------|---------|-------------|-----------------|-----------|
| airport   | 60s     | 30min       | 15min (RED)     | ICAO Annex 11 §6.3 |
| nuclear   | 30s     | 30min       | 15min (ORANGE+) | CNCAN Order 400/2021 |
| military  | 30s     | 30min       | 15min (YELLOW+) | SMFA Directive 2019 |
| government| 120s    | 30min       | 15min (RED)     | SPP Protocol 2020 |

---

## Non-Functional Requirements

- Alert state transition: <10ms (in-process FSM, no I/O)
- SlaComplianceTracker rolling window computation: <5ms for 1000 records
- MultiSiteOperatorView aggregation: <50ms for 20 zones
- AuditTrailExporter SHA-256 chain: <20ms per entry
- OperatorShiftHandover generation: <200ms (includes Telegram message formatting)
- Memory footprint: <30MB for 1000 active alerts + 100 incidents
