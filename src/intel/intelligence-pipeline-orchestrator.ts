// APEX-SENTINEL — W11 IntelligencePipelineOrchestrator
// FR-W11-08 | src/intel/intelligence-pipeline-orchestrator.ts

import { IntelligencePackBuilder } from './intelligence-pack-builder.js';
import type { IntelBrief, AwningLevel, IntelPackContext, IntelPackDetection } from './intelligence-pack-builder.js';
import type { OsintEvent } from './osint-correlation-engine.js';
import { AlertDeduplicationEngine } from './alert-deduplication-engine.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface NatsClient {
  publish(subject: string, data: unknown): void;
  subscribe(subject: string, handler: (msg: unknown) => void): void;
}

interface AwningAlert {
  level: AwningLevel;
  contextScore: number;
  ts: string;
}

interface FusedMessage {
  feedType?: string;
  payload?: unknown;
  ts?: string;
}

interface EnrichedDetection {
  lat?: number;
  lon?: number;
  ts?: number;
  droneType?: string;
  acousticPresent?: boolean;
  adsbPresent?: boolean;
  remoteIdPresent?: boolean;
  goldsteinScale?: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PUBLISH_INTERVAL_MS = 60_000; // 60 seconds
const TIMELINE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

// ── IntelligencePipelineOrchestrator ─────────────────────────────────────────

export class IntelligencePipelineOrchestrator {
  private readonly nats: NatsClient;
  private readonly builder = new IntelligencePackBuilder();
  private readonly dedup = new AlertDeduplicationEngine();

  // State
  private currentAwningLevel: AwningLevel = 'WHITE';
  private currentAwningTs: number = Date.now();
  private detections: IntelPackDetection[] = [];
  private osintEvents: OsintEvent[] = [];

  private lastBrief: IntelBrief | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(nats: NatsClient) {
    this.nats = nats;
  }

  /**
   * Starts the orchestrator: subscribes to NATS subjects, starts 60s publish timer.
   */
  start(): void {
    this.nats.subscribe('awning.alert', (msg: unknown) => this._handleAwningAlert(msg as AwningAlert));
    this.nats.subscribe('feed.fused', (msg: unknown) => this._handleFeedFused(msg as FusedMessage));
    this.nats.subscribe('detection.enriched', (msg: unknown) => this._handleDetectionEnriched(msg as EnrichedDetection));

    this.timer = setInterval(() => {
      this._publishBrief();
    }, PUBLISH_INTERVAL_MS);
  }

  /**
   * Stops the orchestrator: clears interval.
   */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Returns the last published IntelBrief or null if none yet.
   */
  getLastBrief(): IntelBrief | null {
    return this.lastBrief;
  }

  /**
   * Forces immediate IntelBrief publish.
   */
  forcePublish(): void {
    this._publishBrief();
  }

  // ── Private handlers ──────────────────────────────────────────────────────

  private _handleAwningAlert(msg: AwningAlert): void {
    try {
      this.currentAwningLevel = msg.level;
      this.currentAwningTs = new Date(msg.ts).getTime();

      // AWNING RED → immediate publish
      if (msg.level === 'RED') {
        this._publishBrief();
      }
    } catch {
      // swallow errors
    }
  }

  private _handleFeedFused(msg: FusedMessage): void {
    try {
      if (msg.feedType === 'osint' && msg.payload) {
        const p = msg.payload as { lat?: number; lon?: number; ts?: number; goldsteinScale?: number; eventType?: string };
        if (p.lat !== undefined && p.lon !== undefined) {
          this.osintEvents.push({
            lat: p.lat,
            lon: p.lon,
            ts: p.ts ?? Date.now(),
            goldsteinScale: p.goldsteinScale,
            eventType: p.eventType,
          });
          // Keep last 1000 OSINT events
          if (this.osintEvents.length > 1000) this.osintEvents.shift();
        }
      }
    } catch {
      // swallow errors
    }
  }

  private _handleDetectionEnriched(msg: EnrichedDetection): void {
    try {
      if (msg.lat !== undefined && msg.lon !== undefined) {
        this.detections.push({
          lat: msg.lat,
          lon: msg.lon,
          ts: msg.ts ?? Date.now(),
          droneType: msg.droneType,
        });
        // Keep last 500 detections
        if (this.detections.length > 500) this.detections.shift();
      }
    } catch {
      // swallow errors
    }
  }

  private _publishBrief(): void {
    try {
      const ctx: IntelPackContext = {
        awningLevel: this.currentAwningLevel,
        awningTs: this.currentAwningTs,
        detections: [...this.detections],
        osintEvents: [...this.osintEvents],
        timelineWindow: TIMELINE_WINDOW_MS,
      };

      const brief = this.builder.build(ctx);
      this.lastBrief = brief;
      this.nats.publish('intel.brief', brief);
    } catch {
      // swallow errors
    }
  }
}
