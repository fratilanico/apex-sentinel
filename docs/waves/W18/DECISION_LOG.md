# APEX-SENTINEL W18 — DECISION LOG
# EU Data Integration Layer
# Wave: W18 | Status: INIT | Date: 2026-03-27

---

## Overview

This document records all significant architectural decisions made for W18. Each decision
is documented with context, options considered, the rationale for the chosen option, and
trade-offs accepted. Decisions are permanent record — they are not updated to reflect
hindsight; amendments are added as separate entries referencing the original.

---

## DEC-W18-01: OpenSky Network as Primary ADS-B Source

**Date:** 2026-03-27
**Status:** DECIDED
**Decision makers:** Nico Fratila (architecture), APEX-SENTINEL W18 design session

### Context
APEX-SENTINEL requires live aircraft position data covering Romanian airspace to detect
unauthorized UAS operations near protected zones. Multiple commercial and open-source ADS-B
aggregators are available. Selection criteria: data access model, coverage quality over Romania,
cost, Terms of Service for security applications, and API reliability.

### Options Considered

**Option A: Flightradar24 API**
- Pro: Best data quality, highest aircraft count globally, real-time updates every 8 seconds
- Con: Commercial API requires enterprise license ($3,000+/year). ToS explicitly prohibits use
  in security monitoring or government applications without a signed data agreement.
  No anonymous/free tier for programmatic access. API approval process takes 2-4 weeks.
- Con: Would prevent open-source distribution of APEX-SENTINEL

**Option B: OpenSky Network (CHOSEN)**
- Pro: Open-source academic project. Free API with anonymous (no-key) tier.
  REST API at `https://opensky-network.org/api/states/all` with bounding box support.
  Coverage of Romanian airspace is adequate (European network, good feeder density).
  ToS explicitly permits research and security applications with attribution.
- Pro: Can obtain a registered account to raise daily limit from 400 to 4000 requests/day.
- Con: Anonymous tier: 400 requests/day total, shared across all anonymous users.
  During peak times, API may return 429 or empty responses.
- Con: 10-second average latency on state updates (not real-time; acceptable for 30s poll cycle)

**Option C: ADS-B Exchange**
- Pro: Unfiltered data (does not exclude military traffic like FlightAware does).
  Useful as secondary source. REST API at `https://adsbexchange.com/api/aircraft/json/lat/lon/dist/`
- Con: Requires API key and monthly subscription for production use ($25-100/month).
  Free tier heavily rate-limited (< 100 req/day). Will be used as secondary source.

**Option D: OpenSky + Commercial Backup**
- Considered Flightradar24 or FlightAware as paid backup. Rejected due to cost and ToS.

### Decision
OpenSky Network as primary (free, permissive ToS, Romanian coverage adequate).
ADS-B Exchange as secondary (paid key required but free research tier covers our volume).
adsb.fi as tertiary emergency backup (completely free, no key, community-maintained).

### Trade-offs Accepted
- 400 req/day anonymous limit is tight for 30-second polling (2880 req/day = 7.2x the limit).
  Mitigation: register an OpenSky account (free) to raise to 4000 req/day. We poll once per 30s
  but use caching aggressively; budget tracker ensures we never exceed the daily limit.
- Position latency of 10 seconds is acceptable. We detect breach patterns over 60-second windows;
  10-second staleness does not materially affect threat detection quality.

---

## DEC-W18-02: EASA UAS Zone Database Over Custom Zone Registry

**Date:** 2026-03-27
**Status:** DECIDED

### Context
APEX-SENTINEL needs to know where UAS operations are legally restricted in Romania.
Two approaches: build a custom zone database from Romanian ANRC/ROMATSA regulations,
or consume the official EASA-maintained zone database that Romania publishes to.

### Options Considered

**Option A: Custom zone database (manual curation)**
- Pro: Full control over zone definitions, can model proprietary intelligence
- Con: Romanian ANRC drone zones change frequently (quarterly NOTAM updates minimum).
  Manual curation would require a legal researcher on retainer.
