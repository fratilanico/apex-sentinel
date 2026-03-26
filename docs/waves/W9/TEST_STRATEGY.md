# APEX-SENTINEL W9 — Test Strategy

> Wave: W9 | TDD RED before implementation | Date: 2026-03-26

---

## Test Count Target

| Wave   | Tests  | Cumulative |
|--------|--------|------------|
| W1-W8  | ≥1800  | ≥1800      |
| W9 target | 128 | ≥1928      |

---

## FR Test Matrix

### FR-W9-01: ADS-B Exchange Client — P0 Smoke (18 tests)

```
tests/feeds/FR-W9-01-adsb-exchange.test.ts

Unit (10):
  - constructor accepts { boundingBox, pollIntervalMs } config
  - getAircraft() returns Aircraft[] from mocked adsb.lol response
  - Aircraft object contains icao24, callsign, lat, lon, alt_baro, velocity,
    heading, squawk, onGround fields
  - onGround=true aircraft filtered from published events
  - boundingBox filter applied: aircraft outside bbox not returned
  - Empty response (no aircraft in bbox) returns []
  - Network error triggers exponential backoff (mocked fetch)
  - After 3 retries exhausted: returns [] for that poll cycle (no throw)
  - Raw ADS-B position not written to Supabase (privacy gate)
  - poll() publishes to NATS subject feed.adsb.aircraft

Integration (8):
  - start() triggers periodic polling at pollIntervalMs interval
  - stop() halts polling, no further NATS publishes
  - NATS feed.adsb.aircraft message envelope: source, receivedAt, payload
  - Two consecutive polls with same aircraft produce two distinct NATS messages
    (dedup is broker's responsibility, not client's)
  - Callsign field trimmed of trailing whitespace (adsb.lol quirk)
  - alt_baro value in feet, not converted (raw pass-through)
  - squawk=7700 aircraft included (emergency — always pass-through)
  - Client restarts gracefully after NATS reconnect
```

### FR-W9-03: Civil Protection Client — P0 Smoke (18 tests)

```
tests/feeds/FR-W9-03-civil-protection.test.ts

Unit (10):
  - constructor accepts { countries: string[] } config
  - getActiveAlerts() returns Alert[] from mocked alerts.in.ua response
  - getActiveAlerts() merges ERCC feed with alerts.in.ua (no duplicates on id)
  - Alert object contains id, level, type, area, validUntil, source fields
  - level mapped to: 'info' | 'warning' | 'critical' (from CAP-like severity)
  - Alert with validUntil in the past excluded from returned array
  - countries filter: Romania (RO) and Ukraine (UA) alerts included;
    others excluded
  - ERCC network error: returns alerts.in.ua results only (graceful partial)
  - alerts.in.ua network error: returns ERCC results only (graceful partial)
  - Both sources unavailable: returns [] (no throw)

Integration (8):
  - NATS feed.alerts.active message published after successful getActiveAlerts()
  - Alert deduplication by id across ERCC and alerts.in.ua sources
  - ERCC feed parsed as CAP-like XML (test fixture: sample ERCC response)
  - alerts.in.ua feed parsed as JSON array (test fixture: sample alerts.in.ua)
  - RO air-raid alert maps to level='critical', type='air_raid'
  - UA missile alert maps to level='critical', type='missile'
  - ERCC flood warning maps to level='warning', type='flood'
  - validUntil field correctly parsed from ISO 8601 string
```

### FR-W9-02: Open-Meteo Client — P1 Core (14 tests)

