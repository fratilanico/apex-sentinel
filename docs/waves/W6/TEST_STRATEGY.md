# APEX-SENTINEL W6 — Test Strategy

> Wave: W6 — Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
> Last updated: 2026-03-25
> Baseline: 484 tests GREEN | Target: 614 tests (130 new) | Coverage target: ≥80%

---

## 1. Test Philosophy

APEX-SENTINEL tests **logic, not infrastructure**. Every test runs in <5s without network calls, without real ONNX models, and without a live Supabase instance. Infrastructure (NATS, Supabase, ONNX Runtime, Claude API) is always mocked at the boundary.

The W6 test suite adds 130 tests across 10 functional requirements. The CI gate is strict: ALL tests must pass before merge. No skipped tests, no `test.todo` in production branches.

---

## 2. Test Pyramid

```
         ┌──────────────────────┐
    L4   │  Playwright E2E       │  5 tests
         │  (smoke — real ports) │
         ├──────────────────────┤
    L3   │  Journey / Integration│  15 tests
         │  (full TypeScript     │
         │   pipeline, mocked IO)│
         ├──────────────────────┤
    L2   │  Component (Vitest)   │  30 tests
         │  (module integration  │
         │   mocked externals)   │
         ├──────────────────────┤
    L1   │  Unit (Vitest)        │  80 tests
         │  (pure logic, no IO)  │
         └──────────────────────┘

Total W6 new: 130 tests
Total after W6: 484 + 130 = 614 tests
```

---

## 3. Test File Map

| File | FR | Level | Tests |
|---|---|---|---|
| `tests/ml/FR-W6-01-acoustic-profile.test.ts` | FR-W6-01 | L1 Unit | 15 |
| `tests/ml/FR-W6-02-yamnnet-finetuner.test.ts` | FR-W6-02 | L1/L2 | 15 |
| `tests/ml/FR-W6-03-false-positive-guard.test.ts` | FR-W6-03 | L1 Unit | 15 |
| `tests/ml/FR-W6-04-dataset-pipeline.test.ts` | FR-W6-04 | L1/L2 | 10 |
| `tests/fusion/FR-W6-05-multi-node-fusion.test.ts` | FR-W6-05 | L2 Component | 15 |
| `tests/prediction/FR-W6-06-monte-carlo.test.ts` | FR-W6-06 | L1 Unit | 15 |
| `tests/deploy/FR-W6-07-edge-deployer.test.ts` | FR-W6-07 | L2 Component | 10 |
| `tests/integration/FR-W6-08-sentinel-pipeline.test.ts` | FR-W6-08 | L3 Journey | 15 |
| `tests/output/FR-W6-09-cursor-of-truth.test.ts` | FR-W6-09 | L1/L3 | 10 |
| `tests/output/FR-W6-10-brave1-format.test.ts` | FR-W6-10 | L1 Unit | 10 |

---

## 4. Naming Convention

All W6 test files use FR-named describe blocks:

```typescript
describe('FR-W6-01: AcousticProfileLibrary', () => {
  describe('matchFrequency()', () => {
    it('returns Shahed-136 profile for 150-300Hz', () => { ... });
  });
});
```

Test naming pattern: `[action verb] [object] [condition]`

Examples:
- `returns Shahed-136 profile for 150–300Hz input`
- `throws DroneProfileNotFoundError for unknown drone type`
- `consensus confidence exceeds 0.85 when three nodes agree`

---

## 5. Mock Strategy

### 5.1 Mock Boundaries (What We Mock)

```typescript
// vi.mock at module level — infrastructure boundaries only

// ONNX Runtime
vi.mock('onnxruntime-node', () => ({
  InferenceSession: {
    create: vi.fn().mockResolvedValue({
      run: vi.fn().mockResolvedValue({
        output: { data: new Float32Array(10).fill(0.1) }
      })
    })
  }
}));

// NATS JetStream
vi.mock('../src/transport/nats-client', () => ({
  NatsClient: vi.fn().mockImplementation(() => ({
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    drain: vi.fn().mockResolvedValue(undefined),
  }))
}));

// Supabase
vi.mock('../src/db/supabase-client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ data: [], error: null }),
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
  }
}));

// Claude API (VM Gateway)
vi.mock('../src/ai/claude-client', () => ({
  ClaudeClient: vi.fn().mockImplementation(() => ({
    chat: vi.fn().mockResolvedValue({
      content: 'THREAT: SHAHED-136 — CONFIDENCE 92% — HIGH\n' +
               'POSIT: 47.12°N 26.34°E ALT 450m HDG 280° SPD 55m/s\n' +
               'ACTION: ALERT AIR DEFENCE — TRACK CONFIRMED'
    })
  }))
}));
```

