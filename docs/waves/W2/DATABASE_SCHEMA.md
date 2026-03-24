# APEX-SENTINEL — Database Schema
## W2 | PROJECTAPEX Doc 04/21 | 2026-03-24

---

## 1. Schema Overview

All tables reside in the `public` schema of Supabase project `bymfcnwfyxuivinuzurr` (eu-west-2, London). PostgreSQL 15.x with extensions: `postgis`, `pg_cron`, `pgcrypto`, `uuid-ossp`, `pg_trgm`.

Migration naming convention: `YYYYMMDDHHMMSS_descriptive_name.sql`

### 1.1 Table Inventory

```
nodes                — registered detection nodes (fleet registry)
node_heartbeats      — periodic heartbeat records from each node
detection_events     — Gate 3 detection events, one row per event
tracks               — drone tracks (multi-event, TDoA-correlated)
alerts               — dispatched alerts with dispatch status
operator_audit_log   — append-only audit trail for all operator actions
```

---

## 2. Extensions and Setup

```sql
-- Migration: 20260324000000_extensions_setup.sql

-- PostGIS for geographic types and spatial indexes
CREATE EXTENSION IF NOT EXISTS postgis;

-- pg_cron for retention jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- pgcrypto for gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- uuid-ossp for uuid_generate_v4
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pg_trgm for trigram text search on threat_class
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Custom ULID generation function
CREATE OR REPLACE FUNCTION generate_ulid() RETURNS TEXT AS $$
DECLARE
  timestamp  BYTEA = E'\\000\\000\\000\\000\\000\\000';
  output     TEXT = '';
  unix_time  BIGINT;
  ulid_chars TEXT = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  random_bytes BYTEA;
  idx        INT;
  i          INT;
BEGIN
  unix_time = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
  FOR i IN REVERSE 5..0 LOOP
    timestamp = SET_BYTE(timestamp, i, unix_time % 256);
    unix_time = unix_time >> 8;
  END LOOP;
  FOR i IN 0..5 LOOP
    idx = GET_BYTE(timestamp, i);
    output = output || SUBSTR(ulid_chars, (idx >> 3) + 1, 1);
    output = output || SUBSTR(ulid_chars, ((idx & 7) << 2) | ((CASE WHEN i < 5 THEN GET_BYTE(timestamp, i+1) ELSE 0 END) >> 6) + 1, 1);
  END LOOP;
  random_bytes = gen_random_bytes(10);
  FOR i IN 0..9 LOOP
    idx = GET_BYTE(random_bytes, i);
    output = output || SUBSTR(ulid_chars, (idx >> 3 & 31) + 1, 1);
    output = output || SUBSTR(ulid_chars, (idx & 7) + 1, 1);
  END LOOP;
  RETURN output;
END;
$$ LANGUAGE plpgsql;
```

---

## 3. Table: nodes

