# APEX-SENTINEL — DATABASE_SCHEMA.md
## Complete PostgreSQL Schema for Supabase
### Wave 1 | Project: APEX-SENTINEL | Version: 1.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. EXTENSIONS AND SETUP

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Enable H3 extension (if available in Supabase environment)
-- Note: Use h3-js in Edge Functions as fallback
CREATE EXTENSION IF NOT EXISTS "h3";

-- Set timezone
SET timezone = 'UTC';
```

---

## 2. ENUMS

```sql
-- Node platform type
CREATE TYPE node_platform AS ENUM (
  'android',
  'ios',
  'web'   -- future browser-based sensor
);

-- Node connectivity state
CREATE TYPE node_status AS ENUM (
  'online',         -- internet connected
  'mesh_only',      -- LoRa/BLE only, no internet
  'degraded',       -- online but low quality (battery/SNR)
  'offline',        -- no contact > 300 seconds
  'calibrating'     -- undergoing calibration
);

-- Detection method
CREATE TYPE detection_method AS ENUM (
  'acoustic_only',
  'rf_only',
  'acoustic_rf_fused'
);

-- Drone/threat classification
CREATE TYPE threat_type AS ENUM (
  'fpv_quad',          -- FPV quadcopter (200-800 Hz)
  'shahed_class',      -- Shahed-136 / similar loitering munition
  'commercial_drone',  -- DJI / commercial UAS
  'unknown_uav',       -- Unclassified aerial threat
  'false_positive',    -- Classified as non-threat post-review
  'aircraft_correlated' -- Matched to ADS-B civil aircraft
);

-- Track lifecycle state
CREATE TYPE track_state AS ENUM (
  'detected',     -- initial detection, <3 nodes
  'tracking',     -- active triangulation
  'confirmed',    -- high confidence, alert issued
  'lost',         -- no detections for 60 seconds
  'terminated'    -- no detections for 300 seconds, archived
);

-- Alert severity
CREATE TYPE alert_severity AS ENUM (
  'low',
  'medium',
  'high',
  'critical'
);

-- Alert status
CREATE TYPE alert_status AS ENUM (
  'active',
  'acknowledged',
  'escalated',
  'dismissed',
  'auto_cleared'
);

-- User role
CREATE TYPE user_role AS ENUM (
  'super_admin',
  'c2_commander',
  'c2_operator',
  'analyst',
  'civil_coordinator',
  'read_only'
);

-- Calibration status
CREATE TYPE calibration_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'failed',
  'expired'
);

-- Mesh link type
CREATE TYPE mesh_link_type AS ENUM (
  'lora_868',
  'lora_915',
  'lora_433',
  'ble_5',
  'google_nearby',
  'wifi_direct'
);
```

---

## 3. CORE TABLES

### 3.1 nodes

```sql
CREATE TABLE nodes (
  -- Identity
  id                    UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  node_id               VARCHAR(16)   NOT NULL UNIQUE,   -- short 6-char + hash prefix
  hashed_device_id      VARCHAR(64)   NOT NULL UNIQUE,   -- SHA-256 of device UUID
  display_name          VARCHAR(16),                     -- optional, user-set, no PII
  platform              node_platform NOT NULL,
  app_version           VARCHAR(20)   NOT NULL,
  ml_model_version      VARCHAR(20)   NOT NULL,

  -- Location (privacy-rounded to user-configured precision)
  latitude              DOUBLE PRECISION,
  longitude             DOUBLE PRECISION,
  location_accuracy_m   FLOAT,
  location_updated_at   TIMESTAMPTZ,
  geom                  GEOGRAPHY(POINT, 4326),          -- PostGIS point (auto-updated by trigger)
  h3_cell_r7            VARCHAR(16),                     -- H3 resolution 7 (5.16 km²)
  h3_cell_r9            VARCHAR(16),                     -- H3 resolution 9 (0.105 km²)

  -- Capabilities
  has_acoustic          BOOLEAN       DEFAULT TRUE,
  has_rf_scan           BOOLEAN       DEFAULT TRUE,
  has_lora              BOOLEAN       DEFAULT FALSE,
  has_ble               BOOLEAN       DEFAULT TRUE,
  has_gps               BOOLEAN       DEFAULT TRUE,

  -- Status
  status                node_status   DEFAULT 'offline',
  last_seen_at          TIMESTAMPTZ,
  first_seen_at         TIMESTAMPTZ   DEFAULT NOW(),

  -- Health metrics (updated by heartbeat)
  battery_percent       SMALLINT      CHECK (battery_percent BETWEEN 0 AND 100),
  available_storage_mb  INTEGER,
  acoustic_snr_db       FLOAT,
  mesh_peer_count       SMALLINT      DEFAULT 0,
  network_type          VARCHAR(10),  -- 'wifi', '4g', '5g', 'mesh', 'offline'

  -- Calibration
  calibration_weight    FLOAT         DEFAULT 1.0
                                      CHECK (calibration_weight BETWEEN 0.0 AND 1.0),
  calibration_id        UUID          REFERENCES calibrations(id),
  calibrated_at         TIMESTAMPTZ,
  ambient_noise_db      FLOAT,
  time_offset_ms        FLOAT,        -- NTP offset in milliseconds

  -- Authentication
  jwt_issued_at         TIMESTAMPTZ,
  jwt_expires_at        TIMESTAMPTZ,

  -- Metadata
  created_at            TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
  updated_at            TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
  deleted_at            TIMESTAMPTZ   -- soft delete for GDPR
);

