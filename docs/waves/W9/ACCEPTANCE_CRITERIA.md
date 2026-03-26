# W9 — ACCEPTANCE_CRITERIA
Wave 9: Live Data Feed Integration | APEX-SENTINEL | 2026-03-26

---

## FR-W9-01: ADS-B Exchange Client

**Feature:** AdsbExchangeClient polls adsb.lol every 5 seconds for the configured bounding box.

**Acceptance criteria:**

- AC-W9-01-1: Given a valid bounding box config, client returns an array of aircraft objects within the configured lat/lon bounds on every poll cycle.
- AC-W9-01-2: Given aircraft with squawk codes 7500, 7600, or 7700 in the response, client correctly flags them with `squawk_emergency: true` and increments the respective squawk counter.
- AC-W9-01-3: Given aircraft with no transponder data (missing squawk, altitude = 0, no ICAO24), client increments `no_transponder_count`.
- AC-W9-01-4: Given a network timeout (>5s response), client does NOT throw; it returns a graceful error result with `aircraft_count: 0` and emits a NATS `feed.adsb.error` event.
- AC-W9-01-5: Given the feed responds with HTTP 429 (rate limit), client backs off for 30s before retrying.
- AC-W9-01-6: Polling interval is configurable via `ADSB_POLL_INTERVAL_MS` env var (default: 5000).
- AC-W9-01-7: Client publishes a `feed.adsb.aircraft` NATS event on every successful poll.

---

## FR-W9-02: Open-Meteo Weather Client

**Feature:** OpenMeteoClient fetches current weather conditions for the node's geographic location.

**Acceptance criteria:**

- AC-W9-02-1: Given a valid lat/lon, client returns `wind_speed_ms`, `wind_dir_deg`, `visibility_m`, `precip_mmh` from Open-Meteo /v1/forecast endpoint.
- AC-W9-02-2: Given `visibility_m >= 10000`, `acoustic_range_adjustment_pct` is 0.
- AC-W9-02-3: Given `visibility_m < 1000`, `acoustic_range_adjustment_pct` is -50.
- AC-W9-02-4: Given `wind_speed_ms > 10`, an additional -15% wind penalty is applied to `acoustic_range_adjustment_pct`.
- AC-W9-02-5: Client handles Open-Meteo API error (non-200) gracefully — returns last cached value if available, or null fields.
- AC-W9-02-6: Client publishes `feed.weather.current` NATS event after each successful fetch.
- AC-W9-02-7: Fetch interval is configurable via `WEATHER_POLL_INTERVAL_MS` env var (default: 60000).

---

## FR-W9-03: Civil Protection Alerts Client

**Feature:** CivilProtectionClient monitors alerts.in.ua for active air alerts in Romania and Ukraine.

**Acceptance criteria:**

- AC-W9-03-1: Given an active alert published by alerts.in.ua, client returns the alert within 30 seconds of its publication timestamp.
- AC-W9-03-2: Given an alerts.in.ua `air_raid` type, client maps it to AWNING level `RED`.
- AC-W9-03-3: Given an alerts.in.ua `general_threat` type, client maps it to AWNING level `YELLOW`.
- AC-W9-03-4: Given no active alerts for a region, client returns an empty array (not null/undefined).
- AC-W9-03-5: Area polygon is stored as GeoJSON; client does NOT store recipient lists or notification data.
- AC-W9-03-6: Client handles HTTP errors and retries with exponential backoff (max 3 retries, max 60s delay).
- AC-W9-03-7: `ALERTS_COUNTRIES` env var (default: `RO,UA`) controls which country filters are applied.
- AC-W9-03-8: Client publishes `feed.alerts.active` NATS event on state change (new alert or cleared alert).

---

## FR-W9-04: GDELT OSINT Client

**Feature:** GdeltClient queries GDELT 2.0 geo API for drone/UAV-related events in the configured bounding box.

**Acceptance criteria:**

- AC-W9-04-1: Given a known test date (2022-02-24) and Ukraine bounding box, client returns at least 1 event matching UAV/drone/attack event codes.
- AC-W9-04-2: Client aggregates events into `event_count` per bbox per polling window — individual event records are not persisted.
- AC-W9-04-3: `top_keywords` array contains event-type terms only (no author names, no social post content).
- AC-W9-04-4: Client handles GDELT API unavailability gracefully — returns last cached count with a staleness flag.
- AC-W9-04-5: Polling interval is configurable via `GDELT_POLL_INTERVAL_MS` env var (default: 900000 — 15min latency matches GDELT update cycle).
- AC-W9-04-6: Client publishes `feed.osint.events` NATS event after each successful poll with non-zero event_count.

