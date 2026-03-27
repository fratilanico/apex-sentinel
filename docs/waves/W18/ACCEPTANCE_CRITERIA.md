# APEX-SENTINEL W18 — ACCEPTANCE CRITERIA
# EU Data Integration Layer
# Wave: W18 | Status: INIT | Date: 2026-03-27

---

## Overview

This document defines the acceptance criteria for all 8 Functional Requirements in W18.
Each FR is expressed as Given/When/Then scenarios with quantified performance gates,
data quality thresholds, failure mode tolerance requirements, and GDPR compliance gates.

All criteria are testable via the Vitest test suite in `tests/feeds/`.

---

## FR-W18-01: EuDataFeedRegistry

### Purpose
Central registry of all EU open-source data feeds. Tracks feed metadata, health status,
rate-limit budgets, and provides service-discovery for the integration pipeline.

### AC-W18-01-01: Feed Registration
**Given** a new feed adapter is instantiated with a valid FeedDescriptor
**When** `registry.register(descriptor)` is called
**Then**
- Feed appears in `registry.list()` with status `INITIALISING`
- Feed has a unique `feedId` (UUID v4)
- `registeredAt` timestamp is within 100ms of call time
- `registry.getById(feedId)` returns the descriptor without error

### AC-W18-01-02: Feed Health Tracking
**Given** a registered feed has been polled at least 3 times
**When** `registry.getHealth(feedId)` is called
**Then**
- `successRate` is calculated as (successCount / totalPolls) * 100
- `lastSuccessAt` reflects the most recent successful poll timestamp
- `consecutiveFailures` count is accurate and monotonically resets on any success
- `status` transitions: `HEALTHY` (successRate >= 80%), `DEGRADED` (50-79%), `DOWN` (< 50%)

### AC-W18-01-03: Rate Limit Budget Enforcement
**Given** a feed has a configured `dailyRequestLimit` (e.g. OpenSky anonymous tier: 400/day)
**When** the budget tracker is queried after N requests
**Then**
- `budgetUsed` equals N
- `budgetRemaining` equals `dailyRequestLimit - N`
- When `budgetRemaining` reaches 0, `canRequest()` returns `false`
- Budget resets to full at UTC midnight (86400s window)
- No request is made when budget is exhausted; `FeedStatus.QUOTA_WAIT` is set

**Performance gate:** `registry.canRequest(feedId)` resolves in < 1ms (synchronous budget check).

### AC-W18-01-04: Registry Dashboard
**Given** 8+ feeds are registered
**When** `registry.getDashboard()` is called
**Then**
- Returns an object with `totalFeeds`, `healthyFeeds`, `degradedFeeds`, `downFeeds`
- `overallHealth` is a 0-100 score: (healthyFeeds / totalFeeds) * 100
- Dashboard generation completes in < 50ms even with 20 registered feeds
- Each feed entry includes: `feedId`, `name`, `status`, `successRate`, `budgetRemaining`

### AC-W18-01-05: Feed Deregistration and Cleanup
**Given** a feed is registered and actively polled
**When** `registry.deregister(feedId)` is called
**Then**
- Feed is removed from `registry.list()` within 100ms
- Any in-flight requests for that feed are allowed to complete (not aborted mid-request)
- Budget tracking state for that feed is cleared from memory
- Subsequent calls to `registry.getById(feedId)` return `null`

**Integration test requirement:** Registry must function with 0 feeds, 1 feed, and 15 feeds
without memory leaks. Heap growth must be < 10MB over 1000 register/deregister cycles.

---

## FR-W18-02: AircraftPositionAggregator

### Purpose
Merges ADS-B aircraft position data from three sources (OpenSky Network, ADS-B Exchange,
adsb.fi), deduplicates by ICAO24 hex address, and emits a unified AircraftState stream
covering Romanian airspace.

### AC-W18-02-01: Multi-Source Parallel Merge
**Given** OpenSky, ADS-B Exchange, and adsb.fi adapters all return data for the same time window
**When** `aggregator.fetchPositions(ROMANIA_BBOX)` is called
**Then**
- All three sources are queried in parallel (not sequentially)
- Results from all three are merged into a single `AircraftState[]` array
- Total elapsed time for the merged result is < 2000ms (hard 2-second gate)
- No duplicate ICAO24 entries exist in the output (deduplicated by `icao24` hex)
- When conflict exists, the source with the most recent `positionTimestamp` wins

**Performance gate:** 3-source parallel merge covering Romania bounding box in < 2s wall clock.

### AC-W18-02-02: ICAO24 Deduplication Logic
**Given** OpenSky returns `{icao24: "4b1816", lat: 44.430, lon: 26.110, ts: 1710000010}`
**And** ADS-B Exchange returns `{icao24: "4b1816", lat: 44.431, lon: 26.112, ts: 1710000015}`
**When** the aggregator deduplicates the merged set
**Then**
- Only one `AircraftState` for `icao24 = "4b1816"` exists in the output
- The retained record has `positionTimestamp: 1710000015` (most recent wins)
- `sources` field on the retained record lists both `["opensky", "adsbexchange"]`
- The `conflictCount` metric on the aggregator increments by 1 for this cycle