```
tests/feeds/FR-W9-02-open-meteo.test.ts

Unit (8):
  - constructor accepts { lat, lon } config
  - getCurrent() returns WeatherSnapshot from mocked Open-Meteo response
  - WeatherSnapshot contains windSpeedMs, windDirectionDeg, visibilityM,
    tempC, precipMmh
  - windSpeedMs converted from km/h (Open-Meteo default) to m/s
  - visibilityM capped at 24000 (Open-Meteo max = 24000m)
  - Network error returns last known snapshot (stale data, max age: 120s)
  - If no prior snapshot: returns null on error (not throw)
  - getCurrent() publishes to NATS subject feed.weather.current

Integration (6):
  - NATS feed.weather.current message includes node lat/lon as context
  - Stale snapshot older than 120s not returned (returns null instead)
  - Two getCurrent() calls for same node within 5s return same NATS message
    (client-side 5s TTL cache — avoids hammering Open-Meteo)
  - precipMmh=0 when no precipitation field present in response
  - Negative tempC correctly parsed (winter Ukraine conditions)
  - WeatherSnapshot timestamp is observation time from Open-Meteo, not local
    wall clock
```

### FR-W9-06: DataFeedBroker — P1 Core (20 tests)

```
tests/feeds/FR-W9-06-data-feed-broker.test.ts

Unit (10):
  - constructor accepts { nats, feeds: FeedClient[] }
  - start() calls start() on all registered FeedClients
  - stop() calls stop() on all registered FeedClients
  - Deduplication: identical payload published twice → second discarded
  - Deduplication: SHA-256 hash used as dedup key (not timestamp or id)
  - Dedup TTL: same payload after 30s is treated as new (hash expired)
  - Dedup map GC runs every 60s, removes expired hashes
  - feed.fused message envelope: { source, subject, receivedAt, payload,
    contentHash }
  - source field matches originating NATS subject (e.g. feed.adsb.aircraft)
  - Broker handles FeedClient.start() rejection gracefully (logs, continues)

Integration (10):
  - Five feed clients registered → all five subjects consumed
  - Two identical ADS-B messages within 30s → one feed.fused message
  - Two identical ADS-B messages 31s apart → two feed.fused messages
  - Different payloads on same subject both published to feed.fused
  - feed.fused subscriber receives messages from all five source subjects
  - Broker survives one FeedClient throwing on poll cycle (others continue)
  - NATS JetStream consumer uses durable consumer name (survives restart)
  - Dedup map size does not grow unbounded over 1000 messages (GC verified)
  - stop() waits for in-flight publishes to complete before returning
  - Broker publishes 0 messages to feed.fused when all feeds return empty
```

### FR-W9-07: ThreatContextEnricher — P1 Core (18 tests)

```
tests/detection/FR-W9-07-threat-context-enricher.test.ts

Unit (10):
  - constructor accepts { nats, feedBroker }
  - enrichDetection() attaches context object to detection
  - context.aircraft: ADS-B aircraft within 5km radius of detection position
  - context.weather: most recent weather snapshot for nearest node
  - context.alerts: all active government alerts for detection country code
  - context.osint: GDELT events from last 60s matching detection bbox
  - context.remoteId: F3411 beacons within 500m of detection position
  - context.available=false when ring buffer empty (feeds not yet populated)
  - Enrichment latency < 50ms on mocked ring buffer (performance assertion)
  - Ring buffer max 500 entries: oldest entry evicted when limit reached

Integration (8):
  - detection.* message → detection.enriched published within 50ms
  - Enriched detection contains original detection fields unchanged
  - Aircraft 4.9km away included; aircraft 5.1km away excluded
  - No feed data available → detection published to detection.enriched
    with context.available=false (not dropped, not delayed)
  - Remote ID beacon operator location in enriched output is ±50m grid
    (privacy gate: raw operator lat/lon not exposed)
  - Two detections in quick succession enriched independently
  - Ring buffer correctly ages out entries older than 60s
  - Enricher does not consume detection.enriched (no feedback loop)
```

### FR-W9-04: GDELT Client — P1 Core (12 tests)

