// APEX-SENTINEL — W19 EuAwningLevelAssigner
// FR-W19-04 | src/intel/eu-awning-level-assigner.ts

import type { AwningLevel } from './types.js';

interface ZoneRef {
  id: string;
  type: 'airport' | 'nuclear' | 'military' | 'government' | string;
}

interface NatsClient {
  publish(subject: string, data: unknown): void;
}

interface EuAwningLevelAssignerOptions {
  nats?: NatsClient;
}

// Strict zone types that use nuclear/military thresholds
const STRICT_ZONE_TYPES = new Set(['nuclear', 'military']);

function getLevel(score: number, strict: boolean): AwningLevel {
  if (!isFinite(score) || isNaN(score)) {
    return 'GREEN';
  }
  if (score <= 0) return 'GREEN';
  if (score >= 100) return 'RED';

  if (strict) {
    // nuclear/military: GREEN<15, YELLOW<30, ORANGE<50, RED>=50
    if (score < 15) return 'GREEN';
    if (score < 30) return 'YELLOW';
    if (score < 50) return 'ORANGE';
    return 'RED';
  } else {
    // airport/government: GREEN<20, YELLOW<50, ORANGE<75, RED>=75
    if (score < 20) return 'GREEN';
    if (score < 50) return 'YELLOW';
    if (score < 75) return 'ORANGE';
    return 'RED';
  }
}

export class EuAwningLevelAssigner {
  private readonly nats?: NatsClient;
  private readonly zoneState: Map<string, AwningLevel> = new Map();

  constructor(options: EuAwningLevelAssignerOptions = {}) {
    this.nats = options.nats;
  }

  assign(score: number, zone: ZoneRef | null | undefined): AwningLevel {
    try {
      const zoneId = zone?.id ?? '__unknown__';
      const zoneType = zone?.type ?? 'airport';
      const strict = STRICT_ZONE_TYPES.has(zoneType);

      const level = getLevel(score, strict);
      const previousLevel = this.zoneState.get(zoneId) ?? 'CLEAR';
      const changed = level !== previousLevel;

      this.zoneState.set(zoneId, level);

      if (changed && this.nats) {
        const payload = {
          zoneId,
          level,
          previousLevel,
          changed: true,
          timestampMs: Date.now(),
        };
        this.nats.publish('sentinel.intel.awning_change', payload);
      }

      return level;
    } catch {
      return 'GREEN';
    }
  }
}
