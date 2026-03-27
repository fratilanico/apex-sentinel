# APEX-SENTINEL W18 — Implementation Plan: EU Data Integration Layer

```
Wave:     W18
Date:     2026-03-27
Baseline: 3097 tests GREEN (W1–W17)
Target:   ~3189 tests GREEN (+92 new)
Stack:    TypeScript 5, Vitest 3, Node.js >=20, tsx 4
Source:   src/feeds/, src/geo/, src/infra/
Tests:    tests/unit/ (Vitest)
```

---

## Pre-Implementation Gate

Before writing any code:

```bash
# Confirm baseline
npx vitest run        # must be 3097 GREEN
npx tsc --noEmit      # must be 0 errors

# Create directories
mkdir -p src/geo src/infra
mkdir -p tests/unit/fixtures
```

Confirm W18 is in PLANNED state in SESSION_STATE.md before proceeding.

---

## Phase 1 — Types & Registry (FR-W18-01)

**Goal:** Define all TypeScript interfaces. Implement EuDataFeedRegistry with token bucket and circuit breaker. No HTTP calls in this phase.

### Step 1.1 — `src/feeds/types.ts`

Define all shared interfaces for W18. This file must exist before any other W18 file imports from it.

```typescript
// Key interfaces to define:

export type FeedId =
  | 'opensky' | 'adsbexchange' | 'adsbfi'
  | 'faa-notam' | 'easa-uas-zones'
  | 'osm-overpass' | 'open-meteo' | 'openweathermap'
  | 'acled' | 'firms' | 'gdelt';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface FeedRegistration {
  id: FeedId;
  name: string;
  rateLimitPerHour: number;
  cacheTtlMs: number;
  requiresAuth: boolean;
  authEnvKey?: string;
}

export interface FeedHealth {
  id: FeedId;
  circuitState: CircuitBreakerState;
  consecutiveErrors: number;
  lastSuccess: number | null;   // unix ms
  lastError: number | null;
  requestsToday: number;
  rateLimitRemaining: number;
}

export interface AircraftState {
  icao24: string;
  callsign: string | null;
  originCountry: string;
  latitude: number;
  longitude: number;
  baroAltitudeM: number | null;
  geoAltitudeM: number | null;
  velocityMs: number | null;
  trueTrackDeg: number | null;
  verticalRateMs: number | null;
  onGround: boolean;
  squawk: string | null;
  positionSource: 'ADS-B' | 'ASTERIX' | 'MLAT' | 'UNKNOWN';
  lastContactUnix: number;
  source: 'opensky' | 'adsbexchange' | 'adsbfi';
  emergencyFlag?: 'hijack' | 'radio_failure' | 'emergency' | 'none';
  zoneBreaches: ZoneBreach[];
}

export interface ZoneBreach {
  zoneId: string;
  zoneName: string;
  zoneType: ProtectedZoneType;
  distanceM: number;
  breachLevel: 'ALERT' | 'CRITICAL';
}

export type ProtectedZoneType =
  | 'AERODROME' | 'NUCLEAR' | 'MILITARY' | 'GOVERNMENT'
  | 'ENERGY' | 'TRANSPORT' | 'WATER' | 'TELECOM';

export interface ProtectedZone {
  id: string;
  name: string;
  type: ProtectedZoneType;
  latitude: number;
  longitude: number;
  alertRadiusM: number;
  criticalRadiusM: number;
  icaoCode?: string;
}

export interface ParsedNotam {
  notamNumber: string;
  icaoLocation: string;
  effectiveStart: Date;
  effectiveEnd: Date | null;       // null = PERM
  qLineCode: string;               // QRTCA, QRPCH, etc.
  centreLat: number | null;
  centreLon: number | null;
  radiusNm: number | null;
  lowerAltFt: number;             // 0 = SFC/GND
  upperAltFt: number;             // 99999 = UNL
  eLineText: string;
  geoJson: GeoJsonGeometry | null;
  isUasRelated: boolean;
  isActive: boolean;
}

export interface GeoJsonGeometry {
  type: 'Point' | 'Polygon' | 'MultiPolygon';
  coordinates: unknown;
}

export interface UasZone {
  identifier: string;
  name: string;
  country: string;
  restriction: 'PROHIBITED' | 'RESTRICTED' | 'CONDITIONAL' | 'NO_RESTRICTION';
  uSpaceClass: 'A' | 'B' | 'C' | 'D' | 'U';
  lowerLimitFt: number;
  upperLimitFt: number;
  reason: string[];
  geometry: GeoJsonGeometry;
  permanentFlight: boolean;
}

export type FlyabilityTier = 'EXCELLENT' | 'GOOD' | 'MARGINAL' | 'POOR' | 'NO_FLY';

export interface AtmosphericConditions {
  timestamp: Date;
  latitude: number;
  longitude: number;
  temperatureC: number;
  windSpeedMs: number;
  windGustsMs: number;
  windDirectionDeg: number;
  precipitationMm: number;
  visibilityM: number;
  cloudCoverPct: number;
  humidityPct: number;
  pressureHpa: number;
  weatherCode: number;
  flyabilityScore: number;       // 0-100
  flyabilityTier: FlyabilityTier;
  flyabilityReasons: string[];
  acousticRangeFactor: number;  // 0.40-1.20
  source: 'open-meteo' | 'openweathermap' | 'merged';
}

export type SecurityEventType =
  | 'PROTEST' | 'RIOT' | 'ATTACK' | 'EXPLOSION' | 'MILITARY_ACTIVITY'
  | 'WILDFIRE' | 'CIVIL_UNREST' | 'BORDER_INCIDENT' | 'UNKNOWN';

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  source: 'acled' | 'firms' | 'gdelt';
  latitude: number;
  longitude: number;
  timestamp: Date;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  nearestZoneId: string | null;
  nearestZoneDistanceM: number | null;
  nearestZoneType: ProtectedZoneType | null;
}

export interface PipelineHealthReport {
  timestamp: Date;
  overallStatus: 'NOMINAL' | 'DEGRADED' | 'CRITICAL';
  confidence: number;              // 0.0-1.0
  feedHealth: Record<FeedId, FeedHealth>;
  activeFeeds: number;
  degradedFeeds: number;
  offlineFeeds: number;
  aircraftCount: number;
  activeNotams: number;
  uasZoneCount: number;
  protectedZoneCount: number;
  activeSecurityEvents: number;
  flyabilityScore: number | null;
}
```