```
tests/feeds/FR-W9-04-gdelt-client.test.ts

Unit (6):
  - constructor accepts { bbox, keywords, windowMinutes }
  - getEvents() returns OsintEvent[] from mocked GDELT 2.0 response
  - OsintEvent contains eventId, eventDate, eventType, lat, lon, sourceUrl,
    goldsteinScale, numMentions
  - bbox filter applied: events outside Romania bbox (43.6-48.3N, 22.1-30.0E)
    not returned
  - keywords filter: at least one keyword must appear in event actor fields
  - No PII fields ingested: actor names and full URL paths stripped to domain

Integration (6):
  - NATS feed.osint.events published after getEvents() returns non-empty list
  - Empty event list (no matching events): NATS message not published
  - GDELT API unavailable: returns [] (no throw, exponential backoff logged)
  - windowMinutes=15 produces correct timestamp range in API query
  - 'drone' keyword match includes KAMIKAZE_DRONE GDELT event code
  - OsintEvent.goldsteinScale within [-10, +10] range (GDELT spec)
```

### FR-W9-05: Remote ID Receiver — P2 Full (14 tests)

```
tests/feeds/FR-W9-05-remote-id-receiver.test.ts

Unit (8):
  - constructor accepts { interfaces: string[] }
  - start() binds to all specified BLE + WiFi interfaces
  - stop() unbinds all interfaces, no further beacon events
  - ASTM F3411 frame parsed: uasId, operatorLat, operatorLon, altM, intent
  - intent field mapped from F3411 operation_mode enum to
    'recreational' | 'commercial' | 'emergency' | 'unknown'
  - Beacon with malformed F3411 frame discarded (no emit, warning logged)
  - operatorLat/operatorLon coarsened to ±50m grid before 'beacon' emit
  - Duplicate beacon (same uasId within 5s) rate-limited: emitted once only

Integration (6):
  - 'beacon' event emitted for each valid F3411 frame (mocked BLE adapter)
  - NATS feed.rf.remote_id published on each 'beacon' event
  - RemoteIdReceiver survives interface bind failure on one interface,
    continues on remaining interfaces
  - uasId in published message is hex-encoded (not raw bytes)
  - altM field is GPS altitude, not barometric (F3411 field selection)
  - Receiver handles rapid burst of 20 beacons/second without dropping
```

### FR-W9-08: Dashboard Live Feed Adapter — P2 Full (16 tests)

```
tests/feeds/FR-W9-08-dashboard-live-feeds.test.ts

RTL Component (6):
  - FeedPanel renders ADS-B aircraft count badge
  - FeedPanel renders active alerts list (level color-coded)
  - FeedPanel renders weather widget: wind speed + direction arrow
  - OSINT event list shows up to 10 most recent events
  - Remote ID panel shows active UAS count (beacons within last 60s)
  - Feed panel updates within 1s of new feed.fused SSE event

Integration (7):
  - GET /api/feed/live returns Content-Type: text/event-stream
  - SSE event 'adsb' delivered when feed.adsb.aircraft message arrives
  - SSE event 'weather' delivered when feed.weather.current message arrives
  - SSE event 'alert' delivered when feed.alerts.active message arrives
  - SSE event 'osint' delivered when feed.osint.events message arrives
  - SSE event 'remoteid' delivered when feed.rf.remote_id message arrives
  - SSE heartbeat sent every 15s when no feed events present

E2E/Journey (3):
  - JOURNEY: Operator opens dashboard, sees live ADS-B aircraft on map
  - JOURNEY: Civil protection alert appears in dashboard within 5s of
    alerts.in.ua update
  - JOURNEY: Detection card shows weather context (wind, visibility)
    alongside acoustic classification result
```

### FR-W9-integration: End-to-End Feed → Enrichment — P2 Full (6 tests)

