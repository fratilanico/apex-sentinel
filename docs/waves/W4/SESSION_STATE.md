# APEX-SENTINEL W4 — SESSION STATE
## W4 | PROJECTAPEX Doc 13/20 | 2026-03-24

> Wave: W4 — C2 Dashboard (CesiumJS + OpenMCT + Supabase Realtime)
> Phase: PLAN (active)
> Session: 2026-03-24
> Supabase: bymfcnwfyxuivinuzurr (eu-west-2)

---

## Current Phase Status

```
init        ████████████████████  COMPLETE  2026-03-24
plan        ████████████████░░░░  ACTIVE    2026-03-24
tdd-red     ░░░░░░░░░░░░░░░░░░░░  PENDING
execute     ░░░░░░░░░░░░░░░░░░░░  PENDING
checkpoint  ░░░░░░░░░░░░░░░░░░░░  PENDING
complete    ░░░░░░░░░░░░░░░░░░░░  PENDING
```

---

## Wave History

### W1 — On-Device Detection Pipeline (COMPLETE)
```
Status:      COMPLETE — wave-formation.sh complete W1 executed
Tests:       102/102 pass (unit + integration)
Deliverable: YAMNet INT8 TFLite inference pipeline, Gate 1-3 logic, NATS.ws client
Git tag:     v1.0.0-w1-lkgc
LKGC SHA:    <captured in Supabase lkgc_snapshots>
```

### W2 — NATS Backend + Supabase Infrastructure (COMPLETE)
```
Status:      COMPLETE — wave-formation.sh complete W2 executed
Tests:       57/57 pass
Deliverable: 5-node NATS cluster, TDoA correlator, 4 Edge Functions, Supabase schema
             (tracks, alerts, nodes, detection_events, alert_subscriptions),
             CoT XML relay on sentinel.cot.events, WebSocket NATS proxy
Git tag:     v2.0.0-w2-lkgc
LKGC SHA:    <captured in Supabase lkgc_snapshots>
```

### W3 — React Native Mobile App (COMPLETE)
```
Status:      COMPLETE — wave-formation.sh complete W3 executed
Tests:       183/183 pass (Jest + Detox E2E)
Deliverable: Expo SDK 51 cross-platform app (Android + iOS), TFLite native modules,
             NATS.ws integration, Mapbox offline maps, Meshtastic BLE, push notifications
Git tag:     v3.0.0-w3-lkgc
LKGC SHA:    <captured in Supabase lkgc_snapshots>
```

### Cumulative: 342/342 tests passing across W1-W3.

---

## W4 Scope

### Mission Statement
C2 Dashboard — a browser-based command-and-control interface presenting real-time airspace
situational awareness on a CesiumJS 3D globe, with OpenMCT timeline analytics, NATS.ws
direct alert streaming, Supabase Realtime track feeds, and Supabase Auth RBAC for
operator/analyst/admin roles.

### Functional Requirements (locked)
```
FR-W4-01  CesiumJS 3D globe with live track markers (color by threat class, correct altitude)
FR-W4-02  Supabase Realtime tracks subscription (<100ms client-side update latency)
FR-W4-03  NATS.ws sentinel.alerts.> subscription (<200ms alert display after publish)
FR-W4-04  Track table (sort/filter by confidence, age, threatClass, contributing nodes, pagination)
FR-W4-05  OpenMCT timeline plugin (detection events per node, confidence over time, 24hr window)
FR-W4-06  Node health overlay (coverage circles on globe, tier color, offline indicator)
FR-W4-07  Alert detail panel (CoT XML view, location, confidence, contributing node count)
FR-W4-08  CoT export (single track .cot download, bulk time-range .zip, RFC 5545 compliant)
FR-W4-09  Threat statistics panel (detections/hr, active node count, coverage %)
FR-W4-10  Supabase Auth (email + magic link, roles: operator/analyst/admin, RLS enforced)
FR-W4-11  Dark mode enforced (no light/dark toggle — system always dark)
FR-W4-12  Keyboard shortcuts (T=tracks, N=nodes, A=alerts, ESC=close panel, F=fullscreen, S=stats)
```

