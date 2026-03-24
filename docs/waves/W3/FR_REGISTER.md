# APEX-SENTINEL — Functional Requirements Register
## W3 | PROJECTAPEX Doc 18/21 | 2026-03-24

Wave 3: React Native (Expo) mobile app — Android + iOS
FR range: FR-W3-01 through FR-W3-18

---

## FR Numbering Convention

```
FR-W3-{NN}-{SS}
  W3 = Wave 3
  NN = requirement number (01–18)
  SS = sub-requirement (00 = parent, 01+ = child)
```

Test IDs follow: `T-W3-{NN}-{SS}-{seq}`

---

## FR-W3-01: Background Audio Capture

**Priority:** CRITICAL — system cannot function without this
**Status:** Pending
**Dependencies:** Android FOREGROUND_SERVICE + FOREGROUND_SERVICE_MICROPHONE permissions; iOS audio background mode

### Description

The app must capture microphone audio continuously in the background on both Android and iOS.
Audio is captured at 16kHz, mono, 16-bit PCM. Frames of 1 second (16,000 samples) are emitted
to the inference pipeline at 1–4 Hz depending on battery level (FR-W3-12).

### Sub-requirements

```
FR-W3-01-01: Audio capture must continue for ≥ 60 minutes with app backgrounded, screen off,
             device stationary, without crashing or being silently killed.

FR-W3-01-02: Sample rate: 16,000 Hz ± 50 Hz (resampled from device native rate if needed).

FR-W3-01-03: Channels: mono. Stereo inputs must be downmixed (L+R)/2.

FR-W3-01-04: Bit depth: 16-bit signed integer PCM, normalized to Float32 [-1.0, +1.0]
             before inference.

FR-W3-01-05: Android implementation: Foreground Service with notification channel
             "APEX Sentinel — Detection Active" (importance: LOW, no sound).

FR-W3-01-06: iOS implementation: AVAudioSession category = .record,
             mode = .measurement, options = .allowBluetooth.
             UIBackgroundModes includes "audio".
             Silent audio output maintains session when no speech/music detected.

FR-W3-01-07: The app must not request microphone permission without explicit user action.
             Permission must be requested from calibration wizard Step 2 only.

FR-W3-01-08: If audio permission is denied, the app must show an actionable error screen
             with a button linking to iOS/Android settings.
```

### Acceptance Criteria

- 1-hour background soak test: 0 crashes on Pixel 7 (Android 14) and iPhone 14 (iOS 17)
- Frame count after 60min: ≥ 3,500 (1Hz baseline, accounting for 95% uptime)
- No ANR (Application Not Responding) on Android
- No watchdog termination on iOS (crash log absent)

### Test IDs

```
T-W3-01-01-001: AudioCaptureService.start() resolves without error
T-W3-01-01-002: AudioCaptureService running for 3s emits ≥ 3 frames
T-W3-01-02-001: Emitted frames have sample count = 16000
T-W3-01-03-001: Stereo input downmixed to mono (mock test)
T-W3-01-04-001: Float32 range [-1.0, +1.0] verified on all emitted frames
T-W3-01-05-001: Foreground Service notification visible in Android notification shade
T-W3-01-07-001: Permission NOT requested on app cold start before wizard
T-W3-01-08-001: Error screen shown when permission denied
T-W3-01-08-002: Settings link opens correct deep-link on Android
T-W3-01-08-003: Settings link opens correct deep-link on iOS
```

---

## FR-W3-02: Native TFLite YAMNet Android

**Priority:** CRITICAL
**Status:** Pending
**Dependencies:** TFLite SDK 2.16.1, yamnet_w3_int8.tflite model (≤ 480KB), FR-W3-01

### Description

Android devices run YAMNet inference via a native TFLite Expo Module. The model is INT8
quantized (size ≤ 480KB). Inference runs in 2 threads with XNNPACK acceleration.
Output: 521 class scores. The top-N drone-class scores are forwarded to Gate 1/2/3 logic.

### Sub-requirements

```
FR-W3-02-01: Inference latency P99 ≤ 150ms on Pixel 7 (Tensor G2), measured on 100 consecutive frames.

FR-W3-02-02: Inference latency P99 ≤ 200ms on Samsung S22 (Exynos 2200).

FR-W3-02-03: Model loaded from app assets on first inference. Model must be verified by
             SHA-256 before loading. If SHA mismatch: refuse to load, trigger OTA update (FR-W3-15).

FR-W3-02-04: Input: Float32 array of exactly 16,000 samples. Any other length must throw.

FR-W3-02-05: Output: array of 521 Float32 scores, sum ≈ 1.0 (softmax output).

FR-W3-02-06: Top-class index and score must be returned alongside full score array.

FR-W3-02-07: Inference must NOT run on the JS thread (must dispatch to native thread via
             the Expo Module async function).

FR-W3-02-08: Model must be loaded once per app session (not per-inference). loadModel()
             called in app init, closeModel() on app termination.

FR-W3-02-09: NNAPI must be disabled (unstable on Android < 10). XNNPACK enabled.
```

