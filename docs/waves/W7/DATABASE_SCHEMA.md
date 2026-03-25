# APEX-SENTINEL — DATABASE_SCHEMA.md
## Wave 7: Hardware Integration Layer + Data Pipeline Rectification + Terminal Phase Detection
### Wave 7 | Project: APEX-SENTINEL | Version: 7.0.0
### Date: 2026-03-25 | Status: APPROVED
### Supabase: bymfcnwfyxuivinuzurr (eu-west-2 London)
### Migration: 20260325100000_w7_hardware_integration.sql

---

## 1. SCHEMA CHANGES OVERVIEW

| Change | Type | Purpose |
|---|---|---|
| `hardware_nodes` | CREATE TABLE | Registered hardware nodes (acoustic, PTZ, jammer, SkyNet, mobile) |
| `jammer_events` | CREATE TABLE | Jammer activation/deactivation audit trail |
| `skynet_activations` | CREATE TABLE | SkyNet pre-position and fire command log |
| `terminal_phase_events` | CREATE TABLE | TerminalPhaseDetector FSM state transitions |
| `bearing_reports` | CREATE TABLE | Mobile node bearing submissions for triangulation |
| `tracks.drone_type` | ALTER TABLE | Expand CHECK to include gerbera, shahed-131, shahed-238 |
| `acoustic_detections.sample_rate_hz` | ALTER TABLE | Record which sample rate produced the detection |
| `node_health_log.firmware_version` | ALTER TABLE | Track W6/W7 firmware version per node |

---

## 2. MIGRATION SQL

