# APEX-SENTINEL W7 — Acceptance Criteria

> Wave: W7 — Hardware Integration + Data Pipeline Rectification + Terminal Phase Detection
> Last updated: 2026-03-25
> Format: BDD (Given / When / Then)
> Total ACs: 90 | Per FR: 8–10
> Author: APEX OS / Nicolae Fratila

---

## Overview

W7 closes the gap between the software acoustic intelligence pipeline (W1-W6, 629 tests)
and physical deployment. Critical changes in this wave:

1. **DATA BREACH REMEDIATION** — all audio processing migrates from 22050Hz to 16kHz.
   INDIGO team confirmed YAMNet requires 16kHz; running at 22050Hz was a silent spec violation
   that corrupted all feature extraction output.
2. **Profile expansion** — Gerbera (piston), Shahed-131 (small piston, higher RPM),
   Shahed-238 (turbine / jet engine 3-8kHz) added to AcousticProfileLibrary.
3. **Terminal phase detection** — 4-indicator FSM triggers TERMINAL state before impact;
   coordinates TerminalPhaseEvent emission to all downstream output channels.
4. **Hardware outputs** — PTZ camera slaving (ONVIF), jammer activation, physical intercept
   coordination (SkyNet), all gated on confirmed tracks.
5. **Coordinate injection** — hardcoded {lat:51.5,lon:4.9} replaced by TdoaSolver live output.
6. **Demo Dashboard** — Next.js operator UI for live monitoring with operator authentication.

All ACs are executable as Vitest describe/it test descriptions.
AC IDs are stable and referenced from FR_REGISTER.md and TEST_STRATEGY.md.

---

## FR-W7-01: DatasetPipeline 16kHz Migration

**Summary:** Migrate `TARGET_SAMPLE_RATE` from 22050 to 16000 Hz across the entire
DatasetPipeline, AudioCapture, FFT windowing, and YAMNet inference path. All upstream
audio must be resampled before feature extraction. A backward-compat shim must allow
legacy 22050Hz WAV files to be accepted and silently resampled to 16kHz. No pipeline
stage may reference the constant 22050 after this migration.

---

**AC-01-01 — Target sample rate constant is 16000**

```
GIVEN the DatasetPipeline module is imported
WHEN TARGET_SAMPLE_RATE is read from the module's exported constants
THEN TARGET_SAMPLE_RATE === 16000
  AND no reference to the integer 22050 exists in AudioCapture, FFT,
      YAMNetFineTuner, or AcousticClassifier source files
  AND any mention of 22050 in source is an error comment only
```

**AC-01-02 — Audio captured at 16kHz**

```
GIVEN an AudioCapture instance configured with default settings
WHEN captureChunk() is called and a PCM chunk is returned
THEN chunk.sampleRate === 16000
  AND chunk.samples.length === 16000 * chunk.durationSeconds (within ±1 sample rounding)
  AND chunk.channelCount === 1 (mono)
```

**AC-01-03 — YAMNet receives 16kHz input without error**

```
GIVEN a YAMNetFineTuner instance with a loaded model
  AND a Float32Array of 16000 samples (1 second of audio at 16kHz)
WHEN infer(samples) is called
THEN no resampling error is thrown
  AND the returned ClassificationResult has a valid label (non-empty string)
  AND result.confidence is in [0, 1]
  AND result.sampleRate === 16000
```

**AC-01-04 — Legacy 22050Hz WAV resampled via backward-compat shim**

```
GIVEN a WAV file recorded at 22050Hz (legacy field recording)
  AND the DatasetPipeline is initialized with legacyResampleShim: true
WHEN loadAudioFile(path) is called
THEN the returned Float32Array has length === Math.round(originalLength * 16000 / 22050)
  AND no exception is thrown
  AND a WARN log line contains the string "resampled from 22050 to 16000"
  AND the returned metadata.sampleRate === 16000
```

**AC-01-05 — Spectral content preserved after resampling (piston drone frequency)**

```
GIVEN a synthetic pure 200Hz sine wave recorded at 22050Hz
  (200Hz is within Shahed-136 piston acoustic signature band)
WHEN it is resampled to 16000Hz via the backward-compat shim
THEN an FFT of the resampled signal shows a dominant peak at 200Hz ± 5Hz
  AND the peak magnitude is within 3dB of the original pre-resample peak magnitude
  AND no aliasing artefacts appear below 8000Hz at amplitudes > -60dBFS
```

**AC-01-06 — FFT window size and frequency resolution updated for 16kHz**

```
GIVEN the FFT module is configured with default settings for the 16kHz pipeline
WHEN computeSpectrum(chunk) is called with a 1-second 16kHz chunk
THEN spectrum.frequencyResolution === 16000 / FFT_WINDOW_SIZE
  AND spectrum.frequencyResolution <= 10Hz (sufficient for drone acoustic features)
  AND spectrum.nyquistHz === 8000
  AND no frequencies above 8000Hz are returned
```

**AC-01-07 — Performance not degraded by resampling**

```
GIVEN a batch of 100 audio chunks at 22050Hz requiring resampling to 16kHz
WHEN DatasetPipeline.processBatch(chunks, { resample: true }) is called
THEN total batch processing time < 500ms
  AND per-chunk latency p99 < 8ms
  AND memory allocation does not exceed input buffer size × 2
```

**AC-01-08 — End-to-end pipeline functions at 16kHz**

```
GIVEN the full pipeline is initialized: AudioCapture → VAD → FFT → YAMNet
  AND all components are configured for 16kHz
WHEN a synthetic 200Hz audio signal is injected
THEN a DetectionEvent is emitted within 2000ms
  AND detectionEvent.classification.sampleRate === 16000
  AND no pipeline stage emits a sample-rate mismatch error
  AND the pipeline remains running after the detection
```

**AC-01-09 — DatasetPipeline rejects out-of-range sample rates without shim**