### Acceptance Criteria

- `TFLiteModule.runInference(pcmFloat32)` returns scores in ≤ 150ms P99 on Pixel 7
- SHA-256 mismatch causes load rejection (unit test with wrong hash)
- 0 native crashes in 1000 consecutive inference calls (stress test)

### Test IDs

```
T-W3-02-01-001: runInference with 16000 samples returns 521 scores
T-W3-02-01-002: runInference latency < 150ms (mock timing test)
T-W3-02-03-001: loadModel with wrong SHA256 throws ModelIntegrityError
T-W3-02-04-001: runInference with 15999 samples throws InvalidInputError
T-W3-02-04-002: runInference with 16001 samples throws InvalidInputError
T-W3-02-05-001: Output array length is 521
T-W3-02-05-002: Output scores sum to approximately 1.0 (±0.01)
T-W3-02-06-001: topClassIndex is valid index (0–520)
T-W3-02-06-002: topClassScore matches scores[topClassIndex]
T-W3-02-07-001: runInference returns a Promise (not synchronous)
T-W3-02-08-001: closeModel releases interpreter (no memory leak)
T-W3-02-08-002: runInference after closeModel throws ModelNotLoadedError
```

---

## FR-W3-03: CoreML YAMNet iOS

**Priority:** CRITICAL
**Status:** Pending
**Dependencies:** CoreML framework, YAMNet_W3.mlpackage, iOS 16.0+, FR-W3-01

### Description

iOS devices run YAMNet inference via CoreML. The .mlpackage is compiled to use ANE (Neural
Engine) with CPU fallback. Performance and output format match FR-W3-02 where possible,
with a documented 2.1% accuracy delta accepted.

### Sub-requirements

```
FR-W3-03-01: Inference latency P99 ≤ 150ms on iPhone 14 (A15 Bionic ANE).

FR-W3-03-02: Inference latency P99 ≤ 200ms on iPhone SE 2 (A13 Bionic ANE).

FR-W3-03-03: computeUnits = cpuAndNeuralEngine. Pure CPU fallback if ANE unavailable.

FR-W3-03-04: Gate 3 confidence threshold on iOS: 0.28 (vs 0.30 on Android) to compensate
             for 2.1% accuracy delta.

FR-W3-03-05: Input: MLMultiArray of shape [1, 15600] Float32. App must pad/truncate
             input to exactly 15600 samples (CoreML YAMNet expects this vs TFLite 16000).
             Note: CoreML model resamples internally; JS must pass 15600-sample window.

FR-W3-03-06: Output: MLMultiArray of shape [521] Float32.

FR-W3-03-07: Model loaded once per session. MLModel instance reused across inferences.
```

### Acceptance Criteria

- `CoreMLInference.runInference(pcm)` returns 521 scores in ≤ 150ms P99 on iPhone 14
- Accuracy delta vs TFLite documented: 2.1% ± 0.5% measured on test set
- Gate threshold offset verified: iOS gate3_threshold = 0.28 in config

### Test IDs

```
T-W3-03-01-001: CoreMLInference.runInference resolves with 521 scores
T-W3-03-01-002: CoreMLInference latency mock < 150ms
T-W3-03-04-001: gate3Threshold returns 0.28 on iOS platform
T-W3-03-04-002: gate3Threshold returns 0.30 on Android platform
T-W3-03-05-001: Input length 15600 accepted
T-W3-03-05-002: Input length != 15600 throws
T-W3-03-06-001: Output length is 521
T-W3-03-07-001: MLModel instance is singleton (same reference across calls)
```

---

## FR-W3-04: Node Registration

**Priority:** CRITICAL
**Status:** Pending
**Dependencies:** Supabase Edge Function `register-node` (W2), expo-secure-store, FR-W3-11

### Description

On first launch, the user completes calibration wizard Step 1. The app POSTs to
`/functions/v1/register-node` with tier=4, capabilities, and coarsened GPS coordinates.
The response contains `node_id` and NATS NKey credentials. These are stored in SecureStore.

### Sub-requirements

