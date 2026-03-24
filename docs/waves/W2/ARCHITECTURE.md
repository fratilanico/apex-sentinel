# APEX-SENTINEL — Architecture
## W2 | PROJECTAPEX Doc 03/21 | 2026-03-24

---

## 1. System Overview

W2 introduces the backend infrastructure layer. W1 delivered the edge detection pipeline (YAMNet, Gate 1/2/3, EKF on-device). W2 connects those edge nodes into a networked system with persistent storage, real-time subscriptions, and cross-node correlation.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         APEX-SENTINEL W2 ARCHITECTURE                       │
├─────────────────┬───────────────────────────────┬───────────────────────────┤
│   EDGE LAYER    │      TRANSPORT LAYER           │    BACKEND LAYER          │
│                 │                               │                           │
│  ┌───────────┐  │   ┌─────────────────────────┐ │  ┌────────────────────┐   │
│  │ TIER-1    │  │   │  NATS JetStream Cluster  │ │  │  Supabase          │   │
│  │ GPS-PPS   │──┼──▶│  5 nodes, Raft consensus │─┼─▶│  PostgreSQL        │   │
│  │ Node      │  │   │  mTLS 1.3 all connections│ │  │  Edge Functions    │   │
│  └───────────┘  │   └──────────┬──────────────┘ │  │  Realtime WS       │   │
│                 │              │                │  └────────────────────┘   │
│  ┌───────────┐  │              │                │                           │
│  │ TIER-2    │  │   ┌──────────▼──────────────┐ │  ┌────────────────────┐   │
│  │ SDR       │──┼──▶│  TDoA Correlation Svc   │─┼─▶│  Track Manager     │   │
│  │ Node      │  │   │  Node.js, Newton-Raphson │ │  │  EKF State         │   │
│  └───────────┘  │   └─────────────────────────┘ │  └────────────────────┘   │
│                 │                               │                           │
│  ┌───────────┐  │   ┌─────────────────────────┐ │  ┌────────────────────┐   │
│  │ TIER-4    │  │   │  Mesh Bridge            │ │  │  Alert Router      │   │
│  │ Smartphone│──┼──▶│  LoRa ↔ NATS            │─┼─▶│  CoT/TAK/Telegram  │   │
│  │ (BLE/LoRa)│  │   │  BLE ↔ NATS             │ │  └────────────────────┘   │
│  └───────────┘  │   └─────────────────────────┘ │                           │
└─────────────────┴───────────────────────────────┴───────────────────────────┘
```

---

## 2. NATS JetStream Cluster Topology

### 2.1 Cluster Configuration

5-node NATS cluster in Raft consensus mode. Requires quorum of 3 nodes for any write operation.

```
NATS CLUSTER: sentinel-cluster
  node-1: nats://sentinel-nats-1:4222 (primary server)
  node-2: nats://sentinel-nats-2:4222
  node-3: nats://sentinel-nats-3:4222
  node-4: nats://sentinel-nats-4:4222
  node-5: nats://sentinel-nats-5:4222

Replication factor: 3 (all streams)
Storage: file (not memory — survives restarts)
Cluster domain: sentinel
```

NATS server config template (`/etc/nats/sentinel.conf`):
```
server_name: "${SERVER_NAME}"
listen: 0.0.0.0:4222
http: 0.0.0.0:8222

tls {
  cert_file: "/etc/nats/certs/server.crt"
  key_file:  "/etc/nats/certs/server.key"
  ca_file:   "/etc/nats/certs/ca.crt"
  verify:    true        # require client certs
  timeout:   5
}

cluster {
  name: "sentinel-cluster"
  listen: 0.0.0.0:6222
  tls {
    cert_file: "/etc/nats/certs/cluster.crt"
    key_file:  "/etc/nats/certs/cluster.key"
    ca_file:   "/etc/nats/certs/ca.crt"
    timeout:   5
  }
  routes: [
    "nats-route://sentinel-nats-1:6222"
    "nats-route://sentinel-nats-2:6222"
    "nats-route://sentinel-nats-3:6222"
    "nats-route://sentinel-nats-4:6222"
    "nats-route://sentinel-nats-5:6222"
  ]
}

jetstream {
  store_dir: "/data/jetstream"
  max_memory_store: 1GB
  max_file_store: 50GB
}

