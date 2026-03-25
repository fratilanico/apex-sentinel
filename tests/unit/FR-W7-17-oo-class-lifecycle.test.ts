// APEX-SENTINEL — FR-W7-17 OO Class Lifecycle
// tests/unit/FR-W7-17-oo-class-lifecycle.test.ts
//
// SQA Textbook (Nirali Prakashan) Ch.8 — OO Testing: every operation, every
// attribute, every state transition must be exercised at least once.
//
// Classes under test:
//   - TerminalPhaseDetector: 4 states (CRUISE → APPROACH → TERMINAL → IMPACT)
//   - FalsePositiveGuard:    3 gates (low-confidence, doppler-vehicle, temporal-linear)
//   - AcousticProfileLibrary: empty/single/multi profile states + match/no-match

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TerminalPhaseDetector } from '../../src/detection/terminal-phase-detector.js';
import type { TerminalPhaseConfig, AssessInput, EkfState } from '../../src/detection/terminal-phase-detector.js';
import { FalsePositiveGuard } from '../../src/ml/false-positive-guard.js';
import { AcousticProfileLibrary } from '../../src/ml/acoustic-profile-library.js';
import type { DroneAcousticProfile } from '../../src/ml/acoustic-profile-library.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TPD_CONFIG: TerminalPhaseConfig = {
  speedThresholdMps: 80,
  descentRateThresholdMps: 5,
  headingLockToleranceDeg: 10,
  rfSilenceWindowMs: 2000,
};

function makeEkf(overrides: Partial<EkfState> = {}): EkfState {
  return {
    lat: 51.5,
    lon: 4.9,
    altMeters: 300,
    speedMps: 50,
    headingDeg: 270,
    verticalSpeedMps: -1,
    ...overrides,
  };
}

function allFourIndicators(): Omit<AssessInput, 'ekfState'> {
  return {
    headingLockedToTarget: true,
    altitudeDescentRate: true,
    rfLinkSilent: true,
  };
}

function threeIndicators(): Omit<AssessInput, 'ekfState'> {
  return {
    headingLockedToTarget: true,
    altitudeDescentRate: true,
    rfLinkSilent: false,
  };
}

const FPG_CONFIG = { temporalWindowMs: 10_000, dopplerThresholdKmh: 60 };

const STUB_PROFILE: DroneAcousticProfile = {
  id: 'test-drone',
  droneType: 'test-drone',
  frequencyRange: [500, 1000],
  peakFrequency: 750,
  rpmRange: [5000, 8000],
  signalType: 'electric',
  engineType: 'electric',
  detectionRangeKm: 1.0,
  falsePositiveRisk: 'low',
  countermeasureNotes: 'Test stub profile.',
};

