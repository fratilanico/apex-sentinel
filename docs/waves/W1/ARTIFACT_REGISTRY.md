# APEX-SENTINEL — Artifact Registry

**Project:** APEX-SENTINEL
**Version:** 1.0
**Date:** 2026-03-24
**Wave:** W1 (registry covers W1–W4 planned artifacts)

---

## Registry Format

Each artifact entry includes:
- **ID:** Unique artifact identifier
- **Name:** Human-readable name
- **Type:** `source`, `model`, `dataset`, `migration`, `build`, `config`, `key`, `external`, `deployment`
- **Path / Location:** Where the artifact lives
- **Wave:** When it is created/needed
- **Status:** `planned` | `in-progress` | `done` | `blocked`
- **Hash/Version:** When applicable — SHA256, git tag, or version string

---

## Section 1: Source Code Artifacts

### Android

| ID | Name | Path | Wave | Status |
|----|------|------|------|--------|
| SRC-AND-001 | AcousticDetectionEngine | `android/app/src/main/java/uk/apex/sentinel/acoustic/AcousticDetectionEngine.kt` | W1 | planned |
| SRC-AND-002 | BandpassFilter | `android/app/src/main/java/uk/apex/sentinel/acoustic/BandpassFilter.kt` | W1 | planned |
| SRC-AND-003 | TFLiteAcousticModel | `android/app/src/main/java/uk/apex/sentinel/ml/TFLiteAcousticModel.kt` | W1 | planned |
| SRC-AND-004 | WiFiAnomalyDetector | `android/app/src/main/java/uk/apex/sentinel/rf/WiFiAnomalyDetector.kt` | W1 | planned |
| SRC-AND-005 | DetectionRepository | `android/app/src/main/java/uk/apex/sentinel/data/DetectionRepository.kt` | W1 | planned |
| SRC-AND-006 | NodeRepository | `android/app/src/main/java/uk/apex/sentinel/data/NodeRepository.kt` | W1 | planned |
| SRC-AND-007 | NodeIdentityManager | `android/app/src/main/java/uk/apex/sentinel/data/NodeIdentityManager.kt` | W1 | planned |
| SRC-AND-008 | AlertManager | `android/app/src/main/java/uk/apex/sentinel/alert/AlertManager.kt` | W1 | planned |
| SRC-AND-009 | DetectionForegroundService | `android/app/src/main/java/uk/apex/sentinel/service/DetectionForegroundService.kt` | W1 | planned |
| SRC-AND-010 | WebRTCVADWrapper | `android/app/src/main/java/uk/apex/sentinel/acoustic/WebRTCVADWrapper.kt` | W1 | planned |
| SRC-AND-011 | MeshManager (Meshtastic) | `android/app/src/main/java/uk/apex/sentinel/mesh/MeshManager.kt` | W2 | planned |
| SRC-AND-012 | NearbyConnectionsManager | `android/app/src/main/java/uk/apex/sentinel/mesh/NearbyConnectionsManager.kt` | W2 | planned |
| SRC-AND-013 | TDoATriangulator | `android/app/src/main/java/uk/apex/sentinel/triangulation/TDoATriangulator.kt` | W2 | planned |
| SRC-AND-014 | KalmanTracker | `android/app/src/main/java/uk/apex/sentinel/tracking/KalmanTracker.kt` | W2 | planned |
| SRC-AND-015 | FusionModel | `android/app/src/main/java/uk/apex/sentinel/ml/FusionModel.kt` | W3 | planned |
| SRC-AND-016 | OfflineDetectionQueue (SQLite) | `android/app/src/main/java/uk/apex/sentinel/data/OfflineDetectionQueue.kt` | W3 | planned |
| SRC-AND-017 | SignalProtocolManager | `android/app/src/main/java/uk/apex/sentinel/security/SignalProtocolManager.kt` | W4 | planned |
| SRC-AND-018 | CertificatePinner | `android/app/src/main/java/uk/apex/sentinel/security/CertificatePinner.kt` | W4 | planned |

### iOS

