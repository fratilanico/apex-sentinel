// APEX-SENTINEL — W6 YAMNet Fine-tuner Tests
// FR-W6-02 | tests/ml/FR-W6-02-yamnnet-finetuner.test.ts
// TDD RED phase

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  YAMNetFineTuner,
  DEFAULT_TRAINING_CONFIG,
} from '../../src/ml/yamnnet-finetuner.js';
import type { TrainingConfig, TrainingMetrics } from '../../src/ml/yamnnet-finetuner.js';

// Minimal mock model backend for testability
function makeMockBackend(overrides: Partial<{
  trainEpoch: (config: TrainingConfig, epoch: number) => Promise<TrainingMetrics>;
  evaluate: () => Promise<{ accuracy: number; falsePositiveRate: number }>;
  exportONNX: (outputPath: string) => Promise<void>;
}> = {}) {
  return {
    trainEpoch: vi.fn().mockResolvedValue({
      epoch: 1, loss: 0.5, valAccuracy: 0.85, falsePositiveRate: 0.12, droneClassAccuracy: 0.82,
    }),
    evaluate: vi.fn().mockResolvedValue({ accuracy: 0.91, falsePositiveRate: 0.06 }),
    exportONNX: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('FR-W6-02: YAMNetFineTuner', () => {
  let tuner: YAMNetFineTuner;
  let mockBackend: ReturnType<typeof makeMockBackend>;

  beforeEach(() => {
    mockBackend = makeMockBackend();
    tuner = new YAMNetFineTuner({ modelBackend: mockBackend });
  });

  // --- DEFAULT_TRAINING_CONFIG ---

  it('FR-W6-02-01: DEFAULT_TRAINING_CONFIG should have correct YAMNet params', () => {
    expect(DEFAULT_TRAINING_CONFIG.sampleRate).toBe(22050);
    expect(DEFAULT_TRAINING_CONFIG.windowSizeSeconds).toBe(2.0);
    expect(DEFAULT_TRAINING_CONFIG.hopSizeSeconds).toBe(0.5);
    expect(DEFAULT_TRAINING_CONFIG.nMels).toBe(128);
    expect(DEFAULT_TRAINING_CONFIG.fMin).toBe(80);
    expect(DEFAULT_TRAINING_CONFIG.fMax).toBe(8000);
  });

  // --- trainEpoch ---

  it('FR-W6-02-02: GIVEN dataset loaded, WHEN trainEpoch(32) called, THEN returns metrics with loss', async () => {
    tuner.loadDataset('/fake/dataset');
    const metrics = await tuner.trainEpoch(32);
    expect(metrics.epoch).toBeGreaterThanOrEqual(1);
    expect(metrics.loss).toBeGreaterThan(0);
    expect(typeof metrics.valAccuracy).toBe('number');
  });

  it('FR-W6-02-03: GIVEN multiple epochs, WHEN trainEpoch called twice, THEN epoch counter increments', async () => {
    mockBackend.trainEpoch
      .mockResolvedValueOnce({ epoch: 1, loss: 0.6, valAccuracy: 0.80, falsePositiveRate: 0.15, droneClassAccuracy: 0.78 })
      .mockResolvedValueOnce({ epoch: 2, loss: 0.45, valAccuracy: 0.87, falsePositiveRate: 0.09, droneClassAccuracy: 0.85 });
    tuner.loadDataset('/fake/dataset');
    const m1 = await tuner.trainEpoch(32);
    const m2 = await tuner.trainEpoch(32);
    expect(m2.epoch).toBeGreaterThan(m1.epoch);
    expect(m2.loss).toBeLessThan(m1.loss);
  });

  it('FR-W6-02-04: GIVEN no dataset loaded, WHEN trainEpoch called, THEN throws DatasetNotLoadedError', async () => {
    await expect(tuner.trainEpoch(32)).rejects.toThrow('DatasetNotLoaded');
  });

  // --- loadDataset ---

  it('FR-W6-02-05: GIVEN valid path, WHEN loadDataset called, THEN tuner reports dataset loaded', () => {
    tuner.loadDataset('/fake/dataset');
    expect(tuner.isDatasetLoaded()).toBe(true);
  });

  // --- evaluate ---

  it('FR-W6-02-06: GIVEN trained model, WHEN evaluate called, THEN returns accuracy ≥0.90', async () => {
    tuner.loadDataset('/fake/dataset');
    await tuner.trainEpoch(32);
    const result = await tuner.evaluate();
    expect(result.accuracy).toBeGreaterThanOrEqual(0.90);
  });

  it('FR-W6-02-07: GIVEN trained model, WHEN evaluate called, THEN returns falsePositiveRate', async () => {
    tuner.loadDataset('/fake/dataset');
    await tuner.trainEpoch(32);
    const result = await tuner.evaluate();
    expect(typeof result.falsePositiveRate).toBe('number');
    expect(result.falsePositiveRate).toBeGreaterThanOrEqual(0);
    expect(result.falsePositiveRate).toBeLessThanOrEqual(1);
  });

  // --- exportONNX ---

  it('FR-W6-02-08: GIVEN trained model, WHEN exportONNX called, THEN delegates to backend', async () => {
    tuner.loadDataset('/fake/dataset');
    await tuner.trainEpoch(32);
    await tuner.exportONNX('/tmp/model.onnx');
    expect(mockBackend.exportONNX).toHaveBeenCalledWith('/tmp/model.onnx');
  });

  it('FR-W6-02-09: GIVEN no training done, WHEN exportONNX called, THEN throws ModelNotTrainedError', async () => {
    tuner.loadDataset('/fake/dataset');
    await expect(tuner.exportONNX('/tmp/model.onnx')).rejects.toThrow('ModelNotTrained');
  });

  // --- getMetrics ---

  it('FR-W6-02-10: GIVEN 2 epochs trained, WHEN getMetrics called, THEN returns history of 2 entries', async () => {
    tuner.loadDataset('/fake/dataset');
    await tuner.trainEpoch(32);
    await tuner.trainEpoch(32);
    const history = tuner.getMetrics();
    expect(history.length).toBe(2);
  });

  it('FR-W6-02-11: GIVEN no training, WHEN getMetrics called, THEN returns empty array', () => {
    const history = tuner.getMetrics();
    expect(history).toEqual([]);
  });

  // --- mel spectrogram shape ---

  it('FR-W6-02-12: GIVEN 2s window at 22050Hz, WHEN mel frame count computed, THEN time_frames = ceil(2.0 / 0.5) = 4 hops minimum', () => {
    const { windowSizeSeconds, hopSizeSeconds } = DEFAULT_TRAINING_CONFIG;
    const timeFrames = Math.ceil(windowSizeSeconds / hopSizeSeconds);
    expect(timeFrames).toBe(4); // 2.0 / 0.5 = 4
  });

  it('FR-W6-02-13: GIVEN default config, WHEN nMels checked, THEN is 128', () => {
    expect(DEFAULT_TRAINING_CONFIG.nMels).toBe(128);
  });

  // --- config override ---

  it('FR-W6-02-14: GIVEN custom config, WHEN tuner created, THEN overrides default params', () => {
    const customTuner = new YAMNetFineTuner({
      modelBackend: mockBackend,
      config: { nMels: 64, batchSize: 16, epochs: 3, learningRate: 5e-5 },
    });
    const config = customTuner.getConfig();
    expect(config.nMels).toBe(64);
    expect(config.learningRate).toBe(5e-5);
    // Unoverridden defaults preserved
    expect(config.sampleRate).toBe(22050);
  });

  it('FR-W6-02-15: GIVEN backend throws, WHEN trainEpoch called, THEN propagates error', async () => {
    mockBackend.trainEpoch.mockRejectedValueOnce(new Error('CUDA out of memory'));
    tuner.loadDataset('/fake/dataset');
    await expect(tuner.trainEpoch(32)).rejects.toThrow('CUDA out of memory');
  });
});
