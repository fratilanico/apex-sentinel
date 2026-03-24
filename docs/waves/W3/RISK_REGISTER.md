# APEX-SENTINEL — Risk Register
## W3 | PROJECTAPEX Doc 19/21 | 2026-03-24

Wave 3: React Native (Expo) mobile app — Android + iOS

---

## Risk Scoring

```
Probability: 1 (rare) → 5 (near-certain)
Impact:      1 (negligible) → 5 (project-blocking)
Score:       P × I
```

Threshold for active mitigation: Score ≥ 9

---

## RISK-W3-01: iOS Background Audio Limit

**Category:** Platform Constraint
**Probability:** 4 (likely — documented iOS behavior)
**Impact:** 5 (project-blocking — breaks core FR-W3-01)
**Score:** 20 — CRITICAL

### Description

iOS enforces background audio session limits. Without continuous audio output or input,
the iOS system suspends background apps within ~30 seconds. Additionally:
- Low Power Mode can override `UIBackgroundModes: audio` and terminate audio sessions.
- AVAudioSession interruptions (phone calls, Siri) may not restart automatically.
- iOS 17 introduced stricter background resource limits for non-system apps.

### Mitigation

Primary: Play a silent audio tone (0dBFS, 22Hz, inaudible) continuously during background
detection. This keeps the AVAudioSession active and prevents suspension.

Secondary: Register `BGProcessingTask` with `BGTaskScheduler` to periodically re-validate
audio session is active. If session interrupted, restart within 10s.

Tertiary: Log audio session interruptions to Sentry with `AVAudioSessionInterruptionNotification`
observer. Alert Nico if interruption rate > 5% of sessions.

Residual risk: Low Power Mode can still terminate the session. Cannot be mitigated within
app sandbox. Documented in HANDOFF.md limitations. Notification shown to user on resume.

### Test Coverage

T-W3-01-01-002 validates 60-minute background duration on physical device.
Detox background audio E2E test in `__tests__/e2e/background-audio.test.ts`.

---

## RISK-W3-02: TFLite INT8 Quantization Accuracy Loss

**Category:** ML Quality
**Probability:** 3 (possible — quantization always introduces some loss)
**Impact:** 4 (major — false negatives miss real threats)
**Score:** 12 — HIGH

### Description

INT8 quantization of the YAMNet float32 model can introduce per-layer rounding errors.
For acoustic event detection, this manifests as:
- Reduced recall on borderline confidence events (near threshold)
- Slightly different top-class selection vs float32 model on certain audio patterns
- Model size constraint (≤ 480KB) limits ability to use full YAMNet architecture

Measured in W1: INT8 model achieved 94.2% accuracy vs 96.8% for float32 on APEX drone test set.
Acceptable per FR-W3-02 requirements.

### Mitigation

Gate 1 threshold set at 0.20 (conservative) to compensate for reduced recall.
Gate 2 and Gate 3 add spatial/temporal filtering that partially compensates for single-frame
accuracy loss.

Model validation test: load INT8 model, run 100 labeled audio samples, verify accuracy ≥ 92%.
Run in CI (`scripts/validate-model-accuracy.ts`).

If accuracy drops below 92% post-quantization, escalate to re-train with QAT
(Quantization-Aware Training) in W3 P5 — allows 2-3% accuracy recovery.

Residual risk: 2% accuracy loss vs float32 is permanent in INT8 without QAT.

---

## RISK-W3-03: NATS.ws Reconnect Storm

**Category:** Infrastructure Reliability
**Probability:** 3 (possible — seen in W2 testing)
**Impact:** 4 (major — floods NATS cluster, blocks legitimate traffic)
**Score:** 12 — HIGH

### Description

If all mobile nodes lose NATS connectivity simultaneously (e.g., NATS cluster rolling restart,
TLS cert rotation), and reconnect with identical backoff parameters, they will create a
thundering herd at the same moment. With 1,000+ nodes, this can overwhelm the NATS
WebSocket proxy (nginx) and cause cascading failures.

### Mitigation

Exponential backoff with jitter: each reconnect attempt waits `baseWait * (2^attempts) + random(0, baseWait)`.
Implementation in `NATSReconnect.ts`:

```typescript
function reconnectDelay(attempt: number, baseMs = 2000, maxMs = 60000): number {
  const exp = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const jitter = Math.random() * baseMs;
  return exp + jitter;
}
```

CircuitBreaker (FR-W3-05): OPEN after 5 failures prevents rapid re-attempts even
with jitter. 30s OPEN timeout spreads reconnect attempts across a 60s window cluster-wide.

NATS proxy rate limiting: nginx upstream `limit_req_zone` at 10 new WS connections/s per IP.

Residual risk: Jitter reduces but does not eliminate the storm. With 1,000+ nodes reconnecting
within 5 minutes, some queuing at the proxy is expected. NATS cluster handles this gracefully
via JetStream write buffering.

---

## RISK-W3-04: App Store Rejection

**Category:** Distribution
**Probability:** 3 (possible — background audio + permissions are common rejection reasons)
**Impact:** 5 (project-blocking — W3 cannot GA without store approval)
**Score:** 15 — CRITICAL

### Description

Google Play and Apple App Store both have strict policies on:
1. Background audio: must have legitimate use case. Acoustic monitoring qualifies but
   requires clear explanation in store listing.
2. Location permission on Android: required for BLE scan (Android 12+), even though
   we don't use it for GPS tracking. Reviewers may flag this.
3. Microphone permission: Apple reviews apps that access microphone. Must clearly state
   audio is NOT transmitted.
4. Apple background modes: `audio` + `fetch` + `remote-notification` triple combination
   may trigger manual review.

### Mitigation

Pre-submission actions:
- Draft detailed review notes (see ACCEPTANCE_CRITERIA.md §8.2) explaining background audio
  use case as "acoustic drone detection monitoring system".
- Provide test account: sentinel+review@apex-os.io with demo node pre-registered.
- Include demo video in review notes: shows detection working, no data exfiltration.
- Privacy manifest (PrivacyInfo.xcprivacy) explicitly declares all API usage.
- NSMicrophoneUsageDescription: "APEX Sentinel uses the microphone to detect acoustic
  signatures of unmanned aerial vehicles. Audio is processed on-device only and never
  transmitted."

For Play Store: complete Data Safety form precisely. Audio not collected = true.

If rejected: Apple provides rejection reason in App Store Connect. Typical resolution: 3-7 days.
Worst case: TestFlight-only distribution for enterprise use while appeal is pending.

---

## RISK-W3-05: Android Doze Mode Interrupting Detection

**Category:** Platform Constraint
**Probability:** 4 (likely — affects all Android devices without battery optimization exemption)
**Impact:** 4 (major — silent detection interruption, user unaware)
**Score:** 16 — CRITICAL

### Description

Android Doze Mode (API 23+, all Android devices) restricts background activity:
- Shallow Doze (screen off, not moving): defers non-critical background work but allows
  Foreground Services to continue.
- Deep Doze (stationary > ~1hr, screen off): restricts network access, defers jobs.
  Even Foreground Services lose network access in deep Doze.

Impact: NATS.ws connection breaks in deep Doze. Detection events queue in SQLite but cannot
be published until device wakes.

### Mitigation

1. Request `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` in calibration wizard (Android 12+: use
   `Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`). This exempts the app from Doze
   for network access.

2. Foreground Service with `FOREGROUND_SERVICE_TYPE_MICROPHONE` declaration (required Android 14+).
   Foreground Services are not killed in shallow Doze.

3. Persistent notification: clearly communicates detection status. Users who see "DETECTION
   PAUSED — Doze active" understand why events stopped.

4. NATS event buffer in SQLite: up to 100 events stored offline, flushed on resume.

Residual: Deep Doze on non-exempt device will cause 15-minute gaps in detection. Documented.
No mitigation within Android sandbox for deep Doze network restriction without exemption.

---

## RISK-W3-06: Mapbox Cache Size Exceeding Device Storage

**Category:** UX / Storage
**Probability:** 3 (possible — older devices with 64GB+ of content)
**Impact:** 2 (minor — degraded UX, not a functional failure)
**Score:** 6 — LOW

### Description

