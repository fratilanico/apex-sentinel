# APEX-SENTINEL — IMPLEMENTATION_PLAN.md
## Wave 7: Hardware Integration + Data Pipeline Rectification + Terminal Phase
### Project: APEX-SENTINEL | Version: 7.0.0
### Date: 2026-03-25 | Status: PLANNED | Author: Wave-Formation Engine

---

## 1. WAVE OVERVIEW

W7 closes the gap between the simulation-quality detection engine built in W1-W6 and field-deployable hardware integration. Three strategic objectives drive this wave:

1. **Data pipeline rectification** — Fix the 22050Hz → 16kHz sample-rate mismatch confirmed by INDIGO team. This is a data-breach-level error: models trained at 22050Hz will not transfer to 16kHz hardware. Every subsequent wave depends on correct sample rates.
2. **Terminal phase detection** — Add the FSM that transitions a track from CRUISE to TERMINAL, combining acoustic speed/heading lock, EKF state, and RF link silence. This enables pre-emptive interception rather than reactive response.
3. **Hardware output layer** — PTZ camera slaving, jammer channel activation, and SkyNet net-gun pre-positioning. These are the physical-world effectors the system drives.

---

## 2. PHASE STRUCTURE AND SEQUENCING

The 10 FRs are organised into 5 sequential phases. No phase may begin until all P0 blockers in the previous phase are DONE.

```
Phase 1 (P0 data fix)      │ FR-W7-01 + FR-W7-02
Phase 2 (detection chain)  │ FR-W7-03 + FR-W7-04
Phase 3 (fusion)           │ FR-W7-05 + FR-W7-09  (can run in parallel with Phase 2)
Phase 4 (hardware output)  │ FR-W7-06 + FR-W7-07 + FR-W7-08
Phase 5 (UI)               │ FR-W7-10
```

Phase 3 is data-path independent from Phase 2. They may be developed concurrently by separate engineers, but Phase 4 depends on BOTH Phases 2 and 3 being complete.

---

## 3. PHASE 1 — DATA PIPELINE RECTIFICATION (P0 BLOCKER)

### Why Phase 1 is P0

The W6 DatasetPipeline was confirmed to operate at 22050Hz. INDIGO team field hardware runs at 16kHz. Mel-spectrogram features computed at 22050Hz are incompatible with 16kHz recordings — the frequency bin mapping is different, the mel filter bank range differs, and any ONNX model exported at 22050Hz will misclassify 16kHz input. This is not a performance degradation; it is a category error.

**All W7 FRs depend on Phase 1 being complete before integration tests are written.**

---

### FR-W7-01 — DatasetPipeline 16kHz Migration

**Priority:** P0
**Blocks:** FR-W7-02, FR-W7-03, FR-W7-04, FR-W7-06, FR-W7-07, FR-W7-08
**Estimated test count:** 22

#### Source Files

| File | Action |
|------|--------|
| `src/ml/dataset-pipeline.ts` | Modify: change TARGET_SAMPLE_RATE constant from 22050 to 16000 |
| `src/ml/dataset-pipeline-v2.ts` | New: W7 version with explicit sampleRate config field |
| `src/ml/audio-resampler.ts` | New: linear interpolation resampler (22050→16000 for legacy fixtures) |

#### Test File

`__tests__/ml/dataset-pipeline-v2.test.ts`

#### Interface Definitions

```typescript
// src/ml/dataset-pipeline-v2.ts

export const TARGET_SAMPLE_RATE = 16000; // was 22050 in W6 — INDIGO team confirmed 16kHz

export interface DatasetPipelineV2Config {
  targetSampleRate: number;     // must be 16000 for W7+
  windowSizeMs: number;         // default 2000ms
  hopSizeMs: number;            // default 500ms
  melBins: number;              // default 128
  fMin: number;                 // default 80 Hz
  fMax: number;                 // default 8000 Hz — captures turbine range for Shahed-238
}

export interface DatasetItemV2 {
  id: string;
  label: string;
  sampleRate: number;           // must equal targetSampleRate or item is rejected
  pcmData: Float32Array;
  durationMs: number;
  source: 'field' | 'synthetic' | 'augmented';
  augmented: boolean;
  recordedAt: string;           // ISO8601
}

export interface ResampleResult {
  originalSampleRate: number;
  targetSampleRate: number;
  inputSamples: number;
  outputSamples: number;
  processingTimeMs: number;
}
```

