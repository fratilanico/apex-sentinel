// APEX-SENTINEL W18 — FR-W18-05: CriticalInfrastructureLoader
// TDD RED — src/geo/critical-infrastructure-loader.ts not yet written

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CriticalInfrastructureLoader } from '../../src/geo/critical-infrastructure-loader.js';
import type { ProtectedZone } from '../../src/feeds/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Romania bbox used in Overpass queries
const RO_BBOX_STR = '43.5,20.2,48.5,30.0';

// Mock Overpass API response with mixed Romanian POI types
const MOCK_OVERPASS_RESPONSE = {
  elements: [
    // Airport (has ICAO)
    {
      type: 'node',
      id: 100001,
      lat: 44.5711,
      lon: 26.0851,
      tags: { aeroway: 'aerodrome', icao: 'LROP', name: 'Henri Coanda International', iata: 'OTP' },
    },
    {
      type: 'node',
      id: 100002,
      lat: 46.7862,
      lon: 23.6862,
      tags: { aeroway: 'aerodrome', icao: 'LRCL', name: 'Cluj-Napoca International', iata: 'CLJ' },
    },
    // Nuclear power plant
    {
      type: 'node',
      id: 200001,
      lat: 44.3267,
      lon: 28.0606,
      tags: { power: 'plant', plant_source: 'nuclear', name: 'Cernavoda Nuclear Power Plant' },
    },
    // Military
    {
      type: 'way',
      id: 300001,
      center: { lat: 44.43, lon: 25.97 },
      tags: { landuse: 'military', name: 'Baza Militara Otopeni' },
    },
    // Duplicate of LROP (same coords, different OSM id)
    {
      type: 'node',
      id: 100099,
      lat: 44.5711,
      lon: 26.0851,
      tags: { aeroway: 'aerodrome', icao: 'LROP', name: 'Henri Coanda (duplicate)' },
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FR-W18-05: CriticalInfrastructureLoader', () => {
  let loader: CriticalInfrastructureLoader;

  beforeEach(() => {
    loader = new CriticalInfrastructureLoader();
    vi.restoreAllMocks();
  });

  it('05-01: ProtectedZone has required fields', () => {
    const zone: ProtectedZone = {
      id: 'test-001',
      name: 'Test Zone',
      type: 'airport',
      lat: 44.57,
      lon: 26.08,
      radiusKm: 9.3,
      icaoCode: 'LROP',
      exclusionZones: [],
    };
    expect(zone).toHaveProperty('id');
    expect(zone).toHaveProperty('name');
    expect(zone).toHaveProperty('type');
    expect(zone).toHaveProperty('lat');
    expect(zone).toHaveProperty('lon');
    expect(zone).toHaveProperty('radiusKm');
    expect(zone).toHaveProperty('exclusionZones');
    // icaoCode is optional but present here
    expect(zone.icaoCode).toBe('LROP');
  });

  it('05-02: buildOverpassQuery() generates valid Overpass QL for Romania bbox', () => {
    const query = loader.buildOverpassQuery(RO_BBOX_STR);
    expect(typeof query).toBe('string');
    // Must include bbox
    expect(query).toContain('43.5');
    expect(query).toContain('30.0');
    // Must query aerodrome, nuclear, military
    expect(query).toMatch(/aerodrome/);
    expect(query).toMatch(/nuclear/);
    expect(query).toMatch(/military/);
    // Valid Overpass QL syntax markers
    expect(query).toContain('[out:json]');
  });

  it('05-03: parseOsmAerodromes() extracts airports with ICAO code only', () => {
    const zones = loader.parseOsmAerodromes(MOCK_OVERPASS_RESPONSE.elements);
    // Only elements with icao tag
    expect(zones.every((z) => z.icaoCode !== undefined)).toBe(true);
    const icaos = zones.map((z) => z.icaoCode);
    expect(icaos).toContain('LROP');
    expect(icaos).toContain('LRCL');
    expect(zones.every((z) => z.type === 'airport')).toBe(true);
  });

  it('05-04: parseOsmNuclear() extracts nuclear power plants', () => {
    const zones = loader.parseOsmNuclear(MOCK_OVERPASS_RESPONSE.elements);
    expect(zones.length).toBeGreaterThanOrEqual(1);
    const cernavoda = zones.find((z) => z.name.toLowerCase().includes('cernavoda'));
    expect(cernavoda).toBeDefined();
    expect(cernavoda!.type).toBe('nuclear');
    expect(cernavoda!.lat).toBeCloseTo(44.3267, 2);
  });

  it('05-05: parseOsmMilitary() extracts military landuse areas', () => {
    const zones = loader.parseOsmMilitary(MOCK_OVERPASS_RESPONSE.elements);
    expect(zones.length).toBeGreaterThanOrEqual(1);
    expect(zones.every((z) => z.type === 'military')).toBe(true);
  });

  it('05-06: loadFromOsm() with mock fetch returns ProtectedZone[]', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_OVERPASS_RESPONSE,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    const zones = await loader.loadFromOsm(RO_BBOX_STR);
    expect(Array.isArray(zones)).toBe(true);
    expect(zones.length).toBeGreaterThan(0);
    expect(zones[0]).toHaveProperty('id');
    expect(zones[0]).toHaveProperty('lat');
  });

  it('05-07: loadFromOsm() deduplicates zones at same coordinates', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_OVERPASS_RESPONSE,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    const zones = await loader.loadFromOsm(RO_BBOX_STR);
    // OSM has two LROP entries at same coords — should collapse to one
    const lropZones = zones.filter((z) => z.icaoCode === 'LROP');
    expect(lropZones).toHaveLength(1);
  });

  it('05-08: getHardcodedZones() returns 7 known Romanian protected sites', () => {
    const zones = loader.getHardcodedZones();
    expect(zones).toHaveLength(7);

    const ids = zones.map((z) => z.id);
    // Must include canonical Romanian sites
    expect(ids).toContain('RO-AIRPORT-LROP');   // Bucharest OTP
    expect(ids).toContain('RO-AIRPORT-LRCL');   // Cluj-Napoca
    expect(ids).toContain('RO-NUCLEAR-CND');     // Cernavodă nuclear
    expect(ids).toContain('RO-AIRPORT-LRTR');   // Timișoara
    expect(ids).toContain('RO-AIRPORT-LRSB');   // Sibiu
    expect(ids).toContain('RO-AIRPORT-LRIA');   // Iași
    expect(ids).toContain('RO-MILITARY-OTOPENI'); // Military Otopeni
  });

  it('05-09: mergeWithHardcoded() combines OSM results with hardcoded — hardcoded takes priority', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_OVERPASS_RESPONSE,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    const osmZones = await loader.loadFromOsm(RO_BBOX_STR);
    const merged = loader.mergeWithHardcoded(osmZones);

    // Should contain at least all hardcoded zones
    const ids = merged.map((z) => z.id);
    expect(ids).toContain('RO-NUCLEAR-CND');
    // No duplicates
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('05-10: getZonesInBbox() filters zones within bounding box', () => {
    const zones = loader.getHardcodedZones();
    // Tight bbox around Bucharest — should only return LROP and Otopeni military
    const bucharest = { latMin: 44.2, lonMin: 25.8, latMax: 44.7, lonMax: 26.4 };
    const filtered = loader.getZonesInBbox(zones, bucharest);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((z) => z.lat >= 44.2 && z.lat <= 44.7)).toBe(true);
  });

  it('05-11: getNearestZone() returns closest zone to given lat/lon', () => {
    const zones = loader.getHardcodedZones();
    // Query point near Cernavodă (44.3267°N 28.0606°E)
    const nearest = loader.getNearestZone(44.3267, 28.0606, zones);
    expect(nearest).toBeDefined();
    expect(nearest!.id).toBe('RO-NUCLEAR-CND');
  });

  it('05-12: loadFromOsm() completes in <5s (performance gate)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_OVERPASS_RESPONSE,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    const t0 = performance.now();
    await loader.loadFromOsm(RO_BBOX_STR);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(5000);
  });
});
