# APEX-SENTINEL W3 — Database Schema
**Version:** 1.0.0
**Wave:** W3 — Mobile Application
**Supabase Project:** bymfcnwfyxuivinuzurr (eu-west-2)
**Status:** APPROVED
**Date:** 2026-03-24

---

## 1. Overview

W3 uses two data stores:

1. **Mobile SQLite** (expo-sqlite) — on-device, stores node config, offline event buffer, alert history, calibration logs.
2. **Supabase PostgreSQL** (bymfcnwfyxuivinuzurr) — cloud, stores node registration, app versions, push tokens, alert delivery receipts.

The SQLite schema is lightweight and append-friendly. No complex joins. Optimised for sequential writes (event buffering) and range reads (alert feed, calibration history).

---

## 2. Mobile SQLite Schema

### 2.1 Schema Version and Migrations

```sql
-- migrations table (internal, managed by Database.ts)
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
```

Current schema version: **3**

All migrations are run at app startup in `Database.ts`:
```typescript
const MIGRATIONS: Migration[] = [
  { version: 1, up: migration_v1 },
  { version: 2, up: migration_v2 },
  { version: 3, up: migration_v3 },
];
```

---

### 2.2 node_config

Stores the single row of node configuration. Uses a singleton pattern (node_id = 'local').

```sql
-- Migration v1
CREATE TABLE IF NOT EXISTS node_config (
  id                    TEXT    PRIMARY KEY DEFAULT 'local',
  node_id               TEXT    NOT NULL,
  nickname              TEXT    NOT NULL DEFAULT '',
  nats_ws_url           TEXT    NOT NULL,
  nats_token            TEXT    NOT NULL,
  supabase_url          TEXT    NOT NULL DEFAULT 'https://bymfcnwfyxuivinuzurr.supabase.co',
  supabase_anon_key     TEXT    NOT NULL,
  detection_threshold   REAL    NOT NULL DEFAULT 0.72,
  vad_ambient_rms       REAL    NOT NULL DEFAULT 0.02,
  model_version         TEXT    NOT NULL DEFAULT '',
  model_sha256          TEXT    NOT NULL DEFAULT '',
  model_path            TEXT    NOT NULL DEFAULT '',
  preferred_mesh_device TEXT,
  alert_muted_until     TEXT,
  consent_granted_at    TEXT,
  consent_version       TEXT    NOT NULL DEFAULT '1.0',
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TRIGGER node_config_updated_at
AFTER UPDATE ON node_config
FOR EACH ROW
BEGIN
  UPDATE node_config SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE id = NEW.id;
END;
```

**Columns:**

| Column | Type | Description |
|---|---|---|
| id | TEXT | Always 'local' (singleton) |
| node_id | TEXT | UUID v4 generated at first launch, stored in SecureStore |
| nickname | TEXT | Optional human-readable name |
| nats_ws_url | TEXT | NATS WebSocket endpoint URL |
| nats_token | TEXT | NATS auth token (also in SecureStore as source of truth) |
| supabase_url | TEXT | Supabase project URL |
| supabase_anon_key | TEXT | Supabase anon key |
| detection_threshold | REAL | ML confidence threshold (default 0.72) |
| vad_ambient_rms | REAL | VAD ambient noise floor from last calibration |
| model_version | TEXT | Current loaded model semver |
| model_sha256 | TEXT | SHA-256 of current model file |
| model_path | TEXT | Filesystem path to model file |
| preferred_mesh_device | TEXT | BLE device ID for Meshtastic gateway |
| alert_muted_until | TEXT | ISO8601 datetime or NULL |
| consent_granted_at | TEXT | ISO8601 datetime of consent |
| consent_version | TEXT | Privacy policy version consented to |

---

### 2.3 pending_events

Offline event buffer. Events inserted when NATS unavailable. Flushed FIFO on reconnect.

```sql
-- Migration v1
CREATE TABLE IF NOT EXISTS pending_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id        TEXT    NOT NULL UNIQUE,
  node_id         TEXT    NOT NULL,
  event_type      TEXT    NOT NULL,
  confidence      REAL    NOT NULL,
  model_version   TEXT    NOT NULL,
  inference_ms    INTEGER NOT NULL,
  lat             REAL,
  lng             REAL,
  geohash         TEXT,
  detected_at     TEXT    NOT NULL,
  nats_subject    TEXT    NOT NULL,
  payload_json    TEXT    NOT NULL,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_pending_events_detected_at
  ON pending_events (detected_at ASC);

CREATE INDEX IF NOT EXISTS idx_pending_events_retry_count
  ON pending_events (retry_count ASC);

CREATE INDEX IF NOT EXISTS idx_pending_events_geohash
  ON pending_events (geohash);
```

**Columns:**

