# APEX-SENTINEL — API_SPECIFICATION.md
## Wave 7: Hardware Integration Layer + Data Pipeline Rectification + Terminal Phase Detection
### Wave 7 | Project: APEX-SENTINEL | Version: 7.0.0
### Date: 2026-03-25 | Status: APPROVED
### Supabase: bymfcnwfyxuivinuzurr (eu-west-2 London)

---

## 1. API OVERVIEW

APEX-SENTINEL W7 exposes four interface layers:

| Layer | Protocol | Port | Purpose |
|---|---|---|---|
| REST API | HTTP/1.1 | 3001 | BearingReport ingestion, node registration, status |
| WebSocket | WS | 3001 | Dashboard real-time state feed (10Hz) |
| NATS JetStream | NATS | 4222 | Internal pipeline messaging (not public-facing) |
| ONVIF/SOAP | HTTP | Camera IP | PTZ camera control (outbound from server) |

Base URL (production): `http://[fortress-ip]:3001`
Base URL (local dev): `http://localhost:3001`

Authentication: API key via header `X-API-Key: <key>`. Keys stored in env `APEX_API_KEYS` (comma-separated list). Dashboard endpoints use session cookie (separate auth flow). ONVIF credentials are outbound-only (stored in env, not exposed via API).

---

## 2. REST API

### 2.1 Global Request/Response Format

All REST endpoints:
- Content-Type: `application/json`
- All timestamps: Unix milliseconds (integer, BIGINT-compatible)
- All coordinates: WGS-84 decimal degrees (double precision)
- All bearings: true north, 0–360° (exclusive upper bound)
- Error format:

```json
{
  "error": "INVALID_BEARING",
  "message": "bearing_deg must be in range [0, 360)",
  "field": "bearing_deg",
  "received": -5.2
}
```

Standard HTTP status codes:
- `200 OK` — successful read
- `201 Created` — successful write
- `400 Bad Request` — validation error
- `401 Unauthorized` — missing or invalid API key
- `404 Not Found` — resource not found
- `409 Conflict` — duplicate (node_id already registered)
- `429 Too Many Requests` — rate limit exceeded
- `500 Internal Server Error` — pipeline fault

---

### 2.2 Bearing Reports

#### `POST /api/v1/bearing-reports`

Submit a bearing observation from a mobile node. Called by field operators' phones or CLI tools. High-frequency: expect 0.5–2 Hz per active node.

**Request headers**:
```
X-API-Key: <mobile-node-api-key>
Content-Type: application/json
```

**Request body**:
```json
{
  "node_id": "mobile-george-01",
  "lat": 48.4521,
  "lng": 35.0653,
  "bearing_deg": 127.4,
  "uncertainty_deg": 7.0,
  "acoustic_confidence": 0.84,
  "drone_class_hint": "shahed-136",
  "compass_calibrated": true,
  "gps_accuracy_m": 4.5,
  "t_unix_ms": 1711362000000
}
```

**Field constraints**:
| Field | Type | Required | Constraints |
|---|---|---|---|
| `node_id` | string | yes | 3–64 chars, alphanumeric + dash |
| `lat` | number | yes | -90.0 to 90.0 |
| `lng` | number | yes | -180.0 to 180.0 |
| `bearing_deg` | number | yes | 0.0 to 360.0 (exclusive) |
| `uncertainty_deg` | number | yes | 0.0 to 180.0 |
| `acoustic_confidence` | number | yes | 0.0 to 1.0 |
| `drone_class_hint` | string | no | One of known drone classes or null |
| `compass_calibrated` | boolean | no | Default false |
| `gps_accuracy_m` | number | no | > 0 |
| `t_unix_ms` | integer | yes | Must be within ±30s of server time |

**Response `201 Created`**:
```json
{
  "id": "a1b2c3d4-...",
  "accepted": true,
  "triangulation_result": {
    "fix_available": true,
    "lat": 48.4631,
    "lng": 35.0821,
    "uncertainty_1sigma_m": 67.3,
    "contributing_nodes": ["mobile-george-01", "mobile-cat-01"],
    "method": "bearing_triangulation",
    "t_unix_ms": 1711362000050
  }
}
```

