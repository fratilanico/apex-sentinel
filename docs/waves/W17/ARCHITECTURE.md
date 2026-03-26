# APEX-SENTINEL W17 — ARCHITECTURE

## Architecture Overview

W17 introduces the `src/demo/` module — a purely compositional layer that wraps W1-W16 components.

### Module Dependencies

```
src/demo/
├── extended-demo-scenario-engine.ts   (standalone, EventEmitter only)
├── eudis-compliance-scorecard.ts      (standalone, static data)
├── performance-benchmark-suite.ts     (standalone, node:perf_hooks)
├── coverage-map-data-builder.ts       ← NodeHealthAggregator, PredictiveGapAnalyzer
├── demo-api-extensions.ts             ← all 5 demo modules above + WaveManifestGenerator
├── wave-manifest-generator.ts         ← node:fs, node:path (reads src/ dir)
├── judge-presentation-package.ts      ← EudisComplianceScorecard, PerformanceBenchmarkSuite, WaveManifest
└── final-system-verification.ts      ← CrossSystemIntegrationValidator, SentinelBootSequencer
```

### Integration with Existing Architecture

DemoApiExtensions does NOT extend DashboardApiServer (avoids tight coupling). Instead it exposes a `handles(url, method)` + `handle(req, res)` interface that can be called from within DashboardApiServer's request handler or mounted independently.

### No New npm Packages
All W17 code uses:
- `node:events` (EventEmitter)
- `node:fs` / `node:path` (WaveManifestGenerator directory scan)
- `node:http` (IncomingMessage, ServerResponse — type-only)
- `node:perf_hooks` via `performance.now()` (PerformanceBenchmarkSuite)
- Existing W1-W16 src imports

### Memory Budget
- WaveManifestGenerator: O(n) where n = number of source files
- CoverageMapDataBuilder: O(cells) ≈ 3700 cells for Romania 0.1° grid
- PerformanceBenchmarkSuite: O(iterations × benchmarks) samples in memory
- All others: O(1) constant structures
