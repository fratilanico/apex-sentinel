# APEX-SENTINEL W3 — ARTIFACT REGISTRY

> Wave: W3 — React Native Mobile App (Android + iOS)
> Project: APEX-SENTINEL
> Supabase: bymfcnwfyxuivinuzurr (eu-west-2)
> Last Updated: 2026-03-24

---

## Registry Overview

Total artifacts: 42
Delivered by W3 end: all STATUS=PLANNED artifacts transition to DELIVERED
Source of truth: this file + git tags `w3/artifact/{ID}` on delivery

---

## Artifact Categories

| Category | Count |
|----------|-------|
| Mobile App Bundles | 3 |
| Native Modules | 4 |
| SQLite Migrations | 3 |
| Edge Functions | 3 |
| Shared Package Updates | 2 |
| Test Suites | 4 |
| Build Configuration | 4 |
| CI/CD Pipelines | 3 |
| Documentation | 11 |
| Scripts | 5 |

---

## Mobile App Bundles

### ART-W3-001: Android APK — Release Build

| Field | Value |
|-------|-------|
| ID | ART-W3-001 |
| Name | APEX Sentinel Android Release APK |
| Type | Binary / Release Artifact |
| Source Path | `packages/mobile/android/app/build/outputs/apk/release/app-release.apk` |
| EAS Build Path | EAS Build artifact, download from `eas build:list` |
| Status | PLANNED |
| Version | 3.0.0 (W3 initial) |
| Target API | Android 14 (API 34) min, supports API 26+ |
| ABI | arm64-v8a, x86_64 |
| Dependencies | ART-W3-004 (TFLite module), ART-W3-006 (audio capture module) |
| Signing | Android Keystore via EAS Credentials |
| Size Target | < 45MB (includes Mapbox SDK, TFLite runtime, offline tile stub) |
| Delivery Gate | All Detox Android tests green, Jest coverage ≥80% |

### ART-W3-002: iOS IPA — Release Build

| Field | Value |
|-------|-------|
| ID | ART-W3-002 |
| Name | APEX Sentinel iOS Release IPA |
| Type | Binary / Release Artifact |
| Source Path | EAS Build artifact |
| Status | PLANNED |
| Version | 3.0.0 (W3 initial) |
| Target iOS | iOS 16.0 minimum (TFLite CoreML delegate requires iOS 12+; we set 16 for AVAudioEngine APIs) |
| Architecture | arm64 only (no x86_64 in release; simulator build separate) |
| Dependencies | ART-W3-005 (CoreML/TFLite iOS module), ART-W3-007 (audio capture module iOS) |
| Signing | Apple Distribution Certificate + Provisioning Profile via EAS Credentials |
| Size Target | < 50MB (App Store OTA delivery limit) |
| Delivery Gate | All Detox iOS tests green, TestFlight internal review passed |
| TestFlight URL | TBD at build time |

### ART-W3-003: JS OTA Bundle

| Field | Value |
|-------|-------|
| ID | ART-W3-003 |
| Name | EAS Update JS Bundle |
| Type | OTA Update Bundle |
| Source Path | EAS Update deployment (not in git) |
| Status | PLANNED |
| Channel | `production`, `staging`, `development` |
| Contents | All TypeScript/JS source, assets, fonts. Excludes native code. |
| Update Mechanism | expo-updates SDK on device polls EAS Update endpoint |
| Dependencies | ART-W3-001, ART-W3-002 (base binaries must be deployed first) |
| Rollback | `eas update --branch production --message "Rollback to {prev commit}"` |
| Delivery Gate | `npx expo export` succeeds, bundle size regression < 5% |

---

## Native Modules

### ART-W3-004: TFLite Inference Module — Android

| Field | Value |
|-------|-------|
| ID | ART-W3-004 |
| Name | apex-tflite Android Native Module |
| Type | Kotlin Native Module (.aar bundled into APK) |
| Source Path | `packages/mobile/modules/apex-tflite/android/` |
| Status | PLANNED |
| Language | Kotlin 1.9.x |
| Key Files | `src/main/kotlin/io/apexsentinel/tflite/ApexTfliteModule.kt`, `src/main/kotlin/io/apexsentinel/tflite/YAMNetInterpreter.kt` |
| Gradle Dep | `implementation 'org.tensorflow:tensorflow-lite:2.14.0'` |
| Exposed API | `loadModel(path: String): Promise<Void>`, `runInference(samples: FloatArray, length: Int): Promise<YAMNetResult>`, `unloadModel(): Promise<Void>` |
| Model File | `android/app/src/main/assets/yamnet_int8.tflite` (bundled) + `filesDir/models/yamnet_int8_vN.tflite` (OTA) |
| Performance | ≤150ms inference, INT8 quantized, NNAPIDelegate on Pixel 7 |
| Dependencies | ART-W3-010 (YAMNet INT8 model file) |
| Test Coverage | Unit tests via `JUnit4` + `Mockito` in `android/src/test/` |
| Delivery Gate | Benchmark test: inference ≤150ms on Pixel 7 emulator API 34 |