#### Acceptance Criteria (6 minimum)
1. `TARGET_SAMPLE_RATE` export equals 16000
2. `ingest()` rejects items where `sampleRate !== 16000` with `SampleRateMismatchError`
3. `AudioResampler.resample(pcm, 22050, 16000)` produces output with length ratio ≈ 16000/22050
4. Resampled audio has no DC offset artefact (mean < 1e-4)
5. Mel spectrogram frequency bins match 16kHz Nyquist (max usable bin = 8kHz)
6. Existing W6 fixtures at 22050Hz can be batch-converted via `AudioResampler` before ingest
7. `split()` remains deterministic after migration (same djb2 hash, same splits)

#### Legacy Fixture Migration Script

```
scripts/migrate-fixtures-16khz.ts

Purpose: bulk-resample all test WAV fixtures from 22050→16000
Run once before W7 test suite. Output: __fixtures__/audio-16khz/
```

#### Estimated Tests

| Test Group | Count |
|------------|-------|
| TARGET_SAMPLE_RATE constant | 2 |
| SampleRateMismatchError on ingest | 3 |
| AudioResampler unit tests | 8 |
| Mel spectrogram bin mapping | 4 |
| Split determinism post-migration | 3 |
| Augmentation preserves 16kHz | 2 |
| **Total** | **22** |

---

### FR-W7-02 — AcousticProfileLibrary + New Threat Profiles

**Priority:** P0
**Depends on:** FR-W7-01 (correct sample rate for profile frequency annotations)
**Blocks:** FR-W7-03, FR-W7-07
**Estimated test count:** 28

#### Background

Three profiles are missing from W6's AcousticProfileLibrary, confirmed as gaps by INDIGO:

- **Gerbera** — Russian kamikaze drone with piston engine. Heavier than Shahed-136, different fundamental frequency range (~80-180Hz), slower RPM, stronger low-frequency components.
- **Shahed-131** — Smaller piston-engine variant. Higher RPM than Shahed-136, fundamental ~150-400Hz. Often confused with Shahed-136 due to engine similarity; separate model required.
- **Shahed-238** — Turbine-powered variant. Completely different acoustic class — dominant 3000-8000Hz turbine whine, minimal low-frequency content. Requires separate YAMNet model class, not a variant of the piston class.

The Shahed-238 distinction is critical: the W6 model's mel filter bank and piston-tuned features are not appropriate for a turbine. A separate `turbine` model class is required.

#### Source Files

| File | Action |
|------|--------|
| `src/ml/acoustic-profile-library.ts` | Modify: add gerbera, shahed-131, shahed-238 profiles |
| `src/ml/drone-model-classes.ts` | New: discriminate piston vs turbine model class |

#### Interface Definitions

```typescript
// src/ml/acoustic-profile-library.ts additions

export type DroneModelClass = 'piston' | 'turbine' | 'electric' | 'unknown';

export interface AcousticProfile {
  id: string;
  name: string;
  modelClass: DroneModelClass;          // NEW in W7
  fundamentalFreqMin: number;           // Hz
  fundamentalFreqMax: number;           // Hz
  dominantFreqMin: number;              // Hz — for turbines differs greatly from fundamental
  dominantFreqMax: number;              // Hz
  typicalRpmRange: [number, number];
  falsePositiveRisk: 'low' | 'medium' | 'high';
  fpRiskNotes: string;
  sampleRateHz: number;                 // must be 16000 in W7+
  description: string;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  requiresSeparateModel: boolean;       // true for turbine class
}

// Gerbera profile (add to seed profiles)
export const GERBERA_PROFILE: AcousticProfile = {
  id: 'gerbera',
  name: 'Gerbera Kamikaze UAV',
  modelClass: 'piston',
  fundamentalFreqMin: 80,
  fundamentalFreqMax: 180,
  dominantFreqMin: 80,
  dominantFreqMax: 500,
  typicalRpmRange: [1800, 3500],
  falsePositiveRisk: 'medium',
  fpRiskNotes: 'Heavier motorcycle engines can match at idle; use Doppler and altitude gating',
  sampleRateHz: 16000,
  description: 'Russian piston-engine kamikaze drone, heavier than Shahed-136',
  threatLevel: 'critical',
  requiresSeparateModel: false,         // shares piston model class with Shahed-136
};

// Shahed-131 profile
export const SHAHED_131_PROFILE: AcousticProfile = {
  id: 'shahed-131',
  name: 'Shahed-131 (Smaller Piston Variant)',
  modelClass: 'piston',
  fundamentalFreqMin: 150,
  fundamentalFreqMax: 400,
  dominantFreqMin: 150,
  dominantFreqMax: 1200,
  typicalRpmRange: [3000, 6000],
  falsePositiveRisk: 'high',
  fpRiskNotes: 'Easy confusion with Shahed-136; higher RPM is distinguishing feature; needs Doppler speed gate',
  sampleRateHz: 16000,
  description: 'Smaller piston-engine Shahed variant, higher RPM than Shahed-136',
  threatLevel: 'critical',
  requiresSeparateModel: false,
};

// Shahed-238 profile — TURBINE — completely separate model class
export const SHAHED_238_PROFILE: AcousticProfile = {
  id: 'shahed-238',
  name: 'Shahed-238 (Turbine)',
  modelClass: 'turbine',
  fundamentalFreqMin: 3000,
  fundamentalFreqMax: 8000,
  dominantFreqMin: 3000,
  dominantFreqMax: 8000,
  typicalRpmRange: [50000, 120000],     // turbine RPM
  falsePositiveRisk: 'low',
  fpRiskNotes: 'Turbine signature is distinctive; low FP risk from ground vehicles',
  sampleRateHz: 16000,
  description: 'Turbine-powered Shahed variant — 3-8kHz dominant; requires separate model class',
  threatLevel: 'critical',
  requiresSeparateModel: true,          // separate ONNX model required
};
```

