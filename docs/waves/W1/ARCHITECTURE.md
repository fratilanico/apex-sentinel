# APEX-SENTINEL — ARCHITECTURE.md
## Full System Architecture
### Wave 1 | Project: APEX-SENTINEL | Version: 1.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. ARCHITECTURAL OVERVIEW

APEX-SENTINEL is a 4-layer distributed detection and command system:

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 4: C2 COMMAND & CONTROL                                 │
│  React + CesiumJS + MapLibre GL + OpenMCT + FreeTAKServer      │
│  Deployed: Vercel Edge / Self-hosted nginx                      │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 3: FUSION & BACKEND                                     │
│  Supabase (PostgreSQL + Realtime + Edge Functions)             │
│  Triangulation Engine (Deno/Node) + Track Manager              │
│  Deployed: Supabase Cloud (West Europe / London)               │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 2: MESH NETWORK                                         │
│  LoRa / Meshtastic + BLE 5.x + Google Nearby Connections      │
│  Point-to-point and multi-hop relay                            │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 1: DEVICE DETECTION (MOBILE NODES)                      │
│  Android (Kotlin) — RF + Acoustic primary                      │
│  iOS (Swift) — Acoustic + Relay                                │
│  On-device TFLite / CoreML inference                           │
└─────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Defense-in-depth**: System remains useful at any level of connectivity from fully isolated to fully connected
2. **Privacy by architecture**: Raw sensor data physically cannot leave the device — only inference scores
3. **Eventual consistency**: Distributed detections converge on a consistent threat picture, accepting delay for resilience
4. **Fail-open for detection**: Detection continues regardless of backend state
5. **Fail-secure for authority**: Alert escalation and COT export require authenticated backend

---

## 2. COMPONENT DIAGRAM

