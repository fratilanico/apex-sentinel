# APEX-SENTINEL W18 — API SPECIFICATION

## Internal API Contracts

This document defines the internal TypeScript API contracts between W18 components, and the REST API extensions mounted on the existing W14 DashboardApiServer. All interfaces use TypeScript types defined in DATABASE_SCHEMA.md.

---

## FR-W18-01: EuDataFeedRegistry

```typescript
export class EuDataFeedRegistry {
  // Register a new feed
  register(config: FeedRegistration): void;

  // Deregister (stops monitoring, removes from health report)
  deregister(feedId: string): void;

  // Health snapshot for all registered feeds
  getHealthReport(): FeedHealthReport;

  // Health for a single feed
  getFeedHealth(feedId: string): FeedHealth | null;

  // Token bucket consumption — returns true if request permitted
  tryConsume(feedId: string): boolean;

  // Report a successful poll (resets error count, updates lastSuccessTs)
  reportSuccess(feedId: string): void;

  // Report a failed poll (increments errors, may open circuit breaker)
  reportError(feedId: string, error: Error): void;

  // Get circuit breaker state
  getCircuitBreakerState(feedId: string): CircuitBreakerState;

  // Force circuit breaker to CLOSED (manual reset by operator)
  resetCircuitBreaker(feedId: string): void;

  // EventEmitter interface — emits 'health_change' when any feed state changes
  on(event: 'health_change', handler: (report: FeedHealthReport) => void): void;
  on(event: 'circuit_open', handler: (feedId: string) => void): void;
  on(event: 'circuit_closed', handler: (feedId: string) => void): void;
}
```

**Default Feed Registrations** (registered at EuDataIntegrationPipeline startup):

| Feed ID | Tier | Poll Interval | Rate Limit | Auth Required |
|---------|------|---------------|------------|---------------|
| `opensky` | 1 | 10,000ms | 10 req/min | No (anon), `OPENSKY_USERNAME`+`OPENSKY_PASSWORD` (registered) |
| `adsbexchange` | 1 | 15,000ms | 1 req/s | `ADSBEXCHANGE_API_KEY` |
| `adsbfi` | 1 | 20,000ms | 10 req/min | No |
| `ead-notam` | 1 | 300,000ms | 60 req/hour | `NOTAM_EAD_API_KEY` |
| `easa-uas` | 2 | 300,000ms | 30 req/hour | No (public beta) |
| `osm-overpass` | 2 | 86,400,000ms | 5 req/min | No |
| `open-meteo` | 2 | 300,000ms | 60 req/min | No |
| `openweathermap` | 2 | 300,000ms | 60 req/min | `OWM_API_KEY` |
| `acled` | 3 | 1,800,000ms | 1 req/min | `ACLED_EMAIL`+`ACLED_API_KEY` |
| `firms` | 3 | 1,800,000ms | 1 req/min | `FIRMS_API_KEY` |
| `gdelt` | 3 | 1,800,000ms | 1 req/s | No |
| `opencellid` | 4 | 86,400,000ms | once/day | `OPENCELLID_API_KEY` |
| `hdx` | 4 | 86,400,000ms | once/day | No |

---

## FR-W18-02: AircraftPositionAggregator

```typescript
export class AircraftPositionAggregator extends EventEmitter {
  constructor(options: {
    registry: EuDataFeedRegistry;
    bbox?: BoundingBox;                    // default ROMANIA_BBOX
    httpClient?: typeof fetch;
    openSkyCredentials?: { username: string; password: string };
    adsbExchangeApiKey?: string;
  });

  // Start polling all 3 sources
  start(): Promise<void>;

  // Stop all polling
  stop(): Promise<void>;

  // Get current deduplicated aircraft snapshot
  getCurrentAircraft(): AircraftState[];

  // Get single aircraft by ICAO24
  getAircraft(icao24: string): AircraftState | null;

  // Get aircraft within radius of a point (metres)
  getAircraftNear(lat: number, lon: number, radiusM: number): AircraftState[];

  // Events
  on(event: 'update', handler: (aircraft: AircraftState[]) => void): void;
  on(event: 'emergency', handler: (aircraft: AircraftState) => void): void;
  on(event: 'zone_breach', handler: (event: ZoneBreachEvent) => void): void;
  on(event: 'error', handler: (feedId: string, error: Error) => void): void;
}

export interface ZoneBreachEvent {
  aircraft: AircraftState;
  zone: ProtectedZone;
  breachType: 'APPROACHING' | 'BREACH' | 'CRITICAL';
  distanceM: number;
  timestamp: string;
}
```

