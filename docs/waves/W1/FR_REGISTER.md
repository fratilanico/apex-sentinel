# APEX-SENTINEL — Functional Requirements Register
# FILE 18 of 20 — FR_REGISTER.md
# Wave 1 Baseline — 2026-03-24

---

## Register Overview

| Total FRs | Must Have | Should Have | Could Have | Won't Have (this release) |
|-----------|-----------|-------------|------------|---------------------------|
| 25        | 14        | 7           | 3          | 1                         |

Wave distribution: W1=10, W2=5, W3=6, W4=4

---

## Status Legend

| Status      | Meaning                                              |
|-------------|------------------------------------------------------|
| PENDING     | Not yet started                                      |
| IN PROGRESS | Active development in current wave                   |
| RED         | Failing tests written, implementation not started    |
| GREEN       | All tests passing                                    |
| COMPLETE    | Tested, integrated, deployed, signed off             |
| DEFERRED    | Moved to later wave                                  |

---

## FR-01 through FR-08 — DETECTION

---

### FR-01: Microphone Audio Capture

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-01                                                                |
| **Title**         | Real-time microphone audio capture at 16kHz mono                    |
| **Description**   | The Android app MUST capture audio from the device microphone at    |
|                   | 16,000 Hz sample rate, mono channel, 16-bit PCM encoding using      |
|                   | the Android AudioRecord API. The iOS app MUST capture equivalent    |
|                   | audio using AVAudioEngine. Buffer size: 100ms chunks (1,600 samples).|
|                   | Capture MUST begin within 500ms of user pressing "Start Monitoring". |
| **Priority**      | MUST (M)                                                             |
| **Wave**          | W1                                                                   |
| **AC Reference**  | AC-01-01, AC-01-02, AC-01-03                                         |
| **Status**        | PENDING                                                              |
| **Test IDs**      | AudioCaptureTest.FR-01-01 through FR-01-04                          |

**Acceptance Criteria:**
- AC-01-01: AudioCapture emits PcmChunk objects at ≥10 Hz (every 100ms)
- AC-01-02: PcmChunk.sampleRate == 16000, channelCount == 1
- AC-01-03: stop() releases AudioRecord resource within 100ms (no ANR)
- AC-01-04: iOS AudioCapture emits equivalent chunks via Combine publisher

---

### FR-02: Voice Activity Detection (VAD) Filtering

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-02                                                                |
| **Title**         | WebRTC VAD filtering to suppress silent frames                      |
| **Description**   | Before ML inference, each 100ms audio chunk MUST be classified as   |
|                   | SPEECH (sound present) or SILENCE by a WebRTC-compatible energy-     |
|                   | based VAD. Silent chunks MUST be dropped. Only SPEECH chunks proceed |
|                   | to the FFT and ML inference stages. This reduces CPU load by ~60%   |
|                   | in silent environments. VAD aggressiveness configurable.             |
| **Priority**      | MUST (M)                                                             |
| **Wave**          | W1                                                                   |
| **AC Reference**  | AC-02-01, AC-02-02                                                   |
| **Status**        | PENDING                                                              |
| **Test IDs**      | VadFilterTest.FR-01-05 through FR-01-07                             |

**Acceptance Criteria:**
- AC-02-01: Zero-amplitude chunk → VadResult.SILENCE
- AC-02-02: High-amplitude sine wave (440Hz, amplitude=16000) → VadResult.SPEECH
- AC-02-03: Invalid frame size throws IllegalArgumentException

---

### FR-03: FFT Spectral Analysis

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-03                                                                |
| **Title**         | FFT-based spectral feature extraction for drone frequency bands      |
| **Description**   | Non-silent PCM chunks MUST be analyzed using a 1024-point Fast      |
|                   | Fourier Transform with Hann window (Apache Commons Math on Android, |
|                   | Accelerate framework on iOS). Output: SpectralFeatures struct       |
|                   | containing energy in FPV band (100-600Hz), Shahed band (50-200Hz), |
|                   | spectral centroid, and spectral flux across consecutive frames.      |
| **Priority**      | MUST (M)                                                             |
| **Wave**          | W1                                                                   |
| **AC Reference**  | AC-03-01, AC-03-02, AC-03-03                                         |
| **Status**        | PENDING                                                              |
| **Test IDs**      | FftAnalyzerTest.FR-02-01 through FR-02-04                           |

