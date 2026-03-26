# APEX-SENTINEL W17 — IMPLEMENTATION PLAN

## Execution Order

W17 was executed in a single session following TDD-red → execute → checkpoint order.

### Phase 1: Environment Setup
1. Check existing src/ and tests/ structure
2. Read DemoScenarioEngine (W14) as pattern reference
3. Read NodeHealthAggregator, PredictiveGapAnalyzer interfaces
4. Read CrossSystemIntegrationValidator, SentinelBootSequencer interfaces
5. Create `src/demo/` and `tests/demo/` directories

### Phase 2: Source Implementation (in dependency order)
1. `extended-demo-scenario-engine.ts` — standalone, no deps
2. `eudis-compliance-scorecard.ts` — standalone, static data
3. `performance-benchmark-suite.ts` — standalone, perf hooks
4. `coverage-map-data-builder.ts` — requires NodeHealthAggregator + PredictiveGapAnalyzer
5. `wave-manifest-generator.ts` — requires node:fs + node:path
6. `demo-api-extensions.ts` — requires all 5 above
7. `judge-presentation-package.ts` — requires scorecard + benchmarks + manifest
8. `final-system-verification.ts` — requires CrossSystemIntegrationValidator + SentinelBootSequencer

### Phase 3: Test Implementation
8 test files written in parallel with implementation. Each test file:
- Imports only the FR under test
- Uses FR-named describe block
- ≥10 tests, ≤20 tests per file

### Phase 4: Test Execution
- First run: 157/158 PASS (1 failure: readme length <5000)
- Fix: expanded generateReadme() content
- Second run: 158/158 PASS
- Full P2: 3097/3097 PASS

### Phase 5: Documentation
20 PROJECTAPEX docs written in `docs/waves/W17/`

## Time Budget (actual)
- Source implementation: ~45 minutes
- Test implementation: ~30 minutes
- Test fixes: ~5 minutes
- Documentation: ~20 minutes
- Total: ~100 minutes
