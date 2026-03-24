# APEX-SENTINEL — Integration Map
## W3 | PROJECTAPEX Doc 20/21 | 2026-03-24

Wave 3: React Native (Expo) mobile app — Android + iOS

---

## 1. Full Integration Diagram

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                    APEX-SENTINEL W3 INTEGRATION MAP                            ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║  ┌───────────────────────────────────────────────────────────────────────────┐ ║
║  │                     MOBILE APP (React Native / Expo SDK 52)               │ ║
║  │                                                                           │ ║
║  │  ┌─────────────────┐    ┌─────────────────┐    ┌────────────────────┐    │ ║
║  │  │  AudioCapture   │───▶│  ML Inference   │───▶│  Gate 1/2/3 Logic  │    │ ║
║  │  │  Service        │    │  (TFLite/CoreML)│    │                    │    │ ║
║  │  │  16kHz mono     │    │  521 YAMNet     │    │  Threshold filter  │    │ ║
║  │  │  1-4 Hz frames  │    │  classes        │    │                    │    │ ║
║  │  └─────────────────┘    └─────────────────┘    └────────┬───────────┘    │ ║
║  │                                                          │ Gate 3 fire    │ ║
║  │  ┌─────────────────┐    ┌─────────────────┐             ▼                │ ║
║  │  │  BatteryStore   │───▶│ SamplingRate    │    ┌────────────────────┐    │ ║
║  │  │  expo-battery   │    │ Adapter         │    │  DetectionEvent    │    │ ║
║  │  └─────────────────┘    └─────────────────┘    │  Publisher         │    │ ║
║  │                                                 └────────┬───────────┘    │ ║
║  │                                                          │                │ ║
║  └──────────────────────────────────────────────────────────┼────────────────┘ ║
║                                                             │                  ║
║  ┌──────────────────────────────────────────────────────────┼────────────────┐ ║
║  │                     TRANSPORT LAYER                       │                │ ║
║  │                                                           ▼                │ ║
║  │  ┌──────────────────────────────────────────────────────────────────────┐ │ ║
║  │  │                    NATSClient (nats.ws)                              │ │ ║
║  │  │  ┌─────────────┐   ┌───────────────┐   ┌──────────────────────────┐ │ │ ║
║  │  │  │ CircuitBreaker│  │  Reconnect    │   │  Subscription Manager    │ │ │ ║
║  │  │  │ CLOSED/OPEN/ │  │  Exponential  │   │  sentinel.alerts.>       │ │ │ ║
║  │  │  │ HALF_OPEN    │  │  backoff+jitter│  │  sentinel.model.update   │ │ │ ║
║  │  │  └─────────────┘   └───────────────┘   └──────────────────────────┘ │ │ ║
║  │  └──────────────────────────────────────────────────────────────────────┘ │ ║
║  │                              │ wss://:443                                   │ ║
║  └──────────────────────────────┼──────────────────────────────────────────────┘ ║
║                                 │                                               ║
╠═════════════════════════════════╪═══════════════════════════════════════════════╣
║  EXTERNAL INTEGRATIONS          │                                               ║
║                                 ▼                                               ║
║  ┌──────────────────────────────────────────────────────────────────────────┐   ║
║  │  NATS JetStream Cluster (W2)        wss://nats.apex-sentinel.io:443      │   ║
║  │  ┌─────────────────────────────────────────────────────────────────────┐ │   ║
║  │  │  DETECTIONS stream: sentinel.detections.>   → TDoA Correlation Svc  │ │   ║
║  │  │  ALERTS stream:     sentinel.alerts.>        → Mobile push           │ │   ║
║  │  │  NODE_HEALTH stream: sentinel.node.>         → Node registry         │ │   ║
║  │  │  MODEL stream:       sentinel.model.>        → Mobile OTA            │ │   ║
║  │  └─────────────────────────────────────────────────────────────────────┘ │   ║
║  └──────────────────────────────────────────────────────────────────────────┘   ║
║                                                                                  ║
║  ┌────────────────────────┐   ┌─────────────────────────────────────────────┐   ║
║  │ Supabase               │   │ Expo Push Notification Service              │   ║
║  │ bymfcnwfyxuivinuzurr   │   │ api.expo.dev/v2/push/send                   │   ║
║  │ eu-west-2              │   │ → APNS (iOS) / FCM (Android)                │   ║
║  │                        │   └─────────────────────────────────────────────┘   ║
║  │ Edge Functions:        │                                                      ║
║  │  register-node  POST   │   ┌─────────────────────────────────────────────┐   ║
║  │  node-health    POST   │   │ Mapbox GL (maps.mapbox.com)                 │   ║
║  │  ingest-event   POST   │   │ Vector tiles + raster tiles + offline cache │   ║
║  │  alert-router   POST   │   └─────────────────────────────────────────────┘   ║
║  │                        │                                                      ║
║  │ Realtime:              │   ┌─────────────────────────────────────────────┐   ║
║  │  tracks table ✓        │   │ Sentry (o1234.ingest.sentry.io)            │   ║
║  │  alerts table ✓        │   │ Crash reports + error tracking             │   ║
║  └────────────────────────┘   └─────────────────────────────────────────────┘   ║
║                                                                                  ║
║  ┌────────────────────────┐   ┌─────────────────────────────────────────────┐   ║
║  │ TFLite Runtime         │   │ CoreML Runtime                              │   ║
║  │ Android only           │   │ iOS only                                    │   ║
║  │ yamnet_w3_int8.tflite  │   │ YAMNet_W3.mlpackage                        │   ║
║  │ App assets + CDN OTA   │   │ Compiled into .ipa                         │   ║
║  └────────────────────────┘   └─────────────────────────────────────────────┘   ║
║                                                                                  ║
║  ┌────────────────────────┐   ┌─────────────────────────────────────────────┐   ║
║  │ Expo SecureStore       │   │ SQLite (expo-sqlite)                        │   ║
║  │ Android: Keystore      │   │ WAL mode                                    │   ║
║  │ iOS: Keychain          │   │ detection_events, alerts, node_state        │   ║
║  │ node_id, nkey_seed     │   │ Max 10K detections, 1K alerts               │   ║
║  └────────────────────────┘   └─────────────────────────────────────────────┘   ║
║                                                                                  ║
║  ┌────────────────────────┐                                                      ║
║  │ Meshtastic BLE         │                                                      ║
║  │ react-native-ble-plx   │   ┌─────────────────────────────────────────────┐   ║
║  │ UUID: 6ba1b218-...     │──▶│ LoRa Mesh Network                          │   ║
║  │ Offline mode only      │   │ Gateway Node → NATS                         │   ║
║  └────────────────────────┘   └─────────────────────────────────────────────┘   ║
╚══════════════════════════════════════════════════════════════════════════════════╝
```

---

## 2. Integration Details + Latency Budgets

### 2.1 Supabase Edge Functions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Integration: Supabase Edge Functions                                       │
│  Base URL: https://bymfcnwfyxuivinuzurr.supabase.co                        │
│  Auth: apikey header (anon key, public) for node registration               │
│        node_id + cert fingerprint for node-health + ingest-event            │
├──────────────────────┬──────────────────────┬──────────────┬────────────────┤
│  Endpoint            │  Method              │  Latency P99  │  Retry?       │
├──────────────────────┼──────────────────────┼──────────────┼────────────────┤
│  /functions/v1/      │  POST                │  ≤ 2000ms    │  3× with 1s   │
│  register-node       │  Content-Type: JSON  │              │  backoff       │
├──────────────────────┼──────────────────────┼──────────────┼────────────────┤
│  /functions/v1/      │  POST                │  ≤ 500ms     │  3× with 500ms │
│  node-health         │  Content-Type: JSON  │              │  backoff       │
├──────────────────────┼──────────────────────┼──────────────┼────────────────┤
│  /functions/v1/      │  POST                │  ≤ 300ms     │  3× with 200ms │
│  ingest-event        │  Content-Type: JSON  │              │  (fallback to  │
│                      │                      │              │  SQLite buffer) │
└──────────────────────┴──────────────────────┴──────────────┴────────────────┘

Error handling:
  HTTP 429 (rate limit): back off for X-RateLimit-Reset seconds, then retry
  HTTP 503 (unavailable): circuit breaker opens after 3 consecutive 503s
  Network timeout (>5s): treat as 503
  HTTP 4xx (except 429): do not retry, log to Sentry, surface error to user
```