-- Indexes
CREATE INDEX idx_nodes_node_id ON nodes (node_id);
CREATE INDEX idx_nodes_status ON nodes (status);
CREATE INDEX idx_nodes_last_seen ON nodes (last_seen_at DESC);
CREATE INDEX idx_nodes_geom ON nodes USING GIST (geom);
CREATE INDEX idx_nodes_h3_r7 ON nodes (h3_cell_r7);
CREATE INDEX idx_nodes_h3_r9 ON nodes (h3_cell_r9);
CREATE INDEX idx_nodes_battery ON nodes (battery_percent) WHERE battery_percent < 20;
CREATE INDEX idx_nodes_deleted ON nodes (deleted_at) WHERE deleted_at IS NULL;

-- Auto-update geom from lat/lon
CREATE OR REPLACE FUNCTION update_node_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::GEOGRAPHY;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_node_geom
  BEFORE INSERT OR UPDATE OF latitude, longitude ON nodes
  FOR EACH ROW EXECUTE FUNCTION update_node_geom();
```

### 3.2 detection_events

```sql
CREATE TABLE detection_events (
  id                    UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Source
  node_id               VARCHAR(16)   NOT NULL REFERENCES nodes(node_id),
  session_id            UUID,         -- groups events from same detection burst

  -- Timing (critical for TDoA)
  detected_at           TIMESTAMPTZ   NOT NULL,          -- device timestamp (NTP-synced)
  received_at           TIMESTAMPTZ   DEFAULT NOW(),     -- server receipt timestamp
  ntp_offset_ms         FLOAT,        -- node-reported NTP offset at detection time

  -- Location (privacy-rounded)
  latitude              DOUBLE PRECISION NOT NULL,
  longitude             DOUBLE PRECISION NOT NULL,
  location_accuracy_m   FLOAT,
  altitude_m            FLOAT,
  geom                  GEOGRAPHY(POINT, 4326),
  h3_cell_r7            VARCHAR(16),

  -- Detection scores
  acoustic_confidence   FLOAT         CHECK (acoustic_confidence BETWEEN 0 AND 1),
  rf_anomaly_score      FLOAT         CHECK (rf_anomaly_score BETWEEN 0 AND 1),
  fused_confidence      FLOAT         CHECK (fused_confidence BETWEEN 0 AND 1),
  detection_method      detection_method NOT NULL,

  -- Acoustic details
  frequency_band_500hz  FLOAT,        -- energy in 500Hz band
  frequency_band_800hz  FLOAT,        -- energy in 800Hz band
  frequency_band_1200hz FLOAT,        -- energy in 1200Hz band
  frequency_band_2000hz FLOAT,        -- energy in 2000Hz band
  ambient_noise_db      FLOAT,        -- ambient SPL at detection time

  -- RF details (JSONB for flexible channel storage)
  rf_channel_energies   JSONB,
  -- Schema: {"2g_ch1": -72.4, "2g_ch6": -68.1, "2g_ch11": -78.3,
  --          "5g_ch36": -82.1, "5g_ch40": -85.0, ...}
  rf_baseline_deviation FLOAT,        -- sigma deviation from 5-min baseline

  -- Classification
  threat_type           threat_type,
  threat_type_confidence FLOAT        CHECK (threat_type_confidence BETWEEN 0 AND 1),

  -- ML metadata
  ml_model_version      VARCHAR(20),
  inference_latency_ms  INTEGER,

  -- Track assignment (set by backend)
  track_id              VARCHAR(32)   REFERENCES tracks(track_id),

  -- ADS-B correlation
  correlated_icao24     VARCHAR(8),   -- ICAO 24-bit address if matched
  adsb_suppressed       BOOLEAN       DEFAULT FALSE,

  -- Flags
  is_calibration_pulse  BOOLEAN       DEFAULT FALSE,   -- test/calibration event
  is_queued_upload      BOOLEAN       DEFAULT FALSE,   -- was uploaded from local queue

  created_at            TIMESTAMPTZ   DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_detection_events_node_id ON detection_events (node_id);
CREATE INDEX idx_detection_events_detected_at ON detection_events (detected_at DESC);
CREATE INDEX idx_detection_events_track_id ON detection_events (track_id);
CREATE INDEX idx_detection_events_fused_confidence ON detection_events (fused_confidence DESC);
CREATE INDEX idx_detection_events_geom ON detection_events USING GIST (geom);
CREATE INDEX idx_detection_events_h3_r7 ON detection_events (h3_cell_r7);
CREATE INDEX idx_detection_events_received_at ON detection_events (received_at DESC);

-- Composite for triangulation queries
CREATE INDEX idx_detection_events_tdoa_lookup
  ON detection_events (h3_cell_r7, detected_at DESC, fused_confidence)
  WHERE fused_confidence > 0.35 AND acoustic_confidence > 0.35;

-- Auto-update geom
CREATE OR REPLACE FUNCTION update_detection_geom()
RETURNS TRIGGER AS $$
BEGIN
  NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::GEOGRAPHY;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_detection_geom
  BEFORE INSERT ON detection_events
  FOR EACH ROW EXECUTE FUNCTION update_detection_geom();
```

### 3.3 rf_readings

```sql
CREATE TABLE rf_readings (
  id                UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  node_id           VARCHAR(16)   NOT NULL REFERENCES nodes(node_id),
  detection_event_id UUID         REFERENCES detection_events(id),

  scanned_at        TIMESTAMPTZ   NOT NULL,
  latitude          DOUBLE PRECISION NOT NULL,
  longitude         DOUBLE PRECISION NOT NULL,
  geom              GEOGRAPHY(POINT, 4326),

  -- 2.4GHz channels (RSSI in dBm)
  ch_2g_1           SMALLINT,   -- 2412 MHz
  ch_2g_2           SMALLINT,   -- 2417 MHz
  ch_2g_3           SMALLINT,   -- 2422 MHz
  ch_2g_4           SMALLINT,   -- 2427 MHz
  ch_2g_5           SMALLINT,   -- 2432 MHz
  ch_2g_6           SMALLINT,   -- 2437 MHz
  ch_2g_7           SMALLINT,   -- 2442 MHz
  ch_2g_8           SMALLINT,   -- 2447 MHz
  ch_2g_9           SMALLINT,   -- 2452 MHz
  ch_2g_10          SMALLINT,   -- 2457 MHz
  ch_2g_11          SMALLINT,   -- 2462 MHz
  ch_2g_12          SMALLINT,   -- 2467 MHz
  ch_2g_13          SMALLINT,   -- 2472 MHz

  -- 5GHz channels (RSSI in dBm)
  ch_5g_36          SMALLINT,   -- 5180 MHz
  ch_5g_40          SMALLINT,   -- 5200 MHz
  ch_5g_44          SMALLINT,   -- 5220 MHz
  ch_5g_48          SMALLINT,   -- 5240 MHz
  ch_5g_149         SMALLINT,   -- 5745 MHz
  ch_5g_153         SMALLINT,   -- 5765 MHz
  ch_5g_157         SMALLINT,   -- 5785 MHz
  ch_5g_161         SMALLINT,   -- 5805 MHz

  anomaly_score     FLOAT       CHECK (anomaly_score BETWEEN 0 AND 1),
  baseline_2g_avg   FLOAT,      -- 5-min rolling average 2.4GHz
  baseline_5g_avg   FLOAT,      -- 5-min rolling average 5GHz

  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_rf_readings_node_id ON rf_readings (node_id);
CREATE INDEX idx_rf_readings_scanned_at ON rf_readings (scanned_at DESC);
CREATE INDEX idx_rf_readings_geom ON rf_readings USING GIST (geom);
CREATE INDEX idx_rf_readings_anomaly ON rf_readings (anomaly_score DESC)
  WHERE anomaly_score > 0.35;

-- Trigger for geom
CREATE TRIGGER trg_update_rf_geom
  BEFORE INSERT ON rf_readings
  FOR EACH ROW EXECUTE FUNCTION update_detection_geom();
```

### 3.4 acoustic_readings

```sql
CREATE TABLE acoustic_readings (
  id                    UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  node_id               VARCHAR(16)   NOT NULL REFERENCES nodes(node_id),
  detection_event_id    UUID          REFERENCES detection_events(id),

  recorded_at           TIMESTAMPTZ   NOT NULL,
  latitude              DOUBLE PRECISION NOT NULL,
  longitude             DOUBLE PRECISION NOT NULL,
  geom                  GEOGRAPHY(POINT, 4326),

  -- Frequency band energies (normalized 0.0-1.0 within band)
  band_500hz            FLOAT,
  band_800hz            FLOAT,
  band_1200hz           FLOAT,
  band_2000hz           FLOAT,
  dominant_frequency_hz FLOAT,        -- peak frequency detected

  -- SPL measurements
  spl_db                FLOAT,        -- sound pressure level
  ambient_spl_db        FLOAT,        -- ambient baseline at time of reading
  snr_db                FLOAT,        -- signal-to-noise ratio

  -- ML outputs
  drone_probability     FLOAT         CHECK (drone_probability BETWEEN 0 AND 1),
  threat_type           threat_type,
  yamnet_top_class      VARCHAR(64),  -- YAMNet raw top class label
  yamnet_score          FLOAT,

  -- VAD gate
  vad_triggered         BOOLEAN       DEFAULT FALSE,  -- WebRTC VAD triggered
  vad_speech_detected   BOOLEAN       DEFAULT FALSE,  -- speech detected (suppress if true)

  frame_duration_ms     INTEGER       DEFAULT 500,
  inference_latency_ms  INTEGER,

  created_at            TIMESTAMPTZ   DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_acoustic_readings_node_id ON acoustic_readings (node_id);
CREATE INDEX idx_acoustic_readings_recorded_at ON acoustic_readings (recorded_at DESC);
CREATE INDEX idx_acoustic_readings_geom ON acoustic_readings USING GIST (geom);
CREATE INDEX idx_acoustic_readings_drone_prob ON acoustic_readings (drone_probability DESC)
  WHERE drone_probability > 0.35;

CREATE TRIGGER trg_update_acoustic_geom
  BEFORE INSERT ON acoustic_readings
  FOR EACH ROW EXECUTE FUNCTION update_detection_geom();
```

### 3.5 tracks

```sql
CREATE TABLE tracks (
  id                    UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  track_id              VARCHAR(32)   NOT NULL UNIQUE,   -- TRK-YYYYMMDD-NNNN

  -- State
  state                 track_state   DEFAULT 'detected' NOT NULL,
  threat_type           threat_type,
  confidence            FLOAT         CHECK (confidence BETWEEN 0 AND 1),

  -- Current estimated position
  current_lat           DOUBLE PRECISION,
  current_lon           DOUBLE PRECISION,
  current_alt_m         FLOAT,
  current_geom          GEOGRAPHY(POINT, 4326),
  position_error_m      FLOAT,        -- 1-sigma error ellipse semi-major axis
  position_error_b_m    FLOAT,        -- semi-minor axis
  position_error_angle  FLOAT,        -- rotation of error ellipse (degrees)
  gdop                  FLOAT,        -- geometric dilution of precision

  -- Kinematics (Kalman filter output)
  heading_deg           FLOAT,        -- 0-360, true north
  speed_ms              FLOAT,        -- meters per second
  vertical_speed_ms     FLOAT,        -- positive = ascending
  kalman_state          JSONB,        -- full Kalman state vector for resume

  -- Track geometry
  first_lat             DOUBLE PRECISION,
  first_lon             DOUBLE PRECISION,
  first_detection_at    TIMESTAMPTZ,
  last_detection_at     TIMESTAMPTZ,
  lost_at               TIMESTAMPTZ,
  terminated_at         TIMESTAMPTZ,

  -- Statistics
  contributing_nodes    INTEGER       DEFAULT 0,
  detection_count       INTEGER       DEFAULT 0,
  max_confidence        FLOAT,
  triangulation_method  VARCHAR(32),  -- 'tdoa_3point', 'rssi_circles', 'combined'

  -- ADS-B correlation
  correlated_icao24     VARCHAR(8),
  adsb_correlation_score FLOAT,

  -- Alert linkage
  alert_id              UUID,         -- most recent alert for this track

  -- COT export
  cot_last_sent_at      TIMESTAMPTZ,
  cot_uid               VARCHAR(64),  -- APEXSENTINEL-TRK-...

  created_at            TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
  updated_at            TIMESTAMPTZ   DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_tracks_track_id ON tracks (track_id);
CREATE INDEX idx_tracks_state ON tracks (state) WHERE state IN ('tracking', 'confirmed');
CREATE INDEX idx_tracks_current_geom ON tracks USING GIST (current_geom);
CREATE INDEX idx_tracks_last_detection ON tracks (last_detection_at DESC);
CREATE INDEX idx_tracks_confidence ON tracks (confidence DESC);
CREATE INDEX idx_tracks_threat_type ON tracks (threat_type);
CREATE INDEX idx_tracks_created_at ON tracks (created_at DESC);

-- Auto-update geom and updated_at
CREATE OR REPLACE FUNCTION update_track_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_lat IS NOT NULL AND NEW.current_lon IS NOT NULL THEN
    NEW.current_geom = ST_SetSRID(
      ST_MakePoint(NEW.current_lon, NEW.current_lat), 4326
    )::GEOGRAPHY;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_track_geom
  BEFORE INSERT OR UPDATE OF current_lat, current_lon ON tracks
  FOR EACH ROW EXECUTE FUNCTION update_track_geom();
```

### 3.6 track_points

```sql
CREATE TABLE track_points (
  id            UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  track_id      VARCHAR(32)   NOT NULL REFERENCES tracks(track_id) ON DELETE CASCADE,

  estimated_at  TIMESTAMPTZ   NOT NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lon           DOUBLE PRECISION NOT NULL,
  alt_m         FLOAT,
  geom          GEOGRAPHY(POINT, 4326),

  confidence    FLOAT,
  heading_deg   FLOAT,
  speed_ms      FLOAT,
  position_error_m FLOAT,

  contributing_nodes INTEGER,
  triangulation_method VARCHAR(32),

  created_at    TIMESTAMPTZ   DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_track_points_track_id ON track_points (track_id, estimated_at DESC);
CREATE INDEX idx_track_points_geom ON track_points USING GIST (geom);
CREATE INDEX idx_track_points_estimated_at ON track_points (estimated_at DESC);

-- Partition this table by month for large deployments:
-- Consider range partitioning on estimated_at

CREATE TRIGGER trg_update_track_point_geom
  BEFORE INSERT ON track_points
  FOR EACH ROW EXECUTE FUNCTION update_detection_geom();
```

### 3.7 alerts

```sql
CREATE TABLE alerts (
  id                UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  alert_id          VARCHAR(32)   NOT NULL UNIQUE,   -- ALRT-YYYYMMDD-NNNN

  -- Classification
  severity          alert_severity NOT NULL,
  status            alert_status   DEFAULT 'active' NOT NULL,
  threat_type       threat_type,

  -- Position at time of alert
  lat               DOUBLE PRECISION NOT NULL,
  lon               DOUBLE PRECISION NOT NULL,
  alt_m             FLOAT,
  geom              GEOGRAPHY(POINT, 4326),
  position_error_m  FLOAT,
  estimated_radius_m INTEGER       DEFAULT 200,   -- notification radius for mobile push

  -- Confidence
  confidence        FLOAT         CHECK (confidence BETWEEN 0 AND 1),
  contributing_nodes INTEGER,
  detection_method  detection_method,

  -- Track linkage
  track_id          VARCHAR(32)   REFERENCES tracks(track_id),

  -- Alert lifecycle
  triggered_at      TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
  acknowledged_at   TIMESTAMPTZ,
  acknowledged_by   UUID          REFERENCES users(id),
  dismissed_at      TIMESTAMPTZ,
  dismissed_by      UUID          REFERENCES users(id),
  auto_cleared_at   TIMESTAMPTZ,

  -- Escalation
  escalation_due_at TIMESTAMPTZ,   -- when to auto-escalate if not acknowledged
  escalated_at      TIMESTAMPTZ,

  -- Mobile push tracking
  push_sent_count   INTEGER       DEFAULT 0,
  push_target_cells TEXT[],       -- H3 cell IDs that received push

  -- COT
  cot_sent          BOOLEAN       DEFAULT FALSE,
  cot_sent_at       TIMESTAMPTZ,

  -- Notes
  notes             TEXT,

  created_at        TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
  updated_at        TIMESTAMPTZ   DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_alerts_status ON alerts (status) WHERE status = 'active';
CREATE INDEX idx_alerts_severity ON alerts (severity, triggered_at DESC);
CREATE INDEX idx_alerts_track_id ON alerts (track_id);
CREATE INDEX idx_alerts_geom ON alerts USING GIST (geom);
CREATE INDEX idx_alerts_triggered_at ON alerts (triggered_at DESC);
CREATE INDEX idx_alerts_escalation ON alerts (escalation_due_at)
  WHERE status = 'active' AND escalation_due_at IS NOT NULL;

CREATE TRIGGER trg_update_alert_geom
  BEFORE INSERT ON alerts
  FOR EACH ROW EXECUTE FUNCTION update_detection_geom();

CREATE TRIGGER trg_update_alert_updated
  BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
```

### 3.8 calibrations

```sql
CREATE TABLE calibrations (
  id                  UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  node_id             VARCHAR(16)   NOT NULL REFERENCES nodes(node_id),

  status              calibration_status DEFAULT 'pending',

  -- Time sync quality
  ntp_offset_ms       FLOAT,
  gps_time_available  BOOLEAN       DEFAULT FALSE,
  time_quality        VARCHAR(16),  -- 'excellent', 'good', 'acceptable', 'poor'

  -- Acoustic environment
  ambient_noise_db    FLOAT,
  ambient_noise_type  VARCHAR(32),  -- 'urban', 'suburban', 'rural', 'indoor'
  mic_response_profile JSONB,
  -- Schema: {"500hz": 0.95, "800hz": 1.02, "1200hz": 0.98, "2000hz": 0.94}

  -- Reference test
  reference_tone_detected BOOLEAN  DEFAULT FALSE,
  reference_delay_ms  FLOAT,       -- measured propagation delay to reference source

  -- Computed weight
  calibration_weight  FLOAT         CHECK (calibration_weight BETWEEN 0 AND 1),
  expected_accuracy_m FLOAT,

  -- Validity
  valid_from          TIMESTAMPTZ,
  valid_until         TIMESTAMPTZ,  -- typically +30 days

  -- Failure info
  failure_reason      TEXT,

  started_at          TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_calibrations_node_id ON calibrations (node_id, created_at DESC);
CREATE INDEX idx_calibrations_status ON calibrations (status);
CREATE INDEX idx_calibrations_valid ON calibrations (valid_until)
  WHERE status = 'completed';
```

### 3.9 node_health

```sql
CREATE TABLE node_health (
  id                  UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  node_id             VARCHAR(16)   NOT NULL REFERENCES nodes(node_id),

  -- Recorded at
  heartbeat_at        TIMESTAMPTZ   NOT NULL,
  received_at         TIMESTAMPTZ   DEFAULT NOW(),

  -- Device metrics
  battery_percent     SMALLINT      CHECK (battery_percent BETWEEN 0 AND 100),
  battery_charging    BOOLEAN,
  available_storage_mb INTEGER,
  cpu_temp_celsius    FLOAT,        -- optional, Android only
  ram_available_mb    INTEGER,

  -- Sensor quality
  acoustic_snr_db     FLOAT,
  acoustic_enabled    BOOLEAN       DEFAULT TRUE,
  rf_scan_enabled     BOOLEAN       DEFAULT TRUE,
  location_accuracy_m FLOAT,
  gps_fix             BOOLEAN,

  -- Network
  network_type        VARCHAR(10),  -- '5g', '4g', 'wifi', 'mesh', 'offline'
  signal_strength_dbm SMALLINT,
  upload_speed_kbps   INTEGER,      -- last measured
  latency_ms          INTEGER,      -- last measured to backend

  -- Mesh
  mesh_peer_count     SMALLINT      DEFAULT 0,
  lora_connected      BOOLEAN       DEFAULT FALSE,
  ble_peer_count      SMALLINT      DEFAULT 0,

  -- App state
  app_version         VARCHAR(20),
  ml_model_version    VARCHAR(20),
  events_queued       INTEGER       DEFAULT 0,    -- offline queue depth
  events_sent_1h      INTEGER       DEFAULT 0,

  created_at          TIMESTAMPTZ   DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_node_health_node_id ON node_health (node_id, heartbeat_at DESC);
CREATE INDEX idx_node_health_heartbeat_at ON node_health (heartbeat_at DESC);
CREATE INDEX idx_node_health_battery ON node_health (battery_percent)
  WHERE battery_percent < 20;

-- Retain only 7 days of health records (older archived or purged)
-- Implement via pg_cron:
-- SELECT cron.schedule('purge-node-health', '0 2 * * *',
--   'DELETE FROM node_health WHERE heartbeat_at < NOW() - INTERVAL ''7 days''');
```

### 3.10 mesh_topology

```sql
CREATE TABLE mesh_topology (
  id              UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,

  node_a_id       VARCHAR(16)   NOT NULL REFERENCES nodes(node_id),
  node_b_id       VARCHAR(16)   NOT NULL REFERENCES nodes(node_id),
  link_type       mesh_link_type NOT NULL,

  -- Link quality
  rssi_db         SMALLINT,     -- signal strength of link
  snr_db          FLOAT,        -- SNR of link
  link_quality    FLOAT         CHECK (link_quality BETWEEN 0 AND 1),
  hop_count       SMALLINT      DEFAULT 1,

  -- Geometry (line connecting the two nodes)
  geom            GEOGRAPHY(LINESTRING, 4326),

  -- Timestamps
  first_seen_at   TIMESTAMPTZ   DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
  active          BOOLEAN       DEFAULT TRUE,

  created_at      TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ   DEFAULT NOW() NOT NULL,

  UNIQUE (node_a_id, node_b_id, link_type)
);

CREATE INDEX idx_mesh_topology_node_a ON mesh_topology (node_a_id);
CREATE INDEX idx_mesh_topology_node_b ON mesh_topology (node_b_id);
CREATE INDEX idx_mesh_topology_active ON mesh_topology (active) WHERE active = TRUE;
CREATE INDEX idx_mesh_topology_geom ON mesh_topology USING GIST (geom);

-- Trigger to update link geometry when called
CREATE OR REPLACE FUNCTION update_mesh_link_geom()
RETURNS TRIGGER AS $$
DECLARE
  node_a_geom GEOGRAPHY;
  node_b_geom GEOGRAPHY;
BEGIN
  SELECT geom INTO node_a_geom FROM nodes WHERE node_id = NEW.node_a_id;
  SELECT geom INTO node_b_geom FROM nodes WHERE node_id = NEW.node_b_id;
  IF node_a_geom IS NOT NULL AND node_b_geom IS NOT NULL THEN
    NEW.geom = ST_MakeLine(
      node_a_geom::GEOMETRY,
      node_b_geom::GEOMETRY
    )::GEOGRAPHY;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_mesh_link_geom
  BEFORE INSERT OR UPDATE ON mesh_topology
  FOR EACH ROW EXECUTE FUNCTION update_mesh_link_geom();
```

### 3.11 users (C2 Dashboard users)

```sql
-- Note: auth.users is managed by Supabase Auth
-- This table extends auth.users with APEX-SENTINEL specific fields

CREATE TABLE users (
  id              UUID          PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           VARCHAR(255)  NOT NULL UNIQUE,
  display_name    VARCHAR(100),
  role            user_role     DEFAULT 'read_only' NOT NULL,

  -- Unit / organization (no classified info)
  unit_name       VARCHAR(100),
  callsign        VARCHAR(20),

  -- MFA
  mfa_enabled     BOOLEAN       DEFAULT FALSE,
  mfa_required    BOOLEAN       DEFAULT FALSE,  -- set to true for commander+

  -- Session limits
  session_timeout_hours INTEGER  DEFAULT 8,

  -- Geographic access restriction (optional)
  -- NULL = no restriction; otherwise JSON array of H3 cells
  geographic_scope JSONB,

  -- Preferences
  alert_sound     BOOLEAN       DEFAULT TRUE,
  theme           VARCHAR(20)   DEFAULT 'military_dark',
  default_zoom    INTEGER       DEFAULT 12,
  cot_auto_export BOOLEAN       DEFAULT FALSE,

  -- Audit
  last_login_at   TIMESTAMPTZ,
  login_count     INTEGER       DEFAULT 0,
  created_at      TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ   DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_users_role ON users (role);
CREATE INDEX idx_users_email ON users (email);
```

### 3.12 sessions

```sql
CREATE TABLE sessions (
  id              UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Session info
  session_token   VARCHAR(255)  NOT NULL UNIQUE,
  ip_address      INET,
  user_agent      TEXT,

  -- Geographic context
  accessed_from_country VARCHAR(2),  -- ISO 3166-1 alpha-2

  -- Lifecycle
  created_at      TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
  last_active_at  TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
  expires_at      TIMESTAMPTZ   NOT NULL,
  invalidated_at  TIMESTAMPTZ,  -- manual logout or forced expiry

  -- Actions in session
  actions_count   INTEGER       DEFAULT 0,
  alerts_acknowledged INTEGER   DEFAULT 0,
  cot_exports_count   INTEGER   DEFAULT 0
);

CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_sessions_token ON sessions (session_token);
CREATE INDEX idx_sessions_active ON sessions (last_active_at DESC)
  WHERE invalidated_at IS NULL;
```

---

## 4. SUPPORTING TABLES

### 4.1 model_versions

```sql
CREATE TABLE model_versions (
  id              UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  version         VARCHAR(20)   NOT NULL UNIQUE,   -- e.g., '2.1.3'
  platform        node_platform NOT NULL,

  -- File info
  file_name       VARCHAR(255)  NOT NULL,
  file_size_bytes INTEGER       NOT NULL,
  sha256_checksum VARCHAR(64)   NOT NULL,
  download_url    TEXT          NOT NULL,

  -- Model metadata
  model_type      VARCHAR(32),  -- 'acoustic', 'rf', 'fusion'
  framework       VARCHAR(20),  -- 'tflite', 'coreml'
  input_shape     JSONB,
  output_shape    JSONB,

  -- Performance benchmarks
  accuracy_pct    FLOAT,        -- test set accuracy
  recall_pct      FLOAT,        -- true positive rate
  precision_pct   FLOAT,
  f1_score        FLOAT,
  inference_ms_target INTEGER,  -- target inference latency
  test_dataset    VARCHAR(64),  -- dataset used for validation

  -- Deployment
  is_current      BOOLEAN       DEFAULT FALSE,
  is_stable       BOOLEAN       DEFAULT FALSE,
  min_app_version VARCHAR(20),  -- minimum app version required

  -- Rollout
  rollout_percent INTEGER       DEFAULT 0
                  CHECK (rollout_percent BETWEEN 0 AND 100),
  released_at     TIMESTAMPTZ,

  created_at      TIMESTAMPTZ   DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_model_versions_platform ON model_versions (platform, is_current);
CREATE UNIQUE INDEX idx_model_versions_current
  ON model_versions (platform) WHERE is_current = TRUE;
```

### 4.2 audit_log

```sql
CREATE TABLE audit_log (
  id              BIGSERIAL     PRIMARY KEY,
  user_id         UUID          REFERENCES users(id),
  node_id         VARCHAR(16),  -- for node actions
  action          VARCHAR(64)   NOT NULL,
  resource_type   VARCHAR(32),
  resource_id     TEXT,
  old_values      JSONB,
  new_values      JSONB,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ   DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_audit_log_user_id ON audit_log (user_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log (action, created_at DESC);
CREATE INDEX idx_audit_log_resource ON audit_log (resource_type, resource_id);
CREATE INDEX idx_audit_log_created_at ON audit_log (created_at DESC);
```

### 4.3 zone_definitions

```sql
-- Named geographic zones for C2 reference (deployment zones, sectors, etc.)
CREATE TABLE zone_definitions (
  id              UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  name            VARCHAR(100)  NOT NULL,
  zone_type       VARCHAR(32),  -- 'city', 'district', 'sector', 'exclusion'
  geom            GEOGRAPHY(POLYGON, 4326) NOT NULL,
  h3_cells        TEXT[],       -- pre-computed H3 cells at resolution 7

  -- Alert settings for this zone
  alert_radius_m  INTEGER       DEFAULT 2000,
  min_nodes_tdoa  INTEGER       DEFAULT 3,

  active          BOOLEAN       DEFAULT TRUE,
  created_by      UUID          REFERENCES users(id),
  created_at      TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ   DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_zone_definitions_geom ON zone_definitions USING GIST (geom);
CREATE INDEX idx_zone_definitions_active ON zone_definitions (active);
```

---

## 5. REALTIME CONFIGURATION

```sql
-- Enable Realtime for specific tables
-- Run in Supabase Dashboard > Database > Replication

ALTER PUBLICATION supabase_realtime ADD TABLE tracks;
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE nodes;
ALTER PUBLICATION supabase_realtime ADD TABLE detection_events;

-- Realtime channels are defined in application code:
-- Channel: 'alerts:{h3_cell}'  — for geographic alert delivery to mobile
-- Channel: 'tracks:global'     — for C2 dashboard track updates
-- Channel: 'nodes:health'      — for C2 admin node monitoring
-- Channel: 'calibration:global' — for calibration pulse broadcast
```

---

## 6. ROW LEVEL SECURITY (RLS) POLICIES

```sql
-- Enable RLS on all tables
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE detection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE acoustic_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_topology ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- =============================================
-- NODES TABLE
-- =============================================

-- Service role: full access (for Edge Functions)
CREATE POLICY "Service role has full access to nodes"
  ON nodes FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- Sensor node: can only see and update its own record
CREATE POLICY "Node can read own record"
  ON nodes FOR SELECT
  TO authenticated
  USING (
    node_id = (
      SELECT node_id FROM nodes n2
      WHERE n2.hashed_device_id = auth.jwt() ->> 'hashed_device_id'
      LIMIT 1
    )
  );

CREATE POLICY "Node can update own record"
  ON nodes FOR UPDATE
  TO authenticated
  USING (
    node_id = (
      SELECT node_id FROM nodes n2
      WHERE n2.hashed_device_id = auth.jwt() ->> 'hashed_device_id'
      LIMIT 1
    )
  );

-- C2 users can read all nodes
CREATE POLICY "C2 users can read all nodes"
  ON nodes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('super_admin', 'c2_commander', 'c2_operator', 'analyst', 'civil_coordinator', 'read_only')
    )
  );

-- Admin can manage all nodes
CREATE POLICY "Admin can manage all nodes"
  ON nodes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('super_admin', 'c2_commander')
    )
  );

-- =============================================
-- DETECTION EVENTS TABLE
-- =============================================

CREATE POLICY "Service role full access to detection_events"
  ON detection_events FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- Nodes can insert their own detection events
CREATE POLICY "Node can insert own detection events"
  ON detection_events FOR INSERT
  TO authenticated
  WITH CHECK (
    node_id = (
      SELECT n.node_id FROM nodes n
      WHERE n.hashed_device_id = auth.jwt() ->> 'hashed_device_id'
      LIMIT 1
    )
  );

-- Nodes can read their own detection events
CREATE POLICY "Node can read own detection events"
  ON detection_events FOR SELECT
  TO authenticated
  USING (
    node_id = (
      SELECT n.node_id FROM nodes n
      WHERE n.hashed_device_id = auth.jwt() ->> 'hashed_device_id'
      LIMIT 1
    )
  );

-- C2 operators and analysts can read all detection events
CREATE POLICY "C2 can read all detection events"
  ON detection_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('super_admin', 'c2_commander', 'c2_operator', 'analyst')
    )
  );

-- =============================================
-- TRACKS TABLE
-- =============================================

CREATE POLICY "Service role full access to tracks"
  ON tracks FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- All authenticated users can read tracks
CREATE POLICY "Authenticated users can read tracks"
  ON tracks FOR SELECT
  TO authenticated
  USING (auth.role() = 'authenticated');

-- Only service role (Edge Functions) can insert/update tracks
-- (no direct client write to tracks)

-- =============================================
-- ALERTS TABLE
-- =============================================

CREATE POLICY "Service role full access to alerts"
  ON alerts FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- All authenticated users can read alerts
CREATE POLICY "Authenticated users can read alerts"
  ON alerts FOR SELECT
  TO authenticated
  USING (auth.role() = 'authenticated');

-- C2 operators can acknowledge/dismiss alerts
CREATE POLICY "C2 operator can update alert status"
  ON alerts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('super_admin', 'c2_commander', 'c2_operator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('super_admin', 'c2_commander', 'c2_operator')
    )
  );

-- =============================================
-- USERS TABLE
-- =============================================

CREATE POLICY "Users can read own profile"
  ON users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admin can manage users"
  ON users FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('super_admin', 'c2_commander')
    )
  );

-- =============================================
-- NODE HEALTH TABLE
-- =============================================

CREATE POLICY "Service role full access to node_health"
  ON node_health FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY "Node can insert own health"
  ON node_health FOR INSERT
  TO authenticated
  WITH CHECK (
    node_id = (
      SELECT n.node_id FROM nodes n
      WHERE n.hashed_device_id = auth.jwt() ->> 'hashed_device_id'
      LIMIT 1
    )
  );

CREATE POLICY "Admin can read all node health"
  ON node_health FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('super_admin', 'c2_commander', 'c2_operator')
    )
  );

-- =============================================
-- MODEL VERSIONS — PUBLIC READ
-- =============================================

CREATE POLICY "Anyone authenticated can read model versions"
  ON model_versions FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Admin can manage model versions"
  ON model_versions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

-- =============================================
-- AUDIT LOG — APPEND ONLY VIA SERVICE ROLE
-- =============================================

CREATE POLICY "Service role can insert audit log"
  ON audit_log FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

CREATE POLICY "Admin can read audit log"
  ON audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role = 'super_admin'
    )
  );