### Step 1.2 — `src/feeds/eu-data-feed-registry.ts`

Pure TypeScript, no HTTP. Token bucket + circuit breaker per feed.

```typescript
// Key public API:
export class EuDataFeedRegistry {
  register(registration: FeedRegistration): void
  deregister(feedId: FeedId): void
  tryConsume(feedId: FeedId): boolean          // token bucket check
  reportSuccess(feedId: FeedId): void          // closes circuit breaker
  reportError(feedId: FeedId): void            // increments error count, opens at threshold
  getHealth(feedId: FeedId): FeedHealth | null
  getAllHealth(): Record<FeedId, FeedHealth>
  isHealthy(feedId: FeedId): boolean           // CLOSED + tokens available
}
```

Circuit breaker: opens after 3 consecutive errors, half-opens after `cooldownMs` (default: 60000ms), closes after one successful probe.

Token bucket: refills at `rateLimitPerHour / 3600` tokens/ms. `tryConsume()` returns false when empty (caller skips request, uses cached data).

### Step 1.3 — Tests: FR-W18-01 (12 tests)

```
tests/unit/eu-data-feed-registry.test.ts

describe('FR-W18-01: EuDataFeedRegistry') {
  // Registration
  it('registers a feed with valid configuration')
  it('deregisters a feed by id')
  it('throws on duplicate feed registration')

  // Token bucket
  it('allows requests within rate limit')
  it('rejects requests when bucket is empty')
  it('refills bucket based on elapsed time')
  it('respects zero-rate feeds (auth-required, no key)')

  // Circuit breaker
  it('starts in CLOSED state')
  it('opens circuit after 3 consecutive errors')
  it('transitions to HALF_OPEN after cooldown period')
  it('closes circuit on success from HALF_OPEN')
  it('returns OPEN state in health report')
}
```

Commit after Phase 1: `test(w18-tdd-red): FR-W18-01 EuDataFeedRegistry — 12 tests RED`
Implement, verify GREEN: `feat(w18): FR-W18-01 EuDataFeedRegistry — 12 tests GREEN`

---

## Phase 2 — Aircraft Layer (FR-W18-02)

**Goal:** Merge three ADS-B sources, deduplicate by ICAO24, prefer most recent position.

### Step 2.1 — `src/geo/haversine.ts`

```typescript
export function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number
// R = 6371000m. Returns distance in metres.
```

