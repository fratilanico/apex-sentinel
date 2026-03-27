# APEX-SENTINEL W18 — ROADMAP

## W18 Scope and Post-W18 Deferred Items

---

## W18 Deliverables (This Wave)

| FR | Component | Delivery Condition |
|----|-----------|-------------------|
| FR-W18-01 | EuDataFeedRegistry | DONE when: register/deregister/health/rate-limit pass 10+ unit tests |
| FR-W18-02 | AircraftPositionAggregator | DONE when: OpenSky+ADS-BX+adsb.fi merge, dedup by ICAO24, 15+ tests |
| FR-W18-03 | NotamIngestor | DONE when: ICAO NOTAM format parsed, GeoJSON polygon, 15+ tests |
| FR-W18-04 | EasaUasZoneLoader | DONE when: drone.rules.eu zones loaded, type classification, 12+ tests |
| FR-W18-05 | CriticalInfrastructureLoader | DONE when: 8 hardcoded zones + OSM dynamic, breach detection, 15+ tests |
| FR-W18-06 | AtmosphericConditionProvider | DONE when: flyability score 0-100, acoustic range factor, 12+ tests |
| FR-W18-07 | SecurityEventCorrelator | DONE when: ACLED+FIRMS+GDELT, proximity scoring, 15+ tests |
| FR-W18-08 | EuDataIntegrationPipeline | DONE when: orchestrates all 7, graceful degradation, health report, 15+ tests |
| geo/ utils | haversine + point-in-polygon + romania-bbox | Unit tested, used by W18 components |

**Total W18 tests: ≥ 160 new tests**
**Total post-W18: ≥ 3257 tests GREEN (3097 + 160)**

---

## W18 Completion Gates

Before W18 is marked COMPLETE:

- [ ] All 8 FRs implemented and tested
- [ ] `npx vitest run --coverage` passes with ≥80% on all W18 source files
- [ ] All 3097 pre-W18 tests remain GREEN (zero regressions)
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` succeeds
- [ ] At least 2 FRs tested against live APIs in dev (not just mocks)
- [ ] LKGC_TEMPLATE.md populated with verified working API endpoint snapshots
- [ ] SESSION_STATE.md updated with completion status

---

## W19 — Ground Station & Remote ID Layer (Deferred from W18)

**Why deferred**: Remote ID ground station requires hardware (SDR + ASTM F3411 decoder) and a physical deployment in Romania. W18 is a pure-software wave with free API access only.

### W19 Planned Scope

**FR-W19-01: RemoteIdReceiver (EU/ASTM F3411-22a)**
- Receive DJI OcuSync 3.0 and WiFi NAN / BLE 5.0 Remote ID broadcasts
- Decode ASTM F3411-22a Message Packs (Basic ID, Location, System, Operator ID)
- Cross-reference against EASA UAS operator registry
- Emit `RemoteIdContact` with operator registration status

**FR-W19-02: MarineTraffic AIS Integration (Black Sea)**
- AIS track correlation for vessel-based drone launch risk (Constanța port)
- Requires MarineTraffic real-time API (paid tier, ~€50/month)
- Emit `VesselProximityEvent` when vessel enters port exclusion zone

**FR-W19-03: Eurocontrol MUAC Upper Airspace Feed**
- MUAC ATC surveillance data for aircraft above FL100
- Requires Eurocontrol SWIM (System Wide Information Management) NDA
- Provides definitive cooperative contact suppression above 3000m

**FR-W19-04: OpenCelliD RF Noise Floor Integration**
- Download OpenCelliD CSV for Romania (opencellid.org/downloads)
- Build cell tower density map by sector (0.1° grid)
- Estimate RF noise floor per sector for W5/W6 RF classifier calibration

**FR-W19-05: AI Weight Retuning Pipeline**
- After W18 goes live with real ADS-B data, collect 30-day baseline
- Re-tune W8 ThreatProbabilityEngine weights (w1–w7) against real detection/false-positive data
- Update data-drift.test.cjs baseline distributions for real EU input

**FR-W19-06: Supabase Audit Trail (DPIA-approved)**
- If DPIA approved: `feed_snapshots` table with 24h TTL
- Row Level Security: only APEX OS operators can read
- pg_cron auto-delete job for entries older than 24h

---

## W20 — Multi-Country EU Expansion (Deferred from W18/W19)

**Why deferred**: W18/W19 focus on Romania as the primary deployment market. EU expansion requires per-country U-space zone loading and NOTAM FIR coverage for each ECAC state.

### W20 Planned Scope

**FR-W20-01: Multi-Country UAS Zone Support**
- EasaUasZoneLoader extended to accept `countryCode[]` parameter
- Support: RO (W18 baseline), HU, BG, MD, UA (border monitoring)
- NOTAM FIRs: LRBB (Bucharest), LHCC (Budapest), LBSR (Sofia), UKBV (Kyiv)

**FR-W20-02: EUROCONTROL NM B2B API Integration**
- EUROCONTROL Network Manager Business-to-Business API
- Real-time European airspace restriction data
- Requires EUROCONTROL ESSP (En-Route Supplementary Service Provider) agreement

**FR-W20-03: EU Alert Distribution**
- Euroalert (EU-ALERT) integration for cross-border security events
- NATO EWIS (Early Warning Information System) protocol adapter
- Requires separate security clearance review

**FR-W20-04: Cross-Border Threat Tracking**
- Multi-country mesh node correlation (W11/W12 extended)
- Contact handoff across Romanian border checkpoints
- Requires bilateral data sharing agreements

---

## W21 — Autonomous Response Integration (Long-term)

**Important**: All W21 items require regulatory approval (EASA, Romanian MoI, NATO SHAPE as applicable). W18/W19/W20 are exclusively passive detection and alerting.

### W21 Planned Scope (subject to regulatory approval)

- RF countermeasure coordination (frequency recommendation only, not jamming)
- Automated NOTAM filing for detected restricted area violations
- Integration with Romanian Police Aviation Unit dispatch system
- Integration with Romanian Air Force Air Operations Center (subject to MoU)

---

## Known Technical Debt Created by W18

| Debt Item | Created By | Resolution Wave |
|-----------|-----------|----------------|
| OpenMeteoClient coordinates hardcoded in W9 | W18 reconfigures via pipeline constructor | W19: move to env var `OPENMETEO_LAT`/`OPENMETEO_LON` |
| W8 threat weights not calibrated for real EU data | W18 introduces real data | W19: weight retuning pipeline |
| data-drift.test.cjs baseline from simulation | W18 changes input distribution | W19: re-baseline after 30d real data |
| GDPR DPIA not yet filed with ANSPDCP | W18 marks as needed | Pre-production deployment |
| ACLED `geometricMean` heuristic for Romania is SE_EUROPE not RO-only | FR-W18-07 uses SE_EUROPE bbox | W19: add per-country filtering |

---

## Timeline Estimate

| Wave | Theme | Estimated Duration |
|------|-------|-------------------|
| W18 | EU Data Integration Layer | 2–3 days |
| W19 | Ground Station + Remote ID + Retuning | 3–4 days |
| W20 | Multi-Country EU Expansion | 5–7 days |
| W21 | Autonomous Response (regulatory-gated) | TBD (regulatory approval required) |

W18 is the critical path item. Without real EU data flowing, W19 weight retuning cannot begin.
