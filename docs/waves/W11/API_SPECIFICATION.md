# APEX-SENTINEL W11 — API Specification

**Wave:** W11
**Date:** 2026-03-26

---

## OsintCorrelationEngine

```typescript
correlate(detection: DetectionEvent, osintEvents: OsintEvent[]): OsintCorrelationResult
```
- Filters osintEvents within 50km (haversine)
- Applies temporal weight: 0-6h → 1.0, 6-24h → 0.5, >24h → 0.0
- Applies Goldstein weight: < -5 → 3×
- Returns: `{ correlatedEvents, temporalWeight, spatialDensity }`

---

## AnomalyCorrelationEngine

```typescript
detectAnomalies(events: DetectionEvent[]): AnomalyResult[]
```
- Returns array of anomalies found in the event stream
- Each: `{ anomalyType, confidence, correlatedSources, ts }`
- anomalyType: `transponder_off_pattern` | `unusual_flight_path` | `altitude_drop_terminal`

---

## ThreatTimelineBuilder

```typescript
addEntry(entry: TimelineEntry): void
getRecentTimeline(windowMs: number): TimelineEntry[]
getEscalationVelocity(): number
```
- `getRecentTimeline`: returns entries within last windowMs, sorted ascending by ts
- `getEscalationVelocity`: returns severity change per minute (can be negative for de-escalation)

---

## SectorThreatMap

```typescript
update(detection: DetectionEvent): void
decay(nowMs?: number): void
getHotspots(minCount: number): GridCell[]
getCell(lat: number, lon: number): GridCell | null
```
- `update`: increments threat count for grid cell covering detection lat/lon
- `decay`: applies exponential decay based on elapsed time since last update
- `getHotspots`: returns all cells with decayed threatCount >= minCount

---

## IntelligencePackBuilder

```typescript
build(context: IntelPackContext): IntelBrief
```
- `context`: `{ awningLevel, detections, osintEvents, timelineWindow }`
- Returns full IntelBrief with human-readable summary

---

## MultiSourceConfidenceAggregator

```typescript
combine(sources: SourceBelief[]): CombinedBelief
```
- `SourceBelief`: `{ source: string, belief: number, plausibility: number }`
- Returns: `{ combined: number | null, plausibility: number | null, conflict: number }`
- If conflict > 0.5: `{ combined: null, plausibility: null, conflict }`

---

## AlertDeduplicationEngine

```typescript
shouldAlert(alert: AlertInput): boolean
getAlertHistory(windowMs: number): AlertRecord[]
```
- `alert`: `{ droneType, awningLevel, sector, ts }`
- Returns false if same key seen within 5-minute bucket

---

## IntelligencePipelineOrchestrator

```typescript
start(): void
stop(): void
getLastBrief(): IntelBrief | null
forcePublish(): void
```
- `start`: subscribes to NATS subjects, starts 60s publish timer
- `stop`: unsubscribes, clears timer
- `forcePublish`: used for AWNING RED immediate publish
