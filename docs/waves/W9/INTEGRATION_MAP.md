# W9 — INTEGRATION_MAP
Wave 9: Live Data Feed Integration | APEX-SENTINEL | 2026-03-26

---

## W9 Feed Consumption

| Feed Output | Internal Consumer | Notes |
|---|---|---|
| `feed.fused` | ThreatContextEnricher | Primary enrichment trigger |
| `feed.fused` | DemoDashboardApi (via LiveFeedAdapter) | SSE stream feed_state |
| `feed.fused` | W15 AWNING Publisher (future) | Planned W15 consumer |
| `detection.enriched` | DemoDashboardApi | Enriched detection overlay on map |
| `detection.enriched` | Supabase writer (detection_enriched table) | Persistence |
| `feed.broker.health` | Monitoring / alerting | Feed health dashboard |

---

## External APIs

| API | Endpoint | Auth | Rate Limit | Latency |
|---|---|---|---|---|
| adsb.lol | `GET /v2/lat/{lat}/lon/{lon}/dist/{dist}` | None | Unspecified (monitor) | <2s |
| open-meteo.com | `GET /v1/forecast?latitude={lat}&longitude={lon}&current=...` | None | Free, generous | 1-15min data |
| alerts.in.ua | `GET /api/v3/alerts/active` | None | Unspecified | <30s |
| api.gdeltproject.org | `GET /api/v2/geo/geo?query=...&format=json&timespan=15min&bbox={bbox}` | None | None documented | 15min |
| BLE/Wi-Fi (libpcap / noble) | Local hardware interface | OS-level, requires monitor mode | N/A | Real-time |

---

## NATS Subjects Added (W9)

| Subject | Type | Publisher | Subscriber(s) |
|---|---|---|---|
| `feed.adsb.aircraft` | JetStream | AdsbExchangeClient | DataFeedBroker, ThreatContextEnricher |
| `feed.weather.current` | JetStream | OpenMeteoClient | DataFeedBroker, ThreatContextEnricher |
| `feed.alerts.active` | JetStream | CivilProtectionClient | DataFeedBroker, ThreatContextEnricher |
| `feed.osint.events` | JetStream | GdeltClient | DataFeedBroker, ThreatContextEnricher |
| `feed.rf.remote_id` | JetStream | RemoteIdReceiver | DataFeedBroker, ThreatContextEnricher |
| `feed.fused` | JetStream | DataFeedBroker | DemoDashboardApi, W15 AWNING (future) |
| `feed.broker.health` | Core (no persistence) | DataFeedBroker | Monitoring |
| `detection.enriched` | JetStream | ThreatContextEnricher | DemoDashboardApi, Supabase writer |

**Pre-existing subjects (W1-W8, not modified):**

| Subject | Publisher | Notes |
|---|---|---|
| `detection.*` | SentinelPipeline | W9 subscribes to this as trigger |
| `acoustic.*` | AcousticProfileLibrary | Unchanged |
| `rf.*` | RF pipeline | Unchanged |

---

## Supabase Tables Added (W9)

| Table | Writer | Reader(s) | Retention |
|---|---|---|---|
| `feed_adsb_snapshots` | AdsbExchangeClient (via service role) | ThreatContextEnricher (via service role) | 4h rolling |
| `feed_weather_snapshots` | OpenMeteoClient (via service role) | ThreatContextEnricher (via service role) | 4h rolling |
| `feed_alerts_active` | CivilProtectionClient (via service role) | ThreatContextEnricher, anonymous REST | Until valid_until |
| `feed_osint_events` | GdeltClient (via service role) | ThreatContextEnricher (via service role) | 24h rolling |
| `detection_enriched` | ThreatContextEnricher (via service role) | DemoDashboardApi, W13 training pipeline | Cascade with detections |

**Pre-existing tables used by W9 (read-only access, no schema changes):**

| Table | W9 Access | Purpose |
|---|---|---|
| `detections` | SELECT (detection_id FK) | Foreign key for detection_enriched |

---

## Data Flow Diagram

```
External APIs
    │
    ├── adsb.lol ──────────────────► AdsbExchangeClient
    ├── open-meteo.com ─────────────► OpenMeteoClient
    ├── alerts.in.ua ───────────────► CivilProtectionClient
    ├── gdeltproject.org ───────────► GdeltClient
    └── BLE/Wi-Fi hardware ─────────► RemoteIdReceiver
                                            │
                                            ▼
                                     DataFeedBroker
                                      │         │
                              feed.fused      feed.broker.health
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
           DemoDashboardApi  ThreatContext   W15 AWNING
           (LiveFeedAdapter)  Enricher       (W15 future)
                  │               │
              SSE stream    detection.enriched
           (feed_state)           │
                          ┌───────┴────────┐
                          ▼               ▼
                   Supabase          DemoDashboard
               detection_enriched    (overlay)
```

---

## W10 Extension Points

W10 will extend this integration map by:
- Adding `feed.osint.nlp` subject (GDELT NLP enrichment layer)
- Adding `feed.social.telegram` subject (Telegram monitoring)
- Adding `feed.corroboration` subject (multi-source convergence score)
- All existing W9 subjects remain unchanged

---

## Dependency Matrix

| Module | Depends On | Depended On By |
|---|---|---|
| AdsbExchangeClient | NATS, HTTP client, adsb.lol | DataFeedBroker |
| OpenMeteoClient | NATS, HTTP client, open-meteo.com | DataFeedBroker |
| CivilProtectionClient | NATS, HTTP client, alerts.in.ua | DataFeedBroker |
| GdeltClient | NATS, HTTP client, gdeltproject.org | DataFeedBroker |
| RemoteIdReceiver | NATS, noble/libpcap (or mock) | DataFeedBroker |
| DataFeedBroker | All 5 feed clients, NATS | ThreatContextEnricher, DemoDashboardApi |
| ThreatContextEnricher | DataFeedBroker (in-memory), Supabase (feed tables), NATS | DemoDashboardApi, Supabase writer |
| LiveFeedAdapter | DataFeedBroker (feed.fused subscription) | DemoDashboardApi |
| DemoDashboardApi | LiveFeedAdapter, ThreatContextEnricher (detection.enriched) | SSE clients (browser) |
