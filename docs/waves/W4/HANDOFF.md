# APEX-SENTINEL — Wave 4 Handoff Document
## W4 | PROJECTAPEX Doc 18/20 | 2026-03-24

Wave 4: C2 Dashboard — Next.js 14, CesiumJS 3D globe, OpenMCT timeline,
         Supabase Realtime, NATS.ws alerts, Supabase Auth RBAC
Handoff target: Wave 5 — EKF+LSTM Trajectory Prediction Engine

---

## 1. W4 Deliverables at Completion

### 1.1 C2 Dashboard Application
```
Next.js 14 application deployed to Vercel:
  URL:           https://dashboard.apex-sentinel.io
  Vercel project: apex-sentinel-dashboard
  Region:         lhr1 (London)
  Auth:           Supabase Auth (email + magic link)
  Roles:          operator / analyst / admin
  Build:          standalone Next.js output
  Deploy ID:      <captured in LKGC>
```

### 1.2 Globe + Visualization
```
CesiumJS 1.116.x:
  - 3D globe with track markers (color by threat level)
  - Node coverage circles (color by tier + status)
  - Track altitude rendered in ECEF (correct position in 3D space)
  - Globe flies to selected track on row click
  - Click-to-select: track entity click → AlertDetailPanel

OpenMCT 2.0.x plugin:
  - Custom APEX Sentinel OpenMCT plugin (apexSentinelPlugin.ts)
  - Detection timeline: confidence over time per node
  - 24hr lookback, 1s granularity
  - Historical: Supabase get-track-history Edge Function
  - Realtime: NATS.ws sentinel.detections.{nodeId}
```

### 1.3 Data Streams
```
Supabase Realtime subscription:
  Table: tracks (status=in.(active,confirmed))
  Latency SLA: <100ms client-side from DB write
  Reconnect: automatic (Supabase client handles)

NATS.ws subscription:
  Subjects: sentinel.alerts.>, sentinel.cot.events
  Latency SLA: <200ms from publish to AlertBanner display
  Proxy: wss://nats.apex-sentinel.io:443 (nginx → NATS TCP 4222)
```

### 1.4 Supabase Infrastructure Added by W4
```
New tables:
  track_positions    — position history per track (1Hz, 30-day retention)
  dashboard_sessions — auth audit log (user_id, role, ip_address, user_agent)

New materialized views:
  mv_coverage_stats         — refreshed every 60s via pg_cron
  mv_threat_breakdown_24hr  — last 24hr threat level counts

New view:
  v_active_tracks            — tracks WHERE status IN ('active','confirmed') with node join

New Edge Functions:
  export-cot              — CoT XML download (single .cot / bulk .zip)
  get-track-history       — position history for OpenMCT + globe polyline
  get-coverage-stats      — stats panel metrics
  get-node-status-batch   — node health polling (30s interval)
```

### 1.5 Test Suite
```
Vitest unit tests:  ≥ 180, 100% pass, ≥ 80% coverage (branches/functions/lines)
Playwright E2E:     ≥ 60, 100% pass (Chromium + Firefox)
TypeScript:         0 errors
ESLint:             0 errors
Lighthouse:         Performance ≥ 90, Accessibility ≥ 95
```

### 1.6 Documentation
```
20 PROJECTAPEX docs in docs/waves/W4/
All non-stub (> 200 lines, 0 placeholder tokens)
```

---

## 2. What W5 Receives from W4

W5 (EKF + LSTM Trajectory Prediction Engine) depends on these W4 outputs:

### 2.1 track_positions Table (W4 NEW)
```
W4 adds: track_positions table populated by W2 TDoA correlator.
W5 reads this table to train and apply EKF/LSTM trajectory prediction.

Schema:
  id:           bigserial PRIMARY KEY
  track_id:     text NOT NULL REFERENCES tracks(track_id)
  lat:          double precision
  lon:          double precision
  alt_m:        double precision
  speed_ms:     double precision
  heading_deg:  double precision
  confidence:   double precision
  ts:           timestamptz

W5 query pattern:
  SELECT lat, lon, alt_m, speed_ms, heading_deg, ts
  FROM track_positions
  WHERE track_id = $1
  ORDER BY ts ASC
  LIMIT 300  -- ~5 minutes of history at 1Hz

W5 will add:
  predicted_trajectory JSONB column to tracks table
  (Array of {lat, lon, alt_m, ts} for next 30–60 seconds)
  W4 dashboard will render this as a dashed polyline on CesiumJS globe.
```

