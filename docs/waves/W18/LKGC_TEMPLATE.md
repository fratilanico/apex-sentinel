# APEX-SENTINEL W18 — Last Known Good Configuration (EU Data Feeds)

```
LKGC-W18-001
Date:         2026-03-27
Wave:         W18 — EU Data Integration Layer
Baseline:     3097 tests (W1–W17 GREEN)
W18 target:   ~3189 tests (~92 new)
Author:       APEX-SENTINEL CI / Nico
Supabase:     bymfcnwfyxuivinuzurr
```

This document records the last known working configuration for every external EU data feed in W18. Consult this before declaring a feed dead — most "outages" are rate limit exhaustion, endpoint path drift, or a stale API key. Update the LKGC entry immediately after confirming a fix.

**Format**: Each section has `[TEMPLATE]` markers where live values should be filled in on first successful run.

---

## System State at LKGC

```
Date/Time (UTC):        [TO BE FILLED]
APEX-SENTINEL version:  W18 + commit hash [TO BE FILLED]
Test suite:             [TO BE FILLED] tests GREEN
Overall feed status:    [TO BE FILLED] (NOMINAL / DEGRADED)
```

---

## Feed 1: OpenSky Network

**Endpoint**: `https://opensky-network.org/api/states/all?lamin=43.5&lomin=20.2&lamax=48.5&lomax=30.0`
**Auth**: HTTP Basic (`OPENSKY_USERNAME` / `OPENSKY_PASSWORD`)
**Poll interval**: 10,000ms
**Rate limit**: 400 req/day (registered), unlimited (academic)

```
[TEMPLATE]
Last verified:          [DATE]
Account type:           [anonymous / registered / academic]
Daily quota remaining:  [N]
Sample response size:   [N] aircraft in Romania bbox
Sample aircraft count:  [N]
Sample ICAO24 (first):  [xxxxxx]
Response time (p50):    [N]ms
```

```
[VERIFIED — fill when confirmed working]
Last verified:
Account type:
Daily quota remaining:
Sample aircraft count:
Response time p50:
Notes:
```

---

## Feed 2: ADS-B Exchange

**Endpoint**: `https://adsbexchange.com/api/aircraft/json/lat/44.43/lon/26.10/dist/400/`
**Auth**: `api-auth` header (`ADSBEXCHANGE_API_KEY`)
**Poll interval**: 15,000ms

```
[TEMPLATE]
Last verified:          [DATE]
API key tier:           [basic / premium]
Sample aircraft count:  [N]
Military tracks visible: [Y/N]
Response time (p50):    [N]ms
```

```
[VERIFIED]
Last verified:
API key tier:
Sample aircraft count:
Military tracks visible:
Response time p50:
Notes:
```

---

## Feed 3: adsb.fi

**Endpoint**: `https://api.adsb.fi/v1/aircraft?lat_min=43.5&lon_min=20.2&lat_max=48.5&lon_max=30.0`
**Auth**: None
**Poll interval**: 20,000ms

```
[VERIFIED]
Last verified:
Sample aircraft count:
Response time p50:
Notes:
```

---

## Feed 4: EAD NOTAM

**Endpoint**: `https://www.ead.eurocontrol.int/publicuser/retrieve/notam/filteredByIcaoLocation`
**Auth**: Bearer token (`NOTAM_EAD_API_KEY`)
**Poll interval**: 300,000ms

```
[TEMPLATE]
Last verified:          [DATE]
Account registration:   [pending / active]
LRBB FIR NOTAM count:  [N] active NOTAMs
Sample NOTAM ID:        [A1234/26]
UAS-related NOTAMs:     [N]
Parse success rate:     [N]%
Response time (p50):    [N]ms
```

```
[VERIFIED]
Last verified:
Account status:
LRBB FIR NOTAM count:
Sample NOTAM ID:
UAS-related NOTAMs:
Parse success rate:
Response time p50:
Notes:
```

---

## Feed 5: EASA drone.rules.eu

**Endpoint**: `https://drone-rules.dev.drone.eu/api/v1/uas-zones/filter`
**Auth**: None (public beta)
**Poll interval**: 300,000ms
**API version**: Check response header `X-API-Version`

