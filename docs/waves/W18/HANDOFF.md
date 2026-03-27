# APEX-SENTINEL W18 — Handoff Document

```
From:    W18 — EU Data Integration Layer
To:      W19 — Romania/EU Threat Intelligence Layer
Date:    2026-03-27
State:   (fill when W18 completes)
Tests:   ~3199 GREEN at W18 handoff
Author:  APEX-SENTINEL Build
```

---

## W18 Completion State

When W18 is COMPLETE, the following components are available as stable interfaces:

| Component | File | FR | Tests |
|---|---|---|---|
| EuDataFeedRegistry | `src/feeds/eu-data-feed-registry.ts` | FR-W18-01 | 12 |
| AircraftPositionAggregator | `src/feeds/aircraft-position-aggregator.ts` | FR-W18-02 | 15 |
| NotamIngestor | `src/feeds/notam-ingestor.ts` | FR-W18-03 | 12 |
| EasaUasZoneLoader | `src/feeds/easa-uas-zone-loader.ts` | FR-W18-04 | 10 |
| CriticalInfrastructureLoader | `src/feeds/critical-infrastructure-loader.ts` | FR-W18-05 | 12 |
| AtmosphericConditionProvider | `src/feeds/atmospheric-condition-provider.ts` | FR-W18-06 | 14 |
| SecurityEventCorrelator | `src/feeds/security-event-correlator.ts` | FR-W18-07 | 13 |
| EuDataIntegrationPipeline | `src/feeds/eu-data-integration-pipeline.ts` | FR-W18-08 | 14 |
| geo/haversine | `src/geo/haversine.ts` | (shared) | embedded |
| geo/point-in-polygon | `src/geo/point-in-polygon.ts` | (shared) | embedded |
| geo/romania-bbox | `src/geo/romania-bbox.ts` | (shared) | embedded |
| src/feeds/types.ts | `src/feeds/types.ts` | (shared) | — |

---

## What W18 Provides as Stable Interfaces

### 1. EuDataFeedRegistry

The central rate-limiter and circuit breaker for all EU data feeds. W19 can register additional feeds through this registry without forking the infrastructure.

**Stable API:**
```typescript
registry.register(registration: FeedRegistration): void
registry.deregister(feedId: FeedId): void
registry.tryConsume(feedId: FeedId): boolean        // token bucket gate
registry.reportSuccess(feedId: FeedId): void
registry.reportError(feedId: FeedId): void
registry.getHealth(feedId: FeedId): FeedHealth | null
registry.getAllHealth(): Record<FeedId, FeedHealth>
registry.isHealthy(feedId: FeedId): boolean
```

W19 registers new feeds (Eurocontrol SWIM, MarineTraffic AIS for Constanța) through the same registry. The FeedId union type in `types.ts` must be extended.

---

### 2. AircraftPositionAggregator

Provides a unified, deduplicated stream of AircraftState objects from OpenSky Network, ADS-B Exchange, and adsb.fi. Emits ICAO24-deduplicated state with zone breach flags already computed.

**Stable API:**
```typescript
aggregator.start(): Promise<void>
aggregator.stop(): Promise<void>
aggregator.getCurrentAircraft(): AircraftState[]   // snapshot, no clone needed

// Events:
aggregator.on('aircraft_update', (aircraft: AircraftState[]) => void)
aggregator.on('zone_breach', (breach: { aircraft: AircraftState; zones: ZoneBreach[] }) => void)
aggregator.on('emergency', (aircraft: AircraftState) => void)
```

**What W19 needs from this:** W19 builds the EASA Category classifier (Cat-A through Cat-D) and threat scoring engine on top of the `AircraftState` stream. W19 must not modify `AircraftPositionAggregator` — it should consume the stream and produce enriched `ThreatAssessment` objects.

**AircraftState guaranteed fields:**
- `icao24` — always present, always 6 hex characters
- `latitude`, `longitude` — always present when `onGround === false`
- `lastContactUnix` — unix ms, always present
- `source` — which feed this last came from
- `zoneBreaches` — W18 precomputes breach detection, W19 inherits this

---

### 3. NotamIngestor

Active NOTAMs for all 8 Romanian commercial airports (LROP, LRCL, LRTR, LRCK, LRBS, LRSB, LROD, LRIA) as parsed `ParsedNotam` objects and optionally as GeoJSON restriction polygons.

