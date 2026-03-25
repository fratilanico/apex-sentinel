# APEX-SENTINEL — ARCHITECTURE.md
## Wave 7: Hardware Integration Layer + Data Pipeline Rectification + Terminal Phase Detection
### Wave 7 | Project: APEX-SENTINEL | Version: 7.0.0
### Date: 2026-03-25 | Status: APPROVED
### Supabase: bymfcnwfyxuivinuzurr (eu-west-2 London)

---

## 1. SYSTEM OVERVIEW

W7 introduces the hardware effector layer above the existing W1–W6 detection stack. The architecture follows a strict separation of concerns: **sense → fuse → predict → respond**. W7 adds the respond layer and corrects the sense layer (16kHz migration).

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  LAYER 0: EDGE SENSOR NODES                                                          │
│                                                                                      │
│  ┌────────────────────┐  ┌────────────────────┐  ┌─────────────────────────────┐   │
│  │  Fixed Acoustic    │  │  Mobile Node       │  │  ELRS RF Monitor            │   │
│  │  Node (RPi 4)      │  │  (Phone/Ruggedized)│  │  (RTL-SDR 900MHz)           │   │
│  │  16kHz USB mic     │  │  16kHz + GPS       │  │  902–928 MHz scan           │   │
│  │  TFLite inference  │  │  + Compass         │  │  Packet rate + RSSI         │   │
│  │  NATS publish      │  │  → BearingReport   │  │  → ElrsLinkEvent            │   │
│  └────────┬───────────┘  └─────────┬──────────┘  └──────────┬──────────────────┘   │
│           │ sentinel.detections.>  │ sentinel.bearing.>      │ sentinel.rf.elrs.>   │
└───────────┼────────────────────────┼─────────────────────────┼──────────────────────┘
            │                        │                         │
            ▼                        ▼                         ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  LAYER 1: NATS JETSTREAM (Fortress / Gateway-01)                                     │
│                                                                                      │
│  Streams (W6 retained):              New W7 Streams:                                │
│    sentinel.detections.>               sentinel.bearing.>     (BearingReports)      │
│    sentinel.fusion.detections          sentinel.rf.elrs.>     (ELRS events)         │
│    sentinel.predictions.>             sentinel.terminal.>    (TerminalPhase FSM)    │
│    sentinel.risk.>                    sentinel.ptz.commands.> (PTZ command log)     │
│    sentinel.cot.>                     sentinel.jammer.commands (JammerActivation)   │
│    NODE_HEALTH                        sentinel.skynet.>       (SkyNet commands)     │
│                                       sentinel.dashboard.>    (Dashboard feed)      │
└──────────────────────────────────────┬───────────────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────────────┐
│  LAYER 2: SENTINEL PIPELINE (Fortress VM — systemd apex-sentinel-w7.service)         │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  SentinelPipeline.ts (W7 updated)                                           │   │
│  │                                                                              │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────────┐   │   │
│  │  │ MultiNodeFusion  │  │ KalmanTracker   │  │ MonteCarloPropagator     │   │   │
│  │  │ (W4 — retained) │  │ EKF (W5)        │  │ 95th pctile (W6)         │   │   │
│  │  └────────┬────────┘  └───────┬─────────┘  └────────────┬─────────────┘   │   │
│  │           │                   │                          │                 │   │
│  │  ┌────────▼───────────────────▼──────────────────────────▼─────────────┐  │   │
│  │  │  TdoaSolver (W7: dynamic NodeRegistry, no hardcoded 51.5/4.9)       │  │   │
│  │  │  + BearingTriangulator (W7 new) — Kalman-fused position output       │  │   │
│  │  └────────────────────────────────────┬──────────────────────────────────┘  │   │
│  │                                        │                                     │   │
│  │  ┌─────────────────────────────────────▼─────────────────────────────────┐  │   │
│  │  │  TerminalPhaseDetector (W7 new)                                       │  │   │
│  │  │  4-indicator FSM: SPEED | COURSE | ALTITUDE | RF_SILENCE              │  │   │
│  │  │  Publishes: sentinel.terminal.{trackId}                               │  │   │
│  │  └──────────────────────┬────────────────────────────────────────────────┘  │   │
│  └─────────────────────────┼──────────────────────────────────────────────────-┘   │
│                             │                                                        │
│  ┌──────────────────────────▼───────────────────────────────────────────────────┐   │
│  │  HARDWARE EFFECTOR LAYER (W7 new)                                           │   │
│  │                                                                              │   │
│  │  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────────────┐  │   │
│  │  │ PtzSlaveOutput  │  │ JammerActivation │  │ PhysicalInterceptCoord    │  │   │
│  │  │ ONVIF 100Hz     │  │ ELRS→900MHz jam  │  │ SkyNet net-gun            │  │   │
│  │  │ 6-8ms lookahead │  │ GPS→L1 jam       │  │ MonteCarlo 95th pctile    │  │   │
│  │  └────────┬────────┘  └────────┬─────────┘  └─────────────┬─────────────┘  │   │
│  └───────────┼────────────────────┼───────────────────────────┼────────────────┘   │
└──────────────┼────────────────────┼───────────────────────────┼──────────────────────┘
               │                    │                           │
               ▼                    ▼                           ▼
