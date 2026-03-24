# APEX-SENTINEL W4 — RISK REGISTER
## W4 | PROJECTAPEX Doc 20/20 | 2026-03-24

> Wave: W4 — C2 Dashboard
> Risk owner: Nicolae Fratila (Nico)
> Review cycle: at each wave phase gate (init/plan/tdd-red/execute/checkpoint/complete)

---

## Risk Scoring

```
Probability:  1=Very Low  2=Low  3=Medium  4=High  5=Very High
Impact:       1=Negligible  2=Minor  3=Moderate  4=Major  5=Critical
Risk Score:   Probability × Impact
  1–4:  LOW    (monitor, no action required)
  5–9:  MEDIUM (mitigation plan required before execute phase)
  10–15: HIGH  (mitigation must be in place before TDD RED)
  16–25: CRITICAL (wave blocker — resolve before proceeding)
```

---

## RISK-W4-01: CesiumJS WebGL Performance on Integrated GPU

**Probability:** 3 (Medium)
**Impact:** 4 (Major)
**Score:** 12 — HIGH
**Category:** Performance
**Status:** OPEN — mitigation planned

### Description
CesiumJS renders a full 3D globe with WebGL 2.0. On machines with integrated graphics
(Intel Iris Xe, AMD Vega integrated), performance degrades significantly with:
- High-resolution terrain (many vertices)
- Many simultaneous track entities (>100)
- Atmospheric scattering and globe post-processing effects

If C2 operators use laptops with integrated GPUs (common in field deployments), the
dashboard may render at <10 FPS, making real-time situational awareness impractical.

### Mitigation Plan
```
1. Disable CesiumJS post-processing effects by default:
   viewer.scene.postProcessStages.fxaa.enabled = false;
   viewer.scene.globe.showGroundAtmosphere = false;
   viewer.scene.skyAtmosphere.show = false;
   viewer.scene.skyBox.show = false;

2. Use simplified terrain (no requestVertexNormals, no requestWaterMask):
   Cesium.createWorldTerrainAsync({ requestWaterMask: false, requestVertexNormals: false })

3. Entity LOD: beyond 200km camera distance, replace billboard with simpler point entity
   (Cesium.PointGraphics instead of BillboardGraphics).

4. Performance mode toggle: UIStore.performanceMode (boolean). In performance mode:
   - Terrain off (flat WGS84 ellipsoid surface)
   - Max track entities displayed: 50 (oldest dropped from view, still in TrackStore)
   - No animation/interpolation on entity position updates

5. 2D fallback: if CesiumJS renders < 15 FPS for 10 consecutive frames, auto-switch
   to Mapbox GL 2D mode (UIStore.setGlobeMode('2d')). Banner shown:
   "Switched to 2D mode due to performance. Click to re-enable 3D."

6. WebGL detection: check WebGLRenderingContext before loading CesiumJS bundle.
   If WebGL unavailable: show 2D Mapbox GL immediately, never attempt CesiumJS load.
```

### Residual Risk
```
After mitigation: Probability 2, Impact 3, Score 6 — MEDIUM (acceptable).
The 2D fallback ensures the dashboard remains usable on all hardware.
Performance mode is opt-in for operators who want max framerate.
```

---

## RISK-W4-02: Supabase Realtime Connection Drop During High Event Rate

**Probability:** 3 (Medium)
**Impact:** 4 (Major)
**Score:** 12 — HIGH
**Category:** Reliability / Data Integrity
**Status:** OPEN — mitigation planned

### Description
Supabase Realtime uses a WebSocket connection per client. At high event rates (>50 track
updates/second, e.g., mass detection scenario), the Realtime WebSocket may experience:
- Message queue overflow (Supabase Realtime has internal buffer limits)
- WebSocket backpressure causing connection drop
- Silent message loss (Supabase does not guarantee delivery on connection drop)

During a connection drop, operators lose real-time awareness of track movement for
the duration of the outage + reconnection time.

