# APEX-SENTINEL W18 — SESSION STATE
# EU Data Integration Layer
# Wave: W18 | Status: INIT — Documentation Phase | Date: 2026-03-27

---

## Wave Status Summary

| Wave | Theme | Status | Tests |
|------|-------|--------|-------|
| W1 | Core detection engine | COMPLETE | 180 |
| W2 | RF signal processing | COMPLETE | 162 |
| W3 | Acoustic detection | COMPLETE | 158 |
| W4 | Threat classification | COMPLETE | 175 |
| W5 | Alert routing | COMPLETE | 168 |
| W6 | Operator dashboard | COMPLETE | 154 |
| W7 | NATS event bus | COMPLETE | 162 |
| W8 | Multi-sensor fusion | COMPLETE | 170 |
| W9 | Data feed broker | COMPLETE | 160 |
| W10 | Privacy & GDPR layer | COMPLETE | 165 |
| W11 | NATO integration | COMPLETE | 158 |
| W12 | ML threat scoring | COMPLETE | 172 |
| W13 | Resilience & chaos | COMPLETE | 160 |
| W14 | Mobile operator app | COMPLETE | 155 |
| W15 | Mesh relay network | COMPLETE | 148 |
| W16 | Edge deployment optimization | COMPLETE | 99 |
| W17 | Demo & hackathon prep | COMPLETE | 158 |
| **W18** | **EU Data Integration Layer** | **INIT — docs** | **0 (target: ~160)** |

**Total tests at W18 start: 3,097 across 214 test files — ALL GREEN**

---

## W18 Objective

Replace the 2-feed mock data setup (adsb-exchange-client.ts + gdelt-client.ts) with a
production-grade EU open-source data pipeline covering 15+ real feeds. This wave
directly addresses the gap identified at wave-end: APEX-SENTINEL was using simulated
ADS-B data and a static GDELT query. W18 makes the system genuinely real-data capable
for a Romania/EU operational context.

### Primary Goal
8 new feed adapter classes, each with 15-25 unit tests, fully green before PR merge.
Total target: ~160 new tests. Maintain 3,097+ baseline with zero regressions.

### Secondary Goal
Produce documentation accurate enough that a junior engineer can implement W18 from
these docs without needing clarification. The PROJECTAPEX 20-doc suite achieves this.

---

## Current State: 2026-03-27

### Completed in this session
- [x] Wave W18 directory created: `docs/waves/W18/`
- [x] All 20 PROJECTAPEX docs initiated (17 written in prior docs pass)
- [x] ACCEPTANCE_CRITERIA.md — complete (8 FRs, 40 scenarios, performance gates, GDPR)
- [x] DECISION_LOG.md — complete (10 architectural decisions, full rationale)
- [x] SESSION_STATE.md — this file
- [x] ARTIFACT_REGISTRY.md — complete (all source + test files with TypeScript interfaces)

### Not yet started
- [ ] wave-formation.sh plan W18
- [ ] wave-formation.sh tdd-red W18
- [ ] wave-formation.sh execute W18
- [ ] Source files in `src/feeds/` (0 of 15 written)
- [ ] Source files in `src/geo/` (0 of 5 written)
- [ ] Test files in `tests/feeds/` (0 of 8 written)
- [ ] wave-formation.sh checkpoint W18
- [ ] wave-formation.sh complete W18

---

## Context: Two Parallel Tracks

### Track 1: Hackathon Demo Fix (separate session, higher priority)
**Deadline: 2026-03-28 (tomorrow)**
- The `apex-sentinel-demo` Vercel app needs to be de-Ukraine-ified
- Remove Ukraine simulation, replace with Romania/EU civilian use case
- Fix the EUDIS compliance demo layer for the judge presentation
- This is running in a separate Claude session — DO NOT mix W18 code with Track 1 fixes

### Track 2: W18 Full Product Wave (this session)
**Target: Complete W18 by 2026-03-31**
- Full TDD red-green cycle for all 8 FRs
- Real API integrations tested against live endpoints (with caching for CI)
- No mock data for the core feed adapters (mocks only in unit test harnesses)

---

## API Credentials Required for W18

The following environment variables must be set before W18 execute phase:

| Variable | Feed | Source | Required? |
|----------|------|--------|-----------|
| `OPENSKY_USERNAME` | OpenSky Network | Free registration at opensky-network.org | Optional (raises limit from 400 to 4000/day) |
| `OPENSKY_PASSWORD` | OpenSky Network | Same as above | Optional |
| `ADSBEXCHANGE_API_KEY` | ADS-B Exchange | adsbexchange.com/data | Optional (has free tier) |
| `FAA_CLIENT_ID` | FAA NOTAM API | api.faa.gov/signup | Required for NOTAM ingest |
| `FAA_CLIENT_SECRET` | FAA NOTAM API | Same as above | Required for NOTAM ingest |
| `OPENWEATHER_API_KEY` | OpenWeatherMap | openweathermap.org/api | Required for weather fallback |
| `ACLED_API_KEY` | ACLED | developer.acleddata.com | Required for security events |
| `ACLED_EMAIL` | ACLED | Same as above | Required (included in API calls) |
| `FIRMS_MAP_KEY` | NASA FIRMS | firms.modaps.eosdis.nasa.gov | Optional (anonymous tier exists) |

Note: adsb.fi and Open-Meteo require NO API key. GDELT requires NO API key.
All keys stored in `.env.local` (gitignored). See DEPLOY_CHECKLIST.md for provisioning steps.

---

## Hackathon Context

**Deadline: 2026-03-28**
**Hackathon: EUDIS Innovation Challenge (European Defence Innovation Symposium)**
**Track: Civilian UAS threat detection, EU regulatory compliance**

W17 was completed specifically for the hackathon demo. W18 was planned as a post-hackathon
full-product wave, but the hackathon demo uses a stub that references W18 capabilities.
The judges will see W17 demo output. W18 is the real implementation.

Key demo claims that W18 must make real:
- "Monitors 15+ EU open-source feeds" — W18 delivers exactly 15 feed adapters
- "Covers Henri Coanda, Cernavoda, Deveselu and 3 more protected sites" — FR-W18-05 delivers these
- "GDPR-compliant, no flight path storage" — DEC-W18-09 and AC-GDPR-02 enforce this
- "Real-time atmospheric flyability scoring" — FR-W18-06 delivers this

---

## W1-W17 Final State

### Test Count by Wave (at W17 completion)
```
W1:  180  W2:  162  W3:  158  W4:  175  W5:  168
W6:  154  W7:  162  W8:  170  W9:  160  W10: 165
W11: 158  W12: 172  W13: 160  W14: 155  W15: 148
W16:  99  W17: 158
─────────────────────────────────────────────────
Total: 3,097 tests across 214 test files — ALL GREEN
```

### Last Known Good Commit
- Branch: main
- Commit: a3fb26c (W16 final), then W17 additions
- All W17 tests passing before W18 work begins

### Mind-the-Gap Check (W17 completion)
- 19/19 gap items resolved
- No outstanding architectural debt entering W18
- Open-Meteo and GDELT clients exist in `src/feeds/` as stubs — W18 replaces and extends

---

## W18 Implementation Plan (Abbreviated)

### Phase 1: TDD Red (all 8 test files, all failing)
Write tests for FR-W18-01 through FR-W18-08 before writing any implementation.
Target: 8 test files, ~160 tests, all RED (import errors / not implemented).
Command: `./wave-formation.sh tdd-red W18`

### Phase 2: Execute (implement each FR in order)
Implement source files in dependency order:
1. `src/geo/romania-bbox.ts` — constants, no dependencies
2. `src/geo/protected-zone-registry.ts` — hardcoded critical sites
3. `src/feeds/eu-data-feed-registry.ts` — FR-W18-01 (registry, health, budget)
4. `src/feeds/opensky-adapter.ts` — OpenSky REST client
5. `src/feeds/adsbexchange-adapter.ts` — ADS-B Exchange client
6. `src/feeds/adsbfi-adapter.ts` — adsb.fi backup client
7. `src/feeds/aircraft-position-aggregator.ts` — FR-W18-02 (merge + dedup)
8. `src/feeds/notam-parser.ts` — ICAO NOTAM text parser
9. `src/feeds/notam-ingestor.ts` — FR-W18-03 (FAA API + cache)
10. `src/feeds/easa-uas-zone-loader.ts` — FR-W18-04
11. `src/geo/osm-overpass-client.ts` — Overpass API wrapper
12. `src/geo/critical-infrastructure-loader.ts` — FR-W18-05
13. `src/feeds/atmospheric-condition-provider.ts` — FR-W18-06 (Open-Meteo + OWM)
14. `src/feeds/openweathermap-adapter.ts` — OWM normalisation adapter
15. `src/feeds/acled-adapter.ts` — ACLED API client
16. `src/feeds/firms-adapter.ts` — NASA FIRMS client
17. `src/feeds/gdelt-adapter.ts` — GDELT fixed Romania query (extends existing stub)
18. `src/geo/zone-breach-detector.ts` — Haversine + ray-casting
19. `src/feeds/security-event-correlator.ts` — FR-W18-07
20. `src/feeds/eu-data-integration-pipeline.ts` — FR-W18-08 (orchestrator)

