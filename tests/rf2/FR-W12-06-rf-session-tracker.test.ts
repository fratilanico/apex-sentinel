// APEX-SENTINEL — FR-W12-06: RfSessionTracker Tests
// tests/rf2/FR-W12-06-rf-session-tracker.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RfSessionTracker,
  type RfDetection,
  type RfSession,
} from '../../src/rf2/rf-session-tracker.js';

describe('FR-W12-06: RfSessionTracker', () => {
  let tracker: RfSessionTracker;

  beforeEach(() => {
    tracker = new RfSessionTracker();
  });

  const baseDetection: RfDetection = {
    protocol: 'elrs_900',
    lat: 51.500,
    lon: 0.000,
    confidence: 0.85,
    ts: 1000,
  };

  // ── Session ID format ─────────────────────────────────────────────────────

  it('FR-W12-06-T01: session ID matches format RF-YYYYMMDD-NNNN', () => {
    tracker.ingest(baseDetection);
    const sessions = tracker.getActiveSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].sessionId).toMatch(/^RF-\d{8}-\d{4}$/);
  });

  it('FR-W12-06-T02: sequential sessions have incrementing sequence numbers', () => {
    // First session
    tracker.ingest({ ...baseDetection, ts: 1000 });
    // Let it expire
    tracker.tick(70000); // 70 s later
    // Second session
    tracker.ingest({ ...baseDetection, ts: 70001 });
    const history = tracker.getSessionHistory(200000);
    expect(history.length).toBeGreaterThanOrEqual(2);
    // Extract sequence numbers
    const seqs = history.map(s => parseInt(s.sessionId.split('-')[2]!, 10));
    expect(seqs[1]!).toBeGreaterThan(seqs[0]!);
  });

  // ── Session lifecycle ─────────────────────────────────────────────────────

  it('FR-W12-06-T03: new detection creates an active session', () => {
    tracker.ingest(baseDetection);
    expect(tracker.getActiveSessions().length).toBe(1);
  });

  it('FR-W12-06-T04: multiple detections within 60 s stay in same session', () => {
    tracker.ingest({ ...baseDetection, ts: 1000 });
    tracker.ingest({ ...baseDetection, ts: 10000 });
    tracker.ingest({ ...baseDetection, ts: 30000 });
    expect(tracker.getActiveSessions().length).toBe(1);
  });

  it('FR-W12-06-T05: session closes after 60 s inactivity', () => {
    tracker.ingest({ ...baseDetection, ts: 1000 });
    tracker.tick(62000); // advance 61 s after last detection
    expect(tracker.getActiveSessions().length).toBe(0);
  });

  it('FR-W12-06-T06: closed session appears in getSessionHistory', () => {
    tracker.ingest({ ...baseDetection, ts: 1000 });
    tracker.tick(62000);
    const history = tracker.getSessionHistory(200000);
    expect(history.length).toBe(1);
  });

  // ── Position history ──────────────────────────────────────────────────────

  it('FR-W12-06-T07: session tracks position history', () => {
    tracker.ingest({ ...baseDetection, ts: 1000, lat: 51.500, lon: 0.000 });
    tracker.ingest({ ...baseDetection, ts: 5000, lat: 51.501, lon: 0.001 });
    const sessions = tracker.getActiveSessions();
    expect(sessions[0]!.positionHistory.length).toBeGreaterThanOrEqual(1);
  });

  // ── Pre-terminal flag ─────────────────────────────────────────────────────

  it('FR-W12-06-T08: preterminalFlag is false by default', () => {
    tracker.ingest(baseDetection);
    const sessions = tracker.getActiveSessions();
    expect(sessions[0]!.preterminalFlag).toBe(false);
  });

  it('FR-W12-06-T09: preterminalFlag set when session closes within 500 m of known target', () => {
    // Register known target at 51.500, 0.000
    tracker.registerKnownTarget({ lat: 51.500, lon: 0.000 });
    // Detection very close to target (< 500 m)
    tracker.ingest({ ...baseDetection, ts: 1000, lat: 51.500, lon: 0.000 });
    // Session expires
    tracker.tick(62000);
    const history = tracker.getSessionHistory(200000);
    expect(history[0]!.preterminalFlag).toBe(true);
  });

  it('FR-W12-06-T10: preterminalFlag NOT set when session closes > 500 m from all targets', () => {
    tracker.registerKnownTarget({ lat: 51.500, lon: 0.000 });
    // Detection far from target (~5 km away)
    tracker.ingest({ ...baseDetection, ts: 1000, lat: 51.545, lon: 0.000 });
    tracker.tick(62000);
    const history = tracker.getSessionHistory(200000);
    expect(history[0]!.preterminalFlag).toBe(false);
  });

  // ── getSessionHistory window ──────────────────────────────────────────────

  it('FR-W12-06-T11: getSessionHistory respects windowMs parameter', () => {
    tracker.ingest({ ...baseDetection, ts: 1000 });
    tracker.tick(62000);
    // Window of 10 ms — session happened 62000 ms ago, should be excluded
    const history = tracker.getSessionHistory(10);
    expect(history.length).toBe(0);
  });

  // ── Active sessions filter ────────────────────────────────────────────────

  it('FR-W12-06-T12: getActiveSessions returns only open sessions', () => {
    tracker.ingest({ ...baseDetection, ts: 1000 });
    tracker.tick(62000); // expire first session
    tracker.ingest({ ...baseDetection, ts: 63000 }); // new session
    const active = tracker.getActiveSessions();
    expect(active.length).toBe(1);
    expect(active[0]!.sessionId).not.toBe(tracker.getSessionHistory(200000)[0]!.sessionId);
  });

  it('FR-W12-06-T13: session duration is correctly calculated', () => {
    tracker.ingest({ ...baseDetection, ts: 1000 });
    tracker.ingest({ ...baseDetection, ts: 5000 });
    const sessions = tracker.getActiveSessions();
    expect(sessions[0]!.lastTs).toBe(5000);
    expect(sessions[0]!.startTs).toBe(1000);
  });
});
