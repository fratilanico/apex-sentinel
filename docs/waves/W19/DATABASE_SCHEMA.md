# APEX-SENTINEL W19 — DATABASE SCHEMA

## Schema Philosophy

W19 follows the same in-memory architecture as W18. No new Supabase tables or migrations are introduced. All W19 data is:

- **In-memory computation**: threat scores, breach events, AWNING levels computed per pipeline cycle
- **In-memory buffers**: anonymised tracks retained with 24h TTL per GDPR Art.5(1)(e)
- **Emitted via NATS**: all downstream consumers receive typed messages on named subjects
- **Audit persistence deferred**: full audit log to Supabase is a W20 responsibility

The TypeScript interface definitions below are the canonical schema for W19. They are the contract between W19 components and all consumers (W10 AWNING engine, W20 operator workflow, NATS subscribers).

---

## W19 Type Definitions

### UasThreatCategory (W19 refinement)

```typescript
// W19 threat category — finer-grained than W18's Cat-A/B/C/D
// Maps EASA category + transponder status + mission profile to operational threat label

export type UasThreatCategory =
  | 'cat-a-commercial'    // EASA Open Cat-A, cooperative ADS-B, commercial operator
  | 'cat-b-modified'      // Open/Specific, ADS-B equipped, non-standard flight profile
  | 'cat-c-surveillance'  // Specific category, potential ISR mission, cooperative
  | 'cat-d-unknown';      // Non-cooperative, no transponder, worst-case risk

export interface CategoryResult {
  aircraftId: string;                   // ICAO24 hex
  category: UasThreatCategory;
  confidence: number;                   // 0.0 – 1.0
  classificationBasis: ClassificationBasis;
  timestamp: string;                    // ISO-8601 UTC of classification
}

export type ClassificationBasis =
  | 'ads-b-emitter-category'    // Used ADS-B category field directly
  | 'transponder-absent'        // No ADS-B transponder detected
  | 'heuristic-velocity'        // Classified from speed/altitude profile
  | 'ml-signal-informed'        // W3-W8 ML signal reinforced classification
  | 'squawk-only';              // Mode-A squawk without position
```

---

### ZoneBreach

```typescript
// A detected proximity breach between an aircraft and a protected zone
// Output of FR-W19-02 ProtectedZoneBreachDetector

export type BreachType = 'ENTERING' | 'INSIDE' | 'EXITING';

export interface ZoneBreach {
  // Identity
  breachId: string;                     // UUID v4, generated per breach detection
  aircraftId: string;                   // ICAO24 hex of aircraft
  zoneId: string;                       // ProtectedZone.id

  // Geometry
  distanceM: number;                    // Haversine distance from aircraft to zone centre (metres)
  bearingDeg: number;                   // Bearing from zone centre to aircraft (degrees true)

  // Dynamics
  breachType: BreachType;              // ENTERING = approaching boundary; INSIDE = within; EXITING = leaving
  ttBreachS: number | null;            // Time to boundary crossing in seconds (null if already inside or speed unknown)
  approachRateMs: number | null;       // Rate of closure in m/s (positive = approaching)

  // NATO sensitivity flag
  natoSensitive: boolean;              // True if zone is a NATO co-located facility (LRCK, LRBS, etc.)

  // Timestamps
  firstDetectedAt: string;             // ISO-8601 UTC — first detection in this breach event
  lastUpdatedAt: string;               // ISO-8601 UTC — last position update

  // Cross-references
  activeNotamIds: string[];            // IDs of active NOTAMs covering this zone at time of breach
  uasZoneId: string | null;            // EASA U-space zone if breach is within a designated U-space area
}
```

---

### ThreatScore

