// APEX-SENTINEL W18 — FR-W18-07: SecurityEventCorrelator
// TDD RED — src/feeds/security-event-correlator.ts not yet written

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SecurityEventCorrelator } from '../../src/feeds/security-event-correlator.js';
import type { SecurityEvent, ProtectedZone } from '../../src/feeds/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW_MS = new Date('2026-03-27T12:00:00Z').getTime();

// Sample protected zone — Cernavodă Nuclear
const CERNAVODA_ZONE: ProtectedZone = {
  id: 'RO-NUCLEAR-CND',
  name: 'Cernavodă Nuclear Power Plant',
  type: 'nuclear',
  lat: 44.3267,
  lon: 28.0606,
  radiusKm: 10,
  exclusionZones: [],
};

// Sample protected zone — LROP Airport
const LROP_ZONE: ProtectedZone = {
  id: 'RO-AIRPORT-LROP',
  name: 'Bucharest Henri Coandă Airport',
  type: 'airport',
  lat: 44.5711,
  lon: 26.0851,
  radiusKm: 9.3,
  icaoCode: 'LROP',
  exclusionZones: [],
};

const mkEvent = (overrides: Partial<SecurityEvent>): SecurityEvent => ({
  id: 'evt-001',
  source: 'acled',
  lat: 44.43,
  lon: 26.10,
  timestampMs: NOW_MS,
  type: 'CIVIL_UNREST',
  description: 'Protest near Piata Victoriei',
  distanceToNearestZoneKm: null,
  affectedZoneId: null,
  ...overrides,
});

// ACLED mock response
const MOCK_ACLED_RESPONSE = {
  data: [
    {
      event_id_cnty: 'ROM001',
      latitude: '44.4316',
      longitude: '26.1062',
      event_date: '2026-03-27',
      event_type: 'Protests',
      notes: 'Protest near government buildings',
      country: 'Romania',
    },
    {
      event_id_cnty: 'ROM002',
      latitude: '44.3200',
      longitude: '28.0500',
      event_date: '2026-03-27',
      event_type: 'Violence against civilians',
      notes: 'Incident near industrial area',
      country: 'Romania',
    },
  ],
};

// NASA FIRMS mock response (CSV-like, simplified)
const MOCK_FIRMS_EVENTS = [
  {
    latitude: 45.2,
    longitude: 27.8,
    acq_date: '2026-03-27',
    acq_time: '1200',
    brightness: 340.5,
    confidence: 'high',
    satellite: 'Terra',
  },
];

