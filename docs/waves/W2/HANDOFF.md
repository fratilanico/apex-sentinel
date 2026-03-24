# APEX-SENTINEL — Wave 2 Handoff Document
# FILE 17 of 20 — HANDOFF.md
# Wave 2: NATS JetStream + Supabase Schema + Edge Functions + TDoA Correlation Service
# Created: 2026-03-24

---

## 1. What Wave 2 Delivered

Wave 2 wires the infrastructure backbone that connects W1's on-device detection pipeline
to the cloud backend. Any engineer picking up this project after W2-COMPLETE must understand
the full data path: smartphone microphone → acoustic detection → NATS JetStream cluster →
TDoA correlation → confirmed track → Telegram alert + ATAK COT event.

### W2 Deliverables Checklist

```
DOCUMENTATION (21 docs in docs/waves/W2/)
[ ] DESIGN.md                  — W2 system design
[ ] PRD.md                     — product requirements
[ ] ARCHITECTURE.md            — technical architecture
[ ] DATABASE_SCHEMA.md         — Supabase schema spec (all W2 tables)
[ ] API_SPECIFICATION.md       — Edge Function + NATS subject API contracts
[ ] AI_PIPELINE.md             — TDoA solver algorithm documentation
[ ] PRIVACY_ARCHITECTURE.md    — GDPR compliance for cloud ingestion
[ ] ROADMAP.md                 — W2 milestones and W3 preview
[ ] TEST_STRATEGY.md           — W2 test pyramid
[ ] ACCEPTANCE_CRITERIA.md     — W2 acceptance gates
[ ] DECISION_LOG.md            — W2 architectural decisions
[ ] SESSION_STATE.md           — session progress log
[ ] ARTIFACT_REGISTRY.md       — all versioned artifacts
[ ] DEPLOY_CHECKLIST.md        — W2 deployment checklist
[x] LKGC_TEMPLATE.md           — last known good config (this file: W2 baseline)
[x] IMPLEMENTATION_PLAN.md     — phased implementation (P1–P6)
[x] HANDOFF.md                 — this file
[ ] FR_REGISTER.md             — W2 functional requirements
[ ] RISK_REGISTER.md           — W2 risks
[ ] INTEGRATION_MAP.md         — service integration diagram
[ ] RESILIENCE.md              — failure modes and fallbacks

INFRASTRUCTURE
[ ] NATS JetStream 5-node Raft cluster running
[ ] 4 streams created: DETECTIONS, NODE_HEALTH, ALERTS, COT_EVENTS
[ ] 3 consumer groups created: tdoa-correlation-group, alert-router-group, cot-relay-group

DATABASE
[ ] Migration 0007: nats_stream_config table
[ ] Migration 0008: tracks table (with PostGIS index, RLS, Realtime)
[ ] Migration 0009: alerts table
[ ] Migration 0010: node_health_log table
[ ] Migration 0011: lkgc_snapshots table
[ ] Migration 0012: tdoa_events table
[ ] Migration 0013: W2 RLS policies
[ ] Migration 0014: edge_function_logs table
[ ] Migration 0015: alert_subscriptions table
[ ] Migration 0016: meshtastic_bridge_log table

EDGE FUNCTIONS (Supabase, Deno)
[ ] register-node deployed + health check passing
[ ] ingest-event deployed + health check passing
[ ] node-health deployed + health check passing
[ ] alert-router deployed + health check passing
[ ] tdoa-correlate deployed + health check passing

SERVICES
[ ] TDoA correlation service: compiled, deployed, systemd running
[ ] Alert bot: compiled, deployed, systemd running
[ ] Meshtastic bridge: compiled, deployed, systemd running

TESTS
[ ] Total test count: ≥ 200 tests
[ ] Unit tests: 0 failures
[ ] Integration tests: 0 failures
[ ] E2E tests: 0 failures
[ ] Coverage: statements ≥ 80%, branches ≥ 80%, functions ≥ 80%
[ ] Android W2 mesh unit tests: ≥ 30, 0 failures, ≥ 80% Jacoco

END-TO-END VALIDATION
[ ] E2E pipeline: mobile → NATS → TDoA → track → Telegram in < 3s
[ ] TDoA triangulation accuracy: ±62m or better on 5 reference triangles
[ ] Meshtastic bridge: ≥ 1 test device connected and forwarding
[ ] FreeTAKServer COT: test track received by ATAK test client
[ ] LKGC-W2-WAVE-COMPLETE tag pushed
[ ] wave-formation.sh complete W2 → all gates green
```

