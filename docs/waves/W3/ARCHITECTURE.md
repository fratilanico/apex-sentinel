# APEX-SENTINEL W3 — Architecture Document
**Version:** 1.0.0
**Wave:** W3 — Mobile Application
**Status:** APPROVED
**Date:** 2026-03-24

---

## 1. Architecture Overview

APEX-SENTINEL W3 is a React Native (Expo SDK 51) cross-platform application for Android and iOS. It implements an on-device acoustic inference pipeline, real-time event publishing over NATS WebSocket, alert reception, offline Meshtastic BLE mesh fallback, and privacy-first design.

### 1.1 Architectural Principles

1. **On-device inference first** — All ML inference runs locally. Network is for reporting, not processing.
2. **Connectivity-optional** — Full detection capability in airplane mode. Network used only for publishing and alert receipt.
3. **Privacy by design** — Audio bytes never leave the device. Only event metadata transmitted.
4. **Battery-aware** — All background processes throttle based on battery level and thermal zone.
5. **Offline-resilient** — Events buffered in SQLite when network unavailable. Zero event loss.

---

## 2. Technology Stack

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Framework | React Native + Expo | SDK 51 | Cross-platform, managed workflow, EAS builds |
| Language | TypeScript | 5.4 | Type safety, shared types with W2 |
| Navigation | Expo Router | 3.x | File-based routing, deep link support |
| State | Zustand | 4.x | Lightweight, no boilerplate, background-safe |
| Audio (JS) | expo-av + react-native-audio-record | latest | PCM capture, background-compatible |
| Audio (native) | TFLite Java API (Android) / CoreML (iOS) | — | On-device inference |
| ML Model | YAMNet INT8 TFLite | 480KB | Acoustic event classification |
| NATS | nats.ws | 2.x | WebSocket NATS client |
| BLE (Meshtastic) | react-native-ble-plx | 3.x | BLE scan, connect, characteristic write |
| Local DB | expo-sqlite | 14.x | Event buffer, config, calibration |
| Remote DB | @supabase/supabase-js | 2.x | Registration, auth, push token |
| Background | expo-background-fetch + expo-task-manager | latest | Background audio scheduling |
| Push | expo-notifications | latest | FCM (Android) + APNs (iOS) |
| Secure storage | expo-secure-store | latest | nodeId, NATS credentials |
| HTTP | axios | 1.x | Edge Function calls |
| Monitoring | @sentry/react-native | 5.x | Crash reporting |
| Location | expo-location | latest | Coarsened GPS for event payload |
| Build/Deploy | EAS Build + EAS Update | latest | OTA patches, store builds |

---

## 3. Module Architecture

