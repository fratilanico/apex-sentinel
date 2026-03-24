# APEX-SENTINEL — Integration Map
# FILE 20 of 20 — INTEGRATION_MAP.md
# Wave 1 Baseline — 2026-03-24

---

## System Architecture Data Flow

```
╔═══════════════════════════════════════════════════════════════════════════════════╗
║                          APEX-SENTINEL DATA FLOW                                 ║
║                                                                                   ║
║  ┌─────────────────────────────────────────────────────────────────────────────┐  ║
║  │                        SENSOR LAYER (Edge Nodes)                            │  ║
║  │                                                                             │  ║
║  │  ┌───────────────────────────────────────────────────────────────────────┐  │  ║
║  │  │                    ANDROID NODE                                       │  │  ║
║  │  │                                                                       │  │  ║
║  │  │  [Android WifiManager]──────────────────────────────────────────┐    │  │  ║
║  │  │      RSSI/BSSID/Channel                                         │    │  │  ║
║  │  │      WiFi scan every 10s                                        ▼    │  │  ║
║  │  │                                                     [RfAnomalyClassifier]  │  ║
║  │  │  [AudioRecord API]──[WebRTC VAD]──[FFT/Hann]──►[YAMNet TFLite]────►│    │  │  ║
║  │  │     16kHz PCM        silence        spectral      drone/no/unc  │    │  │  ║
║  │  │     100ms chunks     filter         features      156ms         │    │  │  ║
║  │  │                                                                 ▼    │  │  ║
║  │  │  [iOS Core Location / Android GPS]──────────────────►[AcousticPipeline]  │  ║
║  │  │     lat/lon/alt/accuracy/gps_time                    DetectionEvent│    │  │  ║
║  │  │                                                                 │    │  │  ║
║  │  └─────────────────────────────────────────────────────────────────┼────┘  │  ║
║  │                                                                     │       │  ║
║  │  ┌──────────────────────────────────┐                              │       │  ║
║  │  │  MESH RELAY (W2+)                │                              │       │  ║
║  │  │  [Meshtastic BLE/LoRa] ◄────────┤                              │       │  ║
║  │  │  [Google Nearby Connections BLE] │   Detection event metadata   │       │  ║
║  │  │  [Apple MultipeerConnectivity]   │   (no raw audio)             │       │  ║
║  │  └──────────────────────────────────┘                              │       │  ║
║  └─────────────────────────────────────────────────────────────────────┼───────┘  ║
║                                                                         │ HTTPS    ║
║                                                              DetectionEvent JSON   ║
║                                                                         │         ║
║  ┌──────────────────────────────────────────────────────────────────────▼───────┐  ║
║  │              SUPABASE BACKEND (bymfcnwfyxuivinuzurr, eu-west-2)             │  ║
║  │                                                                             │  ║
║  │  [Supabase REST/PostgREST]──────────────────►[PostgreSQL]                  │  ║
║  │      HTTP POST /rest/v1/detection_events       detection_events table       │  ║
║  │      RLS: anon INSERT only                     sensor_nodes table           │  ║
║  │                                                rf_readings table            │  ║
║  │  [Supabase Realtime]◄──────────────────────────[PostgreSQL LISTEN/NOTIFY]   │  ║
║  │      WebSocket ws://...supabase.co/realtime    INSERT events → channel      │  ║
║  │      C2 dashboard subscribes                                                │  ║
║  │                                                                             │  ║
║  │  [Supabase Edge Functions (Deno)]                                           │  ║
║  │      triangulate() ── TDoA computation                                     │  ║
║  │      alert-dispatch() ── Telegram + FreeTAK relay                          │  ║
║  └──────────────────────────────────────────────┬──────────────────────────────┘  ║
║                                                  │ WebSocket + REST               ║
║  ┌───────────────────────────────────────────────▼──────────────────────────────┐  ║
║  │                    C2 DASHBOARD (React + TypeScript)                         │  ║
║  │                                                                              │  ║
║  │  [CesiumJS]◄──────────────────[Realtime Detection Events]                   │  ║
║  │   3D terrain globe             pulsing threat markers                        │  ║
║  │   terrain-aware vectors                                                      │  ║
║  │                                                                              │  ║
║  │  [MapLibre GL]◄───────────────[Detection Event Overlay]                     │  ║
║  │   2D tactical view             ANCPI Romanian tile layer                     │  ║
║  │                                                                              │  ║
║  │  [OpenMCT Plugin]◄─────────────[Supabase REST - Telemetry]                  │  ║
║  │   battery, latency timeline    node heartbeat data                           │  ║
║  │                                                                              │  ║
║  │  [FreeTAKServer Client]──────►[FreeTAKServer TCP:8087]──►[ATAK Clients]     │  ║
║  │   COT XML events               relay                       field tablets     │  ║
║  │                                                                              │  ║
║  │  [Grafana/Prometheus]◄─────────[Prometheus scrape endpoint]                 │  ║
║  │   operational dashboard        /metrics                                     │  ║
║  └──────────────────────────────────────────────────────────────────────────────┘  ║
║                                                                                   ║
║  ┌───────────────────────────────────────────────────────────────────────────────┐  ║
║  │                    EXTERNAL SYSTEMS                                           │  ║
║  │                                                                               │  ║
║  │  [OpenSky Network REST]◄──── Supabase Edge Function (ADS-B cross-reference)  │  ║
║  │  [Telegram Bot API]◄──────── Supabase Edge Function (high-confidence alerts) │  ║
║  └───────────────────────────────────────────────────────────────────────────────┘  ║
╚═══════════════════════════════════════════════════════════════════════════════════╝
```

