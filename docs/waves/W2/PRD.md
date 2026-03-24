# APEX-SENTINEL — Product Requirements Document
## W2 | PROJECTAPEX Doc 02/21 | 2026-03-24

---

## 1. Overview

W2 delivers the backend infrastructure layer that transforms APEX-SENTINEL from a single-node edge detection system into a networked multi-node detection platform with real-time data pipelines, persistent storage, and operator tooling.

This PRD defines what W2 must achieve from the perspective of five distinct user roles. It specifies acceptance criteria that gate W2 completion, and success metrics that define production readiness.

**W2 is complete when:** all acceptance criteria are met, all success metrics pass under load test, and the system survives a simulated 5-minute NATS cluster partition with zero data loss.

---

## 2. User Personas

### P1 — Ops Engineer (DevOps/SRE)
**Context:** Monitors the APEX-SENTINEL infrastructure 24/7. Responsible for NATS cluster health, Supabase performance, certificate lifecycle, and edge function reliability. Primary concern: system is up and healthy.

**Environment:** Dashboard on desktop browser. Receives PagerDuty alerts. Has SSH access to NATS nodes.

**Pain points in W1:** No visibility into backend health. No structured logs. No health endpoints.

### P2 — Node Operator
**Context:** Field technician or automated agent deploying APEX-SENTINEL nodes. Responsible for physically placing nodes, running registration sequence, confirming the node is online.

**Environment:** Laptop or phone in the field. May have poor connectivity. CLI or mobile app triggers registration API.

**Pain points in W1:** Node registration had no feedback. No way to confirm node was accepted. No way to see if heartbeats are arriving.

### P3 — C2 Operator
**Context:** Command and Control operator watching the detection dashboard in real-time. Makes tactical decisions based on track data. Does not care about infrastructure; cares about detections.

**Environment:** Dedicated workstation, 2 monitors. One shows map with tracks, one shows event stream.

**Pain points in W1:** Events were local to each node. No aggregated track view. No real-time stream to C2 dashboard.

### P4 — Field Engineer (Mesh Deployment)
**Context:** Specialist deploying mesh relay nodes in areas with no IP connectivity. Responsible for ensuring LoRa/BLE relay coverage bridges IP-dark zones to the NATS network.

**Environment:** Outdoors, harsh conditions. Mobile app or CLI tool. May be offline during deployment.

**Pain points in W1:** No mesh mode. All nodes required IP. Could not deploy in IP-dark zones.

### P5 — Privacy Officer
**Context:** Compliance role responsible for ensuring APEX-SENTINEL meets GDPR Article 17, UK Data Protection Act 2018, and any applicable military data handling regulations.

**Environment:** Dashboard + SQL access to audit log. Periodically reviews data flows and RLS policies.

**Pain points in W1:** No audit trail. No visibility into what data was transmitted. No retention enforcement.

---

## 3. User Stories and Acceptance Criteria

### Epic W2-E1: NATS Cluster Management

---

**W2-US-01: Ops Engineer — Cluster Health Visibility**

> As an Ops Engineer, I want to see the real-time health of all 5 NATS nodes on a single dashboard panel, so I can immediately identify which node is the Raft leader and whether any node is lagging.

**Acceptance Criteria:**
- AC-01.1: Dashboard panel shows 5 NATS node slots with: node ID, Raft role (leader/follower/candidate), current RTT to leader, messages/second throughput
- AC-01.2: Raft term number displayed; updates within 2 seconds of a leader election
- AC-01.3: Consumer lag per stream is displayed; rows with lag > 1000 are highlighted red
- AC-01.4: Panel refreshes every 5 seconds without full page reload
- AC-01.5: If NATS monitoring endpoint returns error, panel shows "NATS MONITORING UNAVAILABLE" with last-known state and timestamp

---

**W2-US-02: Ops Engineer — Stream Configuration Audit**

> As an Ops Engineer, I want to view the current NATS stream configuration (retention policy, storage limits, consumer count) without SSH access, so I can audit configuration drift.

