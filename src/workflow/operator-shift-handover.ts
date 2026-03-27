// APEX-SENTINEL — W20
// FR-W20-04: OperatorShiftHandover
// src/workflow/operator-shift-handover.ts

import { EventEmitter } from 'events';
import { Alert, Incident, ShiftHandover, AuditEntry } from './types.js';
import { createHash } from 'crypto';

// Shift boundaries: 04:00, 12:00, 20:00 UTC (within 5 minutes = boundary)
const SHIFT_BOUNDARIES_UTC_HOURS = [4, 12, 20];
const BOUNDARY_WINDOW_MS = 5 * 60_000; // 5 min

function computeHash(content: object): string {
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

export class OperatorShiftHandover extends EventEmitter {
  private readonly clockFn: () => number;
  private handovers = new Map<string, ShiftHandover>();
  private auditChain: AuditEntry[] = [];

  constructor(opts: { clockFn?: () => number } = {}) {
    super();
    this.clockFn = opts.clockFn ?? (() => Date.now());
  }

  generateHandover(
    outgoingOperatorId: string,
    alerts: Alert[],
    incidents: Incident[],
    site: string,
  ): ShiftHandover {
    const now = this.clockFn();
    const generatedAt = new Date(now);
    const cutoff24h = now - 24 * 3600_000;

    const activeIncidents = incidents.filter(i => i.status !== 'CLOSED');
    const unresolvedAlerts = alerts.filter(
      a => a.status !== 'RESOLVED' && a.status !== 'ARCHIVED',
    );
    const pendingAacrNotifications = alerts.filter(a => a.aacrNotificationRequired);

    // detectionStats24h
    const within24h = alerts.filter(a => a.detectedAt >= cutoff24h);
    const byZone: Record<string, number> = {};
    for (const a of within24h) {
      byZone[a.zoneId] = (byZone[a.zoneId] ?? 0) + 1;
    }
    const detectionStats24h = { total: within24h.length, byZone };

    // Telegram message (box-drawing, under 4096 chars)
    const telegramMessage = this.buildTelegramMessage(
      site,
      outgoingOperatorId,
      activeIncidents,
      unresolvedAlerts,
      pendingAacrNotifications,
      detectionStats24h,
      generatedAt,
    );

    const handover: ShiftHandover = {
      site,
      outgoingOperatorId,
      acknowledged: false,
      activeIncidents,
      unresolvedAlerts,
      detectionStats24h,
      pendingAacrNotifications,
      telegramMessage,
      generatedAt,
    };

    const handoverId = `${site}:${generatedAt.toISOString()}`;
    this.handovers.set(handoverId, handover);

    // Audit entry
    this.appendAuditEntry({
      operatorId: outgoingOperatorId,
      action: 'HANDOVER_GENERATED',
      resourceId: handoverId,
    });

    this.emit('handover_ready', handover);
    return handover;
  }

  acknowledgeHandover(handoverId: string, operatorId: string): void {
    const h = this.handovers.get(handoverId);
    if (!h) throw new Error(`Handover ${handoverId} not found`);
    h.acknowledged = true;
    h.acknowledgedBy = operatorId;
    this.appendAuditEntry({
      operatorId,
      action: 'HANDOVER_ACKNOWLEDGED',
      resourceId: handoverId,
    });
    this.emit('handover_acknowledged', h);
  }

  getHandover(handoverId: string): ShiftHandover | undefined {
    return this.handovers.get(handoverId);
  }

  checkShiftBoundary(): boolean {
    const now = this.clockFn();
    const date = new Date(now);
    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();
    const minutesFromMidnight = utcHours * 60 + utcMinutes;

    for (const boundaryHour of SHIFT_BOUNDARIES_UTC_HOURS) {
      const boundaryMinutes = boundaryHour * 60;
      const diff = Math.abs(minutesFromMidnight - boundaryMinutes);
      // Within 5 minutes before or after boundary
      if (diff <= 5) return true;
    }
    return false;
  }

  getAuditEntries(): AuditEntry[] {
    return [...this.auditChain];
  }

  private appendAuditEntry(params: {
    operatorId: string;
    action: string;
    resourceId: string;
  }): AuditEntry {
    const entryId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = this.clockFn();
    const prevHash =
      this.auditChain.length === 0
        ? '0'.repeat(64)
        : this.auditChain[this.auditChain.length - 1].hash;

    const hashInput = {
      entryId,
      timestamp,
      operatorId: params.operatorId,
      action: params.action,
      resourceId: params.resourceId,
      prevHash,
    };
    const hash = computeHash(hashInput);

    const entry: AuditEntry = {
      entryId,
      timestamp,
      operatorId: params.operatorId,
      action: params.action,
      resourceId: params.resourceId,
      hash,
      prevHash,
    };
    this.auditChain.push(entry);
    return entry;
  }

  private buildTelegramMessage(
    site: string,
    operator: string,
    incidents: Incident[],
    alerts: Alert[],
    aacr: Alert[],
    stats: { total: number; byZone: Record<string, number> },
    generatedAt: Date,
  ): string {
    const lines = [
      `SHIFT HANDOVER — ${site}`,
      `Operator: ${operator}`,
      `Generated: ${generatedAt.toISOString()}`,
      `Active incidents: ${incidents.length}`,
      `Unresolved alerts: ${alerts.length}`,
      `AACR pending: ${aacr.length}`,
      `Detections 24h: ${stats.total}`,
    ];
    return lines.join('\n').slice(0, 4095);
  }
}
