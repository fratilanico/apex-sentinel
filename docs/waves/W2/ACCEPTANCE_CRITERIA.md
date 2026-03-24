# APEX-SENTINEL — Acceptance Criteria
## W2 | PROJECTAPEX Doc 10/21 | 2026-03-24

---

## 1. Overview

This document defines measurable acceptance criteria for all W2 functional requirements. Each criterion includes a verification method and a pass threshold. No FR is accepted on description alone — every criterion requires a demonstrable test or observable system state.

FR numbering follows the PRD. W2 covers FR-09 through FR-13, FR-15, FR-17 (data pipeline only), and FR-20.

---

## 2. FR-09 — Meshtastic LoRa Mesh Relay

**Description:** Tier-4 smartphone nodes relay Gate 3 detection events via Meshtastic LoRa radio to bridge nodes with NATS connectivity, enabling mesh-based forwarding when direct internet is unavailable.

### AC-09-01: LoRa Event Delivery Latency
- **Criterion:** A Gate 3 event broadcast by a Tier-4 node via LoRa is received by the NATS bridge and published to `SENTINEL_MESH_RELAY` within **3 seconds** of transmission under EU 868MHz LongFast channel conditions.
- **Measurement:** Timestamp comparison between Meshtastic TX log and NATS `ingest` timestamp on received message. p95 over 20 test transmissions.
- **Pass:** p95 ≤ 3000ms, 0 dropped events over 20-event test sequence.

### AC-09-02: Offline Queue and Replay
- **Criterion:** When the NATS bridge is unreachable, the Tier-4 Android node queues events in Room SQLite and replays all queued events within **30 seconds** of reconnection, with no data loss.
- **Measurement:** Disconnect bridge; fire 5 events from Tier-4 node; reconnect bridge; count events in Supabase `detection_events` table within 30s. `mesh_relay: true` flag must be set on all 5.
- **Pass:** All 5 events present in Supabase with `mesh_relay: true` within 30s. Zero events lost.

### AC-09-03: Channel Encryption
- **Criterion:** All LoRa mesh messages are encrypted with a node-specific AES-256 pre-shared key distributed via the `register-node` enrollment response. An unregistered node cannot decode mesh traffic.
- **Measurement:** Packet capture on 868MHz with unregistered Meshtastic device; attempt to decode payload; must fail with decrypt error. Registered node decodes correctly.
- **Pass:** Unregistered node produces decrypt error on 10/10 captured packets. Registered node decodes 10/10.

### AC-09-04: Frequency Plan Compliance
- **Criterion:** LoRa transmissions conform to EU 868MHz duty cycle (1% per sub-band) and the configured channel plan (channel 0: LongFast 250kHz BW, SF11, CR4/5; channel 1: MedFast 250kHz BW, SF9, CR4/5 for high-priority Gate 3).
- **Measurement:** RF spectrum analyser capture; firmware channel config read from enrolled device via `register-node` response echo.
- **Pass:** Duty cycle < 1% per sub-band over 1-hour test window. Firmware version ≥ 2.3.0 confirmed in enrollment.

### AC-09-05: Multi-Hop Relay
- **Criterion:** A Gate 3 event relayed through exactly 2 intermediate mesh hops reaches the NATS bridge intact (no payload corruption, hop count ≤ 3 in Meshtastic header).
- **Measurement:** Deploy 3 mesh nodes with only middle node in range of both source and bridge. Fire event. Verify arrival with hop_count = 2 in bridge log.
- **Pass:** Event arrives at NATS bridge; hop_count field = 2; payload hash matches original.

### AC-09-06: Throughput Under Load
- **Criterion:** The mesh bridge processes at least **10 events/second** from LoRa relay without NATS back-pressure or message loss.
- **Measurement:** Inject 100 synthetic events at 10 events/s via MQTT (simulating mesh bridge input); all 100 must reach NATS SENTINEL_MESH_RELAY stream.
- **Pass:** 100/100 events in stream; no NATS 429 or publish errors in bridge logs.

---

## 3. FR-10 — Google Nearby BLE Mesh

**Description:** Tier-4 devices use Google Nearby Connections API for BLE-based peer-to-peer relay when LoRa is unavailable or the Meshtastic radio hardware is absent.

