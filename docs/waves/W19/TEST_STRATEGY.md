# APEX-SENTINEL W19 — TEST STRATEGY

## Theme: Romania/EU Threat Intelligence Layer

---

## TDD Methodology

W19 follows the APEX OS wave-formation TDD protocol:
1. Write all 98 tests FIRST (TDD RED phase)
2. All tests must fail before any implementation is written
3. Commit RED state to git
4. Implement FRs until all tests GREEN
5. No test may be deleted or weakened to pass

Test framework: **Vitest** (consistent with W1–W18)
Test location: `tests/intel/` (mirroring `src/intel/`)

---

## Test Distribution

| FR | File | Tests |
|----|------|-------|
| FR-W19-01 | `tests/intel/easa-category-classifier.test.ts` | 14 |
| FR-W19-02 | `tests/intel/protected-zone-breach-detector.test.ts` | 13 |
| FR-W19-03 | `tests/intel/threat-scoring-engine.test.ts` | 15 |
| FR-W19-04 | `tests/intel/eu-awning-level-assigner.test.ts` | 12 |
| FR-W19-05 | `tests/intel/gdpr-track-anonymiser.test.ts` | 11 |
| FR-W19-06 | `tests/intel/aacr-notification-formatter.test.ts` | 10 |
| FR-W19-07 | `tests/intel/romatsa-coordination-interface.test.ts` | 10 |
| FR-W19-08 | `tests/intel/w19-threat-intel-pipeline.test.ts` | 13 |
| **Total** | | **98** |

---

## Test Pyramid per FR

Each FR follows the same pyramid pattern:
- **Unit tests** (pure function behaviour): ~60% of tests
- **Component tests** (class methods with mocked dependencies): ~30%
- **Integration tests** (component interacting with NATS mock): ~10%

No Playwright E2E tests for W19 — it is a headless pipeline with no UI surface.

---

## Mock Strategy

### W18 Mocks

W19 tests do not require real W18 feed infrastructure. All W18 types are mocked using factory functions:

```typescript
// tests/fixtures/w18-fixtures.ts

export function makeAircraftState(overrides?: Partial<AircraftState>): AircraftState {
  return {
    icao24: '4b1800',
    callsign: 'ROT214',
    lat: 44.5800,     // Just north of LROP (Henri Coandă)
    lon: 26.0850,
    altBaro: 50,
    altGeo: 52,
    onGround: false,
    velocityMs: 8.0,
    headingDeg: 180,
    verticalRateMs: 0,
    squawk: null,
    category: null,
    cooperativeContact: false,
    threatCategory: null,
    emergencyFlag: null,
    source: 'opensky',
    lastSeen: new Date().toISOString(),
    positionAge: 5,
    inNotamZone: null,
    inUasZone: null,
    inProtectedZone: null,
    ...overrides,
  };
}

export function makeProtectedZone(overrides?: Partial<ProtectedZone>): ProtectedZone {
  return {
    id: 'RO-LROP-EXCLUSION',
    name: 'Henri Coandă International Airport — 5km Exclusion',
    category: 'AIRPORT_EXCLUSION',
    centreLat: 44.5713,
    centreLon: 26.0849,
    radiusM: 5000,
    alertRadiusM: 5500,
    criticalRadiusM: 5000,
    icaoDesignator: 'LROP',
    country: 'RO',
    ...overrides,
  };
}

export function makeAtmosphericConditions(flyabilityScore: number = 75): AtmosphericConditions {
  return {
    flyabilityScore,
    windSpeedMs: 5.0,
    windGustMs: 8.0,
    visibilityM: 10000,
    precipitationMmH: 0,
    temperatureC: 18,
    tier: flyabilityScore > 70 ? 'GOOD' : 'MARGINAL',
  };
}
```

### NATS Mock

```typescript
// tests/mocks/nats-mock.ts

export function makeNatsClient() {
  const published: { subject: string; data: unknown }[] = [];

  return {
    publish: vi.fn((subject: string, data: unknown) => {
      published.push({ subject, data });
    }),
    subscribe: vi.fn(),
    drain: vi.fn(),
    getPublished: () => published,
    clearPublished: () => { published.length = 0; },
  };
}
```

---

## FR-W19-01: EasaCategoryClassifier Tests (14)

```
describe('FR-W19-01: EasaCategoryClassifier') {
  // ADS-B emitter category field mapping
  test('cat-a-commercial when ADS-B category field is A3 (large GA)')
  test('cat-b-modified when ADS-B category field is B1 (rotorcraft)')
  test('cat-c-surveillance when ADS-B category field is C2 (surface vehicle)')
  test('cat-d-unknown when cooperativeContact is false and no category field')
  test('cat-d-unknown when squawk only, no position')

  // Heuristic path
  test('cat-d-unknown for low/slow/non-cooperative aircraft (alt<150m, vel<30ms)')
  test('cat-a-commercial for low/very-slow aircraft (alt<500m, vel<15ms) — likely small drone')
  test('cat-d-unknown default when category absent and heuristic inconclusive')

  // Confidence values
  test('confidence >= 0.9 for unambiguous ADS-B category A/B/C')
  test('confidence = 1.0 for non-cooperative with no transponder at all')
  test('confidence 0.7-0.8 for heuristic-only classification')

  // ML signal integration
  test('confidence boosted to 0.95 when acousticDroneConfidence >= 0.85 and non-cooperative')
  test('RF fingerprint match upgrades to cat-d-unknown with rfFingerprintConfidence')

  // Error handling
  test('returns cat-d-unknown with confidence 0.5 when AircraftState is malformed')
}
```

