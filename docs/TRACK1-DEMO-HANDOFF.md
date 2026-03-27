# TRACK 1 — Demo App Rebuild Handoff
## Fix apex-sentinel-demo for Romania/EU (Hackathon March 28)

**Repo:** `/Users/nico/projects/apex-sentinel-demo`
**Deployed:** https://apex-sentinel-demo.vercel.app
**Time budget:** 3-4 hours
**Goal:** Romania/EU civilian drone detection product. Kill all Ukraine content. Wire real feeds.

---

## What's Wrong Right Now

| Issue | Location | Fix |
|---|---|---|
| Ukraine map center (47.85°N 35.12°E) | `components/LiveMap.tsx` | Romania: 45.9°N, 24.9°E, zoom 7 |
| Ukraine drone types (Shahed, Lancet, Gerbera) | `lib/simulation.ts` | EU Cat-A/B/C/D categories |
| Ukraine nodes (Zaporizhzhia, Dnipro, Mariupol) | `lib/simulation.ts` SENTINEL_NODES | Romanian airports + infrastructure |
| OpenSky bbox Ukraine theater | `app/api/opensky/route.ts` | Romania bbox 43.5-48.5°N, 20.2-30.0°E |
| VIINA Ukraine conflict events | `app/api/viina/route.ts` | Replace with ACLED SEE or kill |
| "Wave Timeline" tab | `app/page.tsx`, `components/WaveTimeline.tsx` | Replace with "Protected Zones" tab |
| "FDRP Report" tab | `app/page.tsx`, `components/FdrpPanel.tsx` | Replace with "Network Coverage" tab |
| "W1 → W8 Test Growth Timeline" heading | `components/WaveTimeline.tsx` | Internal dev content — kill entirely |
| "Theater: Eastern Ukraine" in code comments | throughout | Change to Romania/EU |
| open-meteo coords (Bucharest already correct) | `scripts/demo-live.ts` | Already 44.43°N 26.10°E — keep |

---

## Step 1 — Rewrite `lib/simulation.ts`

Replace entirely with Romania/EU civilian threat model:

```typescript
// lib/simulation.ts — APEX-SENTINEL EU Edition

export type DroneCategory = 'cat-a-commercial' | 'cat-b-modified' | 'cat-c-surveillance' | 'cat-d-unknown';
export type Phase = 'DETECTED' | 'TRACKING' | 'BREACH' | 'NEUTRALISED' | 'LOST';

export const DRONE_META: Record<DroneCategory, {
  label: string; color: string; engineType: 'electric'|'piston'|'hybrid';
  freqHz: [number,number]; speedKmh: number; maxRangeKm: number;
}> = {
  'cat-a-commercial':  { label: 'Commercial UAS',   color: '#00d4ff', engineType: 'electric', freqHz: [800,3000],  speedKmh: 65,  maxRangeKm: 7  },
  'cat-b-modified':    { label: 'Modified UAS',     color: '#ffaa00', engineType: 'electric', freqHz: [400,2400],  speedKmh: 80,  maxRangeKm: 15 },
  'cat-c-surveillance':{ label: 'Surveillance UAS', color: '#ff8800', engineType: 'piston',   freqHz: [100,400],   speedKmh: 120, maxRangeKm: 50 },
  'cat-d-unknown':     { label: 'Unknown Contact',  color: '#ff4444', engineType: 'hybrid',   freqHz: [2400,5800], speedKmh: 100, maxRangeKm: 30 },
};

export const SENTINEL_NODES = [
  { id: 'SN-BUH', lat: 44.5713, lon: 26.0849, label: 'Henri Coandă Airport',    online: true,  detections: 0 },
  { id: 'SN-CLJ', lat: 46.7852, lon: 23.6862, label: 'Cluj-Napoca Airport',      online: true,  detections: 0 },
  { id: 'SN-TSR', lat: 45.8099, lon: 21.3379, label: 'Timișoara Airport',        online: true,  detections: 0 },
  { id: 'SN-MKK', lat: 44.3622, lon: 28.4883, label: 'Mihail Kogălniceanu',     online: true,  detections: 0 },
  { id: 'SN-CND', lat: 44.3267, lon: 28.0606, label: 'Cernavodă Nuclear',       online: true,  detections: 0 },
  { id: 'SN-DVS', lat: 44.0986, lon: 24.1375, label: 'Deveselu NATO Base',      online: false, detections: 0 },
  { id: 'SN-OTP', lat: 44.4268, lon: 26.1025, label: 'Bucharest Gov District',  online: true,  detections: 0 },
];

export const PROTECTED_ZONES = [
  { id: 'PZ-BUH', name: 'Henri Coandă Airport',     lat: 44.5713, lon: 26.0849, radiusKm: 5,  type: 'airport',    awning: 'GREEN' },
  { id: 'PZ-CLJ', name: 'Cluj-Napoca Airport',       lat: 46.7852, lon: 23.6862, radiusKm: 5,  type: 'airport',    awning: 'GREEN' },
  { id: 'PZ-TSR', name: 'Timișoara Airport',         lat: 45.8099, lon: 21.3379, radiusKm: 5,  type: 'airport',    awning: 'GREEN' },
  { id: 'PZ-CND', name: 'Cernavodă Nuclear Plant',   lat: 44.3267, lon: 28.0606, radiusKm: 10, type: 'nuclear',    awning: 'GREEN' },
  { id: 'PZ-MKK', name: 'Mihail Kogălniceanu',      lat: 44.3622, lon: 28.4883, radiusKm: 8,  type: 'military',   awning: 'GREEN' },
  { id: 'PZ-DVS', name: 'Deveselu NATO Base',        lat: 44.0986, lon: 24.1375, radiusKm: 8,  type: 'military',   awning: 'GREEN' },
  { id: 'PZ-OTP', name: 'Bucharest Gov District',    lat: 44.4268, lon: 26.1025, radiusKm: 3,  type: 'government', awning: 'GREEN' },
];

// Spawn zones around Romania borders / rural areas (realistic for unauthorized drones)
const SPAWN_ZONES = [
  { lat: 44.0, lon: 22.5 }, // SW Romania
  { lat: 47.5, lon: 27.5 }, // NE Romania (Moldova border)
  { lat: 45.0, lon: 29.5 }, // Danube delta / Black Sea coast
  { lat: 46.0, lon: 20.5 }, // W Romania (Hungary border)
  { lat: 43.8, lon: 25.0 }, // S Romania (Bulgaria border)
];

export function spawnTrack(category?: DroneCategory): DroneTrack {
  const cats = Object.keys(DRONE_META) as DroneCategory[];
  const cls = category ?? cats[Math.floor(Math.random() * cats.length)];
  const meta = DRONE_META[cls];
  const spawn = SPAWN_ZONES[Math.floor(Math.random() * SPAWN_ZONES.length)];
  const target = PROTECTED_ZONES[Math.floor(Math.random() * PROTECTED_ZONES.length)];
  const id = `UAS-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
  return {
    id, label: id, droneCategory: cls,
    engineType: meta.engineType, freqHz: meta.freqHz,
    lat: spawn.lat + (Math.random() - 0.5) * 0.5,
    lon: spawn.lon + (Math.random() - 0.5) * 0.5,
    bearing: 0, speedKmh: meta.speedKmh * (0.8 + Math.random() * 0.4),
    altitudeM: 50 + Math.random() * 400,
    confidence: 0.55 + Math.random() * 0.45,
    phase: 'DETECTED',
    rfSilent: Math.random() < 0.15,
    spawnLat: spawn.lat, spawnLon: spawn.lon,
    targetLat: target.lat, targetLon: target.lon,
    targetZoneId: target.id, targetZoneName: target.name,
    age: 0, ttImpact: 0,
    nodeId: SENTINEL_NODES[Math.floor(Math.random() * SENTINEL_NODES.length)].id,
  };
}
```

---

## Step 2 — Fix `app/api/opensky/route.ts`

Change ONE line — the bbox:

```typescript
// OLD (Ukraine):
const OPENSKY_URL = "https://opensky-network.org/api/states/all?lamin=44.0&lomin=22.0&lamax=52.5&lomax=40.5";

// NEW (Romania/EU):
const OPENSKY_URL = "https://opensky-network.org/api/states/all?lamin=43.5&lomin=20.2&lamax=48.5&lomax=30.0";
```

Also fix the payload comment:
```typescript
bbox: "Romania/EU (43.5–48.5°N, 20.2–30.0°E)",
```

---

## Step 3 — Replace `app/api/viina/route.ts` with ACLED SEE

Delete the VIINA route. Create `app/api/security-events/route.ts`:

```typescript
/**
 * Security events proxy — ACLED Southeast Europe
 * Free researcher API: register at api.acleddata.com
 * Falls back to GDELT if no API key
 */
import { NextResponse } from "next/server";

const ACLED_KEY = process.env.ACLED_API_KEY || '';
const ACLED_EMAIL = process.env.ACLED_EMAIL || '';

