# APEX-SENTINEL W8 — Deploy Checklist

> Wave: W8 | Date: 2026-03-26

---

## Pre-Deploy Gates (all must pass before W8 complete)

### Quality Gates
- [ ] `npx vitest run --coverage` — ≥1800 tests passing, 0 failing
- [ ] Statement coverage ≥96%
- [ ] Branch coverage ≥90%
- [ ] Function coverage ≥97%
- [ ] `./wave-formation.sh mind-the-gap W8` — 19/19 PASS
- [ ] `npm run test:mutation` — Stryker mutation score ≥85%
- [ ] `npm run export-model` — recall oracle gate passes for all profiles
- [ ] 0 `.todo()` tests remaining (all resolved in W8-10)

### Code Quality
- [ ] `npx tsc --noEmit` — zero TypeScript errors
- [ ] `npm run lint` — zero ESLint errors
- [ ] No `NOT_IMPLEMENTED` stubs in src/
- [ ] No hardcoded credentials in src/ or tests/
- [ ] No raw audio transmission paths
- [ ] GDPR grid coarsening active (regression test)

### Database
- [ ] All 4 Supabase migrations applied to bymfcnwfyxuivinuzurr
  - [ ] 0086_model_promotion_audit.sql
  - [ ] 0087_firmware_ota_log.sql
  - [ ] 0088_per_profile_recall_metrics.sql
  - [ ] 0089_multi_threat_sessions.sql
- [ ] RLS policies applied (service role full, anon read-only)

### Hardware Integration
- [ ] PTZ integration test suite passes against ONVIF simulator (8 tests)
- [ ] ELRS RF field validation envelope passing (10 tests)
- [ ] OTA controller health check regression tests pass

### Operator UX
- [ ] Dashboard: Playwright load time test <3 seconds
- [ ] Mobile: Expo build completes without error (EAS Build)
- [ ] JWT auth gate tested on both dashboard and mobile

---

## Deployment Steps

1. Run all pre-deploy gates
2. Apply Supabase migrations (use PAT Management API, not REST API)
3. Tag release: `git tag v0.8.0`
4. Push to origin: `git push origin main --tags`
5. Notify INDIGO team via Telegram: W8 complete, field trial ready
6. Update PROJECT.md with W8 status
7. Update TAIKAI submission with W8 stats

---

## Rollback Plan

If W8 deploy to field causes issues:
- OTA controller rolls back firmware automatically on health check failure
- Model promotion gate prevents bad model deployment
- Dashboard and mobile are read-only overlays — no rollback needed
- Supabase migrations: `supabase db reset` restores to previous state (dev only)
  Production: write reverse migration if needed

---

## TAIKAI Page Update (post-W8)

Update TAIKAI submission from current outdated stats:
- Tests: ~~86~~ → 1800+ (W8 complete)
- Coverage: ~~not mentioned~~ → 96%+
- Waves: W1-W7 complete → W1-W8 complete
- Hardware: add OTA controller, ONVIF integration, ELRS field validation
- Architecture: add mobile app + dashboard frontend
