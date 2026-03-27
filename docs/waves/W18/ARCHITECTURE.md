# APEX-SENTINEL W18 — ARCHITECTURE

## Wave: EU Data Integration Layer

---

## Component Map

```
src/feeds/
├── eu-data-feed-registry.ts       FR-W18-01  Registry + health + rate limiting
├── aircraft-position-aggregator.ts FR-W18-02  OpenSky + ADS-BX + adsb.fi merge
├── notam-ingestor.ts              FR-W18-03  EAD NOTAM parser → GeoJSON
├── easa-uas-zone-loader.ts        FR-W18-04  drone.rules.eu U-space zones
├── critical-infrastructure-loader.ts FR-W18-05 OSM Overpass → ProtectedZone[]
├── atmospheric-condition-provider.ts FR-W18-06 open-meteo + OWM merge
├── security-event-correlator.ts   FR-W18-07  ACLED + FIRMS + GDELT correlate
└── eu-data-integration-pipeline.ts FR-W18-08  Orchestrator + health dashboard

src/geo/
├── haversine.ts                   Geodesic distance, bearing calculation
├── point-in-polygon.ts            GeoJSON polygon containment check
└── romania-bbox.ts                Canonical bbox constant + subregion helpers
```

---

## Full Data Flow Diagram

```
 EXTERNAL SOURCES              W18 FEED LAYER               W9 BROKER / W17 ENGINES
 ══════════════                ══════════════               ═══════════════════════

 OpenSky Network API  ─────┐
 https://opensky-network.org│  AircraftPosition            DataFeedBroker (W9)
 bbox=43.5,20.2,48.5,30.0  ├─►  Aggregator   ──────────►  NATS: feed.eu.aircraft
                            │  (FR-W18-02)                       feed.eu.aircraft.emergency
 ADS-B Exchange API ───────┘                              ThreatContextEnricher (W9)
 https://adsbexchange.com/api                              → enriches detections with
                                                           cooperative track context
 adsb.fi API ──────────────►  (backup source, same ^)

 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─

 EAD Basic API ─────────────►  NotamIngestor ────────────►  NATS: feed.eu.notam.active
 notams.aim.faa.gov or EAD     (FR-W18-03)                       feed.eu.notam.expired
 ICAO NOTAM format             GeoJSON polygons
                               R/P/D/W types

 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─

 EASA drone.rules.eu ────────► EasaUasZone   ────────────►  NATS: feed.eu.uas_zones
 U-space zone API              Loader                        In-memory: UasZone[]
 EU 2021/664                   (FR-W18-04)                   Query API: /zones/at?lat&lon&alt

 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─

 OSM Overpass API ───────────► CriticalInfra ────────────►  NATS: feed.eu.protected_zones
 overpass-api.de               Loader                        In-memory: ProtectedZone[]
 airports/nuclear/military     (FR-W18-05)                   Query API: /zones/breach?icao24

 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─

 open-meteo API ────────────┐
 api.open-meteo.com         ├─► Atmospheric  ────────────►  NATS: feed.eu.atmosphere
 Bucharest 44.43N 26.10E    │  Condition                         feed.eu.flyability
                            │  Provider
 OpenWeatherMap API ────────┘  (FR-W18-06)
 api.openweathermap.org        DroneFlightConditions
                               flyabilityScore 0-100

 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─

 ACLED API ─────────────────┐
 api.acleddata.com          │
 SE Europe bbox             ├─► SecurityEvent ───────────►  NATS: feed.eu.security_events
                            │  Correlator                        feed.eu.security_alerts
 FIRMS/NASA API ────────────┤  (FR-W18-07)               ThreatContextEnricher (W9)
 firms.modaps.eosdis.nasa.gov│  proximity scoring          AwningComputeEngine (W10)
                            │  vs ProtectedZone[]          → can elevate to AWNING YELLOW
 GDELT GEO API ─────────────┘
 api.gdeltproject.org

 ═══════════════════════════════════════════════════════════════

                    EuDataFeedRegistry (FR-W18-01)
                    ┌──────────────────────────────┐
                    │ FeedRegistration {           │
                    │   id, name, tier,            │
                    │   pollIntervalMs,            │
                    │   tokenBucket,               │
                    │   circuitBreaker,            │
                    │   lastPollTs,                │
                    │   consecutiveErrors          │
                    │ }                            │
                    └──────────────────────────────┘
                    Monitored by:
                    EuDataIntegrationPipeline (FR-W18-08)
                    SystemHealthDashboard (W16 FR-W16-03)
                    DashboardApiServer (W14 FR-W14-07) /api/feeds/health
```

---

## Module Dependency Graph