---

## Integration Details

---

### INT-01: Supabase Realtime (WebSocket)

| Field            | Value                                                                      |
|------------------|----------------------------------------------------------------------------|
| **System**       | Supabase Realtime                                                          |
| **Direction**    | Outbound from Supabase → Inbound to C2 Dashboard                         |
| **Protocol**     | WebSocket (wss://)                                                         |
| **Endpoint**     | wss://bymfcnwfyxuivinuzurr.supabase.co/realtime/v1/websocket              |
| **Auth Method**  | Supabase anon JWT key in WebSocket connection params                       |
| **Data Format**  | JSON — Supabase Realtime envelope with `type: "INSERT"`, `record: {}` payload |
| **Latency SLA**  | ≤3 seconds event to map marker (Supabase target: ≤200ms delivery)         |
| **Failure Mode** | WebSocket disconnect on network interruption or Supabase maintenance       |
| **Fallback**     | Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 60s).       |
|                  | C2 shows "Realtime offline — polling" banner and falls back to REST polling |
|                  | every 5 seconds.                                                           |

**Client setup (TypeScript):**
```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

const channel = supabase
  .channel('detection-events')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'detection_events' },
    (payload) => {
      const event = payload.new as DetectionEvent
      handleNewDetection(event)
    }
  )
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') console.log('Realtime connected')
    if (status === 'CHANNEL_ERROR') scheduleReconnect()
  })
```

---

### INT-02: Supabase REST / PostgREST

| Field            | Value                                                                      |
|------------------|----------------------------------------------------------------------------|
| **System**       | Supabase REST (PostgREST)                                                  |
| **Direction**    | Outbound from Android/iOS sensor nodes                                     |
| **Protocol**     | HTTPS / REST                                                               |
| **Base URL**     | https://bymfcnwfyxuivinuzurr.supabase.co/rest/v1                          |
| **Auth Method**  | `apikey: <anon_key>` header + `Authorization: Bearer <anon_key>` header   |
| **Data Format**  | JSON — `Content-Type: application/json`                                    |
| **Key Endpoints**|                                                                            |
|                  | `POST /detection_events` — insert detection event                          |
|                  | `POST /sensor_nodes` — upsert node registration                            |
|                  | `GET /sensor_nodes?select=*&node_id=eq.{id}` — node lookup                |
|                  | `POST /rf_readings` — insert RF scan result                                |
| **Latency SLA**  | ≤2 seconds for INSERT (Supabase Pro, eu-west-2, from Romania: ~30ms RTT)  |
| **Failure Mode** | HTTP 5xx on Supabase outage, 429 on rate limit, 0 on network offline       |
| **Fallback**     | Room SQLite local queue. Retry with exponential backoff (jitter).          |
|                  | Max retry window: 24 hours. Event TTL in queue: 48 hours.                  |

**Android SDK usage:**
```kotlin
val supabase = createSupabaseClient(
    supabaseUrl = BuildConfig.SUPABASE_URL,
    supabaseKey = BuildConfig.SUPABASE_ANON_KEY
) {
    install(Postgrest)
    install(Auth)
    install(io.github.jan.tennert.supabase.realtime.Realtime)
}

// Insert detection event
supabase.from("detection_events").insert(detectionEvent)
```

