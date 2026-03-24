# APEX-SENTINEL W3 — DECISION LOG

> Wave: W3 — React Native Mobile App (Android + iOS)
> Project: APEX-SENTINEL
> Supabase: bymfcnwfyxuivinuzurr (eu-west-2)
> Status: ACTIVE
> Last Updated: 2026-03-24

---

## Decision Index

| ID | Title | Status | Date |
|----|-------|--------|------|
| ADR-W3-001 | React Native vs Flutter vs Native | ACCEPTED | 2026-03-10 |
| ADR-W3-002 | Expo SDK 51 Managed vs Bare Workflow | ACCEPTED | 2026-03-10 |
| ADR-W3-003 | TFLite Java API vs ML Kit | ACCEPTED | 2026-03-11 |
| ADR-W3-004 | NATS.ws vs MQTT vs HTTP Polling | ACCEPTED | 2026-03-11 |
| ADR-W3-005 | nats.ws Official Client vs Custom WebSocket Wrapper | ACCEPTED | 2026-03-12 |
| ADR-W3-006 | Zustand vs Redux for State Management | ACCEPTED | 2026-03-12 |
| ADR-W3-007 | Mapbox GL vs Google Maps vs OSM/Leaflet | ACCEPTED | 2026-03-13 |
| ADR-W3-008 | expo-av vs react-native-audio-record for PCM | ACCEPTED | 2026-03-13 |
| ADR-W3-009 | SecureStore vs AsyncStorage for Node Credentials | ACCEPTED | 2026-03-14 |
| ADR-W3-010 | Background Execution Strategy: iOS vs Android | ACCEPTED | 2026-03-14 |
| ADR-W3-011 | Push Notifications: Expo vs FCM/APNs Direct | ACCEPTED | 2026-03-15 |
| ADR-W3-012 | SQLite vs MMKV for Local State | ACCEPTED | 2026-03-15 |
| ADR-W3-013 | OTA Model Updates: CDN + SHA-256 vs App Store Update | ACCEPTED | 2026-03-16 |
| ADR-W3-014 | Detox vs Maestro for E2E Testing | ACCEPTED | 2026-03-16 |
| ADR-W3-015 | Sentry vs Firebase Crashlytics | ACCEPTED | 2026-03-17 |
| ADR-W3-016 | Meshtastic BLE Integration Library | ACCEPTED | 2026-03-18 |
| ADR-W3-017 | CoreML vs TFLite on iOS | ACCEPTED | 2026-03-18 |
| ADR-W3-018 | EAS Build vs Local Build Pipeline | ACCEPTED | 2026-03-19 |
| ADR-W3-019 | Monorepo vs Separate Repo for Shared W1/W2 Code | ACCEPTED | 2026-03-19 |
| ADR-W3-020 | Feature Flags: Remote Config vs Hardcoded | ACCEPTED | 2026-03-20 |

---

## ADR-W3-001: React Native vs Flutter vs Native

**Status:** ACCEPTED
**Date:** 2026-03-10
**Deciders:** Nico Fratila

### Context

W1 produced a production-grade TypeScript detection stack: VAD, FFT, YAMNet, TDoA, TrackManager, CoT, NodeRegistry, LocationCoarsener. W2 produced TypeScript NATS client wrappers, CircuitBreaker, DLQ, and Edge Function schemas. A mobile app is required to package this stack for field deployment on Android and iOS.

Three options were evaluated:

**Option A: React Native (Expo)**
- Full TypeScript codebase
- Code sharing with W1/W2 via npm workspace
- Large community, Expo ecosystem for OTA updates and EAS builds
- Native modules via Expo Modules API (Kotlin + Swift with JS bridge)
- React Native performance for UI adequate; heavy compute offloaded to native modules

**Option B: Flutter**
- Excellent performance, single Dart codebase
- No code sharing with W1/W2 (Dart ≠ TypeScript)
- TFLite plugin (tflite_flutter) exists but less mature than Android Java API
- Would require rewriting W1 detection stack in Dart or calling via platform channel
- Team Dart expertise: zero

**Option C: Native Android (Kotlin) + Native iOS (Swift) — separate apps**
- Maximum performance, full platform API access
- No code sharing — W1/W2 TypeScript modules must be reimplemented twice
- 2× development time
- 2× maintenance surface
- CircuitBreaker, DLQ, CoT serialisation would need porting

### Decision

**React Native with Expo SDK 51.**

### Rationale

The decisive factor is TypeScript code reuse. W1's detection pipeline (VAD, FFT, YAMNet wrapper, TDoA) and W2's NATS client, CircuitBreaker, and schema types are production-grade TypeScript. Rewriting in Dart (Flutter) or reimplementing in Kotlin + Swift doubles work and introduces drift bugs.

React Native allows importing `@apex-sentinel/core` (W1) and `@apex-sentinel/nats-client` (W2) directly into the mobile app. The only native code required is:
1. Android: Kotlin bridge for TFLite inference + continuous PCM audio (below AudioRecord API)
2. iOS: Swift bridge for CoreML inference + AVAudioEngine continuous recording

