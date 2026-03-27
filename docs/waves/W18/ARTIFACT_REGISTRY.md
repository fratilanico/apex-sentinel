# APEX-SENTINEL W18 — ARTIFACT REGISTRY
# EU Data Integration Layer
# Wave: W18 | Status: INIT | Date: 2026-03-27

---

## Overview

Complete inventory of all source files, test files, and documentation artifacts that
W18 will create or significantly modify. Includes TypeScript interface definitions for
all major domain types introduced in this wave.

---

## TypeScript Interface Definitions

These interfaces are shared across all W18 source files. Primary home:
`src/feeds/eu-data-feed-registry.ts` (FeedDescriptor, FeedHealth, FeedStatus) and
`src/feeds/aircraft-position-aggregator.ts` (AircraftState) — exported and re-exported
from `src/feeds/index.ts`.

### FeedStatus

```typescript
export type FeedStatus =
  | 'INITIALISING'
  | 'HEALTHY'
  | 'DEGRADED'
  | 'DOWN'
  | 'QUOTA_WAIT'
  | 'AUTH_FAILURE'
  | 'DISABLED';
```

### FeedDescriptor

```typescript
export interface FeedDescriptor {
  feedId: string;                // UUID v4
  name: string;                  // Human-readable e.g. "OpenSky Network ADS-B"
  type: FeedType;                // 'adsb' | 'notam' | 'zones' | 'infrastructure' | 'weather' | 'security'
  endpoint: string;              // Primary API base URL
  dailyRequestLimit: number;     // Max requests per calendar day (Infinity for unlimited)
  pollIntervalSeconds: number;   // Desired poll frequency
  timeoutMs: number;             // Per-request HTTP timeout
  registeredAt: string;          // ISO 8601 timestamp
  credentials?: FeedCredentials; // Optional API keys (never logged)
}

export interface FeedCredentials {
  apiKey?: string;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
}
```

### FeedHealth

```typescript
export interface FeedHealth {
  feedId: string;
  name: string;
  status: FeedStatus;
  totalPolls: number;
  successCount: number;
  successRate: number;           // 0-100, (successCount / totalPolls) * 100
  consecutiveFailures: number;
  lastSuccessAt: string | null;  // ISO 8601 or null if never succeeded
  lastErrorAt: string | null;    // ISO 8601 or null
  lastError: string | null;      // Error message or null
  budgetUsed: number;
  budgetRemaining: number;       // Infinity for unlimited feeds
  averageLatencyMs: number;      // Rolling average over last 10 successful polls
}
```

### RegistryDashboard

```typescript
export interface RegistryDashboard {
  generatedAt: string;           // ISO 8601
  totalFeeds: number;
  healthyFeeds: number;
  degradedFeeds: number;
  downFeeds: number;
  overallHealth: number;         // 0-100 score
  feeds: FeedHealth[];
}
```

### AircraftState

```typescript
export interface AircraftState {
  icao24: string;                // ICAO 24-bit hex address (6 chars, e.g. "4b1816")
  callsign: string | null;       // ATC callsign, trimmed; null if not available
  lat: number;                   // WGS84 latitude
  lon: number;                   // WGS84 longitude
  altitude_m: number | null;     // Barometric altitude in metres; null if on ground
  velocity_ms: number | null;    // Ground speed in m/s
  heading_deg: number | null;    // True track in degrees (0-360)
  verticalRate_ms: number | null; // Positive = climbing, negative = descending
  onGround: boolean;
  positionTimestamp: number;     // Unix epoch seconds (last position update)
  sources: string[];             // Which feed(s) reported this aircraft, e.g. ["opensky", "adsbexchange"]
  squawk: string | null;         // Transponder squawk code (4-digit octal)
}

export interface AggregationResult {
  aircraft: AircraftState[];
  fetchedAt: string;             // ISO 8601
  partialResult: boolean;        // true if >= 1 source failed
  failedSources: string[];       // Names of sources that failed this cycle
  staleDropped: number;          // Count of records excluded for age > 60s
  conflictCount: number;         // Count of ICAO24 conflicts resolved by recency
  durationMs: number;            // Wall-clock time for the full merge
}
```

