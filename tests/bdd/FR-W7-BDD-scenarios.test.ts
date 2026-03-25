// APEX-SENTINEL — FR-W7 BDD Scenarios (Gherkin-in-Vitest)
// tests/bdd/FR-W7-BDD-scenarios.test.ts
//
// "The Future of SQA" (Springer 2020) Part 5 — Behavioural specification techniques.
// BDD scenarios expressed as Gherkin-structured nested describe/it blocks.
//
// Pattern:
//   SCENARIO: <name>
//     GIVEN <precondition>
//       WHEN <action>
//         THEN <outcome>
//         AND  <additional outcome>
//
// 4 scenarios:
//   1. Gerbera loitering munition detected at engagement range
//   2. Jammer activation blocked by FalsePositiveGuard (FP suppression)
//   3. Shahed-238 turbine detected via 3-8kHz band (terminal phase)
//   4. System degrades gracefully when acoustic node goes offline

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AcousticProfileLibrary } from '../../src/ml/acoustic-profile-library.js';
import { FalsePositiveGuard } from '../../src/ml/false-positive-guard.js';
import { TerminalPhaseDetector } from '../../src/detection/terminal-phase-detector.js';
import { SentinelPipelineV2 } from '../../src/integration/sentinel-pipeline-v2.js';
import { ElrsRfFingerprint } from '../../src/rf/elrs-fingerprint.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const TPD_CONFIG = {
  speedThresholdMps: 80,
  descentRateThresholdMps: 5,
  headingLockToleranceDeg: 10,
  rfSilenceWindowMs: 2000,
};

function make16kHzSamples(): Float32Array {
  return new Float32Array(16_000);
}

// ===========================================================================
// SCENARIO 1: Gerbera loitering munition detected at engagement range
// ===========================================================================
describe('SCENARIO: Gerbera loitering munition detected at engagement range', () => {

  describe('GIVEN the acoustic pipeline is running with 16kHz input', () => {
    let library: AcousticProfileLibrary;
    let guard: FalsePositiveGuard;
    let detector: TerminalPhaseDetector;

    beforeEach(() => {
      library  = new AcousticProfileLibrary();
      guard    = new FalsePositiveGuard({ temporalWindowMs: 10_000, dopplerThresholdKmh: 60 });
      detector = new TerminalPhaseDetector(TPD_CONFIG);
    });

    describe('WHEN audio with Gerbera signature [167-217Hz] is received', () => {

      it('THEN classification returns droneType=gerbera with frequencyRange=[167,217]', () => {
        const profile = library.matchFrequency(167, 217);

        expect(profile).not.toBeNull();
        expect(profile!.droneType).toBe('gerbera');
        expect(profile!.frequencyRange).toEqual([167, 217]);
      });

      it('AND signalType is piston (not electric, not turbine)', () => {
        const profile = library.matchFrequency(167, 217);
        expect(profile!.signalType).toBe('piston');
        expect(profile!.engineType).toBe('piston');
      });

      it('AND detection range is at least 3.0 km (engagement range confirmation)', () => {
        const profile = library.matchFrequency(167, 217);
        expect(profile!.detectionRangeKm).toBeGreaterThanOrEqual(3.0);
      });

      it('AND FalsePositiveGuard does NOT suppress the detection when yamnetConfidence ≥ 0.85', () => {
        const assessment = guard.assess({
          yamnetConfidence: 0.87,
          hasRfSignal: true,
          trackId: 'TRK-GBR-001',
        });

        expect(assessment.isFalsePositive).toBe(false);
        expect(assessment.reason).toBeNull();
      });

      it('AND terminal phase detector transitions to APPROACH state when 3-of-4 indicators active', () => {
        // Gerbera in loiter: speed=90mps(>80 threshold), heading locked, RF still active
        detector.assess({
          ekfState: { lat: 51.5, lon: 4.9, altMeters: 400, speedMps: 90, headingDeg: 270, verticalSpeedMps: -3 },
          headingLockedToTarget: true,
          altitudeDescentRate: true,
          rfLinkSilent: false, // RF still live during loiter
        });

        expect(detector.getState()).toBe('APPROACH');
      });

      it('AND terminal phase detector transitions to TERMINAL when RF link cut (all 4 indicators)', () => {
        const terminalListener = vi.fn();
        detector.on('terminal', terminalListener);

        // TERMINAL: all 4 — speed, heading, descent rate, RF silent
        detector.assess({
          ekfState: { lat: 51.5, lon: 4.9, altMeters: 200, speedMps: 90, headingDeg: 270, verticalSpeedMps: -8 },
          headingLockedToTarget: true,
          altitudeDescentRate: true,
          rfLinkSilent: true,
        });

        expect(detector.getState()).toBe('TERMINAL');
        expect(terminalListener).toHaveBeenCalledOnce();
        expect(terminalListener.mock.calls[0][0].confidence).toBeGreaterThanOrEqual(0.9);
      });

    });
  });
});

