# APEX-SENTINEL W7 — Test Strategy

> Wave: W7 — Hardware Integration Layer + Data Pipeline Rectification + Terminal Phase Detection
> Last updated: 2026-03-25
> Baseline: 629 tests GREEN (W6 complete) | Target: 906+ tests | Coverage target: ≥80% all metrics + per-profile recall gates

---

## 1. Test Philosophy

APEX-SENTINEL tests logic, not infrastructure. Every test runs in < 5s without real hardware, without network calls, and without a live Supabase instance. Hardware components (ONVIF PTZ camera, jammer serial port, ELRS RF receiver, RPi4/Jetson nodes) are always mocked at the boundary. This is non-negotiable: the CI pipeline has no physical hardware attached.

W7 introduces significant hardware coupling. The mock strategy for each hardware component is defined in §5 and must be implemented before any integration tests are written.

The CI gate is strict: ALL 750+ tests must pass before merge. No `test.todo`, no `.skip` in merged code.

---

## 2. Test Pyramid — W7

```
         ┌──────────────────────────────────┐
    L4   │  E2E / Journey Tests              │  10 tests
         │  (full pipeline, all mocked IO)   │
         ├──────────────────────────────────┤
    L3   │  Integration Tests                │  25 tests
         │  (module-to-module, mocked hw)    │
         ├──────────────────────────────────┤
    L2   │  Component Tests (Vitest)         │  40 tests
         │  (module internal logic,          │
         │   mocked external deps)           │
         ├──────────────────────────────────┤
    L1   │  Unit Tests (Vitest)              │  46+ tests
         │  (pure logic, no IO, no mocks)    │
         └──────────────────────────────────┘

         ┌──────────────────────────────────────────────────────┐
    ML   │  ML-Specific Extensions (metamorphic, adversarial,   │
         │  chaos, per-profile recall gates) — see §18–§21      │  156 tests
         └──────────────────────────────────────────────────────┘

W7 new tests: 277 (121 hardware/pipeline FRs + 156 ML extensions)
W7 cumulative: 629 + 277 = 906+
```

---

## 3. Test File Map — W7

| File | FR | Level | Test Count |
|---|---|---|---|
| `tests/pipeline/FR-W7-01-dataset-16khz.test.ts` | FR-W7-01 | L1 Unit | 15 |
| `tests/ml/FR-W7-02-acoustic-profiles-expanded.test.ts` | FR-W7-02 | L1 Unit | 15 |
| `tests/detection/FR-W7-03-terminal-phase-detector.test.ts` | FR-W7-03 | L1/L2 | 20 |
| `tests/hardware/FR-W7-04-elrs-rf-module.test.ts` | FR-W7-04 | L2 Component | 12 |
| `tests/fusion/FR-W7-05-bearing-triangulator.test.ts` | FR-W7-05 | L1/L2 | 14 |
| `tests/hardware/FR-W7-06-ptz-slave-output.test.ts` | FR-W7-06 | L2 Component | 10 |
| `tests/hardware/FR-W7-07-jammer-activation.test.ts` | FR-W7-07 | L2 Component | 10 |
| `tests/fusion/FR-W7-08-physical-intercept-coordinator.test.ts` | FR-W7-08 | L2/L3 | 10 |
| `tests/pipeline/FR-W7-09-tdoa-coordinate-injection.test.ts` | FR-W7-09 | L3 Integration | 8 |
| `tests/dashboard/FR-W7-10-demo-dashboard.test.ts` | FR-W7-10 | L2/L3 | 7 |
| **Subtotal — hardware/pipeline FRs** | | | **121** |
| `tests/helpers/synthetic-audio-factory.ts` | FR-W7-12/13 | Helper | — |
| `tests/ml/consistency-oracle.test.ts` | FR-W7-12 | L1 ML | 18 |
| `tests/ml/FR-W7-11-simpsons-paradox-audit.test.ts` | FR-W7-11 | L1 ML | 12 |
| `tests/ml/FR-W7-12-metamorphic-relations.test.ts` | FR-W7-12 | L1 ML | 24 |
| `tests/adversarial/AT-01-near-boundary-frequency.test.ts` | FR-W7-13 | L1 | 8 |
| `tests/adversarial/AT-02-adversarial-bird-call.test.ts` | FR-W7-13 | L1 | 6 |
| `tests/adversarial/AT-03-replay-attack.test.ts` | FR-W7-13 | L2 | 6 |
| `tests/adversarial/AT-04-spectral-masking.test.ts` | FR-W7-13 | L1 | 8 |
| `tests/adversarial/AT-05-sample-rate-confusion.test.ts` | FR-W7-13 | L1 | 6 |
| `tests/adversarial/AT-06-model-boundary-probing.test.ts` | FR-W7-13 | L1 | 10 |
| `tests/chaos/CE-01-node-failure-mid-triangulation.test.ts` | FR-W7-14 | L2/L3 | 8 |
| `tests/chaos/CE-02-nats-partition.test.ts` | FR-W7-14 | L3 | 6 |
| `tests/chaos/CE-03-clock-skew.test.ts` | FR-W7-14 | L2 | 8 |
| `tests/chaos/CE-04-model-load-failure.test.ts` | FR-W7-14 | L2 | 6 |
| `tests/chaos/CE-05-sample-rate-drift.test.ts` | FR-W7-14 | L2 | 6 |
| `tests/chaos/CE-06-hardware-divergence-regression.test.ts` | FR-W7-14 | L2 | 8 |
| `tests/chaos/CE-07-memory-pressure.test.ts` | FR-W7-14 | L2 | 6 |
| `tests/chaos/CE-08-concept-drift-detection.test.ts` | FR-W7-14 | L2 | 10 |
| **Subtotal — ML extensions** | | | **156** |
| **Total W7** | | | **277** |