---

## 2. Infrastructure State at W2 Completion

### 2.1 NATS JetStream Cluster

```
Cluster name:          APEX-SENTINEL
JetStream domain:      apex-sentinel
Raft nodes:            5 (quorum = 3)

Nodes:
  nats1.apex-sentinel.internal:4222    — primary client endpoint
  nats2.apex-sentinel.internal:4222
  nats3.apex-sentinel.internal:4222
  nats4.apex-sentinel.internal:4222
  nats5.apex-sentinel.internal:4222

Cluster (Raft) ports:
  nats1.apex-sentinel.internal:6222    — inter-node routing
  nats2–nats5: same pattern on port 6222

Monitoring:
  http://nats1.apex-sentinel.internal:8222/    — NATS monitoring HTTP
  http://nats1.apex-sentinel.internal:8222/varz
  http://nats1.apex-sentinel.internal:8222/jsz
  http://nats1.apex-sentinel.internal:8222/connz

Streams:
  DETECTIONS    subjects: sentinel.detections.>  replicas: 3  max_age: 72h   storage: file
  NODE_HEALTH   subjects: sentinel.health.>       replicas: 3  max_age: 24h   storage: file
  ALERTS        subjects: sentinel.alerts.>       replicas: 3  max_age: 168h  storage: file
  COT_EVENTS    subjects: sentinel.cot.>          replicas: 3  max_age: 24h   storage: file

Consumer groups:
  DETECTIONS / tdoa-correlation-group   — pull, explicit ack, max_deliver: 3
  ALERTS     / alert-router-group       — pull, explicit ack, max_deliver: 5
  COT_EVENTS / cot-relay-group          — pull, explicit ack, max_deliver: 3

Quick health check:
  nats --server nats://nats1.apex-sentinel.internal:4222 server ping
  nats --server nats://nats1.apex-sentinel.internal:4222 stream report
```

### 2.2 Supabase Project

```
Project ID:       bymfcnwfyxuivinuzurr
Region:           eu-west-2 (London)
URL:              https://bymfcnwfyxuivinuzurr.supabase.co
Dashboard:        https://supabase.com/dashboard/project/bymfcnwfyxuivinuzurr

Migrations applied (W1 + W2):
  0000_initial_schema
  0001_sensor_nodes
  0002_detection_events
  0003_rf_readings
  0004_mesh_topology
  0005_rls_policies
  0006_realtime_enable
  0007_nats_stream_config        ← W2 start
  0008_tracks
  0009_alerts
  0010_node_health_log
  0011_lkgc_snapshots
  0012_tdoa_events
  0013_rls_w2_policies
  0014_edge_function_logs
  0015_alert_subscriptions
  0016_meshtastic_bridge_log     ← W2 end

Realtime-enabled tables:
  detection_events, tracks, alerts

Edge Functions deployed:
  register-node     POST  /functions/v1/register-node
  ingest-event      POST  /functions/v1/ingest-event
  node-health       POST  /functions/v1/node-health
  alert-router      POST  /functions/v1/alert-router
  tdoa-correlate    POST  /functions/v1/tdoa-correlate
```

### 2.3 Supabase Schema Summary

#### Table: nodes (extended from W1)

