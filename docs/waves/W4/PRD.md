# APEX-SENTINEL — PRD.md
## C2 Dashboard Product Requirements Document
### Wave 4 | Project: APEX-SENTINEL | Version: 4.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. PROBLEM STATEMENT

### 1.1 The Gap

W1-W3 delivered the sensing and correlation stack: on-device acoustic/RF detection, NATS backbone for real-time event streaming, TdoaCorrelator for multi-node fusion, and mobile business logic for the field. The output is a continuous stream of threat tracks flowing through `sentinel.tracks.*` NATS subjects and persisted to Supabase.

The problem: **no human can consume a raw NATS stream**. Commanders in operations rooms currently have no way to:
- See the real-time tactical picture across a 50km radius AO
- Triage multiple simultaneous threats
- Track threat history over a mission window
- Export threat data to other C2 systems (ATAK, FreeTAKServer)
- Understand sensor node health at a glance

W4 closes this gap. It is the human interface to the machine intelligence built in W1-W3.

### 1.2 Operational Context

```
Scenario: Territorial defense unit, eastern Ukraine, 2026
- 47 sensor nodes deployed across 50km radius AO
- 3-8 drone detection events per hour during active periods
- C2 post in hardened building, 2× 1920×1080 monitors
- Internet: Starlink + cellular failover
- Operators: 2 per shift, 8-hour rotation
- Analysts: 1 per day, reviewing previous shift data
- Civil defense liaisons: briefed from dashboard view (read-only)
```

### 1.3 Why This Is Hard

- **CesiumJS + Next.js**: CesiumJS is not SSR-compatible; requires dynamic import with `ssr: false`. WASM and WebWorker setup required. Build configuration non-trivial.
- **Sub-100ms track updates**: Supabase Realtime must be subscribed at component mount, with Zustand store as intermediary to avoid React re-render storms.
- **NATS.ws in browser**: NATS.ws client running in browser shares the same NATS subjects as backend workers. Auth scope must be correctly scoped to read-only for browser clients.
- **OpenMCT integration**: OpenMCT is a monolithic NASA framework; must be integrated as a React-mounted instance with custom telemetry plugins, not as a standalone app.
- **60fps globe render**: CesiumJS renders a WebGL frame per tick. Track entity updates must be batched to avoid triggering multiple redraws per Supabase Realtime event.

---

## 2. USER ARCHETYPES

### UA-02: C2 Commander

```
Name       : Col. Mykhailo Kovalenko (composite persona)
Role       : Commands territorial defense battalion, 50km AO
Context    : Operations room, 2× monitors, 8-hour shift
Tech level : Military trained, familiar with ATAK and basic GIS
Goals:
  1. Know at all times: how many threats, where, confidence level
  2. Be alerted immediately when CRITICAL threat appears
  3. Dispatch response without leaving dashboard
  4. Trust that the data is fresh (staleness indication required)
Pain points:
  - Alert fatigue from false positives
  - Losing track of a threat while responding to another
  - Stale data presented as current (catastrophic in this context)
  - System downtime without clear indication
```

### UA-05: Military Intelligence Analyst

```
Name       : Lt. Oksana Marchenko (composite persona)
Role       : Analyzes threat patterns, produces intelligence reports
Context    : Dual monitor, post-event analysis, works after shift
Tech level : High — uses GIS tools, understands data structures
Goals:
  1. Reconstruct a threat track with full timeline history
  2. Export CoT bundles for ingestion into intelligence systems
  3. Identify patterns (same threat class from same bearing repeatedly)
  4. Annotate tracks with operational notes
  5. Produce statistical reports (detections/day, node coverage gaps)
Pain points:
  - No temporal navigation (can't go back 4 hours)
  - No annotation capability
  - No export function
  - No way to cross-reference multiple tracks at same time
```

### UA-03: Civil Defense Coordinator

```
Name       : Ivan Petrenko (composite persona)
Role       : Municipal emergency coordinator, civilian
Context    : Municipal EOC, 1 monitor, non-military
Tech level : Basic — email, maps, no military systems experience
Goals:
  1. Know: is there an active threat that requires civilian action?
  2. Understand severity without military jargon
  3. Read-only — does not need to interact with tracks
  4. Does NOT need to see node IDs or sensor positions (OPSEC)
Pain points:
  - Military terminology is opaque
  - Too much information → ignores alerts
  - Accidentally triggering actions
```

