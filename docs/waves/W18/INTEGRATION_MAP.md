# APEX-SENTINEL W18 — INTEGRATION MAP
# EU Data Integration Layer

**Wave:** W18
**Date:** 2026-03-27

This document describes how W18 EU data feed outputs connect to W1–W17 existing engines:
which data fields map to which parameters, what transformations are needed, whether
integration is push (EventEmitter) or pull (polling), and which existing interfaces
need extending.

---

## Data Flow Overview

```
W18 OUTPUT                         → W1-W17 ENGINE THAT CONSUMES IT
──────────────────────────────────────────────────────────────────────────────────────
AircraftState[]                    → W12 RfFusionEngine (ICAO24 correlation)
AircraftState[]                    → W9  RfSessionTracker (ADS-B presence flag)
AircraftState[]                    → W11 ThreatTimelineBuilder (adsb_anomaly events)
NotamRestriction[] (GeoJSON)       → W10 AwningLevelPublisher (airspace status context)
NotamRestriction[] (GeoJSON)       → W10 AwningIntegrationPipeline (zone-breach input)
EasaUasZone[]                      → W10 StageClassifier (adsbCorrelated zone check)
ProtectedZone[]                    → W10 AwningIntegrationPipeline (zone definitions)
ProtectedZone[]                    → W11 SectorThreatMap (sector boundary refinement)
DroneFlightConditions              → W6  AcousticSignatureClassifier (detection range)
DroneFlightConditions              → W6  MonteCarloImpactPropagator (wind → trajectory)
SecurityEvent[]                    → W11 OsintCorrelationEngine (event correlation)
SecurityEvent[]                    → W11 IntelligencePackBuilder (operator briefing)
FeedHealth[]                       → W16 SystemHealthDashboard (0-100 score input)
EuSituationalPicture               → W14 DashboardStateStore (live map state)
EuSituationalPicture               → W14 SseStreamManager (browser push via SSE)
EuSituationalPicture               → W13 TelegramAlertComposer (operator notifications)
```

---

## Connection Details

---

### AircraftState[] → W12 RfFusionEngine

**Source:** `EuDataIntegrationPipeline` emits `'situation:update'` with `EuSituationalPicture.aircraft: AircraftState[]`

**Engine file:** `src/rf2/rf-fusion-engine.ts`

**Integration type:** PUSH (event-driven). `RfFusionEngine` subscribes to `'situation:update'` on the pipeline EventEmitter.

**Data field mapping:**

```typescript
// AircraftState → RfFusionEngine correlation input
// RfFusionEngine does not have a typed Aircraft input interface yet;
// it currently receives raw NATS messages from DataFeedBroker.
// W18 extends this by passing AircraftState[] as a correlation hint.

// Transformation needed:
function toRfCorrelationHint(state: AircraftState): { icao24: string; lat: number; lon: number; ts: number } {
  return {
    icao24: state.icao24,          // RfFusionEngine uses icao24 as dedup key
    lat: state.lat,
    lon: state.lon,
    ts: state.lastContact * 1000,  // OpenSky returns epoch SECONDS; RfFusionEngine expects epoch MS
  };
}
```

**Transformation required:** `lastContact` is epoch **seconds** (OpenSky convention); multiply by 1000 to get epoch ms for all W1–W17 internal interfaces which use ms.

**Interface extension needed:** `RfFusionEngine` currently receives data only via NATS (`DataFeedBroker`). Add a `injectAircraftCorrelation(hints: Array<{icao24: string; lat: number; lon: number; ts: number}>)` method so the EU pipeline can pass hints directly without going through NATS.

---

### AircraftState[] → W9 RfSessionTracker

**Source:** `EuSituationalPicture.aircraft`

**Engine file:** `src/rf2/rf-session-tracker.ts`

**Integration type:** PUSH. `RfSessionTracker` is informed of ADS-B-confirmed aircraft to set `adsbPresent: true` on sessions whose `positionHistory` last point is within 2km of an `AircraftState` lat/lon.

**Data field mapping:**

```typescript
// RfSession uses Position[] (lat, lon, ts) for track history.
// AircraftState provides current position only (no history).
// Match logic: if haversine(session.lastPosition, aircraft) < 2000m → adsbCorrelated = true

interface RfSessionAircraftMatch {
  sessionId: string;
  icao24: string;
  distanceM: number;
}
```

