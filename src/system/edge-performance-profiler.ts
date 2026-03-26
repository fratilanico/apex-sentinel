// APEX-SENTINEL — W16 EdgePerformanceProfiler
// FR-W16-02 | src/system/edge-performance-profiler.ts

// ── Types ────────────────────────────────────────────────────────────────────

export interface SlaResult {
  pass: boolean;
  p50: number;
  p95: number;
  p99: number;
  sla: number;
  samples: number;
}

// ── SLA thresholds (ms) ───────────────────────────────────────────────────────

const DEFAULT_SLA: Record<string, number> = {
  'acoustic-inference': 200,
  'enrichment': 200,
  'feed-poll': 5000,
};

const WINDOW_SIZE = 1000;

// ── EdgePerformanceProfiler ───────────────────────────────────────────────────

export class EdgePerformanceProfiler {
  private windows: Map<string, number[]> = new Map();
  private slaOverrides: Map<string, number> = new Map();

  registerSla(component: string, slaMs: number): void {
    this.slaOverrides.set(component, slaMs);
  }

  recordLatency(component: string, latency_ms: number): void {
    if (!this.windows.has(component)) {
      this.windows.set(component, []);
    }
    const window = this.windows.get(component)!;
    window.push(latency_ms);
    // Evict oldest when window full
    if (window.length > WINDOW_SIZE) {
      window.shift();
    }
  }

  checkSla(component: string): SlaResult {
    const window = this.windows.get(component) ?? [];
    const sla = this.slaOverrides.get(component) ?? DEFAULT_SLA[component] ?? 200;

    if (window.length === 0) {
      return { pass: true, p50: 0, p95: 0, p99: 0, sla, samples: 0 };
    }

    const sorted = [...window].sort((a, b) => a - b);
    const p50 = this._percentile(sorted, 50);
    const p95 = this._percentile(sorted, 95);
    const p99 = this._percentile(sorted, 99);

    return {
      pass: p99 <= sla,
      p50,
      p95,
      p99,
      sla,
      samples: window.length,
    };
  }

  getReport(): Record<string, SlaResult> {
    const report: Record<string, SlaResult> = {};
    for (const component of this.windows.keys()) {
      report[component] = this.checkSla(component);
    }
    return report;
  }

  clearComponent(component: string): void {
    this.windows.delete(component);
  }

  private _percentile(sorted: number[], pct: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((pct / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
  }
}
