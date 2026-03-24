// APEX-SENTINEL — TDD RED Tests
// FR-W5-10: MultiTrackEKFManager
// FR-W5-11: EKF Coast on Missing Measurement
// Status: RED — src/prediction/multi-track-manager.ts not yet implemented

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MultiTrackEKFManager } from '../../src/prediction/multi-track-manager.js';
import type { DetectionInput } from '../../src/prediction/types.js';

// ── Mock Supabase for bootstrap ───────────────────────────────────────────────

const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({
    data: [
      { track_id: 'TRK-BOOT-01', lat: 51.5, lon: -0.1, alt: 80 },
      { track_id: 'TRK-BOOT-02', lat: 48.2, lon: 24.3, alt: 120 },
    ],
    error: null,
  }),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDetection(trackId: string, seq: number = 0): DetectionInput {
  return {
    trackId,
    lat: 51.5 + seq * 1e-4,
    lon: -0.1,
    alt: 100 - seq * 0.5,
    timestamp: Date.now() + seq * 1000,
    confidence: 0.9,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FR-W5-10: MultiTrackEKFManager
// ─────────────────────────────────────────────────────────────────────────────

describe('FR-W5-10-00: MultiTrackEKFManager', () => {
  let manager: MultiTrackEKFManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new MultiTrackEKFManager({
      dropoutSeconds: 15,
      supabaseClient: mockSupabase as never,
    });
  });

  it('FR-W5-10-01: first detection for new trackId creates new EKFInstance', () => {
    const det = makeDetection('TRK-NEW-001');
    manager.processDetection(det);
    expect(manager.getActiveTracks()).toContain('TRK-NEW-001');
  });

  it('FR-W5-10-02: second detection for same trackId reuses same EKFInstance', () => {
    const det1 = makeDetection('TRK-SAME', 0);
    const det2 = makeDetection('TRK-SAME', 1);
    manager.processDetection(det1);
    manager.processDetection(det2);
    // Only one track entry — not two
    const active = manager.getActiveTracks();
    expect(active.filter((id) => id === 'TRK-SAME')).toHaveLength(1);
  });

  it('FR-W5-10-03: 2+ measurements for same track returns non-null horizons', () => {
    const det1 = makeDetection('TRK-H', 0);
    const det2 = makeDetection('TRK-H', 1);
    manager.processDetection(det1);
    const result = manager.processDetection(det2);
    expect(result.horizons.length).toBeGreaterThan(0);
  });

  it('FR-W5-10-04: dropStale removes tracks beyond dropout threshold', () => {
    vi.useFakeTimers();
    const det = makeDetection('TRK-STALE');
    manager.processDetection(det);
    expect(manager.getActiveTracks()).toContain('TRK-STALE');

    // Advance time beyond dropout (15s)
    vi.advanceTimersByTime(16_000);
    manager.dropStale();

    expect(manager.getActiveTracks()).not.toContain('TRK-STALE');
    vi.useRealTimers();
  });

  it('FR-W5-10-05: getActiveTracks excludes dropped tracks', () => {
    vi.useFakeTimers();
    manager.processDetection(makeDetection('TRK-KEEP'));
    manager.processDetection(makeDetection('TRK-DROP'));

    vi.advanceTimersByTime(16_000);
    // Add new detection to keep TRK-KEEP fresh
    manager.processDetection(makeDetection('TRK-KEEP', 1));
    manager.dropStale();

    const active = manager.getActiveTracks();
    expect(active).toContain('TRK-KEEP');
    expect(active).not.toContain('TRK-DROP');
    vi.useRealTimers();
  });

  it('FR-W5-10-06: state does not cross-contaminate between different trackIds', () => {
    const det1a = makeDetection('TRK-X', 0);
    const det1b = makeDetection('TRK-X', 1);
    const det2a = makeDetection('TRK-Y', 0);
    const det2b = makeDetection('TRK-Y', 1);

    manager.processDetection(det1a);
    manager.processDetection(det2a);
    const resultX = manager.processDetection(det1b);
    const resultY = manager.processDetection(det2b);

    // Each track's EKF state should reflect only its own position history
    expect(resultX.ekfState.lat).not.toBeCloseTo(resultY.ekfState.lat, 5);
  });

  it('FR-W5-10-07: bootstrapFromSupabase initializes EKF for confirmed tracks', async () => {
    await manager.bootstrapFromSupabase();
    const active = manager.getActiveTracks();
    expect(active).toContain('TRK-BOOT-01');
    expect(active).toContain('TRK-BOOT-02');
  });

  it('FR-W5-10-08: dropStale returns array of dropped trackId strings', () => {
    vi.useFakeTimers();
    manager.processDetection(makeDetection('TRK-DROP-A'));
    manager.processDetection(makeDetection('TRK-DROP-B'));
    vi.advanceTimersByTime(16_000);
    const dropped = manager.dropStale();
    expect(Array.isArray(dropped)).toBe(true);
    expect(dropped).toContain('TRK-DROP-A');
    expect(dropped).toContain('TRK-DROP-B');
    vi.useRealTimers();
  });

  it('FR-W5-10-09: fresh EKF created after dropout + re-detection', () => {
    vi.useFakeTimers();
    manager.processDetection(makeDetection('TRK-REBIRTH', 0));
    manager.processDetection(makeDetection('TRK-REBIRTH', 1));
    vi.advanceTimersByTime(16_000);
    manager.dropStale();

    // Re-detect after dropout — should create fresh EKF (single measurement → no horizons)
    const result = manager.processDetection(makeDetection('TRK-REBIRTH', 2));
    expect(result.horizons).toHaveLength(0); // only 1 measurement, no history
    vi.useRealTimers();
  });

  it('FR-W5-10-10: 1000-track load — processDetection < 5ms per track', () => {
    const N = 1000;
    const trackIds = Array.from({ length: N }, (_, i) => `TRK-LOAD-${i}`);

    // Prime each track with one detection
    trackIds.forEach((id) => manager.processDetection(makeDetection(id, 0)));

    const start = performance.now();
    // Second detection for each track (triggers EKF update + prediction)
    trackIds.forEach((id) => manager.processDetection(makeDetection(id, 1)));
    const elapsed = performance.now() - start;

    const msPerTrack = elapsed / N;
    expect(msPerTrack).toBeLessThan(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-W5-11: EKF Coast on Missing Measurement
// ─────────────────────────────────────────────────────────────────────────────

describe('FR-W5-11-00: EKF Coast (Dead-Reckoning)', () => {
  let manager: MultiTrackEKFManager;

  beforeEach(() => {
    manager = new MultiTrackEKFManager({
      dropoutSeconds: 15,
      supabaseClient: mockSupabase as never,
    });
    // Prime TRK-COAST with 2 measurements so it has state
    manager.processDetection(makeDetection('TRK-COAST', 0));
    manager.processDetection(makeDetection('TRK-COAST', 1));
  });

  it('FR-W5-11-01: coast advances position by dt * velocity', () => {
    const before = manager.getTrackState('TRK-COAST');
    manager.coastTrack('TRK-COAST', 1.0);
    const after = manager.getTrackState('TRK-COAST');
    // Position should have advanced by dt * vLat
    const expectedLat = before!.lat + before!.vLat * 1.0;
    expect(after!.lat).toBeCloseTo(expectedLat, 8);
  });

  it('FR-W5-11-02: coast grows covariance (uncertainty increases without measurement)', () => {
    const cov1 = manager.getTrackCovariance('TRK-COAST');
    const traceBefore = cov1!.reduce((s, row, i) => s + row[i], 0);
    manager.coastTrack('TRK-COAST', 1.0);
    const cov2 = manager.getTrackCovariance('TRK-COAST');
    const traceAfter = cov2!.reduce((s, row, i) => s + row[i], 0);
    expect(traceAfter).toBeGreaterThan(traceBefore);
  });

  it('FR-W5-11-03: coast does not incorporate any measurement (state = predict-only)', () => {
    const spy = vi.spyOn(manager as never, 'updateTrackWithMeasurement');
    manager.coastTrack('TRK-COAST', 1.0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('FR-W5-11-04: coast-then-update state differs from update-without-coast', () => {
    // Branch A: predict + update directly
    const managerA = new MultiTrackEKFManager({ dropoutSeconds: 15, supabaseClient: mockSupabase as never });
    managerA.processDetection(makeDetection('TRK-A', 0));
    managerA.processDetection(makeDetection('TRK-A', 1));

    // Branch B: coast 2s then update
    const managerB = new MultiTrackEKFManager({ dropoutSeconds: 15, supabaseClient: mockSupabase as never });
    managerB.processDetection(makeDetection('TRK-B', 0));
    managerB.processDetection(makeDetection('TRK-B', 1));
    managerB.coastTrack('TRK-B', 2.0);

    // Now both receive the same new measurement
    const newDet = makeDetection('TRK-A', 2);
    managerA.processDetection(newDet);
    managerB.processDetection({ ...newDet, trackId: 'TRK-B' });

    const stateA = managerA.getTrackState('TRK-A');
    const stateB = managerB.getTrackState('TRK-B');
    // They should differ because B coasted 2s before updating
    expect(stateA!.lat).not.toBeCloseTo(stateB!.lat, 8);
  });

  it('FR-W5-11-05: coastTrack on unknown trackId logs warn, does not crash', () => {
    expect(() => manager.coastTrack('TRK-UNKNOWN-9999', 1.0)).not.toThrow();
  });
});
