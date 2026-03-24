# APEX-SENTINEL W2 — Functional Requirements Register

**Document ID:** FR_REGISTER-W2
**Wave:** W2 — Infrastructure Backbone
**Status:** IN PROGRESS
**Owner:** Nicolae Fratila
**Created:** 2026-03-24
**Last Updated:** 2026-03-24
**Supabase Project:** bymfcnwfyxuivinuzurr (eu-west-2, London)

---

## 1. Overview

This register is the authoritative source of truth for all Functional Requirements scoped to Wave 2 of APEX-SENTINEL. W2 wires the infrastructure backbone connecting W1's on-device acoustic/RF detection pipeline to the cloud backend. The scope covers NATS JetStream cluster formation, Supabase schema materialisation, all four Edge Functions, the TDoA correlation service, alert routing, Meshtastic bridge, CoT relay to FreeTAKServer, Supabase Realtime dashboard feed, mTLS authentication, circuit breaker + DLQ patterns, and RLS policy audit.

### 1.1 Status Definitions

| Status | Meaning |
|--------|---------|
| RED | Failing tests exist; implementation not started or broken |
| GREEN | All acceptance criteria met; tests passing |
| DEFERRED | Descoped from W2; moved to later wave |
| IN PROGRESS | Implementation underway; tests partially passing |

### 1.2 Priority Definitions

| Priority | Meaning |
|----------|---------|
| P0 | Wave blocker — W2 cannot ship without this |
| P1 | Required for W2 but non-blocking on critical path |
| P2 | Nice-to-have in W2; acceptable to defer to W3 |

### 1.3 Dependency Map Summary

```
W1 Modules (inputs to W2):
  W1-AudioPipeline  → FR-W2-01, FR-W2-02
  W1-RFDetector     → FR-W2-01, FR-W2-02
  W1-NodeAgent      → FR-W2-04, FR-W2-13

W2 Internal Dependencies:
  FR-W2-01 (cluster) → FR-W2-02 (streams) → FR-W2-05 (ingest-event)
  FR-W2-03 (schema)  → FR-W2-04, FR-W2-05, FR-W2-06, FR-W2-07
  FR-W2-13 (mTLS)    → FR-W2-01, FR-W2-04
  FR-W2-08 (TDoA)    → FR-W2-02, FR-W2-03
  FR-W2-14 (DLQ)     → FR-W2-02, FR-W2-05
  FR-W2-15 (RLS)     → FR-W2-03

W2 Outputs (inputs to W3/W4):
  FR-W2-12 → W4 C2 Dashboard
  FR-W2-11 → W4 TAK integration
  FR-W2-09 → W3 operator workflow
```

---

## 2. Requirements Register

---

### FR-W2-01: NATS JetStream Cluster Formation

**FR ID:** FR-W2-01
**Title:** NATS JetStream 5-Node Raft Cluster Formation
**Priority:** P0
**Status:** RED
**Risk Level:** HIGH

#### 2.1.1 Description

Deploy and validate a 5-node NATS JetStream cluster using the Raft consensus protocol across the internal DNS addresses nats1.apex-sentinel.internal through nats5.apex-sentinel.internal. The cluster must elect a leader within 5 seconds of quorum and survive loss of any 2 nodes (minority fault tolerance). All nodes must expose client port 4222, cluster port 6222, and monitoring port 8222.

Each node is deployed as a systemd service on a Debian 12 VM with a dedicated data directory at `/var/lib/nats/jetstream/`. The cluster configuration uses cluster name `APEX-SENTINEL-PROD` with explicit route advertisements between all peers. JetStream must be enabled on all nodes with per-node storage limits set to 50 GB. Server credentials are managed via nkey-based authentication; operator JWT must be pre-loaded before first start.

#### 2.1.2 Acceptance Criteria

- [ ] All 5 NATS servers start without error; `nats-server --version` returns 2.10.x or later on each node
- [ ] `nats server report jetstream` from any cluster node shows all 5 nodes as `cluster_peers` with `current` raft state
- [ ] Stopping nats3 and nats4 (2-node minority failure) does not interrupt reads or writes on surviving nodes; writes resume within 5 seconds after kill
- [ ] JetStream meta-leader election completes within 5 seconds of quorum formation on fresh cluster init
- [ ] Monitoring endpoint `http://nats1.apex-sentinel.internal:8222/varz` returns HTTP 200 with `"cluster_name": "APEX-SENTINEL-PROD"` in the JSON payload
- [ ] Systemd unit `nats-server.service` on each node has `Restart=on-failure` (NOT `Restart=always`) and `TimeoutStartSec=30`

#### 2.1.3 Test IDs

| Test ID | Description | Type |
|---------|-------------|------|
| FR-W2-01-01 | Cluster forms with 5 nodes; all peers visible in `/routez` | Integration |
| FR-W2-01-02 | Leader election completes within 5s on cold start | Integration |
| FR-W2-01-03 | 2-node failure; writes continue on 3-node quorum | Integration |
| FR-W2-01-04 | Node restart re-joins cluster without data loss | Integration |
| FR-W2-01-05 | JetStream enabled; `nats account info` shows JetStream active | Unit/Smoke |
| FR-W2-01-06 | Monitoring port 8222 returns valid JSON health payload | Smoke |
| FR-W2-01-07 | Systemd unit defined with `Restart=on-failure`; not `Restart=always` | Config audit |

#### 2.1.4 Dependencies

- W1: Node agent must have NATS client connectivity (nats.go or nats.js)
- Infra: DNS records for nats1–nats5.apex-sentinel.internal must resolve before cluster start
- Infra: Tailscale mesh must be active across all 5 nodes
- FR-W2-13: mTLS/nkey auth must be provisioned before production cluster start (dev cluster may use `--no-auth` temporarily)

#### 2.1.5 Implementation Notes

```
/etc/nats/nats-server.conf per node (example nats1):
  server_name: nats1
  listen: 0.0.0.0:4222
  cluster {
    name: APEX-SENTINEL-PROD
    listen: 0.0.0.0:6222
    routes: [
      nats-route://nats2.apex-sentinel.internal:6222
      nats-route://nats3.apex-sentinel.internal:6222
      nats-route://nats4.apex-sentinel.internal:6222
      nats-route://nats5.apex-sentinel.internal:6222
    ]
  }
  jetstream {
    store_dir: /var/lib/nats/jetstream
    max_memory_store: 4GB
    max_file_store: 50GB
  }
```

---

### FR-W2-02: NATS JetStream Stream Definitions

**FR ID:** FR-W2-02
**Title:** Define and configure all four JetStream streams: DETECTIONS, NODE_HEALTH, ALERTS, COT_EVENTS
**Priority:** P0
**Status:** RED
**Risk Level:** HIGH

#### 2.2.1 Description

Create and configure four durable JetStream streams on the APEX-SENTINEL-PROD cluster. Each stream must have explicit subject filters, retention policies, storage backends, replication factors, and consumer configurations. Streams must be idempotent to create (running the provisioning script twice must not error). Configuration is managed via the NATS CLI provisioning script at `infra/nats/provision-streams.sh`.