If no triangulation fix is available (< 2 reports in window):
```json
{
  "id": "a1b2c3d4-...",
  "accepted": true,
  "triangulation_result": {
    "fix_available": false,
    "reason": "insufficient_nodes",
    "nodes_required": 2,
    "nodes_available": 1
  }
}
```

**Rate limit**: 10 requests/second per node_id. Excess returns `429`.

---

#### `GET /api/v1/bearing-reports`

Retrieve recent bearing reports for audit or debugging.

**Query params**:
| Param | Type | Default | Description |
|---|---|---|---|
| `since_ms` | integer | now - 60000 | Unix ms lower bound |
| `node_id` | string | — | Filter to specific node |
| `limit` | integer | 100 | Max results, capped at 1000 |

**Response `200 OK`**:
```json
{
  "reports": [
    {
      "id": "...",
      "node_id": "mobile-george-01",
      "lat": 48.4521,
      "lng": 35.0653,
      "bearing_deg": 127.4,
      "uncertainty_deg": 7.0,
      "acoustic_confidence": 0.84,
      "t_unix_ms": 1711362000000,
      "used_in_fix": true,
      "fix_lat": 48.4631,
      "fix_lng": 35.0821
    }
  ],
  "total": 42,
  "query_time_ms": 3
}
```

---

### 2.3 Hardware Node Registration

#### `POST /api/v1/nodes`

Register a hardware node (acoustic, PTZ, jammer, SkyNet, mobile).

**Request body**:
```json
{
  "node_id": "alpha-01",
  "node_type": "acoustic",
  "display_name": "Alpha Node (NW corner)",
  "lat": 48.4521,
  "lng": 35.0653,
  "alt_m": 12.0,
  "capabilities": ["16kHz", "tflite_inference", "elrs_monitor"],
  "hardware_config": {
    "sample_rate_hz": 16000,
    "mic_model": "BOYA_BY-MM1",
    "rtlsdr_present": true
  },
  "firmware_version": "w7.0.0",
  "ip_address": "10.0.1.101",
  "site_id": "radisson-demo-2026",
  "notes": "RPi 4 Model B 8GB, outdoor weatherproof housing"
}
```

**Allowed `node_type` values**: `acoustic | ptz | radar | jammer | skynet | mobile`

**PTZ node `hardware_config` example**:
```json
{
  "onvif_url": "http://192.168.1.100/onvif/device_service",
  "pan_range_deg": 360,
  "tilt_range_min_deg": -30,
  "tilt_range_max_deg": 90,
  "mount_heading_deg": 0,
  "mount_lat": 48.4521,
  "mount_lng": 35.0653,
  "mount_alt_m": 8.0
}
```

**Jammer node `hardware_config` example**:
```json
{
  "frequencies_mhz": [902, 928],
  "secondary_frequencies_mhz": [1575.42],
  "max_power_dbm": 30,
  "directional": false,
  "controller_url": "http://192.168.1.200/api/jammer"
}
```

**SkyNet node `hardware_config` example**:
```json
{
  "net_speed_ms": 35,
  "max_range_m": 200,
  "net_radius_m": 5,
  "min_engagement_alt_m": 5,
  "max_engagement_alt_m": 80,
  "pan_speed_degs": 60,
  "tilt_speed_degs": 45,
  "controller_nats_subject": "sentinel.skynet.commands.skynet-01"
}
```

**Response `201 Created`**:
```json
{
  "id": "uuid-...",
  "node_id": "alpha-01",
  "registered": true,
  "pipeline_reloaded": true
}
```

`pipeline_reloaded: true` means the running SentinelPipeline has dynamically added the node to NodeRegistry without restart.

**Response `409 Conflict`** (node_id already registered):
```json
{
  "error": "NODE_ALREADY_REGISTERED",
  "message": "node_id 'alpha-01' is already registered. Use PUT /api/v1/nodes/alpha-01 to update.",
  "node_id": "alpha-01"
}
```

