# W13 LKGC TEMPLATE

## Last Known Good Configuration

### Commit
- Branch: main
- Tag: lkgc-w13 (apply after checkpoint GREEN)

### Test Baseline
- Total tests: ~2647 (2547 existing + ~100 W13)
- W13 tests: `npx vitest run --project p2 tests/operator/ 2>&1 | tail -5`

### Environment
- Node 18+ (global fetch required)
- TELEGRAM_BOT_TOKEN: from environment
- No new npm packages

### Rollback Procedure
1. `git checkout lkgc-w12` (previous LKGC)
2. `systemctl restart apex-sentinel` on fortress
3. W13 operator pipeline is fully additive — no W1-W12 functionality affected
