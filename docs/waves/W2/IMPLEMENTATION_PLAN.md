# APEX-SENTINEL — Wave 2 Implementation Plan
# FILE 16 of 20 — IMPLEMENTATION_PLAN.md
# Wave 2 Scope: NATS JetStream + Supabase Schema + Edge Functions + TDoA + Alert Routing
# Created: 2026-03-24

---

## Wave 2 Deliverable

A production-grade cloud infrastructure backbone that:
1. Runs a 5-node NATS JetStream Raft cluster with 4 streams (DETECTIONS, NODE_HEALTH, ALERTS, COT_EVENTS)
2. Applies Supabase migrations 0007–0016 (nodes, detection_events, tracks, alerts, node_health_log, lkgc_snapshots, etc.)
3. Deploys 5 Supabase Edge Functions: register-node, ingest-event, node-health, alert-router, tdoa-correlate
4. Runs a Node.js TDoA correlation microservice that consumes DETECTIONS, correlates multi-node events in 500ms windows, runs W1's TdoaSolver, and publishes confirmed tracks
5. Routes confirmed tracks to Telegram (alert bot) and FreeTAKServer (COT events)
6. Bridges Meshtastic LoRa mesh relay events into the NATS DETECTIONS stream

**TDD order is non-negotiable.** Write the failing test first. Commit RED. Then implement. Commit GREEN.

---

## Environment Variables Required

All must be present in `.env` (local dev) and in CI secrets / systemd `EnvironmentFile`. Never commit.

```bash
# Supabase
SUPABASE_URL=https://bymfcnwfyxuivinuzurr.supabase.co
SUPABASE_ANON_KEY=<from Supabase dashboard → Project Settings → API>
SUPABASE_SERVICE_KEY=<service_role key — backend services only>
SUPABASE_DB_URL=postgresql://postgres:<pw>@db.bymfcnwfyxuivinuzurr.supabase.co:5432/postgres
SUPABASE_PAT=<personal access token — DDL migrations only>
SUPABASE_PROJECT_REF=bymfcnwfyxuivinuzurr

# NATS
NATS_URL=nats://nats1.apex-sentinel.internal:4222
NATS_CLUSTER_SEEDS=nats1.apex-sentinel.internal:4222,nats2.apex-sentinel.internal:4222,nats3.apex-sentinel.internal:4222
NATS_USER=apex-sentinel
NATS_PASS=<generated — see infra/nats/auth.conf>
NATS_CREDS_FILE=/etc/apex-sentinel/nats.creds  # NKey credentials file

# Alert routing
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_ALERT_CHAT_ID=<chat or channel ID>

# FreeTAKServer
FTS_HOST=localhost
FTS_COT_PORT=8087
FTS_TCP_PORT=8087
FTS_REST_PORT=19023

# Meshtastic bridge
MESHTASTIC_SERIAL_PORT=/dev/ttyUSB0  # or /dev/ttyACM0
MESHTASTIC_BAUD_RATE=115200

# TDoA service
TDOA_CORRELATION_WINDOW_MS=500
TDOA_MIN_NODES=3
TDOA_FALLBACK_CENTROID=true
TDOA_SPEED_OF_SOUND_MS=343  # meters/second (sea level, 20°C)

# Service identity
SERVICE_NAME=apex-tdoa-correlation
NODE_ENV=production
LOG_LEVEL=info
```

---

## Phase 1: NATS JetStream 5-Node Raft Cluster (Days 1–3)

### Scope

Stand up a 5-node NATS JetStream cluster with full Raft consensus, configure all 4 streams,
and verify cluster health. This is the messaging backbone for all W2 data flows.

### P1.1 — Infrastructure: VM Provisioning and NATS Installation (Day 1)

**Files to create:**
- `infra/nats/docker-compose.yml`
- `infra/nats/nats1.conf` through `nats5.conf`
- `infra/nats/auth.conf`
- `infra/nats/tls/` (certificates — generated, not committed)

**NATS server configuration template** (`infra/nats/nats1.conf`):

```conf
# NATS Server — apex-sentinel cluster node 1
server_name: nats1

# Cluster
cluster {
  name: APEX-SENTINEL
  listen: 0.0.0.0:6222
  routes: [
    nats-route://nats2.apex-sentinel.internal:6222
    nats-route://nats3.apex-sentinel.internal:6222
    nats-route://nats4.apex-sentinel.internal:6222
    nats-route://nats5.apex-sentinel.internal:6222
  ]
}

# JetStream
jetstream {
  store_dir: /data/nats/jetstream
  domain: apex-sentinel
  max_memory_store: 512MB
  max_file_store: 10GB
}

# Client connections
listen: 0.0.0.0:4222

# Monitoring
http: 8222

# Authentication — NKey + username/password fallback
include ./auth.conf

# Logging
logfile: /var/log/nats/nats-server.log
logfile_size_limit: 100MB
max_traced_msg_len: 512
```

**Authentication config** (`infra/nats/auth.conf`):

```conf
# NKey accounts for service identity
accounts {
  APEX_SENTINEL {
    jetstream: enabled
    users: [
      { user: "apex-sentinel", password: "$NATS_PASS" }
      { nkey: "UAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }
    ]
  }
}
system_account: "$SYS"
```

**Docker Compose** (`infra/nats/docker-compose.yml`):

```yaml
version: "3.9"

services:
  nats1:
    image: nats:2.10-alpine
    container_name: apex-nats1
    hostname: nats1
    ports:
      - "4222:4222"
      - "6222:6222"
      - "8222:8222"
    volumes:
      - ./nats1.conf:/etc/nats/nats.conf:ro
      - ./auth.conf:/etc/nats/auth.conf:ro
      - nats1-data:/data/nats
      - nats1-logs:/var/log/nats
    command: ["-c", "/etc/nats/nats.conf"]
    restart: on-failure
    networks:
      - apex-nats

  nats2:
    image: nats:2.10-alpine
    container_name: apex-nats2
    hostname: nats2
    ports:
      - "4223:4222"
      - "6223:6222"
      - "8223:8222"
    volumes:
      - ./nats2.conf:/etc/nats/nats.conf:ro
      - ./auth.conf:/etc/nats/auth.conf:ro
      - nats2-data:/data/nats
      - nats2-logs:/var/log/nats
    command: ["-c", "/etc/nats/nats.conf"]
    restart: on-failure
    networks:
      - apex-nats

  # nats3, nats4, nats5: same pattern — adjust hostname, ports, conf file

networks:
  apex-nats:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16

volumes:
  nats1-data:
  nats1-logs:
  nats2-data:
  nats2-logs:
  nats3-data:
  nats3-logs:
  nats4-data:
  nats4-logs:
  nats5-data:
  nats5-logs:
```

**Commands to run:**

```bash
cd infra/nats
docker compose up -d
# Wait 10 seconds for Raft election
sleep 10
# Verify cluster
nats --server nats://localhost:4222 --user apex-sentinel --password $NATS_PASS \
  server report cluster
# Expected: 5 servers, 1 leader
nats server ping
# Expected: 5/5 servers respond
```

**Acceptance criteria (P1.1):**
- `nats server ping` returns 5/5 responses within 2 seconds
- `nats server report cluster` shows 1 leader elected
- No `ERR` lines in `/var/log/nats/nats-server.log` on any node
- JetStream enabled: `nats server report jetstream` shows enabled on all 5 nodes

---

### P1.2 — Stream Definitions (Day 2)

**Files to create:**
- `infra/nats/streams/detections.json`
- `infra/nats/streams/node_health.json`
- `infra/nats/streams/alerts.json`
- `infra/nats/streams/cot_events.json`
- `infra/nats/streams/create-streams.sh`

**DETECTIONS stream** (`infra/nats/streams/detections.json`):