---

#### `GET /api/v1/nodes`

List all registered hardware nodes.

**Query params**:
| Param | Type | Description |
|---|---|---|
| `type` | string | Filter by node_type |
| `online` | boolean | Filter by online status |
| `site_id` | string | Filter by site |

**Response `200 OK`**:
```json
{
  "nodes": [
    {
      "node_id": "alpha-01",
      "node_type": "acoustic",
      "display_name": "Alpha Node (NW corner)",
      "lat": 48.4521,
      "lng": 35.0653,
      "alt_m": 12.0,
      "online": true,
      "firmware_version": "w7.0.0",
      "last_heartbeat": "2026-03-25T14:32:01.000Z",
      "heartbeat_age_s": 4.2,
      "capabilities": ["16kHz", "tflite_inference", "elrs_monitor"]
    }
  ],
  "total": 4,
  "online_count": 3
}
```

---

#### `PUT /api/v1/nodes/:nodeId`

Update a registered node's configuration. Partial updates supported (only provided fields are changed).

**Request body** (all fields optional):
```json
{
  "lat": 48.4525,
  "alt_m": 14.0,
  "firmware_version": "w7.0.1",
  "hardware_config": {
    "sample_rate_hz": 16000
  }
}
```

**Response `200 OK`**: Full updated node object (same schema as GET /api/v1/nodes item).

---

#### `DELETE /api/v1/nodes/:nodeId`

Deregister a hardware node. Soft delete: sets `online=false`, does not remove from database.

**Response `200 OK`**:
```json
{
  "node_id": "alpha-01",
  "deregistered": true
}
```

---

### 2.4 Jammer Control

#### `POST /api/v1/jammer/activate`

Manually activate a jammer (bypasses AUTO/CONFIRM policy for authorized operators).

**Request headers**:
```
X-API-Key: <operator-api-key>
X-Operator-ID: george-indigo-01
```

**Request body**:
```json
{
  "jammer_node_id": "jammer-01",
  "frequency_mhz": 902.5,
  "bandwidth_mhz": 26,
  "power_dbm": 25,
  "direction_deg": 127.0,
  "track_id": "uuid-track-...",
  "reason": "manual_override",
  "max_duration_s": 60
}
```

**Response `201 Created`**:
```json
{
  "event_id": "uuid-...",
  "jammer_node_id": "jammer-01",
  "activated": true,
  "hardware_ack": false,
  "hardware_ack_pending": true,
  "estimated_ack_ms": 600,
  "t_command_unix_ms": 1711362001000
}
```

---

#### `POST /api/v1/jammer/deactivate`

Manually deactivate a jammer.

**Request body**:
```json
{
  "jammer_node_id": "jammer-01",
  "reason": "manual_override"
}
```

**Response `200 OK`**:
```json
{
  "jammer_node_id": "jammer-01",
  "deactivated": true,
  "active_duration_s": 47.3
}
```

---

#### `GET /api/v1/jammer/status`

Get current jammer status for all registered jammer nodes.

**Response `200 OK`**:
```json
{
  "jammers": [
    {
      "node_id": "jammer-01",
      "online": true,
      "active": true,
      "frequency_mhz": 902.5,
      "active_since_ms": 1711362001000,
      "active_duration_s": 47.3,
      "duty_cycle_remaining_s": 72.7,
      "track_id": "uuid-track-...",
      "authorization": "AUTO"
    }
  ]
}
```

---

### 2.5 SkyNet Commands

#### `POST /api/v1/skynet/preposition`

Command SkyNet net-gun to pre-position for an intercept.

**Request headers**:
```
X-API-Key: <operator-api-key>
X-Operator-ID: george-indigo-01
```

**Request body**:
```json
{
  "skynet_node_id": "skynet-01",
  "track_id": "uuid-track-...",
  "intercept_lat": 48.4631,
  "intercept_lng": 35.0821,
  "intercept_alt_m": 35.0,
  "t_intercept_unix_ms": 1711362010000,
  "monte_carlo_confidence": 0.87,
  "authorization": "george-indigo-01"
}
```

