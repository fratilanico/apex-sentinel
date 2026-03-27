# APEX-SENTINEL W18 — TEST STRATEGY

## TDD Approach for EU Data Integration Layer

---

## TDD Protocol

W18 follows the APEX-SENTINEL TDD law:

1. **TDD RED first**: Write failing test files for all 8 FRs before writing source code
2. **Commit RED**: `git commit -m "test(w18): tdd-red FR-W18-01 through FR-W18-08"`
3. **Implement to GREEN**: Write production code to pass tests
4. **Commit GREEN**: `git commit -m "feat(w18): implement EU data integration layer"`
5. **Verification gate**: `npx vitest run --coverage` + `npx tsc --noEmit` + `npm run build`

---

## Test Files (8 FR test files + 1 geo utilities test file)

| Test File | FR | Target Tests | Location |
|-----------|-----|-------------|----------|
| `eu-data-feed-registry.test.ts` | W18-01 | 15 | `tests/unit/` |
| `aircraft-position-aggregator.test.ts` | W18-02 | 20 | `tests/unit/` |
| `notam-ingestor.test.ts` | W18-03 | 20 | `tests/unit/` |
| `easa-uas-zone-loader.test.ts` | W18-04 | 15 | `tests/unit/` |
| `critical-infrastructure-loader.test.ts` | W18-05 | 18 | `tests/unit/` |
| `atmospheric-condition-provider.test.ts` | W18-06 | 15 | `tests/unit/` |
| `security-event-correlator.test.ts` | W18-07 | 18 | `tests/unit/` |
| `eu-data-integration-pipeline.test.ts` | W18-08 | 20 | `tests/unit/` |
| `geo-utils.test.ts` | geo/ | 15 | `tests/unit/` |
| **Total** | | **156** | |

Minimum 156 tests. Some FRs will exceed targets if edge cases require it.

---

## Mock Strategy for External APIs

All external HTTP calls are **injected via constructor `httpClient` parameter**. Tests never make real network calls.

### Mock Factory Pattern