```json
{
  "name": "DETECTIONS",
  "subjects": ["sentinel.detections.>"],
  "retention": "limits",
  "storage": "file",
  "num_replicas": 3,
  "max_age": 259200000000000,
  "max_bytes": 5368709120,
  "max_msg_size": 65536,
  "discard": "old",
  "duplicate_window": 120000000000,
  "allow_rollup_hdrs": false,
  "deny_delete": true,
  "deny_purge": false,
  "max_consumers": -1,
  "description": "W1 on-device detection events from all sensor nodes"
}
```

Subject routing:
```
sentinel.detections.{node_id}           — single node detection event
sentinel.detections.*.acoustic          — acoustic-only events (filter)
sentinel.detections.*.rf                — RF-only events (filter)
sentinel.detections.*.fused             — fused acoustic+RF events
```

**NODE_HEALTH stream** (`infra/nats/streams/node_health.json`):

```json
{
  "name": "NODE_HEALTH",
  "subjects": ["sentinel.health.>"],
  "retention": "limits",
  "storage": "file",
  "num_replicas": 3,
  "max_age": 86400000000000,
  "max_bytes": 524288000,
  "max_msg_size": 8192,
  "discard": "old",
  "duplicate_window": 60000000000,
  "description": "Sensor node heartbeats and health telemetry"
}
```

Subject routing:
```
sentinel.health.{node_id}               — full heartbeat payload
sentinel.health.{node_id}.battery       — battery-only sub-topic
sentinel.health.{node_id}.gps           — GPS accuracy sub-topic
```

**ALERTS stream** (`infra/nats/streams/alerts.json`):

```json
{
  "name": "ALERTS",
  "subjects": ["sentinel.alerts.>"],
  "retention": "limits",
  "storage": "file",
  "num_replicas": 3,
  "max_age": 604800000000000,
  "max_bytes": 1073741824,
  "max_msg_size": 32768,
  "discard": "old",
  "description": "Confirmed threat tracks and dispatched alerts"
}
```

Subject routing:
```
sentinel.alerts.track.{track_id}        — confirmed track event
sentinel.alerts.dispatch.telegram       — Telegram dispatch queue
sentinel.alerts.dispatch.cot            — FreeTAKServer COT queue
sentinel.alerts.dispatch.sms            — SMS dispatch queue (W3)
```

**COT_EVENTS stream** (`infra/nats/streams/cot_events.json`):

```json
{
  "name": "COT_EVENTS",
  "subjects": ["sentinel.cot.>"],
  "retention": "limits",
  "storage": "file",
  "num_replicas": 3,
  "max_age": 86400000000000,
  "max_bytes": 209715200,
  "max_msg_size": 32768,
  "discard": "old",
  "description": "FreeTAKServer Cursor-on-Target events for ATAK relay"
}
```

**Stream creation script** (`infra/nats/streams/create-streams.sh`):

```bash
#!/usr/bin/env bash
set -euo pipefail
NATS_SERVER="${NATS_URL:-nats://localhost:4222}"
STREAMS_DIR="$(dirname "$0")"

for stream_file in "$STREAMS_DIR"/*.json; do
  STREAM_NAME=$(jq -r '.name' "$stream_file")
  echo "Creating stream: $STREAM_NAME"
  nats --server "$NATS_SERVER" stream add \
    --config "$stream_file" \
    --force 2>/dev/null || \
  nats --server "$NATS_SERVER" stream edit \
    "$STREAM_NAME" --config "$stream_file"
  echo "  OK: $STREAM_NAME"
done

echo "Verifying streams:"
nats --server "$NATS_SERVER" stream report
```

**Commands to run (Day 2):**

```bash
cd infra/nats/streams
chmod +x create-streams.sh
./create-streams.sh

# Verify each stream
for stream in DETECTIONS NODE_HEALTH ALERTS COT_EVENTS; do
  nats stream info $stream
done
```

**Acceptance criteria (P1.2):**
- All 4 streams listed in `nats stream report`
- DETECTIONS: replicas=3, storage=file, max_age=72h
- NODE_HEALTH: replicas=3, max_age=24h
- ALERTS: replicas=3, max_age=168h
- COT_EVENTS: replicas=3, max_age=24h
- Publish test message: `nats pub sentinel.detections.test-node '{"test":true}'` → message appears in stream

---

### P1.3 — NATS Consumer Groups (Day 3)

Consumer groups for TDoA service and alert router. Created as durable pull consumers
so they survive service restarts.

**Files to create:**
- `infra/nats/consumers/tdoa-correlation.json`
- `infra/nats/consumers/alert-router.json`
- `infra/nats/consumers/cot-relay.json`
- `infra/nats/consumers/create-consumers.sh`

**TDoA correlation consumer** (`infra/nats/consumers/tdoa-correlation.json`):

```json
{
  "name": "tdoa-correlation-group",
  "stream_name": "DETECTIONS",
  "durable_name": "tdoa-correlation-group",
  "deliver_policy": "last_per_subject",
  "ack_policy": "explicit",
  "ack_wait": 30000000000,
  "max_deliver": 3,
  "filter_subject": "sentinel.detections.>",
  "max_waiting": 512,
  "description": "TDoA correlation microservice consumer"
}
```

**Alert router consumer** (`infra/nats/consumers/alert-router.json`):

```json
{
  "name": "alert-router-group",
  "stream_name": "ALERTS",
  "durable_name": "alert-router-group",
  "deliver_policy": "new",
  "ack_policy": "explicit",
  "ack_wait": 60000000000,
  "max_deliver": 5,
  "filter_subject": "sentinel.alerts.>",
  "description": "Alert dispatch consumer (Telegram + COT)"
}
```

**Acceptance criteria (P1.3):**
- `nats consumer report DETECTIONS` shows `tdoa-correlation-group` with lag = 0
- `nats consumer report ALERTS` shows `alert-router-group` with lag = 0
- Consumer survives Docker restart: `docker compose restart nats1` → consumer still listed

**P1 LKGC capture:**
```bash
./scripts/capture-lkgc.sh W2 P1-NATS-COMPLETE
```

---

## Phase 2: Supabase Migrations (Days 4–6)

### Scope

Apply migrations 0007–0016 to the Supabase project. Each migration has a corresponding
rollback file. All schema changes go through `supabase db push` — no manual SQL via Supabase
Studio in production.

### Migration Files

**Location:** `supabase/migrations/`

**Rule:** Migrations are applied in numeric order. Each file is idempotent (uses
`IF NOT EXISTS`, `CREATE OR REPLACE`). Each has a matching `rollbacks/NNNN_name_down.sql`.

---

#### Migration 0007: nats_stream_config

```sql
-- 0007_nats_stream_config.sql
-- Stores NATS stream configuration snapshot for auditing and LKGC

CREATE TABLE IF NOT EXISTS nats_stream_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_name     text NOT NULL,
  config_json     jsonb NOT NULL,
  applied_at      timestamptz NOT NULL DEFAULT NOW(),
  applied_by      text NOT NULL DEFAULT current_user,
  wave            text NOT NULL DEFAULT 'W2',
  notes           text
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nats_stream_config_stream_wave
  ON nats_stream_config (stream_name, wave);

COMMENT ON TABLE nats_stream_config IS
  'NATS JetStream stream configuration snapshots for auditing and rollback';
```

Rollback (`rollbacks/0007_nats_stream_config_down.sql`):
```sql
DROP TABLE IF EXISTS nats_stream_config CASCADE;
```

---

#### Migration 0008: tracks

The `tracks` table stores confirmed multi-node detection tracks produced by the TDoA
correlation service. Each row represents one triangulated threat location.

