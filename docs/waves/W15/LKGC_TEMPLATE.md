# W15 LKGC (Last Known Good Configuration)

## Commit
To be filled after wave:complete

## Test Results at LKGC
- Vitest P2: ~100 tests GREEN
- Coverage: ≥80% all metrics
- TypeScript: zero errors
- mind-the-gap: 14/14 PASS

## Environment
- Node: 22.x
- TypeScript: 5.8.x
- Vitest: 3.0.x

## Required Env Vars
```
TELEGRAM_BOT_TOKEN
NATS_CREDS
HMAC_MASTER_KEY
```

## Rollback Command
```bash
git checkout <lkgc-commit-sha>
systemctl restart apex-sentinel
```
