// APEX-SENTINEL — W11 AlertDeduplicationEngine Tests
// FR-W11-07 | tests/intel/FR-W11-07-alert-dedup.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { AlertDeduplicationEngine } from '../../src/intel/alert-deduplication-engine.js';
import type { AlertInput } from '../../src/intel/alert-deduplication-engine.js';

describe('FR-W11-07: AlertDeduplicationEngine', () => {
  let engine: AlertDeduplicationEngine;
  const now = Date.now();

  beforeEach(() => {
    engine = new AlertDeduplicationEngine();
  });

  const baseAlert: AlertInput = {
    droneType: 'Shahed-136',
    awningLevel: 'RED',
    sector: '52.2:21.0',
    ts: now,
  };

  it('07-01: first alert → shouldAlert returns true', () => {
    expect(engine.shouldAlert(baseAlert)).toBe(true);
  });

  it('07-02: same alert within 5 minutes → shouldAlert returns false', () => {
    engine.shouldAlert(baseAlert);
    const duplicate = { ...baseAlert, ts: now + 60 * 1000 }; // 1 min later, same 5-min bucket
    expect(engine.shouldAlert(duplicate)).toBe(false);
  });

  it('07-03: same alert after 5 minutes → shouldAlert returns true', () => {
    engine.shouldAlert(baseAlert);
    // Move to next 5-min bucket
    const later = { ...baseAlert, ts: now + 5 * 60 * 1000 + 1 };
    expect(engine.shouldAlert(later)).toBe(true);
  });

  it('07-04: different droneType → shouldAlert returns true', () => {
    engine.shouldAlert(baseAlert);
    const different = { ...baseAlert, droneType: 'Gerbera' };
    expect(engine.shouldAlert(different)).toBe(true);
  });

  it('07-05: different awningLevel → shouldAlert returns true', () => {
    engine.shouldAlert(baseAlert);
    const different = { ...baseAlert, awningLevel: 'YELLOW' };
    expect(engine.shouldAlert(different)).toBe(true);
  });

  it('07-06: different sector → shouldAlert returns true', () => {
    engine.shouldAlert(baseAlert);
    const different = { ...baseAlert, sector: '53.0:22.0' };
    expect(engine.shouldAlert(different)).toBe(true);
  });

  it('07-07: getAlertHistory returns entries within window', () => {
    engine.shouldAlert(baseAlert);
    engine.shouldAlert({ ...baseAlert, droneType: 'Gerbera' });
    const history = engine.getAlertHistory(60 * 1000);
    expect(history.length).toBeGreaterThanOrEqual(2);
  });

  it('07-08: getAlertHistory excludes entries outside window', () => {
    const oldAlert: AlertInput = { ...baseAlert, ts: now - 10 * 60 * 1000 }; // 10 min ago
    engine.shouldAlert(oldAlert);
    engine.shouldAlert(baseAlert); // now
    // Only entries within last 5 minutes
    const history = engine.getAlertHistory(5 * 60 * 1000);
    expect(history).toHaveLength(1);
  });

  it('07-09: ring buffer never exceeds 500 entries', () => {
    for (let i = 0; i < 600; i++) {
      engine.shouldAlert({ ...baseAlert, droneType: `drone_${i}`, ts: now + i * 1000 });
    }
    const history = engine.getAlertHistory(24 * 60 * 60 * 1000);
    expect(history.length).toBeLessThanOrEqual(500);
  });

  it('07-10: alert history entries contain no PII (only key metadata)', () => {
    engine.shouldAlert(baseAlert);
    const history = engine.getAlertHistory(60 * 1000);
    const entry = history[0];
    expect(entry).toHaveProperty('key');
    expect(entry).toHaveProperty('ts');
    // Should not have raw lat/lon
    expect(entry).not.toHaveProperty('lat');
    expect(entry).not.toHaveProperty('lon');
  });

  it('07-11: key format is droneType:awningLevel:sector:bucketId', () => {
    engine.shouldAlert(baseAlert);
    const history = engine.getAlertHistory(60 * 1000);
    const key = history[0].key;
    const expectedBucket = Math.floor(now / 300000);
    expect(key).toBe(`Shahed-136:RED:52.2:21.0:${expectedBucket}`);
  });

  it('07-12: multiple distinct alerts all tracked independently', () => {
    const alerts: AlertInput[] = [
      { droneType: 'Shahed-136', awningLevel: 'RED', sector: '52.2:21.0', ts: now },
      { droneType: 'Gerbera', awningLevel: 'YELLOW', sector: '53.0:22.0', ts: now },
      { droneType: 'Shahed-131', awningLevel: 'RED', sector: '54.1:23.0', ts: now },
    ];
    const results = alerts.map(a => engine.shouldAlert(a));
    expect(results).toEqual([true, true, true]);
  });
});