```
apex-sentinel-mobile/
├── app/                          # Expo Router pages
│   ├── (tabs)/
│   │   ├── index.tsx             # Home / status dashboard
│   │   ├── alerts.tsx            # Alert feed
│   │   ├── map.tsx               # Live map
│   │   └── settings.tsx          # Settings root
│   ├── onboarding/
│   │   ├── welcome.tsx
│   │   ├── permissions.tsx
│   │   ├── nickname.tsx
│   │   └── complete.tsx
│   ├── diagnostic/
│   │   └── index.tsx
│   └── _layout.tsx
├── src/
│   ├── audio/
│   │   ├── AudioPipeline.ts      # Orchestrates capture → VAD → ML → publish
│   │   ├── AudioCapture.ts       # PCM capture via react-native-audio-record
│   │   ├── VAD.ts                # Voice/energy activity detector
│   │   ├── FFT.ts                # Mel spectrogram computation
│   │   └── BackgroundAudioTask.ts # expo-task-manager background task
│   ├── ml/
│   │   ├── ModelManager.ts       # Load, OTA update, rollback
│   │   ├── TFLiteInference.ts    # Android TFLite native module bridge
│   │   ├── CoreMLInference.ts    # iOS CoreML native module bridge
│   │   ├── InferenceRouter.ts    # Platform dispatch
│   │   └── types.ts              # InferenceResult, ModelMetadata
│   ├── nats/
│   │   ├── NATSClient.ts         # Connection, auth, reconnect
│   │   ├── EventPublisher.ts     # Publish detection events
│   │   ├── AlertSubscriber.ts    # Subscribe to alerts.{geohash}
│   │   └── HeartbeatService.ts   # 60s heartbeat publisher
│   ├── meshtastic/
│   │   ├── BLEScanner.ts         # Scan for Meshtastic nodes
│   │   ├── MeshtasticGateway.ts  # Encode + send via BLE
│   │   └── MeshProto.ts          # Protobuf encode for Meshtastic DM
│   ├── db/
│   │   ├── Database.ts           # SQLite init, migrations
│   │   ├── NodeConfigRepo.ts     # node_config CRUD
│   │   ├── PendingEventsRepo.ts  # pending_events CRUD + flush
│   │   ├── AlertHistoryRepo.ts   # alert_history CRUD
│   │   └── CalibrationRepo.ts    # calibration_log CRUD
│   ├── supabase/
│   │   ├── client.ts             # Supabase JS client
│   │   ├── registration.ts       # Node registration Edge Function call
│   │   └── pushTokens.ts         # Push token upsert
│   ├── connectivity/
│   │   ├── ConnectivityMonitor.ts # NetInfo + state machine
│   │   └── FlushController.ts    # pending_events flush orchestration
│   ├── location/
│   │   └── LocationCoarsener.ts  # GPS → coarsened lat/lng + geohash
│   ├── privacy/
│   │   └── ConsentManager.ts     # Consent state, audit timestamps
│   ├── calibration/
│   │   └── CalibrationService.ts # 60s ambient baseline
│   ├── battery/
│   │   └── BatteryMonitor.ts     # Level + thermal zone → throttle
│   ├── store/
│   │   ├── nodeStore.ts          # Zustand: node state
│   │   ├── alertStore.ts         # Zustand: alert feed
│   │   ├── pipelineStore.ts      # Zustand: audio pipeline state
│   │   └── uiStore.ts            # Zustand: UI state
│   ├── push/
│   │   └── PushNotificationHandler.ts
│   ├── config/
│   │   ├── defaults.ts           # Default config values
│   │   └── QRConfigParser.ts     # QR code config payload parser
│   └── utils/
│       ├── crypto.ts             # SHA-256, UUID generation
│       ├── geohash.ts            # Geohash encode/decode
│       └── logger.ts             # Structured logging (Sentry breadcrumbs)
├── native/
│   ├── android/
│   │   ├── TFLiteModule.java     # React Native native module
│   │   ├── TFLitePackage.java
│   │   └── assets/yamnet_int8.tflite
│   └── ios/
│       ├── CoreMLModule.swift    # React Native native module
│       └── models/YAMNet.mlmodel
├── __tests__/
│   ├── unit/
│   ├── component/
│   └── integration/
├── e2e/                          # Detox tests
├── app.config.ts                 # Expo dynamic config
├── eas.json                      # EAS build profiles
└── babel.config.js
```

---

## 4. Data Flow Diagrams

### 4.1 Primary Detection Flow (Online)