**Stable API:**
```typescript
ingestor.start(): Promise<void>
ingestor.stop(): Promise<void>
ingestor.getActiveNotams(): ParsedNotam[]
ingestor.getUasNotams(): ParsedNotam[]             // filtered: isUasRelated === true
ingestor.getNotamsForPoint(lat, lon): ParsedNotam[]  // point-in-circle

// Events:
ingestor.on('notam_activated', (notam: ParsedNotam) => void)
ingestor.on('notam_expired', (notam: ParsedNotam) => void)
ingestor.on('restriction_changed', () => void)
```

**ParsedNotam guaranteed fields:**
- `notamNumber` — ICAO number, unique per FIR
- `effectiveStart`, `effectiveEnd` — ISO-8601 dates
- `isActive` — computed from current time vs effective window
- `geoJson` — GeoJSON polygon (null if Q-line coord parsing failed)
- `isUasRelated` — keyword detection on E-line text
- `lowerAltFt`, `upperAltFt` — 0 to 99999

**W19 usage:** W19 correlates active NOTAMs with aircraft positions to detect incursions into temporary restricted areas. Specifically: drone flying in active TRA (Q-line QRTCA) during restriction window = elevated threat score.

---

### 4. EasaUasZoneLoader

U-space zone polygons for Romania from EASA drone.rules.eu, classified by restriction type (PROHIBITED, RESTRICTED, CONDITIONAL) and U-space class (A–D, U).

**Stable API:**
```typescript
loader.start(): Promise<void>
loader.stop(): Promise<void>
loader.getZones(): UasZone[]
loader.getZonesAt(lat, lon, altFt): UasZone[]       // point-in-polygon + altitude filter
loader.getProhibitedZones(): UasZone[]

// Events:
loader.on('zones_updated', (zones: UasZone[]) => void)
loader.on('zone_change', (added: UasZone[], removed: UasZone[]) => void)
```

**W19 usage:** W19 uses `getZonesAt()` to check whether any tracked aircraft is operating within a U-space zone without authorisation. Cross-reference with NOTAM ingestor — if zone is PROHIBITED and aircraft is present: immediate threat escalation.

---

### 5. CriticalInfrastructureLoader

The 8 hardcoded Romania protected zones plus OSM-enriched zones. Provides `ProtectedZone[]` with pre-computed haversine breach detection.

**Guaranteed hardcoded zones (never removed, only added):**
```
RO-LROP    Henri Coandă Airport              44.5711°N  26.0858°E  alert: 5km  critical: 2km
RO-LRCL    Cluj-Napoca Airport               46.7852°N  23.6862°E  alert: 5km  critical: 2km
RO-LRTR    Timișoara Airport                 45.8099°N  21.3379°E  alert: 5km  critical: 2km
RO-LRBS    Băneasa Airport                   44.5032°N  26.1021°E  alert: 5km  critical: 2km
RO-CERNAVODA  Cernavodă Nuclear Plant        44.3289°N  28.0566°E  alert: 10km critical: 3km
RO-MK-AIRBASE Mihail Kogălniceanu Air Base   44.3617°N  28.4883°E  alert: 8km  critical: 3km
RO-DEVESELU   Deveselu Missile Defense Base  44.1133°N  24.0969°E  alert: 8km  critical: 3km
RO-CAMPIA-TURZII Câmpia Turzii Air Base      46.5042°N  23.8853°E  alert: 8km  critical: 3km
```

**Stable API:**
```typescript
loader.start(): Promise<void>
loader.stop(): Promise<void>
loader.getZones(): ProtectedZone[]
loader.checkBreach(aircraft: AircraftState): ZoneBreach[]
```

**W19 usage:** W19 must not re-implement haversine breach detection. It consumes `loader.checkBreach()` and uses the results in the threat scoring engine. W19 may add operator-configurable zones via Supabase persistence (requires DPIA decision first).

---

### 6. AtmosphericConditionProvider

Merged atmospheric data from open-meteo and OpenWeatherMap, with pre-computed flyability score (0–100) and acoustic range factor (0.40–1.20).

**Stable API:**
```typescript
provider.start(): Promise<void>
provider.stop(): Promise<void>
provider.getConditions(lat?: number, lon?: number): AtmosphericConditions | null

// Events:
provider.on('conditions_updated', (conditions: AtmosphericConditions) => void)
provider.on('flyability_changed', (from: FlyabilityTier, to: FlyabilityTier) => void)
```

