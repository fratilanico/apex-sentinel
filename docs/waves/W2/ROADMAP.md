# APEX-SENTINEL — Roadmap
## W2 | PROJECTAPEX Doc 08/21 | 2026-03-24

---

## 1. W2 Scope Summary

W2 delivers the backend infrastructure layer: NATS JetStream 5-node cluster, Supabase schema + Edge Functions, mesh networking (Meshtastic LoRa + BLE), TDoA correlation pipeline, and node registration/discovery API. W2 is weeks 8–18 of the APEX-SENTINEL build programme.

W1 delivered: YAMNet edge pipeline, Gate 1/2/3 detection stack, on-device EKF, GPS-PPS synchronisation client, TypeScript node SDK stub, and the PROJECTAPEX 7-doc foundation.

W2 does NOT deliver: mobile apps (W3), CesiumJS 3D UI (W3), EKF+LSTM Gate 4 (W3), multi-tenant C2 dashboard (W4).

---

## 2. Timeline — Weeks 8–18

```
WEEK  8   9   10  11  12  13  14  15  16  17  18
      ├───┤   ├───┤   ├───┤   ├───┤   ├───┤   ├──┤
M2.1  ████████                                       NATS cluster
M2.2      ████████                                   Supabase migrations
M2.3              ████                               register-node EF
M2.4              ████                               ingest-event EF
M2.5                  ████████                       TDoA service
M2.6                          ████████               Mesh bridge
M2.7                                  ████████       Health dashboard
M2.8                                          ████   MTG gate + green
```

Critical path: M2.1 → M2.2 → M2.3 → M2.4 → M2.5 → M2.8.
M2.6 and M2.7 are parallel tracks that merge at M2.8.

---

## 3. Milestones

### M2.1 — NATS Cluster Deployed and Healthy
**Target: end of week 9**

Deliverables:
- 5-node NATS JetStream cluster running with Raft leader elected
- All 8 streams created: `SENTINEL_EVENTS`, `SENTINEL_AUDIO_META`, `SENTINEL_TELEMETRY`, `SENTINEL_TRACKS`, `SENTINEL_ALERTS`, `SENTINEL_NODE_REGISTRY`, `SENTINEL_MESH_RELAY`, `SENTINEL_TDOA_WINDOWS`
- mTLS 1.3 enforced on all client connections; CA-signed node certs issued
- Consumer groups created for TDoA correlator, Track Manager, Alert Router
- NATS exporter metrics scraping into Prometheus; Grafana dashboard baseline
- Cluster health probe: `nats server check cluster --expected 5` returning OK

Acceptance gate: `nats stream ls` shows all 8 streams with replication factor 3; Raft leader elected; 0 pending messages on `SENTINEL_EVENTS` after 60s idle.

Dependencies: hosting decision (self-hosted VMs vs managed); TLS CA established; Tailscale or WireGuard overlay for cluster internal traffic.

Risk: Raft split-brain if fewer than 3 nodes are reachable at bootstrap. Mitigation: bootstrap sequence strictly node-1 first, then 2–5.

---

### M2.2 — Supabase Migrations 001–010 Applied, RLS Policies Active
**Target: end of week 10**

Deliverables:
- Migrations 001–010 applied to Supabase project `bymfcnwfyxuivinuzurr` (eu-west-2)
- Tables: `nodes`, `detection_events`, `tdoa_windows`, `tracks`, `alerts`, `mesh_topology`, `node_heartbeats`, `audit_log`
- pg_partman range partitioning on `detection_events` by month; retention policy enforced
- RLS policies: service-role bypass, node-scoped read, admin full access
- `pgcrypto` extension enabled for UUID generation
- `pg_stat_statements` enabled for query performance baseline
- Supabase Realtime enabled on `detection_events` and `alerts` tables
- All migrations idempotent (safe to re-run)

Acceptance gate: `psql` against Supabase connection URI; all 8 tables present; `EXPLAIN ANALYZE` on `detection_events` shows partition pruning active; `SELECT * FROM nodes` returns empty with RLS blocking anon role.

Dependencies: M2.1 complete (NATS stream names must match Supabase trigger subjects).

