# W21 ARCHITECTURE — Production Operator UI

## Technology Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Framework | Next.js | 16.x | App Router, RSC, edge middleware — already in repo |
| UI runtime | React | 19.x | Concurrent features, useOptimistic for acknowledge |
| Styling | Tailwind CSS | 3.4 | Utility-first; no runtime CSS-in-JS overhead |
| Map | Leaflet | 1.9 | Already in repo; see DECISION_LOG.md |
| Charts | Recharts | 2.15 | Already in repo; composable, TS-native |
| Animation | Framer Motion | 11.x | Already in repo; restricted to approved uses |
| Icons | Lucide React | 0.468 | Already in repo |
| Real-time | SSE (EventSource) | browser-native | See DECISION_LOG.md |
| Testing | Vitest + RTL | latest | See TEST_STRATEGY.md |

No new npm dependencies are introduced in W21.

---

## App Router Structure

```
apex-sentinel-demo/
├── app/
│   ├── layout.tsx                    (existing — dark theme root)
│   ├── page.tsx                      (REPLACED — production dashboard)
│   ├── login/
│   │   └── page.tsx                  (existing — unchanged)
│   ├── dashboard/
│   │   └── page.tsx                  (NEW — redirects to app/page.tsx or standalone)
│   └── api/
│       ├── aircraft/
│       │   └── route.ts              (NEW — FR-W21-08)
│       ├── notams/
│       │   └── route.ts              (NEW — FR-W21-08)
│       ├── zones/
│       │   └── route.ts              (NEW — FR-W21-08)
│       ├── weather/
│       │   └── route.ts              (NEW — FR-W21-08)
│       ├── security-events/
│       │   └── route.ts              (NEW — FR-W21-08)
│       ├── alerts/
│       │   ├── route.ts              (REPLACED — was simulation alerts)
│       │   └── [id]/
│       │       └── acknowledge/
│       │           └── route.ts      (NEW — FR-W21-08)
│       ├── incidents/
│       │   └── route.ts              (NEW — FR-W21-08)
│       ├── health/
│       │   └── route.ts              (NEW — FR-W21-08)
│       ├── compliance/
│       │   └── route.ts              (NEW — FR-W21-08)
│       └── stream/
│           └── route.ts              (NEW — SSE endpoint)
│
├── components/
│   ├── TopBar.tsx                    (REPLACED — new tab structure)
│   ├── ZoneMap.tsx                   (NEW — FR-W21-01, replaces LiveMap.tsx)
│   ├── AircraftLayer.tsx             (NEW — FR-W21-01)
│   ├── ThreatTrackLayer.tsx          (NEW — FR-W21-01)
│   ├── NotamLayer.tsx                (NEW — FR-W21-01)
│   ├── ZoneDetailPanel.tsx           (NEW — FR-W21-01)
│   ├── AircraftDetailPanel.tsx       (NEW — FR-W21-01)
│   ├── LiveAlertWorkflow.tsx         (NEW — FR-W21-02, replaces AlertFeed.tsx)
│   ├── AlertCard.tsx                 (NEW — FR-W21-02)
│   ├── SlaCountdown.tsx              (NEW — FR-W21-02)
│   ├── IncidentDetailView.tsx        (NEW — FR-W21-03, replaces FdrpPanel.tsx)
│   ├── IncidentCard.tsx              (NEW — FR-W21-03)
│   ├── IncidentTimeline.tsx          (NEW — FR-W21-03)
│   ├── NetworkHealthPanel.tsx        (NEW — FR-W21-04, replaces SystemStatus.tsx)
│   ├── FeedHealthGrid.tsx            (NEW — FR-W21-04)
│   ├── SensorNodeMap.tsx             (NEW — FR-W21-04)
│   ├── LiveNotamOverlay.tsx          (NEW — FR-W21-05)
│   ├── AtmosphericFlightConditions.tsx (NEW — FR-W21-06)
│   ├── FlyabilityScore.tsx           (NEW — FR-W21-06)
│   └── ComplianceDashboard.tsx       (NEW — FR-W21-07)
│
└── lib/
    ├── simulation.ts                 (DEPRECATED — not imported by W21)
    ├── api-client.ts                 (NEW — typed fetch wrappers for all 11 routes)
    ├── sse-client.ts                 (NEW — EventSource wrapper with reconnection)
    └── types/
        └── w21.ts                   (NEW — all W21 TypeScript interfaces)
```