**OpenSky REST API Endpoint:**
```
GET https://opensky-network.org/api/states/all
  ?lamin=43.5&lomin=20.2&lamax=48.5&lomax=30.0

Response (OpenSky StateVector):
{
  "time": 1711234567,
  "states": [
    [
      "4b1800",    // [0] icao24
      "SWR204  ",  // [1] callsign
      "Switzerland", // [2] origin_country
      1711234560,  // [3] time_position
      1711234565,  // [4] last_contact
      8.5481,      // [5] longitude
      47.4568,     // [6] latitude
      10972.8,     // [7] baro_altitude
      false,       // [8] on_ground
      253.6,       // [9] velocity (m/s)
      42.0,        // [10] true_track
      0.0,         // [11] vertical_rate
      null,        // [12] sensors
      11277.6,     // [13] geo_altitude
      "3406",      // [14] squawk
      false,       // [15] spi
      0            // [16] position_source
    ]
  ]
}
```

**ADS-B Exchange API Endpoint:**
```
GET https://adsbexchange.com/api/aircraft/json/lat/44.43/lon/26.10/dist/400/
  Headers: api-auth: {ADSBEXCHANGE_API_KEY}

Response:
{
  "ac": [
    {
      "hex": "4b1800",
      "flight": "SWR204",
      "lat": "47.45",
      "lon": "8.54",
      "alt": "36000",
      "spd": "493",
      "hdg": "42",
      "vsi": "0",
      "squawk": "3406",
      "category": "A3"
    }
  ],
  "total": 847
}
```

**adsb.fi REST API Endpoint:**
```
GET https://api.adsb.fi/v1/aircraft
  ?lat_min=43.5&lon_min=20.2&lat_max=48.5&lon_max=30.0

Response (ADSB.fi format):
{
  "aircraft": [
    {
      "icao": "4b1800",
      "cs": "SWR204",
      "lat": 47.4568,
      "lon": 8.5481,
      "alt_baro": 36000,
      "gs": 493,
      "track": 42.0,
      "baro_rate": 0
    }
  ]
}
```

---

## FR-W18-03: NotamIngestor

```typescript
export class NotamIngestor extends EventEmitter {
  constructor(options: {
    registry: EuDataFeedRegistry;
    icaoLocations?: string[];              // Default: all Romanian FIRs
    eadApiKey?: string;                    // NOTAM_EAD_API_KEY
    httpClient?: typeof fetch;
  });

  start(): Promise<void>;
  stop(): Promise<void>;

  // Get all currently active NOTAMs
  getActiveNotams(): NotamRestriction[];

  // Get NOTAMs that contain a given point (polygon containment check)
  getNotamsAt(lat: number, lon: number, altitudeFt: number): NotamRestriction[];

  // Parse a raw ICAO NOTAM string to NotamRestriction (exposed for testing)
  parseNotam(raw: string): NotamRestriction | null;

  on(event: 'notam_activated', handler: (notam: NotamRestriction) => void): void;
  on(event: 'notam_expired', handler: (notam: NotamRestriction) => void): void;
  on(event: 'update', handler: (active: NotamRestriction[]) => void): void;
}
```

