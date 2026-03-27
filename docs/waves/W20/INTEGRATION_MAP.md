# W20 INTEGRATION MAP — Operator Workflow Engine

## Integration Overview

W20 sits at the hub of APEX-SENTINEL's output layer. It consumes from W19 (the last upstream wave) and feeds W13, W14, W15, and W21 (the downstream consumers). It also integrates with W16's system health infrastructure.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Integration Topology                              │
│                                                                          │
│  UPSTREAM                    W20 CORE                  DOWNSTREAM        │
│  ────────                    ────────                  ──────────        │
│                                                                          │
│  W19 ──────────────────────► W20OperatorWorkflow ──── W13 Telegram       │
│  ThreatIntelPicture          Pipeline                │                  │
│  ZoneBreach[]                                        ├── W14 Dashboard   │
│  AwningLevel                 AlertAcknowledgment     │   SSE             │
│  AacrNotification[]          IncidentManager         │                  │
│  RomatsaCoordMsg[]           EscalationMatrix        ├── W15 Audit       │
│                              ShiftHandover           │   EventLogger     │
│                              SlaComplianceTracker    │                  │
│                              AuditTrailExporter      ├── W16 System      │
│                              MultiSiteView           │   Health          │
│                                                      │                  │
│                                                      └── W21 Production  │
│                                                          UI (future)     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Integration 1: W19 → W20 (Upstream Consumer)

### Interface
**Type:** Direct TypeScript import (same process)
**Module:** `src/intel/threat-intel-picture.ts` (W19)
**Consumed type:** `ThreatIntelPicture`

### What W20 consumes from W19

```typescript
interface ThreatIntelPicture {
  ts: number;
  zoneBreaches: ZoneBreach[];           // → creates Alert[] via AlertAcknowledgmentEngine
  threatScores: ThreatScore[];          // → Alert.threatScore
  awningLevels: Record<string, AwningLevel>; // → Alert.awningLevel per zone
  aacrNotifications: AacrNotification[];    // → Alert.aacrNotificationRequired flag
  romatsaCoordinationMessages: RomatsaCoordinationMessage[]; // → Alert metadata
}
```

### Integration Contract
- W20.process(tip) is called every time W19 produces a new ThreatIntelPicture
- W20 does NOT modify or re-evaluate any W19 calculations
- W20 trusts W19's AwningLevel and ThreatScore as authoritative
- ZoneBreach.correlationId is used for alert deduplication in W20

### Data Flow Frequency
- Normal operations: every 10–30 seconds (W19 publish interval)
- Alert event: immediate on sensor trigger

### Failure Handling
- If W19 produces ThreatIntelPicture with malformed ZoneBreach: W20 logs warning, skips that breach, continues with rest
- If W19 goes offline: W20 retains last known state, continues serving existing alerts/incidents, emits no new alerts

---

## Integration 2: W20 → W13 Telegram (Downstream Producer)

### Interface
**Type:** EventEmitter → W13 TelegramBot.sendMessage()
**Module:** `src/output/telegram-bot.ts` (W13)

### What W20 sends to W13

| W20 Event | Telegram Message | Channel |
|-----------|-----------------|---------|
| `alert_new` (AWNING=RED) | Alert notification with zone, threat score, SLA countdown | Zone-specific security channel |
| `sla_breach` | SLA breach warning: "ALERT {id} SLA BREACHED by {overrunMs}ms" | Duty officer channel |
| `escalation_triggered` | Escalation notification formatted per authority | Authority-specific channel |
| `incident_opened` | New incident summary | Zone-specific security channel |
| `handover_ready` | Shift handover briefing (ShiftHandover.telegramMessage) | Zone-specific security channel |

### Message Format Rules
- Box-drawing chars for tables (per project standard)
- No pipe tables
- Alert notifications: <200 chars (fits Telegram preview)
- Shift handover: <4096 chars (Telegram message limit)

### Integration Contract

```typescript
// W13 TelegramBot interface consumed by W20
interface TelegramBotAdapter {
  sendMessage(channelId: string, text: string): Promise<void>;
}
```

