# APEX-SENTINEL — API Specification
## W2 | PROJECTAPEX Doc 05/21 | 2026-03-24

---

## 1. API Overview

W2 exposes two API surfaces:

1. **Supabase Edge Functions** — REST/HTTP endpoints for node lifecycle management and alert dispatch
2. **NATS JetStream subjects** — pub/sub contract for real-time event streaming

All HTTP endpoints follow the response envelope defined in DESIGN.md §9. All timestamps in API responses are ISO 8601 UTC. Internal `timestamp_us` fields are INT64 microseconds since Unix epoch.

Base URL: `https://bymfcnwfyxuivinuzurr.supabase.co`

---

## 2. Authentication

### 2.1 Node Authentication (mTLS)

All node-to-backend calls use mutual TLS. The node presents its client certificate (issued by APEX-SENTINEL Node CA) in the TLS handshake.

Edge Functions verify the client certificate by:
1. Extracting the `X-Client-Cert-Fingerprint` header (injected by the TLS terminator/CDN)
2. Querying `nodes.cert_fingerprint` for the presented `node_id`
3. Comparing SHA-256 fingerprints

```
Required headers for node-authenticated requests:
  X-Client-Cert-Fingerprint: <sha256-hex-of-DER-encoded-cert>
  Content-Type: application/json
  X-Node-Id: <node_id>
```

### 2.2 Operator Authentication (JWT)

Operators authenticate via Supabase Auth. JWT issued on login, valid 1 hour, refreshable via httpOnly cookie (7-day refresh token).

```
Required headers for JWT-authenticated requests:
  Authorization: Bearer <supabase_jwt>
  Content-Type: application/json
```

JWT claims used by Edge Functions:
- `sub`: operator UUID
- `role`: one of `ops_admin`, `c2_operator`, `privacy_officer`, `node_operator`

### 2.3 Rate Limits

| Endpoint | Limit | Window | Identity |
|----------|-------|--------|----------|
| register-node | 1 req | 30s | per node_id |
| ingest-event | 100 req | 60s | per node_id |
| node-health | 6 req | 60s | per node_id |
| node-status | 60 req | 60s | per node_id or operator |
| alert-router | 30 req | 60s | per operator |

