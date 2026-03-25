# APEX-SENTINEL W7 — Acceptance Criteria

> Wave: W7 — Hardware Integration Layer + Data Pipeline Rectification + Terminal Phase Detection
> Last updated: 2026-03-25
> Format: BDD (Given / When / Then)
> Total FRs: 10 | ACs per FR: 8–12 | Total ACs: 97

---

## FR-W7-01: DatasetPipeline 16kHz Migration

**Summary:** Migrate the entire DatasetPipeline from 22050Hz to 16kHz to align with INDIGO AirGuard standard and Wild Hornets field dataset. This is a data-correctness P0 fix — the 22050Hz configuration constituted a data breach causing spectral corruption in all W6 training data.

---

**AC-01-01 — Sample rate is 16000 Hz**

```
GIVEN the DatasetPipeline is initialized with default configuration
WHEN sampleRate is read from MelSpectrogramConfig
THEN sampleRate === 16000
  AND sampleRate !== 22050
```

**AC-01-02 — nFFT is recalculated for 16kHz**

```
GIVEN the DatasetPipeline is initialized with default configuration
WHEN nFFT is read from MelSpectrogramConfig
THEN nFFT === 1024
  AND nFFT !== 2048
  (rationale: nFFT should be ~64ms at 16kHz = 1024 samples)
```

**AC-01-03 — Segment length is 0.975 seconds (YAMNet standard at 16kHz)**

```
GIVEN the DatasetPipeline is initialized with default configuration
WHEN windowSize is read from MelSpectrogramConfig
THEN windowSize === 0.975
  AND windowSize * sampleRate === 15600 (samples per segment)
```

**AC-01-04 — fMax does not exceed 16kHz Nyquist**

```
GIVEN the DatasetPipeline is initialized with default configuration
WHEN fMax is read from MelSpectrogramConfig
THEN fMax <= sampleRate / 2
  AND fMax === 8000
  (Nyquist of 16kHz is 8kHz — fMax must not exceed this)
```

**AC-01-05 — Audio at 22050Hz is rejected at ingestion**

```
GIVEN an audio file that has been recorded or resampled to 22050Hz
WHEN DatasetPipeline.ingest(audio) is called
THEN a SampleRateMismatchError is thrown
  AND the error message contains "expected 16000, got 22050"
  AND no segments are written to the output directory
```

**AC-01-06 — 16kHz audio is accepted without resampling**

```
GIVEN a WAV file with sampleRate = 16000 Hz
  AND the file is 5 seconds long (80,000 samples)
WHEN DatasetPipeline.ingest(audio) is called
THEN no resampling is performed (audio is used as-is)
  AND the pipeline generates floor(5.0 / 0.975) = 5 segments
  AND each segment has exactly 15,600 samples
```

**AC-01-07 — Mel spectrogram output shape is correct at 16kHz**

```
GIVEN a valid 0.975s audio segment at 16kHz
WHEN computeMelSpectrogram(segment) is called
THEN the output tensor has shape [64, 64]
  (64 time frames × 64 mel bins — YAMNet standard input at 16kHz)
  AND no NaN values are present in the output tensor
```

**AC-01-08 — All 629 W1–W6 tests pass after migration**

```
GIVEN the 16kHz migration has been applied to all pipeline modules
WHEN the full test suite is run (npx vitest run)
THEN all 629 pre-existing tests pass
  AND no test references sampleRate 22050 without explicitly marking it as a deprecated-value test
  AND test coverage remains >= 80% for all metrics
```

**AC-01-09 — Wild Hornets dataset ingestion succeeds at 16kHz native rate**

```
GIVEN a Wild Hornets recording (WAV, 16kHz, mono, 10 seconds)
  AND the DatasetPipeline is configured with sampleRate=16000
WHEN the recording is ingested
THEN 10 segments are generated (floor(10.0 / 0.975) = 10)
  AND all segments pass SNR check (≥ 6dB threshold)
  AND no resampling artifacts are introduced
```

---

## FR-W7-02: AcousticProfileLibrary Expansion (Gerbera, Shahed-131, Shahed-238)

**Summary:** Add three new threat profiles to AcousticProfileLibrary. Gerbera and Shahed-131 are piston-engine variants. Shahed-238 is a jet turbine and requires a separate classification branch.

---