accounts {
  sentinel_nodes: {
    users: [{ user: "nodes", password: "$NODES_PASSWORD" }]
    jetstream: enabled
    exports: [
      { stream: "sentinel.node.>" }
      { stream: "sentinel.gate3.detection.>" }
    ]
  }
  sentinel_services: {
    users: [{ user: "services", password: "$SERVICES_PASSWORD" }]
    jetstream: enabled
  }
  sentinel_admin: {
    users: [{ user: "admin", password: "$ADMIN_PASSWORD" }]
    jetstream: enabled
  }
}
```

### 2.2 Stream Definitions

```
STREAM: SENTINEL_NODES
  Subjects: sentinel.node.>
  Retention: Limits
  Max age: 7 days
  Max bytes: 5 GB
  Max messages: 10,000,000
  Replication: 3
  Storage: File
  Compression: S2
  Description: Node registration, heartbeat, offline events

STREAM: SENTINEL_DETECTIONS
  Subjects: sentinel.gate3.detection.>
  Retention: Limits
  Max age: 30 days
  Max bytes: 100 GB
  Max messages: 500,000,000
  Replication: 3
  Storage: File
  Compression: S2
  Description: Gate 3 detection events, geo-sector bucketed

STREAM: SENTINEL_TRACKS
  Subjects: sentinel.track.>
  Retention: Limits
  Max age: 30 days
  Max bytes: 10 GB
  Max messages: 100,000,000
  Replication: 3
  Storage: File
  Compression: S2
  Description: Track lifecycle: update, confirmed, dropped

STREAM: SENTINEL_ALERTS
  Subjects: sentinel.alert.>
  Retention: Limits
  Max age: 90 days
  Max bytes: 1 GB
  Max messages: 1,000,000
  Replication: 3
  Storage: File
  Description: Alert events, all severities. Long retention for audit.

STREAM: SENTINEL_MODELS
  Subjects: sentinel.model.>
  Retention: Limits
  Max age: 14 days
  Max bytes: 10 GB
  Max messages: 1,000
  Replication: 3
  Storage: File
  Description: OTA model updates (YAMNet 480KB), max payload 512KB

STREAM: SENTINEL_SYSTEM
  Subjects: sentinel.system.>
  Retention: Limits
  Max age: 7 days
  Max bytes: 500 MB
  Replication: 3
  Storage: File
  Description: System mode changes, maintenance events
```

### 2.3 Consumer Definitions

```
CONSUMER: tdoa_correlator (on SENTINEL_DETECTIONS)
  Filter: sentinel.gate3.detection.>
  Deliver: sentinel.internal.tdoa.input
  Ack policy: Explicit
  Max ack pending: 10,000
  Ack wait: 30s
  Max deliver: 3
  Dead letter: sentinel.dlq.tdoa
  Description: TDoA correlation service consumes detection events

CONSUMER: track_manager (on SENTINEL_TRACKS)
  Filter: sentinel.track.>
  Deliver: sentinel.internal.track.input
  Ack policy: Explicit
  Max ack pending: 5,000
  Ack wait: 10s
  Max deliver: 3
  Dead letter: sentinel.dlq.track
  Description: Track state machine consumes track events

CONSUMER: alert_router (on SENTINEL_ALERTS)
  Filter: sentinel.alert.>
  Deliver: sentinel.internal.alert.input
  Ack policy: Explicit
  Max ack pending: 500
  Ack wait: 30s
  Max deliver: 5
  Description: Alert routing to external channels

CONSUMER: supabase_writer (on SENTINEL_DETECTIONS, SENTINEL_TRACKS, SENTINEL_ALERTS)
  Filter: sentinel.gate3.detection.> sentinel.track.> sentinel.alert.>
  Deliver: sentinel.internal.db.input
  Ack policy: Explicit
  Max ack pending: 20,000
  Ack wait: 15s
  Max deliver: 3
  Dead letter: sentinel.dlq.db
  Description: Writes all events to Supabase PostgreSQL
```

### 2.4 KV Store Definitions

```
KV STORE: sentinel-nodes
  TTL: 90 days
  Max value size: 16 KB
  Description: Current node state, per node_id
  Key format: sentinel.nodes.{node_id}
  Value: JSON NodeState object (see API spec)

