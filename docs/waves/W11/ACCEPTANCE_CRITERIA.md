# APEX-SENTINEL W11 — Acceptance Criteria

**Wave:** W11
**Date:** 2026-03-26

---

## FR-W11-01: OsintCorrelationEngine

- AC-01-01: Events within 50km of detection are included in correlatedEvents
- AC-01-02: Events beyond 50km are excluded
- AC-01-03: Events in last 6h have temporalWeight 1.0
- AC-01-04: Events 6-24h old have temporalWeight 0.5
- AC-01-05: Events >24h old are excluded (weight 0)
- AC-01-06: Goldstein < -5 events receive 3× weight multiplier
- AC-01-07: spatialDensity reflects count of correlated events

## FR-W11-02: AnomalyCorrelationEngine

- AC-02-01: Aircraft present (acoustic/remoteID) + no ADS-B → transponder_off_pattern
- AC-02-02: altFt drop >500ft in <30s → altitude_drop_terminal
- AC-02-03: Confidence between 0 and 1
- AC-02-04: correlatedSources lists which signals triggered the anomaly
- AC-02-05: No anomaly returned when evidence insufficient

## FR-W11-03: ThreatTimelineBuilder

- AC-03-01: addEntry stores entry
- AC-03-02: getRecentTimeline(windowMs) returns only entries within window
- AC-03-03: Results sorted ascending by ts
- AC-03-04: getEscalationVelocity() returns positive on escalation
- AC-03-05: getEscalationVelocity() returns negative on de-escalation

## FR-W11-04: SectorThreatMap

- AC-04-01: update() increments count for correct 0.1° grid cell
- AC-04-02: decay() halves count after 15 minutes
- AC-04-03: getHotspots(N) returns only cells with count ≥ N
- AC-04-04: dominantDroneType reflects most recent drone type in cell
- AC-04-05: Zero-count cells not returned by getHotspots

## FR-W11-05: IntelligencePackBuilder

- AC-05-01: threatLevel RED when AWNING RED in last 5 min
- AC-05-02: activeSectors includes cells with threatCount > 0 in last 30 min
- AC-05-03: osintSummary is non-empty string
- AC-05-04: summary uses box-drawing chars for Telegram formatting
- AC-05-05: ts is valid ISO-8601

## FR-W11-06: MultiSourceConfidenceAggregator

- AC-06-01: Two agreeing sources → combined > 0
- AC-06-02: Conflicting sources (conflict > 0.5) → combined: null
- AC-06-03: Single source → passthrough
- AC-06-04: Combined belief ≤ plausibility
- AC-06-05: conflict value between 0 and 1

## FR-W11-07: AlertDeduplicationEngine

- AC-07-01: First alert → shouldAlert returns true
- AC-07-02: Same (type, level, sector) within 5 min → shouldAlert returns false
- AC-07-03: Same after 5 min → shouldAlert returns true
- AC-07-04: getAlertHistory returns entries within window
- AC-07-05: Buffer never exceeds 500 entries

## FR-W11-08: IntelligencePipelineOrchestrator

- AC-08-01: start() subscribes to awning.alert, feed.fused, detection.enriched
- AC-08-02: AWNING RED triggers immediate intel.brief publish
- AC-08-03: intel.brief published every 60s
- AC-08-04: stop() stops publish timer
- AC-08-05: getLastBrief() returns last published brief