### AC-W18-02-03: Single-Source Fallback
**Given** OpenSky returns HTTP 429 (rate limit exceeded) or times out after 5s
**And** ADS-B Exchange is healthy
**When** aggregator fetches positions
**Then**
- Aggregator returns results from the healthy sources only (does not throw or crash)
- `partialResult: true` flag is set on the AggregationResult
- `failedSources: ["opensky"]` is listed in the result metadata
- OpenSky adapter status in the registry transitions to `DEGRADED`
- Result is returned within the 2s gate using only the responding sources

### AC-W18-02-04: Staleness Filtering
**Given** an aircraft position record has `positionTimestamp` older than 60 seconds from now
**When** the aggregator processes the batch
**Then**
- The stale record is excluded from the output `AircraftState[]`
- `staleDropped` counter increments by 1 for each excluded record
- A record exactly 60s old is excluded (boundary condition: >= 60s is stale)
- A record 59s old is retained

**Data quality threshold:** Maximum allowable position age = 60 seconds. Records older than
this are operationally meaningless for real-time airspace monitoring and must be discarded.

### AC-W18-02-05: Romania Bounding Box Geographic Filter
**Given** raw ADS-B data includes aircraft over Ukraine, Hungary, Bulgaria, and Black Sea
**When** the aggregator applies the geographic filter
**Then**
- Only aircraft within Romania bounding box are retained:
  `lat in [43.618, 48.265]`, `lon in [20.261, 29.757]`
- Aircraft exactly on the boundary coordinates are included (inclusive bounds)
- Aircraft 0.001 degrees outside the boundary on any side are excluded
- The geographic filter adds < 5ms latency to the merge pipeline

### AC-W18-02-06: GDPR — No Individual Flight Path Storage
**Given** the aggregator processes 1000 position updates for ICAO24 "4b1816" over 24 hours
**When** a GDPR audit is performed on the aggregator's persistent outputs
**Then**
- No database table receives more than the most recent position per ICAO24
- Historical position sequences (flight paths) are not written to any persistent store
- In-memory dedup cache evicts entries after 300 seconds (5 minutes)
- No PII (passenger data, owner name, registration N-number) is fetched or stored
- Log output retains ICAO24 (aircraft technical identifier, not personal data per ICAO doc)
- Aircraft registration data from any lookup API is never stored or logged

---

## FR-W18-03: NotamIngestor

### Purpose
Ingests NOTAM (Notice to Air Missions) data covering the LRBB FIR (Bucharest FIR,
covering all Romanian airspace) via the FAA NOTAM Search API. Parses ICAO-format NOTAMs
into structured `NotamRestriction` objects. Uses 15-minute cache TTL.

### AC-W18-03-01: LRBB FIR Coverage via FAA API
**Given** the FAA NOTAM API is available at `https://api.faa.gov/notamSearch/notams`
**When** `ingestor.fetchActive("LRBB")` is called
**Then**
- HTTP GET is issued with `icaoLocation=LRBB` as a query parameter
- API key is included in `client_id` and `client_secret` headers per FAA OAuth2 spec
- Response is parsed and returns a `NotamRestriction[]` array
- Each restriction includes: `notamId`, `location`, `effectiveFrom`, `effectiveTo`,
  `type`, `altitude`, `geometry` (where parseable), `rawText`
- Mandatory fields (`notamId`, `location`, `effectiveFrom`, `rawText`) are non-null for
  every returned NOTAM
- Fetch completes in < 5 seconds

### AC-W18-03-02: ICAO NOTAM Text Parsing — Standard Format
**Given** a raw NOTAM string in standard ICAO format:
```
A0123/26 NOTAMN
Q) LRBB/QWMLW/IV/M/W/000/060/4426N02608E005
A) LROP B) 2603271200 C) 2603271800
E) DRONE OPERATIONS PROHIBITED WITHIN 5NM RADIUS
```
**When** `parser.parse(rawText)` is called
**Then**
- `notamId` = `"A0123/26"`
- `location` = `"LROP"`
- `effectiveFrom` = ISO 8601 `"2026-03-27T12:00:00Z"`
- `effectiveTo` = ISO 8601 `"2026-03-27T18:00:00Z"`
- `type` = `"DRONE_RESTRICTION"`
- `radius_nm` = `5` (extracted from Q-line 5-char lat/lon suffix "005" = 5NM)
- `center` = `{ lat: 44.433, lon: 26.133 }` (decoded from `4426N02608E`)
- `rawText` is preserved verbatim without modification

**Performance gate:** Parse 100 NOTAM strings in < 200ms total.