---

## 3. FUNCTIONAL REQUIREMENTS

### FR-W4-01: CesiumJS 3D Globe with ECEF-Correct Track Rendering

```
Priority : P0 — MUST
MoSCoW   : MUST HAVE

Description:
  The dashboard shall render a 3D globe using CesiumJS 1.115 with Cesium
  World Terrain. All track positions shall be rendered in ECEF (Earth-Centered,
  Earth-Fixed) coordinates to ensure geometric accuracy at all zoom levels.

Acceptance criteria:
  AC-01: Globe loads within 2 seconds of page load (terrain tiles streaming in
         background is acceptable; globe frame must be visible in 2s)
  AC-02: Track markers rendered at correct WGS84 coordinates (±1m accuracy)
  AC-03: Terrain elevation applied — tracks appear at correct altitude above ground
  AC-04: Camera supports: orbit, zoom (scroll wheel), pan (left-drag), tilt (right-drag)
  AC-05: Track marker color matches threat class from §2.3 of DESIGN.md
  AC-06: Track markers pulse at 0.8Hz when confidence ≥ 0.85
  AC-07: Track trails (last 30 positions) rendered as dashed polyline
  AC-08: Globe camera smoothly flies to selected track on TrackTable row click
  AC-09: Entity performance: 100 simultaneous track entities at ≥30fps
  AC-10: CesiumJS loaded via dynamic import (ssr: false) — no SSR crash

Technical constraints:
  - CesiumJS MUST be dynamically imported: import('cesium')
  - CESIUM_BASE_URL must be set before import
  - Cesium Ion access token required for World Terrain
  - Entity management via trackEntityManager.ts (not raw Viewer.entities.add)
  - No Cesium DataSource (too slow for real-time updates)
  - Use Cesium Entity collection with pre-created entities, update positions
```

### FR-W4-02: Supabase Realtime Tracks Subscription

```
Priority : P0 — MUST
MoSCoW   : MUST HAVE

Description:
  The dashboard shall subscribe to Supabase Realtime changes on the tracks
  table and update the globe and track table within 100ms of the database
  change event.

Acceptance criteria:
  AC-01: Subscription established within 1s of page load
  AC-02: Track INSERT event: new TrackMarker appears on globe ≤100ms after event
  AC-03: Track UPDATE event: existing marker position updates ≤100ms after event
  AC-04: Track DELETE event: marker removed from globe ≤100ms after event
  AC-05: Zustand trackStore updated on every Realtime event
  AC-06: Connection lost: banner shows "REALTIME OFFLINE", reconnect attempted
          every 5s with exponential backoff (max 30s interval)
  AC-07: Connection restored: full resync of active tracks from Supabase REST
  AC-08: 50 simultaneous track updates/second: no events dropped
  AC-09: Memory: subscription cleaned up on component unmount (no leaks)
  AC-10: Re-render budget: single track update shall not cause full React tree re-render

Channel config:
  supabase.channel('tracks')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'tracks',
      filter: 'status=eq.ACTIVE'
    }, handler)
    .subscribe()
```

### FR-W4-03: NATS.ws Alerts Subscription

```
Priority : P0 — MUST
MoSCoW   : MUST HAVE

Description:
  The dashboard shall subscribe to NATS subject sentinel.alerts.> using
  NATS.ws (WebSocket transport) and display incoming alerts in the AlertFeed
  panel and trigger AlertBanner for CRITICAL severity.

Acceptance criteria:
  AC-01: NATS.ws connection established within 2s of page load
  AC-02: Incoming CRITICAL alert: AlertBanner visible ≤200ms after message receipt
  AC-03: Alert deduplicated by alert_id: same alert_id does not create duplicate entry
  AC-04: Alert queue in alertStore: max 200 alerts retained (FIFO drop oldest)
  AC-05: NATS disconnected: "NATS OFFLINE" header badge within 1s
  AC-06: NATS reconnect: automatic with 5s interval, max 12 attempts
  AC-07: NATS credentials: read-only user creds injected via env var, not hardcoded
  AC-08: Alert payload validation: malformed JSON messages are logged and discarded
  AC-09: Message rate: handles 100 messages/second without UI blocking (RAF batching)
  AC-10: Browser tab hidden: messages buffered, processed on tab focus restore

NATS subjects consumed:
  sentinel.alerts.>         — all alert events
  sentinel.cot.>            — CoT XML payloads for relay
  (NOT sentinel.detections.> — raw detection volume too high for browser)
```