```sql
-- Migration: 20260324000100_create_nodes.sql

CREATE TABLE public.nodes (
  -- Primary identifier
  node_id               TEXT        PRIMARY KEY
                                    CHECK (node_id ~ '^nde_[0-9A-Z]{26}$'),

  -- Node tier (1=GPS-PPS, 2=SDR, 3=Embedded, 4=Smartphone/BLE/LoRa)
  tier                  SMALLINT    NOT NULL
                                    CHECK (tier BETWEEN 1 AND 4),

  -- Capabilities available on this node
  -- Array values: 'yamnet', 'sdr_rf', 'gps_pps', 'mesh_relay', 'ble_relay', 'lora_relay'
  capabilities          JSONB       NOT NULL
                                    DEFAULT '[]'::JSONB
                                    CHECK (jsonb_typeof(capabilities) = 'array'),

  -- Geographic position (coarsened to ±111m = 3 decimal places)
  lat                   DOUBLE PRECISION NOT NULL
                                    CHECK (lat BETWEEN -90 AND 90),
  lon                   DOUBLE PRECISION NOT NULL
                                    CHECK (lon BETWEEN -180 AND 180),
  alt                   REAL        NOT NULL
                                    DEFAULT 0
                                    CHECK (alt BETWEEN -500 AND 50000),

  -- Timing precision class (microseconds, defines TDoA weight)
  -- 1 = GPS-PPS ±1μs, 100 = GPSDO ±100μs, 1000 = standard GPS ±1ms, 50000 = smartphone ±50ms
  time_precision_us     INTEGER     NOT NULL
                                    CHECK (time_precision_us > 0),

  -- Highest gate level this node is capable of (1, 2, or 3)
  gate_level            SMALLINT    NOT NULL
                                    DEFAULT 1
                                    CHECK (gate_level BETWEEN 1 AND 3),

  -- Direct HTTP endpoint for Edge Function calls (IP:port or FQDN)
  direct_endpoint       TEXT        NULL
                                    CHECK (direct_endpoint IS NULL OR length(direct_endpoint) < 255),

  -- Operational state
  -- 'pending', 'online', 'degraded', 'mesh_only', 'offline', 'revoked'
  state                 TEXT        NOT NULL
                                    DEFAULT 'pending'
                                    CHECK (state IN ('pending','online','degraded','mesh_only','offline','revoked')),

  -- Timestamps
  registered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Heartbeat health tracking
  missed_heartbeats     SMALLINT    NOT NULL DEFAULT 0
                                    CHECK (missed_heartbeats >= 0),

  -- Geo-sector: geohash precision 8 (±19m × 19m cell)
  geo_sector            TEXT        NOT NULL
                                    CHECK (length(geo_sector) = 8),

  -- Mesh relay chain (populated when state = mesh_only)
  mesh_relay_path       TEXT[]      NULL,

  -- Certificate fingerprint (SHA-256, hex encoded, 64 chars)
  cert_fingerprint      CHAR(64)    NOT NULL,

  -- Certificate expiry
  cert_expires_at       TIMESTAMPTZ NOT NULL,

  -- Soft delete marker (never hard delete nodes)
  deleted_at            TIMESTAMPTZ NULL,

  -- Metadata JSONB for extensibility
  meta                  JSONB       NOT NULL DEFAULT '{}'::JSONB
);

COMMENT ON TABLE public.nodes IS 'Registry of all registered APEX-SENTINEL detection nodes';
COMMENT ON COLUMN public.nodes.time_precision_us IS 'Timing precision class in microseconds; used to compute TDoA weight';
COMMENT ON COLUMN public.nodes.geo_sector IS 'Geohash precision-8 cell code; used for NATS subject routing and TDoA grouping';

-- Indexes
CREATE INDEX idx_nodes_state ON public.nodes (state)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_nodes_geo_sector ON public.nodes (geo_sector)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_nodes_last_seen_at ON public.nodes (last_seen_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_nodes_cert_expires_at ON public.nodes (cert_expires_at)
  WHERE deleted_at IS NULL AND state != 'revoked';

CREATE INDEX idx_nodes_tier ON public.nodes (tier)
  WHERE deleted_at IS NULL;

-- GiST index on geography for spatial queries
CREATE INDEX idx_nodes_geography ON public.nodes
  USING GIST (ST_MakePoint(lon, lat)::geography);

-- Enable RLS
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- node_agent: can only access own record
CREATE POLICY nodes_node_agent_select ON public.nodes
  FOR SELECT USING (
    auth.uid()::text = node_id
    AND deleted_at IS NULL
  );

CREATE POLICY nodes_node_agent_update ON public.nodes
  FOR UPDATE USING (auth.uid()::text = node_id)
  WITH CHECK (
    auth.uid()::text = node_id
    AND deleted_at IS NULL
    -- node_agent cannot change: tier, cert_fingerprint, state (state managed by system)
  );

-- ops_admin: full read, can update state, cert
CREATE POLICY nodes_ops_admin_all ON public.nodes
  FOR ALL USING (
    (auth.jwt() ->> 'role') = 'ops_admin'
  );

-- c2_operator: read-only, no revoked nodes
CREATE POLICY nodes_c2_operator_select ON public.nodes
  FOR SELECT USING (
    (auth.jwt() ->> 'role') = 'c2_operator'
    AND state != 'revoked'
    AND deleted_at IS NULL
  );

-- privacy_officer: read-only
CREATE POLICY nodes_privacy_officer_select ON public.nodes
  FOR SELECT USING (
    (auth.jwt() ->> 'role') = 'privacy_officer'
  );
```

---

## 4. Table: node_heartbeats