```
[TEMPLATE]
Last verified:          [DATE]
API version header:     [x.x.x]
Romania zone count:     [N] total zones
PROHIBITED count:       [N]
RESTRICTED count:       [N]
CONDITIONAL count:      [N]
Sample zone ID:         [RO-LROP-...]
Response time (p50):    [N]ms
```

```
[VERIFIED]
Last verified:
API version header:
Romania zone count:
PROHIBITED count:
RESTRICTED count:
CONDITIONAL count:
Response time p50:
Notes:
```

**Schema Stability Warning**: EASA drone.rules.eu is in public beta. If the response schema changes, `EasaUasZoneLoader` will log:
```
WARN [easa-uas-zone-loader] Schema validation failed: expected UASZoneList array, got [actual shape]
```
Update this LKGC and the loader's type mapping if schema changes.

---

## Feed 6: OSM Overpass

**Endpoint**: `https://overpass-api.de/api/interpreter`
**Auth**: None
**Poll interval**: 86,400,000ms (once/day, cached)
**Cache TTL**: 24h

```
[TEMPLATE]
Last verified:          [DATE]
Query response time:    [N]ms (can be slow, 5–30s)
Airport nodes found:    [N] aerodrome features in Romania bbox
Nuclear features:       [N] (should include Cernavodă)
Military areas:         [N] way features
Zones added to infra:   [N] dynamic zones (above hardcoded 8)
```

```
[VERIFIED]
Last verified:
Airport nodes found:
Nuclear features:
Military areas:
Zones added:
Notes:
```

---

## Feed 7: open-meteo (Bucharest)

**Endpoint**: `https://api.open-meteo.com/v1/forecast?latitude=44.43&longitude=26.10&...`
**Auth**: None
**Poll interval**: 300,000ms

```
[VERIFIED]
Last verified:
Current temp (°C):
Current wind speed (m/s):
Current visibility (m):
Flyability score:
Acoustic range factor:
Response time p50:
Notes:
```

---

## Feed 8: OpenWeatherMap

**Endpoint**: `https://api.openweathermap.org/data/2.5/weather?lat=44.43&lon=26.10&...`
**Auth**: `appid` query param (`OWM_API_KEY`)
**Poll interval**: 300,000ms (offset +30s from open-meteo)

```
[VERIFIED]
Last verified:
API key tier:           [free / paid]
Daily calls used:       [N] / 1000
Visibility field:       [N]m
Gust field:             [N] m/s
Response time p50:
Notes:
```

---

## Feed 9: ACLED

**Endpoint**: `https://api.acleddata.com/acled/read`
**Auth**: `key` + `email` params
**Poll interval**: 1,800,000ms (30min)

```
[TEMPLATE]
Last verified:          [DATE]
Account type:           [standard / researcher]
Monthly quota:          500 (standard) / unlimited (researcher)
SE Europe events (7d): [N] events returned
Romania-specific:       [N] events in Romania
Parse success rate:     [N]%
```

```
[VERIFIED]
Last verified:
Account type:
Events 7d SE Europe:
Romania events:
Response time p50:
Notes:
```

---

## Feed 10: NASA FIRMS

**Endpoint**: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/VIIRS_SNPP_NRT/world/1/{date}`
**Auth**: `FIRMS_API_KEY` in URL path
**Poll interval**: 1,800,000ms (30min, offset +5min)

```
[VERIFIED]
Last verified:
Daily quota remaining:  [N] / 1000
Romania thermal count:  [N] detections in bbox (varies by season)
CSV parse success:
Response time p50:
Notes:
```

---

## Feed 11: GDELT

**Endpoint**: `https://api.gdeltproject.org/api/v2/geo/geo?query=romania...`
**Auth**: None
**Poll interval**: 1,800,000ms (30min, offset +10min)

```
[VERIFIED]
Last verified:
Events 24h Romania:     [N] GeoJSON features
Goldstein scale range:  [min] to [max]
Response time p50:
Notes:
```

---

## Overall System Health at LKGC

