# APEX-SENTINEL W18 — PRODUCT REQUIREMENTS DOCUMENT

## Product: EU Data Integration Layer
## Wave: W18 | Status: PLANNED | Owner: APEX OS / INDIGO Team

---

## Executive Summary

APEX-SENTINEL is a civilian drone detection and airspace awareness platform targeting Romania and the EU. W1–W17 built the complete detection, classification, escalation, and presentation stack. W18 grounds the system in real EU operational data: live aircraft positions from 3 ADS-B networks, official NOTAM airspace restrictions, EASA U-space zones, critical infrastructure overlays, atmospheric conditions, and OSINT security event correlation.

The product requirements in this document govern what W18 must deliver from the perspective of the **airspace security operator** — the human using APEX-SENTINEL in a monitoring center or field-deployed unit protecting a Romanian or EU airspace zone.

---

## Stakeholders

| Role | Interest |
|------|----------|
| Airspace Security Operator | Real-time situational awareness; needs live ADS-B + threat correlation |
| National Authority (AACR) | NOTAM compliance, EASA zone enforcement, audit trail |
| Critical Infrastructure Operator | Alerts when unauthorized UAS enters exclusion zone buffer |
| APEX OS Engineering | Feed reliability metrics, rate limit management, CI health |
| EUDIS Hackathon Evaluators | Demonstrable real-data integration with EU regulatory compliance |

---

## User Stories

### US-W18-01: Live Aircraft Positions — Operator View

**As an** airspace security operator
**I want to** see all aircraft currently within Romanian airspace (bbox 43.5–48.5°N / 20.2–30.0°E)
**So that** I can distinguish cooperative air traffic from potential UAS threats

**Acceptance Criteria:**
- Aircraft positions refresh within 30 seconds
- Each aircraft shows: ICAO24, callsign, lat, lon, altitude (baro + geometric), velocity, heading, category
- Positions merged from OpenSky + ADS-B Exchange + adsb.fi; same ICAO24 not shown twice
- Aircraft without ADS-B transponder (no ICAO24) flagged as `Cat-D Unknown`
- Operator can filter by altitude band (0–120m, 120–500m, 500m+)

**Out of scope:** operator cannot modify aircraft data; display only

---

### US-W18-02: NOTAM Overlay — Airspace Restriction Visibility

**As an** airspace security operator
**I want to** see active NOTAM airspace restrictions as overlaid zones on the map
**So that** I can immediately know when a detected aircraft or UAS is violating a restriction

**Acceptance Criteria:**
- Active NOTAMs covering Romanian bbox fetched from EAD Basic API every 5 minutes
- Each NOTAM displayed as a GeoJSON polygon with: NOTAM ID, lower/upper limits (FL), validity window, affected area, ICAO classification (D, R, P, W)
- Expired NOTAMs automatically removed from display
- Operator receives an alert if any tracked aircraft enters a NOTAM Type R (Restricted) or P (Prohibited) area
- NOTAMs for Henri Coandă (LROP), Constanța (LRCK), Deveselu (LRBS), and Cernavodă always shown regardless of NOTAM type

---

### US-W18-03: EASA U-Space Zone Display

**As an** airspace security operator
**I want to** see all EU U-space zones (restricted, prohibited, conditional) for Romania
**So that** I can enforce drone-free corridors defined under EU 2021/664

**Acceptance Criteria:**
- EASA drone.rules.eu U-space zones loaded for Romania at startup and refreshed every 5 minutes
- Zone types colour-coded: Prohibited (red), Restricted (orange), Conditional (yellow)
- Each zone shows: zone ID, name, type, lower/upper altitude limit AGL, applicable UAS categories, activation schedule if conditional
- Operator can query: "what zones apply at this lat/lon at this altitude?"
- Zones persist in-memory; system remains functional if drone.rules.eu is temporarily unreachable (last-known-good cache)

---

### US-W18-04: Critical Infrastructure Exclusion Zones

**As an** airspace security operator
**I want to** see predefined exclusion zones around airports, nuclear plants, NATO bases, and government buildings
**So that** I am alerted the moment a UAS contact enters a buffer zone around critical infrastructure

**Acceptance Criteria:**
- System loads Romania critical infrastructure from OSM Overpass (airports, nuclear, military, power stations) at startup
- Hardcoded authoritative exclusion radii for:
  - Henri Coandă: 5km exclusion, 8km CTR
  - Cernavodă Nuclear: 10km exclusion
  - Deveselu NATO: 5km exclusion
  - All other airports: 3km exclusion, 5km CTR
  - Bucharest government district: 2km exclusion
- Alert generated when any AircraftState enters an exclusion zone
- Operator sees which zone was entered, aircraft identity, time, and current heading

---

### US-W18-05: Drone Flight Conditions Assessment

**As an** airspace security operator
**I want to** see a real-time drone flyability score and atmospheric conditions
**So that** I can contextualise threat probability and sensor performance expectations

**Acceptance Criteria:**
- Flyability score 0–100 displayed prominently (100 = ideal drone conditions, 0 = impossible to fly)
- Score factors: wind speed (<8 m/s safe, 8–12 m/s marginal, >12 m/s unflyable for Cat-A), visibility (>5km good, 1–5km marginal, <1km poor), precipitation (none/light/heavy), temperature (−10°C to +45°C operational range for DJI class)
- Data merged from open-meteo and OpenWeatherMap
- Acoustic detection range adjustment factor displayed: e.g. "Wind 6 m/s SW → acoustic range −18%"
- Conditions updated every 5 minutes for Bucharest (44.43°N, 26.10°E) and optionally for other nodes

