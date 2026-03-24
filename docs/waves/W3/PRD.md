# APEX-SENTINEL W3 — Product Requirements Document
**Version:** 1.0.0
**Wave:** W3 — Mobile Application (Android + iOS)
**Project:** APEX-SENTINEL
**Supabase Project:** bymfcnwfyxuivinuzurr (eu-west-2)
**Status:** APPROVED
**Date:** 2026-03-24

---

## 1. Executive Summary

APEX-SENTINEL W3 delivers cross-platform mobile applications for Android and iOS that transform civilian smartphones into acoustic sensor nodes. The mobile client runs on-device YAMNet inference (TFLite on Android, CoreML on iOS), streams detected events to the W2 backend over NATS WebSocket, displays alerts on a live map, and falls back to Meshtastic BLE mesh when cellular connectivity is lost.

The core proposition: any civilian volunteer with a 3-year-old Android or 4-year-old iPhone becomes a real-time acoustic intelligence node within 5 minutes of installing the app, with passive battery drain below 3%/hr.

---

## 2. Problem Statement

### 2.1 The Sensor Gap

Acoustic monitoring networks require dense node coverage. Professional hardware nodes (W1) cover fixed positions. W2 backend aggregates data. But coverage gaps exist wherever fixed nodes have not been deployed — precisely the dynamic, unpredictable zones where civilian presence is highest.

Civilians carry smartphones. Those smartphones have high-quality microphones, GPS, computational resources, and persistent connectivity. Without a zero-friction mobile client, that sensor potential is entirely wasted.

### 2.2 Friction Barriers

Existing approaches fail on:
- **Setup time:** Technical configuration required before the node is active
- **Battery impact:** Background audio processing drains battery unacceptably, users uninstall
- **Privacy anxiety:** Continuous microphone access triggers distrust; no audit trail provided
- **Connectivity dependency:** Loses all capability when network drops
- **Alert blindness:** Users contribute data but receive no intelligence back

### 2.3 Target Problem

A civilian volunteer installs the app in a contested or at-risk area. They need:
1. Sub-5-minute onboarding from install to active node
2. Passive background operation with negligible battery cost
3. Real-time alerts when threat acoustics are detected network-wide
4. Continued operation during connectivity loss via Meshtastic BLE mesh
5. Clear privacy controls they trust

---

## 3. User Archetypes

### UA-01: Civilian Volunteer
**Profile:** Non-technical adult, ages 25–60. Owns an Android (mid-range, 2-3 years old) or iPhone (SE or newer). Motivated to contribute. Limited patience for setup.

**Context of use:** Urban apartment building, village, checkpoint proximity zone. Phone in pocket or on table. Intermittent connectivity. Concerned about phone battery.

**Goals:**
- Contribute without technical effort
- Know their phone is "doing something useful"
- Receive alerts before events reach their location
- Trust that the app is not surveilling them

**Frustrations:**
- Anything requiring account creation or email verification
- Battery drain notifications from the app
- Unexplained permissions
- Silent app — no feedback that it's working

**Success criteria:** Active node < 5 minutes post-install. Forgets the app is running except when alerts arrive.

---

### UA-04: Field Technician
**Profile:** Technical operator, 20–45. Deploys and maintains sensor networks in the field. Manages 10–100 nodes simultaneously. Needs diagnostic capability without connecting to backend.

**Context of use:** Field deployment, often with poor connectivity. Manages app configurations on civilian phones. Needs to verify node health, calibration status, model version.

**Goals:**
- Verify node is active and publishing events
- Adjust detection thresholds without cloud access
- View battery/thermal stats
- Push firmware/model updates over local WiFi when available
- Audit which events the node has buffered offline

**Frustrations:**
- No local diagnostic panel
- Needing cloud access to debug field issues
- Inability to bulk-configure phones

**Success criteria:** Full node health visible without internet. Can recalibrate and verify in < 2 minutes per device.

---

## 4. Out of Scope