---

## FR-W19-02: ProtectedZoneBreachDetector Tests (13)

```
describe('FR-W19-02: ProtectedZoneBreachDetector') {
  // Core haversine
  test('haversineM: returns 0 for identical coordinates')
  test('haversineM: Bucharest to Cernavodă ≈ 188km (reference distance)')
  test('haversineM: LROP centre to LROP centre = 0m')

  // Breach detection
  test('detects breach when aircraft is inside zone radiusM')
  test('no breach when aircraft is outside zone radiusM + alertRadiusM')
  test('ENTERING breach when aircraft within alertRadiusM but outside radiusM and approaching')
  test('INSIDE breach when aircraft within radiusM')
  test('EXITING breach when aircraft within radiusM but moving away')

  // Multiple aircraft/zones
  test('processes 50 aircraft × 8 zones, returns only breaching pairs')
  test('aircraft inside two zones simultaneously generates two separate ZoneBreach records')

  // ttBreachS
  test('ttBreachS computed correctly for approaching aircraft')
  test('ttBreachS is null for aircraft already inside zone')
  test('ttBreachS is null when velocityMs is null')
}
```

---

## FR-W19-03: ThreatScoringEngine Tests (15)

```
describe('FR-W19-03: ThreatScoringEngine') {
  // Proximity score
  test('proximityScore = 100 when distanceM = 0 (at zone centre)')
  test('proximityScore = 0 when distanceM = zone.radiusM (at boundary)')
  test('proximityScore is clamped to 0 minimum')

  // Category multipliers
  test('cat-a-commercial multiplier = 0.4')
  test('cat-b-modified multiplier = 0.7')
  test('cat-c-surveillance multiplier = 0.9')
  test('cat-d-unknown multiplier = 1.0')

  // Atmospheric bonus
  test('atmosphericBonus = 10 when flyabilityScore > 70')
  test('atmosphericBonus = 0 when flyabilityScore <= 70')
  test('atmosphericBonus = 0 when atmospheric data is null')

  // Security context bonus
  test('securityContextBonus = 15 when active SecurityEvent within 10km')
  test('securityContextBonus = 0 when no SecurityEvent within 10km')
  test('securityContextBonus = 0 when events array is empty')

  // Final score
  test('final score clamped to 100 maximum even if component sum exceeds 100')
  test('identical inputs produce identical score (determinism)')
}
```

---

## FR-W19-04: EuAwningLevelAssigner Tests (12)

```
describe('FR-W19-04: EuAwningLevelAssigner') {
  // Airport thresholds
  test('airport zone: score 15 → GREEN')
  test('airport zone: score 35 → YELLOW')
  test('airport zone: score 60 → ORANGE')
  test('airport zone: score 80 → RED')

  // Nuclear thresholds (lower = higher sensitivity)
  test('nuclear zone: score 8 → GREEN')
  test('nuclear zone: score 25 → YELLOW')
  test('nuclear zone: score 45 → ORANGE')
  test('nuclear zone: score 55 → RED')

  // Military thresholds
  test('military zone: score 10 → GREEN')
  test('military zone: score 35 → YELLOW')

  // NATS publish on change
  test('publishes to sentinel.intel.awning_change when level changes GREEN → YELLOW')
  test('does NOT publish when level unchanged between cycles')
}
```

---

## FR-W19-05: GdprTrackAnonymiser Tests (11)

```
describe('FR-W19-05: GdprTrackAnonymiser') {
  // Anonymisation timing
  test('Cat-A aircraft: status PENDING within first 30s')
  test('Cat-A aircraft: status ANONYMISED after 30s elapsed')

  // Cat-D exemption
  test('Cat-D aircraft: status EXEMPT regardless of track age')
  test('Cat-D aircraft: original position retained (no grid-snap applied to identity)')

  // Grid-snap
  test('gridSnap: lat 44.57134 → 44.571 (floor to 3dp)')
  test('gridSnap: lon 26.08492 → 26.084 (floor to 3dp)')
  test('gridSnap applied to Cat-A even in PENDING status')

  // Pseudonymisation
  test('pseudoId is deterministic for same ICAO24 + deploySecret')
  test('callsignPrefix = first 3 chars of callsign')
  test('callsignPrefix = UNK when callsign is null')

  // Error handling
  test('status ERROR_PASSTHROUGH and privacyBreachFlag=true when deploySecret missing')
}
```

