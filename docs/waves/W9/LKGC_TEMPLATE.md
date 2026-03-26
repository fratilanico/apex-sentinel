# W9 — LKGC_TEMPLATE
Wave 9: Live Data Feed Integration | APEX-SENTINEL | 2026-03-26

LKGC = Last Known Good Commit

---

## LKGC-W8 (Reference — Previous Wave)

| Field | Value |
|---|---|
| Wave | W8 |
| Status | COMPLETE |
| Tests | 1,860 GREEN |
| Push date | 2026-03-25 |
| Commit hash | _(pin after W9 gate passes — retrieve with `git log --oneline -1` at W8 HEAD)_ |

**Rollback to W8:** `git checkout <W8-LKGC-hash>`

---

## LKGC-W9 (This Wave — To Be Pinned)

**Pin this commit hash when all W9 gates pass:**

| Gate | Status |
|---|---|
| 1,988 tests GREEN (1860 + 128) | PENDING |
| Coverage ≥80% all metrics | PENDING |
| 0 TypeScript errors | PENDING |
| npm run build clean | PENDING |
| Supabase W9 migration applied | PENDING |
| NATS feed.* subjects live | PENDING |
| Smoke tests passed | PENDING |

**Commit hash:** _(fill in after all gates pass)_

**Pin command:**
```bash
git tag lkgc-w9 <commit-hash>
git push origin lkgc-w9
```

---

## Rollback Protocol

### W9 → W8 Rollback

If W9 breaks existing functionality and cannot be fixed quickly:

```bash
# 1. Revert code to W8 LKGC
git checkout lkgc-w8

# 2. Rollback Supabase migration (drop W9 tables)
# Apply rollback migration: supabase/migrations/YYYYMMDDHHMMSS_w9_rollback.sql
# Contents:
# DROP TABLE IF EXISTS detection_enriched;
# DROP TABLE IF EXISTS feed_osint_events;
# DROP TABLE IF EXISTS feed_alerts_active;
# DROP TABLE IF EXISTS feed_weather_snapshots;
# DROP TABLE IF EXISTS feed_adsb_snapshots;

# 3. Verify
npx vitest run --project p2
# Expect: 1860 tests GREEN, 0 failures
```

### Verification After Rollback

```bash
npx vitest run --project p2
# Must show: 1860 tests GREEN
# Must show: 0 W9 test files found (they don't exist in W8 checkout)
```

---

## LKGC History

| Wave | Commit | Tests | Date |
|---|---|---|---|
| W6 | _(pinned)_ | 629 | 2026-03-25 |
| W7 | _(pinned)_ | ~1100 | pre-W8 |
| W8 | _(pinned)_ | 1,860 | 2026-03-25 |
| W9 | PENDING | 1,988 | TBD |
