// APEX-SENTINEL — W20
// FR-W20-08: W20OperatorWorkflowPipeline

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { W20OperatorWorkflowPipeline } from '../../src/workflow/w20-operator-workflow-pipeline.js';
import { AuditTrailExporter } from '../../src/workflow/audit-trail-exporter.js';

// ── Types ────────────────────────────────────────────────────────────────────

type ZoneType = 'airport' | 'nuclear' | 'military' | 'government';
type AwningLevel = 'CLEAR' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
type AlertStatus = 'NEW' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED' | 'ARCHIVED';
type IncidentStatus = 'OPEN' | 'ACTIVE' | 'MONITORING' | 'CLOSED';
type EscalationTrigger = 'AUTOMATIC' | 'MANUAL';

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
  transitions: { to: AlertStatus; at: number; by: string; note?: string }[];
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

interface Escalation {
  escalationId: string;
  incidentId: string;
  level: number;
  trigger: EscalationTrigger;
  acknowledged: boolean;
  triggeredAt: number;
}

interface OperatorWorkflowState {
  alerts: Alert[];
  incidents: Incident[];
  escalations: Escalation[];
  slaStatus: { compliancePct: number };
  handoverDue: boolean;
  generatedAt: Date;
}

interface MockThreatIntelPicture {
  breaches: {
    zoneId: string;
    zoneType: ZoneType;
    correlationId: string;
    firstDetectedAt: string;
    severity: string;
  }[];
  awningLevels: Record<string, AwningLevel>;
  generatedAt: Date;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Mid-shift: not near 04:00/12:00/20:00 UTC
const MID_SHIFT_MS = new Date('2026-03-27T08:00:00.000Z').getTime();
// Near 12:00 UTC shift boundary (within 5 min)
const NEAR_BOUNDARY_MS = new Date('2026-03-27T11:57:00.000Z').getTime();

const makeTip = (overrides: Partial<MockThreatIntelPicture> = {}): MockThreatIntelPicture => ({
  breaches: [
    {
      zoneId: 'ZONE-AIRPORT-01',
      zoneType: 'airport',
      correlationId: 'corr-001',
      firstDetectedAt: new Date(MID_SHIFT_MS - 120_000).toISOString(), // 2min ago
      severity: 'HIGH',
    },
  ],
  awningLevels: { 'ZONE-AIRPORT-01': 'RED' },
  generatedAt: new Date(MID_SHIFT_MS),
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FR-W20-08: W20OperatorWorkflowPipeline', () => {
  let pipeline: W20OperatorWorkflowPipeline;
  let exporter: AuditTrailExporter;
  let fixedMs: number;

  beforeEach(() => {
    fixedMs = MID_SHIFT_MS;
    exporter = new AuditTrailExporter();
    pipeline = new W20OperatorWorkflowPipeline({
      clockFn: () => fixedMs,
      auditTrail: exporter,
    });
  });

  it('08-01: process(tip) with one ZoneBreach creates one Alert → returns OperatorWorkflowState', async () => {
    const tip = makeTip();
    const state: OperatorWorkflowState = await pipeline.process(tip);
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0].correlationId).toBe('corr-001');
    expect(state.generatedAt).toBeInstanceOf(Date);
  });

