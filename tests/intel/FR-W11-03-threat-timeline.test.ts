// APEX-SENTINEL — W11 ThreatTimelineBuilder Tests
// FR-W11-03 | tests/intel/FR-W11-03-threat-timeline.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { ThreatTimelineBuilder } from '../../src/intel/threat-timeline-builder.js';
import type { TimelineEntry } from '../../src/intel/threat-timeline-builder.js';

describe('FR-W11-03: ThreatTimelineBuilder', () => {
  let builder: ThreatTimelineBuilder;
  const now = Date.now();

  beforeEach(() => {
    builder = new ThreatTimelineBuilder();
  });

  it('03-01: addEntry stores entry', () => {
    const entry: TimelineEntry = {
      ts: now,
      eventType: 'acoustic_detection',
      severity: 50,
      summary: 'Acoustic detection at sector A',
    };
    builder.addEntry(entry);
    const timeline = builder.getRecentTimeline(60 * 60 * 1000);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toEqual(entry);
  });

  it('03-02: getRecentTimeline only returns entries within window', () => {
    const old: TimelineEntry = { ts: now - 10 * 60 * 1000, eventType: 'acoustic_detection', severity: 30, summary: 'old' };
    const recent: TimelineEntry = { ts: now - 1 * 60 * 1000, eventType: 'acoustic_detection', severity: 50, summary: 'recent' };
    builder.addEntry(old);
    builder.addEntry(recent);
    // Window = 5 minutes
    const result = builder.getRecentTimeline(5 * 60 * 1000);
    expect(result).toHaveLength(1);
    expect(result[0].summary).toBe('recent');
  });

  it('03-03: results sorted ascending by ts', () => {
    const e1: TimelineEntry = { ts: now - 3000, eventType: 'awning_escalation', severity: 60, summary: 'e1' };
    const e2: TimelineEntry = { ts: now - 1000, eventType: 'awning_de-escalation', severity: 30, summary: 'e2' };
    const e3: TimelineEntry = { ts: now - 2000, eventType: 'osint_event', severity: 45, summary: 'e3' };
    builder.addEntry(e2);
    builder.addEntry(e1);
    builder.addEntry(e3);
    const result = builder.getRecentTimeline(60 * 1000);
    expect(result[0].ts).toBeLessThan(result[1].ts);
    expect(result[1].ts).toBeLessThan(result[2].ts);
  });

  it('03-04: getEscalationVelocity returns positive when severity increasing', () => {
    builder.addEntry({ ts: now - 2 * 60 * 1000, eventType: 'acoustic_detection', severity: 20, summary: '' });
    builder.addEntry({ ts: now - 1 * 60 * 1000, eventType: 'awning_escalation', severity: 50, summary: '' });
    builder.addEntry({ ts: now, eventType: 'awning_escalation', severity: 80, summary: '' });
    const velocity = builder.getEscalationVelocity();
    expect(velocity).toBeGreaterThan(0);
  });

  it('03-05: getEscalationVelocity returns negative when severity decreasing', () => {
    builder.addEntry({ ts: now - 2 * 60 * 1000, eventType: 'awning_escalation', severity: 80, summary: '' });
    builder.addEntry({ ts: now - 1 * 60 * 1000, eventType: 'awning_de-escalation', severity: 50, summary: '' });
    builder.addEntry({ ts: now, eventType: 'awning_de-escalation', severity: 20, summary: '' });
    const velocity = builder.getEscalationVelocity();
    expect(velocity).toBeLessThan(0);
  });

  it('03-06: empty timeline → getRecentTimeline returns empty array', () => {
    expect(builder.getRecentTimeline(60 * 1000)).toHaveLength(0);
  });

  it('03-07: empty timeline → getEscalationVelocity returns 0', () => {
    expect(builder.getEscalationVelocity()).toBe(0);
  });

  it('03-08: all 5 event types are accepted', () => {
    const types: TimelineEntry['eventType'][] = [
      'acoustic_detection', 'awning_escalation', 'awning_de-escalation', 'osint_event', 'adsb_anomaly',
    ];
    for (const eventType of types) {
      builder.addEntry({ ts: now, eventType, severity: 50, summary: eventType });
    }
    const result = builder.getRecentTimeline(60 * 1000);
    expect(result).toHaveLength(5);
  });

  it('03-09: getRecentTimeline with window 0 returns empty', () => {
    builder.addEntry({ ts: now, eventType: 'acoustic_detection', severity: 50, summary: 'test' });
    // Window 0 means nothing is within 0ms
    const result = builder.getRecentTimeline(0);
    expect(result).toHaveLength(0);
  });

  it('03-10: multiple entries in window all returned', () => {
    for (let i = 0; i < 5; i++) {
      builder.addEntry({ ts: now - i * 10000, eventType: 'acoustic_detection', severity: 40 + i, summary: `entry ${i}` });
    }
    const result = builder.getRecentTimeline(60 * 1000);
    expect(result).toHaveLength(5);
  });

  it('03-11: escalation velocity computed per minute', () => {
    // +60 severity over 2 minutes = +30/min
    builder.addEntry({ ts: now - 2 * 60 * 1000, eventType: 'acoustic_detection', severity: 20, summary: '' });
    builder.addEntry({ ts: now, eventType: 'awning_escalation', severity: 80, summary: '' });
    const velocity = builder.getEscalationVelocity();
    expect(velocity).toBeCloseTo(30, 0);
  });

  it('03-12: entries beyond window are not counted in velocity', () => {
    // Old event (2h ago) should not skew velocity
    builder.addEntry({ ts: now - 2 * 60 * 60 * 1000, eventType: 'awning_escalation', severity: 90, summary: '' });
    builder.addEntry({ ts: now - 1 * 60 * 1000, eventType: 'awning_de-escalation', severity: 30, summary: '' });
    builder.addEntry({ ts: now, eventType: 'awning_de-escalation', severity: 20, summary: '' });
    // Velocity should use recent window only
    const velocity = builder.getEscalationVelocity();
    expect(velocity).toBeLessThan(0);
  });
});