### 2.2 NATS.ws

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Integration: NATS JetStream via WebSocket                                  │
│  Endpoint: wss://nats.apex-sentinel.io:443/ws                               │
│  Auth: NKey (Ed25519 signature)                                             │
│  Protocol: WebSocket + NATS client protocol (nats.ws v1.29+)               │
├──────────────────────────┬──────────────────┬─────────────────────────────┤
│  Subject                 │  Direction       │  Purpose                     │
├──────────────────────────┼──────────────────┼─────────────────────────────┤
│  sentinel.detections.    │  PUBLISH         │  Gate 3 detection events    │
│  {nodeId}                │                  │  JetStream ACK required     │
├──────────────────────────┼──────────────────┼─────────────────────────────┤
│  sentinel.node.          │  PUBLISH         │  30s keepalive              │
│  heartbeat               │                  │  No ACK required            │
├──────────────────────────┼──────────────────┼─────────────────────────────┤
│  sentinel.node.offline   │  PUBLISH         │  Graceful disconnect        │
├──────────────────────────┼──────────────────┼─────────────────────────────┤
│  sentinel.node.          │  PUBLISH         │  Calibration wizard done    │
│  calibration-complete    │                  │                             │
├──────────────────────────┼──────────────────┼─────────────────────────────┤
│  sentinel.mesh.inbound.  │  PUBLISH         │  Meshtastic BLE forwarded   │
│  {nodeId}                │                  │  packets                    │
├──────────────────────────┼──────────────────┼─────────────────────────────┤
│  sentinel.alerts.>       │  SUBSCRIBE       │  All alert levels           │
├──────────────────────────┼──────────────────┼─────────────────────────────┤
│  sentinel.model.update   │  SUBSCRIBE       │  OTA model update events    │
└──────────────────────────┴──────────────────┴─────────────────────────────┘