### AC-10-01: Discovery Latency
- **Criterion:** A Tier-4 Android device advertising via Nearby Connections is discovered by another Tier-4 device within **5 seconds** on the same physical space with BLE enabled.
- **Measurement:** Automated test on two Android devices (or emulators with BLE simulation); `onEndpointDiscovered` callback timing logged.
- **Pass:** Discovery in ≤ 5s on 10/10 trials in controlled environment (open space, <10m separation).

### AC-10-02: Event Relay via BLE
- **Criterion:** A Gate 3 detection event relayed from one Tier-4 device to another via Nearby BLE reaches the second device's local queue and is subsequently uploaded to Supabase upon internet reconnection.
- **Measurement:** Device A has internet; Device B fires event offline; Device B connects to Device A via BLE; Device A uploads; event appears in Supabase with `ble_relay: true`.
- **Pass:** Event in Supabase with `ble_relay: true` within 60s of BLE connection establishment.

### AC-10-03: Payload Size Limit
- **Criterion:** BLE relay payload for a Gate 3 event is ≤ **512 bytes** (Nearby Connections P2P payload limit for reliable transfer without chunking).
- **Measurement:** Serialize a maximal Gate 3 event (all fields populated); measure byte length of serialized form.
- **Pass:** Serialized size ≤ 512 bytes for all valid Gate 3 event shapes.

### AC-10-04: No Raw Audio Over BLE
- **Criterion:** BLE relay payloads contain zero bytes of raw audio data. Only metadata (gate, confidence, geo_sector, timestamp_us, audio_hash) is transmitted.
- **Measurement:** Capture BLE payload; search for WAV/MP3 magic bytes; attempt to decode as audio; verify `audio_hash` present but raw PCM absent.
- **Pass:** 0/10 payloads contain decodable audio. `audio_hash` present in 10/10.

### AC-10-05: BLE Fallback Activation
- **Criterion:** When LoRa is unavailable (bridge unreachable for > 15s), the node automatically activates BLE relay mode without user intervention.
- **Measurement:** Disable LoRa bridge; measure time from NATS unreachable to first BLE advertisement in Nearby Connections log.
- **Pass:** BLE relay active within 20s of LoRa bridge unavailability. User prompt: none.

---

## 4. FR-11 — Node Registration and Discovery (with NATS Integration)

**Description:** Nodes enroll via the `register-node` Edge Function, receive JWT + NATS credentials, and publish to NATS with subject-scoped permissions. Discovery queries return live fleet state.

### AC-11-01: Enrollment Latency
- **Criterion:** The full enrollment round-trip — HTTP POST to `register-node`, Supabase insert, NATS cred generation, JWT issue, HTTP response — completes within **2 seconds** at p95.
- **Measurement:** 50 sequential enrollment calls from a UK network endpoint; p95 latency measured client-side.
- **Pass:** p95 ≤ 2000ms. No HTTP 5xx responses.

### AC-11-02: Credential Scope Enforcement
- **Criterion:** Issued NATS credentials allow a node to publish only to `sentinel.node.{node_id}.>` and subscribe only to `sentinel.node.{node_id}.cmd.>`. Publishing to another node's subject returns NATS permission denied error.
- **Measurement:** Attempt to publish from `test-node-001` to `sentinel.node.test-node-002.event` using creds issued for `test-node-001`.
- **Pass:** NATS returns `-ERR 'Permissions Violation for Publish to sentinel.node.test-node-002.event'`.

### AC-11-03: Re-enrollment Idempotency
- **Criterion:** Enrolling the same `node_id` twice updates the existing record and does not create a duplicate row. The returned JWT is fresh (new expiry).
- **Measurement:** POST register-node twice with identical node_id; `SELECT count(*) FROM nodes WHERE node_id = 'test-001'` must return 1.
- **Pass:** count = 1. Second JWT has `iat` > first JWT `iat`.

