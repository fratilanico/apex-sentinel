# APEX-SENTINEL — DATABASE_SCHEMA.md
## W4 Database Schema — C2 Dashboard Additions
### Wave 4 | Project: APEX-SENTINEL | Version: 4.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. OVERVIEW

Supabase project: `bymfcnwfyxuivinuzurr` (eu-west-2)

W4 adds dashboard-specific tables on top of the W1-W3 schema:
- `dashboard_sessions` — tracks active operator sessions and last activity
- `operator_notes` — free-text annotations by operators on tracks/alerts
- `alert_acknowledgements` — immutable audit record of alert acknowledgement events
- `defcon_history` — record of DEFCON level changes

W4 also adds:
- Views: `active_tracks_view`, `node_coverage_view`, `alert_summary_view`
- RLS policies for operator/analyst/admin/civil_defense roles
- Realtime publication config for tracks and alerts tables
- pg_cron jobs for maintenance (archive stale tracks)
- Additional indexes for dashboard query patterns

---

## 2. W4 NEW TABLES

### 2.1 dashboard_sessions

```sql
-- Migration: 0010_w4_dashboard_schema.sql

CREATE TABLE dashboard_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_role       TEXT        NOT NULL CHECK (user_role IN ('operator', 'analyst', 'admin', 'civil_defense')),
  session_token   TEXT        NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '8 hours'),
  ip_address      INET,
  user_agent      TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE dashboard_sessions IS
  'Active and historical dashboard operator sessions. W4 dashboard uses this
   to track 8-hour session windows and detect concurrent logins.';

COMMENT ON COLUMN dashboard_sessions.session_token IS
  'Supabase JWT session ID. Not the raw JWT — the session ID from auth.sessions.';

-- Index: frequent query pattern is "active sessions for user"
CREATE INDEX idx_dashboard_sessions_user_active
  ON dashboard_sessions(user_id, is_active)
  WHERE is_active = TRUE;

CREATE INDEX idx_dashboard_sessions_expires
  ON dashboard_sessions(expires_at)
  WHERE is_active = TRUE;
```

### 2.2 operator_notes

```sql
CREATE TABLE operator_notes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id),
  track_id        TEXT        REFERENCES tracks(id),   -- nullable: note can be on alert
  alert_id        TEXT        REFERENCES alerts(id),   -- nullable: note can be on track
  note_text       TEXT        NOT NULL,
  classification  TEXT        NOT NULL DEFAULT 'UNCLASSIFIED'
                              CHECK (classification IN ('UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE   -- soft delete only
);

COMMENT ON TABLE operator_notes IS
  'Operator annotations on tracks and alerts. Used by analysts for intelligence
   assessment. Soft-delete only — audit trail must be preserved.';

-- Either track_id or alert_id must be set (not both null)
ALTER TABLE operator_notes
  ADD CONSTRAINT notes_requires_target
  CHECK (track_id IS NOT NULL OR alert_id IS NOT NULL);

CREATE INDEX idx_operator_notes_track ON operator_notes(track_id) WHERE track_id IS NOT NULL;
CREATE INDEX idx_operator_notes_alert ON operator_notes(alert_id) WHERE alert_id IS NOT NULL;
CREATE INDEX idx_operator_notes_user  ON operator_notes(user_id);
CREATE INDEX idx_operator_notes_created ON operator_notes(created_at DESC);

-- Trigger: update updated_at on row update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER operator_notes_updated_at
  BEFORE UPDATE ON operator_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2.3 alert_acknowledgements

```sql
CREATE TABLE alert_acknowledgements (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id        TEXT        NOT NULL REFERENCES alerts(id),
  user_id         UUID        NOT NULL REFERENCES auth.users(id),
  user_role       TEXT        NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- No update allowed — INSERT only via RLS
  UNIQUE (alert_id, user_id)   -- one ack per alert per user
);

COMMENT ON TABLE alert_acknowledgements IS
  'Immutable acknowledgement audit log. Each row records a specific operator
   acknowledging a specific alert. Cannot be updated or deleted. UNIQUE on
   (alert_id, user_id) prevents duplicate acks from same operator.';

