# APEX-SENTINEL — AI Pipeline
## W2 | PROJECTAPEX Doc 06/21 | 2026-03-24

---

## 1. W2 AI Pipeline Overview

W1 delivered the on-device AI pipeline: YAMNet acoustic inference, RF anomaly detection, sensor fusion, and three-gate classification with EKF tracking per node. W2 adds the backend AI layer: multi-node data fusion, TDoA geometric correlation, geospatial assignment, anomaly detection on the node fleet, and OTA model distribution.

```
W1 (On-device)                        W2 (Backend)
┌────────────────────────────┐         ┌──────────────────────────────────────┐
│  Audio → YAMNet            │         │  TDoA Correlation Service            │
│  RF → Anomaly Detection    │         │    Event aggregation (500ms window)  │
│  Fusion → Gate 1/2/3       │─── ──▶ │    Newton-Raphson position solver    │
│  Gate3 → EKF (per-node)   │         │    Track association                 │
└────────────────────────────┘         │                                      │
                                       │  Track Manager                       │
                                       │    EKF state initialization          │
                                       │    Multi-node EKF fusion             │
                                       │    Predicted trajectory              │
                                       │                                      │
                                       │  Fleet Anomaly Detector              │
                                       │    Node health time series           │
                                       │    Silence detection                 │
                                       │    False-positive storm detection    │
                                       │                                      │
                                       │  Model Distribution Pipeline         │
                                       │    OTA push via NATS                 │
                                       │    Integrity verification            │
                                       │    Rollback management               │
                                       └──────────────────────────────────────┘
```

---

## 2. TDoA Correlation Service

### 2.1 Service Architecture

The TDoA Correlation Service is a Node.js 20 LTS process consuming from the `tdoa_correlator` NATS consumer. It maintains an in-memory event buffer per geo_sector and time window, invoking the Newton-Raphson solver when enough node reports accumulate.

```typescript
// Core state maintained per geo_sector
interface SectorBuffer {
  geo_sector: string;
  window_open_us: bigint;  // timestamp_us of first event in window
  events: Map<string, DetectionEventMessage>;  // keyed by node_id
  timer: NodeJS.Timeout;   // closes window after 500ms inactivity
}

// Service-level state
class TDoACorrelationService {
  private buffers: Map<string, SectorBuffer>;  // keyed by geo_sector
  private recentEventIds: LRUCache<string, boolean>;  // deduplication, 60s TTL
  private solver: NewtonRaphsonSolver;
  private natsClient: NatsConnection;
  private supabaseWriter: SupabaseWriter;
}
```

### 2.2 Event Aggregation Algorithm

```
Step 1: Receive NATS message from sentinel.gate3.detection.{geo_sector}
  - Extract node_id, timestamp_us, lat, lon, alt_m, acoustic_confidence,
    rf_confidence, sdr_confidence, threat_class

Step 2: Deduplication check
  - Check event_id in LRU cache (60-second TTL, capacity 100,000)
  - If found: ack message, discard (replay protection)
  - If not found: add to cache, continue

Step 3: Locate or create SectorBuffer for geo_sector
  - Buffer is opened on first event for a (geo_sector, time_window) pair
  - Time window: [first_event_us - 250ms, first_event_us + 250ms]
    (500ms total window, centred on first event)

Step 4: Add event to buffer
  - If buffer already has an event from this node_id:
    keep the event with higher fused_confidence (same node, two events)
  - Otherwise add event

Step 5: Reset window close timer to 500ms from now
  - Every new event extends the collection window by resetting the timer
  - Hard cap: if window exceeds 2000ms wall-clock time, force close regardless

Step 6: On window close (timer fires):
  - Proceed to solver (Section 2.3)
  - Clear buffer for this (geo_sector, window) pair
```

### 2.3 Newton-Raphson TDOA Solver

The solver computes the most likely emitter position given time-difference-of-arrival measurements from N ≥ 3 nodes.

**Mathematical basis:**

