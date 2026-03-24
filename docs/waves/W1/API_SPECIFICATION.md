# APEX-SENTINEL — API_SPECIFICATION.md
## Full REST + WebSocket API Specification
### Wave 1 | Project: APEX-SENTINEL | Version: 1.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. API OVERVIEW

### Base URLs

```
Production REST:   https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1
Staging REST:      https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1  (branch: staging)
WebSocket:         wss://bymfcnwfyxuivinuzurr.supabase.co/realtime/v1/websocket
Supabase REST:     https://bymfcnwfyxuivinuzurr.supabase.co/rest/v1
```

### Authentication

All requests must include a JWT token in the Authorization header:

```
Authorization: Bearer {jwt_token}
```

Token types:
- **Node JWT**: Issued on node registration. Claims: `{ sub: node_id, role: 'sensor_node', exp: +7days }`
- **User JWT**: Issued by Supabase Auth. Claims: `{ sub: user_uuid, role: user_role, exp: +8h }`
- **Service JWT**: Internal Edge Function use only. Claims: `{ role: 'service_role' }`

### Response Format

All responses use JSON. Standard envelope:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

interface ApiError {
  code: string;           // machine-readable error code
  message: string;        // human-readable message
  details?: unknown;      // optional structured details
}

interface ResponseMeta {
  request_id: string;     // UUID for tracing
  timestamp: string;      // ISO 8601
  version: string;        // API version
}
```

### Rate Limits

| Endpoint Group | Limit | Window |
|---------------|-------|--------|
| Node event ingestion | 60 requests | 1 minute per node |
| Node heartbeat | 2 requests | 1 minute per node |
| Node registration | 5 requests | 1 hour per IP |
| C2 reads | 300 requests | 1 minute per user |
| C2 writes | 60 requests | 1 minute per user |
| Model download | 10 requests | 1 hour per node |
| Export endpoints | 10 requests | 1 hour per user |

### HTTP Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad Request — invalid parameters |
| 401 | Unauthorized — missing or invalid JWT |
| 403 | Forbidden — insufficient role |
| 404 | Not Found |
| 409 | Conflict — duplicate registration |
| 422 | Unprocessable Entity — validation failed |
| 429 | Too Many Requests — rate limit exceeded |
| 500 | Internal Server Error |
| 503 | Service Unavailable — backend degraded |

---

## 2. TypeScript TYPE DEFINITIONS

```typescript
// ============================================
// CORE TYPES
// ============================================

export type NodePlatform = 'android' | 'ios' | 'web';
export type NodeStatus = 'online' | 'mesh_only' | 'degraded' | 'offline' | 'calibrating';
export type DetectionMethod = 'acoustic_only' | 'rf_only' | 'acoustic_rf_fused';
export type ThreatType =
  | 'fpv_quad'
  | 'shahed_class'
  | 'commercial_drone'
  | 'unknown_uav'
  | 'false_positive'
  | 'aircraft_correlated';
export type TrackState = 'detected' | 'tracking' | 'confirmed' | 'lost' | 'terminated';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'escalated' | 'dismissed' | 'auto_cleared';
export type UserRole =
  | 'super_admin'
  | 'c2_commander'
  | 'c2_operator'
  | 'analyst'
  | 'civil_coordinator'
  | 'read_only';

// ============================================
// NODE TYPES
// ============================================

export interface NodeCapabilities {
  has_acoustic: boolean;
  has_rf_scan: boolean;
  has_lora: boolean;
  has_ble: boolean;
  has_gps: boolean;
}

export interface NodeRegistrationRequest {
  hashed_device_id: string;       // SHA-256 of device UUID (64 hex chars)
  platform: NodePlatform;
  app_version: string;            // semver e.g., "1.2.3"
  ml_model_version: string;       // semver e.g., "2.1.3"
  capabilities: NodeCapabilities;
  display_name?: string;          // max 16 chars, no PII
}

export interface NodeRegistrationResponse {
  node_id: string;                // 6-char alphanumeric assigned ID
  jwt_token: string;              // Bearer token for subsequent requests
  jwt_expires_at: string;         // ISO 8601
  model_info: ModelInfo;          // current model version info
  config: NodeConfig;             // server-pushed config
}

export interface NodeConfig {
  acoustic_threshold: number;         // 0.0-1.0, default 0.40
  rf_threshold: number;               // 0.0-1.0, default 0.35
  heartbeat_interval_seconds: number; // default 60
  scan_interval_ms: number;           // RF scan interval, default 500
  mesh_max_hops: number;              // default 3
  location_round_meters: number;      // 10/100/500
  alert_radius_m: number;             // radius for push alerts, default 2000
}

