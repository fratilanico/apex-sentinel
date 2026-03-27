# APEX-SENTINEL W19 — FUNCTIONAL REQUIREMENTS REGISTER

## Theme: Romania/EU Threat Intelligence Layer

---

## FR Register Overview

| FR ID | Title | Priority | Status | Tests | Source File |
|-------|-------|----------|--------|-------|-------------|
| FR-W19-01 | EasaCategoryClassifier | P0 | PLANNED | 14 | src/intel/easa-category-classifier.ts |
| FR-W19-02 | ProtectedZoneBreachDetector | P0 | PLANNED | 13 | src/intel/protected-zone-breach-detector.ts |
| FR-W19-03 | ThreatScoringEngine | P0 | PLANNED | 15 | src/intel/threat-scoring-engine.ts |
| FR-W19-04 | EuAwningLevelAssigner | P0 | PLANNED | 12 | src/intel/eu-awning-level-assigner.ts |
| FR-W19-05 | GdprTrackAnonymiser | P0 | PLANNED | 11 | src/intel/gdpr-track-anonymiser.ts |
| FR-W19-06 | AacrNotificationFormatter | P1 | PLANNED | 10 | src/intel/aacr-notification-formatter.ts |
| FR-W19-07 | RomatsaCoordinationInterface | P1 | PLANNED | 10 | src/intel/romatsa-coordination-interface.ts |
| FR-W19-08 | W19ThreatIntelPipeline | P0 | PLANNED | 13 | src/intel/w19-threat-intel-pipeline.ts |
| **Total** | | | | **98** | |

---

## FR-W19-01: EasaCategoryClassifier

**Status**: PLANNED
**Priority**: P0
**Tests**: 14
**Source**: `src/intel/easa-category-classifier.ts`
**Test File**: `tests/intel/easa-category-classifier.test.ts`

**Description**:
Classifies an AircraftState into one of four W19 threat categories based on ADS-B transponder data, with optional refinement from W3–W8 ML signals.

**Inputs**:
- `aircraft: AircraftState` — from W18 AircraftPositionAggregator
- `mlSignals?: MlSignalBundle` — from W3–W8 engines (optional)

**Outputs**:
- `CategoryResult { aircraftId, category: UasThreatCategory, confidence, classificationBasis, timestamp }`

**Classification Logic**:
1. Non-cooperative (no transponder) → `cat-d-unknown` (confidence 0.9–1.0)
2. ADS-B A-series emitter category → `cat-a-commercial` (confidence ≥ 0.90)
3. ADS-B B-series → `cat-b-modified` (confidence 0.85)
4. ADS-B C-series → `cat-c-surveillance` (confidence 0.80)
5. Heuristic: low altitude + low speed + no transponder → `cat-a-commercial` or `cat-d-unknown`
6. ML signal: acoustic/RF confidence ≥ 0.85 boosts cat-d confidence to 0.95

**Regulatory Basis**: EU 2019/945 (UAS category definitions), EU 2021/664 Art.18 (U-space classification)

**Acceptance Criteria**: AC-W19-01-01 through AC-W19-01-05 (ACCEPTANCE_CRITERIA.md)

**Dependencies**: None (leaf node in W19 dependency graph)

**COMPLETE Definition**: 14/14 tests GREEN, never throws, returns valid result for all AircraftState inputs

---

## FR-W19-02: ProtectedZoneBreachDetector

**Status**: PLANNED
**Priority**: P0
**Tests**: 13
**Source**: `src/intel/protected-zone-breach-detector.ts`
**Test File**: `tests/intel/protected-zone-breach-detector.test.ts`

**Description**:
Evaluates all aircraft against all protected zones using haversine distance. Returns ZoneBreach records for every aircraft-zone pair where the aircraft is within the zone's alert radius.

**Inputs**:
- `aircraft: AircraftState[]` — all aircraft in current picture
- `zones: ProtectedZone[]` — all protected zones
- `previous?: Map<string, ZoneBreach>` — previous breach state (for ENTERING/EXITING detection)

