# APEX-SENTINEL W9 — Feature Requirements Register

> Wave: W9 | Theme: Live Data Feed Integration
> Status: PLAN | Updated: 2026-03-26

---

## Summary

| Wave | FR Count | Status | Test Count |
|------|----------|--------|------------|
| W1-W8 | 67 | DONE | 1860 |
| W9 | 8 | PLAN | 128 |
| **TOTAL** | **75** | | **1988** |

**W9 mission:** Wire ADS-B, weather, emergency alerts, OSINT feeds, and Remote ID into the detection pipeline and dashboard so APEX-SENTINEL has real situational awareness beyond its own acoustic/RF sensors. Zero real-time external data integration → 8 live feeds.

---

## W9 Feature Requirements

| FR ID | Title | Status | Tests | Priority | Blocking |
|-------|-------|--------|-------|----------|---------|
| FR-W9-01 | ADS-B Exchange Live Feed (adsb.lol) | PLAN | 18 | P0 | FR-W9-06 |
| FR-W9-02 | Open-Meteo Weather Integration | PLAN | 14 | P1 | FR-W9-06 |
| FR-W9-03 | EU Civil Protection + alerts.in.ua | PLAN | 16 | P0 | FR-W9-06 |
| FR-W9-04 | GDELT Event Feed (geo-filtered Romania/Ukraine) | PLAN | 12 | P1 | FR-W9-06 |
| FR-W9-05 | Remote ID BLE/WiFi Receiver (ASTM F3411) | PLAN | 14 | P1 | FR-W9-06 |
| FR-W9-06 | DataFeedBroker (NATS feed.* aggregator) | PLAN | 20 | P0 | none |
| FR-W9-07 | ThreatContextEnricher | PLAN | 18 | P1 | FR-W9-06 |
| FR-W9-08 | Dashboard Live Feed Wiring (DemoDashboardApi) | PLAN | 16 | P2 | FR-W9-07 |

---

## FR-W9-01 — ADS-B Exchange Live Feed (adsb.lol)

**Rationale:** APEX-SENTINEL currently cannot distinguish a cooperative general aviation aircraft from a rogue drone in a detection event. An alert triggered by a Cessna at 300m AGL is a false positive. ADS-B correlation provides the ground truth: if an ICAO-registered aircraft is in the area and its transponder is active, acoustic or RF detections from that position should be down-weighted. The adsb.lol API provides free, no-auth JSON over HTTPS updated every 5 seconds and covers the Romanian/Ukrainian border region.

**Acceptance:**
- `AdsbFeedProducer` polls `https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{nm}` every 5 seconds
- Response parsed to `AdsbAircraft[]` schema: icao, callsign, alt_baro, lat, lon, gs, track, emergency
- Published to NATS subject `feed.adsb.aircraft` as a typed envelope
- Aircraft within 2 km of a detection event annotated with `cooperative: true` on `detection.enriched`
- Emergency flag (`squawk: 7700/7600/7500`) published to `feed.adsb.emergency` separately
- Polling error (HTTP 4xx/5xx, DNS failure) → publish `feed.adsb.status: { healthy: false }` without crashing
- 18 tests: schema validation (3), polling cycle (2), geo-filter logic (4), NATS publish (3), error handling (3), cooperative annotation (3)

---

## FR-W9-02 — Open-Meteo Weather Integration

**Rationale:** Wind speed and direction directly affect acoustic propagation: a 10 m/s headwind degrades detection range by up to 40%. Precipitation suppresses high-frequency drone harmonics. Temperature affects speed of sound (1 m/s per 0.6°C deviation from 20°C). Without weather context, the acoustic model has no way to correct for environmental degradation, causing false negatives in adverse conditions. Open-Meteo provides free, no-auth JSON weather data with 1-hour forecasts.

**Acceptance:**
- `WeatherFeedProducer` polls Open-Meteo hourly forecast API (`https://api.open-meteo.com/v1/forecast`) every 60 seconds
- Parameters fetched: `wind_speed_10m`, `wind_direction_10m`, `precipitation`, `temperature_2m`, `relative_humidity_2m`, `visibility`
- Published to NATS subject `feed.weather.current` as `WeatherSnapshot` typed envelope
- `AcousticPropagationAdjuster` computes range-correction factor from weather snapshot (unit: fraction of nominal range)
- Correction factor published to `feed.weather.acoustic_adjustment` for consumption by detection pipeline
- Wind >15 m/s → `feed.weather.advisory: { degraded: true, reason: 'high_wind' }`
- 14 tests: schema validation (2), polling cycle (2), propagation correction formula (4), NATS publish (2), advisory triggers (2), error handling (2)

---

## FR-W9-03 — EU Civil Protection + alerts.in.ua