### NotamRestriction

```typescript
export type NotamType =
  | 'DRONE_RESTRICTION'
  | 'AIRSPACE_CLOSURE'
  | 'MILITARY_EXERCISE'
  | 'PARACHUTE_ACTIVITY'
  | 'OBSTACLE'
  | 'NAVIGATION_WARNING'
  | 'UNKNOWN';

export interface NotamRestriction {
  notamId: string;               // e.g. "A0123/26"
  location: string;              // ICAO airport/FIR code e.g. "LROP"
  effectiveFrom: string;         // ISO 8601
  effectiveTo: string | null;    // ISO 8601; null for NOTAM PERM
  type: NotamType;
  altitude: NotamAltitude | null;
  geometry: NotamGeometry | null;
  radius_nm: number | null;      // Circle radius in nautical miles from Q-line
  center: { lat: number; lon: number } | null; // Decoded Q-line coordinates
  affectsProtectedZone: boolean;
  proximalZoneId: string | null;
  threatLevel: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  rawText: string;               // Verbatim NOTAM text
  parsedAt: string;              // ISO 8601
  stale?: boolean;               // true if returned from stale cache
}

export interface NotamAltitude {
  lower_ft: number;              // Lower limit in feet MSL
  upper_ft: number;              // Upper limit in feet MSL
  flightLevel: boolean;          // true if expressed as FL (e.g. FL060)
}

export interface NotamGeometry {
  type: 'Circle' | 'Polygon' | 'Corridor';
  center?: { lat: number; lon: number };
  radius_nm?: number;
  coordinates?: Array<[number, number]>; // [lon, lat] pairs for polygon
}
```

### EasaUasZone

```typescript
export type UasZoneType = 'PROHIBITED' | 'RESTRICTED' | 'CONDITIONAL';
export type USpaceClass = 'OPEN' | 'A' | 'B' | 'C' | 'D';

export interface EasaUasZone {
  zoneId: string;                // EASA-assigned identifier
  name: string;
  type: UasZoneType;
  uSpaceClass: USpaceClass;
  geometry: EasaZoneGeometry;
  lowerLimit_ft: number;        // Lower altitude bound (AGL or MSL per altitudeReference)
  upperLimit_ft: number;        // Upper altitude bound
  altitudeReference: 'AGL' | 'MSL' | 'WGS84';
  reason: string;               // Human-readable restriction reason
  country: string;              // ISO 3166-1 alpha-2 e.g. "RO"
  authority: string;            // Responsible authority e.g. "RCAA"
  applicability?: string;       // Date range or "PERMANENT"
  geometryWarning?: string;     // e.g. "SELF_INTERSECTING"
}

export type EasaZoneGeometry =
  | { type: 'Polygon'; coordinates: Array<[number, number]> }  // [lon, lat] closed ring
  | { type: 'Circle'; center: { lat: number; lon: number }; radius_m: number };
```

### ProtectedZone

```typescript
export type InfrastructureType =
  | 'nuclear'
  | 'military_nato'
  | 'military'
  | 'airport_international'
  | 'airport_regional'
  | 'power_plant'
  | 'government_district'
  | 'critical_unclassified';

export interface ProtectedZone {
  zoneId: string;                // e.g. "LROP", "CNPP", "DEVA"
  name: string;                  // Full name e.g. "Henri Coanda International Airport"
  type: InfrastructureType;
  center: { lat: number; lon: number };
  radius_m: number;              // Threat detection radius
  threatMultiplier: number;      // 1.0-5.0; applied to event severity scores
  source: 'OSM' | 'OSM_CACHE' | 'HARDCODED';
  cacheDate?: string;            // ISO 8601; set when source is OSM_CACHE
  osmId?: string;                // OSM node/way/relation ID
  icaoCode?: string;             // For airports
  metadata?: Record<string, string>;
}
```

