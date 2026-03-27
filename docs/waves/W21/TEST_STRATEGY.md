# W21 TEST STRATEGY — Production Operator UI

## Testing Philosophy

W21 tests validate that the operator dashboard correctly presents data from W18-W20
backends, handles real-time updates correctly, and maintains accessibility standards.
Tests are written before implementation (TDD RED → GREEN protocol).

No Playwright E2E tests in W21. The Vercel cold start time makes E2E tests flaky in CI.
E2E is deferred to a post-W21 stability wave.

---

## Test Stack

| Tool | Version | Purpose |
|------|---------|---------|
| Vitest | latest | Test runner, replaces Jest |
| @testing-library/react | latest | Component rendering |
| @testing-library/user-event | latest | User interaction simulation |
| @testing-library/jest-dom | latest | Matchers (toBeInTheDocument, etc.) |
| @vitest/coverage-v8 | latest | Coverage reporting |
| msw | latest | Mock Service Worker — API route mocking |
| vitest-axe | latest | Accessibility testing (wraps axe-core) |

These are added as devDependencies to `package.json` in apex-sentinel-demo.

---

## Test Organisation

All test files live in `__tests__/` adjacent to the component or in a central
`__tests__/` directory.

```
apex-sentinel-demo/
└── __tests__/
    ├── components/
    │   ├── AlertCard.test.tsx              FR-W21-02 (3 tests)
    │   ├── LiveAlertWorkflow.test.tsx      FR-W21-02 (5 tests)
    │   ├── SlaCountdown.test.tsx           FR-W21-02 (3 tests)  [shared with FR-W21-02]
    │   ├── IncidentDetailView.test.tsx     FR-W21-03 (7 tests)
    │   ├── NetworkHealthPanel.test.tsx     FR-W21-04 (7 tests)
    │   ├── LiveNotamOverlay.test.tsx       FR-W21-05 (6 tests)
    │   ├── AtmosphericFlightConditions.test.tsx  FR-W21-06 (6 tests)
    │   ├── ComplianceDashboard.test.tsx    FR-W21-07 (7 tests)
    │   └── ZoneManagementDashboard.test.tsx FR-W21-01 (5 component tests)
    ├── api/
    │   ├── aircraft.test.ts               FR-W21-08 (1-2 tests)
    │   ├── notams.test.ts                 FR-W21-08 (1 test)
    │   ├── zones.test.ts                  FR-W21-08 (1 test)
    │   ├── weather.test.ts                FR-W21-08 (1 test)
    │   ├── security-events.test.ts        FR-W21-08 (1 test)
    │   ├── alerts.test.ts                 FR-W21-08 (2 tests)
    │   ├── alerts-acknowledge.test.ts     FR-W21-08 (2 tests)
    │   ├── incidents.test.ts              FR-W21-08 (1 test)
    │   ├── health.test.ts                 FR-W21-08 (1 test)
    │   ├── compliance.test.ts             FR-W21-08 (1 test)
    │   └── stream.test.ts                 FR-W21-08 (1 test)
    ├── integration/
    │   ├── ZoneMap.integration.test.tsx   FR-W21-01 (5 integration tests)
    │   └── acknowledge-flow.test.tsx      FR-W21-02 (3 integration tests)
    └── accessibility/
        └── dashboard.a11y.test.tsx        (4 WCAG tests across main components)
```

---

## FR-W21-01: ZoneManagementDashboard Tests

### Component Tests (5)

```typescript
describe('FR-W21-01: ZoneManagementDashboard', () => {
  it('renders Leaflet map container with Romania center coordinates')
  it('renders zone circles with AWNING level colours')
  it('opens ZoneDetailPanel on zone click')
  it('opens AircraftDetailPanel on aircraft marker click')
  it('renders MapLayerControls with toggles for each layer')
})
```

Note: Leaflet is incompatible with JSDOM. ZoneMap.tsx is dynamically imported with
`ssr: false`. Component tests mock the `ZoneMap` import and test the wrapping
`ZoneManagementDashboard` logic. Map-specific interaction is covered in integration tests
that use a browser-like environment (happy-dom).

### Integration Tests (5)

```typescript
describe('FR-W21-01: ZoneManagementDashboard Integration', () => {
  it('fetches /api/zones on mount and renders zone count in TopBar')
  it('fetches /api/aircraft on mount and renders aircraft count')
  it('updates zone circle colour when SSE zone_update event received')
  it('updates aircraft position when SSE aircraft_update event received')
  it('shows loading skeleton while /api/zones is pending')
})
```

**Total FR-W21-01: 10 tests**

---

## FR-W21-02: LiveAlertWorkflow Tests