Risk: Supabase DDL requires PAT via Management API (not REST). Mitigation: use Management API client; never apply DDL via anon/service key.

---

### M2.3 — register-node Edge Function Live, Enrollment <2s
**Target: end of week 11**

Deliverables:
- `register-node` Deno Edge Function deployed to `bymfcnwfyxuivinuzurr`
- Input: `{ node_id, tier, lat, lon, alt, time_precision_us, cert_fingerprint, firmware_version }`
- Output: `{ enrolled: true, node_token: <JWT>, nats_creds: <creds_file_base64> }`
- Idempotent: re-registration of existing node_id updates record, does not duplicate
- JWT issued with 24h expiry; NATS credentials scoped to node's publish subjects only
- Enrollment round-trip p95 < 2000ms measured from function invocation to response
- Audit log entry written on every registration attempt (success and failure)

Acceptance gate: `curl -X POST https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1/register-node -d '{"node_id":"test-001","tier":1,"lat":51.5,"lon":-0.1,"alt":10,"time_precision_us":1,"cert_fingerprint":"abc123","firmware_version":"2.0.0"}'` returns HTTP 200 with `enrolled: true` within 2s.

Dependencies: M2.2 (nodes table), M2.1 (NATS cred generation).

Risk: NATS cred generation in Edge Function requires NATS operator key in Supabase secrets vault. Key must be rotated separately from NATS cert rotation.

---

### M2.4 — ingest-event Edge Function Live, <500ms Write
**Target: end of week 11 (parallel with M2.3)**

Deliverables:
- `ingest-event` Deno Edge Function deployed
- Input: `SentinelEvent` payload validated against W2 schema (node_id, timestamp_us, gate, confidence, geo_sector, audio_meta, tdoa_eligible)
- Deduplication: `(node_id, timestamp_us, gate)` unique constraint; duplicate returns HTTP 200 with `{ duplicate: true }`
- Supabase insert to `detection_events` with partition routing
- On `tdoa_eligible: true`: publish to `SENTINEL_TDOA_WINDOWS` NATS subject
- On `gate === 3`: publish to `sentinel.gate3.detection.{geo_sector}` subject
- Write p95 < 500ms from function entry to Supabase write confirmed
- Event counter metric exported via Edge Function custom logging

Acceptance gate: synthetic event POST returns HTTP 200; `detection_events` table has 1 row; NATS `SENTINEL_TDOA_WINDOWS` stream has 1 message pending; latency log shows <500ms.

Dependencies: M2.2, M2.3 (node_token JWT validation).

---

### M2.5 — TDoA Correlation Service Live, 3-Node Test Passing
**Target: end of week 13**

Deliverables:
- `tdoa-correlator` Node.js service running as systemd unit `sentinel-tdoa.service`
- NATS consumer attached to `SENTINEL_TDOA_WINDOWS` stream, durable group `tdoa-workers`
- 500ms aggregation window: collects all TDoA-eligible events sharing `(geo_sector, gate3_event_id)` within window
- ≥3 nodes: Newton-Raphson multi-lateration, 3–8 iteration convergence, emits `{ lat, lon, alt, accuracy_m, method: "tdoa" }`
- 2 nodes: centroid fallback, emits `{ lat, lon, accuracy_m: null, method: "centroid" }`
- <3 nodes after 500ms window: discard, increment `tdoa_insufficient_nodes` counter
- Result published to `SENTINEL_TRACKS` stream and written to `tdoa_windows` table
- 3-node synthetic test: nodes at known positions with synthetic arrival timestamps; expected position ±62m; test fixture in `tests/fixtures/3-node-tdoa-scenario.json`

Acceptance gate: run `npm run test:tdoa-integration`; 3-node scenario resolves to position within 62m of ground truth; latency from window open to result < 800ms.

Dependencies: M2.4 (ingest-event publishing to TDOA stream), M2.2 (tdoa_windows table).

Risk: Newton-Raphson divergence on collinear node geometry. Mitigation: divergence guard — if residual > 200m after 8 iterations, fall back to centroid; log geometry warning.

---

### M2.6 — Meshtastic Bridge Live, Offline Relay Tested
**Target: end of week 15**

