# APEX-SENTINEL W18 — RISK REGISTER
# EU Data Integration Layer

**Wave:** W18
**Date:** 2026-03-27
**Owner:** Nico Fratila
**Status:** ACTIVE

---

## Summary Table

| ID | Risk | Probability | Impact | Net Severity | Status |
|----|------|-------------|--------|--------------|--------|
| R-W18-01 | OpenSky anon rate limit (400 req/day, demo polls at 15s = 5,760) | HIGH | HIGH | CRITICAL | MITIGATED |
| R-W18-02 | NOTAM API format change — FAA NOTAM v2 may change schema | MEDIUM | HIGH | HIGH | MITIGATED |
| R-W18-03 | GDPR Art.5/6 — tracking individual aircraft without consent | MEDIUM | HIGH | HIGH | MITIGATED |
| R-W18-04 | EASA UAS zone API unavailability (drone.rules.eu third-party) | MEDIUM | MEDIUM | MEDIUM | MITIGATED |
| R-W18-05 | OSM military data quality — incomplete/incorrect for sensitive sites | HIGH | MEDIUM | HIGH | MITIGATED |
| R-W18-06 | OpenWeatherMap free tier (1,000 req/day) exhausted by multiple instances | LOW | LOW | LOW | ACCEPTED |
| R-W18-07 | ACLED API key requirement — gated registration, not instant | HIGH | LOW | MEDIUM | MITIGATED |
| R-W18-08 | Feed avalanche failure — 4+ feeds down simultaneously | LOW | HIGH | HIGH | MITIGATED |
| R-W18-09 | TypeScript ESM import extensions — .js required, new files may omit | MEDIUM | MEDIUM | MEDIUM | MITIGATED |
| R-W18-10 | Test isolation — unit tests making real HTTP calls | HIGH | MEDIUM | HIGH | MITIGATED |
| R-W18-11 | NOTAM propagation lag from ROMATSA via FAA | MEDIUM | LOW | LOW | ACCEPTED |
| R-W18-12 | FIRMS false positives — agricultural burning in Bărăgan plain | HIGH | LOW | LOW | MITIGATED |
| R-W18-13 | Overpass API rate limiting during OSM batch queries | MEDIUM | MEDIUM | MEDIUM | MITIGATED |
| R-W18-14 | AircraftState memory pressure — unfiltered ADSB payloads | MEDIUM | MEDIUM | MEDIUM | MITIGATED |

---

## Risk Details

---

### R-W18-01: OpenSky Anonymous Rate Limit

**Risk:** OpenSky Network anonymous (unauthenticated) tier is limited to 400 API requests per 24-hour window. If the demo polls at 15-second intervals: `(24h × 60min × 60s) / 15s = 5,760 requests/day` — 14× over the anonymous limit. The API returns HTTP 429 after exhaustion and blocks the entire aircraft feed, leaving the pipeline blind to airspace activity.

**Probability:** HIGH — any demo run longer than ~1.5 hours at 15s polling will exhaust the quota.

**Impact:** HIGH — aircraft position feed is the primary correlation source for W9 `RfSessionTracker` and W12 `RfFusionEngine`. Loss causes those engines to operate without ADS-B corroboration, degrading threat assessment confidence.

**Mitigation:**
1. **15-minute server-side cache** in `AircraftPositionAggregator`: cache result of each OpenSky poll for 900s. Effective request rate drops from 1/15s to 1/900s = 96 req/day — well within anonymous limit.
2. **Authenticated endpoint** for production deployment: OpenSky free account provides 4,000 req/day. Credentials injected via `OPENSKY_USERNAME` / `OPENSKY_PASSWORD` env vars; `AircraftPositionAggregator` uses basic auth header when present.
3. **adsb.fi as primary fallback**: adsb.fi has no documented rate limit for the public JSON API (data is 30s delayed). When OpenSky returns 429, `AircraftPositionAggregator.poll()` automatically promotes adsb.fi to primary.
4. **ADS-B Exchange** as tertiary: requires `rapidapi-key` header; key stored in env var `ADSBX_API_KEY`. Falls back to adsb.fi if key absent.