- Video capture or image recognition
- User-to-user messaging
- Crowd management or evacuation routing
- Medical triage features
- Commercial alert subscription tiers (W4+)
- Desktop or web app (W2 covers operator web UI)

---

## 5. User Stories

### 5.1 Onboarding (UA-01, UA-04)

**US-01:** As UA-01, I want to install the app and reach active node status without creating an account, so I can contribute immediately without friction.
*Acceptance:* Anonymous nodeId generated, stored in SecureStore, registration POST to Edge Function, node appears in W2 dashboard within 30 seconds.

**US-02:** As UA-01, I want a single-screen permission request explaining exactly what mic access is used for, so I can make an informed consent decision.
*Acceptance:* Permission screen shows: what is recorded (acoustic events, not audio), what is transmitted (event metadata only), how to revoke. One tap to consent, one tap to decline.

**US-03:** As UA-01, I want to see a live status indicator confirming the app is monitoring, so I know it is working without opening it.
*Acceptance:* Persistent notification on Android. Status bar indicator on iOS. Both show "Sentinel Active" + event count + last event time.

**US-04:** As UA-04, I want to scan a QR code to receive node configuration, so I can batch-configure phones in the field.
*Acceptance:* QR encodes JSON config payload. App parses config, stores in SQLite node_config, restarts audio pipeline with new params.

**US-05:** As UA-01, I want onboarding to complete in under 5 minutes from first app launch, so the barrier to contribution is minimal.
*Acceptance:* Timed user test: P50 ≤ 3 min, P95 ≤ 5 min. Steps: launch → permission → nickname → done.

**US-06:** As UA-04, I want to enter a server URL during setup so nodes can connect to isolated backend instances.
*Acceptance:* Advanced config screen (hidden behind 3-tap on logo) accepts custom NATS WS URL and Supabase URL.

---

### 5.2 Background Audio Monitoring (UA-01)

**US-07:** As UA-01, I want the app to detect acoustic events even when my phone is locked and the screen is off, so I don't need to keep the app open.
*Acceptance:* Background task persists audio pipeline through screen lock. Verified on Android 12+ and iOS 16+.

**US-08:** As UA-01, I want the app's battery impact to be under 3% per hour in passive monitoring mode, so I'm not penalized for contributing.
*Acceptance:* Measured via battery historian on Android / Instruments on iOS. 1-hour passive soak test < 3% drain on Pixel 6a and iPhone 12.

**US-09:** As UA-01, I want the app to automatically reduce processing when my battery is below 20%, so it doesn't drain my last charge.
*Acceptance:* When battery < 20%, sampling rate drops to 1 sample/10s. When < 10%, audio pipeline suspends, queued events preserved.

**US-10:** As UA-01, I want the app to reduce processing when my phone is hot, so it doesn't damage my device.
*Acceptance:* Thermal zone monitoring. >40°C: reduce sampling to 1/5s. >45°C: suspend audio. Resume when <38°C.

**US-11:** As UA-04, I want to see a real-time audio level visualizer in the diagnostic panel, so I can verify mic pickup without triggering a full detection run.
*Acceptance:* Diagnostic screen shows live RMS amplitude waveform, 500ms refresh.

---

### 5.3 ML Detection (UA-01, UA-04)

**US-12:** As UA-01, I want acoustic threat detection to run entirely on-device, so detection works without internet connection.
*Acceptance:* Model runs on-device. Verified: detection triggers with airplane mode enabled.

**US-13:** As UA-04, I want to know which model version the app is running, so I can confirm OTA updates succeeded.
*Acceptance:* Settings screen shows: model name, version, SHA-256 hash, loaded date.

**US-14:** As UA-04, I want the model to update automatically over WiFi, so nodes stay current without manual intervention.
*Acceptance:* OTA model check runs on WiFi connect. Downloads to temp path, verifies SHA-256, swaps atomically. Rollback if new model fails load.