**Acceptance Criteria:**
- AC-03-01: 440Hz pure tone → dominant bin within ±20Hz of 440Hz
- AC-03-02: 1024-point FFT → 513 magnitude bins (fftSize/2 + 1)
- AC-03-03: 300Hz tone → fpvBandEnergy > backgroundEnergy

---

### FR-04: YAMNet TFLite Inference

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-04                                                                |
| **Title**         | On-device YAMNet TFLite drone/no-drone classification               |
| **Description**   | The app MUST load yamnet_drone_sentinel_v1.tflite from assets and   |
|                   | run inference on 0.975s (15,600 sample) float32 waveform inputs.    |
|                   | Output: 3-class softmax scores [drone, no-drone, uncertain].        |
|                   | Detection threshold: 0.70 (configurable). Inference MUST complete   |
|                   | in ≤200ms on devices with Snapdragon 765G or equivalent.            |
|                   | NNAPI delegation MUST be attempted before CPU fallback.             |
| **Priority**      | MUST (M)                                                             |
| **Wave**          | W1                                                                   |
| **AC Reference**  | AC-04-01, AC-04-02, AC-04-03, AC-04-04                              |
| **Status**        | PENDING                                                              |
| **Test IDs**      | YamNetInferenceTest.FR-03-01 through FR-03-04                       |

**Acceptance Criteria:**
- AC-04-01: scores[0] > 0.70 → DetectionClass.DRONE
- AC-04-02: scores[1] > 0.70 → DetectionClass.NO_DRONE
- AC-04-03: all scores < 0.70 → DetectionClass.UNCERTAIN
- AC-04-04: Input ≠ 15600 samples → IllegalArgumentException

---

### FR-05: iOS CoreML Acoustic Detection

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-05                                                                |
| **Title**         | iOS CoreML equivalent of Android YAMNet inference                   |
| **Description**   | The iOS app MUST run YAMNet inference using the CoreML-converted    |
|                   | model (yamnet_drone_sentinel_v1.mlpackage). CoreML runtime selects  |
|                   | Neural Engine, GPU, or CPU. Same input/output contract as Android.  |
|                   | Minimum iOS 16 target. Inference ≤200ms on A14 Bionic or newer.    |
| **Priority**      | MUST (M)                                                             |
| **Wave**          | W1                                                                   |
| **AC Reference**  | AC-05-01, AC-05-02                                                   |
| **Status**        | PENDING                                                              |
| **Test IDs**      | YamNetInferenceTests (iOS XCTest suite)                             |

**Acceptance Criteria:**
- AC-05-01: CoreML model loads without error on iOS 16+ simulator
- AC-05-02: infer([Float]) with 15600 samples returns InferenceResult without throw

---

### FR-06: GPS Location Tagging of Detection Events

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-06                                                                |
| **Title**         | GPS coordinates attached to every detection event                   |
| **Description**   | When a detection event is generated (DetectionClass.DRONE or       |
|                   | UNCERTAIN), the current GPS location MUST be queried via Android    |
|                   | FusedLocationProviderClient (iOS: CoreLocation). Location MUST      |
|                   | include: lat, lon, altitudeM, accuracyM, provider, timestampMs.     |
|                   | If location unavailable, event is still ingested with null          |
|                   | coordinates. Location accuracy >62m flagged in event metadata.      |
| **Priority**      | MUST (M)                                                             |
| **Wave**          | W1                                                                   |
| **AC Reference**  | AC-06-01, AC-06-02, AC-06-03                                         |
| **Status**        | PENDING                                                              |
| **Test IDs**      | GpsMetadataTest.FR-04-01 through FR-04-03                           |

**Acceptance Criteria:**
- AC-06-01: Location available → event.lat != null && event.lon != null
- AC-06-02: Location unavailable → event inserted with lat=null (no crash)
- AC-06-03: LocationSnapshot.toJsonObject() contains all 6 required keys

---

### FR-07: Supabase Detection Event Ingestion

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-07                                                                |
| **Title**         | Real-time detection event ingestion to Supabase PostgreSQL          |
| **Description**   | DRONE and UNCERTAIN events MUST be inserted into the               |
|                   | detection_events table via Supabase PostgREST (anon key, RLS        |
|                   | insert-only policy). Payload: DetectionEvent data class. On         |
|                   | network failure, event MUST be queued in local SQLite (Room) for    |
|                   | retry. NO_DRONE events NOT ingested by default (configurable).      |
|                   | Target latency: event to Supabase ≤2 seconds from detection.       |
| **Priority**      | MUST (M)                                                             |
| **Wave**          | W1                                                                   |
| **AC Reference**  | AC-07-01, AC-07-02, AC-07-03                                         |
| **Status**        | PENDING                                                              |
| **Test IDs**      | DetectionIngesterTest.FR-05-01 through FR-05-03                     |

