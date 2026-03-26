# APEX-SENTINEL W11 — Last Known Good Configuration Template

**Wave:** W11
**Date:** 2026-03-26

---

## LKGC Snapshot Point

When all tests pass (≥2448 GREEN), tag this commit as W11-LKGC.

```bash
git tag -a W11-LKGC -m "W11 LKGC: OSINT Deep Fusion + Multi-Source Threat Correlation — 2448+ tests GREEN"
git push origin W11-LKGC
```

---

## LKGC Verification Commands

```bash
# Full regression
npx vitest run 2>&1 | grep "Tests "
# Expected: ≥2448 passed

# TypeScript
npx tsc --noEmit
# Expected: 0 errors

# Coverage
npx vitest run --coverage 2>&1 | grep -E "branches|functions|lines"
# Expected: all ≥80%
```

---

## Pre-W11 LKGC (W10)

- Tests: 2348 passing, 158 files
- Tag: W10-LKGC (check git tags)
- Key modules: NATO AWNING framework, live feed clients

---

## Recovery

If W11 breaks anything:
```bash
git checkout W10-LKGC
```
W11 is additive — no destructive changes to W1-W10 code.