**AtmosphericConditions guaranteed fields:**
- `flyabilityScore` — 0-100, always computed
- `flyabilityTier` — EXCELLENT / GOOD / MARGINAL / POOR / NO_FLY
- `acousticRangeFactor` — 0.40–1.20, adjusts sensor detection range
- `windSpeedMs`, `precipitationMm`, `visibilityM`, `temperatureC`

**W19 usage:** W19 threat scoring engine uses `acousticRangeFactor` to weight acoustic sensor confidence. In high-wind conditions (factor < 0.7), acoustic detection range is reduced; threat score from acoustic-only detections is discounted accordingly.

---

### 7. SecurityEventCorrelator

OSINT threat context from ACLED, FIRMS (wildfire), and GDELT. Each `SecurityEvent` has pre-computed proximity to nearest protected zone.

**Stable API:**
```typescript
correlator.start(): Promise<void>
correlator.stop(): Promise<void>
correlator.getEvents(): SecurityEvent[]
correlator.getEventsNearZone(zoneId: string, radiusM?: number): SecurityEvent[]
correlator.getOsintThreatLevel(): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

// Events:
correlator.on('security_event', (event: SecurityEvent) => void)
correlator.on('threat_level_change', (from: string, to: string) => void)
```

**W19 usage:** W19 ThreatScoringEngine weights AircraftState threat scores by `getOsintThreatLevel()`. If ACLED reports an active conflict event within 50km of a protected zone, the base threat score for unknown aircraft in that sector is elevated by +15 points.

---

### 8. EuDataIntegrationPipeline

The W18 orchestrator. W19 should instantiate `EuDataIntegrationPipeline` as the entry point and access sub-components via the public properties.

**Stable API:**
```typescript
pipeline.start(): Promise<void>
pipeline.stop(): Promise<void>
pipeline.getHealthReport(): PipelineHealthReport

// Sub-component access:
pipeline.registry
pipeline.infraLoader
pipeline.uasZoneLoader
pipeline.notamIngestor
pipeline.aircraftAggregator
pipeline.atmosphericProvider
pipeline.securityCorrelator

// Events forwarded from sub-components:
pipeline.on('zone_breach', ...)
pipeline.on('emergency', ...)
pipeline.on('security_threat', ...)
pipeline.on('health_changed', ...)
```

---

## What W19 Needs to Build

W19 — Romania/EU Threat Intelligence Layer — builds on top of W18 data feeds to produce threat assessments per aircraft per zone.

### W19-FR-01: EASA Category Classifier

Classify each `AircraftState` as Cat-A (commercial 250g–25kg), Cat-B (commercial >25kg), Cat-C (recreational), or Cat-D (unknown/unclassified) using heuristics on `AircraftState` features.

Classification inputs available from W18:
- `baroAltitudeM` — altitude profile
- `velocityMs` — speed (Cat-A commercial UAS: typically 10–25 m/s)
- `icao24` — ICAO24 lookup against Cat-A/B registries
- `squawk` — commercial operators typically squawk assigned code
- `positionSource` — ADS-B = registered, MLAT = likely unregistered
- `callsign` — commercial operators file ICAO callsign

```typescript
// W19 must implement:
export function classifyEasaCategory(aircraft: AircraftState): EasaCategory
type EasaCategory = 'A' | 'B' | 'C' | 'D'
```

### W19-FR-02: Protected Zone Breach Detector

Refine the W18 breach detection with threat context. W18 detects the breach; W19 assesses intent.

```typescript
// W19 must implement:
export function assessBreachThreat(params: {
  aircraft: AircraftState;
  breach: ZoneBreach;
  easaCategory: EasaCategory;
  atmosphericConditions: AtmosphericConditions;
  activeNotams: ParsedNotam[];
  osintThreatLevel: string;
}): ThreatAssessment

interface ThreatAssessment {
  aircraftId: string;
  zoneId: string;
  threatScore: number;          // 0-100
  awningLevel: AwningLevel;     // W10 existing enum
  confidence: number;           // 0.0-1.0
  contributingFactors: string[];
  recommendedAction: string;
}
```

### W19-FR-03: Threat Scoring Engine

Weighted combination of detection inputs → threat score.

Proposed weights (to be calibrated after 30 days):

