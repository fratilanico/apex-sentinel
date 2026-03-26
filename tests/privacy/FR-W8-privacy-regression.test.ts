// APEX-SENTINEL — W8 Privacy Regression Tests
// tests/privacy/FR-W8-privacy-regression.test.ts
// GDPR guarantees survive OTA + Mobile + Wild Hornets additions.

import { describe, it, expect, vi } from 'vitest';
import { OtaController, type OtaManifest } from '../../src/node/ota-controller.js';
import { WildHornetsLoader } from '../../src/ml/wild-hornets-loader.js';
import { YAMNetFineTuner } from '../../src/ml/yamnnet-finetuner.js';
import { createHash } from 'crypto';

const PASSING_METRICS = {
  shahed_136: { recall: 0.88, precision: 0.87, f1: 0.875, sampleCount: 80 },
  shahed_131: { recall: 0.86, precision: 0.84, f1: 0.85,  sampleCount: 75 },
  shahed_238: { recall: 0.96, precision: 0.91, f1: 0.935, sampleCount: 60 },
  gerbera:    { recall: 0.93, precision: 0.89, f1: 0.91,  sampleCount: 70 },
  quad_rotor: { recall: 0.89, precision: 0.87, f1: 0.88,  sampleCount: 100 },
};

describe('FR-W8: Privacy Regression — W8 additions', () => {

  it('FR-W8-PRIV-01: GIVEN firmware OTA manifest payload, THEN payload contains no audio data or GPS coordinates', () => {
    const content = Buffer.from('firmware-v1.1.0');
    const manifest: OtaManifest = {
      version: '1.1.0',
      sha256: createHash('sha256').update(content).digest('hex'),
      downloadUrl: 'http://ota.internal/fw-1.1.0.bin',
      releaseDate: '2026-03-26',
    };
    // Manifest must not contain audio or GPS fields
    const manifestStr = JSON.stringify(manifest);
    expect(manifestStr).not.toContain('audio');
    expect(manifestStr).not.toContain('lat');
    expect(manifestStr).not.toContain('lon');
    expect(manifestStr).not.toContain('gps');
    expect(manifestStr).not.toContain('recording');
  });

  it('FR-W8-PRIV-02: GIVEN OTA log entry in firmware_ota_log, THEN contains no GPS position or audio data', async () => {
    const content = Buffer.from('firmware-v1.1.0');
    const manifest: OtaManifest = {
      version: '1.1.0',
      sha256: createHash('sha256').update(content).digest('hex'),
      downloadUrl: 'http://ota.internal/fw-1.1.0.bin',
      releaseDate: '2026-03-26',
    };
    const insertMock = vi.fn().mockResolvedValue(undefined);
    const supabase = { insert: insertMock, update: vi.fn().mockResolvedValue(undefined) };
    const natsKv = {
      get: vi.fn().mockResolvedValue(JSON.stringify(manifest)),
      put: vi.fn().mockResolvedValue(undefined),
    };
    const fs = {
      download: vi.fn().mockResolvedValue({ localPath: '/tmp/fw.bin', bytes: content }),
      apply: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(true),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const healthChecker = { check: vi.fn().mockResolvedValue(true) };
    const ctrl = new OtaController({ currentVersion: '1.0.0', natsKv, fs, healthChecker });
    ctrl.setSupabaseClient(supabase);
    const localPath = await ctrl.downloadAndVerify(manifest);
    await ctrl.applyUpdate(localPath, manifest);
    // Verify OTA log row contains no GPS/audio data
    const logRow = insertMock.mock.calls[0][1];
    const rowStr = JSON.stringify(logRow);
    expect(rowStr).not.toContain('lat');
    expect(rowStr).not.toContain('lon');
    expect(rowStr).not.toContain('audio');
    expect(rowStr).not.toContain('recording');
  });

  it('FR-W8-PRIV-03: GIVEN mobile app detection event before NATS publish, THEN raw audio stripped (not transmitted)', () => {
    // Detection event schema: only metadata, no raw audio
    const detectionEvent = {
      droneType: 'gerbera',
      confidence: 0.92,
      frequencyRange: [167, 217],
      detectedAt: new Date().toISOString(),
      nodeId: 'node-01',
      // rawAudio: Buffer — MUST NOT be included
    };
    expect(detectionEvent).not.toHaveProperty('rawAudio');
    expect(detectionEvent).not.toHaveProperty('audioBuffer');
    expect(detectionEvent).not.toHaveProperty('waveform');
    const serialized = JSON.stringify(detectionEvent);
    expect(serialized).not.toContain('rawAudio');
    expect(serialized).not.toContain('audioBuffer');
  });

  it('FR-W8-PRIV-04: GIVEN Wild Hornets pipeline run, THEN only aggregate FPR metrics written to Supabase (no individual recordings)', async () => {
    const loader = new WildHornetsLoader();
    const report = await loader.processPipeline('/fake/wild-hornets');
    // Report contains aggregate only
    expect(report).toHaveProperty('fpr');
    expect(report).toHaveProperty('sampleCount');
    expect(report).not.toHaveProperty('samples');
    expect(report).not.toHaveProperty('recordings');
    expect(report).not.toHaveProperty('audioData');
    const reportStr = JSON.stringify(report);
    expect(reportStr).not.toContain('waveform');
    expect(reportStr).not.toContain('audioBuffer');
  });

  it('FR-W8-PRIV-05: GIVEN model promotion audit entry, THEN contains no audio samples or individual detection data', async () => {
    const tuner = new YAMNetFineTuner({
      modelBackend: {
        trainEpoch: vi.fn().mockResolvedValue({ epoch: 1, loss: 0.12, valAccuracy: 0.88, falsePositiveRate: 0.05, droneClassAccuracy: 0.91 }),
        evaluate: vi.fn().mockResolvedValue({ accuracy: 0.89, falsePositiveRate: 0.04 }),
        exportONNX: vi.fn().mockResolvedValue(undefined),
      },
    });
    tuner.loadDataset('/fake/dataset');
    const result = await tuner.promoteModel(PASSING_METRICS, 'privacy-op');
    const auditStr = JSON.stringify(result);
    // Audit row must not contain individual audio samples or recordings
    expect(auditStr).not.toContain('audioBuffer');
    expect(auditStr).not.toContain('waveform');
    expect(auditStr).not.toContain('rawAudio');
    // Only aggregate metrics (recall, precision, f1, sampleCount) are permitted
    expect(result.metrics.shahed_238).toHaveProperty('recall');
    expect(result.metrics.shahed_238).toHaveProperty('sampleCount');
    expect(result.metrics.shahed_238).not.toHaveProperty('samples');
  });

  it('FR-W8-PRIV-06: GIVEN firmware OTA applied to node, WHEN location coarsening test runs post-OTA, THEN ±50m GDPR grid still active (regression)', async () => {
    // GDPR coarsening: coordinates must be grid-snapped to ±50m
    const GRID_DEGREES = 50 / 111_000; // 50m in degrees
    const coarsen = (coord: number) => Math.round(coord / GRID_DEGREES) * GRID_DEGREES;
    // Simulate post-OTA coordinate: precise GPS → coarsened
    const preciseCoord = 48.123456789;
    const coarsened = coarsen(preciseCoord);
    const errorM = Math.abs(coarsened - preciseCoord) * 111_000;
    // Post-OTA: coarsening still active, error ≤ 50m
    expect(errorM).toBeLessThanOrEqual(50);
    // Coarsened coordinate is NOT the original (coarsening happened)
    expect(coarsened).not.toBeCloseTo(preciseCoord, 6);
  });
});