```
GIVEN the DatasetPipeline is initialized with legacyResampleShim: false
WHEN loadAudioFile(path) is called with a 44100Hz WAV file
THEN a SampleRateMismatchError is thrown
  AND error.message includes "expected 16000, got 44100"
  AND error.code === "SAMPLE_RATE_MISMATCH"
  AND error.receivedRate === 44100
  AND error.expectedRate === 16000
```

---

## FR-W7-02: AcousticProfileLibrary Expansion

**Summary:** Add three new acoustic profiles to AcousticProfileLibrary:
- **Gerbera** — piston engine loitering munition, freqMin=167Hz, freqMax=217Hz,
  rpmRange=[9000, 12000], falsePositiveRisk='medium'
- **Shahed-131** — small piston variant (lighter airframe than -136), freqMin=150Hz,
  freqMax=400Hz, RPM higher than Shahed-136, falsePositiveRisk='low'
- **Shahed-238** — turbine (jet) engine variant, freqMin=3000Hz, freqMax=8000Hz,
  engineType='turbine', falsePositiveRisk='low'

Each profile must carry: id, label, freqMin, freqMax, rpmRange, engineType,
propellerBladeCount (where applicable), falsePositiveRisk, signatureNotes.

---

**AC-02-01 — Gerbera profile matched by frequency range**

```
GIVEN the AcousticProfileLibrary is initialized with W7 profiles
WHEN matchFrequency({ fMin: 167, fMax: 217 }) is called
THEN result is not null
  AND result.label === 'gerbera'
  AND result.confidence > 0.75
```

**AC-02-02 — Gerbera full profile fields are complete**

```
GIVEN the AcousticProfileLibrary is initialized
WHEN getProfile('gerbera') is called
THEN result.freqMin === 167
  AND result.freqMax === 217
  AND result.falsePositiveRisk is one of ['low', 'medium', 'high']
  AND result.rpmRange is an array [min, max] of two positive numbers
  AND result.signatureNotes is a non-empty string describing the acoustic signature
  AND result.id is a non-empty unique string
```

**AC-02-03 — Shahed-131 RPM range higher than Shahed-136**

```
GIVEN both 'shahed-131' and 'shahed-136' profiles are retrieved from the library
WHEN shahed131.rpmRange and shahed136.rpmRange are compared
THEN shahed131.rpmRange[0] > shahed136.rpmRange[0]
  AND shahed131.rpmRange[1] > shahed136.rpmRange[1]
  (rationale: Shahed-131 is a lighter / smaller airframe, higher RPM to sustain flight)
```

**AC-02-04 — Shahed-131 frequency range is defined**

```
GIVEN the AcousticProfileLibrary is initialized
WHEN getProfile('shahed-131') is called
THEN result.freqMin === 150
  AND result.freqMax === 400
  AND result.label === 'shahed-131'
  AND result.engineType === 'piston'
```

**AC-02-05 — Shahed-238 turbine frequency range is defined**

```
GIVEN the AcousticProfileLibrary is initialized
WHEN getProfile('shahed-238') is called
THEN result.freqMin === 3000
  AND result.freqMax === 8000
  AND result.engineType === 'turbine'
  AND result.falsePositiveRisk === 'low'
  AND result.label === 'shahed-238'
```

**AC-02-06 — Shahed-238 matched on turbine-frequency audio input**

```
GIVEN a frequency range of 4000Hz to 6000Hz (mid-band turbine content)
WHEN matchFrequency({ fMin: 4000, fMax: 6000 }) is called
THEN result is not null
  AND result.label === 'shahed-238'
  AND result.confidence > 0.7
  AND result.engineType === 'turbine'
```

**AC-02-07 — DroneProfileNotFoundError thrown for unknown drone type**

```
GIVEN a drone type identifier 'phantom-x9' that does not exist in the library
WHEN getProfile('phantom-x9') is called
THEN a DroneProfileNotFoundError is thrown
  AND error.droneType === 'phantom-x9'
  AND error.availableProfiles is an array containing 'gerbera', 'shahed-131', 'shahed-238'
  AND error.message includes 'phantom-x9'
```

**AC-02-08 — Turbine profiles do not collide with piston profiles on matchFrequency**

```
GIVEN the AcousticProfileLibrary is initialized with all W7 profiles
WHEN matchFrequency({ fMin: 3000, fMax: 8000 }) is called
THEN result.label === 'shahed-238'
  AND result.label !== 'shahed-136'
  AND result.label !== 'gerbera'
  AND result.label !== 'shahed-131'
  (turbine frequency range must not ambiguously resolve to piston profiles)
```

**AC-02-09 — getAllProfiles returns all W7 profiles**

```
GIVEN the AcousticProfileLibrary is initialized with W7 profiles
WHEN getAllProfiles() is called
THEN result.length >= 7
  AND result.some(p => p.label === 'gerbera') === true
  AND result.some(p => p.label === 'shahed-131') === true
  AND result.some(p => p.label === 'shahed-238') === true
  AND every profile has a unique id
  AND W6 profiles (shahed-136, lancet-3, etc.) are still present
```

**AC-02-10 — falsePositiveRisk field is set on every profile**

```
GIVEN getAllProfiles() is called
WHEN iterating over every returned profile
THEN every profile has falsePositiveRisk in ['low', 'medium', 'high']
  AND no profile has falsePositiveRisk === undefined
  AND no profile has falsePositiveRisk === null
  AND shahed-238 has falsePositiveRisk === 'low' (jet engine, distinctive)
```

---

## FR-W7-03: TerminalPhaseDetector

**Summary:** 4-indicator finite state machine tracking drone terminal attack phase.
States: CRUISE → APPROACH → TERMINAL → IMPACT.
Indicators: speedExceedsThreshold, headingLockedToTarget, altitudeDescentRate, rfLinkSilent.
All 4 indicators must be simultaneously active to enter TERMINAL state.
APPROACH state when 2-3 indicators active. IMPACT when altitude crosses zero.
FSM state is monotonically increasing — no regression from TERMINAL back to CRUISE.

---

**AC-03-01 — Speed alone does not trigger TERMINAL state**