#### Test File

`__tests__/ml/acoustic-profile-library-v2.test.ts`

#### Estimated Tests

| Test Group | Count |
|------------|-------|
| Gerbera profile correctness | 5 |
| Shahed-131 profile correctness | 5 |
| Shahed-238 profile correctness + turbine class | 6 |
| matchFrequency returns turbine vs piston correctly | 4 |
| requiresSeparateModel flag behaviour | 3 |
| sampleRateHz = 16000 on all W7 profiles | 2 |
| Backwards compatibility (W6 profiles still present) | 3 |
| **Total** | **28** |

---

## 4. PHASE 2 — DETECTION CHAIN

### FR-W7-03 — TerminalPhaseDetector

**Priority:** P0
**Depends on:** FR-W7-01 (acoustic correctness), FR-W7-04 (rfSilent flag)
**Estimated test count:** 26

#### Source Files

| File | Action |
|------|--------|
| `src/tracking/terminal-phase-detector.ts` | New |
| `src/tracking/types.ts` | Modify: add TerminalPhaseState, TerminalPhaseIndicators |

#### Interface Definitions

```typescript
// src/tracking/terminal-phase-detector.ts

export type TerminalPhaseState = 'CRUISE' | 'APPROACH' | 'TERMINAL' | 'IMPACT';

export interface TerminalPhaseIndicators {
  speedExceedsThreshold: boolean;    // EKF vLat^2 + vLon^2 > threshold (default 35 m/s)
  headingLockedToTarget: boolean;    // heading variance < 8° over last 10 EKF updates
  altitudeDescentRate: boolean;      // vAlt < -2.0 m/s (descending) and alt < 500m AGL
  rfLinkSilent: boolean;             // from ElrsRfFingerprint: loss > 0.8 for >= 2s
}

export interface TerminalPhaseTransition {
  fromState: TerminalPhaseState;
  toState: TerminalPhaseState;
  triggeredBy: keyof TerminalPhaseIndicators | 'timeout' | 'manual';
  transitionedAt: number;            // unix ms
  indicators: TerminalPhaseIndicators;
}

export interface TerminalPhaseResult {
  trackId: string;
  currentState: TerminalPhaseState;
  indicators: TerminalPhaseIndicators;
  lastTransition: TerminalPhaseTransition | null;
  timeInStateMs: number;
  confidence: number;                // 0-1, derived from indicator agreement
}

export interface TerminalPhaseConfig {
  speedThresholdMs: number;          // default 35 m/s
  headingVarianceDeg: number;        // default 8 degrees
  descentRateMs: number;             // default -2.0 m/s
  rfSilenceDurationMs: number;       // default 2000ms
  approachAltitudeM: number;         // default 500m AGL — below this, APPROACH eligible
  terminalAltitudeM: number;         // default 200m AGL — below this, TERMINAL eligible
}
```

#### FSM Transition Rules

```
CRUISE
  → APPROACH when: (speedExceedsThreshold OR headingLockedToTarget) AND alt < approachAltitudeM
  → TERMINAL direct skip: if rfLinkSilent AND altitudeDescentRate AND alt < terminalAltitudeM

APPROACH
  → TERMINAL when: (rfLinkSilent AND altitudeDescentRate) OR (all 4 indicators true)
  → CRUISE when: headingLocked becomes false AND speed drops below threshold (aborted attack)

TERMINAL
  → IMPACT when: alt < 50m AGL (estimated, from EKF)
  → APPROACH when: rfLinkSilent becomes false AND altitude stabilises (abort/loiter)

IMPACT
  → terminal state, no further transitions
```

#### Test File

`__tests__/tracking/terminal-phase-detector.test.ts`

#### Estimated Tests

