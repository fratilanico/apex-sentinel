# W16 TEST STRATEGY

## Test Pyramid
- Unit: 10–15 per FR → isolated module tests, mocks for deps
- Integration: 3–5 per FR → multi-module interactions
- E2E: FR-W16-08 → full pipeline boot-to-shutdown

## FR Test File Map
| FR | File | Min Tests |
|----|------|-----------|
| FR-W16-01 | tests/system/FR-W16-01-boot-sequencer.test.ts | 12 |
| FR-W16-02 | tests/system/FR-W16-02-performance-profiler.test.ts | 12 |
| FR-W16-03 | tests/system/FR-W16-03-system-health.test.ts | 12 |
| FR-W16-04 | tests/system/FR-W16-04-configuration-manager.test.ts | 12 |
| FR-W16-05 | tests/system/FR-W16-05-cross-system-validator.test.ts | 12 |
| FR-W16-06 | tests/system/FR-W16-06-memory-budget.test.ts | 12 |
| FR-W16-07 | tests/system/FR-W16-07-deployment-packager.test.ts | 12 |
| FR-W16-08 | tests/system/FR-W16-08-e2e-integration.test.ts | 15 |

## Vitest Config
- Project: p2 (full regression)
- `tests/system/` added to p2 include glob `tests/**/*.test.ts` — no config change needed
- Globals: true
- FR-named describe blocks required

## Key Test Patterns
- Boot sequencer: mock each phase handler; verify order, timeout enforcement
- Profiler: inject synthetic latencies; verify percentile calculations
- Health dashboard: mock NodeHealthAggregator + NatsClient; verify score deductions
- Config manager: test ENV override, file override, defaults, validation errors
- Cross-system validator: mock pipeline stages; inject synthetic detection; verify step results
- Memory enforcer: inject large objects; verify budget rejection; verify pruneOld() called
- Deployment packager: create temp files; verify SHA-256 matches; verify mismatch detection
- E2E: full mock pipeline; verify boot → detect → alert → shutdown sequence
