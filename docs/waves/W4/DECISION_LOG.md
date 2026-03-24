# APEX-SENTINEL — DECISION_LOG.md
## W4 Architecture Decision Log — C2 Dashboard
### Wave 4 | Project: APEX-SENTINEL | Version: 4.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## DECISION FORMAT

```
DEC-W4-NNN
Date      : YYYY-MM-DD
Status    : DECIDED | SUPERSEDED | REVISIT
Deciders  : [who decided]
Context   : What was the question
Decision  : What was decided
Rationale : Why
Trade-offs: What was given up
Consequences: What this means going forward
```

---

## DEC-W4-001: CesiumJS vs Mapbox GL JS for 3D Globe

```
Date      : 2026-03-24
Status    : DECIDED
Deciders  : Nico Fratila (technical authority)

Context:
  W4 requires a 3D globe for rendering threat tracks with altitude information.
  Two primary options: CesiumJS (3D-first) or Mapbox GL JS (2D-first with 3D layers).

Decision:
  CesiumJS 1.115 as primary renderer. Mapbox GL JS as 2D fallback only.

Rationale:
  1. ECEF coordinates: CesiumJS natively uses Earth-Centered Earth-Fixed coordinate
     system. Threat tracks from TdoaCorrelator include altitude data. Rendering a
     120m-altitude FPV drone in CesiumJS is trivial (Cartesian3.fromDegrees with
     altitude). In Mapbox 3D, altitude requires manual extrusion math with globe
     projection complications.

  2. Military standard: CesiumJS is the dominant 3D globe in defense applications
     (used by Palantir, Esri ArcGIS, many NATO C2 systems). Operators trained on
     military GIS expect CesiumJS-style interaction (orbit, tilt, ECEF).

  3. Terrain integration: Cesium World Terrain provides high-resolution elevation
     data. Threat tracks can be rendered correctly relative to terrain (a drone
     at 50m AGL in a valley looks different from the same altitude on a plateau).

  4. Free for defense use: CesiumJS is Apache 2.0 licensed. Cesium Ion commercial
     features (World Terrain) have a free tier sufficient for this deployment.
     Mapbox GL JS changed to BSL license in 2021 — commercial use requires paid plan.

  5. Entity model: CesiumJS Entity API allows update-in-place (no destroy/recreate
     cycle). 100 entities at 60fps is achievable without React involvement.

Trade-offs:
  - CesiumJS bundle is large (~3MB gzipped). Partially mitigated by dynamic import.
  - SSR incompatible — requires 'use client' and ssr: false. Acceptable: dashboard
    is a single-page app by nature.
  - Mapbox has better 2D tile rendering quality. Addressed by using Mapbox satellite
    imagery as CesiumJS imagery layer.

Consequences:
  - next.config.js requires CopyWebpackPlugin for Cesium Workers/Assets
  - CESIUM_BASE_URL must be set before any Cesium import
  - CesiumGlobe.tsx must use dynamic import pattern
  - Unit tests must mock Cesium (no WebGL in CI)
```

---

## DEC-W4-002: Next.js 14 App Router vs Vite SPA

```
Date      : 2026-03-24
Status    : DECIDED

Context:
  W4 is a real-time dashboard. Two main options: Next.js 14 with App Router
  (SSR + RSC + client hybrid) or a Vite/React SPA (client-only).

Decision:
  Next.js 14 App Router.

Rationale:
  1. Initial data load: App Router Server Components can prefetch initial tracks
     list, node list, and recent alerts using the Supabase service role key
     (never exposed to client). This means the dashboard renders with data on
     first paint — no loading skeleton for initial track list.

  2. Authentication middleware: Next.js middleware runs at edge, intercepts
     unauthenticated requests before any page component renders. Clean auth
     boundary.

  3. API routes: /api/relay-tak can live alongside the dashboard without a
     separate Express server. Reduces infrastructure complexity.

  4. Existing W1-W3 precedent: APEX-SENTINEL already has Supabase Edge Functions
     for backend. No need for a separate API layer.

  5. Vercel deployment: Next.js deploys to Vercel with zero config. Dashboard
     needs to be on a fast CDN with SSL and custom domain.

Trade-offs:
  - App Router adds complexity vs Vite SPA: Server/Client component boundary,
    'use client' directive discipline required, Server Actions (not used in W4).
  - CesiumJS + OpenMCT require 'use client' on all globe/timeline components —
    effectively most of the UI is client components anyway. SSR benefit is
    limited to initial data prefetch and auth middleware.

Consequences:
  - All globe/Cesium components: 'use client' + dynamic import ssr:false
  - Server Components used only for: layout, page (initial data prefetch), login
  - Auth: Next.js middleware + Supabase Auth cookies
```