### Step 2.2 — `src/geo/romania-bbox.ts`

```typescript
export const ROMANIA_BBOX = {
  latMin: 43.6,  // southern coast (Danube delta south)
  latMax: 48.3,  // northern border (Satu Mare/Suceava)
  lonMin: 20.2,  // western tip (Timiș/Arad)
  lonMax: 30.0,  // eastern coast (Black Sea)
} as const;

export const ROMANIA_CENTER = { lat: 45.9, lon: 24.9 } as const;
```

### Step 2.3 — Adapters

**`src/feeds/opensky-adapter.ts`**
```typescript
// Transform OpenSky states array (17-column tuples) → AircraftState[]
// Column mapping: [0]=icao24, [1]=callsign, [2]=country,
//   [5]=lon, [6]=lat, [7]=baro_alt, [8]=on_ground,
//   [9]=velocity, [10]=track, [11]=vert_rate, [13]=geo_alt,
//   [14]=squawk, [16]=pos_source
export function mapOpenSkyStates(raw: unknown[][]): AircraftState[]
```

**`src/feeds/adsbexchange-adapter.ts`**
```typescript
// Transform ADS-B Exchange ac[] → AircraftState[]
// ac fields: hex, flight, lat, lon, alt_baro, gs, track, baro_rate, squawk, emergency
export function mapAdsbExchangeAircraft(raw: AdsbExchangeAc[]): AircraftState[]
```

**`src/feeds/adsbfi-adapter.ts`**
```typescript
// Transform adsb.fi aircraft[] → AircraftState[]
// Very similar schema to ADS-B Exchange
export function mapAdsbFiAircraft(raw: AdsbFiAircraft[]): AircraftState[]
```

### Step 2.4 — `src/feeds/aircraft-position-aggregator.ts`

```typescript
export class AircraftPositionAggregator extends EventEmitter {
  constructor(options: {
    registry: EuDataFeedRegistry;
    protectedZones: ProtectedZone[];
    httpClient?: HttpClient;   // injected in tests
    env?: NodeJS.ProcessEnv;
  })

  start(): Promise<void>    // launches 3 independent poll loops
  stop(): Promise<void>     // clears intervals

  getCurrentAircraft(): AircraftState[]   // returns deduplicated current state

  // Events:
  // 'aircraft_update' — emitted after each deduplicated merge
  // 'zone_breach'     — emitted when aircraft enters protected zone
  // 'emergency'       — emitted when emergency squawk detected
}

// Internal dedup:
// Build Map<icao24, AircraftState>. For each source result, upsert if:
//   - not present, OR
//   - lastContactUnix is more recent than stored
// Evict entries where lastContactUnix < now - 120000 (2 min stale)
```

Poll intervals:
- OpenSky: 900000ms (15 min) — respects 400 req/day anon limit
- ADS-B Exchange: 30000ms (30 s) — 1 req/s rate limit allows
- adsb.fi: 30000ms (30 s) — courtesy 1 req/10s, plenty

### Step 2.5 — Tests: FR-W18-02 (15 tests)

```
tests/unit/aircraft-position-aggregator.test.ts

describe('FR-W18-02: AircraftPositionAggregator') {
  // Adapters
  it('maps OpenSky states array to AircraftState')
  it('handles null fields in OpenSky (on-ground aircraft)')
  it('maps ADS-B Exchange ac[] to AircraftState')
  it('maps adsb.fi aircraft[] to AircraftState')

  // Deduplication
  it('deduplicates aircraft by ICAO24 across sources')
  it('prefers most recent position when same ICAO24 from two sources')
  it('evicts stale aircraft (>2 min since lastContact)')

  // Emergency detection
  it('sets emergencyFlag for squawk 7500 (hijack)')
  it('sets emergencyFlag for squawk 7600 (radio failure)')
  it('sets emergencyFlag for squawk 7700 (emergency)')

  // Zone breach
  it('emits zone_breach when aircraft enters alert radius')
  it('emits zone_breach with CRITICAL level within critical radius')
  it('calculates haversine distance correctly for known LROP coordinates')

  // Degraded operation
  it('continues polling adsb.fi when OpenSky circuit is OPEN')
  it('emits aircraft_update with empty array when all sources are OPEN')
}
```

Commit sequence: RED → implement → GREEN.

---

## Phase 3 — Airspace Restrictions (FR-W18-03, FR-W18-04)

### Step 3.1 — `src/feeds/notam-parser.ts`