Offline tile download for a 50km² region at zoom 10–15 requires ~120MB. Users on older
devices (iPhone SE 2, 64GB model) with limited free space may encounter storage errors.

### Mitigation

1. Default offline download limited to zoom 10–13 (~40MB per region).
2. Pre-download space check: `expo-file-system` `getFreeDiskStorageAsync()`. Warn if < 150MB free.
3. Clear cached tiles option in Settings.
4. Tiles not mandatory: app functions without offline tiles (online maps used by default).

Residual: Minimal. This is a soft degradation.

---

## RISK-W3-07: Meshtastic BLE Pairing UX Complexity

**Category:** UX
**Probability:** 4 (likely — multi-app pairing flow is complex for non-technical users)
**Impact:** 3 (moderate — reduces adoption of offline mode, not core functionality)
**Score:** 12 — HIGH

### Description

Meshtastic offline mode requires:
1. A physical Meshtastic LoRa device (~€30–80)
2. The Meshtastic app installed separately
3. BLE pairing via Meshtastic app
4. Return to APEX Sentinel

This is a 3-step, 2-app, hardware-dependent flow. Most end users will not complete it.

### Mitigation

1. Make Meshtastic BLE entirely optional — never shown until user explicitly enables
   "Offline Mesh Mode" in Settings > Advanced.
2. In-app tutorial: 5-step illustrated guide covering hardware purchase, Meshtastic app setup,
   pairing, and reconnect to APEX Sentinel.
3. Provide Meshtastic device link in settings (Amazon/AliExpress affiliate links for
   recommended hardware: Heltec LoRa 32 V3, RAK WisBlock).
4. Design: if user never enables mesh mode, they never see BLE permission requests.

Residual: UX complexity is inherent to physical hardware dependency. Cannot fully mitigate.

---

## RISK-W3-08: CoreML Accuracy Delta on Borderline Events

**Category:** ML Quality
**Probability:** 3 (measured — 2.1% delta confirmed in W1)
**Impact:** 3 (moderate — iOS nodes miss ~2% of true positive events)
**Score:** 9 — MEDIUM

### Description

The CoreML YAMNet model consistently scores ~2.1% lower confidence than TFLite INT8 on
the same audio input. On borderline detection events (Gate 3 confidence between 0.28–0.30),
iOS nodes may miss events that Android nodes would catch.

### Mitigation

1. Lower Gate 3 threshold on iOS: 0.28 instead of 0.30 (implemented in FR-W3-03-04).
2. This restores recall to approximately parity with Android at the cost of ~1% higher
   false positive rate on iOS.
3. W2 TDoA correlation requires ≥ 2 nodes to confirm a track. In mixed iOS/Android node
   deployments, Android nodes compensate for iOS misses.

Residual: Single iOS-only deployments have 2.1% lower recall. Documented in HANDOFF.md.

---

## RISK-W3-09: Battery Drain Exceeds 3%/hr Target

**Category:** Performance
**Probability:** 3 (possible — TFLite inference is CPU-intensive)
**Impact:** 4 (major — fails FR-W3-01-01 acceptance criteria)
**Score:** 12 — HIGH

### Description

Running YAMNet inference at 4Hz (4 × 150ms = 600ms CPU/s active, ~17% CPU duty cycle)
combined with NATS.ws active WebSocket connection and background audio capture may push
battery drain above 3%/hr on some devices.

iPhone SE 2 (1821mAh, A13) is the highest-risk device. 3%/hr = 55mAh/hr.
At 4Hz, estimated consumption: audio capture (~15mAh/hr) + inference (~25mAh/hr) +
NATS WS (~5mAh/hr) = ~45mAh/hr. Margin: 10mAh. Tight.

### Mitigation

1. Adaptive sampling rate (FR-W3-12): 4Hz only above 40% battery. At < 20%, drop to 1Hz.
   Expected average: 2–3Hz across typical usage, reducing average CPU to ~10%.
2. XNNPACK acceleration on Android reduces inference power draw ~30%.
3. CoreML ANE on iPhone: ANE is 10× more power-efficient than CPU for ML inference.
   iPhone 14 ANE consumption estimated at ~5mAh/hr for YAMNet inference.