// ===========================================================================
describe('FR-W7-17: OO Class Lifecycle — All States/Operations/Attributes', () => {

  // =========================================================================
  describe('TerminalPhaseDetector — all 4 states + all transitions + guard conditions', () => {

    let tpd: TerminalPhaseDetector;

    beforeEach(() => {
      tpd = new TerminalPhaseDetector(TPD_CONFIG);
    });

    // -----------------------------------------------------------------------
    // Initial state
    // -----------------------------------------------------------------------

    it('OO-TPD-01: initial state is CRUISE with confidence 0', () => {
      expect(tpd.getState()).toBe('CRUISE');
      expect(tpd.getConfidence()).toBe(0);
    });

    // -----------------------------------------------------------------------
    // CRUISE state — 0 or 1-2 active indicators
    // -----------------------------------------------------------------------

    it('OO-TPD-02: assess with 0 indicators → stays CRUISE, confidence 0', () => {
      tpd.assess({
        ekfState: makeEkf({ speedMps: 10 }),
        headingLockedToTarget: false,
        altitudeDescentRate: false,
        rfLinkSilent: false,
      });
      expect(tpd.getState()).toBe('CRUISE');
      expect(tpd.getConfidence()).toBe(0);
    });

    it('OO-TPD-03: assess with 2 indicators → stays CRUISE, confidence = 2 * 0.15 = 0.30', () => {
      // speedExceedsThreshold (speedMps ≥ 80) + headingLocked = 2 indicators
      tpd.assess({
        ekfState: makeEkf({ speedMps: 90 }),
        headingLockedToTarget: true,
        altitudeDescentRate: false,
        rfLinkSilent: false,
      });
      expect(tpd.getState()).toBe('CRUISE');
      expect(tpd.getConfidence()).toBeCloseTo(0.30, 5);
    });

    // -----------------------------------------------------------------------
    // APPROACH state — exactly 3 active indicators
    // -----------------------------------------------------------------------

    it('OO-TPD-04: CRUISE → APPROACH transition fires approach event exactly once', () => {
      const listener = vi.fn();
      tpd.on('approach', listener);

      // 3 indicators: speed(90mps)=true + headingLocked=true + rfLinkSilent=true
      tpd.assess({
        ekfState: makeEkf({ speedMps: 90 }),
        headingLockedToTarget: true,
        altitudeDescentRate: false,
        rfLinkSilent: true,
      });

      expect(tpd.getState()).toBe('APPROACH');
      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0].state).toBe('APPROACH');
    });

    it('OO-TPD-05: APPROACH held for 3 consecutive frames does NOT re-fire approach event', () => {
      const listener = vi.fn();
      tpd.on('approach', listener);

      const input: AssessInput = {
        ekfState: makeEkf({ speedMps: 90 }),
        headingLockedToTarget: true,
        altitudeDescentRate: false,
        rfLinkSilent: true,
      };

      tpd.assess(input);
      tpd.assess(input);
      tpd.assess(input);

      // Event fires only on first transition, not on repeated frames in same state
      expect(listener).toHaveBeenCalledOnce();
    });

    it('OO-TPD-06: APPROACH confidence is 0.6 + activeIndicators * 0.05', () => {
      // 3 indicators → confidence = 0.6 + 3*0.05 = 0.75
      tpd.assess({
        ekfState: makeEkf({ speedMps: 90 }),
        headingLockedToTarget: true,
        altitudeDescentRate: false,
        rfLinkSilent: true,
      });
      expect(tpd.getState()).toBe('APPROACH');
      expect(tpd.getConfidence()).toBeCloseTo(0.75, 5);
    });

    // -----------------------------------------------------------------------
    // TERMINAL state — all 4 active indicators
    // -----------------------------------------------------------------------

    it('OO-TPD-07: APPROACH → TERMINAL transition fires terminal event on first transition', () => {
      const terminalListener = vi.fn();
      tpd.on('terminal', terminalListener);

      // First set APPROACH
      tpd.assess({
        ekfState: makeEkf({ speedMps: 90 }),
        ...threeIndicators(),
      });

      // Now escalate to TERMINAL (all 4)
      tpd.assess({
        ekfState: makeEkf({ speedMps: 90 }),
        ...allFourIndicators(),
      });

      expect(tpd.getState()).toBe('TERMINAL');
      expect(terminalListener).toHaveBeenCalledOnce();
      expect(terminalListener.mock.calls[0][0].state).toBe('TERMINAL');
    });

    it('OO-TPD-08: TERMINAL initial confidence is 0.9', () => {
      tpd.assess({
        ekfState: makeEkf({ speedMps: 90 }),
        ...allFourIndicators(),
      });
      expect(tpd.getState()).toBe('TERMINAL');
      expect(tpd.getConfidence()).toBeCloseTo(0.9, 5);
    });

    it('OO-TPD-09: TERMINAL confidence increases by 0.025 per consecutive frame up to 1.0', () => {
      // Frame 1: confidence = 0.9
      tpd.assess({ ekfState: makeEkf({ speedMps: 90 }), ...allFourIndicators() });
      expect(tpd.getConfidence()).toBeCloseTo(0.9, 5);

      // Frame 2: confidence = 0.925
      tpd.assess({ ekfState: makeEkf({ speedMps: 90 }), ...allFourIndicators() });
      expect(tpd.getConfidence()).toBeCloseTo(0.925, 5);

      // Frame 3: confidence = 0.95
      tpd.assess({ ekfState: makeEkf({ speedMps: 90 }), ...allFourIndicators() });
      expect(tpd.getConfidence()).toBeCloseTo(0.95, 5);
    });

    it('OO-TPD-10: TERMINAL confidence is capped at 1.0 — never exceeds max', () => {
      // Run enough frames to exceed 1.0 without capping
      for (let i = 0; i < 20; i++) {
        tpd.assess({ ekfState: makeEkf({ speedMps: 90 }), ...allFourIndicators() });
      }
      expect(tpd.getConfidence()).toBeLessThanOrEqual(1.0);
      expect(tpd.getConfidence()).toBeCloseTo(1.0, 1);
    });

    it('OO-TPD-11: TERMINAL does NOT re-fire terminal event on repeated frames', () => {
      const terminalListener = vi.fn();
      tpd.on('terminal', terminalListener);

      for (let i = 0; i < 5; i++) {
        tpd.assess({ ekfState: makeEkf({ speedMps: 90 }), ...allFourIndicators() });
      }

      expect(terminalListener).toHaveBeenCalledOnce();
    });

    // -----------------------------------------------------------------------
    // IMPACT state — altMeters ≤ 0
    // -----------------------------------------------------------------------

    it('OO-TPD-12: altMeters ≤ 0 → forces IMPACT state regardless of indicators', () => {
      const impactListener = vi.fn();
      tpd.on('impact', impactListener);

      tpd.assess({
        ekfState: makeEkf({ altMeters: 0 }),
        headingLockedToTarget: false,
        altitudeDescentRate: false,
        rfLinkSilent: false,
      });

      expect(tpd.getState()).toBe('IMPACT');
      expect(tpd.getConfidence()).toBe(1.0);
      expect(impactListener).toHaveBeenCalledOnce();
    });

    it('OO-TPD-13: negative altMeters also triggers IMPACT', () => {
      tpd.assess({
        ekfState: makeEkf({ altMeters: -5 }),
        headingLockedToTarget: false,
        altitudeDescentRate: false,
        rfLinkSilent: false,
      });
      expect(tpd.getState()).toBe('IMPACT');
    });

    it('OO-TPD-14: IMPACT fires with impact event payload carrying correct ekfState', () => {
      const listener = vi.fn();
      tpd.on('impact', listener);
      const ekf = makeEkf({ altMeters: 0, lat: 51.51, lon: 4.91 });

      tpd.assess({ ekfState: ekf, headingLockedToTarget: false, altitudeDescentRate: false, rfLinkSilent: false });

      expect(listener).toHaveBeenCalledOnce();
      const event = listener.mock.calls[0][0];
      expect(event.ekfState.lat).toBe(51.51);
      expect(event.ekfState.lon).toBe(4.91);
    });

    // -----------------------------------------------------------------------
    // reset() operation
    // -----------------------------------------------------------------------

    it('OO-TPD-15: reset() returns detector to CRUISE, confidence 0, clears consecutive count', () => {
      // Drive to TERMINAL
      for (let i = 0; i < 3; i++) {
        tpd.assess({ ekfState: makeEkf({ speedMps: 90 }), ...allFourIndicators() });
      }
      expect(tpd.getState()).toBe('TERMINAL');
      expect(tpd.getConfidence()).toBeGreaterThan(0.9);

      tpd.reset();

      expect(tpd.getState()).toBe('CRUISE');
      expect(tpd.getConfidence()).toBe(0);
    });

    it('OO-TPD-16: after reset(), TERMINAL → APPROACH → TERMINAL cycle works correctly', () => {
      const listener = vi.fn();
      tpd.on('terminal', listener);

      // First TERMINAL
      tpd.assess({ ekfState: makeEkf({ speedMps: 90 }), ...allFourIndicators() });
      expect(listener).toHaveBeenCalledTimes(1);

      // Reset
      tpd.reset();

      // New TERMINAL — event must fire again (state transition CRUISE → TERMINAL)
      tpd.assess({ ekfState: makeEkf({ speedMps: 90 }), ...allFourIndicators() });
      expect(listener).toHaveBeenCalledTimes(2);
    });

    // -----------------------------------------------------------------------
    // Speed threshold guard condition attribute
    // -----------------------------------------------------------------------

    it('OO-TPD-17: speedMps exactly at threshold (80 mps) activates speed indicator', () => {
      // Only speed indicator active → CRUISE with confidence 0.15
      tpd.assess({
        ekfState: makeEkf({ speedMps: 80 }),
        headingLockedToTarget: false,
        altitudeDescentRate: false,
        rfLinkSilent: false,
      });
      expect(tpd.getState()).toBe('CRUISE');
      expect(tpd.getConfidence()).toBeCloseTo(0.15, 5);
    });

    it('OO-TPD-18: speedMps just below threshold (79.9 mps) does NOT activate speed indicator', () => {
      tpd.assess({
        ekfState: makeEkf({ speedMps: 79.9 }),
        headingLockedToTarget: false,
        altitudeDescentRate: false,
        rfLinkSilent: false,
      });
      expect(tpd.getState()).toBe('CRUISE');
      expect(tpd.getConfidence()).toBe(0); // 0 active indicators
    });

  });

  // =========================================================================
  describe('FalsePositiveGuard — initialized state + each gate independently + combined gate', () => {

    let fpg: FalsePositiveGuard;

    beforeEach(() => {
      fpg = new FalsePositiveGuard(FPG_CONFIG);
    });

    it('OO-FPG-01: initialized state — new trackId has 0 temporal samples', () => {
      const stats = fpg.getWindowStats('TRK-NEW');
      expect(stats.count).toBe(0);
    });

    it('OO-FPG-02: Gate 1 — yamnetConfidence below 0.85 → isFalsePositive=true, reason=low-confidence', () => {
      const result = fpg.assess({ yamnetConfidence: 0.84, hasRfSignal: true, trackId: 'TRK-A' });
      expect(result.isFalsePositive).toBe(true);
      expect(result.reason).toBe('low-confidence');
    });

    it('OO-FPG-03: Gate 1 — yamnetConfidence exactly at 0.85 → NOT a false positive', () => {
      const result = fpg.assess({ yamnetConfidence: 0.85, hasRfSignal: true, trackId: 'TRK-A' });
      expect(result.isFalsePositive).toBe(false);
    });

    it('OO-FPG-04: Gate 1 — yamnetConfidence above 0.85 (0.88) → passes gate', () => {
      const result = fpg.assess({ yamnetConfidence: 0.88, hasRfSignal: true, trackId: 'TRK-A' });
      // May still be suppressed by gate 2/3 but gate 1 alone should not fire
      expect(result.reason).not.toBe('low-confidence');
    });

    it('OO-FPG-05: Gate 2 — dopplerShiftKmh above 60 → isFalsePositive=true, reason=doppler-vehicle', () => {
      const result = fpg.assess({
        yamnetConfidence: 0.90,
        hasRfSignal: true,
        trackId: 'TRK-B',
        dopplerShiftKmh: 61,
      });
      expect(result.isFalsePositive).toBe(true);
      expect(result.reason).toBe('doppler-vehicle');
    });

    it('OO-FPG-06: Gate 2 — dopplerShiftKmh exactly at 60 → NOT suppressed by Doppler gate', () => {
      const result = fpg.assess({
        yamnetConfidence: 0.90,
        hasRfSignal: true,
        trackId: 'TRK-B',
        dopplerShiftKmh: 60,
      });
      // Gate 2 uses > not >=, so 60 does not trigger
      expect(result.reason).not.toBe('doppler-vehicle');
    });

    it('OO-FPG-07: Gate 3 — 3 high-speed linear samples → isFalsePositive=true, reason=temporal-linear', () => {
      const now = Date.now();
      // Inject 3 samples at >60km/h with consistent heading (linear road vehicle)
      fpg.addTemporalSample({ trackId: 'TRK-C', sample: { lat: 51.500, lon: 4.900, timestamp: now - 2000, speedKmh: 70, heading: 90 } });
      fpg.addTemporalSample({ trackId: 'TRK-C', sample: { lat: 51.500, lon: 4.905, timestamp: now - 1000, speedKmh: 72, heading: 91 } });
      fpg.addTemporalSample({ trackId: 'TRK-C', sample: { lat: 51.500, lon: 4.910, timestamp: now,       speedKmh: 74, heading: 89 } });

      const result = fpg.assess({ yamnetConfidence: 0.90, hasRfSignal: false, trackId: 'TRK-C' });
      expect(result.isFalsePositive).toBe(true);
      expect(result.reason).toBe('temporal-linear');
    });

    it('OO-FPG-08: Gate 3 — samples with high heading variance → NOT linear → NOT suppressed', () => {
      const now = Date.now();
      // Erratic headings (drone manoeuvre, not road vehicle)
      fpg.addTemporalSample({ trackId: 'TRK-D', sample: { lat: 51.500, lon: 4.900, timestamp: now - 2000, speedKmh: 70, heading: 0   } });
      fpg.addTemporalSample({ trackId: 'TRK-D', sample: { lat: 51.501, lon: 4.901, timestamp: now - 1000, speedKmh: 65, heading: 180 } });
      fpg.addTemporalSample({ trackId: 'TRK-D', sample: { lat: 51.499, lon: 4.902, timestamp: now,        speedKmh: 68, heading: 90  } });

      const result = fpg.assess({ yamnetConfidence: 0.90, hasRfSignal: true, trackId: 'TRK-D' });
      // Heading variance = std dev of [0, 180, 90] ≈ 73.5° — above HEADING_VARIANCE_THRESHOLD(45°)
      expect(result.isFalsePositive).toBe(false);
    });

    it('OO-FPG-09: all gates pass → isFalsePositive=false, reason=null', () => {
      const result = fpg.assess({
        yamnetConfidence: 0.92,
        hasRfSignal: true,
        trackId: 'TRK-E',
        dopplerShiftKmh: 30,
      });
      expect(result.isFalsePositive).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('OO-FPG-10: clearWindow() removes temporal samples for a track', () => {
      const now = Date.now();
      fpg.addTemporalSample({ trackId: 'TRK-F', sample: { lat: 51.5, lon: 4.9, timestamp: now, speedKmh: 70, heading: 90 } });
      expect(fpg.getWindowStats('TRK-F').count).toBe(1);

      fpg.clearWindow('TRK-F');
      expect(fpg.getWindowStats('TRK-F').count).toBe(0);
    });

    it('OO-FPG-11: shouldSuppressAlert() delegates to isFalsePositive field', () => {
      const fp  = { isFalsePositive: true,  confidence: 0.8, reason: 'low-confidence' as const };
      const ok  = { isFalsePositive: false, confidence: 0.9, reason: null };

      expect(fpg.shouldSuppressAlert('TRK-X', fp)).toBe(true);
      expect(fpg.shouldSuppressAlert('TRK-X', ok)).toBe(false);
    });

    it('OO-FPG-12: temporal window prunes old samples beyond temporalWindowMs', () => {
      const now = Date.now();
      // Add a sample far outside the 10s window
      fpg.addTemporalSample({
        trackId: 'TRK-G',
        sample: { lat: 51.5, lon: 4.9, timestamp: now - 20_000, speedKmh: 70, heading: 90 },
      });
      // The old sample should be pruned when a new (current) sample is added
      fpg.addTemporalSample({
        trackId: 'TRK-G',
        sample: { lat: 51.5, lon: 4.91, timestamp: now, speedKmh: 70, heading: 91 },
      });
      // Only 1 sample should remain (the recent one)
      expect(fpg.getWindowStats('TRK-G').count).toBe(1);
    });

  });

  // =========================================================================
  describe('AcousticProfileLibrary — empty/single/multi profile states + match/no-match', () => {

    it('OO-APL-01: default constructor populates library with known W7 profiles', () => {
      const lib = new AcousticProfileLibrary();
      const profiles = lib.getAllProfiles();
      expect(profiles.length).toBeGreaterThanOrEqual(7); // at minimum: shahed-136, lancet-3, orlan-10, mavic-mini, gerbera, shahed-131, shahed-238
    });

    it('OO-APL-02: getProfile() returns correct profile for known droneType', () => {
      const lib = new AcousticProfileLibrary();
      const p = lib.getProfile('gerbera');
      expect(p.droneType).toBe('gerbera');
      expect(p.frequencyRange).toEqual([167, 217]);
      expect(p.engineType).toBe('piston');
    });

    it('OO-APL-03: getProfile() throws DroneProfileNotFoundError for unknown droneType', () => {
      const lib = new AcousticProfileLibrary();
      expect(() => lib.getProfile('nonexistent-drone')).toThrowError('Drone profile not found: nonexistent-drone');
    });

    it('OO-APL-04: addProfile() adds a new profile that is immediately retrievable', () => {
      const lib = new AcousticProfileLibrary();
      lib.addProfile(STUB_PROFILE);
      const p = lib.getProfile('test-drone');
      expect(p.droneType).toBe('test-drone');
    });

    it('OO-APL-05: addProfile() overrides existing profile with same droneType', () => {
      const lib = new AcousticProfileLibrary();
      const updated: DroneAcousticProfile = { ...STUB_PROFILE, detectionRangeKm: 9.9 };
      lib.addProfile(STUB_PROFILE);
      lib.addProfile(updated);
      expect(lib.getProfile('test-drone').detectionRangeKm).toBe(9.9);
    });

    it('OO-APL-06: removeProfile() deletes the profile', () => {
      const lib = new AcousticProfileLibrary();
      lib.addProfile(STUB_PROFILE);
      lib.removeProfile('test-drone');
      expect(() => lib.getProfile('test-drone')).toThrow();
    });

    it('OO-APL-07: removeProfile() on non-existent droneType throws DroneProfileNotFoundError', () => {
      const lib = new AcousticProfileLibrary();
      expect(() => lib.removeProfile('ghost-drone')).toThrowError('Drone profile not found: ghost-drone');
    });

    it('OO-APL-08: matchFrequency() on empty library (all profiles removed) returns null', () => {
      const lib = new AcousticProfileLibrary();
      // Remove all default profiles
      for (const p of lib.getAllProfiles()) {
        lib.removeProfile(p.droneType);
      }
      expect(lib.getAllProfiles()).toHaveLength(0);
      expect(lib.matchFrequency(100, 500)).toBeNull();
    });

    it('OO-APL-09: matchFrequency() with single profile — returns that profile when query overlaps', () => {
      const lib = new AcousticProfileLibrary();
      for (const p of lib.getAllProfiles()) lib.removeProfile(p.droneType);
      lib.addProfile(STUB_PROFILE);

      const result = lib.matchFrequency(600, 900);
      expect(result).not.toBeNull();
      expect(result!.droneType).toBe('test-drone');
    });

    it('OO-APL-10: matchFrequency() with single profile — returns null when query does NOT overlap', () => {
      const lib = new AcousticProfileLibrary();
      for (const p of lib.getAllProfiles()) lib.removeProfile(p.droneType);
      lib.addProfile(STUB_PROFILE);

      const result = lib.matchFrequency(2000, 3000);
      expect(result).toBeNull();
    });

    it('OO-APL-11: matchFrequency() multiple profiles — returns best Jaccard match', () => {
      const lib = new AcousticProfileLibrary();
      // Shahed-238 [3000-8000] vs Lancet-3 [1000-4000] for query [3500-6000]
      // Jaccard(shahed-238) = 2500 / 5000 = 0.5
      // Jaccard(lancet-3)  = 500  / 5000 = 0.1
      const result = lib.matchFrequency(3500, 6000);
      expect(result).not.toBeNull();
      expect(result!.droneType).toBe('shahed-238');
    });

    it('OO-APL-12: getAllProfiles() returns defensive copy — mutations do not affect library', () => {
      const lib = new AcousticProfileLibrary();
      const before = lib.getAllProfiles().length;
      const arr = lib.getAllProfiles();
      arr.push(STUB_PROFILE); // mutate the returned array

      // Library must be unchanged
      expect(lib.getAllProfiles().length).toBe(before);
    });

  });

});
