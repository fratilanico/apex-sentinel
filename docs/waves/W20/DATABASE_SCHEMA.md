# W20 DATABASE SCHEMA — Operator Workflow Engine

## Storage Strategy

W20 uses a hybrid persistence model:
- **In-process Maps**: primary state store for FSM (sub-10ms access)
- **Supabase write-through**: event log only — every state change appended to `operator_audit_log`
- **Local filesystem**: AuditTrailExporter JSON/CSV exports, shift handover archives
- **NATS**: `workflow.state` topic for W14 Dashboard SSE consumption

No blocking reads from Supabase in hot path. Supabase writes are fire-and-forget (non-blocking).

---

## TypeScript Interfaces

### Alert

```typescript
type AlertStatus = 'NEW' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED' | 'ARCHIVED';

type ZoneType = 'airport' | 'nuclear' | 'military' | 'government';

type AwningLevel = 'CLEAR' | 'YELLOW' | 'ORANGE' | 'RED';

interface AlertTransition {
  from: AlertStatus;
  to: AlertStatus;
  ts: number;          // epoch ms
  operatorId: string;
  actionNote?: string;
  outcome?: 'DRONE_CONFIRMED' | 'FALSE_POSITIVE' | 'UNRESOLVED';
}

interface Alert {
  id: string;                      // UUID v4
  zoneId: string;                  // e.g. "OTP-RUNWAY-08L"
  zoneType: ZoneType;
  awningLevel: AwningLevel;
  threatScore: number;             // 0.0–1.0 from W19 ThreatScore
  detectedAt: number;              // epoch ms — set once, NEVER updated on retry
  status: AlertStatus;
  transitions: AlertTransition[];  // append-only history
  incidentId?: string;             // set by IncidentManager when grouped
  aacrNotificationRequired: boolean;
  romatsaCoordinationRequired: boolean;
  slaAckDeadline: number;          // epoch ms (detectedAt + ackSlaMsForZoneType)
  slaResolveDeadline: number;      // epoch ms (detectedAt + 1_800_000)
  metadata: {
    rfSignatureId?: string;        // from W3 RF fingerprint
    acousticEventId?: string;      // from W5 acoustic
    correlationId?: string;        // from W19 fusion
    threatVector?: string[];       // e.g. ['RF_DETECTED', 'ACOUSTIC_MATCH', 'PAYLOAD_SUSPECTED']
  };
}
```

### Incident

```typescript
type IncidentStatus = 'OPEN' | 'ACTIVE' | 'MONITORING' | 'CLOSED';

interface IncidentTimeline {
  ts: number;
  event: string;   // human-readable description
  operatorId?: string;
  alertId?: string;
}

interface IncidentReport {
  incidentId: string;
  generatedAt: number;
  generatedBy: string;              // operatorId
  zoneId: string;
  zoneType: ZoneType;
  maxAwningLevel: AwningLevel;
  maxThreatScore: number;
  duration: number;                 // ms from first alert to CLOSED
  alertIds: string[];
  timeline: IncidentTimeline[];
  outcome: 'DRONE_CONFIRMED' | 'FALSE_POSITIVE' | 'UNRESOLVED' | 'ONGOING';
  escalationsTriggered: number;
  slaCompliant: boolean;
  regulatoryReportRequired: boolean;
  aacrReference?: string;           // AACR case number if submitted
}

interface Incident {
  id: string;                       // UUID v4
  zoneId: string;
  zoneType: ZoneType;
  status: IncidentStatus;
  alertIds: string[];               // constituent Alert IDs
  openedAt: number;                 // epoch ms of first alert
  closedAt?: number;
  maxAwningLevel: AwningLevel;      // worst level seen across constituent alerts
  maxThreatScore: number;
  assignedOperatorId?: string;
  escalationLevel: number;          // 0–4
  timeline: IncidentTimeline[];
  report?: IncidentReport;          // populated on CLOSED
  correlationKey: string;           // zoneId:windowBucket for dedup
}
```

### Escalation

