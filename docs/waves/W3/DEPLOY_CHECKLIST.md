# APEX-SENTINEL W3 — DEPLOY CHECKLIST

> Wave: W3 — React Native Mobile App (Android + iOS)
> Project: APEX-SENTINEL
> Supabase: bymfcnwfyxuivinuzurr (eu-west-2)
> Last Updated: 2026-03-24

---

## Overview

This runbook covers the complete W3 deployment sequence: from zero to internal beta on Google Play Internal Track and TestFlight. Each step is atomic. Do not skip steps. Mark each step DONE with date and operator.

Pre-conditions for starting this checklist:
- W3 EXECUTE phase complete (all FRs implemented)
- Jest unit tests: ≥80% coverage, all passing
- Detox E2E: all tests passing on Pixel 7 API 34 + iPhone 14 iOS 17 simulators
- `npx tsc --noEmit` passes with zero errors
- All 5 W3 blockers from SESSION_STATE.md resolved

---

## Phase 1: Pre-Deploy Validation

### Step 1.1: TypeScript Validation
```bash
cd /Users/nico/projects/apex-sentinel/packages/mobile
npx tsc --noEmit --project tsconfig.json
# Expected: no errors, no warnings
```
- [ ] DONE: _____ Operator: _____

### Step 1.2: ESLint Clean
```bash
cd /Users/nico/projects/apex-sentinel/packages/mobile
npx eslint src/ --max-warnings 0
# Expected: 0 errors, 0 warnings
```
- [ ] DONE: _____ Operator: _____

### Step 1.3: Jest Unit Tests with Coverage
```bash
cd /Users/nico/projects/apex-sentinel/packages/mobile
npx jest --coverage --coverageReporters=text-summary
# Expected: ≥80% branches, functions, lines, statements
# Expected: 0 failed tests
```
- [ ] DONE: _____ Operator: _____
- [ ] Coverage branches: ___% (must be ≥80%)
- [ ] Coverage functions: ___% (must be ≥80%)
- [ ] Coverage lines: ___% (must be ≥80%)

### Step 1.4: Detox E2E — Android
```bash
cd /Users/nico/projects/apex-sentinel/packages/mobile
npx detox build -c android.emu.release
npx detox test -c android.emu.release
# Expected: 0 failed tests
```
- [ ] DONE: _____ Operator: _____
- [ ] Test count: ___
- [ ] Failed: 0

### Step 1.5: Detox E2E — iOS
```bash
cd /Users/nico/projects/apex-sentinel/packages/mobile
npx detox build -c ios.sim.release
npx detox test -c ios.sim.release
# Expected: 0 failed tests
```
- [ ] DONE: _____ Operator: _____
- [ ] Test count: ___
- [ ] Failed: 0

### Step 1.6: Shared Package Tests
```bash
cd /Users/nico/projects/apex-sentinel/packages/core
npx vitest run --coverage
# Expected: all 571+ tests pass

cd /Users/nico/projects/apex-sentinel/packages/nats-client
npx vitest run --coverage
# Expected: all tests pass
```
- [ ] Core tests pass: _____
- [ ] NATS client tests pass: _____

---

## Phase 2: Supabase Backend Deployment

### Step 2.1: Run W3 Supabase Migrations
```bash
cd /Users/nico/projects/apex-sentinel
supabase db push --project-ref bymfcnwfyxuivinuzurr
# Applies: 20260324_w3_model_versions.sql
# Applies: 20260324_w3_nodes_extension.sql
```
- [ ] DONE: _____ Operator: _____
- [ ] Verify `model_versions` table exists:
  ```sql
  SELECT COUNT(*) FROM model_versions;
  -- Expected: 0 (empty, will be populated in Step 2.3)
  ```