### FR-W4-04: Track Table

```
Priority : P0 — MUST
MoSCoW   : MUST HAVE

Description:
  A sortable, filterable table in the right panel showing all active tracks
  with threat class, confidence, last seen time, and detecting node.

Acceptance criteria:
  AC-01: All active tracks shown (no pagination — tracks are bounded at ~20 max)
  AC-02: Columns: ID, CLASS, CONFIDENCE, LAST SEEN, NODE, ACTIONS
  AC-03: Sort by any column, click header to toggle ASC/DESC
  AC-04: Default sort: CONFIDENCE DESC
  AC-05: Filter by threat class via dropdown (All | FPV | Shahed | Helicopter | Unknown)
  AC-06: Filter by confidence threshold via dropdown (All | High >70% | Medium 40-70%)
  AC-07: Text filter: type to filter by track ID or node ID
  AC-08: Row click: select track, globe flies to track, TrackDetail panel opens
  AC-09: Stale tracks (last_seen >120s): shown with [STALE] badge, 0.5 opacity
  AC-10: Keyboard: ↑↓ navigate rows, Enter open detail, / focus filter
```

### FR-W4-05: OpenMCT Timeline

```
Priority : P1 — HIGH
MoSCoW   : SHOULD HAVE

Description:
  An OpenMCT timeline panel at the bottom of the dashboard showing track
  history, node uptime, and detection events over a configurable time window.

Acceptance criteria:
  AC-01: OpenMCT instance mounts in React without SSR (dynamic import)
  AC-02: Timeline shows last 1 hour by default, configurable to 24h
  AC-03: Track rows: horizontal bar from first_seen to last_seen, colored by class
  AC-04: Node rows: uptime bars (green=online, red=offline gaps)
  AC-05: Alert row: event markers at alert timestamps, colored by severity
  AC-06: LIVE mode: timeline scrubs in real time as events arrive
  AC-07: Historical mode: scrub to past time, globe shows track positions at that time
  AC-08: Timeline data source: get-track-history Edge Function for history,
          Supabase Realtime for live
  AC-09: OpenMCT renders without console errors in production build
  AC-10: Timeline collapse/expand button in header
```

### FR-W4-06: Node Health Map

```
Priority : P1 — HIGH
MoSCoW   : SHOULD HAVE

Description:
  Sensor node positions and coverage radii rendered as overlay on the 3D
  globe, with tier-based coloring and health status indication.

Acceptance criteria:
  AC-01: All registered nodes shown as coverage circles on globe
  AC-02: Circle radius = node.coverage_radius_m from DB
  AC-03: Circle color = tier color per DESIGN.md §4.3
  AC-04: Offline nodes shown in red with dashed outline
  AC-05: Node icon at center, labeled at zoom ≥ 14
  AC-06: Click coverage circle: NodeHealthDetail panel shows
  AC-07: Layer toggle: nodes layer can be hidden via LayerControls
  AC-08: Node data refreshes every 30s (not real-time — heartbeat interval)
  AC-09: Coverage overlap areas highlighted (brighter fill)
  AC-10: Civil defense role: nodes hidden (OPSEC — covered in PRIVACY_ARCHITECTURE.md)
```

### FR-W4-07: Alert Detail Panel

```
Priority : P0 — MUST
MoSCoW   : MUST HAVE

Description:
  A panel in the right sidebar showing the full detail of the selected or
  most recent unacknowledged CRITICAL alert, including CoT XML preview.

Acceptance criteria:
  AC-01: Panel shows: alert ID, severity badge, track ID, class, confidence,
          coordinates (coarsened ±50m), altitude, heading, speed, detecting node,
          first seen, last updated
  AC-02: CoT XML preview: collapsed by default, expandable, monospace, max 20 lines
  AC-03: Acknowledge button: marks alert in DB (alert_acknowledgements table)
  AC-04: Export CoT button: triggers single-file download (see FR-W4-08)
  AC-05: Annotate button: opens AnnotationModal, saves to operator_notes
  AC-06: Relay TAK button: POSTs to FreeTAKServer relay endpoint
  AC-07: Acknowledged alerts show "Acked by [user] at [time]" in panel
  AC-08: Panel updates within 200ms of selecting a different alert/track
  AC-09: Empty state shown when no alert selected
  AC-10: Panel is read-only for analyst and civil_defense roles
```

