// FR-W14-04: DashboardStateStore — in-memory state for dashboard

import type { AwningLevel, SerializedDetection } from './detection-serializer.js';

export interface AwningTransition {
  from: AwningLevel;
  to: AwningLevel;
  ts: number;
  reason: string;
}

export interface IntelBrief {
  id: string;
  summary: string;
  threatLevel: string;
  sources: string[];
  ts: number;
}

export interface DashboardSnapshot {
  awningLevel: AwningLevel;
  awningTransitions: AwningTransition[];
  detections: SerializedDetection[];
  latestIntel: IntelBrief | null;
  uptimeMs: number;
}

export type DashboardEvent =
  | { type: 'awning_update'; level: AwningLevel; reason: string }
  | { type: 'detection'; detection: SerializedDetection }
  | { type: 'intel_brief'; brief: IntelBrief }
  | { type: 'node_health'; nodeId: string; stats: Record<string, unknown> };

const MAX_DETECTIONS = 50;
const MAX_TRANSITIONS = 10;

export class DashboardStateStore {
  private awningLevel: AwningLevel = 'GREEN';
  private awningTransitions: AwningTransition[] = [];
  private detections: SerializedDetection[] = [];
  private latestIntel: IntelBrief | null = null;
  private readonly startedAt: number;

  constructor() {
    this.startedAt = Date.now();
  }

  update(event: DashboardEvent): void {
    if (event.type === 'awning_update') {
      const transition: AwningTransition = {
        from: this.awningLevel,
        to: event.level,
        ts: Date.now(),
        reason: event.reason,
      };
      this.awningLevel = event.level;
      this.awningTransitions.push(transition);
      if (this.awningTransitions.length > MAX_TRANSITIONS) {
        this.awningTransitions = this.awningTransitions.slice(-MAX_TRANSITIONS);
      }
    } else if (event.type === 'detection') {
      this.detections.push(event.detection);
      if (this.detections.length > MAX_DETECTIONS) {
        this.detections = this.detections.slice(-MAX_DETECTIONS);
      }
    } else if (event.type === 'intel_brief') {
      this.latestIntel = event.brief;
    }
    // node_health handled by NodeHealthAggregator separately
  }

  getSnapshot(): DashboardSnapshot {
    return {
      awningLevel: this.awningLevel,
      awningTransitions: [...this.awningTransitions],
      detections: [...this.detections],
      latestIntel: this.latestIntel,
      uptimeMs: Date.now() - this.startedAt,
    };
  }

  pruneOld(windowMs = 30 * 60 * 1000): number {
    const cutoff = Date.now() - windowMs;
    const before = this.detections.length;
    this.detections = this.detections.filter(d => d.ts >= cutoff);
    return before - this.detections.length;
  }

  getCurrentAwningLevel(): AwningLevel {
    return this.awningLevel;
  }

  getDetectionCount(): number {
    return this.detections.length;
  }

  reset(): void {
    this.awningLevel = 'GREEN';
    this.awningTransitions = [];
    this.detections = [];
    this.latestIntel = null;
  }
}
