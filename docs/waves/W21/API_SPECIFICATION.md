# W21 API SPECIFICATION — Production Operator UI

## Base URL

Production: `https://apex-sentinel-demo.vercel.app`
Development: `http://localhost:3000`

All routes are Next.js App Router route handlers under `/app/api/`.

## Authentication

All API routes are behind the existing session auth (cookies set by `/login`). No public
endpoints. No API keys in request headers from the browser.

## Common Response Format

Success responses return the payload directly (not wrapped in `{ data: ... }`).
Error responses:

```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",
  "timestamp": "2026-03-27T14:32:11.000Z"
}
```

HTTP status codes follow standard semantics: 200 success, 400 bad request, 404 not found,
500 internal error.

---

## Route 1: GET /api/aircraft

**Source:** W18 AircraftPositionAggregator (OpenSky + ADS-B Exchange)
**Update frequency:** Every 15 seconds (OpenSky rate limit)
**Cache:** Vercel Edge cache, 15-second TTL

### Request

```
GET /api/aircraft
GET /api/aircraft?zoneId=zone-lrop
GET /api/aircraft?minThreatScore=50
```

Query parameters:
- `zoneId` (optional) — filter aircraft to a specific zone radius
- `minThreatScore` (optional, 0-100) — filter by minimum threat score

### Response 200

```json
{
  "aircraft": [
    {
      "icao24": "4b1a2c",
      "callsign": "ROT401",
      "lat": 44.5784,
      "lng": 26.1023,
      "altitudeM": 1240,
      "groundSpeedKt": 185,
      "trackDeg": 275,
      "verticalRateMs": -2.4,
      "squawk": "7700",
      "onGround": false,
      "sources": ["OpenSky", "ADS-B Exchange"],
      "lastSeenAt": "2026-03-27T14:32:08.000Z",
      "threatScore": 12,
      "droneCategory": null,
      "isConventionalAircraft": true
    }
  ],
  "totalCount": 47,
  "fetchedAt": "2026-03-27T14:32:10.000Z",
  "sources": {
    "openSky": { "status": "HEALTHY", "aircraftCount": 34 },
    "adsbExchange": { "status": "HEALTHY", "aircraftCount": 22 }
  }
}
```

---

## Route 2: GET /api/notams

**Source:** W18 NotamIngestor (LRBB FIR)
**Update frequency:** Every 5 minutes
**Cache:** Vercel Edge cache, 5-minute TTL

### Request

```
GET /api/notams
GET /api/notams?icaoLocation=LROP
GET /api/notams?type=UAS_RESTRICTION
GET /api/notams?affectsUas=true
```

Query parameters:
- `icaoLocation` (optional) — filter by airport ICAO code
- `type` (optional) — filter by NOTAM type
- `affectsUas` (optional, boolean) — filter to drone-relevant NOTAMs only

### Response 200

```json
{
  "notams": [
    {
      "notamId": "A1234/26",
      "icaoLocation": "LROP",
      "type": "UAS_RESTRICTION",
      "validFrom": "2026-03-27T12:00:00Z",
      "validTo": "2026-03-27T18:00:00Z",
      "fullText": "A1234/26 NOTAMN Q) LRBB/QRPCH/IV/BO/AE/000/005/4439N02610E003...",
      "simplifiedText": "UAS prohibited within 3km of LROP, surface to 500ft, until 18:00 UTC",
      "geometry": {
        "type": "circle",
        "centerLat": 44.5711,
        "centerLng": 26.0850,
        "radiusKm": 3
      },
      "affectsUas": true,
      "altitude": { "from": 0, "to": 500, "unit": "FT" }
    }
  ],
  "totalCount": 8,
  "firCode": "LRBB",
  "fetchedAt": "2026-03-27T14:30:00.000Z"
}
```

---

## Route 3: GET /api/zones

**Source:** W18 EasaUasZoneLoader + W19 ThreatFusionEngine (AWNING levels)
**Update frequency:** Zones are static; AWNING levels update via SSE (real-time)
**Cache:** Zones cached 60s; AWNING levels are live via SSE

### Request

```
GET /api/zones
GET /api/zones?awningLevel=RED
GET /api/zones?type=Airport+CTR
```

### Response 200

