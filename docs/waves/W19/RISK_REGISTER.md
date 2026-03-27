# APEX-SENTINEL W19 — RISK REGISTER

## Theme: Romania/EU Threat Intelligence Layer

---

## Risk Assessment Matrix

**Probability**: 1=Very Low, 2=Low, 3=Medium, 4=High, 5=Very High
**Impact**: 1=Negligible, 2=Minor, 3=Moderate, 4=Significant, 5=Critical
**Risk Score**: Probability × Impact

| ID | Risk | Prob | Impact | Score | Category | Status |
|----|------|------|--------|-------|----------|--------|
| R-W19-01 | False positive rate too high at nuclear zone | 3 | 3 | 9 | Operational | OPEN |
| R-W19-02 | False negative — missed real threat near Cernavodă | 2 | 5 | 10 | Safety | OPEN |
| R-W19-03 | AWNING threshold calibration incorrect | 3 | 4 | 12 | Operational | OPEN |
| R-W19-04 | GDPR legal basis challenged by ANSPDCP | 2 | 4 | 8 | Legal/Privacy | OPEN |
| R-W19-05 | Cat-D exemption not sufficient — ANSPDCP objects | 2 | 3 | 6 | Legal/Privacy | OPEN |
| R-W19-06 | APEX_DEPLOY_SECRET not set in production | 3 | 3 | 9 | Operational | OPEN |
| R-W19-07 | W18 feed outage during breach event | 3 | 4 | 12 | Operational | OPEN |
| R-W19-08 | AACR SIRA format has changed since documented | 2 | 3 | 6 | Technical | OPEN |
| R-W19-09 | Performance degradation with > 200 aircraft | 2 | 3 | 6 | Technical | OPEN |
| R-W19-10 | ROMATSA coordination message not actionable | 3 | 3 | 9 | Operational | OPEN |
| R-W19-11 | Haversine error causes zone boundary mis-detection | 1 | 2 | 2 | Technical | LOW |
| R-W19-12 | HMAC pseudonymisation broken by key rotation | 2 | 2 | 4 | Privacy | OPEN |
| R-W19-13 | W19 pipeline blocks W10 AWNING engine on error | 2 | 4 | 8 | Operational | OPEN |
| R-W19-14 | CNCAN escalation flag not tested end-to-end | 3 | 5 | 15 | Safety/Legal | HIGH |
| R-W19-15 | Threshold values not calibrated against real data | 4 | 3 | 12 | Operational | OPEN |

---

## Detailed Risk Records

### R-W19-01: False Positive Rate at Nuclear Zone

**Risk**: Nuclear zone thresholds (GREEN<10, YELLOW<30, ORANGE<50) are conservative. Legitimate aircraft transiting airspace near Cernavodă at high altitude may trigger false alerts.

**Scenario**: A commercial airliner (YR-ASA, Tarom ATR) flying at FL100 on the Bucharest–Constanța route passes within 8km of Cernavodă (within alertRadiusM of 10,500m). Cat-A commercial, but proximity score = 100×(1−2000/10000) = 80. With cat-a multiplier 0.4: 80×0.4=32 → YELLOW. Acceptable — no notification generated.

**But**: At 1km distance, score=90×0.4=36 → still YELLOW (nuclear threshold GREEN<10, YELLOW<30... score=36 → ORANGE). An airliner at 1km from Cernavodă would trigger ORANGE and AACR notification. This is correct — even a cooperative airliner at 1km is an unusual event near a nuclear facility.

**Assessment**: False positive rate is manageable. Legitimate en-route traffic at normal altitudes (> 2000m) will be well outside the 10km nuclear exclusion zone. Low-altitude legitimate traffic (crop dusters, survey aircraft) near Cernavodă is rare and warrants a human review anyway.

**Mitigation**: Configure altitude filter — aircraft above FL050 (5000 ft) with cooperative transponder and valid squawk near nuclear zone: apply altitude bonus (-5 to score). Deferred to W22 threshold calibration wave.

**Residual Risk**: LOW — acceptable false positive rate for initial deployment.

---

### R-W19-02: False Negative — Missed Threat at Cernavodă

**Risk**: A non-cooperative drone approaches Cernavodă at very low altitude below W18 ADS-B detection. W3/W4 acoustic detection has limited range at Cernavodă's remote location. No sensor node deployed near the plant.

**Scenario**: Small FPV drone launched from ~2km away, flying at 30m AGL. No ADS-B, no acoustic sensor in range, no W18 feed covers this. W19 never receives this aircraft in the picture.