// Romania + neighbors bbox
const GDELT_FALLBACK = 'https://api.gdeltproject.org/api/v2/geo/geo?query=Romania+drone+airspace&mode=pointdata&maxrecords=50&format=json';

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 300_000; // 5min

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data, { headers: { 'X-Cache': 'HIT' } });
  }

  // Try ACLED first if key available
  if (ACLED_KEY && ACLED_EMAIL) {
    try {
      const url = `https://api.acleddata.com/acled/read?key=${ACLED_KEY}&email=${ACLED_EMAIL}&country=Romania&limit=50&fields=event_date|event_type|latitude|longitude|notes|fatalities&format=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const raw = await res.json();
        const events = (raw.data || []).map((e: Record<string,string>) => ({
          date: e.event_date, type: e.event_type,
          lat: parseFloat(e.latitude), lon: parseFloat(e.longitude),
          notes: e.notes, fatalities: parseInt(e.fatalities || '0'),
          source: 'ACLED',
        }));
        cache = { data: { events, count: events.length, source: 'ACLED' }, ts: Date.now() };
        return NextResponse.json(cache.data);
      }
    } catch { /* fall through to GDELT */ }
  }

  // GDELT fallback — no auth required
  try {
    const res = await fetch(GDELT_FALLBACK, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const raw = await res.json();
      const events = (raw.features || []).map((f: { geometry: { coordinates: number[] }, properties: Record<string, string> }) => ({
        lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
        date: f.properties.dateadded, type: 'Security Event',
        notes: f.properties.name, source: 'GDELT',
      }));
      cache = { data: { events, count: events.length, source: 'GDELT' }, ts: Date.now() };
      return NextResponse.json(cache.data);
    }
  } catch { /* fall through */ }

  return NextResponse.json({ events: [], count: 0, source: 'none' });
}
```

---

## Step 4 — Add NOTAM API route `app/api/notams/route.ts`

```typescript
/**
 * NOTAM proxy — FAA/ICAO format
 * Using AIM NOTAM Search API (free, no auth for basic queries)
 * Romania FIR: LRBB (Bucharest FIR)
 */
import { NextResponse } from "next/server";

// Romanian airports ICAO codes
const ROMANIAN_AIRPORTS = ['LROP','LRCL','LRTR','LRBS','LRIA','LRSB','LRTM','LROD'];

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 300_000; // 5min - NOTAMs change slowly

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data, { headers: { 'X-Cache': 'HIT' } });
  }

  try {
    // FAA NOTAM API — works for international NOTAMs including Romania
    const locations = ROMANIAN_AIRPORTS.join(',');
    const url = `https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=${locations}&pageSize=50`;
    const res = await fetch(url, {
      headers: { 'accept': 'application/json', 'client_id': 'apex-sentinel', 'client_secret': 'apex-sentinel' },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const raw = await res.json();
      const notams = (raw.items || []).map((n: Record<string, Record<string, string>>) => ({
        id: n.properties?.coreNOTAMData?.notam?.id,
        icaoLocation: n.properties?.coreNOTAMData?.notam?.icaoLocation,
        text: n.properties?.coreNOTAMData?.notam?.text,
        type: n.properties?.coreNOTAMData?.notam?.classification,
        startDate: n.properties?.coreNOTAMData?.notam?.startDate,
        endDate: n.properties?.coreNOTAMData?.notam?.endDate,
      })).filter((n: { id: string }) => n.id);

      cache = { data: { notams, count: notams.length, fir: 'LRBB', source: 'FAA NOTAM API' }, ts: Date.now() };
      return NextResponse.json(cache.data);
    }
  } catch { /* fall through */ }

  return NextResponse.json({ notams: [], count: 0, fir: 'LRBB', source: 'unavailable' });
}
```

---

## Step 5 — Replace `components/LiveMap.tsx` center + protected zones

Find these lines and change:
```typescript
// OLD:
const map = L.map(el).setView([47.85, 35.12], 7);

// NEW:
const map = L.map(el).setView([45.9, 24.9], 7);
```

Add protected zone circles after tiles load:
```typescript
import { PROTECTED_ZONES } from '@/lib/simulation';

// After map init, add protected zones:
PROTECTED_ZONES.forEach(zone => {
  const color = zone.type === 'nuclear' ? '#ff4444' :
                zone.type === 'military' ? '#ffaa00' : '#00d4ff';
  L.circle([zone.lat, zone.lon], {
    radius: zone.radiusKm * 1000,
    color, fillColor: color, fillOpacity: 0.05, weight: 1.5,
    dashArray: zone.type === 'military' ? '4,4' : undefined,
  }).addTo(map).bindPopup(`
    <b>${zone.name}</b><br/>
    Type: ${zone.type.toUpperCase()}<br/>
    Exclusion: ${zone.radiusKm}km radius<br/>
    Status: ${zone.awning}
  `);
});
```

---

## Step 6 — Replace tabs in `app/page.tsx`

Remove `FDRP REPORT` and `WAVE TIMELINE` tabs. Replace with:

```typescript
// OLD tabs:
const TABS = ["LIVE MAP", "FDRP REPORT", "WAVE TIMELINE", "SYSTEM STATUS"];

// NEW tabs:
const TABS = ["LIVE MAP", "PROTECTED ZONES", "NETWORK COVERAGE", "SYSTEM STATUS"];
```

Replace tab content:
```tsx
{tab === "PROTECTED ZONES" && <ProtectedZonesPanel />}
{tab === "NETWORK COVERAGE" && <NetworkCoveragePanel />}
```

---

## Step 7 — Build `components/ProtectedZonesPanel.tsx`

Show a table of all protected zones with:
- Zone name + type
- AWNING level (color-coded)
- Active NOTAMs count
- Detection count (last 24h)
- Distance to nearest active track

---

## Step 8 — Build `components/NetworkCoveragePanel.tsx`

Show:
- 7 sensor nodes with online/offline status
- Detection coverage map (how much of Romania is covered)
- Feed health: OpenSky / NOTAM / Weather — last updated, status
- Total tracks active, total alerts last 24h

---

## Step 9 — Fix TopBar branding

```typescript
// OLD: "APEX SENTINEL" with Ukraine subtitle
// NEW:
<span className="font-mono font-bold text-[#e8f4ff] tracking-wider">APEX-SENTINEL</span>
<span className="text-[10px] font-mono text-[#556a7a] ml-3">EU Airspace Security Platform · Romania</span>
```

---

## Step 10 — Wire real OpenSky aircraft to map

In `app/page.tsx`, add a useEffect to poll `/api/opensky` every 15s and render real aircraft as small plane markers (different from drone tracks):

```typescript
const [realAircraft, setRealAircraft] = useState([]);

useEffect(() => {
  const poll = async () => {
    const r = await fetch('/api/opensky');
    const d = await r.json();
    setRealAircraft(d.aircraft || []);
  };
  poll();
  const iv = setInterval(poll, 15000);
  return () => clearInterval(iv);
}, []);
```

Pass `realAircraft` to `LiveMap` and render as ✈ markers (white/grey, clearly different from threat tracks).

---

## Files to Delete
- `app/api/viina/route.ts` (Ukraine conflict data)
- `components/WaveTimeline.tsx` (internal dev content)
- `components/FdrpPanel.tsx` (internal dev content)

## Files to Create
- `app/api/security-events/route.ts`
- `app/api/notams/route.ts`
- `components/ProtectedZonesPanel.tsx`
- `components/NetworkCoveragePanel.tsx`

## Files to Modify
- `lib/simulation.ts` — full rewrite (Step 1)
- `app/api/opensky/route.ts` — bbox only (Step 2)
- `components/LiveMap.tsx` — center + protected zones (Step 5)
- `app/page.tsx` — tabs + real aircraft polling (Steps 6, 10)
- `components/TopBar.tsx` — branding (Step 9)

---

## Environment Variables Needed (Vercel dashboard)

```
ACLED_API_KEY=<get from api.acleddata.com — free researcher registration>
ACLED_EMAIL=<your email used to register>
```

All other feeds (OpenSky, NOTAM, open-meteo, GDELT) are auth-free.

---

## Deploy

```bash
cd /Users/nico/projects/apex-sentinel-demo
npm run build        # verify no TypeScript errors
git add -A
git commit -m "feat: Romania/EU civilian airspace — kill Ukraine sim, wire real feeds"
git push             # Vercel auto-deploys
```

Vercel build takes ~2 min. Check https://apex-sentinel-demo.vercel.app after.

---

## Definition of Done (Track 1)

- [ ] Map centered on Romania (Bucharest), zoom 7
- [ ] Protected zones visible (circles: airports blue, nuclear red, military orange)
- [ ] Real OpenSky aircraft over Romania rendered as plane markers
- [ ] Drone simulation uses Cat-A/B/C/D EU categories, not Shahed/Lancet
- [ ] Sensor nodes are Romanian airports + Cernavodă + Deveselu
- [ ] NOTAM tab or feed indicator showing active Romanian airspace restrictions
- [ ] No "Wave Timeline", no "FDRP Report", no "Ukraine" or Russian drone names anywhere
- [ ] TopBar shows "EU Airspace Security Platform · Romania"
- [ ] Deploys clean to Vercel
