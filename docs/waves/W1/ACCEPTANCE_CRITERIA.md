# APEX-SENTINEL — Acceptance Criteria

**Project:** APEX-SENTINEL
**Version:** 1.0
**Date:** 2026-03-24
**Wave:** W1 (FR-01 through FR-08 active; FR-09 through FR-25 defined for W2–W4)
**Format:** Given / When / Then — all metrics measurable and automatable

---

## Definition of Done (Global)

A feature is DONE when ALL of the following are true:

```
[ ] All unit tests for the FR pass (GREEN)
[ ] All component tests for the FR pass
[ ] All API integration tests for the FR pass
[ ] All E2E tests for the FR pass
[ ] Code coverage ≥ 80% for the FR (branches, functions, lines, statements)
[ ] No TypeScript compiler errors (npx tsc --noEmit)
[ ] No Kotlin compile errors (./gradlew compileDebugKotlin)
[ ] No Swift compile errors (xcodebuild build)
[ ] PR reviewed and approved
[ ] DECISION_LOG updated if architectural decision was made
[ ] ARTIFACT_REGISTRY updated if new artifact was created
[ ] SESSION_STATE.md updated
```

---

## Wave 1 Acceptance Criteria (FR-01 through FR-08)

---

### FR-01: Acoustic Detection Pipeline (Android)

**Wave:** W1
**Platform:** Android
**Priority:** P0 — Wave 1 blocker

#### FR-01-01: Microphone capture initialises

```
Given: Android device with API 33+, microphone permission granted
When: AcousticDetectionEngine.start() is called
Then:
  - AudioRecord starts within 200ms
  - Sample rate is 16000 Hz ±0%
  - Channel config is CHANNEL_IN_MONO
  - AudioFormat is ENCODING_PCM_FLOAT
  - No SecurityException is thrown
```

#### FR-01-02: Bandpass filter applied correctly

```
Given: Raw PCM audio at 16kHz with known frequency content
When: BandpassFilter.apply(audio, lowHz=500, highHz=2000) is called
Then:
  - Frequencies below 499 Hz are attenuated by ≥ 40dB
  - Frequencies above 2001 Hz are attenuated by ≥ 40dB
  - Passband (500–2000 Hz) preserves ≥ 90% of original amplitude
  - No phase discontinuities in output
```

#### FR-01-03: YAMNet inference returns valid result

```
Given: TFLite YAMNet model loaded from assets (480KB)
When: infer(audioFrame) is called with 1-second, 16kHz audio clip
Then:
  - Returns InferenceResult with confidence in [0.0, 1.0]
  - Returns latency_ms field
  - latency_ms ≤ 200
  - No OOM or model error
```

#### FR-01-04: Drone detection rate ≥ 87%

```
Given: Test fixture set of 50 FPV drone audio clips (drone_fpv_250hz_motor/)
       and 50 Shahed-class clips (drone_shahed_noise/)
When: Each clip is run through the full pipeline (bandpass → YAMNet → classifier)
Then:
  - ≥ 87 out of 100 clips return confidence ≥ 0.72
  - Detection rate = detected_count / total_clips ≥ 0.87
```

#### FR-01-05: False positive rate ≤ 8%

```
Given: Test fixture set of 100 ambient audio clips (traffic, wind, crowd, lawnmower)
When: Each clip is run through the full pipeline
Then:
  - ≤ 8 clips return confidence ≥ 0.72
  - False positive rate = fp_count / total_ambient_clips ≤ 0.08
```

#### FR-01-06: Model size ≤ 512KB

```
Given: APK built in release mode
When: assets/yamnet_classification.tflite is inspected
Then:
  - File size ≤ 524288 bytes (512 × 1024)
```

#### FR-01-07: Inference latency P99 ≤ 200ms

```
Given: 100 consecutive inference calls on target device (Pixel 6 or equivalent)
When: Latencies are recorded and sorted
Then:
  - 99th percentile latency ≤ 200ms
  - Median latency ≤ 80ms
```

#### FR-01-08: WebRTC VAD gates audio correctly

```
Given: Audio stream with 500ms of silence, then 500ms of drone audio, then 500ms of silence
When: WebRTCVAD.process(audioStream) runs
Then:
  - Silence segments return VAD_INACTIVE
  - Drone segment returns VAD_ACTIVE
  - No inference runs during VAD_INACTIVE periods
```

---

