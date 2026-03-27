# APEX-SENTINEL W19 — ARCHITECTURE

## Theme: Romania/EU Threat Intelligence Layer

---

## System Architecture Layers

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  APEX-SENTINEL FULL STACK — W19 POSITION                                    ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  W20+  ┌──────────────────────────────────────────────────────────────────┐ ║
║        │  OPERATOR WORKFLOW LAYER (future)                                │ ║
║        │  Dashboard display / AACR dispatch / ROMATSA API / Audit log     │ ║
║        └──────────────────────────────────────────────────────────────────┘ ║
║                                    ▲                                         ║
║                    ThreatIntelPicture (W19 output contract)                  ║
║                                    │                                         ║
║  W19   ┌──────────────────────────────────────────────────────────────────┐ ║
║        │  THREAT INTELLIGENCE LAYER  ←── THIS WAVE                       │ ║
║        │                                                                  │ ║
║        │  EasaCategoryClassifier      ProtectedZoneBreachDetector         │ ║
║        │  ThreatScoringEngine         EuAwningLevelAssigner               │ ║
║        │  GdprTrackAnonymiser         AacrNotificationFormatter           │ ║
║        │  RomatsaCoordinationInterface                                    │ ║
║        │  W19ThreatIntelPipeline (orchestrator)                           │ ║
║        └──────────────────────────────────────────────────────────────────┘ ║
║                                    ▲                                         ║
║                    EuSituationalPicture (W18 output contract)                ║
║                                    │                                         ║
║  W18   ┌──────────────────────────────────────────────────────────────────┐ ║
║        │  EU DATA INTEGRATION LAYER                                       │ ║
║        │                                                                  │ ║
║        │  EuDataFeedRegistry          AircraftPositionAggregator          │ ║
║        │  NotamIngestor               EasaUasZoneLoader                   │ ║
║        │  CriticalInfrastructureLoader AtmosphericConditionProvider       │ ║
║        │  SecurityEventCorrelator     EuDataIntegrationPipeline           │ ║
║        └──────────────────────────────────────────────────────────────────┘ ║
║                                    ▲                                         ║
║                    Typed feed events (OpenSky, EAD, drone.rules.eu)          ║
║                                    │                                         ║
║  W9    ┌──────────────────────────────────────────────────────────────────┐ ║
║        │  LIVE DATA FEED INTEGRATION (DataFeedBroker, NATS)               │ ║
║        └──────────────────────────────────────────────────────────────────┘ ║
║                                    ▲                                         ║
║                                    │                                         ║
║  W3-W8 ┌──────────────────────────────────────────────────────────────────┐ ║
║        │  ML DETECTION ENGINES                                            │ ║
║        │  YAMNet acoustic (W3/W4)  RF fingerprint (W5/W6)                 │ ║
║        │  Multi-modal fusion (W7)   Threat probability (W8)               │ ║
║        └──────────────────────────────────────────────────────────────────┘ ║
║                                    ▲                                         ║
║                                    │                                         ║
║  W1-W2 ┌──────────────────────────────────────────────────────────────────┐ ║
║        │  NODE REGISTRATION + DETECTION PIPELINE CORE                     │ ║
║        └──────────────────────────────────────────────────────────────────┘ ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## W19 Internal Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    W19ThreatIntelPipeline (FR-W19-08)                        │
│                                                                             │
│  Input: EuSituationalPicture                                                │
│  {                                                                          │
│    aircraft: AircraftState[]         ← W18-02 AircraftPositionAggregator    │
│    notams: NotamRestriction[]        ← W18-03 NotamIngestor                 │
│    uasZones: EasaUasZone[]          ← W18-04 EasaUasZoneLoader              │
│    protectedZones: ProtectedZone[]  ← W18-05 CriticalInfrastructureLoader   │
│    atmospheric: AtmosphericConditions ← W18-06 AtmosphericConditionProvider │
│    securityEvents: SecurityEvent[]  ← W18-07 SecurityEventCorrelator        │
│    feedHealth: FeedHealth[]         ← W18-01 EuDataFeedRegistry             │
│    mlSignals?: MlSignalBundle[]     ← W3-W8 detection hits (optional)       │
│  }                                                                          │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  STEP 1: EasaCategoryClassifier (FR-W19-01)                          │  │
│  │                                                                      │  │
│  │  for each aircraft in picture.aircraft:                              │  │
│  │    category = classifyFromAdsb(aircraft.category, aircraft.squawk,   │  │
│  │                                aircraft.cooperativeContact,          │  │
│  │                                aircraft.velocityMs, aircraft.altBaro)│  │
│  │    if mlSignals present → refine category using W5-W8 confidence     │  │
│  │    → emit CategoryResult { aircraftId, category, confidence }        │  │
│  └──────────────────────────┬───────────────────────────────────────────┘  │
│                             │ CategoryResult[]                              │
│  ┌──────────────────────────▼───────────────────────────────────────────┐  │
│  │  STEP 2: ProtectedZoneBreachDetector (FR-W19-02)                     │  │
│  │                                                                      │  │
│  │  for each aircraft × zone (O(n×m)):                                  │  │
│  │    d = haversine(aircraft.lat, aircraft.lon, zone.centreLat,         │  │
│  │                  zone.centreLon)                                     │  │
│  │    if d < zone.radiusM → breach detected                             │  │
│  │    breachType = ENTERING | INSIDE | EXITING (velocity-based)         │  │
│  │    ttBreachS = d / aircraft.velocityMs (if approaching)              │  │
│  │    → emit ZoneBreach { aircraftId, zoneId, distanceM, breachType,   │  │
│  │                        ttBreachS }                                   │  │
│  └──────────────────────────┬───────────────────────────────────────────┘  │
│                             │ ZoneBreach[]                                  │
│  ┌──────────────────────────▼───────────────────────────────────────────┐  │
│  │  STEP 3: ThreatScoringEngine (FR-W19-03)                             │  │
│  │                                                                      │  │
│  │  for each breach:                                                    │  │
│  │    proximityScore = clamp(100 * (1 - breach.distanceM /              │  │
│  │                           zone.radiusM), 0, 100)                    │  │
│  │    categoryMult = { cat-a: 0.4, cat-b: 0.7, cat-c: 0.9, cat-d: 1.0}│  │
│  │    atmosphericBonus = atmospheric.flyability > 70 ? 10 : 0           │  │
│  │    securityBonus = hasActiveEventWithin10km(breach, events) ? 15 : 0 │  │
│  │    score = clamp(proximityScore * mult + atm + sec, 0, 100)         │  │
│  │    → emit ThreatScore { breachId, value, factors,                   │  │
│  │                         awningRecommendation }                       │  │
│  └──────────────────────────┬───────────────────────────────────────────┘  │
│                             │ ThreatScore[]                                 │
│  ┌──────────────────────────▼───────────────────────────────────────────┐  │
│  │  STEP 4: EuAwningLevelAssigner (FR-W19-04)                           │  │
│  │                                                                      │  │
│  │  for each zone with breaches:                                        │  │
│  │    maxScore = max(scores for zone)                                   │  │
│  │    thresholds = ZONE_TYPE_THRESHOLDS[zone.category]                  │  │
│  │    level = threshold lookup (airport / nuclear / military / govt)    │  │
│  │    if level changed → emit 'awning_change' NATS event                │  │
│  │    → update W10 AwningLevelPublisher via NATS                        │  │
│  └──────────────────────────┬───────────────────────────────────────────┘  │
│                             │ Map<zoneId, AwningLevel>                      │
│  ┌──────────────────────────▼───────────────────────────────────────────┐  │
│  │  STEP 5: GdprTrackAnonymiser (FR-W19-05) — parallel to steps 6-7    │  │
│  │                                                                      │  │
│  │  for each aircraft:                                                  │  │
│  │    if category == cat-d: skip (Art.6(1)(e) exception)               │  │
│  │    if trackAge > 30s AND category == cat-a:                          │  │
│  │      pseudoId = HMAC-SHA256(icao24, DEPLOY_SECRET)[:16]              │  │
│  │      gridLat = floor(lat * 1000) / 1000                             │  │
│  │      gridLon = floor(lon * 1000) / 1000                             │  │
│  │      callsignPrefix = callsign?.slice(0, 3) ?? 'UNK'                │  │
│  │    → emit AnonymisedTrack                                            │  │
│  └──────────────────────────┬───────────────────────────────────────────┘  │
│                             │ AnonymisedTrack[]                             │
│  ┌──────────────────────────▼───────────────────────────────────────────┐  │
│  │  STEP 6: AacrNotificationFormatter (FR-W19-06)                       │  │
│  │                                                                      │  │
│  │  for each ORANGE/RED breach:                                         │  │
│  │    incidentId = 'AACR-' + year + '-' + seq.toString().padStart(6,0) │  │
│  │    location = zone.icaoDesignator ?? formatLatLon(zone)              │  │
│  │    action = scoreToAction(score)                                     │  │
│  │    → emit AacrNotification (all 7 SIRA fields)                       │  │
│  │    → emit 'aacr_notification' NATS event                             │  │
│  └──────────────────────────┬───────────────────────────────────────────┘  │
│                             │ AacrNotification[]                            │
│  ┌──────────────────────────▼───────────────────────────────────────────┐  │
│  │  STEP 7: RomatsaCoordinationInterface (FR-W19-07)                    │  │
│  │                                                                      │  │
│  │  for each RED breach near LROP/LRCL/LRTR:                           │  │
│  │    check active NOTAMs → if covered, downgrade action                │  │
│  │    format ICAO Doc 4444 coordination message                         │  │
│  │    include SELCAL-style ID, FIR, aircraft particulars               │  │
│  │    → emit RomatsaCoordinationMessage                                 │  │
│  │    → emit 'romatsa_coordination' NATS event                          │  │
│  └──────────────────────────┬───────────────────────────────────────────┘  │
│                             │                                              │
│  ┌──────────────────────────▼───────────────────────────────────────────┐  │
│  │  PIPELINE OUTPUT: ThreatIntelPicture                                 │  │
│  │                                                                      │  │
│  │  {                                                                   │  │
│  │    timestamp: string,                                                │  │
│  │    breaches: ZoneBreach[],                                           │  │
│  │    scores: ThreatScore[],                                            │  │
│  │    awningLevels: Map<string, AwningLevel>,                           │  │
│  │    notifications: AacrNotification[],                                │  │
│  │    coordinationMessages: RomatsaCoordinationMessage[],               │  │
│  │    anonymisedTracks: AnonymisedTrack[],                              │  │
│  │    pipelineLatencyMs: number,                                        │  │
│  │    feedHealthSnapshot: FeedHealth[]                                  │  │
│  │  }                                                                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## NATS Event Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  NATS Subjects — W19 Producers                                   │
│                                                                  │
│  sentinel.intel.breach_detected         ← FR-W19-02             │
│  sentinel.intel.awning_change           ← FR-W19-04             │
│  sentinel.intel.aacr_notification       ← FR-W19-06             │
│  sentinel.intel.romatsa_coordination    ← FR-W19-07             │
│  sentinel.intel.picture_update          ← FR-W19-08             │
│                                                                  │
│  NATS Subjects — W19 Consumers                                   │
│                                                                  │
│  sentinel.feeds.eu_picture              ← W18 pipeline output   │
│  sentinel.awning.*                      ← W10 AWNING state      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  NATS Consumers — W20 Operator Workflow (future)                 │
│                                                                  │
│  sentinel.intel.breach_detected    → breach map overlay update  │
│  sentinel.intel.awning_change      → zone colour update on UI   │
│  sentinel.intel.aacr_notification  → AACR dispatch queue        │
│  sentinel.intel.romatsa_coordination → ROMATSA secure channel   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: W18 → W19 → W20

