# APEX-SENTINEL W19 — ACCEPTANCE CRITERIA

## Theme: Romania/EU Threat Intelligence Layer

---

## FR-W19-01: EasaCategoryClassifier

### AC-W19-01-01: ADS-B Category Field Mapping

**Given** an AircraftState with `category='A3'` (large general aviation, ADS-B emitter category A3) and `cooperativeContact=true`
**When** `EasaCategoryClassifier.classify()` is called
**Then** result.category = `'cat-a-commercial'` AND result.confidence >= 0.90

---

### AC-W19-01-02: Non-Cooperative Aircraft Default

**Given** an AircraftState with `cooperativeContact=false`, `category=null`, `squawk=null`
**When** `EasaCategoryClassifier.classify()` is called
**Then** result.category = `'cat-d-unknown'` AND result.confidence >= 0.90 AND result.classificationBasis = `'transponder-absent'`

---

### AC-W19-01-03: Low-Slow Heuristic (Consumer Drone)

**Given** an AircraftState with `altBaro=80`, `velocityMs=12`, `cooperativeContact=false`, `category=null`
**When** `EasaCategoryClassifier.classify()` is called
**Then** result.category = `'cat-a-commercial'` AND result.classificationBasis = `'heuristic-velocity'`

---

### AC-W19-01-04: ML Signal Confidence Boost

**Given** an AircraftState (non-cooperative) AND an MlSignalBundle with `acousticDroneConfidence=0.88`
**When** `EasaCategoryClassifier.classify(aircraft, mlSignals)` is called
**Then** result.confidence >= 0.90 AND result.classificationBasis = `'ml-signal-informed'`

---

### AC-W19-01-05: Never Throws

**Given** a malformed AircraftState (null lat, undefined callsign, garbage category field)
**When** `EasaCategoryClassifier.classify()` is called
**Then** no exception is thrown AND result.category = `'cat-d-unknown'`

---

## FR-W19-02: ProtectedZoneBreachDetector

### AC-W19-02-01: INSIDE Breach at LROP

**Given** an aircraft at lat=44.5800, lon=26.0850 (1.0km from LROP centre) AND zone RO-LROP-EXCLUSION (radiusM=5000)
**When** `ProtectedZoneBreachDetector.detectBreaches()` is called
**Then** returns ZoneBreach with `zoneId='RO-LROP-EXCLUSION'`, `breachType='INSIDE'`, `distanceM≈1000`

---

### AC-W19-02-02: No Breach Outside Zone

**Given** an aircraft at lat=45.000, lon=24.500 (no protected zones in vicinity)
**When** `ProtectedZoneBreachDetector.detectBreaches()` is called with standard Romania zones
**Then** returns empty array `[]`

---

### AC-W19-02-03: ENTERING Breach Detection

**Given** an aircraft at lat=44.5230, lon=26.0849 (5.3km from LROP, within alertRadius 5.5km) AND velocity approaching LROP at 15 m/s
**When** `ProtectedZoneBreachDetector.detectBreaches()` is called
**Then** returns ZoneBreach with `breachType='ENTERING'` AND `ttBreachS` is a positive number

---

### AC-W19-02-04: Haversine Accuracy

**Given** LROP centre (44.5713°N, 26.0849°E) and Cernavodă (44.3267°N, 28.0606°E)
**When** `haversineM()` is called
**Then** result is between 187,000m and 189,000m (real-world: approximately 187.8km)

---

### AC-W19-02-05: Multiple Zone Simultaneous Breach

**Given** an aircraft positioned inside both LROP CTR (8km) and LROP Exclusion (5km) zones
**When** `detectBreaches()` is called
**Then** returns exactly 2 ZoneBreach records, one per zone

---

## FR-W19-03: ThreatScoringEngine

### AC-W19-03-01: Maximum Score at Zone Centre

**Given** a ZoneBreach with `distanceM=0` AND `cat-d-unknown` category AND `flyabilityScore=80` AND SecurityEvent within 10km
**When** `ThreatScoringEngine.score()` is called
**Then** result.value = 100 (clamp at maximum: 100×1.0 + 10 + 15 = 125 → clamped to 100)

---

### AC-W19-03-02: Cat-A Multiplier Reduces Score