**Outputs**:
- `ZoneBreach[] { breachId, aircraftId, zoneId, distanceM, bearingDeg, breachType, ttBreachS, approachRateMs, natoSensitive, ... }`

**Algorithm**: O(n×m) haversine. n = aircraft count (≤ 500), m = zone count (≤ 28). Max 14,000 haversine operations per cycle.

**Breach Types**:
- `ENTERING`: within alertRadiusM but outside radiusM; approach vector toward zone
- `INSIDE`: within radiusM
- `EXITING`: within radiusM but velocity vector away from zone

**Early Warning**: ENTERING breaches detected at `zone.alertRadiusM = zone.radiusM + 500m`. This provides ~30–60 seconds warning at typical drone speeds.

**Regulatory Basis**: EU 2019/947 Art.16 (restricted zones), ICAO Annex 14 (airport exclusion zones), Romanian HG 1083/2013

**Acceptance Criteria**: AC-W19-02-01 through AC-W19-02-05

**Dependencies**: W18 AircraftState, W18 ProtectedZone types

**COMPLETE Definition**: 13/13 tests GREEN, haversine accuracy < 50m at Romanian latitudes

---

## FR-W19-03: ThreatScoringEngine

**Status**: PLANNED
**Priority**: P0
**Tests**: 15
**Source**: `src/intel/threat-scoring-engine.ts`
**Test File**: `tests/intel/threat-scoring-engine.test.ts`

**Description**:
Computes a 0–100 threat score for each ZoneBreach, integrating proximity, aircraft category, atmospheric flyability, and security context.

**Inputs**:
- `breaches: ZoneBreach[]`
- `categories: CategoryResult[]`
- `zones: ProtectedZone[]`
- `atmospheric: AtmosphericConditions | null`
- `events: SecurityEvent[] | null`

**Outputs**:
- `ThreatScore[] { scoreId, breachId, aircraftId, zoneId, value: 0-100, factors, awningRecommendation, operatorConfirmationRequired }`

**Formula**:
```
proximityScore = clamp(100 × (1 − distanceM / zone.radiusM), 0, 100)
categoryMult = { cat-a: 0.4, cat-b: 0.7, cat-c: 0.9, cat-d: 1.0 }
atmosphericBonus = flyabilityScore > 70 ? 10 : 0
securityBonus = hasActiveEventWithin10km ? 15 : 0
value = Math.round(clamp(proximityScore × categoryMult + atm + sec, 0, 100))
```

**Determinism**: Identical inputs → identical outputs. No randomness.

**Regulatory Basis**: EASA NPA 2020-14 risk classification framework (advisory reference)

**Acceptance Criteria**: AC-W19-03-01 through AC-W19-03-05

**Dependencies**: FR-W19-02 (ZoneBreach), FR-W19-01 (CategoryResult), W18 AtmosphericConditions, W18 SecurityEvent

**COMPLETE Definition**: 15/15 tests GREEN, all scores in [0, 100], deterministic

---

## FR-W19-04: EuAwningLevelAssigner

**Status**: PLANNED
**Priority**: P0
**Tests**: 12
**Source**: `src/intel/eu-awning-level-assigner.ts`
**Test File**: `tests/intel/eu-awning-level-assigner.test.ts`

**Description**:
Assigns AWNING level (GREEN/YELLOW/ORANGE/RED) to each protected zone based on maximum threat score, using zone-type-specific thresholds. Publishes changes to NATS.

**Inputs**:
- `scores: ThreatScore[]`
- `zones: ProtectedZone[]`
- `previous: Map<string, ZoneAwningState>`

**Outputs**:
- `Map<string, ZoneAwningState>` keyed by zoneId
- NATS publish: `sentinel.intel.awning_change` (on level change only)

