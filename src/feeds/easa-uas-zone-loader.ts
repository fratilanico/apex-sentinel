// APEX-SENTINEL W18 — EasaUasZoneLoader
// FR-W18-04 | src/feeds/easa-uas-zone-loader.ts

import type { EasaUasZone, EasaZoneType } from './types.js';

const DRONE_RULES_EU_BASE = 'https://drone.rules.eu/api/v1/zones';

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

// Hardcoded fallback zones — always available, no API required
const HARDCODED_ZONES: EasaUasZone[] = [
  {
    id: 'RO-PROHIBITED-CND-001',
    name: 'Cernavodă Nuclear Plant Exclusion',
    type: 'PROHIBITED',
    country: 'RO',
    lowerLimitM: 0,
    upperLimitM: 3000,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [28.1506, 44.3267], [28.1480, 44.3957], [28.1404, 44.4636],
          [28.1278, 44.5293], [28.1106, 44.5914], [28.0890, 44.6487],
          [28.0636, 44.7000], [28.0350, 44.7441], [28.0038, 44.7800],
          [27.9706, 44.8067], [27.9362, 44.8236], [27.9014, 44.8301],
          [27.8670, 44.8260], [27.8338, 44.8114], [27.8026, 44.7869],
          [27.7742, 44.7531], [27.7492, 44.7108], [27.7282, 44.6614],
          [27.7112, 44.6059], [27.6988, 44.5456], [27.6910, 44.4820],
          [27.6880, 44.4163], [27.6898, 44.3499], [27.6966, 44.2841],
          [27.7080, 44.2203], [27.7238, 44.1598], [27.7436, 44.1038],
          [27.7670, 44.0532], [27.7932, 44.0091], [27.8218, 43.9724],
          [27.8520, 43.9437], [27.8830, 43.9235], [28.1506, 44.3267],
        ],
      ],
    },
    validFrom: null,
    validTo: null,
  },
  {
    id: 'RO-CTR-LROP-001',
    name: 'Bucharest Henri Coandă CTR',
    type: 'CTR',
    country: 'RO',
    lowerLimitM: 0,
    upperLimitM: 762,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [[26.0, 44.3], [26.3, 44.3], [26.3, 44.6], [26.0, 44.6], [26.0, 44.3]],
      ],
    },
    validFrom: null,
    validTo: null,
  },
  {
    id: 'RO-CTR-LRCL-001',
    name: 'Cluj-Napoca Avram Iancu CTR',
    type: 'CTR',
    country: 'RO',
    lowerLimitM: 0,
    upperLimitM: 762,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [[23.8, 46.7], [24.0, 46.7], [24.0, 46.9], [23.8, 46.9], [23.8, 46.7]],
      ],
    },
    validFrom: null,
    validTo: null,
  },
  {
    id: 'RO-CTR-LRTR-001',
    name: 'Timișoara Traian Vuia CTR',
    type: 'CTR',
    country: 'RO',
    lowerLimitM: 0,
    upperLimitM: 762,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [[21.1, 45.7], [21.4, 45.7], [21.4, 45.9], [21.1, 45.9], [21.1, 45.7]],
      ],
    },
    validFrom: null,
    validTo: null,
  },
  {
    id: 'RO-CTR-LRCK-001',
    name: 'Constanța Mihail Kogălniceanu CTR',
    type: 'CTR',
    country: 'RO',
    lowerLimitM: 0,
    upperLimitM: 762,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [[28.4, 44.2], [28.7, 44.2], [28.7, 44.4], [28.4, 44.4], [28.4, 44.2]],
      ],
    },
    validFrom: null,
    validTo: null,
  },
];

// ---------------------------------------------------------------------------
// Point-in-polygon using ray casting (works for GeoJSON Polygon)
// Handles both raw Polygon geometry and Feature wrapping geometry
// ---------------------------------------------------------------------------
function pointInPolygon(lat: number, lon: number, coordinates: number[][][]): boolean {
  const ring = coordinates[0]; // exterior ring
  let inside = false;
  const x = lon;
  const y = lat;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];

    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// API response shape from drone.rules.eu
// ---------------------------------------------------------------------------
interface DroneRulesZoneRaw {
  identifier: string;
  name: string;
  type: string;
  country: string;
  geometry: object;
  uSpaceClass?: string;
  lowerLimit?: { value: number; unit: string; reference: string };
  upperLimit?: { value: number; unit: string; reference: string };
  applicability?: { schedule?: Array<{ startDateTime?: string; endDateTime?: string }> } | null;
}