---

## FR-W9-05: Remote ID Receiver

**Feature:** RemoteIdReceiver parses ASTM F3411 BLE/Wi-Fi broadcast frames and extracts coarsened operator context.

**Acceptance criteria:**

- AC-W9-05-1: Given a valid ASTM F3411 BLE beacon payload, client correctly parses UAS ID, operator lat/lon, altitude, and velocity.
- AC-W9-05-2: Operator coordinates are coarsened to ±50m grid before any storage or NATS publication — raw GPS coordinates are never written.
- AC-W9-05-3: UAS ID is hashed with SHA-256 + daily salt before storage — raw UAS ID is never written to any database or log.
- AC-W9-05-4: Duplicate UAS IDs (same hashed ID) received within a 10-second window are de-duplicated — only one entry is emitted.
- AC-W9-05-5: In CI/test environment (no physical BLE hardware), all tests run against mock beacon fixtures — hardware-dependent tests are tagged `@hardware` and skipped in CI.
- AC-W9-05-6: Client publishes `feed.rf.remote_id` NATS event for each unique beacon received.

---

## FR-W9-06: DataFeedBroker

**Feature:** DataFeedBroker orchestrates all 5 feed clients and publishes a unified `feed.fused` stream.

**Acceptance criteria:**

- AC-W9-06-1: DataFeedBroker.start() initialises all 5 feed clients (ADS-B, weather, alerts, GDELT, Remote ID) and publishes the first `feed.fused` event within 5 seconds.
- AC-W9-06-2: `feed.fused` events are deduplicated by content hash — identical consecutive feed states do not generate duplicate events.
- AC-W9-06-3: If one feed client fails (throws or times out), the other 4 continue operating — broker does NOT crash.
- AC-W9-06-4: Broker emits a `feed.broker.health` event every 30s with per-feed status (up/down/stale).
- AC-W9-06-5: DataFeedBroker.stop() cleanly shuts down all feed clients with no hanging async handles.
- AC-W9-06-6: Broker maintains an in-memory buffer of the last 10s of Remote ID beacons for ThreatContextEnricher lookups.

---

## FR-W9-07: ThreatContextEnricher

**Feature:** ThreatContextEnricher attaches multi-source feed context to every detection event and computes a context_score 0-100.

**Acceptance criteria:**

- AC-W9-07-1: Given a detection event on NATS, ThreatContextEnricher fetches all 5 context signals and publishes `detection.enriched` within 200ms.
- AC-W9-07-2: Given an active RED alert overlapping the detection point, `context_score >= 40` (40% weight × 100).
- AC-W9-07-3: Given a squawk 7500 in the ADS-B snapshot, `adsb_score = 100` and `context_score >= 30` (30% weight × 100).
- AC-W9-07-4: Given no data from any feed (all null), `context_score = 0` and `feed_context_json` contains explicit null fields (not missing fields).
- AC-W9-07-5: `context_score` is always in range [0, 100] (never negative, never > 100).
- AC-W9-07-6: `enriched_at` timestamp is the wall-clock time of enrichment, not the detection timestamp.
- AC-W9-07-7: Enriched events are persisted to `detection_enriched` Supabase table.

---

## FR-W9-08: DemoDashboard Live Feed Adapter

**Feature:** DemoDashboardApi SSE stream includes live feed data — aircraft count and active alerts visible on the map.

**Acceptance criteria:**

- AC-W9-08-1: SSE stream from DemoDashboardApi includes a `feed_state` field on every event after W9 integration.
- AC-W9-08-2: `feed_state.aircraft_count` reflects the latest ADS-B snapshot value (updated within 10s of new ADS-B data).
- AC-W9-08-3: `feed_state.active_alerts` array includes all current RED and YELLOW alerts — WHITE alerts are included but visually de-emphasised (flag in payload).
- AC-W9-08-4: Dashboard map overlay shows alert polygons — area_geojson is passed through to the SSE client.
- AC-W9-08-5: If DataFeedBroker is unavailable, SSE stream continues with `feed_state: null` — dashboard does not crash or disconnect.