---

## DEC-W4-003: OpenMCT vs Custom Timeline Component

```
Date      : 2026-03-24
Status    : DECIDED

Context:
  W4 needs a time-series timeline showing track history, node uptime, and
  alert events. Options: OpenMCT (NASA), custom React timeline (e.g., vis-timeline),
  or a charting library (Recharts, Chart.js).

Decision:
  OpenMCT 2.x as timeline component.

Rationale:
  1. NASA-grade: OpenMCT was built for mission operations — exactly the use case
     for a C2 dashboard. It natively understands: LIVE mode, historical playback,
     time conductor, multi-source telemetry, synchronized views.

  2. Temporal scrubbing: OpenMCT's time conductor provides synchronized scrubbing
     across all timeline rows. When an analyst scrubs to T-2hr, all rows update
     simultaneously. Custom implementation would take 2+ weeks.

  3. Plugin architecture: OpenMCT has a well-defined plugin API. ApexSentinelPlugin.ts
     provides domain objects, telemetry providers, and subscriptions. The plugin
     pattern maps cleanly to Zustand store subscriptions (live) and Edge Functions
     (historical).

  4. Precedent: Used in real-world military ops room contexts (NASA, ESA, several
     defense contractors have adopted it). Operators familiar with ATAK will
     recognize the time-conductor paradigm.

Trade-offs:
  - OpenMCT is a large dependency (~2MB). Mitigated by dynamic import.
  - OpenMCT has its own theming system. Must be configured with dark Espresso theme.
  - OpenMCT does not support tree-shaking — full bundle pulled in.
  - Integration with React requires a ref-based mount pattern, not JSX.

Consequences:
  - OpenMCTTimeline.tsx: mount via useEffect + ref, not as React children
  - ApexSentinelPlugin.ts: bridges Zustand store to OpenMCT telemetry API
  - Espresso dark theme installed via openmct.install(openmct.plugins.themes.Espresso())
```

---

## DEC-W4-004: Supabase Realtime vs Polling for Track Updates

```
Date      : 2026-03-24
Status    : DECIDED

Context:
  W4 needs track position updates with <100ms latency. Two options:
  Supabase Realtime (WebSocket) or periodic REST polling.

Decision:
  Supabase Realtime (postgres_changes subscription).

Rationale:
  1. Latency: Supabase Realtime delivers WAL events within ~10-50ms of DB write.
     Polling at 1Hz delivers updates with 0-1000ms lag (500ms average). Polling
     at 10Hz is technically feasible but wastes bandwidth and DB connections.

  2. W4 requirement: <100ms track update. Achievable only with Realtime.
     Polling cannot guarantee this.

  3. Bandwidth: Realtime sends only the changed row. 10Hz polling sends full
     track list on every request (50 tracks × 200 bytes = 10KB every 100ms =
     100KB/s per client). With 10 concurrent operators: 1MB/s just for track data.

  4. W1-W3 precedent: Supabase Realtime is already the persistence layer for
     tracks. No new infrastructure needed.

Trade-offs:
  - WebSocket connections have overhead: 1 persistent connection per client.
    With 20 operators: 20 connections. Supabase handles this easily.
  - Realtime can drop events under extreme DB load. Mitigated by resync-on-reconnect.
  - Realtime subscription filter (status=eq.ACTIVE) requires Supabase ≥2.x client.

Consequences:
  - trackSubscriber.ts manages channel lifecycle with reconnect + full resync
  - trackStore.replaceAll() called on reconnect to guarantee consistency
  - ConnectionStatus component shows real-time Supabase connection health
```

---

## DEC-W4-005: NATS.ws vs Server-Sent Events for Alert Stream

