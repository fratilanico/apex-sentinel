# W12 IMPLEMENTATION PLAN

## Phase 1: TDD RED (this session)
Write all 8 test files first. Tests import from src/rf2/* which does not yet exist.
All tests fail with import errors → this is the RED state.

## Phase 2: EXECUTE — Source Implementation
Implement source files in dependency order:

### Step 1 — Types and utilities
No shared types file needed; each module defines its own interfaces.

### Step 2 — Independent modules (no cross-dependencies)
- `fhss-pattern-analyzer.ts` — pure function, depends on nothing
- `spectrum-anomaly-detector.ts` — pure function, depends on nothing
- `rf-privacy-filter.ts` — crypto.createHmac from Node built-ins
- `rf-bearing-estimator.ts` — math only

### Step 3 — Modules depending on Step 2
- `multi-protocol-rf-classifier.ts` — uses FhssPatternAnalyzer
- `rf-session-tracker.ts` — uses classification result types

### Step 4 — Fusion and integration
- `rf-fusion-engine.ts` — uses RfBearingEstimator + acoustic bearing types
- `rf-pipeline-integration.ts` — uses all of the above + AWNING imports

## Phase 3: CHECKPOINT
- `npx vitest run tests/rf2/` all GREEN
- `npx tsc --noEmit` zero errors
- Coverage report checked

## Phase 4: COMPLETE
- `bash wave-formation.sh complete W12`
- Commit + push
- Update MEMORY.md
