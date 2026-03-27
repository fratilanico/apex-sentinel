# W21 IMPLEMENTATION PLAN — Production Operator UI

## Build Order

API routes first. Components second. Integration third.

The rationale: components can be built against mock data (MSW). API routes are the
integration boundary with W18-W20. If the API routes are wrong, all component work
is wasted. Validate the data contract at the API layer first.

---

## Phase 0: Setup (Day 1, ~2 hours)

**Goal:** Test infrastructure working. One RED test.

1. Install devDependencies:
   ```bash
   cd /Users/nico/projects/apex-sentinel-demo
   npm install --save-dev @testing-library/react @testing-library/user-event \
     @testing-library/jest-dom @vitest/coverage-v8 happy-dom msw vitest-axe
   ```

2. Update `vitest.config.ts`: add happy-dom environment, coverage thresholds, setupFiles
3. Create `vitest.setup.ts`: Leaflet mock, MSW server, jest-dom matchers
4. Create `lib/types/w21.ts`: all TypeScript interfaces from DATABASE_SCHEMA.md
5. Create `__tests__/mocks/fixtures.ts`: test data fixtures (1 zone, 2 alerts, 1 aircraft, etc.)
6. Create `__tests__/mocks/handlers.ts`: MSW handlers for all 11 routes
7. Create `__tests__/mocks/sse.ts`: mock EventSource

**Verify:** `npx vitest run` — 0 tests (no test files yet), `npx tsc --noEmit` — 0 errors.

---

## Phase 1: TDD RED (Day 1, ~3 hours)

**Goal:** All 71 test files written, all failing.

Write tests in this order (highest value first):

1. `__tests__/components/AlertCard.test.tsx` — core operator action
2. `__tests__/components/LiveAlertWorkflow.test.tsx`
3. `__tests__/components/SlaCountdown.test.tsx`
4. `__tests__/api/alerts.test.ts`
5. `__tests__/api/alerts-acknowledge.test.ts`
6. `__tests__/components/ZoneManagementDashboard.test.tsx`
7. `__tests__/integration/ZoneMap.integration.test.tsx`
8. `__tests__/integration/acknowledge-flow.test.tsx`
9. (remaining test files — use ACCEPTANCE_CRITERIA.md as source)
10. `__tests__/accessibility/dashboard.a11y.test.tsx`

**Verify:** `npx vitest run` — 71 failures.
**Commit:** "test(W21): TDD RED — 71 failing tests"

---

## Phase 2: API Layer (Day 2, ~4 hours)

**Goal:** All 13 API route tests GREEN.

Build in this order:

### Step 2a: Type foundation
Create `lib/api-client.ts` — typed fetch wrappers. These are used by both components
and will be used in smoke tests.

### Step 2b: Read routes (no side effects)

```
app/api/zones/route.ts          — calls APEX_SENTINEL_API_URL/zones
app/api/aircraft/route.ts       — calls OpenSky + ADS-BX, strips owner data
app/api/weather/route.ts        — calls OpenWeatherMap
app/api/notams/route.ts         — calls NOTAM API for LRBB FIR
app/api/health/route.ts         — calls apex-sentinel /health endpoint
app/api/compliance/route.ts     — calls apex-sentinel /compliance endpoint
app/api/incidents/route.ts      — calls apex-sentinel /incidents endpoint
app/api/security-events/route.ts — calls apex-sentinel /security-events endpoint
app/api/alerts/route.ts         — calls apex-sentinel /alerts endpoint (REPLACE)
```

### Step 2c: Write routes (with side effects)

```
app/api/alerts/[id]/acknowledge/route.ts  — POST → apex-sentinel, returns 409 if duplicate
```

### Step 2d: SSE stream

```
app/api/stream/route.ts         — Edge function, connects to apex-sentinel event stream
```

This is the most complex route. Build it last.

Pattern:
```typescript
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // connect to apex-sentinel SSE or polling
      // format events and enqueue
      const keepalive = setInterval(() => {
        controller.enqueue(encoder.encode('event: keepalive\ndata: {}\n\n'));
      }, 30000);
      // cleanup on close
    }
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
```

**Verify:** `npx vitest run __tests__/api/` — 13/13 pass.
**Commit:** "feat(W21): API layer GREEN — 13 route tests pass"

---

## Phase 3: SSE Client (Day 2, ~1 hour)

**Goal:** SSE client lib written and unit tested.

Create `lib/sse-client.ts`:

```typescript
export class SseClient {
  private es: EventSource | null = null;
  private retryDelay = 1000;
  private maxRetryDelay = 30000;
  private handlers = new Map<string, ((data: unknown) => void)[]>();

  connect(url: string): void { ... }
  on<T>(eventType: SseEventType, handler: (data: T) => void): void { ... }
  disconnect(): void { ... }
  private reconnect(url: string): void { ... }  // exponential backoff
}
```

**Verify:** SSE client unit tests in `__tests__/` (added to `LiveAlertWorkflow.test.tsx`).

---

## Phase 4: Core Components (Day 3, ~6 hours)

**Goal:** Alert + zone components GREEN. These are the highest-value components.

Build in this order:

### Step 4a: Shared utilities
- `lib/awning-colours.ts` — AWNING → hex colour mapping
- `lib/format-utils.ts` — formatTime(), formatScore(), formatCoords()
- `components/AwningLevelBadge.tsx` — used everywhere

### Step 4b: Alert components
- `components/SlaCountdown.tsx` — standalone timer, purely visual
- `components/AlertCard.tsx` — depends on SlaCountdown and AwningLevelBadge
- `components/AlertFilterBar.tsx` — purely visual, no state
- `components/LiveAlertWorkflow.tsx` — composes AlertCard[], uses SSE client

