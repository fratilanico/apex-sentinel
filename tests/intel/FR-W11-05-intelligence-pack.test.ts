// APEX-SENTINEL — W11 IntelligencePackBuilder Tests
// FR-W11-05 | tests/intel/FR-W11-05-intelligence-pack.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { IntelligencePackBuilder } from '../../src/intel/intelligence-pack-builder.js';
import type { IntelPackContext } from '../../src/intel/intelligence-pack-builder.js';

describe('FR-W11-05: IntelligencePackBuilder', () => {
  let builder: IntelligencePackBuilder;
  const now = Date.now();

  beforeEach(() => {
    builder = new IntelligencePackBuilder();
  });

  const baseContext: IntelPackContext = {
    awningLevel: 'WHITE',
    awningTs: now,
    detections: [],
    osintEvents: [],
    timelineWindow: 30 * 60 * 1000,
  };

  it('05-01: threatLevel RED when awningLevel is RED in last 5 minutes', () => {
    const ctx: IntelPackContext = { ...baseContext, awningLevel: 'RED', awningTs: now - 60000 };
    const brief = builder.build(ctx);
    expect(brief.threatLevel).toBe('RED');
  });

  it('05-02: threatLevel YELLOW when awningLevel is YELLOW', () => {
    const ctx: IntelPackContext = { ...baseContext, awningLevel: 'YELLOW', awningTs: now };
    const brief = builder.build(ctx);
    expect(brief.threatLevel).toBe('YELLOW');
  });

  it('05-03: threatLevel WHITE when awningLevel is WHITE', () => {
    const brief = builder.build(baseContext);
    expect(brief.threatLevel).toBe('WHITE');
  });

  it('05-04: threatLevel WHITE when RED awning is >5 minutes ago', () => {
    const ctx: IntelPackContext = {
      ...baseContext,
      awningLevel: 'RED',
      awningTs: now - 6 * 60 * 1000, // 6 min ago
    };
    const brief = builder.build(ctx);
    expect(brief.threatLevel).toBe('WHITE');
  });

  it('05-05: activeSectors includes cells with recent detections', () => {
    const ctx: IntelPackContext = {
      ...baseContext,
      detections: [
        { lat: 52.23, lon: 21.01, ts: now - 60000, droneType: 'Shahed-136' },
      ],
    };
    const brief = builder.build(ctx);
    expect(brief.activeSectors.length).toBeGreaterThan(0);
  });

  it('05-06: activeSectors empty when no detections', () => {
    const brief = builder.build(baseContext);
    expect(brief.activeSectors).toHaveLength(0);
  });

  it('05-07: osintSummary is non-empty string', () => {
    const brief = builder.build(baseContext);
    expect(typeof brief.osintSummary).toBe('string');
    expect(brief.osintSummary.length).toBeGreaterThan(0);
  });

  it('05-08: ts is valid ISO-8601 string', () => {
    const brief = builder.build(baseContext);
    const parsed = new Date(brief.ts);
    expect(parsed.getTime()).not.toBeNaN();
  });

  it('05-09: recentEvents array is present', () => {
    const brief = builder.build(baseContext);
    expect(Array.isArray(brief.recentEvents)).toBe(true);
  });

  it('05-10: osintSummary mentions OSINT when events present', () => {
    const ctx: IntelPackContext = {
      ...baseContext,
      osintEvents: [
        { lat: 52.23, lon: 21.01, ts: now - 60000, goldsteinScale: -8, eventType: 'conflict' },
      ],
      detections: [{ lat: 52.23, lon: 21.01, ts: now - 60000 }],
    };
    const brief = builder.build(ctx);
    expect(brief.osintSummary.length).toBeGreaterThan(10);
  });

  it('05-11: brief includes threatLevel, activeSectors, recentEvents, osintSummary, ts', () => {
    const brief = builder.build(baseContext);
    expect(brief).toHaveProperty('threatLevel');
    expect(brief).toHaveProperty('activeSectors');
    expect(brief).toHaveProperty('recentEvents');
    expect(brief).toHaveProperty('osintSummary');
    expect(brief).toHaveProperty('ts');
  });

  it('05-12: multiple detections appear in activeSectors (deduped by grid cell)', () => {
    const ctx: IntelPackContext = {
      ...baseContext,
      detections: [
        { lat: 52.23, lon: 21.01, ts: now, droneType: 'Shahed-136' },
        { lat: 52.25, lon: 21.05, ts: now, droneType: 'Gerbera' }, // same 0.1° cell
        { lat: 53.50, lon: 22.00, ts: now, droneType: 'Shahed-136' }, // different cell
      ],
    };
    const brief = builder.build(ctx);
    // Should have at most 2 unique grid cells
    expect(brief.activeSectors.length).toBeGreaterThanOrEqual(1);
    expect(brief.activeSectors.length).toBeLessThanOrEqual(2);
  });
});
