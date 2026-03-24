# APEX-SENTINEL — Acceptance Criteria
## W3 | PROJECTAPEX Doc 10/21 | 2026-03-24

Wave 3: React Native (Expo) cross-platform mobile app — Android + iOS

---

## 1. Wave-Formation Gate: Documentation

All 21 PROJECTAPEX docs must be present and non-stub in `docs/waves/W3/` before any code
is merged to `main`. A doc is non-stub if it exceeds 200 lines and contains no placeholder
tokens (`TODO`, `TBD`, `PLACEHOLDER`, `<fill>`).

```
Required docs (21):
  [ ] DESIGN.md
  [ ] PRD.md
  [ ] ARCHITECTURE.md
  [ ] DATABASE_SCHEMA.md
  [ ] API_SPECIFICATION.md
  [ ] AI_PIPELINE.md
  [ ] PRIVACY_ARCHITECTURE.md
  [ ] ROADMAP.md
  [ ] TEST_STRATEGY.md
  [ ] ACCEPTANCE_CRITERIA.md        ← this file
  [ ] DECISION_LOG.md
  [ ] SESSION_STATE.md
  [ ] ARTIFACT_REGISTRY.md
  [ ] DEPLOY_CHECKLIST.md
  [ ] LKGC_TEMPLATE.md
  [ ] IMPLEMENTATION_PLAN.md
  [ ] HANDOFF.md
  [ ] FR_REGISTER.md
  [ ] RISK_REGISTER.md
  [ ] INTEGRATION_MAP.md
  [ ] NETWORK_TOPOLOGY.md
```

Verification command:
```bash
docs_dir="docs/waves/W3"
missing=0
for doc in DESIGN PRD ARCHITECTURE DATABASE_SCHEMA API_SPECIFICATION AI_PIPELINE \
  PRIVACY_ARCHITECTURE ROADMAP TEST_STRATEGY ACCEPTANCE_CRITERIA DECISION_LOG \
  SESSION_STATE ARTIFACT_REGISTRY DEPLOY_CHECKLIST LKGC_TEMPLATE \
  IMPLEMENTATION_PLAN HANDOFF FR_REGISTER RISK_REGISTER INTEGRATION_MAP \
  NETWORK_TOPOLOGY; do
  f="$docs_dir/$doc.md"
  if [ ! -f "$f" ]; then echo "MISSING: $f"; missing=$((missing+1)); fi
  lines=$(wc -l < "$f")
  if [ "$lines" -lt 200 ]; then echo "STUB ($lines lines): $f"; missing=$((missing+1)); fi
  if grep -qiE "TODO|TBD|PLACEHOLDER|<fill>" "$f"; then
    echo "PLACEHOLDER TOKEN: $f"; missing=$((missing+1))
  fi
done
echo "Docs gate failures: $missing"
```

Exit criteria: `Docs gate failures: 0`

---

## 2. Wave-Formation Gate: TDD RED

The TDD RED commit must exist in git history before any implementation begins.
RED commit contains all test files with all tests in failing state (implementation files
contain only type stubs, no logic).

```bash
# Verify RED commit exists
git log --oneline --grep="tdd-red" | head -5

# Verify tests fail on RED commit
git stash
git checkout $(git log --oneline --grep="tdd-red" | head -1 | awk '{print $1}')
npx jest --passWithNoTests 2>&1 | tail -5
# Expected: FAIL (tests exist but fail — not zero tests)
git checkout -
git stash pop
```

RED commit message format: `test(W3): tdd-red — FR-W3-01 through FR-W3-18 failing`

Exit criteria: RED commit SHA present in git log, `jest` reports ≥ 50 failing tests on that commit.

---

## 3. Wave-Formation Gate: Tests GREEN

### 3.1 Jest (Unit + Integration)

```bash
npx jest --coverage --ci 2>&1 | tail -20
```

Exit criteria:
- 0 test suites failed
- 0 individual tests failed
- Coverage thresholds all met (see §4)
- No snapshot obsolete warnings

