# W12 TEST STRATEGY

## Test Pyramid

| Layer | Count | Files |
|-------|-------|-------|
| Unit (FR-level) | ~100 | tests/rf2/*.test.ts |
| Integration | 5+ | FR-W12-08 integration scenarios |
| E2E | 0 | N/A (RF layer is headless) |

## FR → Test Mapping
| FR | Test File | Min Tests |
|----|-----------|-----------|
| FR-W12-01 | tests/rf2/FR-W12-01-fhss-pattern.test.ts | 12 |
| FR-W12-02 | tests/rf2/FR-W12-02-multi-protocol-classifier.test.ts | 14 |
| FR-W12-03 | tests/rf2/FR-W12-03-rf-bearing.test.ts | 12 |
| FR-W12-04 | tests/rf2/FR-W12-04-spectrum-anomaly.test.ts | 12 |
| FR-W12-05 | tests/rf2/FR-W12-05-rf-fusion.test.ts | 12 |
| FR-W12-06 | tests/rf2/FR-W12-06-rf-session-tracker.test.ts | 13 |
| FR-W12-07 | tests/rf2/FR-W12-07-rf-privacy.test.ts | 11 |
| FR-W12-08 | tests/rf2/FR-W12-08-rf-pipeline.test.ts | 13 |

## Coverage Targets
- Statements ≥ 80%
- Branches ≥ 80%
- Functions ≥ 80%
- Lines ≥ 80%

## Test Tooling
- Vitest 3.x with globals: true
- No external test runners or stubs outside of Vitest's built-ins
- FR-named describe blocks: `describe('FR-W12-0X: Name', () => {})`

## Edge Cases Covered
- Fewer than 3 nodes → InsufficientNodesError
- Fewer than 3 frequency samples → null from FhssPatternAnalyzer
- Protocol confidence below 0.60 → unknown classification
- RF and acoustic positions > 1 km apart → conflict flag
- Session inactivity > 60 s → session closed
- MAC address input → hashed output (never raw MAC in output)
