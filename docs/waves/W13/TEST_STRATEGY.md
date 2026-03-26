# W13 TEST STRATEGY

## Test Pyramid
- Unit tests: 10-12 per FR = ~88 tests
- Integration tests: FR-W13-08 covers 5+ end-to-end scenarios
- Total target: ~100 tests

## FR Coverage
| FR | File | Min Tests |
|----|------|-----------|
| FR-W13-01 | tests/operator/FR-W13-01-alert-composer.test.ts | 10 |
| FR-W13-02 | tests/operator/FR-W13-02-telegram-bot-gateway.test.ts | 12 |
| FR-W13-03 | tests/operator/FR-W13-03-notification-router.test.ts | 10 |
| FR-W13-04 | tests/operator/FR-W13-04-alert-rate-limiter.test.ts | 10 |
| FR-W13-05 | tests/operator/FR-W13-05-hourly-reporter.test.ts | 10 |
| FR-W13-06 | tests/operator/FR-W13-06-command-parser.test.ts | 12 |
| FR-W13-07 | tests/operator/FR-W13-07-notification-audit.test.ts | 10 |
| FR-W13-08 | tests/operator/FR-W13-08-telegram-pipeline.test.ts | 10 |

## Mock Strategy
- TelegramBotGateway: inject `httpClient: { post(url, body) }` mock
- NATS: EventEmitter-based mock
- No real Telegram API calls in tests
- Rate limiter: inject clock via `nowMs?: number` parameter

## Vitest Config
- Added to p2 (full regression) via `tests/**/*.test.ts`
- FR-named describe blocks: `describe('FR-W13-01: TelegramAlertComposer', ...)`
