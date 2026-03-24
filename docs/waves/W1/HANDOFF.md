# APEX-SENTINEL — Engineer Handoff Document
# FILE 17 of 20 — HANDOFF.md
# For any engineer picking up this project cold

---

## 1. What Is APEX-SENTINEL?

APEX-SENTINEL is a distributed civilian smartphone sensor network for detecting FPV drones
and Shahed-class loitering munitions using two complementary passive sensing modalities:

1. **Acoustic detection** — YAMNet TFLite ML model running on-device, listening for the
   characteristic motor/propeller signatures of FPV drones (100-600Hz fundamental range)
   and Shahed-class UAVs (50-200Hz prop wash).

2. **RF/EMF anomaly detection** — Passive WiFi energy scanning via Android WifiManager /
   iOS Core Location, detecting the RF control link signatures (2.4GHz, 5.8GHz) and telemetry
   patterns associated with drone operation.

Multiple smartphones (nodes) form a mesh network via Meshtastic + BLE + Google Nearby
Connections. When a detection occurs on multiple nodes, time-difference-of-arrival (TDoA)
triangulation computes a ±62m accuracy location fix. Detection events stream to a Supabase
Realtime backend and are displayed on a C2 (Command & Control) dashboard using CesiumJS for
3D terrain-aware visualization.

---

## 2. Why Does This Exist?

### The Threat

Romania sits on NATO's Eastern Flank. FPV drone attacks on civilian infrastructure have
occurred in Moldova and Ukraine within 150km of Romanian territory. Shahed-136/131 loitering
munitions have been tracked entering Romanian airspace. The Romanian military air defense
system (PATRIOT, HAWK) is not designed to detect low-altitude, low-speed FPV threats at
civilian infrastructure scale.

### The Gap

No civilian early warning capability exists. INDIGO AirGuard (Israeli startup) demonstrated
the concept works: 87% acoustic detection accuracy, ±62m triangulation with 3+ nodes, 156ms
inference latency. Their system is being commercialized at a price point that excludes NGOs,
local municipalities, and civilian volunteers.

### APEX-SENTINEL's Approach

Replicate and open-source the INDIGO AirGuard proof-of-concept as a free, civilian,
community-deployable detection network. Primary deployment targets: Romanian border regions,
Ukrainian refugee processing centers, NATO partner civil defense organizations.

---

## 3. Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SENSOR LAYER (Edge)                          │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐   │
│  │ Android Node │   │  iOS Node    │   │  Standalone IoT Node │   │
│  │ (Kotlin)     │   │  (Swift)     │   │  (Raspberry Pi/W3)   │   │
│  │ AudioRecord  │   │  AVAudio     │   │  USB Microphone      │   │
│  │ YAMNet TFLite│   │  CoreML      │   │  Python TFLite       │   │
│  │ WifiManager  │   │  CoreWLAN    │   │  RF SDR (W3)         │   │
│  │ GPS FusedLoc │   │  CoreLocation│   │  GPS HAT             │   │
│  └──────┬───────┘   └──────┬───────┘   └──────────┬───────────┘   │
│         │                  │                        │               │
│         └─────────── MESH NETWORK ─────────────────┘               │
│              Meshtastic (LoRa) + BLE + Google Nearby                │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Detection Events (JSON over HTTPS)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND (Supabase eu-west-2)                     │
│                                                                     │
│  PostgreSQL (detection_events, sensor_nodes, rf_readings)          │
│  Row Level Security (anon ingestion, authenticated read)           │
│  Realtime WebSocket (live event stream to C2)                      │
│  Edge Functions (TDoA triangulation, alert dispatch)               │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ WebSocket + REST
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   C2 DASHBOARD (React + TypeScript)                  │
│                                                                     │
│  CesiumJS — 3D terrain, node positions, threat vectors             │
│  MapLibre GL — 2D tactical overlay                                 │
│  OpenMCT — telemetry timeline (battery, inference latency)         │
│  FreeTAKServer — COT relay to ATAK clients                         │
│  Grafana — operational metrics (Prometheus)                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Repository Structure

