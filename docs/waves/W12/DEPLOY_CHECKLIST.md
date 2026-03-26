# W12 DEPLOY CHECKLIST

## Pre-Deploy
- [ ] All 8 source files in src/rf2/ present
- [ ] All 8 test files in tests/rf2/ present
- [ ] `npx vitest run tests/rf2/` — 100% GREEN, ≥100 tests
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Coverage ≥ 80% branches/functions/lines/statements
- [ ] No new npm packages added to package.json
- [ ] All imports use `.js` extensions (ESM)

## Deploy Steps
1. `git add src/rf2/ tests/rf2/ docs/waves/W12/`
2. `git commit -m "feat(rf2): W12 RF spectrum deepening + ELRS fingerprinting v2"`
3. `git push origin main`
4. Workers on gateway-01 + fortress auto-pull from origin/main on next task

## Post-Deploy Verification
- [ ] Confirm NATS subject `sentinel.rf.detections` receives filtered events
- [ ] Confirm AWNING stage classifier upgrades on ELRS 900 detection
- [ ] Confirm no MAC addresses in published NATS payloads
- [ ] Run mind-the-gap check: `bash wave-formation.sh checkpoint W12`

## Rollback
- `git revert HEAD` — revert W12 commit
- src/rf/ (W7/W8) is unmodified; acoustic pipeline unaffected
