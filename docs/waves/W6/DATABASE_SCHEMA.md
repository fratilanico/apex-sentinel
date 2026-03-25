# APEX-SENTINEL — DATABASE_SCHEMA.md
## Wave 6: Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
### Wave 6 | Project: APEX-SENTINEL | Version: 6.0.0
### Date: 2026-03-25 | Status: APPROVED
### Supabase: bymfcnwfyxuivinuzurr (eu-west-2 London)
### Migration: 20260325000000_w6_acoustic_intelligence.sql

---

## 1. SCHEMA CHANGES OVERVIEW

| Change | Type | Purpose |
|---|---|---|
| `acoustic_detections` | CREATE TABLE | Per-node raw acoustic classification events |
| `acoustic_training_data` | CREATE TABLE | Dataset manifest for ML training |
| `review_queue` | CREATE TABLE | Human labeling queue for auto-labeled clips |
| `risk_heatmaps` | CREATE TABLE | Monte Carlo P(impact) grids per track |
| `fp_suppression_log` | CREATE TABLE | False positive guard audit trail |
| `brave1_detections` | CREATE TABLE | Ukrainian defense partner data |
| `node_health_log` | CREATE TABLE | Edge node heartbeat history |
| `tracks.drone_type` | ALTER TABLE | Add confirmed drone classification |
| `tracks.acoustic_confidence` | ALTER TABLE | Latest acoustic classifier confidence |
| `tracks.fp_suppression_count` | ALTER TABLE | Count of suppressed events for this track |

---

## 2. MIGRATION SQL