### AC-W18-03-03: Cache TTL Enforcement
**Given** NOTAMs are fetched from FAA API at T=0 and stored in cache
**When** a second call to `ingestor.fetchActive("LRBB")` is made at T < 15 minutes
**Then**
- No HTTP request is issued to the FAA API
- Cached result is returned immediately
- Log entry includes `[NOTAM_CACHE_HIT]` marker with cache age in seconds
**When** a second call is made at T >= 15 minutes
**Then**
- Fresh HTTP request is issued to FAA API
- Cache is updated with the new result and a new 15-minute TTL
- Log entry includes `[NOTAM_CACHE_REFRESH]` marker

### AC-W18-03-04: API Failure Graceful Degradation
**Given** the FAA NOTAM API returns HTTP 503 or times out after 10 seconds
**When** `ingestor.fetchActive("LRBB")` is called
**Then**
- If cache contains unexpired data: returns cached data with `stale: true` flag set
- If cache is empty or expired: returns `{ notams: [], error: "FAA_API_UNAVAILABLE", stale: false }`
- No exception is thrown to the caller; a valid response object is always returned
- The feed's `consecutiveFailures` count increments in the registry

### AC-W18-03-05: Affected Protected Zone Intersection
**Given** a NOTAM restricts airspace within 5NM of Henri Coanda (LROP) below FL060
**When** `ingestor.getAffectedZones(notam, protectedZones)` is called
**Then**
- The NOTAM is associated with `protectedZoneId: "LROP"` in the output
- `affectsProtectedZone: true` is set on the NotamRestriction
- `threatLevel` is elevated to `HIGH` for any restriction overlapping a protected zone
- NOTAMs not geometrically intersecting any protected zone have `affectsProtectedZone: false`

**Data quality threshold:** NOTAM parsing must succeed for >= 90% of well-formed ICAO NOTAMs.
Malformed NOTAMs missing mandatory fields are logged with `[NOTAM_PARSE_SKIP]` and omitted
from results — never thrown as exceptions.

---

## FR-W18-04: EasaUasZoneLoader

### Purpose
Loads UAS geographic zones from the EASA drone.rules.eu API covering Romania. Zones define
where UAS operations are restricted, prohibited, or conditionally authorised under EU U-space
regulation (Commission Delegated Regulation (EU) 2019/945 and EU 2021/664).

### AC-W18-04-01: Romania Zone Fetch from drone.rules.eu
**Given** the drone.rules.eu API is available at `https://drone-rules.eu/api/v1/zones`
**When** `loader.loadZones({ countryCode: "RO" })` is called
**Then**
- HTTP GET is issued with `country=RO` query parameter
- Response is parsed into `EasaUasZone[]`
- Each zone has: `zoneId`, `name`, `type` (one of `PROHIBITED`, `RESTRICTED`, `CONDITIONAL`),
  `uSpaceClass` (one of `A`, `B`, `C`, `D`, `OPEN`),
  `geometry` (GeoJSON Polygon or Circle object),
  `lowerLimit_ft`, `upperLimit_ft`, `reason`, `country: "RO"`
- Zones covering Henri Coanda Airport (LROP), Cluj-Napoca Airport (LRCL), and
  Timisoara Airport (LRTR) are present in the response

### AC-W18-04-02: GeoJSON Polygon Validity Checks
**Given** a zone is returned with a GeoJSON Polygon geometry type
**When** the loader validates the geometry
**Then**
- Polygon ring is closed (first coordinate pair equals last coordinate pair)
- All coordinate pairs are within Romania extended bounding box with +/- 2-degree buffer:
  `lat in [41.6, 50.3]`, `lon in [18.3, 31.8]`
- Polygon has at least 4 coordinate pairs (3 unique vertices + closing vertex = minimum)
- Self-intersecting polygons are flagged with `geometryWarning: "SELF_INTERSECTING"`,
  retained in results, and a warning is logged — they are not rejected

### AC-W18-04-03: Circle Zone Normalisation
**Given** a zone is defined as a circle (center lat/lon + radius in meters)
**When** the loader normalises the geometry representation
**Then**
- Circle is stored as `{ type: "Circle", center: { lat: number, lon: number }, radius_m: number }`
- `radius_m` is a positive integer and must be <= 50000 (50km; beyond that a polygon is expected)
- `approximatePolygon(points: 32)` returns a valid GeoJSON Polygon with 33 coordinates (32 + close)
- The maximum deviation of any approximated polygon vertex from the true circle is < 0.1% of `radius_m`

### AC-W18-04-04: 24-Hour Cache with SHA-256 Checksum Validation
**Given** zones were fetched and cached at T=0 with SHA-256 checksum of the raw response body
**When** `loader.loadZones({ countryCode: "RO" })` is called at T < 24 hours
**Then**
- Cached zones are returned without any network request
- Cache entry carries: `fetchedAt`, `checksum`, `zoneCount`, `countryCode`
**When** called at T >= 24 hours
**Then**
- Fresh fetch is performed from drone.rules.eu
- If new response checksum differs from cached: cache is updated, `zonesUpdated` event
  is emitted carrying `{ previous: number, current: number, delta: number }` zone count diff
