// APEX-SENTINEL W16 Tests — FR-W16-02: EdgePerformanceProfiler
import { describe, it, expect, beforeEach } from 'vitest';
import { EdgePerformanceProfiler } from '../../src/system/edge-performance-profiler.js';

describe('FR-W16-02: EdgePerformanceProfiler', () => {
  let profiler: EdgePerformanceProfiler;

  beforeEach(() => {
    profiler = new EdgePerformanceProfiler();
  });

  it('FR-W16-02-01: recordLatency() stores sample in window', () => {
    profiler.recordLatency('acoustic-inference', 100);
    const result = profiler.checkSla('acoustic-inference');
    expect(result.samples).toBe(1);
  });

  it('FR-W16-02-02: checkSla with no samples returns pass=true and samples=0', () => {
    const result = profiler.checkSla('acoustic-inference');
    expect(result.pass).toBe(true);
    expect(result.samples).toBe(0);
    expect(result.p99).toBe(0);
  });

  it('FR-W16-02-03: p99 calculation is correct', () => {
    // Insert 100 samples 1ms..100ms
    for (let i = 1; i <= 100; i++) {
      profiler.recordLatency('acoustic-inference', i);
    }
    const result = profiler.checkSla('acoustic-inference');
    expect(result.p99).toBe(99);
    expect(result.p95).toBe(95);
    expect(result.p50).toBe(50);
  });

  it('FR-W16-02-04: checkSla returns pass=false when p99 > default SLA (200ms)', () => {
    for (let i = 0; i < 100; i++) {
      profiler.recordLatency('acoustic-inference', 250); // all 250ms
    }
    const result = profiler.checkSla('acoustic-inference');
    expect(result.pass).toBe(false);
    expect(result.p99).toBe(250);
    expect(result.sla).toBe(200);
  });

  it('FR-W16-02-05: checkSla returns pass=true when p99 <= SLA', () => {
    for (let i = 0; i < 100; i++) {
      profiler.recordLatency('acoustic-inference', 150);
    }
    const result = profiler.checkSla('acoustic-inference');
    expect(result.pass).toBe(true);
  });

  it('FR-W16-02-06: rolling window evicts oldest sample after 1000 samples', () => {
    // First fill with 1000 slow samples (500ms)
    for (let i = 0; i < 1000; i++) {
      profiler.recordLatency('enrichment', 500);
    }
    expect(profiler.checkSla('enrichment').samples).toBe(1000);
    // Now add 1000 fast samples — they should completely replace the slow ones
    for (let i = 0; i < 1000; i++) {
      profiler.recordLatency('enrichment', 10);
    }
    expect(profiler.checkSla('enrichment').samples).toBe(1000);
    // After replacing all 1000 slow samples with fast ones, p99 should now be 10ms
    const result = profiler.checkSla('enrichment');
    expect(result.p99).toBe(10);
  });

  it('FR-W16-02-07: multiple components tracked independently', () => {
    profiler.recordLatency('acoustic-inference', 100);
    profiler.recordLatency('enrichment', 300);

    const acousticResult = profiler.checkSla('acoustic-inference');
    const enrichmentResult = profiler.checkSla('enrichment');

    expect(acousticResult.p99).toBe(100);
    expect(enrichmentResult.p99).toBe(300);
    expect(acousticResult.pass).toBe(true);
    expect(enrichmentResult.pass).toBe(false); // 300 > 200ms SLA
  });

  it('FR-W16-02-08: getReport() returns all registered components', () => {
    profiler.recordLatency('acoustic-inference', 100);
    profiler.recordLatency('enrichment', 150);
    profiler.recordLatency('feed-poll', 2000);

    const report = profiler.getReport();
    expect(Object.keys(report)).toContain('acoustic-inference');
    expect(Object.keys(report)).toContain('enrichment');
    expect(Object.keys(report)).toContain('feed-poll');
  });

  it('FR-W16-02-09: feed-poll SLA is 5000ms', () => {
    profiler.recordLatency('feed-poll', 4999);
    expect(profiler.checkSla('feed-poll').pass).toBe(true);
    profiler.clearComponent('feed-poll');
    profiler.recordLatency('feed-poll', 5001);
    expect(profiler.checkSla('feed-poll').pass).toBe(false);
    expect(profiler.checkSla('feed-poll').sla).toBe(5000);
  });

  it('FR-W16-02-10: registerSla() overrides default SLA', () => {
    profiler.registerSla('custom-component', 50);
    profiler.recordLatency('custom-component', 60);
    const result = profiler.checkSla('custom-component');
    expect(result.sla).toBe(50);
    expect(result.pass).toBe(false);
  });

  it('FR-W16-02-11: single sample percentiles all return same value', () => {
    profiler.recordLatency('acoustic-inference', 123);
    const result = profiler.checkSla('acoustic-inference');
    expect(result.p50).toBe(123);
    expect(result.p95).toBe(123);
    expect(result.p99).toBe(123);
  });

  it('FR-W16-02-12: clearComponent() removes samples', () => {
    profiler.recordLatency('acoustic-inference', 100);
    profiler.clearComponent('acoustic-inference');
    expect(profiler.checkSla('acoustic-inference').samples).toBe(0);
  });
});
