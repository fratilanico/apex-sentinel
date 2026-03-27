# APEX-SENTINEL W19 — API SPECIFICATION

## Theme: Romania/EU Threat Intelligence Layer

---

## Overview

W19 exposes no external HTTP API. All interfaces are internal:
1. **TypeScript class/function contracts** — consumed by other W19 components and tests
2. **NATS event bus** — consumed by W10 (AWNING), W20 (operator workflow), and external subscribers
3. **EventEmitter interface** — W19ThreatIntelPipeline extends Node.js EventEmitter

---

## Component Contracts

### FR-W19-01: EasaCategoryClassifier

```typescript
// File: src/intel/easa-category-classifier.ts

export class EasaCategoryClassifier {
  /**
   * Classify a single aircraft into a W19 threat category.
   *
   * Classification logic (in priority order):
   * 1. If cooperativeContact=false AND squawk=null AND category=null → cat-d-unknown (confidence=1.0)
   * 2. If cooperativeContact=false → cat-d-unknown (confidence=0.9)
   * 3. Map ADS-B emitter category field:
   *    A0-A7 (GA, turboprop, jet, heavy) → cat-a-commercial (confidence=0.95)
   *    B0-B3 (rotorcraft, UAV declared) → cat-b-modified (confidence=0.85)
   *    C0-C3 (surface vehicle, obstacle, cluster) → cat-c-surveillance (confidence=0.80)
   *    null/unknown → heuristic path below
   * 4. Heuristic path (category field absent):
   *    altBaro < 150m AND velocityMs < 30 AND cooperativeContact=false → cat-d-unknown (confidence=0.75)
   *    altBaro < 500m AND velocityMs < 15 → cat-a-commercial (confidence=0.60, likely small drone)
   *    else → cat-d-unknown (confidence=0.50)
   * 5. If mlSignals provided: adjust confidence using fusion probability
   *
   * @param aircraft   AircraftState from W18 pipeline
   * @param mlSignals  Optional W3-W8 ML signals for non-cooperative aircraft
   * @returns          CategoryResult with category and confidence
   * @throws           Never — returns cat-d-unknown on any error
   */
  classify(aircraft: AircraftState, mlSignals?: MlSignalBundle): CategoryResult;

  /**
   * Classify a batch of aircraft. Same logic as classify(), applied to each.
   * Returns results in same order as input array.
   */
  classifyBatch(aircraft: AircraftState[], mlSignals?: MlSignalBundle[]): CategoryResult[];
}
```

**Error contracts:**
- Never throws. All exceptions are caught; default return is `{ category: 'cat-d-unknown', confidence: 0.5, classificationBasis: 'heuristic-velocity' }`.
- Logs warning on unexpected category field values.

---

### FR-W19-02: ProtectedZoneBreachDetector

```typescript
// File: src/intel/protected-zone-breach-detector.ts

export class ProtectedZoneBreachDetector {
  /**
   * Evaluate all aircraft against all protected zones.
   * Returns only breaching aircraft-zone pairs (distance < zone.radiusM).
   *
   * Algorithm:
   *   for each aircraft in aircraft[]:
   *     for each zone in zones[]:
   *       d = haversine(aircraft.lat, aircraft.lon, zone.centreLat, zone.centreLon)
   *       if d < zone.radiusM:
   *         breachType = determineBreachType(aircraft, zone, previousState)
   *         ttBreachS = computeTtBreach(aircraft, zone, d)
   *         emit ZoneBreach
   *
   * BreachType determination:
   *   INSIDE    → aircraft currently within zone.radiusM
   *   ENTERING  → aircraft outside but approaching (approachRateMs > 0, ttBreachS computed)
   *   EXITING   → aircraft inside and moving away (approachRateMs < 0)
   *
   * Note: ENTERING breaches are emitted when aircraft is within zone.alertRadiusM
   * (zone.radiusM + 500m buffer) but outside zone.radiusM — this gives early warning.
   *
   * @param aircraft   All aircraft in current EuSituationalPicture
   * @param zones      All protected zones (W18 CriticalInfrastructureLoader output)
   * @param previous   Optional previous breach states for ENTERING/EXITING detection
   * @returns          Array of ZoneBreach (may be empty)
   */
  detectBreaches(
    aircraft: AircraftState[],
    zones: ProtectedZone[],
    previous?: Map<string, ZoneBreach>
  ): ZoneBreach[];

  /**
   * Compute haversine distance between two coordinates.
   * R = 6371000m (mean Earth radius).
   *
   * @returns Distance in metres
   */
  haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number;

  /**
   * Compute time-to-breach in seconds for an approaching aircraft.
   * Returns null if:
   *   - Aircraft is already inside zone
   *   - Aircraft is not approaching (headingDeg is null or moving away)
   *   - velocityMs is null or zero
   *
   * @returns Seconds until aircraft reaches zone boundary, or null
   */
  computeTtBreachSeconds(
    aircraft: AircraftState,
    zone: ProtectedZone,
    currentDistanceM: number
  ): number | null;
}
```

