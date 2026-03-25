# APEX-SENTINEL W7 — Risk Register
## Wave 7: Hardware Integration + Data Pipeline Rectification + Terminal Phase
## Version: 7.0.0 | Date: 2026-03-25 | Status: ACTIVE

---

## Risk Rating Matrix

| Likelihood | Impact | Rating |
|------------|--------|--------|
| HIGH | HIGH | CRITICAL |
| HIGH | MEDIUM | HIGH |
| MEDIUM | HIGH | HIGH |
| MEDIUM | MEDIUM | MEDIUM |
| LOW | HIGH | MEDIUM |
| LOW | MEDIUM | LOW |
| ANY | LOW | LOW |

---

## W7 Risk Register

### RISK-W7-01 — Wild Hornets Dataset Unavailable

| Field | Value |
|-------|-------|
| ID | RISK-W7-01 |
| Title | Wild Hornets dataset unavailable — Gerbera/Shahed-131 model accuracy below deployment threshold |
| Category | Data / External dependency |
| Likelihood | HIGH |
| Impact | HIGH |
| Rating | CRITICAL |
| Owner | Nico (procurement) + INDIGO team (source) |
| Status | OPEN |

**Description:**

The Wild Hornets dataset (3000+ field recordings of military UAS acoustic signatures) is the primary training corpus for piston-engine threat profiles introduced in W7: Gerbera and Shahed-131. Without real field recordings:
- Gerbera model accuracy is projected at <70% on holdout evaluation (synthetic augmentation alone is insufficient for unique engine characteristics)
- Shahed-131 vs Shahed-136 discrimination is the hardest classification problem in the library — both are piston engines, differentiated only by RPM range (Shahed-131: 3000-6000 RPM, Shahed-136: 1800-3200 RPM). Without real recordings at both RPM ranges in varied acoustic conditions, the model will conflate the two.
- W7 `YAMNetFineTuner.evaluate()` target of ≤5% FP rate and ≥90% classification accuracy will not be met for these classes.

**Impact if materialised:**
- Gerbera and Shahed-131 profiles are correct in `AcousticProfileLibrary` (frequency ranges, metadata), but backing ONNX model weights will be unreliable
- `FalsePositiveGuard.yamnetConfidence` threshold at 0.85 will effectively block most Gerbera/Shahed-131 detections (low confidence from poor model → suppressed as FP)
- W8 field trial with real hardware will expose the gap immediately

**Mitigation:**

Primary: Contact Cat/George (INDIGO team) before W7 init to confirm Wild Hornets dataset access. If available, integrate in W7 Phase 1 alongside FR-W7-01.

Fallback 1 — OSINT scraper:
```
scripts/osint-audio-scraper.ts
Sources: Liveleak battlefield audio (archived), Telegram OSINT channels (drone footage audio), YouTube verified UAS footage
Processing: extract audio track → resample to 16kHz → segment into 2s windows → manual label
Estimated yield: 200-500 recordings (insufficient alone, supplements Wild Hornets)
```

Fallback 2 — Synthetic augmentation with physical engine model:
```
scripts/synthetic-piston-generator.ts
Method: synthesize piston engine at target RPM using harmonic series (fundamental + overtones)
Apply: room impulse response convolution (outdoor acoustic environment)
Add: Doppler shift based on approach angle and speed
Limitations: will not capture engine-specific resonances, exhaust note characteristics
```

Fallback 3 — Frequency range heuristic as placeholder:
- Gerbera: flag acoustic detections in 80-180Hz range with `modelClass: 'piston'` and reduced confidence (0.60-0.70) until real model trained
- Shahed-131: same approach in 150-400Hz range
- These heuristics must be clearly documented in code as `TODO(W8): replace with trained ONNX model when Wild Hornets corpus available`

**Review date:** Before W7 tdd-red phase

---

### RISK-W7-02 — Dahua ONVIF Firmware Incompatibility

| Field | Value |
|-------|-------|
| ID | RISK-W7-02 |
| Title | Dahua PTZ specific firmware version does not support ONVIF RelativeMove |
| Category | Hardware compatibility |
| Likelihood | MEDIUM |
| Impact | MEDIUM |
| Rating | MEDIUM |
| Owner | Nico (hardware procurement) |
| Status | OPEN |

**Description:**

