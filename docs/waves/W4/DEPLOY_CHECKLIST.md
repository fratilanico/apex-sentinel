# APEX-SENTINEL W4 — DEPLOY CHECKLIST
## W4 | PROJECTAPEX Doc 15/20 | 2026-03-24

> Wave: W4 — C2 Dashboard
> Deployment target: Vercel (Next.js), Supabase (migrations + Edge Functions)
> Domain: dashboard.apex-sentinel.io
> Region: eu-west-2 (Supabase lhr1 Vercel region)

---

## PRE-DEPLOY GATE

All items below must be checked before ANY deploy attempt.

### Code Quality Gate
```
[ ] npx vitest run --coverage — ALL passing, ≥80% branches/functions/lines/statements
[ ] npx playwright test — ALL passing (both Chromium + Firefox)
[ ] npx tsc --noEmit — 0 TypeScript errors
[ ] npm run build — 0 build errors, bundle size < 5MB initial JS
[ ] npx next lint — 0 ESLint errors
[ ] npx prettier --check . — 0 formatting errors
```

### Security Gate
```
[ ] No NEXT_PUBLIC_ prefix on secrets (CESIUM_ION_TOKEN must be server-side only)
[ ] No Supabase service_role key in client-side bundle (check with:
    grep -r "service_role" packages/dashboard/src/ — must return 0 results)
[ ] RLS enabled on all W4 tables (track_positions, dashboard_sessions)
[ ] Supabase anon key scoped to SELECT on tracks/alerts/nodes (read-only for dashboard)
[ ] Auth middleware enforced on /dashboard, /tracks, /nodes, /alerts, /analytics routes
[ ] CSP header does not include 'unsafe-eval' for non-CesiumJS scripts
[ ] CORS restricted to dashboard.apex-sentinel.io on Edge Functions
```

### W3 Dependency Check
```
[ ] W3 LKGC snapshot present in Supabase lkgc_snapshots (wave='W3')
[ ] Supabase Realtime enabled on tracks table (check: Database → Replication → tracks = ON)
[ ] Supabase Realtime enabled on alerts table (check: Database → Replication → alerts = ON)
[ ] NATS.ws proxy operational: wscat -c wss://nats.apex-sentinel.io:443
    Expected: connected, no TLS error
[ ] sentinel.alerts.> subject receiving messages: subscribe and verify within 5 min
[ ] TDoA correlator writing to tracks table: confirm last_updated_at < 60s for active tracks
```

---

## PHASE 1: SUPABASE MIGRATIONS

### 1.1 Migration Execution Order
```bash
# Run from project root — Supabase CLI required (supabase >= 1.170)
supabase db push --db-url postgresql://postgres.bymfcnwfyxuivinuzurr:[PASSWORD]@aws-0-eu-west-2.pooler.supabase.com:6543/postgres

# Expected output:
# Applying migration 0019_track_positions.sql ... OK
# Applying migration 0020_dashboard_sessions.sql ... OK
# Applying migration 0021_w4_views.sql ... OK
```

### 1.2 Migration Verification
```sql
-- Verify track_positions table
SELECT count(*) FROM information_schema.tables
WHERE table_name = 'track_positions';
-- Expected: 1

-- Verify dashboard_sessions table
SELECT count(*) FROM information_schema.tables
WHERE table_name = 'dashboard_sessions';
-- Expected: 1

-- Verify materialized views
SELECT matviewname FROM pg_matviews
WHERE matviewname IN ('mv_coverage_stats', 'mv_threat_breakdown_24hr');
-- Expected: 2 rows

-- Verify v_active_tracks view
SELECT count(*) FROM v_active_tracks;
-- Should return 0 or active track count (no error)

-- Verify pg_cron job registered
SELECT jobname, schedule FROM cron.job
WHERE jobname LIKE '%mv_coverage%';
-- Expected: 1 row, schedule = '* * * * *' (every minute)
```

### 1.3 RLS Verification
```sql
-- Verify RLS enabled on W4 tables
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('track_positions', 'dashboard_sessions');
-- Both must have rowsecurity = true

-- Test RLS as anon role (should return rows only for public tracks)
SET role anon;
SELECT count(*) FROM track_positions LIMIT 1;
-- Expected: 0 (anon has no SELECT on track_positions)
RESET role;

-- Test RLS as authenticated role (should return rows)
-- (Run via Supabase Dashboard → SQL Editor with authenticated session)
```

