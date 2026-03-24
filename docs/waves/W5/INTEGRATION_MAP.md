# APEX-SENTINEL W5 — INTEGRATION MAP
## W5 | PROJECTAPEX Doc 19/20 (alt) | 2026-03-24

> Wave: W5 — EKF + LSTM Trajectory Prediction (Gate 4)
> Supabase: bymfcnwfyxuivinuzurr (eu-west-2)

---

## System Integration Overview

The EKF microservice is a consumer-only node in the APEX-SENTINEL data flow.
It has exactly 2 NATS subscriptions (input), 1 NATS publish path (output),
and 1 Supabase write path. It exposes no inbound network ports except the
localhost health check (:9090).

---

## Integration Topology Diagram

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ACOUSTIC SENSOR LAYER (smartphones)                                     ║
║                                                                          ║
║  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  ║
║  │  Node A      │  │  Node B      │  │  Node C      │   (≥3 required)  ║
║  │  Android     │  │  iOS         │  │  Android     │                   ║
║  │  YAMNet INT8 │  │  YAMNet INT8 │  │  YAMNet INT8 │                   ║
║  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                  ║
║         │                 │                 │                            ║
║  sentinel.detections.raw.{nodeId} via NATS.ws (WebSocket)               ║
╚═════════╪═════════════════╪═════════════════╪═════════════════════════════╝
          │                 │                 │
          └────────┬────────┘
                   ▼
╔══════════════════════════════════════════════════════════════════════════╗
║  FORTRESS VM — NATS JetStream Cluster (5 nodes)                          ║
║                                                                          ║
║  Streams: SENTINEL, NODE_HEALTH, ALERTS                                  ║
║  ┌─────────────────────────────────────────────────────────────────────┐ ║
║  │  Stream: SENTINEL                                                   │ ║
║  │  Subjects: sentinel.detections.raw.*                                │ ║
║  │            sentinel.detections.correlated                           │ ║
║  │            sentinel.predictions.*                                   │ ║
║  │            sentinel.alerts.*                                        │ ║
║  │            sentinel.cot.events                                      │ ║
║  │            sentinel.tracks.dropped.*                                │ ║
║  └─────────────────────────────────────────────────────────────────────┘ ║
╚═════════════════════════════════════════════════════════════════════════╝
          │
          │  [pull consumer: tdoa-correlator]
          ▼
╔══════════════════════════════════════════════════════════════════════════╗
║  TdoaCorrelator MICROSERVICE (W2, fortress VM)                           ║
║                                                                          ║
║  Input:  sentinel.detections.raw.* (NATS pull consumer)                 ║
║  Logic:  buffer per drone signature, wait ≥3 nodes, TDOA trilateration  ║
║  Output: sentinel.detections.correlated → NATS JetStream                ║
║          tracks upsert → Supabase (status=tentative/confirmed)          ║
║          sentinel.alerts.* → NATS (when confidence > 0.8)               ║
║                                                                          ║
║  Measurement format on sentinel.detections.correlated:                  ║
║  {                                                                       ║
║    trackId:          string (UUID),                                      ║
║    lat:              number (WGS84 degrees),                             ║
║    lon:              number (WGS84 degrees),                             ║
║    alt:              number (metres AMSL),                               ║
║    timestamp:        number (Unix ms, server-assigned),                  ║
║    nodeIds:          string[] (contributing node IDs),                   ║
║    correlationScore: number (0-1, TDOA residual quality)                 ║
║  }                                                                       ║
╚══════════════════════════════╦═══════════════════════════════════════════╝
                               ║ sentinel.detections.correlated
                               ║ [pull consumer: ekf-predictor]
                               ▼
