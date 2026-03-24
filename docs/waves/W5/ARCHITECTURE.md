# APEX-SENTINEL — ARCHITECTURE.md
## Gate 4: EKF + LSTM Trajectory Prediction — System Architecture
### Wave 5 | Project: APEX-SENTINEL | Version: 5.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. ARCHITECTURE OVERVIEW

### 1.1 Deployment Context

```
┌────────────────────────────────────────────────────────────────────────────┐
│  FORTRESS VM (94.176.2.48) — systemd managed                              │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  apex-sentinel-w5.service (Node.js 20, TypeScript compiled)          │  │
│  │                                                                      │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │  │
│  │  │  NATS Consumer  │  │ Supabase RT      │  │  Coast Timer 1Hz    │  │  │
│  │  │  (pull consumer │  │ (Realtime sub    │  │  (setInterval)      │  │  │
│  │  │  sentinel.      │  │  tracks table)   │  │                     │  │  │
│  │  │  detections.>)  │  │                  │  │                     │  │  │
│  │  └────────┬────────┘  └────────┬─────────┘  └──────────┬──────────┘  │  │
│  │           │                   │                        │              │  │
│  │           └────────────┬──────┘────────────────────────┘              │  │
│  │                        │                                               │  │
│  │             ┌──────────▼──────────┐                                   │  │
│  │             │  MultiTrackManager  │                                   │  │
│  │             │  Map<id,EKFInstance>│                                   │  │
│  │             └──────────┬──────────┘                                   │  │
│  │                        │                                               │  │
│  │           ┌────────────▼─────────────────┐                            │  │
│  │           │                              │                            │  │
│  │  ┌────────▼────────┐  ┌─────────────────▼──────┐                     │  │
│  │  │  EKFPredictor   │  │ TrajectoryForecaster    │                     │  │
│  │  │  predict()      │  │ polynomial | onnx       │                     │  │
│  │  │  update()       │  │                         │                     │  │
│  │  └────────┬────────┘  └─────────────────┬───────┘                     │  │
│  │           │                             │                             │  │
│  │           └────────────┬────────────────┘                             │  │
│  │                        │                                               │  │
│  │             ┌──────────▼──────────┐                                   │  │
│  │             │  ImpactEstimator    │                                   │  │
│  │             └──────────┬──────────┘                                   │  │
│  │                        │                                               │  │
│  │             ┌──────────▼──────────┐                                   │  │
│  │             │ PredictionPublisher │                                   │  │
│  │             └──────────┬──────────┘                                   │  │
│  └────────────────────────┼─────────────────────────────────────────────┘  │
│                           │                                                │
└───────────────────────────┼────────────────────────────────────────────────┘
                            │
              ┌─────────────┼──────────────┐
              │             │              │
              ▼             ▼              ▼
     NATS fortress    Supabase DB     NATS fortress
     sentinel.        bymfcnwfy...    sentinel.
     predictions.>    (eu-west-2)     impacts.>
              │                          │
              ▼                          ▼
     W4 CesiumJS               W4 CesiumJS
     NATS.ws consumer          NATS.ws consumer
     (prediction polyline)     (impact marker)
```

### 1.2 Service Identity

```
Service name:   apex-sentinel-w5
Binary:         /opt/apex-sentinel/w5/dist/index.js
Working dir:    /opt/apex-sentinel/w5
User:           apex-sentinel (non-root)
systemd unit:   /etc/systemd/system/apex-sentinel-w5.service
Environment:    /etc/apex-sentinel/w5.env (EnvironmentFile)
Logs:           journalctl -u apex-sentinel-w5 -f
```

---

## 2. TECHNOLOGY STACK

### 2.1 Runtime

| Component | Version | Rationale |
|-----------|---------|-----------|
| Node.js | 20 LTS | Float64Array, stable stream APIs |
| TypeScript | 5.4 | strict mode, no-unchecked-indexed-access |
| nats.js | 2.27 | Official NATS client, JetStream pull consumer |
| @supabase/supabase-js | 2.43 | Realtime + REST client |
| vitest | 1.6 | Unit testing per wave-formation TDD law |

**Zero additional production dependencies for math operations.** All matrix operations implemented as plain TypeScript functions operating on `number[]` arrays. See DECISION_LOG.md §DL-W5-06.