**US-15:** As UA-04, I want detection events to include confidence score and model version, so I can filter low-confidence events during analysis.
*Acceptance:* Event payload includes `confidence: float`, `modelVersion: string`, `inferenceMs: int`.

**US-16:** As UA-01, I want the app to only transmit events above a confidence threshold, so false positives don't flood the network.
*Acceptance:* Default threshold 0.72. Configurable via QR config. Events below threshold logged locally only.

**US-17:** As UA-04, I want calibration mode to run a 60-second ambient baseline, so the VAD threshold adapts to local noise floor.
*Acceptance:* Calibration records 60s ambient RMS, sets VAD threshold at ambient_rms + 2σ, stores in calibration_log.

---

### 5.4 Event Publishing (UA-01, UA-04)

**US-18:** As UA-01, I want detected events to be published to the W2 backend within 500ms of detection, so intelligence is near-real-time.
*Acceptance:* Latency measured: audio frame capture → NATS publish ≤ 500ms at P95 on 4G.

**US-19:** As UA-01, I want events detected while offline to be buffered locally, so no detections are lost during connectivity gaps.
*Acceptance:* pending_events SQLite table. Buffer capacity: 10,000 events. On reconnect: flush in FIFO order with backpressure.

**US-20:** As UA-01, I want the buffer flush to not degrade live detection performance, so reconnection doesn't cause a processing spike.
*Acceptance:* Flush rate-limited to 50 events/second during live detection. Full rate during idle reconnect.

**US-21:** As UA-04, I want to see the current buffer depth and flush progress, so I know when historical events have been transmitted.
*Acceptance:* Diagnostic screen shows pending_events count, flush rate, estimated time to empty.

---

### 5.5 Alert Receipt (UA-01)

**US-22:** As UA-01, I want to receive push notifications when a threat is confirmed near my location, so I can take protective action.
*Acceptance:* Push notification delivered within 3 seconds of W2 alert generation. Notification includes event type, distance estimate, timestamp.

**US-23:** As UA-01, I want the alert notification to open a map view showing the alert source, so I understand the spatial context.
*Acceptance:* Deep link from notification opens MapScreen with alert pin pre-centered.

**US-24:** As UA-01, I want to see a feed of recent alerts for my area (50km radius), so I have situational awareness.
*Acceptance:* AlertFeedScreen shows last 50 alerts, sorted by time. Polling interval 30s. Real-time via NATS subject `alerts.{geohash}`.

**US-25:** As UA-01, I want alerts color-coded by severity (green/amber/red), so I can triage at a glance.
*Acceptance:* severity 1-3 = green, 4-6 = amber, 7-10 = red. Color applied to notification badge and feed row.

**US-26:** As UA-01, I want to mute alerts for a set time period (1h, 4h, 8h), so I can silence during known safe periods without disabling monitoring.
*Acceptance:* Alert mute persists in SecureStore. Monitoring continues; push suppressed. Mute indicator visible in status bar component.

---

### 5.6 Offline / Meshtastic (UA-01, UA-04)

**US-27:** As UA-01, I want the app to automatically detect Meshtastic devices over BLE and route events through the mesh, so coverage continues during internet outage.
*Acceptance:* App scans for BLE devices advertising Meshtastic service UUID. On discovery: pairs, encodes event as Meshtastic protobuf, sends via DM to gateway node.

**US-28:** As UA-04, I want to manually select a specific Meshtastic node as the mesh gateway, so I can control routing in complex mesh topologies.
*Acceptance:* BLE device list in Settings. Tap to designate as preferred gateway. Stored in node_config.

**US-29:** As UA-01, I want the app to fall back gracefully from NATS → Meshtastic → local buffer, so I never lose a detection regardless of connectivity state.
*Acceptance:* Priority order: NATS WS > Meshtastic BLE > SQLite buffer. State machine transitions logged to calibration_log for diagnostics.

