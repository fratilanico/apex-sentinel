# APEX-SENTINEL W4 — ARTIFACT REGISTRY
## W4 | PROJECTAPEX Doc 14/20 | 2026-03-24

> Wave: W4 — C2 Dashboard
> All W4 deliverables, ownership, acceptance criteria, and storage locations.

---

## 1. Registry Overview

| Category | Count | Status |
|----------|-------|--------|
| Next.js App (pages + components) | 24 components, 8 pages | PENDING |
| Zustand Stores | 4 | PENDING |
| Supabase Edge Functions (new W4) | 4 | PENDING |
| Supabase Migrations (W4) | 3 tables + 3 views | PENDING |
| Playwright E2E Suite | 5 scenarios, ~60 tests | PENDING |
| Vitest Unit Suite | ~180 tests | PENDING |
| RTL Component Tests | ~80 tests | PENDING |
| OpenMCT Plugin | 1 plugin bundle | PENDING |
| CesiumJS Integration Module | 1 module | PENDING |
| Vercel Deployment Config | vercel.json | PENDING |
| TypeScript Declaration Files | 2 (openmct.d.ts, cesium-ext.d.ts) | PENDING |

Total test target: ≥ 320 tests (W4), cumulative W1-W4: ≥ 662 tests.

---

## 2. Next.js Application Bundle

### ART-W4-001: Next.js 14 Application
```
artifact_id:  ART-W4-001
name:         apex-sentinel-dashboard
type:         Next.js 14 App (App Router, TypeScript strict)
path:         packages/dashboard/
entry:        packages/dashboard/src/app/layout.tsx
output:       .next/ (Vercel deployment, standalone build)
version:      semver tracked in packages/dashboard/package.json

Vercel project:   apex-sentinel-dashboard
Custom domain:    dashboard.apex-sentinel.io
Build command:    cd packages/dashboard && next build
Output directory: packages/dashboard/.next
```

### App Router Pages

| Route | File | Purpose | FR |
|-------|------|---------|-----|
| / | app/page.tsx | Redirect → /dashboard | — |
| /login | app/login/page.tsx | Magic link + email auth | FR-W4-10 |
| /auth/callback | app/auth/callback/route.ts | Supabase Auth callback | FR-W4-10 |
| /dashboard | app/dashboard/page.tsx | Main C2 view (globe + panels) | FR-W4-01 |
| /tracks | app/tracks/page.tsx | Track table full-screen | FR-W4-04 |
| /nodes | app/nodes/page.tsx | Node health grid view | FR-W4-06 |
| /alerts | app/alerts/page.tsx | Alert history + detail | FR-W4-07 |
| /analytics | app/analytics/page.tsx | OpenMCT timeline embed | FR-W4-05 |

---

## 3. React Components

### ART-W4-002: CesiumGlobe Component
```
artifact_id:  ART-W4-002
path:         packages/dashboard/src/components/globe/CesiumGlobe.tsx
type:         React component (client-only — dynamic import, ssr: false)
props:
  tracks:     Track[]
  nodes:      SentinelNode[]
  alerts:     Alert[]
  onTrackSelect: (trackId: string) => void
  onNodeSelect:  (nodeId: string) => void
dependencies: cesiumjs@1.116.x (dynamic import via next/dynamic)
test file:    __tests__/components/CesiumGlobe.test.tsx
test count:   ~15 (store integration, track rendering logic — WebGL mocked)
```

### ART-W4-003: TrackMarker (CesiumJS Entity)
```
artifact_id:  ART-W4-003
path:         packages/dashboard/src/lib/cesium/TrackMarker.ts
type:         CesiumJS entity factory (not a React component)
exports:      createTrackEntity(track: Track, viewer: Cesium.Viewer): Cesium.Entity
              updateTrackEntity(entity: Cesium.Entity, track: Track): void
              removeTrackEntity(entity: Cesium.Entity, viewer: Cesium.Viewer): void
color scheme:
  critical:   Cesium.Color.RED
  high:       Cesium.Color.ORANGE
  medium:     Cesium.Color.YELLOW
  low:        Cesium.Color.CYAN
  info:       Cesium.Color.GREEN
altitude:     track.alt_m → Cesium.Cartesian3.fromDegrees(lon, lat, alt_m)
model:        billboard with custom SVG drone icon (embedded as data URI)
test file:    __tests__/lib/TrackMarker.test.ts
test count:   ~12
```

