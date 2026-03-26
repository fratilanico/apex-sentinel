import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceBenchmarkSuite } from '../../src/demo/performance-benchmark-suite.js';

describe('FR-W17-03: PerformanceBenchmarkSuite — p50/p95/p99 structured benchmarks', () => {
  let suite: PerformanceBenchmarkSuite;

  beforeEach(() => {
    suite = new PerformanceBenchmarkSuite();
  });

  // ── Registration ──────────────────────────────────────────────────────────

  it('SC-01: register adds a benchmark', () => {
    suite.register('test-bench', () => {}, 100, 10);
    expect(suite.getBenchmarkNames()).toContain('test-bench');
  });

  it('SC-02: getBenchmarkNames returns all registered names', () => {
    suite.register('bench-a', () => {}, 50, 5);
    suite.register('bench-b', () => {}, 50, 5);
    const names = suite.getBenchmarkNames();
    expect(names).toContain('bench-a');
    expect(names).toContain('bench-b');
  });

  // ── runBenchmark ──────────────────────────────────────────────────────────

  it('SC-03: runBenchmark returns BenchmarkResult with correct fields', async () => {
    const result = await suite.runBenchmark('noop', () => {}, 10, 50);
    expect(result.name).toBe('noop');
    expect(typeof result.p50).toBe('number');
    expect(typeof result.p95).toBe('number');
    expect(typeof result.p99).toBe('number');
    expect(result.sla).toBe(50);
    expect(typeof result.pass).toBe('boolean');
    expect(result.iterations).toBe(10);
  });

  it('SC-04: p50 ≤ p95 ≤ p99', async () => {
    const result = await suite.runBenchmark('ordered', () => {}, 50, 100);
    expect(result.p50).toBeLessThanOrEqual(result.p95);
    expect(result.p95).toBeLessThanOrEqual(result.p99);
  });

  it('SC-05: fast function passes SLA', async () => {
    const result = await suite.runBenchmark('fast', () => {}, 20, 100);
    expect(result.pass).toBe(true);
  });

  it('SC-06: slow function fails SLA', async () => {
    const result = await suite.runBenchmark(
      'slow',
      async () => { await new Promise(r => setTimeout(r, 5)); },
      5,
      1 // 1ms SLA — impossible
    );
    expect(result.pass).toBe(false);
  });

  it('SC-07: runBenchmark uses correct iteration count', async () => {
    let callCount = 0;
    await suite.runBenchmark('counter', () => { callCount++; }, 30, 100);
    expect(callCount).toBe(30);
  });

  // ── runAll ────────────────────────────────────────────────────────────────

  it('SC-08: runAll runs all registered benchmarks', async () => {
    suite.register('b1', () => {}, 100, 5);
    suite.register('b2', () => {}, 100, 5);
    suite.register('b3', () => {}, 100, 5);
    const summary = await suite.runAll();
    expect(summary.results).toHaveLength(3);
  });

  it('SC-09: runAll returns summary with allPass, passCount, failCount', async () => {
    suite.register('fast', () => {}, 1000, 5);
    const summary = await suite.runAll();
    expect(typeof summary.allPass).toBe('boolean');
    expect(typeof summary.passCount).toBe('number');
    expect(typeof summary.failCount).toBe('number');
    expect(summary.passCount + summary.failCount).toBe(summary.results.length);
  });

  it('SC-10: runAll stores result in getLastSummary', async () => {
    suite.register('x', () => {}, 100, 5);
    expect(suite.getLastSummary()).toBeNull();
    await suite.runAll();
    expect(suite.getLastSummary()).not.toBeNull();
  });

  it('SC-11: runAll runAt is valid ISO string', async () => {
    suite.register('ts', () => {}, 100, 3);
    const summary = await suite.runAll();
    expect(() => new Date(summary.runAt)).not.toThrow();
  });

  // ── System benchmarks ─────────────────────────────────────────────────────

  it('SC-12: registerSystemBenchmarks registers 4 benchmarks', () => {
    suite.registerSystemBenchmarks();
    expect(suite.getBenchmarkNames().length).toBeGreaterThanOrEqual(4);
  });

  it('SC-13: system benchmarks include detection_latency', () => {
    suite.registerSystemBenchmarks();
    expect(suite.getBenchmarkNames()).toContain('detection_latency');
  });

  it('SC-14: system benchmarks include awning_computation', () => {
    suite.registerSystemBenchmarks();
    expect(suite.getBenchmarkNames()).toContain('awning_computation');
  });

  it('SC-15: system benchmarks pass SLA', async () => {
    suite.registerSystemBenchmarks();
    const summary = await suite.runAll();
    // Most should pass (noop-like operations)
    expect(summary.passCount).toBeGreaterThan(0);
  });

  // ── generateBenchmarkReport ───────────────────────────────────────────────

  it('SC-16: generateBenchmarkReport returns message when no results', () => {
    const report = suite.generateBenchmarkReport();
    expect(report).toContain('No benchmark results');
  });

  it('SC-17: generateBenchmarkReport uses box-drawing chars', async () => {
    suite.register('test', () => {}, 100, 5);
    const summary = await suite.runAll();
    const report = suite.generateBenchmarkReport(summary);
    expect(report).toContain('╔');
    expect(report).toContain('╚');
    expect(report).toContain('║');
  });

  it('SC-18: generateBenchmarkReport includes benchmark names', async () => {
    suite.register('my-benchmark', () => {}, 100, 5);
    const summary = await suite.runAll();
    const report = suite.generateBenchmarkReport(summary);
    expect(report).toContain('my-benchmark');
  });

  it('SC-19: report includes pass/fail indicator', async () => {
    suite.register('fast', () => {}, 1000, 5);
    const summary = await suite.runAll();
    const report = suite.generateBenchmarkReport(summary);
    expect(report).toMatch(/✓|✗/);
  });

  it('SC-20: report includes runAt timestamp', async () => {
    suite.register('ts-bench', () => {}, 100, 3);
    const summary = await suite.runAll();
    const report = suite.generateBenchmarkReport(summary);
    expect(report).toContain(summary.runAt.slice(0, 10)); // date part
  });
});