CREATE INDEX idx_alert_acks_alert   ON alert_acknowledgements(alert_id);
CREATE INDEX idx_alert_acks_user    ON alert_acknowledgements(user_id);
CREATE INDEX idx_alert_acks_time    ON alert_acknowledgements(acknowledged_at DESC);
```

### 2.4 defcon_history

```sql
CREATE TABLE defcon_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  level           INTEGER     NOT NULL CHECK (level BETWEEN 1 AND 5),
  set_by          UUID        NOT NULL REFERENCES auth.users(id),
  reason          TEXT,
  set_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE defcon_history IS
  'Immutable record of DEFCON level changes. Admin-only insert. Dashboard
   reads current DEFCON from most recent row.';

CREATE INDEX idx_defcon_history_time ON defcon_history(set_at DESC);

-- View: current DEFCON level
CREATE VIEW current_defcon AS
  SELECT level, set_by, reason, set_at
  FROM defcon_history
  ORDER BY set_at DESC
  LIMIT 1;
```

---

## 3. W4 VIEWS

### 3.1 active_tracks_view

```sql
CREATE OR REPLACE VIEW active_tracks_view AS
SELECT
  t.id,
  t.threat_class,
  t.confidence,
  t.latitude,
  t.longitude,
  t.altitude_m,
  t.heading_deg,
  t.speed_kmh,
  t.status,
  t.first_seen_at,
  t.last_updated_at,
  t.detecting_node_id,
  t.detection_gates,         -- JSONB: {acoustic: bool, rf: bool, optical: bool}
  t.cot_uid,
  -- Age classification for UI staleness rendering
  CASE
    WHEN NOW() - t.last_updated_at < INTERVAL '30 seconds'  THEN 'FRESH'
    WHEN NOW() - t.last_updated_at < INTERVAL '2 minutes'   THEN 'AGING'
    WHEN NOW() - t.last_updated_at < INTERVAL '5 minutes'   THEN 'STALE'
    ELSE 'EXPIRED'
  END AS staleness,
  -- Seconds since last update
  EXTRACT(EPOCH FROM (NOW() - t.last_updated_at))::INTEGER AS age_seconds,
  -- Acknowledgement status (any operator acked)
  EXISTS (
    SELECT 1 FROM alert_acknowledgements aa
    JOIN alerts a ON a.id = aa.alert_id
    WHERE a.track_id = t.id
    LIMIT 1
  ) AS has_acknowledged_alert,
  -- Latest operator note count
  (SELECT COUNT(*) FROM operator_notes n WHERE n.track_id = t.id AND NOT n.is_deleted) AS note_count
FROM tracks t
WHERE t.status = 'ACTIVE'
  AND t.last_updated_at > NOW() - INTERVAL '10 minutes';

COMMENT ON VIEW active_tracks_view IS
  'Live view of active tracks with staleness classification and metadata.
   Only returns tracks updated in last 10 minutes. Dashboard primary data source.';
```

### 3.2 node_coverage_view

```sql
CREATE OR REPLACE VIEW node_coverage_view AS
SELECT
  n.id,
  n.display_name,
  n.latitude,
  n.longitude,
  n.tier,
  n.coverage_radius_m,
  n.firmware_version,
  n.last_heartbeat_at,
  -- Status derived from heartbeat age
  CASE
    WHEN n.last_heartbeat_at > NOW() - INTERVAL '30 seconds'  THEN 'ONLINE'
    WHEN n.last_heartbeat_at > NOW() - INTERVAL '2 minutes'   THEN 'DEGRADED'
    ELSE 'OFFLINE'
  END AS status,
  -- Detection count in last 24h
  (
    SELECT COUNT(*) FROM track_position_events e
    WHERE e.node_id = n.id
      AND e.detected_at > NOW() - INTERVAL '24 hours'
  ) AS detections_24h,
  -- Battery level (for mobile nodes)
  n.battery_pct,
  n.is_mobile,
  -- Detection capabilities
  n.has_acoustic,
  n.has_rf,
  n.has_optical,
  -- Uptime in last 24h as percentage
  (
    SELECT
      100.0 * COUNT(*) FILTER (WHERE h.status = 'ONLINE') / NULLIF(COUNT(*), 0)
    FROM node_health_log h
    WHERE h.node_id = n.id
      AND h.recorded_at > NOW() - INTERVAL '24 hours'
  ) AS uptime_24h_pct
FROM sensor_nodes n
WHERE NOT n.is_decommissioned;

COMMENT ON VIEW node_coverage_view IS
  'Sensor node positions and status for globe overlay rendering.
   Used by get-node-coverage Edge Function and FR-W4-06.';