### ART-W4-004: NodeOverlay (CesiumJS)
```
artifact_id:  ART-W4-004
path:         packages/dashboard/src/lib/cesium/NodeOverlay.ts
type:         CesiumJS entity factory
exports:      createNodeCoverageCircle(node: SentinelNode, viewer: Cesium.Viewer): Cesium.Entity
              updateNodeStatus(entity: Cesium.Entity, node: SentinelNode): void
circle:       Cesium.CircleGeometry centered at node lat/lon, radius = coverage_radius_m
color:
  tier_1:     Cesium.Color.BLUE.withAlpha(0.15)
  tier_2:     Cesium.Color.GREEN.withAlpha(0.12)
  tier_3:     Cesium.Color.YELLOW.withAlpha(0.10)
  offline:    Cesium.Color.RED.withAlpha(0.20)
test file:    __tests__/lib/NodeOverlay.test.ts
test count:   ~10
```

### ART-W4-005: AlertBanner Component
```
artifact_id:  ART-W4-005
path:         packages/dashboard/src/components/alerts/AlertBanner.tsx
type:         React component (fixed top bar, auto-dismiss after ttl_seconds)
props:
  alert:      Alert | null
  onDismiss:  () => void
  onDetails:  (alertId: string) => void
animation:    slide-in from top (Tailwind CSS transition)
sound:        Audio() for critical alerts (configurable, operator preference)
test file:    __tests__/components/AlertBanner.test.tsx
test count:   ~8
```

### ART-W4-006: AlertDetailPanel Component
```
artifact_id:  ART-W4-006
path:         packages/dashboard/src/components/alerts/AlertDetailPanel.tsx
type:         React component (right drawer, 400px wide)
props:
  alert:      Alert | null
  onClose:    () => void
  onExport:   (alertId: string, format: 'cot' | 'json') => void
sections:
  - Threat classification + confidence bar
  - Geographic coordinates (lat/lon/alt formatted)
  - Contributing node list with signal strength
  - CoT XML raw view (syntax-highlighted, monospace)
  - Export buttons (.cot, .json)
test file:    __tests__/components/AlertDetailPanel.test.tsx
test count:   ~10
```

### ART-W4-007: TrackTable Component
```
artifact_id:  ART-W4-007
path:         packages/dashboard/src/components/tracks/TrackTable.tsx
type:         React component (data grid with virtual scrolling for >1000 rows)
props:
  tracks:     Track[]
  sortField:  'confidence' | 'first_seen_at' | 'last_updated_at' | 'threat_level'
  sortDir:    'asc' | 'desc'
  filter:     TrackFilter
  onSort:     (field: SortField) => void
  onFilter:   (filter: TrackFilter) => void
  onSelect:   (trackId: string) => void
  onExport:   (trackId: string) => void
columns:      track_id (short), threat_class, threat_level badge, confidence %, lat/lon, alt,
              speed, heading, contributing_nodes count, first_seen, last_updated, status, actions
pagination:   50 rows/page (configurable: 25/50/100)
virtual:      @tanstack/react-virtual for >200 row sets
test file:    __tests__/components/TrackTable.test.tsx
test count:   ~14
```

### ART-W4-008: ThreatStatsPanel Component
```
artifact_id:  ART-W4-008
path:         packages/dashboard/src/components/stats/ThreatStatsPanel.tsx
type:         React component (bottom bar fixed or floating card)
props:        none (reads from Zustand stores directly)
metrics:
  - Detections per hour (rolling 60min window, line chart)
  - Active track count by threat level (bar chart)
  - Active node count / total node count
  - Coverage % (sum of node coverage areas / AOR area)
  - Alert count last 24hr
  - Top threat class (last 4hr)
charts:       Recharts LineChart + BarChart
refresh:      Derived from Zustand stores — reactive, no polling
test file:    __tests__/components/ThreatStatsPanel.test.tsx
test count:   ~8
```

### ART-W4-009: NodeHealthPanel Component
```
artifact_id:  ART-W4-009
path:         packages/dashboard/src/components/nodes/NodeHealthPanel.tsx
type:         React component (left sidebar, collapsible)
props:
  nodes:      SentinelNode[]
  onSelect:   (nodeId: string) => void
columns:      node_id (short), tier, status badge, last_seen (relative time),
              battery %, signal RSSI, detection count (24hr), coverage radius
status:       online (green dot), degraded (yellow dot), offline (red dot)
test file:    __tests__/components/NodeHealthPanel.test.tsx
test count:   ~8
```

