/**
 * FR-W15-05: AuditEventLogger
 * Tamper-evident audit log using SHA-256 hash chain (blockchain-style).
 * Ring buffer of 10,000 entries. Exports to JSONL for persistence.
 */

import { createHash } from 'node:crypto';

export type EventType =
  | 'detection'
  | 'awning_change'
  | 'model_promote'
  | 'config_change'
  | 'auth_attempt'
  | 'operator_command';

export interface AuditEntry {
  seq: number;
  ts: number;
  eventType: EventType;
  actor: string;
  payload: unknown;
  prevHash: string;
  hash: string;
}

export interface AuditLoggerOptions {
  maxEntries?: number; // default 10000
}

const GENESIS_HASH = '0'.repeat(64);

export class AuditEventLogger {
  private readonly _entries: AuditEntry[] = [];
  private _seq = 0;
  private readonly _maxEntries: number;

  constructor(options: AuditLoggerOptions = {}) {
    this._maxEntries = options.maxEntries ?? 10_000;
  }

  append(eventType: EventType, actor: string, payload: unknown): AuditEntry {
    const prevHash = this._entries.length > 0
      ? this._entries[this._entries.length - 1]!.hash
      : GENESIS_HASH;

    const seq = ++this._seq;
    const ts = Date.now();
    const hash = this._computeHash(seq, ts, eventType, actor, payload, prevHash);

    const entry: AuditEntry = { seq, ts, eventType, actor, payload, prevHash, hash };

    if (this._entries.length >= this._maxEntries) {
      this._entries.shift(); // drop oldest
    }
    this._entries.push(entry);
    return entry;
  }

  verify(): { valid: boolean; brokenAt?: number } {
    if (this._entries.length === 0) return { valid: true };

    for (let i = 0; i < this._entries.length; i++) {
      const entry = this._entries[i]!;
      const expectedPrevHash = i === 0 ? GENESIS_HASH : this._entries[i - 1]!.hash;

      // Verify prevHash pointer
      if (entry.prevHash !== expectedPrevHash) {
        return { valid: false, brokenAt: entry.seq };
      }

      // Recompute hash and compare
      const recomputed = this._computeHash(
        entry.seq, entry.ts, entry.eventType, entry.actor, entry.payload, entry.prevHash,
      );
      if (recomputed !== entry.hash) {
        return { valid: false, brokenAt: entry.seq };
      }
    }

    return { valid: true };
  }

  exportJsonl(): string {
    return this._entries.map(e => JSON.stringify(e)).join('\n');
  }

  getEntries(): AuditEntry[] {
    return [...this._entries];
  }

  private _computeHash(
    seq: number,
    ts: number,
    eventType: EventType,
    actor: string,
    payload: unknown,
    prevHash: string,
  ): string {
    const content = JSON.stringify({ seq, ts, eventType, actor, payload, prevHash });
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }
}