```
GIVEN a TerminalPhaseDetector with default thresholds (speedThresholdKmh=150)
  AND a track update: speedKmh=200, headingLockedToTarget=false,
      altitudeDescentRateMs=2, rfLinkSilent=false
WHEN evaluate(trackUpdate) is called
THEN result.state !== 'TERMINAL'
  AND result.state is 'CRUISE' or 'APPROACH'
  AND result.activeIndicators.speedExceedsThreshold === true
  AND result.activeIndicators.headingLockedToTarget === false
  AND result.indicatorCount === 1
```

**AC-03-02 — Heading lock alone does not trigger TERMINAL state**

```
GIVEN a track update: headingLockedToTarget=true, speedKmh=60,
      altitudeDescentRateMs=1, rfLinkSilent=false
WHEN evaluate(trackUpdate) is called
THEN result.state !== 'TERMINAL'
  AND result.activeIndicators.headingLockedToTarget === true
  AND result.indicatorCount === 1
```

**AC-03-03 — RF silence alone does not trigger TERMINAL state**

```
GIVEN a track update: rfLinkSilent=true, speedKmh=60,
      headingLockedToTarget=false, altitudeDescentRateMs=2
WHEN evaluate(trackUpdate) is called
THEN result.state !== 'TERMINAL'
  AND result.activeIndicators.rfLinkSilent === true
  AND result.indicatorCount === 1
```

**AC-03-04 — All 4 indicators active transitions to TERMINAL**

```
GIVEN a track update:
  speedKmh=200 (exceeds threshold 150)
  headingLockedToTarget=true
  altitudeDescentRateMs=15 (exceeds threshold 8 m/s)
  rfLinkSilent=true
WHEN evaluate(trackUpdate) is called
THEN result.state === 'TERMINAL'
  AND result.confidence >= 0.9
  AND result.indicatorCount === 4
  AND result.activeIndicators.speedExceedsThreshold === true
  AND result.activeIndicators.headingLockedToTarget === true
  AND result.activeIndicators.altitudeDescentRate === true
  AND result.activeIndicators.rfLinkSilent === true
```

**AC-03-05 — TERMINAL transitions to IMPACT when altitude reaches zero**

```
GIVEN a TerminalPhaseDetector currently in TERMINAL state
WHEN a subsequent track update arrives with altitudeM <= 0
THEN result.state === 'IMPACT'
  AND result.impactTimestampMs is a positive integer (Unix ms)
  AND result.impactPosition.lat is a finite number
  AND result.impactPosition.lon is a finite number
  AND result.impactPosition.lat === trackUpdate.lat
```

**AC-03-06 — FSM transitions are monotonic (no regression from TERMINAL)**

```
GIVEN a TerminalPhaseDetector that has entered TERMINAL state
WHEN a subsequent track update has rfLinkSilent=false (indicator drops out)
THEN result.state remains 'TERMINAL' (no regression to APPROACH or CRUISE)
  AND a TerminalPhaseRegressionWarning event is emitted
  AND result.regressionWarning === true
```

**AC-03-07 — APPROACH state when 2 or 3 indicators are active**

```
GIVEN a track update with exactly 2 active indicators:
  speedKmh=200 (exceeds threshold), headingLockedToTarget=true
  altitudeDescentRateMs=1 (below threshold), rfLinkSilent=false
WHEN evaluate(trackUpdate) is called
THEN result.state === 'APPROACH'
  AND result.indicatorCount === 2
  AND result.confidence >= 0.3
  AND result.confidence < 0.7
```

**AC-03-08 — Confidence scales with indicator count**

```
GIVEN evaluate() is called in separate invocations with 1, 2, 3, and 4 active indicators
WHEN comparing the confidence values of each result
THEN confidence(1 indicator) < confidence(2 indicators)
  AND confidence(2 indicators) < confidence(3 indicators)
  AND confidence(3 indicators) < confidence(4 indicators)
  AND confidence(4 indicators) >= 0.9
```

**AC-03-09 — TerminalPhaseEvent published to NATS on TERMINAL entry**

```
GIVEN a TerminalPhaseDetector with a NATS client mock injected
  AND the detector is transitioning from APPROACH to TERMINAL
WHEN evaluate(trackUpdate) is called and state becomes 'TERMINAL'
THEN NATS publish is called exactly once with subject "sentinel.terminal_phase.{trackId}"
  AND the payload conforms to TerminalPhaseEvent interface
  AND payload.state === 'TERMINAL'
  AND payload.trackId === trackUpdate.trackId
  AND payload.timestamp is an ISO 8601 string
```

**AC-03-10 — Time-to-impact estimate provided in TERMINAL state**

```
GIVEN a TERMINAL state result with altitudeM=500 and altitudeDescentRateMs=15
WHEN result.estimatedTimeToImpactS is read
THEN result.estimatedTimeToImpactS is approximately Math.round(500 / 15) ± 2 seconds
  AND result.estimatedTimeToImpactS > 0
  AND result.estimatedTimeToImpactS is a finite number
```

---

## FR-W7-04: ElrsRfFingerprint

**Summary:** Detect Foxeer TRX1003 ELRS control link operating on 868/915MHz FHSS.
Output packetLossRate (rolling 2s window) and rfSilent flag.
rfSilent=true when packet loss rate exceeds 80% sustained for 2 consecutive seconds.
Must not produce false positives on non-ELRS 900MHz traffic (e.g. LoRa IoT sensors).

---

**AC-04-01 — Burst detection on synthetic FHSS signal**

```
GIVEN a synthetic RF capture with FHSS bursts at 868MHz, 50 packets per second
  AND inter-burst interval consistent with ELRS 500Hz output mode
WHEN ElrsRfFingerprint.analyze(capture) is called
THEN result.detected === true
  AND result.centerFrequencyMHz is within [860, 920]
  AND result.burstPattern === 'FHSS'
  AND result.estimatedProtocol === 'ELRS'
  AND result.confidence > 0.8
```

**AC-04-02 — rfSilent=false when packet flow is normal**