---

## 4. Naming Convention

```typescript
describe('FR-W7-03: TerminalPhaseDetector', () => {
  describe('Indicator 1 — Speed Threshold', () => {
    it('returns SPEED_ACTIVE when ground speed exceeds 50 m/s for 300ms', () => {});
    it('returns SPEED_INACTIVE when ground speed is 49 m/s', () => {});
    it('does not activate on transient spike below sustainedWindowMs', () => {});
  });
});
```

All test files use FR-named top-level describe blocks. Nested describes for sub-scenarios. Test names are active-voice imperative sentences.

---

## 5. Mock Strategy

### 5.1 ONVIF PTZ Camera (FR-W7-06)

ONVIF uses SOAP/XML over HTTP. In CI, no physical camera is present. Mock strategy: intercept the HTTP client at the adapter boundary.

```typescript
// src/hardware/ptz-slave-output.ts (production)
export class PtzSlaveOutput {
  constructor(private readonly httpClient: HttpClient) {}

  async sendPtzCommand(pan: number, tilt: number, zoom: number): Promise<void> {
    const xml = this.buildOnvifXml(pan, tilt, zoom);
    await this.httpClient.post(this.onvifEndpoint, xml);
  }
}

// tests/mocks/mock-http-client.ts (test mock)
export class MockHttpClient implements HttpClient {
  public calls: Array<{ url: string; body: string }> = [];

  async post(url: string, body: string): Promise<void> {
    this.calls.push({ url, body });
  }

  getLastCall() { return this.calls[this.calls.length - 1]; }
  reset() { this.calls = []; }
}
```

The mock captures all HTTP calls. Tests assert on the XML content, not network delivery.

### 5.2 Jammer Hardware (Serial Port — FR-W7-07)

Jammer hardware is controlled via serial port commands. Mock strategy: inject a mock SerialPort at construction time.

```typescript
// src/hardware/jammer-activation.ts (production)
export class JammerActivation {
  constructor(
    private readonly serialPort: SerialPortAdapter,
    private readonly authTokenValidator: AuthTokenValidator,
  ) {}
}

// tests/mocks/mock-serial-port.ts
export class MockSerialPort implements SerialPortAdapter {
  public sentCommands: string[] = [];
  public isOpen = false;

  async open(): Promise<void> { this.isOpen = true; }
  async write(command: string): Promise<void> { this.sentCommands.push(command); }
  async close(): Promise<void> { this.isOpen = false; }
}
```

Tests verify that the correct serial command string is generated for each drone class without ever sending bytes to a physical port.

### 5.3 SkyNet Activation (FR-W7-08)

SkyNet is an external intercept unit API. Mock strategy: inject a mock SkyNetClient.

```typescript
// tests/mocks/mock-skynet-client.ts
export class MockSkyNetClient implements SkyNetClient {
  public activationRequests: SkyNetActivationRequest[] = [];
  public shouldSucceed = true;

  async requestIntercept(req: SkyNetActivationRequest): Promise<SkyNetResponse> {
    this.activationRequests.push(req);
    if (!this.shouldSucceed) throw new SkyNetUnavailableError('mock failure');
    return { accepted: true, estimatedFlightTimeMs: 8000 };
  }
}
```

### 5.4 ELRS RF Signal Simulation (FR-W7-04)

The ELRS RF module reads from an SDR device. In tests, synthetic burst packet arrays are injected via a mock RFReceiver.

```typescript
// tests/helpers/elrs-signal-factory.ts
export function buildELRSBurstSequence(opts: {
  burstIntervalMs: number;
  burstDurationMs: number;
  hopCount: number;
  silenceAfterMs?: number;
}): RFPsdSweep[] {
  // Returns array of simulated PSD sweeps representing ELRS FHSS burst pattern
  const sweeps: RFPsdSweep[] = [];
  // ... burst generation logic
  if (opts.silenceAfterMs) {
    // Append silence sweeps (all-zero PSD across 868-928 MHz band)
    for (let t = 0; t < opts.silenceAfterMs; t += 10) {
      sweeps.push(buildSilenceSweep());
    }
  }
  return sweeps;
}

export function buildSilenceSweep(): RFPsdSweep {
  return { bins: new Float32Array(60).fill(-120), timestampMs: Date.now() };
}
```

### 5.5 NATS JetStream (existing mock pattern — W7 extends)

NATS is already mocked in W1–W6 tests via `MockNatsClient`. W7 adds new subjects:

```typescript
// New subjects in W7 (extend existing MockNatsClient):
const W7_SUBJECTS = [
  'sentinel.bearing.report',
  'sentinel.triangulation.result',
  'sentinel.terminal.phase',
  'sentinel.ptz.command',
  'sentinel.jammer.activate',
  'sentinel.intercept.request',
  'sentinel.rf.burst',
  'sentinel.rf.silence',
];
```