### Mitigation Plan
```
1. On connection drop (realtimeStatus → 'error' or 'disconnected'):
   - Show prominent banner: "REALTIME DISCONNECTED — Track data may be stale"
   - Automatically trigger a REST API full-refresh of tracks:
     GET /rest/v1/tracks?status=in.(active,confirmed)&select=*
     → upsert all returned tracks into TrackStore
   - This ensures no missed tracks while reconnecting.

2. Auto-reconnect: Supabase JS client handles reconnect. After reconnect, subscribe()
   callback fires with status 'SUBSCRIBED'. At this point, trigger another full-refresh
   to catch any events missed during the gap.

3. Rate limit awareness: if the deployment expects >50 tracks/second,
   evaluate switching from postgres_changes to Supabase Broadcast (lower overhead)
   or WebSocket pub/sub directly from W2 NATS ingest-event edge function.

4. Realtime status badge must be clearly visible to operator at all times
   (fixed position in dashboard header, not collapsible).

5. Track age indicator: add "last updated X seconds ago" to each track row in TrackTable.
   If a track hasn't updated in >30s, show a "stale" badge. Operator awareness of
   data staleness even without full disconnection.
```

### Residual Risk
```
After mitigation: Probability 2, Impact 2, Score 4 — LOW.
Full-refresh on reconnect ensures no permanent data loss.
```

---

## RISK-W4-03: NATS.ws Proxy Becoming a Bottleneck

**Probability:** 2 (Low)
**Impact:** 3 (Moderate)
**Score:** 6 — MEDIUM
**Category:** Performance / Scalability
**Status:** OPEN — monitor

### Description
The NATS.ws proxy (nginx reverse proxy forwarding WebSocket → NATS TCP 4222) is a
single nginx instance on the APEX-SENTINEL backend VM. With 10+ concurrent dashboard
operators, each maintaining a NATS.ws subscription, the proxy handles:
- 10+ WebSocket connections
- 10× the message throughput (each alert is sent to each connected subscriber)

At high alert rates (>10 alerts/second, e.g., mass detection event), the proxy may
become CPU-bound on message forwarding.

### Mitigation Plan
```
1. NATS.ws proxy is stateless — scale horizontally behind a load balancer if needed.
   HAProxy or Nginx Plus can distribute WebSocket connections across 2+ proxy instances.

2. Short-term: monitor nginx CPU usage during load test (Phase 5, Day 29-32).
   If CPU >70% at 10 concurrent operators: add second proxy instance.

3. Browser-side: AlertStore.addAlert caps at 500 alerts with FIFO eviction.
   NATS.ws subscription does not apply backpressure to the server — messages are
   received and queued in Node.js event loop. Cap ensures browser memory stable.

4. Consider NATS per-subject rate limiting (NATS JetStream consumer max_deliver_rate)
   for sentinel.alerts.> to prevent message flood reaching dashboard clients.
```

### Residual Risk
```
After mitigation: Probability 1, Impact 2, Score 2 — LOW.
Single nginx proxy handles >1000 WebSocket connections in production benchmarks.
APEX-SENTINEL is unlikely to exceed 50 concurrent operators in W4.
```

---

## RISK-W4-04: OpenMCT Plugin API Breaking Change

**Probability:** 2 (Low)
**Impact:** 3 (Moderate)
**Score:** 6 — MEDIUM
**Category:** Technical Debt / Vendor Risk
**Status:** OPEN — mitigated by version pin

### Description
OpenMCT 2.0 plugin API is not covered by stable semver guarantees. NASA's OpenMCT
releases have introduced breaking changes between minor versions (1.x → 2.x was a
complete API rewrite). If OpenMCT releases a new major version during W4 development
or in W5, the apexSentinelPlugin.ts will stop working.

### Mitigation Plan
```
1. Pin OpenMCT to exact version "2.0.4" in package.json (no caret, no tilde).
   `"openmct": "2.0.4"`

2. Write custom openmct.d.ts TypeScript declarations for all used API surfaces.
   Any OpenMCT upgrade attempt will fail TypeScript compilation if API changed —
   giving early warning of breaking changes before runtime.

3. OpenMCT plugin is isolated in src/lib/openmct/apexSentinelPlugin.ts.
   The rest of the dashboard does not import OpenMCT directly.
   If OpenMCT is replaced, only this file and the /analytics page need updating.

4. Document the subset of OpenMCT API used:
   - openmct.install(plugin)
   - openmct.objects.addRoot
   - openmct.objects.addProvider
   - openmct.telemetry.addProvider
   - openmct.time.addTimeSystem
   - openmct.time.addClock
```

### Residual Risk
```
After mitigation: Probability 1, Impact 2, Score 2 — LOW.
Version pin eliminates upgrade-induced breakage.
```