ICAO NOTAM free-text parser. Most parsing-dense file in W18.

```typescript
// Q-line: "Q) LRBB/QRTCA/IV/BO/AE/000/999/4428N02613E005"
// Extracts: fir, code, centre coords (4428N = 44°28'N), radius NM
export function parseQLine(qLine: string): QLineParsed | null

// Coord field: "4428N02613E005" → {lat: 44.4667, lon: 26.2167, radiusNm: 5}
export function parseNotamCoord(field: string): {lat: number, lon: number, radiusNm: number} | null

// Date field: "2603270800" (YYMMDDHHMM) → ISO-8601
export function parseNotamDate(field: string): Date | null

// Altitude field: "GND" → 0, "UNL" → 99999, "1200FT AMSL" → 1200, "FL120" → 12000
export function parseNotamAltitude(field: string): number

// Full NOTAM text → ParsedNotam
export function parseNotam(raw: string): ParsedNotam | null

// Check E-line for UAS keywords: drone, UAS, UAV, RPAS, RPA, "unmanned"
export function isUasRelated(eLine: string): boolean
```

### Step 3.2 — `src/feeds/notam-ingestor.ts`

```typescript
export class NotamIngestor extends EventEmitter {
  constructor(options: {
    registry: EuDataFeedRegistry;
    icaoLocations: string[];   // default: ROMANIA_AIRPORT_ICAOS
    httpClient?: HttpClient;
    pollIntervalMs?: number;   // default: 300000 (5 min)
  })

  start(): Promise<void>
  stop(): Promise<void>

  getActiveNotams(): ParsedNotam[]
  getUasNotams(): ParsedNotam[]
  getNotamsForPoint(lat: number, lon: number): ParsedNotam[]  // point-in-circle check

  // Events:
  // 'notam_activated' — new NOTAM entered active window
  // 'notam_expired'   — NOTAM passed effectiveEnd
  // 'restriction_changed' — active restrictions changed (for downstream consumers)
}
```

### Step 3.3 — `src/feeds/easa-uas-zone-loader.ts`

```typescript
export class EasaUasZoneLoader extends EventEmitter {
  constructor(options: {
    registry: EuDataFeedRegistry;
    country?: string;          // default: 'RO'
    httpClient?: HttpClient;
    pollIntervalMs?: number;   // default: 3600000 (1 hr)
    fallbackGeoJsonPath?: string;
  })

  start(): Promise<void>
  stop(): Promise<void>

  getZones(): UasZone[]
  getZonesAt(lat: number, lon: number, altFt: number): UasZone[]  // point-in-polygon + altitude
  getProhibitedZones(): UasZone[]

  // Events:
  // 'zones_updated' — zones reloaded
  // 'zone_change'   — zones added or removed since last poll
}
```

### Step 3.4 — Tests: FR-W18-03 (12 tests), FR-W18-04 (10 tests)

```
tests/unit/notam-ingestor.test.ts

describe('FR-W18-03: NotamIngestor') {
  // Parser unit tests
  it('parses Q-line extracting FIR, code, centre coords, radius')
  it('parses coord field "4428N02613E005" correctly')
  it('parses date field "2603270800" to correct ISO-8601')
  it('parses altitude "GND" as 0ft')
  it('parses altitude "UNL" as 99999ft')
  it('parses altitude "FL120" as 12000ft')
  it('detects UAS-related E-line with keyword "drone"')
  it('detects UAS-related E-line with keyword "RPAS"')
  // Lifecycle
  it('fetches NOTAMs for all 8 Romanian airport ICAOs on start')
  it('emits notam_activated when new NOTAM enters active window')
  it('emits notam_expired when effectiveEnd passes')
  it('returns only active NOTAMs from getActiveNotams()')
}

tests/unit/easa-uas-zone-loader.test.ts

describe('FR-W18-04: EasaUasZoneLoader') {
  it('fetches U-space zones for Romania on start')
  it('maps EASA GeoJSON feature to UasZone')
  it('filters zones to Romania bbox')
  it('returns only PROHIBITED zones from getProhibitedZones()')
  it('getZonesAt() returns zones containing given point')
  it('getZonesAt() respects altitude bounds')
  it('uses bundled fallback when circuit is OPEN')
  it('emits zones_updated on successful poll')
  it('emits zone_change when zone count changes between polls')
  it('caches last successful response for circuit-OPEN periods')
}
```

---