### ART-W4-010: KeyboardShortcutsHook
```
artifact_id:  ART-W4-010
path:         packages/dashboard/src/hooks/useKeyboardShortcuts.ts
type:         React hook
shortcuts:
  T:  toggle track table panel
  N:  toggle node health panel
  A:  toggle alert panel
  S:  toggle stats panel
  F:  toggle fullscreen (document.fullscreenElement API)
  ESC: close active panel (UIStore.closeActivePanel())
  /:  open shortcut help modal
scope:        global (window keydown listener, ignores input/textarea focus)
test file:    __tests__/hooks/useKeyboardShortcuts.test.ts
test count:   ~10 (each shortcut + edge cases)
```

---

## 4. Zustand Stores

### ART-W4-011: TrackStore
```
artifact_id:  ART-W4-011
path:         packages/dashboard/src/stores/trackStore.ts
interface:
  tracks:         Map<string, Track>        // keyed by track_id
  activeTrackId:  string | null
  filter:         TrackFilter
  sortField:      SortField
  sortDir:        'asc' | 'desc'
  realtimeStatus: 'connecting' | 'connected' | 'error' | 'disconnected'
  lastUpdatedAt:  Date | null

actions:
  upsertTrack(track: Track): void
  removeTrack(trackId: string): void
  setActiveTrack(trackId: string | null): void
  setFilter(filter: Partial<TrackFilter>): void
  setSort(field: SortField, dir: 'asc' | 'desc'): void
  setRealtimeStatus(status: RealtimeStatus): void
  getFilteredSortedTracks(): Track[]     // derived, memoized

persistence:  none (session-only, feeds from Supabase Realtime)
test file:    __tests__/stores/trackStore.test.ts
test count:   ~15
```

### ART-W4-012: AlertStore
```
artifact_id:  ART-W4-012
path:         packages/dashboard/src/stores/alertStore.ts
interface:
  alerts:         Alert[]            // capped at 500, FIFO eviction
  activeAlertId:  string | null
  natsStatus:     'connecting' | 'connected' | 'error' | 'disconnected'
  unreadCount:    number

actions:
  addAlert(alert: Alert): void       // prepends, evicts if >500
  dismissAlert(alertId: string): void
  markAllRead(): void
  setActiveAlert(alertId: string | null): void
  setNatsStatus(status: NatsStatus): void
  getAlertsByThreatLevel(level: ThreatLevel): Alert[]

persistence:  sessionStorage (survives page refresh within tab)
test file:    __tests__/stores/alertStore.test.ts
test count:   ~12
```

### ART-W4-013: NodeStore
```
artifact_id:  ART-W4-013
path:         packages/dashboard/src/stores/nodeStore.ts
interface:
  nodes:          Map<string, SentinelNode>  // keyed by node_id
  activeNodeId:   string | null
  pollingStatus:  'idle' | 'polling' | 'error'
  lastPolledAt:   Date | null

actions:
  upsertNode(node: SentinelNode): void
  setNodeOffline(nodeId: string): void
  setActiveNode(nodeId: string | null): void
  setPollingStatus(status: PollingStatus): void
  getOnlineNodes(): SentinelNode[]
  getNodeCoverageStats(): CoverageStats

source:       Supabase PostgREST polling every 30s (nodes table not on Realtime)
test file:    __tests__/stores/nodeStore.test.ts
test count:   ~10
```

### ART-W4-014: UIStore
```
artifact_id:  ART-W4-014
path:         packages/dashboard/src/stores/uiStore.ts
interface:
  activePanel:        'tracks' | 'nodes' | 'alerts' | 'stats' | null
  globeMode:          '3d' | '2d'
  isFullscreen:       boolean
  shortcutsHelpOpen:  boolean
  sidebarCollapsed:   boolean

actions:
  setActivePanel(panel: Panel | null): void
  closeActivePanel(): void
  togglePanel(panel: Panel): void
  setGlobeMode(mode: GlobeMode): void
  setFullscreen(value: boolean): void
  toggleShortcutsHelp(): void

persistence:  localStorage (panel preferences survive session)
test file:    __tests__/stores/uiStore.test.ts
test count:   ~8
```