```
╔══════════════════════════════════════════════════════════════════╗
║  APEX-SENTINEL COMPONENT DIAGRAM                                ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  ┌──────────────────────────────────────────────────────────┐   ║
║  │ MOBILE NODES (Android)           [N = 1M+ instances]    │   ║
║  │                                                          │   ║
║  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │   ║
║  │  │ AudioEngine │  │  RFScanner  │  │  MeshManager    │ │   ║
║  │  │ (Kotlin)    │  │  (Kotlin)   │  │  (LoRa/BLE/     │ │   ║
║  │  │             │  │             │  │   Nearby)        │ │   ║
║  │  │ 44.1kHz PCM │  │ WiFi RSSI   │  │                 │ │   ║
║  │  │ → Mel spec  │  │ per channel │  │  LoRaModule ◄─┐ │ │   ║
║  │  │ → YAMNet    │  │ → anomaly   │  │  BLE5 beacon  │ │ │   ║
║  │  │ → TFLite    │  │   scorer    │  │  GNC relay    │ │ │   ║
║  │  └──────┬──────┘  └──────┬──────┘  └──────┬────────┘ │ │   ║
║  │         │                │                │           │ │   ║
║  │         └────────────────┼────────────────┘           │ │   ║
║  │                          ▼                            │ │   ║
║  │                  ┌─────────────┐                      │ │   ║
║  │                  │FusionEngine │                      │ │   ║
║  │                  │ TFLite MLP  │                      │ │   ║
║  │                  │ (<50KB)     │                      │ │   ║
║  │                  └──────┬──────┘                      │ │   ║
║  │                         │                             │ │   ║
║  │              ┌──────────┴──────────┐                  │ │   ║
║  │              ▼                     ▼                  │ │   ║
║  │  ┌─────────────────┐  ┌─────────────────┐            │ │   ║
║  │  │  EventQueue     │  │   AlertReceiver  │            │ │   ║
║  │  │  (local SQLite) │  │  (Realtime WS)  │            │ │   ║
║  │  │  → HTTP/HTTPS   │  │  → Notification │            │ │   ║
║  │  └────────┬────────┘  └─────────────────┘            │ │   ║
║  └───────────┼──────────────────────────────────────────┘ │   ║
║              │ HTTPS / TLS 1.3                            │   ║
╠══════════════╪════════════════════════════════════════════╪════╣
║  MESH LAYER  │                                            │   ║
║              ▼                                            │   ║
║  ┌──────────────────────────┐  LoRa 868MHz               │   ║
║  │  Meshtastic LoRa Relay   │◄──────────────────────────┘   ║
║  │  (optional hardware)     │                                ║
║  │  TTL-3 hop routing       │                                ║
║  └──────────┬───────────────┘                                ║
║             │                                                ║
╠═════════════╪════════════════════════════════════════════════╣
║  BACKEND     │   HTTPS / Supabase Realtime WebSocket         ║
║              ▼                                               ║
║  ┌──────────────────────────────────────────────────────┐   ║
║  │  SUPABASE  (project: bymfcnwfyxuivinuzurr)          │   ║
║  │                                                      │   ║
║  │  ┌──────────────────┐  ┌──────────────────────────┐ │   ║
║  │  │ Edge Functions   │  │  PostgreSQL + PostGIS     │ │   ║
║  │  │                  │  │                          │ │   ║
║  │  │ /ingest-event    │  │  nodes                   │ │   ║
║  │  │ /register-node   │  │  detection_events        │ │   ║
║  │  │ /triangulate     │  │  tracks                  │ │   ║
║  │  │ /alert-manage    │  │  alerts                  │ │   ║
║  │  │ /model-update    │  │  calibrations            │ │   ║
║  │  │ /cot-export      │  │  mesh_topology           │ │   ║
║  │  └──────────────────┘  └──────────────────────────┘ │   ║
║  │                                                      │   ║
║  │  ┌──────────────────────────────────────────────┐   │   ║
║  │  │  Supabase Realtime                           │   │   ║
║  │  │  Channels: alerts:{h3_cell}                 │   │   ║
║  │  │            tracks:global                    │   │   ║
║  │  │            nodes:health                     │   │   ║
║  │  └──────────────────────────────────────────────┘   │   ║
║  └──────────────────────────────────────────────────────┘   ║
║              │                                               ║
║              │  WebSocket + REST                             ║
╠══════════════╪══════════════════════════════════════════════╣
║  C2 LAYER    │                                               ║
║              ▼                                               ║
║  ┌──────────────────────────────────────────────────────┐   ║
║  │  C2 DASHBOARD  (React SPA)                          │   ║
║  │                                                      │   ║
║  │  ┌────────────┐ ┌────────────┐ ┌──────────────────┐ │   ║
║  │  │ CesiumJS   │ │ MapLibre   │ │ OpenMCT Strip    │ │   ║
║  │  │ 3D Globe   │ │ 2D Tactical│ │ Telemetry        │ │   ║
║  │  └────────────┘ └────────────┘ └──────────────────┘ │   ║
║  │                                                      │   ║
║  │  ┌─────────────────────────────────────────────────┐ │   ║
║  │  │ FreeTAKServer Integration                       │ │   ║
║  │  │ COT XML stream → TAK products (ATAK/WinTAK)    │ │   ║
║  │  └─────────────────────────────────────────────────┘ │   ║
║  │                                                      │   ║
║  │  ┌──────────────────────────────────────────────┐   │   ║
║  │  │ OpenSky Network API (ADS-B deconfliction)    │   │   ║
║  │  └──────────────────────────────────────────────┘   │   ║
║  └──────────────────────────────────────────────────────┘   ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 3. LAYER 1: DEVICE DETECTION

### 3.1 Android Architecture (Primary)

#### Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Language | Kotlin | 1.9+ |
| Min SDK | Android 9 (API 28) | — |
| Target SDK | Android 14 (API 34) | — |
| ML Inference | TFLite | 2.14+ |
| Audio API | AudioRecord (Java) / Oboe (C++) | Latest |
| WiFi API | WifiManager.getScanResults() | API 28+ |
| BLE | BluetoothLeAdvertiser + Scanner | API 26+ |
| Mesh (LoRa) | Meshtastic Android SDK | 2.3+ |
| Location | FusedLocationProviderClient | Play Services |
| Background Service | WorkManager + ForegroundService | Jetpack |
| HTTP Client | OkHttp + Retrofit | 4.x |
| Realtime | OkHttp WebSocket | Built-in |
| Local DB | Room + SQLite | Jetpack |
| DI | Hilt | Jetpack |
| Architecture | MVVM + Clean Architecture | — |

#### Android Module Structure

```
app/
├── src/main/java/com/apexsentinel/
│   ├── detection/
│   │   ├── acoustic/
│   │   │   ├── AudioCaptureEngine.kt       — PCM capture via AudioRecord
│   │   │   ├── MelSpectrogramProcessor.kt  — JNI to libmfcc / Oboe
│   │   │   ├── YAMNetEmbedder.kt           — TFLite YAMNet wrapper
│   │   │   ├── AcousticClassifier.kt       — Binary + multiclass head
│   │   │   └── AudioPreprocessor.kt        — Normalization, VAD gating
│   │   ├── rf/
│   │   │   ├── RFScanEngine.kt             — WiFi RSSI scanner
│   │   │   ├── ChannelEnergyAnalyzer.kt    — Energy vector builder
│   │   │   └── RFAnomalyScorer.kt          — Anomaly detection model
│   │   └── fusion/
│   │       ├── SensorFusionEngine.kt       — Fusion MLP TFLite
│   │       └── DetectionEvent.kt           — Data class
│   ├── mesh/
│   │   ├── LoRaManager.kt                  — Meshtastic SDK integration
│   │   ├── BLEMeshManager.kt               — BLE advertising + scanning
│   │   ├── NearbyManager.kt                — Google Nearby Connections
│   │   └── MeshPacketSerializer.kt         — 18-byte compact format
│   ├── network/
│   │   ├── SupabaseClient.kt               — HTTP + WS client
│   │   ├── EventQueue.kt                   — Room-backed retry queue
│   │   ├── NodeRegistration.kt             — Registration + JWT
│   │   └── RealtimeAlertReceiver.kt        — WS subscription
│   ├── service/
│   │   ├── SentinelForegroundService.kt    — Main persistent service
│   │   ├── HeartbeatWorker.kt              — WorkManager periodic
│   │   └── ModelUpdateWorker.kt            — OTA model download
│   ├── ui/
│   │   ├── main/                           — Sensor dashboard
│   │   ├── map/                            — MapLibre mini-map
│   │   ├── alert/                          — Alert overlay
│   │   ├── settings/                       — Privacy + config
│   │   └── calibration/                    — Calibration wizard
│   └── data/
│       ├── local/                          — Room entities + DAOs
│       ├── remote/                         — API DTOs
│       └── repository/                     — Data layer abstraction
```

#### Audio Processing Pipeline (Android)

```
Microphone (44100 Hz, 16-bit PCM, mono)
    │
    ▼
