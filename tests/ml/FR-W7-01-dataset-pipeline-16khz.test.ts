// APEX-SENTINEL — W7 DatasetPipeline 16kHz Migration Tests
// FR-W7-01 | tests/ml/FR-W7-01-dataset-pipeline-16khz.test.ts
// TDD RED phase — migrates pipeline from 22050Hz to 16000Hz target sample rate

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatasetPipeline, TARGET_SAMPLE_RATE } from '../../src/ml/dataset-pipeline.js';
import type { DatasetItem } from '../../src/ml/dataset-pipeline.js';

describe('FR-W7-01: DatasetPipeline 16kHz Migration', () => {
  let pipeline: DatasetPipeline;

  const makeMockFs = (inputSampleRate: number) => ({
    readAudio: vi.fn().mockResolvedValue({
      sampleRate: inputSampleRate,
      durationSeconds: 1.0,
      channelCount: 1,
    }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockReturnValue(true),
  });

  beforeEach(() => {
    pipeline = new DatasetPipeline({ fsAdapter: makeMockFs(16000) });
  });

  // --- TARGET_SAMPLE_RATE constant ---

  it('FR-W7-01-01: GIVEN exported constant TARGET_SAMPLE_RATE, THEN it equals 16000 (not 22050)', () => {
    expect(TARGET_SAMPLE_RATE).toBe(16000);
    expect(TARGET_SAMPLE_RATE).not.toBe(22050);
  });

  // --- ingest() sample rate normalization ---

  it('FR-W7-01-02: GIVEN audio at 16000Hz, WHEN ingest called, THEN item.sampleRate is 16000', async () => {
    const fs = makeMockFs(16000);
    const p = new DatasetPipeline({ fsAdapter: fs });
    const item = await p.ingest('/data/audio_16k.wav', 'shahed-136', 'field');
    expect(item.sampleRate).toBe(16000);
  });

  it('FR-W7-01-03: GIVEN audio already at 16000Hz, WHEN ingest called, THEN no double-resampling (readAudio called once)', async () => {
    const fs = makeMockFs(16000);
    const p = new DatasetPipeline({ fsAdapter: fs });
    await p.ingest('/data/audio_16k.wav', 'shahed-136', 'field');
    expect(fs.readAudio).toHaveBeenCalledTimes(1);
  });

  it('FR-W7-01-04: GIVEN audio at 22050Hz, WHEN ingest called, THEN item.sampleRate resampled to 16000', async () => {
    const fs = makeMockFs(22050);
    const p = new DatasetPipeline({ fsAdapter: fs });
    const item = await p.ingest('/data/audio_22050.wav', 'shahed-136', 'field');
    expect(item.sampleRate).toBe(16000);
  });

  it('FR-W7-01-05: GIVEN audio at 48000Hz, WHEN ingest called, THEN item.sampleRate resampled to 16000', async () => {
    const fs = makeMockFs(48000);
    const p = new DatasetPipeline({ fsAdapter: fs });
    const item = await p.ingest('/data/audio_48k.wav', 'gerbera', 'field');
    expect(item.sampleRate).toBe(16000);
  });

  // --- segment() sample counts at 16kHz ---

  it('FR-W7-01-06: GIVEN 16kHz pipeline, WHEN segment called for 0.975s window, THEN segment size is 15600 samples (not 21449)', async () => {
    const fs = makeMockFs(16000);
    const p = new DatasetPipeline({ fsAdapter: fs });
    await p.ingest('/data/audio_16k.wav', 'shahed-136', 'field');
    const segments = p.segment({ windowSeconds: 0.975, hopSeconds: 0.975 });
    // 0.975s * 16000Hz = 15600 samples
    expect(segments[0]?.sampleCount).toBe(15600);
    expect(segments[0]?.sampleCount).not.toBe(21449);
  });

  // --- augment() preserves 16kHz ---

  it('FR-W7-01-07: GIVEN ingested 16kHz item, WHEN augment called, THEN augmented item.sampleRate remains 16000', async () => {
    const fs = makeMockFs(16000);
    const p = new DatasetPipeline({ fsAdapter: fs });
    const original = await p.ingest('/data/audio_16k.wav', 'shahed-136', 'field');
    const augmented = await p.augment(original.id, { speed: 1.05 });
    expect(augmented.sampleRate).toBe(16000);
  });

  // --- split() determinism with 16kHz ---

  it('FR-W7-01-08: GIVEN 100 items at 16kHz, WHEN split called twice with same seed, THEN train/val/test sets are identical', async () => {
    const fs = makeMockFs(16000);
    const p = new DatasetPipeline({ fsAdapter: fs });
    for (let i = 0; i < 100; i++) {
      await p.ingest(`/data/item${i}.wav`, 'shahed-136', 'field');
    }
    const result1 = p.split(0.8, 0.1, 0.1);
    const result2 = p.split(0.8, 0.1, 0.1);
    expect(result1.train).toBe(result2.train);
    expect(result1.val).toBe(result2.val);
    expect(result1.test).toBe(result2.test);
  });

  // --- getStats() reports 16kHz ---

  it('FR-W7-01-09: GIVEN pipeline with 16kHz ingested items, WHEN getStats called, THEN stats.sampleRate is 16000', async () => {
    const fs = makeMockFs(16000);
    const p = new DatasetPipeline({ fsAdapter: fs });
    await p.ingest('/data/audio_16k.wav', 'shahed-136', 'field');
    const stats = p.getStats();
    expect(stats.sampleRate).toBe(16000);
  });

  // --- exportTFRecord() sets 16kHz metadata ---

  it('FR-W7-01-10: GIVEN ingested 16kHz items, WHEN exportTFRecord called, THEN metadata sampleRate is 16000', async () => {
    const fs = makeMockFs(16000);
    const p = new DatasetPipeline({ fsAdapter: fs });
    await p.ingest('/data/audio_16k.wav', 'shahed-136', 'field');
    const metadata = await p.exportTFRecord('/output/dataset.tfrecord');
    expect(metadata?.sampleRate).toBe(16000);
  });

  // --- constructor sampleRate override ---

  it('FR-W7-01-11: GIVEN DatasetPipeline constructed with explicit sampleRate:8000, THEN pipeline uses 8000Hz target', async () => {
    const fs = makeMockFs(44100);
    const p = new DatasetPipeline({ fsAdapter: fs, sampleRate: 8000 });
    const item = await p.ingest('/data/audio.wav', 'shahed-136', 'field');
    expect(item.sampleRate).toBe(8000);
  });

  // --- legacy item flagging ---

  it('FR-W7-01-12: GIVEN dataset item with sampleRate:22050, WHEN validateItem called, THEN item flagged as legacy', () => {
    const fs = makeMockFs(16000);
    const p = new DatasetPipeline({ fsAdapter: fs });
    const legacyItem: Partial<DatasetItem> = {
      id: 'legacy-001',
      sampleRate: 22050,
      droneLabel: 'shahed-136',
      source: 'field',
      augmented: false,
      split: null,
    };
    const result = p.validateItem(legacyItem as DatasetItem);
    expect(result.isLegacy).toBe(true);
    expect(result.warnings).toContain('sampleRate:22050 is legacy — expected 16000');
  });

  // --- mel spectrogram frame count at 16kHz ---

  it('FR-W7-01-13: GIVEN 1s audio at 16kHz with hop length 160, WHEN mel spectrogram computed, THEN frame count is 100 (16000/160)', async () => {
    const fs = makeMockFs(16000);
    const p = new DatasetPipeline({ fsAdapter: fs });
    await p.ingest('/data/audio_16k.wav', 'shahed-136', 'field');
    const frameCount = p.getMelFrameCount({ durationSeconds: 1.0, hopLength: 160 });
    expect(frameCount).toBe(100);
  });

  // --- performance ---

  it('FR-W7-01-14: GIVEN 1s audio at 16kHz, WHEN ingest called, THEN completes in < 50ms', async () => {
    const fs = makeMockFs(16000);
    const p = new DatasetPipeline({ fsAdapter: fs });
    const start = performance.now();
    await p.ingest('/data/audio_16k.wav', 'shahed-136', 'field');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  // --- integration: full pipeline at 16kHz ---

  it('FR-W7-01-15: GIVEN full pipeline run at 16kHz, WHEN ingest→augment→split→exportTFRecord, THEN all stages produce 16kHz output', async () => {
    const fs = makeMockFs(16000);
    const p = new DatasetPipeline({ fsAdapter: fs });

    // ingest 10 items
    const items: DatasetItem[] = [];
    for (let i = 0; i < 10; i++) {
      const item = await p.ingest(`/data/item${i}.wav`, 'shahed-136', 'field');
      items.push(item);
      expect(item.sampleRate).toBe(16000);
    }

    // augment one
    const augmented = await p.augment(items[0].id, { noiseLevel: 0.02 });
    expect(augmented.sampleRate).toBe(16000);

    // split
    const splitResult = p.split(0.8, 0.1, 0.1);
    expect(splitResult.train + splitResult.val + splitResult.test).toBe(11); // 10 + 1 augmented

    // export — metadata should carry 16kHz
    const metadata = await p.exportTFRecord('/output/w7-dataset.tfrecord');
    expect(metadata?.sampleRate).toBe(16000);
  });
});
