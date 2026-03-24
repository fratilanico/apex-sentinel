# APEX-SENTINEL W4 — LAST KNOWN GOOD CONFIGURATION TEMPLATE
## W4 | PROJECTAPEX Doc 16/20 | 2026-03-24

> Wave: W4 — C2 Dashboard
> Purpose: Snapshot configuration at a verified-stable state for rollback reference.
> Must be captured: after deploy verification, before wave-formation.sh complete W4.

---

## LKGC Philosophy

An LKGC is a timestamped, immutable record of every version, hash, config value, and
test result that collectively define a stable system. If any future deployment breaks
the system, this document allows exact restoration.

W4 LKGC is the third LKGC in the APEX-SENTINEL system (W1, W2, W3 each have one).
It extends the system by adding the C2 Dashboard layer.

---

## Section 1: Versioning

### 1.1 Dashboard Version
```
dashboard_version:    <semver — e.g. 4.0.0>
Release tag:          v4.0.0-w4-lkgc
Tag format:           vMAJOR.MINOR.PATCH-wN-lkgc
                       MAJOR = wave number
                       MINOR = increment for within-wave iterations
                       PATCH = hotfix counter (0 at wave complete)
```

### 1.2 Git SHA
```
git_sha:              <40-char hex — output of: git rev-parse HEAD>
git_branch:           main
git_remote:           origin (github.com/apex-sentinel/apex-sentinel)
git_tag:              v4.0.0-w4-lkgc

Capture command:
  git rev-parse HEAD
```

### 1.3 Vercel Deploy SHA
```
vercel_deploy_id:     <Vercel deployment ID — dpl_XXXXXXXXXXXX>
vercel_deploy_url:    https://apex-sentinel-dashboard-XXXXXXXX.vercel.app
vercel_production_url: https://dashboard.apex-sentinel.io
vercel_region:        lhr1
vercel_runtime:       nodejs20.x

Capture command:
  vercel ls apex-sentinel-dashboard --limit 1 | awk '{print $2}'
```

### 1.4 Next.js Bundle
```
next_version:         14.2.x (exact: package-lock.json)
node_version:         20.x LTS (from vercel runtime)
build_id:             <Next.js build ID — .next/BUILD_ID>
bundle_size_js:       <initial JS size in KB — from next build output>
bundle_size_css:      <initial CSS size in KB — from next build output>

Bundle size thresholds (must not exceed at LKGC):
  Initial JS load:    < 500 KB (gzipped)
  Total page weight:  < 2 MB (gzipped, excluding CesiumJS deferred load)
  CesiumJS deferred:  < 4 MB (gzipped, loaded async after LCP)

Capture command:
  cd packages/dashboard && next build 2>&1 | grep "First Load JS"
```

---

## Section 2: Supabase Configuration

### 2.1 Project Identity
```
supabase_project_ref:    bymfcnwfyxuivinuzurr
supabase_project_name:   apex-sentinel
supabase_region:         eu-west-2 (AWS London)
supabase_db_version:     PostgreSQL 15.x
supabase_project_url:    https://bymfcnwfyxuivinuzurr.supabase.co
```

### 2.2 Migration State
```
latest_migration:     0021_w4_views.sql
migration_count:      21
all_migrations_applied: YES

Verify command:
  supabase db diff --project-ref bymfcnwfyxuivinuzurr
  # Expected output: (empty — no unapplied changes)

Migration checksums (record after apply):
  0019_track_positions.sql:     <md5sum>
  0020_dashboard_sessions.sql:  <md5sum>
  0021_w4_views.sql:            <md5sum>
```

### 2.3 Edge Functions
```
Functions deployed (W4 additions):
  export-cot:               version <N>, deployed at <ISO timestamp>
  get-track-history:        version <N>, deployed at <ISO timestamp>
  get-coverage-stats:       version <N>, deployed at <ISO timestamp>
  get-node-status-batch:    version <N>, deployed at <ISO timestamp>

Functions deployed (W1-W3 inherited):
  ingest-event:             version <N> (W2)
  dispatch-alert:           version <N> (W2)
  get-node-config:          version <N> (W2)
  register-node:            version <N> (W2)

Capture command (Supabase CLI):
  supabase functions list --project-ref bymfcnwfyxuivinuzurr
```

### 2.4 Realtime Publication
```
realtime_enabled_tables:
  tracks:           YES (postgres_changes: INSERT, UPDATE, DELETE)
  alerts:           YES (postgres_changes: INSERT, UPDATE, DELETE)
  nodes:            NO (polled via Edge Function every 30s)
  track_positions:  NO (history — not streamed)
  detection_events: NO (archived — not streamed)
  dashboard_sessions: NO (audit log — not streamed)

Verify command (Supabase Dashboard → Database → Replication):
  Check that 'tracks' and 'alerts' appear in the Realtime publication list.

WebSocket subscription test:
  wscat -c 'wss://bymfcnwfyxuivinuzurr.supabase.co/realtime/v1/websocket?apikey=<anon_key>&vsn=1.0.0'
  Expected: connected, {"event":"phx_reply","payload":{"status":"ok"}} within 2s
```