### AC-11-04: Discovery API Response Time
- **Criterion:** A GET to `node-health` Edge Function returning all enrolled nodes (fleet size ≤ 500) responds within **500ms**.
- **Measurement:** Pre-populate 500 test nodes; time GET `/functions/v1/node-health` response.
- **Pass:** Response time ≤ 500ms. Response body contains all 500 nodes with `node_id`, `tier`, `lat`, `lon`, `status`, `last_seen`.

### AC-11-05: Audit Log Completeness
- **Criterion:** Every enrollment attempt (success and failure) writes a row to `audit_log` with fields: `entity_id` (node_id), `action` ("REGISTER"), `actor_ip`, `outcome` ("SUCCESS"|"FAILURE"), `reason` (null or error string), `ts`.
- **Measurement:** Send 10 valid + 5 invalid enrollment requests; query `audit_log` for last 15 entries.
- **Pass:** 15 rows present. 10 with `outcome=SUCCESS`, 5 with `outcome=FAILURE` and non-null `reason`.

### AC-11-06: Node Tier Validation
- **Criterion:** Only tier values 0, 1, 2, and 4 are accepted. Tier 3 is reserved and must return HTTP 422 with error `tier_3_reserved`.
- **Measurement:** POST with `tier: 3`. POST with `tier: 5`. POST with `tier: "x"`.
- **Pass:** All three return HTTP 422. Error codes match `tier_3_reserved`, `tier_invalid`, `tier_type_error` respectively.

---

## 5. FR-12 — Offline Detection Queue

**Description:** Android nodes persist Gate 3 detection events in Room SQLite when NATS/internet is unavailable, and flush the queue on reconnection without duplicating events.

### AC-12-01: Queue Persistence Across App Restart
- **Criterion:** Queued events survive application process kill and device restart. Events are present in Room DB after cold start.
- **Measurement:** Queue 3 events; force-stop app; relaunch; count queued events in Room DB via debug API.
- **Pass:** 3 events in Room DB after restart. None lost.

### AC-12-02: Sync Within 30 Seconds
- **Criterion:** All queued events are uploaded to Supabase within **30 seconds** of internet connectivity being restored.
- **Measurement:** Queue 10 events offline; restore connectivity; time from restoration to all 10 events confirmed in Supabase.
- **Pass:** All 10 events in Supabase within 30s. `created_at` matches original queueing time (not retry time).

### AC-12-03: No Duplicate Events on Replay
- **Criterion:** Events replayed from the offline queue are deduplicated by `(node_id, timestamp_us, gate)`. A network error mid-upload that causes a retry does not create duplicate rows.
- **Measurement:** Simulate HTTP 500 on first upload attempt; verify second attempt succeeds; `SELECT count(*) FROM detection_events` returns 1 for that event.
- **Pass:** count = 1. No duplicate rows. `created_at` not modified on retry.

### AC-12-04: Queue Size Limit
- **Criterion:** Queue is bounded at **1000 events** (oldest evicted on overflow, with overflow metric incremented). Evicted events are logged to a separate `eviction_log` table with reason `queue_overflow`.
- **Measurement:** Queue 1010 events while offline; count Room DB rows (must be ≤ 1000); verify eviction_log has ≥ 10 entries.
- **Pass:** Room DB ≤ 1000 rows. eviction_log ≥ 10 rows with `reason=queue_overflow`.

### AC-12-05: Upload Priority Ordering
- **Criterion:** On reconnection, Gate 3 events are uploaded before Gate 1/2 events regardless of queueing order.
- **Measurement:** Queue mixed gates [G1, G3, G2, G3, G1] while offline; monitor upload order on reconnection.
- **Pass:** Both G3 events uploaded first (positions 1 and 2 in upload stream).

---

## 6. FR-13 — Supabase Realtime Event Stream Subscription

**Description:** Authorised clients (C2 dashboard, alert router) subscribe to `detection_events` and `alerts` tables via Supabase Realtime WebSocket and receive new rows within 500ms of insert.

### AC-13-01: Realtime Delivery Latency
- **Criterion:** A row inserted into `detection_events` is delivered to an active Realtime subscriber within **500ms** at p95.
- **Measurement:** Subscriber latches to Supabase Realtime channel; publisher inserts row; measure time from INSERT to subscriber `on('INSERT')` callback.
- **Pass:** p95 ≤ 500ms over 50 test inserts.

