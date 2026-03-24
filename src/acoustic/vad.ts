// APEX-SENTINEL — Voice Activity Detection (WebRTC-compatible energy-based)
// W1 | src/acoustic/vad.ts

import { PcmChunk, VadResult } from './types.js';

// Valid frame sizes for 16kHz: 10ms=160, 20ms=320, 30ms=480 samples
const VALID_FRAME_SIZES = new Set([160, 320, 480]);

// Energy thresholds per aggressiveness level (0=permissive, 3=strict)
const ENERGY_THRESHOLDS: Record<0 | 1 | 2 | 3, number> = {
  0: 50,
  1: 200,
  2: 800,
  3: 2500,
};

export class VadFilter {
  private readonly threshold: number;

  constructor(aggressiveness: 0 | 1 | 2 | 3 = 2) {
    this.threshold = ENERGY_THRESHOLDS[aggressiveness];
  }

  classify(chunk: PcmChunk): VadResult {
    if (!VALID_FRAME_SIZES.has(chunk.samples.length)) {
      throw new Error(
        `IllegalArgumentException: frame size ${chunk.samples.length} invalid. ` +
        `Expected 10ms (160), 20ms (320), or 30ms (480) samples at 16kHz.`,
      );
    }

    const rmsEnergy = this.computeRms(chunk.samples);
    return rmsEnergy >= this.threshold ? VadResult.SPEECH : VadResult.SILENCE;
  }

  private computeRms(samples: Int16Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }
}
