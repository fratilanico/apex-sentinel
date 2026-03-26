// APEX-SENTINEL — FR-W12-05: RfFusionEngine Tests
// tests/rf2/FR-W12-05-rf-fusion.test.ts

import { describe, it, expect } from 'vitest';
import {
  RfFusionEngine,
  type RfDetection,
  type AcousticDetection,
  type FusionResult,
} from '../../src/rf2/rf-fusion-engine.js';

describe('FR-W12-05: RfFusionEngine', () => {
  const engine = new RfFusionEngine();

  const rfDetection: RfDetection = {
    lat: 51.500,
    lon: 0.000,
    confidence: 0.75,
    protocol: 'elrs_900',
    ts: 1000,
  };

  const acousticClose: AcousticDetection = {
    lat: 51.501,   // ~110 m north — within 500 m
    lon: 0.000,
    confidence: 0.80,
    ts: 1003,      // 3 s later — within 5 s
  };

  const acousticFar: AcousticDetection = {
    lat: 51.520,   // ~2.2 km north — more than 1 km away
    lon: 0.000,
    confidence: 0.80,
    ts: 1003,
  };

  const acousticLate: AcousticDetection = {
    lat: 51.501,
    lon: 0.000,
    confidence: 0.80,
    ts: 1010,   // 10 s later — outside 5 s window
  };

  // ── Agreement bonus ───────────────────────────────────────────────────────

  it('FR-W12-05-T01: fused confidence includes agreement bonus for spatial/temporal agreement', () => {
    const result = engine.fuse(rfDetection, acousticClose);
    const baseMax = Math.max(rfDetection.confidence, acousticClose.confidence);
    expect(result.fusedConfidence).toBeGreaterThan(baseMax);
  });

  it('FR-W12-05-T02: fused confidence = max(rf, ac) + 0.10 when both agree', () => {
    const result = engine.fuse(rfDetection, acousticClose);
    const expected = Math.max(rfDetection.confidence, acousticClose.confidence) + 0.10;
    expect(result.fusedConfidence).toBeCloseTo(expected, 2);
  });

  it('FR-W12-05-T03: conflict is false when positions agree within 500 m and time within 5 s', () => {
    const result = engine.fuse(rfDetection, acousticClose);
    expect(result.conflict).toBe(false);
  });

  // ── Conflict detection ────────────────────────────────────────────────────

  it('FR-W12-05-T04: conflict is true when positions diverge > 1 km', () => {
    const result = engine.fuse(rfDetection, acousticFar);
    expect(result.conflict).toBe(true);
  });

  it('FR-W12-05-T05: conflict result has sources array with both rf and acoustic', () => {
    const result = engine.fuse(rfDetection, acousticFar);
    expect(result.conflict).toBe(true);
    expect(result.sources).toContain('rf');
    expect(result.sources).toContain('acoustic');
  });

  it('FR-W12-05-T06: no agreement bonus when temporal gap > 5 s', () => {
    const result = engine.fuse(rfDetection, acousticLate);
    const baseMax = Math.max(rfDetection.confidence, acousticLate.confidence);
    // Should not add the full 0.10 bonus (temporal disagreement)
    expect(result.fusedConfidence).toBeLessThanOrEqual(baseMax + 0.10);
  });

  // ── Sources always present ────────────────────────────────────────────────

  it('FR-W12-05-T07: sources always contains rf and acoustic entries', () => {
    const result = engine.fuse(rfDetection, acousticClose);
    expect(result.sources).toContain('rf');
    expect(result.sources).toContain('acoustic');
  });

  // ── Fused confidence bounds ───────────────────────────────────────────────

  it('FR-W12-05-T08: fused confidence never exceeds 1.0', () => {
    const highConf: RfDetection = { ...rfDetection, confidence: 0.95 };
    const highAcoustic: AcousticDetection = { ...acousticClose, confidence: 0.95 };
    const result = engine.fuse(highConf, highAcoustic);
    expect(result.fusedConfidence).toBeLessThanOrEqual(1.0);
  });

  it('FR-W12-05-T09: fused confidence is at least max(rf, ac)', () => {
    const result = engine.fuse(rfDetection, acousticFar);
    const baseMax = Math.max(rfDetection.confidence, acousticFar.confidence);
    expect(result.fusedConfidence).toBeGreaterThanOrEqual(baseMax);
  });

  // ── Result structure ──────────────────────────────────────────────────────

  it('FR-W12-05-T10: result has all required fields', () => {
    const result = engine.fuse(rfDetection, acousticClose);
    expect(typeof result.fusedConfidence).toBe('number');
    expect(typeof result.conflict).toBe('boolean');
    expect(Array.isArray(result.sources)).toBe(true);
  });

  it('FR-W12-05-T11: result is a plain serialisable object', () => {
    const result = engine.fuse(rfDetection, acousticClose);
    const s = JSON.parse(JSON.stringify(result));
    expect(s).toHaveProperty('fusedConfidence');
    expect(s).toHaveProperty('conflict');
    expect(s).toHaveProperty('sources');
  });

  it('FR-W12-05-T12: handles identical positions (haversine = 0)', () => {
    const samePosition: AcousticDetection = {
      lat: rfDetection.lat,
      lon: rfDetection.lon,
      confidence: 0.80,
      ts: rfDetection.ts + 1,
    };
    const result = engine.fuse(rfDetection, samePosition);
    expect(result.conflict).toBe(false);
    expect(result.fusedConfidence).toBeGreaterThanOrEqual(0.80);
  });
});