**EAD API Query (ICAO format):**
```
POST https://www.ead.eurocontrol.int/publicuser/retrieve/notam/filteredByIcaoLocation
  Content-Type: application/json
  Authorization: Bearer {NOTAM_EAD_API_KEY}

Request:
{
  "icaoLocation": ["LROP", "LRCL", "LRTR", "LRCK", "LRBS", "LRBB"],
  "type": ["NOTAM"],
  "status": ["ACTIVE", "PENDING"],
  "createdAfter": "2026-01-01T00:00:00Z"
}
```

**NOTAM ICAO Format Example:**
```
A1234/26 NOTAMR A0012/26
Q) LRBB/QRDCA/IV/BO /AE/000/120/4457N02605E005
A) LROP
B) 2603270700
C) 2603271900
D) MON-FRI SS-SR
E) RESTRICTED AREA LR-P114 ACTIVATED.
   DJI AND OTHER UAS PROHIBITED BELOW 1200FT AMSL.
   ATC CLEARANCE REQUIRED FOR ALL IFR TRAFFIC.
F) GND
G) 1200FT AMSL
```

Parsing rules:
- Q-line field 2 (`QRDCA`): Q=NOTAM qualifier, R=Restricted, D=Danger/Duration, CA=category
- Q-line field 6 (coordinates + radius): e.g. `4457N02605E005` = 44.57°N, 26.05°E, 5NM radius
- B-line: effective from YYMMDDHHMM UTC
- C-line: effective to YYMMDDHHMM UTC (or PERM)
- F-line: lower limit
- G-line: upper limit

---

## FR-W18-04: EasaUasZoneLoader

```typescript
export class EasaUasZoneLoader extends EventEmitter {
  constructor(options: {
    registry: EuDataFeedRegistry;
    countryCode?: string;                  // Default: "RO"
    httpClient?: typeof fetch;
  });

  start(): Promise<void>;
  stop(): Promise<void>;

  // Get all loaded U-space zones
  getZones(): UasZone[];

  // Get zones applicable at a specific point and altitude
  getZonesAt(lat: number, lon: number, altitudeM: number): UasZone[];

  // Get zones by type
  getZonesByType(type: UasZoneType): UasZone[];

  on(event: 'loaded', handler: (zones: UasZone[]) => void): void;
  on(event: 'update', handler: (zones: UasZone[]) => void): void;
}
```

**EASA drone.rules.eu API:**
```
GET https://drone-rules.dev.drone.eu/api/v1/uas-zones/filter
  Accept: application/json
  Content-Type: application/json

Request body:
{
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [20.2, 43.5], [30.0, 43.5], [30.0, 48.5], [20.2, 48.5], [20.2, 43.5]
    ]]
  },
  "startDateTime": "2026-03-27T00:00:00Z",
  "endDateTime": "2026-03-28T00:00:00Z",
  "requestID": "apex-sentinel-w18"
}

Response:
{
  "UASZoneList": [
    {
      "identifier": "RO-LROP-UAS-PROHIB",
      "name": "Henri Coandă Airport Drone Prohibition Zone",
      "type": "PROHIBITED",
      "country": "RO",
      "restriction": "PROHIBITED",
      "flightCondition": {
        "lowerLimit": {"value": 0, "unit": "M", "reference": "AGL"},
        "upperLimit": {"value": 120, "unit": "M", "reference": "AGL"}
      },
      "applicableTimePeriod": null,
      "geometry": { "type": "Polygon", "coordinates": [...] },
      "authority": {"name": "AACR", "contactName": "AACR UAS Authority"}
    }
  ]
}
```

---

## FR-W18-05: CriticalInfrastructureLoader

```typescript
export class CriticalInfrastructureLoader extends EventEmitter {
  constructor(options: {
    registry: EuDataFeedRegistry;
    bbox?: BoundingBox;                    // Default: ROMANIA_BBOX
    httpClient?: typeof fetch;
    includeHardcoded?: boolean;            // Default: true (always include canonical zones)
  });

  start(): Promise<void>;
  stop(): Promise<void>;

  getZones(): ProtectedZone[];
  getZoneById(id: string): ProtectedZone | null;
  getZonesContaining(lat: number, lon: number): ProtectedZone[];
  checkBreach(aircraft: AircraftState): ZoneBreachEvent | null;

  on(event: 'loaded', handler: (zones: ProtectedZone[]) => void): void;
  on(event: 'breach', handler: (event: ZoneBreachEvent) => void): void;
}
```