```sql
-- ============================================================
-- APEX-SENTINEL W7: Hardware Integration Schema
-- Migration: 20260325100000_w7_hardware_integration
-- Supabase project: bymfcnwfyxuivinuzurr (eu-west-2)
-- ============================================================

BEGIN;

-- ============================================================
-- 2.1 hardware_nodes
-- Central registry of all physical hardware in the deployment
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hardware_nodes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id           TEXT UNIQUE NOT NULL,   -- e.g. 'alpha-01', 'ptz-main', 'jammer-01'
  node_type         TEXT NOT NULL
    CHECK (node_type IN ('acoustic', 'ptz', 'radar', 'jammer', 'skynet', 'mobile')),
  display_name      TEXT NOT NULL,
  lat               DOUBLE PRECISION NOT NULL
    CHECK (lat >= -90.0 AND lat <= 90.0),
  lng               DOUBLE PRECISION NOT NULL
    CHECK (lng >= -180.0 AND lng <= 180.0),
  alt_m             DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  capabilities      JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- e.g. ["16kHz", "tflite_inference", "elrs_monitor", "onvif_s", "gps_1575"]
  hardware_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- node_type-specific config, e.g.:
  -- acoustic: { "sample_rate_hz": 16000, "mic_model": "BOYA_BY-MM1" }
  -- ptz: { "onvif_url": "http://192.168.1.100/onvif/device_service", "pan_range_deg": 360 }
  -- jammer: { "frequencies_mhz": [902, 928], "max_power_dbm": 30 }
  -- skynet: { "net_speed_ms": 35, "max_range_m": 200, "net_radius_m": 5 }
  firmware_version  TEXT,
  ip_address        TEXT,
  online            BOOLEAN NOT NULL DEFAULT false,
  last_heartbeat    TIMESTAMPTZ,
  registered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  registered_by     TEXT,          -- operator who registered the node
  notes             TEXT,
  site_id           TEXT,          -- logical deployment site grouping
  deployment_id     UUID,          -- links to a deployment session

  CONSTRAINT hardware_nodes_node_id_format
    CHECK (node_id ~ '^[a-z0-9][a-z0-9\-]{1,62}[a-z0-9]$')
);

-- Indexes
CREATE INDEX IF NOT EXISTS hardware_nodes_type_idx
  ON public.hardware_nodes(node_type);
CREATE INDEX IF NOT EXISTS hardware_nodes_site_idx
  ON public.hardware_nodes(site_id) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hardware_nodes_online_idx
  ON public.hardware_nodes(online) WHERE online = true;

-- RLS
ALTER TABLE public.hardware_nodes ENABLE ROW LEVEL SECURITY;

-- Service role: full access (pipeline registration)
CREATE POLICY hardware_nodes_service_all
  ON public.hardware_nodes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated: read-only
CREATE POLICY hardware_nodes_authenticated_read
  ON public.hardware_nodes
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 2.2 jammer_events
-- Audit trail for every jammer activation and deactivation.
-- Legal requirement: must be non-repudiable and immutable.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.jammer_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type        TEXT NOT NULL
    CHECK (event_type IN ('ACTIVATE', 'DEACTIVATE', 'FAULT', 'DUTY_CYCLE_LIMIT')),
  jammer_node_id    TEXT NOT NULL
    REFERENCES public.hardware_nodes(node_id) ON DELETE RESTRICT,
  track_id          UUID,           -- NULL for manual activations
  drone_class       TEXT            -- classification that triggered activation
    CHECK (drone_class IN ('shahed-136', 'shahed-131', 'shahed-238', 'gerbera', 'fpv', 'lancet', 'unknown', NULL)),
  frequency_mhz     DOUBLE PRECISION NOT NULL,  -- center frequency jammed
  bandwidth_mhz     DOUBLE PRECISION,           -- jamming bandwidth
  power_dbm         DOUBLE PRECISION,
  direction_deg     DOUBLE PRECISION,           -- NULL = omnidirectional
  authorization     TEXT NOT NULL,              -- 'AUTO' or operator_id
  authorization_policy TEXT NOT NULL
    CHECK (authorization_policy IN ('AUTO', 'CONFIRM', 'FULL_AUTO')),
  duration_s        DOUBLE PRECISION,           -- NULL until DEACTIVATE event
  deactivation_reason TEXT
    CHECK (deactivation_reason IN (
      'track_lost', 'impact_confirmed', 'duty_cycle_limit',
      'manual_override', 'hardware_fault', NULL
    )),
  hardware_ack      BOOLEAN NOT NULL DEFAULT false,  -- jammer hardware confirmed active
  hardware_ack_latency_ms INTEGER,                   -- ms from command to ACK
  t_command_unix_ms BIGINT NOT NULL,   -- when command was issued
  t_active_unix_ms  BIGINT,            -- when hardware confirmed active
  t_deactive_unix_ms BIGINT,           -- when deactivated (NULL if still active)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  nats_message_id   TEXT,              -- NATS message ID for correlation

  -- Prevent UPDATE: jammer events are immutable (legal audit requirement)
  CONSTRAINT jammer_events_no_backdating
    CHECK (t_command_unix_ms <= EXTRACT(EPOCH FROM now()) * 1000 + 5000)  -- max 5s future
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS jammer_events_track_idx
  ON public.jammer_events(track_id) WHERE track_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS jammer_events_time_idx
  ON public.jammer_events(t_command_unix_ms DESC);
CREATE INDEX IF NOT EXISTS jammer_events_node_idx
  ON public.jammer_events(jammer_node_id);
CREATE INDEX IF NOT EXISTS jammer_events_active_idx
  ON public.jammer_events(jammer_node_id)
  WHERE event_type = 'ACTIVATE' AND t_deactive_unix_ms IS NULL;

-- RLS
ALTER TABLE public.jammer_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY jammer_events_service_insert
  ON public.jammer_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY jammer_events_service_select
  ON public.jammer_events
  FOR SELECT
  TO service_role
  USING (true);

-- NO UPDATE or DELETE policy — immutable audit trail
-- Authenticated users can read
CREATE POLICY jammer_events_authenticated_read
  ON public.jammer_events
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 2.3 skynet_activations
-- SkyNet net-gun pre-position and fire command log.
-- Engagement audit trail — 30 day retention minimum.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.skynet_activations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activation_type   TEXT NOT NULL
    CHECK (activation_type IN ('PREPOSITION', 'FIRE', 'ABORT', 'RESET')),
  skynet_node_id    TEXT NOT NULL
    REFERENCES public.hardware_nodes(node_id) ON DELETE RESTRICT,
  track_id          UUID,
  drone_class       TEXT,
  intercept_lat     DOUBLE PRECISION,
  intercept_lng     DOUBLE PRECISION,
  intercept_alt_m   DOUBLE PRECISION,
  intercept_range_m DOUBLE PRECISION,       -- range from SkyNet to intercept point
  monte_carlo_confidence DOUBLE PRECISION   -- P(intercept) from MonteCarlo
    CHECK (monte_carlo_confidence >= 0.0 AND monte_carlo_confidence <= 1.0),
  position_uncertainty_m DOUBLE PRECISION,  -- 1σ from BearingTriangulator/TdoaSolver
  t_fire_scheduled_unix_ms BIGINT,          -- when fire was scheduled
  t_command_unix_ms BIGINT NOT NULL,
  t_hardware_ack_unix_ms BIGINT,
  authorization     TEXT NOT NULL,
  authorization_policy TEXT NOT NULL
    CHECK (authorization_policy IN ('CONFIRM', 'FULL_AUTO')),
  -- Safety interlock evaluation results
  safety_alt_ok     BOOLEAN,    -- alt > 5m
  safety_pos_ok     BOOLEAN,    -- position uncertainty < 30m
  safety_friendly_ok BOOLEAN,   -- no friendly within 50m
  safety_all_clear  BOOLEAN GENERATED ALWAYS AS (
    safety_alt_ok AND safety_pos_ok AND safety_friendly_ok
  ) STORED,
  outcome           TEXT
    CHECK (outcome IN ('fired', 'missed', 'aborted_safety', 'aborted_manual',
                       'hardware_fault', 'pending', NULL)),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS skynet_track_idx
  ON public.skynet_activations(track_id) WHERE track_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS skynet_time_idx
  ON public.skynet_activations(t_command_unix_ms DESC);
CREATE INDEX IF NOT EXISTS skynet_type_idx
  ON public.skynet_activations(activation_type);

-- RLS
ALTER TABLE public.skynet_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY skynet_service_all
  ON public.skynet_activations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY skynet_authenticated_read
  ON public.skynet_activations
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 2.4 terminal_phase_events
-- Every FSM state transition for TerminalPhaseDetector.
-- Primary debug and performance analysis source.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.terminal_phase_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id          UUID NOT NULL,
  previous_state    TEXT NOT NULL
    CHECK (previous_state IN ('CRUISE', 'ALERT', 'TERMINAL', 'IMPACT')),
  new_state         TEXT NOT NULL
    CHECK (new_state IN ('CRUISE', 'ALERT', 'TERMINAL', 'IMPACT')),
  drone_class       TEXT,
  -- Indicator values at time of transition
  speed_increase_triggered  BOOLEAN NOT NULL DEFAULT false,
  course_correction_triggered BOOLEAN NOT NULL DEFAULT false,
  altitude_descent_triggered BOOLEAN NOT NULL DEFAULT false,
  rf_silence_triggered      BOOLEAN NOT NULL DEFAULT false,
  -- Raw indicator values
  speed_ekf_ms      DOUBLE PRECISION,  -- EKF speed m/s
  speed_baseline_ms DOUBLE PRECISION,  -- 30s rolling average
  heading_rate_degs DOUBLE PRECISION,  -- |dΨ/dt| °/s
  altitude_rate_ms  DOUBLE PRECISION,  -- dz/dt m/s (negative = descending)
  elrs_rssi_dbm     DOUBLE PRECISION,
  elrs_packet_rate_hz DOUBLE PRECISION,
  -- Composite
  indicators_triggered_count INTEGER NOT NULL,
  overall_confidence DOUBLE PRECISION,
  t_unix_ms         BIGINT NOT NULL,
  -- Latency tracking
  ekf_to_detector_ms INTEGER,   -- time from EKF update to FSM evaluation
  detector_to_nats_ms INTEGER,  -- time from FSM decision to NATS publish
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS terminal_track_idx
  ON public.terminal_phase_events(track_id);
CREATE INDEX IF NOT EXISTS terminal_time_idx
  ON public.terminal_phase_events(t_unix_ms DESC);
CREATE INDEX IF NOT EXISTS terminal_state_idx
  ON public.terminal_phase_events(new_state)
  WHERE new_state = 'TERMINAL';

-- RLS
ALTER TABLE public.terminal_phase_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY terminal_service_all
  ON public.terminal_phase_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY terminal_authenticated_read
  ON public.terminal_phase_events
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 2.5 bearing_reports
-- Mobile node bearing submissions for BearingTriangulator.
-- High-volume: expect 1–10 reports/second per active mobile node.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bearing_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id           TEXT NOT NULL,   -- mobile node identifier (not FK — mobile nodes are transient)
  lat               DOUBLE PRECISION NOT NULL,
  lng               DOUBLE PRECISION NOT NULL,
  bearing_deg       DOUBLE PRECISION NOT NULL
    CHECK (bearing_deg >= 0.0 AND bearing_deg < 360.0),
  uncertainty_deg   DOUBLE PRECISION NOT NULL
    CHECK (uncertainty_deg > 0.0 AND uncertainty_deg <= 180.0),
  acoustic_confidence DOUBLE PRECISION NOT NULL
    CHECK (acoustic_confidence >= 0.0 AND acoustic_confidence <= 1.0),
  drone_class_hint  TEXT,    -- local inference result on phone
  compass_calibrated BOOLEAN NOT NULL DEFAULT false,
  gps_accuracy_m    DOUBLE PRECISION,   -- reported by Android Location API
  t_unix_ms         BIGINT NOT NULL,    -- when bearing was observed (not when submitted)
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Result linkage
  used_in_fix       BOOLEAN NOT NULL DEFAULT false,  -- included in a triangulation solve
  fix_lat           DOUBLE PRECISION,   -- resulting fix position (denormalized for audit)
  fix_lng           DOUBLE PRECISION,
  fix_uncertainty_m DOUBLE PRECISION
);

-- Partition by time (high volume) — use monthly partitions
-- For simplicity in W7, use a retention-based cleanup job instead:
CREATE INDEX IF NOT EXISTS bearing_reports_node_time_idx
  ON public.bearing_reports(node_id, t_unix_ms DESC);
CREATE INDEX IF NOT EXISTS bearing_reports_time_idx
  ON public.bearing_reports(t_unix_ms DESC);
CREATE INDEX IF NOT EXISTS bearing_reports_unused_idx
  ON public.bearing_reports(used_in_fix) WHERE used_in_fix = false;

-- Automatic cleanup: delete bearing_reports older than 24h (high volume, short audit window)
-- Implemented via pg_cron or periodic DELETE in pipeline

-- RLS
ALTER TABLE public.bearing_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY bearing_reports_service_all
  ON public.bearing_reports
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY bearing_reports_authenticated_read
  ON public.bearing_reports
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 2.6 ALTER TABLE tracks — expand drone_type CHECK constraint
-- W6 had: CHECK (drone_type IN ('shahed', 'lancet', 'fpv', 'unknown'))
-- W7: add gerbera, shahed-131, shahed-238 and use canonical names
-- ============================================================

-- Drop old constraint
ALTER TABLE public.tracks
  DROP CONSTRAINT IF EXISTS tracks_drone_type_check;

-- Re-add expanded constraint with canonical names
ALTER TABLE public.tracks
  ADD CONSTRAINT tracks_drone_type_check
  CHECK (drone_type IN (
    'shahed-136',
    'shahed-131',
    'shahed-238',
    'gerbera',
    'lancet',
    'fpv',
    'helicopter',
    'fixed-wing',
    'unknown'
  ));

-- Add terminal phase column to tracks
ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS terminal_phase_state TEXT
    CHECK (terminal_phase_state IN ('CRUISE', 'ALERT', 'TERMINAL', 'IMPACT', NULL))
    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS terminal_phase_detected_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS jammer_active BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS skynet_engaged BOOLEAN DEFAULT false;

-- ============================================================
-- 2.7 ALTER TABLE acoustic_detections — add sample_rate_hz
-- Track which sample rate generated each detection (migration audit)
-- ============================================================

ALTER TABLE public.acoustic_detections
  ADD COLUMN IF NOT EXISTS sample_rate_hz INTEGER
    CHECK (sample_rate_hz IN (16000, 22050))
    DEFAULT 22050;  -- default to 22050 for existing W6 rows

-- Index for migration audit: identify how many rows used old rate
CREATE INDEX IF NOT EXISTS acoustic_detections_sample_rate_idx
  ON public.acoustic_detections(sample_rate_hz);

-- ============================================================
-- 2.8 ALTER TABLE node_health_log — add firmware_version
-- ============================================================

ALTER TABLE public.node_health_log
  ADD COLUMN IF NOT EXISTS firmware_version TEXT,
  ADD COLUMN IF NOT EXISTS sample_rate_hz INTEGER
    CHECK (sample_rate_hz IN (16000, 22050));

-- ============================================================
-- 2.9 VIEWS for dashboard queries
-- ============================================================

-- Active threat summary (for dashboard map)
CREATE OR REPLACE VIEW public.v_active_threats AS
SELECT
  t.id AS track_id,
  t.drone_type,
  t.acoustic_confidence,
  t.terminal_phase_state,
  t.terminal_phase_detected_at,
  t.jammer_active,
  t.skynet_engaged,
  t.last_lat,
  t.last_lng,
  t.last_seen_at,
  EXTRACT(EPOCH FROM (now() - t.last_seen_at)) AS age_seconds,
  -- Latest terminal event summary
  tpe.indicators_triggered_count,
  tpe.speed_increase_triggered,
  tpe.course_correction_triggered,
  tpe.altitude_descent_triggered,
  tpe.rf_silence_triggered,
  -- Active jammer
  je.jammer_node_id,
  je.frequency_mhz AS jammer_freq_mhz,
  EXTRACT(EPOCH FROM (now() - to_timestamp(je.t_command_unix_ms / 1000.0))) AS jammer_active_s
FROM public.tracks t
LEFT JOIN LATERAL (
  SELECT * FROM public.terminal_phase_events
  WHERE track_id = t.id
  ORDER BY t_unix_ms DESC
  LIMIT 1
) tpe ON true
LEFT JOIN LATERAL (
  SELECT * FROM public.jammer_events
  WHERE track_id = t.id
    AND event_type = 'ACTIVATE'
    AND t_deactive_unix_ms IS NULL
  ORDER BY t_command_unix_ms DESC
  LIMIT 1
) je ON true
WHERE t.last_seen_at > now() - INTERVAL '60 seconds';

-- Hardware node status (for dashboard node panel)
CREATE OR REPLACE VIEW public.v_hardware_status AS
SELECT
  hn.node_id,
  hn.node_type,
  hn.display_name,
  hn.lat,
  hn.lng,
  hn.alt_m,
  hn.online,
  hn.firmware_version,
  hn.last_heartbeat,
  EXTRACT(EPOCH FROM (now() - hn.last_heartbeat)) AS heartbeat_age_s,
  hn.hardware_config,
  -- Latest jammer state for jammer nodes
  CASE WHEN hn.node_type = 'jammer' THEN (
    SELECT event_type FROM public.jammer_events
    WHERE jammer_node_id = hn.node_id
    ORDER BY t_command_unix_ms DESC
    LIMIT 1
  ) END AS jammer_last_event,
  -- SkyNet last action for skynet nodes
  CASE WHEN hn.node_type = 'skynet' THEN (
    SELECT activation_type FROM public.skynet_activations
    WHERE skynet_node_id = hn.node_id
    ORDER BY t_command_unix_ms DESC
    LIMIT 1
  ) END AS skynet_last_action
FROM public.hardware_nodes hn;

-- ============================================================
-- 2.10 FUNCTIONS
-- ============================================================

-- Bearing triangulation result recorder
CREATE OR REPLACE FUNCTION public.record_bearing_fix(
  p_report_ids UUID[],
  p_fix_lat DOUBLE PRECISION,
  p_fix_lng DOUBLE PRECISION,
  p_fix_uncertainty_m DOUBLE PRECISION
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.bearing_reports
  SET
    used_in_fix = true,
    fix_lat = p_fix_lat,
    fix_lng = p_fix_lng,
    fix_uncertainty_m = p_fix_uncertainty_m
  WHERE id = ANY(p_report_ids);
END;
$$;

-- Jammer duty cycle check (enforces 120s max active duration)
CREATE OR REPLACE FUNCTION public.check_jammer_duty_cycle(
  p_jammer_node_id TEXT,
  p_window_seconds INTEGER DEFAULT 300
) RETURNS TABLE (
  total_active_s DOUBLE PRECISION,
  is_over_limit BOOLEAN,
  limit_s INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total DOUBLE PRECISION;
BEGIN
  SELECT COALESCE(SUM(
    CASE
      WHEN t_deactive_unix_ms IS NOT NULL
      THEN (t_deactive_unix_ms - t_command_unix_ms) / 1000.0
      ELSE EXTRACT(EPOCH FROM now()) - t_command_unix_ms / 1000.0
    END
  ), 0)
  INTO v_total
  FROM public.jammer_events
  WHERE jammer_node_id = p_jammer_node_id
    AND event_type = 'ACTIVATE'
    AND t_command_unix_ms > (EXTRACT(EPOCH FROM now()) - p_window_seconds) * 1000;

  RETURN QUERY SELECT v_total, v_total > 120.0, 120;
END;
$$;

-- ============================================================
-- COMMIT
-- ============================================================
COMMIT;
```