### 5.2 What We Do NOT Mock

- Pure TypeScript logic (frequency matching, weight calculation, Monte Carlo math)
- Data structures and type validation
- Error construction and error messages
- Feature flag evaluation

### 5.3 Test Fixtures

```typescript
// tests/fixtures/acoustic-fixtures.ts
export const SHAHED_136_FRAME: Float32Array = generateSineWave(200, 22050, 2.0);  // 200Hz, 2s
export const LANCET_3_FRAME: Float32Array = generateSineWave(2500, 22050, 2.0);  // 2.5kHz, 2s
export const MOTORCYCLE_FRAME: Float32Array = generateSineWave(180, 22050, 2.0); // 180Hz, 2s

// tests/fixtures/ekf-fixtures.ts
export const HIGH_CONFIDENCE_EKF_STATE = {
  position: [47.1234, 26.3456, 450],
  velocity: [15, -8, -2],
  covariance: identityMatrix(6).scale(0.5),  // trace = 3 (< 1 per dim)
};
export const LOW_CONFIDENCE_EKF_STATE = {
  position: [47.1234, 26.3456, 450],
  velocity: [15, -8, -2],
  covariance: identityMatrix(6).scale(25),   // trace = 150 (> 100)
};

// tests/fixtures/node-reports.ts
export const NODE_REPORT_A = { nodeId: 'node-a', distance: 500, confidence: 0.9, droneClass: 'shahed-136' };
export const NODE_REPORT_B = { nodeId: 'node-b', distance: 1200, confidence: 0.8, droneClass: 'shahed-136' };
export const NODE_REPORT_C = { nodeId: 'node-c', distance: 800, confidence: 0.7, droneClass: 'shahed-136' };
```

---

## 6. Per-FR Test Outline

### 6.1 FR-W6-01: AcousticProfileLibrary (15 tests)

```typescript
describe('FR-W6-01: AcousticProfileLibrary', () => {
  // matchFrequency() — 5 tests
  it('returns shahed-136 profile for 150–300Hz range');
  it('returns lancet-3 profile for 1500–3500Hz range');
  it('returns fpv-racing profile for 400–700Hz range');
  it('returns null for 10kHz (out of all drone ranges)');
  it('returns highest-overlap profile when range spans two classes');

  // getProfile() — 4 tests
  it('returns complete profile with rpmRange [7000,9000] for shahed-136');
  it('throws DroneProfileNotFoundError for unknown drone type "phantom-x"');
  it('returns all required fields: id, label, freqMin, freqMax, rpmRange, source');
  it('profile confidence is between 0 and 1');

  // getAllProfiles() — 3 tests
  it('returns array of at least 4 profiles');
  it('returned profiles all have unique class IDs');
  it('false-positive classes (motorcycle, generator) are included');

  // matchFrequency edge cases — 3 tests
  it('returns motorcycle-50cc for 150–350Hz when enableFalsePositiveClasses=true');
  it('excludes false-positive classes when enableFalsePositiveClasses=false');
  it('handles exact boundary frequencies (fMin, fMax)');
});
```

### 6.2 FR-W6-02: YAMNetFineTuner (15 tests)

```typescript
describe('FR-W6-02: YAMNetFineTuner', () => {
  // trainEpoch() — 4 tests
  it('decreases loss from epoch 1 to epoch 2 given 1000-clip dataset');
  it('calls ONNX session exactly batchSize times per epoch (batchSize=32, 1000 clips → 32 calls)');
  it('emits epoch-complete event with {epoch, loss, val_accuracy}');
  it('applies early stopping when val_accuracy plateaus for patience=5 epochs');

  // exportONNX() — 4 tests
  it('writes ONNX file to specified output path');
  it('ONNX export uses opset 17');
  it('exported file passes validateDeployment (mock validation)');
  it('throws ExportError if output directory does not exist');

  // evaluate() — 3 tests
  it('returns accuracy >= 0.90 on mock validation set');
  it('returns false_positive_rate <= 0.05 on validation set');
  it('returns {accuracy, false_positive_rate, per_class_accuracy} shape');

  // mel spectrogram computation — 4 tests
  it('computes mel spectrogram of shape [128, 87] for 2s window at 22050Hz');
  it('normalizes output to mean=0, std=1 per frame');
  it('applies pre-emphasis filter (coef=0.97) before FFT');
  it('getMetrics() returns {epoch, loss, val_accuracy, false_positive_rate} after training');
});
```