### 2.2 v_active_tracks View
```
W5 EKF service polls v_active_tracks for all active tracks that need trajectory prediction.
Polling interval: 1s (for near-real-time prediction updates).

View returns: track_id, lat, lon, alt_m, speed_ms, heading_deg, threat_level, status,
              contributing_nodes, last_updated_at
```

### 2.3 C2 Dashboard Rendering Hook for W5
```
W4 dashboard is prepared to render W5 trajectory overlays.
TrackMarker in CesiumJS has a placeholder for predicted_trajectory polyline rendering:

In W4, if track.predicted_trajectory is present (W5 will populate this):
  - A dashed cyan polyline is rendered from current position along predicted path
  - Polyline fades opacity from 1.0 → 0.2 over predicted time window
  - W4 implements this render path as a no-op (polyline hidden if W5 field absent)

W4 TrackMarker.ts includes:
  export function renderPredictedTrajectory(
    entity: Cesium.Entity,
    trajectory: Array<{ lat: number; lon: number; alt_m: number }> | null,
    Cesium: typeof import('cesium')
  ): void {
    // W4: no-op — W5 will provide trajectory data
    // W5: populate entity.polyline with trajectory positions
    if (!trajectory || trajectory.length === 0) return;
    // Future: entity.polyline = { positions: trajectory.map(...), ... }
  }
```

### 2.4 OpenMCT Plugin Extension Point
```
W4 apexSentinelPlugin provides domain object structure.
W5 will extend the plugin to add:
  - /apex-sentinel.predictions.{trackId}   — predicted trajectory telemetry source
  - /apex-sentinel.predictions.confidence — EKF confidence interval over time

W5 engineers extend apexSentinelPlugin by adding domain objects in the existing
folder structure. Plugin config: add 'enablePredictions: true' to ApexSentinelPluginConfig.
```

---

## 3. W5 Prerequisites

Before W5 can begin:

```
[ ] W4 COMPLETE — wave-formation.sh complete W4 executed
[ ] Dashboard deployed and verified at dashboard.apex-sentinel.io
[ ] track_positions table being populated (verify: SELECT count(*) FROM track_positions)
[ ] W4 LKGC snapshot in Supabase lkgc_snapshots (wave='W4')
[ ] W4 HANDOFF.md committed with [W4-HANDOFF-APPROVED] in commit message
[ ] W3 mobile app generating detections → W2 TDoA correlating → tracks table active
[ ] At least 1 active track visible on globe during W5 development session setup

W5 environment additions:
[ ] Python 3.11+ environment for EKF/LSTM model development
[ ] GPU-enabled VM for LSTM training (Azure NC-series or equivalent)
[ ] PyTorch 2.3+ or TensorFlow 2.16+ installed
[ ] filterpy 1.4.x (EKF implementation: pip install filterpy)
[ ] Supabase Python client: supabase-py 2.5+
[ ] NATS.py for W5 backend NATS publishing: nats-py 2.6+
```

---

## 4. W4 Known Limitations

### 4.1 CesiumJS Terrain Resolution (Free Tier)
```
CesiumJS Cesium World Terrain on free Ion tier: 100k requests/month.
At 10 concurrent operators: exhausts in ~3-4 days of continuous use.
Terrain resolution is also capped at lower LOD on free tier.

Impact:
  Low-altitude tracks (< 50m AGL) may appear below terrain surface on hillsides.
  This is a display artifact only — track data is correct (lat/lon/alt from TDoA).

Mitigation for W5:
  Switch to Cesium Ion Commercial ($499/mo) or self-host quantized-mesh terrain tiles.
  W4 dashboard supports terrain provider swap via next.config.mjs environment variable
  CESIUM_TERRAIN_URL (defaults to Ion CDN, overridable with self-hosted URL).
```

### 4.2 OpenMCT Plugin API Instability
```
OpenMCT 2.0 does not have a stable TypeScript API. The custom openmct.d.ts written
in W4 covers the subset used by the detection timeline plugin. If NASA updates OpenMCT
to 3.0, the plugin will need to be rewritten against the new API.

Lock: OpenMCT version is pinned to 2.0.x in package.json with caret removed:
  "openmct": "2.0.4"   (exact version, not "^2.0.4")
```