## Phase 4 — Infrastructure & Atmosphere (FR-W18-05, FR-W18-06)

### Step 4.1 — `src/geo/point-in-polygon.ts`

```typescript
// Ray-casting algorithm. Handles GeoJSON Polygon (exterior ring) and MultiPolygon.
export function pointInPolygon(
  point: [lon: number, lat: number],
  polygon: GeoJsonPolygon
): boolean
```

### Step 4.2 — `src/feeds/critical-infrastructure-loader.ts`

Hardcoded zones for 8 critical Romanian sites + optional OSM Overpass enrichment.

```typescript
// Hardcoded zone definitions (always active, no network needed):
export const ROMANIA_PROTECTED_ZONES: ProtectedZone[] = [
  { id: 'RO-LROP', name: 'Henri Coandă International Airport', type: 'AERODROME',
    latitude: 44.5711, longitude: 26.0858, alertRadiusM: 5000, criticalRadiusM: 2000, icaoCode: 'LROP' },
  { id: 'RO-LRCL', name: 'Cluj-Napoca Avram Iancu Airport', type: 'AERODROME',
    latitude: 46.7852, longitude: 23.6862, alertRadiusM: 5000, criticalRadiusM: 2000, icaoCode: 'LRCL' },
  { id: 'RO-CERNAVODA', name: 'Cernavodă Nuclear Power Plant', type: 'NUCLEAR',
    latitude: 44.3289, longitude: 28.0566, alertRadiusM: 10000, criticalRadiusM: 3000 },
  { id: 'RO-MK-AIRBASE', name: 'Mihail Kogălniceanu Air Base', type: 'MILITARY',
    latitude: 44.3617, longitude: 28.4883, alertRadiusM: 8000, criticalRadiusM: 3000 },
  { id: 'RO-DEVESELU', name: 'Deveselu Missile Defense Base', type: 'MILITARY',
    latitude: 44.1133, longitude: 24.0969, alertRadiusM: 8000, criticalRadiusM: 3000 },
  { id: 'RO-CAMPIA-TURZII', name: 'Câmpia Turzii Air Base', type: 'MILITARY',
    latitude: 46.5042, longitude: 23.8853, alertRadiusM: 8000, criticalRadiusM: 3000 },
  { id: 'RO-LRBS', name: 'Băneasa Aurel Vlaicu Airport', type: 'AERODROME',
    latitude: 44.5032, longitude: 26.1021, alertRadiusM: 5000, criticalRadiusM: 2000, icaoCode: 'LRBS' },
  { id: 'RO-LRTR', name: 'Timișoara Traian Vuia International Airport', type: 'AERODROME',
    latitude: 45.8099, longitude: 21.3379, alertRadiusM: 5000, criticalRadiusM: 2000, icaoCode: 'LRTR' },
];

export class CriticalInfrastructureLoader extends EventEmitter {
  constructor(options: {
    registry: EuDataFeedRegistry;
    httpClient?: HttpClient;
    includeHardcoded?: boolean;  // default: true
    enrichFromOsm?: boolean;     // default: true
  })

  start(): Promise<void>    // loads hardcoded zones immediately + triggers OSM fetch
  stop(): Promise<void>

  getZones(): ProtectedZone[]
  checkBreach(aircraft: AircraftState): ZoneBreach[]  // haversine per aircraft per zone
}
```

### Step 4.3 — `src/feeds/atmospheric-condition-provider.ts`