```
┌──────────────────────────────────────────────────────────────────┐
│                    Background Audio Task                         │
│                                                                  │
│  Microphone                                                      │
│     │                                                            │
│     ▼                                                            │
│  AudioCapture.captureFrame()                                     │
│  [16kHz, 16-bit PCM, 100ms frames]                               │
│     │                                                            │
│     ▼                                                            │
│  VAD.check(frame)                                                │
│  [RMS > ambient_threshold?]                                      │
│     │ YES                          NO → discard frame            │
│     ▼                                                            │
│  FFT.melSpectrogram(frame)                                       │
│  [512-point FFT → 64 mel bands]                                  │
│     │                                                            │
│     ▼                                                            │
│  InferenceRouter.run(spectrogram)                                │
│  [TFLite (Android) or CoreML (iOS)]                              │
│     │                                                            │
│     ▼                                                            │
│  confidence >= threshold (0.72)?                                 │
│     │ YES                          NO → log locally only         │
│     ▼                                                            │
│  LocationCoarsener.getCoarsened()                                │
│     │                                                            │
│     ▼                                                            │
│  Build DetectionEvent{                                           │
│    nodeId, timestamp, eventType,                                 │
│    confidence, modelVersion,                                     │
│    inferenceMs, lat, lng, geohash                                │
│  }                                                               │
│     │                                                            │
│     ▼                                                            │
│  ConnectivityMonitor.getState()                                  │
│     │                                                            │
│  ONLINE ──────────────────────────────────────────►             │
│     │                                           NATS.publish()  │
│     │                                           subject:        │
│  NATS_DOWN                                      events.{geohash}│
│     │                                                            │
│     ▼                                                            │
│  MeshtasticGateway.available()?                                  │
│     │ YES                          NO                            │
│     ▼                              ▼                             │
│  MeshtasticGateway.send()    PendingEventsRepo.insert()          │
│                              [SQLite offline buffer]             │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Alert Receipt Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      Alert Receipt Flow                         │
│                                                                 │
│  W2 Backend                                                     │
│     │                                                           │
│     │ NATS publish alerts.{geohash}                             │
│     ▼                                                           │
│  AlertSubscriber.onMessage()                                    │
│     │                                                           │
│     ▼                                                           │
│  AlertHistoryRepo.insert(alert)                                 │
│     │                                                           │
│     ├──► alertStore.addAlert(alert)   ──► AlertFeedScreen rerender
│     │                                                           │
│     └──► PushNotificationHandler.notify()                       │
│          [If app in background: FCM/APNs push]                  │
│                                                                 │
│  User taps notification                                         │
│     │                                                           │
│     ▼                                                           │
│  Deep link: /map?alertId={id}                                   │
│     │                                                           │
│     ▼                                                           │
│  MapScreen.focusAlert(alertId)                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Connectivity State Machine

```
         ┌─────────────────────────────────────────┐
         │           CONNECTIVITY STATES           │
         │                                         │
         │   ┌──────────┐                          │
         │   │  ONLINE  │◄──────────────────────┐  │
         │   └──────────┘                       │  │
         │        │ network lost                 │  │
         │        ▼                              │  │
         │   ┌──────────────┐  BLE found    ┌────┴───┐
         │   │ NATS_OFFLINE │─────────────► │  MESH  │
         │   └──────────────┘               └────────┘
         │        │ no BLE                       │ BLE lost
         │        ▼                              │
         │   ┌──────────────┐◄─────────────────-┘
         │   │   BUFFERING  │  (SQLite only)
         │   └──────────────┘
         │        │ network restored
         │        ▼
         │   ┌──────────────┐
         │   │   FLUSHING   │ (drain pending_events → NATS)
         │   └──────────────┘
         │        │ buffer empty
         │        └──────────────────────────────►  ONLINE
         └─────────────────────────────────────────────────┘
```

### 4.4 NATS Authentication Flow

```
App Launch
   │
   ▼
SecureStore.getItem('nats_token')
   │
   ├── EXISTS ──► NATSClient.connect(wsUrl, token)
   │                  │
   │                  ▼
   │              NATS AUTH handshake (USER/PASS or NKEY)
   │                  │
   │                  ├── OK ──► CONNECTED state
   │                  └── 401 ──► token refresh via Supabase
   │
   └── MISSING ──► registration flow
                    │
                    ▼
                Edge Function: get-node-config
                    │
                    ▼
                Returns { natsToken, wsUrl, ... }
                    │
                    ▼
                SecureStore.setItem('nats_token', token)
                    │
                    ▼
                NATSClient.connect()
```

### 4.5 OTA Model Update Flow

```
WiFi Connect Event
   │
   ▼
ModelManager.checkForUpdate()
   │
   ▼
GET {CDN_URL}/models/manifest.json
Response: { version, sha256, url, size }
   │
   ├── version == current ──► no-op
   │
   └── version > current
           │
           ▼
       Download to temp path
           │
           ▼
       SHA-256 verify
           │
           ├── MISMATCH ──► delete temp, log error
           │
           └── MATCH
                   │
                   ▼
               Atomic rename to model path
                   │
                   ▼
               Reload TFLite interpreter
                   │
                   ├── FAIL ──► rollback to previous model
                   │
                   └── OK ──► update node_config.model_version
                               publish heartbeat with new modelVersion
```

---

## 5. Background Execution Architecture

### 5.1 Android

Android background audio uses a Foreground Service declared in `AndroidManifest.xml` with type `microphone`. The React Native layer starts the service via the expo-task-manager background task registration.

```xml
<!-- AndroidManifest.xml additions -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />

<service
  android:name=".AudioForegroundService"
  android:foregroundServiceType="microphone"
  android:exported="false" />
