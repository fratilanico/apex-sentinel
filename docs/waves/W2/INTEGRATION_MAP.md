# APEX-SENTINEL W2 — Integration Map

**Document ID:** INTEGRATION_MAP-W2
**Wave:** W2 — Infrastructure Backbone
**Status:** IN PROGRESS
**Owner:** Nicolae Fratila
**Created:** 2026-03-24
**Last Updated:** 2026-03-24
**Supabase Project:** bymfcnwfyxuivinuzurr (eu-west-2, London)

---

## 1. Overview

This document is the authoritative integration map for all system integration points in APEX-SENTINEL Wave 2. It covers the complete data flow from W1's on-device detection pipeline through the NATS JetStream cluster, Supabase Edge Functions, TDoA correlation service, alert routing, and all external integrations. Each integration point is documented with protocols, request/response schemas, authentication mechanisms, latency budgets, and error handling policies.

---

## 2. Full System Integration Diagram

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║                              APEX-SENTINEL W2 — SYSTEM INTEGRATION                          ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝

  ┌─────────────────────────────────────────────────────────────────────────────────────────┐
  │                           SENSOR NODES (W1 — On-Device)                                 │
  │                                                                                         │
  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
  │  │  Tier-1 Node │  │  Tier-1 Node │  │  Tier-2 Node │  │  Tier-3 Node │               │
  │  │ APEX-NODE-001│  │ APEX-NODE-002│  │ APEX-NODE-003│  │ APEX-NODE-004│               │
  │  │ RTL-SDR+Mic  │  │ RTL-SDR+Mic  │  │ Mic only     │  │ Meshtastic   │               │
  │  │ AudioPipeline│  │ AudioPipeline│  │ AudioPipeline│  │ RF relay     │               │
  │  │ RFDetector   │  │ RFDetector   │  │              │  │              │               │
  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │
  │         │ mTLS             │ mTLS             │ mTLS             │ Serial               │
  │         │ JWT              │ JWT              │ JWT              │ (USB)                │
  └─────────┼─────────────────┼─────────────────┼─────────────────┼─────────────────────┘
            │                 │                 │                 │
            │                 │  NATS publish   │                 │
            │    sentinel.detections.{nodeId}   │                 ▼
            │                 │                 │        ┌──────────────────┐
            │                 │                 │        │ Meshtastic Bridge│
            │                 │                 │        │ Python3/systemd  │
            │                 │                 │        │ fortress VM      │
            │                 │                 │        └────────┬─────────┘
            │                 │                 │                 │
            │                 │                 │    sentinel.detections.{meshtasticNodeId}
            ▼                 ▼                 ▼                 ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                    NATS JetStream Cluster (Raft/5-node)                 │
  │                                                                         │
  │  nats1.apex-sentinel.internal :4222  nats2.apex-sentinel.internal :4222 │
  │  nats3.apex-sentinel.internal :4222  nats4.apex-sentinel.internal :4222 │
  │  nats5.apex-sentinel.internal :4222  (cluster routes :6222)             │
  │                                                                         │
  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐ │
  │  │ DETECTIONS  │  │ NODE_HEALTH │  │   ALERTS    │  │  COT_EVENTS   │ │
  │  │ stream R3   │  │ stream R3   │  │ stream R5   │  │  stream R3    │ │
  │  │ limits ret  │  │ limits ret  │  │ work-queue  │  │  limits ret   │ │
  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └───────┬───────┘ │
  │         │                │                 │                 │         │
  │  ┌──────────────┐  ┌─────────────────┐    │          ┌──────────────┐  │
  │  │ DLQ streams  │  │ sentinel.dlq.>  │    │          │ CoT consumer │  │
  │  │ sentinel.dlq │  │                 │    │          │              │  │
  │  └──────────────┘  └─────────────────┘    │          └──────┬───────┘  │
  └─────────────────────────────────────────────────────────────────────────┘
            │                │                 │                 │
            │ push consumer  │ push consumer   │ work-queue      │ push consumer
            ▼                ▼                 ▼                 ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │              Supabase Edge Functions (Deno runtime, eu-west-2)        │
  │                                                                       │
  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐  │
  │  │ ingest-event   │  │  node-health   │  │     alert-router       │  │
  │  │ POST /ingest-  │  │ POST /node-    │  │ POST /alert-router     │  │
  │  │ event          │  │ health         │  │                        │  │
  │  │ Batch 100 max  │  │ Single health  │  │ Circuit breaker        │  │
  │  │ UPSERT nats_seq│  │ payload        │  │ Telegram / Realtime    │  │
  │  └───────┬────────┘  └───────┬────────┘  │ / CoT routing         │  │
  │          │                   │           └─────────┬──────────────┘  │
  │  ┌───────────────┐           │                     │                  │
  │  │ register-node │           │           ┌─────────▼──────────────┐  │
  │  │ POST /register│           │           │  Telegram Bot API      │  │
  │  │ -node         │           │           │  api.telegram.org      │  │
  │  │ JWT issuance  │           │           └────────────────────────┘  │
  │  └───────┬───────┘           │                                       │
  └──────────┼───────────────────┼───────────────────────────────────────┘
             │                   │
             ▼                   ▼
  ┌─────────────────────────────────────────────────────────────────────────────────────┐
  │                    Supabase PostgreSQL (eu-west-2, pgbouncer)                        │
  │                                                                                     │
  │   nodes   │   detection_events   │   tracks   │   alerts   │   node_health_log      │
  │  lkgc_snapshots   │   kv (circuit breaker)                                          │
  │                                                                                     │
  │   RLS: operator / node_agent / service_role policies                                │
  └─────────────────────────────────────────────────────────────────────────────────────┘
             │                             │
             │  Postgres NOTIFY/trigger    │  Supabase Realtime Broadcast
             ▼                             ▼
  ┌──────────────────────┐      ┌──────────────────────────────────────────┐
  │ TDoA Correlation Svc │      │      Supabase Realtime                   │
  │ Deno / systemd       │      │      ws://bymfcnwfyxuivinuzurr.supabase  │
  │ fortress VM          │      │      .co/realtime/v1                     │
  │                      │      │      Channels:                           │
  │ Groups detections    │      │        sentinel:alerts                   │
  │ by audio_hash +      │      │        sentinel:tracks:{trackId}         │
  │ time window          │      └───────────────┬──────────────────────────┘
  │ Solves TDoA LS       │                      │
  │ Writes tracks table  │                      ▼
  └──────────┬───────────┘              ┌────────────────────────────┐
             │                          │  W4 C2 Dashboard           │
             │                          │  (future wave)             │
             │ NATS publish             │  React + Maplibre GL       │
             │ sentinel.alerts.*        │  Operator workstation      │
             ▼                          └────────────────────────────┘
  ┌─────────────────────────────────────────────────────────────────────────────────────┐
  │                         External Integrations                                       │
  │                                                                                     │
  │  ┌───────────────────────────┐    ┌──────────────────────────┐                     │
  │  │   FreeTAKServer           │    │   Telegram Bot API       │                     │
  │  │   CoT XML over TCP/UDP    │    │   api.telegram.org       │                     │
  │  │   MIL-STD-2525 symbology  │    │   sendMessage /          │                     │
  │  │   Port 8087 (TCP default) │    │   editMessageText        │                     │
  │  └───────────────────────────┘    └──────────────────────────┘                     │
  └─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. NATS Subject Hierarchy