**Residual risk:** LOW — with 15min cache and adsb.fi fallback, Romanian airspace coverage is maintained even at zero OpenSky quota.

---

### R-W18-02: NOTAM API Format Change

**Risk:** The FAA NOTAM API migrated from v1 to v2 in 2023 with a breaking JSON schema change (field rename: `icaoMessage` → `coreNOTAMData.notam`). A future schema revision would silently break `NotamParser`, returning empty `NotamRestriction[]` without an error — the worst failure mode because callers assume data is current.

**Probability:** MEDIUM — FAA NOTAM API is actively maintained; v2 has been stable since 2023 but API is in active development per FAA Digital Services changelog.

**Impact:** HIGH — silent failure: restricted airspace goes undetected, potentially allowing the system to classify a drone in a NOTAM-restricted zone as non-threatening.

**Mitigation:**
1. **Parser isolation**: all field extraction is in `notam-parser.ts` (pure function, no I/O). When the API schema changes, only one file changes.
2. **Contract tests against known NOTAM strings**: test suite includes 3 hardcoded real-world NOTAM strings (captured 2026-03-27) that serve as regression anchors. If the parser breaks on known input, CI fails immediately.
3. **Schema version detection**: `NotamIngestor` checks for presence of `coreNOTAMData.notam` in the first response item. If absent, logs `WARN: notam_schema_unexpected_format` and falls back to attempting v1-style `icaoMessage` field before throwing `NotamParseError`.
4. **Version pin in API URL**: URL includes `?api_version=2` query param; breaking upgrade to v3 would require an explicit URL change caught in code review.

**Residual risk:** LOW for detection; MEDIUM for silent failure window — monitoring on `notam_parse_error_rate` metric closes this gap.

---

### R-W18-03: GDPR Article 5/6 — Aircraft Position Tracking