**Transformation required:** Haversine match between `RfSession.positionHistory[last]` and `AircraftState`. No field rename needed; both use `{lat, lon}`.

**Interface extension needed:** `RfSessionTracker` does not currently expose a method to inject aircraft correlation. Add `correlateAircraft(states: AircraftState[]): RfSessionAircraftMatch[]` method that returns matched pairs and sets an internal `adsbPresent` flag per session. This flag is then readable by `AwningIntegrationPipeline` when building `EnrichedDetectionInput`.

---

### AircraftState[] → W11 ThreatTimelineBuilder

**Source:** `EuSituationalPicture.aircraft` — specifically aircraft with anomalous ADS-B characteristics (e.g. `onGround=false` but `altBaro < 50m`, or `squawk='7700'`/`'7600'`/`'7500'`).

**Engine file:** `src/intel/threat-timeline-builder.ts`

**Integration type:** PUSH. Anomalous aircraft trigger a `TimelineEntry` with `eventType: 'adsb_anomaly'`.

**Data field mapping:**

```typescript
// TimelineEntry interface:
// { ts: number; eventType: TimelineEventType; severity: number; summary: string; }

// Transformation:
function aircraftToTimelineEntry(state: AircraftState): TimelineEntry {
  return {
    ts: state.lastContact * 1000,   // seconds → ms
    eventType: 'adsb_anomaly',
    severity: state.squawk === '7700' ? 90        // emergency
             : state.squawk === '7600' ? 70        // radio failure
             : state.squawk === '7500' ? 95        // hijack
             : 40,                                 // generic anomaly
    summary: `ADS-B anomaly: ${state.icao24} callsign=${state.callsign ?? 'UNKNOWN'} ` +
             `squawk=${state.squawk ?? 'n/a'} alt=${state.altBaro ?? 'n/a'}m`,
  };
}
```

**Transformation required:** Squawk code → severity mapping (above). Filter: only aircraft with `squawk` in `['7700','7600','7500']` OR `(altBaro !== null && altBaro < 50 && !onGround)` trigger timeline entries. All others are ignored to avoid flooding the timeline.

**Interface extension needed:** `ThreatTimelineBuilder.addEntry(entry: TimelineEntry)` already exists. No extension needed. W18 simply calls `addEntry()` for each anomalous aircraft.

---

### NotamRestriction[] → W10 AwningLevelPublisher

**Source:** `EuSituationalPicture.activeNotams`

**Engine file:** `src/nato/awning-level-publisher.ts`

**Integration type:** PULL. `AwningLevelPublisher.deriveLevel()` accepts `contextScore` and optional `civilProtectionLevel`. W18 augments the `contextScore` computation by adding +15 to context score when a drone is detected within the bounding box of an active NOTAM restriction.

**Data field mapping:**

```typescript
// Current AwningLevelPublisher.deriveLevel signature:
// deriveLevel(contextScore: number, civilProtectionLevel?: string): AwningLevel

// W18 contribution: a helper in EuDataIntegrationPipeline computes notam context bonus:
function computeNotamContextBonus(
  droneLat: number, droneLon: number,
  activeNotams: NotamRestriction[]
): number {
  // Returns 15 if drone position is inside any active NOTAM polygon, else 0.
  // Point-in-polygon using the same ray-casting used in EasaUasZoneLoader.
  const inside = activeNotams.some(n => pointInPolygon([droneLon, droneLat], n.geometry));
  return inside ? 15 : 0;
}
```

**Transformation required:** GeoJSON `Polygon` from `NotamRestriction.geometry` → point-in-polygon test using the same ray-casting utility implemented in `EasaUasZoneLoader`. The utility function should be extracted to `src/geo/point-in-polygon.ts` and shared between both modules.

**Interface extension needed:** `AwningLevelPublisher.deriveLevel()` signature does not change. W18 modifies the `contextScore` **before** passing it to `deriveLevel`, not inside the publisher.

---

### NotamRestriction[] → W10 AwningIntegrationPipeline

**Source:** `EuSituationalPicture.activeNotams`

**Engine file:** `src/nato/awning-integration-pipeline.ts`

