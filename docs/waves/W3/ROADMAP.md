# APEX-SENTINEL W3 — Roadmap
**Version:** 1.0.0
**Wave:** W3 — Mobile Application
**Status:** APPROVED
**Date:** 2026-03-24
**Total Duration:** 35 days

---

## 1. Phase Overview

| Phase | Days | Focus | Exit Criteria |
|---|---|---|---|
| P1 | 1–7 | Scaffold + native TFLite + background audio | Detection running on device |
| P2 | 8–14 | NATS.ws + registration + event publishing | Events visible in W2 dashboard |
| P3 | 15–21 | Alert UI + map + push notifications | Alerts received and displayed |
| P4 | 22–28 | Calibration + battery optimization + Meshtastic | All connectivity paths verified |
| P5 | 29–35 | E2E tests + Sentry + app store prep | Stores submitted |

---

## 2. Phase 1: Scaffold + Native TFLite + Background Audio (Days 1–7)

### Objectives
- Expo SDK 51 project initialised with TypeScript, ESLint, Prettier
- Android TFLite native module loading YAMNet INT8, inference verified
- iOS CoreML native module loading YAMNet, inference verified
- Background audio capture pipeline running (audio → VAD → FFT → ML)
- SQLite schema initialised with all 4 tables
- Basic tab navigation (Home, Alerts, Map, Settings)

### Day-by-Day Tasks

**Day 1:**
- `npx create-expo-app apex-sentinel --template expo-template-blank-typescript`
- Configure Expo Router, set up tab navigation skeleton
- Configure EAS Build (development profile)
- Set up ESLint + Prettier + Husky pre-commit
- Initialise Zustand stores (nodeStore, alertStore, pipelineStore)

**Day 2:**
- Implement expo-sqlite Database.ts with migration runner
- Create all 4 SQLite tables (v1-v3 migrations)
- Implement NodeConfigRepo, PendingEventsRepo, AlertHistoryRepo, CalibrationRepo
- Write unit tests for all repos

**Day 3:**
- Android: Create TFLiteModule.java, TFLitePackage.java
- Add TFLite dependency to `android/build.gradle`
- Copy yamnet_int8.tflite to `android/app/src/main/assets/`
- Test loadModel() + runInference() with dummy input on Android emulator

**Day 4:**
- iOS: Create CoreMLModule.swift, register in AppDelegate
- Convert YAMNet to `.mlmodel` via coremltools
- Test loadModel() + runInference() on iOS simulator
- Implement InferenceRouter.ts (platform dispatch)

**Day 5:**
- Implement AudioCapture.ts (react-native-audio-record)
- Implement VAD.ts with RMS threshold
- Implement FFT.ts (mel spectrogram — integrate react-native-fft)
- Wire AudioCapture → VAD → FFT → InferenceRouter

**Day 6:**
- Implement BackgroundAudioTask.ts (expo-task-manager)
- Android: Foreground service manifest + notification
- iOS: Background audio mode in Info.plist + AVAudioSession config
- Test background pipeline survives screen lock

**Day 7:**
- Implement BatteryMonitor.ts (throttle states)
- Implement ModelManager.ts (load from assets, OTA stub)
- Integration test: launch → background → detect → log result
- Fix build issues, verify both platforms build cleanly with `eas build --profile development`

### P1 Exit Criteria
- [ ] TFLite inference returns valid YAMNet scores on Android
- [ ] CoreML inference returns valid scores on iOS
- [ ] Background audio pipeline survives 10-minute lock test
- [ ] Battery drain <3%/hr measured on Pixel 6a development build
- [ ] SQLite repos pass all unit tests (coverage ≥ 80%)

---

## 3. Phase 2: NATS.ws + Registration + Event Publishing (Days 8–14)

### Objectives
- NATSClient.ts connects to W2 NATS broker over WebSocket
- get-node-config Edge Function implemented and called on first launch
- Detection events published to `events.{geohash6}`
- Offline buffer (SQLite → flush on reconnect) operational
- HeartbeatService publishing every 60s
- node_app_versions upserted on connection

### Day-by-Day Tasks

**Day 8:**
- Implement NATSClient.ts (nats.ws, reconnect, auth)
- Implement ConnectivityMonitor.ts (NetInfo + state machine)
- Unit test reconnect logic with mocked NATS server

**Day 9:**
- Implement `get-node-config` Edge Function (Supabase functions/get-node-config)
- Implement `registration.ts` Supabase client call
- Implement `getOrCreateNodeId()` with SecureStore
- Test full onboarding → registration → NATS connect flow