```
apex-sentinel/
├── android/                          # Android Kotlin app
│   ├── app/
│   │   ├── src/main/kotlin/io/apexos/sentinel/
│   │   │   ├── audio/                # AudioCapture, VadFilter
│   │   │   ├── dsp/                  # FftAnalyzer
│   │   │   ├── ml/                   # YamNetInference, TfliteInterpreterImpl
│   │   │   ├── rf/                   # WifiScanner, RfAnomalyClassifier
│   │   │   ├── location/             # GpsMetadataProvider
│   │   │   ├── data/                 # DetectionIngester, SupabaseRepository
│   │   │   ├── calibration/          # CalibrationRoutine
│   │   │   ├── mesh/                 # MeshtasticBridge, NearbyConnectionsManager (W2)
│   │   │   └── ui/                   # Compose screens
│   │   └── src/main/assets/models/   # YAMNet TFLite + RF classifier
├── ios/                              # iOS Swift app
│   └── ApexSentinel/
│       └── Sources/
│           ├── Audio/                # AudioCapture (AVAudioEngine)
│           ├── ML/                   # YamNetInference (CoreML)
│           ├── Data/                 # SupabaseClient, DetectionIngester
│           ├── Location/             # CoreLocation wrapper
│           └── UI/                   # SwiftUI screens
├── c2-dashboard/                     # React TypeScript C2
│   ├── src/
│   │   ├── components/
│   │   │   ├── CesiumMap/            # 3D terrain view
│   │   │   ├── MapLibreOverlay/      # 2D tactical overlay
│   │   │   ├── AlertBanner/          # Detection alert UI
│   │   │   └── NodeStatus/           # Sensor node grid
│   │   └── lib/
│   │       ├── supabase/             # Supabase client + realtime
│   │       └── freetakserver/        # COT relay client
├── supabase/
│   └── migrations/                   # All schema DDL (ordered)
├── ml/
│   ├── training/                     # YAMNet fine-tuning scripts
│   ├── conversion/                   # TFLite + CoreML export
│   └── evaluation/                   # Accuracy benchmarks
├── infra/
│   ├── docker-compose.yml            # FreeTAKServer + Grafana + Prometheus
│   └── freetakserver/
├── docs/
│   └── waves/W1/ through W4/
└── scripts/
    ├── wave-formation.sh
    └── reuse-scan.sh
```

---

## 5. How to Run Locally

### 5a. Prerequisites

```bash
# macOS (primary dev OS)
brew install node@22 python@3.12 supabase-cli

# Android SDK (via Android Studio or CLI)
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools

# Java 21
brew install --cask temurin@21

# Python ML dependencies
pip install tensorflow==2.19.* tensorflow-hub tflite-model-maker
```

### 5b. Supabase (local dev or remote)

```bash
# Option A: Remote (preferred)
export SUPABASE_PROJECT_REF=bymfcnwfyxuivinuzurr
export SUPABASE_ANON_KEY=$(op read "op://Private/apex-sentinel-supabase/anon_key")
supabase link --project-ref $SUPABASE_PROJECT_REF
supabase db push

# Option B: Local
supabase start
# Local URL: http://localhost:54321
# Local anon key: printed by `supabase start`
```

### 5c. Android App

```bash
cd android

# Add local.properties (gitignored)
echo "SUPABASE_ANON_KEY=your_key_here" >> local.properties

# Build debug APK
./gradlew assembleDebug

# Install on connected device / emulator
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Or run via Android Studio
```

### 5d. iOS App

```bash
cd ios
pod install   # if using CocoaPods
open ApexSentinel.xcworkspace  # or .xcodeproj if SPM

# Build for simulator
xcodebuild -scheme ApexSentinel \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  build
```

### 5e. C2 Dashboard

```bash
cd c2-dashboard
npm ci

# Add .env.local
cat > .env.local << 'EOF'
VITE_SUPABASE_URL=https://bymfcnwfyxuivinuzurr.supabase.co
VITE_SUPABASE_ANON_KEY=your_key_here
VITE_CESIUMION_TOKEN=your_cesium_ion_token
VITE_FTS_HOST=localhost
VITE_FTS_COT_PORT=8087
EOF

npm run dev   # http://localhost:5173
```