```sql
nodes (
  id                uuid PK,
  device_id         text UNIQUE NOT NULL,   -- stable client-generated ID
  device_model      text,
  os_version        text,
  app_version       text,
  latitude          double precision,
  longitude         double precision,
  last_seen_at      timestamptz,
  registered_at     timestamptz,
  meshtastic_node_id text,                  -- "!a3b2c1d0" format, null if no hardware
  capabilities      text[],                -- ["acoustic", "rf", "gps"]
  battery_pct       int,
  owner_user_id     uuid REFERENCES auth.users(id)
)
RLS: anon INSERT allowed (for node registration), authenticated SELECT own rows
```

#### Table: detection_events (extended from W1)

```sql
detection_events (
  id                uuid PK,
  node_id           uuid FK → nodes(id),
  detection_type    text,                  -- "acoustic" | "rf" | "fused"
  confidence        numeric(4,3),          -- 0.000 – 1.000
  detected_at       timestamptz,
  latitude          double precision,
  longitude         double precision,
  accuracy_m        double precision,
  model_version     text,
  inference_latency_ms int,
  acoustic_payload  jsonb,
  rf_payload        jsonb,
  track_id          uuid FK → tracks(id),  -- NULL until correlated
  nats_published    boolean DEFAULT false,
  source            text DEFAULT 'direct'  -- "direct" | "meshtastic"
)
RLS: anon INSERT, service_role full access
```

#### Table: tracks

```sql
tracks (
  id                    uuid PK,
  track_number          serial,            -- human-readable TRK-NNNNNN
  status                track_status,      -- provisional | confirmed | dismissed | archived
  threat_class          threat_class,      -- fpv_drone | shahed_class | etc.
  latitude              double precision,
  longitude             double precision,
  altitude_m            double precision,
  position_error_m      double precision,
  position_method       text,             -- "tdoa" | "centroid"
  first_detected_at     timestamptz,
  confirmed_at          timestamptz,
  contributing_node_ids uuid[],
  node_count            int,
  tdoa_residual_ms      double precision,
  tdoa_converged        boolean,
  cot_sent_at           timestamptz,
  cot_uid               text,
  telegram_sent_at      timestamptz,
  telegram_message_id   bigint
)
RLS: anon SELECT (confirmed/provisional), service_role full access
Realtime: enabled
```

#### Table: alerts

```sql
alerts (
  id              uuid PK,
  track_id        uuid FK → tracks(id),
  channel         alert_channel,           -- telegram | cot_freetakserver | ...
  status          alert_status,            -- pending | dispatched | delivered | failed
  payload         jsonb,
  retry_count     int,
  max_retries     int DEFAULT 3,
  delivered_at    timestamptz,
  external_id     text                     -- Telegram message_id, COT UID, etc.
)
RLS: service_role only
```

#### Table: node_health_log

```sql
node_health_log (
  id                  uuid PK,
  node_id             uuid FK → nodes(id),
  logged_at           timestamptz,
  battery_pct         int,
  is_charging         boolean,
  gps_accuracy_m      double precision,
  last_inference_latency_ms int,
  nats_connected      boolean,
  nats_pending_msgs   int,
  meshtastic_node_id  text,
  meshtastic_snr      numeric(6,2),
  app_version         text,
  uptime_seconds      bigint
)
Retention: 24h (pg_cron job: delete_old_node_health())
RLS: service_role + node_owner_read
```

#### Table: tdoa_events

```sql
tdoa_events (
  id                  uuid PK,
  track_id            uuid FK → tracks(id),
  correlated_at       timestamptz,
  input_event_ids     uuid[],
  input_node_ids      uuid[],
  node_positions      jsonb,              -- [{node_id, lat, lon, alt, timestamp_us}]
  tdoa_matrix         jsonb,              -- pairwise time differences
  hyperbolic_solution jsonb,
  centroid_fallback   boolean,
  estimated_lat       double precision,
  estimated_lon       double precision,
  error_radius_m      double precision,
  confidence          numeric(4,3),
  success             boolean
)
RLS: service_role only
```

#### Table: lkgc_snapshots