```typescript
// Output of FR-W19-03 ThreatScoringEngine
// Scalar threat assessment with factor decomposition for auditability

export type AwningRecommendation = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';

export interface ThreatScoreFactors {
  // Component scores (each 0–100 before weighting)
  proximityRaw: number;                 // 100 * (1 - distanceM / zone.radiusM), clamped 0–100
  categoryMultiplier: number;          // 0.4 | 0.7 | 0.9 | 1.0 (from UasThreatCategory)
  proximityWeighted: number;           // proximityRaw * categoryMultiplier

  // Additive bonuses
  atmosphericBonus: number;            // 10 if flyabilityScore > 70, else 0
  securityContextBonus: number;        // 15 if active SecurityEvent within 10km, else 0

  // Metadata for audit
  flyabilityScore: number | null;      // Copied from AtmosphericConditions.flyabilityScore
  nearestSecurityEventId: string | null; // ID of triggering security event (if any)
  nearestSecurityEventDistanceM: number | null;
}

export interface ThreatScore {
  scoreId: string;                     // UUID v4
  breachId: string;                    // Foreign key to ZoneBreach.breachId
  aircraftId: string;
  zoneId: string;

  value: number;                       // Final score 0–100 (integer, clamped)
  factors: ThreatScoreFactors;
  awningRecommendation: AwningRecommendation;

  // GDPR Art.22 compliance
  automatedDecision: boolean;          // Always true for W19 (all decisions are automated)
  operatorConfirmationRequired: boolean; // True when recommendation is ORANGE or RED

  computedAt: string;                  // ISO-8601 UTC
}
```

---

### AwningLevel

```typescript
// Per-zone AWNING level — output of FR-W19-04 EuAwningLevelAssigner
// Feeds into W10 AwningLevelPublisher via NATS sentinel.intel.awning_change

export type AwningLevel = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';

export interface ZoneAwningState {
  zoneId: string;
  zoneName: string;
  zoneCategory: ProtectedZoneCategory;  // 'airport' | 'nuclear' | 'military' | 'government'

  level: AwningLevel;
  previousLevel: AwningLevel | null;    // For change detection
  changed: boolean;                     // True if level differs from previous cycle

  // Score that drove this level
  drivingScore: number;
  drivingBreachId: string | null;

  // Thresholds applied (for audit)
  thresholds: AwningThresholds;

  // NATS publish metadata
  publishedAt: string;                  // ISO-8601 UTC
  natsSubject: string;                  // 'sentinel.intel.awning_change'
}

export interface AwningThresholds {
  greenMax: number;   // Score below this → GREEN
  yellowMax: number;  // Score below this → YELLOW
  orangeMax: number;  // Score below this → ORANGE
  // ≥ orangeMax → RED
}

// Zone-type threshold table (canonical)
export const AWNING_THRESHOLDS: Record<string, AwningThresholds> = {
  airport:    { greenMax: 20, yellowMax: 50, orangeMax: 75 },
  nuclear:    { greenMax: 10, yellowMax: 30, orangeMax: 50 },
  military:   { greenMax: 15, yellowMax: 40, orangeMax: 65 },
  government: { greenMax: 25, yellowMax: 55, orangeMax: 80 },
};
```

---

### AnonymisedTrack

```typescript
// GDPR-compliant pseudonymised aircraft track
// Output of FR-W19-05 GdprTrackAnonymiser

export type AnonymisationStatus =
  | 'ANONYMISED'          // Pseudonymised; original ICAO24 and callsign discarded
  | 'EXEMPT'              // Cat-D: not anonymised (Art.6(1)(e) public interest)
  | 'PENDING'             // Within 30s window; not yet due for anonymisation
  | 'ERROR_PASSTHROUGH';  // HMAC key missing; raw data passed (privacyBreachFlag set)

export interface AnonymisedTrack {
  // Pseudonymised identity
  pseudoId: string;                     // HMAC-SHA256(icao24, DEPLOY_SECRET)[:16] hex
  anonymisationStatus: AnonymisationStatus;
  legalBasis: string;                   // 'Art.6(1)(e)' or 'N/A — exempt' or 'pseudonymised'

  // Grid-snapped position (100m resolution)
  // Formula: floor(coordinate * 1000) / 1000
  gridLat: number;                      // ±0.001° resolution ≈ 111m at equator, ~78m at 45°N
  gridLon: number;

  // Anonymised identity fragments
  callsignPrefix: string;               // First 3 chars of callsign, or 'UNK'
  category: UasThreatCategory;          // Category retained (not PII)

  // Altitude retained (not PII, operationally necessary)
  altBaro: number;

  // Data lifecycle
  trackStartedAt: string;              // ISO-8601: when tracking began (for 30s timer)
  anonymisedAt: string | null;         // ISO-8601: when anonymisation was applied
  expiresAt: string;                   // ISO-8601: trackStartedAt + 24h (Art.5(1)(e))

  // Audit
  privacyBreachFlag: boolean;          // True if anonymisation could not be applied (HMAC error)
}
```