```

### 3.3 alert_summary_view

```sql
CREATE OR REPLACE VIEW alert_summary_view AS
SELECT
  a.id,
  a.track_id,
  a.severity,
  a.threat_class,
  a.confidence,
  a.detected_at,
  a.latitude,
  a.longitude,
  a.altitude_m,
  a.cot_xml,
  -- Acknowledgement status
  CASE
    WHEN EXISTS (SELECT 1 FROM alert_acknowledgements aa WHERE aa.alert_id = a.id)
    THEN TRUE ELSE FALSE
  END AS is_acknowledged,
  -- First acknowledger
  (
    SELECT jsonb_build_object(
      'user_id', aa.user_id,
      'acknowledged_at', aa.acknowledged_at,
      'user_role', aa.user_role
    )
    FROM alert_acknowledgements aa
    WHERE aa.alert_id = a.id
    ORDER BY aa.acknowledged_at ASC
    LIMIT 1
  ) AS first_acknowledgement,
  -- Note count
  (SELECT COUNT(*) FROM operator_notes n WHERE n.alert_id = a.id AND NOT n.is_deleted) AS note_count,
  -- Track link summary
  t.threat_class AS track_threat_class,
  t.detecting_node_id
FROM alerts a
LEFT JOIN tracks t ON t.id = a.track_id
ORDER BY a.detected_at DESC;

COMMENT ON VIEW alert_summary_view IS
  'Alerts with acknowledgement status and track context. Primary data source
   for AlertFeed component. Ordered newest first.';
```

### 3.4 threat_statistics_view

```sql
CREATE OR REPLACE VIEW threat_statistics_view AS
WITH
  window_1h AS (
    SELECT COUNT(*) AS detections_1h
    FROM tracks
    WHERE first_seen_at > NOW() - INTERVAL '1 hour'
  ),
  window_24h AS (
    SELECT
      COUNT(*) AS detections_24h,
      COUNT(*) FILTER (WHERE confidence < 0.4) AS likely_false_positives,
      AVG(confidence) AS mean_confidence,
      COUNT(*) FILTER (WHERE threat_class = 'FPV_DRONE') AS fpv_count,
      COUNT(*) FILTER (WHERE threat_class = 'SHAHED') AS shahed_count
    FROM tracks
    WHERE first_seen_at > NOW() - INTERVAL '24 hours'
  ),
  prev_24h AS (
    SELECT COUNT(*) AS prev_detections
    FROM tracks
    WHERE first_seen_at BETWEEN NOW() - INTERVAL '48 hours' AND NOW() - INTERVAL '24 hours'
  ),
  critical_today AS (
    SELECT COUNT(*) AS critical_count
    FROM alerts
    WHERE severity = 'CRITICAL'
      AND detected_at > NOW() - INTERVAL '24 hours'
  ),
  ack_stats AS (
    SELECT
      COUNT(DISTINCT a.id) AS total_critical,
      COUNT(DISTINCT aa.alert_id) AS acked_critical
    FROM alerts a
    LEFT JOIN alert_acknowledgements aa ON aa.alert_id = a.id
    WHERE a.severity = 'CRITICAL'
      AND a.detected_at > NOW() - INTERVAL '24 hours'
  ),
  node_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE last_heartbeat_at > NOW() - INTERVAL '30 seconds') AS online_count,
      COUNT(*) AS total_count
    FROM sensor_nodes
    WHERE NOT is_decommissioned
  )
SELECT
  w1.detections_1h,
  w24.detections_24h,
  w24.likely_false_positives,
  CASE WHEN w24.detections_24h > 0
    THEN ROUND(100.0 * w24.likely_false_positives / w24.detections_24h, 1)
    ELSE 0
  END AS false_positive_rate_pct,
  ROUND(w24.mean_confidence * 100, 1) AS mean_confidence_pct,
  w24.fpv_count,
  w24.shahed_count,
  ct.critical_count,
  CASE WHEN ac.total_critical > 0
    THEN ROUND(100.0 * ac.acked_critical / ac.total_critical, 1)
    ELSE 100
  END AS ack_rate_pct,
  ns.online_count AS nodes_online,
  ns.total_count AS nodes_total,
  CASE WHEN ns.total_count > 0
    THEN ROUND(100.0 * ns.online_count / ns.total_count, 1)
    ELSE 0
  END AS node_uptime_pct,
  -- Trend: positive = more detections than previous 24h
  CASE WHEN p24.prev_detections > 0
    THEN ROUND(100.0 * (w24.detections_24h - p24.prev_detections) / p24.prev_detections, 1)
    ELSE NULL
  END AS detection_trend_pct
