# W21 FR REGISTER — Production Operator UI

## Register Summary

| FR | Title | Priority | Tests | Status |
|----|-------|----------|-------|--------|
| FR-W21-01 | ZoneManagementDashboard | P0 | 10 | PLANNED |
| FR-W21-02 | LiveAlertWorkflow | P0 | 11 | PLANNED |
| FR-W21-03 | IncidentDetailView | P1 | 7 | PLANNED |
| FR-W21-04 | NetworkHealthPanel | P1 | 7 | PLANNED |
| FR-W21-05 | LiveNotamOverlay | P1 | 6 | PLANNED |
| FR-W21-06 | AtmosphericFlightConditions | P2 | 6 | PLANNED |
| FR-W21-07 | ComplianceDashboard | P1 | 7 | PLANNED |
| FR-W21-08 | ProductionApiLayer | P0 | 13 | PLANNED |

Total: 8 FRs, 67 FR-specific tests + 4 accessibility tests = 71 tests

---

## FR-W21-01: ZoneManagementDashboard

**Priority:** P0 — Core operator situational awareness. Without this, the dashboard
has no value.

**Description:**
Full-screen Leaflet map centred on Romania (45.9°N, 24.9°E, zoom 7) showing all
protected zones, real aircraft from W18 AircraftPositionAggregator, threat tracks from
W19, NOTAM overlays, EASA UAS zones, and weather overlays. Click interactions open
detail panels. All layers are toggleable.

**Input sources:**
- GET /api/zones → protected zones with AWNING levels
- GET /api/aircraft → real aircraft positions
- SSE stream → real-time position updates, AWNING level changes
- GET /api/notams → NOTAM geometries (on demand)
- GET /api/weather → weather overlay data (on demand)

**Output:**
- Visual map with all layers
- Zone detail panel on zone click
- Aircraft detail panel on aircraft click
- AWNING level summary in TopBar

**Test count:** 10 (5 component + 5 integration)

**Key components:**
- ZoneMap.tsx (dynamic, ssr: false)
- AircraftLayer.tsx
- ThreatTrackLayer.tsx
- NotamLayer.tsx
- ZoneDetailPanel.tsx
- AircraftDetailPanel.tsx
- MapLayerControls.tsx
- AtmosphericFlightConditions.tsx (shared with FR-W21-06)

**Acceptance criteria:** AC-W21-01-01 through AC-W21-01-10

---

## FR-W21-02: LiveAlertWorkflow

**Priority:** P0 — Primary operator action surface. This is why the dashboard exists.

**Description:**
Real-time alert panel, always visible regardless of active tab. Receives alerts via SSE.
One-click acknowledgment with optimistic UI. SLA countdown on every NEW alert. Filter
by zone, severity, and status. SLA breach triggers pulsing red border animation.

**Input sources:**
- GET /api/alerts → initial alert list on load
- SSE stream → alert_new, alert_updated, alert_escalated events
- POST /api/alerts/{id}/acknowledge → acknowledge action

**Output:**
- Sorted alert list (NEW first, then by AWNING level)
- Real-time updates from SSE
- POST to acknowledge endpoint
- Visual SLA countdown with colour transitions

**Test count:** 11 (3 AlertCard + 5 LiveAlertWorkflow + 3 SlaCountdown + 3 integration)

**Key components:**
- LiveAlertWorkflow.tsx
- AlertCard.tsx
- SlaCountdown.tsx
- AlertFilterBar.tsx
- ConnectionStatusIndicator.tsx

**Acceptance criteria:** AC-W21-02-01 through AC-W21-02-08

---

## FR-W21-03: IncidentDetailView

**Priority:** P1 — Required for operators to investigate grouped incidents and for
post-event reporting.

**Description:**
Separate tab showing open and recent incidents from W20 IncidentManager. Grouped from
multiple correlated alerts. Click to open full detail drawer: timeline, involved aircraft,
escalation chain, actions taken. Export incident report via browser print.

**Input sources:**
- GET /api/incidents → incident list with timelines
- SSE stream → incident_opened, incident_updated, incident_closed events

**Output:**
- Incident list with status badges
- Full incident detail drawer
- PDF export via window.print()

**Test count:** 7

**Key components:**
- IncidentDetailView.tsx
- IncidentCard.tsx
- IncidentDetailDrawer.tsx
- IncidentTimeline.tsx
- InvolvedAircraftList.tsx
- ExportPdfButton.tsx

**Acceptance criteria:** AC-W21-03-01 through AC-W21-03-07

---

## FR-W21-04: NetworkHealthPanel

**Priority:** P1 — Operators need to know if sensor coverage is compromised. A detection
gap caused by an offline sensor is not the same as no threat.

**Description:**
System health score (0-100) from W16 SystemHealthDashboard. Grid of 7 sensor nodes with
per-node status. Grid of 8 data feeds with latency and error rates. Mini coverage map
showing which zones have active sensor coverage. Real-time health updates via SSE.

**Input sources:**
- GET /api/health → full health payload
- SSE stream → health_update events

**Output:**
- Health score with colour and breakdown
- Sensor node status grid
- Feed health grid
- Coverage map
- Degraded warning banner when score <70

**Test count:** 7

**Key components:**
- NetworkHealthPanel.tsx
- SystemHealthGauge.tsx
- SensorNodeGrid.tsx
- SensorNodeCard.tsx
- FeedHealthGrid.tsx
- CoverageMap.tsx

