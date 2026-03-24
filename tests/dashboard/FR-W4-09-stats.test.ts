// APEX-SENTINEL — TDD RED Tests
// W4 C2 Dashboard — Detection Stats
// Status: RED — implementation in src/dashboard/stats.ts NOT_IMPLEMENTED

import { describe, it, expect } from 'vitest';
import {
  calculateStats,
  detectionsPerHour,
  avgConfidence,
  topThreatClass,
} from '../../src/dashboard/stats.js';
import type { StatsSample, DetectionStats } from '../../src/dashboard/stats.js';
import type { ThreatClass } from '../../src/dashboard/stats.js';

function makeSample(overrides: Partial<StatsSample> = {}): StatsSample {
  return {
    timestamp: Date.now(),
    trackCount: 1,
    threatClass: 'fpv_drone',
    confidence: 0.85,
    ...overrides,
  };
}

function makeSamples(
  count: number,
  threatClass: ThreatClass = 'fpv_drone',
  confidence = 0.85,
  baseOffsetMs = 0,
): StatsSample[] {
  return Array.from({ length: count }, (_, i) =>
    makeSample({
      timestamp: Date.now() - baseOffsetMs + i * 100,
      threatClass,
      confidence,
    }),
  );
}

describe('FR-W4-09: Detection Stats — Calculations and Aggregations', () => {
  it('FR-W4-09-01: calculateStats returns DetectionStats shape', () => {
    const samples = makeSamples(5);
    const stats = calculateStats(samples, 3600000);
    expect(stats).toHaveProperty('totalTracks');
    expect(stats).toHaveProperty('confirmedTracks');
    expect(stats).toHaveProperty('detectionsPerHour');
    expect(stats).toHaveProperty('avgConfidence');
    expect(stats).toHaveProperty('activeNodeCount');
    expect(stats).toHaveProperty('coveragePercent');
    expect(stats).toHaveProperty('alertsSentToday');
    expect(stats).toHaveProperty('topThreatClass');
  });

  it('FR-W4-09-02: calculateStats with empty samples returns all zeros and null topThreatClass', () => {
    const stats = calculateStats([], 3600000);
    expect(stats.totalTracks).toBe(0);
    expect(stats.detectionsPerHour).toBe(0);
    expect(stats.avgConfidence).toBe(0);
    expect(stats.topThreatClass).toBeNull();
  });

  it('FR-W4-09-03: detectionsPerHour with 10 samples in 3600000ms returns 10', () => {
    const now = Date.now();
    const samples = Array.from({ length: 10 }, (_, i) =>
      makeSample({ timestamp: now - i * 360000 }),
    );
    const result = detectionsPerHour(samples, 3600000);
    expect(result).toBe(10);
  });

  it('FR-W4-09-04: detectionsPerHour with 0 samples returns 0', () => {
    expect(detectionsPerHour([], 3600000)).toBe(0);
  });

  it('FR-W4-09-05: detectionsPerHour extrapolates from shorter window — 5 samples in 1800000ms returns 10/hr', () => {
    const now = Date.now();
    // 5 samples spread over 30 minutes (1800000ms) → 10/hr extrapolated
    const samples = Array.from({ length: 5 }, (_, i) =>
      makeSample({ timestamp: now - i * 360000 }),
    );
    const result = detectionsPerHour(samples, 1800000);
    expect(result).toBe(10);
  });

  it('FR-W4-09-06: avgConfidence returns mean of all confidence values', () => {
    const samples = [
      makeSample({ confidence: 0.80 }),
      makeSample({ confidence: 0.90 }),
      makeSample({ confidence: 0.70 }),
    ];
    const result = avgConfidence(samples);
    // Mean of 0.80, 0.90, 0.70 = 0.80
    expect(result).toBeCloseTo(0.80, 5);
  });

  it('FR-W4-09-07: avgConfidence with empty array returns 0', () => {
    expect(avgConfidence([])).toBe(0);
  });

  it('FR-W4-09-08: topThreatClass returns most frequent threat class', () => {
    const samples = [
      makeSample({ threatClass: 'fpv_drone' }),
      makeSample({ threatClass: 'fpv_drone' }),
      makeSample({ threatClass: 'shahed' }),
      makeSample({ threatClass: 'helicopter' }),
    ];
    expect(topThreatClass(samples)).toBe('fpv_drone');
  });

  it('FR-W4-09-09: topThreatClass returns null for empty samples', () => {
    expect(topThreatClass([])).toBeNull();
  });

  it('FR-W4-09-10: topThreatClass breaks ties deterministically — returns first alphabetically or by count', () => {
    // Equal count: fpv_drone (1) vs shahed (1) — deterministic, not random
    const samples = [
      makeSample({ threatClass: 'fpv_drone' }),
      makeSample({ threatClass: 'shahed' }),
    ];
    const first = topThreatClass(samples);
    const second = topThreatClass(samples);
    // Must be deterministic — same input, same output every call
    expect(first).toBe(second);
    // Must be one of the valid threat classes present
    expect(['fpv_drone', 'shahed']).toContain(first);
  });
});