---

## FR-W19-06: AacrNotificationFormatter Tests (10)

```
describe('FR-W19-06: AacrNotificationFormatter') {
  // Trigger condition
  test('generates notification for ORANGE AWNING event')
  test('generates notification for RED AWNING event')
  test('does NOT generate notification for YELLOW or GREEN')

  // SIRA field completeness
  test('all 7 SIRA fields populated: incidentId, timestampUtc, location, aircraftDesc, threat, action, confirmRequired')
  test('timestampUtc = breach.firstDetectedAt, NOT report generation time')
  test('locationIcao = zone.icaoDesignator when available')

  // CNCAN escalation
  test('cncanEscalationRequired=true for nuclear zone breach')
  test('cncanEscalationRequired=false for airport zone breach')

  // GDPR Art.22
  test('operatorConfirmationRequired=true for all ORANGE events')
  test('operatorConfirmationRequired=true for all RED events')
}
```

---

## FR-W19-07: RomatsaCoordinationInterface Tests (10)

```
describe('FR-W19-07: RomatsaCoordinationInterface') {
  // Trigger condition
  test('generates coordination message for RED AWNING near LROP')
  test('generates coordination message for RED AWNING near LRCL')
  test('does NOT generate for RED AWNING near non-airport zone (e.g. nuclear)')
  test('does NOT generate for ORANGE AWNING (RED only)')

  // NOTAM cross-reference
  test('notamCoverage=true when active NOTAM type R covers affected area')
  test('actionDowngradedByNotam=true when NOTAM coverage found')
  test('action downgraded: INTERCEPT → WARN when NOTAM present')

  // Speed/altitude conversion
  test('aircraftSpeedKts = velocityMs * 1.944 (rounded)')
  test('aircraftAltitudeFt = altBaro * 3.281 (rounded)')

  // Classification
  test('TLP:RED classification set on all messages')
}
```

---

## FR-W19-08: W19ThreatIntelPipeline Tests (13)

```
describe('FR-W19-08: W19ThreatIntelPipeline') {
  // Happy path
  test('processes EuSituationalPicture and returns ThreatIntelPicture')
  test('ThreatIntelPicture contains all 6 output fields')
  test('pipeline runs all 7 steps in order')

  // NATS events
  test('emits breach_detected event for each new ZoneBreach')
  test('emits awning_change event when AWNING level changes')
  test('emits aacr_notification event for ORANGE/RED breaches')
  test('emits romatsa_coordination event for RED airport breaches')
  test('emits picture_updated event after assembly')

  // Partial failure resilience
  test('continues pipeline if EasaCategoryClassifier throws; uses cat-d fallback')
  test('continues pipeline if RomatsaCoordinationInterface fails; coordinationMessages=[]')
  test('sets degradedMode=true if any step fails')

  // Performance
  test('processes 50 aircraft × 8 zones in < 500ms')

  // Privacy
  test('privacyBreachFlag=true propagated to ThreatIntelPicture when anonymiser reports error')
}
```

---

## Coverage Requirements

| Metric | Minimum | Target |
|--------|---------|--------|
| Branch coverage | 80% | 90% |
| Line coverage | 80% | 95% |
| Function coverage | 80% | 100% |
| Statement coverage | 80% | 95% |

Run: `npx vitest run --coverage`

---

## Regression Guard

Before W19 is marked COMPLETE, the full suite must pass:

```bash
npx vitest run tests/intel/     # W19 tests: 98/98 GREEN
npx vitest run                   # Full suite: 3195+/3195+ GREEN (no regressions)
npx tsc --noEmit                 # TypeScript strict mode: 0 errors
```

If any pre-W19 test turns RED during W19 implementation, W19 cannot be completed until the regression is fixed.

---

## Test Data: Romanian Geography Reference Cases

| Test Scenario | Aircraft Position | Zone | Expected Outcome |
|--------------|-------------------|------|-----------------|
| LROP approach corridor breach | 44.590, 26.085 (2.1km from centre) | RO-LROP-EXCLUSION (5km) | INSIDE breach, score ~76, ORANGE |
| Cernavodă nuclear close approach | 44.330, 28.063 (0.4km from centre) | RO-CERNAVODA-NUCLEAR (10km) | INSIDE, score ~96, RED, CNCAN flag |
| Bucharest government district | 44.428, 26.103 (0.2km from centre) | RO-BUCHAREST-GOVT (2km) | INSIDE, score ~90, RED |
| Deveselu NATO base | 44.100, 24.139 (0.15km from centre) | RO-DEVESELU-NATO (5km) | INSIDE, score ~97, RED, NATO flag |
| LRCL far approach | 46.825, 23.690 (4.5km from centre) | RO-LRCL-CTR (5km) | ENTERING, ttBreachS calculated |
| Outside all zones | 45.000, 24.500 | All | No breach, all GREEN |