### 5f. FreeTAKServer (Docker)

```bash
cd infra
docker compose up -d freetakserver

# Verify
curl http://localhost:19023/api/v1/info
```

---

## 6. How to Run Tests

### Android

```bash
cd android

# Unit tests (JVM — fast)
./gradlew :app:test

# With coverage
./gradlew :app:jacocoTestReport
# Report: app/build/reports/jacoco/

# Instrumented tests (requires device/emulator)
./gradlew :app:connectedAndroidTest
```

### iOS

```bash
cd ios
xcodebuild test \
  -scheme ApexSentinelTests \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -resultBundlePath TestResults.xcresult
```

### C2 Dashboard

```bash
cd c2-dashboard
npx vitest run --coverage
npx playwright test
```

### All (CI gate)

```bash
# Root-level gate script
./scripts/verify-all.sh
```

---

## 7. Key Contacts

| Role               | Name              | Contact                   |
|--------------------|-------------------|---------------------------|
| Founder / Tech Lead| Nicolae Fratila   | nico@apexos.io            |
| ML Engineering     | TBD               | (W2 hire/contractor)      |
| iOS Lead           | TBD               | (W1 contractor)           |
| FreeTAKServer SME  | FreeTAK community | https://freetakserver.org |
| Supabase support   | Supabase team     | Project: bymfcnwfyxuivinuzurr |

---

## 8. Key Decisions Already Made (Do Not Re-Open)

### DEC-01: YAMNet as base acoustic model
**Decision:** Use Google YAMNet (AudioSet-trained, 521 classes) fine-tuned on FPV/Shahed
acoustic data. Not training from scratch.
**Rationale:** INDIGO AirGuard demonstrated 87% accuracy with this approach. 480KB model
fits on Android minSdk 26. 156ms inference validated on Snapdragon 765G.
**Do not change to:** Whisper, wav2vec, custom CNN.

### DEC-02: Supabase as primary backend
**Decision:** Supabase (bymfcnwfyxuivinuzurr, eu-west-2 London).
**Rationale:** Realtime WebSocket out-of-the-box, Row Level Security for GDPR, Edge Functions
for TDoA computation, 1-click GDPR data residency in EU.
**Do not change to:** Firebase (US data residency), custom backend (resource constraint).

### DEC-03: Meshtastic for mesh (not WiFi Direct)
**Decision:** Meshtastic over LoRa hardware as primary mesh backhaul. Google Nearby
Connections as BLE fallback for mesh.
**Rationale:** LoRa achieves 10-15km range at 50-250 bps (enough for detection event
metadata). WiFi Direct is 100m max. Meshtastic has active military-adjacent community in
Romania/Ukraine.
**Do not change to:** WiFi Direct only, ZigBee, custom 900MHz.

### DEC-04: FreeTAKServer for ATAK integration
**Decision:** FreeTAKServer 2.1 for COT (Cursor-on-Target) relay to ATAK clients.
**Rationale:** ATAK is the de facto standard for NATO partner tactical situational awareness.
FreeTAKServer is the only mature open-source COT relay. Military liaison requirement.
**Do not change to:** Custom WebSocket protocol, MQTT only.

### DEC-05: CesiumJS + MapLibre (not Leaflet / Google Maps)
**Decision:** CesiumJS for 3D terrain, MapLibre GL for 2D overlay.
**Rationale:** CesiumJS handles terrain-aware threat vector rendering (drone trajectory over
terrain). MapLibre is open-source, no API key lock-in, supports Romania's official ANCPI
tile sources.

### DEC-06: minSdk = 26 (Android 8.0)
**Decision:** minSdk 26 (Android 8.0, released 2017).
**Rationale:** AudioRecord API has consistent 16kHz mono support from API 21, but NNAPI
(used for TFLite acceleration) is stable from API 27 — API 26 as floor gives maximum
device coverage in Romania (>95% of devices) while keeping NNAPI opt-in.

### DEC-07: INT8 quantized TFLite model
**Decision:** Post-training INT8 quantization of YAMNet.
**Rationale:** Reduces 480KB model → ~220KB for older devices. Inference speed improves
1.5-2x. Accuracy degradation <1% on drone/no-drone classification.

