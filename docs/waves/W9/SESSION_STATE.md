# W9 — SESSION_STATE
Wave 9: Live Data Feed Integration | APEX-SENTINEL | 2026-03-26

---

## Current State

| Field | Value |
|---|---|
| Wave | W9 |
| Phase | PLAN |
| Date | 2026-03-26 |
| Author | Nico + Claude |
| Supabase Project | bymfcnwfyxuivinuzurr (eu-west-2, London) |

---

## Previous Wave: W8

**Status:** COMPLETE

**Test count:** 1,860 tests GREEN

**FRs completed:** 10/12 (W8.2 deferred — backlinks + template layer fully wired)

**W8 pushed:** 2026-03-25

**W8 LKGC:** Pinned at last W8 GREEN commit (see LKGC_TEMPLATE.md W8 entry)

**Deferred to W9+:** W8.2 scope items absorbed into W9 integration map where relevant.

---

## W9 Blocking Issues

None. W8 is complete and pushed. W9 can proceed to tdd-red phase immediately.

---

## W9 Phase Checklist

- [x] PLAN: 20-doc suite created (this file marks plan phase active)
- [ ] TDD-RED: Write all 9 failing test files, commit RED
- [ ] EXECUTE: Implement src/feeds/, src/detection/, src/ui/ modules
- [ ] CHECKPOINT: 128/128 tests GREEN, coverage ≥80%
- [ ] COMPLETE: Push, tag LKGC-W9, update MEMORY.md

---

## Next Phase: TDD-RED

**Action:** Write all 9 test files before writing any implementation code.

**Test files to create:**

```
tests/feeds/FR-W9-01-adsb-exchange-client.test.ts
tests/feeds/FR-W9-02-open-meteo-client.test.ts
tests/feeds/FR-W9-03-civil-protection-client.test.ts
tests/feeds/FR-W9-04-gdelt-client.test.ts
tests/feeds/FR-W9-05-remote-id-receiver.test.ts
tests/feeds/FR-W9-06-data-feed-broker.test.ts
tests/detection/FR-W9-07-threat-context-enricher.test.ts
tests/feeds/FR-W9-08-demo-dashboard-live-feed.test.ts
tests/integration/FR-W9-integration-feeds.test.ts
```

**TDD-RED gate:** `npx vitest run` must show all 9 new test files FAILING (red) before implementation begins.

---

## Context for Next Session

- W8 complete: 1860 tests passing, backlinks + templates wired
- W9 docs written: all 14 PROJECTAPEX docs present in docs/waves/W9/
- W9 implementation not yet started
- No env vars set yet for W9 feeds (ADSB_BOUNDING_BOX, ALERTS_COUNTRIES, etc.)
- NATS JetStream subjects for feed.* not yet configured
- Supabase W9 migration not yet applied

---

## Pending Decisions / Open Questions

None — all architectural decisions made and logged in DECISION_LOG.md.
