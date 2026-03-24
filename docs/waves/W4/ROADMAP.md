# APEX-SENTINEL — ROADMAP.md
## W4 Development Roadmap — C2 Dashboard
### Wave 4 | Project: APEX-SENTINEL | Version: 4.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. W4 PHASES

```
Total duration: 35 days
Start: Day 1 of W4 execution
End: Day 35

Phase breakdown:
  P1: Days  1–7   — Foundation: Next.js scaffold + CesiumJS + Supabase Realtime
  P2: Days  8–14  — Alert stream: NATS.ws + AlertBanner + TrackTable
  P3: Days 15–21  — Intelligence: OpenMCT + NodeOverlay + ThreatStats
  P4: Days 22–28  — Operations: CoT export + Auth + Keyboard shortcuts
  P5: Days 29–35  — Hardening: Performance + E2E tests + Deploy
```

---

## 2. PHASE DETAILS

### P1: Foundation (Days 1–7)

```
Goal: 3D globe loads, shows live tracks, dark theme enforced

Day 1–2: Project scaffold
  ☐ npx create-next-app@14 with TypeScript + Tailwind
  ☐ dark mode enforcement (<html class="dark">, no toggle)
  ☐ shadcn/ui init (dark theme)
  ☐ Zustand stores scaffold (trackStore, alertStore, nodeStore, uiStore)
  ☐ Supabase client setup (browser + server)
  ☐ TypeScript types: Track, Alert, SensorNode, CotEvent

Day 3–4: CesiumJS integration
  ☐ next.config.js: Cesium webpack config (workers, assets copy)
  ☐ CesiumGlobe.tsx dynamic import (ssr: false)
  ☐ CesiumGlobeInner.tsx: viewer init with dark background
  ☐ Dark imagery layer (Mapbox satellite-dark)
  ☐ TrackEntityManager.ts: entity CRUD (not destroy/recreate pattern)
  ☐ TrackMarker.tsx: billboard + label per threat class
  ☐ CesiumJS loads without console errors

Day 5–6: Supabase Realtime tracks
  ☐ realtimeClient.ts: channel subscription
  ☐ trackSubscriber.ts: INSERT/UPDATE/DELETE handlers
  ☐ Reconnect logic: exponential backoff 5s→30s max
  ☐ Full resync on reconnect
  ☐ ConnectionStatus component: ●green/●red in header
  ☐ Initial track load from Supabase REST on page load (Server Component)

Day 7: Layout + header
  ☐ Dashboard layout: 3-column (left 280px, center flex-1, right 340px)
  ☐ Bottom timeline container (200px, collapsible)
  ☐ DashboardHeader: logo, DEFCON badge, node count, clock, alerts badge
  ☐ LeftPanel, RightPanel wrappers
  ☐ Responsive breakpoints to 1024px

P1 exit criteria:
  ✓ Globe renders at localhost:3000
  ✓ Test tracks appear as colored markers at correct coordinates
  ✓ Realtime track update moves marker on globe within 100ms
  ✓ Dark theme: no white elements anywhere
  ✓ No SSR errors in Next.js build
```

### P2: Alert Stream (Days 8–14)

```
Goal: NATS.ws connected, CRITICAL alerts flash, TrackTable functional

Day 8–9: NATS.ws integration
  ☐ NatsWsClient.ts: connect, subscribe, reconnect
  ☐ alertSubscriber.ts: sentinel.alerts.> consumer
  ☐ alertStore: enqueue, dedup, max 200, FIFO
  ☐ NatsProvider.tsx: context + auto-connect on mount
  ☐ NATS status in header: ●green/●red

Day 10–11: AlertBanner + AlertFeed
  ☐ AlertBanner.tsx: fixed top bar, CRITICAL flash (2Hz, 3 cycles, CSS animation)
  ☐ AlertBanner stacks multiple CRITICALs
  ☐ AlertFeed.tsx: right panel list, severity badges, timestamps
  ☐ AlertDetailPanel.tsx: full alert detail + CoT XML preview (collapsed)
  ☐ AnnotationModal.tsx: operator notes input + classification selector

Day 12–13: TrackTable
  ☐ TrackTable.tsx: columns ID/CLASS/CONF/LAST SEEN/NODE/ACTIONS
  ☐ Sort by any column, default confidence DESC
  ☐ Filter: threat class dropdown + confidence threshold
  ☐ Text filter: track ID or node ID
  ☐ Row click: globe flies to track, TrackDetail opens
  ☐ Keyboard: ↑↓ navigate, Enter open detail, / focus filter
  ☐ Stale track badge (>120s)

Day 14: TrackDetail
  ☐ TrackDetail.tsx: full track metadata display
  ☐ Detection gates badges (ACOUSTIC/RF/OPTICAL)
  ☐ Confidence trend sparkline (last 60 updates)
  ☐ Multi-gate confirmation badge

P2 exit criteria:
  ✓ NATS.ws connects to local test server
  ✓ Test CRITICAL message: AlertBanner appears ≤200ms
  ✓ TrackTable shows all active tracks, sortable and filterable
  ✓ Alert deduplication: same alert_id does not create duplicate
```