---

## Data Flow Architecture

### SSE Real-Time Pipeline

```
W20 AlertAcknowledgmentEngine (apex-sentinel core)
    │  emits: alert_new, alert_updated, alert_escalated
    │
W20 IncidentManager
    │  emits: incident_opened, incident_updated, incident_closed
    │
W18 AircraftPositionAggregator
    │  emits: aircraft_update (every 15s)
    │
W18 AtmosphericConditionProvider
    │  emits: weather_update (every 60s)
    │
    ▼
app/api/stream/route.ts (Next.js SSE endpoint)
    │  reads event streams from W18-W20 engines
    │  formats as Server-Sent Events
    │  text/event-stream, no-cache
    │
    ▼  (HTTP SSE over Vercel Edge)
lib/sse-client.ts (browser)
    │  EventSource with exponential backoff reconnection
    │  dispatches to React state via useReducer
    │
    ▼
React component tree
    │  useReducer(sseReducer, initialState)
    │  state flows down as props
    │
    ├── ZoneMap.tsx         (zones, aircraft, threats, weather overlay)
    ├── LiveAlertWorkflow.tsx (alerts, sorted by priority)
    ├── IncidentDetailView.tsx (incidents, auto-updates)
    └── NetworkHealthPanel.tsx (health scores)
```

### Polling API Pipeline (non-realtime data)

```
app/api/notams/route.ts        → W18 NotamIngestor      (poll every 5min)
app/api/compliance/route.ts    → W19+W20 compliance     (poll every 60s)
app/api/health/route.ts        → W16+W18 health         (poll every 30s)
```

### Acknowledge Action Flow

```
Operator clicks [ACKNOWLEDGE]
    │
AlertCard.tsx: optimistic UI update (useOptimistic)
    │  card immediately shows "ACKNOWLEDGING..."
    │
POST /api/alerts/{id}/acknowledge
    │
app/api/alerts/[id]/acknowledge/route.ts
    │  calls W20 AlertAcknowledgmentEngine.acknowledge(id)
    │
W20 updates FSM: NEW → ACKNOWLEDGED
    │
W20 emits alert_updated event
    │
SSE stream pushes update to browser
    │
React state confirms optimistic update; card shows "ACKNOWLEDGED"
```

---

## Component Hierarchy (ASCII)

```
app/page.tsx (Dashboard Root)
│
├── TopBar
│   ├── SystemNameBadge
│   ├── AwningLevelSummary (counts by level)
│   ├── TabNav [ZONE MAP | INCIDENTS | NETWORK | COMPLIANCE]
│   └── SystemClock (JetBrains Mono, live)
│
├── MainContent (flex-1, switches by tab)
│   │
│   ├── [tab=ZONE MAP] ZoneManagementDashboard
│   │   ├── ZoneMap (Leaflet, full-height)
│   │   │   ├── ProtectedZoneLayer (circles, AWNING colours)
│   │   │   ├── AircraftLayer (plane markers, ICAO24)
│   │   │   ├── ThreatTrackLayer (animated threat markers)
│   │   │   ├── NotamLayer (hatched polygons, conditional)
│   │   │   ├── EasaUasZoneLayer (coloured polygons, conditional)
│   │   │   └── WeatherOverlay (visibility/wind, conditional)
│   │   ├── ZoneDetailPanel (map click, slide-in)
│   │   ├── AircraftDetailPanel (map click, slide-in)
│   │   ├── MapLayerControls (top-right toggle panel)
│   │   └── AtmosphericFlightConditions (bottom-left widget)
│   │
│   ├── [tab=INCIDENTS] IncidentDetailView
│   │   ├── IncidentList
│   │   │   └── IncidentCard[]
│   │   └── IncidentDetailDrawer (click → slide-in)
│   │       ├── IncidentTimeline
│   │       ├── InvolvedAircraftList
│   │       ├── ActionsTaken
│   │       └── ExportPdfButton
│   │
│   ├── [tab=NETWORK] NetworkHealthPanel
│   │   ├── SystemHealthScore (0-100 gauge)
│   │   ├── SensorNodeGrid (7 nodes)
│   │   ├── FeedHealthGrid (8 feeds)
│   │   └── CoverageMap (Leaflet, mini)
│   │
│   └── [tab=COMPLIANCE] ComplianceDashboard
│       ├── GdprStatusPanel
│       ├── EasaStatusPanel
│       └── SlaCompliancePanel
│
├── LiveAlertWorkflow (right panel, always visible)
│   ├── AlertFilterBar (zone, severity, status)
│   ├── AlertList
│   │   └── AlertCard[]
│   │       ├── AwningLevelBadge
│   │       ├── ZoneName
│   │       ├── ThreatCategory
│   │       ├── SlaCountdown
│   │       ├── AcknowledgeButton
│   │       └── ViewIncidentLink
│   └── LiveNotamOverlay (slide-in drawer, NOTAM tab)
│
└── NotamDrawer (global, conditionally rendered)
    ├── NotamFilterBar
    └── NotamList
        └── NotamCard[]
```

