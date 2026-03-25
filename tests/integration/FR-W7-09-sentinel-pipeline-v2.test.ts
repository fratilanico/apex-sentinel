// APEX-SENTINEL — W7 SentinelPipelineV2 Tests
// FR-W7-09 | tests/integration/FR-W7-09-sentinel-pipeline-v2.test.ts
// Dynamic coordinate injection via TdoaSolverAdapter — NO hardcoded 51.5/4.9

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SentinelPipelineV2, PipelineNotRunningError } from '../../src/integration/sentinel-pipeline-v2.js';
import type { TdoaSolverAdapter, TdoaSolution } from '../../src/integration/sentinel-pipeline-v2.js';
import * as fs from 'fs';
import * as path from 'path';

function makeMockTdoaSolver(solution: TdoaSolution | null = null): TdoaSolverAdapter {
  return {
    solve: vi.fn().mockResolvedValue(solution),
  };
}

function makeTdoaSolution(lat: number, lon: number): TdoaSolution {
  return { lat, lon, confidenceM: 80 };
}

describe('FR-W7-09: SentinelPipelineV2', () => {
  let solver: TdoaSolverAdapter;
  let pipeline: SentinelPipelineV2;

  beforeEach(() => {
    solver = makeMockTdoaSolver(makeTdoaSolution(50.0, 3.0));
    pipeline = new SentinelPipelineV2({ tdoaSolver: solver });
  });

  // AC-01: constructor accepts TdoaSolverAdapter
  it('AC-01: Constructor accepts TdoaSolverAdapter (dependency injection)', () => {
    const instance = new SentinelPipelineV2({ tdoaSolver: solver });
    expect(instance).toBeTruthy();
  });

  // AC-02: No hardcoded 51.5 or 4.9 in source file
  it('AC-02: Source file contains no hardcoded 51.5 or 4.9 coordinates', () => {
    const srcPath = path.resolve(
      __dirname,
      '../../src/integration/sentinel-pipeline-v2.ts',
    );
    // If the source file doesn't exist yet, this test auto-fails (RED) as intended
    expect(fs.existsSync(srcPath)).toBe(true);
    const source = fs.readFileSync(srcPath, 'utf-8');
    // Must not contain hardcoded 51.5 as a lat value (with optional decimal places)
    expect(source).not.toMatch(/\b51\.5\b/);
    // Must not contain hardcoded 4.9 as a lon value
    expect(source).not.toMatch(/\b4\.9\b/);
  });

  // AC-03: TdoaSolver returns {lat: 50.0, lon: 3.0} → pipeline uses those coordinates
  it('AC-03: When TdoaSolver returns {lat: 50.0, lon: 3.0}, pipeline uses those coordinates', async () => {
    solver = makeMockTdoaSolver({ lat: 50.0, lon: 3.0, confidenceM: 80 });
    pipeline = new SentinelPipelineV2({ tdoaSolver: solver });
    await pipeline.start();

    const frame = { audioSamples: new Float32Array(16000), timestampMs: Date.now() };
    const result = await pipeline.processFrame(frame);

    expect(result.position.lat).toBe(50.0);
    expect(result.position.lon).toBe(3.0);
    await pipeline.stop();
  });

  // AC-04: TdoaSolver returns null → use last known position
  it('AC-04: When TdoaSolver returns null, pipeline uses last known position (fallback)', async () => {
    let callCount = 0;
    solver = {
      solve: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ lat: 50.1, lon: 3.1, confidenceM: 80 });
        return Promise.resolve(null); // null on second call
      }),
    };
    pipeline = new SentinelPipelineV2({ tdoaSolver: solver });
    await pipeline.start();

    const frame = { audioSamples: new Float32Array(16000), timestampMs: Date.now() };
    const firstResult = await pipeline.processFrame(frame);
    const secondResult = await pipeline.processFrame({ ...frame, timestampMs: Date.now() + 100 });

    // Second frame should use last known (50.1, 3.1) as fallback
    expect(secondResult.position.lat).toBe(firstResult.position.lat);
    expect(secondResult.position.lon).toBe(firstResult.position.lon);
    await pipeline.stop();
  });

  // AC-05: TdoaSolver null and no prior position → configurable default
  it('AC-05: When TdoaSolver returns null and no prior position, pipeline uses configurable default', async () => {
    solver = makeMockTdoaSolver(null);
    pipeline = new SentinelPipelineV2({
      tdoaSolver: solver,
      defaultPosition: { lat: 48.8, lon: 2.3 },
    });
    await pipeline.start();

    const frame = { audioSamples: new Float32Array(16000), timestampMs: Date.now() };
    const result = await pipeline.processFrame(frame);

    expect(result.position.lat).toBe(48.8);
    expect(result.position.lon).toBe(2.3);
    await pipeline.stop();
  });

  // AC-06: start/stop lifecycle
  it('AC-06: start() begins processing, stop() halts cleanly', async () => {
    await pipeline.start();
    expect(pipeline.isRunning()).toBe(true);
    await pipeline.stop();
    expect(pipeline.isRunning()).toBe(false);
  });

  // AC-07: processFrame calls TdoaSolverAdapter.solve()
  it('AC-07: processFrame() calls TdoaSolverAdapter.solve()', async () => {
    await pipeline.start();
    const frame = { audioSamples: new Float32Array(16000), timestampMs: Date.now() };
    await pipeline.processFrame(frame);
    expect(solver.solve).toHaveBeenCalledTimes(1);
    await pipeline.stop();
  });

  // AC-08: processFrame before start throws PipelineNotRunningError
  it('AC-08: PipelineNotRunningError thrown when processFrame called before start()', async () => {
    const frame = { audioSamples: new Float32Array(16000), timestampMs: Date.now() };
    await expect(pipeline.processFrame(frame)).rejects.toThrow(PipelineNotRunningError);
  });

  // AC-09: onTerminalPhase callback invoked when TerminalPhaseDetector enters TERMINAL
  it('AC-09: onTerminalPhase callback invoked when TerminalPhaseDetector enters TERMINAL', async () => {
    const onTerminalPhase = vi.fn();
    pipeline = new SentinelPipelineV2({
      tdoaSolver: solver,
      onTerminalPhase,
    });
    await pipeline.start();
    // Inject a frame with altitude dropping rapidly → triggers TERMINAL
    const frame = {
      audioSamples: new Float32Array(16000),
      timestampMs: Date.now(),
      overrideTerminalPhase: true, // test hook to force TERMINAL state
    };
    await pipeline.processFrame(frame);
    expect(onTerminalPhase).toHaveBeenCalledTimes(1);
    await pipeline.stop();
  });

  // AC-10: onImpact callback invoked when alt <= 0
  it('AC-10: onImpact callback invoked when alt <= 0', async () => {
    const onImpact = vi.fn();
    pipeline = new SentinelPipelineV2({
      tdoaSolver: solver,
      onImpact,
    });
    await pipeline.start();
    const frame = {
      audioSamples: new Float32Array(16000),
      timestampMs: Date.now(),
      overrideAlt: 0, // test hook to force alt = 0
    };
    await pipeline.processFrame(frame);
    expect(onImpact).toHaveBeenCalledTimes(1);
    await pipeline.stop();
  });

  // AC-11: offline buffer max 1000 frames
  it('AC-11: offline buffer max 1000 frames (same as V1)', () => {
    expect(pipeline.offlineBufferMaxFrames).toBe(1000);
  });

  // AC-12: processedFrames counter increments
  it('AC-12: processedFrames counter increments on each frame', async () => {
    await pipeline.start();
    expect(pipeline.processedFrames).toBe(0);
    const frame = { audioSamples: new Float32Array(16000), timestampMs: Date.now() };
    await pipeline.processFrame(frame);
    expect(pipeline.processedFrames).toBe(1);
    await pipeline.processFrame({ ...frame, timestampMs: Date.now() + 100 });
    expect(pipeline.processedFrames).toBe(2);
    await pipeline.stop();
  });
});