**US-30:** As UA-04, I want to see Meshtastic signal strength and hop count, so I can verify mesh connectivity quality.
*Acceptance:* BLE diagnostic panel shows RSSI, SNR, hop count from last Meshtastic ACK.

---

### 5.7 Privacy & Trust (UA-01)

**US-31:** As UA-01, I want to see a persistent indicator when the microphone is active, so I always know when audio is being processed.
*Acceptance:* Android: foreground service notification. iOS: microphone indicator dot (OS-enforced). App also shows in-app status badge.

**US-32:** As UA-01, I want to verify that audio is never stored on my device or transmitted to servers, so I can trust my privacy is protected.
*Acceptance:* Privacy screen shows: no audio files in app storage (verified programmatically), only event metadata transmitted. Open source audit link.

**US-33:** As UA-01, I want to delete all my data with a single button, so I can leave the network without residue.
*Acceptance:* "Delete everything" flow: POST to Edge Function delete-node, clears SQLite, clears SecureStore, revokes push token, exits to onboarding.

**US-34:** As UA-01, I want my location to be coarsened before any transmission, so precise location is never exposed.
*Acceptance:* GPS coordinates rounded to 4 decimal places (±11m accuracy) before inclusion in any event payload. Geohash precision 7 (153m grid).

**US-35:** As UA-04, I want the privacy audit checklist to be accessible from the app, so I can demonstrate compliance to regulators.
*Acceptance:* Settings > Privacy > Audit Checklist displays static compliance checklist with confirmation timestamps.

---

### 5.8 Calibration (UA-04)

**US-36:** As UA-04, I want to run a calibration mode that establishes the ambient noise baseline, so the detection threshold is adapted to local acoustic environment.
*Acceptance:* Calibration: 60s recording, computes RMS/spectral profile, stores in calibration_log with timestamp and location.

**US-37:** As UA-04, I want calibration results to be synced to W2, so centralized threshold management is possible.
*Acceptance:* Calibration payload published to NATS subject `calibration.{nodeId}` with ambient profile.

**US-38:** As UA-04, I want to see calibration history with before/after detection rates, so I can evaluate calibration effectiveness.
*Acceptance:* calibration_log table UI shows: date, ambient_rms, threshold_set, detections_24h before/after.

---

### 5.9 Diagnostics & Monitoring (UA-04)

**US-39:** As UA-04, I want a diagnostic dashboard accessible from the Settings screen, so I can verify full system health without backend access.
*Acceptance:* Diagnostic screen shows: NATS connection status, buffer depth, last event time, CPU%, memory MB, thermal zone, battery%, model version, BLE scan state.

**US-40:** As UA-04, I want error events to be automatically reported to Sentry, so I can monitor crash rates across the fleet.
*Acceptance:* Sentry DSN configured via build env. All unhandled JS exceptions and native crashes reported. Event payload includes nodeId (hashed), platform, OS version, app version.

**US-41:** As UA-04, I want the app to report app version and model version to Supabase on each registration/heartbeat, so I can identify nodes running outdated software.
*Acceptance:* node_app_versions table updated on every NATS connection. Includes app_version, model_version, platform, os_version.

**US-42:** As UA-04, I want heartbeat events published every 60 seconds, so W2 can detect silent nodes and trigger alerts.
*Acceptance:* NATS subject `nodes.{nodeId}.heartbeat` published every 60s with battery, thermal, buffer_depth, model_version.

---

### 5.10 App Store (UA-01)

**US-43:** As UA-01, I want the app to be available on Google Play and Apple App Store, so I can install it through trusted channels.
*Acceptance:* Both store listings live with correct permissions declared. Privacy policy URL in listing. Age rating: 12+.

**US-44:** As UA-01, I want app updates to be delivered automatically, so I don't need to manually update.
*Acceptance:* Expo OTA updates enabled. Critical patches delivered via EAS Update. Store releases for breaking changes only.

---

