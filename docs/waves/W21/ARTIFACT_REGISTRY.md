# W21 ARTIFACT REGISTRY — Production Operator UI

## Registry Format

Each artifact is listed with:
- Path (relative to apex-sentinel-demo repo root)
- Type: NEW | REPLACE | MODIFY | DEPRECATE
- FR: which functional requirement it serves
- Status: PLANNED | IN_PROGRESS | COMPLETE

---

## Application Entry Points

| Path | Type | FR | Description |
|------|------|----|-------------|
| app/page.tsx | REPLACE | All | Production dashboard root (removes simulation loop) |
| app/layout.tsx | MODIFY | All | Add JetBrains Mono font import, CSP nonce |
| app/dashboard/page.tsx | NEW | All | Optional standalone dashboard route |

---

## API Routes (11 new/replaced)

| Path | Type | FR | Backend |
|------|------|----|---------|
| app/api/aircraft/route.ts | NEW | FR-W21-08 | W18 AircraftPositionAggregator |
| app/api/notams/route.ts | NEW | FR-W21-08 | W18 NotamIngestor |
| app/api/zones/route.ts | NEW | FR-W21-08 | W18 EasaUasZoneLoader + W19 AWNING |
| app/api/weather/route.ts | NEW | FR-W21-08 | W18 AtmosphericConditionProvider |
| app/api/security-events/route.ts | NEW | FR-W21-08 | W18 SecurityEventCorrelator |
| app/api/alerts/route.ts | REPLACE | FR-W21-08 | W20 AlertAcknowledgmentEngine |
| app/api/alerts/[id]/acknowledge/route.ts | NEW | FR-W21-08 | W20 AlertAcknowledgmentEngine |
| app/api/incidents/route.ts | NEW | FR-W21-08 | W20 IncidentManager |
| app/api/health/route.ts | NEW | FR-W21-08 | W16 SystemHealthDashboard + W18 |
| app/api/compliance/route.ts | NEW | FR-W21-08 | W19 GDPR + W20 SlaComplianceTracker |
| app/api/stream/route.ts | NEW | FR-W21-08 | W18-W20 event stream (SSE) |

---

## Components (Map)

| Path | Type | FR | Description |
|------|------|----|-------------|
| components/ZoneMap.tsx | NEW | FR-W21-01 | Leaflet map container, SSR-guarded |
| components/AircraftLayer.tsx | NEW | FR-W21-01 | Aircraft markers with threat score colours |
| components/ThreatTrackLayer.tsx | NEW | FR-W21-01 | Animated threat track markers |
| components/NotamLayer.tsx | NEW | FR-W21-01 | Hatched NOTAM polygon overlays |
| components/EasaUasZoneLayer.tsx | NEW | FR-W21-01 | EASA UAS zone polygons |
| components/WeatherOverlay.tsx | NEW | FR-W21-01 | Visibility/wind overlay on map |
| components/MapLayerControls.tsx | NEW | FR-W21-01 | Toggle panel for map layers |
| components/ZoneDetailPanel.tsx | NEW | FR-W21-01 | Click-to-open zone info panel |
| components/AircraftDetailPanel.tsx | NEW | FR-W21-01 | Click-to-open aircraft info panel |
| components/MapSkeleton.tsx | NEW | FR-W21-01 | Loading placeholder for SSR-guarded map |

---

## Components (Alerts)

| Path | Type | FR | Description |
|------|------|----|-------------|
| components/LiveAlertWorkflow.tsx | NEW | FR-W21-02 | Full alert panel with filters and list |
| components/AlertCard.tsx | NEW | FR-W21-02 | Individual alert card with SLA countdown |
| components/SlaCountdown.tsx | NEW | FR-W21-02 | Countdown timer with colour transitions |
| components/AlertFilterBar.tsx | NEW | FR-W21-02 | Zone / severity / status filter controls |

---

## Components (Incidents)

