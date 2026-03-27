# APEX-SENTINEL W18 — FR REGISTER
# EU Data Integration Layer

**Wave:** W18
**Status:** PLANNED
**Total FRs:** 8
**Total test target:** 92
**Cumulative test target:** ~3,189 (from 3,097 in W17)

---

## Summary Table

| FR ID      | Title                        | Priority | Status  | Tests | Source File                                  |
|------------|------------------------------|----------|---------|-------|----------------------------------------------|
| FR-W18-01  | EuDataFeedRegistry           | P0       | PLANNED | 12    | src/feeds/eu-data-feed-registry.ts           |
| FR-W18-02  | AircraftPositionAggregator   | P0       | PLANNED | 15    | src/feeds/aircraft-position-aggregator.ts    |
| FR-W18-03  | NotamIngestor                | P0       | PLANNED | 12    | src/feeds/notam-ingestor.ts + notam-parser.ts|
| FR-W18-04  | EasaUasZoneLoader            | P1       | PLANNED | 10    | src/feeds/easa-uas-zone-loader.ts            |
| FR-W18-05  | CriticalInfrastructureLoader | P0       | PLANNED | 12    | src/geo/critical-infrastructure-loader.ts    |
| FR-W18-06  | AtmosphericConditionProvider | P1       | PLANNED | 14    | src/feeds/atmospheric-condition-provider.ts  |
| FR-W18-07  | SecurityEventCorrelator      | P1       | PLANNED | 13    | src/feeds/security-event-correlator.ts       |
| FR-W18-08  | EuDataIntegrationPipeline    | P0       | PLANNED | 14    | src/feeds/eu-data-integration-pipeline.ts    |

---

## FR Details

---

### FR-W18-01: EuDataFeedRegistry

**Status:** PLANNED
**Priority:** P0
**Source file:** `src/feeds/eu-data-feed-registry.ts`
**Test file:** `tests/feeds/FR-W18-01-feed-registry.test.ts`
**Test count target:** 12
**Dependencies:** W15 `CircuitBreaker` (`src/resilience/circuit-breaker.ts`)

**Description:**
Central registry that tracks all EU data feed descriptors and their live health. Each feed registers with a tier (1=critical, 4=optional), a poll interval, and a URL. The registry enforces per-feed rate limiting (token bucket per `pollIntervalMs`) and instantiates a `CircuitBreaker` instance per feed so that flapping feeds are isolated before they propagate failures upstream. Health state is queryable at any time by the pipeline orchestrator (`FR-W18-08`).

**Acceptance criteria:**
- `register(descriptor: FeedDescriptor)` adds the feed and creates a `CircuitBreaker` with default threshold=5, openTimeout=60s.
- `deregister(feedId: string)` removes the feed and its breaker; subsequent `getHealth(feedId)` throws `FeedNotFoundError`.
- `recordSuccess(feedId, latencyMs)` resets error count to 0 and updates `lastSuccessTs`; `recordFailure(feedId)` increments `errorCount` and trips the breaker after 5 consecutive failures.
- `getHealth(feedId)` returns `FeedHealth` with `status` derived: `errorCount===0` → `'healthy'`; `errorCount 1-4` → `'degraded'`; breaker open → `'down'`.
- `getAllHealth()` returns `FeedHealth[]` sorted by tier ascending (tier-1 feeds first).
- Rate-limit enforcement: calling `mayPoll(feedId)` more than once within `pollIntervalMs` returns `false` without throwing.

**Key interfaces:**

```typescript
export interface FeedDescriptor {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4;          // 1=critical ADS-B, 2=NOTAM/zones, 3=weather, 4=OSINT
  pollIntervalMs: number;
  endpoint: string;
}

export interface FeedHealth {
  feedId: string;
  status: 'healthy' | 'degraded' | 'down';
  lastSuccessTs: number;          // epoch ms; 0 if never succeeded
  errorCount: number;
  latencyMs: number;              // rolling average of last 10 successful polls
  circuitState: 'closed' | 'open' | 'half-open';
}

export class FeedNotFoundError extends Error {}
```

**Risks:**
- Concurrent poll calls from multiple async feed loops may race on `mayPoll()` — use a monotonic lastPollTs per feed with a simple timestamp comparison, not a lock.
- If `pollIntervalMs` is set too low (< 1000ms) for external APIs, the rate limiter alone cannot prevent ban; callers must validate against API terms before registering.

---

### FR-W18-02: AircraftPositionAggregator

