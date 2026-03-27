# W20 ARCHITECTURE — Operator Workflow Engine

## System Context

W20 sits at the boundary between autonomous detection (W1–W19) and human operators. It is a pure coordination layer: it does not perform any sensor processing, ML inference, or RF analysis. Its sole responsibility is structuring the human response workflow and ensuring traceability.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        APEX-SENTINEL System                          │
│                                                                       │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────────────┐  │
│  │  W1-W18      │    │     W19      │    │         W20            │  │
│  │  Detection   │───►│  ThreatIntel │───►│  Operator Workflow     │  │
│  │  Fusion      │    │  Picture     │    │  Engine                │  │
│  │  AWNING      │    │              │    │                        │  │
│  └──────────────┘    └──────────────┘    └─────────┬──────────────┘  │
│                                                     │                 │
│                               ┌─────────────────────┼──────────────┐ │
│                               │         │           │              │ │
│                        ┌──────▼──┐ ┌────▼────┐ ┌───▼─────┐        │ │
│                        │  W13    │ │  W14    │ │  W15    │        │ │
│                        │Telegram │ │Dashboard│ │ Audit   │        │ │
│                        │   Bot   │ │   SSE   │ │ Logger  │        │ │
│                        └─────────┘ └─────────┘ └─────────┘        │ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### Layer 1: Alert Lifecycle (FR-W20-01)

```
AlertAcknowledgmentEngine
├── alertStore: Map<string, Alert>
├── fsm: AlertFSM
│     NEW → ACKNOWLEDGED (operatorId, timestamp, within SLA)
│     ACKNOWLEDGED → INVESTIGATING (operatorId, actionNote)
│     INVESTIGATING → RESOLVED (operatorId, outcome, resolutionNote)
│     RESOLVED → ARCHIVED (automatic, after 24h)
│     any state → ARCHIVED (manual force-archive)
├── slaGates: Map<ZoneType, number>  // milliseconds
└── emit: 'alert_acknowledged' | 'alert_resolved' | 'alert_sla_breach'
```

**FSM guard conditions:**
- NEW → ACKNOWLEDGED: requires operatorId (non-empty string)
- ACKNOWLEDGED → INVESTIGATING: requires actionNote
- INVESTIGATING → RESOLVED: requires outcome ('DRONE_CONFIRMED' | 'FALSE_POSITIVE' | 'UNRESOLVED')
- Any backward transition: PROHIBITED (alerts are append-only)

### Layer 2: Incident Aggregation (FR-W20-02)

```
IncidentManager
├── incidentStore: Map<string, Incident>
├── correlationWindow: 600_000ms  // 10 minutes
├── correlationKey: (alert) => `${alert.zoneId}:${Math.floor(alert.detectedAt / 600_000)}`
├── linkAlert(incidentId, alertId): void
├── transitionIncident(id, status, operatorId): void
│     OPEN → ACTIVE (first operator action on any constituent alert)
│     ACTIVE → MONITORING (all constituent alerts INVESTIGATING or higher)
│     MONITORING → CLOSED (all constituent alerts RESOLVED)
└── generateIncidentReport(incidentId): IncidentReport
```

**Correlation algorithm:**
1. For each new Alert, compute correlationKey = `zoneId:windowBucket`
2. Search incidentStore for existing OPEN/ACTIVE Incident with same key
3. If found: add alertId to Incident.alertIds
4. If not found: create new Incident with this Alert as first constituent

### Layer 3: Escalation (FR-W20-03)

```
EscalationMatrix
├── chains: Record<ZoneType, EscalationChain>
├── EscalationChain = {
│     levels: EscalationLevel[]  // ordered, 0=operator
│     triggerAwning: AwningLevel  // minimum level for auto-escalate
│     triggerSlaBreachMs: number  // escalate after SLA breach by this duration
│   }
├── evaluateEscalation(incident, awningLevel, slaBreach): EscalationAction | null
├── executeEscalation(action): Escalation
└── emit: 'escalation_triggered'
```

**Escalation chains (full definition):**
```
airport:
  Level 0: Operator (APEX-SENTINEL alert)
  Level 1: Airport Security Chief
  Level 2: AACR Duty Officer (+15min RED)
  Level 3: ROMATSA ATC Supervisor (+20min RED)
  Level 4: IGAV (Romanian Police Aviation) (+30min RED)
  Trigger: AWNING=RED + ack SLA breach

nuclear:
  Level 0: Operator (APEX-SENTINEL alert)
  Level 1: Site Security Commander (SNN Cernavodă/Nuclearelectrica)
  Level 2: SNN Security Directorate (+10min ORANGE)
  Level 3: AACR + CNCAN Duty Inspector (+15min ORANGE)
  Level 4: SRI (Romanian Intelligence) (+20min ORANGE)
  Trigger: AWNING=ORANGE+

military:
  Level 0: Operator (APEX-SENTINEL alert)
  Level 1: Base Commander
  Level 2: SMFA J3 Operations (+15min YELLOW)
  Level 3: NATO CAOC Uedem (SALUTE report) (+20min YELLOW)
  Trigger: AWNING=YELLOW+

government:
  Level 0: Operator (APEX-SENTINEL alert)
  Level 1: Protocol Security Chief (SPP – Serviciul de Protecție și Pază)
  Level 2: SPP Operations Center (+10min RED)
  Level 3: SRI Cyber & Physical Security (+15min RED)
  Trigger: AWNING=RED
```

### Layer 4: SLA Tracking (FR-W20-05)