### FR-W4-08: CoT Export

```
Priority : P1 — HIGH
MoSCoW   : SHOULD HAVE

Description:
  Export track data as Cursor-on-Target (CoT) XML, either single track or
  batch. Relay to FreeTAKServer via Edge Function.

Acceptance criteria:
  AC-01: Single track export: downloads valid .cot XML file (ATAK compatible)
  AC-02: Batch export: Ctrl+Shift+E exports all active tracks as .zip of .cot files
  AC-03: Time-range export: select time window, export all tracks in window
  AC-04: CoT schema version: 2.0 (standard CoT event schema)
  AC-05: Exported CoT contains: uid, type, time, start, stale, point (coarsened),
          detail with callsign and confidence
  AC-06: NO PII in exported CoT (operator ID not included, node ID not included)
  AC-07: FreeTAKServer relay: POST to /api/relay-tak, which calls Edge Function
  AC-08: Export disabled for civil_defense role
  AC-09: Export audit logged: user ID + timestamp + track IDs logged to Supabase
  AC-10: Export produces valid XML (validated against CoT XSD in tests)
```

### FR-W4-09: Threat Statistics Panel

```
Priority : P1 — HIGH
MoSCoW   : SHOULD HAVE

Description:
  A statistics panel in the left sidebar showing operational metrics:
  detections per hour, false positive rate, node uptime, alert acknowledgement
  rate, and 24-hour trend.

Acceptance criteria:
  AC-01: Metrics shown: detections/hr, false positive rate, CRITICAL alerts today,
          mean confidence, active track count, node uptime %, alert ACK rate
  AC-02: Visual: horizontal bar charts, no external charting library (CSS bars)
  AC-03: Data refresh: every 60 seconds
  AC-04: 24h trend: up/down arrow with % change vs previous 24h
  AC-05: Data source: get-threat-stats Edge Function (returns precomputed values)
  AC-06: Panel visible in all roles (analyst and civil_defense see coarsened metrics)
  AC-07: Tooltip on hover each metric: explains what it measures
  AC-08: Zero state: new deployment with no data shows "--" not 0 (avoids misleading)
  AC-09: Mobile nodes battery average shown if any mobile nodes registered
  AC-10: Export stats as CSV button (downloads 7-day rolling metrics)
```

### FR-W4-10: Authentication

```
Priority : P0 — MUST
MoSCoW   : MUST HAVE

Description:
  Supabase Auth-based authentication with three roles: operator, analyst,
  admin. Role-based access controls enforced both at UI level and at
  Supabase RLS level.

Acceptance criteria:
  AC-01: Unauthenticated access to dashboard redirects to /login
  AC-02: Login: email + password (Supabase Auth)
  AC-03: Session: 8-hour timeout, prompt to re-authenticate in-place (no data loss)
  AC-04: Roles enforced:
          operator : full access except admin functions
          analyst  : read-only + export
          admin    : full access + DEFCON set + node management
          civil_defense: read-only, no node IDs, no CoT export, no annotations
  AC-05: RLS enforced at DB level (not just UI-level) — verified in tests
  AC-06: Invalid session: dashboard shows "SESSION EXPIRED" and re-auth modal
  AC-07: Auth token passed with all Supabase and Edge Function requests
  AC-08: NATS.ws auth: read-only creds, not tied to user session
  AC-09: Logout: clears session, redirects to /login
  AC-10: Auth audit: all logins/logouts logged in Supabase auth.audit_log_entries
```

### FR-W4-11: Dark Mode Only