### FR-02: WiFi RF Anomaly Detection (Android)

**Wave:** W1 (baseline, no fusion yet)
**Platform:** Android
**Priority:** P1

#### FR-02-01: WiFi scan executes

```
Given: Android device with CHANGE_WIFI_STATE + ACCESS_WIFI_STATE permissions
When: WiFiAnomalyDetector.scan() is called
Then:
  - WifiManager.startScan() is invoked
  - Results available within 3s on P90
  - Returns list of ScanResult objects (may be empty in no-WiFi environment)
```

#### FR-02-02: Channel energy computed from scan

```
Given: A list of ScanResult objects from a WiFi scan
When: WiFiAnomalyDetector.computeChannelEnergy(results) is called
Then:
  - Returns ChannelEnergyMap with keys for channels 1, 6, 11, 36, 40, 44, 48
  - Each value is mean RSSI dBm for that channel (negative float)
  - Missing channels have value -100.0 (floor)
```

#### FR-02-03: Anomaly score elevated during drone RF

```
Given: Mock WiFi scan fixture "drone_active_2_4ghz/scan_001.json"
When: WiFiAnomalyDetector.score(scanData) is called
Then:
  - Returns score ≥ 0.50
```

#### FR-02-04: Anomaly score low for ambient WiFi

```
Given: Mock WiFi scan fixture "ambient_wifi/scan_001.json"
When: WiFiAnomalyDetector.score(scanData) is called
Then:
  - Returns score < 0.50
```

---

### FR-03: Detection Persistence (Supabase)

**Wave:** W1
**Platform:** Android + iOS + Backend
**Priority:** P0 — Wave 1 blocker

#### FR-03-01: Detection insert succeeds

```
Given: Valid detection event (confidence ≥ 0.72, lat, lng, node_id, type)
When: DetectionRepository.insert(detection) is called with valid Supabase credentials
Then:
  - Supabase INSERT to `detections` table succeeds (no error)
  - Returned record has a UUID id
  - Returned record has created_at timestamp
  - Round-trip time ≤ 500ms on 4G connection
```

#### FR-03-02: Detection insert fails gracefully on network error

```
Given: No network connectivity
When: DetectionRepository.insert(detection) is called
Then:
  - Returns Result.Failure with NetworkException
  - Detection is queued in local SQLite for retry
  - No crash
```

#### FR-03-03: Node registration insert succeeds

```
Given: New node with unique node_id, device_type, lat, lng
When: NodeRepository.register(node) is called
Then:
  - Supabase INSERT to `nodes` table succeeds
  - Node appears in `nodes` table with status = 'active'
  - created_at is set and does NOT change on subsequent updates (rule: created_at never updated on retry)
```

#### FR-03-04: Duplicate node_id upserts cleanly

```
Given: Existing node with node_id "node-test-001"
When: NodeRepository.register(node) is called again with same node_id
Then:
  - Upsert succeeds (no duplicate key error)
  - created_at is preserved from original insert
  - updated_at is set to current timestamp
```

#### FR-03-05: Supabase RLS enforces node isolation

```
Given: Node A authenticated with anon key
When: Node A attempts SELECT on `detections` WHERE node_id = 'node-B'
Then:
  - Returns empty result (RLS filters out other nodes' detections)
  - No permission error — silent filter
```

---

### FR-04: iOS Acoustic Pipeline

**Wave:** W1
**Platform:** iOS
**Priority:** P1

#### FR-04-01: AVAudioEngine pipeline starts without error

```
Given: iOS device/simulator with microphone permission granted
When: AcousticDetectionEngine.start() is called
Then:
  - AVAudioEngine starts without error
  - AudioSession category set to .record
  - Sample rate is 16000 Hz
  - No AVAudioSessionError thrown
```

#### FR-04-02: TFLite inference on iOS returns result

```
Given: TFLite model loaded via TensorFlowLiteSwift
When: infer(audioBuffer) is called
Then:
  - Returns confidence: Float in [0.0, 1.0]
  - latencyMs ≤ 200
  - No TFLite runtime error
```

#### FR-04-03: iOS detection accuracy parity with Android

```
Given: Same 100-clip test fixture set used in FR-01-04 and FR-01-05
When: Clips are run through iOS pipeline
Then:
  - Detection rate ≥ 85% (within 2pp of Android)
  - False positive rate ≤ 10%
```

---

