# APEX-SENTINEL W10 — Last Known Good Configuration

> Wave: W10 | Theme: NATO AWNING Framework Publisher + Stage 3.5 Trajectory Prediction
> Status: PLAN | Date: 2026-03-26

---

## LKGC Snapshot (to be updated on wave:complete)

### Git

```
Branch: main
Commit: <TBD after wave:complete>
Tag: lkgc-w10
```

### Test Results (target)

```
Tests: ~100 passing, 0 failing
Coverage: ≥80% branches/functions/lines/statements
Duration: < 30s for W10 tests alone
```

### Source Checksums

To be computed post-implementation:
```
src/nato/awning-level-publisher.ts        <sha256>
src/nato/stage-classifier.ts             <sha256>
src/nato/stage35-trajectory-predictor.ts <sha256>
src/nato/predictive-gap-analyzer.ts      <sha256>
src/nato/nato-alert-formatter.ts         <sha256>
src/nato/alert-throttle-gate.ts          <sha256>
src/nato/stage-transition-audit.ts       <sha256>
src/nato/awning-integration-pipeline.ts  <sha256>
```

---

## Recovery Procedure

1. `git checkout lkgc-w10`
2. `npm install` (no new deps — fast)
3. `npx vitest run --project p2` — verify GREEN
4. Done — W10 fully restored

---

## Known Issues at LKGC

None expected. W10 is all new files, no regressions possible in existing code.