**Acceptance criteria:** AC-W21-04-01 through AC-W21-04-07

---

## FR-W21-05: LiveNotamOverlay

**Priority:** P1 — NOTAM awareness is mandatory for operators coordinating with ATC.
Operators must know if a NOTAM restricts the airspace they are monitoring.

**Description:**
NOTAM drawer panel for active NOTAMs in the LRBB (Romanian) FIR. Filter by airport and
drone-relevance. Each NOTAM has a "Highlight on Map" button that zooms the map to the
NOTAM geometry. Auto-refreshes every 5 minutes.

**Input sources:**
- GET /api/notams → NOTAM list with geometry

**Output:**
- NOTAM list in drawer
- Map highlight trigger (communicates with ZoneMap via shared state)

**Test count:** 6

**Key components:**
- LiveNotamOverlay.tsx
- NotamCard.tsx
- NotamFilterBar.tsx
- (NotamLayer.tsx on map — shared with FR-W21-01)

**Acceptance criteria:** AC-W21-05-01 through AC-W21-05-06

---

## FR-W21-06: AtmosphericFlightConditions

**Priority:** P2 — Atmospheric conditions affect drone flyability. A high flyability
score during a detection event raises threat credibility.

**Description:**
Weather widget in the map's bottom-left corner. Shows current conditions (temp, wind,
visibility, precipitation), flyability score (0-100) with label (EXCELLENT/GOOD/MARGINAL/POOR/PROHIBITED),
and a 6-hour forecast Recharts line chart. Shows per-zone atmospheric risk. Warning banner
when conditions favour UAS operations during an active alert.

**Input sources:**
- GET /api/weather → conditions and forecast

**Output:**
- Weather widget on map
- Flyability score with colour
- 6h forecast chart
- Warning banner (conditional)

**Test count:** 6

**Key components:**
- AtmosphericFlightConditions.tsx
- FlyabilityScore.tsx
- WeatherForecastChart.tsx

**Acceptance criteria:** AC-W21-06-01 through AC-W21-06-06

---

## FR-W21-07: ComplianceDashboard

**Priority:** P1 — Regulatory compliance status must be visible to operations managers.
GDPR non-compliance is a liability. SLA non-compliance is a contract issue.

**Description:**
Dedicated COMPLIANCE tab with three panels: GDPR status (track retention, anonymisation,
audit log), EASA status (UAS zones loaded, category accuracy), SLA compliance (24h rolling,
breach rate, average acknowledge time). Red indicators for non-compliance. Auto-refreshes
every 60 seconds.

**Input sources:**
- GET /api/compliance → full compliance payload

**Output:**
- Three compliance panels
- Non-compliance indicators
- 60-second auto-refresh

**Test count:** 7

**Key components:**
- ComplianceDashboard.tsx
- GdprStatusPanel.tsx
- EasaStatusPanel.tsx
- SlaCompliancePanel.tsx

**Acceptance criteria:** AC-W21-07-01 through AC-W21-07-07

---

## FR-W21-08: ProductionApiLayer

**Priority:** P0 — Without this, every other FR has no data. All 7 UI FRs depend on it.

**Description:**
11 Next.js App Router API routes that adapt W18-W20 backend engine outputs to the W21
TypeScript DTOs. Routes enforce data minimisation (strip sensitive fields), apply
appropriate caching, and proxy to the apex-sentinel core HTTP service. The SSE stream
route is an Edge Function.

**Routes:**
- GET /api/aircraft — W18 AircraftPositionAggregator
- GET /api/notams — W18 NotamIngestor
- GET /api/zones — W18 EasaUasZoneLoader + W19 AWNING
- GET /api/weather — W18 AtmosphericConditionProvider
- GET /api/security-events — W18 SecurityEventCorrelator
- GET /api/alerts — W20 AlertAcknowledgmentEngine
- POST /api/alerts/{id}/acknowledge — W20 AlertAcknowledgmentEngine
- GET /api/incidents — W20 IncidentManager
- GET /api/health — W16 SystemHealthDashboard + W18
- GET /api/compliance — W19 GDPR + W20 SlaComplianceTracker
- GET /api/stream — SSE (Edge Function)

**Test count:** 13

**Key files:**
- app/api/*/route.ts (11 files)
- lib/api-client.ts
- lib/sse-client.ts

**Acceptance criteria:** AC-W21-08-01 through AC-W21-08-05

---

## FR Dependencies

```
FR-W21-08 (API Layer)
    ├── FR-W21-01 (Zone Map)        — GET /api/zones, /aircraft, /weather, /notams + SSE
    ├── FR-W21-02 (Alert Workflow)  — GET/POST /api/alerts + SSE
    ├── FR-W21-03 (Incident View)   — GET /api/incidents + SSE
    ├── FR-W21-04 (Network Health)  — GET /api/health + SSE
    ├── FR-W21-05 (NOTAM Overlay)   — GET /api/notams
    ├── FR-W21-06 (Weather)         — GET /api/weather
    └── FR-W21-07 (Compliance)      — GET /api/compliance
```

All UI FRs depend on FR-W21-08. Build order: FR-W21-08 first, then remaining FRs in
priority order: FR-W21-01 and FR-W21-02 (P0), then FR-W21-03 through FR-W21-07 (P1/P2).

---

*Document version: W21-FR_REGISTER-v1.0*
*Status: PLANNED*