**Integration type:** PUSH. `AwningIntegrationPipeline` processes `EnrichedDetectionInput`. W18 augments the `EnrichedDetectionInput.adsbCorrelated` flag: if the detected drone's position falls within an active NOTAM restricted zone, `adsbCorrelated` is forced `true` (presence in a NOTAM zone implies significant airspace context regardless of ADS-B transponder presence).

**Data field mapping:**

```typescript
// EnrichedDetectionInput (existing W10 interface):
interface EnrichedDetectionInput {
  contextScore: number;
  acousticConfidence: number;
  rfFingerprintMatch: boolean;
  adsbCorrelated: boolean;        // ← W18 can set this to true via NOTAM zone check
  remoteIdWithin500m: boolean;
  civilProtectionLevel?: string;
  droneType: string;
  positions: PositionFix[];
}
```

**Transformation required:** None beyond the NOTAM zone check described above. The `notam_zone_breach` flag feeds into `adsbCorrelated` as an alias — both represent "known airspace activity at this location".

**Interface extension needed:** None. `EnrichedDetectionInput` is already the right shape.

---

### EasaUasZone[] → W10 StageClassifier

**Source:** `EuSituationalPicture.uasZones`

**Engine file:** `src/nato/stage-classifier.ts`

**Integration type:** PULL (computed before each classification call).

**Data field mapping:**

```typescript
// Current StageClassifier.DetectionInput:
interface DetectionInput {
  acousticConfidence: number;
  rfFingerprintMatch: boolean;
  adsbCorrelated: boolean;        // ← W18 augments this
  remoteIdWithin500m: boolean;
}

// W18 logic: before calling StageClassifier.classify(input), check if
// the drone position falls within a PROHIBITED or RESTRICTED EasaUasZone.
// If yes, set adsbCorrelated = true (airspace context = confirmed).
function enrichWithUasZones(
  input: DetectionInput,
  droneLat: number, droneLon: number,
  zones: EasaUasZone[]
): DetectionInput {
  const inProhibitedZone = zones
    .filter(z => z.category === 'PROHIBITED' || z.category === 'RESTRICTED')
    .some(z => pointInPolygon([droneLon, droneLat], z.geometry));
  return { ...input, adsbCorrelated: input.adsbCorrelated || inProhibitedZone };
}
```

**Transformation required:** Same point-in-polygon utility as NOTAM integration (share `src/geo/point-in-polygon.ts`).

**Interface extension needed:** `StageClassifier.classify()` signature does not change. The enrichment happens at the callsite in `AwningIntegrationPipeline` before calling `classify()`.

---

### ProtectedZone[] → W10 AwningIntegrationPipeline

**Source:** `EuSituationalPicture.protectedZones`

**Engine file:** `src/nato/awning-integration-pipeline.ts`

**Integration type:** PUSH (injected at pipeline initialisation).

**Data field mapping:**

```typescript
// ProtectedZone provides centre + radius.
// AwningIntegrationPipeline currently uses hardcoded zone checks via CivilProtectionClient.
// W18 replaces the hardcoded zone list with the dynamic ProtectedZone[] from FR-W18-05.

// Transformation: ProtectedZone → internal zone check
function isInsideProtectedRadius(
  droneLat: number, droneLon: number,
  zone: ProtectedZone
): boolean {
  return haversineM(droneLat, droneLon, zone.lat, zone.lon) <= zone.exclusionRadiusM;
}
```

**Interface extension needed:** `AwningIntegrationPipeline` currently calls `CivilProtectionClient` for zone data. Add `setProtectedZones(zones: ProtectedZone[])` method that stores the zone list; the existing `CivilProtectionClient` call is retained as a fallback when this method has not been called. This is a backwards-compatible extension.

---

### ProtectedZone[] → W11 SectorThreatMap

**Source:** `EuSituationalPicture.protectedZones`

**Engine file:** `src/intel/sector-threat-map.ts`

**Integration type:** PULL (queried when building sector summaries).

**Data field mapping:**

```typescript
// SectorThreatMap uses 0.1° grid cells (GridCell: gridLat, gridLon, threatCount).
// W18 adds zone awareness: GridCells that overlap a ProtectedZone radius are tagged
// as 'sensitive', causing their threatCount to be reported with higher weight in
// IntelligencePackBuilder.

// New method on SectorThreatMap:
// markSensitiveZones(zones: ProtectedZone[]): void
// Marks grid cells whose centre is within zone.exclusionRadiusM of zone.lat/lon.
// Sensitive cells get a multiplier of 1.5 applied to their threatCount in getSummary().
```

