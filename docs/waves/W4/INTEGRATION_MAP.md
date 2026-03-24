# APEX-SENTINEL W4 — INTEGRATION MAP
## W4 | PROJECTAPEX Doc (supplementary) | 2026-03-24

> Wave: W4 — C2 Dashboard
> This document maps all external service integrations, data flows, latency budgets,
> and auth flows for the W4 C2 Dashboard.

---

## 1. Full System Integration Diagram

```
                        ┌─────────────────────────────────────────────────────────────┐
                        │               BROWSER (C2 Dashboard)                        │
                        │                                                             │
                        │  ┌──────────────┐   ┌──────────────┐  ┌──────────────────┐ │
                        │  │  CesiumJS    │   │   OpenMCT    │  │   React App UI   │ │
                        │  │  3D Globe    │   │   Timeline   │  │  (Next.js 14)    │ │
                        │  └──────┬───────┘   └──────┬───────┘  └────────┬─────────┘ │
                        │         │                  │                   │           │
                        │  ┌──────▼──────────────────▼───────────────────▼─────────┐ │
                        │  │              Zustand Stores (4)                        │ │
                        │  │  TrackStore │ AlertStore │ NodeStore │ UIStore         │ │
                        │  └───┬─────────────┬──────────────┬────────────┬─────────┘ │
                        │      │             │              │            │           │
                        └──────┼─────────────┼──────────────┼────────────┼───────────┘
                               │             │              │            │
          ┌────────────────────┘             │              │            └─────────────────┐
          │                                  │              │                              │
          ▼                                  ▼              ▼                              ▼
┌──────────────────┐              ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ SUPABASE         │              │  NATS.WS PROXY   │  │ SUPABASE         │  │  CESIUMJS TILE   │
│ REALTIME         │              │  (nginx)         │  │ POSTGREST        │  │  CDN             │
│                  │              │  nats.apex-      │  │ (REST API)       │  │  (Ion or OSM)    │
│ wss://bymf...    │              │  sentinel.io:443 │  │                  │  │                  │
│ /realtime/v1     │              │       │          │  │ /rest/v1/tracks  │  │ terrain tiles    │
│                  │              │       ▼          │  │ /rest/v1/nodes   │  │ imagery tiles    │
│ tracks:          │              │  ┌──────────┐   │  │                  │  │                  │
│   INSERT/UPDATE/ │              │  │  NATS    │   │  │ (polling 30s)    │  │ (streamed async) │
│   DELETE events  │              │  │  Cluster │   │  └──────────────────┘  └──────────────────┘
│                  │              │  │  (W2)    │   │
│ alerts:          │              │  └──────────┘   │
│   INSERT events  │              │       │          │
└──────────────────┘              │  sentinel.alerts.>
                                  │  sentinel.cot.events
                                  │  sentinel.detections.>
                                  └──────────────────┘
          │                                  │
          │  SUPABASE AUTH                   │  SUPABASE EDGE FUNCTIONS
          ▼                                  ▼
┌──────────────────┐              ┌──────────────────────────────────────────────────┐
│ auth.users table │              │  /functions/v1/                                  │
│ JWT issuance     │              │    export-cot           (analyst/admin)           │
│ magic link OTP   │              │    get-track-history    (authenticated)           │
│ session refresh  │              │    get-coverage-stats   (authenticated)           │
│                  │              │    get-node-status-batch (authenticated)          │
│ user_metadata:   │              │    ingest-event          (W2, internal)           │
│   role: operator │              │    dispatch-alert        (W2, internal)           │
│        analyst   │              │    get-node-config       (W2, mobile app)         │
│        admin     │              │    register-node         (W2, mobile app)         │
└──────────────────┘              └──────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────┐
│  NEXT.JS         │
│  MIDDLEWARE      │
│  (Edge runtime)  │
│                  │
│  auth check      │
│  RBAC check      │
│  IP allowlist    │
│  rate limit      │
└──────────────────┘
          │
          ▼
┌──────────────────┐
│  VERCEL CDN      │
│  (lhr1 region)   │
│                  │
│  dashboard.      │
│  apex-sentinel   │
│  .io             │
│                  │
│  Next.js pages   │
│  static assets   │
│  edge middleware │
└──────────────────┘
```

---

## 2. Data Flow: Track from Detection to Globe