All application logic — VAD, FFT, event schema construction, CircuitBreaker invocation, CoT formatting — runs in the JS/TS layer from shared packages.

**Flutter rejected:** Zero team expertise, no code reuse.
**Native rejected:** 2× work, 2× maintenance, no code reuse.

### Consequences

- Native module bridge overhead: ~0.5ms per JS↔native call. Acceptable given YAMNet inference is 150ms total.
- React Native Hermes engine: enabled. Required for performance on low-end Android (Pixel 4a equivalent).
- New Architect (JSI) enabled in Expo 51. Eliminates bridge serialization overhead for TFLite module calls.
- expo-modules-core used for native module scaffolding.

---

## ADR-W3-002: Expo SDK 51 Managed Workflow vs Bare Workflow

**Status:** ACCEPTED
**Date:** 2026-03-10
**Deciders:** Nico Fratila

### Context

Expo offers two primary workflows:
- **Managed**: Expo controls the native layer. OTA updates via EAS Update. Limited native customization unless using Expo Modules API.
- **Bare**: Full native control (android/ and ios/ directories in repo). No OTA JS updates by default (can add manually). More like vanilla React Native.

### Decision

**Expo SDK 51 Managed Workflow with Expo Modules API for custom native modules.**

### Rationale

**OTA updates are critical for W3.** YAMNet model updates (new INT8 quantized model, improved false-positive rate) must deploy without an app store review cycle (7-14 day delay). EAS Update pushes new JS bundles to deployed devices within minutes.

OTA update scope in managed workflow:
- JS bundle changes: yes, instant via EAS Update
- TFLite model file changes: yes, via CDN fetch at runtime (separate from bundle)
- Native code changes: no, requires new binary build

This means: TFLite model hotswap (ADR-W3-013) + JS logic changes = fully OTA-updatable without store review. Only native module API changes require a new binary.

**Bare workflow rejected because:**
- Loses EAS Update OTA capability without manual setup
- android/ and ios/ directories create merge conflicts and require platform expertise for every dependency update
- CI pipeline complexity doubles (must run Gradle builds and Xcode builds locally)

**Expo Modules API (not deprecated React Native Native Modules):**
Custom TFLite and audio modules are written using `expo-modules-core`, which provides: Swift/Kotlin module boilerplate, TypeScript type generation, lifecycle management. This works within managed workflow.

### Consequences

- `expo-modules-core` used for TFLite module and audio capture module.
- `app.json` plugins array used to configure native layer (no direct android/ or ios/ editing).
- EAS Build for binary production; EAS Update for JS/asset OTA.
- Model file updates via CDN path (not in JS bundle).

---

## ADR-W3-003: TFLite Java API vs ML Kit vs ONNX Runtime (Android)

**Status:** ACCEPTED
**Date:** 2026-03-11
**Deciders:** Nico Fratila

### Context

Android inference runtime options for YAMNet:

**Option A: TFLite Java API (org.tensorflow:tensorflow-lite)**
- Direct model loading from .tflite file
- INT8 quantization supported
- GPU delegate, NNAPI delegate, Hexagon delegate
- Full control over input/output tensors
- Model size: 480KB INT8 quantized

**Option B: ML Kit (Google MLKit)**
- Higher-level API, auto-hardware acceleration
- Limited model customization — must use ML Kit model format or AutoML models
- Cannot load arbitrary .tflite models directly
- Cannot control INT8 quantization settings
- Bundle size overhead: ML Kit adds ~4MB baseline

**Option C: ONNX Runtime**
- Cross-platform, same model file on Android + iOS
- ONNX Runtime Mobile: 2MB binary
- YAMNet ONNX export requires conversion from TFLite (extra step, potential accuracy loss)
- Less mature Android/iOS React Native integration

### Decision

**TFLite Java API via `org.tensorflow:tensorflow-lite:2.14.0`.**

### Rationale

INT8 quantization is non-negotiable for field deployment. Target devices include Pixel 4a (Snapdragon 730) and Samsung A-series. INT8 drops YAMNet inference time from ~400ms (FP32) to ~120ms on these devices. ML Kit does not expose INT8 quantization control — it uses its own optimization pipeline that cannot be verified against our benchmark.

TFLite direct API gives us:
- Explicit INT8 interpreter options: `InterpreterOptions().setUseNNAPI(false).setNumThreads(2)`
- NNAPIDelegate for devices with Android Neural Networks API (Pixel 4+)
- Hexagon delegate for Snapdragon 845+ (S22, Pixel 6+)
- Predictable memory footprint: model loaded once, interpreter reused per inference call

ML Kit rejected: cannot verify INT8 quantization path, bundle size overhead, no tensor-level control.
ONNX Runtime rejected: extra conversion step, less proven React Native bridge, iOS ONNX→CoreML pipeline is inferior to native CoreML conversion.

### Consequences

- Android native module: `apex-sentinel-tflite/android/` in Kotlin
- Gradle dependency: `implementation 'org.tensorflow:tensorflow-lite:2.14.0'`
- Model file packaged in `android/app/src/main/assets/yamnet_int8.tflite`
- OTA model updates fetch new .tflite to `filesDir` and swap interpreter (ADR-W3-013)