┌─────────────────────┐  ┌──────────────────────┐  ┌──────────────────────────────┐
│  Dahua PTZ Camera   │  │  RF Jammer Hardware  │  │  SkyNet Net-Gun Turret       │
│  ONVIF/SOAP TCP     │  │  REST or serial ctrl │  │  NATS command consumer       │
│  Dahua SD49425XB    │  │  902MHz or 1575MHz   │  │  Motor slew + fire actuator  │
└─────────────────────┘  └──────────────────────┘  └──────────────────────────────┘
               │                    │                           │
               ▼                    ▼                           ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  LAYER 3: DEMO DASHBOARD + ATAK CoT OUTPUT                                           │
│                                                                                      │
│  ┌──────────────────────────────────┐   ┌─────────────────────────────────────┐    │
│  │  Demo Dashboard (W7 new)         │   │  ATAK CoT (W6 retained)             │    │
│  │  React + Leaflet + WS 10Hz       │   │  CursorOfTruth → ATAK endpoint      │    │
│  │  Port 3001                       │   │  BRAVE1Format output                │    │
│  └──────────────────────────────────┘   └─────────────────────────────────────┘    │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  Supabase bymfcnwfyxuivinuzurr — persistent store                          │   │
│  │  W7 new tables: hardware_nodes, jammer_events, skynet_activations,          │   │
│  │                 terminal_phase_events, bearing_reports                      │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. DATA FLOW — DETECTION TO ENGAGEMENT

### 2.1 Complete Signal Path

```
Raw audio (16kHz, USB mic, RPi 4)
  │
  ▼ [AudioCapture — 2s ring buffer, 0.5s hop]
Float32Array[32000]
  │
  ▼ [VAD — energy threshold, ZCR gating]
Voiced segments only
  │
  ▼ [SpectrogramExtractor — n_fft=512, hop=160, n_mels=128, fmax=7800]
mel spectrogram [128, T_frames]
  │
  ▼ [YAMNet fine-tune head — W7 16kHz model]
ClassificationResult { class, confidence, embeddings[1024] }
  │
  ▼ [AcousticProfileLibrary.match() — two-tower: PistonClassifier | JetClassifier]
DroneDetection { droneClass, confidence, frequencyBands, temporalFeatures }
  │
  ▼ [FalsePositiveGuard — W6 retained, thresholds recalibrated for 16kHz]
DetectionEvent (suppressed or passed)
  │
  ▼ [NATS publish: sentinel.detections.{nodeId}]
                     │
   ┌─────────────────┼──────────────────────┐
   │                 │                      │
   ▼                 ▼                      ▼
[MultiNodeFusion]  [BearingTriangulator]  [TdoaSolver]
   │                 │                      │
   └─────────────────┴──────────────────────┘
                     │ Fused position (lat, lng, uncertainty)
                     ▼
           [KalmanTracker EKF]
           State vector: [lat, lng, alt, vx, vy, vz]
           Covariance matrix P
                     │
                     ▼
           [MonteCarloPropagator]
           10000 samples, 95th pctile trajectory envelope
                     │
                     ▼
           [TerminalPhaseDetector]
           4 indicators → FSM state
                     │
          ┌──────────┼──────────┐
          │          │          │
          ▼          ▼          ▼
    [PtzSlave]  [Jammer]  [SkyNet]
    ONVIF 100Hz  RF jam   Net-gun
          │          │          │
          └──────────┴──────────┘
                     │
                     ▼
           [Demo Dashboard WS]
           [ATAK CoT CursorOfTruth]
           [Supabase persistence]
```

