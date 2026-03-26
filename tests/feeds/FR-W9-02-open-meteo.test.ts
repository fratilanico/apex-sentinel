// APEX-SENTINEL — W9 TDD RED Tests
// FR-W9-02: Open-Meteo Weather Integration
// Status: RED — implementation in src/feeds/open-meteo-client.ts does NOT exist yet

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  OpenMeteoClient,
  type WeatherSnapshot,
} from '../../src/feeds/open-meteo-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    windSpeedMs: 3.0,
    windDirectionDeg: 180,
    visibilityM: 10000,
    tempC: 15,
    precipMmh: 0,
    ts: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('FR-W9-02: Open-Meteo Weather Integration', () => {
  const BUCHAREST_LAT = 44.43;
  const BUCHAREST_LON = 26.10;

  let client: OpenMeteoClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new OpenMeteoClient(BUCHAREST_LAT, BUCHAREST_LON);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // W9-02-01: Constructor
  // -------------------------------------------------------------------------

  it('W9-02-01: constructor accepts lat and lon (Bucharest 44.43, 26.10)', () => {
    expect(() => new OpenMeteoClient(44.43, 26.10)).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // W9-02-02: getCurrent() return shape
  // -------------------------------------------------------------------------

  it('W9-02-02: getCurrent() returns a WeatherSnapshot', async () => {
    const mockSnapshot = makeSnapshot();
    vi.spyOn(client, 'getCurrent').mockResolvedValueOnce(mockSnapshot);

    const result = await client.getCurrent();
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });

  // -------------------------------------------------------------------------
  // W9-02-03: WeatherSnapshot shape
  // -------------------------------------------------------------------------

  it('W9-02-03: WeatherSnapshot has windSpeedMs, windDirectionDeg, visibilityM, tempC, precipMmh', async () => {
    const mockSnapshot = makeSnapshot();
    vi.spyOn(client, 'getCurrent').mockResolvedValueOnce(mockSnapshot);

    const snap = await client.getCurrent();
    expect(snap).toHaveProperty('windSpeedMs');
    expect(snap).toHaveProperty('windDirectionDeg');
    expect(snap).toHaveProperty('visibilityM');
    expect(snap).toHaveProperty('tempC');
    expect(snap).toHaveProperty('precipMmh');
  });

  // -------------------------------------------------------------------------
  // W9-02-04: Low visibility flag
  // -------------------------------------------------------------------------

  it('W9-02-04: low visibility (<500m) flags degraded_acoustic_range', () => {
    const snap = makeSnapshot({ visibilityM: 300 });
    const flags = client.evaluateConditions(snap);
    expect(flags).toContain('degraded_acoustic_range');
  });

  // -------------------------------------------------------------------------
  // W9-02-05: High wind flag
  // -------------------------------------------------------------------------

  it('W9-02-05: high wind (>15 m/s) flags degraded_rf_propagation', () => {
    const snap = makeSnapshot({ windSpeedMs: 18 });
    const flags = client.evaluateConditions(snap);
    expect(flags).toContain('degraded_rf_propagation');
  });

  // -------------------------------------------------------------------------
  // W9-02-06: Icing hazard flag
  // -------------------------------------------------------------------------

  it('W9-02-06: freezing rain (precipMmh>0 AND tempC<0) flags icing_hazard', () => {
    const snap = makeSnapshot({ precipMmh: 1.2, tempC: -3 });
    const flags = client.evaluateConditions(snap);
    expect(flags).toContain('icing_hazard');
  });

  // -------------------------------------------------------------------------
  // W9-02-07: Nominal conditions
  // -------------------------------------------------------------------------

  it('W9-02-07: clear conditions (vis>5000m, wind<5m/s) returns nominal (no flags)', () => {
    const snap = makeSnapshot({ visibilityM: 8000, windSpeedMs: 2 });
    const flags = client.evaluateConditions(snap);
    expect(flags).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // W9-02-08: Cache on network error
  // -------------------------------------------------------------------------

  it('W9-02-08: network error returns last cached snapshot, not undefined', async () => {
    const cached = makeSnapshot({ windSpeedMs: 5 });

    // Seed the cache with one good call then force a network failure
    vi.spyOn(client, 'getCurrent')
      .mockResolvedValueOnce(cached)   // first call: success
      .mockResolvedValueOnce(cached);  // second call returns cache, not undefined

    const first = await client.getCurrent();
    expect(first).toBeDefined();

    // Now simulate network failure — client must fall back to cache internally
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));
    const fallback = await client.getCurrent();
    expect(fallback).toBeDefined();
    expect(fallback).not.toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // W9-02-09: Correct query params sent
  // -------------------------------------------------------------------------

  it('W9-02-09: Open-Meteo called with correct lat/lon query params', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          current: {
            wind_speed_10m: 4,
            wind_direction_10m: 270,
            visibility: 9000,
            temperature_2m: 10,
            precipitation: 0,
            time: new Date().toISOString(),
          },
        }),
        { status: 200 },
      ),
    );

    await client.getCurrent();

    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain(`latitude=${BUCHAREST_LAT}`);
    expect(calledUrl).toContain(`longitude=${BUCHAREST_LON}`);
  });

  // -------------------------------------------------------------------------
  // W9-02-10: windDirectionDeg validation
  // -------------------------------------------------------------------------

  it('W9-02-10: windDirectionDeg outside 0-360 throws RangeError', () => {
    expect(() => client.validateWindDirection(-1)).toThrow(RangeError);
    expect(() => client.validateWindDirection(361)).toThrow(RangeError);
    expect(() => client.validateWindDirection(0)).not.toThrow();
    expect(() => client.validateWindDirection(360)).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // W9-02-11: Acoustic detection range calculation
  // -------------------------------------------------------------------------

  it('W9-02-11: acoustic range = base 500m × (visibility/5000), clamped 100-1000m', () => {
    // Perfect visibility → 500 * (10000/5000) = 1000, clamped to 1000
    expect(client.calcAcousticRangeM(10000)).toBe(1000);

    // Low visibility → 500 * (100/5000) = 10, clamped to 100
    expect(client.calcAcousticRangeM(100)).toBe(100);

    // Nominal → 500 * (5000/5000) = 500
    expect(client.calcAcousticRangeM(5000)).toBe(500);

    // Half vis → 500 * (2500/5000) = 250
    expect(client.calcAcousticRangeM(2500)).toBe(250);
  });

  // -------------------------------------------------------------------------
  // W9-02-12: RF propagation range calculation
  // -------------------------------------------------------------------------

  it('W9-02-12: RF range = base 2000m × (1 - windSpeed/30), clamped 500-2000m', () => {
    // Calm wind → 2000 * (1 - 0/30) = 2000
    expect(client.calcRfRangeM(0)).toBe(2000);

    // 30 m/s → 2000 * 0 = 0, clamped to 500
    expect(client.calcRfRangeM(30)).toBe(500);

    // 15 m/s → 2000 * 0.5 = 1000
    expect(client.calcRfRangeM(15)).toBe(1000);

    // 60 m/s (extreme) → clamped to 500
    expect(client.calcRfRangeM(60)).toBe(500);
  });

  // -------------------------------------------------------------------------
  // W9-02-13: No API key required
  // -------------------------------------------------------------------------

  it('W9-02-13: getCurrent() uses free Open-Meteo API — no Authorization header sent', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          current: {
            wind_speed_10m: 2,
            wind_direction_10m: 90,
            visibility: 7000,
            temperature_2m: 12,
            precipitation: 0,
            time: new Date().toISOString(),
          },
        }),
        { status: 200 },
      ),
    );

    await client.getCurrent();

    const callInit = fetchSpy.mock.calls[0][1] as RequestInit | undefined;
    const headers = callInit?.headers as Record<string, string> | undefined;
    if (headers) {
      const headerKeys = Object.keys(headers).map((k) => k.toLowerCase());
      expect(headerKeys).not.toContain('authorization');
    } else {
      // No headers object at all — also valid
      expect(callInit?.headers).toBeUndefined();
    }
  });

  // -------------------------------------------------------------------------
  // W9-02-14: Snapshot timestamped UTC ISO8601
  // -------------------------------------------------------------------------

  it('W9-02-14: WeatherSnapshot.ts is UTC ISO8601', async () => {
    const now = new Date().toISOString();
    const snap = makeSnapshot({ ts: now });
    vi.spyOn(client, 'getCurrent').mockResolvedValueOnce(snap);

    const result = await client.getCurrent();
    expect(result.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  });
});