### 6.3 FR-W6-03: FalsePositiveGuard (15 tests)

```typescript
describe('FR-W6-03: FalsePositiveGuard', () => {
  // Low confidence — 2 tests
  it('flags isFalsePositive=true with reason="low-confidence" when confidence < 0.85');
  it('passes detection when confidence >= 0.85 and all other checks pass');

  // Temporal pattern discrimination — 4 tests
  it('flags as false positive when linear track + speed > 60km/h (motorcycle)');
  it('flags as false positive when Doppler shift > 2.0kHz (vehicle approach)');
  it('passes detection for circular flight pattern regardless of speed');
  it('flags as false positive when 3 detections at constant linear speed');

  // RF cross-correlation — 3 tests
  it('confirms detection when RF 900MHz burst detected + circular pattern');
  it('increases false positive probability when no RF present + linear pattern');
  it('does not flag false positive when RF present + hovering pattern');

  // Combined assessment — 4 tests
  it('returns {isFalsePositive: true, reason: "temporal-linear"} for motorcycle scenario');
  it('returns {isFalsePositive: false} for confirmed drone scenario (RF + circular)');
  it('assess() returns reason field populated on every false positive');
  it('assess() returns reason=null when isFalsePositive is false');

  // Edge cases — 2 tests
  it('handles missing dopplerShift (undefined) — defaults to 0');
  it('handles empty temporal window — returns isFalsePositive=false (insufficient data)');
});
```

### 6.4 FR-W6-04: DatasetPipeline (10 tests)

```typescript
describe('FR-W6-04: DatasetPipeline', () => {
  // ingest() — 3 tests
  it('resamples 44100Hz input to 22050Hz');
  it('normalizes peak amplitude to [-1, 1]');
  it('stores metadata in dataset_items (not raw audio bytes)');

  // split() — 2 tests
  it('splits 500 items into {train:400, val:50, test:50} for ratio (0.8, 0.1, 0.1)');
  it('split ratios sum to 1.0 and cover all items');

  // augment() — 2 tests
  it('returns new audio clip with speed=1.1 applied (length changes by 1/1.1)');
  it('adds noise at SNR ~26dB when noise=0.05');

  // exportTFRecord() — 1 test
  it('writes valid TFRecord file to output path (mock fs)');

  // getStats() — 2 tests
  it('returns {total:0, byLabel:{}, bySource:{}} for empty dataset');
  it('returns correct counts for dataset with 3 labels and 2 sources');
});
```

### 6.5 FR-W6-05: MultiNodeFusion (15 tests)

```typescript
describe('FR-W6-05: MultiNodeFusion', () => {
  // fuse() — 5 tests
  it('returns consensus confidence > 0.85 when 3 nodes report confidences [0.9, 0.8, 0.7]');
  it('closer node receives higher weight (inverse distance weighting)');
  it('majority vote overrides 1 false-positive when 2 of 3 nodes confirm detection');
  it('returns null when fewer than 2 nodes report on track');
  it('fuse() result droneClass matches majority class');

  // clearStale() — 3 tests
  it('removes node report older than maxAgeMs');
  it('keeps recent reports (age < maxAgeMs)');
  it('does not throw when no stale reports present');

  // getConsensus() — 4 tests
  it('returns null when no reports for track');
  it('returns null when only 1 report (no consensus possible)');
  it('returns FusedDetection with fusedConfidence and contributingNodes');
  it('contributingNodes includes all node IDs that contributed');

  // Edge cases — 3 tests
  it('handles all nodes reporting same confidence (equal weights from equal distance)');
  it('handles 2 nodes in disagreement on droneClass — returns null (no consensus)');
  it('timestamp of fused result is latest of contributing report timestamps');
});
```

### 6.6 FR-W6-06: MonteCarloPropagator (15 tests)

```typescript
describe('FR-W6-06: MonteCarloPropagator', () => {
  // propagate() — 5 tests
  it('returns exactly 1000 impact samples when propagate(1000) called');
  it('samples are within plausible distance given EKF velocity');
  it('ascending track (vAlt > 0) yields zero impact samples (confidence = 0)');
  it('uses EKF covariance to sample position offsets (not deterministic)');
  it('two calls with same seed produce identical samples (reproducibility)');

  // get95thPercentileBounds() — 4 tests
  it('returns ellipse containing 95% of samples');
  it('high-confidence EKF (covariance trace < 1) → 95th percentile radius < 200m');
  it('low-confidence EKF (covariance trace > 100) → 95th percentile radius > 1000m');
  it('ellipse center is close to mean of all samples (< 50m offset)');

  // Statistical validation — 4 tests
  it('sample distribution is approximately Gaussian (skewness < 0.5)');
  it('variance of samples scales linearly with covariance trace');
  it('propagation respects gravity (vAlt decreases over time for descending track)');
  it('100 samples vs 1000 samples: 95th percentile differs by < 20%');

  // Edge cases — 2 tests
  it('throws MonteCarloError when EKF state is undefined');
  it('returns empty result when track altitude is 0 (already on ground)');
});
```