**Rate limits (Supabase Pro):**
- 1,000 requests/second
- Max payload: 1MB per request
- Batch insert: up to 1,000 rows per POST

---

### INT-03: FreeTAKServer (COT / TCP)

| Field            | Value                                                                      |
|------------------|----------------------------------------------------------------------------|
| **System**       | FreeTAKServer 2.1                                                          |
| **Direction**    | Outbound from C2 Backend → FreeTAKServer → ATAK Clients                  |
| **Protocol**     | TCP (COT XML stream) on port 8087                                          |
| **Secondary**    | UDP on port 8088 (for ATAK multicast discovery)                            |
| **REST API**     | HTTP on port 19023 (FreeTAKServer management API)                          |
| **Auth Method**  | FreeTAKServer user credentials (admin/password stored in FTSConfig.yaml)  |
| **Data Format**  | COT (Cursor-on-Target) XML 2.0                                             |
| **Key COT Types**|                                                                            |
|                  | `a-u-A` — Unknown air (drone detection)                                    |
|                  | `a-f-G-U-C` — Friendly ground unit (APEX-SENTINEL sensor node)            |
|                  | `b-m-p-s-p-i` — Mission planning point (triangulated position)             |
| **Latency SLA**  | COT event to ATAK device: ≤5 seconds from detection                       |
| **Failure Mode** | TCP connection refused (FTS not running), timeout, auth failure            |
| **Fallback**     | Event queued in Supabase `cot_queue` table. Retry every 30s.              |
|                  | If FTS unreachable for >5min: alert operator in C2 dashboard.             |

**COT XML Template for drone detection:**
```xml
<?xml version='1.0' encoding='UTF-8'?>
<event version='2.0'
       uid='APEX-{node_id}-{timestamp}'
       type='a-u-A'
       how='m-g'
       time='{zulu_time}'
       start='{zulu_time}'
       stale='{zulu_time_plus_5min}'
       access='Undefined'>
  <point lat='{latitude}' lon='{longitude}' hae='{altitude}' ce='{accuracy}' le='9999999.0'/>
  <detail>
    <contact callsign='APEX-SENTINEL'/>
    <remarks>
      DRONE DETECTED | Confidence: {confidence}% | Model: {model_version} |
      Node: {node_id} | Acoustic | APEX-SENTINEL v{app_version}
    </remarks>
    <usericon iconsetpath='COT_MAPPING_2525B/a-u/a-u-A'/>
  </detail>
</event>
```

**FTSConfig.yaml (infra/freetakserver/FTSConfig.yaml):**
```yaml
System:
  FTS_MAIN_IP: 0.0.0.0
  FTS_SAVE_COT_TO_DB: False
  FTS_DB_PATH: /opt/FreeTAKServer/FreeTAKServerDatabase.db
  FTS_COT_PORT: 8087
  FTS_SSLCOT_PORT: 8089
  FTS_DP_ADDRESS: 0.0.0.0
  FTS_USER_ADDRESS: 0.0.0.0
  FTS_API_PORT: 19023
  FTS_FED_PORT: 9001
  FTS_FED_HTTPS_PORT: 9000
  FTS_API_ADDRESS: 0.0.0.0
  FTS_OPTIMIZE_API: True
  FTS_MAINLOOP_DELAY: 1
  FTS_CONNECTION_MESSAGE: "Connected to APEX-SENTINEL FTS"
  FTS_DISCONNECT_MESSAGE: "Disconnected from APEX-SENTINEL FTS"
```

---

### INT-04: OpenSky Network (REST — ADS-B Cross-Reference)

| Field            | Value                                                                      |
|------------------|----------------------------------------------------------------------------|
| **System**       | OpenSky Network REST API                                                   |
| **Direction**    | Outbound from Supabase Edge Function                                       |
| **Protocol**     | HTTPS / REST                                                               |
| **Base URL**     | https://opensky-network.org/api                                            |
| **Endpoint**     | `GET /states/all?lamin={lat-0.1}&lomin={lon-0.1}&lamax={lat+0.1}&lomax={lon+0.1}` |
| **Auth Method**  | HTTP Basic Auth (OpenSky account) or anonymous (rate-limited)             |
| **Data Format**  | JSON — `StateVector` array                                                 |
| **Rate Limit**   | Anonymous: 100 req/day. Authenticated: 4,000 req/day.                     |
| **Latency SLA**  | ≤3 seconds (OpenSky P95: ~1.5s)                                           |
| **Failure Mode** | 429 rate limit exceeded, API outage, network timeout                       |
| **Fallback**     | Skip ADS-B cross-reference on failure. Detection event stored without      |
|                  | `cross_reference_adsb` flag (null = not checked). Non-blocking.            |