**Acceptance Criteria:**
- AC-07-01: DRONE event → mockRepo.insert called exactly once
- AC-07-02: NO_DRONE event with ingestNoDrone=false → insert not called
- AC-07-03: Repository throws → Result.failure returned (no crash)

---

### FR-08: Acoustic Detection Pipeline Integration

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-08                                                                |
| **Title**         | End-to-end acoustic pipeline: capture → VAD → FFT → ML → ingest    |
| **Description**   | The AcousticPipeline class MUST wire all detection stages in order: |
|                   | AudioCapture → VadFilter → FftAnalyzer → YamNetInference →         |
|                   | GpsMetadataProvider → DetectionIngester. Pipeline MUST run as a    |
|                   | Kotlin coroutine flow. Backpressure: if inference backlog >5 frames,|
|                   | drop oldest. Pipeline MUST produce ≥1 event per 975ms of drone-     |
|                   | like audio when running continuously.                               |
| **Priority**      | MUST (M)                                                             |
| **Wave**          | W1                                                                   |
| **AC Reference**  | AC-08-01, AC-08-02                                                   |
| **Status**        | PENDING                                                              |
| **Test IDs**      | AcousticPipelineTest.FR-08-01                                       |

**Acceptance Criteria:**
- AC-08-01: processSingleCycle(droneWaveform) → InferenceResult.DRONE
- AC-08-02: Pipeline emits ≥1 result per second on continuous drone waveform

---

## FR-09 through FR-13 — MESH/NETWORK

---

### FR-09: Meshtastic LoRa Mesh Detection Relay

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-09                                                                |
| **Title**         | Relay detection events across LoRa mesh via Meshtastic              |
| **Description**   | Nodes equipped with Meshtastic LoRa hardware (TTGO T-Beam or        |
|                   | Heltec WiFi LoRa 32) MUST relay detection event metadata to other   |
|                   | nodes via the Meshtastic BLE serial interface. Relay payload:       |
|                   | {node_id, lat, lon, confidence, detected_at, model_version}.        |
|                   | Max payload: 240 bytes (Meshtastic Protobuf limit).                 |
| **Priority**      | MUST (M)                                                             |
| **Wave**          | W2                                                                   |
| **AC Reference**  | AC-09-01, AC-09-02                                                   |
| **Status**        | PENDING                                                              |
| **Test IDs**      | MeshtasticBridgeTest (W2)                                           |

---

### FR-10: Google Nearby Connections BLE Mesh

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-10                                                                |
| **Title**         | BLE mesh fallback via Google Nearby Connections                     |
| **Description**   | When no Meshtastic hardware available, Android nodes MUST form a     |
|                   | BLE mesh using Google Nearby Connections API (P2P_CLUSTER strategy).|
|                   | Detection events propagated within 60m BLE range. iOS: MultipeerConnectivity. |
| **Priority**      | SHOULD (S)                                                           |
| **Wave**          | W2                                                                   |
| **AC Reference**  | AC-10-01                                                             |
| **Status**        | PENDING                                                              |

---

### FR-11: Node Registration and Discovery

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-11                                                                |
| **Title**         | Sensor node self-registration and discovery in Supabase             |
| **Description**   | On first launch, each node generates a UUID and registers in the    |
|                   | sensor_nodes table: {node_id, device_model, android_version,        |
|                   | app_version, model_version, lat, lon, registered_at}. Node heartbeat|
|                   | every 60 seconds updates last_seen_at.                              |
| **Priority**      | MUST (M)                                                             |
| **Wave**          | W1                                                                   |
| **AC Reference**  | AC-11-01, AC-11-02                                                   |
| **Status**        | PENDING                                                              |

---

### FR-12: Offline Detection Queue (Room SQLite)

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-12                                                                |
| **Title**         | Local SQLite queue for detection events during offline periods       |
| **Description**   | When Supabase is unreachable, detection events MUST be stored in    |
|                   | a local Room database queue. On network restoration, queued events  |
|                   | MUST be uploaded in FIFO order. Queue max: 10,000 events (~2MB).    |
|                   | Queue overflow strategy: evict oldest UNCERTAIN events first.        |
| **Priority**      | SHOULD (S)                                                           |
| **Wave**          | W2                                                                   |
| **AC Reference**  | AC-12-01, AC-12-02                                                   |
| **Status**        | PENDING                                                              |

