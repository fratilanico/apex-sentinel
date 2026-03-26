import { describe, it, expect, beforeEach } from 'vitest';
import { DashboardStateStore } from '../../src/dashboard/dashboard-state-store.js';
import type { SerializedDetection } from '../../src/dashboard/detection-serializer.js';

describe('FR-W14-04: DashboardStateStore — in-memory state', () => {
  let store: DashboardStateStore;

  const makeDetection = (id: string, ts = Date.now()): SerializedDetection => ({
    id,
    droneType: 'Shahed-136',
    awningLevel: 'GREEN',
    stage: 2,
    approxLat: 44.44,
    approxLon: 26.10,
    ts,
  });

  beforeEach(() => {
    store = new DashboardStateStore();
  });

  it('SS-01: initial awning level is GREEN', () => {
    expect(store.getCurrentAwningLevel()).toBe('GREEN');
  });

  it('SS-02: awning_update changes level', () => {
    store.update({ type: 'awning_update', level: 'YELLOW', reason: 'test' });
    expect(store.getCurrentAwningLevel()).toBe('YELLOW');
  });

  it('SS-03: awning_update records transition', () => {
    store.update({ type: 'awning_update', level: 'YELLOW', reason: 'OSINT surge' });
    const snap = store.getSnapshot();
    expect(snap.awningTransitions).toHaveLength(1);
    expect(snap.awningTransitions[0].from).toBe('GREEN');
    expect(snap.awningTransitions[0].to).toBe('YELLOW');
    expect(snap.awningTransitions[0].reason).toBe('OSINT surge');
  });

  it('SS-04: transitions capped at 10', () => {
    for (let i = 0; i < 12; i++) {
      store.update({ type: 'awning_update', level: i % 2 === 0 ? 'YELLOW' : 'GREEN', reason: `t${i}` });
    }
    const snap = store.getSnapshot();
    expect(snap.awningTransitions.length).toBeLessThanOrEqual(10);
  });

  it('SS-05: detection event is stored', () => {
    store.update({ type: 'detection', detection: makeDetection('det-001') });
    expect(store.getDetectionCount()).toBe(1);
  });

  it('SS-06: detections capped at 50', () => {
    for (let i = 0; i < 55; i++) {
      store.update({ type: 'detection', detection: makeDetection(`det-${i}`) });
    }
    expect(store.getDetectionCount()).toBe(50);
  });

  it('SS-07: intel_brief stores brief', () => {
    const brief = { id: 'b1', summary: 'test', threatLevel: 'HIGH', sources: [], ts: Date.now() };
    store.update({ type: 'intel_brief', brief });
    const snap = store.getSnapshot();
    expect(snap.latestIntel).toEqual(brief);
  });

  it('SS-08: getSnapshot returns correct awning level', () => {
    store.update({ type: 'awning_update', level: 'RED', reason: 'confirmed threat' });
    const snap = store.getSnapshot();
    expect(snap.awningLevel).toBe('RED');
  });

  it('SS-09: getSnapshot detections are copy (no mutation)', () => {
    store.update({ type: 'detection', detection: makeDetection('det-001') });
    const snap = store.getSnapshot();
    snap.detections.push(makeDetection('det-injected'));
    expect(store.getDetectionCount()).toBe(1); // original unchanged
  });

  it('SS-10: pruneOld removes detections outside window', () => {
    const old = makeDetection('det-old', Date.now() - 35 * 60 * 1000);
    const fresh = makeDetection('det-fresh', Date.now());
    store.update({ type: 'detection', detection: old });
    store.update({ type: 'detection', detection: fresh });
    const pruned = store.pruneOld(30 * 60 * 1000);
    expect(pruned).toBe(1);
    expect(store.getDetectionCount()).toBe(1);
  });

  it('SS-11: pruneOld returns 0 when nothing to remove', () => {
    store.update({ type: 'detection', detection: makeDetection('det-fresh') });
    const pruned = store.pruneOld(30 * 60 * 1000);
    expect(pruned).toBe(0);
  });

  it('SS-12: reset() clears all state', () => {
    store.update({ type: 'awning_update', level: 'RED', reason: 'test' });
    store.update({ type: 'detection', detection: makeDetection('d1') });
    store.reset();
    expect(store.getCurrentAwningLevel()).toBe('GREEN');
    expect(store.getDetectionCount()).toBe(0);
    const snap = store.getSnapshot();
    expect(snap.latestIntel).toBeNull();
  });

  it('SS-13: uptimeMs increases over time', async () => {
    const snap1 = store.getSnapshot();
    await new Promise(r => setTimeout(r, 10));
    const snap2 = store.getSnapshot();
    expect(snap2.uptimeMs).toBeGreaterThanOrEqual(snap1.uptimeMs);
  });
});