**Status:** PLANNED
**Priority:** P0
**Source file:** `src/feeds/aircraft-position-aggregator.ts`
**Test file:** `tests/feeds/FR-W18-02-aircraft-position-aggregator.test.ts`
**Test count target:** 15
**Dependencies:** FR-W18-01 `EuDataFeedRegistry`; optional fetch injection for OpenSky / ADS-B Exchange / adsb.fi

**Description:**
Fetches aircraft positions from three live sources — OpenSky Network REST API, ADS-B Exchange `/v2/lat` endpoint, and adsb.fi `/api/0/aircraft` — then merges them into a deduplicated `AircraftState[]`. Deduplication key is ICAO24 hex; when the same aircraft appears across multiple sources, the record with the most recent `lastContact` timestamp wins. All queries are bounding-box filtered to Romania (43.5–48.5°N, 20.2–30.0°E) to reduce payload size. Emits `aircraft:update` events via `EventEmitter`.

**Acceptance criteria:**
- `poll()` fetches from all three sources concurrently (`Promise.allSettled`) and merges results; a single source failure does not abort the merge.
- Deduplication by `icao24` (lowercase, 6-char hex): tie-break by largest `lastContact` epoch value.
- Bounding box filter applied to all sources: `lat ∈ [43.5, 48.5]`, `lon ∈ [20.2, 30.0]`; aircraft outside are silently dropped.
- `AircraftState.source` field is set to `'opensky' | 'adsbexchange' | 'adsbfi'` based on which source provided the winning record.
- Emits `'aircraft:update'` with `AircraftState[]` after each successful merge.
- `getLastSnapshot()` returns the most recent merged array without re-fetching.

**Key interfaces:**

```typescript
export type AircraftSource = 'opensky' | 'adsbexchange' | 'adsbfi';

export interface AircraftState {
  icao24: string;               // 6-char hex, lowercase, e.g. 'a1b2c3'
  callsign: string | null;
  lat: number;
  lon: number;
  altBaro: number | null;       // barometric altitude, metres
  altGeo: number | null;        // geometric altitude, metres
  velocityMs: number | null;    // ground speed m/s
  heading: number | null;       // true track, degrees
  onGround: boolean;
  lastContact: number;          // epoch seconds (OpenSky convention)
  source: AircraftSource;
  squawk: string | null;
}

// Romania bounding box constant (exported for tests)
export const ROMANIA_BBOX = {
  latMin: 43.5, latMax: 48.5,
  lonMin: 20.2, lonMax: 30.0,
} as const;
```

**Risks:**
- OpenSky anonymous tier: 400 req/day. At 15s poll interval = 5,760 req/day. Mitigated by 15-minute server-side cache (see R-W18-01).
- adsb.fi JSON schema is undocumented and has changed once (2024-Q2). Wrap parsing in a `try/catch` that downgrades source to partial on schema mismatch rather than crashing.

---

### FR-W18-03: NotamIngestor

**Status:** PLANNED
**Priority:** P0
**Source file:** `src/feeds/notam-ingestor.ts` + `src/feeds/notam-parser.ts`
**Test file:** `tests/feeds/FR-W18-03-notam-ingestor.test.ts`
**Test count target:** 12
**Dependencies:** FR-W18-01 `EuDataFeedRegistry`; `notam-parser.ts` has no external deps

**Description:**
`NotamIngestor` fetches raw NOTAM strings from the FAA NOTAM API v2 (`https://external-api.faa.gov/notamapi/v2/notams`) for the eight primary Romanian civil and military airports. `NotamParser` decodes the ICAO NOTAM format: extracts the Q-line (qualifier, FIR, NOTAM code, bearing, radius, lower/upper altitude) and E-line (free-text description), then emits `NotamRestriction[]` as GeoJSON-compatible polygons (circle approximated as 32-point polygon) with `validFrom` / `validTo` UTC timestamps. Restrictions are filtered to those intersecting Romanian airspace.

**Acceptance criteria:**
- `NotamIngestor.fetch()` queries all 8 ICAO codes (`LROP`, `LRCL`, `LRTR`, `LRCK`, `LRBS`, `LRIA`, `LRSB`, `LRTM`) in a single batched request or parallel individual requests; total fetch completes within 10s or throws `NotamFetchTimeoutError`.
- `NotamParser.parse(rawNotamString)` returns `NotamRestriction` for valid Q+E line input; throws `NotamParseError` for malformed input.
- Q-line bearing/radius correctly maps to a GeoJSON `Polygon` (32-point circle approximation, haversine-based); a 5 NM radius at LROP (44.5722°N, 26.1025°E) produces a polygon whose point at bearing 0° is within 10m of the expected position.
- `validFrom` and `validTo` parsed from the B/C lines as UTC `Date` objects; expired NOTAMs (validTo < now) are filtered out from `getActive()` results.
- `NotamRestriction.affectedAirport` set to the ICAO code from the matching fetch request.
- `NotamParser` is a pure function module with no I/O — all external calls are isolated in `NotamIngestor`.

