// APEX-SENTINEL — W7 Acoustic Profile Library Expansion Tests
// FR-W7-02 | tests/ml/FR-W7-02-acoustic-profile-expansion.test.ts
// TDD RED phase — new profiles: Gerbera, Shahed-131, Shahed-238 (jet turbine)

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AcousticProfileLibrary,
  DroneProfileNotFoundError,
} from '../../src/ml/acoustic-profile-library.js';
import type { DroneAcousticProfile } from '../../src/ml/acoustic-profile-library.js';

describe('FR-W7-02: AcousticProfileLibrary Expansion (Gerbera, Shahed-131, Shahed-238)', () => {
  let library: AcousticProfileLibrary;

  beforeEach(() => {
    library = new AcousticProfileLibrary();
  });

  // --- Gerbera profile ---

  it('FR-W7-02-01: GIVEN profile "gerbera", WHEN getProfile called, THEN freqMin is 167Hz and freqMax is 217Hz', () => {
    const profile = library.getProfile('gerbera');
    expect(profile.droneType).toBe('gerbera');
    expect(profile.frequencyRange[0]).toBe(167);
    expect(profile.frequencyRange[1]).toBe(217);
  });

  // --- Shahed-131 profile ---

  it('FR-W7-02-02: GIVEN profile "shahed-131", WHEN getProfile called, THEN freqMin is 150Hz and freqMax is 400Hz', () => {
    const profile = library.getProfile('shahed-131');
    expect(profile.droneType).toBe('shahed-131');
    expect(profile.frequencyRange[0]).toBe(150);
    expect(profile.frequencyRange[1]).toBe(400);
  });

  it('FR-W7-02-03: GIVEN shahed-131 and shahed-136 profiles, THEN shahed-131 RPM range lower bound is greater than shahed-136 RPM range lower bound', () => {
    const shahed131 = library.getProfile('shahed-131');
    const shahed136 = library.getProfile('shahed-136');
    expect(shahed131.rpmRange[0]).toBeGreaterThan(shahed136.rpmRange[0]);
  });

  // --- Shahed-238 jet turbine profile ---

  it('FR-W7-02-04: GIVEN profile "shahed-238", WHEN getProfile called, THEN freqMin is 3000Hz and freqMax is 8000Hz (jet turbine range)', () => {
    const profile = library.getProfile('shahed-238');
    expect(profile.droneType).toBe('shahed-238');
    expect(profile.frequencyRange[0]).toBe(3000);
    expect(profile.frequencyRange[1]).toBe(8000);
  });

  it('FR-W7-02-05: GIVEN profile "shahed-238", THEN engineType is "turbine" (not "piston")', () => {
    const profile = library.getProfile('shahed-238');
    expect(profile.engineType).toBe('turbine');
    expect(profile.engineType).not.toBe('piston');
  });

  // --- falsePositiveRisk ---

  it('FR-W7-02-06: GIVEN profile "shahed-131", THEN falsePositiveRisk is "high" (motorcycle confusion risk)', () => {
    const profile = library.getProfile('shahed-131');
    expect(profile.falsePositiveRisk).toBe('high');
  });

  it('FR-W7-02-07: GIVEN profile "gerbera", THEN falsePositiveRisk is "medium"', () => {
    const profile = library.getProfile('gerbera');
    expect(profile.falsePositiveRisk).toBe('medium');
  });

  it('FR-W7-02-08: GIVEN profile "shahed-238", THEN falsePositiveRisk is "low" (jet turbine signature is distinctive)', () => {
    const profile = library.getProfile('shahed-238');
    expect(profile.falsePositiveRisk).toBe('low');
  });

  // --- matchFrequency with new profiles ---

  it('FR-W7-02-09: GIVEN frequency range [167, 217], WHEN matchFrequency called, THEN returns gerbera profile', () => {
    const match = library.matchFrequency(167, 217);
    expect(match).not.toBeNull();
    expect(match!.droneType).toBe('gerbera');
  });

  it('FR-W7-02-10: GIVEN frequency range [3000, 8000], WHEN matchFrequency called, THEN returns shahed-238 profile', () => {
    const match = library.matchFrequency(3000, 8000);
    expect(match).not.toBeNull();
    expect(match!.droneType).toBe('shahed-238');
  });

  it('FR-W7-02-11: GIVEN frequency range [150, 400], WHEN matchFrequency called, THEN returns shahed-131 or shahed-136 (highest overlap wins)', () => {
    const match = library.matchFrequency(150, 400);
    expect(match).not.toBeNull();
    expect(['shahed-131', 'shahed-136']).toContain(match!.droneType);
  });

  // --- getAllProfiles count ---

  it('FR-W7-02-12: GIVEN library initialized with W7 profiles, WHEN getAllProfiles called, THEN returns at least 7 profiles (4 existing + 3 new)', () => {
    const profiles = library.getAllProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(7);
  });

  // --- turbine class distinction ---

  it('FR-W7-02-13: GIVEN shahed-238 profile, THEN signalType or engineType does not equal the piston/electric class of other profiles', () => {
    const shahed238 = library.getProfile('shahed-238');
    const shahed136 = library.getProfile('shahed-136');
    // shahed-238 is turbine; shahed-136 is piston — they must differ
    const turbineClass = shahed238.engineType ?? shahed238.signalType;
    const pistonClass = shahed136.engineType ?? shahed136.signalType;
    expect(turbineClass).not.toBe(pistonClass);
  });

  // --- addProfile with turbine engineType ---

  it('FR-W7-02-14: GIVEN new turbine profile, WHEN addProfile called, THEN getProfile returns it with engineType "turbine"', () => {
    const custom: DroneAcousticProfile = {
      id: 'test-turbine-x',
      droneType: 'test-turbine-x',
      frequencyRange: [2500, 9000],
      peakFrequency: 5000,
      rpmRange: [40000, 80000],
      signalType: 'turbine',
      engineType: 'turbine',
      detectionRangeKm: 8,
      falsePositiveRisk: 'low',
      countermeasureNotes: 'Test turbine profile',
    };
    library.addProfile(custom);
    const retrieved = library.getProfile('test-turbine-x');
    expect(retrieved.engineType).toBe('turbine');
  });

  // --- removeProfile then getProfile throws ---

  it('FR-W7-02-15: GIVEN profile "shahed-238" exists, WHEN removeProfile("shahed-238") called, THEN subsequent getProfile("shahed-238") throws DroneProfileNotFoundError', () => {
    library.removeProfile('shahed-238');
    expect(() => library.getProfile('shahed-238')).toThrow(DroneProfileNotFoundError);
  });
});
