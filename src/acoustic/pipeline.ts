// APEX-SENTINEL — Acoustic Detection Pipeline
// W1 | src/acoustic/pipeline.ts
// Gate 3 acoustic path: VAD → FFT → YAMNet → event emission

import { PcmChunk, AcousticDetectionEvent, VadResult } from './types.js';
import { VadFilter } from './vad.js';
import { FftAnalyser } from './fft.js';
import { YamNetInferenceEngine } from './yamnet.js';
import { randomUUID } from 'crypto';

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
  private vad: VadFilter;
  private fft: FftAnalyser;
  private yamnet: YamNetInferenceEngine;

  private stats: PipelineStats = {
    chunksProcessed: 0,
    chunksDropped: 0,
    detectionsEmitted: 0,
    avgLatencyMs: 0,
  };
  private latencies: number[] = [];
  private modelReady = false;

  constructor(private config: PipelineConfig) {
    this.vad = new VadFilter(2);
    this.fft = new FftAnalyser(2048, 0.5);
    this.yamnet = new YamNetInferenceEngine();
  }

  async processChunk(chunk: PcmChunk): Promise<AcousticDetectionEvent | null> {
    const start = Date.now();
    this.stats.chunksProcessed++;

    // Ensure model is loaded (lazy init)
    if (!this.modelReady) {
      await this.yamnet.loadModel('models/yamnet.tflite');
      this.modelReady = true;
    }

    // Stage 1: VAD filter — split into 10ms sub-frames if chunk > 480 samples
    const vadResult = this.classifyVad(chunk);

    if (vadResult === VadResult.SILENCE) {
      this.stats.chunksDropped++;
      return null;
    }

    // Stage 2: FFT spectral analysis
    const spectral = this.fft.analyse(chunk);

    // Stage 3: YAMNet inference
    const yamnet = await this.yamnet.infer(spectral);

    // Stage 4: Confidence gate
    if (yamnet.droneConfidence < this.config.confidenceThreshold) {
      return null;
    }

    const latencyMs = Date.now() - start;
    this.latencies.push(latencyMs);
    this.stats.avgLatencyMs = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
    this.stats.detectionsEmitted++;

    return {
      eventId: randomUUID(),
      nodeId: this.config.nodeId,
      timestampUs: chunk.timestampUs,
      peakFrequencyHz: spectral.peakFrequencyHz,
      confidence: yamnet.droneConfidence,
      spectral,
      yamnet,
    };
  }

  getStats(): PipelineStats {
    return { ...this.stats };
  }

  private classifyVad(chunk: PcmChunk): VadResult {
    const FRAME_SIZE = 160; // 10ms at 16kHz — valid VAD frame
    if (chunk.samples.length <= 480) {
      try {
        return this.vad.classify(chunk);
      } catch {
        return VadResult.SILENCE;
      }
    }
    // Split into 10ms sub-frames and return SPEECH if any sub-frame is active
    for (let offset = 0; offset + FRAME_SIZE <= chunk.samples.length; offset += FRAME_SIZE) {
      const subFrame: PcmChunk = {
        samples: chunk.samples.slice(offset, offset + FRAME_SIZE),
        sampleRate: chunk.sampleRate,
        channelCount: chunk.channelCount,
        timestampUs: chunk.timestampUs + BigInt(Math.round((offset / chunk.sampleRate) * 1_000_000)),
        durationMs: (FRAME_SIZE / chunk.sampleRate) * 1000,
      };
      try {
        if (this.vad.classify(subFrame) === VadResult.SPEECH) return VadResult.SPEECH;
      } catch {
        continue;
      }
    }
    return VadResult.SILENCE;
  }

  get vadDropRate(): number {
    if (this.stats.chunksProcessed === 0) return 0;
    return this.stats.chunksDropped / this.stats.chunksProcessed;
  }
}