```

Task registration:
```typescript
// BackgroundAudioTask.ts
TaskManager.defineTask(AUDIO_TASK_NAME, async () => {
  await AudioPipeline.processFrame();
  return BackgroundFetch.BackgroundFetchResult.NewData;
});
```

The foreground service notification displays "Sentinel Active" with event counter and last detection time. This satisfies Android 12+ foreground service requirements and provides user-visible proof of background activity.

### 5.2 iOS

iOS background audio requires the `audio` background mode declared in `Info.plist`. expo-av maintains an active AVAudioSession while the app is backgrounded.

```xml
<!-- Info.plist additions -->
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
  <string>fetch</string>
  <string>remote-notification</string>
</array>
```

The AVAudioSession category is set to `PlayAndRecord` with options `allowBluetooth` and `mixWithOthers`, allowing background operation without interrupting media playback.

### 5.3 Battery Throttle States

```typescript
type ThrottleState = 'FULL' | 'REDUCED' | 'MINIMAL' | 'SUSPENDED';

function computeThrottleState(battery: number, tempC: number): ThrottleState {
  if (tempC > 45 || battery < 10) return 'SUSPENDED';
  if (tempC > 40 || battery < 20) return 'MINIMAL';
  if (tempC > 38 || battery < 30) return 'REDUCED';
  return 'FULL';
}

const SAMPLE_INTERVALS: Record<ThrottleState, number> = {
  FULL: 100,      // 100ms frames, continuous
  REDUCED: 1000,  // 1 sample/s
  MINIMAL: 10000, // 1 sample/10s
  SUSPENDED: 0,   // pipeline halted
};
```

---

## 6. Native Module Architecture

### 6.1 Android TFLite Native Module

The TFLite inference runs in a Java native module. The module is initialized once at app start and holds the Interpreter in memory throughout the app lifecycle.

Module interface (TypeScript bridge):
```typescript
interface TFLiteModuleInterface {
  loadModel(modelPath: string): Promise<{ success: boolean; modelId: string }>;
  runInference(inputBuffer: number[]): Promise<{
    classes: string[];
    scores: number[];
    inferenceMs: number;
  }>;
  getModelMetadata(): Promise<{
    version: string;
    sha256: string;
    inputShape: number[];
    outputShape: number[];
  }>;
  unloadModel(): Promise<void>;
}
```

Java implementation skeleton:
```java
// TFLiteModule.java
public class TFLiteModule extends ReactContextBaseJavaModule {
  private Interpreter interpreter;
  private static final int INPUT_SIZE = 15600; // 16kHz * 0.975s YAMNet window

  @ReactMethod
  public void loadModel(String modelPath, Promise promise) {
    try {
      MappedByteBuffer modelBuffer = loadModelFile(modelPath);
      Interpreter.Options opts = new Interpreter.Options();
      opts.setNumThreads(2);
      opts.setUseNNAPI(true); // Hardware acceleration when available
      interpreter = new Interpreter(modelBuffer, opts);
      promise.resolve(buildSuccessMap());
    } catch (Exception e) {
      promise.reject("LOAD_FAILED", e.getMessage());
    }
  }

  @ReactMethod
  public void runInference(ReadableArray inputData, Promise promise) {
    long start = SystemClock.elapsedRealtime();
    float[] input = new float[INPUT_SIZE];
    for (int i = 0; i < INPUT_SIZE; i++) {
      input[i] = (float) inputData.getDouble(i);
    }
    float[][] output = new float[1][521]; // YAMNet 521 classes
    interpreter.run(input, output);
    long inferenceMs = SystemClock.elapsedRealtime() - start;
    promise.resolve(buildOutputMap(output[0], inferenceMs));
  }
}
```

### 6.2 iOS CoreML Native Module

The iOS module uses a Swift native module wrapping the CoreML inference. YAMNet is converted to `.mlmodel` format via coremltools.

Swift implementation skeleton:
```swift
// CoreMLModule.swift
@objc(CoreMLModule)
class CoreMLModule: NSObject {
  private var model: MLModel?
  private var compiledModelURL: URL?

  @objc func loadModel(_ modelPath: String,
                       resolver: @escaping RCTPromiseResolveBlock,
                       rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let url = URL(fileURLWithPath: modelPath)
        let compiled = try MLModel.compileModel(at: url)
        self.model = try MLModel(contentsOf: compiled)
        self.compiledModelURL = compiled
        resolver(["success": true])
      } catch {
        rejecter("LOAD_FAILED", error.localizedDescription, error)
      }
    }
  }

  @objc func runInference(_ inputArray: [NSNumber],
                          resolver: @escaping RCTPromiseResolveBlock,
                          rejecter: @escaping RCTPromiseRejectBlock) {
    let start = Date()
    guard let model = self.model else {
      rejecter("NOT_LOADED", "Model not loaded", nil)
      return
    }
    // Build MLMultiArray input from inputArray
    // Run prediction, extract scores
    // Resolve with {classes, scores, inferenceMs}
  }
}
```

### 6.3 InferenceRouter

Platform dispatch abstraction:
```typescript
// InferenceRouter.ts
import { Platform } from 'react-native';
import { TFLiteInference } from './TFLiteInference';
import { CoreMLInference } from './CoreMLInference';

