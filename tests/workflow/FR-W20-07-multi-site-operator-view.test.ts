// APEX-SENTINEL — W20
// FR-W20-07: MultiSiteOperatorView

import { describe, it, expect, beforeEach } from 'vitest';
import { MultiSiteOperatorView } from '../../src/workflow/multi-site-operator-view.js';

// ── Types ────────────────────────────────────────────────────────────────────

type ZoneType = 'airport' | 'nuclear' | 'military' | 'government';
type AwningLevel = 'CLEAR' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';

interface ZoneOperatorState {
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

interface OperatorViewResult {
  zones: ZoneOperatorState[];
  totalActiveIncidents: number;
  totalUnacknowledgedAlerts: number;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeZone = (overrides: Partial<ZoneOperatorState> = {}): ZoneOperatorState => ({
  zoneId: `zone-${Math.random().toString(36).slice(2, 8)}`,
  zoneType: 'airport',
  awningLevel: 'CLEAR',
  activeAlerts: 0,
  unacknowledgedAlerts: 0,
  activeIncidents: 0,
  healthScore: 100,
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FR-W20-07: MultiSiteOperatorView', () => {
  let view: MultiSiteOperatorView;

  beforeEach(() => {
    view = new MultiSiteOperatorView();
  });

  it('07-01: addZone registers zone in site map', () => {
    const zone = makeZone({ zoneId: 'zone-alpha' });
    view.addZone(zone);
    const result: OperatorViewResult = view.getOperatorView();
    expect(result.zones.some(z => z.zoneId === 'zone-alpha')).toBe(true);
  });

  it('07-02: getOperatorView returns zones sorted by healthScore ascending (worst first)', () => {
    view.addZone(makeZone({ zoneId: 'z-high', healthScore: 90 }));
    view.addZone(makeZone({ zoneId: 'z-low', healthScore: 20 }));
    view.addZone(makeZone({ zoneId: 'z-mid', healthScore: 55 }));
    const result = view.getOperatorView();
    const scores = result.zones.map(z => z.healthScore);
    expect(scores[0]).toBeLessThanOrEqual(scores[1]);
    expect(scores[1]).toBeLessThanOrEqual(scores[2]);
  });

  it('07-03: zone with awningLevel=RED has healthScore <= 50', () => {
    const zone = makeZone({ zoneId: 'z-red', awningLevel: 'RED', unacknowledgedAlerts: 3 });
    view.addZone(zone);
    const result = view.getOperatorView();
    const z = result.zones.find(z => z.zoneId === 'z-red');
    expect(z?.healthScore).toBeLessThanOrEqual(50);
  });

  it('07-04: zone awningLevel=CLEAR + 0 unacked alerts → healthScore=100', () => {
    const zone = makeZone({ zoneId: 'z-clear', awningLevel: 'CLEAR', unacknowledgedAlerts: 0, activeAlerts: 0, activeIncidents: 0 });
    view.addZone(zone);
    const result = view.getOperatorView();
    const z = result.zones.find(z => z.zoneId === 'z-clear');
    expect(z?.healthScore).toBe(100);
  });

  it('07-05: overallHealthScore = MIN of all zone health scores', () => {
    view.addZone(makeZone({ zoneId: 'z-90', healthScore: 90 }));
    view.addZone(makeZone({ zoneId: 'z-30', healthScore: 30 }));
    view.addZone(makeZone({ zoneId: 'z-70', healthScore: 70 }));
    expect(view.overallHealthScore()).toBe(30);
  });

  it('07-06: getOperatorView filter by zoneType returns matching zones only', () => {
    view.addZone(makeZone({ zoneId: 'z-airport', zoneType: 'airport' }));
    view.addZone(makeZone({ zoneId: 'z-nuclear', zoneType: 'nuclear' }));
    view.addZone(makeZone({ zoneId: 'z-military', zoneType: 'military' }));
    const result = view.getOperatorView({ zoneType: 'nuclear' });
    expect(result.zones.every(z => z.zoneType === 'nuclear')).toBe(true);
    expect(result.zones).toHaveLength(1);
  });

  it('07-07: getOperatorView totalActiveIncidents sums correctly across zones', () => {
    view.addZone(makeZone({ zoneId: 'z-a', activeIncidents: 2 }));
    view.addZone(makeZone({ zoneId: 'z-b', activeIncidents: 3 }));
    view.addZone(makeZone({ zoneId: 'z-c', activeIncidents: 0 }));
    const result = view.getOperatorView();
    expect(result.totalActiveIncidents).toBe(5);
  });

  it('07-08: getOperatorView totalUnacknowledgedAlerts sums correctly', () => {
    view.addZone(makeZone({ zoneId: 'z-a', unacknowledgedAlerts: 4 }));
    view.addZone(makeZone({ zoneId: 'z-b', unacknowledgedAlerts: 1 }));
    const result = view.getOperatorView();
    expect(result.totalUnacknowledgedAlerts).toBe(5);
  });

  it('07-09: assignOperator sets zone assignedOperator', () => {
    const zone = makeZone({ zoneId: 'z-assign' });
    view.addZone(zone);
    view.assignOperator('z-assign', 'op-charlie');
    const result = view.getOperatorView();
    const z = result.zones.find(z => z.zoneId === 'z-assign');
    expect(z?.assignedOperator).toBe('op-charlie');
  });

  it('07-10: getOperatorView(undefined, operatorId) shows assignedToMe=true for assigned zones', () => {
    view.addZone(makeZone({ zoneId: 'z-mine' }));
    view.addZone(makeZone({ zoneId: 'z-theirs' }));
    view.assignOperator('z-mine', 'op-diana');
    const result = view.getOperatorView(undefined, 'op-diana');
    const mine = result.zones.find(z => z.zoneId === 'z-mine');
    const theirs = result.zones.find(z => z.zoneId === 'z-theirs');
    expect(mine?.assignedToMe).toBe(true);
    expect(theirs?.assignedToMe).toBe(false);
  });

  it('07-11: updateZoneState updates awningLevel and recalculates healthScore', () => {
    const zone = makeZone({ zoneId: 'z-update', awningLevel: 'CLEAR', healthScore: 100 });
    view.addZone(zone);
    view.updateZoneState('z-update', { awningLevel: 'RED', unacknowledgedAlerts: 5 });
    const result = view.getOperatorView();
    const z = result.zones.find(z => z.zoneId === 'z-update');
    expect(z?.awningLevel).toBe('RED');
    expect(z?.healthScore).toBeLessThan(50); // RED forces health down
  });

  it('07-12: getOperatorView filter by minAwningLevel excludes lower-severity zones', () => {
    view.addZone(makeZone({ zoneId: 'z-clear', awningLevel: 'CLEAR' }));
    view.addZone(makeZone({ zoneId: 'z-yellow', awningLevel: 'YELLOW' }));
    view.addZone(makeZone({ zoneId: 'z-red', awningLevel: 'RED' }));
    // Filter for ORANGE and above — should return only RED (ORANGE not present, RED qualifies)
    const result = view.getOperatorView({ minAwningLevel: 'ORANGE' });
    const ids = result.zones.map(z => z.zoneId);
    expect(ids).not.toContain('z-clear');
    expect(ids).not.toContain('z-yellow');
    expect(ids).toContain('z-red');
  });
});
