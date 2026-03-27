# APEX-SENTINEL W19 — DESIGN

## Theme: Romania/EU Threat Intelligence Layer

### Wave Summary

| Field | Value |
|-------|-------|
| Wave | W19 |
| Theme | Romania/EU Threat Intelligence Layer |
| Status | PLANNED |
| Target Geography | Romania + EU, centred on Bucharest (44.43°N, 26.10°E) |
| Prior Waves | W1–W18 complete, 3097+ tests GREEN |
| Threat Model | Civilian UAS — EASA Category A/B/C/D, proximity breach, AWNING escalation |
| Regulatory Frame | EU 2019/945, EU 2021/664 (U-space), GDPR Art.5/6/22, AACR incident reporting |
| Primary Consumers | AACR (Romanian Civil Aeronautical Authority), ROMATSA (Romanian ATS Provider) |

---

## Problem Statement

APEX-SENTINEL W1–W18 built a complete detection and real-data ingestion stack. W18 provides live-validated feed types: `AircraftState[]`, `NotamRestriction[]`, `EasaUasZone[]`, `ProtectedZone[]`, `AtmosphericConditions`, `SecurityEvent[]`, and `FeedHealth[]`.

The critical gap entering W19: **ingested data is not transformed into structured threat intelligence**. The system knows an aircraft is inside a protected zone — it does not yet produce:

- A formal **breach event** with distance, type, and time-to-breach estimate
- A **threat score** (0–100) integrating proximity, aircraft category, weather, and security context
- A zone-specific **AWNING level** calibrated against Romanian site types (airport vs nuclear vs NATO base)
- A **GDPR-compliant anonymised track** for civil aircraft to satisfy EU 2019/945 privacy requirements
- A formatted **AACR incident report** for mandatory regulatory notification
- An **ATC coordination message** for ROMATSA when airspace safety is affected

W19 is the intelligence layer that converts raw situational awareness into structured, actionable, regulation-compliant threat output.

---

## Design Principles

### 1. Threat-by-Proximity, Modulated by Context

Distance to a protected zone boundary is the primary threat signal. Category classification (FR-W19-01) modulates base proximity score. Atmospheric conditions (flyability) act as an amplifier — good flying weather increases threat significance. Active security events in the vicinity push scores upward via an additive bonus.

This produces a coherent physical model: a small slow electric drone (Cat-A) near an airport in calm weather with a recent security alert is a higher threat than a fast commercial aircraft (Cat-A commercial, cooperative transponder) transiting at cruise altitude.

### 2. Zone-Type Sensitivity Differentiation

Romania's critical infrastructure has different consequence profiles:

- **Airports (LROP, LRCL, LRTR, LRCK, LRSB)**: ICAO Annex 14 + EU 2019/947 Article 16 exclusion zones. UAS breach is an aviation safety incident under Romanian HG 1083/2013.
- **Nuclear plant (Cernavodă)**: CNE Cernavodă is Romania's only nuclear facility. CNCAN (Comisia Națională pentru Controlul Activităților Nucleare) mandates zero-tolerance airspace. Lower AWNING thresholds justified by consequence severity.
- **NATO/Military (Deveselu/MK88, Câmpia Turzii, Fetești)**: Article 5 NATO security implications. SOFA (Status of Forces Agreement) obligations. Coordination with SMAp (Statul Major al Apărării) and/or Allied Command Operations.
- **Government district (Bucharest CDQ/Piața Victoriei corridor)**: Romanian Law 218/2002 on public order. Presidential administration and parliamentary functions.

### 3. Regulatory-Native Output

Every W19 output type is designed for direct submission to a Romanian or EU regulatory body without reformatting:
- AACR notifications use the AACR Incident Reporting System (SIRA) template fields
- ROMATSA messages conform to ICAO Doc 4444 ATC coordination format with Romanian-specific SELCAL-style identifiers
- GDPR anonymisation follows ANSPDCP (Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal) guidance on pseudonymisation

### 4. Zero Breaking Changes

All W19 components consume the `EuSituationalPicture` interface produced by W18's `EuDataIntegrationPipeline`. No W1–W18 source files are modified. W19 is a purely additive intelligence tier above the data integration tier.

### 5. AWNING Continuity