W20 EscalationMatrix injects `TelegramBotAdapter` in constructor. Default implementation calls W13's sendMessage(). In tests: mock adapter used.

### Failure Handling
- W13 send failure: W20 logs to AuditTrail as ESCALATION_NOTIFICATION_FAILED, retries×3 with 30s backoff
- W13 offline: W20 queues up to 100 pending messages, drains queue on W13 reconnect

---

## Integration 3: W20 → W14 Dashboard SSE (Downstream Producer)

### Interface
**Type:** NATS subject `workflow.state` (or EventEmitter if same process)
**Module:** `src/dashboard/sse-emitter.ts` (W14)

### What W20 publishes to W14

```typescript
// Published to NATS workflow.state every 30s and on state change
interface WorkflowStateSummary {
  ts: number;
  incidentCount: number;
  activeAlertCount: number;
  unackedAlertCount: number;
  slaCompliance: number;           // rolling 24h ack compliance
  worstAwning: AwningLevel;
  handoverDue: boolean;
}
```

W14 Dashboard SSE subscribes to `workflow.state` and forwards to connected browser clients.

Full OperatorWorkflowState is available via W20's direct API for W21's HTTP endpoints.

### Data Flow
- NATS publish: every 30 seconds (heartbeat) + on every significant state change (alert_new, escalation_triggered, handover_ready)
- W14 SSE → browser: immediate on NATS receive

### Failure Handling
- NATS broker offline: W20 buffers last 10 state updates in memory, publishes when broker reconnects
- W14 SSE client disconnect: W14's responsibility (no impact on W20)

---

## Integration 4: W20 → W15 AuditEventLogger (Downstream Producer)

### Interface
**Type:** Direct TypeScript method call (same process)
**Module:** `src/system/audit-event-logger.ts` (W15)

### What W20 writes to W15

W20 AuditTrailExporter writes to its own hash chain AND optionally also calls W15 AuditEventLogger for system-level audit entries. This dual-write ensures W20 events appear in the system-wide audit log alongside W1–W19 events.

```typescript
// W15 AuditEventLogger interface consumed by W20
interface AuditEventLogger {
  log(event: {
    source: string;           // 'W20-AlertEngine', 'W20-EscalationMatrix', etc.
    type: string;             // event type
    payload: Record<string, unknown>;
    ts: number;
  }): void;
}
```

### Events written to W15

| Source | Type | Payload |
|--------|------|---------|
| W20-AlertEngine | ALERT_STATE_CHANGE | alertId, from, to, operatorId |
| W20-EscalationMatrix | ESCALATION_TRIGGERED | incidentId, level, authority |
| W20-ShiftHandover | HANDOVER_GENERATED | handoverId, generatedBy |
| W20-AuditExporter | CHAIN_VERIFICATION | valid, entryCount |

### Integration Contract
W20 writes to W15 asynchronously (fire-and-forget). W15 failure does not block W20 operations. The W20 internal hash chain is the authoritative audit record; W15 log is secondary.

---

## Integration 5: W20 → W16 SystemHealthDashboard (Downstream Producer)

### Interface
**Type:** NATS subject `system.health` contribution
**Module:** `src/system/system-health-dashboard.ts` (W16)

### What W20 contributes to W16 health score

W20 registers a health component with W16 SystemHealthDashboard:

```typescript
// W16 health component registration
systemHealthDashboard.registerComponent({
  name: 'W20-OperatorWorkflow',
  healthFn: (): ComponentHealth => {
    const state = pipeline.getLastWorkflowState();
    if (!state) return { status: 'degraded', detail: 'No state yet' };
    if (state.slaStatus.ackCompliance < 80) return { status: 'degraded', detail: `SLA compliance ${state.slaStatus.ackCompliance}%` };
    if (state.alerts.some(a => a.awningLevel === 'RED' && a.status === 'NEW')) return { status: 'degraded', detail: 'Unacknowledged RED alert' };
    return { status: 'online' };
  }
});
```

