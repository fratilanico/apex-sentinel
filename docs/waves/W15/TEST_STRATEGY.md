# W15 TEST STRATEGY

## Test Pyramid

| Layer | Count | Files |
|-------|-------|-------|
| Unit | ~80 | FR-W15-01 through FR-W15-07 |
| Integration | ~20 | FR-W15-08 |
| Total | ~100 | 8 test files |

## FR Coverage

| FR | Min Tests | Focus |
|----|-----------|-------|
| FR-W15-01 | 12 | Payload size, depth, prototype pollution, field validation |
| FR-W15-02 | 12 | Sign/verify, replay within 30s, future ts, HKDF derivation |
| FR-W15-03 | 12 | FSM transitions, error rate, half-open probe, CircuitOpenError |
| FR-W15-04 | 12 | Health check, 3× failure trigger, restart event, dead-man |
| FR-W15-05 | 12 | Hash chain, append, verify, broken chain detection, JSONL export |
| FR-W15-06 | 10 | getSecret throws, getConfig default, validateStartup, non-enumerable |
| FR-W15-07 | 12 | SIGTERM handler, timeout, ordered shutdown, status phases |
| FR-W15-08 | 8 | Integration scenarios: cascade, replay, poison, shutdown order |

## Test Conventions
- FR-named describe blocks: `describe('FR-W15-01: Input Sanitization Gateway', ...)`
- No external network calls in tests
- Use `vi.useFakeTimers()` for watchdog and circuit breaker timing
- `vi.stubEnv()` for config secret tests

## Coverage Target
≥80% branches/functions/lines/statements across `src/resilience/`
