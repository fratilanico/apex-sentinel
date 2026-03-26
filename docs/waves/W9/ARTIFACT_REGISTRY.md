# W9 — ARTIFACT_REGISTRY
Wave 9: Live Data Feed Integration | APEX-SENTINEL | 2026-03-26

---

## New Source Files (8)

| File | Purpose | FR |
|---|---|---|
| `src/feeds/adsb-exchange-client.ts` | Polls adsb.lol every 5s, returns aggregate aircraft counts + squawk flags | FR-W9-01 |
| `src/feeds/open-meteo-client.ts` | Fetches wind/visibility/precip from Open-Meteo, computes acoustic range adjustment | FR-W9-02 |
| `src/feeds/civil-protection-client.ts` | Monitors alerts.in.ua for active air alerts RO/UA, maps to AWNING levels | FR-W9-03 |
| `src/feeds/gdelt-client.ts` | Queries GDELT 2.0 geo API for drone/UAV events in bounding box | FR-W9-04 |
| `src/feeds/remote-id-receiver.ts` | Parses ASTM F3411 BLE/Wi-Fi Remote ID beacons, coarsens coords, hashes UAS ID | FR-W9-05 |
| `src/feeds/data-feed-broker.ts` | Orchestrates all 5 feed clients, publishes feed.fused, deduplicates by content hash | FR-W9-06 |
| `src/detection/threat-context-enricher.ts` | Correlates detection events with feed context, computes context_score 0-100 | FR-W9-07 |
| `src/ui/demo-dashboard/live-feed-adapter.ts` | Wires DataFeedBroker state into DemoDashboardApi SSE stream | FR-W9-08 |

---

## New Test Files (9)

| File | Tests | FR |
|---|---|---|
| `tests/feeds/FR-W9-01-adsb-exchange-client.test.ts` | ~16 | FR-W9-01 |
| `tests/feeds/FR-W9-02-open-meteo-client.test.ts` | ~14 | FR-W9-02 |
| `tests/feeds/FR-W9-03-civil-protection-client.test.ts` | ~16 | FR-W9-03 |
| `tests/feeds/FR-W9-04-gdelt-client.test.ts` | ~12 | FR-W9-04 |
| `tests/feeds/FR-W9-05-remote-id-receiver.test.ts` | ~14 | FR-W9-05 |
| `tests/feeds/FR-W9-06-data-feed-broker.test.ts` | ~18 | FR-W9-06 |
| `tests/detection/FR-W9-07-threat-context-enricher.test.ts` | ~22 | FR-W9-07 |
| `tests/feeds/FR-W9-08-demo-dashboard-live-feed.test.ts` | ~10 | FR-W9-08 |
| `tests/integration/FR-W9-integration-feeds.test.ts` | ~6 | All FRs |

**Total target: 128 tests**

---

## New Supabase Migrations (1)

| File | Contents |
|---|---|
| `supabase/migrations/YYYYMMDDHHMMSS_w9_feed_tables.sql` | Creates: feed_adsb_snapshots, feed_weather_snapshots, feed_alerts_active, feed_osint_events, detection_enriched; RLS policies; indexes; retention pg_cron jobs |

---

## Modified Files

| File | Change |
|---|---|
| `vitest.config.ts` | Add `tests/feeds/` and updated `tests/detection/` to P0/P1 test project config |
| `src/detection/sentinel-pipeline.ts` | Wire ThreatContextEnricher into detection event flow |
| `src/ui/demo-dashboard/demo-dashboard-api.ts` | Accept LiveFeedAdapter dependency, include feed_state in SSE payload |

---

## Environment Variables (New)

| Variable | Default | Purpose |
|---|---|---|
| `ADSB_BOUNDING_BOX` | `43.6,22.1,48.3,30.0` | Romania bounding box (lat_min,lon_min,lat_max,lon_max) |
| `ADSB_POLL_INTERVAL_MS` | `5000` | ADS-B polling interval |
| `WEATHER_POLL_INTERVAL_MS` | `60000` | Open-Meteo polling interval |
| `ALERTS_COUNTRIES` | `RO,UA` | Civil protection alert country filter |
| `GDELT_POLL_INTERVAL_MS` | `900000` | GDELT polling interval (matches 15min update cycle) |
| `REMOTE_ID_INTERFACE` | `mock` | BLE interface name or 'mock' for CI |
| `REMOTE_ID_DAILY_SALT` | auto-generated | Daily salt for UAS ID hashing (auto-rotated) |

---

## NATS Subjects (New)

| Subject | Publisher | Subscriber |
|---|---|---|
| `feed.adsb.aircraft` | AdsbExchangeClient | DataFeedBroker, ThreatContextEnricher |
| `feed.weather.current` | OpenMeteoClient | DataFeedBroker, ThreatContextEnricher |
| `feed.alerts.active` | CivilProtectionClient | DataFeedBroker, ThreatContextEnricher |
| `feed.osint.events` | GdeltClient | DataFeedBroker, ThreatContextEnricher |
| `feed.rf.remote_id` | RemoteIdReceiver | DataFeedBroker, ThreatContextEnricher |
| `feed.fused` | DataFeedBroker | DemoDashboardApi, external consumers |
| `feed.broker.health` | DataFeedBroker | Monitoring |
| `detection.enriched` | ThreatContextEnricher | DemoDashboardApi, Supabase writer |

---

## Supabase Project

**Project ID:** bymfcnwfyxuivinuzurr
**Region:** eu-west-2 (London)
**Tables added this wave:** 5
