# APEX-SENTINEL W18 — DATABASE SCHEMA

## Schema Philosophy

W18 is primarily an **in-memory data layer**. Like W17, it introduces no new Supabase tables or migrations. All W18 data is:

- **In-memory ring buffers**: aircraft positions, NOTAMs, security events
- **In-memory caches**: U-space zones, protected zones (load once / refresh daily)
- **Computed on demand**: flyability scores, zone breach events, correlation outputs
- **Emitted via NATS**: all downstream consumers receive typed messages

The authoritative TypeScript type definitions below serve as the **schema** for this wave. They are the contract between W18 components and the rest of the system.

---

## Core Type Definitions

### AircraftState

```typescript
// Unified aircraft position — output of AircraftPositionAggregator (FR-W18-02)
// Merged from OpenSky + ADS-B Exchange + adsb.fi, deduplicated by icao24

export type AircraftSource = 'opensky' | 'adsbexchange' | 'adsbfi';

export type UasThreatCategory = 'Cat-A' | 'Cat-B' | 'Cat-C' | 'Cat-D';

export type EmergencyFlag = 'hijack' | 'radio_failure' | 'emergency' | null;

export interface AircraftState {
  // Identity
  icao24: string;                     // ICAO 24-bit hex address e.g. "4b1800"
  callsign: string | null;            // ATC callsign e.g. "ROT214" or null if not squawking
  registration: string | null;        // Aircraft registration if known e.g. "YR-BAF"
  operator: string | null;            // Operator name if known (from OpenSky metadata)

  // Position (anonymised to 4dp in logs, 5dp in memory)
  lat: number;                        // Decimal degrees N
  lon: number;                        // Decimal degrees E
  altBaro: number;                    // Barometric altitude metres AMSL
  altGeo: number | null;              // Geometric altitude metres AMSL (GPS)
  onGround: boolean;

  // Motion
  velocityMs: number | null;          // Ground speed m/s
  headingDeg: number | null;          // True track degrees
  verticalRateMs: number | null;      // Climb/descend rate m/s

  // Transponder
  squawk: string | null;              // Mode A squawk e.g. "7700"
  category: string | null;           // ADS-B emitter category e.g. "A3" (GA piston)

  // Classification
  threatCategory: UasThreatCategory | null;   // Set by AircraftPositionAggregator heuristic
  emergencyFlag: EmergencyFlag;
  cooperativeContact: boolean;        // Has valid ADS-B transponder

  // Metadata
  source: AircraftSource;             // Which feed provided this record
  lastSeen: string;                   // ISO-8601 UTC timestamp of last position update
  positionAge: number;               // Seconds since last position update

  // Context (enriched by ThreatContextEnricher W9)
  inNotamZone: string | null;        // NOTAM ID if inside restriction
  inUasZone: string | null;          // UAS zone ID if inside U-space zone
  inProtectedZone: string | null;    // Protected zone ID if inside exclusion buffer
}
```

---

### NotamRestriction

