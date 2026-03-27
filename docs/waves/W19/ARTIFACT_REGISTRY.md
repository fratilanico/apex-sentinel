# APEX-SENTINEL W19 — ARTIFACT REGISTRY

## Theme: Romania/EU Threat Intelligence Layer

---

## Source Code Artifacts

### Production Source Files

| Artifact | Path | FR | Description | Status |
|----------|------|----|-------------|--------|
| EasaCategoryClassifier | `src/intel/easa-category-classifier.ts` | FR-W19-01 | EASA UAS category → W19 threat category classification | PLANNED |
| ProtectedZoneBreachDetector | `src/intel/protected-zone-breach-detector.ts` | FR-W19-02 | Haversine proximity breach detection | PLANNED |
| ThreatScoringEngine | `src/intel/threat-scoring-engine.ts` | FR-W19-03 | 0–100 threat score with factor decomposition | PLANNED |
| EuAwningLevelAssigner | `src/intel/eu-awning-level-assigner.ts` | FR-W19-04 | Zone-type AWNING threshold assignment | PLANNED |
| GdprTrackAnonymiser | `src/intel/gdpr-track-anonymiser.ts` | FR-W19-05 | GDPR pseudonymisation, 30s timer, Cat-D exemption | PLANNED |
| AacrNotificationFormatter | `src/intel/aacr-notification-formatter.ts` | FR-W19-06 | AACR SIRA template notification generation | PLANNED |
| RomatsaCoordinationInterface | `src/intel/romatsa-coordination-interface.ts` | FR-W19-07 | ICAO Doc 4444 ATC coordination message generation | PLANNED |
| W19ThreatIntelPipeline | `src/intel/w19-threat-intel-pipeline.ts` | FR-W19-08 | Pipeline orchestrator, EventEmitter, NATS publisher | PLANNED |

### Type Definition Files

| Artifact | Path | FR | Description | Status |
|----------|------|----|-------------|--------|
| W19 Types | `src/intel/types.ts` | All | All W19 TypeScript interfaces (ZoneBreach, ThreatScore, etc.) | PLANNED |
| W19 Constants | `src/intel/constants.ts` | W19-03/04 | CATEGORY_MULTIPLIERS, AWNING_THRESHOLDS, ROMATSA_AIRPORTS | PLANNED |
| W19 Romania Geo | `src/intel/romania-geo.ts` | W19-02 | ROMANIA_BBOX, airport coordinates, protected zone coords | PLANNED |

---

## Test Files

| Artifact | Path | FR | Tests | Status |
|----------|------|----|-------|--------|
| EasaCategoryClassifier tests | `tests/intel/easa-category-classifier.test.ts` | FR-W19-01 | 14 | PLANNED |
| ProtectedZoneBreachDetector tests | `tests/intel/protected-zone-breach-detector.test.ts` | FR-W19-02 | 13 | PLANNED |
| ThreatScoringEngine tests | `tests/intel/threat-scoring-engine.test.ts` | FR-W19-03 | 15 | PLANNED |
| EuAwningLevelAssigner tests | `tests/intel/eu-awning-level-assigner.test.ts` | FR-W19-04 | 12 | PLANNED |
| GdprTrackAnonymiser tests | `tests/intel/gdpr-track-anonymiser.test.ts` | FR-W19-05 | 11 | PLANNED |
| AacrNotificationFormatter tests | `tests/intel/aacr-notification-formatter.test.ts` | FR-W19-06 | 10 | PLANNED |
| RomatsaCoordinationInterface tests | `tests/intel/romatsa-coordination-interface.test.ts` | FR-W19-07 | 10 | PLANNED |
| W19ThreatIntelPipeline tests | `tests/intel/w19-threat-intel-pipeline.test.ts` | FR-W19-08 | 13 | PLANNED |
| W18 fixture factory | `tests/fixtures/w18-fixtures.ts` | All | Shared mock factories for W18 types | PLANNED |
| NATS mock | `tests/mocks/nats-mock.ts` | W19-04/06/07/08 | In-memory NATS client mock | PLANNED |

---

## Documentation Artifacts

All documentation created in `docs/waves/W19/`:

| Artifact | Path | Status |
|----------|------|--------|
| DESIGN.md | `docs/waves/W19/DESIGN.md` | COMPLETE |
| PRD.md | `docs/waves/W19/PRD.md` | COMPLETE |
| ARCHITECTURE.md | `docs/waves/W19/ARCHITECTURE.md` | COMPLETE |
| DATABASE_SCHEMA.md | `docs/waves/W19/DATABASE_SCHEMA.md` | COMPLETE |
| API_SPECIFICATION.md | `docs/waves/W19/API_SPECIFICATION.md` | COMPLETE |
| AI_PIPELINE.md | `docs/waves/W19/AI_PIPELINE.md` | COMPLETE |
| PRIVACY_ARCHITECTURE.md | `docs/waves/W19/PRIVACY_ARCHITECTURE.md` | COMPLETE |
| ROADMAP.md | `docs/waves/W19/ROADMAP.md` | COMPLETE |
| TEST_STRATEGY.md | `docs/waves/W19/TEST_STRATEGY.md` | COMPLETE |
| ACCEPTANCE_CRITERIA.md | `docs/waves/W19/ACCEPTANCE_CRITERIA.md` | COMPLETE |
| DECISION_LOG.md | `docs/waves/W19/DECISION_LOG.md` | COMPLETE |
| SESSION_STATE.md | `docs/waves/W19/SESSION_STATE.md` | COMPLETE |
| ARTIFACT_REGISTRY.md | `docs/waves/W19/ARTIFACT_REGISTRY.md` | COMPLETE (this file) |
| DEPLOY_CHECKLIST.md | `docs/waves/W19/DEPLOY_CHECKLIST.md` | COMPLETE |
| LKGC_TEMPLATE.md | `docs/waves/W19/LKGC_TEMPLATE.md` | COMPLETE |
| IMPLEMENTATION_PLAN.md | `docs/waves/W19/IMPLEMENTATION_PLAN.md` | COMPLETE |
| HANDOFF.md | `docs/waves/W19/HANDOFF.md` | COMPLETE |
| FR_REGISTER.md | `docs/waves/W19/FR_REGISTER.md` | COMPLETE |
| RISK_REGISTER.md | `docs/waves/W19/RISK_REGISTER.md` | COMPLETE |
| INTEGRATION_MAP.md | `docs/waves/W19/INTEGRATION_MAP.md` | COMPLETE |

---

## External Regulatory References

These documents are referenced in W19 but not included in the codebase (external authoritative sources):

| Reference | Type | URL / Source | Used In |
|-----------|------|-------------|---------|
| EU 2019/945 | EU Regulation | EUR-Lex | EasaCategoryClassifier — UAS category definitions |
| EU 2019/947 | EU Regulation | EUR-Lex | ProtectedZoneBreachDetector — restricted zone obligations |
| EU 2021/664 | EU Regulation | EUR-Lex | EuAwningLevelAssigner — U-space zone awareness |
| GDPR (EU 2016/679) | EU Regulation | EUR-Lex | GdprTrackAnonymiser — entire privacy architecture |
| ICAO Doc 4444 | ICAO Standard | ICAO.int | RomatsaCoordinationInterface — message format |
| ICAO Annex 14 | ICAO Standard | ICAO.int | ProtectedZoneBreachDetector — airport exclusion zones |
| Romanian HG 1083/2013 | Romanian Law | monitoruloficial.ro | AacrNotificationFormatter — mandatory incident reporting |
| Romanian Law 21/2020 | Romanian Law | monitoruloficial.ro | EasaCategoryClassifier — UAS registration |
| CNCAN Order 180/2014 | Romanian Order | cncan.ro | EuAwningLevelAssigner — nuclear zone thresholds |
| EASA NPA 2020-14 | EASA Notice | easa.europa.eu | AWNING threshold calibration reference |
| ANSPDCP Pseudonymisation Guide | ANSPDCP Guidance | dataprotection.ro | GdprTrackAnonymiser — HMAC requirements |

---

## Dependency Graph

```
W19 Source Dependencies:

easa-category-classifier.ts
  ← AircraftState (W18 types)
  ← MlSignalBundle (W19 types — new)

protected-zone-breach-detector.ts
  ← AircraftState (W18 types)
  ← ProtectedZone (W18 types)
  → ZoneBreach (W19 types — new)

threat-scoring-engine.ts
  ← ZoneBreach (W19 types)
  ← CategoryResult (W19 types)
  ← ProtectedZone (W18 types)
  ← AtmosphericConditions (W18 types)
  ← SecurityEvent (W18 types)
  → ThreatScore (W19 types — new)

eu-awning-level-assigner.ts
  ← ThreatScore (W19 types)
  ← ProtectedZone (W18 types)
  ← NatsConnection (nats.ws / nats.io)
  → ZoneAwningState (W19 types — new)

gdpr-track-anonymiser.ts
  ← AircraftState (W18 types)
  ← CategoryResult (W19 types)
  → AnonymisedTrack (W19 types — new)

aacr-notification-formatter.ts
  ← ZoneBreach (W19 types)
  ← ThreatScore (W19 types)
  ← ZoneAwningState (W19 types)
  ← ProtectedZone (W18 types)
  ← CategoryResult (W19 types)
  ← NatsConnection
  → AacrNotification (W19 types — new)

romatsa-coordination-interface.ts
  ← ZoneAwningState (W19 types)
  ← NotamRestriction (W18 types)
  ← ZoneBreach (W19 types)
  ← AircraftState (W18 types)
  ← ProtectedZone (W18 types)
  ← CategoryResult (W19 types)
  ← AacrNotification (W19 types)
  ← NatsConnection
  → RomatsaCoordinationMessage (W19 types — new)

w19-threat-intel-pipeline.ts
  ← EuSituationalPicture (W18 output contract)
  ← All W19 components
  ← NatsConnection
  → ThreatIntelPicture (W19 types — new)
  → EventEmitter events
```

---

## No Database Migrations

W19 introduces zero new Supabase migrations. The `supabase/migrations/` directory is not modified.

This is confirmed by the in-memory-only architecture decision (DL-W19-008 in DECISION_LOG.md).