### AC-13-02: RLS-Gated Subscription
- **Criterion:** An anon-role subscriber does not receive rows where `privacy_level = 'restricted'`. Only service-role subscribers receive all rows.
- **Measurement:** Insert 5 rows with `privacy_level = 'restricted'`; anon subscriber must receive 0; service-role subscriber must receive 5.
- **Pass:** Anon subscriber: 0 restricted rows. Service subscriber: 5 restricted rows. Both within 2s of insert.

### AC-13-03: Reconnection and Replay
- **Criterion:** A Realtime subscriber that disconnects and reconnects within 60s receives all events missed during the disconnect window (via Supabase Realtime catchup).
- **Measurement:** Disconnect subscriber; insert 5 rows; reconnect within 30s; verify all 5 rows received after reconnect.
- **Pass:** 5 rows received within 5s of reconnect.

### AC-13-04: Subscription Throughput
- **Criterion:** Realtime subscription remains stable under a burst of **50 inserts/second** for 10 seconds without subscriber disconnect or message loss.
- **Measurement:** Batch-insert 500 rows at 50/s; count Realtime events received by subscriber.
- **Pass:** 500/500 events received. No WebSocket disconnect. Subscriber lag < 2s at end of burst.

### AC-13-05: Alert Channel Subscription
- **Criterion:** The `alerts` table Realtime channel delivers `THREAT_DETECTED` alert rows to the C2 dashboard subscriber within 1 second of the alert-router writing the row.
- **Measurement:** alert-router integration test publishes Gate 3 event; wait for alert row in `alerts` table; measure time from row insert to Realtime delivery.
- **Pass:** p95 ≤ 1000ms. Alert row contains `threat_type`, `confidence`, `lat`, `lon`, `geo_sector`, `source_events[]`.

---

## 7. FR-15 — GPS Timestamp Synchronisation for TDoA

**Description:** Nodes equipped with GPS-PPS hardware achieve ±1μs timing accuracy (weight 1.0) for TDoA. Phone nodes without GPS-PPS achieve ±50ms accuracy (weight 0.3). TDoA correlator weights nodes by timing tier.

### AC-15-01: GPS-PPS Timestamp Accuracy
- **Criterion:** Tier-1 nodes (GPS-PPS hardware) report `time_precision_us = 1` and `timing_weight = 1.0` in their event payloads. Timestamp error vs UTC does not exceed **±2μs** under nominal PPS lock.
- **Measurement:** Compare Tier-1 node timestamp_us to GPS time server (NTP + PPS reference) over 100 events. RMS error calculated.
- **Pass:** RMS error ≤ 2μs. 100/100 events have `timing_weight = 1.0`.

### AC-15-02: Phone Node Timing Weight
- **Criterion:** Tier-4 smartphone nodes report `time_precision_us = 50000` (±50ms) and `timing_weight = 0.3` in event payloads. The TDoA correlator assigns weight 0.3 to these nodes in the Newton-Raphson cost function.
- **Measurement:** Publish 3-node TDoA event with 2 Tier-1 nodes + 1 Tier-4 node; inspect correlator log for weight assignment.
- **Pass:** Tier-4 node weight = 0.3 in correlator log. Result uses mixed-weight cost function (not discarding Tier-4).

### AC-15-03: TDoA Eligibility Gate
- **Criterion:** An event is marked `tdoa_eligible: true` only when `timing_weight > 0` AND `time_precision_us ≤ 60000`. Events from nodes with `time_precision_us > 60000` are not submitted to TDoA windows.
- **Measurement:** POST event with `time_precision_us = 100000` from `ingest-event`; verify `tdoa_eligible = false` in DB and no publish to `SENTINEL_TDOA_WINDOWS`.
- **Pass:** DB row has `tdoa_eligible = false`. NATS `SENTINEL_TDOA_WINDOWS` stream has 0 messages for that event.

### AC-15-04: PPS Lock Loss Handling
- **Criterion:** If a Tier-1 node loses GPS-PPS lock, it automatically downgrades its timing weight to 0.5 (NTP-only mode) and sets `time_precision_us = 10000`. The correlator accepts the downgraded weight without reconfiguration.
- **Measurement:** Simulate PPS lock loss by setting `pps_locked = false` in node firmware; verify next event payload has `timing_weight = 0.5`, `time_precision_us = 10000`.
- **Pass:** Payload fields match expected values within 1 heartbeat cycle (60s).

