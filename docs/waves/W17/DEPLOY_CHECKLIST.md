# APEX-SENTINEL W17 — DEPLOY CHECKLIST

## Pre-Demo Checklist

### Code
- [ ] `npx vitest run` → 3097+ tests GREEN
- [ ] `npx tsc --noEmit` → 0 TypeScript errors
- [ ] git status clean (all committed + pushed)

### Verification Gate
- [ ] Run `FinalSystemVerification.verifySystem()` → allGreen or only WARN (no FAIL)
- [ ] getGoNoGo() → verdict = GO
- [ ] Blockers list = empty

### Demo Scenarios
- [ ] All 6 scenarios listed in GET /demo/scenarios
- [ ] CHALLENGE_01_PERIMETER emits RED by t=15s (speed=10)
- [ ] CHALLENGE_02_URBAN clears to WHITE (false positive suppression)
- [ ] NATO_AWNING_ESCALATION completes full cycle

### API Endpoints
- [ ] GET /demo/status → 200, system=APEX-SENTINEL
- [ ] GET /demo/scorecard → C01=100, C02=100
- [ ] GET /demo/benchmark → allPass=true (or explain any FAIL)
- [ ] GET /demo/coverage → FeatureCollection with features

### Judge Package
- [ ] JudgePresentationPackage.generatePackage() → non-null compliance, implementation
- [ ] generateTelegramBrief() → ≤10 lines, IEC 61508 visible

### Environment
- [ ] TELEGRAM_BOT_TOKEN set (or accepted as WARN in verification)
- [ ] Node.js ≥18 (ESM module support)
- [ ] Sufficient RAM (≥512MB for coverage grid computation)

## Demo Day Script

1. Start: `node -e "import('./src/demo/final-system-verification.js').then(m => new m.FinalSystemVerification().verifySystem()).then(r => console.log(r.summary, r.allGreen))"`
2. If GO: proceed to demo
3. Demo flow: GET /demo/scenarios → POST /demo/run/CHALLENGE_01_PERIMETER → watch events
4. Show: GET /demo/scorecard → point to 100/100 scores
5. Show: GET /demo/benchmark → point to all-pass benchmarks
6. Close: JudgePresentationPackage.generateTelegramBrief()