```
Date      : 2026-03-24
Status    : DECIDED

Context:
  Alerts are published to NATS on the backend. W4 needs to receive these.
  Options: NATS.ws (browser NATS client), SSE (server pushes from Edge Function),
  or Supabase Realtime on alerts table.

Decision:
  NATS.ws (native browser NATS WebSocket client).

Rationale:
  1. Same protocol as backend: TdoaCorrelator publishes to NATS. NATS.ws subscribes
     directly to the same subjects (sentinel.alerts.>). No translation layer needed.

  2. Bidirectional: NATS.ws supports request-reply patterns. W5 may use this for
     bidirectional C2 messaging. SSE is unidirectional.

  3. Subject filtering: NATS wildcard subjects (sentinel.alerts.>) are native to
     NATS. SSE would require the server to fan out to multiple SSE connections.

  4. Latency: NATS.ws delivers messages with NATS latency (~1-5ms within the
     same datacenter). SSE adds an HTTP layer.

  5. W2/W3 reuse: NatsClient pattern already exists in W2/W3. NatsWsClient.ts
     is an adaptation of the existing pattern for the browser.

Trade-offs:
  - NATS.ws exposes NATS server directly to browser clients. Requires a read-only
     NATS user with scoped subject access.
  - NATS server must have a WebSocket listener (port 4223). Currently fortress VM.
  - NATS.ws reconnect is handled by the nats.ws library, but monitoring reconnects
     requires a status loop (handled in NatsWsClient.ts).

Consequences:
  - NATS.ws port 4223 must be open on fortress VM
  - NATS user 'dashboard_ro' created with subscribe-only on sentinel.>
  - NatsProvider.tsx manages singleton connection lifecycle
```

---

## DEC-W4-006: Zustand vs Jotai vs Redux for State Management

```
Date      : 2026-03-24
Status    : DECIDED

Context:
  Dashboard needs global state for: tracks (50+ active, real-time), alerts (200
  buffered), nodes (50+ registered), and UI state. Options: Zustand, Jotai, or Redux.

Decision:
  Zustand 4.x with subscribeWithSelector middleware.

Rationale:
  1. Complex store interactions: trackStore and alertStore need to be read by
     multiple components (TrackTable, CesiumGlobe, OpenMCT, ThreatStatsPanel).
     Zustand's store pattern (single store with selectors) is simpler than Jotai's
     atom composition for these cross-cutting concerns.

  2. subscribeWithSelector: allows CesiumJS entity manager to subscribe to
     Zustand store changes WITHOUT going through React (zero React re-renders
     for globe entity position updates). This is essential for 60fps globe rendering.

  3. Performance: Zustand selectors prevent unnecessary re-renders. TrackTable
     subscribes only to the array of visible tracks, not the full Map. AlertBanner
     subscribes only to criticalAlerts array.

  4. Simplicity over Redux: Redux Toolkit requires actions + reducers + selectors
     for every operation. Zustand's set() pattern is sufficient and far less
     boilerplate.

  5. Jotai alternative: Jotai atoms are granular (good for small isolated state).
     Track state requires complex cross-atom derived state (active count, by class,
     by staleness). Zustand getState() API makes this clean.

Trade-offs:
  - Zustand stores are not serializable by default (Map<string, Track>). Devtools
     integration limited compared to Redux. Acceptable: dashboard is not debugged
     via time-travel.
  - Jotai would have been slightly better for the UI store (simple boolean atoms).
     Zustand used everywhere for consistency.

Consequences:
  - 4 stores: trackStore, alertStore, nodeStore, uiStore
  - subscribeWithSelector enables CesiumJS entity manager subscription
  - All stores exported as custom hooks (useTrackStore, etc.)
```

---

## DEC-W4-007: shadcn/ui vs Custom UI Components vs MUI

```
Date      : 2026-03-24
Status    : DECIDED

Context:
  Dashboard needs UI primitives: tables, modals, dropdowns, badges, inputs.
  Options: shadcn/ui (copy-paste Radix UI), Material UI (MUI), custom built.

Decision:
  shadcn/ui with custom military dark theme.

Rationale:
  1. Accessible: shadcn/ui is built on Radix UI primitives — all ARIA roles,
     keyboard navigation, and focus management handled by Radix. Critical for
     keyboard-operated ops room dashboard.

  2. No bundle overhead: shadcn/ui copies component source into the project.
     No runtime dependency. Only the components used are included.

  3. Full dark mode control: shadcn components use CSS variables that map to
     Tailwind dark: classes. Overriding the dark theme is straightforward.
     MUI's dark mode theming requires a MuiThemeProvider wrapper and is harder
     to fully control at the CSS variable level.

  4. Tailwind native: All styling via Tailwind classes. Consistent with the
     project's Tailwind setup. No CSS-in-JS runtime.

  5. No MUI: MUI brings ~200kB gzipped to the bundle. For a dashboard that
     already has CesiumJS and OpenMCT, bundle size is critical. shadcn adds ~0
     (it's source code, tree-shaken naturally).

Trade-offs:
  - shadcn components must be copied into src/components/ui/ — no auto-updates
     from npm. Must manually update if Radix UI primitives change.
  - Some complex components (date pickers, rich selects) require more work with
     shadcn than with MUI. Not needed in W4.

Consequences:
  - npx shadcn-ui@latest init run during P1 scaffold
  - components.json configured with dark mode + military color palette
  - All shadcn components themed with Surface-* CSS variables
```