```typescript
type EscalationAuthority =
  | 'OPERATOR'
  | 'AIRPORT_SECURITY_CHIEF'
  | 'AACR_DUTY_OFFICER'
  | 'ROMATSA_ATC_SUPERVISOR'
  | 'IGAV'
  | 'SITE_SECURITY_COMMANDER'
  | 'SNN_SECURITY_DIRECTORATE'
  | 'CNCAN_DUTY_INSPECTOR'
  | 'SRI'
  | 'BASE_COMMANDER'
  | 'SMFA_J3_OPERATIONS'
  | 'NATO_CAOC_UEDEM'
  | 'SPP_OPERATIONS_CENTER';

interface EscalationLevel {
  level: number;                    // 0–4
  authority: EscalationAuthority;
  notificationMethod: 'TELEGRAM' | 'EMAIL' | 'PHONE' | 'NATS' | 'SALUTE';
  contactRef: string;               // phone/channel reference (not stored in plaintext — ref to secrets)
}

interface EscalationChain {
  zoneType: ZoneType;
  levels: EscalationLevel[];
  triggerAwning: AwningLevel;
  triggerSlaBreachMs: number;
}

interface Escalation {
  id: string;                       // UUID v4
  incidentId: string;
  alertId: string;
  zoneType: ZoneType;
  level: number;                    // which level was triggered
  authority: EscalationAuthority;
  triggeredAt: number;              // epoch ms
  triggeredBy: 'SYSTEM' | string;  // system=auto, or operatorId
  trigger: 'SLA_BREACH' | 'AWNING_LEVEL' | 'MANUAL';
  notificationSent: boolean;
  notificationTs?: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
}
```

### ShiftHandover

```typescript
interface DetectionStats {
  totalAlerts24h: number;
  falsePositives24h: number;
  confirmedDrones24h: number;
  avgThreatScore24h: number;
  maxAwningLevel24h: AwningLevel;
  escalations24h: number;
  slaBreaches24h: number;
}

interface ZoneSummary {
  zoneId: string;
  zoneType: ZoneType;
  currentAwning: AwningLevel;
  activeIncidents: number;
  unacknowledgedAlerts: number;
  slaCompliance24h: number;        // 0–100
}

interface ShiftHandover {
  id: string;                      // UUID v4
  generatedAt: number;             // epoch ms
  generatedBy: string;             // outgoing operatorId
  shiftStart: number;              // epoch ms
  shiftEnd: number;                // epoch ms (= generatedAt rounded to next boundary)
  activeIncidents: Incident[];
  unresolvedAlerts: Alert[];
  zoneStatus: ZoneSummary[];
  detectionStats24h: DetectionStats;
  pendingAacrNotifications: string[];  // Alert IDs with aacrNotificationRequired=true and not yet sent
  telegramMessage: string;         // formatted handover for Telegram
  acknowledged: boolean;           // set true when incoming operator confirms receipt
  acknowledgedBy?: string;
  acknowledgedAt?: number;
}
```

### SlaRecord

```typescript
type SlaEventType = 'ACK' | 'RESOLVE' | 'AACR_NOTIF';

type SlaResult = 'COMPLIANT' | 'BREACH';

interface SlaRecord {
  id: string;                      // UUID v4
  alertId: string;
  zoneType: ZoneType;
  eventType: SlaEventType;
  elapsedMs: number;               // actual time taken
  slaMs: number;                   // SLA threshold
  result: SlaResult;
  operatorId?: string;
  recordedAt: number;              // epoch ms
}

interface SlaStatus {
  ackCompliance: number;           // 0–100, rolling 24h
  resolveCompliance: number;       // 0–100, rolling 24h
  aacrNotifCompliance: number;     // 0–100, rolling 24h
  windowMs: number;                // 86_400_000
  totalRecords: number;
  breachCount: number;
}

interface SlaBreachEvent {
  alertId: string;
  zoneType: ZoneType;
  eventType: SlaEventType;
  elapsedMs: number;
  slaMs: number;
  overrunMs: number;               // elapsedMs - slaMs
  triggeredEscalation: boolean;
}
```