export interface NodeHeartbeatRequest {
  node_id: string;
  battery_percent: number;            // 0-100
  available_storage_mb: number;
  acoustic_snr_db: number;
  rf_scan_enabled: boolean;
  location_accuracy_m: number;
  mesh_peer_count: number;
  network_type: 'wifi' | '4g' | '5g' | 'mesh' | 'offline';
  app_version: string;
  ml_model_version: string;
  events_queued: number;
  latitude?: number;                  // optional position update
  longitude?: number;
}

export interface NodeHeartbeatResponse {
  status: 'ok' | 'update_required' | 'calibration_needed';
  config_updated: boolean;
  config?: Partial<NodeConfig>;       // new config if updated
  model_update_available: boolean;
  model_info?: ModelInfo;
}

// ============================================
// DETECTION EVENT TYPES
// ============================================

export interface FrequencyBands {
  hz_500: number;       // 0.0-1.0 normalized band energy
  hz_800: number;
  hz_1200: number;
  hz_2000: number;
}

export interface RFChannelEnergies {
  // 2.4 GHz channels (RSSI in dBm, null if not scanned)
  ch_2g_1?: number;
  ch_2g_6?: number;
  ch_2g_11?: number;
  // 5 GHz channels
  ch_5g_36?: number;
  ch_5g_40?: number;
  ch_5g_149?: number;
  ch_5g_153?: number;
  // Additional channels
  [key: string]: number | undefined;
}

export interface DetectionEventRequest {
  node_id: string;
  detected_at: string;                // ISO 8601, ms precision
  ntp_offset_ms: number;              // node NTP offset at detection time

  // Position (privacy-rounded)
  latitude: number;
  longitude: number;
  location_accuracy_m: number;
  altitude_m?: number;

  // Scores
  acoustic_confidence: number;        // 0.0-1.0
  rf_anomaly_score: number;           // 0.0-1.0
  fused_confidence: number;           // 0.0-1.0
  detection_method: DetectionMethod;

  // Acoustic details
  frequency_bands: FrequencyBands;
  ambient_noise_db?: number;

  // RF details
  rf_channel_energies: RFChannelEnergies;
  rf_baseline_deviation?: number;

  // Classification
  threat_type?: ThreatType;
  threat_type_confidence?: number;

  // ML metadata
  ml_model_version: string;
  inference_latency_ms: number;
}

export interface DetectionEventResponse {
  event_id: string;                   // UUID assigned by backend
  received_at: string;                // ISO 8601
  track_id?: string;                  // if assigned to track
  triangulation_status: 'pending' | 'insufficient_nodes' | 'triangulating' | 'complete';
}

export interface BatchDetectionRequest {
  events: DetectionEventRequest[];    // max 100 per batch
}

export interface BatchDetectionResponse {
  processed: number;
  failed: number;
  event_ids: string[];
  errors?: Array<{ index: number; error: string }>;
}

// ============================================
// TRACK TYPES
// ============================================

export interface TrackSummary {
  track_id: string;                   // TRK-YYYYMMDD-NNNN
  state: TrackState;
  threat_type: ThreatType;
  confidence: number;
  current_lat: number;
  current_lon: number;
  current_alt_m?: number;
  heading_deg?: number;
  speed_ms?: number;
  position_error_m: number;
  contributing_nodes: number;
  last_detection_at: string;
  alert_id?: string;
  alert_severity?: AlertSeverity;
}

export interface TrackDetail extends TrackSummary {
  first_detection_at: string;
  detection_count: number;
  max_confidence: number;
  triangulation_method: string;
  contributing_node_ids: string[];    // anonymized node IDs
  kalman_velocity?: { vx: number; vy: number; vz: number };
  prediction_30s?: { lat: number; lon: number };  // 30-second lookahead
  adsb_correlation?: {
    icao24: string;
    callsign?: string;
    correlation_score: number;
  };
  history_points?: TrackPoint[];      // last 60 seconds
  detection_breakdown: {
    acoustic_events: number;
    rf_events: number;
    fused_events: number;
  };
}

export interface TrackPoint {
  estimated_at: string;
  lat: number;
  lon: number;
  alt_m?: number;
  confidence: number;
  position_error_m: number;
  heading_deg?: number;
  speed_ms?: number;
}

export interface TrackListResponse {
  tracks: TrackSummary[];
  total: number;
  active_count: number;
  filters_applied: TrackFilters;
}

export interface TrackFilters {
  state?: TrackState[];
  threat_type?: ThreatType[];
  min_confidence?: number;
  time_from?: string;
  time_to?: string;
  h3_cell?: string;
  limit?: number;
  offset?: number;
}

// ============================================
// ALERT TYPES
// ============================================