```
FR-W3-04-01: Registration completes end-to-end in ≤ 5s on 4G LTE (50ms RTT, 50Mbps down).

FR-W3-04-02: `node_id` must match regex /^nde_[0-9A-Z]{26}$/ or registration is rejected.

FR-W3-04-03: NATS NKey seed stored in SecureStore key 'sentinel_nkey_seed'.
             Never logged, never included in Sentry events.

FR-W3-04-04: GPS coordinates coarsened to 3 decimal places (±111m) before transmission.

FR-W3-04-05: Registration is idempotent: if node_id already exists in SecureStore,
             skip registration and proceed to home screen.

FR-W3-04-06: On registration failure (network error, 4xx, 5xx), show retry UI with
             error message. Do not store partial credentials.

FR-W3-04-07: After successful registration, test NATS connection (connect + publish heartbeat)
             before advancing to home screen.
```

### Acceptance Criteria

- Registration < 5s on LTE (measured end-to-end in Detox test with network simulation)
- SecureStore keys present after registration
- Re-launch skips registration (idempotency)
- Failed registration shows error, SecureStore remains empty

### Test IDs

```
T-W3-04-01-001: registerNode resolves with valid node_id
T-W3-04-02-001: registerNode with invalid node_id response throws
T-W3-04-03-001: nkey_seed retrievable from SecureStore after registration
T-W3-04-03-002: nkey_seed not present in jest console output (logger mock)
T-W3-04-04-001: lat/lon coarsened to 3dp before fetch call (mock fetch)
T-W3-04-05-001: getNodeCredentials returns existing credentials without API call
T-W3-04-06-001: HTTP 500 response triggers retry UI
T-W3-04-06-002: Network error triggers retry UI
T-W3-04-06-003: SecureStore empty after failed registration
T-W3-04-07-001: NATS heartbeat published after registration
```

---

## FR-W3-05: NATS.ws Connection

**Priority:** CRITICAL
**Status:** Pending
**Dependencies:** nats.ws library, NATS.ws proxy (nginx WebSocket upgrade), NKey credentials from FR-W3-04

### Description

The mobile app connects to NATS via WebSocket (`wss://nats.apex-sentinel.io:443`).
Connection uses NKey authentication. Auto-reconnect with exponential backoff (base 2s, max 60s).
Circuit breaker prevents reconnect storms (5 failures → OPEN, 30s timeout → HALF_OPEN).
Heartbeat published to `sentinel.node.heartbeat` every 30s.

### Sub-requirements

```
FR-W3-05-01: Connection established within 10s on first attempt.

FR-W3-05-02: Auto-reconnect on disconnect: attempt at 2s, 4s, 8s, 16s, 32s, 60s (cap),
             then every 60s indefinitely.

FR-W3-05-03: CircuitBreaker opens after 5 consecutive failures. Stays OPEN for 30s.
             Transitions to HALF_OPEN after timeout. Closes after 2 consecutive successes.

FR-W3-05-04: Heartbeat: publish to sentinel.node.heartbeat every 30s with
             { nodeId, timestamp, batteryLevel, samplingRateHz }.

FR-W3-05-05: On successful reconnect: re-subscribe to all previously subscribed subjects.
             Subscriptions must not be lost on reconnect.

FR-W3-05-06: Connection state exposed via useNATSClient().isConnected (boolean) and
             useNATSClient().circuitState ('CLOSED' | 'OPEN' | 'HALF_OPEN').

FR-W3-05-07: TLS 1.3 only. Certificate pinning with SHA-256 SPKI pin validated on connect.
             Mismatch aborts connection and logs to Sentry.
```

### Test IDs

```
T-W3-05-01-001: NATSClient.connect() resolves within timeout
T-W3-05-02-001: Reconnect attempt after disconnect (mock NATS server close)
T-W3-05-02-002: Reconnect delay follows exponential backoff sequence
T-W3-05-03-001: CircuitBreaker opens after 5 failures
T-W3-05-03-002: CircuitBreaker stays OPEN for ≥ 30s
T-W3-05-03-003: CircuitBreaker transitions to HALF_OPEN after timeout
T-W3-05-03-004: CircuitBreaker closes after 2 consecutive successes in HALF_OPEN
T-W3-05-04-001: Heartbeat published every 30s (mock timer, 3 intervals)
T-W3-05-04-002: Heartbeat payload contains nodeId, timestamp, batteryLevel
T-W3-05-05-001: Subscriptions restored after reconnect (mock)
T-W3-05-06-001: isConnected is false before connect()
T-W3-05-06-002: isConnected is true after successful connect()
T-W3-05-06-003: circuitState is 'CLOSED' initially
```