```typescript
// tests/unit/fixtures/eu-feed-mocks.ts

export function makeOpenSkyResponse(aircraft: Partial<OpenSkyStateVector>[] = []): object {
  return {
    time: Math.floor(Date.now() / 1000),
    states: aircraft.map(a => [
      a.icao24 ?? '4b1800',
      a.callsign ?? 'TEST001',
      'Romania',
      Math.floor(Date.now() / 1000) - 5,
      Math.floor(Date.now() / 1000),
      a.longitude ?? 26.10,
      a.latitude ?? 44.43,
      a.altBaro ?? 1000,
      a.onGround ?? false,
      a.velocity ?? 100,
      a.heading ?? 90,
      a.verticalRate ?? 0,
      null,
      a.altGeo ?? 1050,
      a.squawk ?? '2000',
      false,
      0
    ])
  };
}

export function makeAdsbExchangeResponse(aircraft: Partial<AdsbExAircraft>[] = []): object {
  return {
    ac: aircraft.map(a => ({
      hex: a.hex ?? '4b1800',
      flight: a.flight ?? 'TEST001',
      lat: String(a.lat ?? 44.43),
      lon: String(a.lon ?? 26.10),
      alt: String(a.alt ?? 3281),
      spd: String(a.spd ?? 195),
      hdg: String(a.hdg ?? 90),
      vsi: String(a.vsi ?? 0),
      squawk: a.squawk ?? '2000',
      category: a.category ?? 'A3'
    })),
    total: aircraft.length
  };
}

export function makeNotamText(overrides: Partial<NotamTextParts> = {}): string {
  return [
    `${overrides.id ?? 'A1234/26'} NOTAMN`,
    `Q) LRBB/${overrides.qCode ?? 'QRDCA'}/IV/BO /AE/000/120/${overrides.coord ?? '4457N02605E005'}`,
    `A) ${overrides.location ?? 'LROP'}`,
    `B) ${overrides.from ?? '2603270700'}`,
    `C) ${overrides.to ?? '2603271900'}`,
    `E) ${overrides.text ?? 'UAS PROHIBITED BELOW 1200FT AMSL.'}`,
    `F) GND`,
    `G) 1200FT AMSL`
  ].join('\n');
}

export function makeEasaZoneResponse(zones: Partial<EasaZoneRaw>[] = []): object {
  return {
    UASZoneList: zones.map(z => ({
      identifier: z.identifier ?? 'RO-TEST-001',
      name: z.name ?? 'Test Zone Romania',
      type: z.type ?? 'PROHIBITED',
      country: 'RO',
      restriction: z.restriction ?? 'PROHIBITED',
      flightCondition: {
        lowerLimit: { value: 0, unit: 'M', reference: 'AGL' },
        upperLimit: { value: 120, unit: 'M', reference: 'AGL' }
      },
      applicableTimePeriod: null,
      geometry: {
        type: 'Polygon',
        coordinates: [[[26.0, 44.4], [26.2, 44.4], [26.2, 44.6], [26.0, 44.6], [26.0, 44.4]]]
      },
      authority: { name: 'AACR' }
    }))
  };
}

export function makeAcledResponse(events: Partial<AcledEvent>[] = []): object {
  return {
    success: true,
    count: events.length,
    data: events.map(e => ({
      event_id_cnty: e.event_id_cnty ?? 'RO001',
      event_date: e.event_date ?? '2026-03-27',
      event_type: e.event_type ?? 'Protests',
      latitude: String(e.latitude ?? 44.43),
      longitude: String(e.longitude ?? 26.10),
      country: e.country ?? 'Romania',
      location: e.location ?? 'Bucharest',
      fatalities: e.fatalities ?? '0',
      notes: e.notes ?? 'Peaceful demonstration',
      source: 'Test Source'
    }))
  };
}

export function makeOpenMeteoResponse(overrides: Partial<OpenMeteoCurrentResponse> = {}): object {
  return {
    current: {
      wind_speed_10m: overrides.wind_speed_10m ?? 4.2,
      wind_direction_10m: overrides.wind_direction_10m ?? 220,
      wind_gusts_10m: overrides.wind_gusts_10m ?? 7.1,
      temperature_2m: overrides.temperature_2m ?? 12.5,
      precipitation: overrides.precipitation ?? 0,
      visibility: overrides.visibility ?? 8000,
      cloud_cover: overrides.cloud_cover ?? 20,
      weather_code: overrides.weather_code ?? 0,
      time: new Date().toISOString()
    }
  };
}
```

---

## FR-W18-01: EuDataFeedRegistry Tests

```typescript
describe('FR-W18-01: EuDataFeedRegistry', () => {
  describe('registration', () => {
    it('registers a feed with all required fields');
    it('deregisters a feed and removes from health report');
    it('throws if feed ID already registered');
    it('returns null health for unregistered feed ID');
  });

  describe('token bucket', () => {
    it('tryConsume returns true when tokens available');
    it('tryConsume returns false when bucket exhausted');
    it('bucket refills after interval');
    it('different feeds have independent buckets');
  });

  describe('circuit breaker', () => {
    it('starts in CLOSED state');
    it('opens after 3 consecutive errors');
    it('transitions to HALF_OPEN after cooldown');
    it('closes on successful HALF_OPEN probe');
    it('re-opens on failed HALF_OPEN probe');
    it('manual reset returns to CLOSED from OPEN');
  });

  describe('health report', () => {
    it('reports NOMINAL when all feeds healthy');
    it('reports DEGRADED when any Tier-1 feed OPEN');
    it('reports CRITICAL when all Tier-1 feeds OPEN');
    it('emits health_change event on state transition');
    it('emits circuit_open event when breaker opens');
  });
});
```

---

## FR-W18-02: AircraftPositionAggregator Tests