---

## ADR-W3-004: NATS.ws vs MQTT vs HTTP Polling

**Status:** ACCEPTED
**Date:** 2026-03-11
**Deciders:** Nico Fratila

### Context

W2 runs a NATS JetStream cluster. Mobile app needs to:
1. Publish detection events to `sentinel.detections.{nodeId}` (~1-5 events/minute per node)
2. Subscribe to `sentinel.alerts.>` for threat alerts

**Option A: NATS.ws (WebSocket transport to NATS)**
- Same protocol as W2 backend
- 3ms message latency over WebSocket
- JetStream consumer support for durable subscriptions
- Official `nats.ws` npm client
- Single dependency, no protocol translation layer

**Option B: MQTT over WebSocket**
- Widely supported mobile protocol
- Requires MQTT broker (mosquitto or EMQ X) in front of NATS
- Protocol translation layer: MQTT topic → NATS subject mapping, extra 20-30ms
- QoS 1/2 for delivery guarantees vs JetStream's exactly-once
- Additional infrastructure to maintain

**Option C: HTTP REST polling**
- Simplest implementation
- 100ms minimum poll interval before server load becomes unacceptable
- Alert latency: 100ms-10s depending on poll frequency
- No push — requires client to initiate all communication
- Mobile battery impact: continuous polling keeps radio awake

### Decision

**NATS.ws using `nats.ws` npm client.**

### Rationale

Protocol consistency is the primary driver. W2 uses NATS JetStream for all event routing. Adding MQTT introduces a translation layer that can desync subject naming, lose JetStream sequence numbers, and break the DLQ design from W2.

Latency comparison on measured baseline:
- NATS.ws: 3ms median, 8ms p99 (measured on W2 staging)
- MQTT: 23ms median, 45ms p99 (adds broker hop + translation)
- HTTP polling at 1s intervals: 500ms average alert latency, 1000ms worst case

Alert latency matters. If a mobile node detects a gunshot and the coordinating node (or C2 Dashboard in W4) needs to correlate, 3ms vs 1000ms is the difference between useful TDoA correlation and noise.

Battery: NATS.ws maintains a single persistent WebSocket. HTTP polling at 1Hz keeps the radio transmitter cycling. A WebSocket idle keepalive every 30s is far cheaper.

MQTT rejected: extra infrastructure, extra latency, protocol mismatch with W2 architecture.
HTTP polling rejected: latency unacceptable for TDoA correlation window (W2 correlation window is 50ms).

### Consequences

