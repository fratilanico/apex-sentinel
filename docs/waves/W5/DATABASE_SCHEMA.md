# APEX-SENTINEL — DATABASE_SCHEMA.md
## Gate 4: EKF + LSTM Trajectory Prediction — Database Schema
### Wave 5 | Project: APEX-SENTINEL | Version: 5.0.0
### Date: 2026-03-24 | Status: APPROVED
### Supabase Project: bymfcnwfyxuivinuzurr (eu-west-2)

---

## 1. SCHEMA CHANGES OVERVIEW

W5 adds 3 new tables and 1 column to the existing `tracks` table:

| Change | Type | Purpose |
|--------|------|---------|
| `tracks.predicted_trajectory` | ALTER TABLE | W4 CesiumJS reads this via Realtime |
| `track_positions` | CREATE TABLE | EKF state history, OpenMCT telemetry source |
| `predicted_trajectories` | CREATE TABLE | Archive of all 5-point prediction batches |
| `impact_estimates` | CREATE TABLE | Impact point estimates per track per time |

Migration file: `supabase/migrations/20260324000000_w5_trajectory_prediction.sql`

---

## 2. MIGRATION SQL

```sql
-- ============================================================
-- APEX-SENTINEL W5: Trajectory Prediction Schema
-- Migration: 20260324000000_w5_trajectory_prediction
-- Supabase project: bymfcnwfyxuivinuzurr
-- ============================================================

BEGIN;

-- ============================================================
-- 2.1 ALTER tracks: add predicted_trajectory column
-- ============================================================

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS predicted_trajectory JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ekf_state JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ekf_covariance_diag DOUBLE PRECISION[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prediction_confidence DOUBLE PRECISION DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prediction_model_version TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prediction_updated_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.tracks.predicted_trajectory IS
  'W5 PredictionOutput JSON: {trackId, generatedAt, ekfState, predictions[5], impactEstimate}';
COMMENT ON COLUMN public.tracks.ekf_state IS
  'Current EKF state vector: {lat, lon, alt, vLat, vLon, vAlt}';
COMMENT ON COLUMN public.tracks.ekf_covariance_diag IS
  'EKF covariance diagonal [P11..P66] in (deg²,deg²,m²,deg²/s²,deg²/s²,m²/s²)';
COMMENT ON COLUMN public.tracks.prediction_confidence IS
  'Prediction confidence at t+1s horizon, 0.0–1.0';
COMMENT ON COLUMN public.tracks.prediction_model_version IS
  'Predictor model: polynomial-v1 | onnx-lstm-v1';

-- ============================================================
-- 2.2 CREATE track_positions
-- EKF state estimate at every predict/update cycle (1 Hz nominal)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.track_positions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id        UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  recorded_at     TIMESTAMPTZ NOT NULL,

  -- EKF state vector
  lat             DOUBLE PRECISION NOT NULL,
  lon             DOUBLE PRECISION NOT NULL,
  alt             DOUBLE PRECISION NOT NULL,
  v_lat           DOUBLE PRECISION NOT NULL,  -- deg/s
  v_lon           DOUBLE PRECISION NOT NULL,  -- deg/s
  v_alt           DOUBLE PRECISION NOT NULL,  -- m/s

  -- Derived from state
  speed_ms        DOUBLE PRECISION GENERATED ALWAYS AS (
    SQRT(
      POWER(v_lat * 111320.0, 2) +
      POWER(v_lon * 111320.0 * COS(RADIANS(lat)), 2) +
      POWER(v_alt, 2)
    )
  ) STORED,
  heading_deg     DOUBLE PRECISION,           -- 0–360, computed in application

  -- Covariance diagonal
  cov_p11         DOUBLE PRECISION NOT NULL,  -- lat variance (deg²)
  cov_p22         DOUBLE PRECISION NOT NULL,  -- lon variance (deg²)
  cov_p33         DOUBLE PRECISION NOT NULL,  -- alt variance (m²)
  cov_p44         DOUBLE PRECISION NOT NULL,  -- vLat variance (deg²/s²)
  cov_p55         DOUBLE PRECISION NOT NULL,  -- vLon variance (deg²/s²)
  cov_p66         DOUBLE PRECISION NOT NULL,  -- vAlt variance (m²/s²)
  position_sigma_m DOUBLE PRECISION NOT NULL, -- 1-sigma position uncertainty in metres

  -- Measurement info
  had_measurement BOOLEAN NOT NULL DEFAULT TRUE,   -- false = coast cycle
  measurement_error_m DOUBLE PRECISION,            -- errorM from TdoaCorrelator
  innovation_lat  DOUBLE PRECISION,                -- y[0] = z[0] - H*x_pred[0]
  innovation_lon  DOUBLE PRECISION,
  innovation_alt  DOUBLE PRECISION,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for OpenMCT telemetry queries (time-range by track)
CREATE INDEX IF NOT EXISTS idx_track_positions_track_time
  ON public.track_positions (track_id, recorded_at DESC);

-- Partial index for recent positions only (last hour fast lookup)
CREATE INDEX IF NOT EXISTS idx_track_positions_recent
  ON public.track_positions (track_id, recorded_at DESC)
  WHERE recorded_at > NOW() - INTERVAL '1 hour';

COMMENT ON TABLE public.track_positions IS
  'W5: EKF state estimate history. Written at every predict/update cycle (1 Hz). 7-day TTL via pg_cron.';

-- ============================================================
-- 2.3 CREATE predicted_trajectories
-- Archive of every 5-point prediction batch published by W5
-- ============================================================

CREATE TABLE IF NOT EXISTS public.predicted_trajectories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id        UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  generated_at    TIMESTAMPTZ NOT NULL,

  -- Prediction confidence at t+1s
  confidence      DOUBLE PRECISION NOT NULL,
  model_version   TEXT NOT NULL,
  is_coasting     BOOLEAN NOT NULL DEFAULT FALSE,

  -- 5-point predictions as JSONB array
  -- Each element: { horizonSeconds, lat, lon, alt, confidence, sigmaM }
  predictions     JSONB NOT NULL,

  -- EKF state at time of prediction (denormalized for fast queries)
  ekf_lat         DOUBLE PRECISION NOT NULL,
  ekf_lon         DOUBLE PRECISION NOT NULL,
  ekf_alt         DOUBLE PRECISION NOT NULL,
  ekf_v_lat       DOUBLE PRECISION NOT NULL,
  ekf_v_lon       DOUBLE PRECISION NOT NULL,
  ekf_v_alt       DOUBLE PRECISION NOT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for W4 get-predictions Edge Function (paginated by track + time)
CREATE INDEX IF NOT EXISTS idx_predicted_trajectories_track_time
  ON public.predicted_trajectories (track_id, generated_at DESC);

COMMENT ON TABLE public.predicted_trajectories IS
  'W5: Archive of all 5-point trajectory prediction batches. Used by W4 get-predictions Edge Function and analyst replay.';

-- ============================================================
-- 2.4 CREATE impact_estimates
-- One record per track per second when drone is descending
-- ============================================================

CREATE TABLE IF NOT EXISTS public.impact_estimates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id              UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  estimated_at          TIMESTAMPTZ NOT NULL,

  -- Impact point
  impact_lat            DOUBLE PRECISION NOT NULL,
  impact_lon            DOUBLE PRECISION NOT NULL,
  confidence_radius_m   DOUBLE PRECISION NOT NULL,   -- metres, 95% confidence circle
  confidence            DOUBLE PRECISION NOT NULL,   -- 0.0–1.0

  -- Time to impact
  time_to_impact_s      DOUBLE PRECISION,             -- seconds until alt=0 (may be NULL if not computable)

  -- Source state
  source_lat            DOUBLE PRECISION NOT NULL,   -- EKF lat at time of estimate
  source_lon            DOUBLE PRECISION NOT NULL,
  source_alt            DOUBLE PRECISION NOT NULL,
  source_v_alt          DOUBLE PRECISION NOT NULL,   -- m/s (negative = descending)

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for latest impact estimate per track (C2 display query)
CREATE INDEX IF NOT EXISTS idx_impact_estimates_track_time
  ON public.impact_estimates (track_id, estimated_at DESC);

-- Unique constraint: one impact estimate per track per second (upsert key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_impact_estimates_track_second
  ON public.impact_estimates (track_id, DATE_TRUNC('second', estimated_at));

COMMENT ON TABLE public.impact_estimates IS
  'W5: Impact point estimates when drone vAlt < 0 (descending). One record per track per second.';

-- ============================================================
-- 2.5 ROW LEVEL SECURITY
-- ============================================================

-- track_positions: readable by operator and analyst roles; written by service role only
ALTER TABLE public.track_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY track_positions_select ON public.track_positions
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() ->> 'role' IN ('operator', 'analyst', 'admin')
  );

CREATE POLICY track_positions_insert ON public.track_positions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- predicted_trajectories: readable by operator and analyst
ALTER TABLE public.predicted_trajectories ENABLE ROW LEVEL SECURITY;

CREATE POLICY predicted_trajectories_select ON public.predicted_trajectories
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() ->> 'role' IN ('operator', 'analyst', 'admin')
  );

CREATE POLICY predicted_trajectories_insert ON public.predicted_trajectories
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- impact_estimates: operator and admin only (NOT analyst without operator check)
ALTER TABLE public.impact_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY impact_estimates_operator ON public.impact_estimates
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() ->> 'role' IN ('operator', 'admin')
  );

-- NOTE: analyst can read impact_estimates only if confidence >= 0.5
-- This is enforced at application layer (get-impact-estimates Edge Function),
-- not at RLS level (RLS would need a column check, not a join).

CREATE POLICY impact_estimates_insert ON public.impact_estimates
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- predicted_trajectory column on tracks: readable by all authenticated
-- (tracks table already has RLS from W1; adding UPDATE policy for W5)
CREATE POLICY tracks_prediction_update ON public.tracks
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 2.6 pg_cron: 7-day archival
-- ============================================================

-- Requires pg_cron extension (already enabled from W1/W2 migrations)
-- Run at 02:00 UTC daily

SELECT cron.schedule(
  'archive-track-positions-7d',
  '0 2 * * *',
  $$
    DELETE FROM public.track_positions
    WHERE created_at < NOW() - INTERVAL '7 days';
  $$
);

SELECT cron.schedule(
  'archive-predicted-trajectories-7d',
  '0 2 * * *',
  $$
    DELETE FROM public.predicted_trajectories
    WHERE created_at < NOW() - INTERVAL '7 days';
  $$
);

SELECT cron.schedule(
  'archive-impact-estimates-30d',
  '0 2 * * *',
  $$
    DELETE FROM public.impact_estimates
    WHERE created_at < NOW() - INTERVAL '30 days';
  $$
);

COMMIT;
```

