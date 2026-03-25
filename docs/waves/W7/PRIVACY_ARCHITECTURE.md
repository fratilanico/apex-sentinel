# APEX-SENTINEL W7 — Privacy Architecture

> Wave: W7 — Hardware Integration Layer + Data Pipeline Rectification + Terminal Phase Detection
> Last updated: 2026-03-25
> Status: PLANNING
> Jurisdiction: Romania (EU GDPR + Law 59/2019 + Law 51/1991 national security)

---

## 1. Overview

W7 introduces six new components that touch personal data or privacy-sensitive information:

1. **Mobile node GPS** — observer phones broadcast position for BearingTriangulator
2. **BearingTriangulator** — fuses bearing + position data from multiple observers
3. **ELRS RF Module** — captures RF energy patterns in civilian spectrum (868–928 MHz)
4. **JammerActivation** — affects civilian and military communications infrastructure
5. **PtzSlaveOutput** — ONVIF PTZ camera control potentially capturing imagery
6. **Demo Dashboard** — React/Next.js interface exposing live track data to operators

Each component is analysed for data minimization, legal basis, retention, and GDPR compliance. The foundational principle across all W7 components: **process the minimum data necessary for the military mission, retain nothing beyond operational necessity, apply ±50m coarsening to all civilian location data before any NATS publish.**

---

## 2. Legal Framework

### 2.1 GDPR (EU 2016/679)

Romania is an EU member state. GDPR applies to all processing of personal data.

Applicable provisions:
- Article 5(1)(b): Purpose limitation — C-UAS data collected only for threat detection
- Article 5(1)(c): Data minimization — no more than necessary
- Article 5(1)(e): Storage limitation — no indefinite retention
- Article 6(1)(d): Vital interests — emergency safety basis for real-time processing
- Article 9(2)(g): Public interest — national security processing

### 2.2 Law 59/2019 (Critical Infrastructure Protection)

Romania's Law 59/2019 implements EU Directive 2008/114/EC on critical infrastructure protection. It grants operators of critical infrastructure the authority to deploy protective measures including electromagnetic monitoring within designated protection zones.

Key provisions for APEX-SENTINEL:
- Article 8: Infrastructure operators may deploy detection systems within perimeter
- Article 12: Incident data must be reported to STS (Special Telecommunications Service) within 2 hours
- Article 15: Data retention for security incidents: minimum 5 years (operational records only, not personal data)

### 2.3 Law 51/1991 (National Security)

Authorizes signals intelligence and electronic monitoring activities by designated authorities. APEX-SENTINEL does not claim authority under this law — it is a passive detection system, not an intelligence collection system. Jamming (JammerActivation) must be authorized by ANCOM (Romanian National Authority for Management and Regulation in Communications) under Law 245/2002.

### 2.4 ANCOM Regulations (RF Jamming)

Under Romanian law, operation of radio jammers is prohibited except:
- Military operations under MoD authorization (Ministerul Apărării Naționale)
- Critical infrastructure protection under SRI/STS authorization
- Testing under ANCOM experimental license

The JammerActivation module must not be deployed without written authorization. The software includes an authorization token check before any jamming command is issued.

---

## 3. Mobile Node GPS — Location Coarsening

### 3.1 Privacy Risk

Observer phone GPS provides sub-5m accuracy. Publishing exact phone positions to NATS exposes:
- Precise location of field personnel (personal data under GDPR — location = personal data when linkable to a person)
- Personnel deployment patterns over time
- Individual movement routes if aggregated

### 3.2 Coarsening Specification

Identical to W4 node coarsening — ±50m Gaussian noise added before NATS publish. This is the minimum coarsening that preserves BearingTriangulator accuracy at 1km+ range while preventing sub-meter tracking.

```typescript
interface MobileNodePositionReport {
  nodeId: string;                   // pseudonymous ID — NOT phone IMEI or account ID
  // Raw GPS (NEVER published to NATS):
  // rawLat: number;
  // rawLon: number;
  // Coarsened position (published):
  coarsenedLat: number;             // rawLat + Gaussian(0, 50m / 111320)
  coarsenedLon: number;             // rawLon + Gaussian(0, 50m / (111320 * cos(lat)))
  coarseningApplied: true;          // mandatory field — must always be true
  accuracyMeters: 50;               // published accuracy claim = coarsening radius
  timestamp: number;                // Unix ms — truncated to nearest 1000ms
  bearing: number;                  // bearing to target in degrees (derived, not position)
  bearingAccuracy: number;          // degrees ± uncertainty
}
```

The `rawLat` and `rawLon` fields are computed in-process and NEVER written to disk, never published to NATS, and never logged.