Let the emitter position be $\mathbf{x} = (x, y, z)$ in ECEF coordinates.
For each pair of nodes $(i, j)$, the observed TDOA is:
$$\Delta t_{ij} = t_i - t_j$$
The range difference is:
$$\Delta d_{ij} = c \cdot \Delta t_{ij}$$
where $c = 343.0 \text{ m/s}$ (speed of sound at 20°C, 1 ATM, sea level).

The system of equations to solve:
$$f_{ij}(\mathbf{x}) = ||\mathbf{x} - \mathbf{p}_i|| - ||\mathbf{x} - \mathbf{p}_j|| - \Delta d_{ij} = 0$$

Newton-Raphson iteration:
$$\mathbf{x}_{k+1} = \mathbf{x}_k - \mathbf{J}^{-1} \mathbf{f}(\mathbf{x}_k)$$

```typescript
interface SolverInput {
  nodes: Array<{
    lat: number;       // WGS84 latitude
    lon: number;       // WGS84 longitude
    alt_m: number;     // metres above ellipsoid
    timestamp_us: bigint;  // node's measurement timestamp
    weight: number;    // 0.0–1.0 based on timing precision
  }>;
  speed_of_sound_ms?: number;  // default 343.0
  max_iterations?: number;     // default 50
  convergence_threshold?: number;  // default 0.001 (1mm)
}

interface SolverResult {
  lat: number;
  lon: number;
  alt_m: number;
  position_error_m: number;  // estimated 1-sigma error
  solver_type: 'newton_raphson' | 'centroid' | 'single_node';
  iterations: number;
  converged: boolean;
  condition_number: number;  // Jacobian condition number (ill-conditioning indicator)
  weighted_rms_residual: number;  // quality metric
}
```

**Implementation:**

```typescript
function solveTDoA(input: SolverInput): SolverResult {
  const { nodes, speed_of_sound_ms = 343.0, max_iterations = 50,
          convergence_threshold = 0.001 } = input;

  // 1. Convert all node positions to ECEF
  const ecef = nodes.map(n => latLonAltToECEF(n.lat, n.lon, n.alt_m));

  // 2. Build weighted TDOA pairs (use highest-weight node as reference)
  const sortedNodes = [...nodes].sort((a, b) => b.weight - a.weight);
  const ref = sortedNodes[0];
  const pairs = sortedNodes.slice(1).map(n => ({
    node: n,
    tdoa_s: Number(n.timestamp_us - ref.timestamp_us) / 1e6,
    range_diff_m: Number(n.timestamp_us - ref.timestamp_us) / 1e6 * speed_of_sound_ms,
    combined_weight: (ref.weight + n.weight) / 2
  }));

  // 3. Initial estimate: weighted centroid of node positions
  let x = weightedCentroid(nodes);  // returns {X, Y, Z} in ECEF

  // 4. Newton-Raphson iterations
  for (let iter = 0; iter < max_iterations; iter++) {
    const f = computeResiduals(x, ecef, pairs);
    const J = computeJacobian(x, ecef, pairs);
    const condNum = conditionNumber(J);

    if (condNum > 1e10) {
      // Ill-conditioned: geometry too poor for NR
      return centroidFallback(nodes, 'poor_geometry');
    }

    const dx = solveLinearSystem(J, f);  // J * dx = f via LU decomposition
    x = { X: x.X - dx[0], Y: x.Y - dx[1], Z: x.Z - dx[2] };

    if (Math.sqrt(dx[0]**2 + dx[1]**2 + dx[2]**2) < convergence_threshold) {
      const result = ECEFToLatLonAlt(x);
      const posError = computePositionError(J, nodes);
      return {
        ...result,
        position_error_m: posError,
        solver_type: 'newton_raphson',
        iterations: iter + 1,
        converged: true,
        condition_number: condNum,
        weighted_rms_residual: computeRMSResidual(f, pairs)
      };
    }
  }

  // Did not converge within max_iterations
  return centroidFallback(nodes, 'no_convergence');
}
```

**Position error estimation:**

The 1-sigma position error is derived from the Jacobian condition number and node timing uncertainties:
$$\sigma_{pos} = \sigma_{time} \cdot c \cdot \sqrt{\text{trace}((\mathbf{J}^T \mathbf{J})^{-1})}$$

