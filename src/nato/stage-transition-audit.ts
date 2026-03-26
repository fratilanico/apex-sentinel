// APEX-SENTINEL — W10 StageTransitionAudit
// FR-W10-07 | src/nato/stage-transition-audit.ts

import { randomUUID } from 'crypto';
import type { Stage } from './stage-classifier.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  readonly id: string;
  readonly from: Stage | null;
  readonly to: Stage;
  readonly ts: string;
  readonly evidence: readonly string[];
  readonly operatorId?: string;
}

// ── StageTransitionAudit ─────────────────────────────────────────────────────

export class StageTransitionAudit {
  private readonly maxEntries: number;
  private readonly buffer: AuditEntry[] = [];

  constructor(maxEntries: number = 1000) {
    this.maxEntries = maxEntries;
  }

  /**
   * Records a stage transition. Entry is immutable after write (Object.freeze).
   */
  record(
    from: Stage | null,
    to: Stage,
    evidence: string[],
    operatorId?: string,
  ): AuditEntry {
    const entry: AuditEntry = Object.freeze({
      id: randomUUID(),
      from,
      to,
      ts: new Date().toISOString(),
      evidence: Object.freeze([...evidence]) as readonly string[],
      ...(operatorId !== undefined ? { operatorId } : {}),
    });

    this.buffer.push(entry);

    // Evict oldest if over capacity
    if (this.buffer.length > this.maxEntries) {
      this.buffer.shift();
    }

    return entry;
  }

  /**
   * Returns entries in chronological order, optionally filtered by time range.
   */
  replay(fromTs?: string, toTs?: string): AuditEntry[] {
    return this.buffer.filter(entry => {
      if (fromTs !== undefined && entry.ts < fromTs) return false;
      if (toTs !== undefined && entry.ts > toTs) return false;
      return true;
    });
  }

  size(): number {
    return this.buffer.length;
  }
}