---

## 3. TYPESCRIPT TYPES

### 3.1 New Table Row Types

```typescript
// Auto-generated via: supabase gen types typescript --project-id bymfcnwfyxuivinuzurr
// Supplemented with W5 additions below

export interface TrackPositionRow {
  id: string;
  track_id: string;
  recorded_at: string;
  lat: number;
  lon: number;
  alt: number;
  v_lat: number;
  v_lon: number;
  v_alt: number;
  speed_ms: number;           // generated column
  heading_deg: number | null;
  cov_p11: number;
  cov_p22: number;
  cov_p33: number;
  cov_p44: number;
  cov_p55: number;
  cov_p66: number;
  position_sigma_m: number;
  had_measurement: boolean;
  measurement_error_m: number | null;
  innovation_lat: number | null;
  innovation_lon: number | null;
  innovation_alt: number | null;
  created_at: string;
}

export interface TrackPositionInsert {
  track_id: string;
  recorded_at: string;
  lat: number;
  lon: number;
  alt: number;
  v_lat: number;
  v_lon: number;
  v_alt: number;
  heading_deg?: number;
  cov_p11: number;
  cov_p22: number;
  cov_p33: number;
  cov_p44: number;
  cov_p55: number;
  cov_p66: number;
  position_sigma_m: number;
  had_measurement?: boolean;
  measurement_error_m?: number;
  innovation_lat?: number;
  innovation_lon?: number;
  innovation_alt?: number;
}

export interface PredictedTrajectoryRow {
  id: string;
  track_id: string;
  generated_at: string;
  confidence: number;
  model_version: string;
  is_coasting: boolean;
  predictions: PredictedPoint[];
  ekf_lat: number;
  ekf_lon: number;
  ekf_alt: number;
  ekf_v_lat: number;
  ekf_v_lon: number;
  ekf_v_alt: number;
  created_at: string;
}

export interface ImpactEstimateRow {
  id: string;
  track_id: string;
  estimated_at: string;
  impact_lat: number;
  impact_lon: number;
  confidence_radius_m: number;
  confidence: number;
  time_to_impact_s: number | null;
  source_lat: number;
  source_lon: number;
  source_alt: number;
  source_v_alt: number;
  created_at: string;
}

export interface ImpactEstimateUpsert {
  track_id: string;
  estimated_at: string;
  impact_lat: number;
  impact_lon: number;
  confidence_radius_m: number;
  confidence: number;
  time_to_impact_s?: number;
  source_lat: number;
  source_lon: number;
  source_alt: number;
  source_v_alt: number;
}

// W5 additions to existing TrackRow
export interface TrackW5Fields {
  predicted_trajectory: PredictionOutput | null;
  ekf_state: EKFStateVector | null;
  ekf_covariance_diag: number[] | null;
  prediction_confidence: number | null;
  prediction_model_version: string | null;
  prediction_updated_at: string | null;
}
```