**Response `201 Created`**:
```json
{
  "activation_id": "uuid-...",
  "skynet_node_id": "skynet-01",
  "preposition_commanded": true,
  "motor_slew_estimated_ms": 1400,
  "ready_at_unix_ms": 1711362002400,
  "safety_checks": {
    "alt_ok": true,
    "position_ok": true,
    "friendly_clear": true,
    "all_clear": true
  }
}
```

If safety interlocks fail:
```json
{
  "activation_id": "uuid-...",
  "preposition_commanded": false,
  "safety_checks": {
    "alt_ok": false,
    "position_ok": true,
    "friendly_clear": true,
    "all_clear": false
  },
  "error": "SAFETY_INTERLOCK",
  "message": "Intercept altitude 3.2m is below minimum 5.0m"
}
```

---

#### `POST /api/v1/skynet/fire`

Issue fire command to SkyNet net-gun.

**Request body**:
```json
{
  "activation_id": "uuid-from-preposition-response",
  "skynet_node_id": "skynet-01",
  "track_id": "uuid-track-...",
  "authorization": "george-indigo-01",
  "t_fire_unix_ms": 1711362009000
}
```

**Response `201 Created`**:
```json
{
  "fire_command_id": "uuid-...",
  "fired": true,
  "t_fire_unix_ms": 1711362009000,
  "hardware_ack": false,
  "note": "Fire command queued. Hardware ACK via WebSocket event 'skynet_status'."
}
```

---

#### `POST /api/v1/skynet/abort`

Abort a pending SkyNet pre-position or fire sequence.

**Request body**:
```json
{
  "activation_id": "uuid-...",
  "reason": "manual_abort"
}
```

**Response `200 OK`**:
```json
{
  "activation_id": "uuid-...",
  "aborted": true,
  "previous_state": "PREPOSITION"
}
```

---

### 2.6 Terminal Phase

#### `GET /api/v1/terminal-phase/:trackId`

Get current terminal phase state for a track.

**Response `200 OK`**:
```json
{
  "track_id": "uuid-...",
  "current_state": "TERMINAL",
  "state_since_ms": 1711362005000,
  "drone_class": "shahed-136",
  "indicators": {
    "SPEED_INCREASE": {
      "triggered": true,
      "value_ms": 68.4,
      "threshold_ms": 63.7,
      "confidence": 0.91
    },
    "COURSE_CORRECTION": {
      "triggered": true,
      "value_degs": 12.3,
      "threshold_degs": 8.0,
      "confidence": 0.85
    },
    "ALTITUDE_DESCENT": {
      "triggered": true,
      "value_ms": -22.1,
      "threshold_ms": -15.0,
      "confidence": 0.92
    },
    "RF_SILENCE": {
      "triggered": false,
      "applicable": false,
      "reason": "drone_class_no_rf_link"
    }
  },
  "triggered_count": 3,
  "overall_confidence": 0.89,
  "jammer_active": true,
  "skynet_engaged": false
}
```

---

#### `GET /api/v1/terminal-phase`

List all tracks currently in non-CRUISE terminal phase states.

**Response `200 OK`**:
```json
{
  "active_threats": [
    {
      "track_id": "uuid-...",
      "current_state": "TERMINAL",
      "drone_class": "shahed-136",
      "state_since_ms": 1711362005000,
      "triggered_indicators": ["SPEED_INCREASE", "COURSE_CORRECTION", "ALTITUDE_DESCENT"]
    }
  ],
  "total": 1
}
```

---

### 2.7 Pipeline Status

#### `GET /api/v1/status`

System health check. Used by dashboard and monitoring.