// GDELT mock response
const MOCK_GDELT_RESPONSE = {
  articles: [
    {
      url: 'https://news.ro/article/1',
      title: 'Security alert near Otopeni',
      seendate: '20260327T120000Z',
      sourceurl: 'news.ro',
      domain: 'news.ro',
      language: 'Romanian',
      socialimage: '',
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FR-W18-07: SecurityEventCorrelator', () => {
  let correlator: SecurityEventCorrelator;

  beforeEach(() => {
    correlator = new SecurityEventCorrelator();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('07-01: SecurityEvent has all required fields', () => {
    const event = mkEvent({});
    const requiredFields: (keyof SecurityEvent)[] = [
      'id', 'source', 'lat', 'lon', 'timestampMs',
      'type', 'description', 'distanceToNearestZoneKm', 'affectedZoneId',
    ];
    for (const field of requiredFields) {
      expect(event).toHaveProperty(field);
    }
  });

  it('07-02: correlateWithZones() sets distanceToNearestZoneKm using haversine', () => {
    // Event at Bucharest (44.43, 26.10); LROP at (44.5711, 26.0851) — ~16km away
    const event = mkEvent({ lat: 44.43, lon: 26.10 });
    const [correlated] = correlator.correlateWithZones([event], [LROP_ZONE, CERNAVODA_ZONE]);
    expect(correlated.distanceToNearestZoneKm).toBeGreaterThan(0);
    expect(correlated.distanceToNearestZoneKm).toBeLessThan(50);
    // Nearest should be LROP (~16km), not Cernavodă (~200km)
    expect(correlated.distanceToNearestZoneKm).toBeLessThan(20);
  });

  it('07-03: correlateWithZones() sets affectedZoneId when event within 20km of zone', () => {
    // Event very close to Cernavodă (44.33, 28.06 — ~0.7km from center)
    const nearCnd = mkEvent({ lat: 44.33, lon: 28.06 });
    const [correlated] = correlator.correlateWithZones([nearCnd], [CERNAVODA_ZONE, LROP_ZONE]);
    expect(correlated.affectedZoneId).toBe('RO-NUCLEAR-CND');
  });

  it('07-04: correlateWithZones() sets affectedZoneId to null when no zone within 20km', () => {
    // Event in Iași (47.16, 27.59) — far from both zones
    const iasi = mkEvent({ lat: 47.16, lon: 27.59 });
    const [correlated] = correlator.correlateWithZones([iasi], [CERNAVODA_ZONE, LROP_ZONE]);
    expect(correlated.affectedZoneId).toBeNull();
  });

  it('07-05: fetchAcled() calls ACLED API with Romania country filter', async () => {
    process.env.ACLED_API_KEY = 'test-key';
    process.env.ACLED_EMAIL = 'test@example.com';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_ACLED_RESPONSE,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    await correlator.fetchAcled();

    expect(mockFetch).toHaveBeenCalledOnce();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toMatch(/acleddata\.com/i);
    expect(url).toMatch(/Romania|RO/i);

    delete process.env.ACLED_API_KEY;
    delete process.env.ACLED_EMAIL;
  });

  it('07-06: fetchAcled() falls back to GDELT when ACLED_API_KEY not set', async () => {
    delete process.env.ACLED_API_KEY;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_GDELT_RESPONSE,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    const events = await correlator.fetchAcled();
    expect(Array.isArray(events)).toBe(true);
    // Should have fetched from GDELT instead
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toMatch(/gdelt|api\.gdeltproject\.org/i);
  });

  it('07-07: fetchFirms() calls NASA FIRMS API with Romania bbox', async () => {
    process.env.FIRMS_MAP_KEY = 'test-firms-key';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        'latitude,longitude,acq_date,acq_time,brightness,confidence,satellite\n45.2,27.8,2026-03-27,1200,340.5,h,Terra',
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    await correlator.fetchFirms();

    expect(mockFetch).toHaveBeenCalledOnce();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toMatch(/firms\.modaps\.eosdis\.nasa\.gov/i);
    // Romania bbox
    expect(url).toMatch(/43\.5|48\.5/);

    delete process.env.FIRMS_MAP_KEY;
  });

  it('07-08: fetchFirms() maps thermal anomaly to SecurityEvent with type THERMAL_ANOMALY', async () => {
    process.env.FIRMS_MAP_KEY = 'test-firms-key';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        'latitude,longitude,acq_date,acq_time,brightness,confidence,satellite\n45.2,27.8,2026-03-27,1200,340.5,h,Terra',
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    const events = await correlator.fetchFirms();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('THERMAL_ANOMALY');
    expect(events[0].lat).toBeCloseTo(45.2, 1);
    expect(events[0].lon).toBeCloseTo(27.8, 1);

    delete process.env.FIRMS_MAP_KEY;
  });

  it('07-09: fetchGdelt() queries GDELT with Romania-relevant terms', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_GDELT_RESPONSE,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    await correlator.fetchGdelt();

    expect(mockFetch).toHaveBeenCalledOnce();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toMatch(/gdelt|api\.gdeltproject\.org/i);
    expect(decodeURIComponent(url)).toMatch(/Romania|Bucharest|Română/i);
  });

  it('07-10: mergeEvents() deduplicates events within 1km and 30min of each other', () => {
    const base = mkEvent({ id: 'e1', lat: 44.43, lon: 26.10, timestampMs: NOW_MS });
    // Duplicate: <1km away, 15 min later
    const nearDup = mkEvent({
      id: 'e2',
      lat: 44.431,   // ~110m north
      lon: 26.101,
      timestampMs: NOW_MS + 15 * 60 * 1000,
    });
    // Different incident: >1km away
    const different = mkEvent({
      id: 'e3',
      lat: 44.51,
      lon: 26.10,
      timestampMs: NOW_MS,
    });

    const merged = correlator.mergeEvents([base, nearDup, different]);
    expect(merged).toHaveLength(2);
    const ids = merged.map((e) => e.id);
    expect(ids).not.toContain('e2'); // deduplicated
    expect(ids).toContain('e3');
  });

  it('07-11: getRecentEvents() filters to last N hours', () => {
    const events = [
      mkEvent({ id: 'old', timestampMs: NOW_MS - 25 * 3600 * 1000 }), // 25h ago
      mkEvent({ id: 'new', timestampMs: NOW_MS - 1 * 3600 * 1000 }),  // 1h ago
    ];
    correlator.injectEvents(events);

    const recent = correlator.getRecentEvents(24);
    expect(recent.map((e) => e.id)).toContain('new');
    expect(recent.map((e) => e.id)).not.toContain('old');
  });

  it('07-12: getEventsNearZone() returns events within radiusKm of zone', () => {
    const nearCnd = mkEvent({ id: 'near', lat: 44.33, lon: 28.06 }); // ~1km from Cernavodă
    const farAway = mkEvent({ id: 'far',  lat: 44.43, lon: 26.10 }); // Bucharest, ~200km
    correlator.injectEvents([nearCnd, farAway]);

    const nearby = correlator.getEventsNearZone(CERNAVODA_ZONE, 20);
    expect(nearby.map((e) => e.id)).toContain('near');
    expect(nearby.map((e) => e.id)).not.toContain('far');
  });

  it('07-13: fetchAll() calls all 3 sources, merges, correlates — completes in <10s', async () => {
    process.env.ACLED_API_KEY = 'key';
    process.env.ACLED_EMAIL  = 'test@test.com';
    process.env.FIRMS_MAP_KEY = 'key';

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('acled') || url.includes('gdelt')) {
        return Promise.resolve({ ok: true, json: async () => MOCK_ACLED_RESPONSE } as unknown as Response);
      }
      if (url.includes('firms') || url.includes('nasa')) {
        return Promise.resolve({
          ok: true,
          text: async () => 'latitude,longitude,acq_date,acq_time,brightness,confidence,satellite\n45.2,27.8,2026-03-27,1200,340.5,h,Terra',
        } as unknown as Response);
      }
      // GDELT fallback
      return Promise.resolve({ ok: true, json: async () => MOCK_GDELT_RESPONSE } as unknown as Response);
    });
    vi.stubGlobal('fetch', mockFetch);

    const t0 = performance.now();
    const events = await correlator.fetchAll([CERNAVODA_ZONE, LROP_ZONE]);
    const elapsed = performance.now() - t0;

    expect(Array.isArray(events)).toBe(true);
    expect(elapsed).toBeLessThan(10_000);
    // All events should have been correlated (distanceToNearestZoneKm set)
    expect(events.every((e) => e.distanceToNearestZoneKm !== null)).toBe(true);

    delete process.env.ACLED_API_KEY;
    delete process.env.ACLED_EMAIL;
    delete process.env.FIRMS_MAP_KEY;
  });
});