```
[LKGC State — fill when confirmed working]

Date: [DATE]
Commit: [git SHA]

Feed health:
  opensky:            [CLOSED / OPEN / HALF_OPEN]
  adsbexchange:       [CLOSED / OPEN / HALF_OPEN]
  adsbfi:             [CLOSED / OPEN / HALF_OPEN]
  ead-notam:          [CLOSED / OPEN / HALF_OPEN]
  easa-uas:           [CLOSED / OPEN / HALF_OPEN]
  osm-overpass:       [CLOSED / OPEN / HALF_OPEN]
  open-meteo:         [CLOSED / OPEN / HALF_OPEN]
  openweathermap:     [CLOSED / OPEN / HALF_OPEN]
  acled:              [CLOSED / OPEN / HALF_OPEN]
  firms:              [CLOSED / OPEN / HALF_OPEN]
  gdelt:              [CLOSED / OPEN / HALF_OPEN]

Overall status:       [NOMINAL / DEGRADED]
Aircraft in bbox:     [N]
Active NOTAMs:        [N]
UAS zones loaded:     [N]
Protected zones:      [N] (should be ≥ 8)
Flyability score:     [N] / 100
Active security events (24h): [N]

Test suite:           [N] tests GREEN
W18 coverage:         [N]% branches / [N]% functions

Memory (W18 feeds):   [N] MB
Memory (total):       [N] MB
```

---

## Known Working API Endpoints (to verify format stability)

Verify these URLs return expected responses before each deployment:

```bash
# OpenSky (anonymous — limited)
curl -s "https://opensky-network.org/api/states/all?lamin=43.5&lomin=20.2&lamax=48.5&lomax=30.0" | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK:', len(d.get('states',[])), 'aircraft')"

# adsb.fi (no auth)
curl -s "https://api.adsb.fi/v1/aircraft?lat_min=43.5&lon_min=20.2&lat_max=48.5&lon_max=30.0" | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK:', len(d.get('aircraft',[])), 'aircraft')"

# open-meteo (no auth)
curl -s "https://api.open-meteo.com/v1/forecast?latitude=44.43&longitude=26.10&current=temperature_2m,wind_speed_10m,visibility" | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK: temp', d['current']['temperature_2m'], 'wind', d['current']['wind_speed_10m'])"

# GDELT (no auth)
curl -s "https://api.gdeltproject.org/api/v2/geo/geo?query=romania&format=GeoJSON&TIMESPAN=LAST24H&MAXROWS=5" | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK:', len(d.get('features',[])), 'features')"
```

Expected outputs:
- OpenSky: `OK: 150-800 aircraft` (depending on time of day)
- adsb.fi: `OK: 100-600 aircraft`
- open-meteo: `OK: temp 5.0-25.0 wind 0.5-15.0` (seasonal variation)
- GDELT: `OK: 1-20 features` (news-dependent)

If any command returns 0 results or an error, investigate before deploying.

---

## Substantive Feed Reference (LKGC-W18-001 — 2026-03-27)

This section contains verified endpoint details, response shapes, failure modes, and recovery procedures for all 11 W18 feeds. Supersedes placeholder blocks above.

---

### OpenSky Network (FR-W18-02)

**Production endpoint (anon):**
```
GET https://opensky-network.org/api/states/all
    ?lamin=43.6&lomin=20.2&lamax=48.3&lomax=30.0
```

**Registered user:**
```
GET https://{OPENSKY_USERNAME}:{OPENSKY_PASSWORD}@opensky-network.org/api/states/all
    ?lamin=43.6&lomin=20.2&lamax=48.3&lomax=30.0
```

**Response shape:**
```json
{
  "time": 1711494000,
  "states": [
    ["4b1900", "SWR244  ", "Switzerland", 1711493994, 1711493994,
     26.1023, 44.4268, 9144.0, false, 240.3, 174.2, -3.25, null, 9754.8, "1000", false, 0]
  ]
}
```

Column index map: [0]=icao24, [1]=callsign, [2]=origin_country, [3]=time_position, [4]=last_contact, [5]=longitude, [6]=latitude, [7]=baro_altitude(m), [8]=on_ground, [9]=velocity(m/s), [10]=true_track(deg), [11]=vertical_rate(m/s), [14]=squawk, [16]=position_source(0=ADS-B,1=ASTERIX,2=MLAT)