The four streams are:
- **DETECTIONS**: Captures raw detection events from all nodes. Subjects: `sentinel.detections.>`. Retention: limits (max 10M messages, 100 GB). Replication: R3.
- **NODE_HEALTH**: Heartbeat and health payloads from nodes. Subjects: `sentinel.health.>`. Retention: limits (max 1M messages, 10 GB). Replication: R3.
- **ALERTS**: Confirmed threat alerts after TDoA/classifier confirmation. Subjects: `sentinel.alerts.>`. Retention: work-queue (exactly-once delivery). Replication: R5.
- **COT_EVENTS**: Cursor-on-Target XML events destined for FreeTAKServer. Subjects: `sentinel.cot.>`. Retention: limits (max 500K messages, 5 GB). Replication: R3.

#### 2.2.2 Acceptance Criteria

- [ ] `nats stream list` returns all four streams: DETECTIONS, NODE_HEALTH, ALERTS, COT_EVENTS
- [ ] DETECTIONS stream accepts publish to `sentinel.detections.node-abc-123`; `nats stream info DETECTIONS` shows message count incrementing
- [ ] ALERTS stream configured as work-queue; each message delivered exactly once to a single consumer; duplicate delivery on ACK timeout is re-queued (not re-broadcasted)
- [ ] All streams have replication factor matching spec (DETECTIONS R3, ALERTS R5); verified via `nats stream info <name>` showing `"num_replicas"`
- [ ] Provisioning script is idempotent: running twice returns "stream already exists" without error exit code
- [ ] Dead-letter subject `sentinel.dlq.>` is configured as the NACK destination for ALERTS stream (feeds FR-W2-14)

#### 2.2.3 Test IDs

| Test ID | Description | Type |
|---------|-------------|------|
| FR-W2-02-01 | All 4 streams present after provision script runs | Integration |
| FR-W2-02-02 | Publish to `sentinel.detections.test-node`; verify stream seq increments | Integration |
| FR-W2-02-03 | ALERTS work-queue: two consumers on same stream; each message delivered to exactly one | Integration |
| FR-W2-02-04 | NACK on ALERTS moves message to DLQ after 3 retries | Integration |
| FR-W2-02-05 | Provisioning script idempotent on double-run | Unit/Smoke |
| FR-W2-02-06 | Stream replication factors match spec | Config audit |
| FR-W2-02-07 | COT_EVENTS stream rejects publish to `sentinel.other.x` (subject not in filter) | Integration |

#### 2.2.4 Dependencies

- FR-W2-01: Cluster must be running before streams can be created
- FR-W2-14: DLQ stream design must be confirmed before ALERTS NACK config is set
- W1: Subject naming convention (`sentinel.detections.{nodeId}`) must match W1 node agent publish targets

#### 2.2.5 Subject Hierarchy

```
sentinel.detections.{nodeId}          — raw detection event (JSON)
sentinel.health.{nodeId}              — node heartbeat + metrics (JSON)
sentinel.alerts.{alertId}             — confirmed threat alert (JSON)
sentinel.cot.{trackId}               — CoT XML event (UTF-8 encoded XML string)
sentinel.dlq.detections.{nodeId}     — DLQ for failed detection processing
sentinel.dlq.alerts.{alertId}        — DLQ for failed alert delivery
```

---

### FR-W2-03: Supabase Schema Materialisation

**FR ID:** FR-W2-03
**Title:** Create and migrate all W2 Supabase tables: nodes, detection_events, tracks, alerts, node_health_log, lkgc_snapshots
**Priority:** P0
**Status:** RED
**Risk Level:** HIGH

#### 2.3.1 Description

Apply all W2 database migrations to the Supabase project `bymfcnwfyxuivinuzurr` (eu-west-2). Migrations are managed via the Supabase CLI and stored in `supabase/migrations/`. The schema covers six core tables that persist the detection pipeline state from NATS into durable relational storage. All tables must have correct primary keys, foreign key constraints, indexes for query patterns, and RLS enabled (policies deferred to FR-W2-15).

Every table must include `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` and `updated_at TIMESTAMPTZ` columns. All timestamp columns must store UTC. The `detection_events` table uses coarsened geographic coordinates (snapped to 100m grid) per privacy requirements documented in PRIVACY_ARCHITECTURE.md. UUID v7 is used for all primary keys where ordering by insertion time is required (nodes, detection_events, tracks, alerts).

#### 2.3.2 Table Schemas

```sql
-- nodes: registered sensor nodes
CREATE TABLE nodes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id       TEXT NOT NULL UNIQUE,          -- human-readable e.g. "APEX-NODE-001"
  tier          SMALLINT NOT NULL CHECK (tier IN (1, 2, 3)),
  capabilities  JSONB NOT NULL DEFAULT '{}',   -- {"acoustic": true, "rf": true, "meshtastic": false}
  location_lat  DOUBLE PRECISION,              -- coarsened to ~100m grid
  location_lon  DOUBLE PRECISION,
  location_alt  DOUBLE PRECISION,
  last_seen_at  TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'degraded')),
  firmware_ver  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ
);

-- detection_events: raw detection events from nodes
CREATE TABLE detection_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id       TEXT NOT NULL REFERENCES nodes(node_id) ON DELETE RESTRICT,
  event_type    TEXT NOT NULL CHECK (event_type IN ('acoustic', 'rf', 'combined')),
  detected_at   TIMESTAMPTZ NOT NULL,           -- node-local timestamp (may have skew)
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- server receipt time
  frequency_hz  BIGINT,                         -- RF: center frequency
  classifier    TEXT,                           -- e.g. "drone-dji-phantom4"
  confidence    NUMERIC(5,4) CHECK (confidence BETWEEN 0 AND 1),
  snr_db        NUMERIC(6,2),
  audio_hash    TEXT,                           -- SHA-256 of raw audio segment
  payload       JSONB NOT NULL DEFAULT '{}',    -- classifier-specific metadata
  track_id      UUID REFERENCES tracks(id) ON DELETE SET NULL,
  lat_coarse    DOUBLE PRECISION,               -- snapped to 0.001 deg (~100m)
  lon_coarse    DOUBLE PRECISION,
  nats_seq      BIGINT,                         -- NATS JetStream sequence for dedup
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- tracks: correlated multi-node detection tracks
CREATE TABLE tracks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_ref     TEXT NOT NULL UNIQUE,           -- e.g. "TRK-20260324-0001"
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'false_positive')),
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at  TIMESTAMPTZ,
  node_ids      TEXT[] NOT NULL DEFAULT '{}',   -- contributing nodes
  tdoa_solution JSONB,                          -- TDoA estimated position
  classifier    TEXT,                           -- consensus classifier label
  confidence    NUMERIC(5,4),
  threat_level  SMALLINT CHECK (threat_level BETWEEN 1 AND 5),
  alert_id      UUID REFERENCES alerts(id) ON DELETE SET NULL,
  cot_uid       TEXT,                           -- FreeTAKServer CoT UID
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ
);

-- alerts: confirmed threat alerts
CREATE TABLE alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_ref     TEXT NOT NULL UNIQUE,           -- e.g. "ALT-20260324-0001"
  track_id      UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  severity      TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'false_positive')),
  triggered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at   TIMESTAMPTZ,
  acknowledged_by TEXT,                         -- operator user_id
  channels      TEXT[] NOT NULL DEFAULT '{}',   -- ['telegram', 'realtime', 'cot']
  telegram_msg_id BIGINT,                       -- Telegram message ID for dedup
  payload       JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ
);

-- node_health_log: heartbeat + metrics history
CREATE TABLE node_health_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id       TEXT NOT NULL REFERENCES nodes(node_id) ON DELETE CASCADE,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cpu_pct       NUMERIC(5,2),
  mem_pct       NUMERIC(5,2),
  disk_pct      NUMERIC(5,2),
  battery_pct   NUMERIC(5,2),
  temp_celsius  NUMERIC(5,2),
  nats_connected BOOLEAN NOT NULL DEFAULT FALSE,
  sdr_active    BOOLEAN NOT NULL DEFAULT FALSE,
  audio_active  BOOLEAN NOT NULL DEFAULT FALSE,
  events_last_60s INTEGER DEFAULT 0,
  payload       JSONB NOT NULL DEFAULT '{}'
);

-- lkgc_snapshots: last-known-good-configuration snapshots
CREATE TABLE lkgc_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id       TEXT NOT NULL REFERENCES nodes(node_id) ON DELETE CASCADE,
  snapshot_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  config        JSONB NOT NULL,
  firmware_ver  TEXT NOT NULL,
  sha256        TEXT NOT NULL,                  -- SHA-256 of config JSON
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  deployed_by   TEXT
);
```