ONNX Runtime (`onnxruntime-node`) added as **optional peer dependency** in package.json — loaded dynamically at startup if `USE_ONNX_MODEL=true` and model file present. Falls back to polynomial surrogate if ONNX unavailable.

### 2.2 Build System

```
tsc --project tsconfig.json → dist/
tsconfig.json:
  target: ES2022
  module: NodeNext
  moduleResolution: NodeNext
  strict: true
  noUncheckedIndexedAccess: true
  outDir: dist
  rootDir: src
```

### 2.3 Directory Structure

```
packages/w5-predictor/          ← monorepo package (if using existing repo structure)
  or
services/trajectory-predictor/ ← standalone service directory

src/
  index.ts                       ← entry point, service bootstrap
  config.ts                      ← env var loading and validation
  nats/
    consumer.ts                  ← NATS pull consumer, message routing
    publisher.ts                 ← NATS publish helpers
  supabase/
    client.ts                    ← Supabase client singleton
    realtime.ts                  ← tracks table Realtime subscription
    writer.ts                    ← DB write operations (track_positions, predictions)
  ekf/
    EKFPredictor.ts              ← EKF state estimator class
    ekf-math.ts                  ← matrix operations (multiply, transpose, invert3x3, add)
    ekf-init.ts                  ← EKF initialization from first measurement
  predictor/
    TrajectoryForecaster.ts      ← Predictor interface + factory
    PolynomialPredictor.ts       ← 2nd-order polynomial extrapolation
    OnnxPredictor.ts             ← ONNX Runtime wrapper (optional)
  impact/
    ImpactEstimator.ts           ← project trajectory to alt=0
  manager/
    MultiTrackManager.ts         ← Map<trackId, EKFInstance> lifecycle
    EKFInstance.ts               ← per-track state container
    CoastTimer.ts                ← 1Hz timer for coast/dropout
  publisher/
    PredictionPublisher.ts       ← NATS + Supabase publish with rate limiter
    TokenBucket.ts               ← token bucket rate limiter
  types/
    prediction.ts                ← PredictionOutput, PredictedPoint, ImpactEstimate
    detection.ts                 ← DetectionEvent from NATS
    track.ts                     ← Track record from Supabase
  __tests__/
    ekf/
      EKFPredictor.test.ts
      ekf-math.test.ts
      ekf-stability.test.ts
    predictor/
      PolynomialPredictor.test.ts
      TrajectoryForecaster.test.ts
    impact/
      ImpactEstimator.test.ts
    manager/
      MultiTrackManager.test.ts
      CoastTimer.test.ts
    publisher/
      PredictionPublisher.test.ts
      TokenBucket.test.ts
    integration/
      pipeline.integration.test.ts

dist/                            ← compiled output (gitignored)
models/
  lstm-trajectory-v1.onnx       ← ONNX model file (not in W5, placeholder)
  README.md                     ← model training instructions
```

---

## 3. CORE CLASSES

### 3.1 EKFPredictor

```typescript
class EKFPredictor {
  // State vector: [lat, lon, alt, vLat, vLon, vAlt]
  private state: number[];       // 6 elements
  private covariance: number[];  // 36 elements, row-major 6×6

  constructor(
    initialState: EKFStateVector,
    initialCovariance?: number[]  // defaults to large diagonal (1e6 for position, 1e4 for velocity)
  )

  // Predict step: advances state by dt seconds
  // Returns new (state, covariance) — does NOT mutate internal state
  // Call commit() to apply
  predict(dt: number): { state: number[]; covariance: number[] }

  // Update step: incorporates new measurement
  // z: [lat, lon, alt] measurement
  // R: [r11, r22, r33] diagonal of 3×3 measurement noise matrix
  update(
    z: [number, number, number],
    R: [number, number, number]
  ): { state: number[]; covariance: number[]; innovation: number[] }

  // Apply predicted or updated state
  commit(state: number[], covariance: number[]): void

  // Check positive definiteness of covariance (eigenvalue check)
  isCovariacePD(): boolean

  // Get current state as typed object
  getState(): EKFStateVector

  // Get covariance diagonal (P11..P66)
  getCovarianceDiag(): number[]

  // Compute 1-sigma position uncertainty in metres
  getPositionSigmaM(): number
}
```