### Step 4c: Map components
- `components/MapSkeleton.tsx` — pure visual placeholder
- `components/ZoneMap.tsx` — Leaflet container, dynamic import safe
- `components/AircraftLayer.tsx` — adds aircraft markers to Leaflet map
- `components/ThreatTrackLayer.tsx` — adds threat track markers
- `components/NotamLayer.tsx` — adds NOTAM polygons
- `components/ZoneDetailPanel.tsx` — slide-in, no map dependency
- `components/AircraftDetailPanel.tsx` — slide-in, no map dependency
- `components/MapLayerControls.tsx` — toggle panel
- `components/ZoneManagementDashboard.tsx` — composes all map components

**Verify:** `npx vitest run __tests__/components/` — all alert + zone tests pass.

---

## Phase 5: Secondary Components (Day 4, ~5 hours)

### Step 5a: Incident view
- `components/IncidentTimeline.tsx`
- `components/InvolvedAircraftList.tsx`
- `components/IncidentCard.tsx`
- `components/IncidentDetailDrawer.tsx`
- `components/ExportPdfButton.tsx` — uses window.print()
- `components/IncidentDetailView.tsx`

### Step 5b: Network health
- `components/SystemHealthGauge.tsx`
- `components/SensorNodeCard.tsx`
- `components/SensorNodeGrid.tsx`
- `components/FeedHealthGrid.tsx`
- `components/CoverageMap.tsx` — mini Leaflet, dynamic import safe
- `components/NetworkHealthPanel.tsx`

### Step 5c: NOTAM + Weather
- `components/NotamCard.tsx`
- `components/NotamFilterBar.tsx`
- `components/LiveNotamOverlay.tsx`
- `components/FlyabilityScore.tsx`
- `components/WeatherForecastChart.tsx` — Recharts line chart
- `components/AtmosphericFlightConditions.tsx`

### Step 5d: Compliance
- `components/GdprStatusPanel.tsx`
- `components/EasaStatusPanel.tsx`
- `components/SlaCompliancePanel.tsx`
- `components/ComplianceDashboard.tsx`

**Verify:** `npx vitest run __tests__/components/` — all 49 component tests pass.

---

## Phase 6: Dashboard Integration (Day 5, ~4 hours)

### Step 6a: TopBar rebuild
- `components/AwningLevelSummary.tsx`
- `components/SystemClock.tsx`
- `components/ConnectionStatusIndicator.tsx`
- `components/TopBar.tsx` — REPLACE existing

### Step 6b: Root page rebuild
- `app/page.tsx` — REPLACE entire file
  - Remove all simulation imports
  - Add DashboardState useReducer
  - Wire SSE client to reducer
  - Compose all panels with tab routing

### Step 6c: Tailwind + Next.js config
- `tailwind.config.ts` — add apex-* colours, JetBrains Mono
- `next.config.ts` — add CSP header, fra1 region, cache directives

**Verify:** `npm run build` — succeeds.

---

## Phase 7: Integration Tests + Accessibility (Day 5, ~2 hours)

- `__tests__/integration/ZoneMap.integration.test.tsx`
- `__tests__/integration/acknowledge-flow.test.tsx`
- `__tests__/accessibility/dashboard.a11y.test.tsx`

**Verify:** `npx vitest run` — 71/71 GREEN.
**Verify:** `npx vitest run --coverage` — all thresholds ≥80%.

---

## Phase 8: Deploy + Smoke Test (Day 6, ~2 hours)

1. Set all Vercel environment variables (DEPLOY_CHECKLIST.md section 2)
2. `git push origin main` — triggers Vercel deployment
3. Run all smoke tests from DEPLOY_CHECKLIST.md section 6
4. Run WCAG audit (DEPLOY_CHECKLIST.md section 7)
5. Verify no simulation/Ukraine content (DEPLOY_CHECKLIST.md section 8)
6. Performance check (DEPLOY_CHECKLIST.md section 9)

---

## Daily Checkpoints

| Day | Target | Commit message |
|-----|--------|----------------|
| Day 1 | TDD RED (71 failing) | "test(W21): TDD RED — 71 failing tests" |
| Day 2 | API layer GREEN (13) | "feat(W21): API layer GREEN" |
| Day 3 | Alert + zone GREEN (22) | "feat(W21): alert and zone components GREEN" |
| Day 4 | All components GREEN (49) | "feat(W21): all component tests GREEN" |
| Day 5 | Full suite GREEN (71) | "feat(W21): all 71 tests GREEN" |
| Day 6 | Deployed to Vercel | "feat(W21): production deployment" |
| Day 6 | Wave complete | "feat(W21): COMPLETE — production operator UI" |

---

## Risk Mitigation During Implementation

| Risk | Mitigation |
|------|-----------|
| apex-sentinel HTTP service not running | Build API routes to return mock data if APEX_SENTINEL_API_URL is not set (dev mode) |
| OpenSky rate limit hit | Cache /api/aircraft responses for 15s at Vercel Edge |
| Leaflet SSR error in build | All Leaflet components use `dynamic(..., { ssr: false })` — enforce in code review |
| SSE stream times out on Vercel | Send keepalive every 30s; Vercel Edge has 25s timeout for idle streams — keepalive prevents this |
| TypeScript errors block build | Run `npx tsc --noEmit` after each phase; fix immediately |

---

*Document version: W21-IMPLEMENTATION_PLAN-v1.0*
*Status: APPROVED FOR IMPLEMENTATION*