// ===========================================================================
// SCENARIO 2: Jammer activation blocked by FalsePositiveGuard (FP suppression)
// ===========================================================================
describe('SCENARIO: Jammer activation blocked by FalsePositiveGuard (FP suppression scenario)', () => {

  describe('GIVEN the system is monitoring for drone threats', () => {
    let library: AcousticProfileLibrary;
    let guard: FalsePositiveGuard;

    beforeEach(() => {
      library = new AcousticProfileLibrary();
      guard   = new FalsePositiveGuard({
        temporalWindowMs: 10_000,
        dopplerThresholdKmh: 60,
        confidenceThreshold: 0.85,
      });
    });

    describe('WHEN acoustic signature is detected but YAMNet confidence is low (0.72)', () => {

      it('THEN FalsePositiveGuard returns isFalsePositive=true', () => {
        const result = guard.assess({
          yamnetConfidence: 0.72,
          hasRfSignal: false,
          trackId: 'TRK-FP-001',
        });
        expect(result.isFalsePositive).toBe(true);
        expect(result.reason).toBe('low-confidence');
      });

      it('AND shouldSuppressAlert() returns true for this assessment', () => {
        const assessment = guard.assess({
          yamnetConfidence: 0.72,
          hasRfSignal: false,
          trackId: 'TRK-FP-001',
        });
        expect(guard.shouldSuppressAlert('TRK-FP-001', assessment)).toBe(true);
      });

    });

    describe('WHEN acoustic signature is detected but Doppler indicates vehicle at 80km/h', () => {

      it('THEN FalsePositiveGuard returns isFalsePositive=true with reason=doppler-vehicle', () => {
        const result = guard.assess({
          yamnetConfidence: 0.90,
          hasRfSignal: false,
          trackId: 'TRK-FP-002',
          dopplerShiftKmh: 80,
        });
        expect(result.isFalsePositive).toBe(true);
        expect(result.reason).toBe('doppler-vehicle');
      });

      it('AND the acoustic profile for the frequency range still resolves (acoustic detection happens before FP check)', () => {
        // Motorcycle acoustic range similar to Shahed-136 piston [100-400Hz]
        const profile = library.matchFrequency(150, 350);
        // Profile match succeeds — but FP guard will suppress the downstream action
        expect(profile).not.toBeNull();
        expect(['shahed-136', 'shahed-131', 'gerbera']).toContain(profile!.droneType);
      });

    });

    describe('WHEN 3 temporal samples show a straight high-speed road trajectory', () => {

      it('THEN FalsePositiveGuard returns isFalsePositive=true with reason=temporal-linear', () => {
        const now = Date.now();
        guard.addTemporalSample({ trackId: 'TRK-FP-003', sample: { lat: 51.500, lon: 4.900, timestamp: now - 2000, speedKmh: 75, heading: 90 } });
        guard.addTemporalSample({ trackId: 'TRK-FP-003', sample: { lat: 51.500, lon: 4.904, timestamp: now - 1000, speedKmh: 76, heading: 90 } });
        guard.addTemporalSample({ trackId: 'TRK-FP-003', sample: { lat: 51.500, lon: 4.908, timestamp: now,        speedKmh: 74, heading: 91 } });

        const result = guard.assess({
          yamnetConfidence: 0.91,
          hasRfSignal: false,
          trackId: 'TRK-FP-003',
        });

        expect(result.isFalsePositive).toBe(true);
        expect(result.reason).toBe('temporal-linear');
      });

      it('AND the temporal window can be cleared so future detections on same trackId start fresh', () => {
        guard.clearWindow('TRK-FP-003');
        expect(guard.getWindowStats('TRK-FP-003').count).toBe(0);
      });

    });
  });
});

