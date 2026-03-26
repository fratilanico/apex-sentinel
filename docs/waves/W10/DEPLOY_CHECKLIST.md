# APEX-SENTINEL W10 — Deploy Checklist

> Wave: W10 | Theme: NATO AWNING Framework Publisher + Stage 3.5 Trajectory Prediction
> Status: PLAN | Date: 2026-03-26

---

## Pre-Deploy Gates

- [ ] `npx vitest run --project p2` — ALL tests GREEN (W10 tests included)
- [ ] `npx tsc --noEmit` — zero TypeScript errors
- [ ] `npx vitest run --coverage` — ≥80% all metrics
- [ ] `bash wave-formation.sh checkpoint W10` — PASS
- [ ] Git commit includes all 16 W10 files

---

## W10 Files to Deploy

Source (src/nato/):
- [ ] awning-level-publisher.ts
- [ ] stage-classifier.ts
- [ ] stage35-trajectory-predictor.ts
- [ ] predictive-gap-analyzer.ts
- [ ] nato-alert-formatter.ts
- [ ] alert-throttle-gate.ts
- [ ] stage-transition-audit.ts
- [ ] awning-integration-pipeline.ts

Tests (tests/nato/):
- [ ] FR-W10-01-awning-level-publisher.test.ts
- [ ] FR-W10-02-stage-classifier.test.ts
- [ ] FR-W10-03-stage35-trajectory.test.ts
- [ ] FR-W10-04-predictive-gap.test.ts
- [ ] FR-W10-05-nato-alert-formatter.test.ts
- [ ] FR-W10-06-alert-throttle-gate.test.ts
- [ ] FR-W10-07-stage-transition-audit.test.ts
- [ ] FR-W10-08-awning-integration.test.ts

Docs (docs/waves/W10/):
- [ ] All 20 PROJECTAPEX docs

---

## Post-Deploy Verification

- [ ] Confirm git push to origin/main
- [ ] MEMORY.md updated with W10 status
- [ ] Wave complete marker set in wave-formation.sh

---

## Rollback Plan

W10 adds only new files (no modifications to existing src). Rollback = `git revert <W10-commit>`.
No Supabase migrations — no DB rollback needed.
No systemd changes — no service restart needed.