- Con: We would be re-implementing what EASA already does as part of U-space regulation
  (Commission Delegated Regulation (EU) 2019/945, Commission Implementing Regulation (EU) 2021/664).
- Con: Custom database carries legal liability if a zone definition is wrong and a customer
  claims compliance based on our data.

**Option B: EASA drone.rules.eu API (CHOSEN)**
- Pro: Official EU regulatory source. Romania is an EU member state and publishes zones to
  the Common European Airspace Information System (CEAIS) via drone.rules.eu.
- Pro: Zones are updated by the Romanian Civil Aviation Authority (RCAA) directly.
  We consume the same data a UAS operator would use to check legality of their flight.
- Pro: Regulatory alignment: if our system uses the same zone definitions as the legal
  requirement, we cannot be accused of using incorrect restricted zone data.
- Pro: API is free, no key required for zone queries.
- Con: API is relatively new (2022), may have uptime issues. Mitigated by 24-hour cache.
- Con: Some temporary restrictions (NOTAM-based) are NOT reflected in the EASA zone database.
  These are handled separately by FR-W18-03 (NotamIngestor).

### Decision
Use EASA drone.rules.eu as the authoritative source for permanent/semi-permanent UAS zones.
Supplement with live NOTAMs from the FAA API (FR-W18-03) for temporary restrictions.

### Trade-offs Accepted
- drone.rules.eu has no SLA guarantee. 24-hour zone cache mitigates outage impact.
  Zone data does not change minute-to-minute; 24-hour stale is acceptable.
- EASA zones cover EU UAS categories (Open, Specific, Certified). They do NOT cover military
  or special use airspace beyond what national authorities publish. Our CriticalInfrastructureLoader
  (FR-W18-05) adds the military/nuclear layer separately.

---

## DEC-W18-03: OSM Overpass API for Critical Infrastructure Over Commercial GIS

**Date:** 2026-03-27
**Status:** DECIDED

### Context
The system needs geographic locations and boundaries for Romanian critical infrastructure:
airports, nuclear plants, NATO bases, power plants, government facilities. These are the
protected zones that trigger elevated threat scores when UAS or security events are nearby.

### Options Considered

**Option A: Commercial GIS data (Esri, HERE, TomTom)**
- Pro: High accuracy, regular updates, legal indemnification for data errors
- Con: Licensing cost for Romanian infrastructure data: $500-2000/year minimum.
  Enterprise licensing for security applications may be higher or require special approval.
- Con: Would prevent open-source distribution without a data sublicensing arrangement.

**Option B: OpenStreetMap via Overpass API (CHOSEN)**
- Pro: Free, open license (ODbL), covers all of Romania with good community contribution.
  Romanian OSM community is active; airports, nuclear plants, military bases all mapped.
- Pro: Overpass API at `https://overpass-api.de/api/interpreter` is free for moderate volume.
  Our use case: 1 query per 72 hours for Romania. Total: ~10 requests/month. Well within
  fair-use limits (Overpass fair use = < 10,000 requests/day, requests < 60s each).
- Pro: OSM data for Romanian critical infrastructure is accurate and regularly updated.
  Henri Coanda Airport, Cernavoda NPP, Kogalniceanu NATO base are all in OSM with full metadata.
- Con: OSM data can have errors or lag for rapidly-changing military installations.
  Mitigation: our static bundled cache provides a fallback, and we do not claim legal compliance.
- Con: Overpass API has no SLA; can be slow during peak load. Mitigation: 72-hour cache TTL
  means we only need a successful fetch once every 3 days.

**Option C: Romanian government open data portals (geo-spatial.org, ANCPI)**
- Pro: Official Romanian government source
- Con: geo-spatial.org data is inconsistently formatted and not available as an API.
  ANCPI data is available only as WMS/WFS endpoints that require institutional registration.
  Coverage of military sites is intentionally incomplete in official Romanian open data.