### 3.1 Complete Subject Tree

```
sentinel.
├── detections.
│   └── {nodeId}                     — raw detection event from sensor node
│       Format: sentinel.detections.APEX-NODE-001
│       Publisher: W1 node agent, Meshtastic bridge
│       Consumer: ingest-event Edge Fn (push), TDoA service
│       Stream: DETECTIONS
│
├── health.
│   └── {nodeId}                     — node heartbeat + metrics
│       Format: sentinel.health.APEX-NODE-001
│       Publisher: W1 node agent, Meshtastic bridge
│       Consumer: node-health Edge Fn (push)
│       Stream: NODE_HEALTH
│
├── alerts.
│   └── {alertId}                    — confirmed threat alert
│       Format: sentinel.alerts.ALT-20260324-0001
│       Publisher: TDoA service, node-health (battery alerts)
│       Consumer: alert-router Edge Fn (work-queue, exactly-once)
│       Stream: ALERTS
│
├── cot.
│   └── {trackId}                    — Cursor-on-Target XML event
│       Format: sentinel.cot.TRK-20260324-0001
│       Publisher: alert-router (after CoT generation)
│       Consumer: CoT relay service (fortress)
│       Stream: COT_EVENTS
│
├── detections.ingested              — summary after ingest-event batch insert
│   Format: sentinel.detections.ingested
│   Publisher: ingest-event Edge Fn
│   Consumer: TDoA correlation service
│   Stream: ephemeral (no stream, direct consume)
│
└── dlq.
    ├── detections.
    │   └── {nodeId}                 — failed detection event processing
    ├── alerts.
    │   └── {alertId}                — failed alert delivery (all channels exhausted)
    └── cot.
        └── {trackId}               — failed CoT relay
```