```sql
-- 0008_tracks.sql

CREATE TYPE IF NOT EXISTS track_status AS ENUM (
  'provisional',   -- < 3 nodes, centroid fallback
  'confirmed',     -- ≥ 3 nodes, full TDoA triangulation
  'dismissed',     -- human operator dismissed
  'archived'       -- older than retention window
);

CREATE TYPE IF NOT EXISTS threat_class AS ENUM (
  'fpv_drone',
  'shahed_class',
  'commercial_drone',
  'unknown_uas',
  'false_positive'
);

CREATE TABLE IF NOT EXISTS tracks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_number          serial,  -- human-readable track ID: TRK-000001
  status                track_status NOT NULL DEFAULT 'provisional',
  threat_class          threat_class NOT NULL DEFAULT 'unknown_uas',

  -- Position (WGS84)
  latitude              double precision NOT NULL,
  longitude             double precision NOT NULL,
  altitude_m            double precision,  -- MSL meters, null if not estimated
  position_error_m      double precision,  -- 1-sigma error radius in meters
  position_method       text NOT NULL DEFAULT 'tdoa',
  -- 'tdoa' = full triangulation, 'centroid' = simple average of node positions

  -- Timing
  first_detected_at     timestamptz NOT NULL,
  last_updated_at       timestamptz NOT NULL DEFAULT NOW(),
  confirmed_at          timestamptz,
  dismissed_at          timestamptz,
  dismissed_by          uuid REFERENCES auth.users(id),

  -- Correlated events
  contributing_node_ids uuid[] NOT NULL DEFAULT '{}',
  contributing_event_ids uuid[] NOT NULL DEFAULT '{}',
  node_count            int NOT NULL DEFAULT 0,

  -- TDoA computation metadata
  tdoa_residual_ms      double precision,  -- RMS residual of TDoA fit in milliseconds
  tdoa_iteration_count  int,
  tdoa_converged        boolean DEFAULT false,

  -- COT relay state
  cot_sent_at           timestamptz,
  cot_uid               text,  -- FreeTAKServer COT UID
  cot_stale_at          timestamptz,

  -- Telegram alert state
  telegram_sent_at      timestamptz,
  telegram_message_id   bigint,

  created_at            timestamptz NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tracks_status ON tracks (status);
CREATE INDEX IF NOT EXISTS idx_tracks_first_detected ON tracks (first_detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracks_location ON tracks
  USING gist (ll_to_earth(latitude, longitude));
CREATE INDEX IF NOT EXISTS idx_tracks_confirmed ON tracks (confirmed_at DESC)
  WHERE confirmed_at IS NOT NULL;

-- RLS
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;

-- Anon: can read confirmed tracks (for public C2 dashboard read-only mode)
CREATE POLICY "anon_read_confirmed" ON tracks
  FOR SELECT
  USING (status = 'confirmed' OR status = 'provisional');

-- Service role: full access
CREATE POLICY "service_role_all" ON tracks
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE tracks;

COMMENT ON TABLE tracks IS
  'Confirmed and provisional multi-node threat tracks from TDoA correlation';
COMMENT ON COLUMN tracks.position_error_m IS
  'Estimated 1-sigma position error in meters. INDIGO AirGuard benchmark: ±62m with 3 nodes.';
COMMENT ON COLUMN tracks.tdoa_residual_ms IS
  'RMS residual of TDoA hyperbolic solution in milliseconds. < 2ms = good fit.';
```

---

#### Migration 0009: alerts

```sql
-- 0009_alerts.sql

CREATE TYPE IF NOT EXISTS alert_channel AS ENUM (
  'telegram',
  'cot_freetakserver',
  'sms',          -- W3
  'webhook',      -- W3
  'email'         -- W3
);

CREATE TYPE IF NOT EXISTS alert_status AS ENUM (
  'pending',
  'dispatched',
  'delivered',
  'failed',
  'suppressed'  -- deduplication: same track already alerted
);

CREATE TABLE IF NOT EXISTS alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id        uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  channel         alert_channel NOT NULL,
  status          alert_status NOT NULL DEFAULT 'pending',
  payload         jsonb NOT NULL,   -- channel-specific payload
  error_message   text,
  retry_count     int NOT NULL DEFAULT 0,
  max_retries     int NOT NULL DEFAULT 3,
  first_attempt_at timestamptz,
  last_attempt_at  timestamptz,
  delivered_at     timestamptz,
  external_id      text,  -- Telegram message_id, FreeTAKServer UID, etc.
  created_at       timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_track_id ON alerts (track_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts (status);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_pending ON alerts (created_at)
  WHERE status = 'pending';

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON alerts
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE alerts IS
  'Alert dispatch queue for all channels (Telegram, COT, SMS)';
```

---

#### Migration 0010: node_health_log

```sql
-- 0010_node_health_log.sql

CREATE TABLE IF NOT EXISTS node_health_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id           uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  logged_at         timestamptz NOT NULL DEFAULT NOW(),

  -- Battery
  battery_pct       int NOT NULL CHECK (battery_pct BETWEEN 0 AND 100),
  is_charging       boolean NOT NULL DEFAULT false,

  -- GPS
  gps_accuracy_m    double precision,
  gps_latitude      double precision,
  gps_longitude     double precision,
  gps_fix_type      text,  -- 'none', '2d', '3d', 'dgps'
  gps_satellite_count int,

  -- ML inference health
  last_inference_latency_ms int,
  inference_error_rate_pct  numeric(5,2),
  model_version             text,

  -- RF scanner health
  rf_scan_count_1h  int,
  rf_anomaly_rate_pct numeric(5,2),

  -- Network
  upload_kbps       int,
  nats_connected    boolean NOT NULL DEFAULT false,
  nats_pending_msgs int NOT NULL DEFAULT 0,

  -- Meshtastic (null if no LoRa hardware)
  meshtastic_node_id   text,
  meshtastic_snr       numeric(6,2),
  meshtastic_rssi      int,
  meshtastic_mesh_size int,

  -- App
  app_version       text,
  os_version        text,
  uptime_seconds    bigint
);

-- Partition by month for performance (detection nodes are chatty)
-- Note: Supabase does not support declarative partitioning via CLI at this time.
-- We use a retention trigger instead to cap table growth.

CREATE INDEX IF NOT EXISTS idx_node_health_node_time
  ON node_health_log (node_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_node_health_logged_at
  ON node_health_log (logged_at DESC);

-- Retention: delete rows older than 24h (matches NODE_HEALTH stream max_age)
CREATE OR REPLACE FUNCTION delete_old_node_health()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM node_health_log WHERE logged_at < NOW() - INTERVAL '24 hours';
END;
$$;

-- Call via pg_cron (requires pg_cron extension):
SELECT cron.schedule('delete-old-health', '0 * * * *', 'SELECT delete_old_node_health()');

ALTER TABLE node_health_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON node_health_log
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "node_owner_read" ON node_health_log
  FOR SELECT
  USING (
    node_id IN (
      SELECT id FROM nodes WHERE owner_user_id = auth.uid()
    )
  );

COMMENT ON TABLE node_health_log IS
  'Time-series heartbeat log per sensor node. Retention: 24h. Replaces NATS stream for persistence.';
```

---

#### Migration 0011: lkgc_snapshots

(Full DDL in LKGC_TEMPLATE.md §6.2 — not repeated here to avoid duplication. Apply from:
`supabase/migrations/0011_lkgc_snapshots.sql`)

---

#### Migration 0012: tdoa_events

