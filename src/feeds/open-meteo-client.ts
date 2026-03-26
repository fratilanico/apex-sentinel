// APEX-SENTINEL — W9
// FR-W9-02: Open-Meteo Weather Integration

export interface WeatherSnapshot {
  windSpeedMs: number;
  windDirectionDeg: number;
  visibilityM: number;
  tempC: number;
  precipMmh: number;
  ts: string;
  flags: string[];
}

interface OpenMeteoCurrentResponse {
  current: {
    wind_speed_10m: number;
    wind_direction_10m: number;
    visibility: number;
    temperature_2m: number;
    precipitation: number;
    time: string;
  };
}

export class OpenMeteoClient {
  private readonly lat: number;
  private readonly lon: number;
  private readonly httpClient?: typeof fetch;
  private cache: WeatherSnapshot | null = null;

  constructor(
    lat: number,
    lon: number,
    options?: { httpClient?: typeof fetch },
  ) {
    this.lat = lat;
    this.lon = lon;
    this.httpClient = options?.httpClient;
  }

  async getCurrent(): Promise<WeatherSnapshot> {
    const fetchFn = this.httpClient ?? fetch;

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${this.lat}` +
      `&longitude=${this.lon}` +
      `&current=wind_speed_10m,wind_direction_10m,visibility,temperature_2m,precipitation` +
      `&wind_speed_unit=ms`;

    try {
      const response = await fetchFn(url);
      const data = (await response.json()) as OpenMeteoCurrentResponse;
      const c = data.current;

      const snap: WeatherSnapshot = {
        windSpeedMs: c.wind_speed_10m,
        windDirectionDeg: c.wind_direction_10m,
        visibilityM: c.visibility,
        tempC: c.temperature_2m,
        precipMmh: c.precipitation,
        ts: c.time,
        flags: [],
      };

      snap.flags = this.evaluateConditions(snap);
      this.cache = snap;
      return snap;
    } catch {
      if (this.cache !== null) {
        return this.cache;
      }
      throw new Error('No cached snapshot available and network request failed');
    }
  }

  evaluateConditions(snap: Omit<WeatherSnapshot, 'flags'>): string[] {
    const flags: string[] = [];

    if (snap.visibilityM < 500) {
      flags.push('degraded_acoustic_range');
    }

    if (snap.windSpeedMs > 15) {
      flags.push('degraded_rf_propagation');
    }

    if (snap.precipMmh > 0 && snap.tempC < 0) {
      flags.push('icing_hazard');
    }

    // nominal: no adverse flags (vis > 5000 AND wind < 5)
    if (snap.visibilityM > 5000 && snap.windSpeedMs < 5) {
      // nominal — return empty flags array (no flag string added)
    }

    return flags;
  }

  validateWindDirection(deg: number): void {
    if (deg < 0 || deg > 360) {
      throw new RangeError(
        `Wind direction ${deg}° is outside valid range 0-360°`,
      );
    }
  }

  calcAcousticRangeM(visibilityM: number): number {
    const base = 500;
    const raw = base * (visibilityM / 5000);
    return Math.max(100, Math.min(1000, raw));
  }

  calcRfRangeM(windSpeedMs: number): number {
    const base = 2000;
    const raw = base * (1 - windSpeedMs / 30);
    return Math.max(500, Math.min(2000, raw));
  }
}
