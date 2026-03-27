# APEX-SENTINEL W18 — EU Data Integration Layer: Deploy Checklist

```
Wave:     W18
Status:   PRE-DEPLOY
Baseline: 3097 tests GREEN (W1–W17)
Target:   ~3189 tests GREEN (W18 +92)
Updated:  2026-03-27
```

---

## 1. Node.js & Runtime Requirements

| Requirement | Minimum | Notes |
|---|---|---|
| Node.js | 20.x LTS | ESM (`"type":"module"`) required |
| tsx | 4.x | `npm i -D tsx` — used for `scripts/demo-live.ts` |
| TypeScript | 5.x | `tsc --noEmit` must pass clean |
| Vitest | 3.x | `npx vitest run --coverage` |
| RAM | 512 MB | DataFeedBroker 50 MB budget + MemoryBudgetEnforcer |
| Disk | 100 MB | NOTAM cache, OSM Overpass cache, FIRMS shapefile |

Verify before deploy:

```bash
node --version     # must be >= v20.0.0
tsx --version      # must be >= 4.0.0
npx tsc --noEmit   # must exit 0
npx vitest run     # must be all GREEN
```

---

## 2. Environment Variables

### 2a. Required for Full Functionality

| Variable | Source | Notes |
|---|---|---|
| `OPENWEATHERMAP_API_KEY` | openweathermap.org free tier | 1000 calls/day, no CC needed |
| `ACLED_API_KEY` | acleddata.com researcher signup | Free, 2–5 day approval |
| `ACLED_EMAIL` | Same as signup email | Required in every ACLED request |

Sign-up links:
- OpenWeatherMap: https://home.openweathermap.org/users/sign_up
- ACLED Researcher: https://acleddata.com/register/

### 2b. Optional — Unlocks Higher Rate Limits

| Variable | Source | Notes |
|---|---|---|
| `ADSBEXCHANGE_API_KEY` | rapidapi.com/adsbexchange | Paid — unlocks bulk endpoints |
| `OPENSKY_USERNAME` | opensky-network.org | Free — raises anon 400 req/day cap |
| `OPENSKY_PASSWORD` | Same account | Required if USERNAME set |

### 2c. Internal Configuration

| Variable | Default | Notes |
|---|---|---|
| `FEED_CACHE_DIR` | `/tmp/apex-sentinel/feeds` | Cache for NOTAM, OSM, FIRMS |
| `FEED_POLL_INTERVAL_MS` | `900000` | 15 min — respects OpenSky anon limit |
| `OPENSKY_BBOX` | `43.6,20.2,48.3,30.0` | Romania bounding box: lat_min,lon_min,lat_max,lon_max |
| `NOTAM_ICAOS` | `LROP,LRCL,LRTR,LRCK,LRBS,LRSB,LROD,LRIA` | Romanian ICAO airport codes |
| `LOG_LEVEL` | `info` | `debug` for verbose feed output |
| `HEALTH_PORT` | `9090` | HTTP health endpoint port |

`.env` template:

```env
# Required
OPENWEATHERMAP_API_KEY=your_key_here
ACLED_API_KEY=your_key_here
ACLED_EMAIL=your@email.here

# Optional
ADSBEXCHANGE_API_KEY=
OPENSKY_USERNAME=
OPENSKY_PASSWORD=

# Internal
FEED_CACHE_DIR=/tmp/apex-sentinel/feeds
FEED_POLL_INTERVAL_MS=900000
OPENSKY_BBOX=43.6,20.2,48.3,30.0
NOTAM_ICAOS=LROP,LRCL,LRTR,LRCK,LRBS,LRSB,LROD,LRIA
LOG_LEVEL=info
HEALTH_PORT=9090
```

---

## 3. Feed Rate Limits

| Feed | Limit | Cache TTL | Auth Required |
|---|---|---|---|
| OpenSky Network (anon) | 400 req/day | 15 min | No |
| OpenSky Network (registered) | 4000 req/day | 5 min | Optional |
| ADS-B Exchange (RapidAPI) | 1 req/s, quota varies by plan | 30 s | Optional (free tier exists) |
| adsb.fi | No documented limit; courtesy: 1 req/10s | 30 s | No |
| FAA NOTAM API | 1000 req/hr | 5 min | No |
| EASA drone.rules.eu | No published limit; courtesy: 1 req/60s | 1 hr | No |
| open-meteo | Unlimited (fair use) | 10 min | No |
| OpenWeatherMap (free) | 1000 req/day | 10 min | Yes |
| OSM Overpass (public) | 10000 req/day, max 10s query | 24 hr | No |
| ACLED API | 1000 req/day | 1 hr | Yes |
| FIRMS (MODIS/VIIRS) | Unlimited | 6 hr | No |
| GDELT GKG | Unlimited | 15 min | No |

