// APEX-SENTINEL — W17 PerformanceBenchmarkSuite
// FR-W17-03 | src/demo/performance-benchmark-suite.ts

// ── Types ────────────────────────────────────────────────────────────────────

export interface BenchmarkResult {
  name: string;
  p50: number;
  p95: number;
  p99: number;
  sla: number;
  pass: boolean;
  iterations: number;
}

export interface BenchmarkSummary {
  results: BenchmarkResult[];
  allPass: boolean;
  passCount: number;
  failCount: number;
  runAt: string;
}

export interface RegisteredBenchmark {
  name: string;
  fn: () => Promise<void> | void;
  sla: number;
  iterations: number;
}

// ── Percentile helper ─────────────────────────────────────────────────────────

function percentile(sorted: number[], pct: number): number {
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── PerformanceBenchmarkSuite ─────────────────────────────────────────────────

export class PerformanceBenchmarkSuite {
  private benchmarks: RegisteredBenchmark[] = [];
  private lastSummary: BenchmarkSummary | null = null;

  register(name: string, fn: () => Promise<void> | void, sla: number, iterations = 100): void {
    this.benchmarks.push({ name, fn, sla, iterations });
  }

  async runBenchmark(name: string, fn: () => Promise<void> | void, iterations: number, sla: number): Promise<BenchmarkResult> {
    const samples: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      await fn();
      const elapsed = performance.now() - t0;
      samples.push(elapsed);
    }

    samples.sort((a, b) => a - b);

    const p50 = percentile(samples, 50);
    const p95 = percentile(samples, 95);
    const p99 = percentile(samples, 99);

    return {
      name,
      p50,
      p95,
      p99,
      sla,
      pass: p99 <= sla,
      iterations,
    };
  }

  async runAll(): Promise<BenchmarkSummary> {
    const results: BenchmarkResult[] = [];

    for (const b of this.benchmarks) {
      const result = await this.runBenchmark(b.name, b.fn, b.iterations, b.sla);
      results.push(result);
    }

    const allPass = results.every(r => r.pass);
    const passCount = results.filter(r => r.pass).length;
    const failCount = results.filter(r => !r.pass).length;

    this.lastSummary = {
      results,
      allPass,
      passCount,
      failCount,
      runAt: new Date().toISOString(),
    };

    return this.lastSummary;
  }

  getLastSummary(): BenchmarkSummary | null {
    return this.lastSummary;
  }

  getBenchmarkNames(): string[] {
    return this.benchmarks.map(b => b.name);
  }

  generateBenchmarkReport(summary?: BenchmarkSummary): string {
    const s = summary ?? this.lastSummary;
    if (!s) return 'No benchmark results available.';

    const lines: string[] = [
      '╔══════════════════════════════════════════════════════════════╗',
      '║   APEX-SENTINEL Performance Benchmark Report — W17           ║',
      '╠══════════════════════════════════════════════════════════════╣',
      '║  Benchmark                    │ p50  │ p95  │ p99  │ SLA    ║',
      '╠══════════════════════════════════════════════════════════════╣',
    ];

    for (const r of s.results) {
      const name = r.name.padEnd(30).slice(0, 30);
      const p50 = `${r.p50.toFixed(1)}ms`.padStart(6);
      const p95 = `${r.p95.toFixed(1)}ms`.padStart(6);
      const p99 = `${r.p99.toFixed(1)}ms`.padStart(6);
      const sla = `${r.sla}ms`.padStart(6);
      const status = r.pass ? '✓' : '✗';
      lines.push(`║  ${name} │${p50} │${p95} │${p99} │${sla} ${status} ║`);
    }

    lines.push('╠══════════════════════════════════════════════════════════════╣');
    const overall = s.allPass ? 'ALL PASS' : `${s.failCount} FAILED`;
    lines.push(`║  Result: ${overall.padEnd(51)}║`);
    lines.push(`║  Run at: ${s.runAt.slice(0, 19).padEnd(51)}║`);
    lines.push('╚══════════════════════════════════════════════════════════════╝');

    return lines.join('\n');
  }

  // ── Built-in system benchmarks ────────────────────────────────────────────

  registerSystemBenchmarks(): void {
    // Detection latency: acoustic feature extraction simulation
    this.register('detection_latency', async () => {
      const data = new Float32Array(16000); // 1s at 16kHz
      for (let i = 0; i < data.length; i++) data[i] = Math.sin(i * 0.01);
      // Simulate FFT-like computation
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += Math.abs(data[i]);
      void sum;
    }, 100, 100); // 100ms SLA

    // Enrichment latency: metadata lookup simulation
    this.register('enrichment_latency', async () => {
      const profile = { threat: 'Shahed-136', rpm: 1800, freq: 3200 };
      const enriched = { ...profile, confidence: 0.87, stage: 2 };
      void enriched;
    }, 10, 100); // 10ms SLA

    // AWNING computation: state machine transition
    this.register('awning_computation', () => {
      const levels = ['WHITE', 'YELLOW', 'RED', 'BLACK'];
      let idx = 0;
      for (let i = 0; i < 10; i++) idx = (idx + 1) % levels.length;
      void levels[idx];
    }, 1, 100); // 1ms SLA

    // Alert formatting: Telegram message generation
    this.register('alert_formatting', () => {
      const alert = {
        level: 'RED',
        threat: 'Shahed-136',
        lat: 44.4,
        lon: 26.1,
        eta_s: 45,
        timestamp: new Date().toISOString(),
      };
      const msg = `🚨 AWNING ${alert.level}\n📍 ${alert.lat},${alert.lon}\n⏱ ETA: ${alert.eta_s}s\n🕐 ${alert.timestamp}`;
      void msg;
    }, 5, 100); // 5ms SLA
  }
}