```json
{
  "zones": [
    {
      "id": "zone-lrop",
      "name": "Henri Coandă International",
      "icaoCode": "LROP",
      "type": "Airport CTR",
      "lat": 44.5711,
      "lng": 26.0850,
      "radiusKm": 5,
      "awningLevel": "RED",
      "awningUpdatedAt": "2026-03-27T14:31:45.000Z",
      "activeIncidentCount": 1,
      "activeNotamCount": 3,
      "sensorNodeIds": ["SN-LROP-01", "SN-LROP-02", "SN-LROP-03"],
      "lastDetectionAt": "2026-03-27T14:31:40.000Z"
    },
    {
      "id": "zone-cernavoda",
      "name": "Cernavodă Nuclear Plant",
      "icaoCode": null,
      "type": "Nuclear Exclusion",
      "lat": 44.3274,
      "lng": 28.0547,
      "radiusKm": 3,
      "awningLevel": "GREEN",
      "awningUpdatedAt": "2026-03-27T14:00:00.000Z",
      "activeIncidentCount": 0,
      "activeNotamCount": 0,
      "sensorNodeIds": ["SN-CERNAVODA-01"],
      "lastDetectionAt": null
    }
  ],
  "totalCount": 12,
  "awningLevelCounts": {
    "GREEN": 9,
    "YELLOW": 2,
    "ORANGE": 0,
    "RED": 1
  }
}
```

---

## Route 4: GET /api/weather

**Source:** W18 AtmosphericConditionProvider (OpenWeatherMap)
**Update frequency:** Every 10 minutes
**Cache:** Vercel Edge cache, 10-minute TTL

### Request

```
GET /api/weather
GET /api/weather?zoneId=zone-lrop
```

### Response 200

```json
{
  "conditions": {
    "lat": 44.5711,
    "lng": 26.0850,
    "location": "Henri Coandă International",
    "tempC": 8.4,
    "windSpeedMs": 6.2,
    "windDirDeg": 270,
    "visibilityM": 8000,
    "precipitationMmH": 0,
    "cloudCoverPct": 45,
    "updatedAt": "2026-03-27T14:20:00.000Z",
    "flyabilityScore": 72,
    "flyabilityLabel": "GOOD",
    "forecast6h": [
      {
        "time": "2026-03-27T15:00:00Z",
        "tempC": 7.8,
        "windSpeedMs": 7.1,
        "visibilityM": 7500,
        "precipitationMmH": 0.2,
        "flyabilityScore": 68
      }
    ]
  },
  "zoneWeather": [
    {
      "zoneId": "zone-lrop",
      "conditions": { "...": "as above" },
      "atmosphericRisk": "LOW"
    }
  ]
}
```

---

## Route 5: GET /api/security-events

**Source:** W18 SecurityEventCorrelator
**Update frequency:** Real-time via SSE; this REST endpoint returns recent history

### Request

```
GET /api/security-events
GET /api/security-events?limit=50
GET /api/security-events?since=2026-03-27T14:00:00Z
GET /api/security-events?zoneId=zone-lrop
```

### Response 200

```json
{
  "events": [
    {
      "id": "evt-2026-03-27-001",
      "type": "CORRELATION_HIT",
      "zoneId": "zone-lrop",
      "relatedTrackIds": ["TRK-2026-03-27-001"],
      "correlationScore": 0.87,
      "description": "Simultaneous acoustic + RF signature detected",
      "timestamp": "2026-03-27T14:31:40.000Z"
    }
  ],
  "totalCount": 14,
  "since": "2026-03-27T14:00:00.000Z"
}
```

---

## Route 6: GET /api/alerts

**Source:** W20 AlertAcknowledgmentEngine

### Request

```
GET /api/alerts
GET /api/alerts?status=NEW
GET /api/alerts?status=ACKNOWLEDGED
GET /api/alerts?zoneId=zone-lrop
GET /api/alerts?severity=CRITICAL
GET /api/alerts?limit=100
```

### Response 200