---

### FR-13: Supabase Realtime Event Stream

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-13                                                                |
| **Title**         | C2 dashboard receives live detection events via Supabase Realtime   |
| **Description**   | The C2 dashboard MUST subscribe to Supabase Realtime channel        |
|                   | (detection_events INSERT events). New events MUST appear on map     |
|                   | within 3 seconds of ingestion. WebSocket reconnect within 10s on    |
|                   | connection drop.                                                    |
| **Priority**      | MUST (M)                                                             |
| **Wave**          | W3                                                                   |
| **AC Reference**  | AC-13-01, AC-13-02                                                   |
| **Status**        | PENDING                                                              |

---

## FR-14 through FR-16 — TRIANGULATION

---

### FR-14: TDoA Multi-Node Triangulation

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-14                                                                |
| **Title**         | Time-Difference-of-Arrival triangulation from 3+ simultaneous nodes |
| **Description**   | When 3+ nodes report drone detection within a 5-second window,      |
|                   | a Supabase Edge Function MUST compute TDoA triangulation using      |
|                   | GPS timestamps and node positions. Output: estimated threat position |
|                   | {lat, lon, accuracy_m, confidence, method="tdoa"} stored in         |
|                   | threat_positions table. Target accuracy: ±62m (per INDIGO baseline).|
| **Priority**      | MUST (M)                                                             |
| **Wave**          | W3                                                                   |
| **AC Reference**  | AC-14-01, AC-14-02, AC-14-03                                         |
| **Status**        | PENDING                                                              |

---

### FR-15: GPS Timestamp Synchronization for TDoA

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-15                                                                |
| **Title**         | Sub-millisecond GPS timestamp synchronization across nodes          |
| **Description**   | TDoA accuracy requires node clocks synchronized to ±1ms.           |
|                   | Android: use GPS time via LocationManager.GPS_PROVIDER (±1ms        |
|                   | from GPS atomic clock). iOS: CoreLocation GPS time. NTP as          |
|                   | fallback (±50ms — acceptable for Shahed-class detection, degraded   |
|                   | for FPV). Each detection event MUST include gps_timestamp_ms       |
|                   | distinct from system wall clock.                                    |
| **Priority**      | MUST (M)                                                             |
| **Wave**          | W3                                                                   |
| **AC Reference**  | AC-15-01                                                             |
| **Status**        | PENDING                                                              |

---

### FR-16: Centroid Fallback for 2-Node Detection

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-16                                                                |
| **Title**         | Geometric centroid fallback when only 2 nodes detect simultaneously  |
| **Description**   | When exactly 2 nodes detect within the correlation window, TDoA is  |
|                   | insufficient. MUST fall back to midpoint (centroid) between node    |
|                   | positions as approximate threat location, with accuracy_m set to    |
|                   | the inter-node distance / 2. Flagged as method="centroid_fallback". |
| **Priority**      | SHOULD (S)                                                           |
| **Wave**          | W3                                                                   |
| **AC Reference**  | AC-16-01                                                             |
| **Status**        | PENDING                                                              |

---

## FR-17 through FR-20 — C2 DASHBOARD

---

### FR-17: CesiumJS 3D Threat Map

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-17                                                                |
| **Title**         | Real-time 3D terrain map with detection event overlay               |
| **Description**   | C2 dashboard MUST display sensor nodes and detection events on a    |
|                   | 3D terrain-aware CesiumJS globe. Detection events rendered as        |
|                   | pulsing red markers. Sensor nodes as blue dots. Threat trajectory   |
|                   | (if 3+ events) as animated polyline. Cesium Ion terrain required.   |
| **Priority**      | MUST (M)                                                             |
| **Wave**          | W3                                                                   |
| **AC Reference**  | AC-17-01, AC-17-02                                                   |
| **Status**        | PENDING                                                              |

---