```typescript
// NOTAM airspace restriction — output of NotamIngestor (FR-W18-03)
// Parsed from ICAO NOTAM format (Series/Number/Year, Q-line, A-line, B-C-D-E-F-G-lines)

export type NotamType = 'R' | 'D' | 'P' | 'W' | 'A';
// R=Restricted, D=Danger, P=Prohibited, W=Warning, A=Aerodrome

export type NotamStatus = 'ACTIVE' | 'PENDING' | 'EXPIRED';

export interface NotamCoordinates {
  lat: number;                        // Centre point latitude (from Q-line)
  lon: number;                        // Centre point longitude (from Q-line)
  radiusNm: number | null;           // Radius in nautical miles if circular
}

export interface NotamRestriction {
  id: string;                         // Canonical ID e.g. "A1234/26" (ICAO format)
  series: string;                     // NOTAM series e.g. "A", "B", "C"
  number: string;                     // NOTAM number within series
  year: string;                       // Two-digit year e.g. "26"

  type: NotamType;
  status: NotamStatus;

  // Affected FIR/aerodrome
  icaoLocation: string;               // e.g. "LROP" (Henri Coandă), "LRBS" (Deveselu)
  fir: string;                        // e.g. "LRBB" (Bucharest FIR)

  // Time bounds
  effectiveFrom: string;              // ISO-8601 UTC
  effectiveTo: string;               // ISO-8601 UTC or "PERM" for permanent
  schedule: string | null;           // D-line: activation schedule e.g. "MON-FRI 0600-2200"

  // Vertical limits (ICAO notation)
  lowerLimitFt: number | null;       // Lower limit feet AMSL (0 = GND)
  upperLimitFt: number | null;       // Upper limit feet AMSL
  lowerLimitRef: 'AGL' | 'AMSL' | 'FL' | 'GND';
  upperLimitRef: 'AGL' | 'AMSL' | 'FL' | 'UNL';

  // Geometry
  centre: NotamCoordinates;
  geometry: GeoJsonPolygon | null;   // Parsed from E-line coordinates if available

  // Raw content
  eLineText: string;                  // Full E-line description
  rawNotam: string;                   // Original ICAO NOTAM text (for audit)

  // Computed
  appliesToUas: boolean;             // True if NOTAM references UAS/drone operations
  uSpaceApplicable: boolean;         // True if within designated U-space airspace
}

// GeoJSON Polygon (RFC 7946)
export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: [number, number][][]; // [lon, lat] per RFC 7946
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: [number, number][][][];
}
```

---

### UasZone (EASA U-Space)

```typescript
// EASA U-space zone — output of EasaUasZoneLoader (FR-W18-04)
// Sourced from drone.rules.eu, compliant with EU 2021/664 Annex I

export type UasZoneType = 'PROHIBITED' | 'RESTRICTED' | 'CONDITIONAL' | 'NO_INFORMATION';

export type UasApplicableCategory = 'OPEN' | 'SPECIFIC' | 'CERTIFIED' | 'ALL';

export interface UasZoneAltitudeLimit {
  value: number;                      // Metres or Flight Level
  unit: 'M' | 'FT' | 'FL';
  reference: 'AGL' | 'AMSL' | 'WGS84';
}

export interface UasZone {
  id: string;                         // Zone identifier from drone.rules.eu
  name: string;                       // Human-readable zone name (Romanian/English)
  country: string;                    // ISO 3166-1 alpha-2, typically "RO"
  type: UasZoneType;

  // Vertical bounds
  floorAltitude: UasZoneAltitudeLimit;
  ceilingAltitude: UasZoneAltitudeLimit;

  // Applicability
  applicableCategories: UasApplicableCategory[];
  regulatoryReference: string;        // e.g. "Commission Delegated Regulation EU 2019/945"
  message: string | null;             // Advisory text for operators

  // Conditional activation
  applicableTimePeriods: UasTimeInterval[] | null;  // null = always active
  temporaryActivation: boolean;

  // Geometry (GeoJSON)
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon;
  boundingBox: RomaniaBbox;

  // Metadata
  authority: string;                  // Competent authority (e.g. "AACR" — Romanian Civil Aviation Authority)
  createdDate: string;               // ISO-8601
  updatedDate: string;               // ISO-8601
  sourceUrl: string;                  // drone.rules.eu permalink
}

export interface UasTimeInterval {
  startTime: string;                  // ISO-8601 or "SUNRISE"/"SUNSET"
  endTime: string;
  schedule: string | null;           // e.g. "MON-FRI" or null for all days
}
```

---

### ProtectedZone