### 5.6 Supabase (existing mock pattern — W7 extends)

Supabase is mocked with `MockSupabaseClient` (established in W3). W7 adds new table mocks:
- `bearing_reports` — insert/select mock
- `jammer_activations` — insert/select mock
- `ptz_commands` — insert mock with 24h retention assertion

---

## 6. FR-W7-01: DatasetPipeline 16kHz Migration Tests

### 6.1 Test Scenarios

**Unit: MelSpectrogramConfig validation**
```typescript
it('uses sampleRate 16000, not 22050', () => {
  const config = new MelSpectrogramConfig();
  expect(config.sampleRate).toBe(16000);
});

it('uses nFFT 1024 at 16kHz (not 2048)', () => {
  const config = new MelSpectrogramConfig();
  expect(config.nFFT).toBe(1024);
});

it('uses hopLength 256 at 16kHz (not 512)', () => {
  const config = new MelSpectrogramConfig();
  expect(config.hopLength).toBe(256);
});

it('uses windowSize 0.975 seconds (YAMNet standard at 16kHz)', () => {
  const config = new MelSpectrogramConfig();
  expect(config.windowSize).toBe(0.975);
});

it('fMax does not exceed Nyquist: 8000 Hz at 16kHz sample rate', () => {
  const config = new MelSpectrogramConfig();
  expect(config.fMax).toBeLessThanOrEqual(config.sampleRate / 2);
});
```

**Unit: Segment generation at 16kHz**
```typescript
it('generates segment of 15600 samples at 16kHz and 0.975s window', () => {
  const pipeline = new DatasetPipeline(config);
  const segment = pipeline.extractSegment(mockAudio16kHz, 0);
  expect(segment.length).toBe(15600); // 16000 * 0.975
});

it('rejects audio sampled at 22050 Hz with SampleRateMismatchError', () => {
  const pipeline = new DatasetPipeline(config);
  expect(() => pipeline.ingest(mock22050HzAudio)).toThrow(SampleRateMismatchError);
});
```

**Regression: All W6 behavior preserved at 16kHz**
```typescript
it('segmentation covers full audio duration with no gaps', () => { /* ... */ });
it('SNR filter correctly rejects segments below 6dB threshold', () => { /* ... */ });
it('augmentation chain applies SpecAugment in spectrogram domain', () => { /* ... */ });
it('output segments have correct mel spectrogram shape: [64, 64]', () => { /* ... */ });
```

Total: 15 tests

---

## 7. FR-W7-02: Acoustic Profile Expansion Tests

### 7.1 New Profile Presence

```typescript
it('getProfile("gerbera") returns a valid profile', () => {
  const lib = new AcousticProfileLibrary();
  const profile = lib.getProfile('gerbera');
  expect(profile).not.toBeNull();
  expect(profile.freqMin).toBe(200);
  expect(profile.freqMax).toBe(600);
  expect(profile.engineType).toBe('piston-boxer');
});

it('getProfile("shahed-131") returns higher RPM than shahed-136', () => {
  const lib = new AcousticProfileLibrary();
  const s131 = lib.getProfile('shahed-131');
  const s136 = lib.getProfile('shahed-136');
  expect(s131.rpmRange[0]).toBeGreaterThan(s136.rpmRange[0]);
});

it('getProfile("shahed-238") has freqMin 3000 and freqMax 8000 (turbine range)', () => {
  const lib = new AcousticProfileLibrary();
  const profile = lib.getProfile('shahed-238');
  expect(profile.freqMin).toBe(3000);
  expect(profile.freqMax).toBe(8000);
  expect(profile.engineType).toBe('jet-turbine-micro');
});
```

### 7.2 Routing Branch Assignment

```typescript
it('routes shahed-238 to turbine branch (spectral centroid > 2000 Hz)', () => {
  const router = new ClassificationRouter();
  const result = router.selectBranch(mockEmbedding, spectralCentroid=5500);
  expect(result).toBe('turbine');
});

it('routes gerbera to piston branch (spectral centroid 380 Hz)', () => {
  const router = new ClassificationRouter();
  const result = router.selectBranch(mockEmbedding, spectralCentroid=380);
  expect(result).toBe('piston');
});

it('routing threshold is exactly 2000 Hz: centroid=2000 → piston, centroid=2001 → turbine', () => {
  const router = new ClassificationRouter();
  expect(router.selectBranch(mockEmbedding, 2000)).toBe('piston');
  expect(router.selectBranch(mockEmbedding, 2001)).toBe('turbine');
});
```

### 7.3 matchFrequency Coverage for New Profiles

```typescript
it('matchFrequency(4000, 7000) returns shahed-238 profile', () => { /* ... */ });
it('matchFrequency(250, 550) returns gerbera profile', () => { /* ... */ });
it('matchFrequency(350, 700) returns shahed-131 profile', () => { /* ... */ });
```

Total: 15 tests

---

## 8. FR-W7-03: TerminalPhaseDetector Tests

This is the most critical test suite in W7. Each indicator is tested independently, then combinatorially.

### 8.1 Individual Indicator Tests