```sql
lkgc_snapshots (
  id              uuid PK,
  lkgc_id         text UNIQUE,            -- "LKGC-W2-20260324-0000"
  wave            text,
  label           text,
  captured_at     timestamptz,
  git_sha         text,
  git_tag         text,
  test_passed     int,
  test_failed     int,
  coverage_pct    numeric(5,2),
  node_count      int,
  snapshot_json   jsonb,
  validity_gates_passed boolean
)
RLS: service_role only
```

### 2.4 RLS Policy Summary

| Table               | anon INSERT | anon SELECT | auth SELECT  | service_role |
|---------------------|-------------|-------------|--------------|--------------|
| nodes               | yes         | no          | own rows     | full         |
| detection_events    | yes         | no          | own events   | full         |
| tracks              | no          | confirmed   | all          | full         |
| alerts              | no          | no          | no           | full         |
| node_health_log     | no          | no          | own nodes    | full         |
| tdoa_events         | no          | no          | no           | full         |
| lkgc_snapshots      | no          | no          | no           | full         |
| meshtastic_bridge_log | no        | no          | no           | full         |

### 2.5 Deployed Services

```
Service                 Binary/Runtime    Systemd Unit                    Port
─────────────────────────────────────────────────────────────────────────────
NATS node 1–5           nats:2.10         (Docker Compose)                4222, 6222, 8222
TDoA correlation        Node.js 22 LTS    apex-tdoa-correlation.service   (internal)
Alert bot               Node.js 22 LTS    apex-alert-bot.service          (internal)
Meshtastic bridge       Node.js 22 LTS    apex-meshtastic-bridge.service  (serial /dev/ttyUSB0)
FreeTAKServer           Docker            apex-freetakserver              8087, 19023
```

All services use `Restart=on-failure` (never `Restart=always`). Watchdog configured on
TDoA service (`WatchdogSec=120`) to detect hangs.

---

## 3. Known Limitations and Deferred Items (Pushed to W3)

### DFR-W2-01: GPS timestamp synchronization not enforced

**Limitation:** TDoA accuracy depends on microsecond-accurate GPS timestamps across nodes.
W2 uses the device's system clock (GPS-disciplined on Android if `LocationManager.GPS_PROVIDER`
is active). No NTP-over-GPS or PPS synchronization is enforced.

**Impact:** TDoA accuracy degrades to ±200m+ if system clocks drift by > 500μs.

**W3 mitigation:** Implement GPS PPS synchronization check. Reject nodes with
`gps_fix_type != '3d'` from TDoA computation. Add clock drift monitor.

**Current workaround:** `tdoa_residual_ms` threshold of 5ms catches gross clock drift.
If residual > 5ms, centroid fallback activates automatically.

---

### DFR-W2-02: NATS cluster runs on single host (dev/staging only)

**Limitation:** In W2, all 5 NATS nodes run as Docker containers on a single VM or
developer machine. This defeats the purpose of a 5-node Raft cluster for HA.

**Impact:** Host failure = total cluster failure. No geographic distribution.

**W3 mitigation:** Deploy 5 nodes across 3 separate cloud VMs (minimum 3 AZs).

---

### DFR-W2-03: Edge Function TDoA solver is stub

**Limitation:** The `tdoa-correlate` Edge Function calls the Node.js TDoA correlation
service via internal HTTP, but if the service is down, the Edge Function falls back to
returning a centroid estimate computed inline. The inline Deno implementation of
`TdoaSolver` is not as accurate as the full Node.js solver (missing convergence check).

**W3 mitigation:** Move the authoritative solver into the Edge Function (Deno-native WASM).

---

### DFR-W2-04: Meshtastic bridge tested only on TTGO T-Beam hardware

**Limitation:** Serial protocol parsing validated only on TTGO T-Beam v1.1 with
Meshtastic firmware 2.3.x. Heltec WiFi LoRa 32 v3 and RAK4631 not tested.

**W3 mitigation:** Add hardware-in-the-loop tests for all 3 supported boards.

---