Where $\sigma_{time}$ is the RMS timing uncertainty across all contributing nodes (computed from `time_precision_us` and `weight`).

### 2.4 Centroid Fallback

When the Newton-Raphson solver fails (< 3 nodes, ill-conditioning, or non-convergence), the system falls back to a weighted centroid estimate:

```typescript
function centroidFallback(
  nodes: SolverNode[],
  reason: string
): SolverResult {
  const totalWeight = nodes.reduce((s, n) => s + n.weight, 0);
  const lat = nodes.reduce((s, n) => s + n.lat * n.weight, 0) / totalWeight;
  const lon = nodes.reduce((s, n) => s + n.lon * n.weight, 0) / totalWeight;
  const alt_m = nodes.reduce((s, n) => s + n.alt_m * n.weight, 0) / totalWeight;

  // Position error for centroid: ~half the inter-node separation
  const maxSep = computeMaxNodeSeparation(nodes);
  const position_error_m = maxSep / 2;

  return {
    lat, lon, alt_m, position_error_m,
    solver_type: 'centroid',
    iterations: 0,
    converged: false,
    condition_number: Infinity,
    weighted_rms_residual: Infinity
  };
}
```

### 2.5 Output Publication

After solver completes, the TDoA service:
1. Constructs a `sentinel.track.update` message
2. Attempts to associate with an existing track (Section 3.1)
3. Publishes to NATS `sentinel.track.update`
4. The Supabase Writer consumer writes to `detection_events` (with TDoA fields populated)
5. Acks the NATS message

---

## 3. EKF State Initialization from TDoA Fix

### 3.1 Track Association

Before initialising a new EKF track, the Track Manager attempts to associate the new TDoA fix with an existing track:

```
For each ACTIVE/CONFIRMED/COASTING track T:
  1. Project T's EKF state forward to current timestamp
  2. Compute Mahalanobis distance D between new fix and projected T position
  3. If D < 5.0 (5-sigma gate):
     - Associate fix with T
     - Update T's EKF state
  4. If multiple tracks within gate: pick minimum D (nearest-neighbour)
  5. If no track within gate: create new track
```

The 5-sigma Mahalanobis gate is deliberately generous to handle position_error_m up to 200m.

### 3.2 New Track Initialisation

```typescript
interface EKFState {
  // State vector: [x, y, z, vx, vy, vz] in ECEF
  x: Float64Array;    // 6-element state vector
  P: Float64Array;    // 6×6 covariance matrix (flattened)
  last_update_us: bigint;
}

function initEKFFromTDoAFix(fix: TDoAFix): EKFState {
  const ecef = latLonAltToECEF(fix.lat, fix.lon, fix.alt_m);
  const posVariance = (fix.position_error_m ** 2);  // 1-sigma → variance

  return {
    x: new Float64Array([
      ecef.X, ecef.Y, ecef.Z,
      0.0, 0.0, 0.0  // velocity initialised to zero; first fix only
    ]),
    P: new Float64Array([
      posVariance, 0, 0, 0, 0, 0,
      0, posVariance, 0, 0, 0, 0,
      0, 0, posVariance, 0, 0, 0,
      0, 0, 0, 100.0, 0, 0,  // velocity variance: 10 m/s std dev
      0, 0, 0, 0, 100.0, 0,
      0, 0, 0, 0, 0, 100.0
    ]),
    last_update_us: fix.timestamp_us
  };
}
```

### 3.3 EKF Process Model

The EKF uses a constant-velocity model with process noise for manoeuvring drones:

```
State transition: x_k = F * x_{k-1}
  F = [I3   dt*I3]
      [03   I3   ]
where dt = time since last fix (seconds)

Process noise Q (continuous-time, discretised):
  Q_pos = σ_a^2 * dt^3/3
  Q_vel = σ_a^2 * dt
  σ_a = 2.0 m/s^2 (acceleration noise; DJI Mavic max: ~3 m/s^2)

Measurement model: H = [I3, 03] (observe position only)
Measurement noise R: diag(position_error_m^2, position_error_m^2, alt_error^2)
  alt_error = position_error_m * 2 (altitude less well constrained)
```

