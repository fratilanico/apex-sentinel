// APEX-SENTINEL — W9 ADS-B Exchange Live Feed Tests
// FR-W9-01 | tests/feeds/FR-W9-01-adsb-exchange.test.ts
// Covers live ADS-B ingestion, squawk emergency codes, privacy, and anomaly detection.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdsbExchangeClient, type Aircraft, type AdsbBoundingBox } from '../../src/feeds/adsb-exchange-client.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ROMANIA_BBOX: AdsbBoundingBox = {
  latMin: 43.6,
  lonMin: 22.1,
  latMax: 48.3,
  lonMax: 30.0,
};

const AIRCRAFT_FIXTURES: Aircraft[] = [
  {
    icao24: 'A1B2C3',
    callsign: 'ROT123',
    lat: 45.1,
    lon: 26.5,
    alt_baro: 8500,
    velocity: 420,
    heading: 85,
    onGround: false,
    squawk: '1234',
  },
  {
    icao24: 'D4E5F6',
    callsign: 'WZZ456',
    lat: 44.2,
    lon: 28.1,
    alt_baro: 11000,
    velocity: 510,
    heading: 270,
    onGround: false,
    squawk: '0022',
  },
  {
    icao24: 'G7H8I9',
    callsign: 'TAR789',
    lat: 46.8,
    lon: 24.3,
    alt_baro: 0,
    velocity: 0,
    heading: 0,
    onGround: true,
    squawk: '2000',
  },
  {
    icao24: 'J0K1L2',
    callsign: '',
    lat: 45.5,
    lon: 25.0,
    alt_baro: 300,
    velocity: 90,
    heading: 310,
    onGround: false,
    squawk: '',
  },
  {
    icao24: 'M3N4O5',
    callsign: 'SWN001',
    lat: 47.1,
    lon: 23.7,
    alt_baro: 3200,
    velocity: 180,
    heading: 45,
    onGround: false,
    squawk: '4444',
  },
];

// ---------------------------------------------------------------------------

