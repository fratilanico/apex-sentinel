// APEX-SENTINEL — Location Coarsener (GDPR-compliant ±50m grid snapping)
// W1 | src/privacy/location-coarsener.ts

import { RawLocation, CoarsenedLocation } from './types.js';

const METERS_PER_DEGREE_LAT = 111_000;
const ALT_SNAP_M = 10;

function snapToGrid(value: number, gridSize: number): number {
  // Snap to nearest grid multiple using integer arithmetic to avoid float drift
  const scale = 1 / gridSize;
  return Math.round(value * scale) / scale;
}

export class LocationCoarsener {
  private readonly latGridDeg: number;

  constructor(private readonly precisionM: number = 50) {
    this.latGridDeg = precisionM / METERS_PER_DEGREE_LAT;
  }

  coarsen(location: RawLocation): CoarsenedLocation {
    const cosLat = Math.max(Math.cos((location.lat * Math.PI) / 180), 0.01);
    const lonGridDeg = this.latGridDeg / cosLat;

    // Snap using integer-based grid to avoid floating-point drift
    const lat = snapToGrid(location.lat, this.latGridDeg);
    const lon = snapToGrid(location.lon, lonGridDeg);

    const result: CoarsenedLocation = {
      lat,
      lon,
      precisionM: this.precisionM,
    };

    if (location.altM !== undefined) {
      result.altM = Math.round(location.altM / ALT_SNAP_M) * ALT_SNAP_M;
    }

    return result;
  }

  isPrivacyPreserving(raw: RawLocation, coarsened: CoarsenedLocation): boolean {
    const dLat = Math.abs(raw.lat - coarsened.lat) * METERS_PER_DEGREE_LAT;
    const cosLat = Math.max(Math.cos((raw.lat * Math.PI) / 180), 0.01);
    const dLon = Math.abs(raw.lon - coarsened.lon) * METERS_PER_DEGREE_LAT * cosLat;
    const errorM = Math.sqrt(dLat * dLat + dLon * dLon);
    return errorM > 0.001 && errorM <= this.precisionM;
  }
}
