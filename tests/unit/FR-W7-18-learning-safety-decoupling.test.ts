// APEX-SENTINEL — FR-W7-18 Learning-Safety Decoupling
// tests/unit/FR-W7-18-learning-safety-decoupling.test.ts
//
// IEC 61508 / German Ethics Commission (Linz, Ch.5 "The Future of SQA") requirement:
//
//   Self-learning components MUST be architecturally isolated from safety-critical
//   inference until the learning artefact has passed a formal promotion gate.
//
// For SENTINEL this means:
//   1. YAMNetFineTuner.trainEpoch() MUST NOT mutate AcousticProfileLibrary profiles.
//   2. A promotion gate method (e.g. promoteModel()) MUST exist before trained weights
//      can affect live inference.
//   3. The inference result from AcousticProfileLibrary must be identical before and
//      after a training run.
//
// If the promoteModel gate does not yet exist on YAMNetFineTuner, the tests document
// the gap via it.todo() with SAFETY-GATE: prefix.

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { YAMNetFineTuner } from '../../src/ml/yamnnet-finetuner.js';
import { AcousticProfileLibrary } from '../../src/ml/acoustic-profile-library.js';
import type { TrainingMetrics, EvaluationResult } from '../../src/ml/yamnnet-finetuner.js';

// ---------------------------------------------------------------------------
// Mock model backend — records calls but does NOT touch any external state
// ---------------------------------------------------------------------------