export interface AlertSummary {
  alert_id: string;                   // ALRT-YYYYMMDD-NNNN
  severity: AlertSeverity;
  status: AlertStatus;
  threat_type: ThreatType;
  confidence: number;
  lat: number;
  lon: number;
  position_error_m: number;
  contributing_nodes: number;
  detection_method: DetectionMethod;
  track_id?: string;
  triggered_at: string;
  acknowledged_at?: string;
  acknowledged_by?: string;           // display_name, not ID
  escalation_due_at?: string;
}

export interface AlertDetail extends AlertSummary {
  alt_m?: number;
  estimated_radius_m: number;
  push_sent_count: number;
  push_target_cells: string[];
  cot_sent: boolean;
  cot_sent_at?: string;
  notes?: string;
  track?: TrackSummary;
}

export interface AlertAcknowledgeRequest {
  notes?: string;
}

export interface AlertDismissRequest {
  reason: 'false_positive' | 'duplicate' | 'resolved' | 'other';
  notes?: string;
}

export interface AlertListResponse {
  alerts: AlertSummary[];
  total: number;
  active_count: number;
  critical_count: number;
}

// ============================================
// NODE FLEET TYPES (C2)
// ============================================

export interface NodeFleetSummary {
  online_count: number;
  mesh_only_count: number;
  degraded_count: number;
  offline_count: number;
  low_battery_count: number;
  avg_battery_pct: number;
  total_registered: number;
  active_last_5m: number;
  coverage_estimate_km2: number;
}

export interface NodeFleetNode {
  node_id: string;
  status: NodeStatus;
  lat?: number;
  lon?: number;
  battery_percent?: number;
  acoustic_snr_db?: number;
  ml_model_version: string;
  calibration_weight: number;
  last_seen_at: string;
  mesh_peer_count: number;
  network_type: string;
  has_lora: boolean;
}

// ============================================
// CALIBRATION TYPES
// ============================================

export interface CalibrationStartRequest {
  node_id: string;
  ambient_noise_db?: number;          // pre-measured
  gps_time_available: boolean;
  ntp_offset_ms: number;
}

export interface CalibrationCompleteRequest {
  calibration_id: string;
  ntp_offset_ms: number;
  ambient_noise_db: number;
  ambient_noise_type: 'urban' | 'suburban' | 'rural' | 'indoor';
  mic_response_profile: { [freq_hz: string]: number };
  reference_tone_detected: boolean;
  reference_delay_ms?: number;
  time_quality: 'excellent' | 'good' | 'acceptable' | 'poor';
}

export interface CalibrationResult {
  calibration_id: string;
  calibration_weight: number;
  expected_accuracy_m: number;
  valid_until: string;
  included_in_tdoa: boolean;
}

// ============================================
// MODEL UPDATE TYPES
// ============================================

export interface ModelInfo {
  version: string;
  platform: NodePlatform;
  model_type: string;
  framework: 'tflite' | 'coreml';
  file_size_bytes: number;
  sha256_checksum: string;
  download_url: string;
  accuracy_pct: number;
  inference_ms_target: number;
  released_at: string;
}

export interface ModelUpdateCheckRequest {
  node_id: string;
  current_model_version: string;
  platform: NodePlatform;
}

export interface ModelUpdateCheckResponse {
  update_available: boolean;
  current_version: string;
  latest_version?: string;
  model_info?: ModelInfo;
  rollout_percent?: number;
}

// ============================================
// MESH TOPOLOGY TYPES
// ============================================

export interface MeshLinkReport {
  peer_node_id: string;
  link_type: 'lora_868' | 'lora_915' | 'lora_433' | 'ble_5' | 'google_nearby';
  rssi_db?: number;
  snr_db?: number;
  link_quality: number;
}

export interface MeshTopologyReportRequest {
  node_id: string;
  links: MeshLinkReport[];
}

// ============================================
// EXPORT TYPES
// ============================================

export type ExportFormat = 'json' | 'csv' | 'kml' | 'cot_xml' | 'geojson' | 'pdf';