| ID | Name | Path | Wave | Status |
|----|------|------|------|--------|
| SRC-IOS-001 | AcousticDetectionEngine | `ios/APEX-SENTINEL/Acoustic/AcousticDetectionEngine.swift` | W1 | planned |
| SRC-IOS-002 | TFLiteModelRunner | `ios/APEX-SENTINEL/ML/TFLiteModelRunner.swift` | W1 | planned |
| SRC-IOS-003 | DetectionRepository | `ios/APEX-SENTINEL/Data/DetectionRepository.swift` | W1 | planned |
| SRC-IOS-004 | NodeIdentityManager | `ios/APEX-SENTINEL/Data/NodeIdentityManager.swift` | W1 | planned |
| SRC-IOS-005 | AlertManager | `ios/APEX-SENTINEL/Alert/AlertManager.swift` | W1 | planned |
| SRC-IOS-006 | BLEMeshRelay | `ios/APEX-SENTINEL/Mesh/BLEMeshRelay.swift` | W2 | planned |
| SRC-IOS-007 | OfflineDetectionQueue | `ios/APEX-SENTINEL/Data/OfflineDetectionQueue.swift` | W3 | planned |

### Dashboard (React / TypeScript)

| ID | Name | Path | Wave | Status |
|----|------|------|------|--------|
| SRC-WEB-001 | DetectionService | `src/services/DetectionService.ts` | W1 | planned |
| SRC-WEB-002 | NodeService | `src/services/NodeService.ts` | W1 | planned |
| SRC-WEB-003 | MapLibreMap component | `src/components/MapLibreMap.tsx` | W1 | planned |
| SRC-WEB-004 | DetectionList component | `src/components/DetectionList.tsx` | W1 | planned |
| SRC-WEB-005 | supabaseClient | `src/lib/supabase.ts` | W1 | planned |
| SRC-WEB-006 | CesiumTrackViewer component | `src/components/CesiumTrackViewer.tsx` | W3 | planned |
| SRC-WEB-007 | OpenMCTPlugin | `src/plugins/apex-sentinel-openmct.js` | W3 | planned |
| SRC-WEB-008 | CoTEventGenerator | `supabase/functions/cot-generator/index.ts` | W4 | planned |
| SRC-WEB-009 | OpenSkyCorrelator | `supabase/functions/opensky-correlator/index.ts` | W4 | planned |

---

## Section 2: ML Model Artifacts

| ID | Name | Path | Size | Wave | Status | Source |
|----|------|------|------|------|--------|--------|
| MODEL-001 | YAMNet TFLite (embedding) | `android/app/src/main/assets/yamnet_classification.tflite` | 480KB | W1 | planned | TF Hub `google/yamnet/1` |
| MODEL-002 | YAMNet TFLite (iOS copy) | `ios/APEX-SENTINEL/Resources/yamnet_classification.tflite` | 480KB | W1 | planned | Same as MODEL-001 |
| MODEL-003 | Acoustic binary classifier head | `android/app/src/main/assets/drone_classifier_head.tflite` | ≤ 50KB | W1 | planned | Train from DroneAudioDataset |
| MODEL-004 | RF anomaly classifier | `android/app/src/main/assets/rf_classifier.tflite` | ≤ 50KB | W3 | planned | Train from DroneRF dataset |
| MODEL-005 | Late fusion head | `android/app/src/main/assets/fusion_head.tflite` | ≤ 50KB | W3 | planned | Train from combined dataset |
| MODEL-006 | Track prediction LSTM | `android/app/src/main/assets/track_predictor.tflite` | ≤ 200KB | Post-W4 | planned | Train from deployment data |

### Model Download Commands

```bash
# MODEL-001: YAMNet TFLite
curl -L "https://storage.googleapis.com/download.tensorflow.org/models/tflite/task_library/audio_classification/android/yamnet_int8.tflite" \
  -o android/app/src/main/assets/yamnet_classification.tflite

# Verify checksum
sha256sum android/app/src/main/assets/yamnet_classification.tflite
# Expected: [record actual checksum after first download]

# MODEL-003: Train acoustic classifier head (Python)
python3 scripts/train_drone_classifier.py \
  --base_model android/app/src/main/assets/yamnet_classification.tflite \
  --dataset tests/fixtures/audio/ \
  --output android/app/src/main/assets/drone_classifier_head.tflite \
  --epochs 20 \
  --batch_size 32
```

---

## Section 3: Datasets