| Test Group | Count |
|------------|-------|
| CRUISE→APPROACH transitions | 5 |
| APPROACH→TERMINAL transitions | 5 |
| TERMINAL→IMPACT | 3 |
| Abort/loiter transitions (TERMINAL→APPROACH) | 3 |
| Indicator computation from EKF state | 5 |
| Confidence calculation | 3 |
| rfSilent propagation from ElrsRfFingerprint | 2 |
| **Total** | **26** |

---

### FR-W7-04 — ElrsRfFingerprint

**Priority:** P0
**Depends on:** None (can start in parallel with FR-W7-01)
**Estimated test count:** 24

#### Background

ELRS (ExpressLRS) uses FHSS (Frequency Hopping Spread Spectrum) on 868MHz (EU) or 915MHz (US). The Foxeer TRX1003 is a confirmed ELRS receiver used in Russian FPV drones. FHSS bursts have characteristic inter-packet timing (typically 2ms at 500Hz packet rate, 4ms at 250Hz). When the drone enters terminal phase, the operator's RC link is either cut (autonomous) or jammed by Ukrainian EW, producing `rfSilent=true`.

The component must distinguish ELRS bursts from urban 900MHz noise (GSM, LoRaWAN, Sigfox) by checking the burst interval regularity — ELRS has highly regular timing, GSM/LoRa does not.

#### Source Files

| File | Action |
|------|--------|
| `src/rf/elrs-rf-fingerprint.ts` | New |
| `src/rf/types.ts` | Modify: add ElrsDetection, RfSilentEvent |

#### Interface Definitions

```typescript
// src/rf/elrs-rf-fingerprint.ts

export interface ElrsBurstObservation {
  timestampMs: number;
  frequencyMHz: number;              // 868 or 915
  rssiDbm: number;
  burstDurationUs: number;           // microseconds
}

export interface ElrsPacketStats {
  observedPackets: number;
  expectedPackets: number;           // based on detected packet rate
  packetLossRate: number;            // 0-1
  meanIntervalMs: number;
  intervalStdDevMs: number;          // low = ELRS-like regularity
  detectedPacketRateHz: number;      // 50 | 150 | 250 | 500 Hz ELRS modes
  isElrsLike: boolean;               // regularity + frequency + burst duration criteria
}

export interface RfSilentEvent {
  trackId: string;
  rfSilent: boolean;
  packetLossRate: number;
  silenceDurationMs: number;
  triggeredAt: number;               // unix ms
  frequencyBandMHz: number;
}

export interface ElrsRfFingerprintConfig {
  monitorFrequenciesMHz: number[];   // default [868, 915]
  packetLossThreshold: number;       // default 0.8 — above this → rfSilent
  silenceDurationThresholdMs: number; // default 2000
  regularityMaxStdDevMs: number;     // default 0.5ms — above this = not ELRS
  windowSizePackets: number;         // default 50 packets for stats
}
```

#### Test File

`__tests__/rf/elrs-rf-fingerprint.test.ts`

#### Estimated Tests

| Test Group | Count |
|------------|-------|
| ELRS burst pattern detection (regular interval) | 5 |
| Non-ELRS noise rejection (irregular intervals) | 4 |
| Packet loss rate calculation | 4 |
| rfSilent=true emission at 2s silence | 4 |
| rfSilent=false when link resumes | 3 |
| 868MHz vs 915MHz band | 2 |
| Edge: zero observations window | 2 |
| **Total** | **24** |

---

## 5. PHASE 3 — FUSION (PARALLEL WITH PHASE 2)

### FR-W7-05 — BearingTriangulator

**Priority:** P0
**Depends on:** None (standalone geometry module)
**Estimated test count:** 24

#### Source Files

| File | Action |
|------|--------|
| `src/fusion/bearing-triangulator.ts` | New |
| `src/fusion/types.ts` | Modify: add BearingReport, TriangulationResult |

#### Interface Definitions

```typescript
// src/fusion/bearing-triangulator.ts

export interface BearingReport {
  nodeId: string;
  lat: number;
  lon: number;
  bearingDeg: number;            // 0-360, true north
  accuracyDeg: number;           // 1σ uncertainty in degrees
  timestampMs: number;
  source: 'fixed-node' | 'mobile-phone' | 'radar';
  weight?: number;               // override: fixed-node gets 1.0, mobile-phone 0.4
}

export interface TriangulationResult {
  lat: number;
  lon: number;
  confidenceM: number;           // estimated 1σ position error in metres
  reportCount: number;
  gdop: number;                  // geometric dilution of precision
  degenerate: boolean;           // true when collinear case detected
  degenerateReason?: string;
  usedReports: string[];         // nodeIds that contributed to solution
  rejectedReports: string[];     // nodeIds rejected (outlier or collinear)
  processingTimeMs: number;
}
```