**Given** a ZoneBreach with `distanceM=2500`, `zone.radiusM=5000` AND `cat-a-commercial` AND no atmospheric/security bonuses
**When** `ThreatScoringEngine.score()` is called
**Then** result.value = Math.round(50 × 0.4) = 20 (GREEN for airport zone)

---

### AC-W19-03-03: Atmospheric Bonus Applied

**Given** identical breach and category AND `flyabilityScore=75` (> 70)
**When** compared to same inputs with `flyabilityScore=60`
**Then** score with flyabilityScore=75 is exactly 10 points higher

---

### AC-W19-03-04: Security Event Bonus Applied

**Given** a ZoneBreach AND an active SecurityEvent at 8km from zone (within 10km threshold)
**When** compared to same breach with no security events
**Then** score with security event is exactly 15 points higher

---

### AC-W19-03-05: Score Determinism

**Given** identical EuSituationalPicture inputs
**When** `ThreatScoringEngine.score()` is called twice consecutively
**Then** both calls return identical ThreatScore[] results (no randomness)

---

## FR-W19-04: EuAwningLevelAssigner

### AC-W19-04-01: Airport Zone Threshold Verification

**Given** threat scores of [19, 49, 74, 75] for an airport zone across 4 cycles
**When** `EuAwningLevelAssigner.assign()` is called for each cycle
**Then** levels are: GREEN, YELLOW, ORANGE, RED (in that order)

---

### AC-W19-04-02: Nuclear Zone Stricter Thresholds

**Given** a threat score of 45 for a nuclear zone AND the same score 45 for an airport zone in the same cycle
**When** `EuAwningLevelAssigner.assign()` is called
**Then** nuclear zone = RED (45 >= 50 threshold = FALSE, 45 >= orangeMax 50: actually 45 < 50 → ORANGE) AND airport zone = YELLOW (45 < 50)

*(Clarification: nuclear orangeMax=50, so score=45 → ORANGE for nuclear. Airport yellowMax=50, so score=45 → YELLOW for airport. Nuclear is 2 levels higher than airport for same score.)*

---

### AC-W19-04-03: AWNING Change Triggers NATS Publish

**Given** previous AWNING level is GREEN AND new score triggers YELLOW
**When** `EuAwningLevelAssigner.assign()` is called
**Then** NATS client receives publish call for subject `'sentinel.intel.awning_change'` with payload containing `zoneId`, `level='YELLOW'`, `changed=true`

---

### AC-W19-04-04: No Publish When Level Unchanged

**Given** previous AWNING level is YELLOW AND new score is still within YELLOW threshold
**When** `EuAwningLevelAssigner.assign()` is called
**Then** NATS client does NOT receive a publish call

---

## FR-W19-05: GdprTrackAnonymiser

### AC-W19-05-01: Cat-A Anonymised After 30s

**Given** an AircraftState with `cooperativeContact=true` (Cat-A classification) AND trackStartedAt 35 seconds ago
**When** `GdprTrackAnonymiser.anonymise()` is called
**Then** result.anonymisationStatus = `'ANONYMISED'` AND result.pseudoId is a 16-char hex string AND result.gridLat is floored to 3dp

---

### AC-W19-05-02: Cat-D Never Anonymised

**Given** an AircraftState classified as `'cat-d-unknown'`, regardless of track age
**When** `GdprTrackAnonymiser.anonymise()` is called
**Then** result.anonymisationStatus = `'EXEMPT'` AND result.legalBasis = `'Art.6(1)(e)'`

---

### AC-W19-05-03: Grid Snap Precision

**Given** aircraft at lat=44.57134, lon=26.08492
**When** `GdprTrackAnonymiser.gridSnap()` is called for each coordinate
**Then** gridLat = 44.571 AND gridLon = 26.084

---

### AC-W19-05-04: Pseudonymisation Deterministic

**Given** ICAO24 = `'4b1800'` AND deploySecret = `'test-secret'`
**When** `anonymise()` is called twice with identical inputs
**Then** both calls return identical pseudoId values

---

### AC-W19-05-05: Privacy Breach Flag on Missing Secret

**Given** deploySecret is empty string or undefined
**When** `GdprTrackAnonymiser.anonymise()` is called for a Cat-A aircraft
**Then** result.anonymisationStatus = `'ERROR_PASSTHROUGH'` AND result.privacyBreachFlag = true

---

