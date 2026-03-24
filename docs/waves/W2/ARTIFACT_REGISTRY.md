# APEX-SENTINEL — Artifact Registry
## W2 | PROJECTAPEX Doc 13/21 | 2026-03-24

---

## 1. Registry Format

Each artifact entry:
- **Path:** Repository-relative path from project root `/Users/nico/projects/apex-sentinel/`
- **Purpose:** What it does
- **Owner:** Service/team responsible
- **Status:** planned | in-progress | complete
- **W1 Dependency:** W1 artifact this extends or depends on (if any)

---

## 2. NATS Server Configuration Files

### 2.1 nats-server.conf — Node 1 (Bootstrap Leader)
- **Path:** `infra/nats/node-1/nats-server.conf`
- **Purpose:** NATS JetStream server config for node-1. Bootstrap node — cluster Raft election starts here. Contains: server_name, listen port 4222, cluster routes to nodes 2–5, JetStream storage dir `/data/nats`, mTLS config referencing node-1 cert/key, cluster TLS config, operator JWT path.
- **Owner:** infra
- **Status:** planned
- **W1 Dependency:** None

### 2.2 nats-server.conf — Node 2
- **Path:** `infra/nats/node-2/nats-server.conf`
- **Purpose:** NATS config for node-2. Routes to nodes 1, 3, 4, 5. No bootstrap flag (only node-1 bootstraps).
- **Owner:** infra
- **Status:** planned
- **W1 Dependency:** None

### 2.3 nats-server.conf — Node 3
- **Path:** `infra/nats/node-3/nats-server.conf`
- **Purpose:** NATS config for node-3.
- **Owner:** infra
- **Status:** planned
- **W1 Dependency:** None

### 2.4 nats-server.conf — Node 4
- **Path:** `infra/nats/node-4/nats-server.conf`
- **Purpose:** NATS config for node-4.
- **Owner:** infra
- **Status:** planned
- **W1 Dependency:** None

### 2.5 nats-server.conf — Node 5
- **Path:** `infra/nats/node-5/nats-server.conf`
- **Purpose:** NATS config for node-5.
- **Owner:** infra
- **Status:** planned
- **W1 Dependency:** None

### 2.6 NATS Operator + Account JWT
- **Path:** `infra/nats/security/operator.jwt` (gitignored, stored in Supabase Vault)
- **Purpose:** NATS operator JWT for signing account and user credentials. Signing key for node creds in `register-node` Edge Function.
- **Owner:** infra / security
- **Status:** planned
- **W1 Dependency:** None

### 2.7 NATS CA Certificate
- **Path:** `infra/nats/certs/ca.crt` (gitignored, stored in Supabase Vault secret `NATS_CA_CERT`)
- **Purpose:** Root CA cert for mTLS. All node certs and cluster inter-node certs signed by this CA.
- **Owner:** infra / security
- **Status:** planned
- **W1 Dependency:** None

### 2.8 NATS Stream Bootstrap Script
- **Path:** `scripts/nats-streams-init.sh`
- **Purpose:** Shell script to create all 8 JetStream streams and consumer groups after cluster bootstrap. Idempotent: checks for existing streams before creating. Streams: SENTINEL_EVENTS, SENTINEL_AUDIO_META, SENTINEL_TELEMETRY, SENTINEL_TRACKS, SENTINEL_ALERTS, SENTINEL_NODE_REGISTRY, SENTINEL_MESH_RELAY, SENTINEL_TDOA_WINDOWS. Also creates SENTINEL_DLQ (dead-letter queue).
- **Owner:** infra
- **Status:** planned
- **W1 Dependency:** None

---

## 3. Supabase Migration Files

### 3.1 001_nodes.sql
- **Path:** `supabase/migrations/001_nodes.sql`
- **Purpose:** Creates `nodes` table with columns: node_id (PK), tier, lat, lon, alt, time_precision_us, cert_fingerprint, firmware_version, status (ONLINE/DEGRADED/OFFLINE/PENDING), enrolled_at, last_seen, battery_pct. RLS: service-role read-write, node-scoped read via JWT sub claim.
- **Owner:** backend
- **Status:** planned
- **W1 Dependency:** None