**EKF Math primitives (ekf-math.ts):**
```typescript
// All matrices as flat number[] row-major
function mat6x6Multiply(A: number[], B: number[]): number[]
function mat6x6Add(A: number[], B: number[]): number[]
function mat6x6Transpose(A: number[]): number[]
function mat6x6ScalarMultiply(A: number[], s: number): number[]
function mat3x3Invert(A: number[]): number[]  // used for S⁻¹
function matMultiply(A: number[], B: number[], rowsA: number, colsA: number, colsB: number): number[]
function identity6(): number[]
function buildF(dt: number): number[]           // 6×6 state transition
function buildQ(dt: number, sigmaLat: number, sigmaLon: number, sigmaAlt: number): number[]  // 6×6 process noise
function buildH(): number[]                    // 3×6 measurement matrix
```

### 3.2 EKFInstance

```typescript
interface EKFState {
  trackId: string;
  ekf: EKFPredictor;
  history: CircularBuffer<TimestampedState>;  // capacity=10, for predictor
  lastUpdateTime: number;         // Unix ms, last measurement incorporated
  createdAt: number;              // Unix ms, EKF created
  coastCount: number;             // consecutive 1Hz cycles without measurement
  status: 'ACTIVE' | 'COASTING' | 'UNCERTAIN';
}

class EKFInstance {
  readonly trackId: string;
  private ekf: EKFPredictor;
  private history: CircularBuffer<TimestampedState>;
  lastUpdateTime: number;
  coastCount: number;

  constructor(trackId: string, firstMeasurement: MeasurementEvent)

  // Process a new measurement: predict(dt) then update(z, R)
  processMeasurement(event: MeasurementEvent): EKFCycleResult

  // Coast: predict(dt=1) only, increment coastCount
  coast(nowMs: number): EKFCycleResult

  // Get last N states for trajectory forecaster
  getHistory(n: number): TimestampedState[]

  // Check if instance should be dropped (coastCount > 15)
  shouldDrop(): boolean
}
```

### 3.3 MultiTrackManager

```typescript
class MultiTrackManager {
  private instances: Map<string, EKFInstance>;
  private forecaster: TrajectoryForecaster;
  private estimator: ImpactEstimator;
  private publisher: PredictionPublisher;

  constructor(
    forecaster: TrajectoryForecaster,
    estimator: ImpactEstimator,
    publisher: PredictionPublisher
  )

  // Handle incoming detection event from NATS
  async handleDetection(event: DetectionEvent): Promise<void>

  // Handle new confirmed track from Supabase Realtime
  async handleNewTrack(track: TrackRecord): Promise<void>

  // Called by CoastTimer at 1Hz
  async runCoastCycle(): Promise<void>

  // Load existing tracks on startup
  async loadActiveTracks(tracks: TrackRecord[]): Promise<void>

  // Get current active track count (for metrics)
  getActiveCount(): number

  // Force-remove a track (called when track status → LOST from external)
  removeTrack(trackId: string): void
}
```

### 3.4 TrajectoryForecaster (Interface + Implementations)

```typescript
interface Predictor {
  predict(
    history: TimestampedState[],
    horizons: number[]
  ): PredictedPoint[];
  readonly modelVersion: string;
}

class PolynomialPredictor implements Predictor {
  readonly modelVersion = 'polynomial-v1';

  predict(history: TimestampedState[], horizons: number[]): PredictedPoint[] {
    // Require minimum 3 history points
    // Fit 2nd-order polynomial to (t, lat), (t, lon), (t, alt) independently
    // Extrapolate to each horizon
    // Return PredictedPoint[] with confidence from decay formula
  }

  private fitPolynomial(xs: number[], ys: number[]): [number, number, number]
  private evaluate(coeffs: [number, number, number], t: number): number
}

class OnnxPredictor implements Predictor {
  readonly modelVersion = 'onnx-lstm-v1';
  // W6 implementation — stub in W5
  predict(history: TimestampedState[], horizons: number[]): PredictedPoint[] {
    throw new Error('ONNX model not loaded — use polynomial predictor');
  }
}

class TrajectoryForecaster {
  private predictor: Predictor;

  constructor(useLSTM: boolean, modelPath?: string)

  forecast(history: TimestampedState[]): PredictedPoint[] {
    const horizons = [1, 2, 3, 5, 10];
    return this.predictor.predict(history, horizons);
  }
}
```

### 3.5 PredictionPublisher