### AtmosphericConditions

```typescript
export type FlyabilityLabel = 'EXCELLENT' | 'GOOD' | 'MARGINAL' | 'POOR' | 'PROHIBITED';

export interface AtmosphericConditions {
  lat: number;
  lon: number;
  windSpeed_ms: number;          // Sustained wind speed at 10m AGL in m/s
  windGust_ms: number;           // Maximum gust speed at 10m AGL in m/s
  windDirection_deg: number;     // Wind direction true north (0-360)
  precipitation_mmh: number;     // Precipitation rate in mm/hour
  cloudCover_pct: number;        // Total cloud cover 0-100%
  visibility_m: number;          // Horizontal visibility in metres
  weatherCode: number;           // WMO weather interpretation code
  pressure_hPa: number;          // Surface pressure in hPa
  temperature_c: number;         // Air temperature in Celsius
  relativeHumidity_pct: number;  // Relative humidity 0-100%
  flyabilityScore: number;       // Computed 0-100; null before computation
  flyabilityLabel: FlyabilityLabel;
  dataQualityFlags: string[];    // e.g. ["WIND_SUBSTITUTED", "VISIBILITY_DEFAULT"]
  source: 'open-meteo' | 'openweathermap';
  fetchedAt: string;             // ISO 8601
  error?: string;                // Set if conditions could not be fetched
}

export interface WeatherBatchResult {
  results: AtmosphericConditions[];
  batchCompletedAt: string;      // ISO 8601
  successCount: number;
  failureCount: number;
  durationMs: number;
}
```

### SecurityEvent

```typescript
export type SecurityEventType =
  | 'ARMED_CONFLICT'
  | 'EXPLOSION'
  | 'PROTEST'
  | 'STRATEGIC_DEVELOPMENT'
  | 'THERMAL_ANOMALY'
  | 'MEDIA_EVENT'
  | 'UNKNOWN';

export type SecuritySeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SecurityEvent {
  eventId: string;               // Source-native ID (ACLED: event_id_cnty; FIRMS: lat+lon+ts hash; GDELT: globaleventid)
  source: 'ACLED' | 'FIRMS' | 'GDELT';
  sources: string[];             // After dedup merge: all contributing sources
  type: SecurityEventType;
  subType?: string;              // Source-specific sub-classification
  lat: number;
  lon: number;
  occurredAt: string;            // ISO 8601
  severity: SecuritySeverity;
  description: string;           // Human-readable event summary (no PII)
  fatalities?: number;           // ACLED only; 0 if none
  brightness?: number;           // FIRMS only; FRP or brightness temperature
  goldsteinScale?: number;       // GDELT only; [-10, +10]
  numMentions?: number;          // GDELT only
  significance?: 'HIGH' | 'NORMAL'; // GDELT: set when numMentions > 100
  baseSeverityScore: number;     // HIGH=3.0, MEDIUM=2.0, LOW=1.0
  proximalZone: { zoneId: string; name: string; distance_m: number } | null;
  insideZone: boolean;
  threatScore: number;           // baseSeverityScore * zone.threatMultiplier (0 if no proximal zone)
  explanation: string;           // REQUIRED: human-readable explanation for Art. 22 compliance
  confidence: number;            // 0.0-1.0; 0.5=single source, 0.75=2 sources, 0.95=3 sources
  mergedFrom: number;            // How many source events were merged into this one
}
```

### PipelineStatus and PipelineHealthDashboard

```typescript
export type PipelineRunState =
  | 'STOPPED'
  | 'STARTING'
  | 'RUNNING'
  | 'DEGRADED'
  | 'CRITICAL'
  | 'FAILED';

export interface PipelineHealthDashboard {
  pipelineStatus: PipelineRunState;
  uptime_s: number;
  totalFeeds: number;
  healthyFeeds: number;
  degradedFeeds: number;
  downFeeds: number;
  lastPollAt: string | null;     // ISO 8601 of most recent any-feed poll
  nextPollAt: string | null;     // ISO 8601 of next scheduled poll
  totalRecordsPublished: number; // Cumulative since pipeline start
  pipelineVersion: string;       // semver e.g. "18.0.0"
  feeds: FeedHealth[];
}
```

