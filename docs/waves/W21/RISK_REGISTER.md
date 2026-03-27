# W21 RISK REGISTER — Production Operator UI

## Risk Scoring

| Impact | Score |
|--------|-------|
| Blocks wave completion | 5 |
| Major feature degraded | 4 |
| Minor feature degraded | 3 |
| UX degraded only | 2 |
| Negligible | 1 |

| Probability | Score |
|-------------|-------|
| Almost certain (>80%) | 5 |
| Likely (50-80%) | 4 |
| Possible (25-50%) | 3 |
| Unlikely (10-25%) | 2 |
| Rare (<10%) | 1 |

**Risk Priority = Impact × Probability**

---

## Active Risks

### R-W21-01: Vercel Cold Start Latency on API Routes

**Category:** Performance
**Impact:** 3 (minor feature degraded — dashboard loads slowly on first visit)
**Probability:** 4 (likely — Vercel serverless has cold starts)
**Priority:** 12 (HIGH)

**Description:**
When the Vercel serverless function handling `/api/zones` has not received a request
in several minutes, it cold-starts. This can take 3-5 seconds. The operator experiences
a blank map until the zones API responds. During a shift changeover (high activity),
this is unlikely. After quiet periods, it will be noticeable.

**Mitigation:**
1. Use `next: { revalidate: 60 }` on /api/zones and /api/weather to keep these routes
   cached at Vercel's edge layer. Cold start only affects the first miss.
2. Add `MapSkeleton` component that renders immediately while zones are loading.
3. Configure Vercel's "Fluid Compute" option to keep functions warm if budget allows.

**Residual risk after mitigation:** Low — the skeleton prevents blank-screen UX.

**Owner:** Engineering (implement cache headers and skeleton)

---

### R-W21-02: SSE Stream Disconnection Under Load

**Category:** Reliability
**Impact:** 4 (major feature degraded — real-time alerts stop updating)
**Probability:** 3 (possible — SSE is stateful, proxies can terminate connections)
**Priority:** 12 (HIGH)

**Description:**
Server-Sent Events require a persistent HTTP connection. Corporate network proxies at
airports may terminate idle connections. Vercel Edge functions have a 30s write timeout
— if no events are produced, the stream may be terminated.

Specific risk: the apex-sentinel backend may have quiet periods where no new aircraft,
alerts, or zone changes occur. During these quiet periods, no SSE events are sent.
After 25-30 seconds without data, some proxies terminate the connection.

**Mitigation:**
1. Send a `keepalive` SSE event every 20 seconds from `/api/stream` (less than the
   25s Vercel Edge idle timeout and less than typical proxy idle timeouts).
2. Implement exponential backoff reconnection in `lib/sse-client.ts` (1s → 2s → 4s → 8s → 30s max).
3. Show ConnectionStatusIndicator in TopBar when stream is disconnected — operators
   know their data may be stale.
4. On reconnection, fetch latest state from REST endpoints to fill the gap.

**Residual risk after mitigation:** Low — keepalive prevents timeout; reconnection handles
the cases keepalive misses.

**Owner:** Engineering (keepalive in stream route + reconnection in sse-client.ts)

---

### R-W21-03: Leaflet SSR Crash in Vercel Build

**Category:** Build failure
**Impact:** 5 (blocks wave completion — build fails, no deployment)
**Probability:** 3 (possible — Leaflet uses window/document, easy to miss)
**Priority:** 15 (CRITICAL)

**Description:**
Next.js App Router renders components server-side during build. Leaflet v1.9 directly
accesses `window` and `document` at import time. If any component imports Leaflet
without the `dynamic(..., { ssr: false })` guard, the Vercel build will fail with
"window is not defined" or "document is not defined".

This is a known, well-documented Leaflet + Next.js issue. The risk is that a developer
adds a new map component without applying the guard.

**Mitigation:**
1. All Leaflet-dependent components use `dynamic(() => import(...), { ssr: false })`.
2. ESLint rule added: custom rule that errors if `leaflet` is imported directly
   (not via dynamic) in a `.tsx` component file.
3. `vitest.setup.ts` includes a full Leaflet mock — test failures will surface if
   any component imports Leaflet directly without mocking.
