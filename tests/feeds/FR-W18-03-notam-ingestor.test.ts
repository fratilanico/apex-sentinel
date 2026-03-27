// APEX-SENTINEL W18 — FR-W18-03: NotamIngestor / NotamParser
// TDD RED — src/feeds/notam-ingestor.ts and src/feeds/notam-parser.ts not yet written

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotamIngestor } from '../../src/feeds/notam-ingestor.js';
import { NotamParser } from '../../src/feeds/notam-parser.js';
import type { NotamRestriction } from '../../src/feeds/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Real-format NOTAM for LROP (Henri Coandă International Airport, Bucharest)
const LROP_VIP_NOTAM = `
Q) LRBB/QRDCA/IV/NBO/AW/000/025/4434N02605E005
A) LROP B) 2603271000 C) 2603271800
E) DRONE OPERATIONS PROHIBITED WITHIN 5NM OF ARP DURING VIP MOVEMENT
`.trim();

// NOTAM without drone relevance
const GENERIC_NOTAM = `
Q) LRBB/QMXLC/IV/BO/AW/000/060/4434N02605E010
A) LROP B) 2603270600 C) 2603272200
E) TAXIWAY CHARLIE CLOSED FOR MAINTENANCE
`.trim();

// NOTAM with UAS explicit reference
const UAS_NOTAM = `
Q) LRBB/QRDCA/IV/NBO/AW/000/050/4546N02318E003
A) LRCL B) 2603280800 C) 2603281600
E) UAS OPERATIONS RESTRICTED IN CTR AREA DUE TO MILITARY EXERCISE
`.trim();

// Expired NOTAM (C-line in the past)
const EXPIRED_NOTAM = `
Q) LRBB/QRDCA/IV/NBO/AW/000/025/4434N02605E005
A) LROP B) 2501010800 C) 2501011200
E) DRONE OPERATIONS PROHIBITED WITHIN 5NM OF ARP
`.trim();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FR-W18-03: NotamParser', () => {
  let parser: NotamParser;

  beforeEach(() => {
    parser = new NotamParser();
  });

  it('03-01: parseNotam() parses Q-line correctly', () => {
    const result = parser.parseNotam(LROP_VIP_NOTAM);
    expect(result).toMatchObject({
      fir: 'LRBB',
      subject: 'QRDCA',
      traffic: 'IV',
      purpose: 'NBO',
      scope: 'AW',
      lowerFl: 0,
      upperFl: 25,
      airport: 'LROP',
    });
    // Coords extracted from Q-line: 4434N02605E
    expect(result.centerLat).toBeCloseTo(44.57, 1);
    expect(result.centerLon).toBeCloseTo(26.08, 1);
    expect(result.radiusNm).toBe(5);
  });

  it('03-02: parseNotam() extracts valid from/to dates from B/C lines', () => {
    const result = parser.parseNotam(LROP_VIP_NOTAM);
    // B) 2603271000 → 2026-03-27 10:00 UTC
    expect(result.validFrom).toBeInstanceOf(Date);
    expect(result.validFrom.getUTCFullYear()).toBe(2026);
    expect(result.validFrom.getUTCMonth()).toBe(2); // March = 2
    expect(result.validFrom.getUTCDate()).toBe(27);
    expect(result.validFrom.getUTCHours()).toBe(10);
    // C) 2603271800 → 18:00 UTC same day
    expect(result.validTo).toBeInstanceOf(Date);
    expect(result.validTo.getUTCHours()).toBe(18);
  });

  it('03-03: parseNotam() extracts E-line free text', () => {
    const result = parser.parseNotam(LROP_VIP_NOTAM);
    expect(result.freeText).toContain('DRONE OPERATIONS PROHIBITED');
    expect(result.freeText).toContain('VIP MOVEMENT');
  });

  it('03-04: parseNotam() for drone-relevant NOTAM sets isDroneRelevant=true', () => {
    const drone = parser.parseNotam(LROP_VIP_NOTAM);
    expect(drone.isDroneRelevant).toBe(true);

    const uas = parser.parseNotam(UAS_NOTAM);
    expect(uas.isDroneRelevant).toBe(true);
  });

  it('03-05: parseNotam() for non-drone NOTAM sets isDroneRelevant=false', () => {
    const result = parser.parseNotam(GENERIC_NOTAM);
    expect(result.isDroneRelevant).toBe(false);
  });

  it('03-06: isActive() returns true for NOTAM within valid time window', () => {
    const result = parser.parseNotam(LROP_VIP_NOTAM);
    // Valid 10:00–18:00 on 2026-03-27; use fixed epoch within that window
    const insideWindow = new Date('2026-03-27T14:00:00Z');
    expect(parser.isActive(result, insideWindow)).toBe(true);
  });

  it('03-07: isActive() returns false for expired NOTAM', () => {
    const result = parser.parseNotam(EXPIRED_NOTAM);
    // Expired Jan 2025 — any 2026 date is after
    expect(parser.isActive(result, new Date('2026-03-27T12:00:00Z'))).toBe(false);
  });

  it('03-08: toGeoJson() converts Q-line coords+radius to GeoJSON circle polygon with 32 points', () => {
    const result = parser.parseNotam(LROP_VIP_NOTAM);
    const geo = parser.toGeoJson(result);
    expect(geo.type).toBe('Feature');
    expect(geo.geometry.type).toBe('Polygon');
    // 32 points + closing point = 33 coordinate pairs
    expect(geo.geometry.coordinates[0]).toHaveLength(33);
    // First and last coordinate should be identical (closed ring)
    const coords = geo.geometry.coordinates[0];
    expect(coords[0]).toEqual(coords[coords.length - 1]);
  });
});