#### Algorithm

Least-squares bearing intersection using weighted Stansfield method:
1. Convert each (lat, lon, bearing) to a line in local ENU coordinates
2. Build normal equation matrix A and vector b
3. Solve A^T W A x = A^T W b (W = weight matrix from accuracyDeg)
4. Check condition number of A^T W A — if > 1e6, mark as degenerate
5. Back-project solution to lat/lon
6. Compute residuals per report, reject outliers > 2σ, re-solve

Collinear degenerate case: all node bearings point in the same direction (cross product of direction vectors < 1e-6). Return `degenerate: true`, `confidenceM: Infinity`.

Mobile phone bearing weight: fixed at 0.4 (±5° compass accuracy vs ±1° fixed acoustic node bearing). This prevents phone bearings from dominating the solution.

#### Test File

`__tests__/fusion/bearing-triangulator.test.ts`

#### Estimated Tests

| Test Group | Count |
|------------|-------|
| 3-report basic intersection | 4 |
| Weighted fusion (mobile vs fixed) | 4 |
| Collinear degenerate case | 3 |
| Outlier rejection | 4 |
| Single report (no intersection) | 2 |
| 6-report overdetermined | 3 |
| confidenceM degrades with poor geometry | 3 |
| GDOP calculation | 1 |
| **Total** | **24** |

---

### FR-W7-09 — SentinelPipelineV2 (TdoaSolver Coordinate Injection)

**Priority:** P0
**Depends on:** FR-W7-05 (BearingTriangulator types)
**Estimated test count:** 18

#### Background

W6's SentinelPipeline contained a hardcoded position `{lat: 51.5, lon: 4.9}` used as a fallback when TdoaSolver could not converge. This is wrong in production — it places all unresolved tracks on a fixed point in the Netherlands. W7 must inject `TdoaSolver.solve()` properly so the pipeline returns `null` or a real position, never a hardcoded placeholder.

#### Source Files

| File | Action |
|------|--------|
| `src/pipeline/sentinel-pipeline-v2.ts` | New: replaces sentinel-pipeline.ts |
| `src/pipeline/sentinel-pipeline.ts` | Deprecate: add @deprecated JSDoc, redirect to v2 |

#### Interface Definitions

```typescript
// src/pipeline/sentinel-pipeline-v2.ts

export interface SentinelPipelineV2Config {
  tdoaConfig: TdoaSolverConfig;
  bearingConfig: BearingTriangulatorConfig;
  ekfConfig: EKFConfig;
  fusionStrategy: 'tdoa-primary' | 'bearing-primary' | 'weighted-average';
  // fusionStrategy 'weighted-average': position = tdoa * tdoaConfidence + bearing * bearingConfidence
}

export interface PipelinePositionResult {
  lat: number | null;              // null if no convergent solution
  lon: number | null;
  source: 'tdoa' | 'bearing' | 'fused' | null;
  confidenceM: number | null;
  fallbackUsed: false;             // NEVER true — no hardcoded fallback in V2
}
```

#### Test File

`__tests__/integration/sentinel-pipeline-v2.test.ts`

#### Estimated Tests

| Test Group | Count |
|------------|-------|
| TdoaSolver.solve() called (not hardcoded lat/lon) | 4 |
| Null returned when TDOA cannot converge | 3 |
| BearingTriangulator used as fusion source | 4 |
| Weighted average fusion strategy | 4 |
| fallbackUsed is always false | 3 |
| **Total** | **18** |

---

## 6. PHASE 4 — HARDWARE OUTPUT LAYER

Phase 4 depends on: Phase 1 (correct acoustic data), Phase 2 (TerminalPhaseDetector + rfSilent), Phase 3 (BearingTriangulator + SentinelPipelineV2).

### FR-W7-06 — PtzSlaveOutput

**Priority:** P1
**Depends on:** FR-W7-03, FR-W7-05, FR-W7-09
**Estimated test count:** 22

#### Background

Dahua PTZ cameras support ONVIF Profile S, which includes `RelativeMove` and `AbsoluteMove` PTZ commands over HTTP/SOAP. W7 implements `RelativeMove` as primary (less latency for tracking), with `AbsoluteMove` fallback for firmware versions that reject RelativeMove.

The PTZ output publishes at 100Hz using the EKF predicted state at t+8ms (one camera servo response latency ahead of current state). This requires the PTZ output loop to consume from MultiTrackEKFManager's predicted state, not the raw track position.

#### Source Files

| File | Action |
|------|--------|
| `src/output/ptz-slave-output.ts` | New |
| `src/output/onvif-client.ts` | New: ONVIF SOAP client (mock-injectable) |

#### Interface Definitions