**OSM Overpass API Query:**
```
POST https://overpass-api.de/api/interpreter
  Content-Type: application/x-www-form-urlencoded

data=[out:json][timeout:60];
(
  node["aeroway"="aerodrome"](43.5,20.2,48.5,30.0);
  way["aeroway"="aerodrome"](43.5,20.2,48.5,30.0);
  node["power"="plant"]["generator:source"="nuclear"](43.5,20.2,48.5,30.0);
  way["landuse"="military"](43.5,20.2,48.5,30.0);
  node["military"="airfield"](43.5,20.2,48.5,30.0);
  node["power"="substation"]["voltage"~"^(110|220|400)000$"](43.5,20.2,48.5,30.0);
);
out body center;
```

---

## FR-W18-06: AtmosphericConditionProvider

```typescript
export class AtmosphericConditionProvider extends EventEmitter {
  constructor(options: {
    registry: EuDataFeedRegistry;
    lat?: number;                          // Default: 44.43 (Bucharest)
    lon?: number;                          // Default: 26.10 (Bucharest)
    owmApiKey?: string;                    // OWM_API_KEY env var
    httpClient?: typeof fetch;
  });

  start(): Promise<void>;
  stop(): Promise<void>;

  // Get latest conditions (cached until next poll)
  getConditions(): DroneFlightConditions | null;

  // Calculate flyability score for specific conditions
  calculateFlyability(conditions: Partial<DroneFlightConditions>): number;

  on(event: 'update', handler: (conditions: DroneFlightConditions) => void): void;
  on(event: 'warning', handler: (flag: keyof AtmosphericFlags, value: unknown) => void): void;
}
```

**open-meteo API (W9 existing client, reconfigured):**
```
GET https://api.open-meteo.com/v1/forecast
  ?latitude=44.43&longitude=26.10
  &current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,
           temperature_2m,precipitation,visibility,
           cloud_cover,weather_code
  &wind_speed_unit=ms
  &forecast_days=1
```

**OpenWeatherMap API (new in W18):**
```
GET https://api.openweathermap.org/data/2.5/weather
  ?lat=44.43&lon=26.10&appid={OWM_API_KEY}&units=metric

Response extract:
{
  "main": {"temp": 12.5, "humidity": 65, "pressure": 1013},
  "wind": {"speed": 4.2, "deg": 220, "gust": 7.1},
  "visibility": 8000,
  "weather": [{"id": 800, "main": "Clear", "description": "clear sky"}],
  "clouds": {"all": 0}
}
```

---

## FR-W18-07: SecurityEventCorrelator

```typescript
export class SecurityEventCorrelator extends EventEmitter {
  constructor(options: {
    registry: EuDataFeedRegistry;
    bbox?: BoundingBox;                    // Default: SE_EUROPE_INTEL_BBOX
    protectedZones?: ProtectedZone[];      // From CriticalInfrastructureLoader
    acledApiKey?: string;                  // ACLED_API_KEY
    acledEmail?: string;                   // ACLED_EMAIL
    firmsApiKey?: string;                  // FIRMS_API_KEY
    httpClient?: typeof fetch;
    correlationRadiusKm?: number;          // Default: 25
  });

  start(): Promise<void>;
  stop(): Promise<void>;

  getRecentEvents(windowHours?: number): SecurityEvent[];  // Default: 24h
  getAlertsForZone(zoneId: string): SecurityAlert[];
  correlateWithZones(events: SecurityEvent[]): SecurityAlert[];

  on(event: 'security_event', handler: (event: SecurityEvent) => void): void;
  on(event: 'security_alert', handler: (alert: SecurityAlert) => void): void;
}
```