KV STORE: sentinel-config
  TTL: unlimited
  Max value size: 4 KB
  Description: System configuration, hot-reloadable
  Key format: sentinel.config.{key}
  Keys:
    gate_thresholds → {"gate1":0.3,"gate2":0.6,"gate3":0.85}
    heartbeat_interval_s → 60
    tdoa_window_ms → 500
    mesh_relay_enabled → true
    alert_severity_thresholds → {"critical":0.95,"high":0.80,"medium":0.65,"low":0.50}

KV STORE: sentinel-models
  TTL: 30 days
  Max value size: 512 KB
  Description: Current active model versions and checksums
  Key format: sentinel.models.{model_name}
  Keys:
    yamnet_current → {"version":"2.1.0","sha256":"abc123...","size_bytes":491520}
    yamnet_rollback → {"version":"2.0.0","sha256":"def456...","size_bytes":491520}
```

### 2.5 Raft and Quorum Behaviour

- **Normal operation (5/5):** all writes proceed, replicated to 3 of 5 nodes
- **One node down (4/5):** quorum maintained (3 nodes), operations continue
- **Two nodes down (3/5):** quorum maintained (3 nodes), operations continue
- **Three nodes down (2/5):** quorum lost, cluster enters read-only mode
  - Minority partition queues to local file storage
  - On quorum restore, minority replays queued messages
- **Leader election:** Raft timeout 10s; new leader elected within 15s of leader failure

---

## 3. Supabase Architecture

### 3.1 Project Configuration

```
Project ID:  bymfcnwfyxuivinuzurr
Region:      eu-west-2 (London)
Tier:        Pro (required for Edge Functions + Realtime)
Postgres:    15.x
Extensions:  postgis, pg_cron, pgcrypto, uuid-ossp, pg_trgm
```

### 3.2 Edge Functions Architecture

Five Edge Functions deployed as Deno workers:

```
/functions/v1/register-node
  Runtime: Deno 1.40+
  Auth: mTLS certificate (nodes) + JWT (admin approval)
  Max execution: 10s
  Triggers: Direct HTTP call from node during boot
  Side effects: INSERT nodes, publish NATS sentinel.node.register

/functions/v1/ingest-event
  Runtime: Deno 1.40+
  Auth: mTLS certificate
  Max execution: 5s
  Triggers: Direct HTTP call from node for Gate 3 events
  Side effects: INSERT detection_events, publish NATS sentinel.gate3.detection.{geo_sector}
  Rate limit: 100/minute per node

/functions/v1/node-health (heartbeat)
  Runtime: Deno 1.40+
  Auth: mTLS certificate
  Max execution: 3s
  Triggers: Periodic call from node (default: 60s interval)
  Side effects: INSERT node_heartbeats, UPDATE nodes, publish NATS sentinel.node.heartbeat
  Rate limit: 6/minute per node (1 per 10s)

/functions/v1/node-status/{nodeId}
  Runtime: Deno 1.40+
  Auth: mTLS certificate OR JWT (ops_admin)
  Max execution: 2s
  Triggers: GET request from node or operator
  Side effects: none (read-only)

/functions/v1/alert-router
  Runtime: Deno 1.40+
  Auth: JWT (ops_admin, c2_operator)
  Max execution: 30s
  Triggers: POST from alert dispatch, or NATS-triggered via bridge
  Side effects: INSERT alerts, dispatch to external channels
```

### 3.3 Realtime Configuration

```
Realtime subscriptions enabled on:
  - detection_events: all new INSERTs (broadcast to all subscribers)
  - tracks: all INSERT and UPDATE events
  - alerts: all INSERT events, UPDATE where state changes

Realtime channel namespacing:
  sentinel:events:{geo_sector}  — geo-sector filtered detection stream
  sentinel:tracks               — all track updates
  sentinel:alerts               — all alert events
  sentinel:nodes                — node fleet state changes
```

### 3.4 Row Level Security Architecture

RLS is enabled on all tables. Three base roles:

```
node_agent
  - Can INSERT into node_heartbeats WHERE node_id = auth.uid()
  - Can SELECT/UPDATE nodes WHERE node_id = auth.uid()
  - Can INSERT into detection_events WHERE node_id = auth.uid()
  - CANNOT read other nodes' data

ops_admin
  - Full SELECT on all tables
  - Can UPDATE nodes (state, capabilities)
  - Can INSERT into operator_audit_log
  - Cannot DELETE from audit tables

c2_operator
  - SELECT on detection_events, tracks, alerts
  - Can UPDATE alerts (state field only)
  - Cannot access nodes, heartbeats, audit_log

