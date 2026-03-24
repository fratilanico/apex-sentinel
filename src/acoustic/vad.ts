// APEX-SENTINEL — Voice Activity Detection
// W1 | src/acoustic/vad.ts
// STUB — implementation pending (TDD RED)

import { PcmChunk, VadResult } from './types.js';

export class VadFilter {
  constructor(private aggressiveness: 0 | 1 | 2 | 3 = 2) {}

  classify(_chunk: PcmChunk): VadResult {
    throw new Error('NOT_IMPLEMENTED');
  }
}
