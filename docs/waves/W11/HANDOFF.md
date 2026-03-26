# APEX-SENTINEL W11 — Handoff Document

**Wave:** W11
**Date:** 2026-03-26

---

## Summary

W11 delivers 8 intelligence fusion components in `src/intel/`. The system can now correlate OSINT events with detections, detect ADS-B anomalies, build threat timelines, maintain a geographic threat heatmap, assemble full IntelBriefs, fuse multi-source confidence using Dempster-Shafer, deduplicate operator alerts, and orchestrate the entire pipeline via NATS.

---

## What Was Built

| Component | Location | Description |
|-----------|----------|-------------|
| OsintCorrelationEngine | src/intel/osint-correlation-engine.ts | Haversine + temporal + Goldstein weighting |
| AnomalyCorrelationEngine | src/intel/anomaly-correlation-engine.ts | Transponder-off + terminal dive detection |
| ThreatTimelineBuilder | src/intel/threat-timeline-builder.ts | Temporal event aggregation + velocity |
| SectorThreatMap | src/intel/sector-threat-map.ts | 0.1° grid + exponential decay |
| IntelligencePackBuilder | src/intel/intelligence-pack-builder.ts | Full IntelBrief assembly |
| MultiSourceConfidenceAggregator | src/intel/multi-source-confidence-aggregator.ts | D-S combination rule |
| AlertDeduplicationEngine | src/intel/alert-deduplication-engine.ts | 5-min window dedup, 500-entry ring |
| IntelligencePipelineOrchestrator | src/intel/intelligence-pipeline-orchestrator.ts | NATS subscriber/publisher, 60s periodic |

---

## Key Integration Points

- Orchestrator subscribes to: `awning.alert`, `feed.fused`, `detection.enriched`
- Orchestrator publishes to: `intel.brief`
- All components independently testable — NATS injected via interface

---

## Known Limitations / W12 Work

- IntelBriefs not persisted (in-memory only)
- D-S fusion pairwise only (no joint multi-source)
- SectorThreatMap state not distributed across nodes
- Anomaly detection is rule-based (no ML scoring yet)

---

## How to Run Tests

```bash
cd /Users/nico/projects/apex-sentinel
npx vitest run tests/intel/
```