Deliverables:
- `mesh-bridge` service running as systemd unit `sentinel-mesh-bridge.service`
- Meshtastic Python API integration: listens on MQTT topic `msh/+/json/+/+` bridging to NATS
- BLE Nearby integration: Android Nearby Connections API discovery → local NATS relay
- Offline queue: Room SQLite on Android node stores Gate 3 events when NATS unreachable; sync on reconnect within 30s of connection restore
- Frequency plan: EU 868MHz (channel 0: LongFast, channel 1: MedFast for high-priority)
- Channel encryption: pre-shared AES-256 key distributed via register-node response (encrypted with node cert public key)
- Offline relay test: disconnect test node from internet; fire Gate 3 event; reconnect; verify event appears in Supabase within 30s

Acceptance gate: offline relay test passes; bridge service shows 0 dropped events in normal operation; `nats sub 'sentinel.gate3.>'` receives bridged LoRa events within 3s of Meshtastic receive.

Dependencies: M2.4 (ingest-event), M2.3 (node enrollment for channel key distribution).

Risk: Meshtastic firmware version fragmentation. Mitigation: lock to firmware 2.3.x; CI check against firmware version in register-node payload.

---

### M2.7 — Node Health Dashboard Live (Node Fleet Map)
**Target: end of week 17**

Deliverables:
- `node-health` Edge Function: returns fleet status `{ nodes: [ { node_id, tier, lat, lon, last_seen, status, battery_pct } ] }`
- Heartbeat writer: each node publishes to `sentinel.node.heartbeat.{node_id}` every 60s
- Heartbeat consumer: `sentinel-heartbeat.service` processes heartbeats, writes to `node_heartbeats` table, updates `nodes.last_seen`
- Stale threshold: node marked `DEGRADED` if last_seen > 90s; `OFFLINE` if last_seen > 300s
- Fleet map UI: Leaflet.js embedded dashboard at `/dashboard/fleet`; nodes rendered as tier-coloured markers; realtime updates via Supabase Realtime WS subscription
- Telegram alert: `@SentinelOpsBot` notified when any node transitions to OFFLINE

Acceptance gate: register 3 test nodes; send heartbeats; stop one node's heartbeat for 300s; fleet map shows OFFLINE marker; Telegram alert received within 10s of OFFLINE transition.

Dependencies: M2.3 (node registration), M2.4 (Realtime), M2.2 (node_heartbeats table).

---

### M2.8 — Mind-the-Gap 8/8 + All W2 Tests Green
**Target: end of week 18**

Deliverables:
- All 8 FDRP dimensions passing (Functional, Data, Resilience, Performance, Privacy, Modularity, Accessibility, Gap):
  - Functional: all FR-09 through FR-20 acceptance criteria met
  - Data: migration idempotency, RLS policies, partition pruning verified
  - Resilience: NATS node failure test (kill 2 nodes, cluster still serves); offline relay test
  - Performance: ingest-event <500ms p95, enrollment <2s p95, TDoA <800ms window-to-result
  - Privacy: raw audio confirmed never leaving device; geo coarsening ±50m active
  - Modularity: all W2 services independently deployable; no circular dependencies
  - Accessibility: fleet dashboard WCAG 2.1 AA (screen reader, keyboard nav)
  - Gap: no W3 scope leaked into W2 codebase (checked via `grep -r "cesium\|Gate4\|LSTM" src/`)
- `npx vitest run --coverage` ≥80% branches/functions/lines/statements
- `npx playwright test` all E2E green
- `npm run build && npx tsc --noEmit` clean
- W2 SESSION_STATE.md updated with final status: COMPLETE

---

## 4. Post-W2 Gates (W3 Entry Criteria)

W3 may not begin until all of the following are true:

| Gate | Condition |
|------|-----------|
| G-W2-01 | M2.1–M2.8 all marked COMPLETE in ARTIFACT_REGISTRY.md |
| G-W2-02 | `npx vitest run --coverage` shows ≥80% all metrics |
| G-W2-03 | Zero open P0/P1 bugs in RISK_REGISTER.md |
| G-W2-04 | NATS cluster uptime >99.9% over 72-hour soak |
| G-W2-05 | Supabase `detection_events` partition pruning verified on real data |
| G-W2-06 | TDoA 3-node synthetic test passing in CI (not just local) |
| G-W2-07 | SESSION_STATE.md W3 handoff section populated |
| G-W2-08 | All W2 ADRs in DECISION_LOG.md marked ACCEPTED |

---

## 5. W3 Dependencies (Items W2 Must Deliver for W3)

```
FROM W2                              CONSUMED BY W3
─────────────────────────────────────────────────────────
register-node JWT format             Android/iOS SDK auth
NATS subject schema                  Mobile NATS publish
ingest-event API contract            Mobile event uploader
Supabase Realtime subscription API   CesiumJS live feed
node-health fleet endpoint           C2 dashboard map feed
TDoA result schema                   CesiumJS threat render
Mesh channel key distribution        Mobile mesh enrollment
alert-router CoT schema              TAK server integration
```

W3 cannot begin CesiumJS integration until `ingest-event` and `node-health` Edge Functions are stable (no breaking schema changes for 14 days).

---

## 6. W2 Risk Register (Summary)

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R-W2-01 | NATS Raft split-brain at bootstrap | Medium | High | Strict boot order; node-1 bootstrap first |
| R-W2-02 | Supabase DDL via wrong API | Low | High | PAT + Management API only; CI guard |
| R-W2-03 | Meshtastic firmware fragmentation | High | Medium | Lock firmware 2.3.x; version check in enrollment |
| R-W2-04 | TDoA Newton-Raphson divergence | Medium | Medium | Divergence guard + centroid fallback |
| R-W2-05 | NATS cred generation key exposure | Low | Critical | Key in Supabase vault; audit log every issuance |
| R-W2-06 | pg_partman partition overflow | Low | High | Retention policy in migration 010; monthly cron verify |
| R-W2-07 | Offline queue replay ordering | Medium | Medium | Monotonic timestamp; dedup on `(node_id, timestamp_us, gate)` |
| R-W2-08 | mTLS cert expiry causing cluster outage | Low | Critical | 90-day rotation; 14-day pre-expiry Telegram alert |
| R-W2-09 | Edge Function cold start >2s | Medium | Low | Supabase warm-up ping every 5min from heartbeat service |
| R-W2-10 | BLE Nearby pairing UX friction | High | Medium | Fallback to QR-code enrollment; documented in W3 mobile scope |

---

## 7. Dependency Map

```
W1 Outputs (required by W2)
├── TypeScript SentinelEvent type definitions  → used by ingest-event validator
├── Gate 1/2/3 confidence thresholds           → used by TDoA window eligibility
├── GPS-PPS sync client                        → used by TDoA timestamp weighting
├── Node SDK stub (register + publish)         → extended in W2 with NATS creds
└── W1 test fixtures (audio_meta samples)      → extended in W2 integration tests

W2 Internal Dependencies
├── M2.1 (NATS) ─────────────────────────────── M2.3, M2.4, M2.5, M2.6, M2.7
├── M2.2 (Supabase) ─────────────────────────── M2.3, M2.4, M2.5, M2.7
├── M2.3 (register-node) ────────────────────── M2.4 (JWT validation), M2.6 (key dist)
├── M2.4 (ingest-event) ─────────────────────── M2.5 (TDOA stream source)
├── M2.5 (TDoA) + M2.6 (Mesh) + M2.7 (Health) ─ M2.8 (gate)
└── M2.8 ────────────────────────────────────── W3 entry
```

---

## 8. Success Definition

W2 is SUCCESS when:
1. A detection event fired on a remote node (simulating drone detection) traverses the full stack: NATS publish → ingest-event → Supabase write → TDoA correlation → alert-router → Telegram notification — end-to-end in under 3 seconds.
2. All 8 FDRP mind-the-gap dimensions pass.
3. Zero P0/P1 open bugs.
4. All W2 CI tests green on `main` branch.
5. W3 team (or W3 wave session) can begin work without needing to ask W2 author any questions — SESSION_STATE.md and HANDOFF.md are self-sufficient.