4. Measure per-device on physical hardware in P5. Tune per-device max frequency caps in
   `src/ml/MLBridge.ts` if needed.

Residual: iPhone SE 2 battery drain may exceed 3%/hr at 4Hz. Set max sampling rate to 2Hz
on A13 devices if measured drain > 3%/hr. Controlled by `device_max_hz` in node_state.

---

## RISK-W3-10: SecureStore Key Corruption

**Category:** Data Integrity
**Probability:** 2 (unlikely — but Keychain/Keystore bugs exist)
**Impact:** 4 (major — node loses credentials, must re-register)
**Score:** 8 — MEDIUM

### Description

expo-secure-store uses Android Keystore and iOS Keychain. In rare cases:
- Android: Keystore corruption after OS upgrade (reported in Android 12 on some OEMs).
- iOS: Keychain entries lost after iCloud restore to a new device.
- Both: App reinstall preserves SecureStore on iOS (Keychain not cleared by default) but
  clears on Android (Keystore tied to app signing key + device).

If NATS NKey seed is lost, the node must re-register to get new credentials.

### Mitigation

1. On app start: verify all required SecureStore keys present. If any missing, flag for
   re-registration (non-destructive — calibration wizard shown).
2. Supabase `register-node` Edge Function is idempotent for the same device fingerprint
   within 7 days: returns existing node_id if device previously registered.
3. Display a user-facing message: "Node credentials need to be re-established. Your
   detection history is preserved." to avoid user panic.

Residual: If Keystore corruption occurs mid-session, NATS publish will fail (invalid NKey).
NATS.ws will close connection with auth error. CircuitBreaker opens. User sees "OFFLINE"
status. Re-registration fixes it within 5s.

---

## RISK-W3-11: Push Notification Delivery in Low Connectivity

**Category:** Reliability
**Probability:** 3 (possible — degraded connectivity is common in field deployments)
**Impact:** 3 (moderate — alerts delayed, not lost)
**Score:** 9 — MEDIUM

### Description

Expo Push Notification Service (APNS/FCM) requires device internet connectivity to deliver
notifications. In areas with intermittent connectivity:
- Notifications may be delayed up to 28 days (APNS TTL) or dropped after 4 weeks (FCM).
- APNS prioritizes "high" priority notifications but may still throttle them in Doze/Airplane mode.

### Mitigation

1. NATS.ws in-app subscription is the primary alert mechanism. Push notifications are
   secondary (for background/locked device). Users actively monitoring the app receive
   alerts via NATS regardless of push delivery.
2. Alert sound + badge set to maximum priority (critical alert sound on iOS requires
   Critical Notifications entitlement — apply in W3 P5 if approved by Apple).
3. SQLite alert buffer: all alerts stored locally when NATS delivers them to app.
   Even if push was delayed, on-open the alert history shows all missed alerts.

Residual: Push delivery to offline/locked devices remains best-effort. For critical
operational use, users must keep app foregrounded or ensure NATS.ws background session
is active.

---

## RISK-W3-12: OTA Model CDN Availability

**Category:** Infrastructure
**Probability:** 2 (unlikely — CDN with fallback configured)
**Impact:** 3 (moderate — model update fails, app continues on old model)
**Score:** 6 — LOW

### Description

OTA model updates are downloaded from CDN. If CDN is unavailable during model update:
- Model download fails, app continues on current model version.
- If model was partially downloaded, SHA-256 mismatch prevents loading.

### Mitigation

1. Primary CDN: `https://models.apex-sentinel.io/` (BunnyCDN, 99.95% SLA).
2. Fallback CDN: `https://sentinel-models.b-cdn.net/` (same BunnyCDN, different pull zone).
3. Retry logic: 3 attempts with 5s backoff before giving up.
4. Partial downloads: write to temp file, only replace model on SHA-256 verification success.
5. Model update is not blocking: app continues running on current model during update.

Residual: Low. CDN failure cascading to both endpoints simultaneously is extremely unlikely.

---

## RISK-W3-13: Detox E2E Test Flakiness

