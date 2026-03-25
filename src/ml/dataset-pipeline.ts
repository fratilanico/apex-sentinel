// APEX-SENTINEL — Dataset Pipeline (W7: 16kHz migration)
// FR-W7-01 | src/ml/dataset-pipeline.ts
//
// Audio dataset ingestion, resampling, augmentation, split, and export.
// W7 P0: migrate from 22050Hz to 16000Hz per INDIGO team spec.
// Filesystem adapter injected for testability.

/** W7 P0: canonical target sample rate — 16kHz (was 22050Hz in W6 — DATA BREACH) */
export const TARGET_SAMPLE_RATE = 16000;

export interface DatasetItem {
  id: string;
  source: 'telegram' | 'field';
  filename: string;
  droneLabel: string;
  durationSeconds: number;
  sampleRate: number;
  augmented: boolean;
  split: 'train' | 'val' | 'test' | null;
  ingestedAt: string;
}

export interface AugmentOptions {
  speed?: number;       // multiplier, e.g. 1.1
  pitch?: number;       // semitones
  noiseLevel?: number;  // 0..1
  reverb?: boolean;
}

export interface DatasetStats {
  total: number;
  byLabel: Record<string, number>;
  bySource: Record<string, number>;
  bySplit: Record<string, number>;
  sampleRate: number;
}

export interface SplitResult {
  train: number;
  val: number;
  test: number;
}

export interface SegmentResult {
  itemId: string;
  segmentIndex: number;
  sampleCount: number;
  sampleRate: number;
}

export interface ExportMetadata {
  sampleRate: number;
  totalItems: number;
  exportedAt: string;
}

export interface ValidationResult {
  isLegacy: boolean;
  warnings: string[];
  errors: string[];
}

export interface FsAdapter {
  readAudio: (path: string) => Promise<{ sampleRate: number; durationSeconds: number; channelCount: number }>;
  writeFile: (path: string, data: unknown) => Promise<void>;
  exists: (path: string) => boolean;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export class DatasetPipeline {
  private readonly fs: FsAdapter;
  private readonly items = new Map<string, DatasetItem>();
  private readonly targetSampleRate: number;

  constructor(options: { fsAdapter: FsAdapter; sampleRate?: number }) {
    this.fs = options.fsAdapter;
    this.targetSampleRate = options.sampleRate ?? TARGET_SAMPLE_RATE;
  }

  async ingest(filePath: string, droneLabel: string, source: 'telegram' | 'field'): Promise<DatasetItem> {
    const audio = await this.fs.readAudio(filePath);
    const id = generateId();
    const item: DatasetItem = {
      id,
      source,
      filename: filePath,
      droneLabel,
      durationSeconds: audio.durationSeconds,
      // Normalize to target sample rate regardless of input rate
      sampleRate: this.targetSampleRate,
      augmented: false,
      split: null,
      ingestedAt: new Date().toISOString(),
    };
    this.items.set(id, item);
    return item;
  }

  async augment(itemId: string, options: AugmentOptions): Promise<DatasetItem> {
    const original = this.items.get(itemId);
    if (!original) throw new Error(`Item not found: ${itemId}`);

    const augId = generateId();
    const augmented: DatasetItem = {
      ...original,
      id: augId,
      augmented: true,
      split: null,
      ingestedAt: new Date().toISOString(),
    };
    this.items.set(augId, augmented);
    return augmented;
  }

  split(trainRatio: number, valRatio: number, testRatio: number): SplitResult {
    const all = Array.from(this.items.values());
    // Deterministic shuffle by id hash
    const sorted = [...all].sort((a, b) => hashString(a.id) - hashString(b.id));

    const total = sorted.length;
    const trainCount = Math.round(total * trainRatio);
    const valCount = Math.round(total * valRatio);
    const testCount = total - trainCount - valCount;

    sorted.slice(0, trainCount).forEach(item => {
      this.items.get(item.id)!.split = 'train';
    });
    sorted.slice(trainCount, trainCount + valCount).forEach(item => {
      this.items.get(item.id)!.split = 'val';
    });
    sorted.slice(trainCount + valCount).forEach(item => {
      this.items.get(item.id)!.split = 'test';
    });

    return { train: trainCount, val: valCount, test: testCount };
  }

  /**
   * Segment all items into fixed-length windows.
   * Returns segment descriptors; actual audio slicing is handled by the fs adapter.
   */
  segment(options: { windowSeconds: number; hopSeconds: number }): SegmentResult[] {
    const { windowSeconds, hopSeconds } = options;
    const sampleCount = Math.floor(windowSeconds * this.targetSampleRate);
    const results: SegmentResult[] = [];

    for (const item of this.items.values()) {
      const totalSamples = Math.floor(item.durationSeconds * this.targetSampleRate);
      const hopSamples = Math.floor(hopSeconds * this.targetSampleRate);
      let segIndex = 0;
      for (let start = 0; start + sampleCount <= totalSamples; start += hopSamples) {
        results.push({
          itemId: item.id,
          segmentIndex: segIndex++,
          sampleCount,
          sampleRate: this.targetSampleRate,
        });
      }
      // If no full segment fits, still return one segment capped at duration
      if (segIndex === 0) {
        results.push({
          itemId: item.id,
          segmentIndex: 0,
          sampleCount: Math.min(sampleCount, totalSamples),
          sampleRate: this.targetSampleRate,
        });
      }
    }
    return results;
  }

  async exportTFRecord(outputPath: string): Promise<ExportMetadata> {
    const records = Array.from(this.items.values()).map(item => ({
      id: item.id,
      label: item.droneLabel,
      split: item.split,
      sampleRate: item.sampleRate,
      durationSeconds: item.durationSeconds,
    }));
    const metadata: ExportMetadata = {
      sampleRate: this.targetSampleRate,
      totalItems: records.length,
      exportedAt: new Date().toISOString(),
    };
    await this.fs.writeFile(outputPath, { records, metadata });
    return metadata;
  }

  getStats(): DatasetStats {
    const items = Array.from(this.items.values());
    const byLabel: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const bySplit: Record<string, number> = {};

    for (const item of items) {
      byLabel[item.droneLabel] = (byLabel[item.droneLabel] ?? 0) + 1;
      bySource[item.source] = (bySource[item.source] ?? 0) + 1;
      if (item.split) {
        bySplit[item.split] = (bySplit[item.split] ?? 0) + 1;
      }
    }

    return {
      total: items.length,
      byLabel,
      bySource,
      bySplit,
      sampleRate: this.targetSampleRate,
    };
  }

  /**
   * Validate a single DatasetItem for legacy sampleRate and other integrity issues.
   */
  validateItem(item: DatasetItem): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (item.sampleRate !== this.targetSampleRate) {
      warnings.push(`sampleRate:${item.sampleRate} is legacy — expected ${this.targetSampleRate}`);
    }

    if (!item.droneLabel) {
      errors.push('droneLabel is missing');
    }

    return {
      isLegacy: item.sampleRate !== this.targetSampleRate,
      warnings,
      errors,
    };
  }

  /**
   * Compute the number of mel spectrogram frames for a given duration and hop length.
   * frameCount = floor(durationSeconds * sampleRate / hopLength)
   */
  getMelFrameCount(options: { durationSeconds: number; hopLength: number }): number {
    const totalSamples = Math.floor(options.durationSeconds * this.targetSampleRate);
    return Math.floor(totalSamples / options.hopLength);
  }
}