4. ARCHITECTURE.md documents the pattern with an example.

**Residual risk after mitigation:** Low — enforced by ESLint and Vitest mock.

**Owner:** Engineering (ESLint rule + pattern enforcement)

---

### R-W21-04: OpenSky Rate Limit Exhaustion

**Category:** Data availability
**Impact:** 3 (minor feature degraded — aircraft markers disappear)
**Probability:** 3 (possible — anonymous tier: 1000 requests/day)
**Priority:** 9 (MEDIUM)

**Description:**
OpenSky anonymous API tier limits requests to approximately 1000 per day per IP.
The apex-sentinel core's AircraftPositionAggregator polls OpenSky every 15 seconds
(5760 requests/day). This exceeds the anonymous tier limit.

W21 uses the apex-sentinel API as a proxy, so the rate limit is applied to the
apex-sentinel server IP, not the Vercel IP. The risk is that apex-sentinel exhausts
its quota before the day ends.

**Mitigation:**
1. W18 AircraftPositionAggregator should use an authenticated OpenSky account (1 million
   requests/day for registered users). This is a W18 configuration issue, not W21.
2. W21 `/api/aircraft` route caches responses for 15 seconds at the Vercel edge.
   This prevents additional quota consumption from browser refreshes.
3. If OpenSky returns 429, the `/api/aircraft` route returns the last cached response
   with a `X-Data-Staleness` header indicating how old it is.
4. The UI displays aircraft "Last seen: Xs ago" timestamps — operators know if data is stale.

**Residual risk after mitigation:** Medium — a W18 configuration fix is required for
long-running deployments. W21 cannot solve this alone.

**Owner:** W18 team (OpenSky auth credentials), W21 team (staleness indicator in UI)

---

### R-W21-05: apex-sentinel Core HTTP Service Unavailable

**Category:** Data availability
**Impact:** 5 (blocks all data — dashboard shows no zones, no alerts, no aircraft)
**Probability:** 2 (unlikely — service is on gateway-01 with Restart=on-failure)
**Priority:** 10 (HIGH)

**Description:**
All W21 API routes depend on the apex-sentinel core HTTP service
(APEX_SENTINEL_API_URL). If this service is down, every route returns 503.
The operator dashboard shows a "BACKEND UNAVAILABLE" banner but is otherwise empty.

**Mitigation:**
1. API routes return last-cached data if the backend returns 503, using Vercel's
   stale-while-revalidate cache strategy.
2. The UI shows a "SYSTEM OFFLINE — data may be stale" banner in red when
   consecutive API calls fail.
3. W13 Telegram notification is sent when backend connectivity is lost (W18 watchdog).
4. Systemd `Restart=on-failure` ensures the service restarts within seconds of a crash.

**Residual risk after mitigation:** Low for transient failures. High for prolonged outage
(gateway-01 maintenance, Azure quota issue). This is operational risk, not engineering risk.

**Owner:** DevOps (systemd service health), Engineering (graceful degradation in UI)

---

### R-W21-06: NOTAM API Source Unavailability

**Category:** Data availability
**Impact:** 2 (UX degraded — NOTAM overlay empty, no functional impact on alerts)
**Probability:** 2 (unlikely — NOTAM APIs are stable public services)
**Priority:** 4 (LOW)

**Description:**
The W18 NotamIngestor fetches NOTAM data from a public source. If the source is
unavailable, the NOTAM overlay and LiveNotamOverlay panel show "No NOTAMs available".
This does not affect alerts, aircraft data, or AWNING levels.

**Mitigation:**
1. Cache NOTAM data for 30 minutes at Vercel edge. A 30-minute outage is invisible to operators.
2. LiveNotamOverlay shows last-successful-fetch timestamp so operators know data age.
3. The NOTAM overlay is an optional layer (off by default on map). Its absence does not
   impair primary operator functionality.

**Residual risk after mitigation:** Negligible.

**Owner:** Engineering (cache headers on /api/notams)

---

### R-W21-07: TypeScript Interface Drift Between W21 UI and W18-W20 Backend

**Category:** Integration
**Impact:** 5 (runtime crashes if interface mismatch is severe)
**Probability:** 2 (unlikely if interfaces are kept in sync, but possible on backend updates)
**Priority:** 10 (HIGH)