```sql
-- 0012_tdoa_events.sql
-- Stores raw TDoA correlation attempts (input + output) for debugging and model improvement

CREATE TABLE IF NOT EXISTS tdoa_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id            uuid REFERENCES tracks(id) ON DELETE SET NULL,
  correlated_at       timestamptz NOT NULL DEFAULT NOW(),

  -- Input
  input_event_ids     uuid[] NOT NULL,
  input_node_ids      uuid[] NOT NULL,
  node_positions      jsonb NOT NULL,  -- [{node_id, lat, lon, alt, timestamp_us}]
  correlation_window_ms int NOT NULL DEFAULT 500,

  -- Computation
  tdoa_matrix         jsonb,   -- pairwise time-difference matrix in microseconds
  hyperbolic_solution jsonb,   -- {lat, lon, residual_ms, iterations, converged}
  centroid_fallback   boolean NOT NULL DEFAULT false,
  solver_version      text NOT NULL DEFAULT '1.0',
  computation_ms      int,     -- wall-clock time for solver

  -- Output
  estimated_lat       double precision,
  estimated_lon       double precision,
  error_radius_m      double precision,
  confidence          numeric(4,3) CHECK (confidence BETWEEN 0 AND 1),

  -- Status
  success             boolean NOT NULL DEFAULT false,
  error_reason        text
);

CREATE INDEX IF NOT EXISTS idx_tdoa_events_track ON tdoa_events (track_id);
CREATE INDEX IF NOT EXISTS idx_tdoa_events_correlated ON tdoa_events (correlated_at DESC);

ALTER TABLE tdoa_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON tdoa_events
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE tdoa_events IS
  'Raw TDoA solver input/output log. Used for triangulation accuracy analysis and debugging.';
```

---

#### Migrations 0013–0016 (abbreviated — full SQL in supabase/migrations/)

- **0013_rls_w2_policies.sql**: W2 RLS policies for tracks, alerts, node_health_log. Adds authenticated user read on tracks, node-specific insert on detection_events.
- **0014_edge_function_logs.sql**: Log table for Edge Function invocations, errors, latency. Columns: function_name, invoked_at, duration_ms, status_code, error_message, request_id.
- **0015_alert_subscriptions.sql**: Stores per-user alert subscription preferences. Columns: user_id, channel, region_polygon (PostGIS), threat_classes[], min_confidence, active. Enables per-operator alert routing.
- **0016_meshtastic_bridge_log.sql**: Log of Meshtastic mesh bridge events. Columns: mesh_node_id, gateway_node_id, payload_type, rssi, snr, received_at, forwarded_to_nats, raw_payload.

**Commands to apply all migrations (Day 4–6):**

```bash
# Link project
supabase link --project-ref bymfcnwfyxuivinuzurr

# Apply all pending migrations
supabase db push --project-ref bymfcnwfyxuivinuzurr

# Verify: no schema drift
supabase db diff --project-ref bymfcnwfyxuivinuzurr --linked
# Expected: "No schema changes detected"

# Verify RLS policies
psql "$SUPABASE_DB_URL" -c "
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;"
```

**Acceptance criteria (Phase 2):**
- All 10 migrations applied without error
- `supabase db diff` returns no drift
- RLS test: anon key cannot SELECT tracks — `HTTP 401` or empty rows on RLS-blocked tables
- Realtime: `tracks` table appears in Supabase Realtime inspector
- `lkgc_snapshots` table exists and service_role insert works

**P2 LKGC capture:**
```bash
./scripts/capture-lkgc.sh W2 P2-MIGRATIONS-APPLIED
```

---

## Phase 3: Supabase Edge Functions (Days 7–10)

### Scope

Five Deno-runtime Edge Functions. Each function has: type definitions, input validation,
error handling, unit tests (Vitest), and a `/health` endpoint.

**Directory structure:**
```
supabase/functions/
├── _shared/
│   ├── types.ts          -- shared TypeScript types
│   ├── nats-client.ts    -- NATS.ws browser-compatible client
│   ├── auth.ts           -- JWT validation helper
│   └── cors.ts           -- CORS headers
├── register-node/
│   └── index.ts
├── ingest-event/
│   └── index.ts
├── node-health/
│   └── index.ts
├── alert-router/
│   └── index.ts
└── tdoa-correlate/
    └── index.ts
```

---

### Function 1: register-node

Registers a new sensor node or updates an existing one. Called by mobile app on first
launch and on each app start.

```
POST /functions/v1/register-node
Auth: Bearer <SUPABASE_ANON_KEY>  (unauthenticated devices use anon key)

Request body:
{
  "device_id": "android-uuid-v4",            // stable device identifier
  "device_model": "Samsung Galaxy S22",
  "os_version": "Android 14",
  "app_version": "0.2.0",
  "lat": 44.4268,
  "lon": 26.1025,
  "meshtastic_node_id": "!a3b2c1d0" | null,  // null if no Meshtastic hardware
  "capabilities": ["acoustic", "rf", "gps"]
}

Response 200:
{
  "node_id": "uuid",
  "registered": true,
  "nats_creds": "...",    // NATS NKey credentials for this node (base64 encoded)
  "config": {
    "detection_interval_ms": 975,
    "upload_batch_size": 10,
    "health_interval_ms": 30000
  }
}

Response 400: { "error": "device_id required" }
Response 500: { "error": "registration failed", "details": "..." }
```

Implementation pseudocode (`supabase/functions/register-node/index.ts`):

```typescript
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { validateRegistrationPayload } from "../_shared/validation.ts"

serve(async (req: Request) => {
  // 1. CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  // 2. Health check
  if (req.url.endsWith("/health")) {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }

  try {
    // 3. Parse + validate
    const body = await req.json()
    const { device_id, device_model, os_version, app_version,
            lat, lon, meshtastic_node_id, capabilities } = validateRegistrationPayload(body)

    // 4. Supabase upsert (service_role key — Edge Function env var)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_KEY")!
    )

    const { data: node, error } = await supabase
      .from("nodes")
      .upsert({
        device_id,
        device_model,
        os_version,
        app_version,
        latitude: lat,
        longitude: lon,
        meshtastic_node_id: meshtastic_node_id ?? null,
        capabilities,
        last_seen_at: new Date().toISOString(),
        registered_at: new Date().toISOString()  // only set on INSERT, not UPDATE
      }, {
        onConflict: "device_id",
        ignoreDuplicates: false
      })
      .select("id")
      .single()

    if (error) throw error

    // 5. Generate per-node NATS NKey credentials
    // In production: call internal NATS account server API
    // In W2: use a pre-generated credentials file per node_id
    const natsCreds = await generateNodeNatsCreds(node.id)

    // 6. Return node config
    return new Response(JSON.stringify({
      node_id: node.id,
      registered: true,
      nats_creds: natsCreds,
      config: {
        detection_interval_ms: 975,
        upload_batch_size: 10,
        health_interval_ms: 30000,
        nats_url: "nats://nats1.apex-sentinel.internal:4222"
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  } catch (err) {
    console.error("register-node error:", err)
    return new Response(JSON.stringify({ error: "registration failed", details: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})
```

---

### Function 2: ingest-event

Receives detection events from mobile nodes, validates them, inserts into
`detection_events`, and publishes to NATS DETECTIONS stream.

```
POST /functions/v1/ingest-event
Auth: Bearer <SUPABASE_ANON_KEY>

Request body:
{
  "node_id": "uuid",
  "detection_type": "acoustic" | "rf" | "fused",
  "confidence": 0.0–1.0,
  "detected_at": "2026-03-27T14:30:00.123Z",
  "lat": 44.4268,
  "lon": 26.1025,
  "accuracy_m": 12.5,
  "model_version": "yamnet_drone_sentinel_v1",
  "inference_latency_ms": 156,
  "acoustic_payload": {                     // null if detection_type == "rf"
    "confidence": 0.91,
    "predicted_class": "drone",
    "spectral_centroid_hz": 380.5,
    "band_energy_100_600": 0.72
  },
  "rf_payload": {                           // null if detection_type == "acoustic"
    "anomaly_score": 0.88,
    "peak_rssi_dbm": -42,
    "affected_channels": [1, 6, 11],
    "beacon_entropy": 3.2
  }
}

Response 202: { "event_id": "uuid", "accepted": true }
Response 400: { "error": "invalid payload", "details": "..." }
Response 404: { "error": "node not found" }
```