╔══════════════════════════════════════════════════════════════════════════╗
║  EKF MICROSERVICE (W5, fortress VM) ← THIS IS W5                        ║
║                                                                          ║
║  Inputs:                                                                 ║
║  ├── NATS: sentinel.detections.correlated (JetStream pull, ack-explicit)║
║  └── NATS: sentinel.node_health.* (node quality weights — optional)     ║
║                                                                          ║
║  Internal:                                                               ║
║  ├── TrackEnrichmentService (orchestrator)                               ║
║  ├── MultiTrackEKFManager (Map<trackId, EKFInstance>)                    ║
║  ├── EKFInstance (6D state, Singer noise, predict+update)                ║
║  ├── PolynomialPredictor (quadratic fit, 5 horizons)                     ║
║  ├── ImpactEstimator (velocity → alt=0 projection)                       ║
║  └── PredictionPublisher                                                 ║
║                                                                          ║
║  Bootstrap (startup):                                                    ║
║  └── Supabase REST: SELECT * FROM tracks WHERE status='confirmed'        ║
║      → initialize EKFInstance for each confirmed track                   ║
║                                                                          ║
║  Outputs:                                                                ║
║  ├── NATS: sentinel.predictions.{trackId} (JetStream publish, ack)       ║
║  ├── NATS: sentinel.tracks.dropped.{trackId} (on stale dropout)          ║
║  └── Supabase: tracks.predicted_trajectory (JSONB upsert, non-blocking) ║
║                                                                          ║
║  Internal-only:                                                          ║
║  └── HTTP :9090/health (localhost only — not exposed externally)         ║
╚══════════════════╦═══════════════════════════════════════════════════════╝
                   ║
      ┌────────────┴─────────────────┐
      ║                              ║
      ▼ NATS: sentinel.predictions.* ▼ Supabase REST (background)
╔═════════════════════════════════╗ ╔══════════════════════════════════════╗
║  W4 C2 DASHBOARD               ║ ║  Supabase: tracks table              ║
║  (Vercel — NATS.ws subscriber) ║ ║  predicted_trajectory: JSONB         ║
║                                ║ ║  ekf_state: JSONB                    ║
║  CesiumJS polyline overlay:    ║ ║  prediction_updated_at: TIMESTAMPTZ  ║
║  [current, +1s, +2s, +3s,     ║ ║                                      ║
║   +5s, +10s] fading alpha      ║ ║  Also consumed by:                   ║
║                                ║ ║  - get-track-predictions Edge Fn     ║
║  Impact point indicator:       ║ ║  - get-ekf-health Edge Fn            ║
║  pulsing circle (if confident) ║ ║  - W4 Dashboard (Supabase Realtime)  ║
╚═════════════════════════════════╝ ╚══════════════════════════════════════╝
```

---

## Data Flow: Detection → Prediction (End-to-End)

```
Step  Component              Action                               Latency
────────────────────────────────────────────────────────────────────────────
1     Node A/B/C             YAMNet inference → NATS.ws publish   ~200ms
2     NATS JetStream         Route to SENTINEL stream             ~1ms
3     TdoaCorrelator         Buffer + TDOA trilaterate            ~100-500ms
4     NATS JetStream         sentinel.detections.correlated       ~1ms
5     EKF microservice       Fetch from pull consumer             ~5ms
6     EKF microservice       predict(dt) + update(measurement)    ~1ms
7     EKF microservice       PolynomialPredictor.predict()        ~0.5ms
8     EKF microservice       ImpactEstimator.estimate()           ~0.1ms
9     EKF microservice       NATS JetStream publish + ack         ~5ms
10    Supabase               tracks upsert (background)           ~20-50ms
11    W4 Dashboard           NATS.ws receive + Zustand update     ~5ms
12    W4 Dashboard           CesiumJS polyline re-render          ~16ms (1 frame)
────────────────────────────────────────────────────────────────────────────
Steps 1-9 (latency budget):    ~200 + 300 + 7 = ~510ms total
Steps 5-9 (EKF internal):      ~12ms (W5 owns this segment)
Steps 10-12 (dashboard):       ~70ms additional
Total acoustic → visual:       ~580ms (within 1-second perceptual threshold)
```

---

## Integration: NODE_HEALTH Subscription (Optional)

```
Subject: sentinel.node_health.{nodeId}
Publisher: W2 NodeHealthPublisher
Consumer: EKF microservice (advisory — not in prediction loop critical path)

