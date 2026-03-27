# W21 ACCEPTANCE CRITERIA — Production Operator UI

## Acceptance Format

Each FR has acceptance criteria in the format:
- GIVEN [precondition]
- WHEN [action]
- THEN [expected outcome]

All criteria must pass before W21 is marked complete.

---

## FR-W21-01: ZoneManagementDashboard

### AC-W21-01-01: Romania-Centered Map

GIVEN the operator opens the dashboard
WHEN the ZONE MAP tab is active
THEN the Leaflet map renders centered at 45.9°N, 24.9°E at zoom level 7
AND the map shows OpenStreetMap tiles loaded within 3 seconds

### AC-W21-01-02: Zone Circles with AWNING Colours

GIVEN the /api/zones endpoint returns zones with various AWNING levels
WHEN the map renders
THEN each zone is shown as a circle
AND GREEN zones have fill rgba(0,230,118,0.3) and border #00e676
AND YELLOW zones have fill rgba(255,238,0,0.3) and border #ffee00
AND ORANGE zones have fill rgba(255,136,0,0.3) and border #ff8800
AND RED zones have fill rgba(255,68,68,0.3) and border #ff4444

### AC-W21-01-03: Zone Detail on Click

GIVEN zones are rendered on the map
WHEN the operator clicks on a zone circle
THEN ZoneDetailPanel slides in from the right
AND the panel shows: zone name, type, current AWNING level, active incident count, active NOTAM count, sensor node count, last detection time
AND the panel has [VIEW INCIDENTS] and [VIEW NOTAMs] and [CLOSE] buttons
AND [VIEW INCIDENTS] switches the tab to INCIDENTS filtered by that zone
AND [VIEW NOTAMs] opens the NOTAM drawer filtered to that zone's ICAO code

### AC-W21-01-04: Aircraft Markers

GIVEN /api/aircraft returns aircraft data
WHEN the map renders
THEN each aircraft is shown as a marker at its lat/lng position
AND conventional aircraft (isConventionalAircraft: true) show a plane icon
AND UAS contacts (droneCategory non-null) show a circle icon sized by threat score
AND clicking an aircraft opens AircraftDetailPanel

### AC-W21-01-05: Aircraft Detail Panel

GIVEN an aircraft marker is clicked
WHEN AircraftDetailPanel renders
THEN it shows: ICAO24, callsign (or "UNKNOWN"), category, threat score, altitude in metres, ground speed in knots, squawk code (or "—"), track in degrees, data sources, last seen timestamp
AND the threat score is in JetBrains Mono with colour based on score range
AND the panel has a [CLOSE] button

### AC-W21-01-06: Threat Track Markers

GIVEN /api/zones returns active ThreatTracks
WHEN the map renders
THEN each threat track shows as a distinct marker (different icon from aircraft)
AND the marker colour matches the track's awningContribution level
AND clicking a threat track shows its droneCategory, confidence, detecting nodes

### AC-W21-01-07: NOTAM Overlay Toggle

GIVEN the map is rendered
WHEN the operator clicks the NOTAM layer toggle in MapLayerControls
THEN NOTAM geometry polygons/circles appear as hatched patterns
AND each NOTAM polygon has an opacity of 0.4
AND clicking a NOTAM polygon opens a tooltip with notamId, simplifiedText, validFrom, validTo

### AC-W21-01-08: Map Layer Controls

GIVEN the map is rendered
WHEN the operator views the top-right corner of the map
THEN MapLayerControls panel is visible with toggles for:
  - Aircraft (default: ON)
  - Threat Tracks (default: ON)
  - NOTAMs (default: OFF)
  - EASA UAS Zones (default: OFF)
  - Weather Overlay (default: OFF)
AND toggling each control immediately shows/hides the corresponding layer

### AC-W21-01-09: Atmospheric Widget

GIVEN weather data is loaded from /api/weather
WHEN the ZONE MAP tab is active
THEN AtmosphericFlightConditions widget is visible in the bottom-left corner of the map
AND the widget shows current flyabilityScore with label
AND the widget does not obstruct zone circles in the primary threat area