**AC-02-01 — Gerbera profile exists and has correct frequency range**

```
GIVEN the AcousticProfileLibrary is initialized with default profiles
WHEN getProfile("gerbera") is called
THEN the result is not null
  AND result.freqMin === 200
  AND result.freqMax === 600
  AND result.engineType === 'piston-boxer'
  AND result.falsePositiveRisk === 'medium'
```

**AC-02-02 — Shahed-131 profile has higher RPM than Shahed-136**

```
GIVEN the AcousticProfileLibrary is initialized with default profiles
WHEN getProfile("shahed-131") and getProfile("shahed-136") are both retrieved
THEN shahed-131.rpmRange[0] > shahed-136.rpmRange[0]
  AND shahed-131.freqMin > shahed-136.freqMin
  (Shahed-131 is smaller, higher-RPM variant)
```

**AC-02-03 — Shahed-238 profile has turbine frequency range**

```
GIVEN the AcousticProfileLibrary is initialized with default profiles
WHEN getProfile("shahed-238") is called
THEN result.freqMin === 3000
  AND result.freqMax === 8000
  AND result.engineType === 'jet-turbine-micro'
  AND result.routingBranch === 'turbine'
  AND result.minConfidenceThreshold >= 0.80
```

**AC-02-04 — matchFrequency returns Shahed-238 for turbine frequency queries**

```
GIVEN the AcousticProfileLibrary is initialized with default profiles
WHEN matchFrequency({ fMin: 4000, fMax: 7500 }) is called
THEN result is not null
  AND result.label === 'shahed-238'
  AND result.confidence > 0.75
```

**AC-02-05 — Turbine routing branch selection**

```
GIVEN a spectral centroid of 5500 Hz (Shahed-238 typical)
WHEN ClassificationRouter.selectBranch(embedding, centroid=5500) is called
THEN the selected branch is 'turbine'

GIVEN a spectral centroid of 380 Hz (Gerbera typical)
WHEN ClassificationRouter.selectBranch(embedding, centroid=380) is called
THEN the selected branch is 'piston'
```

**AC-02-06 — Routing threshold boundary is exactly 2000 Hz**

```
GIVEN the ClassificationRouter default configuration
WHEN selectBranch is called with spectralCentroid = 2000
THEN the branch is 'piston'
WHEN selectBranch is called with spectralCentroid = 2001
THEN the branch is 'turbine'
```

**AC-02-07 — Total profile count is now 13 (10 original + 3 new)**

```
GIVEN the AcousticProfileLibrary is initialized with default profiles
WHEN getAllProfiles() is called
THEN the result array has length >= 13
  AND result contains an entry with label 'gerbera'
  AND result contains an entry with label 'shahed-131'
  AND result contains an entry with label 'shahed-238'
```

**AC-02-08 — getProfile throws for unknown profile**

```
GIVEN a drone type "phantom-stealth-x" that does not exist in the library
WHEN getProfile("phantom-stealth-x") is called
THEN a DroneProfileNotFoundError is thrown
  AND the error message includes "phantom-stealth-x"
```

---

## FR-W7-03: TerminalPhaseDetector

**Summary:** 4-indicator finite state machine detecting the terminal (attack) phase of a drone trajectory. All 4 indicators must be simultaneously active for TERMINAL_CONFIRMED. Confidence floor is 0.90 when all-active.

---

**AC-03-01 — Single indicator: never produces TERMINAL_CONFIRMED**

```
GIVEN a TerminalPhaseDetector in CRUISE state
WHEN only the speed indicator becomes active (ground_speed = 80 m/s for 500ms)
  AND heading variance indicator is INACTIVE
  AND descent rate indicator is INACTIVE
  AND RF silence indicator is INACTIVE
THEN the FSM state is NOT TERMINAL_CONFIRMED
  AND the FSM state is NOT TERMINAL_CANDIDATE
```

**AC-03-02 — Speed indicator activates correctly**

```
GIVEN a TerminalPhaseDetector receiving EKF state updates
WHEN ground_speed exceeds 50 m/s continuously for >= 300ms
THEN speedIndicator.active === true

WHEN ground_speed drops to 49.9 m/s
THEN speedIndicator.active === false immediately
```

**AC-03-03 — Heading variance indicator: circular math**