```
threatScore =
  0.30 × zoneProximityScore        // distance decay from zone centre
+ 0.20 × categoryRiskScore         // Cat-D unknown > Cat-C recreational > Cat-A commercial
+ 0.15 × atmosphericScore          // high wind/low vis = drone less likely (but harder to detect)
+ 0.15 × osintContextScore         // ACLED/FIRMS/GDELT threat elevation
+ 0.10 × notamViolationScore       // flying in active TRA = +high
+ 0.10 × behavioralScore           // W7 BehavioralPatternAnalyzer (loitering, zigzag)
```

### W19-FR-04: AWNING Level Assignment per Zone

W10 built `AwningLevelCalculator` for the Ukraine simulation. W19 must recalibrate thresholds for Romania/EU context.

Current W10 AWNING levels (from W10 docs):
- WHITE: background, no threat
- YELLOW: anomaly detected, monitoring
- ORANGE: likely threat, investigation required
- RED: confirmed threat, response required

Recalibration required for Romania context:
- Cernavodă nuclear: RED threshold lower (critical infrastructure sensitivity)
- Military bases: shorter YELLOW→ORANGE escalation window (NATO Article 5 context)
- Commercial airports: coordinate with AACR Notam system before escalation

### W19-FR-05: GDPR-Compliant Track Anonymisation

For Cat-A commercial UAS (registered operators), GDPR Article 22 requires that automated decisions affecting operators are explainable and appealable.

W19 must implement:
```typescript
// Anonymise position data for Cat-A tracks after 15 minutes
// (operator remains identifiable only to AACR via secure lookup)
export function anonymiseCatATrack(track: AircraftState[]): AnonymisedTrack

interface AnonymisedTrack {
  pseudonymId: string;          // HMAC of icao24, rotation key per operator
  startZone: string;            // grid reference, not exact coords
  endZone: string;
  durationMinutes: number;
  maxAltFt: number;
  breachEvents: number;         // count only, no coordinates
}
```

Data retention: anonymised tracks retained 90 days. Raw tracks (with icao24) retained 24 hours for incident investigation, then deleted.

### W19-FR-06: Romanian AACR Notification Protocol

AACR = Autoritatea Aeronautică Civilă Română (Romanian Civil Aviation Authority).

When threat score crosses ORANGE threshold near a commercial airport, W19 must trigger an AACR notification. The notification format follows ICAO Doc 9574 (Manual on Unmanned Aircraft Systems) supplemented by AACR Order 8/2021.

```typescript
export interface AacrNotification {
  notificationId: string;           // UUID
  timestamp: Date;
  airportIcao: string;              // LROP, LRCL, etc.
  threatLevel: 'ADVISORY' | 'WARNING' | 'EMERGENCY';
  aircraftPseudonymId: string;      // anonymised for Cat-A
  detectionMethod: string[];        // 'ADS-B', 'ACOUSTIC', 'RF', etc.
  lastKnownPosition: {              // only if Cat-D (unregistered)
    latitude: number;
    longitude: number;
    altitudeFt: number;
  } | null;
  distanceToRunwayM: number;
  estimatedTimeToRunwayS: number | null;
  awningLevel: AwningLevel;
  recommendedAction: string;
}
```

AACR notification channel: initially email (smtp.aacr.ro) pending API access. W19 must implement email notification with AACR format. W21 adds direct API integration.

### W19-FR-07: ROMATSA Coordination Interface

ROMATSA (Romanian Air Traffic Services Administration) controls all IFR airspace in Romania. When a drone threat is detected that could affect ATC operations, ROMATSA must be notified via their NOTAM system.

W19 coordination:
1. W19 monitors for drone incursions within 10km of any active ATZ/CTR.
2. If threat persists > 60 seconds at ORANGE level: emit `romatsa_coordination_required` event.
3. W21 (Production UI) shows operator the ROMATSA hotline number and a pre-filled incident report.
4. W22 (direct integration, if ROMATSA API access granted): automated NOTAM request.

ROMATSA hotline: +40 21 208 3000 (Bucharest ACC)
ROMATSA email format for drone incidents: ops@romatsa.ro with subject `UAS INCIDENT REPORT [ICAO Location] [Date]`

---

## What W20 Builds (Operator Workflow)

W20 = Alert Acknowledgment Lifecycle & Incident Management.

W20 builds on W19 `ThreatAssessment` stream to implement:

**Alert lifecycle state machine:**
```
GENERATED → DISPATCHED → ACKNOWLEDGED → INVESTIGATING → RESOLVED | ESCALATED
```

**Escalation matrix (Romania context):**
```
Level 1: Sensor operator (APEX OS dashboard)
  → YELLOW alert, autonomous monitoring
  
Level 2: Site security officer
  → ORANGE alert, phone/WhatsApp notification
  → Maximum 5 minutes to acknowledge before Level 3
  
Level 3: AACR notification (automated via W19-FR-06)
  → ORANGE persistent (>2 min) at commercial airport
  → Automatic notification, not waiting for Level 2 ack
  
Level 4: ROMATSA coordination (via W19-FR-07)
  → ORANGE near active CTR/ATZ, aircraft in approach/departure corridor
  
Level 5: Romanian Police/Jandarmerie
  → RED alert, physical interdiction
  → W20 generates incident report for law enforcement
  
Level 6: SRI (Romanian Intelligence Service)
  → RED alert at military/nuclear site
  → Separate escalation channel, operator-initiated
```

**W20 must implement:**
- Alert acknowledgment with operator ID logging
- Incident report generator (Romanian + English)
- SLA timer: time-to-acknowledge per escalation level
- Post-incident analysis: time-to-resolve, false positive rate

**W20 must NOT implement:**
- Any direct drone interception or counter-UAS action
- Communication with Romanian military systems (classified, separate chain)
- Location tracking of operators (GDPR violation)

---

## What W21 Builds (Production UI)

W21 replaces the current Vercel demo with a full-featured operator dashboard.

**W21 scope:**
- Full-page Leaflet map with live aircraft overlay (ADS-B tracks from W18)
- Zone management interface: view/add/edit protected zones (DPIA-compliant)
- Live NOTAM overlay: active restrictions from W18 NotamIngestor as map polygons
- U-space zone overlay: EASA drone.rules.eu zones from W18 EasaUasZoneLoader
- Atmospheric conditions sidebar: flyability score + weather from W18 AtmosphericConditionProvider
- AWNING level dashboard: per-zone threat state from W19
- Alert queue: acknowledgment workflow from W20
- Multi-site view: operator managing multiple deployments

**W21 stack:**
- React + TypeScript (follow FFMS stack for reuse)
- Leaflet.js for mapping (not Google Maps — no geofencing API needed)
- Tailwind CSS
- WebSocket feed from W18 NATS subjects (server-sent events to browser)

**W21 must NOT:**
- Store raw aircraft positions in browser localStorage (GDPR)
- Log operator geolocation (GDPR)
- Display unconfirmed lat/lon of Cat-A commercial UAS (GDPR Art.22)

---

## NATS Subject Inventory (W18 additions, W19 consumers)

| Subject | Publisher | Payload | W19 Subscriber |
|---|---|---|---|
| `feed.eu.aircraft_update` | AircraftPositionAggregator | `AircraftState[]` | ThreatScoringEngine |
| `feed.eu.zone_breach` | AircraftPositionAggregator | `{aircraft, zones}` | ThreatAssessor |
| `feed.eu.emergency` | AircraftPositionAggregator | `AircraftState` | AlertDispatcher |
| `feed.eu.notam.activated` | NotamIngestor | `ParsedNotam` | ThreatContextEnricher |
| `feed.eu.notam.expired` | NotamIngestor | `ParsedNotam` | ThreatContextEnricher |
| `feed.eu.uas_zones.updated` | EasaUasZoneLoader | `UasZone[]` | ZoneViolationDetector |
| `feed.eu.atmosphere.updated` | AtmosphericConditionProvider | `AtmosphericConditions` | ThreatScoringEngine |
| `feed.eu.flyability.changed` | AtmosphericConditionProvider | `{from, to, conditions}` | OperatorAlert |
| `feed.eu.security_event` | SecurityEventCorrelator | `SecurityEvent` | ThreatContextEnricher |
| `feed.eu.threat_level_change` | SecurityEventCorrelator | `{from, to}` | ThreatScoringEngine |
| `feed.eu.feed_health` | EuDataIntegrationPipeline | `PipelineHealthReport` | SystemHealthDashboard |

---

## REST Endpoints Available After W18

These endpoints are available from the pipeline health server (`HEALTH_PORT`, default 9090):