```sql
-- ============================================================
-- APEX-SENTINEL W6: Acoustic Intelligence Schema
-- Migration: 20260325000000_w6_acoustic_intelligence
-- Supabase project: bymfcnwfyxuivinuzurr (eu-west-2)
-- ============================================================

BEGIN;

-- ============================================================
-- 2.1 ALTER tracks: W6 acoustic classification columns
-- ============================================================

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS drone_type TEXT
    CHECK (drone_type IN ('shahed', 'lancet', 'fpv', 'unknown'))
    DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS acoustic_confidence DOUBLE PRECISION
    CHECK (acoustic_confidence >= 0.0 AND acoustic_confidence <= 1.0)
    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fp_suppression_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acoustic_detection_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cot_type TEXT DEFAULT NULL;

COMMENT ON COLUMN public.tracks.drone_type IS
  'W6 confirmed classification: shahed | lancet | fpv | unknown';
COMMENT ON COLUMN public.tracks.acoustic_confidence IS
  'Latest acoustic classifier confidence, 0.0-1.0';
COMMENT ON COLUMN public.tracks.fp_suppression_count IS
  'Number of detections suppressed by FalsePositiveGuard for this track';
COMMENT ON COLUMN public.tracks.acoustic_detection_count IS
  'Total acoustic detections contributing to this track';
COMMENT ON COLUMN public.tracks.confirmed_at IS
  'Timestamp when track reached 3+ acoustic detections (confirmation threshold)';
COMMENT ON COLUMN public.tracks.cot_type IS
  'ATAK CoT type string: a-h-A-C-F (Shahed) | a-h-A-M-F-Q (Lancet) | a-u-A (unknown)';

-- ============================================================
-- 2.2 CREATE acoustic_detections
-- Raw per-node acoustic classification events
-- ============================================================

CREATE TABLE IF NOT EXISTS public.acoustic_detections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id               TEXT NOT NULL,
  detected_at           TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Classification output
  label                 TEXT NOT NULL
    CHECK (label IN ('shahed', 'lancet', 'false_positive', 'ambient')),
  confidence            DOUBLE PRECISION NOT NULL
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
  prob_shahed           DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  prob_lancet           DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  prob_false_positive   DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  prob_ambient          DOUBLE PRECISION NOT NULL DEFAULT 0.0,

  -- Audio context
  window_start_ms       BIGINT NOT NULL,
  window_end_ms         BIGINT NOT NULL,
  snr_db                DOUBLE PRECISION,
  doppler_rate_hz_s     DOUBLE PRECISION,    -- Hz/s, null if unavailable

  -- Position (null if GPS not available on edge node)
  lat                   DOUBLE PRECISION,
  lon                   DOUBLE PRECISION,
  alt                   DOUBLE PRECISION,

  -- Processing metadata
  model_version         TEXT NOT NULL,
  processing_time_ms    DOUBLE PRECISION NOT NULL,
  fp_suppressed         BOOLEAN NOT NULL DEFAULT false,

  -- Linked track (null until TrackManager assigns)
  track_id              UUID REFERENCES public.tracks(id) ON DELETE SET NULL,

  -- W6 constraint: sum of probabilities ≈ 1.0
  CONSTRAINT probs_sum_approx_one CHECK (
    ABS(prob_shahed + prob_lancet + prob_false_positive + prob_ambient - 1.0) < 0.01
  )
);

CREATE INDEX IF NOT EXISTS acoustic_detections_node_detected
  ON public.acoustic_detections (node_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS acoustic_detections_track_id
  ON public.acoustic_detections (track_id)
  WHERE track_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS acoustic_detections_label_confidence
  ON public.acoustic_detections (label, confidence DESC)
  WHERE fp_suppressed = false;

COMMENT ON TABLE public.acoustic_detections IS
  'W6: Raw acoustic classification events from edge nodes';

-- ============================================================
-- 2.3 CREATE acoustic_training_data
-- Dataset manifest for ML training pipeline
-- ============================================================

CREATE TABLE IF NOT EXISTS public.acoustic_training_data (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Source
  source_type     TEXT NOT NULL CHECK (source_type IN ('youtube', 'telegram', 'field', 'brave1')),
  source_url      TEXT,
  source_channel  TEXT,       -- Telegram channel, YouTube channel

  -- Storage reference
  storage_path    TEXT NOT NULL,   -- Path in acoustic-training-data bucket
  filename        TEXT NOT NULL,   -- e.g. shahed_001_0000_2000.wav

  -- Audio properties
  duration_s      DOUBLE PRECISION NOT NULL,
  sample_rate     INTEGER NOT NULL DEFAULT 22050,
  channels        INTEGER NOT NULL DEFAULT 1,
  segment_start_ms  BIGINT NOT NULL,
  segment_end_ms    BIGINT NOT NULL,

  -- Labeling
  auto_label      TEXT CHECK (auto_label IN ('shahed', 'lancet', 'motorcycle_50cc', 'generator_diesel', 'lawnmower', 'ultralight', 'ambient', 'unknown')),
  human_label     TEXT CHECK (human_label IN ('shahed', 'lancet', 'motorcycle_50cc', 'generator_diesel', 'lawnmower', 'ultralight', 'ambient', 'reject')),
  label_confidence DOUBLE PRECISION DEFAULT NULL,
  reviewed        BOOLEAN NOT NULL DEFAULT false,
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ,

  -- Split assignment
  split           TEXT CHECK (split IN ('train', 'validation', 'test')) DEFAULT NULL,

  -- Training use
  used_in_training  BOOLEAN NOT NULL DEFAULT false,
  training_run_id   TEXT,          -- Reference to training experiment
  augmented         BOOLEAN NOT NULL DEFAULT false,
  augmentation_type TEXT           -- e.g. 'pitch_shift_+2', 'noise_snr_20'
);

CREATE INDEX IF NOT EXISTS training_data_label_reviewed
  ON public.acoustic_training_data (human_label, reviewed);

CREATE INDEX IF NOT EXISTS training_data_split
  ON public.acoustic_training_data (split)
  WHERE split IS NOT NULL;

COMMENT ON TABLE public.acoustic_training_data IS
  'W6: Dataset manifest for YAMNet fine-tuning pipeline';

-- ============================================================
-- 2.4 CREATE review_queue
-- Human labeling queue for auto-labeled clips
-- ============================================================

CREATE TABLE IF NOT EXISTS public.review_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_data_id UUID NOT NULL REFERENCES public.acoustic_training_data(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  priority        INTEGER NOT NULL DEFAULT 5,   -- 1=high, 10=low
  assigned_to     TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'assigned', 'completed', 'rejected')),
  notes           TEXT,
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS review_queue_status_priority
  ON public.review_queue (status, priority)
  WHERE status IN ('pending', 'assigned');

COMMENT ON TABLE public.review_queue IS
  'W6: Human labeling queue for acoustic training data';

-- ============================================================
-- 2.5 CREATE risk_heatmaps
-- Monte Carlo P(impact) grids per confirmed track
-- ============================================================

CREATE TABLE IF NOT EXISTS public.risk_heatmaps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id            UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Simulation parameters
  simulation_count    INTEGER NOT NULL DEFAULT 1000,
  cell_size_m         INTEGER NOT NULL DEFAULT 50,
  grid_extent_km      DOUBLE PRECISION NOT NULL DEFAULT 5.0,

  -- EKF state snapshot at time of simulation
  ekf_state_snapshot  JSONB NOT NULL,
  -- { lat, lon, alt, vLat, vLon, vAlt, covariance_diag[6] }

  -- Heatmap data
  cells               JSONB NOT NULL,
  -- [ { lat, lon, probability, cell_size_m }, ... ] (pruned < 0.001)
  total_cells         INTEGER NOT NULL,
  max_probability     DOUBLE PRECISION NOT NULL,
  centroid_lat        DOUBLE PRECISION NOT NULL,
  centroid_lon        DOUBLE PRECISION NOT NULL,

  -- Impact estimate (highest probability cell)
  peak_impact_lat     DOUBLE PRECISION NOT NULL,
  peak_impact_lon     DOUBLE PRECISION NOT NULL,
  peak_probability    DOUBLE PRECISION NOT NULL,

  -- Compute performance
  compute_time_ms     DOUBLE PRECISION NOT NULL,

  -- NATS publish status
  nats_published      BOOLEAN NOT NULL DEFAULT false,
  nats_published_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS risk_heatmaps_track_generated
  ON public.risk_heatmaps (track_id, generated_at DESC);

-- Latest heatmap per track (for dashboard query)
CREATE INDEX IF NOT EXISTS risk_heatmaps_latest
  ON public.risk_heatmaps (track_id, generated_at DESC)
  INCLUDE (peak_impact_lat, peak_impact_lon, peak_probability);

COMMENT ON TABLE public.risk_heatmaps IS
  'W6: Monte Carlo trajectory risk heatmaps, 50m grid cells, P(impact) per cell';

-- ============================================================
-- 2.6 CREATE fp_suppression_log
-- False positive guard audit trail
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fp_suppression_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  node_id             TEXT NOT NULL,
  detected_at         TIMESTAMPTZ NOT NULL,

  -- Classification that was suppressed
  prob_shahed         DOUBLE PRECISION NOT NULL,
  prob_lancet         DOUBLE PRECISION NOT NULL,
  prob_false_positive DOUBLE PRECISION NOT NULL,
  fp_threshold_used   DOUBLE PRECISION NOT NULL,

  -- Suppression reason
  reason              TEXT NOT NULL,
  -- e.g. "P(fp)=0.45 > threshold=0.30 with P(shahed)=0.62 < 0.80"

  -- Doppler context
  doppler_rate_hz_s   DOUBLE PRECISION,
  doppler_suppressed  BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS fp_log_node_created
  ON public.fp_suppression_log (node_id, created_at DESC);

-- ============================================================
-- 2.7 CREATE brave1_detections
-- Ukrainian defense partner historical data
-- ============================================================

CREATE TABLE IF NOT EXISTS public.brave1_detections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Source
  source_file     TEXT NOT NULL,
  source_format   TEXT NOT NULL CHECK (source_format IN ('csv', 'json')),
  row_index       INTEGER,           -- Original row in source file

  -- Detection data (from partner)
  lat             DOUBLE PRECISION NOT NULL,
  lon             DOUBLE PRECISION NOT NULL,
  alt             DOUBLE PRECISION,
  detected_at     TIMESTAMPTZ NOT NULL,
  drone_type      TEXT,              -- Partner's classification
  confidence      DOUBLE PRECISION,
  audio_file_ref  TEXT,              -- Partner's audio file reference

  -- Normalized to DetectionInput
  normalized_at   TIMESTAMPTZ,
  detection_input JSONB,             -- W5 DetectionInput interface

  -- De-duplication
  dedup_key       TEXT GENERATED ALWAYS AS (
    ROUND(lat::NUMERIC, 4)::TEXT || '_' ||
    ROUND(lon::NUMERIC, 4)::TEXT || '_' ||
    EXTRACT(EPOCH FROM detected_at)::BIGINT::TEXT
  ) STORED,
  UNIQUE (dedup_key)
);

CREATE INDEX IF NOT EXISTS brave1_detected_at
  ON public.brave1_detections (detected_at DESC);

COMMENT ON TABLE public.brave1_detections IS
  'W6: Historical detection data from Ukrainian defense data partners (BRAVE1)';

-- ============================================================
-- 2.8 CREATE node_health_log
-- Edge node heartbeat history
-- ============================================================

CREATE TABLE IF NOT EXISTS public.node_health_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id             TEXT NOT NULL,
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  uptime_s            INTEGER NOT NULL,
  detection_count     INTEGER NOT NULL DEFAULT 0,
  last_detection_at   TIMESTAMPTZ,
  nats_connected      BOOLEAN NOT NULL,
  offline_buffer_size INTEGER NOT NULL DEFAULT 0,
  cpu_percent         DOUBLE PRECISION,
  memory_mb           DOUBLE PRECISION,
  model_version       TEXT
);

CREATE INDEX IF NOT EXISTS node_health_node_recorded
  ON public.node_health_log (node_id, recorded_at DESC);

-- Retention: keep 7 days of health logs
CREATE OR REPLACE FUNCTION public.cleanup_node_health_log()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.node_health_log
  WHERE recorded_at < NOW() - INTERVAL '7 days';
$$;

COMMENT ON TABLE public.node_health_log IS
  'W6: Edge node heartbeat history (30s interval)';

-- ============================================================
-- 2.9 ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.acoustic_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acoustic_training_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_heatmaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_suppression_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brave1_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_health_log ENABLE ROW LEVEL SECURITY;

-- Service role bypass (for backend workers)
CREATE POLICY "Service role full access" ON public.acoustic_detections
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.acoustic_training_data
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.review_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.risk_heatmaps
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.fp_suppression_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.brave1_detections
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.node_health_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 2.10 REALTIME SUBSCRIPTIONS
-- ============================================================

-- Enable Supabase Realtime on key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.acoustic_detections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.risk_heatmaps;
ALTER PUBLICATION supabase_realtime ADD TABLE public.node_health_log;

COMMIT;
```

