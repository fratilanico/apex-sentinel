# APEX-SENTINEL W19 — AI PIPELINE

## Theme: Romania/EU Threat Intelligence Layer — ML Integration

---

## Overview

W19 is primarily a rule-based threat intelligence layer, not an ML inference layer. However, W19 integrates tightly with the W3–W8 ML engines in specific scenarios — particularly for non-cooperative (Cat-D) aircraft that have no ADS-B transponder. This document describes how each ML engine contributes to W19's threat assessment.

---

## ML Engine Inventory (W3–W8)

| Wave | Engine | Output | W19 Integration Point |
|------|--------|--------|-----------------------|
| W3 | YAMNet Acoustic Classifier | acousticDroneConfidence: 0–1 | EasaCategoryClassifier refinement |
| W4 | Acoustic Model Refinement | Refined drone confidence + species classification | EasaCategoryClassifier refinement |
| W5 | RF Signature Classifier | rfFingerprintMatch: bool, matched drone model | EasaCategoryClassifier + ThreatScoringEngine |
| W6 | RF Fingerprint Database | Known drone RF signatures | Lookup table for W5 matches |
| W7 | Multi-Modal Fusion Engine | fusionThreatProbability: 0–1 | ThreatScoringEngine bonus input (future) |
| W8 | Threat Probability Engine | ThreatProbability { level, confidence } | EuAwningLevelAssigner advisory input |

---

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  NATS: sentinel.detection.*  (W3-W8 outputs)                     │
│                                                                  │
│  sentinel.detection.acoustic   ← W3/W4 YAMNet results           │
│  sentinel.detection.rf         ← W5/W6 RF fingerprint results   │
│  sentinel.detection.fusion     ← W7 multi-modal fusion          │
│  sentinel.detection.probability ← W8 threat probability         │
└──────────────────────────────────┬──────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  MlSignalCollector (W19 internal, runs in parallel with W18)     │
│                                                                  │
│  - Subscribes to all sentinel.detection.* subjects              │
│  - Collects signals by node position (lat/lon grid cell)        │
│  - Correlates acoustic/RF signals to AircraftState by           │
│    proximity: detection node location + bearing → estimated      │
│    aircraft position → match to W18 AircraftState within 200m   │
│  - Assembles MlSignalBundle per aircraft ICAO24                  │
│  - Provides MlSignalBundle[] to EasaCategoryClassifier           │
└──────────────────────────────────┬──────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  EasaCategoryClassifier (FR-W19-01)                              │
│                                                                  │
│  ML signal integration:                                          │
│  if mlSignals.acousticDroneConfidence >= 0.8 AND                │
│     aircraft.cooperativeContact == false:                        │
│    → cat-d-unknown (confidence boosted to 0.95 from 0.75)       │
│                                                                  │
│  if mlSignals.rfFingerprintMatch == true:                        │
│    → cat-d-unknown with specific model ID                        │
│    → confidence = rfFingerprintConfidence (from W5/W6)          │
│                                                                  │
│  if mlSignals.fusionThreatProbability >= 0.7 AND                │
│     existing category is ambiguous (confidence < 0.6):          │
│    → upgrade to cat-c-surveillance (surveillance pattern match)  │
│    → confidence = 0.65                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## W3/W4 YAMNet Acoustic Integration

### What YAMNet Provides

YAMNet (Yet Another Mobile NET) is a deep neural network from Google's AudioSet project, fine-tuned in W3/W4 for drone acoustic signature detection. It produces:
- `acousticDroneConfidence`: probability 0–1 that the detected sound is a UAS motor signature
- `acousticModelVersion`: e.g. `yamnet-apex-v2.3` (W4 fine-tuned model tag)

### How W19 Uses It

**Scenario: Non-cooperative drone detected acoustically but not on ADS-B**