```

---

## 7. VIEWS

```sql
-- Active threat summary view
CREATE OR REPLACE VIEW v_active_threats AS
SELECT
  t.track_id,
  t.state,
  t.threat_type,
  t.confidence,
  t.current_lat,
  t.current_lon,
  t.current_alt_m,
  t.heading_deg,
  t.speed_ms,
  t.position_error_m,
  t.contributing_nodes,
  t.last_detection_at,
  a.alert_id,
  a.severity AS alert_severity,
  a.status AS alert_status,
  EXTRACT(EPOCH FROM (NOW() - t.last_detection_at)) AS seconds_since_last_detection
FROM tracks t
LEFT JOIN alerts a ON a.track_id = t.track_id AND a.status = 'active'
WHERE t.state IN ('tracking', 'confirmed')
ORDER BY t.confidence DESC;

-- Node fleet summary view
CREATE OR REPLACE VIEW v_node_fleet_summary AS
SELECT
  COUNT(*) FILTER (WHERE status = 'online') AS online_count,
  COUNT(*) FILTER (WHERE status = 'mesh_only') AS mesh_only_count,
  COUNT(*) FILTER (WHERE status = 'degraded') AS degraded_count,
  COUNT(*) FILTER (WHERE status = 'offline') AS offline_count,
  COUNT(*) FILTER (WHERE battery_percent < 20 AND status != 'offline') AS low_battery_count,
  AVG(battery_percent) FILTER (WHERE status != 'offline') AS avg_battery_pct,
  COUNT(*) AS total_registered,
  COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '5 minutes') AS active_last_5m
