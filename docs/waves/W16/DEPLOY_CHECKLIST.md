# W16 DEPLOY CHECKLIST

## Pre-Deploy
- [ ] npx vitest run --project p2 — all tests GREEN
- [ ] npx tsc --noEmit — zero type errors
- [ ] git status clean
- [ ] wave-formation.sh checkpoint W16 passed

## RPi4 Deploy
- [ ] Generate deployment manifest: `generateManifest(distFiles)`
- [ ] Copy manifest + dist/ to RPi4 via SCP
- [ ] Verify manifest on RPi4: `verifyManifest(manifest, actualFiles)`
- [ ] Start with: `node --max-old-space-size=200 dist/system/sentinel-boot-sequencer.js`
- [ ] Verify boot completes all 8 phases
- [ ] Check health score > 80 at startup

## Post-Deploy
- [ ] Run CrossSystemIntegrationValidator NOMINAL scenario
- [ ] Confirm EdgePerformanceProfiler p99 < 200ms after 60s warmup
- [ ] Confirm MemoryBudgetEnforcer shows all budgets OK
- [ ] wave-formation.sh complete W16

## Rollback
- Previous LKGC commit from docs/waves/W16/LKGC_TEMPLATE.md
- `git checkout <lkgc-sha> -- src/system/`