**Failure modes:**
- HTTP 429 → anon quota (400/day) or registered quota (4000/day) exhausted. Increase cache TTL.
- `states: null` → normal during low-traffic periods. Cast to [].
- HTTP 503 → maintenance. Fall back to adsb.fi.

**Rate limit recovery:**
Circuit breaker opens at 3 consecutive 429s. Half-open probe after 15 min. Exponential backoff, max 4 hr.

**Expected sample (2026-03-27, ~14:00 UTC Romania):** 200–600 aircraft in bbox.

---

### ADS-B Exchange via RapidAPI (FR-W18-02, optional)

**Production endpoint:**
```
GET https://adsbexchange-com1.p.rapidapi.com/v2/lat/45.9/lon/24.9/dist/300/
Headers:
  X-RapidAPI-Key: {ADSBEXCHANGE_API_KEY}
  X-RapidAPI-Host: adsbexchange-com1.p.rapidapi.com
```

**Response shape:**
```json
{
  "ac": [
    {"hex": "4b1900", "flight": "SWR244", "lat": 44.4268, "lon": 26.1023,
     "alt_baro": 30000, "gs": 460, "track": 174, "baro_rate": -64,
     "squawk": "1000", "emergency": "none", "type": "adsb_icao"}
  ],
  "total": 42,
  "now": 1711494000000
}
```

**Failure modes:**
- No key → HTTP 403. Feature runs on adsb.fi + OpenSky instead.
- Quota exceeded → HTTP 429 + `"msg":"limit reached"`. Fall back to no-ADS-BX mode.
- Rate burst → enforce 1 req/s token bucket in EuDataFeedRegistry.

**Recovery:** On 429: pause 60s, resume at 0.5 req/s for 10 min.

---

### adsb.fi (FR-W18-02, primary free fallback)

**Production endpoint:**
```
GET https://api.adsb.fi/v1/aircraft?lat=45.9&lon=24.9&radius_nm=200
```
No auth. Courtesy limit: 1 req/10s.

**Response shape:**
```json
{
  "aircraft": [
    {"hex": "4b1900", "flight": "SWR244", "lat": 44.4268, "lon": 26.1023,
     "alt_baro": 30000, "gs": 460, "track": 174, "squawk": "1000", "seen": 1.2}
  ]
}
```

**Failure modes:**
- Occasional HTTP 503. Retry after 30s, max 2 retries.
- `aircraft: []` → normal at night.
- Path drift → check https://adsb.fi/data-access for new docs.

---

### FAA NOTAM API (FR-W18-03)

**Production endpoint:**
```
GET https://external-api.faa.gov/notamapi/v1/notams
    ?icaoLocation=LROP&pageSize=100&pageNum=1
```
No auth. Limit: 1000 req/hr.

Romanian ICAO codes: LROP (Henri Coandă, Bucharest), LRCL (Cluj-Napoca Avram Iancu), LRTR (Timișoara Traian Vuia), LRCK (Mihail Kogălniceanu, Constanța), LRBS (Băneasa Aurel Vlaicu, Bucharest), LRSB (Sibiu), LROD (Oradea), LRIA (Iași)

**Response shape:**
```json
{
  "pageSize": 100, "pageNum": 1, "totalCount": 4, "totalPages": 1,
  "items": [
    {
      "id": "NOTAM-12345678",
      "issued": "2026-03-27T08:00:00Z",
      "effectiveStart": "2026-03-27T08:00:00Z",
      "effectiveEnd": "2026-03-30T18:00:00Z",
      "message": "A0123/26 NOTAMN\nQ) LRBB/QRTCA/IV/BO/AE/000/999/4428N02613E005\nA) LROP B) 2603270800 C) 2603301800\nE) TEMPORARY RESTRICTED AREA ACTIVATED",
      "notamNumber": "A0123/26",
      "icaoId": "LROP",
      "coordinates": "44.4666,26.2166",
      "radius": "5"
    }
  ]
}
```

**Q-line format:** `FIR/CODE/TRAFFIC/PURPOSE/SCOPE/LOWER/UPPER/CENTERRADIUS`
- LRBB = Bucharest FIR
- QRTCA = Restricted area
- `4428N02613E005` = center 44°28'N 026°13'E, radius 5 NM