#### 2.3.3 Acceptance Criteria

- [ ] All 6 tables exist in Supabase project `bymfcnwfyxuivinuzurr`; `SELECT tablename FROM pg_tables WHERE schemaname = 'public'` returns all six
- [ ] Foreign key constraints enforced: inserting a `detection_events` row with non-existent `node_id` returns `23503 foreign_key_violation`
- [ ] UUID primary keys auto-generated on insert (no application-side UUID generation required)
- [ ] `nats_seq` UNIQUE constraint on `detection_events` prevents duplicate NATS message ingestion (dedup guard)
- [ ] RLS is ENABLED on all tables (`SELECT relrowsecurity FROM pg_class WHERE relname = 'nodes'` returns `t`)
- [ ] Indexes created: `detection_events(node_id, detected_at)`, `detection_events(track_id)`, `tracks(status, last_seen_at)`, `node_health_log(node_id, recorded_at DESC)`
- [ ] Migration is idempotent via `IF NOT EXISTS` guards; running twice does not error

#### 2.3.4 Test IDs

| Test ID | Description | Type |
|---------|-------------|------|
| FR-W2-03-01 | All 6 tables present in public schema | Migration test |
| FR-W2-03-02 | FK violation raised on orphan detection_events insert | Integration |
| FR-W2-03-03 | Duplicate nats_seq on detection_events raises unique violation | Integration |
| FR-W2-03-04 | RLS enabled on all 6 tables | Config audit |
| FR-W2-03-05 | Index on detection_events(node_id, detected_at) exists and is used by EXPLAIN | Performance |
| FR-W2-03-06 | lkgc_snapshots insert and retrieve full config JSON roundtrip | Integration |
| FR-W2-03-07 | Migration script idempotent on double-run | Smoke |

#### 2.3.5 Dependencies

- Supabase project `bymfcnwfyxuivinuzurr` must be active and accessible
- FR-W2-15: RLS policies (separate FR) depend on this schema being present
- FR-W2-04, FR-W2-05, FR-W2-06, FR-W2-07: All Edge Functions read/write these tables

---

### FR-W2-04: register-node Edge Function

**FR ID:** FR-W2-04
**Title:** Supabase Edge Function — register-node: Node registration and JWT issuance
**Priority:** P0
**Status:** RED
**Risk Level:** MEDIUM

#### 2.4.1 Description

Implement the `register-node` Supabase Edge Function (Deno runtime, TypeScript). This function handles initial and re-registration of sensor nodes. On first registration it inserts a row into the `nodes` table and issues a signed JWT with the node's capabilities and tier encoded in claims. On re-registration it updates `last_seen_at`, `firmware_ver`, and `status`. The function validates the node's mTLS client certificate fingerprint (passed as header `X-Node-Cert-Fingerprint`) against the allowlist in Supabase Vault before issuing or renewing the JWT.

JWT claims include: `sub` (node_id), `tier`, `capabilities`, `iat`, `exp` (24-hour TTL), `iss` ("apex-sentinel"), `aud` ("nats"). The JWT is signed with a secret stored in Supabase Vault (`SENTINEL_JWT_SECRET`). This JWT is what the node presents to the NATS server for authentication (see FR-W2-13).

#### 2.4.2 Request/Response Schema

```
POST /functions/v1/register-node
Headers:
  Authorization: Bearer <supabase-anon-key>   (service role for bootstrap)
  X-Node-Cert-Fingerprint: <sha256-hex>        (mTLS cert fingerprint)
  Content-Type: application/json

Request body:
{
  "node_id": "APEX-NODE-001",
  "tier": 1,
  "capabilities": {
    "acoustic": true,
    "rf": true,
    "meshtastic": false
  },
  "location": {
    "lat": 51.5074,
    "lon": -0.1278,
    "alt": 15.0
  },
  "firmware_ver": "1.2.3"
}

Response 200:
{
  "node_id": "APEX-NODE-001",
  "jwt": "<signed-jwt>",
  "nats_server": "nats://nats1.apex-sentinel.internal:4222",
  "expires_at": "2026-03-25T12:00:00Z",
  "registered": true
}

Response 401: { "error": "cert_fingerprint_not_in_allowlist" }
Response 409: { "error": "node_id_conflict", "existing_tier": 2 }
Response 422: { "error": "invalid_payload", "details": [...] }
```

#### 2.4.3 Acceptance Criteria

- [ ] POST with valid cert fingerprint and payload inserts into `nodes` table and returns JWT with correct claims
- [ ] Re-registration (same node_id) does NOT insert duplicate row; updates `last_seen_at` and `firmware_ver`; returns fresh JWT
- [ ] POST with cert fingerprint not in Vault allowlist returns HTTP 401
- [ ] JWT expiry is exactly 24 hours from issuance; `exp` claim verified in unit test
- [ ] Location coordinates are coarsened to 3 decimal places (0.001 deg ≈ 100m) before persisting
- [ ] Function cold-start latency (p99) < 200ms measured via Supabase Edge Function logs

#### 2.4.4 Test IDs

| Test ID | Description | Type |
|---------|-------------|------|
| FR-W2-04-01 | First registration inserts node row and returns signed JWT | Integration |
| FR-W2-04-02 | Re-registration updates last_seen_at without duplicate row | Integration |
| FR-W2-04-03 | Unknown cert fingerprint → 401 | Integration |
| FR-W2-04-04 | JWT exp claim is exactly now + 86400s | Unit |
| FR-W2-04-05 | Location coarsened to 3 dp before persist | Unit |
| FR-W2-04-06 | Invalid payload (missing node_id) → 422 | Unit |
| FR-W2-04-07 | Cold start latency < 200ms (smoke test against deployed function) | Smoke/Perf |

#### 2.4.5 Dependencies

- FR-W2-03: `nodes` table must exist
- FR-W2-13: mTLS cert fingerprint allowlist must be seeded in Supabase Vault
- Supabase Vault secret `SENTINEL_JWT_SECRET` must be provisioned