```typescript
describe('FR-W18-02: AircraftPositionAggregator', () => {
  describe('deduplication', () => {
    it('deduplicates aircraft with same ICAO24 across sources');
    it('keeps most recent position when ICAO24 appears in multiple sources');
    it('emits array with no duplicate ICAO24 values');
    it('handles empty response from one source gracefully');
    it('handles all 3 sources returning same aircraft');
  });

  describe('ADS-B source parsing', () => {
    it('parses OpenSky state vector array correctly');
    it('parses ADS-B Exchange JSON format correctly');
    it('parses adsb.fi JSON format correctly');
    it('maps squawk 7700 to emergencyFlag=emergency');
    it('maps squawk 7600 to emergencyFlag=radio_failure');
    it('maps squawk 7500 to emergencyFlag=hijack');
  });

  describe('UAS threat classification', () => {
    it('classifies aircraft below 120m with no callsign as Cat-A');
    it('classifies aircraft with no ICAO24 as Cat-D');
    it('classifies aircraft with 000xxx ICAO24 as Cat-D');
    it('does not classify commercial airliner as threat category');
  });

  describe('zone breach detection', () => {
    it('emits zone_breach when aircraft enters protected zone radius');
    it('emits APPROACHING breach type at alertRadiusM');
    it('emits CRITICAL breach type at criticalRadiusM');
  });

  describe('error handling', () => {
    it('continues with remaining sources if one HTTP request fails');
    it('reports error to registry on HTTP failure');
    it('emits stale aircraft with staleness flag if all sources fail');
  });
});
```

---

## FR-W18-03: NotamIngestor Tests

```typescript
describe('FR-W18-03: NotamIngestor', () => {
  describe('ICAO NOTAM parsing', () => {
    it('parses Series/Number/Year from first line correctly');
    it('parses Q-line NOTAM type from qCode field 2');
    it('parses Q-line centre coordinates in DDMMN/DDDMME format');
    it('parses Q-line radius in nautical miles');
    it('parses B-line effective-from in YYMMDDHHMM UTC');
    it('parses C-line effective-to correctly');
    it('parses C-line PERM as permanent restriction');
    it('parses F-line lower limit: GND, altitude, FL');
    it('parses G-line upper limit: UNL, altitude, FL');
    it('extracts E-line full text description');
    it('sets appliesToUas=true when E-line contains UAS/drone keywords');
  });

  describe('NOTAM lifecycle', () => {
    it('emits notam_activated for new active NOTAM');
    it('emits notam_expired when NOTAM passes C-line time');
    it('removes expired NOTAMs from getActiveNotams()');
    it('returns empty array when no NOTAMs active');
  });

  describe('coordinate containment', () => {
    it('getNotamsAt returns NOTAM when point inside circular area');
    it('getNotamsAt returns empty when point outside all NOTAMs');
    it('respects altitude bounds in containment check');
  });

  describe('error handling', () => {
    it('returns null for malformed NOTAM text');
    it('skips unparseable NOTAM and continues processing others');
  });
});
```

---

## FR-W18-04: EasaUasZoneLoader Tests

```typescript
describe('FR-W18-04: EasaUasZoneLoader', () => {
  it('loads PROHIBITED zones and marks type correctly');
  it('loads RESTRICTED zones and marks type correctly');
  it('loads CONDITIONAL zones with time periods');
  it('filters zones to Romania bbox only');
  it('getZonesAt returns zones containing the point');
  it('getZonesAt returns empty array for point outside all zones');
  it('getZonesAt respects altitude bounds');
  it('getZonesByType returns only zones of requested type');
  it('uses last-known-good cache when API returns error');
  it('emits loaded event with zone array on first successful poll');
  it('emits update event on subsequent successful polls');
  it('handles empty UASZoneList response');
  it('parses flightCondition altitude limits correctly');
  it('maps authority.name to zone.authority');
  it('sets temporaryActivation=true for conditional zones with time periods');
});
```

---

## FR-W18-05: CriticalInfrastructureLoader Tests

```typescript
describe('FR-W18-05: CriticalInfrastructureLoader', () => {
  describe('hardcoded zones', () => {
    it('includes Henri Coandă 5km exclusion zone at correct coordinates');
    it('includes Henri Coandă 8km CTR zone');
    it('includes Cernavodă nuclear 10km exclusion at correct coordinates');
    it('includes Deveselu NATO 5km exclusion');
    it('includes Bucharest government district 2km exclusion');
    it('all hardcoded zones present regardless of OSM response');
  });

  describe('OSM Overpass integration', () => {
    it('adds airport zones from OSM aerodrome nodes');
    it('adds nuclear plant zones from OSM power=plant nuclear');
    it('adds military zones from OSM landuse=military');
    it('deduplicates OSM zones with matching hardcoded zones by name');
  });

  describe('breach detection', () => {
    it('returns ZoneBreachEvent when aircraft inside exclusion radius');
    it('returns APPROACHING type when aircraft inside alertRadiusM');
    it('returns CRITICAL type when aircraft inside criticalRadiusM');
    it('returns null when aircraft outside all zones');
    it('haversine distance calculation correct for Bucharest test case');
  });

  describe('caching', () => {
    it('does not re-query OSM within 24h cache window');
    it('returns cached zones if OSM request fails');
  });
});
```