### 3.3 Pseudonymous Node IDs

Observer identities are not stored. Each node session generates a UUID at startup:

```typescript
function generateNodeSessionId(): string {
  // UUID v4 — no link to phone ID, account, or SIM
  return crypto.randomUUID();
}
```

Node session ID resets on every app restart. The system cannot correlate node sessions across days.

### 3.4 Position Data Retention

- In-memory: 5-minute rolling buffer (for BearingTriangulator history)
- Supabase: position reports NOT stored. Only bearing reports stored.
- NATS: messages expire after 60 seconds (JetStream max-age)

---

## 4. BearingTriangulator — Data Minimization

### 4.1 What BearingTriangulator Receives

Input to BearingTriangulator from each observer node:

```typescript
interface BearingReport {
  observerPosition: CoarsenedPosition;  // ±50m — see §3
  bearing_degrees: number;
  bearingUncertainty_degrees: number;
  timestamp: number;
  targetElevation_degrees?: number;     // optional — acoustic elevation estimate
  signalStrength_db?: number;           // optional — relative acoustic amplitude
}
```

Critically absent from BearingReport:
- Observer identity (no name, no phone ID, no account)
- Exact observer position (coarsened to ±50m)
- Observer movement history

### 4.2 Output from BearingTriangulator

```typescript
interface TriangulationResult {
  estimatedPosition: CoarsenedPosition; // coarsened again to ±25m (drone position, not human)
  positionUncertaintyMeters: number;
  confidenceScore: number;
  observerCount: number;                // how many nodes contributed
  // NOT included: which nodes, which positions, which bearings individually
  timestamp: number;
}
```

The output strips all individual observer data. The triangulated drone position is NOT personal data.

### 4.3 Least-Squares Computation in Memory

The least-squares bearing intersection computation runs entirely in RAM. Intermediate matrices (observer positions, bearing vectors) are discarded immediately after the result is computed. The garbage collector is the sole retention mechanism — no explicit logging of intermediate values.

---

## 5. ELRS RF Module — Spectrum Monitoring

### 5.1 Privacy Risk Assessment

The 868–928 MHz band is shared. APEX-SENTINEL RF monitoring may incidentally capture:
- Legitimate ELRS drone hobbyist traffic (non-threat)
- LoRaWAN IoT device transmissions (smart meters, agriculture sensors)
- SigFox IoT traffic
- Remote keyless entry systems (some operate in 868 MHz in Europe)

### 5.2 Data Minimization Design

The RF module captures only:
- Aggregate power spectral density (PSD) in 1MHz bins across 868–928 MHz
- Burst timing (is there a burst? how long?)
- Estimated hop count

The RF module does NOT:
- Demodulate any signal
- Capture packet content
- Capture device identifiers (LoRa DevEUI, etc.)
- Record raw RF time-domain samples to disk

```typescript
interface RFSurveillanceScope {
  captureRawSamples: false;         // NEVER — privacy + storage constraint
  demodulateContent: false;         // NEVER — no legal basis
  captureDeviceIdentifiers: false;  // NEVER
  capturePSD: true;                 // aggregate power only — lowest privacy risk
  captureBurstTiming: true;         // burst present/absent/duration
  retainPSDHistorySeconds: 30;      // rolling window, in-memory only
}
```

### 5.3 RF Data Retention

| Data Type | Retention | Storage |
|---|---|---|
| Raw PSD sweep | 30 seconds rolling | RAM only |
| Burst detection events | 5 minutes | RAM only |
| ELRS classification result | With threat event record | Supabase (event-linked) |
| RF silence duration | With threat event record | Supabase (event-linked) |
| Non-threat RF events | NOT retained | Discarded |

RF data is only persisted when linked to an active threat detection event. Standalone RF observations with no acoustic/kinematic corroboration are discarded.

### 5.4 Legal Basis for RF Monitoring

Romanian Law 245/2002 and ANCOM Decision 1273/2009 permit passive spectrum monitoring (receive-only) without license for:
- Radio spectrum management purposes
- Security research
- Critical infrastructure protection

APEX-SENTINEL RF module is receive-only (passive) for detection. Jamming (transmit) is handled separately under JammerActivation (§7).

---

## 6. PtzSlaveOutput — Camera Imagery

### 6.1 Privacy Risk

ONVIF PTZ cameras pointed at sky can incidentally capture:
- Building facades (partial)
- Ground areas near installation perimeter
- In theory: faces or identifiable persons if pointed near ground level

### 6.2 Design Constraints

APEX-SENTINEL does NOT:
- Capture, store, or transmit camera imagery
- Perform any image processing
- Use camera feed for detection decisions