**Edge Function call:**
```typescript
async function checkAdsb(lat: number, lon: number): Promise<boolean> {
  const delta = 0.1 // ~11km radius
  const url = `https://opensky-network.org/api/states/all` +
    `?lamin=${lat-delta}&lomin=${lon-delta}&lamax=${lat+delta}&lomax=${lon+delta}`

  const response = await fetch(url, {
    headers: { 'Authorization': 'Basic ' + btoa(`${OPENSKY_USER}:${OPENSKY_PASS}`) },
    signal: AbortSignal.timeout(3000)
  })
  if (!response.ok) return false // fail open

  const data = await response.json()
  return (data.states?.length ?? 0) > 0
}
```

---

### INT-05: CesiumJS (In-Process)

| Field            | Value                                                                      |
|------------------|----------------------------------------------------------------------------|
| **System**       | CesiumJS 1.124.x                                                           |
| **Direction**    | Internal — C2 dashboard React component                                    |
| **Protocol**     | In-process (JavaScript/TypeScript function calls)                          |
| **External**     | Cesium Ion REST API (HTTPS) for terrain tiles + Bing imagery              |
| **Auth Method**  | Cesium Ion token (`VITE_CESIUMION_TOKEN` env var)                         |
| **Data Format**  | Cesium entity objects (billboard, polyline, polygon, label)               |
| **Latency SLA**  | Entity render: ≤16ms (60fps target). Terrain tile load: ≤2s.              |
| **Failure Mode** | Cesium Ion outage: terrain tiles fail to load (fallback: flat WGS84)      |
| **Fallback**     | On Ion API failure: use offline terrain tiles (if bundled) or flat earth. |
|                  | MapLibre GL layer remains fully functional — no Cesium Ion dependency.    |

**Drone detection entity:**
```typescript
viewer.entities.add({
  id: `detection-${event.id}`,
  position: Cartesian3.fromDegrees(event.lon, event.lat, event.alt_m ?? 0),
  billboard: {
    image: '/icons/drone-threat.svg',
    scale: 0.8,
    color: event.confidence > 0.85 ? Color.RED : Color.ORANGE,
    heightReference: HeightReference.CLAMP_TO_GROUND
  },
  label: {
    text: `${Math.round(event.confidence * 100)}%`,
    font: '12pt monospace',
    fillColor: Color.WHITE,
    outlineColor: Color.BLACK,
    style: LabelStyle.FILL_AND_OUTLINE
  }
})
```

---

### INT-06: MapLibre GL JS (In-Process)

| Field            | Value                                                                      |
|------------------|----------------------------------------------------------------------------|
| **System**       | MapLibre GL JS 4.x                                                         |
| **Direction**    | Internal — C2 dashboard React component                                    |
| **Protocol**     | In-process + tile server HTTPS                                             |
| **Tile Source**  | ANCPI Romania official tiles: https://geoportal.ancpi.ro/arcgis/rest/services/ |
|                  | Fallback: OpenStreetMap tiles (no API key required)                        |
| **Auth Method**  | None required for OpenStreetMap tiles. ANCPI: open public WMS.            |
| **Data Format**  | GeoJSON for detection event overlay layers                                 |
| **Latency SLA**  | Tile render: ≤500ms on 4G. GeoJSON update: ≤100ms.                        |
| **Failure Mode** | Tile server unreachable: map renders without tiles (blank background)      |
| **Fallback**     | PMTiles offline tile pack bundled in app for Romanian border region.       |

---

### INT-07: Meshtastic (BLE / Serial)

| Field            | Value                                                                      |
|------------------|----------------------------------------------------------------------------|
| **System**       | Meshtastic LoRa Mesh Network                                               |
| **Direction**    | Bidirectional (node → gateway, gateway → C2)                              |
| **Protocol**     | BLE GATT profile (Android/iOS ↔ Meshtastic device), LoRa over-air         |
| **Hardware**     | TTGO T-Beam (recommended), Heltec WiFi LoRa 32, RAK4631                   |
| **Auth Method**  | Meshtastic channel PSK (pre-shared key) for encrypted mesh comms           |
| **Data Format**  | Protobuf (Meshtastic proto schema) — detection event encoded in           |
|                  | `Data.payload` bytes field within `MeshPacket`                             |
| **Max Payload**  | 240 bytes per Meshtastic packet (after overhead)                          |
| **Detection Event Encoding (compact, 96 bytes):**      |                        |
|                  | `{n: "nodeId", t: 1711234567890, la: 44.4268, lo: 26.1025,               |
|                  |   c: 91, cl: "d", mv: 1}` (JSON compact)                                 |
| **Latency SLA**  | Single hop: 1-5s. Multi-hop (3): 5-30s. Not real-time — best effort.      |
| **Failure Mode** | BLE disconnection, LoRa range exceeded, mesh partition                     |
| **Fallback**     | Events stored locally until mesh reconnect. Internet path (Supabase)      |
|                  | preferred when available — Meshtastic is offline-only fallback.           |

**Scope: W2+**

---

### INT-08: Google Nearby Connections API (Android SDK)

| Field            | Value                                                                      |
|------------------|----------------------------------------------------------------------------|
| **System**       | Google Nearby Connections (P2P local network)                              |
| **Direction**    | Bidirectional (Android node ↔ Android node)                               |
| **Protocol**     | BLE + WiFi Direct + WiFi LAN (Google selects automatically via P2P_CLUSTER)|
| **SDK**          | `com.google.android.gms:play-services-nearby:19.3.0`                      |
| **Auth Method**  | Nearby endpoint token (auto-generated, verified by user on pairing)       |
| **Data Format**  | Bytes payload — same compact JSON as Meshtastic                           |
| **Range**        | BLE fallback: 50-100m. WiFi Direct: 150-200m.                             |
| **Latency SLA**  | ≤500ms for payload delivery (same LAN/BLE range)                          |
| **Failure Mode** | Peer disconnect, range exceeded, Play Services unavailable                 |
| **Fallback**     | Meshtastic LoRa (longer range, lower bandwidth)                            |

**Scope: W2+**

---

### INT-09: Apple MultipeerConnectivity (iOS SDK)

| Field            | Value                                                                      |
|------------------|----------------------------------------------------------------------------|
| **System**       | Apple MultipeerConnectivity Framework                                      |
| **Direction**    | Bidirectional (iOS node ↔ iOS node, iOS ↔ Android via BLE only)           |
| **Protocol**     | BLE + WiFi P2P + Bonjour                                                   |
| **SDK**          | `MultipeerConnectivity.framework` (no external dependency)                |
| **Auth Method**  | MCSession peer certificate / invitation accept                             |
| **Data Format**  | Data (same compact JSON detection event bytes)                             |
| **Range**        | BLE: 50-100m. WiFi P2P (iOS-to-iOS): 200m.                                |
| **Latency SLA**  | ≤1s (local P2P)                                                           |
| **Failure Mode** | Session disconnect, peer unavailable                                       |
| **Fallback**     | Supabase internet path (primary). Meshtastic if available.                |

**Note:** MultipeerConnectivity cannot communicate with Android Nearby Connections directly —
requires a gateway node or common Meshtastic LoRa bridge.

**Scope: W2+**

---

### INT-10: YAMNet TFLite (On-Device)

| Field            | Value                                                                      |
|------------------|----------------------------------------------------------------------------|
| **System**       | TensorFlow Lite Runtime (on-device ML)                                     |
| **Direction**    | Internal — Android/iOS app                                                 |
| **Protocol**     | In-process (JNI on Android, Objective-C bridge on iOS)                    |
| **Model file**   | `assets/models/yamnet_drone_sentinel_v1.tflite` (Android)                 |
|                  | `Resources/Models/yamnet_drone_sentinel_v1.mlpackage` (iOS CoreML)        |
| **Auth Method**  | None (on-device, no network)                                               |
| **Input**        | `[1, 15600]` float32 tensor (0.975s @ 16kHz mono waveform)                |
| **Output**       | `[1, 3]` float32 tensor (softmax scores: drone, no-drone, uncertain)      |
| **Latency SLA**  | ≤200ms on Snapdragon 765G with NNAPI (validated: 156ms median)            |
| **Failure Mode** | OOM loading model (low-end devices), NNAPI init failure (fallback to CPU) |
| **Fallback**     | CPU inference if NNAPI unavailable (300-500ms — still within 2s pipeline) |

**Android TFLite initialization:**
```kotlin
val options = Interpreter.Options().apply {
    addDelegate(NnApiDelegate())  // NNAPI — hardware accelerated
    numThreads = 4
}
val interpreter = Interpreter(loadModelFile(context, "models/yamnet_drone_sentinel_v1.tflite"),
    options)
