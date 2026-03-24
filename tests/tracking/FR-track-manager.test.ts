// APEX-SENTINEL — TDD RED Tests
// Track Manager — Track lifecycle, state machine, association
// Status: RED — implementation in src/tracking/track-manager.ts NOT_IMPLEMENTED

import { describe, it, expect, beforeEach } from 'vitest';
import { TrackManager } from '../../src/tracking/track-manager.js';
import { Position4D } from '../../src/tracking/types.js';

function makePosition(lat: number, lon: number, altM = 50, offsetMs = 0): Position4D {
  return {
    lat,
    lon,
    altM,
    timestampUs: BigInt(Date.now() + offsetMs) * 1000n,
  };
}

describe('FR-TRACK-00: Track Manager — Lifecycle and State Machine', () => {
  let manager: TrackManager;

  beforeEach(() => {
    manager = new TrackManager();
  });

  it('TRACK-01: initiate creates tentative track', () => {
    const track = manager.initiate({
      position: makePosition(48.2248, 24.3362),
      confidence: 0.75,
      gate: 3,
    });
    expect(track.state).toBe('tentative');
    expect(track.trackId).toBeDefined();
    expect(track.updateCount).toBe(1);
  });

  it('TRACK-02: track becomes confirmed after 3 updates', () => {
    const track = manager.initiate({
      position: makePosition(48.2248, 24.3362),
      confidence: 0.75,
      gate: 3,
    });
    manager.update(track.trackId, {
      position: makePosition(48.2240, 24.3370, 45, 500),
      confidence: 0.77,
      gate: 3,
    });
    const confirmed = manager.update(track.trackId, {
      position: makePosition(48.2232, 24.3378, 42, 1000),
      confidence: 0.79,
      gate: 3,
    });
    expect(confirmed.state).toBe('confirmed');
    expect(confirmed.updateCount).toBe(3);
  });

  it('TRACK-03: getConfirmedTracks only returns confirmed tracks', () => {
    const t1 = manager.initiate({ position: makePosition(48.2248, 24.3362), confidence: 0.8, gate: 3 });
    manager.update(t1.trackId, { position: makePosition(48.224, 24.337, 40, 500), confidence: 0.8, gate: 3 });
    manager.update(t1.trackId, { position: makePosition(48.223, 24.338, 38, 1000), confidence: 0.8, gate: 3 });
    // t1 now confirmed

    manager.initiate({ position: makePosition(48.230, 24.350), confidence: 0.7, gate: 3 });
    // t2 is tentative

    const confirmed = manager.getConfirmedTracks();
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].trackId).toBe(t1.trackId);
  });

  it('TRACK-04: update on unknown trackId throws', () => {
    expect(() =>
      manager.update('non-existent-track', {
        position: makePosition(48.2248, 24.3362),
        confidence: 0.8,
        gate: 3,
      }),
    ).toThrow('TRACK_NOT_FOUND');
  });

  it('TRACK-05: associateByProximity finds closest track within radius', () => {
    const track = manager.initiate({
      position: makePosition(48.2248, 24.3362),
      confidence: 0.8,
      gate: 3,
    });
    // Promote to confirmed
    manager.update(track.trackId, { position: makePosition(48.224, 24.337, 48, 500), confidence: 0.8, gate: 3 });
    manager.update(track.trackId, { position: makePosition(48.223, 24.338, 46, 1000), confidence: 0.8, gate: 3 });

    // Search position within 200m
    const nearby = makePosition(48.2245, 24.3365, 48);
    const found = manager.associateByProximity(nearby, 200);
    expect(found).not.toBeNull();
    expect(found!.trackId).toBe(track.trackId);
  });

  it('TRACK-06: associateByProximity returns null when no track within radius', () => {
    manager.initiate({
      position: makePosition(48.2248, 24.3362),
      confidence: 0.8,
      gate: 3,
    });
    // Far away position (>500m)
    const farPos = makePosition(48.2500, 24.3600, 50);
    const found = manager.associateByProximity(farPos, 100);
    expect(found).toBeNull();
  });

  it('TRACK-07: pruneCoasted removes old coasted tracks', () => {
    const track = manager.initiate({
      position: makePosition(48.2248, 24.3362),
      confidence: 0.8,
      gate: 3,
    });
    manager.update(track.trackId, { position: makePosition(48.224, 24.337), confidence: 0.8, gate: 3 });
    manager.update(track.trackId, { position: makePosition(48.223, 24.338), confidence: 0.8, gate: 3 });
    manager.markOffline(track.trackId); // manually coast

    // Prune with future timestamp (16s past last update)
    const futureUs = BigInt(Date.now() + 16_000) * 1000n;
    const pruned = manager.pruneCoasted(futureUs);
    expect(pruned).toBe(1);
    expect(manager.getTrack(track.trackId)).toBeNull();
  });

  it('TRACK-08: track confidence updated on each update', () => {
    const track = manager.initiate({
      position: makePosition(48.2248, 24.3362),
      confidence: 0.60,
      gate: 3,
    });
    const updated = manager.update(track.trackId, {
      position: makePosition(48.224, 24.337, 48, 500),
      confidence: 0.85,
      gate: 2,
    });
    // Confidence should be blended/updated — at minimum, not still 0.60
    expect(updated.confidence).toBeGreaterThan(0.60);
  });
});

declare module '../../src/tracking/track-manager.js' {
  interface TrackManager {
    markOffline(trackId: string): void;
  }
}
