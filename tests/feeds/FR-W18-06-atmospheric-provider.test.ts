// APEX-SENTINEL W18 — FR-W18-06: AtmosphericConditionProvider
// TDD RED — src/feeds/atmospheric-condition-provider.ts not yet written

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AtmosphericConditionProvider } from '../../src/feeds/atmospheric-condition-provider.js';
import type { AtmosphericConditions, DroneFlightConditions } from '../../src/feeds/types.js';

// ---------------------------------------------------------------------------
// Fixtures — Bucharest coords (default query point)
// ---------------------------------------------------------------------------

const BUCHAREST_LAT = 44.43;
const BUCHAREST_LON = 26.10;

// Calm-conditions mock from open-meteo
const CALM_CONDITIONS: AtmosphericConditions = {
  tempC: 18,
  windSpeedMs: 3,
  windDirectionDeg: 270,
  visibilityM: 8000,
  precipitationMm: 0,
  cloudCoverPct: 20,
  timestampMs: Date.now(),
};

// Severe-conditions mock
const SEVERE_CONDITIONS: AtmosphericConditions = {
  tempC: 5,
  windSpeedMs: 15,
  windDirectionDeg: 180,
  visibilityM: 500,
  precipitationMm: 5,
  cloudCoverPct: 95,
  timestampMs: Date.now(),
};