**Indicator 1 — Speed Threshold:**
```typescript
describe('Speed Indicator', () => {
  it('activates when ground_speed > 50 m/s for >= 300ms', () => { /* ... */ });
  it('does not activate when speed is 49.9 m/s', () => { /* ... */ });
  it('does not activate on a 250ms spike (below sustained window)', () => { /* ... */ });
  it('deactivates immediately when speed drops below threshold', () => { /* ... */ });
});
```

**Indicator 2 — Heading Variance:**
```typescript
describe('Heading Variance Indicator', () => {
  it('activates when heading variance < 45 degrees over 1 second', () => { /* ... */ });
  it('does not activate when heading variance is 46 degrees', () => { /* ... */ });
  it('correctly computes circular variance (wraps 359°→1°)', () => { /* ... */ });
  it('deactivates when variance exceeds threshold after lock', () => { /* ... */ });
});
```

**Indicator 3 — Altitude Descent Rate:**
```typescript
describe('Descent Rate Indicator', () => {
  it('activates when altitude rate < -5 m/s for 500ms', () => { /* ... */ });
  it('does not activate for descent rate of -4.9 m/s', () => { /* ... */ });
  it('does not activate on ascent (positive rate)', () => { /* ... */ });
  it('deactivates after 2s of non-descent', () => { /* ... */ });
});
```

**Indicator 4 — RF Silence:**
```typescript
describe('RF Silence Indicator', () => {
  it('activates when silence duration > 800ms after prior burst seen', () => { /* ... */ });
  it('does not activate when no prior burst has been observed', () => { /* ... */ });
  it('does not activate when silence is only 700ms', () => { /* ... */ });
  it('resets when new burst detected during silence window', () => { /* ... */ });
});
```

### 8.2 FSM State Transition Tests

```typescript
describe('FSM State Transitions', () => {
  it('starts in CRUISE state', () => { /* ... */ });

  it('transitions CRUISE→DESCENDING when descentRate indicator active for 500ms', () => { /* ... */ });

  it('transitions DESCENDING→TERMINAL_CANDIDATE when speed+heading+descent all active', () => { /* ... */ });

  it('transitions TERMINAL_CANDIDATE→TERMINAL_CONFIRMED when all 4 active for 500ms', () => { /* ... */ });

  it('SINGLE indicator active: never reaches TERMINAL_CANDIDATE', () => {
    // Speed alone
    const detector = new TerminalPhaseDetector();
    detector.updateSpeed(80, 1000);
    expect(detector.state).not.toBe('TERMINAL_CANDIDATE');
    expect(detector.state).not.toBe('TERMINAL_CONFIRMED');
  });

  it('THREE indicators active (no RF silence): never reaches TERMINAL_CONFIRMED', () => {
    const detector = new TerminalPhaseDetector();
    // speed + heading + descent all active, RF silence NOT active
    expect(detector.state).toBe('TERMINAL_CANDIDATE');
    expect(detector.state).not.toBe('TERMINAL_CONFIRMED');
  });
});
```

### 8.3 Confidence Scoring Tests

```typescript
describe('Confidence Scoring', () => {
  it('all 4 active → confidence >= 0.90', () => { /* ... */ });
  it('3 active → confidence = sum of 3 indicator weights < 0.90', () => { /* ... */ });
  it('2 active → confidence < 0.80', () => { /* ... */ });
  it('0 active → confidence = 0', () => { /* ... */ });
  it('confidence is not below 0.90 when allActive=true (floor applied)', () => { /* ... */ });
});
```

Total: 20 tests

---

## 9. FR-W7-04: ELRS RF Module Tests

### 9.1 Burst Detection

```typescript
it('detects burst when energy in any 868-928 MHz bin exceeds threshold', () => {
  const module = new ELRSRFModule(mockSDR);
  const sweep = buildELRSBurstSequence({ burstIntervalMs: 4, burstDurationMs: 2, hopCount: 5 });
  const result = module.processSweeps(sweep);
  expect(result.burstDetected).toBe(true);
});

it('returns burstDetected=false on all-noise sweep below threshold', () => {
  const module = new ELRSRFModule(mockSDR);
  const sweeps = Array(10).fill(buildSilenceSweep());
  const result = module.processSweeps(sweeps);
  expect(result.burstDetected).toBe(false);
});
```

### 9.2 Link Silence Detection

```typescript
it('computeSilenceDuration returns correct duration since last burst', () => { /* ... */ });
it('isSilenceConfirmed returns false when no prior burst seen', () => { /* ... */ });
it('isSilenceConfirmed returns true after 800ms silence following burst', () => { /* ... */ });
it('silence flag resets when new burst arrives', () => { /* ... */ });
```

### 9.3 FHSS Classifier

```typescript
it('classifies valid ELRS FPV burst pattern as "elrs-fpv"', () => { /* ... */ });
it('classifies silence sweep as "noise"', () => { /* ... */ });
it('does not classify LoRaWAN single-burst as ELRS (different timing)', () => { /* ... */ });
```

### 9.4 Packet Loss Rate Calculation

```typescript
it('returns 0% packet loss when all expected bursts present at 250Hz rate', () => { /* ... */ });
it('returns 100% packet loss when no bursts in 200ms at 250Hz rate', () => { /* ... */ });
```

Total: 12 tests

---

## 10. FR-W7-05: BearingTriangulator Tests