### FR-18: FreeTAKServer COT Event Relay

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-18                                                                |
| **Title**         | Relay threat positions to ATAK clients via FreeTAKServer COT        |
| **Description**   | When a threat position is computed (FR-14) or a single high-         |
|                   | confidence detection occurs (confidence ≥0.90), C2 backend MUST    |
|                   | push a COT XML event to FreeTAKServer TCP port 8087. COT type:      |
|                   | "a-u-A" (unknown air). MUST include callsign "APEX-SENTINEL",       |
|                   | how="m-g" (machine generated), position, and remarks field with     |
|                   | confidence and model_version.                                       |
| **Priority**      | SHOULD (S)                                                           |
| **Wave**          | W4                                                                   |
| **AC Reference**  | AC-18-01                                                             |
| **Status**        | PENDING                                                              |

---

### FR-19: OpenMCT Telemetry Timeline

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-19                                                                |
| **Title**         | OpenMCT plugin for per-node telemetry (battery, inference latency)  |
| **Description**   | C2 MUST include an OpenMCT panel showing time-series telemetry for  |
|                   | each sensor node: battery_pct, inference_latency_ms, detections_per_|
|                   | hour, last_seen_age_s. Telemetry sourced from Supabase sensor_nodes |
|                   | table heartbeat records.                                            |
| **Priority**      | COULD (C)                                                            |
| **Wave**          | W3                                                                   |
| **AC Reference**  | AC-19-01                                                             |
| **Status**        | PENDING                                                              |

---

### FR-20: Telegram Alert Bot

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-20                                                                |
| **Title**         | Telegram bot alerts on high-confidence drone detection              |
| **Description**   | A Supabase Edge Function MUST dispatch a Telegram message when      |
|                   | confidence ≥ 0.85 to a configured Telegram chat ID. Message format: |
|                   | "APEX-SENTINEL ALERT\nDRONE DETECTED\nConfidence: 91%\n            |
|                   | Location: 44.4268°N 26.1025°E\nNode: node-RO-001\nTime: 14:32:07" |
| **Priority**      | SHOULD (S)                                                           |
| **Wave**          | W3                                                                   |
| **AC Reference**  | AC-20-01                                                             |
| **Status**        | PENDING                                                              |

---

## FR-21 through FR-22 — OFFLINE

---

### FR-21: Offline Acoustic Detection (No Network)

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-21                                                                |
| **Title**         | Full acoustic detection pipeline runs without network connectivity  |
| **Description**   | All acoustic ML inference MUST function entirely offline. No network |
|                   | calls required for: AudioCapture, VAD, FFT, YAMNet inference. Only  |
|                   | ingestion to Supabase requires network. Offline events queued in    |
|                   | Room (FR-12). Alert sound/vibration played locally on detection.    |
| **Priority**      | MUST (M)                                                             |
| **Wave**          | W1                                                                   |
| **AC Reference**  | AC-21-01                                                             |
| **Status**        | PENDING                                                              |

---

### FR-22: Offline Mesh-Only Operation

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-22                                                                |
| **Title**         | Mesh detection relay works without internet (Meshtastic LoRa only)  |
| **Description**   | In a fully internet-disconnected deployment (field scenario),       |
|                   | detection events MUST propagate via Meshtastic LoRa mesh to a       |
|                   | designated "gateway node" which has local Supabase or SQLite        |
|                   | storage. C2 dashboard MUST be accessible from local network only.   |
| **Priority**      | COULD (C)                                                            |
| **Wave**          | W4                                                                   |
| **AC Reference**  | AC-22-01                                                             |
| **Status**        | PENDING                                                              |

---

## FR-23 through FR-24 — SECURITY

---

### FR-23: Detection Event Cryptographic Signing

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-23                                                                |
| **Title**         | ECDSA signing of detection events to prevent spoofing               |
| **Description**   | Each detection event MUST be signed with a per-device ECDSA P-256   |
|                   | key stored in Android Keystore / iOS Secure Enclave. Signature       |
|                   | appended as event.signature. Supabase Edge Function verifies         |
|                   | signature before forwarding to C2 or COT relay. Prevents adversary  |
|                   | from injecting false detection events.                              |
| **Priority**      | MUST (M)                                                             |
| **Wave**          | W4                                                                   |
| **AC Reference**  | AC-23-01, AC-23-02                                                   |
| **Status**        | PENDING                                                              |

---

### FR-24: GDPR Audio Non-Retention

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-24                                                                |
| **Title**         | Raw audio NEVER stored or transmitted — features only               |
| **Description**   | The app MUST NEVER persist or transmit raw PCM audio. Only derived  |
|                   | features (SpectralFeatures, InferenceResult scores) may be stored.  |
|                   | This is a hard legal requirement under GDPR Article 9 (biometric     |
|                   | data) and Romanian Law 190/2018. Audio processing MUST be           |
|                   | documented in the Privacy Policy and app store listing.             |
| **Priority**      | MUST (M)                                                             |
| **Wave**          | W1                                                                   |
| **AC Reference**  | AC-24-01                                                             |
| **Status**        | PENDING                                                              |

