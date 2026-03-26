# APEX-SENTINEL W11 — Implementation Plan

**Wave:** W11
**Date:** 2026-03-26

---

## Execution Order

### Phase 1: TDD RED (tests before implementation)

Write all 8 test files in order. Each imports from `../../src/intel/*.js` — these don't exist yet so all tests fail at import.

1. `tests/intel/FR-W11-01-osint-correlation.test.ts`
2. `tests/intel/FR-W11-02-anomaly-correlation.test.ts`
3. `tests/intel/FR-W11-03-threat-timeline.test.ts`
4. `tests/intel/FR-W11-04-sector-threat-map.test.ts`
5. `tests/intel/FR-W11-05-intelligence-pack.test.ts`
6. `tests/intel/FR-W11-06-confidence-aggregator.test.ts`
7. `tests/intel/FR-W11-07-alert-dedup.test.ts`
8. `tests/intel/FR-W11-08-intel-pipeline.test.ts`

Commit: `test(intel): W11 TDD RED — 100+ failing tests`

### Phase 2: Execute (implement to make tests GREEN)

Implement in dependency order (leaf nodes first):

1. `src/intel/osint-correlation-engine.ts` — pure function, no deps
2. `src/intel/anomaly-correlation-engine.ts` — pure function, no deps
3. `src/intel/multi-source-confidence-aggregator.ts` — pure function, no deps
4. `src/intel/alert-deduplication-engine.ts` — ring buffer, no deps
5. `src/intel/threat-timeline-builder.ts` — in-memory state, no deps
6. `src/intel/sector-threat-map.ts` — in-memory state, no deps
7. `src/intel/intelligence-pack-builder.ts` — depends on 1, 5, 6
8. `src/intel/intelligence-pipeline-orchestrator.ts` — depends on 1, 2, 5, 6, 7, 4

### Phase 3: Checkpoint

- `npx vitest run 2>&1 | tail -5`
- `npx tsc --noEmit`
- `npx vitest run --coverage 2>&1 | grep -E "All files|src/intel"`

---

## Time Estimates

| FR | Complexity | Estimate |
|----|-----------|----------|
| FR-01 OsintCorrelation | Medium (haversine) | 20 min |
| FR-02 AnomalyCorrelation | Low | 15 min |
| FR-03 ThreatTimeline | Low | 15 min |
| FR-04 SectorThreatMap | Medium (decay) | 20 min |
| FR-05 IntelPack | Medium (aggregation) | 20 min |
| FR-06 D-S Aggregator | High (algorithm) | 25 min |
| FR-07 AlertDedup | Low | 15 min |
| FR-08 Orchestrator | High (NATS integration) | 30 min |
