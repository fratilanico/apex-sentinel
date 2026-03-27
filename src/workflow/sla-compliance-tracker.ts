// APEX-SENTINEL — W20
// FR-W20-05: SlaComplianceTracker
// src/workflow/sla-compliance-tracker.ts

import { EventEmitter } from 'events';
import { Alert, SlaBreachEvent, SlaOutcome } from './types.js';

interface SlaRecord {
  alertId: string;
  event: string;
  outcome: SlaOutcome;
  timestamp: number;
  overrunMs?: number;
}

const TWENTY_FOUR_HOURS_MS = 24 * 3600_000;
const MAX_RECORDS = 10_000;
const EVICT_COUNT = 1_000; // evict oldest 10%

export class SlaComplianceTracker extends EventEmitter {
  private readonly clockFn: () => number;
  private records: SlaRecord[] = [];
  private breachEvents: SlaBreachEvent[] = [];

  constructor(opts: { clockFn?: () => number } = {}) {
    super();
    this.clockFn = opts.clockFn ?? (() => Date.now());
  }

  /**
   * recordEvent — store an SLA record.
   * Optional 4th arg: explicit timestamp (for 24h-window test).
   * Optional 5th arg: slaDeadline (for overrunMs calculation in breach events).
   */
  recordEvent(
    alertId: string,
    event: string,
    outcome: SlaOutcome,
    timestamp?: number,
    slaDeadline?: number,
  ): void {
    const ts = timestamp ?? this.clockFn();

    if (this.records.length >= MAX_RECORDS) {
      this.records.splice(0, EVICT_COUNT);
    }

    const record: SlaRecord = { alertId, event, outcome, timestamp: ts };

    if (outcome === 'SLA_BREACH') {
      const overrunMs = slaDeadline !== undefined
        ? ts - slaDeadline
        : 0;
      record.overrunMs = overrunMs;

      const breachEvent: SlaBreachEvent = { alertId, event, overrunMs };
      this.breachEvents.push(breachEvent);
      this.emit('sla_breach', breachEvent);
    }

    this.records.push(record);
  }

  computeCompliance(): number {
    const now = this.clockFn();
    const cutoff = now - TWENTY_FOUR_HOURS_MS;
    const window = this.records.filter(r => r.timestamp >= cutoff);

    if (window.length === 0) return 100;

    const compliant = window.filter(r => r.outcome === 'COMPLIANT').length;
    const breach = window.filter(r => r.outcome === 'SLA_BREACH').length;
    const total = compliant + breach;
    if (total === 0) return 100;

    return (compliant / total) * 100;
  }

  checkSla(alert: Alert): {
    ackBreached: boolean;
    resolveBreached: boolean;
    remainingAckMs: number;
    remainingResolveMs: number;
  } {
    const now = this.clockFn();
    const ackBreached = now > alert.slaAckDeadline;
    const resolveBreached = now > alert.slaResolveDeadline;
    const remainingAckMs = alert.slaAckDeadline - now;
    const remainingResolveMs = alert.slaResolveDeadline - now;

    if (ackBreached) {
      const overrunMs = now - alert.slaAckDeadline;
      const breachEvent: SlaBreachEvent = {
        alertId: alert.alertId,
        event: 'ACK_CHECK',
        overrunMs,
      };
      this.breachEvents.push(breachEvent);
    }

    return { ackBreached, resolveBreached, remainingAckMs, remainingResolveMs };
  }

  getSlaBreachEvents(): SlaBreachEvent[] {
    return [...this.breachEvents];
  }

  getRecordCount(): number {
    return this.records.length;
  }
}
