// APEX-SENTINEL — W20
// FR-W20-06: AuditTrailExporter

import { describe, it, expect, beforeEach } from 'vitest';
import { AuditTrailExporter } from '../../src/workflow/audit-trail-exporter.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface AuditEntry {
  entryId: string;
  timestamp: number;
  operatorId: string;
  action: string;
  resourceId: string;
  hash: string;
  prevHash: string;
}

interface VerifyResult {
  valid: boolean;
  firstInvalidAt?: number;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_MS = 1_000_000_000;

const makeParams = (overrides: Partial<{
  timestamp: number;
  operatorId: string;
  action: string;
  resourceId: string;
}> = {}) => ({
  timestamp: BASE_MS,
  operatorId: 'op-alice',
  action: 'ALERT_INGESTED',
  resourceId: 'alert-001',
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FR-W20-06: AuditTrailExporter', () => {
  let exporter: AuditTrailExporter;

  beforeEach(() => {
    exporter = new AuditTrailExporter();
  });

  it('06-01: appendEntry creates AuditEntry with SHA-256 hash field', () => {
    const entry: AuditEntry = exporter.appendEntry(makeParams());
    expect(entry.entryId).toBeDefined();
    expect(entry.hash).toBeDefined();
    // SHA-256 produces 64 hex chars
    expect(entry.hash).toHaveLength(64);
    expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('06-02: genesis entry has prevHash = 0 * 64', () => {
    const entry: AuditEntry = exporter.appendEntry(makeParams());
    expect(entry.prevHash).toBe('0'.repeat(64));
  });

  it('06-03: second entry.prevHash === first entry.hash', () => {
    const first = exporter.appendEntry(makeParams({ timestamp: BASE_MS, resourceId: 'alert-001' }));
    const second = exporter.appendEntry(makeParams({ timestamp: BASE_MS + 1000, resourceId: 'alert-002' }));
    expect(second.prevHash).toBe(first.hash);
  });

  it('06-04: verifyChain returns {valid: true} on unmodified chain', () => {
    exporter.appendEntry(makeParams({ resourceId: 'r-001' }));
    exporter.appendEntry(makeParams({ resourceId: 'r-002', timestamp: BASE_MS + 1 }));
    exporter.appendEntry(makeParams({ resourceId: 'r-003', timestamp: BASE_MS + 2 }));
    const result: VerifyResult = exporter.verifyChain();
    expect(result.valid).toBe(true);
    expect(result.firstInvalidAt).toBeUndefined();
  });

  it('06-05: verifyChain returns {valid: false, firstInvalidAt: N} on tampered entry', () => {
    exporter.appendEntry(makeParams({ resourceId: 'r-001' }));
    exporter.appendEntry(makeParams({ resourceId: 'r-002', timestamp: BASE_MS + 1 }));
    exporter.appendEntry(makeParams({ resourceId: 'r-003', timestamp: BASE_MS + 2 }));
    // Tamper: mutate the second entry's hash directly
    const entries = exporter.exportJSON();
    entries[1].hash = 'deadbeef'.repeat(8); // corrupt
    exporter.importForTest(entries); // test-only import hook
    const result: VerifyResult = exporter.verifyChain();
    expect(result.valid).toBe(false);
    expect(typeof result.firstInvalidAt).toBe('number');
    expect(result.firstInvalidAt).toBeGreaterThanOrEqual(1); // index 1 or 2
  });

  it('06-06: exportJSON filters by operatorId', () => {
    exporter.appendEntry(makeParams({ operatorId: 'op-alice', resourceId: 'r-001' }));
    exporter.appendEntry(makeParams({ operatorId: 'op-bob', resourceId: 'r-002', timestamp: BASE_MS + 1 }));
    exporter.appendEntry(makeParams({ operatorId: 'op-alice', resourceId: 'r-003', timestamp: BASE_MS + 2 }));
    const result = exporter.exportJSON({ operatorId: 'op-alice' });
    expect(result).toHaveLength(2);
    expect(result.every(e => e.operatorId === 'op-alice')).toBe(true);
  });

  it('06-07: exportJSON filters by resourceId', () => {
    exporter.appendEntry(makeParams({ resourceId: 'alert-001' }));
    exporter.appendEntry(makeParams({ resourceId: 'alert-002', timestamp: BASE_MS + 1 }));
    exporter.appendEntry(makeParams({ resourceId: 'alert-001', timestamp: BASE_MS + 2 }));
    const result = exporter.exportJSON({ resourceId: 'alert-001' });
    expect(result).toHaveLength(2);
    expect(result.every(e => e.resourceId === 'alert-001')).toBe(true);
  });

  it('06-08: exportJSON filters by since/until (timestamp range)', () => {
    exporter.appendEntry(makeParams({ timestamp: BASE_MS }));
    exporter.appendEntry(makeParams({ timestamp: BASE_MS + 5000 }));
    exporter.appendEntry(makeParams({ timestamp: BASE_MS + 10_000 }));
    exporter.appendEntry(makeParams({ timestamp: BASE_MS + 20_000 }));
    const result = exporter.exportJSON({ since: BASE_MS + 3000, until: BASE_MS + 12_000 });
    // Should include entries at BASE_MS+5000 and BASE_MS+10_000
    expect(result).toHaveLength(2);
    expect(result.every(e => e.timestamp >= BASE_MS + 3000 && e.timestamp <= BASE_MS + 12_000)).toBe(true);
  });

  it('06-09: exportCSV produces string with correct column headers', () => {
    exporter.appendEntry(makeParams());
    const csv: string = exporter.exportCSV();
    const header = csv.split('\n')[0];
    expect(header).toContain('entryId');
    expect(header).toContain('timestamp');
    expect(header).toContain('operatorId');
    expect(header).toContain('action');
    expect(header).toContain('resourceId');
    expect(header).toContain('hash');
    expect(header).toContain('prevHash');
  });

  it('06-10: eraseOperator replaces operatorId with REDACTED token in all entries', () => {
    exporter.appendEntry(makeParams({ operatorId: 'op-alice', resourceId: 'r-001' }));
    exporter.appendEntry(makeParams({ operatorId: 'op-alice', resourceId: 'r-002', timestamp: BASE_MS + 1 }));
    exporter.appendEntry(makeParams({ operatorId: 'op-bob', resourceId: 'r-003', timestamp: BASE_MS + 2 }));
    exporter.eraseOperator('op-alice');
    const entries = exporter.exportJSON();
    const aliceEntries = entries.filter(e => e.operatorId === 'REDACTED');
    expect(aliceEntries).toHaveLength(2);
    // Bob should be unchanged
    const bob = entries.find(e => e.resourceId === 'r-003');
    expect(bob?.operatorId).toBe('op-bob');
  });

  it('06-11: eraseOperator does NOT delete entries (chain length preserved)', () => {
    exporter.appendEntry(makeParams({ operatorId: 'op-alice', resourceId: 'r-001' }));
    exporter.appendEntry(makeParams({ operatorId: 'op-alice', resourceId: 'r-002', timestamp: BASE_MS + 1 }));
    exporter.appendEntry(makeParams({ operatorId: 'op-bob', resourceId: 'r-003', timestamp: BASE_MS + 2 }));
    const beforeCount = exporter.exportJSON().length;
    exporter.eraseOperator('op-alice');
    const afterCount = exporter.exportJSON().length;
    expect(afterCount).toBe(beforeCount);
  });
});