W19's `EuAwningLevelAssigner` (FR-W19-04) is a zone-aware specialisation of the W10 `AwningLevelPublisher`. It feeds back into the W10 AWNING state machine via the existing `awning_change` NATS subject. W10 remains the canonical AWNING publisher; W19 provides the per-zone inputs.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    W18 EuSituationalPicture (inputs to W19)                  │
│                                                                              │
│  AircraftState[]    NotamRestriction[]    EasaUasZone[]    ProtectedZone[]   │
│  AtmosphericConditions    SecurityEvent[]    FeedHealth[]                     │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    W19 Threat Intelligence Pipeline (FR-W19-08)              │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  FR-W19-01  EasaCategoryClassifier                                    │  │
│  │  AircraftState → UasThreatCategory + confidence                       │  │
│  └───────────────────────────────┬───────────────────────────────────────┘  │
│                                  │                                           │
│  ┌───────────────────────────────▼───────────────────────────────────────┐  │
│  │  FR-W19-02  ProtectedZoneBreachDetector                               │  │
│  │  AircraftState[] × ProtectedZone[] → ZoneBreach[]                    │  │
│  └───────────────────────────────┬───────────────────────────────────────┘  │
│                                  │                                           │
│  ┌───────────────────────────────▼───────────────────────────────────────┐  │
│  │  FR-W19-03  ThreatScoringEngine                                       │  │
│  │  ZoneBreach[] + UasThreatCategory + AtmosphericConditions             │  │
│  │  + SecurityEvent[] → ThreatScore[]                                    │  │
│  └───────────────────────────────┬───────────────────────────────────────┘  │
│                                  │                                           │
│  ┌───────────────────────────────▼───────────────────────────────────────┐  │
│  │  FR-W19-04  EuAwningLevelAssigner                                     │  │
│  │  ThreatScore[] × ProtectedZone.type → AwningLevel per zone            │  │
│  └───────────────────────────────┬───────────────────────────────────────┘  │
│                                  │                                           │
│  ┌───────────────────────────────▼───────────────────────────────────────┐  │
│  │  FR-W19-05  GdprTrackAnonymiser                                       │  │
│  │  AircraftState → AnonymisedTrack (grid-snapped, pseudonymised)        │  │
│  └───────────────────────────────┬───────────────────────────────────────┘  │
│                                  │                                           │
│  ┌───────────────────────────────▼───────────────────────────────────────┐  │
│  │  FR-W19-06  AacrNotificationFormatter                                 │  │
│  │  ZoneBreach + ThreatScore + AwningLevel → AacrNotification            │  │
│  └───────────────────────────────┬───────────────────────────────────────┘  │
│                                  │                                           │
│  ┌───────────────────────────────▼───────────────────────────────────────┐  │
│  │  FR-W19-07  RomatsaCoordinationInterface                              │  │
│  │  AwningLevel + NotamRestriction[] + ZoneBreach[] → RomatsaMessage     │  │
│  └───────────────────────────────┬───────────────────────────────────────┘  │
│                                  │                                           │
└──────────────────────────────────┼───────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    ThreatIntelPicture (W19 output / W20 input)               │
│                                                                              │
│  breaches: ZoneBreach[]                                                      │
│  scores: ThreatScore[]                                                       │
│  awningLevels: Map<string, AwningLevel>                                      │
│  notifications: AacrNotification[]                                           │
│  coordinationMessages: RomatsaCoordinationMessage[]                          │
│  anonymisedTracks: AnonymisedTrack[]                                         │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼ NATS events
              breach_detected | awning_change | aacr_notification | romatsa_coordination