```json
{
  "alerts": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "zoneId": "zone-lrop",
      "zoneName": "Henri Coandă International",
      "trackId": "TRK-2026-03-27-001",
      "droneCategory": "Modified UAS",
      "awningLevel": "RED",
      "severity": "CRITICAL",
      "status": "NEW",
      "message": "Modified UAS detected bearing 275°, confidence 94%",
      "createdAt": "2026-03-27T14:31:40.000Z",
      "acknowledgedAt": null,
      "acknowledgedByOperator": null,
      "resolvedAt": null,
      "slaSecs": 45,
      "slaBreached": false,
      "escalatedAt": null,
      "incidentId": "inc-2026-03-27-001"
    }
  ],
  "totalCount": 3,
  "newCount": 2,
  "acknowledgedCount": 1
}
```

---

## Route 7: POST /api/alerts/[id]/acknowledge

**Source:** W20 AlertAcknowledgmentEngine.acknowledge()

### Request

```
POST /api/alerts/550e8400-e29b-41d4-a716-446655440000/acknowledge
Content-Type: application/json

{
  "operatorNote": "Checked zone, no visual confirmation, monitoring"
}
```

`operatorNote` is optional but recommended for audit trail.

### Response 200

```json
{
  "alertId": "550e8400-e29b-41d4-a716-446655440000",
  "previousStatus": "NEW",
  "newStatus": "ACKNOWLEDGED",
  "acknowledgedAt": "2026-03-27T14:32:05.000Z",
  "slaElapsedSecs": 25,
  "slaSecs": 45,
  "slaCompliant": true
}
```

### Response 409 — Already Acknowledged

```json
{
  "error": "Alert is already acknowledged",
  "code": "ALERT_ALREADY_ACKNOWLEDGED",
  "currentStatus": "ACKNOWLEDGED",
  "acknowledgedAt": "2026-03-27T14:31:50.000Z"
}
```

### Response 404 — Alert Not Found

```json
{
  "error": "Alert not found",
  "code": "ALERT_NOT_FOUND",
  "alertId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## Route 8: GET /api/incidents

**Source:** W20 IncidentManager

### Request

```
GET /api/incidents
GET /api/incidents?status=OPEN
GET /api/incidents?zoneId=zone-lrop
GET /api/incidents?since=2026-03-27T00:00:00Z
```

### Response 200

```json
{
  "incidents": [
    {
      "id": "inc-2026-03-27-001",
      "zoneIds": ["zone-lrop"],
      "alertIds": [
        "550e8400-e29b-41d4-a716-446655440000",
        "550e8400-e29b-41d4-a716-446655440001"
      ],
      "status": "OPEN",
      "peakAwningLevel": "RED",
      "openedAt": "2026-03-27T14:31:40.000Z",
      "resolvedAt": null,
      "durationSecs": null,
      "detectionCount": 2,
      "involvedAircraftIcao24": ["4b1a2c"],
      "escalationChain": [
        {
          "level": 1,
          "role": "Shift Supervisor",
          "contactedAt": "2026-03-27T14:32:25.000Z",
          "acknowledgedAt": null
        }
      ],
      "timeline": [
        {
          "timestamp": "2026-03-27T14:31:40.000Z",
          "type": "ALERT",
          "actorId": null,
          "description": "Alert created: Modified UAS detected",
          "alertId": "550e8400-e29b-41d4-a716-446655440000"
        },
        {
          "timestamp": "2026-03-27T14:32:05.000Z",
          "type": "ACKNOWLEDGE",
          "actorId": "operator-ion-popescu",
          "description": "Alert acknowledged by Ion Popescu (25s, SLA compliant)",
          "alertId": "550e8400-e29b-41d4-a716-446655440000"
        }
      ]
    }
  ],
  "totalCount": 1,
  "openCount": 1
}
```

---

## Route 9: GET /api/health

**Source:** W16 SystemHealthDashboard + W18 feed health

### Request

```
GET /api/health
```

### Response 200

```json
{
  "score": 91,
  "sensorNodesOnline": 6,
  "sensorNodesTotal": 7,
  "feedsHealthy": 7,
  "feedsTotal": 8,
  "lastUpdatedAt": "2026-03-27T14:31:30.000Z",
  "breakdown": {
    "sensors": 86,
    "feeds": 94,
    "processing": 99,
    "latency": 95
  },
  "sensorNodes": [
    {
      "id": "SN-LROP-01",
      "name": "LROP Acoustic Array North",
      "location": "Henri Coandă International",
      "lat": 44.5732,
      "lng": 26.0881,
      "status": "ONLINE",
      "lastHeartbeatAt": "2026-03-27T14:31:28.000Z",
      "coverageRadiusKm": 3,
      "acousticActive": true,
      "rfActive": true,
      "opticalActive": false,
      "zoneIds": ["zone-lrop"]
    }
  ],
  "dataFeeds": [
    {
      "name": "OpenSky",
      "status": "HEALTHY",
      "lastSuccessAt": "2026-03-27T14:31:22.000Z",
      "latencyMs": 342,
      "requestsLast1h": 240,
      "errorsLast1h": 0,
      "errorRate": 0
    },
    {
      "name": "ADS-B Exchange",
      "status": "HEALTHY",
      "lastSuccessAt": "2026-03-27T14:31:20.000Z",
      "latencyMs": 218,
      "requestsLast1h": 240,
      "errorsLast1h": 2,
      "errorRate": 0.008
    }
  ]
}
```

---

## Route 10: GET /api/compliance

**Source:** W19 GDPR module + W20 SlaComplianceTracker + W18 EASA zone loader

### Request

```
GET /api/compliance
GET /api/compliance?period=7d
```

### Response 200

```json
{
  "gdpr": {
    "totalTracksStored": 1847,
    "oldestTrackAgeHours": 31.4,
    "retentionLimitHours": 48,
    "tracksAnonymisedLast24h": 312,
    "auditLogEntries": 4892,
    "lastAuditExportAt": "2026-03-27T06:00:00.000Z",
    "retentionCompliant": true,
    "anonymisationCompliant": true
  },
  "easa": {
    "uasZonesLoaded": 42,
    "uasZonesActive": 38,
    "lastZoneRefreshAt": "2026-03-27T12:00:00.000Z",
    "categoryAccuracyPct": 87.3,
    "categoryAccuracyBasis": 1204
  },
  "sla": {
    "period": "24h",
    "totalAlerts": 28,
    "acknowledgedOnTime": 27,
    "slaBreaches": 1,
    "complianceRate": 0.964,
    "avgAcknowledgeTimeSecs": 18.4,
    "p95AcknowledgeTimeSecs": 38.2
  },
  "lastRefreshedAt": "2026-03-27T14:31:00.000Z"
}
```

---

## Route 11: GET /api/stream

**Type:** Server-Sent Events (SSE)
**Content-Type:** `text/event-stream`
**Cache-Control:** `no-cache`
**Connection:** `keep-alive`

### Request

```
GET /api/stream
Accept: text/event-stream
```

### Event Format

Standard SSE format:

```
event: alert_new
data: {"type":"alert_new","payload":{...Alert...},"timestamp":"2026-03-27T14:31:40Z"}