**Acceptance Criteria:**
- AC-02.1: `/functions/v1/nats-admin/streams` endpoint returns list of all streams with: name, subjects, retention_policy, max_age_s, max_bytes, num_consumers, num_messages
- AC-02.2: Endpoint requires `role = ops_admin` JWT claim
- AC-02.3: Response cached for 30 seconds (NATS admin calls are expensive)
- AC-02.4: Configuration diff visible when compared against version-controlled baseline

---

**W2-US-03: Ops Engineer — Consumer Lag Alerting**

> As an Ops Engineer, I want to receive a PagerDuty alert when any NATS consumer lag exceeds 10,000 messages for more than 2 minutes, so I can respond before data loss occurs.

**Acceptance Criteria:**
- AC-03.1: Monitoring probe polls consumer lag every 30 seconds
- AC-03.2: Alert fires when lag > 10,000 sustained for ≥ 2 minutes (not on a single spike)
- AC-03.3: Alert body includes: stream name, consumer name, current lag, lag trend (increasing/stable/decreasing)
- AC-03.4: Alert auto-resolves when lag drops below 1,000
- AC-03.5: No alert fatigue: identical alerts deduplicated within 10-minute window

---

### Epic W2-E2: Node Registration and Management

---

**W2-US-04: Node Operator — Device Registration**

> As a Node Operator, I want to register a new detection node using a single API call from the device, so the device becomes active in the fleet within 2 minutes.

**Acceptance Criteria:**
- AC-04.1: `POST /functions/v1/register-node` accepts: node_id, tier, capabilities[], lat, lon, alt, time_precision_us, direct_endpoint, certificate PEM
- AC-04.2: Registration validates mTLS certificate chain against APEX-SENTINEL CA; rejects if chain invalid
- AC-04.3: On success, returns 202 Accepted with node record and NATS credentials (subject prefix, max message size)
- AC-04.4: Node appears in Supabase `nodes` table within 500ms of registration
- AC-04.5: Node state is `PENDING` until first heartbeat received; transitions to `ONLINE` on first valid heartbeat
- AC-04.6: If node_id already exists and certificate matches, returns existing record (idempotent re-registration)
- AC-04.7: If node_id already exists and certificate does NOT match, returns 409 with `NODE_ALREADY_EXISTS`
- AC-04.8: End-to-end registration time (API call → node visible in dashboard) < 2 seconds at p95

---

**W2-US-05: Node Operator — Registration Status Feedback**

> As a Node Operator, I want to poll the status of my node after registration, so I can confirm it transitioned to ONLINE without needing dashboard access.

**Acceptance Criteria:**
- AC-05.1: `GET /functions/v1/node-status/{nodeId}` returns current node state with: state, last_seen_at, missed_heartbeats, active_capabilities[], geo_sector
- AC-05.2: Endpoint requires only valid node mTLS certificate (no JWT required for a node polling its own status)
- AC-05.3: Returns 404 with `NODE_NOT_FOUND` if node_id does not exist
- AC-05.4: Response includes `nats_endpoint` and `nats_subject_prefix` for nodes in ONLINE or PENDING state

---

**W2-US-06: Node Operator — Heartbeat Submission**

> As a Node Operator (automated node process), I want to send periodic heartbeats to the backend, so the backend knows the node is alive and can update its position and battery status.

**Acceptance Criteria:**
- AC-06.1: `POST /functions/v1/node-health` accepts heartbeat payload: node_id, lat, lon, alt, battery_percent, signal_strength, active_capabilities[], timestamp_us
- AC-06.2: Heartbeat validates node_id exists and certificate matches
- AC-06.3: Heartbeat written to `node_heartbeats` table within 500ms
- AC-06.4: `nodes.last_seen_at` updated, `nodes.missed_heartbeats` reset to 0
- AC-06.5: If battery_percent < 10, node state set to DEGRADED and alert raised
- AC-06.6: Heartbeat also published to NATS `sentinel.node.heartbeat` subject within 100ms
- AC-06.7: Node transitions to OFFLINE state if missed_heartbeats reaches 2 (configurable, default 2)
- AC-06.8: Heartbeat endpoint rate-limited to max 1 per 10 seconds per node

