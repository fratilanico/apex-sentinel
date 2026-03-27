# APEX-SENTINEL W19 — IMPLEMENTATION PLAN

## Theme: Romania/EU Threat Intelligence Layer

---

## Phase Overview

```
Phase 0: Pre-conditions check      (0.5h)
Phase 1: Types and constants       (1h)
Phase 2: FR-W19-01 Classifier      (2h)
Phase 3: FR-W19-02 BreachDetector  (2h)
Phase 4: FR-W19-03 ScoringEngine   (2h)
Phase 5: FR-W19-04 AwningAssigner  (1.5h)
Phase 6: FR-W19-05 GdprAnonymiser  (1.5h)
Phase 7: FR-W19-06 AacrFormatter   (1.5h)
Phase 8: FR-W19-07 RomatsaInterface (1.5h)
Phase 9: FR-W19-08 Pipeline        (2h)
Phase 10: Integration + coverage   (1.5h)
Total: ~17h (2-3 coding sessions)
```

---

## Phase 0: Pre-Conditions Check

**Duration**: 30 minutes
**Blocker**: W18 EuSituationalPicture interface must be available

```bash
# Verify W18 types are available
ls src/feeds/                    # Check for eu-data-integration-pipeline.ts
grep -n "EuSituationalPicture" src/feeds/eu-data-integration-pipeline.ts

# Verify NATS is running
nats server check

# Set test environment variable
export APEX_DEPLOY_SECRET=$(openssl rand -base64 32)
echo $APEX_DEPLOY_SECRET > .env.test.secret   # Keep this file in .gitignore

# Run existing tests to confirm baseline
npx vitest run --passWithNoTests 2>&1 | tail -5
# Should show: X tests passed
```

**Go/No-Go**: If W18 types are not available, begin with W18 interface mocks. TDD tests can be written against mocks and updated when W18 completes.

---

## Phase 1: Types and Constants

**Duration**: 1 hour
**Outputs**: `src/intel/types.ts`, `src/intel/constants.ts`, `src/intel/romania-geo.ts`

**Implementation order**:

1. Create `src/intel/types.ts`:
   - Copy all interfaces from DATABASE_SCHEMA.md
   - All W19 types: `UasThreatCategory`, `CategoryResult`, `ZoneBreach`, `ThreatScore`, `ZoneAwningState`, `AnonymisedTrack`, `AacrNotification`, `RomatsaCoordinationMessage`, `ThreatIntelPicture`, `MlSignalBundle`
   - Export all types

2. Create `src/intel/constants.ts`:
   - `CATEGORY_MULTIPLIERS`
   - `AWNING_THRESHOLDS`
   - `ROMATSA_COORDINATION_AIRPORTS`
   - `LKGC_*` constants from LKGC_TEMPLATE.md

3. Create `src/intel/romania-geo.ts`:
   - `ROMANIA_BBOX`
   - All airport coordinates (LROP, LRCL, LRTR, LRSB, LRCK, LRBS)
   - `CERNAVODA_COORDS`, `BUCHAREST_GOVT`
   - `BUCHAREST_FIR = 'LRBB'`

**Verification**: `npx tsc --noEmit` — 0 errors

---

## Phase 2: FR-W19-01 EasaCategoryClassifier

**Duration**: 2 hours
**Output**: `src/intel/easa-category-classifier.ts`

**TDD RED first**:
```bash
# Write tests/intel/easa-category-classifier.test.ts (14 tests)
# All 14 tests must fail before any implementation
npx vitest run tests/intel/easa-category-classifier.test.ts
# Expected: 14 FAILED
```

**Implementation steps**:

1. Implement `classify(aircraft, mlSignals?)` method:
   - ADS-B category field mapping (priority 1): A-series → cat-a, B-series → cat-b, C-series → cat-c
   - Non-cooperative default (priority 2): cooperativeContact=false → cat-d
   - Heuristic path (priority 3): velocity + altitude profile
   - ML signal refinement (priority 4): acoustic/RF confidence adjustment