**Key interfaces:**

```typescript
// notam-parser.ts
export interface NotamQLine {
  fir: string;                  // e.g. 'LRBB'
  notamCode: string;            // e.g. 'QRTCA' (restricted area)
  bearing: number | null;       // degrees from reference
  radius: number | null;        // nautical miles
  lowerAltFt: number;           // ft AMSL
  upperAltFt: number;           // ft AMSL
}

export interface NotamRestriction {
  id: string;                   // NOTAM number, e.g. 'A1234/26'
  affectedAirport: string;      // ICAO code, e.g. 'LROP'
  qLine: NotamQLine;
  eLine: string;                // raw free-text description
  validFrom: Date;
  validTo: Date;
  geometry: GeoJsonPolygon;     // 32-point approximation circle
}

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: [number, number][][];   // [[lon, lat], ...]
}

export class NotamParseError extends Error {}
export class NotamFetchTimeoutError extends Error {}
```

**Romanian airports covered:**
| ICAO | Airport | Coordinates |
|------|---------|-------------|
| LROP | Henri Coandă (Bucharest) | 44.5722°N 26.1025°E |
| LRCL | Cluj-Napoca International | 46.7852°N 23.6862°E |
| LRTR | Traian Vuia (Timișoara) | 45.8099°N 21.3379°E |
| LRCK | Mihail Kogălniceanu (Constanța) | 44.3622°N 28.4883°E |
| LRBS | Băneasa–Aurel Vlaicu | 44.5032°N 26.1021°E |
| LRIA | Iași International | 47.1785°N 27.6206°E |
| LRSB | Sibiu International | 45.7856°N 24.0913°E |
| LRTM | Transilvania (Târgu Mureș) | 46.4677°N 24.4125°E |

**Risks:**
- FAA NOTAM API v2 replaced v1 in 2023 with a breaking schema change. Parser is isolated in `notam-parser.ts`; contract tests use hardcoded NOTAM strings to detect future drift. See R-W18-02.
- Romanian NOTAM authority (ROMATSA) publishes via LRBB FIR. FAA API covers LRBB via bilateral ICAO agreement but may have propagation lag of 15–30 min.

---

### FR-W18-04: EasaUasZoneLoader

**Status:** PLANNED
**Priority:** P1
**Source file:** `src/feeds/easa-uas-zone-loader.ts`
**Test file:** `tests/feeds/FR-W18-04-easa-uas-zone-loader.test.ts`
**Test count target:** 10
**Dependencies:** FR-W18-01 `EuDataFeedRegistry`; fetch injection for drone.rules.eu API

**Description:**
Loads U-space airspace zones from the `drone.rules.eu` OpenAPI endpoint filtered to Romania (`country=RO`). Zones are classified per EU Regulation 2021/664 (U-space) and EU Regulation 2019/945 (UAS categories) into four operational categories: `RESTRICTED` (UAS operations prohibited without specific authorisation), `PROHIBITED` (absolute exclusion, e.g. nuclear, military), `CONDITIONAL` (requires pre-flight GAFOR/notification), and `CTR` (Control Zone, coordination required with ATC). The loader caches zones for 24 hours locally to survive API outages.

**Acceptance criteria:**
- `load()` fetches zones from `https://drone.rules.eu/api/v1/zones?country=RO` and returns `EasaUasZone[]`.
- Zone classification: `uSpaceClass=A` → `'PROHIBITED'`; `uSpaceClass=B` → `'RESTRICTED'`; `uSpaceClass=C` or `uSpaceClass=D` → `'CONDITIONAL'`; zones tagged `type=CTR` → `'CTR'`.
- `getActiveZones(lat, lon)` returns all zones whose GeoJSON geometry contains the given point (point-in-polygon using ray-casting).
- Cached zones are served when the API returns a non-2xx response; cache TTL is 24h from last successful fetch.
- Fallback: if cache is also empty (first boot, no API), `load()` returns a hardcoded list of 12 baseline Romanian exclusion zones (3 airports + Cernavodă + Deveselu + Kogălniceanu airspace + 7 Bucharest CTR sectors).
- `EasaUasZone.regulationRef` field populated: `'EU 2021/664'` for U-space zones, `'EU 2019/945'` for category-specific.