```typescript
export class AtmosphericConditionProvider extends EventEmitter {
  constructor(options: {
    registry: EuDataFeedRegistry;
    locations?: Array<{lat: number, lon: number, name: string}>;
    httpClient?: HttpClient;
    env?: NodeJS.ProcessEnv;
    pollIntervalMs?: number;  // default: 600000 (10 min)
  })

  start(): Promise<void>
  stop(): Promise<void>

  getConditions(lat?: number, lon?: number): AtmosphericConditions | null
  // Returns conditions for nearest configured location to given coords
  // Default: Bucharest (44.4268, 26.1025)

  // Events:
  // 'conditions_updated' — new conditions available
  // 'flyability_changed' — flyability tier changed (GOOD→MARGINAL etc.)
}

// Flyability algorithm:
export function calculateFlyabilityScore(params: {
  windSpeedMs: number;
  windGustsMs: number;
  precipitationMm: number;
  visibilityM: number;
  cloudCoverPct: number;
  weatherCode: number;
}): { score: number; tier: FlyabilityTier; reasons: string[] }

// score = 100
//   - max(0, (windSpeedMs - 5) * 8)       // >5 m/s: -8/m/s
//   - max(0, (windGustsMs - 10) * 5)      // gusts >10: -5/m/s
//   - (precipitationMm > 0.5 ? 30 : 0)   // rain: -30
//   - (visibilityM < 5000 ? 20 : 0)       // <5km: -20
//   - (visibilityM < 1500 ? 30 : 0)       // <1.5km: additional -30
//   - (cloudCoverPct > 75 ? 10 : 0)       // overcast: -10
//   - (weatherCode >= 95 ? 50 : 0)        // thunderstorm: -50
// tiers: 80-100=EXCELLENT, 60-79=GOOD, 40-59=MARGINAL, 20-39=POOR, 0-19=NO_FLY

export function calculateAcousticRangeFactor(params: {
  windSpeedMs: number;
  precipitationMm: number;
}): number
// base 1.0. Wind >5m/s reduces range (-0.05/m/s). Rain reduces range (-0.15 if >0.5mm).
// clamp to [0.40, 1.20]
```

### Step 4.4 — Tests: FR-W18-05 (12 tests), FR-W18-06 (14 tests)

```
tests/unit/critical-infrastructure-loader.test.ts

describe('FR-W18-05: CriticalInfrastructureLoader') {
  it('loads 8 hardcoded Romanian protected zones on start')
  it('includes Cernavodă nuclear with 10km alert radius')
  it('includes LROP aerodrome with correct coordinates')
  it('checkBreach returns empty for aircraft outside all zones')
  it('checkBreach returns ALERT breach when aircraft within alertRadiusM')
  it('checkBreach returns CRITICAL breach within criticalRadiusM')
  it('haversine distance is accurate for known coordinate pair')
  it('OSM enrichment adds aerodrome not in hardcoded list')
  it('OSM enrichment skips duplicate (already in hardcoded list by ICAO code)')
  it('handles OSM Overpass timeout gracefully (keeps hardcoded only)')
  it('emits zones_enriched after OSM fetch')
  it('getZones() returns hardcoded zones even when OSM is OPEN')
}

tests/unit/atmospheric-condition-provider.test.ts

describe('FR-W18-06: AtmosphericConditionProvider') {
  // Flyability algorithm
  it('returns score 100 for calm clear conditions')
  it('deducts 8 per m/s wind speed above 5 m/s')
  it('deducts 30 for precipitation > 0.5mm')
  it('deducts 20 for visibility < 5000m')
  it('deducts additional 30 for visibility < 1500m (fog)')
  it('deducts 50 for thunderstorm (weather_code >= 95)')
  it('clamps score to 0 minimum')
  it('assigns EXCELLENT tier for score >= 80')
  it('assigns NO_FLY tier for score < 20')

  // Acoustic range factor
  it('returns 1.0 acoustic factor for calm/dry conditions')
  it('reduces acoustic factor for wind > 5 m/s')
  it('reduces acoustic factor for rain')
  it('clamps acoustic factor to 0.40 minimum')

  // Data source
  it('falls back to open-meteo only when OPENWEATHERMAP_API_KEY absent')
  it('merges open-meteo and OpenWeatherMap into AtmosphericConditions')
}
```

---

## Phase 5 — Intelligence Layer (FR-W18-07)

### Step 5.1 — Adapters

**`src/feeds/acled-adapter.ts`**
```typescript
// Parse ACLED API response row → SecurityEvent
export function mapAcledEvent(row: AcledRow, zones: ProtectedZone[]): SecurityEvent
// event_type mapping: "Protests"→PROTEST, "Riots"→RIOT, "Explosions/Remote violence"→EXPLOSION
// "Battles"→ATTACK, "Strategic developments"→MILITARY_ACTIVITY
```

**`src/feeds/firms-adapter.ts`**
```typescript
// Parse FIRMS JSON entry → SecurityEvent
// confidence filter: only "nominal" and "high"
// frp > 50 MW → severity HIGH, else MEDIUM
export function mapFirmsDetection(entry: FirmsEntry, zones: ProtectedZone[]): SecurityEvent
```

**`src/feeds/gdelt-adapter.ts`**
```typescript
// Parse GDELT GeoJSON feature → SecurityEvent
// count > 20 articles → severity HIGH, 5-20 → MEDIUM, else LOW
export function mapGdeltFeature(feature: GdeltFeature, zones: ProtectedZone[]): SecurityEvent
```

