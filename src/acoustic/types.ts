// APEX-SENTINEL — Acoustic Detection Types
// W1 | src/acoustic/types.ts

export interface PcmChunk {
  samples: Int16Array;
  sampleRate: number;
  channelCount: number;
  timestampUs: bigint;
  durationMs: number;
}

export enum VadResult {
  SILENCE = 'SILENCE',
  SPEECH = 'SPEECH',
}

export interface SpectralAnalysis {
  fftMagnitudes: Float32Array;
  peakFrequencyHz: number;
  energyBands: {
    low: number;     // 500–800Hz
    mid: number;     // 800–1400Hz
    high: number;    // 1400–2000Hz
    turbine: number; // 3000–8000Hz (Shahed-238 jet engine BPF)
  };
  rmsLevel: number;
  timestampUs: bigint;
}

export interface YamNetResult {
  droneConfidence: number;
  helicopterConfidence: number;
  mechanicalNoiseConfidence: number;
  topClass: string;
  latencyMs: number;
  timestampUs: bigint;
}

export interface AcousticDetectionEvent {
  eventId: string;
  nodeId: string;
  timestampUs: bigint;
  peakFrequencyHz: number;
  confidence: number;
  spectral: SpectralAnalysis;
  yamnet: YamNetResult;
  lat?: number;
  lon?: number;
  positionErrorM?: number;
}