**Key interfaces:**

```typescript
export type UasZoneCategory = 'RESTRICTED' | 'PROHIBITED' | 'CONDITIONAL' | 'CTR';

export interface EasaUasZone {
  id: string;                   // drone.rules.eu zone identifier
  name: string;
  category: UasZoneCategory;
  geometry: GeoJsonPolygon;     // from API response
  lowerAltFt: number;
  upperAltFt: number;
  regulationRef: string;        // e.g. 'EU 2021/664 Art.3'
  country: 'RO';
  cachedAt: number;             // epoch ms of last successful API fetch
}
```

**Risks:**
- `drone.rules.eu` is a third-party aggregator (DroneRules project), not official EASA infrastructure. See R-W18-04.
- Point-in-polygon for complex GeoJSON multipolygons (e.g. Bucharest CTR with exclusions) requires correct winding-order handling. Use the even-odd ray-casting algorithm; validate against known test point (44.43°N 26.10°E is inside LROP CTR).

---

### FR-W18-05: CriticalInfrastructureLoader

**Status:** PLANNED
**Priority:** P0
**Source file:** `src/geo/critical-infrastructure-loader.ts`
**Test file:** `tests/geo/FR-W18-05-critical-infrastructure-loader.test.ts`
**Test count target:** 12
**Dependencies:** FR-W18-01 `EuDataFeedRegistry` (for OSM Overpass queries); hardcoded fallback coordinates require no deps

**Description:**
Queries the OSM Overpass API (`https://overpass-api.de/api/interpreter`) for critical Romanian infrastructure across four categories: civil airports (`aeroway=aerodrome`), nuclear power plants (`power=plant` + `generator:source=nuclear`), military installations (`landuse=military`), and government buildings (`building=government`, Bucharest city polygon). Each result is enriched with an `exclusionRadiusM` based on asset type and emitted as a `ProtectedZone`. Hardcoded fallback entries for Cernavodă, Deveselu, and Mihail Kogălniceanu ensure availability even when OSM is unreachable.

**Acceptance criteria:**
- `loadAll()` executes 4 Overpass queries for the Romania bounding box and merges results into `ProtectedZone[]`.
- Default exclusion radii: `'airport'` → 5000m, `'nuclear'` → 10000m, `'military'` → 3000m, `'government'` → 500m.
- `isInsideProtectedZone(lat, lon)` returns the nearest `ProtectedZone` if the point is within `exclusionRadiusM` (haversine), or `null` if outside all zones.
- Hardcoded coordinates guaranteed present regardless of OSM response:
  - Cernavodă NPP: 44.3283°N 28.0563°E, radius 10000m, type `'nuclear'`
  - Deveselu ABM Base: 44.0917°N 24.3597°E, radius 3000m, type `'military'`
  - Mihail Kogălniceanu Air Base: 44.3622°N 28.4883°E, radius 5000m, type `'military'`
- Overpass query timeout set to 30s; partial results accepted if at least one category returns data.
- `ProtectedZone.osmId` is `null` for hardcoded entries; populated for OSM-sourced entries.

**Key interfaces:**

```typescript
export type InfrastructureType = 'airport' | 'nuclear' | 'military' | 'government';

export interface ProtectedZone {
  id: string;                   // uuid v4
  osmId: string | null;         // OSM node/way/relation ID; null for hardcoded
  name: string;
  type: InfrastructureType;
  lat: number;
  lon: number;
  exclusionRadiusM: number;
  country: 'RO';
}
```

**Key Romanian hardcoded zones:**

| Name | Type | Lat | Lon | Radius |
|------|------|-----|-----|--------|
| Cernavodă NPP | nuclear | 44.3283°N | 28.0563°E | 10,000m |
| Deveselu (MIM-104 Patriot) | military | 44.0917°N | 24.3597°E | 3,000m |
| Mihail Kogălniceanu AB | military | 44.3622°N | 28.4883°E | 5,000m |
| LROP Henri Coandă | airport | 44.5722°N | 26.1025°E | 5,000m |
| Bucharest Government District | government | 44.4379°N | 26.0975°E | 500m |