NODE_HEALTH message:
{
  nodeId:           string,
  timestamp:        number (Unix ms),
  batteryLevel:     number (0-100),
  signalStrength:   number (dBm),
  clockDriftMs:     number,
  detectionRate:    number (detections/minute),
  status:           'online' | 'degraded' | 'offline'
}

EKF microservice uses NODE_HEALTH for:
  - Weighting TdoaCorrelator measurements: if all contributing nodes for a
    track have clockDrift > 100ms, inflate R (less confidence in measurement)
  - Logging: if nodes contributing to a track are degraded, note in EKF journal
  - NOT on critical path: if NODE_HEALTH unavailable, EKF runs with default R

Implementation note:
  EKF microservice maintains Map<nodeId, NodeHealthSnapshot>
  Updated in background consumer (separate from prediction consumer)
  Not blocking: prediction loop does not wait for NODE_HEALTH
```

---

## Integration: W4 Dashboard Consumption

```
W4 dashboard subscribes to NATS.ws:
  nc.subscribe('sentinel.predictions.*')

For each received PredictionMessage:
  1. Parse payload: { trackId, horizons, impactEstimate, ekfState }
  2. useTrackStore.getState().setPrediction(trackId, prediction)
  3. CesiumJS effect: if prediction.horizons.length > 0:
       Draw PolylineGraphics from currentPosition through all 5 horizon positions
       Alpha per point: lerp(1.0, 0.2) by confidence
       Color: same as track threat class marker
       MaterialProperty: PolylineArrowMaterialProperty

W4 dashboard also reads Supabase for predicted_trajectory:
  On page load: fetch tracks with predicted_trajectory != null
  On Realtime event for tracks table: if prediction_updated_at changed, update store
  → ensures prediction polylines survive NATS.ws disconnection (Supabase as backup)

W4 dashboard impact estimate display:
  If impactEstimate != null AND confidence > 0.4:
    Render EllipseGraphics at impact lat/lon
    Radius: 50m (uncertainty indicator — fixed for W5)
    Material: pulsing red (WaveMaterialProperty, period=1.5s)
    Label: 'T-{timeToImpactSeconds}s  ({confidence*100}%)'
```

---

## Integration: Supabase Bootstrap

```
On EKFInstance service startup:
  1. Connect to NATS (await — required before pull consumer)
  2. Query Supabase tracks table:
     SELECT id, lat, lon, alt, last_seen
     FROM tracks
     WHERE status IN ('confirmed', 'tentative')
     AND last_seen > NOW() - INTERVAL '15 seconds'

  3. For each row: MultiTrackEKFManager.bootstrapTrack(track)
     → creates EKFInstance with position = {lat, lon, alt}
     → sets P = R × 10 (uncertain velocity on bootstrap)
     → sets vLat=vLon=vAlt=0 (no velocity info at bootstrap)

  4. Log: "Bootstrapped {N} tracks from Supabase"

  5. Start pull consumer → begin processing new measurements
     (bootstrapped tracks will get velocity estimate from first measurement)

Why bootstrap matters:
  If service restarts mid-detection (e.g., Restart=on-failure after crash):
  - Active tracks are already in Supabase (TdoaCorrelator writes independently)
  - Without bootstrap: EKF cold-starts for all active tracks (first measurement
    initializes state, no historical context)
  - With bootstrap: EKF inherits last known position, first measurement adds
    velocity estimate → predictions available after 2 measurements instead of 5
```

---

## Integration: Supabase Edge Functions

```
get-track-predictions:
  Endpoint:  GET /functions/v1/get-track-predictions?trackId={uuid}
  Auth:      Bearer JWT (operator/analyst/admin via Supabase Auth)
  Reads:     tracks.predicted_trajectory, tracks.ekf_state, tracks.prediction_updated_at
  Used by:   W4 Dashboard (page load, when NATS.ws prediction not yet received)
             External ATAK CoT relay (future ENH-03)
  SLA:       < 50ms