function parseApiZone(raw: DroneRulesZoneRaw): EasaUasZone {
  const validTypes: EasaZoneType[] = ['RESTRICTED', 'PROHIBITED', 'CONDITIONAL', 'CTR', 'RMZ'];
  const zoneType: EasaZoneType = validTypes.includes(raw.type as EasaZoneType)
    ? (raw.type as EasaZoneType)
    : 'RESTRICTED';

  let lowerLimitM = 0;
  let upperLimitM = 0;

  if (raw.lowerLimit) {
    lowerLimitM = convertToMeters(raw.lowerLimit.value, raw.lowerLimit.unit);
  }
  if (raw.upperLimit) {
    upperLimitM = convertToMeters(raw.upperLimit.value, raw.upperLimit.unit);
  }

  let validFrom: Date | null = null;
  let validTo: Date | null = null;

  const sched = raw.applicability?.schedule?.[0];
  if (sched?.startDateTime) validFrom = new Date(sched.startDateTime);
  if (sched?.endDateTime)   validTo   = new Date(sched.endDateTime);

  return {
    id: raw.identifier,
    name: raw.name,
    type: zoneType,
    country: raw.country,
    lowerLimitM,
    upperLimitM,
    geometry: raw.geometry,
    validFrom,
    validTo,
  };
}

function convertToMeters(value: number, unit: string): number {
  switch (unit.toUpperCase()) {
    case 'FT': return Math.round(value * 0.3048);
    case 'FL': return Math.round(value * 30.48); // 1 FL = 100ft
    default:   return value; // assume meters
  }
}

// ---------------------------------------------------------------------------
// EasaUasZoneLoader
// ---------------------------------------------------------------------------

export class EasaUasZoneLoader {
  private cache: EasaUasZone[] = [];
  private cacheTs = 0;

  async load(bbox?: { latMin: number; lonMin: number; latMax: number; lonMax: number }): Promise<EasaUasZone[]> {
    // Return cache if within TTL
    if (this.cache.length > 0 && Date.now() - this.cacheTs < CACHE_TTL) {
      return this.cache;
    }

    let url = DRONE_RULES_EU_BASE;
    if (bbox) {
      const params = new URLSearchParams({
        latMin: String(bbox.latMin),
        lonMin: String(bbox.lonMin),
        latMax: String(bbox.latMax),
        lonMax: String(bbox.lonMax),
      });
      url = `${DRONE_RULES_EU_BASE}?${params.toString()}`;
    }

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const body = (await resp.json()) as { uasZones?: DroneRulesZoneRaw[] };
      const raw = body.uasZones ?? [];
      const zones = raw.map(parseApiZone);

      this.cache = zones;
      this.cacheTs = Date.now();
      return zones;
    } catch (err) {
      console.error('[EasaUasZoneLoader] load() failed, returning hardcoded fallback:', err);
      // On failure: return hardcoded zones (don't cache so next call retries)
      return HARDCODED_ZONES;
    }
  }

  /**
   * Check if a lat/lon point is inside a zone's geometry.
   * Supports: raw GeoJSON Polygon with coordinates[][][] field.
   */
  isInsideZone(lat: number, lon: number, zone: EasaUasZone): boolean {
    const geo = zone.geometry as Record<string, unknown>;

    if (geo.type === 'Polygon') {
      return pointInPolygon(lat, lon, geo.coordinates as number[][][]);
    }

    // Feature wrapping a polygon
    if (geo.type === 'Feature') {
      const inner = (geo.geometry as Record<string, unknown>);
      const props = (geo.properties as Record<string, unknown>) ?? {};

      if (inner?.type === 'Polygon') {
        return pointInPolygon(lat, lon, inner.coordinates as number[][][]);
      }

      // Circle approximation: Feature with Point geometry and radius in properties
      if (inner?.type === 'Point') {
        const coords = inner.coordinates as number[];
        const centerLon = coords[0];
        const centerLat = coords[1];
        const radiusM = (props.radius as number) ?? 0;

        // Haversine distance
        const R = 6371000; // m
        const dLat = ((lat - centerLat) * Math.PI) / 180;
        const dLon = ((lon - centerLon) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((centerLat * Math.PI) / 180) *
            Math.cos((lat * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const dist = R * c;
        return dist <= radiusM;
      }
    }

    return false;
  }

  /** Filter zones by altitude range */
  getZonesAtAltitude(zones: EasaUasZone[], altM: number): EasaUasZone[] {
    return zones.filter((z) => altM >= z.lowerLimitM && altM <= z.upperLimitM);
  }

  /** Filter zones active at given time. Zones with null validFrom/validTo are permanent. */
  getActiveZones(zones: EasaUasZone[], atTime: Date = new Date()): EasaUasZone[] {
    return zones.filter((z) => {
      if (z.validFrom === null && z.validTo === null) return true; // permanent
      const from = z.validFrom?.getTime() ?? -Infinity;
      const to   = z.validTo?.getTime()   ?? Infinity;
      const ts   = atTime.getTime();
      return ts >= from && ts <= to;
    });
  }

  getHardcodedZones(): EasaUasZone[] {
    return HARDCODED_ZONES;
  }
}