---

## FR-W18-06: AtmosphericConditionProvider Tests

```typescript
describe('FR-W18-06: AtmosphericConditionProvider', () => {
  describe('data merging', () => {
    it('uses open-meteo as primary source');
    it('supplements with OWM when API key present');
    it('falls back to open-meteo-only when OWM unavailable');
    it('timestamp reflects most recent update');
  });

  describe('flyability score', () => {
    it('scores 100 for ideal conditions (wind<5, vis>5km, no precip, 15°C)');
    it('scores 0 for wind > 12 m/s');
    it('scores 0 for thunderstorm weather code');
    it('scores 0 for visibility < 500m');
    it('reduces score for wind 8-12 m/s by 40 points');
    it('reduces score for precipitation > 0 by 10 points');
    it('reduces score for precipitation > 2 mm/h by 25 points');
    it('reduces score for temperature < -10°C by 20 points');
    it('clamps score minimum to 0');
  });

  describe('acoustic range factor', () => {
    it('returns 1.0 for calm conditions');
    it('returns 0.75 for wind > 8 m/s');
    it('returns 0.60 for wind > 12 m/s');
    it('reduces factor for heavy precipitation');
    it('clamps factor between 0.40 and 1.20');
  });

  describe('flags', () => {
    it('sets highWind=true when wind > 12 m/s');
    it('sets freezingConditions=true when temp < 0°C');
    it('sets lowVisibility=true when visibility < 1000m');
    it('sets precipitation=true when precipMmh > 0');
  });
});
```

---

## FR-W18-07: SecurityEventCorrelator Tests

```typescript
describe('FR-W18-07: SecurityEventCorrelator', () => {
  describe('ACLED integration', () => {
    it('parses ACLED event correctly to SecurityEvent');
    it('maps event_type=Battles to type=ARMED_CONFLICT');
    it('maps event_type=Protests to type=PROTEST');
    it('maps event_type=Explosions/Remote violence to type=EXPLOSION');
    it('stores goldsteinScale from ACLED response');
  });

  describe('FIRMS integration', () => {
    it('parses FIRMS CSV row to SecurityEvent with type=THERMAL_ANOMALY');
    it('filters FIRMS results to Romania bbox');
    it('maps confidence column to firmsBrightness');
  });

  describe('GDELT integration', () => {
    it('parses GDELT GeoJSON feature to SecurityEvent');
    it('extracts GoldsteinScale from GDELT properties');
    it('uses Romania-focused keywords');
  });

  describe('proximity correlation', () => {
    it('sets nearestProtectedZone when event within correlationRadius');
    it('sets withinAlertRadius=true when inside alertRadiusM');
    it('sets withinCriticalRadius=true when inside criticalRadiusM');
    it('sets nearestProtectedZone=null when event outside all zones');
    it('emits security_alert when event within alert radius');
  });

  describe('ring buffer', () => {
    it('getRecentEvents(24) returns only last 24h events');
    it('evicts events older than window');
  });
});
```

---

## FR-W18-08: EuDataIntegrationPipeline Tests

