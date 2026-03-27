# W20 SESSION STATE — Operator Workflow Engine

## Current Phase
**wave:init** — documentation phase (this file)

## Wave Status
| Phase | Status | Date | Notes |
|-------|--------|------|-------|
| init | IN PROGRESS | 2026-03-27 | 20 docs being written |
| plan | PENDING | - | - |
| tdd-red | PENDING | - | 96 failing tests to write |
| execute | PENDING | - | 8 FRs to implement |
| checkpoint | PENDING | - | integration validation |
| complete | PENDING | - | W21 handoff |

## Last Session Summary (2026-03-27)
- W20 wave initiated
- All 20 PROJECTAPEX docs written to `/Users/nico/projects/apex-sentinel/docs/waves/W20/`
- FR definitions confirmed: 8 FRs, 96 total tests
- Source file location: `src/workflow/`
- No implementation code written yet

## Decisions Made This Session
- See DECISION_LOG.md for all 8 architectural decisions
- SLA thresholds confirmed from ICAO Annex 11, CNCAN 400/2021, SMFA Directive, SPP Protocol
- Escalation chains confirmed: IGAV for airports, SRI for nuclear/government, NATO CAOC for military

## Next Actions

### Immediate (next session)
1. Write 96 failing tests (TDD RED phase)
   - `infra/__tests__/sentinel-w20-alert-acknowledgment.test.cjs` (13 tests)
   - `infra/__tests__/sentinel-w20-incident-manager.test.cjs` (14 tests)
   - `infra/__tests__/sentinel-w20-escalation-matrix.test.cjs` (12 tests)
   - `infra/__tests__/sentinel-w20-shift-handover.test.cjs` (10 tests)
   - `infra/__tests__/sentinel-w20-sla-compliance-tracker.test.cjs` (11 tests)
   - `infra/__tests__/sentinel-w20-audit-trail-exporter.test.cjs` (11 tests)
   - `infra/__tests__/sentinel-w20-multi-site-operator-view.test.cjs` (12 tests)
   - `infra/__tests__/sentinel-w20-workflow-pipeline.test.cjs` (13 tests)
2. Commit failing tests: `test(W20): TDD RED — 96 failing tests`
3. Begin implementation: AlertAcknowledgmentEngine first (FR-W20-01)

### Execute Phase Order
1. FR-W20-01 AlertAcknowledgmentEngine + FR-W20-05 SlaComplianceTracker (co-dependent)
2. FR-W20-02 IncidentManager + FR-W20-03 EscalationMatrix (co-dependent)
3. FR-W20-06 AuditTrailExporter (standalone)
4. FR-W20-04 OperatorShiftHandover (depends on 01, 02)
5. FR-W20-07 MultiSiteOperatorView (standalone)
6. FR-W20-08 W20OperatorWorkflowPipeline (depends on all)

## Open Questions
- [ ] Confirm W21 UI framework (React vs Svelte) — affects OperatorWorkflowState serialization format
- [ ] Confirm Telegram channel IDs for each zone's escalation notifications
- [ ] Confirm whether CNCAN requires digital signature on audit exports (beyond SHA-256 hash chain)
- [ ] Nuclear site: does cernavodă deployment use RPi4 or Jetson Nano? (affects memory budget)

## Blockers
None. W19 ThreatIntelPicture interface is stable.

## Test Infrastructure Status
- Existing suite: 2939 tests GREEN (confirmed 2026-03-26)
- W20 test files: NOT YET WRITTEN
- Node version on sentinel nodes: confirmed Node 20 LTS

## Git State
- Branch: main
- Last W20 commit: none (docs not yet committed)
- Files to commit next: all 20 docs in docs/waves/W20/

## Context for Next Session
```
W20 scope: 8 FRs, 96 tests, src/workflow/
TDD RED first — write ALL 96 tests before any implementation
Tests use Node --test (CJS format, .test.cjs extension)
No new npm deps — node:crypto, node:events only
Clock injection: all tests use clockFn: () => number
Fixtures module: infra/__tests__/sentinel-w20-fixtures.cjs (create alongside tests)
```
