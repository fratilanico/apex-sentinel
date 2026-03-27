import { haversineKm } from './romania-bbox.js';
import type { ProtectedZone } from '../feeds/types.js';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const HARDCODED_ZONES: ProtectedZone[] = [
  {
    id: 'RO-AIRPORT-LROP',
    name: 'Henri Coandă International Airport',
    type: 'airport',
    lat: 44.5713,
    lon: 26.0849,
    radiusKm: 9.3,
    icaoCode: 'LROP',
    exclusionZones: [],
  },
  {
    id: 'RO-AIRPORT-LRCL',
    name: 'Cluj-Napoca International Airport',
    type: 'airport',
    lat: 46.7852,
    lon: 23.6862,
    radiusKm: 5,
    icaoCode: 'LRCL',
    exclusionZones: [],
  },
  {
    id: 'RO-AIRPORT-LRTR',
    name: 'Timișoara Traian Vuia International Airport',
    type: 'airport',
    lat: 45.8099,
    lon: 21.3379,
    radiusKm: 5,
    icaoCode: 'LRTR',
    exclusionZones: [],
  },
  {
    id: 'RO-AIRPORT-LRSB',
    name: 'Sibiu International Airport',
    type: 'airport',
    lat: 45.7856,
    lon: 24.0913,
    radiusKm: 5,
    icaoCode: 'LRSB',
    exclusionZones: [],
  },
  {
    id: 'RO-AIRPORT-LRIA',
    name: 'Iași International Airport',
    type: 'airport',
    lat: 47.1783,
    lon: 27.6206,
    radiusKm: 5,
    icaoCode: 'LRIA',
    exclusionZones: [],
  },
  {
    id: 'RO-NUCLEAR-CND',
    name: 'Cernavodă Nuclear Power Plant',
    type: 'nuclear',
    lat: 44.3267,
    lon: 28.0606,
    radiusKm: 10,
    exclusionZones: [],
  },
  {
    id: 'RO-MILITARY-OTOPENI',
    name: 'Baza Militară Otopeni',
    type: 'military',
    lat: 44.5622,
    lon: 26.0849,
    radiusKm: 8,
    exclusionZones: [],
  },
];

export class CriticalInfrastructureLoader {
  private fetchFn: typeof fetch | null;
  constructor(fetchFn?: typeof fetch) {
    this.fetchFn = fetchFn ?? null;
  }

  private get http(): typeof fetch {
    return this.fetchFn ?? globalThis.fetch;
  }

  buildOverpassQuery(bboxStr: string = '43.5,20.2,48.5,30.0'): string {
    // bboxStr is "latMin,lonMin,latMax,lonMax"
    const bbox = bboxStr;
    return `[out:json][timeout:25];
(
  node["aeroway"="aerodrome"](${bbox});
  way["aeroway"="aerodrome"](${bbox});
  node["power"="plant"]["plant:source"="nuclear"](${bbox});
  node["power"="plant"]["plant_source"="nuclear"](${bbox});
  way["power"="plant"]["plant:source"="nuclear"](${bbox});
  node["landuse"="military"](${bbox});
  way["landuse"="military"](${bbox});
);
out center tags;`;
  }

  async loadFromOsm(bboxStr: string = '43.5,20.2,48.5,30.0'): Promise<ProtectedZone[]> {
    const query = this.buildOverpassQuery(bboxStr);
    let elements: unknown[] = [];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      const response = await this.http(OVERPASS_URL, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return this.getHardcodedZones();
      }

      const data = await response.json() as { elements?: unknown[] };
      elements = data.elements ?? [];
    } catch {
      return this.getHardcodedZones();
    }

    const aerodromes = this.parseOsmAerodromes(elements);
    const nuclear = this.parseOsmNuclear(elements);
    const military = this.parseOsmMilitary(elements);

    const all = [...aerodromes, ...nuclear, ...military];

    // Deduplicate: same coords (within 0.01 deg) or same ICAO
    const deduped: ProtectedZone[] = [];
    for (const zone of all) {
      const isDup = deduped.some((existing) => {
        if (zone.icaoCode && existing.icaoCode && zone.icaoCode === existing.icaoCode) {
          return true;
        }
        return Math.abs(zone.lat - existing.lat) < 0.001 &&
               Math.abs(zone.lon - existing.lon) < 0.001;
      });
      if (!isDup) {
        deduped.push(zone);
      }
    }