Rate limit implementation: all feeds use `TokenBucket` (existing pattern from `DataFeedBroker`) with per-feed configuration in `EuDataFeedRegistry`.

---

## 4. What Works With ZERO API Keys

The following feeds are fully operational with no credentials:

| Feed | FR | Provides |
|---|---|---|
| OpenSky Network (anon) | FR-W18-02 | Live aircraft positions over Romania (400 req/day) |
| adsb.fi | FR-W18-02 | Aircraft positions, backup to OpenSky |
| open-meteo | FR-W18-06 | Full atmospheric conditions + flyability score |
| FAA NOTAM API | FR-W18-03 | Active NOTAMs for all Romanian airports |
| EASA drone.rules.eu | FR-W18-04 | U-space zone polygons for Romania |
| OSM Overpass | FR-W18-05 | Critical infrastructure (aerodromes, power, military) |
| FIRMS (NASA EOSDIS) | FR-W18-07 | Active fire detections (wildfire intelligence) |
| GDELT GKG | FR-W18-07 | Open-source event intelligence |

A production deployment with zero keys still provides: live aircraft positions, airspace restrictions, infrastructure zones, atmospheric conditions, and open-source intelligence. The missing pieces are OpenWeatherMap (second atmospheric source) and ACLED (security events with precise coordinates).

---

## 5. What Needs an API Key

| Feed | Why Needed | Impact If Missing |
|---|---|---|
| OpenWeatherMap | Secondary atmospheric source with 48hr forecast | FR-W18-06 degrades to open-meteo only (still GREEN, lower confidence) |
| ACLED | Security events with verified coordinates for SEE region | FR-W18-07 degrades to FIRMS + GDELT only (still functional) |
| ADS-B Exchange (optional) | Richer aircraft metadata, military callsign lookup | FR-W18-02 falls back to OpenSky + adsb.fi |

---

## 6. Startup Health Check Sequence

Run in this order. Each step must pass before proceeding.

```bash
# Step 1 — Create cache directory
mkdir -p $FEED_CACHE_DIR

# Step 2 — Verify Node version
node -e "if(parseInt(process.version.slice(1)) < 20) process.exit(1)"

# Step 3 — Type check
npx tsc --noEmit

# Step 4 — Run full test suite
npx vitest run --coverage

# Step 5 — Verify OpenSky reachable
curl -s "https://opensky-network.org/api/states/all?lamin=43.6&lomin=20.2&lamax=48.3&lomax=30.0" \
  | jq '.time' || echo "WARN: OpenSky unreachable"

# Step 6 — Verify open-meteo reachable
curl -s "https://api.open-meteo.com/v1/forecast?latitude=44.4&longitude=26.1&current=temperature_2m" \
  | jq '.current.temperature_2m' || echo "WARN: open-meteo unreachable"

# Step 7 — Verify FAA NOTAM reachable
curl -s "https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=LROP&pageSize=1" \
  | jq '.totalCount' || echo "WARN: FAA NOTAM unreachable"

# Step 8 — Verify OSM Overpass reachable
curl -s --data-urlencode 'data=[out:json];node["aeroway"="aerodrome"](43.6,20.2,48.3,30.0);out 1;' \
  "https://overpass-api.de/api/interpreter" | jq '.elements | length' || echo "WARN: Overpass unreachable"

# Step 9 — Verify ACLED key (if configured)
if [ -n "$ACLED_API_KEY" ]; then
  curl -s "https://api.acleddata.com/acled/read?key=$ACLED_API_KEY&email=$ACLED_EMAIL&country=Romania&limit=1" \
    | jq '.count' || echo "WARN: ACLED unreachable"
fi

# Step 10 — Start health endpoint and verify
# (EuDataIntegrationPipeline starts HTTP server on HEALTH_PORT)
# curl http://localhost:9090/health should return {"status":"ok","feeds":{...}}
```

---

## 7. Feed Degradation Matrix

Which FRs remain operational when each feed is down:

| Feed Down | FR-W18-01 | FR-W18-02 | FR-W18-03 | FR-W18-04 | FR-W18-05 | FR-W18-06 | FR-W18-07 | FR-W18-08 |
|---|---|---|---|---|---|---|---|---|
| OpenSky | OK | DEGRADED | OK | OK | OK | OK | OK | DEGRADED |
| ADS-B Exchange | OK | DEGRADED | OK | OK | OK | OK | OK | DEGRADED |
| adsb.fi | OK | DEGRADED | OK | OK | OK | OK | OK | DEGRADED |
| All 3 aircraft | OK | OFFLINE | OK | OK | OK | OK | OK | DEGRADED |
| FAA NOTAM | OK | OK | OFFLINE | OK | OK | OK | OK | DEGRADED |
| EASA drone.rules | OK | OK | OK | OFFLINE | OK | OK | OK | DEGRADED |
| OSM Overpass | OK | OK | OK | OK | OFFLINE | OK | OK | DEGRADED |
| open-meteo | OK | OK | OK | OK | OK | DEGRADED | OK | DEGRADED |
| OpenWeatherMap | OK | OK | OK | OK | OK | DEGRADED | OK | DEGRADED |
| Both atmos | OK | OK | OK | OK | OK | OFFLINE | OK | DEGRADED |
| ACLED | OK | OK | OK | OK | OK | OK | DEGRADED | DEGRADED |
| FIRMS | OK | OK | OK | OK | OK | OK | DEGRADED | DEGRADED |
| GDELT | OK | OK | OK | OK | OK | OK | DEGRADED | DEGRADED |

DEGRADED = feature works with reduced data. OFFLINE = feature unavailable, circuit breaker open.

FR-W18-08 (Pipeline) is always DEGRADED when any upstream is DEGRADED — by design. The pipeline publishes a `confidence` field (0.0–1.0) derived from feed health scores. Consumers (W17 AWNING, W10 threat scoring) must respect this field.

---

## 8. Manual Feed Endpoint Tests (curl)

```bash
# OpenSky — Romania bounding box (anon, no auth)
curl -s "https://opensky-network.org/api/states/all?lamin=43.6&lomin=20.2&lamax=48.3&lomax=30.0" \
  | jq '{time: .time, count: (.states // [] | length)}'

# OpenSky — registered user
curl -s -u "$OPENSKY_USERNAME:$OPENSKY_PASSWORD" \
  "https://opensky-network.org/api/states/all?lamin=43.6&lomin=20.2&lamax=48.3&lomax=30.0" \
  | jq '{time: .time, count: (.states // [] | length)}'

# adsb.fi — Romania bounding box
curl -s "https://api.adsb.fi/v1/aircraft?lat=45.9&lon=24.9&radius_nm=200" \
  | jq '{count: (.aircraft // [] | length)}'

# ADS-B Exchange — bounding box (RapidAPI)
curl -s -H "X-RapidAPI-Key: $ADSBEXCHANGE_API_KEY" \
  -H "X-RapidAPI-Host: adsbexchange-com1.p.rapidapi.com" \
  "https://adsbexchange-com1.p.rapidapi.com/v2/lat/45.9/lon/24.9/dist/300/" \
  | jq '{ac_count: (.ac // [] | length)}'

# FAA NOTAM — LROP (Henri Coanda, Bucharest)
curl -s "https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=LROP&pageSize=5" \
  | jq '.items[0] | {id: .id, classification: .classification, effectiveStart: .effectiveStart}'

# FAA NOTAM — all Romanian airports
for ICAO in LROP LRCL LRTR LRCK LRBS LRSB LROD LRIA; do
  COUNT=$(curl -s "https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=$ICAO" | jq '.totalCount // 0')
  echo "$ICAO: $COUNT active NOTAMs"
done

# EASA drone.rules.eu — Romania U-space zones (GeoJSON)
curl -s "https://drone.rules.eu/api/v1/zones?country=RO" \
  | jq '{count: (.features // [] | length), type: .type}'

# open-meteo — Bucharest current conditions
curl -s "https://api.open-meteo.com/v1/forecast?latitude=44.4&longitude=26.1&current=temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation,visibility,cloud_cover,weather_code" \
  | jq '.current'

# OpenWeatherMap — Bucharest (requires key)
curl -s "https://api.openweathermap.org/data/2.5/weather?lat=44.4&lon=26.1&appid=$OPENWEATHERMAP_API_KEY&units=metric" \
  | jq '{temp: .main.temp, wind: .wind.speed, visibility: .visibility, weather: .weather[0].description}'

# OSM Overpass — aerodromes in Romania
curl -s --data-urlencode 'data=[out:json];node["aeroway"="aerodrome"](43.6,20.2,48.3,30.0);out body;' \
  "https://overpass-api.de/api/interpreter" \
  | jq '[.elements[] | {id: .id, name: .tags.name, icao: .tags["icao"]}]'

# OSM Overpass — power plants in Romania
curl -s --data-urlencode 'data=[out:json];way["power"="plant"](43.6,20.2,48.3,30.0);out center 10;' \
  "https://overpass-api.de/api/interpreter" \
  | jq '[.elements[:3][] | {id: .id, name: .tags.name, operator: .tags.operator}]'

# OSM Overpass — military areas in Romania
curl -s --data-urlencode 'data=[out:json];(way["landuse"="military"](43.6,20.2,48.3,30.0);relation["landuse"="military"](43.6,20.2,48.3,30.0););out center 10;' \
  "https://overpass-api.de/api/interpreter" \
  | jq '[.elements[:3][] | {id: .id, name: (.tags.name // "unnamed")}]'

# ACLED — Romania security events last 30 days (requires key)
curl -s "https://api.acleddata.com/acled/read?key=$ACLED_API_KEY&email=$ACLED_EMAIL&country=Romania&limit=5&fields=event_date,event_type,location,latitude,longitude,fatalities" \
  | jq '.data[:2]'

# FIRMS MODIS — active fires in Romania bbox
curl -s "https://firms.modaps.eosdis.nasa.gov/api/area/csv/VIIRS_SNPP_NRT/world/1/2026-03-27?south=43.6&west=20.2&north=48.3&east=30.0" \
  | head -5

# GDELT GKG — last 15min events near Romania
curl -s "https://api.gdeltproject.org/api/v2/geo/geo?query=Romania+drone&mode=PointData&format=GeoJSON&timespan=1d&maxrecords=5" \
  | jq '{count: (.features // [] | length)}'
```