### Decision
OpenStreetMap via Overpass API. Bundle a static GeoJSON cache for fallback.
Supplement OSM data with the hardcoded protected zone list in `protected-zone-registry.ts`
for the 6 critical sites that must always be present regardless of OSM state.

### Trade-offs Accepted
- OSM accuracy is community-dependent. Cernavoda NPP and Deveselu NATO base are mapped
  but may not have precise polygon boundaries. We use centroid + fixed radius as a conservative
  approximation. A 3km radius around Cernavoda is larger than strictly needed but safe.
- We acknowledge OSM data is not a legally authoritative source for military zone boundaries.
  APEX-SENTINEL documentation must clearly state this limitation.

---

## DEC-W18-04: ACLED Over LiveUAMap for Security Events

**Date:** 2026-03-27
**Status:** DECIDED

### Context
Security event correlation (FR-W18-07) requires structured data about incidents near
Romanian critical infrastructure: civil unrest, armed incidents, explosions, sabotage.
Multiple sources available for the Southeast European region.

### Options Considered

**Option A: LiveUAMap**
- Pro: Real-time, broad coverage, visual interface
- Con: No public API for programmatic access. Data must be scraped, which violates ToS.
  Scraping would require headless browser; brittle maintenance burden.
- Con: Data is primarily Ukraine-focused (product history); Romanian coverage is sparse.

**Option B: ACLED — Armed Conflict Location and Event Data Project (CHOSEN)**
- Pro: Academic research project with a free researcher tier API at `https://api.acleddata.com`.
  Requires email registration and API key (free, approved within 24 hours).
- Pro: Structured, curated data with standardised event types, actor classification,
  fatality counts, and geographic coordinates. Much higher data quality than scraped sources.
- Pro: Covers Romania and Southeast Europe explicitly. Historical data available for
  baseline establishment (1997 to present for SEE region).
- Pro: API returns JSON with well-documented fields; no parsing of free-text needed beyond
  the `notes` field for contextual description.
- Con: Not real-time; events are typically verified and published with 1-7 day lag.
  Not suitable for detecting ongoing live incidents; suitable for context enrichment
  (has there been a pattern of incidents near this zone recently?).
- Con: Free tier: 500 records per request. Need pagination for large historical queries.

**Option C: GDELT (Global Database of Events, Language, and Tone)**
- Pro: Near-real-time (updated every 15 minutes), truly global, free, no key required.
- Con: GDELT is media-derived (news article parsing). Event coordinates are often
  approximate (city-level, not point-level). Much lower precision than ACLED.
  GDELT is used as a supplementary source (FR-W18-07) but not primary for structured events.

**Option D: Janes / Dataminr**
- Pro: Professional threat intelligence, real-time
- Con: Enterprise pricing ($50,000+/year). Not viable for APEX-SENTINEL.

### Decision
ACLED as primary structured security event source (7-30 day lookback window for context).
GDELT as secondary for near-real-time media signals.
NASA FIRMS for fire/thermal anomaly detection (proxy for explosion or infrastructure attack).

### Trade-offs Accepted
- ACLED's 1-7 day lag means we cannot use it for real-time incident detection. Its value
  is contextual: if there has been civil unrest near LROP in the past 30 days, a UAS detected
  near LROP carries higher threat weight. This is an enrichment layer, not a detection layer.
- FIRMS provides near-real-time (3-hour lag) data for thermal anomalies, partially compensating
  for ACLED's lag in the case of physical incidents like explosions or fires.

---

## DEC-W18-05: FAA NOTAM API Over ROMATSA Direct for NOTAM Ingest

**Date:** 2026-03-27
**Status:** DECIDED

### Context
APEX-SENTINEL needs active NOTAM data for Romanian airspace. NOTAMs (Notice to Air Missions)
contain temporary flight restrictions, UAS prohibitions, and airspace status changes.
Romanian airspace (LRBB FIR — Bucharest Flight Information Region) is managed by ROMATSA.