```
GIVEN a sequence of heading values: [358°, 1°, 2°, 359°, 0°] over 1 second
WHEN headingVarianceIndicator evaluates the sequence
THEN the computed variance is < 10 degrees
  (correct circular variance — not mistakenly 357° linear range)
  AND headingVarianceIndicator.active === true (variance < 45° threshold)
```

**AC-03-04 — Descent rate indicator activates on sustained descent**

```
GIVEN an altitude time series showing -6 m/s descent rate for 600ms
WHEN descentRateIndicator evaluates the series
THEN descentRateIndicator.active === true

GIVEN an altitude time series showing -4.9 m/s for 600ms
THEN descentRateIndicator.active === false
```

**AC-03-05 — RF silence indicator: requires prior burst observation**

```
GIVEN no ELRS bursts have been observed since detector startup
WHEN 1000ms of silence is observed
THEN rfSilenceIndicator.active === false
  (silence without prior burst is not meaningful — could be no ELRS in area)
```

**AC-03-06 — RF silence indicator: activates after burst followed by silence**

```
GIVEN ELRS bursts were observed in the previous 2 seconds
WHEN 900ms of continuous silence (no burst) is observed
THEN rfSilenceIndicator.active === true
  (operator has cut the link — terminal phase signature)
```

**AC-03-07 — Three indicators active: TERMINAL_CANDIDATE, not TERMINAL_CONFIRMED**

```
GIVEN all three kinematic indicators are active (speed + headingLock + descentRate)
  AND rfSilenceIndicator is INACTIVE (RF link still active)
WHEN the FSM evaluates state
THEN FSM state === 'TERMINAL_CANDIDATE'
  AND FSM state !== 'TERMINAL_CONFIRMED'
  AND confidence < 0.90
```

**AC-03-08 — All 4 indicators active for 500ms: TERMINAL_CONFIRMED**

```
GIVEN all 4 indicators become simultaneously active
WHEN 500ms elapses with all 4 indicators remaining active
THEN FSM state === 'TERMINAL_CONFIRMED'
  AND a TERMINAL_PHASE event is emitted on NATS subject 'sentinel.terminal.phase'
  AND event.confidence >= 0.90
```

**AC-03-09 — Confidence floor of 0.90 when all-active**

```
GIVEN all 4 indicators are active simultaneously
WHEN computeTerminalConfidence(allActive=true, indicators) is called
THEN the returned confidence >= 0.90
  (even if weighted sum would be 0.88 in edge case — floor is enforced)
```

**AC-03-10 — FSM returns to CRUISE on sustained non-descent**

```
GIVEN FSM is in DESCENDING state
WHEN descent rate indicator becomes INACTIVE for >= 2000ms
THEN FSM state returns to 'CRUISE'
```

**AC-03-11 — TERMINAL_CONFIRMED → CRUISE on altitude below minimum**

```
GIVEN FSM is in TERMINAL_CONFIRMED state
WHEN altitude drops below minimum_operating_altitude (assumed impact)
THEN FSM state returns to 'CRUISE'
  AND the threat event is marked status='IMPACT_ASSUMED'
```

---

## FR-W7-04: ELRS 900MHz RF Module

**Summary:** Passive detection of ELRS 900MHz control link via energy burst analysis. Detects FPV drone control traffic and operator link-cut (silence) before impact.

---

**AC-04-01 — Burst detection from synthetic FHSS signal**

```
GIVEN a synthetic RF sweep sequence containing energy bursts at 4ms intervals
  AND burst energy is 20dB above noise floor
WHEN ELRSRFModule.processSweeps(sweeps) is called
THEN result.burstDetected === true
  AND result.burstDuration_ms is within 20% of injected burst duration
```

**AC-04-02 — No burst detection on noise-only sweep**

```
GIVEN a synthetic RF sweep with all bins at -120 dBm (noise floor)
WHEN ELRSRFModule.processSweeps(sweeps) is called
THEN result.burstDetected === false
```

**AC-04-03 — Link silence detection: activates after 800ms silence with prior burst**

```
GIVEN ELRS bursts were observed within the last 2 seconds
  AND no burst has been detected for 850ms
WHEN LinkSilenceDetector.isSilenceConfirmed(800) is called
THEN result === true
```

**AC-04-04 — Link silence: does not activate without prior burst**