---

## 9. What NOT to Change and Why

| Area                        | Do NOT change                        | Why                                             |
|-----------------------------|--------------------------------------|-------------------------------------------------|
| Supabase project ID         | bymfcnwfyxuivinuzurr                 | All migrations, RLS policies, production data   |
| Model input format          | 15600 samples @ 16kHz float32        | YAMNet requirement — changing breaks everything |
| DetectionEvent schema       | lat/lon/confidence/detected_at keys  | C2 dashboard + FreeTAKServer hardcoded on these |
| Supabase region             | eu-west-2 (London)                   | GDPR — EU data residency legal requirement      |
| FreeTAKServer COT port      | TCP 8087                             | ATAK default — changing breaks field integration|
| AudioRecord sample rate     | 16000 Hz                             | YAMNet trained on 16kHz — others degrade 87% acc|
| TDD methodology             | vitest + XCTest + Robolectric        | Non-negotiable project standard (MEMORY.md)     |

---

## 10. Environment Variables / Secrets

Required secrets (never commit — use 1Password or local.properties):

| Secret                    | Used by          | How to get                                  |
|---------------------------|------------------|---------------------------------------------|
| SUPABASE_ANON_KEY         | Android, iOS, C2 | Supabase dashboard → Project Settings → API |
| SUPABASE_SERVICE_ROLE_KEY | Edge Functions   | Supabase dashboard → Project Settings → API |
| SUPABASE_DB_URL           | Migrations       | Supabase dashboard → Project Settings → DB  |
| CESIUMION_TOKEN           | C2 CesiumJS      | https://cesium.com/ion/ (free tier)         |
| TELEGRAM_BOT_TOKEN        | Alert dispatch   | @BotFather                                  |
| SUPABASE_PAT              | DDL migrations   | Supabase dashboard → Account → Access Tokens|

---

## 11. Glossary of Domain Terms