---

## 5. Supabase Edge Functions (W4 — New)

### ART-W4-015: export-cot
```
artifact_id:  ART-W4-015
path:         supabase/functions/export-cot/index.ts
method:       GET /functions/v1/export-cot
params:       track_id (single) OR start_time + end_time (bulk, returns .zip)
auth:         Supabase Auth JWT required (analyst or admin role)
output:       Content-Type: application/xml (.cot) or application/zip (.zip)
logic:        Query detection_events + tracks for time range.
              Build CoT XML per event (MIL-STD-2525D format, RFC 5545 timestamps).
              For bulk: JSZip in Deno, stream zip to response.
rate limit:   10 exports/minute per user (Redis via Upstash or Supabase rate-limit edge)
test:         integration test in __tests__/edge-functions/export-cot.test.ts
```

### ART-W4-016: get-track-history
```
artifact_id:  ART-W4-016
path:         supabase/functions/get-track-history/index.ts
method:       GET /functions/v1/get-track-history?track_id=X&limit=500
auth:         Supabase Auth JWT (any authenticated role)
output:       JSON { positions: Array<{ lat, lon, alt_m, confidence, ts }> }
logic:        Query track_positions table (W4 new table) for track_id, ordered by ts DESC,
              limited to 500 entries (~8min at 1Hz). Used by OpenMCT historical provider
              and CesiumJS trajectory polyline.
```

### ART-W4-017: get-coverage-stats
```
artifact_id:  ART-W4-017
path:         supabase/functions/get-coverage-stats/index.ts
method:       GET /functions/v1/get-coverage-stats
auth:         Supabase Auth JWT (any authenticated role)
output:       JSON { total_nodes, online_nodes, coverage_percent, aor_km2,
                     detections_last_hour, detections_last_24hr,
                     threat_breakdown: Record<ThreatLevel, number> }
logic:        Materialized view refresh + return (pg_cron refreshes every 60s).
caching:      Cache-Control: public, max-age=60
```

### ART-W4-018: get-node-status-batch
```
artifact_id:  ART-W4-018
path:         supabase/functions/get-node-status-batch/index.ts
method:       GET /functions/v1/get-node-status-batch
auth:         Supabase Auth JWT (any authenticated role)
output:       JSON { nodes: SentinelNode[] }
logic:        Query nodes table with last_seen < 5min filter for online/offline classification.
              Returns full node list with computed status field.
refresh:      Dashboard NodeStore polls this every 30s.
```

---

## 6. Supabase Migrations (W4)

### ART-W4-019: Migration 0019 — track_positions table
```
artifact_id:  ART-W4-019
file:         supabase/migrations/0019_track_positions.sql
creates:
  TABLE track_positions (
    id          bigserial PRIMARY KEY,
    track_id    text NOT NULL REFERENCES tracks(track_id) ON DELETE CASCADE,
    lat         double precision NOT NULL,
    lon         double precision NOT NULL,
    alt_m       double precision,
    speed_ms    double precision,
    heading_deg double precision,
    confidence  double precision NOT NULL,
    ts          timestamptz NOT NULL DEFAULT now()
  );
  INDEX:        (track_id, ts DESC)
  PARTITION:    by range (ts) monthly (auto-partition via pg_partman)
  RETENTION:    pg_cron deletes partitions > 30 days
  RLS:          SELECT for authenticated, INSERT for service_role only
  REALTIME:     NOT enabled (history — use REST or Edge Function)
populated by: W2 TDoA correlator updated to also write position history
```

### ART-W4-020: Migration 0020 — dashboard_sessions table
```
artifact_id:  ART-W4-020
file:         supabase/migrations/0020_dashboard_sessions.sql
creates:
  TABLE dashboard_sessions (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role        text NOT NULL CHECK (role IN ('operator','analyst','admin')),
    created_at  timestamptz DEFAULT now(),
    last_active timestamptz DEFAULT now(),
    ip_address  inet,
    user_agent  text
  );
  RLS:  Users can read own rows. Admin can read all.
purpose:  Audit log for C2 dashboard access (compliance requirement).
```