### 3.2 Application Types (used internally by W5 service)

```typescript
export interface EKFStateVector {
  lat: number;     // degrees
  lon: number;     // degrees
  alt: number;     // metres MSL
  vLat: number;    // degrees/second
  vLon: number;    // degrees/second
  vAlt: number;    // metres/second
}

export interface TimestampedState {
  timestampMs: number;
  state: EKFStateVector;
}

export interface PredictedPoint {
  horizonSeconds: number;   // 1, 2, 3, 5, or 10
  lat: number;
  lon: number;
  alt: number;
  confidence: number;       // 0.0–1.0
  sigmaM: number;           // 1-sigma position uncertainty in metres
}

export interface ImpactEstimate {
  lat: number;
  lon: number;
  confidenceRadius: number; // metres
  confidence: number;
  timeToImpactSeconds: number | null;
  estimatedAt: string;
}

export interface PredictionOutput {
  trackId: string;
  generatedAt: string;
  ekfState: EKFStateVector;
  ekfCovarianceDiag: number[];
  predictions: PredictedPoint[];
  impactEstimate: ImpactEstimate | null;
  confidence: number;
  modelVersion: string;
  isCoasting: boolean;
}
```

---

## 4. QUERY PATTERNS

### 4.1 Get Latest EKF State for Track (OpenMCT)