- If checksums match: cache TTL is renewed without emitting an event

### AC-W18-04-05: UAS Category Filtering
**Given** the pipeline requests only zones relevant to authorised UAS categories
**When** `loader.loadZones({ countryCode: "RO", uSpaceClass: ["B", "C", "D"] })` is called
**Then**
- Only zones requiring authorisation for Cat-B, Cat-C, or Cat-D are returned
- Open-category (Cat-A / `uSpaceClass: "OPEN"`) zones are excluded from the filtered set
- Filtering is applied in-memory post-fetch and adds < 10ms latency

**Integration test requirement:** Loader must handle an empty response body (country has no
published zones) by returning `[]` without throwing, logging `[EASA_ZONES_EMPTY]`.

---

## FR-W18-05: CriticalInfrastructureLoader

### Purpose
Loads critical infrastructure locations from OpenStreetMap via the Overpass API covering
Romanian airspace. Airports, nuclear facilities, NATO bases, power plants, and government
districts form the `ProtectedZone[]` set used by breach detection across all waves.

### AC-W18-05-01: Overpass API Query Execution
**Given** the Overpass API endpoint at `https://overpass-api.de/api/interpreter`
**When** `loader.loadForRomania()` is called
**Then**
- Overpass QL query targets Romania bounding box: south=43.618, west=20.261, north=48.265, east=29.757
- Query includes all relevant tags:
  `aeroway=aerodrome`, `man_made=nuclear`, `military=airfield`, `military=base`,
  `power=plant`, `amenity=townhall` (with admin_level=2 filter), `landuse=military`
- Response is parsed into `ProtectedZone[]`
- Each zone has: `zoneId`, `name`, `type`, `center`, `radius_m`, `threatMultiplier`, `source: "OSM"`
- Load completes in < 10 seconds (Overpass typical p95 response time for Romania bbox)

### AC-W18-05-02: Mandatory Romanian Critical Sites Must Be Present
**Given** OSM data for Romania is reasonably current
**When** `loader.loadForRomania()` returns results
**Then** the following named sites are found (case-insensitive substring match on `name` field):
- `"Henri Coanda"` or `"Aeroportul International Henri Coanda"` or `"LROP"` — Otopeni
- `"Cluj-Napoca International"` or `"LRCL"` — Cluj airport
- `"Traian Vuia"` or `"LRTR"` — Timisoara airport
- `"Kogalniceanu"` or `"Mihail Kogalniceanu"` or `"LRCK"` — NATO air base, Constanta
- `"Cernavoda"` — nuclear power plant, Danube
- `"Deveselu"` — NATO Aegis Ashore missile defense site

**Data quality threshold:** A minimum of 6 named critical sites must be returned. If fewer
than 6 are found, `InsufficientInfrastructureDataError` is thrown with the count and names
found. This signals an Overpass connectivity or query failure, not an empty-result scenario.

### AC-W18-05-03: Threat Multiplier Assignment by Infrastructure Type
**Given** infrastructure sites are classified by OSM tags
**When** `loader.assignThreatMultipliers(zones)` processes the list
**Then** `threatMultiplier` values are assigned per type:
- `type: "nuclear"` -> `threatMultiplier: 5.0` (Cernavoda NPP)
- `type: "military_nato"` -> `threatMultiplier: 4.0` (LRCK/Deveselu)
- `type: "military"` -> `threatMultiplier: 3.5`
- `type: "airport_international"` -> `threatMultiplier: 3.0` (LROP, LRCL, LRTR)
- `type: "airport_regional"` -> `threatMultiplier: 2.0`
- `type: "power_plant"` -> `threatMultiplier: 2.5`
- `type: "government_district"` -> `threatMultiplier: 2.0`
- `type: "critical_unclassified"` -> `threatMultiplier: 1.5`
- No zone may have `threatMultiplier < 1.0` or `threatMultiplier > 5.0`

### AC-W18-05-04: Overpass API Fallback to Bundled Static Cache
**Given** the Overpass API is unavailable (timeout > 30s or returns HTTP 5xx)
**When** `loader.loadForRomania()` is called
**Then**
- Loader falls back to bundled static GeoJSON at `src/geo/romania-critical-infra-cache.geojson`
- The static cache is the output of the last successful Overpass fetch, committed to the repo
- Returned zones carry `source: "OSM_CACHE"` and `cacheDate: string` (ISO 8601)
- No exception propagates to the caller; fallback is transparent
- Log entry includes `[OVERPASS_FALLBACK]` with cache date and zone count

### AC-W18-05-05: Default Radius Assignment for OSM Nodes
**Given** an OSM node element (point geometry) has no polygon area or explicit radius tag
**When** the loader converts it to a ProtectedZone
**Then** `radius_m` is assigned by inferred type:
- International airports (ICAO code 4 chars starting with LR): `radius_m: 5000` (5km CTR inner)
- Regional airports (ICAO code present, non-LR prefix): `radius_m: 3000`
- Nuclear plants: `radius_m: 3000`
- NATO military bases: `radius_m: 2500`
- Other military sites: `radius_m: 2000`
- Power plants: `radius_m: 1000`
- Government buildings: `radius_m: 500`
- All defaults are validated: `radius_m > 0` and `radius_m <= 20000`