**Performance contract:**
- Must process 500 aircraft × 28 zones in < 100ms (deterministic, no async).
- `haversineM` is a pure function — no side effects, suitable for memoization.

---

### FR-W19-03: ThreatScoringEngine

```typescript
// File: src/intel/threat-scoring-engine.ts

export class ThreatScoringEngine {
  /**
   * Compute threat scores for a set of zone breaches.
   *
   * Score formula:
   *   proximityScore  = clamp(100 * (1 - breach.distanceM / zone.radiusM), 0, 100)
   *   categoryMult    = CATEGORY_MULTIPLIERS[category] // 0.4|0.7|0.9|1.0
   *   weightedProx    = proximityScore * categoryMult
   *   atmBonus        = atmospheric?.flyabilityScore > 70 ? 10 : 0
   *   secBonus        = hasActiveEventWithin10km(breach, events) ? 15 : 0
   *   rawScore        = weightedProx + atmBonus + secBonus
   *   finalScore      = Math.round(clamp(rawScore, 0, 100))
   *
   * Category multipliers (canonical):
   *   cat-a-commercial: 0.4
   *   cat-b-modified:   0.7
   *   cat-c-surveillance: 0.9
   *   cat-d-unknown:    1.0
   *
   * @param breaches      ZoneBreach[] from ProtectedZoneBreachDetector
   * @param categories    CategoryResult[] from EasaCategoryClassifier
   * @param zones         ProtectedZone[] for radius lookup
   * @param atmospheric   AtmosphericConditions (null = omit atmospheric bonus)
   * @param events        SecurityEvent[] (null/empty = omit security bonus)
   * @returns             ThreatScore[] in same order as breaches[]
   */
  score(
    breaches: ZoneBreach[],
    categories: CategoryResult[],
    zones: ProtectedZone[],
    atmospheric: AtmosphericConditions | null,
    events: SecurityEvent[] | null
  ): ThreatScore[];

  /**
   * Determine if any active SecurityEvent falls within 10km of the breach centroid.
   *
   * @returns true if matching event found; false otherwise
   */
  hasActiveSecurityEventWithin10km(
    breach: ZoneBreach,
    zone: ProtectedZone,
    events: SecurityEvent[]
  ): boolean;
}

export const CATEGORY_MULTIPLIERS: Record<UasThreatCategory, number> = {
  'cat-a-commercial': 0.4,
  'cat-b-modified': 0.7,
  'cat-c-surveillance': 0.9,
  'cat-d-unknown': 1.0,
};
```

**Determinism contract:**
- Given identical inputs, `score()` must return identical outputs. No randomness.
- `Math.round()` applied only to final score — intermediate values are floats.

---

### FR-W19-04: EuAwningLevelAssigner

```typescript
// File: src/intel/eu-awning-level-assigner.ts

export class EuAwningLevelAssigner {
  private natsClient: NatsConnection;

  constructor(natsClient: NatsConnection) {
    this.natsClient = natsClient;
  }

  /**
   * Assign AWNING level to each protected zone based on maximum threat score.
   *
   * Per-zone logic:
   *   1. Find all ThreatScores for the zone
   *   2. Take maxScore = Math.max(...scores.map(s => s.value))
   *   3. Determine zone type category for threshold lookup
   *   4. Apply threshold table:
   *      if maxScore < thresholds.greenMax  → GREEN
   *      if maxScore < thresholds.yellowMax → YELLOW
   *      if maxScore < thresholds.orangeMax → ORANGE
   *      else                               → RED
   *   5. If level changed from previous cycle → publish to NATS
   *
   * Threshold table:
   *   airport:    { greenMax: 20, yellowMax: 50, orangeMax: 75 }
   *   nuclear:    { greenMax: 10, yellowMax: 30, orangeMax: 50 }
   *   military:   { greenMax: 15, yellowMax: 40, orangeMax: 65 }
   *   government: { greenMax: 25, yellowMax: 55, orangeMax: 80 }
   *
   * Zone category mapping (ProtectedZoneCategory → threshold key):
   *   AIRPORT_CTR, AIRPORT_EXCLUSION → 'airport'
   *   NUCLEAR_PLANT                  → 'nuclear'
   *   NATO_BASE, MILITARY_INSTALLATION → 'military'
   *   GOVERNMENT_DISTRICT            → 'government'
   *   POWER_INFRASTRUCTURE, CUSTOM   → 'airport' (conservative default)
   *
   * @param scores   All ThreatScores from current pipeline cycle
   * @param zones    ProtectedZone[] for category lookup
   * @param previous Previous ZoneAwningState map (for change detection)
   * @returns        Map<zoneId, ZoneAwningState>
   */
  async assign(
    scores: ThreatScore[],
    zones: ProtectedZone[],
    previous: Map<string, ZoneAwningState>
  ): Promise<Map<string, ZoneAwningState>>;

  /**
   * Publish AWNING change event to NATS.
   * Subject: 'sentinel.intel.awning_change'
   * Payload: ZoneAwningState JSON
   */
  private async publishAwningChange(state: ZoneAwningState): Promise<void>;

  /**
   * Map ProtectedZoneCategory to threshold table key.
   */
  mapCategoryToThresholdKey(category: ProtectedZoneCategory): string;
}
```

