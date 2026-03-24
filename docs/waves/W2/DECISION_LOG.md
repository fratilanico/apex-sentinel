# APEX-SENTINEL — Decision Log
## W2 | PROJECTAPEX Doc 11/21 | 2026-03-24

---

## Format

Each ADR follows: Status · Context · Decision · Consequences · Alternatives Considered.

Status values: PROPOSED | ACCEPTED | SUPERSEDED | DEPRECATED

---

## ADR-W2-01 — NATS JetStream vs Kafka for Backbone

**Status:** ACCEPTED
**Date:** 2026-03-24
**Decider:** Nico / APEX-SENTINEL architecture session

### Context
The backbone message broker must handle: high-throughput Gate 3 event ingestion (~1000 events/s peak), TDoA window aggregation requiring sub-second delivery, node command-and-control, and mesh relay buffering. Two candidates evaluated: NATS JetStream and Apache Kafka.

### Decision
NATS JetStream.

### Rationale
- **Operational weight:** NATS 5-node cluster runs in ~50MB RAM per node vs Kafka requiring ZooKeeper or KRaft + per-partition memory overhead. APEX-SENTINEL targets edge VM hosting where RAM is constrained.
- **Latency:** NATS p99 publish latency is 1–3ms on LAN vs Kafka's typical 5–15ms due to batching optimisation. TDoA 500ms window requires minimal publish jitter.
- **Subject-based routing:** NATS subjects natively map to `sentinel.gate3.detection.{geo_sector}` fan-out without topic proliferation. Kafka would require one topic per geo_sector or a consumer-side filter.
- **mTLS simplicity:** NATS operator model (operator → account → user) maps cleanly to node-scoped credentials. Kafka ACLs require separate ACL management layer.
- **JetStream Raft:** Built-in Raft consensus without external dependencies. Kafka KRaft is newer and less battle-tested at W2 time.

### Consequences
- NATS JetStream is the single backbone — no secondary broker.
- All services must use `nats.js` (Node) or `nats` (Go/Python) client library.
- Dead-letter queue implemented as a JetStream stream (`SENTINEL_DLQ`) not a Kafka dead-letter topic.
- NATS exporter required for Prometheus metrics (no Kafka-native metrics format).
- Team must be familiar with JetStream Raft bootstrap procedure (see DEPLOY_CHECKLIST.md).

### Alternatives Considered
- **Kafka KRaft:** Rejected — higher operational overhead, topic-per-sector proliferation, slower publish latency.
- **Redis Streams:** Rejected — no built-in replication without Redis Cluster complexity; no native consumer group Raft; not designed for N+2 redundancy.
- **MQTT (Eclipse Mosquitto):** Rejected — MQTT QoS 2 has no durable stream semantics needed for TDoA windowing; no JetStream-equivalent.
- **Managed NATS (Synadia Cloud):** Deferred to post-W2. Self-hosted for W2 to avoid external dependency during development.

---

## ADR-W2-02 — Supabase Edge Functions vs Dedicated Node.js API

**Status:** ACCEPTED
**Date:** 2026-03-24
**Decider:** Nico

### Context
W2 requires four API endpoints: `register-node`, `ingest-event`, `node-health`, `alert-router`. These could be implemented as Deno Supabase Edge Functions or as a dedicated Node.js API server (e.g., Fastify) deployed on a separate VM.

### Decision
Supabase Edge Functions (Deno) for all four endpoints.

### Rationale
- **Zero-ops deployment:** Edge Functions deploy via `supabase functions deploy` with zero infrastructure management. No VM, no systemd, no reverse proxy needed for the API layer.
- **Colocation with data:** Edge Functions run in the same region as the Supabase Postgres instance (eu-west-2). No cross-region latency for DB writes.
- **Postgres access:** Direct `supabase-js` client with service key. No connection pool management required at W2 scale.
- **Scalability:** Edge Functions auto-scale; no capacity planning for ingest spikes during active deployments.
- **JWT verification built-in:** Supabase JWT verification middleware is one import away.

