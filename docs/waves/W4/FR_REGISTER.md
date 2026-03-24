# APEX-SENTINEL W4 — FUNCTIONAL REQUIREMENTS REGISTER
## W4 | PROJECTAPEX Doc 19/20 | 2026-03-24

> Wave: W4 — C2 Dashboard
> FR range: FR-W4-01 through FR-W4-12
> Total sub-requirements: 58
> Total test IDs: 72

---

## FR Numbering Convention

```
FR-W4-{NN}-{SS}
  W4 = Wave 4
  NN = requirement number (01–12)
  SS = sub-requirement (00 = parent, 01+ = child)

Test IDs: T-W4-{NN}-{SS}-{seq}
  seq = sequential number within sub-requirement
```

---

## Priority Legend

```
P0 — BLOCKING. Wave cannot ship without this. Breaks core value prop.
P1 — HIGH. Must ship with wave. Significant user impact if absent.
P2 — MEDIUM. Should ship with wave. Acceptable as known gap with mitigation.
```

---

## FR-W4-01: CesiumJS 3D Globe

**Priority:** P0 — BLOCKING
**Status:** PENDING
**Dependencies:** CesiumJS Ion token, WebGL 2.0 browser, Next.js dynamic import, TrackStore (FR-W4-02)
**Interfaces:** CesiumGlobe.tsx, CesiumViewerInner.tsx, TrackMarker.ts, NodeOverlay.ts

### Description

The C2 dashboard presents a CesiumJS-powered interactive 3D globe as the primary situational
awareness interface. All active and confirmed tracks are rendered as labeled billboard entities
on the globe. Track position, altitude, heading, and threat classification are visually encoded
into the entity appearance.

### Sub-requirements

```
FR-W4-01-01: The globe must render in the browser using WebGL 2.0 (fallback: WebGL 1.0 with
             degraded terrain). A WebGL-unavailable error message must appear if WebGL is
             entirely disabled by the browser (no silent failure).

FR-W4-01-02: Track markers must appear at correct lat/lon/alt_m on the globe surface/altitude.
             Altitude: Cesium.Cartesian3.fromDegrees(lon, lat, alt_m) where alt_m is MSL in
             meters. Null alt_m renders at ground level (alt=0).

FR-W4-01-03: Track marker color encodes threat_level:
             critical → red (#ef4444), high → orange (#f97316),
             medium → yellow (#eab308), low → cyan (#06b6d4), info → green (#22c55e).

FR-W4-01-04: Track marker label shows: "{threat_class} {confidence_pct}%" in white monospace
             font. Label visible at zoom distances < 500km (DistanceDisplayCondition).

FR-W4-01-05: Clicking a track entity: sets TrackStore.activeTrackId, opens AlertDetailPanel
             if the track has an associated alert. Globe camera does NOT fly to track on click
             (only on TrackTable row click — see FR-W4-04).

FR-W4-01-06: When TrackTable row is clicked (FR-W4-04), the globe camera flies to the track
             position (Cesium Viewer.camera.flyTo) with:
             destination: Cartesian3.fromDegrees(lon, lat, alt_m + 5000),
             duration: 2 seconds, no pitch change.

FR-W4-01-07: Dropped tracks (status='dropped') are removed from the globe within 5 seconds
             of Supabase Realtime DELETE/UPDATE event.

FR-W4-01-08: The globe must handle up to 200 simultaneous track entities without frame rate
             dropping below 30 FPS on a machine with Intel Iris Xe (integrated GPU).
```

### Test IDs

```
T-W4-01-01-01: Globe container renders (data-testid="cesium-globe-container" visible)
T-W4-01-02-01: TrackMarker at lat=51.5, lon=-0.12, alt_m=100 has correct Cartesian3 position
T-W4-01-03-01: critical threat_level renders Cesium.Color.RED entity
T-W4-01-03-02: high threat_level renders Cesium.Color.ORANGE entity
T-W4-01-03-03: medium threat_level renders Cesium.Color.YELLOW entity
T-W4-01-04-01: label text = "quadcopter 85%" for threat_class="quadcopter", confidence=0.85
T-W4-01-05-01: clicking track entity calls onTrackSelect with correct trackId
T-W4-01-07-01: dropped track removed from viewer.entities when status updates to 'dropped'
T-W4-01-08-01: 200 entities added to viewer — no JS exception thrown
```

### Acceptance Criteria

