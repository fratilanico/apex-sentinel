// FR-W14-08: DashboardIntegrationLayer — wires pipeline to dashboard

import { EventEmitter } from 'node:events';
import type { DashboardStateStore } from './dashboard-state-store.js';
import type { SseStreamManager } from './sse-stream-manager.js';
import type { NodeHealthAggregator } from './node-health-aggregator.js';
import type { DetectionSerializer, RawDetection, AwningLevel } from './detection-serializer.js';
import type { IntelBrief } from './dashboard-state-store.js';

export interface NatsLike {
  subscribe(subject: string, handler: (msg: NatsMessage) => void): NatsSubscription;
}

export interface NatsMessage {
  subject: string;
  data: Uint8Array | string;
}

export interface NatsSubscription {
  unsubscribe(): void;
}

export class DashboardIntegrationLayer {
  private readonly emitter = new EventEmitter();
  private subscriptions: NatsSubscription[] = [];
  private running = false;

  constructor(
    private readonly store: DashboardStateStore,
    private readonly sse: SseStreamManager,
    private readonly nodes: NodeHealthAggregator,
    private readonly serializer: DetectionSerializer,
  ) {}

  // Internal EventEmitter-based integration (used when NATS not available)
  getEmitter(): EventEmitter {
    return this.emitter;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // Listen on internal EventEmitter for pipeline events
    this.emitter.on('awning.alert', (payload: { level: AwningLevel; reason: string }) => {
      const prevLevel = this.store.getCurrentAwningLevel();
      this.store.update({ type: 'awning_update', level: payload.level, reason: payload.reason });

      if (payload.level !== prevLevel) {
        this.sse.broadcast('awning_update', {
          level: payload.level,
          reason: payload.reason,
          ts: Date.now(),
        });
      }
    });

    this.emitter.on('intel.brief', (payload: IntelBrief) => {
      this.store.update({ type: 'intel_brief', brief: payload });
      this.sse.broadcast('intel_brief', payload);
    });

    this.emitter.on('detection.enriched', (raw: RawDetection) => {
      const currentAwning = this.store.getCurrentAwningLevel();
      const serialized = this.serializer.serialize(raw, currentAwning);
      this.store.update({ type: 'detection', detection: serialized });

      // Broadcast Stage 3+ detections or AWNING RED
      if (raw.stage >= 3 || currentAwning === 'RED') {
        this.sse.broadcast('detection', serialized);
      }
    });

    this.emitter.on('node.health', (payload: { nodeId: string; lat?: number; lon?: number; detectionCount?: number; batteryPct?: number }) => {
      this.nodes.updateHeartbeat(payload.nodeId, payload);
      const nodeStatus = this.nodes.getNode(payload.nodeId);
      if (nodeStatus) {
        this.sse.broadcast('node_health', nodeStatus);
      }
    });
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.emitter.removeAllListeners();

    for (const sub of this.subscriptions) {
      try {
        sub.unsubscribe();
      } catch {
        // ignore
      }
    }
    this.subscriptions = [];
  }

  // Optional: wire to real NATS connection
  connectNats(nats: NatsLike): void {
    const subjects = ['awning.alert', 'intel.brief', 'detection.enriched', 'node.health'];

    for (const subject of subjects) {
      const sub = nats.subscribe(subject, (msg: NatsMessage) => {
        try {
          const data = typeof msg.data === 'string'
            ? JSON.parse(msg.data)
            : JSON.parse(new TextDecoder().decode(msg.data as Uint8Array));
          this.emitter.emit(subject, data);
        } catch {
          // malformed message — ignore
        }
      });
      this.subscriptions.push(sub);
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}