```
GIVEN the ELRS RF Module has been running for 5 seconds with no burst observed
WHEN 1000ms of silence elapses
THEN LinkSilenceDetector.isSilenceConfirmed(800) === false
```

**AC-04-05 — Silence flag resets when new burst arrives**

```
GIVEN silence flag is active (prior burst + 900ms silence)
WHEN a new burst is detected
THEN silenceFlagActive === false
  AND lastBurstTimestamp is updated to current time
```

**AC-04-06 — FHSS classifier identifies ELRS FPV pattern**

```
GIVEN a synthetic sweep sequence with ELRS 250Hz packet rate pattern
  AND hop count = 12 in last 100ms (expected for ELRS)
WHEN FHSSClassifier.classify(sweeps) is called
THEN result.classification === 'elrs-fpv'
  AND result.confidence > 0.70
```

**AC-04-07 — FHSS classifier does not misclassify LoRaWAN as ELRS**

```
GIVEN a synthetic sweep with single-burst pattern (LoRaWAN: long burst, no hop)
WHEN FHSSClassifier.classify(sweeps) is called
THEN result.classification !== 'elrs-fpv'
  AND result.classification is 'other-fhss' or 'noise'
```

**AC-04-08 — Packet loss rate calculation**

```
GIVEN ELRS operating at 250Hz (burst every 4ms)
  AND 10 bursts detected in 100ms window (expected: 25 bursts)
WHEN computePacketLossRate(observed=10, expected=25) is called
THEN result === 0.60 (60% packet loss)
```

---

## FR-W7-05: BearingTriangulator

**Summary:** Least-squares bearing intersection from 3+ observer positions + compass bearings. Fuses with TdoaSolver in MultiNodeFusion. Degrades gracefully to 2-node or 1-node operation.

---

**AC-05-01 — 3-node right-angle geometry: accuracy within 50m at 1km range**

```
GIVEN 3 observer nodes in a right-angle configuration
  AND true target is 1000m from the nearest observer
  AND each bearing has ±3° measurement error (realistic compass accuracy)
WHEN BearingTriangulator.compute(nodes) is called
THEN result.estimatedPosition is within 50m of true target position
  AND result.observerCount === 3
```

**AC-05-02 — 4-node overdetermined: lower uncertainty than 3-node**

```
GIVEN 4 observer nodes (overdetermined system)
WHEN BearingTriangulator.compute(fourNodes) is called
  AND compared to compute(threeNodes) for the same target
THEN result4.positionUncertaintyMeters < result3.positionUncertaintyMeters
  (4 nodes provides more constraint — uncertainty decreases)
```

**AC-05-03 — 3 collinear nodes: system detects degeneracy**

```
GIVEN 3 observer nodes all located on the same east-west line
  AND all bearings pointing roughly northward
WHEN BearingTriangulator.compute(collinearNodes) is called
THEN either:
  (a) a CollinearNodeError is thrown with message "nodes are collinear"
  OR (b) result.uncertaintyFlag === 'DEGENERATE' and result.positionUncertaintyMeters > 500
```

**AC-05-04 — 2 nodes: returns position estimate with HIGH uncertainty flag**

```
GIVEN 2 observer nodes with non-parallel bearings
WHEN BearingTriangulator.compute(twoNodes) is called
THEN result is not null (does not throw)
  AND result.uncertaintyFlag === 'HIGH'
  AND result.observerCount === 2
  AND result.positionUncertaintyMeters > 100
```

**AC-05-05 — 1 node: returns bearing line, not point estimate**

```
GIVEN 1 observer node
WHEN BearingTriangulator.compute(oneNode) is called
THEN result.positionEstimate is null
  AND result.bearingLine is not null
  AND result.observerCount === 1
  AND result.uncertaintyFlag === 'LINE_ONLY'
```

**AC-05-06 — 0 nodes: throws InsufficientNodesError**

```
GIVEN an empty observer array
WHEN BearingTriangulator.compute([]) is called
THEN an InsufficientNodesError is thrown
  AND the error message contains "minimum 1 observer required"
```

**AC-05-07 — Output strips individual observer data (privacy)**

```
GIVEN a successful triangulation with 3 nodes
WHEN the TriangulationResult is inspected
THEN result does not have an 'observerPositions' property
  AND result does not have a 'bearings' property
  AND result.observerCount === 3 (count only, not identity)
```

**AC-05-08 — Position output is coarsened to ±25m**

