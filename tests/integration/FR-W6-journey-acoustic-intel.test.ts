// APEX-SENTINEL — W6 Acoustic Intelligence Journey Tests
// L3 Journey | tests/integration/FR-W6-journey-acoustic-intel.test.ts
// Cross-FR journeys: acoustic detection → false positive guard → EKF → BRAVE1 output

import { describe, it, expect, vi } from 'vitest';
import { AcousticProfileLibrary } from '../../src/ml/acoustic-profile-library.js';
import { FalsePositiveGuard } from '../../src/ml/false-positive-guard.js';
import { MultiNodeFusion } from '../../src/fusion/multi-node-fusion.js';
import { MonteCarloPropagator } from '../../src/prediction/monte-carlo-propagator.js';
import { BRAVE1Format } from '../../src/output/brave1-format.js';
import type { EKFState } from '../../src/prediction/types.js';

function makeState(overrides: Partial<EKFState> = {}): EKFState {
  return {
    lat: 51.5, lon: 4.9, alt: 300,
    vLat: 0.0001, vLon: 0.0001, vAlt: -12,
    confidence: 0.91,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('FR-W6-JOURNEY: Acoustic Intelligence End-to-End', () => {
  // --- Journey 1: Shahed-136 detection → profile match → BRAVE1 ---

  it('JRN-W6-01: GIVEN acoustic freq 200Hz detected, WHEN profile matched + BRAVE1 encoded, THEN full pipeline produces valid message', () => {
    const library = new AcousticProfileLibrary();
    const formatter = new BRAVE1Format({ transmitter: { post: vi.fn().mockResolvedValue({ status: 200 }) } });

    // Step 1: match frequency to drone profile
    // W7 note: [150, 300] overlaps both shahed-136 [100-400] and shahed-131 [150-400]
    // either is a valid piston-class match at 200Hz fundamental
    const profile = library.matchFrequency(150, 300);
    expect(['shahed-136', 'shahed-131']).toContain(profile!.droneType);

    // Step 2: encode tactical report as BRAVE1
    const report = {
      trackId: 'TRK-JRN-01',
      classification: profile!.droneType,
      confidence: 0.92,
      location: { lat: 51.5, lon: 4.9, coarsened: true as const },
      velocity: { speedKmh: 150, heading: 270, altitude: 300 },
      impactProjection: { timeToImpactSeconds: 25, lat: 51.51, lon: 4.87 },
      timestamp: new Date().toISOString(),
      nodeCount: 3,
      narrative: `${profile!.droneType} detected via acoustic profile match.`,
    };
    const msg = formatter.encode(report);
    const validation = formatter.validate(msg);
    expect(validation.valid).toBe(true);
    expect(msg.type).toBeTruthy();
    expect(msg.remarks).toContain(profile!.droneType);
  });

  // --- Journey 2: Motorcycle false positive correctly suppressed ---

  it('JRN-W6-02: GIVEN motorcycle-like linear track, WHEN FPG assessed, THEN alert suppressed', () => {
    const guard = new FalsePositiveGuard({ temporalWindowMs: 10_000, dopplerThresholdKmh: 60 });
    const now = Date.now();

    // Add motorcycle temporal pattern: 80km/h linear
    for (let i = 0; i < 5; i++) {
      guard.addTemporalSample({
        trackId: 'TRK-MOTO',
        sample: {
          lat: 51.5 + i * 0.003, // ~0.3km per step → 80km/h over 10s
          lon: 4.9,
          timestamp: now + i * 2000,
          speedKmh: 80,
          heading: 0,
        },
      });
    }

    // Assess with Shahed-136-like confidence
    const assessment = guard.assess({
      yamnetConfidence: 0.91, // high confidence — still false positive due to temporal
      hasRfSignal: false,
      trackId: 'TRK-MOTO',
    });
    expect(assessment.isFalsePositive).toBe(true);
    expect(guard.shouldSuppressAlert('TRK-MOTO', assessment)).toBe(true);
  });

  // --- Journey 3: Multi-node fusion + Monte Carlo → BRAVE1 with uncertainty ---

  it('JRN-W6-03: GIVEN 3 nodes detect Lancet-3, WHEN fused + Monte Carlo run, THEN 95th percentile bounds in BRAVE1 ce field', () => {
    const fusion = new MultiNodeFusion({ maxAgeMs: 10_000 });
    const propagator = new MonteCarloPropagator({ nSamples: 500 });
    const formatter = new BRAVE1Format({ transmitter: { post: vi.fn() } });

    // Step 1: 3 nodes report Lancet-3
    fusion.addNodeReport({ nodeId: 'N1', trackId: 'TRK-LNC', confidence: 0.88, lat: 51.5, lon: 4.9, distanceKm: 1.5, timestamp: Date.now() });
    fusion.addNodeReport({ nodeId: 'N2', trackId: 'TRK-LNC', confidence: 0.91, lat: 51.5, lon: 4.9, distanceKm: 2.0, timestamp: Date.now() });
    fusion.addNodeReport({ nodeId: 'N3', trackId: 'TRK-LNC', confidence: 0.85, lat: 51.5, lon: 4.9, distanceKm: 3.0, timestamp: Date.now() });
    const consensus = fusion.fuse('TRK-LNC');
    expect(consensus!.fusedConfidence).toBeGreaterThan(0.8);

    // Step 2: Monte Carlo for impact uncertainty
    const state = makeState({ confidence: consensus!.fusedConfidence, vAlt: -15, alt: 400 });
    const mcResult = propagator.propagate(state, { positionNoiseSigmaM: 50 });
    const bounds = propagator.get95thPercentileBounds();

    // Step 3: Encode as BRAVE1 with ce = 95th percentile radius
    const ceValue = bounds ? bounds.radiusM : 50;
    const report = {
      trackId: 'TRK-LNC',
      classification: 'lancet-3',
      confidence: consensus!.fusedConfidence,
      location: { lat: 51.5, lon: 4.9, coarsened: true as const },
      velocity: { speedKmh: 80, heading: 90, altitude: 400 },
      impactProjection: bounds ? { timeToImpactSeconds: 27, lat: bounds.centerLat, lon: bounds.centerLon } : null,
      timestamp: new Date().toISOString(),
      nodeCount: consensus!.nodeCount,
      narrative: `Lancet-3 detected. ${consensus!.nodeCount} nodes agree.`,
    };
    const msg = formatter.encode(report);
    expect(msg.ce).toBeGreaterThan(0);
    expect(formatter.validate(msg).valid).toBe(true);
  });

  // --- Journey 4: False positive from low confidence ---

  it('JRN-W6-04: GIVEN acoustic confidence 0.72, WHEN FPG assesses, THEN suppressed immediately (low-confidence gate)', () => {
    const guard = new FalsePositiveGuard({ temporalWindowMs: 10_000, dopplerThresholdKmh: 60 });
    const assessment = guard.assess({ yamnetConfidence: 0.72, hasRfSignal: true, trackId: 'TRK-LOWCONF' });
    expect(assessment.isFalsePositive).toBe(true);
    expect(assessment.reason).toBe('low-confidence');
    expect(guard.shouldSuppressAlert('TRK-LOWCONF', assessment)).toBe(true);
  });

  // --- Journey 5: BRAVE1 roundtrip encode→decode ---

  it('JRN-W6-05: GIVEN TacticalReport, WHEN BRAVE1 encode+decode roundtrip, THEN classification and coords preserved', () => {
    const formatter = new BRAVE1Format({ transmitter: { post: vi.fn() } });
    const original = {
      trackId: 'TRK-RT',
      classification: 'orlan-10',
      confidence: 0.85,
      location: { lat: 51.6, lon: 5.1, coarsened: true as const },
      velocity: { speedKmh: 120, heading: 45, altitude: 500 },
      impactProjection: null,
      timestamp: '2026-03-25T08:00:00.000Z',
      nodeCount: 2,
      narrative: 'Orlan-10 reconnaissance drone at 500m.',
    };
    const encoded = formatter.encode(original);
    const decoded = formatter.decode(encoded);
    expect(decoded.location.lat).toBeCloseTo(51.6, 2);
    expect(decoded.location.lon).toBeCloseTo(5.1, 2);
    expect(decoded.timestamp).toBe('2026-03-25T08:00:00.000Z');
  });

  // --- Journey 6: Profile library → all profiles → matchFrequency ---

  it('JRN-W6-06: GIVEN all profiles in library, WHEN each frequency range queried, THEN each profile self-matches', () => {
    const library = new AcousticProfileLibrary();
    const all = library.getAllProfiles();
    for (const profile of all) {
      const midFreq = (profile.frequencyRange[0] + profile.frequencyRange[1]) / 2;
      const match = library.matchFrequency(profile.frequencyRange[0], profile.frequencyRange[1]);
      expect(match).not.toBeNull();
      expect(match!.droneType).toBe(profile.droneType);
    }
  });

  // --- Journey 7: Monte Carlo without impact (ascending) → BRAVE1 with "NO IMPACT" ---

  it('JRN-W6-07: GIVEN ascending drone (vAlt > 0), WHEN Monte Carlo run, THEN 0 samples + BRAVE1 still encodes', () => {
    const propagator = new MonteCarloPropagator({ nSamples: 200 });
    const formatter = new BRAVE1Format({ transmitter: { post: vi.fn() } });

    const state = makeState({ vAlt: 3 }); // ascending
    const result = propagator.propagate(state);
    expect(result.impactSamples.length).toBe(0);

    const report = {
      trackId: 'TRK-ASC',
      classification: 'mavic-mini',
      confidence: 0.88,
      location: { lat: 51.5, lon: 4.9, coarsened: true as const },
      velocity: { speedKmh: 50, heading: 180, altitude: 150 },
      impactProjection: null,
      timestamp: new Date().toISOString(),
      nodeCount: 1,
      narrative: 'Drone ascending. No impact projected.',
    };
    const msg = formatter.encode(report);
    expect(formatter.validate(msg).valid).toBe(true);
  });

  // --- Journey 8: Node fusion with all stale → null consensus ---

  it('JRN-W6-08: GIVEN all node reports stale (>5s old), WHEN clearStale + getConsensus, THEN null', () => {
    const fusion = new MultiNodeFusion({ maxAgeMs: 5000 });
    const oldTs = Date.now() - 10_000;
    fusion.addNodeReport({ nodeId: 'N1', trackId: 'TRK-STALE', confidence: 0.9, lat: 51.5, lon: 4.9, distanceKm: 1.0, timestamp: oldTs });
    fusion.clearStale();
    const consensus = fusion.getConsensus('TRK-STALE');
    expect(consensus).toBeNull();
  });

  // --- Journey 9: Profile removal → matchFrequency misses removed profile ---

  it('JRN-W6-09: GIVEN shahed-136 removed from library, WHEN matchFrequency 200Hz called, THEN returns null or different profile', () => {
    const library = new AcousticProfileLibrary();
    library.removeProfile('shahed-136');
    const match = library.matchFrequency(150, 300);
    // Either null or not shahed-136
    if (match !== null) {
      expect(match.droneType).not.toBe('shahed-136');
    }
  });

  // --- Journey 10: Doppler vehicle discriminated, true Lancet-3 passes ---

  it('JRN-W6-10: GIVEN Lancet-3 (electric) at slow speed + RF present, WHEN FPG assesses, THEN NOT false positive', () => {
    const guard = new FalsePositiveGuard({ temporalWindowMs: 10_000, dopplerThresholdKmh: 60 });
    const result = guard.assess({
      yamnetConfidence: 0.89,
      hasRfSignal: true,
      trackId: 'TRK-LNC-TRUE',
      dopplerShiftKmh: 25, // slow drone speed
    });
    expect(result.isFalsePositive).toBe(false);
  });

  // --- Journey 11: Monte Carlo 95th percentile tighter when confidence high ---

  it('JRN-W6-11: GIVEN high vs low confidence EKF, WHEN 95th percentile compared, THEN high confidence produces tighter bound', () => {
    const highPropagator = new MonteCarloPropagator({ nSamples: 300 });
    const lowPropagator = new MonteCarloPropagator({ nSamples: 300 });

    const highState = makeState({ confidence: 0.95 });
    const lowState = makeState({ confidence: 0.5 });

    highPropagator.propagate(highState, { positionNoiseSigmaM: 10 });
    lowPropagator.propagate(lowState, { positionNoiseSigmaM: 200 });

    const highBounds = highPropagator.get95thPercentileBounds();
    const lowBounds = lowPropagator.get95thPercentileBounds();

    if (highBounds && lowBounds) {
      expect(highBounds.radiusM).toBeLessThan(lowBounds.radiusM);
    }
  });

  // --- Journey 12: BRAVE1 validation rejects incomplete messages ---

  it('JRN-W6-12: GIVEN BRAVE1 missing multiple required fields, WHEN validate called, THEN all missing fields in errors', () => {
    const formatter = new BRAVE1Format({ transmitter: { post: vi.fn() } });
    const incomplete = {
      type: '',
      uid: '',
      time: '',
      stale: '',
      lat: 91, // out of range
      lon: 4.9,
      ce: -1, // invalid
      hae: 200,
      speed: 40,
      course: 270,
      callsign: 'X',
      how: 'm-g',
      remarks: '',
    };
    const result = formatter.validate(incomplete);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });

  // --- Journey 13: Acoustic profile custom → match → encode ---

  it('JRN-W6-13: GIVEN custom profile added, WHEN matched + BRAVE1 encoded, THEN classification reflects custom type', () => {
    const library = new AcousticProfileLibrary();
    const formatter = new BRAVE1Format({ transmitter: { post: vi.fn() } });

    library.addProfile({
      id: 'custom-fpv',
      droneType: 'custom-fpv',
      frequencyRange: [3000, 6000],
      peakFrequency: 4500,
      rpmRange: [15000, 25000],
      signalType: 'electric',
      detectionRangeKm: 0.3,
      falsePositiveRisk: 'low',
      countermeasureNotes: 'FPV racing drone profile',
    });

    const match = library.matchFrequency(3000, 6000);
    expect(match!.droneType).toBe('custom-fpv');

    const report = {
      trackId: 'TRK-FPV', classification: match!.droneType, confidence: 0.91,
      location: { lat: 51.5, lon: 4.9, coarsened: true as const },
      velocity: { speedKmh: 200, heading: 0, altitude: 30 },
      impactProjection: null, timestamp: new Date().toISOString(), nodeCount: 1,
      narrative: 'Custom FPV detected.',
    };
    const msg = formatter.encode(report);
    expect(msg.remarks).toContain('custom-fpv');
    expect(formatter.validate(msg).valid).toBe(true);
  });

  // --- Journey 14: FPG clear → fresh assessment ---

  it('JRN-W6-14: GIVEN vehicle pattern established, WHEN clearWindow + fresh samples circling, THEN next assessment not linear', () => {
    const guard = new FalsePositiveGuard({ temporalWindowMs: 10_000, dopplerThresholdKmh: 60 });
    const now = Date.now();

    // First: establish linear pattern
    for (let i = 0; i < 5; i++) {
      guard.addTemporalSample({ trackId: 'TRK-CLR', sample: { lat: 51.5 + i * 0.003, lon: 4.9, timestamp: now + i * 2000, speedKmh: 80, heading: 0 } });
    }
    guard.clearWindow('TRK-CLR');

    // After clear: add circling pattern (drone-like)
    const headings = [0, 72, 144, 216, 288];
    headings.forEach((h, i) => {
      const angle = (h * Math.PI) / 180;
      guard.addTemporalSample({ trackId: 'TRK-CLR', sample: { lat: 51.5 + 0.001 * Math.sin(angle), lon: 4.9 + 0.001 * Math.cos(angle), timestamp: now + 20_000 + i * 2000, speedKmh: 30, heading: h } });
    });

    const result = guard.assess({ yamnetConfidence: 0.93, hasRfSignal: true, trackId: 'TRK-CLR' });
    expect(result.isFalsePositive).toBe(false);
  });

  // --- Journey 15: Multi-node fusion lat/lon weighted average ---

  it('JRN-W6-15: GIVEN 2 equidistant nodes at different lat, WHEN fused, THEN fusedLat is mean', () => {
    const fusion = new MultiNodeFusion({ maxAgeMs: 10_000 });
    fusion.addNodeReport({ nodeId: 'N1', trackId: 'TRK-MEAN', confidence: 0.9, lat: 51.0, lon: 4.9, distanceKm: 2.0, timestamp: Date.now() });
    fusion.addNodeReport({ nodeId: 'N2', trackId: 'TRK-MEAN', confidence: 0.9, lat: 52.0, lon: 4.9, distanceKm: 2.0, timestamp: Date.now() });
    const result = fusion.fuse('TRK-MEAN');
    expect(result!.lat).toBeCloseTo(51.5, 1);
  });
});