privacy_officer
  - SELECT on operator_audit_log (full access)
  - SELECT on nodes, detection_events (read-only)
  - Cannot access node credentials or certificates
```

### 3.5 Database Connection Architecture

```
Direct connections: used by Edge Functions (pgbouncer pooling)
  pool_size: 5 per function instance
  pool_mode: transaction

Realtime: uses separate logical replication slot
  max_replication_slots: 5

pg_cron: runs as postgres role
  Schedules: 4 retention jobs (one per table)

External analytics (future W5):
  read replica endpoint (read-only role)
```

---

## 4. Mesh Networking Stack

### 4.1 Meshtastic LoRa Architecture

```
DEPLOYMENT MODEL:
  IP-connected nodes → NATS (direct, mTLS)
  Mesh relay nodes   → Meshtastic LoRa → Mesh Bridge → NATS
  MESH-ONLY nodes    → LoRa → relay → Mesh Bridge → NATS

FREQUENCY PLAN: EU 868 MHz
  Channel 0: 868.1 MHz (primary, detection events)
  Channel 1: 868.3 MHz (heartbeats, lower priority)
  Channel 2: 868.5 MHz (OTA model updates, lowest priority)
  SF: 9 (SF7 for low-latency detection relay, SF12 for long-range heartbeats)
  BW: 125 kHz
  CR: 4/5
  Max payload: 255 bytes (after mesh header overhead: ~200 bytes)

DUTY CYCLE MANAGEMENT:
  EU regulatory limit: 1% duty cycle
  Detection events: ≤1 per second per node (200 bytes/msg → ~5% of limit)
  Heartbeats: 1 per 5 minutes on Channel 1
  Budget reserved for emergency relay: 20%
```

### 4.2 Meshtastic Protocol Bridge

The Mesh Bridge is a Node.js service that:
1. Connects to Meshtastic node via serial/BLE/TCP
2. Subscribes to all Meshtastic packet channels
3. Decodes Sentinel-specific packet types (detection events, heartbeats)
4. Publishes to NATS with relay_path metadata appended

```typescript
// Mesh Bridge message flow
interface MeshtasticPacket {
  from: string;       // Meshtastic node ID (hex)
  to: string;         // destination or broadcast
  channel: number;    // 0=events, 1=heartbeats, 2=models
  payload: Buffer;    // serialised SentinelMeshPayload (protobuf)
  rxRssi: number;
  rxSnr: number;
  hopCount: number;
  relayNodeNum?: string;
}

interface SentinelMeshPayload {
  type: 'detection_event' | 'heartbeat' | 'model_ack';
  sentinel_node_id: string;  // sentinel node_id (nde_...)
  timestamp_us: bigint;
  data: Uint8Array;           // compressed JSON, max 180 bytes
}
```

### 4.3 BLE Google Nearby Connections Architecture

BLE fallback activates when both IP and LoRa are unavailable for >30 seconds.

```
Advertiser: MESH-ONLY node (no IP, no LoRa signal)
Discoverer: Nearby node with IP connectivity
Strategy: P2P_CLUSTER (many-to-many)
Service ID: "io.apex-os.sentinel.mesh"
Max payload: 32,768 bytes (Nearby Connections BYTES payload type)

Payload types:
  type=0x01: detection_event (compact JSON, max 512 bytes)
  type=0x02: heartbeat (compact JSON, max 128 bytes)
  type=0x03: sync_request (request replay of last N events from neighbour)
  type=0x04: sync_response (batch of cached events)
```

BLE quality management:
- Connection prioritised by: RSSI > -80 dBm
- Automatic reconnect on disconnect with 5-second backoff
- Event queue: LRU, max 500 events, eviction logged to local storage
- Deduplication on reconnect: events matched by event_id (ulid), duplicates dropped silently

---

## 5. TDoA Correlation Service Architecture

### 5.1 Service Overview

```
Language: Node.js 20 LTS
Runtime: Docker container, 2 CPU cores, 2GB RAM
Scaling: 1 instance per geo_sector zone (consistent hash routing)
NATS consumer: tdoa_correlator (pull consumer, batch 100)
Output: sentinel.track.update, sentinel.track.confirmed
```

### 5.2 Event Aggregation Window

```
Time window: 500ms (configurable via KV sentinel.config.tdoa_window_ms)
Minimum nodes required: 3 (for Newton-Raphson), 2 (for centroid fallback)
Deduplication: event_id checked against 60-second LRU cache (max 100,000 entries)