function makeBackend() {
  const trainEpoch = vi.fn<Parameters<typeof vi.fn>, Promise<TrainingMetrics>>().mockResolvedValue({
    epoch: 1,
    loss: 0.12,
    valAccuracy: 0.88,
    falsePositiveRate: 0.05,
    droneClassAccuracy: 0.91,
  });
  const evaluate = vi.fn<[], Promise<EvaluationResult>>().mockResolvedValue({
    accuracy: 0.89,
    falsePositiveRate: 0.04,
  });
  const exportONNX = vi.fn<[string], Promise<void>>().mockResolvedValue();

  return { trainEpoch, evaluate, exportONNX };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute a stable fingerprint of all profiles for comparison */
function fingerprint(lib: AcousticProfileLibrary): string {
  return lib
    .getAllProfiles()
    .map(p => `${p.droneType}:${p.frequencyRange[0]}-${p.frequencyRange[1]}:${p.engineType}`)
    .sort()
    .join('|');
}

// ===========================================================================
describe('FR-W7-18: Learning-Safety Decoupling — IEC 61508 Gate', () => {

  let library: AcousticProfileLibrary;
  let tuner: YAMNetFineTuner;
  let backend: ReturnType<typeof makeBackend>;

  beforeEach(() => {
    library = new AcousticProfileLibrary();
    backend = makeBackend();
    tuner = new YAMNetFineTuner({ modelBackend: backend });
    tuner.loadDataset('/fake/dataset/path');
  });

  // -------------------------------------------------------------------------
  // Core isolation assertion
  // -------------------------------------------------------------------------

  it('SAFETY-01: AcousticProfileLibrary matchFrequency result is UNCHANGED after YAMNetFineTuner.trainEpoch()', async () => {
    // Baseline inference BEFORE training
    const baselineMatch = library.matchFrequency(167, 217);
    const baselineType  = baselineMatch?.droneType;
    const baselineRange = baselineMatch?.frequencyRange.slice();

    // Run training — mock backend, but the call path is real
    await tuner.trainEpoch(32);

    // Inference AFTER training
    const postMatch = library.matchFrequency(167, 217);

    // Must be identical — training must NOT have touched the library
    expect(postMatch?.droneType).toBe(baselineType);
    expect(postMatch?.frequencyRange).toEqual(baselineRange);
  });

  it('SAFETY-02: AcousticProfileLibrary profile count is UNCHANGED after YAMNetFineTuner.trainEpoch()', async () => {
    const countBefore = library.getAllProfiles().length;
    await tuner.trainEpoch(32);
    const countAfter = library.getAllProfiles().length;
    expect(countAfter).toBe(countBefore);
  });

  it('SAFETY-03: Full profile fingerprint is UNCHANGED after multiple trainEpoch() calls', async () => {
    const before = fingerprint(library);

    // Simulate a multi-epoch training run
    await tuner.trainEpoch(32);
    await tuner.trainEpoch(32);
    await tuner.trainEpoch(32);

    const after = fingerprint(library);
    expect(after).toBe(before);
  });

  it('SAFETY-04: AcousticProfileLibrary Gerbera profile attributes unchanged after training', async () => {
    const gerberaBefore = library.getProfile('gerbera');
    const rangeSnapshot: [number, number] = [...gerberaBefore.frequencyRange] as [number, number];

    await tuner.trainEpoch(32);

    const gerberaAfter = library.getProfile('gerbera');
    expect(gerberaAfter.frequencyRange).toEqual(rangeSnapshot);
    expect(gerberaAfter.engineType).toBe(gerberaBefore.engineType);
    expect(gerberaAfter.falsePositiveRisk).toBe(gerberaBefore.falsePositiveRisk);
  });

  it('SAFETY-05: AcousticProfileLibrary Shahed-238 turbine profile unchanged after training', async () => {
    const before = library.getProfile('shahed-238');
    await tuner.trainEpoch(32);
    const after = library.getProfile('shahed-238');
    expect(after.frequencyRange).toEqual(before.frequencyRange);
    expect(after.engineType).toBe('turbine');
  });

  // -------------------------------------------------------------------------
  // Training state — tuner internal attributes
  // -------------------------------------------------------------------------

  it('SAFETY-06: YAMNetFineTuner.trainEpoch() increments currentEpoch on each call', async () => {
    await tuner.trainEpoch(32);
    await tuner.trainEpoch(32);
    const metrics = tuner.getMetrics();
    expect(metrics).toHaveLength(2);
    expect(metrics[0].epoch).toBe(1);
    expect(metrics[1].epoch).toBe(2);
  });

  it('SAFETY-07: YAMNetFineTuner.trainEpoch() delegates to backend with correct config params', async () => {
    await tuner.trainEpoch(64);
    expect(backend.trainEpoch).toHaveBeenCalledOnce();
    const [config, epoch] = backend.trainEpoch.mock.calls[0];
    expect(config.batchSize).toBe(64);
    expect(epoch).toBe(1);
  });

  it('SAFETY-08: YAMNetFineTuner.trainEpoch() throws DatasetNotLoadedError if no dataset', async () => {
    const unloaded = new YAMNetFineTuner({ modelBackend: backend });
    await expect(unloaded.trainEpoch(32)).rejects.toThrowError('DatasetNotLoaded');
  });

  it('SAFETY-09: YAMNetFineTuner.exportONNX() throws ModelNotTrainedError if no epoch run', async () => {
    await expect(tuner.exportONNX('/output/model.onnx')).rejects.toThrowError('ModelNotTrained');
  });

  it('SAFETY-10: YAMNetFineTuner.getMetrics() returns a copy — external mutation does not affect tuner', async () => {
    await tuner.trainEpoch(32);
    const metrics = tuner.getMetrics();
    metrics.push({ epoch: 99, loss: 99, valAccuracy: 0, falsePositiveRate: 0, droneClassAccuracy: 0 });
    // Internal metrics must still have only 1 entry
    expect(tuner.getMetrics()).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Promotion gate — documents the REQUIRED safety gate pattern
  //
  // IEC 61508 requires that trained weights go through a formal promotion step
  // before they can influence live inference. If promoteModel() (or equivalent)
  // does not exist on YAMNetFineTuner, the tests below document the gap.
  // -------------------------------------------------------------------------

  it.todo('SAFETY-GATE: promote gate must exist before train() can affect inference — YAMNetFineTuner must have a promoteModel() method');

  it.todo('SAFETY-GATE: promoteModel() must require evaluation metrics above threshold before accepting new weights');

  it.todo('SAFETY-GATE: promoteModel() must be callable from outside YAMNetFineTuner (separation of training vs promotion authority)');

  it.todo('SAFETY-GATE: AcousticProfileLibrary must accept promoted model handle via setActiveModel(promotedHandle) — not by direct weight mutation');

  it.todo('SAFETY-GATE: if promote gate is bypassed (e.g. during testing), a SAFETY_GATE_BYPASSED warning must be logged');

  // Document current architecture status
  it('SAFETY-ARCH: YAMNetFineTuner does NOT currently expose a promoteModel() method — gap documented', () => {
    // This is a living documentation test — it confirms the current state of the code.
    // When promoteModel() is implemented, this test should be updated to assert its presence.
    const hasPromoteMethod = typeof (tuner as unknown as Record<string, unknown>).promoteModel === 'function';
    // DELIBERATE: We assert the gap exists so CI will catch when it is resolved
    expect(hasPromoteMethod).toBe(false); // Remove this assertion when promoteModel() is implemented
  });

  it('SAFETY-ARCH: YAMNetFineTuner does NOT currently expose a setActiveModel() method — gap documented', () => {
    const hasSetActiveModel = typeof (tuner as unknown as Record<string, unknown>).setActiveModel === 'function';
    expect(hasSetActiveModel).toBe(false); // Remove when setActiveModel() is implemented
  });

});