- [ ] Verify `nodes` table has new columns:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name='nodes' AND column_name IN ('expo_push_token','platform','app_version');
  -- Expected: 3 rows
  ```

### Step 2.2: Deploy W3 Edge Functions
```bash
cd /Users/nico/projects/apex-sentinel
supabase functions deploy push-register --project-ref bymfcnwfyxuivinuzurr
supabase functions deploy model-version --project-ref bymfcnwfyxuivinuzurr
supabase functions deploy get-node-config --project-ref bymfcnwfyxuivinuzurr
```
- [ ] push-register deployed: _____
- [ ] model-version deployed: _____
- [ ] get-node-config (extended) deployed: _____

### Step 2.3: Upload Initial YAMNet INT8 Model to Supabase Storage
```bash
# Upload model file to Supabase Storage 'models' bucket
supabase storage cp yamnet_int8_v1.tflite ss:///models/ --project-ref bymfcnwfyxuivinuzurr

# Generate SHA-256
SHA256=$(shasum -a 256 yamnet_int8_v1.tflite | awk '{print $1}')

# Insert model version record
supabase db execute --project-ref bymfcnwfyxuivinuzurr -- "
INSERT INTO model_versions (platform, version, sha256, url, min_app_version)
VALUES
  ('android', '1.0.0', '$SHA256',
   'https://bymfcnwfyxuivinuzurr.supabase.co/storage/v1/object/public/models/yamnet_int8_v1.tflite',
   '3.0.0'),
  ('ios', '1.0.0', '$SHA256',
   'https://bymfcnwfyxuivinuzurr.supabase.co/storage/v1/object/public/models/yamnet_int8_v1.tflite',
   '3.0.0');
"
```
- [ ] Android model record inserted: _____
- [ ] iOS model record inserted: _____
- [ ] Model URL publicly accessible: `curl -I {url}` returns 200

### Step 2.4: Test Edge Functions Smoke Test
```bash
# Test push-register
curl -X POST https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/push-register \
  -H "Authorization: Bearer {SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"nodeId":"test-node-001","expoPushToken":"ExponentPushToken[test]","platform":"android","appVersion":"3.0.0"}'
# Expected: {"success":true}

# Test model-version
curl "https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/model-version?platform=android" \
  -H "apikey: {SUPABASE_ANON_KEY}"