### ART-W4-021: Migration 0021 — W4 materialized views
```
artifact_id:  ART-W4-021
file:         supabase/migrations/0021_w4_views.sql
creates:
  MATERIALIZED VIEW mv_coverage_stats — refreshed every 60s by pg_cron
  MATERIALIZED VIEW mv_threat_breakdown_24hr — last 24hr threat level counts
  VIEW v_active_tracks — tracks WHERE status IN ('active','confirmed') with node join
  INDEX:  UNIQUE on mv_coverage_stats (no rows — single-row view, unique constraint on id)
  pg_cron job: "refresh mv_coverage_stats" every 60s
```

---

## 7. OpenMCT Plugin

### ART-W4-022: APEX Sentinel OpenMCT Plugin
```
artifact_id:  ART-W4-022
path:         packages/dashboard/src/lib/openmct/apexSentinelPlugin.ts
type:         OpenMCT plugin factory (function returning OpenMCT plugin object)
exports:      apexSentinelPlugin(config: ApexSentinelPluginConfig): OpenMCTPlugin
config:
  supabaseUrl:    string
  supabaseAnonKey: string
  natsWsUrl:      string
  nodeIds:        string[]

domain objects:
  - /apex-sentinel.nodes — folder of node telemetry objects
  - /apex-sentinel.nodes.{nodeId} — individual node telemetry source
  - /apex-sentinel.nodes.{nodeId}.confidence — confidence time series
  - /apex-sentinel.nodes.{nodeId}.detections — detection count time series
  - /apex-sentinel.detections.timeline — aggregate timeline (all nodes)

historical telemetry provider:
  source: Supabase get-track-history Edge Function
  granularity: 1s
  max lookback: 24hr

realtime telemetry provider:
  source: NATS.ws sentinel.detections.{nodeId}
  batching: 500ms (OpenMCT requires batched realtime updates)

type declarations: packages/dashboard/src/types/openmct.d.ts
test file:    __tests__/lib/openmct/apexSentinelPlugin.test.ts
test count:   ~12
```

---

## 8. Test Suites

### ART-W4-023: Vitest Unit Test Suite
```
artifact_id:  ART-W4-023
runner:       Vitest 1.6.x
config:       packages/dashboard/vitest.config.ts
coverage:     @vitest/coverage-v8, thresholds: branches 80%, functions 80%, lines 80%
test files:   ~22 test files in __tests__/
target:       ≥ 180 tests

Key test files:
  __tests__/stores/trackStore.test.ts           ~15 tests
  __tests__/stores/alertStore.test.ts           ~12 tests
  __tests__/stores/nodeStore.test.ts            ~10 tests
  __tests__/stores/uiStore.test.ts              ~8 tests
  __tests__/lib/TrackMarker.test.ts             ~12 tests
  __tests__/lib/NodeOverlay.test.ts             ~10 tests
  __tests__/lib/openmct/apexSentinelPlugin.test.ts  ~12 tests
  __tests__/hooks/useKeyboardShortcuts.test.ts  ~10 tests
  __tests__/lib/cotExport.test.ts               ~15 tests
  __tests__/lib/natsClient.test.ts              ~12 tests
  __tests__/components/AlertBanner.test.tsx     ~8 tests
  __tests__/components/AlertDetailPanel.test.tsx ~10 tests
  __tests__/components/TrackTable.test.tsx      ~14 tests
  __tests__/components/ThreatStatsPanel.test.tsx ~8 tests
  __tests__/components/NodeHealthPanel.test.tsx ~8 tests
  __tests__/components/CesiumGlobe.test.tsx     ~15 tests
  __tests__/edge-functions/export-cot.test.ts   ~8 tests
  __tests__/edge-functions/get-track-history.test.ts ~6 tests
  __tests__/edge-functions/get-coverage-stats.test.ts ~5 tests
  __tests__/edge-functions/get-node-status-batch.test.ts ~4 tests
  __tests__/middleware/rbac.test.ts             ~10 tests
  __tests__/lib/supabaseRealtime.test.ts        ~10 tests
```