### 6.7 FR-W6-07: EdgeDeployer (10 tests)

```typescript
describe('FR-W6-07: EdgeDeployer', () => {
  // quantize() — 3 tests
  it('INT8 quantized model is more than 50% smaller than FP32 (mock size check)');
  it('quantize("rpi4") returns INT8 model');
  it('quantize("jetson-nano") returns FP16 model');

  // createManifest() — 3 tests
  it('jetson-nano manifest includes CUDA config and FP16 precision');
  it('rpi4 manifest includes ARM optimizations and INT8 precision');
  it('manifest includes latency target and model path');

  // validateDeployment() — 3 tests
  it('passes when mock inference latency < 200ms (rpi4 target)');
  it('throws EdgeDeploymentError for corrupt ONNX file (zero-byte)');
  it('diagnostic info in EdgeDeploymentError includes device, modelPath, actualLatency');

  // Integration — 1 test
  it('full flow: quantize → createManifest → validateDeployment completes without error');
});
```

### 6.8 FR-W6-08: SentinelPipeline (15 tests)

```typescript
describe('FR-W6-08: SentinelPipeline', () => {
  // processAudioFrame() — 5 tests
  it('routes frame through VAD → FFT → YAMNet → FalsePositiveGuard → TrackManager → EKF (mock chain)');
  it('publishes AcousticDetection to NATS when pipeline processes frame');
  it('buffers result and does not throw when NATS disconnected');
  it('throws PipelineNotRunningError when pipeline not started');
  it('increments processed frame counter on each call');

  // getStatus() — 4 tests
  it('returns {running: true, activeModules: 6, dropsPerSecond: 0} after start()');
  it('returns {running: false} before start()');
  it('reports non-zero dropsPerSecond when NATS backpressure causes drops');
  it('activeModules count reflects enabled feature flags');

  // start() / stop() — 3 tests
  it('start() initializes all 6 modules (VAD, FFT, YAMNet, FPGuard, TrackManager, EKF)');
  it('stop() drains NATS and sets status to stopped');
  it('stop() is idempotent (calling twice does not throw)');

  // Error handling — 3 tests
  it('isolates per-module failures (EKF error does not crash pipeline)');
  it('emits pipeline-error event on module failure');
  it('restarts failed module up to maxModuleRestarts times');
});
```

### 6.9 FR-W6-09: CursorOfTruth (10 tests)

```typescript
describe('FR-W6-09: CursorOfTruth', () => {
  // format() — with Claude — 3 tests
  it('returns 3-line tactical report when Claude API available (mock)');
  it('coarsens coordinates to ±50m in report output');
  it('calls Claude with token budget ≤500 input, ≤200 output');

  // format() — fallback — 3 tests
  it('falls back to template when Claude API throws');
  it('falls back to template when Claude API times out (>8000ms)');
  it('template fallback report contains all required fields (THREAT/POSIT/ACTION)');

  // null impact estimate — 2 tests
  it('states "NO IMPACT PROJECTED" when impactEstimate is null');
  it('includes confidence percentage even when no impact projected');

  // Prompt validation — 2 tests
  it('prompt includes droneClass, confidence, coordinates, heading, speed');
  it('temperature is 0.1 in Claude API call (near-deterministic)');
});
```

### 6.10 FR-W6-10: BRAVE1Format (10 tests)

```typescript
describe('FR-W6-10: BRAVE1Format', () => {
  // encode() — 3 tests
  it('returns BRAVE1 JSON with required fields: type, uid, time, lat, lon, ce, hae, remarks');
  it('uid follows BRAVE1 convention: "sentinel-{nodeId}-{trackId}"');
  it('time field is ISO 8601 UTC string');

  // decode() — 3 tests
  it('decodes valid BRAVE1 JSON back to CoT-equivalent structure');
  it('decoded lat/lon match encoded values within 0.0001 degrees');
  it('decoded remarks field matches encoded remarks');

  // validate() — 4 tests
  it('returns {valid: true, errors: []} for well-formed BRAVE1 message');
  it('returns {valid: false, errors: [...]} for missing "uid" field');
  it('returns {valid: false, errors: [...]} for lat outside [-90, 90]');
  it('errors array contains field name and description for each validation failure');
});
```

