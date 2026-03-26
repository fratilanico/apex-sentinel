# APEX-SENTINEL W11 — Deploy Checklist

**Wave:** W11
**Date:** 2026-03-26

---

## Pre-Deploy Gates

- [ ] All 20 docs complete in docs/waves/W11/
- [ ] TDD RED commit exists (tests written, src missing)
- [ ] All ≥100 tests GREEN: `npx vitest run --project p2 2>&1 | tail -5`
- [ ] TypeScript clean: `npx tsc --noEmit`
- [ ] Coverage ≥80%: `npx vitest run --coverage 2>&1 | grep -A5 "Coverage"`
- [ ] No new npm packages added
- [ ] `src/intel/` directory created and all 8 source files present

---

## Deploy Steps

1. `git add docs/waves/W11/ src/intel/ tests/intel/`
2. `git commit -m "feat(intel): W11 OSINT deep fusion + multi-source threat correlation"`
3. `git push origin main`
4. Update MEMORY.md: W11 COMPLETE
5. Update SESSION_STATE.md: phase → complete

---

## Post-Deploy Verification

- [ ] `npx vitest run 2>&1 | grep "Tests "` shows ≥2448 passing
- [ ] No regressions in existing 2348 tests
- [ ] TypeScript build clean

---

## Rollback

W11 is additive only — no schema changes, no breaking changes to existing interfaces. Rollback: `git revert HEAD`.