```
GIVEN an ELRS RF capture with packetLossRate = 0.05 (5% loss)
  AND measurement window = 2000ms
WHEN analyze(capture) is called
THEN result.rfSilent === false
  AND result.packetLossRate === 0.05 ± 0.01
  AND result.detected === true
```

**AC-04-03 — rfSilent=true when loss exceeds 80% for 2 seconds**

```
GIVEN a 3-second RF capture where:
  T=0 to T=1000ms: 5% packet loss (normal link)
  T=1000ms to T=3000ms: 85% packet loss (RF link dropped / jammed / terminal phase)
WHEN analyze(capture) is called with windowMs=2000
THEN result.rfSilent === true
  AND result.silenceOnsetTimestampMs >= 1000
  AND result.packetLossRate > 0.8
  AND result.windowMs === 2000
```

**AC-04-04 — rfSilent requires sustained loss (not momentary spike)**

```
GIVEN a capture with 90% packet loss for only 1.5 seconds (below the 2s threshold)
WHEN analyze(capture) is called
THEN result.rfSilent === false
  AND result.packetLossRate > 0.8
  AND a debug log is emitted: "sustained loss threshold not yet met: 1500ms < 2000ms"
```

**AC-04-05 — No false positive on LoRa 915MHz IoT traffic**

```
GIVEN an RF capture of LoRa IoT traffic at 915MHz with spread-spectrum chirp modulation
  AND the chirp pattern is consistent with LoRa SF9 (not FHSS burst pattern)
WHEN analyze(capture) is called
THEN result.detected === false OR result.estimatedProtocol !== 'ELRS'
  AND result.rfSilent === false
  AND no TERMINAL phase trigger is issued based on this result
```

**AC-04-06 — Dual-band detection covers both 868MHz and 915MHz sub-bands**

```
GIVEN an ELRS capture hopping across both 868MHz and 915MHz sub-bands
  (ELRS supports both EU 868MHz and US 915MHz allocations)
WHEN analyze(capture) is called
THEN result.detected === true
  AND result.bandsMHz includes 868
  AND result.bandsMHz includes 915
  AND result.burstPattern === 'FHSS'
```

**AC-04-07 — packetLossRate is a rolling window, not cumulative**

```
GIVEN a continuous RF stream and ElrsRfFingerprint running in streaming mode
  AND T=0 to T=1000ms: 0% loss
  AND T=1000ms to T=3000ms: 90% loss
WHEN packetLossRate is queried at T=3000ms with windowMs=2000
THEN the returned rate reflects only the window T=1000ms to T=3000ms
  AND result.packetLossRate >= 0.8
  AND the clean T=0 to T=1000ms window is NOT included in the rate calculation
```

**AC-04-08 — Signal strength metadata captured alongside fingerprint**

```
GIVEN an ELRS capture with RSSI=-75dBm and SNR=+10dB
WHEN analyze(capture) is called
THEN result.rssiDbm === -75 ± 3
  AND result.snrDb === 10 ± 2
  AND result.snrDb is a finite number
```

---

## FR-W7-05: BearingTriangulator

**Summary:** Accept an array of bearing reports {lat, lon, bearingDeg, weight?} from
distributed sensor nodes (fixed microphone arrays, INDIGO mobile phones with compass).
Compute geographic intersection via weighted least-squares minimisation.
Return {lat, lon, confidenceM, gdop, nodeCount, degenerateGeometry?}.
Phone nodes carry weight=0.5 vs fixed sensors at weight=1.0.

---

**AC-05-01 — Three-node correct geographic intersection**

```
GIVEN three bearing reports that geometrically intersect at lat=51.5000, lon=4.9000:
  node1: {lat:51.4900, lon:4.8900, bearingDeg:44.8, weight:1.0}
  node2: {lat:51.5100, lon:4.8900, bearingDeg:135.2, weight:1.0}
  node3: {lat:51.5000, lon:4.9200, bearingDeg:270.0, weight:1.0}
WHEN BearingTriangulator.triangulate(reports) is called
THEN result.lat is within 0.001 degrees of 51.5000
  AND result.lon is within 0.001 degrees of 4.9000
  AND result.confidenceM < 200
  AND result.nodeCount === 3
```

**AC-05-02 — Two-node bearing returns result with elevated uncertainty**

```
GIVEN only two bearing reports (minimum viable input)
  AND both reports have consistent bearing directions
WHEN triangulate(reports) is called
THEN result is not null
  AND result.confidenceM > 500
  AND result.lat is a finite number
  AND result.lon is a finite number
  AND result.nodeCount === 2
```

**AC-05-03 — Collinear nodes return null or minimum-confidence result**

```
GIVEN three nodes arranged in a straight east-west line (degenerate geometry):
  node1: {lat:51.50, lon:4.85, bearingDeg:90.0}
  node2: {lat:51.50, lon:4.90, bearingDeg:90.0}
  node3: {lat:51.50, lon:4.95, bearingDeg:90.0}
WHEN triangulate(reports) is called
THEN result === null OR result.confidenceM > 5000
  AND if result is not null, result.degenerateGeometry === true
  AND a WARN log is emitted: "degenerate geometry detected: collinear nodes"
```

**AC-05-04 — Four-node overdetermined least-squares is more accurate than three-node**

```
GIVEN four bearing reports with independent Gaussian bearing noise sigma=0.5deg
  AND true intersection at lat=51.5000, lon=4.9000
WHEN triangulate(reports) is called
THEN result.lat is within 0.0005 degrees of 51.5000
  AND result.lon is within 0.0005 degrees of 4.9000
  AND result.confidenceM < 100
  AND result.nodeCount === 4
```

**AC-05-05 — Phone node weighted lower than fixed sensor**

```
GIVEN a mix of bearing reports:
  fixedSensor1 at lat=51.490, weight=1.0, accurate bearing
  fixedSensor2 at lat=51.510, weight=1.0, accurate bearing
  phoneNode at lat=51.500, weight=0.5, bearing with +5deg systematic error
WHEN triangulate(reports) is called
THEN the result is closer to the fixed-sensor intersection than to the phone-biased result
  AND result.lat is within 0.002 degrees of true intersection
```

