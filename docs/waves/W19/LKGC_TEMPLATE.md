# APEX-SENTINEL W19 — LAST KNOWN GOOD CONFIGURATION TEMPLATE

## Theme: Romania/EU Threat Intelligence Layer

---

## Purpose

This document defines the Last Known Good Configuration (LKGC) for W19. When W19 is COMPLETE (all 98 tests GREEN, no regressions), the configuration values at that point are recorded here. Future changes are evaluated against this baseline.

---

## LKGC Snapshot (Recorded at W19 COMPLETE)

**Date**: [TO BE FILLED AT WAVE COMPLETE]
**Git commit**: [TO BE FILLED — run `git rev-parse HEAD`]
**Test count**: 98 / 98 GREEN (W19 tests) + [W1–W18 count] / [W1–W18 count] GREEN (full suite)

---

## Threat Scoring Parameters

These values are the LKGC for ThreatScoringEngine (FR-W19-03):

```typescript
export const LKGC_CATEGORY_MULTIPLIERS = {
  'cat-a-commercial': 0.4,
  'cat-b-modified':   0.7,
  'cat-c-surveillance': 0.9,
  'cat-d-unknown':    1.0,
} as const;

export const LKGC_ATMOSPHERIC_BONUS = 10;        // Points added when flyabilityScore > 70
export const LKGC_ATMOSPHERIC_THRESHOLD = 70;    // flyabilityScore threshold for bonus
export const LKGC_SECURITY_BONUS = 15;           // Points added when SecurityEvent within 10km
export const LKGC_SECURITY_RADIUS_M = 10000;     // Security event proximity radius (metres)
```

---

## AWNING Threshold Parameters

These values are the LKGC for EuAwningLevelAssigner (FR-W19-04):

```typescript
export const LKGC_AWNING_THRESHOLDS = {
  airport: {
    greenMax: 20,
    yellowMax: 50,
    orangeMax: 75,
    // >= 75 → RED
  },
  nuclear: {
    greenMax: 10,
    yellowMax: 30,
    orangeMax: 50,
    // >= 50 → RED
  },
  military: {
    greenMax: 15,
    yellowMax: 40,
    orangeMax: 65,
    // >= 65 → RED
  },
  government: {
    greenMax: 25,
    yellowMax: 55,
    orangeMax: 80,
    // >= 80 → RED
  },
} as const;
```

**Derivation notes** (from DECISION_LOG.md DL-W19-002):
- Nuclear thresholds are 60% of airport thresholds (consequence severity justification)
- Military thresholds are midpoint between nuclear and airport
- Government thresholds are most permissive (high legitimate traffic, lower adversarial consequence)

---

## GDPR Anonymisation Parameters

```typescript
export const LKGC_ANONYMISATION_TIMER_S = 30;       // Seconds before Cat-A anonymisation
export const LKGC_POSITION_RETENTION_H = 24;        // Hours max in-memory retention
export const LKGC_GRID_SNAP_PRECISION = 1000;        // floor(coord * 1000) / 1000 = 3dp
export const LKGC_CALLSIGN_PREFIX_LENGTH = 3;        // First N chars of callsign retained
```

---

## EasaCategoryClassifier Parameters

```typescript
export const LKGC_HEURISTIC_ALT_LOW_M = 150;         // Below this: suspect drone (m)
export const LKGC_HEURISTIC_VEL_LOW_MS = 30;         // Below this: suspect drone (m/s)
export const LKGC_HEURISTIC_DRONE_ALT_M = 500;       // Below this: possible small drone
export const LKGC_HEURISTIC_DRONE_VEL_MS = 15;       // Below this: possible small drone
export const LKGC_ML_CONFIDENCE_BOOST_THRESHOLD = 0.85;   // Acoustic confidence for boost
export const LKGC_ML_CATEGORY_UPGRADE_THRESHOLD = 0.7;    // Fusion confidence for upgrade
```

---

## Protected Zone Parameters

LKGC protected zones are the W18 ROMANIA_PROTECTED_ZONES constant. W19 does not add new zones.

Any changes to zone radii, locations, or thresholds after W19 COMPLETE must be:
1. Documented as a new DL-W19-NNN entry in DECISION_LOG.md
2. Reflected in updated LKGC values here
3. Tested with the W19 test suite before deployment

---

## ROMATSA Coordination Parameters

```typescript
export const LKGC_ROMATSA_AIRPORTS = ['LROP', 'LRCL', 'LRTR', 'LRSB', 'LRCK'] as const;
export const LKGC_ROMATSA_TRIGGER_LEVEL: AwningLevel = 'RED';
// Only RED events at LKGC_ROMATSA_AIRPORTS generate ROMATSA coordination messages
```

---

## AACR Notification Parameters

```typescript
export const LKGC_AACR_TRIGGER_LEVELS: AwningLevel[] = ['ORANGE', 'RED'];
// Both ORANGE and RED generate AACR notifications

export const LKGC_ACTION_MAPPING = {
  // score range → recommended action
  lt50: 'MONITOR',
  lt65: 'WARN',
  lt85: 'INTERCEPT',
  gte85: 'EMERGENCY',
} as const;
```

---

## Breach Detection Parameters

```typescript
export const EARTH_RADIUS_M = 6371000;          // Mean Earth radius in metres (haversine)
export const LKGC_ALERT_BUFFER_M = 500;         // Buffer beyond radiusM for ENTERING detection
// A zone with radiusM=5000 generates ENTERING breach at distanceM < 5500
```

---

## Known Regression Risks

If any of these tests turn RED after a parameter change, investigate before deploying:

| Test | Parameter Protected |
|------|--------------------|
| `airport zone: score 80 → RED` | AWNING_THRESHOLDS.airport.orangeMax |
| `nuclear zone: score 55 → RED` | AWNING_THRESHOLDS.nuclear.orangeMax |
| `cat-d-unknown multiplier = 1.0` | CATEGORY_MULTIPLIERS['cat-d-unknown'] |
| `Cat-D aircraft: status EXEMPT` | GDPR cat-d exemption logic |
| `identical inputs → identical score` | Score determinism |
| `processes 50×8 zones < 500ms` | Pipeline latency (performance gate) |

---

## Threshold Change Protocol

If AWNING thresholds need tuning post-deployment:

1. Open a DECISION_LOG.md entry (DL-W19-009 or higher)
2. Document the calibration data that justifies the change
3. Update LKGC values in this file
4. Update the constants in `src/intel/constants.ts`
5. Verify all 98 W19 tests still GREEN (threshold tests are parameterised against constants)
6. Get Nico sign-off before deploying to production nodes
7. Telegram notification to @RealAPEXClaw_bot with: old thresholds, new thresholds, rationale

**NEVER change thresholds without a DECISION_LOG entry.**