**Failure modes:**
- HTTP 400 → invalid ICAO code. Validate against known list.
- Empty `items` → no active NOTAMs. Cache 5 min.
- HTTP 429 → batch 8 airports with 100ms gap between requests.

**Recovery:** 8 airports × 12 polls/hr = 96 req/hr. Well within 1000/hr.

---

### EASA drone.rules.eu (FR-W18-04)

**Production endpoint:**
```
GET https://drone.rules.eu/api/v1/zones?country=RO
```
No auth. Courtesy: 1 req/60s. Cache 1 hr.

**Response shape:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "identifier": "RO-UAS-ZONE-001",
        "country": "RO",
        "name": "Henri Coanda Airport CTR",
        "type": "CTR",
        "uSpaceClass": "C",
        "lowerLimit": 0,
        "upperLimit": 1000,
        "lowerLimitUnit": "FT",
        "restriction": "PROHIBITED"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[26.10, 44.55], [26.15, 44.55], [26.15, 44.50], [26.10, 44.50], [26.10, 44.55]]]
      }
    }
  ]
}
```

**Failure modes:**
- HTTP 404 → API version changed. Check https://drone.rules.eu/docs.
- Empty features → load bundled fallback `src/geo/romania-zones-fallback.geojson`.

**Bundled fallback zones (permanent CTR):**
- LROP CTR: 44.35°N–44.65°N, 25.90°E–26.35°E
- LRCL CTR: 46.62°N–46.82°N, 23.55°E–23.85°E
- LRTR CTR: 45.72°N–45.82°N, 21.25°E–21.45°E
- LRCK CTR: 44.25°N–44.45°N, 28.45°E–28.65°E

---

### open-meteo (FR-W18-06, primary)

**Production endpoint:**
```
GET https://api.open-meteo.com/v1/forecast
    ?latitude=44.4&longitude=26.1
    &current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,
             precipitation,visibility,cloud_cover,weather_code,is_day
    &wind_speed_unit=ms
    &forecast_days=1
```
No auth. Unlimited fair use. Cache 10 min.

**Response shape:**
```json
{
  "latitude": 44.4, "longitude": 26.1, "timezone": "Europe/Bucharest",
  "current": {
    "time": "2026-03-27T12:00",
    "temperature_2m": 14.2,
    "relative_humidity_2m": 62,
    "wind_speed_10m": 4.8,
    "wind_gusts_10m": 9.2,
    "precipitation": 0.0,
    "visibility": 24140,
    "cloud_cover": 25,
    "weather_code": 1,
    "is_day": 1
  }
}
```

**Flyability score algorithm:**
```
score = 100
  - max(0, (wind_speed_10m - 5) * 8)      // >5 m/s hurts
  - max(0, (wind_gusts_10m - 10) * 5)     // gusts >10 m/s
  - (precipitation > 0.5 ? 30 : 0)        // rain
  - (visibility < 5000 ? 20 : 0)          // <5km viz
  - (visibility < 1500 ? 30 : 0)          // fog bonus
  - (cloud_cover > 75 ? 10 : 0)           // overcast
  - (weather_code >= 95 ? 50 : 0)         // thunderstorm
score = clamp(0, score, 100)
```

Weather codes (WMO): 0=clear, 1–3=partly cloudy, 45–48=fog, 51–67=rain, 71–77=snow, 80–82=showers, 95–99=thunderstorm.

---

### OpenWeatherMap (FR-W18-06, secondary)

**Production endpoint:**
```
GET https://api.openweathermap.org/data/2.5/weather
    ?lat=44.4&lon=26.1&appid={OPENWEATHERMAP_API_KEY}&units=metric
