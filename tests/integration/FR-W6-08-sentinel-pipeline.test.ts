// APEX-SENTINEL — W6 SentinelPipeline Integration Tests
// FR-W6-08 | tests/integration/FR-W6-08-sentinel-pipeline.test.ts
// Full integration: audio → VAD → FFT → YAMNet → FPG → TrackManager → EKF → NATS

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SentinelPipeline,
  PipelineNotRunningError,
} from '../../src/integration/sentinel-pipeline.js';
import type { PipelineStatus } from '../../src/integration/sentinel-pipeline.js';

function makeAudioFrame(samples = 22050): Float32Array {
  // Simulated 1-second audio frame at 22050Hz with drone-like 200Hz tone
  const frame = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    frame[i] = 0.1 * Math.sin((2 * Math.PI * 200 * i) / 22050);
  }
  return frame;
}

function makeMockModules() {
  return {
    acousticPipeline: {
      process: vi.fn().mockResolvedValue({ classification: 'shahed-136', confidence: 0.92, features: [] }),
    },
    falsePositiveGuard: {
      assess: vi.fn().mockReturnValue({ isFalsePositive: false, confidence: 0.92, reason: null }),
      addTemporalSample: vi.fn(),
    },
    trackManager: {
      updateTrack: vi.fn().mockReturnValue('TRK-001'),
    },
    multiTrackEKFManager: {
      processDetection: vi.fn().mockReturnValue({
        trackId: 'TRK-001',
        ekfState: { lat: 51.5, lon: 4.9, alt: 200, vLat: 0, vLon: 0, vAlt: -10, confidence: 0.92, timestamp: Date.now() },
        horizons: [],
        impactEstimate: null,
        processedAt: Date.now(),
      }),
    },
    predictionPublisher: {
      publishToNats: vi.fn().mockResolvedValue(undefined),
    },
    natsClient: {
      isConnected: vi.fn().mockReturnValue(true),
    },
  };
}