```
Priority : P0 — MUST
MoSCoW   : MUST HAVE

Description:
  The dashboard enforces military dark theme unconditionally. No light mode.
  No user preference respected. No theme toggle.

Acceptance criteria:
  AC-01: <html class="dark"> present in all page renders
  AC-02: Tailwind config: darkMode: 'class'
  AC-03: No CSS rule produces a white or light-grey background on any element
  AC-04: Cesium viewer background: #0A0C10 (set via viewer.scene.backgroundColor)
  AC-05: Cesium imagery: dark satellite (Mapbox satellite-dark or similar)
  AC-06: OpenMCT theme: dark (openmct.install(openmct.plugins.themes.Espresso()))
  AC-07: System dark/light preference: ignored
  AC-08: No flash of white on initial page load (CSS vars set in <head>)
  AC-09: Print stylesheet: not required (dashboard is not printable)
  AC-10: shadcn/ui components: all consume Tailwind dark: classes only
```

### FR-W4-12: Keyboard Shortcuts

```
Priority : P1 — HIGH
MoSCoW   : SHOULD HAVE

Description:
  ATAK-inspired keyboard shortcuts for all major navigation and action
  functions, operable without mouse.

Acceptance criteria:
  AC-01: T = switch to tracks view
  AC-02: N = switch to nodes view
  AC-03: A = switch to alerts view
  AC-04: ESC = clear selection + close modals
  AC-05: G = toggle 3D globe / 2D flat map
  AC-06: F = follow selected track (camera lock)
  AC-07: H = return home (configured AOI center)
  AC-08: Ctrl+E = export CoT for selected track
  AC-09: Ctrl+A = acknowledge selected alert
  AC-10: ? = open keyboard shortcut reference modal
  AC-11: / = focus track filter input
  AC-12: ↑↓ = navigate track table rows
  AC-13: Space = toggle timeline LIVE / pause
  AC-14: Shortcuts disabled when: modal open, input has focus
  AC-15: Shortcut reference modal shows all shortcuts with key badges
```

---

## 4. NON-FUNCTIONAL REQUIREMENTS

### 4.1 Performance

```
NFR-P01: Initial page load (LCP)           : <2s on 100Mbps
NFR-P02: Initial page load (LCP on 4G)     : <4s on 10Mbps
NFR-P03: Track update latency              : <100ms from Supabase event to globe update
NFR-P04: Alert banner latency              : <200ms from NATS message to banner visible
NFR-P05: Globe render framerate            : ≥30fps with 100 active track entities
NFR-P06: Globe render framerate target     : 60fps with 20 active track entities
NFR-P07: Track table render                : <50ms for 50 row re-render
NFR-P08: OpenMCT timeline scroll           : <16ms per frame (60fps)
NFR-P09: Memory ceiling                    : <500MB heap after 8hr continuous operation
NFR-P10: NATS message queue               : no dropped messages at 100 msg/s sustained
```

### 4.2 Reliability

```
NFR-R01: Supabase Realtime uptime dependency : dashboard usable read-only if offline
NFR-R02: NATS.ws disconnect                  : auto-reconnect, no operator action required
NFR-R03: Cesium tile CDN failure             : graceful degradation to Mapbox 2D fallback
NFR-R04: Edge Function failure               : dashboard shows last cached data + error badge
NFR-R05: Auth service outage                 : existing sessions remain valid for 8h
NFR-R06: Database read replica               : use Supabase read replica for stats queries
NFR-R07: Stale data detection                : tracks not updated in >120s auto-flagged
```

### 4.3 Security

```
NFR-S01: All API calls authenticated with Supabase JWT
NFR-S02: RLS enforced at database level for all tables
NFR-S03: NATS.ws credentials: read-only, rotated every 30 days
NFR-S04: CoT export audit log: immutable (INSERT-only RLS policy)
NFR-S05: No secrets in client-side bundle (Supabase anon key only)
NFR-S06: CSP headers: restrict script-src to self + Cesium CDN
NFR-S07: Coordinates in UI: coarsened ±50m for all roles except admin
NFR-S08: Session token: httpOnly cookie + CSRF protection via Next.js
NFR-S09: Operator notes: encrypted at rest (Supabase column encryption)
NFR-S10: Civil defense role: cannot see node IDs, positions, or coverage data
```

### 4.4 Compatibility