---

## Section 3: NATS Configuration

### 3.1 NATS.ws Proxy
```
nats_ws_url:          wss://nats.apex-sentinel.io:443
nats_ws_proxy:        nginx reverse proxy → NATS TCP 4222
nats_cluster_version: 2.10.x (inherited from W2)
nats_ws_timeout:      90s ping/pong keepalive

Test command:
  wscat -c wss://nats.apex-sentinel.io:443
  Expected: NATS websocket handshake, no TLS error

Subjects used by W4 dashboard (subscribe only):
  sentinel.alerts.>      — received from W2 dispatch-alert function
  sentinel.cot.events    — received from W2 alert-router relay
  sentinel.detections.>  — received from W3 mobile nodes (read-only, for OpenMCT)
```

### 3.2 Dashboard NATS Credentials
```
credential_type:  NKey operator key (subscribe-only, no publish permission)
credential_scope: subscribe on sentinel.alerts.>, sentinel.cot.events, sentinel.detections.>
storage:          Supabase secrets (NATS_CREDS_BASE64 env var, base64 NKey seed)
rotation:         every 90 days (calendar reminder set)

DO NOT store NKey seed in git. DO NOT log it. DO NOT include in this document.
Reference only: NATS_CREDS_BASE64 env var in Supabase Edge Function secrets.
```

---

## Section 4: CesiumJS Configuration

### 4.1 CesiumJS Version
```
cesiumjs_version:     1.116.0
ion_token_type:       free tier (100k requests/month) OR commercial (per contract)
terrain_provider:     Cesium.createWorldTerrain() with requestWaterMask: false
                      Fallback: ArcGIS Online terrain (no token)
imagery_provider:     Bing Maps aerial (Cesium default, requires Ion token)
                      Fallback: OpenStreetMap tile layer (no token)

Ion token environment: CESIUM_ION_TOKEN (server-side, not NEXT_PUBLIC_)
Ion token expiry:      <date — check Cesium Ion dashboard>
Ion account tier:      <free|commercial>
```

### 4.2 WebGL Requirements
```
webgl_version:        WebGL 2.0 required (fallback: WebGL 1.0 with degraded terrain)
min_gpu:              Intel HD Graphics 4000 equivalent (software WebGL not supported)
browser_support:
  Chrome:   ≥ 90 (WebGL 2.0 stable)
  Firefox:  ≥ 90 (WebGL 2.0 stable)
  Safari:   ≥ 16 (WebGL 2.0 on Apple Silicon — M1+)
  Edge:     ≥ 90 (Chromium-based)
  IE/Legacy: NOT SUPPORTED
```

---

## Section 5: Test Results

### 5.1 Vitest Pass Rate
```
vitest_run:           npx vitest run --coverage
total_tests:          <N>
passing:              <N>
failing:              0 (must be 0 at LKGC)
skipped:              <N>
coverage_branches:    <N>% (must be ≥80%)
coverage_functions:   <N>% (must be ≥80%)
coverage_lines:       <N>% (must be ≥80%)
coverage_statements:  <N>% (must be ≥80%)
duration:             <seconds>

Capture command:
  npx vitest run --coverage --reporter=json 2>&1 | \
    jq '{total: .numTotalTests, passed: .numPassedTests, failed: .numFailedTests}'
```

### 5.2 Playwright Pass Rate
```
playwright_run:       npx playwright test
total_tests:          <N>
passing:              <N>
failing:              0 (must be 0 at LKGC)
browsers:             Chromium, Firefox
duration:             <seconds>

Capture command:
  npx playwright test --reporter=json 2>&1 | \
    jq '{total: .stats.expected, passed: .stats.expected, failed: .stats.unexpected}'
```

### 5.3 TypeScript Check
```
tsc_errors:     0 (must be 0)
tsc_command:    npx tsc --noEmit
duration:       <seconds>
```

---

## Section 6: Lighthouse Score

### 6.1 Score Capture
```
lighthouse_url:         https://dashboard.apex-sentinel.io/dashboard
lighthouse_auth:        authenticated session (operator role)
lighthouse_device:      desktop (1440x900)

Scores (all must meet thresholds):
  performance:      <score> (threshold: ≥90)
  accessibility:    <score> (threshold: ≥95)
  best_practices:   <score> (threshold: ≥90)
  seo:              <score> (threshold: ≥80)

Key metrics:
  FCP (First Contentful Paint):   <ms> (target: <1000ms)
  LCP (Largest Contentful Paint): <ms> (target: <2500ms)
  TBT (Total Blocking Time):      <ms> (target: <200ms)
  CLS (Cumulative Layout Shift):  <score> (target: <0.1)
  TTI (Time to Interactive):      <ms> (target: <3500ms)

Note: CesiumJS WebGL canvas loads async. LCP measures page shell, not globe render.
Globe interactive time is separately tracked (time to first track marker rendered).
Globe-to-interactive:   <ms> (target: <5000ms on 100Mbit connection)

Capture command:
  npx playwright test e2e/lighthouse.spec.ts --reporter=json
```