---

### AacrNotification

```typescript
// Formatted AACR incident notification — SIRA template
// Output of FR-W19-06 AacrNotificationFormatter

export type AacrRecommendedAction = 'MONITOR' | 'WARN' | 'INTERCEPT' | 'EMERGENCY';

export interface AacrNotification {
  // SIRA Field 1: Incident Identifier
  incidentId: string;                   // Format: 'AACR-YYYY-NNNNNN' e.g. 'AACR-2026-000001'

  // SIRA Field 2: Timestamp
  timestampUtc: string;                 // ISO-8601 UTC of first breach detection (NOT report generation)
  reportGeneratedAt: string;            // ISO-8601 UTC of notification creation

  // SIRA Field 3: Location
  locationIcao: string | null;         // e.g. 'LROP', 'LRCL', null if non-airport zone
  locationLat: number;                  // WGS-84 decimal degrees (grid-snapped if Cat-A)
  locationLon: number;
  locationDescription: string;         // Human-readable e.g. 'Henri Coandă International Airport CTR'

  // SIRA Field 4: Aircraft Description
  aircraftCategory: UasThreatCategory;
  estimatedSizeClass: 'NANO' | 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'UNKNOWN';
  transponderType: 'ADS-B' | 'MODE-S' | 'MODE-A' | 'NONE' | 'UNKNOWN';
  classificationConfidence: number;    // 0.0–1.0 from EasaCategoryClassifier

  // SIRA Field 5: Threat Level
  awningLevel: AwningLevel;
  threatScore: number;                  // 0–100

  // SIRA Field 6: Recommended Action
  recommendedAction: AacrRecommendedAction;

  // SIRA Field 7: Operator Confirmation
  operatorConfirmationRequired: boolean; // Art.22 GDPR compliance; always true for ORANGE/RED

  // Extended fields (W19 additions, not standard SIRA but valuable)
  activeNotamIds: string[];            // NOTAMs covering the affected area
  natoSensitive: boolean;
  cncanEscalationRequired: boolean;    // True for nuclear zone breaches
  breach: ZoneBreach;                  // Full breach detail for investigator reference

  // Classification basis for audit
  classificationBasis: ClassificationBasis;
}
```

---

### RomatsaCoordinationMessage

```typescript
// ATC coordination message for ROMATSA — ICAO Doc 4444 §10 format
// Output of FR-W19-07 RomatsaCoordinationInterface

export type RomatsaIncidentType = 'UAS_BREACH' | 'UAS_APPROACH' | 'UAS_SUSPECTED';

export type RomatsaRecommendedAction = 'MONITOR' | 'WARN' | 'INTERCEPT' | 'EMERGENCY';

export interface RomatsaCoordinationMessage {
  // ICAO coordination header
  messageId: string;                   // 'APEX-YYYY-NNNNNN' SELCAL-style identifier
  timestamp: string;                   // ISO-8601 UTC
  classification: 'TLP:RED';          // Traffic Light Protocol — never share externally

  // ATC context
  affectedFir: string;                 // e.g. 'LRBB' — Bucharest FIR
  affectedSector: string | null;       // e.g. 'LROP_TMA', 'LRCL_CTR', null if FIR-wide
  affectedAerodrome: string | null;    // ICAO designator e.g. 'LROP'

  // Incident classification
  incidentType: RomatsaIncidentType;
  awningLevel: AwningLevel;
  breach: ZoneBreach;                  // Full breach detail

  // Aircraft particulars (ICAO format)
  aircraftIcao24: string | null;       // Hex address, null if non-cooperative
  aircraftCategory: UasThreatCategory;
  aircraftHeadingDeg: number | null;
  aircraftSpeedKts: number | null;     // Converted from m/s
  aircraftAltitudeFt: number | null;   // Converted from metres

  // Cross-reference with active NOTAMs
  activeNotamIds: string[];
  notamCoverage: boolean;              // True if breach area already covered by active NOTAM
  actionDowngradedByNotam: boolean;    // True if recommended action downgraded due to NOTAM

  // Recommended action
  recommendedAction: RomatsaRecommendedAction;

  // Human confirmation
  operatorConfirmationRequired: boolean;

  // Linked AACR notification
  linkedAacrIncidentId: string | null; // Cross-reference to AacrNotification.incidentId
}
```