### 2.2 Bearing Report Path (Mobile Nodes)

```
Phone field operator:
  GPS fix (lat, lng) → Compass heading (bearing_deg) → Acoustic detection (16kHz mic)
  │
  ▼ REST POST /api/v1/bearing-reports
  BearingReport { nodeId, lat, lng, bearing_deg, uncertainty_deg, t_unix_ms }
  │
  ▼ NATS publish: sentinel.bearing.{nodeId}
  │
  ▼ BearingTriangulator.addReport(report)
  (temporal gating: discard if age > 2s)
  │
  ▼ Solve: if N ≥ 2 recent reports → position fix
  PositionFix { lat, lng, uncertainty_1sigma_m }
  │
  ▼ Kalman fusion with TdoaSolver (if available)
  FusedPosition → KalmanTracker update
```

---

## 3. COMPONENT INVENTORY

### 3.1 Retained W1–W6 Components (unchanged or minor update)

| Component | Location | W7 Change |
|---|---|---|
| `AudioCapture` | `src/audio/AudioCapture.ts` | SAMPLE_RATE 22050→16000 |
| `SpectrogramExtractor` | `src/audio/SpectrogramExtractor.ts` | n_fft=512, hop=160, fmax=7800 |
| `YAMNetWrapper` | `src/ml/YAMNetWrapper.ts` | Load W7 16kHz model |
| `AcousticProfileLibrary` | `src/ml/AcousticProfileLibrary.ts` | Add 3 profiles + two-tower router |
| `FalsePositiveGuard` | `src/detection/FalsePositiveGuard.ts` | Recalibrate thresholds for 16kHz |
| `MultiNodeFusion` | `src/fusion/MultiNodeFusion.ts` | No change |
| `KalmanTracker` | `src/tracking/KalmanTracker.ts` | Add 3D state if altitude available |
| `MonteCarloPropagator` | `src/prediction/MonteCarloPropagator.ts` | No change |
| `TdoaSolver` | `src/tracking/TdoaSolver.ts` | Replace hardcoded coords with NodeRegistry |
| `CursorOfTruth` | `src/output/CursorOfTruth.ts` | No change |
| `SentinelPipeline` | `src/pipeline/SentinelPipeline.ts` | Wire all W7 components |
| `DatasetPipeline` | `src/ml/DatasetPipeline.ts` | 16kHz migration + resample shim |

### 3.2 New W7 Components