```sql
-- Migration: 20260324000200_create_node_heartbeats.sql

CREATE TABLE public.node_heartbeats (
  id                    TEXT        PRIMARY KEY
                                    DEFAULT ('hb_' || generate_ulid()),

  node_id               TEXT        NOT NULL
                                    REFERENCES public.nodes (node_id)
                                    ON DELETE RESTRICT,

  -- Position at time of heartbeat (coarsened to ±111m)
  lat                   DOUBLE PRECISION NOT NULL
                                    CHECK (lat BETWEEN -90 AND 90),
  lon                   DOUBLE PRECISION NOT NULL
                                    CHECK (lon BETWEEN -180 AND 180),
  alt                   REAL        NOT NULL DEFAULT 0,

  -- Power status
  battery_percent       SMALLINT    NOT NULL
                                    CHECK (battery_percent BETWEEN 0 AND 100),

  -- RF signal quality
  signal_strength_dbm   SMALLINT    NOT NULL
                                    CHECK (signal_strength_dbm BETWEEN -150 AND 0),

  -- Which capabilities were active at heartbeat time
  active_capabilities   JSONB       NOT NULL DEFAULT '[]'::JSONB,

  -- CPU, memory, temperature (optional, device-dependent)
  system_metrics        JSONB       NOT NULL DEFAULT '{}'::JSONB,

  -- Network connectivity flags
  ip_connected          BOOLEAN     NOT NULL DEFAULT TRUE,
  lora_connected        BOOLEAN     NOT NULL DEFAULT FALSE,
  ble_connected         BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Precise timestamp from node (microseconds since Unix epoch)
  timestamp_us          BIGINT      NOT NULL
                                    CHECK (timestamp_us > 0),

  -- Wall-clock insert time
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()

  -- No UPDATE, no DELETE (append-only via RLS)
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE public.node_heartbeats IS 'Time-series heartbeat records from each detection node; partitioned monthly';

-- Create initial partitions (monthly)
CREATE TABLE public.node_heartbeats_2026_03
  PARTITION OF public.node_heartbeats
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE public.node_heartbeats_2026_04
  PARTITION OF public.node_heartbeats
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE public.node_heartbeats_2026_05
  PARTITION OF public.node_heartbeats
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- Indexes
CREATE INDEX idx_node_heartbeats_node_id_created
  ON public.node_heartbeats (node_id, created_at DESC);

-- BRIN index on created_at (append-only time series, very efficient)
CREATE INDEX idx_node_heartbeats_created_brin
  ON public.node_heartbeats USING BRIN (created_at)
  WITH (pages_per_range = 128);

CREATE INDEX idx_node_heartbeats_battery
  ON public.node_heartbeats (battery_percent, node_id)
  WHERE battery_percent < 20;

-- Enable RLS
ALTER TABLE public.node_heartbeats ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY heartbeats_node_agent_insert ON public.node_heartbeats
  FOR INSERT WITH CHECK (
    auth.uid()::text = node_id
  );

CREATE POLICY heartbeats_node_agent_select ON public.node_heartbeats
  FOR SELECT USING (
    auth.uid()::text = node_id
  );

CREATE POLICY heartbeats_ops_admin_all ON public.node_heartbeats
  FOR ALL USING (
    (auth.jwt() ->> 'role') = 'ops_admin'
  );

-- No UPDATE or DELETE policies: append-only table
```

---

## 5. Table: detection_events