### 10.1 Geometric Accuracy Cases

```typescript
it('3-node right-angle setup returns intersection within 50m of true position at 1km range', () => {
  // Node A: (0, 0), bearing 45°
  // Node B: (1000, 0), bearing 135°
  // Node C: (500, 1000), bearing 200°
  // True target: approximately (500, 500)
  const result = triangulator.compute([nodeA, nodeB, nodeC]);
  const error = haversineDistance(result.position, truePosition);
  expect(error).toBeLessThan(50);
});

it('4-node overdetermined system: result has lower uncertainty than 3-node', () => {
  const result3 = triangulator.compute([n1, n2, n3]);
  const result4 = triangulator.compute([n1, n2, n3, n4]);
  expect(result4.positionUncertaintyMeters).toBeLessThan(result3.positionUncertaintyMeters);
});
```

### 10.2 Degenerate Case — Collinear Nodes

```typescript
it('3 collinear nodes: throws CollinearNodeError or returns high uncertainty flag', () => {
  // All 3 nodes on same east-west line
  const collinearNodes = [
    { position: { lat: 44.4, lon: 26.0 }, bearing: 10 },
    { position: { lat: 44.4, lon: 26.5 }, bearing: 10 },
    { position: { lat: 44.4, lon: 27.0 }, bearing: 10 },
  ];
  expect(() => triangulator.compute(collinearNodes)).toThrow(CollinearNodeError);
  // OR: result.collinearWarning === true — implementation choice
});
```

### 10.3 Graceful Degradation with 2 Nodes

```typescript
it('2 nodes: returns estimated position with HIGH uncertainty flag (not error)', () => {
  const result = triangulator.compute([node1, node2]);
  expect(result).not.toBeNull();
  expect(result.uncertaintyFlag).toBe('HIGH');
  expect(result.observerCount).toBe(2);
});

it('1 node: returns bearing line only, not point estimate', () => { /* ... */ });
it('0 nodes: throws InsufficientNodesError', () => { /* ... */ });
```

### 10.4 Output Strips Individual Observer Data

```typescript
it('result does not contain individual observer positions', () => {
  const result = triangulator.compute([n1, n2, n3]);
  expect((result as any).observerPositions).toBeUndefined();
  expect((result as any).bearings).toBeUndefined();
  expect(result.observerCount).toBe(3); // count only
});
```

Total: 14 tests

---

## 11. FR-W7-06: PtzSlaveOutput Tests

### 11.1 ONVIF XML Formation

```typescript
it('generates valid ONVIF PTZ ContinuousMove XML for pan=90, tilt=45', () => {
  const ptz = new PtzSlaveOutput(mockHttpClient, config);
  await ptz.sendPtzCommand(90, 45, 1.0);
  const call = mockHttpClient.getLastCall();
  expect(call.body).toContain('<tt:PanTilt x="90.000" y="45.000"/>');
  expect(call.body).toContain('ContinuousMove');
});

it('includes ONVIF SOAP envelope headers in request', () => { /* ... */ });
it('uses configured ONVIF endpoint URL', () => { /* ... */ });
it('handles ONVIF HTTP 401 by throwing PtzAuthError', () => { /* ... */ });
```

### 11.2 Publish Rate

```typescript
it('emits PTZ commands at 100Hz (10ms interval) given steady EKF updates', () => {
  // Inject 200 EKF updates at 1ms interval, verify 100Hz publish (every other)
  const commandCount = await measurePublishRate(ptz, ekfUpdates=200);
  expect(commandCount).toBeCloseTo(100, 0); // ±5% tolerance
});
```

### 11.3 Bearing Accuracy from EKF State

```typescript
it('computes pan angle from EKF vLat/vLon with 6-8ms lookahead', () => { /* ... */ });
it('lookahead of 7ms at 50m/s produces 0.35m position correction', () => { /* ... */ });
```

Total: 10 tests

---

## 12. FR-W7-07: JammerActivation Tests

### 12.1 Channel Selection by Drone Class

```typescript
it('activates 900MHz channel for fpv-racing threat', () => {
  const jammer = new JammerActivation(mockSerial, mockAuthValidator);
  mockAuthValidator.setValid(true);
  await jammer.activate({ droneClass: 'fpv-racing', confidence: 0.92, operatorConfirmed: true });
  expect(mockSerial.sentCommands[0]).toContain('CHANNEL:900MHZ');
});

it('activates GPS 1575MHz channel for shahed-136 (GPS-guided) threat', () => {
  await jammer.activate({ droneClass: 'shahed-136', confidence: 0.92, operatorConfirmed: true });
  expect(mockSerial.sentCommands[0]).toContain('CHANNEL:1575MHZ');
});

it('activates GPS 1575MHz for shahed-238 (jet turbine = GPS guided)', () => { /* ... */ });
```

### 12.2 Authorization Gate

```typescript
it('throws JammerAuthError when no valid auth token loaded', () => {
  mockAuthValidator.setValid(false);
  await expect(jammer.activate(validRequest)).rejects.toThrow(JammerAuthError);
  expect(mockSerial.sentCommands).toHaveLength(0); // no command sent
});

it('throws JammerAuthError when auth token is expired', () => { /* ... */ });
it('rejects activation outside permitted geographic zone', () => { /* ... */ });
```