```
W18 EuDataIntegrationPipeline
  │
  │  EuSituationalPicture (every 10s)
  ▼
W19 W19ThreatIntelPipeline
  │
  ├─► Step 1: EasaCategoryClassifier
  │     Input:  AircraftState (category, squawk, velocityMs, altBaro)
  │     Output: CategoryResult[] (category, confidence)
  │
  ├─► Step 2: ProtectedZoneBreachDetector
  │     Input:  AircraftState[] × ProtectedZone[]
  │     Output: ZoneBreach[] (distanceM, breachType, ttBreachS)
  │
  ├─► Step 3: ThreatScoringEngine
  │     Input:  ZoneBreach[] + CategoryResult[] + AtmosphericConditions + SecurityEvent[]
  │     Output: ThreatScore[] (value 0-100, factors, awningRecommendation)
  │
  ├─► Step 4: EuAwningLevelAssigner
  │     Input:  ThreatScore[] + ProtectedZone (category)
  │     Output: Map<zoneId, AwningLevel>
  │     Side:   NATS publish sentinel.intel.awning_change (if changed)
  │
  ├─► Step 5: GdprTrackAnonymiser (parallel)
  │     Input:  AircraftState[] + CategoryResult[]
  │     Output: AnonymisedTrack[]
  │
  ├─► Step 6: AacrNotificationFormatter (on ORANGE/RED)
  │     Input:  ZoneBreach + ThreatScore + AwningLevel
  │     Output: AacrNotification[]
  │     Side:   NATS publish sentinel.intel.aacr_notification
  │
  ├─► Step 7: RomatsaCoordinationInterface (on RED near airport)
  │     Input:  AwningLevel + NotamRestriction[] + ZoneBreach[]
  │     Output: RomatsaCoordinationMessage[]
  │     Side:   NATS publish sentinel.intel.romatsa_coordination
  │
  └─► Assemble ThreatIntelPicture
        NATS publish: sentinel.intel.picture_update
        │
        ▼
W20 Operator Workflow Layer (future)
  ├─ Dashboard: AWNING zone overlay, breach event log
  ├─ AACR dispatch: send AacrNotification via SIRA API
  ├─ ROMATSA dispatch: send coordination message via secure VPN
  └─ Audit log: persist ThreatIntelPicture to Supabase
```