---

## 7. L3 Journey Tests — SentinelPipeline Integration

```typescript
// tests/integration/FR-W6-08-sentinel-pipeline.test.ts
// The 15 SentinelPipeline tests are L3 journey tests covering:

// Journey 1: Audio frame → NATS publish (5 tests)
// Journey 2: Pipeline lifecycle (start → process → stop) (3 tests)
// Journey 3: Error resilience (NATS drop, module failure) (3 tests)
// Journey 4: Status monitoring (4 tests)
```

Full journey (tested in journey tests, all externals mocked):

```
generateAudioFrame(22050)           // test fixture
  → SentinelPipeline.processAudioFrame()
    → VAD.isSilent() = false        // mock: returns false
    → FFT.extractFeatures()          // pure math — real
    → YAMNetFineTuner.classify()    // ONNX mocked
    → FalsePositiveGuard.assess()   // pure logic — real
    → TrackManager.update()         // W5 — real
    → EKF.predict()                 // W5 — real
    → NatsClient.publish()          // mocked
  → assert: NatsClient.publish called once
  → assert: published subject === 'acoustic.detections'
  → assert: payload has trackId, droneClass, confidence
```

---

## 8. L4 Playwright Smoke Tests

```typescript
// tests/e2e/sentinel-smoke.spec.ts

test('node health endpoint returns 200', async ({ request }) => {
  const res = await request.get('http://localhost:3000/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ status: 'ok' });
});

test('NATS stream sentinel.detections is reachable', ...);
test('pipeline status endpoint returns running=true after startup', ...);
test('BRAVE1 encode endpoint returns valid JSON', ...);
test('metrics endpoint exposes prometheus gauges for activeModules', ...);
```

Playwright tests run against a real local process with mocked external services (NATS test container, Supabase local).

---

## 9. CI Pipeline

### 9.1 CI Commands (in order)

```bash
# Step 1: Type check
npx tsc --noEmit

# Step 2: Unit + Component + Journey tests with coverage
npx vitest run --coverage

# Step 3: Build check
npm run build

# Step 4: E2E smoke tests
npx playwright test

# All 4 must pass. Any failure = merge blocked.
```

### 9.2 Coverage Gate

```
Statements:  ≥80%
Branches:    ≥80%
Functions:   ≥80%
Lines:       ≥80%
```

Current W5 baseline: 95.38% stmt / 87.55% branch / 97.03% funcs.
W6 target: maintain ≥80% on all four (new code may reduce coverage slightly while staying above gate).

### 9.3 Vitest Config

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/types/**'],
    },
    testTimeout: 10000,      // 10s max per test
    hookTimeout: 5000,       // 5s for beforeEach/afterEach
  }
});
```

---

## 10. Test Data Management

### 10.1 Generated Test Audio

Test audio is generated programmatically — no binary test fixtures committed to git.

```typescript
// tests/utils/audio-generator.ts
export function generateSineWave(
  frequencyHz: number,
  sampleRate: number,
  durationSeconds: number
): Float32Array {
  const samples = Math.floor(sampleRate * durationSeconds);
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    data[i] = Math.sin(2 * Math.PI * frequencyHz * i / sampleRate);
  }
  return data;
}

export function generateNoiseFloor(sampleRate: number, durationSeconds: number): Float32Array {
  const samples = Math.floor(sampleRate * durationSeconds);
  return Float32Array.from({ length: samples }, () => (Math.random() - 0.5) * 0.02);
}
```

### 10.2 Deterministic Monte Carlo

Monte Carlo tests use a seeded PRNG for reproducibility:

```typescript
import { seededRandom } from '../utils/seeded-random';
// seed=42 produces identical sample sequences across runs
const propagator = new MonteCarloPropagator({ seed: 42 });
```

---

## 11. Test Maintenance Rules

1. **No `test.skip` or `test.todo` in main branch** — if a test cannot pass, the feature is not done
2. **No `expect.assertions(0)` workarounds** — every async test must have at least one assertion
3. **No `setTimeout` in tests** — use `vi.useFakeTimers()` and `vi.runAllTimers()`
4. **Mock cleanup in `afterEach`** — `vi.clearAllMocks()` in every test file's afterEach
5. **FR prefix in describe blocks** — all describe blocks start with `FR-W6-0N:` for traceability
6. **One assertion per `it` block preferred** — test one thing per test

---

*Generated: 2026-03-25 | APEX-SENTINEL W6 | TEST_STRATEGY.md*