Window algorithm:
  1. Receive detection event with timestamp_us
  2. Open correlation window: [timestamp_us - 500ms, timestamp_us + 500ms]
  3. Buffer events within window from same geo_sector
  4. After window closes (500ms of no new events): attempt solver
  5. If ≥3 nodes: invoke Newton-Raphson solver
  6. If 2 nodes: publish centroid estimate with degraded_confidence=true
  7. If 1 node: publish single-node detection with no_tdoa=true
```

### 5.3 Newton-Raphson Solver

```
Input:
  nodes[]: Array<{lat, lon, alt, timestamp_us, weight}>
    weight = 1.0 for GPS-PPS (±1μs), 0.3 for smartphone (±50ms)
  initial_estimate: {lat, lon, alt} (centroid of contributing nodes as seed)

Algorithm:
  1. Convert all lat/lon/alt to ECEF (X, Y, Z) coordinates
  2. For each node pair (i,j): compute TDOA = (timestamp_us[i] - timestamp_us[j]) × c
     where c = 343.0 m/s (speed of sound at 20°C, 1 ATM)
  3. Construct Jacobian matrix J (3×3 for 3 nodes)
  4. Newton-Raphson iteration: x_{k+1} = x_k - J^{-1} × f(x_k)
  5. Convergence: ||x_{k+1} - x_k|| < 0.001 (1mm) OR max 50 iterations
  6. Convert result back to lat/lon/alt
  7. Compute position_error_m from condition number of J × timing_uncertainty

Convergence failure handling:
  - If solver diverges (condition number > 1e10): fall back to centroid
  - If initial estimate is > 5km from any node: re-seed with cluster centroid
  - If all nodes are GPS-PPS: expected accuracy ±62m (theoretical)
  - If mix includes smartphones: expected accuracy degrades proportionally to weight sum

Output:
  {lat, lon, alt, position_error_m, solver_iterations, convergence_type, node_weights[]}
```

### 5.4 Node Weighting System

```
Tier 1 GPS-PPS:    timing precision ±1μs    → weight 1.0
Tier 2 SDR:        timing precision ±100μs  → weight 0.7
Tier 3 Embedded:   timing precision ±1ms    → weight 0.5
Tier 4 Smartphone: timing precision ±50ms   → weight 0.3

Node weight also modified by:
  signal_strength < -90 dBm: × 0.8
  missed_heartbeats > 0: × 0.7
  last_seen_at > 5min ago: × 0.5 (stale node)
```

### 5.5 TDoA → Track Manager Pipeline

```
TDoA Correlation Service publishes:
  Subject: sentinel.track.update
  Payload: {
    event_id, track_id (if existing), lat, lon, alt_m,
    position_error_m, velocity (if ≥2 prior fixes),
    contributing_nodes[], solver_type, timestamp_us,
    fused_confidence, threat_class, gate_level
  }

Track Manager:
  - Maintains EKF state per track_id
  - Associates new TDoA fix with existing track (within 500m, < 30s)
  - Creates new track if no existing track matches
  - Publishes sentinel.track.confirmed after 3 consistent fixes
  - Publishes sentinel.track.dropped after 30s of no new fixes
```

---

## 6. Message Flow Diagrams

### 6.1 Node Registration Flow

```
Field Device                 Edge Function               Supabase/NATS
    │                             │                            │
    │  POST /register-node        │                            │
    │  + mTLS cert + payload ────▶│                            │
    │                             │  Validate cert chain       │
    │                             │──────────────────────────▶ │
    │                             │  INSERT nodes (PENDING)    │
    │                             │◀────── 201 Created ────── │
    │                             │  Publish node.register     │
    │                             │──────────────────────────▶ │
    │◀───── 202 Accepted ────────│  (NATS confirmed)          │
    │       {node_id, nats_creds} │                            │
    │                             │                            │
    │  POST /node-health          │                            │
    │  (first heartbeat) ────────▶│                            │
    │                             │  UPDATE nodes: PENDING→ONLINE │
    │                             │──────────────────────────▶ │
    │◀───── 200 OK ──────────────│                            │