---

## File Structure

```
src/
└── intel/
    ├── easa-category-classifier.ts          # FR-W19-01
    ├── protected-zone-breach-detector.ts    # FR-W19-02
    ├── threat-scoring-engine.ts             # FR-W19-03
    ├── eu-awning-level-assigner.ts          # FR-W19-04
    ├── gdpr-track-anonymiser.ts             # FR-W19-05
    ├── aacr-notification-formatter.ts       # FR-W19-06
    ├── romatsa-coordination-interface.ts    # FR-W19-07
    └── w19-threat-intel-pipeline.ts         # FR-W19-08

tests/
└── intel/
    ├── easa-category-classifier.test.ts
    ├── protected-zone-breach-detector.test.ts
    ├── threat-scoring-engine.test.ts
    ├── eu-awning-level-assigner.test.ts
    ├── gdpr-track-anonymiser.test.ts
    ├── aacr-notification-formatter.test.ts
    ├── romatsa-coordination-interface.test.ts
    └── w19-threat-intel-pipeline.test.ts
```

---

## Computational Complexity

| Component | Complexity | Constraint |
|-----------|------------|------------|
| EasaCategoryClassifier | O(n) where n = aircraft count | Bounded: OpenSky returns ≤ 500 aircraft in Romania bbox |
| ProtectedZoneBreachDetector | O(n×m) where m = protected zones | m = 8 hardcoded + ≤ 20 OSM-derived; worst case O(500×28) = 14,000 haversine ops |
| ThreatScoringEngine | O(b) where b = breaches | b << n×m (most aircraft not near zones) |
| EuAwningLevelAssigner | O(z) where z = zones with breaches | z ≤ m = 28 |
| GdprTrackAnonymiser | O(n) | Same as classifier |
| AacrNotificationFormatter | O(o) where o = ORANGE/RED events | Typically < 5 per cycle |
| RomatsaCoordinationInterface | O(r × p) where r = RED events, p = NOTAM count | NOTAM count bounded by EAD cache |