---

## FR-W3-06: Detection Event Publishing

**Priority:** CRITICAL
**Status:** Pending
**Dependencies:** FR-W3-02/03 (ML inference), FR-W3-05 (NATS.ws), FR-W3-01 (audio)

### Description

When Gate 3 fires (YAMNet score above threshold), the detection event is published to
`sentinel.detections.{nodeId}` via NATS.ws. The event schema matches W2 ingest-event
Edge Function expectations. Publishing must complete within 500ms of Gate 3 fire.

### Sub-requirements

```
FR-W3-06-01: Subject: sentinel.detections.{nodeId} where nodeId is from SecureStore.

FR-W3-06-02: Payload matches DetectionEvent schema (validated with Zod before publish).

FR-W3-06-03: Publish latency (Gate 3 fire → NATS ACK): P99 ≤ 500ms.

FR-W3-06-04: If NATS is disconnected (circuitState = OPEN), buffer up to 100 events
             in SQLite with nats_published = 0. Flush on reconnect.

FR-W3-06-05: Published events confirmed with JetStream ACK. If no ACK within 5s, retry
             up to 3 times, then log to Sentry and mark nats_published = -1 (failed).

FR-W3-06-06: Detection events include: node_id, timestamp_us, threat_class, confidence,
             gate1_pass, gate2_pass, gate3_pass, model_version, platform (android|ios).
```

### Test IDs

```
T-W3-06-01-001: Subject includes correct nodeId from SecureStore mock
T-W3-06-02-001: Zod validation passes for valid DetectionEvent
T-W3-06-02-002: Zod validation throws for missing required fields
T-W3-06-04-001: Event buffered in SQLite when circuit OPEN
T-W3-06-04-002: Buffered events flushed on NATS reconnect
T-W3-06-05-001: Retry called up to 3 times on no ACK
T-W3-06-05-002: nats_published = -1 after 3 failed retries
T-W3-06-06-001: Published payload contains all required fields
T-W3-06-06-002: platform field is 'android' or 'ios' (Platform.OS)
```

---

## FR-W3-07: Alert Subscription

**Priority:** CRITICAL
**Status:** Pending
**Dependencies:** FR-W3-05 (NATS.ws), expo-notifications

### Description

The app subscribes to `sentinel.alerts.>` via NATS.ws. On receipt of an alert, it:
1. Stores in SQLite alerts table
2. Updates Zustand alert store
3. Fires Expo push notification (local, immediate)

### Sub-requirements

```
FR-W3-07-01: Subscribe to sentinel.alerts.> immediately after NATS connection established.

FR-W3-07-02: Alert schema validated with Zod on receipt. Malformed alerts logged to Sentry,
             not stored.

FR-W3-07-03: Local push notification fired within 200ms of message receipt.

FR-W3-07-04: Critical alerts: notification sound = "critical.wav", badge +1, priority high.
             Other levels: default sound, badge +1.

FR-W3-07-05: Duplicate detection: if alert_id already in SQLite, do not re-notify.

FR-W3-07-06: Max 10 push notifications per minute (throttle at application level).
             Throttled alerts still stored in SQLite and visible in alert history.

FR-W3-07-07: Background delivery: NATS.ws must be active in background (via background
             task, iOS audio session, or Android Foreground Service) to receive alerts
             without foreground.
```

### Test IDs

```
T-W3-07-01-001: subscribe called with sentinel.alerts.> on NATS connect
T-W3-07-02-001: Valid alert payload processes without error
T-W3-07-02-002: Invalid alert payload logged to Sentry mock, not stored
T-W3-07-03-001: scheduleNotificationAsync called within 200ms of message (mock timer)
T-W3-07-05-001: Duplicate alert_id does not trigger second notification
T-W3-07-06-001: 11th notification within 60s is throttled (not sent)
T-W3-07-06-002: Throttled alert still inserted into SQLite
```

---

## FR-W3-08: Home Dashboard UI

**Priority:** HIGH
**Status:** Pending
**Dependencies:** FR-W3-05, FR-W3-06, FR-W3-07, Zustand stores

### Description

The home screen shows: node status badge (ONLINE/OFFLINE/DEGRADED), real-time detection
feed (last 20 events), current threat level, and battery/sampling rate indicator.

### Sub-requirements

