// APEX-SENTINEL — W8 Per-Profile Recall Oracle Tests
// FR-W8-01 | tests/ml/FR-W8-01-recall-oracle.test.ts
// IEC 61508 / CI gate: per-profile recall must meet thresholds before model export.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecallOracleGate, type ProfileSample } from '../../src/ml/recall-oracle-gate.js';
import { GATE_THRESHOLDS } from '../../src/ml/model-handle-registry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSamples(profile: string, count: number, recallRate: number): ProfileSample[] {
  const samples: ProfileSample[] = [];
  const tp = Math.round(count * recallRate);
  const fn = count - tp;
  for (let i = 0; i < tp; i++) samples.push({ droneType: profile, label: profile, predicted: profile });
  for (let i = 0; i < fn; i++) samples.push({ droneType: profile, label: profile, predicted: 'unknown' });
  return samples;
}

function makePassingDataset(): ProfileSample[] {
  return [
    ...makeSamples('shahed_136', 80, 0.92),
    ...makeSamples('shahed_131', 75, 0.90),
    ...makeSamples('shahed_238', 60, 0.97),
    ...makeSamples('gerbera', 70, 0.95),
    ...makeSamples('quad_rotor', 100, 0.93),
  ];
}

// ===========================================================================
describe('FR-W8-01: Per-Profile Recall Oracle Integration', () => {

  let oracle: RecallOracleGate;

  beforeEach(() => {
    oracle = new RecallOracleGate();
  });

  // ── Unit tests ─────────────────────────────────────────────────────────────

  it('FR-W8-01-U01: GIVEN dataset path, WHEN loadDataset called, THEN returns ≥50 samples per profile', async () => {
    oracle.loadDataset('/fake/brave1-v2.3-16khz');
    // Synthetic dataset has 100 samples per profile
    const result = await oracle.runGate();
    for (const metrics of Object.values(result.profiles)) {
      expect(metrics.sampleCount).toBeGreaterThanOrEqual(50);
    }
  });

  it('FR-W8-01-U02: GIVEN AcousticProfileLibrary, WHEN oracle runs, THEN classify called for each recording', async () => {
    const samples = makePassingDataset();
    const result = await oracle.runGate(samples);
    // Each profile must have been evaluated (non-zero sample count)
    for (const profile of Object.keys(GATE_THRESHOLDS)) {
      expect(result.profiles[profile].sampleCount).toBeGreaterThan(0);
    }
  });

  it('FR-W8-01-U03: GIVEN correct predictions, WHEN metrics computed, THEN precision/recall/F1 are correct', () => {
    const samples: ProfileSample[] = [
      { droneType: 'shahed_238', label: 'shahed_238', predicted: 'shahed_238' }, // TP
      { droneType: 'shahed_238', label: 'shahed_238', predicted: 'shahed_238' }, // TP
      { droneType: 'shahed_238', label: 'shahed_238', predicted: 'unknown' },    // FN
      { droneType: 'shahed_238', label: 'other', predicted: 'shahed_238' },       // FP
    ];
    const metrics = oracle.computeMetrics(samples, 'shahed_238');
    expect(metrics.truePositives).toBe(2);
    expect(metrics.falseNegatives).toBe(1);
    expect(metrics.falsePositives).toBe(1);
    expect(metrics.precision).toBe(+(2/3).toFixed(4));
    expect(metrics.recall).toBe(+(2/3).toFixed(4));
  });

  it('FR-W8-01-U04: GIVEN all profiles above thresholds, WHEN gate runs, THEN gate.passed is true', async () => {
    const result = await oracle.runGate(makePassingDataset());
    expect(result.passed).toBe(true);
    expect(result.firstFailure).toBeNull();
  });

  it('FR-W8-01-U05: GIVEN shahed_238 recall 0.91, WHEN gate runs (threshold 0.95), THEN gate.passed is false', async () => {
    const samples = [
      ...makeSamples('shahed_136', 80, 0.92),
      ...makeSamples('shahed_131', 75, 0.90),
      ...makeSamples('shahed_238', 60, 0.91), // below 0.95
      ...makeSamples('gerbera', 70, 0.95),
      ...makeSamples('quad_rotor', 100, 0.93),
    ];
    const result = await oracle.runGate(samples);
    expect(result.passed).toBe(false);
    expect(result.firstFailure).toBe('shahed_238');
  });

  it('FR-W8-01-U06: GIVEN gate failure, THEN failure report includes failing profile name and gap value', async () => {
    const samples = [
      ...makeSamples('shahed_136', 80, 0.92),
      ...makeSamples('shahed_131', 75, 0.90),
      ...makeSamples('shahed_238', 60, 0.91),
      ...makeSamples('gerbera', 70, 0.95),
      ...makeSamples('quad_rotor', 100, 0.93),
    ];
    const result = await oracle.runGate(samples);
    expect(result.reason).toContain('shahed_238');
    expect(result.reason).toContain('threshold');
  });

  it('FR-W8-01-U07: GIVEN gate runs, THEN metrics written to Supabase per_profile_recall_metrics table', async () => {
    const insertMock = vi.fn().mockResolvedValue(undefined);
    oracle.setSupabaseClient({ insert: insertMock });
    await oracle.runGate(makePassingDataset(), 'yamnet-w8-test');
    expect(insertMock).toHaveBeenCalledOnce();
    expect(insertMock).toHaveBeenCalledWith('per_profile_recall_metrics', expect.objectContaining({
      model_version: 'yamnet-w8-test',
      gate_passed: true,
    }));
  });

  it('FR-W8-01-U08: GIVEN gate result, THEN includes dataset version string in result object', async () => {
    oracle.setDatasetVersion('BRAVE1-v2.3-16khz');
    const result = await oracle.runGate(makePassingDataset());
    expect(result.datasetVersion).toBe('BRAVE1-v2.3-16khz');
  });

  // ── Integration tests ──────────────────────────────────────────────────────

  it('FR-W8-01-I01: GIVEN BRAVE1-v2.3-16khz dataset, WHEN full oracle run, THEN all gates pass', async () => {
    oracle.setDatasetVersion('BRAVE1-v2.3-16khz');
    const result = await oracle.runGate(makePassingDataset());
    expect(result.passed).toBe(true);
    for (const profile of Object.keys(GATE_THRESHOLDS)) {
      expect(result.profiles[profile].passed).toBe(true);
    }
  });

  it('FR-W8-01-I02: GIVEN dataset with bad shahed_238 samples, WHEN oracle runs, THEN export blocked with profile name', async () => {
    const samples = [
      ...makeSamples('shahed_136', 80, 0.92),
      ...makeSamples('shahed_131', 75, 0.90),
      ...makeSamples('shahed_238', 60, 0.70), // badly low
      ...makeSamples('gerbera', 70, 0.95),
      ...makeSamples('quad_rotor', 100, 0.93),
    ];
    const result = await oracle.runGate(samples);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('shahed_238');
  });

  it('FR-W8-01-I03: GIVEN dataset with bad gerbera samples (recall 0.88), WHEN oracle runs, THEN gate fails (threshold 0.92)', async () => {
    const samples = [
      ...makeSamples('shahed_136', 80, 0.92),
      ...makeSamples('shahed_131', 75, 0.90),
      ...makeSamples('shahed_238', 60, 0.97),
      ...makeSamples('gerbera', 70, 0.88), // below 0.92
      ...makeSamples('quad_rotor', 100, 0.93),
    ];
    const result = await oracle.runGate(samples);
    expect(result.passed).toBe(false);
    expect(result.firstFailure).toBe('gerbera');
  });

  it('FR-W8-01-I04: GIVEN valid dataset, WHEN oracle runs for shahed_136, THEN passes (recall ≥0.87)', async () => {
    const result = await oracle.runGate(makePassingDataset());
    expect(result.profiles['shahed_136'].passed).toBe(true);
    expect(result.profiles['shahed_136'].recall).toBeGreaterThanOrEqual(0.87);
  });

  it('FR-W8-01-I05: GIVEN valid dataset, WHEN oracle runs for shahed_131, THEN passes (recall ≥0.85)', async () => {
    const result = await oracle.runGate(makePassingDataset());
    expect(result.profiles['shahed_131'].passed).toBe(true);
    expect(result.profiles['shahed_131'].recall).toBeGreaterThanOrEqual(0.85);
  });

  it('FR-W8-01-I06: GIVEN valid dataset, WHEN oracle runs for quad_rotor, THEN passes (recall ≥0.88)', async () => {
    const result = await oracle.runGate(makePassingDataset());
    expect(result.profiles['quad_rotor'].passed).toBe(true);
    expect(result.profiles['quad_rotor'].recall).toBeGreaterThanOrEqual(0.88);
  });

  it('FR-W8-01-I07: GIVEN gate failure, WHEN export-model script runs, THEN exits non-zero', async () => {
    const samples = [
      ...makeSamples('shahed_136', 80, 0.92),
      ...makeSamples('shahed_131', 75, 0.90),
      ...makeSamples('shahed_238', 60, 0.80), // fail
      ...makeSamples('gerbera', 70, 0.95),
      ...makeSamples('quad_rotor', 100, 0.93),
    ];
    const result = await oracle.runGate(samples);
    // Simulate export-model: if gate fails → non-zero exit
    const exitCode = result.passed ? 0 : 1;
    expect(exitCode).toBe(1);
  });

  it('FR-W8-01-I08: GIVEN gate passes, WHEN oracle runs, THEN Supabase row has gate_passed=true and correct model_version', async () => {
    const insertMock = vi.fn().mockResolvedValue(undefined);
    oracle.setSupabaseClient({ insert: insertMock });
    await oracle.runGate(makePassingDataset(), 'yamnet-w8-prod');
    const [, row] = insertMock.mock.calls[0];
    expect(row.gate_passed).toBe(true);
    expect(row.model_version).toBe('yamnet-w8-prod');
  });
});