---

## PHASE 2: SUPABASE EDGE FUNCTIONS DEPLOY

### 2.1 Deploy All W4 Edge Functions
```bash
# Deploy each function
supabase functions deploy export-cot --project-ref bymfcnwfyxuivinuzurr
supabase functions deploy get-track-history --project-ref bymfcnwfyxuivinuzurr
supabase functions deploy get-coverage-stats --project-ref bymfcnwfyxuivinuzurr
supabase functions deploy get-node-status-batch --project-ref bymfcnwfyxuivinuzurr
```

### 2.2 Edge Function Environment Variables
```bash
# Set secrets (once, not per deploy)
supabase secrets set --project-ref bymfcnwfyxuivinuzurr \
  SUPABASE_SERVICE_ROLE_KEY="<service_role_key>" \
  NATS_WS_URL="wss://nats.apex-sentinel.io:443" \
  NATS_CREDS_BASE64="<base64 encoded NATS operator creds>" \
  EXPORT_RATE_LIMIT_RPM="10"
```

### 2.3 Edge Function Health Checks
```bash
BASE="https://bymfcnwfyxuivinuzurr.supabase.co/functions/v1"
TOKEN="<valid JWT for authenticated user>"

# get-coverage-stats
curl -sH "Authorization: Bearer $TOKEN" "$BASE/get-coverage-stats"
# Expected: {"total_nodes":N,"online_nodes":N,"coverage_percent":N,...}

# get-node-status-batch
curl -sH "Authorization: Bearer $TOKEN" "$BASE/get-node-status-batch"
# Expected: {"nodes":[...]}

# get-track-history (requires active track)
curl -sH "Authorization: Bearer $TOKEN" "$BASE/get-track-history?track_id=TEST&limit=10"
# Expected: {"positions":[]} or array with entries

# export-cot (GET single track)
curl -sH "Authorization: Bearer $TOKEN" "$BASE/export-cot?track_id=TEST" -o test.cot
# Expected: valid CoT XML file downloaded
```

---

## PHASE 3: SUPABASE AUTH CONFIGURATION

### 3.1 Auth Providers
```
[ ] Email provider enabled (Settings → Authentication → Providers → Email → ON)
[ ] Confirm email: ON (new users must verify email)
[ ] Magic link: ON (Settings → Authentication → Providers → Email → Enable Magic Link)
[ ] Minimum password length: 12 characters
[ ] Disable signup: ON (only admin can invite users — no public registration)
    URL: Dashboard → Authentication → Settings → Disable Signup = true
```

### 3.2 Redirect URLs
```
Allowed redirect URLs (Settings → Authentication → URL Configuration):
  https://dashboard.apex-sentinel.io/auth/callback
  http://localhost:3000/auth/callback  (dev only — remove for production)

Site URL: https://dashboard.apex-sentinel.io
```

### 3.3 User Roles Setup
```sql
-- Create initial admin user (run in Supabase SQL Editor as service_role)
-- User must already exist in auth.users (created via magic link invite)

-- Insert role claim into user metadata
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'),
  '{role}',
  '"admin"'
)
WHERE email = 'admin@apex-sentinel.io';

-- Verify role claim
SELECT email, raw_user_meta_data->>'role' as role
FROM auth.users
WHERE email = 'admin@apex-sentinel.io';
```

### 3.4 Verify Role-Based Access
```
[ ] Login as operator role → /dashboard accessible → /nodes accessible → /analytics BLOCKED
[ ] Login as analyst role → all read pages accessible → export-cot accessible
[ ] Login as admin role → all pages accessible → user management accessible
[ ] Unauthenticated GET /dashboard → redirects to /login
[ ] JWT with invalid role → 403 from Edge Functions
```

---

## PHASE 4: VERCEL DEPLOYMENT