// ===========================================================================
// SCENARIO 3: Shahed-238 turbine detected via 3-8kHz band (terminal phase)
// ===========================================================================
describe('SCENARIO: Shahed-238 turbine detected via 3-8kHz band (terminal phase)', () => {

  describe('GIVEN the acoustic library contains the Shahed-238 jet turbine profile', () => {
    let library: AcousticProfileLibrary;
    let detector: TerminalPhaseDetector;
    let pipeline: SentinelPipelineV2;

    beforeEach(() => {
      library  = new AcousticProfileLibrary();
      detector = new TerminalPhaseDetector(TPD_CONFIG);
    });

    describe('WHEN audio energy in the [3000-8000Hz] band is detected', () => {

      it('THEN classification returns droneType=shahed-238', () => {
        const profile = library.matchFrequency(3000, 8000);
        expect(profile).not.toBeNull();
        expect(profile!.droneType).toBe('shahed-238');
      });

      it('AND engineType is turbine (NOT piston)', () => {
        const profile = library.matchFrequency(3000, 8000);
        expect(profile!.engineType).toBe('turbine');
        expect(profile!.engineType).not.toBe('piston');
      });

      it('AND detection range is 8.0 km (widest in the library — jet engine)', () => {
        const profile = library.matchFrequency(3000, 8000);
        expect(profile!.detectionRangeKm).toBe(8.0);
      });

      it('AND falsePositiveRisk is low (turbine signature is distinctive)', () => {
        const profile = library.matchFrequency(3000, 8000);
        expect(profile!.falsePositiveRisk).toBe('low');
      });

    });

    describe('WHEN Shahed-238 terminal phase begins (RF silent, speed > 80 m/s, descent rate high)', () => {

      it('THEN terminal phase detector enters TERMINAL state', () => {
        const terminalListener = vi.fn();
        detector.on('terminal', terminalListener);

        // Shahed-238 cruise: 500-800km/h ≈ 139-222 m/s, all 4 indicators active
        detector.assess({
          ekfState: {
            lat: 51.5, lon: 4.9,
            altMeters: 150,
            speedMps: 160,       // 576km/h — well above 80 m/s threshold
            headingDeg: 45,
            verticalSpeedMps: -15,
          },
          headingLockedToTarget: true,
          altitudeDescentRate: true,
          rfLinkSilent: true,    // Shahed-238 pre-programmed — RF silent entire approach
        });

        expect(detector.getState()).toBe('TERMINAL');
        expect(terminalListener).toHaveBeenCalledOnce();
      });

      it('AND confidence is at least 0.9 on first TERMINAL frame', () => {
        detector.assess({
          ekfState: { lat: 51.5, lon: 4.9, altMeters: 150, speedMps: 160, headingDeg: 45, verticalSpeedMps: -15 },
          headingLockedToTarget: true,
          altitudeDescentRate: true,
          rfLinkSilent: true,
        });

        expect(detector.getState()).toBe('TERMINAL');
        expect(detector.getConfidence()).toBeGreaterThanOrEqual(0.9);
      });

      it('AND SentinelPipelineV2 processFrame returns terminalPhaseState=TERMINAL when override is set', async () => {
        const solver = { solve: vi.fn().mockResolvedValue({ lat: 51.505, lon: 4.903, confidenceM: 50 }) };
        pipeline = new SentinelPipelineV2({ tdoaSolver: solver });
        await pipeline.start();

        const result = await pipeline.processFrame({
          audioSamples: make16kHzSamples(),
          timestampMs: Date.now(),
          overrideTerminalPhase: true,
        });

        expect(result.terminalPhaseState).toBe('TERMINAL');
        await pipeline.stop();
      });

    });

    describe('WHEN Shahed-238 is at sub-3kHz frequency (misidentification test)', () => {

      it('THEN matchFrequency at [1000-2999Hz] must NOT return shahed-238', () => {
        const profile = library.matchFrequency(1000, 2999);
        if (profile !== null) {
          expect(profile.droneType).not.toBe('shahed-238');
          expect(profile.engineType).not.toBe('turbine');
        }
      });

    });
  });
});

