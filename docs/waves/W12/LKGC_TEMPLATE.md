# W12 LKGC TEMPLATE (Last Known Good Configuration)

## Commit
TBD after wave:complete

## Test Results at LKGC
- Total tests: ~2548 (2448 existing + ~100 W12)
- RF2 tests: ~100 GREEN
- Coverage: ≥ 80% all metrics

## Key Versions
- Node: 20.x
- TypeScript: 5.8.x
- Vitest: 3.0.x

## Configuration Snapshot
- vitest.config.ts: tests/rf2/ covered by default include `tests/**/*.test.ts`
- tsconfig.json: rootDir=src (rf2/ is under src/)
- No new environment variables required

## Known Working State
- All W1–W11 tests remain GREEN (rf2/ is additive, no modifications to existing src/)
- src/rf/ (W7/W8) untouched
- src/nato/, src/intel/ untouched
