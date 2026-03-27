# W21 INTEGRATION MAP — API Routes to W18-W20 Engines

## Overview

This document maps each W21 Next.js API route to the specific W18-W20 engine it calls,
the data it retrieves, the transformations it applies, and the caching strategy.

---

## Integration Architecture

```
Browser (React components)
    │
    │  REST + SSE (HTTPS)
    ▼
Vercel (apex-sentinel-demo)
    ├── app/api/aircraft/route.ts
    ├── app/api/notams/route.ts
    ├── app/api/zones/route.ts
    ├── app/api/weather/route.ts
    ├── app/api/security-events/route.ts
    ├── app/api/alerts/route.ts
    ├── app/api/alerts/[id]/acknowledge/route.ts
    ├── app/api/incidents/route.ts
    ├── app/api/health/route.ts
    ├── app/api/compliance/route.ts
    └── app/api/stream/route.ts
    │
    │  HTTP (internal — WireGuard or direct)
    ▼
apex-sentinel core HTTP service (gateway-01 / APEX_SENTINEL_API_URL)
    ├── W16: SystemHealthDashboard
    ├── W18: AircraftPositionAggregator
    ├── W18: NotamIngestor
    ├── W18: EasaUasZoneLoader
    ├── W18: AtmosphericConditionProvider
    ├── W18: SecurityEventCorrelator
    ├── W19: ThreatIntelPicture (AWNING levels)
    ├── W19: GdprComplianceModule
    ├── W20: AlertAcknowledgmentEngine
    ├── W20: IncidentManager
    ├── W20: SlaComplianceTracker
    └── W20: OperatorWorkflowPipeline (SSE events)
```

---

## Route-by-Route Integration

### GET /api/aircraft

```
Calls:
    APEX_SENTINEL_API_URL/aircraft
        → W18 AircraftPositionAggregator
        → Returns: OpenSky + ADS-B Exchange merged position data

Transformations:
    1. Strip aircraft.ownerName and aircraft.registrationCountry (privacy)
    2. Compute isConventionalAircraft = (droneCategory === null)
    3. Map internal category codes to UI labels:
       cat-a → "Commercial UAS"
       cat-b → "Modified UAS"
       cat-c → "Surveillance UAS"
       cat-d → "Unknown Contact"
       null  → null (conventional aircraft)
    4. Apply zoneId filter if query param present

Caching:
    Cache-Control: s-maxage=15, stale-while-revalidate=30
    (15-second Vercel edge cache — matches OpenSky update rate)

Error handling:
    503 from backend → return last-cached response with X-Data-Staleness header
    429 from OpenSky → return last-cached response
```

### GET /api/notams

```
Calls:
    APEX_SENTINEL_API_URL/notams
        → W18 NotamIngestor
        → Returns: active NOTAMs for LRBB FIR with parsed geometry

Transformations:
    1. Add affectsUas flag (based on W18 classification: true if Q-code QRPCH or QRPAS)
    2. Generate simplifiedText from fullText if W18 doesn't provide it (regex extract)
    3. Apply icaoLocation and type filters if query params present
    4. Sort: active first (validTo > now), then expired

Caching:
    Cache-Control: s-maxage=300, stale-while-revalidate=600
    (5-minute cache — NOTAM updates are rare)

Error handling:
    503 from backend → return empty list with fetchedAt = null, show staleness in UI
```

### GET /api/zones

```
Calls:
    APEX_SENTINEL_API_URL/zones          → W18 EasaUasZoneLoader (zone geometry, type)
    APEX_SENTINEL_API_URL/awning-levels  → W19 ThreatIntelPicture (current AWNING per zone)

Transformations:
    1. Merge zone data with AWNING levels on zone ID
    2. Map zone types to UI labels:
       "CTR" → "Airport CTR"
       "NUC" → "Nuclear Exclusion"
       "MIL" → "Military Restricted"
       "GOV" → "Government Protected"
    3. Compute activeIncidentCount and activeNotamCount (from incidents/notams APIs)
    4. Apply awningLevel and type filters if query params present
    5. Compute awningLevelCounts summary

Caching:
    Zone geometry: s-maxage=3600 (hourly — static data)
    AWNING levels: no-store (always fresh — changes are time-critical)
    Route returns: no-store (because AWNING levels must be live)

Note: AWNING level real-time updates come via SSE stream, not polling of this endpoint.
This endpoint provides the initial state on page load.
```

### GET /api/weather