| ID | Name | Location | Size (est.) | License | Wave | Status |
|----|------|----------|-------------|---------|------|--------|
| DS-001 | DroneAudioDataset | `tests/fixtures/audio/` (local) | ~500MB | Check: github.com/junzis/drone-audio-dataset | W1 | planned |
| DS-002 | DroneAudioDataset v2 | Kaggle: `sgluege/drone-audio-dataset-v2` | ~2GB | CC BY 4.0 (verify) | W1 | planned |
| DS-003 | DroneRF dataset | Kaggle: `sgluege/drone-rf-dataset` | ~1.2GB | CC BY 4.0 (verify) | W3 | planned |
| DS-004 | RFUAV dataset | University of Toulouse (paper: arXiv:2012.12060) | ~800MB | Academic, verify | W3 | planned |
| DS-005 | Synthetic ambient audio | `tests/fixtures/audio/ambient_*/` (generated) | ~200MB | Own | W1 | planned |
| DS-006 | Synthetic RF scan fixtures | `tests/fixtures/rf/` (generated) | ~50MB | Own | W1 | planned |
| DS-007 | OpenSky historical ADS-B | OpenSky Network API (live, no download) | N/A | OpenSky terms | W4 | planned |

### Dataset Download Commands

```bash
# DS-001: DroneAudioDataset (GitHub)
git clone https://github.com/junzis/drone-audio-dataset /tmp/drone-audio-dataset
cp -r /tmp/drone-audio-dataset/data/drone tests/fixtures/audio/drone_fpv_250hz_motor/
cp -r /tmp/drone-audio-dataset/data/noise tests/fixtures/audio/ambient_noise/

# DS-002: DroneAudioDataset v2 (Kaggle — requires kaggle CLI)
pip install kaggle
kaggle datasets download -d sgluege/drone-audio-dataset-v2 -p /tmp/
unzip /tmp/drone-audio-dataset-v2.zip -d tests/fixtures/audio/

# DS-003: DroneRF (Kaggle)
kaggle datasets download -d sgluege/drone-rf-dataset -p /tmp/
unzip /tmp/drone-rf-dataset.zip -d tests/fixtures/rf/
```

---

## Section 4: Supabase Migrations

| ID | Filename | Description | Wave | Status |
|----|----------|-------------|------|--------|
| MIG-001 | `001_create_detections.sql` | `detections` table + RLS + indexes | W1 | planned |
| MIG-002 | `002_create_nodes.sql` | `nodes` table + RLS + indexes | W1 | planned |
| MIG-003 | `003_create_node_health.sql` | `node_health` heartbeat table | W1 | planned |
| MIG-004 | `004_create_tracks.sql` | `tracks` table for Kalman track state | W2 | planned |
| MIG-005 | `005_create_mesh_nodes.sql` | `mesh_nodes` peer discovery table | W2 | planned |
| MIG-006 | `006_add_adsb_correlation.sql` | Add `adsb_correlation` column to `detections` | W4 | planned |
| MIG-007 | `007_create_cot_events.sql` | `cot_events` table for CoT log | W4 | planned |

### Migration Location

```
supabase/migrations/
├── 001_create_detections.sql
├── 002_create_nodes.sql
├── 003_create_node_health.sql
├── 004_create_tracks.sql         (W2)
├── 005_create_mesh_nodes.sql     (W2)
├── 006_add_adsb_correlation.sql  (W4)
└── 007_create_cot_events.sql     (W4)
```

---

## Section 5: API Keys and Secrets

**IMPORTANT: NEVER commit these to git. All keys in `.env.local` (gitignored).**

| ID | Key Name | Used By | Where to Obtain | Wave |
|----|----------|---------|-----------------|------|
| KEY-001 | `NEXT_PUBLIC_SUPABASE_URL` | Dashboard, tests | Supabase console → Settings → API | W1 |
| KEY-002 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Mobile clients, dashboard | Supabase console → Settings → API | W1 |
| KEY-003 | `SUPABASE_SERVICE_ROLE_KEY` | Integration tests, edge functions | Supabase console → Settings → API (secret) | W1 |
| KEY-004 | `OPENSKY_USERNAME` | OpenSky ADS-B correlator | register at opensky-network.org | W4 |
| KEY-005 | `OPENSKY_PASSWORD` | OpenSky ADS-B correlator | register at opensky-network.org | W4 |
| KEY-006 | `CESIUM_ION_ACCESS_TOKEN` | CesiumJS terrain tiles | cesium.com/ion → Access Tokens | W3 |
| KEY-007 | Android keystore password | APK signing | Generate + store in password manager | W1 |
| KEY-008 | iOS Distribution Certificate | IPA signing / TestFlight | Apple Developer Console | W1 |
| KEY-009 | `FREETAKSERVER_HOST` | CoT integration | Self-hosted FTS instance | W4 |
| KEY-010 | `FREETAKSERVER_PORT` | CoT integration | Default: 8087 (TCP) | W4 |
| KEY-011 | Supabase project ref | `bymfcnwfyxuivinuzurr` | Project ID | W1 |

