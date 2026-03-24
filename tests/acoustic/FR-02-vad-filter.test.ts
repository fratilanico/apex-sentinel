// APEX-SENTINEL — TDD RED Tests
// FR-02: Voice Activity Detection (VAD) Filtering
// Status: RED — implementation in src/acoustic/vad.ts NOT_IMPLEMENTED

import { describe, it, expect, beforeEach } from 'vitest';
import { VadFilter } from '../../src/acoustic/vad.js';
import { VadResult, PcmChunk } from '../../src/acoustic/types.js';

function makePcmChunk(samples: Int16Array): PcmChunk {
  return {
    samples,
    sampleRate: 16000,
    channelCount: 1,
    timestampUs: BigInt(Date.now()) * 1000n,
    durationMs: (samples.length / 16000) * 1000,
  };
}

function silentChunk(frameSize = 160): PcmChunk {
  return makePcmChunk(new Int16Array(frameSize)); // all zeros
}

function toneChunk(freqHz: number, amplitude: number, frameSize = 160): PcmChunk {
  const samples = new Int16Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    samples[i] = Math.round(amplitude * Math.sin((2 * Math.PI * freqHz * i) / 16000));
  }
  return makePcmChunk(samples);
}

describe('FR-02-00: VAD Filter — Voice Activity Detection', () => {
  let vad: VadFilter;

  beforeEach(() => {
    vad = new VadFilter(2);
  });

  it('FR-02-01: zero-amplitude chunk returns SILENCE', () => {
    const chunk = silentChunk(160);
    const result = vad.classify(chunk);
    expect(result).toBe(VadResult.SILENCE);
  });

  it('FR-02-02: high-amplitude 440Hz tone returns SPEECH', () => {
    const chunk = toneChunk(440, 16000, 160);
    const result = vad.classify(chunk);
    expect(result).toBe(VadResult.SPEECH);
  });

  it('FR-02-03: invalid frame size (not 10/20/30ms) throws', () => {
    // 160 samples = 10ms at 16kHz — valid
    // 170 samples — invalid
    const badChunk = makePcmChunk(new Int16Array(170));
    expect(() => vad.classify(badChunk)).toThrow('IllegalArgumentException');
  });

  it('FR-02-04: near-silence (amplitude=100) returns SILENCE', () => {
    const chunk = toneChunk(1000, 100, 160); // very quiet
    const result = vad.classify(chunk);
    expect(result).toBe(VadResult.SILENCE);
  });

  it('FR-02-05: drone-frequency 200Hz at 8000 amplitude returns SPEECH', () => {
    const chunk = toneChunk(200, 8000, 320); // 20ms frame at 200Hz
    const result = vad.classify(chunk);
    expect(result).toBe(VadResult.SPEECH);
  });

  it('FR-02-06: aggressiveness 0 accepts quieter sounds than aggressiveness 3', () => {
    const quietChunk = toneChunk(500, 500, 160);
    const permissiveVad = new VadFilter(0);
    const strictVad = new VadFilter(3);
    const permissiveResult = permissiveVad.classify(quietChunk);
    const strictResult = strictVad.classify(quietChunk);
    // permissive should classify as SPEECH where strict classifies as SILENCE
    // OR both could be SPEECH — but strict should never be SPEECH when permissive is SILENCE
    expect(permissiveResult === VadResult.SPEECH || strictResult === VadResult.SILENCE).toBe(true);
  });

  it('FR-02-07: 30ms frame (480 samples) is valid', () => {
    const chunk = toneChunk(440, 16000, 480); // 30ms at 16kHz
    expect(() => vad.classify(chunk)).not.toThrow();
  });
});