```
AC-W4-01-01: CesiumGlobe.tsx renders without error in Next.js App Router (client component,
             dynamic import with ssr:false, Vitest with CesiumJS fully mocked).
AC-W4-01-02: TrackMarker creates an entity with id=track_id and correct Cartesian3 position.
AC-W4-01-03: createTrackEntity returns Cesium.Entity with correct color for all 5 threat levels.
AC-W4-01-04: updateTrackEntity changes entity.position when track lat/lon/alt changes.
AC-W4-01-05: Playwright test confirms globe container mounts and no console errors on /dashboard.
```

---

## FR-W4-02: Supabase Realtime Tracks Subscription

**Priority:** P0 — BLOCKING
**Status:** PENDING
**Dependencies:** Supabase Realtime publication on tracks table, TrackStore (ART-W4-011)
**Latency SLA:** < 100ms from Supabase row write to Zustand store update (client-side)

### Description

The dashboard subscribes to Supabase Realtime postgres_changes on the tracks table
(status filter: active, confirmed). All INSERT, UPDATE, DELETE events are applied to
TrackStore in real time. The subscription status is displayed to the operator.

### Sub-requirements

```
FR-W4-02-01: On mount of the dashboard page, startTracksSubscription() is called.
             On unmount (page unload, logout), stopTracksSubscription() is called.

FR-W4-02-02: INSERT events → upsertTrack(payload.new as Track).

FR-W4-02-03: UPDATE events → upsertTrack(payload.new as Track) — same upsert logic.

FR-W4-02-04: DELETE events → removeTrack(payload.old.track_id).

FR-W4-02-05: Realtime status indicator (small badge in dashboard header) must show:
             connecting (gray spinner), connected (green dot), error (red exclamation),
             disconnected (gray dot — shown on logout or explicit stop).

FR-W4-02-06: On Realtime subscription error, automatic reconnect must occur using
             Supabase client's built-in reconnection logic (no custom retry loop needed).
             Error state must be visible to operator for > 5 seconds before reconnect attempt
             so operator is aware of the gap.

FR-W4-02-07: The subscription filter must be 'status=in.(active,confirmed)' — dropped tracks
             must NOT be streamed (they are already in TrackStore and will be removed via
             UPDATE event when status changes to 'dropped').
```

### Test IDs

```
T-W4-02-01-01: startTracksSubscription sets realtimeStatus to 'connecting' synchronously
T-W4-02-02-01: INSERT event calls upsertTrack with payload.new
T-W4-02-03-01: UPDATE event calls upsertTrack with updated track data
T-W4-02-04-01: DELETE event calls removeTrack with payload.old.track_id
T-W4-02-05-01: realtimeStatus 'connected' after SUBSCRIBED callback fires
T-W4-02-06-01: CHANNEL_ERROR callback sets realtimeStatus to 'error'
T-W4-02-07-01: subscription is called with filter 'status=in.(active,confirmed)'
```

### Acceptance Criteria

```
AC-W4-02-01: Vitest: supabase.channel().on().subscribe() called with correct params.
AC-W4-02-02: Manual: insert row in tracks table → track appears on globe within 3s end-to-end.
             (3s = 0-100ms Realtime + up to 2900ms for TDoA correlator to write row — W2)
AC-W4-02-03: Supabase Realtime status badge reflects all 4 states.
```

---

## FR-W4-03: NATS.ws Alert Subscription