## 6. Success Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Install → active node | ≤ 5 min P95 | Onboarding timing instrumentation |
| Passive battery drain | < 3%/hr | Pixel 6a + iPhone 12 soak test |
| Detection latency E2E | ≤ 500ms P95 | Timestamp audit: audio frame → NATS ACK |
| Onboarding completion rate | ≥ 85% | Analytics funnel (no PII) |
| 7-day retention | ≥ 60% | Supabase heartbeat presence |
| Crash-free sessions | ≥ 99.2% | Sentry |
| Offline buffer fidelity | 100% (no drops) | Reconciliation test vs W2 received count |
| Push notification delivery latency | ≤ 3s P95 | Expo notification delivery log |
| Model update OTA success rate | ≥ 99% | node_app_versions model_version audit |
| False positive event rate | < 5% | W2 human review sample |

---

## 7. Constraints

### 7.1 Technical
- Must support Android API 26+ (Android 8.0) for background audio compatibility
- Must support iOS 14+ for background audio + BLE capability
- APK size ≤ 50MB (including TFLite model)
- No Play Services dependency (must work on de-Googled Android, e.g. GrapheneOS)
- TFLite model ≤ 480KB (INT8 quantized YAMNet)

### 7.2 Operational
- App must function with no server connectivity for ≥ 72 hours
- Must not require account creation (anonymous operation default)
- No analytics SDK with PII transmission

### 7.3 Regulatory
- GDPR-compliant by design (EU users primary)
- Mic permission justification must satisfy Google Play and App Store review
- Background audio use must be declared in app store privacy labels

---

## 8. Dependencies

| Dependency | Type | Version | Risk |
|---|---|---|---|
| Expo SDK | Framework | 51 | Low — LTS |
| TFLite YAMNet INT8 | Model | 480KB | Low — pre-trained |
| NATS.ws | Transport | 2.x | Medium — WS auth edge cases |
| react-native-ble-plx | BLE | 3.x | Medium — iOS BLE background |
| W2 Backend (NATS broker) | Runtime | W2 complete | High — blocking for integration |
| Expo EAS | Build/Deploy | Current | Low |
| Sentry | Monitoring | 5.x | Low |

---

## 9. Non-Functional Requirements

**NFR-01 Performance:** ML inference ≤ 80ms on device tier B (Snapdragon 665, A13 Bionic class).
**NFR-02 Memory:** RSS ≤ 120MB in steady-state background operation.
**NFR-03 Storage:** App data ≤ 50MB (model + SQLite buffer + app binary).
**NFR-04 Network:** Functions on 2G EDGE (NATS events ≤ 512 bytes each).
**NFR-05 Reliability:** NATS reconnect within 5s of connectivity restoration.
**NFR-06 Accessibility:** WCAG 2.1 AA for all alert UI components.
**NFR-07 Internationalisation:** en, uk (Ukrainian), ro (Romanian) locales at launch.

---

## 10. Acceptance Criteria Summary

| Story | Criterion |
|---|---|
| US-01 | Anonymous registration, node visible in W2 < 30s |
| US-05 | Onboarding P95 ≤ 5 min (timed test) |
| US-07 | Background pipeline survives screen lock, Android 12 + iOS 16 |
| US-08 | Battery soak < 3%/hr on Pixel 6a + iPhone 12 |
| US-12 | Detection triggers in airplane mode |
| US-18 | Event publish latency ≤ 500ms P95 |
| US-19 | 10,000 events buffered; all flushed on reconnect |
| US-22 | Push notification ≤ 3s from W2 alert |
| US-27 | Meshtastic BLE auto-detection and event routing |
| US-33 | Full data deletion in ≤ 3 taps |

---

## 11. Functional Requirements Register

### FR-W3-01: Audio Pipeline
**Priority:** P0
**Linked stories:** US-07, US-08, US-09, US-10, US-12
Captures 16kHz mono PCM audio, applies VAD energy gate, builds 975ms sliding window, computes mel spectrogram, dispatches to on-device ML inference. Operates continuously in background on Android 8+ and iOS 14+. Throttles processing based on battery level and thermal zone.