ONVIF Profile S mandates `RelativeMove` support, but Dahua firmware compliance varies across product lines and versions. Specific issues observed in the field:
- Dahua SD49425XB-HNR: RelativeMove not supported on firmware versions prior to 2.820.00000
- Some Dahua OEM models ship with stripped ONVIF profiles that exclude PTZ services entirely
- ONVIF profile token names vary by model (`Profile_1`, `MediaProfile000`, etc.) — hardcoded token fails on different hardware

The `PtzSlaveOutput` implements RelativeMove as primary with AbsoluteMove fallback. However:
- `AbsoluteMove` requires knowing the camera's current absolute position before computing the delta — this requires a `GetStatus` call each cycle, adding latency
- Some firmware versions require a `Stop` command before `AbsoluteMove` on a moving camera — missing this causes position drift

**Mitigation:**

Implementation mitigation (already in W7 design):
- `OnvifClient.RelativeMove()` catches HTTP 400/406 and retries as `AbsoluteMove`
- Profile token is configurable via `OnvifPtzConfig.profileToken` — not hardcoded
- `GetStatus` call cached at 10Hz (not 100Hz) to reduce round-trip overhead

Testing mitigation:
- W7 tests use a mock ONVIF server (Node.js HTTP server returning canned XML)
- Mock simulates both RelativeMove success and RelativeMove-not-supported response codes

Procurement mitigation:
- Before W8 field trial, obtain firmware version from Dahua hardware procurement spec
- Test against actual Dahua SD series in W8 — do not rely solely on W7 mock tests for hardware compatibility claims

---

### RISK-W7-03 — SkyNet API Undocumented

| Field | Value |
|-------|-------|
| ID | RISK-W7-03 |
| Title | SkyNet net-gun command API is undocumented — generic schema may not match actual hardware protocol |
| Category | External API / Hardware integration |
| Likelihood | HIGH |
| Impact | HIGH |
| Rating | CRITICAL |
| Owner | George (INDIGO team) — must provide spec |
| Status | OPEN — blocker for W8 real integration |

**Description:**

The `PhysicalInterceptCoordinator` and `SkyNetFireCommand` schema in W7 are designed generically:
```typescript
interface SkyNetFireCommand {
  commandId: string;
  unitId: string;
  bearing: number;
  elevationDeg: number;
  fireAtS: number;
  trackId: string;
  impactPrediction: ImpactPrediction;
  confidenceGate: number;
}
```

This schema is a reasonable guess at what a net-gun pre-positioning command requires. However, the actual SkyNet hardware may:
- Use different coordinate representations (azimuth/elevation vs pan/tilt vs absolute bearing)
- Require pre-position commands separately from fire commands (two-phase: pre-position → confirm → fire)
- Have a different timing model (fire-at-timestamp vs fire-on-receive)
- Use a proprietary binary protocol (not JSON-over-NATS)
- Require authentication/signing on every command

W7 implements and tests against the generic schema. W8 integration will fail if the actual SkyNet API differs materially.

**Mitigation:**

Before W7 execute phase, George must provide the SkyNet API specification (even a draft). If unavailable:
1. W7 implements `SkyNetAdapter` interface with the generic schema as default
2. Document all schema fields with clear semantics, making field mapping to actual API explicit
3. Create `SkyNetAdapterValidator.ts` — validates that an adapter implementation covers all required fields
4. W8 task: implement `DahuaSkyNetAdapter` against real API, extend `SkyNetAdapterValidator`

George must confirm the schema before W8 init. This risk is a CRITICAL blocker for W8 field trial.

**Action item:** Nico to contact George before W7 execute phase with the `SkyNetFireCommand` schema draft for review.

---

### RISK-W7-04 — ELRS FHSS Burst Detection False Positive Rate in Urban Environment

| Field | Value |
|-------|-------|
| ID | RISK-W7-04 |
| Title | Urban 900MHz noise (GSM, LoRaWAN, Sigfox) causes false ELRS detection → false rfSilent events |
| Category | Signal processing / Environmental |
| Likelihood | MEDIUM |
| Impact | HIGH |
| Rating | HIGH |
| Owner | Development team |
| Status | OPEN |

**Description:**

The 868/915MHz band is densely used in urban environments:
- GSM 900 (downlink: 935-960MHz, uplink: 890-915MHz) — high power, base station transmissions
- LoRaWAN (868MHz EU) — IoT gateway uplinks, chirp spread spectrum, irregular burst patterns
- Sigfox (868MHz EU) — very narrow band, short bursts
- PMR446 / ISM band devices — various industrial sensors