### ART-W3-005: TFLite + CoreML Module — iOS

| Field | Value |
|-------|-------|
| ID | ART-W3-005 |
| Name | apex-tflite iOS Native Module |
| Type | Swift Native Module (.framework bundled into IPA) |
| Source Path | `packages/mobile/modules/apex-tflite/ios/` |
| Status | PLANNED |
| Language | Swift 5.10 |
| Key Files | `ApexTfliteModule.swift`, `YAMNetInterpreter.swift`, `ApexTflite.podspec` |
| CocoaPod | `pod 'TensorFlowLiteSwift', '~> 2.14'` with `CoreML` subspec |
| Exposed API | Same TypeScript API as ART-W3-004 (shared TS type definitions) |
| CoreML Delegate | `CoreMLDelegate(options:)` enabled on iOS 12+ |
| Neural Engine | Leveraged on A12+ (iPhone XS, iPhone SE 3rd gen, all iPhone 14+) |
| Fallback | CPU interpreter when CoreML delegate unavailable |
| Delivery Gate | Benchmark: ≤150ms on iPhone 14 simulator, CPU fallback on iOS 16 sim |

### ART-W3-006: Audio Capture Module — Android

| Field | Value |
|-------|-------|
| ID | ART-W3-006 |
| Name | apex-audio-capture Android Native Module |
| Type | Kotlin Native Module + Android Foreground Service |
| Source Path | `packages/mobile/modules/apex-audio-capture/android/` |
| Status | PLANNED |
| Language | Kotlin 1.9.x |
| Key Files | `ApexAudioCaptureModule.kt`, `AudioCaptureService.kt`, `AudioCaptureNotification.kt` |
| AudioRecord Config | `VOICE_RECOGNITION` source, 16000 Hz, `CHANNEL_IN_MONO`, `ENCODING_PCM_FLOAT` |
| Foreground Service | `FOREGROUND_SERVICE_MICROPHONE` permission (Android 14), persistent notification |
| Exposed Events | `onPcmData(Float32Array, length: Int)` every 0.5s (8000 samples) |
| WakeLock | `PARTIAL_WAKE_LOCK` held during active detection windows |
| Delivery Gate | Background capture continues for 30 minutes with screen off on Pixel 7 emulator |

### ART-W3-007: Audio Capture Module — iOS

| Field | Value |
|-------|-------|
| ID | ART-W3-007 |
| Name | apex-audio-capture iOS Native Module |
| Type | Swift Native Module |
| Source Path | `packages/mobile/modules/apex-audio-capture/ios/` |
| Status | PLANNED |
| Language | Swift 5.10 |
| Key Files | `ApexAudioCaptureModule.swift`, `AudioCaptureManager.swift`, `ApexAudioCapture.podspec` |
| AVAudioEngine | `installTap(onBus:bufferSize:format:block:)` at 16kHz mono |
| Background Mode | `UIBackgroundModes: ["audio"]` in app.json |
| AVAudioSession | `.record` category, `.mixWithOthers` option |
| Sample Rate Conversion | `AVAudioConverter` from device native rate to 16kHz |
| Delivery Gate | Background capture survives 10-minute lock-screen on iPhone 14 simulator |

---

## SQLite Migrations

### ART-W3-008: Migration 001 — pending_events Table

| Field | Value |
|-------|-------|
| ID | ART-W3-008 |
| Name | SQLite Migration 001 |
| Type | SQLite DDL Migration |
| Source Path | `packages/mobile/src/db/migrations/001_pending_events.sql` |
| Status | PLANNED |
| Schema | `pending_events(id TEXT PK, node_id TEXT, event_type TEXT, payload TEXT, status TEXT CHECK(status IN ('pending','published','failed','dead_letter')), created_at INTEGER, published_at INTEGER, retry_count INTEGER DEFAULT 0, last_error TEXT)` |
| Index | `CREATE INDEX idx_pending_events_status ON pending_events(status)` |
| WAL | Enabled via `PRAGMA journal_mode=WAL` in migration runner |
| Dependencies | None (first migration) |