2. Implement `classifyBatch(aircraft[], mlSignals[])` as a simple map over `classify()`

3. Wrap all code in try/catch — return cat-d-unknown on any error

**Verification**: `npx vitest run tests/intel/easa-category-classifier.test.ts` — 14/14 GREEN

---

## Phase 3: FR-W19-02 ProtectedZoneBreachDetector

**Duration**: 2 hours
**Output**: `src/intel/protected-zone-breach-detector.ts`

**TDD RED first**:
```bash
# Write tests/intel/protected-zone-breach-detector.test.ts (13 tests)
npx vitest run tests/intel/protected-zone-breach-detector.test.ts
# Expected: 13 FAILED
```

**Implementation steps**:

1. Implement `haversineM(lat1, lon1, lat2, lon2)` — pure function, Earth radius 6371000m

2. Implement `computeTtBreachSeconds(aircraft, zone, distanceM)`:
   - Return null if already inside (distanceM < radiusM)
   - Return null if velocityMs is null or zero
   - Use current heading to determine if approaching: dot product of velocity vector and zone direction vector
   - Return (distanceM - radiusM) / approachRateMs if approaching

3. Implement `detectBreaches(aircraft[], zones[], previous?)`:
   - Double loop: each aircraft × each zone
   - Call haversineM for each pair
   - If distanceM < zone.alertRadiusM: potential breach
   - Determine breachType from distanceM vs radiusM vs previous state
   - Only include in return array if distanceM < zone.alertRadiusM (both INSIDE and ENTERING)

**Performance optimisation**: Pre-compute zone centre coordinates as radians before the inner loop. At 500 aircraft × 28 zones = 14,000 pairs, this saves significant repeated Math.PI/180 conversions.

**Verification**: `npx vitest run tests/intel/protected-zone-breach-detector.test.ts` — 13/13 GREEN

---

## Phase 4: FR-W19-03 ThreatScoringEngine

**Duration**: 2 hours
**Output**: `src/intel/threat-scoring-engine.ts`

**TDD RED first**:
```bash
# Write tests/intel/threat-scoring-engine.test.ts (15 tests)
npx vitest run tests/intel/threat-scoring-engine.test.ts
# Expected: 15 FAILED
```

**Implementation steps**:

1. Implement `hasActiveSecurityEventWithin10km(breach, zone, events)`:
   - For each event: haversineM(event.lat, event.lon, zone.centreLat, zone.centreLon) < 10000
   - Return true if any such event found

2. Implement `score(breaches, categories, zones, atmospheric, events)`:
   - For each breach:
     - Find matching zone (by zoneId)
     - Find matching category (by aircraftId)
     - Compute proximityScore = clamp(100 * (1 - breach.distanceM / zone.radiusM), 0, 100)
     - Apply categoryMult from CATEGORY_MULTIPLIERS
     - Add atmospheric bonus (check flyabilityScore > threshold)
     - Add security bonus (call hasActiveSecurityEventWithin10km)
     - Final = Math.round(clamp(sum, 0, 100))
     - Build ThreatScore with all factors documented
   - Return ThreatScore[]

**Critical**: `Math.round()` on final score only. All intermediate values are floating-point. This ensures determinism and testability.

**Verification**: `npx vitest run tests/intel/threat-scoring-engine.test.ts` — 15/15 GREEN

---

## Phase 5: FR-W19-04 EuAwningLevelAssigner

**Duration**: 1.5 hours
**Output**: `src/intel/eu-awning-level-assigner.ts`

**TDD RED first**:
```bash
# Write tests/intel/eu-awning-level-assigner.test.ts (12 tests)
npx vitest run tests/intel/eu-awning-level-assigner.test.ts
# Expected: 12 FAILED
```

**Implementation steps**:

1. Implement `mapCategoryToThresholdKey(category: ProtectedZoneCategory): string`
2. Implement `scoreToAwningLevel(score: number, thresholds: AwningThresholds): AwningLevel`
3. Implement `assign(scores, zones, previous)`:
   - Group scores by zoneId
   - For each zone with scores: maxScore = max(scores)
   - For each zone without scores: level = GREEN
   - Apply threshold lookup
   - Compare to previous; set changed=true if level differs
   - Call publishAwningChange for changed zones (async)
4. Implement `publishAwningChange(state)`: natsClient.publish('sentinel.intel.awning_change', JSON.stringify(state))

**Verification**: `npx vitest run tests/intel/eu-awning-level-assigner.test.ts` — 12/12 GREEN

---

## Phase 6: FR-W19-05 GdprTrackAnonymiser

**Duration**: 1.5 hours
**Output**: `src/intel/gdpr-track-anonymiser.ts`

**TDD RED first**:
```bash
# Write tests/intel/gdpr-track-anonymiser.test.ts (11 tests)
npx vitest run tests/intel/gdpr-track-anonymiser.test.ts
# Expected: 11 FAILED
```

**Implementation steps**:

1. Implement `gridSnap(coordinate: number): number`:
   - `return Math.floor(coordinate * 1000) / 1000`

2. Implement `anonymise(aircraft, category, trackStartedAt)`:
   - Check deploySecret (if missing: ERROR_PASSTHROUGH + privacyBreachFlag)
   - Check category (if cat-d-unknown: EXEMPT + Art.6(1)(e) legal basis)
   - Compute trackAge = (Date.now() - new Date(trackStartedAt).getTime()) / 1000
   - If trackAge < 30: PENDING + apply gridSnap as precaution
   - If trackAge >= 30: ANONYMISED
     - pseudoId = createHmac('sha256', deploySecret).update(aircraft.icao24).digest('hex').slice(0, 16)
     - gridLat = gridSnap(aircraft.lat)
     - gridLon = gridSnap(aircraft.lon)
     - callsignPrefix = aircraft.callsign?.slice(0, 3) ?? 'UNK'
   - Build AnonymisedTrack with expiresAt = trackStartedAt + 24h

3. Implement `anonymiseBatch()` as map over `anonymise()`

**Note**: Use Node.js built-in `crypto.createHmac` — no external dependency needed.

**Verification**: `npx vitest run tests/intel/gdpr-track-anonymiser.test.ts` — 11/11 GREEN

---

## Phase 7: FR-W19-06 AacrNotificationFormatter

**Duration**: 1.5 hours
**Output**: `src/intel/aacr-notification-formatter.ts`

**TDD RED first**:
```bash
# Write tests/intel/aacr-notification-formatter.test.ts (10 tests)
npx vitest run tests/intel/aacr-notification-formatter.test.ts
# Expected: 10 FAILED
```

**Implementation steps**:

1. Implement `scoreToRecommendedAction(score: number): AacrRecommendedAction`
2. Implement `estimateSizeClass(aircraft: AircraftState): EstimatedSizeClass`
3. Implement `format(breaches, scores, awningLevels, zones, categories)`:
   - Filter: only ORANGE/RED awning levels
   - For each qualifying breach:
     - Generate incidentId: 'AACR-' + year + '-' + (++this.sequenceCounter).toString().padStart(6, '0')
     - timestampUtc = breach.firstDetectedAt (NOT Date.now())
     - Set cncanEscalationRequired = zone.category === 'NUCLEAR_PLANT'
     - Set operatorConfirmationRequired = true (always for ORANGE/RED)
     - Publish to NATS 'sentinel.intel.aacr_notification'
   - Return AacrNotification[]

**Verification**: `npx vitest run tests/intel/aacr-notification-formatter.test.ts` — 10/10 GREEN

---

## Phase 8: FR-W19-07 RomatsaCoordinationInterface

**Duration**: 1.5 hours
**Output**: `src/intel/romatsa-coordination-interface.ts`

**TDD RED first**:
```bash
# Write tests/intel/romatsa-coordination-interface.test.ts (10 tests)
npx vitest run tests/intel/romatsa-coordination-interface.test.ts
# Expected: 10 FAILED
```