```typescript
// src/output/ptz-slave-output.ts

export interface OnvifPtzConfig {
  cameraIp: string;
  cameraPort: number;              // default 80
  username: string;
  password: string;
  profileToken: string;            // ONVIF profile token (usually 'Profile_1')
  moveMode: 'relative' | 'absolute'; // default 'relative'
  publishRateHz: number;           // default 100
  bearingLeadTimeMs: number;       // default 8ms — EKF lookahead
}

export interface PtzBearingCommand {
  trackId: string;
  bearingDeg: number;              // 0-360, true north
  elevationDeg: number;            // 0-90, positive = up
  panSpeedNorm: number;            // 0-1 normalised ONVIF speed
  tiltSpeedNorm: number;
  predictedAt: number;             // unix ms of predicted state
  commandId: string;
}

export interface OnvifRelativeMovePayload {
  // ONVIF PTZ RelativeMove XML schema
  profileToken: string;
  translation: {
    panTilt: { x: number; y: number; space: string };
    zoom: { x: number; space: string };
  };
  speed: {
    panTilt: { x: number; y: number };
    zoom: { x: number };
  };
}
```

#### NATS Subject

Publishes to: `PTZ_BEARING` (JetStream, QoS: at-most-once for real-time bearing, no redelivery)

#### Test File

`__tests__/output/ptz-slave-output.test.ts`

#### Estimated Tests

| Test Group | Count |
|------------|-------|
| RelativeMove SOAP payload construction | 5 |
| AbsoluteMove fallback on RelativeMove rejection | 4 |
| 100Hz publish rate (mock timer) | 3 |
| EKF t+8ms prediction lead | 3 |
| NATS PTZ_BEARING publish | 3 |
| Error: camera unreachable — no crash | 2 |
| bearingDeg→panTilt normalisation | 2 |
| **Total** | **22** |

---

### FR-W7-07 — JammerActivation

**Priority:** P1
**Depends on:** FR-W7-02 (drone class from AcousticProfileLibrary), FR-W7-03 (FalsePositiveGuard.isFalsePositive)
**Estimated test count:** 22

#### Source Files

| File | Action |
|------|--------|
| `src/output/jammer-activation.ts` | New |

#### Interface Definitions

```typescript
// src/output/jammer-activation.ts

export type DroneClass = 'fpv' | 'shahed-136' | 'shahed-131' | 'shahed-238' | 'gerbera' | 'lancet-3' | 'unknown';

export type JammerChannel =
  | '900MHz'     // FPV RC link (ELRS/FrSky/FlySky)
  | '1575MHz'    // GPS L1 (Shahed navigation)
  | '1227MHz'    // GPS L2
  | '2400MHz'    // Wi-Fi/FPV video (DJI OcuSync)
  | 'disabled';

export interface DroneClassChannelMap {
  fpv: '900MHz';
  'shahed-136': '1575MHz';
  'shahed-131': '1575MHz';
  'shahed-238': '1575MHz';        // turbine Shahed still uses GPS navigation
  gerbera: '1575MHz';
  'lancet-3': '900MHz';           // FPV loitering munition
  unknown: 'disabled';            // never jam on unconfirmed classification
}

export interface JammerCommand {
  commandId: string;
  trackId: string;
  droneClass: DroneClass;
  channel: JammerChannel;
  activateAt: number;             // unix ms
  durationMs: number;             // default 30000 (30s burst)
  confidenceGate: number;         // minimum classification confidence required (default 0.85)
}

export interface JammerActivationResult {
  commandId: string;
  activated: boolean;
  suppressedReason?: 'false-positive' | 'unknown-class' | 'below-confidence' | 'already-active';
}
```

#### Critical Rules
- NEVER activate jammer when `FalsePositiveGuard.isFalsePositive === true`
- NEVER activate when `droneClass === 'unknown'` — channel would be 'disabled'
- Single active jammer command per trackId (dedup by trackId)
- All commands published to NATS `JAMMER_COMMANDS` subject

#### NATS Subject

`JAMMER_COMMANDS` (JetStream, durable consumer `jammer-controller`)

#### Test File

`__tests__/output/jammer-activation.test.ts`

#### Estimated Tests

| Test Group | Count |
|------------|-------|
| fpv → 900MHz channel mapping | 3 |
| shahed-136 → 1575MHz mapping | 3 |
| shahed-238 → 1575MHz mapping | 2 |
| No activation on isFalsePositive=true | 4 |
| No activation on unknown class | 3 |
| Confidence gate check | 3 |
| Dedup: single command per trackId | 2 |
| NATS publish to JAMMER_COMMANDS | 2 |
| **Total** | **22** |

---

### FR-W7-08 — PhysicalInterceptCoordinator