---

## FR-W18-06: AtmosphericConditionProvider

### Purpose
Fetches wind, visibility, precipitation, cloud ceiling, and weather codes from Open-Meteo
(primary, free, no API key required) and OpenWeatherMap (secondary, requires OPENWEATHER_API_KEY).
Computes a `flyabilityScore` (0-100) indicating suitability for UAS operations.

### AC-W18-06-01: Open-Meteo Primary Fetch
**Given** Open-Meteo API is available at `https://api.open-meteo.com/v1/forecast`
**When** `provider.getCurrent({ lat: 44.4268, lon: 26.1025 })` is called (Bucharest coords)
**Then**
- HTTP GET includes parameters: `latitude=44.4268`, `longitude=26.1025`,
  `current=wind_speed_10m,wind_gusts_10m,precipitation,cloud_cover,visibility,weather_code`
- Response is parsed into an `AtmosphericConditions` object
- All fields populated: `windSpeed_ms`, `windGust_ms`, `precipitation_mmh`,
  `cloudCover_pct`, `visibility_m`, `weatherCode`, `fetchedAt`, `source: "open-meteo"`
- Fetch completes in < 3 seconds

### AC-W18-06-02: Flyability Score Computation Rules
**Given** the following atmospheric conditions:
- Wind speed: 8 m/s (sustained), gust: 12 m/s
- Precipitation: 0 mm/h
- Cloud ceiling: 800m AGL (estimated from cloud_cover 85% + weather_code)
- Visibility: 5000m
**When** `provider.computeFlyabilityScore(conditions)` is called
**Then**
- Returned score is a number in the closed interval [0, 100]
- Wind penalty applies: sustained > 10 m/s -> score capped at 60; > 15 m/s -> capped at 30
- Gust penalty applies: gusts > 15 m/s -> additional -10 from wind penalty cap
- Precipitation penalty: any rain (> 0 mm/h) -> score capped at 70; heavy rain > 5 mm/h -> capped at 40
- Visibility penalty: < 1500m -> score capped at 40; < 500m -> capped at 10
- Ceiling penalty: < 300m AGL -> score capped at 30; < 150m -> capped at 10
- For the stated test conditions, score must land in [55, 75] (moderately flyable)

**Flyability score bands (returned as `flyabilityLabel`):**
- 80-100: `EXCELLENT` — VFR, light winds, standard operations
- 60-79: `GOOD` — manageable for trained pilots, brief operations
- 40-59: `MARGINAL` — caution required, experienced operators only
- 20-39: `POOR` — not recommended, safety risk
- 0-19: `PROHIBITED` — unsafe, severe weather event

### AC-W18-06-03: OpenWeatherMap Fallback
**Given** Open-Meteo returns HTTP 5xx or times out after 5 seconds
**When** `provider.getCurrent({ lat, lon })` is called
**Then**
- Provider automatically retries against OpenWeatherMap:
  `https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}&units=metric`
- OWM response is normalised to the same `AtmosphericConditions` interface
- `source: "openweathermap"` is set on the returned object
- No exception propagates to the caller
- If both sources fail: returns `{ error: "ALL_WEATHER_SOURCES_DOWN", flyabilityScore: null }`

### AC-W18-06-04: Cache Freshness Check
**Given** atmospheric data was fetched at T=0 and cached
**When** `provider.isFresh(conditions)` is called at T=12 minutes
**Then** returns `true` (within 15-minute weather cache TTL)
**When** called at T=16 minutes
**Then** returns `false` — data is stale, re-fetch is required on next poll cycle

### AC-W18-06-05: Multi-Point Batch Fetch for Romanian Airports
**Given** the pipeline requests conditions for 6 Romanian airports simultaneously:
LROP (44.5711, 26.0850), LRCL (46.7850, 23.6862), LRTR (45.8099, 21.3379),
LRCK (44.3622, 28.4883), LRSB (45.7856, 24.0912), LROD (47.0253, 21.9025)
**When** `provider.getBatch([{lat,lon}, ...])` is called with 6 coordinate pairs
**Then**
- All 6 weather requests are issued in parallel (Promise.allSettled)
- All 6 `AtmosphericConditions` objects are returned in the same order as input
- Total elapsed time is < 5 seconds (parallel; not 6 x 3s = 18s sequential)
- If any single location fetch fails: that entry carries `{ error: string }` field; others are unaffected
- Batch result includes `batchCompletedAt` and `successCount` / `failureCount` summary fields

**Data quality threshold:** Wind speed values must be >= 0 m/s. Negative or null wind speed
values are rejected, a `[WEATHER_DATA_CORRUPT]` log entry is written, and the last known
good value (or 0 if none) is substituted. This substitution is flagged in `dataQualityFlags`.