export interface ExportRequest {
  format: ExportFormat;
  scope: 'current_view' | 'time_range' | 'selected_tracks';
  track_ids?: string[];
  time_from?: string;
  time_to?: string;
  include_track_points?: boolean;
  include_node_list?: boolean;
  include_detection_events?: boolean;
}
```

---

## 3. ENDPOINT REFERENCE

### 3.1 Node Registration

#### POST /register-node

Registers a new sensor node with the backend.

**Request:**
```
POST /functions/v1/register-node
Content-Type: application/json
(No Authorization required for initial registration)
```

**Body:** `NodeRegistrationRequest`

**Response 201:**
```json
{
  "success": true,
  "data": {
    "node_id": "SN-a3f2",
    "jwt_token": "eyJhbGciOiJSUzI1NiJ9...",
    "jwt_expires_at": "2026-03-31T14:00:00Z",
    "model_info": {
      "version": "2.1.3",
      "platform": "android",
      "model_type": "acoustic",
      "framework": "tflite",
      "file_size_bytes": 491520,
      "sha256_checksum": "a3f2b8c1...",
      "download_url": "https://...",
      "accuracy_pct": 91.2,
      "inference_ms_target": 156,
      "released_at": "2026-03-01T00:00:00Z"
    },
    "config": {
      "acoustic_threshold": 0.40,
      "rf_threshold": 0.35,
      "heartbeat_interval_seconds": 60,
      "scan_interval_ms": 500,
      "mesh_max_hops": 3,
      "location_round_meters": 100,
      "alert_radius_m": 2000
    }
  },
  "meta": {
    "request_id": "req_01HXYZ...",
    "timestamp": "2026-03-24T14:00:00Z",
    "version": "1.0.0"
  }
}
```

**Response 409:** Node already registered with this device ID.

---

#### POST /refresh-node-token

Refreshes an expiring node JWT.

```
POST /functions/v1/refresh-node-token
Authorization: Bearer {current_jwt}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "jwt_token": "eyJhbGciOiJSUzI1NiJ9...",
    "jwt_expires_at": "2026-03-31T14:00:00Z"
  }
}
```

---

#### DELETE /deregister-node

Deletes all node data (GDPR Article 17). Irreversible.

```
DELETE /functions/v1/deregister-node
Authorization: Bearer {node_jwt}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "node_id": "SN-a3f2",
    "deleted_at": "2026-03-24T14:00:00Z",
    "records_deleted": {
      "node": 1,
      "detection_events": 1247,
      "rf_readings": 3891,
      "acoustic_readings": 2104,
      "node_health": 1440
    }
  }
}
```

---

### 3.2 Event Ingestion

#### POST /ingest-event

Ingests a single detection event.

```
POST /functions/v1/ingest-event
Authorization: Bearer {node_jwt}
Content-Type: application/json
```

**Body:** `DetectionEventRequest`

**Example body:**
```json
{
  "node_id": "SN-a3f2",
  "detected_at": "2026-03-24T14:23:07.143Z",
  "ntp_offset_ms": 2.3,
  "latitude": 47.1234,
  "longitude": 28.9876,
  "location_accuracy_m": 15.2,
  "altitude_m": 120.5,
  "acoustic_confidence": 0.87,
  "rf_anomaly_score": 0.62,
  "fused_confidence": 0.94,
  "detection_method": "acoustic_rf_fused",
  "frequency_bands": {
    "hz_500": 0.82,
    "hz_800": 0.91,
    "hz_1200": 0.73,
    "hz_2000": 0.45
  },
  "ambient_noise_db": 42.3,
  "rf_channel_energies": {
    "ch_2g_1": -72,
    "ch_2g_6": -68,
    "ch_2g_11": -78,
    "ch_5g_36": -82,
    "ch_5g_149": -85
  },
  "rf_baseline_deviation": 2.4,
  "threat_type": "fpv_quad",
  "threat_type_confidence": 0.83,
  "ml_model_version": "2.1.3",
  "inference_latency_ms": 151
}
```

**Response 202:**
```json
{
  "success": true,
  "data": {
    "event_id": "evt_01HXYZ...",
    "received_at": "2026-03-24T14:23:07.243Z",
    "track_id": "TRK-20260324-0001",
    "triangulation_status": "triangulating"
  }
}
```

---

#### POST /ingest-events-batch

Ingests a batch of detection events (for offline queue upload).

```
POST /functions/v1/ingest-events-batch
Authorization: Bearer {node_jwt}
Content-Type: application/json
```

**Body:** `BatchDetectionRequest` (max 100 events)

**Response 207 Multi-Status:**
```json
{
  "success": true,
  "data": {
    "processed": 47,
    "failed": 3,
    "event_ids": ["evt_01...", "evt_02...", "..."],
    "errors": [
      { "index": 12, "error": "Timestamp too old (>24h)" },
      { "index": 31, "error": "Invalid confidence range" },
      { "index": 44, "error": "Duplicate event_id" }
    ]
  }
}
```

---

### 3.3 Node Heartbeat

#### POST /node-heartbeat

Reports node health status.

```
POST /functions/v1/node-heartbeat
Authorization: Bearer {node_jwt}
Content-Type: application/json
```

**Body:** `NodeHeartbeatRequest`

**Response 200:** `NodeHeartbeatResponse`

---

### 3.4 Track Management (C2)

#### GET /tracks

List active and recent tracks.

```
GET /functions/v1/tracks
Authorization: Bearer {user_jwt}
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `state` | string[] | `["tracking","confirmed"]` | Track states to include |
| `threat_type` | string[] | all | Filter by threat type |
| `min_confidence` | number | 0.0 | Minimum confidence threshold |
| `time_from` | ISO8601 | -6h | Start time |
| `time_to` | ISO8601 | now | End time |
| `limit` | integer | 50 | Max results |
| `offset` | integer | 0 | Pagination offset |