```

### 6.2 Detection Event Flow

```
Detection Node               NATS Cluster                Backend Services
    │                             │                            │
    │  Gate3 event fires locally  │                            │
    │  POST /ingest-event ───────▶│  (via Edge Function)       │
    │                             │  INSERT detection_events   │
    │                             │──────────────────────────▶ │
    │                             │  Publish:                  │
    │                             │  sentinel.gate3.detection  │
    │                             │  .{geo_sector} ───────────▶│
    │◀──── 201 Created ──────────│                            │
    │                             │                            │  TDoA Correlator
    │                             │  ◀── pull batch ──────────│──────────────────
    │                             │  ─── events ─────────────▶│  buffer 500ms
    │                             │                            │  Newton-Raphson
    │                             │                            │  publish track.update
    │                             │ ◀── sentinel.track.update ─│
    │                             │  INSERT tracks ───────────▶│
    │                             │  Realtime broadcast ──────▶│
    │                             │  (WebSocket to C2)         │
```

### 6.3 Heartbeat Flow

```
Node                    Edge Function            Supabase          NATS
  │                          │                      │               │
  │  POST /node-health ─────▶│                      │               │
  │  (every 60s)             │  Validate cert        │               │
  │                          │  INSERT heartbeat ───▶│               │
  │                          │  UPDATE nodes.last_seen│              │
  │                          │  Publish heartbeat ───┼──────────────▶│
  │◀── 200 OK ──────────────│                      │               │
  │                          │                      │  KV update ──▶│
  │                          │                      │  sentinel.nodes│
  │                          │                      │  .{node_id}   │
```

### 6.4 Alert Routing Flow

```
Track Manager           NATS              Alert Router           External
    │                    │                     │                    │
    │  Publish           │                     │                    │
    │  sentinel.alert ──▶│                     │                    │
    │  .HIGH             │  Pull consumer ─────▶│                  │
    │                    │                     │  INSERT alert      │
    │                    │                     │                    │
    │                    │                     │  Dispatch CoT ───▶ TAK Server
    │                    │                     │  Send Telegram ──▶ Chat
    │                    │                     │  POST webhook ───▶ Webhook
    │                    │                     │  Create incident ▶ PagerDuty
    │                    │                     │                    │
    │                    │                     │  Log to audit_log  │
```

---

## 7. Security Architecture

### 7.1 mTLS Certificate Hierarchy

```
APEX-SENTINEL Root CA (offline, HSM-backed)
  │
  ├── Intermediate CA: Nodes
  │     └── Leaf certs: one per node (node_id encoded in CN)
  │           Format: CN=nde_01J9X4K2P3Q5R6S7T8U9V0W1X2
  │           SANs: none required
  │           Validity: 90 days
  │           Key: ECDSA P-256
  │
  ├── Intermediate CA: NATS Cluster
  │     └── Server certs for each NATS node
  │     └── Cluster peer certs
  │
  └── Intermediate CA: Services
        └── Edge Functions (client cert for NATS pub/sub)
        └── TDoA Correlator
        └── Track Manager
```

### 7.2 JWT Architecture

Operator JWTs issued by Supabase Auth:
```
Claims:
  sub: operator_id (uuid)
  email: operator email
  role: one of [ops_admin, c2_operator, privacy_officer, node_operator]
  aud: authenticated
  iss: https://bymfcnwfyxuivinuzurr.supabase.co/auth/v1
  exp: iat + 3600 (1 hour)

Refresh: 7-day refresh token, single-use
Session storage: httpOnly cookie (not localStorage)
```

### 7.3 NATS Authorization

NATS account-level authorization:
```
node_agent account:
  PUBLISH: sentinel.node.register, sentinel.node.heartbeat
           sentinel.gate3.detection.{own_geo_sector}
  SUBSCRIBE: sentinel.model.update, sentinel.config.{own_node_id}
  MAX_PAYLOAD: 65536 (64KB)

services account:
  PUBLISH: sentinel.track.>, sentinel.alert.>
  SUBSCRIBE: sentinel.gate3.detection.>, sentinel.node.>
  MAX_PAYLOAD: 1048576 (1MB)

admin account:
  ALL subjects
  ALL operations
```

### 7.4 Circuit Breakers

All inter-service calls use circuit breakers (opossum library):

```
NATS publish circuit:
  threshold: 50% failures in 10s window
  cooldown: 30s
  half-open probe: 1 request
  timeout: 2000ms

Supabase write circuit:
  threshold: 50% failures in 10s window
  cooldown: 60s
  half-open probe: 1 request
  timeout: 5000ms