---

## 3. TABLE RELATIONSHIP DIAGRAM

```
hardware_nodes (node_id PK)
    │
    ├──< jammer_events (jammer_node_id → node_id)
    │         │
    │         └── track_id → tracks.id (optional)
    │
    ├──< skynet_activations (skynet_node_id → node_id)
    │         │
    │         └── track_id → tracks.id (optional)
    │
    └── (mobile nodes are NOT in hardware_nodes — transient)
         └──< bearing_reports (node_id TEXT, no FK)

tracks.id (PK, existing W1)
    │
    ├──< terminal_phase_events (track_id → tracks.id)
    ├──< jammer_events (track_id → tracks.id, optional)
    ├──< skynet_activations (track_id → tracks.id, optional)
    └──< acoustic_detections (existing W6, track_id → tracks.id)
```

---

## 4. DATA VOLUMES AND RETENTION

| Table | Write Rate | Retention | Size/Day |
|---|---|---|---|
| `hardware_nodes` | Low (config changes only) | Permanent | < 1MB |
| `jammer_events` | ~10/day operational | 365 days (legal audit) | < 1MB/day |
| `skynet_activations` | ~5/day operational | 365 days (legal audit) | < 1MB/day |
| `terminal_phase_events` | ~100/hour (track lifecycle) | 90 days | ~5MB/day |
| `bearing_reports` | ~360/hour (3 nodes × 2 Hz) | 24 hours (high volume) | ~50MB/day |
| `acoustic_detections` | ~3600/hour (existing W6) | 30 days (existing) | ~200MB/day |