**Response 200:** `TrackListResponse`

---

#### GET /tracks/:track_id

Get detailed track information.

```
GET /functions/v1/tracks/TRK-20260324-0001
Authorization: Bearer {user_jwt}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "track_id": "TRK-20260324-0001",
    "state": "confirmed",
    "threat_type": "fpv_quad",
    "confidence": 0.94,
    "current_lat": 47.1234,
    "current_lon": 28.9876,
    "current_alt_m": 120.0,
    "heading_deg": 247.0,
    "speed_ms": 23.6,
    "position_error_m": 62.0,
    "contributing_nodes": 4,
    "last_detection_at": "2026-03-24T14:23:07Z",
    "alert_id": "ALRT-20260324-0001",
    "alert_severity": "critical",
    "first_detection_at": "2026-03-24T14:21:33Z",
    "detection_count": 47,
    "max_confidence": 0.96,
    "triangulation_method": "tdoa_3point",
    "contributing_node_ids": ["SN-a3f2", "SN-b7c1", "SN-d4e9", "SN-f2a8"],
    "prediction_30s": { "lat": 47.1198, "lon": 28.9734 },
    "history_points": [...],
    "detection_breakdown": {
      "acoustic_events": 38,
      "rf_events": 12,
      "fused_events": 47
    }
  }
}
```

---

#### GET /tracks/:track_id/history

Get full track point history for replay.

```
GET /functions/v1/tracks/TRK-20260324-0001/history
Authorization: Bearer {user_jwt}
```

**Query Parameters:** `time_from`, `time_to`, `limit` (max 1000)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "track_id": "TRK-20260324-0001",
    "points": [
      {
        "estimated_at": "2026-03-24T14:21:33Z",
        "lat": 47.1356,
        "lon": 29.0012,
        "confidence": 0.72,
        "position_error_m": 89.0,
        "heading_deg": 247.0,
        "speed_ms": 21.0
      }
    ]
  }
}
```

---

#### POST /tracks/:track_id/export

Export a track in specified format.

```
POST /functions/v1/tracks/TRK-20260324-0001/export
Authorization: Bearer {user_jwt}
Content-Type: application/json
```

**Body:**
```json
{
  "format": "kml",
  "include_track_points": true
}
```

**Response 200:** Returns file download URL or inline content depending on format.

---

### 3.5 Alert Management (C2)

#### GET /alerts

List alerts.

```
GET /functions/v1/alerts
Authorization: Bearer {user_jwt}
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string[] | `["active","escalated"]` | Alert status filter |
| `severity` | string[] | all | Severity filter |
| `time_from` | ISO8601 | -6h | Start time |
| `time_to` | ISO8601 | now | End time |
| `limit` | integer | 100 | Max results |

**Response 200:** `AlertListResponse`

---

#### GET /alerts/:alert_id

Get detailed alert information.

```
GET /functions/v1/alerts/ALRT-20260324-0001
Authorization: Bearer {user_jwt}
```

**Response 200:** `AlertDetail`

---

#### POST /alerts/:alert_id/acknowledge

Acknowledge an alert.

```
POST /functions/v1/alerts/ALRT-20260324-0001/acknowledge
Authorization: Bearer {user_jwt}   (requires c2_operator+)
Content-Type: application/json
```

**Body:** `AlertAcknowledgeRequest`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "alert_id": "ALRT-20260324-0001",
    "status": "acknowledged",
    "acknowledged_at": "2026-03-24T14:23:45Z",
    "acknowledged_by": "Maj. Ionescu"
  }
}
```

---

#### POST /alerts/:alert_id/dismiss

Dismiss an alert.

```
POST /functions/v1/alerts/ALRT-20260324-0001/dismiss
Authorization: Bearer {user_jwt}   (requires c2_operator+)
Content-Type: application/json
```

**Body:** `AlertDismissRequest`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "alert_id": "ALRT-20260324-0001",
    "status": "dismissed",
    "dismissed_at": "2026-03-24T14:24:00Z"
  }
}
```

---

### 3.6 Node Fleet (C2 Admin)

#### GET /nodes/fleet