| Path | Type | FR | Description |
|------|------|----|-------------|
| components/IncidentDetailView.tsx | NEW | FR-W21-03 | Incident list with badges |
| components/IncidentCard.tsx | NEW | FR-W21-03 | Individual incident summary card |
| components/IncidentDetailDrawer.tsx | NEW | FR-W21-03 | Full incident detail slide-in |
| components/IncidentTimeline.tsx | NEW | FR-W21-03 | Chronological timeline component |
| components/InvolvedAircraftList.tsx | NEW | FR-W21-03 | ICAO24 list with threat scores |
| components/ExportPdfButton.tsx | NEW | FR-W21-03 | Triggers window.print() with print CSS |

---

## Components (Network Health)

| Path | Type | FR | Description |
|------|------|----|-------------|
| components/NetworkHealthPanel.tsx | NEW | FR-W21-04 | Full network health view |
| components/SystemHealthGauge.tsx | NEW | FR-W21-04 | 0-100 score display |
| components/SensorNodeGrid.tsx | NEW | FR-W21-04 | 7-node status grid |
| components/SensorNodeCard.tsx | NEW | FR-W21-04 | Individual sensor status |
| components/FeedHealthGrid.tsx | NEW | FR-W21-04 | 8-feed health table |
| components/CoverageMap.tsx | NEW | FR-W21-04 | Mini Leaflet coverage map |

---

## Components (NOTAM)

| Path | Type | FR | Description |
|------|------|----|-------------|
| components/LiveNotamOverlay.tsx | NEW | FR-W21-05 | NOTAM drawer with filter and list |
| components/NotamCard.tsx | NEW | FR-W21-05 | Individual NOTAM card |
| components/NotamFilterBar.tsx | NEW | FR-W21-05 | Airport + type filter controls |

---

## Components (Weather)

| Path | Type | FR | Description |
|------|------|----|-------------|
| components/AtmosphericFlightConditions.tsx | NEW | FR-W21-06 | Weather widget + forecast |
| components/FlyabilityScore.tsx | NEW | FR-W21-06 | Score with colour + label |
| components/WeatherForecastChart.tsx | NEW | FR-W21-06 | Recharts 6h forecast line chart |

---

## Components (Compliance)

| Path | Type | FR | Description |
|------|------|----|-------------|
| components/ComplianceDashboard.tsx | NEW | FR-W21-07 | Full compliance view |
| components/GdprStatusPanel.tsx | NEW | FR-W21-07 | GDPR retention/anonymisation panel |
| components/EasaStatusPanel.tsx | NEW | FR-W21-07 | EASA zones + category accuracy |
| components/SlaCompliancePanel.tsx | NEW | FR-W21-07 | SLA metrics panel |

---

## Shared Components

| Path | Type | FR | Description |
|------|------|----|-------------|
| components/TopBar.tsx | REPLACE | All | New tab structure: ZONE MAP / INCIDENTS / NETWORK / COMPLIANCE |
| components/AwningLevelBadge.tsx | NEW | All | Reusable AWNING level coloured badge |
| components/AwningLevelSummary.tsx | NEW | FR-W21-01 | Zone count summary in TopBar |
| components/SystemClock.tsx | NEW | All | Live clock in TopBar, JetBrains Mono |
| components/ConnectionStatusIndicator.tsx | NEW | FR-W21-02 | SSE connection health indicator |

---

## Library Files

| Path | Type | FR | Description |
|------|------|----|-------------|
| lib/types/w21.ts | NEW | All | All TypeScript interfaces for W21 |
| lib/api-client.ts | NEW | All | Typed fetch wrappers for all 11 routes |
| lib/sse-client.ts | NEW | FR-W21-02 | EventSource wrapper with reconnection |
| lib/awning-colours.ts | NEW | All | AWNING level → colour mapping utilities |
| lib/format-utils.ts | NEW | All | Date/time/distance/score formatters |

---

## Test Files