### Consequences
- Edge Functions run Deno, not Node.js. Any npm packages that don't support Deno/ESM must be replaced with Deno-compatible alternatives.
- Cold starts can add 200–500ms latency. Mitigation: warm-up ping every 5min from heartbeat service (see ROADMAP.md R-W2-09).
- Edge Functions have no persistent in-memory state. Deduplication cache lives in Supabase (not in-process). Adds one DB round-trip per ingest call.
- NATS client from Edge Function requires a NATS WebSocket connection (NATS WebSocket endpoint on cluster) — standard TCP NATS client is Node.js-only.

### Alternatives Considered
- **Fastify on dedicated VM:** Rejected — more operational burden; cold starts non-issue but VM management added; APEX-SENTINEL scope should not require a second API VM at W2.
- **Cloudflare Workers:** Rejected — requires Cloudflare account and separate deployment pipeline; Supabase edge handles all W2 needs.
- **Hono on Deno Deploy:** Rejected — two deploy pipelines (Supabase + Deno Deploy) for what should be one.

---

## ADR-W2-03 — Geohash vs H3 for Geo-Sector Partitioning

**Status:** ACCEPTED
**Date:** 2026-03-24
**Decider:** Architecture session

### Context
Gate 3 NATS subjects are partitioned by geo-sector: `sentinel.gate3.detection.{geo_sector}`. TDoA windows group events by `(geo_sector, gate3_event_id)`. The geo-sector function must: (a) be deterministic, (b) produce valid NATS subject tokens (no `/` or spaces), (c) enable neighbour lookup for cross-sector correlation, (d) have a cell size appropriate for drone detection range (~1–2km).

### Decision
Geohash at precision 6 (cell ~1.2km × 0.6km).

### Rationale
- **NATS subject compatibility:** Geohash produces base32 strings (e.g., `u10hb7`) — valid NATS subject tokens. H3 cell IDs are hex strings (e.g., `8928308280fffff`) — also valid but longer (15 chars vs 6).
- **Library availability in Deno:** `ngeohash` has an ESM build compatible with Deno. H3-js has Deno support but is larger (WASM build).
- **Precision 6 cell size:** ~1.2km × 0.6km fits within typical drone detection range. H3 resolution 8 (~0.46km²) is comparable but H3 cells are hexagonal, making row/column lookup non-intuitive for rectangular sensor arrays.
- **Existing precedent:** Geohash is used in W1 geo-sector hash function stub (TypeScript). Keeping same library reduces W1→W2 migration risk.
- **Simplicity:** Geohash encode/decode is 10 lines. H3 requires understanding of resolution hierarchy.

### Consequences
- Geo-sector subject token is always 6 lowercase base32 characters.
- Cell boundaries are rectangular (not hexagonal) — minor distortion at high latitudes acceptable for W2.
- Neighbour lookup: `ngeohash.neighbors(sector)` returns 8-cell ring (N, NE, E, SE, S, SW, W, NW).
- Cross-sector TDoA correlation: correlator subscribes to `sentinel.gate3.detection.>` and filters by timestamp proximity, not just sector.

### Alternatives Considered
- **H3 resolution 8:** Rejected — WASM overhead in Edge Functions; hexagonal indexing unfamiliar to team; no advantage for W2 scale.
- **Custom grid (UTM 1km squares):** Rejected — requires UTM zone handling at antimeridian; not globally uniform.
- **Geohash precision 5 (~39km × 20km):** Rejected — too coarse; one sector would contain entire urban area, defeating partitioning purpose.
- **Geohash precision 7 (~152m × 152m):** Rejected — too fine; adjacent nodes often in different sectors; increases cross-sector correlation complexity.

---

## ADR-W2-04 — Meshtastic vs Custom LoRa Protocol

**Status:** ACCEPTED
**Date:** 2026-03-24
**Decider:** Nico

### Context
W2 requires a LoRa mesh relay for Tier-4 nodes. Options: use Meshtastic (open-source mesh firmware + protocol) or build a custom LoRa protocol on top of raw LoRa radio drivers.