Rate limit headers returned on all responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 94
X-RateLimit-Reset: 1711283100
```

---

## 3. Edge Function: register-node

### POST /functions/v1/register-node

Registers a new detection node with the backend. Idempotent for the same node_id and matching certificate.

**Auth:** mTLS certificate (node_agent)

**Request Body:**
```typescript
interface RegisterNodeRequest {
  node_id: string;          // required; format: nde_{ULID}
  tier: 1 | 2 | 3 | 4;    // required; node hardware tier
  capabilities: string[];   // required; e.g. ['yamnet','gps_pps','sdr_rf']
  lat: number;              // required; -90 to 90, 3 decimal places max
  lon: number;              // required; -180 to 180, 3 decimal places max
  alt: number;              // required; metres above sea level
  time_precision_us: number; // required; timing class in microseconds
  gate_level: 1 | 2 | 3;   // required; max gate level supported
  direct_endpoint?: string;  // optional; 'host:port' or 'https://...'
  certificate_pem: string;   // required; PEM-encoded DER certificate
  firmware_version: string;  // required; semver e.g. '1.2.0'
  meta?: Record<string, unknown>; // optional; arbitrary metadata
}
```

**Request Example:**
```json
{
  "node_id": "nde_01J9X4K2P3Q5R6S7T8U9V0W1X2",
  "tier": 1,
  "capabilities": ["yamnet", "gps_pps"],
  "lat": 51.507,
  "lon": -0.127,
  "alt": 12.5,
  "time_precision_us": 1,
  "gate_level": 3,
  "direct_endpoint": "192.168.1.42:7001",
  "certificate_pem": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
  "firmware_version": "2.0.1"
}
```

**Response 202 Accepted:**
```json
{
  "data": {
    "node_id": "nde_01J9X4K2P3Q5R6S7T8U9V0W1X2",
    "state": "pending",
    "geo_sector": "gcpvhegq",
    "registered_at": "2026-03-24T14:23:01.847Z",
    "nats": {
      "endpoint": "tls://nats.sentinel.apex-os.io:4222",
      "subject_prefix": "sentinel.gate3.detection.gcpvhegq",
      "heartbeat_subject": "sentinel.node.heartbeat",
      "model_subject": "sentinel.model.update",
      "credentials": {
        "nkey_seed": "SUAABBCCDD...",
        "subject_permissions": {
          "publish": ["sentinel.gate3.detection.gcpvhegq", "sentinel.node.heartbeat", "sentinel.node.offline"],
          "subscribe": ["sentinel.model.update", "sentinel.config.nde_01J9X4K2P3Q5R6S7T8U9V0W1X2"]
        }
      }
    },
    "cert_expires_at": "2026-06-24T14:23:01.847Z"
  },
  "meta": {
    "request_id": "req_01J9X4K2P3Q5R6S7T8U9V0W1X2",
    "timestamp": "2026-03-24T14:23:01.847Z",
    "processing_ms": 143
  }
}
```

**Response 200 OK (re-registration, idempotent):**
Same body as 202, state reflects current node state.

**Response 409 Conflict:**
```json
{
  "error": {
    "code": "NODE_ALREADY_EXISTS",
    "message": "A node with this node_id is registered with a different certificate",
    "detail": "Revoke the existing node certificate before re-registering with a new certificate",
    "request_id": "req_...",
    "timestamp": "...",
    "docs_url": "https://sentinel.apex-os.io/docs/errors/NODE_ALREADY_EXISTS"
  }
}
```

**Error Codes:**
- `MISSING_REQUIRED_FIELD` (422): one of the required fields is absent
- `INVALID_FIELD_TYPE` (422): field type mismatch
- `MTLS_CERT_INVALID` (401): certificate chain validation failed
- `MTLS_CERT_EXPIRED` (401): certificate NotAfter is in the past
- `NODE_ALREADY_EXISTS` (409): node_id registered with different cert
- `RATE_LIMIT_EXCEEDED` (429): registration attempted within 30s of last attempt

---

## 4. Edge Function: ingest-event

### POST /functions/v1/ingest-event

Ingests a Gate 3 detection event from a node. Node must be in ONLINE or DEGRADED state.

**Auth:** mTLS certificate (node_agent)

**Request Body:**
```typescript
interface IngestEventRequest {
  event_id: string;           // required; ULID from node (deduplication key)
  node_id: string;            // required; must match mTLS cert
  timestamp_us: number;       // required; INT64 microseconds since Unix epoch
  gate: 3;                    // required; must be 3 (this endpoint is gate3 only)

  // Position (optional if node has no GPS fix)
  lat?: number;               // -90 to 90, 4 decimal places max
  lon?: number;               // -180 to 180, 4 decimal places max
  alt_m?: number;

  // Confidence scores (0.0 to 1.0)
  acoustic_confidence: number; // required
  rf_confidence?: number;      // optional; 0 if no RF sensor
  sdr_confidence?: number;     // optional; 0 if no SDR

  // Classification
  threat_class: string;        // required; e.g. 'DJI_MAVIC', 'UNKNOWN_MULTIROTOR'

  // Acoustic features (no raw audio)
  peak_freq_hz?: number;       // dominant frequency (Hz)

  // RF features
  rssi_anomaly_db?: number;    // dB above noise floor