```
NFR-C01: Browser: Chrome 120+, Firefox 121+, Edge 120+ (WebGL 2.0 required)
NFR-C02: OS: Windows 10+, macOS 12+, Ubuntu 22.04+
NFR-C03: GPU: any WebGL 2.0 capable GPU (Intel UHD 620+)
NFR-C04: No mobile browser support (not a W4 scope)
NFR-C05: ATAK CoT compatibility: exported XML must import into ATAK 4.x
NFR-C06: FreeTAKServer: relay must work with FTS 2.1.x
```

---

## 5. USER STORIES

### 5.1 C2 Commander Stories (UA-02)

```
US-C2-01: As a C2 commander, I want to see all active threat tracks on a 3D
          globe immediately upon opening the dashboard, so that I have a
          complete tactical picture within 2 seconds.

US-C2-02: As a C2 commander, I want to be alerted immediately (≤200ms) when a
          CRITICAL threat is detected, so that I can initiate response without
          delay.

US-C2-03: As a C2 commander, I want to see the threat class (FPV, Shahed,
          helicopter) and confidence level for each track, so that I can
          prioritize response correctly.

US-C2-04: As a C2 commander, I want to see which sensor nodes are online and
          their coverage areas, so that I know the reliability of my intelligence
          picture.

US-C2-05: As a C2 commander, I want the dashboard to clearly indicate when data
          is stale, so that I never act on outdated information.

US-C2-06: As a C2 commander, I want to acknowledge an alert with a single click,
          so that my team knows I have seen and actioned it.

US-C2-07: As a C2 commander, I want keyboard shortcuts for all main actions,
          so that I can operate the dashboard without looking at the mouse.

US-C2-08: As a C2 commander, I want to see how many detections occurred in the
          last hour compared to baseline, so that I can gauge whether threat
          level is escalating.

US-C2-09: As a C2 commander, I want to follow a specific track with the camera,
          so that I can monitor its trajectory without manually panning.

US-C2-10: As a C2 commander, I want to switch between 3D globe and 2D flat map,
          so that I can use the view most appropriate for the situation.

US-C2-11: As a C2 commander, I want to see detection events on a timeline, so
          that I can understand the sequence of events during an incident.

US-C2-12: As a C2 commander, I want to export a threat track as CoT XML with
          Ctrl+E, so that I can relay it to ATAK immediately.

US-C2-13: As a C2 commander, I want alerts in the AlertFeed to stack with the
          most critical on top, so that I never miss a CRITICAL alert due to
          information overload.

US-C2-14: As a C2 commander, I want the dashboard to continue showing last
          known data if the real-time connection drops, so that I retain
          situational awareness during connectivity interruptions.

US-C2-15: As a C2 commander, I want to set the DEFCON level from the dashboard
          (admin only), so that the operational posture is visible to all
          connected operators.
```

### 5.2 Intelligence Analyst Stories (UA-05)

```
US-IA-01: As an analyst, I want to scrub back in time on the OpenMCT timeline,
          so that I can reconstruct the sequence of events from a previous shift.

US-IA-02: As an analyst, I want to see a track's full history on the globe when
          I select a historical time window, so that I can understand the complete
          flight path.

US-IA-03: As an analyst, I want to export all tracks from a time window as a
          CoT bundle, so that I can import them into my intelligence analysis tools.

US-IA-04: As an analyst, I want to annotate a track with operational notes, so
          that I can record intelligence assessments for future reference.

US-IA-05: As an analyst, I want to filter tracks by threat class and confidence,
          so that I can focus my analysis on specific threat types.

US-IA-06: As an analyst, I want to see the full CoT XML for any alert, so that
          I can verify data quality and completeness.

US-IA-07: As an analyst, I want to download threat statistics as CSV for the
          last 7 days, so that I can perform trend analysis in external tools.

US-IA-08: As an analyst, I want to see which detection gates confirmed each
          track (ACOUSTIC, RF, fusion), so that I can assess multi-source
          corroboration.

US-IA-09: As an analyst, I want to search track history by node ID, so that I
          can investigate whether a specific node is generating false positives.

US-IA-10: As an analyst, I want to see the node health history on the timeline,
          so that I can correlate node outages with detection gaps.
```

### 5.3 Civil Defense Coordinator Stories (UA-03)

