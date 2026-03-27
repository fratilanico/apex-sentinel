// APEX-SENTINEL — W20
// FR-W20-01: AlertAcknowledgmentEngine
// src/workflow/alert-acknowledgment-engine.ts

import { EventEmitter } from 'events';
import {
  Alert,
  AlertStatus,
  AlertTransition,
  AwningLevel,
  SlaOutcome,
  SlaRecord,
  ZoneType,
  SLA_ACK_MS,
  SLA_RESOLVE_MS,
} from './types.js';

// ── Errors ────────────────────────────────────────────────────────────────────

export class DuplicateAlertError extends Error {
  constructor(correlationId: string) {
    super(`Alert with correlationId '${correlationId}' already exists`);
    this.name = 'DuplicateAlertError';
  }
}

export class InvalidTransitionError extends Error {
  constructor(from: AlertStatus, to: AlertStatus) {
    super(`Invalid transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ── Engine ────────────────────────────────────────────────────────────────────

interface ZoneBreach {
  correlationId: string;
  zoneId: string;
  zoneType: ZoneType;
  awningLevel: AwningLevel;
  detectedAt?: number;
}

export class AlertAcknowledgmentEngine extends EventEmitter {
  private readonly clockFn: () => number;
  private readonly alerts = new Map<string, Alert>();
  private readonly correlationIndex = new Set<string>();

  constructor(opts: { clockFn?: () => number } = {}) {
    super();
    this.clockFn = opts.clockFn ?? (() => Date.now());
  }

  ingestAlert(breach: ZoneBreach): Alert {
    if (this.correlationIndex.has(breach.correlationId)) {
      throw new DuplicateAlertError(breach.correlationId);
    }

    const now = this.clockFn();
    const detectedAt = breach.detectedAt ?? now;
    const slaAckDeadline = detectedAt + SLA_ACK_MS[breach.zoneType];
    const slaResolveDeadline = detectedAt + SLA_RESOLVE_MS;

    const alert: Alert = {
      alertId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      correlationId: breach.correlationId,
      status: 'NEW',
      zoneId: breach.zoneId,
      zoneType: breach.zoneType,
      awningLevel: breach.awningLevel,
      detectedAt,
      slaAckDeadline,
      slaResolveDeadline,
      transitions: [],
      aacrNotificationRequired: breach.awningLevel === 'RED' || breach.awningLevel === 'ORANGE',
    };

    this.alerts.set(alert.alertId, alert);
    this.correlationIndex.add(breach.correlationId);
    this.emit('alert_new', alert);

    return alert;
  }

  acknowledge(alertId: string, operatorId: string): SlaRecord {
    if (!operatorId || operatorId.trim() === '') {
      throw new ValidationError('operatorId must not be empty');
    }

    const alert = this.requireAlert(alertId);

    if (alert.status !== 'NEW') {
      throw new InvalidTransitionError(alert.status, 'ACKNOWLEDGED');
    }

    const now = this.clockFn();
    const transition: AlertTransition = { to: 'ACKNOWLEDGED', at: now, by: operatorId };
    alert.transitions.push(transition);
    alert.status = 'ACKNOWLEDGED';
    alert.assignedOperator = operatorId;

    const outcome: SlaOutcome = now <= alert.slaAckDeadline ? 'COMPLIANT' : 'SLA_BREACH';
    const record: SlaRecord = { alertId, event: 'ACK', outcome };

    if (outcome === 'SLA_BREACH') {
      record.overrunMs = now - alert.slaAckDeadline;
      this.emit('sla_breach', record);
    }

    return record;
  }

  beginInvestigation(alertId: string, actionNote: string): void {
    if (!actionNote || actionNote.trim() === '') {
      throw new ValidationError('actionNote must not be empty');
    }

    const alert = this.requireAlert(alertId);

    if (alert.status !== 'ACKNOWLEDGED') {
      throw new InvalidTransitionError(alert.status, 'INVESTIGATING');
    }

    const now = this.clockFn();
    const transition: AlertTransition = {
      to: 'INVESTIGATING',
      at: now,
      by: alert.assignedOperator ?? 'system',
      note: actionNote,
    };
    alert.transitions.push(transition);
    alert.status = 'INVESTIGATING';
  }

  resolveAlert(alertId: string, outcome: string): SlaRecord {
    const alert = this.requireAlert(alertId);

    if (alert.status !== 'INVESTIGATING') {
      throw new InvalidTransitionError(alert.status, 'RESOLVED');
    }

    const now = this.clockFn();
    const transition: AlertTransition = {
      to: 'RESOLVED',
      at: now,
      by: alert.assignedOperator ?? 'system',
      note: outcome,
    };
    alert.transitions.push(transition);
    alert.status = 'RESOLVED';

    const slaOutcome: SlaOutcome = now <= alert.slaResolveDeadline ? 'COMPLIANT' : 'SLA_BREACH';
    const record: SlaRecord = { alertId, event: 'RESOLVE', outcome: slaOutcome };

    if (slaOutcome === 'SLA_BREACH') {
      record.overrunMs = now - alert.slaResolveDeadline;
      this.emit('sla_breach', record);
    }

    return record;
  }

  getActiveAlerts(filter?: { status?: AlertStatus; zoneType?: ZoneType }): Alert[] {
    let results = Array.from(this.alerts.values());
    if (filter?.status) {
      results = results.filter(a => a.status === filter.status);
    }
    if (filter?.zoneType) {
      results = results.filter(a => a.zoneType === filter.zoneType);
    }
    return results;
  }

  private requireAlert(alertId: string): Alert {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error(`Alert '${alertId}' not found`);
    return alert;
  }
}
