// APEX-SENTINEL — W20
// FR-W20-04: OperatorShiftHandover

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OperatorShiftHandover } from '../../src/workflow/operator-shift-handover.js';

// ── Types ────────────────────────────────────────────────────────────────────

type AlertStatus = 'NEW' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED' | 'ARCHIVED';
type ZoneType = 'airport' | 'nuclear' | 'military' | 'government';
type AwningLevel = 'CLEAR' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
type IncidentStatus = 'OPEN' | 'ACTIVE' | 'MONITORING' | 'CLOSED';

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

interface Incident {
  incidentId: string;
  zoneId: string;
  status: IncidentStatus;
  alertIds: string[];
  maxAwningLevel: AwningLevel;
  assignedOperator?: string;
}

interface ShiftHandover {
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

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Shift boundary: 12:00:00 UTC
const SHIFT_BOUNDARY_MS = new Date('2026-03-27T12:00:00.000Z').getTime();
const BASE_MS = new Date('2026-03-27T06:00:00.000Z').getTime(); // mid-shift

const makeAlert = (overrides: Partial<Alert> = {}): Alert => ({
  alertId: `alert-${Math.random().toString(36).slice(2, 8)}`,
  correlationId: `corr-${Math.random().toString(36).slice(2, 8)}`,
  status: 'NEW',
  zoneId: 'ZONE-AIRPORT-01',
  zoneType: 'airport',
  awningLevel: 'RED',
  detectedAt: BASE_MS - 3600_000, // 1h ago
  slaAckDeadline: BASE_MS - 3540_000,
  slaResolveDeadline: BASE_MS - 1800_000,
  transitions: [],
  aacrNotificationRequired: false,
  ...overrides,
});

const makeIncident = (overrides: Partial<Incident> = {}): Incident => ({
  incidentId: `inc-${Math.random().toString(36).slice(2, 8)}`,
  zoneId: 'ZONE-AIRPORT-01',
  status: 'ACTIVE',
  alertIds: ['a-001'],
  maxAwningLevel: 'RED',
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FR-W20-04: OperatorShiftHandover', () => {
  let handover: OperatorShiftHandover;
  let fixedMs: number;

  beforeEach(() => {
    fixedMs = BASE_MS;
    handover = new OperatorShiftHandover({ clockFn: () => fixedMs });
  });

  it('04-01: generateHandover produces ShiftHandover with all required fields', () => {
    const alerts = [makeAlert()];
    const incidents = [makeIncident()];
    const result: ShiftHandover = handover.generateHandover('op-alice', alerts, incidents, 'SITE-OTOPENI');
    expect(result.site).toBe('SITE-OTOPENI');
    expect(result.outgoingOperatorId).toBe('op-alice');
    expect(result.acknowledged).toBe(false);
    expect(result.generatedAt).toBeInstanceOf(Date);
    expect(Array.isArray(result.activeIncidents)).toBe(true);
    expect(Array.isArray(result.unresolvedAlerts)).toBe(true);
    expect(Array.isArray(result.pendingAacrNotifications)).toBe(true);
    expect(typeof result.telegramMessage).toBe('string');
    expect(result.detectionStats24h).toBeDefined();
  });

  it('04-02: generateHandover includes all non-CLOSED incidents', () => {
    const incidents = [
      makeIncident({ incidentId: 'inc-open', status: 'OPEN' }),
      makeIncident({ incidentId: 'inc-active', status: 'ACTIVE' }),
      makeIncident({ incidentId: 'inc-monitoring', status: 'MONITORING' }),
      makeIncident({ incidentId: 'inc-closed', status: 'CLOSED' }),
    ];
    const result = handover.generateHandover('op-alice', [], incidents, 'SITE-A');
    const ids = result.activeIncidents.map(i => i.incidentId);
    expect(ids).toContain('inc-open');
    expect(ids).toContain('inc-active');
    expect(ids).toContain('inc-monitoring');
    expect(ids).not.toContain('inc-closed');
  });

  it('04-03: generateHandover includes all alerts not RESOLVED/ARCHIVED', () => {
    const alerts = [
      makeAlert({ alertId: 'a-new', status: 'NEW' }),
      makeAlert({ alertId: 'a-acked', status: 'ACKNOWLEDGED' }),
      makeAlert({ alertId: 'a-investigating', status: 'INVESTIGATING' }),
      makeAlert({ alertId: 'a-resolved', status: 'RESOLVED' }),
      makeAlert({ alertId: 'a-archived', status: 'ARCHIVED' }),
    ];
    const result = handover.generateHandover('op-alice', alerts, [], 'SITE-B');
    const ids = result.unresolvedAlerts.map(a => a.alertId);
    expect(ids).toContain('a-new');
    expect(ids).toContain('a-acked');
    expect(ids).toContain('a-investigating');
    expect(ids).not.toContain('a-resolved');
    expect(ids).not.toContain('a-archived');
  });

  it('04-04: detectionStats24h counts correctly', () => {
    const now = BASE_MS;
    const zone1 = 'ZONE-A';
    const zone2 = 'ZONE-B';
    const alerts = [
      makeAlert({ alertId: 'a1', zoneId: zone1, detectedAt: now - 1 * 3600_000 }), // 1h ago
      makeAlert({ alertId: 'a2', zoneId: zone1, detectedAt: now - 2 * 3600_000 }), // 2h ago
      makeAlert({ alertId: 'a3', zoneId: zone2, detectedAt: now - 3 * 3600_000 }), // 3h ago
      makeAlert({ alertId: 'a4', zoneId: zone2, detectedAt: now - 25 * 3600_000 }), // 25h ago — excluded
    ];
    const result = handover.generateHandover('op-alice', alerts, [], 'SITE-C');
    expect(result.detectionStats24h.total).toBe(3);
    expect(result.detectionStats24h.byZone[zone1]).toBe(2);
    expect(result.detectionStats24h.byZone[zone2]).toBe(1);
  });

  it('04-05: pendingAacrNotifications = alerts where aacrNotificationRequired=true', () => {
    const alerts = [
      makeAlert({ alertId: 'a-aacr-1', aacrNotificationRequired: true }),
      makeAlert({ alertId: 'a-aacr-2', aacrNotificationRequired: true }),
      makeAlert({ alertId: 'a-no-aacr', aacrNotificationRequired: false }),
    ];
    const result = handover.generateHandover('op-alice', alerts, [], 'SITE-D');
    expect(result.pendingAacrNotifications).toHaveLength(2);
    expect(result.pendingAacrNotifications.every(a => a.aacrNotificationRequired)).toBe(true);
  });

  it('04-06: telegramMessage is non-empty string < 4096 chars', () => {
    const alerts = Array.from({ length: 10 }, (_, i) => makeAlert({ alertId: `a-${i}` }));
    const incidents = Array.from({ length: 5 }, (_, i) => makeIncident({ incidentId: `inc-${i}` }));
    const result = handover.generateHandover('op-alice', alerts, incidents, 'SITE-E');
    expect(result.telegramMessage.length).toBeGreaterThan(0);
    expect(result.telegramMessage.length).toBeLessThan(4096);
  });

  it('04-07: generateHandover emits handover_ready event', () => {
    const handler = vi.fn();
    handover.on('handover_ready', handler);
    handover.generateHandover('op-alice', [], [], 'SITE-F');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('04-08: acknowledgeHandover sets acknowledged=true and acknowledgedBy', () => {
    const result = handover.generateHandover('op-alice', [], [], 'SITE-G');
    const handoverId = result.site + ':' + result.generatedAt.toISOString();
    handover.acknowledgeHandover(handoverId, 'op-bob');
    const updated = handover.getHandover(handoverId);
    expect(updated?.acknowledged).toBe(true);
    expect(updated?.acknowledgedBy).toBe('op-bob');
  });

  it('04-09: checkShiftBoundary returns true at shift boundary (04:00/12:00/20:00 UTC)', () => {
    // At exactly 12:00:00 UTC
    fixedMs = SHIFT_BOUNDARY_MS;
    handover = new OperatorShiftHandover({ clockFn: () => fixedMs });
    expect(handover.checkShiftBoundary()).toBe(true);

    // At 04:00:00 UTC
    fixedMs = new Date('2026-03-27T04:00:00.000Z').getTime();
    handover = new OperatorShiftHandover({ clockFn: () => fixedMs });
    expect(handover.checkShiftBoundary()).toBe(true);

    // At 20:00:00 UTC
    fixedMs = new Date('2026-03-27T20:00:00.000Z').getTime();
    handover = new OperatorShiftHandover({ clockFn: () => fixedMs });
    expect(handover.checkShiftBoundary()).toBe(true);

    // At 06:00:00 UTC (mid-shift) — should be false
    fixedMs = BASE_MS;
    handover = new OperatorShiftHandover({ clockFn: () => fixedMs });
    expect(handover.checkShiftBoundary()).toBe(false);
  });

  it('04-10: generateHandover appends AuditEntry (HANDOVER_GENERATED action)', () => {
    handover.generateHandover('op-alice', [], [], 'SITE-H');
    const auditEntries = handover.getAuditEntries();
    const handoverEntry = auditEntries.find(e => e.action === 'HANDOVER_GENERATED');
    expect(handoverEntry).toBeDefined();
    expect(handoverEntry?.operatorId).toBe('op-alice');
  });
});