Minimum test counts by FR:
```
FR-W3-01 Background audio    ≥ 12 tests
FR-W3-02 TFLite Android      ≥ 15 tests
FR-W3-03 CoreML iOS          ≥ 12 tests
FR-W3-04 Node registration   ≥ 10 tests
FR-W3-05 NATS.ws             ≥ 15 tests
FR-W3-06 Detection publish   ≥ 12 tests
FR-W3-07 Alert subscription  ≥ 12 tests
FR-W3-08 Home dashboard      ≥ 10 tests
FR-W3-09 Alert detail        ≥ 8 tests
FR-W3-10 Map view            ≥ 8 tests
FR-W3-11 Calibration wizard  ≥ 10 tests
FR-W3-12 Battery optimization≥ 8 tests
FR-W3-13 Meshtastic BLE      ≥ 12 tests
FR-W3-14 Privacy controls    ≥ 8 tests
FR-W3-15 OTA model update    ≥ 10 tests
FR-W3-16 Crash reporting     ≥ 5 tests
FR-W3-17 SQLite local state  ≥ 10 tests
FR-W3-18 Accessibility       ≥ 8 tests
TOTAL                        ≥ 183 tests
```

### 3.2 Detox E2E

```bash
# Android
npx detox test --configuration android.emu.release -l verbose
# iOS
npx detox test --configuration ios.sim.release -l verbose
```

Exit criteria:
- 0 E2E test failures on both platforms
- All critical user journeys covered (see §7)

### 3.3 TypeScript

```bash
npx tsc --noEmit 2>&1 | wc -l
```

Exit criteria: 0 TypeScript errors.

### 3.4 Build

```bash
npx expo export --platform android
npx expo export --platform ios
```

Exit criteria: Both builds succeed with 0 errors. No `console.error` output during build.

---

## 4. Wave-Formation Gate: Coverage ≥ 80%

Coverage measured by `jest --coverage` with `istanbul`.

```
Threshold         Required    Gate
Statements        ≥ 80%       HARD — blocks merge
Branches          ≥ 80%       HARD — blocks merge
Functions         ≥ 80%       HARD — blocks merge
Lines             ≥ 80%       HARD — blocks merge
```

Jest config thresholds (`jest.config.ts`):
```typescript
coverageThreshold: {
  global: {
    statements: 80,
    branches: 80,
    functions: 80,
    lines: 80,
  },
},
```

---

## 5. Wave-Formation Gate: Mind-the-Gap 8/8

The mind-the-gap review runs against W3 deliverables. All 8 dimensions must pass.

```
Dimension 1: Docs complete (21/21 present, non-stub)
Dimension 2: TDD RED committed before implementation
Dimension 3: All tests GREEN (0 failures)
Dimension 4: Coverage ≥ 80% all metrics
Dimension 5: FR completeness (FR-W3-01..18 all implemented and tested)
Dimension 6: Integration validated (NATS.ws, Supabase, Push, Mapbox, Sentry)
Dimension 7: Performance benchmarks met (all device tiers, see §6)
Dimension 8: App store readiness checklist complete (see §8)
```

Verification:
```bash
./wave-formation.sh checkpoint W3
```

---

## 6. Functional Acceptance Criteria

### 6.1 Background Audio — 1 Hour No Crash

Test procedure:
1. Install release build on Pixel 7 (Android 14) and iPhone 14 (iOS 17).
2. Start detection session.
3. Background the app immediately.
4. Leave for 60 minutes with screen off.
5. Foreground the app.

Exit criteria:
- App has not crashed (no entry in Sentry, no ANR dialog, no iOS crash log).
- Audio capture has continued uninterrupted: `detection_count` incremented ≥ 3,500 times
  (1Hz sampling × 3,600s × 95% uptime minimum).
- Battery drain ≤ 3% per hour on both devices (measured from 100% to 97% or better after 60 min).

### 6.2 Detection Events Reach NATS < 500 ms