Get fleet summary statistics.

```
GET /functions/v1/nodes/fleet
Authorization: Bearer {user_jwt}   (requires c2_operator+)
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "online_count": 2847,
    "mesh_only_count": 312,
    "degraded_count": 89,
    "offline_count": 247,
    "low_battery_count": 134,
    "avg_battery_pct": 71.4,
    "total_registered": 3495,
    "active_last_5m": 2903,
    "coverage_estimate_km2": 127.4
  }
}
```

---

#### GET /nodes

List nodes with pagination and filtering.

```
GET /functions/v1/nodes
Authorization: Bearer {user_jwt}   (requires c2_operator+)
```

**Query Parameters:** `status`, `h3_cell`, `min_battery`, `limit`, `offset`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "nodes": [
      {
        "node_id": "SN-a3f2",
        "status": "online",
        "lat": 47.12,
        "lon": 28.98,
        "battery_percent": 72,
        "acoustic_snr_db": 18.4,
        "ml_model_version": "2.1.3",
        "calibration_weight": 0.94,
        "last_seen_at": "2026-03-24T14:22:58Z",
        "mesh_peer_count": 3,
        "network_type": "4g",
        "has_lora": false
      }
    ],
    "total": 3495,
    "returned": 100
  }
}
```

---

#### GET /nodes/:node_id

Get individual node detail.

```
GET /functions/v1/nodes/SN-a3f2
Authorization: Bearer {user_jwt}   (requires c2_operator+)
```

**Response 200:** Full node record including calibration data and recent health history.

---

#### POST /nodes/:node_id/calibrate

Trigger remote calibration for a node.

```
POST /functions/v1/nodes/SN-a3f2/calibrate
Authorization: Bearer {user_jwt}   (requires c2_commander+)
```

**Response 202:**
```json
{
  "success": true,
  "data": {
    "calibration_id": "cal_01HXYZ...",
    "node_id": "SN-a3f2",
    "status": "pending",
    "message": "Calibration request queued via Realtime channel"
  }
}
```

---

### 3.7 Calibration

#### POST /calibration/start

Start calibration session (called by mobile app).

```
POST /functions/v1/calibration/start
Authorization: Bearer {node_jwt}
Content-Type: application/json
```

**Body:** `CalibrationStartRequest`

**Response 201:**
```json
{
  "success": true,
  "data": {
    "calibration_id": "cal_01HXYZ...",
    "status": "in_progress",
    "reference_pulse_scheduled": true,
    "timeout_seconds": 120
  }
}
```

---

#### POST /calibration/:id/complete

Complete calibration and submit results.

```
POST /functions/v1/calibration/cal_01HXYZ.../complete
Authorization: Bearer {node_jwt}
Content-Type: application/json
```

**Body:** `CalibrationCompleteRequest`

**Response 200:** `CalibrationResult`

---

### 3.8 ML Model Updates

#### GET /model/check

Check if model update is available.

```
GET /functions/v1/model/check?platform=android&current_version=2.1.2
Authorization: Bearer {node_jwt}
```

**Response 200:** `ModelUpdateCheckResponse`

---

#### GET /model/download-url

Get authenticated download URL for model file.

```
GET /functions/v1/model/download-url?platform=android&version=2.1.3
Authorization: Bearer {node_jwt}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "download_url": "https://storage.supabase.co/...",
    "expires_at": "2026-03-24T15:00:00Z",
    "sha256_checksum": "a3f2b8c1...",
    "file_size_bytes": 491520
  }
}
```

---

### 3.9 Mesh Topology Reporting

#### POST /mesh/topology

Report current mesh connections.

```
POST /functions/v1/mesh/topology
Authorization: Bearer {node_jwt}
Content-Type: application/json
```

**Body:** `MeshTopologyReportRequest`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "links_recorded": 3,
    "links_updated": 1
  }
}
```

---

### 3.10 COT Export (C2)

#### POST /cot/export-stream

Configure COT export to FreeTAKServer.

```
POST /functions/v1/cot/export-stream
Authorization: Bearer {user_jwt}   (requires c2_commander+)
Content-Type: application/json
```

**Body:**
```json
{
  "enabled": true,
  "server_host": "10.1.1.100",
  "server_port": 8087,
  "protocol": "tcp",
  "tls_enabled": false,
  "min_confidence": 0.70,
  "update_interval_s": 5,
  "include_track_types": ["fpv_quad", "shahed_class", "unknown_uav"]
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "stream_id": "cot_stream_01",
    "status": "active",
    "message": "COT stream configured"
  }
}
```

---

#### GET /cot/tracks/:track_id

Get single track as COT XML.