| Component | Location | Purpose | FRs |
|---|---|---|---|
| `TerminalPhaseDetector` | `src/detection/TerminalPhaseDetector.ts` | 4-indicator FSM for terminal dive | FR-W7-03 |
| `ElrsMonitor` | `src/rf/ElrsMonitor.ts` | ELRS 900MHz link monitoring | FR-W7-04 |
| `BearingTriangulator` | `src/tracking/BearingTriangulator.ts` | Least-squares bearing intersection | FR-W7-05 |
| `NodeRegistry` | `src/config/NodeRegistry.ts` | Hardware node coordinate store | FR-W7-09 |
| `PtzSlaveOutput` | `src/output/PtzSlaveOutput.ts` | Dahua ONVIF 100Hz bearing output | FR-W7-06 |
| `OnvifClient` | `src/output/OnvifClient.ts` | ONVIF SOAP client (HTTP Digest auth) | FR-W7-06 |
| `JammerActivation` | `src/countermeasures/JammerActivation.ts` | Drone class → RF jammer activation | FR-W7-07 |
| `PhysicalInterceptCoordinator` | `src/countermeasures/PhysicalInterceptCoordinator.ts` | SkyNet net-gun timing + command | FR-W7-08 |
| `DashboardServer` | `src/dashboard/DashboardServer.ts` | WebSocket server for demo UI | FR-W7-10 |
| `DashboardApp` | `src/dashboard/app/` | React + Leaflet UI | FR-W7-10 |

---

## 4. NATS JETSTREAM — W7 SUBJECT TAXONOMY

### 4.1 Complete Subject Map

```
sentinel.detections.{nodeId}          — raw acoustic detection per node (W1)
sentinel.fusion.detections            — multi-node fused detection (W4)
sentinel.predictions.{trackId}        — EKF position+velocity (W5)
sentinel.risk.{trackId}               — Monte Carlo heatmap (W6)
sentinel.cot.{trackId}                — ATAK CoT event (W6)
NODE_HEALTH                           — node heartbeat (W2)

NEW W7:
sentinel.bearing.{nodeId}             — BearingReport from mobile node
sentinel.rf.elrs.{nodeId}             — ELRS link status event
sentinel.terminal.{trackId}           — TerminalPhaseDetector FSM state change
sentinel.ptz.commands.{cameraId}      — PTZ command log (audit)
sentinel.ptz.bearing.{trackId}        — live bearing for PTZ (100Hz)
sentinel.jammer.commands              — jammer activation/deactivation commands
sentinel.jammer.status                — jammer hardware ACK / status
sentinel.skynet.preposition           — SkyNet pre-position command
sentinel.skynet.fire                  — SkyNet fire command
sentinel.skynet.status                — SkyNet hardware ACK / status
sentinel.dashboard.state              — aggregated state for dashboard WS (10Hz)
```

### 4.2 New JetStream Stream Definitions

```typescript
// W7 streams to create on NATS server startup

const W7_STREAMS = [
  {
    name: 'TERMINAL_PHASE',
    subjects: ['sentinel.terminal.>'],
    retention: 'limits',
    max_age: 86400e9,       // 24h in nanoseconds
    max_msgs: 100000,
    storage: 'file',
    replicas: 1,
  },
  {
    name: 'JAMMER_COMMANDS',
    subjects: ['sentinel.jammer.commands', 'sentinel.jammer.status'],
    retention: 'limits',
    max_age: 7 * 86400e9,   // 7 days — audit requirement
    max_msgs: 1000000,
    storage: 'file',
    replicas: 1,
  },
  {
    name: 'PTZ_BEARING',
    subjects: ['sentinel.ptz.bearing.>', 'sentinel.ptz.commands.>'],
    retention: 'limits',
    max_age: 3600e9,         // 1h — high volume, short retention
    max_msgs: 10000000,      // 100Hz × 3600s × 10 cameras
    storage: 'memory',       // high throughput → memory storage
    replicas: 1,
  },
  {
    name: 'SKYNET_ACTIVATION',
    subjects: ['sentinel.skynet.>'],
    retention: 'limits',
    max_age: 30 * 86400e9,  // 30 days — engagement audit trail
    max_msgs: 100000,
    storage: 'file',
    replicas: 1,
  },
  {
    name: 'BEARING_REPORTS',
    subjects: ['sentinel.bearing.>'],
    retention: 'limits',
    max_age: 3600e9,
    max_msgs: 1000000,
    storage: 'file',
    replicas: 1,
  },
];
```

---

## 5. BEARINGTRIANGULATOR — IMPLEMENTATION ARCHITECTURE

### 5.1 Class Interface

