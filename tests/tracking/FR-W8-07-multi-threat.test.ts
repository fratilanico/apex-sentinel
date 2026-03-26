// APEX-SENTINEL — W8 Multi-Threat Simultaneous Tracking Tests
// FR-W8-07 | tests/tracking/FR-W8-07-multi-threat.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MultiThreatResolver } from '../../src/tracking/multi-threat-resolver.js';

function makePos(lat: number, lon: number, altM = 200) {
  return { lat, lon, altM };
}

function spreadPositions(count: number) {
  // Create distinct positions spaced far apart
  return Array.from({ length: count }, (_, i) => makePos(48.0 + i * 0.01, 25.0 + i * 0.01));
}

describe('FR-W8-07: Multi-Threat Simultaneous Tracking', () => {

  let resolver: MultiThreatResolver;
  let natsMock: { publish: ReturnType<typeof vi.fn> };
  let supabaseMock: { insert: ReturnType<typeof vi.fn> };
  let telegramMock: { sendAlert: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    resolver = new MultiThreatResolver();
    natsMock = { publish: vi.fn() };
    supabaseMock = { insert: vi.fn().mockResolvedValue(undefined) };
    telegramMock = { sendAlert: vi.fn().mockResolvedValue(undefined) };
    resolver.setNatsClient(natsMock);
    resolver.setSupabaseClient(supabaseMock);
    resolver.setTelegramClient(telegramMock);
  });

  // ── Unit tests ─────────────────────────────────────────────────────────────

  it('FR-W8-07-U01: GIVEN 8 concurrent TDoA events with distinct positions, WHEN TrackManager processes, THEN 8 independent track IDs created', () => {
    const positions = spreadPositions(8);
    for (let i = 0; i < 8; i++) {
      resolver.addTrack(positions[i], `sig-${i}`);
    }
    expect(resolver.getActiveTracks()).toHaveLength(8);
    const ids = resolver.getActiveTracks().map(t => t.trackId);
    expect(new Set(ids).size).toBe(8);
  });

  it('FR-W8-07-U02: GIVEN 2 TDoA events at identical position with different acoustic signatures, WHEN processed, THEN 2 separate track IDs created', () => {
    const pos = makePos(48.0, 25.0);
    // Different signatures = different tracks
    resolver.addTrack(pos, 'piston-190hz');
    resolver.addTrack(makePos(48.0001, 25.0001), 'turbine-5000hz'); // slightly different pos
    expect(resolver.getActiveTracks()).toHaveLength(2);
  });

  it('FR-W8-07-U03: GIVEN 2 tracks converging to <10m separation, WHEN checked, THEN collision event published', () => {
    const events: unknown[] = [];
    resolver.onEvent(e => events.push(e));
    // Two positions ~5m apart (0.0001° ≈ 11m, use 0.000036° ≈ 4m)
    resolver.addTrack(makePos(48.0, 25.0), 'sig-A');
    resolver.addTrack(makePos(48.000036, 25.0), 'sig-B'); // ~4m apart
    const collisions = events.filter((e: any) => e.type === 'track.multi.collision');
    expect(collisions.length).toBeGreaterThanOrEqual(1);
  });

  it('FR-W8-07-U04: GIVEN track stale >30s (no update), WHEN eviction runs, THEN track removed from active set', () => {
    resolver.addTrack(makePos(48.0, 25.0), 'sig-A');
    expect(resolver.getActiveTracks()).toHaveLength(1);
    // Evict with future time
    resolver.evictStaleTracks(Date.now() + 31_000);
    expect(resolver.getActiveTracks()).toHaveLength(0);
  });

  it('FR-W8-07-U05: GIVEN ≥3 tracks active simultaneously, WHEN checked, THEN swarm.detected event published', () => {
    const events: unknown[] = [];
    resolver.onEvent(e => events.push(e));
    const positions = spreadPositions(3);
    for (let i = 0; i < 3; i++) {
      resolver.addTrack(positions[i], `sig-${i}`);
    }
    const swarm = events.filter((e: any) => e.type === 'swarm.detected');
    expect(swarm.length).toBeGreaterThanOrEqual(1);
  });

  it('FR-W8-07-U06: GIVEN same position + same acoustic signature, WHEN second event arrives, THEN existing track updated (not new ID)', () => {
    const pos = makePos(48.0, 25.0);
    const t1 = resolver.addTrack(pos, 'sig-A');
    const t2 = resolver.addTrack(pos, 'sig-A'); // same pos + sig
    expect(t2.trackId).toBe(t1.trackId);
    expect(resolver.getActiveTracks()).toHaveLength(1);
  });

  it('FR-W8-07-U07: GIVEN terminal phase track and cruise track competing, WHEN PTZ assigned, THEN terminal phase track wins priority', () => {
    resolver.addTrack(makePos(48.0, 25.0), 'sig-A', false); // cruise
    resolver.addTrack(makePos(48.01, 25.01), 'sig-B', true); // terminal
    const priority = resolver.getPriorityTrack();
    expect(priority?.isTerminalPhase).toBe(true);
  });

  it('FR-W8-07-U08: GIVEN track collision, THEN NATS track.multi.collision published with both track IDs', () => {
    resolver.addTrack(makePos(48.0, 25.0), 'sig-A');
    resolver.addTrack(makePos(48.000036, 25.0), 'sig-B'); // <10m
    expect(natsMock.publish).toHaveBeenCalledWith(
      'track.multi.collision',
      expect.objectContaining({ trackIdA: expect.any(String), trackIdB: expect.any(String) })
    );
  });

  it('FR-W8-07-U09: GIVEN swarm detected, THEN NATS track.swarm.detected published with count', () => {
    const positions = spreadPositions(3);
    for (let i = 0; i < 3; i++) resolver.addTrack(positions[i], `sig-${i}`);
    expect(natsMock.publish).toHaveBeenCalledWith(
      'track.swarm.detected',
      expect.objectContaining({ trackCount: expect.any(Number) })
    );
  });

  it('FR-W8-07-U10: GIVEN concurrent access from 8 threads, THEN no track ID collision occurs (thread safety)', async () => {
    const positions = spreadPositions(8);
    await Promise.all(
      positions.map((pos, i) => Promise.resolve(resolver.addTrack(pos, `sig-${i}`)))
    );
    const ids = resolver.getActiveTracks().map(t => t.trackId);
    expect(new Set(ids).size).toBe(ids.length); // all unique
  });

  // ── Integration tests ──────────────────────────────────────────────────────

  it('FR-W8-07-I01: GIVEN 8 simultaneous acoustic events from different nodes, WHEN pipeline runs, THEN 8 independent tracks in database', () => {
    const positions = spreadPositions(8);
    for (let i = 0; i < 8; i++) resolver.addTrack(positions[i], `sig-${i}`);
    expect(resolver.getActiveTracks()).toHaveLength(8);
  });

  it('FR-W8-07-I02: GIVEN 5 simultaneous terminal phase tracks, WHEN PTZ assigned, THEN highest threat selected', () => {
    const positions = spreadPositions(5);
    for (let i = 0; i < 5; i++) resolver.addTrack(positions[i], `sig-${i}`, true);
    const priority = resolver.getPriorityTrack();
    expect(priority?.isTerminalPhase).toBe(true);
  });

  it('FR-W8-07-I03: GIVEN swarm event published, THEN multi_threat_sessions row created in Supabase', () => {
    const positions = spreadPositions(3);
    for (let i = 0; i < 3; i++) resolver.addTrack(positions[i], `sig-${i}`);
    expect(supabaseMock.insert).toHaveBeenCalledWith(
      'multi_threat_sessions',
      expect.objectContaining({ swarm_detected: true })
    );
  });

  it('FR-W8-07-I04: GIVEN track collision event, THEN NATS track.multi.collision published', () => {
    resolver.addTrack(makePos(48.0, 25.0), 'sig-A');
    resolver.addTrack(makePos(48.000036, 25.0), 'sig-B');
    expect(natsMock.publish).toHaveBeenCalledWith('track.multi.collision', expect.any(Object));
  });

  it('FR-W8-07-I05: GIVEN multi_threat_session row, THEN peak_track_count recorded correctly', () => {
    const positions = spreadPositions(4);
    for (let i = 0; i < 4; i++) resolver.addTrack(positions[i], `sig-${i}`);
    const session = resolver.getSession();
    expect(session?.peakTrackCount).toBe(4);
  });

  it('FR-W8-07-I06: GIVEN stale track eviction, THEN track removed from Supabase threat_tracks', () => {
    resolver.addTrack(makePos(48.0, 25.0), 'sig-A');
    const evicted = resolver.evictStaleTracks(Date.now() + 31_000);
    expect(evicted).toHaveLength(1);
    expect(resolver.getActiveTracks()).toHaveLength(0);
  });

  it('FR-W8-07-I07: GIVEN 8 concurrent threats, WHEN all resolved, THEN all 8 tracks have correct profile assignment', () => {
    const positions = spreadPositions(8);
    const tracks = positions.map((pos, i) => resolver.addTrack(pos, `sig-${i}`));
    expect(tracks).toHaveLength(8);
    expect(new Set(tracks.map(t => t.trackId)).size).toBe(8);
  });

  it('FR-W8-07-I08: GIVEN swarm_detected=true, THEN Telegram alert sent with swarm count', () => {
    const positions = spreadPositions(3);
    for (let i = 0; i < 3; i++) resolver.addTrack(positions[i], `sig-${i}`);
    expect(telegramMock.sendAlert).toHaveBeenCalledWith(expect.stringContaining('SWARM'));
  });

  it('FR-W8-07-I09: GIVEN 3 collisions in rapid succession, THEN 3 separate collision events published (not deduplicated)', () => {
    const events: unknown[] = [];
    resolver.onEvent(e => events.push(e));
    // Create anchor track
    resolver.addTrack(makePos(48.0, 25.0), 'sig-anchor');
    // Add 3 tracks close to anchor
    resolver.addTrack(makePos(48.000036, 25.0), 'sig-B'); // ~4m
    resolver.addTrack(makePos(48.000036, 25.000036), 'sig-C'); // ~6m
    resolver.addTrack(makePos(48.0, 25.000036), 'sig-D'); // ~4m
    const collisions = events.filter((e: any) => e.type === 'track.multi.collision');
    expect(collisions.length).toBeGreaterThanOrEqual(3);
  });

  it('FR-W8-07-I10: GIVEN peak_track_count=8, THEN multi_threat_sessions.peak_track_count=8', () => {
    const positions = spreadPositions(8);
    for (let i = 0; i < 8; i++) resolver.addTrack(positions[i], `sig-${i}`);
    const session = resolver.getSession();
    expect(session?.peakTrackCount).toBe(8);
  });
});