**Risk:** Aircraft position data from OpenSky/ADS-B Exchange includes `callsign` and `icao24`, which can be linked to specific aircraft registrations, routes, and operators. Continuous storage of this data without a lawful basis under GDPR Article 6 would constitute unlawful processing, exposing the system to enforcement action by ANSPDCP (Romania's DPA) under Article 83 fines (up to €20M or 4% global turnover).

**Probability:** MEDIUM — ADS-B data is publicly broadcast and processing for safety/security purposes has a strong legitimate interest basis under Art.6(1)(f), but Category-A commercial UAS tracking may require explicit consent.

**Impact:** HIGH — regulatory enforcement risk; reputational risk for hackathon/INDIGO presentation if data handling is questioned.

**Mitigation:**
1. **No persistent flight path storage**: `AircraftPositionAggregator` holds positions in memory only; they are not written to Supabase, log files, or any persistent store. `getLastSnapshot()` returns current state only — no history.
2. **30-second anonymisation**: `AircraftState` entries for Category-A commercial UAS (identified by `callsign` matching commercial prefix patterns) have `callsign` nulled after 30s in memory.
3. **Bounding box minimisation**: only aircraft within the Romania bbox are loaded. GDPR data minimisation principle (Art.5(1)(c)) satisfied by not requesting or storing data on aircraft outside Romanian airspace.
4. **Legitimate interest basis documented**: processing is for national security/critical infrastructure protection purposes — Romania's National Security Law (51/1991) provides additional lawful basis for operators engaged in civilian drone detection.
5. **ANSPDCP guidance applied**: DPA Romania has issued guidance that ADS-B processing for safety purposes falls under Art.6(1)(e) (public interest task); document this in `PRIVACY_ARCHITECTURE.md`.

**Residual risk:** LOW for hackathon/demo context. MEDIUM for production deployment requiring formal DPIA.

---

### R-W18-04: EASA UAS Zone API Availability

**Risk:** `drone.rules.eu` is operated by the DroneRules project (a Eurocontrol-adjacent initiative), not by EASA directly. It has no published SLA, has had unscheduled outages of 2–24 hours historically, and could be discontinued without notice. Relying on it as the sole source of U-space zone data leaves the system unable to classify drone zone breaches during outages.

**Probability:** MEDIUM — observed one multi-hour outage in 2025; no redundant official EASA API exists for U-space zones.

**Impact:** MEDIUM — zone classification fails, causing `StageClassifier` to receive no `adsbCorrelated` zone-breach signal. Existing acoustic/RF pipelines continue; only zone-context enrichment is lost.

**Mitigation:**
1. **24-hour local cache**: `EasaUasZoneLoader` persists last successful zone set in memory (and optionally to a temp JSON file). On API failure, cache is served until TTL expires.
2. **Hardcoded Romanian baseline exclusion zones** (12 zones): if cache is also empty (cold start + API down), `load()` returns a hardcoded list covering all major Romanian airports and the Cernavodă/Deveselu/Kogălniceanu exclusion zones. These cover the highest-risk sites.
3. **Fallback coverage assessment**: the 12 hardcoded zones cover ~85% of flight-relevant restricted airspace in Romania by area. Documented in handoff.

**Residual risk:** LOW — hardcoded baseline ensures the system never operates with zero zone context.

---

### R-W18-05: OSM Military Data Quality

**Risk:** OpenStreetMap data for Romanian military installations (Deveselu, Kogălniceanu, Câmpia Turzii) is intentionally sparse. OSM community policy does not map restricted military facilities in detail. The `landuse=military` tag exists on some polygons but boundaries may be approximate (±500m), missing, or deliberately displaced for security reasons.

**Probability:** HIGH — verified by manual OSM inspection 2026-03-27: Deveselu ABM site has only a rough bounding polygon; no detailed boundary for the Patriot battery emplacements.

**Impact:** MEDIUM — exclusion radius calculations based on inaccurate centre coordinates may leave a gap where drones transiting near but outside the nominal zone are not flagged.

**Mitigation:**
1. **Hardcoded verified coordinates** for the three most sensitive military sites override OSM data. Coordinates sourced from open-source intelligence (Google Earth cross-referenced with Wikipedia, Jane's public data, and Romanian MoD press releases):
   - Deveselu: 44.0917°N 24.3597°E (MIM-104 Patriot battery complex centroid)
   - Mihail Kogălniceanu: 44.3622°N 28.4883°E (runway threshold midpoint)
   - Câmpia Turzii AB: 46.5122°N 23.8853°E (runway 10/28 midpoint)
2. **Conservative exclusion radius**: military sites use 3,000m exclusion (vs. 1,000m for civilian use) to absorb coordinate uncertainty.
3. **OSM as supplement only**: OSM queries are used to discover additional `landuse=military` polygons not in the hardcoded list (e.g. training ranges in Cincu, Smârdan). Their coordinates are used with a 20% radius inflation factor.

**Residual risk:** LOW for the three primary sites; MEDIUM for secondary sites discovered only via OSM.

---

### R-W18-06: OpenWeatherMap Free Tier Exhaustion

**Risk:** OpenWeatherMap free tier provides 1,000 API calls per day. With multiple deployed instances of `AtmosphericConditionProvider` (e.g. local dev + gateway-01 + CI test runner), quota could be exceeded, causing weather data to fall back entirely to open-meteo.

**Probability:** LOW — with a 5-minute (300s) cache per instance, a single instance makes at most 288 req/day. Two concurrent instances = 576 req/day; still within 1,000/day limit.

**Impact:** LOW — open-meteo is the primary provider and has no documented rate limit. OpenWeatherMap is a secondary source used only to cross-validate visibility data. A fallback to open-meteo-only is operationally transparent.

**Mitigation:**
1. **5-minute cache** enforced in `AtmosphericConditionProvider` — all calls within 300s return cached value.
2. **Single query point**: only Bucharest (44.4268°N, 26.1025°E) is queried, not multiple weather stations across Romania. open-meteo provides superior spatial resolution via gridded models.
3. **Accepted**: given low impact, no further mitigation beyond the cache is warranted.

**Residual risk:** NEGLIGIBLE.

---

### R-W18-07: ACLED API Key Requirement

**Risk:** ACLED (Armed Conflict Location & Event Data) requires researcher registration before issuing an API key. Registration is free but requires a 1–2 business day approval cycle. During W18 development, ACLED data may be unavailable.

**Probability:** HIGH — API key will not be available on day 1 of W18 development.

**Impact:** LOW — GDELT and NASA FIRMS both provide no-auth access to conflict/threat-adjacent data. GDELT covers ACLED's primary value (conflict event geolocation) with lower latency.

**Mitigation:**
1. **GDELT as immediate no-auth fallback**: `SecurityEventCorrelator` treats ACLED as optional. When `ACLED_API_KEY` env var is absent, ACLED fetch is skipped silently; GDELT takes its place as the conflict event source.
2. **FIRMS as no-auth thermal source**: NASA FIRMS API (`https://firms.modaps.eosdis.nasa.gov/api/area/csv/`) requires a MAP_KEY (free, instant, no approval). Thermal anomaly data covers explosion signatures and industrial fires.
3. **ACLED bootstrapped post-demo**: registration submitted on W18 init day; API key expected before production deployment.

**Residual risk:** LOW — GDELT + FIRMS cover the functional requirement sufficiently for the hackathon demo.

---

### R-W18-08: Feed Avalanche Failure

**Risk:** If 4 or more W18 feeds fail simultaneously (e.g. a network partition at the gateway VM, or a shared upstream dependency like Cloudflare going down), the `EuDataIntegrationPipeline` may emit an `EuSituationalPicture` with critically incomplete data, causing downstream engines to draw incorrect conclusions (e.g. no aircraft in airspace when airspace is actually busy).

**Probability:** LOW — individual feed failures are common; simultaneous multi-feed failure requires a shared failure domain (network outage) which is uncommon.

**Impact:** HIGH — incorrect `EuSituationalPicture` with `dataCompleteness < 0.4` could suppress AWNING escalation that should trigger.

**Mitigation:**
1. **CircuitBreaker per feed** (from W15, `src/resilience/circuit-breaker.ts`): each feed registered in `EuDataFeedRegistry` gets its own `CircuitBreaker` instance. Open breakers reject calls fast, preventing timeout cascades.
2. **Last-known-good picture**: when ≥ 4 feeds are simultaneously down, `EuDataIntegrationPipeline` emits the previous `EuSituationalPicture` (from `getLastPicture()`) with a `staleness` flag and `dataCompleteness` reflecting the degraded state.
3. **`'pipeline:error'` event** with reason `'catastrophic_degradation'` alerts the W13 `TelegramAlertComposer` to send an operator notification immediately.
4. **Per-feed `Promise.race` timeout (5s)**: each feed poll is wrapped in `Promise.race([feedPoll(), timeout(5000)])`, so a hung upstream cannot hold up the entire cycle beyond 5 × max_concurrent feeds = 35s worst case.

**Residual risk:** LOW — operators are notified; last-known-good picture prevents silent failure.

---

### R-W18-09: TypeScript ESM Import Extensions

**Risk:** The existing APEX-SENTINEL codebase uses `.js` extensions in all TypeScript imports (e.g. `import { CircuitBreaker } from '../resilience/circuit-breaker.js'`). New W18 feed files that omit `.js` extensions compile correctly but fail at runtime under Node.js ESM with `ERR_MODULE_NOT_FOUND`. This error is silent during `tsc` compilation and only surfaces at runtime.

**Probability:** MEDIUM — this is a recurring pattern. W15 had one instance of this error caught in CI.

**Impact:** MEDIUM — runtime crash on first import of an affected module; surfaces in test runner but may not be caught until integration test phase if unit tests use `vi.mock()`.

**Mitigation:**
1. **Enforce .js extension** in all W18 import statements. Code review checklist item.
2. **Mind-the-gap check**: add a shell check to `wave-formation.sh` verify phase: `grep -rn "from '\.\./\|from '\.\." src/feeds/ | grep -v "\.js'" | grep -c .` — must return 0.
3. **TypeScript config**: `tsconfig.json` already has `"moduleResolution": "bundler"`. Do not change. New files follow same tsconfig.

**Residual risk:** LOW — process control (review + automated check) is sufficient.

---

### R-W18-10: Test Isolation — External API Calls in Unit Tests

**Risk:** Feed modules that make HTTP calls could accidentally reach real external APIs during unit test runs (e.g. if a developer forgets to mock `fetch`, or a mock is misconfigured). This causes test non-determinism (tests pass locally but fail in CI due to rate limits), test pollution (real NOTAM data in assertions), and CI failures when external APIs are unavailable.

**Probability:** HIGH — without explicit enforcement, ad hoc test additions frequently omit fetch mocking.

**Impact:** MEDIUM — flaky tests erode confidence; CI failures block merges.

**Mitigation:**
1. **Injected fetch parameter** on all feed classes: constructors accept `fetchFn: typeof fetch = globalThis.fetch`. Tests pass `vi.fn()` returning pre-canned responses. No real HTTP is possible when `fetchFn` is mocked.
2. **Test assertion**: all `FR-W18-*.test.ts` files include a top-level assertion that the mock fetch was called with the expected URL, confirming the mock was active.
3. **Vitest global fetch mock**: `vi.stubGlobal('fetch', mockFetch)` in `beforeEach` as a belt-and-suspenders measure for any test that instantiates without injecting `fetchFn`.
4. **CI network isolation**: gateway-01 CI runner has outbound HTTP blocked to non-internal endpoints (iptables policy). External API calls in CI fail immediately rather than hanging.

**Residual risk:** LOW — constructor injection + `vi.stubGlobal` provides two independent layers of isolation.

---

### R-W18-11: NOTAM Propagation Lag from ROMATSA

**Risk:** Romanian airspace authority ROMATSA (Regia Autonomă Română de Aeronautică) publishes NOTAMs via the LRBB FIR to ICAO and then to the FAA NOTAM API. The propagation chain introduces a typical 15–30 minute lag between a Romanian authority issuing a NOTAM and it appearing in the FAA API response.

**Probability:** MEDIUM — lag is structural to the ICAO propagation chain.

**Impact:** LOW — 15–30 min lag in NOTAM data does not affect the hackathon demo scenario, where NOTAMs are pre-issued. In production, this lag is documented for operator awareness.

**Mitigation:**
1. **Accepted for hackathon**: demo NOTAMs for LROP (scenario: temporary restricted zone over Bucharest) are pre-seeded at least 2 hours before demo.
2. **Documented in operator brief**: operators are informed of NOTAM propagation lag; real-time ATC coordination remains primary for immediate airspace restrictions.

**Residual risk:** LOW (demo); MEDIUM (production — requires direct ROMATSA API integration in a post-hackathon wave).

---

### R-W18-12: FIRMS False Positives — Agricultural Burning

**Risk:** NASA FIRMS thermal anomaly data for Romania includes substantial false positives from agricultural field burning (stubble burning in Muntenia, Bărăgan plain, Dobrogea) between March–May and August–October. These appear as fire detections with FIRMS confidence ≥ 70% but are not security-relevant events.

**Probability:** HIGH — agricultural burning season overlaps with the demo date (March 27, 2026).

**Impact:** LOW — false positives in `SecurityEventCorrelator` add noise to `SecurityEvent[]` but do not directly escalate AWNING level. W11 `OsintCorrelationEngine` applies its own spatial density weighting.

**Mitigation:**
1. **Confidence threshold raised to ≥ 80** for FIRMS events included in `SecurityEvent[]`.
2. **Agricultural zone exclusion**: known agricultural burning areas (Bărăgan plain: 44.0–45.5°N, 26.5–28.5°E) events are tagged with `eventType: 'probable_agricultural'` and down-weighted but not excluded (to avoid missing real thermal events in this zone).
3. **Cross-correlation with ACLED/GDELT**: a FIRMS event with no corresponding ACLED/GDELT event within 5km and 24h is classified as `'low_confidence'` and excluded from high-priority security feed.

**Residual risk:** LOW.

---

### R-W18-13: Overpass API Rate Limiting

**Risk:** The public OSM Overpass API instance (`overpass-api.de`) implements rate limiting based on request complexity and client IP. Batch queries with large bounding boxes (Romania: ~500km × 600km) may be queued for 10–60 seconds or rejected with HTTP 429 during high-load periods (typically 08:00–20:00 UTC on weekdays).

**Probability:** MEDIUM — Overpass public instance is heavily loaded during European business hours.

**Impact:** MEDIUM — if `CriticalInfrastructureLoader.loadAll()` fails or times out, the system falls back to hardcoded zones only (covering 5 of the ~40 expected OSM-sourced zones).

**Mitigation:**
1. **Sequential queries with 2s delay**: `loadAll()` fires 4 Overpass queries sequentially (not concurrently) with 2s between each, reducing per-client request rate.
2. **30s timeout per query** with `[timeout:30]` Overpass pragma; queries that exceed this are treated as failed but do not block other queries.
3. **Off-peak boot**: `CriticalInfrastructureLoader` is initialised once at pipeline start, not on every poll cycle. A single successful load persists for the session lifetime.
4. **Alternative Overpass endpoint**: `overpass.kumi.systems` (EU mirror) used as fallback when primary returns 429.

**Residual risk:** LOW — hardcoded zones ensure baseline coverage even in total Overpass failure.

---

### R-W18-14: AircraftState Memory Pressure

**Risk:** ADS-B Exchange and adsb.fi return global aircraft positions (~8,000–12,000 entries during peak hours). If the bounding box filter is incorrectly applied or disabled, `AircraftState[]` in memory could reach 8,000+ entries × ~500 bytes/entry = ~4MB per snapshot, with multiple snapshots retained during correlation.

**Probability:** MEDIUM — bounding box filter is applied per-source, but a coding error (e.g. wrong lat/lon field names from different API schemas) could silently disable filtering.

**Impact:** MEDIUM — memory pressure in the existing W16 `MemoryBudgetEnforcer` context (DataFeedBroker budget: 50MB). 8,000 entries would consume ~4MB per poll cycle, accumulating to budget exhaustion within ~10 cycles.

**Mitigation:**
1. **Bounding box enforced in `AircraftPositionAggregator.filter()` as a separate method** — independently testable. Unit tests assert that a position at 51.5°N 0.1°W (London) is filtered out; a position at 44.43°N 26.10°E (Bucharest) is retained.
2. **Post-merge count assertion in tests**: `expect(states.length).toBeLessThan(500)` with a Romanian-only dataset; protects against regression.
3. **Memory budget alert**: W16 `MemoryBudgetEnforcer` already monitors `DataFeedBroker`; W18 pipeline registers itself with an additional 20MB budget allocation for the `EuSituationalPicture` object graph.

**Residual risk:** LOW — unit test coverage of the filter method catches the most likely failure mode.

---

## Risk Actions Summary

| ID | Action | Owner | Due |
|----|--------|-------|-----|
| R-W18-01 | Set `OPENSKY_USERNAME`/`OPENSKY_PASSWORD` env vars on gateway-01 before demo | Nico | W18 deploy |
| R-W18-02 | Capture 3 real NOTAM strings from FAA API on W18 init day for contract tests | Dev | W18 tdd-red |
| R-W18-03 | Add DPIA note to `PRIVACY_ARCHITECTURE.md` for production milestone | Nico | W18 complete |
| R-W18-07 | Submit ACLED researcher registration on W18 init day | Nico | W18 init |
| R-W18-09 | Add `.js` extension grep check to `wave-formation.sh` checkpoint phase | Dev | W18 execute |