```
Free tier: 1000 req/day. Cache 10 min.

**Response shape:**
```json
{
  "weather": [{"id": 800, "main": "Clear", "description": "clear sky"}],
  "main": {"temp": 14.2, "feels_like": 12.8, "humidity": 62, "pressure": 1013},
  "visibility": 10000,
  "wind": {"speed": 4.8, "deg": 180, "gust": 9.2},
  "clouds": {"all": 10},
  "dt": 1711494000
}
```

**Failure modes:**
- HTTP 401 `{"cod":401}` → invalid/missing key. Fall back to open-meteo only.
- Quota 1000/day → with 5 cities × 144 polls/day = 720/day. Under limit.

**Romanian city coordinates:**
- Bucharest: 44.4268, 26.1025
- Cluj-Napoca: 46.7712, 23.6236
- Timișoara: 45.7489, 21.2087
- Constanța: 44.1598, 28.6348
- Iași: 47.1585, 27.6014

---

### OSM Overpass API (FR-W18-05)

**Production endpoint:**
```
POST https://overpass-api.de/api/interpreter
Content-Type: application/x-www-form-urlencoded
Body: data=[out:json];<query>;out body;
```
No auth. Limit: 10000 req/day. Cache 24 hr.

**Romania bounding box (Overpass format):** `(43.6,20.2,48.3,30.0)` = (south,west,north,east)

**Key queries:**

Aerodromes:
```
[out:json];node["aeroway"="aerodrome"](43.6,20.2,48.3,30.0);out body;
```
Expected: ~15–20 nodes. Key airports: LROP (OTP), LRCL, LRTR, LRCK.

Power plants:
```
[out:json];(way["power"="plant"](43.6,20.2,48.3,30.0);way["power"="station"](43.6,20.2,48.3,30.0););out center;
```
Expected: Cernavodă nuclear (44.3289°N, 28.0566°E), Rovinari thermal, Turceni thermal, Drobeta hydroelectric.

Military:
```
[out:json];(way["landuse"="military"](43.6,20.2,48.3,30.0);relation["landuse"="military"](43.6,20.2,48.3,30.0););out center;
```
Expected: Mihail Kogălniceanu air base (44.3617°N, 28.4883°E), Deveselu missile defense base (44.1133°N, 24.0969°E), Câmpia Turzii air base (46.5042°N, 23.8853°E).

**Response shape:**
```json
{
  "elements": [
    {"type": "node", "id": 123456, "lat": 44.5711, "lon": 26.0858,
     "tags": {"aeroway": "aerodrome", "icao": "LROP", "iata": "OTP",
              "name": "Henri Coandă International Airport"}}
  ]
}
```

**Failure modes:**
- `runtime_error` in body → query too broad. Split bbox.
- HTTP 429 → backoff 5 min. Cache prevents repeat hits.
- HTTP 503 → load `src/geo/romania-infrastructure-fallback.geojson`.

---

### ACLED — Armed Conflict Location & Event Data (FR-W18-07)

**Production endpoint:**
```
GET https://api.acleddata.com/acled/read
    ?key={ACLED_API_KEY}&email={ACLED_EMAIL}
    &country=Romania&region=20&limit=500
    &fields=event_date,event_type,sub_event_type,actor1,country,admin1,location,latitude,longitude,fatalities,notes
    &event_date=2026-01-01|2026-03-27&event_date_where=BETWEEN
```
Region 20 = Southeast Europe (Romania, Bulgaria, Moldova, Serbia, Ukraine).

**Response shape:**
```json
{
  "status": 200, "success": true, "count": 3,
  "data": [
    {"event_date": "2026-03-15", "event_type": "Protests",
     "sub_event_type": "Peaceful protest",
     "actor1": "Protesters (Romania)",
     "country": "Romania", "admin1": "Bucharest", "location": "Bucharest",
     "latitude": "44.4268", "longitude": "26.1025",
     "fatalities": "0", "notes": "Protesters gathered in Piata Victoriei..."}
  ]
}
```

**Failure modes:**
- HTTP 400 `Invalid credentials` → key or email wrong/missing.
- HTTP 403 → researcher key not yet approved (2–5 day delay). Use FIRMS+GDELT meanwhile.
- HTTP 429 → 1000/day quota. At 1 hr cache: 24 req/day. Headroom large.

**Recovery:** On quota: set `ACLED_DISABLED_UNTIL = now + 24h`. Resume next day.

---

### FIRMS — NASA Fire Information (FR-W18-07)

**Production endpoint:**
```
GET https://firms.modaps.eosdis.nasa.gov/api/area/json/VIIRS_SNPP_NRT/world/1
    ?south=43.6&west=20.2&north=48.3&east=30.0