Measured: time from raw audio frame capture to NATS `sentinel.detections.{nodeId}` publish confirmed.

Test procedure:
1. Play pre-recorded quadcopter .wav file at 85 dB SPL through speaker at 1m distance.
2. Capture 100 detection events with timestamps at both capture and NATS publish confirmation.
3. Calculate P50, P95, P99 latencies.

Exit criteria:
```
P50 latency:  ≤ 200ms
P95 latency:  ≤ 400ms
P99 latency:  ≤ 500ms
0 events dropped (NATS publish must confirm ACK or retry)
```

### 6.3 Push Alerts Received < 2 s

Measured: time from W2 `alert-router` Edge Function dispatch to Expo Push notification
appearing on device lock screen.

Test procedure:
1. Create test alert via `alert-router` HTTP endpoint.
2. Timestamp at dispatch (`alert_dispatched_at`).
3. Timestamp at notification receipt on device (measured via Detox notification observer).
4. Run 20 iterations.

Exit criteria:
```
P50: ≤ 1s
P95: ≤ 2s
P99: ≤ 3s (accepted with warning)
0 notifications silently dropped
```

### 6.4 Node Registration < 5 s

Measured: time from user tapping "Register Node" in calibration wizard Step 1 to
receiving JWT-equivalent node credentials stored in SecureStore.

Test procedure:
1. Factory reset app state (clear SecureStore).
2. Navigate to calibration wizard.
3. Tap "Register Node".
4. Measure elapsed time until home screen loads with node status "ONLINE".

Exit criteria:
- End-to-end ≤ 5s on 4G LTE (simulated 50Mbps down / 20Mbps up, 50ms RTT).
- End-to-end ≤ 10s on 3G (simulated 1Mbps down / 512kbps up, 200ms RTT).
- `register-node` Edge Function returns 201 with valid `node_id` and NATS credentials.
- Node credentials persisted in SecureStore (verified via SecureStore.getItemAsync).

### 6.5 Battery Drain < 3%/hr Passive

Passive = app backgrounded, detection running at 1Hz sampling, no active UI.

Measurement method (Android):
```bash
# Via adb
adb shell dumpsys battery | grep level
# Wait 1 hour
adb shell dumpsys battery | grep level
```

Measurement method (iOS):
- Use Battery Health app or Instruments Energy Profiler.
- Measure mAh consumed over 1 hour divided by total capacity.

Exit criteria per device tier:
```
Device                  Battery    1hr drain    Limit
Pixel 7 (Android 14)    4355 mAh   ≤ 131 mAh    3%
Samsung S22 (A13)       3700 mAh   ≤ 111 mAh    3%
iPhone 14 (iOS 17)      3279 mAh   ≤ 98 mAh     3%
iPhone SE 2 (iOS 16)    1821 mAh   ≤ 55 mAh     3%
```

---

## 7. Performance Benchmarks per Device Tier

### 7.1 Detection Latency (YAMNet inference, end-to-end)

```
Device                  TFLite/CoreML   Gate1   Gate2   Gate3   NATS Pub   Total
Pixel 7 (A14, Snapd888) ≤ 80ms         ≤ 5ms   ≤ 5ms   ≤ 5ms  ≤ 100ms    ≤ 200ms
Samsung S22 (A13, E2200)≤ 100ms        ≤ 5ms   ≤ 5ms   ≤ 5ms  ≤ 100ms    ≤ 220ms
iPhone 14 (A15)         ≤ 70ms         ≤ 5ms   ≤ 5ms   ≤ 5ms  ≤ 100ms    ≤ 185ms
iPhone SE 2 (A13)       ≤ 120ms        ≤ 5ms   ≤ 5ms   ≤ 5ms  ≤ 150ms    ≤ 290ms
```

All P99 values. P95 must be ≤ 80% of P99 limit.

### 7.2 App Launch Time (cold start)