```
GIVEN a triangulation that converges to exact target position
WHEN the result is published to NATS
THEN the published position differs from the exact by <= 25m
  AND the published position has coarseningApplied === true
```

---

## FR-W7-06: PtzSlaveOutput

**Summary:** ONVIF PTZ control, publish predicted bearing at 100Hz, 6-8ms lookahead from EKF vLat/vLon state vector.

---

**AC-06-01 — Valid ONVIF ContinuousMove XML is generated**

```
GIVEN pan=90.0, tilt=45.0, zoom=1.0 are provided as input
WHEN PtzSlaveOutput.sendPtzCommand(90, 45, 1.0) is called
THEN the HTTP request body contains valid ONVIF SOAP XML
  AND the XML contains <tt:PanTilt x="90.000" y="45.000"/>
  AND the XML contains the ContinuousMove action
  AND the XML has a valid SOAP envelope header
```

**AC-06-02 — Commands are sent to configured ONVIF endpoint**

```
GIVEN PtzSlaveOutput is configured with endpoint "http://192.168.1.50/onvif/ptz"
WHEN sendPtzCommand is called
THEN the HTTP POST is sent to "http://192.168.1.50/onvif/ptz"
  AND the Content-Type header is 'application/soap+xml'
```

**AC-06-03 — 100Hz publish rate with steady EKF updates**

```
GIVEN EKF state updates arrive at 200Hz
WHEN PtzSlaveOutput processes 1 second of EKF updates
THEN exactly 100 PTZ commands are sent (publish at 100Hz, not at EKF rate)
  AND no commands are dropped (NATS publish queue does not overflow)
```

**AC-06-04 — 6-8ms lookahead position correction**

```
GIVEN EKF state with vLat = 0.00045 deg/s (≈ 50 m/s northward) and vLon = 0
WHEN PtzSlaveOutput computes pan for lookahead of 7ms
THEN the pan angle corresponds to predicted position at t+7ms
  AND the correction is approximately 0.35m northward from current position
```

**AC-06-05 — PtzAuthError on ONVIF HTTP 401**

```
GIVEN the ONVIF camera returns HTTP 401 Unauthorized
WHEN sendPtzCommand is called
THEN a PtzAuthError is thrown
  AND subsequent commands are not sent until re-authentication
```

**AC-06-06 — No PTZ command sent when track confidence < threshold**

```
GIVEN a threat track with confidence = 0.60 (below 0.70 PTZ activation threshold)
WHEN SentinelPipeline processes the low-confidence detection
THEN PtzSlaveOutput.sendPtzCommand is NOT called
```

**AC-06-07 — PTZ command includes timestamp for latency measurement**

```
GIVEN a PTZ command is sent
WHEN the command record is stored in Supabase ptz_commands table
THEN the record contains a created_at timestamp
  AND latency_ms is populated (time between EKF update and PTZ send)
```

**AC-06-08 — PTZ records are deleted after 24 hours**

```
GIVEN PTZ command records exist in the ptz_commands table older than 24 hours
WHEN the scheduled retention cleanup job runs
THEN all records with created_at < now() - 24h are deleted
  AND records within 24 hours are retained
```

---

## FR-W7-07: JammerActivation

**Summary:** Hardware jammer control. FPV=900MHz channel. Shahed-136/Shahed-238/GPS-guided=1575MHz GPS jamming. Authorization token gate mandatory. Manual operator confirmation mandatory.

---

**AC-07-01 — FPV threat activates 900MHz jammer channel**

```
GIVEN a threat classified as 'fpv-racing' with confidence 0.92
  AND a valid authorization token is loaded
  AND operatorConfirmed = true
WHEN JammerActivation.activate(request) is called
THEN the serial command sent to jammer hardware contains 'CHANNEL:900MHZ'
  AND no 1575MHz command is sent
```

**AC-07-02 — Shahed-136 threat activates GPS 1575MHz jammer channel**

```
GIVEN a threat classified as 'shahed-136' with confidence 0.92
  AND a valid authorization token is loaded
  AND operatorConfirmed = true
WHEN JammerActivation.activate(request) is called
THEN the serial command contains 'CHANNEL:1575MHZ'
  (Shahed-136 uses GPS navigation — GPS jamming is more effective than RF link jamming)
```

**AC-07-03 — Shahed-238 activates GPS 1575MHz jammer channel**