AudioRecord buffer (4096 samples / ~93ms)
    │
    ▼
WebRTC VAD gate — discard silent frames
    │  (saves ~60% processing when quiet)
    ▼
Bandpass filter (500–2000 Hz via biquad IIR)
    │
    ▼
Frame windowing (480 samples = ~11ms, STFT hop 240 samples)
    │
    ▼
FFT → Mel filterbank (128 bins, fmin=500, fmax=2000)
    │
    ▼
Log-mel spectrogram normalization (mean=0, std=1)
    │
    ▼
YAMNet embedding (1024-dim) — TFLite inference (~90ms)
    │
    ▼
Acoustic classifier head (1024→128→64→2) — TFLite (~20ms)
    │
    ├── Binary output: drone_prob (0.0-1.0)
    └── Multiclass: [fpv_quad, shahed, unknown_uav, noise]

Total acoustic pipeline: ~156ms (Snapdragon 665 baseline)
```

#### RF Scan Pipeline (Android)

```
WifiManager.startScan() (passive, throttled by OS)
    │
    ▼
getScanResults() → List<ScanResult>
    │
    ▼
Channel energy aggregator:
  Group by frequency band
  Average RSSI per channel
  Handle missing channels (interpolate)
    │
    ▼
24-dimensional energy vector
[2.4G_ch1, ch2, ..., ch13, 5G_ch36, ch40, ..., ch161]
    │
    ▼
Baseline tracker (5-minute rolling window, exponential smoothing)
    │
    ▼
Anomaly scorer: Mahalanobis distance from baseline
  Normalize to [0, 1] via sigmoid
    │
    ▼
RF anomaly score (0.0-1.0)
```

### 3.2 iOS Architecture (Secondary)

#### Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Language | Swift | 5.9+ |
| Min OS | iOS 14 | — |
| ML Inference | Core ML 5 | — |
| Audio API | AVAudioEngine + AVAudioSession | UIKit/SwiftUI |
| BLE | CoreBluetooth | System |
| Background | Background Modes: audio, fetch, remote-notification | — |
| HTTP | URLSession + Combine | System |
| UI | SwiftUI | — |
| Architecture | MVVM + Combine | — |
| Local DB | Core Data + SQLite | System |

#### iOS Limitations and Mitigations

```
iOS Restriction                     Mitigation
─────────────────────────────────   ─────────────────────────────────────
Background audio limited to VoIP    Use .record category + background mode
No background WiFi scanning         RF detection: foreground only; notify
                                    user to open app during alert
CoreML vs TFLite                    Convert model: TFLite → CoreML via
                                    coremltools, maintain parity
No Meshtastic LoRa hardware SDK     BLE-only mesh; LoRa via external BT
No background BLE scanning (strict) Use BLE Central in foreground; BLE
                                    peripheral advertising in background
```

---

## 4. LAYER 2: MESH NETWORK

### 4.1 LoRa / Meshtastic Mesh

```
LoRa Physical Layer:
  Frequency: 868.525 MHz (EU Region 1) / 915 MHz (US) / 433.175 MHz (fallback)
  Modulation: LoRa CSS (Chirp Spread Spectrum)
  Spreading factor: SF7-SF12 (adaptive; default SF9)
  Bandwidth: 125 kHz
  Coding rate: 4/5
  Max payload: 256 bytes
  Range: 1-5 km urban, 10-15 km line-of-sight
  Power: 17 dBm (50mW) typical