### 12.3 False Positive Gate

```typescript
it('rejects activation when acoustic confidence < 0.85', () => {
  const request = { droneClass: 'shahed-136', confidence: 0.84, operatorConfirmed: true };
  await expect(jammer.activate(request)).rejects.toThrow(ConfidenceTooLowError);
});

it('rejects activation when operatorConfirmed = false', () => {
  const request = { droneClass: 'shahed-136', confidence: 0.92, operatorConfirmed: false };
  await expect(jammer.activate(request)).rejects.toThrow(OperatorConfirmationRequired);
});
```

Total: 10 tests

---

## 13. FR-W7-08: PhysicalInterceptCoordinator Tests

### 13.1 Fire Timing Calculation

```typescript
it('computes fire timing: timeToImpact - net_flight_time', () => {
  const coordinator = new PhysicalInterceptCoordinator(mockSkyNet, mockPropagator);
  const result = await coordinator.coordinate({
    timeToImpactMs: 30000,       // 30 seconds
    threatPosition: { lat: 44.4, lon: 26.1 },
    skyNetUnits: [
      { id: 'unit-01', position: { lat: 44.3, lon: 26.0 }, flightTimeMs: 8000 },
      { id: 'unit-02', position: { lat: 44.5, lon: 26.2 }, flightTimeMs: 12000 },
    ],
  });
  // Should select unit-01 (shorter flight time), fire timing = 30000 - 8000 = 22000ms
  expect(result.selectedUnit).toBe('unit-01');
  expect(result.fireTimingMs).toBe(22000);
});
```

### 13.2 Nearest SkyNet Selection

```typescript
it('selects SkyNet unit with smallest net_flight_time to intercept zone', () => { /* ... */ });
it('returns NO_UNIT_AVAILABLE when no SkyNet unit can reach impact zone in time', () => { /* ... */ });
it('confidence gate: does not activate if MonteCarlo impact zone confidence < 0.85', () => { /* ... */ });
```

### 13.3 Integration with MonteCarloPropagator

```typescript
it('uses MonteCarloPropagator impact zone center as intercept target', () => { /* ... */ });
it('uses MonteCarloPropagator timeToImpact as fire timing input', () => { /* ... */ });
```

Total: 10 tests

---

## 14. FR-W7-09: TdoaSolver Coordinate Injection Tests

### 14.1 No Hardcoded Coordinates

```typescript
it('SentinelPipeline does not contain literal 51.5 or 4.9 coordinate values', () => {
  // Static analysis test — reads the source file and asserts no hardcoded coords
  const source = readFileSync('src/pipeline/sentinel-pipeline.ts', 'utf-8');
  expect(source).not.toContain('51.5');
  expect(source).not.toContain('4.9');
});
```

### 14.2 Parameterized Coordinates

```typescript
it('TdoaSolver uses observer positions from node registry, not hardcoded values', () => {
  const customObservers = [
    { id: 'node-1', lat: 44.4268, lon: 26.1025 },  // Bucharest coordinates
    { id: 'node-2', lat: 44.4350, lon: 26.1200 },
  ];
  const pipeline = new SentinelPipeline({ observers: customObservers });
  const result = await pipeline.processAudioFrame(mockFrame);
  // Verify TdoaSolver was called with Bucharest coordinates
  expect(mockTdoaSolver.lastCallObservers[0].lat).toBeCloseTo(44.4268, 3);
});

it('SentinelPipeline throws ConfigurationError when observers array is empty', () => { /* ... */ });
it('SentinelPipeline throws ConfigurationError when observers array has < 2 entries for TdoaSolver', () => { /* ... */ });
```

Total: 8 tests

---

## 15. FR-W7-10: Demo Dashboard Tests

### 15.1 Track Rendering

```typescript
it('renders drone track marker on heatmap when threat event arrives via NATS', async () => {
  render(<DemoDashboard natsClient={mockNatsClient} />);
  mockNatsClient.emit('sentinel.track.update', mockThreatEvent);
  await waitFor(() => {
    expect(screen.getByTestId('track-marker-threat-001')).toBeInTheDocument();
  });
});
```

### 15.2 Alert Log

```typescript
it('alert log displays last 50 events', async () => {
  render(<DemoDashboard natsClient={mockNatsClient} />);
  // Inject 60 events
  for (let i = 0; i < 60; i++) mockNatsClient.emit('sentinel.alert', mockAlert(i));
  await waitFor(() => {
    const rows = screen.getAllByTestId('alert-row');
    expect(rows).toHaveLength(50); // capped at 50
  });
});
```

### 15.3 Heatmap Update

```typescript
it('heatmap cell updates when new detection event in that grid cell arrives', () => { /* ... */ });
it('heatmap does not show cells with < 3 events (k-anonymity threshold)', () => { /* ... */ });
```

### 15.4 Operator Authentication

```typescript
it('redirects to login when no session token present', () => { /* ... */ });
it('demo mode anonymizes track classification labels', () => { /* ... */ });
it('demo mode does not show node positions', () => { /* ... */ });
```

Total: 7 tests

---

## 16. Vitest Configuration — W7 Additions