```
GIVEN a threat classified as 'shahed-238' (jet turbine variant)
  AND valid auth token and operator confirmation
WHEN JammerActivation.activate(request) is called
THEN the serial command contains 'CHANNEL:1575MHZ'
  (Shahed-238 is GPS-guided like Shahed-136 variants)
```

**AC-07-04 — No valid auth token: activation rejected**

```
GIVEN no authorization token is loaded in JammerActivation
WHEN JammerActivation.activate(request) is called
THEN a JammerAuthError is thrown
  AND no serial command is written to the hardware port
  AND a JammerAuthError event is logged to Supabase
```

**AC-07-05 — Expired auth token: activation rejected**

```
GIVEN an authorization token with validUntil = yesterday
WHEN JammerActivation.activate(request) is called
THEN a JammerAuthError is thrown with message containing "token expired"
  AND no serial command is written
```

**AC-07-06 — Acoustic confidence below 0.85: activation rejected**

```
GIVEN a threat with confidence = 0.84 (just below 0.85 threshold)
  AND valid auth token and operator confirmation
WHEN JammerActivation.activate(request) is called
THEN a ConfidenceTooLowError is thrown
  AND no serial command is written
```

**AC-07-07 — operatorConfirmed = false: activation rejected**

```
GIVEN a threat with confidence = 0.96
  AND valid auth token
  AND operatorConfirmed = false
WHEN JammerActivation.activate(request) is called
THEN an OperatorConfirmationRequired error is thrown
  AND no serial command is written
  (autonomous jamming without human confirmation is NEVER permitted)
```

**AC-07-08 — Activation is logged with all required fields**

```
GIVEN a successful jammer activation (all gates passed)
WHEN the activation completes
THEN a record is inserted into Supabase jammer_activations table
  AND the record contains: threat_id, frequency_hz, duration_ms, confidence, auth_token_ref, operator_id
  AND the record does NOT contain any civilian location data
```

**AC-07-09 — Threat position outside permitted zone: activation rejected**

```
GIVEN an authorization token with permittedZone covering a 10km² area
  AND the threat track is 500m outside the permitted zone boundary
WHEN JammerActivation.activate(request) is called
THEN a ZoneViolationError is thrown
  AND no serial command is written
```

---

## FR-W7-08: PhysicalInterceptCoordinator

**Summary:** Maps MonteCarloPropagator impact zone to nearest SkyNet unit, calculates fire timing = timeToImpact - net_flight_time.

---

**AC-08-01 — Selects SkyNet unit with shortest flight time to impact zone**

```
GIVEN 3 SkyNet units with flight times to impact zone: unit-A=8s, unit-B=12s, unit-C=6s
WHEN PhysicalInterceptCoordinator.coordinate(threatEvent) is called
THEN result.selectedUnit === 'unit-C'
  AND result.fireTimingMs === timeToImpactMs - 6000
```

**AC-08-02 — Fire timing = timeToImpact - net_flight_time**

```
GIVEN timeToImpact = 30,000ms and selected unit flight time = 8,000ms
WHEN coordinate() computes fire timing
THEN result.fireTimingMs === 22000
  AND result.fireTimingMs > 0 (not already too late)
```

**AC-08-03 — No unit available: returns NO_UNIT_AVAILABLE**

```
GIVEN all SkyNet units have flight times greater than timeToImpact
  (no unit can reach the impact zone before impact)
WHEN coordinate() is called
THEN result.status === 'NO_UNIT_AVAILABLE'
  AND result.selectedUnit is null
  AND no SkyNet activation request is issued
```

**AC-08-04 — Confidence gate: does not activate below 0.85**

```
GIVEN the threat event has MonteCarlo impact zone confidence = 0.84
WHEN coordinate() is called
THEN result.status === 'CONFIDENCE_TOO_LOW'
  AND no SkyNet activation request is issued
  AND mockSkyNetClient.activationRequests has length === 0
```

**AC-08-05 — Impact zone from MonteCarloPropagator is used (not hardcoded)**

```
GIVEN MonteCarloPropagator returns impact zone center at (44.4268, 26.1025)
WHEN coordinate() calls SkyNet with the activation request
THEN the activation request contains targetPosition.lat ≈ 44.4268
  AND targetPosition.lon ≈ 26.1025
  AND no hardcoded coordinates appear in the source code
```