### AC-15-05: 3-Node TDoA Accuracy
- **Criterion:** With ≥3 Tier-1 nodes (GPS-PPS, weight 1.0) and a target within 500m of the triangle formed by the nodes, Newton-Raphson converges to a position within **±62m** of ground truth.
- **Measurement:** 3-node synthetic TDoA test from `tests/fixtures/3-node-tdoa-scenario.json`. Haversine distance between result and ground_truth.
- **Pass:** distance ≤ 62m. Converged in ≤ 8 Newton-Raphson iterations. `method = "tdoa"` in result.

### AC-15-06: Timestamp Coarsening for Privacy
- **Criterion:** timestamp_us values stored in Supabase `detection_events` are coarsened to the nearest **100μs** for anon-role queries (privacy layer). Service-role queries see full precision.
- **Measurement:** Insert event with `timestamp_us = 1711234567000123`; anon query returns `1711234567000100`; service-role query returns `1711234567000123`.
- **Pass:** Anon result: `...000100`. Service result: `...000123`.

---

## 8. FR-17 — CesiumJS 3D Threat Map Data Pipeline (W2 Data Layer Only)

**Description:** W2 delivers the data pipeline feeding the CesiumJS 3D map (W3 delivers the UI). This includes structured track records, geo-coarsened threat positions, and Realtime subscriptions for live track updates.

### AC-17-01: Track Record Schema Completeness
- **Criterion:** Every resolved track written to the `tracks` table contains: `track_id`, `lat` (±50m coarsened), `lon` (±50m coarsened), `alt`, `accuracy_m`, `method` (tdoa|centroid), `confidence`, `source_events[]`, `created_at`, `updated_at`, `status` (ACTIVE|CLOSED).
- **Measurement:** Insert a track via TDoA correlator result pipeline; SELECT all columns; verify no null fields except `accuracy_m` for centroid results.
- **Pass:** All required fields non-null (excluding centroid `accuracy_m`). Schema matches W3 CesiumJS entity contract.

### AC-17-02: Geo-Coarsening Applied
- **Criterion:** Track `lat`/`lon` stored for non-service-role consumers is coarsened to ±50m (PostgreSQL function `coarsen_geo(lat, lon, precision_m := 50)`). Raw precision is stored in a service-role-only column `lat_exact`, `lon_exact`.
- **Measurement:** Insert track at lat=51.507400, lon=-0.127800; anon SELECT returns coarsened value differing by no more than 0.00045° from exact; service SELECT returns exact.
- **Pass:** anon_lat differs from exact_lat by ≤ 0.00045° (≈50m). service_lat = exact_lat.

### AC-17-03: Realtime Track Stream
- **Criterion:** A W3-compatible Realtime subscriber on `tracks` table receives new track inserts and ACTIVE→CLOSED status updates within 500ms.
- **Measurement:** Subscribe to `tracks` Realtime channel; insert track; update status to CLOSED; measure delivery times.
- **Pass:** INSERT delivery p95 ≤ 500ms. UPDATE delivery p95 ≤ 500ms.

### AC-17-04: Track Aggregation from Multiple TDoA Windows
- **Criterion:** When 3 consecutive TDoA windows within 5 seconds resolve to positions within 200m of each other, the Track Manager merges them into a single track with status ACTIVE rather than creating 3 separate tracks.
- **Measurement:** Publish 3 TDoA window results at t=0, t+1s, t+2s for same geo_sector; query `tracks` table.
- **Pass:** 1 track row with status ACTIVE. `source_events` array has 3 entries. `updated_at` reflects last window.

### AC-17-05: CesiumJS Entity Schema Compatibility
- **Criterion:** The `/functions/v1/tracks` API endpoint returns a JSON array of track entities in W3 CesiumJS-compatible format (defined in API_SPECIFICATION.md §4.3).
- **Measurement:** GET `/functions/v1/tracks?status=ACTIVE`; validate response against the CesiumJS entity schema (JSONSchema in `docs/waves/W2/API_SPECIFICATION.md`).
- **Pass:** JSON schema validation passes for all returned entities. No extra fields that would break CesiumJS entity constructor.