### 4.1 Project Setup (First Deploy Only)
```bash
# Install Vercel CLI
npm i -g vercel@latest

# Link project
cd packages/dashboard
vercel link
# Project name: apex-sentinel-dashboard
# Framework: Next.js
# Root directory: packages/dashboard

# Set custom domain
vercel domains add dashboard.apex-sentinel.io
```

### 4.2 Environment Variables (Vercel Dashboard or CLI)
```bash
# Production environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL production
# Value: https://bymfcnwfyxuivinuzurr.supabase.co

vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# Value: <anon key from Supabase Dashboard → Settings → API>

vercel env add CESIUM_ION_TOKEN production
# Value: <Cesium Ion token — SERVER SIDE ONLY, no NEXT_PUBLIC_ prefix>
# Access in Next.js: via API route or Server Component only

vercel env add NEXT_PUBLIC_NATS_WS_URL production
# Value: wss://nats.apex-sentinel.io:443

vercel env add NEXT_PUBLIC_MAPBOX_TOKEN production
# Value: <Mapbox public token — safe to expose>

vercel env add SENTRY_DSN production
# Value: <Sentry DSN for @sentry/nextjs>

vercel env add SENTRY_AUTH_TOKEN production
# Value: <Sentry auth token for source map upload>
# Mark as sensitive (encrypted)

vercel env add SUPABASE_SERVICE_ROLE_KEY production
# Value: <service role key>
# Mark as sensitive — used only in Next.js server components + middleware
```

### 4.3 vercel.json Configuration
```json
{
  "framework": "nextjs",
  "buildCommand": "cd packages/dashboard && npm run build",
  "outputDirectory": "packages/dashboard/.next",
  "installCommand": "npm install",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://cesium.com; worker-src blob:; connect-src 'self' wss://bymfcnwfyxuivinuzurr.supabase.co wss://nats.apex-sentinel.io:443 https://*.cesium.com https://events.mapbox.com; img-src 'self' data: blob: https://*.cesium.com https://api.mapbox.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-ancestors 'none'"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=31536000; includeSubDomains; preload"
        }
      ]
    }
  ]
}
```

### 4.4 Deploy
```bash
# Production deploy
vercel deploy --prod

# Expected output:
# Deploying packages/dashboard to Vercel...
# Build completed. [duration]
# Production: https://dashboard.apex-sentinel.io [SHA]
# Inspect: https://vercel.com/apex-sentinel/apex-sentinel-dashboard/[deployId]
```

### 4.5 DNS Configuration
```
Type:   CNAME
Name:   dashboard
Value:  cname.vercel-dns.com
TTL:    300

Verify: dig dashboard.apex-sentinel.io CNAME
Expected: cname.vercel-dns.com
```

---

## PHASE 5: CORS CONFIGURATION

### 5.1 Supabase Edge Functions CORS
```typescript
// All W4 Edge Functions must include these headers on OPTIONS + main response:
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://dashboard.apex-sentinel.io',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Max-Age': '86400',
};
// Dev: also allow http://localhost:3000 (controlled by ALLOWED_ORIGINS env var)
```

### 5.2 NATS.ws Proxy CORS
```nginx
# nginx config for NATS.ws proxy at nats.apex-sentinel.io
# WebSocket upgrade — CORS handled at TCP level (no CORS for WS)
# Restrict by Supabase Auth JWT validation at nginx level:
#   ngx_http_auth_jwt_module or upstream NATS auth via NKey
```

---

## PHASE 6: POST-DEPLOY VERIFICATION

### 6.1 Smoke Tests (Manual — 15 minutes)
```
[ ] Navigate to https://dashboard.apex-sentinel.io → redirects to /login
[ ] Login with magic link → email received within 60s, callback works, session created
[ ] /dashboard loads without JS console errors
[ ] CesiumJS globe renders (3D terrain visible, no WebGL errors in console)
[ ] Open browser DevTools → Network → filter WS → verify:
    wss://bymfcnwfyxuivinuzurr.supabase.co/realtime/v1 — OPEN (Realtime)
    wss://nats.apex-sentinel.io:443 — OPEN (NATS.ws)
[ ] Wait 30s → verify track marker appears on globe if active tracks exist
[ ] Press T → track table panel opens
[ ] Press N → node health panel opens
[ ] Press A → alert panel opens
[ ] Press ESC → active panel closes
[ ] Press F → fullscreen mode activates
[ ] Press S → stats panel opens
[ ] Press / → keyboard shortcut help modal opens
[ ] Navigate to /analytics → OpenMCT timeline loads (no React error boundary)
[ ] Navigate to /tracks → TrackTable renders, sort by confidence works
[ ] Navigate to /nodes → NodeHealthPanel renders, node list visible
[ ] Logout → session cleared, redirect to /login
```