### Phase 3: Checkpoint
All 8 test suites GREEN. Baseline 3,097 + new W18 tests all GREEN.
Run: `npx vitest run --coverage` + `npx tsc --noEmit`
Command: `./wave-formation.sh checkpoint W18`

### Phase 4: Complete
Push to main. Update MEMORY.md. Update project_apex_sentinel.md.
Command: `./wave-formation.sh complete W18`

---

## Next Session Action Items

When this session is resumed for W18 execute phase:

1. Run `./wave-formation.sh plan W18` — generates wave plan doc
2. Run `./wave-formation.sh tdd-red W18` — creates failing test files
3. Verify test count: `npx vitest run 2>&1 | tail -5` — should show 3097 passing, 8 new suites failing
4. Implement source files per the order in Phase 2 above
5. After each FR is implemented, run its test suite: `npx vitest run tests/feeds/FR-W18-0N-*`
6. After all 8 FRs pass: run full suite and coverage check
7. Commit and push

---

## Key Decisions Summary (from DECISION_LOG.md)

| Decision | Choice | Key Reason |
|----------|--------|------------|
| Primary ADS-B source | OpenSky Network | Free, permissive ToS, 4000/day registered |
| Secondary ADS-B | ADS-B Exchange | Unfiltered, includes military traffic |
| Tertiary ADS-B | adsb.fi | Free, no key, emergency fallback |
| UAS zones source | EASA drone.rules.eu | Official EU regulatory alignment |
| Infrastructure GIS | OSM Overpass API | Free, accurate, ODbL license |
| Security events | ACLED (primary) + GDELT (secondary) + FIRMS | Structured data + near-real-time |
| NOTAM source | FAA NOTAM API for LRBB FIR | No ROMATSA/EAD public API exists |
| Distance computation | Pure Haversine TypeScript | Zero dependencies, adequate accuracy |
| Flight path storage | No storage — real-time only | GDPR Article 5(1)(c) data minimisation |
| Cache TTL | Per-feed differentiated (30s to 72h) | Match data volatility per source |

---

## Known Risks Entering W18

| Risk | Probability | Mitigation |
|------|-------------|------------|
| OpenSky 400 req/day anon limit exhausted | HIGH (30s polling = 2880 req/day) | Register account (free, 4000/day limit) |
| drone.rules.eu Romania zone data incomplete | MEDIUM | 24h cache; hardcode critical airport zones |
| FAA API credentials not provisioned before tdd-red | MEDIUM | Use mock HTTP client in unit tests |
| ACLED free tier rate limit hit | LOW | 200 req/day budget limit; ACLED data cached 6h |
| OSM Overpass slow/timeout during CI | MEDIUM | CI tests use recorded fixtures; no live Overpass in CI |
| W18 takes > 3 days due to complexity | MEDIUM | 20 source files is significant scope; prioritise FR-01 through FR-03 first |

---

## Reference: Romanian Protected Sites (Hardcoded in protected-zone-registry.ts)

These 6 sites are hardcoded as a baseline — they must exist regardless of OSM availability:

| Site | ICAO / ID | Lat | Lon | Radius (m) | Multiplier | Type |
|------|-----------|-----|-----|------------|------------|------|
| Henri Coanda Intl Airport | LROP | 44.5711 | 26.0850 | 5000 | 3.0 | airport_international |
| Cluj-Napoca Intl Airport | LRCL | 46.7850 | 23.6862 | 5000 | 3.0 | airport_international |
| Timisoara Traian Vuia Intl | LRTR | 45.8099 | 21.3379 | 5000 | 3.0 | airport_international |
| Mihail Kogalniceanu NATO Base | LRCK | 44.3622 | 28.4883 | 2500 | 4.0 | military_nato |
| Cernavoda Nuclear Power Plant | CNPP | 44.3283 | 28.0572 | 3000 | 5.0 | nuclear |
| Deveselu NATO Aegis Ashore | DEVA | 44.0817 | 24.1386 | 2500 | 4.0 | military_nato |

Romania bounding box (ROMANIA_BBOX):
- `south: 43.618` — Sfanta Ana, southernmost point
- `west: 20.261` — Beba Veche, westernmost point
- `north: 48.265` — Horodisteanu, northernmost point
- `east: 29.757` — Sulina (Danube delta), easternmost point

---

*End of SESSION_STATE.md*
*APEX-SENTINEL W18 — EU Data Integration Layer*
*2026-03-27 | Status: INIT*