```

---

### INT-11: WebRTC VAD (On-Device)

| Field            | Value                                                                      |
|------------------|----------------------------------------------------------------------------|
| **System**       | WebRTC Voice Activity Detection                                            |
| **Direction**    | Internal — audio preprocessing stage                                       |
| **Protocol**     | In-process                                                                 |
| **Library**      | WebRTC native (via TFLite Task Audio library dependency on Android)        |
|                  | AVAudioEngine built-in VAD on iOS 17+ (AVAudioVoiceProcessingMode)         |
| **Auth Method**  | None                                                                       |
| **Input**        | 10ms, 20ms, or 30ms PCM frames at 8/16/32/48kHz                           |
| **Output**       | Boolean: voice/no-voice per frame                                          |
| **Latency SLA**  | <1ms per frame (real-time requirement)                                     |
| **Failure Mode** | Invalid frame size → IllegalArgumentException (handled in pipeline)       |
| **Fallback**     | Energy-based threshold VAD (same algorithm, implemented in-house)         |

---

### INT-12: Grafana + Prometheus (Operational Monitoring)

| Field            | Value                                                                      |
|------------------|----------------------------------------------------------------------------|
| **System**       | Grafana + Prometheus                                                       |
| **Direction**    | Prometheus scrapes C2 backend → Grafana visualizes                        |
| **Protocol**     | HTTP (Prometheus scrape: `/metrics` endpoint)                              |
| **Deployment**   | Docker Compose: `infra/docker-compose.yml`                                |
| **Grafana port** | 3000 (admin/admin default — change in production)                         |
| **Prometheus**   | port 9090                                                                  |
| **Auth Method**  | Grafana admin credentials (local Docker)                                   |
| **Key Metrics**  |                                                                            |
|                  | `apex_detections_total{class="drone"}` — counter                          |
|                  | `apex_inference_latency_ms` — histogram                                    |
|                  | `apex_active_nodes` — gauge                                                |
|                  | `apex_supabase_insert_duration_ms` — histogram                             |
|                  | `apex_false_positive_rate` — gauge (from human review feedback)            |
| **Latency SLA**  | Scrape interval: 15s. Dashboard refresh: 30s.                              |
| **Failure Mode** | Prometheus unreachable: C2 continues without telemetry. No impact on      |
|                  | detection or alerting.                                                     |
| **Fallback**     | Supabase dashboard (basic metrics available without Prometheus)            |

**docker-compose.yml (infra/docker-compose.yml) excerpt:**
```yaml
version: '3.8'