**Acceptance Criteria:**
- AC-24-01: Code review confirms zero file writes, network sends, or DB inserts of
  PcmChunk.samples. Enforced by static analysis lint rule.

---

## FR-25 — INTEGRATION

---

### FR-25: OpenSky Network ADS-B Cross-Reference

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **ID**            | FR-25                                                                |
| **Title**         | Cross-reference acoustic detections against OpenSky ADS-B data      |
| **Description**   | When a detection event occurs, query OpenSky Network REST API for   |
|                   | aircraft within 10km radius. If a known ADS-B transponder aircraft  |
|                   | is detected in the area, downgrade confidence by 0.20 (likely       |
|                   | commercial aircraft false positive). Store cross_reference_adsb:    |
|                   | true/false on detection event.                                      |
| **Priority**      | COULD (C)                                                            |
| **Wave**          | W4                                                                   |
| **AC Reference**  | AC-25-01                                                             |
| **Status**        | PENDING                                                              |

**Notes:**
- OpenSky Network API: https://opensky-network.org/api/states/all
- Rate limit: 100 requests/day (anonymous) — use only on high-confidence events
- FPV drones and Shahed class do NOT have ADS-B transponders — absence of transponder
  is NOT a positive indicator; only confirmed ADS-B aircraft should trigger downgrade.

---

## Traceability Matrix Summary

| FR ID | Wave | Category      | Priority | Test Suite                    | Status   |
|-------|------|---------------|----------|-------------------------------|----------|
| FR-01 | W1   | Detection     | M        | AudioCaptureTest              | PENDING  |
| FR-02 | W1   | Detection     | M        | VadFilterTest                 | PENDING  |
| FR-03 | W1   | Detection     | M        | FftAnalyzerTest               | PENDING  |
| FR-04 | W1   | Detection     | M        | YamNetInferenceTest           | PENDING  |
| FR-05 | W1   | Detection     | M        | iOS AudioCaptureTests         | PENDING  |
| FR-06 | W1   | Detection     | M        | GpsMetadataTest               | PENDING  |
| FR-07 | W1   | Detection     | M        | DetectionIngesterTest         | PENDING  |
| FR-08 | W1   | Detection     | M        | AcousticPipelineTest          | PENDING  |
| FR-09 | W2   | Mesh          | M        | MeshtasticBridgeTest          | PENDING  |
| FR-10 | W2   | Mesh          | S        | NearbyConnectionsTest         | PENDING  |
| FR-11 | W1   | Network       | M        | NodeRegistrationTest          | PENDING  |
| FR-12 | W2   | Offline       | S        | OfflineQueueTest              | PENDING  |
| FR-13 | W3   | Network       | M        | RealtimeEventStreamTest       | PENDING  |
| FR-14 | W3   | Triangulation | M        | TDoATriangulationTest         | PENDING  |
| FR-15 | W3   | Triangulation | M        | GpsTimeSyncTest               | PENDING  |
| FR-16 | W3   | Triangulation | S        | CentroidFallbackTest          | PENDING  |
| FR-17 | W3   | C2 Dashboard  | M        | CesiumMapTest (Playwright)    | PENDING  |
| FR-18 | W4   | C2 Dashboard  | S        | FreeTakCotTest                | PENDING  |
| FR-19 | W3   | C2 Dashboard  | C        | OpenMctPluginTest             | PENDING  |
| FR-20 | W3   | C2 Dashboard  | S        | TelegramAlertTest             | PENDING  |
| FR-21 | W1   | Offline       | M        | OfflineDetectionTest          | PENDING  |
| FR-22 | W4   | Offline       | C        | OfflineMeshTest               | PENDING  |
| FR-23 | W4   | Security      | M        | EventSigningTest              | PENDING  |
| FR-24 | W1   | Security      | M        | AudioNonRetentionLintTest     | PENDING  |
| FR-25 | W4   | Integration   | C        | AdsbCrossReferenceTest        | PENDING  |

---

*Document owner: Nicolae Fratila | Last updated: 2026-03-24 | Version: 1.0*
*Update Status column as each FR moves through the TDD pipeline.*