Meshtastic Packet Format (custom detection subset):
  Header (4 bytes):
    - to: 0xFFFFFFFF (broadcast)
    - from: node_num (4 bytes)
    - id: packet_id (4 bytes)
    - flags: hop_limit[3] | hop_start[3] | want_ack[1] | via_mqtt[1]

  APEX-SENTINEL Detection Payload (18 bytes):
    Byte  0-5  : node_id (6 ASCII chars, null-terminated)
    Byte  6-9  : unix_timestamp_s (uint32, big-endian)
    Byte  10-12: latitude encoded (int24, millionths of degree / 90)
    Byte  13-15: longitude encoded (int24, millionths of degree / 180)
    Byte  16   : fused_confidence (uint8, 0-255 → 0.0-1.0)
    Byte  17   : detection_type (0=acoustic, 1=rf, 2=fused, 3=mesh_relay)

  APEX-SENTINEL Alert Broadcast (22 bytes):
    Byte  0-7  : alert_id (8 chars)
    Byte  8    : severity (0=LOW, 1=MED, 2=HIGH, 3=CRITICAL)
    Byte  9-11 : lat_encoded
    Byte  12-14: lon_encoded
    Byte  15   : confidence (uint8)
    Byte  16-17: radius_100m (uint16) — alert radius in 100m units
    Byte  18-21: timestamp (uint32)
```

### 4.2 BLE Mesh Architecture

```
BLE Advertising Data (31 bytes max):
  Flags:           3 bytes
  Service UUID:    18 bytes (APEX-SENTINEL custom: f3c2-0000-apex-...)
  Manufacturer:    10 bytes
    - Company ID: 0xAPEX (custom)
    - node_id: 6 bytes (last 6 of hashed ID)
    - status: 1 byte (online/alert/calibrating)
    - confidence: 1 byte (current max detection confidence)

BLE Topology:
  - Each node advertises every 200ms (idle) or 50ms (alert state)
  - Nodes scan every 500ms
  - When alert received → node re-advertises with alert bit set
  - Google Nearby Connections for data transfer (> 31 bytes)
    → Used for: detection event relay, model update fragments

BLE Relay Protocol:
  1. Node A receives detection event from backend
  2. Node A advertises alert in BLE payload
  3. Node B (no internet) sees Node A advertisement
  4. Node B connects via Google Nearby Connections
  5. Node A sends full alert JSON over Nearby connection
  6. Node B displays alert + re-advertises to Node C
  Max hops: 3 (configurable)
```

### 4.3 Mesh Topology Visualization

```
Internet-connected nodes (●) relay to mesh-only nodes (◆):

     ●──────◆──────◆
     │      │      │
     ●      ◆      ◆
     │      │
     ●──────◆
           (LoRa 2km reach)

Detection flow in mesh-only scenario:
  Node A (detects) → [LoRa broadcast, 18 bytes] → Node B, C, D
  Node B (has internet) → [HTTPS] → Supabase backend
  Backend: triangulates from Node A timestamp (relayed), Node B+C
  Backend: generates alert
  Node B → [LoRa alert broadcast] → Node A, C, D (no internet)
```

---

## 5. LAYER 3: BACKEND — SUPABASE

### 5.1 Supabase Architecture

```
Supabase Project: bymfcnwfyxuivinuzurr
Region: West Europe (London)
PostgreSQL version: 15+
Extensions: PostGIS, pgcrypto, uuid-ossp, pg_cron

Architecture components:
  ┌─────────────────────────────────────────────────────────┐
  │ Supabase Edge Functions (Deno runtime)                 │
  │                                                        │
  │  ingest-event        — detection event ingestion       │
  │  register-node       — node registration + JWT         │
  │  triangulate         — TDoA + RSSI triangulation       │
  │  track-manager       — track CRUD + state machine      │
  │  alert-manager       — alert creation + escalation     │
  │  model-update        — model version + download URL    │
  │  cot-export          — FreeTAKServer COT stream        │
  │  opensky-sync        — ADS-B deconfliction             │
  │  calibration         — calibration management          │
  │  node-health         — heartbeat processor             │
  └─────────────────────────────────────────────────────────┘
                │
  ┌─────────────────────────────────────────────────────────┐
  │ PostgreSQL 15 + PostGIS                                │
  │  (Schema: see DATABASE_SCHEMA.md)                      │
  └─────────────────────────────────────────────────────────┘
                │
  ┌─────────────────────────────────────────────────────────┐
  │ Supabase Realtime                                      │
  │  Channels:                                             │
  │    alerts:{h3_cell}    — geographic alert delivery    │
  │    tracks:global       — track updates to C2          │
  │    nodes:health        — node status to C2 admin      │
  │    calibration:global  — calibration pulses           │
  └─────────────────────────────────────────────────────────┘
```

### 5.2 Triangulation Engine (Edge Function: /triangulate)

#### Acoustic TDoA Algorithm

```typescript
// TDoA (Time Difference of Arrival) hyperbolic position estimation
// Requires: ≥3 nodes, timestamps synchronized to ±10ms