Key implementation details:
- Verify `node_id` exists in `nodes` table. Return 404 if not registered.
- Update `nodes.last_seen_at` on every ingest call.
- Insert into `detection_events` using service_role key (bypasses RLS).
- Publish to NATS: `sentinel.detections.{node_id}` with the full event JSON as payload.
  NATS publish is fire-and-forget — do not fail the HTTP response if NATS is unavailable.
- Deduplicate: if identical (node_id + detected_at) already in table, return 202 with
  existing event_id (idempotent — mobile may retry on network failure).

---

### Function 3: node-health

Receives heartbeats from sensor nodes. Lightweight — called every 30 seconds.

```
POST /functions/v1/node-health
Auth: Bearer <SUPABASE_ANON_KEY>

Request body: { "node_id": "uuid", "battery_pct": 84, "gps_accuracy_m": 8.5,
               "lat": 44.4268, "lon": 26.1025, "nats_connected": true,
               "last_inference_latency_ms": 156, ... }

Response 200: { "ok": true, "server_time": "2026-03-27T14:30:00Z" }
```

Key implementation details:
- Upsert `nodes.last_seen_at`, `latitude`, `longitude`, `battery_pct`.
- Insert into `node_health_log`.
- Publish to NATS: `sentinel.health.{node_id}`.
- Must respond in < 200ms — no heavy computation.

---

### Function 4: alert-router

Consumes confirmed tracks from `tracks` table (via Supabase Realtime trigger or
direct call from TDoA service). Dispatches alerts to Telegram and FreeTAKServer.

```
POST /functions/v1/alert-router
Auth: Bearer <SUPABASE_SERVICE_KEY>  (internal — not called by mobile nodes)

Request body:
{
  "track_id": "uuid",
  "trigger": "new_track" | "track_updated" | "status_change"
}

Response 200: { "dispatched": ["telegram", "cot"], "suppressed": [] }
```

Key implementation details:
- Load track from `tracks` table including position, threat_class, node_count.
- Check `alert_subscriptions` for matching operators in the track's geographic region.
- Telegram dispatch:
  ```
  🚨 APEX SENTINEL ALERT
  Track: TRK-000042
  Class: FPV Drone
  Position: 44.4268°N, 26.1025°E
  Accuracy: ±62m
  Nodes: 4 (confirmed TDoA)
  Time: 14:30:00 UTC
  ```
- COT dispatch: construct `<event>` XML with type `a-u-A`, publish to
  `sentinel.cot.{track_id}` in NATS, which the COT relay service picks up.
- Insert into `alerts` table for audit trail.
- Deduplication: if `alerts` already has `(track_id, channel, status=dispatched)`,
  skip and mark as `suppressed`.

---

### Function 5: tdoa-correlate

Called by the TDoA correlation service (not directly by mobile nodes) when a
candidate correlation set is ready for triangulation. Runs the hyperbolic solver
and updates the `tracks` and `tdoa_events` tables.

```
POST /functions/v1/tdoa-correlate
Auth: Bearer <SUPABASE_SERVICE_KEY>

Request body:
{
  "event_ids": ["uuid1", "uuid2", "uuid3"],
  "node_positions": [
    { "node_id": "uuid1", "lat": 44.426, "lon": 26.102, "timestamp_us": 1711542600000000 },
    { "node_id": "uuid2", "lat": 44.431, "lon": 26.115, "timestamp_us": 1711542600187000 },
    { "node_id": "uuid3", "lat": 44.419, "lon": 26.098, "timestamp_us": 1711542600423000 }
  ],
  "correlation_window_ms": 500
}

Response 200:
{
  "track_id": "uuid",
  "estimated_lat": 44.4245,
  "estimated_lon": 26.108,
  "error_radius_m": 58.3,
  "confidence": 0.91,
  "method": "tdoa",
  "tdoa_residual_ms": 1.2,
  "converged": true
}

Response 400: { "error": "insufficient nodes", "min_required": 3, "provided": 2 }
```

**Commands to deploy all functions (Day 9–10):**

```bash
supabase functions deploy register-node \
  --project-ref bymfcnwfyxuivinuzurr
supabase functions deploy ingest-event \
  --project-ref bymfcnwfyxuivinuzurr
supabase functions deploy node-health \
  --project-ref bymfcnwfyxuivinuzurr
supabase functions deploy alert-router \
  --project-ref bymfcnwfyxuivinuzurr
supabase functions deploy tdoa-correlate \
  --project-ref bymfcnwfyxuivinuzurr

# Verify all deployed
supabase functions list --project-ref bymfcnwfyxuivinuzurr

# Health check all
for fn in register-node ingest-event node-health alert-router tdoa-correlate; do
  echo -n "$fn: "
  curl -sf "https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/${fn}/health" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
    | jq -r '.status'
done
```

**Acceptance criteria (Phase 3):**
- All 5 functions return `{"status":"ok"}` on `/health`
- `register-node`: upserts node, returns node_id
- `ingest-event`: inserts detection_event, returns event_id, publishes to NATS
- `node-health`: updates node.last_seen_at, inserts health log row
- `alert-router`: dispatches test Telegram message, returns dispatched=['telegram']
- `tdoa-correlate`: returns correct lat/lon for known test triangle (validated against
  reference solution in `tests/fixtures/tdoa/reference-triangles.json`)

**P3 LKGC capture:**
```bash
./scripts/capture-lkgc.sh W2 P3-EDGE-FUNCTIONS-DEPLOYED
```

---

## Phase 4: TDoA Correlation Service (Days 11–14)

### Scope

Node.js microservice that:
1. Subscribes to NATS DETECTIONS stream (pull consumer, `tdoa-correlation-group`)
2. Maintains a 500ms sliding time window
3. Groups events by coincident time window
4. When ≥ 3 nodes in window: runs TdoaSolver (W1 solver reused)
5. When < 3 nodes: falls back to centroid
6. Publishes confirmed tracks to NATS ALERTS stream
7. Calls `tdoa-correlate` Edge Function to persist track

### Directory Structure

```
services/tdoa-correlation/
├── src/
│   ├── index.ts              -- entry point, NATS consumer loop
│   ├── correlator.ts         -- sliding window + grouping logic
│   ├── tdoa-solver.ts        -- W1 TdoaSolver adapted for Node.js
│   ├── centroid.ts           -- centroid fallback calculation
│   ├── track-publisher.ts    -- publishes confirmed tracks to ALERTS stream
│   ├── supabase-client.ts    -- Supabase client for track persistence
│   ├── nats-client.ts        -- NATS connection + consumer management
│   └── types.ts              -- shared types
├── tests/
│   ├── correlator.test.ts
│   ├── tdoa-solver.test.ts
│   ├── centroid.test.ts
│   ├── track-publisher.test.ts
│   └── fixtures/
│       ├── detection-events.json    -- 20 synthetic detection events
│       └── reference-triangles.json -- 5 known triangles with expected solutions
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### TDoA Correlation Algorithm

```typescript
// correlator.ts — sliding window event correlation

interface DetectionWindow {
  windowStartUs: bigint
  windowEndUs: bigint
  events: DetectionEvent[]
}

const WINDOW_MS = 500
const WINDOW_US = BigInt(WINDOW_MS * 1000)

class SlidingWindowCorrelator {
  private pendingEvents: Map<string, DetectionEvent[]> = new Map()
  private processingTimer: NodeJS.Timeout | null = null