```typescript
// Critical infrastructure exclusion zone — output of CriticalInfrastructureLoader (FR-W18-05)
// Combines hardcoded authoritative zones + OSM Overpass dynamic features

export type ProtectedZoneCategory =
  | 'AIRPORT_CTR'
  | 'AIRPORT_EXCLUSION'
  | 'NUCLEAR_PLANT'
  | 'NATO_BASE'
  | 'GOVERNMENT_DISTRICT'
  | 'POWER_INFRASTRUCTURE'
  | 'MILITARY_INSTALLATION'
  | 'CUSTOM';

export type ProtectedZoneSource = 'hardcoded' | 'osm' | 'easa' | 'national_authority';

export interface ProtectedZone {
  id: string;                         // Unique ID e.g. "RO-LROP-5KM-EXCLUSION"
  name: string;                       // Human-readable e.g. "Henri Coandă Airport 5km Exclusion"
  category: ProtectedZoneCategory;
  source: ProtectedZoneSource;

  // Location
  centreLat: number;                  // Centre point
  centreLon: number;
  radiusM: number;                    // Exclusion radius in metres

  // Regulatory basis
  regulatoryBasis: string | null;     // e.g. "EU 2019/947 Article 16"
  icaoDesignator: string | null;      // e.g. "LROP" for airports

  // Geometry (circle approximated as polygon for GeoJSON compatibility)
  geometry: GeoJsonPolygon;

  // Alert thresholds
  alertRadiusM: number;              // Radius at which to trigger approach warning (typically radiusM + 500m buffer)
  criticalRadiusM: number;           // Radius at which to trigger breach alert

  // Metadata
  country: 'RO' | string;
  osmId: string | null;              // OSM node/way/relation ID if sourced from OSM
  lastVerified: string;              // ISO-8601 date of last human verification
}

// Hardcoded authoritative zones (W18 canonical set)
export const ROMANIA_PROTECTED_ZONES: Readonly<ProtectedZone[]> = [
  {
    id: 'RO-LROP-EXCLUSION',
    name: 'Henri Coandă International Airport — 5km Exclusion',
    category: 'AIRPORT_EXCLUSION',
    centreLat: 44.5713,
    centreLon: 26.0849,
    radiusM: 5000,
    alertRadiusM: 5500,
    criticalRadiusM: 5000,
    icaoDesignator: 'LROP',
    country: 'RO',
  },
  {
    id: 'RO-LROP-CTR',
    name: 'Henri Coandă International Airport — 8km CTR',
    category: 'AIRPORT_CTR',
    centreLat: 44.5713,
    centreLon: 26.0849,
    radiusM: 8000,
    alertRadiusM: 8500,
    criticalRadiusM: 8000,
    icaoDesignator: 'LROP',
    country: 'RO',
  },
  {
    id: 'RO-LRCL-CTR',
    name: 'Cluj-Napoca International Airport',
    category: 'AIRPORT_CTR',
    centreLat: 46.7852,
    centreLon: 23.6862,
    radiusM: 5000,
    alertRadiusM: 5500,
    criticalRadiusM: 5000,
    icaoDesignator: 'LRCL',
    country: 'RO',
  },
  {
    id: 'RO-LRTR-CTR',
    name: 'Timișoara Traian Vuia International Airport',
    category: 'AIRPORT_CTR',
    centreLat: 45.8099,
    centreLon: 21.3379,
    radiusM: 5000,
    alertRadiusM: 5500,
    criticalRadiusM: 5000,
    icaoDesignator: 'LRTR',
    country: 'RO',
  },
  {
    id: 'RO-LRCK-CTR',
    name: 'Constanța Mihail Kogălniceanu Airport (NATO co-located)',
    category: 'NATO_BASE',
    centreLat: 44.3622,
    centreLon: 28.4883,
    radiusM: 5000,
    alertRadiusM: 5500,
    criticalRadiusM: 5000,
    icaoDesignator: 'LRCK',
    country: 'RO',
  },
  {
    id: 'RO-CERNAVODA-NUCLEAR',
    name: 'Cernavodă Nuclear Power Plant — 10km Exclusion',
    category: 'NUCLEAR_PLANT',
    centreLat: 44.3267,
    centreLon: 28.0606,
    radiusM: 10000,
    alertRadiusM: 10500,
    criticalRadiusM: 10000,
    icaoDesignator: null,
    country: 'RO',
  },
  {
    id: 'RO-DEVESELU-NATO',
    name: 'Deveselu NATO Air Base',
    category: 'NATO_BASE',
    centreLat: 44.0986,
    centreLon: 24.1375,
    radiusM: 5000,
    alertRadiusM: 5500,
    criticalRadiusM: 5000,
    icaoDesignator: 'LRBS',
    country: 'RO',
  },
  {
    id: 'RO-BUCHAREST-GOVT',
    name: 'Bucharest Government District',
    category: 'GOVERNMENT_DISTRICT',
    centreLat: 44.4268,
    centreLon: 26.1025,
    radiusM: 2000,
    alertRadiusM: 2500,
    criticalRadiusM: 2000,
    icaoDesignator: null,
    country: 'RO',
  },
] as const;
```