```
GET /health           — PipelineHealthReport + overallStatus
GET /health/feeds     — per-feed FeedHealth[]
GET /health/aircraft  — aircraft count in bbox
GET /health/notams    — active NOTAM count
GET /health/atmosphere — flyability score (latest)
```

W19 registers additional endpoints on a separate port (default 9091) — do not merge with W18 health port.

---

## Known Limitations Passed to W19

1. **OpenSky anon quota:** 400 req/day. At 15-min cache: 96 req/day. Headroom is narrow. Register an OpenSky account and set `OPENSKY_USERNAME`/`OPENSKY_PASSWORD` before W19 testing.

2. **FAA NOTAM vs EAD:** W18 uses FAA NOTAM API (free, no auth) for Romanian airports. This works because LROP, LRCL etc are in FAA's global NOTAM database. However EAD (EUROCONTROL) has more complete LRBB FIR data. W19 should apply for EUROCONTROL EAD B2B access. Timeline: 4–6 weeks.

3. **EASA drone.rules.eu beta API:** Schema may change. W19 should add a CI check that GETs the zones endpoint and validates the response shape before any merge.

4. **ACLED researcher account:** W18 functions without ACLED (falls back to FIRMS + GDELT). W19 must obtain the ACLED researcher account. Application at acleddata.com/register — 2–5 day approval.

5. **ADS-B Exchange RapidAPI:** Optional in W18. The free tier exists but the paid tier unlocks military callsign lookup, which is important for W19 Cat-B classification. Budget: ~$10/month for the Micro tier.

6. **In-memory only:** All W18 data is lost on restart. W19 must make the architectural decision: persist to Supabase (requires DPIA sign-off from legal counsel) or accept ephemeral state (simpler, GDPR-safe). Recommendation: ephemeral for hackathon demo; Supabase persistence post-hackathon with DPIA.

7. **Single-location atmosphere:** W18 queries atmospheric conditions for Bucharest by default. W19 multi-sensor deployment needs `AtmosphericConditionProvider` extended to accept per-sensor-node location. Architecture: `Map<sensorNodeId, {lat, lon}>` → per-node conditions.

8. **16kHz vs 22050Hz pipeline (W17 known issue):** INDIGO team confirmed the target platform is 16kHz. The W17 SentinelAudioPipeline runs at 22050Hz. This is a data breach risk in the audio layer. W19 must fix before demo: add `resample: 22050 → 16000` step in the audio pipeline, or change the Vitest fixture sample rate.

---

## W18 Configurations W19 Must Not Break

```typescript
// Romania bounding box — do not change
const ROMANIA_BBOX = { latMin: 43.6, latMax: 48.3, lonMin: 20.2, lonMax: 30.0 };

// Hardcoded protected zones — never reduce; only add
// Minimum 8 zones must always be present in getZones()

// NATS subject prefix — additive only, never remove feed.eu.* subjects
// W9 ThreatContextEnricher and W10 AwningLevelCalculator subscribe to these

// Flyability score algorithm constants — calibrated for Romania climate
// Do not change without re-running all FR-W18-06 tests

// Circuit breaker cooldown = 60000ms — do not reduce (causes feed storm)
```

---

## W19 Kickoff Checklist

Before wave:init W19:

```
[ ] W18 has run in dev for >= 24h with no CRITICAL feed events
[ ] LKGC_TEMPLATE.md populated with real API response values from live run
[ ] npx vitest run → >= ~3199 tests GREEN
[ ] OpenSky registered account credentials set (OPENSKY_USERNAME/PASSWORD)
[ ] ACLED researcher application submitted
[ ] EAD B2B access application submitted (or documented as deferred)
[ ] W18 SESSION_STATE.md updated to COMPLETE
[ ] memory/MEMORY.md updated with W18 complete state
[ ] W19 DESIGN.md created — primary theme: Romania/EU Threat Intelligence
[ ] wave-formation.sh init W19 run
[ ] Telegram notification sent: "W18 HANDOFF → W19 initiated"
```

---

## Test Count Progression

| Wave | New Tests | Cumulative |
|---|---|---|
| W1–W17 | 3097 | 3097 |
| W18 | ~102 | ~3199 |
| W19 (target) | ~90 | ~3289 |
| W20 (target) | ~60 | ~3349 |
| W21 (target) | ~80 + Playwright | ~3429+ |