```
US-CD-01: As a civil defense coordinator, I want to see an overall threat level
          indicator (clear / monitoring / alert / critical), so that I know
          whether to initiate evacuation procedures.

US-CD-02: As a civil defense coordinator, I want threat information presented
          in plain language without military jargon, so that I can brief
          civilian leadership accurately.

US-CD-03: As a civil defense coordinator, I want the dashboard to be read-only
          for my account, so that I cannot accidentally affect the operational
          picture.

US-CD-04: As a civil defense coordinator, I want not to see sensor node IDs or
          positions, so that sensitive OPSEC information is not visible on my screen.

US-CD-05: As a civil defense coordinator, I want coarsened coordinates (±50m) in
          all views, so that precision intelligence is not visible on an
          unclassified screen.
```

### 5.4 Authentication and Access Stories

```
US-A-01: As an operator, I want my session to last 8 hours so that I complete a
         full shift without re-authenticating.

US-A-02: As an operator, I want to re-authenticate in-place (without losing the
         current dashboard state) when my session expires.

US-A-03: As an admin, I want to see a user's last login and current session status,
         so that I can manage access.

US-A-04: As any user, I want to be redirected to login if I attempt to access the
         dashboard without a valid session.

US-A-05: As an operator, I want all my actions (acknowledge, export, annotate)
         logged with my user ID, so that there is a complete audit trail.
```

---

## 6. SUCCESS METRICS

### 6.1 Technical KPIs

```
Metric                              Target          Measurement
──────────────────────────────────────────────────────────────────────────────
Track update latency (p50)          <100ms          Playwright timing test
Track update latency (p99)          <500ms          Playwright timing test
Alert banner latency (CRITICAL)     <200ms          Jest + NATS mock
Initial page load (LCP)             <2s             Lighthouse CI
Globe framerate (20 tracks)         ≥60fps          requestAnimationFrame timing
Globe framerate (100 tracks)        ≥30fps          requestAnimationFrame timing
Zero missed CRITICAL alerts         0 missed        alertStore audit in E2E tests
CoT export validity                 100%            XSD validation in tests
Auth: no unauthenticated access     0 breaches      Playwright auth tests
Coverage: unit tests                ≥80%            Vitest coverage report
E2E tests passing                   100%            Playwright CI
```

### 6.2 Operational KPIs

```
Metric                              Target          How measured
──────────────────────────────────────────────────────────────────────────────
Alert acknowledgement rate          >90%            alert_acknowledgements table
Mean time to acknowledge CRITICAL   <5 minutes      alert_acknowledgements table
False positive rate                 <5%             analyst-annotated tracks
Dashboard availability              >99.5%          Uptime monitoring
Session abandonment rate            <5%             Auth audit logs
CoT relay success rate to FTS       >95%            relay audit log
```

---

## 7. OUT OF SCOPE FOR W4

```
- Mobile app changes (W1 scope)
- NATS backbone changes (W2 scope)
- TdoaCorrelator changes (W3 scope)
- New detection algorithms
- Video feeds from optical sensors
- Two-way communication with field units
- AI-generated threat assessments (planned W5)
- EKF trajectory prediction display (placeholder only in W4, full W5)
- Multi-tenant (single AO per deployment in W4)
- Offline-first PWA (requires IndexedDB caching — W5)
```

---

## 8. DEPENDENCIES

```
Dependency                  Version     Source
────────────────────────────────────────────────────────────
Next.js                     14.x        npm
CesiumJS                    1.115       npm
OpenMCT                     2.x         npm
@supabase/supabase-js        2.x         npm
nats.ws                     2.x         npm (NATS.ws browser client)
zustand                     4.x         npm
@radix-ui/react-*           (shadcn)    npm
tailwindcss                 3.x         npm
typescript                  5.x         npm
vitest                      1.x         npm (unit tests)
@testing-library/react      14.x        npm (component tests)
@playwright/test             1.x         npm (E2E)
────────────────────────────────────────────────────────────

External services:
  Supabase project: bymfcnwfyxuivinuzurr (eu-west-2)
  Cesium Ion: World Terrain access token required
  NATS server: fortress VM (100.68.152.56:4222)
  FreeTAKServer: customer-provided endpoint
```

---

*PRD.md — APEX-SENTINEL W4 — approved 2026-03-24*