### P3: Intelligence Layer (Days 15–21)

```
Goal: OpenMCT timeline, node coverage overlay, threat statistics

Day 15–16: OpenMCT timeline
  ☐ OpenMCT npm install + dynamic import (ssr: false)
  ☐ ApexSentinelPlugin.ts: domain objects, telemetry provider
  ☐ telemetryProviders.ts: realtime (Zustand) + historical (Edge Function)
  ☐ OpenMCTTimeline.tsx: mount in bottom panel
  ☐ PlaybackControls.tsx: LIVE/HISTORICAL toggle, scrub buttons
  ☐ Track rows: bars colored by threat class
  ☐ Node rows: uptime bars
  ☐ Alert row: event markers

Day 17: get-track-history Edge Function
  ☐ Deno Edge Function scaffold
  ☐ Supabase query: track_position_events with time range + pagination
  ☐ Auth verification
  ☐ Response schema as per API_SPECIFICATION.md §2.1
  ☐ Deploy to Supabase

Day 18–19: NodeOverlay + NodeHealthList
  ☐ get-node-coverage Edge Function: query node_coverage_view, role check
  ☐ nodeEntityManager.ts: Cesium EllipseEntity per node
  ☐ NodeOverlay.tsx: coverage circles, tier coloring, click handler
  ☐ NodeHealthList.tsx: left panel list, status dots, tier badges
  ☐ useCanSeeNodes() hook: civil_defense hides nodes

Day 20–21: ThreatStatsPanel
  ☐ get-threat-stats Edge Function: queries threat_statistics_view
  ☐ ThreatStatsPanel.tsx: bar charts (CSS, no canvas)
  ☐ ThreatSummary.tsx: threat count badges in left panel
  ☐ 60-second refresh interval
  ☐ DefconBadge.tsx: current DEFCON display in header

P3 exit criteria:
  ✓ OpenMCT timeline shows track history from Edge Function
  ✓ LIVE mode: timeline updates as tracks update
  ✓ Node coverage circles visible on globe
  ✓ Threat stats refresh every 60s
  ✓ civil_defense role: nodes hidden (RLS verified)
```

### P4: Operations Layer (Days 22–28)

```
Goal: CoT export, authentication, keyboard shortcuts fully functional

Day 22–23: CoT export
  ☐ cotExporter.ts: CoT XML builder, coordinate coarsening
  ☐ cotValidator.ts: XSD validation in tests
  ☐ export-cot-bundle Edge Function: single + batch + time-range modes
  ☐ cotRelay.ts: /api/relay-tak route
  ☐ CotXmlModal.tsx: XML preview with syntax highlighting
  ☐ Export buttons in AlertDetailPanel + TrackDetail
  ☐ Audit logging: cot_relay_log INSERT

Day 24: acknowledge-alert Edge Function
  ☐ Deno Edge Function: INSERT into alert_acknowledgements
  ☐ Role check: operator/admin only
  ☐ Duplicate check: UNIQUE constraint handled gracefully
  ☐ ACK button in AlertDetailPanel + AlertFeed
  ☐ Optimistic update in alertStore

Day 25–26: Authentication
  ☐ middleware.ts: session check + role injection
  ☐ /login page: Supabase Auth email+password
  ☐ 8-hour session configuration in Supabase Auth settings
  ☐ Re-auth modal: session expiry prompt in-place (no page redirect)
  ☐ useRole() hook + all permission hooks (useCanExport, useCanAcknowledge, etc.)
  ☐ RLS verified: civil_defense cannot query sensor_nodes

Day 27–28: Keyboard shortcuts
  ☐ useKeyboardShortcuts.ts: global keydown listener
  ☐ All 15 shortcuts from DESIGN.md §6
  ☐ Disable on modal open / input focus
  ☐ KeyboardShortcutModal.tsx: ? key shows reference
  ☐ Shortcut: F = follow track (camera lock)
  ☐ Shortcut: G = toggle 3D/2D map
  ☐ Mapbox GL fallback (2D mode) component

P4 exit criteria:
  ✓ CoT export produces valid XML (validated against XSD)
  ✓ Unauthenticated access redirects to /login
  ✓ civil_defense role sees simplified UI (no nodes, no CoT)
  ✓ All 15 keyboard shortcuts functional
  ✓ Alert acknowledge writes to DB + shows in UI
```

