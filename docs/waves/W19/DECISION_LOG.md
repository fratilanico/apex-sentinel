# APEX-SENTINEL W19 — DECISION LOG

## Theme: Romania/EU Threat Intelligence Layer

---

## Decision Record Format

Each decision record includes:
- **Context**: What drove the decision
- **Decision**: What was decided
- **Alternatives considered**: Other options evaluated
- **Rationale**: Why this option was chosen
- **Consequences**: Known trade-offs
- **Status**: ACCEPTED | SUPERSEDED | UNDER REVIEW

---

## DL-W19-001: Threat Category Naming Convention

**Date**: 2026-03-27
**Status**: ACCEPTED

**Context**: W18 defined `UasThreatCategory` as `'Cat-A' | 'Cat-B' | 'Cat-C' | 'Cat-D'` (capitalised, EASA-exact naming). W19 needs a finer-grained distinction between Cat-A commercial and Cat-A modified, which EASA does not distinguish at the regulatory level.

**Decision**: W19 introduces a new `UasThreatCategory` type with lowercase hyphenated values: `'cat-a-commercial' | 'cat-b-modified' | 'cat-c-surveillance' | 'cat-d-unknown'`. The W18 type is preserved in the W18 schema. W19 types override the W18 type in the intel layer.

**Alternatives considered**:
1. Extend W18 type with additional values — rejected because it would break W18 component types
2. Use numeric severity (1–4) — rejected because names are self-documenting for operators and audit trails
3. Keep W18 Cat-A/B/C/D — rejected because W19 needs the cat-a-commercial vs cat-d-unknown distinction to drive GDPR anonymisation (commercial gets anonymised; unknown does not)

**Rationale**: Naming clarity at the W19 intelligence layer. Operators and AACR inspectors read these values in notifications; descriptive names reduce misinterpretation.

**Consequences**: W19 types are not directly assignable to W18 types. A mapping function is needed when W19 outputs are compared to W18 classifications.

---

## DL-W19-002: AWNING Threshold Values

**Date**: 2026-03-27
**Status**: ACCEPTED

**Context**: The AWNING escalation thresholds per zone type are the most consequential parameters in W19. Too sensitive → false positives → AACR inspector overload → threshold ignored. Too insensitive → missed real threats.

**Decision**: Use the following threshold table:

| Zone Type | GREEN | YELLOW | ORANGE | RED |
|-----------|-------|--------|--------|-----|
| airport | < 20 | < 50 | < 75 | ≥ 75 |
| nuclear | < 10 | < 30 | < 50 | ≥ 50 |
| military | < 15 | < 40 | < 65 | ≥ 65 |
| government | < 25 | < 55 | < 80 | ≥ 80 |

**Derivation**:

Airport thresholds: Based on a reference scenario where a Cat-D drone at the zone boundary (distanceM = radiusM) scores proximityRaw=0 × 1.0 = 0. At 50% penetration (2.5km into a 5km zone): proximityRaw=50, score=50 → YELLOW. At 25% distance from centre: score=75 → ORANGE. This maps intuitively to the operator mental model of "approaching", "inside", "close".

Nuclear thresholds: Cernavodă is Romania's only nuclear facility and one of the most consequential targets in Central/Eastern Europe. Consequence of a missed detection vastly outweighs consequence of a false positive. Thresholds set at 60% of airport values. CNCAN's own risk assessment framework (Order 180/2014) implies a zero-tolerance approach; the system cannot be zero-tolerance without unacceptable false positive rates, so we err conservative.

Military thresholds: Intermediate between nuclear and airport. NATO facilities (Deveselu, Kogălniceanu) involve Article 5 treaty obligations but have better physical security than Cernavodă. Thresholds between nuclear and airport.

Government thresholds: Government buildings in Bucharest have the most legitimate air traffic (news helicopters, medical) and the lowest adversarial consequence outside of WMD scenarios. Most permissive thresholds.

**Alternatives considered**:
1. Single universal threshold — rejected because consequence profiles differ too much
2. Dynamic thresholds (self-adjusting based on false positive rate) — deferred to W22 (ML-calibrated thresholds); W19 uses static values for auditability
3. NATO standardised thresholds — not publicly available; no applicable NATO standard found

**Rationale**: Calibrated to consequence severity. Nuclear sites demand maximum sensitivity. Government buildings demand minimum false positive rate (political sensitivity of false alarms).

**Consequences**: Nuclear zone will generate more YELLOW/ORANGE events for borderline aircraft. AACR inspectors handling nuclear zone incidents need to be briefed that the threshold is stricter, not that the threat model changed.

---