### 3.2 Message Schemas

#### 3.2.1 Detection Event (sentinel.detections.{nodeId})

```json
{
  "schema_version": "1.0",
  "node_id": "APEX-NODE-001",
  "event_type": "acoustic",
  "detected_at": "2026-03-24T10:00:00.123456Z",
  "classifier": "drone-dji-phantom4",
  "confidence": 0.9342,
  "snr_db": 18.5,
  "frequency_hz": null,
  "audio_hash": "sha256:a1b2c3d4e5f6...",
  "ntp_offset_ms": 12.3,
  "payload": {
    "spectrogram_bins": [...],
    "peak_frequency_hz": 87.5,
    "harmonic_count": 4
  }
}
```

#### 3.2.2 Node Health Event (sentinel.health.{nodeId})

```json
{
  "schema_version": "1.0",
  "node_id": "APEX-NODE-001",
  "recorded_at": "2026-03-24T10:00:00Z",
  "cpu_pct": 34.2,
  "mem_pct": 67.1,
  "disk_pct": 22.0,
  "battery_pct": 85.0,
  "temp_celsius": 42.3,
  "nats_connected": true,
  "sdr_active": true,
  "audio_active": true,
  "events_last_60s": 12,
  "ntp_offset_ms": 12.3,
  "firmware_ver": "1.2.3"
}
```

#### 3.2.3 Alert Event (sentinel.alerts.{alertId})

```json
{
  "schema_version": "1.0",
  "alert_id": "ALT-20260324-0001",
  "track_id": "TRK-20260324-0001",
  "severity": "warning",
  "triggered_at": "2026-03-24T10:00:05.000Z",
  "channels": ["telegram", "realtime", "cot"],
  "summary": {
    "classifier": "drone-dji-phantom4",
    "confidence": 0.9342,
    "threat_level": 3,
    "lat_coarse": 51.507,
    "lon_coarse": -0.127,
    "uncertainty_m": 45.0,
    "node_count": 3,
    "track_ref": "TRK-20260324-0001"
  }
}
```

---

## 4. Supabase Edge Function Endpoints

### 4.1 register-node

```
Endpoint: POST https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/register-node
Auth: Bearer {supabase-service-role-key} (bootstrap) OR Bearer {existing-node-jwt} (re-register)
Headers:
  X-Node-Cert-Fingerprint: {sha256-hex-of-client-tls-cert}
  Content-Type: application/json

Request:
{
  "node_id": "APEX-NODE-001",
  "tier": 1,
  "capabilities": {"acoustic": true, "rf": true, "meshtastic": false},
  "location": {"lat": 51.5074, "lon": -0.1278, "alt": 15.0},
  "firmware_ver": "1.2.3"
}

Response 200:
{
  "node_id": "APEX-NODE-001",
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "nats_server": "nats://nats1.apex-sentinel.internal:4222",
  "expires_at": "2026-03-25T12:00:00Z",
  "registered": true
}

Response 401: {"error": "cert_fingerprint_not_in_allowlist"}
Response 409: {"error": "node_id_conflict", "existing_tier": 2}
Response 422: {"error": "invalid_payload", "details": ["node_id is required"]}
```