### P5: Hardening (Days 29–35)

```
Goal: 100% E2E tests passing, ≥80% coverage, deployed to production

Day 29–30: Unit + component tests
  ☐ trackStore: upsert, remove, replaceAll, staleness, selectors
  ☐ alertStore: enqueue, dedup, acknowledge
  ☐ cotExporter: valid XML output, coordinate coarsening, schema validation
  ☐ TrackTable: sort, filter, keyboard navigation (RTL)
  ☐ AlertBanner: renders for CRITICAL, not for LOW (RTL)
  ☐ ThreatStatsPanel: renders bars with correct values (RTL)
  ☐ Coverage gate: npx vitest run --coverage ≥80%

Day 31–32: E2E tests
  ☐ auth.spec.ts: unauthenticated redirect, login, session
  ☐ tracks.spec.ts: track appears on table after Supabase event
  ☐ alerts.spec.ts: CRITICAL banner appears after NATS message
  ☐ cot-export.spec.ts: download CoT, verify XML content
  ☐ keyboard.spec.ts: T/N/A/ESC shortcuts
  ☐ civil-defense.spec.ts: restricted role sees limited data

Day 33: Performance
  ☐ Lighthouse CI: LCP <2s, TBT <200ms
  ☐ Globe FPS test: 100 entities ≥30fps (custom requestAnimationFrame test)
  ☐ Bundle analysis: next-bundle-analyzer, target <500kB initial JS
  ☐ Memory leak test: 8hr simulated operation, heap profiler
  ☐ NATS stress test: 100msg/s sustained, no dropped alerts

Day 34: DATABASE migration
  ☐ supabase db push to staging
  ☐ Verify all views, RLS policies, pg_cron jobs
  ☐ Realtime publication config verified
  ☐ Run migration on production

Day 35: Deployment
  ☐ Vercel deploy from main branch
  ☐ Environment variables set in Vercel dashboard
  ☐ Custom domain: c2.apex-sentinel.io
  ☐ SSL: Vercel auto-cert
  ☐ Health check: /api/health returns 200
  ☐ Smoke test: login, globe loads, Realtime connects, NATS connects
  ☐ wave-formation.sh complete W4

P5 exit criteria:
  ✓ npx vitest run --coverage: all pass, ≥80% coverage
  ✓ npx playwright test: all pass
  ✓ npm run build: no errors
  ✓ npx tsc --noEmit: no type errors
  ✓ Lighthouse: LCP <2s, no accessibility critical issues
  ✓ Production URL responds: c2.apex-sentinel.io
```

---

## 3. MILESTONES

```
Milestone   Day  Deliverable                              Success Signal
────────────────────────────────────────────────────────────────────────────────
M4-1          7  Globe + Realtime tracks working          Track appears on globe in <100ms
M4-2         14  NATS alerts + TrackTable                 CRITICAL banner in <200ms
M4-3         21  OpenMCT + NodeOverlay + Stats            Timeline shows 1hr history
M4-4         28  CoT export + Auth + Shortcuts            CoT downloads as valid XML
M4-5         35  All tests pass + deployed                100% E2E, ≥80% coverage
────────────────────────────────────────────────────────────────────────────────
```

---

## 4. W5 PREVIEW (POST-W4 SCOPE)

Items explicitly deferred to W5:
```
- EKF trajectory prediction full display (uncertainty cone)
- LLM-generated threat assessment summaries
- Multi-AO support (multiple geographic deployments)
- Offline-first PWA (IndexedDB caching)
- Detection density heatmap generation pipeline
- Two-way communication with field units
- AI anomaly detection on detection patterns
- Video optical sensor integration
```

---

*ROADMAP.md — APEX-SENTINEL W4 — approved 2026-03-24*