export class InferenceRouter {
  private static instance: TFLiteInference | CoreMLInference;

  static async initialize(): Promise<void> {
    if (Platform.OS === 'android') {
      this.instance = new TFLiteInference();
    } else {
      this.instance = new CoreMLInference();
    }
    await this.instance.loadModel();
  }

  static async run(melSpectrogram: Float32Array): Promise<InferenceResult> {
    return this.instance.run(melSpectrogram);
  }
}
```

---

## 7. Zustand State Stores

### 7.1 nodeStore
```typescript
interface NodeState {
  nodeId: string | null;
  nickname: string;
  registrationStatus: 'unregistered' | 'registered' | 'error';
  pipelineState: 'idle' | 'running' | 'throttled' | 'suspended';
  throttleState: ThrottleState;
  batteryLevel: number;
  thermalZone: number;
  bufferDepth: number;
  lastEventAt: Date | null;
  modelVersion: string;
  natsConnected: boolean;
  meshConnected: boolean;
}
```

### 7.2 alertStore
```typescript
interface AlertState {
  alerts: Alert[];
  unreadCount: number;
  mutedUntil: Date | null;
  addAlert: (alert: Alert) => void;
  markRead: (alertId: string) => void;
  setMute: (until: Date | null) => void;
}
```

### 7.3 pipelineStore
```typescript
interface PipelineState {
  isActive: boolean;
  currentFrameRMS: number;
  lastInferenceMs: number;
  eventsDetectedToday: number;
  falsePositivesFiltered: number;
  connectivityState: ConnectivityState;
  flushProgress: { pending: number; flushed: number } | null;
}
```

---

## 8. Navigation Structure (Expo Router)

```
/                           → (tabs) layout
/(tabs)/                    → Home (status dashboard)
/(tabs)/alerts              → Alert feed
/(tabs)/map                 → Live map
/(tabs)/settings            → Settings

/onboarding/welcome         → First launch
/onboarding/permissions     → Permission consent screen
/onboarding/nickname        → Optional nickname
/onboarding/complete        → Activation confirmation

/diagnostic                 → Full diagnostic panel (UA-04)
/settings/privacy           → Privacy controls
/settings/privacy/audit     → Privacy audit checklist
/settings/advanced          → Advanced config (3-tap unlock)
/settings/calibration       → Calibration runner
/settings/model             → Model info + update
/settings/meshtastic        → BLE device selection

/map?alertId=               → Deep-linked map focus
```

---

## 9. NATS Subject Architecture

| Subject | Direction | Description |
|---|---|---|
| `events.{geohash6}` | PUBLISH | Detection events from node |
| `nodes.{nodeId}.heartbeat` | PUBLISH | 60s heartbeat |
| `calibration.{nodeId}` | PUBLISH | Calibration results |
| `alerts.{geohash6}` | SUBSCRIBE | Alerts for node's area |
| `nodes.{nodeId}.config` | SUBSCRIBE | Remote config push |
| `nodes.{nodeId}.model` | SUBSCRIBE | Model update notification |

---

## 10. Module Dependency Graph

```
app/(tabs)/index
  └── pipelineStore, nodeStore
      └── AudioPipeline
          ├── AudioCapture
          ├── VAD
          ├── FFT
          ├── InferenceRouter
          │   ├── TFLiteInference (android)
          │   └── CoreMLInference (ios)
          ├── LocationCoarsener
          │   └── expo-location
          ├── NATSClient
          │   └── nats.ws
          ├── PendingEventsRepo
          │   └── Database (expo-sqlite)
          ├── MeshtasticGateway
          │   ├── BLEScanner (react-native-ble-plx)
          │   └── MeshProto
          └── BatteryMonitor
              └── expo-battery

app/(tabs)/alerts
  └── alertStore
      └── AlertSubscriber
          └── NATSClient

