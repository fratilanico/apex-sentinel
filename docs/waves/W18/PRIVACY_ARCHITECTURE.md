# APEX-SENTINEL W18 — PRIVACY ARCHITECTURE

## GDPR Compliance, EASA Data Handling, Aircraft Tracking Data Minimisation

---

## Regulatory Framework

| Regulation | Applicability to W18 |
|------------|---------------------|
| GDPR (EU) 2016/679 | Aircraft operator data, operator identity if identifiable |
| Commission Delegated Regulation (EU) 2019/945 | UAS operator registration data |
| Commission Implementing Regulation (EU) 2019/947 | UAS operational rules |
| Commission Delegated Regulation (EU) 2021/664 | U-space service provider obligations |
| Commission Implementing Regulation (EU) 2021/665 | U-space airspace designation |
| EASA Easy Access Rules for UAS (Ed. 3, 2022) | Operational category requirements |
| Romanian Law No. 8/2023 on UAS | National transposition |
| AACR Circular AC-UAS-001/2024 | Romanian UAS exclusion zones |

---

## Personal Data Assessment

### What is personal data in W18?

**Aircraft registration (N-number / YR-xxx registration):**
- Status: Potentially personal data if registration identifies a natural person (private aircraft owner)
- Legal basis for processing: Article 6(1)(e) GDPR — processing necessary for a task in the public interest (airspace safety)
- W18 treatment: Registration displayed if available from ADS-B metadata; NOT stored to database; in-memory only; purged on process restart

**ICAO24 hex address:**
- Status: Pseudonymous identifier — not directly personal data, but linkable to registration (which may be personal)
- W18 treatment: Stored in-memory ring buffer for deduplication; 24h retention cap; not logged to files beyond audit trail; not transmitted to third parties

**Aircraft operator name (from OpenSky metadata):**
- Status: May identify a natural person (sole trader operating a small aircraft)
- W18 treatment: Not stored; displayed in dashboard only; excluded from NATS payloads; explicitly set to `null` in `AircraftState.operator` when operator is identifiable as an individual

**Callsign:**
- Status: Operational identifier; not personal data for commercial aviation; may identify private pilots
- W18 treatment: Included in AircraftState; not logged; in-memory only

**Positional data (lat/lon of aircraft):**
- Status: Not personal data in isolation; personal data when combined with ICAO24 + registration
- W18 treatment: In-memory to 5dp precision; logged/transmitted to 4dp only (≈11m accuracy; sufficient for threat assessment, insufficient for surveillance)

### What is NOT personal data in W18?

- NOTAMs: Institutional data from ICAO/EUROCONTROL
- U-space zones: Regulatory data from EASA
- Protected zone definitions: Geographic/infrastructure data
- Atmospheric conditions: Meteorological data
- ACLED/FIRMS/GDELT events: Aggregate/institutional data (no individual tracking)
- OpenCelliD cell density: Statistical aggregation, not individual device tracking

---

## GDPR Article 5 Compliance

### Art. 5(1)(a) — Lawfulness, Fairness, Transparency

**Legal basis**: Article 6(1)(e) — processing necessary for a task in the public interest (airspace safety monitoring, civilian UAS threat detection for Romanian authorities).

**Fairness**: APEX-SENTINEL processes only aircraft operating in public airspace, which are legally required to broadcast ADS-B position data. There is no covert tracking.

**Transparency**: This Privacy Architecture document is published. Operators interacting with the system are informed via dashboard UI notice.

### Art. 5(1)(b) — Purpose Limitation

Data collected under W18 is used **exclusively** for:
1. Real-time airspace situational awareness for civilian UAS threat detection
2. Correlation with protected zone exclusion violations
3. Feed health monitoring (no personal data involved)

**Not permitted:**
- Individual aircraft owner surveillance
- Commercial data sale
- Retrospective tracking of specific aircraft
- Cross-border sharing without data sharing agreement

### Art. 5(1)(c) — Data Minimisation

W18 implements the following minimisation measures:

| Data Element | Full Resolution | Stored/Transmitted Resolution | Justification |
|-------------|----------------|------------------------------|---------------|
| Latitude | 6dp (±0.1m) | Memory: 5dp (±1m), Logs: 4dp (±11m) | 11m sufficient for threat zone assessment |
| Longitude | 6dp | As above | As above |
| Altitude | 1ft precision | 10ft precision in logs | 10ft sufficient for NOTAM altitude checks |
| Operator name | Full string | Null if individual, airline name if commercial | Individual operator identity not needed |
| ICAO24 | 6-char hex | Full (needed for dedup) | No PII, pseudonymous |

### Art. 5(1)(e) — Storage Limitation

| Data Type | Retention Policy | Enforcement |
|-----------|-----------------|-------------|
| AircraftState (in-memory) | 24h sliding window | Ring buffer with 24h TTL; automatic eviction |
| AircraftState (NATS payloads) | Not persisted by W18 | W18 does not write to Supabase |
| NOTAM data | Until NOTAM expires + 1h | NotamIngestor removes expired NOTAMs |
| SecurityEvents | 24h rolling buffer | SecurityEventCorrelator ring buffer |
| Feed health data | Session only | Lost on process restart |
| Atmospheric conditions | Single latest value | Overwritten on each poll |

**No aircraft tracking data is written to Supabase by W18.** This is a hard constraint. Any future W19+ persistence must go through a separate DPIA (Data Protection Impact Assessment).

### Art. 5(1)(f) — Integrity and Confidentiality