**Priority:** P1
**Depends on:** FR-W7-09 (ImpactPrediction from SentinelPipelineV2), FR-W7-06, FR-W7-07
**Estimated test count:** 22

#### Source Files

| File | Action |
|------|--------|
| `src/output/physical-intercept-coordinator.ts` | New |
| `src/output/skynet-unit-registry.ts` | New |

#### Interface Definitions

```typescript
// src/output/physical-intercept-coordinator.ts

export interface SkyNetUnit {
  unitId: string;
  lat: number;
  lon: number;
  altM: number;
  status: 'ready' | 'deployed' | 'reloading' | 'offline';
  maxRangeM: number;                 // effective net-gun range
  bearingCoverageMin: number;        // degrees
  bearingCoverageMax: number;
}

export interface SkyNetUnitRegistry {
  units: SkyNetUnit[];
  getAvailableUnits(): SkyNetUnit[];
  getNearestUnit(impactLat: number, impactLon: number): SkyNetUnit | null;
}

export interface SkyNetFireCommand {
  commandId: string;
  unitId: string;
  bearing: number;               // degrees true north
  elevationDeg: number;          // degrees above horizon
  fireAtS: number;               // unix seconds — when to fire
  trackId: string;
  impactPrediction: ImpactPrediction;
  confidenceGate: number;        // must be > 0.6 to issue
}

export interface InterceptResult {
  issued: boolean;
  command?: SkyNetFireCommand;
  rejectedReason?: 'below-confidence' | 'no-unit-in-range' | 'unit-not-ready' | 'impact-outside-coverage';
}

export interface ImpactPrediction {
  lat: number;
  lon: number;
  altM: number;
  impactTimeS: number;           // unix seconds
  confidence: number;            // 0-1, from MonteCarloPropagator
  radiusM: number;               // 1σ uncertainty radius
}
```

#### Confidence Gate

`confidence > 0.6` is the hard gate. Below this, no fire command is issued regardless of other conditions. This prevents net-gun deployment against uncertain tracks — a false intercept exposes the SkyNet unit and expends limited ammunition.

#### NATS Subject

`SKYNET_ACTIVATION` (JetStream, durable consumer `skynet-controller`)

#### Test File

`__tests__/output/physical-intercept-coordinator.test.ts`

#### Estimated Tests

| Test Group | Count |
|------------|-------|
| Fire command issued when confidence > 0.6 | 4 |
| Rejected when confidence <= 0.6 | 3 |
| Nearest unit selection from registry | 4 |
| No unit in range → rejected | 3 |
| Unit not ready → rejected | 2 |
| Fire timing calculation | 3 |
| NATS publish to SKYNET_ACTIVATION | 2 |
| Elevation calculation from geometry | 1 |
| **Total** | **22** |

---

## 7. PHASE 5 — DEMO DASHBOARD

### FR-W7-10 — DemoDashboard

**Priority:** P0 (Radisson demo blocker — must complete before other Phase 4 work)
**Depends on:** FR-W7-09 (SSE track feed), Supabase `tracks` table
**Estimated test count:** 20

#### Technology Stack

- **Framework:** Next.js 14 App Router (TypeScript)
- **Map:** Leaflet + react-leaflet, OSM tiles
- **Realtime:** Server-Sent Events (SSE) via Next.js route handler — not WebSocket (simpler for demo)
- **State:** Zustand (already used in FFMS — REUSE-FIRST)
- **Auth:** NextAuth.js operator login (username/password, bcrypt, single operator account)
- **Charts:** recharts (already in FFMS)
- **Styling:** Tailwind CSS

#### Source Files

| File | Action |
|------|--------|
| `src/dashboard/app/page.tsx` | New: main dashboard layout |
| `src/dashboard/app/api/tracks/sse/route.ts` | New: SSE endpoint |
| `src/dashboard/app/api/alerts/route.ts` | New: alert log endpoint |
| `src/dashboard/components/TrackMap.tsx` | New: Leaflet track map |
| `src/dashboard/components/AlertLog.tsx` | New: alert list |
| `src/dashboard/components/ThreatHeatmap.tsx` | New: detection density heatmap |
| `src/dashboard/components/OperatorStatus.tsx` | New: live system status |
| `src/dashboard/lib/sse-client.ts` | New: browser SSE hook |

#### Interface Definitions

```typescript
// src/dashboard/lib/types.ts

export interface DashboardTrack {
  trackId: string;
  lat: number;
  lon: number;
  altM: number;
  droneClass: string;
  confidence: number;
  terminalPhase: TerminalPhaseState;
  lastUpdateMs: number;
  impactPrediction?: ImpactPrediction;
}

export interface DashboardAlert {
  alertId: string;
  trackId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  createdAt: string;
  acknowledged: boolean;
}
```