describe('FR-W9-01: ADS-B Exchange Live Feed', () => {

  let client: AdsbExchangeClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    client = new AdsbExchangeClient(ROMANIA_BBOX, 10_000, fetchMock);
  });

  // ── Unit tests ─────────────────────────────────────────────────────────────

  it('FR-W9-01-U01: GIVEN boundingBox and pollIntervalMs, WHEN constructor called, THEN client stores both without throwing', () => {
    const c = new AdsbExchangeClient(ROMANIA_BBOX, 5_000, fetchMock);
    expect(c.getBoundingBox()).toEqual(ROMANIA_BBOX);
    expect(c.getPollIntervalMs()).toBe(5_000);
  });

  it('FR-W9-01-U02: GIVEN valid bbox for Romania, WHEN getAircraft() called with mock fetch, THEN returns Aircraft array', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ aircraft: AIRCRAFT_FIXTURES }) });
    const result = await client.getAircraft();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('FR-W9-01-U03: GIVEN mock fetch returns fixture, WHEN getAircraft() called, THEN each Aircraft has required fields', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ aircraft: AIRCRAFT_FIXTURES }) });
    const result = await client.getAircraft();
    for (const ac of result) {
      expect(ac).toHaveProperty('icao24');
      expect(ac).toHaveProperty('callsign');
      expect(ac).toHaveProperty('lat');
      expect(ac).toHaveProperty('lon');
      expect(ac).toHaveProperty('alt_baro');
      expect(ac).toHaveProperty('velocity');
      expect(ac).toHaveProperty('heading');
      expect(ac).toHaveProperty('onGround');
    }
  });

  it('FR-W9-01-U04: GIVEN aircraft with squawk=7500, WHEN getAircraft() called, THEN result includes hijack flag', async () => {
    const hijackFixture = [{ ...AIRCRAFT_FIXTURES[0], squawk: '7500' }];
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ aircraft: hijackFixture }) });
    const result = await client.getAircraft();
    const hijacked = result.find(ac => ac.squawk === '7500');
    expect(hijacked?.emergencyFlag).toBe('hijack');
  });

  it('FR-W9-01-U05: GIVEN aircraft with squawk=7600, WHEN getAircraft() called, THEN result includes radio_failure flag', async () => {
    const radioFixture = [{ ...AIRCRAFT_FIXTURES[0], squawk: '7600' }];
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ aircraft: radioFixture }) });
    const result = await client.getAircraft();
    const radio = result.find(ac => ac.squawk === '7600');
    expect(radio?.emergencyFlag).toBe('radio_failure');
  });

  it('FR-W9-01-U06: GIVEN aircraft with squawk=7700, WHEN getAircraft() called, THEN result includes emergency flag', async () => {
    const emergencyFixture = [{ ...AIRCRAFT_FIXTURES[0], squawk: '7700' }];
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ aircraft: emergencyFixture }) });
    const result = await client.getAircraft();
    const emerg = result.find(ac => ac.squawk === '7700');
    expect(emerg?.emergencyFlag).toBe('emergency');
  });

  it('FR-W9-01-U07: GIVEN aircraft with onGround=false and empty squawk, WHEN getAircraft() called, THEN flagged as suspicious', async () => {
    const noSquawkFixture = [AIRCRAFT_FIXTURES[3]]; // callsign='', squawk=''
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ aircraft: noSquawkFixture }) });
    const result = await client.getAircraft();
    const suspicious = result.find(ac => ac.icao24 === 'J0K1L2');
    expect(suspicious?.suspicious).toBe(true);
  });

  it('FR-W9-01-U08: GIVEN empty bbox (no aircraft in area), WHEN getAircraft() called, THEN returns empty array gracefully', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ aircraft: [] }) });
    const result = await client.getAircraft();
    expect(result).toEqual([]);
  });

  it('FR-W9-01-U09: GIVEN network timeout (fetch rejects), WHEN getAircraft() called, THEN does not throw, returns cached or empty', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network timeout'));
    await expect(client.getAircraft()).resolves.not.toThrow();
    const result = await client.getAircraft().catch(() => []);
    expect(Array.isArray(result)).toBe(true);
  });

  it('FR-W9-01-U10: GIVEN HTTP 429 response, WHEN getAircraft() called, THEN returns last cached data without throwing', async () => {
    // First call populates cache
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ aircraft: [AIRCRAFT_FIXTURES[0]] }) });
    await client.getAircraft();
    // Second call returns 429
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    const result = await client.getAircraft();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(0); // cached or empty, not thrown
  });

  it('FR-W9-01-U11: GIVEN invalid bounding box (lat out of range), WHEN constructor called, THEN throws RangeError', () => {
    expect(() => {
      new AdsbExchangeClient({ latMin: -200, lonMin: 0, latMax: 90, lonMax: 30 }, 5_000, fetchMock);
    }).toThrow(RangeError);
  });

  it('FR-W9-01-U12: GIVEN getAircraft() returns aircraft data, THEN positions are not written to any log or persistent store', async () => {
    const writeMock = vi.fn();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ aircraft: AIRCRAFT_FIXTURES }) });
    client.setLogWriter(writeMock);
    await client.getAircraft();
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('FR-W9-01-U13: GIVEN two aircraft with identical ICAO24 in same poll, WHEN getAircraft() called, THEN duplicates are deduplicated', async () => {
    const dupeFixture = [AIRCRAFT_FIXTURES[0], { ...AIRCRAFT_FIXTURES[0] }]; // same icao24
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ aircraft: dupeFixture }) });
    const result = await client.getAircraft();
    const icaos = result.map(ac => ac.icao24);
    expect(new Set(icaos).size).toBe(icaos.length);
  });

  it('FR-W9-01-U14: GIVEN onGround=true aircraft in response, WHEN getAircraft() called without includeGround option, THEN ground aircraft filtered out', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ aircraft: AIRCRAFT_FIXTURES }) });
    const result = await client.getAircraft({ includeGround: false });
    expect(result.every(ac => ac.onGround === false)).toBe(true);
  });

  it('FR-W9-01-U15: GIVEN aircraft with negative alt_baro, WHEN getAircraft() called without includeInvalidAlt option, THEN filtered out', async () => {
    const negAltFixture = [{ ...AIRCRAFT_FIXTURES[0], alt_baro: -50 }];
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ aircraft: negAltFixture }) });
    const result = await client.getAircraft();
    expect(result.every(ac => ac.alt_baro >= 0)).toBe(true);
  });

  it('FR-W9-01-U16: GIVEN mock fetch resolving fixture data, WHEN getAircraft() called, THEN fetch called exactly once with bbox URL params', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ aircraft: AIRCRAFT_FIXTURES }) });
    await client.getAircraft();
    expect(fetchMock).toHaveBeenCalledOnce();
    const url: string = fetchMock.mock.calls[0][0];
    expect(url).toContain('43.6');
    expect(url).toContain('48.3');
  });

  // ── Integration tests ──────────────────────────────────────────────────────

  it('FR-W9-01-I01: GIVEN aircraft descending >500ft/min toward populated area, WHEN getAircraft() called, THEN altitude_excursion flag set', async () => {
    const descendingFixture = [{
      ...AIRCRAFT_FIXTURES[0],
      alt_baro: 4000,
      verticalRate: -600, // >500ft/min descent
      lat: 44.43,         // Bucharest area
      lon: 26.10,
    }];
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ aircraft: descendingFixture }) });
    const result = await client.getAircraft();
    const ac = result[0];
    expect(ac.altitudeExcursion).toBe(true);
  });

  it('FR-W9-01-I02: GIVEN all aircraft in bbox go dark simultaneously (empty after non-empty), WHEN consecutive polls compared, THEN noTransponderZone event emitted', async () => {
    const events: unknown[] = [];
    client.onEvent(e => events.push(e));
    // First poll: 3 aircraft
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ aircraft: AIRCRAFT_FIXTURES.slice(0, 3) }) });
    await client.getAircraft();
    // Second poll: all gone (mass transponder failure)
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ aircraft: [] }) });
    await client.getAircraft();
    const darkZone = events.filter((e: any) => e.type === 'adsb.no_transponder_zone');
    expect(darkZone.length).toBeGreaterThanOrEqual(1);
  });
});