**Response `200 OK`**:
```json
{
  "status": "operational",
  "version": "7.0.0",
  "uptime_s": 3621,
  "pipeline": {
    "running": true,
    "nats_connected": true,
    "supabase_connected": true,
    "nodes_registered": 4,
    "nodes_online": 3,
    "active_tracks": 1,
    "sample_rate_hz": 16000
  },
  "hardware": {
    "ptz_cameras": [
      { "node_id": "ptz-main", "connected": true, "update_hz": 100 }
    ],
    "jammers": [
      { "node_id": "jammer-01", "online": true, "active": false }
    ],
    "skynet": [
      { "node_id": "skynet-01", "online": true, "state": "IDLE" }
    ]
  },
  "t_unix_ms": 1711362001000
}
```

---

## 3. WEBSOCKET API — DASHBOARD FEED

### 3.1 Connection

```
ws://[fortress-ip]:3001/ws/dashboard
```

Connection requires session cookie from dashboard login, OR API key in query param:
```
ws://[fortress-ip]:3001/ws/dashboard?api_key=<key>
```

On connection, server immediately sends the full current state snapshot (same format as periodic update).

### 3.2 Server → Client Messages

All messages are JSON with a `type` field.

#### `state_update` (10Hz)

Full state snapshot sent at 10Hz. Dashboard replaces its full state with each update.

```json
{
  "type": "state_update",
  "t_unix_ms": 1711362001000,
  "tracks": [
    {
      "track_id": "uuid-...",
      "drone_class": "shahed-136",
      "acoustic_confidence": 0.91,
      "lat": 48.4631,
      "lng": 35.0821,
      "alt_m": 120.0,
      "speed_ms": 52.3,
      "heading_deg": 127.4,
      "terminal_phase_state": "TERMINAL",
      "indicators_triggered": ["SPEED_INCREASE", "COURSE_CORRECTION", "ALTITUDE_DESCENT"],
      "jammer_active": true,
      "skynet_engaged": false,
      "monte_carlo_ellipse": {
        "center_lat": 48.4700,
        "center_lng": 35.0900,
        "semi_major_m": 145,
        "semi_minor_m": 62,
        "bearing_deg": 127.4,
        "confidence_pct": 95
      },
      "last_seen_ms": 1711362000800
    }
  ],
  "nodes": [
    {
      "node_id": "alpha-01",
      "node_type": "acoustic",
      "lat": 48.4521,
      "lng": 35.0653,
      "online": true,
      "heartbeat_age_s": 1.2
    }
  ],
  "hardware": {
    "ptz": {
      "node_id": "ptz-main",
      "connected": true,
      "current_bearing_deg": 127.4,
      "current_tilt_deg": -8.3,
      "update_hz": 100,
      "last_command_ms": 1711362000990
    },
    "jammer": {
      "node_id": "jammer-01",
      "active": true,
      "frequency_mhz": 902.5,
      "active_duration_s": 5.3,
      "duty_cycle_remaining_s": 114.7,
      "authorization": "AUTO"
    },
    "skynet": {
      "node_id": "skynet-01",
      "state": "IDLE",
      "last_activation_ms": null
    }
  },
  "bearing_reports": [
    {
      "node_id": "mobile-george-01",
      "lat": 48.4521,
      "lng": 35.0653,
      "bearing_deg": 127.4,
      "age_ms": 450
    }
  ]
}
```

#### `terminal_phase_change` (immediate, on FSM transition)

Sent immediately when any track changes terminal phase state.

```json
{
  "type": "terminal_phase_change",
  "t_unix_ms": 1711362005000,
  "track_id": "uuid-...",
  "previous_state": "ALERT",
  "new_state": "TERMINAL",
  "drone_class": "shahed-136",
  "triggered_indicators": ["SPEED_INCREASE", "COURSE_CORRECTION", "ALTITUDE_DESCENT"],
  "overall_confidence": 0.89,
  "countermeasures_auto_triggered": {
    "jammer": true,
    "skynet_preposition": false
  }
}
```

#### `jammer_event` (immediate, on activation/deactivation)

```json
{
  "type": "jammer_event",
  "t_unix_ms": 1711362005200,
  "event_type": "ACTIVATE",
  "jammer_node_id": "jammer-01",
  "track_id": "uuid-...",
  "frequency_mhz": 902.5,
  "authorization": "AUTO",
  "hardware_ack": false
}
```

