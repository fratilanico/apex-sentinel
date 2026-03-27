// APEX-SENTINEL W18 — OpenSky Network adapter
// Romania bbox: 43.5-48.5°N, 20.2-30.0°E

import type { AircraftState } from './types.js';

const OPENSKY_URL =
  'https://opensky-network.org/api/states/all?lamin=43.5&lomin=20.2&lamax=48.5&lomax=30.0';

const BBOX = { minLat: 43.5, maxLat: 48.5, minLon: 20.2, maxLon: 30.0 };

function categoryToTransponderMode(cat: unknown): string | undefined {
  if (cat == null) return undefined;
  const c = Number(cat);
  if (c === 0) return 'unknown';
  if (c >= 1 && c <= 4) return 'adsb';
  if (c >= 5 && c <= 8) return 'mode-s';
  return undefined;
}

export class OpenSkyAdapter {
  constructor(private fetchFn: typeof fetch = fetch) {}

  async fetch(): Promise<AircraftState[]> {
    const res = await this.fetchFn(OPENSKY_URL);
    if (!res.ok) throw new Error(`OpenSky HTTP ${res.status}`);
    const data = (await res.json()) as { states: unknown[][] | null };
    if (!data.states) return [];

    const results: AircraftState[] = [];
    for (const state of data.states) {
      const lon = state[5] as number | null;
      const lat = state[6] as number | null;
      if (lon == null || lat == null) continue;
      if (lat < BBOX.minLat || lat > BBOX.maxLat || lon < BBOX.minLon || lon > BBOX.maxLon) continue;

      const icao24 = String(state[0] ?? '').trim();
      const callsign = String(state[1] ?? icao24).trim() || icao24;
      results.push({
        icao24,
        callsign,
        lat,
        lon,
        altitudeM: (state[7] as number | null) ?? 0,
        velocityMs: (state[9] as number | null) ?? 0,
        headingDeg: (state[10] as number | null) ?? 0,
        onGround: Boolean(state[8]),
        timestampMs: ((state[4] as number | null) ?? 0) * 1000,
        source: 'opensky',
        transponderMode: categoryToTransponderMode(state[17]),
      });
    }
    return results;
  }
}
