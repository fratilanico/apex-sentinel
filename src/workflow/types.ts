// APEX-SENTINEL — W20 Shared Types
// src/workflow/types.ts

import { EventEmitter } from 'events';
export { EventEmitter };

export type AlertStatus = 'NEW' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED' | 'ARCHIVED';
export type ZoneType = 'airport' | 'nuclear' | 'military' | 'government';
export type AwningLevel = 'CLEAR' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
export type SlaOutcome = 'COMPLIANT' | 'SLA_BREACH';
export type IncidentStatus = 'OPEN' | 'ACTIVE' | 'MONITORING' | 'CLOSED';
export type EscalationTrigger = 'AUTOMATIC' | 'MANUAL';

export interface AlertTransition {
  to: AlertStatus;
  at: number;
  by: string;
  note?: string;
}

export interface SlaRecord {
  alertId: string;
  event: string;
  outcome: SlaOutcome;
  overrunMs?: number;
}

export interface Alert {
  alertId: string;
  correlationId: string;
  status: AlertStatus;
  zoneId: string;
  zoneType: ZoneType;
  awningLevel: AwningLevel;
  detectedAt: number;
  slaAckDeadline: number;
  slaResolveDeadline: number;
  transitions: AlertTransition[];
  aacrNotificationRequired: boolean;
  assignedOperator?: string;
}

export interface Incident {
  incidentId: string;
  zoneId: string;
  zoneType?: ZoneType;
  status: IncidentStatus;
  alertIds: string[];
  maxAwningLevel: AwningLevel;
  assignedOperator?: string;
  openedAt: number;
}

export interface IncidentReport {
  incidentId: string;
  zoneId: string;
  duration: number;
  alertIds: string[];
  timeline: unknown[];
  outcome: string;
  slaCompliant: boolean;
  regulatoryReportRequired: boolean;
}

export interface Escalation {
  escalationId: string;
  incidentId: string;
  level: number;
  trigger: EscalationTrigger;
  acknowledged: boolean;
  triggeredAt: number;
  contact?: string;
  authority?: string;
  triggeredBy?: string;
}

export interface ShiftHandover {
  site: string;
  outgoingOperatorId: string;
  acknowledgedBy?: string;
  acknowledged: boolean;
  activeIncidents: Incident[];
  unresolvedAlerts: Alert[];
  detectionStats24h: { total: number; byZone: Record<string, number> };
  pendingAacrNotifications: Alert[];
  telegramMessage: string;
  generatedAt: Date;
}

export interface SlaBreachEvent {
  alertId: string;
  event: string;
  overrunMs: number;
}

export interface AuditEntry {
  entryId: string;
  timestamp: number;
  operatorId: string;
  action: string;
  resourceId: string;
  hash: string;
  prevHash: string;
}

export interface ZoneOperatorState {
  zoneId: string;
  zoneType: ZoneType;
  awningLevel: AwningLevel;
  activeAlerts: number;
  unacknowledgedAlerts: number;
  activeIncidents: number;
  healthScore: number;
  assignedOperator?: string;
  assignedToMe?: boolean;
}

// SLA deadlines in ms
export const SLA_ACK_MS: Record<ZoneType, number> = {
  airport: 60_000,
  nuclear: 30_000,
  military: 30_000,
  government: 120_000,
};

export const SLA_RESOLVE_MS = 30 * 60 * 1000; // 30 min

// AWNING level ordering for comparison
export const AWNING_ORDER: Record<AwningLevel, number> = {
  CLEAR: 0,
  GREEN: 1,
  YELLOW: 2,
  ORANGE: 3,
  RED: 4,
};