#### `skynet_event` (immediate, on pre-position/fire/abort)

```json
{
  "type": "skynet_event",
  "t_unix_ms": 1711362005800,
  "activation_type": "PREPOSITION",
  "skynet_node_id": "skynet-01",
  "track_id": "uuid-...",
  "intercept_lat": 48.4631,
  "intercept_lng": 35.0821,
  "intercept_alt_m": 35.0,
  "t_fire_countdown_ms": 4200,
  "safety_all_clear": true
}
```

#### `ptz_acquisition` (immediate, on initial PTZ target acquisition)

```json
{
  "type": "ptz_acquisition",
  "t_unix_ms": 1711362005350,
  "camera_node_id": "ptz-main",
  "track_id": "uuid-...",
  "bearing_deg": 127.4,
  "tilt_deg": -8.3,
  "latency_ms": 98
}
```

#### `node_status_change` (immediate, on node online/offline)

```json
{
  "type": "node_status_change",
  "t_unix_ms": 1711362001000,
  "node_id": "alpha-01",
  "online": false,
  "reason": "heartbeat_timeout"
}
```

#### `error` (immediate, on pipeline fault)

```json
{
  "type": "error",
  "t_unix_ms": 1711362001000,
  "code": "PTZ_CONNECTION_LOST",
  "message": "Lost TCP connection to Dahua camera ptz-main. Reconnecting...",
  "severity": "warning"
}
```

### 3.3 Client → Server Messages

The dashboard is read-only for most operations. Only operator commands require C→S messages:

#### Jammer confirm (when policy = CONFIRM):
```json
{
  "type": "jammer_confirm",
  "jammer_node_id": "jammer-01",
  "track_id": "uuid-...",
  "operator_id": "george-indigo-01"
}
```

#### Jammer manual deactivate:
```json
{
  "type": "jammer_deactivate",
  "jammer_node_id": "jammer-01",
  "operator_id": "george-indigo-01"
}
```

#### SkyNet fire confirm (when policy = CONFIRM):
```json
{
  "type": "skynet_fire_confirm",
  "activation_id": "uuid-...",
  "operator_id": "george-indigo-01"
}
```

---

## 4. NATS JETSTREAM — INTERNAL MESSAGE SCHEMAS

These are not public API surfaces but are documented here for pipeline integration and testing.

### 4.1 `sentinel.bearing.{nodeId}`

Published by: mobile node REST ingestion handler → NATS bridge
Consumed by: BearingTriangulator

```typescript
interface BearingNatsMessage {
  nodeId: string;
  lat: number;
  lng: number;
  bearing_deg: number;
  uncertainty_deg: number;
  acoustic_confidence: number;
  drone_class_hint?: string;
  compass_calibrated: boolean;
  gps_accuracy_m?: number;
  t_unix_ms: number;
  report_id: string;  // Supabase bearing_reports.id
}
```

### 4.2 `sentinel.rf.elrs.{nodeId}`

Published by: ElrsMonitor
Consumed by: TerminalPhaseDetector (RF_SILENCE indicator)

```typescript
interface ElrsNatsMessage {
  nodeId: string;
  rssi_dbm: number;
  packet_rate_hz: number;
  link_quality_pct: number;
  link_lost: boolean;              // true = RSSI dropped >20dB in <3s
  frequency_mhz: number;           // 902–928 MHz
  t_unix_ms: number;
}
```

### 4.3 `sentinel.terminal.{trackId}`

Published by: TerminalPhaseDetector
Consumed by: PtzSlaveOutput, JammerActivation, PhysicalInterceptCoordinator, SentinelPipeline, DashboardServer

```typescript
interface TerminalPhaseNatsMessage {
  trackId: string;
  previousState: 'CRUISE' | 'ALERT' | 'TERMINAL' | 'IMPACT';
  newState: 'CRUISE' | 'ALERT' | 'TERMINAL' | 'IMPACT';
  droneClass: string;
  indicators: {
    SPEED_INCREASE: IndicatorResult;
    COURSE_CORRECTION: IndicatorResult;
    ALTITUDE_DESCENT: IndicatorResult;
    RF_SILENCE: IndicatorResult;
  };
  triggeredCount: number;
  overallConfidence: number;
  ekfState: {
    lat: number;
    lng: number;
    alt_m: number;
    speed_ms: number;
    heading_deg: number;
  };
  t_unix_ms: number;
}
```