ELRS fingerprinting relies on burst interval regularity (standard deviation < 0.5ms at 500Hz). Urban interference sources can create apparent regularity when:
- Multiple LoRa nodes transmit at the same interval (beacon synchronisation)
- GSM time slot boundaries create regular 4.6ms burst patterns (TDMA frame structure)
- Industrial sensors with fixed poll rates coincide with ELRS packet rate

A false positive here means `rfSilent: true` is not triggered by a real FPV drone — less dangerous than the reverse. However, if urban noise is interpreted as ELRS-like AND then suddenly disappears, it could trigger a false `rfSilent` event → false `TERMINAL` phase transition.

**Mitigation:**

Pattern fingerprinting approach (primary):
- ELRS uses 64 or 128 frequency hop channels — the hop sequence has a measurable pattern distinct from random frequency access
- ELRS packet length is fixed (typical: 11-26 bytes depending on mode) — GSM/LoRa have different and variable packet lengths
- Implement `ElrsBurstClassifier` that checks: interval regularity AND hop pattern AND packet length consistency
- Only declare `isElrsLike: true` when all three criteria met simultaneously

Threshold tuning:
- `regularityMaxStdDevMs` default 0.5ms is tight — if urban noise still matches, tighten to 0.2ms
- Add `minConsecutiveRegularPackets: 20` — require 20 consecutive regular packets before declaring ELRS

Field calibration:
- W8 must include an urban baseline test: run `ElrsRfFingerprint` at a known drone-free urban site for 30 minutes and measure false positive rate
- Adjust thresholds based on field measurements before production deployment

---

### RISK-W7-05 — Shahed-238 Turbine Model — No Training Data Exists

| Field | Value |
|-------|-------|
| ID | RISK-W7-05 |
| Title | Shahed-238 turbine acoustic profile has no training data — ONNX model cannot be trained |
| Category | Data availability / Model quality |
| Likelihood | CRITICAL (near-certain) |
| Impact | HIGH |
| Rating | CRITICAL |
| Owner | Nico + INDIGO team |
| Status | OPEN — accepted risk for W7, W8 P0 |

**Description:**

The Shahed-238 turbine drone has a completely different acoustic signature from piston-engine variants:
- Dominant frequency: 3000-8000Hz (turbine whine, compressor stages)
- Minimal low-frequency content (no piston reciprocating mass)
- Requires a separate `turbine-classifier.onnx` model class
- The W6 piston-tuned YAMNetFineTuner model is inappropriate for turbine acoustic features

No training data for turbine UAVs exists in the current dataset. The W7 `AcousticProfile` for Shahed-238 is metadata-correct (frequency ranges, model class) but there is no ONNX model to back it.

**Impact if materialised:**
- `AcousticPipeline` will not classify Shahed-238 correctly — it may be classified as 'unknown' or misclassified as a piston drone if any 3-8kHz harmonic content is present
- The `JammerActivation` module relies on correct classification — misclassified Shahed-238 as 'unknown' → jammer not activated

**Mitigation for W7 (accepted workaround):**

Frequency range heuristic gate as placeholder:
```typescript
// src/ml/turbine-heuristic.ts
// TODO(W8): replace with turbine-classifier.onnx when dataset available
export function isTurbineLike(dominantFreqHz: number): boolean {
  return dominantFreqHz >= 3000 && dominantFreqHz <= 8000;
}
```

This heuristic:
- Catches Shahed-238 detections even without a trained model
- Has higher false positive potential (jet aircraft, some industrial equipment) but within acceptable bounds for a military perimeter
- Produces classification with confidence: 0.65 (below YAMNet 0.85 gate, but above jammer activation threshold of 0.65)

W8 deliverable: obtain turbine UAV recordings (synthetic jet engine models, surplus turbine UAS recordings from OSINT) → train `turbine-classifier.onnx` → replace heuristic.

---

### RISK-W7-06 — Demo Dashboard Not Ready for Radisson Demonstration

| Field | Value |
|-------|-------|
| ID | RISK-W7-06 |
| Title | DemoDashboard (FR-W7-10) delays commercial demonstration at Radisson |
| Category | Schedule / Commercial |
| Likelihood | MEDIUM |
| Impact | CRITICAL |
| Rating | CRITICAL |
| Owner | Nico |
| Status | OPEN — P0 scheduling mitigation |