**Acceptance:**
- Pipeline starts within 500ms of consent grant
- VAD rejects frames with RMS < ambient + 2σ
- Background operation verified on Android 12 and iOS 16
- Battery drain < 3%/hr on defined test devices

---

### FR-W3-02: On-Device ML Inference
**Priority:** P0
**Linked stories:** US-12, US-13, US-14, US-15, US-16
Runs YAMNet INT8 TFLite model on Android via TFLite Java API. Runs YAMNet CoreML model on iOS. Returns top-10 class labels with confidence scores. Only dispatches events for threat classes above configured threshold.

**Acceptance:**
- Inference completes in ≤ 80ms on Tier B device
- Model loads from assets on first launch
- OTA model update: SHA-256 verified before activation
- Rollback to previous model on load failure

---

### FR-W3-03: Event Publishing
**Priority:** P0
**Linked stories:** US-18, US-19, US-20, US-21
Publishes DetectionEvent payloads to NATS WebSocket subject `events.{geohash6}`. Event includes coarsened location, confidence, model version, timestamps. When NATS unavailable, writes to SQLite pending_events buffer.

**Acceptance:**
- Event publish latency ≤ 500ms P95 on 4G
- SQLite buffer capacity 10,000 events
- Flush on reconnect: FIFO order, original detectedAt preserved, 100% fidelity
- Flush rate-limited to 50/s during live detection

---

### FR-W3-04: Alert Reception
**Priority:** P1
**Linked stories:** US-22, US-23, US-24, US-25, US-26
Subscribes to NATS subject `alerts.{geohash4}` for the node's area. Receives W2-confirmed alert payloads, stores in SQLite alert_history, updates alert feed UI in real time, delivers push notification when app is backgrounded.

**Acceptance:**
- Alert appears in feed ≤ 3s from NATS publish
- Push notification delivered ≤ 3s from W2 alert generation
- Alert severity colors applied correctly
- Mute setting persists across app restarts

---

### FR-W3-05: Onboarding
**Priority:** P0
**Linked stories:** US-01, US-02, US-03, US-04, US-05, US-06
Guides first-time user through mic permission consent, optional nickname, node registration, and NATS connection. Supports QR-code field configuration. Entire flow completes in under 5 minutes.

**Acceptance:**
- P95 onboarding time ≤ 5 minutes (timed user test)
- nodeId generated on device and stored in SecureStore
- Consent timestamp logged to node_consent_audit table
- QR config parser accepts JSON payload with all NodeConfig fields

---

### FR-W3-06: GDPR Deletion
**Priority:** P0
**Linked stories:** US-33, US-34, US-35
Single deletion flow removes all node data from server (node_registrations, push_tokens, node_app_versions) and wipes local state (SQLite all tables, SecureStore). Returns app to fresh onboarding state.

**Acceptance:**
- Accessible from Settings > Privacy in ≤ 2 taps
- DELETE confirmation literal required before proceeding
- Server DELETE call includes all affected tables in response
- App navigates to onboarding on completion

---

### FR-W3-07: Meshtastic BLE Offline Routing
**Priority:** P1
**Linked stories:** US-27, US-28, US-29, US-30
Scans for Meshtastic-compatible BLE devices when NATS is unavailable. Encodes detection events as Meshtastic protobuf DM and writes to gateway node BLE characteristic. Falls back to SQLite buffer if no mesh node found.

**Acceptance:**
- BLE discovery within 10s of NATS disconnect
- Detection events encoded as valid Meshtastic DM protobuf
- Connectivity state machine: ONLINE → NATS_OFFLINE → MESH → BUFFERING
- BLE diagnostic shows RSSI, SNR, hop count

---

### FR-W3-08: Calibration
**Priority:** P1
**Linked stories:** US-36, US-37, US-38
Runs 60-second ambient noise baseline recording. Computes mean RMS, standard deviation, dominant frequency. Updates VAD threshold in node_config and publishes calibration result to W2 via NATS.

