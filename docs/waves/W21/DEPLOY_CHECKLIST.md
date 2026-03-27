# W21 DEPLOY CHECKLIST — Production Operator UI

## Pre-Deployment Requirements

All items must be checked before deploying W21 to Vercel production.

---

## 1. Build Verification

Run locally before any push:

```bash
cd /Users/nico/projects/apex-sentinel-demo
npm run build
```

Expected output:
- Zero TypeScript errors
- Zero ESLint errors (if lint is in build)
- All pages compiled successfully
- No "Module not found" errors
- No "Cannot find type" errors for W21 interfaces

```bash
npx tsc --noEmit
```

Expected: exits 0 with no output.

```bash
npx vitest run --coverage
```

Expected:
- 71/71 tests pass (0 failures, 0 skipped)
- Branch coverage ≥ 80%
- Function coverage ≥ 80%
- Line coverage ≥ 80%
- Statement coverage ≥ 80%

---

## 2. Environment Variables — Vercel Dashboard

Navigate to: https://vercel.com/[your-org]/apex-sentinel-demo/settings/environment-variables

Set the following for Production environment:

| Variable | Value | Notes |
|----------|-------|-------|
| `ADSBX_API_KEY` | [ADS-B Exchange key] | Required for FR-W21-01 aircraft layer |
| `OPENWEATHER_API_KEY` | [OpenWeatherMap key] | Required for FR-W21-06 weather widget |
| `NOTAM_API_TOKEN` | [NOTAM API token] | Required for FR-W21-05 NOTAM overlay |
| `ACLED_API_KEY` | [ACLED key] | Required for FR-W21-08 security events |
| `APEX_SENTINEL_API_URL` | `http://[gateway-ip]:PORT` | apex-sentinel core HTTP service |
| `SESSION_SECRET` | [existing] | Already set — do not regenerate |
| `NEXT_PUBLIC_APP_ENV` | `production` | Disables any debug UI |
| `NEXT_PUBLIC_MAP_CENTER_LAT` | `45.9` | Romania map center |
| `NEXT_PUBLIC_MAP_CENTER_LNG` | `24.9` | Romania map center |
| `NEXT_PUBLIC_MAP_ZOOM` | `7` | Default zoom level |

Note: `NEXT_PUBLIC_*` variables are embedded in the client bundle. Only non-sensitive
values should use this prefix. API keys must NEVER use `NEXT_PUBLIC_` prefix.

---

## 3. Vercel Project Configuration

In Vercel project settings:

**Framework Preset:** Next.js (auto-detected)
**Build Command:** `npm run build`
**Output Directory:** `.next` (default)
**Install Command:** `npm install`
**Node.js Version:** 20.x

**Function Region:** `fra1` (Frankfurt) — closest to Romania
This is set in `next.config.ts`:

```typescript
export const config = {
  regions: ['fra1'],
};
```

---

## 4. Edge Function Configuration

The SSE stream route must be configured as an Edge Function in `app/api/stream/route.ts`:

```typescript
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
```

Verify in Vercel deployment logs: the stream route shows "Edge Function" type, not
"Serverless Function".

---

## 5. HTTP Headers Verification

After deployment, verify headers with:

```bash
curl -I https://apex-sentinel-demo.vercel.app/
```

Required headers:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy: default-src 'self'; ...`

If headers are missing, check `next.config.ts` headers configuration.

---

## 6. Smoke Tests — Production URL

Run after deployment. Do NOT run these against production during peak operator hours.

### API Route Smoke Tests

```bash
BASE="https://apex-sentinel-demo.vercel.app"

# All should return 200 and valid JSON
curl -s "$BASE/api/zones" | jq '.totalCount'
curl -s "$BASE/api/aircraft" | jq '.totalCount'
curl -s "$BASE/api/weather" | jq '.conditions.flyabilityScore'
curl -s "$BASE/api/health" | jq '.score'
curl -s "$BASE/api/compliance" | jq '.gdpr.retentionCompliant'
curl -s "$BASE/api/notams" | jq '.totalCount'
curl -s "$BASE/api/alerts" | jq '.totalCount'
curl -s "$BASE/api/incidents" | jq '.totalCount'
```

### SSE Stream Smoke Test

```bash
curl -N -H "Accept: text/event-stream" "$BASE/api/stream" &
SSE_PID=$!
sleep 35  # wait for at least one keepalive (sent every 30s)
kill $SSE_PID
```

Expected: at least one `event: keepalive` line appears in the output.

### Map Load Test

Open `https://apex-sentinel-demo.vercel.app` in browser.
Expected:
- Dashboard loads within 3 seconds (cold start may take up to 5s on first request)
- Map renders with Romania visible at zoom 7
- Zone circles appear with correct AWNING colours
- Alert panel shows alerts (may be empty if no active detections)
- No console errors in browser DevTools

---

## 7. WCAG Accessibility Check

In Chrome DevTools, run axe-core on the main dashboard page:

```javascript
// In browser console on https://apex-sentinel-demo.vercel.app
const script = document.createElement('script');
script.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js';
document.head.appendChild(script);
script.onload = () => {
  axe.run().then(results => {
    console.log('Violations:', results.violations.length);
    results.violations.forEach(v => console.log(v.id, v.description));
  });
};
```

Expected: 0 violations at critical/serious level.

---

## 8. No Simulation Content Check

Open the dashboard in a browser. Navigate through all 4 tabs.

Verify absence of:
- [ ] "Wave" (as a concept)
- [ ] "FDRP" anywhere
- [ ] "Shahed", "Lancet", "Orlan", "Gerbera"
- [ ] "Ukraine"
- [ ] "Simulation" or "Demo"
- [ ] Any Ukraine map coordinates (centre should be Romania ~45.9°N 24.9°E)

Search the production bundle for forbidden terms:

```bash
# In the .next/static directory after build
grep -r "shahed\|lancet\|ukraine\|fdrp\|viina" .next/static/ --include="*.js"
```

Expected: no results.

---

## 9. Performance Check

In Chrome DevTools → Network tab, reload the page with cache disabled.

| Metric | Target | Measure |
|--------|--------|---------|
| Page load (DOMContentLoaded) | < 3 seconds | Network tab |
| Map tiles loaded | < 3 seconds after page load | Network tab (filter: tile.openstreetmap.org) |
| First ZONE circles rendered | < 500ms after /api/zones response | Performance tab |
| SSE stream first event | < 2 seconds after stream connect | Network tab (stream) |

---

## 10. Rollback Plan

If the W21 deployment causes issues:

1. In Vercel Dashboard → Deployments → find the last working deployment
2. Click "..." → "Promote to Production"
3. The previous deployment is live within 30 seconds
4. No database rollback required (W21 has no migrations)

Rollback trigger conditions:
- Any API route returns 500 continuously for more than 5 minutes
- SSE stream fails to connect (operators cannot see real-time updates)
- Dashboard loads but shows no zone data for more than 5 minutes
- Any security-relevant WCAG violation reported by operators

---

## Post-Deployment Monitoring

After deployment, monitor for 24 hours:

1. **Vercel Function Logs** — check for 5xx errors on API routes
2. **Vercel Analytics** — page load times, error rates
3. **SSE reconnection rate** — high reconnection rate indicates stream instability
4. **Operator feedback** — direct channel: Telegram group [OPS-FEEDBACK]

---

*Document version: W21-DEPLOY_CHECKLIST-v1.0*
*Status: PLANNED*