get-ekf-health:
  Endpoint:  GET /functions/v1/get-ekf-health
  Auth:      service_role only (monitoring only)
  Reads:     ekf_config, recent ekf_track_events count, tracks with recent predictions
  Returns:   activeTrackCount, processedMessagesPerSecond, lastProcessedAt,
             natsConsumerLag (approximate, from last health report write)
  Used by:   LKGC capture script, operational monitoring
  SLA:       < 200ms (less critical than prediction path)
```

---

## NATS Subject Schema (W5 Additions)

```
Subject                              Publisher       Consumer          Direction
──────────────────────────────────────────────────────────────────────────────────────
sentinel.detections.raw.{nodeId}     Node (W1)       TdoaCorrelator    → EKF (upstream)
sentinel.detections.correlated       TdoaCorrelator  EKF microservice  → EKF (input)
sentinel.predictions.{trackId}       EKF service     W4 Dashboard      EKF → dashboard
sentinel.tracks.dropped.{trackId}    EKF service     W4 Dashboard      EKF → dashboard
sentinel.alerts.{alertId}            TdoaCorrelator  Dashboard/Mobile  (pass-through)
sentinel.cot.events                  W2 CoT relay    ATAK clients      (pass-through)
sentinel.node_health.{nodeId}        W2 NodeHealth   EKF service       advisory
```

---

## Latency Budget Detail

```
Total budget: ≤200ms for EKF service internal processing
(TdoaCorrelator→NATS → EKF fetch → predict+update → NATS publish)

Component                         Budget    Expected (P99)
──────────────────────────────────────────────────────────
NATS fetch (pull consumer)         5ms      3ms
EKFInstance.predict(dt)            1ms      0.2ms
EKFInstance.update(measurement)    1ms      0.5ms
PolynomialPredictor.predict()      2ms      0.8ms
ImpactEstimator.estimate()         1ms      0.1ms
PredictionPublisher.publishToNats  20ms     8ms   (includes JetStream ack RTT)
TOTAL (EKF internal)               30ms     ~13ms
──────────────────────────────────────────────────────────
Remaining budget for overhead:     170ms
(node.js event loop scheduling, GC pauses, memory allocation)

Supabase write (background):       50ms     30ms  (not on critical path)
W4 NATS.ws receive + render:       20ms     15ms  (not on EKF budget)
```

---

## Integration Failure Modes and Graceful Degradation

```
Failure                        EKF Behavior           Dashboard Behavior
──────────────────────────────────────────────────────────────────────────────
NATS cluster unreachable       Service starts (retry)  No new predictions
                               Reconnects automatically Polylines freeze
                               Logs WARN per attempt   Old polylines remain

Supabase unreachable           NATS publish continues  predictions via NATS.ws
                               Supabase writes queued  Dashboard not affected
                               Circuit breaker after 5 Realtime stale but NATS ok

TdoaCorrelator stopped         No new detections arrive EKF coasts existing tracks
                               Tracks go stale → dropped Dashboard shows last known pos

W4 Dashboard offline           NATS predictions ignored No impact on EKF service
                               Supabase writes continue Dashboard recovers on reload

EKF service crashes            systemd Restart=on-fail  Polylines disappear briefly
                               Restarts after 10s       Recover after restart + bootstrap
                               Bootstraps from Supabase Predictions resume <30s