---

### ThreatIntelPicture

```typescript
// Full W19 output — the complete threat intelligence picture for one pipeline cycle
// Input to W20 Operator Workflow Layer

export interface ThreatIntelPicture {
  // Lifecycle
  timestamp: string;                    // ISO-8601 UTC — when this picture was assembled
  cycleSequence: number;               // Monotonically increasing cycle counter
  pipelineLatencyMs: number;           // End-to-end time from EuSituationalPicture receipt to assembly

  // Core outputs
  breaches: ZoneBreach[];
  scores: ThreatScore[];
  awningLevels: Map<string, ZoneAwningState>;  // keyed by zoneId
  notifications: AacrNotification[];
  coordinationMessages: RomatsaCoordinationMessage[];
  anonymisedTracks: AnonymisedTrack[];

  // Summary
  totalAircraftObserved: number;
  totalBreachesDetected: number;
  highestAwningLevel: AwningLevel;
  zonesAtRed: string[];               // zoneIds currently at RED
  zonesAtOrange: string[];            // zoneIds currently at ORANGE

  // Feed health passthrough from W18
  feedHealthSnapshot: FeedHealth[];   // From W18 EuDataFeedRegistry

  // Privacy
  privacyBreachFlag: boolean;          // True if any anonymisation failure occurred
  gdprExemptTrackCount: number;        // Count of Cat-D tracks (Art.6(1)(e) exempt)

  // Degraded mode flags
  degradedMode: boolean;               // True if any W18 feed was unavailable
  degradedComponents: string[];        // Which FRs operated in degraded mode
}
```

---

### MlSignalBundle (W3–W8 integration)

```typescript
// Optional ML signal bundle — provided by W3-W8 engines for Cat-D classification refinement
// Added to EuSituationalPicture as optional field by W19

export interface MlSignalBundle {
  aircraftId: string;                  // ICAO24 hex or synthetic ID for non-cooperative aircraft

  // Acoustic signals (W3/W4 YAMNet)
  acousticDroneConfidence: number | null;   // 0.0–1.0
  acousticModelVersion: string | null;      // YAMNet version tag

  // RF signals (W5/W6)
  rfFingerprintMatch: boolean | null;       // True if RF signature matches known drone pattern
  rfMatchedModel: string | null;           // e.g. 'DJI Phantom 4', 'Autel EVO II'
  rfFingerprintConfidence: number | null;   // 0.0–1.0

  // Fusion probability (W7/W8)
  fusionThreatProbability: number | null;  // 0.0–1.0
  fusionModelVersion: string | null;
}
```

---

## Supabase Tables (W19 — None New)

W19 introduces no new Supabase tables. W20 will add:
- `sentinel_threat_intel_pictures` — persisted ThreatIntelPicture snapshots
- `sentinel_aacr_notifications` — dispatched AACR notifications with acknowledgement tracking
- `sentinel_romatsa_messages` — ROMATSA coordination message dispatch log
- `sentinel_anonymised_tracks` — GDPR-compliant track log with TTL enforcement

---

## In-Memory Data Lifecycle

| Buffer | Contents | TTL | Eviction |
|--------|----------|-----|----------|
| `threatIntelBuffer` | Last 60 ThreatIntelPictures | 10min (60 × 10s) | FIFO ring buffer |
| `anonymisedTrackBuffer` | AnonymisedTrack per aircraft | 24h | Expire on `expiresAt` |
| `breachEventBuffer` | ZoneBreach events | 6h | FIFO ring, max 1000 entries |
| `awningStateBuffer` | Current ZoneAwningState per zone | Until changed | Replace on change |
| `notificationBuffer` | AacrNotification (pending dispatch) | Until W20 acks | W20 responsibility |