FROM window_1h w1, window_24h w24, prev_24h p24, critical_today ct, ack_stats ac, node_stats ns;

COMMENT ON VIEW threat_statistics_view IS
  'Single-row statistics view for ThreatStatsPanel. Computed live; recommend
   materialization with REFRESH MATERIALIZED VIEW CONCURRENTLY every 60s in production.';
```

---

## 4. ROW LEVEL SECURITY

### 4.1 Role Setup

```sql
-- Roles mapped from Supabase auth user_metadata.role field
-- Enforced via RLS current_setting pattern

-- Helper function: get current user role from JWT claim
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role',
    'analyst'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### 4.2 tracks table RLS

```sql
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active tracks
CREATE POLICY tracks_read_authenticated ON tracks
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only service role can write tracks (TdoaCorrelator writes via service key)
CREATE POLICY tracks_write_service_role ON tracks
  FOR ALL
  USING (auth.role() = 'service_role');
```

### 4.3 alerts table RLS

```sql
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY alerts_read_authenticated ON alerts
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY alerts_write_service_role ON alerts
  FOR ALL
  USING (auth.role() = 'service_role');
```

### 4.4 operator_notes RLS

```sql
ALTER TABLE operator_notes ENABLE ROW LEVEL SECURITY;

-- Operators and admins: full CRUD on their own notes
CREATE POLICY notes_operator_own ON operator_notes
  FOR ALL
  USING (
    auth.uid() = user_id
    AND auth.user_role() IN ('operator', 'admin')
  );

-- Analysts: read all notes, write own notes
CREATE POLICY notes_analyst_read ON operator_notes
  FOR SELECT
  USING (
    auth.user_role() = 'analyst'
    AND NOT is_deleted
  );

CREATE POLICY notes_analyst_write ON operator_notes
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND auth.user_role() = 'analyst'
  );

-- Admin: read all including soft-deleted (for audit)
CREATE POLICY notes_admin_all ON operator_notes
  FOR ALL
  USING (auth.user_role() = 'admin');

-- civil_defense: no access to notes
```

### 4.5 alert_acknowledgements RLS

```sql
ALTER TABLE alert_acknowledgements ENABLE ROW LEVEL SECURITY;

-- INSERT only for operators and admins
CREATE POLICY ack_insert_operator ON alert_acknowledgements
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND auth.user_role() IN ('operator', 'admin')
  );

-- SELECT for all authenticated users
CREATE POLICY ack_read_authenticated ON alert_acknowledgements
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- NO UPDATE, NO DELETE policies → row is immutable once created
```

### 4.6 sensor_nodes RLS (civil_defense restriction)

```sql
ALTER TABLE sensor_nodes ENABLE ROW LEVEL SECURITY;

-- operator, analyst, admin: can see all nodes
CREATE POLICY nodes_read_standard ON sensor_nodes
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND auth.user_role() != 'civil_defense'
  );

-- civil_defense: NO access to sensor_nodes table at all
-- Dashboard handles this in the UI (NodeHealthList hidden for civil_defense)
-- RLS ensures API calls from civil_defense also return empty set
```

### 4.7 defcon_history RLS

```sql
ALTER TABLE defcon_history ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY defcon_read ON defcon_history
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admin can insert
CREATE POLICY defcon_insert_admin ON defcon_history
  FOR INSERT
  WITH CHECK (auth.user_role() = 'admin');

-- No UPDATE, no DELETE
```

---

## 5. SUPABASE REALTIME CONFIGURATION

```sql
-- Enable Realtime publication for W4 tables
-- (Run via Supabase Management API, not direct SQL)

-- tracks table: enable for INSERT, UPDATE, DELETE
ALTER PUBLICATION supabase_realtime ADD TABLE tracks;

-- alerts table: enable for INSERT only (alerts are append-only in practice)
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;

-- node_health_log: enable for INSERT (heartbeats arrive as new rows)
ALTER PUBLICATION supabase_realtime ADD TABLE node_health_log;

-- dashboard_sessions: NOT in Realtime publication (no live updates needed)
-- operator_notes: NOT in Realtime (pull-on-select pattern)
-- alert_acknowledgements: NOT in Realtime (acknowledgement does not need sub-100ms)
```