**AC-08-06 — SkyNet unavailable: throws SkyNetUnavailableError (no silent failure)**

```
GIVEN MockSkyNetClient is configured to throw SkyNetUnavailableError
WHEN coordinate() calls requestIntercept
THEN the error propagates up from coordinate()
  AND the caller receives a SkyNetUnavailableError
  AND the error is NOT swallowed silently
```

**AC-08-07 — Operator confirmation required before SkyNet activation**

```
GIVEN a valid intercept scenario (confidence ≥ 0.85, unit available, timing feasible)
  AND operatorAuthorized = false
WHEN coordinate() is called
THEN result.status === 'AWAITING_OPERATOR_AUTHORIZATION'
  AND no SkyNet activation request is issued
```

**AC-08-08 — Activation logged with threat_id and unit_id**

```
GIVEN a successful intercept coordination
WHEN the activation completes
THEN an intercept_activations record is written to Supabase
  AND the record contains: threat_id, skynet_unit_id, fire_timing_ms, impact_zone_lat, impact_zone_lon
```

---

## FR-W7-09: TdoaSolver Coordinate Injection into SentinelPipeline

**Summary:** Remove hardcoded coordinates (51.5/4.9) from SentinelPipeline. TdoaSolver must receive real observer positions from the node registry.

---

**AC-09-01 — No literal 51.5 or 4.9 values in SentinelPipeline source**

```
GIVEN the SentinelPipeline source file is read
WHEN the file content is searched for literal values 51.5, 4.9, 51.50, 4.90
THEN no matches are found in non-test source files under src/pipeline/
  (this is verifiable as a static analysis check in CI)
```

**AC-09-02 — SentinelPipeline accepts observer configuration at construction**

```
GIVEN an observer array with Bucharest-area coordinates
  [{ id: 'n1', lat: 44.4268, lon: 26.1025 }, { id: 'n2', lat: 44.4350, lon: 26.1200 }]
WHEN new SentinelPipeline({ observers }) is constructed
THEN the pipeline initializes without error
  AND TdoaSolver is internally configured with those coordinates
```

**AC-09-03 — TdoaSolver receives injected coordinates, not defaults**

```
GIVEN SentinelPipeline is constructed with custom observer coordinates (Bucharest)
WHEN an audio frame is processed
THEN TdoaSolver is called with observer positions matching Bucharest coordinates
  AND NOT with 51.5/4.9 (Netherlands default)
```

**AC-09-04 — SentinelPipeline throws ConfigurationError with empty observers**

```
GIVEN an empty observers array is passed to SentinelPipeline constructor
WHEN new SentinelPipeline({ observers: [] }) is called
THEN a ConfigurationError is thrown
  AND the error message contains "observers array must have at least 1 entry"
```

**AC-09-05 — TdoaSolver uses dynamic node registry updates**

```
GIVEN a SentinelPipeline with 2 initial observer nodes
WHEN a third node joins and pipeline.addObserver(newNode) is called
THEN subsequent TdoaSolver calls include the third observer
  AND existing processing is not interrupted
```

**AC-09-06 — Hardcoded coordinate removal regression test**

```
GIVEN the SentinelPipeline was previously hardcoded to 51.5/4.9
WHEN the pipeline runs with London-area observers (51.5/4.9 zone)
  AND simultaneously with Bucharest observers (44.4/26.1 zone)
THEN the two pipeline instances produce DIFFERENT TdoaSolver results
  AND neither result is numerically equal to the other
  (confirming coordinate injection is actually working, not just reading same hardcoded value)
```

**AC-09-07 — Node position coarsening applied before TdoaSolver**

```
GIVEN observer positions from mobile nodes (exact GPS, before coarsening)
WHEN pipeline processes the positions
THEN TdoaSolver receives coarsened positions (±50m Gaussian noise applied)
  AND raw exact positions are not present in TdoaSolver input
```

**AC-09-08 — Single observer: TdoaSolver degrades to bearing-only mode**

```
GIVEN only 1 observer node is registered
WHEN SentinelPipeline processes a detection
THEN TdoaSolver is called in single-node mode (bearing line, not position estimate)
  AND the pipeline does not crash
  AND the output event has uncertaintyFlag === 'SINGLE_NODE'
```

---