```
tests/integration/FR-W9-integration-feeds.test.ts

Integration (6):
  - Full pipeline: AdsbExchangeClient poll → DataFeedBroker dedup →
    feed.fused → ThreatContextEnricher → detection.enriched with
    aircraft context attached
  - Full pipeline: OpenMeteoClient poll → feed.fused → detection.enriched
    with weather context attached
  - Full pipeline: CivilProtectionClient poll → feed.fused →
    detection.enriched with active alerts in context
  - Dedup gate: same ADS-B response polled twice → only one feed.fused
    message → enricher ring buffer contains one entry (not two)
  - Feed outage simulation: all five FeedClients return empty for 65s →
    ring buffer fully aged out → next detection enriched with
    context.available=false
  - Privacy gate end-to-end: Remote ID beacon operatorLat/operatorLon in
    detection.enriched is ±50m grid (raw coordinates never appear)
```

### Privacy Regression Extension (3 new W9 cases)

```
tests/privacy/FR-W8-privacy-regression.test.ts  (extended, not new file)

New cases added in W9:
  - ADS-B raw aircraft position not persisted to Supabase
    (ring buffer only, TTL 60s, then discarded)
  - GDELT OsintEvent contains no PII: actor name fields absent from
    stored/published payload
  - Remote ID operator location in detection.enriched and feed.rf.remote_id
    NATS messages is coarsened to ±50m grid; raw F3411 operatorLat/Lon
    never leaves RemoteIdReceiver
```

---

## Test Priority Tiers

```
P0 Smoke   (36 tests)  — must pass before any implementation continues
  FR-W9-01 (18)  ADS-B Exchange Client
  FR-W9-03 (18)  Civil Protection Client

P1 Core    (+56 tests) — must pass before P2 work begins
  FR-W9-02 (14)  Open-Meteo Client
  FR-W9-06 (20)  DataFeedBroker
  FR-W9-07 (18)  ThreatContextEnricher
  FR-W9-04 (12)  GDELT Client (partial: overlaps with OSINT integration)

P2 Full    (+36 tests) — complete coverage
  FR-W9-05 (14)  Remote ID Receiver
  FR-W9-08 (16)  Dashboard Live Feed Adapter
  FR-W9-integration (6) End-to-end feed → enrichment

Privacy regression: +3 cases (added to existing file, not counted in 128)
```

---

## Mocking Strategy

All external HTTP calls use `vi.fn()` mocks. No real network calls in CI.

```
Mocked dependencies:
  fetch (global)              — all HTTP clients (ADS-B, Open-Meteo, ERCC,
                                alerts.in.ua, GDELT)
  node-ble                   — RemoteIdReceiver BLE adapter
  node-wifi-scanner          — RemoteIdReceiver WiFi adapter
  nats (JetStream client)    — DataFeedBroker, ThreatContextEnricher

Test fixtures (files in tests/fixtures/feeds/):
  adsb-lol-response.json     — sample adsb.lol bbox response (10 aircraft)
  open-meteo-response.json   — sample current weather response
  ercc-feed.xml              — sample ERCC CAP-like XML
  alerts-in-ua.json          — sample alerts.in.ua JSON array
  gdelt-response.json        — sample GDELT 2.0 event list
  f3411-beacon.bin           — raw ASTM F3411 BLE frame fixture

Real network calls: manual integration scripts only
  scripts/feeds/test-adsb-live.ts
  scripts/feeds/test-open-meteo-live.ts
  scripts/feeds/test-civil-protection-live.ts
  scripts/feeds/test-gdelt-live.ts
  Not executed in CI. Run manually before field deployment.
```

---

## TDD Protocol

All tests written RED before implementation. Commit format:
```
test(W9): FR-W9-XX — <FR name> RED (N tests)
```

Then implementation:
```
feat(W9): FR-W9-XX — <FR name> GREEN (N tests)
```

Mind-the-gap run after every FR completion. All prior tests must remain green
throughout W9.

---

## Verification Gate

```bash
npx vitest run --coverage          # ≥80% branches/functions/lines/statements
npx playwright test                # E2E journeys (FR-W9-08 journeys)
npm run build                      # TypeScript compile
npx tsc --noEmit                   # Type check
```

All four must pass before wave:complete W9.