**Description:**

The DemoDashboard is required for a commercial demonstration at the Radisson. If the dashboard is incomplete, the demonstration cannot proceed, impacting pipeline and deal flow. The dashboard depends on all other W7 FRs for full functionality (live tracks, terminal phase overlays, intercept decisions). However, a mock-data version can demonstrate the UI/UX independently of live sensor data.

**Mitigation:**

Scheduling mitigation:
- FR-W7-10 is explicitly scheduled as P0 in the IMPLEMENTATION_PLAN (above other P1 hardware FRs)
- Dashboard development begins with mock SSE feed — does not wait for real sensor data pipeline

Decoupled development approach:
```
Phase 1 (Dashboard): Build Next.js app, Leaflet map, alert log, operator auth with MOCK data
  - Mock SSE emits pre-recorded track scenario (Shahed-136 approach, terminal phase, intercept)
  - This version is demo-ready independently of live sensor integration

Phase 2 (Integration): Wire mock SSE to real SentinelPipelineV2 SSE feed
  - Swap MockSseFeed → RealSseFeed in one configuration change
```

Demo contingency:
- If real sensor data is not available for Radisson date, run the mock scenario
- Prepare a pre-recorded attack scenario JSON file (`fixtures/demo-scenario-radisson.json`)
- Dashboard SSE replays scenario at configurable speed

Deployment:
- Dashboard deployed to Vercel or Railway before demo date (not localhost demo — too fragile)
- URL and access credentials documented in DEPLOY_CHECKLIST.md

---

### RISK-W7-07 — 16kHz Migration Breaks W1-W6 Tests Assuming 22050Hz

| Field | Value |
|-------|-------|
| ID | RISK-W7-07 |
| Title | W1-W6 test fixtures hardcoded at 22050Hz fail after DatasetPipelineV2 migration |
| Category | Test integrity / Regression |
| Likelihood | HIGH |
| Impact | MEDIUM |
| Rating | HIGH |
| Owner | Development team |
| Status | OPEN — requires systematic fixture audit |

**Description:**

W1-W6 tests were written against 22050Hz assumptions:
- `YAMNetFineTuner` config: `sampleRate: 22050` (FR-W6-02 AC-01)
- Test fixtures generating synthetic PCM: `sampleRate: 22050` in fixture factories
- Mel spectrogram bin mappings verified against 22050Hz Nyquist (11025Hz max bin)
- `AudioCapture` edge-runner: `sampleRate: 22050`

After W7 migration to 16kHz, these tests will either:
1. Pass with the wrong assumptions (no explicit check on sample rate) — silent corruption
2. Fail with `SampleRateMismatchError` from `DatasetPipelineV2.ingest()` — visible but requires fixing

The worst outcome is (1) — tests pass but the data is wrong. A check is needed to ensure 22050Hz fixtures are not silently accepted at 16kHz pipeline boundaries.

**Mitigation:**

Systematic fixture audit before W7 tdd-red:
```bash
scripts/audit-fixture-sample-rates.ts
# Scans: __fixtures__/**/*.ts, __tests__/**/*.test.ts
# Pattern: sampleRate: 22050 | TARGET_SAMPLE_RATE | SR = 22050
# Output: audit-report.md listing every occurrence
```

Migration script:
```bash
scripts/migrate-fixtures-16khz.ts
# For each fixture generating PCM at 22050Hz:
#   - Apply AudioResampler.resample(pcm, 22050, 16000)
#   - Update sampleRate: 16000
# For YAMNetFineTuner config in tests:
#   - Update sampleRate: 22050 → 16000
# Commit: fix(W7): migrate all test fixtures to 16kHz
```

W6 test preservation strategy:
- W6 tests for `DatasetPipeline` (FR-W6-04) test the **old** 22050Hz pipeline — these remain valid for regression testing the W6 code
- W7 tests for `DatasetPipelineV2` (FR-W7-01) test the **new** 16kHz pipeline
- Both test files coexist — W6 pipeline is not deleted in W7, just deprecated

---

### RISK-W7-08 — BearingTriangulator Accuracy Insufficient with Phone Compass