### Step 5.2 — `src/feeds/security-event-correlator.ts`

```typescript
export class SecurityEventCorrelator extends EventEmitter {
  constructor(options: {
    registry: EuDataFeedRegistry;
    protectedZones: ProtectedZone[];
    httpClient?: HttpClient;
    env?: NodeJS.ProcessEnv;
    retentionMs?: number;        // default: 86400000 (24 hr)
    ringBufferSize?: number;     // default: 500
    pollIntervalMs?: number;     // default: 3600000 (1 hr)
  })

  start(): Promise<void>
  stop(): Promise<void>

  getEvents(): SecurityEvent[]
  getEventsNearZone(zoneId: string, radiusM?: number): SecurityEvent[]
  getOsintThreatLevel(): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  // aggregate: count events by severity in 24h window, weight by proximity

  // Events:
  // 'security_event'      — new event ingested
  // 'threat_level_change' — aggregate threat level changed
}
```

### Step 5.3 — Tests: FR-W18-07 (13 tests)

```
tests/unit/security-event-correlator.test.ts

describe('FR-W18-07: SecurityEventCorrelator') {
  // ACLED
  it('maps ACLED Protests row to SecurityEvent with type PROTEST')
  it('maps ACLED Explosions row to SecurityEvent with type EXPLOSION')
  it('skips ACLED ingestion when ACLED_API_KEY is absent')

  // FIRMS
  it('maps FIRMS VIIRS entry with high confidence to SecurityEvent')
  it('discards FIRMS entry with low confidence')
  it('sets severity HIGH for frp > 50 MW')

  // GDELT
  it('maps GDELT GeoJSON feature to SecurityEvent')
  it('sets severity HIGH when article count > 20')

  // Correlation
  it('correlates event with nearest protected zone using haversine')
  it('returns null nearestZoneId when event is > 100km from any zone')

  // Ring buffer
  it('evicts events older than retentionMs')
  it('respects ringBufferSize limit')

  // Threat aggregation
  it('returns CRITICAL threat level when CRITICAL severity event near zone')
}
```

---

## Phase 6 — Pipeline Orchestrator (FR-W18-08)

### Step 6.1 — `src/feeds/eu-data-integration-pipeline.ts`

```typescript
export class EuDataIntegrationPipeline extends EventEmitter {
  public readonly registry: EuDataFeedRegistry;
  public readonly infraLoader: CriticalInfrastructureLoader;
  public readonly uasZoneLoader: EasaUasZoneLoader;
  public readonly notamIngestor: NotamIngestor;
  public readonly aircraftAggregator: AircraftPositionAggregator;
  public readonly atmosphericProvider: AtmosphericConditionProvider;
  public readonly securityCorrelator: SecurityEventCorrelator;

  constructor(options: {
    env?: NodeJS.ProcessEnv;
    httpClient?: HttpClient;
    natsClient?: NatsClient;       // optional: publish to NATS
    healthPort?: number;           // optional: HTTP health endpoint
  })

  start(): Promise<void>
  // Start order: registry → infraLoader → uasZoneLoader → notamIngestor
  //            → aircraftAggregator → atmosphericProvider → securityCorrelator

  stop(): Promise<void>
  // Stop order: reverse of start

  getHealthReport(): PipelineHealthReport
  // confidence = (activeFeeds / totalFeeds)^2 weighted by feed criticality
  // overallStatus: NOMINAL if confidence >= 0.7, DEGRADED if >= 0.4, else CRITICAL

  // Events:
  // 'started'         — all components started
  // 'health_changed'  — overallStatus changed
  // 'zone_breach'     — forwarded from aircraftAggregator
  // 'emergency'       — forwarded from aircraftAggregator
  // 'security_threat' — forwarded from securityCorrelator threat_level_change
}
```

HTTP health endpoint (if `healthPort` provided):
```
GET /health
→ { status: 'ok'|'degraded'|'critical', feeds: {...}, confidence: 0.87 }
```

NATS subjects published:
- `feed.eu.feed_health` — PipelineHealthReport (every 30s + on change)
- `feed.eu.aircraft_update` — AircraftState[] (after each dedup cycle)
- `feed.eu.zone_breach` — ZoneBreach (on each breach)
- `feed.eu.security_event` — SecurityEvent (on each new event)

### Step 6.2 — Tests: FR-W18-08 (14 tests)