### 6.2 Realtime Subscription Verification
```bash
# From a NATS CLI client, publish a test detection event:
nats pub sentinel.detections.node-001 \
  '{"nodeId":"node-001","threatClass":"quadcopter","confidence":0.85,"lat":51.5,"lon":-0.12,"alt_m":50}'

# Verify in dashboard: track should appear on globe within 3s of TDoA correlation writing to tracks table
# (TDoA correlation runs on W2 backend, not in dashboard — dashboard only reads tracks table)
```

### 6.3 Load Test
```bash
# Install k6
brew install k6

# Run load test (10 concurrent operators for 2 minutes)
k6 run --vus 10 --duration 2m scripts/load-test-dashboard.js

# Pass criteria:
#   p95 response time < 500ms for static assets
#   Supabase Realtime: all 10 connections maintained (no drops)
#   No 5xx errors
#   Vercel function invocations (Edge Functions) < 100ms p95
```

### 6.4 Lighthouse Audit
```bash
# Run from Playwright (authenticated session)
npx playwright test e2e/lighthouse.spec.ts

# Pass criteria (FR-W4 acceptance):
#   Performance:    ≥ 90
#   Accessibility:  ≥ 95
#   Best Practices: ≥ 90
#   SEO:            ≥ 80 (dashboard not indexed, but still measure)

# CesiumJS note: WebGL canvas does not contribute to Lighthouse paint metrics
# The performance score measures initial shell load + time to interactive
# CesiumJS loads asynchronously after LCP — does not block score
```

---

## ROLLBACK PROCEDURE

### Instant Rollback (< 30 seconds)
```bash
# List recent Vercel deployments
vercel ls apex-sentinel-dashboard --limit 10

# Promote previous deployment to production
vercel promote [PREVIOUS_DEPLOY_SHA] --scope apex-sentinel

# Verify rollback
curl -sI https://dashboard.apex-sentinel.io | grep x-vercel-deployment-url
```

### Database Rollback (if migration issues)
```sql
-- W4 migrations are additive (new tables/views only). No data destruction.
-- Rollback by dropping W4 additions:

DROP VIEW IF EXISTS v_active_tracks;
DROP MATERIALIZED VIEW IF EXISTS mv_threat_breakdown_24hr;
DROP MATERIALIZED VIEW IF EXISTS mv_coverage_stats;
DROP TABLE IF EXISTS dashboard_sessions;
DROP TABLE IF EXISTS track_positions;

-- Record in Supabase migration table manually:
DELETE FROM supabase_migrations WHERE name IN (
  '0019_track_positions',
  '0020_dashboard_sessions',
  '0021_w4_views'
);
```

### Edge Function Rollback
```bash
# Supabase does not support version rollback on Edge Functions.
# Rollback by re-deploying previous version from git tag:
git checkout v3.0.0-w3-lkgc
# (W3 LKGC had no W4 edge functions — deploying W4 functions is additive)
# Simply do not deploy W4 edge functions if rollback needed.
```

---

## POST-DEPLOY SIGN-OFF

```
Deployed by:          ___________________
Deployment SHA:       ___________________
Vercel deploy URL:    ___________________
Migration applied:    0019, 0020, 0021
Edge Functions:       export-cot, get-track-history, get-coverage-stats, get-node-status-batch
Lighthouse score:     Performance ___ / Accessibility ___ / Best Practices ___
Realtime verified:    [ ] YES
NATS.ws verified:     [ ] YES
Load test passed:     [ ] YES
LKGC captured:        [ ] YES (supabase lkgc_snapshots.wave = 'W4')
W4 COMPLETE tag:      git tag v4.0.0-w4-lkgc && git push origin v4.0.0-w4-lkgc
```