```
Device                  Time to Interactive   Limit
Pixel 7                 ≤ 2.5s               HARD
Samsung S22             ≤ 3.0s               HARD
iPhone 14               ≤ 2.0s               HARD
iPhone SE 2             ≤ 3.5s               SOFT (warning)
```

### 7.3 Memory Usage

```
State                   Android Limit   iOS Limit
Idle (foreground)       ≤ 150 MB        ≤ 120 MB
Active detection        ≤ 200 MB        ≤ 180 MB
Map screen (loaded)     ≤ 250 MB        ≤ 220 MB
```

iOS memory limit is a hard limit — iOS will kill the process above 200MB on iPhone SE 2.

### 7.4 SQLite Query Performance

```
Query                           Limit
Last 100 detection events       ≤ 50ms
Alert history (30 days)         ≤ 100ms
Node metadata lookup            ≤ 20ms
```

---

## 8. App Store Readiness Checklist

### 8.1 Google Play (Android)

```
[ ] Target SDK: 34 (Android 14) — Play requires ≥ 33 for new apps
[ ] Min SDK: 26 (Android 8.0) — covers 98.5% of active Android devices
[ ] Permissions declared in AndroidManifest.xml:
    [ ] RECORD_AUDIO — declared with usage description
    [ ] FOREGROUND_SERVICE — background audio
    [ ] FOREGROUND_SERVICE_MICROPHONE — Android 14+
    [ ] BLUETOOTH_SCAN — Meshtastic BLE
    [ ] BLUETOOTH_CONNECT — Meshtastic BLE
    [ ] ACCESS_FINE_LOCATION — required for BLE scanning (Android 12+)
    [ ] INTERNET — NATS.ws, Supabase
    [ ] RECEIVE_BOOT_COMPLETED — restart detection service
    [ ] POST_NOTIFICATIONS — alert push (Android 13+)
[ ] Data Safety form completed (Google Play Console)
    [ ] Audio data NOT collected (processed on-device only)
    [ ] Location coarsened to ±111m before transmission
    [ ] User can request deletion via privacy controls
[ ] App size (AAB): ≤ 100 MB (TFLite model excluded from AAB, downloaded via CDN)
[ ] Content rating: Everyone (no violence, no inappropriate content)
[ ] Privacy policy URL: https://sentinel.apex-os.io/privacy
[ ] No third-party SDKs that violate Play policies (no ad SDKs)
[ ] Foreground service use case declared: "Microphone - location-independent acoustic monitoring"
[ ] 64-bit support: all .so files compiled for arm64-v8a
[ ] Store listing:
    [ ] Short description ≤ 80 chars
    [ ] Full description ≤ 4000 chars
    [ ] 8 screenshots (phone portrait + landscape, tablet)
    [ ] Feature graphic 1024×500
    [ ] App icon 512×512 PNG
```

### 8.2 Apple App Store (iOS)

```
[ ] Deployment target: iOS 16.0+
[ ] Privacy manifest (PrivacyInfo.xcprivacy) present
    [ ] NSMicrophoneUsageDescription
    [ ] NSBluetoothAlwaysUsageDescription
    [ ] NSLocationWhenInUseUsageDescription (for BLE scan)
    [ ] NSUserTrackingUsageDescription (not used — must explicitly declare NOT tracking)
[ ] Background Modes entitlements in Info.plist:
    [ ] audio — background audio capture
    [ ] fetch — periodic model update check
    [ ] remote-notification — push alerts
[ ] App Tracking Transparency: NOT requested (no tracking)
[ ] No private API usage (verified with `nm -gU` on all .framework binaries)
[ ] App thinning: bitcode disabled (Expo managed, irrelevant post-Xcode 14)
[ ] Over-the-air assets: CDN URLs listed in App Store review notes
[ ] Test account provided to reviewer: sentinel+review@apex-os.io
[ ] Review notes: "App requires iOS Background Audio entitlement to perform acoustic
    detection in background. BLE requires location permission on iOS for peripheral scan."
[ ] App size: ≤ 200 MB (after thinning)
[ ] Store listing:
    [ ] Name ≤ 30 chars
    [ ] Subtitle ≤ 30 chars
    [ ] Keywords ≤ 100 chars
    [ ] Description ≤ 4000 chars
    [ ] 6.5" screenshots (iPhone 14 Pro Max)
    [ ] 5.5" screenshots (iPhone 8 Plus)
    [ ] App icon 1024×1024 PNG (no alpha)
[ ] Export compliance: no encryption beyond TLS 1.3 (standard exemption applies)
```

