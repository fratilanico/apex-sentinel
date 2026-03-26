// APEX-SENTINEL — W10 StageTransitionAudit Tests
// FR-W10-07 | tests/nato/FR-W10-07-stage-transition-audit.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { StageTransitionAudit } from '../../src/nato/stage-transition-audit.js';

describe('FR-W10-07: StageTransitionAudit', () => {
  let audit: StageTransitionAudit;

  beforeEach(() => {
    audit = new StageTransitionAudit(1000);
  });

  it('07-01: record returns an entry with id, from, to, ts', () => {
    const entry = audit.record(null, 1, ['acoustic detected']);
    expect(typeof entry.id).toBe('string');
    expect(entry.id.length).toBeGreaterThan(0);
    expect(entry.from).toBeNull();
    expect(entry.to).toBe(1);
    expect(typeof entry.ts).toBe('string');
  });

  it('07-02: entry ts is ISO-8601', () => {
    const entry = audit.record(1, 2, ['rf match']);
    expect(() => new Date(entry.ts)).not.toThrow();
    expect(new Date(entry.ts).toISOString()).toBe(entry.ts);
  });

  it('07-03: entry evidence is recorded correctly', () => {
    const evidence = ['acoustic: 0.87', 'rf: ELRS-match'];
    const entry = audit.record(1, 2, evidence);
    expect(entry.evidence).toEqual(evidence);
  });

  it('07-04: entry is immutable (Object.isFrozen)', () => {
    const entry = audit.record(1, 2, ['test']);
    expect(Object.isFrozen(entry)).toBe(true);
  });

  it('07-05: cannot mutate entry after write', () => {
    const entry = audit.record(1, 2, ['test']);
    expect(() => {
      (entry as { to: number }).to = 3;
    }).toThrow();
  });

  it('07-06: size() returns current entry count', () => {
    expect(audit.size()).toBe(0);
    audit.record(null, 1, []);
    expect(audit.size()).toBe(1);
    audit.record(1, 2, []);
    expect(audit.size()).toBe(2);
  });

  it('07-07: ring buffer evicts oldest when maxEntries exceeded', () => {
    const smallAudit = new StageTransitionAudit(3);
    smallAudit.record(null, 1, ['a']);
    smallAudit.record(1, 2, ['b']);
    smallAudit.record(2, 3, ['c']);
    smallAudit.record(3, 1, ['d']); // should evict first entry
    expect(smallAudit.size()).toBe(3);
    const all = smallAudit.replay();
    expect(all[0].evidence).toEqual(['b']); // 'a' evicted
  });

  it('07-08: replay returns all entries in chronological order', () => {
    audit.record(null, 1, ['first']);
    audit.record(1, 2, ['second']);
    audit.record(2, 3, ['third']);
    const all = audit.replay();
    expect(all).toHaveLength(3);
    expect(all[0].evidence).toEqual(['first']);
    expect(all[2].evidence).toEqual(['third']);
  });

  it('07-09: replay with fromTs filters correctly', () => {
    const t1 = new Date('2026-03-26T10:00:00.000Z').toISOString();
    const t2 = new Date('2026-03-26T11:00:00.000Z').toISOString();
    const t3 = new Date('2026-03-26T12:00:00.000Z').toISOString();

    // Force specific timestamps by using a subclass or overriding — use spy on Date
    // Instead, record normally and filter by actual timestamps
    audit.record(null, 1, ['early']);
    const sliceStart = new Date().toISOString();
    audit.record(1, 2, ['late']);

    const filtered = audit.replay(sliceStart);
    expect(filtered.some(e => e.evidence[0] === 'late')).toBe(true);
    // 'early' entry is before sliceStart
    expect(filtered.every(e => e.ts >= sliceStart)).toBe(true);
    void t1; void t2; void t3; // silence unused vars
  });

  it('07-10: replay with toTs filters correctly', () => {
    audit.record(null, 1, ['before']);
    const cutoff = new Date().toISOString();
    audit.record(1, 2, ['after']);
    const filtered = audit.replay(undefined, cutoff);
    expect(filtered.every(e => e.ts <= cutoff)).toBe(true);
    expect(filtered.some(e => e.evidence[0] === 'before')).toBe(true);
  });

  it('07-11: operatorId is optional and stored', () => {
    const entry = audit.record(1, 2, ['test'], 'OPS-1');
    expect(entry.operatorId).toBe('OPS-1');
  });

  it('07-12: operatorId undefined when not provided', () => {
    const entry = audit.record(1, 2, ['test']);
    expect(entry.operatorId).toBeUndefined();
  });
});
