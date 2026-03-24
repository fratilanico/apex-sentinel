# APEX-SENTINEL — Last Known Good Configuration (LKGC)
# FILE 15 of 20 — LKGC_TEMPLATE.md
# Wave 1 Baseline — Pre-Code State (2026-03-24)

---

## Purpose

This document captures the Last Known Good Configuration (LKGC) for APEX-SENTINEL. It is
updated at every checkpoint gate and before any production deployment. When a regression is
detected, this document is the authoritative rollback target.

**RULE:** Never overwrite this file — create LKGC_W1_CHECKPOINT_01.md, etc. This file is
the W1 PRE-CODE BASELINE.

---

## 1. Git State

```
Repository:        https://github.com/apex-sentinel/apex-sentinel
Branch:            main
Commit SHA:        (PRE-CODE — no commits yet as of 2026-03-24)
Tag:               v0.0.0-w1-baseline
Tree hash:         (pending first commit)
Last commit msg:   docs(w1): PROJECTAPEX 20-doc suite — pre-code baseline
Committed by:      Nicolae Fratila <nico@apexos.io>
Committed at:      2026-03-24T00:00:00Z
```

Rollback command:
```bash
git fetch origin
git checkout v0.0.0-w1-baseline
# or by SHA once assigned:
git checkout <SHA>
```

---

## 2. ML Model Versions

### 2a. Acoustic Detection Model — YAMNet TFLite

```
Model name:         yamnet_drone_sentinel_v1.tflite
Format:             TensorFlow Lite FlatBuffer
Version:            1.0.0-indigo-finetuned
Base model:         YAMNet (Google AudioSet, 521 classes)
Fine-tuned on:      INDIGO AirGuard dataset (FPV + Shahed-class drones)
Input shape:        [1, 15600] float32 (0.975s @ 16kHz, pre-emphasis + log-mel)
Output shape:       [1, 3] float32 (classes: drone, no-drone, uncertain)
Quantization:       INT8 post-training quantization
Model size:         480 KB (validated)
Inference latency:  156ms median on Snapdragon 765G (validated)
Accuracy:           87% on INDIGO AirGuard holdout set
SHA-256:            (pending — file not yet committed)
Storage path:       app/src/main/assets/models/yamnet_drone_sentinel_v1.tflite
                    ApexSentinel/Resources/Models/yamnet_drone_sentinel_v1.mlpackage (iOS CoreML)
```

### 2b. RF/EMF Anomaly Classifier

```
Model name:         rf_anomaly_classifier_v1.pkl / rf_anomaly_v1.tflite
Format:             TFLite (Android), CoreML (iOS)
Version:            1.0.0-baseline
Algorithm:          Isolation Forest + threshold classifier
Features:           [rssi_mean, rssi_variance, channel_count, scan_rate_hz,
                     beacon_entropy, probe_request_rate, power_spectral_density]
Training set:       Synthetic + INDIGO AirGuard RF traces
Size:               ~120 KB
SHA-256:            (pending)
Storage path:       app/src/main/assets/models/rf_anomaly_v1.tflite
```

---

## 3. Supabase Migration Version

```
Project ID:         bymfcnwfyxuivinuzurr
Region:             eu-west-2 (London)
Project URL:        https://bymfcnwfyxuivinuzurr.supabase.co
Dashboard:          https://supabase.com/dashboard/project/bymfcnwfyxuivinuzurr

Migration state (W1 baseline):
  Applied:          0000_initial_schema.sql
  Applied:          0001_sensor_nodes.sql
  Applied:          0002_detection_events.sql
  Applied:          0003_rf_readings.sql
  Applied:          0004_mesh_topology.sql
  Applied:          0005_rls_policies.sql
  Applied:          0006_realtime_enable.sql
  Pending:          (none at W1 baseline)

Last migration SHA: (pending)
Migration dir:      supabase/migrations/
```

Rollback command (nuclear — drops all apex tables):
```bash
# WARNING: destructive — only for dev/staging
supabase db reset --project-ref bymfcnwfyxuivinuzurr
# Then re-apply:
supabase db push --project-ref bymfcnwfyxuivinuzurr
```

Selective rollback:
```bash
# Roll back last migration via Supabase Management API
# Requires PAT (not anon key) — see docs/runbooks/supabase-rollback.md
curl -X DELETE \
  "https://api.supabase.com/v1/projects/bymfcnwfyxuivinuzurr/database/migrations/0006" \
  -H "Authorization: Bearer $SUPABASE_PAT"
```

---

## 4. App Versions

### 4a. Android App

```
App name:           APEX Sentinel
Package:            io.apexos.sentinel
Version name:       0.1.0-alpha
Version code:       1
Min SDK:            26 (Android 8.0)
Target SDK:         35 (Android 15)
Compile SDK:        35
Build tools:        35.0.0
AGP version:        8.7.0
Kotlin version:     2.1.0
Gradle wrapper:     8.11.1
Build variant:      debug (W1 baseline — no release keystore yet)
APK SHA-256:        (pending first build)
Release channel:    (none — sideload only at W1)
```

### 4b. iOS App

```
App name:           APEX Sentinel
Bundle ID:          io.apexos.sentinel
Version:            0.1.0
Build number:       1
Min iOS:            16.0
Target iOS:         18.x
Xcode:              16.x
Swift:              6.0
CocoaPods:          1.16.x
Distribution:       TestFlight (pending Apple enrollment)
IPA SHA-256:        (pending first build)
```

---

## 5. C2 Dashboard Version