**Zone-Type Thresholds**:
- airport: GREEN<20, YELLOW<50, ORANGE<75, RED≥75
- nuclear: GREEN<10, YELLOW<30, ORANGE<50, RED≥50
- military: GREEN<15, YELLOW<40, ORANGE<65, RED≥65
- government: GREEN<25, YELLOW<55, ORANGE<80, RED≥80

**NATS Integration**: Connects to W10 AwningLevelPublisher. W19 generates per-zone levels; W10 aggregates to system-level AWNING.

**Regulatory Basis**: CNCAN Order 180/2014 (nuclear sensitivity), ICAO Annex 14 (airport sensitivity)

**Acceptance Criteria**: AC-W19-04-01 through AC-W19-04-04

**Dependencies**: FR-W19-03 (ThreatScore), W18 ProtectedZone, NATS client

**COMPLETE Definition**: 12/12 tests GREEN, all zone types correctly threshold-mapped, NATS publish only on change

---

## FR-W19-05: GdprTrackAnonymiser

**Status**: PLANNED
**Priority**: P0
**Tests**: 11
**Source**: `src/intel/gdpr-track-anonymiser.ts`
**Test File**: `tests/intel/gdpr-track-anonymiser.test.ts`

**Description**:
Applies GDPR-compliant pseudonymisation to aircraft tracks. Cat-A commercial aircraft are anonymised after 30 seconds. Cat-D unknown aircraft are exempt from anonymisation under Art.6(1)(e).

**Inputs**:
- `aircraft: AircraftState`
- `category: CategoryResult`
- `trackStartedAt: string` (ISO-8601)

**Outputs**:
- `AnonymisedTrack { pseudoId, anonymisationStatus, legalBasis, gridLat, gridLon, callsignPrefix, expiresAt, privacyBreachFlag }`

**Anonymisation Steps (Cat-A, age ≥ 30s)**:
1. `pseudoId = HMAC-SHA256(icao24, APEX_DEPLOY_SECRET)[:16]`
2. `gridLat = Math.floor(lat × 1000) / 1000` (100m precision)
3. `gridLon = Math.floor(lon × 1000) / 1000`
4. `callsignPrefix = callsign.slice(0, 3) ?? 'UNK'`

**Cat-D Rule**: `anonymisationStatus = 'EXEMPT'`, `legalBasis = 'Art.6(1)(e)'`. Full position retained.

**Regulatory Basis**: GDPR Art.5(1)(c) data minimisation, Art.5(1)(e) storage limitation, Art.6(1)(e) public interest, ANSPDCP pseudonymisation guidance

**Acceptance Criteria**: AC-W19-05-01 through AC-W19-05-05

**Dependencies**: FR-W19-01 (CategoryResult), `APEX_DEPLOY_SECRET` environment variable

**COMPLETE Definition**: 11/11 tests GREEN, Cat-A anonymised by 30s, Cat-D exempt, HMAC deterministic, privacyBreachFlag on missing key

---

## FR-W19-06: AacrNotificationFormatter

**Status**: PLANNED
**Priority**: P1
**Tests**: 10
**Source**: `src/intel/aacr-notification-formatter.ts`
**Test File**: `tests/intel/aacr-notification-formatter.test.ts`

**Description**:
Generates AACR incident notifications in SIRA format for all ORANGE and RED AWNING events. Publishes to NATS.

**Inputs**:
- `breaches: ZoneBreach[]`
- `scores: ThreatScore[]`
- `awningLevels: Map<string, ZoneAwningState>`
- `zones: ProtectedZone[]`
- `categories: CategoryResult[]`

**Outputs**:
- `AacrNotification[]` — all 7 SIRA fields populated
- NATS publish: `sentinel.intel.aacr_notification`

**Trigger**: AWNING level ORANGE or RED only

**7 Mandatory SIRA Fields**: incidentId, timestampUtc, location (ICAO or lat/lon), aircraftDescription, awningLevel, recommendedAction, operatorConfirmationRequired

**Special**: `cncanEscalationRequired=true` for nuclear zone breaches

