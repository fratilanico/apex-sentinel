// APEX-SENTINEL — TDD RED Tests
// W4 C2 Dashboard — Track Store
// Status: RED — implementation in src/dashboard/track-store.ts NOT_IMPLEMENTED

import { describe, it, expect, beforeEach } from 'vitest';
import { TrackStore } from '../../src/dashboard/track-store.js';
import type { DashboardTrack } from '../../src/dashboard/track-store.js';

function makeTrack(overrides: Partial<DashboardTrack> = {}): DashboardTrack {
  return {
    trackId: 'TRK-001',
    threatClass: 'fpv_drone',
    lat: 48.2248,
    lon: 24.3362,
    altM: 120,
    confidence: 0.85,
    speedMs: 15,
    headingDeg: 270,
    state: 'confirmed',
    nodeCount: 3,
    errorM: 8.5,
    firstSeenAt: Date.now() - 5000,
    lastUpdatedAt: Date.now(),
    ...overrides,
  };
}

describe('FR-W4-02: Track Store — CRUD and Query Logic', () => {
  let store: TrackStore;

  beforeEach(() => {
    store = new TrackStore();
  });

  it('FR-W4-02-01: upsertTrack adds new track; count() becomes 1', () => {
    store.upsertTrack(makeTrack({ trackId: 'TRK-001' }));
    expect(store.count()).toBe(1);
  });

  it('FR-W4-02-02: upsertTrack with same trackId updates existing; count stays 1', () => {
    store.upsertTrack(makeTrack({ trackId: 'TRK-001', confidence: 0.80 }));
    store.upsertTrack(makeTrack({ trackId: 'TRK-001', confidence: 0.95 }));
    expect(store.count()).toBe(1);
    expect(store.getTrack('TRK-001')?.confidence).toBe(0.95);
  });

  it('FR-W4-02-03: removeTrack removes by trackId; count decrements', () => {
    store.upsertTrack(makeTrack({ trackId: 'TRK-001' }));
    store.upsertTrack(makeTrack({ trackId: 'TRK-002' }));
    store.removeTrack('TRK-001');
    expect(store.count()).toBe(1);
    expect(store.getTrack('TRK-001')).toBeNull();
  });

  it('FR-W4-02-04: getTrack returns null for nonexistent trackId', () => {
    expect(store.getTrack('TRK-NONEXISTENT')).toBeNull();
  });

  it('FR-W4-02-05: getAllTracks returns all tracks', () => {
    store.upsertTrack(makeTrack({ trackId: 'TRK-001' }));
    store.upsertTrack(makeTrack({ trackId: 'TRK-002' }));
    store.upsertTrack(makeTrack({ trackId: 'TRK-003' }));
    const all = store.getAllTracks();
    expect(all).toHaveLength(3);
    const ids = all.map((t) => t.trackId);
    expect(ids).toContain('TRK-001');
    expect(ids).toContain('TRK-002');
    expect(ids).toContain('TRK-003');
  });

  it('FR-W4-02-06: getConfirmedTracks returns only state="confirmed" tracks', () => {
    store.upsertTrack(makeTrack({ trackId: 'TRK-001', state: 'confirmed' }));
    store.upsertTrack(makeTrack({ trackId: 'TRK-002', state: 'tentative' }));
    store.upsertTrack(makeTrack({ trackId: 'TRK-003', state: 'coasted' }));
    store.upsertTrack(makeTrack({ trackId: 'TRK-004', state: 'confirmed' }));
    const confirmed = store.getConfirmedTracks();
    expect(confirmed).toHaveLength(2);
    confirmed.forEach((t) => expect(t.state).toBe('confirmed'));
  });

  it('FR-W4-02-07: filterByThreatClass("fpv_drone") returns only fpv_drone tracks', () => {
    store.upsertTrack(makeTrack({ trackId: 'TRK-001', threatClass: 'fpv_drone' }));
    store.upsertTrack(makeTrack({ trackId: 'TRK-002', threatClass: 'shahed' }));
    store.upsertTrack(makeTrack({ trackId: 'TRK-003', threatClass: 'fpv_drone' }));
    const result = store.filterByThreatClass('fpv_drone');
    expect(result).toHaveLength(2);
    result.forEach((t) => expect(t.threatClass).toBe('fpv_drone'));
  });

  it('FR-W4-02-08: sortByConfidence(true) returns highest confidence first', () => {
    store.upsertTrack(makeTrack({ trackId: 'TRK-001', confidence: 0.50 }));
    store.upsertTrack(makeTrack({ trackId: 'TRK-002', confidence: 0.90 }));
    store.upsertTrack(makeTrack({ trackId: 'TRK-003', confidence: 0.70 }));
    const sorted = store.sortByConfidence(true);
    expect(sorted[0].confidence).toBe(0.90);
    expect(sorted[1].confidence).toBe(0.70);
    expect(sorted[2].confidence).toBe(0.50);
  });

  it('FR-W4-02-09: sortByConfidence(false) returns lowest confidence first', () => {
    store.upsertTrack(makeTrack({ trackId: 'TRK-001', confidence: 0.50 }));
    store.upsertTrack(makeTrack({ trackId: 'TRK-002', confidence: 0.90 }));
    store.upsertTrack(makeTrack({ trackId: 'TRK-003', confidence: 0.70 }));
    const sorted = store.sortByConfidence(false);
    expect(sorted[0].confidence).toBe(0.50);
    expect(sorted[1].confidence).toBe(0.70);
    expect(sorted[2].confidence).toBe(0.90);
  });

  it('FR-W4-02-10: getStaleTrackIds returns trackIds where lastUpdatedAt < now - maxAgeMs', () => {
    const now = Date.now();
    store.upsertTrack(makeTrack({ trackId: 'TRK-FRESH', lastUpdatedAt: now - 1000 }));
    store.upsertTrack(makeTrack({ trackId: 'TRK-STALE-A', lastUpdatedAt: now - 10000 }));
    store.upsertTrack(makeTrack({ trackId: 'TRK-STALE-B', lastUpdatedAt: now - 15000 }));
    const stale = store.getStaleTrackIds(5000);
    expect(stale).toContain('TRK-STALE-A');
    expect(stale).toContain('TRK-STALE-B');
    expect(stale).not.toContain('TRK-FRESH');
  });

  it('FR-W4-02-11: clear() resets count to 0', () => {
    store.upsertTrack(makeTrack({ trackId: 'TRK-001' }));
    store.upsertTrack(makeTrack({ trackId: 'TRK-002' }));
    store.clear();
    expect(store.count()).toBe(0);
    expect(store.getAllTracks()).toHaveLength(0);
  });

  it('FR-W4-02-12: upsertTrack updates lastUpdatedAt on second call', async () => {
    const firstTs = Date.now() - 2000;
    store.upsertTrack(makeTrack({ trackId: 'TRK-001', lastUpdatedAt: firstTs }));
    const secondTs = Date.now();
    store.upsertTrack(makeTrack({ trackId: 'TRK-001', lastUpdatedAt: secondTs }));
    const track = store.getTrack('TRK-001');
    expect(track?.lastUpdatedAt).toBe(secondTs);
    expect(track?.lastUpdatedAt).toBeGreaterThan(firstTs);
  });
});