---

## RISK-W4-05: Cesium Ion Token Rate Limits

**Probability:** 4 (High)
**Impact:** 2 (Minor)
**Score:** 8 — MEDIUM
**Category:** Cost / Service Availability
**Status:** OPEN — mitigation planned

### Description
Cesium Ion free tier: 100,000 tile requests per month. Each operator session viewing the globe
with terrain enabled consumes ~500-1000 tile requests per session. With 10 operators using
the dashboard daily (2hr sessions), free tier exhausts in ~10-20 days.

When rate limit is hit, CesiumJS falls back to black tiles (no terrain/imagery) but does
NOT throw a visible error to the operator. Tracks remain visible but terrain context is lost.

### Mitigation Plan
```
1. Default to open-source terrain (no Ion token required):
   viewer.terrainProvider = await Cesium.CesiumTerrainProvider.fromUrl(
     'https://assets.agi.com/stk-terrain/world'  // Cesium AGI terrain (open)
   );
   OR: use flat WGS84 ellipsoid as default and offer terrain as optional setting.

2. For imagery: default to OpenStreetMap tile layer (no token):
   viewer.imageryLayers.addImageryProvider(
     new Cesium.OpenStreetMapImageryProvider({
       url: 'https://tile.openstreetmap.org/'
     })
   );
   OSM is free but requires attribution in UI.

3. Ion token is OPTIONAL, loaded via CESIUM_ION_TOKEN env var.
   If env var absent: Ion features silently disabled, open-source alternatives used.
   If env var present: Ion terrain + Bing imagery used (commercial deployment).

4. Monitor Ion usage via Cesium Ion dashboard. Alert (PagerDuty or Slack webhook)
   when monthly usage exceeds 80,000 requests.
```

### Residual Risk
```
After mitigation: Probability 2, Impact 1, Score 2 — LOW.
Open-source terrain fallback ensures no functional degradation on free tier exhaustion.
```

---

## RISK-W4-06: Auth Bypass via Direct Supabase Anon Key Exposure

**Probability:** 2 (Low)
**Impact:** 5 (Critical)
**Score:** 10 — HIGH
**Category:** Security
**Status:** OPEN — requires explicit mitigation before execute phase