### .env.local Template

```bash
# .env.local — NEVER COMMIT
NEXT_PUBLIC_SUPABASE_URL=https://bymfcnwfyxuivinuzurr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from_supabase_console>
SUPABASE_SERVICE_ROLE_KEY=<from_supabase_console>
NEXT_PUBLIC_MAP_CENTER="0.0,-0.1278"
NEXT_PUBLIC_MAP_ZOOM="12"
CESIUM_ION_ACCESS_TOKEN=<from_cesium_ion>
OPENSKY_USERNAME=<opensky_username>
OPENSKY_PASSWORD=<opensky_password>
FREETAKSERVER_HOST=<fts_host>
FREETAKSERVER_PORT=8087
```

### Android `local.properties` (gitignored)

```properties
# android/local.properties — NEVER COMMIT
SUPABASE_URL=https://bymfcnwfyxuivinuzurr.supabase.co
SUPABASE_ANON_KEY=<from_supabase_console>
```

---

## Section 6: Docker Images

| ID | Image Name | Dockerfile | Wave | Status |
|----|-----------|------------|------|--------|
| IMG-001 | `apex-sentinel/dashboard:latest` | `Dockerfile.dashboard` | W1 | planned |
| IMG-002 | `apex-sentinel/freetakserver:2.1` | `infra/freetakserver/Dockerfile` | W4 | planned |
| IMG-003 | `apex-sentinel/grafana:latest` | Uses official `grafana/grafana:10.x` | W3 | planned |
| IMG-004 | `apex-sentinel/wazuh-manager:4.7` | Uses official `wazuh/wazuh-manager:4.7` | W3 | planned |

### Docker Registry

```
Registry: ghcr.io/apex-sentinel/
Full image refs:
  ghcr.io/apex-sentinel/dashboard:v1.0.0
  ghcr.io/apex-sentinel/freetakserver:2.1
```

---

## Section 7: Mobile Build Artifacts

### Android

| ID | Artifact | Path | Wave | Notes |
|----|----------|------|------|-------|
| APK-001 | Debug APK | `android/app/build/outputs/apk/debug/app-debug.apk` | W1 | Dev testing |
| APK-002 | Release APK (signed) | `android/app/build/outputs/apk/release/app-release.apk` | W1 | Distribution |
| APK-003 | Android App Bundle | `android/app/build/outputs/bundle/release/app-release.aab` | W1 | Play Store / Enterprise MDM |

```bash
# Build release APK
cd android/
./gradlew assembleRelease

# Build release AAB
./gradlew bundleRelease

# Sign APK (if not configured in build.gradle)
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore keystore/apex-sentinel.jks \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  apex-sentinel-key
```

### iOS

| ID | Artifact | Path | Wave | Notes |
|----|----------|------|------|-------|
| IPA-001 | Debug IPA | `ios/build/APEX-SENTINEL-debug.ipa` | W1 | Dev testing |
| IPA-002 | TestFlight IPA | `ios/build/APEX-SENTINEL-tf.ipa` | W1 | TestFlight distribution |
| IPA-003 | Release IPA | `ios/build/APEX-SENTINEL-release.ipa` | W4 | Enterprise distribution |

```bash
# Build for TestFlight
xcodebuild -scheme APEX-SENTINEL \
  -configuration Release \
  -archivePath ios/build/APEX-SENTINEL.xcarchive \
  archive

xcodebuild -exportArchive \
  -archivePath ios/build/APEX-SENTINEL.xcarchive \
  -exportOptionsPlist ios/ExportOptions-TestFlight.plist \
  -exportPath ios/build/
```

---

## Section 8: External Integrations and Libraries