services:
  freetakserver:
    image: freetakteam/freetakserver:2.1.0
    container_name: apex-sentinel-fts
    ports:
      - "8087:8087/tcp"
      - "8088:8088/udp"
      - "19023:19023/tcp"
    volumes:
      - ./freetakserver:/opt/FreeTAKServer
    restart: unless-stopped

  prometheus:
    image: prom/prometheus:v2.55.1
    container_name: apex-sentinel-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    restart: unless-stopped

  grafana:
    image: grafana/grafana:11.4.0
    container_name: apex-sentinel-grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=changeme_production
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
    depends_on:
      - prometheus
    restart: unless-stopped

volumes:
  grafana-data:
```

---

### INT-13: Android WifiManager (System API)

| Field            | Value                                                                      |
|------------------|----------------------------------------------------------------------------|
| **System**       | Android WifiManager system service                                         |
| **Direction**    | Inbound (system API → app)                                                 |
| **Protocol**     | Android Binder IPC (system service)                                        |
| **Permission**   | `ACCESS_WIFI_STATE` + `CHANGE_WIFI_STATE` (normal) + `ACCESS_FINE_LOCATION`|
|                  | Note: Android 9+ requires location permission for WiFi scan results        |
| **Key APIs**     |                                                                            |
|                  | `WifiManager.startScan()` — triggers scan                                  |
|                  | `WifiManager.getScanResults()` — returns `List<ScanResult>`                |
|                  | `ScanResult.BSSID` — MAC address                                           |
|                  | `ScanResult.level` — RSSI in dBm                                           |
|                  | `ScanResult.frequency` — frequency in MHz (2412-5825)                      |
|                  | `ScanResult.timestamp` — microseconds since boot                           |
| **Scan Rate**    | Android throttles to 4 scans per 2 minutes (API 28+) in foreground        |
|                  | Background: 1 scan per 30 minutes. W1: foreground only.                   |
| **Failure Mode** | Permission denied, WiFi disabled, throttling                               |
| **Fallback**     | Disable RF sensor when WiFi scanning unavailable. Acoustic-only mode.     |

---

### INT-14: iOS Core Location (System API)

| Field            | Value                                                                      |
|------------------|----------------------------------------------------------------------------|
| **System**       | iOS Core Location Framework                                                |
| **Direction**    | Inbound (system → app)                                                     |
| **Protocol**     | In-process (Core Location framework)                                       |
| **Permission**   | `NSLocationWhenInUseUsageDescription` + `NSLocationAlwaysUsageDescription`|
| **Key APIs**     |                                                                            |
|                  | `CLLocationManager.requestWhenInUseAuthorization()`                        |
|                  | `CLLocationManager.requestLocation()` — one-shot fix                       |
|                  | `CLLocation.coordinate.latitude / longitude`                               |
|                  | `CLLocation.altitude` / `CLLocation.horizontalAccuracy`                   |
|                  | `CLLocation.timestamp.timeIntervalSince1970` → milliseconds                |
| **Accuracy**     | Best: kCLLocationAccuracyBest (~5m). TDoA: requires GPS fix, not WiFi.    |
| **Failure Mode** | User denies permission → location null in detection events.               |
| **Fallback**     | Events ingested without location (lat=null). TDoA requires permission.     |

---

### INT-15: Telegram Bot API (HTTP Webhook — Alert Dispatch)

| Field            | Value                                                                      |
|------------------|----------------------------------------------------------------------------|
| **System**       | Telegram Bot API                                                           |
| **Direction**    | Outbound from Supabase Edge Function → Telegram servers                   |
| **Protocol**     | HTTPS / REST                                                               |
| **Endpoint**     | `https://api.telegram.org/bot{TOKEN}/sendMessage`                         |
| **Auth Method**  | Bot token in URL path (`TELEGRAM_BOT_TOKEN` env secret in Edge Function)  |
| **Data Format**  | JSON body: `{chat_id, text, parse_mode: "MarkdownV2"}`                    |
| **Trigger**      | Supabase Edge Function `alert-dispatch` — triggered by                     |
|                  | `detection_events` INSERT with `confidence >= 0.85`                        |
| **Alert Message Template:**                                                |
|                  | ```                                                                        |
|                  | 🚨 *APEX\-SENTINEL ALERT*                                                  |
|                  | DRONE DETECTED                                                             |
|                  | Confidence: 91%                                                            |
|                  | Location: 44\.4268°N 26\.1025°E                                            |
|                  | Node: node\-RO\-001                                                        |
|                  | Time: 14:32:07 UTC                                                         |
|                  | Model: yamnet\_drone\_sentinel\_v1                                          |
|                  | ```                                                                        |
| **Latency SLA**  | ≤10 seconds from detection event INSERT to Telegram delivery              |
| **Failure Mode** | Telegram API unreachable, bot token invalid, chat_id not found            |
| **Fallback**     | Alert logged to Supabase `alert_log` table. Retry once after 60s.         |
|                  | Failure does NOT block detection event pipeline.                           |
| **Rate Limit**   | Telegram: 30 messages/second per bot. APEX-SENTINEL: alert dedup window   |
|                  | 60 seconds (same node → same area: suppress duplicate alerts).             |