### Description
The Supabase anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY) is publicly visible in the browser
(NEXT_PUBLIC_ prefix means it's embedded in the client-side JS bundle). If RLS is
misconfigured on any sensitive table, a malicious actor with the anon key could:
- Read all tracks, alerts, and node positions without authentication
- Subscribe to Realtime channels without authentication

### Mitigation Plan
```
1. RLS MUST be enabled on all tables. Verify before deploy (DEPLOY_CHECKLIST.md Phase 1.3).
   The anon role must have NO SELECT on sensitive tables unless explicitly required.

2. Tracks table RLS policy:
   CREATE POLICY "authenticated read tracks"
   ON tracks FOR SELECT
   USING (auth.role() = 'authenticated');
   -- Anon role: no access

3. Alerts table RLS policy: same as tracks.

4. Nodes table RLS policy: same (node positions are sensitive — reveals deployment geography).

5. track_positions table RLS: authenticated only (same as tracks).

6. dashboard_sessions table RLS: authenticated, user can only read own rows.

7. Edge Functions use service_role key internally (server-side only).
   Anon key is for Supabase Auth client only (signInWithOtp, session management).
   Anon key has NO data access beyond auth.users own row.

8. Supabase Auth → MFA: consider requiring TOTP for admin role (W5 enhancement).

9. CSP header restricts connect-src to known Supabase + NATS endpoints only.
   This prevents exfiltration via XSS even if anon key is in DOM.

10. Security audit: run `supabase db lint --level error` before each deploy to detect
    RLS policy gaps.
```

### Residual Risk
```
After mitigation: Probability 1, Impact 3, Score 3 — LOW.
RLS prevents data access without valid JWT. Anon key exposure is acceptable if RLS is correct.
```

---

## RISK-W4-07: CoT Export PII / Operational Security Leakage

**Probability:** 3 (Medium)
**Impact:** 4 (Major)
**Score:** 12 — HIGH
**Category:** Security / Privacy
**Status:** OPEN — mitigation required

### Description
CoT export files contain:
- GPS coordinates of detected threats (lat/lon/alt — may reveal sensitive operations)
- Node contributing list (reveals sensor deployment positions)
- Track IDs and timestamps (operational patterns)

If a CoT file is exported and shared insecurely (email, unencrypted transfer), operational
security is compromised. Exported files may also contain PII if operator adds callsign data.

### Mitigation Plan
```
1. Export rate limiting: 10 exports/minute per user (enforced by Edge Function).
   Bulk export: max 4-hour window. This limits data exfiltration volume.

2. Role restriction: export-cot Edge Function requires analyst or admin role.
   Operator role cannot export. This reduces attack surface to trusted users only.

3. Audit log: every export request is logged to dashboard_sessions with:
   action: 'cot_export', track_id (or time range), export_size_bytes.
   Admin can review export audit log.

4. Export filename: {track_id}.cot — does not include node positions.
   Node positions are NOT included in CoT export (only track lat/lon/alt).
   Contributing node IDs are included but NOT their GPS positions.

5. CoT XML does not include: operator email, user_id, session ID, or IP address.
   Only threat track data is in the export.

6. Warn in export UI: "CoT files contain sensitive location data. Handle as OFFICIAL SENSITIVE."
   (Classification marking — non-binding but creates awareness.)
```

### Residual Risk
```
After mitigation: Probability 2, Impact 3, Score 6 — MEDIUM.
Full elimination of export risk requires additional DRM/watermarking (out of scope for W4).
```

---

## RISK-W4-08: Dashboard Accessible from Public Internet

**Probability:** 4 (High)
**Impact:** 5 (Critical)
**Score:** 20 — CRITICAL
**Category:** Security / Attack Surface
**Status:** OPEN — MUST RESOLVE before deploy

### Description
dashboard.apex-sentinel.io will be publicly accessible on the internet (Vercel hosting).
The auth wall (Supabase Auth) is the only protection. If auth is bypassed (zero-day in
Supabase Auth, brute-forced magic link, or JWT forgery), all operational data is exposed.

### Mitigation Plan
```
1. Supabase Auth magic link: OTP token expires in 1 hour. Single-use.
   Cannot be brute-forced (rate-limited by Supabase Auth service).

2. IP allowlist (Vercel): restrict dashboard access to known operator IP ranges.
   Vercel Pro supports IP allow/deny via middleware:
   In middleware.ts, before Supabase auth check:
     const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
     const ALLOWED_CIDRS = process.env.ALLOWED_IP_CIDRS?.split(',') ?? [];
     if (ALLOWED_CIDRS.length > 0 && !isIpInCidr(ip, ALLOWED_CIDRS)) {
       return new NextResponse('Forbidden', { status: 403 });
     }
   ALLOWED_IP_CIDRS env var: comma-separated CIDR list (e.g., "82.0.0.0/8,10.0.0.0/8").

3. Vercel password protection (Vercel Pro): add site-level password as a second factor.
   Separate from Supabase Auth — provides additional layer.

4. Consider: Cloudflare Access (Zero Trust) in front of Vercel as WAF + identity proxy.
   This adds MFA via Cloudflare Access before the Next.js app is even loaded.
   Cost: Cloudflare Access free for 50 users.

5. HTTPS only: Vercel enforces HTTPS. HTTP is redirected. HSTS header configured.

6. Disable signup: Supabase Auth → Settings → Disable Signup = true.
   Only admin can invite users. No self-registration.

7. Penetration test: before W4 COMPLETE, run OWASP ZAP scan against dashboard.
   Fix any HIGH or CRITICAL findings before tagging LKGC.
```

### Residual Risk
```
After mitigation: Probability 2, Impact 4, Score 8 — MEDIUM.
IP allowlist + Cloudflare Access reduces exposure significantly.
Full elimination requires airgapped deployment (out of scope for W4).
```

---

## RISK-W4-09: Large Track History Causing Slow Initial Load (>10k Tracks)

**Probability:** 2 (Low)
**Impact:** 3 (Moderate)
**Score:** 6 — MEDIUM
**Category:** Performance
**Status:** OPEN — mitigation at design level

### Description
If tracks table accumulates >10,000 active/confirmed tracks (large-scale deployment or
extended operation without cleanup), the initial dashboard load via Supabase Realtime
snapshot may be slow. Supabase sends current table state on subscribe if using
postgres_changes — large initial payload causes JS parse delay and CesiumJS entity
creation delay.

### Mitigation Plan
```
1. Realtime subscription only carries differential updates (INSERT/UPDATE/DELETE).
   Initial track load is SEPARATE: on dashboard mount, load tracks via REST:
   GET /rest/v1/tracks?status=in.(active,confirmed)&select=*&limit=500&order=last_updated_at.desc

   500 track cap on initial load. Tracks older than 1 hour are excluded:
   &filter=last_updated_at.gt.{now-1hr}

2. v_active_tracks view limits displayed tracks to status=in.(active,confirmed) —
   no history, no dropped tracks. This caps Realtime subscription load.

3. Pagination in TrackTable: maximum 500 rows in memory (TrackStore).
   Old tracks evicted by age (if track.last_updated_at > 30min, evict from store).
   This is a display cap — tracks are not deleted from Supabase.

4. CesiumJS entity management: only render tracks visible within current camera viewport
   (CesiumJS OCCLUSION_CULLING). Entities outside viewport are not rendered.
   Reduces GPU load even if 500 entities are in the viewer.
```

### Residual Risk
```
After mitigation: Probability 1, Impact 2, Score 2 — LOW.
500-track cap ensures predictable initial load time regardless of DB size.
```

---

## RISK-W4-10: Playwright Tests Flaky Due to WebGL

**Probability:** 4 (High)
**Impact:** 3 (Moderate)
**Score:** 12 — HIGH
**Category:** Test Reliability
**Status:** OPEN — mitigation required before TDD RED

### Description
Playwright's default headless Chromium does not support hardware-accelerated WebGL.
CesiumJS requires WebGL to initialize. In CI (GitHub Actions ubuntu-latest), there is no
GPU. Tests that assert on CesiumJS globe rendering will fail or timeout.

### Mitigation Plan
```
1. CesiumJS tests use MOCKED CesiumJS in Vitest (see __tests__/components/CesiumGlobe.test.tsx).
   Vitest never loads the real CesiumJS — fully mocked. Zero WebGL dependency in unit tests.

2. Playwright E2E tests verify:
   - Globe container element mounts (data-testid="cesium-globe-container" visible) ✓
   - No console errors on page load ✓
   - Keyboard shortcuts work ✓
   - Track table, alert panel, stats panel behavior ✓
   - Auth flows ✓
   Playwright tests do NOT assert on: CesiumJS 3D rendering, terrain appearance,
   entity colors, camera position. These are visual — covered by manual QA.

3. CI Playwright config:
   playwright.config.ts:
     use: {
       launchOptions: {
         args: ['--disable-gpu', '--disable-dev-shm-usage'],
         // WebGL: software rasterizer (SwiftShader) — sufficient for DOM tests
       }
     }

4. CesiumViewerInner.tsx wraps the actual Cesium.Viewer init in:
   if (typeof window === 'undefined') return;
   This prevents SSR crashes. In test environments where WebGL is unavailable,
   the viewer init failure is caught and UIStore.setGlobeMode('2d') is called.

5. Add @playwright/test webgl fixture that injects a mock Cesium.Viewer if WebGL
   unavailable. Allows E2E tests for entity management logic even without GPU.
```

### Residual Risk
```
After mitigation: Probability 2, Impact 2, Score 4 — LOW.
E2E tests are scoped to non-WebGL behaviors. Manual testing verifies 3D rendering.
```

---

## RISK-W4-11: Vercel Function Timeout on Bulk CoT Export

**Probability:** 3 (Medium)
**Impact:** 2 (Minor)
**Score:** 6 — MEDIUM
**Category:** Performance / Service Limits
**Status:** OPEN — mitigation at design level

### Description
Supabase Edge Functions (Deno) run with a default 2-second wall-time limit on the free plan
and up to 150 seconds on Pro. For bulk CoT exports spanning >1000 tracks, JSZip compression
of many XML files may exceed the timeout on lower plan tiers.

Note: This is a Supabase Edge Function, not a Vercel function. The risk title is slightly
misleading — the constraint is on Supabase, not Vercel.

### Mitigation Plan
```
1. Hard cap: export-cot Edge Function limits results to min(track_count, 1000) entries.
   For >1000 tracks: export is chunked — first 1000 only, with HTTP header
   X-Apex-Export-Truncated: true and X-Apex-Export-Total-Count: {N}.
   Dashboard shows warning: "Export truncated to 1000 tracks. Narrow time range for complete export."

2. JSZip compression level: set to level 1 (fastest) for exports >100 tracks.
   Level 6 (default) is used for ≤100 tracks. Reduces zip generation time.

3. Streaming zip: for future W5 enhancement, use ReadableStream to stream zip bytes
   to response as generated, rather than buffering in memory. Avoids timeout entirely.

4. Max export range: 4 hours (EXPORT_MAX_HOURS). Reduces maximum possible track count.
   4hr × 50 tracks/min = 12,000 tracks max. After 1000-track cap: practical max
   for one export call is first 1000 chronologically.

5. Upgrade Supabase plan if timeout issues emerge in production.
   Pro plan: 150s function timeout. Sufficient for any expected export volume.
```

### Residual Risk
```
After mitigation: Probability 1, Impact 2, Score 2 — LOW.
1000-track cap and 4hr range limit keep export time well within any plan tier.
```

---

## RISK-W4-12: Keyboard Shortcut Conflicts with Browser Shortcuts

**Probability:** 3 (Medium)
**Impact:** 1 (Negligible)
**Score:** 3 — LOW
**Category:** UX
**Status:** OPEN — monitor

### Description
Some keyboard shortcuts may conflict with browser defaults:
- F → browser does not have a default shortcut for F alone (safe)
- T → browser "open new tab" is Ctrl+T, not T alone (safe)
- / → browser Quick Find (Firefox, Safari), browser address bar focus (some browsers)
- ESC → browser stops page load, closes find bar

### Mitigation Plan
```
1. e.preventDefault() called for /, F, and ESC to prevent browser handling when
   the dashboard has focus and shortcut is triggered.

2. ESC: preventDefault() only when activePanel is non-null (i.e., a panel is open).
   When no panel open, ESC is not intercepted (allows normal browser ESC behavior).

3. / shortcut: e.preventDefault() always when not in input focus.
   Firefox Quick Find is prevented. Acceptable trade-off — users learn dashboard shortcuts.

4. Shortcut help modal (/) documents all shortcuts and includes browser compatibility notes.

5. T, N, A, S: no browser defaults for single-key shortcuts without modifier.
   No conflicts expected. Safe to use without preventDefault.
```

### Residual Risk
```
After mitigation: Probability 1, Impact 1, Score 1 — LOW.
Single-key shortcuts are safe outside input fields. Manual test confirms no browser conflict.
```

---

## Risk Summary Table

| Risk | Title | Prob | Impact | Score | Level | Status |
|------|-------|------|--------|-------|-------|--------|
| RISK-W4-01 | CesiumJS WebGL Performance | 3 | 4 | 12 | HIGH | Open |
| RISK-W4-02 | Realtime Connection Drop | 3 | 4 | 12 | HIGH | Open |
| RISK-W4-03 | NATS.ws Proxy Bottleneck | 2 | 3 | 6 | MEDIUM | Open |
| RISK-W4-04 | OpenMCT API Breaking Change | 2 | 3 | 6 | MEDIUM | Mitigated (pin) |
| RISK-W4-05 | Cesium Ion Rate Limits | 4 | 2 | 8 | MEDIUM | Open |
| RISK-W4-06 | Anon Key Exposure | 2 | 5 | 10 | HIGH | Open |
| RISK-W4-07 | CoT Export OPSEC Leakage | 3 | 4 | 12 | HIGH | Open |
| RISK-W4-08 | Public Internet Exposure | 4 | 5 | 20 | CRITICAL | MUST RESOLVE |
| RISK-W4-09 | Large Track History | 2 | 3 | 6 | MEDIUM | Mitigated (cap) |
| RISK-W4-10 | Playwright WebGL Flakiness | 4 | 3 | 12 | HIGH | Open |
| RISK-W4-11 | Bulk CoT Export Timeout | 3 | 2 | 6 | MEDIUM | Mitigated (cap) |
| RISK-W4-12 | Keyboard Shortcut Conflicts | 3 | 1 | 3 | LOW | Mitigated |

**RISK-W4-08 is the only CRITICAL risk and MUST be resolved (IP allowlist or Cloudflare Access)
before dashboard.apex-sentinel.io goes live.**