## DL-W19-003: GDPR Cat-D Exemption from Anonymisation

**Date**: 2026-03-27
**Status**: ACCEPTED

**Context**: GDPR Art.5(1)(c) data minimisation and Art.5(1)(e) storage limitation would normally require anonymisation of all aircraft tracks. However, Cat-D (unknown, non-cooperative) aircraft are a security risk by definition. Anonymising their tracks would impede investigation.

**Decision**: Cat-D aircraft are exempt from the 30-second anonymisation timer and from grid-snap on their pseudoId/callsign. GDPR legal basis is Art.6(1)(e) (public interest / security).

**Legal analysis**:
- GDPR Art.6(1)(e): "processing is necessary for the performance of a task carried out in the public interest or in the exercise of official authority vested in the controller"
- Recital 45 GDPR: confirms that public interest processing includes tasks in public security
- Romanian Law 182/2002 Art.15: national security data processing is outside general GDPR obligations in some interpretations; however, we apply GDPR principles as best practice
- GDPR Art.23: Member States may restrict Art.5 rights for national security and public security. Romania has implemented such restrictions in Law 182/2002.

**Alternatives considered**:
1. Anonymise Cat-D but retain under Art.17(3)(e) exemption — rejected because Art.17 is the right to erasure, not a retention basis; mixing these concepts would confuse the DPIA
2. Require explicit AACR authorisation before retaining Cat-D data — operationally impractical within 10s pipeline cycles
3. Anonymise Cat-D after incident closure — deferred to W20 as a post-incident cleanup workflow

**Rationale**: Security necessity. A non-cooperative drone near Cernavodă must be identifiable, trackable, and correlatable across time. Anonymising its track would destroy the evidence trail needed for AACR investigation and potential criminal prosecution under Romanian Penal Code Art.360 (unauthorised access to a computer system) or Art.193 (endangering public security).

**Consequences**: Cat-D aircraft position data is retained in more precise form than Cat-A. The DPIA must explicitly document this as a proportionate security exception. ANSPDCP would scrutinise this exemption; the justification must be clearly documented (this decision record + PRIVACY_ARCHITECTURE.md).

---

## DL-W19-004: 30-Second Anonymisation Timer for Cat-A

**Date**: 2026-03-27
**Status**: ACCEPTED

**Context**: What is the minimum operational retention time for a Cat-A commercial aircraft track before anonymisation is applied?

**Decision**: 30 seconds from first detection.

**Derivation**:
- Zone breach detection is triggered immediately on first position update
- Threat scoring runs within the first 10s pipeline cycle
- AACR notification (if triggered) is generated within 15s
- 30s provides enough track history to confirm ENTERING vs false positive
- Beyond 30s, the breach assessment is made; continued precise tracking adds privacy risk without operational benefit

**Alternatives considered**:
1. 10 seconds (one pipeline cycle) — too short to distinguish genuine approach from transient position error
2. 60 seconds — longer than needed; adds privacy risk
3. Until aircraft exits picture — too long; aircraft may transit for hours
4. Event-driven (anonymise when AWNING returns to GREEN) — complex state machine; deferred to W22

**Rationale**: Balance between operational need (track history for breach confirmation) and GDPR minimisation principle.

**Consequences**: Cat-A tracks in the first 30s are in PENDING status (grid-snapped but not pseudonymised). Tests must verify the 30s boundary correctly.

---

## DL-W19-005: Category Multiplier Values

**Date**: 2026-03-27
**Status**: ACCEPTED

**Context**: The category multipliers (0.4, 0.7, 0.9, 1.0) determine how much a cooperative commercial aircraft contributes to threat score versus an unknown drone. These values are expert judgement.

**Decision**:
- cat-a-commercial: 0.4 (60% score reduction from maximum proximity score)
- cat-b-modified: 0.7 (30% reduction)
- cat-c-surveillance: 0.9 (10% reduction)
- cat-d-unknown: 1.0 (no reduction; worst-case assumption)

**Rationale**:
- Cat-A commercial (0.4): A registered commercial drone with cooperative transponder, known operator, known flight plan is far less threatening than an unidentified drone. 60% reduction reflects the significant risk mitigation of cooperation and registration.
- Cat-D unknown (1.0): Full score. No risk mitigation. The precautionary principle applies: assume worst case when no cooperative data exists.
- The 0.4:1.0 ratio (2.5×) means a Cat-D drone at the zone boundary equals a Cat-A drone at 60% penetration in threat score terms.

