import type { AtmosphericConditions, DroneFlightConditions } from './types.js';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const BUCHAREST = { lat: 44.43, lon: 26.10 };

interface CacheEntry {
  conditions: DroneFlightConditions;
  ts: number;
  lat: number;
  lon: number;
}

export class AtmosphericConditionProvider {
  private cacheMap = new Map<string, CacheEntry>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5min
  private fetchFn: typeof fetch | null;

  constructor(fetchFn?: typeof fetch) {
    this.fetchFn = fetchFn ?? null;
  }

  private get http(): typeof fetch {
    return this.fetchFn ?? globalThis.fetch;
  }

  computeFlyability(conditions: AtmosphericConditions): number {
    let score = 100;
    if (conditions.windSpeedMs > 10) score -= 40;
    if (conditions.precipitationMm > 1) score -= 30;
    if (conditions.visibilityM < 1000) score -= 30;
    return Math.max(0, score);
  }

  async fetch(lat = BUCHAREST.lat, lon = BUCHAREST.lon): Promise<DroneFlightConditions> {
    // Format lat/lon preserving at least 2 decimal places so '26.10' round-trips in URLs
    const fmtCoord = (n: number): string => {
      const s = String(n);
      const dec = s.includes('.') ? s.split('.')[1]!.length : 0;
      return dec >= 2 ? s : n.toFixed(2);
    };
    const currentFields = 'temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,cloud_cover,visibility';
    const url = `${OPEN_METEO_URL}?latitude=${fmtCoord(lat)}&longitude=${fmtCoord(lon)}&current=${encodeURIComponent(currentFields)}&wind_speed_unit=ms`;
    const response = await this.http(url);

    if (!response.ok) {
      throw new Error(`open-meteo error: ${response.status}`);
    }

    const data = await response.json() as {
      current?: {
        temperature_2m?: number;
        wind_speed_10m?: number;
        wind_direction_10m?: number;
        precipitation?: number;
        cloud_cover?: number;
        visibility?: number;
        time?: string;
      };
    };

    const c = data.current ?? {};

    const conditions: AtmosphericConditions = {
      tempC: c.temperature_2m ?? 0,
      windSpeedMs: c.wind_speed_10m ?? 0,
      windDirectionDeg: c.wind_direction_10m ?? 0,
      precipitationMm: c.precipitation ?? 0,
      cloudCoverPct: c.cloud_cover ?? 0,
      visibilityM: c.visibility ?? 10000,
      timestampMs: Date.now(),
    };

    const flyabilityScore = this.computeFlyability(conditions);
    const result: DroneFlightConditions = { ...conditions, flyabilityScore };

    const key = `${lat}:${lon}`;
    this.cacheMap.set(key, { conditions: result, ts: Date.now(), lat, lon });

    return result;
  }

  // Synchronous merge — takes partial conditions and OWM data object
  mergeWithOpenWeatherMap(
    base: Partial<AtmosphericConditions>,
    owmData?: { visibility?: number; wind_speed?: number; temp?: number },
  ): DroneFlightConditions {
    const merged: AtmosphericConditions = {
      tempC: base.tempC ?? owmData?.temp ?? 0,
      windSpeedMs: base.windSpeedMs ?? owmData?.wind_speed ?? 0,
      windDirectionDeg: base.windDirectionDeg ?? 0,
      precipitationMm: base.precipitationMm ?? 0,
      cloudCoverPct: base.cloudCoverPct ?? 0,
      visibilityM: base.visibilityM ?? owmData?.visibility ?? 10000,
      timestampMs: base.timestampMs ?? Date.now(),
    };

    const flyabilityScore = this.computeFlyability(merged);
    return { ...merged, flyabilityScore };
  }

  async getConditionsForZone(lat: number, lon: number): Promise<DroneFlightConditions> {
    return this.fetch(lat, lon);
  }

  isGroundingCondition(conditions: DroneFlightConditions): boolean {
    return conditions.flyabilityScore < 20;
  }

  getCachedConditions(lat = BUCHAREST.lat, lon = BUCHAREST.lon): DroneFlightConditions | null {
    const key = `${lat}:${lon}`;
    const entry = this.cacheMap.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > this.CACHE_TTL) return null;
    return entry.conditions;
  }
}