- Mobile firewall: only outbound 443 (wss://) required
- NATS cluster must expose WebSocket listener (port 9222 internally, proxied to 443 via nginx/Caddy)
- `nats.ws` package version pinned to 1.28.x (matches W2 nats.js version)

---

## ADR-W3-005: nats.ws Official Client vs Custom WebSocket Wrapper

**Status:** ACCEPTED
**Date:** 2026-03-12
**Deciders:** Nico Fratila

### Context

Given the NATS.ws decision, two paths for the client:

**Option A: `nats.ws` npm package (official NATS WebSocket client)**
- Maintained by Synadia (NATS authors)
- Full JetStream API
- TypeScript types
- Tested against NATS 2.10.x

**Option B: Custom WebSocket wrapper with NATS-over-WebSocket protocol**
- Full control over reconnect logic
- Could implement subset of NATS protocol (CONNECT, PUB, SUB, MSG)
- Estimated 400 LOC to implement basic NATS protocol parser
- No JetStream support without significant additional work

### Decision

**`nats.ws` official client, wrapped in a thin reconnect + circuit breaker adapter.**

### Rationale

Implementing a subset of the NATS protocol is not justified. The only reason to do so would be bundle size reduction. `nats.ws` minified is 48KB — acceptable. The official client handles:
- TLS WebSocket upgrade
- NATS CONNECT handshake with credentials (JWT/nkey)
- Automatic reconnection with jitter backoff
- JetStream consumer creation and message acknowledgement
- Server-side flow control

Custom wrapper would require reimplementing all of the above and would not have the nkey/JWT auth support that W2's mTLS credential model requires.

The W2 `NatsClientWrapper` (already implemented) is reused directly. The mobile app imports `@apex-sentinel/nats-client` from the monorepo.

### Consequences

- `nats.ws` pinned in shared package
- Additional mobile-specific wrapper: `useNatsConnection` React hook handles React lifecycle (unmount = close connection)
- Background service manages connection lifecycle independently of React lifecycle

---

## ADR-W3-006: Zustand vs Redux Toolkit vs Jotai for State Management

**Status:** ACCEPTED
**Date:** 2026-03-12
**Deciders:** Nico Fratila

### Context

Mobile app state includes: node registration status, NATS connection status, active alerts, detection history feed, calibration wizard step, battery mode, Meshtastic BLE device pairing state.

**Option A: Zustand**
- 1.1KB minified + gzipped
- No boilerplate
- React hooks API
- Middleware for persistence, devtools, immer
- Works outside React components (background service can call store actions)

**Option B: Redux Toolkit**
- 11KB minified + gzipped
- Reducer/action pattern, very structured
- RTK Query for API state management
- Strong devtools
- Overkill for this scope

**Option C: Jotai**
- Atomic state model
- 3KB minified
- Per-atom granular subscriptions
- Less ergonomic for complex shared state (alert list + NATS status + calibration all interrelated)

### Decision

**Zustand.**

### Rationale

Bundle size matters on mobile. Redux Toolkit at 11KB vs Zustand at 1.1KB is a meaningful difference when targeting low-end Android devices with limited RAM. More critically: the background audio service and NATS connection manager run outside React component lifecycle. They need to read/write store state directly. Zustand's `getState()`/`setState()` API works outside React. Redux requires dispatching actions through a store reference — equivalent, but more ceremony.

The state shape is not complex enough to justify Redux's discipline overhead. There are ~8 distinct state slices; they are not deeply nested. Zustand with immer middleware handles mutations cleanly.

Jotai rejected: atomic model adds complexity when multiple state values change atomically (e.g., NATS reconnect updates connection status + resets alert subscription simultaneously).

### Consequences

- Store defined in `src/store/` with slices: `nodeStore`, `natsStore`, `alertStore`, `detectionStore`, `calibrationStore`, `meshtasticStore`, `settingsStore`
- `zustand/middleware` immer enabled for all slices
- `zustand/middleware` persist enabled for `nodeStore` and `settingsStore` (backed by expo-secure-store for node credentials)

---

## ADR-W3-007: Mapbox GL vs Google Maps SDK vs OpenStreetMap/Leaflet

**Status:** ACCEPTED
**Date:** 2026-03-13
**Deciders:** Nico Fratila

### Context

Map view requirements:
- Display node locations
- Overlay threat tracks (lat/lng polylines from TdoaCorrelator output)
- Work OFFLINE (field deployment in low-connectivity environments)
- Custom styling (dark mode, minimal UI)

**Option A: Mapbox GL (maps-react-native)**
- Offline tile packs: download region, store locally, render without network
- Custom style JSON: full control over layer styling
- Vector tiles: zoom-level smooth, small download
- Commercial pricing: $5/1000 map loads after free tier
- `@rnmapbox/maps` React Native SDK, actively maintained

**Option B: Google Maps SDK (react-native-maps)**
- No offline tile support (licensed tiles, cannot cache)
- Less control over styling
- Free tier generous but requires network
- Widely known, large ecosystem

**Option C: OpenStreetMap with Leaflet (react-native-leaflet or WebView-based)**
- Free tiles
- WebView-based Leaflet has poor performance on mobile (WebView overhead)
- Offline: requires custom tile server (mbtiles + server) — too much infra for W3
- react-native-maplibre (MapLibre Native): OSM tiles, offline support, no API cost, but less mature React Native bridge

### Decision

**Mapbox GL via `@rnmapbox/maps`.**

### Rationale

Offline tile caching is non-negotiable. Field deployments (military base perimeters, remote facility security) cannot assume 4G connectivity. Mapbox's downloadable offline tile packs are the only production-grade mobile offline mapping solution with a maintained React Native bridge.

Custom styling needed: threat tracks displayed as red polylines with opacity encoding confidence level. Alert positions as pulsing markers. This requires vector tile layer manipulation that Google Maps does not support and WebView Leaflet cannot do performantly.

Mapbox cost: negligible at APEX-SENTINEL scale. Even 10,000 MAU at 10 map loads/day = 100,000 map loads/day = ~$500/month. Acceptable.

**Store rejection limit:** Mapbox offline packs scoped to a 50km radius at zoom 14 = ~45MB. App store size guidelines allow up to 100MB over-the-air for iOS, 150MB for Android. Packs downloaded after install, not bundled. No store limit risk.

MapLibre (OSM): Evaluated. OSM tiles require CDN (Mapbox or self-hosted). Self-hosted tile CDN is out of W3 scope. MapLibre + Mapbox tile CDN is similar cost but less mature RN bridge — rejected.

### Consequences

- `@rnmapbox/maps` version pinned to 10.1.x
- Mapbox API key stored in `MAPBOX_ACCESS_TOKEN` env var, baked into binary at EAS build time
- Offline pack management: download on calibration complete, scoped to node GPS location ± 50km
- Maximum offline pack size enforced at 100MB via `OfflinePackProgressCallback`

---

## ADR-W3-008: expo-av vs react-native-audio-record vs Custom Native Module

**Status:** ACCEPTED
**Date:** 2026-03-13
**Deciders:** Nico Fratila

### Context

Audio capture requirements:
- Continuous PCM capture at 16kHz, 16-bit mono
- Low latency access to raw samples for W1 VAD + FFT pipeline
- Works in background (app backgrounded, screen off)
- Minimal CPU overhead outside inference windows

**Option A: expo-av**
- High-level audio API
- Returns audio in compressed formats (AAC, MP4) or limited PCM
- Does not expose raw PCM buffer callbacks
- Uses AVFoundation on iOS (does support PCM via specific encoding settings)
- Cannot access continuous PCM stream for real-time VAD

**Option B: react-native-audio-record**
- Raw PCM recording
- Fires `onAudioData` callback with base64-encoded Int16Array
- Built on AudioRecord API (Android) and AVAudioEngine (iOS)
- Not maintained since 2022; last tested on RN 0.67

**Option C: Custom Native Module via expo-modules-core**
- Full control over AudioRecord (Android) and AVAudioEngine (iOS)
- Expose PCM Float32Array directly via JSI (New Architecture) — zero-copy
- Can implement exactly the buffer size needed (0.5s = 8000 samples at 16kHz)
- Foreground service integration on Android for background capture
- Written in Kotlin (Android) + Swift (iOS)

### Decision

**Custom Native Module using expo-modules-core (Option C).**

### Rationale

`react-native-audio-record` is unmaintained since RN 0.67 and does not work with Expo SDK 51's New Architecture (JSI). Using an unmaintained package in the critical audio capture path is unacceptable — it is the single most important hardware interface in APEX-SENTINEL.

`expo-av` cannot expose raw PCM sample buffers. It is designed for media playback and recording to files. Even with PCM encoding settings, there is no streaming callback for continuous inference.

The custom native module is ~350 lines of Kotlin and ~280 lines of Swift. It:
- Wraps `AudioRecord` (Android) with `VOICE_RECOGNITION` audio source for optimal AGC
- Wraps `AVAudioEngine` (iOS) with `installTap(onBus:bufferSize:format:block:)` for continuous PCM
- Exposes `startCapture(sampleRate: Int, bufferSize: Int)` and `onPcmData(Float32Array)` event
- Integrates with Android Foreground Service (separate module) for background operation

This is ~2 days of work for a production-grade, maintainable module vs relying on a dead library.

### Consequences

- Module: `modules/apex-audio-capture/` in monorepo
- Android: `AudioRecord` with `SAMPLE_RATE_16000`, `CHANNEL_IN_MONO`, `ENCODING_PCM_FLOAT`
- iOS: `AVAudioEngine` tap at 16kHz, converted from native sample rate via `AVAudioConverter`
- Buffer size: 8000 samples (0.5s) for VAD frame alignment with W1 pipeline
- New Architecture JSI enabled: PCM data passed as `Float32Array`, no base64 serialization

---

## ADR-W3-009: SecureStore vs AsyncStorage vs Keychain (Direct) for Node Credentials

**Status:** ACCEPTED
**Date:** 2026-03-14
**Deciders:** Nico Fratila

### Context

Node credentials stored locally:
- `nodeId` (UUID, generated at registration)
- NATS nkey seed (64-byte secret used for connection auth)
- JWT token (for Supabase session)
- Calibration parameters (not sensitive)

**Option A: expo-secure-store**
- Android: Android Keystore system (hardware-backed on API 23+)
- iOS: Keychain Services
- AES-256 encryption at rest
- Wiped on app uninstall
- 2KB value size limit per key

**Option B: AsyncStorage**
- Plain text on disk
- No encryption
- Not appropriate for secrets

**Option C: react-native-keychain (direct Keychain/Keystore access)**
- Direct access to iOS Keychain and Android Keystore
- Supports biometric-gated access
- More granular accessibility flags (e.g., `kSecAttrAccessibleWhenUnlocked`)
- But: not Expo-managed, requires bare workflow config or custom plugin

### Decision

**expo-secure-store for all secrets.**

### Rationale

expo-secure-store is the correct tool for the Expo managed workflow. It maps to the platform's hardware-backed secret storage:
- Android API 23+ (all target devices): EncryptedSharedPreferences backed by Android Keystore
- iOS: Keychain with `kSecAttrAccessibleWhenUnlocked` by default

The 2KB per-key limit is not a constraint. NATS nkey seed is 64 bytes, JWT token is typically 800-1200 bytes.

Biometric gating (react-native-keychain feature) is explicitly not required — field users must be able to access the app without biometrics. Simpler is better.

AsyncStorage rejected for all secrets: no encryption, plaintext on filesystem.

### Consequences

- `src/services/credentialStore.ts` wraps expo-secure-store
- Keys: `APEX_NODE_ID`, `APEX_NATS_SEED`, `APEX_JWT_TOKEN`
- Non-sensitive config (calibration, settings) in AsyncStorage
- GDPR wipe: deletes all SecureStore keys + SQLite database

---

## ADR-W3-010: Background Execution — iOS BackgroundTasks vs Android Foreground Service

**Status:** ACCEPTED
**Date:** 2026-03-14
**Deciders:** Nico Fratila

### Context

Background audio capture is the defining challenge of the mobile app. When the user backgrounds the app or the screen turns off, audio capture and inference must continue.

**iOS:**
- `BackgroundTasks` framework: `BGProcessingTask` and `BGAppRefreshTask`
- BGProcessingTask: up to 30 seconds, triggered opportunistically by OS
- Audio background mode: `UIBackgroundModes: audio` — app can run indefinitely while audio session is active
- `AVAudioSession.Category.record` with `mixWithOthers` option keeps session alive in background

**Android:**
- Foreground Service with persistent notification
- Runs indefinitely (until explicitly stopped)
- Must display notification to user (required by Android API 26+)
- `FOREGROUND_SERVICE_MICROPHONE` permission (Android 14+)

### Decision

**Platform-specific implementation: Android Foreground Service + iOS audio background mode.**

### Rationale

These are the only viable approaches on each platform. There is no cross-platform abstraction that handles both correctly.

**Android Foreground Service:**
- Mandatory for background microphone access on Android 8+
- Notification shown: "APEX Sentinel — monitoring active" with tap-to-open action
- Service started on app launch, stopped on explicit user disable
- Survives Doze mode: use `PowerManager.WakeLock` with `PARTIAL_WAKE_LOCK` to prevent CPU sleep during inference windows

**iOS Audio Background Mode:**
- `UIBackgroundModes: ["audio"]` in app.json
- `AVAudioSession.Category.record` kept active
- App runs indefinitely while audio session is active (not subject to 30s limit)
- Background fetch supplement: `BGAppRefreshTask` used for NATS reconnection on network change
- Critical: user must not terminate app from app switcher (App Store review note required)

The 30s BackgroundTasks limit does NOT apply when `UIBackgroundModes: audio` is set. This was the key finding that resolves the risk registered under RISK-W3-001.

### Consequences

- Android: `ExpoAudioCaptureForegroundService.kt` manages audio capture + inference loop
- iOS: `AVAudioEngine` tap runs in background; no foreground service equivalent needed
- Battery impact mitigation: pause inference when audio RMS < VAD threshold for 60 consecutive seconds (silence detection)

---

## ADR-W3-011: Push Notifications — Expo Notifications vs FCM/APNs Direct

**Status:** ACCEPTED
**Date:** 2026-03-15
**Deciders:** Nico Fratila

### Context

Alert notifications must reach the user even when app is backgrounded or closed. Options:

**Option A: Expo Push Notifications (expo-notifications + Expo Push Service)**
- Unified API for FCM (Android) and APNs (iOS)
- Expo server sends to Expo Push API → Expo routes to FCM/APNs
- No need to manage FCM service accounts or APNs certificates directly
- Push token format: `ExponentPushToken[xxx]`

**Option B: FCM (Android) + APNs (iOS) Direct**
- App registers directly with FCM/APNs
- Backend calls FCM Data API and APNs HTTP/2 API directly
- No Expo intermediary
- Expo push receipt validation not available

### Decision

**Expo Push Notifications (expo-notifications).**

### Rationale

For the W3 scope, direct FCM/APNs integration adds operational overhead without meaningful benefit. The Expo Push Service is a thin relay — message latency difference is <200ms. For alert use cases (threat detected), 200ms is immaterial (the NATS.ws subscription already delivers the alert in real-time; push notification is a wake-from-terminated redundancy).

Expo Push Service handles token management, platform routing, and delivery receipts in a single API. Backend (W2 Edge Functions) calls `https://exp.host/--/api/v2/push/send` — no FCM key management, no APNs certificate management in backend.

Certificate management cost: APNs p8 key upload to Expo dashboard = one-time 5-minute operation. FCM service account JSON = one-time setup. Both stored in EAS Secrets.

### Consequences

- `expo-notifications` in managed workflow
- Push token registered at node registration time, stored in Supabase `nodes` table alongside `nodeId`
- W2 `send-alert` Edge Function calls Expo Push API with `ExponentPushToken`
- Receipt checking cron runs every 15 minutes for delivery confirmation

---

## ADR-W3-012: SQLite vs MMKV vs In-Memory for Local State

**Status:** ACCEPTED
**Date:** 2026-03-15
**Deciders:** Nico Fratila

### Context

Local state requiring persistence:
- Pending detection events (published to NATS, awaiting ACK — up to 1000 items during offline periods)
- Alert history (last 500 alerts for offline viewing)
- Calibration log (timestamped calibration runs)
- Battery optimization log

**Option A: expo-sqlite**
- Relational storage
- WAL mode for concurrent read/write
- SQL queries for filtering (e.g., alerts in last 24h, pending events by status)
- ~2MB library overhead

**Option B: react-native-mmkv**
- Key-value store
- Very fast: 10-100× faster than AsyncStorage
- Not designed for relational data (pending event queue with status transitions)
- No SQL — cannot query "all pending events with status=failed AND retry_count < 3"

**Option C: In-memory (Zustand store only)**
- Zero persistence overhead
- State lost on app kill
- Pending events lost on crash = data loss

### Decision

**expo-sqlite for relational persistent state.**

### Rationale

The pending event buffer is the critical path. During Meshtastic offline mode or NATS disconnection, detection events accumulate locally. When connectivity resumes, a background sync process must:
1. Query all events with `status = 'pending'`
2. Publish each to NATS
3. Update status to `published` or `failed`

This is a relational workflow. MMKV cannot efficiently query by status. An in-memory queue is lost on crash (detection events must survive app kill).

SQLite in WAL mode handles concurrent reads from the UI (alert history screen) and concurrent writes from the background service (appending new detections) without locking.

MMKV is used supplementally for high-frequency non-relational state: last NATS connection timestamp, battery mode flag, UI preferences.

### Consequences

- `src/db/migrations/` contains 3 migration files
- Tables: `pending_events`, `alert_history`, `calibration_log`
- `expo-sqlite` 14.x with WAL enabled by default
- MMKV for non-relational fast state: `src/store/mmkv.ts`

---

## ADR-W3-013: OTA Model Updates — CDN + SHA-256 vs App Store Update

**Status:** ACCEPTED
**Date:** 2026-03-16
**Deciders:** Nico Fratila

### Context

YAMNet INT8 model will iterate as false positive rates are tuned in the field. A model update that reduces false positives by 30% should reach all deployed devices within hours, not weeks.

**Option A: CDN + SHA-256 hotswap**
- Model hosted at `https://cdn.apex-sentinel.io/models/yamnet_int8_v{N}.tflite`
- App fetches on startup if remote version > local version
- SHA-256 verification before loading
- New model active on next inference cycle

**Option B: App store binary update**
- New model bundled in new app binary
- iOS: 7-14 day review
- Android: 2-3 day review
- Users who don't update continue running old model

### Decision

**CDN + SHA-256 hotswap.**

### Rationale

The primary mission driver: model updates must not require app store review. A 30% false positive improvement discovered in week 1 of field deployment should be live in week 1, not week 2 or 3.

Security: SHA-256 hash of model file published to Supabase `model_versions` table. App verifies downloaded file hash before swapping. If hash mismatch: discard download, log error to Sentry, continue with current model.

Model file storage: `FileSystem.documentDirectory + 'models/'`. On Android this is `filesDir`, not bundled assets. `TFLite.loadModel(localPath)` supports loading from filesystem path.

App store binary: still required for native module changes (new TFLite API calls, audio capture API changes). JS bundle OTA (EAS Update) handles logic changes. CDN handles model file changes.

The combination gives three independent update channels:
1. Native binary (store): structural changes
2. JS bundle (EAS Update): logic changes
3. Model file (CDN): model changes

### Consequences

- `src/services/modelUpdateService.ts` checks model version on startup + every 24h
- `model_versions` table in Supabase: `(version TEXT, sha256 TEXT, url TEXT, min_app_version TEXT, released_at TIMESTAMPTZ)`
- CDN: Supabase Storage `models` bucket with public URL
- Rollback: decrement version in `model_versions` table; next startup all clients revert

---

## ADR-W3-014: Detox vs Maestro for E2E Testing

**Status:** ACCEPTED
**Date:** 2026-03-16
**Deciders:** Nico Fratila

### Context

**Option A: Detox (by Wix)**
- JavaScript test runner (Jest/Mocha)
- Gray-box testing: direct access to React Native app internals
- Automatic synchronization: waits for animations, network requests
- Expo support: `@config-plugins/detox` for managed workflow
- Android + iOS emulators
- Mature CI integration (GitHub Actions)

**Option B: Maestro**
- YAML-based flows
- Cross-platform (Android + iOS)
- Black-box: no access to app state
- No network request mocking
- Simpler learning curve
- Limited Expo support (no Expo-specific config plugin)

### Decision

**Detox.**

### Rationale

Gray-box testing is required for W3 because tests must:
- Mock NATS.ws connection (inject mock server)
- Verify that background audio service is running (check native service state)
- Assert that SQLite database contains correct records after test actions

Maestro's black-box model cannot do any of these. It can only assert visible UI state. For an app where the critical behaviors are invisible (background service running, NATS published, SQLite written), Maestro tests would miss the most important assertions.

Detox's `device.setStatusBar()`, `device.setLocation()`, and `device.sendUserNotification()` are used extensively in alert notification tests.

Maestro rejected: insufficient introspection capability for background service testing.

### Consequences

- `e2e/` directory at project root
- `detox.config.js` with Android emulator (Pixel 7 API 34) and iOS simulator (iPhone 14)
- Jest as test runner for Detox
- CI: Detox E2E runs on macOS GitHub Actions runner (required for iOS simulator)

---

## ADR-W3-015: Sentry vs Firebase Crashlytics

**Status:** ACCEPTED
**Date:** 2026-03-17

### Context

Crash and performance monitoring for mobile app.

**Option A: Sentry**
- Already used in W2 (backend Edge Functions and NATS workers)
- Single dashboard for mobile + backend errors
- Performance monitoring: transaction tracing from Edge Function → NATS → mobile
- React Native SDK: `@sentry/react-native`
- Source map upload integrated with EAS Build

**Option B: Firebase Crashlytics**
- Google Firebase ecosystem
- Requires Firebase SDK in app
- No distributed tracing across backend
- No integration with W2 Sentry setup

### Decision

**Sentry.**

### Rationale

Single observability platform across the entire stack. When an alert fails to reach the mobile client, a distributed trace shows: Edge Function (Sentry trace) → NATS publish → mobile NATS receive → push notification (Expo receipt). This cross-service trace is impossible with Crashlytics (backend) + Firebase (mobile) split.

W2 already has Sentry DSN configured. W3 uses the same Sentry project or a linked project in the same Sentry organization.

### Consequences

- `SENTRY_DSN` in EAS Secrets, injected at build time
- Source maps uploaded during `eas build` via `@sentry/react-native/metro`
- Performance: 10% sample rate in production, 100% in staging

---

## ADR-W3-016: Meshtastic BLE Integration Library

**Status:** ACCEPTED
**Date:** 2026-03-18

### Context

Meshtastic offline mode requires:
- BLE scan for Meshtastic devices
- Connect to device
- Send/receive protobuf-framed packets over BLE serial characteristic

**Option A: react-native-ble-plx + custom Meshtastic protobuf framing**
- `react-native-ble-plx`: mature BLE library, well-maintained
- Custom protobuf framing: meshtastic.MeshPacket proto from `@buf/meshtastic_meshtasticjs.protobuf_es`
- ~300 LOC of Meshtastic framing code

**Option B: @meshtastic/react-native SDK (community)**
- Unofficial SDK, last updated 2023
- Incomplete BLE implementation
- Not maintained

### Decision

**react-native-ble-plx + custom Meshtastic protobuf framing.**

### Rationale

The official Meshtastic community React Native SDK is unmaintained. react-native-ble-plx is the de facto standard for BLE in React Native (6.2k GitHub stars, active maintenance through 2025). Implementing the protobuf framing is straightforward using generated types from the Meshtastic protobuf definitions.

### Consequences

- `src/services/meshtasticService.ts` implements BLE scan, connect, send/receive
- Protobuf: `@buf/meshtastic_meshtasticjs.protobuf_es` for type generation

---

## ADR-W3-017: CoreML vs TFLite on iOS

**Status:** ACCEPTED
**Date:** 2026-03-18

### Context

iOS inference options for YAMNet:

**Option A: TFLite Runtime for iOS (CocoaPods `TensorFlowLiteSwift`)**
- Same model file as Android
- TFLite GPU delegate for iOS: Metal backend
- INT8 support on iOS via Core ML delegate

**Option B: CoreML with converted .mlmodel**
- Apple-native, optimized for Neural Engine (A12+)
- coremltools Python script converts .tflite → .mlmodel
- Potential accuracy loss during conversion (~1-2% on YAMNet benchmarks)
- Best performance on iPhone (leverages Apple Neural Engine)

### Decision

**TFLite as primary runtime on iOS, CoreML as accelerator via TFLite Core ML Delegate.**

### Rationale

The TFLite Core ML Delegate (`TFLiteSwift` 2.14 with `CoreMLDelegate`) routes inference through the Apple Neural Engine on A12+ devices while keeping the .tflite model format. This gives:
- Same model file on Android and iOS (no CoreML conversion)
- Neural Engine acceleration on iPhone 14 (A15 Bionic)
- Fallback to CPU on older devices
- No accuracy loss from conversion

Pure CoreML (Option B) requires a coremltools conversion pipeline and introduces ~2% accuracy delta. By using TFLite with CoreML delegate, we get the performance benefit without the accuracy cost.

### Consequences

- iOS native module uses `TFLiteSwift` pod + `CoreMLDelegate`
- Conversion script still maintained for documentation but not in critical path
- If CoreML delegate not available (iOS < 12 — negligible market share), falls back to CPU interpreter

---

## ADR-W3-018: EAS Build vs Local Build Pipeline

**Status:** ACCEPTED
**Date:** 2026-03-19

### Decision

**EAS Build (Expo Application Services).**

Building React Native for iOS requires a macOS machine with Xcode. EAS Build provides cloud macOS and Linux builders. This eliminates CI macOS runner costs (GitHub Actions macOS: 10× cost of Linux). EAS Build handles keystore management, provisioning profile management, and code signing.

Local build option retained for debugging only.

---

## ADR-W3-019: Monorepo vs Separate Repo for Shared W1/W2 Code

**Status:** ACCEPTED
**Date:** 2026-03-19

### Decision

**Monorepo with npm workspaces.**

W1 and W2 code lives in `packages/` within the apex-sentinel monorepo. The mobile app imports `@apex-sentinel/core` (W1 modules) and `@apex-sentinel/nats-client` (W2 NATS wrapper) as local workspace packages. This avoids versioning overhead and ensures the mobile app always uses the same code as the backend without publish/sync delays.

Metro bundler configured to resolve workspace packages via `watchFolders` in `metro.config.js`.

---

## ADR-W3-020: Feature Flags — Remote Config vs Hardcoded Constants

**Status:** ACCEPTED
**Date:** 2026-03-20

### Decision

**Supabase `app_config` table as remote config, polled at startup and cached in MMKV.**

Feature flags managed: `meshtastic_enabled`, `ota_model_updates_enabled`, `battery_optimization_threshold_pct`, `detection_cooldown_ms`. Allows disabling features without app store update or EAS Update. Fetched via Edge Function `get-node-config` (W2 function extended for W3).