| ID | Name | Version | License | Used By | Wave |
|----|------|---------|---------|---------|------|
| EXT-001 | TensorFlow Lite (Android) | 2.14.0 | Apache 2.0 | AcousticDetectionEngine, FusionModel | W1 |
| EXT-002 | TensorFlowLiteSwift | 2.14.0 | Apache 2.0 | iOS AcousticDetectionEngine | W1 |
| EXT-003 | Supabase Kotlin | 2.x | Apache 2.0 | Android repositories | W1 |
| EXT-004 | Supabase-js | 2.x | MIT | Dashboard | W1 |
| EXT-005 | MapLibre GL JS | 4.x | BSD-3-Clause | Dashboard map | W1 |
| EXT-006 | react-map-gl | 7.x | MIT | Dashboard MapLibre wrapper | W1 |
| EXT-007 | WebRTC VAD (Android) | 1.0.x | BSD-3-Clause | Audio gate | W1 |
| EXT-008 | Meshtastic Android SDK | 2.3.x | GPL-3.0 | MeshManager | W2 |
| EXT-009 | Google Nearby Connections | 18.x | Google APIs | NearbyConnectionsManager | W2 |
| EXT-010 | CesiumJS | 1.115+ | Apache 2.0 | Dashboard 3D track view | W3 |
| EXT-011 | Resium | 1.17+ | MIT | React + CesiumJS wrapper | W3 |
| EXT-012 | OpenMCT | 2.x | Apache 2.0 | Telemetry dashboard | W3 |
| EXT-013 | FreeTAKServer | 2.1.x | GPL-3.0 | CoT relay | W4 |
| EXT-014 | libsignal-protocol-java | 0.x | GPL-3.0 | Signal Protocol encryption | W4 |
| EXT-015 | YAMNet (TF Hub) | 1 | Apache 2.0 | Base embedding model | W1 |
| EXT-016 | Grafana | 10.x | AGPL-3.0 | System monitoring | W3 |
| EXT-017 | Wazuh | 4.7.x | GPL-2.0 | SIEM | W3 |
| EXT-018 | Suricata | 7.x | GPL-2.0 | IDS | W3 |
| EXT-019 | OpenSky Network API | REST | OpenSky terms | ADS-B correlation | W4 |

**License flag:** Meshtastic (GPL-3.0), FreeTAKServer (GPL-3.0), libsignal-protocol-java (GPL-3.0) — GPL copyleft applies. Distribution of modified versions requires source disclosure. Consult legal for commercial deployment.

---

## Section 9: GitHub Repositories

| ID | Repo | URL | Status |
|----|------|-----|--------|
| REPO-001 | Main repo | `github.com/apex-sentinel/apex-sentinel` | active |
| REPO-002 | Dashboard (if separate) | `github.com/apex-sentinel/apex-sentinel-dashboard` | TBD |
| REPO-003 | Infra / IaC | `github.com/apex-sentinel/apex-sentinel-infra` | TBD |

---

## Section 10: Deployment Targets

| ID | Target | Provider | Wave | URL |
|----|--------|----------|------|-----|
| DEPLOY-001 | Dashboard staging | Vercel | W1 | `apex-sentinel-staging.vercel.app` |
| DEPLOY-002 | Dashboard production | Vercel | W1 | `dashboard.apex-sentinel.uk` (TBD) |
| DEPLOY-003 | Supabase (all envs) | Supabase Cloud | W1 | `bymfcnwfyxuivinuzurr.supabase.co` |
| DEPLOY-004 | Grafana | Self-hosted / Grafana Cloud | W3 | `grafana.apex-sentinel.uk` (TBD) |
| DEPLOY-005 | FreeTAKServer | Self-hosted Linux (Docker) | W4 | `fts.apex-sentinel.uk` (TBD) |
| DEPLOY-006 | Wazuh Manager | Self-hosted Linux | W3 | Internal only |

---

## Artifact Status Summary — Wave 1

```
COMPLETE:   0 / 18 source artifacts
COMPLETE:   0 / 2 model artifacts (MODEL-001, MODEL-003)
COMPLETE:   0 / 3 migrations (MIG-001, MIG-002, MIG-003)
COMPLETE:   0 / 11 API keys configured
COMPLETE:   0 / 3 APK builds
```

---

*Registry owner: Nico Fratila. Updated each time an artifact is created or its status changes.*