# Expected: {"version":"1.0.0","sha256":"...","url":"...","minAppVersion":"3.0.0"}
```
- [ ] push-register smoke test passes: _____
- [ ] model-version smoke test passes: _____

---

## Phase 3: NATS.ws Endpoint Configuration

### Step 3.1: Verify NATS WebSocket Listener

The NATS cluster on fortress (100.68.152.56) must expose a WebSocket listener. Verify configuration:

```bash
ssh -i ~/.ssh/azure_apex_os root@100.68.152.56
cat /etc/nats/nats.conf | grep -A5 websocket
# Expected:
# websocket {
#   port: 9222
#   no_tls: false
#   tls {
#     cert_file: "/etc/nats/certs/server.crt"
#     key_file: "/etc/nats/certs/server.key"
#   }
# }
```
- [ ] WebSocket listener configured on port 9222: _____

### Step 3.2: Verify nginx/Caddy Reverse Proxy for wss://

```bash
ssh -i ~/.ssh/azure_apex_os root@100.68.152.56
# Check nginx proxy config
cat /etc/nginx/sites-enabled/nats-websocket
# Expected: proxy_pass to 127.0.0.1:9222 with WebSocket upgrade headers
# Expected: TLS termination with valid certificate for nats.apex-sentinel.io
```

Nginx config expected:
```nginx
server {
    listen 443 ssl;
    server_name nats.apex-sentinel.io;

    ssl_certificate /etc/letsencrypt/live/nats.apex-sentinel.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nats.apex-sentinel.io/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:9222;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```
- [ ] nginx config in place: _____
- [ ] TLS certificate valid (not expired): _____

### Step 3.3: Test NATS.ws Connection from Local
```bash
# Install nats CLI if not present
brew install nats-io/nats-tools/nats

# Test WebSocket connection
nats pub --server wss://nats.apex-sentinel.io:443 \
  --creds /path/to/test.creds \
  sentinel.test "W3 deployment test $(date)"
# Expected: message published successfully
```
- [ ] NATS.ws connection test passes: _____
- [ ] Latency: ___ms (target <10ms from EU region)

### Step 3.4: Create W3 NATS Credentials

```bash
ssh -i ~/.ssh/azure_apex_os root@100.68.152.56
# Create W3 account if not exists
nsc add account --name SentinelMobile
nsc add user --name sentinel-mobile-template --account SentinelMobile \
  --allow-pub "sentinel.detections.>" \
  --allow-pub "sentinel.nodes.heartbeat" \
  --allow-sub "sentinel.alerts.>" \
  --allow-sub "_INBOX.>"
nsc generate creds --name sentinel-mobile-template > /tmp/mobile-template.creds
# Template credentials are used by register-node to issue per-node credentials
```
- [ ] SentinelMobile NATS account created: _____
- [ ] Template credentials generated: _____

---

## Phase 4: App Signing Setup

### Step 4.1: Android Keystore Setup
```bash
# Generate Android keystore (one-time, keep backup)
keytool -genkey -v -keystore apex-sentinel-release.keystore \
  -alias apex-sentinel \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass {KEYSTORE_PASSWORD} \
  -keypass {KEY_PASSWORD} \
  -dname "CN=APEX Sentinel, OU=Security, O=APEX OS, L=London, ST=England, C=GB"

# Store in EAS Credentials
eas credentials --platform android --profile production
# Follow interactive prompts to upload keystore
```
- [ ] Keystore generated: _____
- [ ] Keystore backed up to secure location: _____
- [ ] EAS credentials uploaded: _____

### Step 4.2: iOS Provisioning Profile Setup
```bash
# Via EAS CLI (preferred — handles App Store Connect API)
eas credentials --platform ios --profile production
# Select: "Use Expo's automated credentials management"
# Requires: Apple Developer account credentials in EAS
```
- [ ] Distribution certificate set up: _____
- [ ] App Store provisioning profile set up: _____
- [ ] Bundle ID `io.apexsentinel.mobile` registered in App Store Connect: _____

### Step 4.3: EAS Secrets Configuration
```bash
cd /Users/nico/projects/apex-sentinel/packages/mobile

# Set all required secrets
eas secret:create --name MAPBOX_ACCESS_TOKEN --value "pk.eyJ1Ij..." --scope project
eas secret:create --name SENTRY_DSN --value "https://...@sentry.io/..." --scope project
eas secret:create --name SENTRY_AUTH_TOKEN --value "..." --scope project
eas secret:create --name NATS_WSS_URL --value "wss://nats.apex-sentinel.io:443" --scope project
eas secret:create --name SUPABASE_URL --value "https://bymfcnwfyxuivinuzurr.supabase.co" --scope project
eas secret:create --name SUPABASE_ANON_KEY --value "eyJ..." --scope project

# Verify all secrets present
eas secret:list
```
- [ ] MAPBOX_ACCESS_TOKEN set: _____
- [ ] SENTRY_DSN set: _____
- [ ] SENTRY_AUTH_TOKEN set: _____
- [ ] NATS_WSS_URL set: _____
- [ ] SUPABASE_URL set: _____
- [ ] SUPABASE_ANON_KEY set: _____

---

## Phase 5: Push Notification Setup

### Step 5.1: FCM (Android) — Expo Push Service

```bash
# FCM setup via Expo Dashboard (no CLI for this step)
# 1. Go to https://expo.dev → Project → Credentials → Android
# 2. Upload FCM Service Account JSON (Google Cloud Console → API & Services → Credentials)
# 3. Verify: "FCM configured" status in Expo dashboard
```
- [ ] FCM service account JSON downloaded from Google Cloud Console: _____
- [ ] FCM service account uploaded to Expo dashboard: _____

### Step 5.2: APNs (iOS) — Expo Push Service

```bash
# APNs setup via EAS CLI
eas push:set-credentials --platform ios
# Select "Set up APNs key"
# Provide: Key ID, Team ID, p8 file path
# From: Apple Developer → Certificates, Identifiers & Profiles → Keys → + → APNs
```
- [ ] APNs p8 key generated in Apple Developer Portal: _____
- [ ] Key ID noted: _____
- [ ] Team ID noted: _____
- [ ] APNs key uploaded to EAS: _____

### Step 5.3: Test Push Notification Delivery
```bash
# Send test push via Expo Push API
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ExponentPushToken[{test_device_token}]",
    "title": "APEX SENTINEL",
    "body": "Test alert: W3 deployment validation",
    "data": {"alertType": "test", "threatLevel": "LOW"}
  }'