  // Mesh relay metadata
  relay_path?: string[];       // node_ids in relay chain (empty if direct IP)
}
```

**Validation Rules:**
- Payload must not exceed 64KB
- Field names `audio`, `waveform`, `pcm`, `samples`, `raw_audio`, `audio_bytes` are prohibited
- `timestamp_us` must be within ±500ms of server wall clock (reject stale events)
- `event_id` must be a valid ULID (26 uppercase alphanumeric chars)
- `threat_class` must match pattern `^[A-Z0-9_]{1,50}$`
- `acoustic_confidence` is mandatory (the only required confidence; others default to 0)

**Request Example:**
```json
{
  "event_id": "01J9X4K2P3Q5R6S7T8U9V0W1X2",
  "node_id": "nde_01J9X4K2P3Q5R6S7T8U9V0W1X2",
  "timestamp_us": 1711283001847000,
  "gate": 3,
  "lat": 51.5074,
  "lon": -0.1278,
  "alt_m": 85.0,
  "acoustic_confidence": 0.94,
  "rf_confidence": 0.82,
  "threat_class": "DJI_MAVIC",
  "peak_freq_hz": 12400,
  "rssi_anomaly_db": 18.3
}
```

**Response 201 Created:**
```json
{
  "data": {
    "id": "evt_01J9X4K2P3Q5R6S7T8U9V0W1X2",
    "event_id": "01J9X4K2P3Q5R6S7T8U9V0W1X2",
    "geo_sector": "gcpvhegq",
    "nats_published": true,
    "nats_subject": "sentinel.gate3.detection.gcpvhegq",
    "fused_confidence": 0.894
  },
  "meta": {
    "request_id": "req_...",
    "timestamp": "2026-03-24T14:23:01.847Z",
    "processing_ms": 38
  }
}
```

**Error Codes:**
- `RAW_AUDIO_REJECTED` (422): payload contains prohibited audio field
- `OVERSIZED_PAYLOAD` (422): body exceeds 64KB
- `INVALID_TIMESTAMP` (422): timestamp_us > 500ms from server clock
- `NODE_NOT_FOUND` (404): node_id not registered
- `NODE_OFFLINE` (409): node state is offline or revoked
- `EVENT_DUPLICATE` (409): event_id already exists (idempotent replay protection)
- `NATS_UNAVAILABLE` (503): NATS publish failed after 3 retries; `retry_after_ms: 500`
- `RATE_LIMIT_EXCEEDED` (429): > 100 events/minute from this node

---

## 5. Edge Function: node-health (heartbeat)

### POST /functions/v1/node-health

Submits a heartbeat from a node. Updates `nodes.last_seen_at`, resets `missed_heartbeats`, writes to `node_heartbeats` table, publishes NATS heartbeat.

**Auth:** mTLS certificate (node_agent)

**Request Body:**
```typescript
interface NodeHealthRequest {
  node_id: string;            // required; must match mTLS cert
  lat: number;                // required; current position
  lon: number;                // required; current position
  alt: number;                // required; metres ASL
  battery_percent: number;    // required; 0-100
  signal_strength_dbm: number; // required; typical range -30 to -120
  active_capabilities: string[]; // required; capabilities online right now
  timestamp_us: number;       // required; node clock in microseconds
  ip_connected: boolean;      // required
  lora_connected: boolean;    // required
  ble_connected: boolean;     // required
  system_metrics?: {          // optional
    cpu_percent: number;
    memory_percent: number;
    temp_celsius?: number;
    disk_free_mb?: number;
  };
}
```

**Request Example:**
```json
{
  "node_id": "nde_01J9X4K2P3Q5R6S7T8U9V0W1X2",
  "lat": 51.507,
  "lon": -0.127,
  "alt": 12.5,
  "battery_percent": 83,
  "signal_strength_dbm": -72,
  "active_capabilities": ["yamnet", "gps_pps"],
  "timestamp_us": 1711283001847000,
  "ip_connected": true,
  "lora_connected": false,
  "ble_connected": false,
  "system_metrics": {
    "cpu_percent": 12.4,
    "memory_percent": 34.7,
    "temp_celsius": 42.1
  }
}
```

**Response 200 OK:**
```json
{
  "data": {
    "node_id": "nde_01J9X4K2P3Q5R6S7T8U9V0W1X2",
    "state": "online",
    "next_heartbeat_in_s": 60,
    "config_version": "2026-03-24T10:00:00Z",
    "model_update_available": false
  },
  "meta": {
    "request_id": "req_...",
    "timestamp": "2026-03-24T14:23:01.847Z",
    "processing_ms": 22
  }
}
```

The `config_version` field allows the node to detect a configuration change without polling the config endpoint separately. If `model_update_available: true`, the node should subscribe to `sentinel.model.update`.

**Response 200 OK with degraded state:**
```json
{
  "data": {
    "node_id": "nde_01J9X4K2P3Q5R6S7T8U9V0W1X2",
    "state": "degraded",
    "degraded_reason": "battery_low",
    "next_heartbeat_in_s": 30,
    "config_version": "2026-03-24T10:00:00Z",
    "model_update_available": false
  }
}
```

`degraded_reason` values: `battery_low`, `capability_offline`, `signal_degraded`

**Error Codes:**
- `NODE_NOT_FOUND` (404): node_id not registered
- `NODE_REVOKED` (403): node certificate has been revoked
- `RATE_LIMIT_EXCEEDED` (429): more than 1 heartbeat per 10 seconds

---

## 6. Edge Function: node-status

### GET /functions/v1/node-status/{nodeId}

Returns current status for a node. Accessible by the node itself (mTLS) or ops_admin (JWT).

**Auth:** mTLS certificate (own node) OR JWT (ops_admin)

**Path Parameters:**
- `nodeId` (string, required): node_id of the target node

**Query Parameters:**
- `include_history` (boolean, optional): if true, includes last 10 heartbeats. Default: false
- `include_events` (boolean, optional): if true, includes last 10 detection events. Default: false

**Response 200 OK:**
```json
{
  "data": {
    "node_id": "nde_01J9X4K2P3Q5R6S7T8U9V0W1X2",
    "tier": 1,
    "state": "online",
    "capabilities": ["yamnet", "gps_pps"],
    "active_capabilities": ["yamnet", "gps_pps"],
    "geo_sector": "gcpvhegq",
    "last_seen_at": "2026-03-24T14:23:01.847Z",
    "missed_heartbeats": 0,
    "battery_percent": 83,
    "signal_strength_dbm": -72,
    "cert_expires_at": "2026-06-24T14:23:01.847Z",
    "cert_days_remaining": 92,
    "nats_endpoint": "tls://nats.sentinel.apex-os.io:4222",
    "nats_subject_prefix": "sentinel.gate3.detection.gcpvhegq",
    "registered_at": "2026-03-20T09:00:00Z",
    "firmware_version": "2.0.1",
    "mesh_relay_path": null
  },
  "meta": {
    "request_id": "req_...",
    "timestamp": "2026-03-24T14:23:01.847Z",
    "processing_ms": 12
  }
}
```

With `include_history=true`, `data` gains:
```json
"heartbeat_history": [
  {
    "timestamp": "2026-03-24T14:23:01Z",
    "battery_percent": 83,
    "signal_strength_dbm": -72,
    "state": "online"
  }
  // ... 9 more
]
```

**Error Codes:**
- `NODE_NOT_FOUND` (404): node_id does not exist
- `INSUFFICIENT_ROLE` (403): JWT role cannot access another node's status

---

## 7. Edge Function: alert-router

### POST /functions/v1/alert-router

Dispatches an alert to configured channels. Also handles acknowledgment state updates.

**Auth:** JWT (ops_admin, c2_operator)

**Request Body (create alert):**
```typescript
interface CreateAlertRequest {
  track_id: string;          // required; existing track_id
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;           // required; 1-1000 chars
  lat: number;               // required; position at time of alert
  lon: number;               // required
  alt_m?: number;
  confidence: number;        // required; 0.0-1.0
  channels: string[];        // required; subset of ['tak','telegram','webhook','sms','pagerduty']
  cot_xml?: string;          // optional; pre-formed CoT XML; generated if absent
  tak_server_url?: string;   // optional; override default TAK server
}
```

**Request Example:**
```json
{
  "track_id": "trk_01J9X4K2P3Q5R6S7T8U9V0W1X2",
  "severity": "high",
  "message": "Confirmed DJI Mavic track in SW sector, confidence 94.2%",
  "lat": 51.5074,
  "lon": -0.1278,
  "alt_m": 85.0,
  "confidence": 0.942,
  "channels": ["tak", "telegram"]
}
```

**Response 202 Accepted:**
```json
{
  "data": {
    "id": "alt_01J9X4K2P3Q5R6S7T8U9V0W1X2",
    "track_id": "trk_01J9X4K2P3Q5R6S7T8U9V0W1X2",
    "severity": "high",
    "workflow_state": "pending",
    "dispatch_status": {
      "tak": "dispatching",
      "telegram": "dispatching"
    },
    "estimated_dispatch_ms": 2000
  },
  "meta": {
    "request_id": "req_...",
    "timestamp": "2026-03-24T14:23:01.847Z",
    "processing_ms": 67
  }
}
```

### PATCH /functions/v1/alert-router/{alertId}/status

Updates alert workflow state (acknowledge, action).

**Auth:** JWT (c2_operator, ops_admin)

**Request Body:**
```typescript
interface UpdateAlertStatusRequest {
  workflow_state: 'acknowledged' | 'actioned';
  notes?: string;  // max 2000 chars
}
```

**Response 200 OK:**
```json
{
  "data": {
    "id": "alt_01J9X4K2P3Q5R6S7T8U9V0W1X2",
    "workflow_state": "acknowledged",
    "acknowledged_by": "op_01J9...",
    "acknowledged_at": "2026-03-24T14:24:15.000Z"
  }
}
```

**Error Codes:**
- `TRACK_NOT_FOUND` (404): track_id does not exist
- `ALERT_NOT_FOUND` (404): alert_id does not exist
- `INVALID_STATE_TRANSITION` (409): e.g. trying to set 'acknowledged' when already 'actioned'
- `CIRCUIT_OPEN` (503): alert dispatch circuit breaker open for the requested channel; `retry_after_ms` provided

---

## 8. NATS Subject Contract

### 8.1 Node Subjects

**sentinel.node.register**
Direction: Node → Backend (publish on successful registration)
Publisher: register-node Edge Function (on behalf of node)
Subscriber: ops-dashboard monitor
```json
{
  "type": "node.register",
  "node_id": "nde_...",
  "tier": 1,
  "geo_sector": "gcpvhegq",
  "timestamp_us": 1711283001847000
}
```

**sentinel.node.heartbeat**
Direction: Node → Backend
Publisher: node (via ingest path) or node-health Edge Function
Subscriber: Health monitor, KV updater
Headers: `Nats-Node-Id: nde_...`, `Nats-Geo-Sector: gcpvhegq`
```json
{
  "type": "node.heartbeat",
  "node_id": "nde_...",
  "lat": 51.507,
  "lon": -0.127,
  "alt": 12.5,
  "battery_percent": 83,
  "signal_strength_dbm": -72,
  "active_capabilities": ["yamnet","gps_pps"],
  "ip_connected": true,
  "lora_connected": false,
  "ble_connected": false,
  "timestamp_us": 1711283001847000
}
```

**sentinel.node.offline**
Direction: Node → Backend (graceful shutdown) or Backend → Monitor (inferred offline)
Publisher: node (on graceful shutdown) or watchdog (on missed_heartbeats=2)
```json
{
  "type": "node.offline",
  "node_id": "nde_...",
  "reason": "graceful_shutdown" | "missed_heartbeats" | "cert_revoked",
  "timestamp_us": 1711283001847000
}
```

### 8.2 Detection Subjects

**sentinel.gate3.detection.{geo_sector}**
Direction: Node/Edge Function → TDoA Correlator
Publisher: ingest-event Edge Function
Subscriber: TDoA Correlation Service (tdoa_correlator consumer)
Subject example: `sentinel.gate3.detection.gcpvhegq`

Headers:
```
Nats-Node-Id: nde_...
Nats-Geo-Sector: gcpvhegq
Nats-Event-Id: 01J9X4K2P3Q5R6S7T8U9V0W1X2
Nats-Timestamp-Us: 1711283001847000
```

Payload (max 16KB):
```json
{
  "event_id": "01J9X4K2P3Q5R6S7T8U9V0W1X2",
  "node_id": "nde_...",
  "timestamp_us": 1711283001847000,
  "lat": 51.5074,
  "lon": -0.1278,
  "alt_m": 85.0,
  "acoustic_confidence": 0.94,
  "rf_confidence": 0.82,
  "sdr_confidence": 0.0,
  "fused_confidence": 0.894,
  "threat_class": "DJI_MAVIC",
  "peak_freq_hz": 12400,
  "rssi_anomaly_db": 18.3,
  "relay_path": []
}
```

### 8.3 Track Subjects

**sentinel.track.update**
Direction: TDoA Correlator → Track Manager
Publisher: TDoA Correlation Service
Subscriber: Track Manager, Supabase Writer
```json
{
  "track_id": "trk_..." | null,
  "event_id": "01J9X4K2P3Q5R6S7T8U9V0W1X2",
  "lat": 51.5074,
  "lon": -0.1278,
  "alt_m": 85.0,
  "position_error_m": 62.4,
  "fused_confidence": 0.894,
  "threat_class": "DJI_MAVIC",
  "contributing_nodes": ["nde_abc","nde_def","nde_ghi"],
  "solver_type": "newton_raphson",
  "timestamp_us": 1711283001847000
}
```

**sentinel.track.confirmed**
Direction: Track Manager → Alert Router, Supabase Writer
Publisher: Track Manager (after 3rd consistent fix)
```json
{
  "track_id": "trk_...",
  "lat": 51.5074,
  "lon": -0.1278,
  "alt_m": 85.0,
  "velocity": { "vx_ms": -3.2, "vy_ms": 1.4, "vz_ms": 0.1 },
  "confidence": 0.92,
  "threat_class": "DJI_MAVIC",
  "update_count": 3,
  "predicted_5s": { "lat": 51.5072, "lon": -0.1279, "position_error_m": 18.0 },
  "timestamp_us": 1711283001847000
}
```

**sentinel.track.dropped**
Direction: Track Manager → Supabase Writer
Publisher: Track Manager (30s since last fix)
```json
{
  "track_id": "trk_...",
  "last_lat": 51.5074,
  "last_lon": -0.1278,
  "last_confidence": 0.88,
  "update_count": 12,
  "duration_s": 47,
  "drop_reason": "no_fix_timeout",
  "timestamp_us": 1711283001847000
}
```

### 8.4 Alert Subjects

**sentinel.alert.critical / sentinel.alert.high / sentinel.alert.medium / sentinel.alert.low / sentinel.alert.info**
Direction: Alert Router → Subscribers
Publisher: Alert Router service
Subscriber: ops dashboard, external channel dispatchers
```json
{
  "alert_id": "alt_...",
  "track_id": "trk_...",
  "severity": "high",
  "message": "Confirmed DJI Mavic track in SW sector",
  "lat": 51.5074,
  "lon": -0.1278,
  "alt_m": 85.0,
  "confidence": 0.942,
  "channels": ["tak","telegram"],
  "timestamp_us": 1711283001847000
}
```

### 8.5 Model Subjects

**sentinel.model.update**
Direction: Ops Admin → All Nodes
Publisher: Model distribution service (ops_admin triggered)
Subscriber: All registered nodes (individual subscriptions or wildcard)
Max payload: 512KB (YAMNet 480KB + metadata)

Message headers:
```
Nats-Model-Name: yamnet
Nats-Model-Version: 2.1.0
Nats-Model-Sha256: abc123...
Nats-Model-Size: 491520
Nats-Apply-After: 2026-03-25T02:00:00Z
```

Payload: raw model bytes (tflite format) with 32-byte SHA-256 prepended for integrity.

**sentinel.model.rollback**
Direction: Ops Admin → All Nodes
Publisher: ops_admin (manual trigger or automated on error)
```json
{
  "model_name": "yamnet",
  "rollback_to_version": "2.0.0",
  "reason": "false_positive_storm",
  "effective_immediately": true
}
```

### 8.6 System Subjects

**sentinel.system.mode**
Direction: Ops Admin → All Services and Nodes
Publisher: ops_admin (manual or automated)
```json
{
  "mode": "normal" | "elevated" | "lockdown" | "maintenance",
  "previous_mode": "normal",
  "reason": "threat_level_change",
  "effective_at": "2026-03-24T14:23:01.847Z",
  "expires_at": "2026-03-24T22:00:00.000Z"
}
```

Mode effects:
- `normal`: standard gate thresholds
- `elevated`: gate thresholds reduced by 0.1 (more sensitive)
- `lockdown`: all Gate 2+ events trigger alerts; no threshold filtering
- `maintenance`: detection pipeline paused; heartbeats continue

---

## 9. NATS KV Store API

### sentinel-nodes KV

Key format: `{node_id}` (without `nde_` prefix for KV key efficiency)

Value schema:
```json
{
  "node_id": "nde_...",
  "state": "online",
  "geo_sector": "gcpvhegq",
  "last_seen_us": 1711283001847000,
  "battery_percent": 83,
  "active_capabilities": ["yamnet","gps_pps"],
  "missed_heartbeats": 0,
  "mesh_relay_path": null,
  "updated_at_us": 1711283001847000
}
```

Operations:
- GET `sentinel-nodes.{node_id}` — read current node state
- PUT `sentinel-nodes.{node_id}` — update node state (services account only)
- WATCH `sentinel-nodes.>` — stream all node state changes (ops dashboard)
- DELETE `sentinel-nodes.{node_id}` — soft delete (ops_admin only, followed by node_agent revoke)

### sentinel-config KV

Key format: configuration parameter name

Read via: `nats kv get sentinel-config {key}` or NATS KV watch in services

Keys and value schemas:
```
gate_thresholds:
  {"gate1": 0.30, "gate2": 0.60, "gate3": 0.85}