```
eu-data-integration-pipeline.ts (FR-W18-08)
  ├── eu-data-feed-registry.ts (FR-W18-01)
  ├── aircraft-position-aggregator.ts (FR-W18-02)
  │     └── eu-data-feed-registry.ts
  ├── notam-ingestor.ts (FR-W18-03)
  │     └── eu-data-feed-registry.ts
  │     └── geo/point-in-polygon.ts
  ├── easa-uas-zone-loader.ts (FR-W18-04)
  │     └── eu-data-feed-registry.ts
  │     └── geo/point-in-polygon.ts
  ├── critical-infrastructure-loader.ts (FR-W18-05)
  │     └── eu-data-feed-registry.ts
  │     └── geo/haversine.ts
  │     └── geo/romania-bbox.ts
  ├── atmospheric-condition-provider.ts (FR-W18-06)
  │     └── eu-data-feed-registry.ts
  │     └── (re-uses OpenMeteoClient from W9 with new coords)
  └── security-event-correlator.ts (FR-W18-07)
        └── eu-data-feed-registry.ts
        └── geo/haversine.ts
        └── (extends GdeltClient from W9 with Romania focus)

geo/haversine.ts        — standalone, no deps
geo/point-in-polygon.ts — standalone, no deps
geo/romania-bbox.ts     — standalone, no deps
```

No circular dependencies. All W18 modules depend only on:
- W18 siblings (one-way)
- W9 existing clients (composition, not inheritance)
- `node:events`, `node:crypto` (stdlib)
- `geo/` utilities (new in W18)

---

## NATS Subject Namespace (W18)

W18 adds the `feed.eu.*` subtree to the existing `feed.*` namespace:

```
feed.eu.aircraft              AircraftState[]  — deduped, merged, every 15s
feed.eu.aircraft.emergency    AircraftState[]  — squawk 7500/7600/7700 only
feed.eu.aircraft.zone_breach  ZoneBreachEvent  — aircraft enters ProtectedZone
feed.eu.notam.active          NotamRestriction[] — all active NOTAMs
feed.eu.notam.expired         NotamRestriction[] — just-expired NOTAMs
feed.eu.uas_zones             UasZone[]        — EASA U-space zones
feed.eu.protected_zones       ProtectedZone[]  — critical infrastructure zones
feed.eu.atmosphere            DroneFlightConditions — weather composite
feed.eu.flyability            FlyabilityScore  — 0-100 score + breakdown
feed.eu.security_events       SecurityEvent[]  — ACLED+FIRMS+GDELT correlated
feed.eu.security_alerts       SecurityAlert    — proximity breach to protected zone
feed.eu.feed_health           FeedHealthReport — all feed statuses
```

Existing W9 subjects (`feed.adsb.*`, `feed.weather.*`, `feed.osint.*`) remain unchanged. W18 subjects are additive.

---

## Circuit Breaker State Machine (per feed)

```
          ┌─────────────────────────────────┐
          │           CLOSED                │  ← normal operation
          │  allow all requests             │
          └─────────────┬───────────────────┘
                        │ 3 consecutive errors
                        ▼
          ┌─────────────────────────────────┐
          │            OPEN                 │  ← feed failing
          │  block all requests             │
          │  use last-known-good cache      │
          └─────────────┬───────────────────┘
                        │ 30s cooldown
                        ▼
          ┌─────────────────────────────────┐
          │         HALF-OPEN               │  ← probe one request
          │  allow 1 probe request          │
          └─────────────┬───────────────────┘
               success  │  failure
                 ┌───────┤
                 ▼       ▼
              CLOSED   OPEN (reset timer)
```

Thresholds configurable per feed via `EuDataFeedRegistry.register(feedConfig)`.
Default: `errorThreshold: 3`, `cooldownMs: 30_000`, `halfOpenMaxRequests: 1`.

---

## Feed Tier Timing Architecture

```
Timeline (seconds)
0    10   20   30   40   50   60  ... 300  ... 1800
|    |    |    |    |    |    |        |        |

OpenSky ──────────────────────────────────────────── (every 10s)
ADS-BX       ─────────────────────────────────────── (every 15s)
adsb.fi           ───────────────────────────────── (every 20s)
EAD NOTAM ──────────────────────────────────────── (every 5min = 300s)
EASA Zones  ────────────────────────────────────── (every 5min)
OSM Infra   ──────────────────────────────────────  (once at boot, refresh 24h)
OpenMeteo   ────────────────────────────────────── (every 5min)
OWM         ────────────────────────────────────── (every 5min, offset +30s)
ACLED                    ──────────────────────── (every 30min = 1800s)
FIRMS                         ─────────────────── (every 30min, offset +5min)
GDELT                              ──────────────  (every 30min, offset +10min)
```

Offsets prevent thundering herd on the 5-minute and 30-minute boundaries.

---

## Deduplication Architecture (AircraftPositionAggregator)

