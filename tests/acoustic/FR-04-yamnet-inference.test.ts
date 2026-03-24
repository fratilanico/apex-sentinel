// APEX-SENTINEL — TDD RED Tests
// FR-04: YAMNet TFLite Inference
// Status: RED — implementation in src/acoustic/yamnet.ts NOT_IMPLEMENTED

import { describe, it, expect, beforeEach } from 'vitest';
import { YamNetInferenceEngine } from '../../src/acoustic/yamnet.js';
import { SpectralAnalysis } from '../../src/acoustic/types.js';

function mockDroneSpectral(): SpectralAnalysis {
  const mags = new Float32Array(1024);
  // Simulate energy at drone frequencies
  mags[25] = 0.8;  // ~200Hz bin
  mags[50] = 0.5;  // ~400Hz bin
  mags[75] = 0.3;  // ~600Hz bin
  return {
    fftMagnitudes: mags,
    peakFrequencyHz: 234,
    energyBands: { low: 0.75, mid: 0.45, high: 0.12 },
    rmsLevel: 0.62,
    timestampUs: BigInt(Date.now()) * 1000n,
  };
}

function mockAmbientSpectral(): SpectralAnalysis {
  const mags = new Float32Array(1024).fill(0.01);
  return {
    fftMagnitudes: mags,
    peakFrequencyHz: 3200,
    energyBands: { low: 0.01, mid: 0.02, high: 0.01 },
    rmsLevel: 0.05,
    timestampUs: BigInt(Date.now()) * 1000n,
  };
}

describe('FR-04-00: YAMNet TFLite Inference Engine', () => {
  let engine: YamNetInferenceEngine;

  beforeEach(() => {
    engine = new YamNetInferenceEngine();
  });

  it('FR-04-01: engine starts with model not loaded', () => {
    expect(engine.isModelLoaded()).toBe(false);
  });

  it('FR-04-02: model size is 480KB', () => {
    expect(engine.modelSizeKb).toBe(480);
  });

  it('FR-04-03: loadModel resolves and marks model as loaded', async () => {
    await engine.loadModel('models/yamnet.tflite');
    expect(engine.isModelLoaded()).toBe(true);
  });

  it('FR-04-04: infer throws if model not loaded', async () => {
    const spectral = mockDroneSpectral();
    await expect(engine.infer(spectral)).rejects.toThrow('MODEL_NOT_LOADED');
  });

  it('FR-04-05: infer on drone spectral returns droneConfidence > 0.5', async () => {
    await engine.loadModel('models/yamnet.tflite');
    const spectral = mockDroneSpectral();
    const result = await engine.infer(spectral);
    expect(result.droneConfidence).toBeGreaterThan(0.5);
  });

  it('FR-04-06: infer result has all required fields', async () => {
    await engine.loadModel('models/yamnet.tflite');
    const spectral = mockDroneSpectral();
    const result = await engine.infer(spectral);
    expect(result).toHaveProperty('droneConfidence');
    expect(result).toHaveProperty('helicopterConfidence');
    expect(result).toHaveProperty('mechanicalNoiseConfidence');
    expect(result).toHaveProperty('topClass');
    expect(result).toHaveProperty('latencyMs');
    expect(result).toHaveProperty('timestampUs');
  });

  it('FR-04-07: inference latency < 200ms (INDIGO benchmark: 156ms)', async () => {
    await engine.loadModel('models/yamnet.tflite');
    const spectral = mockDroneSpectral();
    const start = Date.now();
    const result = await engine.infer(spectral);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(200);
    expect(result.latencyMs).toBeLessThan(200);
  });

  it('FR-04-08: ambient noise → droneConfidence < 0.3', async () => {
    await engine.loadModel('models/yamnet.tflite');
    const spectral = mockAmbientSpectral();
    const result = await engine.infer(spectral);
    expect(result.droneConfidence).toBeLessThan(0.3);
  });

  it('FR-04-09: all confidence scores sum ≤ 1.0', async () => {
    await engine.loadModel('models/yamnet.tflite');
    const spectral = mockDroneSpectral();
    const result = await engine.infer(spectral);
    const total = result.droneConfidence + result.helicopterConfidence + result.mechanicalNoiseConfidence;
    expect(total).toBeLessThanOrEqual(1.0 + 0.001); // floating point tolerance
  });
});