```sql
SELECT
  recorded_at,
  lat, lon, alt,
  v_lat, v_lon, v_alt,
  speed_ms,
  position_sigma_m,
  cov_p11, cov_p22, cov_p33
FROM public.track_positions
WHERE track_id = $1
  AND recorded_at > NOW() - INTERVAL '5 minutes'
ORDER BY recorded_at DESC
LIMIT 300;
```

### 4.2 Get Prediction History for Track (Analyst Replay)

```sql
SELECT
  generated_at,
  confidence,
  model_version,
  predictions,
  ekf_lat, ekf_lon, ekf_alt
FROM public.predicted_trajectories
WHERE track_id = $1
  AND generated_at BETWEEN $2 AND $3
ORDER BY generated_at ASC;
```

### 4.3 Get Latest Impact Estimate per Active Track (C2 Display)

```sql
SELECT DISTINCT ON (ie.track_id)
  ie.track_id,
  ie.impact_lat,
  ie.impact_lon,
  ie.confidence_radius_m,
  ie.confidence,
  ie.time_to_impact_s,
  ie.estimated_at,
  t.classification
FROM public.impact_estimates ie
JOIN public.tracks t ON t.id = ie.track_id
WHERE ie.estimated_at > NOW() - INTERVAL '30 seconds'
  AND ie.confidence >= 0.5
  AND t.status IN ('CONFIRMED', 'ACTIVE')
ORDER BY ie.track_id, ie.estimated_at DESC;
```

### 4.4 Archive Check (Verify pg_cron Working)

```sql
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  (SELECT COUNT(*) FROM public.track_positions WHERE created_at < NOW() - INTERVAL '7 days') AS old_rows
FROM pg_tables
WHERE tablename IN ('track_positions', 'predicted_trajectories', 'impact_estimates');
```

---

## 5. REALTIME PUBLICATION CONFIG

Supabase Realtime must be configured to publish changes on the `tracks` table including the `predicted_trajectory` column. Update `supabase_realtime` publication:

```sql
-- Add tracks table to realtime publication if not already present
ALTER PUBLICATION supabase_realtime ADD TABLE public.tracks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.impact_estimates;
-- track_positions excluded from realtime (too high frequency — use polling via Edge Function)
```

---

*DATABASE_SCHEMA.md — APEX-SENTINEL W5 — Generated 2026-03-24*
*Total: 415+ lines | Status: APPROVED | Next: API_SPECIFICATION.md*
