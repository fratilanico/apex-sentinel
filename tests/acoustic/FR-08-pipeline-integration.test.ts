// APEX-SENTINEL — TDD RED Tests
// FR-08: Acoustic Detection Pipeline Integration
// Status: RED — implementation in src/acoustic/pipeline.ts NOT_IMPLEMENTED

import { describe, it, expect, beforeEach } from 'vitest';
import { AcousticPipeline } from '../../src/acoustic/pipeline.js';
import { PcmChunk } from '../../src/acoustic/types.js';

function makeDroneChunk(durationMs = 100): PcmChunk {
  const sampleRate = 16000;
  const frameSize = Math.round(sampleRate * (durationMs / 1000));
  const samples = new Int16Array(frameSize);
  // Multi-harmonic FPV drone signature
  for (let i = 0; i < frameSize; i++) {
    samples[i] = Math.round(
      8000 * Math.sin((2 * Math.PI * 220 * i) / sampleRate) +
      4000 * Math.sin((2 * Math.PI * 440 * i) / sampleRate) +
      2000 * Math.sin((2 * Math.PI * 880 * i) / sampleRate),
    );
  }
  return {
    samples,
    sampleRate,
    channelCount: 1,
    timestampUs: BigInt(Date.now()) * 1000n,
    durationMs,
  };
}

function makeSilentChunk(): PcmChunk {
  return {
    samples: new Int16Array(1600),
    sampleRate: 16000,
    channelCount: 1,
    timestampUs: BigInt(Date.now()) * 1000n,
    durationMs: 100,
  };
}

describe('FR-08-00: Acoustic Detection Pipeline Integration', () => {
  let pipeline: AcousticPipeline;

  beforeEach(() => {
    pipeline = new AcousticPipeline({
      confidenceThreshold: 0.5,
      maxLatencyMs: 1000,
      nodeId: 'test-node-01',
    });
  });

  it('FR-08-01: silent chunk → null (VAD drop, no detection)', async () => {
    const result = await pipeline.processChunk(makeSilentChunk());
    expect(result).toBeNull();
  });

  it('FR-08-02: drone chunk → AcousticDetectionEvent with confidence > 0.5', async () => {
    const result = await pipeline.processChunk(makeDroneChunk());
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThan(0.5);
  });

  it('FR-08-03: detection event has required fields', async () => {
    const result = await pipeline.processChunk(makeDroneChunk());
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('eventId');
    expect(result).toHaveProperty('nodeId');
    expect(result).toHaveProperty('timestampUs');
    expect(result).toHaveProperty('peakFrequencyHz');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('spectral');
    expect(result).toHaveProperty('yamnet');
  });

  it('FR-08-04: detection nodeId matches pipeline config', async () => {
    const result = await pipeline.processChunk(makeDroneChunk());
    expect(result!.nodeId).toBe('test-node-01');
  });

  it('FR-08-05: end-to-end latency < 1000ms', async () => {
    const start = Date.now();
    await pipeline.processChunk(makeDroneChunk());
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  it('FR-08-06: pipeline stats track processed and dropped chunks', async () => {
    await pipeline.processChunk(makeSilentChunk());
    await pipeline.processChunk(makeSilentChunk());
    await pipeline.processChunk(makeDroneChunk());
    const stats = pipeline.getStats();
    expect(stats.chunksProcessed).toBe(3);
    expect(stats.chunksDropped).toBe(2); // 2 silent = VAD dropped
    expect(stats.detectionsEmitted).toBe(1);
  });

  it('FR-08-07: VAD drop rate ~66% when 2/3 chunks are silent', async () => {
    await pipeline.processChunk(makeSilentChunk());
    await pipeline.processChunk(makeSilentChunk());
    await pipeline.processChunk(makeDroneChunk());
    expect(pipeline.vadDropRate).toBeCloseTo(0.667, 1);
  });

  it('FR-08-08: confidenceThreshold=0.9 filters borderline detections', async () => {
    const strictPipeline = new AcousticPipeline({
      confidenceThreshold: 0.9,
      maxLatencyMs: 1000,
      nodeId: 'strict-node',
    });
    // A borderline drone signal might be filtered
    // This test asserts the threshold is respected
    const result = await strictPipeline.processChunk(makeDroneChunk());
    if (result !== null) {
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });
});