### FR-05: Node Identity and Registration

**Wave:** W1
**Platform:** Android + iOS
**Priority:** P0

#### FR-05-01: Node generates stable UUID on first launch

```
Given: App installed fresh (no prior data)
When: App launches for the first time
Then:
  - NodeIdentityManager generates a UUID v4 node_id
  - node_id persisted in EncryptedSharedPreferences (Android) / Keychain (iOS)
  - node_id does NOT change on subsequent launches
```

#### FR-05-02: Node ID survives app restart

```
Given: App has previously generated a node_id
When: App is killed and relaunched
Then:
  - Same node_id is loaded from storage
  - No new UUID is generated
```

#### FR-05-03: Node registration payload is complete

```
Given: Valid node_id, device_type, location
When: NodeRepository.register(node) is called
Then:
  - Payload includes: node_id, device_type, platform, app_version, lat, lng, created_at
  - All fields non-null
```

---

### FR-06: Alert Notification

**Wave:** W1
**Platform:** Android + iOS
**Priority:** P1

#### FR-06-01: Detection above threshold triggers local notification

```
Given: Detection event with confidence ≥ 0.72
When: AlertManager.onDetection(event) is called
Then:
  - Local push notification fires within 500ms
  - Notification title: "Drone Detected"
  - Notification body includes confidence percentage and timestamp
  - Notification fires even when app is backgrounded
```

#### FR-06-02: Detection below threshold does not trigger notification

```
Given: Detection event with confidence < 0.72
When: AlertManager.onDetection(event) is called
Then:
  - No notification is fired
  - Event is discarded silently
```

#### FR-06-03: Alert de-bounce prevents spam

```
Given: 10 consecutive detections within 5 seconds (same node, same area)
When: AlertManager processes all 10
Then:
  - ≤ 2 notifications fire (de-bounce window = 5s)
  - No duplicate notifications for same detection cluster
```

---

### FR-07: Background Operation

**Wave:** W1
**Platform:** Android + iOS
**Priority:** P1

#### FR-07-01: Android detection runs in foreground service

```
Given: App is backgrounded or screen off
When: AcousticDetectionEngine is running
Then:
  - Foreground service notification is visible
  - AudioRecord continues capturing
  - Detections continue to insert to Supabase
  - Service does not die within 10 minutes of backgrounding
```

#### FR-07-02: iOS detection runs in background audio mode

```
Given: App is backgrounded (iOS)
When: AcousticDetectionEngine is running with UIBackgroundModes = [audio]
Then:
  - AVAudioEngine continues processing
  - Detections continue to insert
  - iOS does not terminate session within 5 minutes
```

---

### FR-08: Basic C2 Dashboard

**Wave:** W1
**Platform:** Web (React + MapLibre GL)
**Priority:** P1

#### FR-08-01: Dashboard loads within 3 seconds

```
Given: Dashboard hosted and accessible
When: User navigates to dashboard URL on 4G connection (1.5 Mbps throttled)
Then:
  - Map renders within 3000ms
  - Detection list panel renders within 3000ms
  - No JavaScript errors in console
```

#### FR-08-02: Map renders with correct initial view

```
Given: Dashboard loaded
When: Map component mounts
Then:
  - MapLibre GL map renders without error
  - Default center is configurable (env var NEXT_PUBLIC_MAP_CENTER)
  - Default zoom is configurable (env var NEXT_PUBLIC_MAP_ZOOM)
```

#### FR-08-03: Detection pin appears in real-time

```
Given: Dashboard is open and subscribed to Supabase realtime
When: A new detection is inserted into the `detections` table
Then:
  - Map pin appears at detection lat/lng within 2 seconds
  - Pin color indicates confidence: green ≥ 0.9, yellow 0.72–0.89, red (future alert type)
```

#### FR-08-04: Detection list updates in real-time

```
Given: Dashboard is open
When: A new detection is inserted
Then:
  - Detection appears at top of list within 2 seconds
  - List item shows: confidence %, detection type, node_id (truncated), timestamp
  - List is capped at 100 items (oldest removed)
```

#### FR-08-05: Dashboard auth is required

```
Given: Dashboard not authenticated
When: User navigates to /dashboard
Then:
  - User is redirected to /login
  - No detection data is visible without authentication
```

---

## Wave 2 Acceptance Criteria (FR-09 through FR-14)

---

### FR-09: Mesh Node Discovery

