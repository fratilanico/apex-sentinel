// APEX-SENTINEL — W20
// FR-W20-06: AuditTrailExporter
// src/workflow/audit-trail-exporter.ts

import { createHash } from 'crypto';
import { AuditEntry } from './types.js';

type FilterParams = {
  operatorId?: string;
  resourceId?: string;
  since?: number;
  until?: number;
};

let entryCounter = 0;

function computeHash(content: {
  entryId: string;
  timestamp: number;
  operatorId: string;
  action: string;
  resourceId: string;
  prevHash: string;
}): string {
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

export class AuditTrailExporter {
  private chain: AuditEntry[] = [];

  appendEntry(params: {
    operatorId: string;
    action: string;
    resourceId: string;
    timestamp?: number;
    data?: unknown;
  }): AuditEntry {
    const entryId = `entry-${++entryCounter}-${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = params.timestamp ?? Date.now();
    const prevHash =
      this.chain.length === 0
        ? '0'.repeat(64)
        : this.chain[this.chain.length - 1].hash;

    const hashInput = {
      entryId,
      timestamp,
      operatorId: params.operatorId,
      action: params.action,
      resourceId: params.resourceId,
      prevHash,
    };
    const hash = computeHash(hashInput);

    const entry: AuditEntry = {
      entryId,
      timestamp,
      operatorId: params.operatorId,
      action: params.action,
      resourceId: params.resourceId,
      hash,
      prevHash,
    };

    this.chain.push(entry);
    return entry;
  }

  verifyChain(): { valid: boolean; firstInvalidAt?: number } {
    if (this.chain.length === 0) return { valid: true };

    // Verify genesis entry
    const genesis = this.chain[0];
    if (genesis.prevHash !== '0'.repeat(64)) {
      return { valid: false, firstInvalidAt: 0 };
    }

    const expectedGenesis = computeHash({
      entryId: genesis.entryId,
      timestamp: genesis.timestamp,
      operatorId: genesis.operatorId,
      action: genesis.action,
      resourceId: genesis.resourceId,
      prevHash: genesis.prevHash,
    });
    if (expectedGenesis !== genesis.hash) {
      return { valid: false, firstInvalidAt: 0 };
    }

    for (let i = 1; i < this.chain.length; i++) {
      const entry = this.chain[i];
      const prev = this.chain[i - 1];

      // Check prevHash linkage
      if (entry.prevHash !== prev.hash) {
        return { valid: false, firstInvalidAt: i };
      }

      // Recompute hash
      const expected = computeHash({
        entryId: entry.entryId,
        timestamp: entry.timestamp,
        operatorId: entry.operatorId,
        action: entry.action,
        resourceId: entry.resourceId,
        prevHash: entry.prevHash,
      });
      if (expected !== entry.hash) {
        return { valid: false, firstInvalidAt: i };
      }
    }

    return { valid: true };
  }

  exportJSON(filter?: FilterParams): AuditEntry[] {
    let result = [...this.chain];
    if (filter?.operatorId !== undefined) {
      result = result.filter(e => e.operatorId === filter.operatorId);
    }
    if (filter?.resourceId !== undefined) {
      result = result.filter(e => e.resourceId === filter.resourceId);
    }
    if (filter?.since !== undefined) {
      result = result.filter(e => e.timestamp >= filter.since!);
    }
    if (filter?.until !== undefined) {
      result = result.filter(e => e.timestamp <= filter.until!);
    }
    return result;
  }

  exportCSV(filter?: FilterParams): string {
    const entries = this.exportJSON(filter);
    const header = 'entryId,timestamp,operatorId,action,resourceId,hash,prevHash';
    const rows = entries.map(e => {
      const cols = [
        e.entryId,
        String(e.timestamp),
        e.operatorId,
        e.action,
        e.resourceId,
        e.hash,
        e.prevHash,
      ];
      return cols.map(c => (c.includes(',') ? `"${c}"` : c)).join(',');
    });
    return [header, ...rows].join('\n');
  }

  eraseOperator(operatorId: string): void {
    for (const entry of this.chain) {
      if (entry.operatorId === operatorId) {
        entry.operatorId = 'REDACTED';
      }
    }
  }

  /** Test-only import hook for tampering tests */
  importForTest(entries: AuditEntry[]): void {
    this.chain = entries;
  }
}