### Options Considered

**Option A: ROMATSA Direct**
- ROMATSA (Administratia Romana a Serviciilor de Trafic Aerian) publishes NOTAMs for LRBB FIR
- Pro: Direct source, authoritative for Romanian airspace
- Con: ROMATSA has NO public API for NOTAM data. Their website (romatsa.ro) provides HTML
  pages for human consumption only. Scraping would be fragile and potentially ToS-violating.
- Con: ROMATSA NOTAM access via AFTN (Aeronautical Fixed Telecommunication Network) requires
  an institutional license (ANSP or aviation authority). Not available to civilian developers.

**Option B: EAD (European AIS Database)**
- Pro: Official ICAO-EUROCONTROL database for European NOTAMs
- Con: EAD API access requires institutional membership and approval from an ANSP.
  Access is restricted to certified aviation organisations. Not available programmatically
  to civilian security companies without a formal agreement.

**Option C: FAA NOTAM Search API (CHOSEN)**
- Pro: The FAA NOTAM Search API (`https://api.faa.gov/notamSearch/notams`) covers
  international NOTAMs including all ICAO FIRs worldwide, including LRBB.
  Romanian NOTAMs published to ICAO are ingested into the FAA NOTAM database via
  ICAO's SWIM (System Wide Information Management) network.
- Pro: Free API with OAuth2 client credentials (free registration at api.faa.gov/signup).
  Supports `icaoLocation` query parameter to filter by FIR or airport ICAO code.
- Pro: Returns structured JSON with ICAO NOTAM text, effective times, and location codes.
- Con: FAA is a US agency; their Romanian coverage depends on ICAO data sharing.
  Very short-notice NOTAM updates (< 30 minutes) may have a brief propagation delay.
- Con: API requires FAA client_id and client_secret (free but requires registration).

**Option D: aviationweather.gov NOTAM API**
- NOAA/NWS endpoint, free, but only covers US NOTAMs. Not viable for Romanian airspace.

**Option E: NOTAM parsing via Third-party aggregators (notams.faa.gov, euronotam.eu)**
- euronotam.eu: HTML-only, no API
- notams.faa.gov: Superseded by the new api.faa.gov endpoint

### Decision
FAA NOTAM Search API for LRBB FIR NOTAM ingest. The LRBB FIR designation covers all
Romanian airspace, so a single query covers the entire country.

### Trade-offs Accepted
- FAA is an intermediary for Romanian NOTAMs; there is a small propagation delay.
  Our 15-minute cache TTL on NOTAMs means we accept up to 15 minutes of staleness anyway,
  which dwarfs the FAA propagation delay (typically < 5 minutes).
- Registration for FAA API credentials is required. OPENWEATHER_API_KEY pattern applies:
  credentials stored in environment variables, documented in DEPLOY_CHECKLIST.

---

## DEC-W18-06: adsb.fi as Tertiary ADS-B Backup

**Date:** 2026-03-27
**Status:** DECIDED

### Context
The OpenSky anonymous tier has a 400 req/day limit. At 30-second polling intervals for
Romanian airspace, we need 2880 requests/day — 7.2x the anonymous limit. Even with a
registered OpenSky account (4000 req/day), sustained 30-second polling consumes the budget
in 33 hours (4000 / 2880 = 1.39 days). We need a zero-cost tertiary fallback.

### Options Considered

**Option A: No tertiary (two sources only)**
- When both OpenSky (quota exhausted) and ADS-B Exchange (key expired or rate limited)
  are unavailable, AircraftPositionAggregator returns empty results.
  For a 30-second detection window, missing one cycle is acceptable, but sustained gaps
  (e.g. ADS-B Exchange billing failure) would create monitoring blindness.

**Option B: adsb.fi (CHOSEN)**
- adsb.fi is a community-maintained ADS-B aggregator at `https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{dist}`
  The API is free, requires no API key, and has no stated daily request limit (rate limit
  is soft — they ask for reasonable use).