| Term              | Definition                                                                          |
|-------------------|-------------------------------------------------------------------------------------|
| **FPV**           | First-Person View drone. Radio-controlled drone with live video feed to pilot's      |
|                   | goggles. Used extensively in Ukraine conflict as improvised munition carrier.         |
|                   | Typical range: 3-10km. Motor signature: 150-500Hz fundamental frequency.            |
| **Shahed**        | Shahed-136/131/238 series Iranian-designed loitering munitions ("kamikaze drones")   |
|                   | supplied to Russia. Propeller-driven, ~200km range, 50kg warhead. Very low radar     |
|                   | cross-section. Acoustic signature: 50-200Hz prop wash, distinctive "moped" sound.   |
| **TDoA**          | Time Difference of Arrival. Triangulation method using the time delay between when   |
|                   | the same acoustic event reaches different sensor nodes. Requires GPS-synchronized     |
|                   | timestamps (±1ms accuracy) across nodes. Produces hyperbolic position estimate.      |
|                   | With 3+ nodes: ±62m accuracy validated by INDIGO AirGuard.                          |
| **RSSI**          | Received Signal Strength Indicator. Measured in dBm. Used in RF/EMF sensor to        |
|                   | detect anomalous WiFi energy patterns associated with drone control links.            |
| **COT**           | Cursor-on-Target. XML-based message format developed by DARPA/US Air Force for        |
|                   | real-time tactical data sharing. Used by ATAK. Each message: entity type, position,  |
|                   | time, remarks. Threat events map to COT type "a-u-A" (unknown air).                 |
| **ATAK**          | Android Team Awareness Kit. US military / NATO partner tactical situational awareness  |
|                   | Android application. Widely deployed by NATO Eastern Flank forces and civilian        |
|                   | defense organizations in Romania/Poland/Baltic states.                               |
| **YAMNet**        | Yet Another Multipurpose Network. Google AudioSet-pretrained deep neural network      |
|                   | for audio classification. 521 output classes. Input: 0.975s mono 16kHz waveform.    |
|                   | Used as backbone — fine-tuned to binary drone/no-drone classification.               |
| **TFLite**        | TensorFlow Lite. Google's on-device ML inference runtime for mobile (Android API 19+, |
|                   | iOS via TFLite-Swift). Supports INT8 quantization, NNAPI delegation, GPU delegation.  |
| **LoRa**          | Long Range. Spread-spectrum radio modulation for low-power wide-area networking.       |
|                   | 10-15km range, 50-250 bps. Used by Meshtastic for mesh detection event relay.        |
| **Meshtastic**    | Open-source LoRa mesh networking project. Android/iOS apps + firmware for common      |
|                   | LoRa hardware (TTGO T-Beam, Heltec WiFi LoRa 32). Protocol: Protobuf over LoRa.     |
| **INDIGO AirGuard**| Israeli acoustic drone detection startup. Demonstrated the key technical proof-of-   |
|                   | concept that APEX-SENTINEL builds on: 87% accuracy, ±62m triangulation, 156ms       |
|                   | inference, 480KB model. Transitioning to commercial product.                         |
| **VAD**           | Voice Activity Detection. Algorithm to distinguish audio signal (speech or other       |
|                   | sound) from silence/background noise. APEX-SENTINEL uses WebRTC VAD to suppress      |
|                   | empty audio frames before ML inference, reducing CPU load.                           |
| **FFT**           | Fast Fourier Transform. Transforms time-domain PCM audio into frequency-domain        |
|                   | magnitude spectrum. Used to extract spectral features (band energy, centroid, flux)   |
|                   | for both ML preprocessing and the RF anomaly classifier.                             |
| **RLS**           | Row Level Security. Supabase/PostgreSQL feature that enforces per-row access policies  |
|                   | at the database level. Anon key → insert-only on detection_events. Auth key → full    |
|                   | read. Prevents data exfiltration by compromised sensor nodes.                        |
| **COT Event Type**| ATAK event type string. Drone threat: "a-u-A-C-F" (unknown air, civilian, fixed-     |
|                   | wing). FPV threat: "a-u-A-M-F-Q" (unknown air, military, quad-rotor estimate).      |
| **NNAPI**         | Android Neural Networks API. Hardware-accelerated ML inference API (API 27+). TFLite   |
|                   | uses NNAPI delegate for 2-4x speedup on Snapdragon DSP vs CPU-only inference.        |
| **Edge Function** | Supabase serverless function (Deno runtime). Used for TDoA triangulation computation   |
|                   | when 3+ simultaneous detections arrive within 5-second window.                       |

---

## 12. First-Day Checklist for New Engineer

```
[ ] Clone repo: git clone https://github.com/apex-sentinel/apex-sentinel
[ ] Read: docs/waves/W1/DESIGN.md (full system design)
[ ] Read: docs/waves/W1/PRD.md (product requirements)
[ ] Read: docs/waves/W1/ARCHITECTURE.md (technical architecture)
[ ] Read: docs/waves/W1/FR_REGISTER.md (functional requirements)
[ ] Read: docs/waves/W1/RISK_REGISTER.md (known risks)
[ ] Set up: Android Studio (Koala+), JDK 21, Android SDK 35
[ ] Set up: Xcode 16+, CocoaPods 1.16+
[ ] Set up: Node 22, npm 10
[ ] Set up: Supabase CLI (supabase login)
[ ] Get secrets from Nicolae: SUPABASE_ANON_KEY, CESIUMION_TOKEN
[ ] Run Android tests: ./gradlew :app:test — all green
[ ] Run iOS tests: xcodebuild test — all green
[ ] Run C2 dashboard: cd c2-dashboard && npm run dev
[ ] Verify Supabase connection: insert a test detection_event via PostgREST
[ ] Read this entire HANDOFF.md again
```

---

## 13. Current Wave Status

| Wave | Scope                                              | Status       |
|------|----------------------------------------------------|--------------|
| W1   | Android single-node acoustic detection + iOS lite  | IN PROGRESS  |
| W2   | Mesh networking (Meshtastic + Nearby Connections)  | PLANNED      |
| W3   | TDoA triangulation + C2 dashboard                 | PLANNED      |
| W4   | Security hardening + ATAK/COT integration + field | PLANNED      |

---

*Document owner: Nicolae Fratila | Last updated: 2026-03-24*
*This document must be updated at every wave:complete gate.*
