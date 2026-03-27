// APEX-SENTINEL W18 — FR-W18-04: EasaUasZoneLoader
// TDD RED — src/feeds/easa-uas-zone-loader.ts not yet written

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EasaUasZoneLoader } from '../../src/feeds/easa-uas-zone-loader.js';
import type { EasaUasZone } from '../../src/feeds/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Romania bounding box
const RO_BBOX = { latMin: 43.5, lonMin: 20.2, latMax: 48.5, lonMax: 30.0 };

// Hardcoded fallback: Cernavodă Nuclear Plant Exclusion Zone
const CERNAVODA_FALLBACK: EasaUasZone = {
  id: 'RO-PROHIBITED-CND-001',
  name: 'Cernavodă Nuclear Plant Exclusion',
  type: 'PROHIBITED',
  country: 'RO',
  lowerLimitM: 0,
  upperLimitM: 3000,
  // GeoJSON circle approximation around 44.3267°N 28.0606°E, 10km radius
  geometry: {
    type: 'Polygon',
    coordinates: [
      // 32-point approximation generated offline — first/last point identical (closed ring)
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
};

// LROP CTR fallback
const LROP_CTR_FALLBACK: EasaUasZone = {
  id: 'RO-CTR-LROP-001',
  name: 'Bucharest Henri Coandă CTR',
  type: 'CTR',
  country: 'RO',
  lowerLimitM: 0,
  upperLimitM: 762, // FL025 approx
  geometry: {
    type: 'Polygon',
    coordinates: [
      [[26.0, 44.3], [26.3, 44.3], [26.3, 44.6], [26.0, 44.6], [26.0, 44.3]],
    ],
  },
  validFrom: null,
  validTo: null,
};

// Mock API response from drone.rules.eu
const MOCK_API_RESPONSE = {
  uasZones: [
    {
      identifier: 'RO-RMZ-LRCL-001',
      name: 'Cluj-Napoca RMZ',
      type: 'RMZ',
      country: 'RO',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [[23.8, 46.7], [24.0, 46.7], [24.0, 46.9], [23.8, 46.9], [23.8, 46.7]],
        ],
      },
      uSpaceClass: 'C',
      lowerLimit: { value: 0, unit: 'M', reference: 'GND' },
      upperLimit: { value: 500, unit: 'M', reference: 'GND' },
      applicability: null,
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FR-W18-04: EasaUasZoneLoader', () => {
  let loader: EasaUasZoneLoader;

  beforeEach(() => {
    loader = new EasaUasZoneLoader();
    vi.restoreAllMocks();
  });

  it('04-01: EasaUasZone has required fields', () => {
    const zone: EasaUasZone = CERNAVODA_FALLBACK;
    expect(zone).toHaveProperty('id');
    expect(zone).toHaveProperty('name');
    expect(zone).toHaveProperty('type');
    expect(zone).toHaveProperty('geometry');
    expect(zone).toHaveProperty('lowerLimitM');
    expect(zone).toHaveProperty('upperLimitM');
    expect(zone).toHaveProperty('country');
  });

  it('04-02: zoneType is one of RESTRICTED|PROHIBITED|CONDITIONAL|CTR|RMZ', () => {
    const validTypes: EasaUasZone['type'][] = ['RESTRICTED', 'PROHIBITED', 'CONDITIONAL', 'CTR', 'RMZ'];
    expect(validTypes).toContain(CERNAVODA_FALLBACK.type);
    expect(validTypes).toContain(LROP_CTR_FALLBACK.type);
  });

  it('04-03: load() calls drone.rules.eu API with Romania bbox', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_API_RESPONSE,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    await loader.load(RO_BBOX);

    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toMatch(/drone\.rules\.eu/i);
    // Should include bbox params
    expect(calledUrl).toMatch(/43\.5|48\.5|20\.2|30\.0/);
  });

  it('04-04: load() with injected fetch returning mock zones parses correctly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_API_RESPONSE,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    const zones = await loader.load(RO_BBOX);
    const rmz = zones.find((z) => z.id === 'RO-RMZ-LRCL-001');
    expect(rmz).toBeDefined();
    expect(rmz!.type).toBe('RMZ');
    expect(rmz!.upperLimitM).toBe(500);
    expect(rmz!.country).toBe('RO');
  });

  it('04-05: isInsideZone() returns true for point inside polygon', () => {
    // Cernavodă zone is around 44.32°N 28.06°E; test a point at the center
    const inside = loader.isInsideZone(44.3267, 28.0606, CERNAVODA_FALLBACK);
    expect(inside).toBe(true);
  });

  it('04-06: isInsideZone() returns false for point outside polygon', () => {
    // Bucharest (44.43°N 26.10°E) is far from Cernavodă zone
    const outside = loader.isInsideZone(44.43, 26.10, CERNAVODA_FALLBACK);
    expect(outside).toBe(false);
  });

  it('04-07: getZonesAtAltitude() filters by altitude range', () => {
    const zones = [CERNAVODA_FALLBACK, LROP_CTR_FALLBACK];
    // CERNAVODA: 0–3000m; LROP_CTR: 0–762m
    // At 800m: only CERNAVODA qualifies
    const at800 = loader.getZonesAtAltitude(zones, 800);
    expect(at800.map((z) => z.id)).toContain('RO-PROHIBITED-CND-001');
    expect(at800.map((z) => z.id)).not.toContain('RO-CTR-LROP-001');

    // At 100m: both qualify
    const at100 = loader.getZonesAtAltitude(zones, 100);
    expect(at100).toHaveLength(2);
  });

  it('04-08: getActiveZones() filters by current time using validFrom/validTo', () => {
    const now = new Date('2026-03-27T12:00:00Z');

    const temporaryZone: EasaUasZone = {
      ...CERNAVODA_FALLBACK,
      id: 'RO-TEMP-001',
      validFrom: new Date('2026-03-27T08:00:00Z'),
      validTo: new Date('2026-03-27T20:00:00Z'),
    };
    const expiredZone: EasaUasZone = {
      ...LROP_CTR_FALLBACK,
      id: 'RO-TEMP-002',
      validFrom: new Date('2026-01-01T00:00:00Z'),
      validTo: new Date('2026-01-02T00:00:00Z'),
    };
    const permanentZone: EasaUasZone = {
      ...CERNAVODA_FALLBACK,
      validFrom: null,
      validTo: null,
    };

    const active = loader.getActiveZones([temporaryZone, expiredZone, permanentZone], now);
    expect(active.map((z) => z.id)).toContain('RO-TEMP-001');
    expect(active.map((z) => z.id)).not.toContain('RO-TEMP-002');
    expect(active.map((z) => z.id)).toContain('RO-PROHIBITED-CND-001'); // permanent
  });

  it('04-09: load() caches result for 24h — second call within 24h returns cache without re-fetching', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_API_RESPONSE,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    await loader.load(RO_BBOX);
    await loader.load(RO_BBOX);

    // Fetch should only be called once due to caching
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('04-10: load() handles API failure — returns hardcoded Romania fallback zones including LROP CTR and Cernavoda', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network failure'));
    vi.stubGlobal('fetch', mockFetch);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const zones = await loader.load(RO_BBOX);

    expect(zones.length).toBeGreaterThan(0);
    const ids = zones.map((z) => z.id);
    // Must include known hardcoded fallback zones
    expect(ids).toContain('RO-PROHIBITED-CND-001');
    expect(ids).toContain('RO-CTR-LROP-001');
    expect(consoleSpy).toHaveBeenCalled();
  });
});