---

### DroneFlightConditions

```typescript
// Atmospheric conditions output of AtmosphericConditionProvider (FR-W18-06)

export type FlyabilityTier = 'IDEAL' | 'GOOD' | 'MARGINAL' | 'POOR' | 'UNFLYABLE';

export interface WindConditions {
  speedMs: number;                    // Wind speed m/s at 10m AGL
  gustMs: number | null;             // Gust speed m/s
  directionDeg: number;              // Wind direction (meteorological, from)
  shearMs: number | null;           // Wind shear between 10m and 120m AGL (OWM)
}

export interface AtmosphericFlags {
  highWind: boolean;                  // Wind > 12 m/s (Cat-A unflyable)
  freezingConditions: boolean;        // Temperature < 0°C (battery degradation)
  lowVisibility: boolean;             // Visibility < 1000m
  precipitation: boolean;            // Any precipitation
  thunderstorm: boolean;             // Thunderstorm present
}

export interface DroneFlightConditions {
  // Location and time
  lat: number;                        // Measurement location latitude
  lon: number;                        // Measurement location longitude
  timestamp: string;                  // ISO-8601 UTC

  // Source data
  primarySource: 'open-meteo' | 'openweathermap';
  secondarySource: 'openweathermap' | 'open-meteo' | null;

  // Measurements
  wind: WindConditions;
  tempC: number;                      // Temperature 2m AGL
  dewPointC: number | null;
  relativeHumidity: number | null;   // Percentage
  visibilityM: number;               // Visibility metres
  cloudCoverPercent: number | null;
  precipMmh: number;                  // Precipitation intensity mm/h

  // METAR-equivalent ceiling
  cloudBaseM: number | null;         // Lowest cloud base metres AGL

  // Derived
  acousticRangeFactor: number;        // 0.0–1.2, multiplier for sensor range
  acousticRangeNote: string;          // Human explanation e.g. "Wind 8m/s reduces range by 25%"
  flags: AtmosphericFlags;

  // Flyability assessment
  flyabilityScore: number;           // 0–100 (100=ideal, 0=impossible)
  flyabilityTier: FlyabilityTier;
  flyabilityReasons: string[];        // Ordered list of limiting factors
}

// Flyability score algorithm:
// base = 100
// wind > 12 m/s → score = 0 (unflyable)
// wind 8–12 m/s → score -= 40
// wind 5–8 m/s → score -= 15
// visibility < 500m → score = 0
// visibility < 1000m → score -= 30
// visibility < 3000m → score -= 10
// precipitation > 2mm/h → score -= 25
// precipitation > 0mm/h → score -= 10
// temp < -10°C → score -= 20
// temp > 45°C → score -= 20
// thunderstorm → score = 0
```

---

### SecurityEvent