---

### FR-W19-05: GdprTrackAnonymiser

```typescript
// File: src/intel/gdpr-track-anonymiser.ts

export class GdprTrackAnonymiser {
  private deploySecret: string;         // From APEX_DEPLOY_SECRET env var

  constructor(deploySecret: string) {
    this.deploySecret = deploySecret;
  }

  /**
   * Anonymise aircraft tracks according to GDPR rules.
   *
   * Decision tree per aircraft:
   *   1. If category === 'cat-d-unknown':
   *      → AnonymisedTrack { status: 'EXEMPT', legalBasis: 'Art.6(1)(e)' }
   *      → Retain original position (no grid-snap)
   *   2. If trackAge < 30s:
   *      → AnonymisedTrack { status: 'PENDING' }
   *      → Apply grid-snap as precaution
   *   3. If trackAge >= 30s AND category === 'cat-a-commercial':
   *      → Apply full anonymisation
   *      pseudoId = HMAC-SHA256(icao24, deploySecret).slice(0, 16)
   *      gridLat = Math.floor(lat * 1000) / 1000
   *      gridLon = Math.floor(lon * 1000) / 1000
   *      callsignPrefix = callsign?.slice(0, 3) ?? 'UNK'
   *      → AnonymisedTrack { status: 'ANONYMISED' }
   *   4. If deploySecret missing:
   *      → AnonymisedTrack { status: 'ERROR_PASSTHROUGH', privacyBreachFlag: true }
   *
   * @param aircraft      Single AircraftState to anonymise
   * @param category      CategoryResult for this aircraft
   * @param trackStartedAt ISO-8601: when tracking of this aircraft began
   * @returns             AnonymisedTrack
   */
  anonymise(
    aircraft: AircraftState,
    category: CategoryResult,
    trackStartedAt: string
  ): AnonymisedTrack;

  /**
   * Batch anonymisation. Returns results in same order as input.
   */
  anonymiseBatch(
    aircraft: AircraftState[],
    categories: CategoryResult[],
    trackStartTimes: Map<string, string>   // icao24 → trackStartedAt
  ): AnonymisedTrack[];

  /**
   * Grid-snap a coordinate to 100m resolution.
   * Formula: Math.floor(coordinate * 1000) / 1000
   */
  gridSnap(coordinate: number): number;
}
```

---

### FR-W19-06: AacrNotificationFormatter