---

## 9. Vercel / Railway Deployment Notes

### Vercel
- W18 feeds run as background workers, not Vercel Functions (functions have 10s–300s timeout).
- Deploy the HTTP health endpoint only to Vercel as a status page.
- The feed pipeline runs on Railway or a dedicated VM.
- Set environment variables in Vercel Dashboard → Project → Settings → Environment Variables.
- Use Vercel Edge Config for feed toggle flags (enable/disable individual feeds without redeploy).

### Railway
- `railway.toml` service: `npm run demo` (tsx scripts/demo-live.ts)
- Set all env vars in Railway Variables panel.
- Use Railway's TCP health check on port 9090 (`GET /health`).
- Volume mount: `/tmp/apex-sentinel/feeds` → Railway persistent volume for NOTAM/OSM cache.
- Memory: allocate 512 MB minimum. DataFeedBroker is configured for 50 MB budget; full pipeline with all feeds peaks at ~200 MB.
- No `Restart=always` — Railway handles restart. Worker loop must not be infinite without backoff.

### Self-Hosted (systemd, gateway-01 pattern)
```ini
[Service]
ExecStart=timeout 300 /usr/bin/node --import tsx/esm src/feeds/eu-data-integration-pipeline.ts
Restart=on-failure
RestartSec=30
EnvironmentFile=/etc/apex-sentinel/w18.env
```

---

## 10. Pre-Deploy Sign-Off Checklist

```
[ ] Node.js >= 20 on target host
[ ] tsx installed (devDependencies or global)
[ ] npx tsc --noEmit exits 0
[ ] npx vitest run exits 0 (all ~3189 tests GREEN)
[ ] .env file complete (at minimum: OPENWEATHERMAP_API_KEY, ACLED_API_KEY, ACLED_EMAIL)
[ ] FEED_CACHE_DIR exists and is writable
[ ] OpenSky endpoint reachable from deploy host
[ ] open-meteo endpoint reachable from deploy host
[ ] FAA NOTAM endpoint reachable from deploy host
[ ] OSM Overpass endpoint reachable from deploy host
[ ] Health endpoint starts on HEALTH_PORT (GET /health returns 200)
[ ] Degradation matrix verified: kill one feed, confirm others continue
[ ] Rate limit cache verified: second poll within TTL returns cached data (no HTTP call)
[ ] Memory budget enforced: DataFeedBroker stays under 50 MB
[ ] GDPR: no lat/lon written to persistent logs (coordinate scrubbing active)
[ ] Telegram deploy notification sent
```