```typescript
export interface BearingReport {
  nodeId: string;
  lat: number;           // WGS-84 decimal degrees
  lng: number;
  bearing_deg: number;   // True north, 0–360
  uncertainty_deg: number; // 1σ bearing uncertainty
  t_unix_ms: number;
  acoustic_confidence: number; // [0,1] — weight in solver
}

export interface PositionFix {
  lat: number;
  lng: number;
  uncertainty_1sigma_m: number;
  contributing_nodes: string[];
  t_unix_ms: number;
  method: 'bearing_triangulation' | 'tdoa' | 'kalman_fused';
}

export class BearingTriangulator {
  private readonly MAX_REPORT_AGE_MS = 2000;
  private readonly reports: Map<string, BearingReport> = new Map();

  addReport(report: BearingReport): void;
  solve(): PositionFix | null;  // null if < 2 reports within age window

  // Internal: least-squares solver
  private buildSystem(reports: BearingReport[]): { A: number[][], b: number[] };
  private solveLS(A: number[][], b: number[]): [number, number]; // [lat, lng]
  private estimateUncertainty(reports: BearingReport[], fix: PositionFix): number;
}
```

### 5.2 Coordinate System Notes

Bearing triangulation operates in a local Cartesian approximation (equirectangular projection) valid for baselines < 100km. The conversion:

```
x_m = (lng - ref_lng) × cos(ref_lat × π/180) × 111320
y_m = (lat - ref_lat) × 110540

Solve in meters, convert back:
lat = ref_lat + y_m / 110540
lng = ref_lng + x_m / (111320 × cos(ref_lat × π/180))
```

Reference point: centroid of all reporting nodes (recalculated each solve call).

---

## 6. NODEREGISTRY — DEPENDENCY INJECTION ARCHITECTURE

### 6.1 The Problem (W6 Bug)

`TdoaSolver` and `SentinelPipeline` contain:
```typescript
// W6 — WRONG — hardcoded coordinates
const NODE_POSITIONS = {
  'node-alpha': { lat: 51.5, lng: 4.9 },
  'node-beta':  { lat: 51.502, lng: 4.905 },
};
```

This is a critical operational bug: the system produces incorrect TDOA solutions at any location other than the hardcoded test site.

### 6.2 NodeRegistry Architecture

```typescript
export interface HardwareNode {
  nodeId: string;
  lat: number;
  lng: number;
  alt_m: number;
  node_type: 'acoustic' | 'ptz' | 'radar' | 'jammer' | 'skynet' | 'mobile';
  capabilities: string[];   // e.g. ['16kHz', 'elrs_monitor']
  last_heartbeat: Date | null;
  online: boolean;
}

export class NodeRegistry {
  static async fromSupabase(supabaseUrl: string, serviceKey: string): Promise<NodeRegistry>;
  static fromFile(path: string): NodeRegistry;  // fallback

  getNode(nodeId: string): HardwareNode | undefined;
  getAcousticNodes(): HardwareNode[];
  getOnlineNodes(): HardwareNode[];
  all(): HardwareNode[];

  // Live update: called when NODE_HEALTH NATS message arrives
  updateHeartbeat(nodeId: string, t: Date): void;
}
```

### 6.3 Injection Pattern

```typescript
// SentinelPipeline.ts — W7 constructor
export class SentinelPipeline {
  constructor(
    private readonly nodeRegistry: NodeRegistry,  // injected
    private readonly nats: NatsConnection,
    private readonly supabase: SupabaseClient,
    private readonly config: PipelineConfig,
  ) {
    this.tdoaSolver = new TdoaSolver(nodeRegistry);
    this.bearingTriangulator = new BearingTriangulator();
    this.terminalDetector = new TerminalPhaseDetector(nodeRegistry);
    // ... other W7 components
  }
}
```

---

## 7. PTZSLAVEOUTPUT — ONVIF ARCHITECTURE

### 7.1 ONVIF Client Architecture