### AuditEntry

```typescript
type OperatorActionType =
  | 'ALERT_ACKNOWLEDGED'
  | 'ALERT_INVESTIGATING'
  | 'ALERT_RESOLVED'
  | 'ALERT_ARCHIVED'
  | 'INCIDENT_CREATED'
  | 'INCIDENT_CLOSED'
  | 'ESCALATION_TRIGGERED'
  | 'ESCALATION_ACKNOWLEDGED'
  | 'HANDOVER_GENERATED'
  | 'HANDOVER_ACKNOWLEDGED'
  | 'AUDIT_EXPORT_REQUESTED'
  | 'SLA_BREACH_RECORDED';

interface OperatorAction {
  operatorId: string;
  actionType: OperatorActionType;
  resourceType: 'Alert' | 'Incident' | 'Escalation' | 'ShiftHandover' | 'SlaRecord';
  resourceId: string;
  ts: number;                      // epoch ms
  metadata: Record<string, unknown>;  // action-specific payload
  ipAddress?: string;              // for GDPR audit — optional, may be omitted per Art.7
}

interface AuditEntry {
  id: string;                      // UUID v4
  sequenceNo: number;              // monotonically increasing
  action: OperatorAction;
  prevHash: string;                // SHA-256 of previous AuditEntry (genesis entry: '0'.repeat(64))
  hash: string;                    // SHA-256 of (prevHash + ts + operatorId + actionType + resourceId + metadata)
  exportedAt?: number;             // epoch ms if included in an export
}
```

---

## Supabase Tables (write-through only)

### operator_audit_log

```sql
CREATE TABLE operator_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_no  BIGINT NOT NULL,
  operator_id  TEXT NOT NULL,
  action_type  TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id  UUID NOT NULL,
  ts           BIGINT NOT NULL,        -- epoch ms
  metadata     JSONB,
  prev_hash    TEXT NOT NULL,
  hash         TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_operator_audit_log_operator ON operator_audit_log(operator_id);
CREATE INDEX idx_operator_audit_log_resource ON operator_audit_log(resource_id);
CREATE INDEX idx_operator_audit_log_ts ON operator_audit_log(ts);
```

### operator_sla_records

```sql
CREATE TABLE operator_sla_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id    UUID NOT NULL,
  zone_type   TEXT NOT NULL,
  event_type  TEXT NOT NULL,  -- ACK | RESOLVE | AACR_NOTIF
  elapsed_ms  INTEGER NOT NULL,
  sla_ms      INTEGER NOT NULL,
  result      TEXT NOT NULL,  -- COMPLIANT | BREACH
  operator_id TEXT,
  recorded_at BIGINT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sla_records_alert ON operator_sla_records(alert_id);
CREATE INDEX idx_sla_records_recorded_at ON operator_sla_records(recorded_at);
```

### operator_shift_handovers

```sql
CREATE TABLE operator_shift_handovers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_by    TEXT NOT NULL,
  shift_start     BIGINT NOT NULL,
  shift_end       BIGINT NOT NULL,
  generated_at    BIGINT NOT NULL,
  payload         JSONB NOT NULL,    -- full ShiftHandover JSON
  acknowledged    BOOLEAN DEFAULT FALSE,
  acknowledged_by TEXT,
  acknowledged_at BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Retention Policy (GDPR-aligned)

| Table | Raw Retention | Summary Retention | Legal Basis |
|-------|--------------|-------------------|-------------|
| operator_audit_log | 90 days | 1 year (aggregated by operator/zone) | GDPR Art.5(1)(e) + security necessity |
| operator_sla_records | 90 days | 1 year (compliance percentages only) | Operational necessity |
| operator_shift_handovers | 90 days | None | Operational continuity |

Personal data fields subject to erasure (GDPR Art.17): `operator_id`, `ip_address`. Erasure replaces with `[REDACTED-GDPR-ART17]` — does NOT delete the audit entry (security retention obligation overrides per GDPR Recital 73).
