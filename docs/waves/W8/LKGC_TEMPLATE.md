# APEX-SENTINEL W8 — Last Known Good Configuration Template

> Wave: W8 | Date: 2026-03-26

---

## Baseline (W7 LKGC — confirmed good state entering W8)

```
Git SHA:       3b2016d (docs(W7): FR_REGISTER — all 14 FRs DONE, 1619 tests total)
Date:          2026-03-26
Tests:         1619/1619 passing
Coverage:      96.19% stmt / 90.46% branch / 97.46% func / 97.10% line
mind-the-gap:  19/19 PASS
.todo():       15 (FR-W7-18, IEC 61508 gates — deliberate, W8-10 resolves)
Supabase:      bymfcnwfyxuivinuzurr (migrations 0001-0085 applied)
Node firmware: 0.7.1 (22050Hz nodes still on legacy — W8 OTA fixes this)
Model version: yamnet-w7-promoted-2026-03-25
```

---

## W8 LKGC (to be filled on wave:complete)

```
Git SHA:       <TBD>
Date:          <TBD>
Tests:         <TBD>/1619+ passing
Coverage:      <TBD>% stmt
mind-the-gap:  19/19 PASS
.todo():       0 (all resolved in W8-10)
Supabase:      migrations 0086-0089 applied
Node firmware: 0.8.0 (16kHz confirmed)
Model version: yamnet-w8-promoted-<date>
Recall gates:  shahed_238≥0.95, gerbera≥0.92, shahed_136≥0.87, shahed_131≥0.85, quad_rotor≥0.88
Mutation score: ≥85%
```

---

## Rollback Procedure

If any W8 change causes test regression:

```bash
# Identify last passing commit
git log --oneline -20

# Revert to LKGC
git checkout <sha> -- src/<affected-module>.ts
npx vitest run --coverage

# If individual file revert insufficient, full revert:
git revert <sha>
```

For OTA firmware rollback: OtaController handles automatically.
For Supabase migrations: contact founder before reverting (data may exist).