FROM nodes
WHERE deleted_at IS NULL;

-- Detection rate per zone (last 1 hour)
CREATE OR REPLACE VIEW v_detection_rate_by_zone AS
SELECT
  h3_cell_r7,
  COUNT(*) AS event_count,
  AVG(fused_confidence) AS avg_confidence,
  MAX(fused_confidence) AS max_confidence,
  COUNT(DISTINCT node_id) AS unique_nodes
FROM detection_events
WHERE received_at > NOW() - INTERVAL '1 hour'
  AND fused_confidence > 0.35
GROUP BY h3_cell_r7
ORDER BY event_count DESC;
```

---

## 8. FUNCTIONS

```sql
-- Find qualifying detection events for triangulation
CREATE OR REPLACE FUNCTION find_triangulation_candidates(
  p_h3_cell VARCHAR(16),
  p_window_seconds INTEGER DEFAULT 5,
  p_min_confidence FLOAT DEFAULT 0.35
)
RETURNS TABLE (
  node_id VARCHAR(16),
  detected_at TIMESTAMPTZ,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  acoustic_confidence FLOAT,
  calibration_weight FLOAT,
  ntp_offset_ms FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (de.node_id)
    de.node_id,
    de.detected_at,
    de.latitude,
    de.longitude,
    de.acoustic_confidence,
    COALESCE(n.calibration_weight, 1.0) AS calibration_weight,
    de.ntp_offset_ms
  FROM detection_events de
  JOIN nodes n ON n.node_id = de.node_id
  WHERE de.h3_cell_r7 = p_h3_cell
    AND de.detected_at > NOW() - (p_window_seconds || ' seconds')::INTERVAL
    AND de.acoustic_confidence > p_min_confidence
    AND de.adsb_suppressed = FALSE
    AND n.status != 'offline'
  ORDER BY de.node_id, de.detected_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Get nodes within radius for alert targeting
CREATE OR REPLACE FUNCTION get_nodes_in_radius(
  p_lat DOUBLE PRECISION,
  p_lon DOUBLE PRECISION,
  p_radius_m INTEGER
)
RETURNS TABLE (node_id VARCHAR(16), distance_m FLOAT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.node_id,
    ST_Distance(
      n.geom,
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::GEOGRAPHY
    ) AS distance_m
  FROM nodes n
  WHERE n.status IN ('online', 'mesh_only', 'degraded')
    AND n.deleted_at IS NULL
    AND ST_DWithin(
      n.geom,
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::GEOGRAPHY,
      p_radius_m
    )
  ORDER BY distance_m ASC;
END;
$$ LANGUAGE plpgsql;
```

---

## 9. MAINTENANCE & RETENTION

```sql
-- pg_cron scheduled jobs (configure in Supabase dashboard)

-- Purge old detection events (keep 72h active, 30 days cold)
-- Cold storage: move to cold_detection_events table or S3 via pg_cron + edge function

-- Purge node health older than 7 days
SELECT cron.schedule(
  'purge-node-health',
  '0 3 * * *',
  $$DELETE FROM node_health WHERE heartbeat_at < NOW() - INTERVAL '7 days'$$
);

-- Mark nodes as offline if no heartbeat for 5 minutes
SELECT cron.schedule(
  'mark-nodes-offline',
  '*/2 * * * *',
  $$UPDATE nodes SET status = 'offline'
    WHERE last_seen_at < NOW() - INTERVAL '5 minutes'
    AND status != 'offline'$$
);

-- Terminate old lost tracks
SELECT cron.schedule(
  'terminate-lost-tracks',
  '*/5 * * * *',
  $$UPDATE tracks SET state = 'terminated', terminated_at = NOW()
    WHERE state = 'lost'
    AND lost_at < NOW() - INTERVAL '5 minutes'$$
);

-- Deactivate stale mesh links
SELECT cron.schedule(
  'deactivate-stale-mesh-links',
  '*/10 * * * *',
  $$UPDATE mesh_topology SET active = FALSE
    WHERE last_seen_at < NOW() - INTERVAL '10 minutes'
    AND active = TRUE$$
);

-- Auto-clear resolved alerts
SELECT cron.schedule(
  'auto-clear-alerts',
  '*/1 * * * *',
  $$UPDATE alerts SET status = 'auto_cleared', auto_cleared_at = NOW()
    WHERE status = 'active'
    AND track_id IN (
      SELECT track_id FROM tracks
      WHERE state IN ('lost', 'terminated')
    )$$
);
```

---

## 10. VERSION HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-03-24 | APEX-SENTINEL Team | Initial schema |

---

*End of DATABASE_SCHEMA.md — APEX-SENTINEL W1*