```
Given: 2+ Android devices with Meshtastic channel configured
When: MeshManager.discoverNodes() is called
Then:
  - Peer nodes appear in node list within 10 seconds
  - Each peer has node_id, signal_strength, last_seen
  - Discovery works without internet (BLE/Meshtastic only)
```

### FR-10: TDoA Triangulation

```
Given: 3 nodes with known positions detect same event with millisecond-precision timestamps
When: TDoATriangulator.triangulate(nodes, timestamps) is called
Then:
  - Returns Position (lat, lng) estimate
  - Error from true source ≤ 62m CEP over ≥ 20 test trials
  - Returns uncertainty_radius_m field
  - Degrades gracefully if only 2 nodes available (returns RSSI estimate)
```

### FR-11: Mesh Detection Relay

```
Given: Node A detects drone
When: Node A broadcasts DetectionPacket on mesh
Then:
  - Packet received by all mesh nodes within 500ms (3-hop max)
  - Packet loss ≤ 5% over 1000 relays
  - Duplicate suppression: same detection not relayed twice
  - Packet includes: origin_node_id, confidence, timestamp_ns, lat, lng
```

### FR-12: Kalman Filter Track

```
Given: Series of 5+ position estimates from triangulation over time
When: KalmanTracker.update(position, timestamp) is called for each
Then:
  - Track output is smoother than raw estimates (lower variance)
  - Track maintains continuity ≥ 95% of events
  - Track velocity estimate is plausible (< 150 m/s for Shahed class)
```

### FR-13: RSSI Circle Fallback

```
Given: Only 1 or 2 nodes available (insufficient for TDoA)
When: Detection event is received
Then:
  - Dashboard shows RSSI circle centered on detecting node
  - Circle radius derived from RSSI model (path loss exponent = 2.8)
  - Circle annotated "low confidence — insufficient nodes"
```

### FR-14: CesiumJS Track Visualization

```
Given: Series of triangulated positions for a track
When: Track is rendered in C2 dashboard
Then:
  - CesiumJS entity polyline shows track history
  - Uncertainty ellipse rendered at latest position
  - Track age color coding: fresh = red, aging = orange, stale > 60s = grey
  - Click on track shows: track_id, last_seen, position, velocity estimate, contributing nodes
```

---

## Wave 3 Acceptance Criteria (FR-15 through FR-20)

---

### FR-15: RF/Acoustic Fusion Model

```
Given: Simultaneous acoustic and RF feature vectors for same time window
When: FusionModel.infer(acousticFeatures, rfFeatures) is called
Then:
  - Returns fused confidence score in [0.0, 1.0]
  - Fused model accuracy ≥ 90% on validation set (vs 87% acoustic-only)
  - Total model size ≤ 600KB (acoustic 480KB + fusion head ≤ 120KB)
  - Fusion latency ≤ 50ms additional over acoustic-only
```

### FR-16: Offline Operation

```
Given: No network connectivity
When: Detection event occurs
Then:
  - Detection stored in local SQLite queue
  - App continues operating normally (no degraded state message required)
  - On reconnect: all queued detections sync to Supabase in order
  - created_at field uses original detection timestamp, not sync timestamp
  - Zero data loss after reconnect (all queued detections received by Supabase)
```

### FR-17: MapLibre GL Offline Tiles

```
Given: MBTiles bundle downloaded for target area
When: Device is offline
Then:
  - Map renders from local tiles (no tile errors)
  - Zoom levels 10–17 available offline
  - Tile bundle size ≤ 500MB for city-scale area
  - Map renders within 2s with no internet
```

### FR-18: OpenMCT Telemetry Plugin

```
Given: OpenMCT dashboard with APEX-SENTINEL plugin installed
When: Detections are flowing from nodes
Then:
  - Signal confidence history chart updates every 1s
  - Node health panel shows last_seen for each node
  - Alert panel shows detection events with timestamp
  - OpenMCT lag ≤ 2s from event to display
```

### FR-19: Grafana Monitoring

```
Given: Grafana connected to Supabase metrics + node telemetry
When: A node goes offline
Then:
  - Node status changes to 'offline' within 30s (heartbeat timeout)
  - Grafana alert fires within 60s
  - Slack/email notification sent (if configured)
```

### FR-20: Wazuh + Suricata Security Monitoring