# Expected: {"data":{"status":"ok","id":"..."}}
```
- [ ] Test push received on Android test device: _____
- [ ] Test push received on iOS test device: _____

---

## Phase 6: EAS Build — Preview (Internal Distribution)

### Step 6.1: EAS Build — Android Preview
```bash
cd /Users/nico/projects/apex-sentinel/packages/mobile
eas build --platform android --profile preview --non-interactive
# Build submitted to EAS cloud
# Monitor: eas build:list
```
- [ ] Build submitted: _____
- [ ] Build URL: _____
- [ ] Build status: SUCCESS (wait for completion, ~10 minutes)
- [ ] APK downloaded and installed on Pixel 7 test device: _____

### Step 6.2: EAS Build — iOS Preview (Simulator)
```bash
cd /Users/nico/projects/apex-sentinel/packages/mobile
eas build --platform ios --profile development --non-interactive
# Produces .app for simulator
```
- [ ] Simulator build submitted: _____
- [ ] Build status: SUCCESS
- [ ] .app installed on iPhone 14 simulator: _____

### Step 6.3: Smoke Test on Real Devices

For each test device, verify:
- [ ] App installs without crash
- [ ] Node registration completes (new nodeId generated, stored in SecureStore)
- [ ] NATS.ws connection established (connection status indicator green)
- [ ] Audio capture starts (mic permission granted, foreground service notification visible on Android)
- [ ] Test detection event appears in home feed (trigger with reference audio)
- [ ] Alert subscription active (send test alert via `sentinel.alerts.test`)
- [ ] Map screen loads (Mapbox tiles load)
- [ ] Calibration wizard launches and completes

Devices:
- [ ] Pixel 7 (Android 14): _____
- [ ] Samsung Galaxy S22 (Android 13): _____
- [ ] iPhone 14 (iOS 17): _____
- [ ] iPhone SE 2 (iOS 16): _____

---

## Phase 7: Sentry Configuration

### Step 7.1: Configure Sentry Project
```bash
# sentry.properties already generated at EAS build time
# Verify source maps were uploaded:
# Go to sentry.io → apex-sentinel → Releases → v3.0.0
# Expected: source maps attached
```
- [ ] Sentry project `apex-sentinel-mobile` exists: _____
- [ ] Source maps uploaded for Android build: _____
- [ ] Source maps uploaded for iOS build: _____

### Step 7.2: Test Sentry Error Capture
```bash
# Trigger a test error in the app (dev build)
# In development console or via test screen:
# Sentry.captureException(new Error('W3 deploy validation test'))
# Go to Sentry → Issues → verify error appears with stack trace
```
- [ ] Test error appears in Sentry with readable stack trace (not minified): _____
- [ ] Performance trace spans visible: _____

---

## Phase 8: Internal Beta Distribution

### Step 8.1: Google Play Internal Track
```bash
# Submit to Google Play Internal Track via EAS Submit
cd /Users/nico/projects/apex-sentinel/packages/mobile
eas submit --platform android --profile production \
  --path /path/to/release.aab
# Requires: Google Play Service Account JSON in EAS secrets
```
- [ ] Google Play Service Account JSON configured in EAS: _____
- [ ] AAB submitted to internal track: _____
- [ ] Tester emails added in Google Play Console: _____
- [ ] Internal track enabled: _____

### Step 8.2: TestFlight Internal Testing
```bash
eas submit --platform ios --profile production \
  --latest