```

---

## Message Schema Reference

### DetectionMessage (TdoaCorrelator → EKF, NATS)
```json
{
  "trackId":          "550e8400-e29b-41d4-a716-446655440000",
  "lat":              51.5074,
  "lon":              -0.1278,
  "alt":              120.5,
  "timestamp":        1711238400000,
  "nodeIds":          ["node-alpha-01", "node-alpha-02", "node-alpha-03"],
  "correlationScore": 0.92
}
```

### PredictionMessage (EKF → NATS, subject: sentinel.predictions.{trackId})
```json
{
  "trackId":   "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": 1711238400150,
  "processedAt": 1711238400148,
  "ekfState": {
    "lat":       51.5074,
    "lon":       -0.1278,
    "alt":       120.5,
    "vLat":      0.00018,
    "vLon":      0.00012,
    "vAlt":      -1.5,
    "timestamp": 1711238400000
  },
  "horizons": [
    { "lat": 51.5076, "lon": -0.1277, "alt": 119.0, "timestamp": 1711238401000,
      "horizonSeconds": 1, "confidence": 0.932 },
    { "lat": 51.5078, "lon": -0.1275, "alt": 117.5, "timestamp": 1711238402000,
      "horizonSeconds": 2, "confidence": 0.869 },
    { "lat": 51.5080, "lon": -0.1274, "alt": 116.0, "timestamp": 1711238403000,
      "horizonSeconds": 3, "confidence": 0.811 },
    { "lat": 51.5083, "lon": -0.1272, "alt": 113.0, "timestamp": 1711238405000,
      "horizonSeconds": 5, "confidence": 0.705 },
    { "lat": 51.5092, "lon": -0.1265, "alt": 105.5, "timestamp": 1711238410000,
      "horizonSeconds": 10, "confidence": 0.497 }
  ],
  "impactEstimate": {
    "lat":                   51.5146,
    "lon":                   -0.1213,
    "timestamp":             1711238480400,
    "timeToImpactSeconds":   80.3,
    "confidence":            0.0039
  }
}
```

Note: impactEstimate in the above example would be null (confidence 0.0039 < gate 0.4).
A real publishable impact estimate requires vAlt steep enough that timeToImpact ≤ 12s
(confidence(12s) = exp(-0.07×12) = 0.43 > gate).

### NodeDroppedMessage (EKF → NATS, subject: sentinel.tracks.dropped.{trackId})
```json
{
  "trackId":    "550e8400-e29b-41d4-a716-446655440000",
  "reason":     "stale_timeout",
  "lastSeen":   1711238400000,
  "droppedAt":  1711238415000,
  "staleSecs":  15
}
```

---

## Integration Test Matrix

```
Test                                              Type         Covers
──────────────────────────────────────────────────────────────────────────────────────
Single detection → NATS prediction published      Integration  FR-W5-07
Single detection → Supabase tracks updated        Integration  FR-W5-08
10 concurrent tracks → no cross-contamination     Integration  FR-W5-10
Track stale after 15s → drop published on NATS    Integration  FR-W5-10
NATS publish error → loop continues (mock)        Integration  FR-W5-07
Supabase error → NATS publish unaffected          Integration  FR-W5-08
Bootstrap from Supabase → EKF init for tracks     Integration  FR-W5-10
Coast cycle → prediction published (no update)    Integration  FR-W5-11
──────────────────────────────────────────────────────────────────────────────────────
Detection → EKF → NATS publish ≤200ms            E2E          Latency SLA
Supabase tracks.predicted_trajectory updated      E2E          FR-W5-08
Stale track dropped after 15s (real timer)        E2E          FR-W5-10
/health returns ok after 60s operation            E2E          Operational
W4 dashboard receives prediction via NATS.ws      E2E (manual) FR-W5-07 + W4
```

---

## Integration With W4 CesiumJS: Polyline Rendering Contract

The W5 EKF service owns the prediction data format. The W4 dashboard owns the
rendering. This section documents the exact contract between them.

```
EKF service guarantees:
  1. horizons array has exactly 0 or 5 elements (never 1-4)
  2. If 5 elements: horizonSeconds values are [1,2,3,5,10] in that order
  3. All lat/lon/alt values are finite numbers (no NaN/Infinity)
  4. alt is always ≥ 0.0 (clamped at PolynomialPredictor)
  5. confidence is always in [0.0, 1.0]
  6. timestamps are Unix ms, always > 0 and > ekfState.timestamp

W4 dashboard guarantees:
  1. Renders polyline only when horizons.length === 5
  2. Uses CesiumJS CartographicDegrees for lat/lon/alt conversion
  3. Alpha of each polyline segment = horizon.confidence (CesiumJS PolylineGlowMaterialProperty)
  4. Falls back to Supabase predicted_trajectory if NATS.ws disconnected
  5. Clears polyline when sentinel.tracks.dropped.{trackId} received

Breaking this contract is a cross-wave regression — must be reviewed jointly.
Any format change requires simultaneous update to EKF service + W4 dashboard
with coordinated deployment.
```
