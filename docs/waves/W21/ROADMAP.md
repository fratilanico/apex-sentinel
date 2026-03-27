# W21 ROADMAP — Production Operator UI

## W21 Scope (Current)

W21 is the production operator dashboard. It is the final UI wave in the core APEX-SENTINEL
development programme (W1-W21).

### W21 Deliverables

| FR | Component | Status |
|----|-----------|--------|
| FR-W21-01 | ZoneManagementDashboard | To build |
| FR-W21-02 | LiveAlertWorkflow | To build |
| FR-W21-03 | IncidentDetailView | To build |
| FR-W21-04 | NetworkHealthPanel | To build |
| FR-W21-05 | LiveNotamOverlay | To build |
| FR-W21-06 | AtmosphericFlightConditions | To build |
| FR-W21-07 | ComplianceDashboard | To build |
| FR-W21-08 | ProductionApiLayer (11 routes) | To build |

Target test count: ≥62 tests (Vitest + React Testing Library)
Target WCAG: 2.1 AA (automated + manual)
Target deployment: Vercel (apex-sentinel-demo project)

### W21 Success Gates

All of the following must be true before W21 is marked complete:

1. All 62+ tests pass: `npx vitest run`
2. TypeScript compiles without errors: `npx tsc --noEmit`
3. Production build succeeds: `npm run build`
4. Dashboard loads at Vercel URL with real data (not simulation)
5. All 11 API routes return valid responses (integration smoke test)
6. WCAG 2.1 AA passes on main dashboard page (axe-core)
7. No Ukraine-specific content anywhere in the UI
8. No simulation-related code imported from `lib/simulation.ts`

---

## Post-W21 Roadmap

### Near-Term (1-3 months post W21)

**W22: Mobile Field Operator App**

A React Native or Progressive Web App for field security officers who are physically
in the zone during a detection event. Different information architecture from desktop:
- Simplified alert view (one alert at a time, large text)
- GPS-based proximity to detection
- Push notifications (replace Telegram-based notifications for field use)
- Limited to acknowledge and add note — no full dashboard

Scope estimate: 4-6 weeks. Depends on W21 API layer being stable.

**W23: Historical Analysis Dashboard**

A separate dashboard for post-incident analysis:
- Incident replay: step through past incidents on map
- Pattern analysis: which zones, times of day, drone categories are most common
- Compliance reports: exportable GDPR and SLA reports for regulatory submissions
- No real-time data — reads from Supabase historical tables

Scope estimate: 6-8 weeks. Requires W19 Supabase schema to be stable.

### Medium-Term (3-6 months post W21)

**W24: Multi-Tenant Operator Accounts**

Currently the dashboard is single-organisation. Multi-tenant would allow:
- Per-organisation zone visibility (airport operator sees only their zones)
- Per-operator role permissions (viewer, operator, supervisor, admin)
- AACR liaison officers get read-only view of all organisations
- Audit logs per organisation

Dependencies:
- Supabase Row Level Security policies
- Organisation management API
- Per-user session tokens (replace shared session model)

**W25: Custom Zone Configuration UI**

Allow operations managers to define or edit protected zones without developer intervention:
- Draw zone on map (polygon or circle)
- Set zone type and AWNING response thresholds
- Assign sensor nodes to zone
- Preview NOTAM coverage

Currently zones are hardcoded in the W18 zone configuration file.

**ROMATSA Integration**

Direct data feed from Romanian Air Traffic Services. Currently the system uses OpenSky
(30-second delay). ROMATSA would provide:
- Near-real-time aircraft positions (2-5 second update)
- Squawk code assignment events (7700/7600/7500)
- ATC strip data for correlated flights

This requires a bilateral data sharing agreement between the operator and ROMATSA. Not
a technical dependency — a contractual one. Expected timeline: 6-12 months post W21.

### Long-Term (6-12 months post W21)

**W26: Predictive Threat Intelligence**

ML-based prediction of likely threat vectors based on:
- Historical detection patterns by time, zone, weather
- ACLED intelligence correlation (threat actor activity in region)
- OSINT feeds on drone procurement and capability

Output: a "tomorrow's risk" panel showing pre-shifted AWNING levels for next 24 hours.

**NATO/Allied Integration**

If APEX-SENTINEL is adopted at national level, integration with NATO NATINAMDS
(NATO Integrated Air and Missile Defence System) reporting standards. This would allow
AWNING level changes to automatically generate NATO MISREP-format reports.

Timeline: dependent on national procurement decision, not engineering timeline.

---

## Current Demo/Simulation Deprecation

The Ukraine-simulation components are deprecated at the start of W21:

| Component | Status after W21 |
|-----------|-----------------|
| `lib/simulation.ts` | Deprecated, not deleted (kept for reference) |
| `components/FdrpPanel.tsx` | Replaced by `components/IncidentDetailView.tsx` |
| `components/AlertFeed.tsx` | Replaced by `components/LiveAlertWorkflow.tsx` |
| `components/LiveMap.tsx` | Replaced by `components/ZoneMap.tsx` |
| `components/SystemStatus.tsx` | Replaced by `components/NetworkHealthPanel.tsx` |
| `components/WaveTimeline.tsx` | Removed — no equivalent in production UI |
| `app/api/viina/route.ts` | Removed — Ukraine data source, no production equivalent |
| `app/api/opensky/route.ts` | Superseded by `app/api/aircraft/route.ts` (via W21 API layer) |

`lib/simulation.ts` is kept in the repo but not imported by any W21 component. It can
be deleted in a cleanup commit after W21 acceptance testing is complete.

---

## Technology Decisions for Future Waves

The following decisions made in W21 have forward compatibility implications:

1. **SSE over WebSocket** — W22 mobile app should use the same `/api/stream` endpoint.
   WebSocket migration would be considered if bidirectional messaging is needed.

2. **Leaflet over Mapbox** — W23 historical analysis will also use Leaflet. Any future
   offline map tile capability should be implemented via a Leaflet tile server
   (e.g. self-hosted OpenStreetMap) rather than switching to Mapbox.

3. **Vercel deployment** — All future UI waves deploy to the same Vercel project.
   For multi-tenant (W24), this means a single shared deployment with organisation
   routing via subdomain or path prefix.

4. **TypeScript interfaces in `lib/types/w21.ts`** — Future waves extend this file.
   Do not create separate type files per wave; maintain a single UI type registry.

---

*Document version: W21-ROADMAP-v1.0*
*Status: APPROVED*