Latency budget (detection publish):
  PCM frame ready        →  Gate 3 fire:     ≤ 150ms (TFLite/CoreML)
  Gate 3 fire            →  NATS publish:    ≤ 50ms (JS event loop)
  NATS publish           →  ACK received:    ≤ 300ms (network + JetStream)
  Total Gate3 → ACK:                         ≤ 500ms (P99 budget)

Error paths:
  Connection lost → CircuitBreaker tracks failures
  5 consecutive failures → OPEN (30s), detection events buffer to SQLite
  OPEN timeout → HALF_OPEN → reconnect attempt
  2 successes in HALF_OPEN → CLOSED → flush SQLite buffer
```

### 2.3 Expo Push Notification Service

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Integration: Expo Push API                                                 │
│  Endpoint: https://api.expo.dev/v2/push/send                               │
│  Downstream: APNS (iOS) / FCM v1 (Android)                                 │
│  Token type: ExponentPushToken[...]                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  Flow:                                                                      │
│                                                                             │
│  App registers for push                                                     │
│    │                                                                        │
│    ▼                                                                        │
│  Notifications.getExpoPushTokenAsync()                                      │
│    │  returns ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxxxx]                   │
│    ▼                                                                        │
│  POST /functions/v1/register-node (token included in registration payload) │
│    │  stored in Supabase alert_subscriptions.push_token                    │
│    ▼                                                                        │
│  W2 alert-router receives alert → dispatches to Expo Push API              │
│    │  push_token from alert_subscriptions                                  │
│    ▼                                                                        │
│  Expo → APNS/FCM → device                                                  │
│                                                                             │
│  Latency budget (W2 dispatch → device notification):                       │
│    W2 alert-router → Expo API:   ≤ 200ms                                  │
│    Expo → APNS/FCM:              ≤ 500ms (typical)                         │
│    APNS/FCM → device:            ≤ 1000ms (cellular, P95)                  │
│    Total:                        ≤ 1700ms P95 (target: ≤ 2000ms)          │
├─────────────────────────────────────────────────────────────────────────────┤
│  Error paths:                                                               │
│    DeviceNotRegistered: token stale → remove from alert_subscriptions      │
│    MessageTooBig: payload > 4KB → truncate body (never happens in practice)│
│    MessageRateExceeded: back off 60s                                        │
│    InvalidCredentials: Expo project mismatch → alert Nico via Sentry       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Mapbox GL

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Integration: Mapbox GL via @rnmapbox/maps                                  │
│  Tile endpoint: https://api.mapbox.com/v4/mapbox.streets-v12/              │
│  Style: mapbox://styles/mapbox/dark-v11 (tactical look)                    │
│  Auth: EXPO_PUBLIC_MAPBOX_TOKEN (public access token, restricted to bundle │
│         ID: io.apexsentinel.mobile)                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  Offline capability:                                                        │
│    Download region: OfflinePack with bounds derived from current GPS +50km │
│    Zoom levels: 10–13 (default), 14–15 (optional/advanced)                 │
│    Max cache: 40MB per region (zoom 10–13), ~120MB (zoom 10–15)            │
│    Cache location: Mapbox internal cache dir (not expo-file-system)         │
├─────────────────────────────────────────────────────────────────────────────┤
│  Latency budget:                                                            │
│    Initial map load (online):   ≤ 2s on 4G                                │
│    Initial map load (offline):  ≤ 500ms (cached tiles)                     │
│    Marker render (100 markers): ≤ 16ms per frame (60fps target)            │
├─────────────────────────────────────────────────────────────────────────────┤
│  Error paths:                                                               │
│    No internet + no offline cache: map shows blank background              │
│    Token invalid: map shows "Unauthorized" watermark (rare — token is      │
│                   production token with no expiry)                          │
│    Cache corruption: delete + re-download via Settings > Clear Map Cache   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.5 Sentry

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Integration: @sentry/react-native                                          │
│  DSN: EXPO_PUBLIC_SENTRY_DSN (EAS Secret)                                  │
│  Environment: production / development / preview                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  Data captured:                                                             │
│    Unhandled JS exceptions: all                                             │
│    Unhandled promise rejections: all                                        │
│    Native crashes (ANR, iOS watchdog): via native SDK                       │
│    Manual: logger.warn / logger.error calls                                 │
│    Performance traces: 10% sample rate                                      │
│    Profiling: 5% sample rate                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  Data excluded (PII):                                                       │
│    node_id: never in Sentry events                                          │
│    Audio data: never in app — cannot be in Sentry                          │
│    Location: never sent to Sentry                                           │
│    NKey seed: never logged (Sentry beforeSend strips keys containing       │
│               "seed", "key", "token", "secret")                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  Error paths:                                                               │
│    Sentry DSN unreachable: events buffered locally (SQLite), retry on next │
│    network availability                                                     │
│    Rate limit exceeded: events dropped silently (Sentry handles this)      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.6 Meshtastic BLE

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Integration: react-native-ble-plx + Meshtastic protobuf                   │
│  Hardware: Meshtastic-compatible LoRa device (Heltec V3, RAK4631, etc.)   │
│  Protocol: Meshtastic BLE GATT profile                                     │
├───────────────────────────────┬────────────────────────────────────────────┤
│  Characteristic               │  Purpose                                   │
├───────────────────────────────┼────────────────────────────────────────────┤
│  TORADIO (write)              │  Send protobuf packets to radio            │
│  6ba1b218-... service         │  (detection events forwarded to mesh)      │
├───────────────────────────────┼────────────────────────────────────────────┤
│  FROMRADIO (notify)           │  Receive protobuf packets from radio       │
│                               │  (ACKs, mesh topology info)               │
└───────────────────────────────┴────────────────────────────────────────────┘

Latency budget (detection event → LoRa transmission):
  App → BLE write:              ≤ 50ms
  BLE → LoRa transmit:          ≤ 30ms (radio hardware)
  LoRa propagation (1km):       ≤ 30ms
  Gateway → NATS publish:       ≤ 100ms
  Total (offline path):         ≤ 210ms additional vs direct NATS path

Error paths:
  BLE device not found: scan retry every 30s, show "No mesh device" status
  BLE connection lost: auto-reconnect using stored device ID
  LoRa mesh no gateway: events queued in Meshtastic device internal buffer (8KB)
  Gateway goes offline: Meshtastic mesh re-routes via other nodes if available
```

