// APEX-SENTINEL — W11 ThreatTimelineBuilder
// FR-W11-03 | src/intel/threat-timeline-builder.ts

// ── Types ────────────────────────────────────────────────────────────────────

export type TimelineEventType =
  | 'acoustic_detection'
  | 'awning_escalation'
  | 'awning_de-escalation'
  | 'osint_event'
  | 'adsb_anomaly';

export interface TimelineEntry {
  ts: number;
  eventType: TimelineEventType;
  severity: number;   // 0–100
  summary: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_ENTRIES = 10_000;
// Velocity computed over last 30 minutes
const VELOCITY_WINDOW_MS = 30 * 60 * 1000;

// ── ThreatTimelineBuilder ────────────────────────────────────────────────────

export class ThreatTimelineBuilder {
  private readonly entries: TimelineEntry[] = [];

  /**
   * Adds a timeline entry. Evicts oldest when > MAX_ENTRIES.
   */
  addEntry(entry: TimelineEntry): void {
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.shift();
    }
  }

  /**
   * Returns entries within the last windowMs milliseconds, sorted ascending by ts.
   * Uses the ts of the most recent entry as "now" — or wall-clock if no entries.
   */
  getRecentTimeline(windowMs: number): TimelineEntry[] {
    if (this.entries.length === 0) return [];

    const nowTs = Date.now();
    const cutoff = nowTs - windowMs;

    return [...this.entries]
      .filter(e => e.ts > cutoff)
      .sort((a, b) => a.ts - b.ts);
  }

  /**
   * Returns escalation velocity: change in severity per minute over the last
   * VELOCITY_WINDOW_MS (30 min). Positive = escalating, negative = de-escalating, 0 = stable.
   *
   * Uses linear regression slope of severity vs time (minutes from first entry in window).
   */
  getEscalationVelocity(): number {
    if (this.entries.length < 2) return 0;

    const nowTs = Date.now();
    const cutoff = nowTs - VELOCITY_WINDOW_MS;

    // Use entries in velocity window only
    const window = this.entries.filter(e => e.ts >= cutoff);
    if (window.length < 2) {
      // Fall back to all entries if window is sparse
      return this._computeVelocity(this.entries);
    }
    return this._computeVelocity(window);
  }

  private _computeVelocity(entries: TimelineEntry[]): number {
    if (entries.length < 2) return 0;

    // Use first entry ts as origin; convert to minutes
    const origin = entries[0].ts;
    const xs = entries.map(e => (e.ts - origin) / 60_000); // minutes
    const ys = entries.map(e => e.severity);

    // Linear regression slope
    const n = xs.length;
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
    const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);

    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-9) return 0;

    return (n * sumXY - sumX * sumY) / denom;
  }
}