**Description:**
W21 defines TypeScript interfaces in `lib/types/w21.ts` that represent the expected
shape of data from W18-W20 engines. If a future backend change (post-W21) modifies
a response schema without updating the W21 types, the UI may crash with type errors
at runtime (unexpected undefined fields, etc.).

**Mitigation:**
1. API routes validate response shapes using Zod or manual validation before returning
   to the browser. If a field is missing, the route returns a partial response with
   defaults rather than crashing.
2. W21 types are documented in DATABASE_SCHEMA.md. Backend changes must reference this
   document before modifying response schemas.
3. Integration tests (`__tests__/integration/`) test the full chain — if the backend
   changes and the integration test fails, the issue is caught before production.

**Residual risk after mitigation:** Low if the validation discipline is maintained.

**Owner:** Engineering (Zod validation in API routes), Process (backend change protocol)

---

### R-W21-08: WCAG Failure on Map Component

**Category:** Accessibility / compliance
**Impact:** 3 (compliance risk — WAI-ARIA requirements for interactive maps)
**Probability:** 3 (possible — Leaflet has known ARIA gaps)
**Priority:** 9 (MEDIUM)

**Description:**
Leaflet maps are notoriously difficult to make fully accessible. Zone circles and aircraft
markers are canvas-rendered elements with no native keyboard access. Screen reader users
cannot interact with map elements.

**Mitigation:**
1. The map is designated as a "supplementary view" — all critical information is
   available in non-map form (alert panel shows zone names as text, network panel shows
   node locations as text, etc.).
2. Map container has `aria-label="Protected airspace zones map"` and `role="img"`.
3. Zone detail panel and aircraft detail panel (accessible via keyboard Tab navigation
   from zone/aircraft list views) provide the same information as map clicks.
4. axe-core audit runs as part of CI (accessibility test file). Any violation blocks release.
5. WCAG 2.1 AA allows for exceptions where a technology does not support accessibility —
   the map is such a case, documented in the accessibility audit report.

**Residual risk after mitigation:** Medium — documented exception, mitigated by
text-based alternatives for all map data.

**Owner:** Engineering (aria attributes, text alternatives), QA (axe-core audit)

---

### R-W21-09: JetBrains Mono Font Loading Failure

**Category:** UX / readability
**Impact:** 2 (UX degraded — fallback monospace font renders instead)
**Probability:** 1 (rare — Google Fonts / self-hosted font is highly available)
**Priority:** 2 (LOW)

**Description:**
JetBrains Mono is loaded from Google Fonts or self-hosted. If the font fails to load
(CDN outage, CSP blockage), the browser falls back to Fira Code → Consolas → monospace.
Data values remain monospace-rendered; only the exact visual style changes.

**Mitigation:**
1. Font fallback stack in tailwind.config.ts: `['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace']`.
2. Font is self-hosted in `/public/fonts/` rather than loaded from Google Fonts CDN.
   Eliminates external dependency and aligns with CSP policy.

**Residual risk after mitigation:** Negligible.

**Owner:** Engineering (self-hosted font setup)

---

## Closed / Accepted Risks

### R-W21-10: No E2E Tests (Playwright Deferred)

**Category:** Test coverage
**Resolution:** ACCEPTED — Playwright E2E tests are deferred from W21 scope.
Vitest + RTL covers the contract; smoke tests cover the deployment. E2E is
post-W21 stability work.
**Impact if accepted risk manifests:** Minor — integration gaps not caught by component tests.

### R-W21-11: Single-Region Vercel Deployment (fra1 Only)

**Category:** Availability
**Resolution:** ACCEPTED — Single region (Frankfurt) is appropriate for Romanian
operators. Multi-region Vercel is significantly more expensive. Availability SLA for
Vercel fra1 is 99.99%.

---

## Risk Review Schedule

- W21 TDD RED commit: review R-W21-01 through R-W21-05
- W21 API GREEN: review R-W21-07 (interface drift)
- Pre-deployment: review all risks, update mitigations
- Post-deployment (Day +7): retrospective on which risks materialised

---

*Document version: W21-RISK_REGISTER-v1.0*
*Status: ACTIVE*