```typescript
// Security event from ACLED / FIRMS / GDELT — output of SecurityEventCorrelator (FR-W18-07)

export type SecurityEventSource = 'acled' | 'firms' | 'gdelt';

export type SecurityEventType =
  | 'ARMED_CONFLICT'          // ACLED: battles, violence against civilians
  | 'PROTEST'                 // ACLED: protests, riots
  | 'EXPLOSION'               // ACLED: explosions/remote violence
  | 'THERMAL_ANOMALY'         // FIRMS: fire/thermal hotspot
  | 'MEDIA_EVENT'             // GDELT: media-reported security event
  | 'BORDER_INCIDENT';        // Any event within 50km of RO border

export interface SecurityEvent {
  id: string;                         // Unique event ID
  source: SecurityEventSource;
  type: SecurityEventType;
  timestamp: string;                  // ISO-8601 UTC event time

  // Location
  lat: number;
  lon: number;
  country: string;                    // ISO 3166-1 alpha-2
  locationName: string | null;        // City/district name if available

  // Severity
  goldsteinScale: number | null;     // ACLED/GDELT: -10 (most destabilising) to +10
  fatalities: number | null;         // ACLED only
  firmsBrightness: number | null;    // FIRMS: brightness temperature Kelvin

  // Proximity analysis
  nearestProtectedZone: string | null;       // ProtectedZone.id
  distanceToNearestZoneKm: number | null;
  withinAlertRadius: boolean;                // Within zone.alertRadiusM
  withinCriticalRadius: boolean;             // Within zone.criticalRadiusM

  // Source-specific metadata
  acledEventId: string | null;        // ACLED event_id_cnty
  gdeltGkgRecordId: string | null;   // GDELT GKG record GKGRECORDID
  firmsConfidence: 'nominal' | 'high' | null; // FIRMS detection confidence

  // Raw payload reference
  sourceUrl: string | null;
}

export interface SecurityAlert {
  alertId: string;
  event: SecurityEvent;
  affectedZone: ProtectedZone;
  alertLevel: 'ADVISORY' | 'WARNING' | 'CRITICAL';
  generatedAt: string;                // ISO-8601 UTC
  message: string;                    // Human-readable alert text
}
```

---

### FeedHealth

```typescript
// Feed health state — managed by EuDataFeedRegistry (FR-W18-01)

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type FeedTier = 1 | 2 | 3 | 4;

export interface FeedRegistration {
  id: string;                         // e.g. "opensky", "ead-notam", "easa-uas"
  name: string;                       // Human-readable
  tier: FeedTier;
  pollIntervalMs: number;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerDay: number | null;
    tokenBucketCapacity: number;
  };
  authRequired: boolean;
  envVarName: string | null;          // Environment variable name for API key
  baseUrl: string;
}

export interface FeedHealth {
  registration: FeedRegistration;
  circuitBreakerState: CircuitBreakerState;
  consecutiveErrors: number;
  lastSuccessTs: string | null;       // ISO-8601 UTC of last successful poll
  lastErrorTs: string | null;
  lastErrorMessage: string | null;
  pollsTotal: number;
  pollsSucceeded: number;
  pollsFailed: number;
  rateLimitTokensRemaining: number;
  dataFreshness: number;             // Seconds since last successful data retrieval
  isStale: boolean;                   // dataFreshness > 2 × pollIntervalMs/1000
}

export interface FeedHealthReport {
  timestamp: string;                  // ISO-8601 UTC
  overallStatus: 'NOMINAL' | 'DEGRADED' | 'CRITICAL';
  feeds: FeedHealth[];
  tier1AllHealthy: boolean;
  tier2AllHealthy: boolean;
  tier3AllHealthy: boolean;
  degradedFeedCount: number;
  openCircuitBreakers: string[];     // Feed IDs with OPEN circuit breaker
}
```

---

### Romania Bounding Box

```typescript
// geo/romania-bbox.ts — canonical Romania bounding box and subregion helpers

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export const ROMANIA_BBOX: Readonly<BoundingBox> = {
  minLat: 43.5,
  maxLat: 48.5,
  minLon: 20.2,
  maxLon: 30.0,
} as const;

export const BUCHAREST_CENTRE = { lat: 44.43, lon: 26.10 } as const;

// SE Europe extended bbox for ACLED/GDELT intel (includes Moldova, Ukraine border)
export const SE_EUROPE_INTEL_BBOX: Readonly<BoundingBox> = {
  minLat: 43.0,
  maxLat: 50.0,
  minLon: 19.0,
  maxLon: 32.0,
} as const;
```

---

## No New Supabase Tables

W18 introduces zero database migrations. The existing Supabase schema (last migrated in W16) is unchanged. All W18 data is:

1. In-memory TypeScript objects with the types defined above
2. Emitted via NATS to subscribers
3. Accessible via the W14 DashboardApiServer REST API (new endpoints mounted in W18)
4. Not persisted to Supabase (GDPR compliance: aircraft positions must not be stored beyond 24h, and in-memory ring buffers are wiped on process restart)

If post-W18 audit trail requirements emerge, W19 may add a `feed_snapshots` table with a 24h TTL. That decision is deferred.