---

### Epic W2-E3: Real-time Detection Stream

---

**W2-US-07: C2 Operator — Live Detection Feed**

> As a C2 Operator, I want to see detection events appear on my dashboard in real-time as they are confirmed by the backend, so I can respond to drone activity immediately.

**Acceptance Criteria:**
- AC-07.1: Supabase Realtime WebSocket subscription to `detection_events` delivers new rows within 500ms of database insert
- AC-07.2: Events displayed with: timestamp, threat_class, fused_confidence, position (lat/lon), position_error_m, contributing node count
- AC-07.3: Events above `fused_confidence = 0.7` displayed prominently (larger, coloured by severity)
- AC-07.4: WebSocket reconnects automatically within 5 seconds on connection drop; no events lost during reconnect window (catch-up query on reconnect)
- AC-07.5: Dashboard handles burst of 100 events/second without UI jank (virtual scroll or windowing required)

---

**W2-US-08: C2 Operator — Track State Display**

> As a C2 Operator, I want to see confirmed tracks on a map with their current position, predicted trajectory, and confidence, so I can assess threat severity.

**Acceptance Criteria:**
- AC-08.1: Supabase Realtime subscription to `tracks` delivers state changes within 500ms
- AC-08.2: Track shown on map with: current lat/lon/alt, velocity vector arrow, predicted_5s position (dotted circle with position_error radius)
- AC-08.3: Track colour encodes state: ACTIVE=amber, CONFIRMED=red, COASTING=blue, DROPPED=grey
- AC-08.4: Clicking track shows panel with: threat_class, contributing nodes, contributing gates, confidence history
- AC-08.5: DROPPED tracks fade out over 30 seconds, not instantly removed

---

**W2-US-09: C2 Operator — Alert Acknowledgment**

> As a C2 Operator, I want to acknowledge alerts and mark them as actioned, so the team has a clear record of which alerts have been responded to.

**Acceptance Criteria:**
- AC-09.1: Alert panel shows PENDING, ACKNOWLEDGED, ACTIONED states
- AC-09.2: PATCH `/functions/v1/alert-router/{alertId}/status` accepts `{ "state": "ACKNOWLEDGED" | "ACTIONED", "notes": "..." }`
- AC-09.3: State change logged to `operator_audit_log` with operator_id, action, timestamp, IP
- AC-09.4: CoT XML for the alert available as download from alert detail panel
- AC-09.5: All operators with active sessions see acknowledgment within 1 second (via Realtime)

---

### Epic W2-E4: Mesh Networking

---

**W2-US-10: Field Engineer — LoRa Mesh Relay Deployment**

> As a Field Engineer, I want to deploy a Meshtastic LoRa relay node that bridges IP-dark zones to the NATS network, so detection events from those zones are not lost.

**Acceptance Criteria:**
- AC-10.1: Mesh relay node registers with tier = TIER_4_SMARTPHONE, capabilities including `mesh_relay`
- AC-10.2: Nodes in IP-dark zones detect LoRa relay availability and switch to MESH-ONLY state automatically
- AC-10.3: Detection events from MESH-ONLY nodes arrive at NATS within 5 seconds of emission (LoRa latency budget)
- AC-10.4: Node state shown as MESH-ONLY (blue) in dashboard, not OFFLINE
- AC-10.5: Mesh path visible in node detail panel (relay chain up to 4 hops)
- AC-10.6: Events relayed via mesh are tagged with `relay_path: ["nde_abc", "nde_def"]` in NATS subject headers

---

**W2-US-11: Field Engineer — BLE Nearby Connections Fallback**

> As a Field Engineer deploying in dense urban environments, I want BLE-based offline mode to activate automatically when both IP and LoRa are unavailable, so I have a last-resort relay path.

**Acceptance Criteria:**
- AC-11.1: BLE relay activates when: no IP for >30s AND no LoRa signal for >30s
- AC-11.2: BLE relay range: max 30m (Google Nearby Connections limitation); dashboard shows BLE link in dotted green
- AC-11.3: Detection events queued locally during BLE relay, de-duplicated on re-connection to IP/LoRa
- AC-11.4: Maximum BLE queue: 500 events before oldest are dropped (LRU, not silent)
- AC-11.5: Dashboard notification when node enters BLE relay mode: "NODE IN BLE FALLBACK — limited throughput"