```sql
-- Migration: 20260324000300_create_detection_events.sql

CREATE TABLE public.detection_events (
  id                    TEXT        PRIMARY KEY
                                    DEFAULT ('evt_' || generate_ulid()),

  -- Unique event identifier from the emitting node (prevents duplicates on replay)
  event_id              TEXT        NOT NULL UNIQUE
                                    CHECK (event_id ~ '^[0-9A-Z]{26}$'),

  -- Gate level that emitted this event (always 3 for events in this table)
  gate                  SMALLINT    NOT NULL DEFAULT 3
                                    CHECK (gate = 3),

  -- Primary node that detected the event
  node_id               TEXT        NOT NULL
                                    REFERENCES public.nodes (node_id)
                                    ON DELETE RESTRICT,

  -- Additional nodes that contributed to fused detection (TDoA peers)
  contributing_nodes    TEXT[]      NOT NULL DEFAULT '{}',

  -- Timing (microseconds since Unix epoch)
  timestamp_us          BIGINT      NOT NULL,

  -- Position (from TDoA fix or single-node estimate)
  lat                   DOUBLE PRECISION
                                    CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  lon                   DOUBLE PRECISION
                                    CHECK (lon IS NULL OR lon BETWEEN -180 AND 180),
  alt_m                 REAL        NULL,

  -- Position uncertainty from TDoA solver (metres)
  position_error_m      REAL        NULL
                                    CHECK (position_error_m IS NULL OR position_error_m >= 0),

  -- Per-modality confidence scores (0.0 to 1.0)
  acoustic_confidence   REAL        NOT NULL DEFAULT 0
                                    CHECK (acoustic_confidence BETWEEN 0 AND 1),
  rf_confidence         REAL        NOT NULL DEFAULT 0
                                    CHECK (rf_confidence BETWEEN 0 AND 1),
  sdr_confidence        REAL        NOT NULL DEFAULT 0
                                    CHECK (sdr_confidence BETWEEN 0 AND 1),

  -- Fused confidence across all available modalities
  fused_confidence      REAL        NOT NULL
                                    CHECK (fused_confidence BETWEEN 0 AND 1),

  -- Classification
  -- e.g. 'DJI_MAVIC', 'DJI_FPV', 'FIXED_WING', 'UNKNOWN_MULTIROTOR'
  threat_class          TEXT        NOT NULL DEFAULT 'UNKNOWN',

  -- Acoustic fingerprint features
  peak_freq_hz          INTEGER     NULL
                                    CHECK (peak_freq_hz IS NULL OR peak_freq_hz BETWEEN 0 AND 48000),

  -- RF anomaly relative to baseline (dB above noise floor)
  rssi_anomaly_db       REAL        NULL,

  -- Associated track (populated after TDoA correlation)
  track_id              TEXT        NULL,

  -- Geo-sector (geohash precision 8, matches nodes.geo_sector)
  geo_sector            TEXT        NOT NULL
                                    CHECK (length(geo_sector) = 8),

  -- TDoA solver metadata
  tdoa_solver_type      TEXT        NULL
                                    CHECK (tdoa_solver_type IS NULL OR
                                           tdoa_solver_type IN ('newton_raphson','centroid','single_node')),
  tdoa_iterations       SMALLINT    NULL,

  -- Relay metadata (populated if event arrived via mesh)
  relay_path            TEXT[]      NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE public.detection_events IS 'Gate 3 detection events; one row per confirmed detection event';
COMMENT ON COLUMN public.detection_events.position_error_m IS 'TDoA solver position uncertainty; NULL if no TDoA fix (single-node estimate)';
COMMENT ON COLUMN public.detection_events.contributing_nodes IS 'Array of node_ids that contributed to TDoA fix; empty if single-node';

-- Partitions
CREATE TABLE public.detection_events_2026_03
  PARTITION OF public.detection_events
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE public.detection_events_2026_04
  PARTITION OF public.detection_events
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Indexes

-- Spatial index for geo queries
CREATE INDEX idx_detection_events_geography
  ON public.detection_events
  USING GIST (ST_MakePoint(lon, lat)::geography)
  WHERE lat IS NOT NULL AND lon IS NOT NULL;

-- Time-series queries (most common: latest events)
CREATE INDEX idx_detection_events_created_brin
  ON public.detection_events USING BRIN (created_at)
  WITH (pages_per_range = 128);

-- Node-specific event queries
CREATE INDEX idx_detection_events_node_id
  ON public.detection_events (node_id, created_at DESC);

-- Geo-sector for fast track manager routing
CREATE INDEX idx_detection_events_geo_sector
  ON public.detection_events (geo_sector, created_at DESC);

-- High-confidence events (C2 dashboard primary view)
CREATE INDEX idx_detection_events_high_confidence
  ON public.detection_events (fused_confidence DESC, created_at DESC)
  WHERE fused_confidence >= 0.7;

-- Track association
CREATE INDEX idx_detection_events_track_id
  ON public.detection_events (track_id)
  WHERE track_id IS NOT NULL;

-- GIN for JSONB arrays (contributing_nodes queries)
-- Note: TEXT[] not JSONB; use GIN with array_ops
CREATE INDEX idx_detection_events_contributing_nodes
  ON public.detection_events USING GIN (contributing_nodes);

-- Enable RLS
ALTER TABLE public.detection_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY det_events_node_agent_insert ON public.detection_events
  FOR INSERT WITH CHECK (
    auth.uid()::text = node_id
  );

CREATE POLICY det_events_node_agent_select ON public.detection_events
  FOR SELECT USING (
    auth.uid()::text = node_id
  );

CREATE POLICY det_events_ops_admin_all ON public.detection_events
  FOR ALL USING (
    (auth.jwt() ->> 'role') = 'ops_admin'
  );

CREATE POLICY det_events_c2_operator_select ON public.detection_events
  FOR SELECT USING (
    (auth.jwt() ->> 'role') IN ('c2_operator', 'privacy_officer')
  );
```

---

## 6. Table: tracks

