// APEX-SENTINEL — W13
// FR-W13-07: NotificationAuditLog

import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationAuditLog } from '../../src/operator/notification-audit-log.js';

describe('FR-W13-07: NotificationAuditLog', () => {
  let log: NotificationAuditLog;
  const BASE_TIME = 1000000000000;

  beforeEach(() => {
    log = new NotificationAuditLog(500);
  });

  it('records an entry', () => {
    log.record({ operatorId: 'op-1', alertId: 'A1', awningLevel: 'RED', delivered: true, ts: BASE_TIME });
    expect(log.size).toBe(1);
  });

  it('entry is frozen (immutable)', () => {
    const entry = log.record({ operatorId: 'op-1', alertId: 'A1', awningLevel: 'RED', delivered: true });
    expect(Object.isFrozen(entry)).toBe(true);
  });

  it('entry contains no message content', () => {
    const entry = log.record({ operatorId: 'op-1', alertId: 'A1', awningLevel: 'RED', delivered: true });
    const keys = Object.keys(entry);
    expect(keys).not.toContain('text');
    expect(keys).not.toContain('message');
    expect(keys).not.toContain('content');
  });

  it('ring buffer caps at maxEntries', () => {
    const small = new NotificationAuditLog(5);
    for (let i = 0; i < 10; i++) {
      small.record({ operatorId: 'op', alertId: `A${i}`, awningLevel: 'RED', delivered: true });
    }
    expect(small.size).toBe(5);
  });

  it('oldest entry is dropped when buffer full', () => {
    const small = new NotificationAuditLog(3);
    small.record({ operatorId: 'op', alertId: 'A0', awningLevel: 'RED', delivered: true, ts: BASE_TIME });
    small.record({ operatorId: 'op', alertId: 'A1', awningLevel: 'RED', delivered: true, ts: BASE_TIME + 1 });
    small.record({ operatorId: 'op', alertId: 'A2', awningLevel: 'RED', delivered: true, ts: BASE_TIME + 2 });
    small.record({ operatorId: 'op', alertId: 'A3', awningLevel: 'RED', delivered: true, ts: BASE_TIME + 3 });
    const all = small.getAll();
    expect(all.find(e => e.alertId === 'A0')).toBeUndefined();
    expect(all.find(e => e.alertId === 'A3')).toBeDefined();
  });

  it('getRecentNotifications returns entries within window', () => {
    const now = Date.now();
    log.record({ operatorId: 'op', alertId: 'A1', awningLevel: 'RED', delivered: true, ts: now - 1000 });
    log.record({ operatorId: 'op', alertId: 'A2', awningLevel: 'RED', delivered: true, ts: now - 200000 }); // too old
    const recent = log.getRecentNotifications(60_000); // 1 min window
    expect(recent.find(e => e.alertId === 'A1')).toBeDefined();
    expect(recent.find(e => e.alertId === 'A2')).toBeUndefined();
  });

  it('getRecentNotifications returns descending order', () => {
    const now = Date.now();
    log.record({ operatorId: 'op', alertId: 'A1', awningLevel: 'RED', delivered: true, ts: now - 5000 });
    log.record({ operatorId: 'op', alertId: 'A2', awningLevel: 'RED', delivered: true, ts: now - 1000 });
    const recent = log.getRecentNotifications(60_000);
    expect(recent[0].alertId).toBe('A2'); // newest first
  });

  it('getDeliveryRate calculates correctly', () => {
    const now = Date.now();
    log.record({ operatorId: 'op', alertId: 'A1', awningLevel: 'RED', delivered: true, ts: now - 1000 });
    log.record({ operatorId: 'op', alertId: 'A2', awningLevel: 'RED', delivered: false, ts: now - 2000 });
    log.record({ operatorId: 'op', alertId: 'A3', awningLevel: 'RED', delivered: true, ts: now - 3000 });
    const rate = log.getDeliveryRate(60_000);
    expect(rate.sent).toBe(2);
    expect(rate.failed).toBe(1);
    expect(rate.rate).toBeCloseTo(2 / 3, 2);
  });

  it('getDeliveryRate returns rate=0 when no entries', () => {
    const rate = log.getDeliveryRate(60_000);
    expect(rate.rate).toBe(0);
  });

  it('records error field when present', () => {
    const entry = log.record({
      operatorId: 'op', alertId: 'A1', awningLevel: 'RED', delivered: false, error: 'rate_limit_dropped',
    });
    expect(entry.error).toBe('rate_limit_dropped');
  });
});