### DFR-W2-05: Telegram alert bot has no rate limiting

**Limitation:** If > 100 tracks are confirmed in 1 hour (e.g., during a swarm attack),
the bot will dispatch 100 Telegram messages in rapid succession, triggering Telegram's
flood control (bot muted for 60 seconds).

**W3 mitigation:** Implement alert aggregation window (max 1 message per 30 seconds,
with a summary of N tracks if multiple fire in window).

---

### DFR-W2-06: FreeTAKServer not HA

**Limitation:** Single FreeTAKServer Docker container. No persistence backup for
ATAK client sessions.

**W3 mitigation:** FreeTAKServer clustering or standby failover.

---

### DFR-W2-07: No end-to-end encryption of NATS messages

**Limitation:** NATS TLS is configured at the transport layer, but message payloads
are not encrypted at rest in JetStream file storage.

**W3 mitigation:** Implement NATS message-level AES-256 encryption using shared
symmetric key derived from node NKey.

---

### DFR-W2-08: alert_subscriptions geographic filter uses bounding box only

**Limitation:** `alert_subscriptions.region_polygon` stores the subscription geometry,
but the `alert-router` Edge Function only implements bounding box containment check
(not full polygon intersection) in W2 due to missing PostGIS `ST_Within` in Deno.

**W3 mitigation:** Move geographic filtering into a PostgreSQL function called via RPC.

---

## 4. W3 Prerequisites

W3 (C2 Dashboard + Security Hardening + Field Testing) MUST NOT start until all of the
following are true:

```
PREREQUISITE 1: W2 wave:complete gate passed
  ./wave-formation.sh status W2 | grep -q "COMPLETE"
  # Must output: W2 status: COMPLETE

PREREQUISITE 2: LKGC-W2-WAVE-COMPLETE valid
  ./scripts/validate-lkgc.sh LKGC-W2-WAVE-COMPLETE
  # Must exit 0 (all 6 gates passed)

PREREQUISITE 3: TDoA accuracy validated
  cd tests/fixtures/tdoa
  # Reference triangles test must show ≤ 62m error on all 5 cases
  cat tdoa-accuracy-results.json | jq '[.[].error_m] | max'
  # Must be < 62

PREREQUISITE 4: NATS cluster on ≥ 2 separate hosts
  nats server report cluster | grep -c "server_name"
  # Must be ≥ 5, and at least 2 distinct IP addresses

PREREQUISITE 5: Supabase schema clean
  supabase db diff --project-ref bymfcnwfyxuivinuzurr --linked
  # Must output: "No schema changes detected"

PREREQUISITE 6: Minimum 3 live nodes tested
  psql "$SUPABASE_DB_URL" -c "
    SELECT COUNT(*) FROM nodes
    WHERE last_seen_at > NOW() - INTERVAL '1 hour'
    AND capabilities @> ARRAY['acoustic']"
  # Must return ≥ 3

PREREQUISITE 7: End-to-end pipeline validated with real hardware
  # Not just synthetic test fixtures — must use actual Android phone
  # running W1 app publishing real detection events to NATS
  # through to Telegram alert delivery
  # Evidence: screenshot of Telegram message + logs in tests/e2e/results/

PREREQUISITE 8: Security audit of RLS policies
  # Run RLS audit script
  ./scripts/audit-rls.sh
  # Must pass all checks: anon cannot read alerts, tracks cannot be
  # modified by anon, service_role key not in any client bundle
```

W3 scope (for planning):
- CesiumJS + MapLibre C2 dashboard: real-time track display on 3D terrain
- OpenMCT telemetry integration: battery, inference latency timeline
- GPS PPS synchronization: enforce ±100μs clock accuracy across nodes
- NATS multi-host cluster: 3 cloud VMs, geographic distribution
- W3 security hardening: message-level encryption, node certificate rotation
- Field test: deployment at 3 physical locations with real hardware

---

## 5. Runbook References