**Day 10:**
- Implement EventPublisher.ts (NATS publish with retry)
- Implement FlushController.ts (pending_events FIFO drain)
- Wire AudioPipeline → EventPublisher → NATS / SQLite buffer
- Test offline buffer: disable NATS, generate events, reconnect, verify flush

**Day 11:**
- Implement HeartbeatService.ts (60s NATS publish)
- Implement `upsert-app-version` Edge Function
- Verify node appears in W2 dashboard heartbeat feed

**Day 12:**
- Implement LocationCoarsener.ts
- Implement `push-register` Edge Function
- Implement PushNotificationHandler.ts (expo-notifications token registration)
- Integration test: full detection event payload in W2

**Day 13:**
- Implement onboarding flow screens (welcome, permissions, nickname, complete)
- Implement ConsentManager.ts + `report-consent` Edge Function
- Privacy audit screen (Settings > Privacy)

**Day 14:**
- QR config parser (QRConfigParser.ts)
- Advanced config screen (hidden behind 3-tap)
- End-to-end test: fresh device → onboarding → detection → event in W2
- Fix any payload schema mismatches vs W2 consumer

### P2 Exit Criteria
- [ ] Detection event visible in W2 dashboard < 500ms from generation
- [ ] 1,000 events buffered offline, all flushed on reconnect (100% fidelity)
- [ ] Heartbeat visible in W2 every 60s
- [ ] Onboarding P50 < 3 min (timed test)
- [ ] get-node-config Edge Function deployed and passing tests

---

## 4. Phase 3: Alert UI + Map + Push Notifications (Days 15–21)

### Objectives
- Alert feed screen with live NATS subscription
- Map screen with alert pins
- Push notification delivery tested on physical devices
- Alert muting implemented
- get-alerts-feed Edge Function for polling fallback

### Day-by-Day Tasks

**Day 15:**
- Implement AlertSubscriber.ts (NATS subscribe `alerts.{geohash4}`)
- Implement AlertHistoryRepo insert + getRecent
- Build AlertFeedScreen with severity color coding
- Unit test alert deduplication

**Day 16:**
- Integrate react-native-maps (MapLibre GL or Apple Maps/Google Maps)
- Build MapScreen with alert pins, severity colors
- Deep link: notification → MapScreen with alert focused

**Day 17:**
- Push notification delivery E2E test
  - W2 publishes alert → Expo Push API → FCM/APNs → device
- Push notification content: event type, distance, severity badge
- Test on Pixel 6a (Android) + iPhone 12 (iOS) physical devices

**Day 18:**
- Alert muting (1h, 4h, 8h options) stored in node_config
- Mute indicator in status bar component
- `get-alerts-feed` Edge Function implementation
- Polling fallback when NATS unavailable

**Day 19:**
- Alert detail screen (tap alert → full detail)
- Distance calculation (haversine from node location to alert source)
- Alert retention: prune > 7 days on app resume

**Day 20:**
- Home screen status dashboard (NATS status, buffer depth, last event, model version)
- In-app notification banner for alerts received while app is foreground
- Unread badge on Alerts tab

**Day 21:**
- Integration test: W2 generates alert → mobile receives push → opens map
- Fix any alert subscription race conditions
- Performance profiling: alert feed with 500 items (no jank)

### P3 Exit Criteria
- [ ] Push notification delivered < 3s from W2 alert generation
- [ ] Alert feed renders 50 items without jank (< 16ms frame time)
- [ ] Deep link from notification opens correct map alert
- [ ] Alert mute persists across app restarts

---

## 5. Phase 4: Calibration + Battery Optimization + Meshtastic (Days 22–28)

### Objectives
- CalibrationService.ts: 60s ambient baseline, VAD threshold update
- Calibration results synced to W2 via NATS
- Battery optimization validated (< 3%/hr soak test)
- Meshtastic BLE discovery and event routing
- OTA model update flow tested end-to-end

### Day-by-Day Tasks

**Day 22:**
- Implement CalibrationService.ts (60s recording, RMS, spectral analysis)
- CalibrationScreen UI (start, progress, result, history)
- CalibrationRepo insert + history display

**Day 23:**
- Calibration results published to `calibration.{nodeId}` NATS subject
- VAD threshold update from calibration result
- Before/after detection rate display in calibration history

**Day 24:**
- Battery soak test on Pixel 6a: 1hr background operation, verify < 3% drain
- Battery soak test on iPhone 12: same
- Profile and optimise if over threshold (reduce FFT resolution, increase VAD rejection)

