# W9 — AI_PIPELINE
Wave 9: Live Data Feed Integration | APEX-SENTINEL | 2026-03-26

---

## Overview

W9 introduces the ThreatContextEnricher — a deterministic correlation engine that attaches multi-source feed context to every detection event. No ML model is used in W9. The architecture is designed so W13 can replace the deterministic scorer with a trained Fusion layer without changing the interface contract.

---

## ThreatContextEnricher Correlation Logic

**Trigger:** Every `detection.*` NATS event published by the existing acoustic/RF pipeline.

**SLA:** Context must be fetched and published as `detection.enriched` within 200ms of receiving the detection event.

**Input contract:**
```typescript
interface DetectionEvent {
  detection_id: string;
  node_id: string;
  lat: number;
  lon: number;
  ts: number;            // Unix ms
  classification: string;
  confidence: number;
}
```

**Output contract:**
```typescript
interface EnrichedDetectionEvent {
  detection_id: string;
  node_id: string;
  ts: number;
  context: ThreatContext;
  context_score: number; // 0-100
}

interface ThreatContext {
  nearest_aircraft_km: number | null;
  active_alert_overlap: boolean;
  alert_level: 'NONE' | 'WHITE' | 'YELLOW' | 'RED';
  visibility_m: number | null;
  wind_speed_ms: number | null;
  acoustic_range_adjustment_pct: number;  // +/- % based on visibility
  osint_events_15min: number;
  remote_id_beacons_500m: number;
}
```

---

## Five Context Signals

### Signal A: Nearest Aircraft Distance (km)

**Source:** Last 60s of `feed.fused` — filter entries where `type === 'adsb'`.

**Computation:** For each aircraft aggregate snapshot in range, compute Haversine distance from detection lat/lon to bounding box centroid of the querying node. Return minimum distance across all snapshots with `aircraft_count > 0`.

**Null:** If no ADS-B data received in last 60s (feed down or no aircraft), return null.

**Weight in context score:** Part of ADS-B anomaly component (30%).

---

### Signal B: Active Alert Overlap

**Source:** `feed_alerts_active` table — WHERE valid_until > now() OR valid_until IS NULL.

**Computation:** For each active alert, test if detection point (lat, lon) falls within `area_geojson` polygon using PostGIS `ST_Within` or equivalent turf.js point-in-polygon in TypeScript.

**Output:** `active_alert_overlap: boolean`, `alert_level: string` (highest level if multiple polygons match).

**CAP level mapping:**

| alerts.in.ua level | AWNING level |
|---|---|
| air_raid | RED |
| artillery_shelling | RED |
| urban_fights | RED |
| chemical | RED |
| nuclear | RED |
| general_threat | YELLOW |
| partial_cover | WHITE |
| all_clear (implicit: no alert) | NONE |

**Weight in context score:** 40%.

---

### Signal C: Weather Context

**Source:** Last `feed_weather_snapshots` row for the detection's node_id.

**Computation:**

Acoustic detection range is affected by atmospheric conditions:

```
if visibility_m >= 10000: acoustic_range_adjustment_pct = 0
if 5000 <= visibility_m < 10000: acoustic_range_adjustment_pct = -10
if 1000 <= visibility_m < 5000:  acoustic_range_adjustment_pct = -25
if visibility_m < 1000:          acoustic_range_adjustment_pct = -50

Wind effect (at detection node):
if wind_speed_ms > 10: add further -15% (wind noise floor raised)
if wind_speed_ms > 20: add further -15% (total up to -30% wind penalty)
```

Weather does not contribute directly to context_score — it modifies the confidence of other signals by adjusting acoustic_range_adjustment_pct.

---

### Signal D: OSINT Event Count (15-minute window)

**Source:** `feed_osint_events` WHERE bbox_key matches the detection's geographic region AND ts >= now() - interval '15 minutes'.

**Computation:** SUM(event_count) across matching rows in window. Return 0 if no rows.

**Weight in context score:** 10%.

---

### Signal E: Remote ID Beacons (500m radius)

**Source:** In-memory buffer maintained by DataFeedBroker from `feed.rf.remote_id` NATS messages (last 10s).

**Computation:** Count beacons where coarsened operator lat/lon is within 500m Haversine of detection lat/lon.

**Weight in context score:** 20%.

---

## Context Score Formula

```
context_score = clamp(
  (alert_score * 0.40) +
  (adsb_score  * 0.30) +
  (rf_score    * 0.20) +
  (osint_score * 0.10),
  0, 100
)
```

### Component Scoring

**alert_score (0-100):**
- NONE: 0
- WHITE: 20
- YELLOW: 60
- RED: 100

**adsb_score (0-100):**
- nearest_aircraft_km === null: 0 (no data)
- aircraft_count === 0, squawk_7500_count === 0: 10 (clear sky)
- squawk_7500_count > 0: 100 (hijack squawk)
- aircraft_count > 0 AND nearest_aircraft_km < 5: 70
- aircraft_count > 0 AND nearest_aircraft_km < 20: 40
- aircraft_count > 0 AND nearest_aircraft_km >= 20: 20
- no_transponder_count > 0: add +20 (uncorrelated air activity)

**rf_score (0-100):**
- remote_id_beacons_500m === 0: 0
- remote_id_beacons_500m === 1: 50
- remote_id_beacons_500m >= 2: 100

**osint_score (0-100):**
- osint_events_15min === 0: 0
- 1-4 events: 30
- 5-9 events: 60
- >= 10 events: 100

---

## W13 ML Integration Path

In W13, the deterministic score formula above will be replaced by a trained classifier that accepts the same `ThreatContext` struct as a feature vector and outputs a probability score [0,1] → multiplied by 100.

The interface contract (`ThreatContext` in, `context_score` out) does not change. The ThreatContextEnricher class will accept a configurable `scorer: (ctx: ThreatContext) => number` function, defaulting to the deterministic implementation.

Training data: `detection_enriched.feed_context_json` rows accumulate from W9 onwards, providing ground-truth context for W13 training.

---

## Performance Budget

| Step | Budget |
|---|---|
| Fetch feed_alerts_active (PostGIS query) | ≤ 30ms |
| Fetch feed_weather_snapshots (indexed lookup) | ≤ 10ms |
| Fetch feed_osint_events (aggregation) | ≤ 20ms |
| In-memory Remote ID beacon count | ≤ 5ms |
| ADS-B from in-memory feed buffer | ≤ 5ms |
| Compute context_score | ≤ 1ms |
| Publish detection.enriched | ≤ 10ms |
| **Total budget** | **≤ 200ms** |
