// APEX-SENTINEL — W20
// FR-W20-05: SlaComplianceTracker

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SlaComplianceTracker } from '../../src/workflow/sla-compliance-tracker.js';

// ── Types ────────────────────────────────────────────────────────────────────

type AlertStatus = 'NEW' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED' | 'ARCHIVED';
type ZoneType = 'airport' | 'nuclear' | 'military' | 'government';
type AwningLevel = 'CLEAR' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
type SlaOutcome = 'COMPLIANT' | 'SLA_BREACH';

interface AlertTransition { to: AlertStatus; at: number; by: string; note?: string; }

interface Alert {
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
}

interface SlaBreachEvent { alertId: string; event: string; overrunMs: number; }

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_MS = 1_000_000_000;

const makeAlert = (overrides: Partial<Alert> = {}): Alert => ({
  alertId: `alert-${Math.random().toString(36).slice(2, 8)}`,
  correlationId: 'corr-001',
  status: 'NEW',
  zoneId: 'ZONE-AIRPORT-01',
  zoneType: 'airport',
  awningLevel: 'RED',
  detectedAt: BASE_MS,
  slaAckDeadline: BASE_MS + 60_000,
  slaResolveDeadline: BASE_MS + 1_800_000,
  transitions: [],
  aacrNotificationRequired: false,
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FR-W20-05: SlaComplianceTracker', () => {
  let tracker: SlaComplianceTracker;
  let fixedMs: number;

  beforeEach(() => {
    fixedMs = BASE_MS;
    tracker = new SlaComplianceTracker({ clockFn: () => fixedMs });
  });

  it('05-01: recordEvent COMPLIANT increments compliant count', () => {
    tracker.recordEvent('a-001', 'ACK', 'COMPLIANT');
    const result = tracker.computeCompliance();
    expect(result).toBe(100);
  });

  it('05-02: recordEvent BREACH increments breach count and emits sla_breach', () => {
    const handler = vi.fn();
    tracker.on('sla_breach', handler);
    tracker.recordEvent('a-001', 'ACK', 'SLA_BREACH');
    expect(handler).toHaveBeenCalledOnce();
    const result = tracker.computeCompliance();
    expect(result).toBe(0);
  });

  it('05-03: computeCompliance returns 100 when all records COMPLIANT', () => {
    tracker.recordEvent('a-001', 'ACK', 'COMPLIANT');
    tracker.recordEvent('a-002', 'ACK', 'COMPLIANT');
    tracker.recordEvent('a-003', 'RESOLVE', 'COMPLIANT');
    expect(tracker.computeCompliance()).toBe(100);
  });

  it('05-04: computeCompliance returns 0 when all records BREACH', () => {
    tracker.recordEvent('a-001', 'ACK', 'SLA_BREACH');
    tracker.recordEvent('a-002', 'ACK', 'SLA_BREACH');
    expect(tracker.computeCompliance()).toBe(0);
  });

  it('05-05: computeCompliance returns 75 for 3:1 compliant:breach ratio', () => {
    tracker.recordEvent('a-001', 'ACK', 'COMPLIANT');
    tracker.recordEvent('a-002', 'ACK', 'COMPLIANT');
    tracker.recordEvent('a-003', 'ACK', 'COMPLIANT');
    tracker.recordEvent('a-004', 'ACK', 'SLA_BREACH');
    expect(tracker.computeCompliance()).toBe(75);
  });

  it('05-06: rolling 24h window excludes records older than 24h', () => {
    const TWENTY_FIVE_HOURS_AGO = BASE_MS - 25 * 3600_000;
    // Inject old record directly via method with explicit timestamp
    tracker.recordEvent('a-old', 'ACK', 'SLA_BREACH', TWENTY_FIVE_HOURS_AGO);
    // New compliant record at current time
    tracker.recordEvent('a-new', 'ACK', 'COMPLIANT');
    // Old breach should be excluded — compliance should be 100
    expect(tracker.computeCompliance()).toBe(100);
  });

  it('05-07: checkSla on alert within ack SLA → ackBreached=false', () => {
    fixedMs = BASE_MS + 30_000; // 30s — within 60s airport SLA
    const alert = makeAlert({ slaAckDeadline: BASE_MS + 60_000 });
    const status = tracker.checkSla(alert);
    expect(status.ackBreached).toBe(false);
    expect(status.remainingAckMs).toBeGreaterThan(0);
  });

  it('05-08: checkSla on alert past ack SLA → ackBreached=true, remainingAckMs<0', () => {
    fixedMs = BASE_MS + 90_000; // 90s — past 60s airport SLA
    const alert = makeAlert({ slaAckDeadline: BASE_MS + 60_000 });
    const status = tracker.checkSla(alert);
    expect(status.ackBreached).toBe(true);
    expect(status.remainingAckMs).toBeLessThan(0);
  });

  it('05-09: checkSla on alert within resolve SLA → resolveBreached=false', () => {
    fixedMs = BASE_MS + 10 * 60_000; // 10min — within 30min SLA
    const alert = makeAlert({ slaResolveDeadline: BASE_MS + 30 * 60_000 });
    const status = tracker.checkSla(alert);
    expect(status.resolveBreached).toBe(false);
  });

  it('05-10: SlaBreachEvent.overrunMs = (now - slaDeadline) for breached event', () => {
    const deadline = BASE_MS + 60_000;
    fixedMs = BASE_MS + 90_000; // 30s overrun
    const alert = makeAlert({ alertId: 'a-breach', slaAckDeadline: deadline });
    tracker.checkSla(alert); // triggers internal breach detection
    // Also record breach event explicitly
    tracker.recordEvent('a-breach', 'ACK', 'SLA_BREACH', fixedMs, deadline);
    const breachEvents: SlaBreachEvent[] = tracker.getSlaBreachEvents();
    const ev = breachEvents.find(e => e.alertId === 'a-breach');
    expect(ev).toBeDefined();
    expect(ev!.overrunMs).toBe(30_000); // 90_000 - 60_000
  });

  it('05-11: rolling window evicts oldest 10% at 10_000 record capacity', () => {
    // Insert 10_000 records
    for (let i = 0; i < 10_000; i++) {
      tracker.recordEvent(`a-${i}`, 'ACK', 'COMPLIANT');
    }
    // Insert one more — should evict oldest 10% (1000 records)
    tracker.recordEvent('a-overflow', 'ACK', 'COMPLIANT');
    const size = tracker.getRecordCount();
    // After eviction: 10_000 - 1000 + 1 = 9001
    expect(size).toBeLessThanOrEqual(9001);
  });
});