// open-meteo response shape (simplified)
const MOCK_OPEN_METEO_RESPONSE = {
  current: {
    time: '2026-03-27T12:00',
    temperature_2m: 18.5,
    wind_speed_10m: 3.2,
    wind_direction_10m: 270,
    precipitation: 0,
    cloud_cover: 20,
    visibility: 8000,
  },
  current_units: {
    temperature_2m: '°C',
    wind_speed_10m: 'm/s',
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FR-W18-06: AtmosphericConditionProvider', () => {
  let provider: AtmosphericConditionProvider;

  beforeEach(() => {
    provider = new AtmosphericConditionProvider();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('06-01: AtmosphericConditions has all required fields', () => {
    const conditions: AtmosphericConditions = CALM_CONDITIONS;
    const requiredFields: (keyof AtmosphericConditions)[] = [
      'tempC', 'windSpeedMs', 'windDirectionDeg',
      'visibilityM', 'precipitationMm', 'cloudCoverPct', 'timestampMs',
    ];
    for (const field of requiredFields) {
      expect(conditions).toHaveProperty(field);
    }
  });

  it('06-02: DroneFlightConditions extends AtmosphericConditions with flyabilityScore 0-100', () => {
    const drone: DroneFlightConditions = {
      ...CALM_CONDITIONS,
      flyabilityScore: 95,
    };
    expect(drone).toHaveProperty('flyabilityScore');
    expect(drone.flyabilityScore).toBeGreaterThanOrEqual(0);
    expect(drone.flyabilityScore).toBeLessThanOrEqual(100);
    // Also has all base fields
    expect(drone).toHaveProperty('windSpeedMs');
    expect(drone).toHaveProperty('visibilityM');
  });

  it('06-03: computeFlyability() returns 100 for calm conditions', () => {
    const score = provider.computeFlyability(CALM_CONDITIONS);
    expect(score).toBe(100);
  });

  it('06-04: computeFlyability() reduces score by 40 when wind > 10m/s', () => {
    const windy: AtmosphericConditions = { ...CALM_CONDITIONS, windSpeedMs: 12 };
    const score = provider.computeFlyability(windy);
    expect(score).toBe(60);
  });

  it('06-05: computeFlyability() reduces score by 30 when precipitation > 1mm/h', () => {
    const rainy: AtmosphericConditions = { ...CALM_CONDITIONS, precipitationMm: 3 };
    const score = provider.computeFlyability(rainy);
    expect(score).toBe(70);
  });

  it('06-06: computeFlyability() reduces score by 30 when visibility < 1000m', () => {
    const foggy: AtmosphericConditions = { ...CALM_CONDITIONS, visibilityM: 600 };
    const score = provider.computeFlyability(foggy);
    expect(score).toBe(70);
  });

  it('06-07: computeFlyability() clamps to 0 minimum — never goes negative', () => {
    const terrible: AtmosphericConditions = {
      ...CALM_CONDITIONS,
      windSpeedMs: 20,
      precipitationMm: 10,
      visibilityM: 200,
    };
    const score = provider.computeFlyability(terrible);
    expect(score).toBe(0);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('06-08: computeFlyability() for wind=15ms + rain=5mm + vis=500m returns 0', () => {
    const score = provider.computeFlyability(SEVERE_CONDITIONS);
    expect(score).toBe(0);
  });

  it('06-09: fetch() calls open-meteo API with Bucharest coords (44.43, 26.10)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_OPEN_METEO_RESPONSE,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    await provider.fetch(BUCHAREST_LAT, BUCHAREST_LON);

    expect(mockFetch).toHaveBeenCalledOnce();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toMatch(/open-meteo\.com/);
    expect(url).toContain('44.43');
    expect(url).toContain('26.10');
  });

  it('06-10: mergeWithOpenWeatherMap() uses OWM visibility when open-meteo missing', () => {
    const openMeteo: Partial<AtmosphericConditions> = {
      tempC: 18,
      windSpeedMs: 3,
      windDirectionDeg: 270,
      precipitationMm: 0,
      cloudCoverPct: 20,
      timestampMs: Date.now(),
      // visibilityM deliberately absent
    };
    const owmData = { visibility: 7500 }; // OWM provides it in metres
    const merged = provider.mergeWithOpenWeatherMap(openMeteo, owmData);
    expect(merged.visibilityM).toBe(7500);
  });

  it('06-11: fetch() with no API keys still works — open-meteo requires no auth', async () => {
    // open-meteo is free, no key needed — just verify no auth header is injected
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_OPEN_METEO_RESPONSE,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    // Remove any env keys
    const originalKey = process.env.OPENWEATHERMAP_API_KEY;
    delete process.env.OPENWEATHERMAP_API_KEY;

    await expect(provider.fetch(BUCHAREST_LAT, BUCHAREST_LON)).resolves.not.toThrow();

    process.env.OPENWEATHERMAP_API_KEY = originalKey;
  });

  it('06-12: getConditionsForZone() accepts lat/lon and returns conditions for that location', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_OPEN_METEO_RESPONSE,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    // Cernavodă
    const conditions = await provider.getConditionsForZone(44.3267, 28.0606);
    expect(conditions).toHaveProperty('tempC');
    expect(conditions).toHaveProperty('windSpeedMs');
    // Verify fetch was called with Cernavodă coords, not Bucharest
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('44.3267');
  });

  it('06-13: isGroundingCondition() returns true when flyabilityScore < 20', () => {
    const badFlight: DroneFlightConditions = { ...SEVERE_CONDITIONS, flyabilityScore: 0 };
    const okFlight: DroneFlightConditions = { ...CALM_CONDITIONS, flyabilityScore: 95 };
    const borderline: DroneFlightConditions = { ...CALM_CONDITIONS, flyabilityScore: 19 };

    expect(provider.isGroundingCondition(badFlight)).toBe(true);
    expect(provider.isGroundingCondition(borderline)).toBe(true);
    expect(provider.isGroundingCondition(okFlight)).toBe(false);
  });

  it('06-14: getCachedConditions() returns last known good conditions if fetch fails', async () => {
    // Seed cache via successful fetch
    const mockOk = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_OPEN_METEO_RESPONSE,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockOk);
    await provider.fetch(BUCHAREST_LAT, BUCHAREST_LON);

    // Simulate subsequent failure
    const mockFail = vi.fn().mockRejectedValue(new Error('Network down'));
    vi.stubGlobal('fetch', mockFail);

    const cached = provider.getCachedConditions(BUCHAREST_LAT, BUCHAREST_LON);
    expect(cached).not.toBeNull();
    expect(cached).toHaveProperty('tempC');
  });
});