---

## Section 7: Cumulative W1-W4 System State

### 7.1 All Wave LKGC References
```
W1 LKGC:
  git_tag:      v1.0.0-w1-lkgc
  git_sha:      <from W1 LKGC>
  tests:        102/102
  deliverable:  YAMNet INT8 inference pipeline + NATS.ws client

W2 LKGC:
  git_tag:      v2.0.0-w2-lkgc
  git_sha:      <from W2 LKGC>
  tests:        57/57
  deliverable:  NATS cluster, TDoA correlator, 4 Edge Functions, Supabase schema

W3 LKGC:
  git_tag:      v3.0.0-w3-lkgc
  git_sha:      <from W3 LKGC>
  tests:        183/183
  deliverable:  React Native app (Android + iOS), Expo SDK 51

W4 LKGC (this snapshot):
  git_tag:      v4.0.0-w4-lkgc
  git_sha:      <captured at deploy>
  tests:        ≥320 (W4) / ≥662 (cumulative W1-W4)
  deliverable:  C2 Dashboard (Next.js 14, CesiumJS, OpenMCT, Supabase Auth)
```

### 7.2 Infrastructure State at W4 LKGC
```
supabase_tables:      tracks, alerts, nodes, detection_events, alert_subscriptions,
                      model_versions, node_calibrations, app_config, lkgc_snapshots,
                      track_positions, dashboard_sessions (+ views: v_active_tracks,
                      mv_coverage_stats, mv_threat_breakdown_24hr)
edge_functions:       ingest-event, dispatch-alert, get-node-config, register-node,
                      export-cot, get-track-history, get-coverage-stats, get-node-status-batch
nats_subjects_active: sentinel.detections.>, sentinel.alerts.>, sentinel.cot.events,
                      sentinel.node.heartbeat, sentinel.node.offline, sentinel.mesh.inbound.>,
                      sentinel.node.calibration-complete
mobile_apps:          Android (io.apexsentinel.mobile, SDK 34), iOS (iOS 16.0+)
dashboard:            https://dashboard.apex-sentinel.io (Vercel, lhr1 region)
```

---

## Section 8: LKGC Capture Script

```bash
#!/bin/bash
# scripts/capture-lkgc-w4.sh
# Run AFTER deploy verification and before wave-formation.sh complete W4

set -euo pipefail
SUPABASE_URL="https://bymfcnwfyxuivinuzurr.supabase.co"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"
WAVE="W4"

GIT_SHA=$(git rev-parse HEAD)
GIT_TAG=$(git describe --tags --exact-match 2>/dev/null || echo "untagged")
BUILD_ID=$(cat packages/dashboard/.next/BUILD_ID 2>/dev/null || echo "unknown")
VITEST_RESULT=$(cd packages/dashboard && npx vitest run --reporter=json 2>&1 | tail -1)
VITEST_PASSING=$(echo "$VITEST_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('numPassedTests',0))" 2>/dev/null || echo "unknown")
PLAYWRIGHT_RESULT=$(cd packages/dashboard && npx playwright test --reporter=json 2>&1 | tail -1)

LKGC_PAYLOAD=$(cat <<EOF
{
  "wave": "${WAVE}",
  "git_sha": "${GIT_SHA}",
  "git_tag": "${GIT_TAG}",
  "build_id": "${BUILD_ID}",
  "vitest_passing": ${VITEST_PASSING},
  "captured_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "notes": "W4 LKGC — C2 Dashboard deployed to dashboard.apex-sentinel.io"
}
EOF
)

curl -sX POST \
  "${SUPABASE_URL}/rest/v1/lkgc_snapshots" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "${LKGC_PAYLOAD}"

echo "LKGC W4 captured. Git SHA: ${GIT_SHA}"
```

---

## Section 9: Rollback Decision Matrix

| Symptom | Rollback Target | Command |
|---------|----------------|---------|
| Dashboard blank / 500 errors | Vercel previous deploy | `vercel promote <prev_dpl_id>` |
| Realtime subscription broken | Supabase config change | Re-enable Realtime on tracks/alerts |
| NATS.ws connection refused | NATS proxy restart (W2 infra) | W2 runbook — not W4 issue |
| Auth loop / infinite redirect | Supabase Auth URL config | Fix redirect URL in Supabase Auth settings |
| Edge Function 500 | Re-deploy previous function version | Re-deploy from W3 LKGC git SHA |
| Migration failure (partial apply) | DB rollback SQL | See DEPLOY_CHECKLIST.md §Database Rollback |
| CesiumJS blank globe | Check Ion token quota | Rotate token or switch to OSM terrain |
| TypeScript error in prod | Code fix + re-deploy | Fix → `vercel deploy --prod` |

**Critical rule: NEVER run `DROP TABLE` or `TRUNCATE` on W1-W3 tables during W4 rollback.
W4 adds tables only. Rollback removes additions, never existing data.**