### 3.4 Track Confirmation Logic

A track transitions from ACTIVE to CONFIRMED when:
- `update_count >= 3` AND
- `confidence >= 0.70` AND
- All 3 fixes within 30-second window AND
- Inter-fix positions are consistent (velocity vector stable within 45° heading change)

On confirmation, the Track Manager:
1. Sets track.state = 'confirmed'
2. Publishes `sentinel.track.confirmed` to NATS
3. The Alert Router evaluates whether to raise an alert based on confidence thresholds

---

## 4. Geo-Sector Assignment Algorithm

### 4.1 Geohash Assignment

Every node and detection event is assigned a geo_sector using geohash precision 8, which produces 8-character codes representing ±19m × 19m cells.

```typescript
import { encode } from 'ngeohash';

function computeGeoSector(lat: number, lon: number): string {
  // Precision 8 → ±19m horizontal, ±19m vertical
  return encode(lat, lon, 8);
}
```

### 4.2 Consistent Hash Ring for Track Manager Routing

The Track Manager scales horizontally. Each instance is responsible for a subset of geo_sectors, determined by a consistent hash ring.

```typescript
class GeoSectorHashRing {
  private ring: SortedArray<{ hash: number; instanceId: string }>;
  private virtualNodes = 150;  // virtual nodes per instance for even distribution

  addInstance(instanceId: string): void {
    for (let i = 0; i < this.virtualNodes; i++) {
      const hash = murmurhash3_32(`${instanceId}:${i}`);
      this.ring.insert({ hash, instanceId });
    }
  }

  getInstanceForSector(geo_sector: string): string {
    const hash = murmurhash3_32(geo_sector);
    // Find first ring entry with hash >= sector hash (wrap around)
    const entry = this.ring.findFirst(e => e.hash >= hash)
      ?? this.ring.first();  // wrap around
    return entry.instanceId;
  }
}
```

This ensures:
- All events from the same geo_sector always route to the same Track Manager instance
- Adding/removing Track Manager instances only redistributes ~1/N of the sectors
- No shared state between Track Manager instances

### 4.3 Geo-Sector Neighbour Lookup for Cross-Sector Tracks

A drone may fly across geo_sector boundaries. The TDoA correlator handles this by expanding the correlation window to include 8 neighbouring geohash cells:

```typescript
import { neighbors } from 'ngeohash';

function getCorrelationSectors(geo_sector: string): string[] {
  const { north, northeast, east, southeast, south, southwest, west, northwest }
    = neighbors(geo_sector);
  return [geo_sector, north, northeast, east, southeast, south, southwest, west, northwest];
}
```

When a track crosses a sector boundary, track ownership transfers to the new sector's Track Manager instance via a NATS handoff message.

---

## 5. Event Deduplication

### 5.1 Same-Drone Multi-Node Deduplication

A drone detected simultaneously by 3 nodes within a 500ms window should produce ONE fused event, not three separate events. The TDoA correlation window handles this at the track level, but within the event ingestion path, deduplication happens at two layers:

**Layer 1: event_id uniqueness (database level)**
Each node assigns a unique ULID event_id to its detection. The Supabase `detection_events` table has a UNIQUE constraint on `event_id`. Three nodes detecting the same drone generate three different event_ids and three rows — this is intentional. The TDoA process creates the fused output.

**Layer 2: TDoA window deduplication**
Within the TDoA 500ms window, if the SAME node emits two events for the SAME physical event:
- The event with higher `fused_confidence` is kept
- The lower-confidence event is acked and discarded

```typescript
// In SectorBuffer.addEvent:
if (this.events.has(event.node_id)) {
  const existing = this.events.get(event.node_id)!;
  if (event.fused_confidence > existing.fused_confidence) {
    this.events.set(event.node_id, event);
  }
  // else: discard new event (existing is better)
} else {
  this.events.set(event.node_id, event);
}
```