---

## FR-W18-07: SecurityEventCorrelator

### Purpose
Ingests security-relevant events from ACLED (armed conflict data, SEE region),
NASA FIRMS (thermal anomalies and fire detections), and GDELT (global event database
queried for Romania). Correlates events against protected zone proximity to produce
scored `SecurityEvent` outputs.

### AC-W18-07-01: ACLED Romania/SEE Ingest
**Given** ACLED API is available at `https://api.acleddata.com/acled/read`
**When** `correlator.fetchAcledEvents({ country: "Romania", daysBack: 30 })` is called
**Then**
- HTTP GET issued with: `country=Romania`, `limit=500`,
  `fields=event_id_cnty,event_date,event_type,sub_event_type,actor1,location,
  latitude,longitude,fatalities,notes`, `key={ACLED_API_KEY}`, `email={ACLED_EMAIL}`
- Response parsed into `SecurityEvent[]`
- Each event has: `eventId`, `source: "ACLED"`, `type`, `subType`, `lat`, `lon`,
  `occurredAt`, `severity`, `description`, `fatalities`
- Severity mapping applied:
  - `fatalities > 0` -> `severity: HIGH`
  - `event_type` contains `"Explosions"` or `"Remote violence"` -> `severity: HIGH`
  - `event_type` contains `"Battles"` -> `severity: HIGH`
  - `event_type` contains `"Violence against civilians"` -> `severity: MEDIUM`
  - `event_type` contains `"Protests"` -> `severity: LOW`
  - `event_type` contains `"Strategic developments"` -> `severity: LOW`
  - Unmapped types -> `severity: MEDIUM`

### AC-W18-07-02: NASA FIRMS Thermal Anomaly Ingest
**Given** FIRMS MAP_KEY is set and WFS endpoint available:
`https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/{BBOX}/1`
**When** `correlator.fetchFirmsAnomalies({ bbox: ROMANIA_BBOX, dayRange: 1 })` is called
**Then**
- API returns VIIRS SNPP NRT (Near Real Time) thermal anomaly CSV for 1-day window
- Each anomaly row is parsed into a `SecurityEvent` with:
  `source: "FIRMS"`, `type: "THERMAL_ANOMALY"`, `lat`, `lon`, `occurredAt`
  (from `acq_date` + `acq_time`), `brightness` (FRP in megawatts or brightness temp in Kelvin)
- Severity mapping:
  - `brightness > 400` -> `severity: HIGH`
  - `brightness >= 350` -> `severity: MEDIUM`
  - `brightness < 350` -> `severity: LOW`
- FIRMS records with `acq_date` older than 24 hours from now are excluded

### AC-W18-07-03: GDELT Romania Query
**Given** GDELT API is available at `https://api.gdeltproject.org/api/v2/events/query`
**When** `correlator.fetchGdeltEvents({ location: "Romania", daysBack: 7 })` is called
**Then**
- Query URL includes: `query=Romania&format=json&maxrecords=250&startdatetime={7daysAgo}&mode=artlist`
- Events parsed into `SecurityEvent[]` with `source: "GDELT"`
- `goldstein_scale` field is retained on each event
- Events with `goldstein_scale < -5.0` (highly destabilising) -> `severity: HIGH`
- Events with `goldstein_scale` in [-5.0, -2.0] -> `severity: MEDIUM`
- Events with `goldstein_scale > -2.0` -> `severity: LOW`
- Events with `num_mentions > 100` receive `significance: HIGH` flag
- Duplicate events (same `globaleventid`) are deduplicated before returning

### AC-W18-07-04: Protected Zone Proximity Correlation
**Given** a `SecurityEvent` at a given lat/lon and a `ProtectedZone[]` set
**When** `correlator.correlateWithZones(event, protectedZones)` is called
**Then**
- Haversine distance is computed from the event point to each zone center
- If distance <= zone.radius_m * 2.0 (double-radius threat buffer):
  `proximalZone` field is populated with the nearest zone's `zoneId` and `name`
- If distance <= zone.radius_m (inside zone boundary): `insideZone: true` is set
- `threatScore = event.baseSeverityScore * zone.threatMultiplier`
  where baseSeverityScore: HIGH=3.0, MEDIUM=2.0, LOW=1.0
- Events with `threatScore >= 8.0` trigger emission of `ELEVATED_THREAT` on correlator
- Events with `threatScore >= 12.0` trigger emission of `CRITICAL_THREAT`

### AC-W18-07-05: Cross-Source Deduplication and Confidence Scoring
**Given** ACLED, FIRMS, and GDELT all independently report what appears to be the same incident
(e.g. a large protest near LROP appearing in all three data sources)
**When** the correlator merges the three source streams
**Then**
- Events within 500m distance AND within 60 minutes of each other from different sources
  are merged into a single event