Realtime filter used by dashboard client:

```
tracks channel filter   : status=eq.ACTIVE
alerts channel filter   : (none — all new alerts received)
node_health_log filter  : (none — all heartbeats received, store filters to registered nodes)
```

---

## 6. PG_CRON MAINTENANCE JOBS

```sql
-- Requires pg_cron extension (enabled in Supabase Pro+)
-- These jobs run on the Supabase managed Postgres scheduler

-- Job 1: Archive expired tracks (move status=ACTIVE → ARCHIVED after 24h no update)
SELECT cron.schedule(
  'archive-stale-tracks',
  '*/5 * * * *',   -- every 5 minutes
  $$
    UPDATE tracks
    SET status = 'ARCHIVED'
    WHERE status = 'ACTIVE'
      AND last_updated_at < NOW() - INTERVAL '24 hours';
  $$
);

-- Job 2: Expire dashboard sessions (mark is_active = false after 8h)
SELECT cron.schedule(
  'expire-dashboard-sessions',
  '*/15 * * * *',  -- every 15 minutes
  $$
    UPDATE dashboard_sessions
    SET is_active = FALSE
    WHERE is_active = TRUE
      AND expires_at < NOW();
  $$
);

-- Job 3: Prune node_health_log (keep last 7 days only, table can grow fast)
SELECT cron.schedule(
  'prune-node-health-log',
  '0 3 * * *',     -- daily at 03:00 UTC
  $$
    DELETE FROM node_health_log
    WHERE recorded_at < NOW() - INTERVAL '7 days';
  $$
);

-- Job 4: Refresh materialized statistics view (if materialized)
SELECT cron.schedule(
  'refresh-threat-stats',
  '* * * * *',     -- every minute
  $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY threat_statistics_mv;
  $$
);
```

---

## 7. ADDITIONAL INDEXES FOR W4 QUERY PATTERNS

```sql
-- Track table: dashboard most common queries
CREATE INDEX idx_tracks_status_confidence
  ON tracks(status, confidence DESC)
  WHERE status = 'ACTIVE';

CREATE INDEX idx_tracks_threat_class
  ON tracks(threat_class, status)
  WHERE status = 'ACTIVE';

CREATE INDEX idx_tracks_last_updated
  ON tracks(last_updated_at DESC)
  WHERE status = 'ACTIVE';

CREATE INDEX idx_tracks_node_id
  ON tracks(detecting_node_id, last_updated_at DESC);

-- Alerts: dashboard query patterns
CREATE INDEX idx_alerts_severity_time
  ON alerts(severity, detected_at DESC);

CREATE INDEX idx_alerts_track_id
  ON alerts(track_id, detected_at DESC);

-- Track position events: OpenMCT timeline history queries
CREATE INDEX idx_track_position_events_track_time
  ON track_position_events(track_id, detected_at ASC);

CREATE INDEX idx_track_position_events_time_range
  ON track_position_events(detected_at)
  WHERE detected_at > NOW() - INTERVAL '7 days';
```

---

## 8. MIGRATION FILE

```sql
-- supabase/migrations/0010_w4_dashboard_schema.sql
-- Run: supabase db push

-- [All DDL from sections 2-7 above, in dependency order]
-- Order:
--   1. CREATE TABLE dashboard_sessions
--   2. CREATE TABLE operator_notes
--   3. CREATE TABLE alert_acknowledgements
--   4. CREATE TABLE defcon_history
--   5. CREATE VIEW current_defcon
--   6. CREATE VIEW active_tracks_view
--   7. CREATE VIEW node_coverage_view
--   8. CREATE VIEW alert_summary_view
--   9. CREATE VIEW threat_statistics_view
--  10. ALTER TABLE ... ENABLE ROW LEVEL SECURITY (all tables)
--  11. CREATE POLICY ... (all policies)
--  12. ALTER PUBLICATION supabase_realtime ADD TABLE ...
--  13. SELECT cron.schedule(...)
--  14. CREATE INDEX ... (all indexes)
```

---

*DATABASE_SCHEMA.md — APEX-SENTINEL W4 — approved 2026-03-24*