```sql
-- Migration: 20260324000400_create_tracks.sql

CREATE TABLE public.tracks (
  track_id              TEXT        PRIMARY KEY
                                    DEFAULT ('trk_' || generate_ulid()),

  -- Track state machine
  -- pending → active → confirmed → coasting → dropped
  state                 TEXT        NOT NULL DEFAULT 'pending'
                                    CHECK (state IN ('pending','active','confirmed','coasting','dropped')),

  -- Classification (most confident threat_class across contributing events)
  threat_class          TEXT        NOT NULL DEFAULT 'UNKNOWN',

  -- Current position estimate (from latest EKF output)
  lat                   DOUBLE PRECISION
                                    CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  lon                   DOUBLE PRECISION
                                    CHECK (lon IS NULL OR lon BETWEEN -180 AND 180),
  alt_m                 REAL        NULL,

  -- Velocity vector: {vx_ms: float, vy_ms: float, vz_ms: float}
  velocity              JSONB       NULL
                                    CHECK (velocity IS NULL OR jsonb_typeof(velocity) = 'object'),

  -- Overall confidence in this track
  confidence            REAL        NOT NULL DEFAULT 0
                                    CHECK (confidence BETWEEN 0 AND 1),

  -- How many detection events have been associated with this track
  update_count          INTEGER     NOT NULL DEFAULT 0
                                    CHECK (update_count >= 0),

  -- Which gate levels contributed (e.g. {2,3} means gate2 and gate3 events)
  contributing_gates    SMALLINT[]  NOT NULL DEFAULT '{}',

  -- All node_ids that have contributed events to this track
  contributing_nodes    TEXT[]      NOT NULL DEFAULT '{}',

  -- Predicted future positions (EKF projection)
  -- Format: {lat, lon, alt_m, position_error_m, timestamp_us}
  predicted_5s          JSONB       NULL,
  predicted_30s         JSONB       NULL,

  -- Timing
  last_updated_us       BIGINT      NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dropped_at            TIMESTAMPTZ NULL,

  -- Position uncertainty at current estimate (metres)
  position_error_m      REAL        NULL
                                    CHECK (position_error_m IS NULL OR position_error_m >= 0),

  -- Source of last position fix
  last_fix_type         TEXT        NULL
                                    CHECK (last_fix_type IS NULL OR
                                           last_fix_type IN ('tdoa_nr','tdoa_centroid','single_node','ekf_coast')),

  -- Alert dispatched for this track
  alert_dispatched      BOOLEAN     NOT NULL DEFAULT FALSE,
  alert_dispatched_at   TIMESTAMPTZ NULL
);

COMMENT ON TABLE public.tracks IS 'Drone tracks synthesised from multiple detection events by the TDoA correlator and EKF';
COMMENT ON COLUMN public.tracks.state IS 'Track state: pending=<3 fixes, active=3+ fixes, confirmed=high confidence, coasting=EKF extrapolating, dropped=no fixes for 30s';
COMMENT ON COLUMN public.tracks.predicted_5s IS 'EKF-projected position 5 seconds ahead with uncertainty radius';

-- Indexes
CREATE INDEX idx_tracks_state ON public.tracks (state, created_at DESC)
  WHERE state NOT IN ('dropped');

CREATE INDEX idx_tracks_geography
  ON public.tracks
  USING GIST (ST_MakePoint(lon, lat)::geography)
  WHERE lat IS NOT NULL AND lon IS NOT NULL;

CREATE INDEX idx_tracks_created_brin
  ON public.tracks USING BRIN (created_at)
  WITH (pages_per_range = 64);

CREATE INDEX idx_tracks_confidence_active
  ON public.tracks (confidence DESC, state)
  WHERE state IN ('active','confirmed');

CREATE INDEX idx_tracks_contributing_nodes
  ON public.tracks USING GIN (contributing_nodes);

-- Enable RLS
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY tracks_ops_admin_all ON public.tracks
  FOR ALL USING (
    (auth.jwt() ->> 'role') = 'ops_admin'
  );

CREATE POLICY tracks_c2_select ON public.tracks
  FOR SELECT USING (
    (auth.jwt() ->> 'role') IN ('c2_operator','privacy_officer')
  );

-- Services can write via service_role key (bypasses RLS)
-- node_agent: no direct access to tracks (service-level writes only)
```

---

## 7. Table: alerts