**Regulatory Basis**: Romanian HG 1083/2013 §23 (mandatory AACR reporting), GDPR Art.22 (automated decision safeguard)

**Acceptance Criteria**: AC-W19-06-01 through AC-W19-06-04

**Dependencies**: FR-W19-02, FR-W19-03, FR-W19-04, W18 ProtectedZone, NATS client

**COMPLETE Definition**: 10/10 tests GREEN, all 7 SIRA fields present for ORANGE/RED, CNCAN flag correct

---

## FR-W19-07: RomatsaCoordinationInterface

**Status**: PLANNED
**Priority**: P1
**Tests**: 10
**Source**: `src/intel/romatsa-coordination-interface.ts`
**Test File**: `tests/intel/romatsa-coordination-interface.test.ts`

**Description**:
Generates ICAO Doc 4444 §10 ATC coordination messages for ROMATSA when RED AWNING is detected near major Romanian airports. Cross-references active NOTAMs to suppress duplicate alerts.

**Inputs**:
- `awningLevels: Map<string, ZoneAwningState>`
- `notams: NotamRestriction[]`
- `breaches: ZoneBreach[]`
- `aircraft: AircraftState[]`
- `zones: ProtectedZone[]`
- `categories: CategoryResult[]`
- `aacrNotifications: AacrNotification[]`

**Outputs**:
- `RomatsaCoordinationMessage[]` — TLP:RED marked
- NATS publish: `sentinel.intel.romatsa_coordination`

**Trigger**: RED AWNING at LROP, LRCL, LRTR, LRSB, or LRCK (major Romanian airports)

**NOTAM Cross-Reference**: Active NOTAM type R/P/D covering the breach area → downgrade recommended action by one level + set `actionDowngradedByNotam=true`

**Regulatory Basis**: ICAO Doc 4444 §10 (ATC coordination), Romanian CCA (Romanian Civil Aviation Regulations Part ATC)

**Acceptance Criteria**: AC-W19-07-01 through AC-W19-07-04

**Dependencies**: FR-W19-04 (AwningLevel), FR-W19-06 (AacrNotification, for cross-reference), W18 NotamRestriction, NATS client

**COMPLETE Definition**: 10/10 tests GREEN, correct NOTAM cross-reference, TLP:RED on all messages, speed/altitude conversion verified

---

## FR-W19-08: W19ThreatIntelPipeline

**Status**: PLANNED
**Priority**: P0
**Tests**: 13
**Source**: `src/intel/w19-threat-intel-pipeline.ts`
**Test File**: `tests/intel/w19-threat-intel-pipeline.test.ts`

**Description**:
Orchestrates all 7 W19 FRs into a single pipeline that transforms `EuSituationalPicture` (W18) into `ThreatIntelPicture` (W19 output). Extends Node.js `EventEmitter`. Manages NATS subscriptions for continuous operation.

**Inputs**:
- `picture: EuSituationalPicture` — from W18 EuDataIntegrationPipeline

**Outputs**:
- `ThreatIntelPicture` — assembled from all 7 FR outputs
- EventEmitter events: `breach_detected`, `awning_change`, `aacr_notification`, `romatsa_coordination`, `picture_updated`, `pipeline_error`
- NATS subject: `sentinel.intel.picture_update`

**Resilience**: Each step wrapped in try/catch. Step failure → `degradedMode=true` in ThreatIntelPicture; pipeline continues.

**Performance**: Must process 50 aircraft × 8 zones in < 500ms end-to-end.

**Lifecycle**: `start()` subscribes to NATS; `stop()` drains and disconnects.

**Regulatory Basis**: Aggregate of all FRs above

**Acceptance Criteria**: AC-W19-08-01 through AC-W19-08-05

**Dependencies**: All FR-W19-01 through FR-W19-07, W18 EuSituationalPicture, NATS client

**COMPLETE Definition**: 13/13 tests GREEN, all 4 NATS events emitted, degradedMode works, < 500ms gate