**JWT Claims:**
```json
{
  "iss": "apex-sentinel",
  "aud": "nats",
  "sub": "APEX-NODE-001",
  "iat": 1711281600,
  "exp": 1711368000,
  "tier": 1,
  "capabilities": {"acoustic": true, "rf": true, "meshtastic": false},
  "region_id": "london-central"
}
```

### 4.2 ingest-event

```
Endpoint: POST https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/ingest-event
Auth: Bearer {node-jwt}
Content-Type: application/json

Request:
{
  "events": [
    {
      "node_id": "APEX-NODE-001",
      "event_type": "acoustic",
      "detected_at": "2026-03-24T10:00:00.123Z",
      "classifier": "drone-dji-phantom4",
      "confidence": 0.9342,
      "snr_db": 18.5,
      "audio_hash": "sha256:abc...",
      "nats_seq": 100234,
      "payload": {}
    }
  ]
}

Response 200:
{
  "inserted": 1,
  "skipped_duplicates": 0,
  "track_associations": 1,
  "processing_ms": 45
}

Response 400: {"error": "batch_too_large", "max": 100, "received": 150}
Response 401: {"error": "invalid_jwt"}
Response 403: {"error": "node_id_mismatch", "jwt_node_id": "APEX-NODE-001", "payload_node_id": "APEX-NODE-002"}
Response 422: {"error": "invalid_event_schema", "event_index": 3, "details": [...]}
```

### 4.3 node-health

```
Endpoint: POST https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/node-health
Auth: Bearer {node-jwt}
Content-Type: application/json

Request:
{
  "node_id": "APEX-NODE-001",
  "recorded_at": "2026-03-24T10:00:00Z",
  "cpu_pct": 34.2,
  "mem_pct": 67.1,
  "disk_pct": 22.0,
  "battery_pct": 85.0,
  "temp_celsius": 42.3,
  "nats_connected": true,
  "sdr_active": true,
  "audio_active": true,
  "events_last_60s": 12
}

Response 200:
{
  "logged": true,
  "node_status": "online",
  "battery_alert": false,
  "processing_ms": 23
}

Response 404: {"error": "node_not_found", "node_id": "APEX-NODE-999"}
Response 401: {"error": "invalid_jwt"}
```

### 4.4 alert-router

```
Endpoint: POST https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/alert-router
Auth: Bearer {supabase-service-role-key}  (called by NATS push consumer bridge)
Content-Type: application/json

Request:
{
  "alert_id": "ALT-20260324-0001",
  "nats_seq": 5001,
  "nats_stream": "ALERTS"
}

Response 200:
{
  "alert_id": "ALT-20260324-0001",
  "channels": {
    "telegram": "sent",
    "realtime": "broadcast",
    "cot": "delivered"
  },
  "delivery_log": [
    {"channel": "telegram", "status": "sent", "timestamp": "2026-03-24T10:00:05.245Z", "telegram_msg_id": 987654},
    {"channel": "realtime", "status": "broadcast", "timestamp": "2026-03-24T10:00:05.267Z"},
    {"channel": "cot", "status": "delivered", "timestamp": "2026-03-24T10:00:05.312Z"}
  ]
}

Response 200 (dedup):
{
  "alert_id": "ALT-20260324-0001",
  "channels": {"telegram": "already_sent"},
  "skipped": true
}

Response 400: {"error": "missing_alert_id"}
Response 404: {"error": "alert_not_found"}
```

---

## 5. External Integration Points

### 5.1 FreeTAKServer CoT Relay

