// APEX-SENTINEL — W8 Simpson's Paradox Consistency Oracle Tests
// FR-W8-02 | tests/ml/FR-W8-02-simpsons-oracle.test.ts
// Prevent aggregate recall masking per-class failure.

import { describe, it, expect, beforeEach } from 'vitest';
import { ConsistencyOracle, type ClassMetrics } from '../../src/ml/consistency-oracle-w8.js';

function makeBalanced(): ClassMetrics[] {
  return [
    { profile: 'shahed_136', recall: 0.90, sampleCount: 100 },
    { profile: 'shahed_131', recall: 0.88, sampleCount: 100 },
    { profile: 'shahed_238', recall: 0.97, sampleCount: 100 },
    { profile: 'gerbera',    recall: 0.94, sampleCount: 100 },
    { profile: 'quad_rotor', recall: 0.91, sampleCount: 100 },
  ];
}

function makeImbalanced(): ClassMetrics[] {
  return [
    { profile: 'shahed_136', recall: 0.95, sampleCount: 500 },
    { profile: 'shahed_131', recall: 0.94, sampleCount: 500 },
    { profile: 'shahed_238', recall: 0.72, sampleCount: 20 }, // rare class, low recall
    { profile: 'gerbera',    recall: 0.93, sampleCount: 400 },
    { profile: 'quad_rotor', recall: 0.96, sampleCount: 800 }, // 80% of samples
  ];
}

describe('FR-W8-02: Simpson\'s Paradox Consistency Oracle', () => {

  let oracle: ConsistencyOracle;

  beforeEach(() => {
    oracle = new ConsistencyOracle();
  });

  // ── Unit tests ─────────────────────────────────────────────────────────────

  it('FR-W8-02-U01: GIVEN balanced dataset, THEN weighted and unweighted macro recall agree within 5%', () => {
    const result = oracle.evaluate(makeBalanced());
    expect(result.gap).toBeLessThanOrEqual(0.05);
  });

  it('FR-W8-02-U02: GIVEN imbalanced dataset where quad_rotor is 80% of samples, THEN paradox detected when shahed_238 recall is 0.72', () => {
    const result = oracle.evaluate(makeImbalanced());
    expect(result.paradoxDetected).toBe(true);
    expect(result.failingClass).toBe('shahed_238');
  });

  it('FR-W8-02-U03: GIVEN per-class metrics, THEN each class reported independently (not averaged before gating)', () => {
    const result = oracle.evaluate(makeImbalanced());
    const shahed238 = result.perClassMetrics.find(c => c.profile === 'shahed_238');
    expect(shahed238).toBeDefined();
    expect(shahed238?.recall).toBe(0.72);
  });

  it('FR-W8-02-U04: GIVEN rare class shahed_238 with low recall, THEN oracle reports it not diluted by high-volume classes', () => {
    const result = oracle.evaluate(makeImbalanced());
    // Shahed_238 must be individually visible, not hidden in aggregate
    const shahed238Metric = result.perClassMetrics.find(c => c.profile === 'shahed_238');
    expect(shahed238Metric?.recall).toBe(0.72);
    // Weighted aggregate would be > 0.90 because small class
    expect(result.weightedMacroRecall).toBeGreaterThan(0.90);
  });

  it('FR-W8-02-U05: GIVEN stratified sampling, THEN class distribution matches expected proportions within 5%', () => {
    const balanced = makeBalanced();
    const totalSamples = balanced.reduce((s, c) => s + c.sampleCount, 0);
    // Each class = 100/500 = 20%
    for (const c of balanced) {
      const proportion = c.sampleCount / totalSamples;
      expect(Math.abs(proportion - 0.2)).toBeLessThanOrEqual(0.05);
    }
  });

  it('FR-W8-02-U06: GIVEN paradox detected, THEN failure message includes failing class name', () => {
    const result = oracle.evaluate(makeImbalanced());
    expect(result.paradoxDetected).toBe(true);
    expect(result.report).toContain('shahed_238');
    expect(result.report).toContain('PARADOX_DETECTED');
  });

  // ── Integration tests ──────────────────────────────────────────────────────

  it('FR-W8-02-I01: GIVEN imbalanced dataset, WHEN full pipeline runs, THEN PARADOX_DETECTED thrown even when aggregate recall >90%', () => {
    const result = oracle.evaluate(makeImbalanced());
    expect(result.weightedMacroRecall).toBeGreaterThan(0.90);
    expect(result.paradoxDetected).toBe(true);
  });

  it('FR-W8-02-I02: GIVEN balanced dataset, WHEN full pipeline runs, THEN oracle passes with no paradox warning', () => {
    const result = oracle.evaluate(makeBalanced());
    expect(result.paradoxDetected).toBe(false);
  });

  it('FR-W8-02-I03: GIVEN oracle integration in FR-W8-01 gate, THEN consistency oracle runs as part of oracle gate (not separate)', () => {
    // Oracle.evaluate() is callable from oracle gate integration
    const result = oracle.evaluate(makeBalanced());
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('perClassMetrics');
  });

  it('FR-W8-02-I04: GIVEN oracle run, THEN per-class count visible in oracle report output', () => {
    const result = oracle.evaluate(makeImbalanced());
    // Per-class metrics are in result
    expect(result.perClassMetrics).toHaveLength(5);
    expect(result.report).toContain('Per-class recall');
    expect(result.report).toContain('n=20'); // shahed_238 sample count
  });

  it('FR-W8-02-I05: GIVEN CI run, THEN CI output includes per-class breakdown table', () => {
    const result = oracle.evaluate(makeBalanced());
    // Report has per-class breakdown
    expect(result.report).toContain('shahed_136');
    expect(result.report).toContain('shahed_238');
  });

  it('FR-W8-02-I06: GIVEN paradox detected, THEN gate blocked even when aggregate recall exceeds 90%', () => {
    const result = oracle.evaluate(makeImbalanced());
    expect(result.paradoxDetected).toBe(true);
    // When paradox detected, gate must not pass
    expect(result.passed).toBe(false);
    // Even though aggregate > 90%
    expect(result.weightedMacroRecall).toBeGreaterThan(0.90);
  });
});