**ACLED API:**
```
GET https://api.acleddata.com/acled/read
  ?key={ACLED_API_KEY}
  &email={ACLED_EMAIL}
  &latitude=46.0&longitude=25.0
  &radius=500
  &start_date=2026-03-20
  &fields=event_id_cnty,event_date,event_type,latitude,longitude,
          country,location,fatalities,notes,source
  &limit=500
```

**FIRMS API:**
```
GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/{FIRMS_API_KEY}/VIIRS_SNPP_NRT/
    world/1/2026-03-27
  (filter bbox post-download: 43.5,20.2,48.5,30.0)
```

**GDELT GEO API:**
```
GET https://api.gdeltproject.org/api/v2/geo/geo
  ?query=romania+OR+moldova+drone+OR+uas+OR+security
  &format=GeoJSON
  &GEORES=1
  &TIMESPAN=LAST24H
  &MAXROWS=250

(W9 GdeltClient extended with Romania keywords and SE_EUROPE_INTEL_BBOX)
```

---

## FR-W18-08: EuDataIntegrationPipeline

```typescript
export class EuDataIntegrationPipeline extends EventEmitter {
  constructor(options: {
    nats?: NatsClient;
    httpClient?: typeof fetch;
    env?: Record<string, string>;          // Override process.env for testing
    feedOverrides?: Partial<FeedTimeouts>; // Override poll intervals for testing
  });

  // Start all feeds in dependency order
  start(): Promise<void>;

  // Graceful shutdown (drains in-flight polls, closes all connections)
  stop(): Promise<void>;

  // Sub-component access
  registry: EuDataFeedRegistry;
  aircraftAggregator: AircraftPositionAggregator;
  notamIngestor: NotamIngestor;
  uasZoneLoader: EasaUasZoneLoader;
  infraLoader: CriticalInfrastructureLoader;
  atmosphericProvider: AtmosphericConditionProvider;
  securityCorrelator: SecurityEventCorrelator;

  // Composite health (delegates to registry)
  getHealthReport(): FeedHealthReport;

  // Events
  on(event: 'started', handler: () => void): void;
  on(event: 'stopped', handler: () => void): void;
  on(event: 'health_degraded', handler: (report: FeedHealthReport) => void): void;
  on(event: 'health_critical', handler: (report: FeedHealthReport) => void): void;
}
```

---

## REST API Extensions (W14 DashboardApiServer mount points)

W18 adds the following routes to the existing DashboardApiServer:

| Method | Path | Handler | Response |
|--------|------|---------|----------|
| GET | `/api/eu/aircraft` | AircraftPositionAggregator.getCurrentAircraft() | AircraftState[] |
| GET | `/api/eu/aircraft/:icao24` | AircraftPositionAggregator.getAircraft(icao24) | AircraftState \| 404 |
| GET | `/api/eu/notams` | NotamIngestor.getActiveNotams() | NotamRestriction[] |
| GET | `/api/eu/notams/at?lat&lon&alt` | NotamIngestor.getNotamsAt(lat,lon,alt) | NotamRestriction[] |
| GET | `/api/eu/uas-zones` | EasaUasZoneLoader.getZones() | UasZone[] |
| GET | `/api/eu/uas-zones/at?lat&lon&alt` | EasaUasZoneLoader.getZonesAt(lat,lon,alt) | UasZone[] |
| GET | `/api/eu/protected-zones` | CriticalInfrastructureLoader.getZones() | ProtectedZone[] |
| GET | `/api/eu/atmosphere` | AtmosphericConditionProvider.getConditions() | DroneFlightConditions |
| GET | `/api/eu/security-events` | SecurityEventCorrelator.getRecentEvents() | SecurityEvent[] |
| GET | `/api/eu/security-events/zone/:zoneId` | SecurityEventCorrelator.getAlertsForZone(id) | SecurityAlert[] |
| GET | `/api/feeds/health` | EuDataFeedRegistry.getHealthReport() | FeedHealthReport |

All responses: `Content-Type: application/json`, no authentication (same as W14 dashboard).
Error format: `{ "error": "string", "code": "string" }`