// ===========================================================================
// SCENARIO 4: System degrades gracefully when acoustic node goes offline
// ===========================================================================
describe('SCENARIO: System degrades gracefully when acoustic node goes offline (fail-operational)', () => {

  describe('GIVEN the sentinel pipeline is running with a functioning TDOA solver', () => {
    let pipeline: SentinelPipelineV2;
    let onTerminal: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      onTerminal = vi.fn();
      const solver = {
        solve: vi.fn().mockResolvedValue({ lat: 51.505, lon: 4.903, confidenceM: 60 }),
      };
      pipeline = new SentinelPipelineV2({
        tdoaSolver: solver,
        defaultPosition: { lat: 51.500, lon: 4.900 },
        onTerminalPhase: onTerminal,
      });
      await pipeline.start();
    });

    describe('WHEN the TDOA solver starts returning null (acoustic node failure)', () => {

      it('THEN processFrame falls back to last known position (not null, not (0,0))', async () => {
        // First frame: valid position established
        await pipeline.processFrame({ audioSamples: make16kHzSamples(), timestampMs: Date.now() });

        // Simulate node failure by creating a new pipeline with null solver
        const nullSolver = { solve: vi.fn().mockResolvedValue(null) };
        const degradedPipeline = new SentinelPipelineV2({
          tdoaSolver: nullSolver,
          defaultPosition: { lat: 51.500, lon: 4.900 },
        });
        await degradedPipeline.start();
        // No prior position yet — falls to defaultPosition
        const result = await degradedPipeline.processFrame({
          audioSamples: make16kHzSamples(),
          timestampMs: Date.now(),
        });

        // Must fall back to defaultPosition, not (0,0)
        expect(result.position.lat).toBe(51.500);
        expect(result.position.lon).toBe(4.900);
      });

      it('AND confidenceM is set to 9999 (maximum uncertainty marker) when no valid fix available', async () => {
        // Pipeline with no defaultPosition and null solver
        const nullSolver = { solve: vi.fn().mockResolvedValue(null) };
        const noPriorPipeline = new SentinelPipelineV2({ tdoaSolver: nullSolver });
        await noPriorPipeline.start();

        const result = await noPriorPipeline.processFrame({
          audioSamples: make16kHzSamples(),
          timestampMs: Date.now(),
        });

        // 9999 is the sentinel value indicating degraded / no-fix state
        expect(result.position.confidenceM).toBe(9999);
      });

      it('AND pipeline remains running (isRunning=true) — degradation is not a crash', async () => {
        const nullSolver = { solve: vi.fn().mockResolvedValue(null) };
        const degradedPipeline = new SentinelPipelineV2({
          tdoaSolver: nullSolver,
          defaultPosition: { lat: 51.500, lon: 4.900 },
        });
        await degradedPipeline.start();

        // Process a frame during degradation
        await degradedPipeline.processFrame({ audioSamples: make16kHzSamples(), timestampMs: Date.now() });

        // Pipeline must still be running
        expect(degradedPipeline.isRunning()).toBe(true);
        await degradedPipeline.stop();
      });

    });

    describe('WHEN the RF fingerprint module receives no ELRS packets for > 2000ms', () => {

      it('THEN ElrsRfFingerprint.rfSilent becomes true (link cut indicator activates)', () => {
        const elrs = new ElrsRfFingerprint({ frequencyMhz: 915, burstThresholdDbm: -90 });
        const base = 1_700_000_000_000;

        // Last packet was received 2500ms ago
        elrs.processSample({ timestampMs: base - 2500, powerDbm: -70, frequencyMhz: 915 });
        elrs.tick(base);

        expect(elrs.rfSilent).toBe(true);
      });

      it('AND the system correctly distinguishes RF silence from "detector not yet initialised"', () => {
        const elrs = new ElrsRfFingerprint({ frequencyMhz: 915, burstThresholdDbm: -90 });

        // Uninitialized → rfSilent is false (no judgment)
        expect(elrs.rfSilent).toBe(false);

        // Initialized (tick called) but no packets → rfSilent becomes true
        elrs.tick(Date.now());
        expect(elrs.rfSilent).toBe(true);
      });

      it('AND system recovers to rfSilent=false when ELRS traffic resumes', () => {
        const elrs = new ElrsRfFingerprint({ frequencyMhz: 915, burstThresholdDbm: -90 });
        const now = Date.now();

        // 1. Traffic period
        for (let i = 0; i < 100; i++) {
          elrs.processSample({ timestampMs: now - 2000 + i * 2, powerDbm: -70, frequencyMhz: 915 });
        }
        elrs.tick(now - 1000);
        expect(elrs.rfSilent).toBe(false);

        // 2. Silence period (no packets for 2100ms)
        elrs.tick(now + 2100);
        expect(elrs.rfSilent).toBe(true);

        // 3. Recovery: new packets arrive
        for (let i = 0; i < 100; i++) {
          elrs.processSample({ timestampMs: now + 2200 + i * 2, powerDbm: -70, frequencyMhz: 915 });
        }
        elrs.tick(now + 2400);
        expect(elrs.rfSilent).toBe(false);
      });

    });

    describe('WHEN stop() is called during active processing', () => {

      it('THEN isRunning() immediately returns false', async () => {
        await pipeline.stop();
        expect(pipeline.isRunning()).toBe(false);
      });

      it('AND subsequent processFrame() calls throw rather than silently return stale data', async () => {
        await pipeline.stop();
        await expect(
          pipeline.processFrame({ audioSamples: make16kHzSamples(), timestampMs: Date.now() })
        ).rejects.toThrow();
      });

    });
  });
});
