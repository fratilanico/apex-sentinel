// APEX-SENTINEL — W19 GdprTrackAnonymiser
// FR-W19-05 | src/intel/gdpr-track-anonymiser.ts

import { createHmac } from 'crypto';
import type { AnonymisationStatus, AnonymisedTrack } from './types.js';

type EasaCategory = 'cat-a-commercial' | 'cat-b-modified' | 'cat-c-surveillance' | 'cat-d-unknown';

interface AircraftLike {
  icao24?: unknown;
  lat?: unknown;
  lon?: unknown;
  category?: unknown;
  cooperativeContact?: unknown;
  trackStartedAt?: unknown;
}

const COOPERATIVE_CATEGORIES: Set<string> = new Set([
  'cat-a-commercial',
  'cat-b-modified',
  'cat-c-surveillance',
]);

const ANONYMISE_AFTER_MS = 30_000;

export class GdprTrackAnonymiser {
  private readonly deploySecret: string;

  constructor(opts: { deploySecret: string }) {
    this.deploySecret = opts?.deploySecret ?? '';
  }

  gridSnap(lat: number, lon: number): { gridLat: number; gridLon: number } {
    const safeFloor = (n: unknown): number => {
      if (typeof n !== 'number' || isNaN(n) || !isFinite(n)) return 0;
      return Math.floor(n * 1000) / 1000;
    };
    return {
      gridLat: safeFloor(lat),
      gridLon: safeFloor(lon),
    };
  }

  private computePseudoId(icao24: unknown): string {
    const key = typeof icao24 === 'string' && icao24 ? icao24 : 'UNKNOWN';
    return createHmac('sha256', this.deploySecret).update(key).digest('hex').slice(0, 16);
  }

  anonymise(aircraft: AircraftLike): AnonymisedTrack;
  anonymise(aircraft: AircraftLike[]): AnonymisedTrack[];
  anonymise(aircraft: AircraftLike | AircraftLike[]): AnonymisedTrack | AnonymisedTrack[] {
    try {
      if (Array.isArray(aircraft)) {
        return aircraft.map((a) => this.anonymiseSingle(a));
      }
      return this.anonymiseSingle(aircraft);
    } catch {
      return this.errorPassthrough(aircraft as AircraftLike);
    }
  }

  private anonymiseSingle(aircraft: unknown): AnonymisedTrack {
    try {
      // Null/undefined/non-object safety
      if (aircraft === null || aircraft === undefined || typeof aircraft !== 'object') {
        return this.errorPassthrough({});
      }

      const a = aircraft as AircraftLike;

      // Missing deploySecret → ERROR_PASSTHROUGH
      if (!this.deploySecret) {
        return {
          pseudoId: this.computeFallbackPseudoId(a.icao24),
          ...this.gridSnap(
            typeof a.lat === 'number' ? a.lat : 0,
            typeof a.lon === 'number' ? a.lon : 0,
          ),
          anonymisationStatus: 'ERROR_PASSTHROUGH',
          privacyBreachFlag: true,
        };
      }

      const category = typeof a.category === 'string' ? a.category as EasaCategory : null;
      const lat = typeof a.lat === 'number' ? a.lat : 0;
      const lon = typeof a.lon === 'number' ? a.lon : 0;
      const { gridLat, gridLon } = this.gridSnap(lat, lon);
      const pseudoId = this.computePseudoId(a.icao24);

      // Cat-D unknown → EXEMPT
      if (category === 'cat-d-unknown') {
        return {
          pseudoId,
          gridLat,
          gridLon,
          anonymisationStatus: 'EXEMPT',
          legalBasis: 'Art.6(1)(e)',
        };
      }

      // Cooperative (cat-a/b/c) — check track age
      if (category !== null && COOPERATIVE_CATEGORIES.has(category)) {
        const trackStartedAt = typeof a.trackStartedAt === 'number' ? a.trackStartedAt : Date.now();
        const trackAge = Date.now() - trackStartedAt;

        if (trackAge >= ANONYMISE_AFTER_MS) {
          // ANONYMISED — must NOT include icao24
          return {
            pseudoId,
            gridLat,
            gridLon,
            anonymisationStatus: 'ANONYMISED',
          };
        } else {
          return {
            pseudoId,
            gridLat,
            gridLon,
            anonymisationStatus: 'PENDING',
          };
        }
      }

      // Unknown/invalid category → treat as PENDING by default
      return {
        pseudoId,
        gridLat,
        gridLon,
        anonymisationStatus: 'PENDING',
      };
    } catch {
      return this.errorPassthrough(aircraft as AircraftLike);
    }
  }

  private computeFallbackPseudoId(icao24: unknown): string {
    // Even with no deploySecret we return something non-identifying
    const key = typeof icao24 === 'string' && icao24 ? icao24 : 'UNKNOWN';
    return createHmac('sha256', 'fallback').update(key).digest('hex').slice(0, 16);
  }

  private errorPassthrough(a: AircraftLike): AnonymisedTrack {
    const lat = typeof a.lat === 'number' ? a.lat : 0;
    const lon = typeof a.lon === 'number' ? a.lon : 0;
    const { gridLat, gridLon } = this.gridSnap(lat, lon);
    return {
      pseudoId: this.computeFallbackPseudoId(a.icao24),
      gridLat,
      gridLon,
      anonymisationStatus: 'ERROR_PASSTHROUGH',
      privacyBreachFlag: true,
    };
  }
}