---

### Epic W2-E5: Privacy and Compliance

---

**W2-US-12: Privacy Officer — Data Flow Audit**

> As a Privacy Officer, I want to view a complete audit trail of all operator actions and data transmissions, so I can demonstrate compliance with GDPR Article 5 (data minimisation) and Article 30 (records of processing).

**Acceptance Criteria:**
- AC-12.1: `operator_audit_log` captures every action: login, alert acknowledgment, node force-offline, certificate revocation, configuration change
- AC-12.2: Log includes: operator_id (pseudonymised), action, resource, details JSONB, ip_addr (coarsened to /24), created_at
- AC-12.3: Audit log is append-only (no UPDATE or DELETE RLS permissions for any role)
- AC-12.4: Audit log retains for 365 days minimum, then automatically deleted by pg_cron
- AC-12.5: Export endpoint: `GET /functions/v1/audit-log?from=ISO8601&to=ISO8601` returns JSONL, requires `role = privacy_officer`

---

**W2-US-13: Privacy Officer — Raw Audio Rejection**

> As a Privacy Officer, I want assurance that raw audio bytes cannot be submitted through the API, so I can document that raw audio never transits the backend network.

**Acceptance Criteria:**
- AC-13.1: `ingest-event` Edge Function inspects payload for field names matching: `audio`, `waveform`, `pcm`, `samples`, `raw_audio`, `audio_bytes`; rejects with 422 `RAW_AUDIO_REJECTED` if found
- AC-13.2: Payload byte size limit of 64KB enforced; audio files typically > 100KB even at minimal quality
- AC-13.3: Rejection logged to audit_log with: node_id, endpoint, rejection_reason, payload_size
- AC-13.4: All ingest events contain only derived features: acoustic_confidence (float), peak_freq_hz, fused_confidence — no raw data

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| Node enrollment latency | < 2s p95 | Trace: API call → node visible in dashboard |
| NATS publish latency | < 100ms p99 | Trace: Edge Function call → NATS message confirmed |
| Supabase write latency | < 500ms p99 | Measured at Edge Function level |
| WebSocket event delivery | < 500ms p95 | Measured from DB insert to WebSocket client receipt |
| Heartbeat processing | < 200ms p99 | Traced end-to-end |
| TDoA correlation | < 1s for 3-node fix | Measured from last contributing event to track update |

### 4.2 Availability

| Component | Target |
|-----------|--------|
| NATS cluster (5-node) | 99.99% (52 min downtime/year) |
| Supabase (hosted, London) | 99.95% (per Supabase SLA) |
| Edge Functions | 99.9% (Supabase SLA) |
| Mesh relay coverage | Best-effort, no SLA |

### 4.3 Durability

- Zero event loss on node reconnect: events queued locally and replayed when connection restores
- NATS persistence: all streams use `file` storage with replication factor 3
- Supabase: continuous WAL backup, point-in-time recovery to 1-second granularity

### 4.4 Scalability

- Node fleet: up to 500 nodes in initial design; horizontal NATS scaling supports 10,000+
- Event throughput: 10,000 events/second aggregate across all nodes
- Track manager: horizontal scaling via geo-sector consistent hash ring
- Supabase: partition `detection_events` by month when row count exceeds 10M

### 4.5 Security