### ART-W3-009: Migration 002 — alert_history Table

| Field | Value |
|-------|-------|
| ID | ART-W3-009 |
| Name | SQLite Migration 002 |
| Type | SQLite DDL Migration |
| Source Path | `packages/mobile/src/db/migrations/002_alert_history.sql` |
| Status | PLANNED |
| Schema | `alert_history(id TEXT PK, alert_type TEXT, threat_level TEXT CHECK(threat_level IN ('LOW','MEDIUM','HIGH','CRITICAL')), confidence REAL, lat REAL, lng REAL, cot_uid TEXT, received_at INTEGER, acknowledged_at INTEGER, raw_payload TEXT)` |
| Index | `CREATE INDEX idx_alert_history_received ON alert_history(received_at DESC)` |
| Retention | Pruned to last 500 records on write (trigger or app-level check) |

### ART-W3-010: Migration 003 — calibration_log Table

| Field | Value |
|-------|-------|
| ID | ART-W3-010 |
| Name | SQLite Migration 003 |
| Type | SQLite DDL Migration |
| Source Path | `packages/mobile/src/db/migrations/003_calibration_log.sql` |
| Status | PLANNED |
| Schema | `calibration_log(id TEXT PK, completed_at INTEGER, mic_test_result TEXT, gps_accuracy_m REAL, nats_latency_ms INTEGER, test_detection_confidence REAL, passed INTEGER CHECK(passed IN (0,1)), notes TEXT)` |

---

## Edge Functions (New in W3)

### ART-W3-011: push-register Edge Function

| Field | Value |
|-------|-------|
| ID | ART-W3-011 |
| Name | push-register Supabase Edge Function |
| Type | Deno Edge Function |
| Source Path | `supabase/functions/push-register/index.ts` |
| Status | PLANNED |
| Endpoint | `POST /functions/v1/push-register` |
| Auth | Supabase JWT (Bearer token) |
| Request Body | `{ nodeId: string, expoPushToken: string, platform: 'ios'|'android', appVersion: string }` |
| Response | `{ success: boolean }` |
| Side Effects | Upserts `nodes.expo_push_token` and `nodes.platform` in Supabase DB |
| Dependencies | W2 `nodes` table (adds 2 new columns via W3 migration) |
| Test | Jest unit test + integration test in W2 Edge Function test suite |

### ART-W3-012: model-version Edge Function

| Field | Value |
|-------|-------|
| ID | ART-W3-012 |
| Name | model-version Supabase Edge Function |
| Type | Deno Edge Function |
| Source Path | `supabase/functions/model-version/index.ts` |
| Status | PLANNED |
| Endpoint | `GET /functions/v1/model-version?platform=android|ios` |
| Auth | Supabase anon key |
| Response | `{ version: string, sha256: string, url: string, minAppVersion: string }` |
| DB Query | `SELECT * FROM model_versions WHERE platform = $1 ORDER BY released_at DESC LIMIT 1` |
| CDN URL | `https://bymfcnwfyxuivinuzurr.supabase.co/storage/v1/object/public/models/yamnet_int8_{version}.tflite` |
| Dependencies | `model_versions` table (W3 Supabase migration) |

### ART-W3-013: get-node-config Edge Function (W2 Extension)

| Field | Value |
|-------|-------|
| ID | ART-W3-013 |
| Name | get-node-config Extended Edge Function |
| Type | Deno Edge Function (extends W2 function) |
| Source Path | `supabase/functions/get-node-config/index.ts` |
| Status | PLANNED (extension of W2 function) |
| New W3 Fields | `meshtasticEnabled`, `otaModelUpdatesEnabled`, `batteryOptimizationThresholdPct`, `detectionCooldownMs`, `natsWssUrl`, `natsCredentials` |
| Response | Extends W2 `NodeConfig` type with W3 fields |

---

## Shared Package Updates

### ART-W3-014: @apex-sentinel/core W3 Compatibility Update

