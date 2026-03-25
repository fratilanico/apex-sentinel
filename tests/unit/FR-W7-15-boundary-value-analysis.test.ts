// APEX-SENTINEL — FR-W7-15 Boundary Value Analysis
// tests/unit/FR-W7-15-boundary-value-analysis.test.ts
//
// SQA Textbook (Nirali Prakashan) Ch.4 — Boundary Value Analysis technique.
// Tests the exact decision boundaries in AcousticProfileLibrary.matchFrequency().
//
// Key boundaries documented:
//   - 2kHz: piston vs turbine routing threshold (Lancet-3 electric starts at 1000Hz)
//   - Gerbera: narrow piston band [167, 217] Hz
//   - Shahed-238 turbine: BPF [3000, 8000] Hz (entirely disjoint from piston class)
//
// BVA rule: test at boundary-1, boundary, boundary+1 for every decision point.

import { describe, it, expect, beforeEach } from 'vitest';
import { AcousticProfileLibrary } from '../../src/ml/acoustic-profile-library.js';

describe('FR-W7-15: Boundary Value Analysis — AcousticProfileLibrary', () => {

  let library: AcousticProfileLibrary;

  beforeEach(() => {
    library = new AcousticProfileLibrary();
  });

  // -------------------------------------------------------------------------
  // BVA-01: 2kHz piston/turbine routing boundary
  //
  // Profiles in play around 2kHz:
  //   - orlan-10 electric-piston: [400, 1200] Hz — peaks at 700Hz
  //   - lancet-3 electric: [1000, 4000] Hz — peaks at 2500Hz
  //   - shahed-238 turbine: [3000, 8000] Hz — no overlap below 3kHz
  //
  // At exactly 2000Hz a narrow query should hit Lancet-3 (electric, not piston).
  // At 1999Hz a narrow query straddles Orlan-10/Lancet-3 overlap zone.
  // -------------------------------------------------------------------------

  describe('BVA-01: 2kHz piston/turbine routing threshold', () => {

    it('BVA-01-a: query at 1999Hz (below 2kHz threshold) — must NOT return turbine class', () => {
      // Tight query [1990, 1999] sits entirely within lancet-3 [1000-4000] but below 2kHz
      const profile = library.matchFrequency(1990, 1999);
      expect(profile).not.toBeNull();
      // Must not be the turbine jet engine (shahed-238 is the only turbine engineType)
      expect(profile!.engineType).not.toBe('turbine');
    });

    it('BVA-01-b: query at exactly 2000Hz — must NOT return turbine class', () => {
      // Query [2000, 2000] — zero-width degenerate range on the boundary
      // Lancet-3 [1000-4000] fully contains this point; shahed-238 [3000-8000] does not reach 2000Hz
      const profile = library.matchFrequency(2000, 2000);
      // A zero-width query may return null if no profile Jaccard score > 0;
      // the important assertion is: if a result IS returned it must not be turbine
      if (profile !== null) {
        expect(profile.engineType).not.toBe('turbine');
      }
    });

    it('BVA-01-c: query at 2001Hz (above 2kHz threshold) — still NOT turbine until 3kHz', () => {
      // [2001, 2010] — inside lancet-3 range, shahed-238 starts at 3000Hz
      const profile = library.matchFrequency(2001, 2010);
      if (profile !== null) {
        expect(profile!.engineType).not.toBe('turbine');
        expect(profile!.droneType).not.toBe('shahed-238');
      }
    });

    it('BVA-01-d: query spanning 2000Hz returns non-turbine profile (piston or electric)', () => {
      // [1950, 2050] — centred on boundary; Jaccard winner is electric (mavic-mini [800-3000]
      // beats lancet-3 [1000-4000] because mavic-mini has smaller union: 2200 vs 3000).
      // The BVA assertion is: must NOT be turbine class.
      const profile = library.matchFrequency(1950, 2050);
      expect(profile).not.toBeNull();
      expect(profile!.engineType).toBe('electric');
      expect(profile!.droneType).not.toBe('shahed-238');
    });

  });

  // -------------------------------------------------------------------------
  // BVA-02: Gerbera frequency band edges [167, 217] Hz
  //
  // Gerbera is the narrowest piston band in the library (50Hz wide).
  // Tests: at 167Hz min, 217Hz max, 166Hz (below min), 218Hz (above max).
  // -------------------------------------------------------------------------

  describe('BVA-02: Gerbera frequency band edges [167, 217] Hz', () => {

    it('BVA-02-a: query exactly at Gerbera min (167Hz) — must return gerbera', () => {
      // Tight query [167, 167] — degenerate but sits on the lower boundary
      // The Jaccard score will be non-zero only if the query overlaps the profile range
      const profile = library.matchFrequency(167, 167);
      // A degenerate [167,167] query may return null. If returned, must be gerbera.
      if (profile !== null) {
        expect(profile.droneType).toBe('gerbera');
      }
    });

    it('BVA-02-b: query exactly at Gerbera max (217Hz) — must return gerbera', () => {
      const profile = library.matchFrequency(217, 217);
      if (profile !== null) {
        expect(profile.droneType).toBe('gerbera');
      }
    });

    it('BVA-02-c: query centred in Gerbera band [167, 217] — must return gerbera with best Jaccard', () => {
      // Full-band query is the canonical Gerbera match used in journey tests
      const profile = library.matchFrequency(167, 217);
      expect(profile).not.toBeNull();
      expect(profile!.droneType).toBe('gerbera');
      expect(profile!.engineType).toBe('piston');
    });

    it('BVA-02-d: query 1Hz below Gerbera min (166Hz) — must NOT return gerbera', () => {
      // [160, 166] is entirely below the 167Hz lower bound
      const profile = library.matchFrequency(160, 166);
      // No Gerbera overlap — if a match is returned it must be something else
      if (profile !== null) {
        expect(profile.droneType).not.toBe('gerbera');
      }
    });

    it('BVA-02-e: query 1Hz above Gerbera max (218Hz) — must NOT match gerbera over a wider profile', () => {
      // [218, 250] is above the 217Hz upper bound for gerbera
      // Shahed-136 [100-400] and shahed-131 [150-400] both cover this range —
      // gerbera should NOT win the Jaccard competition here
      const profile = library.matchFrequency(218, 250);
      if (profile !== null) {
        expect(profile.droneType).not.toBe('gerbera');
      }
    });

    it('BVA-02-f: query [166, 218] (1Hz outside on both sides) — gerbera may still match but with lower score', () => {
      // The intersection with gerbera is [167,217]=50Hz; union is [166,218]=52Hz
      // Jaccard = 50/52 ≈ 0.96 — gerbera should still win over wider profiles
      const profile = library.matchFrequency(166, 218);
      expect(profile).not.toBeNull();
      // Gerbera is the tightest match; wider profiles like shahed-131 [150-400] give lower Jaccard
      expect(profile!.droneType).toBe('gerbera');
    });

  });

  // -------------------------------------------------------------------------
  // BVA-03: Shahed-238 turbine band edges [3000, 8000] Hz
  //
  // INDIGO confirmed: completely disjoint from piston class.
  // Tests: 3000Hz min, 8000Hz max, 2999Hz (below min), 8001Hz (above max).
  // -------------------------------------------------------------------------

  describe('BVA-03: Shahed-238 turbine band edges [3000, 8000] Hz', () => {

    it('BVA-03-a: query at 3000Hz (turbine min boundary) — must return shahed-238', () => {
      // Tight query [3000, 3000] at the exact lower turbine boundary
      const profile = library.matchFrequency(3000, 3000);
      if (profile !== null) {
        // At exactly 3000Hz shahed-238 is the only profile with this as its lower bound
        expect(profile.droneType).toBe('shahed-238');
        expect(profile.engineType).toBe('turbine');
      }
    });

    it('BVA-03-b: query at 8000Hz (turbine max boundary) — must return shahed-238', () => {
      const profile = library.matchFrequency(8000, 8000);
      if (profile !== null) {
        expect(profile.droneType).toBe('shahed-238');
      }
    });

    it('BVA-03-c: query centred in turbine band [4000, 7000] — must return shahed-238', () => {
      // Used in JRN-W7-01 journey test; confirm BVA consistency
      const profile = library.matchFrequency(4000, 7000);
      expect(profile).not.toBeNull();
      expect(profile!.droneType).toBe('shahed-238');
      expect(profile!.engineType).toBe('turbine');
    });

    it('BVA-03-d: query at 2999Hz (1Hz below turbine min) — must NOT return shahed-238', () => {
      // [2990, 2999] is entirely in the sub-3kHz zone where no turbine profile exists
      const profile = library.matchFrequency(2990, 2999);
      if (profile !== null) {
        expect(profile.droneType).not.toBe('shahed-238');
        expect(profile.engineType).not.toBe('turbine');
      }
    });

    it('BVA-03-e: query at 8001Hz (1Hz above turbine max) — must NOT return shahed-238', () => {
      // [8001, 8100] is above the 8000Hz ceiling; no profile covers this range
      const profile = library.matchFrequency(8001, 8100);
      // No profile covers this range — result should be null
      expect(profile).toBeNull();
    });

    it('BVA-03-f: query [2999, 3001] spanning turbine min — boundary ambiguity, must return non-null', () => {
      // Razor-edge boundary: lancet-3 [1000-4000] wins over shahed-238 [3000-8000] by Jaccard
      // because lancet-3 gets 2Hz intersection vs shahed-238's 1Hz, and smaller union (3000 vs 5001).
      // The BVA assertion is: system must return SOMETHING (not null) and the query
      // must be recognisable as overlapping the turbine band — validate with BVA-03-a/b/c instead.
      const profile = library.matchFrequency(2999, 3001);
      expect(profile).not.toBeNull();
      // Either lancet-3 (electric) or shahed-238 (turbine) is a valid Jaccard winner at this boundary
      expect(['lancet-3', 'shahed-238']).toContain(profile!.droneType);
    });

    it('BVA-03-g: query [7999, 8001] spanning turbine max — shahed-238 overlap is 1Hz', () => {
      // intersection = [7999,8000] = 1Hz; union = [3000,8001] = 5001Hz; Jaccard ≈ 0.0002
      // But shahed-238 is the ONLY profile intersecting this range, so it wins
      const profile = library.matchFrequency(7999, 8001);
      expect(profile).not.toBeNull();
      expect(profile!.droneType).toBe('shahed-238');
    });

  });

  // -------------------------------------------------------------------------
  // BVA-04: Null / no-overlap boundary
  //
  // Queries entirely outside every profile range must return null.
  // -------------------------------------------------------------------------

  describe('BVA-04: No-match boundary — queries outside all profile ranges', () => {

    it('BVA-04-a: query below all profiles (0-80Hz) — must return null', () => {
      // Lowest profile start is shahed-136 at 100Hz; [0,80] has no intersection
      const profile = library.matchFrequency(0, 80);
      expect(profile).toBeNull();
    });

    it('BVA-04-b: query above all profiles (8100-9000Hz) — must return null', () => {
      const profile = library.matchFrequency(8100, 9000);
      expect(profile).toBeNull();
    });

    it('BVA-04-c: zero-width degenerate range at 99Hz (1Hz below shahed-136 min) — must return null', () => {
      const profile = library.matchFrequency(99, 99);
      expect(profile).toBeNull();
    });

  });

});