`bearing_reports` is the highest-volume table. A pg_cron job runs at 00:00 UTC to delete rows older than 24h. If pg_cron is unavailable, the pipeline periodically issues:

```sql
DELETE FROM public.bearing_reports
WHERE submitted_at < now() - INTERVAL '24 hours';
```

---

## 5. RLS SUMMARY

| Table | anon | authenticated | service_role |
|---|---|---|---|
| `hardware_nodes` | NONE | SELECT | ALL |
| `jammer_events` | NONE | SELECT | INSERT + SELECT (no UPDATE/DELETE) |
| `skynet_activations` | NONE | SELECT | ALL |
| `terminal_phase_events` | NONE | SELECT | ALL |
| `bearing_reports` | NONE | SELECT | ALL |

Immutability enforcement: `jammer_events` has no UPDATE or DELETE policy for any role. The audit trail cannot be modified once written, even by service_role. This is enforced at the RLS policy layer (no UPDATE/DELETE policies exist). An additional Postgres trigger should be added post-W7 to enforce this at the trigger level.

---

## 6. MIGRATION ROLLBACK PLAN

If W7 schema migration needs rollback:

```sql
-- W7 rollback (run in order)
BEGIN;

-- Remove new W7 tables
DROP TABLE IF EXISTS public.bearing_reports CASCADE;
DROP TABLE IF EXISTS public.terminal_phase_events CASCADE;
DROP TABLE IF EXISTS public.skynet_activations CASCADE;
DROP TABLE IF EXISTS public.jammer_events CASCADE;
DROP TABLE IF EXISTS public.hardware_nodes CASCADE;

-- Remove views
DROP VIEW IF EXISTS public.v_active_threats;
DROP VIEW IF EXISTS public.v_hardware_status;

-- Remove functions
DROP FUNCTION IF EXISTS public.record_bearing_fix;
DROP FUNCTION IF EXISTS public.check_jammer_duty_cycle;

-- Revert tracks.drone_type constraint to W6 version
ALTER TABLE public.tracks DROP CONSTRAINT IF EXISTS tracks_drone_type_check;
ALTER TABLE public.tracks ADD CONSTRAINT tracks_drone_type_check
  CHECK (drone_type IN ('shahed', 'lancet', 'fpv', 'unknown'));

-- Remove W7-added columns from tracks
ALTER TABLE public.tracks
  DROP COLUMN IF EXISTS terminal_phase_state,
  DROP COLUMN IF EXISTS terminal_phase_detected_at,
  DROP COLUMN IF EXISTS jammer_active,
  DROP COLUMN IF EXISTS skynet_engaged;

-- Remove W7-added columns from acoustic_detections
ALTER TABLE public.acoustic_detections
  DROP COLUMN IF EXISTS sample_rate_hz;

-- Remove W7-added columns from node_health_log
ALTER TABLE public.node_health_log
  DROP COLUMN IF EXISTS firmware_version,
  DROP COLUMN IF EXISTS sample_rate_hz;

COMMIT;
```

Rollback is safe: W6 data is unaffected. The expanded `tracks.drone_type` CHECK constraint rollback will fail if any W7-only drone types (shahed-131, shahed-238, gerbera) exist in the table — in that case, update those rows to 'unknown' first.