### 4.3 Dashboard is Desktop-Only
```
W4 C2 Dashboard is designed for widescreen desktop displays (≥ 1440px).
No responsive layout for mobile/tablet.

Rationale: C2 operators use workstations, not phones.
           CesiumJS WebGL requires a real GPU (not mobile GPU acceptable for C2 use).

If mobile C2 is required: implement a separate lightweight mobile dashboard (W6+).
W4 dashboard is explicitly NOT responsive — do not add @media queries for mobile.
```

### 4.4 No Offline Mode
```
W4 dashboard requires internet connectivity for:
  - Supabase Realtime WebSocket
  - NATS.ws WebSocket
  - CesiumJS tile CDN (terrain + imagery)

If network is lost:
  - Realtime subscription shows "disconnected" status badge
  - NATS.ws shows "NATS: disconnected" indicator
  - Globe shows cached tile textures at last zoom level, no new terrain loads
  - Track table retains last-known tracks in Zustand store (memory)
  - No local storage persistence for track data (security policy — track data is sensitive)

Offline mode is out of scope for W4. W6+ may address airgapped deployment.
```

### 4.5 CoT Export: Vercel Function Timeout on Large Bulk Exports
```
Vercel Hobby plan: 10s function timeout. Pro plan: 60s.
Bulk CoT export (export-cot Edge Function) for large time ranges (>1000 tracks) may
approach timeout on Hobby plan.

Mitigation:
  Rate limit: 10 exports/minute per user (reduces load).
  Max export range: 4 hours (configurable via EXPORT_MAX_HOURS env var, default: 4).
  For >1000 tracks: stream zip asynchronously to Supabase Storage and return a download URL
  (W5 enhancement — W4 does synchronous zip for ≤1000 tracks only).
  Vercel Pro plan recommended for production C2 use.
```

### 4.6 Auth: No SSO / SAML
```
W4 implements Supabase Auth (email + magic link) only.
No SAML, LDAP, Active Directory, or SSO integration.

Military/government deployments typically require SAML 2.0 SSO with existing identity
providers (Okta, Azure AD, etc.).

Supabase Auth supports SAML SSO on Team plan ($25/mo) and Enterprise.
W5 or W6 should evaluate SAML SSO if deploying to government customers.
```

---

## 5. W4 Architecture Decisions Permanent After Handoff

These decisions cannot be reversed in W5+ without breaking W4:

```
1. track_positions table schema (W5 reads this — changing columns is a breaking change)
2. NATS subject naming: sentinel.alerts.>, sentinel.cot.events (W5 must use same)
3. Track interface (TypeScript) — adding columns is OK; removing/renaming is breaking
4. Supabase Realtime enabled on tracks + alerts tables
5. Supabase project ref: bymfcnwfyxuivinuzurr (permanent — project migration is complex)
6. Vercel region: lhr1 (London) — must match eu-west-2 Supabase for low-latency Realtime
7. UserRole enum: operator | analyst | admin — W5 may add 'viewer' but not rename existing
8. CesiumJS ECEF coordinate system (Cartesian3.fromDegrees) — W5 trajectory must use same
```

---

## 6. W5 Scope Preview (For Context Only)

```
W5: EKF + LSTM Trajectory Prediction
  - Extended Kalman Filter for state estimation (position, velocity, heading rate)
  - LSTM neural network for maneuver pattern recognition (trained on track_positions history)
  - Outputs: predicted_trajectory array → stored in tracks.predicted_trajectory (JSONB)
  - Dashboard: W4 TrackMarker renders predicted path as dashed polyline (W4 extension hook ready)
  - Confidence: EKF covariance ellipse rendered as semi-transparent cone on globe
  - Backend: Python FastAPI service on Azure (GPU VM) + NATS.py subscriber + Supabase publisher
  - Latency target: prediction update within 500ms of track position update
```

---

## 7. Sign-Off

```
W4 Lead Engineer:        Nicolae Fratila (Nico)
W4 Review Status:        PENDING (requires wave-formation.sh complete W4 execution)
Commit tag:              [W4-HANDOFF-APPROVED] in merge commit message
Git tag:                 v4.0.0-w4-lkgc

Conditions for W4 COMPLETE:
  [ ] All ≥320 W4 tests passing
  [ ] Dashboard live at dashboard.apex-sentinel.io
  [ ] Lighthouse: Performance ≥90, Accessibility ≥95
  [ ] LKGC captured in Supabase
  [ ] This HANDOFF.md committed (last doc in W4 suite)
  [ ] wave-formation.sh complete W4 executed successfully
```