| Path | FR | Test count |
|------|----|-----------|
| __tests__/components/AlertCard.test.tsx | FR-W21-02 | 3 |
| __tests__/components/LiveAlertWorkflow.test.tsx | FR-W21-02 | 5 |
| __tests__/components/SlaCountdown.test.tsx | FR-W21-02 | 3 |
| __tests__/components/IncidentDetailView.test.tsx | FR-W21-03 | 7 |
| __tests__/components/NetworkHealthPanel.test.tsx | FR-W21-04 | 7 |
| __tests__/components/LiveNotamOverlay.test.tsx | FR-W21-05 | 6 |
| __tests__/components/AtmosphericFlightConditions.test.tsx | FR-W21-06 | 6 |
| __tests__/components/ComplianceDashboard.test.tsx | FR-W21-07 | 7 |
| __tests__/components/ZoneManagementDashboard.test.tsx | FR-W21-01 | 5 |
| __tests__/api/aircraft.test.ts | FR-W21-08 | 2 |
| __tests__/api/notams.test.ts | FR-W21-08 | 1 |
| __tests__/api/zones.test.ts | FR-W21-08 | 1 |
| __tests__/api/weather.test.ts | FR-W21-08 | 1 |
| __tests__/api/security-events.test.ts | FR-W21-08 | 1 |
| __tests__/api/alerts.test.ts | FR-W21-08 | 2 |
| __tests__/api/alerts-acknowledge.test.ts | FR-W21-08 | 2 |
| __tests__/api/incidents.test.ts | FR-W21-08 | 1 |
| __tests__/api/health.test.ts | FR-W21-08 | 1 |
| __tests__/api/compliance.test.ts | FR-W21-08 | 1 |
| __tests__/api/stream.test.ts | FR-W21-08 | 1 |
| __tests__/integration/ZoneMap.integration.test.tsx | FR-W21-01 | 5 |
| __tests__/integration/acknowledge-flow.test.tsx | FR-W21-02 | 3 |
| __tests__/accessibility/dashboard.a11y.test.tsx | All | 4 |
| __tests__/mocks/handlers.ts | All | (mock, not test) |
| __tests__/mocks/fixtures.ts | All | (mock, not test) |
| __tests__/mocks/sse.ts | All | (mock, not test) |

**Total test files: 24 (21 test files + 3 mock utility files)**
**Total tests: 71**

---

## Configuration Files Modified

| Path | Type | Change |
|------|------|--------|
| tailwind.config.ts | MODIFY | Add apex-* colour tokens, JetBrains Mono font |
| next.config.ts | MODIFY | Add CSP header, revalidate cache directives |
| package.json | MODIFY | Add devDependencies: @testing-library/react, @testing-library/user-event, @testing-library/jest-dom, msw, vitest-axe, @vitest/coverage-v8, happy-dom |
| vitest.config.ts | MODIFY | Set environment to happy-dom, add coverage thresholds, add setupFiles |
| vitest.setup.ts | NEW | Leaflet mock, MSW server setup, jest-dom matchers |
| tsconfig.json | MODIFY | Ensure paths alias for @/ resolves to project root |

---

## Deprecated Artifacts (Not Deleted, Not Imported)

| Path | Reason |
|------|--------|
| lib/simulation.ts | Ukraine-simulation logic, replaced by real API data |
| components/FdrpPanel.tsx | Replaced by IncidentDetailView.tsx |
| components/AlertFeed.tsx | Replaced by LiveAlertWorkflow.tsx |
| components/LiveMap.tsx | Replaced by ZoneMap.tsx |
| components/SystemStatus.tsx | Replaced by NetworkHealthPanel.tsx |
| components/WaveTimeline.tsx | No production equivalent |
| app/api/viina/route.ts | Ukraine data source, decommissioned |
| app/api/opensky/route.ts | Superseded by app/api/aircraft/route.ts |

---

## Total Artifact Count

| Category | Count |
|----------|-------|
| New API routes | 11 |
| Replaced API routes | 1 |
| New components | 38 |
| Replaced components | 2 |
| New lib files | 5 |
| Modified config files | 5 |
| New config files | 1 |
| New test files | 21 |
| New mock/fixture files | 3 |
| **Total new/modified files** | **87** |

---

*Document version: W21-ARTIFACT_REGISTRY-v1.0*
*Status: PLANNED*
