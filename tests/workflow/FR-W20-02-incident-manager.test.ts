// APEX-SENTINEL — W20
// FR-W20-02: IncidentManager

import { describe, it, expect, beforeEach } from 'vitest';
import { IncidentManager } from '../../src/workflow/incident-manager.js';

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

interface IncidentReport {
  incidentId: string;
  zoneId: string;
  duration: number;
  alertIds: string[];
  timeline: unknown[];
  outcome: string;
  slaCompliant: boolean;
  regulatoryReportRequired: boolean;
}

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

describe('FR-W20-02: IncidentManager', () => {
  let manager: IncidentManager;

  beforeEach(() => {
    manager = new IncidentManager({ clockFn: () => BASE_MS });
  });

  it('02-01: correlate single alert → new Incident in OPEN status', () => {
    const alert = makeAlert({ alertId: 'a-001' });
    const incident: Incident = manager.correlate(alert);
    expect(incident.status).toBe('OPEN');
    expect(incident.alertIds).toContain('a-001');
    expect(incident.incidentId).toBeDefined();
  });

  it('02-02: two alerts from same zone within 10min → same Incident', () => {
    const t0 = BASE_MS;
    const t1 = BASE_MS + 5 * 60_000; // 5min later — same 10min window
    const a1 = makeAlert({ alertId: 'a-001', zoneId: 'ZONE-A', detectedAt: t0 });
    const a2 = makeAlert({ alertId: 'a-002', zoneId: 'ZONE-A', detectedAt: t1 });
    const inc1 = manager.correlate(a1);
    const inc2 = manager.correlate(a2);
    expect(inc1.incidentId).toBe(inc2.incidentId);
    expect(inc2.alertIds).toHaveLength(2);
  });

  it('02-03: two alerts from same zone 11min apart → separate Incidents', () => {
    const t0 = BASE_MS;
    const t1 = BASE_MS + 11 * 60_000; // 11min — different 10min window
    const a1 = makeAlert({ alertId: 'a-001', zoneId: 'ZONE-B', detectedAt: t0 });
    const a2 = makeAlert({ alertId: 'a-002', zoneId: 'ZONE-B', detectedAt: t1 });
    const inc1 = manager.correlate(a1);
    const inc2 = manager.correlate(a2);
    expect(inc1.incidentId).not.toBe(inc2.incidentId);
  });

  it('02-04: alerts from different zones → separate Incidents', () => {
    const a1 = makeAlert({ alertId: 'a-001', zoneId: 'ZONE-C', detectedAt: BASE_MS });
    const a2 = makeAlert({ alertId: 'a-002', zoneId: 'ZONE-D', detectedAt: BASE_MS });
    const inc1 = manager.correlate(a1);
    const inc2 = manager.correlate(a2);
    expect(inc1.incidentId).not.toBe(inc2.incidentId);
  });

  it('02-05: Incident OPEN→ACTIVE when first alert ACKNOWLEDGED', () => {
    const alert = makeAlert({ alertId: 'a-001', status: 'NEW' });
    const incident = manager.correlate(alert);
    const ackedAlert = { ...alert, status: 'ACKNOWLEDGED' as AlertStatus };
    manager.correlate(ackedAlert);
    const active = manager.getActiveIncidents().find(i => i.incidentId === incident.incidentId);
    expect(active?.status).toBe('ACTIVE');
  });

  it('02-06: Incident ACTIVE→MONITORING when all alerts INVESTIGATING', () => {
    const a1 = makeAlert({ alertId: 'a-001', zoneId: 'ZONE-E', status: 'NEW' });
    const a2 = makeAlert({ alertId: 'a-002', zoneId: 'ZONE-E', status: 'NEW', detectedAt: BASE_MS + 60_000 * 2 });
    const incident = manager.correlate(a1);
    manager.correlate(a2);
    manager.correlate({ ...a1, status: 'ACKNOWLEDGED' });
    manager.correlate({ ...a2, status: 'ACKNOWLEDGED' });
    manager.correlate({ ...a1, status: 'INVESTIGATING' });
    manager.correlate({ ...a2, status: 'INVESTIGATING' });
    const updated = manager.getActiveIncidents().find(i => i.incidentId === incident.incidentId);
    expect(updated?.status).toBe('MONITORING');
  });

  it('02-07: Incident MONITORING→CLOSED when all alerts RESOLVED', () => {
    const a1 = makeAlert({ alertId: 'a-001', zoneId: 'ZONE-F', status: 'INVESTIGATING' });
    const incident = manager.correlate(a1);
    manager.correlate({ ...a1, status: 'RESOLVED' });
    const report = manager.closeIncident(incident.incidentId, 'CLEAR_AIRSPACE');
    expect(report.outcome).toBe('CLEAR_AIRSPACE');
    const closed = manager.getActiveIncidents().find(i => i.incidentId === incident.incidentId);
    expect(closed).toBeUndefined(); // CLOSED not returned by getActiveIncidents
  });

  it('02-08: closeIncident with outcome=DRONE_CONFIRMED → IncidentReport with correct fields', () => {
    const a1 = makeAlert({ alertId: 'a-001', zoneId: 'ZONE-G' });
    const incident = manager.correlate(a1);
    const report: IncidentReport = manager.closeIncident(incident.incidentId, 'DRONE_CONFIRMED');
    expect(report.incidentId).toBe(incident.incidentId);
    expect(report.zoneId).toBe(a1.zoneId);
    expect(report.outcome).toBe('DRONE_CONFIRMED');
    expect(report.alertIds).toContain('a-001');
    expect(typeof report.duration).toBe('number');
  });

  it('02-09: IncidentReport.timeline includes all transitions', () => {
    const a1 = makeAlert({
      alertId: 'a-001',
      zoneId: 'ZONE-H',
      transitions: [
        { to: 'ACKNOWLEDGED', at: BASE_MS + 10_000, by: 'op-001' },
        { to: 'INVESTIGATING', at: BASE_MS + 20_000, by: 'op-001' },
      ],
    });
    const incident = manager.correlate(a1);
    const report = manager.closeIncident(incident.incidentId, 'RESOLVED');
    expect(Array.isArray(report.timeline)).toBe(true);
    expect(report.timeline.length).toBeGreaterThanOrEqual(2);
  });

  it('02-10: IncidentReport.slaCompliant=true when all alerts acked within SLA', () => {
    const a1 = makeAlert({
      alertId: 'a-001',
      zoneId: 'ZONE-I',
      transitions: [{ to: 'ACKNOWLEDGED', at: BASE_MS + 30_000, by: 'op-001' }], // within 60s
      slaAckDeadline: BASE_MS + 60_000,
    });
    const incident = manager.correlate(a1);
    const report = manager.closeIncident(incident.incidentId, 'RESOLVED');
    expect(report.slaCompliant).toBe(true);
  });

  it('02-11: IncidentReport.slaCompliant=false when any alert breached SLA', () => {
    const a1 = makeAlert({
      alertId: 'a-001',
      zoneId: 'ZONE-J',
      transitions: [{ to: 'ACKNOWLEDGED', at: BASE_MS + 90_000, by: 'op-001' }], // past 60s
      slaAckDeadline: BASE_MS + 60_000,
    });
    const incident = manager.correlate(a1);
    const report = manager.closeIncident(incident.incidentId, 'RESOLVED');
    expect(report.slaCompliant).toBe(false);
  });

  it('02-12: getActiveIncidents returns only non-CLOSED incidents', () => {
    const a1 = makeAlert({ alertId: 'a-001', zoneId: 'ZONE-K' });
    const a2 = makeAlert({ alertId: 'a-002', zoneId: 'ZONE-L' });
    const inc1 = manager.correlate(a1);
    manager.correlate(a2);
    manager.closeIncident(inc1.incidentId, 'RESOLVED');
    const active = manager.getActiveIncidents();
    expect(active.every(i => i.status !== 'CLOSED')).toBe(true);
  });

  it('02-13: getActiveIncidents filter by assignedOperator', () => {
    const a1 = makeAlert({ alertId: 'a-001', zoneId: 'ZONE-M' });
    const a2 = makeAlert({ alertId: 'a-002', zoneId: 'ZONE-N' });
    const inc1 = manager.correlate(a1);
    manager.correlate(a2);
    manager.assignOperator(inc1.incidentId, 'op-alice');
    const aliceIncidents = manager.getActiveIncidents({ assignedOperator: 'op-alice' });
    expect(aliceIncidents.every(i => i.assignedOperator === 'op-alice')).toBe(true);
  });

  it('02-14: maxAwningLevel tracks worst AWNING level across all constituent alerts', () => {
    const a1 = makeAlert({ alertId: 'a-001', zoneId: 'ZONE-O', awningLevel: 'YELLOW' });
    const a2 = makeAlert({ alertId: 'a-002', zoneId: 'ZONE-O', awningLevel: 'RED', detectedAt: BASE_MS + 60_000 });
    const incident = manager.correlate(a1);
    manager.correlate(a2);
    const updated = manager.getActiveIncidents().find(i => i.incidentId === incident.incidentId);
    expect(updated?.maxAwningLevel).toBe('RED');
  });
});