**Assessment**: This is an APEX-SENTINEL sensor deployment gap, not a W19 logic gap. W19 can only assess threats it is given data about. If W18 produces no aircraft at the Cernavodă location, W19 correctly outputs no breach.

**Mitigation**:
1. Deploy acoustic/RF sensor nodes at Cernavodă perimeter (operational deployment requirement — not a W19 code issue)
2. W19 can add a "no-detection-event" monitor: if last detection cycle produced zero aircraft in a zone that historically had aircraft, flag as potential sensor failure. Deferred to W20.

**Residual Risk**: MEDIUM at current sensor deployment. Reduces to LOW with perimeter sensor deployment.

---

### R-W19-03: AWNING Threshold Calibration Incorrect

**Risk**: The threshold values (nuclear: RED≥50, airport: RED≥75) were set by expert judgement without calibration data. They may be systematically too high or too low.

**Consequence of too high**: Real threats reach ORANGE before alert → delayed response
**Consequence of too low**: Normal traffic triggers constant ORANGE/RED → alert fatigue → threshold ignored

**Mitigation Strategy**:
1. W19 thresholds are configurable constants (not hardcoded), defined in `src/intel/constants.ts` and LKGC_TEMPLATE.md
2. Deployment phase: run W19 in "shadow mode" for 2 weeks (generate scores and notifications but don't dispatch to AACR). Measure false positive rate.
3. Calibrate thresholds against shadow-mode data before activating real AACR dispatch.
4. Document any threshold change in DECISION_LOG.md (DL-W19-009 or later).

**Current Status**: Thresholds are initial expert estimates. Calibration required before production.

**Residual Risk**: MEDIUM until calibration. LOW after shadow-mode calibration.

---

### R-W19-04: GDPR Legal Basis Challenged

**Risk**: ANSPDCP or an affected data subject challenges APEX-SENTINEL's use of Art.6(1)(e) (public interest) as the legal basis for processing aircraft position data.

**Challenge scenario**: EASA Open Category drone operator files a complaint with ANSPDCP claiming APEX-SENTINEL tracks their registered drone without consent (Art.6(1)(a)) or legitimate interest (Art.6(1)(f)).

**Counter-arguments**:
1. Art.6(1)(e) is explicitly confirmed by Romanian Law 535/2004 (national security) and Law 21/2020 (UAS safety)
2. Processing is not for commercial purposes — it is for public safety
3. EASA itself encourages drone detection systems under EU 2019/947 (proportionate use of force in restricted areas)
4. Open category UAS operators are required to comply with restricted zone rules under EU 2019/947 Art.16; monitoring compliance is not surveillance

**Mitigation**:
1. Full DPIA completed before production deployment (as noted in PRIVACY_ARCHITECTURE.md)
2. Legal opinion from Romanian aviation law firm on Art.6(1)(e) basis
3. Published privacy notice (W20 task) before any live processing

**Residual Risk**: LOW with DPIA and legal opinion in place.

---

### R-W19-05: HMAC Key Rotation — Pseudonymisation Breaks

**Risk**: If APEX_DEPLOY_SECRET is rotated, all existing pseudonymised IDs change. W20's Supabase records will have old pseudoIds that no longer match new tracks of the same aircraft.

**Scenario**: Week 1: aircraft '4b1800' → pseudoId 'abc123def456xyz0'. Key rotated. Week 2: aircraft '4b1800' → pseudoId '9876fedcba5432ef'. Same aircraft, different pseudoId. Track continuity broken.

**Impact for W19**: W19 is in-memory; no Supabase records. Key rotation within a deployment session has zero impact (W19 state is gone on restart anyway).

**Impact for W20**: W20 persists pseudoIds to Supabase. Key rotation breaks W20's ability to correlate incidents to the same aircraft across time.

**Mitigation**:
1. W19 documents key rotation consequences in HANDOFF.md (done)
2. W20 must not use pseudoId for incident correlation across restarts — use incidentId (sequential) instead
3. If key rotation is required: W20 migration to re-pseudonymise all stored tracks (acceptable for small incident log)

**Residual Risk**: LOW for W19 specifically. W20 must design around this.

---

### R-W19-06: APEX_DEPLOY_SECRET Missing in Production

**Risk**: Operator deploys W19 without setting APEX_DEPLOY_SECRET. GdprTrackAnonymiser returns ERROR_PASSTHROUGH for all Cat-A aircraft. privacyBreachFlag=true on every ThreatIntelPicture.

**Impact**: Precise position data for Cat-A aircraft logged and processed without pseudonymisation. GDPR violation until corrected.

**Mitigation**:
1. DEPLOY_CHECKLIST.md explicitly requires APEX_DEPLOY_SECRET (done)
2. W19 pipeline startup should WARN loudly (console.error) if APEX_DEPLOY_SECRET is missing or < 32 chars
3. W20 monitoring should alert on privacyBreachFlag=true in ThreatIntelPicture

**Detection**: privacyBreachFlag=true in any ThreatIntelPicture immediately signals the problem.

**Residual Risk**: LOW with startup warning + W20 monitoring.

---

### R-W19-07: W18 Feed Outage During Breach Event

**Risk**: A breach event is occurring, but W18 ADS-B feed goes offline. W19 stops receiving AircraftState. W19 cannot see the continuing breach.

**Impact**: AWNING level reverts to GREEN on next cycle (no aircraft in picture → no breach → GREEN). AACR notifications stop. Real breach continues unmonitored.

**Mitigation**:
1. W18's EuDataFeedRegistry has circuit-breaker per feed. Last-known positions are retained in W18 for the feed timeout period.
2. W19 should implement a "breach persistence" mechanism: if a breach was detected in the last cycle and the aircraft disappears from the picture, maintain the breach with a "LOST_CONTACT" flag for 60s before clearing.
3. Deferred to W19 Execute phase as an enhancement (not a test target, but implementable in FR-W19-08).

**Residual Risk**: MEDIUM at initial deployment (no breach persistence). LOW after persistence implementation.

---

### R-W19-13: W19 Pipeline Error Blocks W10

**Risk**: W19 ThreatIntelPipeline throws an unhandled exception that propagates to the W10 AWNING engine's NATS subscription handler, causing W10 to stop processing.

**Mitigation**:
1. W19 pipeline wraps ALL steps in try/catch (specified in FR-W19-08 resilience requirement)
2. W19 and W10 are separate NATS subscribers — W19 failure cannot directly crash W10
3. W10 subscribes to `sentinel.awning.*` not to W19 NATS output; W10 can operate independently
4. `degradedMode=true` flag + `sentinel.intel.pipeline_error` NATS event alerts operators

**Residual Risk**: LOW — W10 is independent; W19 pipeline failure is contained.

---

### R-W19-14: CNCAN Escalation Not Tested End-to-End (HIGH)

**Risk**: The `cncanEscalationRequired=true` flag in AacrNotification is set by W19 for nuclear zone breaches. But the actual CNCAN notification dispatch is W20's responsibility. If W20 never implements CNCAN dispatch, CNCAN never gets notified of nuclear incidents despite the flag being set.

**Impact**: Critical nuclear security regulatory obligation not fulfilled. CNCAN fines and licence revocation risk for the APEX-SENTINEL operator.

**Mitigation**:
1. FR-W20-02 (AacrDispatchQueue) must explicitly handle `cncanEscalationRequired=true` — this is a MUST in W20 FR_REGISTER
2. HANDOFF.md documents this dependency (done — AACR dispatch section)
3. W19 tests verify the flag is set correctly for nuclear zone breaches (AC-W19-06-03)
4. Nuclear zone breach → AACR notification → cncanEscalationRequired=true is end-to-end tested in W19 pipeline test (FR-W19-08)

**Residual Risk**: HIGH in W19 isolation (W20 not yet built). W20 COMPLETE reduces to LOW.

---

### R-W19-15: Thresholds Not Calibrated Against Real Data

**Risk**: All threshold values were derived theoretically. Without real operational data, there is no empirical validation that the chosen values produce acceptable false positive / false negative rates.

**Consequence**: Systematic mis-calibration discovered only after deployment when AACR inspectors report alert fatigue (too many false positives) or miss a real incident.

**Mitigation**:
1. Shadow-mode deployment (W19 runs but AACR dispatch disabled) for minimum 2 weeks before live operation
2. Collect score distribution data: histogram of all computed scores across all zones over 2-week period
3. Calibrate thresholds to achieve: < 5% of cycles above YELLOW for airport zones, < 2% for nuclear zones
4. Document calibration findings in a new DECISION_LOG entry (DL-W19-009)

**Current Status**: OPEN — calibration deferred to post-initial-deployment.

**Residual Risk**: MEDIUM until calibrated. Acceptable for initial deployment given shadow-mode approach.
