// APEX-SENTINEL — W20
// FR-W20-02: IncidentManager
// src/workflow/incident-manager.ts

import { EventEmitter } from 'events';
import {
  Alert,
  AlertStatus,
  AwningLevel,
  Incident,
  IncidentReport,
  IncidentStatus,
  AWNING_ORDER,
} from './types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function maxAwning(a: AwningLevel, b: AwningLevel): AwningLevel {
  return AWNING_ORDER[a] >= AWNING_ORDER[b] ? a : b;
}

function deriveIncidentStatus(alertStatuses: AlertStatus[]): IncidentStatus {
  if (alertStatuses.length === 0) return 'OPEN';

  const allResolved = alertStatuses.every(s => s === 'RESOLVED' || s === 'ARCHIVED');
  if (allResolved) return 'CLOSED';

  const allInvestigating = alertStatuses.every(
    s => s === 'INVESTIGATING' || s === 'RESOLVED' || s === 'ARCHIVED'
  );
  if (allInvestigating) return 'MONITORING';

  const anyAcknowledged = alertStatuses.some(
    s => s === 'ACKNOWLEDGED' || s === 'INVESTIGATING' || s === 'RESOLVED' || s === 'ARCHIVED'
  );
  if (anyAcknowledged) return 'ACTIVE';

  return 'OPEN';
}

// ── IncidentManager ───────────────────────────────────────────────────────────

export class IncidentManager extends EventEmitter {
  private readonly clockFn: () => number;
  private readonly incidents = new Map<string, Incident>();
  // correlationKey → incidentId
  private readonly correlationMap = new Map<string, string>();
  // alertId → latest Alert
  private readonly alertRegistry = new Map<string, Alert>();

  constructor(opts: { clockFn?: () => number } = {}) {
    super();
    this.clockFn = opts.clockFn ?? (() => Date.now());
  }

  correlate(alert: Alert): Incident {
    // Update alert registry with latest status
    this.alertRegistry.set(alert.alertId, { ...alert });

    // Find an existing non-CLOSED incident in same zone where any alert is within 10min window
    const existingIncident = this.findCorrelatedIncident(alert);

    if (existingIncident) {
      // Add alert to incident if not already there
      if (!existingIncident.alertIds.includes(alert.alertId)) {
        existingIncident.alertIds.push(alert.alertId);
      }

      // Update maxAwningLevel
      existingIncident.maxAwningLevel = maxAwning(existingIncident.maxAwningLevel, alert.awningLevel);

      // Recompute incident status from all constituent alert statuses
      const alertStatuses = existingIncident.alertIds.map(
        id => this.alertRegistry.get(id)?.status ?? 'NEW'
      );
      existingIncident.status = deriveIncidentStatus(alertStatuses);

      return { ...existingIncident };
    }

    // New incident
    const incidentId = `inc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const incident: Incident = {
      incidentId,
      zoneId: alert.zoneId,
      zoneType: alert.zoneType,
      status: 'OPEN',
      alertIds: [alert.alertId],
      maxAwningLevel: alert.awningLevel,
      openedAt: this.clockFn(),
    };

    this.incidents.set(incidentId, incident);
    this.emit('incident_opened', { ...incident });

    // Compute initial status
    const alertStatuses = [alert.status];
    incident.status = deriveIncidentStatus(alertStatuses);

    return { ...incident };
  }

  private findCorrelatedIncident(alert: Alert): Incident | undefined {
    for (const incident of this.incidents.values()) {
      if (incident.status === 'CLOSED') continue;
      if (incident.zoneId !== alert.zoneId) continue;

      // Check if any alert in this incident is within 10min of the new alert
      for (const alertId of incident.alertIds) {
        const existing = this.alertRegistry.get(alertId);
        if (!existing) continue;
        const timeDiff = Math.abs(existing.detectedAt - alert.detectedAt);
        if (timeDiff < 600_000) {
          return incident;
        }
      }
    }
    return undefined;
  }

  closeIncident(incidentId: string, outcome: string): IncidentReport {
    const incident = this.requireIncident(incidentId);

    const closedAt = this.clockFn();
    incident.status = 'CLOSED';

    const report = this.buildReport(incident, outcome, closedAt);
    return report;
  }

  generateIncidentReport(incidentId: string): IncidentReport {
    const incident = this.requireIncident(incidentId);
    const now = this.clockFn();
    return this.buildReport(incident, 'GENERATED', now);
  }

  getActiveIncidents(filter?: { assignedOperator?: string }): Incident[] {
    let results = Array.from(this.incidents.values()).filter(i => i.status !== 'CLOSED');
    if (filter?.assignedOperator) {
      results = results.filter(i => i.assignedOperator === filter.assignedOperator);
    }
    return results.map(i => ({ ...i }));
  }

  assignOperator(incidentId: string, operatorId: string): void {
    const incident = this.requireIncident(incidentId);
    incident.assignedOperator = operatorId;
  }

  private buildReport(incident: Incident, outcome: string, closedAt: number): IncidentReport {
    const duration = closedAt - incident.openedAt;

    // Collect all transitions from constituent alerts
    const timeline: unknown[] = [];
    for (const alertId of incident.alertIds) {
      const alert = this.alertRegistry.get(alertId);
      if (alert) {
        for (const t of alert.transitions) {
          timeline.push({ alertId, ...t });
        }
      }
    }

    // Sort by timestamp
    (timeline as Array<{ at: number }>).sort((a, b) => a.at - b.at);

    // SLA compliance: all alerts acked within their slaAckDeadline
    let slaCompliant = true;
    for (const alertId of incident.alertIds) {
      const alert = this.alertRegistry.get(alertId);
      if (!alert) continue;
      const ackTransition = alert.transitions.find(t => t.to === 'ACKNOWLEDGED');
      if (ackTransition && ackTransition.at > alert.slaAckDeadline) {
        slaCompliant = false;
        break;
      }
    }

    // regulatoryReportRequired: any airport or nuclear zone
    const regulatoryReportRequired = incident.alertIds.some(id => {
      const alert = this.alertRegistry.get(id);
      return alert && (alert.zoneType === 'airport' || alert.zoneType === 'nuclear');
    });

    return {
      incidentId: incident.incidentId,
      zoneId: incident.zoneId,
      duration,
      alertIds: [...incident.alertIds],
      timeline,
      outcome,
      slaCompliant,
      regulatoryReportRequired,
    };
  }

  private requireIncident(incidentId: string): Incident {
    const incident = this.incidents.get(incidentId);
    if (!incident) throw new Error(`Incident '${incidentId}' not found`);
    return incident;
  }
}