External alert dispatch circuit (per channel):
  threshold: 3 consecutive failures
  cooldown: 120s
  half-open probe: 1 request
  timeout: 10000ms
```

When circuit is OPEN:
- NATS publish: queue to local file buffer, retry on half-open
- Supabase write: return 503 with retry_after_ms
- Alert dispatch: log failure, continue with other channels

---

## 8. Deployment Topology

### 8.1 Service Placement

```
Supabase Cloud (eu-west-2, managed):
  - PostgreSQL 15 with all W2 tables
  - 5 Edge Functions (register-node, ingest-event, node-health, node-status, alert-router)
  - Realtime WebSocket server
  - Auth service

Customer Deployment (VMs, bare metal, or Kubernetes):
  - NATS cluster: 5 nodes (minimum 3 for quorum)
    Recommended: 3 in primary availability zone, 2 in secondary
  - TDoA Correlation Service: 1 instance per 50-node cluster
    Scales horizontally via geo-sector hash ring
  - Track Manager: 1 instance per geo zone
    Stateful; requires sticky routing by geo_sector
  - Mesh Bridge: 1 per physical LoRa gateway (typically co-located)
  - Alert Router: 1 active, 1 standby (active-passive failover)

Edge (on detection node hardware):
  - W1 detection pipeline (YAMNet, Gate 1/2/3, EKF)
  - Heartbeat daemon
  - Local event queue (SQLite, max 10,000 events)
  - Mesh relay client (if tier 4)
```

### 8.2 Network Topology

```
Internet / WAN
  │
  ├── NATS Cluster (5 nodes, private subnet)
  │     Internal NATS routing: port 6222 (cluster routes)
  │     Client connections: port 4222 (mTLS)
  │     Monitoring: port 8222 (restricted to ops network)
  │
  ├── Supabase (SaaS, eu-west-2)
  │     HTTPS 443 for Edge Functions
  │     WSS 443 for Realtime
  │     postgres://... 5432 for direct connections
  │
  ├── Detection Nodes (field deployment)
  │     Outbound: NATS 4222 (mTLS) + Supabase 443
  │     No inbound connections required
  │
  └── C2 Dashboard (browser or Electron)
        WSS to Supabase Realtime
        HTTPS to Supabase Edge Functions
```

### 8.3 Kubernetes Deployment (production)

```yaml
# NATS StatefulSet: 5 replicas with PVCs for JetStream storage
# TDoA Correlator: Deployment, 2+ replicas, HPA on CPU
# Track Manager: StatefulSet (sticky geo-sector routing), 2+ replicas
# Mesh Bridge: DaemonSet on gateway nodes
# Alert Router: Deployment, 2 replicas (leader election via K8s lease)

Resource requests (per service):
  NATS node:          CPU: 1, Memory: 2Gi, Storage: 50Gi
  TDoA Correlator:    CPU: 2, Memory: 2Gi
  Track Manager:      CPU: 1, Memory: 1Gi
  Mesh Bridge:        CPU: 0.5, Memory: 512Mi
  Alert Router:       CPU: 0.5, Memory: 512Mi
```

---

## 9. Data Flow and Privacy Boundaries

```
PRIVACY BOUNDARY: raw audio never crosses this line
┌─────────────────────────────────────────────────────────┐
│  DEVICE                                                  │
│  Audio input → YAMNet inference → acoustic_confidence   │
│  Only confidence score (float) exits the device         │
└─────────────────────────────────┬───────────────────────┘
                                  │ acoustic_confidence (0.0-1.0)
                                  │ peak_freq_hz (int)
                                  │ timestamp_us (int64)
                                  ▼
PRIVACY BOUNDARY: position coarsened to ±50m grid
┌─────────────────────────────────────────────────────────┐
│  NATS LAYER                                             │
│  lat/lon: floor to 0.0005 degree grid (≈50m at equator) │
│  No raw audio, no waveforms, no personal data          │
└─────────────────────────────────┬───────────────────────┘
                                  ▼
PRIVACY BOUNDARY: position coarsened further for storage
┌─────────────────────────────────────────────────────────┐
│  SUPABASE STORAGE                                       │
│  detection_events.lat/lon: 4 decimal places (±11m)     │
│  node.lat/lon: 3 decimal places (±111m)                │
│  operator IP: coarsened to /24 in audit_log            │
└─────────────────────────────────────────────────────────┘
```