### 3.2 002_detection_events.sql
- **Path:** `supabase/migrations/002_detection_events.sql`
- **Purpose:** Creates partitioned parent table `detection_events` with pg_partman monthly range on `created_at`. Columns: event_id (PK), node_id (FK → nodes), gate (1/2/3), confidence, timestamp_us, geo_sector, audio_meta (JSONB), tdoa_eligible, mesh_relay, ble_relay, privacy_level. Indexes: (node_id, created_at), (geo_sector, created_at), (gate, created_at).
- **Owner:** backend
- **Status:** planned
- **W1 Dependency:** None

### 3.3 003_tdoa_windows.sql
- **Path:** `supabase/migrations/003_tdoa_windows.sql`
- **Purpose:** Creates `tdoa_windows` table: window_id (PK), geo_sector, gate3_event_id, node_count, method (tdoa/centroid), lat, lon, alt, accuracy_m (nullable), confidence, source_events (UUID[]), opened_at, closed_at, divergence_guard_triggered. RLS: service-role only.
- **Owner:** backend
- **Status:** planned
- **W1 Dependency:** None

### 3.4 004_tracks.sql
- **Path:** `supabase/migrations/004_tracks.sql`
- **Purpose:** Creates `tracks` table: track_id (PK), lat (coarsened), lon (coarsened), lat_exact (service-only column), lon_exact (service-only column), alt, accuracy_m, method, confidence, status (ACTIVE/CLOSED), source_events (UUID[]), created_at, updated_at. Partial index on `status = 'ACTIVE'` for live CesiumJS queries. RLS: lat_exact/lon_exact hidden from anon role via security definer view `tracks_public`.
- **Owner:** backend
- **Status:** planned
- **W1 Dependency:** None

### 3.5 005_alerts.sql
- **Path:** `supabase/migrations/005_alerts.sql`
- **Purpose:** Creates `alerts` table: alert_id (PK), alert_type (THREAT_DETECTED/NODE_OFFLINE/SYSTEM_DEGRADED), entity_id (track_id or node_id), confidence, geo_sector, lat, lon, status (SENT/FAILED/SUPPRESSED), channel (sentinel-alerts/sentinel-ops/sentinel-system), created_at, delivered_at. Realtime enabled.
- **Owner:** backend
- **Status:** planned
- **W1 Dependency:** None

### 3.6 006_mesh_topology.sql
- **Path:** `supabase/migrations/006_mesh_topology.sql`
- **Purpose:** Creates `mesh_topology` table: edge_id (PK), source_node_id, target_node_id, link_type (LORA/BLE/NATS_DIRECT), rssi_dbm (nullable), last_active, hop_count. Records observed mesh links from bridge relay logs. Used for fleet map topology overlay in W3.
- **Owner:** backend
- **Status:** planned
- **W1 Dependency:** None

### 3.7 007_node_heartbeats.sql
- **Path:** `supabase/migrations/007_node_heartbeats.sql`
- **Purpose:** Creates `node_heartbeats` table (time-series, pg_partman weekly): heartbeat_id, node_id (FK), battery_pct, lat, lon, alt, pps_locked (boolean), nats_latency_ms, ts. Write-heavy, compact retention: 30 days. Index: (node_id, ts DESC).
- **Owner:** backend
- **Status:** planned
- **W1 Dependency:** None

### 3.8 008_audit_log.sql
- **Path:** `supabase/migrations/008_audit_log.sql`
- **Purpose:** Creates append-only `audit_log` table: log_id, entity_id, action (REGISTER/INGEST/ENROLL/CERT_ROTATE/DEDUP_HIT), actor_ip (coarsened /24), outcome (SUCCESS/FAILURE), reason, ts. Trigger prevents UPDATE or DELETE on this table. Retained indefinitely.
- **Owner:** backend / security
- **Status:** planned
- **W1 Dependency:** None

