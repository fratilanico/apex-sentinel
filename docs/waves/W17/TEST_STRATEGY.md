# APEX-SENTINEL W17 — TEST STRATEGY

## Test Distribution

| FR | File | Tests | Focus |
|----|------|-------|-------|
| FR-W17-01 | FR-W17-01-extended-scenarios.test.ts | 20 | Scenario manifest, event emission, all 6 scenarios |
| FR-W17-02 | FR-W17-02-eudis-scorecard.test.ts | 18 | Scorecard structure, scoring, report generation |
| FR-W17-03 | FR-W17-03-performance-benchmark.test.ts | 20 | Registration, runBenchmark, runAll, reporting |
| FR-W17-04 | FR-W17-04-coverage-map.test.ts | 20 | Grid cells, GeoJSON, coverage summary |
| FR-W17-05 | FR-W17-05-demo-api.test.ts | 20 | All 6 routes, handles(), status codes |
| FR-W17-06 | FR-W17-06-wave-manifest.test.ts | 20 | Stats, directories, manifest, readme |
| FR-W17-07 | FR-W17-07-judge-package.test.ts | 20 | Key claims, package structure, Telegram brief |
| FR-W17-08 | FR-W17-08-final-verification.test.ts | 20 | All 8 checks, GO/NO-GO, report storage |

**Total W17 tests: 158**

## Test Tier
All W17 tests run in P2 (full regression). No P0/P1 inclusion needed — these are demo-layer tests, not safety-critical path.

## Testing Approach

### FR-W17-01 (Scenarios)
- Uses `vi.useFakeTimers()` + `speedMultiplier=1000` to collapse real-time scenario timelines
- Asserts on EventEmitter events
- Covers: cancel, active scenario tracking, all 6 scenario names

### FR-W17-03 (Benchmarks)
- Uses real timers (no fake timers — benchmarking requires real time)
- Slow function test uses `setTimeout(5ms)` with 1ms SLA to force failure
- System benchmarks test covers registration and execution

### FR-W17-04 (Coverage Map)
- No mocking needed — uses demo nodes baked into NodeHealthAggregator
- Validates geometric properties of GeoJSON (ring closure, Polygon type)
- Validates gap risk logic (uncovered=high, single=low, multi=none)

### FR-W17-05 (Demo API)
- Uses mock IncomingMessage + ServerResponse (captures statusCode + body)
- All routes tested including 400 for unknown scenario, 404 for unknown path
- Benchmark test has 30s timeout (actual benchmark runs 100 iterations)

### FR-W17-08 (Final Verification)
- Uses real CrossSystemIntegrationValidator (no mocks)
- Tests both GO (no blockers) and NO_GO (with blockers) paths
- Verifies check counts and verdict consistency