- Pro: No key management, no registration, no daily budget to track
- Con: No SLA, no uptime guarantee, community project — may become unavailable
- Con: Coverage density over Romania lower than OpenSky (fewer Romanian feeders contribute to adsb.fi)
- Con: API schema differs from OpenSky; requires separate adapter (adsbfi-adapter.ts)

**Option C: Planefinder / FlightAware**
- Both require commercial API keys and have restrictive ToS for security applications.

### Decision
adsb.fi as tertiary fallback. Zero cost, zero key management overhead. Adapter is thin
(< 100 lines). Budget tracker in EuDataFeedRegistry marks adsb.fi as `NO_BUDGET` (unlimited).

### Trade-offs Accepted
- adsb.fi may have lower data quality/coverage over Romania. Its role is emergency fallback,
  not primary data source. A degraded position picture is better than no position picture.
- Community projects can shut down. If adsb.fi disappears, remove the adapter; the
  aggregator degrades to 2-source operation.

---

## DEC-W18-07: Rate Limiting Strategy — Per-Feed Budget Tracking

**Date:** 2026-03-27
**Status:** DECIDED

### Context
Multiple feeds in W18 have hard daily request limits (OpenSky: 400 anon / 4000 registered,
ACLED: 500 records/request with unclear rate limit, FAA NOTAM: no stated limit but throttled).
We need a unified rate limiting strategy that prevents budget exhaustion.

### Decision
Implement a per-feed `dailyRequestBudget` tracker in `EuDataFeedRegistry`:
- Each feed has a `dailyRequestLimit` configured at registration time
- A counter `budgetUsed` is incremented on every outgoing HTTP request for that feed
- `canRequest(feedId)` returns false synchronously when budget is exhausted
- Counter resets at UTC midnight using a scheduled callback (not a 24-hour rolling window;
  calendar day alignment matches API provider resets)
- OpenSky anonymous: `dailyRequestLimit: 400`
- OpenSky registered: `dailyRequestLimit: 4000`
- ADS-B Exchange: `dailyRequestLimit: 1000` (conservative estimate for free tier)
- adsb.fi: `dailyRequestLimit: Infinity` (no limit; budget tracking is a no-op)
- FAA NOTAM: `dailyRequestLimit: 10000` (high; effectively unlimited for our use)
- ACLED: `dailyRequestLimit: 200` (conservative; their rate limit is per-email, not documented)

### Alternative Considered
Token bucket (rolling window): more accurate but more complex; overkill for feeds with
calendar-day resets. Rejected in favour of simpler counter.

### Trade-offs Accepted
- Calendar-day vs. rolling-window: if we exhaust the budget at 23:00 UTC, we wait 60 minutes
  for midnight reset. This is acceptable. Aircraft positions still available from adsb.fi.

---

## DEC-W18-08: Cache TTL Strategy Per Feed Type

**Date:** 2026-03-27
**Status:** DECIDED

### Context
Each feed has different data volatility. Caching reduces API pressure and provides
resilience against outages. TTL must balance freshness against API budget consumption.

### Decision — TTL per feed:

| Feed | TTL | Rationale |
|------|-----|-----------|
| Aircraft positions (OpenSky/ADS-B) | 30 seconds | Positions change every few seconds; 30s TTL matches poll interval |
| NOTAMs (FAA) | 15 minutes | NOTAMs rarely change mid-flight; 15min balances freshness |
| EASA UAS zones (drone.rules.eu) | 24 hours | Regulatory zones update at most weekly; daily re-fetch is ample |
| Critical infrastructure (OSM Overpass) | 72 hours | Infrastructure never changes day-to-day |
| Atmospheric conditions (Open-Meteo) | 15 minutes | Weather meaningful on 15-30 min scales for UAS decisions |
| ACLED events | 6 hours | Curated events; new events published with delay anyway |
| FIRMS anomalies | 1 hour | FIRMS updates every 3 hours; 1-hour TTL gives one update window |
| GDELT events | 15 minutes | GDELT updates every 15 minutes; match their update rate |

