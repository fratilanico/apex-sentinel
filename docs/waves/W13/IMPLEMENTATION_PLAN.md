# W13 IMPLEMENTATION PLAN

## Order of Implementation (dependency order)

1. **alert-rate-limiter.ts** — no dependencies
2. **notification-audit-log.ts** — no dependencies
3. **telegram-alert-composer.ts** — depends on AwningAlert type (nato/)
4. **telegram-bot-gateway.ts** — depends on fetch (built-in)
5. **operator-notification-router.ts** — depends on TelegramBotGateway
6. **hourly-status-reporter.ts** — no dependencies (standalone formatter)
7. **operator-command-parser.ts** — no dependencies
8. **telegram-operator-pipeline.ts** — integrates all above

## TDD Red → Green Order
For each file:
1. Write test file with failing tests (RED)
2. Commit RED state
3. Implement source file (GREEN)
4. Run tests to verify

## Time Estimate
- Each FR: ~30 min (10 tests + implementation)
- Total: ~4 hours for all 8 FRs