**Rationale:** Active air raid alerts in the operational area are the highest-priority threat context available. An acoustic detection during an active Ukrainian air raid alert carries a fundamentally different threat score than the same acoustic signature on a calm day. EU Civil Protection aggregates official EU/national emergency feeds. alerts.in.ua provides the Ukrainian national alert API (real-time, public). When an active alert covers the detection grid sector, ThreatContextEnricher must escalate the detection severity.

**Acceptance:**
- `AlertFeedProducer` polls alerts.in.ua API (`https://api.alerts.in.ua/v1/alerts/active.json`) every 30 seconds
- EU Civil Protection RSS parsed every 5 minutes for geo-tagged events within 500 km of deployment lat/lon
- Active alerts published to `feed.alerts.active` as `AlertEvent[]` with fields: source, region, level (info/warning/critical), start_at, geometry
- Alert coverage check: if detection lat/lon within alert polygon → `threat_context.active_alert: true` on `detection.enriched`
- Alert escalation table: no alert → severity unchanged; `warning` → +1 severity tier; `critical` → +2 severity tiers
- Alert expiry: remove from active set when `end_at` passes or explicit cancellation received
- 16 tests: schema validation (2), polling cycle (2), geo-polygon coverage check (4), severity escalation logic (3), alert expiry (2), NATS publish (2), error handling (1)

---

## FR-W9-04 — GDELT Event Feed (geo-filtered Romania/Ukraine)

**Rationale:** GDELT monitors global news and event streams in real time. Significant events near the deployment area (military mobilisation, border incidents, infrastructure attacks) provide leading indicators of elevated threat windows hours or days before physical drone activity. Geo-filtering to a Romania/Ukraine bounding box reduces noise to actionable OSINT. GDELT GKG API is public and free.

**Acceptance:**
- `GdeltFeedProducer` queries GDELT GKG API (`http://data.gdeltproject.org/gdeltv2/lastupdate.txt`) every 15 minutes
- Geo-filter bounding box: lat 44.0–52.5°N, lon 22.0–40.5°E (Romania + Ukraine + Moldova)
- Events filtered by themes: `MILITARY`, `ARMEDCONFLICT`, `UAV`, `CONFLICT`, `WEAPONS`
- Published to NATS subject `feed.osint.gdelt` as `GdeltEvent[]` with fields: event_id, date, headline, themes, tone, lat, lon, source_url
- Event surge detection: >10 MILITARY/ARMEDCONFLICT events in 15-minute window → `feed.osint.surge: { active: true, count: N }`
- Surge flag visible on dashboard as OSINT indicator; no automatic severity change (advisory only)
- 12 tests: schema validation (2), geo-filter logic (3), theme filter (2), surge detection (2), NATS publish (2), error handling (1)

---

## FR-W9-05 — Remote ID BLE/WiFi Receiver (ASTM F3411)

**Rationale:** Remote ID (ASTM F3411-22a, EU Reg 2019/945) mandates that drones broadcast their operator ID, serial number, and position via BLE 5.0 or WiFi Beacon frames. A drone broadcasting Remote ID is operating legally and semi-cooperatively. A drone not broadcasting Remote ID in controlled airspace is either a rogue asset or a legacy device. Remote ID correlation provides the legal compliance dimension missing from pure acoustic detection. Implementation uses a USB BLE/WiFi adapter on the detection node.

**Acceptance:**
- `RemoteIdReceiver` listens for ASTM F3411 BLE advertisement frames and WiFi NaN beacon frames
- Decoded fields: uas_id, operator_id, position (lat/lon/alt), speed, heading, timestamp, id_type (serial/caa/utm)
- Published to NATS subject `feed.rf.remote_id` in real time (no polling interval; event-driven)
- `ThreatContextEnricher` maps Remote ID observations against acoustic detections within 200m spatial / 10s temporal window
- Match found → annotate `detection.enriched` with `remote_id: { present: true, uas_id, operator_id, compliant: true }`
- No match within window → `remote_id: { present: false, compliant: false }` — elevated threat weight
- Simulation harness: `RemoteIdSimulator` injects synthetic BLE frames for CI use (no physical adapter required)
- 14 tests: F3411 frame decoding (3), BLE/WiFi parsing (2), NATS publish (2), spatial/temporal correlation (4), threat weight adjustment (2), simulator harness (1)

---

## FR-W9-06 — DataFeedBroker (NATS feed.* aggregator)

**Rationale:** With 5 independent feed producers each publishing on separate `feed.*` subjects, the detection pipeline would need to subscribe to every subject individually and maintain its own deduplication and ordering logic. The DataFeedBroker is the central aggregation point: it subscribes to all `feed.*` subjects, applies deduplication by event ID + source hash, coarsens any raw coordinates to ±50m grid (GDPR), and publishes a single fused event stream on `feed.fused`. Downstream consumers (ThreatContextEnricher, dashboard) subscribe only to `feed.fused`.