### 3.9 009_functions.sql
- **Path:** `supabase/migrations/009_functions.sql`
- **Purpose:** PostgreSQL functions: `coarsen_geo(lat float8, lon float8, precision_m int) RETURNS TABLE(lat float8, lon float8)` — rounds coordinates to nearest precision_m metres; `coarsen_timestamp_us(ts bigint) RETURNS bigint` — rounds to nearest 100μs; `node_status_update()` — trigger function called by heartbeat consumer to update `nodes.status` and emit Realtime event; `tracks_public` security-definer view (hides lat_exact/lon_exact for anon role).
- **Owner:** backend
- **Status:** planned
- **W1 Dependency:** None

### 3.10 010_retention.sql
- **Path:** `supabase/migrations/010_retention.sql`
- **Purpose:** Configures pg_partman: `SELECT partman.create_parent(...)` for `detection_events` (90 days), `node_heartbeats` (30 days). Sets up pg_cron job `SELECT partman.run_maintenance_proc()` running hourly. Also creates `eviction_log` table for offline queue overflow events.
- **Owner:** backend / infra
- **Status:** planned
- **W1 Dependency:** None

---

## 4. Edge Function Files

### 4.1 register-node/index.ts
- **Path:** `supabase/functions/register-node/index.ts`
- **Purpose:** Deno Edge Function. Validates enrollment payload; upserts `nodes` table; generates JWT (24h, node-scoped); generates NATS user credentials (operator-signed, subject-scoped); writes audit_log; publishes `sentinel.node.enrolled.{node_id}` to NATS via WebSocket; returns `{ enrolled, node_token, nats_creds }`.
- **Owner:** backend
- **Status:** planned
- **W1 Dependency:** W1 `NodeConfig` type (extends)

### 4.2 ingest-event/index.ts
- **Path:** `supabase/functions/ingest-event/index.ts`
- **Purpose:** Deno Edge Function. Validates JWT; validates `SentinelEvent` payload; runs dedup check against Supabase; inserts into `detection_events`; conditionally publishes to `SENTINEL_TDOA_WINDOWS` and `sentinel.gate3.detection.{geo_sector}` via NATS WS; returns `{ written, duplicate }`.
- **Owner:** backend
- **Status:** planned
- **W1 Dependency:** W1 `SentinelEvent` type (extends)

### 4.3 node-health/index.ts
- **Path:** `supabase/functions/node-health/index.ts`
- **Purpose:** Deno Edge Function. Returns fleet state: all enrolled nodes with current status, last_seen, battery_pct, lat, lon. Supports query params: `?tier=1`, `?status=ONLINE`. Response cached 5s (ETag). Service-role includes lat_exact/lon_exact; anon role gets coarsened coords.
- **Owner:** backend
- **Status:** planned
- **W1 Dependency:** None

### 4.4 alert-router/index.ts
- **Path:** `supabase/functions/alert-router/index.ts`
- **Purpose:** Deno Edge Function (webhook receiver). Called by NATS JetStream push consumer when high-confidence Gate 3 event or node OFFLINE alert is written to `SENTINEL_ALERTS` stream. Routes to Telegram bot API with channel selection by `alert_type`. Deduplicates within 5-minute window. Applies geo coarsening to coordinates before sending. Writes alert status to `alerts` table.
- **Owner:** backend / ops
- **Status:** planned
- **W1 Dependency:** None

---

## 5. TypeScript Service Files

### 5.1 tdoa-correlator.ts
- **Path:** `src/tdoa/tdoa-correlator.ts`
- **Purpose:** Node.js service entry point. Attaches NATS durable consumer to `SENTINEL_TDOA_WINDOWS` stream. Manages per-`(geo_sector, gate3_event_id)` 500ms aggregation windows. Invokes Newton-Raphson solver when ≥3 nodes collected; centroid fallback for 2 nodes; discard + metric for 1 node. Publishes results to `SENTINEL_TRACKS`. Writes to `tdoa_windows` Supabase table.
- **Owner:** backend / signal processing
- **Status:** planned
- **W1 Dependency:** W1 `GPSCoordinate`, `haversineDistance` utility