```typescript
// vitest.config.ts — W7 additions
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/**/*.test.ts',
      'tests/dashboard/**/*.test.tsx',  // NEW: React component tests
    ],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.d.ts',
        'src/types/**',
        'src/hardware/drivers/**',      // hardware driver shims excluded
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  // W7 additions for React component tests
  plugins: [react()],
});
```

---

## 17. CI Pipeline Gates — W7

```yaml
# .github/workflows/ci.yml — W7 gates
name: APEX-SENTINEL CI

jobs:
  test:
    steps:
      - name: TypeScript check
        run: npx tsc --noEmit

      - name: ESLint (includes 16kHz enforcement rule)
        run: npx eslint src/ --rule 'no-literal-22050: error'

      - name: Unit + Component + Integration tests
        run: npx vitest run --coverage
        # Must pass: 906+ tests, ≥80% all coverage metrics

      - name: Per-profile recall gates (FR-W7-11)
        run: npx vitest run tests/ml/FR-W7-11-simpsons-paradox-audit.test.ts
        # Must pass: shahed-238 recall>=0.97, shahed-136/131 recall>=0.95,
        #            gerbera recall>=0.93, fpv-quad recall>=0.90

      - name: Consistency oracle regression gate (FR-W7-12)
        run: npx vitest run tests/ml/consistency-oracle.test.ts
        # Must pass: no label flip, no confidence delta >0.05 vs snapshot

      - name: Adversarial robustness gate (FR-W7-13)
        run: npx vitest run tests/adversarial/
        # Must pass: all 44 AT tests, no unhandled exceptions

      - name: Chaos engineering gate (FR-W7-14)
        run: npx vitest run tests/chaos/
        # Must pass: all 58 CE tests, graceful degradation confirmed

      - name: No hardcoded coordinates check
        run: |
          grep -r "51\.5\|4\.9" src/pipeline/ && exit 1 || echo "OK"

      - name: Build check
        run: npm run build
```

---

## 18. ML-Specific Testing Extensions

> Source: "Artificial Intelligence and Software Testing" (BCS, 2022)
> Applied to APEX-SENTINEL W7 by REVIEWER 2, 2026-03-25

### 18.1 Why Conventional Testing Is Insufficient for ML Components

Standard branch coverage metrics cannot detect ML-specific failure modes:

- A classifier achieving 99% accuracy by always predicting the majority class passes every conventional gate.
- Oracle absence: for new threat profiles (gerbera, shahed-238) there is no pre-labelled ground truth usable in a unit test assertion.
- Distribution shift: a model that works on training-distribution inputs silently degrades when field audio characteristics change.

Three complementary ML testing strategies close these gaps:

### 18.2 Metamorphic Testing

Metamorphic testing replaces the missing oracle with testable input-output relations (Metamorphic Relations, MRs).

**Priority MRs for W7:**

| MR | Name | Transformation | Expected Relation |
|---|---|---|---|
| MR-01 | Noise Invariance | Add white noise at SNR=20dB | Same label; confidence non-increasing |
| MR-03 | SNR Monotonicity | Decrease SNR 30→10dB | Confidence decreases monotonically |
| MR-04 | Profile Separation | Gerbera vs shahed-238 inputs | Labels always differ |
| MR-06 | Silence Oracle | Replace all samples with zeros | Zero detections, label='silence' |
| MR-10 | Sample Rate Boundary | Pass 22050Hz audio as 16kHz | SampleRateMismatchError thrown |
| MR-12 | Temporal Consistency | Consecutive 975ms windows | Labels stable across 5+ consecutive windows |

Full MR catalogue (MR-02, MR-05, MR-07–MR-09, MR-11) documented in `docs/analysis/AI-TESTING-BOOK-IMPLEMENTATION.md §4`.

**Test file:** `tests/ml/FR-W7-12-metamorphic-relations.test.ts` — 24 tests

**Helper required:** `tests/helpers/synthetic-audio-factory.ts` — generates piston drone, turbine drone, silence, noisy variants for MR inputs.

### 18.3 Consistency Oracle

A snapshot-based regression oracle commits expected outputs for canonical synthetic inputs. On each CI run, any label flip or confidence delta > 0.05 fails the build.

Snapshot file: `tests/helpers/consistency-oracle-snapshot.json`
Test file: `tests/ml/consistency-oracle.test.ts` — 18 tests

### 18.4 Per-Profile Recall Gates

Coverage aggregate metrics are replaced by per-profile recall gates as primary CI quality indicators.

| Profile | Recall Gate | FNR Ceiling | Notes |
|---|---|---|---|
| shahed-238 | ≥ 0.97 | ≤ 0.03 | Turbine = highest damage class, suppressionImmune |
| shahed-136 | ≥ 0.95 | ≤ 0.05 | Primary loitering munition |
| shahed-131 | ≥ 0.95 | ≤ 0.05 | Higher RPM piston variant |
| gerbera | ≥ 0.93 | ≤ 0.07 | Distinct piston band |
| fpv-quad | ≥ 0.90 | ≤ 0.10 | Lower damage class |

Simpson's Paradox audit: per-subgroup (day/night/urban/rural) recall computed independently. Aggregate recall passing does not satisfy these gates.

**Test file:** `tests/ml/FR-W7-11-simpsons-paradox-audit.test.ts` — 12 tests

### 18.5 SpectralAnalysis energyBands Fix