```

---

## Key Design Decisions

### EASA Category → Threat Category Mapping

EASA Commission Regulation EU 2019/945 defines UAS subcategories for the Open and Specific category. The ADS-B Emitter Category field (from Mode S extended squitter message type 31) provides a machine-readable classification. W19 maps these:

| ADS-B Emitter Cat | EASA Category | W19 Threat Category | Rationale |
|-------------------|---------------|---------------------|-----------|
| A0–A7 (GA, commercial) | Open Cat-A | cat-a-commercial | Cooperative, registered, insured |
| B0–B3 (rotorcraft, UAV) | Open/Specific | cat-b-modified | Non-standard flight profile |
| C0–C3 (surface vehicle, obstacle) | Specific | cat-c-surveillance | Potential ISR mission profile |
| No transponder / squawk only | Certified/Unknown | cat-d-unknown | Non-cooperative, highest risk |

The critical case is `cat-d-unknown`: no ADS-B transponder (only acoustic/RF detection from W3–W8), or a squawk-only Mode-A transponder without position. This category is **never anonymised** under GDPR Art.6(1)(e) public interest exception.

### Haversine Distance Formula

All proximity calculations use haversine:

```
a = sin²(Δlat/2) + cos(lat₁) · cos(lat₂) · sin²(Δlon/2)
c = 2 · atan2(√a, √(1−a))
d = R · c  (R = 6371000 m)
```

This is computationally simple, accurate to within 0.5% at Romanian latitudes (43–49°N), and deterministic — no floating-point ambiguity in breach detection.

### Threat Score Formula

```
proximityScore = clamp(100 * (1 - distanceM / zone.radiusM), 0, 100)
baseScore = proximityScore * categoryMultiplier
atmosphericBonus = flyabilityScore > 70 ? 10 : 0
securityBonus = hasActiveSecurityEventWithin10km ? 15 : 0
rawScore = baseScore + atmosphericBonus + securityBonus
finalScore = clamp(rawScore, 0, 100)
```

Category multipliers:
- cat-a-commercial: 0.4 (cooperative, registered operator, predictable flight path)
- cat-b-modified: 0.7 (non-standard but ADS-B equipped)
- cat-c-surveillance: 0.9 (potential deliberate ISR mission)
- cat-d-unknown: 1.0 (worst-case, no cooperative data)

### AWNING Threshold Calibration

Zone-type thresholds were set through three considerations:
1. Consequence severity (nuclear > military > airport > government)
2. Base rate of legitimate overflights (airports have high legitimate traffic)
3. Existing EU guidance (EASA NPA 2020-14 threat classification schema)

Nuclear thresholds (YELLOW at 30, RED at 50) are deliberately conservative. A false positive at Cernavodă triggers a coordination call; a false negative there is an unacceptable consequence.

---

## Integration with W5–W8 ML Engines

W19's `EasaCategoryClassifier` (FR-W19-01) operates primarily on ADS-B metadata from W18. However, for `cat-d-unknown` aircraft (no ADS-B transponder), the classification is informed by acoustic signature (W3/W4 YAMNet confidence scores), RF fingerprint match (W5/W6), and fusion probability (W7/W8 `ThreatProbability`). The `EasaCategoryClassifier` checks the `EuSituationalPicture.mlSignals` field (a new optional field added to the W18 pipeline output in this wave) for W3–W8 detection hits.

---

## Regulatory Alignment Summary

| Regulation | Article | W19 Component | Implementation |
|------------|---------|---------------|----------------|
| EU 2019/945 | Art. 4 (Open category UAS) | EasaCategoryClassifier | Cat-A detection, weight/speed heuristics |
| EU 2019/947 | Art. 16 (Restricted zones) | ProtectedZoneBreachDetector | Exclusion zone breach at LROP/LRCL/LRTR etc. |
| EU 2021/664 | Art. 18 (U-space airspace) | EuAwningLevelAssigner | U-space zone awareness in AWNING calibration |
| GDPR | Art. 5(1)(e) | GdprTrackAnonymiser | 24h retention max, storage limitation |
| GDPR | Art. 6(1)(e) | GdprTrackAnonymiser | Public interest exception for Cat-D tracks |
| GDPR | Art. 22 | AacrNotificationFormatter | Human confirmation flag on automated decisions |
| Romanian HG 1083/2013 | §23 | AacrNotificationFormatter | Mandatory AACR incident reporting obligation |
| ICAO Doc 4444 | §10 | RomatsaCoordinationInterface | ATC coordination format for airspace incidents |
| CNCAN Order 180/2014 | §7 | EuAwningLevelAssigner | Nuclear exclusion zone — lower alert thresholds |

---

## Non-Functional Requirements

| NFR | Target | Measurement |
|-----|--------|-------------|
| Pipeline latency | < 500ms end-to-end (W18 input → NATS event emission) | p95 in EdgePerformanceProfiler |
| Breach detection coverage | 100% of aircraft-zone pairs evaluated per cycle | unit test assertion |
| Score determinism | Identical inputs → identical outputs | metamorphic test |
| GDPR anonymisation | Cat-A tracks anonymised within 30s of first detection | integration test |
| AACR notification completeness | All required SIRA fields populated | schema validation test |
| Memory footprint | < 5MB for ThreatIntelPicture at 50 aircraft | MemoryBudgetEnforcer gate |
| NATS event latency | < 100ms from score computation to subject publish | p95 trace |

---

## Out of Scope for W19

- **Operator UI**: AWNING level display and breach map are W20 scope
- **Supabase persistence**: ThreatIntelPicture is in-memory; audit logging to Supabase is W20
- **SMS/email AACR notification dispatch**: W19 formats the notification; W20 dispatches it
- **ROMATSA API integration**: W19 generates the coordination message; W20 sends it via secure channel
- **NATO/SMAp coordination**: Deveselu/military incidents generate AacrNotification only; SMAp coordination is a W21 NATO integration feature