```typescript
class PredictionPublisher {
  private nats: NatsConnection;
  private supabase: SupabaseClient;
  private tokenBucket: TokenBucket;  // 10 tokens/s for Supabase writes
  private pendingSupabaseWrites: Map<string, PredictionOutput>;  // latest per track

  async publish(prediction: PredictionOutput): Promise<void> {
    // 1. Always publish to NATS immediately (no rate limit)
    await this.publishNats(prediction);

    // 2. Supabase: rate-limited via token bucket
    //    If no token available, buffer (replace old pending for same trackId)
    await this.publishSupabase(prediction);
  }

  private async publishNats(prediction: PredictionOutput): Promise<void>
  private async publishSupabase(prediction: PredictionOutput): Promise<void>
  private async flushPendingWrites(): Promise<void>
}
```

---

## 4. DATA FLOW

### 4.1 Detection Event → Prediction Published

```
1. NATS message arrives on sentinel.detections.{nodeId}
   Payload (JSON):
   {
     trackId: "track-uuid",
     lat: 48.12345,
     lon: 24.56789,
     alt: 120.5,
     errorM: 8.3,
     timestamp: "2026-03-24T10:00:00.123Z",
     nodeId: "node-alpha"
   }

2. NATSConsumer.onMessage(msg):
   event = parseDetectionEvent(msg.data)
   await multiTrackManager.handleDetection(event)

3. MultiTrackManager.handleDetection(event):
   instance = instances.get(event.trackId)
   if (!instance):
     instance = new EKFInstance(event.trackId, event)
     instances.set(event.trackId, instance)

   result = instance.processMeasurement(event)
   // result = { state, covariance, innovation, dt }

   history = instance.getHistory(10)
   predictions = forecaster.forecast(history)
   impact = estimator.estimate(result.state, predictions)
   confidence = computeConfidence(result.covariance)

   output: PredictionOutput = {
     trackId, generatedAt, ekfState, ekfCovarianceDiag,
     predictions, impactEstimate, confidence, modelVersion
   }

   await publisher.publish(output)

4. PredictionPublisher.publish(output):
   a. nats.publish('sentinel.predictions.' + trackId, JSON.stringify(output))
   b. if impact: nats.publish('sentinel.impacts.' + trackId, JSON.stringify(impact))
   c. supabase.from('tracks').upsert({ id: trackId, predicted_trajectory: output })
   d. supabase.from('track_positions').insert(ekfStateRecord)
   e. supabase.from('predicted_trajectories').insert(predictionRecord)
   f. if impact: supabase.from('impact_estimates').upsert(impactRecord)

Total elapsed: < 200ms (p95) for steps 1–4
```

### 4.2 NATS Message Schema

```typescript
// Input: sentinel.detections.{nodeId}
interface DetectionEvent {
  trackId: string;
  lat: number;
  lon: number;
  alt: number;
  errorM: number;          // 1-sigma position error in metres (from TdoaCorrelator)
  timestamp: string;       // ISO 8601 UTC
  nodeId: string;
  confidence?: number;     // TdoaCorrelator confidence (0-1)
}

// Output: sentinel.predictions.{trackId}
interface PredictionOutput {
  trackId: string;
  generatedAt: string;
  ekfState: EKFStateVector;
  ekfCovarianceDiag: number[];   // [P11,P22,P33,P44,P55,P66]
  predictions: PredictedPoint[];
  impactEstimate: ImpactEstimate | null;
  confidence: number;
  modelVersion: string;
  isCoasting: boolean;           // true if no measurement in last 2s
}

// Output: sentinel.impacts.{trackId}
interface ImpactMessage {
  trackId: string;
  impact: ImpactEstimate;
  generatedAt: string;
}
```

---

## 5. NATS CONFIGURATION

### 5.1 Consumer Setup

W5 uses a **NATS JetStream pull consumer** on the `DETECTIONS` stream (created by W2/W3). Consumer config:

```typescript
const js = natsConnection.jetstream();
const consumer = await js.consumers.get('DETECTIONS', 'w5-predictor');
// if consumer doesn't exist, create:
await jsm.consumers.add('DETECTIONS', {
  durable_name: 'w5-predictor',
  deliver_policy: DeliverPolicy.New,
  ack_policy: AckPolicy.Explicit,
  filter_subject: 'sentinel.detections.>',
  max_ack_pending: 100,
  ack_wait: 5_000_000_000,  // 5s in nanoseconds
});
```

### 5.2 Pull Loop