    return deduped;
  }

  parseOsmAerodromes(elements: unknown[]): ProtectedZone[] {
    const zones: ProtectedZone[] = [];
    for (const el of elements) {
      const e = el as Record<string, unknown>;
      const tags = e.tags as Record<string, string> | undefined;
      if (!tags) continue;
      if (tags['aeroway'] !== 'aerodrome') continue;
      if (!tags['icao']) continue; // only ICAO-coded airports

      const lat = e.type === 'way'
        ? (e.center as { lat: number; lon: number })?.lat
        : e.lat as number;
      const lon = e.type === 'way'
        ? (e.center as { lat: number; lon: number })?.lon
        : e.lon as number;

      if (lat == null || lon == null) continue;

      zones.push({
        id: `OSM-AIRPORT-${tags['icao']}-${e.id}`,
        name: tags['name'] ?? tags['icao'],
        type: 'airport',
        lat,
        lon,
        radiusKm: 5,
        icaoCode: tags['icao'],
        exclusionZones: [],
      });
    }
    return zones;
  }

  parseOsmNuclear(elements: unknown[]): ProtectedZone[] {
    const zones: ProtectedZone[] = [];
    for (const el of elements) {
      const e = el as Record<string, unknown>;
      const tags = e.tags as Record<string, string> | undefined;
      if (!tags) continue;
      if (tags['power'] !== 'plant') continue;
      if (tags['plant:source'] !== 'nuclear' && tags['plant_source'] !== 'nuclear') continue;

      const lat = e.type === 'way'
        ? (e.center as { lat: number; lon: number })?.lat
        : e.lat as number;
      const lon = e.type === 'way'
        ? (e.center as { lat: number; lon: number })?.lon
        : e.lon as number;

      if (lat == null || lon == null) continue;

      zones.push({
        id: `OSM-NUCLEAR-${e.id}`,
        name: tags['name'] ?? 'Nuclear Power Plant',
        type: 'nuclear',
        lat,
        lon,
        radiusKm: 10,
        exclusionZones: [],
      });
    }
    return zones;
  }

  parseOsmMilitary(elements: unknown[]): ProtectedZone[] {
    const zones: ProtectedZone[] = [];
    for (const el of elements) {
      const e = el as Record<string, unknown>;
      const tags = e.tags as Record<string, string> | undefined;
      if (!tags) continue;
      if (tags['landuse'] !== 'military') continue;

      const lat = e.type === 'way'
        ? (e.center as { lat: number; lon: number })?.lat
        : e.lat as number;
      const lon = e.type === 'way'
        ? (e.center as { lat: number; lon: number })?.lon
        : e.lon as number;

      if (lat == null || lon == null) continue;

      zones.push({
        id: `OSM-MILITARY-${e.id}`,
        name: tags['name'] ?? 'Military Zone',
        type: 'military',
        lat,
        lon,
        radiusKm: 5,
        exclusionZones: [],
      });
    }
    return zones;
  }

  getHardcodedZones(): ProtectedZone[] {
    return HARDCODED_ZONES.map((z) => ({ ...z }));
  }

  mergeWithHardcoded(osmZones: ProtectedZone[]): ProtectedZone[] {
    const hardcoded = this.getHardcodedZones();
    const result = [...hardcoded];

    for (const osmZone of osmZones) {
      // Skip if within 5km of any hardcoded zone
      const isDup = hardcoded.some((hz) => haversineKm(osmZone.lat, osmZone.lon, hz.lat, hz.lon) < 5);
      if (!isDup) {
        result.push(osmZone);
      }
    }

    return result;
  }

  getZonesInBbox(
    zones: ProtectedZone[],
    bbox: { latMin: number; lonMin: number; latMax: number; lonMax: number },
  ): ProtectedZone[] {
    return zones.filter(
      (z) =>
        z.lat >= bbox.latMin &&
        z.lat <= bbox.latMax &&
        z.lon >= bbox.lonMin &&
        z.lon <= bbox.lonMax,
    );
  }

  getNearestZone(lat: number, lon: number, zones: ProtectedZone[]): ProtectedZone | null {
    if (zones.length === 0) return null;
    let nearest = zones[0];
    let minDist = haversineKm(lat, lon, nearest.lat, nearest.lon);

    for (let i = 1; i < zones.length; i++) {
      const d = haversineKm(lat, lon, zones[i].lat, zones[i].lon);
      if (d < minDist) {
        minDist = d;
        nearest = zones[i];
      }
    }

    return nearest;
  }
}
