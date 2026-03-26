// APEX-SENTINEL — W10 AlertThrottleGate
// FR-W10-06 | src/nato/alert-throttle-gate.ts

import type { AwningLevel } from './awning-level-publisher.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LevelHistoryEntry {
  level: AwningLevel;
  ts: number; // epoch ms
}

// ── Constants ────────────────────────────────────────────────────────────────

const LEVEL_ORDER: Record<AwningLevel, number> = { WHITE: 0, YELLOW: 1, RED: 2 };
const MAX_HISTORY = 10;

// ── AlertThrottleGate ────────────────────────────────────────────────────────

export class AlertThrottleGate {
  private readonly debounceMs: number;
  private readonly deEscalationCount: number;
  private readonly history: LevelHistoryEntry[] = [];
  private lastLevelChangeMs: number | null = null;
  private consecutiveNonRedCount = 0;
  private wasRed = false;

  constructor(debounceMs: number = 30000, deEscalationCount: number = 3) {
    this.debounceMs = debounceMs;
    this.deEscalationCount = deEscalationCount;
  }

  /**
   * Checks whether this new level should be allowed through.
   *
   * Rules:
   * - First call: always allowed.
   * - Escalation to RED: always immediate.
   * - Any level change: debounce (must wait debounceMs since last change).
   * - De-escalation from RED: requires deEscalationCount consecutive non-RED
   *   readings (tracked via record() calls).
   */
  shouldAllow(newLevel: AwningLevel, nowMs: number = Date.now()): boolean {
    // First ever call
    if (this.lastLevelChangeMs === null) return true;

    const lastLevel = this.history[this.history.length - 1]?.level;

    // Escalation to RED is always immediate
    if (newLevel === 'RED') return true;

    // De-escalation from RED requires consecutive non-RED count
    if (this.wasRed && LEVEL_ORDER[newLevel] < LEVEL_ORDER['RED']) {
      if (this.consecutiveNonRedCount < this.deEscalationCount) {
        return false;
      }
    }

    // Debounce check — must have waited debounceMs since last change
    if (lastLevel !== undefined && lastLevel !== newLevel) {
      const elapsed = nowMs - this.lastLevelChangeMs;
      if (elapsed < this.debounceMs) return false;
    }

    return true;
  }

  /**
   * Records a level reading. Updates de-escalation counters and history.
   */
  record(level: AwningLevel, nowMs: number = Date.now()): void {
    const lastLevel = this.history[this.history.length - 1]?.level;

    if (level === 'RED') {
      this.wasRed = true;
      this.consecutiveNonRedCount = 0;
    } else {
      if (this.wasRed) {
        this.consecutiveNonRedCount++;
      }
    }

    if (lastLevel !== level) {
      this.lastLevelChangeMs = nowMs;
    }

    this.history.push({ level, ts: nowMs });
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
  }

  getHistory(): LevelHistoryEntry[] {
    return [...this.history];
  }
}