| Runbook                                          | Location                                        | Purpose                             |
|--------------------------------------------------|-------------------------------------------------|-------------------------------------|
| NATS cluster startup                             | docs/runbooks/nats-cluster-startup.md           | Start 5-node cluster from scratch   |
| NATS stream configuration                        | docs/runbooks/nats-stream-config.md             | Add/modify stream definitions       |
| NATS consumer lag triage                         | docs/runbooks/nats-consumer-lag.md              | Diagnose and recover from lag spike |
| Supabase migration rollback                      | docs/runbooks/supabase-rollback.md              | Roll back specific migrations       |
| Edge Function deployment                         | docs/runbooks/edge-function-deploy.md           | Deploy + verify Edge Functions      |
| TDoA service restart                             | docs/runbooks/tdoa-service-restart.md           | Restart and verify TDoA service     |
| Telegram bot token rotation                      | docs/runbooks/telegram-token-rotation.md        | Rotate compromised bot token        |
| FreeTAKServer restart                            | docs/runbooks/freetakserver-restart.md          | Restart COT relay service           |
| Meshtastic bridge serial reconnect               | docs/runbooks/meshtastic-serial-reconnect.md    | Handle serial port disconnect       |
| LKGC capture and validation                      | docs/runbooks/lkgc-capture.md                   | Capture and validate LKGC snapshot  |
| Full W2 rollback                                 | docs/waves/W2/LKGC_TEMPLATE.md §4              | Roll back entire W2 deployment      |

---

## 6. Data Flow Summary

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SENSOR LAYER (W1 — unchanged)                                           │
│                                                                          │
│  Android / iOS phone                                                     │
│  AudioRecord → YAMNet TFLite → DetectionEvent                           │
│  WifiManager → RfAnomalyClassifier → DetectionEvent                     │
│  GPS → GpsMetadataProvider                                               │
└────────────────────────┬─────────────────────────────────────────────────┘
                         │ HTTPS POST /functions/v1/ingest-event
                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  EDGE LAYER (Supabase Edge Functions — W2 new)                           │
│                                                                          │
│  ingest-event                                                            │
│  ├── Validate node_id (nodes table)                                     │
│  ├── INSERT detection_events                                             │
│  └── PUBLISH sentinel.detections.{node_id} → NATS DETECTIONS            │
│                                                                          │
│  register-node                                                           │
│  ├── UPSERT nodes                                                        │
│  └── Return NATS NKey credentials                                        │
│                                                                          │
│  node-health                                                             │
│  ├── UPSERT nodes.last_seen_at                                           │
│  ├── INSERT node_health_log                                              │
│  └── PUBLISH sentinel.health.{node_id} → NATS NODE_HEALTH               │
└────────────────────────┬─────────────────────────────────────────────────┘
                         │ NATS JetStream DETECTIONS stream
                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  NATS JETSTREAM CLUSTER (5-node Raft — W2 new)                          │
│                                                                          │
│  Streams:                                                                │
│  DETECTIONS     ── sentinel.detections.>  (72h retention, 5 GiB)       │
│  NODE_HEALTH    ── sentinel.health.>      (24h retention, 500 MiB)     │
│  ALERTS         ── sentinel.alerts.>      (7d retention, 1 GiB)        │
│  COT_EVENTS     ── sentinel.cot.>         (24h retention, 200 MiB)     │
└────────────────────────┬─────────────────────────────────────────────────┘
                         │ Pull consumer: tdoa-correlation-group
                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  TDoA CORRELATION SERVICE (Node.js — W2 new)                            │
│                                                                          │
│  SlidingWindowCorrelator (500ms window)                                  │
│  ├── ≥ 3 nodes: TdoaSolver (Gauss-Newton hyperbolic triangulation)      │
│  │   ├── converged + residual < 5ms → confirmed track                   │
│  │   └── no converge → centroid fallback                                 │
│  └── < 3 nodes: centroid fallback (provisional track)                   │
│                                                                          │
│  → PUBLISH sentinel.alerts.track.{id} → NATS ALERTS                    │
│  → CALL tdoa-correlate Edge Function → INSERT tracks, tdoa_events       │
└────────────────────────┬─────────────────────────────────────────────────┘
                         │ Pull consumer: alert-router-group
                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  ALERT ROUTING (W2 new)                                                  │
