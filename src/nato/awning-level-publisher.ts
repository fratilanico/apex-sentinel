// APEX-SENTINEL — W10 AwningLevelPublisher
// FR-W10-01 | src/nato/awning-level-publisher.ts

// ── Types ────────────────────────────────────────────────────────────────────

export type AwningLevel = 'WHITE' | 'YELLOW' | 'RED';

interface NatsClient {
  publish(subject: string, data: unknown): void;
}

export interface AwningLevelMessage {
  level: AwningLevel;
  contextScore: number;
  ts: string;
}

// ── AwningLevelPublisher ─────────────────────────────────────────────────────

const LEVEL_ORDER: Record<AwningLevel, number> = { WHITE: 0, YELLOW: 1, RED: 2 };

export class AwningLevelPublisher {
  private readonly nats: NatsClient;
  private readonly history: AwningLevel[] = [];
  // Tracks consecutive readings that are below the highest recorded level
  // (used to gate de-escalation)
  private consecutiveLowerCount = 0;
  private peakLevel: AwningLevel | null = null;

  constructor(nats: NatsClient) {
    this.nats = nats;
  }

  /**
   * Derives AWNING level from contextScore and optional CivilProtection level.
   * CivilProtection CRITICAL → always RED.
   * Score bands: 0-29 WHITE, 30-59 YELLOW, 60-100 RED.
   */
  deriveLevel(contextScore: number, civilProtectionLevel?: string): AwningLevel {
    if (civilProtectionLevel === 'CRITICAL') return 'RED';
    if (contextScore >= 60) return 'RED';
    if (contextScore >= 30) return 'YELLOW';
    return 'WHITE';
  }

  /**
   * Publishes AWNING level to NATS awning.level subject.
   */
  publish(level: AwningLevel, contextScore: number): void {
    const msg: AwningLevelMessage = {
      level,
      contextScore,
      ts: new Date().toISOString(),
    };
    this.nats.publish('awning.level', msg);
  }

  /**
   * Records a level reading and updates hysteresis tracking.
   */
  recordReading(level: AwningLevel): void {
    this.history.push(level);
    if (this.peakLevel === null) {
      this.peakLevel = level;
      this.consecutiveLowerCount = 0;
    } else {
      const peakOrder = LEVEL_ORDER[this.peakLevel];
      const newOrder = LEVEL_ORDER[level];
      if (newOrder >= peakOrder) {
        // New peak or same level — reset lower count, update peak
        this.peakLevel = level;
        this.consecutiveLowerCount = 0;
      } else {
        // Lower reading — increment consecutive lower count
        this.consecutiveLowerCount++;
      }
    }
  }

  /**
   * Determines if de-escalation (or escalation) should happen.
   * Escalation (going UP in severity) is always allowed.
   * De-escalation requires 2 consecutive lower readings already recorded.
   *
   * Level ordering: WHITE < YELLOW < RED
   */
  shouldDeEscalate(newLevel: AwningLevel): boolean {
    if (this.peakLevel === null) return true;

    const currentOrder = LEVEL_ORDER[this.peakLevel];
    const newOrder = LEVEL_ORDER[newLevel];

    // Escalation or same: always immediate
    if (newOrder >= currentOrder) return true;

    // De-escalation: need at least 1 consecutive lower reading already recorded
    // (hysteresis: 2 total de-escalation readings including the current check)
    return this.consecutiveLowerCount >= 1;
  }

  getHistory(): AwningLevel[] {
    return [...this.history];
  }
}
