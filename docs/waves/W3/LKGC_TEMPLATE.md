# APEX-SENTINEL — Last Known Good Configuration Template
## W3 | PROJECTAPEX Doc 15/21 | 2026-03-24

Wave 3: React Native (Expo) mobile app — Android + iOS

---

## 1. Purpose

An LKGC snapshot is captured whenever the system is in a verified-stable state. The snapshot
provides a deterministic rollback target. For W3 (mobile app), stability means:
- Tests GREEN, coverage ≥ 80%
- EAS build successful on both platforms
- Background detection running on physical devices without crash
- NATS.ws connection stable, detection events flowing
- Push notifications delivered in < 2s

---

## 2. LKGC Fields

### 2.1 Application Version

```yaml
app_version: "3.0.0"                    # semver, matches app.json version
build_number_android: 30000             # versionCode in app.json
build_number_ios: 30000                 # buildNumber in app.json
expo_sdk_version: "52.0.0"             # Expo SDK version
react_native_version: "0.76.3"         # RN version bundled by SDK 52
```

### 2.2 EAS Build Identifiers

```yaml
eas_build_android:
  build_id: ""                          # UUID from EAS build, e.g. "a1b2c3d4-..."
  profile: "production"
  platform: "android"
  artifact_url: ""                      # https://expo.dev/artifacts/eas/...
  status: "finished"
  created_at: ""                        # ISO 8601

eas_build_ios:
  build_id: ""                          # UUID from EAS build
  profile: "production"
  platform: "ios"
  artifact_url: ""
  status: "finished"
  created_at: ""
```

Capture via:
```bash
eas build:list --platform all --limit 2 --json | \
  jq '[.[] | {build_id: .id, platform, status, artifact_url: .artifacts.buildUrl, created_at: .createdAt}]'
```

### 2.3 Git Identifiers

```yaml
git_sha: ""                             # full 40-char SHA of HEAD at snapshot time
git_short_sha: ""                       # first 8 chars
git_branch: "main"
git_tag: ""                             # semver tag if present, e.g. "v3.0.0"
git_commit_message: ""                  # first line of HEAD commit message
git_dirty: false                        # must be false for LKGC
```

Capture via:
```bash
git log -1 --format='sha: %H%nshort: %h%nbranch: %D%nmessage: %s'
git diff --quiet && echo "dirty: false" || echo "dirty: true"
```

### 2.4 NATS.ws Endpoint

```yaml
nats_ws:
  endpoint: "wss://nats.apex-sentinel.io:443"
  path: "/ws"
  tls_version: "TLSv1.3"
  cert_spki_pin_sha256: ""              # SHA-256 of SPKI for certificate pinning
  auth_method: "nkey"                   # nkey signed JWT
  heartbeat_interval_ms: 30000
  reconnect_wait_ms: 2000
  max_reconnect_attempts: -1            # unlimited
  connection_timeout_ms: 10000
```

### 2.5 TFLite Model (Android)

```yaml
tflite_model:
  filename: "yamnet_w3_int8.tflite"
  version: "3.0.0"
  sha256: ""                            # SHA-256 of model file
  size_bytes: 0                         # must be ≤ 491520 (480 KB)
  quantization: "INT8"
  input_shape: [1, 15600]              # 1s of audio at 16kHz
  output_classes: 521                  # YAMNet class count
  inference_threads: 2
  cdn_url: "https://models.apex-sentinel.io/yamnet/v3.0.0/yamnet_w3_int8.tflite"
  cdn_fallback_url: "https://sentinel-models.b-cdn.net/yamnet/v3.0.0/yamnet_w3_int8.tflite"
```

Capture SHA-256:
```bash
sha256sum android/app/src/main/assets/yamnet_w3_int8.tflite
# or on macOS:
shasum -a 256 android/app/src/main/assets/yamnet_w3_int8.tflite
```

### 2.6 CoreML Model (iOS)

```yaml
coreml_model:
  filename: "YAMNet_W3.mlpackage"
  version: "3.0.0"
  sha256: ""                            # SHA-256 of .mlpackage directory (tar then hash)
  size_bytes: 0                         # must be ≤ 524288 (512 KB)
  compute_units: "cpuAndNeuralEngine"  # ANE preferred, CPU fallback
  minimum_deployment: "iOS 16.0"
  cdn_url: "https://models.apex-sentinel.io/yamnet/v3.0.0/YAMNet_W3.mlpackage.tar.gz"
```