| Field | Value |
|-------|-------|
| ID | ART-W3-014 |
| Name | W1 Core Package Mobile Compatibility |
| Type | npm Package Update |
| Source Path | `packages/core/` |
| Status | PLANNED |
| Changes | Remove Node.js-specific Buffer usage in FFTProcessor (use Float32Array throughout), remove `fs` module imports from YAMNetBridge (replaced by platform-agnostic interface), add React Native metro bundler shims config |
| Version Bump | 1.x.x → 2.0.0 (breaking: Node.js Buffer removed) |
| Tests | Existing 571 tests still green after changes |

### ART-W3-015: @apex-sentinel/nats-client W3 Compatibility Update

| Field | Value |
|-------|-------|
| ID | ART-W3-015 |
| Name | W2 NATS Client Mobile Compatibility |
| Type | npm Package Update |
| Source Path | `packages/nats-client/` |
| Status | PLANNED |
| Changes | Add React Native `useNatsConnection` hook, add mobile reconnect strategy (exponential backoff with jitter, max 32s), add `onNetworkChange` handler for 4G↔WiFi transition |
| Version Bump | 2.x.x → 2.1.0 (minor: new exports) |

---

## Test Suites

### ART-W3-016: Jest Unit Test Suite

| Field | Value |
|-------|-------|
| ID | ART-W3-016 |
| Name | W3 Mobile Jest Unit Test Suite |
| Type | Test Suite |
| Source Path | `packages/mobile/src/__tests__/` |
| Status | PLANNED |
| Framework | Jest 29.x + @testing-library/react-native 13.x |
| Target Coverage | ≥80% branches, functions, lines, statements |
| FR Coverage | FR-W3-01 through FR-W3-18 (all 18 FRs) |
| Test Count Target | 220+ unit + component tests |
| Key Mocks | NATS.ws connection, expo-secure-store, expo-sqlite, TFLite module, audio capture module, Mapbox GL |
| Command | `cd packages/mobile && npx jest --coverage` |

### ART-W3-017: Detox E2E Test Suite

| Field | Value |
|-------|-------|
| ID | ART-W3-017 |
| Name | W3 Detox E2E Test Suite |
| Type | E2E Test Suite |
| Source Path | `packages/mobile/e2e/` |
| Status | PLANNED |
| Framework | Detox 20.x + Jest runner |
| Device Matrix | Android: Pixel 7 API 34, Samsung Galaxy S22 API 33 (emulators) |
| | iOS: iPhone 14 iOS 17, iPhone SE 2 iOS 16 (simulators) |
| Test Files | `e2e/registration.test.ts`, `e2e/calibration.test.ts`, `e2e/alert.test.ts`, `e2e/meshtastic.test.ts`, `e2e/modelUpdate.test.ts` |
| Test Count Target | 45+ E2E scenarios |
| Key Scenarios | Full node registration flow, calibration wizard completion, alert receive + notification, background audio survival, model OTA update |
| Command | `cd packages/mobile && npx detox test -c android.emu.release` |

### ART-W3-018: Native Module Unit Tests (Android JUnit)

| Field | Value |
|-------|-------|
| ID | ART-W3-018 |
| Name | Android Native Module JUnit Tests |
| Type | JUnit4 Test Suite |
| Source Path | `packages/mobile/modules/apex-tflite/android/src/test/`, `packages/mobile/modules/apex-audio-capture/android/src/test/` |
| Status | PLANNED |
| Framework | JUnit4, Mockito, Robolectric |
| Test Count Target | 30+ Android unit tests |
| Command | `./gradlew test` from `packages/mobile/android/` |

### ART-W3-019: Native Module Unit Tests (iOS XCTest)

| Field | Value |
|-------|-------|
| ID | ART-W3-019 |
| Name | iOS Native Module XCTest Suite |
| Type | XCTest Test Suite |
| Source Path | `packages/mobile/modules/apex-tflite/ios/Tests/`, `packages/mobile/modules/apex-audio-capture/ios/Tests/` |
| Status | PLANNED |
| Framework | XCTest |
| Test Count Target | 25+ iOS unit tests |
| Command | `xcodebuild test -workspace apex-sentinel.xcworkspace -scheme ApexSentinelTests` |

---

## Build Configuration

### ART-W3-020: eas.json