1. W3/W4 node at Otopeni monitoring station detects drone signature: `acousticDroneConfidence = 0.87`
2. Node publishes to `sentinel.detection.acoustic` with detection coordinates (node location + estimated bearing)
3. W19 `MlSignalCollector` correlates this to an area near LROP with no ADS-B contact
4. `EasaCategoryClassifier` creates a synthetic `AircraftState` with `cooperativeContact=false`
5. `acousticDroneConfidence=0.87` → category assigned `cat-d-unknown` with `confidence=0.95`
6. This triggers full pipeline: breach detection, threat scoring, AWNING assignment
7. If breach is confirmed: AACR notification generated with `classificationBasis: 'ml-signal-informed'`

**Confidence calibration (W4 fine-tuned model on Romanian urban acoustic environment):**

| YAMNet Confidence | W19 Action | Rationale |
|-------------------|------------|-----------|
| < 0.5 | Ignore for W19 | Below threshold; likely background noise |
| 0.5–0.7 | Log only; no category upgrade | Uncertain; requires corroboration |
| 0.7–0.85 | Upgrade non-cooperative to cat-d-unknown (confidence=0.80) | Probable drone signal |
| ≥ 0.85 | Upgrade to cat-d-unknown (confidence=0.95) | High-confidence drone signal |

---

## W5/W6 RF Fingerprint Integration

### What W5/W6 Provides

The RF Signature Classifier (W5) with the RF Fingerprint Database (W6) detects and identifies specific drone models from their radio control and telemetry emissions:
- `rfFingerprintMatch`: boolean — match found in database
- `rfMatchedModel`: e.g. `DJI Phantom 4`, `Autel EVO II`, `custom 5.8GHz FPV`
- `rfFingerprintConfidence`: 0–1 confidence of the match

### How W19 Uses It

**Scenario: Commercial FPV drone detected on RF but not ADS-B**

1. W5 detects 5.8GHz FPV control link near Cernavodă nuclear plant
2. `rfFingerprintMatch=true`, `rfMatchedModel='custom 5.8GHz FPV'`, `confidence=0.91`
3. No corresponding ADS-B contact in W18 position aggregator
4. W19 creates synthetic AircraftState at estimated RF source location
5. Category: `cat-d-unknown` (custom FPV = likely unregistered, uncooperative)
6. Zone breach detection fires for Cernavodă (10km exclusion zone)
7. Nuclear zone AWNING thresholds applied: likely ORANGE/RED at close range
8. AacrNotification includes `cncanEscalationRequired=true`

**Known drone model → threat category mapping (W6 database):**

| Matched Model | Default Threat Category | Rationale |
|---------------|------------------------|-----------|
| DJI Phantom 4, Mini 3, Air 3 | cat-a-commercial | Consumer registered drone, EU Open category |
| DJI FPV, Autel EVO II | cat-b-modified | Higher performance, non-standard profile |
| Custom FPV, unknown frequency | cat-d-unknown | No registration, possible adversarial use |
| Any model near military zone | cat-c-surveillance (minimum) | Sentinel precautionary upgrade |

---

## W7 Multi-Modal Fusion Integration

### What W7 Provides

The Multi-Modal Fusion Engine (W7) combines acoustic and RF signals into a single fused detection with `fusionThreatProbability: 0–1`. When both acoustic AND RF confirm a drone presence, fusion probability is significantly higher than either signal alone.

### How W19 Uses It

W7 fusion probability provides a **secondary validation layer** for Category classification:

```
if (mlSignals.fusionThreatProbability >= 0.85) {
  // High-confidence fusion detection — both acoustic AND RF confirm drone
  // Boost classification confidence regardless of original basis
  categoryResult.confidence = Math.max(categoryResult.confidence, 0.90);
  categoryResult.classificationBasis = 'ml-signal-informed';
}
```

This prevents false positives: a weak acoustic signal alone might not trigger action, but acoustic + RF confirmation with fusion probability 0.85+ warrants escalation.

---

## W8 Threat Probability Integration

### What W8 Provides

