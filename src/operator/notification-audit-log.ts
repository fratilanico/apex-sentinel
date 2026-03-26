// APEX-SENTINEL — W13 NotificationAuditLog
// FR-W13-07 | src/operator/notification-audit-log.ts
// GDPR: stores metadata only — no message content

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  readonly ts: number;
  readonly operatorId: string;
  readonly alertId: string;
  readonly awningLevel: string;
  readonly delivered: boolean;
  readonly error?: string;
}

export interface DeliveryRate {
  sent: number;
  failed: number;
  rate: number;
}

// ── NotificationAuditLog ─────────────────────────────────────────────────────

const DEFAULT_MAX_ENTRIES = 500;

export class NotificationAuditLog {
  private readonly maxEntries: number;
  private readonly buffer: AuditEntry[] = [];

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  /**
   * Records a notification attempt. Entry is immutable (Object.freeze).
   * If buffer is full, oldest entry is dropped (ring buffer).
   */
  record(entry: Omit<AuditEntry, 'ts'> & { ts?: number }): AuditEntry {
    const frozen = Object.freeze<AuditEntry>({
      ts: entry.ts ?? Date.now(),
      operatorId: entry.operatorId,
      alertId: entry.alertId,
      awningLevel: entry.awningLevel,
      delivered: entry.delivered,
      ...(entry.error !== undefined ? { error: entry.error } : {}),
    });

    if (this.buffer.length >= this.maxEntries) {
      this.buffer.shift(); // drop oldest
    }

    this.buffer.push(frozen);
    return frozen;
  }

  /**
   * Returns entries within the last windowMs, sorted descending (newest first).
   */
  getRecentNotifications(windowMs: number): AuditEntry[] {
    const cutoff = Date.now() - windowMs;
    return this.buffer
      .filter(e => e.ts >= cutoff)
      .sort((a, b) => b.ts - a.ts);
  }

  /**
   * Calculates delivery rate within windowMs.
   */
  getDeliveryRate(windowMs: number): DeliveryRate {
    const recent = this.getRecentNotifications(windowMs);
    const sent = recent.filter(e => e.delivered).length;
    const failed = recent.filter(e => !e.delivered).length;
    const total = recent.length;
    return {
      sent,
      failed,
      rate: total === 0 ? 0 : sent / total,
    };
  }

  /** Total entries in buffer. */
  get size(): number {
    return this.buffer.length;
  }

  /** For testing — returns all entries. */
  getAll(): readonly AuditEntry[] {
    return this.buffer;
  }
}