```typescript
// File: src/intel/aacr-notification-formatter.ts

export class AacrNotificationFormatter {
  private sequenceCounter: number = 0;
  private natsClient: NatsConnection;

  constructor(natsClient: NatsConnection) {
    this.natsClient = natsClient;
  }

  /**
   * Format AACR incident notifications for all ORANGE and RED breaches.
   *
   * Trigger condition: awningLevel === 'ORANGE' || awningLevel === 'RED'
   *
   * SIRA field mapping:
   *   incidentId    → 'AACR-' + year + '-' + (++seq).toString().padStart(6, '0')
   *   timestampUtc  → breach.firstDetectedAt (NOT report generation time)
   *   locationIcao  → zone.icaoDesignator if available, else null
   *   locationLat   → zone.centreLat (grid-snapped for Cat-A)
   *   aircraftCategory → from CategoryResult
   *   estimatedSizeClass → derived from velocityMs + altBaro heuristic
   *   awningLevel   → from ZoneAwningState.level
   *   recommendedAction → scoreToAction(threatScore.value)
   *   operatorConfirmationRequired → true for ORANGE and RED (GDPR Art.22)
   *
   * Action mapping:
   *   score < 50  → 'MONITOR'
   *   score < 65  → 'WARN'
   *   score < 85  → 'INTERCEPT'
   *   score >= 85 → 'EMERGENCY'
   *
   * CNCAN escalation: set cncanEscalationRequired=true if zone.category === 'NUCLEAR_PLANT'
   *
   * @param breaches       All ZoneBreach[] from current cycle
   * @param scores         ThreatScore[] from ThreatScoringEngine
   * @param awningLevels   ZoneAwningState map from EuAwningLevelAssigner
   * @param zones          ProtectedZone[] for metadata
   * @param categories     CategoryResult[] for aircraft classification details
   * @returns              AacrNotification[] (empty if no ORANGE/RED events)
   */
  async format(
    breaches: ZoneBreach[],
    scores: ThreatScore[],
    awningLevels: Map<string, ZoneAwningState>,
    zones: ProtectedZone[],
    categories: CategoryResult[]
  ): Promise<AacrNotification[]>;

  /**
   * Publish formatted notification to NATS.
   * Subject: 'sentinel.intel.aacr_notification'
   */
  private async publish(notification: AacrNotification): Promise<void>;
}
```

---

### FR-W19-07: RomatsaCoordinationInterface

```typescript
// File: src/intel/romatsa-coordination-interface.ts

// Airports that trigger ROMATSA coordination (major Romanian airports with ATC service)
export const ROMATSA_COORDINATION_AIRPORTS = ['LROP', 'LRCL', 'LRTR', 'LRSB', 'LRCK'];

export class RomatsaCoordinationInterface {
  private sequenceCounter: number = 0;
  private natsClient: NatsConnection;

  constructor(natsClient: NatsConnection) {
    this.natsClient = natsClient;
  }

  /**
   * Generate ATC coordination messages for RED AWNING events near major airports.
   *
   * Trigger condition:
   *   awningLevel === 'RED' AND zone.icaoDesignator in ROMATSA_COORDINATION_AIRPORTS
   *
   * NOTAM cross-reference:
   *   1. Find all active NOTAMs covering breach location
   *   2. If any active NOTAM of type R/P/D covers the area:
   *      set notamCoverage=true, actionDowngradedByNotam=true
   *      downgrade action: INTERCEPT→WARN, WARN→MONITOR, EMERGENCY→INTERCEPT
   *   3. Aircraft speed converted from m/s to knots: kts = ms * 1.944
   *   4. Aircraft altitude converted from metres to feet: ft = m * 3.281
   *
   * Message ID format: 'APEX-' + year + '-' + seq.padStart(6, '0')
   *
   * @param awningLevels   ZoneAwningState map
   * @param notams         Active NotamRestriction[] from W18
   * @param breaches       ZoneBreach[] from current cycle
   * @param aircraft       AircraftState[] for speed/altitude lookup
   * @param zones          ProtectedZone[] for airport identification
   * @param categories     CategoryResult[] for aircraft classification
   * @param aacrNotifications Linked AacrNotification[] for cross-reference ID
   * @returns              RomatsaCoordinationMessage[] (empty if no RED airport events)
   */
  async generate(
    awningLevels: Map<string, ZoneAwningState>,
    notams: NotamRestriction[],
    breaches: ZoneBreach[],
    aircraft: AircraftState[],
    zones: ProtectedZone[],
    categories: CategoryResult[],
    aacrNotifications: AacrNotification[]
  ): Promise<RomatsaCoordinationMessage[]>;

  /**
   * Determine if a breach location is covered by any active NOTAM.
   * Match criteria: NOTAM icaoLocation matches zone.icaoDesignator AND status=ACTIVE.
   */
  isBreachCoveredByNotam(
    breach: ZoneBreach,
    zone: ProtectedZone,
    notams: NotamRestriction[]
  ): boolean;

  /**
   * Publish coordination message to NATS.
   * Subject: 'sentinel.intel.romatsa_coordination'
   */
  private async publish(message: RomatsaCoordinationMessage): Promise<void>;
}
```

---

### FR-W19-08: W19ThreatIntelPipeline