```
FR-W3-08-01: Node status badge updates within 2s of NATS connection state change.

FR-W3-08-02: Detection feed shows last 20 events, newest first. Each entry shows:
             threat_class, confidence (%), time ago.

FR-W3-08-03: Threat level indicator: one of CLEAR / ELEVATED / HIGH / CRITICAL.
             Color-coded: green / yellow / orange / red. Accessible via text + color + icon.

FR-W3-08-04: Sampling rate indicator: shows current Hz (1, 2, or 4) and battery level %.

FR-W3-08-05: Feed refreshes via NATS subject sentinel.detections.{nodeId} subscription
             (not polling).

FR-W3-08-06: Empty state (no detections): shows "Detection active — no events" with animated
             pulse indicator.
```

### Test IDs

```
T-W3-08-01-001: NodeStatusBadge renders ONLINE when connected
T-W3-08-01-002: NodeStatusBadge renders OFFLINE when disconnected
T-W3-08-02-001: DetectionFeed renders 20 items from store
T-W3-08-02-002: DetectionFeed newest item first
T-W3-08-03-001: ThreatLevelIndicator renders CLEAR with green color
T-W3-08-03-002: ThreatLevelIndicator renders CRITICAL with red color
T-W3-08-03-003: ThreatLevelIndicator has accessibilityLabel describing threat level
T-W3-08-06-001: Empty state renders when detection store is empty
```

---

## FR-W3-09: Alert Detail Screen

**Priority:** HIGH
**Status:** Pending
**Dependencies:** FR-W3-07, FR-W3-10 (map)

### Description

Tapping an alert in the feed or notification navigates to the alert detail screen.
Shows: ThreatCard (threat level, class, confidence), map pin at alert location,
contributing nodes list, time since detection, CoT data if available.

### Sub-requirements

```
FR-W3-09-01: Screen reachable from: (a) notification tap, (b) alert feed item tap.

FR-W3-09-02: ThreatCard displays: threat_level badge, threat_class, confidence bar,
             geo_sector, dispatched_at (relative + absolute).

FR-W3-09-03: Map pin shown at alert lat/lon. If lat/lon null: show geo_sector text only,
             no map. Map component must not crash on null coordinates.

FR-W3-09-04: "Acknowledge" button updates local acknowledged = 1 in SQLite.
             Badge count decremented by 1 on acknowledge.

FR-W3-09-05: Share button exports alert as plain text (alert_id, threat_class, location,
             time) via React Native Share API.
```

### Test IDs

```
T-W3-09-02-001: ThreatCard renders threat_level badge with correct color
T-W3-09-02-002: ThreatCard renders confidence as percentage
T-W3-09-03-001: Map renders with valid lat/lon
T-W3-09-03-002: Map does not crash with null lat/lon
T-W3-09-04-001: Acknowledge updates SQLite acknowledged = 1
T-W3-09-04-002: Badge count decremented on acknowledge
T-W3-09-05-001: Share exports text containing alert_id
```

---

## FR-W3-10: Map View

**Priority:** HIGH
**Status:** Pending
**Dependencies:** @rnmapbox/maps, Mapbox access token, offline tile cache

### Description

Map screen shows Mapbox GL map centered on device location. Active tracks displayed as
markers with threat level color coding. Offline tiles downloaded for current region.

### Sub-requirements

```
FR-W3-10-01: Map initializes with Mapbox access token from EXPO_PUBLIC_MAPBOX_TOKEN env var.

FR-W3-10-02: Device location shown as blue dot (no heading for privacy).

FR-W3-10-03: Alert markers rendered at lat/lon from Zustand alert store.
             Color: critical=red, high=orange, medium=yellow, low=green.

FR-W3-10-04: Offline tiles downloaded for zoom levels 10–13 for current region (50km radius).
             Maximum cache size: 40MB per region. User must confirm before download.

FR-W3-10-05: Map works offline (no network) if tiles are cached.

FR-W3-10-06: Tapping an alert marker navigates to alert detail screen (FR-W3-09).
```

### Test IDs

```
T-W3-10-01-001: MapboxGL initialized with EXPO_PUBLIC_MAPBOX_TOKEN
T-W3-10-03-001: Alert marker rendered for each active alert in store
T-W3-10-03-002: Critical alert marker has red color
T-W3-10-06-001: Tapping marker calls onAlertPress with correct alert_id
```

---

## FR-W3-11: Calibration Wizard

**Priority:** HIGH
**Status:** Pending
**Dependencies:** FR-W3-04 (registration), FR-W3-01 (audio), FR-W3-05 (NATS)

### Description

5-step wizard run on first launch and accessible from Settings. Covers node registration,
environment baseline, threshold tuning, and NATS connection test.

### Steps

