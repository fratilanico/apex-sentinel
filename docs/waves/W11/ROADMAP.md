# APEX-SENTINEL W11 — Roadmap

**Wave:** W11
**Date:** 2026-03-26

---

## W11 Deliverables (This Wave)

| # | Component | Status |
|---|-----------|--------|
| 1 | OsintCorrelationEngine | PLANNED |
| 2 | AnomalyCorrelationEngine | PLANNED |
| 3 | ThreatTimelineBuilder | PLANNED |
| 4 | SectorThreatMap | PLANNED |
| 5 | IntelligencePackBuilder | PLANNED |
| 6 | MultiSourceConfidenceAggregator | PLANNED |
| 7 | AlertDeduplicationEngine | PLANNED |
| 8 | IntelligencePipelineOrchestrator | PLANNED |
| 9 | 20 Wave docs | PLANNED |
| 10 | ≥100 tests GREEN | PLANNED |

---

## W12 Preview — Intelligence Persistence + ML Scoring

- Persist IntelBriefs to Supabase `intel_briefs` table
- Historical heatmap replay via `threat_sectors` snapshots
- Isolation forest anomaly scoring to replace rule-based AnomalyCorrelationEngine
- LSTM trajectory classifier for terminal phase prediction integration

## W13 Preview — Operator Dashboard

- Live IntelBrief feed in web UI
- SectorThreatMap visualisation as interactive heatmap
- Timeline scrubber for historical replay

## W14 Preview — Field Hardening

- Edge deployment of OsintCorrelationEngine on RPi4 (offline GDELT cache)
- Low-bandwidth IntelBrief serialisation (CBOR)
- Mesh distribution of SectorThreatMap state via gossip protocol