---

## DEC-W4-008: Playwright vs Cypress for E2E Tests

```
Date      : 2026-03-24
Status    : DECIDED

Context:
  W4 requires E2E tests for: auth flow, Realtime track updates, NATS alert
  banner, CoT export, keyboard shortcuts. Options: Playwright or Cypress.

Decision:
  Playwright 1.x.

Rationale:
  1. Multi-browser: Playwright runs on Chromium, Firefox, and WebKit in one
     test run. W4 must support Chrome + Firefox (per NFR-C01). Cypress community
     edition only supports Chrome + Firefox (no WebKit until Cypress 13).

  2. Headless CI: Playwright's headless mode works reliably in GitHub Actions
     with `npx playwright install --with-deps`. Cypress in CI requires more
     Docker setup for consistent rendering.

  3. WebSocket testing: W4 uses Supabase Realtime (WebSocket) and NATS.ws
     (WebSocket). Playwright can wait for WebSocket frames and inject messages.
     Cypress WebSocket support is limited (experimental as of 2026).

  4. W1-W3 precedent: Playwright already used in W1 (W1 TEST_STRATEGY.md).
     Same tooling across waves.

  5. Timing assertions: Playwright's page.waitForFunction() with timeout
     parameter is precise enough for the ≤100ms track update timing assertion.

Trade-offs:
  - Playwright test syntax is more verbose than Cypress for simple UI flows.
  - Cypress has better component testing integration (Cypress Component Testing).
     W4 uses RTL for component tests — Playwright is only for E2E.

Consequences:
  - playwright.config.ts: Chromium + Firefox, 2 workers
  - E2E tests require TEST_ env vars for Supabase test project + NATS test server
  - testId attributes required on key components for stable test selectors
```

---

## DEC-W4-009: Dark Mode Only vs Theme Toggle

```
Date      : 2026-03-24
Status    : DECIDED

Context:
  Should the dashboard support a light/dark theme toggle, or enforce dark mode
  unconditionally?

Decision:
  Dark mode enforced unconditionally. No toggle.

Rationale:
  1. Military ops rooms: operations centers maintain dark ambient environments
     to preserve operator night vision capability and reduce screen reflection.
     Exposing a light mode option creates risk: operator accidentally switches
     to light mode during a night operation.

  2. No code complexity for theme switching: dark-only means no conditional
     dark: class switching, no ThemeProvider, no localStorage persistence.
     Every component is styled once (dark). This eliminates an entire class
     of bugs (flash of white, theme persistence, SSR mismatch).

  3. Accessibility: dark mode with the defined contrast ratios (DESIGN.md §11)
     meets WCAG AA. No need for light mode for accessibility compliance.

  4. UA-03 civil defense: even non-military users are operating in briefing
     contexts where dark mode is appropriate.

Trade-offs:
  - Some users prefer light mode for daytime use. Not a consideration for this
     operational use case.

Consequences:
  - <html class="dark"> set in layout.tsx, never removed
  - Tailwind config: darkMode: 'class'
  - No ThemeProvider component
  - No system preference media query honored
```

---

## DEC-W4-010: CoT Export Format (TAK/ATAK Compatibility)