### 2.7 TFLite Runtime (Android)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Integration: TFLite via Expo Module (modules/tflite/)                      │
│  SDK: tensorflow-lite:2.16.1, tensorflow-lite-support:0.4.4                │
│  Model: yamnet_w3_int8.tflite (bundled in app assets)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  Initialization sequence:                                                   │
│    App start → loadModel("yamnet_w3_int8.tflite")                          │
│      → FileUtil.loadMappedFile (memory-mapped, not copied)                 │
│      → SHA-256 verify                                                       │
│      → Interpreter.Options(numThreads=2, useXNNPACK=true)                  │
│      → Interpreter instance cached in module                               │
│                                                                             │
│  Per-frame sequence:                                                        │
│    AudioCapture emits Float32Array[16000]                                   │
│    → TFLiteModule.runInference(pcmData)                                    │
│    → ByteBuffer[16000 × 4 bytes]                                           │
│    → Interpreter.run(inputBuffer, outputBuffer[1][521])                    │
│    → return { scores, topClassIndex, topClassScore, inferenceMs }          │
│                                                                             │
│  Memory: model memory-mapped (~480KB resident). Interpreter ~2MB heap.    │
│  Thread: runs on Expo Module thread pool (not JS thread, not main thread)  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Error paths:                                                               │
│    loadModel SHA mismatch → throw ModelIntegrityError → trigger OTA update │
│    runInference wrong size → throw InvalidInputError                       │
│    Interpreter crash (OOM) → caught by native, reported to Sentry via      │
│                              @sentry/react-native native crash SDK          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.8 CoreML Runtime (iOS)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Integration: CoreML via Swift bridge (ios/apexsentinel/CoreMLBridge.m)    │
│  Framework: CoreML.framework (system, iOS 11+)                             │
│  Model: YAMNet_W3.mlpackage (compiled into .ipa at build time)             │
│  Compute: cpuAndNeuralEngine (ANE preferred, CPU fallback)                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Initialization:                                                            │
│    MLModel.load(contentsOf: modelURL, configuration: MLModelConfiguration) │
│    configuration.computeUnits = .cpuAndNeuralEngine                        │
│    configuration.allowLowPrecisionAccumulationOnGPU = true                 │
│                                                                             │
│  Per-frame:                                                                 │
│    Float32Array[15600] → MLMultiArray shape [1, 15600]                     │
│    → MLModel.prediction(from: input)                                       │
│    → MLMultiArray shape [521] → Float32Array[521]                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  Error paths:                                                               │
│    MLModel compile failure: fatal — should not happen post-build           │
│    ANE unavailable: automatic CPU fallback (MLModelConfiguration handles)  │
│    Prediction error: catch NSError → throw to React Native → Sentry        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.9 expo-sqlite

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Integration: expo-sqlite (SQLite 3.43, WAL mode)                          │
│  DB file: apex_sentinel.db (in expo-file-system document directory)        │
│  Tables: detection_events, alerts, node_state, schema_version              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Latency budget:                                                            │
│    INSERT detection event:       ≤ 10ms (WAL mode, async)                 │
│    SELECT last 100 detections:   ≤ 50ms (indexed on timestamp_us)         │
│    INSERT alert:                 ≤ 10ms                                    │
│    SELECT alert history 30d:     ≤ 100ms (indexed on received_at)         │
├─────────────────────────────────────────────────────────────────────────────┤
│  Error paths:                                                               │
│    Database locked (concurrent write): retry with 10ms backoff, 3 attempts │
│    Storage full: catch SQLITE_FULL → trigger pruning of oldest rows        │
│    Corruption (rare): backup last 24h to temp file, drop + recreate        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.10 expo-secure-store

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Integration: expo-secure-store                                             │
│  Android: Android Keystore System (AES-256-GCM)                           │
│  iOS: Keychain Services (kSecClassGenericPassword)                         │
├──────────────────────────────┬──────────────────────────────────────────┤
│  Key                         │  Content                                 │
├──────────────────────────────┼──────────────────────────────────────────┤
│  sentinel_node_id            │  e.g. nde_01HXXXXXXXXXXXXXXXXXXXXXXXXX  │
│  sentinel_nkey_seed          │  NATS NKey seed (56 chars, starts SUAA)│
│  sentinel_nats_endpoint      │  wss://nats.apex-sentinel.io:443        │
│  sentinel_subject_prefix     │  sentinel.detections.{nodeId}           │
└──────────────────────────────┴──────────────────────────────────────────┘