```
Poll Cycle (every 15s):

 OpenSky response → AircraftState[] (source: 'opensky')
 ADS-BX response  → AircraftState[] (source: 'adsbexchange')
 adsb.fi response → AircraftState[] (source: 'adsbfi')
         │
         ▼
 Build merge map: Map<icao24, AircraftState>
         │
         ├─ For each aircraft in all 3 responses:
         │    if icao24 not in map → add
         │    if icao24 in map:
         │      if incoming.lastSeen > existing.lastSeen → update
         │      else → discard (older record)
         │
         ▼
 Emit: AircraftState[] (deduplicated, most-recent source wins)
 Publish to NATS: feed.eu.aircraft
```

Position precision: stored to 5 decimal places (≈1m accuracy). Logged to 4 decimal places (≈11m, per GDPR data minimisation).

---

## GeoJSON Zone Containment Check

Used by NotamIngestor, EasaUasZoneLoader, CriticalInfrastructureLoader, SecurityEventCorrelator.

```typescript
// geo/point-in-polygon.ts — ray casting algorithm
// Input: GeoJSON Polygon or MultiPolygon coordinates, [lon, lat] point
// Output: boolean
// O(n) where n = number of edges in polygon ring
// Handles holes (exterior ring first, interior rings subtract)
```

For circular zones (CriticalInfrastructureLoader), uses `haversine.ts` distance check instead of polygon containment. Performance: <0.5ms per check for typical Romanian NOTAM polygon (20–200 vertices).

---

## Memory Architecture

```
Component                     Peak Memory     Strategy
─────────────────────────────────────────────────────────
AircraftPositionAggregator    ~2MB            Map<icao24, AircraftState> ~800 aircraft
NotamIngestor                 ~500KB          ~300 active NOTAMs × 1.5KB avg
EasaUasZoneLoader             ~5MB            ~2000 U-space zones × 2.5KB avg
CriticalInfrastructureLoader  ~200KB          ~500 OSM features (cached)
AtmosphericConditionProvider  ~10KB           Single DroneFlightConditions object
SecurityEventCorrelator       ~1MB            24h rolling buffer ~500 events
EuDataFeedRegistry            ~50KB           ~20 feed registrations
geo/ utilities                <1KB            Stateless functions
─────────────────────────────────────────────────────────
W18 TOTAL                     ~9MB            Well within W16 50MB DataFeedBroker budget
```

---

## Integration Points with W1–W17

| W18 Component | W1–W17 Integration | Mechanism |
|---------------|-------------------|-----------|
| AircraftPositionAggregator | ThreatContextEnricher (W9 FR-W9-05) | NATS feed.eu.aircraft subscription |
| AircraftPositionAggregator | DataFeedBroker (W9 FR-W9-06) | FeedClient interface implementation |
| NotamIngestor | OperatorAlertRouter (W1) | SecurityEvent with type=NOTAM_BREACH |
| EasaUasZoneLoader | Dashboard (W14) | /api/eu/uas-zones REST endpoint |
| CriticalInfrastructureLoader | AwningComputeEngine (W10) | ZoneBreachEvent → AWNING escalation |
| AtmosphericConditionProvider | replaces OpenMeteoClient config (W9) | coords updated to Bucharest |
| SecurityEventCorrelator | ThreatContextEnricher (W9) | SecurityEvent enriches detections |
| EuDataIntegrationPipeline | SystemHealthDashboard (W16) | feed.eu.feed_health → system.health |
| All W18 feeds | NodeRegistry (W1) | feed health contributes to node score |

---

## No W1–W17 Source Modifications

W18 achieves zero modifications to existing source files through:
1. **Dependency injection**: all W18 classes accept optional `httpClient` parameter (same pattern as W9 clients)
2. **NATS subject extension**: new `feed.eu.*` subjects, no changes to `feed.*` subscribers
3. **FeedClient interface**: W18 aggregators implement the existing `FeedClient` interface from `data-feed-broker.ts`
4. **Config-only change**: OpenMeteoClient coordinates updated via constructor argument in `eu-data-integration-pipeline.ts` instantiation, not in `open-meteo-client.ts` source

---

## Error Handling Strategy

```
Level 1 — HTTP errors:
  4xx → log + circuit breaker +1 error count
  429 → honour Retry-After header, circuit breaker OPEN immediately
  5xx → retry with exponential backoff (200ms, 400ms, 800ms), then OPEN

Level 2 — Parse errors:
  NOTAM parse failure → skip that NOTAM, log warning, continue
  GeoJSON parse failure → discard response, use cached data
  JSON parse failure → discard, increment parse_error counter

Level 3 — Feed complete failure:
  Circuit OPEN → emit FeedHealthReport with state=OPEN
  Use last-known-good cache (max age configurable, default 5min for T1, 1h for T2)
  If OpenSky + ADS-BX both OPEN → fall through to adsb.fi
  If all 3 ADS-B OPEN → emit feed.eu.aircraft.emergency with staleness flag

Level 4 — EuDataIntegrationPipeline:
  If ≥ 2 Tier-1 feeds OPEN → publish system.health DEGRADED
  If all Tier-1 feeds OPEN → publish system.health CRITICAL
  SecurityEventCorrelator can run on Tier-3 data alone without Tier-1
```
