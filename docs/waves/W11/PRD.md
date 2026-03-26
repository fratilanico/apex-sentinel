# APEX-SENTINEL W11 — Product Requirements Document
## OSINT Deep Fusion + Multi-Source Threat Correlation

**Wave:** W11
**Status:** PLANNED
**Date:** 2026-03-26

---

## 1. Product Goal

Deliver a real-time intelligence fusion layer that correlates OSINT events, ADS-B anomalies, acoustic detections, and AWNING alerts into a composite IntelBrief. Operators receive a single, deduplicated, human-readable threat picture every 60 seconds (or immediately on AWNING RED).

---

## 2. User Stories

| ID | Role | Need | Acceptance Criterion |
|----|------|------|----------------------|
| US-01 | Operator | Know if OSINT context is elevated near a detection | OsintCorrelationEngine returns spatialDensity > 0 for events within 50km |
| US-02 | Operator | Detect aircraft going dark near acoustic detection | AnomalyCorrelationEngine flags transponder_off_pattern |
| US-03 | Analyst | Review threat timeline over last N minutes | ThreatTimelineBuilder.getRecentTimeline(N) returns sorted list |
| US-04 | Analyst | Identify geographic hotspots | SectorThreatMap.getHotspots(N) returns cells above count threshold |
| US-05 | Commander | Receive comprehensive intel brief | IntelligencePackBuilder produces IntelBrief every 60s |
| US-06 | Analyst | Fuse confidence from 4 independent sensors | MultiSourceConfidenceAggregator returns D-S combined belief |
| US-07 | Operator | Avoid duplicate Telegram alerts | AlertDeduplicationEngine suppresses same (type, level, sector) within 5 min |
| US-08 | System | Route all events through unified pipeline | IntelligencePipelineOrchestrator wires NATS → intel.brief |

---

## 3. Functional Requirements Summary

| FR | Component | Priority |
|----|-----------|----------|
| FR-W11-01 | OsintCorrelationEngine | P0 |
| FR-W11-02 | AnomalyCorrelationEngine | P0 |
| FR-W11-03 | ThreatTimelineBuilder | P0 |
| FR-W11-04 | SectorThreatMap | P0 |
| FR-W11-05 | IntelligencePackBuilder | P1 |
| FR-W11-06 | MultiSourceConfidenceAggregator | P1 |
| FR-W11-07 | AlertDeduplicationEngine | P1 |
| FR-W11-08 | IntelligencePipelineOrchestrator | P2 |

---

## 4. Non-Functional Requirements

- **Latency**: IntelBrief must be assembled in < 100ms from inputs
- **Memory**: AlertDeduplicationEngine ring buffer ≤ 500 entries
- **Throughput**: SectorThreatMap handles 1000 updates/s
- **Reliability**: No single component failure crashes pipeline — errors caught and logged
- **Testability**: All components independently unit-testable (no NATS required for unit tests)

---

## 5. Out of Scope for W11

- Persistent storage of IntelBriefs (W12)
- ML-based threat scoring (W12)
- Live Telegram push integration (uses existing W8 output layer)
- UI dashboard updates (W13)