```
SlaComplianceTracker
├── records: SlaRecord[]  // rolling 24h window (max 10_000)
├── windowMs: 86_400_000  // 24h
├── recordEvent(alertId, eventType, elapsed, slaMs): SlaRecord
├── computeCompliance(): SlaStatus {
│     ackCompliance: number  // 0-100
│     resolveCompliance: number
│     aacrNotifCompliance: number
│     window: '24h'
│   }
├── checkSla(alert): SlaCheckResult  // called on each alert transition
└── emit: 'sla_breach' (SlaBreachEvent)
```

### Layer 5: Audit Trail (FR-W20-06)

```
AuditTrailExporter
├── chain: AuditEntry[]  // hash-linked
├── prevHash: string  // SHA-256 of last entry
├── appendEntry(action: OperatorAction): AuditEntry
├── verifyChain(): boolean  // tamper detection
├── exportJSON(filter: AuditFilter): AuditEntry[]
├── exportCSV(filter: AuditFilter): string  // for AACR
└── getChainHead(): string  // current chain tip hash
```

**Hash chain construction:**
```
entry.hash = SHA256(
  prevHash +
  entry.ts.toString() +
  entry.operatorId +
  entry.action +
  entry.resourceId +
  JSON.stringify(entry.metadata)
)
```

### Layer 6: Multi-Site View (FR-W20-07)

```
MultiSiteOperatorView
├── sites: Map<string, SiteState>
├── addZone(zone: ZoneConfig): void
├── updateZone(zoneId, update: Partial<SiteState>): void
├── getOperatorView(operatorId, filter?: ZoneFilter): OperatorViewState {
│     zones: ZoneViewEntry[]  // sorted: worst AwningLevel first
│     totalActiveIncidents: number
│     totalUnacknowledgedAlerts: number
│     overallHealthScore: number  // 0-100, worst zone drives score
│   }
└── assignOperator(zoneId, operatorId): void
```

**Health score algorithm:**
```
overallHealthScore = MIN(zoneHealthScores)
zoneHealthScore = f(awningLevel, unackedAlertCount, openIncidentCount, slaCompliance)
  = 100 - (awningPenalty + alertPenalty + incidentPenalty + slaPenalty)
  awningPenalty: CLEAR=0, YELLOW=15, ORANGE=30, RED=50
  alertPenalty: min(unackedCount * 5, 30)
  incidentPenalty: min(openIncidents * 10, 20)
  slaPenalty: max(0, (100 - slaCompliance) * 0.2)  // capped at 20
```

### Layer 7: Shift Handover (FR-W20-04)

```
OperatorShiftHandover
├── shiftBoundaries: number[]  // epoch ms for 06:00, 14:00, 22:00 UTC+2
├── checkShiftBoundary(): boolean
├── generateHandover(operatorId): ShiftHandover {
│     generatedAt, generatedBy
│     activeIncidents: Incident[]
│     unresolvedAlerts: Alert[]
│     zoneStatus: ZoneSummary[]
│     detectionStats24h: DetectionStats
│     pendingAacrNotifications: AacrNotification[]
│     telegramMessage: string  // formatted for Telegram
│   }
└── emit: 'handover_ready' (ShiftHandover)
```

### Layer 8: Pipeline Orchestrator (FR-W20-08)

```
W20OperatorWorkflowPipeline extends EventEmitter
├── alertEngine: AlertAcknowledgmentEngine
├── incidentManager: IncidentManager
├── escalationMatrix: EscalationMatrix
├── shiftHandover: OperatorShiftHandover
├── slaTracker: SlaComplianceTracker
├── auditExporter: AuditTrailExporter
├── multiSiteView: MultiSiteOperatorView
│
├── process(tip: ThreatIntelPicture): OperatorWorkflowState
│     1. Convert ThreatIntelPicture.ZoneBreaches → Alert[]
│     2. AlertAcknowledgmentEngine.ingestAlerts(alerts)
│     3. IncidentManager.correlate(alerts)
│     4. EscalationMatrix.evaluate(incidents)
│     5. SlaComplianceTracker.check(alerts)
│     6. MultiSiteOperatorView.update(alerts, incidents)
│     7. OperatorShiftHandover.check()
│     8. Return OperatorWorkflowState
│
└── Events: 'alert_new', 'sla_breach', 'escalation_triggered',
            'incident_opened', 'handover_ready'
```

---

## Deployment Architecture

W20 modules run in-process alongside W19 on the APEX-SENTINEL node (RPi4 / Jetson Nano). No separate microservice. Memory budget: 30MB for full W20 state with 1000 active alerts.

```
apex-sentinel.service (systemd)
  └── Node.js process
        ├── W19 ThreatIntelPicture (upstream)
        ├── W20 OperatorWorkflowPipeline (this wave)
        │     ├── AlertAcknowledgmentEngine
        │     ├── IncidentManager
        │     ├── EscalationMatrix
        │     ├── OperatorShiftHandover
        │     ├── SlaComplianceTracker
        │     ├── AuditTrailExporter
        │     └── MultiSiteOperatorView
        └── W13/W14/W15 downstream consumers
```

---

## Error Handling Strategy

| Failure Mode | Handler |
|-------------|---------|
| Alert FSM invalid transition | Throw InvalidTransitionError, log to W15, do NOT change state |
| IncidentManager correlation timeout | Force-close incident after 60min, generate IncidentReport |
| EscalationMatrix contact unreachable | Log failure, retry×3, emit escalation_failed event, continue |
| AuditTrailExporter hash mismatch | Log tamper_detected, halt chain, emit integrity_alert |
| ShiftHandover Telegram send failure | Queue handover in memory, retry on next W13 reconnect |
| SlaComplianceTracker window full | Evict oldest 10% of records (FIFO) |