At maximum load (500 aircraft, 28 zones), the pipeline executes approximately 14,500 haversine operations per cycle. Each haversine is ~20 floating-point operations. At 10s cycle rate: **725,000 FLOP/s** — trivially within Raspberry Pi 4 capability.

---

## Error Handling Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  W19 Error Handling Policy                                      │
│                                                                 │
│  FR-W19-01 (Classifier):                                        │
│    AircraftState missing category field → default cat-d-unknown │
│    Confidence always returned; never throws                     │
│                                                                 │
│  FR-W19-02 (BreachDetector):                                    │
│    NaN lat/lon → skip aircraft, log warning                     │
│    Zero-radius zone → log error, skip zone                      │
│                                                                 │
│  FR-W19-03 (ScoringEngine):                                     │
│    Missing atmospheric data → omit bonus (treat as 0)           │
│    Missing security events → omit bonus (treat as 0)            │
│    All inputs null → score = 0 (no threat, no breach)           │
│                                                                 │
│  FR-W19-04 (AwningLevelAssigner):                               │
│    Unknown zone type → apply airport thresholds (conservative)  │
│    No scores for zone → GREEN (no detected breach)              │
│                                                                 │
│  FR-W19-05 (GdprAnonymiser):                                    │
│    HMAC key missing → passthrough without anonymisation +       │
│    set privacyBreachFlag in ThreatIntelPicture                  │
│    Cat-D: always passthrough (no anonymisation)                 │
│                                                                 │
│  FR-W19-06 (AacrFormatter):                                     │
│    Missing zone.icaoDesignator → use lat/lon format             │
│    Missing atmospheric data → omit field, document in report    │
│                                                                 │
│  FR-W19-07 (RomatsaInterface):                                  │
│    No active NOTAMs available → proceed without cross-reference │
│    document degraded mode in coordination message               │
│                                                                 │
│  FR-W19-08 (Pipeline):                                          │
│    Any step failure → continue pipeline with partial output     │
│    Emit sentinel.intel.pipeline_error event via NATS            │
│    Never suppress ThreatIntelPicture even if partial            │
└────────────────────────────────────────────────────────────────┘
```

---

## Romanian Geography Constants

```typescript
// Key coordinates used across W19 components