  // Called on each NATS message
  async onDetectionEvent(event: DetectionEvent): Promise<void> {
    const windowKey = this.getWindowKey(event.detected_at_us)
    const existing = this.pendingEvents.get(windowKey) ?? []
    existing.push(event)
    this.pendingEvents.set(windowKey, existing)

    // Schedule window flush (fires WINDOW_MS after first event in window)
    if (existing.length === 1) {
      setTimeout(() => this.flushWindow(windowKey), WINDOW_MS + 50)
      // +50ms grace period for late arrivals (network jitter compensation)
    }
  }

  private getWindowKey(timestampUs: bigint): string {
    // Round down to WINDOW_US boundary
    const windowId = timestampUs / WINDOW_US
    return windowId.toString()
  }

  private async flushWindow(windowKey: string): Promise<void> {
    const events = this.pendingEvents.get(windowKey)
    if (!events || events.length === 0) return
    this.pendingEvents.delete(windowKey)

    // Deduplicate by node_id (take highest confidence per node)
    const byNode = new Map<string, DetectionEvent>()
    for (const evt of events) {
      const existing = byNode.get(evt.node_id)
      if (!existing || evt.confidence > existing.confidence) {
        byNode.set(evt.node_id, evt)
      }
    }
    const uniqueNodeEvents = Array.from(byNode.values())

    if (uniqueNodeEvents.length >= 3) {
      // Full TDoA triangulation
      await this.runTdoa(uniqueNodeEvents)
    } else if (uniqueNodeEvents.length >= 2) {
      // Centroid fallback (no triangulation confidence)
      await this.runCentroid(uniqueNodeEvents, 'insufficient_nodes')
    } else {
      // Single node — record provisional, do not create track
      console.log(`Single-node detection: node=${uniqueNodeEvents[0]?.node_id} — no track`)
    }
  }

  private async runTdoa(events: DetectionEvent[]): Promise<void> {
    const nodePositions = events.map(e => ({
      node_id: e.node_id,
      lat: e.node_lat,
      lon: e.node_lon,
      timestamp_us: e.detected_at_us
    }))

    try {
      const solution = await TdoaSolver.solve({
        nodes: nodePositions,
        speedOfSoundMs: 343,
        maxIterations: 100,
        convergenceThresholdM: 1.0
      })

      if (solution.converged && solution.residual_ms < 5.0) {
        await this.publishTrack({
          method: 'tdoa',
          lat: solution.lat,
          lon: solution.lon,
          error_radius_m: solution.error_radius_m,
          confidence: solution.confidence,
          events,
          tdoa_residual_ms: solution.residual_ms
        })
      } else {
        // TDoA did not converge — fall back to centroid
        await this.runCentroid(events, 'tdoa_no_converge')
      }
    } catch (err) {
      console.error('TdoaSolver error:', err)
      await this.runCentroid(events, 'tdoa_error')
    }
  }

  private async runCentroid(events: DetectionEvent[], reason: string): Promise<void> {
    const lats = events.map(e => e.node_lat)
    const lons = events.map(e => e.node_lon)
    const centroidLat = lats.reduce((a, b) => a + b, 0) / lats.length
    const centroidLon = lons.reduce((a, b) => a + b, 0) / lons.length
    const spreadM = haversineSpread(lats, lons)

    await this.publishTrack({
      method: 'centroid',
      lat: centroidLat,
      lon: centroidLon,
      error_radius_m: spreadM * 0.5,  // crude estimate
      confidence: 0.4,
      events,
      fallback_reason: reason
    })
  }

  private async publishTrack(track: TrackResult): Promise<void> {
    const message = JSON.stringify({
      ...track,
      track_id: crypto.randomUUID(),
      generated_at: new Date().toISOString()
    })

    // Publish to NATS ALERTS stream
    await natsClient.publish(
      `sentinel.alerts.track.${track.track_id}`,
      new TextEncoder().encode(message)
    )

    // Persist via Edge Function
    await supabaseClient.functions.invoke('tdoa-correlate', {
      body: {
        event_ids: track.events.map(e => e.id),
        node_positions: track.events.map(e => ({
          node_id: e.node_id,
          lat: e.node_lat,
          lon: e.node_lon,
          timestamp_us: e.detected_at_us
        })),
        correlation_window_ms: WINDOW_MS
      }
    })
  }
}
```

### TdoaSolver (adapted from W1)

W1's `TdoaSolver` was written for Android Kotlin. For the Node.js service, it is
re-implemented in TypeScript using the same algorithm: Gauss-Newton iterative solver
for hyperbolic equations.

```typescript
// tdoa-solver.ts — hyperbolic TDoA solver

import { haversineDistance } from './geo.ts'

interface SolverInput {
  nodes: Array<{ node_id: string; lat: number; lon: number; timestamp_us: bigint }>
  speedOfSoundMs: number         // meters/second, default 343
  maxIterations: number          // default 100
  convergenceThresholdM: number  // default 1.0 meter
}

interface SolverOutput {
  lat: number
  lon: number
  error_radius_m: number
  confidence: number
  residual_ms: number
  iterations: number
  converged: boolean
}

export class TdoaSolver {
  static solve(input: SolverInput): SolverOutput {
    const { nodes, speedOfSoundMs, maxIterations, convergenceThresholdM } = input

    // Step 1: compute TDOA matrix (pairwise time differences in microseconds)
    // Reference node = nodes[0]
    const ref = nodes[0]
    const tdoas = nodes.slice(1).map(n => ({
      node: n,
      delta_us: Number(n.timestamp_us - ref.timestamp_us)
    }))

    // Step 2: convert TDOA to distance differences
    // d_i - d_ref = c * delta_t_i   (c = speed of sound in m/us)
    const c = speedOfSoundMs / 1_000_000  // m/us

    // Step 3: Gauss-Newton iteration
    // Initial estimate: centroid of node positions
    let estLat = nodes.reduce((s, n) => s + n.lat, 0) / nodes.length
    let estLon = nodes.reduce((s, n) => s + n.lon, 0) / nodes.length

    let prevDelta = Infinity
    let iterations = 0
    let converged = false

    for (let i = 0; i < maxIterations; i++) {
      iterations = i + 1

      // Compute residuals and Jacobian
      const residuals: number[] = []
      const jacobian: number[][] = []

      for (const { node, delta_us } of tdoas) {
        const distRef = haversineDistance(estLat, estLon, ref.lat, ref.lon)
        const distNode = haversineDistance(estLat, estLon, node.lat, node.lon)
        const predicted_delta_us = (distNode - distRef) / c

        residuals.push(delta_us - predicted_delta_us)

        // Partial derivatives (numerical — step 1e-7 degrees)
        const eps = 1e-7
        const dDistRefDLat = (haversineDistance(estLat + eps, estLon, ref.lat, ref.lon) - distRef) / eps
        const dDistRefDLon = (haversineDistance(estLat, estLon + eps, ref.lat, ref.lon) - distRef) / eps
        const dDistNodeDLat = (haversineDistance(estLat + eps, estLon, node.lat, node.lon) - distNode) / eps
        const dDistNodeDLon = (haversineDistance(estLat, estLon + eps, node.lat, node.lon) - distNode) / eps

        jacobian.push([
          (dDistNodeDLat - dDistRefDLat) / c,
          (dDistNodeDLon - dDistRefDLon) / c
        ])
      }

      // Least-squares update: delta = (J^T J)^-1 J^T r
      const [dLat, dLon] = leastSquaresStep(jacobian, residuals)
      estLat += dLat
      estLon += dLon

      const deltaM = haversineDistance(estLat, estLon, estLat - dLat, estLon - dLon)
      if (deltaM < convergenceThresholdM) {
        converged = true
        break
      }
    }

    // Compute RMS residual
    const rmsResidualUs = Math.sqrt(
      tdoas.reduce((sum, { node, delta_us }) => {
        const dist_ref = haversineDistance(estLat, estLon, ref.lat, ref.lon)
        const dist_node = haversineDistance(estLat, estLon, node.lat, node.lon)
        const predicted_us = (dist_node - dist_ref) / c
        return sum + Math.pow(delta_us - predicted_us, 2)
      }, 0) / tdoas.length
    )
    const residual_ms = rmsResidualUs / 1000

    // Error radius estimate (based on node geometry and residual)
    const gdop = computeGDOP(nodes, estLat, estLon)
    const error_radius_m = gdop * speedOfSoundMs * (residual_ms / 1000)

    // Confidence: inverse of normalized residual (capped at 1.0)
    const confidence = Math.min(1.0, Math.max(0.0, 1.0 - (residual_ms / 10.0)))

    return { lat: estLat, lon: estLon, error_radius_m, confidence, residual_ms, iterations, converged }
  }
}
```

### NATS Consumer Main Loop

```typescript
// index.ts — TDoA correlation service entry point

