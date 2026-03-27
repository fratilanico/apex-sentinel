// APEX-SENTINEL — W20
// FR-W20-03: EscalationMatrix

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EscalationMatrix } from '../../src/workflow/escalation-matrix.js';

// ── Types ────────────────────────────────────────────────────────────────────

type ZoneType = 'airport' | 'nuclear' | 'military' | 'government';
type AwningLevel = 'CLEAR' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
type IncidentStatus = 'OPEN' | 'ACTIVE' | 'MONITORING' | 'CLOSED';
type EscalationTrigger = 'AUTOMATIC' | 'MANUAL';

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
  contact?: string;
  triggeredBy?: string;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_MS = 1_000_000_000;

const makeIncident = (overrides: Partial<Incident> & { zoneType?: ZoneType } = {}): Incident & { zoneType: ZoneType } => ({
  incidentId: `inc-${Math.random().toString(36).slice(2, 8)}`,
  zoneId: 'ZONE-AIRPORT-01',
  zoneType: 'airport',
  status: 'ACTIVE',
  alertIds: ['a-001'],
  maxAwningLevel: 'RED',
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FR-W20-03: EscalationMatrix', () => {
  let matrix: EscalationMatrix;
  let fixedMs: number;

  beforeEach(() => {
    fixedMs = BASE_MS;
    matrix = new EscalationMatrix({ clockFn: () => fixedMs });
  });

  it('03-01: airport AWNING=RED + ack SLA breach → evaluateEscalation returns Level 2 (AACR)', () => {
    const incident = makeIncident({ zoneType: 'airport', maxAwningLevel: 'RED', status: 'ACTIVE' });
    const result = matrix.evaluateEscalation(incident, 'RED', { slaBreached: true });
    expect(result).not.toBeNull();
    expect(result!.level).toBe(2);
    expect(result!.contact).toMatch(/AACR/i);
  });

  it('03-02: airport AWNING=CLEAR → evaluateEscalation returns null', () => {
    const incident = makeIncident({ zoneType: 'airport', maxAwningLevel: 'CLEAR' });
    const result = matrix.evaluateEscalation(incident, 'CLEAR');
    expect(result).toBeNull();
  });

  it('03-03: nuclear AWNING=ORANGE → evaluateEscalation returns Level 1 (Site Security)', () => {
    const incident = makeIncident({ zoneType: 'nuclear', maxAwningLevel: 'ORANGE' });
    const result = matrix.evaluateEscalation(incident, 'ORANGE');
    expect(result).not.toBeNull();
    expect(result!.level).toBe(1);
    expect(result!.contact).toMatch(/SNN|Site Security/i);
  });

  it('03-04: nuclear AWNING=ORANGE + 10min elapsed → evaluateEscalation returns Level 2 (SNN)', () => {
    fixedMs = BASE_MS + 10 * 60_000;
    const incident = makeIncident({ zoneType: 'nuclear', maxAwningLevel: 'ORANGE', status: 'ACTIVE' });
    const result = matrix.evaluateEscalation(incident, 'ORANGE', { elapsedMs: 10 * 60_000 });
    expect(result).not.toBeNull();
    expect(result!.level).toBe(2);
    expect(result!.contact).toMatch(/SNN Directorate/i);
  });

  it('03-05: military AWNING=YELLOW → evaluateEscalation returns Level 1 (Base Commander)', () => {
    const incident = makeIncident({ zoneType: 'military', maxAwningLevel: 'YELLOW' });
    const result = matrix.evaluateEscalation(incident, 'YELLOW');
    expect(result).not.toBeNull();
    expect(result!.level).toBe(1);
    expect(result!.contact).toMatch(/Base Commander/i);
  });

  it('03-06: military AWNING=YELLOW + 20min elapsed → evaluateEscalation returns Level 3 (NATO CAOC)', () => {
    const incident = makeIncident({ zoneType: 'military', maxAwningLevel: 'YELLOW' });
    const result = matrix.evaluateEscalation(incident, 'YELLOW', { elapsedMs: 20 * 60_000 });
    expect(result).not.toBeNull();
    expect(result!.level).toBe(3);
    expect(result!.contact).toMatch(/NATO CAOC/i);
  });

  it('03-07: government AWNING=RED → evaluateEscalation returns Level 1 (SPP)', () => {
    const incident = makeIncident({ zoneType: 'government', maxAwningLevel: 'RED' });
    const result = matrix.evaluateEscalation(incident, 'RED');
    expect(result).not.toBeNull();
    expect(result!.level).toBe(1);
    expect(result!.contact).toMatch(/SPP/i);
  });

  it('03-08: executeEscalation creates Escalation record and emits escalation_triggered', () => {
    const handler = vi.fn();
    matrix.on('escalation_triggered', handler);
    const incident = makeIncident({ zoneType: 'airport', maxAwningLevel: 'RED' });
    const escalation: Escalation = matrix.executeEscalation(incident, 2);
    expect(escalation.escalationId).toBeDefined();
    expect(escalation.incidentId).toBe(incident.incidentId);
    expect(escalation.level).toBe(2);
    expect(escalation.trigger).toBe('AUTOMATIC');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('03-09: acknowledgeEscalation sets acknowledged=true', () => {
    const incident = makeIncident({ zoneType: 'airport', maxAwningLevel: 'RED' });
    const escalation = matrix.executeEscalation(incident, 1);
    expect(escalation.acknowledged).toBe(false);
    matrix.acknowledgeEscalation(escalation.escalationId);
    const acked = matrix.getEscalationChain(incident.incidentId).find(e => e.escalationId === escalation.escalationId);
    expect(acked?.acknowledged).toBe(true);
  });

  it('03-10: getEscalationChain returns correct chain for all 4 zone types', () => {
    const airportChain = matrix.getEscalationChain('airport' as ZoneType);
    expect(airportChain).toContainEqual(expect.objectContaining({ contact: expect.stringMatching(/AACR/i) }));

    const nuclearChain = matrix.getEscalationChain('nuclear' as ZoneType);
    expect(nuclearChain).toContainEqual(expect.objectContaining({ contact: expect.stringMatching(/CNCAN|SRI/i) }));

    const militaryChain = matrix.getEscalationChain('military' as ZoneType);
    expect(militaryChain).toContainEqual(expect.objectContaining({ contact: expect.stringMatching(/NATO CAOC/i) }));

    const govChain = matrix.getEscalationChain('government' as ZoneType);
    expect(govChain).toContainEqual(expect.objectContaining({ contact: expect.stringMatching(/SPP/i) }));
  });

  it('03-11: manual escalation (trigger=MANUAL, triggeredBy=operatorId) creates Escalation', () => {
    const incident = makeIncident({ zoneType: 'airport', maxAwningLevel: 'ORANGE' });
    const escalation = matrix.executeEscalation(incident, 1, 'MANUAL', 'op-alice');
    expect(escalation.trigger).toBe('MANUAL');
    expect(escalation.triggeredBy).toBe('op-alice');
  });

  it('03-12: subsequent escalation of already-escalated incident increments level', () => {
    const incident = makeIncident({ zoneType: 'nuclear', maxAwningLevel: 'RED' });
    const esc1 = matrix.executeEscalation(incident, 1);
    const esc2 = matrix.executeEscalation(incident, 2);
    expect(esc1.level).toBe(1);
    expect(esc2.level).toBe(2);
    expect(esc2.level).toBeGreaterThan(esc1.level);
  });
});
