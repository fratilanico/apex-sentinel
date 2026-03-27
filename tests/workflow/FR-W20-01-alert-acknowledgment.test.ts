// APEX-SENTINEL — W20
// FR-W20-01: AlertAcknowledgmentEngine

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AlertAcknowledgmentEngine } from '../../src/workflow/alert-acknowledgment-engine.js';

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

interface SlaRecord { alertId: string; event: string; outcome: SlaOutcome; }

interface ZoneBreach {
  correlationId: string;
  zoneId: string;
  zoneType: ZoneType;
  awningLevel: AwningLevel;
  detectedAt: number;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_MS = 1_000_000_000;

const makeBreach = (overrides: Partial<ZoneBreach> = {}): ZoneBreach => ({
  correlationId: 'corr-001',
  zoneId: 'ZONE-AIRPORT-01',
  zoneType: 'airport',
  awningLevel: 'RED',
  detectedAt: BASE_MS,
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FR-W20-01: AlertAcknowledgmentEngine', () => {
  let engine: AlertAcknowledgmentEngine;
  let fixedMs: number;

  beforeEach(() => {
    fixedMs = BASE_MS;
    engine = new AlertAcknowledgmentEngine({ clockFn: () => fixedMs });
  });

  it('01-01: ingestAlert creates Alert in NEW status with correct SLA deadlines per zoneType', () => {
    // airport SLA: ack=60000ms, resolve=30min
    const airportBreach = makeBreach({ zoneType: 'airport', detectedAt: BASE_MS });
    const alert = engine.ingestAlert(airportBreach);
    expect(alert.status).toBe('NEW');
    expect(alert.slaAckDeadline).toBe(BASE_MS + 60_000);

    const nuclearBreach = makeBreach({ correlationId: 'corr-nuc', zoneId: 'ZONE-NUCLEAR-01', zoneType: 'nuclear', detectedAt: BASE_MS });
    const nucAlert = engine.ingestAlert(nuclearBreach);
    expect(nucAlert.slaAckDeadline).toBe(BASE_MS + 30_000);

    const govBreach = makeBreach({ correlationId: 'corr-gov', zoneId: 'ZONE-GOV-01', zoneType: 'government', detectedAt: BASE_MS });
    const govAlert = engine.ingestAlert(govBreach);
    expect(govAlert.slaAckDeadline).toBe(BASE_MS + 120_000);
  });

  it('01-02: acknowledge within SLA → status=ACKNOWLEDGED, SlaRecord.outcome=COMPLIANT', () => {
    const alert = engine.ingestAlert(makeBreach());
    fixedMs = BASE_MS + 30_000; // within 60s airport SLA
    const record: SlaRecord = engine.acknowledge(alert.alertId, 'op-001');
    const updated = engine.getActiveAlerts().find(a => a.alertId === alert.alertId);
    expect(updated?.status).toBe('ACKNOWLEDGED');
    expect(record.outcome).toBe('COMPLIANT');
  });

  it('01-03: acknowledge after SLA → SlaRecord.outcome=SLA_BREACH + emits sla_breach event', () => {
    const alert = engine.ingestAlert(makeBreach());
    const breachHandler = vi.fn();
    engine.on('sla_breach', breachHandler);
    fixedMs = BASE_MS + 90_000; // past 60s airport SLA
    const record: SlaRecord = engine.acknowledge(alert.alertId, 'op-001');
    expect(record.outcome).toBe('SLA_BREACH');
    expect(breachHandler).toHaveBeenCalledOnce();
  });

  it('01-04: acknowledge requires non-empty operatorId → throws Error', () => {
    const alert = engine.ingestAlert(makeBreach());
    expect(() => engine.acknowledge(alert.alertId, '')).toThrow();
    expect(() => engine.acknowledge(alert.alertId, '   ')).toThrow();
  });

  it('01-05: acknowledge on non-NEW alert → throws Error (InvalidTransitionError)', () => {
    const alert = engine.ingestAlert(makeBreach());
    engine.acknowledge(alert.alertId, 'op-001');
    expect(() => engine.acknowledge(alert.alertId, 'op-002')).toThrow();
  });

  it('01-06: beginInvestigation: ACKNOWLEDGED→INVESTIGATING with actionNote', () => {
    const alert = engine.ingestAlert(makeBreach());
    engine.acknowledge(alert.alertId, 'op-001');
    engine.beginInvestigation(alert.alertId, 'Dispatching unit to sector 4');
    const updated = engine.getActiveAlerts().find(a => a.alertId === alert.alertId);
    expect(updated?.status).toBe('INVESTIGATING');
    const transition = updated?.transitions.find(t => t.to === 'INVESTIGATING');
    expect(transition?.note).toBe('Dispatching unit to sector 4');
  });

  it('01-07: beginInvestigation requires non-empty actionNote → throws Error', () => {
    const alert = engine.ingestAlert(makeBreach());
    engine.acknowledge(alert.alertId, 'op-001');
    expect(() => engine.beginInvestigation(alert.alertId, '')).toThrow();
  });

  it('01-08: resolveAlert: INVESTIGATING→RESOLVED with outcome string', () => {
    const alert = engine.ingestAlert(makeBreach());
    engine.acknowledge(alert.alertId, 'op-001');
    engine.beginInvestigation(alert.alertId, 'Investigating');
    engine.resolveAlert(alert.alertId, 'DRONE_CONFIRMED');
    const resolved = engine.getActiveAlerts({ status: 'RESOLVED' }).find(a => a.alertId === alert.alertId);
    expect(resolved?.status).toBe('RESOLVED');
  });

  it('01-09: resolveAlert records SlaRecord (COMPLIANT if within 30min of detection)', () => {
    const alert = engine.ingestAlert(makeBreach());
    engine.acknowledge(alert.alertId, 'op-001');
    engine.beginInvestigation(alert.alertId, 'Investigating');
    fixedMs = BASE_MS + 20 * 60_000; // 20min — within 30min resolve SLA
    const record: SlaRecord = engine.resolveAlert(alert.alertId, 'CLEAR_AIRSPACE');
    expect(record.outcome).toBe('COMPLIANT');
  });

  it('01-10: resolveAlert with outcome=FALSE_POSITIVE records correctly', () => {
    const alert = engine.ingestAlert(makeBreach());
    engine.acknowledge(alert.alertId, 'op-001');
    engine.beginInvestigation(alert.alertId, 'Investigating');
    const record: SlaRecord = engine.resolveAlert(alert.alertId, 'FALSE_POSITIVE');
    expect(record.alertId).toBe(alert.alertId);
    expect(record.outcome).toBeDefined();
  });

  it('01-11: getActiveAlerts filters by status', () => {
    const a1 = engine.ingestAlert(makeBreach({ correlationId: 'c1', zoneId: 'Z1' }));
    engine.ingestAlert(makeBreach({ correlationId: 'c2', zoneId: 'Z2' }));
    engine.acknowledge(a1.alertId, 'op-001');
    const acked = engine.getActiveAlerts({ status: 'ACKNOWLEDGED' });
    expect(acked.every(a => a.status === 'ACKNOWLEDGED')).toBe(true);
    expect(acked.length).toBeGreaterThanOrEqual(1);
  });

  it('01-12: getActiveAlerts filters by zoneType', () => {
    engine.ingestAlert(makeBreach({ correlationId: 'c-ap', zoneId: 'Z-AP', zoneType: 'airport' }));
    engine.ingestAlert(makeBreach({ correlationId: 'c-nu', zoneId: 'Z-NU', zoneType: 'nuclear' }));
    const airports = engine.getActiveAlerts({ zoneType: 'airport' });
    expect(airports.every(a => a.zoneType === 'airport')).toBe(true);
  });

  it('01-13: duplicate ingestAlert (same correlationId) → throws Error (DuplicateAlertError)', () => {
    engine.ingestAlert(makeBreach({ correlationId: 'dup-001' }));
    expect(() => engine.ingestAlert(makeBreach({ correlationId: 'dup-001' }))).toThrow();
  });
});