**Risks:**
- OSM military data for Deveselu and Kogălniceanu may be intentionally incomplete or mislocated; hardcoded coordinates from verified open sources (Google Earth + Wikipedia) override OSM for these two sites.
- Overpass API public instance rate-limits aggressive queries; space queries at least 2s apart and use `[out:json][timeout:30]` pragma.

---

### FR-W18-06: AtmosphericConditionProvider

**Status:** PLANNED
**Priority:** P1
**Source file:** `src/feeds/atmospheric-condition-provider.ts`
**Test file:** `tests/feeds/FR-W18-06-atmospheric-condition-provider.test.ts`
**Test count target:** 14
**Dependencies:** Existing `src/feeds/open-meteo-client.ts`; fetch injection for OpenWeatherMap

**Description:**
Merges atmospheric data from two sources: the existing open-meteo client (primary, unlimited free tier) and OpenWeatherMap free tier (secondary, 1000 req/day). Both sources query a single representative point for Romania (Bucharest: 44.4268°N, 26.1025°E) with a 5-minute server-side cache. The merged output is `DroneFlightConditions`, which includes raw meteorological values and a computed `flyabilityScore` (0–100). The scoring model applies three deductions: wind > 10 m/s → −40pts; precipitation > 1 mm/h → −30pts; visibility < 1,000m → −30pts. A drone is operationally grounded (`flyabilityScore < 20`) when any two conditions trigger simultaneously.

**Acceptance criteria:**
- `getConditions()` returns `DroneFlightConditions` with all four raw fields populated.
- `flyabilityScore` starts at 100; deductions are cumulative and floor at 0. Scores verified: `wind=5, rain=0, vis=5000` → score 100; `wind=12, rain=0, vis=5000` → score 60; `wind=12, rain=2, vis=800` → score 0.
- Cache TTL: 300s; subsequent calls within TTL return cached object without fetching.
- When OpenWeatherMap is unavailable, `wind_ms` and `visibility_m` use open-meteo values; `precipitation_mm` falls back to open-meteo `precipitation` field.
- When open-meteo is unavailable, provider falls back to OpenWeatherMap exclusively; if both fail, `getConditions()` returns last cached value, or throws `AtmosphericDataUnavailableError` if cache is empty.
- `flyabilityScore` exposed as a numeric field (not a string label) so callers can apply their own thresholds.

**Key interfaces:**

```typescript
export interface DroneFlightConditions {
  visibility_m: number;         // metres; 10000m = unlimited reported visibility
  wind_ms: number;              // m/s at 10m height
  precipitation_mm: number;     // mm/hour
  temperature_c: number;
  flyabilityScore: number;      // 0-100; 100=perfect, 0=grounded
  source: 'openmeteo' | 'openweathermap' | 'merged' | 'cache';
  ts: number;                   // epoch ms of observation
}

export class AtmosphericDataUnavailableError extends Error {}
```

**Flyability scoring table:**

| Condition | Threshold | Deduction |
|-----------|-----------|-----------|
| Wind speed | > 10 m/s | −40 pts |
| Precipitation | > 1 mm/h | −30 pts |
| Visibility | < 1,000m | −30 pts |

**Risks:**
- OpenWeatherMap free tier (1,000 req/day) is consumed only as secondary; with 5-minute cache, actual consumption is max 288 req/day per provider instance — well within limit.
- open-meteo `precipitation` field is hourly accumulated, not instantaneous; divide by polling interval fraction to approximate mm/h when using fine-grained intervals.

---

### FR-W18-07: SecurityEventCorrelator

**Status:** PLANNED
**Priority:** P1
**Source file:** `src/feeds/security-event-correlator.ts`
**Test file:** `tests/feeds/FR-W18-07-security-event-correlator.test.ts`
**Test count target:** 13
**Dependencies:** FR-W18-05 `CriticalInfrastructureLoader` (ProtectedZone[] for proximity); existing `src/feeds/gdelt-client.ts`

**Description:**
Aggregates security-relevant events from three open sources: ACLED Southeast Europe dataset (requires free API key; armed conflict events), NASA FIRMS thermal anomaly API (fire/explosion signatures, no auth), and GDELT 2.0 event stream filtered to Romania via `ActionGeo_CountryCode=RO`. For each event, haversine distance to every `ProtectedZone` is computed; events within 50km of a protected zone are tagged with `distanceToNearestZoneKm` and `affectedZoneId`. Emits `SecurityEvent[]` on each poll cycle.