```
App name:           APEX Sentinel C2
Repository path:    c2-dashboard/
Framework:          React 19 + TypeScript 5.7
Build tool:         Vite 6.x
CesiumJS:           1.124.x
MapLibre GL JS:     4.x
OpenMCT:            4.x (git submodule)
FreeTAKServer:      2.1.x (Docker image: freetakteam/freetakserver:2.1)
Node:               22.x LTS
npm:                10.x
Version:            0.1.0-alpha
Build SHA:          (pending)
Deployment:         (none — local only at W1 baseline)
```

---

## 6. FreeTAKServer Version

```
Image:              freetakteam/freetakserver:2.1.0
Container name:     apex-sentinel-fts
TCP COT port:       8087
UDP COT port:       8088
REST API port:      19023
Admin port:         19024
Config file:        infra/freetakserver/FTSConfig.yaml
Persistent data:    infra/freetakserver/data/ (Docker volume)
Version tag:        2.1.0
SHA-256:            (pending pull)
```

---

## 7. Infrastructure / Environment

```
Python version:     3.12.x
TensorFlow:         2.19.x
TFLite Runtime:     2.19.x (Android ABI: arm64-v8a, armeabi-v7a)
Node.js:            22.x LTS
Supabase CLI:       2.x
Docker:             27.x
Docker Compose:     2.x
OS (dev):           macOS 15.x (Sequoia) / Ubuntu 24.04 LTS (CI)
Java:               21 LTS (Android builds via Gradle)
Android NDK:        27.x (for TFLite JNI)
```

---

## 8. Known Issues at W1 Baseline

| ID    | Severity | Description                                                | Workaround                                 |
|-------|----------|------------------------------------------------------------|--------------------------------------------|
| KI-01 | Medium   | YAMNet model not yet fine-tuned on Romanian FPV drone set | Using INDIGO AirGuard weights as proxy     |
| KI-02 | Low      | RF classifier training data is synthetic only              | Collect real-world data in W2              |
| KI-03 | High     | No Android background service implementation yet           | W1 foreground-only                         |
| KI-04 | Medium   | iOS CoreML conversion of YAMNet not validated on device    | Android-first; iOS validation W1 end       |
| KI-05 | Low      | FreeTAKServer COT integration untested end-to-end          | W2 integration milestone                   |
| KI-06 | Medium   | Supabase anon key RLS policies not final                   | Dev mode permissive until W1 complete      |
| KI-07 | Low      | Mesh (Meshtastic) entirely out of scope for W1             | W2 scope                                   |
| KI-08 | Medium   | GPS accuracy not validated in dense urban canyons          | ±62m validated in open/semi-open only      |
| KI-09 | High     | No cryptographic signing of detection events yet           | W3 security hardening scope                |
| KI-10 | Low      | OpenMCT telemetry plugin not implemented                   | Stubbed in W1 C2 baseline                  |

---

## 9. Rollback Runbook

### 9a. Full rollback to W1 baseline

```bash
# 1. Stop running services
docker compose -f infra/docker-compose.yml down

# 2. Checkout baseline
git fetch origin
git checkout v0.0.0-w1-baseline

# 3. Restore Supabase to W1 migration state
supabase db reset --project-ref bymfcnwfyxuivinuzurr

# 4. Rebuild Android (debug)
cd android && ./gradlew clean assembleDebug

# 5. Rebuild C2 dashboard
cd c2-dashboard && npm ci && npm run build

# 6. Restart infrastructure
docker compose -f infra/docker-compose.yml up -d

# 7. Verify health
curl http://localhost:19023/api/v1/health
```

### 9b. Model-only rollback

```bash
# Replace model file without touching app version
cp backups/models/yamnet_drone_sentinel_v0.tflite \
   android/app/src/main/assets/models/yamnet_drone_sentinel_v1.tflite
# Rebuild and push
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### 9c. Database-only rollback

```bash
# Via Supabase CLI (preferred)
supabase db diff --project-ref bymfcnwfyxuivinuzurr
# Manual migration rollback — see each migration's DOWN section
psql "$SUPABASE_DB_URL" -f supabase/migrations/rollbacks/0006_realtime_enable_down.sql
```

---

## 10. Checkpoint History

| Checkpoint | Date       | Git SHA     | Passed Gates                     | Notes                    |
|------------|------------|-------------|----------------------------------|--------------------------|
| W1-BASE    | 2026-03-24 | (pending)   | docs complete                    | This file — pre-code     |
| W1-CP01    | TBD        | TBD         | RED tests committed              | TDD red phase            |
| W1-CP02    | TBD        | TBD         | Android audio capture passing    | execute phase 1          |
| W1-CP03    | TBD        | TBD         | YAMNet inference passing         | execute phase 2          |
| W1-CP04    | TBD        | TBD         | Supabase ingestion passing       | execute phase 3          |
| W1-COMPLETE| TBD        | TBD         | All gates green, coverage ≥80%   | wave:complete            |

---

## 11. Verification Commands

```bash
# Verify Android build
cd android && ./gradlew assembleDebug && echo "BUILD OK"

# Verify iOS build
cd ios && xcodebuild -scheme ApexSentinel -destination 'generic/platform=iOS Simulator' build

# Verify tests
cd android && ./gradlew test
cd ios && xcodebuild test -scheme ApexSentinelTests -destination 'platform=iOS Simulator,name=iPhone 16'

# Verify Supabase migrations applied
supabase db diff --project-ref bymfcnwfyxuivinuzurr --linked

# Verify C2 dashboard
cd c2-dashboard && npm run build && echo "C2 BUILD OK"

# Verify FreeTAKServer
docker compose -f infra/docker-compose.yml up -d freetakserver
curl -s http://localhost:19023/api/v1/info | jq .version
```

---

*Document owner: Nicolae Fratila | Last updated: 2026-03-24 | Next update: W1-CP01*