**Acceptance:**
- Calibration completes in exactly 60s
- VAD threshold updated immediately after calibration
- calibration_log row created with all required fields
- Result published to `calibration.{nodeId}` NATS subject

---

### FR-W3-09: Battery & Thermal Management
**Priority:** P0
**Linked stories:** US-08, US-09, US-10
Monitors battery level (expo-battery) and device temperature. Computes throttle state and adjusts audio pipeline sampling interval accordingly. Suspends pipeline entirely at critical levels.

**Acceptance:**
- FULL state at battery ≥30% and temp ≤38°C: 100ms frames
- REDUCED state at battery 20-29% or temp 38-40°C: 1s interval
- MINIMAL state at battery 10-19% or temp 40-45°C: 10s interval
- SUSPENDED state at battery <10% or temp >45°C: pipeline halted

---

### FR-W3-10: Diagnostics Panel
**Priority:** P1
**Linked stories:** US-39, US-40, US-41, US-42
Full diagnostic dashboard accessible from Settings (UA-04 flow). Displays NATS connection status, pending event buffer depth, CPU/memory stats, thermal zone, battery level, model version, BLE scan state. Sentry crash reporting active.

**Acceptance:**
- All diagnostic metrics visible without backend connectivity
- Sentry DSN configured from build environment variable
- Event payload includes hashed nodeId (no cleartext)
- node_app_versions upserted on every heartbeat

---

## 12. Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| iOS background audio interrupted by system | MEDIUM | HIGH | AVAudioSession category PlayAndRecord + mixWithOthers; test 30-minute lock |
| Android Doze mode kills background task | MEDIUM | HIGH | Foreground service (type: microphone) exempts from Doze |
| TFLite inference latency > 80ms on Tier C | MEDIUM | MEDIUM | Reduce frame rate on Tier C; fall back to 500ms interval |
| NATS WS connection unreliable on 2G | HIGH | MEDIUM | Offline buffer + Meshtastic fallback; 10,000 event capacity |
| App store rejection (mic permission) | LOW | HIGH | Privacy policy + justification text aligned with store guidelines |
| YAMNet false positive rate > 5% | MEDIUM | HIGH | Calibration to adapt VAD to local noise; confidence threshold 0.72 |
| Meshtastic BLE pairing fails on iOS | MEDIUM | MEDIUM | Background BLE limited on iOS; document as Android-first feature |
| Battery soak > 3%/hr | MEDIUM | HIGH | Profile early (Day 7); if over: reduce FFT size, increase VAD rejection |
| W2 NATS broker unavailable for testing | MEDIUM | HIGH | Use local NATS server for integration tests; mock for unit tests |

---

## 13. Release Criteria

All of the following must be true before W3 is declared complete:

### 13.1 Functional Gate

| Check | Tool | Threshold |
|---|---|---|
| Unit + integration tests passing | Jest | 100% pass rate |
| Coverage: branches | Istanbul | ≥80% |
| Coverage: functions | Istanbul | ≥80% |
| Coverage: lines | Istanbul | ≥80% |
| E2E: Android emulator | Detox | 100% pass rate |
| E2E: iOS simulator | Detox | 100% pass rate |
| TypeScript compilation | tsc --noEmit | Zero errors |
| EAS production build: Android | EAS Build | Clean AAB |
| EAS production build: iOS | EAS Build | Clean IPA |

### 13.2 Performance Gate

| Metric | Threshold | Method |
|---|---|---|
| Install → active node | ≤ 5 min P95 | Timed user test (n=5) |
| Battery drain passive | < 3%/hr | Pixel 6a + iPhone 12 1-hour soak |
| Detection latency E2E | ≤ 500ms P95 | Instrumented timestamp audit |
| Push notification delivery | ≤ 3s P95 | Expo push delivery log |
| Offline buffer flush fidelity | 100% | Reconciliation vs W2 received count |
| Background pipeline stability | No crash in 4hr | Lock soak test |