```sql
-- Migration: 20260324000500_create_alerts.sql

CREATE TABLE public.alerts (
  id                    TEXT        PRIMARY KEY
                                    DEFAULT ('alt_' || generate_ulid()),

  -- Associated track
  track_id              TEXT        NOT NULL
                                    REFERENCES public.tracks (track_id)
                                    ON DELETE RESTRICT,

  -- Alert severity
  severity              TEXT        NOT NULL
                                    CHECK (severity IN ('critical','high','medium','low','info')),

  -- Human-readable alert message
  message               TEXT        NOT NULL
                                    CHECK (length(message) BETWEEN 1 AND 1000),

  -- Position at time of alert
  lat                   DOUBLE PRECISION
                                    CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  lon                   DOUBLE PRECISION
                                    CHECK (lon IS NULL OR lon BETWEEN -180 AND 180),
  alt_m                 REAL        NULL,

  -- Confidence score at time of alert generation
  confidence            REAL        NOT NULL
                                    CHECK (confidence BETWEEN 0 AND 1),

  -- Channels this alert was dispatched to
  -- e.g. ['tak', 'telegram', 'pagerduty', 'webhook']
  channels              TEXT[]      NOT NULL DEFAULT '{}',

  -- Dispatch status per channel
  -- Format: {"tak": "sent", "telegram": "failed", "pagerduty": "sent"}
  dispatch_status       JSONB       NOT NULL DEFAULT '{}'::JSONB,

  -- CoT XML for TAK/ATAK dispatch (stored for audit/replay)
  cot_xml               TEXT        NULL
                                    CHECK (cot_xml IS NULL OR length(cot_xml) < 65536),

  -- Operator workflow state
  -- 'pending' → 'acknowledged' → 'actioned'
  workflow_state        TEXT        NOT NULL DEFAULT 'pending'
                                    CHECK (workflow_state IN ('pending','acknowledged','actioned')),

  -- Who acknowledged/actioned
  acknowledged_by       TEXT        NULL,
  actioned_by           TEXT        NULL,
  operator_notes        TEXT        NULL,

  -- Timing
  dispatched_at         TIMESTAMPTZ NULL,
  acknowledged_at       TIMESTAMPTZ NULL,
  actioned_at           TIMESTAMPTZ NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.alerts IS 'Dispatched alerts with per-channel delivery status and operator workflow state';

-- Indexes
CREATE INDEX idx_alerts_track_id ON public.alerts (track_id, created_at DESC);

CREATE INDEX idx_alerts_severity_pending
  ON public.alerts (severity, created_at DESC)
  WHERE workflow_state = 'pending';

CREATE INDEX idx_alerts_created_brin
  ON public.alerts USING BRIN (created_at)
  WITH (pages_per_range = 64);

-- GIN on dispatch_status for channel filtering
CREATE INDEX idx_alerts_dispatch_status
  ON public.alerts USING GIN (dispatch_status);

-- Enable RLS
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY alerts_ops_admin_all ON public.alerts
  FOR ALL USING (
    (auth.jwt() ->> 'role') = 'ops_admin'
  );

CREATE POLICY alerts_c2_select ON public.alerts
  FOR SELECT USING (
    (auth.jwt() ->> 'role') IN ('c2_operator','privacy_officer')
  );

CREATE POLICY alerts_c2_update_workflow ON public.alerts
  FOR UPDATE USING (
    (auth.jwt() ->> 'role') = 'c2_operator'
  ) WITH CHECK (
    (auth.jwt() ->> 'role') = 'c2_operator'
    -- c2_operator can only change workflow_state, acknowledged_by, actioned_by, operator_notes
  );
```

---

## 8. Table: operator_audit_log