| Field | Value |
|-------|-------|
| ID | RISK-W7-08 |
| Title | Mobile phone compass bearing accuracy (±5°) yields insufficient triangulation precision for net-gun pre-positioning |
| Category | Sensor accuracy / Operational |
| Likelihood | HIGH |
| Impact | MEDIUM |
| Rating | HIGH |
| Owner | Development team + INDIGO team (sensor spec) |
| Status | OPEN |

**Description:**

Consumer phone compass accuracy is typically ±5°, degrading to ±10° near metal structures or in urban magnetic interference. At 500m range, a ±5° bearing error translates to ±43m position error. At 1000m range, this is ±87m.

The `SkyNetFireCommand` requires a position estimate accurate enough to pre-position a net-gun. Net-gun effective radius is typically 2-5m. An 87m position error makes pre-positioning useless — the net-gun would need to be within 87m of the actual drone position, which defeats the purpose.

For the BearingTriangulator to be useful as a pre-positioning input:
- Phone bearings need to be down-weighted significantly (0.4 weight in W7 design)
- Or phone bearings must not feed directly into intercept coordinates — only into alert/awareness layer

**Mitigation:**

Weight mitigation (already in W7 design):
- Phone bearings: weight 0.4 in Stansfield solve
- Fixed acoustic node bearings: weight 1.0
- When fixed node bearings are available, phone bearings have minimal influence

Operational mitigation:
- Document in `DEPLOY_CHECKLIST.md`: mobile phone bearing is for awareness only — intercept coordinates must come from fixed-node TDOA or radar
- Add `source` field to `TriangulationResult.primarySource` — if `primary: 'mobile-phone'`, suppress `PhysicalInterceptCoordinator` from using the bearing result

Radar input (W8):
- W8 must add radar bearing as a `BearingReport` source with weight 2.0 (radar bearing ±0.5° accuracy)
- With radar bearing + 2 fixed nodes, precision drops to <5m at 500m range — sufficient for net-gun pre-positioning

**Decision:** BearingTriangulator in W7 is correct for multi-sensor fusion architecture. Phone compass weight (0.4) and explicit `source` tracking prevent overreliance. Radar input is W8.

---

## Archived / Resolved Risks (W1-W6)

| ID | Title | Resolution | Wave |
|----|-------|------------|------|
| RISK-W6-01 | 22050Hz sample rate mismatch | Fixed in W7 FR-W7-01 | W7 |
| RISK-W6-02 | Hardcoded {lat:51.5,lon:4.9} coordinate | Fixed in W7 FR-W7-09 | W7 |
| RISK-W5-01 | EKF numerical instability on long tracks | Resolved: Singer Q model stable, cholesky decomposition in MatrixOps | W5 |
| RISK-W4-01 | Supabase real-time subscription drop | Resolved: CircuitBreaker wraps all Supabase calls | W4 |
| RISK-W3-01 | NATS reconnect storm on broker restart | Resolved: NatsClientFSM exponential backoff, max 10 retries | W3 |
| RISK-W2-01 | mTLS cert expiry on edge nodes | Resolved: ModelManager cert rotation via Supabase Storage | W3 |

---

## Risk Summary Dashboard

| ID | Title | Rating | Status |
|----|-------|--------|--------|
| RISK-W7-01 | Wild Hornets dataset unavailable | CRITICAL | OPEN |
| RISK-W7-02 | Dahua ONVIF firmware incompatibility | MEDIUM | OPEN |
| RISK-W7-03 | SkyNet API undocumented | CRITICAL | OPEN — George action |
| RISK-W7-04 | ELRS false positive rate (urban 900MHz) | HIGH | OPEN |
| RISK-W7-05 | Shahed-238 no training data | CRITICAL | ACCEPTED for W7 |
| RISK-W7-06 | Demo dashboard Radisson blocker | CRITICAL | MITIGATION ACTIVE |
| RISK-W7-07 | 16kHz migration breaks W1-W6 tests | HIGH | OPEN — fixture audit required |
| RISK-W7-08 | Phone compass accuracy insufficient | HIGH | MITIGATION ACTIVE (weight 0.4) |

**Open Critical risks: 4** (RISK-W7-01, RISK-W7-03, RISK-W7-05, RISK-W7-06)
**Action required before W7 execute: RISK-W7-03 (George) + RISK-W7-01 (Cat/George) + RISK-W7-07 (fixture audit)**

---

*Risk Register version 7.0.0 — 2026-03-25*
*Review cadence: re-assess at each wave-formation phase checkpoint*