### 4.4 `sentinel.ptz.bearing.{trackId}`

Published by: SentinelPipeline (at 100Hz when track is active)
Consumed by: PtzSlaveOutput

```typescript
interface PtzBearingNatsMessage {
  trackId: string;
  predicted_lat: number;     // EKF position + 115ms lookahead
  predicted_lng: number;
  predicted_alt_m: number;
  bearing_true_north_deg: number;  // from camera mount position
  elevation_deg: number;           // from camera mount elevation
  range_m: number;                 // estimated range from camera
  confidence: number;
  t_unix_ms: number;
}
```

### 4.5 `sentinel.jammer.commands`

Published by: JammerActivation
Consumed by: Jammer hardware controller bridge

```typescript
interface JammerCommandNatsMessage {
  command: 'ACTIVATE' | 'DEACTIVATE';
  jammer_node_id: string;
  frequency_mhz?: number;
  bandwidth_mhz?: number;
  power_dbm?: number;
  direction_deg?: number;
  track_id?: string;
  authorize_id: string;
  event_id: string;            // jammer_events.id for ACK correlation
  t_unix_ms: number;
}
```

### 4.6 `sentinel.skynet.preposition` and `sentinel.skynet.fire`

Published by: PhysicalInterceptCoordinator
Consumed by: SkyNet hardware controller

```typescript
interface SkyNetPrepositionMessage {
  command: 'PREPOSITION';
  skynet_node_id: string;
  activation_id: string;
  track_id: string;
  intercept_lat: number;
  intercept_lng: number;
  intercept_alt_m: number;
  t_intercept_unix_ms: number;
  t_unix_ms: number;
}

interface SkyNetFireMessage {
  command: 'FIRE';
  skynet_node_id: string;
  activation_id: string;
  track_id: string;
  intercept_lat: number;
  intercept_lng: number;
  intercept_alt_m: number;
  t_fire_unix_ms: number;
  authorization: string;
  t_unix_ms: number;
}
```

---

## 5. ONVIF SOAP — OUTBOUND PTZ API

### 5.1 Device Discovery (optional, startup)

```xml
<!-- WS-Discovery probe — sent to 239.255.255.250:3702 -->
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://docs.oasis-open.org/ws-dd/ns/discovery/2009/01">
  <s:Header>
    <a:Action>http://docs.oasis-open.org/ws-dd/ns/discovery/2009/01/Probe</a:Action>
    <a:MessageID>urn:uuid:{uuid}</a:MessageID>
    <a:To>urn:docs-oasis-open-org:ws-dd:ns:discovery:2009:01</a:To>
  </s:Header>
  <s:Body>
    <d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe>
  </s:Body>
</s:Envelope>
```

### 5.2 GetProfiles — PTZ Profile Discovery

```xml
POST http://{camera_ip}/onvif/device_service HTTP/1.1
Content-Type: application/soap+xml; charset=utf-8
SOAPAction: "http://www.onvif.org/ver10/media/wsdl/GetProfiles"

<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Header>{WS-Security header — see DESIGN.md §6.3}</s:Header>
  <s:Body>
    <trt:GetProfiles xmlns:trt="http://www.onvif.org/ver10/media/wsdl"/>
  </s:Body>
</s:Envelope>
```

### 5.3 AbsoluteMove — Initial Target Acquisition

