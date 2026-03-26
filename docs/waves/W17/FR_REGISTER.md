# APEX-SENTINEL W17 — FR REGISTER

| FR ID | Title | Priority | Status | Tests | Source File |
|-------|-------|----------|--------|-------|-------------|
| FR-W17-01 | ExtendedDemoScenarioEngine | P0 | DONE | 20 | extended-demo-scenario-engine.ts |
| FR-W17-02 | EudisComplianceScorecard | P0 | DONE | 18 | eudis-compliance-scorecard.ts |
| FR-W17-03 | PerformanceBenchmarkSuite | P1 | DONE | 20 | performance-benchmark-suite.ts |
| FR-W17-04 | CoverageMapDataBuilder | P1 | DONE | 20 | coverage-map-data-builder.ts |
| FR-W17-05 | DemoApiExtensions | P0 | DONE | 20 | demo-api-extensions.ts |
| FR-W17-06 | WaveManifestGenerator | P1 | DONE | 20 | wave-manifest-generator.ts |
| FR-W17-07 | JudgePresentationPackage | P0 | DONE | 20 | judge-presentation-package.ts |
| FR-W17-08 | FinalSystemVerification | P0 | DONE | 20 | final-system-verification.ts |

## FR Details

### FR-W17-01: ExtendedDemoScenarioEngine
**Rationale:** W14 had 3 scenarios; judges need 6 covering both EUDIS challenges + NATO AWNING full cycle + full pipeline.

### FR-W17-02: EudisComplianceScorecard
**Rationale:** Judges need a structured mapping from system capabilities to challenge requirements. Self-scoring prevents subjective evaluation gaps.

### FR-W17-03: PerformanceBenchmarkSuite
**Rationale:** Claims about p99 latency need structured evidence. 100-iteration benchmarks with p50/p95/p99 provide credible performance data.

### FR-W17-04: CoverageMapDataBuilder
**Rationale:** Challenge 01 requires demonstrating perimeter coverage. GeoJSON enables dashboard visualization and provides structured evidence for the 3.5km node threshold.

### FR-W17-05: DemoApiExtensions
**Rationale:** REST endpoints allow judges to interact with the system from any HTTP client without understanding the TypeScript codebase.

### FR-W17-06: WaveManifestGenerator
**Rationale:** 17 waves of work needs a self-documenting inventory. Filesystem-based directory scan ensures accuracy. generateReadme() provides a 5000+ char submission document.

### FR-W17-07: JudgePresentationPackage
**Rationale:** Combines all evidence into a single JSON blob for official submission. Key claims with evidence prevents unsupported assertions.

### FR-W17-08: FinalSystemVerification
**Rationale:** Pre-demo GO/NO-GO gate catches regressions before judges arrive. Runs CrossSystem NOMINAL + 7 additional checks.