**Category:** Test Quality
**Probability:** 4 (likely — React Native E2E tests are notoriously flaky)
**Impact:** 3 (moderate — CI blocks on flaky failures, reduces confidence)
**Score:** 12 — HIGH

### Description

Detox tests are vulnerable to:
- Emulator/simulator timing issues (animations, async state updates)
- Network timeouts in E2E flows (NATS.ws connection in test environment)
- React Native's asynchronous rendering (elements not yet visible when Detox queries)
- iOS simulator state bleed between test runs

Historical baseline: React Native Detox tests typically have 5–15% flakiness rate without
careful architecture.

### Mitigation

1. All Detox tests use `waitFor(...).withTimeout(10000)` — never bare element queries.
2. Network calls mocked in all E2E tests (NATS.ws mock server, Supabase mock).
   Only Detox tests tagged `@integration` hit real network.
3. `beforeAll: device.launchApp({ newInstance: true })` — fresh state per test suite.
4. `afterAll: device.terminateApp()` — clean shutdown.
5. Retry logic: Detox Jest config `retries: 2` for non-integration tests.
6. CI: run Detox in parallel (2 Android emulators, 2 iOS simulators) to catch environment-specific flakes.

Residual: Some residual flakiness expected (target < 2%). Flaky test log reviewed weekly.
Flaky test tagged `@flaky` and retried up to 3 times in CI.

---

## RISK-W3-14: Microphone Permission Denial by User

**Category:** UX
**Probability:** 3 (possible — privacy-conscious users deny mic access)
**Impact:** 5 (project-blocking for that user — detection cannot function without mic)
**Score:** 15 — CRITICAL

### Description

If the user denies microphone permission:
- Android: `Audio.requestPermissionsAsync()` returns `denied`. On Android 11+, second
  denial sets "Don't ask again" — future requests are permanently denied without manual
  settings change.
- iOS: First denial cannot be overridden without opening Settings. iOS never shows the
  permission dialog again after first denial.

The entire detection pipeline (FR-W3-01 through FR-W3-06) is non-functional without microphone.

### Mitigation

1. Never request microphone permission on app launch. Request only from calibration wizard
   Step 2 (FR-W3-01-07) after explaining the use case.
2. Pre-permission rationale screen: shown before system dialog, explains exactly why
   the microphone is needed and that audio never leaves the device.
3. If denied: show "Setup Required" screen with:
   - Clear explanation: "Microphone access is required for drone detection."
   - "Open Settings" button (deep links to app settings on both platforms).
   - "Not now" option: exits calibration, app remains in setup-incomplete state.
4. On next launch if permission still denied: same "Setup Required" screen. No spam.

Residual: Users who permanently deny cannot use the app. No technical mitigation possible.
App Store reviews may reflect this — addressed in store listing FAQ ("App requires
microphone for core functionality").

---

## Risk Summary

```
ID          Title                              P    I   Score  Level
RISK-W3-01  iOS Background Audio Limit         4    5    20    CRITICAL
RISK-W3-04  App Store Rejection                3    5    15    CRITICAL
RISK-W3-05  Android Doze Mode                  4    4    16    CRITICAL
RISK-W3-14  Microphone Permission Denial       3    5    15    CRITICAL
RISK-W3-02  TFLite Quantization Loss           3    4    12    HIGH
RISK-W3-03  NATS Reconnect Storm               3    4    12    HIGH
RISK-W3-07  Meshtastic UX Complexity           4    3    12    HIGH
RISK-W3-09  Battery Drain > 3%/hr             3    4    12    HIGH
RISK-W3-13  Detox E2E Flakiness                4    3    12    HIGH
RISK-W3-08  CoreML Accuracy Delta              3    3     9    MEDIUM
RISK-W3-11  Push Delivery Low Connectivity     3    3     9    MEDIUM
RISK-W3-10  SecureStore Key Corruption         2    4     8    MEDIUM
RISK-W3-06  Mapbox Cache Size                  3    2     6    LOW
RISK-W3-12  OTA CDN Availability               2    3     6    LOW
```

All CRITICAL and HIGH risks have active mitigations defined above.
Risk review checkpoint: end of P3 (day 21) and P5 (day 35).