- All external API communications over HTTPS (TLS 1.2+)
- API keys stored in environment variables, not source code
- No aircraft data transmitted outside the APEX-SENTINEL system boundary
- NATS subjects on localhost / private network only

---

## GDPR Article 22 — Automated Decision-Making

W18 triggers automated decisions that affect airspace safety (zone breach alerts). Under Article 22 GDPR:

> "The data subject shall have the right not to be subject to a decision based solely on automated processing, including profiling, which produces legal effects concerning him or her or similarly significantly affects him or her."

**Assessment**: Zone breach alerts in APEX-SENTINEL do NOT constitute automated decisions under Art. 22 because:
1. Alerts notify human operators who make enforcement decisions
2. No automated enforcement action (no jam, no intercept) is taken
3. The system is a decision-support tool, not an autonomous actor

**However**, as a precaution and best practice, all automated alerts include:
- `"humanReviewRequired": true` flag in SecurityAlert
- `"automatedDecision": false` flag in all NATS payloads
- Dashboard UI label: "Requires operator confirmation before action"

---

## EASA UAS Data Handling Requirements

### U-Space Information Service (EU 2021/664 Art. 15)

W18's EasaUasZoneLoader acts as a consumer of U-space information services. Under EU 2021/664:

- Art. 4(1): U-space service providers must provide network identification service. W18 consumes this data but is not a UISP.
- Art. 15(1): U-space information service data must be made available to operators. W18 makes this data available to operators via the dashboard.
- Art. 15(2)(b): Data accuracy requirements. W18 uses the EASA reference implementation API. Data accuracy is the responsibility of EASA/national authority.

W18's use of drone.rules.eu is as a **data consumer**, not a **service provider**. No U-space service provider obligations apply.

### Remote ID Compliance (EU 2019/945 Art. 3)

W18 classifies contacts without ADS-B transponders as `Cat-D` (unknown/unregistered). This flags potential Remote ID non-compliance for EASA Open Category drones operating above 250g, which must broadcast Remote ID under EU 2019/945 Delegated Regulation, Annex Part 1 §5.

W18 does not currently receive Remote ID broadcasts (W19 milestone). The `Cat-D` classification is a **deficit indicator**, not a confirmed violation.

---

## Data Flow Map (Privacy Perspective)

```
External APIs (HTTPS)
  │
  ├── OpenSky / ADS-B Exchange / adsb.fi
  │   [Aircraft positions: pseudonymous ICAO24 + coordinates]
  │   ↓ 4dp truncation applied before any logging
  │   ↓ Operator name stripped if individual
  │   → In-memory AircraftState (24h retention)
  │   → NATS feed.eu.aircraft (no persistence by consumer W9)
  │   → Dashboard REST API (read-only display)
  │
  ├── EAD NOTAM / EASA UAS Zones / OSM Overpass
  │   [Institutional/geographic data — no personal data]
  │   → In-memory caches (no retention limit needed)
  │
  ├── OpenWeatherMap / open-meteo
  │   [Meteorological data — no personal data]
  │   → Single latest value (overwritten)
  │
  └── ACLED / FIRMS / GDELT
      [Aggregate/institutional event data — no individual tracking]
      → 24h ring buffer
      → SecurityAlert objects (no PII)

No data exits APEX-SENTINEL system boundary.
No data written to Supabase by W18.
No data shared with third parties.
```

---

## Data Protection Impact Assessment (DPIA) — Pre-Assessment

Under GDPR Art. 35, a full DPIA is required if processing is "likely to result in a high risk to the rights and freedoms of natural persons."

**W18 DPIA indicators:**

| Criterion (WP248 Guidelines) | W18 Assessment | Score |
|-----------------------------|----------------|-------|
| Evaluation/scoring | No individual scoring of persons | LOW |
| Automated decision-making | Human-in-the-loop, no automated enforcement | LOW |
| Systematic monitoring | Monitoring of public airspace (legal basis: public interest) | MEDIUM |
| Sensitive data | No special category data | LOW |
| Large-scale data | Up to 800 aircraft positions per 10s poll | MEDIUM |
| Data combination | ICAO24 + position + registration combination | MEDIUM |
| Vulnerable data subjects | No identified vulnerable subjects | LOW |
| Innovative technology | ADS-B aggregation is established technology | LOW |

**Overall assessment**: DPIA recommended but not mandatory for W18 given:
- Processing based on Art. 6(1)(e) public interest
- In-memory only, 24h retention
- No automated enforcement
- No sensitive data categories

A DPIA should be conducted before any W19 extension that adds persistent storage or automated enforcement.

---

## Privacy-Enhancing Technical Controls

1. **4dp coordinate truncation**: Applied in `AircraftPositionAggregator._logPosition()` before any logging statement
2. **Operator name stripping**: `_isIndividualOperator(name: string)` heuristic removes likely personal names
3. **24h ring buffer**: `SecurityEventCorrelator` and `AircraftPositionAggregator` both use a `RingBuffer<T>` with configurable TTL
4. **No-persistence guarantee**: `eu-data-integration-pipeline.ts` constructor explicitly does NOT accept a Supabase client; adding one requires a code review flag
5. **NATS local-only**: NATS server bound to `127.0.0.1` (not `0.0.0.0`); W18 NATS subjects not forwarded outside system boundary

---

## Privacy Contact

Data Controller: APEX OS / Nicolae Fratila
Processing basis: Article 6(1)(e) GDPR — public interest (civilian airspace safety)
DPA notification: Required before production deployment in Romania (ANSPDCP — Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal)
Contact: privacy@apex-os.eu (placeholder)