# Submits to App Store Connect for TestFlight
```
- [ ] IPA submitted to App Store Connect: _____
- [ ] Processing complete (15-30 minutes): _____
- [ ] Internal testers added in TestFlight: _____
- [ ] TestFlight invite sent: _____

---

## Phase 9: Feature Flag Activation

### Step 9.1: Initial Feature Flag State

Feature flags default values in `app_config` table. Verify defaults:

```sql
-- Via Supabase SQL Editor on bymfcnwfyxuivinuzurr
SELECT * FROM app_config WHERE key LIKE 'w3_%';
```

Expected initial state:
| Key | Value | Reason |
|-----|-------|--------|
| w3_meshtastic_enabled | false | Staged rollout — enable after BLE testing |
| w3_ota_model_updates_enabled | true | Enable from day 1 |
| w3_battery_optimization_threshold_pct | 20 | Default: <20% battery → 1Hz mode |
| w3_detection_cooldown_ms | 5000 | 5s cooldown between events |

- [ ] All feature flags set: _____

### Step 9.2: Enable Meshtastic After BLE Validation
- [ ] BLE pairing tested on 2 physical Meshtastic devices: _____
- [ ] w3_meshtastic_enabled → true: _____

---

## Phase 10: EAS Update (OTA) Channel Verification

```bash
cd /Users/nico/projects/apex-sentinel/packages/mobile
# Create update for staging channel
eas update --branch staging --message "W3 initial deployment — staging"
# Verify update appears on devices:
# Settings → Debug → Check for updates (in development build)
```
- [ ] EAS Update staging channel active: _____
- [ ] OTA update received on test device: _____

---

## Rollback Procedure

### Rollback: JS Bundle (OTA)
```bash
# Find previous update ID
eas update:list --branch production

# Force all devices to previous bundle
eas update --branch production --message "Rollback: revert to {prev-commit-sha}" --republish {PREVIOUS_UPDATE_ID}
# Devices pull new update within 15 minutes on next launch
```
- Rollback time: ~15 minutes to reach all devices

### Rollback: Native Binary
```bash
# If critical native crash found:
# 1. Revert to previous EAS Build artifact
eas build:list --platform android --status finished
# 2. Submit previous AAB to Google Play
eas submit --platform android --id {PREVIOUS_BUILD_ID}
# 3. Increase staged rollout percentage immediately to 100% for previous version
```
- Rollback time: 2-4 hours (Play Store rollout) or instant (TestFlight revert)

### Rollback: Supabase Migrations
```bash
# W3 migrations are additive only (no DROP statements)
# If migration caused issues:
supabase db execute --project-ref bymfcnwfyxuivinuzurr -- "
  DROP TABLE IF EXISTS model_versions;
  ALTER TABLE nodes DROP COLUMN IF EXISTS expo_push_token;
  ALTER TABLE nodes DROP COLUMN IF EXISTS platform;
  ALTER TABLE nodes DROP COLUMN IF EXISTS app_version;
  ALTER TABLE nodes DROP COLUMN IF EXISTS last_push_registered_at;
"
# Then revert Edge Function deploys to W2 versions
supabase functions deploy get-node-config --project-ref bymfcnwfyxuivinuzurr
# (W2 version is in git tag w2/complete)
```

### Rollback: Model Version
```bash
# Set previous model as active in model_versions table
supabase db execute --project-ref bymfcnwfyxuivinuzurr -- "
  UPDATE model_versions SET is_active = FALSE WHERE version = '{BAD_VERSION}';
  UPDATE model_versions SET is_active = TRUE WHERE version = '{GOOD_VERSION}';
"
# All devices will revert to good model within 24h (on next startup check)
# For immediate rollback: push EAS Update with forced model download
```

---

## Deployment Sign-Off

| Step | Status | Date | Operator |
|------|--------|------|----------|
| Phase 1: Pre-deploy validation | | | |
| Phase 2: Supabase backend | | | |
| Phase 3: NATS.ws endpoint | | | |
| Phase 4: App signing | | | |
| Phase 5: Push notifications | | | |
| Phase 6: EAS build + device smoke | | | |
| Phase 7: Sentry | | | |
| Phase 8: Internal beta | | | |
| Phase 9: Feature flags | | | |
| Phase 10: OTA channel | | | |

**Final sign-off:** _____________ Date: _____________

---

## Post-Deployment Monitoring (First 48 Hours)

| Metric | Target | Check Command |
|--------|--------|---------------|
| Crash-free sessions | > 99% | Sentry → Crashes |
| Push delivery rate | > 95% | Expo Push receipt API |
| NATS connection uptime | > 99% | Sentry perf → nats_connect span |
| YAMNet inference p99 | < 150ms | Sentry perf → yamnet_inference span |
| Background audio retention | > 90% | Custom metric via Sentry |
| Alert latency median | < 1000ms | Sentry perf → alert_receive span |
