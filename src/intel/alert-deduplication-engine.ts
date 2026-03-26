// APEX-SENTINEL — W11 AlertDeduplicationEngine
// FR-W11-07 | src/intel/alert-deduplication-engine.ts

// ── Types ────────────────────────────────────────────────────────────────────

export interface AlertInput {
  droneType: string;
  awningLevel: string;
  sector: string;
  ts: number;
}

export interface AlertRecord {
  key: string;
  ts: number;
  droneType: string;
  awningLevel: string;
  sector: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RING_SIZE = 500;

// ── AlertDeduplicationEngine ─────────────────────────────────────────────────

export class AlertDeduplicationEngine {
  private readonly ring: AlertRecord[] = [];
  private head = 0;
  private size = 0;

  /**
   * Computes the dedup key for an alert.
   * Key format: `${droneType}:${awningLevel}:${sector}:${bucketId}`
   * bucketId = Math.floor(ts / 300000) — 5-minute time bucket
   */
  private makeKey(alert: AlertInput): string {
    const bucketId = Math.floor(alert.ts / DEDUP_WINDOW_MS);
    return `${alert.droneType}:${alert.awningLevel}:${alert.sector}:${bucketId}`;
  }

  /**
   * Returns true if this alert should be sent to the operator (first time in this window).
   * Returns false if a duplicate exists within the same 5-minute bucket.
   */
  shouldAlert(alert: AlertInput): boolean {
    const key = this.makeKey(alert);

    // Check existing ring for duplicate key
    for (let i = 0; i < this.size; i++) {
      const idx = (this.head - this.size + i + MAX_RING_SIZE) % MAX_RING_SIZE;
      if (this.ring[idx]?.key === key) {
        return false;
      }
    }

    // Not a duplicate — record and allow
    const record: AlertRecord = {
      key,
      ts: alert.ts,
      droneType: alert.droneType,
      awningLevel: alert.awningLevel,
      sector: alert.sector,
    };

    if (this.size < MAX_RING_SIZE) {
      this.ring[this.head] = record;
      this.head = (this.head + 1) % MAX_RING_SIZE;
      this.size++;
    } else {
      // Ring is full — overwrite oldest (head is the oldest slot)
      this.ring[this.head] = record;
      this.head = (this.head + 1) % MAX_RING_SIZE;
      // size stays at MAX_RING_SIZE
    }

    return true;
  }

  /**
   * Returns alert history entries within the last windowMs milliseconds.
   * Returns copies only — no PII, key metadata only.
   */
  getAlertHistory(windowMs: number): AlertRecord[] {
    const cutoff = Date.now() - windowMs;
    const result: AlertRecord[] = [];

    for (let i = 0; i < this.size; i++) {
      const idx = (this.head - this.size + i + MAX_RING_SIZE) % MAX_RING_SIZE;
      const record = this.ring[idx];
      if (record && record.ts >= cutoff) {
        result.push({ ...record });
      }
    }
    return result;
  }
}