```sql
-- Migration: 20260324000600_create_operator_audit_log.sql

CREATE TABLE public.operator_audit_log (
  id                    TEXT        PRIMARY KEY
                                    DEFAULT ('aud_' || generate_ulid()),

  -- Who performed the action (UUID from Supabase Auth, or service identifier)
  operator_id           TEXT        NOT NULL,

  -- Action category
  action                TEXT        NOT NULL
                                    CHECK (action IN (
                                      'login', 'logout',
                                      'node_approve', 'node_force_offline', 'node_revoke_cert',
                                      'alert_acknowledge', 'alert_action',
                                      'config_change', 'stream_update',
                                      'data_export', 'audit_log_view',
                                      'user_create', 'user_disable',
                                      'manual_event_inject'
                                    )),

  -- Resource type and ID
  resource_type         TEXT        NULL,
  resource_id           TEXT        NULL,

  -- Structured details (action-specific)
  details               JSONB       NOT NULL DEFAULT '{}'::JSONB,

  -- Network
  -- Stored as /24 network (last octet zeroed for IPv4, last 80 bits zeroed for IPv6)
  ip_addr               INET        NULL,

  -- User-agent (truncated to 500 chars)
  user_agent            TEXT        NULL
                                    CHECK (user_agent IS NULL OR length(user_agent) <= 500),

  -- Outcome
  outcome               TEXT        NOT NULL DEFAULT 'success'
                                    CHECK (outcome IN ('success','failure','partial')),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()

  -- NO UPDATE, NO DELETE policies — this table is append-only
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE public.operator_audit_log IS 'Append-only audit trail; GDPR Article 30 records of processing; no UPDATE/DELETE permitted';
COMMENT ON COLUMN public.operator_audit_log.ip_addr IS 'IPv4 coarsened to /24, IPv6 to /48 before storage';

-- Partitions (quarterly for audit tables — less partitions, simpler retention)
CREATE TABLE public.operator_audit_log_2026_q1
  PARTITION OF public.operator_audit_log
  FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');

CREATE TABLE public.operator_audit_log_2026_q2
  PARTITION OF public.operator_audit_log
  FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');

CREATE TABLE public.operator_audit_log_2026_q3
  PARTITION OF public.operator_audit_log
  FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');

CREATE TABLE public.operator_audit_log_2026_q4
  PARTITION OF public.operator_audit_log
  FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');

-- Indexes
CREATE INDEX idx_audit_log_operator_id
  ON public.operator_audit_log (operator_id, created_at DESC);

CREATE INDEX idx_audit_log_action
  ON public.operator_audit_log (action, created_at DESC);

CREATE INDEX idx_audit_log_resource
  ON public.operator_audit_log (resource_type, resource_id, created_at DESC)
  WHERE resource_id IS NOT NULL;

CREATE INDEX idx_audit_log_created_brin
  ON public.operator_audit_log USING BRIN (created_at)
  WITH (pages_per_range = 128);

-- Enable RLS
ALTER TABLE public.operator_audit_log ENABLE ROW LEVEL SECURITY;

-- Append-only: INSERT allowed for authenticated users and service_role
CREATE POLICY audit_log_insert_authenticated ON public.operator_audit_log
  FOR INSERT WITH CHECK (TRUE);
  -- Note: actual writes go via service_role from Edge Functions only

-- privacy_officer: full read
CREATE POLICY audit_log_privacy_officer_select ON public.operator_audit_log
  FOR SELECT USING (
    (auth.jwt() ->> 'role') = 'privacy_officer'
  );

-- ops_admin: read own actions only (cannot see other operators' actions)
CREATE POLICY audit_log_ops_admin_own ON public.operator_audit_log
  FOR SELECT USING (
    (auth.jwt() ->> 'role') = 'ops_admin'
    AND operator_id = auth.uid()::text
  );

-- NO UPDATE POLICIES — append-only
-- NO DELETE POLICIES — append-only
```

---

## 9. pg_cron Retention Jobs

```sql
-- Migration: 20260324000700_pg_cron_retention.sql

-- Run retention jobs daily at 03:00 UTC (off-peak)

-- node_heartbeats: keep 90 days
SELECT cron.schedule(
  'retention_node_heartbeats',
  '0 3 * * *',
  $$
    DELETE FROM public.node_heartbeats
    WHERE created_at < NOW() - INTERVAL '90 days';
  $$
);

-- detection_events: keep 365 days
SELECT cron.schedule(
  'retention_detection_events',
  '15 3 * * *',
  $$
    DELETE FROM public.detection_events
    WHERE created_at < NOW() - INTERVAL '365 days';
  $$
);

-- tracks: keep 365 days (dropped tracks after 90 days)
SELECT cron.schedule(
  'retention_tracks_dropped',
  '30 3 * * *',
  $$
    DELETE FROM public.tracks
    WHERE state = 'dropped'
    AND dropped_at < NOW() - INTERVAL '90 days';
  $$
);

SELECT cron.schedule(
  'retention_tracks_all',
  '45 3 * * *',
  $$
    DELETE FROM public.tracks
    WHERE created_at < NOW() - INTERVAL '365 days';
  $$
);

-- alerts: keep 365 days
SELECT cron.schedule(
  'retention_alerts',
  '0 4 * * *',
  $$
    DELETE FROM public.alerts
    WHERE created_at < NOW() - INTERVAL '365 days';
  $$
);

-- operator_audit_log: keep 365 days minimum (GDPR Article 17)
SELECT cron.schedule(
  'retention_audit_log',
  '30 4 * * *',
  $$
    DELETE FROM public.operator_audit_log
    WHERE created_at < NOW() - INTERVAL '365 days';
  $$
);

-- Monthly partition maintenance: create next month's partitions
SELECT cron.schedule(
  'create_monthly_partitions',
  '0 2 20 * *',
  $$
    DO $$
    DECLARE
      next_month DATE := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
      next_month_end DATE := next_month + INTERVAL '1 month';
      partition_suffix TEXT := TO_CHAR(next_month, 'YYYY_MM');
      partition_name TEXT;
    BEGIN
      partition_name := 'node_heartbeats_' || partition_suffix;
      IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = partition_name) THEN
        EXECUTE FORMAT(
          'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.node_heartbeats FOR VALUES FROM (%L) TO (%L)',
          partition_name, next_month, next_month_end
        );
      END IF;

      partition_name := 'detection_events_' || partition_suffix;
      IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = partition_name) THEN
        EXECUTE FORMAT(
          'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.detection_events FOR VALUES FROM (%L) TO (%L)',
          partition_name, next_month, next_month_end
        );
      END IF;
    END;
    $$;
  $$
);
```