```
Step 1 — Register Node (FR-W3-04)
Step 2 — Environment Baseline: record 5s ambient audio, compute SPL + spectral profile
Step 3 — Inference Calibration: run 10 frames, verify baseline confidence < 0.1 for drone classes
Step 4 — Threshold Tuning: slider to adjust gate3_threshold (0.1–0.9, default 0.30/0.28)
Step 5 — Confirm & Test: publish calibration-complete event, verify NATS ACK within 5s
```

### Test IDs

```
T-W3-11-01-001: Step 1 renders registration button
T-W3-11-01-002: Successful registration advances to Step 2
T-W3-11-02-001: Step 2 records 5s audio (mock AudioCaptureService)
T-W3-11-03-001: Step 3 runs 10 inference frames
T-W3-11-03-002: Step 3 fails if any drone class confidence > 0.1
T-W3-11-04-001: Threshold slider renders with default 0.30 (Android) / 0.28 (iOS)
T-W3-11-04-002: Threshold saved to node_state SQLite table
T-W3-11-05-001: Step 5 publishes sentinel.node.calibration-complete
T-W3-11-05-002: Step 5 shows error if no NATS ACK within 5s
```

---

## FR-W3-12: Battery Optimization

**Priority:** HIGH
**Status:** Pending
**Dependencies:** expo-battery, FR-W3-01

### Description

The app adapts its inference sampling rate based on battery level to stay within the
3%/hr drain budget. Below 20% battery, it drops to 1Hz and shows a warning banner.

### Sub-requirements

```
FR-W3-12-01: Sampling rate = 4Hz when battery ≥ 40%.
FR-W3-12-02: Sampling rate = 2Hz when 20% ≤ battery < 40%.
FR-W3-12-03: Sampling rate = 1Hz when battery < 20%.
FR-W3-12-04: Rate transitions happen within 5s of battery level crossing threshold.
FR-W3-12-05: Warning banner shown when battery < 20%: "Battery low — detection rate reduced".
FR-W3-12-06: On Android: request BATTERY_OPTIMIZATIONS_EXCLUDED via Settings intent.
             User must confirm. If not granted, show persistent warning.
```

### Test IDs

```
T-W3-12-01-001: samplingRateHz = 4 when batteryLevel = 0.50
T-W3-12-02-001: samplingRateHz = 2 when batteryLevel = 0.30
T-W3-12-03-001: samplingRateHz = 1 when batteryLevel = 0.15
T-W3-12-04-001: Rate update triggers within 5s of mock battery change
T-W3-12-05-001: Warning banner renders when batteryLevel < 0.20
T-W3-12-05-002: Warning banner absent when batteryLevel >= 0.20
```

---

## FR-W3-13: Meshtastic BLE Offline Mode

**Priority:** MEDIUM
**Status:** Pending
**Dependencies:** react-native-ble-plx, paired Meshtastic LoRa device

### Description

When cellular/WiFi connectivity is unavailable, the app bridges to a paired Meshtastic BLE
device. Meshtastic relays detection events via LoRa mesh to a gateway node that has NATS
connectivity. This provides offline detection capability in areas without cellular coverage.

### Sub-requirements

```
FR-W3-13-01: BLE scan for Meshtastic devices (service UUID: 6ba1b218-15a8-461f-9fa8-5d6646c0be5b).
             Scan timeout: 30s. Re-scan on timeout.

FR-W3-13-02: Auto-connect to first discovered Meshtastic device. Store device ID for
             subsequent reconnects.

FR-W3-13-03: Forward detection events to Meshtastic TORADIO characteristic as protobuf.
             Meshtastic relays via LoRa mesh.

FR-W3-13-04: Bridge mode activates automatically when NATS circuit is OPEN for > 60s.

FR-W3-13-05: Bridge mode status indicator on home screen: "MESH ONLY — cellular unavailable".

FR-W3-13-06: NATS connectivity restored: bridge mode deactivates, events from mesh queue
             are flushed via NATS.

FR-W3-13-07: Requires BLUETOOTH_SCAN + BLUETOOTH_CONNECT permissions (Android 12+) and
             NSBluetoothAlwaysUsageDescription (iOS).
```

### Test IDs

```
T-W3-13-01-001: BleManager.startDeviceScan called with Meshtastic service UUID
T-W3-13-02-001: connectToDevice called on first discovered device
T-W3-13-04-001: Bridge mode activates when circuit OPEN > 60s (mock timer)
T-W3-13-05-001: Bridge mode status indicator renders in bridge mode
T-W3-13-06-001: Bridge mode deactivates on NATS reconnect
T-W3-13-07-001: Location permission requested before BLE scan (Android 12+)
```

