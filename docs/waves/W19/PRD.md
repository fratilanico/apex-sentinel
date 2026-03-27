# APEX-SENTINEL W19 — PRODUCT REQUIREMENTS DOCUMENT

## Theme: Romania/EU Threat Intelligence Layer

### Document Control

| Field | Value |
|-------|-------|
| Wave | W19 |
| Status | PLANNED |
| Author | APEX OS Kernel (automated) |
| Regulatory Stakeholders | AACR, ROMATSA, CNCAN, ANSPDCP |
| Operator Personas | ATC Supervisor, Security Officer, AACR Inspector, ROMATSA Controller |

---

## Executive Summary

W19 transforms the real-time EU situational picture (W18 output) into structured, actionable, regulation-compliant threat intelligence for Romanian and EU authorities. The product requirement is: **given live aircraft positions and protected zone data, the system must automatically classify threats, score their severity, and produce formatted reports ready for direct submission to AACR and ROMATSA — with appropriate GDPR anonymisation for civil traffic.**

This is not a detection system. Detection is done by W3–W8. W19 is a **threat intelligence and regulatory reporting layer**.

---

## Stakeholder Personas

### Persona 1: ATC Supervisor — Andrei Popescu, ROMATSA, LROP ACC

**Role**: Air Traffic Control supervisor at the Bucharest Area Control Centre (ACC), responsible for the Bucharest FIR (LRBB).

**Primary Concern**: Is there a non-cooperative UAS that will conflict with inbound/outbound traffic at LROP? Has a NOTAM already been issued?

**User Stories**:

- As an ATC supervisor, I want to receive a structured ROMATSA coordination message when a Cat-D UAS is detected within 8km of LROP, so that I can coordinate with sector controllers and issue a holding pattern if needed.
- As an ATC supervisor, I want the coordination message to indicate whether an active NOTAM already covers the affected area, so that I do not issue duplicate restrictions.
- As an ATC supervisor, I want AWNING level RED events to automatically generate a draft NOTAM for my review, with all mandatory ICAO fields pre-filled, so that I can approve and transmit within 2 minutes.
- As an ATC supervisor, I want all coordination messages to include the SELCAL-style incident identifier, so that I can cross-reference with the AACR incident report.

**Acceptance**: ROMATSA coordination message received within 60 seconds of breach detection. NOTAM draft correctly identifies affected FIR (LRBB), sector, and time bounds.

---

### Persona 2: Security Officer — Mihaela Stoica, DSAS (Direcția Securitate Aeronautică și Siguranță), AACR

**Role**: AACR security inspector responsible for UAS incident reporting under Romanian aviation law.

**Primary Concern**: Has a reportable UAS incident occurred? What is the incident category? Is the operator cooperative?

**User Stories**:

- As an AACR security officer, I want to receive a formatted AACR incident notification (SIRA format) for every ORANGE or RED AWNING event, so that I can initiate the mandatory incident investigation under HG 1083/2013.
- As an AACR security officer, I want the notification to include aircraft category classification with confidence score, so that I can determine whether the operator is likely to be identifiable via EASA registration.
- As an AACR security officer, I want Cat-D (unknown/non-cooperative) incidents to be clearly flagged as requiring operator confirmation, so that I do not close the incident report prematurely.
- As an AACR security officer, I want position data in all incident reports to be WGS-84 coordinates plus the nearest ICAO airport designator, so that the report is immediately compatible with EUROCONTROL MUAC incident logging.
- As an AACR security officer, I want incidents near Cernavodă to be automatically escalated to the CNCAN nuclear security liaison, so that the mandatory dual-authority notification under CNCAN Order 180/2014 is triggered.

**Acceptance**: AacrNotification contains all 7 required SIRA fields. CNCAN flag correctly set for nuclear zone breaches. Operator confirmation required flag = true for all Cat-D incidents.

---

### Persona 3: Privacy Officer — Elena Dumitrescu, DPO, APEX-SENTINEL

**Role**: Data Protection Officer responsible for GDPR compliance of APEX-SENTINEL processing activities.

**Primary Concern**: Are we collecting and processing aircraft position data in compliance with GDPR? Is the legal basis documented? Is data minimised and time-limited?

**User Stories**:

- As the DPO, I want Cat-A commercial aircraft tracks to be automatically pseudonymised after 30 seconds of tracking, so that we do not retain identifiable position data beyond operational necessity.
- As the DPO, I want all position data in logs and NATS events to be grid-snapped to a 100m resolution grid, so that precise individual position is not reconstructable from log files.
- As the DPO, I want Cat-D (unknown) aircraft to be exempt from anonymisation with the legal basis documented as GDPR Art.6(1)(e) (public interest / security), so that security investigations are not hampered by premature anonymisation.
- As the DPO, I want all automated threat decisions above YELLOW AWNING to include a human confirmation required flag, so that we comply with GDPR Art.22 prohibition on solely automated decisions with significant effects.
- As the DPO, I want the system to enforce a 24-hour hard limit on raw position data retention in all in-memory buffers, so that we comply with GDPR Art.5(1)(e) storage limitation principle.

**Acceptance**: AnonymisedTrack produced within 30s for Cat-A. Grid-snap precision verified to 100m. Art.22 flag set on all ORANGE/RED notifications. 24h TTL enforced in ring buffer eviction.

---

### Persona 4: ROMATSA Controller — Bogdan Niculescu, ROMATSA Bucharest ACC Night Shift

**Role**: En-route ATC controller, receives system coordination messages as advisory inputs during shift.

**User Stories**:

- As a ROMATSA controller, I want to see AWNING level per protected zone on my sector strip, so that I have situational awareness without leaving the primary ATC display.
- As a ROMATSA controller, I want coordination messages to specify whether the breach is ENTERING, INSIDE, or EXITING the zone, so that I can judge whether to initiate separation action or monitor.
- As a ROMATSA controller, I want the system to indicate time-to-breach in seconds for approaching aircraft, so that I have lead time to plan a response.
- As a ROMATSA controller, I want incidents at Mihail Kogălniceanu (LRCK, NATO co-located) to be automatically marked with a NATO sensitivity flag, so that the appropriate NATO liaison protocol is engaged.

**Acceptance**: ZoneBreach.breachType correctly distinguishes ENTERING/INSIDE/EXITING. ttBreachS computed for approaching aircraft. NATO flag set for LRCK zone breaches.

---

## Functional Requirements Summary

| FR ID | Feature | Priority | Tests |
|-------|---------|----------|-------|
| FR-W19-01 | EasaCategoryClassifier | P0 | 14 |
| FR-W19-02 | ProtectedZoneBreachDetector | P0 | 13 |
| FR-W19-03 | ThreatScoringEngine | P0 | 15 |
| FR-W19-04 | EuAwningLevelAssigner | P0 | 12 |
| FR-W19-05 | GdprTrackAnonymiser | P0 | 11 |
| FR-W19-06 | AacrNotificationFormatter | P1 | 10 |
| FR-W19-07 | RomatsaCoordinationInterface | P1 | 10 |
| FR-W19-08 | W19ThreatIntelPipeline | P0 | 13 |
| **Total** | | | **98** |

All FRs are P0 or P1. There are no P2 items in W19 — every feature has a direct regulatory or operational use case with a named stakeholder.

---

## AACR Integration Requirements

### SIRA (Sistem Informatic de Raportare a Accidentelor) Template Fields

The Romanian Civil Aeronautical Authority incident reporting system requires:

1. **Incident Identifier** — UUID, generated by W19, format: `AACR-YYYY-NNNNNN`
2. **Date/Time UTC** — ISO-8601, must be time of first breach detection, not time of report generation
3. **Location** — ICAO aerodrome designator (preferred) or decimal lat/lon (fallback)
4. **Aircraft Description** — EASA category, estimated size class, transponder type
5. **Threat Level** — maps directly to AWNING colour (GREEN/YELLOW/ORANGE/RED)
6. **Recommended Action** — MONITOR | WARN | INTERCEPT | EMERGENCY
7. **Operator Confirmation Required** — boolean; true for all Cat-D and all automated ORANGE/RED decisions

W19 must generate all 7 fields. Fields 3 (location) and 4 (aircraft description) use anonymised data for Cat-A aircraft; unredacted for Cat-D.

### AACR Notification Triggers

| AWNING Level | Zone Type | Action |
|--------------|-----------|--------|
| YELLOW | Any | Generate notification, internal queue only |
| ORANGE | Airport | Dispatch to AACR SIRA system; operator confirmation required |
| ORANGE | Nuclear | Dispatch to AACR + CNCAN liaison; immediate escalation |
| ORANGE | Military | Dispatch to AACR + SMAp notification (W21 feature, flagged for now) |
| RED | Any | Dispatch to AACR + ROMATSA + emergency services; human confirmation mandatory |