---

### FR-W2-05: ingest-event Edge Function

**FR ID:** FR-W2-05
**Title:** Supabase Edge Function — ingest-event: Detection event ingestion from NATS to Supabase
**Priority:** P0
**Status:** RED
**Risk Level:** HIGH

#### 2.5.1 Description

Implement the `ingest-event` Supabase Edge Function. This function is invoked by a NATS JetStream push consumer that forwards events from the DETECTIONS stream to Supabase. The function receives batches of up to 100 detection events per invocation (to amortise cold-start overhead), inserts them into `detection_events` using an UPSERT on `nats_seq` to guarantee idempotency, and triggers track association via a Postgres function call.

The function must validate the JWT passed in the `Authorization` header (issued by `register-node`), verify the `node_id` in the JWT matches the `node_id` in the payload, and reject mismatches with HTTP 403. After successful batch insert, the function publishes a summary event to the `sentinel.detections.ingested` NATS subject for downstream consumers (TDoA service, Realtime feed).

#### 2.5.2 Request/Response Schema

```
POST /functions/v1/ingest-event
Headers:
  Authorization: Bearer <node-jwt>
  Content-Type: application/json

Request body (batch):
{
  "events": [
    {
      "node_id": "APEX-NODE-001",
      "event_type": "acoustic",
      "detected_at": "2026-03-24T10:00:00.123Z",
      "frequency_hz": null,
      "classifier": "drone-dji-phantom4",
      "confidence": 0.9342,
      "snr_db": 18.5,
      "audio_hash": "sha256:abc...",
      "nats_seq": 100234,
      "payload": {}
    }
  ]
}

Response 200:
{
  "inserted": 1,
  "skipped_duplicates": 0,
  "track_associations": 1
}

Response 403: { "error": "node_id_mismatch" }
Response 400: { "error": "batch_too_large", "max": 100 }
```

#### 2.5.3 Acceptance Criteria

- [ ] Single event insert succeeds; row appears in `detection_events` with correct `nats_seq`
- [ ] Duplicate `nats_seq` triggers UPSERT; no new row inserted; `inserted: 0, skipped_duplicates: 1` returned
- [ ] Batch of 100 events inserts within 500ms (p95) measured against Supabase eu-west-2
- [ ] JWT with `node_id: APEX-NODE-001` attempting to insert events with `node_id: APEX-NODE-002` → HTTP 403
- [ ] After insert, Postgres trigger `fn_associate_detection_to_track()` is invoked and populates `track_id` on matching events
- [ ] Function handles NATS JetStream batch format (array of CloudEvents-compatible JSON objects)

#### 2.5.4 Test IDs

| Test ID | Description | Type |
|---------|-------------|------|
| FR-W2-05-01 | Single event insert succeeds with correct nats_seq | Integration |
| FR-W2-05-02 | Duplicate nats_seq → upsert, no new row, correct response counts | Integration |
| FR-W2-05-03 | 100-event batch insert within 500ms | Performance |
| FR-W2-05-04 | node_id mismatch between JWT and payload → 403 | Integration |
| FR-W2-05-05 | Postgres trigger fn_associate_detection_to_track called after insert | Integration |
| FR-W2-05-06 | Batch > 100 → 400 batch_too_large | Unit |
| FR-W2-05-07 | Invalid JWT (tampered signature) → 401 | Unit |

#### 2.5.5 Dependencies

- FR-W2-03: `detection_events` table must exist
- FR-W2-04: JWT format and signing secret must match
- FR-W2-02: DETECTIONS stream must be providing events
- FR-W2-08: TDoA service consumes `sentinel.detections.ingested` published by this function

---

### FR-W2-06: node-health Edge Function

**FR ID:** FR-W2-06
**Title:** Supabase Edge Function — node-health: Node heartbeat and health metric ingestion
**Priority:** P1
**Status:** RED
**Risk Level:** MEDIUM

#### 2.6.1 Description

Implement the `node-health` Supabase Edge Function. Nodes publish heartbeat payloads to the NODE_HEALTH JetStream stream every 30 seconds. A NATS push consumer forwards these to this Edge Function. The function inserts a row into `node_health_log` and upserts `nodes.status`, `nodes.last_seen_at` based on the health payload. If a node has not reported health in >90 seconds, its status is set to `degraded`; >3 minutes → `offline`. A scheduled Postgres function `fn_mark_stale_nodes()` handles the degraded/offline transitions on a 60-second cron.

The function also checks battery level: if `battery_pct < 10`, it publishes an alert to `sentinel.alerts.{alertId}` with severity `warning` and channel `telegram`. This is the only case where node-health directly emits an alert.

#### 2.6.2 Acceptance Criteria

- [ ] Health payload from known node inserts into `node_health_log` and updates `nodes.last_seen_at`
- [ ] Node with `battery_pct: 8` triggers an alert row in `alerts` table with severity `warning`
- [ ] `fn_mark_stale_nodes()` cron runs every 60s; nodes not seen in 90s have status `degraded`; not seen in 3m → `offline`
- [ ] Unknown `node_id` in health payload returns HTTP 404 (not silently dropped)
- [ ] Response time (p99) < 150ms for single health payload insert

#### 2.6.3 Test IDs

| Test ID | Description | Type |
|---------|-------------|------|
| FR-W2-06-01 | Health insert updates nodes.last_seen_at | Integration |
| FR-W2-06-02 | battery_pct 8 triggers alert with severity warning | Integration |
| FR-W2-06-03 | Stale node cron marks degraded at 90s | Integration |
| FR-W2-06-04 | Unknown node_id → 404 | Unit |
| FR-W2-06-05 | p99 latency < 150ms for single insert | Performance |

#### 2.6.4 Dependencies

- FR-W2-03: `nodes` table and `node_health_log` table must exist
- FR-W2-02: NODE_HEALTH stream must be active
- FR-W2-07: Alert publishing pipeline must be reachable

---

### FR-W2-07: alert-router Edge Function

**FR ID:** FR-W2-07
**Title:** Supabase Edge Function — alert-router: Multi-channel alert delivery orchestration
**Priority:** P0
**Status:** RED
**Risk Level:** HIGH

#### 2.7.1 Description

Implement the `alert-router` Supabase Edge Function. This function subscribes to the ALERTS JetStream stream (work-queue consumer) and orchestrates delivery across configured channels: Telegram bot (FR-W2-09), Supabase Realtime broadcast (FR-W2-12), and CoT relay to FreeTAKServer (FR-W2-11). The function implements idempotency using `alerts.telegram_msg_id` to prevent duplicate Telegram notifications on retry. Each channel delivery result is recorded in `alerts.channels` array and `alerts.payload.delivery_log`.

For Telegram delivery, the function checks whether a message has already been sent for this `alert_id` by querying `alerts.telegram_msg_id IS NOT NULL`. If not null, it skips Telegram and returns HTTP 200 with `{"channels": {"telegram": "already_sent"}}`. Circuit breaker state per channel is maintained in Supabase KV (not Redis — see FR-W2-14). If a channel is in OPEN circuit state, delivery is skipped and the message is written to the DLQ.

#### 2.7.2 Acceptance Criteria