### 5.2 geo-sector.ts
- **Path:** `src/geo/geo-sector.ts`
- **Purpose:** Exports `encodeGeoSector(lat, lon): string` (geohash-6), `decodeGeoSector(sector: string): GPSCoordinate`, `sectorNeighbours(sector: string): string[]` (8-cell ring). Used by Gate 3, ingest-event validator, TDoA correlator.
- **Owner:** backend
- **Status:** planned
- **W1 Dependency:** None (new in W2)

### 5.3 event-deduplicator.ts
- **Path:** `src/ingest/event-deduplicator.ts`
- **Purpose:** LRU cache (max 10,000 entries, 60s TTL) backed by Supabase unique constraint. `isDuplicate(nodeId, timestampUs, gate): Promise<boolean>`. Exported as singleton. Metrics: `dedup_hit_total`, `dedup_miss_total`.
- **Owner:** backend
- **Status:** planned
- **W1 Dependency:** None

### 5.4 nats-client.ts
- **Path:** `src/nats/nats-client.ts`
- **Purpose:** Singleton NATS JetStream client factory. Handles mTLS cert loading, connection with retry (max 5, exponential backoff), Raft leader reconnection. Exports `getJetStreamClient()`, `publishToStream(stream, payload)`, `createDurableConsumer(stream, durable, filterSubject)`. Used by all W2 Node.js services.
- **Owner:** backend / infra
- **Status:** planned
- **W1 Dependency:** None

### 5.5 mesh-bridge.ts
- **Path:** `src/mesh/mesh-bridge.ts`
- **Purpose:** Node.js service. Subscribes to Mosquitto MQTT broker on `msh/+/json/+/+`. Decodes Meshtastic protobuf payloads. Constructs `SentinelEvent` from decoded payload. Publishes to `SENTINEL_MESH_RELAY` NATS stream and forwards to `ingest-event` Edge Function. Handles NATS disconnect with in-memory buffer (max 500 events). Emits `bridge_parse_error`, `bridge_relay_total`, `bridge_buffer_depth` metrics.
- **Owner:** backend / mesh
- **Status:** planned
- **W1 Dependency:** W1 `SentinelEvent` type (constructs)

### 5.6 track-manager.ts
- **Path:** `src/tracks/track-manager.ts`
- **Purpose:** Stateful Node.js service. Consumes `SENTINEL_TRACKS` stream. Implements consistent hash ring (keyed on geo_sector) for multi-instance sharding. For each TDoA result: finds or creates active track within 200m radius; applies EKF position update; writes updated track to `tracks` Supabase table; publishes `sentinel.track.updated.{track_id}` to NATS. Cold-start recovery: reconstructs EKF state from last 10 track rows per sector.
- **Owner:** backend / signal processing
- **Status:** planned
- **W1 Dependency:** W1 `EKFState` type (extends)

### 5.7 heartbeat-consumer.ts
- **Path:** `src/heartbeat/heartbeat-consumer.ts`
- **Purpose:** Node.js service. Subscribes to `sentinel.node.heartbeat.>` NATS wildcard. Writes heartbeat rows to `node_heartbeats` table. Calls `node_status_update()` DB function to update `nodes.status`. Detects DEGRADED/OFFLINE transitions; publishes to `SENTINEL_ALERTS` stream for alert-router. Manages timeout detector state (in-memory per active node).
- **Owner:** backend / ops
- **Status:** planned
- **W1 Dependency:** None

### 5.8 cert-rotator.ts
- **Path:** `src/nats/cert-rotator.ts`
- **Purpose:** Systemd-timer-triggered script (runs daily). Checks days_remaining on all node certs and cluster certs. Emits `cert_expiry_days{node_id}` Prometheus gauge. If days_remaining ≤ 14: triggers re-enrollment via NATS command `sentinel.node.{node_id}.cmd.cert_rotate`. If days_remaining ≤ 0: emits CRITICAL alert and halts publish (cert invalid).
- **Owner:** infra / security
- **Status:** planned
- **W1 Dependency:** None