```
Calls:
    APEX_SENTINEL_API_URL/weather
        → W18 AtmosphericConditionProvider
        → Returns: current conditions + 6h forecast per zone

Transformations:
    1. Compute flyabilityLabel from flyabilityScore:
       80-100 → "EXCELLENT"
       60-79  → "GOOD"
       40-59  → "MARGINAL"
       20-39  → "POOR"
       0-19   → "PROHIBITED"
    2. Compute atmosphericRisk per zone:
       flyabilityScore > 60 → "LOW"
       flyabilityScore 40-60 → "MEDIUM"
       flyabilityScore < 40 → "HIGH"
    3. Apply zoneId filter if query param present

Caching:
    Cache-Control: s-maxage=600, stale-while-revalidate=1200
    (10-minute cache — OpenWeatherMap updates every 10 minutes)
```

### GET /api/security-events

```
Calls:
    APEX_SENTINEL_API_URL/security-events
        → W18 SecurityEventCorrelator
        → Returns: recent correlation events (acoustic+RF matches, multi-sensor hits)

Transformations:
    1. Apply zoneId and since filters if query params present
    2. Apply limit (default 50, max 200)
    3. No sensitive field stripping required (events contain only technical data)

Caching:
    no-store (security events are time-critical)
```

### GET /api/alerts

```
Calls:
    APEX_SENTINEL_API_URL/alerts
        → W20 AlertAcknowledgmentEngine
        → Returns: alert objects with full FSM state

Transformations:
    1. Map droneCategory to UI labels (same mapping as /api/aircraft)
    2. Map acknowledgedByOperator system ID to display name (first name + role)
       e.g. "op-ion-popescu-lrop" → "Ion Popescu (LROP Security)"
    3. Apply status, zoneId, severity, limit filters

Caching:
    no-store (alert state changes in real-time)
```

### POST /api/alerts/[id]/acknowledge

```
Calls:
    POST APEX_SENTINEL_API_URL/alerts/{id}/acknowledge
        → W20 AlertAcknowledgmentEngine.acknowledge(id, operatorId, note)
        → Returns: updated alert with new status and SLA result

Request transformation:
    1. Extract operatorId from session cookie
    2. Pass operatorId + operatorNote to backend

Response transformation:
    1. Return simplified acknowledgment result to browser
    2. Log action to W19 GDPR audit trail (via backend)

Caching:
    None — POST is not cached

Error mapping:
    Backend 409 → return 409 with ALERT_ALREADY_ACKNOWLEDGED
    Backend 404 → return 404 with ALERT_NOT_FOUND
    Backend 403 → return 403 with INSUFFICIENT_PERMISSIONS
```

### GET /api/incidents

```
Calls:
    APEX_SENTINEL_API_URL/incidents
        → W20 IncidentManager
        → Returns: incident objects with timeline and escalation chains

Transformations:
    1. Map involved alert IDs to full alert objects (or stub if alert expired from cache)
    2. Map droneCategory codes in timeline entries to UI labels
    3. Apply status, zoneId, since, limit filters

Caching:
    no-store (incident state changes in real-time)
```

### GET /api/health

```
Calls:
    APEX_SENTINEL_API_URL/health
        → W16 SystemHealthDashboard (overall score + breakdown)
    APEX_SENTINEL_API_URL/sensor-nodes
        → W18 SensorNodeManager (per-node status)
    APEX_SENTINEL_API_URL/feed-health
        → W18 FeedHealthMonitor (per-feed latency + error rates)

Transformations:
    1. Merge all three responses into single health payload
    2. Map feed names to UI display names:
       "opensky" → "OpenSky"
       "adsbx" → "ADS-B Exchange"
       "adsb_fi" → "adsb.fi"
       "notam_lrbb" → "NOTAM/LRBB"
       etc.
    3. No sensitive field stripping required

Caching:
    Cache-Control: s-maxage=30, stale-while-revalidate=60
    (30-second cache — health updates every 30s from W16)
```

### GET /api/compliance

```
Calls:
    APEX_SENTINEL_API_URL/compliance/gdpr
        → W19 GdprComplianceModule
    APEX_SENTINEL_API_URL/compliance/easa
        → W18 EasaUasZoneLoader (zone counts + category accuracy)
    APEX_SENTINEL_API_URL/compliance/sla
        → W20 SlaComplianceTracker

Query param: period (24h or 7d) — forwarded to SLA endpoint

Transformations:
    1. Merge three compliance responses into single object
    2. Add computed flags: retentionCompliant, anonymisationCompliant, slaCompliant
    3. No sensitive field stripping required (compliance data is aggregate statistics)

Caching:
    Cache-Control: s-maxage=60, stale-while-revalidate=120
    (1-minute cache — compliance is not time-critical)
```

