// APEX-SENTINEL — W19 RomatsaCoordinationInterface
// FR-W19-07 | src/intel/romatsa-coordination-interface.ts

import type { AwningLevel, ZoneBreach, RomatsaCoordinationMessage } from './types.js';

interface ZoneLike {
  id: string;
  name?: string;
  type?: string;
  icaoCode?: string | undefined;
  lat?: number;
  lon?: number;
  radiusKm?: number;
}

interface AircraftLike {
  icao24?: string;
  velocityMs?: number;
  altBaro?: number;
  [key: string]: unknown;
}

interface NotamLike {
  type?: string;
  affectedIcao?: string;
  validFrom?: Date;
  validTo?: Date;
}

const ROMATSA_ZONE_TYPES: Set<string> = new Set(['airport']);
const NON_ROMATSA_TYPES: Set<string> = new Set(['nuclear', 'military', 'government']);
const ACTIONABLE_LEVELS: Set<string> = new Set(['ORANGE', 'RED']);

function toKnots(velocityMs: number): number {
  return Math.round(velocityMs * 1.944 * 10) / 10;
}

function toFeet(altMetres: number): number {
  return Math.round(altMetres * 3.281);
}

function checkNotamCoverage(icaoCode: string | undefined, activeNotams: NotamLike[]): boolean {
  if (!icaoCode || !activeNotams || activeNotams.length === 0) return false;
  const now = Date.now();
  return activeNotams.some((n) => {
    if (!n) return false;
    if (n.affectedIcao !== icaoCode) return false;
    const validFrom = n.validFrom instanceof Date ? n.validFrom.getTime() : 0;
    const validTo = n.validTo instanceof Date ? n.validTo.getTime() : Infinity;
    return now >= validFrom && now <= validTo;
  });
}

function recommendedAction(awningLevel: AwningLevel): string {
  if (awningLevel === 'RED') {
    return 'Suspend operations — coordinate with ATC for immediate airspace closure';
  }
  return 'Heightened ATC alert — monitor and prepare operational hold if required';
}

export class RomatsaCoordinationInterface {
  generate(
    zoneBreach: ZoneBreach | null | undefined,
    awningLevel: AwningLevel | null | undefined,
    zone: ZoneLike | null | undefined,
    aircraft?: AircraftLike | null,
    activeNotams?: NotamLike[],
  ): RomatsaCoordinationMessage[] {
    try {
      if (!awningLevel || !ACTIONABLE_LEVELS.has(awningLevel)) {
        return [];
      }

      if (!zone) {
        return [];
      }

      const zoneType = zone.type ?? '';

      // Non-ROMATSA domain
      if (NON_ROMATSA_TYPES.has(zoneType)) {
        return [];
      }

      // Only generate for airport zones
      if (!ROMATSA_ZONE_TYPES.has(zoneType)) {
        return [];
      }

      const icaoCode = zone.icaoCode ?? zone.id ?? 'UNKNOWN';
      const notams = activeNotams ?? [];
      const hasCoverage = checkNotamCoverage(zone.icaoCode, notams);

      const velocityMs = aircraft && typeof aircraft.velocityMs === 'number' ? aircraft.velocityMs : 0;
      const altBaro = aircraft && typeof aircraft.altBaro === 'number' ? aircraft.altBaro : 0;

      const classification = awningLevel === 'RED' ? 'TLP:RED' : 'TLP:AMBER';

      const msg: RomatsaCoordinationMessage = {
        affectedAerodrome: icaoCode,
        awningLevel,
        classification,
        notamCoverage: hasCoverage,
        actionDowngradedByNotam: hasCoverage,
        recommendedAction: recommendedAction(awningLevel),
        aircraftSpeedKts: toKnots(velocityMs),
        aircraftAltitudeFt: toFeet(altBaro),
      };

      return [msg];
    } catch {
      return [];
    }
  }
}
