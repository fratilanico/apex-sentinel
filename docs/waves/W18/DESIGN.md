# APEX-SENTINEL W18 — DESIGN

## Theme: EU Data Integration Layer

### Wave Summary

| Field | Value |
|-------|-------|
| Wave | W18 |
| Theme | EU Data Integration Layer |
| Status | PLANNED |
| Target Geography | Romania + EU, centered on Bucharest (44.43°N, 26.10°E) |
| Prior Waves | W1–W17 complete, 3097 tests GREEN |
| Threat Model | Civilian UAS — EASA Category A/B/C/D |
| Regulatory Frame | EU 2019/945, EU 2021/664 (U-space), GDPR Art.22 |

---

## Problem Statement

APEX-SENTINEL W1–W17 built a complete detection pipeline: acoustic YAMNet (W3/W4), RF signature analysis (W5/W6), ML fusion (W7/W8), NATS messaging (W9), AWNING threat escalation (W10), multi-node mesh (W11/W12), prediction (W13), dashboard (W14), edge optimization (W16), and demo-readiness (W17).

The core limitation entering W18: **all feeds used simulation data or Ukraine-centric sources**. The ADS-B bounding box was pointed at Kyiv. Weather coordinates were hardcoded to a non-Romanian location. GDELT queries used Ukrainian keywords. The system was architecturally sound but geographically wrong for production EU deployment.

W18 replaces simulation/proxy data with **real open-source feeds** covering Romania and the EU, properly geocoded, respecting rate limits, and compliant with GDPR and EASA UAS regulations.

---

## Design Goals

1. **Real geography** — all feeds bounded to Romania bbox: 43.5–48.5°N, 20.2–30.0°E
2. **Real protocols** — OpenSky REST, EAD NOTAM, EASA UAS Zone API, OSM Overpass, ACLED
3. **Feed resilience** — graceful degradation when any feed is unavailable (circuit breaker per feed)
4. **Deduplication** — aircraft positions merged from 3 sources by ICAO24 hex, last-writer-wins on lat/lon freshness
5. **Rate compliance** — per-feed token bucket enforcing published API rate limits
6. **GDPR compliance** — no aircraft operator PII stored; all coordinates anonymised to 4 decimal places in logs; retention 24h maximum for raw positions
7. **Zero breaking changes** — W18 feeds plug into existing DataFeedBroker (W9) via the FeedClient interface; no W1–W17 code modified

---

## Architecture Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary ADS-B source | OpenSky Network REST | Free, no API key for anonymous bbox queries, 10s refresh, has ICAO24 |
| Secondary ADS-B source | ADS-B Exchange | Includes military/government tracks OpenSky suppresses |
| Tertiary ADS-B source | adsb.fi | Backup; different ground station network |
| NOTAM source | EAD Basic API | Official ICAO EAD, covers all ECAC states including Romania |
| UAS zone data | EASA drone.rules.eu | Authoritative U-space source, EU 2021/664 compliant |
| Infrastructure overlay | OSM Overpass API | Free, covers airports/nuclear/military, returns GeoJSON |
| Weather (primary) | open-meteo | Already wired in W9; re-point to Bucharest coords |
| Weather (secondary) | OpenWeatherMap | Adds visibility and wind shear not in open-meteo free tier |
| Security events | ACLED + FIRMS + GDELT | Three independent OSINT streams for SE Europe |
| Cell density baseline | OpenCelliD | RF noise floor estimation per grid sector |
| Humanitarian shapes | HDX | Romania administrative boundaries for sector labelling |

---

## Feed Tier Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        EuDataIntegrationPipeline (FR-W18-08)            │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    EuDataFeedRegistry (FR-W18-01)                │  │
│  │   register / deregister / health-check / rate-limit enforcement  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  TIER 1 — Real-time (10–30s poll)                                       │
│  ┌─────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │ AircraftPositionAggregator      │  │ NotamIngestor                │  │
│  │ FR-W18-02                       │  │ FR-W18-03                    │  │
│  │ OpenSky + ADS-BX + adsb.fi      │  │ EAD Basic API ICAO format    │  │
│  │ → AircraftState[] (deduped)     │  │ → NotamRestriction GeoJSON   │  │
│  └─────────────────────────────────┘  └──────────────────────────────┘  │
│                                                                         │
│  TIER 2 — Contextual (5min poll)                                        │
│  ┌──────────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │ EasaUasZoneLoader    │  │ CriticalInfra    │  │ AtmosphericCond   │  │
│  │ FR-W18-04            │  │ Loader           │  │ Provider          │  │
│  │ drone.rules.eu API   │  │ FR-W18-05        │  │ FR-W18-06         │  │
│  │ → UasZone[]          │  │ OSM Overpass     │  │ open-meteo +      │  │
│  └──────────────────────┘  │ → ProtectedZone[]│  │ OWM              │  │
│                            └──────────────────┘  │ → DroneFlightCond│  │
│                                                  └───────────────────┘  │
│  TIER 3 — Intelligence (30min poll)                                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ SecurityEventCorrelator (FR-W18-07)                              │  │
│  │ ACLED + FIRMS/NASA + GDELT → SecurityEvent[] correlated with    │  │
│  │ ProtectedZone[] radius buffers                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
              │                      │                    │
              ▼                      ▼                    ▼
     DataFeedBroker (W9)    ThreatContextEnricher  OperatorDashboard
     NATS feed.eu.*          (W9 FR-W9-05)          (W14)