heartbeat_interval_s:
  60

tdoa_window_ms:
  500

tdoa_min_nodes:
  3

mesh_relay_enabled:
  true

alert_severity_thresholds:
  {"critical": 0.95, "high": 0.80, "medium": 0.65, "low": 0.50}

system_mode:
  "normal"

model_current:
  {"name": "yamnet", "version": "2.1.0", "sha256": "abc123...", "size_bytes": 491520}
```

---

## 10. WebSocket Realtime Subscriptions

Supabase Realtime WebSocket endpoint: `wss://bymfcnwfyxuivinuzurr.supabase.co/realtime/v1/websocket`

### Channel: sentinel:events:{geo_sector}

Subscribe to detection events for a specific geo-sector (or all sectors with `sentinel:events:*`).

Subscription filter (Supabase Realtime SQL filter):
```
table=detection_events,event=INSERT,filter=geo_sector=eq.gcpvhegq
```

Message payload (INSERT event):
```json
{
  "schema": "public",
  "table": "detection_events",
  "commit_timestamp": "2026-03-24T14:23:01.847Z",
  "eventType": "INSERT",
  "new": {
    "id": "evt_...",
    "event_id": "...",
    "node_id": "nde_...",
    "fused_confidence": 0.894,
    "threat_class": "DJI_MAVIC",
    "lat": 51.5074,
    "lon": -0.1278,
    "alt_m": 85.0,
    "position_error_m": 62.4,
    "geo_sector": "gcpvhegq",
    "created_at": "2026-03-24T14:23:01.847Z"
  }
}
```

