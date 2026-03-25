// APEX-SENTINEL — W6 Acoustic Profile Library Tests
// FR-W6-01 | tests/ml/FR-W6-01-acoustic-profile.test.ts
// TDD RED phase — all tests must fail before implementation

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AcousticProfileLibrary,
  DroneProfileNotFoundError,
} from '../../src/ml/acoustic-profile-library.js';
import type { DroneAcousticProfile } from '../../src/ml/acoustic-profile-library.js';

describe('FR-W6-01: AcousticProfileLibrary', () => {
  let library: AcousticProfileLibrary;

  beforeEach(() => {
    library = new AcousticProfileLibrary();
  });

  // --- getProfile ---

  it('FR-W6-01-01: GIVEN drone type "shahed-136", WHEN getProfile called, THEN returns complete profile', () => {
    const profile = library.getProfile('shahed-136');
    expect(profile.droneType).toBe('shahed-136');
    expect(profile.frequencyRange[0]).toBeGreaterThanOrEqual(80);
    expect(profile.frequencyRange[1]).toBeLessThanOrEqual(500);
    expect(profile.rpmRange[0]).toBeGreaterThanOrEqual(6000);
    expect(profile.rpmRange[1]).toBeLessThanOrEqual(10000);
    expect(profile.signalType).toBe('piston');
  });

  it('FR-W6-01-02: GIVEN drone type "lancet-3", WHEN getProfile called, THEN returns electric motor profile', () => {
    const profile = library.getProfile('lancet-3');
    expect(profile.droneType).toBe('lancet-3');
    expect(profile.frequencyRange[0]).toBeGreaterThanOrEqual(1000);
    expect(profile.frequencyRange[1]).toBeGreaterThanOrEqual(3000);
    expect(profile.signalType).toBe('electric');
  });

  it('FR-W6-01-03: GIVEN unknown drone type, WHEN getProfile called, THEN throws DroneProfileNotFoundError', () => {
    expect(() => library.getProfile('unknown-drone')).toThrow(DroneProfileNotFoundError);
  });

  it('FR-W6-01-04: GIVEN drone type "orlan-10", WHEN getProfile called, THEN returns turbine profile', () => {
    const profile = library.getProfile('orlan-10');
    expect(profile.signalType).toBe('turbine');
    expect(profile.detectionRangeKm).toBeGreaterThan(5);
  });

  // --- getAllProfiles ---

  it('FR-W6-01-05: GIVEN library initialized, WHEN getAllProfiles called, THEN returns ≥4 profiles', () => {
    const profiles = library.getAllProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(4);
  });

  it('FR-W6-01-06: GIVEN all profiles, WHEN iterated, THEN each has required fields', () => {
    const profiles = library.getAllProfiles();
    for (const p of profiles) {
      expect(p.id).toBeTruthy();
      expect(p.droneType).toBeTruthy();
      expect(Array.isArray(p.frequencyRange)).toBe(true);
      expect(Array.isArray(p.rpmRange)).toBe(true);
      expect(p.signalType).toMatch(/^(piston|electric|turbine)$/);
    }
  });

  // --- matchFrequency ---

  it('FR-W6-01-07: GIVEN frequency range 150Hz-300Hz, WHEN matchFrequency called, THEN returns a piston-class profile (shahed-136 or shahed-131)', () => {
    const match = library.matchFrequency(150, 300);
    expect(match).not.toBeNull();
    // W7: Jaccard similarity — shahed-131 [150-400] scores 0.6 vs shahed-136 [100-400] scores 0.5 for query [150-300]
    expect(['shahed-136', 'shahed-131']).toContain(match!.droneType);
  });

  it('FR-W6-01-08: GIVEN frequency range 1500Hz-3500Hz, WHEN matchFrequency called, THEN returns Lancet-3 profile', () => {
    const match = library.matchFrequency(1500, 3500);
    expect(match).not.toBeNull();
    expect(match!.droneType).toBe('lancet-3');
  });

  it('FR-W6-01-09: GIVEN frequency range with no overlap, WHEN matchFrequency called, THEN returns null', () => {
    const match = library.matchFrequency(10000, 15000); // way above all profiles
    expect(match).toBeNull();
  });

  it('FR-W6-01-10: GIVEN best match among multiple profiles, WHEN matchFrequency called, THEN returns highest Jaccard overlap', () => {
    // W7: Jaccard similarity — shahed-131 [150-400] scores 200/250=0.8 vs shahed-136 [100-400] scores 200/300=0.667 for query [200-400]
    const match = library.matchFrequency(200, 400);
    expect(match!.droneType).toBe('shahed-131');
  });

  // --- addProfile / removeProfile ---

  it('FR-W6-01-11: GIVEN new profile, WHEN addProfile called, THEN getProfile returns it', () => {
    const custom: DroneAcousticProfile = {
      id: 'test-drone-x',
      droneType: 'test-drone-x',
      frequencyRange: [500, 800],
      peakFrequency: 650,
      rpmRange: [3000, 4000],
      signalType: 'electric',
      detectionRangeKm: 1.5,
      falsePositiveRisk: 'low',
      countermeasureNotes: 'Test drone for unit tests',
    };
    library.addProfile(custom);
    const retrieved = library.getProfile('test-drone-x');
    expect(retrieved.id).toBe('test-drone-x');
  });

  it('FR-W6-01-12: GIVEN existing profile, WHEN removeProfile called, THEN getProfile throws', () => {
    library.removeProfile('shahed-136');
    expect(() => library.getProfile('shahed-136')).toThrow(DroneProfileNotFoundError);
  });

  it('FR-W6-01-13: GIVEN non-existent profile id, WHEN removeProfile called, THEN throws DroneProfileNotFoundError', () => {
    expect(() => library.removeProfile('does-not-exist')).toThrow(DroneProfileNotFoundError);
  });

  // --- false positive risk ---

  it('FR-W6-01-14: GIVEN shahed-136 profile, WHEN falsePositiveRisk checked, THEN is "high" (motorcycle confusion)', () => {
    const profile = library.getProfile('shahed-136');
    expect(profile.falsePositiveRisk).toBe('high');
  });

  it('FR-W6-01-15: GIVEN lancet-3 profile, WHEN falsePositiveRisk checked, THEN is "low" or "medium" (electric signature distinctive)', () => {
    const profile = library.getProfile('lancet-3');
    expect(['low', 'medium']).toContain(profile.falsePositiveRisk);
  });
});