## FR-W19-06: AacrNotificationFormatter

### AC-W19-06-01: All 7 SIRA Fields Present

**Given** an ORANGE AWNING event for LROP (airport zone)
**When** `AacrNotificationFormatter.format()` is called
**Then** result contains: `incidentId`, `timestampUtc`, `locationIcao='LROP'`, `aircraftCategory`, `awningLevel='ORANGE'`, `recommendedAction`, `operatorConfirmationRequired=true`

---

### AC-W19-06-02: Timestamp is Breach Detection Time

**Given** breach.firstDetectedAt = `'2026-03-27T14:30:00Z'` AND notification generated at `'2026-03-27T14:30:05Z'`
**When** notification is formatted
**Then** notification.timestampUtc = `'2026-03-27T14:30:00Z'` (breach time, not generation time)

---

### AC-W19-06-03: CNCAN Flag for Nuclear Breach

**Given** a RED AWNING event for Cernavodă nuclear zone
**When** `AacrNotificationFormatter.format()` is called
**Then** notification.cncanEscalationRequired = true

---

### AC-W19-06-04: No Notification for Green/Yellow

**Given** all zone AWNING levels are GREEN or YELLOW
**When** `AacrNotificationFormatter.format()` is called
**Then** returns empty array `[]`

---

## FR-W19-07: RomatsaCoordinationInterface

### AC-W19-07-01: RED Airport Breach Generates Coordination Message

**Given** AWNING level RED for LROP (airport zone) AND no active NOTAM covering the area
**When** `RomatsaCoordinationInterface.generate()` is called
**Then** returns RomatsaCoordinationMessage with `affectedAerodrome='LROP'`, `awningLevel='RED'`, `classification='TLP:RED'`

---

### AC-W19-07-02: NOTAM Coverage Downgrades Action

**Given** RED AWNING at LRCL AND an active NOTAM of type R covering LRCL
**When** `RomatsaCoordinationInterface.generate()` is called
**Then** `notamCoverage=true` AND `actionDowngradedByNotam=true` AND `recommendedAction` is one level lower than without NOTAM

---

### AC-W19-07-03: No Coordination for Non-Airport RED

**Given** RED AWNING for Cernavodă nuclear zone (non-airport)
**When** `RomatsaCoordinationInterface.generate()` is called
**Then** returns empty array `[]` (nuclear RED handled by AACR/CNCAN, not ROMATSA)

---

### AC-W19-07-04: Speed and Altitude Conversion

**Given** aircraft with `velocityMs=50` and `altBaro=1000`
**When** `RomatsaCoordinationInterface.generate()` is called
**Then** message.aircraftSpeedKts ≈ 97 (50 × 1.944) AND message.aircraftAltitudeFt ≈ 3281 (1000 × 3.281)

---

## FR-W19-08: W19ThreatIntelPipeline

### AC-W19-08-01: Full Pipeline Happy Path

**Given** a complete EuSituationalPicture with aircraft, zones, atmospheric, and security data
**When** `W19ThreatIntelPipeline.process()` is called
**Then** returns a ThreatIntelPicture with all 6 required output fields populated

---

### AC-W19-08-02: All Four NATS Events Emitted

**Given** an EuSituationalPicture producing a breach → ORANGE AWNING for LROP → escalation
**When** `process()` is called
**Then** NATS mock receives publishes on: `sentinel.intel.breach_detected`, `sentinel.intel.awning_change`, `sentinel.intel.aacr_notification`, and (if RED) `sentinel.intel.romatsa_coordination`

---

### AC-W19-08-03: Degraded Mode on Step Failure

**Given** RomatsaCoordinationInterface constructor is mocked to throw on `generate()`
**When** `W19ThreatIntelPipeline.process()` is called
**Then** pipeline completes (does not throw) AND `picture.degradedMode=true` AND `picture.coordinationMessages=[]`

---

### AC-W19-08-04: Performance Gate

**Given** an EuSituationalPicture with 50 aircraft and 8 protected zones
**When** `process()` is called and latency measured
**Then** `picture.pipelineLatencyMs < 500`

---

### AC-W19-08-05: Privacy Breach Propagation

**Given** GdprTrackAnonymiser configured with no deploySecret (triggers ERROR_PASSTHROUGH)
**When** `process()` is called
**Then** `picture.privacyBreachFlag=true`