### Alternative Considered
Event-driven cache invalidation (webhook from data providers). Rejected: no feed in W18
provides webhooks. Push model not available. Pull with TTL is the only viable pattern.

---

## DEC-W18-09: GDPR Article 22 — No Storage of Individual Flight Paths

**Date:** 2026-03-27
**Status:** DECIDED

### Context
ADS-B data allows reconstructing the complete flight path of any aircraft over time. If
APEX-SENTINEL stored historical positions per ICAO24, this would create a de-facto flight
path surveillance database. Under GDPR, tracking the movement of an individual (e.g. a
drone pilot whose ICAO24 is linked to their Remote ID registration) without legal basis
constitutes a data protection violation.

### Decision
The `AircraftPositionAggregator` stores only the most recent position per ICAO24 in memory.
No position history is written to the Supabase database.
In-memory dedup cache entries are evicted after 300 seconds (5 minutes).
This means the system can detect that an aircraft is IN Romanian airspace right now,
but cannot reconstruct where it flew 10 minutes ago.

The `SecurityEventCorrelator` does NOT cross-reference ICAO24 data with ACLED or GDELT events
in a way that would link a specific aircraft registration to a person's identity.

### Legal Basis
GDPR Article 6(1)(f) — legitimate interest for public safety monitoring.
However, data minimisation (Article 5(1)(c)) requires we collect only what is needed.
Real-time position detection is needed. Historical path reconstruction is not.

### Trade-offs Accepted
- We cannot perform post-incident forensic reconstruction from APEX-SENTINEL data alone.
  This is by design. Post-incident investigation is the role of law enforcement with
  proper legal authority to obtain data from ROMATSA and the drone registry.
- The 5-minute dedup cache creates a 5-minute window where the same aircraft is deduplicated.
  This is operationally sufficient for real-time monitoring.

---

## DEC-W18-10: Haversine-Only Distance Computation, No Geospatial Library Dependencies

**Date:** 2026-03-27
**Status:** DECIDED

### Context
Zone breach detection in FR-W18-07 and FR-W18-05 requires distance computation between
aircraft positions/event coordinates and protected zone centers. Options: import a
geospatial library (turf.js, proj4, geolib) or implement pure math.

### Decision
Implement Haversine formula directly in TypeScript in `src/geo/zone-breach-detector.ts`.
No external geospatial library dependency for distance computation.

Haversine is sufficiently accurate for our use case (error < 0.3% for distances < 500km;
all Romanian airspace fits within a ~750km diagonal — max error < 1% at the extremes).

For polygon containment (point-in-polygon for EASA zone polygons): implement ray-casting
algorithm directly in TypeScript. No JSTS, no Turf.js.

### Rationale
- Zero additional npm dependencies keeps the package lean and secure
- Haversine accuracy is adequate: we do not need sub-meter precision for threat zones
  measured in hundreds to thousands of meters
- Pure TypeScript is auditable; geospatial libraries add significant surface area

### Alternative Considered
Turf.js: excellent geospatial library, well-tested. Rejected because it pulls in 18
transitive dependencies. Our use case (haversine + ray-casting) does not justify that.

### Trade-offs Accepted
- We do not support ellipsoid-corrected geodetic distance (Vincenty formula). At the
  distances involved in Romanian airspace monitoring (< 1000km), the difference between
  spherical (Haversine) and ellipsoidal (Vincenty) is < 0.3%. Acceptable.
- Complex polygon operations (union, intersection, buffer) are not supported natively.
  If needed in future waves, add Turf.js at that point.

---

*End of DECISION_LOG.md*
*APEX-SENTINEL W18 — EU Data Integration Layer*
*2026-03-27 | 10 decisions recorded*
