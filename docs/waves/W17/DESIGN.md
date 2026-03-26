# APEX-SENTINEL W17 — DESIGN

## Theme: Hackathon Demo Readiness + Presentation Layer

### Purpose
W17 assembles all prior waves (W1-W16) into a judge-facing presentation layer for the EUDIS 2026 hackathon "Defending Airspace" — deadline March 28. No new detection logic is added; W17 wraps, demonstrates, benchmarks, and verifies the complete system.

### Design Principles
1. **Zero new dependencies** — all W17 code uses existing imports only
2. **Composition over new logic** — W17 classes compose W1-W16 components
3. **Judge-first output** — every API, report, and Telegram brief is optimized for evaluator clarity
4. **Verifiable claims** — all key claims backed by structured evidence (FRs, test counts, benchmark results)

### Component Map

```
ExtendedDemoScenarioEngine   ← extends DemoScenarioEngine (W14)
EudisComplianceScorecard     ← maps all FRs to C01/C02 requirements
PerformanceBenchmarkSuite    ← p50/p95/p99 for all critical operations
CoverageMapDataBuilder       ← NodeHealthAggregator + PredictiveGapAnalyzer
DemoApiExtensions            ← mounts on DashboardApiServer (W14)
WaveManifestGenerator        ← reads src/ filesystem + static wave data
JudgePresentationPackage     ← assembles all outputs into submission bundle
FinalSystemVerification      ← CrossSystemIntegrationValidator NOMINAL + 8 checks
```

### Data Flow

```
Judge requests /demo/status
  → DemoApiExtensions.handleStatus()
  → WaveManifestGenerator.getStats()
  → EudisComplianceScorecard.getScore()
  → ExtendedDemoScenarioEngine.getScenarioManifest()
  → JSON response

Judge requests /demo/scorecard
  → EudisComplianceScorecard.scorecard
  → All W1-W16 FR evidence
  → 100/100 scores for C01+C02

Judge runs /demo/run/CHALLENGE_01_PERIMETER
  → 202 Accepted
  → EventEmitter emits: detection → YELLOW → detection → RED → complete
```