**Acceptance:**
- `DataFeedBroker` subscribes to: `feed.adsb.*`, `feed.weather.*`, `feed.alerts.*`, `feed.osint.*`, `feed.rf.remote_id`
- Deduplication: SHA-256 of (source + event_id + timestamp_bucket_30s); duplicates within 30-second window dropped
- GDPR coarsening: all lat/lon fields rounded to nearest 0.0005° (~55m) before `feed.fused` publish
- No raw GPS stored beyond 4-hour rolling window in NATS KV; eviction enforced by broker on TTL
- `feed.fused` envelope schema: `{ source, type, timestamp, data, coarsened: true }`
- Health endpoint: `DataFeedBroker.health()` returns per-producer status (last_event, event_count, error_count)
- Back-pressure: if downstream NATS consumer is >1000 messages behind, broker applies token-bucket throttle (200 msg/s)
- Metrics: events_received_total, events_deduplicated_total, events_published_total — exposed via Prometheus scrape endpoint at `/metrics`
- 20 tests: subscription coverage (3), deduplication logic (4), GDPR coarsening (3), TTL eviction (2), health endpoint (3), back-pressure (2), metrics (3)

---

## FR-W9-07 — ThreatContextEnricher

**Rationale:** Current `detection.*` events carry raw acoustic/RF data only. The ThreatContextEnricher subscribes to `detection.*` and enriches each event with correlated feed context: cooperative aircraft in area (ADS-B), weather-adjusted detection confidence, active alert status, OSINT surge indicator, and Remote ID compliance status. The enriched event replaces the raw event in the operator-facing layer. Downstream alerting, dashboard, and ATAK output must operate only on enriched events.

**Acceptance:**
- `ThreatContextEnricher` subscribes to `detection.raw` and `feed.fused`
- Correlation window: ±500m spatial, ±30s temporal for ADS-B and Remote ID; immediate for alerts; rolling 15 min for OSINT
- Enrichment fields added to `detection.enriched`:
  - `adsb`: `{ cooperative_aircraft_count, nearest_icao, nearest_dist_m }`
  - `weather`: `{ wind_speed_ms, acoustic_range_factor, advisory }`
  - `alert`: `{ active, region, level, source }`
  - `osint`: `{ surge_active, event_count_15min }`
  - `remote_id`: `{ present, compliant, uas_id }`
- Threat score modifier: alert=critical → ×2.0; alert=warning → ×1.5; cooperative ADS-B match → ×0.6; Remote ID compliant → ×0.7; remote_id absent → ×1.3
- ≥95% of `detection.raw` events must receive enrichment within 2 seconds of arrival
- Enriched event published to `detection.enriched`; original `detection.raw` preserved in NATS KV for audit
- 18 tests: enrichment field population (5), score modifier arithmetic (4), correlation window logic (4), throughput (≥95% in 2s) (2), audit preservation (2), error handling (1)

---

## FR-W9-08 — Dashboard Live Feed Wiring (DemoDashboardApi)

**Rationale:** The W8 Demo Dashboard frontend has no live external data. Operators see drone tracks but have no awareness of nearby cooperative aircraft, current weather conditions, or active air raid alerts. W9 wires the enriched feed context into the dashboard: a secondary panel shows ADS-B contacts on the map, a weather widget displays current conditions and acoustic range estimate, and an alert banner appears when `alert.level` is warning or critical. This is the EUDIS demo visual: judges see live aircraft, live weather, and live alerts alongside drone detections.

**Acceptance:**
- `DemoDashboardApi` adds endpoints: `GET /api/feed/adsb`, `GET /api/feed/weather`, `GET /api/feed/alerts`, `GET /api/feed/osint`
- All endpoints consume from `feed.fused` via DataFeedBroker subscription (not raw feed subjects)
- ADS-B aircraft rendered as secondary markers on dashboard map (distinct icon from drone tracks)
- Alert banner: visible when any active alert covers deployment grid; colour-coded by level (yellow=warning, red=critical)
- Weather widget: wind speed/direction arrow, temperature, acoustic range factor (e.g. "–18% range in current conditions")
- OSINT surge indicator: badge showing "OSINT: 12 events / 15 min" when surge active
- SSE endpoint `/api/feed/live` pushes all feed updates to dashboard client; reconnect-on-drop within 5 seconds
- Data displayed within 5 seconds of source event
- 16 tests: API endpoint schema (4), SSE push (3), alert banner logic (3), map marker projection (2), weather widget render (2), OSINT badge (2)