| Column | Type | Description |
|---|---|---|
| id | INTEGER | Auto-increment rowid, used for FIFO ordering |
| event_id | TEXT | UUID v4, unique event identifier |
| node_id | TEXT | Source node UUID |
| event_type | TEXT | YAMNet class label (e.g. 'Gunshot_or_gunfire') |
| confidence | REAL | ML confidence score 0.0–1.0 |
| model_version | TEXT | Model version that produced detection |
| inference_ms | INTEGER | Inference duration in milliseconds |
| lat | REAL | Coarsened latitude (4 decimal places) |
| lng | REAL | Coarsened longitude (4 decimal places) |
| geohash | TEXT | Geohash precision 7 |
| detected_at | TEXT | ISO8601 timestamp of detection |
| nats_subject | TEXT | Target NATS subject for publish |
| payload_json | TEXT | Full serialised event payload (for replay) |
| retry_count | INTEGER | Number of failed publish attempts |

**Buffer management:**
- Max rows: 10,000. On insert when count ≥ 10,000: delete oldest 1,000 rows.
- Flush: SELECT ordered by id ASC, publish each, DELETE on ACK.
- Flush rate limit: 50 events/second when NATS latency < 100ms.

---

### 2.4 alert_history

Received alerts from W2 via NATS subscription. Used for local feed and read/unread state.

```sql
-- Migration v1
CREATE TABLE IF NOT EXISTS alert_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id        TEXT    NOT NULL UNIQUE,
  severity        INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 10),
  event_type      TEXT    NOT NULL,
  source_geohash  TEXT    NOT NULL,
  lat             REAL,
  lng             REAL,
  distance_m      INTEGER,
  confirmed_by    INTEGER NOT NULL DEFAULT 1,
  details_json    TEXT    NOT NULL,
  is_read         INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  alert_at        TEXT    NOT NULL,
  received_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  push_sent       INTEGER NOT NULL DEFAULT 0 CHECK (push_sent IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_alert_history_alert_at
  ON alert_history (alert_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_history_severity
  ON alert_history (severity DESC);

CREATE INDEX IF NOT EXISTS idx_alert_history_is_read
  ON alert_history (is_read);

CREATE INDEX IF NOT EXISTS idx_alert_history_geohash
  ON alert_history (source_geohash);
```

**Columns:**

| Column | Type | Description |
|---|---|---|
| id | INTEGER | Auto-increment rowid |
| alert_id | TEXT | UUID from W2 alert system |
| severity | INTEGER | 1–10 severity scale |
| event_type | TEXT | Confirmed event class |
| source_geohash | TEXT | Geohash of detected event source |
| lat | REAL | Approximate alert source latitude |
| lng | REAL | Approximate alert source longitude |
| distance_m | INTEGER | Estimated distance from node in meters |
| confirmed_by | INTEGER | Number of nodes that confirmed |
| details_json | TEXT | Full alert payload |
| is_read | INTEGER | 0=unread, 1=read |
| alert_at | TEXT | When event was confirmed by W2 |
| received_at | TEXT | When this node received the alert |
| push_sent | INTEGER | 0=no push sent, 1=push sent |

**Retention:** Rolling 7 days. Delete rows where alert_at < now - 7 days on app resume.

---

### 2.5 calibration_log

Records each calibration run with ambient profile and before/after detection rates.

```sql
-- Migration v2
CREATE TABLE IF NOT EXISTS calibration_log (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  calibration_id      TEXT    NOT NULL UNIQUE,
  node_id             TEXT    NOT NULL,
  ambient_rms         REAL    NOT NULL,
  ambient_rms_std     REAL    NOT NULL,
  vad_threshold_set   REAL    NOT NULL,
  spectral_centroid   REAL,
  dominant_freq_hz    REAL,
  duration_s          INTEGER NOT NULL DEFAULT 60,
  lat                 REAL,
  lng                 REAL,
  geohash             TEXT,
  detections_24h_before  INTEGER NOT NULL DEFAULT 0,
  detections_24h_after   INTEGER,
  model_version       TEXT    NOT NULL,
  notes               TEXT,
  calibrated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_calibration_log_calibrated_at
  ON calibration_log (calibrated_at DESC);

CREATE INDEX IF NOT EXISTS idx_calibration_log_node_id
  ON calibration_log (node_id);
```

**Columns:**

| Column | Type | Description |
|---|---|---|
| calibration_id | TEXT | UUID v4 |
| node_id | TEXT | Source node |
| ambient_rms | REAL | Mean RMS over calibration window |
| ambient_rms_std | REAL | Standard deviation of RMS |
| vad_threshold_set | REAL | VAD threshold applied after calibration |
| spectral_centroid | REAL | Hz — dominant frequency band |
| dominant_freq_hz | REAL | Peak frequency in ambient spectrum |
| duration_s | INTEGER | Calibration window length in seconds |
| lat / lng / geohash | REAL/TEXT | Coarsened location at calibration |
| detections_24h_before | INTEGER | Event count in 24h before calibration |
| detections_24h_after | INTEGER | Event count in 24h after (backfilled) |
| model_version | TEXT | Model version active during calibration |

