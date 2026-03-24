# APEX-SENTINEL W2 — Risk Register

**Document ID:** RISK_REGISTER-W2
**Wave:** W2 — Infrastructure Backbone
**Status:** ACTIVE
**Owner:** Nicolae Fratila
**Created:** 2026-03-24
**Last Updated:** 2026-03-24
**Review Cadence:** Daily during W2 execution; weekly post-W2

---

## 1. Overview

This register tracks all identified technical, operational, and compliance risks for Wave 2 of APEX-SENTINEL. W2 is the highest-risk wave in the programme — it assembles the infrastructure backbone from scratch, including a 5-node NATS JetStream cluster, Supabase schema, four Edge Functions, TDoA correlation service, and multiple external integrations. Risk materialisations in W2 can cascade to W3 (alerting workflows) and W4 (C2 dashboard). Each risk has been scored pre-mitigation and assigned a status.

### 1.1 Scoring Matrix

**Probability:** H = >60% likelihood before mitigation | M = 20–60% | L = <20%
**Impact:** H = Wave slip >3 days or data loss/security breach | M = Wave slip 1–3 days or degraded capability | L = <1 day delay or cosmetic issue
**Risk Score:** HH = 9 (Critical) | HM/MH = 6 (High) | MM/HL/LH = 4–5 (Medium) | ML/LM = 3 (Low) | LL = 1 (Negligible)

### 1.2 Status Definitions

| Status | Meaning |
|--------|---------|
| OPEN | Risk active; mitigation not yet applied |
| MITIGATED | Mitigation applied; residual risk accepted |
| ACCEPTED | Known risk; no mitigation possible; owner accepts |
| CLOSED | Risk no longer applicable |
| TRIGGERED | Risk has materialised; incident in progress |

---

## 2. Risk Register

---

### RISK-W2-01: NATS Raft Split-Brain During Cluster Formation

**Risk ID:** RISK-W2-01
**Category:** Infrastructure / Availability
**FR Impact:** FR-W2-01
**Pre-Mitigation Probability:** H
**Pre-Mitigation Impact:** H
**Pre-Mitigation Score:** 9 (Critical)
**Post-Mitigation Probability:** L
**Post-Mitigation Impact:** M
**Post-Mitigation Score:** 3 (Low)
**Owner:** Infrastructure Engineer
**Status:** OPEN

#### 2.1.1 Description

During initial 5-node NATS JetStream cluster formation, if nodes attempt to elect a leader before all cluster routes are established, a split-brain condition can occur where two separate Raft groups both believe they are the leader. In NATS JetStream, split-brain manifests as diverging meta-leader election, resulting in write conflicts, message duplication, or complete JetStream unavailability. This is most likely during the initial cold-start sequence when DNS resolution is intermittent or node startup ordering is not controlled.

Split-brain is particularly dangerous in the W2 context because the cluster is initialised on fresh VMs without a pre-existing Raft journal. NATS requires a strict majority (≥3 of 5 nodes) to form quorum; if nodes 1 and 2 start significantly before nodes 3–5, they may form a 2-node Raft group that is not quorate but also refuses subsequent join attempts from nodes 3–5 if cluster name mismatch or auth token mismatch occurs.

#### 2.1.2 Trigger Conditions

- Nodes started in incorrect order without sequential delay
- DNS for nats1–nats5.apex-sentinel.internal not fully propagated when nodes start
- Network partition (Tailscale tunnel disruption) during initial formation
- Clock skew >2s between cluster nodes causing Raft heartbeat timeout

#### 2.1.3 Mitigation

1. **Sequential start script**: `infra/nats/start-cluster.sh` starts nats1, waits 5s, starts nats2, waits 5s, then nats3-5 in sequence. All nodes must be able to resolve cluster peers in DNS before start script advances.
2. **DNS pre-check**: Start script verifies all 5 hostnames resolve before starting any node: `for h in nats{1..5}.apex-sentinel.internal; do dig +short $h || exit 1; done`
3. **Clock sync**: All cluster nodes sync to same NTP server (`chrony` or `timesyncd`); max skew tolerance 100ms. Drift check is part of pre-flight check script.
4. **Split-brain recovery procedure**: Documented in `docs/runbooks/nats-splitbrain-recovery.md`: (1) `nats-server --signal stop` on all nodes, (2) wipe `meta/` subdirectory of JetStream store dir on all nodes, (3) restart in sequence. Only safe during W2 because no production data yet.
5. **Raft log monitoring**: Alert on `meta_leader_epoch` not incrementing within 30s of startup via monitoring endpoint at `:8222/healthz`.

#### 2.1.4 Residual Risk

Even with mitigation, a network partition mid-operation (e.g., Tailscale flap) can cause split-brain post-formation. This is accepted risk — NATS JetStream's built-in Raft re-convergence handles this within 10–30s. The detection pipeline degrades gracefully: nodes buffer to local disk and replay when NATS reconnects.

---

### RISK-W2-02: NATS Message Deduplication Failure Causing Duplicate Detection Events

**Risk ID:** RISK-W2-02
**Category:** Data Integrity
**FR Impact:** FR-W2-02, FR-W2-05
**Pre-Mitigation Probability:** H
**Pre-Mitigation Impact:** M
**Pre-Mitigation Score:** 6 (High)
**Post-Mitigation Probability:** L
**Post-Mitigation Impact:** L
**Post-Mitigation Score:** 1 (Negligible)
**Owner:** Backend Engineer
**Status:** OPEN