**AC-05-06 — Single node returns BearingInsufficientNodesError**

```
GIVEN only one bearing report is provided
WHEN triangulate([singleReport]) is called
THEN a BearingInsufficientNodesError is thrown
  AND error.minimumRequired === 2
  AND error.provided === 1
```

**AC-05-07 — GDOP computed and reflects geometry quality**

```
GIVEN two separate sets of bearing reports:
  setA: four well-distributed nodes (90-degree separation around target) — good geometry
  setB: four nodes clustered in a 20-degree arc — poor geometry
WHEN triangulate is called on both sets
THEN resultA.gdop < 2.0
  AND resultB.gdop > resultA.gdop
  AND gdop is a positive finite number in both cases
```

**AC-05-08 — Out-of-range bearing angles rejected with warning**

```
GIVEN a bearing report with bearingDeg=400 (invalid, must be in [0, 360))
  AND two additional valid reports
WHEN triangulate([...validReports, invalidReport]) is called
THEN the invalid report is excluded from the computation
  AND a WARN log is emitted: "bearing out of range [400], node excluded"
  AND the remaining 2 valid reports are still processed
  AND result.nodeCount === 2 (invalid node not counted)
```

---

## FR-W7-06: PtzSlaveOutput

**Summary:** Slave a Dahua PTZ camera to a confirmed drone track via ONVIF RelativeMove
over HTTP/SOAP. Publish bearing commands at minimum 100Hz. Use EKF predicted position
at t+8ms (not current measured position) to compensate for mechanical lag.
Stop publishing when the pipeline stops; rate-limit pan speed for mechanical safety.

---

**AC-06-01 — ONVIF RelativeMove XML is correctly formed**

```
GIVEN a bearing of 45.5 degrees and elevation of 12.3 degrees
WHEN PtzSlaveOutput.pointCamera({bearingDeg: 45.5, elevationDeg: 12.3}) is called
THEN the outgoing HTTP POST body is valid SOAP XML
  AND it contains a <PanTilt x="..." y="..."/> element with correct relative delta values
  AND the Content-Type header === "application/soap+xml"
  AND the SOAPAction header includes "RelativeMove"
  AND the XML namespace is "http://www.onvif.org/ver20/ptz/wsdl"
```

**AC-06-02 — Bearing published at minimum 100Hz sustained**

```
GIVEN a PtzSlaveOutput connected to a mock ONVIF endpoint (1ms response latency)
  AND a running EKF track producing state updates
WHEN the output is active and observed for 1000ms
THEN at least 100 ONVIF RelativeMove calls are dispatched
  AND the inter-call interval p99 < 12ms
  AND no frame drops are logged during the measurement window
```

**AC-06-03 — Uses EKF t+8ms predicted position, not current measured position**

```
GIVEN an EKF track state at t=T:
  position: lat=51.500000, lon=4.900000
  velocity: vLon=+0.001 deg/s, vLat=0
  EKF predicted position at t+8ms: lat=51.500000, lon=4.9000080
WHEN PtzSlaveOutput.publishBearing(trackId) is called at time T
THEN the ONVIF bearing command is computed from lat=51.500000, lon=4.9000080
  AND NOT from the current measured lat=51.500000, lon=4.900000
  AND the bearing delta between the two positions is non-zero
```

**AC-06-04 — Stops publishing when pipeline stops**

```
GIVEN a running PtzSlaveOutput actively publishing at 100Hz
WHEN SentinelPipelineV2.stop() is called
THEN PtzSlaveOutput dispatches no further ONVIF commands within 100ms of stop
  AND a log line "PtzSlaveOutput: stopped" is emitted
  AND no error or exception is thrown
  AND the ONVIF session is closed cleanly
```

**AC-06-05 — ONVIF connection timeout handled gracefully**

```
GIVEN the ONVIF endpoint is unreachable (simulated timeout after 2000ms)
WHEN PtzSlaveOutput.pointCamera() is called
THEN an OrvifConnectionError is caught internally
  AND the error is logged at severity WARN
  AND subsequent attempts use exponential backoff (100ms, 200ms, 400ms, max 3 retries)
  AND the SentinelPipelineV2 does not crash or stop
```

**AC-06-06 — Pan rate clamped for mechanical safety**

```
GIVEN consecutive bearing commands requiring a pan rate greater than maxPanRateDegS (default 90 deg/s)
WHEN PtzSlaveOutput processes the command sequence
THEN the pan delta per command is clamped such that rate <= 90 deg/s
  AND a DEBUG log "pan rate clamped: requested {x} deg/s, limited to 90 deg/s" is emitted
  AND the camera is never sent a physically impossible instantaneous jump
```

**AC-06-07 — Bearing published to NATS PTZ_BEARING subject**

```
GIVEN a running PtzSlaveOutput with a NATS client mock injected
WHEN a bearing update is dispatched for trackId='track-007'
THEN NATS publish is called with subject "sentinel.ptz_bearing.track-007"
  AND the payload includes: bearingDeg, elevationDeg, predictedPositionMs=8,
      sourcePosition (lat/lon), timestamp (ISO 8601)
```

**AC-06-08 — Multiple cameras can be independently slaved to the same track**

```
GIVEN two PtzSlaveOutput instances, camera-A at IP 192.168.1.101
  AND camera-B at IP 192.168.1.102
  AND both configured to slave trackId='track-001'
WHEN the track moves over 500ms
THEN camera-A receives at least 50 ONVIF commands
  AND camera-B receives at least 50 ONVIF commands
  AND neither camera's command stream is blocked by the other's network latency
```

---

## FR-W7-07: JammerActivation

**Summary:** Map confirmed drone class to jammer frequency channel and issue activation
command to jammer hardware. FPV drones → 900MHz channel. Shahed-136/131/238 → 1575MHz
(GPS denial). Never activate on tracks where isFalsePositive=true. Log all activations
and deactivations to Supabase jammer_activations table. Prevent duplicate activations.

