import { describe, it, expect } from 'vitest';
import { AuditEventLogger } from '../../src/resilience/audit-event-logger.js';

describe('FR-W15-05: Audit Event Logger', () => {
  it('AEL-01: append returns entry with required fields', () => {
    const logger = new AuditEventLogger();
    const entry = logger.append('detection', 'pipeline', { droneId: 'D-01' });
    expect(entry).toHaveProperty('seq');
    expect(entry).toHaveProperty('ts');
    expect(entry).toHaveProperty('eventType', 'detection');
    expect(entry).toHaveProperty('actor', 'pipeline');
    expect(entry).toHaveProperty('prevHash');
    expect(entry).toHaveProperty('hash');
  });

  it('AEL-02: first entry has prevHash = "0000...0" (genesis)', () => {
    const logger = new AuditEventLogger();
    const entry = logger.append('detection', 'pipeline', {});
    expect(entry.prevHash).toMatch(/^0+$/);
  });

  it('AEL-03: second entry prevHash equals first entry hash', () => {
    const logger = new AuditEventLogger();
    const e1 = logger.append('detection', 'pipeline', {});
    const e2 = logger.append('config_change', 'admin', {});
    expect(e2.prevHash).toBe(e1.hash);
  });

  it('AEL-04: verify returns valid=true on intact chain', () => {
    const logger = new AuditEventLogger();
    logger.append('detection', 'p', {});
    logger.append('auth_attempt', 'user', { ip: '1.2.3.4' });
    logger.append('operator_command', 'op', { cmd: 'shutdown' });
    const result = logger.verify();
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeUndefined();
  });

  it('AEL-05: verify detects tampered entry hash', () => {
    const logger = new AuditEventLogger();
    logger.append('detection', 'p', {});
    logger.append('config_change', 'admin', {});
    const entries = logger.getEntries();
    entries[0]!.hash = 'tampered';
    const result = logger.verify();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBeDefined();
  });

  it('AEL-06: seq is monotonically increasing', () => {
    const logger = new AuditEventLogger();
    const e1 = logger.append('detection', 'p', {});
    const e2 = logger.append('detection', 'p', {});
    const e3 = logger.append('detection', 'p', {});
    expect(e2.seq).toBeGreaterThan(e1.seq);
    expect(e3.seq).toBeGreaterThan(e2.seq);
  });

  it('AEL-07: exportJsonl returns one JSON line per entry', () => {
    const logger = new AuditEventLogger();
    logger.append('detection', 'p', {});
    logger.append('auth_attempt', 'u', {});
    const jsonl = logger.exportJsonl();
    const lines = jsonl.trim().split('\n');
    expect(lines).toHaveLength(2);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed).toHaveProperty('seq');
  });

  it('AEL-08: ring buffer caps at maxEntries', () => {
    const logger = new AuditEventLogger({ maxEntries: 5 });
    for (let i = 0; i < 10; i++) {
      logger.append('detection', 'p', { i });
    }
    expect(logger.getEntries()).toHaveLength(5);
  });

  it('AEL-09: ring buffer keeps most recent entries', () => {
    const logger = new AuditEventLogger({ maxEntries: 3 });
    for (let i = 0; i < 5; i++) {
      logger.append('detection', 'p', { i });
    }
    const entries = logger.getEntries();
    expect(entries[entries.length - 1]!.payload).toMatchObject({ i: 4 });
  });

  it('AEL-10: verify on empty log returns valid=true', () => {
    const logger = new AuditEventLogger();
    expect(logger.verify().valid).toBe(true);
  });

  it('AEL-11: all eventTypes are accepted', () => {
    const logger = new AuditEventLogger();
    const types = ['detection', 'awning_change', 'model_promote', 'config_change', 'auth_attempt', 'operator_command'] as const;
    for (const t of types) {
      expect(() => logger.append(t, 'actor', {})).not.toThrow();
    }
  });

  it('AEL-12: hash is a 64-char hex string (SHA-256)', () => {
    const logger = new AuditEventLogger();
    const entry = logger.append('detection', 'p', {});
    expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
