# APEX-SENTINEL W11 — Functional Requirements Register

**Wave:** W11
**Date:** 2026-03-26

---

| FR ID | Title | Priority | Component | Tests | Status |
|-------|-------|----------|-----------|-------|--------|
| FR-W11-01 | OSINT Correlation Engine | P0 | OsintCorrelationEngine | 12 | PLANNED |
| FR-W11-02 | Anomaly Correlation Engine | P0 | AnomalyCorrelationEngine | 12 | PLANNED |
| FR-W11-03 | Threat Timeline Builder | P0 | ThreatTimelineBuilder | 12 | PLANNED |
| FR-W11-04 | Sector Threat Map | P0 | SectorThreatMap | 12 | PLANNED |
| FR-W11-05 | Intelligence Pack Builder | P1 | IntelligencePackBuilder | 12 | PLANNED |
| FR-W11-06 | Multi-Source Confidence Aggregator | P1 | MultiSourceConfidenceAggregator | 12 | PLANNED |
| FR-W11-07 | Alert Deduplication Engine | P1 | AlertDeduplicationEngine | 12 | PLANNED |
| FR-W11-08 | Intelligence Pipeline Orchestrator | P2 | IntelligencePipelineOrchestrator | 16 | PLANNED |

---

## FR Detail: FR-W11-01

**Input**: DetectionEvent (lat, lon, ts) + OsintEvent[] (lat, lon, ts, goldsteinScale?)
**Output**: `{ correlatedEvents: OsintEvent[], temporalWeight: number, spatialDensity: number }`
**Algorithm**: haversine < 50km AND age-based temporal weight AND goldstein multiplier

## FR Detail: FR-W11-02

**Input**: DetectionEvent[] (array of recent events)
**Output**: AnomalyResult[]
**Anomaly Types**: transponder_off_pattern | unusual_flight_path | altitude_drop_terminal

## FR Detail: FR-W11-03

**Methods**: addEntry(entry), getRecentTimeline(windowMs), getEscalationVelocity()
**Event types**: acoustic_detection | awning_escalation | awning_de-escalation | osint_event | adsb_anomaly

## FR Detail: FR-W11-04

**Grid**: 0.1° resolution (≈11km)
**Decay**: 50% every 15 minutes
**Methods**: update(detection), decay(nowMs?), getHotspots(minCount), getCell(lat, lon)

## FR Detail: FR-W11-05

**Input**: IntelPackContext (awningLevel, detections, osintEvents, timelineWindow)
**Output**: IntelBrief (threatLevel, activeSectors, recentEvents, osintSummary, ts)

## FR Detail: FR-W11-06

**Input**: SourceBelief[] — each `{ source, belief, plausibility }`
**Output**: `{ combined: number|null, plausibility: number|null, conflict: number }`
**Rule**: if conflict > 0.5 → combined: null

## FR Detail: FR-W11-07

**Key**: `${droneType}:${awningLevel}:${gridCell}:${Math.floor(ts / 300000)}`
**Window**: 5 minutes (300,000 ms)
**Buffer**: max 500 entries

## FR Detail: FR-W11-08

**Subscribe**: awning.alert, feed.fused, detection.enriched
**Publish**: intel.brief (every 60s + on AWNING RED)
**Integration**: 5+ E2E scenarios in tests
