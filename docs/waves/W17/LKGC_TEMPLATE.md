# APEX-SENTINEL W17 — LKGC TEMPLATE

## Last Known Good Configuration

### Git Reference
- Branch: main
- Commit: (fill after push)
- Date: 2026-03-26

### Test State
```
W17 tests:    158/158 PASS
Total (P2):   3097/3097 PASS
```

### TypeScript Build
```
npx tsc --noEmit → 0 errors
```

### Module Versions
```json
{
  "vitest": "^3.0.9",
  "typescript": "^5.8.2",
  "@vitest/coverage-v8": "^3.0.9"
}
```

### Environment
- Node.js: ≥18 (ESM)
- Platform: darwin (Mac) + linux (deployment)

### Configuration Gates
- Coverage thresholds: ≥80% branches/functions/lines/statements
- Detection SLA: p99 <100ms
- AWNING computation SLA: p99 <500ms
- Boot sequence SLA: <30s

### Rollback Trigger
Roll back to previous LKGC if:
- Any test count drops below 3097
- TypeScript errors appear
- FinalSystemVerification verdict = NO_GO with blockers

### Rollback Procedure
```bash
git revert HEAD
npx vitest run 2>&1 | tail -3
```
