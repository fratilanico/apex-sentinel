// APEX-SENTINEL — W13 AlertRateLimiter
// FR-W13-04 | src/operator/alert-rate-limiter.ts

// ── Types ────────────────────────────────────────────────────────────────────

export type AwningLevel = 'RED' | 'YELLOW' | 'WHITE';

export interface RateLimitInput {
  alertId: string;
  awningLevel: AwningLevel;
  sector: string;
  droneType: string;
  isCriticalEscalation?: boolean; // WHITE→RED escalation bypass
}

export interface AlertHistory {
  // Populated internally; passed for testing injection
  sectorRed?: Record<string, number[]>;
  droneYellow?: Record<string, number>;
}

export interface RateLimitResult {
  deliver: boolean;
  reason?: string;
  cooldownMs?: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const RED_WINDOW_MS = 5 * 60 * 1000;   // 5 minutes
const RED_MAX_COUNT = 3;
const YELLOW_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

// ── AlertRateLimiter ─────────────────────────────────────────────────────────

export class AlertRateLimiter {
  private readonly sectorRed = new Map<string, number[]>();
  private readonly droneYellow = new Map<string, number>();

  /**
   * Determines if an alert should be delivered.
   * @param alert - the incoming alert
   * @param nowMs - wall-clock ms override for testing
   */
  shouldDeliver(alert: RateLimitInput, nowMs: number = Date.now()): RateLimitResult {
    // Critical escalations always bypass rate limiting
    if (alert.isCriticalEscalation) {
      return { deliver: true };
    }

    if (alert.awningLevel === 'RED') {
      return this.checkRed(alert.sector, nowMs);
    }

    if (alert.awningLevel === 'YELLOW') {
      return this.checkYellow(alert.droneType, nowMs);
    }

    // WHITE always delivers (de-escalation)
    return { deliver: true };
  }

  /**
   * Returns remaining cooldown ms for a sector/level pair.
   */
  getAlertCooldown(sector: string, level: 'RED' | 'YELLOW', nowMs: number = Date.now()): number {
    if (level === 'RED') {
      const timestamps = this.sectorRed.get(sector) ?? [];
      const windowStart = nowMs - RED_WINDOW_MS;
      const recent = timestamps.filter(t => t > windowStart);
      if (recent.length < RED_MAX_COUNT) return 0;
      const oldest = Math.min(...recent);
      return Math.max(0, oldest + RED_WINDOW_MS - nowMs);
    }

    if (level === 'YELLOW') {
      const last = this.droneYellow.get(sector) ?? 0;
      return Math.max(0, last + YELLOW_WINDOW_MS - nowMs);
    }

    return 0;
  }

  private checkRed(sector: string, nowMs: number): RateLimitResult {
    const windowStart = nowMs - RED_WINDOW_MS;
    let timestamps = this.sectorRed.get(sector) ?? [];

    // Prune old entries
    timestamps = timestamps.filter(t => t > windowStart);

    if (timestamps.length >= RED_MAX_COUNT) {
      const oldest = Math.min(...timestamps);
      const cooldownMs = oldest + RED_WINDOW_MS - nowMs;
      return {
        deliver: false,
        reason: `RED rate limit: ${RED_MAX_COUNT} per ${RED_WINDOW_MS / 60000} min per sector`,
        cooldownMs: Math.max(0, cooldownMs),
      };
    }

    timestamps.push(nowMs);
    this.sectorRed.set(sector, timestamps);
    return { deliver: true };
  }

  private checkYellow(droneType: string, nowMs: number): RateLimitResult {
    const last = this.droneYellow.get(droneType) ?? 0;
    const elapsed = nowMs - last;

    if (last > 0 && elapsed < YELLOW_WINDOW_MS) {
      return {
        deliver: false,
        reason: `YELLOW rate limit: 1 per ${YELLOW_WINDOW_MS / 60000} min per drone type`,
        cooldownMs: YELLOW_WINDOW_MS - elapsed,
      };
    }

    this.droneYellow.set(droneType, nowMs);
    return { deliver: true };
  }

  /** Reset all state (for testing). */
  reset(): void {
    this.sectorRed.clear();
    this.droneYellow.clear();
  }
}
