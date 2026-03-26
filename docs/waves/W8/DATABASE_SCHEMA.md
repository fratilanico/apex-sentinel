# APEX-SENTINEL W8 — Database Schema

> Wave: W8 | Supabase project: bymfcnwfyxuivinuzurr
> Status: PLANNING | Date: 2026-03-26

---

## Existing Tables (W1-W7, unchanged)

- `sensor_nodes` — node registry with position, firmware version, health
- `detection_events` — raw detection events from acoustic pipeline
- `threat_tracks` — fused threat track states (EKF output)
- `alert_log` — Telegram + ATAK alerts sent
- `cot_relay_log` — CoT XML messages relayed to ATAK/FreeTAKServer
- `privacy_audit_log` — GDPR coarsening audit trail

---

## W8 New Tables

### `model_promotion_audit`

```sql
CREATE TABLE IF NOT EXISTS model_promotion_audit (
  id              BIGSERIAL PRIMARY KEY,
  promoted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model_version   TEXT NOT NULL,
  operator_id     TEXT NOT NULL,
  -- Per-profile recall metrics at promotion time
  shahed_136_recall   NUMERIC(5,4) NOT NULL,
  shahed_131_recall   NUMERIC(5,4) NOT NULL,
  shahed_238_recall   NUMERIC(5,4) NOT NULL,
  gerbera_recall      NUMERIC(5,4) NOT NULL,
  quad_rotor_recall   NUMERIC(5,4) NOT NULL,
  -- Gate result
  gate_passed         BOOLEAN NOT NULL,
  gate_failure_reason TEXT,
  -- IEC 61508 compliance
  iec_61508_sil       INTEGER DEFAULT 2,
  safety_gate_bypassed BOOLEAN NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE model_promotion_audit IS
  'IEC 61508 SIL-2 audit trail for model weight promotions.
   Every promotion attempt logged; gate_passed=false = blocked.';
```

### `firmware_ota_log`

```sql
CREATE TABLE IF NOT EXISTS firmware_ota_log (
  id              BIGSERIAL PRIMARY KEY,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  node_id         TEXT NOT NULL REFERENCES sensor_nodes(node_id),
  from_version    TEXT NOT NULL,
  to_version      TEXT NOT NULL,
  sha256          TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending','downloading','applying','health_check','done','rolled_back','failed')),
  rollback_reason TEXT,
  health_check_passed BOOLEAN
);

CREATE INDEX firmware_ota_log_node_idx ON firmware_ota_log(node_id, started_at DESC);
```

### `per_profile_recall_metrics`

```sql
CREATE TABLE IF NOT EXISTS per_profile_recall_metrics (
  id              BIGSERIAL PRIMARY KEY,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dataset_version TEXT NOT NULL,  -- e.g. 'BRAVE1-v2.3-16khz'
  profile_name    TEXT NOT NULL,  -- 'shahed_136', 'shahed_238', etc.
  recall          NUMERIC(5,4) NOT NULL,
  precision       NUMERIC(5,4) NOT NULL,
  f1              NUMERIC(5,4) NOT NULL,
  sample_count    INTEGER NOT NULL,
  threshold_gate  NUMERIC(5,4) NOT NULL,
  gate_passed     BOOLEAN NOT NULL,
  ci_run_id       TEXT,           -- GitHub Actions run ID for traceability
  model_version   TEXT NOT NULL
);

CREATE INDEX per_profile_recall_metrics_profile_idx ON per_profile_recall_metrics(profile_name, recorded_at DESC);
```

### `multi_threat_sessions`

```sql
CREATE TABLE IF NOT EXISTS multi_threat_sessions (
  id              BIGSERIAL PRIMARY KEY,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  peak_track_count INTEGER NOT NULL DEFAULT 0,
  track_ids       TEXT[] NOT NULL DEFAULT '{}',
  collision_events INTEGER NOT NULL DEFAULT 0,
  swarm_detected  BOOLEAN NOT NULL DEFAULT FALSE
);
```

---

## NATS JetStream KV Schema (W8 OTA)

```
KV Bucket: firmware
  firmware:latest
    {
      "version": "0.8.0",
      "sha256": "abc123...",
      "url": "https://storage.bymfcnwfyxuivinuzurr.supabase.co/storage/v1/object/public/firmware/v0.8.0.tar.gz",
      "minNodes": 1,
      "targetArch": ["arm64", "armv7l"],
      "audioCaptureSampleRate": 16000
    }

  firmware:node/<node_id>
    {
      "currentVersion": "0.7.1",
      "status": "done",
      "lastUpdate": "2026-03-26T10:00:00Z",
      "healthCheckPassed": true
    }
```

---

## Supabase Migrations

Migration files to create in W8:

```
supabase/migrations/
  0086_model_promotion_audit.sql
  0087_firmware_ota_log.sql
  0088_per_profile_recall_metrics.sql
  0089_multi_threat_sessions.sql
```

Each migration includes:
- Table creation
- Indexes
- RLS policies (service role full access, anon read-only for dashboard SSE)
- Comments for documentation