```
GET /functions/v1/cot/tracks/TRK-20260324-0001
Authorization: Bearer {user_jwt}   (requires analyst+)
Accept: application/xml
```

**Response 200:** Returns COT XML document (see ARCHITECTURE.md §7.1).

---

### 3.11 Statistics & Export (C2)

#### GET /stats/detection-rate

Detection event rate over time.

```
GET /functions/v1/stats/detection-rate
Authorization: Bearer {user_jwt}
```

**Query Parameters:** `time_from`, `time_to`, `interval` (1m/5m/15m/1h), `h3_cell`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "series": [
      {
        "timestamp": "2026-03-24T14:00:00Z",
        "event_count": 142,
        "avg_confidence": 0.48,
        "unique_nodes": 89
      }
    ]
  }
}
```

---

#### POST /export

Export data in specified format.

```
POST /functions/v1/export
Authorization: Bearer {user_jwt}   (requires analyst+)
Content-Type: application/json
```

**Body:** `ExportRequest`

**Response 202:**
```json
{
  "success": true,
  "data": {
    "export_id": "exp_01HXYZ...",
    "status": "processing",
    "estimated_seconds": 5,
    "download_url": null
  }
}
```

#### GET /export/:export_id

Poll export status and get download URL.

```
GET /functions/v1/export/exp_01HXYZ...
Authorization: Bearer {user_jwt}
```

---

## 4. WEBSOCKET API (SUPABASE REALTIME)

### 4.1 Connection

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bymfcnwfyxuivinuzurr.supabase.co',
  '{anon_key_or_jwt}'
);
```

### 4.2 Realtime Channels

#### Channel: `alerts:{h3_cell}` (Mobile nodes — alert reception)

```typescript
// Mobile node subscribes to its H3 cell for geographic alerts
const alertChannel = supabase
  .channel(`alerts:${nodeH3CellR7}`)
  .on('broadcast', { event: 'new_alert' }, (payload) => {
    handleAlert(payload.payload as AlertBroadcastPayload);
  })
  .subscribe();

// Alert broadcast payload structure
interface AlertBroadcastPayload {
  alert_id: string;
  severity: AlertSeverity;
  threat_type: ThreatType;
  lat: number;
  lon: number;
  confidence: number;
  estimated_radius_m: number;
  triggered_at: string;
  // Distance and bearing pre-computed by backend for each target node
  distance_m?: number;
  bearing_deg?: number;
}
```

#### Channel: `tracks:global` (C2 Dashboard — track updates)

```typescript
const trackChannel = supabase
  .channel('tracks:global')
  .on(
    'postgres_changes',
    {
      event: '*',         // INSERT, UPDATE, DELETE
      schema: 'public',
      table: 'tracks',
      filter: "state=in.(tracking,confirmed)"
    },
    (payload) => {
      handleTrackChange(payload);
    }
  )
  .subscribe();

// Track change payload
interface TrackChangePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: TrackSummary | null;
  old: Partial<TrackSummary> | null;
  commit_timestamp: string;
}
```

#### Channel: `alerts:all` (C2 Dashboard — all alert events)

```typescript
const c2AlertChannel = supabase
  .channel('alerts:all')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'alerts'
    },
    (payload) => {
      handleAlertChange(payload);
    }
  )
  .subscribe();
```

#### Channel: `nodes:health` (C2 Admin — node fleet monitoring)

```typescript
const nodeHealthChannel = supabase
  .channel('nodes:health')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'nodes',
      filter: "status=neq.offline"
    },
    (payload) => {
      updateNodeOnMap(payload.new as NodeFleetNode);
    }
  )
  .subscribe();
```

#### Channel: `calibration:global` (Mobile — calibration pulses)

```typescript
const calibrationChannel = supabase
  .channel('calibration:global')
  .on('broadcast', { event: 'calibration_pulse' }, (payload) => {
    handleCalibrationPulse(payload.payload as CalibrationPulsePayload);
  })
  .subscribe();

interface CalibrationPulsePayload {
  calibration_id: string;
  target_zone?: string;     // H3 cell, null = global
  pulse_type: 'acoustic' | 'timing';
  scheduled_at: string;     // when to expect the reference tone
}
```

#### Channel: `openmct:telemetry` (OpenMCT — operational metrics)

```typescript
const telemetryChannel = supabase
  .channel('openmct:telemetry')
  .on('broadcast', { event: 'telemetry' }, (payload) => {
    pushToOpenMCT(payload.payload as TelemetryPayload);
  })
  .subscribe();

interface TelemetryPayload {
  ts: number;                  // Unix timestamp ms
  detection_rate_pm: number;   // events per minute
  rf_anomaly_index: number;    // 0.0-1.0
  active_node_count: number;
  mesh_node_count: number;
  active_track_count: number;
  critical_alert_count: number;
  coverage_km2: number;
}
```