| Field | Value |
|-------|-------|
| ID | ART-W3-020 |
| Name | EAS Build Configuration |
| Type | EAS Config File |
| Source Path | `packages/mobile/eas.json` |
| Status | PLANNED |
| Profiles | `development` (internal distribution, debug JS), `preview` (internal distribution, release native), `production` (App Store / Play Store) |
| Key Settings | Android: `buildType: apk` (preview), `buildType: app-bundle` (production); iOS: `simulator: true` (development), `distribution: internal` (preview), `distribution: store` (production) |
| EAS Update | Channel mapping: `development→development`, `preview→staging`, `production→production` |

### ART-W3-021: app.json (Expo Config)

| Field | Value |
|-------|-------|
| ID | ART-W3-021 |
| Name | Expo App Configuration |
| Type | Expo Config File |
| Source Path | `packages/mobile/app.json` |
| Status | PLANNED |
| Key Permissions | Android: `RECORD_AUDIO`, `ACCESS_FINE_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT` |
| | iOS: `NSMicrophoneUsageDescription`, `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSBluetoothAlwaysUsageDescription` |
| Background Modes | iOS: `audio`, `fetch`, `remote-notification` |
| Plugins | `@rnmapbox/maps`, `expo-notifications`, `expo-secure-store`, `@sentry/react-native`, `@config-plugins/detox`, custom TFLite plugin, custom audio plugin |

### ART-W3-022: metro.config.js

| Field | Value |
|-------|-------|
| ID | ART-W3-022 |
| Name | Metro Bundler Configuration |
| Type | Build Config |
| Source Path | `packages/mobile/metro.config.js` |
| Status | PLANNED |
| Key Config | `watchFolders: ['../../packages/core', '../../packages/nats-client']` for monorepo resolution, `resolver.extraNodeModules` shims for Node.js built-ins (crypto, buffer, stream), Sentry source map serializer |

### ART-W3-023: tsconfig.json (Mobile)

| Field | Value |
|-------|-------|
| ID | ART-W3-023 |
| Name | TypeScript Config — Mobile |
| Type | TypeScript Config |
| Source Path | `packages/mobile/tsconfig.json` |
| Status | PLANNED |
| Extends | `expo/tsconfig.base` |
| Strict | `strict: true`, `noUncheckedIndexedAccess: true` |
| Paths | `@apex-sentinel/core: ../../packages/core/src`, `@apex-sentinel/nats-client: ../../packages/nats-client/src` |

---

## CI/CD Pipelines

### ART-W3-024: GitHub Actions — PR Validation

| Field | Value |
|-------|-------|
| ID | ART-W3-024 |
| Name | PR Validation Workflow |
| Type | GitHub Actions Workflow |
| Source Path | `.github/workflows/w3-pr-validation.yml` |
| Status | PLANNED |
| Triggers | `pull_request` to main, `push` to `feature/w3-*` |
| Jobs | `typecheck` (tsc --noEmit), `lint` (eslint), `unit-test` (Jest + coverage gate), `android-build-check` (EAS build preview profile) |
| Runner | `ubuntu-latest` for JS jobs, `macos-latest-xlarge` for iOS build |
| Time Target | < 12 minutes total |

### ART-W3-025: GitHub Actions — E2E (Detox)

| Field | Value |
|-------|-------|
| ID | ART-W3-025 |
| Name | Detox E2E CI Workflow |
| Type | GitHub Actions Workflow |
| Source Path | `.github/workflows/w3-e2e.yml` |
| Status | PLANNED |
| Triggers | Manual dispatch, merge to main |
| Jobs | `detox-android` (ubuntu + AVD), `detox-ios` (macos-latest with iPhone 14 sim) |
| AVD | `Pixel_7_API_34` system image `x86_64` |
| Time Target | < 25 minutes |

### ART-W3-026: GitHub Actions — EAS Production Build

| Field | Value |
|-------|-------|
| ID | ART-W3-026 |
| Name | EAS Production Build Workflow |
| Type | GitHub Actions Workflow |
| Source Path | `.github/workflows/w3-eas-build.yml` |
| Status | PLANNED |
| Triggers | Git tag `v3.*.*` |
| Jobs | `eas-build-android`, `eas-build-ios` (both using EAS Build cloud, not local runner) |
| Outputs | EAS Build URLs, artifact download links in workflow summary |

---

## Documentation (W3 Plan Phase)

### ART-W3-027 through ART-W3-037: PROJECTAPEX 11-Doc Suite