---

## 9. FR-20 — Telegram Alert Bot Integration

**Description:** The alert-router service sends structured Telegram messages to designated operational channels when Gate 3 detections, node OFFLINE transitions, and system health alerts occur.

### AC-20-01: Gate 3 Alert Delivery Time
- **Criterion:** A Gate 3 detection event (confidence ≥ 0.85) triggers a Telegram message to the ops channel within **10 seconds** of the detection event being written to Supabase.
- **Measurement:** Post Gate 3 event; timestamp Supabase insert; wait for Telegram API webhook receipt; compare timestamps.
- **Pass:** p95 ≤ 10s. Message contains: event_id, geo_sector, confidence, lat (coarsened), lon (coarsened), timestamp.

### AC-20-02: Alert Message Format
- **Criterion:** All Telegram alert messages use box-drawing characters for structured data (no pipe-table format). Alert contains: threat type, confidence %, location (geo_sector + coarsened coordinates), node count, TDoA accuracy if available, timestamp UTC.
- **Measurement:** Capture last 5 Telegram messages in test channel; parse format; verify no `|` table characters used.
- **Pass:** 0/5 messages contain pipe-table format. All contain required fields.

### AC-20-03: Node OFFLINE Alert
- **Criterion:** When a node transitions to OFFLINE status (heartbeat gap > 300s), a Telegram alert is sent to the ops channel within **10 seconds** of the status transition.
- **Measurement:** Set node last_seen to now - 310s; trigger heartbeat check; measure time to Telegram message.
- **Pass:** Alert received within 10s. Contains: node_id, tier, last known lat/lon, time since last heartbeat.

### AC-20-04: Alert Deduplication
- **Criterion:** The same alert (same event_id or same node OFFLINE transition) is not sent to Telegram more than once within a **5-minute** deduplication window.
- **Measurement:** Publish the same Gate 3 event_id twice within 60s; count Telegram messages received.
- **Pass:** Exactly 1 Telegram message. Dedup cache entry confirmed in alert-router log.

### AC-20-05: Confidential Coordinate Masking
- **Criterion:** Telegram alert messages containing location data display only coarsened coordinates (±50m). Exact GPS coordinates are never sent to Telegram.
- **Measurement:** Fire Gate 3 event with exact coordinates; receive Telegram message; compare lat/lon in message vs exact stored in DB.
- **Pass:** Message lat/lon differs from exact by ≤ 0.00045° (≈50m). Never equal to exact value.

### AC-20-06: Alert Routing by Severity
- **Criterion:** Gate 3 detections route to `#sentinel-alerts` channel; node OFFLINE alerts route to `#sentinel-ops`; system health alerts (NATS cluster degraded, Supabase connection loss) route to `#sentinel-system`. No cross-channel leakage.
- **Measurement:** Fire one of each alert type; verify destination channel for each.
- **Pass:** 3 messages in 3 different channels. 0 messages in wrong channel.

---

## 10. Acceptance Sign-Off Matrix

| FR | Owner | TDD RED Commit | GREEN Commit | AC Verified | Signed Off |
|----|-------|---------------|-------------|-------------|-----------|
| FR-09 | TBD | [ ] | [ ] | [ ] | [ ] |
| FR-10 | TBD | [ ] | [ ] | [ ] | [ ] |
| FR-11 | TBD | [ ] | [ ] | [ ] | [ ] |
| FR-12 | TBD | [ ] | [ ] | [ ] | [ ] |
| FR-13 | TBD | [ ] | [ ] | [ ] | [ ] |
| FR-15 | TBD | [ ] | [ ] | [ ] | [ ] |
| FR-17 | TBD | [ ] | [ ] | [ ] | [ ] |
| FR-20 | TBD | [ ] | [ ] | [ ] | [ ] |

Sign-off requires: all ACs verified with automated test OR documented manual test run with pass evidence. No partial sign-off accepted. All 8 FRs must be SIGNED OFF before M2.8 milestone closes.