---

## FR-W3-14: Privacy Controls UI

**Priority:** HIGH
**Status:** Pending
**Dependencies:** expo-secure-store, expo-sqlite, FR-W3-04

### Description

Settings screen provides GDPR-compliant privacy controls: display node ID, request data
deletion, manage microphone permission, view privacy policy.

### Sub-requirements

```
FR-W3-14-01: Node ID displayed (read-only) in Settings > Node Identity.

FR-W3-14-02: "Delete all local data" button: wipes SQLite database, SecureStore keys,
             AsyncStorage, Expo SecureStore. Requires confirmation alert.
             After wipe: app state reset to pre-registration.

FR-W3-14-03: "Delete remote data" button: POST to Supabase Edge Function
             /functions/v1/gdpr-delete with node_id. Returns 202 (async deletion).
             Shows confirmation with expected deletion timeline (30 days per GDPR).

FR-W3-14-04: Microphone permission status shown. If denied: button to open Settings.

FR-W3-14-05: Privacy policy link: https://sentinel.apex-os.io/privacy (opens in-app browser).

FR-W3-14-06: No audio data is transmitted to any server. Informational text confirming this
             must be visible without scrolling in the privacy section.
```

### Test IDs

```
T-W3-14-01-001: Node ID rendered from SecureStore
T-W3-14-02-001: Confirmation alert shown before wipe
T-W3-14-02-002: SecureStore empty after wipe
T-W3-14-02-003: SQLite detection_events empty after wipe
T-W3-14-02-004: App navigates to calibration wizard after wipe
T-W3-14-03-001: POST to gdpr-delete on remote delete confirmation
T-W3-14-04-001: Permission status 'granted' or 'denied' displayed
```

---

## FR-W3-15: OTA Model Update

**Priority:** MEDIUM
**Status:** Pending
**Dependencies:** NATS `sentinel.model.update` subject, CDN, FR-W3-02/03

### Description

The backend can push a model update via NATS `sentinel.model.update`. The app downloads
the new model from CDN, verifies SHA-256, replaces the local model, and reloads inference.

### Sub-requirements

```
FR-W3-15-01: Subscribe to sentinel.model.update on NATS connect.

FR-W3-15-02: On message receipt: download from cdn_url, verify sha256, store in
             expo-file-system cache directory.

FR-W3-15-03: If SHA-256 mismatch: delete downloaded file, log to Sentry, do not replace
             model.

FR-W3-15-04: Model replacement: close current interpreter, swap file, reload. Zero inference
             interruption target: < 500ms gap.

FR-W3-15-05: Rollback: keep previous model file. If new model inference fails (throws 3 times
             in 60s), automatically revert to previous model.

FR-W3-15-06: CDN download with progress indicator in Settings > Model Update section.
```

### Test IDs

```
T-W3-15-01-001: subscribe called with sentinel.model.update on connect
T-W3-15-02-001: Download initiated on model update message
T-W3-15-03-001: Mismatched SHA-256 rejects model and logs to Sentry mock
T-W3-15-04-001: loadModel called with new model path after download
T-W3-15-05-001: Revert to previous model after 3 failures in 60s
```

---

## FR-W3-16: Crash Reporting (Sentry)

**Priority:** HIGH
**Status:** Pending
**Dependencies:** @sentry/react-native, EXPO_PUBLIC_SENTRY_DSN

### Description

Unhandled exceptions, native crashes, and explicit error captures are reported to Sentry.
PII must not be included in Sentry events.

### Sub-requirements

```
FR-W3-16-01: Sentry initialized in production builds only (NODE_ENV=production).

FR-W3-16-02: node_id never included in Sentry events (Sentry.setUser must not be called
             with node_id or any device identifier).

FR-W3-16-03: NATS publish failures logged at warning level with subject but without payload.

FR-W3-16-04: Native crashes (Android ANR, iOS watchdog) captured by Sentry native SDK.

FR-W3-16-05: tracesSampleRate = 0.1 (10% of sessions). profilesSampleRate = 0.05 (5%).
```

### Test IDs

```
T-W3-16-01-001: Sentry.init not called in test environment
T-W3-16-02-001: Sentry.setUser never called with node_id (grep check)
T-W3-16-03-001: NATS failure calls Sentry.captureMessage with subject, not payload
```

---

## FR-W3-17: SQLite Local State

**Priority:** HIGH
**Status:** Pending
**Dependencies:** expo-sqlite, WAL mode

### Description