---

## 3. TABLE RELATIONSHIP DIAGRAM

```
tracks (W1+)
  ├── track_positions (W5)
  ├── predicted_trajectories (W5)
  ├── impact_estimates (W5)
  ├── acoustic_detections (W6) [track_id FK, nullable]
  └── risk_heatmaps (W6) [track_id FK]

acoustic_training_data (W6)
  └── review_queue (W6) [training_data_id FK]

brave1_detections (W6) [standalone, normalized to DetectionInput]

fp_suppression_log (W6) [standalone audit log]

node_health_log (W6) [standalone time-series]
```

---

## 4. STORAGE BUCKETS

```sql
-- Create storage buckets (via Supabase Dashboard or Management API)

-- Acoustic training data (WAV segments)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'acoustic-training-data',
  'acoustic-training-data',
  false,
  52428800,   -- 50MB per file (WAV segments are small, 2s ≈ 176KB at 22050Hz)
  ARRAY['audio/wav', 'audio/x-wav']
) ON CONFLICT (id) DO NOTHING;

-- TFLite models
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tflite-models',
  'tflite-models',
  false,
  104857600,  -- 100MB per model file
  ARRAY['application/octet-stream', 'application/zip']
) ON CONFLICT (id) DO NOTHING;
```

---

## 5. PERFORMANCE NOTES

### 5.1 Partitioning Strategy

`acoustic_detections` will grow rapidly (N nodes × 2 detections/s × 86400s/day). At 20 nodes: ~3.5M rows/day. Partition by month after 30 days of production data.

```sql
-- Future migration (not W6, but document now):
-- ALTER TABLE acoustic_detections PARTITION BY RANGE (detected_at);
-- CREATE TABLE acoustic_detections_2026_03 PARTITION OF acoustic_detections
--   FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
```

### 5.2 Risk Heatmap Size Estimate

50m grid over 5km radius: π × 5000² / 50² ≈ 31,416 cells
After pruning (P < 0.001): typically 5–10% of cells survive → ~1500–3000 cells
JSON size: ~50 bytes/cell × 3000 = ~150KB per heatmap (acceptable for JSONB)