---

## 6. Test Fixtures

### 6.1 3-node-tdoa-scenario.json
- **Path:** `tests/fixtures/3-node-tdoa-scenario.json`
- **Purpose:** Ground truth + 3 node positions + pre-computed arrival timestamps for Newton-Raphson validation test. Validates ±62m accuracy claim. See TEST_STRATEGY.md §6.1 for full JSON spec.
- **Owner:** signal processing
- **Status:** planned
- **W1 Dependency:** None

### 6.2 2-node-tdoa-scenario.json
- **Path:** `tests/fixtures/2-node-tdoa-scenario.json`
- **Purpose:** 2-node scenario triggering centroid fallback. Validates method=centroid path.
- **Owner:** signal processing
- **Status:** planned
- **W1 Dependency:** None

### 6.3 collinear-3-node-scenario.json
- **Path:** `tests/fixtures/collinear-3-node-scenario.json`
- **Purpose:** 3 nodes in collinear geometry (all on same line). Triggers Newton-Raphson divergence guard. Validates centroid fallback + `divergence_guard_triggered: true` in result.
- **Owner:** signal processing
- **Status:** planned
- **W1 Dependency:** None

### 6.4 malformed-events.json
- **Path:** `tests/fixtures/malformed-events.json`
- **Purpose:** Array of 15 invalid payloads for ingest-event validation tests. See TEST_STRATEGY.md §6.2 for full list.
- **Owner:** backend
- **Status:** planned
- **W1 Dependency:** None

### 6.5 heartbeat-sequence.json
- **Path:** `tests/fixtures/heartbeat-sequence.json`
- **Purpose:** 4 heartbeat sequences covering: normal operation, DEGRADED transition, OFFLINE transition with Telegram alert, LOW_BATTERY alert. See TEST_STRATEGY.md §6.3 for full spec.
- **Owner:** backend / ops
- **Status:** planned
- **W1 Dependency:** None

### 6.6 quota-exceeded-scenario.json
- **Path:** `tests/fixtures/quota-exceeded-scenario.json`
- **Purpose:** Simulates Supabase HTTP 429 response. Validates offline SDK retry with exponential backoff and non-modification of `created_at` on retry.
- **Owner:** backend
- **Status:** planned
- **W1 Dependency:** None

### 6.7 network-partition-simulation.json
- **Path:** `tests/fixtures/network-partition-simulation.json`
- **Purpose:** Step-by-step instructions for NATS 2-node kill test. Documents expected cluster behaviour at each step. Used in M2.1 acceptance gate.
- **Owner:** infra
- **Status:** planned
- **W1 Dependency:** None

---

## 7. Configuration Templates