```typescript
describe('FR-W18-08: EuDataIntegrationPipeline', () => {
  it('starts all sub-components in dependency order');
  it('stops all sub-components gracefully');
  it('exposes registry, aircraftAggregator, etc. as public properties');
  it('getHealthReport delegates to registry.getHealthReport()');
  it('emits started event after all components start');
  it('emits stopped event after all components stop');

  describe('graceful degradation', () => {
    it('starts successfully even if one Tier-3 feed fails to initialize');
    it('emits health_degraded if Tier-1 feed circuit breaker opens');
    it('emits health_critical if all Tier-1 feeds circuit breaker open');
    it('continues processing Tier-2 data when Tier-1 feeds fail');
    it('getHealthReport.overallStatus=DEGRADED when ≥1 feed OPEN');
    it('getHealthReport.overallStatus=CRITICAL when all Tier-1 OPEN');
    it('getHealthReport.overallStatus=NOMINAL when all feeds healthy');
  });

  describe('configuration', () => {
    it('applies feedOverrides to poll intervals in tests');
    it('reads API keys from env parameter');
    it('does not throw if optional API keys are missing (degrades gracefully)');
  });
});
```

---

## Geo Utilities Tests

```typescript
describe('geo utilities', () => {
  describe('haversine distance', () => {
    it('calculates 0 distance between identical points');
    it('calculates correct distance Bucharest to Henri Coandă (~20km)');
    it('calculates correct distance Bucharest to Cernavodă (~170km)');
    it('symmetric: dist(A,B) === dist(B,A)');
    it('handles antimeridian correctly');
  });

  describe('point-in-polygon (ray casting)', () => {
    it('returns true for point inside convex polygon');
    it('returns false for point outside convex polygon');
    it('handles polygon with hole (multipolygon ring)');
    it('handles point exactly on boundary (edge case)');
    it('returns correct result for Bucharest centre inside Romania polygon');
  });

  describe('romania-bbox', () => {
    it('Bucharest centre (44.43, 26.10) is within ROMANIA_BBOX');
    it('London (51.5, -0.12) is outside ROMANIA_BBOX');
    it('Constanța (44.17, 28.65) is within ROMANIA_BBOX');
    it('SE_EUROPE_INTEL_BBOX contains ROMANIA_BBOX');
  });
});
```

---

## Coverage Targets

| File | Branch | Function | Line | Statement |
|------|--------|----------|------|-----------|
| `eu-data-feed-registry.ts` | ≥80% | ≥90% | ≥85% | ≥85% |
| `aircraft-position-aggregator.ts` | ≥80% | ≥90% | ≥85% | ≥85% |
| `notam-ingestor.ts` | ≥80% | ≥85% | ≥85% | ≥85% |
| `easa-uas-zone-loader.ts` | ≥80% | ≥85% | ≥85% | ≥85% |
| `critical-infrastructure-loader.ts` | ≥80% | ≥90% | ≥85% | ≥85% |
| `atmospheric-condition-provider.ts` | ≥85% | ≥90% | ≥90% | ≥90% |
| `security-event-correlator.ts` | ≥80% | ≥85% | ≥85% | ≥85% |
| `eu-data-integration-pipeline.ts` | ≥75% | ≥85% | ≥80% | ≥80% |
| `geo/haversine.ts` | 100% | 100% | 100% | 100% |
| `geo/point-in-polygon.ts` | 100% | 100% | 100% | 100% |
| `geo/romania-bbox.ts` | 100% | 100% | 100% | 100% |

---

## Anti-Patterns to Avoid

1. **No real HTTP calls in unit tests** — all external APIs mocked via `httpClient` injection
2. **No `setTimeout`/`setInterval` in tests** — use Vitest fake timers `vi.useFakeTimers()`
3. **No test-specific `if` branches in production code** — test doubles only
4. **No shared mutable state between tests** — `beforeEach` resets all mocks
5. **No snapshot tests for structured data** — assert specific fields explicitly
6. **No testing of third-party library internals** — test W18 behaviour, not fetch/EventEmitter

---

## Integration Test Approach

Integration tests (against live APIs) are **not part of the CI suite**. They run manually:

```bash
# Set real API keys
export OPENSKY_USERNAME=apexsentinel
export OPENSKY_PASSWORD=...
export ADSBEXCHANGE_API_KEY=...
export FIRMS_API_KEY=...

# Run integration test file only
npx vitest run tests/integration/eu-feeds-live.test.ts
```

Integration test file (`tests/integration/eu-feeds-live.test.ts`) is NOT committed to CI. It validates:
- OpenSky returns aircraft within Romania bbox
- adsb.fi returns non-empty response
- open-meteo returns weather for Bucharest coordinates
- Flyability score is within 0–100 range for current conditions