import { connect, StringCodec, AckPolicy, DeliverPolicy } from "nats"
import { SlidingWindowCorrelator } from "./correlator.ts"
import { createNodeClient } from "./nats-client.ts"

const NATS_URL = process.env.NATS_URL!
const CONSUMER_NAME = "tdoa-correlation-group"
const STREAM_NAME = "DETECTIONS"
const MAX_MSG_BATCH = 50
const FETCH_TIMEOUT_MS = 1000

async function main() {
  console.log(`[tdoa-correlation] Starting — NATS: ${NATS_URL}`)
  const nc = await connect({ servers: NATS_URL })
  const js = nc.jetstream()
  const correlator = new SlidingWindowCorrelator()

  // Get or create durable pull consumer
  const jsm = await nc.jetstreamManager()
  try {
    await jsm.consumers.info(STREAM_NAME, CONSUMER_NAME)
    console.log(`[tdoa-correlation] Consumer ${CONSUMER_NAME} exists`)
  } catch {
    await jsm.consumers.add(STREAM_NAME, {
      durable_name: CONSUMER_NAME,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.New,
      max_deliver: 3,
      ack_wait: 30_000_000_000
    })
    console.log(`[tdoa-correlation] Consumer ${CONSUMER_NAME} created`)
  }

  const consumer = await js.consumers.get(STREAM_NAME, CONSUMER_NAME)

  // Pull loop — fetch batches, process, ack
  while (true) {
    try {
      const messages = await consumer.fetch({ max_messages: MAX_MSG_BATCH, expires: FETCH_TIMEOUT_MS })
      for await (const msg of messages) {
        try {
          const event = JSON.parse(new TextDecoder().decode(msg.data))
          await correlator.onDetectionEvent(event)
          msg.ack()
        } catch (err) {
          console.error('[tdoa-correlation] Message processing error:', err)
          msg.nak()
        }
      }
    } catch (err) {
      if (err.code !== 'TIMEOUT') {
        console.error('[tdoa-correlation] Fetch error:', err)
        await new Promise(r => setTimeout(r, 5000))  // back off 5s on error
      }
    }
  }
}

main().catch(err => {
  console.error('[tdoa-correlation] Fatal error:', err)
  process.exit(1)
})
```

**Systemd unit file** (`infra/systemd/apex-tdoa-correlation.service`):

```ini
[Unit]
Description=APEX-SENTINEL TDoA Correlation Service
After=network.target
Requires=network.target

[Service]
Type=simple
User=apex-sentinel
WorkingDirectory=/opt/apex-sentinel/services/tdoa-correlation
EnvironmentFile=/etc/apex-sentinel/env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=apex-tdoa

# Watchdog: restart if service hangs
WatchdogSec=120

[Install]
WantedBy=multi-user.target
```

**Commands to run (Days 11–14):**

```bash
# Install dependencies
cd services/tdoa-correlation
npm ci

# Run TDD red phase first
npx vitest run tests/  # all tests should FAIL (not yet implemented)

# Implement, then:
npx vitest run --coverage
# Target: 0 failures, ≥80% coverage

# Build
npm run build

# Start service
sudo systemctl enable apex-tdoa-correlation
sudo systemctl start apex-tdoa-correlation
sudo systemctl status apex-tdoa-correlation

# Verify NATS consumer active
nats consumer info DETECTIONS tdoa-correlation-group
```

**Acceptance criteria (Phase 4):**
- `systemctl status apex-tdoa-correlation` shows `active (running)`
- NATS consumer `tdoa-correlation-group`: lag = 0 (consuming in real-time)
- TDoA accuracy test: 5 reference triangles all within ±62m of known solution
- Centroid fallback activates when < 3 nodes (verified by test)
- Correlation window test: events within 500ms grouped, events 501ms apart NOT grouped
- Service survives NATS disconnect: reconnects within 15 seconds
- Unit tests: ≥ 60 tests, 0 failures, ≥80% coverage

**P4 LKGC capture:**
```bash
./scripts/capture-lkgc.sh W2 P4-TDOA-SERVICE-RUNNING
```

---

## Phase 5: Alert Routing (Days 15–17)

### Scope

Wire the alert dispatch pipeline: confirmed tracks → Telegram bot → operator notification.
Confirmed tracks → NATS COT_EVENTS → FreeTAKServer relay → ATAK clients.

### P5.1 — Telegram Alert Bot

**Files to create:**
- `services/alert-bot/src/index.ts`
- `services/alert-bot/src/telegram-client.ts`
- `services/alert-bot/src/cot-builder.ts`
- `services/alert-bot/src/nats-consumer.ts`
- `infra/systemd/apex-alert-bot.service`

The alert bot subscribes to `sentinel.alerts.>` on NATS ALERTS stream.

Telegram message format:
```
🚨 APEX SENTINEL — THREAT DETECTED

Track ID:    TRK-000042
Class:       FPV Drone (confidence: 91%)
Status:      Confirmed (TDoA)
Position:    44.4268°N, 26.1025°E
Accuracy:    ±62m
Node count:  4 nodes correlated
Time (UTC):  2026-03-27 14:30:00

[View on map] https://sentinel.apexos.io/tracks/uuid

RMS residual: 1.2ms | Solver: Gauss-Newton (42 iterations)
```

Message is sent to `TELEGRAM_ALERT_CHAT_ID` using Telegram Bot API:
```
POST https://api.telegram.org/bot{TOKEN}/sendMessage
{
  "chat_id": "{TELEGRAM_ALERT_CHAT_ID}",
  "text": "...",
  "parse_mode": "HTML",
  "disable_notification": false
}
```

After dispatch: update `alerts.status = 'dispatched'`, `alerts.external_id = message_id`,
`tracks.telegram_sent_at`, `tracks.telegram_message_id`.

### P5.2 — FreeTAKServer COT Relay

The COT relay service subscribes to `sentinel.cot.>` on NATS and forwards as TCP COT XML
to FreeTAKServer on port 8087.

COT XML for drone threat track:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<event version="2.0"
       uid="apex-sentinel-TRK-000042"
       type="a-u-A-M-F-Q"
       time="2026-03-27T14:30:00.000Z"
       start="2026-03-27T14:30:00.000Z"
       stale="2026-03-27T14:35:00.000Z"
       how="m-g">
  <point lat="44.4268" lon="26.1025" hae="9999999.0"
         ce="62.0" le="9999999.0"/>
  <detail>
    <remarks>
      APEX-SENTINEL TRK-000042 | FPV Drone | Confidence: 91% |
      4 nodes (TDoA) | Accuracy: ±62m
    </remarks>
    <contact callsign="APEX-TRK-000042"/>
    <__group name="APEX Sentinel" role="Team Member"/>
    <status readiness="true"/>
    <uid Droid="APEX-TRK-000042"/>
    <apex_sentinel>
      <track_id>uuid</track_id>
      <threat_class>fpv_drone</threat_class>
      <node_count>4</node_count>
      <tdoa_residual_ms>1.2</tdoa_residual_ms>
    </apex_sentinel>
  </detail>
</event>
```