### 7.1 .env.example
- **Path:** `.env.example`
- **Purpose:** All required environment variables for W2 services with example values (no real secrets). Variables: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `NATS_URL`, `NATS_CREDS_PATH`, `NATS_CA_CERT_PATH`, `NATS_WS_URL`, `TDOA_WINDOW_MS`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERTS_CHAT_ID`, `TELEGRAM_OPS_CHAT_ID`, `TELEGRAM_SYSTEM_CHAT_ID`, `TRACK_MANAGER_INSTANCES`, `VIRTUAL_NODES`, `HEARTBEAT_DEGRADED_THRESHOLD_S`, `HEARTBEAT_OFFLINE_THRESHOLD_S`, `MESHTASTIC_MQTT_URL`, `MESHTASTIC_CHANNEL_PSK`.
- **Owner:** infra
- **Status:** planned
- **W1 Dependency:** Extends W1 `.env.example`

### 7.2 nats-cluster.yaml
- **Path:** `infra/nats/nats-cluster.yaml`
- **Purpose:** Docker Compose (or Kubernetes Deployment, TBD per OQ-W2-02) for 5-node NATS cluster. Includes: volume mounts for JetStream storage, cert mounts, environment variable injection, healthcheck (`nats server check cluster --expected 5`), restart policy (`on-failure`, max 3 — never `always`).
- **Owner:** infra
- **Status:** planned
- **W1 Dependency:** None

### 7.3 supabase-config.toml (extension)
- **Path:** `supabase/config.toml`
- **Purpose:** Supabase CLI config for project `bymfcnwfyxuivinuzurr`. Extensions enabled: `pgcrypto`, `pg_stat_statements`, `pg_partman`, `pg_cron`. Realtime enabled for tables: `detection_events`, `alerts`, `tracks`, `nodes`. Function deploy targets for 4 Edge Functions.
- **Owner:** backend
- **Status:** in-progress (extends W1 config)
- **W1 Dependency:** W1 `supabase/config.toml`

### 7.4 vitest.config.ts
- **Path:** `vitest.config.ts`
- **Purpose:** Vitest config with coverage thresholds enforced (80% all metrics), test include patterns for `src/**/__tests__/**`, `supabase/functions/__tests__/**`, `tests/fixtures/**` excluded from coverage. Istanbul V8 provider.
- **Owner:** backend
- **Status:** planned
- **W1 Dependency:** Extends W1 `vitest.config.ts`

### 7.5 playwright.config.ts
- **Path:** `playwright.config.ts`
- **Purpose:** Playwright config for 3 E2E specs. Base URL: `http://localhost:3000`. Reporters: HTML + GitHub Actions. Retry: 2 on CI. Timeout: 30s per test.
- **Owner:** frontend / backend
- **Status:** planned
- **W1 Dependency:** None (new in W2)

---

## 8. Infrastructure Runbooks

### 8.1 NATS Cert Rotation Runbook
- **Path:** `docs/runbooks/nats-cert-rotation.md`
- **Purpose:** Step-by-step procedure for rotating NATS cluster inter-node certs and NATS user (node device) certs. Covers: CA cert check, node-by-node rolling rotation (never >2 nodes simultaneously), Raft health verification after each rotation, rollback procedure if rotation fails.
- **Owner:** infra
- **Status:** planned
- **W1 Dependency:** None

### 8.2 Supabase Backup and Restore Procedure
- **Path:** `docs/runbooks/supabase-backup.md`
- **Purpose:** Documents Supabase daily snapshot schedule, point-in-time recovery window (7 days on Pro tier), pg_partman partition-aware restore procedure, and RLS policy verification post-restore.
- **Owner:** infra / backend
- **Status:** planned
- **W1 Dependency:** None

### 8.3 NATS Cluster Bootstrap Runbook
- **Path:** `docs/runbooks/nats-cluster-bootstrap.md`
- **Purpose:** First-time cluster bootstrap procedure. Sequence: start node-1 → wait for JetStream ready → start nodes 2–3 → verify Raft leader → start nodes 4–5 → run `nats-streams-init.sh` → verify all 8 streams → verify consumer groups. Includes: expected log output at each step, failure indicators, rollback.
- **Owner:** infra
- **Status:** planned
- **W1 Dependency:** None

---

## 9. Status Summary

| Category | Total Artifacts | Planned | In-Progress | Complete |
|----------|----------------|---------|-------------|---------|
| NATS configs | 8 | 8 | 0 | 0 |
| Supabase migrations | 10 | 10 | 0 | 0 |
| Edge Functions | 4 | 4 | 0 | 0 |
| TypeScript services | 8 | 8 | 0 | 0 |
| Test fixtures | 7 | 7 | 0 | 0 |
| Config templates | 5 | 4 | 1 | 0 |
| Runbooks | 3 | 3 | 0 | 0 |
| **Total** | **45** | **44** | **1** | **0** |

Status updated at each milestone. M2.8 requires ALL 45 artifacts at status COMPLETE before W2 close.