#### 2.2.1 Description

NATS JetStream provides at-least-once delivery semantics by default. If the `ingest-event` Edge Function crashes after inserting a detection event but before ACKing the NATS message, NATS will redeliver the message. This results in duplicate rows in `detection_events`, which can cause: (1) duplicate TDoA correlation inputs inflating confidence scores, (2) duplicate alert generation for the same physical event, (3) false track creation from phantom duplicate detections.

The window of vulnerability is between Supabase INSERT commit and NATS ACK. If the Edge Function times out (Supabase Edge Functions have a 150s hard limit), this window can be seconds long. In high-throughput scenarios (>100 detections/sec during swarm event), this creates systematic duplication rather than occasional duplication.

#### 2.2.2 Trigger Conditions

- Edge Function crash after INSERT, before NATS ACK
- NATS redelivery of unACKed message after `ack_wait` timeout (default 30s)
- Network partition between NATS and Supabase during ACK
- Edge Function timeout (>150s) causing unACKed message backlog

#### 2.2.3 Mitigation

1. **Idempotent UPSERT on `nats_seq`**: `detection_events.nats_seq` has a UNIQUE constraint. The Edge Function uses `INSERT ... ON CONFLICT (nats_seq) DO NOTHING` — duplicate delivery attempts a no-op insert and returns `skipped_duplicates: N`.
2. **Short `ack_wait`**: DETECTIONS stream consumer configured with `ack_wait: 5s` (not default 30s). The Edge Function must ACK within 5s or the message redelivers. Edge Function timeout set to 10s (not 150s default) for `ingest-event`.
3. **Explicit ACK in finally block**: Edge Function ACKs the NATS message in a `finally` block after the database transaction, regardless of insert outcome (success or duplicate).
4. **DLQ for repeated failures**: After 3 redeliver attempts without ACK, message moves to `sentinel.dlq.detections.*` for manual review.

#### 2.2.4 Residual Risk

`nats_seq` is the NATS JetStream stream sequence, which is globally unique per stream. This is more reliable than application-generated UUIDs. The only failure mode remaining is if a node publishes the same physical detection event twice with different `nats_seq` values (application-level duplication). This is mitigated at W1 by the `audio_hash` dedup check in the node agent, which is outside W2 scope.

---

### RISK-W2-03: Supabase Edge Function Cold Start Latency Breaking Real-Time Pipeline

**Risk ID:** RISK-W2-03
**Category:** Performance / Latency
**FR Impact:** FR-W2-04, FR-W2-05, FR-W2-06, FR-W2-07
**Pre-Mitigation Probability:** H
**Pre-Mitigation Impact:** M
**Pre-Mitigation Score:** 6 (High)
**Post-Mitigation Probability:** M
**Post-Mitigation Impact:** L
**Post-Mitigation Score:** 3 (Low)
**Owner:** Backend Engineer
**Status:** OPEN

#### 2.3.1 Description

Supabase Edge Functions (Deno runtime) have a cold start latency of 150–400ms when the function has been idle for >60s. This is inherent to the Deno isolate initialisation time. In the APEX-SENTINEL pipeline, the critical latency budget from detection to Telegram alert is 2000ms. The pipeline is: Node detect (0ms) → NATS publish (10ms) → ingest-event cold start (0–400ms) → Supabase INSERT (20–50ms) → TDoA solve (50–200ms) → alert-router cold start (0–400ms) → Telegram API (100–300ms). Worst-case cold start scenario: 400 + 400 = 800ms consumed by cold starts alone, leaving 1200ms for all other hops. This is tight but achievable.

The more serious risk is when both `ingest-event` AND `alert-router` are cold simultaneously — i.e., no traffic has occurred in >5 minutes. In a deployment scenario where the system is idle overnight and a drone appears at 3am, both functions cold-start simultaneously, pushing latency to 2800–3000ms total, which exceeds the 2000ms budget.

#### 2.3.2 Trigger Conditions

- System idle for >60s (both functions cold)
- Supabase platform deploys a function update (all instances go cold)
- Supabase edge node in eu-west-2 restarts (ops event)

#### 2.3.3 Mitigation

1. **Keep-warm cron**: A scheduled NATS JetStream message is published to `sentinel.health.keep-warm` every 45s by a fortress cron. This triggers `node-health` Edge Function, keeping at least that function warm. A separate keep-warm HTTP GET to `ingest-event` and `alert-router` health endpoints is sent every 45s by the same cron.
2. **Optimise cold start path**: Move all initialisation (Supabase client, JWT validator) to module-level top-level `await` so they run during isolate initialisation, not during request handling. Target: reduce cold-start penalty from 400ms to <150ms.
3. **Pipeline buffering**: NATS JetStream consumer is configured with `max_ack_pending: 1000` and `deliver_policy: all` — if Edge Function is cold during a burst, NATS buffers and delivers as fast as the function can process. This means total throughput is maintained; only the first event in a cold burst is latency-affected.
4. **Latency SLO relaxed for first event**: First event after idle period has SLO of 5000ms; subsequent events in same burst have SLO of 2000ms. This is documented in the SLO register.

---

### RISK-W2-04: TDoA Correlation Window Too Tight Causing Missed Multi-Node Correlations

**Risk ID:** RISK-W2-04
**Category:** Algorithm / Detection Quality
**FR Impact:** FR-W2-08
**Pre-Mitigation Probability:** H
**Pre-Mitigation Impact:** H
**Pre-Mitigation Score:** 9 (Critical)
**Post-Mitigation Probability:** M
**Post-Mitigation Impact:** M
**Post-Mitigation Score:** 4 (Medium)
**Owner:** Signal Processing Engineer
**Status:** OPEN