### Decision
Meshtastic firmware 2.3.x with MQTT bridge.

### Rationale
- **Time to market:** Meshtastic is production-grade mesh firmware with proven multi-hop relay, AES-256 channel encryption, and MQTT bridge (Meshtastic → MQTT → NATS). Building custom would add 3–4 weeks to W2.
- **Hardware compatibility:** Meshtastic supports HELTEC LoRa 32, TTGO T-Beam, RAK4631 — commonly available in UK for prototyping. Custom firmware would require per-hardware adaptation.
- **MQTT bridge:** Meshtastic firmware can publish to MQTT broker. The W2 `mesh-bridge` service subscribes to MQTT and forwards to NATS — one service, no custom radio protocol code.
- **Encryption:** Meshtastic AES-256 PSK per channel aligns with W2 channel key distribution via `register-node`. No need to implement encryption layer.
- **Community:** Active community, documented firmware API, Python Meshtastic library for bridge integration.

### Consequences
- Locked to Meshtastic firmware 2.3.x. Firmware upgrades require testing against bridge service.
- MQTT broker required as intermediate step (mosquitto, embedded in `mesh-bridge` service).
- Maximum LoRa payload: 237 bytes (LoRa MTU) — Gate 3 event must be serialised to ≤ 237 bytes. Protobuf serialisation mandatory (not JSON).
- Meshtastic default channels (LongFast, MedFast) used as per EU 868MHz plan.
- Custom LoRa protocol deferred to post-W3 if performance requirements exceed Meshtastic capability.

### Alternatives Considered
- **Custom SX1276 driver + proprietary protocol:** Rejected — 3–4 weeks additional development; no mesh routing; no encryption out of box.
- **LoRaWAN (TTN/Helium):** Rejected — requires network server registration; duty cycle restrictions more severe; no mesh (star topology only); latency higher.
- **Semtech Geolocation Service:** Rejected — proprietary cloud dependency; not privacy-preserving; requires TTN gateways.

---

## ADR-W2-05 — 500ms TDoA Correlation Window Size

**Status:** ACCEPTED
**Date:** 2026-03-24
**Decider:** Signal processing analysis

### Context
The TDoA correlator must group events from multiple nodes that represent the same acoustic detection. The window size determines: (a) how long to wait for late-arriving events, (b) false-grouping risk (two different events in same window), (c) end-to-end latency.

### Decision
500ms aggregation window, opened on first TDoA-eligible event per `(geo_sector, gate3_event_id)`.

### Rationale
- **Network propagation budget:** Events travel: edge device → NATS publish → JetStream → TDoA consumer. Expected latency: NATS publish 1–3ms + JetStream delivery 5–10ms + Edge Function overhead 50–100ms. Worst case per event: ~150ms. 500ms window accommodates 3× worst-case latency with margin.
- **Sound propagation physics:** At 343 m/s, sound takes 2.9ms per km. For nodes within 2km baseline, differential arrival time ≤ 5.8ms. All nodes see the same event within 6ms of each other — 500ms window is 80× the physical differential. No node should miss the window.
- **False-grouping risk:** At 1 Gate 3 event/second per geo_sector (high-activity scenario), probability of two distinct events falling in same window = 50%. Mitigation: `gate3_event_id` is the primary group key (set by first detecting node), not just geo_sector alone.
- **End-to-end latency budget:** 500ms window + 300ms processing + 200ms Supabase write = ~1s from last node event to track write. Acceptable for W2 operational tempo.

### Consequences
- Window size is configurable via environment variable `TDOA_WINDOW_MS` (default 500). Production tuning possible without code change.
- Late events (arriving > 500ms after window open) are discarded and increment `tdoa_late_event` metric.
- Under high event rates, window timer must be per `(geo_sector, gate3_event_id)` tuple — not a single global timer.
- Minimum viable scenario: 2 nodes in 500ms window → centroid fallback. 3+ nodes → Newton-Raphson.