```typescript
// File: src/intel/w19-threat-intel-pipeline.ts

export interface W19PipelineConfig {
  natsUrl: string;                      // e.g. 'nats://localhost:4222'
  deploySecret: string;                 // APEX_DEPLOY_SECRET for HMAC anonymisation
  cycleIntervalMs: number;              // Typically 10000 (10s, matching W18 feed rate)
}

export class W19ThreatIntelPipeline extends EventEmitter {
  private config: W19PipelineConfig;

  // Injected components
  private classifier: EasaCategoryClassifier;
  private breachDetector: ProtectedZoneBreachDetector;
  private scoringEngine: ThreatScoringEngine;
  private awningAssigner: EuAwningLevelAssigner;
  private anonymiser: GdprTrackAnonymiser;
  private aacrFormatter: AacrNotificationFormatter;
  private romatsaInterface: RomatsaCoordinationInterface;

  // State
  private previousBreaches: Map<string, ZoneBreach>;
  private previousAwningLevels: Map<string, ZoneAwningState>;
  private trackStartTimes: Map<string, string>;   // icao24 → ISO-8601
  private cycleCounter: number;

  constructor(config: W19PipelineConfig) { ... }

  /**
   * Process one EuSituationalPicture through the full W19 pipeline.
   *
   * Steps (in order):
   *   1. classify aircraft
   *   2. detect breaches
   *   3. score threats
   *   4. assign AWNING levels (async — publishes to NATS on change)
   *   5. anonymise tracks
   *   6. format AACR notifications (async — publishes to NATS)
   *   7. generate ROMATSA coordination (async — publishes to NATS)
   *   8. assemble ThreatIntelPicture
   *   9. emit 'picture_updated' event
   *   10. publish to NATS sentinel.intel.picture_update
   *
   * @param picture   EuSituationalPicture from W18 EuDataIntegrationPipeline
   * @returns         ThreatIntelPicture
   * @emits           'breach_detected' — for each new ZoneBreach
   * @emits           'awning_change'   — for each zone AWNING level change
   * @emits           'aacr_notification' — for each generated AacrNotification
   * @emits           'romatsa_coordination' — for each generated RomatsaCoordinationMessage
   * @emits           'picture_updated' — after full assembly
   * @emits           'pipeline_error'  — on any step failure (non-fatal)
   */
  async process(picture: EuSituationalPicture): Promise<ThreatIntelPicture>;

  /**
   * Start the pipeline in continuous mode.
   * Subscribes to NATS sentinel.feeds.eu_picture.
   * Calls process() on each received picture.
   */
  async start(): Promise<void>;

  /**
   * Stop the pipeline. Unsubscribes from NATS. Drains event queue.
   */
  async stop(): Promise<void>;
}
```

---

## NATS Subject Registry

| Subject | Publisher | Consumers | Payload Type |
|---------|-----------|-----------|--------------|
| `sentinel.feeds.eu_picture` | W18 EuDataIntegrationPipeline | W19ThreatIntelPipeline | EuSituationalPicture |
| `sentinel.intel.breach_detected` | W19ThreatIntelPipeline | W20 Operator Dashboard | ZoneBreach |
| `sentinel.intel.awning_change` | W19 EuAwningLevelAssigner | W10 AwningLevelPublisher, W20 Dashboard | ZoneAwningState |
| `sentinel.intel.aacr_notification` | W19 AacrNotificationFormatter | W20 AACR Dispatch Queue | AacrNotification |
| `sentinel.intel.romatsa_coordination` | W19 RomatsaCoordinationInterface | W20 ROMATSA Channel | RomatsaCoordinationMessage |
| `sentinel.intel.picture_update` | W19ThreatIntelPipeline | W20 full picture consumer | ThreatIntelPicture |
| `sentinel.intel.pipeline_error` | W19ThreatIntelPipeline | Monitoring/alerting | { component, error, timestamp } |

---

## EventEmitter Events

```typescript
// Events emitted by W19ThreatIntelPipeline (in addition to NATS)

pipeline.on('breach_detected', (breach: ZoneBreach) => { ... });
pipeline.on('awning_change', (state: ZoneAwningState) => { ... });
pipeline.on('aacr_notification', (notification: AacrNotification) => { ... });
pipeline.on('romatsa_coordination', (message: RomatsaCoordinationMessage) => { ... });
pipeline.on('picture_updated', (picture: ThreatIntelPicture) => { ... });
pipeline.on('pipeline_error', (error: { component: string; message: string; timestamp: string }) => { ... });
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APEX_DEPLOY_SECRET` | Yes | — | HMAC secret for track pseudonymisation (Fr-W19-05) |
| `NATS_URL` | Yes | `nats://localhost:4222` | NATS connection URL (inherited from W18) |

No new API keys are required for W19. All W19 data derives from W18's already-configured feeds.