```
PtzSlaveOutput
  │
  ├── OnvifClient (persistent TCP, HTTP Digest auth)
  │     ├── AbsoluteMove (initial acquisition)
  │     └── ContinuousMove (100Hz tracking)
  │
  ├── BearingToOnvif converter
  │     ├── Geographic bearing (true north) → camera pan angle (mechanical)
  │     └── Elevation angle → camera tilt angle
  │
  └── LookaheadCompensator
        └── EKF state → predicted position at T + 115ms
```

### 7.2 Camera Coordinate Conversion

```typescript
// Convert geographic bearing (true north, 0–360°) to ONVIF normalized space (-1 to +1)
function bearingToOnvif(
  bearing_deg: number,    // True north bearing to target
  cam_heading_deg: number, // Camera mount heading (true north at 0°)
  pan_range_deg: number,   // Camera physical pan range (e.g. 360°)
): number {
  // Relative bearing from camera heading
  let rel = ((bearing_deg - cam_heading_deg + 360) % 360);
  if (rel > 180) rel -= 360;   // -180 to +180
  // Normalize to ONVIF space: -1.0 to +1.0
  return rel / (pan_range_deg / 2);
}
```

### 7.3 ONVIF Authentication (WS-Security)

Dahua requires HTTP Digest authentication OR ONVIF WS-Security (UsernameToken). Implementation uses WS-Security with nonce and timestamp to prevent replay attacks:

```typescript
// WS-Security header for ONVIF SOAP requests
function buildWSSecurity(username: string, password: string): string {
  const nonce = crypto.randomBytes(16).toString('base64');
  const created = new Date().toISOString();
  const digest = crypto.createHash('sha1')
    .update(Buffer.from(nonce, 'base64'))
    .update(Buffer.from(created))
    .update(Buffer.from(password))
    .digest('base64');
  return `<wsse:Security>
    <wsse:UsernameToken>
      <wsse:Username>${username}</wsse:Username>
      <wsse:Password Type="...#PasswordDigest">${digest}</wsse:Password>
      <wsse:Nonce EncodingType="...#Base64Binary">${nonce}</wsse:Nonce>
      <wsu:Created>${created}</wsu:Created>
    </wsse:UsernameToken>
  </wsse:Security>`;
}
```

---

## 8. TERMINALPHASEDETECTOR — INTERNAL ARCHITECTURE

### 8.1 Indicator Architecture

Each indicator is an independent module with the same interface:

```typescript
interface IndicatorModule {
  readonly name: TerminalIndicator;
  evaluate(state: TrackState, history: TrackState[]): IndicatorResult;
}

interface IndicatorResult {
  triggered: boolean;
  confidence: number;   // 0–1
  value: number;        // raw value (speed, angular rate, etc.)
  threshold: number;    // threshold that was applied
}
```

The FSM aggregates results from all active indicators per drone class:

```typescript
class TerminalPhaseDetector {
  private readonly indicators: Map<TerminalIndicator, IndicatorModule> = new Map([
    ['SPEED_INCREASE',      new SpeedIncreaseIndicator()],
    ['COURSE_CORRECTION',   new CourseCorrectionIndicator()],
    ['ALTITUDE_DESCENT',    new AltitudeDescentIndicator()],
    ['RF_SILENCE',          new RfSilenceIndicator(this.elrsMonitor)],
  ]);

  evaluate(track: Track): TerminalPhaseState {
    const applicable = this.getApplicableIndicators(track.droneClass);
    const results = applicable.map(ind => this.indicators.get(ind)!.evaluate(...));
    const triggered = results.filter(r => r.triggered).length;
    return this.fsm.transition(this.state, triggered, results);
  }
}
```

### 8.2 FSM Transition Table

```
Current State | Triggered Count | Duration Condition | Next State
──────────────────────────────────────────────────────────────────
CRUISE        | ≥ 1             | —                  | ALERT
ALERT         | 0               | clear ≥ 3s         | CRUISE
ALERT         | ≥ 3             | within 5s window   | TERMINAL
TERMINAL      | < 2             | —                  | ALERT
TERMINAL      | track lost      | —                  | IMPACT
IMPACT        | (terminal)      | —                  | (reset after 30s)
```

