// APEX-SENTINEL — TDD RED Tests
// W4 C2 Dashboard — Alert Store
// Status: RED — implementation in src/dashboard/alert-store.ts NOT_IMPLEMENTED

import { describe, it, expect, beforeEach } from 'vitest';
import { AlertStore } from '../../src/dashboard/alert-store.js';
import type { DashboardAlert } from '../../src/dashboard/alert-store.js';

function makeAlert(overrides: Partial<DashboardAlert> = {}): DashboardAlert {
  return {
    alertId: 'ALT-001',
    trackId: 'TRK-001',
    threatClass: 'fpv_drone',
    severity: 'high',
    message: 'FPV drone detected at grid ref 48.22N/24.33E',
    lat: 48.2248,
    lon: 24.3362,
    confidence: 0.85,
    receivedAt: Date.now(),
    acknowledged: false,
    ...overrides,
  };
}

describe('FR-W4-03: Alert Store — Lifecycle, Acknowledgement, and Classification', () => {
  let store: AlertStore;

  beforeEach(() => {
    store = new AlertStore();
  });

  it('FR-W4-03-01: addAlert increments count', () => {
    store.addAlert(makeAlert({ alertId: 'ALT-001' }));
    expect(store.count()).toBe(1);
    store.addAlert(makeAlert({ alertId: 'ALT-002' }));
    expect(store.count()).toBe(2);
  });

  it('FR-W4-03-02: acknowledgeAlert sets acknowledged=true and returns true on success', () => {
    store.addAlert(makeAlert({ alertId: 'ALT-001', acknowledged: false }));
    const result = store.acknowledgeAlert('ALT-001', 'OP-42');
    expect(result).toBe(true);
    const unacked = store.getUnacknowledged();
    expect(unacked.find((a) => a.alertId === 'ALT-001')).toBeUndefined();
  });

  it('FR-W4-03-03: acknowledgeAlert returns false for nonexistent alertId', () => {
    const result = store.acknowledgeAlert('ALT-NONEXISTENT', 'OP-42');
    expect(result).toBe(false);
  });

  it('FR-W4-03-04: getUnacknowledged excludes acknowledged alerts', () => {
    store.addAlert(makeAlert({ alertId: 'ALT-001', acknowledged: false }));
    store.addAlert(makeAlert({ alertId: 'ALT-002', acknowledged: false }));
    store.addAlert(makeAlert({ alertId: 'ALT-003', acknowledged: false }));
    store.acknowledgeAlert('ALT-002', 'OP-42');
    const unacked = store.getUnacknowledged();
    expect(unacked).toHaveLength(2);
    expect(unacked.find((a) => a.alertId === 'ALT-002')).toBeUndefined();
    unacked.forEach((a) => expect(a.acknowledged).toBe(false));
  });

  it('FR-W4-03-05: getAlertsByTrack returns alerts for specific trackId', () => {
    store.addAlert(makeAlert({ alertId: 'ALT-001', trackId: 'TRK-001' }));
    store.addAlert(makeAlert({ alertId: 'ALT-002', trackId: 'TRK-002' }));
    store.addAlert(makeAlert({ alertId: 'ALT-003', trackId: 'TRK-001' }));
    const result = store.getAlertsByTrack('TRK-001');
    expect(result).toHaveLength(2);
    result.forEach((a) => expect(a.trackId).toBe('TRK-001'));
  });

  it('FR-W4-03-06: getLatestAlert returns alert with highest receivedAt', () => {
    const now = Date.now();
    store.addAlert(makeAlert({ alertId: 'ALT-001', receivedAt: now - 3000 }));
    store.addAlert(makeAlert({ alertId: 'ALT-002', receivedAt: now - 1000 }));
    store.addAlert(makeAlert({ alertId: 'ALT-003', receivedAt: now - 5000 }));
    const latest = store.getLatestAlert();
    expect(latest?.alertId).toBe('ALT-002');
  });

  it('FR-W4-03-07: getCriticalCount returns count of severity="critical" unacknowledged alerts', () => {
    store.addAlert(makeAlert({ alertId: 'ALT-001', severity: 'critical', acknowledged: false }));
    store.addAlert(makeAlert({ alertId: 'ALT-002', severity: 'critical', acknowledged: false }));
    store.addAlert(makeAlert({ alertId: 'ALT-003', severity: 'high', acknowledged: false }));
    store.addAlert(makeAlert({ alertId: 'ALT-004', severity: 'critical', acknowledged: false }));
    // Acknowledge one critical — should not count
    store.acknowledgeAlert('ALT-001', 'OP-42');
    expect(store.getCriticalCount()).toBe(2);
  });

  it('FR-W4-03-08: classifyThreat("fpv_drone", 0.95) returns "critical"', () => {
    expect(store.classifyThreat('fpv_drone', 0.95)).toBe('critical');
  });

  it('FR-W4-03-09: classifyThreat("fpv_drone", 0.70) returns "high"', () => {
    expect(store.classifyThreat('fpv_drone', 0.70)).toBe('high');
  });

  it('FR-W4-03-10: classifyThreat("unknown", 0.99) returns "low" — unknown never critical', () => {
    expect(store.classifyThreat('unknown', 0.99)).toBe('low');
  });

  it('FR-W4-03-11: classifyThreat("shahed", 0.90) returns "critical" — Shahed is max threat', () => {
    expect(store.classifyThreat('shahed', 0.90)).toBe('critical');
  });

  it('FR-W4-03-12: clear() resets count and all state', () => {
    store.addAlert(makeAlert({ alertId: 'ALT-001' }));
    store.addAlert(makeAlert({ alertId: 'ALT-002' }));
    store.clear();
    expect(store.count()).toBe(0);
    expect(store.getUnacknowledged()).toHaveLength(0);
    expect(store.getLatestAlert()).toBeNull();
    expect(store.getCriticalCount()).toBe(0);
  });
});