│                                                                          │
│  Alert bot                                                               │
│  ├── Telegram: POST /sendMessage → operator notification                │
│  └── INSERT alerts (status=dispatched, external_id=telegram_msg_id)    │
│                                                                          │
│  COT Relay                                                               │
│  ├── NATS COT_EVENTS → FreeTAKServer TCP:8087                           │
│  └── ATAK client receives COT event                                     │
└──────────────────────────────────────────────────────────────────────────┘
                         │ (parallel path)
                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  MESHTASTIC BRIDGE (W2 new)                                              │
│                                                                          │
│  Serial port /dev/ttyUSB0                                                │
│  → Protobuf frame parser                                                 │
│  → Extract detection event payload                                       │
│  → PUBLISH sentinel.detections.{node_id} → NATS DETECTIONS             │
│  → INSERT meshtastic_bridge_log                                         │
│                                                                          │
│  Enables RF-denied environments: no LTE/WiFi required on sensor node.   │
│  Detection travels: LoRa mesh → bridge node → NATS.                     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Key Decisions Made in W2 (Do Not Re-Open)

### DEC-W2-01: NATS JetStream over Kafka or RabbitMQ

**Decision:** NATS JetStream for detection event streaming.

**Rationale:**
- NATS is a single binary (~20MB), zero dependencies, trivial to operate.
- JetStream provides at-least-once delivery with explicit ack — required for TDoA
  (must not lose detection events before correlation).
- NATS client is available for Kotlin (Android), Swift (iOS), Node.js (TDoA service),
  and Deno (Edge Functions via nats.ws).
- 5-node Raft cluster provides HA without ZooKeeper (Kafka requirement).
- Kafka adds operational complexity (ZooKeeper or KRaft, schema registry, Connect)
  that is disproportionate to the message volume (< 10k events/day in W2).

**Do not change to:** Kafka, RabbitMQ, SQS.

---

### DEC-W2-02: 500ms correlation window

**Decision:** TDoA correlation window is 500ms.

**Rationale:**
- INDIGO AirGuard uses a 500ms window. This is the validated reference.
- A drone at 100 km/h covers ~14m in 500ms — within ±62m accuracy budget.
- Shorter window (100ms): too tight for GPS clock jitter on budget smartphones.
- Longer window (2s): risk of correlating distinct drone passes as one event.

**Do not change without:** measuring clock jitter on target hardware and revalidating
triangulation accuracy on reference dataset.

---

### DEC-W2-03: Gauss-Newton solver over closed-form TDOA

**Decision:** Iterative Gauss-Newton solver for TDoA triangulation (adapted from W1 Kotlin).

**Rationale:**
- Closed-form TDOA solutions exist for exactly 3 nodes (Chan-Ho algorithm). With
  4+ nodes, Gauss-Newton is more accurate because it minimizes the combined residual.
- W1 already validated Gauss-Newton on the INDIGO AirGuard reference dataset.
- Reusing W1 solver (same algorithm) reduces validation burden.

---

### DEC-W2-04: Centroid fallback when < 3 nodes

**Decision:** When fewer than 3 nodes are in the correlation window, compute centroid
of node positions and create a `provisional` track (not `confirmed`).

**Rationale:**
- TDoA is mathematically undefined with < 3 nodes (hyperbolic equations underdetermined).
- Discarding 2-node events entirely would lose useful location hints.
- `provisional` status signals to operators: position is rough, no TDoA confidence.
- Provisional tracks do NOT trigger Telegram alerts (alert threshold = confirmed only).

---

### DEC-W2-05: Edge Function ingest-event as write gateway

**Decision:** All detection event ingestion goes through the `ingest-event` Edge Function,
not directly to the database via PostgREST.