### 8.3 EAS Build

```
[ ] eas.json present with production profile
[ ] EXPO_PUBLIC_NATS_WS_URL set in EAS Secrets
[ ] EXPO_PUBLIC_SUPABASE_URL set in EAS Secrets
[ ] EXPO_PUBLIC_SUPABASE_ANON_KEY set in EAS Secrets
[ ] EXPO_PUBLIC_MAPBOX_TOKEN set in EAS Secrets
[ ] SENTRY_DSN set in EAS Secrets
[ ] Android keystore uploaded to EAS Credentials
[ ] iOS provisioning profile + distribution cert uploaded to EAS Credentials
[ ] eas build --platform all --profile production runs without error
[ ] EAS Submit configured for both stores
```

---

## 9. Security Acceptance Criteria

```
[ ] No hardcoded secrets (grep -r "sk_live\|api_key\|password" src/ returns 0 results)
[ ] All NATS.ws connections use wss:// (TLS 1.3)
[ ] All Supabase calls use https:// (TLS 1.3)
[ ] Node credentials stored only in Expo SecureStore (AES-256-GCM on Android, Keychain on iOS)
[ ] GDPR wipe removes all local data: SQLite, SecureStore, async storage
[ ] No audio data leaves the device (only detection metadata transmitted)
[ ] Certificate pinning on NATS.ws endpoint (SHA-256 SPKI pins in config)
[ ] App does not request microphone permission without explicit user initiation
```

---

## 10. Accessibility Acceptance Criteria (WCAG 2.1 AA)

```
[ ] All interactive elements have accessibilityLabel
[ ] Minimum touch target: 44×44dp (iOS HIG) / 48×48dp (Material Design)
[ ] Color contrast ≥ 4.5:1 for normal text, ≥ 3:1 for large text
[ ] VoiceOver (iOS) and TalkBack (Android) can navigate all screens
[ ] Alert notifications announce threat level verbally
[ ] No content flashing > 3 times/second (photosensitivity)
[ ] Text scales correctly at 200% font size (no truncation)
[ ] Detection status communicated via both color AND shape/icon
```

Run accessibility audit:
```bash
npx react-native-accessibility-checker --config .accessibilityrc.json
```

Exit criteria: 0 critical, 0 serious issues. Minor issues documented with GitHub issue references.

---

## 11. W3 Exit Declaration

W3 is declared COMPLETE when ALL of the following are true:

1. All 21 docs present, non-stub, committed to `docs/waves/W3/` on `main`.
2. TDD RED commit exists in git history with message matching `tdd-red`.
3. `npx jest --coverage --ci` exits 0 with ≥ 183 tests, ≥ 80% coverage all metrics.
4. `npx detox test` exits 0 on Android emulator (Pixel 7 API 34) and iOS simulator (iPhone 14, iOS 17).
5. `npx tsc --noEmit` exits 0.
6. `npx expo export --platform all` exits 0.
7. Background audio 1hr no-crash test passed on physical device.
8. Detection latency P99 ≤ 500ms validated on physical device.
9. Push alert latency P95 ≤ 2s validated end-to-end.
10. Battery drain ≤ 3%/hr validated on Pixel 7 and iPhone 14.
11. App store checklist 100% complete (both platforms).
12. LKGC snapshot captured and committed.
13. `./wave-formation.sh complete W3` executed successfully.
14. W3 HANDOFF.md signed off by Nico (commit message contains `[W3-HANDOFF-APPROVED]`).
