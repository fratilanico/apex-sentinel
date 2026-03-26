# W13 DEPLOY CHECKLIST

## Pre-Deploy
- [ ] All 100+ tests GREEN: `npx vitest run --project p2 2>&1 | tail -5`
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] No pipe chars in any Telegram output (grep `\|` in operator/ src)
- [ ] TELEGRAM_BOT_TOKEN set in environment
- [ ] TELEGRAM_CHAT_ID set for each operator role

## Deploy Steps
1. `git add src/operator/ tests/operator/ docs/waves/W13/`
2. `git commit -m "feat(w13): telegram operator bot + field alert notifications"`
3. `git push origin main`
4. On fortress: `systemctl restart apex-sentinel-operator` (if service exists)

## Post-Deploy Verification
- [ ] Send test /status command to bot
- [ ] Verify AWNING RED alert appears in Telegram within 2 seconds
- [ ] Verify rate limiting suppresses 4th RED in 5 minutes
- [ ] Verify audit log entries accumulate

## Rollback
- Disable TelegramOperatorPipeline.start() call
- Pipeline is additive — no existing functionality affected