Error paths:
  Key not found: return null → trigger re-registration flow
  Keystore unavailable (device boot, unlock required): return null →
    show "Please unlock device to continue detection"
  SecureStore error (OEM bug): catch, log to Sentry (without key name),
    attempt AsyncStorage fallback with AES-256 encryption (emergency only)
```

---

## 3. Data Flow Summary

```
DETECTION EVENT PATH (happy path):
  Microphone → PCM 16kHz mono
    → AudioCaptureService (Frame 16000 samples)
    → TFLiteModule / CoreMLBridge (521 YAMNet scores, ≤150ms)
    → Gate1 (energy threshold)
    → Gate2 (drone class threshold)
    → Gate3 (confidence threshold + cooldown)
    → DetectionEvent {node_id, timestamp_us, threat_class, confidence}
    → NATSClient.publish("sentinel.detections.{nodeId}", event) [≤50ms]
    → NATS JetStream ACK [≤300ms]
    → SQLite: nats_published=1 [≤10ms]
  Total latency: ≤ 500ms from Gate3 fire to NATS ACK

ALERT RECEIPT PATH (happy path):
  NATS JetStream → sentinel.alerts.{level}
    → NATSClient subscription handler
    → Zod parse + validate
    → AlertRepository.insert(alert) [SQLite, ≤10ms]
    → useAlertStore.addAlert(alert) [Zustand, synchronous]
    → Notifications.scheduleNotificationAsync [≤200ms]
    → APNS/FCM delivery [≤1500ms]
  Total from NATS publish → push notification: ≤ 2000ms P95

OFFLINE (MESHTASTIC) PATH:
  Gate3 fire
    → MeshtasticBridge.forwardToNATS (BLE only if NATS circuit OPEN>60s)
    → BLE write to TORADIO characteristic [≤50ms]
    → LoRa radio transmit [≤30ms]
    → LoRa mesh relay (0-3 hops) [≤500ms per hop]
    → Gateway node → NATS publish [≤100ms]
  Total: ≤ 210ms additional vs direct path (excluding LoRa hops)
```