**Alternatives considered**:
1. Binary multiplier (cooperative=0.2, non-cooperative=1.0) — rejected as too coarse
2. Continuous multiplier based on confidence score — too complex for initial implementation; deferred to W22
3. EU EASA risk classification values — EASA NPA 2020-14 Annex II provides indicative risk weights; our values are roughly aligned

**Consequences**: Extensive tuning may be needed after operational deployment. Multipliers are configurable constants (not hardcoded) to facilitate post-deployment calibration.

---

## DL-W19-006: ROMATSA Coordination Limited to Airport RED Events

**Date**: 2026-03-27
**Status**: ACCEPTED

**Context**: Should ROMATSA receive coordination messages for all RED AWNING events, or only airport-related ones?

**Decision**: ROMATSA coordination messages are generated only for RED AWNING events near airports with ATC service (LROP, LRCL, LRTR, LRSB, LRCK). Nuclear, military, and government zone RED events go to AACR and (future) CNCAN/SMAp — not to ROMATSA.

**Rationale**:
- ROMATSA's responsibility is Air Traffic Services (ATS) — separating aircraft from each other and from obstacles in controlled airspace
- Cernavodă nuclear plant is not in controlled airspace (it's in LRBB FIR but outside any CTR or TMA); ROMATSA has no operational jurisdiction there
- Military zone incidents (Deveselu, Kogălniceanu) involve NATO security protocols outside ROMATSA's civilian ATS function
- Government district is within Bucharest CTR/TMA; ROMATSA would be informed of airspace safety issues via LROP ACC, not directly
- Overloading ROMATSA with non-aviation-safety alerts risks alert fatigue and degrades ATC safety

**Alternatives considered**:
1. Send all RED events to ROMATSA — rejected (alert fatigue; non-ATS incidents are noise for ATC)
2. Send ORANGE + RED to ROMATSA for airports — reduced to RED only (ORANGE should not interrupt ATC; AACR handles ORANGE)
3. Let ROMATSA subscribe to raw NATS feed — rejected (ROMATSA receives formatted Doc 4444 messages, not raw event data)

**Consequences**: Nuclear RED events require a separate notification path. CNCAN escalation via AacrNotification flag (cncanEscalationRequired=true) is the mechanism for W19. W20 implements actual CNCAN dispatch.

---

## DL-W19-007: Haversine vs Vincenty Distance Formula

**Date**: 2026-03-27
**Status**: ACCEPTED

**Context**: Proximity calculations are central to W19. Should we use haversine (spherical Earth, fast) or Vincenty (ellipsoidal Earth, more accurate)?

**Decision**: Haversine.

**Accuracy analysis at Romanian latitudes (43–49°N)**:
- Haversine error: < 0.5% for distances under 2000km
- At 5km (zone radius): error < 25m
- At 10km (nuclear exclusion): error < 50m
- Zone breach threshold at 5000m: haversine is accurate to ±25m, well within operational tolerance

**Vincenty accuracy benefit**: < 50m improvement at Romanian latitudes for all relevant distances (< 20km). Not operationally significant.

**Vincenty cost**: 5× more computation, iterative algorithm (can fail to converge in edge cases near poles/antipodal points).

**Rationale**: Haversine is deterministic, fast (no iteration), and accurate to within 25m for all W19 use cases. Vincenty's improvement is operationally irrelevant at Romanian latitudes.

**Consequences**: Tests that verify haversine accuracy must use a tolerance of ±50m (not exact equality) for real-world distance comparisons.

---

## DL-W19-008: In-Memory Only (No Supabase in W19)

**Date**: 2026-03-27
**Status**: ACCEPTED

**Context**: Should W19 persist ThreatIntelPicture, ZoneBreach events, and AacrNotifications to Supabase for audit purposes?

**Decision**: W19 is in-memory only. No Supabase writes.

**Rationale**:
1. W19 is a compute layer. Persistence is an I/O concern that belongs to the operator workflow layer (W20).
2. Adding Supabase writes to W19 increases latency (network I/O in the hot path) and creates operational dependencies (Supabase unavailable → W19 blocks).
3. Wave separation of concerns: W18 = data ingestion, W19 = threat intelligence computation, W20 = persistence and dispatch.
4. The 24h in-memory TTL is sufficient for operational continuity; loss of historical data beyond 24h is acceptable for the intelligence layer (AACR has their own persistence after receiving notifications).

**Alternatives considered**:
1. Write to Supabase async (non-blocking) — deferred to W20; adds complexity to W19
2. Write only failed notifications to Supabase for retry — deferred to W20 dispatch queue design

**Consequences**: If APEX-SENTINEL node restarts, all W19 in-memory state is lost. AWNING levels reset to GREEN on restart. W20 must handle the cold-start scenario.
