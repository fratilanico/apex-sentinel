# APEX-SENTINEL W11 — Test Strategy

**Wave:** W11
**Date:** 2026-03-26

---

## Test Pyramid

| Level | Count Target | Files |
|-------|-------------|-------|
| Unit (FR-level) | ≥80 | tests/intel/FR-W11-*.test.ts |
| Integration | ≥15 | tests/intel/FR-W11-08-intel-pipeline.test.ts |
| **Total** | **≥100** | |

---

## FR Coverage Map

| FR | File | Min Tests |
|----|------|-----------|
| FR-W11-01 | FR-W11-01-osint-correlation.test.ts | 12 |
| FR-W11-02 | FR-W11-02-anomaly-correlation.test.ts | 12 |
| FR-W11-03 | FR-W11-03-threat-timeline.test.ts | 12 |
| FR-W11-04 | FR-W11-04-sector-threat-map.test.ts | 12 |
| FR-W11-05 | FR-W11-05-intelligence-pack.test.ts | 12 |
| FR-W11-06 | FR-W11-06-confidence-aggregator.test.ts | 12 |
| FR-W11-07 | FR-W11-07-alert-dedup.test.ts | 12 |
| FR-W11-08 | FR-W11-08-intel-pipeline.test.ts | 16 |

---

## Test Patterns

### Unit tests (FR-01 to FR-07)
- Vitest globals: `describe`, `it`, `expect`, `vi`, `beforeEach`
- FR-named describe blocks: `describe('FR-W11-XX: ComponentName', () => {})`
- Mock NATS: `{ publish: vi.fn(), subscribe: vi.fn() }`
- No real timers — use `vi.useFakeTimers()` where needed
- `.js` extension on all imports

### Integration tests (FR-08)
- Test full pipeline: mock NATS subscribe/publish
- 5+ scenarios: empty feeds, OSINT surge, AWNING escalation, anomaly detected, dedup suppression
- Verify intel.brief published with correct threatLevel

---

## TDD Protocol

1. Write all 8 test files — all RED (components don't exist yet)
2. Commit RED
3. Implement each component
4. Run `npx vitest run` after each FR — must go GREEN
5. Final: all ≥100 tests GREEN
6. Coverage: ≥80% branches/functions/lines on `src/intel/**`