**Edge Function implementation:**
```typescript
// supabase/functions/alert-dispatch/index.ts
Deno.serve(async (req) => {
  const { record } = await req.json() // Supabase webhook payload

  if (record.confidence < 0.85) return new Response('ok')

  const text = [
    '🚨 *APEX\\-SENTINEL ALERT*',
    'DRONE DETECTED',
    `Confidence: ${Math.round(record.confidence * 100)}%`,
    record.lat ? `Location: ${record.lat.toFixed(4)}°N ${record.lon.toFixed(4)}°E` : 'Location: unavailable',
    `Node: ${record.node_id}`,
    `Time: ${new Date(record.detected_at).toUTCString()}`,
  ].join('\n')

  await fetch(
    `https://api.telegram.org/bot${Deno.env.get('TELEGRAM_BOT_TOKEN')}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: Deno.env.get('TELEGRAM_CHAT_ID'),
        text,
        parse_mode: 'MarkdownV2'
      })
    }
  )

  return new Response('ok')
})
```

---

## Integration Health Check Runbook

```bash
# INT-01: Supabase Realtime
wscat -c "wss://bymfcnwfyxuivinuzurr.supabase.co/realtime/v1/websocket?apikey=${ANON_KEY}"

# INT-02: Supabase REST
curl -s -X GET \
  "https://bymfcnwfyxuivinuzurr.supabase.co/rest/v1/sensor_nodes?limit=1" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}"