interface TDoAInput {
  nodes: Array<{
    node_id: string;
    lat: number;       // decimal degrees
    lon: number;       // decimal degrees
    timestamp_ms: number;  // UTC milliseconds (NTP-synced)
    acoustic_confidence: number;
    calibration_weight: number;
  }>;
  speed_of_sound_ms: number;  // default 343.0 m/s
}

// Step 1: Select reference node (highest calibration_weight)
// Step 2: Compute TDoA pairs: Δt_12 = t1 - t2, Δt_13 = t1 - t3
// Step 3: Convert TDoA to range difference: Δd_12 = Δt_12 × c
// Step 4: Set up hyperbolic equations (two hyperbolae from 3 nodes)
// Step 5: Nonlinear least squares (Levenberg-Marquardt)
// Step 6: Apply Kalman filter for track smoothing
// Output: {lat, lon, error_ellipse_m, gdop, contributing_nodes}

// GDOP (Geometric Dilution of Precision) calculation:
// GDOP = sqrt(trace(H^T H)^-1) where H is the geometry matrix
// GDOP < 2.0: excellent, < 4.0: good, < 8.0: acceptable
```

#### RSSI Circle Intersection Algorithm

```typescript
// Weighted least-squares circle intersection for RF triangulation
// Accuracy: ±150m typical

interface RSIIInput {
  nodes: Array<{
    node_id: string;
    lat: number;
    lon: number;
    rf_anomaly_score: number;
    channel_energies: number[];  // 24-dim
  }>;
  path_loss_model: 'fspl' | 'okumura_hata';
}

// Step 1: Estimate range from RF anomaly score using path loss model
//   FSPL(d) = 20*log10(d) + 20*log10(f) + 20*log10(4π/c)
//   Range estimate from signal strength delta
// Step 2: Weight circles by rf_anomaly_score
// Step 3: Minimize weighted sum of squared residuals
// Step 4: Output: {lat, lon, error_m}
```

### 5.3 Track State Machine

```
Track State Machine:

     [New detections]
          │
          ▼
    ┌─────────────┐
    │  DETECTED   │  — 1-2 nodes, confidence 0.40-0.54
    │             │  — Provisional; not shown on C2 by default
    └──────┬──────┘
           │ ≥3 nodes OR confidence ≥ 0.55
           ▼
    ┌─────────────┐
    │  TRACKING   │  — Active triangulation; shown on C2
    │             │  — Kalman filter running
    └──────┬──────┘
           │ confidence ≥ 0.85 + ≥4 nodes
           ▼
    ┌─────────────┐
    │  CONFIRMED  │  — Critical alert issued
    │             │  — COT event emitted
    └──────┬──────┘
           │ no detections for 60s
           ▼
    ┌─────────────┐
    │    LOST     │  — Alert: "track lost"
    │             │  — Last known position displayed
    └──────┬──────┘
           │ LOST for >300s
           ▼
    ┌─────────────┐
    │ TERMINATED  │  — Track archived
    │             │  — Historical record preserved
    └─────────────┘

State transitions back:
  LOST → TRACKING: new detections match LOST track position (±200m, ±60s)
  TRACKING → DETECTED: confidence drops below 0.40 for 30s
```

### 5.4 H3 Geographic Indexing

```
H3 Resolution Strategy:
  Resolution 7: ~5.16 km² hexagons — Realtime channel subscription unit
  Resolution 9: ~0.105 km² hexagons — Node aggregation unit
  Resolution 11: ~0.003 km² hexagons — Individual node placement

Each detection event includes H3 index at resolution 7.
Alert broadcasts target H3 cells containing threat + all neighbors.
Node heatmap aggregated at H3 resolution 9.