---

## Source File Inventory

### src/feeds/ — New Files (W18)

| File | FR | Est. Lines | Description |
|------|----|------------|-------------|
| `eu-data-feed-registry.ts` | W18-01 | ~200 | Central registry: register/deregister, health tracking, budget enforcement, dashboard |
| `aircraft-position-aggregator.ts` | W18-02 | ~220 | Parallel merge of 3 ADS-B sources, ICAO24 dedup, staleness filter, bbox filter |
| `opensky-adapter.ts` | W18-02 | ~130 | OpenSky Network REST client: GET /states/all with bbox, auth support, response normalisation |
| `adsbexchange-adapter.ts` | W18-02 | ~120 | ADS-B Exchange client: lat/lon/dist endpoint, API key header, response normalisation |
| `adsbfi-adapter.ts` | W18-02 | ~100 | adsb.fi backup client: opendata.adsb.fi REST, no-key, response normalisation |
| `notam-parser.ts` | W18-03 | ~180 | ICAO NOTAM text parser: Q-line decode, A/B/C/E fields, type inference, coord decode |
| `notam-ingestor.ts` | W18-03 | ~170 | FAA NOTAM API client, 15-min cache, graceful degradation, zone intersection |
| `easa-uas-zone-loader.ts` | W18-04 | ~190 | drone.rules.eu API client, GeoJSON validation, circle normalisation, 24h cache + checksum |
| `atmospheric-condition-provider.ts` | W18-06 | ~200 | Open-Meteo primary, OWM fallback, flyability score computation, batch fetch |
| `openweathermap-adapter.ts` | W18-06 | ~100 | OWM /weather endpoint, normalise to AtmosphericConditions, unit conversion |
| `acled-adapter.ts` | W18-07 | ~140 | ACLED API client: Romania query, severity mapping, rate limit awareness |
| `firms-adapter.ts` | W18-07 | ~130 | NASA FIRMS VIIRS NRT CSV fetch, parse, brightness severity mapping |
| `gdelt-adapter.ts` | W18-07 | ~140 | GDELT v2 events API, Romania filter, Goldstein scale severity, dedup |
| `security-event-correlator.ts` | W18-07 | ~240 | Multi-source merge, zone correlation, haversine proximity, confidence scoring, dedup |
| `eu-data-integration-pipeline.ts` | W18-08 | ~280 | Orchestrator: startup, scheduler, NATS publish, health dashboard, graceful shutdown |

### src/feeds/ — Modified Files (W18 extends)

| File | Original Wave | Modification |
|------|---------------|-------------|
| `gdelt-client.ts` | W9 | Superseded by `gdelt-adapter.ts`; mark as `@deprecated` in header |
| `open-meteo-client.ts` | W9 | Superseded by `atmospheric-condition-provider.ts`; mark as `@deprecated` |
| `data-feed-broker.ts` | W9 | No change required; W18 pipeline plugs in above it |
| `adsb-exchange-client.ts` | W9 | Superseded by `adsbexchange-adapter.ts`; mark as `@deprecated` |

### src/geo/ — New Files (W18)

| File | FR | Est. Lines | Description |
|------|----|------------|-------------|
| `romania-bbox.ts` | W18-02, W18-05 | ~50 | Romania bounding box constants, airport coords, named point constants |
| `protected-zone-registry.ts` | W18-05 | ~80 | Hardcoded ProtectedZone[] for 6 mandatory Romanian critical sites |
| `osm-overpass-client.ts` | W18-05 | ~150 | Overpass API wrapper: QL query builder, response parsing, timeout handling |
| `critical-infrastructure-loader.ts` | W18-05 | ~220 | Overpass fetch, OSM-to-ProtectedZone conversion, threat multipliers, static fallback |
| `zone-breach-detector.ts` | W18-07 | ~120 | Haversine distance, point-in-circle, ray-casting point-in-polygon, batch correlation |