```
Protocol: TCP (primary) / UDP (fallback)
Endpoint: {FREETEK_HOST}:{FREETAK_PORT}  (default: 8087 TCP)
Configured via: Supabase Vault secret FREETAK_HOST, FREETAK_PORT
Connection: Persistent TCP, 30s keepalive

Payload format: CoT XML 2.0 (UTF-8, newline-terminated per message)

CoT XML schema:
  <event version="2.0" uid="{cot_uid}" type="a-h-A-M-F-Q"
    time="{iso8601}" start="{iso8601}" stale="{iso8601+5min}" how="m-g">
    <point lat="{lat}" lon="{lon}" hae="{alt}" ce="{uncertainty_m}" le="9999999.0"/>
    <detail>
      <track course="{course_deg}" speed="{speed_ms}"/>
      <contact callsign="APEX-{track_ref}"/>
      <remarks>classifier={classifier} confidence={confidence}</remarks>
      <__group name="APEX-SENTINEL" role="Team Member"/>
    </detail>
  </event>\n

Error handling:
  - Invalid XML: caught before send, written to DLQ
  - TCP RST: reconnect with 5s exponential backoff, max 120s
  - Timeout (10s): connection marked failed, circuit breaker incremented
  - FTS error response: logged, message re-queued

Latency budget: CoT delivery < 500ms from alert-router invocation
```

### 5.2 Telegram Bot API

```
Protocol: HTTPS
Base URL: https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/
Endpoints used:
  POST /sendMessage    — new alert notification
  POST /editMessageText — position update for existing track
  GET  /getUpdates     — command polling (future: /ack_{id})

Auth: Bot token in Supabase Vault as TELEGRAM_BOT_TOKEN
Chat target: TELEGRAM_ALERT_CHAT_ID (group chat ID, negative integer)

Rate limits:
  - 30 messages/second per bot (Telegram limit)
  - 1 message/second to same chat (to avoid flooding)
  - 429 response: back off exponentially base 5s, max 120s

sendMessage request:
{
  "chat_id": "{TELEGRAM_ALERT_CHAT_ID}",
  "text": "🚨 APEX-SENTINEL ALERT — warning\n\nTrack: TRK-...\n...",
  "parse_mode": "HTML",
  "disable_notification": false
}

sendMessage response:
{
  "ok": true,
  "result": {
    "message_id": 987654,
    "date": 1711281605,
    ...
  }
}

Error handling:
  - 429 Too Many Requests: back off + re-queue to ALERTS stream
  - 400 Bad Request: log error, mark as delivery_failed, write to dead_letters
  - 403 Forbidden (bot blocked): alert operator via alternative channel
  - Network timeout (10s): treat as failure, increment circuit breaker

Latency budget: Telegram delivery < 500ms from alert-router invocation
```

### 5.3 Meshtastic Serial Bridge

```
Hardware interface: USB serial (/dev/ttyUSB0 or /dev/ttyACM0)
Protocol: Meshtastic protobuf framing over serial
Library: meshtastic Python package (PyPI)
Baud rate: 921600 (Meshtastic default)

Packet types consumed:
  NODEINFO_APP  → node metadata update
  POSITION_APP  → GPS position (coarsened before publish)
  TELEMETRY_APP → battery, signal metrics

Translation to APEX-SENTINEL format:
  Meshtastic POSITION_APP → sentinel.detections.{meshtastic_node_id} with:
    node_id: meshtastic long name or hex ID
    event_type: "rf"  (Meshtastic is LoRa RF)
    lat_coarse: round(lat, 3)
    lon_coarse: round(lon, 3)
    payload: {rssi, snr, meshtastic_packet_id}

NATS publish subject: sentinel.detections.{meshtastic_hex_id}
NATS publish QoS: at-most-once (fire and forget; no NATS ACK required from bridge)

Reconnect policy:
  - Serial disconnect: 10s backoff, max 60s
  - NATS disconnect: 5s backoff, max 60s
  - Both disconnected: log WARNING, publish heartbeat when NATS reconnects

Latency: Serial read → NATS publish < 100ms (target)
```

---

## 6. Authentication Flow

### 6.1 Node JWT Authentication Chain