### Alternatives Considered
- **200ms window:** Rejected — too tight for network jitter; intermittent 2-node results under normal conditions.
- **1000ms window:** Rejected — increases false-grouping risk; doubles E2E latency; no operational benefit for W2 node density.
- **Adaptive window (expand if only 1 node so far):** Deferred — increases implementation complexity; adds state machine. Post-W3 enhancement.

---

## ADR-W2-06 — pg_partman vs Manual Partitioning for detection_events

**Status:** ACCEPTED
**Date:** 2026-03-24
**Decider:** Nico

### Context
`detection_events` is expected to grow at ~50,000 rows/day at full deployment. Without partitioning, queries degrade over time. Options: pg_partman (automated range partitioning), manual monthly partitions (static SQL), or no partitioning (rely on indexes).

### Decision
pg_partman with monthly range partitioning on `created_at`.

### Rationale
- **Automated maintenance:** pg_partman automatically creates future partitions and drops expired ones per retention policy. Manual partitioning requires cron + DDL every month. pg_partman maintenance job runs via pg_cron.
- **Query performance:** Range partition pruning on `created_at` eliminates historical partitions from recent queries. Estimated query time reduction: 10× for queries scoped to last 7 days vs full-table scan.
- **Retention enforcement:** migration 010 sets `p_retention = '90 days'` in pg_partman config. Rows older than 90 days are automatically dropped (partition detach + drop). GDPR/privacy compliance: no manual delete required.
- **Supabase compatibility:** pg_partman is available as a Supabase extension (verified against project `bymfcnwfyxuivinuzurr` extension list).

### Consequences
- `detection_events` is a partitioned parent table — direct inserts route to child partition. Supabase Row Level Security applies to parent; policies inherited by children.
- `pg_partman.run_maintenance_proc()` must be called via pg_cron (migration 010 sets this up as hourly job).
- Backup strategy must account for partitioned table structure. Supabase daily snapshots include all partitions.
- Partition key `created_at` is immutable after insert (updating `created_at` would violate partition constraint — this is a feature, enforcing the "never update created_at" rule).

### Alternatives Considered
- **Manual monthly partitions:** Rejected — requires monthly DDL automation; no automatic retention; higher ongoing maintenance burden.
- **No partitioning + indexes only:** Rejected — index scan on 50M+ rows is 2–3 orders of magnitude slower than partition pruning for time-bounded queries.
- **TimescaleDB:** Rejected — not available as Supabase extension; would require separate TimescaleDB instance; defeats Supabase colocation benefit.

---

## ADR-W2-07 — mTLS Cert Rotation Cadence (90 Days)

**Status:** ACCEPTED
**Date:** 2026-03-24
**Decider:** Security review

### Context
NATS cluster uses mTLS 1.3 with client certificates for all node connections. Cert lifetime must balance security (shorter = better) against operational burden (rotation = potential downtime risk).

### Decision
90-day cert lifetime. Rotation triggered at 14 days before expiry (day 76). Automated rotation via `sentinel-cert-rotator.service` systemd unit.

### Rationale
- **Industry standard:** Let's Encrypt uses 90-day certs. NIST SP 800-57 recommends rotation before the crypto period expires. 90 days is the practical minimum for a system where cert distribution to field-deployed nodes is non-trivial.
- **14-day warning buffer:** Provides 2 operational cycles (weekly check) before expiry. Alert fires at day 76 via heartbeat service. Telegram alert to `#sentinel-system`.
- **Automated rotation:** `sentinel-cert-rotator.service` runs daily. Checks `openssl x509 -noout -dates` on current cert. If days_remaining ≤ 14: generates new CSR, signs with CA, distributes via register-node re-enrollment trigger.
- **Node cert vs cluster cert:** Node certs (per enrolled device) rotate independently from cluster inter-node certs. Cluster cert rotation requires coordinated rolling restart (not simultaneous) to maintain Raft quorum.