**Transformation required:** `ProtectedZone` (centre + radius) → grid cell identification. For each zone, compute which 0.1° grid cells have their centre within `exclusionRadiusM` using haversine. This set of cells is stored as a `Set<string>` of cell keys (`${gridLat.toFixed(1)}:${gridLon.toFixed(1)}`).

**Interface extension needed:** Add `markSensitiveZones(zones: ProtectedZone[]): void` and `isSensitiveCell(gridLat: number, gridLon: number): boolean` to `SectorThreatMap`. No changes to existing `addEvent()` or `getSummary()`.

---

### DroneFlightConditions → W6 AcousticSignatureClassifier

**Source:** `EuSituationalPicture.atmosphericConditions`

**Engine file:** `src/acoustic/` (AcousticSignatureClassifier — the YAMNet-based classifier)

**Integration type:** PULL (atmospheric conditions are read before each classification window).

**Data field mapping:**

```typescript
// AcousticSignatureClassifier currently does not account for atmospheric attenuation.
// W18 injects a detection range modifier:
//   - visibility_m < 1000m (fog/rain): acoustic attenuation increases, effective range drops 30%
//   - wind_ms > 7m/s: wind noise raises noise floor, confidence threshold increases by 0.1

// Proposed extension to AcousticSignatureClassifier:
interface AtmosphericContext {
  visibility_m: number;
  wind_ms: number;
}

// setAtmosphericContext(ctx: AtmosphericContext): void
// Stores ctx; applied as a post-processing confidence adjustment per classification.
// confidence_adjusted = confidence × (visibility_m < 1000 ? 0.7 : 1.0)
//                                  × (wind_ms > 7 ? 0.85 : 1.0)
```

**Transformation required:** `DroneFlightConditions` → `AtmosphericContext` (subset of fields). No field rename needed.

**Interface extension needed:** Add `setAtmosphericContext(ctx: AtmosphericContext): void` to `AcousticSignatureClassifier`. This is optional for W18 — can be deferred to a W19 acoustic improvement if W18 timeline is tight. Mark as `TODO(W18): atmospheric_context_injection` in the classifier.

---

### DroneFlightConditions → W6 MonteCarloImpactPropagator

**Source:** `EuSituationalPicture.atmosphericConditions`

**Engine file:** `src/prediction/` (MonteCarloImpactPropagator — trajectory propagation)

**Integration type:** PULL.

**Data field mapping:**

```typescript
// MonteCarloImpactPropagator uses wind to compute drift in trajectory predictions.
// Currently uses a fixed wind assumption.
// W18 provides live wind_ms and heading from AtmosphericConditionProvider.

// Wind vector decomposition:
// W18 provides scalar wind_ms (speed at 10m) but not wind direction.
// open-meteo provides wind_direction_10m (degrees). Add this field to DroneFlightConditions.

// Extended DroneFlightConditions (W18 adds):
// windDirectionDeg: number;   // degrees, meteorological convention (270=westerly)

// MonteCarloImpactPropagator.setWindConditions(speedMs: number, directionDeg: number): void
// Decomposes into (u, v) components for the propagation model.
```

**Transformation required:** `windDirectionDeg` must be added to `DroneFlightConditions` interface (meteorological convention: 270° = wind from the west, blowing east). Decompose to `u = -speed × sin(dir_rad)`, `v = -speed × cos(dir_rad)` for the propagation vector.

**Interface extension needed:** `DroneFlightConditions` gains `windDirectionDeg: number`. `MonteCarloImpactPropagator.setWindConditions()` — new method.

---

### SecurityEvent[] → W11 OsintCorrelationEngine

**Source:** `EuSituationalPicture.securityEvents`

**Engine file:** `src/intel/osint-correlation-engine.ts`

**Integration type:** PUSH (events injected per cycle).

**Data field mapping:**