  it('08-02: process(tip) emits alert_new for each new Alert', async () => {
    const handler = vi.fn();
    pipeline.on('alert_new', handler);
    const tip = makeTip();
    await pipeline.process(tip);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('08-03: process(tip) with two correlated breaches in same zone/time → one Incident, emits incident_opened', async () => {
    const handler = vi.fn();
    pipeline.on('incident_opened', handler);
    const tip = makeTip({
      breaches: [
        {
          zoneId: 'ZONE-AIRPORT-01',
          zoneType: 'airport',
          correlationId: 'corr-aa1',
          firstDetectedAt: new Date(MID_SHIFT_MS - 60_000).toISOString(),
          severity: 'HIGH',
        },
        {
          zoneId: 'ZONE-AIRPORT-01',
          zoneType: 'airport',
          correlationId: 'corr-aa2',
          firstDetectedAt: new Date(MID_SHIFT_MS - 30_000).toISOString(), // within same 10min window
          severity: 'MEDIUM',
        },
      ],
      awningLevels: { 'ZONE-AIRPORT-01': 'RED' },
    });
    const state = await pipeline.process(tip);
    expect(state.incidents).toHaveLength(1);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('08-04: process(tip) with AWNING=RED + expired SLA → emits escalation_triggered', async () => {
    const handler = vi.fn();
    pipeline.on('escalation_triggered', handler);
    // SLA expired: detectedAt 2h ago, airport ack SLA = 60s
    const tip = makeTip({
      breaches: [{
        zoneId: 'ZONE-AIRPORT-01',
        zoneType: 'airport',
        correlationId: 'corr-sla-breach',
        firstDetectedAt: new Date(MID_SHIFT_MS - 2 * 3600_000).toISOString(),
        severity: 'HIGH',
      }],
      awningLevels: { 'ZONE-AIRPORT-01': 'RED' },
    });
    await pipeline.process(tip);
    expect(handler).toHaveBeenCalled();
  });

  it('08-05: process(tip) with AWNING=CLEAR → no escalation_triggered', async () => {
    const handler = vi.fn();
    pipeline.on('escalation_triggered', handler);
    const tip = makeTip({
      awningLevels: { 'ZONE-AIRPORT-01': 'CLEAR' },
      breaches: [{
        zoneId: 'ZONE-AIRPORT-01',
        zoneType: 'airport',
        correlationId: 'corr-clear',
        firstDetectedAt: new Date(MID_SHIFT_MS).toISOString(),
        severity: 'LOW',
      }],
    });
    await pipeline.process(tip);
    expect(handler).not.toHaveBeenCalled();
  });

  it('08-06: slaStatus in OperatorWorkflowState reflects computeCompliance()', async () => {
    const tip = makeTip();
    const state = await pipeline.process(tip);
    expect(typeof state.slaStatus.compliancePct).toBe('number');
    expect(state.slaStatus.compliancePct).toBeGreaterThanOrEqual(0);
    expect(state.slaStatus.compliancePct).toBeLessThanOrEqual(100);
  });

  it('08-07: handoverDue=true when clockFn is at shift boundary (within 5min)', async () => {
    fixedMs = NEAR_BOUNDARY_MS; // 3 min before 12:00 UTC
    pipeline = new W20OperatorWorkflowPipeline({
      clockFn: () => fixedMs,
      auditTrail: exporter,
    });
    const tip = makeTip();
    const state = await pipeline.process(tip);
    expect(state.handoverDue).toBe(true);
  });

  it('08-08: handoverDue=false when not near shift boundary', async () => {
    fixedMs = MID_SHIFT_MS; // 08:00 UTC — far from any boundary
    const tip = makeTip();
    const state = await pipeline.process(tip);
    expect(state.handoverDue).toBe(false);
  });

  it('08-09: process() at shift boundary emits handover_ready', async () => {
    const handler = vi.fn();
    fixedMs = NEAR_BOUNDARY_MS;
    pipeline = new W20OperatorWorkflowPipeline({
      clockFn: () => fixedMs,
      auditTrail: exporter,
    });
    pipeline.on('handover_ready', handler);
    await pipeline.process(makeTip());
    expect(handler).toHaveBeenCalled();
  });

  it('08-10: operator actions captured in AuditTrailExporter (ingest creates ALERT_INGESTED audit entry)', async () => {
    await pipeline.process(makeTip());
    const entries = exporter.exportJSON();
    const ingestEntry = entries.find(e => e.action === 'ALERT_INGESTED');
    expect(ingestEntry).toBeDefined();
    expect(ingestEntry!.resourceId).toBeDefined();
  });

  it('08-11: OperatorWorkflowState.escalations includes all triggered Escalations', async () => {
    const tip = makeTip({
      breaches: [{
        zoneId: 'ZONE-AIRPORT-01',
        zoneType: 'airport',
        correlationId: 'corr-esc',
        firstDetectedAt: new Date(MID_SHIFT_MS - 3 * 3600_000).toISOString(), // long past SLA
        severity: 'HIGH',
      }],
      awningLevels: { 'ZONE-AIRPORT-01': 'RED' },
    });
    const state = await pipeline.process(tip);
    expect(Array.isArray(state.escalations)).toBe(true);
    // With RED + long-expired SLA, at least one escalation expected
    expect(state.escalations.length).toBeGreaterThanOrEqual(1);
  });

  it('08-12: multi-zone tip creates Alerts in correct zones without cross-contamination', async () => {
    const tip = makeTip({
      breaches: [
        {
          zoneId: 'ZONE-AIRPORT-01',
          zoneType: 'airport',
          correlationId: 'corr-ap',
          firstDetectedAt: new Date(MID_SHIFT_MS).toISOString(),
          severity: 'HIGH',
        },
        {
          zoneId: 'ZONE-NUCLEAR-01',
          zoneType: 'nuclear',
          correlationId: 'corr-nu',
          firstDetectedAt: new Date(MID_SHIFT_MS).toISOString(),
          severity: 'CRITICAL',
        },
      ],
      awningLevels: { 'ZONE-AIRPORT-01': 'YELLOW', 'ZONE-NUCLEAR-01': 'ORANGE' },
    });
    const state = await pipeline.process(tip);
    expect(state.alerts).toHaveLength(2);
    const airportAlert = state.alerts.find(a => a.zoneId === 'ZONE-AIRPORT-01');
    const nuclearAlert = state.alerts.find(a => a.zoneId === 'ZONE-NUCLEAR-01');
    expect(airportAlert?.zoneType).toBe('airport');
    expect(nuclearAlert?.zoneType).toBe('nuclear');
    expect(airportAlert?.awningLevel).toBe('YELLOW');
    expect(nuclearAlert?.awningLevel).toBe('ORANGE');
  });

  it('08-13: process() same correlationId twice does NOT create duplicate Alerts (idempotent)', async () => {
    const tip = makeTip();
    const state1 = await pipeline.process(tip);
    const state2 = await pipeline.process(tip); // same tip, same correlationId
    // Total alerts should remain 1 (deduplicated by correlationId)
    expect(state2.alerts.length).toBe(state1.alerts.length);
    const correlationIds = state2.alerts.map(a => a.correlationId);
    const unique = new Set(correlationIds);
    expect(unique.size).toBe(correlationIds.length);
  });
});