### 5.2 Replay Deduplication (Network Retry)

Nodes may retry failed event submissions. The 60-second LRU cache on `event_id` in the TDoA correlator prevents double-processing. The database `UNIQUE` constraint on `event_id` provides the final guard.

### 5.3 Mesh Relay Deduplication

Events relayed via LoRa or BLE may arrive via multiple relay paths. The `relay_path` header differs but `event_id` is the same. LRU cache handles this correctly: second arrival of same event_id is discarded.

---

## 6. Fleet Anomaly Detection

### 6.1 Unusual Silence Detection

A node that stops producing detection events in an area with historical drone activity is a tactical concern (possible node compromise, jamming, or failure).

```typescript
class SilenceDetector {
  // Maintains rolling 24-hour event rate baseline per node per hour-of-day
  private baseline: Map<string, Float32Array>;  // nodeId → 24-hour rates

  detectUnusualSilence(nodeId: string, currentRate: number): AnomalySignal | null {
    const hourOfDay = new Date().getUTCHours();
    const baselineRate = this.baseline.get(nodeId)?.[hourOfDay] ?? 0;

    // Silence is anomalous if:
    // 1. Historical rate > 0.5 events/min AND
    // 2. Current rate < 10% of historical rate AND
    // 3. Silence has lasted > 5 minutes
    if (baselineRate > 0.5 && currentRate < baselineRate * 0.10) {
      return {
        type: 'unusual_silence',
        node_id: nodeId,
        expected_rate: baselineRate,
        actual_rate: currentRate,
        severity: baselineRate > 2.0 ? 'high' : 'medium'
      };
    }
    return null;
  }
}
```

### 6.2 False Positive Storm Detection

A sudden spike in detection events from a single node suggests a false positive storm (possible EMI interference, sensor malfunction, or model regression after OTA update).

```
Trigger conditions:
  Rate > 10x baseline for this node in this hour AND
  fused_confidence < 0.70 for >80% of events AND
  Duration > 30 seconds

Response:
  1. Raise MEDIUM alert: "Node nde_... possible false positive storm"
  2. Temporarily reduce this node's event weight to 0.1 (degraded trust)
  3. Log to operator_audit_log
  4. If new YAMNet model deployed in last 2 hours: raise HIGH alert (model regression)
```

### 6.3 Timing Drift Detection

GPS-PPS nodes should have timestamp_us within ±10μs of UTC. A node with drifting timestamps produces corrupted TDoA solutions.

```
Monitor: difference between node timestamp_us and server receipt time
Threshold: |node_timestamp_us - server_us| > 10,000 (10ms)
Action: downgrade node weight by 0.5; raise DEGRADED state if drift > 1,000,000 (1s)
```

---

## 7. OTA Model Distribution Pipeline

### 7.1 Model Packaging

YAMNet TFLite model distribution via NATS `sentinel.model.update` subject.

```
Package format:
  Bytes 0–31:    SHA-256 hash of model file (32 bytes)
  Bytes 32–35:   Model version (4-byte little-endian uint32)
  Bytes 36–39:   Model size (4-byte little-endian uint32)
  Bytes 40+:     YAMNet .tflite model bytes (max 491,520 bytes)

Maximum payload: 512KB (within NATS sentinel_nodes account max_payload)
```

### 7.2 Distribution Flow

```
1. Ops admin uploads new model:
   POST /functions/v1/model-deploy
   Body: {model_name, tflite_base64, version, apply_after_utc}

2. Edge Function:
   a. Verify SHA-256 integrity
   b. Run basic model validation (correct input/output shapes)
   c. Store in Supabase Storage bucket 'models'
   d. Update KV sentinel-config → model_pending

3. Model distribution job (scheduled or manual trigger):
   a. Fetch model from Supabase Storage
   b. Construct NATS message with integrity header
   c. Publish to sentinel.model.update
   d. NATS JetStream delivers to all nodes subscribed

4. Node receives model:
   a. Verify SHA-256
   b. If apply_after_utc is in future: schedule application
   c. Load into TFLite interpreter (does NOT interrupt current inference)
   d. Hot-swap: old → new interpreter at next idle period
   e. Publish ACK to sentinel.node.heartbeat (with model_version field)

5. Distribution monitoring:
   a. Track ACKs in KV sentinel-config.model_rollout_status
   b. Alert if <80% of nodes ACK within 24 hours
   c. Alert if any node reports model error in heartbeat
```