# INT-03: FreeTAKServer REST
curl -s http://localhost:19023/api/v1/info | jq .version

# INT-03: FreeTAKServer COT TCP
echo '<event version="2.0" type="t-x-c-t" how="h-g-i-g-o"/>' | \
  nc -q1 localhost 8087

# INT-04: OpenSky Network
curl -s "https://opensky-network.org/api/states/all?lamin=44.3&lomin=25.9&lamax=44.5&lomax=26.3" \
  | jq '.states | length'

# INT-12: Prometheus metrics endpoint
curl -s http://localhost:9090/metrics | grep apex_

# INT-15: Telegram Bot
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe" | jq .result.username
```

---

## Integration Dependency Graph

```
Android App ──────────────────────────────────► Supabase REST (INT-02)
                                                      │
                                               PostgreSQL INSERT
                                                      │
                                               Realtime NOTIFY
                                                      │
C2 Dashboard ◄──────────── Supabase Realtime (INT-01)─┘
     │
     ├──► CesiumJS (INT-05) ──────────────────► Cesium Ion (external)
     │
     ├──► MapLibre GL (INT-06) ────────────────► ANCPI tiles (external)
     │
     ├──► FreeTAKServer (INT-03) ─────────────► ATAK field clients
     │
     ├──► OpenMCT (INT-12) ───────────────────► Supabase REST (INT-02)
     │
     └──► Grafana (INT-12) ───────────────────► Prometheus scrape

Supabase Edge Functions:
     ├──── triangulate() ─────────────────────► threat_positions table
     ├──── alert-dispatch() ──────────────────► Telegram Bot (INT-15)
     └──── alert-dispatch() ──────────────────► FreeTAKServer (INT-03)

Supabase Edge Functions:
     └──── opensky-check() ───────────────────► OpenSky Network (INT-04)

Android App ──► WifiManager (INT-13) ──────────► RF anomaly classifier (INT-10)
Android App ──► GPS FusedLocation (INT-14) ────► DetectionEvent.lat/lon
iOS App ──────► Core Location (INT-14) ────────► DetectionEvent.lat/lon
iOS App ──────► AVAudioEngine ──────────────────► CoreML YAMNet (INT-10)

Mesh Layer (W2+):
Android ↔ Meshtastic BLE (INT-07) ──► LoRa mesh ──► Gateway ──► Supabase
Android ↔ Nearby Connections (INT-08) ──► BLE/WiFi P2P
iOS ↔ MultipeerConnectivity (INT-09) ──► BLE/WiFi P2P
```

---

## Data Schema Summary (Supabase)

```sql
-- detection_events (primary data table)
CREATE TABLE detection_events (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id          text NOT NULL,
  detection_class  text NOT NULL CHECK (detection_class IN ('drone','no_drone','uncertain')),
  confidence       real NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  score_drone      real,
  score_no_drone   real,
  score_uncertain  real,
  inference_time_ms bigint,
  lat              double precision,
  lon              double precision,
  alt_m            double precision,
  location_accuracy_m real,
  location_provider text,
  detected_at      timestamptz NOT NULL DEFAULT now(),
  app_version      text,
  model_version    text,
  signature        text,          -- ECDSA P-256 (W4)
  cross_reference_adsb boolean,   -- OpenSky cross-check (W4)
  created_at       timestamptz DEFAULT now()
);

-- sensor_nodes (registration + heartbeat)
CREATE TABLE sensor_nodes (
  node_id          text PRIMARY KEY,
  device_model     text,
  os_version       text,
  app_version      text,
  model_version    text,
  lat              double precision,
  lon              double precision,
  battery_pct      integer,
  last_inference_ms bigint,
  registered_at    timestamptz DEFAULT now(),
  last_seen_at     timestamptz DEFAULT now()
);

-- rf_readings (RF/EMF scan results)
CREATE TABLE rf_readings (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id          text NOT NULL,
  bssid            text,
  ssid             text,
  frequency_mhz    integer,
  rssi_dbm         integer,
  channel          integer,
  anomaly_score    real,
  scanned_at       timestamptz NOT NULL DEFAULT now()
);
```

---

*Document owner: Nicolae Fratila | Last updated: 2026-03-24 | Version: 1.0*
*Update integration endpoints when Supabase project configuration changes.*