---

**AC-07-01 — FPV drone maps to 900MHz channel**

```
GIVEN a confirmed track with droneClass='fpv-racer' and isFalsePositive=false
WHEN JammerActivation.activate(track) is called
THEN result.channel === '900MHz'
  AND result.activated === true
  AND result.droneClass === 'fpv-racer'
  AND result.jammerType === 'rf-denial'
```

**AC-07-02 — Shahed-136 maps to 1575MHz GPS-denial channel**

```
GIVEN a confirmed track with droneClass='shahed-136' and isFalsePositive=false
WHEN JammerActivation.activate(track) is called
THEN result.channel === '1575MHz'
  AND result.activated === true
  AND result.jammerType === 'gps-denial'
```

**AC-07-03 — Shahed-238 turbine also maps to 1575MHz**

```
GIVEN a confirmed track with droneClass='shahed-238' and isFalsePositive=false
WHEN JammerActivation.activate(track) is called
THEN result.channel === '1575MHz'
  AND result.activated === true
  AND result.engineType === 'turbine'
```

**AC-07-04 — No activation when isFalsePositive=true**

```
GIVEN a track with droneClass='shahed-136' and isFalsePositive=true
WHEN JammerActivation.activate(track) is called
THEN result.activated === false
  AND result.suppressionReason === 'false_positive_track'
  AND no jammer hardware command is issued to external systems
  AND a suppression log entry is written
```

**AC-07-05 — Activation event logged to Supabase jammer_activations**

```
GIVEN a confirmed FPV track triggering jammer activation
WHEN JammerActivation.activate(track) is called and completes
THEN a row is inserted into the jammer_activations Supabase table
  AND the row contains: trackId, droneClass, channel, activatedAt, operatorId
  AND activatedAt is within 1000ms of the current UTC time
  AND the Supabase insert completes within 500ms
```

**AC-07-06 — Unknown drone class does not activate jammer**

```
GIVEN a track with droneClass='unknown-uav'
WHEN JammerActivation.activate(track) is called
THEN result.activated === false
  AND result.suppressionReason === 'unknown_drone_class'
  AND a WARN log is emitted containing 'unknown-uav'
  AND no hardware command is dispatched
```

**AC-07-07 — Jammer deactivated automatically when track is LOST**

```
GIVEN an active jammer activation associated with trackId='track-001'
WHEN the track state transitions to status='LOST'
THEN JammerActivation.deactivate('track-001') is called automatically by the pipeline
  AND the jammer hardware receives a deactivation command
  AND a row update is made to jammer_activations setting endedAt to current UTC
  AND result.deactivated === true
```

**AC-07-08 — Duplicate activation on same track is prevented**

```
GIVEN a jammer already actively assigned to trackId='track-001' on '900MHz'
WHEN JammerActivation.activate(track) is called again for the same trackId
THEN result.activated === false
  AND result.suppressionReason === 'already_active'
  AND no duplicate hardware command is issued to the jammer
  AND no duplicate row is inserted into jammer_activations
```

---

## FR-W7-08: PhysicalInterceptCoordinator

**Summary:** Accept an ImpactPrediction (from MonteCarloPropagator/ImpactEstimator) and
a SkyNetUnitRegistry. Select the nearest available intercept unit. Issue a SkyNetFireCommand
only when prediction.confidence > 0.6. Fire timing = timeToImpact - unit.netFlightTimeS.
If fireAtS would be negative (too late), suppress the command. Log to skynet_activations.

---

**AC-08-01 — No fire command issued when confidence below 0.6**

```
GIVEN an ImpactPrediction with confidence=0.55
  AND a SkyNetUnitRegistry with 3 available units
WHEN PhysicalInterceptCoordinator.evaluate(prediction) is called
THEN result.fireCommand === null
  AND result.suppressionReason === 'confidence_below_threshold'
  AND result.confidence === 0.55
  AND no entry is written to skynet_activations
```

**AC-08-02 — Nearest available unit is selected**

```
GIVEN an ImpactPrediction at lat=51.500, lon=4.900
  AND SkyNetUnitRegistry containing:
    {unitId:'unit-A', lat:51.510, lon:4.900, status:'READY'}  (≈1.1km)
    {unitId:'unit-B', lat:51.490, lon:4.900, status:'READY'}  (≈1.1km)
    {unitId:'unit-C', lat:51.600, lon:4.900, status:'READY'}  (≈11km)
WHEN evaluate(prediction) is called with confidence=0.9
THEN result.fireCommand.unitId is either 'unit-A' or 'unit-B'
  AND result.fireCommand.unitId !== 'unit-C'
```

**AC-08-03 — Fire timing is timeToImpact minus unit netFlightTime**

```
GIVEN an ImpactPrediction with timeToImpactS=30
  AND selected unit has netFlightTimeS=8
WHEN evaluate(prediction) is called
THEN result.fireCommand.fireAtS === 22
  (i.e. timeToImpactS - netFlightTimeS = 30 - 8 = 22)
```

**AC-08-04 — SkyNetFireCommand conforms to schema**

```
GIVEN a high-confidence ImpactPrediction (confidence=0.85)
  AND at least one unit available
WHEN evaluate(prediction) returns a result with fireCommand not null
THEN result.fireCommand.unitId is a non-empty string
  AND result.fireCommand.bearing is in [0, 360]
  AND result.fireCommand.elevationDeg is in [-90, 90]
  AND result.fireCommand.fireAtS is a positive finite number
  AND result.fireCommand.trackId === prediction.trackId
  AND result.fireCommand.issuedAt is an ISO 8601 string
```

**AC-08-05 — No unit available returns null fire command with CRITICAL log**

```
GIVEN a SkyNetUnitRegistry where all units have status='OFFLINE'
WHEN evaluate(prediction) is called with confidence=0.95
THEN result.fireCommand === null
  AND result.suppressionReason === 'no_units_available'
  AND a CRITICAL severity log is emitted: "PhysicalInterceptCoordinator: no units available"
  AND no entry is written to skynet_activations
```

