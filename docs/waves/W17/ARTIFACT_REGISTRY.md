# APEX-SENTINEL W17 — ARTIFACT REGISTRY

## Source Artifacts

| File | FR | Lines | Description |
|------|----|-------|-------------|
| `src/demo/extended-demo-scenario-engine.ts` | W17-01 | ~260 | 6 demo scenarios with EventEmitter |
| `src/demo/eudis-compliance-scorecard.ts` | W17-02 | ~155 | 11-entry scorecard, C01+C02, scoring |
| `src/demo/performance-benchmark-suite.ts` | W17-03 | ~155 | p50/p95/p99, runAll, box-drawing report |
| `src/demo/coverage-map-data-builder.ts` | W17-04 | ~130 | GeoJSON grid, Romania bbox, gap risk |
| `src/demo/demo-api-extensions.ts` | W17-05 | ~180 | 6 /demo/* routes, handles()+handle() |
| `src/demo/wave-manifest-generator.ts` | W17-06 | ~220 | 17-wave manifest, FR registry, readme |
| `src/demo/judge-presentation-package.ts` | W17-07 | ~110 | 8 key claims, package bundle, Telegram brief |
| `src/demo/final-system-verification.ts` | W17-08 | ~195 | 8 checks, GO/NO-GO, CrossSystem NOMINAL |

## Test Artifacts

| File | FR | Tests |
|------|----|-------|
| `tests/demo/FR-W17-01-extended-scenarios.test.ts` | W17-01 | 20 |
| `tests/demo/FR-W17-02-eudis-scorecard.test.ts` | W17-02 | 18 |
| `tests/demo/FR-W17-03-performance-benchmark.test.ts` | W17-03 | 20 |
| `tests/demo/FR-W17-04-coverage-map.test.ts` | W17-04 | 20 |
| `tests/demo/FR-W17-05-demo-api.test.ts` | W17-05 | 20 |
| `tests/demo/FR-W17-06-wave-manifest.test.ts` | W17-06 | 20 |
| `tests/demo/FR-W17-07-judge-package.test.ts` | W17-07 | 20 |
| `tests/demo/FR-W17-08-final-verification.test.ts` | W17-08 | 20 |

**Total W17 tests: 158**

## Documentation Artifacts

20 PROJECTAPEX docs in `docs/waves/W17/`:
DESIGN, PRD, ARCHITECTURE, DATABASE_SCHEMA, API_SPECIFICATION, AI_PIPELINE, PRIVACY_ARCHITECTURE, ROADMAP, TEST_STRATEGY, ACCEPTANCE_CRITERIA, DECISION_LOG, SESSION_STATE, ARTIFACT_REGISTRY, DEPLOY_CHECKLIST, LKGC_TEMPLATE, IMPLEMENTATION_PLAN, HANDOFF, FR_REGISTER, RISK_REGISTER, INTEGRATION_MAP
