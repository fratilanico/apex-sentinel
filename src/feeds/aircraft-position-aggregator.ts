// APEX-SENTINEL W18 — FR-W18-02: AircraftPositionAggregator

import type { AircraftState } from './types.js';

// Romania bounding box
const BBOX = {
  minLat: 43.5,
  maxLat: 48.5,
  minLon: 20.2,
  maxLon: 30.0,
} as const;

function inBbox(lat: number, lon: number): boolean {
  return lat >= BBOX.minLat && lat <= BBOX.maxLat && lon >= BBOX.minLon && lon <= BBOX.maxLon;
}

function normalise(ac: AircraftState): AircraftState {
  return {
    ...ac,
    altitudeM: ac.altitudeM == null ? 0 : ac.altitudeM,
    callsign: ac.callsign == null ? ac.icao24 : ac.callsign,
  };
}

export class AircraftPositionAggregator {
  private tracks = new Map<string, AircraftState>();

  merge(sources: AircraftState[][]): AircraftState[] {
    for (const batch of sources) {
      for (const raw of batch) {
        const ac = normalise(raw);
        if (!inBbox(ac.lat, ac.lon)) continue;
        const existing = this.tracks.get(ac.icao24);
        if (!existing || ac.timestampMs > existing.timestampMs) {
          this.tracks.set(ac.icao24, ac);
        }
      }
    }
    return Array.from(this.tracks.values());
  }

  getStaleAircraft(maxAgeMs: number): AircraftState[] {
    const cutoff = Date.now() - maxAgeMs;
    return Array.from(this.tracks.values()).filter((ac) => ac.timestampMs < cutoff);
  }

  purgeStale(maxAgeMs: number): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [icao24, ac] of this.tracks.entries()) {
      if (ac.timestampMs < cutoff) {
        this.tracks.delete(icao24);
      }
    }
  }

  getCount(): number {
    return this.tracks.size;
  }
}