### 13.3 Privacy Gate

| Check | Required |
|---|---|
| No audio files in app sandbox (runtime audit) | PASS |
| GPS truncated to 4dp in all payloads | PASS |
| nodeId in SecureStore WHEN_UNLOCKED_THIS_DEVICE_ONLY | PASS |
| Consent screen shown before any mic access | PASS |
| Full deletion removes all server records | PASS |
| Sentry payload contains no PII | PASS |

### 13.4 Store Submission Gate

| Check | Required |
|---|---|
| Google Play internal test track live | YES |
| Apple TestFlight build live | YES |
| Privacy policy URL live at apexsentinel.uk/privacy | YES |
| Google Data Safety form complete | YES |
| Apple Privacy Nutrition Labels complete | YES |

---

## 14. Localisation

Three locales at launch:

| Locale | Language | Key Screens |
|---|---|---|
| en | English | All screens |
| uk | Ukrainian | All screens |
| ro | Romanian | All screens |

Translation keys are managed in `src/i18n/{locale}.json`. All UI strings must be externalised — no hardcoded English strings in component files.

Critical translations:
- Consent screen body (legally reviewed for UK and UA jurisdictions)
- Deletion confirmation screen
- Privacy audit checklist
- Push notification titles and bodies

---

## 15. Analytics (Privacy-Safe)

No third-party analytics SDK is used. The following events are tracked via NATS heartbeat only (no PII, no third-party service):

| Event | Data | Purpose |
|---|---|---|
| Node registration | platform, appVersion, modelVersion | Fleet composition |
| Heartbeat | batteryLevel, bufferDepth, natsConnected | Node health monitoring |
| Calibration | ambientRms, vadThreshold, geohash6 | Detection quality |
| OTA model update | version, platform, success/fail | Update adoption rate |
| Deletion | platform, appVersion | Churn signal |

All analytics events are aggregated server-side. Individual node contributions are pseudonymous and cannot be linked to a person.

---

## 16. Internals: Event Payload Size Budget

Target: all event payloads ≤ 512 bytes (2G-compatible).

| Field | Size (bytes approx) |
|---|---|
| eventId (UUID) | 36 |
| nodeId (16-char hash) | 16 |
| eventType (max label length) | 30 |
| confidence (float) | 6 |
| modelVersion (semver) | 8 |
| inferenceMs (int) | 6 |
| lat/lng (4dp floats) | 20 |
| geohash7 | 9 |
| detectedAt (ISO8601) | 26 |
| publishedAt (ISO8601) | 26 |
| batteryLevel (int) | 4 |
| thermalZone (int) | 4 |
| platform (android/ios) | 8 |
| appVersion (semver) | 8 |
| JSON overhead (keys + braces) | ~200 |
| **Total estimate** | **~407 bytes** |

Under 512-byte budget with room for future fields. Compress with msgpack if needed for sub-2G scenarios.

---

## 17. Open Questions

| # | Question | Owner | Target Resolution |
|---|---|---|---|
| OQ-01 | Does W2 NATS broker support NKEY auth or only USER/PASS? | W2 team | Before Day 8 |
| OQ-02 | What geohash precision does W2 use for alert subject routing? | W2 team | Before Day 15 |
| OQ-03 | What is the max NATS message size configured on broker? | W2 team | Before Day 10 |
| OQ-04 | Should Meshtastic routing be Android-only at launch (iOS BLE background restrictions)? | Nico | Before Day 22 |
| OQ-05 | Privacy policy URL — hosted where? | Nico | Before Day 32 |
| OQ-06 | App store listing: use "APEX Sentinel" or "Sentinel" as the display name? | Nico | Before Day 32 |
| OQ-07 | YAMNet model class mapping — which exact AudioSet indices are in scope for W3? | AI team | Before Day 3 |