```
Date      : 2026-03-24
Status    : DECIDED

Context:
  W4 must export threat track data in a format compatible with ATAK (Android
  Team Awareness Kit) and FreeTAKServer. Options: CoT 2.0 XML, GeoJSON, KML, GPX.

Decision:
  Cursor-on-Target (CoT) version 2.0 XML. File extension: .cot.

Rationale:
  1. ATAK standard: CoT is the native data exchange format for ATAK, WinTAK,
     and FreeTAKServer. All military-adjacent C2 interoperability in the
     NATO/Western context uses CoT.

  2. Threat type encoding: CoT type codes (a-h-A-M-F-Q etc.) encode the MIDB
     threat classification hierarchy directly. This maps cleanly to APEX-SENTINEL's
     threat classes.

  3. FreeTAKServer relay: FTS accepts CoT over TCP/UDP/HTTP. The /api/relay-tak
     route POSTs CoT XML to FTS. This is the FTS-supported ingestion method.

  4. Operator expectation: Military-trained operators know how to use .cot files
     with ATAK. GeoJSON/KML would require conversion tools.

  5. ce field: CoT's circular error field is the correct way to communicate
     coordinate uncertainty. Setting ce=50 explicitly documents the ±50m
     coarsening applied for privacy.

Trade-offs:
  - CoT is XML (verbose). Batch exports of 50 tracks may produce 500KB files.
     Acceptable: exported over high-bandwidth connections.
  - CoT schema has limited fields for AI-generated metadata (confidence, detection
     gates). Custom fields added in <detail> as apex_sentinel extension element.

Consequences:
  - cotExporter.ts: builds CoT 2.0 XML with apex_sentinel extension
  - Type mapping table in cotExporter.ts (8 threat classes → CoT type codes)
  - XSD validation in tests (CoT 2.0 XSD from official CoT schema repository)
```

---

## DEC-W4-011: Supabase RLS vs Application-Level Auth

```
Date      : 2026-03-24
Status    : DECIDED

Context:
  Role-based access (operator/analyst/admin/civil_defense) could be enforced
  at the application level (React components + API routes) or at the database
  level (Supabase RLS policies).

Decision:
  Both. Database-level RLS is the authoritative enforcement. Application-level
  is UI-only (shows/hides components).

Rationale:
  1. Defense in depth: application-level auth can be bypassed by a determined
     attacker making direct Supabase REST calls with their JWT. RLS at the DB
     level means even direct API calls are constrained by role.

  2. OPSEC enforcement: civil_defense role MUST NOT see sensor_nodes data.
     RLS enforces this unconditionally regardless of how the query is made.

  3. Audit-ready: RLS policies are inspectable in Supabase dashboard and in
     migration files (git history). No hidden application logic.

  4. Edge Function auth: Edge Functions verify the user JWT and check the role
     from user_metadata. This is application-level enforcement but backed by
     Supabase Auth's JWT validation.

Trade-offs:
  - RLS adds complexity to queries (every query goes through RLS check).
     Performance impact: ~1-5ms per query, acceptable.
  - Debugging RLS failures can be non-obvious. Mitigated by test coverage
     (civil_defense RLS test is explicit E2E test AC-SEC-03).

Consequences:
  - All dashboard-facing tables have RLS enabled
  - civil_defense RLS: sensor_nodes returns empty set
  - Application-level: useCanSeeNodes() prevents NodeOverlay rendering
  - Both layers tested independently
```

---

## DEC-W4-012: Entity Update vs Destroy/Recreate for CesiumJS Track Markers

```
Date      : 2026-03-24
Status    : DECIDED

Context:
  When a track's position updates (Supabase Realtime event), should the
  CesiumJS entity be destroyed and recreated, or should its properties be
  mutated in place?

Decision:
  Mutate entity position property in place. Never destroy/recreate for updates.

Rationale:
  1. Performance: entity creation in CesiumJS involves scene graph allocation,
     billboard texture lookup, and label geometry generation. On 60fps globe with
     50 active tracks receiving 10 updates/sec, destroying/recreating = 500
     entity creations per second. This causes visible frame drops.

  2. Cesium entity property system: CesiumJS entities use a Property system
     (ConstantPositionProperty, SampledPositionProperty). Updating a
     ConstantPositionProperty mutates the value without scene graph change.

  3. Flicker: destroy/recreate causes a single-frame absence of the entity,
     visible as a flicker at 60fps.

  4. TrackEntityManager pattern: entities stored in Map<trackId, Entity>.
     upsert() checks Map — if exists, mutates; if new, creates.

Trade-offs:
  - Mutating Cesium entity properties directly is less "React-like" than
     component-based entity management. Accepted: Cesium is imperative by nature.

Consequences:
  - TrackEntityManager.upsert() uses ConstantPositionProperty reassignment
  - batchUpdate() processes entire track set: adds new, removes gone, updates existing
  - Zero viewer.entities.add() calls during normal operation after initial load
```

---

## DEC-W4-013: Map Coordinate Precision for Privacy