```typescript
describe('FR-W21-02: AlertCard', () => {
  it('renders alert with zone name, category, AWNING level, SLA countdown')
  it('shows SLA breach pulse animation when slaBreached is true')
  it('calls onAcknowledge with alertId when ACKNOWLEDGE button clicked')
})

describe('FR-W21-02: LiveAlertWorkflow', () => {
  it('renders alert list sorted by priority (NEW first, then AWNING level)')
  it('prepends new alert when SSE alert_new event received')
  it('filters alerts by zone when zone filter selected')
  it('filters alerts by status when status filter selected')
  it('updates alert card when SSE alert_updated event received')
})

describe('FR-W21-02: SlaCountdown', () => {
  it('shows countdown in mm:ss format')
  it('renders amber when >50% of SLA elapsed')
  it('renders red when >75% of SLA elapsed')
})
```

**Total FR-W21-02: 11 tests (exceeds 8 target — all kept)**

---

## FR-W21-03: IncidentDetailView Tests

```typescript
describe('FR-W21-03: IncidentDetailView', () => {
  it('renders incident list with count badge')
  it('renders IncidentCard with zone, duration, peak AWNING, detection count')
  it('opens IncidentDetailDrawer when IncidentCard clicked')
  it('renders IncidentTimeline with entries in chronological order')
  it('renders InvolvedAircraftList with ICAO24 identifiers')
  it('renders escalation chain entries')
  it('triggers PDF export when ExportPdfButton clicked')
})
```

**Total FR-W21-03: 7 tests**

---

## FR-W21-04: NetworkHealthPanel Tests

```typescript
describe('FR-W21-04: NetworkHealthPanel', () => {
  it('renders SystemHealthScore as 0-100 with colour by range')
  it('renders 7 SensorNodeCard components from /api/health response')
  it('shows DEGRADED status with amber indicator for degraded nodes')
  it('renders FeedHealthGrid with all 8 feed names')
  it('shows latency value in JetBrains Mono for each feed')
  it('shows error rate as percentage with red indicator if errorRate > 0.05')
  it('updates health score when SSE health_update event received')
})
```

**Total FR-W21-04: 7 tests**

---

## FR-W21-05: LiveNotamOverlay Tests

```typescript
describe('FR-W21-05: LiveNotamOverlay', () => {
  it('renders NOTAM list from /api/notams response')
  it('shows notamId, icaoLocation, type, validFrom, validTo for each NOTAM')
  it('filters to UAS_RESTRICTION type when drone filter selected')
  it('filters to specific airport when airport filter selected')
  it('triggers map highlight when HIGHLIGHT ON MAP button clicked')
  it('auto-refreshes data after 5 minutes (via useEffect interval)')
})
```

**Total FR-W21-05: 6 tests**

---

## FR-W21-06: AtmosphericFlightConditions Tests

```typescript
describe('FR-W21-06: AtmosphericFlightConditions', () => {
  it('renders current conditions: temp, wind, visibility, precipitation')
  it('renders FlyabilityScore with correct label for score 0-19 (PROHIBITED)')
  it('renders FlyabilityScore with correct label for score 80-100 (EXCELLENT)')
  it('renders 6-hour forecast Recharts line chart')
  it('renders atmospheric risk per zone when multiple zones provided')
  it('renders high-flyability warning banner when score > 60 and active alerts exist')
})
```

**Total FR-W21-06: 6 tests**

---

## FR-W21-07: ComplianceDashboard Tests

```typescript
describe('FR-W21-07: ComplianceDashboard', () => {
  it('renders GDPR panel with totalTracksStored, oldestTrackAgeHours, retentionCompliant')
  it('renders retention warning when oldestTrackAgeHours > 40 (approaching 48h limit)')
  it('renders EASA panel with uasZonesLoaded, categoryAccuracyPct')
  it('renders SLA panel with complianceRate, avgAcknowledgeTimeSecs, slaBreaches')
  it('renders non-compliant indicator when retentionCompliant is false')
  it('renders non-compliant indicator when complianceRate < 0.95')
  it('fetches /api/compliance on mount and re-fetches every 60s')
})
```

**Total FR-W21-07: 7 tests**

---

## FR-W21-08: ProductionApiLayer Tests

