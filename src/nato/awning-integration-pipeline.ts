// APEX-SENTINEL — W10 AwningIntegrationPipeline
// FR-W10-08 | src/nato/awning-integration-pipeline.ts

import { EventEmitter } from 'events';
import { AwningLevelPublisher } from './awning-level-publisher.js';
import { StageClassifier } from './stage-classifier.js';
import { Stage35TrajectoryPredictor, type PositionFix } from './stage35-trajectory-predictor.js';
import { NatoAlertFormatter, type AwningAlert } from './nato-alert-formatter.js';
import { AlertThrottleGate } from './alert-throttle-gate.js';
import { StageTransitionAudit } from './stage-transition-audit.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface NatsClient {
  publish(subject: string, data: unknown): void;
  subscribe(subject: string, handler: (msg: unknown) => void): void;
}

export interface EnrichedDetectionInput {
  contextScore: number;
  acousticConfidence: number;
  rfFingerprintMatch: boolean;
  adsbCorrelated: boolean;
  remoteIdWithin500m: boolean;
  civilProtectionLevel?: string;
  droneType: string;
  positions: PositionFix[];
}

// ── AwningIntegrationPipeline ────────────────────────────────────────────────

export class AwningIntegrationPipeline extends EventEmitter {
  private readonly nats: NatsClient;
  private readonly levelPublisher: AwningLevelPublisher;
  private readonly stageClassifier: StageClassifier;
  private readonly trajectoryPredictor: Stage35TrajectoryPredictor;
  private readonly alertFormatter: NatoAlertFormatter;
  private readonly throttleGate: AlertThrottleGate;
  private readonly audit: StageTransitionAudit;
  private running = false;

  constructor(nats: NatsClient) {
    super();
    this.nats = nats;
    this.levelPublisher = new AwningLevelPublisher(nats);
    this.stageClassifier = new StageClassifier();
    this.trajectoryPredictor = new Stage35TrajectoryPredictor();
    this.alertFormatter = new NatoAlertFormatter();
    this.throttleGate = new AlertThrottleGate();
    this.audit = new StageTransitionAudit();
  }

  /**
   * Subscribes to detection.enriched NATS subject.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.nats.subscribe('detection.enriched', (msg: unknown) => {
      try {
        const detection = msg as EnrichedDetectionInput;
        this.processDetection(detection);
      } catch (err) {
        this.emit('error', err);
      }
    });
  }

  stop(): void {
    this.running = false;
  }

  /**
   * Processes an enriched detection through the full AWNING pipeline.
   * Returns the AwningAlert (or null if throttled).
   */
  processDetection(enriched: EnrichedDetectionInput): AwningAlert | null {
    // 1. Stage classification
    const stageResult = this.stageClassifier.classify({
      acousticConfidence: enriched.acousticConfidence,
      rfFingerprintMatch: enriched.rfFingerprintMatch,
      adsbCorrelated: enriched.adsbCorrelated,
      remoteIdWithin500m: enriched.remoteIdWithin500m,
    });

    // 2. Trajectory prediction (if positions provided)
    let trajectory;
    if (enriched.positions.length > 0) {
      this.trajectoryPredictor.reset();
      for (const fix of enriched.positions) {
        this.trajectoryPredictor.update(fix);
      }
      trajectory = this.trajectoryPredictor.predict();
    }

    // 3. AWNING level derivation
    const level = this.levelPublisher.deriveLevel(
      enriched.contextScore,
      enriched.civilProtectionLevel,
    );

    // 4. Publish awning.level
    this.levelPublisher.publish(level, enriched.contextScore);
    this.levelPublisher.recordReading(level);

    // 5. Audit stage transition
    if (stageResult.stage !== null) {
      this.audit.record(null, stageResult.stage, stageResult.evidence);
    }

    // 6. Format alert
    const alert = this.alertFormatter.format(
      level,
      stageResult,
      enriched.droneType,
      trajectory,
    );

    // 7. Publish awning.alert
    this.nats.publish('awning.alert', alert);

    return alert;
  }
}
