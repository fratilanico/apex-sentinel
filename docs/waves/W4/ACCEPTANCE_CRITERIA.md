# APEX-SENTINEL — ACCEPTANCE_CRITERIA.md
## W4 Acceptance Criteria — C2 Dashboard
### Wave 4 | Project: APEX-SENTINEL | Version: 4.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. W4 EXIT GATE

W4 is complete when ALL of the following are true simultaneously:
1. All 21 PROJECTAPEX docs exist in docs/waves/W4/
2. TDD RED committed (tests written, failing, committed to git)
3. All Vitest tests pass
4. All Playwright E2E tests pass
5. Coverage ≥80% branches/functions/lines/statements
6. npm run build succeeds with zero errors
7. npx tsc --noEmit succeeds with zero errors
8. ESLint passes with zero errors
9. All functional ACs below verified
10. All performance ACs below verified
11. wave-formation.sh complete W4 executed

---

## 2. PROCESS CRITERIA

```
AC-PROC-01: docs/waves/W4/ contains all 21 PROJECTAPEX documents
AC-PROC-02: git log shows TDD-RED commit before any implementation commit
AC-PROC-03: npx vitest run --coverage: all tests PASS
AC-PROC-04: Coverage report: statements ≥80%, branches ≥80%, functions ≥80%, lines ≥80%
AC-PROC-05: npx playwright test: all scenarios PASS (0 failures)
AC-PROC-06: npm run build: exits 0, no TypeScript or webpack errors
AC-PROC-07: npx tsc --noEmit: exits 0
AC-PROC-08: npx eslint src/: 0 errors (warnings acceptable)
AC-PROC-09: No console.error in browser during normal dashboard operation
AC-PROC-10: No CesiumJS deprecation warnings in console
```

---

## 3. FUNCTIONAL CRITERIA BY FR

### FR-W4-01: CesiumJS 3D Globe

```
AC-W4-01-01: Globe renders in browser within 2s of page load (LCP)
AC-W4-01-02: Globe background color is #0A0C10 — no white flash
AC-W4-01-03: Track markers appear at correct WGS84 coordinates (within ±1m)
AC-W4-01-04: FPV_DRONE marker is red (#FF2D2D)
AC-W4-01-05: SHAHED marker is orange (#FF6B00)
AC-W4-01-06: HELICOPTER marker is amber (#FFD700)
AC-W4-01-07: Confidence ≥0.85 marker pulses at 0.8Hz
AC-W4-01-08: Track trail (last 30 positions) visible as dashed polyline
AC-W4-01-09: Camera orbits, zooms, pans, tilts correctly
AC-W4-01-10: Click empty globe: clears selection
AC-W4-01-11: Click track marker: TrackDetail panel opens with correct data
AC-W4-01-12: Double-click track: camera flies to track
AC-W4-01-13: 100 simultaneous entities rendered at ≥30fps
AC-W4-01-14: No SSR crash — CesiumGlobe uses dynamic import ssr:false
```

### FR-W4-02: Supabase Realtime Tracks

```
AC-W4-02-01: Subscription established within 1s of page load
AC-W4-02-02: Header shows ● green "REALTIME" when connected
AC-W4-02-03: Track INSERT: marker appears on globe ≤100ms from DB event
AC-W4-02-04: Track UPDATE: marker position moves ≤100ms from DB event
AC-W4-02-05: Track DELETE: marker removed from globe ≤100ms from DB event
AC-W4-02-06: TrackTable row appears/updates/disappears in sync with globe
AC-W4-02-07: Connection lost: header shows ● red "REALTIME OFFLINE"
AC-W4-02-08: Last known tracks remain visible during connection drop
AC-W4-02-09: Reconnect: full resync executes — no stale data after reconnect
AC-W4-02-10: Memory: no Supabase channel leak on component unmount (verified via DevTools)
```

### FR-W4-03: NATS.ws Alerts

```
AC-W4-03-01: NATS.ws connects within 2s of page load
AC-W4-03-02: Header shows ● green "NATS" when connected
AC-W4-03-03: CRITICAL alert: AlertBanner visible ≤200ms after NATS message
AC-W4-03-04: AlertBanner has role="alert" aria-live="assertive"
AC-W4-03-05: Same alert_id received twice: only one entry in AlertFeed
AC-W4-03-06: Alert queue: max 200 entries, oldest dropped on overflow
AC-W4-03-07: NATS disconnected: header shows ● red "NATS OFFLINE"
AC-W4-03-08: NATS auto-reconnects without operator action
AC-W4-03-09: Malformed JSON message: discarded silently, no crash
AC-W4-03-10: 100 messages/second: zero messages dropped (verified via alertStore count)
```

### FR-W4-04: Track Table

