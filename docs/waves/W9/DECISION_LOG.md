# W9 — DECISION_LOG
Wave 9: Live Data Feed Integration | APEX-SENTINEL | 2026-03-26

---

## DEC-W9-01: adsb.lol over OpenSky Network

**Decision:** Use adsb.lol as the primary ADS-B data source.

**Context:** Two viable free ADS-B APIs evaluated: OpenSky Network (research API) and adsb.lol.

**Rationale:**
- OpenSky Network research API has 5–10s data delay and strict rate limits (400 credits/day anonymous, 4000 authenticated). MLAT positions are suppressed in many regions.
- adsb.lol provides unfiltered ADS-B data with no MLAT suppression, better coverage in Eastern Europe, no authentication required for bounding-box queries, and sub-5s latency.
- For security use cases (detecting anomalous aircraft behaviour, squawk codes, no-transponder aircraft), unfiltered data is operationally critical.

**Fallback:** OpenSky Network as secondary source if adsb.lol rate-limits or changes ToS (tracked in RISK-W9-01).

**Date:** 2026-03-26

---

## DEC-W9-02: Open-Meteo over NOAA/NWS

**Decision:** Use Open-Meteo as the weather data source.

**Context:** Multiple weather APIs evaluated: NOAA/NWS, OpenWeatherMap (paid tier for commercial), Open-Meteo.

**Rationale:**
- NOAA/NWS API is Americas-only — does not cover Romania/Ukraine theater, which is the primary operational zone for EUDIS hackathon and INDIGO team.
- OpenWeatherMap free tier has 1000 calls/day limit and requires API key management.
- Open-Meteo: completely free, no API key required, global coverage (ECMWF + DWD model data), REST JSON, 1–15 min update latency, explicitly permits non-commercial and research use.

**Date:** 2026-03-26

---

## DEC-W9-03: alerts.in.ua as Primary for Romania/Ukraine Theater

**Decision:** Use alerts.in.ua as the primary civil protection alert source.

**Context:** Need real-time air raid and emergency alert data for the operational theater.

**Rationale:**
- alerts.in.ua provides real-time Ukrainian air alert data with official CAP-compatible structure.
- Romanian civil protection (RO-ALERT) does not have a public machine-readable API; alerts.in.ua includes cross-border coverage.
- Real-time air raid correlation is a critical capability for the EUDIS hackathon demonstration — judges expect this feed to be live.
- CAP (Common Alerting Protocol) level mapping to AWNING levels is straightforward and already documented.

**Constraint:** Dependent on alerts.in.ua uptime and format stability. Defensive parsing with fixture-based tests mitigates format drift risk (RISK-W9-02).

**Date:** 2026-03-26

---

## DEC-W9-04: GDELT 2.0 over Twitter/X API

**Decision:** Use GDELT 2.0 as the OSINT event source rather than social media APIs.

**Context:** Need OSINT corroboration signal for drone/UAV activity in area.

**Rationale:**
- Twitter/X API (now X API) requires Enterprise tier for real-time access; Basic tier (US$100/month) has rate limits and does not support geospatial filtering at the required granularity.
- GDELT 2.0 is free, open-access, globally structured, and publishes event records derived from ~100k global news sources with 15-minute update latency.
- GDELT geo API supports bounding-box filtering natively, making it directly usable for our spatial use case.
- Limitations accepted: 15-minute latency means GDELT is an early-warning/corroboration layer, not a primary real-time source. This is explicitly documented in AI_PIPELINE.md.

**Date:** 2026-03-26

---

## DEC-W9-05: No Satellite Imagery Integration in W9

**Decision:** Defer satellite imagery integration to W12+.

**Context:** Sentinel-2 (ESA Copernicus) was proposed as a potential feed for visual confirmation.

**Rationale:**
- Sentinel-2 revisit time is 1–5 days depending on latitude — not real-time enough to be useful as a live detection feed.
- Sentinel-2 imagery requires significant processing (GeoTIFF → tile → ML inference) which is out of scope for W9's feed integration focus.
- Planet Labs commercial API (daily revisit) would require a paid contract not in budget.
- Decision: schedule satellite imagery for W12 (Infrastructure Correlation wave) or later, when we have ML Fusion (W13) to process imagery outputs.

**Date:** 2026-03-26

---

## DEC-W9-06: Deterministic Scoring in W9, ML Deferred to W13

**Decision:** ThreatContextEnricher uses deterministic rule-based scoring in W9. ML model integration is deferred to W13.

**Context:** Option to integrate a pre-trained classifier in W9 was evaluated.

**Rationale:**
- Insufficient labeled training data at W9 time — `detection_enriched` table starts populating from W9 deployment onwards.
- Deterministic rules are explainable, auditable, and verifiable in tests — important for the EUDIS hackathon where judges will ask "why did it flag this?".
- Interface contract is designed for drop-in ML replacement (see AI_PIPELINE.md §W13 ML Integration Path).
- W13 will have ~3+ months of enriched detection data for training.

**Date:** 2026-03-26

---

## DEC-W9-07: Remote ID Operator Coordinates Coarsened to ±50m

**Decision:** Remote ID operator GPS coordinates are coarsened to a ±50m grid before any storage or transmission.

**Context:** ASTM F3411 Remote ID includes operator GPS location to meter-level precision.

**Rationale:**
- Operator GPS to meter-precision constitutes personal data under GDPR Art.4 when operator is a natural person.
- ±50m grid (floor(lat*20)/20) provides sufficient spatial context for threat assessment (500m beacon radius) while removing identifying precision.
- Consistent with privacy-by-design principle; no post-hoc anonymisation needed.

**Date:** 2026-03-26