- All NATS connections: mTLS 1.3 only, no plain connections accepted
- All Edge Functions: JWT authentication for operator roles, mTLS for node roles
- NATS credentials scoped to subject prefixes (node cannot publish to another node's subject)
- Supabase RLS: row-level enforcement for all tables, no bypass routes

---

## 5. Success Metrics

### 5.1 Technical Success Metrics (W2 Gate)

These must pass before W2 is considered complete:

```
SM-01: Node enrollment p95 latency < 2s under 50 concurrent registrations
SM-02: NATS publish p99 latency < 100ms under 1,000 events/second sustained
SM-03: Supabase write p99 latency < 500ms under 500 events/second sustained
SM-04: NATS cluster survives single node failure with zero message loss
SM-05: NATS cluster survives 5-minute partition (2-vs-3 split) with zero data loss (minority partition queues)
SM-06: 100% of heartbeats received from 50 nodes over 30 minutes arrive in database
SM-07: WebSocket delivery latency < 500ms for 10 concurrent dashboard clients
SM-08: TDoA correlation produces fix for ≥95% of 3-node concurrent detection events
SM-09: Zero raw audio bytes accepted by ingest-event function (test with crafted payloads)
SM-10: All RLS policies verified: node cannot read another node's records
```

### 5.2 Operational Success Metrics (30-day post-deploy)

```
SM-11: NATS cluster uptime ≥ 99.99% (< 4 minutes downtime in 30 days)
SM-12: Zero data loss incidents
SM-13: Zero security incidents (authentication bypass, RLS bypass)
SM-14: Operator onboarding time < 30 minutes (new ops engineer, zero prior knowledge)
SM-15: Mean time to detect a node failure (MTTD) < 3 minutes (2 missed heartbeats = 2 × 60s + alert latency)
```

---

## 6. Out of Scope for W2

The following items are explicitly deferred to W3 or later:

- C2 dashboard frontend application (W3)
- Mobile app for node operators (W3)
- Multi-tenant deployments (W4)
- Elvis model integration (W4)
- GPU-accelerated TDoA solver (W4)
- Automated certificate rotation without human approval (W4)
- Integration with external threat intelligence feeds (W5)
- ATAK/TAK server direct integration (W3 partial, W5 full)

---

## 7. Dependencies

| Dependency | Type | Risk | Mitigation |
|------------|------|------|------------|
| Supabase eu-west-2 (London) | Hard | Low | Hosted, 99.95% SLA; PG backup ready |
| NATS JetStream 2.10+ | Hard | Low | Docker image pinned to 2.10.x |
| Meshtastic firmware ≥ 2.3 | Hard | Medium | Firmware version gated in registration |
| Google Nearby Connections SDK | Soft | Medium | BLE relay is fallback; not blocking |
| Azure GPU quota (W4) | None (W4) | — | Deferred |
| APEX-SENTINEL W1 complete | Hard | None | W1 complete per MEMORY.md |

---

## 8. Risks

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| R-01 | NATS Raft split-brain under network partition | Low | High | 5-node cluster: majority always ≥ 3; minority partition queues to file storage |
| R-02 | Supabase RLS policy regression on migration | Medium | High | All RLS policies covered by integration tests; migration-level tests gate deploy |
| R-03 | TDoA solver divergence with bad timestamps | Medium | Medium | Input validation: reject events where timestamp_us > 500ms from wall clock; fallback to centroid |
| R-04 | mTLS certificate expiry causing fleet-wide outage | Low | Critical | 90-day rotation with 14-day warning; automated rotation triggered on 7-day warning |
| R-05 | LoRa duty cycle limit (1%) saturated under high event rate | Medium | Medium | Rate-limit mesh relay events to 1/s per node; prioritise Gate 3 events over heartbeats |
| R-06 | Supabase Edge Function cold start > 2s | Low | Medium | Warm function by pinging every 30s; 202 Accepted pattern for async registration |

---

## 9. Definition of Done

W2 is done when:

1. All 13 user stories have all acceptance criteria passing (automated tests)
2. All 10 SM-0x technical success metrics pass under load test
3. NATS partition survival test passes (SM-04, SM-05)
4. All Supabase migrations applied cleanly to production project `bymfcnwfyxuivinuzurr`
5. All 5 Edge Functions deployed and health-checked
6. Privacy Officer sign-off: audit log operational, RLS verified, audio rejection verified
7. W2 HANDOFF.md written with all credentials, endpoints, and runbook references
8. W2 LKGC_TEMPLATE.md committed with known-good configuration snapshot
9. `wave-formation.sh complete W2` executed successfully