### ART-W4-024: Playwright E2E Suite
```
artifact_id:  ART-W4-024
runner:       Playwright 1.44.x
config:       packages/dashboard/playwright.config.ts
browser:      Chromium (primary), Firefox (secondary)
target:       ≥ 60 tests across 5 scenarios

Scenario files:
  e2e/auth.spec.ts             — login, magic link, session persistence, RBAC redirect (~12 tests)
  e2e/globe.spec.ts            — globe mounts, track markers update on store change,
                                  node overlay appears, keyboard shortcuts work (~14 tests)
  e2e/tracks.spec.ts           — track table loads, sort, filter, select, export CoT (~12 tests)
  e2e/alerts.spec.ts           — alert banner appears on NATS message, detail panel opens,
                                  dismiss works, history scrollable (~12 tests)
  e2e/export.spec.ts           — single CoT download, bulk zip download, rate limit UI (~10 tests)

CI runner:    GitHub Actions ubuntu-latest with Xvfb for WebGL (--disable-gpu=false)
```

---

## 9. Deployment Artifacts

### ART-W4-025: Vercel Configuration
```
artifact_id:  ART-W4-025
path:         packages/dashboard/vercel.json
content:      framework: nextjs, buildCommand override, env var references,
              headers (CSP for WebGL: blob: unsafe-eval unsafe-inline),
              rewrites (API proxy for NATS.ws if needed),
              redirects (/ → /dashboard for authenticated users)
domain:       dashboard.apex-sentinel.io (CNAME to Vercel)
region:       lhr1 (London — matches eu-west-2 Supabase)
```

### ART-W4-026: TypeScript Declaration Files
```
artifact_id:  ART-W4-026
files:
  packages/dashboard/src/types/openmct.d.ts
    — OpenMCT 2.0 API subset (plugin, objectProvider, telemetry, realtime)
  packages/dashboard/src/types/cesium-ext.d.ts
    — CesiumJS extensions and missing types not in @types/cesium 1.116
```

---

## 10. Artifact Status Summary

| ID | Name | Path | Status | Test Count |
|----|------|------|--------|------------|
| ART-W4-001 | Next.js App | packages/dashboard/ | PENDING | — |
| ART-W4-002 | CesiumGlobe | .../CesiumGlobe.tsx | PENDING | 15 |
| ART-W4-003 | TrackMarker | .../TrackMarker.ts | PENDING | 12 |
| ART-W4-004 | NodeOverlay | .../NodeOverlay.ts | PENDING | 10 |
| ART-W4-005 | AlertBanner | .../AlertBanner.tsx | PENDING | 8 |
| ART-W4-006 | AlertDetailPanel | .../AlertDetailPanel.tsx | PENDING | 10 |
| ART-W4-007 | TrackTable | .../TrackTable.tsx | PENDING | 14 |
| ART-W4-008 | ThreatStatsPanel | .../ThreatStatsPanel.tsx | PENDING | 8 |
| ART-W4-009 | NodeHealthPanel | .../NodeHealthPanel.tsx | PENDING | 8 |
| ART-W4-010 | KeyboardShortcutsHook | .../useKeyboardShortcuts.ts | PENDING | 10 |
| ART-W4-011 | TrackStore | .../trackStore.ts | PENDING | 15 |
| ART-W4-012 | AlertStore | .../alertStore.ts | PENDING | 12 |
| ART-W4-013 | NodeStore | .../nodeStore.ts | PENDING | 10 |
| ART-W4-014 | UIStore | .../uiStore.ts | PENDING | 8 |
| ART-W4-015 | export-cot | supabase/functions/ | PENDING | 8 |
| ART-W4-016 | get-track-history | supabase/functions/ | PENDING | 6 |
| ART-W4-017 | get-coverage-stats | supabase/functions/ | PENDING | 5 |
| ART-W4-018 | get-node-status-batch | supabase/functions/ | PENDING | 4 |
| ART-W4-019 | Migration 0019 | supabase/migrations/ | PENDING | — |
| ART-W4-020 | Migration 0020 | supabase/migrations/ | PENDING | — |
| ART-W4-021 | Migration 0021 | supabase/migrations/ | PENDING | — |
| ART-W4-022 | OpenMCT Plugin | .../apexSentinelPlugin.ts | PENDING | 12 |
| ART-W4-023 | Vitest Suite | __tests__/ | PENDING | ≥180 |
| ART-W4-024 | Playwright E2E | e2e/ | PENDING | ≥60 |
| ART-W4-025 | Vercel Config | vercel.json | PENDING | — |
| ART-W4-026 | TS Declarations | src/types/ | PENDING | — |

**Total W4 test target: ≥ 320 tests**
**Cumulative W1-W4: ≥ 662 tests**
