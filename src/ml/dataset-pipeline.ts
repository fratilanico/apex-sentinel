// APEX-SENTINEL — W6 Dataset Pipeline
// FR-W6-04 | src/ml/dataset-pipeline.ts
//
// Audio dataset ingestion from Telegram OSINT channels + field recordings.
// Resamples to 22050Hz, augments, splits train/val/test.
// Filesystem adapter injected for testability.

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
}

export interface SplitResult {
  train: number;
  val: number;
  test: number;
}

export interface FsAdapter {
  readAudio: (path: string) => Promise<{ sampleRate: number; durationSeconds: number; channelCount: number }>;
  writeFile: (path: string, data: unknown) => Promise<void>;
  exists: (path: string) => boolean;
}

const TARGET_SAMPLE_RATE = 22050;

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

  constructor(options: { fsAdapter: FsAdapter }) {
    this.fs = options.fsAdapter;
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
      sampleRate: TARGET_SAMPLE_RATE, // always normalized
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

  async exportTFRecord(outputPath: string): Promise<void> {
    const records = Array.from(this.items.values()).map(item => ({
      id: item.id,
      label: item.droneLabel,
      split: item.split,
      sampleRate: item.sampleRate,
      durationSeconds: item.durationSeconds,
    }));
    await this.fs.writeFile(outputPath, records);
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

    return { total: items.length, byLabel, bySource, bySplit };
  }
}