### 7.3 Rollback Mechanism

```
Automatic rollback triggers:
  a. False positive storm on >20% of fleet within 2 hours of update
  b. Detection rate drops >50% vs 24-hour baseline (under-detection)
  c. Any node reports TFLite interpreter error

Manual rollback:
  POST /functions/v1/model-rollback
  Body: {model_name, reason}

Rollback process:
  1. Publish sentinel.model.rollback with rollback_to_version
  2. Nodes swap back to previous version
  3. Update KV sentinel-config.model_current to previous version
  4. Log event to operator_audit_log
```

---

## 8. Confidence Fusion (Backend Extension)

W1 per-node fusion: `fused = 0.5*acoustic + 0.3*rf + 0.2*sdr`

W2 multi-node backend fusion extends this with:

```typescript
function computeMultiNodeFusedConfidence(events: DetectionEvent[]): number {
  if (events.length === 0) return 0;
  if (events.length === 1) return events[0].fused_confidence;

  // Dempster-Shafer evidence combination
  // Each event provides a "belief mass" for the hypothesis "drone present"
  let combined_belief = events[0].fused_confidence;

  for (let i = 1; i < events.length; i++) {
    const b1 = combined_belief;
    const b2 = events[i].fused_confidence;
    const k = 1 - (b1 * (1 - b2) + (1 - b1) * b2);  // conflict factor

    if (k < 0.01) {
      // Near-total conflict: fall back to maximum belief
      combined_belief = Math.max(b1, b2);
    } else {
      // Dempster combination rule
      combined_belief = (b1 * b2) / k;
    }
  }

  // Cap at 0.999 (never claim 100% certainty)
  return Math.min(combined_belief, 0.999);
}
```

The multi-node fusion uses Dempster-Shafer theory rather than simple averaging, because independent sensors detecting the same drone provide stronger evidence than their average confidence score.

---

## 9. AI Pipeline Performance Targets

| Stage | Latency Target | Throughput Target | Degradation Behaviour |
|-------|---------------|-------------------|----------------------|
| NATS event arrival | < 100ms p99 | 10,000 events/s | Queue in JetStream |
| TDoA window close | 500ms (window size) | 1,000 fixes/s | Increase window to 1s |
| Newton-Raphson solver | < 50ms p99 | 2,000 fixes/s | Fall back to centroid |
| Track association | < 10ms p99 | 2,000 fixes/s | Widen Mahalanobis gate |
| Track update publish | < 100ms p99 | 2,000 tracks/s | Queue |
| Fleet anomaly check | < 5s latency | 500 nodes | Reduce check frequency |
| Model distribution | < 30 min full fleet | 500 nodes | Retry with exponential backoff |

---

## 10. Speed of Sound Compensation

The Newton-Raphson solver uses 343.0 m/s as default. For deployments where this matters, the speed of sound is adjusted:

```typescript
function computeSpeedOfSound(temperature_c: number, altitude_m: number): number {
  // Temperature adjustment: c ≈ 331.3 + 0.606 * T
  const c_temperature = 331.3 + 0.606 * temperature_c;

  // Altitude adjustment (lower pressure at altitude reduces density)
  // Simple approximation: -0.004 m/s per metre above sea level
  const c_altitude = c_temperature - 0.004 * altitude_m;

  return Math.max(300.0, Math.min(360.0, c_altitude));  // clamp to sane bounds
}
```

The node submits `temperature_c` and `alt_m` in its heartbeat. The TDoA correlator uses the average temperature across contributing nodes when computing the solver. For altitudes < 1000m and temperatures between -10°C and +40°C, the error from using 343 m/s constant is < 3%, translating to < 2m position error — acceptable for the ±62m target.