### Consequences
- CA cert lifetime: 3 years. CA private key stored in Supabase Vault (not on VM filesystem).
- Cluster node cert rotation sequence: rotate node-1 → verify cluster healthy → rotate node-2 → verify → repeat. Never rotate 3+ nodes simultaneously (would lose quorum).
- Field-deployed Tier-1 GPS nodes: cert rotation delivered via NATS command subject `sentinel.node.{node_id}.cmd.cert_rotate`. Node re-enrolls with new CSR.
- Tier-4 smartphone nodes: cert rotation via app update (re-registration on next launch).
- Runbook: `docs/runbooks/nats-cert-rotation.md` (artifact registered in ARTIFACT_REGISTRY.md).

### Alternatives Considered
- **30-day certs:** Rejected — too frequent for field nodes; rotation requires physical access for air-gapped nodes; operational burden outweighs security gain.
- **1-year certs:** Rejected — too long; compromised cert window is 12 months; APEX-SENTINEL threat model requires shorter exposure window.
- **Manual rotation:** Rejected — human error risk; missed rotation = outage; automation is mandatory for 99.99% HA target.

---

## ADR-W2-08 — Node Tier Classification (Tier 0/1/2/4)

**Status:** ACCEPTED
**Date:** 2026-03-24
**Decider:** Nico / PRD alignment

### Context
APEX-SENTINEL nodes have different hardware capabilities. The system must assign different trust weights and TDoA timing weights based on hardware tier. Tier numbering was established in W1 PRD; W2 must formalise the classification system.

### Decision
Four tiers: 0 (infrastructure), 1 (GPS-PPS), 2 (SDR), 4 (smartphone). Tier 3 is reserved (not assigned). Tier assignment is set at registration and cannot be changed without re-enrollment.

**Tier definitions:**
- **Tier 0:** Infrastructure node (NATS bridge, relay gateway). No detection capability. No TDoA participation. TDoA weight: N/A.
- **Tier 1:** High-precision acoustic array with GPS-PPS hardware. `time_precision_us = 1`. TDoA weight: 1.0. Primary TDoA contributor.
- **Tier 2:** SDR (Software-Defined Radio) node. RF spectrum monitoring. `time_precision_us = 5000` (NTP-sync, ±5ms). TDoA weight: 0.7. Secondary TDoA contributor.
- **Tier 4:** Smartphone. YAMNet acoustic + BLE/LoRa relay. `time_precision_us = 50000` (NTP ±50ms). TDoA weight: 0.3. Tertiary TDoA contributor; primarily used for coverage extension and offline relay.

**Tier 3 reserved:** For future quantum-clock nodes (not yet available).

### Consequences
- `register-node` validates tier ∈ {0, 1, 2, 4}. HTTP 422 for tier 3 or tier > 4.
- TDoA correlator weights are hardcoded in `src/tdoa/weights.ts` as a lookup by tier.
- Fleet map renders tier-coloured markers: Tier 0 = grey, Tier 1 = green, Tier 2 = blue, Tier 4 = orange.
- Tier 4 nodes are rate-limited: max 10 ingest-event calls per minute per node_id (prevents phone battery-drain spam).

### Alternatives Considered
- **Continuous scoring instead of tiers:** Rejected — arbitrary scoring is harder to audit; tiers provide clear operational categories.
- **Tier 3 = smartphones:** Rejected — gap in numbering reserves tier 3 for a future hardware class without renumbering.
- **No tier 0:** Rejected — infrastructure nodes must be distinguishable from detection nodes to prevent them from being included in TDoA calculations.

---

## ADR-W2-09 — Consistent Hash Ring vs Random Assignment for Track Manager

**Status:** ACCEPTED
**Date:** 2026-03-24
**Decider:** Architecture session

### Context
Track Manager maintains EKF state per active track. With N tracks and multiple Track Manager instances, tracks must be deterministically assigned to instances to avoid EKF state duplication or gaps. Two approaches: consistent hash ring (track_id → instance) or random assignment with shared state in Supabase.

### Decision
Consistent hash ring keyed on `geo_sector` (not `track_id`).

