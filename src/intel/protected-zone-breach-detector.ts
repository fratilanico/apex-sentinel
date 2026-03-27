// APEX-SENTINEL — W19 ProtectedZoneBreachDetector
// FR-W19-02 | src/intel/protected-zone-breach-detector.ts

import type { ZoneBreach, BreachType } from './types.js';

interface ProtectedZone {
  id: string;
  name?: string;
  type: 'airport' | 'nuclear' | 'military' | 'government' | string;
  lat: number;
  lon: number;
  radiusKm: number;
  exclusionZones?: unknown[];
}

interface AircraftLike {
  icao24?: string;
  lat?: number | null;
  lon?: number | null;
  altBaro?: number;
  velocityMs?: number;
  headingDeg?: number | null;
  onGround?: boolean;
  [key: string]: unknown;
}

function severityForZoneType(type: string): ZoneBreach['severity'] {
  switch (type) {
    case 'nuclear': return 'CRITICAL';
    case 'airport': return 'HIGH';
    case 'military': return 'HIGH';
    case 'government': return 'MEDIUM';
    default: return 'LOW';
  }
}

/**
 * Bearing from point 1 to point 2 in degrees (0-360).
 */
function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

function angleDiff(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export class ProtectedZoneBreachDetector {
  haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const toRad = (d: number) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  detectBreaches(
    aircraft: AircraftLike[] | null | undefined,
    zones: ProtectedZone[] | null | undefined
  ): ZoneBreach[] {
    try {
      if (!aircraft || !Array.isArray(aircraft)) return [];
      if (!zones || !Array.isArray(zones) || zones.length === 0) return [];

      const results: ZoneBreach[] = [];

      for (const ac of aircraft) {
        if (!ac) continue;
        const acLat = ac.lat;
        const acLon = ac.lon;
        if (
          acLat === null || acLat === undefined || isNaN(acLat as number) ||
          acLon === null || acLon === undefined || isNaN(acLon as number)
        ) {
          continue;
        }
        const lat = acLat as number;
        const lon = acLon as number;
        const icao24 = ac.icao24 ?? 'UNKNOWN';
        const velocityMs = typeof ac.velocityMs === 'number' && !isNaN(ac.velocityMs) ? ac.velocityMs : 0;
        const headingDeg = typeof ac.headingDeg === 'number' && !isNaN(ac.headingDeg) ? ac.headingDeg : null;

        for (const zone of zones) {
          try {
            const radiusM = zone.radiusKm * 1000;
            const alertRadiusM = zone.radiusKm * 1100; // 10% buffer
            const distanceM = this.haversineM(lat, lon, zone.lat, zone.lon);

            let breachType: BreachType | null = null;
            let ttBreachS: number | null = null;

            if (distanceM < radiusM) {
              // INSIDE
              breachType = 'INSIDE';
            } else if (distanceM <= alertRadiusM) {
              // Within alert buffer — check heading
              const bearing = bearingDeg(lat, lon, zone.lat, zone.lon);
              const isApproaching = headingDeg !== null && angleDiff(headingDeg, bearing) <= 45;
              if (isApproaching) {
                breachType = 'ENTERING';
                const gapM = distanceM - radiusM;
                ttBreachS = velocityMs > 0 ? gapM / velocityMs : null;
              } else {
                // In buffer but not heading toward zone — still a breach (APPROACHING)
                breachType = 'APPROACHING';
              }
            }

            if (breachType === null) continue;

            results.push({
              zoneId: zone.id,
              breachType,
              distanceM,
              ttBreachS,
              firstDetectedAt: new Date().toISOString(),
              aircraftIcao24: icao24,
              severity: severityForZoneType(zone.type),
            });
          } catch {
            // Skip this zone pair on error
          }
        }
      }

      return results;
    } catch {
      return [];
    }
  }
}
