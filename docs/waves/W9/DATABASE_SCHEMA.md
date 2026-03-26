# W9 — DATABASE_SCHEMA
Wave 9: Live Data Feed Integration | APEX-SENTINEL | 2026-03-26

---

## New Tables

### feed_adsb_snapshots
```sql
CREATE TABLE feed_adsb_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts              timestamptz NOT NULL DEFAULT now(),
  node_id         text NOT NULL,
  aircraft_count  integer NOT NULL DEFAULT 0,
  squawk_7500_count   integer NOT NULL DEFAULT 0,
  no_transponder_count integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_adsb_snapshots_ts ON feed_adsb_snapshots (ts DESC);
CREATE INDEX idx_adsb_snapshots_node ON feed_adsb_snapshots (node_id, ts DESC);
```

Note: Individual ICAO24 identifiers and aircraft positions are NOT stored — aggregate counts only (GDPR Art.4 compliance, no natural person data).

---

### feed_weather_snapshots
```sql
CREATE TABLE feed_weather_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts              timestamptz NOT NULL DEFAULT now(),
  node_id         text NOT NULL,
  wind_speed_ms   numeric(6,2),
  wind_dir_deg    integer,
  visibility_m    integer,
  precip_mmh      numeric(6,2)
);
CREATE INDEX idx_weather_snapshots_ts ON feed_weather_snapshots (ts DESC);
CREATE INDEX idx_weather_snapshots_node ON feed_weather_snapshots (node_id, ts DESC);
```

---

### feed_alerts_active
```sql
CREATE TABLE feed_alerts_active (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id        text UNIQUE NOT NULL,
  source          text NOT NULL,             -- 'alerts.in.ua' | 'civil-protection-ro'
  level           text NOT NULL,             -- AWNING mapped: WHITE | YELLOW | RED
  area_geojson    jsonb NOT NULL,            -- polygon geometry only, no recipient data
  valid_until     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_active_valid_until ON feed_alerts_active (valid_until);
CREATE INDEX idx_alerts_active_source ON feed_alerts_active (source, created_at DESC);
```

---

### feed_osint_events
```sql
CREATE TABLE feed_osint_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts              timestamptz NOT NULL DEFAULT now(),
  bbox_key        text NOT NULL,             -- 'RO' | 'UA' | custom bbox string
  event_count     integer NOT NULL DEFAULT 0,
  top_keywords    text[] NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_osint_events_ts ON feed_osint_events (ts DESC);
CREATE INDEX idx_osint_events_bbox ON feed_osint_events (bbox_key, ts DESC);
```

Note: Event metadata only — no individual names, social posts, or author data stored (GDPR compliance).

---

### detection_enriched
```sql
CREATE TABLE detection_enriched (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id        uuid NOT NULL REFERENCES detections(id) ON DELETE CASCADE,
  feed_context_json   jsonb NOT NULL,        -- snapshot of context at enrichment time
  enriched_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_detection_enriched_detection_id ON detection_enriched (detection_id);
CREATE INDEX idx_detection_enriched_at ON detection_enriched (enriched_at DESC);
```

---

## RLS Policies

```sql
-- feed_adsb_snapshots: service-role write, no anonymous read
ALTER TABLE feed_adsb_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_write_adsb" ON feed_adsb_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- feed_weather_snapshots: service-role write, no anonymous read
ALTER TABLE feed_weather_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_write_weather" ON feed_weather_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- feed_alerts_active: service-role write, anonymous READ only (public safety data)
ALTER TABLE feed_alerts_active ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_write_alerts" ON feed_alerts_active
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_alerts" ON feed_alerts_active
  FOR SELECT TO anon USING (true);

-- feed_osint_events: service-role write, no anonymous read
ALTER TABLE feed_osint_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_write_osint" ON feed_osint_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- detection_enriched: service-role write, no anonymous read
ALTER TABLE detection_enriched ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_write_enriched" ON detection_enriched
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

---

## Retention Policy

| Table | Retention | Mechanism |
|---|---|---|
| feed_adsb_snapshots | 4h rolling | Scheduled DELETE WHERE ts < now() - interval '4 hours' |
| feed_weather_snapshots | 4h rolling | Scheduled DELETE WHERE ts < now() - interval '4 hours' |
| feed_alerts_active | Until valid_until | DELETE WHERE valid_until < now() (or valid_until IS NULL AND created_at < now() - interval '24 hours') |
| feed_osint_events | 24h | DELETE WHERE ts < now() - interval '24 hours' |
| detection_enriched | Follows parent detections row | Cascade delete |

Retention jobs: pg_cron scheduled every 30 minutes on Supabase project bymfcnwfyxuivinuzurr.

---

## Migration File
`supabase/migrations/YYYYMMDDHHMMSS_w9_feed_tables.sql`