- Merged event carries `sources: ["ACLED", "GDELT"]` (all contributing source names)
- Confidence scoring: single-source = 0.50, two-source agreement = 0.75, three-source = 0.95
- Merged event appears exactly once in the output (not as separate records)
- `mergedFrom: number` field records how many source events were combined

**Performance gate:** Correlate 500 events against 20 protected zones in < 500ms.
Haversine computation must not use external geospatial libraries for this calculation
(pure TypeScript implementation with Math.sin/cos/atan2 for zero-dependency operation).

---

## FR-W18-08: EuDataIntegrationPipeline

### Purpose
Orchestrates all W18 feed adapters. Manages scheduled polling cycles. Publishes unified
`eu.data.*` NATS subjects downstream to detection and correlation engines. Provides a
real-time health dashboard. Handles graceful degradation when individual feeds fail.

### AC-W18-08-01: Pipeline Startup Sequence
**Given** all 8 feed adapters are configured with valid API credentials and endpoints
**When** `pipeline.start()` is called
**Then**
- All adapters are initialised in parallel using Promise.allSettled (not sequential await)
- Registry shows all feeds as `INITIALISING` during the startup window
- Within 30 seconds, all feeds transition to `HEALTHY` or `DEGRADED` (no feed remains `INITIALISING`)
- `pipeline.isReady()` returns `true` only when >= 5 of 8 feeds are in `HEALTHY` or `DEGRADED` state
- `pipeline.started` event is emitted carrying `{ readyFeeds, degradedFeeds, downFeeds, startupDuration_ms }`

### AC-W18-08-02: Scheduled Polling Intervals
**Given** the pipeline is in RUNNING state
**When** the internal scheduler fires each feed's poll cycle
**Then** each feed is polled at its configured interval:
- AircraftPositionAggregator: every 30 seconds
- NotamIngestor: every 15 minutes (900 seconds)
- EasaUasZoneLoader: every 24 hours (86400 seconds)
- CriticalInfrastructureLoader: every 72 hours (259200 seconds)
- AtmosphericConditionProvider: every 15 minutes (900 seconds)
- SecurityEventCorrelator (ACLED): every 5 minutes (300 seconds)
- SecurityEventCorrelator (FIRMS): every 5 minutes (300 seconds)
- SecurityEventCorrelator (GDELT): every 10 minutes (600 seconds)
- Intervals are measured from the END of the previous successful poll, not from the START
  (prevents drift accumulation over long runtimes)

### AC-W18-08-03: NATS Subject Publication
**Given** a feed poll cycle returns new data
**When** the pipeline publishes results to the NATS bus
**Then** data is published to the following subjects:
- Aircraft positions -> `eu.data.aircraft.positions` (payload: `AircraftState[]`, JSON encoded)
- Active NOTAMs -> `eu.data.notam.active` (payload: `NotamRestriction[]`)
- EASA UAS zones -> `eu.data.zones.uas` (payload: `EasaUasZone[]`)
- Critical infrastructure -> `eu.data.infra.critical` (payload: `ProtectedZone[]`)
- Atmospheric conditions -> `eu.data.weather.conditions` (payload: `AtmosphericConditions[]`)
- Security events -> `eu.data.security.events` (payload: `SecurityEvent[]`)
- Each published message carries headers: `publishedAt` (ISO 8601), `pipelineVersion` (semver),
  `recordCount` (integer), `feedSource` (string)

### AC-W18-08-04: Graceful Degradation Under Feed Failures
**Given** 3 of 8 feeds simultaneously enter the `DOWN` state (e.g. API outages)
**When** `pipeline.getStatus()` is called
**Then**
- Pipeline remains in `RUNNING` mode (does not halt or throw) when >= 5 feeds are functional
- `pipelineStatus: "DEGRADED"` is set when 3-4 feeds are `DOWN`
- `pipelineStatus: "CRITICAL"` is set when 5+ feeds are `DOWN`
- `pipelineStatus: "FAILED"` is set only when ALL feeds are `DOWN` (system unusable)
- Each polling cycle skips `DOWN` feeds and logs `[FEED_SKIPPED feedId=X reason=Y]`
- When a previously-DOWN feed recovers (returns a successful response): it is automatically
  included in the next poll cycle without any pipeline restart

### AC-W18-08-05: Health Dashboard Output
**Given** the pipeline has been running for >= 5 minutes
**When** `pipeline.getHealthDashboard()` is called
**Then**
- Returns an object with all of the following fields populated:
  `pipelineStatus`, `uptime_s`, `totalFeeds`, `healthyFeeds`, `degradedFeeds`,
  `downFeeds`, `lastPollAt`, `nextPollAt`, `totalRecordsPublished`, `feeds: FeedHealth[]`
- `uptime_s` is accurate to within 1 second of actual elapsed time since `start()`
- `totalRecordsPublished` is a cumulative counter since pipeline start, never reset mid-run
- Each `FeedHealth` entry includes: `feedId`, `name`, `status`, `successRate`,
  `consecutiveFailures`, `lastSuccessAt`, `budgetRemaining`