- [ ] Alert with channels `['telegram', 'realtime', 'cot']` triggers all three delivery attempts
- [ ] Duplicate delivery prevented: re-processing same alert_id does not send second Telegram message
- [ ] If Telegram API returns 429, alert-router backs off and re-queues alert to ALERTS stream (not drops)
- [ ] Channel with OPEN circuit breaker: delivery skipped, alert written to DLQ, HTTP 200 returned (not 500)
- [ ] `alerts.payload.delivery_log` contains per-channel result `{channel, status, timestamp, error?}` after each invocation

#### 2.7.3 Test IDs

| Test ID | Description | Type |
|---------|-------------|------|
| FR-W2-07-01 | All 3 channels attempted on fresh alert | Integration |
| FR-W2-07-02 | Telegram dedup: second invocation with same alert_id skips send | Integration |
| FR-W2-07-03 | Telegram 429 → re-queue to ALERTS stream | Integration |
| FR-W2-07-04 | Open circuit breaker → DLQ write, 200 returned | Integration |
| FR-W2-07-05 | delivery_log populated correctly in alerts.payload | Integration |
| FR-W2-07-06 | Missing alert_id in payload → 400 | Unit |

#### 2.7.4 Dependencies

- FR-W2-03: `alerts` table must exist
- FR-W2-02: ALERTS stream must be configured as work-queue
- FR-W2-09: Telegram bot credentials must be in Supabase Vault
- FR-W2-11: CoT relay endpoint must be reachable
- FR-W2-12: Supabase Realtime channel must be active
- FR-W2-14: Circuit breaker state store must be available

---

### FR-W2-08: TDoA Correlation Service

**FR ID:** FR-W2-08
**Title:** Time-Difference-of-Arrival (TDoA) Correlation Service
**Priority:** P0
**Status:** RED
**Risk Level:** HIGH

#### 2.8.1 Description

Implement the TDoA correlation service as a standalone Deno process (deployed on fortress VM, systemd-managed) that subscribes to the DETECTIONS JetStream stream and groups events from multiple nodes by time window and audio hash. For groups of ≥3 nodes detecting the same audio signature within a 500ms correlation window, the service solves the TDoA hyperbolic positioning problem using least-squares optimisation over the TDOA measurement set.

The service uses the node positions (from `nodes` table, fetched and cached with 60s TTL) and the speed of sound (343 m/s for standard conditions, configurable) to compute position estimates. Each solved position is written to `tracks.tdoa_solution` as a JSONB object containing: `estimated_lat`, `estimated_lon`, `estimated_alt`, `uncertainty_m` (CEP90 radius in metres), `contributing_nodes`, `residual_rms`. If the position estimate is within the sensor network coverage area, a track is created or updated in Supabase.

The 500ms correlation window is configurable via environment variable `TDOA_WINDOW_MS`. In high-latency mesh network deployments (Meshtastic relay nodes), this may need to be extended to 1500ms.

#### 2.8.2 Acceptance Criteria

- [ ] Three nodes detecting the same `audio_hash` within 500ms triggers TDoA computation
- [ ] TDoA solution written to `tracks.tdoa_solution` with all required fields
- [ ] `uncertainty_m` is computed as CEP90 from covariance matrix of LS solution
- [ ] Events from only 2 nodes (below minimum for TDoA) are logged to `tracks` with `tdoa_solution: null` and `status: active` (tracking but no position)
- [ ] Service handles node positions not in cache by fetching from Supabase REST API with 5s timeout
- [ ] Clock skew between nodes > 50ms is detected via residual analysis and flagged in `tracks.tdoa_solution.clock_skew_warning: true`

#### 2.8.3 Test IDs

| Test ID | Description | Type |
|---------|-------------|------|
| FR-W2-08-01 | 3-node detection within 500ms → TDoA solve → track.tdoa_solution populated | Integration |
| FR-W2-08-02 | 2-node detection → track created, tdoa_solution null | Integration |
| FR-W2-08-03 | TDoA position error < 50m for known test geometry (synthetic data) | Unit/Math |
| FR-W2-08-04 | uncertainty_m CEP90 computed from covariance matrix | Unit |
| FR-W2-08-05 | Clock skew > 50ms flagged in tdoa_solution | Unit |
| FR-W2-08-06 | Node position cache TTL 60s; stale cache refreshed | Integration |
| FR-W2-08-07 | Service restarts cleanly on NATS connection loss | Integration |
| FR-W2-08-08 | TDOA_WINDOW_MS env variable respected | Unit |

#### 2.8.4 Dependencies

- FR-W2-01: NATS cluster must be running
- FR-W2-02: DETECTIONS stream must be active
- FR-W2-03: `nodes` and `tracks` tables must exist
- W1-AudioPipeline: Audio hash generation must be deterministic across nodes for same source

#### 2.8.5 TDoA Algorithm Reference

```
For N nodes at positions (xi, yi) detecting arrival times ti:
  Define: Δtij = ti - tj  (TDOA measurement)
  Define: dij = c * Δtij  (range difference, c = 343 m/s)

  Hyperbolic equation set:
    sqrt((x-xi)^2 + (y-yi)^2) - sqrt((x-xj)^2 + (y-yj)^2) = dij

  Least-squares solution using Taylor linearisation:
    Iterate from initial estimate (centroid of contributing nodes)
    Stop when ||Δp|| < 1m or maxIter=50 reached

  Covariance estimate:
    P = σ² * (H^T * H)^(-1)  where H is Jacobian matrix
    σ² estimated from residual RMS
    CEP90 ≈ 2.146 * sqrt((σx² + σy²) / 2)
```

---

### FR-W2-09: Telegram Alert Bot

**FR ID:** FR-W2-09
**Title:** Telegram Alert Bot — real-time threat notification delivery
**Priority:** P1
**Status:** RED
**Risk Level:** MEDIUM

#### 2.9.1 Description