**AC-08-06 — Fire command suppressed when fireAtS would be negative**

```
GIVEN an ImpactPrediction with timeToImpactS=5 (imminent)
  AND the selected unit has netFlightTimeS=8 (intercept flight longer than time to impact)
WHEN evaluate(prediction) is called
THEN result.fireCommand === null OR result.fireCommand.fireAtS === 0
  AND result.suppressionReason === 'too_late_to_intercept'
  AND a WARN log is emitted: "intercept window missed: timeToImpact=5s < netFlightTime=8s"
```

**AC-08-07 — Bearing to impact point computed from unit position**

```
GIVEN unit at lat=51.490, lon=4.900 (due south of predicted impact)
  AND predicted impact at lat=51.510, lon=4.900 (due north)
WHEN the fire command is generated
THEN result.fireCommand.bearing === 0 ± 2 degrees (due north)
  AND result.fireCommand.elevationDeg > 0 (target is above horizon from unit position)
```

**AC-08-08 — Activation logged to Supabase skynet_activations**

```
GIVEN a successful fire command issued for trackId='track-042'
WHEN evaluate(prediction) completes
THEN a row is inserted into the skynet_activations Supabase table containing:
  unitId, trackId, bearing, elevationDeg, fireAtS, issuedAt, confidence, impactLat, impactLon
  AND the insert completes within 500ms
  AND issuedAt is within 1000ms of current UTC
```

---

## FR-W7-09: SentinelPipelineV2

**Summary:** Replace all hardcoded {lat:51.5, lon:4.9} origin coordinates with dynamic
TdoaSolver.solve() output. When TdoaSolver returns null, fall back to lastKnownGoodCoordinates
and emit a WARN. When TdoaSolver throws, catch and use fallback without propagating.
No hardcoded coordinates anywhere in src/ source files.

---

**AC-09-01 — No hardcoded coordinates remain in source**

```
GIVEN the full SentinelPipelineV2 source tree under src/
WHEN a static scan searches for the literal strings "51.5" and "4.9"
THEN no matches are found in any .ts source file
  AND coordinates only appear in test fixtures, configuration files, or comments
  AND SentinelPipelineV2 has zero hardcoded lat/lon values
```

**AC-09-02 — Coordinates change when TdoaSolver returns different values**

```
GIVEN a TdoaSolver mock configured to return {lat:48.8566, lon:2.3522} (Paris)
  AND SentinelPipelineV2 running with this mock injected
WHEN a detection event is produced
THEN detectionEvent.position.lat is within 0.01 of 48.8566
  AND detectionEvent.position.lon is within 0.01 of 2.3522
  AND no detection uses lat=51.5 or lon=4.9
```

**AC-09-03 — Pipeline uses lastKnownGood when TdoaSolver returns null**

```
GIVEN a TdoaSolver mock that returns null on every call
  AND a lastKnownGoodCoordinates cache holding {lat:51.5, lon:4.9} from a prior call
WHEN a detection frame is processed
THEN the pipeline does not crash
  AND the emitted detection uses lat=51.5, lon=4.9 (from cache)
  AND a WARN log is emitted: "TdoaSolver returned null, using last known good"
  AND event.coordinateSource === 'last_known_good'
```

**AC-09-04 — TdoaSolver is called once per detection cycle**

```
GIVEN a TdoaSolver mock with a call counter
WHEN SentinelPipelineV2 processes 10 audio frames
THEN TdoaSolver.solve() is called exactly 10 times
  AND no frame uses coordinates from a prior frame's TdoaSolver result
```

**AC-09-05 — Pipeline holds without emitting when no coordinates available**

```
GIVEN TdoaSolver returns null on every call
  AND no lastKnownGoodCoordinates is initialised (cold start)
WHEN the pipeline processes frames for 10 seconds
THEN no DetectionEvents are emitted
  AND a WARN log is emitted every 5 seconds: "awaiting valid TDOA coordinates"
  AND the pipeline continues running and does not crash
```

**AC-09-06 — SentinelPipelineV2 emits pipeline version and coordinate source in events**

```
GIVEN SentinelPipelineV2 running with TdoaSolver returning valid coordinates
WHEN any DetectionEvent is emitted
THEN event.pipelineVersion === 'v2'
  AND event.coordinateSource is one of ['tdoa_solver', 'last_known_good', 'config_fallback']
```

**AC-09-07 — TdoaSolver exception does not crash pipeline**

```
GIVEN a TdoaSolver mock that throws new Error("TDOA calculation failed") on every call
  AND lastKnownGoodCoordinates is available
WHEN the pipeline processes a frame
THEN the error is caught internally
  AND a WARN log contains the error message
  AND lastKnownGoodCoordinates are used for the frame
  AND the pipeline continues processing subsequent frames without interruption
```

**AC-09-08 — lastKnownGoodCoordinates cache updates on successful TdoaSolver calls**

```
GIVEN TdoaSolver returns {lat:51.5, lon:4.9} on call 1
  AND TdoaSolver returns null on call 2
WHEN both frames are processed sequentially
THEN frame 1 detection uses lat=51.5, lon=4.9 (from TdoaSolver)
  AND frame 1 result updates the cache: lastKnownGoodCoordinates = {lat:51.5, lon:4.9}
  AND frame 2 detection uses lat=51.5, lon=4.9 (from cache)
  AND event.coordinateSource for frame 2 === 'last_known_good'
```

---

## FR-W7-10: DemoDashboard

**Summary:** Next.js operator-facing dashboard. Features: Leaflet map heatmap of live
detection tracks, real-time alert log (last 50 entries), SSE track feed from
SentinelPipelineV2 API, operator authentication via NextAuth. All routes and API
endpoints must require valid session. Unauthenticated requests blocked.

---

**AC-10-01 — Heatmap renders detection tracks at correct positions**