```typescript
// OsintCorrelationEngine.OsintEvent:
interface OsintEvent {
  lat: number;
  lon: number;
  ts: number;
  goldsteinScale?: number;   // conflict intensity; negative = more violent
  eventType?: string;
}

// SecurityEvent → OsintEvent transformation:
function securityEventToOsint(event: SecurityEvent): OsintEvent {
  return {
    lat: event.lat,
    lon: event.lon,
    ts: event.ts,
    goldsteinScale: event.source === 'acled'
      ? acledGoldsteinFromEventType(event.eventType)   // map ACLED categories to Goldstein scale
      : event.source === 'firms'
      ? -3                                             // thermal anomaly = moderate severity
      : -1,                                            // GDELT generic
    eventType: event.eventType,
  };
}
```

**Transformation required:** `SecurityEvent.source` → Goldstein scale approximation. ACLED categories map: `'Battles' → -8`, `'Explosions/Remote violence' → -9`, `'Protests' → 2`, `'Riots' → -3`. FIRMS thermal anomalies approximate `−3` (property damage potential). GDELT events approximate `−1`.

**Interface extension needed:** None. `OsintCorrelationEngine.correlate(detection, osintEvents)` already accepts `OsintEvent[]`. W18 maps `SecurityEvent[]` to `OsintEvent[]` at the callsite.

---

### SecurityEvent[] → W11 IntelligencePackBuilder

**Source:** `EuSituationalPicture.securityEvents`

**Engine file:** `src/intel/intelligence-pack-builder.ts`

**Integration type:** PUSH (per-cycle update before `buildBrief()` is called).

**Data field mapping:**

```typescript
// IntelPackContext (existing):
interface IntelPackContext {
  awningLevel: AwningLevel;
  awningTs: number;
  detections: IntelPackDetection[];
  osintEvents: OsintEvent[];    // ← W18 populates this via SecurityEvent→OsintEvent mapping
  timelineWindow: number;
}

// W18 contribution: security events are mapped to OsintEvent[] (same transformation
// as above for OsintCorrelationEngine) and set on IntelPackContext.osintEvents.
// IntelBrief.osintSummary is then generated by IntelligencePackBuilder from this data.
```

**Transformation required:** Same `securityEventToOsint()` function as above. The function should be in `src/feeds/eu-data-integration-pipeline.ts` (or a shared `src/geo/security-event-mapper.ts` utility).

**Interface extension needed:** None. `IntelligencePackBuilder` already accepts `OsintEvent[]` in `IntelPackContext`.

---

### FeedHealth[] → W16 SystemHealthDashboard

**Source:** `EuDataIntegrationPipeline.getFeedHealth()` — returns `FeedHealth[]` from `EuDataFeedRegistry`

**Engine file:** `src/system/system-health-dashboard.ts`

**Integration type:** PULL (dashboard queries feed health on each health report cycle, every 30s).

**Data field mapping:**

```typescript
// SystemHealthDashboard uses FeedClientStatus[] for feed health scoring:
interface FeedClientStatus {
  name: string;
  status: ComponentStatusLevel;   // 'online' | 'degraded' | 'offline'
}

// FeedHealth → FeedClientStatus transformation:
function feedHealthToClientStatus(fh: FeedHealth): FeedClientStatus {
  return {
    name: fh.feedId,
    status: fh.status === 'healthy' ? 'online'
           : fh.status === 'degraded' ? 'degraded'
           : 'offline',
  };
}

// Scoring impact (existing W16 deduction rules):
// offline feed client: -20 per client
// W18 has 7 feeds → up to -140 pts from feeds alone (but score floors at 0)
// Tier-1 feeds (AircraftPositionAggregator, EuDataIntegrationPipeline) carry highest weight
```

**Transformation required:** `FeedHealth.status` (`'healthy'|'degraded'|'down'`) → `ComponentStatusLevel` (`'online'|'degraded'|'offline'`). Simple string map as above.

**Interface extension needed:** `SystemHealthDashboard` already accepts `FeedClientStatus[]` via `setFeedClients()` (from W16). No new method needed. W18 calls `setFeedClients(feedHealth.map(feedHealthToClientStatus))` on each health cycle.

---

### EuSituationalPicture → W14 DashboardStateStore

**Source:** `EuDataIntegrationPipeline` emits `'situation:update'`

**Engine file:** `src/dashboard/dashboard-state-store.ts`

**Integration type:** PUSH (event subscription).

**Data field mapping:**