**Implementation steps**:

1. Implement `isBreachCoveredByNotam(breach, zone, notams)`:
   - Filter notams: status=ACTIVE AND type in ['R', 'P', 'D'] AND icaoLocation === zone.icaoDesignator
   - Return true if any such NOTAM found

2. Implement `downgradeAction(action: RomatsaRecommendedAction): RomatsaRecommendedAction`:
   - EMERGENCY → INTERCEPT
   - INTERCEPT → WARN
   - WARN → MONITOR
   - MONITOR → MONITOR (already minimum)

3. Implement `generate(awningLevels, notams, breaches, aircraft, zones, categories, aacrNotifications)`:
   - Filter: only RED awning levels where zone.icaoDesignator in ROMATSA_COORDINATION_AIRPORTS
   - For each qualifying zone:
     - Find associated breach and aircraft
     - Convert speed (ms → kts) and altitude (m → ft)
     - Check NOTAM cross-reference
     - Build RomatsaCoordinationMessage with TLP:RED
     - Publish to NATS 'sentinel.intel.romatsa_coordination'

**Verification**: `npx vitest run tests/intel/romatsa-coordination-interface.test.ts` — 10/10 GREEN

---

## Phase 9: FR-W19-08 W19ThreatIntelPipeline

**Duration**: 2 hours
**Output**: `src/intel/w19-threat-intel-pipeline.ts`

**TDD RED first**:
```bash
# Write tests/intel/w19-threat-intel-pipeline.test.ts (13 tests)
npx vitest run tests/intel/w19-threat-intel-pipeline.test.ts
# Expected: 13 FAILED
```

**Implementation steps**:

1. Constructor: instantiate all 7 component classes; initialise state maps
2. Implement `process(picture: EuSituationalPicture): Promise<ThreatIntelPicture>`:
   - Record startTime = Date.now()
   - Step 1: classifyBatch (sync)
   - Step 2: detectBreaches (sync) — pass previous breach state
   - Step 3: score (sync)
   - Step 4: assign (async — NATS publish)
   - Step 5: anonymiseBatch (sync) — parallel to steps 6-7
   - Step 6: format (async — NATS publish) — parallel with step 7
   - Step 7: generate (async — NATS publish) — parallel with step 6
   - Await steps 4, 6, 7
   - Assemble ThreatIntelPicture
   - Emit 'picture_updated' event
   - Publish to NATS sentinel.intel.picture_update
   - Return picture
   - Wrap each step in try/catch; on failure: set degradedMode=true, continue

3. Implement `start()`: subscribe to NATS sentinel.feeds.eu_picture; call process() on each message
4. Implement `stop()`: drain NATS subscription; remove listeners

**Verification**: `npx vitest run tests/intel/w19-threat-intel-pipeline.test.ts` — 13/13 GREEN

---

## Phase 10: Integration and Coverage

**Duration**: 1.5 hours

```bash
# Full W19 suite
npx vitest run tests/intel/
# Expected: 98/98 GREEN

# Full regression check
npx vitest run
# Expected: 3195+ / 3195+ GREEN

# Coverage check
npx vitest run --coverage
# Expected: src/intel/* ≥ 80% all metrics

# TypeScript check
npx tsc --noEmit
# Expected: 0 errors

# Build check
npm run build
# Expected: 0 errors
```

**On any failure**: Do NOT commit. Fix the issue first.

---

## Commit Protocol

```bash
# Only when ALL gates pass:
git add src/intel/ tests/intel/ tests/fixtures/ tests/mocks/
git status                    # Verify only W19 files staged
git commit -m "feat(w19): Romania/EU threat intelligence layer — 98 tests GREEN"
git push origin main
```

**Tag as COMPLETE**:
```bash
git tag -a v0.19.0 -m "W19 complete: Romania/EU threat intelligence layer"
git push origin v0.19.0
```