```
Step 1: Node bootstrap (first registration)
  Node → register-node Edge Fn
  Headers: Authorization: Bearer {supabase-anon-key}
           X-Node-Cert-Fingerprint: {cert-sha256}
  Edge Fn → validates cert fingerprint against Vault allowlist
  Edge Fn → inserts into nodes table (service-role, bypasses RLS)
  Edge Fn → issues JWT: {sub: node_id, aud: "nats", exp: +24h, tier, capabilities, region_id}
  Node ← JWT returned in response

Step 2: Node authentication to NATS
  Node → NATS cluster (nats1.apex-sentinel.internal:4222)
  TLS: node presents mTLS client cert (CN = node_id, signed by Intermediate CA)
  NATS → validates cert chain against Intermediate CA trust store
  NATS → checks auth map: CN "APEX-NODE-001" → grants publish sentinel.detections.APEX-NODE-001.*
                                                          publish sentinel.health.APEX-NODE-001.*
                                                          subscribe (none — nodes are publish-only)
  Node ← NATS connection established

Step 3: Edge Function authentication for ingest-event
  NATS push consumer → ingest-event Edge Fn
  Headers: Authorization: Bearer {service-role-key}  (NATS bridge uses service-role)
  Edge Fn → validates individual detection event JWTs in batch payload
  Edge Fn → checks node_id in JWT matches node_id in each event
  Edge Fn → inserts via service-role (bypasses RLS for write path)

Step 4: JWT renewal (every 23h, before 24h expiry)
  Node → register-node Edge Fn (same as Step 1)
  Headers: Authorization: Bearer {existing-valid-jwt}
  Edge Fn → verifies existing JWT (not expired)
  Edge Fn → updates nodes.last_seen_at, returns fresh JWT
```

### 6.2 Operator Authentication (for Supabase Realtime and Dashboard)

```
Step 1: Operator logs in via Supabase Auth
  Operator → Supabase Auth (email/password or SSO)
  Supabase Auth → issues operator JWT with custom claims:
    { role: "operator", region_id: "london-central", user_id: "..." }

Step 2: Supabase Realtime connection
  Operator dashboard → wss://bymfcnwfyxuivinuzurr.supabase.co/realtime/v1
  Headers: Authorization: Bearer {operator-jwt}
  Realtime → validates JWT, extracts region_id claim
  Realtime → subscribes operator to sentinel:alerts channel
  RLS policies enforce region_id filtering on Postgres CDC (if used)

Step 3: REST API queries (future W4 dashboard)
  Operator → Supabase REST API
  Headers: Authorization: Bearer {operator-jwt}
  RLS → filters all queries by auth.jwt() ->> 'region_id'
```

---

## 7. Data Flow with Latency Budgets

### 7.1 Detection-to-Alert Pipeline (Critical Path)

```
Event:   Drone detected by 3 Tier-1 nodes
Target:  Telegram alert delivered < 2000ms from first detection

Hop                                    Budget    Typical   Worst-case
─────────────────────────────────────────────────────────────────────
W1 AudioPipeline detect + classify      200ms     150ms     300ms
NATS publish (node → cluster)           10ms      5ms       50ms
NATS stream persist + consumer notify   5ms       2ms       20ms
ingest-event Edge Fn cold start         0ms       0ms       400ms *
ingest-event UPSERT (batch)            50ms       25ms      100ms
Postgres NOTIFY → TDoA service wake     5ms       2ms       10ms
TDoA correlation + LS solve            100ms      50ms      200ms
TDoA writes track + publishes alert    50ms       25ms      80ms
NATS ALERTS stream → alert-router      10ms       5ms       20ms
alert-router cold start                 0ms       0ms       400ms *
alert-router Telegram send             300ms     200ms      500ms
─────────────────────────────────────────────────────────────────────
TOTAL (warm functions)                 730ms     464ms      1280ms
TOTAL (both functions cold)           1530ms     864ms      2080ms

* Cold start mitigated by 45s keep-warm cron (see RISK-W2-03)
Target: p50 < 800ms, p95 < 1500ms, p99 < 2500ms

SLO violation threshold: >2500ms triggers alert to engineering Telegram channel
```

### 7.2 Health Reporting Flow

```
Hop                                    Budget    Typical
─────────────────────────────────────────────────
Node heartbeat publish (every 30s)     10ms      5ms
NATS → node-health Edge Fn            50ms       20ms
node-health DB insert                  50ms      25ms
nodes.last_seen_at update              10ms       5ms
─────────────────────────────────────────────────
TOTAL                                 120ms      55ms

Stale detection: fn_mark_stale_nodes() runs every 60s
Stale threshold: last_seen_at > 90s → status = "degraded"
                 last_seen_at > 180s → status = "offline"
```

