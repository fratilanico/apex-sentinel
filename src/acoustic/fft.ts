// APEX-SENTINEL — FFT Spectral Analysis
// W1 | src/acoustic/fft.ts
// STUB — implementation pending (TDD RED)

import { PcmChunk, SpectralAnalysis } from './types.js';

export class FftAnalyser {
  constructor(
    private readonly windowSize: number = 2048,
    private readonly overlap: number = 0.5,
  ) {}

  analyse(_chunk: PcmChunk): SpectralAnalysis {
    throw new Error('NOT_IMPLEMENTED');
  }

  detectDroneHarmonics(_spectral: SpectralAnalysis): boolean {
    throw new Error('NOT_IMPLEMENTED');
  }
}