app/onboarding/permissions
  └── ConsentManager
      └── SecureStore (expo-secure-store)

app/settings/calibration
  └── CalibrationService
      ├── AudioCapture
      ├── CalibrationRepo (expo-sqlite)
      └── NATSClient (calibration publish)

ModelManager
  ├── expo-file-system (download)
  ├── crypto (SHA-256 verify)
  └── TFLiteInference / CoreMLInference (reload)
```

---

## 11. Audio Processing Pipeline Detail

### 11.1 Frame Parameters
- Sample rate: 16,000 Hz
- Bit depth: 16-bit PCM
- Frame duration: 100ms
- Samples per frame: 1,600
- YAMNet window: 975ms (15,600 samples) — sliding window with 50% overlap
- FFT size: 512
- Mel bands: 64
- Frequency range: 125Hz – 7,500Hz

### 11.2 VAD Algorithm
```typescript
class VAD {
  private ambientRMS = 0.02; // Default, updated by calibration
  private readonly threshold_sigma = 2.0;

  check(frame: Float32Array): boolean {
    const rms = computeRMS(frame);
    return rms > this.ambientRMS * (1 + this.threshold_sigma);
  }

  updateAmbient(calibrationRMS: number): void {
    this.ambientRMS = calibrationRMS;
  }
}
```

### 11.3 Mel Spectrogram
64 mel filter banks applied to the 512-point FFT output. Log-compressed. Normalized to [-1, 1] range for YAMNet input compatibility.

---

## 12. Security Architecture

- **nodeId:** Generated as UUID v4, stored in expo-secure-store, never transmitted in cleartext.
- **NATS auth:** Token stored in expo-secure-store. NATS connection uses USER/PASS or NKEY depending on W2 broker config.
- **Supabase anon key:** Stored in app config (not secrets — anon key is public by design). RLS enforces row-level access.
- **OTA model:** SHA-256 verification mandatory before model swap. CDN URL pinned in config.
- **TLS:** All network connections (NATS WS, Supabase, CDN) enforce TLS 1.2+. Certificate pinning on NATS WS endpoint.

---

## 13. Build Configuration

### eas.json
```json
{
  "cli": { "version": ">= 7.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "android": { "buildType": "app-bundle" },
      "ios": { "credentialsSource": "remote" }
    }
  },
  "submit": {
    "production": {
      "android": { "serviceAccountKeyPath": "./google-service-account.json" },
      "ios": { "appleId": "$(APPLE_ID)", "ascAppId": "$(ASC_APP_ID)" }
    }
  }
}
```

### app.config.ts (key sections)
```typescript
export default {
  name: 'APEX Sentinel',
  slug: 'apex-sentinel',
  version: '1.0.0',
  platforms: ['android', 'ios'],
  android: {
    package: 'uk.apexos.sentinel',
    permissions: [
      'RECORD_AUDIO',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_MICROPHONE',
      'BLUETOOTH_SCAN',
      'BLUETOOTH_CONNECT',
    ],
  },
  ios: {
    bundleIdentifier: 'uk.apexos.sentinel',
    infoPlist: {
      NSMicrophoneUsageDescription:
        'APEX Sentinel processes acoustic events on-device to detect threats. Audio is never stored or transmitted.',
      NSBluetoothAlwaysUsageDescription:
        'Used to connect to Meshtastic BLE mesh nodes for offline event routing.',
      UIBackgroundModes: ['audio', 'fetch', 'remote-notification'],
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-sqlite',
    ['expo-notifications', { sounds: ['alert.wav'] }],
    ['expo-location', { locationAlwaysAndWhenInUsePermission: '...' }],
  ],
};
```

---

## 14. Error Handling Strategy

| Error Type | Handling | Recovery |
|---|---|---|
| NATS connection failure | Log + transition to offline state | Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 60s) |
| TFLite load failure | Rollback to previous model | Alert UA-04 via diagnostic |
| SQLite write failure | Log to Sentry, skip event | Auto-vacuum on next launch |
| BLE scan permission denied | Disable Meshtastic feature silently | Show info in diagnostic panel |
| GPS unavailable | Use last known location | Fall back to nodeId-based geohash |
| OTA download failure | Keep current model | Retry on next WiFi connection |
| Thermal suspend | Halt audio pipeline | Resume when temp < 38°C |
| Push token registration failure | Retry with backoff | Queue for next NATS connection |