### 7.3 Realtime Dashboard Feed

```
Hop                                    Budget    Typical
─────────────────────────────────────────────────
alert insert → Supabase Realtime       50ms      20ms
Realtime → WebSocket push to client    10ms       5ms
Client render update                   16ms      10ms
─────────────────────────────────────────────────
TOTAL (DB insert → UI update)          76ms      35ms
```

---

## 8. Error Paths and Retry Policies

### 8.1 NATS Delivery Errors

```
Error: Node cannot reach NATS cluster
Policy: NATS client reconnects with 5s exponential backoff, max 60s
        Node buffers events in local ring buffer (max 10,000 events, 100MB)
        On reconnect: replay buffered events to NATS
        Ring buffer full: drop oldest events; log WARNING

Error: NATS publish NACK (stream full)
Policy: Log ERROR; back off 10s; retry once
        Second NACK: log CRITICAL; stop publishing; alert operator
        Recovery: operator runs infra/nats/drain-stream.sh

Error: NATS authentication failure (mTLS)
Policy: Log CRITICAL; do not retry (cert is invalid or expired)
        Node enters "auth_failure" state; stops publishing
        Cert rotation script on fortress detects failure, issues new cert
```

### 8.2 Edge Function Errors

```
Error: ingest-event 5xx (Supabase internal error)
Policy: NATS consumer does not ACK
        NATS redelivers after ack_wait (5s)
        Max redelivery: 3 attempts
        After 3 failures: message moves to sentinel.dlq.detections.{nodeId}

Error: ingest-event 409 (duplicate nats_seq, should not happen — dedup is silent 200)
Policy: This is a bug; logged as ERROR; NATS message ACKed to prevent loop

Error: alert-router Telegram 429
Policy: Re-queue to ALERTS stream with 30s delay (NATS delayed redelivery)
        Exponential backoff: 5s, 10s, 20s, 40s, 80s, 120s (cap)
        After 5 attempts: write to sentinel.dlq.alerts.{alertId}

Error: alert-router CoT TCP failure
Policy: Circuit breaker incremented
        After 5 failures in 60s: circuit OPEN, CoT delivery skipped
        Messages written to sentinel.dlq.cot.{trackId}
        DLQ processor retries every 60s for up to 5 attempts
```

### 8.3 DLQ Processing

```
DLQ streams:
  sentinel.dlq.detections.{nodeId}
  sentinel.dlq.alerts.{alertId}
  sentinel.dlq.cot.{trackId}

DLQ processor: Deno service on fortress, polls every 60s

Processing logic per DLQ message:
  1. Read message + retry_count from payload
  2. If retry_count < 5:
       Attempt re-delivery to original destination
       On success: ACK DLQ message, log INFO
       On failure: NACK DLQ message, increment retry_count, update last_failed_at
  3. If retry_count >= 5:
       Write to alerts.payload.dead_letters (JSONB array)
       ACK DLQ message (remove from DLQ)
       Publish Telegram notification to ENGINEERING_CHAT_ID
       Log CRITICAL: "Message permanently failed delivery"

Dead letter schema in alerts.payload.dead_letters:
[
  {
    "original_subject": "sentinel.alerts.ALT-20260324-0001",
    "failed_at": "2026-03-24T10:05:00Z",
    "error": "circuit_breaker_open",
    "retry_count": 5,
    "payload_sha256": "sha256:..."
  }
]
```

---

## 9. Integration Test Matrix

### 9.1 Integration Point Status