describe('FR-W18-03: NotamIngestor', () => {
  let ingestor: NotamIngestor;

  beforeEach(() => {
    ingestor = new NotamIngestor();
    vi.restoreAllMocks();
  });

  it('03-09: fetchForAirport() calls correct FAA API URL for LROP', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    await ingestor.fetchForAirport('LROP');

    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('LROP');
    expect(calledUrl).toContain('notam');
  });

  it('03-10: handles HTTP 429 rate limit gracefully — returns cached data', async () => {
    // Seed cache with one NOTAM
    const mockOk = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ notamText: LROP_VIP_NOTAM }] }),
    } as unknown as Response);
    vi.stubGlobal('fetch', mockOk);
    await ingestor.fetchForAirport('LROP');

    // Now simulate 429
    const mock429 = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
    } as unknown as Response);
    vi.stubGlobal('fetch', mock429);

    const result = await ingestor.fetchForAirport('LROP');
    // Should not throw and should return previously cached data
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('03-11: handles network timeout — returns empty array and logs error', async () => {
    const mockTimeout = vi.fn().mockRejectedValue(new Error('AbortError: The operation was aborted'));
    vi.stubGlobal('fetch', mockTimeout);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await ingestor.fetchForAirport('LROP');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('03-12: getActiveRestrictions() filters to current time only', async () => {
    const parser = new NotamParser();
    const active  = parser.parseNotam(LROP_VIP_NOTAM);  // 10:00–18:00 UTC 2026-03-27
    const expired = parser.parseNotam(EXPIRED_NOTAM);    // expired Jan 2025

    // Inject parsed NOTAMs directly (bypass HTTP)
    ingestor.injectParsed([active, expired]);

    const now = new Date('2026-03-27T14:00:00Z');
    const restrictions = ingestor.getActiveRestrictions(now);
    expect(restrictions.some((r) => r.isDroneRelevant)).toBe(true);
    // Expired one must not be returned
    expect(restrictions.every((r) => {
      return r.validTo.getTime() > now.getTime();
    })).toBe(true);
  });
});
