// APEX-SENTINEL — TDD RED Tests
// FR-03: FFT Spectral Analysis
// Status: RED — implementation in src/acoustic/fft.ts NOT_IMPLEMENTED

import { describe, it, expect, beforeEach } from 'vitest';
import { FftAnalyser } from '../../src/acoustic/fft.js';
import { PcmChunk } from '../../src/acoustic/types.js';

function makeChunkWithTone(freqHz: number, sampleRate = 16000, duration = 0.1): PcmChunk {
  const frameSize = Math.round(sampleRate * duration);
  const samples = new Int16Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    samples[i] = Math.round(16000 * Math.sin((2 * Math.PI * freqHz * i) / sampleRate));
  }
  return {
    samples,
    sampleRate,
    channelCount: 1,
    timestampUs: BigInt(Date.now()) * 1000n,
    durationMs: duration * 1000,
  };
}

describe('FR-03-00: FFT Spectral Analysis', () => {
  let fft: FftAnalyser;

  beforeEach(() => {
    fft = new FftAnalyser(2048, 0.5);
  });

  it('FR-03-01: returns SpectralAnalysis with correct field structure', () => {
    const chunk = makeChunkWithTone(1000);
    const result = fft.analyse(chunk);
    expect(result).toHaveProperty('fftMagnitudes');
    expect(result).toHaveProperty('peakFrequencyHz');
    expect(result).toHaveProperty('energyBands');
    expect(result).toHaveProperty('rmsLevel');
    expect(result).toHaveProperty('timestampUs');
  });

  it('FR-03-02: 1000Hz tone → peakFrequencyHz near 1000 (±20Hz)', () => {
    const chunk = makeChunkWithTone(1000);
    const result = fft.analyse(chunk);
    expect(result.peakFrequencyHz).toBeGreaterThan(980);
    expect(result.peakFrequencyHz).toBeLessThan(1020);
  });

  it('FR-03-03: 200Hz tone → peak in low energy band', () => {
    const chunk = makeChunkWithTone(200);
    const result = fft.analyse(chunk);
    // 200Hz is below our 500-800Hz low band — check for separate drone range or check peak
    expect(result.peakFrequencyHz).toBeGreaterThan(150);
    expect(result.peakFrequencyHz).toBeLessThan(250);
  });

  it('FR-03-04: fftMagnitudes length > 0', () => {
    const chunk = makeChunkWithTone(500);
    const result = fft.analyse(chunk);
    expect(result.fftMagnitudes.length).toBeGreaterThan(0);
  });

  it('FR-03-05: rmsLevel > 0 for non-silent input', () => {
    const chunk = makeChunkWithTone(1000);
    const result = fft.analyse(chunk);
    expect(result.rmsLevel).toBeGreaterThan(0);
  });

  it('FR-03-06: rmsLevel = 0 for silent chunk', () => {
    const silentChunk: PcmChunk = {
      samples: new Int16Array(1600),
      sampleRate: 16000,
      channelCount: 1,
      timestampUs: BigInt(Date.now()) * 1000n,
      durationMs: 100,
    };
    const result = fft.analyse(silentChunk);
    expect(result.rmsLevel).toBe(0);
  });

  it('FR-03-07: FPV drone harmonics detected at 200Hz+400Hz+600Hz', () => {
    // Simulate multi-harmonic FPV signature
    const frameSize = 1600;
    const samples = new Int16Array(frameSize);
    for (let i = 0; i < frameSize; i++) {
      samples[i] = Math.round(
        4000 * Math.sin((2 * Math.PI * 200 * i) / 16000) +
        2000 * Math.sin((2 * Math.PI * 400 * i) / 16000) +
        1000 * Math.sin((2 * Math.PI * 600 * i) / 16000),
      );
    }
    const chunk: PcmChunk = {
      samples,
      sampleRate: 16000,
      channelCount: 1,
      timestampUs: BigInt(Date.now()) * 1000n,
      durationMs: 100,
    };
    const spectral = fft.analyse(chunk);
    const isDrone = fft.detectDroneHarmonics(spectral);
    expect(isDrone).toBe(true);
  });

  it('FR-03-08: 3000Hz tone (non-drone) → detectDroneHarmonics returns false', () => {
    const chunk = makeChunkWithTone(3000);
    const spectral = fft.analyse(chunk);
    const isDrone = fft.detectDroneHarmonics(spectral);
    expect(isDrone).toBe(false);
  });
});
