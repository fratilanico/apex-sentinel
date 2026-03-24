// APEX-SENTINEL — Acoustic Detection Pipeline
// W1 | src/acoustic/pipeline.ts
// STUB — implementation pending (TDD RED)

import { PcmChunk, AcousticDetectionEvent, VadResult } from './types.js';

export interface PipelineConfig {
  confidenceThreshold: number;
  maxLatencyMs: number;
  nodeId: string;
}

export interface PipelineStats {
  chunksProcessed: number;
  chunksDropped: number;
  detectionsEmitted: number;
  avgLatencyMs: number;
}

export class AcousticPipeline {
  constructor(private config: PipelineConfig) {}

  async processChunk(_chunk: PcmChunk): Promise<AcousticDetectionEvent | null> {
    throw new Error('NOT_IMPLEMENTED');
  }

  getStats(): PipelineStats {
    throw new Error('NOT_IMPLEMENTED');
  }

  get vadDropRate(): number {
    throw new Error('NOT_IMPLEMENTED');
  }
}