### src/feeds/index.ts — New Export Barrel

```typescript
// W18 exports barrel
export * from './eu-data-feed-registry';
export * from './aircraft-position-aggregator';
export * from './opensky-adapter';
export * from './adsbexchange-adapter';
export * from './adsbfi-adapter';
export * from './notam-ingestor';
export * from './notam-parser';
export * from './easa-uas-zone-loader';
export * from './atmospheric-condition-provider';
export * from './openweathermap-adapter';
export * from './acled-adapter';
export * from './firms-adapter';
export * from './gdelt-adapter';
export * from './security-event-correlator';
export * from './eu-data-integration-pipeline';
```

---

## Test File Inventory

### tests/feeds/ — New Test Files (W18, TDD Red Phase)

| File | FR | Target Tests | Key Test Cases |
|------|----|-------------|----------------|
| `FR-W18-01-feed-registry.test.ts` | W18-01 | 20 | register, getById, getHealth, canRequest budget, dashboard, deregister, quota reset |
| `FR-W18-02-aircraft-aggregator.test.ts` | W18-02 | 20 | parallel merge timing, ICAO24 dedup, recency wins, single-source fallback, staleness filter, bbox filter, GDPR no history |
| `FR-W18-03-notam-ingestor.test.ts` | W18-03 | 20 | FAA API call params, ICAO parse (A/Q/B/C/E fields), coord decode, cache hit/miss, 503 fallback, zone intersection |
| `FR-W18-04-easa-zones.test.ts` | W18-04 | 20 | RO zone fetch, polygon validity, circle normalise, approximatePolygon error, 24h cache checksum, category filter, empty response |
| `FR-W18-05-infrastructure-loader.test.ts` | W18-05 | 20 | Overpass query bbox, mandatory 6 sites present, threat multipliers, static fallback, default radius by type, InsufficientDataError |
| `FR-W18-06-atmospheric-provider.test.ts` | W18-06 | 20 | Open-Meteo params, flyability score bands, wind penalty, precip penalty, visibility penalty, OWM fallback, both-down error, batch parallel, staleness check |
| `FR-W18-07-security-correlator.test.ts` | W18-07 | 20 | ACLED params + severity map, FIRMS parse + brightness map, GDELT Goldstein map, haversine proximity, inside-zone detection, threatScore formula, cross-source dedup, confidence scoring, Art.22 explanation field |
| `FR-W18-08-integration-pipeline.test.ts` | W18-08 | 20 | startup readiness, poll interval scheduling, NATS subject names, degraded (3 down) vs critical (5 down), health dashboard fields, graceful shutdown |

**Total target: 160 tests (20 per FR x 8 FRs)**
**Test framework: Vitest with vi.fn() mocks for HTTP calls (no live API calls in unit tests)**

### tests/feeds/ — Test Strategy Notes

All HTTP calls to external APIs must be mocked in unit tests:
- `opensky-adapter.test.ts` scenarios use `vi.mock` over `fetch` or `axios`
- Recorded fixtures stored in `tests/fixtures/w18/` as JSON files
- Fixture naming: `opensky-success.json`, `faa-notam-lrbb.json`, `easa-zones-ro.json`,
  `acled-romania-30d.json`, `firms-romania-1d.csv`, `gdelt-romania-7d.json`,
  `open-meteo-bucharest.json`, `overpass-romania.json`

Integration tests (live API, CI-skipped by default):
- Tagged with `@integration` in describe block
- Skip condition: `process.env.INTEGRATION_TESTS !== 'true'`
- Run manually: `INTEGRATION_TESTS=true npx vitest run tests/feeds/ --reporter=verbose`

---

## Documentation Artifacts