---

## Tech Stack (LOCKED — ADR-W4-001 through ADR-W4-015)

```
Framework:        Next.js 14.2.x (App Router, TypeScript strict)
Language:         TypeScript 5.4.x
3D Globe:         CesiumJS 1.116.x (dynamic import — WebWorker safe)
Timeline:         OpenMCT 2.0.x (local custom plugin)
State:            Zustand 4.5.x (4 stores: TrackStore, AlertStore, NodeStore, UIStore)
Supabase:         @supabase/supabase-js 2.43.x (Realtime + Auth + PostgREST)
NATS:             nats.ws 1.28.x (reuse @apex-sentinel/nats-client from W2/W3)
Mapping (2D):     Mapbox GL JS 3.4.x (2D fallback when WebGL unavailable)
Styling:          Tailwind CSS 3.4.x + shadcn/ui components
Icons:            lucide-react
Charts:           Recharts 2.12.x (stats panel)
Forms:            react-hook-form + zod
HTTP:             native fetch (no Axios — Next.js 14 native)
Error tracking:   Sentry (@sentry/nextjs 8.x)
Hosting:          Vercel (Next.js-native, edge middleware)
Auth middleware:  next-auth v5 (Supabase Auth adapter)
Testing (unit):   Vitest 1.6.x + React Testing Library 15.x
Testing (E2E):    Playwright 1.44.x
Linting:          ESLint 9.x + Prettier 3.x
Build:            next build (standalone output for Docker compatibility)
```

---

## W4 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (C2 Dashboard — Next.js 14 App Router)                     │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  CesiumJS    │  │  OpenMCT     │  │  Track Table / Alert     │  │
│  │  3D Globe    │  │  Timeline    │  │  Panel / Stats Panel     │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
│         │                 │                        │               │
│  ┌──────▼─────────────────▼────────────────────────▼─────────────┐ │
│  │              Zustand Stores (4)                                │ │
│  │  TrackStore | AlertStore | NodeStore | UIStore                 │ │
│  └──────────────────────────────────────────────────────────────-┘ │
│         │                           │                             │
└─────────┼───────────────────────────┼─────────────────────────────┘
          │                           │
          ▼                           ▼