---

## 10. GDPR Article 17 Cascade Delete

```sql
-- Migration: 20260324000800_gdpr_cascade_delete.sql

-- Function: delete all data for a given node_id (e.g. on node decommission + data erasure request)
-- This is the GDPR Article 17 implementation for detection data linked to nodes.
-- Note: operator_audit_log is NEVER deleted (legal obligation to retain).

CREATE OR REPLACE FUNCTION public.gdpr_cascade_delete_node(
  p_node_id TEXT,
  p_requester_operator_id TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER  -- runs as postgres, bypasses RLS for deletion
AS $$
DECLARE
  v_heartbeat_count INTEGER;
  v_event_count INTEGER;
  v_start TIMESTAMPTZ := NOW();
BEGIN
  -- Verify node exists
  IF NOT EXISTS (SELECT 1 FROM public.nodes WHERE node_id = p_node_id) THEN
    RAISE EXCEPTION 'NODE_NOT_FOUND: %', p_node_id;
  END IF;

  -- Count before deletion for audit
  SELECT COUNT(*) INTO v_heartbeat_count
  FROM public.node_heartbeats WHERE node_id = p_node_id;

  SELECT COUNT(*) INTO v_event_count
  FROM public.detection_events WHERE node_id = p_node_id;

  -- Delete heartbeats
  DELETE FROM public.node_heartbeats WHERE node_id = p_node_id;

  -- Anonymise detection events (do not delete — they may be part of confirmed tracks)
  -- Replace node_id with 'nde_DELETED_{hash}', remove precise position
  UPDATE public.detection_events SET
    node_id = 'nde_DELETED_' || SUBSTR(MD5(p_node_id), 1, 8),
    lat = ROUND(lat::NUMERIC, 1),  -- coarsen to ±11km
    lon = ROUND(lon::NUMERIC, 1),
    contributing_nodes = ARRAY(
      SELECT CASE WHEN n = p_node_id THEN 'nde_DELETED_' || SUBSTR(MD5(p_node_id), 1, 8)
                  ELSE n END
      FROM UNNEST(contributing_nodes) n
    )
  WHERE node_id = p_node_id;

  -- Mark node as revoked with deleted_at
  UPDATE public.nodes SET
    state = 'revoked',
    deleted_at = NOW(),
    lat = ROUND(lat::NUMERIC, 1),
    lon = ROUND(lon::NUMERIC, 1),
    cert_fingerprint = REPEAT('0', 64),
    meta = '{}'::JSONB
  WHERE node_id = p_node_id;

  -- Log to audit trail (this log entry itself is never deleted)
  INSERT INTO public.operator_audit_log (
    operator_id, action, resource_type, resource_id, details, outcome
  ) VALUES (
    p_requester_operator_id,
    'node_revoke_cert',  -- closest action category
    'node',
    p_node_id,
    JSONB_BUILD_OBJECT(
      'gdpr_article', 17,
      'reason', p_reason,
      'heartbeats_deleted', v_heartbeat_count,
      'events_anonymised', v_event_count,
      'processing_ms', EXTRACT(EPOCH FROM (NOW() - v_start)) * 1000
    ),
    'success'
  );

  RETURN JSONB_BUILD_OBJECT(
    'node_id', p_node_id,
    'heartbeats_deleted', v_heartbeat_count,
    'events_anonymised', v_event_count,
    'completed_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.gdpr_cascade_delete_node IS
  'GDPR Article 17 implementation: deletes heartbeats, anonymises detection events, revokes node. Audit log preserved.';
```

---

## 11. Realtime Publication Setup

```sql
-- Migration: 20260324000900_realtime_publication.sql

-- Supabase Realtime requires tables to be added to publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.detection_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tracks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.nodes;

-- node_heartbeats and operator_audit_log intentionally excluded from Realtime
-- (high volume + sensitive data)
```

---

## 12. Migration Execution Order

```
20260324000000_extensions_setup.sql
20260324000100_create_nodes.sql
20260324000200_create_node_heartbeats.sql
20260324000300_create_detection_events.sql
20260324000400_create_tracks.sql
20260324000500_create_alerts.sql
20260324000600_create_operator_audit_log.sql
20260324000700_pg_cron_retention.sql
20260324000800_gdpr_cascade_delete.sql
20260324000900_realtime_publication.sql
```

Apply via Supabase CLI:
```bash
supabase db push --project-ref bymfcnwfyxuivinuzurr
```

Verify RLS is active on all tables:
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- All rows must show rowsecurity = true
```