**Day 25:**
- Implement BLEScanner.ts (react-native-ble-plx Meshtastic UUID scan)
- Implement MeshProto.ts (protobuf encode for Meshtastic DM)
- Implement MeshtasticGateway.ts (send event via BLE write)
- Test on physical Meshtastic device (T-Beam or similar)

**Day 26:**
- Wire Meshtastic into ConnectivityMonitor state machine (ONLINE → MESH fallback)
- BLE diagnostic panel (RSSI, SNR, hop count)
- Meshtastic device selection UI (Settings > Meshtastic)

**Day 27:**
- OTA model update flow: mock CDN → download → SHA-256 verify → reload
- OTA rollback test: corrupt model → verify rollback to previous version
- Model info screen (version, SHA-256, loaded date, last check)

**Day 28:**
- Thermal throttling test: simulate temp > 40°C → verify MINIMAL throttle state
- Full connectivity path test: ONLINE → NATS down → MESH → BUFFERING → reconnect → FLUSH
- Diagnostics screen completion (all UA-04 metrics visible)

### P4 Exit Criteria
- [ ] Calibration completes in 60s, VAD threshold updated, result in calibration_log
- [ ] Battery drain < 3%/hr on Pixel 6a + iPhone 12 (soak test certified)
- [ ] Meshtastic BLE event routing verified on physical device
- [ ] Full connectivity state machine transitions verified
- [ ] OTA model update + rollback tested

---

## 6. Phase 5: E2E Tests + Sentry + App Store Prep (Days 29–35)

### Objectives
- Detox E2E test suite passing on Android emulator + iOS simulator
- Sentry crash reporting configured and verified
- App store assets (screenshots, descriptions, privacy policy)
- Production EAS build clean on both platforms
- App store submission

### Day-by-Day Tasks

**Day 29:**
- Sentry.init() configuration (DSN from environment)
- Sentry PII scrubbing (nodeId hash in scope, no personal data in events)
- Test crash reporting: trigger exception, verify in Sentry dashboard

**Day 30:**
- Detox: onboarding E2E test (welcome → permissions → nickname → active node)
- Detox: background detection simulation test
- Detox: alert receipt test (mocked NATS alert → notification → map)

**Day 31:**
- Detox: offline Meshtastic fallback test (mocked BLE)
- Detox: GDPR deletion E2E test (delete all → verify fresh onboarding)
- Integration: full system test with live W2 backend

**Day 32:**
- App store screenshots (5 per platform per locale: en, uk, ro)
- App store description (en primary)
- Privacy policy URL (hosted at apexsentinel.uk/privacy)
- Privacy nutrition labels (Apple) + Data safety form (Google)

**Day 33:**
- Production EAS build: Android (AAB) + iOS (IPA)
- Internal testing distribution via EAS
- Fix any production build issues (native module linking, permissions)

**Day 34:**
- Google Play internal test track submission
- Apple TestFlight submission
- Push notification test on production builds

**Day 35:**
- Address any store review feedback
- Final coverage check (≥ 80% all metrics)
- wave-formation W3 complete gate: all acceptance criteria verified
- W3 SESSION_STATE.md updated with completion status

### P5 Exit Criteria
- [ ] All Detox E2E tests passing on Android API 33 emulator + iOS 17 simulator
- [ ] Sentry crash-free session rate > 99.2% in 48hr beta
- [ ] Production build submitted to both stores
- [ ] Coverage report: ≥ 80% branches/functions/lines
- [ ] W3 complete gate signed off

---

## 7. Milestones Table

| Milestone | Day | Description | Success Metric |
|---|---|---|---|
| M1 | 7 | On-device inference live | TFLite/CoreML detection verified both platforms |
| M2 | 14 | First event in W2 | Event visible in W2 dashboard < 500ms |
| M3 | 21 | Full alert loop | Push notification delivered < 3s |
| M4 | 28 | All connectivity paths | NATS + Mesh + Buffer fully tested |
| M5 | 35 | Store submission | Both stores submitted, TestFlight live |

---

## 8. Dependencies and Blockers

| Dependency | Required By | Owner | Risk |
|---|---|---|---|
| W2 NATS broker URL + credentials | Day 8 | W2 team | HIGH — blocking P2 |
| W2 alert publisher format | Day 15 | W2 team | HIGH — blocking P3 |
| Physical Meshtastic device | Day 25 | Nico | MEDIUM — can mock |
| Expo Push credits | Day 17 | Nico (EAS) | LOW |
| Apple Developer Program | Day 32 | Nico | LOW — assumed active |
| Google Play Console | Day 32 | Nico | LOW — assumed active |
| CDN for model manifest | Day 27 | Nico | LOW — S3 or Cloudflare |