**Rationale:**
- PostgREST insert bypasses NATS publishing. TDoA service would not receive events.
- Edge Function can validate node registration and enrich events before storage.
- Edge Function provides a single audit point for all ingestion (edge_function_logs table).
- PostgREST direct write is still available for emergency manual ingestion via service_role.

---

## 8. First-Day Checklist for W3 Engineer

```
[ ] Read docs/waves/W2/ARCHITECTURE.md  — full W2 architecture
[ ] Read docs/waves/W2/DATABASE_SCHEMA.md  — all W2 tables in detail
[ ] Run: nats server ping  — verify cluster health
[ ] Run: supabase db diff --project-ref bymfcnwfyxuivinuzurr --linked
    — expected: "No schema changes detected"
[ ] Run: for fn in register-node ingest-event node-health alert-router tdoa-correlate;
    do curl -sf https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/${fn}/health
    -H "Authorization: Bearer $SUPABASE_ANON_KEY"; done
    — expected: {"status":"ok"} for all 5
[ ] Run: systemctl status apex-tdoa-correlation apex-alert-bot apex-meshtastic-bridge
    — expected: active (running) for all 3
[ ] Run: ./scripts/validate-lkgc.sh LKGC-W2-WAVE-COMPLETE
    — expected: ALL GATES PASSED
[ ] Read docs/waves/W2/LKGC_TEMPLATE.md §3 — understand capture procedure
[ ] Read docs/waves/W2/IMPLEMENTATION_PLAN.md §P4 — TDoA algorithm detail
[ ] Run unit tests: cd services/tdoa-correlation && npx vitest run
    — expected: 0 failures
[ ] Inject a synthetic detection event and trace it through the full pipeline:
    nats pub sentinel.detections.test-node '{"node_id":"test","confidence":0.92,...}'
    then check: Supabase detection_events, tracks, alerts tables
```

---

## 9. Environment Variables Reference

All required variables. Set in `/etc/apex-sentinel/env` (systemd EnvironmentFile),
`.env` (local dev), and Supabase Edge Function secrets.

```
SUPABASE_URL
SUPABASE_ANON_KEY           — mobile app + Edge Function anon
SUPABASE_SERVICE_KEY        — TDoA service + alert bot (server-side only)
SUPABASE_DB_URL             — migrations
SUPABASE_PAT                — DDL via Management API
SUPABASE_PROJECT_REF        — bymfcnwfyxuivinuzurr

NATS_URL                    — nats://nats1.apex-sentinel.internal:4222
NATS_CLUSTER_SEEDS          — comma-separated list of all 5 nodes
NATS_USER
NATS_PASS
NATS_CREDS_FILE             — /etc/apex-sentinel/nats.creds

TELEGRAM_BOT_TOKEN
TELEGRAM_ALERT_CHAT_ID

FTS_HOST                    — FreeTAKServer hostname
FTS_COT_PORT                — 8087

MESHTASTIC_SERIAL_PORT      — /dev/ttyUSB0
MESHTASTIC_BAUD_RATE        — 115200

TDOA_CORRELATION_WINDOW_MS  — 500
TDOA_MIN_NODES              — 3
TDOA_FALLBACK_CENTROID      — true
TDOA_SPEED_OF_SOUND_MS      — 343
```

---

## 10. Current Wave Status

| Wave | Scope                                                   | Status          |
|------|---------------------------------------------------------|-----------------|
| W1   | Android single-node acoustic + RF detection + iOS lite  | COMPLETE        |
| W2   | NATS cluster + Supabase schema + Edge Functions + TDoA  | IN PROGRESS     |
| W3   | C2 dashboard + GPS sync + HA cluster + security         | PLANNED         |
| W4   | Field testing + ATAK integration + hardening            | PLANNED         |

---

*Document owner: Nicolae Fratila | Created: 2026-03-24 | Wave: W2*
*This document must be updated at W2 wave:complete before W3 can start.*