```typescript
describe('FR-W21-08: API Routes', () => {
  describe('GET /api/aircraft', () => {
    it('returns aircraft array with threatScore and droneCategory')
    it('filters by zoneId query parameter')
  })
  describe('GET /api/notams', () => {
    it('returns notams with affectsUas flag')
  })
  describe('GET /api/zones', () => {
    it('returns zones with awningLevel and awningLevelCounts summary')
  })
  describe('GET /api/weather', () => {
    it('returns conditions with flyabilityScore and forecast6h array')
  })
  describe('GET /api/security-events', () => {
    it('returns events array with correlationScore')
  })
  describe('GET /api/alerts', () => {
    it('returns alerts sorted by status (NEW first)')
    it('filters alerts by status query parameter')
  })
  describe('POST /api/alerts/[id]/acknowledge', () => {
    it('returns 200 with slaCompliant: true when acknowledged within SLA')
    it('returns 409 when alert is already ACKNOWLEDGED')
  })
  describe('GET /api/incidents', () => {
    it('returns incidents with timeline entries')
  })
  describe('GET /api/health', () => {
    it('returns score 0-100 with sensorNodes and dataFeeds arrays')
  })
  describe('GET /api/compliance', () => {
    it('returns gdpr, easa, sla objects')
  })
  describe('GET /api/stream', () => {
    it('returns text/event-stream content-type header')
  })
})
```

**Total FR-W21-08: 13 tests (exceeds 11 target — all kept)**

---

## Accessibility Tests

```typescript
describe('WCAG 2.1 AA: Dashboard Accessibility', () => {
  it('AlertCard has no accessibility violations (axe-core)')
  it('LiveAlertWorkflow has no accessibility violations (axe-core)')
  it('NetworkHealthPanel has no accessibility violations (axe-core)')
  it('ComplianceDashboard has no accessibility violations (axe-core)')
})
```

**Total accessibility: 4 tests**

---

## Test Count Summary

| FR | Target | Planned |
|----|--------|---------|
| FR-W21-01 | 10 | 10 |
| FR-W21-02 | 8 | 11 |
| FR-W21-03 | 7 | 7 |
| FR-W21-04 | 7 | 7 |
| FR-W21-05 | 6 | 6 |
| FR-W21-06 | 6 | 6 |
| FR-W21-07 | 7 | 7 |
| FR-W21-08 | 11 | 13 |
| Accessibility | — | 4 |
| **Total** | **≥62** | **71** |

---

## Mocking Strategy

### Leaflet

Leaflet is mocked in the Vitest setup file:

```typescript
// vitest.setup.ts
vi.mock('leaflet', () => ({
  map: vi.fn(() => ({ setView: vi.fn(), remove: vi.fn() })),
  tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
  circle: vi.fn(() => ({ addTo: vi.fn(), on: vi.fn() })),
  marker: vi.fn(() => ({ addTo: vi.fn(), on: vi.fn() })),
  polygon: vi.fn(() => ({ addTo: vi.fn() })),
  Icon: { Default: { prototype: { _getIconUrl: vi.fn() } } },
}));
```

### API Routes (MSW)

API routes are mocked using Mock Service Worker (MSW) with a Node.js handler:

```typescript
// __tests__/mocks/handlers.ts
import { http, HttpResponse } from 'msw';
import { mockZones, mockAlerts, mockAircraft } from './fixtures';

export const handlers = [
  http.get('/api/zones', () => HttpResponse.json({ zones: mockZones, totalCount: mockZones.length })),
  http.get('/api/alerts', () => HttpResponse.json({ alerts: mockAlerts })),
  http.get('/api/aircraft', () => HttpResponse.json({ aircraft: mockAircraft })),
  http.post('/api/alerts/:id/acknowledge', () => HttpResponse.json({
    alertId: 'test-id',
    previousStatus: 'NEW',
    newStatus: 'ACKNOWLEDGED',
    slaCompliant: true,
  })),
  // ...etc
];
```

### SSE Stream

The SSE stream is mocked using a Vitest fake EventSource:

```typescript
// __tests__/mocks/sse.ts
export function createMockEventSource() {
  const listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  return {
    addEventListener: (type: string, fn: (e: MessageEvent) => void) => {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    dispatchEvent: (type: string, data: unknown) => {
      listeners[type]?.forEach(fn => fn({ data: JSON.stringify(data) } as MessageEvent));
    },
    close: vi.fn(),
    readyState: 1,
  };
}
```

---

## Coverage Requirements

```
Branches:   ≥ 80%
Functions:  ≥ 80%
Lines:      ≥ 80%
Statements: ≥ 80%
```

Coverage is checked with `npx vitest run --coverage`. CI gate fails if any dimension
drops below 80%.

---

## Vitest Configuration

```typescript
// vitest.config.ts additions for W21
export default defineConfig({
  test: {
    environment: 'happy-dom',     // needed for Leaflet (better than jsdom)
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
      include: ['components/**', 'app/api/**', 'lib/**'],
      exclude: ['lib/simulation.ts'],  // deprecated, excluded from coverage
    },
  },
});
```

---

*Document version: W21-TEST_STRATEGY-v1.0*
*Status: APPROVED FOR IMPLEMENTATION*