```typescript
// DashboardStateStore accepts DashboardEvent:
type DashboardEvent =
  | { type: 'awning_update'; level: AwningLevel; reason: string }
  | { type: 'detection'; detection: SerializedDetection }
  | { type: 'intel_brief'; brief: IntelBrief }
  | { type: 'node_health'; nodeId: string; stats: Record<string, unknown> };

// W18 adds a new event type for situational picture updates:
// { type: 'situation_update'; picture: EuSituationalPicture }
// This requires a DashboardEvent union extension.

// Alternatively (no interface change needed):
// Translate EuSituationalPicture into multiple existing events:
//   - For each aircraft with anomalous squawk → emit 'detection' event
//   - For each SecurityEvent near a protected zone → emit 'intel_brief' event
//   - Feed health summary → emit 'node_health' events per feed
```

**Transformation required (preferred — no interface change):**
1. Anomalous `AircraftState` entries (squawk 7700/7600/7500 or low-altitude) → `SerializedDetection` → `{ type: 'detection', detection }`.
2. `EuSituationalPicture.atmosphericConditions.flyabilityScore < 30` → `{ type: 'node_health', nodeId: 'eu_weather', stats: { flyabilityScore, wind_ms, visibility_m } }`.

**Interface extension needed (recommended):** Add `{ type: 'situation_update'; picture: EuSituationalPicture }` to the `DashboardEvent` union in `dashboard-state-store.ts`. This allows the dashboard UI to render a live EU picture overlay without awkward per-event mapping.

---

### EuSituationalPicture → W14 SseStreamManager

**Source:** `DashboardStateStore` → `SseStreamManager` (existing W14 event chain)

**Engine file:** `src/dashboard/sse-stream-manager.ts`

**Integration type:** PUSH (existing `broadcast()` mechanism).

**Data field mapping:**

```typescript
// SseStreamManager.broadcast(eventType: SseEventType, data: unknown): void
// Current SseEventType: 'awning_update' | 'detection' | 'intel_brief' | 'node_health' | 'heartbeat'

// W18 adds: 'situation_update' to SseEventType
// Broadcast payload: EuSituationalPicture (JSON serializable)

// Browser SSE client receives:
// event: situation_update
// data: {"ts":1711500000000,"aircraft":[...],"activeNotams":[...],...}
```

**Transformation required:** `EuSituationalPicture` must be JSON-serializable. All fields use primitive types or plain objects — no issue. Ensure `DroneFlightConditions.source` enum is a string (it is).

**Interface extension needed:** Add `'situation_update'` to the `SseEventType` union in `sse-stream-manager.ts`. One-line change.

---

### EuSituationalPicture → W13 TelegramAlertComposer

**Source:** `EuDataIntegrationPipeline` emits `'pipeline:error'` or anomalous `EuSituationalPicture`

**Engine file:** `src/operator/telegram-alert-composer.ts`

**Integration type:** PUSH (event subscription on specific conditions).

**Data field mapping:**

```typescript
// TelegramAlertComposer formats Telegram MarkdownV2 messages.
// W18 triggers Telegram notifications in two cases:

// Case 1: pipeline:error (catastrophic degradation — 4+ feeds down)
// → compose a SITREP message: "⚠ EU FEEDS DEGRADED: 5/7 down. Last picture: {ts}"
// Using existing composeSitrep() or composeAirspaceAlert() pattern.

// Case 2: low flyabilityScore (< 20) during active detection
// → "🌩 WEATHER GROUNDING: flyabilityScore=5. wind=14ms rain=3mm vis=600m"

// TelegramAlertComposer.composeEuFeedAlert() — new method (lightweight):
// Input: { degradedFeeds: string[]; lastPictureTs: number }
// Output: MarkdownV2 string

// TelegramAlertComposer.composeWeatherAlert() — new method:
// Input: DroneFlightConditions
// Output: MarkdownV2 string
```

**Transformation required:** `FeedHealth[]` → `degradedFeeds: string[]` (filter where `status !== 'healthy'`, map to `feedId`).

**Interface extension needed:** Two new methods on `TelegramAlertComposer`:
- `composeEuFeedAlert(degradedFeeds: string[], lastPictureTs: number): string`
- `composeWeatherAlert(conditions: DroneFlightConditions): string`

Both follow existing MarkdownV2 formatting conventions (box-drawing chars only, no pipe chars — per CLAUDE.md rule).

---