### GET /api/stream (SSE)

```
Runtime: Vercel Edge

Calls:
    APEX_SENTINEL_API_URL/stream (if apex-sentinel exposes SSE)
    OR: polls individual endpoints and generates synthetic events

Event production:
    alert_new / alert_updated: from W20 AlertAcknowledgmentEngine events
    alert_escalated: from W20 EscalationMatrix events
    incident_opened / incident_updated / incident_closed: from W20 IncidentManager events
    aircraft_update: from W18 AircraftPositionAggregator (every 15s)
    weather_update: from W18 AtmosphericConditionProvider (every 10min)
    zone_update: from W19 ThreatIntelPicture AWNING changes
    health_update: from W16 SystemHealthDashboard (every 30s)
    keepalive: every 20 seconds

Event ID assignment:
    Sequential integer per stream session. Sent as SSE id field.
    Browser sends Last-Event-ID on reconnection; stream replays missed events
    (up to last 100 events, held in memory).

Transformations per event type:
    Same privacy/label transformations as the corresponding REST endpoint.
    Never emit raw backend state; always emit W21 UI DTOs.

Error handling:
    If APEX_SENTINEL_API_URL is unreachable: emit system_offline event and
    continue sending keepalives. Browser shows "BACKEND UNAVAILABLE" banner.
```

---

## Backend Endpoint Dependency Summary

| W21 Route | Backend Endpoints Called | W18-W20 Engine |
|-----------|------------------------|----------------|
| /api/aircraft | /aircraft | W18 AircraftPositionAggregator |
| /api/notams | /notams | W18 NotamIngestor |
| /api/zones | /zones + /awning-levels | W18 EasaUasZoneLoader + W19 ThreatIntelPicture |
| /api/weather | /weather | W18 AtmosphericConditionProvider |
| /api/security-events | /security-events | W18 SecurityEventCorrelator |
| /api/alerts | /alerts | W20 AlertAcknowledgmentEngine |
| /api/alerts/{id}/acknowledge | /alerts/{id}/acknowledge | W20 AlertAcknowledgmentEngine |
| /api/incidents | /incidents | W20 IncidentManager |
| /api/health | /health + /sensor-nodes + /feed-health | W16 SystemHealthDashboard + W18 |
| /api/compliance | /compliance/gdpr + /easa + /sla | W19 GDPR + W18 EASA + W20 SLA |
| /api/stream | /stream (or synthetic from polling) | W18-W20 all event emitters |

---

## Data Transformation Rules (Applied in All Routes)

### Drone Category Label Mapping

```typescript
const DRONE_CATEGORY_LABELS: Record<string, DroneCategory> = {
  'cat-a':      'Commercial UAS',
  'cat-b':      'Modified UAS',
  'cat-c':      'Surveillance UAS',
  'cat-d':      'Unknown Contact',
  'commercial': 'Commercial UAS',
  'modified':   'Modified UAS',
  'surveillance': 'Surveillance UAS',
  'unknown':    'Unknown Contact',
};
```

### Zone Type Label Mapping

```typescript
const ZONE_TYPE_LABELS: Record<string, ZoneType> = {
  'CTR':  'Airport CTR',
  'AIRPORT': 'Airport CTR',
  'NUC':  'Nuclear Exclusion',
  'NUCLEAR': 'Nuclear Exclusion',
  'MIL':  'Military Restricted',
  'MILITARY': 'Military Restricted',
  'GOV':  'Government Protected',
  'GOVERNMENT': 'Government Protected',
};
```

These mappings are defined in `lib/awning-colours.ts` (exported alongside colour utilities)
and imported by all route handlers.

---

## Failure Mode Summary

| Scenario | Impact | UI Behaviour |
|----------|--------|-------------|
| apex-sentinel service down | All data unavailable | "BACKEND UNAVAILABLE" banner, last-cached data shown |
| OpenSky rate limit | Aircraft data stops updating | Last aircraft positions shown with age indicator |
| NOTAM API down | NOTAM overlay empty | "NOTAM data unavailable" in drawer, map layer hidden |
| Weather API down | Weather widget unavailable | Widget shows "Weather data unavailable" |
| SSE stream drops | Real-time updates stop | "Reconnecting..." indicator, auto-reconnect with backoff |
| Vercel cold start | Slow initial load | MapSkeleton shown, loads within 5s typically |
| TypeScript interface mismatch | Specific field missing | Default/fallback value rendered, no crash |

---

*Document version: W21-INTEGRATION_MAP-v1.0*
*Status: APPROVED FOR IMPLEMENTATION*