### AC-W21-01-10: Real-Time Zone AWNING Update

GIVEN the dashboard is open and connected to SSE stream
WHEN the stream emits a zone_update event with a new awningLevel
THEN the zone circle colour updates within 1 second
AND the AWNING level summary in the TopBar updates immediately
AND if the new level is higher (e.g. GREEN → RED), a new alert appears in LiveAlertWorkflow

---

## FR-W21-02: LiveAlertWorkflow

### AC-W21-02-01: Alert Panel Always Visible

GIVEN any tab is active (ZONE MAP, INCIDENTS, NETWORK, COMPLIANCE)
WHEN the operator views the dashboard
THEN the LiveAlertWorkflow panel is visible on the right side
AND it is 280px wide and full height

### AC-W21-02-02: Alert Card Content

GIVEN an alert exists with status NEW
WHEN the alert card renders
THEN it shows: AWNING level coloured dot, zone name, drone category (human-readable label), message, time since creation (in "Xm Ys ago" format), SLA countdown

### AC-W21-02-03: Alert Priority Sort

GIVEN the alert list contains both NEW and ACKNOWLEDGED alerts of different AWNING levels
WHEN the alert list renders
THEN alerts are sorted: NEW first, then by AWNING level descending (RED > ORANGE > YELLOW > GREEN), then by createdAt descending

### AC-W21-02-04: One-Click Acknowledge

GIVEN an alert with status NEW is visible
WHEN the operator clicks [ACKNOWLEDGE]
THEN the button immediately shows "ACKNOWLEDGING..." (optimistic update)
AND POST /api/alerts/{id}/acknowledge is called
AND on success, the card shows "ACKNOWLEDGED" and moves to the bottom of the list
AND on failure, the button reverts to [ACKNOWLEDGE] and an error message appears

### AC-W21-02-05: SLA Breach Indication