## What W18 Does NOT Replace

The following pipelines remain completely unchanged. W18 adds context; it does not substitute sensor data.

### W2 — NATS Mesh Transport

`DataFeedBroker` (`src/feeds/data-feed-broker.ts`) and the NATS mesh remain the primary transport for all sensor node communications. W18 feeds use direct EventEmitter within the pipeline process and do NOT publish to NATS. If NATS integration is needed in the future (e.g. multi-node deployment), `EuDataIntegrationPipeline` can be wired as a NATS publisher in a post-W18 wave.

### W6 — Acoustic FFT Pipeline

The YAMNet acoustic classifier, FFT windowing, and acoustic confidence computation remain entirely intact. W18's `AtmosphericConditionProvider` only adjusts the confidence threshold post-classification — it does not touch the FFT pipeline, audio capture, or YAMNet inference. The 22050Hz sample rate issue (vs. INDIGO's 16kHz requirement) is tracked separately and is NOT addressed in W18.

### W9/W12 — RF Sensor Pipeline

`RfSessionTracker` and `RfFusionEngine` continue to process real RF sensor data from hardware via the existing ELRS fingerprinting and RSSI baseline systems. W18's `AircraftState[]` integration is additive (correlation hint injection) — the RF pipeline does not depend on W18 to function. If W18 feeds are unavailable, RF processing continues at full capability.

### W15 — CircuitBreaker

`src/resilience/circuit-breaker.ts` is **reused** by `EuDataFeedRegistry` (FR-W18-01). One `CircuitBreaker` instance is instantiated per registered feed. No changes to `CircuitBreaker` itself. The existing `CircuitOpenError`, `CircuitBreakerState`, and `CircuitBreakerOptions` interfaces are used as-is.

### W3 — YAMNet Model Inference

The TensorFlow.js YAMNet model and inference pipeline (`src/ml/`) are unchanged. W18 has no ML components.

---

## Shared Utilities Required by W18

The following utility modules should be created in `src/geo/` and shared across W18 feed modules to avoid duplication:

```
src/geo/point-in-polygon.ts      — Ray-casting point-in-polygon for GeoJSON Polygon
                                   Used by: EasaUasZoneLoader, NotamIngestor (zone checks),
                                            AwningIntegrationPipeline (NOTAM enrichment),
                                            StageClassifier enrichment in pipeline

src/geo/haversine.ts             — Haversine distance in metres
                                   (check if already exists; if so, import from there)
                                   Used by: SecurityEventCorrelator, CriticalInfrastructureLoader,
                                            AircraftPositionAggregator (bbox filter),
                                            SectorThreatMap zone sensitivity

src/feeds/security-event-mapper.ts — securityEventToOsint() shared mapping function
                                   Used by: OsintCorrelationEngine injection,
                                            IntelligencePackBuilder injection
```

Check `src/geo/` before creating — `haversine.ts` may already exist from W10/W11 (`SectorThreatMap` and `OsintCorrelationEngine` both implement haversine inline; extract to shared module).

---

## W18 Dependency Graph

```
EuDataFeedRegistry (W18-01)
    ├── AircraftPositionAggregator (W18-02)
    ├── NotamIngestor (W18-03)
    │     └── NotamParser (W18-03, pure)
    ├── EasaUasZoneLoader (W18-04)
    ├── CriticalInfrastructureLoader (W18-05)
    ├── AtmosphericConditionProvider (W18-06)
    │     └── open-meteo-client (existing W9)
    └── SecurityEventCorrelator (W18-07)
          └── gdelt-client (existing W9)
          └── CriticalInfrastructureLoader (W18-05, ProtectedZone proximity)

EuDataIntegrationPipeline (W18-08)
    ├── EuDataFeedRegistry (W18-01)
    ├── all 6 feed modules (W18-02 through W18-07)
    └── EventEmitter → {W12 RfFusionEngine, W9 RfSessionTracker, W11 ThreatTimelineBuilder,
                        W16 SystemHealthDashboard, W14 DashboardStateStore,
                        W14 SseStreamManager, W13 TelegramAlertComposer}
```

External dependencies (`CircuitBreaker` from W15, `open-meteo-client` and `gdelt-client` from existing `src/feeds/`) flow inward to W18; W18 output flows outward to W9–W16. There are no circular dependencies.
