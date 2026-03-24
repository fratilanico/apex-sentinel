// APEX-SENTINEL — YAMNet TFLite Inference (Node.js surrogate)
// W1 | src/acoustic/yamnet.ts
// STUB — implementation pending (TDD RED)

import { SpectralAnalysis, YamNetResult } from './types.js';

export class YamNetInferenceEngine {
  private modelLoaded = false;
  readonly modelSizeKb = 480;

  async loadModel(_modelPath: string): Promise<void> {
    throw new Error('NOT_IMPLEMENTED');
  }

  async infer(_spectral: SpectralAnalysis): Promise<YamNetResult> {
    throw new Error('NOT_IMPLEMENTED');
  }

  isModelLoaded(): boolean {
    return this.modelLoaded;
  }

  getLatencyMs(): number {
    throw new Error('NOT_IMPLEMENTED');
  }
}