```
GIVEN the DemoDashboard is loaded with a mock SSE feed
  AND the feed contains 10 detection events with distinct lat/lon positions
WHEN the Leaflet map component renders
THEN 10 heatmap intensity cells are visible
  AND each cell is positioned at the correct lat/lon (within 10m visual tolerance)
  AND cells with higher confidence values render with higher intensity
```

**AC-10-02 — Alert log shows maximum 50 most-recent alerts**

```
GIVEN 75 alert events have been received via the SSE stream
WHEN the AlertLog component renders
THEN exactly 50 alerts are displayed
  AND the 50 most recent alerts are shown (oldest 25 are not displayed)
  AND alerts are ordered newest-first (most recent at top)
```

**AC-10-03 — Alert log updates in real-time without page refresh**

```
GIVEN the AlertLog is rendered and showing 20 alerts
WHEN a new alert arrives via SSE
THEN the new alert appears at the top of the list within 200ms
  AND the total displayed count remains at most 50
  AND no page navigation or full React re-mount occurs
```

**AC-10-04 — SSE client reconnects automatically after disconnect**

```
GIVEN the SSE connection is interrupted (simulated EventSource close)
WHEN 1000ms elapses after the disconnect
THEN the SSE client attempts reconnection automatically
  AND a "Reconnecting..." status indicator is visible to the operator
  AND upon successful reconnection, the track feed resumes normally
  AND any events buffered server-side during the disconnect are replayed
```

**AC-10-05 — Unauthenticated navigation to dashboard redirects to signin**

```
GIVEN a browser session with no valid NextAuth session cookie
WHEN the user navigates to /dashboard
THEN the response status is 302 (redirect)
  AND the redirect destination is /auth/signin
  AND no track data, heatmap data, or alert data is served
```

**AC-10-06 — Unauthenticated API requests return 401**

```
GIVEN a request to GET /api/sentinel/tracks with no session cookie
WHEN the request is processed by the Next.js API route
THEN the HTTP response status === 401
  AND the response body is { error: "Unauthorized" }
  AND no track data is present in the response body
```

**AC-10-07 — Dashboard status bar shows live active track count**

```
GIVEN 3 active tracks present in the SSE feed
WHEN the StatusBar component renders
THEN it displays the text "Active Tracks: 3"
  AND when a 4th track is added via SSE, the count updates to 4 within 500ms
  AND when a track transitions to LOST, the count decrements within 500ms
```

**AC-10-08 — Heatmap removes stale tracks older than 5 minutes**

```
GIVEN the Leaflet heatmap contains a track last updated 6 minutes ago
WHEN the stale-track cleanup job runs (triggered on a 60-second interval)
THEN the stale track cell is removed from the heatmap layer
  AND an entry in the alert log reads "Track {id}: expired (stale > 5min)"
  AND no JavaScript error is thrown during removal
```

**AC-10-09 — SSE endpoint emits heartbeat every 15 seconds when idle**

```
GIVEN an active SSE connection to /api/sentinel/stream
  AND no detection events occur for 15 seconds
WHEN 15 seconds elapses
THEN a heartbeat event is pushed: { type: 'heartbeat', timestamp: <ISO 8601> }
  AND the server does not close the connection
  AND the client-side EventSource remains open and does not trigger an error event
```

**AC-10-10 — Alert severity is colour-coded for rapid operator triage**

```
GIVEN the AlertLog simultaneously displaying:
  one alert with state='TERMINAL' (highest priority)
  one alert with state='APPROACH' (medium priority)
  one alert with state='CRUISE' (informational)
WHEN the AlertLog component is rendered
THEN TERMINAL alerts have a red background (CSS color in red family, e.g. #DC2626)
  AND APPROACH alerts have an amber/orange background (e.g. #D97706)
  AND CRUISE/INFO alerts have a neutral grey background
  AND severity is visually distinguishable without relying solely on text labels
```

---

## Appendix A: AC Coverage Matrix

| FR | ACs | States / Scenarios Covered | Edge Cases |
|----|-----|---------------------------|------------|
| FR-W7-01 | AC-01-01..09 | Normal 16kHz, legacy shim, error rejection | Spectral fidelity, rate mismatch |
| FR-W7-02 | AC-02-01..10 | Match, full-profile, error, turbine | Turbine/piston non-collision |
| FR-W7-03 | AC-03-01..10 | 1/2/3/4 indicators, IMPACT, regression | Monotonic FSM, time-to-impact |
| FR-W7-04 | AC-04-01..08 | Detect, silent, normal, LoRa FP | Rolling window, sustained loss |
| FR-W7-05 | AC-05-01..08 | 2/3/4 nodes, collinear, phone weight | GDOP, invalid bearing |
| FR-W7-06 | AC-06-01..08 | 100Hz, t+8ms, stop, timeout | Pan clamp, multi-camera |
| FR-W7-07 | AC-07-01..08 | FPV, Shahed, FP suppression | Dedup, deactivation |
| FR-W7-08 | AC-08-01..08 | Confidence gate, timing, schema | No units, negative fireAt |
| FR-W7-09 | AC-09-01..08 | TdoaSolver live/null/throw | Cold start hold, cache update |
| FR-W7-10 | AC-10-01..10 | Auth, heatmap, SSE, stale | Reconnect, colour coding |

**Total: 90 acceptance criteria across 10 functional requirements.**

---

## Appendix B: Test Pyramid Targets per FR (W7)

```
FR           Unit    Component   API Integration   E2E
FR-W7-01      15         5            4             1
FR-W7-02      12         4            3             1
FR-W7-03      18         6            4             2
FR-W7-04      14         5            3             1
FR-W7-05      16         5            4             1
FR-W7-06      12         5            5             2
FR-W7-07      10         4            4             2
FR-W7-08      12         4            4             2
FR-W7-09      14         5            4             1
FR-W7-10       8        10            5             3
────────────────────────────────────────────────────
TOTAL        131        53           40            16
             (240 total target — plus 629 inherited passing from W1-W6)
```

---

*End of APEX-SENTINEL W7 Acceptance Criteria*
*Document owner: Nicolae Fratila / APEX OS*
*Classification: RESTRICTED — operational military detection system*