---

### US-W18-06: OSINT Security Event Correlation

**As an** airspace security operator
**I want to** see recent security events (protests, incidents, border activity) in Romania and SE Europe correlated with protected zone proximity
**So that** I can adjust threat posture and pre-position detection assets

**Acceptance Criteria:**
- ACLED events for Romania + Moldova + Ukraine (border 50km) fetched every 30 minutes
- FIRMS thermal anomalies for Romania bbox fetched every 30 minutes (forest fire / industrial anomaly indicator)
- GDELT media events for Romania/SE Europe fetched every 30 minutes
- Events within 25km of any ProtectedZone emit a SecurityEvent with: event type, source, distance to nearest protected zone, goldstein scale (ACLED/GDELT only)
- Operator sees a 24h rolling timeline of security events sorted by proximity to protected zones

---

### US-W18-07: Feed Health Dashboard

**As an** APEX OS operator
**I want to** see the health status of all 15+ EU data feeds
**So that** I can identify and remediate feed outages before they affect threat detection

**Acceptance Criteria:**
- Each feed shows: last successful poll timestamp, error count in last hour, rate limit remaining, circuit breaker state (CLOSED/OPEN/HALF-OPEN)
- Degraded feed emits a NATS message to `system.health` (W16 SystemHealthDashboard channel)
- If OpenSky AND ADS-B Exchange both fail, system alerts operator and falls back to adsb.fi only
- If all 3 ADS-B sources fail simultaneously, alert escalates to AWNING YELLOW (W10 protocol)
- Health dashboard accessible via existing W14 dashboard API `/api/feeds/health`

---

### US-W18-08: Historical Playback Data Quality

**As an** APEX OS engineer
**I want to** replay a 1-hour window of EU feed data
**So that** I can debug false positive/negative detections and tune correlation thresholds

**Acceptance Criteria:**
- All feed data timestamped with ISO-8601 UTC at ingest
- Each AircraftState record carries source feed identifier (opensky/adsbexchange/adsbfi)
- NOTAM restrictions carry EAD issue timestamp and effective period
- SecurityEvents carry source ACLED/FIRMS/GDELT and raw payload reference
- System retains last 24h of feed snapshots in memory ring buffer (configurable, default 1h)

---

## Non-Functional Requirements

| NFR | Requirement | Measurement |
|-----|-------------|-------------|
| NFR-W18-01 | Feed poll latency | p99 < 3s per feed poll (exclusive of network I/O) |
| NFR-W18-02 | AircraftState dedup | 0 duplicate ICAO24 in any emission cycle |
| NFR-W18-03 | Memory budget (W16 compliant) | DataFeedBroker ≤ 50MB; EU feeds total ≤ 30MB additional |
| NFR-W18-04 | Rate limit compliance | Zero 429 errors in steady-state operation |
| NFR-W18-05 | Feed resilience | Single feed failure does not degrade overall system health below NOMINAL |
| NFR-W18-06 | GDPR data retention | Raw aircraft positions purged after 24h |
| NFR-W18-07 | Test coverage | ≥ 80% branches/functions/lines for all W18 source files |
| NFR-W18-08 | Zero regressions | All 3097 existing tests remain GREEN after W18 merge |

---

## Regulatory Requirements

| Regulation | Requirement | W18 Implementation |
|------------|-------------|-------------------|
| EU 2019/945 Art. 3 | UAS operator registration | W18 checks Remote ID (ASTM F3411) for registered operators; Cat-D flag for unregistered |
| EU 2021/664 Art. 4–7 | U-space service provider integration | EasaUasZoneLoader implements U-space zone query per Art. 4 |
| GDPR Art. 5(1)(e) | Storage limitation | Aircraft positions anonymised, 24h retention cap |
| GDPR Art. 22 | Automated decision-making | Exclusion zone alerts flagged as "human operator review required" |
| Commission Implementing Regulation EU 2021/665 | U-space airspace designation | NOTAMs enriched with U-space applicability flag |
| EASA Easy Access Rules for UAS (2022) | Operational categories | Cat-A/B/C/D classification aligned with EASA UAS category definitions |

---

## Success Metrics for W18

| Metric | Target |
|--------|--------|
| ADS-B feed coverage (% Romanian airspace time with live data) | ≥ 95% |
| NOTAM parse success rate | ≥ 98% of active NOTAMs correctly parsed |
| Protected zone alert latency (detection → alert) | ≤ 60 seconds end-to-end |
| Flyability score accuracy (vs manual METAR assessment) | Correlation ≥ 0.85 |
| Test suite: W18 FRs | ≥ 160 new tests, all GREEN |
| Total test suite post-W18 | ≥ 3257 tests GREEN |

---

## Out of Scope (W18)

- MarineTraffic AIS integration (deferred W19 — requires paid API for real-time)
- EUROCONTROL MUAC upper airspace real-time feed (requires NDA — deferred W20)
- Military aircraft track declassification (classified data — out of scope)
- Drone Remote ID ground station hardware integration (W19)
- Automated enforcement actions (outside civilian platform mandate)
- Alert distribution via Telegram/SMS (existing W1 AlertRouter handles this; W18 produces SecurityEvent objects only)
