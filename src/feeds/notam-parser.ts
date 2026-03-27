// APEX-SENTINEL W18 — NotamParser
// FR-W18-03 | src/feeds/notam-parser.ts

import type { ParsedNotam } from './types.js';

const DRONE_KEYWORDS = ['RPAS', 'UAS', 'DRONE', 'UAV'];

/**
 * Parse YYMMDDHHMM date string to UTC Date.
 * e.g. "2603271000" → 2026-03-27 10:00 UTC
 */
function parseNotamDate(str: string): Date {
  const year   = 2000 + parseInt(str.slice(0, 2), 10);
  const month  = parseInt(str.slice(2, 4), 10) - 1; // 0-indexed
  const day    = parseInt(str.slice(4, 6), 10);
  const hour   = parseInt(str.slice(6, 8), 10);
  const minute = parseInt(str.slice(8, 10), 10);
  return new Date(Date.UTC(year, month, day, hour, minute, 0));
}

/**
 * Parse Q-line coordinate field.
 * Format: DDMMN/DDDMME  e.g. "4434N02605E" → { lat: 44.567, lon: 26.083 }
 * The coords+radius block is like "4434N02605E005" (14 chars + 3 digit radius)
 */
function parseQCoords(coordsRadius: string): { lat: number; lon: number; radiusNm: number } | null {
  // Coords+radius: e.g. "4434N02605E005"
  // lat: 4 digits DDMM + N/S; lon: 5 digits DDDMM + E/W; radius: 3 digits
  const match = coordsRadius.match(/^(\d{4})([NS])(\d{5})([EW])(\d{3})$/);
  if (!match) return null;

  const latDeg = parseInt(match[1].slice(0, 2), 10);
  const latMin = parseInt(match[1].slice(2, 4), 10);
  const latSign = match[2] === 'S' ? -1 : 1;
  const lat = latSign * (latDeg + latMin / 60);

  const lonDeg = parseInt(match[3].slice(0, 3), 10);
  const lonMin = parseInt(match[3].slice(3, 5), 10);
  const lonSign = match[4] === 'W' ? -1 : 1;
  const lon = lonSign * (lonDeg + lonMin / 60);

  const radiusNm = parseInt(match[5], 10);
  return { lat, lon, radiusNm };
}

export class NotamParser {
  parseNotam(notamText: string): ParsedNotam {
    const raw = notamText.trim();
    const lines = raw.split(/\r?\n/);

    let fir = '';
    let subject = '';
    let traffic = '';
    let purpose = '';
    let scope = '';
    let lowerFl = 0;
    let upperFl = 0;
    let centerLat: number | undefined;
    let centerLon: number | undefined;
    let radiusNm: number | undefined;
    let airport = '';
    let validFrom: Date = new Date(0);
    let validTo: Date = new Date(0);
    let freeText = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Q) line: FIR/SUBJECT/TRAFFIC/PURPOSE/SCOPE/LOWER/UPPER/COORDSRADIUS
      if (trimmed.startsWith('Q)')) {
        const qContent = trimmed.slice(2).trim();
        const parts = qContent.split('/');
        if (parts.length >= 8) {
          fir     = parts[0].trim();
          subject = parts[1].trim();
          traffic = parts[2].trim();
          purpose = parts[3].trim();
          scope   = parts[4].trim();
          lowerFl = parseInt(parts[5].trim(), 10) || 0;
          upperFl = parseInt(parts[6].trim(), 10) || 0;
          const coordsBlock = parts[7].trim();
          const parsed = parseQCoords(coordsBlock);
          if (parsed) {
            centerLat = parsed.lat;
            centerLon = parsed.lon;
            radiusNm  = parsed.radiusNm;
          }
        }
      }

      // A) B) C) on same line: e.g. "A) LROP B) 2603271000 C) 2603271800"
      if (trimmed.startsWith('A)')) {
        // A) ICAO B) YYMMDDHHMM C) YYMMDDHHMM
        const aMatch = trimmed.match(/A\)\s*(\w{4})/);
        if (aMatch) airport = aMatch[1];

        const bMatch = trimmed.match(/B\)\s*(\d{10})/);
        if (bMatch) validFrom = parseNotamDate(bMatch[1]);

        const cMatch = trimmed.match(/C\)\s*(\d{10})/);
        if (cMatch) validTo = parseNotamDate(cMatch[1]);
      }

      // E) line: free text
      if (trimmed.startsWith('E)')) {
        freeText = trimmed.slice(2).trim();
      }
    }

    const isDroneRelevant = DRONE_KEYWORDS.some((kw) =>
      freeText.toUpperCase().includes(kw)
    );

    return {
      raw,
      fir,
      subject,
      traffic,
      purpose,
      scope,
      lowerFl,
      upperFl,
      airport,
      validFrom,
      validTo,
      centerLat,
      centerLon,
      radiusNm,
      freeText,
      isDroneRelevant,
    };
  }

  isActive(notam: ParsedNotam, atTime: Date = new Date()): boolean {
    return atTime >= notam.validFrom && atTime <= notam.validTo;
  }

  /** Returns a GeoJSON Feature with a 32-point polygon approximating a circle */
  toGeoJson(notam: ParsedNotam): {
    type: string;
    geometry: { type: string; coordinates: number[][][] };
    properties: Record<string, unknown>;
  } | null {
    if (notam.centerLat === undefined || notam.centerLon === undefined || notam.radiusNm === undefined) {
      return null;
    }

    const lat = notam.centerLat;
    const lon = notam.centerLon;
    const radiusKm = notam.radiusNm * 1.852;
    const numPoints = 32;

    // Earth radius in km
    const R = 6371;
    const coords: number[][] = [];

    for (let i = 0; i <= numPoints; i++) {
      const angle = (i % numPoints) * (2 * Math.PI / numPoints);
      // Angular distance
      const d = radiusKm / R;
      const latRad = (lat * Math.PI) / 180;
      const lonRad = (lon * Math.PI) / 180;

      const pLat = Math.asin(
        Math.sin(latRad) * Math.cos(d) +
        Math.cos(latRad) * Math.sin(d) * Math.cos(angle)
      );
      const pLon = lonRad + Math.atan2(
        Math.sin(angle) * Math.sin(d) * Math.cos(latRad),
        Math.cos(d) - Math.sin(latRad) * Math.sin(pLat)
      );

      coords.push([
        (pLon * 180) / Math.PI,
        (pLat * 180) / Math.PI,
      ]);
    }

    // Close the ring: last point = first point (already done by i<=numPoints with i%numPoints=0)
    // coords[32] = coords[0] (angle=0 repeats)

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [coords],
      },
      properties: {
        fir: notam.fir,
        airport: notam.airport,
        isDroneRelevant: notam.isDroneRelevant,
        validFrom: notam.validFrom.toISOString(),
        validTo: notam.validTo.toISOString(),
      },
    };
  }
}