| Integration | Protocol | Auth | Direction | Status |
|-------------|---------|------|-----------|--------|
| Node → NATS DETECTIONS | NATS/TLS | mTLS + nkey | Push | W2 |
| Node → NATS NODE_HEALTH | NATS/TLS | mTLS + nkey | Push | W2 |
| NATS → ingest-event | HTTPS | Service-role JWT | Push consumer | W2 |
| NATS → node-health | HTTPS | Service-role JWT | Push consumer | W2 |
| NATS → alert-router | HTTPS | Service-role JWT | Work-queue | W2 |
| ingest-event → PostgreSQL | pgbouncer | Service-role | Write | W2 |
| node-health → PostgreSQL | pgbouncer | Service-role | Write | W2 |
| alert-router → PostgreSQL | pgbouncer | Service-role | Read/Write | W2 |
| TDoA service → PostgreSQL | pgbouncer | Service-role | Read/Write | W2 |
| TDoA service → NATS ALERTS | NATS/TLS | nkey | Publish | W2 |
| alert-router → Telegram API | HTTPS | Bot token | Push | W2 |
| alert-router → FreeTAKServer | TCP | None (private net) | Push | W2 |
| alert-router → Supabase Realtime | Internal | Service-role | Broadcast | W2 |
| Supabase Realtime → Dashboard | WSS | Operator JWT | Subscribe | W4 |
| Meshtastic bridge → NATS | NATS/TLS | mTLS + nkey | Push | W2 |

### 9.2 Contract Tests Required

Each integration point must have a contract test verifying:
- Happy path: valid input → expected output
- Auth rejection: invalid credentials → expected error code
- Schema validation: malformed payload → 422/400
- Timeout: slow downstream → timeout error, not hang

Contract tests live in: `infra/__tests__/contracts/`

---

## 10. Configuration Reference

### 10.1 Supabase Vault Secrets Required for W2

```
SENTINEL_JWT_SECRET          — HMAC-SHA256 secret for node JWT signing
TELEGRAM_BOT_TOKEN           — Telegram bot API token
TELEGRAM_ALERT_CHAT_ID       — Telegram group chat ID for alerts
TELEGRAM_ENGINEERING_CHAT_ID — Telegram chat ID for engineering alerts (DLQ notifications)
FREETAK_HOST                 — FreeTAKServer hostname/IP
FREETAK_PORT                 — FreeTAKServer TCP port (default: 8087)
NODE_CERT_ALLOWLIST          — JSON array of allowed cert fingerprints
NATS_SERVICE_CREDS           — NATS credentials file content (for Edge Function NATS client)
```

### 10.2 Environment Variables for TDoA Service (fortress)

```
TDOA_WINDOW_MS=500           — Primary correlation window (ms)
TDOA_WINDOW_TIER3_MS=1500    — Extended window for Tier-3 Meshtastic nodes
TDOA_MIN_NODES=3             — Minimum nodes required for TDoA solve
TDOA_SPEED_OF_SOUND=343      — Speed of sound m/s (adjust for temperature/altitude)
TDOA_MAX_ITERATIONS=50       — Maximum LS iterations
TDOA_CONVERGENCE_M=1.0       — Convergence threshold (metres)
SUPABASE_URL=https://bymfcnwfyxuivinuzurr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=... — For writing to tracks table
NATS_URL=nats://nats1.apex-sentinel.internal:4222
NATS_CREDS=/etc/sentinel/nats/tdoa.creds
```

### 10.3 NATS Consumer Configurations

```yaml
# DETECTIONS stream push consumer (drives ingest-event)
consumer:
  name: ingest-event-consumer
  stream: DETECTIONS
  deliver_subject: sentinel.internal.ingest-event
  deliver_policy: all
  ack_policy: explicit
  ack_wait: 5s
  max_ack_pending: 50
  max_deliver: 3
  nack_backoff: [1s, 5s, 30s]

# ALERTS stream work-queue consumer (drives alert-router)
consumer:
  name: alert-router-consumer
  stream: ALERTS
  deliver_policy: all
  ack_policy: explicit
  ack_wait: 10s
  max_ack_pending: 10
  max_deliver: 5
  nack_backoff: [5s, 10s, 30s, 60s, 120s]
  flow_control: true

# NODE_HEALTH stream push consumer (drives node-health)
consumer:
  name: node-health-consumer
  stream: NODE_HEALTH
  deliver_subject: sentinel.internal.node-health
  deliver_policy: new
  ack_policy: none  # fire-and-forget; health logs are non-critical
  max_ack_pending: 100
```