#### 2.4.1 Description

The TDoA correlation service groups detection events within a configurable time window (`TDOA_WINDOW_MS`, default 500ms) to find multi-node correlations. This window must be large enough to contain arrival time differences from nodes spread across a 2km radius, plus NATS delivery latency, plus node clock skew.

Maximum theoretical TDOA for a target at edge of coverage: 2000m / 343 m/s ≈ 5.8ms for acoustic; RF propagation is effectively 0ms (speed of light). So acoustic TDOA itself is at most 6ms. However, NATS delivery latency from a remote node over a degraded Meshtastic relay can be 200–800ms. Adding node clock skew of up to 50ms (untreated), total window requirement is: 6ms (TDOA) + 800ms (network) + 50ms (clock skew) + 100ms (processing jitter) = 956ms. The default 500ms window is too tight in high-latency Meshtastic relay scenarios.

Conversely, a window that is too wide (>2000ms) causes false correlations: two acoustically similar drone signatures in different locations within 2 seconds are incorrectly grouped into a single TDoA solve, producing a garbage position estimate.

#### 2.4.2 Trigger Conditions

- Meshtastic relay node with >500ms NATS forwarding latency
- NTP sync failure on any contributing node (clock drift >50ms)
- Burst of detections from multiple targets within 2 seconds
- Network congestion during high-threat scenario (many nodes reporting simultaneously)

#### 2.4.3 Mitigation

1. **Adaptive window**: TDoA service uses a two-stage window: primary 500ms (direct NATS nodes), extended 1500ms (Meshtastic relay nodes, identified by `tier: 3` in node metadata). Events from Tier-3 nodes are held in a secondary buffer for up to 1500ms before attempting correlation.
2. **Audio hash fingerprint matching**: The correlation key is not just time window but also `audio_hash` similarity. Events are only correlated if their audio hash matches (exact SHA-256 match for identical clips, or cosine similarity >0.95 for overlapping clips). This prevents time-proximate unrelated events from false-correlating.
3. **Clock skew compensation**: Each node reports its `ntp_offset_ms` in health payloads. TDoA service applies the NTP offset correction to `detected_at` timestamps before windowing. Nodes with reported offset >100ms are excluded from TDoA solves until their clock is corrected.
4. **Configurable window**: `TDOA_WINDOW_MS` is a runtime environment variable; operators can tune per-deployment based on observed network latency profile.
5. **Minimum 3-node requirement**: Require ≥3 correlated events for TDoA solve. Two-node correlations are insufficient to solve 2D position; they are logged as `status: active` without a position estimate.

---

### RISK-W2-05: Meshtastic Serial Bridge Disconnect Causing Silent Data Loss

**Risk ID:** RISK-W2-05
**Category:** Reliability / Data Loss
**FR Impact:** FR-W2-10
**Pre-Mitigation Probability:** H
**Pre-Mitigation Impact:** M
**Pre-Mitigation Score:** 6 (High)
**Post-Mitigation Probability:** L
**Post-Mitigation Impact:** L
**Post-Mitigation Score:** 1 (Negligible)
**Owner:** Embedded/Hardware Engineer
**Status:** OPEN

#### 2.5.1 Description

The Meshtastic serial bridge connects to the Meshtastic radio module via a USB serial port (`/dev/ttyUSB0` or `/dev/ttyACM0`). USB serial connections are fragile: cable movement, power fluctuation, or Android kernel USB resource reallocation can cause silent disconnects. "Silent" here means the Python `serial.Serial` object does not immediately raise an exception — it returns empty bytes until the OS drops the file descriptor, which can take 5–30 seconds.

During this silent window, the bridge continues to run, publishes nothing to NATS (no data, no error), and the `last_seen_at` on the Tier-3 node is not updated. The NATS stream shows no activity from that node. From the operator perspective, the node appears operational (process is running, systemd reports `active`) but is silently dropping all Meshtastic packets. This is the worst failure mode — it is not alarmed, not logged as an error, and detection coverage silently degrades.

#### 2.5.2 Trigger Conditions

- Physical USB cable disturbance
- USB power management putting port into low-power state
- Android kernel reclaiming USB device for other app
- Serial device path changes from `/dev/ttyUSB0` to `/dev/ttyACM0` after kernel event

#### 2.5.3 Mitigation