```

---

## Romanian Protected Zone Map

```
                  RO bbox: 43.5–48.5°N / 20.2–30.0°E
    ┌─────────────────────────────────────────────────────┐
    │ 48.5°N                                              │
    │           Cluj-Napoca Airport ●                     │
    │              (46.785°N 23.686°E)                   │
    │                                                     │
    │  Timișoara Airport ●                               │
    │  (45.810°N 21.338°E)                               │
    │                    ● BUCHAREST                      │
    │              Henri Coandă ○ (44.571°N 26.085°E)   │
    │              Govt District ○ (44.427°N 26.103°E)  │
    │                                                     │
    │  Deveselu NATO ●                                    │
    │  (44.099°N 24.138°E)                               │
    │                    Cernavodă Nuclear ▲              │
    │                    (44.327°N 28.061°E)  ●Constanța │
    │                                         Airport    │
    │ 43.5°N                                              │
    └─────────────────────────────────────────────────────┘
     20.2°E                                          30.0°E

  ○ = 5km exclusion + 8km CTR    ▲ = 10km exclusion    ● = standard CTR
```

---

## UAS Threat Model (EASA Civilian)

| Category | Description | Detection Priority | Typical Radar Cross-Section |
|----------|-------------|-------------------|----------------------------|
| Cat-A | Unauthorized commercial UAS (DJI Phantom/Mini/Mavic, Autel EVO) | HIGH | 0.01–0.1 m² |
| Cat-B | Modified payload-carrying UAS (smuggling, surveillance payloads) | CRITICAL | 0.05–0.3 m² |
| Cat-C | Purpose-built surveillance fixed-wing UAS | HIGH | 0.02–0.2 m² |
| Cat-D | Unknown/unregistered contact with no Remote ID | CRITICAL | Unknown |

W18 does not change the acoustic/RF detection pipeline (W3–W8). It enriches detected contacts with regulatory context: whether the detected position overlaps a NOTAM restriction, a U-space zone, or a protected zone buffer.

---

## Integration with W1–W17

W18 is a **pure additive layer**. It:
- Implements `FeedClient` interface (W9 DataFeedBroker contract) for all new feeds
- Publishes to new NATS subjects under `feed.eu.*` namespace
- Does NOT modify any W1–W17 source file
- ThreatContextEnricher (W9 FR-W9-05) subscribes to `feed.eu.aircraft` for correlation

The only W9 change is a **configuration update**: `open-meteo-client.ts` lat/lon parameters change from placeholder to Bucharest coordinates (44.43°N, 26.10°E). This is a runtime config change, not a source change.

---

## Data Volume Estimates

| Feed | Records/Poll | Poll Interval | Records/Hour |
|------|-------------|---------------|-------------|
| OpenSky bbox RO | ~200–800 aircraft | 10s | ~180,000 |
| ADS-B Exchange | ~150–600 aircraft | 15s | ~90,000 |
| adsb.fi | ~150–600 aircraft | 20s | ~54,000 |
| NOTAM EAD | ~50–300 NOTAMs | 5min | ~3,600 |
| EASA UAS Zones | ~500–2000 zones | 5min | ~24,000 |
| OSM Overpass | ~200–500 features | 5min | once (cached) |
| AtmosphericConditions | 1 composite object | 5min | 12 |
| ACLED SE Europe | ~10–50 events | 30min | ~80 |
| FIRMS RO bbox | ~5–20 thermal | 30min | ~40 |
| GDELT RO | ~20–100 events | 30min | ~160 |

Total peak ingest: ~330,000 records/hour. After deduplication and aggregation, downstream sees ~5,000 meaningful state changes/hour — well within NATS and DataFeedBroker capacity.

---

## Key Design Constraints

1. **OpenSky anonymous rate limit**: 100 API credits/day for anonymous, 400 for registered. W18 uses a registered account; fallback to adsb.fi on 429.
2. **NOTAM EAD access**: EAD Basic API requires EUROCONTROL registration (free). The `NOTAM_EAD_API_KEY` env var must be set before W18 feeds go live.
3. **EASA drone.rules.eu API**: Public beta as of 2025; may require `Accept: application/json` header and returns GeoJSON FeatureCollection with UAS zone properties per EU 2021/664 Annex I.
4. **OSM Overpass rate limit**: 10,000 requests/day on public instance. Use `https://overpass-api.de/api/interpreter` with exponential backoff. Cache results for 24h.
5. **ACLED free tier**: 500 requests/month. 30min polling of SE Europe (Romania + Moldova + Ukraine border) stays within ~1,440 requests/month — requires academic/research registration.
6. **FIRMS API key**: Free NASA Earthdata account provides FIRMS_API_KEY. 1,000 requests/day limit.

---

## Non-Goals for W18

- W18 does not implement Remote ID (ASTM F3411) for EU over DragonFly hardware (planned W19)
- W18 does not implement live EUROCONTROL MUAC ATC feed (requires NDA, planned W20)
- W18 does not implement ADSB military track correlation (classified data, deferred)
- W18 does not add new UI components (existing W14 dashboard consumes feeds)
- W18 does not implement MarineTraffic paid tier (Black Sea AIS deferred to W19)