#### Test File

`__tests__/dashboard/demo-dashboard.test.ts` (Vitest + RTL)

#### Estimated Tests

| Test Group | Count |
|------------|-------|
| SSE route: emits track update events | 4 |
| SSE route: emits on Supabase realtime insert | 3 |
| AlertLog renders correct severity colours | 3 |
| Operator auth: rejects unauthenticated | 3 |
| TrackMap: renders track markers | 3 |
| ThreatHeatmap: renders detection density | 2 |
| OperatorStatus: shows live node count | 2 |
| **Total** | **20** |

---

## 8. COMPLETE FR-TO-FILE MAPPING

| FR ID | Source File(s) | Test File | Est. Tests |
|-------|----------------|-----------|------------|
| FR-W7-01 | `src/ml/dataset-pipeline-v2.ts`, `src/ml/audio-resampler.ts` | `__tests__/ml/dataset-pipeline-v2.test.ts` | 22 |
| FR-W7-02 | `src/ml/acoustic-profile-library.ts` (modify) | `__tests__/ml/acoustic-profile-library-v2.test.ts` | 28 |
| FR-W7-03 | `src/tracking/terminal-phase-detector.ts` | `__tests__/tracking/terminal-phase-detector.test.ts` | 26 |
| FR-W7-04 | `src/rf/elrs-rf-fingerprint.ts` | `__tests__/rf/elrs-rf-fingerprint.test.ts` | 24 |
| FR-W7-05 | `src/fusion/bearing-triangulator.ts` | `__tests__/fusion/bearing-triangulator.test.ts` | 24 |
| FR-W7-06 | `src/output/ptz-slave-output.ts`, `src/output/onvif-client.ts` | `__tests__/output/ptz-slave-output.test.ts` | 22 |
| FR-W7-07 | `src/output/jammer-activation.ts` | `__tests__/output/jammer-activation.test.ts` | 22 |
| FR-W7-08 | `src/output/physical-intercept-coordinator.ts`, `src/output/skynet-unit-registry.ts` | `__tests__/output/physical-intercept-coordinator.test.ts` | 22 |
| FR-W7-09 | `src/pipeline/sentinel-pipeline-v2.ts` | `__tests__/integration/sentinel-pipeline-v2.test.ts` | 18 |
| FR-W7-10 | `src/dashboard/` (8 files) | `__tests__/dashboard/demo-dashboard.test.ts` | 20 |
| **TOTAL** | | | **228** |

---

## 9. TDD RED PHASE CHECKLIST

Before any implementation begins, all test files must exist with failing tests. The TDD RED gate:

```bash
npx vitest run --reporter=verbose 2>&1 | grep -E "(FAIL|PASS)" | sort | uniq -c
# Expected: 10 FAIL files, 0 PASS for new W7 tests
# W1-W6 tests must still PASS
```

Red phase commit message: `test(W7): TDD RED — 228 failing tests for W7 FRs`

---

## 10. VERIFICATION GATE (WAVE COMPLETE)

All of these must pass before `wave-formation.sh complete W7` is called:

```bash
npx vitest run --coverage
# Required: ≥80% branches/functions/lines/statements
# W7 adds ~228 tests → total target: ~857 tests

npx tsc --noEmit
# Zero type errors

npx playwright test
# E2E dashboard tests (3 scenarios minimum)

npm run build
# Zero build errors
```

Coverage targets:
- Statements: ≥95%
- Branches: ≥89%
- Functions: ≥97%
- W7 new code: ≥80% on all metrics

---

## 11. DEPENDENCY GRAPH (VISUAL)

```
FR-W7-01 (16kHz)
    │
    ├──→ FR-W7-02 (Profiles)
    │         │
    │         └──→ FR-W7-07 (Jammer: drone class)
    │
    └──→ FR-W7-03 (Terminal Phase)
              │
              └──→ FR-W7-08 (PhysicalIntercept: terminal gate)

FR-W7-04 (ELRS RF)
    │
    └──→ FR-W7-03 (Terminal Phase: rfSilent input)

FR-W7-05 (BearingTriangulator)    (independent)
    │
    └──→ FR-W7-09 (SentinelPipelineV2: fusion source)
              │
              └──→ FR-W7-08 (PhysicalIntercept: ImpactPrediction)

FR-W7-06 (PTZ)                    (depends Phase 1+2+3)
FR-W7-07 (Jammer)                 (depends Phase 1+2)
FR-W7-08 (SkyNet)                 (depends Phase 1+2+3)

FR-W7-10 (Dashboard)              (depends all above via SSE/Supabase)
```

---

*Document end. Total estimated W7 tests: 228. Combined W1-W7 target: ~857.*