```
Step  Who                     What                                    Latency Budget
────  ─────────────────────── ─────────────────────────────────────── ──────────────
1.    W3 Mobile App           Captures audio, runs YAMNet INT8         0ms (local)
2.    W3 Mobile App           NATS pub sentinel.detections.{nodeId}    ~50ms (WS)
3.    W2 ingest-event         Receives NATS message, runs Gate 4       ~200ms
4.    W2 TDoA correlator      Correlates 3+ node events → track        ~1000ms
5.    W2 TDoA correlator      Upserts tracks table + track_positions   ~50ms (Supabase)
6.    Supabase Realtime        Detects postgres_changes, fans out       ~20ms
7.    Browser (W4)            Receives WebSocket frame                 ~30ms (network)
8.    TrackStore               upsertTrack() → React re-render          <5ms (JS)
9.    CesiumJS                updateTrackEntity() → entity position    <16ms (next frame)
────  ─────────────────────── ─────────────────────────────────────── ──────────────
Total end-to-end (detection audio → track on globe):                  ~1.4s

Note: Most of the latency is W2 TDoA correlation (1000ms). W4 accounts for:
  Supabase Realtime: ~20ms
  Network (EU):      ~30ms
  JavaScript:        <21ms
Total W4 contribution: ~71ms (well within 100ms FR-W4-02 client-side SLA)
```

---

## 3. Data Flow: Alert from Dispatch to Banner

```
Step  Who                     What                                    Latency Budget
────  ─────────────────────── ─────────────────────────────────────── ──────────────
1.    W2 dispatch-alert       NATS pub sentinel.alerts.{threatLevel}   ~50ms (W2→NATS)
2.    NATS cluster            Routes to sentinel.alerts.> subscribers  ~5ms (intra-cluster)
3.    nginx NATS.ws proxy     Forwards WebSocket frame to browser      ~10ms (proxy)
4.    Browser NATS.ws client  Receives frame, StringCodec.decode       ~2ms (JS)
5.    AlertStore.addAlert()   Prepends alert, increments unreadCount   <1ms (JS)
6.    AlertBanner             React state update → render              <16ms (next frame)
────  ─────────────────────── ─────────────────────────────────────── ──────────────
Total W4 latency (NATS publish to banner display):                     ~84ms

FR-W4-03 SLA: <200ms. Budget: 116ms spare.
```

---

## 4. Supabase Integration Detail

```
Supabase Project: bymfcnwfyxuivinuzurr
Region:           eu-west-2 (AWS London)
Plan:             Pro (required for Realtime on multiple tables + Edge Functions)

┌─────────────────────────────────────────────────────────────────┐
│  SUPABASE SERVICES USED BY W4 DASHBOARD                        │
│                                                                 │
│  Auth                                                           │
│    Provider: Email + Magic Link OTP                             │
│    Session: JWT (RS256), 1hr expiry, auto-refresh               │
│    User metadata: role claim (operator/analyst/admin)           │
│    Tables: auth.users (managed by Supabase)                     │
│                                                                 │
│  Realtime                                                       │
│    Publication: supabase_realtime (default)                     │
│    Tables enabled: tracks, alerts                               │
│    Protocol: Phoenix WebSocket (wss://...supabase.co/realtime)  │
│    Filter: postgres_changes, schema=public, table=tracks        │
│             filter: 'status=in.(active,confirmed)'              │
│                                                                 │
│  PostgREST (REST API)                                           │
│    Used for: initial track load, node polling                   │
│    Auth: Bearer JWT (from Supabase Auth session)                │
│    RLS: enforced — anon has no access to operational tables     │
│    Endpoints:                                                   │
│      GET /rest/v1/tracks?status=in.(active,confirmed)&limit=500 │
│      GET /rest/v1/nodes                                         │
│                                                                 │
│  Edge Functions                                                 │
│    Runtime: Deno 1.41.x (Supabase managed)                     │
│    Auth: Bearer JWT validated via supabase-js                   │
│    CORS: restricted to dashboard.apex-sentinel.io               │
│    Endpoints: /functions/v1/{function-name}                     │
│                                                                 │
│  Storage                                                        │
│    NOT used by W4. Bulk export: streamed inline (no storage).   │
│    Future W5: may use Storage for large trajectory datasets.    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. NATS.ws Integration Detail

```
NATS Cluster: W2 infrastructure (5-node JetStream cluster)
NATS.ws Proxy: nginx at nats.apex-sentinel.io:443