---

### 2.6 connectivity_log

Records connectivity state transitions. Used for diagnostics and to reconstruct offline periods.

```sql
-- Migration v3
CREATE TABLE IF NOT EXISTS connectivity_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  state           TEXT    NOT NULL,
  previous_state  TEXT,
  duration_s      INTEGER,
  events_buffered INTEGER NOT NULL DEFAULT 0,
  events_flushed  INTEGER NOT NULL DEFAULT 0,
  transitioned_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_connectivity_log_transitioned_at
  ON connectivity_log (transitioned_at DESC);
```

**Retention:** Rolling 30 days.

---

## 3. Supabase PostgreSQL Schema

### 3.1 node_app_versions

Tracks which app version and model version each node is running. Updated on every NATS connection heartbeat.

```sql
-- supabase/migrations/20260324_w3_node_app_versions.sql
CREATE TABLE IF NOT EXISTS public.node_app_versions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id         text        NOT NULL,
  app_version     text        NOT NULL,
  model_version   text        NOT NULL,
  model_sha256    text        NOT NULL DEFAULT '',
  platform        text        NOT NULL CHECK (platform IN ('android', 'ios')),
  os_version      text        NOT NULL,
  device_class    text,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT node_app_versions_node_id_key UNIQUE (node_id)
);

CREATE INDEX IF NOT EXISTS idx_node_app_versions_node_id
  ON public.node_app_versions (node_id);

CREATE INDEX IF NOT EXISTS idx_node_app_versions_model_version
  ON public.node_app_versions (model_version);

CREATE INDEX IF NOT EXISTS idx_node_app_versions_last_seen_at
  ON public.node_app_versions (last_seen_at DESC);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER node_app_versions_updated_at
BEFORE UPDATE ON public.node_app_versions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.node_app_versions ENABLE ROW LEVEL SECURITY;

-- Nodes can only upsert their own row (identified by node_id claim in JWT)
CREATE POLICY "node can upsert own app version"
  ON public.node_app_versions
  FOR ALL
  USING (node_id = (current_setting('request.jwt.claims', true)::json->>'node_id'))
  WITH CHECK (node_id = (current_setting('request.jwt.claims', true)::json->>'node_id'));

-- Service role has full access (for W2 operator queries)
CREATE POLICY "service role full access node_app_versions"
  ON public.node_app_versions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

---

### 3.2 push_tokens

Stores Expo push tokens per node. Used by W2 to send alerts via Expo Push API.

```sql
-- supabase/migrations/20260324_w3_push_tokens.sql
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id         text        NOT NULL,
  expo_push_token text        NOT NULL,
  platform        text        NOT NULL CHECK (platform IN ('android', 'ios')),
  is_active       boolean     NOT NULL DEFAULT true,
  registered_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz,
  deregistered_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_tokens_node_id_key UNIQUE (node_id)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_node_id
  ON public.push_tokens (node_id);