h3-js library used in Edge Functions and C2 dashboard.
```

---

## 6. LAYER 4: C2 DASHBOARD

### 6.1 Technology Stack

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| Framework | React 18 | 18.2+ | Large ecosystem, strong TypeScript |
| Build | Vite | 5.x | Fast HMR, ES modules |
| Language | TypeScript | 5.x | Type safety for defense application |
| 3D Map | CesiumJS | 1.114+ | Best 3D globe, terrain, military use |
| 2D Map | MapLibre GL JS | 4.x | Open-source Mapbox alternative |
| Data viz | Deck.gl | 8.9+ | GPU-accelerated node heatmap |
| Telemetry | OpenMCT | 1.7+ | NASA-grade mission telemetry UI |
| State | Zustand + React Query | Latest | Lightweight + async data |
| Realtime | Supabase JS client | 2.x | WebSocket subscriptions |
| HTTP | Axios + React Query | Latest | — |
| Auth | Supabase Auth + JWT | — | — |
| COT/TAK | FreeTAKServer client | 2.x | TAK interoperability |
| ADS-B | OpenSky Network REST | — | Aircraft deconfliction |
| Styling | Tailwind CSS | 3.x | Utility-first, dark theme |
| Testing | Vitest + RTL + Playwright | — | Per wave-formation law |
| Deploy | Vercel Edge / nginx | — | CDN-edge for low latency |

### 6.2 C2 Frontend Architecture

```
src/
├── components/
│   ├── map/
│   │   ├── CesiumGlobe.tsx         — CesiumJS 3D container
│   │   ├── MapLibre2D.tsx          — MapLibre GL container
│   │   ├── NodeLayer.tsx           — Node markers + heatmap
│   │   ├── TrackLayer.tsx          — Track polylines + arrows
│   │   ├── AlertLayer.tsx          — Alert rings
│   │   ├── TriangulationViz.tsx    — TDoA/RSSI visualization
│   │   ├── MGRSGrid.tsx            — MGRS grid overlay
│   │   └── MeshTopologyLayer.tsx   — LoRa link visualization
│   ├── panels/
│   │   ├── ThreatSummaryPanel.tsx  — Left panel threat counts
│   │   ├── AlertPanel.tsx          — Right panel alert list
│   │   ├── TrackInspector.tsx      — Track detail view
│   │   ├── NodeInspector.tsx       — Node detail view
│   │   └── LayerControlPanel.tsx   — Layer toggles
│   ├── timeline/
│   │   ├── OpenMCTStrip.tsx        — OpenMCT container
│   │   ├── DetectionEventChart.tsx — Event rate chart
│   │   └── TimeScrubber.tsx        — Historical playback
│   ├── alerts/
│   │   ├── CriticalAlertOverlay.tsx — Full-screen critical
│   │   └── AlertCard.tsx           — Individual alert card
│   └── header/
│       ├── StatusHeader.tsx        — Top bar
│       └── DefconIndicator.tsx     — Threat level widget
├── hooks/
│   ├── useRealtimeTracks.ts        — Supabase WS subscription
│   ├── useRealtimeAlerts.ts        — Alert subscription
│   ├── useNodeHealth.ts            — Node fleet status
│   ├── useOpenSky.ts               — ADS-B polling
│   └── useCOTStream.ts             — FreeTAKServer output
├── services/
│   ├── supabase.ts                 — Supabase client singleton
│   ├── cotService.ts               — COT XML generation
│   ├── openSkyService.ts           — OpenSky API wrapper
│   └── exportService.ts            — KML/COT/PDF export
├── stores/
│   ├── trackStore.ts               — Zustand track state
│   ├── alertStore.ts               — Alert state
│   ├── nodeStore.ts                — Node fleet state
│   └── uiStore.ts                  — UI state (layer toggles)
└── workers/
    └── triangulationWorker.ts      — Web Worker for viz math
```

### 6.3 CesiumJS Integration

```typescript
// CesiumJS initialization with military dark theme
const viewer = new Cesium.Viewer('cesiumContainer', {
  terrainProvider: Cesium.createWorldTerrain({
    requestWaterMask: false,
    requestVertexNormals: true,
  }),
  imageryProvider: new Cesium.OpenStreetMapImageryProvider({
    url: 'https://tile.openstreetmap.org/',
  }),
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: true,  // 3D/2D toggle
  navigationHelpButton: false,
  animation: false,
  timeline: false,
  fullscreenButton: false,
  skyBox: false,
  skyAtmosphere: false,
  backgroundColor: Cesium.Color.fromCssColorString('#0A0C10'),
});

// Track entity example
viewer.entities.add({
  id: `track-${trackId}`,
  position: Cesium.Cartesian3.fromDegrees(lon, lat, altitude),
  billboard: {
    image: droneIconUrl,
    scale: 0.8,
    color: Cesium.Color.fromCssColorString('#FF2D2D'),
  },
  polyline: {
    positions: Cesium.Cartesian3.fromDegreesArrayHeights(trailCoords),
    width: 3,
    material: new Cesium.PolylineArrowMaterialProperty(
      Cesium.Color.fromCssColorString('#FF6B00')
    ),
  },
  ellipse: {
    semiMajorAxis: errorEllipseA,
    semiMinorAxis: errorEllipseB,
    rotation: Cesium.Math.toRadians(errorEllipseAngle),
    material: Cesium.Color.fromCssColorString('#FF2D2D').withAlpha(0.2),
    outline: true,
    outlineColor: Cesium.Color.fromCssColorString('#FF2D2D'),
  },
});
```

### 6.4 OpenMCT Integration

```typescript
// OpenMCT custom telemetry plugin for APEX-SENTINEL
const apexSentinelPlugin = () => ({
  install(openmct) {
    // Register telemetry objects
    openmct.objects.addRoot({
      namespace: 'apex-sentinel',
      key: 'root',
    });

    openmct.objects.addProvider('apex-sentinel', {
      get(identifier) {
        return TELEMETRY_OBJECTS[identifier.key];
      },
    });

    // Register realtime telemetry source
    openmct.telemetry.addProvider({
      supportsSubscribe(domainObject) {
        return domainObject.type === 'apex.telemetry';
      },
      subscribe(domainObject, callback) {
        const channel = supabase
          .channel('openmct-telemetry')
          .on('broadcast', { event: 'telemetry' }, ({ payload }) => {
            callback({ timestamp: payload.ts, value: payload[domainObject.key] });
          })
          .subscribe();

        return () => channel.unsubscribe();
      },
    });
  },
});