event: aircraft_update
data: {"type":"aircraft_update","payload":[...Aircraft[]],"timestamp":"2026-03-27T14:31:45Z"}

event: keepalive
data: {"type":"keepalive","timestamp":"2026-03-27T14:31:50Z"}
```

Keepalive events are sent every 30 seconds to prevent proxy timeouts.

### Event Types and Payload

| Event | Payload type | Trigger |
|-------|-------------|---------|
| `connected` | `{ sessionId: string }` | Stream established |
| `alert_new` | `Alert` | W20 emits alert_new |
| `alert_updated` | `Alert` | Any alert state change |
| `alert_escalated` | `Alert` | SLA breach + auto-escalation |
| `incident_opened` | `Incident` | W20 IncidentManager groups alerts |
| `incident_updated` | `Incident` | Any incident state change |
| `incident_closed` | `Incident` | Incident resolved |
| `aircraft_update` | `Aircraft[]` | W18 AircraftPositionAggregator tick |
| `weather_update` | `WeatherConditions` | W18 atmospheric update |
| `zone_update` | `ProtectedZone` | AWNING level change |
| `health_update` | `SystemHealth` | W16 publishes health score |
| `keepalive` | `{}` | Every 30s |

### Client Reconnection

The browser SSE client (`lib/sse-client.ts`) reconnects automatically with exponential
backoff: 1s → 2s → 4s → 8s → max 30s. On reconnection, it requests missed events by
sending the `Last-Event-ID` header (the server assigns sequential event IDs).

---

*Document version: W21-API_SPECIFICATION-v1.0*
*Status: APPROVED FOR IMPLEMENTATION*