---

## ROMATSA Integration Requirements

### Coordination Message Format

ROMATSA uses ICAO Doc 4444 §10 ATC coordination procedures. The coordination message must be machine-readable with a human-readable summary.

Required fields:
- **SELCAL-style identifier**: `APEX-[YYYY]-[NNNNNN]` format (non-standard but ROMATSA agreed format per MOU, assumed)
- **Affected FIR**: `LRBB` (Bucharest FIR, ROMATSA AoR) or `LRTS` (sub-sector) or regional unit
- **Incident type**: `UAS_BREACH` | `UAS_APPROACH` | `UAS_SUSPECTED`
- **Aircraft particulars**: ICAO24 hex (if known), category, heading, speed, altitude
- **Breach status**: ENTERING | INSIDE | EXITING + distance in metres
- **Active NOTAMs**: list of active NOTAM IDs covering the affected area
- **AWNING level**: current zone AWNING level
- **Recommended action**: MONITOR | WARN | INTERCEPT | EMERGENCY

### NOTAM Cross-Reference Requirement

Before generating a coordination message, the `RomatsaCoordinationInterface` must cross-reference active NOTAMs from W18's `NotamIngestor`. If the breach area is already covered by an active NOTAM (type R, P, or D), the coordination message must note this and downgrade recommended action by one level (INTERCEPT → WARN, WARN → MONITOR). This prevents duplicate alerts for known restricted airspace events.

---

## Non-Functional Requirements

### Performance

| Metric | Requirement | Rationale |
|--------|-------------|-----------|
| Pipeline cycle time | < 500ms per full picture update | Operational: ATC needs < 1s AWNING updates |
| Breach detection | ≤ 10s after first aircraft-in-zone | Regulatory: AACR incident timestamp accuracy |
| Notification generation | < 5s after ORANGE/RED threshold crossed | AACR: timely incident reporting obligation |
| Memory footprint | < 5MB ThreatIntelPicture | Edge constraint: Raspberry Pi 4 deployment |

### Reliability

- All 8 FRs must degrade gracefully if any W18 feed is unavailable
- GdprTrackAnonymiser must never block pipeline execution; failure = passthrough with error flag
- AacrNotificationFormatter must produce well-formed output even if atmospheric data is unavailable (omit atmospheric modifier, document in notification)

### Security

- ThreatIntelPicture must not be logged in plaintext; all position data grid-snapped before any log emission
- AnonymisedTrack must use HMAC-SHA-256 pseudonymisation with a per-deployment secret, not a simple hash
- ROMATSA coordination messages must be marked TLP:RED (Traffic Light Protocol) in their header

### Compliance

- All automated decisions at ORANGE or RED must include `operatorConfirmationRequired: true`
- All Cat-D aircraft tracks must be retained indefinitely (no anonymisation, no TTL) until the incident is formally closed by an AACR inspector
- ANSPDCP notification required if any personal data breach occurs in the pipeline; W19 includes a `privacyBreachFlag` field in ThreatIntelPicture for W20 dispatch

---

## Success Criteria

W19 is COMPLETE when:

1. All 98 tests GREEN with no regressions to the W1–W18 test suite
2. `EasaCategoryClassifier` correctly classifies all 4 categories with ≥ 0.9 confidence for unambiguous inputs
3. `ProtectedZoneBreachDetector` detects every aircraft-zone pair within haversine accuracy tolerance (< 1m error at Romanian latitudes)
4. `ThreatScoringEngine` produces scores in [0, 100] for all valid inputs; deterministic on repeated identical inputs
5. `EuAwningLevelAssigner` applies correct zone-type thresholds (nuclear lower than airport, verified by unit test)
6. `GdprTrackAnonymiser` anonymises Cat-A within 30s, never anonymises Cat-D
7. `AacrNotificationFormatter` produces all 7 SIRA fields for every ORANGE/RED event
8. `RomatsaCoordinationInterface` suppresses alerts for aircraft already covered by active NOTAM
9. `W19ThreatIntelPipeline` emits all 4 NATS events: breach_detected, awning_change, aacr_notification, romatsa_coordination
10. GDPR Art.22 `operatorConfirmationRequired` flag correctly set on all automated ORANGE/RED decisions