### 2.7 Supabase Configuration

```yaml
supabase:
  project_id: "bymfcnwfyxuivinuzurr"
  region: "eu-west-2"
  url: "https://bymfcnwfyxuivinuzurr.supabase.co"
  anon_key_prefix: ""                   # first 8 chars of anon key for identification
  edge_functions:
    register_node:
      version: ""                       # deployment version from Supabase dashboard
      deployed_at: ""
    ingest_event:
      version: ""
      deployed_at: ""
    node_health:
      version: ""
      deployed_at: ""
    alert_router:
      version: ""
      deployed_at: ""
  active_migrations:
    count: 0                            # total migration count
    last_migration: ""                  # filename of most recent migration
```

### 2.8 Test Results

```yaml
test_results:
  jest:
    run_date: ""
    total_suites: 0
    passed_suites: 0
    failed_suites: 0
    total_tests: 0
    passed_tests: 0
    failed_tests: 0
    pass_rate_percent: 0.0              # must be 100.0 for LKGC
    coverage:
      statements: 0.0                  # must be ≥ 80.0
      branches: 0.0                    # must be ≥ 80.0
      functions: 0.0                   # must be ≥ 80.0
      lines: 0.0                       # must be ≥ 80.0
    duration_seconds: 0

  detox_android:
    run_date: ""
    configuration: "android.emu.release"
    device: "Pixel_7_API_34"
    total_tests: 0
    passed: 0
    failed: 0
    pass_rate_percent: 0.0             # must be 100.0 for LKGC
    duration_seconds: 0

  detox_ios:
    run_date: ""
    configuration: "ios.sim.release"
    device: "iPhone 14, iOS 17.0"
    total_tests: 0
    passed: 0
    failed: 0
    pass_rate_percent: 0.0             # must be 100.0 for LKGC
    duration_seconds: 0

  typescript:
    errors: 0                          # must be 0 for LKGC
    warnings: 0
```

### 2.9 Device Compatibility Matrix

Physical device validation results at LKGC snapshot time:

```yaml
device_matrix:
  - device: "Pixel 7"
    os: "Android 14 (API 34)"
    chip: "Google Tensor G2"
    ram_gb: 8
    validation:
      background_audio_1hr: false      # true/false
      detection_latency_p99_ms: 0      # must be ≤ 500
      battery_drain_pct_per_hr: 0.0   # must be ≤ 3.0
      tflite_inference_p99_ms: 0       # must be ≤ 150
      app_launch_cold_ms: 0            # must be ≤ 2500
      eas_build_installed: false
      validated_at: ""
      validated_by: ""

  - device: "Samsung Galaxy S22"
    os: "Android 13 (API 33)"
    chip: "Exynos 2200"
    ram_gb: 8
    validation:
      background_audio_1hr: false
      detection_latency_p99_ms: 0
      battery_drain_pct_per_hr: 0.0
      tflite_inference_p99_ms: 0
      app_launch_cold_ms: 0
      eas_build_installed: false
      validated_at: ""
      validated_by: ""

  - device: "iPhone 14"
    os: "iOS 17.0"
    chip: "Apple A15 Bionic"
    ram_gb: 6
    validation:
      background_audio_1hr: false
      detection_latency_p99_ms: 0
      battery_drain_pct_per_hr: 0.0
      coreml_inference_p99_ms: 0       # iOS uses CoreML, not TFLite
      app_launch_cold_ms: 0
      eas_build_installed: false
      validated_at: ""
      validated_by: ""

  - device: "iPhone SE (2nd generation)"
    os: "iOS 16.7"
    chip: "Apple A13 Bionic"
    ram_gb: 3
    validation:
      background_audio_1hr: false
      detection_latency_p99_ms: 0
      battery_drain_pct_per_hr: 0.0
      coreml_inference_p99_ms: 0
      app_launch_cold_ms: 0
      eas_build_installed: false
      validated_at: ""
      validated_by: ""
```

---

## 3. Capture Script

Save as `scripts/lkgc-capture-w3.sh`:

```bash
#!/usr/bin/env bash
# APEX-SENTINEL W3 LKGC Capture Script
# Usage: ./scripts/lkgc-capture-w3.sh
# Writes snapshot to docs/waves/W3/lkgc-snapshots/YYYYMMDDHHMMSS.yaml

set -euo pipefail

SNAPSHOT_DIR="docs/waves/W3/lkgc-snapshots"
mkdir -p "$SNAPSHOT_DIR"
TS=$(date -u +%Y%m%d%H%M%S)
OUTFILE="$SNAPSHOT_DIR/${TS}.yaml"

echo "--- LKGC Snapshot: APEX-SENTINEL W3" > "$OUTFILE"
echo "captured_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$OUTFILE"
echo "" >> "$OUTFILE"

# Git state
echo "git:" >> "$OUTFILE"
GIT_SHA=$(git rev-parse HEAD)
GIT_SHORT=$(git rev-parse --short HEAD)
GIT_MSG=$(git log -1 --format='%s')
GIT_DIRTY=$(git diff --quiet && echo "false" || echo "true")
echo "  sha: $GIT_SHA" >> "$OUTFILE"
echo "  short: $GIT_SHORT" >> "$OUTFILE"
echo "  message: \"$GIT_MSG\"" >> "$OUTFILE"
echo "  dirty: $GIT_DIRTY" >> "$OUTFILE"

if [ "$GIT_DIRTY" = "true" ]; then
  echo "ERROR: Working directory is dirty. Commit all changes before capturing LKGC." >&2
  exit 1
fi

# EAS builds
echo "" >> "$OUTFILE"
echo "eas_builds:" >> "$OUTFILE"
if command -v eas &>/dev/null; then
  eas build:list --platform all --limit 2 --json 2>/dev/null | \
    jq -r '.[] | "  - build_id: " + .id + "\n    platform: " + .platform + "\n    status: " + .status' \
    >> "$OUTFILE" || echo "  # eas CLI not authenticated" >> "$OUTFILE"
else
  echo "  # eas CLI not installed" >> "$OUTFILE"
fi

# TFLite model hash
echo "" >> "$OUTFILE"
echo "tflite_model:" >> "$OUTFILE"
MODEL_PATH="android/app/src/main/assets/yamnet_w3_int8.tflite"
if [ -f "$MODEL_PATH" ]; then
  if command -v sha256sum &>/dev/null; then
    SHA=$(sha256sum "$MODEL_PATH" | awk '{print $1}')
  else
    SHA=$(shasum -a 256 "$MODEL_PATH" | awk '{print $1}')
  fi
  SIZE=$(wc -c < "$MODEL_PATH")
  echo "  sha256: $SHA" >> "$OUTFILE"
  echo "  size_bytes: $SIZE" >> "$OUTFILE"
else
  echo "  # model file not found at $MODEL_PATH" >> "$OUTFILE"
fi

# Jest results
echo "" >> "$OUTFILE"
echo "jest:" >> "$OUTFILE"
JEST_OUTPUT=$(npx jest --coverage --ci --json 2>/dev/null || true)
if echo "$JEST_OUTPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print('  passed:', str(d['success']).lower()); print('  num_passed:', d['numPassedTests']); print('  num_failed:', d['numFailedTests']); print('  num_total:', d['numTotalTests'])" 2>/dev/null >> "$OUTFILE"; then
  true
else
  echo "  # jest output not parseable" >> "$OUTFILE"
fi

# TypeScript
echo "" >> "$OUTFILE"
echo "typescript:" >> "$OUTFILE"
TSC_ERRORS=$(npx tsc --noEmit 2>&1 | wc -l | tr -d ' ')
echo "  errors: $TSC_ERRORS" >> "$OUTFILE"

echo "" >> "$OUTFILE"
echo "snapshot_complete: true" >> "$OUTFILE"

echo "LKGC snapshot written to: $OUTFILE"
git add "$OUTFILE"
echo "File staged. Commit with: git commit -m 'chore(W3): lkgc snapshot $TS'"
```

```bash
chmod +x scripts/lkgc-capture-w3.sh
```

---

## 4. Rollback Procedure

### 4.1 Revert EAS Build (Over-the-Air)

For OTA-compatible changes (JS bundle only, no native code):

```bash
# List recent EAS Update channels
eas update:list --branch production --limit 10

# Roll back to previous update
eas update:republish --branch production --update-id <previous-update-id>
# This republishes the previous bundle to all devices with expo-updates installed.
# Devices will fetch on next background/foreground cycle (within 60s by default).
```

