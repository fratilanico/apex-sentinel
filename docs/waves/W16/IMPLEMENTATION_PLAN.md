# W16 IMPLEMENTATION PLAN

## Phase 1: Docs (20 files) — DONE
All PROJECTAPEX docs written to docs/waves/W16/

## Phase 2: TDD RED
Write failing tests for all 8 FRs → commit RED

## Phase 3: Execute (implementation)
Write source files in dependency order:
1. ConfigurationManager (no deps)
2. EdgePerformanceProfiler (no deps)
3. MemoryBudgetEnforcer (no deps)
4. DeploymentPackager (node:crypto, node:fs/promises)
5. SentinelBootSequencer (uses ConfigurationManager)
6. SystemHealthDashboard (uses NodeHealthAggregator)
7. CrossSystemIntegrationValidator (uses pipeline mocks)
8. W16EndToEndIntegration (uses all above)

## Phase 4: Checkpoint
- npx vitest run --project p2
- npx tsc --noEmit
- All 8 test files GREEN

## Phase 5: Complete
- wave-formation.sh complete W16
- Update MEMORY.md
- Git commit + push
