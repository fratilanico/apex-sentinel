# W15 DEPLOY CHECKLIST

## Pre-Deploy
- [ ] `npx vitest run --project p2` — all tests GREEN
- [ ] `npx tsc --noEmit` — zero type errors
- [ ] `npx vitest run --coverage` — ≥80% all coverage metrics
- [ ] mind-the-gap audit PASS
- [ ] No NOT_IMPLEMENTED stubs in src/resilience/
- [ ] No hardcoded credentials

## Environment Variables Required
```bash
TELEGRAM_BOT_TOKEN=<from vault>
NATS_CREDS=<from vault>
HMAC_MASTER_KEY=<generate: openssl rand -hex 32>
```

## Deploy Steps
1. `git push origin main`
2. On each node: `git pull && systemctl restart apex-sentinel`
3. Verify ConfigSecretManager.validateStartup() passes on all nodes
4. Verify WatchdogMonitor starts and logs first health check
5. Verify AuditEventLogger records startup event

## Rollback
- `git revert HEAD` if any node fails startup validation
- All W15 components are additive — existing functionality unaffected