const openmct = window.openmct;
openmct.install(apexSentinelPlugin());
openmct.start();
```

---

## 7. FREETAKSERVER COT INTEGRATION

### 7.1 COT Event Format

```xml
<!-- APEX-SENTINEL COT Event for FPV Drone Track -->
<?xml version="1.0" encoding="UTF-8"?>
<event version="2.0"
       uid="APEXSENTINEL-TRK-20260324-0001"
       type="a-h-A-M-R"
       time="2026-03-24T14:23:07.000Z"
       start="2026-03-24T14:21:33.000Z"
       stale="2026-03-24T14:25:07.000Z"
       how="m-g"
       access="Unclassified">
  <point lat="47.1234" lon="28.9876" hae="120.0"
         ce="62.0" le="50.0"/>
  <detail>
    <track speed="23.6" course="247.0"/>
    <remarks>
      APEX-SENTINEL: FPV drone. Confidence: 94%.
      Acoustic+RF fusion. Contributing nodes: 4.
      TDoA accuracy: ±62m. Model: v2.1.3
    </remarks>
    <__group name="APEX-SENTINEL" role="Team Member"/>
    <precisionlocation geopointsrc="GPS" altsrc="DTED2"/>
    <apex_sentinel
      track_id="TRK-20260324-0001"
      confidence="0.94"
      detection_method="acoustic_rf_fusion"
      contributing_nodes="4"
      model_version="2.1.3"
      threat_type="fpv_quad"/>
  </detail>
</event>
```

### 7.2 FreeTAKServer Configuration

```yaml
# freetakserver-config.yaml (deployed separately, on-premise option)
MainConfig:
  ServerIP: 0.0.0.0
  CoTServicePort: 8087
  SSLCoTServicePort: 8089
  APIPort: 19023
  DataPackageServiceDefaultIP: localhost

APEX-SENTINEL:
  enable: true
  host: supabase-edge-function-url
  auth_token: ${APEX_SENTINEL_COT_TOKEN}
  track_types:
    fpv_quad: "a-h-A-M-R"
    shahed: "a-h-A-M-F"
    unknown_uav: "a-h-A"
  update_interval_s: 5
  stale_multiplier: 4
```

---

## 8. SECURITY ARCHITECTURE

### 8.1 Authentication Flow

```
Mobile Node Authentication:
  1. App generates UUID v4 → SHA-256 hash (truncated 16 chars) → node_id
  2. POST /functions/v1/register-node with {platform, app_version, capabilities}
  3. Edge Function: validate request, create node record, issue JWT
  4. JWT claims: {sub: node_id, role: 'sensor_node', exp: +7days}
  5. JWT stored in Android KeyStore / iOS Keychain
  6. All subsequent requests: Authorization: Bearer {jwt}
  7. JWT refresh: silent refresh 24h before expiry

C2 Dashboard Authentication:
  1. Email + password via Supabase Auth
  2. TOTP MFA enforced for roles: C2_COMMANDER, SUPER_ADMIN
  3. Session JWT: 8 hours
  4. RLS policies enforce role-based data access at database level
  5. Audit log: all authentication events logged to auth_events table

Inter-service Authentication:
  Edge Functions → PostgreSQL: Supabase service role key (env variable)
  Edge Functions → Edge Functions: Supabase JWT
  C2 → FreeTAKServer: Pre-shared API token (rotated 90 days)
```

### 8.2 Data Encryption

```
In Transit:
  Mobile → Backend: TLS 1.3 (ECDHE-ECDSA-AES256-GCM)
  Backend → C2: TLS 1.3
  LoRa mesh: AES-256-CTR (Meshtastic native encryption)
  BLE mesh: AES-CCM (BLE 5.x native)
  FreeTAKServer: TLS 1.3 optional (configurable)

At Rest:
  Supabase PostgreSQL: AES-256 (database-level, Supabase managed)
  Mobile local DB (Room/Core Data): SQLCipher AES-256
  ML model files: SHA-256 checksum verified; not encrypted (public model)
  JWT secrets: Android KeyStore / iOS Secure Enclave
