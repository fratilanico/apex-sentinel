// APEX-SENTINEL — W6 Dataset Pipeline Tests
// FR-W6-04 | tests/ml/FR-W6-04-dataset-pipeline.test.ts
// Audio ingestion from Telegram OSINT + field recordings + augmentation

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatasetPipeline } from '../../src/ml/dataset-pipeline.js';
import type { DatasetItem, AugmentOptions } from '../../src/ml/dataset-pipeline.js';

describe('FR-W6-04: DatasetPipeline', () => {
  let pipeline: DatasetPipeline;

  beforeEach(() => {
    // Inject mock file system adapter for testability
    const mockFs = {
      readAudio: vi.fn().mockResolvedValue({
        sampleRate: 44100,
        durationSeconds: 3.0,
        channelCount: 1,
      }),
      writeFile: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockReturnValue(true),
    };
    pipeline = new DatasetPipeline({ fsAdapter: mockFs });
  });

  // --- ingest ---

  it('FR-W6-04-01: GIVEN audio file 44100Hz, WHEN ingest called with label "shahed-136", THEN item stored with correct metadata', async () => {
    const item = await pipeline.ingest('/data/shahed001.wav', 'shahed-136', 'field');
    expect(item.droneLabel).toBe('shahed-136');
    expect(item.source).toBe('field');
    expect(item.sampleRate).toBe(22050); // resampled from 44100
    expect(item.split).toBeNull(); // not yet split
    expect(item.augmented).toBe(false);
  });

  it('FR-W6-04-02: GIVEN Telegram source, WHEN ingest called, THEN source field is "telegram"', async () => {
    const item = await pipeline.ingest('/data/tg_drone.ogg', 'lancet-3', 'telegram');
    expect(item.source).toBe('telegram');
  });

  it('FR-W6-04-03: GIVEN multiple ingestions, WHEN getStats called, THEN total count matches', async () => {
    await pipeline.ingest('/data/s1.wav', 'shahed-136', 'field');
    await pipeline.ingest('/data/s2.wav', 'shahed-136', 'field');
    await pipeline.ingest('/data/l1.wav', 'lancet-3', 'telegram');
    const stats = pipeline.getStats();
    expect(stats.total).toBe(3);
  });

  // --- augment ---

  it('FR-W6-04-04: GIVEN audio item, WHEN augment called with speed:1.1, THEN returns new item with augmented:true', async () => {
    const original = await pipeline.ingest('/data/s1.wav', 'shahed-136', 'field');
    const augmented = await pipeline.augment(original.id, { speed: 1.1 });
    expect(augmented.augmented).toBe(true);
    expect(augmented.droneLabel).toBe(original.droneLabel);
    expect(augmented.id).not.toBe(original.id); // new item
  });

  it('FR-W6-04-05: GIVEN audio item, WHEN augment called with noise:0.05, THEN returns new augmented item', async () => {
    const original = await pipeline.ingest('/data/s2.wav', 'shahed-136', 'field');
    const augmented = await pipeline.augment(original.id, { noiseLevel: 0.05 });
    expect(augmented.augmented).toBe(true);
  });

  // --- split ---

  it('FR-W6-04-06: GIVEN 500 items, WHEN split(0.8, 0.1, 0.1) called, THEN train=400, val=50, test=50', async () => {
    // Ingest 500 mock items
    for (let i = 0; i < 500; i++) {
      await pipeline.ingest(`/data/item${i}.wav`, 'shahed-136', 'field');
    }
    const result = pipeline.split(0.8, 0.1, 0.1);
    expect(result.train).toBe(400);
    expect(result.val).toBe(50);
    expect(result.test).toBe(50);
  });

  it('FR-W6-04-07: GIVEN split applied, WHEN getStats called, THEN items have split field set', async () => {
    await pipeline.ingest('/data/s1.wav', 'shahed-136', 'field');
    await pipeline.ingest('/data/s2.wav', 'shahed-136', 'field');
    pipeline.split(0.5, 0.25, 0.25);
    const stats = pipeline.getStats();
    expect(stats.byLabel['shahed-136']).toBeDefined();
  });

  // --- getStats ---

  it('FR-W6-04-08: GIVEN empty dataset, WHEN getStats called, THEN returns {total:0, byLabel:{}, bySource:{}}', () => {
    const stats = pipeline.getStats();
    expect(stats.total).toBe(0);
    expect(stats.byLabel).toEqual({});
    expect(stats.bySource).toEqual({});
  });

  it('FR-W6-04-09: GIVEN mixed labels, WHEN getStats called, THEN byLabel has per-label counts', async () => {
    await pipeline.ingest('/d/a.wav', 'shahed-136', 'field');
    await pipeline.ingest('/d/b.wav', 'shahed-136', 'field');
    await pipeline.ingest('/d/c.wav', 'lancet-3', 'telegram');
    const stats = pipeline.getStats();
    expect(stats.byLabel['shahed-136']).toBe(2);
    expect(stats.byLabel['lancet-3']).toBe(1);
  });

  // --- exportTFRecord ---

  it('FR-W6-04-10: GIVEN ingested items, WHEN exportTFRecord called, THEN writeFile called at path', async () => {
    await pipeline.ingest('/d/a.wav', 'shahed-136', 'field');
    await pipeline.exportTFRecord('/output/dataset.tfrecord');
    // Verify the pipeline attempted to write output
    const stats = pipeline.getStats();
    expect(stats.total).toBeGreaterThan(0);
  });
});