PtzSlaveOutput sends only PTZ control commands (pan/tilt/zoom angles). The camera video feed is entirely outside APEX-SENTINEL's data boundary.

```typescript
interface PtzControlMessage {
  type: 'PTZ_COMMAND';
  panDegrees: number;
  tiltDegrees: number;
  zoomFactor: number;               // typically 1.0 — no zoom for sky tracking
  timestamp: number;
  // NOT included: any image data, any pixel data, any video stream reference
}
```

### 6.3 Camera Video Retention Policy

The camera system (external ONVIF device) operates under the deploying organization's own CCTV policy. APEX-SENTINEL's integration documentation requires:
- Video retention ≤ 72 hours (GDPR Article 5(1)(e) storage limitation)
- Access logs for any video retrieval
- No facial recognition processing on sky-facing cameras

This is documented in the deployment checklist as a pre-deployment operator attestation.

### 6.4 PTZ Command Logging

PTZ commands (pan/tilt angles) are NOT personal data. They are logged for:
- System debugging (detect jitter, confirm command delivery)
- Performance analysis (latency between EKF update and PTZ response)

Retention: 24 hours in Supabase, then deleted by scheduled job.

---

## 7. JammerActivation — Countermeasure Privacy

### 7.1 Privacy Risks of Jamming

Jamming affects the electromagnetic environment. Privacy considerations:
- GPS jamming (1575 MHz) disrupts location services for civilians in the area
- 900 MHz jamming affects FPV drones but also legitimate 900 MHz users (LoRaWAN, SigFox, some IoT)
- Jammer activation is a significant action with collateral effects

### 7.2 Authorization Token Gate

```typescript
interface JammerAuthorizationToken {
  issuedBy: string;                 // 'MApN' (Ministry of Defense) or 'SRI' or 'ANCOM'
  authorizationNumber: string;      // Official authorization document reference
  validFrom: Date;
  validUntil: Date;
  permittedFrequencies: number[];   // Hz — only these may be jammed
  permittedZone: GeographicBoundary;
  signature: string;                // cryptographic signature from issuing authority
}
```

A JammerActivation command is rejected if:
- No valid authorization token is loaded
- Token is expired
- Threat position is outside the permitted zone
- Frequency requested is not in permitted list

### 7.3 Jammer Activation Log

Every jammer activation is logged with:
- Timestamp (UTC)
- Duration (ms)
- Frequency channel activated
- Threat track ID that triggered activation
- Confidence score at time of activation
- Authorization token reference

Civilian location is NOT logged. The log records the drone position, not any person's position.

Retention: 5 years (Law 59/2019 Article 15 requirement for security incident records).

### 7.4 False Positive Gate

Jammer hardware is only armed when:
1. Acoustic confidence ≥ 0.85
2. TerminalPhaseDetector state = TERMINAL_CONFIRMED
3. Authorization token valid
4. Operator confirms (manual confirmation, not autonomous)

No autonomous jamming without operator confirmation. This is an absolute constraint, not configurable.

---

## 8. Demo Dashboard — Operator Authentication

### 8.1 What the Dashboard Exposes

The W7 demo dashboard (React/Next.js) displays:
- Live drone tracks (position, velocity, classification)
- Alert log (historical detections)
- Heatmap of historical threat density
- Node positions (coarsened ±50m)

### 8.2 Authentication Requirements

```typescript
interface DashboardAuthConfig {
  provider: 'supabase-auth';
  mfaRequired: true;                // TOTP mandatory for all operator accounts
  sessionDurationHours: 8;          // operator shift length
  allowedRoles: ['operator', 'supervisor', 'readonly'];
  ipRestriction: true;              // allowlist: command center IP ranges only
  auditLog: true;                   // log all dashboard access with timestamp + IP
}
```

The demo dashboard used at the Radisson meeting uses a separate read-only presentation account. This account has no access to export data, no access to node positions, and displays anonymized tracks (no classification labels visible to non-authorized audience).

### 8.3 Heatmap Data — Aggregation Before Display

The threat density heatmap uses aggregated historical data only:
- Grid resolution: 500m × 500m cells
- Minimum count threshold: 3 events per cell before cell is colored (k-anonymity equivalent)
- No individual event coordinates displayed on heatmap

Live tracks on the dashboard are not historical. They display current tracks in real time, coarsened to ±25m for display purposes (25m is adequate for operator situational awareness at screen scale).

### 8.4 Data Minimization for Dispatch Center Integration

When SentinelPipeline outputs a threat event to external dispatch center:

```typescript
interface DispatchCenterPayload {
  threatId: string;                 // UUID — no link to acoustic raw data
  classificationLabel: string;      // e.g., 'shahed-136'
  confidence: number;
  estimatedImpactZone: GeographicBoundary;  // coarsened — ±100m for dispatch
  recommendedAction: string;        // 'EVACUATE_200M' | 'ACTIVATE_JAMMER' | 'TRACK_ONLY'
  terminalPhase: boolean;
  timeToImpactSeconds: number | null;
  // NOT included: raw audio, RF data, exact node positions, model embeddings
}
```

The dispatch payload is the minimum required for the receiving operator to act. All raw sensor data stays within APEX-SENTINEL's boundary.

---

## 9. Supabase — W7 New Tables

### 9.1 Table: `bearing_reports`

```sql
CREATE TABLE bearing_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL,          -- node session ID (pseudonymous)
  bearing_deg  FLOAT NOT NULL,
  uncertainty  FLOAT NOT NULL,
  coarsened_lat FLOAT NOT NULL,
  coarsened_lon FLOAT NOT NULL,
  threat_id    UUID REFERENCES threat_events(id),
  created_at   TIMESTAMPTZ DEFAULT now()
);
-- RLS: service role only
-- Retention: 7 days (operational window), then delete
```

No `observer_name`, no `phone_id`, no `account_id` columns — these fields do not exist by design.

### 9.2 Table: `jammer_activations`

```sql
CREATE TABLE jammer_activations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threat_id       UUID REFERENCES threat_events(id),
  frequency_hz    INTEGER NOT NULL,
  duration_ms     INTEGER NOT NULL,
  confidence      FLOAT NOT NULL,
  auth_token_ref  TEXT NOT NULL,
  operator_id     UUID NOT NULL,
  activated_at    TIMESTAMPTZ DEFAULT now(),
  deactivated_at  TIMESTAMPTZ
);
-- Retention: 5 years (Law 59/2019)
-- No civilian location data in this table
```

### 9.3 Table: `ptz_commands`

```sql
CREATE TABLE ptz_commands (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pan_deg     FLOAT NOT NULL,
  tilt_deg    FLOAT NOT NULL,
  zoom        FLOAT DEFAULT 1.0,
  threat_id   UUID REFERENCES threat_events(id),
  latency_ms  INTEGER,
  created_at  TIMESTAMPTZ DEFAULT now()
);
-- Retention: 24 hours (DELETE WHERE created_at < now() - interval '24 hours')
-- No imagery, no video references
```

---

## 10. DPIA Summary (Data Protection Impact Assessment)

Under GDPR Article 35, a DPIA is required for systematic monitoring that could significantly affect individuals. The W7 components that require DPIA coverage:

| Component | DPIA Required | Risk Level | Mitigation |
|---|---|---|---|
| Mobile node GPS | Yes | Medium | ±50m coarsening, pseudonymous IDs |
| BearingTriangulator | Yes | Low | Individual data stripped from output |
| ELRS RF Module | Yes | Medium | No demodulation, aggregate PSD only |
| JammerActivation | Yes | High | Auth token gate, manual confirmation required |
| PtzSlaveOutput | No | Low | No imagery processed by APEX-SENTINEL |
| Demo Dashboard | Yes | Medium | MFA, IP restriction, anonymized demo mode |

DPIA documentation to be completed by the DPO (Data Protection Officer) before W7 production deployment. This document provides the technical evidence base for the DPIA.

---

## 11. Privacy by Default — W7 Implementation Checklist

Before W7 goes to production, each item must be verified:

- [ ] Mobile node app: raw GPS never written to disk or network
- [ ] Mobile node app: session ID reset on every restart
- [ ] BearingTriangulator: bearing report output strips observer PII fields
- [ ] NATS publisher: position coarsening function unit tested (verify ±50m spread)
- [ ] RF Module: raw time-domain samples never written to disk
- [ ] RF Module: no demodulation code present (code review gate)
- [ ] JammerActivation: auth token check cannot be bypassed (unit tested negative path)
- [ ] JammerActivation: manual operator confirmation required (integration tested)
- [ ] PtzSlaveOutput: no image capture code present (code review gate)
- [ ] Dashboard: demo mode anonymizes tracks and removes classification labels
- [ ] Dashboard: MFA enforced (cannot be disabled without code change)
- [ ] Supabase: no table contains `phone_id`, `imei`, `account_id`, `real_name` columns
- [ ] Supabase: retention delete jobs scheduled and tested
- [ ] Dispatch payload: PII audit — verify no raw sensor data in payload schema

---

*End of PRIVACY_ARCHITECTURE.md — W7*