All local state requiring persistence across app restarts is stored in SQLite:
detection events, alert history, node state/calibration, and NATS-unpublished event buffer.

### Sub-requirements

```
FR-W3-17-01: Database opened with WAL journal mode. Survives app crash without corruption.

FR-W3-17-02: detection_events table: max 10,000 rows. Oldest rows pruned when limit exceeded.

FR-W3-17-03: alerts table: max 1,000 rows. Oldest acknowledged rows pruned first.

FR-W3-17-04: node_state table: key-value store for calibration values, thresholds,
             model version, last LKGC timestamp.

FR-W3-17-05: All writes use parameterized queries. No string interpolation in SQL.

FR-W3-17-06: Migrations applied at app start. Migration version tracked in schema_version table.
```

### Test IDs

```
T-W3-17-01-001: Database opens without error
T-W3-17-02-001: Row inserted into detection_events
T-W3-17-02-002: 10001st row triggers pruning of oldest row
T-W3-17-03-001: Row inserted into alerts
T-W3-17-04-001: node_state key-value get/set round-trip
T-W3-17-05-001: SQL injection attempt in threat_class field does not execute
T-W3-17-06-001: schema_version row inserted by migration
```

---

## FR-W3-18: Accessibility (WCAG 2.1 AA)

**Priority:** HIGH
**Status:** Pending
**Dependencies:** All UI components

### Description

All screens and interactive elements meet WCAG 2.1 AA conformance. VoiceOver (iOS) and
TalkBack (Android) can navigate all primary user journeys.

### Sub-requirements

```
FR-W3-18-01: All interactive elements have accessibilityLabel (non-empty, descriptive).

FR-W3-18-02: Touch targets ≥ 44×44 dp (iOS) / 48×48 dp (Android).

FR-W3-18-03: Color contrast ≥ 4.5:1 for normal text (< 18pt), ≥ 3:1 for large text (≥ 18pt).

FR-W3-18-04: Threat level never communicated by color alone: always color + text + icon.

FR-W3-18-05: Dynamic font sizes: app text scales correctly at iOS Dynamic Type = Accessibility XL
             (equivalent to 200% scale). No truncation of critical information.

FR-W3-18-06: Animated elements: respect prefers-reduced-motion (iOS Accessibility > Reduce Motion).
             Pulse animations replaced with opacity fade when reduce motion enabled.

FR-W3-18-07: Alert notifications include full threat information in notification body
             (accessible to VoiceOver/TalkBack notification reader).
```

### Test IDs

```
T-W3-18-01-001: ThreatCard has non-empty accessibilityLabel
T-W3-18-01-002: NodeStatusBadge has non-empty accessibilityLabel
T-W3-18-01-003: All buttons in calibration wizard have accessibilityRole="button"
T-W3-18-04-001: ThreatLevelIndicator renders text + icon (not color only)
T-W3-18-06-001: Reduced motion flag disables pulse animation
T-W3-18-07-001: Notification body includes threat_class and confidence
```

---

## FR Summary Table

```
FR          Title                       Priority    Tests    Status
FR-W3-01    Background Audio            CRITICAL    10       Pending
FR-W3-02    TFLite Android              CRITICAL    13       Pending
FR-W3-03    CoreML iOS                  CRITICAL     8       Pending
FR-W3-04    Node Registration           CRITICAL    10       Pending
FR-W3-05    NATS.ws                     CRITICAL    13       Pending
FR-W3-06    Detection Publishing        CRITICAL     9       Pending
FR-W3-07    Alert Subscription          CRITICAL     7       Pending
FR-W3-08    Home Dashboard              HIGH         8       Pending
FR-W3-09    Alert Detail                HIGH         7       Pending
FR-W3-10    Map View                    HIGH         4       Pending
FR-W3-11    Calibration Wizard          HIGH        10       Pending
FR-W3-12    Battery Optimization        HIGH         6       Pending
FR-W3-13    Meshtastic BLE              MEDIUM       6       Pending
FR-W3-14    Privacy Controls            HIGH         7       Pending
FR-W3-15    OTA Model Update            MEDIUM       5       Pending
FR-W3-16    Crash Reporting             HIGH         3       Pending
FR-W3-17    SQLite Local State          HIGH         7       Pending
FR-W3-18    Accessibility               HIGH         7       Pending
─────────────────────────────────────────────────────────────────
TOTAL                                              149 min   0 complete
```

Minimum 149 unit tests from FR test IDs, plus additional tests per IMPLEMENTATION_PLAN.md
to reach the ≥ 183 total required by ACCEPTANCE_CRITERIA.md.
