# APEX-SENTINEL W11 — Risk Register

**Wave:** W11
**Date:** 2026-03-26

---

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|-----------|
| RR-01 | D-S combination numerical instability (division by near-zero) | Medium | High | Guard: if (1 - K) < 1e-9, treat as irreconcilable (conflict: 1.0) |
| RR-02 | SectorThreatMap grows unbounded | Low | Medium | Cap at 100,000 cells; evict oldest on overflow |
| RR-03 | ThreatTimelineBuilder memory growth | Medium | Medium | Cap timeline at 10,000 entries; evict oldest |
| RR-04 | NATS subscribe not called before events | Medium | High | Unit tests mock subscribe; integration tests verify subscription order |
| RR-05 | Haversine fails at poles (lat ±90°) | Low | Low | Input validation: clamp lat to [-89.9, 89.9] |
| RR-06 | AlertDedup ring overflows 500 | Low | Low | Oldest entry evicted — deterministic behaviour tested |
| RR-07 | Orchestrator timer not cleared on stop() | Medium | Medium | store timer ref, clearInterval in stop() — tested |
| RR-08 | TypeScript strict null checks on gridCell lookup | Medium | Low | Always return GridCell | null from getCell — callers null-check |