export const ROMANIA_BBOX = {
  latMin: 43.5, latMax: 48.5,
  lonMin: 20.2, lonMax: 30.0
};

export const BUCHAREST_CENTRE = { lat: 44.4268, lon: 26.1025 };

export const LROP_COORDS = { lat: 44.5713, lon: 26.0849 }; // Henri Coandă
export const LRCL_COORDS = { lat: 46.7852, lon: 23.6862 }; // Cluj-Napoca
export const LRTR_COORDS = { lat: 45.8099, lon: 21.3379 }; // Timișoara
export const LRSB_COORDS = { lat: 45.7858, lon: 24.0924 }; // Sibiu
export const LRCK_COORDS = { lat: 44.3622, lon: 28.4883 }; // Kogălniceanu (NATO)
export const LRBS_COORDS = { lat: 44.0986, lon: 24.1375 }; // Deveselu (NATO)

export const CERNAVODA_COORDS  = { lat: 44.3267, lon: 28.0606 }; // CNE Cernavodă
export const BUCHAREST_GOVT    = { lat: 44.4268, lon: 26.1025 }; // CDQ/Victoriei

export const BUCHAREST_FIR = 'LRBB'; // Bucharest FIR — ROMATSA AoR
export const BUCHAREST_ACC = 'LROP_ACC';
```