### 4.3 Realtime Error Handling

```typescript
// Reconnection strategy
supabase.channel('tracks:global')
  .on('system', {}, (payload) => {
    if (payload.status === 'SUBSCRIBED') {
      console.log('Realtime connected');
    } else if (payload.status === 'CHANNEL_ERROR') {
      // Trigger fallback: REST polling at 5-second interval
      startFallbackPolling();
    } else if (payload.status === 'TIMED_OUT') {
      // Auto-reconnect handled by Supabase client
      console.warn('Realtime timeout, reconnecting...');
    }
  })
  .subscribe();
```

---

## 5. ERROR CODES REFERENCE

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `NODE_NOT_FOUND` | 404 | Node ID does not exist |
| `NODE_ALREADY_EXISTS` | 409 | Duplicate device ID |
| `INVALID_JWT` | 401 | JWT malformed or expired |
| `INSUFFICIENT_ROLE` | 403 | Role does not have permission |
| `VALIDATION_ERROR` | 422 | Request body validation failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit hit; check Retry-After header |
| `EVENT_TOO_OLD` | 422 | Detection event timestamp >24h old |
| `CONFIDENCE_OUT_OF_RANGE` | 422 | Confidence value outside 0.0-1.0 |
| `ALERT_NOT_FOUND` | 404 | Alert ID does not exist |
| `TRACK_NOT_FOUND` | 404 | Track ID does not exist |
| `CALIBRATION_EXPIRED` | 410 | Calibration session timed out |
| `MODEL_NOT_FOUND` | 404 | Model version not available |
| `EXPORT_FAILED` | 500 | Export generation failed |
| `COT_CONNECTION_FAILED` | 503 | Cannot connect to FreeTAKServer |
| `GDPR_DELETION_FAILED` | 500 | Node deletion partially failed |

---

## 6. SDK USAGE EXAMPLES

### 6.1 Android Kotlin (Node Registration + Event Ingestion)

```kotlin
// NodeApiClient.kt
class NodeApiClient(
    private val baseUrl: String,
    private val okHttpClient: OkHttpClient
) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun registerNode(request: NodeRegistrationRequest): NodeRegistrationResponse {
        val body = json.encodeToString(request).toRequestBody("application/json".toMediaType())
        val httpRequest = Request.Builder()
            .url("$baseUrl/register-node")
            .post(body)
            .build()

        return okHttpClient.newCall(httpRequest).await().use { response ->
            if (!response.isSuccessful) throw ApiException(response.code, response.body?.string())
            json.decodeFromString<ApiResponse<NodeRegistrationResponse>>(
                response.body!!.string()
            ).data!!
        }
    }

    suspend fun ingestEvent(event: DetectionEventRequest, jwtToken: String): DetectionEventResponse {
        val body = json.encodeToString(event).toRequestBody("application/json".toMediaType())
        val httpRequest = Request.Builder()
            .url("$baseUrl/ingest-event")
            .post(body)
            .addHeader("Authorization", "Bearer $jwtToken")
            .build()

        return okHttpClient.newCall(httpRequest).await().use { response ->
            if (response.code == 429) throw RateLimitException(
                response.header("Retry-After")?.toLong() ?: 60
            )
            if (!response.isSuccessful) throw ApiException(response.code, response.body?.string())
            json.decodeFromString<ApiResponse<DetectionEventResponse>>(
                response.body!!.string()
            ).data!!
        }
    }
}
```

### 6.2 TypeScript (C2 Dashboard — Track Subscribe)

```typescript
// useRealtimeTracks.ts
import { useEffect, useCallback } from 'react';
import { useTrackStore } from '../stores/trackStore';
import { supabase } from '../services/supabase';

export function useRealtimeTracks() {
  const { upsertTrack, removeTrack } = useTrackStore();

  const handleChange = useCallback((payload: TrackChangePayload) => {
    switch (payload.eventType) {
      case 'INSERT':
      case 'UPDATE':
        if (payload.new) upsertTrack(payload.new);
        break;
      case 'DELETE':
        if (payload.old?.track_id) removeTrack(payload.old.track_id);
        break;
    }
  }, [upsertTrack, removeTrack]);

  useEffect(() => {
    const channel = supabase
      .channel('tracks:global')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tracks',
        filter: "state=in.(tracking,confirmed)"
      }, handleChange)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [handleChange]);
}
```

---

## 7. VERSION HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-03-24 | APEX-SENTINEL Team | Initial API spec |

---

*End of API_SPECIFICATION.md — APEX-SENTINEL W1*