```
AC-W4-04-01: All active tracks shown in table
AC-W4-04-02: Columns: ID, CLASS, CONFIDENCE, LAST SEEN, NODE, ACTIONS
AC-W4-04-03: Default sort: confidence DESC
AC-W4-04-04: Click any column header: sorts that column
AC-W4-04-05: Second click same column: reverses sort direction
AC-W4-04-06: Sort indicator ▲/▼ in active column header
AC-W4-04-07: Threat class filter works for all 8 classes
AC-W4-04-08: Confidence threshold filter works
AC-W4-04-09: Text filter matches by track ID and node ID
AC-W4-04-10: Stale track (>120s): [STALE] badge, 0.5 opacity
AC-W4-04-11: Row click → globe flies to track + TrackDetail opens
AC-W4-04-12: Selected row has distinct background (Surface-active)
AC-W4-04-13: Keyboard ↑↓ navigates rows
AC-W4-04-14: Keyboard Enter opens TrackDetail for selected row
AC-W4-04-15: Keyboard / focuses filter input
```

### FR-W4-05: OpenMCT Timeline

```
AC-W4-05-01: OpenMCT mounts in bottom panel without SSR error
AC-W4-05-02: Timeline shows last 1hr by default
AC-W4-05-03: LIVE mode: green ● "LIVE" indicator active
AC-W4-05-04: Track rows visible with horizontal bars
AC-W4-05-05: Bar color matches threat class (FPV_DRONE = red)
AC-W4-05-06: Node rows: uptime bars green, offline gaps red
AC-W4-05-07: Alert row: event markers at correct timestamps
AC-W4-05-08: Historical mode: scrub to past time works
AC-W4-05-09: Timeline collapse/expand button functional
AC-W4-05-10: get-track-history Edge Function returns data for timeline
```

### FR-W4-06: Node Health Map

```
AC-W4-06-01: Coverage circles visible on globe for all active nodes
AC-W4-06-02: Circle radius matches node.coverage_radius_m from DB
AC-W4-06-03: TIER-1 node circles: green (#00E676)
AC-W4-06-04: TIER-2 node circles: cyan (#00B4FF)
AC-W4-06-05: OFFLINE node circles: red (#FF5252), dashed outline
AC-W4-06-06: Node icons visible at globe zoom ≥14
AC-W4-06-07: Click coverage circle: node detail shows
AC-W4-06-08: Layer toggle "Nodes": circles hide/show
AC-W4-06-09: civil_defense role: coverage circles NOT visible
AC-W4-06-10: get-node-coverage Edge Function returns 403 for civil_defense
```

### FR-W4-07: Alert Detail Panel

```
AC-W4-07-01: Panel shows all fields: ID, severity, track ID, class, confidence,
              coordinates, altitude, heading, speed, node, first seen, last updated
AC-W4-07-02: Coordinates are coarsened ±50m for operator role
AC-W4-07-03: Coordinates are exact for admin role
AC-W4-07-04: CoT XML preview collapsed by default
AC-W4-07-05: CoT XML preview expands on button click
AC-W4-07-06: ACKNOWLEDGE button disabled for analyst role
AC-W4-07-07: Acknowledged alert shows "Acked by [user] at [time]"
AC-W4-07-08: ANNOTATE opens AnnotationModal
AC-W4-07-09: Panel updates when different alert selected (≤200ms)
AC-W4-07-10: Empty state shown when no alert selected
```

### FR-W4-08: CoT Export

```
AC-W4-08-01: Single track export downloads as .cot file
AC-W4-08-02: Downloaded file is valid CoT 2.0 XML
AC-W4-08-03: CoT type correct for FPV_DRONE: "a-h-A-M-F-Q"
AC-W4-08-04: Exported coordinates coarsened (±50m) for operator role
AC-W4-08-05: Exported coordinates exact for admin role
AC-W4-08-06: ce="50" in point element for coarsened export
AC-W4-08-07: No operator user_id in exported CoT XML
AC-W4-08-08: No node_id in exported CoT XML
AC-W4-08-09: Ctrl+E keyboard shortcut triggers export for selected track
AC-W4-08-10: civil_defense role: Export CoT button not present
AC-W4-08-11: Export action logged in operator_audit_log
AC-W4-08-12: RELAY TAK: POST to FreeTAKServer relay endpoint succeeds (test FTS)
```

### FR-W4-09: Threat Statistics

```
AC-W4-09-01: ThreatStatsPanel renders all 7 metrics
AC-W4-09-02: Detections/hr value matches DB count within ±1
AC-W4-09-03: False positive rate displayed as percentage
AC-W4-09-04: Node uptime % matches DB data within ±1%
AC-W4-09-05: Trend indicator ▲ for positive trend, ▼ for negative
AC-W4-09-06: Panel refreshes every 60 seconds
AC-W4-09-07: civil_defense sees "threat_level" only, not full stats
AC-W4-09-08: Zero state: "--" not "0%" when no data
AC-W4-09-09: Tooltips explain each metric on hover
```

