// APEX-SENTINEL W18 — adsb.fi backup adapter
// Romania bbox: 43.5-48.5°N, 20.2-30.0°E

import type { AircraftState } from './types.js';

const ADSBFI_URL = 'https://api.adsb.fi/v1/aircraft';

const BBOX = { minLat: 43.5, maxLat: 48.5, minLon: 20.2, maxLon: 30.0 };

interface AdsbFiAircraft {
  hex: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number;
  gs?: number;
  track?: number;
  seen?: number;
  on_ground?: boolean;
  category?: string;
}

export class AdsbFiAdapter {
  constructor(private fetchFn: typeof fetch = fetch) {}

  async fetch(): Promise<AircraftState[]> {
    const res = await this.fetchFn(ADSBFI_URL);
    if (!res.ok) throw new Error(`adsb.fi HTTP ${res.status}`);
    const data = (await res.json()) as { aircraft: AdsbFiAircraft[] };

    const results: AircraftState[] = [];
    for (const ac of data.aircraft ?? []) {
      const lat = ac.lat;
      const lon = ac.lon;
      if (lat == null || lon == null) continue;
      if (lat < BBOX.minLat || lat > BBOX.maxLat || lon < BBOX.minLon || lon > BBOX.maxLon) continue;

      const icao24 = ac.hex.toLowerCase().trim();
      const callsign = (ac.flight ?? icao24).trim() || icao24;
      results.push({
        icao24,
        callsign,
        lat,
        lon,
        altitudeM: ac.alt_baro ?? 0,
        velocityMs: ac.gs ?? 0,
        headingDeg: ac.track ?? 0,
        onGround: ac.on_ground ?? false,
        timestampMs: Date.now() - (ac.seen ?? 0) * 1000,
        source: 'adsbfi',
        transponderMode: ac.category ? 'adsb' : undefined,
      });
    }
    return results;
  }
}