GIVEN an alert has slaBreached: true
WHEN the alert card renders
THEN the card border pulses red with a 1.2-second CSS animation
AND the card header shows "ESCALATED — SLA BREACHED" in red (#ff4444)

### AC-W21-02-06: Alert Filters

GIVEN the operator uses the filter bar
WHEN zone filter is set to a specific zone
THEN only alerts for that zone are shown
WHEN severity filter is set to CRITICAL
THEN only CRITICAL alerts are shown
WHEN status filter is set to NEW
THEN only NEW alerts are shown
AND filters are combinable (all active simultaneously)

### AC-W21-02-07: New Alert Prepend

GIVEN the dashboard is connected to the SSE stream
WHEN the stream emits alert_new
THEN the new alert card appears at the top of the NEW alerts section
AND does not cause scroll displacement of the currently visible cards

### AC-W21-02-08: SSE Reconnection

GIVEN the SSE connection drops (network interruption)
WHEN the connection is lost
THEN a "Connection lost — reconnecting..." indicator appears in the alert panel header in amber
AND reconnection is attempted with exponential backoff (1s, 2s, 4s, 8s, max 30s)
AND on reconnection, the indicator disappears and alerts resume

---

## FR-W21-03: IncidentDetailView

### AC-W21-03-01: Incident List

GIVEN the operator clicks the INCIDENTS tab
WHEN the IncidentDetailView renders
THEN all open and recently closed incidents are shown as IncidentCards
AND each card shows: zone names, duration (or "OPEN"), peak AWNING level, detection count, status badge

### AC-W21-03-02: Incident Detail Drawer

GIVEN an IncidentCard is clicked
WHEN IncidentDetailDrawer opens
THEN the full incident timeline is shown in chronological order
AND each timeline entry shows: timestamp, type (ALERT/ACKNOWLEDGE/ESCALATION/NOTE), actor (if applicable), description
AND involved aircraft ICAO24 codes are listed with links to aircraft detail

### AC-W21-03-03: Escalation Chain

GIVEN an incident has an escalation chain
WHEN the incident detail drawer is open
THEN each escalation level is shown: level number, role, contacted timestamp, acknowledged timestamp (or "AWAITING")
AND unacknowledged escalations are highlighted in amber

### AC-W21-03-04: PDF Export

GIVEN an incident is open in the detail drawer
WHEN the operator clicks [EXPORT PDF]
THEN a PDF is generated and downloaded
AND the PDF contains: incident ID, zone names, timeline, peak AWNING level, escalation chain, operator actions, SLA compliance status
AND the PDF filename is: SENTINEL-INCIDENT-{incidentId}-{date}.pdf

### AC-W21-03-05: Incident Status Badge

GIVEN incidents with various statuses exist
WHEN the incident list renders
THEN OPEN incidents have a green pulsing badge
AND INVESTIGATING incidents have an amber badge
AND RESOLVED incidents have a grey badge with resolution time
AND ESCALATED incidents have a red badge

### AC-W21-03-06: Real-Time Incident Update

GIVEN an incident is open in the detail drawer
WHEN the SSE stream emits incident_updated
THEN the timeline automatically appends the new entry
AND the duration updates

### AC-W21-03-07: No Simulation Content

GIVEN the operator opens the INCIDENTS tab
WHEN any incident is shown
THEN no mention of "Shahed", "Lancet", "FDRP", "Ukraine", or "wave" appears in any text
AND drone categories use the production labels (Commercial UAS, Modified UAS, etc.)

---

## FR-W21-04: NetworkHealthPanel

### AC-W21-04-01: System Health Score

GIVEN the /api/health endpoint returns a score
WHEN the NetworkHealthPanel renders
THEN the score is displayed as a number (0-100) in JetBrains Mono
AND the score colour is: green if ≥90, amber if 70-89, red if <70
AND a breakdown shows: sensors %, feeds %, processing %, latency %

### AC-W21-04-02: Sensor Node Grid

GIVEN /api/health returns sensorNodes array
WHEN the sensor grid renders
THEN all 7 Romanian sensor nodes are shown
AND each node shows: name, location, status (ONLINE/DEGRADED/OFFLINE), last heartbeat time
AND ONLINE nodes show a green dot indicator
AND DEGRADED nodes show an amber dot with "DEGRADED" text
AND OFFLINE nodes show a red dot with time since last heartbeat

### AC-W21-04-03: Feed Health Grid

GIVEN /api/health returns dataFeeds array
WHEN the feed grid renders
THEN all 8 data feeds are shown: OpenSky, ADS-B Exchange, adsb.fi, NOTAM/LRBB, EASA UAS Zones, OpenWeatherMap, ACLED, FIRMS
AND each feed shows: status dot, latency in ms, error rate as percentage, last success time
AND feeds with errorRate > 0.05 show the error rate in red

### AC-W21-04-04: Coverage Map

GIVEN sensor nodes with locations and coverageRadiusKm
WHEN the coverage map renders
THEN a small Leaflet map shows sensor locations as dots
AND coverage radius circles are drawn for ONLINE sensors in green
AND OFFLINE sensor coverage circles are shown in red (dashed border)

### AC-W21-04-05: Health Score Update

GIVEN the SSE stream is connected
WHEN health_update event is received
THEN the health score and breakdown update without page reload
AND the timestamp "as of HH:MM:SS" updates

### AC-W21-04-06: Degraded State Warning Banner

GIVEN the health score is below 70
WHEN the NetworkHealthPanel renders
THEN a full-width banner appears at the top: "SYSTEM DEGRADED — health score {N} — classifications may have reduced accuracy"
AND the banner is #ff4444 background with white text

### AC-W21-04-07: No False Accuracy Claims

GIVEN sensor nodes are OFFLINE
WHEN the panel renders
THEN the UI indicates which zones have reduced coverage due to offline nodes
AND it does NOT claim full coverage when sensor nodes are offline

---

## FR-W21-05: LiveNotamOverlay

### AC-W21-05-01: NOTAM List

GIVEN /api/notams returns data
WHEN the NOTAM drawer is open
THEN all active NOTAMs for LRBB FIR are listed
AND each NOTAM shows: notamId, icaoLocation, type, validFrom, validTo (in DD/MM/YYYY HH:MM UTC format), simplifiedText

### AC-W21-05-02: Drone Filter

GIVEN the NOTAM list has both UAS_RESTRICTION and other types
WHEN the operator selects "Drone-specific" filter
THEN only NOTAMs with affectsUas: true are shown

### AC-W21-05-03: Airport Filter

GIVEN the NOTAM list has NOTAMs for multiple airports
WHEN the operator selects "LROP" from the airport filter
THEN only NOTAMs with icaoLocation: "LROP" are shown

### AC-W21-05-04: Map Highlight

GIVEN a NOTAM with geometry is in the list
WHEN the operator clicks [HIGHLIGHT ON MAP]
THEN: the NOTAM drawer closes, the ZONE MAP tab is activated (if not already), the map pans and zooms to the NOTAM geometry, the NOTAM polygon/circle is highlighted with an animated pulsing border for 5 seconds

### AC-W21-05-05: Auto-Refresh

GIVEN the NOTAM drawer is open
WHEN 5 minutes have passed since the last fetch
THEN /api/notams is called again automatically
AND the list updates if new NOTAMs are returned
AND the last-refreshed timestamp updates

### AC-W21-05-06: Expired NOTAM Display

GIVEN a NOTAM's validTo is in the past
WHEN the NOTAM list renders
THEN the NOTAM is shown with a "EXPIRED" badge in grey
AND expired NOTAMs appear after active NOTAMs in the list

---

## FR-W21-06: AtmosphericFlightConditions

### AC-W21-06-01: Current Conditions

GIVEN /api/weather returns conditions
WHEN the atmospheric widget renders
THEN the following values are shown in JetBrains Mono:
  - Temperature in °C (1 decimal)
  - Wind speed in m/s and direction as compass point (e.g. "6.2 m/s W")
  - Visibility in km (rounded to nearest 0.5km)
  - Precipitation in mm/h

### AC-W21-06-02: Flyability Score PROHIBITED

GIVEN flyabilityScore is between 0 and 19
WHEN FlyabilityScore renders
THEN the label "PROHIBITED" is shown in red (#ff4444)
AND a warning: "Conditions prohibit routine UAS operations"

### AC-W21-06-03: Flyability Score EXCELLENT

GIVEN flyabilityScore is between 80 and 100
WHEN FlyabilityScore renders
THEN the label "EXCELLENT" is shown in green (#00e676)
AND the flyabilityScore number is shown prominently

### AC-W21-06-04: Forecast Chart

GIVEN forecast6h array has 6 data points
WHEN the forecast chart renders
THEN a Recharts line chart shows flyabilityScore over the next 6 hours
AND the X axis shows hours in HH:MM format
AND the Y axis shows 0-100
AND the line colour follows the same score-to-colour mapping as FlyabilityScore

### AC-W21-06-05: Per-Zone Atmospheric Risk

GIVEN multiple zones have different weather conditions
WHEN the atmospheric widget shows zone weather
THEN each zone shows its atmosphericRisk level (LOW/MEDIUM/HIGH)
AND HIGH risk zones are highlighted in amber

### AC-W21-06-06: High Flyability During Active Alerts

GIVEN flyabilityScore > 60 AND there are NEW alerts in the alert panel
WHEN the atmospheric widget renders
THEN a warning banner appears: "Atmospheric conditions favour UAS operations — heightened vigilance recommended"
AND the banner is shown in amber (#ff8800)

---

## FR-W21-07: ComplianceDashboard

### AC-W21-07-01: GDPR Panel

GIVEN /api/compliance returns gdpr data
WHEN the ComplianceDashboard renders
THEN the GDPR panel shows: totalTracksStored, oldestTrackAgeHours (formatted as "Xh Ym"), retentionLimitHours: 48, tracksAnonymisedLast24h, auditLogEntries, lastAuditExportAt

### AC-W21-07-02: Retention Approaching Limit

GIVEN oldestTrackAgeHours > 40 (within 8 hours of the 48h limit)
WHEN the GDPR panel renders
THEN an amber warning badge: "RETENTION APPROACHING LIMIT"

### AC-W21-07-03: EASA Panel

GIVEN /api/compliance returns easa data
WHEN the ComplianceDashboard renders
THEN the EASA panel shows: uasZonesLoaded count, uasZonesActive count, lastZoneRefreshAt time, categoryAccuracyPct (formatted as "87.3% (1204 tracks)")

### AC-W21-07-04: SLA Panel

GIVEN /api/compliance returns sla data
WHEN the SLA panel renders
THEN the following values are shown: complianceRate as percentage, avgAcknowledgeTimeSecs, p95AcknowledgeTimeSecs, slaBreaches count, period label ("Last 24 hours")
AND a progress bar shows complianceRate visually

### AC-W21-07-05: Non-Compliant GDPR Indicator

GIVEN retentionCompliant is false
WHEN the GDPR panel renders
THEN a red [NON-COMPLIANT] badge appears next to the retention section
AND the panel header shows "GDPR — ACTION REQUIRED" in red

### AC-W21-07-06: Non-Compliant SLA Indicator

GIVEN complianceRate < 0.95
WHEN the SLA panel renders
THEN a red [NON-COMPLIANT] badge appears
AND the specific count of breaches is highlighted

### AC-W21-07-07: Auto-Refresh

GIVEN the COMPLIANCE tab is active
WHEN 60 seconds have passed since the last fetch
THEN /api/compliance is called again
AND the last-refreshed timestamp updates

---

## FR-W21-08: ProductionApiLayer

### AC-W21-08-01: No Simulation Data

GIVEN all 11 API routes are deployed
WHEN any route is called
THEN no data from lib/simulation.ts is returned
AND no references to "shahed", "lancet", "ukraine", "viina" appear in any response

### AC-W21-08-02: All Routes Return Valid Schema

GIVEN the production backend (W18-W20) is available
WHEN each of the 11 routes is called with no query parameters
THEN each returns HTTP 200 with a response matching the type definitions in lib/types/w21.ts

### AC-W21-08-03: Acknowledge Idempotency

GIVEN an alert is already ACKNOWLEDGED
WHEN POST /api/alerts/{id}/acknowledge is called again
THEN the response is HTTP 409 with code "ALERT_ALREADY_ACKNOWLEDGED"

### AC-W21-08-04: SSE Stream Headers

GIVEN GET /api/stream is called
WHEN the response headers are checked
THEN Content-Type is "text/event-stream"
AND Cache-Control is "no-cache"
AND Connection is "keep-alive"

### AC-W21-08-05: API Route Auth

GIVEN no valid session cookie is present
WHEN any API route is called
THEN the response is HTTP 401 or a redirect to /login

---

## Global Acceptance Criteria

### GAC-W21-01: No Forbidden Terms

Across the entire W21 UI (all components, all labels, all error messages, all tooltips):
- "Wave" does not appear as a concept
- "FDRP" does not appear
- "Simulation" does not appear
- "Demo" does not appear
- Military weapon system names (Shahed, Lancet, etc.) do not appear
- "Ukraine" does not appear

### GAC-W21-02: WCAG 2.1 AA

Running `axe-core` against the rendered main dashboard page produces zero violations
at the "critical" or "serious" level.

### GAC-W21-03: Build Passes

`npm run build` in the apex-sentinel-demo directory completes without errors.
`npx tsc --noEmit` produces zero TypeScript errors.

### GAC-W21-04: All Tests Pass

`npx vitest run --coverage` produces:
- 0 failing tests
- ≥80% branch, function, line, statement coverage

---

*Document version: W21-ACCEPTANCE_CRITERIA-v1.0*
*Status: APPROVED FOR IMPLEMENTATION*