### FR-W4-10: Authentication

```
AC-W4-10-01: GET / without session: redirect to /login
AC-W4-10-02: Valid credentials: session created, dashboard loads
AC-W4-10-03: Invalid credentials: error message shown, no redirect
AC-W4-10-04: Session expiry at 8 hours (configurable in Supabase Auth)
AC-W4-10-05: Session expiry: re-auth modal, not page redirect
AC-W4-10-06: operator role: full access except admin functions
AC-W4-10-07: analyst role: read-only + export, no ACK
AC-W4-10-08: admin role: full access including DEFCON
AC-W4-10-09: civil_defense: read-only, no nodes, no CoT, no ACK
AC-W4-10-10: Logout: session cleared, redirect to /login
AC-W4-10-11: RLS: civil_defense JWT returns 0 rows from sensor_nodes (verified via Supabase client)
```

### FR-W4-11: Dark Mode Only

```
AC-W4-11-01: <html class="dark"> in DOM on page load
AC-W4-11-02: Page background color: #0A0C10
AC-W4-11-03: No element with background-color: white or #FFFFFF
AC-W4-11-04: Cesium viewer background: #0A0C10
AC-W4-11-05: OpenMCT theme: dark (Espresso)
AC-W4-11-06: System dark/light preference: dashboard stays dark regardless
AC-W4-11-07: No flash of white content on initial load
AC-W4-11-08: shadcn/ui components: all dark styled
```

### FR-W4-12: Keyboard Shortcuts

```
AC-W4-12-01: T key: right panel switches to tracks view
AC-W4-12-02: N key: right panel switches to nodes view
AC-W4-12-03: A key: right panel switches to alerts view
AC-W4-12-04: ESC: clears selection, closes any open modal
AC-W4-12-05: G key: toggles 3D globe / 2D flat map
AC-W4-12-06: F key: camera follows selected track
AC-W4-12-07: H key: camera returns to home position
AC-W4-12-08: Ctrl+E: exports CoT for selected track
AC-W4-12-09: Ctrl+A: acknowledges selected alert (operator only)
AC-W4-12-10: ? key: opens KeyboardShortcutModal
AC-W4-12-11: / key: focuses TrackTable filter input
AC-W4-12-12: Space: toggles timeline LIVE/pause
AC-W4-12-13: Shortcuts do NOT fire when input element has focus
AC-W4-12-14: Shortcuts do NOT fire when modal is open
AC-W4-12-15: KeyboardShortcutModal shows all shortcuts with correct key badges
```

---

## 4. PERFORMANCE CRITERIA

```
AC-PERF-01: Lighthouse LCP: <2s (measured via Lighthouse CI on production URL)
AC-PERF-02: Lighthouse TBT: <200ms
AC-PERF-03: Initial JS bundle: <500kB gzipped (next-bundle-analyzer)
AC-PERF-04: Track update end-to-end: ≤100ms (Playwright timing assertion)
AC-PERF-05: Alert banner end-to-end: ≤200ms (Playwright timing assertion)
AC-PERF-06: Globe FPS with 20 tracks: ≥60fps (requestAnimationFrame measurement)
AC-PERF-07: Globe FPS with 100 tracks: ≥30fps
AC-PERF-08: TrackTable 50-row re-render: <50ms (React Profiler)
AC-PERF-09: Memory after 8hr simulated operation: heap <500MB
AC-PERF-10: NATS 100msg/s sustained: 0 dropped messages over 60s test
```

---

## 5. SECURITY CRITERIA

```
AC-SEC-01: Unauthenticated requests to all API routes return 401
AC-SEC-02: civil_defense JWT: GET /functions/v1/get-node-coverage returns 403
AC-SEC-03: civil_defense JWT: Supabase query SELECT * FROM sensor_nodes returns 0 rows
AC-SEC-04: Exported CoT: no user_id, session_id, or node_id present
AC-SEC-05: operator_audit_log: export action creates row (INSERT verified)
AC-SEC-06: alert_acknowledgements: UPDATE not possible (403 via RLS)
AC-SEC-07: No Supabase service_role key in client-side bundle (grep verified)
AC-SEC-08: No hardcoded NATS credentials in source code (grep verified)
AC-SEC-09: CSRF: Next.js API routes reject cross-origin POST without CSRF token
AC-SEC-10: Coordinates: operator role sees coarsened coords in all UI + export
```

---

*ACCEPTANCE_CRITERIA.md — APEX-SENTINEL W4 — approved 2026-03-24*