┌─────────────────────────────────────────────────────────────────┐
│  NATS SUBJECTS — W4 DASHBOARD SUBSCRIPTIONS (read-only)        │
│                                                                 │
│  sentinel.alerts.>                                              │
│    Source:   W2 dispatch-alert Edge Function                    │
│    Payload:  Alert JSON (UTF-8, StringCodec)                    │
│    Consumer: AlertStore.addAlert()                              │
│    Rate:     0-10 msgs/s (sustained), up to 100 msgs/s (burst)  │
│                                                                 │
│  sentinel.cot.events                                            │
│    Source:   W2 CoT relay (alert-router)                        │
│    Payload:  CoT XML string (UTF-8, StringCodec)                │
│    Consumer: AlertStore (enriches alert.cot_xml by alert_id)    │
│    Rate:     Same as alerts (1:1 correlation)                   │
│                                                                 │
│  sentinel.detections.{nodeId}                                   │
│    Source:   W3 mobile app nodes                                │
│    Payload:  Detection JSON (nodeId, threatClass, confidence...) │
│    Consumer: OpenMCT plugin realtime provider                   │
│    Rate:     0-4 msgs/s per node (1-4 Hz detection rate)        │
│                                                                 │
│  SUBJECTS NOT SUBSCRIBED BY W4 (produced by W3):               │
│    sentinel.node.heartbeat      — node health (polled via REST) │
│    sentinel.node.offline        — not needed by dashboard       │
│    sentinel.mesh.inbound.>      — Meshtastic, not for C2 UI     │
└─────────────────────────────────────────────────────────────────┘

Credential type: NKey subscribe-only operator credential
Stored in:       Supabase Edge Function secret (NATS_CREDS_BASE64)
Dashboard auth:  NKey seed sent to browser as part of NATS.ws connect options
                 (NOTE: this exposes subscribe credentials to browser — acceptable
                  for read-only access to non-classified data streams)