**Priority:** P0 — BLOCKING
**Status:** PENDING
**Dependencies:** NATS.ws proxy (wss://nats.apex-sentinel.io:443), AlertStore (ART-W4-012)
**Latency SLA:** < 200ms from NATS publish to AlertBanner display

### Description

The dashboard subscribes to NATS subject sentinel.alerts.> via the NATS.ws proxy.
Received alerts are added to AlertStore. AlertBanner displays the most recent alert.
NATS connection status is indicated in the dashboard header.

### Sub-requirements

```
FR-W4-03-01: startNatsClient(wsUrl) called on dashboard mount.
             stopNatsClient() called on dashboard unmount/logout.

FR-W4-03-02: All messages on sentinel.alerts.> are decoded (StringCodec), JSON.parsed
             into Alert objects, and passed to addAlert(alert).

FR-W4-03-03: NATS connection status badge in dashboard header:
             connecting (gray spinner), connected (green dot),
             error (red exclamation), disconnected (gray dot).

FR-W4-03-04: NATS.ws must use reconnect: true, maxReconnectAttempts: -1.
             On reconnect: natsStatus → 'connected', no operator action needed.

FR-W4-03-05: JSON parse failure on a NATS message must NOT crash the subscription loop.
             Error logged to console, message skipped, subscription continues.

FR-W4-03-06: Dashboard also subscribes to sentinel.cot.events for CoT XML enrichment.
             Received CoT XML is stored in alert.cot_xml field (enriches matching alert_id).
```

### Test IDs

```
T-W4-03-01-01: startNatsClient sets natsStatus to 'connecting' synchronously
T-W4-03-02-01: valid alert message → addAlert called with parsed Alert object
T-W4-03-02-02: message with extra unknown fields → addAlert called (no throw for unknown fields)
T-W4-03-03-01: NATS reconnect status fires → natsStatus set to 'connected'
T-W4-03-05-01: invalid JSON message → console.error called, no throw, loop continues
T-W4-03-06-01: sentinel.cot.events message → matching alert cot_xml field updated
```

### Acceptance Criteria

```
AC-W4-03-01: Vitest: nats.ws connect() called with correct serverUrl and reconnect config.
AC-W4-03-02: Manual: publish test alert to sentinel.alerts.test → AlertBanner appears
             within 200ms (measured in browser DevTools performance trace).
AC-W4-03-03: Playwright: AlertBanner data-testid visible after nats mock publishes message.
```

---

## FR-W4-04: Track Table

**Priority:** P1 — HIGH
**Status:** PENDING
**Dependencies:** TrackStore (ART-W4-011), FR-W4-02

### Description

A data grid presenting all tracks from TrackStore with sort, filter, pagination,
and row actions (select, export CoT). Accessible as a panel (keyboard shortcut T)
and as a full-screen page (/tracks).

### Sub-requirements

```
FR-W4-04-01: Columns: track_id (8-char prefix), threat_class, threat_level (colored badge),
             confidence (percentage), lat/lon (4 decimal places), alt_m, speed_ms,
             heading_deg, contributing_nodes (count), first_seen_at (relative), status.

FR-W4-04-02: Sort by clicking column header. Supported sort fields:
             confidence, threat_level, first_seen_at, last_updated_at.
             Clicking same header cycles asc → desc → asc.

FR-W4-04-03: Filter controls:
             - Threat level: multi-select checkboxes (critical/high/medium/low/info)
             - Min confidence: slider 0–100%
             - Status: multi-select (active/confirmed/dropped)
             - Contributing node: text input (partial match on node_id)

FR-W4-04-04: Pagination: 50 rows per page (configurable: 25/50/100). Page controls at bottom.
             Total row count displayed: "Showing {start}–{end} of {total}".

FR-W4-04-05: Virtual scrolling for >200 rows using @tanstack/react-virtual.

FR-W4-04-06: Click on row → sets TrackStore.activeTrackId, globe flies to track (FR-W4-01-06).

FR-W4-04-07: Export button per row → calls edge function export-cot?track_id=X →
             downloads {track_id}.cot file. Button shows loading spinner during download.

FR-W4-04-08: Empty state: displays "No active tracks" when TrackStore has 0 tracks.
             Displays "No tracks match current filter" when filter returns 0 results.

FR-W4-04-09: Last updated indicator: "Last updated {relative time}" in table header.
             Updates reactively from TrackStore.lastUpdatedAt.
```

### Test IDs

```
T-W4-04-01-01: TrackTable renders with correct columns
T-W4-04-02-01: clicking 'Confidence' header sorts tracks descending by confidence
T-W4-04-02-02: clicking 'Confidence' header twice sorts ascending
T-W4-04-03-01: threat_level filter 'critical' — only critical tracks shown
T-W4-04-03-02: min_confidence=80 — only tracks with confidence ≥0.80 shown
T-W4-04-04-01: 60 tracks in store → first page shows 50, page controls show "1-50 of 60"
T-W4-04-06-01: clicking row calls onSelect with correct track_id
T-W4-04-07-01: export button triggers download (href with blob URL created)
T-W4-04-08-01: empty store renders "No active tracks" message
T-W4-04-08-02: no filter matches renders "No tracks match current filter"
```

### Acceptance Criteria

```
AC-W4-04-01: Playwright: /tracks page loads, table visible, sort works, filter works.
AC-W4-04-02: Vitest: filter + sort logic tested via getFilteredSortedTracks() in TrackStore.
AC-W4-04-03: Virtual scrolling: 1000 rows render without page freeze (measured via browser perf).
```

---

## FR-W4-05: OpenMCT Timeline Plugin

**Priority:** P1 — HIGH
**Status:** PENDING
**Dependencies:** Supabase get-track-history Edge Function, NATS.ws sentinel.detections.>,
                 apexSentinelPlugin.ts (ART-W4-022)

### Description

OpenMCT 2.0 embedded in the /analytics page, loaded with the custom APEX Sentinel plugin.
The timeline shows detection events per node (confidence over time) with 24hr historical
lookback and real-time streaming from NATS.ws.

### Sub-requirements

```
FR-W4-05-01: OpenMCT viewer initializes on /analytics page with apexSentinelPlugin installed.
             Initial layout: flexible layout with detection timeline + per-node panels.

FR-W4-05-02: Historical telemetry: provider calls GET /functions/v1/get-track-history
             with limit=500. Returns Array<{id,timestamp,value}> for OpenMCT.

FR-W4-05-03: Realtime telemetry: provider subscribes to NATS.ws sentinel.detections.{nodeId}.
             Batches updates every 500ms (OpenMCT requirement for realtime providers).

FR-W4-05-04: Time system: UTC. Clock: local system clock (real-time mode by default).
             Operator can switch to fixed time range (24hr, 12hr, 6hr, 1hr).

FR-W4-05-05: Domain objects are dynamically generated from NodeStore.getOnlineNodes().
             If a node comes online while OpenMCT is open, its telemetry source is added.
```

### Test IDs

```
T-W4-05-01-01: apexSentinelPlugin install does not throw
T-W4-05-02-01: historical provider supportsRequest returns true for apex-sentinel domain objects
T-W4-05-02-02: historical provider request calls get-track-history with correct params
T-W4-05-03-01: realtime provider subscribe attaches NATS.ws listener for correct subject
T-W4-05-03-02: realtime provider unsubscribe stops NATS messages from reaching callback
T-W4-05-04-01: time system registered as 'utc'
```

### Acceptance Criteria

```
AC-W4-05-01: OpenMCT viewer mounts on /analytics without React error boundary trigger.
AC-W4-05-02: Historical telemetry request returns ≥1 data point for active track (live test).
AC-W4-05-03: Realtime point appears in OpenMCT panel within 500ms of NATS message (live test).
```

---

## FR-W4-06: Node Health Overlay

**Priority:** P1 — HIGH
**Status:** PENDING
**Dependencies:** NodeStore (ART-W4-013), get-node-status-batch Edge Function, CesiumJS

### Description

Sentinel nodes displayed as coverage circles on the CesiumJS globe. Color encodes tier
and status. NodeHealthPanel (left sidebar) provides tabular node health data.

### Sub-requirements

```
FR-W4-06-01: Each node in NodeStore renders a Cesium.CircleGeometry on the globe:
             center = node lat/lon, radius = node.coverage_radius_m.

FR-W4-06-02: Circle fill color by tier × status:
             tier_1 + online:   blue  (#3b82f6) 0.15 alpha
             tier_2 + online:   green (#22c55e) 0.12 alpha
             tier_3 + online:   yellow (#eab308) 0.10 alpha
             any tier + offline: red  (#ef4444) 0.20 alpha
             any tier + degraded: orange (#f97316) 0.15 alpha

FR-W4-06-03: Node coverage circles are click-selectable: click → NodeStore.setActiveNode(nodeId).

FR-W4-06-04: NodeHealthPanel shows tabular list: node_id, tier badge, status dot,
             last_seen (relative), battery %, signal RSSI, detection count (24hr).

FR-W4-06-05: NodeStore polls get-node-status-batch every 30 seconds.
             Offline nodes (last_seen > 15min) display a pulsing red border in NodeHealthPanel.

FR-W4-06-06: NodeStore computes node.status client-side:
             online:   last_seen < 5 minutes ago
             degraded: last_seen 5–15 minutes ago
             offline:  last_seen > 15 minutes ago
```

### Test IDs

```
T-W4-06-01-01: NodeOverlay.createNodeCoverageCircle returns Cesium.Entity with CircleGeometry
T-W4-06-02-01: tier_1 online node → blue fill color
T-W4-06-02-02: offline node → red fill color
T-W4-06-05-01: NodeStore.pollingStatus transitions to 'polling' during fetch
T-W4-06-06-01: node last_seen = 3min ago → status = 'online'
T-W4-06-06-02: node last_seen = 10min ago → status = 'degraded'
T-W4-06-06-03: node last_seen = 20min ago → status = 'offline'
```

### Acceptance Criteria

```
AC-W4-06-01: Vitest: createNodeCoverageCircle creates entity with correct color for each tier/status.
AC-W4-06-02: Playwright: /nodes page shows NodeHealthPanel with node list.
AC-W4-06-03: Manual: node not seen for 20min → offline indicator appears within 30s of next poll.
```

---

## FR-W4-07: Alert Detail Panel

**Priority:** P1 — HIGH
**Status:** PENDING
**Dependencies:** AlertStore (ART-W4-012), FR-W4-03

### Description

A right-side drawer panel (400px) showing full alert details: classification, geography,
contributing nodes, raw CoT XML, and export options. Opens when operator clicks AlertBanner
or selects an alert from alert history.

### Sub-requirements

```
FR-W4-07-01: Panel opens as right-side drawer (slide in from right, 400px wide, full height).
             Keyboard shortcut ESC closes it (via UIStore.closeActivePanel()).

FR-W4-07-02: Sections displayed:
             a) Threat classification: threat_level badge, threat_class, confidence bar (0-100%)
             b) Geographic location: lat/lon (decimal degrees, 4dp), alt_m, geo_sector
             c) Contributing nodes: list of node_ids with tier indicator
             d) Timeline: dispatched_at (formatted: DD MMM YYYY HH:MM:SS UTC)
             e) CoT XML: syntax-highlighted, monospace, scrollable, copy-to-clipboard button
             f) Export buttons: "Download .cot" and "Download .json"

FR-W4-07-03: CoT XML section only renders if alert.cot_xml is present.
             If absent: shows "CoT data not available" message.

FR-W4-07-04: "Download .cot" triggers a browser download of alert CoT XML as {alert_id}.cot.
             This is a client-side download (no Edge Function call) using Blob + createObjectURL.

FR-W4-07-05: Alert history list accessible via /alerts page or panel header "History" tab.
             History shows last 500 alerts (AlertStore.alerts), scrollable, newest first.
             Each history item shows: time (relative), threat_level badge, threat_class.
             Click → opens detail for that alert.
```

### Test IDs

```
T-W4-07-01-01: AlertDetailPanel renders with data-testid="alert-detail-panel"
T-W4-07-02-01: confidence 0.87 renders as "87%" confidence bar width
T-W4-07-02-02: contributing nodes list shows all node_ids from alert
T-W4-07-03-01: cot_xml present → CoT section renders with XML content
T-W4-07-03-02: cot_xml absent → "CoT data not available" message shown
T-W4-07-04-01: Download .cot creates Blob with application/xml content
T-W4-07-05-01: alert history shows alerts sorted newest first
```

### Acceptance Criteria

```
AC-W4-07-01: Playwright: alert panel opens after AlertBanner click, shows correct alert data.
AC-W4-07-02: Vitest: all panel sections render correctly for fully-populated Alert object.
AC-W4-07-03: CoT XML copy button writes to clipboard (mocked in Vitest, E2E verified manually).
```

---

## FR-W4-08: CoT Export

**Priority:** P1 — HIGH
**Status:** PENDING
**Dependencies:** export-cot Edge Function (ART-W4-015), cotExport.ts (ART-W4 lib),
                 Supabase Auth JWT (analyst or admin role)

### Description

Operators can export track data in Cursor-on-Target (CoT) XML format, compatible with
ATAK, WinTAK, and other TAK-family C2 systems. Single track export (immediate download)
and bulk time-range export (zip archive).

### Sub-requirements

```
FR-W4-08-01: Single track CoT export: client-side only (no Edge Function call).
             Uses cotExport.buildCotXml(track) → Blob → createObjectURL → click download.
             File name: {track_id}.cot

FR-W4-08-02: Bulk CoT export: calls GET /functions/v1/export-cot?start_time=X&end_time=Y.
             Returns Content-Type: application/zip. Downloaded as apex-sentinel-export-{ts}.zip.

FR-W4-08-03: Bulk export UI: date/time range picker (start, end).
             Maximum range: 4 hours (EXPORT_MAX_HOURS env var).
             Exceeded range: shows validation error "Maximum export range is 4 hours".

FR-W4-08-04: CoT XML format: MIL-STD-2525D event type codes. Fields:
             uid: APEX-SENTINEL-{track_id}
             type: threat_class mapped to CoT type code (a-h-A-C-F for quadcopter, etc.)
             time/start: ISO 8601 with ms precision
             stale: time + 5 minutes
             point: lat, lon, hae (alt_m), ce=111, le=9999
             detail/contact: callsign = DRONE-{track_id_suffix_6}
             detail/track: course (heading_deg), speed (speed_ms)
             detail/remarks: "APEX-SENTINEL: {threat_class} {confidence}% [{THREAT_LEVEL}]"
             detail/apex_sentinel: all custom fields as XML attributes

FR-W4-08-05: Export rate limit UI: if rate limit exceeded (HTTP 429 from Edge Function),
             show "Export limit reached. Try again in {seconds}s." with countdown.

FR-W4-08-06: Export requires analyst or admin role. Operator role sees disabled export buttons
             with tooltip "Analyst or Admin role required".
```

### Test IDs

```
T-W4-08-01-01: buildCotXml returns valid XML string for Track object
T-W4-08-01-02: CoT uid = "APEX-SENTINEL-{track_id}"
T-W4-08-01-03: CoT point lat/lon/hae match track lat/lon/alt_m
T-W4-08-04-01: quadcopter → CoT type "a-h-A-C-F"
T-W4-08-04-02: fixed-wing → CoT type "a-h-A-C-F-A"
T-W4-08-04-03: helicopter → CoT type "a-h-A-C-H"
T-W4-08-05-01: buildBulkCotZip returns Blob of type application/zip containing N .cot files
T-W4-08-06-01: operator role → export buttons disabled + tooltip shown
```

### Acceptance Criteria

```
AC-W4-08-01: Vitest: buildCotXml output is valid XML (parsed by DOMParser without errors).
AC-W4-08-02: Playwright: clicking export button triggers file download (no error).
AC-W4-08-03: Manual: downloaded .cot file imports successfully into ATAK / TAK Server.
```

---

## FR-W4-09: Threat Statistics Panel

**Priority:** P1 — HIGH
**Status:** PENDING
**Dependencies:** get-coverage-stats Edge Function (ART-W4-017), TrackStore, NodeStore

### Description

A stats panel (keyboard shortcut S) showing aggregate threat metrics, detection rate,
node coverage, and a 60-minute rolling detection timeline.

### Sub-requirements

```
FR-W4-09-01: Stats displayed:
             - Active tracks: total count + breakdown by threat_level (bar chart)
             - Detections/hr: rolling 60-minute count (line chart, 1 data point per minute)
             - Nodes: {online}/{total}
             - Coverage: {coverage_percent}% of AOR ({aor_km2} km²)
             - Alerts (24hr): total count
             - Top threat class: most common threat_class in last 4 hours

FR-W4-09-02: get-coverage-stats polled every 60 seconds. Cache-Control: max-age=60 handled
             by Edge Function — do NOT poll more frequently than 60s.

FR-W4-09-03: Active track count and breakdown derived from TrackStore directly (reactive).
             Does not poll — updates as Realtime delivers new tracks.

FR-W4-09-04: Stats panel is non-blocking: if get-coverage-stats returns error, other
             stats (from TrackStore/NodeStore) still render. Error indicator shown for
             the server-side stats section only.

FR-W4-09-05: "Last refreshed: {relative time}" shown below server-side stats.
```

### Test IDs

```
T-W4-09-01-01: ThreatStatsPanel renders without error when stores are empty
T-W4-09-01-02: 3 active tracks in TrackStore → "3 active tracks" shown
T-W4-09-03-01: ThreatStatsPanel reads from useTrackStore (no props — store-only)
T-W4-09-04-01: get-coverage-stats error → partial render (TrackStore stats shown, error badge on server stats)
T-W4-09-05-01: lastRefreshedAt shows correct relative time
```

### Acceptance Criteria

```
AC-W4-09-01: Vitest: panel renders correct values from mocked TrackStore and NodeStore.
AC-W4-09-02: Manual: 10 active tracks → panel shows 10. New track arrives → count updates reactively.
AC-W4-09-03: Manual: get-coverage-stats offline → error badge visible, track count still updates.
```

---

## FR-W4-10: Supabase Auth (RBAC)

**Priority:** P0 — BLOCKING
**Status:** PENDING
**Dependencies:** Supabase Auth (email + magic link), Next.js middleware, dashboard_sessions table

### Description

All dashboard routes are protected by Supabase Auth. Three roles (operator/analyst/admin)
are enforced via Next.js middleware RBAC. Unauthenticated requests redirect to /login.

### Sub-requirements

```
FR-W4-10-01: /login page provides: email input, "Send magic link" button.
             On submit: calls supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } }).
             Success: "Check your email for a login link." message shown.
             Error: clear error message (e.g., "Invalid email address").

FR-W4-10-02: /auth/callback route: receives Supabase auth callback, exchanges code for session,
             redirects to /dashboard (or original ?redirect= path).

FR-W4-10-03: Next.js middleware enforces auth on all /dashboard/*, /tracks, /nodes, /alerts,
             /analytics routes. Unauthenticated → redirect /login?redirect=<originalPath>.

FR-W4-10-04: Role enforcement in middleware:
             /analytics — analyst and admin only (operator redirect to /dashboard)
             All other dashboard routes — all 3 roles

FR-W4-10-05: User role is stored in auth.users.raw_user_meta_data.role (set by admin on invite).
             Edge Functions validate role from JWT user_metadata claim.

FR-W4-10-06: Auth session refresh: Supabase client handles automatically.
             If session expires mid-session: user is redirected to /login silently (no error modal).

FR-W4-10-07: Logout: button in dashboard header. Calls supabase.auth.signOut().
             Clears session. Redirects to /login. Clears AlertStore sessionStorage.

FR-W4-10-08: dashboard_sessions table: INSERT on each successful auth callback
             (user_id, role, ip_address from x-forwarded-for header, user_agent).
             INSERT is non-blocking — dashboard proceeds even if audit INSERT fails.
```

### Test IDs

```
T-W4-10-01-01: /login page renders email input and submit button
T-W4-10-01-02: valid email → supabase.auth.signInWithOtp called
T-W4-10-01-03: supabase error → error message displayed
T-W4-10-03-01: unauthenticated GET /dashboard → redirect to /login?redirect=/dashboard
T-W4-10-04-01: operator role GET /analytics → redirect to /dashboard
T-W4-10-04-02: analyst role GET /analytics → 200 (no redirect)
T-W4-10-07-01: signOut() called on logout button click → redirect to /login
T-W4-10-08-01: dashboard_sessions INSERT called with correct user_id and role
```

### Acceptance Criteria

```
AC-W4-10-01: Playwright: full magic link flow (mocked — magic link URL generated, followed,
             session established, /dashboard accessible).
AC-W4-10-02: Playwright: unauthenticated /dashboard → /login redirect.
AC-W4-10-03: Playwright: operator role → /analytics → redirect to /dashboard.
AC-W4-10-04: Vitest middleware tests: all ROLE_REQUIRED paths enforced correctly.
```

---

## FR-W4-11: Dark Mode Enforced

**Priority:** P2 — MEDIUM (cosmetic but specified in requirements)
**Status:** PENDING
**Dependencies:** Tailwind CSS, Next.js App Router

### Description

The C2 dashboard is permanently dark mode. No light/dark toggle is provided.
Dark mode is enforced at the HTML root level and does not respond to system preference.

### Sub-requirements

```
FR-W4-11-01: Root layout adds className="dark" to <html> element unconditionally.

FR-W4-11-02: Tailwind CSS configured with darkMode: 'class'. All components use
             dark: prefixed classes for correct dark appearance.

FR-W4-11-03: Background color hierarchy:
             Page background:       bg-gray-950 (#030712)
             Panel background:      bg-gray-900 (#111827)
             Card background:       bg-gray-800 (#1f2937)
             Border:                border-gray-700 (#374151)
             Primary text:          text-white
             Secondary text:        text-gray-400
             Muted text:            text-gray-500

FR-W4-11-04: CesiumJS globe dark sky: viewer.scene.backgroundColor = Cesium.Color.BLACK.
             Cesium.Moon visible if viewing at night altitude.

FR-W4-11-05: No <meta name="color-scheme"> override allowed (keep browser default).
             Scrollbars must use dark styling: ::-webkit-scrollbar CSS applied globally.
```

### Test IDs

```
T-W4-11-01-01: root layout renders <html class="dark">
T-W4-11-03-01: dashboard page background is gray-950 (computed style check in RTL)
```

### Acceptance Criteria

```
AC-W4-11-01: Playwright: document.documentElement.classList.contains('dark') === true.
AC-W4-11-02: No white flash on page load (SSR renders dark background immediately).
AC-W4-11-03: All shadcn/ui components render correctly in dark mode (visual inspection).
```

---

## FR-W4-12: Keyboard Shortcuts

**Priority:** P2 — MEDIUM
**Status:** PENDING
**Dependencies:** UIStore (ART-W4-014), useKeyboardShortcuts hook (ART-W4-010)

### Description

Global keyboard shortcuts for panel navigation, fullscreen toggle, and help modal.
Shortcuts are disabled when focus is in an input, textarea, or select element.

### Sub-requirements

```
FR-W4-12-01: Shortcut bindings:
             T         → toggle tracks panel
             N         → toggle nodes panel
             A         → toggle alerts panel
             S         → toggle stats panel
             F         → toggle fullscreen (document.fullscreenElement API)
             ESC       → close active panel
             / (slash) → open keyboard shortcut help modal

FR-W4-12-02: Shortcuts are case-insensitive (T and t both work).

FR-W4-12-03: Shortcuts are disabled when:
             document.activeElement.tagName is INPUT, TEXTAREA, or SELECT.
             e.metaKey, e.ctrlKey, or e.altKey is true.

FR-W4-12-04: Shortcut help modal: overlay listing all shortcuts with descriptions.
             Closed by ESC or / or clicking outside.

FR-W4-12-05: Shortcut activation fires e.preventDefault() to avoid browser interference
             (e.g., F does not trigger browser Find, / does not trigger browser Quick Find).

FR-W4-12-06: Fullscreen uses requestFullscreen() on document.documentElement.
             If fullscreen API unavailable (iframe context): shortcut is silently ignored.
```

### Test IDs

```
T-W4-12-01-01: keydown 'T' → togglePanel('tracks') called
T-W4-12-01-02: keydown 'N' → togglePanel('nodes') called
T-W4-12-01-03: keydown 'A' → togglePanel('alerts') called
T-W4-12-01-04: keydown 'S' → togglePanel('stats') called
T-W4-12-01-05: keydown 'Escape' → closeActivePanel() called
T-W4-12-02-01: keydown 't' (lowercase) → togglePanel('tracks') called
T-W4-12-03-01: focus on INPUT → keydown 'T' → togglePanel NOT called
T-W4-12-03-02: e.ctrlKey=true → togglePanel NOT called
T-W4-12-05-01: keydown '/' → e.preventDefault called
T-W4-12-05-02: keydown 'F' → e.preventDefault called
```

### Acceptance Criteria

```
AC-W4-12-01: Vitest: all 10 shortcut test cases pass.
AC-W4-12-02: Playwright: keyboard.press('t') on dashboard page → track panel visible.
AC-W4-12-03: Playwright: keyboard.press('Escape') after panel open → panel closes.
AC-W4-12-04: No browser shortcut conflict observed in manual test (F, T, N, A, S, ESC, /).
```

---

## FR Summary Table

| FR | Name | Priority | Tests | Status |
|----|------|----------|-------|--------|
| FR-W4-01 | CesiumJS 3D Globe | P0 | 9 | PENDING |
| FR-W4-02 | Realtime Tracks | P0 | 7 | PENDING |
| FR-W4-03 | NATS.ws Alerts | P0 | 6 | PENDING |
| FR-W4-04 | Track Table | P1 | 10 | PENDING |
| FR-W4-05 | OpenMCT Timeline | P1 | 6 | PENDING |
| FR-W4-06 | Node Health Overlay | P1 | 7 | PENDING |
| FR-W4-07 | Alert Detail Panel | P1 | 7 | PENDING |
| FR-W4-08 | CoT Export | P1 | 8 | PENDING |
| FR-W4-09 | Threat Stats Panel | P1 | 5 | PENDING |
| FR-W4-10 | Auth RBAC | P0 | 8 | PENDING |
| FR-W4-11 | Dark Mode | P2 | 2 | PENDING |
| FR-W4-12 | Keyboard Shortcuts | P2 | 10 | PENDING |

**Total test IDs: 85 (unit/component level)**
**E2E test IDs (Playwright): ~60 additional (see ARTIFACT_REGISTRY.md ART-W4-024)**
