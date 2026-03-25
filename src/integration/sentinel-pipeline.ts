// APEX-SENTINEL — W6 Sentinel Pipeline
// FR-W6-08 | src/integration/sentinel-pipeline.ts
//
// Full integration layer: audio frame → VAD → FFT → YAMNet → FalsePositiveGuard
//   → TrackManager → EKF → NATS publish
// Event bus architecture: modules subscribe to events.
// Buffers offline results when NATS disconnected (max 1000 frames).
// Pipeline is resilient: per-module errors do not propagate.

export interface PipelineStatus {
  running: boolean;
  activeModules: number;
  dropsPerSecond: number;
  processedFrames: number;
  lastFrameAt: number | null;
  bufferedFrames: number;
}

export interface PipelineMetrics {
  dropsPerSecond: number;
  processedFrames: number;
  bufferedFrames: number;
  averageLatencyMs: number;
}

export class PipelineNotRunningError extends Error {
  constructor() {
    super('PipelineNotRunningError: call start() before processing frames');
    this.name = 'PipelineNotRunningError';
  }
}

interface AcousticResult {
  classification: string;
  confidence: number;
  features: unknown[];
}

interface ModuleSet {
  acousticPipeline: { process: (frame: Float32Array) => Promise<AcousticResult> };
  falsePositiveGuard: {
    assess: (input: { yamnetConfidence: number; hasRfSignal: boolean; trackId: string }) => { isFalsePositive: boolean; confidence: number; reason: string | null };
    addTemporalSample: (input: unknown) => void;
  };
  trackManager: { updateTrack: (input: { droneType: string; confidence: number }) => string };
  multiTrackEKFManager: { processDetection: (det: unknown) => unknown };
  predictionPublisher: { publishToNats: (result: unknown) => Promise<void> };
  natsClient: { isConnected: () => boolean };
}

export interface SentinelPipelineOptions {
  modules: ModuleSet;
  maxBufferSize?: number;
}

const MAX_BUFFER_DEFAULT = 1000;
const ACTIVE_MODULE_COUNT = 6; // acoustic, FPG, trackManager, EKF, publisher, NATS

export class SentinelPipeline {
  private readonly modules: ModuleSet;
  private readonly maxBuffer: number;
  private running = false;
  private processedFrames = 0;
  private dropsPerSecond = 0;
  private lastFrameAt: number | null = null;
  private readonly offlineBuffer: unknown[] = [];
  private lastDropCheck = Date.now();
  private dropsSinceCheck = 0;

  constructor(options: SentinelPipelineOptions) {
    this.modules = options.modules;
    this.maxBuffer = options.maxBufferSize ?? MAX_BUFFER_DEFAULT;
  }

  async start(): Promise<void> {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async processAudioFrame(frame: Float32Array): Promise<void> {
    if (!this.running) throw new PipelineNotRunningError();

    const start = performance.now();

    try {
      // Stage 1: Acoustic classification (VAD + FFT + YAMNet)
      let acoustic: AcousticResult;
      try {
        acoustic = await this.modules.acousticPipeline.process(frame);
      } catch {
        // Acoustic pipeline error — drop frame, count as drop
        this.dropsSinceCheck++;
        return;
      }

      // Stage 2: False positive guard
      const assessment = this.modules.falsePositiveGuard.assess({
        yamnetConfidence: acoustic.confidence,
        hasRfSignal: false, // W7: inject RF cross-check via RTL-SDR module
        trackId: 'pending', // trackId assigned after TrackManager
      });

      if (assessment.isFalsePositive) {
        // Suppressed — do not update EKF
        this.processedFrames++;
        this.lastFrameAt = Date.now();
        return;
      }

      // Stage 3: Track management
      const trackId = this.modules.trackManager.updateTrack({
        droneType: acoustic.classification,
        confidence: acoustic.confidence,
      });

      // Stage 4: EKF update
      const predictionResult = this.modules.multiTrackEKFManager.processDetection({
        trackId,
        lat: 51.5, lon: 4.9, alt: 200, // W7: replace with TDoA-derived coordinates from acoustic localization
        timestamp: Date.now(),
        confidence: acoustic.confidence,
        droneType: acoustic.classification,
      });

      // Stage 5: NATS publish
      const natsConnected = this.modules.natsClient.isConnected();
      if (natsConnected) {
        try {
          await this.modules.predictionPublisher.publishToNats(predictionResult);
        } catch {
          // NATS error — buffer
          this.bufferResult(predictionResult);
        }
      } else {
        this.bufferResult(predictionResult);
      }

      // Recalculate drops/sec periodically
      const now = Date.now();
      if (now - this.lastDropCheck >= 1000) {
        this.dropsPerSecond = this.dropsSinceCheck;
        this.dropsSinceCheck = 0;
        this.lastDropCheck = now;
      }
    } catch {
      // Catch-all: pipeline is resilient
    }

    this.processedFrames++;
    this.lastFrameAt = Date.now();
  }

  private bufferResult(result: unknown): void {
    if (this.offlineBuffer.length >= this.maxBuffer) {
      this.offlineBuffer.shift(); // drop oldest
    }
    this.offlineBuffer.push(result);
  }

  getStatus(): PipelineStatus & { bufferedFrames: number } {
    return {
      running: this.running,
      activeModules: this.running ? ACTIVE_MODULE_COUNT : 0,
      dropsPerSecond: this.dropsPerSecond,
      processedFrames: this.processedFrames,
      lastFrameAt: this.lastFrameAt,
      bufferedFrames: this.offlineBuffer.length,
    };
  }

  getMetrics(): PipelineMetrics {
    return {
      dropsPerSecond: this.dropsPerSecond,
      processedFrames: this.processedFrames,
      bufferedFrames: this.offlineBuffer.length,
      averageLatencyMs: 0, // W7: add latency histogram tracking
    };
  }
}