**Acceptance criteria:**
- `poll()` fetches from ACLED, FIRMS, and GDELT concurrently (`Promise.allSettled`); a single source failure reduces the result set but does not abort the cycle.
- Haversine proximity filter: events within 50km of any `ProtectedZone` are included in output; events beyond 50km are discarded.
- `SecurityEvent.distanceToNearestZoneKm` is the minimum haversine distance across all `ProtectedZone` entries.
- `SecurityEvent.source` is `'acled' | 'firms' | 'gdelt'`.
- ACLED is skipped gracefully when `ACLED_API_KEY` env var is absent; GDELT is used as no-auth fallback automatically.
- Events older than 72 hours are filtered out from `getRecentEvents()`.

**Key interfaces:**

```typescript
export type SecurityEventSource = 'acled' | 'firms' | 'gdelt';

export interface SecurityEvent {
  id: string;                            // uuid v4
  source: SecurityEventSource;
  lat: number;
  lon: number;
  ts: number;                            // epoch ms of event
  eventType: string;                     // raw category from source (e.g. 'Battles', 'Wildfire', 'PROTEST')
  description: string;
  distanceToNearestZoneKm: number;
  affectedZoneId: string | null;         // ProtectedZone.id of nearest zone, or null if > 50km
}
```

**Risks:**
- ACLED API requires researcher registration (free, 1–2 day approval). GDELT fills this gap immediately with no auth. See R-W18-07.
- FIRMS thermal data includes natural fires; filter by `confidence >= 80` (FIRMS `confidence` field) to reduce false positives from agricultural burning, which is common in Muntenia/Bărăgan plain during summer.

---

### FR-W18-08: EuDataIntegrationPipeline

**Status:** PLANNED
**Priority:** P0
**Source file:** `src/feeds/eu-data-integration-pipeline.ts`
**Test file:** `tests/feeds/FR-W18-08-eu-data-integration-pipeline.test.ts`
**Test count target:** 14
**Dependencies:** All FR-W18-01 through FR-W18-07; EventEmitter; W16 `SystemHealthDashboard`

**Description:**
Orchestrates all seven W18 feed modules in a single start/stop lifecycle. On each poll cycle (configurable `cycleIntervalMs`, default 30s), the pipeline collects outputs from all feeds, assembles `EuSituationalPicture`, and emits it on the `'situation:update'` event. Individual feed failures are tolerated: the pipeline continues with partial data and marks failed feeds `'down'` in the `FeedHealth[]` dashboard. The health dashboard score contribution from W18 feeds integrates into the existing W16 `SystemHealthDashboard` via `FeedClientStatus[]`. Emits `'pipeline:error'` when more than 4 of 7 feeds are simultaneously down (catastrophic degradation).

**Acceptance criteria:**
- `start()` initialises all 7 feed modules and begins the poll cycle; `stop()` clears the interval and calls `shutdown()` on each feed.
- `EuSituationalPicture` is emitted after every cycle even if some feeds returned stale or empty data.
- `getFeedHealth()` returns `FeedHealth[]` (from FR-W18-01 registry) for all 7 feeds.
- If ≥ 4 feeds simultaneously return errors in one cycle, emits `'pipeline:error'` with reason `'catastrophic_degradation'` and falls back to last-known-good `EuSituationalPicture`.
- `getLastPicture()` returns the most recent `EuSituationalPicture` synchronously; returns `null` before first successful cycle.
- `start()` is idempotent — calling it twice does not create duplicate intervals.

**Key interfaces:**

```typescript
export interface EuSituationalPicture {
  ts: number;                            // epoch ms of assembly
  aircraft: AircraftState[];             // from FR-W18-02
  activeNotams: NotamRestriction[];      // from FR-W18-03
  uasZones: EasaUasZone[];              // from FR-W18-04
  protectedZones: ProtectedZone[];       // from FR-W18-05
  atmosphericConditions: DroneFlightConditions; // from FR-W18-06
  securityEvents: SecurityEvent[];       // from FR-W18-07
  feedHealth: FeedHealth[];             // from FR-W18-01
  dataCompleteness: number;             // 0.0-1.0; fraction of feeds healthy
}
```

**Risks:**
- A cascade where all 7 feeds timeout simultaneously blocks the cycle for `cycleIntervalMs`. Mitigate by wrapping each feed poll in `Promise.race([feedPoll(), timeout(5000)])` and treating timeout as a feed failure.
- Memory growth if `EuSituationalPicture` accumulates large `aircraft[]` arrays (ADSB Exchange returns ~8,000 European aircraft). Bounding box filter in FR-W18-02 limits Romanian airspace to ~150–400 aircraft under normal conditions.
