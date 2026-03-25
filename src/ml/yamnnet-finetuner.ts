// APEX-SENTINEL — W6 YAMNet Fine-tuner
// FR-W6-02 | src/ml/yamnnet-finetuner.ts
//
// Fine-tuning pipeline for YAMNet-512 on drone acoustic signatures.
// Transfer learning: freeze 90% of base layers, retrain 10-class head.
// Supports ONNX export for edge deployment.
// Dependency-injected model backend for testability.

export interface TrainingConfig {
  sampleRate: number;        // 22050
  windowSizeSeconds: number; // 2.0
  hopSizeSeconds: number;    // 0.5
  nMels: number;             // 128
  fMin: number;              // 80
  fMax: number;              // 8000
  batchSize: number;
  epochs: number;
  learningRate: number;      // 1e-4
}

export interface TrainingMetrics {
  epoch: number;
  loss: number;
  valAccuracy: number;
  falsePositiveRate: number;
  droneClassAccuracy: number;
}

export interface EvaluationResult {
  accuracy: number;
  falsePositiveRate: number;
}

export interface ModelBackend {
  trainEpoch: (config: TrainingConfig, epoch: number) => Promise<TrainingMetrics>;
  evaluate: () => Promise<EvaluationResult>;
  exportONNX: (outputPath: string) => Promise<void>;
}

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  sampleRate: 22050,
  windowSizeSeconds: 2.0,
  hopSizeSeconds: 0.5,
  nMels: 128,
  fMin: 80,
  fMax: 8000,
  batchSize: 32,
  epochs: 10,
  learningRate: 1e-4,
};

export class DatasetNotLoadedError extends Error {
  constructor() {
    super('DatasetNotLoaded: call loadDataset() before training');
    this.name = 'DatasetNotLoadedError';
  }
}

export class ModelNotTrainedError extends Error {
  constructor() {
    super('ModelNotTrained: call trainEpoch() at least once before export');
    this.name = 'ModelNotTrainedError';
  }
}

export interface YAMNetFineTunerOptions {
  modelBackend: ModelBackend;
  config?: Partial<TrainingConfig>;
}

export class YAMNetFineTuner {
  private readonly backend: ModelBackend;
  private readonly config: TrainingConfig;
  private datasetPath: string | null = null;
  private currentEpoch = 0;
  private metricsHistory: TrainingMetrics[] = [];

  constructor(options: YAMNetFineTunerOptions) {
    this.backend = options.modelBackend;
    this.config = { ...DEFAULT_TRAINING_CONFIG, ...(options.config ?? {}) };
  }

  loadDataset(path: string): void {
    this.datasetPath = path;
  }

  isDatasetLoaded(): boolean {
    return this.datasetPath !== null;
  }

  getConfig(): TrainingConfig {
    return { ...this.config };
  }

  async trainEpoch(batchSize: number): Promise<TrainingMetrics> {
    if (!this.datasetPath) throw new DatasetNotLoadedError();
    this.currentEpoch++;
    const metrics = await this.backend.trainEpoch(
      { ...this.config, batchSize },
      this.currentEpoch
    );
    // Overwrite epoch number with our tracked counter
    const tracked: TrainingMetrics = { ...metrics, epoch: this.currentEpoch };
    this.metricsHistory.push(tracked);
    return tracked;
  }

  async evaluate(): Promise<EvaluationResult> {
    return this.backend.evaluate();
  }

  async exportONNX(outputPath: string): Promise<void> {
    if (this.currentEpoch === 0) throw new ModelNotTrainedError();
    await this.backend.exportONNX(outputPath);
  }

  getMetrics(): TrainingMetrics[] {
    return [...this.metricsHistory];
  }
}