CREATE INDEX IF NOT EXISTS idx_push_tokens_is_active
  ON public.push_tokens (is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_push_tokens_platform
  ON public.push_tokens (platform);

CREATE TRIGGER push_tokens_updated_at
BEFORE UPDATE ON public.push_tokens
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "node can manage own push token"
  ON public.push_tokens
  FOR ALL
  USING (node_id = (current_setting('request.jwt.claims', true)::json->>'node_id'))
  WITH CHECK (node_id = (current_setting('request.jwt.claims', true)::json->>'node_id'));

CREATE POLICY "service role full access push_tokens"
  ON public.push_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

---

### 3.3 node_consent_audit

Immutable audit log of consent grant/revoke events. Written by Edge Function, never updated.

```sql
-- supabase/migrations/20260324_w3_node_consent_audit.sql
CREATE TABLE IF NOT EXISTS public.node_consent_audit (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id         text        NOT NULL,
  action          text        NOT NULL CHECK (action IN ('GRANT', 'REVOKE', 'UPDATE')),
  consent_version text        NOT NULL,
  platform        text        NOT NULL,
  app_version     text        NOT NULL,
  ip_hash         text,
  occurred_at     timestamptz NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_node_consent_audit_node_id
  ON public.node_consent_audit (node_id);

CREATE INDEX IF NOT EXISTS idx_node_consent_audit_occurred_at
  ON public.node_consent_audit (occurred_at DESC);

-- RLS: insert only for authenticated nodes, no update/delete ever
ALTER TABLE public.node_consent_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "node can insert own consent audit"
  ON public.node_consent_audit
  FOR INSERT
  WITH CHECK (node_id = (current_setting('request.jwt.claims', true)::json->>'node_id'));

-- No SELECT policy for regular nodes — consent audit is write-only from mobile
CREATE POLICY "service role full access consent_audit"
  ON public.node_consent_audit
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

---

### 3.4 Additions to Existing node_registrations Table

W2 owns the primary `node_registrations` table. W3 requires the following columns be added:

```sql
-- supabase/migrations/20260324_w3_node_registrations_additions.sql
ALTER TABLE public.node_registrations
  ADD COLUMN IF NOT EXISTS platform          text,
  ADD COLUMN IF NOT EXISTS os_version        text,
  ADD COLUMN IF NOT EXISTS app_version       text,
  ADD COLUMN IF NOT EXISTS model_version     text,
  ADD COLUMN IF NOT EXISTS consent_version   text    DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS consent_at        timestamptz,
  ADD COLUMN IF NOT EXISTS push_token        text,
  ADD COLUMN IF NOT EXISTS last_active_at    timestamptz;

CREATE INDEX IF NOT EXISTS idx_node_registrations_platform
  ON public.node_registrations (platform);

CREATE INDEX IF NOT EXISTS idx_node_registrations_last_active_at
  ON public.node_registrations (last_active_at DESC);
```

---

## 4. SQLite Repository Interfaces

### 4.1 NodeConfigRepo
```typescript
interface NodeConfigRepo {
  get(): Promise<NodeConfig | null>;
  upsert(config: Partial<NodeConfig>): Promise<void>;
  setModelVersion(version: string, sha256: string, path: string): Promise<void>;
  setConsent(version: string, grantedAt: Date): Promise<void>;
  setAlertMute(until: Date | null): Promise<void>;
  setVADThreshold(rms: number): Promise<void>;
  setPreferredMeshDevice(deviceId: string | null): Promise<void>;
}
```

### 4.2 PendingEventsRepo
```typescript
interface PendingEventsRepo {
  insert(event: DetectionEvent): Promise<void>;
  getFIFO(limit: number): Promise<PendingEvent[]>;
  deleteById(id: number): Promise<void>;
  count(): Promise<number>;
  incrementRetry(id: number): Promise<void>;
  pruneOldest(keepCount: number): Promise<number>; // returns deleted count
}
```

### 4.3 AlertHistoryRepo
```typescript
interface AlertHistoryRepo {
  insert(alert: Alert): Promise<void>;
  getRecent(limit: number, severityMin?: number): Promise<Alert[]>;
  markRead(alertId: string): Promise<void>;
  markAllRead(): Promise<void>;
  getUnreadCount(): Promise<number>;
  pruneOlderThan(days: number): Promise<number>;
}
```

### 4.4 CalibrationRepo
```typescript
interface CalibrationRepo {
  insert(calibration: CalibrationResult): Promise<void>;
  getLatest(): Promise<CalibrationResult | null>;
  getHistory(limit: number): Promise<CalibrationResult[]>;
  updateAfterDetectionCount(calibrationId: string, count: number): Promise<void>;
}
```

---

## 5. TypeScript Types

```typescript
// types/db.ts

export interface NodeConfig {
  id: string;
  nodeId: string;
  nickname: string;
  natsWsUrl: string;
  natsToken: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  detectionThreshold: number;
  vadAmbientRms: number;
  modelVersion: string;
  modelSha256: string;
  modelPath: string;
  preferredMeshDevice: string | null;
  alertMutedUntil: Date | null;
  consentGrantedAt: Date | null;
  consentVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PendingEvent {
  id: number;
  eventId: string;
  nodeId: string;
  eventType: string;
  confidence: number;
  modelVersion: string;
  inferenceMs: number;
  lat: number | null;
  lng: number | null;
  geohash: string | null;
  detectedAt: Date;
  natsSubject: string;
  payloadJson: string;
  retryCount: number;
  createdAt: Date;
}

export interface AlertRecord {
  id: number;
  alertId: string;
  severity: number;
  eventType: string;
  sourceGeohash: string;
  lat: number | null;
  lng: number | null;
  distanceM: number | null;
  confirmedBy: number;
  detailsJson: string;
  isRead: boolean;
  alertAt: Date;
  receivedAt: Date;
  pushSent: boolean;
}

export interface CalibrationRecord {
  id: number;
  calibrationId: string;
  nodeId: string;
  ambientRms: number;
  ambientRmsStd: number;
  vadThresholdSet: number;
  spectralCentroid: number | null;
  dominantFreqHz: number | null;
  durationS: number;
  lat: number | null;
  lng: number | null;
  geohash: string | null;
  detections24hBefore: number;
  detections24hAfter: number | null;
  modelVersion: string;
  notes: string | null;
  calibratedAt: Date;
}
```