### New Documentation in docs/waves/W18/

| File | Status | Description |
|------|--------|-------------|
| `DESIGN.md` | Written | W18 system design, feed taxonomy, data flow |
| `PRD.md` | Written | Product requirements, user stories, success metrics |
| `ARCHITECTURE.md` | Written | Component diagram, feed adapter pattern, NATS topology |
| `DATABASE_SCHEMA.md` | Written | No new DB tables (W18 is in-memory only; GDPR rationale) |
| `API_SPECIFICATION.md` | Written | Internal API contracts between pipeline and downstream consumers |
| `AI_PIPELINE.md` | Written | How W18 feeds enrich the ML threat scoring from W12 |
| `PRIVACY_ARCHITECTURE.md` | Written | GDPR controls per feed, retention policy, Art.22 log |
| `ROADMAP.md` | Written | W18 fits into W18->W21 planned arc |
| `TEST_STRATEGY.md` | Written | TDD approach, fixture strategy, integration test tagging |
| `ACCEPTANCE_CRITERIA.md` | **COMPLETE** | Per-FR Given/When/Then, performance gates, GDPR (this session) |
| `DECISION_LOG.md` | **COMPLETE** | 10 architectural decisions with full rationale (this session) |
| `SESSION_STATE.md` | **COMPLETE** | Current state, implementation plan, API credentials list (this session) |
| `ARTIFACT_REGISTRY.md` | **COMPLETE** | All artifacts with TypeScript interfaces (this file) |
| `DEPLOY_CHECKLIST.md` | Written | Env var provisioning, API key registration steps |
| `LKGC_TEMPLATE.md` | Written | Last Known Good Configuration for W18 |
| `IMPLEMENTATION_PLAN.md` | Written | Day-by-day implementation schedule |
| `HANDOFF.md` | Written | Handoff guide for next engineer |
| `FR_REGISTER.md` | Written | 8 FRs with full acceptance criteria references |
| `RISK_REGISTER.md` | Written | API availability risks, rate limit risks, GDPR risks |
| `INTEGRATION_MAP.md` | Written | W18 integration points with W7 NATS, W9 feeds, W12 ML |

---

## Static Asset Artifacts

| File | Description | Generated By |
|------|-------------|-------------|
| `src/geo/romania-critical-infra-cache.geojson` | Bundled OSM fallback for Romanian critical infrastructure | Manual OSM Overpass query on W18 execute day; committed to repo |
| `tests/fixtures/w18/opensky-success.json` | Sample OpenSky response for Romania bbox | Captured from live API during fixture recording |
| `tests/fixtures/w18/opensky-empty.json` | Empty OpenSky response (quota exhausted or no traffic) | Handcrafted |
| `tests/fixtures/w18/faa-notam-lrbb.json` | Sample FAA NOTAM API response for LRBB FIR | Captured from live API |
| `tests/fixtures/w18/easa-zones-ro.json` | Sample drone.rules.eu response for Romania | Captured from live API |
| `tests/fixtures/w18/acled-romania-30d.json` | Sample ACLED response for Romania past 30 days | Captured from live API |
| `tests/fixtures/w18/firms-romania-1d.csv` | Sample NASA FIRMS VIIRS CSV for Romania 1-day | Captured from live API |
| `tests/fixtures/w18/gdelt-romania-7d.json` | Sample GDELT response for Romania 7-day query | Captured from live API |
| `tests/fixtures/w18/open-meteo-bucharest.json` | Sample Open-Meteo response for Bucharest | Captured from live API |
| `tests/fixtures/w18/overpass-romania.json` | Sample Overpass API response for Romania critical infra | Captured from live Overpass |

---

## API Endpoint Reference

Quick reference for all external API endpoints used in W18:

| Feed | Base URL | Auth |
|------|----------|------|
| OpenSky Network | `https://opensky-network.org/api` | None (anon) or Basic Auth |
| ADS-B Exchange | `https://adsbexchange.com/api/aircraft/json` | `X-RapidAPI-Key` header |
| adsb.fi | `https://opendata.adsb.fi/api/v2` | None |
| FAA NOTAM | `https://api.faa.gov/notamSearch/notams` | OAuth2 client_credentials |
| drone.rules.eu | `https://drone-rules.eu/api/v1/zones` | None |
| OSM Overpass | `https://overpass-api.de/api/interpreter` | None |
| Open-Meteo | `https://api.open-meteo.com/v1/forecast` | None |
| OpenWeatherMap | `https://api.openweathermap.org/data/2.5/weather` | `appid` query param |
| ACLED | `https://api.acleddata.com/acled/read` | `key` + `email` query params |
| NASA FIRMS | `https://firms.modaps.eosdis.nasa.gov/api/area/csv` | `MAP_KEY` in URL path |
| GDELT v2 | `https://api.gdeltproject.org/api/v2/events/query` | None |

---

## FR-to-File Mapping Summary

| FR | Source Files | Test File |
|----|-------------|-----------|
| W18-01 | `src/feeds/eu-data-feed-registry.ts` | `FR-W18-01-feed-registry.test.ts` |
| W18-02 | `src/feeds/aircraft-position-aggregator.ts`, `opensky-adapter.ts`, `adsbexchange-adapter.ts`, `adsbfi-adapter.ts` | `FR-W18-02-aircraft-aggregator.test.ts` |
| W18-03 | `src/feeds/notam-ingestor.ts`, `notam-parser.ts` | `FR-W18-03-notam-ingestor.test.ts` |
| W18-04 | `src/feeds/easa-uas-zone-loader.ts` | `FR-W18-04-easa-zones.test.ts` |
| W18-05 | `src/geo/critical-infrastructure-loader.ts`, `osm-overpass-client.ts`, `romania-bbox.ts`, `protected-zone-registry.ts` | `FR-W18-05-infrastructure-loader.test.ts` |
| W18-06 | `src/feeds/atmospheric-condition-provider.ts`, `openweathermap-adapter.ts` | `FR-W18-06-atmospheric-provider.test.ts` |
| W18-07 | `src/feeds/security-event-correlator.ts`, `acled-adapter.ts`, `firms-adapter.ts`, `gdelt-adapter.ts`, `src/geo/zone-breach-detector.ts` | `FR-W18-07-security-correlator.test.ts` |
| W18-08 | `src/feeds/eu-data-integration-pipeline.ts` | `FR-W18-08-integration-pipeline.test.ts` |

---

## Wave Metrics Projection

| Metric | W18 Target |
|--------|-----------|
| New source files | 20 (15 in src/feeds/, 5 in src/geo/) |
| New test files | 8 (in tests/feeds/) |
| New tests | ~160 (20 per FR) |
| Test baseline entering W18 | 3,097 |
| Target total after W18 complete | ~3,257 |
| Documentation files | 20 PROJECTAPEX docs in docs/waves/W18/ |
| New TypeScript interfaces | 12 (FeedStatus, FeedDescriptor, FeedHealth, RegistryDashboard, AircraftState, AggregationResult, NotamRestriction, EasaUasZone, ProtectedZone, AtmosphericConditions, SecurityEvent, PipelineHealthDashboard) |
| External API integrations | 11 (OpenSky, ADS-B Exchange, adsb.fi, FAA NOTAM, drone.rules.eu, OSM Overpass, Open-Meteo, OpenWeatherMap, ACLED, FIRMS, GDELT) |
| Zero-key feeds (no API key needed) | 5 (OpenSky anon, adsb.fi, drone.rules.eu, OSM Overpass, Open-Meteo, GDELT) |
| API key required | 4 feeds (FAA NOTAM, OpenWeatherMap, ACLED, FIRMS, ADS-B Exchange) |

---

*End of ARTIFACT_REGISTRY.md*
*APEX-SENTINEL W18 — EU Data Integration Layer*
*2026-03-27 | Wave: W18 INIT*