---

## 9. TWO-TOWER CLASSIFIER ARCHITECTURE

### 9.1 Design Rationale

Shahed-238 (jet) is acoustically orthogonal from all piston drones. A flat N-class softmax risks pathological confusion between Shahed-136 (piston, ~150Hz fundamental) and Shahed-238 (jet, broadband 2500–4500Hz spectral centroid). The two-tower approach routes audio to the appropriate specialist classifier before fine-grained class determination:

```
mel spectrogram [128, T]
  │
  ▼
[TowerRouter]
  Compute spectral centroid SC = Σ(f × mel[f]) / Σ(mel[f])
  │
  ├── SC < 1200Hz → PistonClassifier
  │     Classes: shahed-136, shahed-131, gerbera, fpv, lancet, background
  │     YAMNet fine-tune head: 6-class softmax
  │
  └── SC ≥ 1200Hz → JetClassifier
        Classes: shahed-238, helicopter, fixed-wing-jet, background
        YAMNet fine-tune head: 4-class softmax
```

The spectral centroid threshold of 1200Hz provides a >15× margin between the highest piston harmonic in our library (Gerbera 3rd harmonic ~650Hz) and the lowest expected Shahed-238 centroid (~2500Hz).

---

## 10. TECHNOLOGY STACK — W7 ADDITIONS

| Technology | Version | Purpose | Notes |
|---|---|---|---|
| TypeScript | 5.x (retained) | All new components | Strict mode enforced |
| Vitest | 1.x (retained) | Test framework | FR-named describe blocks |
| NATS.js | 2.x (retained) | Message bus | New stream configs |
| Supabase JS | 2.x (retained) | Persistence | New W7 tables |
| `node-soap` | 0.45+ | ONVIF SOAP client | For PtzSlaveOutput |
| `node-onvif` | 0.6+ | ONVIF discovery | Optional: device auto-discovery |
| React 18 | 18.x | Demo dashboard UI | Vite dev server |
| Leaflet | 1.9+ | Map component | GeoJSON track overlays |
| `ws` | 8.x | WebSocket server | Dashboard real-time feed |
| RTL-SDR driver | OS-level | ELRS 900MHz monitor | `rtl_power` CLI or node-rtlsdr |
| `ml-matrix` | 6.x | Least-squares solver | BearingTriangulator |

---

## 11. DEPLOYMENT TOPOLOGY — W7

```
fortress VM (94.176.2.48):
  systemd: apex-sentinel-w7.service
  Runs: SentinelPipeline (full stack W1–W7)
  Ports: 3001 (Demo Dashboard HTTP+WS)
  Outbound: ONVIF TCP to camera (LAN or VPN)
  Outbound: Jammer controller REST (LAN)
  Outbound: NATS JetStream (localhost or gateway-01)
  Outbound: Supabase HTTPS (bymfcnwfyxuivinuzurr.supabase.co)

RPi 4 acoustic nodes (field):
  systemd: apex-sentinel-edge.service
  Runs: edge-runner.ts (AudioCapture + inference only)
  Firmware: W7 (16kHz capture)
  Connectivity: NATS over cellular (mTLS)

Mobile bearing nodes (field phones):
  Browser PWA or Node.js CLI
  REST POST to fortress:3001/api/v1/bearing-reports
  Polls GPS + compass at 1Hz
  Runs TFLite inference locally (16kHz)

Dahua PTZ camera:
  LAN IP: configured in env ONVIF_CAMERA_URL
  Auth: env ONVIF_USERNAME / ONVIF_PASSWORD
  Protocol: ONVIF Profile S (PTZ control)

ELRS RF monitor:
  USB RTL-SDR on acoustic node or dedicated Pi
  902–928 MHz scan, reports to NATS via ElrsMonitor
```