```

---

## 6. CesiumJS Integration Detail

```
┌─────────────────────────────────────────────────────────────────┐
│  CESIUMJS EXTERNAL SERVICES                                     │
│                                                                 │
│  Cesium Ion (optional, requires CESIUM_ION_TOKEN)               │
│    Cesium World Terrain: https://assets.cesium.com/1           │
│    Bing Maps imagery:    https://assets.cesium.com/2           │
│    Free tier: 100k requests/month                              │
│    Protocol: HTTPS tile fetch (no WebSocket)                   │
│                                                                 │
│  Fallback: Open-source (no token required)                     │
│    Terrain: WGS84 ellipsoid (flat — no terrain elevation)      │
│    OR: CesiumTerrainProvider from ArcGIS/OpenTopography         │
│    Imagery: OpenStreetMap tile layer (free, attribution req'd)  │
│                                                                 │
│  CesiumJS Static Assets (served from Vercel CDN)               │
│    public/cesium/Workers/  — Web Workers for tile decoding     │
│    public/cesium/Assets/   — 3D model assets, textures         │
│    public/cesium/Widgets/  — CSS for built-in controls         │
│    public/cesium/ThirdParty/ — CesiumJS dependencies           │
│    Served from: https://dashboard.apex-sentinel.io/cesium/     │
│    Cache-Control: public, max-age=31536000 (1 year)            │
│                                                                 │
│  CSP requirement for CesiumJS:                                 │
│    script-src: blob: (WebWorker scripts)                       │
│    worker-src: blob:                                           │
│    unsafe-eval: required by CesiumJS (uses eval for shaders)   │
│    connect-src: https://*.cesium.com                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. OpenMCT Integration Detail

```
┌─────────────────────────────────────────────────────────────────┐
│  OPENMCT PLUGIN DATA SOURCES                                    │
│                                                                 │
│  Historical Telemetry                                           │
│    Source:    Supabase Edge Function get-track-history          │
│    Endpoint:  GET /functions/v1/get-track-history?track_id=X    │
│    Auth:      Bearer JWT (from Supabase Auth session)           │
│    Response:  { positions: [{lat,lon,alt_m,confidence,ts},...]} │
│    Limit:     500 data points per request                       │
│    Latency:   ~200ms typical                                    │
│                                                                 │
│  Realtime Telemetry                                             │
│    Source:    NATS.ws sentinel.detections.{nodeId}              │
│    Protocol:  Existing NATS.ws connection (shared with alerts)  │
│    Batching:  OpenMCT requires batched updates — 500ms window   │
│    Format:    {id: string, timestamp: ms, value: confidence}    │
│                                                                 │
│  OpenMCT runs as embedded SPA within Next.js /analytics page   │
│    Load: <script src="/openmct/openmct.js"> (bundled locally)  │
│    No CDN dependency for OpenMCT itself — bundled in app       │
│    openmct.start() called in a useEffect (client-side only)    │
│    OpenMCT target DOM: <div id="openmct-container">            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Vercel + Sentry Integration

```
┌─────────────────────────────────────────────────────────────────┐
│  VERCEL                                                         │
│    Hosting:     Next.js 14 (App Router)                         │
│    Region:      lhr1 (London) — nearest to eu-west-2 Supabase  │
│    Build:       next build (standalone output)                  │
│    Edge runtime: Next.js Middleware (auth + RBAC)               │
│    Function timeout: 10s (Hobby) / 60s (Pro)                   │
│    Bandwidth:   Vercel CDN serves CesiumJS assets (~50MB total) │
│                                                                 │
│  SENTRY                                                         │
│    SDK:         @sentry/nextjs 8.x                             │
│    DSN:         SENTRY_DSN env var (server-side only)           │
│    Source maps: uploaded on build via SENTRY_AUTH_TOKEN         │
│    Captures:    unhandled exceptions, NATS/Realtime errors      │
│    Performance: transaction sampling = 0.1 (10% of page loads) │
│    Release:     tied to git SHA (auto-injected by sentry CLI)   │
│                                                                 │
│  MAPBOX GL JS (2D fallback)                                     │
│    Token:       NEXT_PUBLIC_MAPBOX_TOKEN (public, safe)         │
│    Used when:   CesiumJS WebGL unavailable OR                  │
│                 UIStore.globeMode = '2d'                        │
│    Style:       mapbox://styles/mapbox/dark-v11                 │
│    Tracks:      rendered as GeoJSON circle layers               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Auth Flow Sequence

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  MAGIC LINK AUTH FLOW                                                        │
│                                                                              │
│  Operator         Browser             Supabase Auth        Next.js           │
│  ─────────       ─────────────        ─────────────────    ───────────────   │
│  1. Visit        GET /login           —                    —                 │
│     /dashboard ──▶ (middleware) ──────────────────────────▶ redirect /login  │
│                                                                              │
│  2. Enter email  POST signInWithOtp()  ──────────────────▶                  │
│     click send   ◀── "Check email"    send magic link email                  │
│                                                                              │
│  3. Click link   GET /auth/callback    —                   —                 │
│     in email     ?code=XXXX ──────────────────────────────▶                 │
│                            supabase.auth.exchangeCodeForSession(code)         │
│                            ──────────────────────────────▶                  │
│                            ◀── { session: { access_token, user } }           │
│                                        set cookie (sb-auth-token)             │
│                            redirect /dashboard                                │
│                                                                              │
│  4. Visit        GET /dashboard        —                   —                 │
│     /dashboard   (middleware) ──────── verify JWT ────────▶                  │
│                               extract role from user_metadata                │
│                               ◀── 200 or redirect based on role             │
│                                                                              │
│  5. API calls    Realtime subscribe    verify JWT (auto)   —                 │
│                  NATS.ws connect       —                   —                 │
│                  GET /functions/v1/X   verify JWT ────────▶                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Latency Budget Summary

| Integration | Operation | Target | Actual (estimated) | Status |
|-------------|-----------|--------|--------------------|--------|
| Supabase Realtime | Track update to store | <100ms | ~50ms | OK |
| NATS.ws | Alert publish to banner | <200ms | ~84ms | OK |
| Supabase PostgREST | Initial 500 tracks load | <2000ms | ~600ms | OK |
| Edge Function | get-coverage-stats | <500ms | ~200ms | OK |
| Edge Function | export-cot (single) | <2000ms | ~300ms | OK |
| Edge Function | export-cot (bulk 1000) | <10000ms | ~8000ms | BORDERLINE |
| Edge Function | get-track-history | <500ms | ~200ms | OK |
| Edge Function | get-node-status-batch | <500ms | ~150ms | OK |
| CesiumJS | Globe initial render | <5000ms | ~3000ms (w/ terrain) | OK |
| Vercel | Page shell LCP | <2500ms | ~800ms | OK |
| Supabase Auth | Magic link delivery | <60s | ~15s (email) | OK |

**Bulk CoT export (8000ms) is borderline on Supabase Edge Functions free plan (10s timeout).
Must use Pro plan or implement 1000-track cap (see RISK-W4-11).**
