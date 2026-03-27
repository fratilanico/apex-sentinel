# W21 SESSION STATE — Production Operator UI

## Current Wave Status

```
Wave:       W21 — Production Operator UI
Phase:      PLANNED (docs written, implementation not started)
Date:       2026-03-27
Repo:       /Users/nico/projects/apex-sentinel-demo
Branch:     main
```

---

## W21 Init Checklist

- [x] W20 COMPLETE (operator workflow engine, 2939 tests, committed a3fb26c)
- [x] Hackathon deadline passed (March 28) — W21 is post-hackathon work
- [x] W21 docs written (all 20 PROJECTAPEX docs)
- [ ] TDD RED: failing tests committed
- [ ] API routes scaffolded (11 routes, all returning 501 stubs)
- [ ] Component stubs created (all new components, rendering placeholders)
- [ ] EXECUTE phase begun
- [ ] All 71 tests GREEN
- [ ] `npm run build` passes
- [ ] `npx tsc --noEmit` passes
- [ ] WCAG axe-core audit passes
- [ ] Deployed to Vercel
- [ ] Smoke test against real W18-W20 data
- [ ] W21 COMPLETE committed

---

## Files to Create (Implementation)

### New API Routes

```
app/api/aircraft/route.ts
app/api/notams/route.ts
app/api/zones/route.ts
app/api/weather/route.ts
app/api/security-events/route.ts
app/api/alerts/route.ts              (REPLACE existing)
app/api/alerts/[id]/acknowledge/route.ts  (NEW)
app/api/incidents/route.ts
app/api/health/route.ts
app/api/compliance/route.ts
app/api/stream/route.ts
```

### New Components

```
components/ZoneMap.tsx               (replaces LiveMap.tsx)
components/AircraftLayer.tsx
components/ThreatTrackLayer.tsx
components/NotamLayer.tsx
components/EasaUasZoneLayer.tsx
components/WeatherOverlay.tsx
components/MapLayerControls.tsx
components/ZoneDetailPanel.tsx
components/AircraftDetailPanel.tsx
components/LiveAlertWorkflow.tsx     (replaces AlertFeed.tsx)
components/AlertCard.tsx
components/SlaCountdown.tsx
components/IncidentDetailView.tsx    (replaces FdrpPanel.tsx)
components/IncidentCard.tsx
components/IncidentTimeline.tsx
components/NetworkHealthPanel.tsx    (replaces SystemStatus.tsx)
components/FeedHealthGrid.tsx
components/SensorNodeGrid.tsx
components/CoverageMap.tsx
components/LiveNotamOverlay.tsx
components/AtmosphericFlightConditions.tsx
components/FlyabilityScore.tsx
components/ComplianceDashboard.tsx
components/TopBar.tsx                (REPLACE existing)
```

### New Lib Files

```
lib/types/w21.ts
lib/api-client.ts
lib/sse-client.ts
```

### New Test Files

```
__tests__/components/AlertCard.test.tsx
__tests__/components/LiveAlertWorkflow.test.tsx
__tests__/components/SlaCountdown.test.tsx
__tests__/components/IncidentDetailView.test.tsx
__tests__/components/NetworkHealthPanel.test.tsx
__tests__/components/LiveNotamOverlay.test.tsx
__tests__/components/AtmosphericFlightConditions.test.tsx
__tests__/components/ComplianceDashboard.test.tsx
__tests__/components/ZoneManagementDashboard.test.tsx
__tests__/api/aircraft.test.ts
__tests__/api/notams.test.ts
__tests__/api/zones.test.ts
__tests__/api/weather.test.ts
__tests__/api/security-events.test.ts
__tests__/api/alerts.test.ts
__tests__/api/alerts-acknowledge.test.ts
__tests__/api/incidents.test.ts
__tests__/api/health.test.ts
__tests__/api/compliance.test.ts
__tests__/api/stream.test.ts
__tests__/integration/ZoneMap.integration.test.tsx
__tests__/integration/acknowledge-flow.test.tsx
__tests__/accessibility/dashboard.a11y.test.tsx
__tests__/mocks/handlers.ts
__tests__/mocks/fixtures.ts
__tests__/mocks/sse.ts
vitest.setup.ts
```

### Modified Files

```
app/page.tsx                         (REPLACE — remove simulation, add real dashboard)
tailwind.config.ts                   (ADD apex-* colour tokens)
next.config.ts                       (ADD CSP header, cache directives)
package.json                         (ADD devDependencies: vitest, RTL, MSW, axe)
vitest.config.ts                     (UPDATE — add happy-dom, coverage config)
```

### Deprecated (Keep for Reference, Not Imported)

```
lib/simulation.ts                    (deprecated — no W21 imports)
components/FdrpPanel.tsx             (deprecated)
components/AlertFeed.tsx             (deprecated)
components/LiveMap.tsx               (deprecated)
components/SystemStatus.tsx          (deprecated)
components/WaveTimeline.tsx          (deprecated)
app/api/viina/route.ts               (deprecated)
app/api/opensky/route.ts             (deprecated)
```

---

## Environment Variables Required

```
ADSBX_API_KEY           ADS-B Exchange API key
OPENWEATHER_API_KEY     OpenWeatherMap API key
NOTAM_API_TOKEN         NOTAM API token (or public URL for LRBB FIR data)
ACLED_API_KEY           ACLED API key (W18 SecurityEventCorrelator)
SESSION_SECRET          Auth session secret (existing)
NEXT_PUBLIC_APP_ENV     "production" | "development"
```

These are set in Vercel project settings. See DEPLOY_CHECKLIST.md.

---

## Backend Integration Points

The following W18-W20 modules must be importable from the apex-sentinel-demo project.
They exist in `/Users/nico/projects/apex-sentinel/src/`.

This means W21 API routes either:
a) Import the engines directly (requires apex-sentinel as a local npm workspace dependency)
b) Call the engines via HTTP (if apex-sentinel is deployed as a separate service)
c) Duplicate adapter implementations in apex-sentinel-demo

**Resolution for W21:** Option (b) — API routes call the apex-sentinel core via HTTP.
The apex-sentinel core runs as a Node.js service (existing systemd units on gateway-01).
W21 API routes are thin HTTP adapters. This avoids monorepo complexity.

If the apex-sentinel service is unavailable, API routes return 503 with a "BACKEND_UNAVAILABLE"
error code. The frontend handles this by showing a degraded banner.

---

## Open Questions

| Question | Status | Notes |
|----------|--------|-------|
| Is apex-sentinel core deployed as HTTP service? | OPEN | Need to verify W18-W20 expose an HTTP API |
| NOTAM data source for LRBB FIR? | OPEN | W18 NotamIngestor source URL needed |
| Vercel project name (apex-sentinel-demo vs new name)? | OPEN | Keep existing for W21 |
| auth middleware — which session cookie name? | OPEN | Check existing /login implementation |

---

## Previous Session Context

**2026-03-27:** W21 docs written (this session). Implementation not started.
W20 was the last completed wave (committed a3fb26c). The hackathon deadline was March 28;
W21 is the post-hackathon production quality push.

The 16kHz pipeline issue (INDIGO team Cat/George flagged — our 22050Hz is a DATA BREACH)
is noted in MEMORY.md for W17 fix but was deferred post-hackathon. It does not affect W21
(UI wave only; acoustic pipeline is backend).

---

*Document version: W21-SESSION_STATE-v1.0*
*Last updated: 2026-03-27*