### Rationale
- **Locality:** All tracks within a geo_sector are handled by the same Track Manager instance. TDoA results for a sector arrive at a single instance — no cross-instance coordination for EKF update.
- **Geo_sector as key:** Geo_sector is known before a track_id is assigned (it's derived from the detection position). Hash ring assignment happens at TDoA result routing, before Track Manager creates the track.
- **Rebalancing cost:** When a Track Manager instance fails, only the geo_sectors it was responsible for must be rebalanced to the remaining instances. Rebalancing cost = sector count ÷ instance count, not total track count.
- **Simplicity:** Ring hash of geo_sector string with 150 virtual nodes per instance provides even distribution. Library: `hashring` (npm, ESM compatible).

### Consequences
- Track Manager is stateful: in-memory EKF state per active track. Crash = EKF state loss for affected sectors.
- On instance recovery: EKF state rebuilt from last 10 `tracks` table rows for each sector (cold-start reconstruction, ≤ 5s per sector).
- Ring hash config (`TRACK_MANAGER_INSTANCES=3`, `VIRTUAL_NODES=150`) in environment. Changing instance count requires coordinated restart (rolling update with state handoff not implemented in W2).
- W3 enhancement: EKF state persistence to Redis for zero-downtime Track Manager updates.

### Alternatives Considered
- **Random assignment + Supabase shared EKF state:** Rejected — EKF state serialisation overhead on every update; Supabase write latency incompatible with 500ms TDoA window.
- **Single Track Manager (no sharding):** Rejected — single point of failure; violates N+2 redundancy pillar.
- **Track ID hash ring:** Rejected — track_id not known at routing time; requires two-step assignment (first create track in DB, then route).

---

## ADR-W2-10 — Dempster-Shafer vs Weighted Mean for Multi-Sensor Fusion

**Status:** ACCEPTED
**Date:** 2026-03-24
**Decider:** Signal processing review

### Context
When multiple sensors (acoustic array, SDR spectrum, BLE RSSI) contribute to a Gate 3 detection, their confidences must be fused into a single confidence score. Two candidate frameworks: Dempster-Shafer Theory of Evidence (DST) and weighted mean of individual confidences.

### Decision
Weighted mean with tier-based weights for W2. Dempster-Shafer deferred to W3 EKF+LSTM Gate 4 implementation.

### Rationale
- **Implementation complexity:** DST requires maintaining belief functions (Bel, Pl) per hypothesis per sensor. For W2 with 3 sensor types (acoustic, SDR, BLE), DST adds ~200 lines of belief propagation code with non-obvious edge cases (Dempster's combination rule breaks down when sensors conflict — Zadeh's paradox). Weighted mean is 5 lines.
- **W2 scope:** W2 does not yet have SDR sensor data flowing. Multi-sensor fusion with DST requires at least 2 active sensor types. In W2, acoustic (YAMNet) is the primary sensor. DST would be operating on a 1-sensor belief function — degenerate case.
- **Auditability:** Weighted mean is interpretable: `final_confidence = (w1*c1 + w2*c2) / (w1+w2)`. DST result is harder to explain to operational users.
- **Weights:** Tier 1 acoustic = 1.0, Tier 2 SDR = 0.8 (not yet active in W2), Tier 4 smartphone = 0.5.

### Consequences
- `fusion.ts` exports `weightedMeanFusion(events: FusionInput[]): number`. Signature is DST-compatible for future replacement.
- Gate 3 threshold: fused confidence ≥ 0.85 triggers alert. Single-sensor Gate 3 event with confidence ≥ 0.85 passes directly.
- W3 ADR will revisit when SDR sensor data is flowing and DST multi-hypothesis modelling is warranted.
- DECISION_LOG will add ADR-W3-01 explicitly superseding this decision if DST is adopted in W3.

### Alternatives Considered
- **Dempster-Shafer in W2:** Rejected — implementation risk outweighs benefit when only 1 sensor type active; defer to W3.
- **Bayesian fusion (log-likelihood ratio):** Deferred — requires calibrated likelihood models per sensor type; sensor models not yet available in W2.
- **Max confidence (take highest):** Rejected — discards information; biased toward outlier high-confidence readings; no theoretical justification.
- **Fuzzy logic membership:** Rejected — requires domain expert membership function design; adds interpretability burden.