| ID | File | Status |
|----|------|--------|
| ART-W3-027 | DECISION_LOG.md | COMPLETE |
| ART-W3-028 | SESSION_STATE.md | COMPLETE |
| ART-W3-029 | ARTIFACT_REGISTRY.md | COMPLETE (this file) |
| ART-W3-030 | DEPLOY_CHECKLIST.md | IN PROGRESS |
| ART-W3-031 | LKGC_TEMPLATE.md | PLANNED |
| ART-W3-032 | IMPLEMENTATION_PLAN.md | PLANNED |
| ART-W3-033 | HANDOFF.md | PLANNED |
| ART-W3-034 | FR_REGISTER.md | PLANNED |
| ART-W3-035 | RISK_REGISTER.md | PLANNED |
| ART-W3-036 | INTEGRATION_MAP.md | PLANNED |
| ART-W3-037 | NETWORK_TOPOLOGY.md | PLANNED |

---

## Scripts

### ART-W3-038: db-migrate.ts

| Field | Value |
|-------|-------|
| ID | ART-W3-038 |
| Name | SQLite Migration Runner |
| Type | TypeScript Script |
| Source Path | `packages/mobile/src/db/migrate.ts` |
| Description | Runs pending SQLite migrations on app startup. Checks `_migrations` table. Applies migrations 001-003 in order. Idempotent. |

### ART-W3-039: model-download.ts

| Field | Value |
|-------|-------|
| ID | ART-W3-039 |
| Name | OTA Model Download Service |
| Type | TypeScript Service |
| Source Path | `packages/mobile/src/services/modelUpdateService.ts` |
| Description | Checks `model-version` Edge Function on startup and every 24h. Downloads new model if version > local. Verifies SHA-256. Hot-swaps TFLite interpreter. |

### ART-W3-040: setup-eas-secrets.sh

| Field | Value |
|-------|-------|
| ID | ART-W3-040 |
| Name | EAS Secrets Setup Script |
| Type | Shell Script |
| Source Path | `scripts/w3/setup-eas-secrets.sh` |
| Description | Interactive script to set all required EAS secrets: MAPBOX_ACCESS_TOKEN, SENTRY_DSN, SENTRY_AUTH_TOKEN, NATS_WSS_URL, SUPABASE_URL, SUPABASE_ANON_KEY. Validates secrets are non-empty before uploading. |

### ART-W3-041: coremltools-convert.py

| Field | Value |
|-------|-------|
| ID | ART-W3-041 |
| Name | CoreML Conversion Script |
| Type | Python Script |
| Source Path | `scripts/w3/coremltools-convert.py` |
| Description | Converts yamnet_int8.tflite to yamnet.mlmodel using coremltools 7.x. Runs accuracy benchmark comparison (target: < 2% delta). Documents conversion parameters. Not in critical path (ADR-W3-017). |

### ART-W3-042: lkgc-capture.sh

| Field | Value |
|-------|-------|
| ID | ART-W3-042 |
| Name | LKGC Capture Script |
| Type | Shell Script |
| Source Path | `scripts/w3/lkgc-capture.sh` |
| Description | Captures current LKGC state: git SHA, EAS build ID, app version, model SHA-256, Jest pass rate, Detox pass rate. Writes to LKGC_TEMPLATE.md. |

---

## Supabase Schema Artifacts

### ART-W3-043: model_versions Table Migration

| Field | Value |
|-------|-------|
| ID | ART-W3-043 |
| Name | model_versions Supabase Migration |
| Type | Supabase SQL Migration |
| Source Path | `supabase/migrations/20260324_w3_model_versions.sql` |
| Schema | `model_versions(id UUID PK DEFAULT gen_random_uuid(), platform TEXT CHECK(platform IN ('android','ios')), version TEXT NOT NULL, sha256 TEXT NOT NULL, url TEXT NOT NULL, min_app_version TEXT, released_at TIMESTAMPTZ DEFAULT NOW(), is_active BOOLEAN DEFAULT TRUE)` |

### ART-W3-044: nodes Table Extension Migration

| Field | Value |
|-------|-------|
| ID | ART-W3-044 |
| Name | nodes Table W3 Extension Migration |
| Type | Supabase SQL Migration |
| Source Path | `supabase/migrations/20260324_w3_nodes_extension.sql` |
| Changes | `ALTER TABLE nodes ADD COLUMN expo_push_token TEXT, ADD COLUMN platform TEXT CHECK(platform IN ('android','ios')), ADD COLUMN app_version TEXT, ADD COLUMN last_push_registered_at TIMESTAMPTZ` |