1. **Read timeout**: Set `serial.Serial(timeout=2.0)` — reads that return no data within 2s are treated as potential disconnects. After 3 consecutive empty reads (6s total), bridge enters reconnect mode.
2. **Serial port watchdog**: A separate thread in the bridge process reads a byte counter. If the counter has not incremented in 30s AND a POSITION_APP message was expected (based on Meshtastic's default 60s position broadcast interval), the bridge logs `WARNING: no Meshtastic packets in 30s` and publishes a `sentinel.health.{node_id}` event with `serial_active: false`.
3. **Heartbeat to NATS**: Bridge publishes a synthetic heartbeat to `sentinel.health.{node_id}` every 30s regardless of Meshtastic activity. This populates `node_health_log.audio_active = false` and keeps `last_seen_at` current. If heartbeat stops, the stale-node cron (FR-W2-06) detects it within 90s.
4. **Auto-detect serial path**: On reconnect, bridge re-scans for Meshtastic devices using `meshtastic.util.findPorts()` rather than hardcoding `/dev/ttyUSB0`. This handles kernel device path changes.
5. **USB power management disable**: `echo 'on' > /sys/bus/usb/devices/{device}/power/control` in systemd ExecStartPre to prevent USB auto-suspend.

---

### RISK-W2-06: GDPR — detection_events Table Storing PII-Adjacent Data

**Risk ID:** RISK-W2-06
**Category:** Compliance / Privacy
**FR Impact:** FR-W2-03, FR-W2-05, FR-W2-15
**Pre-Mitigation Probability:** H
**Pre-Mitigation Impact:** H
**Pre-Mitigation Score:** 9 (Critical)
**Post-Mitigation Probability:** L
**Post-Mitigation Impact:** M
**Post-Mitigation Score:** 3 (Low)
**Owner:** Nicolae Fratila (DPO)
**Status:** OPEN

#### 2.6.1 Description

The `detection_events` table stores coarsened geographic coordinates (`lat_coarse`, `lon_coarse` snapped to 0.001 degree ≈ 111m grid), `node_id` references, and `detected_at` timestamps. Under GDPR Article 4(1), "personal data" is any information relating to an identified or identifiable natural person. Drone operators are natural persons. A coarsened location paired with a timestamp and a drone classifier label could be argued to identify the operator's location at a specific time to within 111 metres.

The UK ICO's guidance on pseudonymisation states that location data coarsened to grid cells remains personal data if it can be linked to an identified individual through auxiliary information (e.g., public ADS-B data, witness accounts, flight plan submissions). The Supabase project is in eu-west-2 (London) — UK GDPR applies post-Brexit. Failure to comply carries fines up to £17.5m or 4% global turnover under UK GDPR Article 83(5).

The risk is that the current schema design does not implement: (1) explicit data retention limits, (2) data subject access request mechanism, (3) privacy notice for data subjects, (4) Article 30 ROPA entry for this processing activity.

#### 2.6.2 Trigger Conditions

- ICO audit or data subject access request
- Data breach (unauthorised access to `detection_events`)
- Challenge from civil liberties organisation
- Legal proceedings involving drone operator where APEX-SENTINEL data used as evidence

#### 2.6.3 Mitigation

1. **Coarsening confirmed**: `lat_coarse` / `lon_coarse` snap to 0.001 deg (≈111m). This is applied in the Edge Function before INSERT — raw coordinates never stored in Supabase.
2. **Retention policy**: A scheduled Postgres function `fn_purge_old_detections()` deletes `detection_events` rows older than 30 days. `lkgc_snapshots` purged after 90 days. Retention periods documented in PRIVACY_ARCHITECTURE.md.
3. **Article 30 ROPA**: Documented in `docs/legal/ROPA.md` (to be created). Processing activity: "Detection of unmanned aerial vehicles for public safety purposes." Lawful basis: Legitimate interests (ICO legitimate interests assessment required).
4. **No audio storage**: Raw audio segments are never stored in Supabase — only `audio_hash` (SHA-256). This prevents voice/conversation extraction.
5. **RLS restricts access**: Only `operator` role can query `detection_events`, and only for their `region_id`. See FR-W2-15.
6. **Encryption at rest**: Supabase eu-west-2 uses AES-256 encryption at rest. Confirmed in Supabase dashboard project settings.

#### 2.6.4 Residual Risk

The "legitimate interests" lawful basis has not yet been formally assessed (LIA required). Until the LIA is complete and approved by legal counsel, this remains an open compliance risk. **Action required before W2 goes to production**: commission LIA from legal counsel familiar with UK surveillance law.

---

### RISK-W2-07: mTLS Certificate Rotation Causing NATS Authentication Failures

**Risk ID:** RISK-W2-07
**Category:** Security / Operations
**FR Impact:** FR-W2-13
**Pre-Mitigation Probability:** M
**Pre-Mitigation Impact:** H
**Pre-Mitigation Score:** 6 (High)
**Post-Mitigation Probability:** L
**Post-Mitigation Impact:** L
**Post-Mitigation Score:** 1 (Negligible)
**Owner:** Security Engineer
**Status:** OPEN

#### 2.7.1 Description

Node client certificates have a 365-day validity period. Certificate rotation requires: (1) generating a new certificate on the Intermediate CA (fortress), (2) securely pushing the new cert and key to the remote node, (3) reloading the NATS client on the node to use the new cert, and (4) optionally revoking the old cert via CRL. If step (2) or (3) fails — e.g., Tailscale tunnel is down, node is offline, or the NATS client reload fails — the node continues to use the old cert. If the old cert has expired, the node is locked out of NATS and cannot publish detections.

The silent failure mode: if a node is offline during scheduled rotation (30 days before expiry), the rotation script marks the cert as "rotated" in the cert inventory but the node still has the old cert. The node comes back online with an about-to-expire cert. If it was offline for >30 days after scheduled rotation, it comes back with an expired cert and immediately loses NATS access.

#### 2.7.2 Mitigation

1. **30-day pre-expiry rotation window**: Rotation cron runs daily. Attempts rotation for all nodes with `expiry - now < 30 days`. For offline nodes, rotation is queued and retried hourly until 7 days before expiry.
2. **7-day hard warning**: At 7 days before expiry, fortress sends Telegram alert to operator with node ID and expiry date. Manual intervention escalation path documented.
3. **Graceful cert reload**: NATS client on node uses `tls.Config` with a `GetClientCertificate` callback that reads from disk on each TLS handshake. New cert on disk is used for the next connection attempt without service restart.
4. **CRL not used initially**: CRL distribution is complex and adds latency. Instead, cert inventory tracks active/revoked certs. Revocation in NATS is done by removing the cert's CN from the auth map and issuing a `nats server reload` command.
5. **Dual-cert window**: During rotation, both old and new client certs are accepted by NATS for a 24-hour overlap window (both CNs in auth map). This prevents lockout during transition.

---

### RISK-W2-08: Supabase Connection Pool Exhaustion Under Load

**Risk ID:** RISK-W2-08
**Category:** Performance / Availability
**FR Impact:** FR-W2-04, FR-W2-05, FR-W2-06, FR-W2-07
**Pre-Mitigation Probability:** M
**Pre-Mitigation Impact:** H
**Pre-Mitigation Score:** 6 (High)
**Post-Mitigation Probability:** L
**Post-Mitigation Impact:** M
**Post-Mitigation Score:** 3 (Low)
**Owner:** Backend Engineer
**Status:** OPEN

#### 2.8.1 Description

Supabase uses pgbouncer for connection pooling. The default transaction-mode pool has a configurable `pool_size` (default 15 connections per Edge Function instance on the free/pro tier). Under load, if multiple Edge Functions are concurrently processing NATS batch deliveries (e.g., ingest-event running 10 concurrent instances), each function opens its own Supabase client which claims a pgbouncer slot. At 10 concurrent instances × 1 connection each = 10 connections. At 100 concurrent instances (burst scenario) = 100 connections, exceeding the default pgbouncer pool.

When pgbouncer exhausts its pool, new connection attempts queue and eventually time out with `FATAL: no more connections allowed` or `connection timeout`. This causes ingest-event to fail, NATS messages to be unACKed, redelivery to accumulate, and a cascade of retries that worsen the pool exhaustion.

#### 2.8.2 Mitigation

1. **Connection string with pgbouncer**: All Edge Functions use the connection pooling URI (`?pgbouncer=true&connection_limit=1`) so each function instance claims at most 1 pgbouncer slot.
2. **Batch insert**: `ingest-event` processes up to 100 events per invocation in a single transaction, reducing connection time per event from O(N) to O(1).
3. **Supabase Pro plan**: The Pro plan provides a higher pgbouncer pool limit. Upgrade scheduled before W2 goes to production load testing.
4. **NATS consumer `max_ack_pending` throttle**: Limit NATS push consumer to 50 concurrent unACKed messages. This throttles concurrent Edge Function invocations to prevent burst pool exhaustion.
5. **Connection timeout instrumentation**: Edge Functions log `db_connect_ms` in every response. Alert if p99 > 100ms (early warning of pool pressure).

---

### RISK-W2-09: Alert Flood — Confirmed Track Triggering Repeated Telegram Notifications

**Risk ID:** RISK-W2-09
**Category:** Operational / User Experience
**FR Impact:** FR-W2-07, FR-W2-09
**Pre-Mitigation Probability:** H
**Pre-Mitigation Impact:** M
**Pre-Mitigation Score:** 6 (High)
**Post-Mitigation Probability:** L
**Post-Mitigation Impact:** L
**Post-Mitigation Score:** 1 (Negligible)
**Owner:** Backend Engineer
**Status:** OPEN

#### 2.9.1 Description

A confirmed drone track generates an alert when first confirmed. However, as the drone continues to fly and is continuously detected, the TDoA service generates updated position estimates every detection cycle (potentially every 5–10 seconds). If each position update triggers a new alert event, the Telegram channel will receive a notification every 5–10 seconds for the duration of the drone flight. A 10-minute drone incursion generates 60–120 Telegram messages, flooding the operator's notification channel and causing alert fatigue.

Additionally, when NATS delivers the initial alert with redelivery (before ACK), the alert-router may process the same alert twice before the Telegram dedup check can prevent it, because the database write of `telegram_msg_id` may not be visible to the second concurrent invocation (read-your-writes inconsistency in Supabase under concurrent requests).

#### 2.9.2 Mitigation

1. **Alert deduplication by track**: The `alert-router` checks `alerts` table for existing open alert with same `track_id` and severity. If found, it sends a position UPDATE message (edit of existing Telegram message via `editMessageText`) rather than a new message. New message only sent if severity escalates (e.g., `warning` → `critical`).
2. **Telegram `telegram_msg_id` dedup guard**: Uses `SELECT ... FOR UPDATE` on the alerts row before sending to prevent concurrent processing race.
3. **Alert suppression cooldown**: A cooldown per `track_id` of 60s minimum between new Telegram messages for the same track. Cooldown state stored in Supabase `kv` table.
4. **Alert escalation levels**: Alerts for a track are generated at key lifecycle events only: (1) first detection (status: warning), (2) multi-node confirmation (status: confirmed), (3) approach within 500m of protected area (status: critical), (4) track lost. Position updates are sent as silent Telegram message edits, not new messages.

---

### RISK-W2-10: FreeTAKServer CoT Relay — Invalid XML Crashing Relay Service

**Risk ID:** RISK-W2-10
**Category:** Reliability / Integration
**FR Impact:** FR-W2-11
**Pre-Mitigation Probability:** M
**Pre-Mitigation Impact:** M
**Pre-Mitigation Score:** 4 (Medium)
**Post-Mitigation Probability:** L
**Post-Mitigation Impact:** L
**Post-Mitigation Score:** 1 (Negligible)
**Owner:** Integration Engineer
**Status:** OPEN

#### 2.10.1 Description

The CoT relay generates XML events from track data and sends them to FreeTAKServer over TCP. If the generated XML is malformed (e.g., null coordinates producing `lat="None"`, encoding issues with non-ASCII classifier labels, or invalid timestamp format), FreeTAKServer may close the TCP connection or log an error. Some versions of FreeTAKServer crash the connection handler thread on malformed CoT, causing the relay service to receive a TCP RST and need to reconnect.

More critically: if the relay service itself does not validate the XML before sending and crashes with an unhandled exception (e.g., `TypeError: Cannot convert None to float`), the systemd unit will restart the process. During the restart window (5–10s), all alerts with `cot` channel are dropped or written to DLQ, causing gaps in the TAK picture.

#### 2.10.2 Mitigation

1. **XML validation before send**: All generated CoT XML is parsed by `xml.etree.ElementTree.fromstring()` before being written to the TCP socket. Parse failure → error logged to `alerts.payload.delivery_log`, message written to DLQ, relay continues.
2. **Null coordinate guard**: If `tracks.tdoa_solution` is null (no TDoA solve available), CoT event is not generated. Alert still delivered via Telegram and Realtime channels. CoT delivery skipped and logged.
3. **Non-ASCII sanitisation**: Classifier labels and remarks fields are sanitised to ASCII-safe characters before XML templating. Non-ASCII chars replaced with `?`.
4. **TCP connection isolation**: CoT relay uses a separate connection management module from the rest of alert-router. TCP errors do not propagate to Telegram or Realtime delivery.
5. **FreeTAKServer error response parsing**: Relay reads FreeTAKServer's response after each send. Any response containing `error` or empty TCP close triggers a reconnect and re-queue of the message.

---

### RISK-W2-11: Clock Skew Between Nodes Causing TDoA Timing Errors >50ms

**Risk ID:** RISK-W2-11
**Category:** Algorithm / Detection Quality
**FR Impact:** FR-W2-08
**Pre-Mitigation Probability:** H
**Pre-Mitigation Impact:** H
**Pre-Mitigation Score:** 9 (Critical)
**Post-Mitigation Probability:** M
**Post-Mitigation Impact:** M
**Post-Mitigation Score:** 4 (Medium)
**Owner:** Signal Processing Engineer
**Status:** OPEN

#### 2.11.1 Description

TDoA positioning accuracy depends critically on the synchronisation of timestamps across nodes. An acoustic TDoA measurement error of 1ms corresponds to a position error of 343mm at the measured TDOA differential. For positioning accuracy of ±50m (the APEX-SENTINEL P1 accuracy requirement), timestamps must be synchronised to within ±50m / 343 m/s ≈ ±146ms. This is achievable with NTP (typical accuracy 1–50ms over internet, <1ms on LAN). However:

1. **Meshtastic relay nodes (Tier 3)**: Android smartphones used as Meshtastic hosts have notoriously poor NTP discipline. Android's `AlarmManager` batches wake-locks and the NTP sync can be delayed by power management, resulting in clock drift of 100–500ms between NTP sync cycles (default 24 hours on Android).

2. **GPS timing mode**: Some nodes have GPS chipsets capable of 1ms synchronisation via PPS signal. But this is not guaranteed across all node tiers.

3. **Network asymmetry**: NTP assumes symmetric network paths. On Meshtastic LoRa relays, upload and download latency differ significantly (LoRa is half-duplex TDMA), causing NTP offset estimates to be systematically biased by 50–200ms.

A systematic 100ms clock bias on one Tier-3 node produces TDoA position errors of 34m (100ms × 343 m/s), which alone exceeds the 50m accuracy budget.

#### 2.11.2 Mitigation

1. **NTP hardening on Tier 1/2 nodes**: All Tier 1 and Tier 2 nodes run `chrony` with `makestep 0.1 3` configuration, enabling step correction for offsets >100ms. Monitoring via `chronyc tracking`; alert if `System time offset > 20ms`.
2. **Android NTP force-sync**: Tier-3 nodes running Android Meshtastic host app implement a periodic force-NTP-sync using the Android `TIME_SET` broadcast intent via ADB (for rooted devices) or by displaying a user prompt for manual time correction.
3. **GPS PPS preferred**: If the node has a GPS chipset, the bridge software uses GPS time as the authoritative clock source. GPS time is accurate to <1ms.
4. **TDoA residual analysis**: After LS solve, residuals are computed for each contributing node. Nodes with |residual| > 50ms are flagged as `clock_skew_warning: true` in `tracks.tdoa_solution` and excluded from subsequent solves until their time is corrected.
5. **Calibration mode**: A calibration routine is available where a known acoustic source (calibration transducer at a known location) is fired and TDoA errors are computed. Clock offsets are back-calculated and stored per node. These offsets are applied as corrections in future TDoA solves.

#### 2.11.3 Residual Risk

Android clock skew on Tier-3 nodes remains the most difficult to mitigate without root access or hardware GPS. Residual risk accepted: Tier-3 nodes contribute to detection (presence detection) but their timestamps are flagged with reduced confidence in TDoA solves. Position accuracy SLO is P0: ±100m for 2-node detections, ±50m for 3+ node TDoA solves from Tier 1/2 nodes only.

---

### RISK-W2-12: NATS JetStream Disk Full Causing Stream Write Failures

**Risk ID:** RISK-W2-12
**Category:** Infrastructure / Availability
**FR Impact:** FR-W2-01, FR-W2-02
**Pre-Mitigation Probability:** M
**Pre-Mitigation Impact:** H
**Pre-Mitigation Score:** 6 (High)
**Post-Mitigation Probability:** L
**Post-Mitigation Impact:** M
**Post-Mitigation Score:** 3 (Low)
**Owner:** Infrastructure Engineer
**Status:** OPEN

#### 2.12.1 Description

NATS JetStream streams are backed by file storage at `/var/lib/nats/jetstream/` with a 50GB limit per node. Under normal conditions, the DETECTIONS stream's retention policy (max 10M messages, 100GB aggregate) prevents unbounded growth. However, if the retention policy is misconfigured (e.g., `max_bytes` set too high) or if the TDoA service consumer stops ACKing (allowing messages to accumulate), the stream can grow to fill the partition.

When a JetStream stream reaches its storage limit, new publish attempts fail with error `-ERR 'storage is full'`. This causes the NATS client on sensor nodes to queue messages in memory, and if memory queue is full, new detections are dropped. The failure is silent from the operator's perspective unless monitoring is in place.

A secondary scenario: if `/var/lib/nats/` is on the same partition as the OS (`/`), disk full on the stream can cause the OS to fail to write logs, temp files, or systemd journal entries, potentially crashing the NATS server or other system services.

#### 2.12.2 Mitigation

1. **Dedicated partition**: `/var/lib/nats/jetstream/` is on a dedicated partition (separate block device or LVM volume) of exactly 55GB. OS partition is separate. A full JetStream store cannot affect OS stability.
2. **Retention policy enforcement**: DETECTIONS stream `max_bytes: 100GB` is enforced at the cluster level, not just per-node. When limit is reached, oldest messages are evicted (discard=old policy).
3. **80% full alert**: Prometheus `nats_server_varz` metrics are scraped from `:8222/varz`; alert fires when `jetstream.stats.storage.file` / `jetstream.limits.storage.file` > 0.80. Alert goes to Telegram operator channel.
4. **Consumer lag monitoring**: If TDoA service consumer lag exceeds 10,000 messages, a separate alert fires. This indicates the consumer has fallen behind and messages are accumulating.
5. **Emergency drain script**: `infra/nats/drain-stream.sh` can purge messages older than N hours from a specified stream without stopping the cluster. Documented in runbook.

---

### RISK-W2-13: Supabase Edge Function 150s Timeout on Heavy TDoA Batch Processing

**Risk ID:** RISK-W2-13
**Category:** Performance / Reliability
**FR Impact:** FR-W2-05, FR-W2-08
**Pre-Mitigation Probability:** M
**Pre-Mitigation Impact:** M
**Pre-Mitigation Score:** 4 (Medium)
**Post-Mitigation Probability:** L
**Post-Mitigation Impact:** L
**Post-Mitigation Score:** 1 (Negligible)
**Owner:** Backend Engineer
**Status:** OPEN

#### 2.13.1 Description

Supabase Edge Functions have a hard execution timeout of 150 seconds (Pro plan). The TDoA correlation service is implemented as a standalone Deno process on fortress (not an Edge Function), specifically because iterative LS optimisation can take 10–100ms per solve for complex multi-node scenarios. However, the `ingest-event` Edge Function triggers a Postgres function call `fn_associate_detection_to_track()` that performs preliminary track association. If this Postgres function is slow (e.g., full table scan due to missing index), the Edge Function wall-clock time increases and risks hitting the timeout.

Additionally, during a drone swarm event (multiple simultaneous threats), batch sizes may approach the 100-event cap, and the Postgres `INSERT ... ON CONFLICT ... DO NOTHING` bulk insert of 100 rows may take longer than expected under high DB load.

#### 2.13.2 Mitigation

1. **Index coverage**: All query patterns in `fn_associate_detection_to_track()` use indexed columns. The function scans `tracks WHERE status = 'active' AND last_seen_at > now() - interval '30 seconds'` — index on `(status, last_seen_at DESC)` ensures index scan, not seq scan.
2. **Function timeout budget**: `ingest-event` has an internal 5-second budget for the DB insert. If not completed in 5s, it returns partial success (however many rows were inserted) and re-queues remaining events.
3. **TDoA on fortress, not Edge Function**: The computationally intensive TDoA solve runs on fortress (Deno systemd service), not inside an Edge Function. Edge Function only handles INSERT and fires a NOTIFY to wake the TDoA service.

---

### RISK-W2-14: Operator Availability — Single Point of Failure for Certificate Authority

**Risk ID:** RISK-W2-14
**Category:** Operations / Business Continuity
**FR Impact:** FR-W2-13
**Pre-Mitigation Probability:** M
**Pre-Mitigation Impact:** H
**Pre-Mitigation Score:** 6 (High)
**Post-Mitigation Probability:** L
**Post-Mitigation Impact:** M
**Post-Mitigation Score:** 3 (Low)
**Owner:** Nicolae Fratila
**Status:** OPEN

#### 2.14.1 Description

The Intermediate CA that issues node client certificates is hosted on the fortress VM. If fortress becomes unavailable (VM stop, data loss, corruption), no new node client certificates can be issued and certificate rotation cannot proceed. Existing nodes continue to operate until their certs expire (maximum 365 days from last issue), but new node onboarding is blocked and any cert that expires during the fortress outage cannot be renewed.

The Root CA key is stored offline (encrypted USB). If the Root CA USB is lost or damaged, the entire PKI chain must be rebuilt from scratch, and all existing node client certs become invalid.

#### 2.14.2 Mitigation

1. **Fortress backup**: Intermediate CA private key (`/etc/pki/sentinel/intermediate-ca.key`) is encrypted with GPG (AES-256) and backed up to Azure Blob Storage daily. Restoration documented in `docs/runbooks/pki-restore.md`.
2. **Root CA USB redundancy**: Two copies of the Root CA key on separate encrypted USB drives stored in geographically separate physical locations.
3. **Long cert validity**: 365-day cert validity provides a 365-day window to restore the CA before any certs expire. For W2, all certs are issued on the same day, so they expire on the same day — staggered re-issue after restoration.
4. **Emergency self-signed fallback**: For test environments only, NATS can be configured to accept self-signed certs as a temporary measure while CA is being restored. NOT for production use.

---

### RISK-W2-15: Supabase Realtime Rate Limits Under Swarm Alert Scenario

**Risk ID:** RISK-W2-15
**Category:** Performance / Scalability
**FR Impact:** FR-W2-12
**Pre-Mitigation Probability:** L
**Pre-Mitigation Impact:** M
**Pre-Mitigation Score:** 3 (Low)
**Post-Mitigation Probability:** L
**Post-Mitigation Impact:** L
**Post-Mitigation Score:** 1 (Negligible)
**Owner:** Backend Engineer
**Status:** OPEN

#### 2.15.1 Description

Supabase Realtime Broadcast has rate limits of 200 messages/second per channel (Pro plan) and 10MB/s bandwidth per project. In a swarm scenario with 10 simultaneous tracked targets, each generating track updates every 5 seconds, the broadcast rate is 10 × 0.2 = 2 messages/second — well within limits. However, if 50 operator dashboard clients are all subscribed to `sentinel:alerts` and each receives 10 concurrent track updates at 2KB per update, the bandwidth is 50 × 10 × 2KB = 1MB/message cycle — close to the 10MB/s limit.

#### 2.15.2 Mitigation

1. **Message payload minimisation**: Realtime broadcast payloads contain only the alert summary and track position (not full detection_events array). Payload capped at 1KB per message.
2. **Channel sharding**: If operator count exceeds 20, track update channels are sharded by region: `sentinel:tracks:london-central`, `sentinel:tracks:london-east`. Each operator subscribes only to their region channel.

---

## 3. Risk Heat Map

```
                    IMPACT
                L           M           H
             ┌───────────┬───────────┬───────────┐
           H │  W2-05    │  W2-03    │  W2-01    │
PROBABILITY  │  W2-09    │  W2-04    │  W2-06    │
             │           │           │  W2-11    │
             ├───────────┼───────────┼───────────┤
           M │  W2-02*   │  W2-08    │  W2-07    │
             │  W2-13*   │  W2-13    │  W2-12    │
             │  W2-15*   │           │  W2-14    │
             ├───────────┼───────────┼───────────┤
           L │           │           │           │
             │           │           │           │
             └───────────┴───────────┴───────────┘

* = post-mitigation residual position
```

---

## 4. Summary Table

| ID | Title | Prob | Impact | Score | Status | FR |
|----|-------|------|--------|-------|--------|----|
| RISK-W2-01 | NATS Raft Split-Brain | H | H | 9 | OPEN | FR-W2-01 |
| RISK-W2-02 | NATS Dedup Failure | H | M | 6 | OPEN | FR-W2-02, FR-W2-05 |
| RISK-W2-03 | Edge Function Cold Start | H | M | 6 | OPEN | FR-W2-04–07 |
| RISK-W2-04 | TDoA Window Too Tight | H | H | 9 | OPEN | FR-W2-08 |
| RISK-W2-05 | Meshtastic Silent Data Loss | H | M | 6 | OPEN | FR-W2-10 |
| RISK-W2-06 | GDPR PII-Adjacent Data | H | H | 9 | OPEN | FR-W2-03, FR-W2-15 |
| RISK-W2-07 | mTLS Cert Rotation Failure | M | H | 6 | OPEN | FR-W2-13 |
| RISK-W2-08 | Supabase Pool Exhaustion | M | H | 6 | OPEN | FR-W2-04–07 |
| RISK-W2-09 | Alert Flood / Telegram Spam | H | M | 6 | OPEN | FR-W2-07, FR-W2-09 |
| RISK-W2-10 | CoT Invalid XML Crash | M | M | 4 | OPEN | FR-W2-11 |
| RISK-W2-11 | Clock Skew >50ms | H | H | 9 | OPEN | FR-W2-08 |
| RISK-W2-12 | JetStream Disk Full | M | H | 6 | OPEN | FR-W2-01, FR-W2-02 |
| RISK-W2-13 | Edge Function Timeout | M | M | 4 | OPEN | FR-W2-05, FR-W2-08 |
| RISK-W2-14 | CA Single Point of Failure | M | H | 6 | OPEN | FR-W2-13 |
| RISK-W2-15 | Realtime Rate Limits | L | M | 3 | OPEN | FR-W2-12 |

**Critical (Score 9):** RISK-W2-01, RISK-W2-04, RISK-W2-06, RISK-W2-11 — require immediate mitigation before W2 execution begins.

---

## 5. Risk Review Log

| Date | Reviewer | Action |
|------|---------|--------|
| 2026-03-24 | Nicolae Fratila | Initial register created; all risks OPEN |

*Next review: W2 Day 1 standup*