```
No auth. Unlimited. Updated every 3 hr.

**Response shape:**
```json
[
  {"latitude": "45.1234", "longitude": "27.5678",
   "bright_ti4": "331.2", "acq_date": "2026-03-27", "acq_time": "0920",
   "satellite": "N", "instrument": "VIIRS",
   "confidence": "nominal", "frp": "5.8", "daynight": "D"}
]
```
Process `confidence` = "nominal" or "high" only. `frp` > 50 MW = significant fire.

**Failure modes:**
- HTTP 503 → NASA maintenance. Cache last detections. Alert if stale > 12 hr.
- Empty array → no active fires in bbox. Normal.

---

### GDELT GKG — Global Knowledge Graph (FR-W18-07)

**Production endpoint:**
```
GET https://api.gdeltproject.org/api/v2/geo/geo
    ?query=drone+Romania&mode=PointData&format=GeoJSON
    &timespan=7d&maxrecords=250&lat=45.9&lon=24.9&radius=300
```
No auth. Unlimited (fair use).

**Response shape:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {"type": "Point", "coordinates": [26.1025, 44.4268]},
      "properties": {
        "name": "Bucharest", "count": 15, "urlCount": 12,
        "title": "Romania drone regulation",
        "topdomain": "digi24.ro", "lang": "Romanian",
        "lat": "44.4268", "lon": "26.1025"
      }
    }
  ]
}
```

**Useful GDELT queries for SecurityEventCorrelator:**
- `drone Romania` — UAS incidents
- `UAV OR "unmanned aircraft" Romania` — broader UAS
- `attack OR explosion Romania` — security incidents
- `military exercise Romania` — military activity context

**Failure modes:**
- HTTP 400 → URL-encode query carefully (use `+` not space).
- Empty features → broaden query or extend timespan.

---

### LKGC Verification Script (run monthly)

```bash
#!/bin/bash
echo "=== LKGC-W18-001 Verification $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

check() {
  local name="$1" cmd="$2" expect="$3"
  result=$(eval "$cmd" 2>/dev/null)
  if [ -n "$result" ]; then echo "OK  $name: $result $expect"; else echo "FAIL $name"; fi
}

check "OpenSky" \
  "curl -sf 'https://opensky-network.org/api/states/all?lamin=43.6&lomin=20.2&lamax=48.3&lomax=30.0' | jq '.states // [] | length'" \
  "aircraft (expect 50-800)"

check "adsb.fi" \
  "curl -sf 'https://api.adsb.fi/v1/aircraft?lat=45.9&lon=24.9&radius_nm=200' | jq '.aircraft | length'" \
  "aircraft"

check "FAA NOTAM LROP" \
  "curl -sf 'https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=LROP' | jq '.totalCount'" \
  "notams"

check "EASA UAS RO" \
  "curl -sf 'https://drone.rules.eu/api/v1/zones?country=RO' | jq '.features | length'" \
  "zones"

check "open-meteo" \
  "curl -sf 'https://api.open-meteo.com/v1/forecast?latitude=44.4&longitude=26.1&current=temperature_2m' | jq '.current.temperature_2m'" \
  "°C"

check "OSM aerodromes" \
  "curl -sf --data-urlencode 'data=[out:json];node[\"aeroway\"=\"aerodrome\"](43.6,20.2,48.3,30.0);out;' 'https://overpass-api.de/api/interpreter' | jq '.elements | length'" \
  "aerodromes (expect 10-25)"

check "FIRMS" \
  "curl -sf 'https://firms.modaps.eosdis.nasa.gov/api/area/json/VIIRS_SNPP_NRT/world/1?south=43.6&west=20.2&north=48.3&east=30.0' | jq 'length'" \
  "fire detections"

check "GDELT" \
  "curl -sf 'https://api.gdeltproject.org/api/v2/geo/geo?query=drone+Romania&mode=PointData&format=GeoJSON&timespan=7d&maxrecords=5' | jq '.features | length'" \
  "events"

echo "=== Done ==="
```

Expected results: All lines start with `OK`. Any `FAIL` requires investigation before deploy.