## FR-W7-10: Demo Dashboard

**Summary:** React/Next.js dashboard for Radisson meeting. Heatmap, live tracks, alert log. Operator auth required. Demo mode anonymizes data.

---

**AC-10-01 — Live track marker renders on detection event**

```
GIVEN the dashboard is rendered with a mock NATS client
WHEN a threat event is emitted on 'sentinel.track.update' with threatId='drone-001'
THEN within 500ms a track marker with data-testid='track-marker-drone-001' appears on the map
  AND the marker position corresponds to the threat's coarsened coordinates
```

**AC-10-02 — Alert log displays last 50 events, not more**

```
GIVEN 60 alert events have been received since dashboard load
WHEN the alert log panel is inspected
THEN exactly 50 alert rows are visible
  AND the 50 most recent events are shown (oldest of 60 dropped)
```

**AC-10-03 — Heatmap cell activates only after threshold**

```
GIVEN a 500m × 500m grid cell has received 2 detection events
WHEN the heatmap renders
THEN that cell is NOT colored (below k-anonymity threshold of 3)

GIVEN the same cell receives a 3rd detection event
THEN the cell IS colored on the next heatmap update
```

**AC-10-04 — Heatmap updates on new detection event**

```
GIVEN the dashboard is mounted and heatmap is rendered
WHEN a new detection event arrives for a grid cell with >= 3 prior events
THEN the heatmap re-renders within 1 second
  AND the cell's color intensity increases
```

**AC-10-05 — Dashboard redirects to login without session token**

```
GIVEN no valid session token is present in localStorage/cookies
WHEN the dashboard page is accessed at /dashboard
THEN the browser is redirected to /login
  AND no threat data is fetched or displayed before authentication
```

**AC-10-06 — Demo mode anonymizes track classification labels**

```
GIVEN the dashboard is opened in demo mode (URL param: ?mode=demo or role=presentation)
WHEN track markers are rendered
THEN track classification labels are NOT shown (replaced with 'Airborne Contact')
  AND node position markers are NOT shown on the map
  AND confidence scores are NOT visible
```

**AC-10-07 — Alert log loads historical events on mount**

```
GIVEN threat_events records exist in Supabase from the last 24 hours
WHEN the dashboard mounts and alert log component initializes
THEN the alert log fetches and displays the most recent 50 events from Supabase
  AND events are displayed in reverse chronological order (newest first)
```

**AC-10-08 — NATS connection failure shows graceful error state**

```
GIVEN the NATS JetStream connection is unavailable
WHEN the dashboard attempts to subscribe to live updates
THEN an error banner is shown: "Live feed unavailable — showing historical data only"
  AND the dashboard does not crash
  AND historical alert log data (from Supabase) is still displayed
```

---

## Acceptance Gate Summary

All 97 ACs must pass for W7 to be declared COMPLETE. Wave is blocked on any AC failure.

| FR | AC Count | Must-Pass ACs (P0) |
|---|---|---|
| FR-W7-01 (16kHz Migration) | 9 | AC-01-01, AC-01-05, AC-01-08 |
| FR-W7-02 (Profile Expansion) | 8 | AC-02-03, AC-02-05, AC-02-06 |
| FR-W7-03 (TerminalPhaseDetector) | 11 | AC-03-01, AC-03-08, AC-03-09 |
| FR-W7-04 (ELRS RF Module) | 8 | AC-04-03, AC-04-04, AC-04-05 |
| FR-W7-05 (BearingTriangulator) | 8 | AC-05-01, AC-05-03, AC-05-07 |
| FR-W7-06 (PtzSlaveOutput) | 8 | AC-06-01, AC-06-03, AC-06-06 |
| FR-W7-07 (JammerActivation) | 9 | AC-07-04, AC-07-07, AC-07-09 |
| FR-W7-08 (PhysicalInterceptCoordinator) | 8 | AC-08-01, AC-08-04, AC-08-07 |
| FR-W7-09 (TdoaSolver Injection) | 8 | AC-09-01, AC-09-02, AC-09-06 |
| FR-W7-10 (Demo Dashboard) | 8 | AC-10-05, AC-10-06, AC-10-01 |
| **Total** | **97** | |

P0 ACs are those with safety, privacy, or data-correctness implications. These are never deferred.

---

*End of ACCEPTANCE_CRITERIA.md — W7*