The Threat Probability Engine (W8) produces a structured `ThreatProbability` with level classification (LOW/MEDIUM/HIGH/CRITICAL) and confidence. This is the highest-level ML output from the W3–W8 stack.

### How W19 Uses It

W8 output provides an **advisory check** on W19's rule-based scoring:

```typescript
// In ThreatScoringEngine, after rule-based score computation:
if (mlSignals?.w8ThreatProbability) {
  const mlLevel = mlSignals.w8ThreatProbability;
  const mlScore = { LOW: 10, MEDIUM: 40, HIGH: 70, CRITICAL: 90 }[mlLevel];

  if (Math.abs(finalScore - mlScore) > 30) {
    // Significant divergence between rule-based and ML assessment
    // Log discrepancy for operator review; do NOT override rule-based score
    // W19 rule-based score is the authoritative value for AWNING decisions
    logDiscrepancy({ ruleBasedScore: finalScore, mlScore, divergence: Math.abs(finalScore - mlScore) });
  }
}
```

**W19 never overrides rule-based scores with ML scores.** ML signals are informational. AWNING decisions and regulatory notifications are always based on deterministic rule-based scoring for auditability (GDPR Art.22 compliance).

---

## ML Signal Flow Diagram

```
Acoustic sensor nodes (W3/W4)        RF sensor nodes (W5/W6)
         │                                    │
         │  sentinel.detection.acoustic        │  sentinel.detection.rf
         └──────────────────┬─────────────────┘
                            │
                            ▼
                  MlSignalCollector (W19)
                  Assembles MlSignalBundle per ICAO24
                            │
                            ▼
             EasaCategoryClassifier (FR-W19-01)
             Uses ML signals to refine category
             and boost/reduce confidence
                            │
                            ▼
          ProtectedZoneBreachDetector (FR-W19-02)
          [no ML dependency — pure geometry]
                            │
                            ▼
             ThreatScoringEngine (FR-W19-03)
             ML divergence check (advisory only)
             Rule-based score remains authoritative
                            │
                            ▼
            EuAwningLevelAssigner (FR-W19-04)
            [no ML dependency — pure threshold lookup]
```

---

## Privacy Implications of ML Integration

When ML signals are used to classify or locate an aircraft, additional privacy considerations apply:

1. **Acoustic triangulation**: Bearing estimates from multiple acoustic nodes can localise a non-cooperative drone to within ~50m. This position is not associated with a registered person (drones are not individually biometrically linked), but could constitute location data for the operator if in a small area.

2. **RF fingerprinting**: Matching a specific drone model via RF fingerprint does not identify the operator. However, combined with known operator registration data (EASA D-Flight registry for EU Open category), it could narrow operator identity.

3. **W19 rule**: ML-derived positions are treated identically to ADS-B positions for anonymisation purposes. Grid-snapping (100m) is applied to all log entries. Cat-D ML-detected aircraft are exempt from anonymisation (Art.6(1)(e)) but log positions are still grid-snapped.

4. **No ML model training on live data**: W19 uses pre-trained W3–W8 models only. Live flight data from W18/W19 is never fed back into model training without a separate DPIA and consent mechanism.

---

## Model Performance Constraints in W19 Context

| Model | Latency Requirement | W19 Impact if Exceeded |
|-------|--------------------|-----------------------|
| YAMNet inference (W3) | < 200ms (W16 SLA) | Classification uses ADS-B-only path |
| RF fingerprint match (W5) | < 100ms | No RF-informed confidence boost |
| Multi-modal fusion (W7) | < 500ms | No fusion probability advisory |
| W8 threat probability | < 1s | No ML divergence check |

All ML latency gates are enforced by the W16 EdgePerformanceProfiler. If any gate is exceeded, W19 falls back to ADS-B-only classification with `classificationBasis: 'ads-b-emitter-category'` or `'heuristic-velocity'`. The pipeline never stalls waiting for ML signals.