```
Date      : 2026-03-24
Status    : DECIDED

Context:
  The TdoaCorrelator outputs coordinates with ~10m precision for confirmed tracks.
  Should the dashboard display exact or coarsened coordinates?

Decision:
  Coarsen to ±50m (0.00045°) for all roles except admin.

Rationale:
  1. OPSEC: displaying exact threat coordinates could reveal sensor positions
     (a skilled adversary could triangulate sensor positions from precise track
     positions if they know the TDoA algorithm).

  2. Privacy best practice: for any coordinates that might relate to people
     (unlikely in UAV context, but defensive posture), coarsening is standard.

  3. Operational sufficiency: ±50m precision is operationally sufficient for
     all W4 use cases:
     - Globe rendering: 50m offset invisible at normal viewing zoom
     - CoT relay to ATAK: ATAK uses coordinates for map display — 50m is fine
     - Civil defense evacuation decisions: 50m precision irrelevant at city scale

  4. Admin exception: admin role needs exact coordinates for system calibration
     and sensor placement verification.

Trade-offs:
  - Admin sees a different data view from operators. Potential for confusion
     if admin compares their screen to operator screen. Mitigated by labeling.

Consequences:
  - LocationCoarsener utility: used in UI rendering, Edge Functions, CoT export
  - Single source of truth: COARSEN_DEGREES = 0.00045 in locationCoarsener.ts
  - CoT export: ce="50" documents the uncertainty explicitly
```

---

## DEC-W4-014: Session Timeout Duration — 8 Hours

```
Date      : 2026-03-24
Status    : DECIDED

Context:
  How long should dashboard operator sessions remain valid? Options considered:
  1hr, 4hr, 8hr, 24hr.

Decision:
  8 hours. Matches standard military operational shift duration.

Rationale:
  1. Shift alignment: military/civil defense shifts are typically 6-8 hours.
     8-hour sessions mean operators don't re-authenticate during their shift.

  2. Re-auth friction: if session expires mid-shift during a threat event,
     the operator is disrupted at a critical moment. 8 hours eliminates this
     risk for standard shift lengths.

  3. Security balance: 8 hours is long enough to complete a shift, short
     enough that an unattended workstation is not indefinitely open.

  4. Re-auth UX: session expiry triggers an in-place modal — no page redirect,
     no loss of dashboard state. Operator re-authenticates and continues.

Trade-offs:
  - Sessions left open for >8 hours (extended operations) require re-auth.
     Acceptable: extended operations warrant security re-verification anyway.

Consequences:
  - Supabase Auth: jwtExpiresIn configured to 8h
  - DashboardHeader: session countdown (last 30 minutes) displays remaining time
  - Re-auth modal: intercepts page interaction, shows email+password form
```

---

## DEC-W4-015: OpenMCT Telemetry Subscription via Zustand vs Direct Supabase

```
Date      : 2026-03-24
Status    : DECIDED

Context:
  OpenMCT's telemetry subscribe API needs a way to receive real-time track
  updates. Options: subscribe directly to Supabase Realtime from within the
  OpenMCT plugin, or bridge from the existing Zustand trackStore.

Decision:
  Bridge from Zustand trackStore using subscribeWithSelector.

Rationale:
  1. Single subscription: there is already one Supabase Realtime subscription
     managed by trackSubscriber.ts. Creating a second subscription for OpenMCT
     would double the Realtime connections per client.

  2. Consistency: Zustand trackStore is the authoritative state. OpenMCT
     receiving data from a separate Supabase subscription might produce
     different state than the TrackTable/Globe (race conditions on message order).

  3. subscribeWithSelector API: Zustand's subscribe() with selector allows
     the OpenMCT plugin to receive updates only when a specific track changes.
     Clean integration pattern.

  4. Teardown: OpenMCT's subscribe() must return an unsubscribe function.
     Zustand's subscribe() returns an unsubscribe function directly. Perfect fit.

Trade-offs:
  - OpenMCT plugin has a dependency on Zustand (non-standard for an OpenMCT plugin).
     Acceptable: this is an APEX-SENTINEL-specific plugin, not a general-purpose one.

Consequences:
  - telemetryProviders.ts imports useTrackStore
  - subscribe() returns useTrackStore.subscribe(selector, callback)
  - No second Supabase Realtime subscription inside OpenMCT plugin
```

---

*DECISION_LOG.md — APEX-SENTINEL W4 — approved 2026-03-24*