```xml
POST http://{camera_ip}/onvif/ptz_service HTTP/1.1
Content-Type: application/soap+xml; charset=utf-8

<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"
            xmlns:tt="http://www.onvif.org/ver10/schema">
  <s:Header>{WS-Security}</s:Header>
  <s:Body>
    <tptz:AbsoluteMove>
      <tptz:ProfileToken>MainStream</tptz:ProfileToken>
      <tptz:Position>
        <tt:PanTilt x="{pan_normalized}" y="{tilt_normalized}"
          space="http://www.onvif.org/ver10/tptz/PanTiltSpaces/PositionGenericSpace"/>
        <tt:Zoom x="0.1"
          space="http://www.onvif.org/ver10/tptz/ZoomSpaces/PositionGenericSpace"/>
      </tptz:Position>
      <tptz:Speed>
        <tt:PanTilt x="1.0" y="1.0"/>
        <tt:Zoom x="0.5"/>
      </tptz:Speed>
    </tptz:AbsoluteMove>
  </s:Body>
</s:Envelope>
```

`pan_normalized`: -1.0 (full left) to +1.0 (full right) relative to camera mount heading.
`tilt_normalized`: -1.0 (full down) to +1.0 (full up).

### 5.4 ContinuousMove — 100Hz Tracking

```xml
<tptz:ContinuousMove>
  <tptz:ProfileToken>MainStream</tptz:ProfileToken>
  <tptz:Velocity>
    <tt:PanTilt x="{pan_velocity}" y="{tilt_velocity}"
      space="http://www.onvif.org/ver10/tptz/PanTiltSpaces/VelocityGenericSpace"/>
    <tt:Zoom x="0.0"
      space="http://www.onvif.org/ver10/tptz/ZoomSpaces/VelocityGenericSpace"/>
  </tptz:Velocity>
  <tptz:Timeout>PT0.1S</tptz:Timeout>
</tptz:ContinuousMove>
```

`pan_velocity`: -1.0 to +1.0 proportional to angular error. PID controller maintains smooth tracking:

```typescript
// PtzPidController — keeps drone centered in frame
const KP = 0.8;
const KI = 0.05;
const KD = 0.1;

panVelocity = KP * panError + KI * panIntegral + KD * panDerivative;
panVelocity = Math.max(-1.0, Math.min(1.0, panVelocity)); // clamp
```

---

## 6. RATE LIMITS AND THROTTLING

| Endpoint | Rate Limit | Burst |
|---|---|---|
| `POST /api/v1/bearing-reports` | 10/s per node_id | 20 |
| `POST /api/v1/nodes` | 5/min per API key | 10 |
| `GET /api/v1/bearing-reports` | 60/min per API key | 120 |
| `POST /api/v1/jammer/*` | 10/min per API key | 20 |
| `POST /api/v1/skynet/*` | 5/min per API key | 10 |
| WebSocket `state_update` | 10Hz server push | — |
| ONVIF `ContinuousMove` | 100Hz (outbound) | — |
| NATS `sentinel.ptz.bearing.*` | 100Hz per track | — |

---

## 7. ERROR CODES

| Code | HTTP Status | Description |
|---|---|---|
| `INVALID_BEARING` | 400 | bearing_deg outside [0, 360) |
| `INVALID_COORDINATE` | 400 | lat/lng out of WGS-84 range |
| `TIMESTAMP_DRIFT` | 400 | t_unix_ms more than 30s from server time |
| `NODE_NOT_FOUND` | 404 | node_id not registered |
| `NODE_ALREADY_REGISTERED` | 409 | node_id already exists |
| `NODE_OFFLINE` | 409 | target node is offline |
| `SAFETY_INTERLOCK` | 409 | SkyNet safety check failed |
| `JAMMER_DUTY_CYCLE` | 409 | Jammer at duty cycle limit |
| `INSUFFICIENT_NODES` | 409 | BearingTriangulator needs ≥2 nodes |
| `TRACK_NOT_FOUND` | 404 | track_id not in active tracks |
| `UNAUTHORIZED` | 401 | Missing or invalid API key |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `NATS_UNAVAILABLE` | 503 | NATS connection lost |
| `SUPABASE_UNAVAILABLE` | 503 | Supabase connection lost |
| `PTZ_CONNECTION_LOST` | 503 | ONVIF TCP connection down |
| `ONVIF_AUTH_FAILED` | 502 | Dahua camera rejected credentials |