```
tests/unit/eu-data-integration-pipeline.test.ts

describe('FR-W18-08: EuDataIntegrationPipeline') {
  // Startup
  it('starts all 7 sub-components in correct order')
  it('emits started event after all components are running')

  // Health report
  it('reports NOMINAL when all feeds are CLOSED')
  it('reports DEGRADED when 2 of 11 feeds are OPEN')
  it('reports CRITICAL when >60% of feeds are OPEN')
  it('confidence is 1.0 when all feeds healthy')
  it('confidence decreases proportionally with offline feeds')

  // Graceful degradation
  it('continues operating when ACLED feed is OPEN (FIRMS+GDELT active)')
  it('continues operating when OpenSky is OPEN (adsb.fi active)')
  it('reports OFFLINE aircraft layer only when all 3 aircraft feeds are OPEN')

  // Event forwarding
  it('forwards zone_breach from aircraftAggregator')
  it('forwards security_threat from securityCorrelator')

  // Stop
  it('stops all components in reverse start order')
  it('resolves stop() promise after all components stopped')
}
```

---

## Test Count Summary

| Phase | FR | Tests | Cumulative |
|---|---|---|---|
| Phase 1 | FR-W18-01 | 12 | 12 |
| Phase 2 | FR-W18-02 | 15 | 27 |
| Phase 3 | FR-W18-03 | 12 | 39 |
| Phase 3 | FR-W18-04 | 10 | 49 |
| Phase 4 | FR-W18-05 | 12 | 61 |
| Phase 4 | FR-W18-06 | 14 | 75 |
| Phase 5 | FR-W18-07 | 13 | 88 |
| Phase 6 | FR-W18-08 | 14 | 102 |
| **W18 Total** | **8 FRs** | **~102** | **~3199** |

Note: geo utility tests (haversine, point-in-polygon) are embedded in the FR test files. Actual count may reach ~102 tests.

---

## Final Verification Gate

```bash
# All must pass before W18 commit:

npx vitest run
# Expect: ~3199 tests GREEN, 0 failures

npx tsc --noEmit
# Expect: 0 errors

npx vitest run --coverage
# Expect: >=80% branches, functions, lines, statements for src/feeds/ and src/geo/

npm run build
# Expect: clean build
```

---

## Commit Sequence

```bash
# After RED phase:
git commit -m "test(w18-tdd-red): EU data integration layer — 8 FRs, 102 tests RED"

# After each FR turns GREEN (example):
git commit -m "feat(w18): FR-W18-01 EuDataFeedRegistry — token bucket + circuit breaker, 12 GREEN"

# Final W18 commit:
git commit -m "feat(w18): EU data integration layer COMPLETE — 8 FRs, 102 tests GREEN

FR-W18-01: EuDataFeedRegistry — register/health/rate-limit/circuit-breaker
FR-W18-02: AircraftPositionAggregator — OpenSky+ADS-BX+adsb.fi merge, ICAO24 dedup
FR-W18-03: NotamIngestor — ICAO NOTAM parser (Q/A/B/C/E/F/G lines), FAA API
FR-W18-04: EasaUasZoneLoader — EU 2021/664 U-space zones for Romania
FR-W18-05: CriticalInfrastructureLoader — 8 hardcoded RO zones + OSM Overpass
FR-W18-06: AtmosphericConditionProvider — open-meteo+OWM, flyability 0-100
FR-W18-07: SecurityEventCorrelator — ACLED+FIRMS+GDELT, zone proximity correlation
FR-W18-08: EuDataIntegrationPipeline — orchestrator, graceful degradation, NATS

src/geo/: haversine, point-in-polygon, romania-bbox
Total: ~3199 tests GREEN (3097 pre-W18 + 102 W18)"
```

---

## Implementation Timeline

| Phase | Components | Estimated Hours |
|---|---|---|
| Phase 1: Types + Registry | types.ts, eu-data-feed-registry.ts | 1.5h |
| Phase 2: Aircraft Layer | 3 adapters + aggregator | 2.0h |
| Phase 3: Airspace | notam-parser + ingestor + easa loader | 2.5h |
| Phase 4: Infra + Atmosphere | infra loader + atmospheric provider | 2.0h |
| Phase 5: Intelligence | 3 adapters + correlator | 1.5h |
| Phase 6: Pipeline | orchestrator + health endpoint | 1.0h |
| Verification + commit | full suite + live validation | 1.0h |
| **Total** | | **~11.5h** |