### Channel: sentinel:tracks

Subscribe to all track state changes.

Filter: `table=tracks,event=*` (INSERT and UPDATE)

### Channel: sentinel:alerts

Filter: `table=alerts,event=INSERT`

### Channel: sentinel:nodes

Filter: `table=nodes,event=UPDATE,filter=state=neq.pending`

Client reconnect behaviour: on WebSocket disconnect, client must:
1. Record last received `commit_timestamp`
2. On reconnect, fetch events since that timestamp via REST API
3. Resume WebSocket subscription
4. Deduplicate by `id` field

---

## 11. Error Reference Summary

```
AUTH ERRORS (401/403)
  MISSING_JWT              — Authorization header absent
  INVALID_JWT              — JWT signature/expiry invalid
  INSUFFICIENT_ROLE        — Valid JWT but role lacks permission
  MTLS_CERT_INVALID        — Client certificate rejected
  MTLS_CERT_EXPIRED        — Client certificate past NotAfter
  MTLS_CERT_REVOKED        — Certificate in CRL

VALIDATION ERRORS (422)
  MISSING_REQUIRED_FIELD   — Required field absent
  INVALID_FIELD_TYPE       — Field type mismatch
  FIELD_OUT_OF_RANGE       — Numeric field outside bounds
  RAW_AUDIO_REJECTED       — Payload contains audio bytes
  OVERSIZED_PAYLOAD        — Body exceeds 64KB
  INVALID_TIMESTAMP        — timestamp_us > 500ms from server clock
  INVALID_THREAT_CLASS     — threat_class fails pattern check

RESOURCE ERRORS (404/409)
  NODE_NOT_FOUND           — node_id does not exist
  NODE_ALREADY_EXISTS      — Registration collision (cert mismatch)
  NODE_OFFLINE             — Node not accepting events
  NODE_REVOKED             — Node permanently disabled
  TRACK_NOT_FOUND          — track_id does not exist
  ALERT_NOT_FOUND          — alert_id does not exist
  EVENT_DUPLICATE          — event_id already exists
  INVALID_STATE_TRANSITION — Illegal state machine transition

CAPACITY ERRORS (429/503)
  RATE_LIMIT_EXCEEDED      — Client rate limit hit; includes retry_after_ms
  NATS_UNAVAILABLE         — NATS publish failed; includes retry_after_ms
  SUPABASE_UNAVAILABLE     — DB write failed; includes retry_after_ms
  CIRCUIT_OPEN             — Circuit breaker open; includes retry_after_ms

INTERNAL ERRORS (500)
  INTERNAL_ERROR           — Unexpected error; includes request_id for correlation
```
