# APEX-SENTINEL W18 — AI PIPELINE

## How ML/AI Components (W5–W8) Integrate with Real EU Data

---

## Overview

W18 does not introduce new ML models. It provides real operational data to the existing AI/ML pipeline built in W5–W8. The integration is unidirectional: W18 feeds produce enriched context objects that flow into the existing ThreatContextEnricher (W9), which annotates every detection event before it reaches the ML fusion layer.

The AI pipeline that was trained and tested against simulated Ukrainian conflict data in W1–W17 is now retargeted to civilian EU airspace threat classification with:
1. Real ADS-B cooperative track context (vs simulation)
2. Real atmospheric conditions for acoustic range correction (vs static hardcoded values)
3. Real NOTAM/UAS zone context for false positive suppression (vs no context)
4. Real OSINT security event correlation for threat posture adjustment (vs Ukraine-centric GDELT queries)

---

## W5–W8 AI/ML Component Inventory

| Wave | Component | Purpose | W18 Data Input |
|------|-----------|---------|----------------|
| W5 | RF Signature Classifier | Classifies RF emissions by drone manufacturer | DroneFlightConditions.acousticRangeFactor |
| W6 | RF Fingerprint Database | Known DJI/Autel/custom OcuSync/WiFi/BLE patterns | No change (existing DB) |
| W7 | Fusion Engine | Merges acoustic + RF confidence scores | AircraftState (cooperative context) |
| W8 | Threat Probability Engine | Outputs P(threat | evidence) | SecurityEvent proximity, NOTAM context |

---

## Enrichment Flow: How W18 Data Enters the AI Pipeline

```
Acoustic Detection (W3/W4 YAMNet)
  │
  ▼
ThreatContextEnricher (W9 FR-W9-05)
  │
  ├── feed.eu.aircraft subscription ──────── AircraftState[]
  │   "Is this acoustic contact a                (from AircraftPositionAggregator W18-02)
  │    known cooperative ADS-B aircraft?"
  │
  ├── feed.eu.notam.active subscription ─── NotamRestriction[]
  │   "Is this position inside a                  (from NotamIngestor W18-03)
  │    NOTAM-restricted zone?"
  │
  ├── feed.eu.uas_zones subscription ─────── UasZone[]
  │   "Is this a U-space PROHIBITED zone?         (from EasaUasZoneLoader W18-04)
  │    Detection here is higher priority."
  │
  ├── feed.eu.protected_zones subscription ─ ProtectedZone[]
  │   "Is this within a critical                  (from CriticalInfrastructureLoader W18-05)
  │    infrastructure exclusion zone?"
  │
  ├── feed.eu.atmosphere subscription ─────── DroneFlightConditions
  │   "What is the acoustic range factor?         (from AtmosphericConditionProvider W18-06)
  │    Adjust confidence thresholds."
  │
  └── feed.eu.security_events subscription ─ SecurityEvent[]
      "Is there elevated OSINT activity           (from SecurityEventCorrelator W18-07)
       near this detection zone?"
         │
         ▼
  EnrichedDetectionEvent {
    ...baseDetection,
    cooperativeAircraftNearby: AircraftState[],    // ADS-B tracks within 500m
    inNotamZone: boolean,
    notamRestrictionIds: string[],
    inUasProhibitedZone: boolean,
    inCriticalInfraZone: boolean,
    protectedZoneId: string | null,
    atmosphericRangeFactor: number,
    osintThreatLevel: 'LOW' | 'MEDIUM' | 'HIGH',
    securityEventCount24h: number,
  }
         │
         ▼
  FusionEngine (W7) — receives EnrichedDetectionEvent
         │
         ▼
  ThreatProbabilityEngine (W8) — outputs P(threat | enriched_evidence)
```

---

## Acoustic Range Factor Integration (W6 ↔ W18-06)

The W6 RF Signature Classifier uses `atmosphericRangeFactor` to adjust confidence thresholds. Previously this was hardcoded to 1.0. With W18:

```typescript
// Before W18 (W9 open-meteo was wrong coords):
const rangeFactor = 1.0; // static

// After W18 (AtmosphericConditionProvider, Bucharest coords):
const conditions = await atmosphericProvider.getConditions();
const rangeFactor = conditions.acousticRangeFactor;
// e.g. 0.82 when wind > 8 m/s from NE (reduces effective acoustic range by 18%)
```

**Range Factor Algorithm:**

```
acousticRangeFactor = 1.0

if windSpeed > 12 m/s:
  acousticRangeFactor *= 0.60   // severe reduction
elif windSpeed > 8 m/s:
  acousticRangeFactor *= 0.75   // significant reduction
elif windSpeed > 5 m/s:
  acousticRangeFactor *= 0.85   // moderate reduction

if precipitation > 2 mm/h:
  acousticRangeFactor *= 0.70   // rain masks acoustic signature
elif precipitation > 0 mm/h:
  acousticRangeFactor *= 0.90

if visibility < 1000 m:
  // fog = unusual atmospheric layering, can increase or decrease range
  acousticRangeFactor *= 1.05   // slight improvement due to temperature inversion

clamp(acousticRangeFactor, 0.40, 1.20)
```

The fusion engine uses this to scale the minimum acoustic confidence required before promoting a detection to AWNING:
```
adjustedConfidenceThreshold = BASE_THRESHOLD / acousticRangeFactor
// If range is reduced, we require higher raw confidence before acting
```

---

## Cooperative Contact Suppression (W7 ↔ W18-02)

A key false positive source in the original W1–W17 pipeline: aircraft flying normally within Romanian airspace trigger acoustic detections. With W18's AircraftPositionAggregator:

```typescript
// FusionEngine cooperative contact check (W7, modified via config)
function isFalsePositiveCandidate(
  detection: AcousticDetection,
  cooperativeAircraft: AircraftState[]
): boolean {
  const nearby = cooperativeAircraft.filter(ac => {
    const distM = haversineDistanceM(detection.lat, detection.lon, ac.lat, ac.lon);
    const altDeltaM = Math.abs(detection.estimatedAltM - ac.altBaro);
    return distM < 500 && altDeltaM < 200 && !ac.onGround;
  });

  // If a cooperative aircraft with valid ADS-B is within 500m laterally
  // and 200m vertically, the acoustic detection is likely that aircraft
  if (nearby.length > 0 && nearby.every(ac => ac.cooperativeContact)) {
    return true; // Likely false positive
  }

  // If aircraft is Cat-D (no transponder) nearby — still a threat
  return false;
}
```

Expected false positive reduction: 40–60% for detections in high-density airspace corridors (Bucharest approach paths, 44.3–44.7°N / 25.8–26.4°E).

---

## NOTAM-Aware Threat Scoring (W8 ↔ W18-03)

The ThreatProbabilityEngine (W8) threat score formula gains two new terms from W18:

```
P(threat) = sigmoid(
  w1 * acousticConfidence
  + w2 * rfConfidence
  + w3 * fusionScore
  + w4 * inNotamProhibitedZone     // NEW W18: +0.3 if in R/P NOTAM
  + w5 * inCriticalInfraZone       // NEW W18: +0.4 if in exclusion zone
  + w6 * osintThreatLevel          // NEW W18: +0.1/+0.2 MEDIUM/HIGH
  - w7 * cooperativeContactNearby  // NEW W18: -0.35 if ADS-B match
)

Weights (initial, to be tuned in W19 with real data):
w1=0.40, w2=0.30, w3=0.15, w4=0.30, w5=0.40, w6=0.15, w7=0.35
```

This scoring change is configuration-based. The W8 ThreatProbabilityEngine accepts a `contextWeights` configuration object. W18 provides the context values; W8 is the scorer.

---

## EASA UAS Category Classification Heuristic

W18's AircraftPositionAggregator applies a heuristic threat category classification for contacts. This is not a trained ML model — it is a rule-based classifier that feeds the ML pipeline's prior:

```typescript
function classifyUasThreatCategory(aircraft: Partial<AircraftState>): UasThreatCategory | null {
  // Cat-D: No transponder / No ICAO24
  if (!aircraft.icao24 || aircraft.icao24 === '000000') {
    return 'Cat-D';
  }

  // Cat-D: ICAO24 in known-spoofed/unknown range
  if (aircraft.icao24.startsWith('000') || aircraft.icao24.startsWith('fff')) {
    return 'Cat-D';
  }

  // Cat-A: Low altitude (<120m AGL), low speed (<20 m/s), known consumer drone altitude profile
  if (aircraft.altBaro !== null && aircraft.altBaro < 120 &&
      aircraft.velocityMs !== null && aircraft.velocityMs < 20 &&
      !aircraft.cooperativeContact) {
    return 'Cat-A';
  }

  // Cat-B: Medium altitude, unusual flight path (no callsign, no squawk)
  if (!aircraft.callsign && !aircraft.squawk &&
      aircraft.altBaro !== null && aircraft.altBaro < 500) {
    return 'Cat-B';
  }

  // Cat-C: Fixed-wing profile at medium altitude without cooperative contact
  if (aircraft.category && ['A1', 'A2'].includes(aircraft.category) &&
      aircraft.velocityMs !== null && aircraft.velocityMs > 30) {
    return 'Cat-C';
  }

  return null; // Cannot classify — manned cooperative aircraft
}
```

This heuristic is applied in AircraftPositionAggregator before emitting `AircraftState`. The W8 fusion engine can override this with higher confidence from RF/acoustic evidence.

---

## GDELT Threat Posture Adjustment

SecurityEventCorrelator produces an `osintThreatLevel` that adjusts the AI pipeline's prior threat probability:

```
osintThreatLevel calculation (last 24h, within 100km of detection):
  acledEventCount × goldsteinWeight + firmsAnomalyCount × 0.5 + gdeltSurgeScore

  if composite > 8.0 → 'HIGH'    (AWNING threat adjustment: +0.20)
  if composite > 4.0 → 'MEDIUM'  (AWNING threat adjustment: +0.10)
  else → 'LOW'                   (no adjustment)
```

This mirrors the W9 GdeltFeedProducer surge detection pattern but reconfigured for Romania instead of Ukraine keywords.

---

## W18 AI Pipeline Validation

The existing AI testing layer (W_AI_TESTING_LAYER, 327 tests in `infra/__tests__/`) covers:
- `metamorphic.test.cjs`: metamorphic relations for detection confidence
- `data-drift.test.cjs`: KL divergence / Wasserstein-1 drift detection (W18 feed data will be new input distribution)
- `adversarial-robustness.test.cjs`: prompt injection, data poisoning resistance

W18 does not add new AI test files. However, the data-drift tests should be re-baselined after W18 goes live, as the input distribution shifts from simulation to real ADS-B data. This is documented as a W19 task in ROADMAP.md.

**Key risk**: The W8 ThreatProbabilityEngine weights (w1–w7 above) were calibrated against simulated detections. Real data from W18 will likely require weight retuning via the W19 feedback loop. Initial deployment uses conservative weights (cooperative contact suppression w7=0.35 rather than 0.50) to avoid false negatives.