---

## State Management

W21 uses React's built-in state primitives. No external state library.

### Root State (app/page.tsx useReducer)

```typescript
interface DashboardState {
  activeTab: 'ZONE_MAP' | 'INCIDENTS' | 'NETWORK' | 'COMPLIANCE';
  alerts: Alert[];
  incidents: Incident[];
  aircraft: Aircraft[];
  zones: ProtectedZone[];
  health: SystemHealth;
  weather: WeatherConditions;
  notams: Notam[];
  complianceStatus: ComplianceStatus;
  sseConnected: boolean;
  selectedZoneId: string | null;
  selectedAircraftId: string | null;
  openIncidentId: string | null;
  notamDrawerOpen: boolean;
  alertFilters: AlertFilters;
}
```

### SSE Reducer Actions

```
SSE_CONNECT | SSE_DISCONNECT
ALERT_NEW | ALERT_UPDATED | ALERT_ESCALATED
INCIDENT_OPENED | INCIDENT_UPDATED | INCIDENT_CLOSED
AIRCRAFT_UPDATE
WEATHER_UPDATE
ZONE_UPDATE
```

---

## Leaflet SSR Handling

Leaflet uses `window` and `document` during initialisation. In Next.js App Router, this
requires dynamic import with `ssr: false`.

Pattern used throughout W21:

```typescript
const ZoneMap = dynamic(() => import('@/components/ZoneMap'), {
  ssr: false,
  loading: () => <MapSkeleton />
});
```

`MapSkeleton` renders a dark-background placeholder with "Loading map..." in JetBrains
Mono. This prevents layout shift during hydration.

---

## API Route Execution Model

All API routes run as Vercel Serverless Functions (Node.js 20 runtime) except:
- `app/api/stream/route.ts` — runs as Vercel Edge Function (streaming required)

API routes import W18-W20 engines directly as Node.js modules. No separate backend
process. On Vercel, this means the engines initialise on cold start.

Cold start mitigation: W21-01 (zones) and W21-06 (weather) are cached at the edge for
60 seconds using Vercel's `next: { revalidate: 60 }` cache directive.

---

## Security Boundaries

- The dashboard is behind the existing login page (`/login`). W21 does not change auth.
- API routes do not expose internal W18-W20 data structures directly. They return typed
  response DTOs defined in `lib/types/w21.ts`.
- No credentials (API keys for OpenSky, ADS-BX) are ever returned to the client.
- The SSE stream (`/api/stream`) returns processed events only, never raw backend state.
- No client-side persistent storage. See PRIVACY_ARCHITECTURE.md.

---

*Document version: W21-ARCHITECTURE-v1.0*
*Status: APPROVED FOR IMPLEMENTATION*