COT event type codes:
- FPV drone: `a-u-A-M-F-Q` (unknown air, military-type, fixed-wing/quad)
- Shahed-class: `a-u-A-C-F` (unknown air, civilian, fixed-wing)
- Unknown UAS: `a-u-A` (unknown air)

**Acceptance criteria (Phase 5):**
- Telegram: inject test track → Telegram message received within 5 seconds
- Telegram: duplicate track (same track_id) does NOT generate second message
- COT: inject test track → COT XML sent to FreeTAKServer
- COT: FreeTAKServer REST API confirms COT received: `GET /api/v1/data/TRK-000042`
- `alerts` table: all dispatched alerts recorded with `status = 'dispatched'`
- Failed dispatch (network error): `retry_count` incremented, `status = 'failed'` after max_retries

**P5 LKGC capture:**
```bash
./scripts/capture-lkgc.sh W2 P5-ALERT-ROUTING-LIVE
```

---

## Phase 6: Meshtastic Bridge + Integration Testing (Days 18–21)

### P6.1 — Meshtastic Serial Bridge

Parses Meshtastic serial protocol and forwards mesh detection events into NATS.

**Serial protocol:**

Meshtastic communicates over serial (USB or UART) using protobuf-encoded frames. Each
frame is prefixed with a 4-byte magic header `0x94 0xC3 0x00 len`.

```typescript
// meshtastic-bridge/src/serial-parser.ts

import { SerialPort } from 'serialport'
import { Protobuf } from '@meshtastic/protobufs'

const MAGIC = Buffer.from([0x94, 0xC3])

class MeshtasticSerialParser {
  private port: SerialPort
  private buffer: Buffer = Buffer.alloc(0)

  constructor(portPath: string, baudRate: number) {
    this.port = new SerialPort({ path: portPath, baudRate, autoOpen: false })
    this.port.on('data', (data: Buffer) => this.onData(data))
  }

  private onData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data])
    this.processBuffer()
  }

  private processBuffer(): void {
    while (this.buffer.length >= 4) {
      // Find magic header
      const magicIdx = this.buffer.indexOf(MAGIC)
      if (magicIdx === -1) { this.buffer = Buffer.alloc(0); return }
      if (magicIdx > 0) { this.buffer = this.buffer.slice(magicIdx) }
      if (this.buffer.length < 4) return

      const packetLen = (this.buffer[2] << 8) | this.buffer[3]
      if (this.buffer.length < 4 + packetLen) return  // wait for more data

      const packetBytes = this.buffer.slice(4, 4 + packetLen)
      this.buffer = this.buffer.slice(4 + packetLen)

      try {
        const meshPacket = Protobuf.Mesh.MeshPacket.fromBinary(packetBytes)
        this.onMeshPacket(meshPacket)
      } catch (err) {
        // Malformed packet — skip
        console.debug('[mesh-bridge] Bad packet, skipping:', err.message)
      }
    }
  }

  private async onMeshPacket(packet: Protobuf.Mesh.MeshPacket): Promise<void> {
    // Only process APEX-SENTINEL custom payload (portnum = 256 = PRIVATE_APP)
    if (packet.decoded?.portnum !== 256) return

    const payload = JSON.parse(new TextDecoder().decode(packet.decoded.payload))

    // Validate: must contain apex-sentinel detection event schema
    if (!payload.detection_type || !payload.confidence || !payload.lat) return

    // Construct detection event
    const event = {
      node_id: payload.node_id,
      detection_type: payload.detection_type,
      confidence: payload.confidence,
      detected_at: payload.detected_at,
      lat: payload.lat,
      lon: payload.lon,
      accuracy_m: payload.accuracy_m,
      source: 'meshtastic',
      mesh_node_id: `!${packet.from.toString(16).padStart(8, '0')}`,
      mesh_snr: packet.rxSnr,
      mesh_rssi: packet.rxRssi
    }

    // Forward to NATS DETECTIONS stream
    await natsClient.publish(
      `sentinel.detections.${event.node_id}`,
      new TextEncoder().encode(JSON.stringify(event))
    )

    // Log to meshtastic_bridge_log
    await supabase.from('meshtastic_bridge_log').insert({
      mesh_node_id: event.mesh_node_id,
      gateway_node_id: localNodeId,
      payload_type: 'detection_event',
      rssi: event.mesh_rssi,
      snr: event.mesh_snr,
      received_at: new Date().toISOString(),
      forwarded_to_nats: true,
      raw_payload: packet.decoded.payload
    })
  }
}
```

### P6.2 — End-to-End Integration Tests

**Test file:** `tests/integration/e2e-pipeline.test.ts`

```typescript
describe('FR-W2-01: End-to-End Detection Pipeline', () => {
  it('mobile node → NATS DETECTIONS → TDoA → confirmed track → Telegram alert', async () => {
    // 1. Simulate 3 mobile nodes publishing detection events
    const events = loadFixture('detection-events.json').slice(0, 3)
    for (const event of events) {
      await nats.publish(`sentinel.detections.${event.node_id}`, encode(event))
    }

    // 2. Wait for TDoA correlation (max 2s)
    const track = await waitForTrack({ timeout: 2000 })
    expect(track).toBeDefined()
    expect(track.status).toBe('confirmed')
    expect(track.node_count).toBeGreaterThanOrEqual(3)

    // 3. Verify position accuracy (reference solution known)
    const refLat = 44.4245, refLon = 26.108
    const distanceM = haversineDistance(track.latitude, track.longitude, refLat, refLon)
    expect(distanceM).toBeLessThan(100)  // within 100m of reference

    // 4. Verify Telegram alert dispatched
    const alert = await supabase.from('alerts')
      .select('*').eq('track_id', track.id).eq('channel', 'telegram').single()
    expect(alert.data.status).toBe('dispatched')
  }, 10_000)
})
```

**Commands to run (Days 18–21):**

```bash
# Run all integration tests
cd services/tdoa-correlation
npx vitest run tests/integration/ --timeout=30000

# Run E2E tests
npx playwright test tests/e2e/

# Final coverage report
npx vitest run --coverage

# All must pass before P6 LKGC capture
./scripts/capture-lkgc.sh W2 P6-INTEGRATION-COMPLETE

# Final W2 wave:complete capture
./scripts/capture-lkgc.sh W2 W2-WAVE-COMPLETE
./wave-formation.sh complete W2
```

**Acceptance criteria (Phase 6):**
- All unit tests: 0 failures, ≥80% coverage
- All integration tests: 0 failures
- E2E pipeline: mobile → NATS → TDoA → track → Telegram in < 3 seconds
- Meshtastic bridge: at least 1 round-trip test message forwarded to NATS
- `wave-formation.sh complete W2` succeeds (all gate checks pass)
- LKGC `LKGC-W2-WAVE-COMPLETE` tagged and pushed

---

## Test Count Targets

| Suite                        | Test Count | Coverage Target |
|------------------------------|-----------|-----------------|
| TDoA solver unit tests       | ≥ 20      | 95%             |
| Correlator unit tests        | ≥ 25      | 90%             |
| Edge Function unit tests     | ≥ 40      | 85%             |
| NATS client unit tests       | ≥ 15      | 80%             |
| Alert bot unit tests         | ≥ 20      | 80%             |
| Meshtastic bridge unit tests | ≥ 15      | 80%             |
| Integration tests            | ≥ 25      | n/a             |
| E2E (Playwright)             | ≥ 10      | n/a             |
| Android W2 mesh additions    | ≥ 30      | 80%             |
| **TOTAL**                    | **≥ 200** | **≥ 80%**       |

---

*Document owner: Nicolae Fratila | Created: 2026-03-24 | Wave: W2*
*TDD is non-negotiable. RED first. No code before failing tests.*