```
Given: Wazuh agent deployed on C2 server
When: Anomalous API access pattern detected (> 100 req/min from single IP)
Then:
  - Wazuh alert level ≥ 12 generated
  - Suricata rule fires on known drone RF signature patterns (custom rules)
  - Alert visible in SIEM dashboard within 60s
```

---

## Wave 4 Acceptance Criteria (FR-21 through FR-25)

---

### FR-21: FreeTAKServer CoT Integration

```
Given: FreeTAKServer running and APEX-SENTINEL configured with FTS host
When: Detection event occurs with confidence ≥ 0.72
Then:
  - CoT XML event generated with type "a-f-G-U-C"
  - Event includes: lat, lng, confidence as custom attribute, timestamp
  - Event delivered to FTS within 2s of detection
  - Event visible in ATAK client map
```

### FR-22: OpenSky ADS-B Correlation

```
Given: OpenSky Network API accessible
When: Detection event occurs
Then:
  - OpenSky query fires within 1s for aircraft within 5km radius
  - If known civil aircraft matches position: detection tagged "possible_civil_aircraft"
  - If no match: detection remains unclassified (default: unknown UAV)
  - Correlation result stored in `detections.adsb_correlation` field
  - OpenSky API timeout ≤ 5s (falls back gracefully if timeout exceeded)
```

### FR-23: End-to-End Encryption

```
Given: Two mesh nodes establishing connection
When: Detection packet is transmitted
Then:
  - Signal Protocol double ratchet session established
  - All mesh messages encrypted (plaintext never transmitted)
  - Key exchange verified via out-of-band fingerprint comparison
  - Decryption on receiving end within 5ms overhead
```

### FR-24: Certificate Pinning

```
Given: Android/iOS app installed
When: App makes API call to Supabase or C2 backend
Then:
  - TLS 1.3 used exclusively (TLS 1.2 rejected)
  - Certificate pin validated against bundled pin
  - If pin mismatch: connection rejected, alert logged, no data transmitted
  - Rotation procedure: dual-pin deployment (old + new) during cert rotation window
```

### FR-25: Load — 10,000 Concurrent Nodes

```
Given: Load test harness simulating 10,000 concurrent nodes
When: Load test runs for 10 minutes at full throughput (1 detection/node/minute)
Then:
  - P99 Supabase insert latency ≤ 1000ms
  - P50 insert latency ≤ 200ms
  - Zero insert errors under steady load
  - Dashboard remains responsive (P99 realtime delivery ≤ 3s)
  - No Supabase connection pool exhaustion
  - Database CPU < 80% sustained
```

---

## QA Checklist — Per Wave

### Wave 1 QA Checklist

```
Unit Tests
[ ] FR-01: All 8 unit tests pass (Android acoustic)
[ ] FR-02: All 4 unit tests pass (WiFi anomaly)
[ ] FR-03: All 5 unit tests pass (Supabase persistence)
[ ] FR-04: All 3 unit tests pass (iOS acoustic)
[ ] FR-05: All 3 unit tests pass (node identity)
[ ] FR-06: All 3 unit tests pass (alerting)
[ ] FR-07: All 2 unit tests pass (background operation)
[ ] FR-08: All 5 tests pass (dashboard)

Coverage
[ ] Android unit coverage ≥ 80% (branches, functions, lines, statements)
[ ] iOS unit coverage ≥ 80%
[ ] Dashboard TS coverage ≥ 80%

Integration
[ ] Supabase detection insert verified against real project bymfcnwfyxuivinuzurr
[ ] Supabase real-time subscription verified end-to-end
[ ] Node registration + upsert verified

E2E
[ ] Dashboard loads within 3s (Playwright)
[ ] Map pin appears after detection insert (Playwright)
[ ] Detection list updates in real-time (Playwright)

Performance
[ ] Android P99 inference ≤ 200ms (JMH benchmark)
[ ] iOS inference ≤ 200ms
[ ] Model file ≤ 512KB

Security
[ ] Supabase anon key not committed to repository
[ ] RLS policies verified (node isolation)
[ ] No sensitive data in Android logs (no PII, no raw audio)

Build
[ ] Android APK builds without errors (release variant)
[ ] iOS IPA builds without errors
[ ] Dashboard builds without errors (next build)
[ ] TypeScript compiles without errors (tsc --noEmit)
```

---

*Acceptance criteria owner: Nico Fratila. Each wave sign-off requires all checklist items checked.*
