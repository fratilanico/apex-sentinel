// FR-W19-05: GdprTrackAnonymiser — TDD RED
// src/intel/gdpr-track-anonymiser.ts does NOT exist yet — all tests will fail

import { describe, it, expect, afterEach, vi } from 'vitest';
import { GdprTrackAnonymiser } from '../../src/intel/gdpr-track-anonymiser.js';

// ---------------------------------------------------------------------------
// Inline types
// ---------------------------------------------------------------------------
type EasaCategory = 'cat-a-commercial' | 'cat-b-modified' | 'cat-c-surveillance' | 'cat-d-unknown';
type AnonymisationStatus = 'ANONYMISED' | 'EXEMPT' | 'PENDING' | 'ERROR_PASSTHROUGH';

interface AnonymisedTrack {
  pseudoId: string; // 16-char hex
  gridLat: number; // floored to 3dp
  gridLon: number;
  anonymisationStatus: AnonymisationStatus;
  legalBasis?: string;
  privacyBreachFlag?: boolean;
}

// Aircraft track fixture
function makeTrack(overrides: Record<string, unknown> = {}) {
  return {
    icao24: 'ROA001',
    callsign: 'ROA001',
    lat: 44.57134,
    lon: 26.08492,
    altBaro: 500,
    altitudeM: 500,
    velocityMs: 20,
    headingDeg: 90,
    onGround: false,
    timestampMs: Date.now(),
    source: 'opensky' as const,
    category: 'cat-a-commercial' as EasaCategory,
    cooperativeContact: true,
    trackStartedAt: Date.now() - 35_000, // 35s ago by default
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FR-W19-05: GdprTrackAnonymiser', () => {
  // 05-01: Cat-A cooperative, 35s track → ANONYMISED, 16-char hex pseudoId, gridLat to 3dp
  it('05-01: cat-a cooperative, trackStartedAt 35s ago → ANONYMISED, 16-char hex, gridLat 3dp', () => {
    const anon = new GdprTrackAnonymiser({ deploySecret: 'test-secret' });
    const track = makeTrack({ trackStartedAt: Date.now() - 35_000 });
    const result: AnonymisedTrack = anon.anonymise(track);
    expect(result.anonymisationStatus).toBe('ANONYMISED');
    expect(result.pseudoId).toMatch(/^[0-9a-f]{16}$/);
    // gridLat floored to 3 decimal places
    expect(result.gridLat).toBe(44.571);
    expect(result.gridLon).toBe(26.084);
  });

  // 05-02: Cat-D unknown → EXEMPT, legalBasis='Art.6(1)(e)'
  it('05-02: cat-d-unknown → EXEMPT, legalBasis=Art.6(1)(e)', () => {
    const anon = new GdprTrackAnonymiser({ deploySecret: 'test-secret' });
    const track = makeTrack({ category: 'cat-d-unknown', cooperativeContact: false });
    const result: AnonymisedTrack = anon.anonymise(track);
    expect(result.anonymisationStatus).toBe('EXEMPT');
    expect(result.legalBasis).toBe('Art.6(1)(e)');
  });

  // 05-03: gridSnap(44.57134, 26.08492) → gridLat=44.571, gridLon=26.084
  it('05-03: gridSnap(44.57134, 26.08492) → gridLat=44.571, gridLon=26.084', () => {
    const anon = new GdprTrackAnonymiser({ deploySecret: 'test-secret' });
    // Access via public or internal method
    const snap = (anon as unknown as { gridSnap: (lat: number, lon: number) => { gridLat: number; gridLon: number } }).gridSnap(44.57134, 26.08492);
    expect(snap.gridLat).toBe(44.571);
    expect(snap.gridLon).toBe(26.084);
  });

  // 05-04: same icao24 + same deploySecret → same pseudoId (deterministic)
  it('05-04: same icao24 + same deploySecret → same pseudoId (deterministic)', () => {
    const anon1 = new GdprTrackAnonymiser({ deploySecret: 'test-secret' });
    const anon2 = new GdprTrackAnonymiser({ deploySecret: 'test-secret' });
    const track = makeTrack({ icao24: 'ABCDEF', trackStartedAt: Date.now() - 35_000 });
    const r1 = anon1.anonymise(track);
    const r2 = anon2.anonymise(track);
    expect(r1.pseudoId).toBe(r2.pseudoId);
  });

  // 05-05: missing deploySecret → ERROR_PASSTHROUGH, privacyBreachFlag=true
  it('05-05: missing deploySecret → ERROR_PASSTHROUGH, privacyBreachFlag=true', () => {
    const anon = new GdprTrackAnonymiser({ deploySecret: '' });
    const track = makeTrack({ trackStartedAt: Date.now() - 35_000 });
    const result: AnonymisedTrack = anon.anonymise(track);
    expect(result.anonymisationStatus).toBe('ERROR_PASSTHROUGH');
    expect(result.privacyBreachFlag).toBe(true);
  });

  // 05-06: Cat-A, trackStartedAt=10s ago → PENDING (not yet 30s)
  it('05-06: cat-a, trackStartedAt 10s ago → PENDING', () => {
    const anon = new GdprTrackAnonymiser({ deploySecret: 'test-secret' });
    const track = makeTrack({ trackStartedAt: Date.now() - 10_000 });
    const result: AnonymisedTrack = anon.anonymise(track);
    expect(result.anonymisationStatus).toBe('PENDING');
  });

  // 05-07: anonymise() never throws for any input
  it('05-07: anonymise() never throws for any input', () => {
    const anon = new GdprTrackAnonymiser({ deploySecret: 'test-secret' });
    const edgeCases = [
      makeTrack({ lat: null, lon: undefined }),
      makeTrack({ icao24: null, trackStartedAt: undefined }),
      makeTrack({ category: 'INVALID_CAT' }),
      null,
      undefined,
      {},
    ];
    for (const tc of edgeCases) {
      expect(() => anon.anonymise(tc as unknown as ReturnType<typeof makeTrack>)).not.toThrow();
    }
  });

  // 05-08: pseudoId changes if deploySecret changes
  it('05-08: different deploySecret → different pseudoId', () => {
    const anon1 = new GdprTrackAnonymiser({ deploySecret: 'secret-A' });
    const anon2 = new GdprTrackAnonymiser({ deploySecret: 'secret-B' });
    const track = makeTrack({ icao24: 'ABCDEF', trackStartedAt: Date.now() - 35_000 });
    const r1 = anon1.anonymise(track);
    const r2 = anon2.anonymise(track);
    expect(r1.pseudoId).not.toBe(r2.pseudoId);
  });

  // 05-09: GDPR Art.5 minimisation — anonymised track does NOT include original icao24
  it('05-09: GDPR minimisation — anonymised track does not include original icao24', () => {
    const anon = new GdprTrackAnonymiser({ deploySecret: 'test-secret' });
    const track = makeTrack({ icao24: 'ROA999', trackStartedAt: Date.now() - 35_000 });
    const result = anon.anonymise(track) as Record<string, unknown>;
    expect(result['icao24']).toBeUndefined();
    // Also ensure pseudoId !== icao24
    expect(result['pseudoId']).not.toBe('ROA999');
  });

  // 05-10: Cat-B modified → PENDING until 30s elapsed
  it('05-10: cat-b-modified, trackStartedAt 20s ago → PENDING', () => {
    const anon = new GdprTrackAnonymiser({ deploySecret: 'test-secret' });
    const track = makeTrack({ category: 'cat-b-modified', trackStartedAt: Date.now() - 20_000 });
    const result: AnonymisedTrack = anon.anonymise(track);
    expect(result.anonymisationStatus).toBe('PENDING');
  });

  // 05-11: bulk anonymise([a1,a2,a3]) → array of 3 AnonymisedTrack
  it('05-11: anonymise([a1,a2,a3]) returns array of 3 AnonymisedTrack', () => {
    const anon = new GdprTrackAnonymiser({ deploySecret: 'test-secret' });
    const tracks = [
      makeTrack({ icao24: 'A00001', trackStartedAt: Date.now() - 35_000 }),
      makeTrack({ icao24: 'A00002', category: 'cat-d-unknown' }),
      makeTrack({ icao24: 'A00003', trackStartedAt: Date.now() - 10_000 }),
    ];
    const results: AnonymisedTrack[] = anon.anonymise(tracks);
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(3);
    expect(results[0]).toHaveProperty('anonymisationStatus');
    expect(results[1]).toHaveProperty('anonymisationStatus');
    expect(results[2]).toHaveProperty('anonymisationStatus');
  });
});