```

### 8.3 RLS Policy Summary

```sql
-- Node can only read/write its own records
-- C2 operators can read all; only commanders can write alert status
-- See DATABASE_SCHEMA.md for full RLS policies
```

---

## 9. OFFLINE / DEGRADED MODE BEHAVIOR

### 9.1 Degradation Tiers

```
TIER 1 — FULLY ONLINE (nominal)
  All backend features available.
  Real-time triangulation.
  Full C2 dashboard.
  Push alerts to mobile.

TIER 2 — INTERMITTENT CONNECTIVITY
  Detections queued locally (up to 1000 events).
  Batch upload when reconnected.
  Mesh alerts via LoRa/BLE from internet-connected neighbors.
  C2 dashboard: cached last state.

TIER 3 — MESH-ONLY (no internet)
  Acoustic + RF detection: FULL capability.
  Triangulation: limited to nodes within LoRa range.
  Alerts: LoRa broadcast (18-byte compressed).
  C2: offline tile cache + cached track/alert state.
  FreeTAKServer: can operate on local network.

TIER 4 — ISOLATED NODE (no internet, no mesh)
  Acoustic + RF detection: FULL capability.
  Local alert display only.
  No triangulation.
  Events queued for later upload (if reconnected within 24h).

Transition Logic:
  TIER 1 → TIER 2: HTTP failure >3 retries
  TIER 2 → TIER 3: HTTP failure >10 retries; LoRa/BLE peers found
  TIER 3 → TIER 4: LoRa/BLE peers lost for >120 seconds
  Any tier → TIER 1: HTTP success (immediate upgrade)
```

---

## 10. OPENSKY NETWORK INTEGRATION

```
ADS-B Deconfliction Pipeline:
  1. Backend polls OpenSky REST API every 30 seconds
     GET https://opensky-network.org/api/states/all?
       lamin={min_lat}&lamax={max_lat}&lomin={min_lon}&lomax={max_lon}
  2. Filter: only aircraft within 50km of active threat zones
  3. For each acoustic detection:
     a. Find aircraft within 500m horizontally + 300m vertically
     b. Compute acoustic correlation score:
        - Speed match: |detection_speed - aircraft_speed| < 20 m/s
        - Heading match: |detection_heading - aircraft_heading| < 30°
        - Frequency match: commercial aircraft vs drone frequency profile
     c. If correlation score > 0.7: suppress acoustic confidence by 40%
  4. Suppressed detections logged but not presented as alerts
  5. ADS-B track displayed as friendly overlay on C2 map (cyan)
```

---

## 11. TECHNOLOGY CHOICE RATIONALE

| Technology | Alternatives Considered | Rationale |
|-----------|------------------------|-----------|
| Supabase | Firebase, custom Postgres | Open-source, PostgreSQL + Realtime, RLS, edge functions, self-hostable |
| CesiumJS | Mapbox, deck.gl | Only option for true 3D globe + terrain; NATO/military standard |
| MapLibre GL | Mapbox GL JS | Open-source, no API key cost at scale |
| TFLite | ONNX Runtime, PyTorch Mobile | Smallest binary, fastest inference on Android |
| CoreML | TFLite for iOS | Native iOS, hardware-accelerated, best battery |
| Meshtastic | Custom LoRa protocol | Proven civilian LoRa protocol, open-source, existing hardware base |
| Google Nearby Connections | Custom BLE protocol | Cross-platform, handles BLE limitations, >31 byte payloads |
| OpenMCT | Custom charts, Grafana | NASA-grade time-series UI, pluggable, designed for mission operations |
| FreeTAKServer | ATAK server | Open-source COT server; enables TAK integration without licensing |
| YAMNet | PANNs, AST | Pre-trained on AudioSet, 1024-dim embeddings proven for transfer |

---

## 12. DEPLOYMENT ARCHITECTURE

```
Production Deployment:

  Supabase Cloud (bymfcnwfyxuivinuzurr):
    Region: West Europe (London)
    Plan: Pro ($25/month) → Scale as needed
    Database: 8GB → grow on demand
    Bandwidth: 250GB/month → grow on demand
    Edge Functions: 2M invocations/month free

  C2 Dashboard:
    Primary: Vercel Edge Network
    Fallback: Self-hosted nginx on VPS
    CDN: Vercel Edge for static assets

  FreeTAKServer (optional, operator-deployed):
    Docker container on operator's infrastructure
    Not hosted by APEX-SENTINEL
    Documented in deployment runbook

  Mobile Apps:
    Android: Google Play Store
    iOS: Apple App Store
    Enterprise: Direct APK/IPA for military deployment

  Grafana:
    Self-hosted on operator's infrastructure
    Connected to Supabase PostgreSQL read replica
```

---

## 13. VERSION HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-03-24 | APEX-SENTINEL Team | Initial architecture |

---

*End of ARCHITECTURE.md — APEX-SENTINEL W1*