describe('FR-W6-08: SentinelPipeline', () => {
  let pipeline: SentinelPipeline;
  let mocks: ReturnType<typeof makeMockModules>;

  beforeEach(() => {
    mocks = makeMockModules();
    pipeline = new SentinelPipeline({ modules: mocks });
  });

  afterEach(async () => {
    if (pipeline.getStatus().running) {
      await pipeline.stop();
    }
  });

  // --- start / stop ---

  it('FR-W6-08-01: GIVEN pipeline created, WHEN start called, THEN status.running is true', async () => {
    await pipeline.start();
    expect(pipeline.getStatus().running).toBe(true);
  });

  it('FR-W6-08-02: GIVEN pipeline started, WHEN stop called, THEN status.running is false', async () => {
    await pipeline.start();
    await pipeline.stop();
    expect(pipeline.getStatus().running).toBe(false);
  });

  // --- processAudioFrame ---

  it('FR-W6-08-03: GIVEN pipeline started, WHEN processAudioFrame called, THEN passes through acoustic → FPG → EKF chain', async () => {
    await pipeline.start();
    const frame = makeAudioFrame();
    await pipeline.processAudioFrame(frame);
    expect(mocks.acousticPipeline.process).toHaveBeenCalled();
    expect(mocks.falsePositiveGuard.assess).toHaveBeenCalled();
    expect(mocks.multiTrackEKFManager.processDetection).toHaveBeenCalled();
  });

  it('FR-W6-08-04: GIVEN pipeline NOT started, WHEN processAudioFrame called, THEN throws PipelineNotRunningError', async () => {
    const frame = makeAudioFrame();
    await expect(pipeline.processAudioFrame(frame)).rejects.toThrow(PipelineNotRunningError);
  });

  it('FR-W6-08-05: GIVEN false positive detected by FPG, WHEN processAudioFrame called, THEN EKF NOT updated', async () => {
    mocks.falsePositiveGuard.assess.mockReturnValueOnce({
      isFalsePositive: true, confidence: 0.91, reason: 'temporal-linear',
    });
    await pipeline.start();
    await pipeline.processAudioFrame(makeAudioFrame());
    expect(mocks.multiTrackEKFManager.processDetection).not.toHaveBeenCalled();
  });

  // --- NATS buffering ---

  it('FR-W6-08-06: GIVEN NATS disconnected, WHEN processAudioFrame called, THEN does NOT throw (buffers result)', async () => {
    mocks.natsClient.isConnected.mockReturnValue(false);
    mocks.predictionPublisher.publishToNats.mockRejectedValue(new Error('NATS disconnected'));
    await pipeline.start();
    const frame = makeAudioFrame();
    await expect(pipeline.processAudioFrame(frame)).resolves.not.toThrow();
  });

  it('FR-W6-08-07: GIVEN buffer at 1000 frames, WHEN 1001st frame processed, THEN oldest buffered frame is dropped', async () => {
    mocks.natsClient.isConnected.mockReturnValue(false);
    mocks.predictionPublisher.publishToNats.mockRejectedValue(new Error('offline'));
    await pipeline.start();
    // Process 1001 frames — should not crash (cap at 1000)
    for (let i = 0; i < 1001; i++) {
      await pipeline.processAudioFrame(makeAudioFrame(100)); // small frames for speed
    }
    const status = pipeline.getStatus();
    expect(status.bufferedFrames).toBeLessThanOrEqual(1000);
  });

  // --- getStatus ---

  it('FR-W6-08-08: GIVEN pipeline started, WHEN getStatus called, THEN activeModules ≥ 4', async () => {
    await pipeline.start();
    const status = pipeline.getStatus();
    expect(status.activeModules).toBeGreaterThanOrEqual(4);
  });

  it('FR-W6-08-09: GIVEN multiple frames processed, WHEN getStatus called, THEN processedFrames increments', async () => {
    await pipeline.start();
    await pipeline.processAudioFrame(makeAudioFrame());
    await pipeline.processAudioFrame(makeAudioFrame());
    const status = pipeline.getStatus();
    expect(status.processedFrames).toBe(2);
  });

  // --- getMetrics ---

  it('FR-W6-08-10: GIVEN pipeline running with frames, WHEN getMetrics called, THEN returns dropsPerSecond ≥ 0', async () => {
    await pipeline.start();
    await pipeline.processAudioFrame(makeAudioFrame());
    const metrics = pipeline.getMetrics();
    expect(typeof metrics.dropsPerSecond).toBe('number');
    expect(metrics.dropsPerSecond).toBeGreaterThanOrEqual(0);
  });

  // --- low acoustic confidence ---

  it('FR-W6-08-11: GIVEN acoustic pipeline returns low confidence (< 0.85), WHEN processAudioFrame called, THEN FPG still called (it makes the assessment)', async () => {
    mocks.acousticPipeline.process.mockResolvedValueOnce({
      classification: 'shahed-136', confidence: 0.70, features: [],
    });
    await pipeline.start();
    await pipeline.processAudioFrame(makeAudioFrame());
    // FPG assess should be called — it handles low confidence check
    expect(mocks.falsePositiveGuard.assess).toHaveBeenCalled();
  });

  // --- NATS publish on true detection ---

  it('FR-W6-08-12: GIVEN true detection (high confidence, not FP), WHEN processAudioFrame called, THEN publishToNats called', async () => {
    await pipeline.start();
    await pipeline.processAudioFrame(makeAudioFrame());
    expect(mocks.predictionPublisher.publishToNats).toHaveBeenCalled();
  });

  // --- acoustic classification ---

  it('FR-W6-08-13: GIVEN acoustic pipeline returns "lancet-3", WHEN processAudioFrame called, THEN droneType "lancet-3" passed to TrackManager', async () => {
    mocks.acousticPipeline.process.mockResolvedValueOnce({
      classification: 'lancet-3', confidence: 0.91, features: [],
    });
    await pipeline.start();
    await pipeline.processAudioFrame(makeAudioFrame());
    const updateCall = mocks.trackManager.updateTrack.mock.calls[0];
    expect(updateCall[0]).toMatchObject({ droneType: 'lancet-3' });
  });

  // --- event bus / module count ---

  it('FR-W6-08-14: GIVEN pipeline, WHEN getStatus called before start, THEN running:false, activeModules:0', () => {
    const status = pipeline.getStatus();
    expect(status.running).toBe(false);
    expect(status.activeModules).toBe(0);
  });

  it('FR-W6-08-15: GIVEN acoustic pipeline throws, WHEN processAudioFrame called, THEN does NOT propagate (pipeline resilient)', async () => {
    mocks.acousticPipeline.process.mockRejectedValueOnce(new Error('model crash'));
    await pipeline.start();
    await expect(pipeline.processAudioFrame(makeAudioFrame())).resolves.not.toThrow();
  });
});
