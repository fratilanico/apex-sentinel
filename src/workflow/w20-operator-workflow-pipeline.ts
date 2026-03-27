// APEX-SENTINEL — W20
// FR-W20-08: W20OperatorWorkflowPipeline
// src/workflow/w20-operator-workflow-pipeline.ts

import { EventEmitter } from 'events';
import { Alert, AwningLevel, Escalation, Incident, ZoneType } from './types.js';
import { AlertAcknowledgmentEngine } from './alert-acknowledgment-engine.js';
import { IncidentManager } from './incident-manager.js';
import { EscalationMatrix } from './escalation-matrix.js';
import { SlaComplianceTracker } from './sla-compliance-tracker.js';
import { OperatorShiftHandover } from './operator-shift-handover.js';
import { AuditTrailExporter } from './audit-trail-exporter.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MockThreatIntelPicture {
  breaches?: {
    zoneId: string;
    zoneType?: ZoneType;
    correlationId: string;
    firstDetectedAt: string;
    severity?: string;
  }[];
  awningLevels?: Record<string, AwningLevel>;
  generatedAt?: Date;
}

interface OperatorWorkflowState {
  alerts: Alert[];
  incidents: Incident[];
  escalations: Escalation[];
  slaStatus: { compliancePct: number };
  handoverDue: boolean;
  generatedAt: Date;
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export class W20OperatorWorkflowPipeline extends EventEmitter {
  private readonly clockFn: () => number;
  private readonly auditTrail?: AuditTrailExporter;

  private readonly alertEngine: AlertAcknowledgmentEngine;
  private readonly incidentManager: IncidentManager;
  private readonly escalationMatrix: EscalationMatrix;
  private readonly slaTracker: SlaComplianceTracker;
  private readonly shiftHandover: OperatorShiftHandover;

  // Track ingested correlationIds for idempotency
  private readonly ingestedCorrelationIds = new Set<string>();

  constructor(opts: { clockFn?: () => number; auditTrail?: AuditTrailExporter } = {}) {
    super();
    this.clockFn = opts.clockFn ?? (() => Date.now());
    this.auditTrail = opts.auditTrail;

    this.alertEngine = new AlertAcknowledgmentEngine({ clockFn: this.clockFn });
    this.incidentManager = new IncidentManager({ clockFn: this.clockFn });
    this.escalationMatrix = new EscalationMatrix({ clockFn: this.clockFn });
    this.slaTracker = new SlaComplianceTracker({ clockFn: this.clockFn });
    this.shiftHandover = new OperatorShiftHandover({ clockFn: this.clockFn });
  }

  async process(tip: MockThreatIntelPicture): Promise<OperatorWorkflowState> {
    const newAlerts: Alert[] = [];
    const triggedEscalations: Escalation[] = [];

    const breaches = tip.breaches ?? [];
    const awningLevels = tip.awningLevels ?? {};
    const generatedAt = tip.generatedAt ?? new Date(this.clockFn());

    // Step 1: Ingest alerts (idempotent by correlationId)
    for (const breach of breaches) {
      if (this.ingestedCorrelationIds.has(breach.correlationId)) {
        continue; // already ingested
      }

      const detectedAt = breach.firstDetectedAt
        ? new Date(breach.firstDetectedAt).getTime()
        : this.clockFn();

      const zoneType: ZoneType = (breach.zoneType as ZoneType) ?? 'airport';
      const awningLevel: AwningLevel = awningLevels[breach.zoneId] ?? 'CLEAR';

      const alert = this.alertEngine.ingestAlert({
        correlationId: breach.correlationId,
        zoneId: breach.zoneId,
        zoneType,
        awningLevel,
        detectedAt,
      });

      this.ingestedCorrelationIds.add(breach.correlationId);
      newAlerts.push(alert);

      // Emit alert_new for each new alert
      this.emit('alert_new', alert);

      // Audit entry for each ingested alert
      if (this.auditTrail) {
        this.auditTrail.appendEntry({
          operatorId: 'system',
          action: 'ALERT_INGESTED',
          resourceId: alert.alertId,
        });
      }
    }

    // Step 2: Correlate new alerts into incidents
    const openedIncidentIds = new Set<string>();
    for (const alert of newAlerts) {
      const incident = this.incidentManager.correlate(alert);
      const isNew = !openedIncidentIds.has(incident.incidentId);
      if (isNew) {
        openedIncidentIds.add(incident.incidentId);
        this.emit('incident_opened', incident);
      }
    }

    // Step 3: Evaluate escalations per zone
    const activeIncidents = this.incidentManager.getActiveIncidents();
    for (const incident of activeIncidents) {
      const incidentWithZoneType = incident as Incident & { zoneType?: ZoneType };
      // Determine the zone's awning level
      const zoneAwning: AwningLevel = awningLevels[incident.zoneId] ?? incident.maxAwningLevel;

      // Check SLA breach: is any alert in this incident past ack deadline?
      const incidentAlertIds = incident.alertIds;
      const allAlerts = this.alertEngine.getActiveAlerts();
      const incidentAlerts = allAlerts.filter(a => incidentAlertIds.includes(a.alertId));
      const now = this.clockFn();
      const slaBreached = incidentAlerts.some(a => now > a.slaAckDeadline);

      const evalResult = this.escalationMatrix.evaluateEscalation(
        incidentWithZoneType,
        zoneAwning,
        { slaBreached }
      );

      if (evalResult) {
        const escalation = this.escalationMatrix.executeEscalation(
          incidentWithZoneType,
          evalResult.level,
          'AUTOMATIC'
        );
        triggedEscalations.push(escalation);
        this.emit('escalation_triggered', escalation);
      }
    }

    // Step 4: Check shift boundary
    const handoverDue = this.shiftHandover.checkShiftBoundary();
    if (handoverDue) {
      this.emit('handover_ready');
    }

    // Step 5: Compute SLA compliance
    const compliancePct = this.slaTracker.computeCompliance();

    return {
      alerts: this.alertEngine.getActiveAlerts(),
      incidents: activeIncidents,
      escalations: triggedEscalations,
      slaStatus: { compliancePct },
      handoverDue,
      generatedAt,
    };
  }
}
