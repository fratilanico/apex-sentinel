// APEX-SENTINEL — W20
// FR-W20-integration: W19→W20 End-to-End

import { describe, it, expect, beforeEach } from 'vitest';
import { AlertAcknowledgmentEngine } from '../../src/workflow/alert-acknowledgment-engine.js';
import { IncidentManager } from '../../src/workflow/incident-manager.js';
import { EscalationMatrix } from '../../src/workflow/escalation-matrix.js';

// ── Types ────────────────────────────────────────────────────────────────────

type AlertStatus = 'NEW' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED' | 'ARCHIVED';
type ZoneType = 'airport' | 'nuclear' | 'military' | 'government';
type AwningLevel = 'CLEAR' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
type SlaOutcome = 'COMPLIANT' | 'SLA_BREACH';
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

interface ZoneBreach {
  correlationId: string;
  zoneId: string;
  zoneType: ZoneType;
  awningLevel: AwningLevel;
  detectedAt: number;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_MS = 1_000_000_000;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FR-W20-integration: W19→W20 End-to-End', () => {

  it('E2E-01: Full flow: ZoneBreach → ingestAlert → correlate → acknowledge → beginInvestigation → resolveAlert → closeIncident → IncidentReport', () => {
    let fixedMs = BASE_MS;
    const ackEngine = new AlertAcknowledgmentEngine({ clockFn: () => fixedMs });
    const incManager = new IncidentManager({ clockFn: () => fixedMs });

    // 1. Ingest alert from a zone breach
    const breach: ZoneBreach = {
      correlationId: 'corr-e2e-01',
      zoneId: 'ZONE-AIRPORT-01',
      zoneType: 'airport',
      awningLevel: 'RED',
      detectedAt: BASE_MS,
    };
    const alert: Alert = ackEngine.ingestAlert(breach);
    expect(alert.status).toBe('NEW');

    // 2. Correlate into incident
    const incident: Incident = incManager.correlate(alert);
    expect(incident.status).toBe('OPEN');

    // 3. Acknowledge within SLA (30s, airport SLA=60s)
    fixedMs = BASE_MS + 30_000;
    const ackRecord = ackEngine.acknowledge(alert.alertId, 'op-alice');
    expect(ackRecord.outcome).toBe('COMPLIANT');

    // 4. Re-correlate updated alert state
    const ackedAlert = ackEngine.getActiveAlerts().find(a => a.alertId === alert.alertId)!;
    incManager.correlate(ackedAlert);

    // 5. Begin investigation
    ackEngine.beginInvestigation(alert.alertId, 'Visual confirmation via camera sector 3');
    const investigatingAlert = ackEngine.getActiveAlerts().find(a => a.alertId === alert.alertId)!;
    expect(investigatingAlert.status).toBe('INVESTIGATING');

    // 6. Resolve alert
    fixedMs = BASE_MS + 20 * 60_000; // 20min — within 30min resolve SLA
    const resolveRecord = ackEngine.resolveAlert(alert.alertId, 'DRONE_CONFIRMED');
    expect(resolveRecord.outcome).toBe('COMPLIANT');

    // 7. Close incident and get report
    const report: IncidentReport = incManager.closeIncident(incident.incidentId, 'DRONE_CONFIRMED');
    expect(report.incidentId).toBe(incident.incidentId);
    expect(report.outcome).toBe('DRONE_CONFIRMED');
    expect(report.alertIds).toContain(alert.alertId);
    expect(report.slaCompliant).toBe(true);
    expect(typeof report.duration).toBe('number');
    expect(report.duration).toBeGreaterThan(0);
  });

  it('E2E-02: SLA compliance flow: airport alert not acknowledged within 60s → SlaRecord.outcome=SLA_BREACH', () => {
    let fixedMs = BASE_MS;
    const ackEngine = new AlertAcknowledgmentEngine({ clockFn: () => fixedMs });

    const breach: ZoneBreach = {
      correlationId: 'corr-e2e-02',
      zoneId: 'ZONE-AIRPORT-02',
      zoneType: 'airport',
      awningLevel: 'ORANGE',
      detectedAt: BASE_MS,
    };
    const alert = ackEngine.ingestAlert(breach);
    expect(alert.slaAckDeadline).toBe(BASE_MS + 60_000); // 60s for airport

    // Acknowledge after 90s — SLA breach
    fixedMs = BASE_MS + 90_000;
    const record = ackEngine.acknowledge(alert.alertId, 'op-late');
    expect(record.outcome).toBe('SLA_BREACH');
    expect(record.alertId).toBe(alert.alertId);
  });

  it('E2E-03: Multi-zone airport+nuclear simultaneous: two alerts in different zones → two separate incidents', () => {
    const fixedMs = BASE_MS;
    const ackEngine = new AlertAcknowledgmentEngine({ clockFn: () => fixedMs });
    const incManager = new IncidentManager({ clockFn: () => fixedMs });
    const escalMatrix = new EscalationMatrix({ clockFn: () => fixedMs });

    // Airport breach
    const airportBreach: ZoneBreach = {
      correlationId: 'corr-airport',
      zoneId: 'ZONE-AIRPORT-03',
      zoneType: 'airport',
      awningLevel: 'RED',
      detectedAt: BASE_MS,
    };
    // Nuclear breach (simultaneous)
    const nuclearBreach: ZoneBreach = {
      correlationId: 'corr-nuclear',
      zoneId: 'ZONE-NUCLEAR-01',
      zoneType: 'nuclear',
      awningLevel: 'ORANGE',
      detectedAt: BASE_MS,
    };

    const airportAlert = ackEngine.ingestAlert(airportBreach);
    const nuclearAlert = ackEngine.ingestAlert(nuclearBreach);

    const airportIncident = incManager.correlate(airportAlert);
    const nuclearIncident = incManager.correlate(nuclearAlert);

    // Must be separate incidents
    expect(airportIncident.incidentId).not.toBe(nuclearIncident.incidentId);
    expect(airportIncident.zoneId).toBe('ZONE-AIRPORT-03');
    expect(nuclearIncident.zoneId).toBe('ZONE-NUCLEAR-01');

    // Escalation chains must differ
    const airportEsc = escalMatrix.evaluateEscalation(airportIncident, 'RED');
    const nuclearEsc = escalMatrix.evaluateEscalation(nuclearIncident, 'ORANGE');
    expect(airportEsc).not.toBeNull();
    expect(nuclearEsc).not.toBeNull();
    // Airport escalates to AACR, nuclear to SNN — contacts should differ
    expect(airportEsc!.contact).not.toBe(nuclearEsc!.contact);

    // Two active incidents total
    const activeIncidents = incManager.getActiveIncidents();
    expect(activeIncidents.length).toBeGreaterThanOrEqual(2);
  });
});