- Dashboard object is generated in < 100ms regardless of feed count

### AC-W18-08-06: Graceful Shutdown Sequence
**Given** the pipeline is running and actively polling
**When** `pipeline.stop()` is called
**Then**
- No new poll cycles are initiated after `stop()` is called (scheduler is cancelled immediately)
- In-flight poll requests already underway are allowed to complete up to a 10-second timeout
- All feed adapters have their `.close()` or `.stop()` method called sequentially
- `pipeline.stopped` event is emitted within 15 seconds of the `stop()` call
- All `setInterval` and `setTimeout` handles are cleared (no dangling timers)
- All event listener registrations are removed (no dangling listeners)
- `pipeline.isReady()` returns `false` after stop completes

---

## Cross-Cutting Acceptance Criteria

### GDPR Compliance (Applies to All FRs)

**AC-GDPR-01: No Personal Data in Aircraft Position Records**
- ICAO24 hex codes are retained (aircraft technical identifier; not personal data per ICAO Annex 10)
- Aircraft registration (tail number / N-number) is never fetched, stored, or logged
- No owner, operator identity, passenger manifest, or origin/destination data is processed

**AC-GDPR-02: 24-Hour Retention Limit for Cat-A UAS Position Data**
- Position records for Category A UAS (< 250g, no Remote ID required) are stored for max 24 hours
- An automated TTL mechanism (or scheduled purge) deletes records older than 86400 seconds
- Flight path history (position sequences) is never persisted; only the latest position per ICAO24
  is kept in the in-memory dedup cache with a 5-minute eviction TTL

**AC-GDPR-03: Security Event Data Minimisation**
- From ACLED: only `event_id_cnty`, `event_type`, `latitude`, `longitude`, `event_date`,
  `fatalities` are stored. Individual actor names (person names) are NOT persisted.
- From GDELT: only `globaleventid`, `goldstein_scale`, `num_mentions`, coordinates, and date stored.
  No article text, source URL, or actor names are persisted.
- From FIRMS: only location, date, brightness, and confidence level are stored.

**AC-GDPR-04: Article 22 Automated Decision Explainability**
- Any automated threat score that causes an alert to be raised must be explainable
- `SecurityEvent.explanation` is a required non-null string field in all output events
- Explanation must name the specific contributing factors:
  which zone was threatened, the proximity distance, the source severity, and the multiplier applied
- Example: `"ACLED HIGH-severity event 437m inside Cernavoda NPP zone (5.0x multiplier) -> threatScore 15.0"`

### Performance Gates Summary

| FR | Operation | Performance Gate |
|----|-----------|-----------------|
| W18-01 | `canRequest()` budget check | < 1ms (synchronous) |
| W18-01 | `getDashboard()` with 20 feeds | < 50ms |
| W18-02 | 3-source parallel position merge | < 2000ms wall clock |
| W18-02 | Geographic filter on 10,000 records | < 5ms |
| W18-03 | Parse 100 NOTAM strings | < 200ms |
| W18-03 | FAA API fetch with cache miss | < 5000ms |
| W18-04 | Zone geometry validation (per zone) | < 10ms |
| W18-05 | Overpass API fetch for Romania | < 10,000ms |
| W18-06 | Single-point weather fetch | < 3000ms |
| W18-06 | 6-point batch fetch (parallel) | < 5000ms |
| W18-07 | Correlate 500 events x 20 zones | < 500ms |
| W18-08 | Health dashboard generation | < 100ms |
| W18-08 | Pipeline startup (5+ feeds ready) | < 30,000ms |
| W18-08 | Graceful shutdown complete | < 15,000ms |

### Failure Mode Acceptance Matrix

| Feed | Expected Failure Mode | Acceptable Response |
|------|-----------------------|---------------------|
| OpenSky anon (400 req/day limit) | HTTP 429 | Fall back to adsb.fi; set QUOTA_WAIT |
| ADS-B Exchange (key required) | HTTP 401 | Log AUTH_FAILURE; use remaining sources |
| FAA NOTAM API | HTTP 503 / timeout | Return stale cached NOTAMs with stale=true flag |
| drone.rules.eu | HTTP 500 | Return cached EASA zones; log ZONE_CACHE_HIT |
| Overpass API | Timeout > 30s | Return bundled static GeoJSON cache |
| Open-Meteo | HTTP 5xx | Fall back to OpenWeatherMap |
| OpenWeatherMap | HTTP 401 (key expired) | Return null conditions with error field |
| ACLED | Rate limit (free tier) | Return cached events from last successful fetch |
| FIRMS | No MAP_KEY configured | Log FIRMS_DISABLED; skip gracefully |
| GDELT | No key required; always available | No fallback needed; direct retry once |

---

*End of ACCEPTANCE_CRITERIA.md*
*APEX-SENTINEL W18 — EU Data Integration Layer*
*2026-03-27 | Wave: W18 INIT | 3097 tests passing at wave start*