┌──────────────────┐      ┌──────────────────────┐
│ Supabase Realtime│      │ NATS.ws Proxy         │
│ tracks + alerts  │      │ sentinel.alerts.>     │
│ (wss://supabase) │      │ sentinel.cot.>        │
└──────────────────┘      └──────────────────────┘
```

---

## Plan Phase Status

### Docs Completed This Session

| Doc | Lines | Status |
|-----|-------|--------|
| SESSION_STATE.md (this file) | ~220 | IN PROGRESS |
| ARTIFACT_REGISTRY.md | ~310 | PENDING |
| DEPLOY_CHECKLIST.md | ~320 | PENDING |
| LKGC_TEMPLATE.md | ~260 | PENDING |
| IMPLEMENTATION_PLAN.md | ~620 | PENDING |
| HANDOFF.md | ~260 | PENDING |
| FR_REGISTER.md | ~520 | PENDING |
| RISK_REGISTER.md | ~310 | PENDING |
| INTEGRATION_MAP.md | ~310 | PENDING |
| NETWORK_TOPOLOGY.md | ~310 | PENDING |

### Docs Carried Over from Init

The following docs were written during init and are COMPLETE:
DESIGN, PRD, ARCHITECTURE, DATABASE_SCHEMA, API_SPECIFICATION, AI_PIPELINE,
PRIVACY_ARCHITECTURE, ROADMAP, TEST_STRATEGY, ACCEPTANCE_CRITERIA, DECISION_LOG.

---

## Known Blockers

### BLK-W4-01: CesiumJS Ion Token — Terrain Resolution
```
Description: CesiumJS high-resolution terrain (Cesium World Terrain) requires a Cesium Ion
             access token with a valid subscription. Free tier provides 100k requests/month.
             At 10 operators viewing the dashboard simultaneously with terrain streaming,
             100k requests exhausts in approximately 3-4 days of sustained operation.

Mitigation:  Default to open-source terrain: Cesium.createWorldTerrain() with
             requestWaterMask: false and requestVertexNormals: false to reduce requests.
             Fallback: ArcGIS Online terrain service (no token required for basic elevation).
             Production: Cesium Ion Commercial plan ($499/mo) or self-hosted quantized-mesh
             terrain tiles from OpenTopography DEM data.

Status:      OPEN — decision deferred to W4 deploy phase. Dev uses CesiumJS 1.116 offline
             local terrain tiles for test suite (avoids token consumption in CI).

Impact:      Track altitude rendering may be less accurate at low altitudes over complex
             terrain in demo environments. Operationally acceptable for air track use case.
```

### BLK-W4-02: OpenMCT Plugin API Complexity
```
Description: OpenMCT 2.0 plugin API uses a custom object model (Domain Objects, Telemetry
             Providers, Historical Telemetry) that is not documented with TypeScript types.
             Community @types/openmct package is incomplete.

Mitigation:  Write custom TypeScript declaration file (openmct.d.ts) for the subset of
             OpenMCT API used by the detection timeline plugin. Scope is limited to:
             - openmct.objectProvider (dictionary plugin)
             - openmct.telemetry.addProvider (Supabase historical telemetry)
             - openmct.realtime.addProvider (NATS.ws live telemetry)
             Expected effort: 1 day.

Status:      OPEN — assigned to P2 execution block (days 15-21).
```

### BLK-W4-03: Playwright + WebGL Test Environment
```
Description: CesiumJS renders via WebGL. Playwright's default Chromium headless mode
             (headless: true) does not support hardware WebGL acceleration. Software
             WebGL via SwiftShader is available but renders at <1 FPS for CesiumJS.

Mitigation:  Use Playwright with --disable-gpu=false and launch Chromium in
             headed mode for CI on a display-enabled runner (Xvfb on Linux CI).
             For globe-specific tests: mock CesiumJS viewer and test Zustand store
             integration separately (unit tests). E2E tests will verify globe container
             mounts without asserting 3D render output.

Status:      OPEN — CI configuration required before tdd-red phase.
```

---

## Next Actions (Plan Phase Completion)

```
[ ] Write ARTIFACT_REGISTRY.md
[ ] Write DEPLOY_CHECKLIST.md
[ ] Write LKGC_TEMPLATE.md
[ ] Write IMPLEMENTATION_PLAN.md
[ ] Write HANDOFF.md
[ ] Write FR_REGISTER.md
[ ] Write RISK_REGISTER.md
[ ] Write INTEGRATION_MAP.md
[ ] Write NETWORK_TOPOLOGY.md
[ ] Commit: "docs(w4): plan phase — 10 PROJECTAPEX docs complete"
[ ] Run wave-formation.sh plan W4 (marks plan COMPLETE, unlocks tdd-red)
[ ] Scaffold Next.js 14 app (npx create-next-app@latest)
[ ] Write 30+ failing Vitest tests (tdd-red phase)
[ ] Commit: "test(w4): TDD RED — 30 failing tests"
```

---

## Session Log

```
2026-03-24T00:00:00Z  W4 init — phase starts
2026-03-24T00:05:00Z  ADR-W4-001 to ADR-W4-015 locked (tech stack decisions)
2026-03-24T00:10:00Z  FR-W4-01 to FR-W4-12 defined
2026-03-24T00:15:00Z  W4 DESIGN.md, PRD.md, ARCHITECTURE.md written
2026-03-24T00:20:00Z  W4 DATABASE_SCHEMA.md written (3 new tables, 3 views)
2026-03-24T00:25:00Z  W4 API_SPECIFICATION.md written
2026-03-24T00:30:00Z  W4 AI_PIPELINE.md, PRIVACY_ARCHITECTURE.md written
2026-03-24T00:35:00Z  W4 ROADMAP.md, TEST_STRATEGY.md, ACCEPTANCE_CRITERIA.md written
2026-03-24T00:40:00Z  W4 DECISION_LOG.md written — init phase COMPLETE
2026-03-24T00:45:00Z  Plan phase starts — this file
```