W16 publishes this as part of the system.health NATS message every 30 seconds.

### Integration Contract
W20 health function must be synchronous and complete in <5ms (W16 requirement for health check callbacks).

---

## Integration 6: W20 → W21 Production UI (Future — Downstream)

### Interface
**Type:** HTTP REST API wrapping W20 methods + SSE stream
**Module:** W21 scope (not implemented in W20)

### What W21 will consume from W20

Full interface contracts defined in HANDOFF.md. Summary:
- `OperatorWorkflowState` via HTTP GET /api/workflow/state (W21 HTTP layer wraps pipeline.process() output)
- All operator action methods via HTTP POST endpoints
- Real-time updates via W14 SSE (W21 subscribes as SSE client)
- NATS workflow.state for W21 server-side cache

### W20 Responsibilities for W21
- Expose W20 module as importable in W21's server process
- Keep `src/workflow/types.ts` stable (no breaking changes after W21 wave:init)
- Document all constructor options needed for W21 to initialize pipeline with production config

---

## Integration Dependency Matrix

| W20 Module | Depends On | Provides To |
|------------|-----------|-------------|
| AlertAcknowledgmentEngine | — | IncidentManager, SlaComplianceTracker, W15, W13 |
| IncidentManager | AlertAcknowledgmentEngine | EscalationMatrix, W15 |
| EscalationMatrix | IncidentManager, SlaComplianceTracker | W13, W15 |
| OperatorShiftHandover | AlertAcknowledgmentEngine, IncidentManager, MultiSiteView | W13, W15 |
| SlaComplianceTracker | AlertAcknowledgmentEngine | EscalationMatrix |
| AuditTrailExporter | OperatorAction (from all modules) | Supabase, filesystem, W15 |
| MultiSiteOperatorView | AlertAcknowledgmentEngine, IncidentManager | W14, W21 |
| W20OperatorWorkflowPipeline | ALL above | W13, W14, W15, W16, W21 |

---

## Integration Initialization Order

```typescript
// Correct initialization sequence in W20OperatorWorkflowPipeline constructor:
1. AuditTrailExporter        (no deps)
2. SlaComplianceTracker      (no deps, receives AuditTrailExporter)
3. AlertAcknowledgmentEngine (receives SlaComplianceTracker, AuditTrailExporter)
4. IncidentManager           (receives AlertAcknowledgmentEngine, AuditTrailExporter)
5. EscalationMatrix          (receives IncidentManager, SlaComplianceTracker, TelegramBotAdapter, AuditTrailExporter)
6. MultiSiteOperatorView     (receives AlertAcknowledgmentEngine, IncidentManager)
7. OperatorShiftHandover     (receives ALL above, TelegramBotAdapter, AuditTrailExporter)
8. Register W16 health component
9. Subscribe to NATS (workflow.state publish interval)
```

---

## External System Integrations (non-code)

### AACR (Autoritatea Aeronautică Civilă Română)
- **Integration type:** Telegram notification (W13) + CSV export (AuditTrailExporter)
- **SLA:** 15min notification for RED AWNING events
- **Format:** AACR CA-12/2023 §8.2 CSV schema
- **Contact:** AACR Operations Center duty officer phone (stored in escalation config, not in code)

### ROMATSA (Air Traffic Services Romania)
- **Integration type:** Telegram notification (W13) for airport zone Level 3 escalation
- **Format:** Free text notification with ICAO phraseology
- **Contact:** ROMATSA ATC supervisor duty phone

### SRI (Romanian Intelligence Service)
- **Integration type:** Telegram notification (W13) for nuclear/government zone Level 4 escalation
- **Format:** Classified format per SRI Protocol (contact SRI for format specification)

### NATO CAOC Uedem
- **Integration type:** SALUTE report format via Telegram (W13) for military zone Level 3 escalation
- **Format:** NATO SALUTE: Size / Activity / Location / Unit / Time / Equipment
- **Contact:** CAOC Uedem Current Operations duty watch officer