The turbine band is missing from W6 `SpectralAnalysis.energyBands`. This blocks FR-W7-02 AC-04. Required fix before execute phase:

```typescript
// Add to src/ml/spectral-analysis.ts ENERGY_BANDS:
turbine: [3000, 8000],  // shahed-238 micro-turbine KJ66 class
```

### 18.6 FalsePositiveGuardV2 Interface

shahed-238 must bypass FP suppression even at borderline confidence (FN cost is mission-critical).

```typescript
// Interface addition required in src/ml/false-positive-guard.ts:
suppressionImmune: boolean;  // true for shahed-238 only
```

---

## 19. Chaos Engineering Test Plan

Chaos tests deliberately inject hardware, network, and operational failures to verify graceful degradation. All chaos tests use mocks — no real hardware or network calls.

| CE # | Scenario | Assertion |
|---|---|---|
| CE-01 | Node drops mid-triangulation | BearingTriangulator continues with n-1 nodes, result marked DEGRADED |
| CE-02 | NATS partition for 5s | Pipeline queues ≤100 events, delivers all on reconnect |
| CE-03 | Node timestamp skew > 200ms | TdoaSolver flags DEGRADED, does not produce corrupted position |
| CE-04 | ONNX model file missing/corrupt | EdgeDeployer falls back to YAMNetSurrogate, logs WARNING |
| CE-05 | Audio input sample rate drifts from 16000 to 16050Hz | DatasetPipelineV2 raises DriftWarning |
| CE-06 | RPi4 vs Jetson spectrogram divergence | L2 delta < 0.001 for canonical inputs |
| CE-07 | Memory pressure on audio ring buffer | Oldest frames dropped cleanly, no OOM propagation |
| CE-08 | Concept drift: KL divergence exceeds 0.15 | ConceptDriftDetector raises alert |

**Test files:** `tests/chaos/CE-01-*.test.ts` through `CE-08-*.test.ts` — 58 tests total

**ConceptDriftDetector** interface: `src/ml/drift-detector.ts` — monitors rolling KL divergence between current input distribution and training baseline. Alert threshold: 0.15 over 7-day window.

**EdgeDeployer hardware regression gate** (CE-06): RPi4 and Jetson produce different floating-point results for ARM NEON vs CUDA spectrogram computation. The gate uses mocked deployers with pre-recorded outputs. Any L2 delta > 0.001 fails the build, forcing explicit acknowledgement of hardware divergence.

---

## 20. Adversarial Robustness Testing

Adversarial tests probe the classifier with inputs designed to expose brittleness at decision boundaries and sensitivity to real-world interference.

| AT # | Pattern | Threat | Expected Behaviour |
|---|---|---|---|
| AT-01 | Near-boundary frequency | Input at 1999Hz vs 2001Hz routing threshold | Correct branch assignment on both sides |
| AT-02 | Adversarial bird call | Harmonics in 300–400Hz (Shahed-136 piston band) | Does NOT trigger CRITICAL alert |
| AT-03 | Replay attack | Identical audio > 3 times in < 10s | FalsePositiveGuard suppresses after 2nd activation |
| AT-04 | Spectral masking | High-amplitude noise at exact profile frequencies | Graceful confidence drop, not wrong label |
| AT-05 | Sample rate confusion | 22050Hz audio passed as 16kHz | SampleRateMismatchError before classifier |
| AT-06 | Boundary probing | Frequency sweep 1000–3000Hz | At most 1 label transition at 2000Hz |

**Test files:** `tests/adversarial/AT-01-*.test.ts` through `AT-06-*.test.ts` — 44 tests total

**Key rule:** No adversarial input may cause an unhandled exception. All failures must be typed errors (`SampleRateMismatchError`, `ClassificationDegradedError`) or graceful reduction in confidence — never a crash or silent wrong output.

---

## 21. Updated Coverage Gate Policy

### Previous policy (W6)

Single aggregate gate: ≥80% statements/branches/functions/lines.

### W7 policy (updated)

Two-tier gate. BOTH must pass for merge:

**Tier 1 — Aggregate coverage (unchanged):**
```
statements: 80%
branches:   80%
functions:  80%
lines:      80%
```

**Tier 2 — Per-profile recall gates (NEW, FR-W7-11):**
```
shahed-238:  recall >= 0.97  (FNR <= 0.03)
shahed-136:  recall >= 0.95  (FNR <= 0.05)
shahed-131:  recall >= 0.95  (FNR <= 0.05)
gerbera:     recall >= 0.93  (FNR <= 0.07)
fpv-quad:    recall >= 0.90  (FNR <= 0.10)
```

**Tier 3 — Oracle gates (NEW, FR-W7-12):**
```
Consistency oracle: zero label regressions vs committed snapshot
MR-06 (silence):    zero detections on silence input (hard gate, no tolerance)
```

Failing Tier 1 while passing Tier 2/3 is a build failure. Failing Tier 2 while passing Tier 1 is also a build failure. Both tiers are required.

The rationale: aggregate 80% coverage on a classifier that always predicts `fpv-quad` would pass Tier 1 but fail Tier 2 (shahed-238 recall = 0). Tier 2 makes this failure visible in CI before it reaches the field.

---

*End of TEST_STRATEGY.md — W7 (updated with AI testing book extensions)*