```typescript
async function runPullLoop(consumer: Consumer): Promise<void> {
  const messages = await consumer.consume({ max_messages: 10 });
  for await (const msg of messages) {
    try {
      await handleMessage(msg);
      msg.ack();
    } catch (err) {
      logger.error('Message processing failed', { err, subject: msg.subject });
      msg.nak(30_000);  // requeue after 30s
    }
  }
}
```

---

## 6. SUPABASE REALTIME SUBSCRIPTION

```typescript
const realtimeChannel = supabase
  .channel('tracks-changes')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'tracks',
      filter: "status=eq.CONFIRMED"
    },
    async (payload) => {
      const track = payload.new as TrackRecord;
      await multiTrackManager.handleNewTrack(track);
    }
  )
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'tracks',
      filter: "status=eq.LOST"
    },
    (payload) => {
      multiTrackManager.removeTrack(payload.new.id);
    }
  )
  .subscribe();
```

---

## 7. CONFIGURATION

### 7.1 Environment Variables

```bash
# /etc/apex-sentinel/w5.env

# NATS
NATS_URL=nats://localhost:4222
NATS_USER=apex-sentinel
NATS_PASSWORD=<from-vault>

# Supabase
SUPABASE_URL=https://bymfcnwfyxuivinuzurr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<from-vault>

# W5 Config
COAST_TIMEOUT_MS=15000
PROCESS_NOISE_SIGMA_MS2=5.0
SUPABASE_WRITE_RATE=10
PREDICTION_HORIZONS=1,2,3,5,10
USE_ONNX_MODEL=false
ONNX_MODEL_PATH=/opt/apex-sentinel/w5/models/lstm-trajectory-v1.onnx

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

### 7.2 Config Module

```typescript
// src/config.ts
const config = {
  nats: {
    url: requireEnv('NATS_URL'),
    user: requireEnv('NATS_USER'),
    password: requireEnv('NATS_PASSWORD'),
  },
  supabase: {
    url: requireEnv('SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  },
  ekf: {
    coastTimeoutMs: parseInt(process.env.COAST_TIMEOUT_MS ?? '15000'),
    processNoiseSigmaMs2: parseFloat(process.env.PROCESS_NOISE_SIGMA_MS2 ?? '5.0'),
  },
  publisher: {
    supabaseWriteRate: parseInt(process.env.SUPABASE_WRITE_RATE ?? '10'),
    predictionHorizons: (process.env.PREDICTION_HORIZONS ?? '1,2,3,5,10')
      .split(',').map(Number),
  },
  predictor: {
    useOnnx: process.env.USE_ONNX_MODEL === 'true',
    onnxModelPath: process.env.ONNX_MODEL_PATH ?? '',
  },
  log: {
    level: process.env.LOG_LEVEL ?? 'info',
    format: process.env.LOG_FORMAT ?? 'json',
  },
} as const;
```

---

## 8. SYSTEMD UNIT FILE

```ini
# /etc/systemd/system/apex-sentinel-w5.service
[Unit]
Description=APEX-SENTINEL W5 Trajectory Prediction Service
Documentation=https://github.com/fratilanico/apex-sentinel/docs/waves/W5/ARCHITECTURE.md
After=network-online.target nats.service
Wants=network-online.target
Requires=nats.service

[Service]
Type=simple
User=apex-sentinel
Group=apex-sentinel
WorkingDirectory=/opt/apex-sentinel/w5
EnvironmentFile=/etc/apex-sentinel/w5.env

# Start with timeout wrapper as per APEX OS non-negotiable rules
ExecStart=/usr/bin/timeout 86400 /usr/bin/node /opt/apex-sentinel/w5/dist/index.js

# Restart policy: on-failure, NOT always (no restart storm)
Restart=on-failure
RestartSec=5
StartLimitIntervalSec=60
StartLimitBurst=5

# Security
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/apex-sentinel/w5/logs
PrivateTmp=true
CapabilityBoundingSet=

# Resource limits
MemoryMax=256M
CPUQuota=50%

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=apex-sentinel-w5

[Install]
WantedBy=multi-user.target
```

**Deploy commands:**
```bash
# Install
sudo cp /opt/apex-sentinel/w5/infra/apex-sentinel-w5.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable apex-sentinel-w5
sudo systemctl start apex-sentinel-w5

# Status
sudo systemctl status apex-sentinel-w5
journalctl -u apex-sentinel-w5 -f --since "5 minutes ago"

# Restart after deploy
sudo systemctl restart apex-sentinel-w5
```

---

## 9. ERROR HANDLING AND RESILIENCE

### 9.1 NATS Connection Failure

```
NATS disconnected:
  - NATSConsumer emits 'disconnect' event
  - MultiTrackManager.pause() — stop processing, keep EKF state
  - Wait for NATS reconnect (nats.js handles reconnect with exponential backoff)
  - On reconnect: resume pull consumer
  - EKF state preserved in memory (predictions published via Supabase if reconnect within 30s)
  - If disconnected > 30s: log WARN, continue coasting, do not reset EKF instances
```

### 9.2 Supabase Connection Failure

```
Supabase write fails:
  - Retry with exponential backoff (max 3 attempts, 1s/2s/4s)
  - If all retries fail: log ERROR, continue NATS publishing
  - Buffer Supabase write in pendingWrites Map (replaced by next prediction for same trackId)
  - Supabase Realtime disconnects: attempt reconnect; if fails, continue on NATS events only

NATS is primary; Supabase is secondary. Service remains operational if Supabase is down.
```

### 9.3 EKF Numerical Failure

```
After each EKF update, check covariance positive-definiteness:
  if !ekf.isCovariancePD():
    log WARN 'EKF covariance not PD, resetting for track ${trackId}'
    ekf.resetCovariance(largeInitialP)
    // State estimate preserved; only covariance reset
    // Next prediction will have low confidence until covariance re-converges
```

### 9.4 Stale Measurement

```
if event.timestamp <= instance.lastUpdateTime:
  log DEBUG 'Stale measurement for track ${trackId}, skipping update'
  // Still run predict() to advance state to current time
  // Do not call update() with stale measurement
```

---

## 10. OBSERVABILITY

### 10.1 Structured Logging (JSON)

```typescript
// All log lines are JSON — consumed by journald → Vector → Loki (W4 infra)
const logger = {
  info: (msg: string, ctx?: object) => console.log(JSON.stringify({ level: 'info', msg, ...ctx, ts: new Date().toISOString() })),
  warn: (msg: string, ctx?: object) => console.warn(JSON.stringify({ level: 'warn', msg, ...ctx, ts: new Date().toISOString() })),
  error: (msg: string, ctx?: object) => console.error(JSON.stringify({ level: 'error', msg, ...ctx, ts: new Date().toISOString() })),
};

// Key log events:
// { level: 'info', msg: 'W5 started', activeTracks: 3, natsConnected: true }
// { level: 'info', msg: 'EKF initialized', trackId: '...', lat: 48.1, lon: 24.5 }
// { level: 'info', msg: 'Prediction published', trackId: '...', latencyMs: 45, model: 'polynomial-v1' }
// { level: 'warn', msg: 'Track coasting', trackId: '...', coastSeconds: 5 }
// { level: 'warn', msg: 'Track dropped', trackId: '...', reason: 'coast_timeout_15s' }
// { level: 'error', msg: 'Supabase write failed', trackId: '...', attempt: 3 }
```

### 10.2 Latency Measurement

```typescript
// Measure detection → NATS publish latency
const t0 = performance.now();
await multiTrackManager.handleDetection(event);
const latencyMs = performance.now() - t0;
logger.info('Prediction published', { trackId: event.trackId, latencyMs });

// Alert if p95 > 200ms (sampled every 100 events)
latencyHistogram.record(latencyMs);
if (latencyHistogram.p95() > 200) {
  logger.warn('Latency SLO breach', { p95Ms: latencyHistogram.p95() });
}
```

---

## 11. SECURITY

### 11.1 NATS Authentication

W5 uses NATS username/password authentication (same credentials as other fortress services). NATS TLS: mutual TLS between fortress services (internal).

### 11.2 Supabase Service Role

W5 uses `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS for writes. RLS is enforced at the W4 dashboard layer (anon key → operator role check). See PRIVACY_ARCHITECTURE.md §3.

### 11.3 Secrets

No secrets in code or git. All credentials in `/etc/apex-sentinel/w5.env` (mode 640, owner root:apex-sentinel).

---

*ARCHITECTURE.md — APEX-SENTINEL W5 — Generated 2026-03-24*
*Total: 800+ lines | Status: APPROVED | Next: DATABASE_SCHEMA.md*