Implement the Telegram alert bot integration within the `alert-router` Edge Function. When `alert-router` processes an alert with `channels` including `telegram`, it calls the Telegram Bot API `sendMessage` method to the configured chat ID stored in Supabase Vault (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID`). Messages use HTML parse mode and include a structured alert summary. Message format uses box-drawing characters (NEVER pipe tables) for structured data in the message body.

The bot implements an idempotency guard: before sending, it checks `alerts.telegram_msg_id IS NULL`. After a successful send, it stores the returned `message_id` in `alerts.telegram_msg_id`. On Telegram rate limit (429), it backs off exponentially with base 5s and max 120s, re-queuing to the ALERTS stream rather than blocking.

#### 2.9.2 Telegram Message Format

```
🚨 APEX-SENTINEL ALERT — {severity}

Track:     {track_ref}
Alert:     {alert_ref}
Classifier:{classifier}
Confidence:{confidence}%
Threat:    {threat_level}/5

┌─────────────────────────────┐
│ Position (coarse)           │
│ Lat: {lat_coarse}           │
│ Lon: {lon_coarse}           │
│ Uncertainty: ±{uncertainty}m│
└─────────────────────────────┘

Nodes:    {node_count} contributing
Time:     {triggered_at} UTC

/ack_{alert_id_short} to acknowledge
```

#### 2.9.3 Acceptance Criteria

- [ ] Alert with telegram channel delivers message to correct chat ID
- [ ] `alerts.telegram_msg_id` populated after successful send
- [ ] Duplicate call with same alert_id does not send second message
- [ ] Telegram 429 triggers exponential backoff and re-queue (not drop)
- [ ] Message uses box-drawing chars for structured sections (no pipe tables)
- [ ] `/ack_{id}` command in message is parseable by future operator bot

#### 2.9.4 Test IDs

| Test ID | Description | Type |
|---------|-------------|------|
| FR-W2-09-01 | Message sent to correct chat ID for new alert | Integration |
| FR-W2-09-02 | telegram_msg_id populated after send | Integration |
| FR-W2-09-03 | Dedup: second call skips send | Integration |
| FR-W2-09-04 | 429 → backoff + re-queue | Unit/Integration |
| FR-W2-09-05 | Message format contains box-drawing chars | Unit |

#### 2.9.5 Dependencies

- FR-W2-07: alert-router must call this integration
- Vault secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID`

---

### FR-W2-10: Meshtastic Serial Bridge

**FR ID:** FR-W2-10
**Title:** Meshtastic Serial Bridge — RF relay node integration
**Priority:** P1
**Status:** RED
**Risk Level:** HIGH

#### 2.10.1 Description

Implement the Meshtastic serial bridge as a Python 3 daemon (systemd-managed) running on Tier-3 relay nodes. The bridge reads protobuf-encoded Meshtastic packets from the serial port (`/dev/ttyUSB0` or `/dev/ttyACM0`, auto-detected), decodes them using the `meshtastic` Python library, and republishes the decoded payload to the NATS DETECTIONS stream via the NATS Python client. The bridge handles serial disconnection by entering a reconnect loop with 10s backoff (max 60s); it does NOT crash on disconnect — it logs `WARNING: serial disconnected, retrying in Ns` and continues.

The bridge translates Meshtastic `NODEINFO_APP`, `POSITION_APP`, and `TELEMETRY_APP` packet types to APEX-SENTINEL event format. Unknown packet types are logged at DEBUG level and dropped. The bridge publishes to subject `sentinel.detections.{meshtastic_node_id}` where `meshtastic_node_id` is the Meshtastic long name or hex ID.

#### 2.10.2 Acceptance Criteria

- [ ] Bridge connects to serial port, reads Meshtastic packet, publishes to NATS DETECTIONS stream
- [ ] Serial disconnect triggers reconnect loop with 10s backoff; process does NOT exit
- [ ] Unknown packet types are dropped silently at DEBUG log level (not crash)
- [ ] `POSITION_APP` packets correctly decode lat/lon/alt and coarsen to 100m grid
- [ ] Bridge publishes to correct NATS subject `sentinel.detections.{meshtastic_node_id}`
- [ ] Systemd unit has `Restart=on-failure` (not `Restart=always`)

#### 2.10.3 Test IDs

| Test ID | Description | Type |
|---------|-------------|------|
| FR-W2-10-01 | Mock serial port: bridge reads packet, publishes to NATS | Unit |
| FR-W2-10-02 | Serial disconnect: process stays alive, reconnects | Integration |
| FR-W2-10-03 | Unknown packet type dropped, not crashed | Unit |
| FR-W2-10-04 | POSITION_APP coarsens correctly | Unit |
| FR-W2-10-05 | Correct NATS subject used for publish | Unit |

#### 2.10.4 Dependencies

- FR-W2-01: NATS cluster must be reachable from relay node
- FR-W2-13: Node JWT required for NATS authentication
- Hardware: Meshtastic-compatible radio module with serial interface

---

### FR-W2-11: CoT Relay to FreeTAKServer

**FR ID:** FR-W2-11
**Title:** CoT (Cursor-on-Target) XML relay to FreeTAKServer
**Priority:** P1
**Status:** RED
**Risk Level:** MEDIUM

#### 2.11.1 Description

Implement the CoT relay service as a Deno module integrated into `alert-router`. When an alert with channel `cot` is processed, the relay converts the track's TDoA solution and classifier metadata into a valid CoT XML event and sends it to FreeTAKServer over TCP (default) or UDP (fallback). The CoT event conforms to the MIL-STD-2525 symbol coding scheme; drone threats are mapped to SIDC `SFAPMFQ---------` (hostile air unmanned).

The relay validates the XML against the CoT schema before sending. Invalid XML is caught, the error is logged to `alerts.payload.delivery_log`, and the message is written to the DLQ (not sent to FreeTAKServer). The relay maintains a persistent TCP connection to FreeTAKServer with a 30s keepalive; connection failures trigger a reconnect with 5s exponential backoff.

#### 2.11.2 CoT XML Template

```xml
<?xml version="1.0" encoding="UTF-8"?>
<event version="2.0"
  uid="{cot_uid}"
  type="a-h-A-M-F-Q"
  time="{iso_time}"
  start="{iso_time}"
  stale="{stale_time}"
  how="m-g">
  <point lat="{lat}" lon="{lon}" hae="{alt}" ce="{uncertainty_m}" le="9999999.0"/>
  <detail>
    <track course="{course}" speed="{speed}"/>
    <contact callsign="APEX-{track_ref}"/>
    <remarks>classifier={classifier} confidence={confidence} sentinel_alert={alert_ref}</remarks>
    <__group name="APEX-SENTINEL" role="Team Member"/>
  </detail>
</event>
```

#### 2.11.3 Acceptance Criteria

- [ ] Valid CoT XML generated for alert with TDoA solution; XML parses without error
- [ ] CoT event delivered to FreeTAKServer TCP endpoint; server reflects contact in its track list
- [ ] Invalid XML (e.g., null lat) caught before send; error in delivery_log; written to DLQ
- [ ] TCP keepalive maintained; reconnect on disconnect within 10s
- [ ] CoT UID stored in `tracks.cot_uid` for cross-reference

#### 2.11.4 Test IDs

| Test ID | Description | Type |
|---------|-------------|------|
| FR-W2-11-01 | CoT XML generated and validates against schema | Unit |
| FR-W2-11-02 | Delivery to mock FreeTAKServer TCP endpoint | Integration |
| FR-W2-11-03 | Null lat → invalid XML caught, DLQ write | Unit |
| FR-W2-11-04 | TCP reconnect within 10s on connection drop | Integration |
| FR-W2-11-05 | cot_uid stored in tracks table | Integration |

#### 2.11.5 Dependencies

- FR-W2-07: alert-router invokes CoT relay
- FR-W2-03: `tracks.cot_uid` column must exist
- External: FreeTAKServer instance reachable from fortress VM

---

### FR-W2-12: Supabase Realtime Dashboard Feed

**FR ID:** FR-W2-12
**Title:** Supabase Realtime broadcast channel for C2 dashboard (W4)
**Priority:** P1
**Status:** RED
**Risk Level:** LOW

#### 2.12.1 Description

Configure Supabase Realtime to broadcast detection events, track updates, and alerts to the C2 dashboard (implemented in W4). Use Supabase Realtime Broadcast for low-latency push (not Postgres CDC, which adds 100–500ms overhead). The `alert-router` function publishes to Realtime channel `sentinel:alerts` after successful alert creation. The `ingest-event` function publishes track update events to `sentinel:tracks:{trackId}`.

The Realtime channel requires the connecting client to present a valid Supabase anon JWT with custom claim `role: operator`. RLS on `alerts` and `tracks` restricts visibility to the operator's assigned region (column `region_id`). W4 dashboard subscribes to `sentinel:alerts` on load and uses optimistic updates for the track map.

#### 2.12.2 Acceptance Criteria

- [ ] Realtime broadcast to `sentinel:alerts` fires within 50ms of alert insert
- [ ] Client with `role: operator` JWT receives broadcast; client with missing claim is rejected
- [ ] Track update events published to `sentinel:tracks:{trackId}` on every TDoA solve
- [ ] Realtime channel does not expose full `detection_events` payload (only alert summary and track position)
- [ ] W4 dashboard stub receives and renders Realtime events (smoke test)

#### 2.12.3 Test IDs

| Test ID | Description | Type |
|---------|-------------|------|
| FR-W2-12-01 | Alert insert → Realtime broadcast within 50ms | Integration |
| FR-W2-12-02 | operator JWT required; missing claim rejected | Integration |
| FR-W2-12-03 | Track update published on TDoA solve | Integration |
| FR-W2-12-04 | detection_events full payload not leaked via Realtime | Security |

#### 2.12.4 Dependencies

- FR-W2-03: `alerts` and `tracks` tables
- FR-W2-07: alert-router publishes to Realtime channel
- FR-W2-15: RLS policies gate Realtime access

---

### FR-W2-13: mTLS Authentication Between Nodes and NATS

**FR ID:** FR-W2-13
**Title:** mTLS certificate chain for node-to-NATS authentication
**Priority:** P0
**Status:** RED
**Risk Level:** HIGH

#### 2.13.1 Description

Establish a full mTLS authentication chain between sensor nodes and the NATS JetStream cluster. The chain consists of: Root CA (offline, air-gapped), Intermediate CA (fortress VM, HSM-backed), NATS server certificates (one per cluster node, issued by Intermediate CA), and node client certificates (one per sensor node, issued by Intermediate CA). The Root CA is a 4096-bit RSA CA with 10-year validity. Intermediate CA is EC P-384 with 2-year validity. Server and client certificates are EC P-256 with 365-day validity.

NATS server configuration enables `tls { verify: true }` requiring clients to present a valid certificate signed by the Intermediate CA. The node client certificate CN is set to the `node_id` (e.g., `APEX-NODE-001`) and the NATS authorisation map grants publish/subscribe permissions based on CN. Certificate rotation is automated via a cron job on fortress that re-issues client certs 30 days before expiry and pushes the new cert via Tailscale SSH.

#### 2.13.2 Certificate Hierarchy

```
Root CA (RSA-4096, 10yr)
  CN: APEX-SENTINEL Root CA
  offline, stored on encrypted USB

Intermediate CA (EC P-384, 2yr)
  CN: APEX-SENTINEL Intermediate CA
  running on fortress:/etc/pki/sentinel/

NATS Server Certs (EC P-256, 365d)
  CN: nats{1-5}.apex-sentinel.internal
  SAN: DNS:nats{1-5}.apex-sentinel.internal, IP:{tailscale_ip}

Node Client Certs (EC P-256, 365d)
  CN: {node_id}  e.g. APEX-NODE-001
  OU: sentinel-nodes
  SAN: (empty — client certs don't need SAN for NATS)
```

#### 2.13.3 Acceptance Criteria

- [ ] NATS client with valid node cert connects successfully; NATS log shows `"tls handshake complete"`
- [ ] NATS client with self-signed cert (not from Intermediate CA) is rejected with TLS error
- [ ] NATS client with expired cert is rejected even if signature is valid
- [ ] Node cert CN matches `node_id`; NATS auth map grants publish only to `sentinel.detections.{CN}.*` and `sentinel.health.{CN}.*`
- [ ] Certificate rotation script issues new cert, pushes to node, reloads NATS client without full service restart
- [ ] `openssl verify -CAfile chain.pem node-client.crt` exits 0 for all issued node certs

#### 2.13.4 Test IDs

| Test ID | Description | Type |
|---------|-------------|------|
| FR-W2-13-01 | Valid node cert → NATS connection established | Integration |
| FR-W2-13-02 | Self-signed cert → NATS rejects with TLS error | Integration |
| FR-W2-13-03 | Expired cert → rejected | Integration |
| FR-W2-13-04 | Node auth map: publish to wrong subject rejected | Integration |
| FR-W2-13-05 | Cert rotation script completes without service downtime | Integration |
| FR-W2-13-06 | openssl verify passes for all issued certs | Config audit |

#### 2.13.5 Dependencies

- FR-W2-01: NATS cluster configuration must have TLS stanza
- Infra: Tailscale mesh required for cert push during rotation

---

### FR-W2-14: Circuit Breaker and Dead Letter Queue

**FR ID:** FR-W2-14
**Title:** Circuit breaker and DLQ for all outbound integrations
**Priority:** P1
**Status:** RED
**Risk Level:** HIGH

#### 2.14.1 Description

Implement a circuit breaker pattern for each outbound integration in `alert-router`: Telegram API, FreeTAKServer TCP, and Supabase Realtime. Circuit breaker state (CLOSED, OPEN, HALF_OPEN) is stored in Supabase `kv` table (simple key-value store created in this wave's migration). State transitions: after 5 consecutive failures within 60s, circuit OPENS for 120s. After 120s, transitions to HALF_OPEN; one successful delivery closes the circuit.

The Dead Letter Queue uses the `sentinel.dlq.>` NATS subject family. Messages written to DLQ include: original message payload, failure reason, retry count, last_failed_at. A DLQ processor service (Deno, systemd on fortress) polls `sentinel.dlq.>` every 60s and attempts re-delivery for messages with `retry_count < 5`; messages at `retry_count >= 5` are written to `alerts.payload.dead_letters` and flagged for operator review.

#### 2.14.2 Acceptance Criteria

- [ ] 5 consecutive Telegram failures within 60s opens circuit for 120s
- [ ] OPEN circuit: alert-router skips Telegram, writes to DLQ, returns HTTP 200
- [ ] HALF_OPEN: first attempt after 120s tried; success closes circuit
- [ ] DLQ processor re-attempts messages with retry_count < 5 every 60s
- [ ] Messages at retry_count >= 5 written to dead_letters in alerts.payload
- [ ] Circuit breaker state persisted in Supabase `kv` table (survives Edge Function cold restart)

#### 2.14.3 Test IDs

| Test ID | Description | Type |
|---------|-------------|------|
| FR-W2-14-01 | 5 failures → circuit opens | Unit |
| FR-W2-14-02 | Open circuit → DLQ write, 200 returned | Integration |
| FR-W2-14-03 | 120s timeout → HALF_OPEN, success → CLOSED | Integration |
| FR-W2-14-04 | DLQ processor re-delivers within 60s window | Integration |
| FR-W2-14-05 | retry_count 5 → dead_letters in alerts.payload | Integration |
| FR-W2-14-06 | Circuit state survives Edge Function cold restart | Integration |

#### 2.14.4 Dependencies

- FR-W2-02: `sentinel.dlq.>` subject requires DLQ stream on NATS
- FR-W2-07: alert-router must use circuit breaker before each outbound call
- FR-W2-03: `kv` table migration must be applied

---

### FR-W2-15: RLS Policies Audit

**FR ID:** FR-W2-15
**Title:** Row-Level Security policies for all W2 tables
**Priority:** P0
**Status:** RED
**Risk Level:** HIGH

#### 2.15.1 Description

Define and apply Row-Level Security policies for all six W2 tables. The policy matrix enforces that: service-role has full access (bypass RLS); `operator` role can SELECT on `nodes`, `detection_events`, `tracks`, `alerts`, `node_health_log`, `lkgc_snapshots` but cannot INSERT/UPDATE/DELETE directly (all mutations go through Edge Functions running as service-role); `anon` role has zero access to all W2 tables. The `node_agent` role (used by NATS push consumer bridge) can INSERT into `detection_events` and `node_health_log` only.

A separate `region_filter` policy on `detection_events`, `tracks`, and `alerts` restricts `operator` reads to rows where `region_id = auth.jwt() ->> 'region_id'`. Operators without a `region_id` claim see zero rows (fail-closed). Region filtering on `nodes` is by `capabilities->>'region_id'`.

#### 2.15.2 RLS Policy Matrix

```
Table               | service_role | operator | node_agent | anon
--------------------|--------------|----------|------------|-----
nodes               | ALL          | SELECT   | SELECT     | NONE
detection_events    | ALL          | SELECT*  | INSERT     | NONE
tracks              | ALL          | SELECT*  | NONE       | NONE
alerts              | ALL          | SELECT*  | NONE       | NONE
node_health_log     | ALL          | SELECT   | INSERT     | NONE
lkgc_snapshots      | ALL          | SELECT   | NONE       | NONE

* region_filter policy applied
```

#### 2.15.3 Acceptance Criteria

- [ ] `anon` role SELECT on `alerts` returns zero rows (not 403 — RLS returns empty set)
- [ ] `operator` role without `region_id` JWT claim sees zero rows in `detection_events`
- [ ] `operator` with `region_id: "london-central"` sees only rows where `region_id = 'london-central'`
- [ ] `node_agent` INSERT into `detection_events` succeeds; SELECT returns 0 rows (no SELECT policy)
- [ ] `service_role` bypasses RLS; full table access confirmed
- [ ] All 6 tables have `FORCE ROW LEVEL SECURITY` enabled (not just `ENABLE ROW LEVEL SECURITY`)

#### 2.15.4 Test IDs

| Test ID | Description | Type |
|---------|-------------|------|
| FR-W2-15-01 | anon SELECT on alerts returns empty set | Security |
| FR-W2-15-02 | operator without region_id sees 0 rows | Security |
| FR-W2-15-03 | operator with region_id sees only matching rows | Security |
| FR-W2-15-04 | node_agent INSERT succeeds, SELECT returns 0 | Security |
| FR-W2-15-05 | service_role full access | Security |
| FR-W2-15-06 | FORCE ROW LEVEL SECURITY verified on all 6 tables | Config audit |

#### 2.15.5 Dependencies

- FR-W2-03: All tables must exist before RLS policies can be applied
- FR-W2-04: register-node issues JWTs with `region_id` claim
- Supabase Auth: Custom roles `operator` and `node_agent` must be configured

---

## 3. FR Status Summary

| FR ID | Title | Priority | Status | Risk |
|-------|-------|----------|--------|------|
| FR-W2-01 | NATS JetStream Cluster Formation | P0 | RED | HIGH |
| FR-W2-02 | JetStream Stream Definitions | P0 | RED | HIGH |
| FR-W2-03 | Supabase Schema Materialisation | P0 | RED | HIGH |
| FR-W2-04 | register-node Edge Function | P0 | RED | MEDIUM |
| FR-W2-05 | ingest-event Edge Function | P0 | RED | HIGH |
| FR-W2-06 | node-health Edge Function | P1 | RED | MEDIUM |
| FR-W2-07 | alert-router Edge Function | P0 | RED | HIGH |
| FR-W2-08 | TDoA Correlation Service | P0 | RED | HIGH |
| FR-W2-09 | Telegram Alert Bot | P1 | RED | MEDIUM |
| FR-W2-10 | Meshtastic Serial Bridge | P1 | RED | HIGH |
| FR-W2-11 | CoT Relay to FreeTAKServer | P1 | RED | MEDIUM |
| FR-W2-12 | Supabase Realtime Dashboard Feed | P1 | RED | LOW |
| FR-W2-13 | mTLS Node-to-NATS Auth | P0 | RED | HIGH |
| FR-W2-14 | Circuit Breaker + DLQ | P1 | RED | HIGH |
| FR-W2-15 | RLS Policies Audit | P0 | RED | HIGH |

**Total FRs:** 15
**P0 FRs:** 8 (must complete for W2 to ship)
**P1 FRs:** 7 (required but not on critical path)
**P2 FRs:** 0

---

## 4. Test Coverage Summary

| FR | Unit Tests | Integration Tests | E2E/Smoke | Total |
|----|-----------|-------------------|-----------|-------|
| FR-W2-01 | 2 | 4 | 1 | 7 |
| FR-W2-02 | 2 | 4 | 1 | 7 |
| FR-W2-03 | 2 | 4 | 1 | 7 |
| FR-W2-04 | 3 | 3 | 1 | 7 |
| FR-W2-05 | 2 | 4 | 1 | 7 |
| FR-W2-06 | 1 | 3 | 1 | 5 |
| FR-W2-07 | 1 | 4 | 1 | 6 |
| FR-W2-08 | 4 | 3 | 1 | 8 |
| FR-W2-09 | 2 | 3 | 0 | 5 |
| FR-W2-10 | 3 | 2 | 0 | 5 |
| FR-W2-11 | 2 | 2 | 1 | 5 |
| FR-W2-12 | 0 | 3 | 1 | 4 |
| FR-W2-13 | 2 | 3 | 1 | 6 |
| FR-W2-14 | 2 | 3 | 1 | 6 |
| FR-W2-15 | 2 | 4 | 0 | 6 |
| **TOTAL** | **30** | **47** | **11** | **88** |

Minimum test count to exit W2: 88 tests passing, 0 RED FRs remaining.

---

## 5. W2 Critical Path

```
Day 1-2: FR-W2-01 (cluster) → FR-W2-13 (mTLS) in parallel
Day 2-3: FR-W2-02 (streams) → FR-W2-03 (schema) in parallel
Day 3-4: FR-W2-04 (register-node) → FR-W2-05 (ingest-event)
Day 4-5: FR-W2-08 (TDoA) + FR-W2-06 (node-health) in parallel
Day 5-6: FR-W2-07 (alert-router) → FR-W2-09 (Telegram) + FR-W2-11 (CoT) + FR-W2-12 (Realtime)
Day 6-7: FR-W2-10 (Meshtastic) + FR-W2-14 (DLQ) in parallel
Day 7:   FR-W2-15 (RLS audit) — requires all tables and Edge Functions complete
```

Gate condition for W2 complete: all P0 FRs GREEN + all P1 FRs GREEN + 88 tests passing + `wave-formation.sh complete W2` executed.