For native code changes (requires new build):
```bash
# Identify last known good build ID from LKGC snapshot
GOOD_BUILD_ANDROID="<build_id_from_lkgc>"
GOOD_BUILD_IOS="<build_id_from_lkgc>"

# Download artifacts
eas build:download --id "$GOOD_BUILD_ANDROID" --output "/tmp/sentinel-rollback.aab"
eas build:download --id "$GOOD_BUILD_IOS" --output "/tmp/sentinel-rollback.ipa"

# For internal testers — resubmit via EAS Submit
eas submit --platform android --path "/tmp/sentinel-rollback.aab" --track internal
eas submit --platform ios --path "/tmp/sentinel-rollback.ipa"
```

### 4.2 Revert Git

```bash
# Find the LKGC git SHA from snapshot file
LKGC_SHA="<sha from lkgc snapshot>"

# Create rollback branch
git checkout -b rollback/w3-to-lkgc-$LKGC_SHA "$LKGC_SHA"

# Verify tests still pass on this SHA
npx jest --ci
npx tsc --noEmit

# Rebase main (requires approval from Nico)
# git push origin rollback/w3-to-lkgc-$LKGC_SHA
# → open PR → merge
```

### 4.3 Force OTA Update to All Devices

If a critical bug is live and OTA rollback is needed immediately:

```bash
# Push rollback bundle as new update with higher priority
eas update --branch production --message "ROLLBACK: revert to LKGC $LKGC_SHA"

# Monitor uptake
eas update:list --branch production --limit 3
# Check analytics: https://expo.dev/accounts/apex-os/projects/apex-sentinel/updates
```

In-app: expo-updates checks for updates on foreground with `checkAutomatically: 'ON_LOAD'`.
Rollback bundle will be live within 60s for all active users.

### 4.4 NATS.ws Endpoint Rollback

If NATS endpoint is changed and needs reverting:

```bash
# Update EAS environment variable
eas env:update EXPO_PUBLIC_NATS_WS_URL "wss://nats.apex-sentinel.io:443" \
  --scope project --environment production

# Push OTA update to pick up new env
eas update --branch production --message "fix: revert NATS endpoint to LKGC"
```

### 4.5 TFLite Model Rollback

If a bad model is deployed:

```bash
# Previous model CDN URL is in the LKGC snapshot
# Update model version in model-update Edge Function
# or post NATS message to sentinel.model.rollback:
npx ts-node scripts/publish-model-rollback.ts \
  --model-url "https://models.apex-sentinel.io/yamnet/v2.9.0/yamnet_w3_int8.tflite" \
  --model-version "2.9.0" \
  --model-sha256 "<sha from previous lkgc>"
```

Devices subscribing to `sentinel.model.update` will receive rollback within 30s.

---

## 5. LKGC Validation Checklist

Before accepting an LKGC snapshot as valid, confirm:

```
[ ] git_dirty: false
[ ] jest pass_rate: 100.0%
[ ] jest coverage statements: ≥ 80.0%
[ ] jest coverage branches: ≥ 80.0%
[ ] jest coverage functions: ≥ 80.0%
[ ] jest coverage lines: ≥ 80.0%
[ ] detox_android pass_rate: 100.0%
[ ] detox_ios pass_rate: 100.0%
[ ] typescript errors: 0
[ ] tflite_model sha256: present (non-empty)
[ ] tflite_model size_bytes: ≤ 491520
[ ] eas_build_android status: "finished"
[ ] eas_build_ios status: "finished"
[ ] All 4 device matrix validations: background_audio_1hr: true
[ ] All 4 device matrix validations: battery_drain_pct_per_hr: ≤ 3.0
[ ] snapshot_complete: true
```

Validation script:
```bash
python3 scripts/validate-lkgc-w3.py docs/waves/W3/lkgc-snapshots/$(ls -t docs/waves/W3/lkgc-snapshots/ | head -1)
```

---

## 6. Snapshot Storage

LKGC snapshots are stored in three locations for redundancy:

1. `docs/waves/W3/lkgc-snapshots/` — git-tracked, survives repo clones
2. Supabase `lkgc_snapshots` table — queryable, survives git history rewrites
3. `/Users/nico/obsidian-vault/APEX-SENTINEL/lkgc/` — Syncthing-synced, offline accessible

Insert to Supabase:
```bash
curl -sS "https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/lkgc-store" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "$(cat docs/waves/W3/lkgc-snapshots/$(ls -t docs/waves/W3/lkgc-snapshots/ | head -1))"
```
