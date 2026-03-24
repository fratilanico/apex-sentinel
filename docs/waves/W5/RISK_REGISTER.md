# APEX-SENTINEL W5 — RISK REGISTER
## W5 | PROJECTAPEX Doc 20/20 | 2026-03-24

> Wave: W5 — EKF + LSTM Trajectory Prediction (Gate 4)
> Supabase: bymfcnwfyxuivinuzurr (eu-west-2)

---

## Risk Summary

```
RISK-ID    Title                                      Likelihood  Impact   Score  Status
──────────────────────────────────────────────────────────────────────────────────────────
RISK-W5-01  EKF divergence on sharp FPV maneuver       HIGH        HIGH     9      OPEN
RISK-W5-02  Numerical instability in matrix inversion  MEDIUM      HIGH     6      OPEN
RISK-W5-03  NATS consumer lag under high event rate    MEDIUM      MEDIUM   4      OPEN
RISK-W5-04  Polynomial predictor poor non-linear acc.  HIGH        MEDIUM   6      OPEN
RISK-W5-05  Supabase write latency in prediction loop  MEDIUM      MEDIUM   4      OPEN
RISK-W5-06  systemd OOM kill on low-memory VM          LOW         HIGH     3      OPEN
RISK-W5-07  Clock drift between nodes affecting TDoA   MEDIUM      MEDIUM   4      OPEN
RISK-W5-08  False impact estimates causing panic       MEDIUM      HIGH     6      OPEN
RISK-W5-09  ONNX unavailable in Node.js 20             LOW         LOW      1      MITIGATED
RISK-W5-10  Track ID collision EKF/TrackManager        LOW         MEDIUM   2      OPEN
──────────────────────────────────────────────────────────────────────────────────────────

Score = Likelihood (1-3) × Impact (1-3)
Likelihood: LOW=1, MEDIUM=2, HIGH=3
Impact:     LOW=1, MEDIUM=2, HIGH=3
Score ≥ 6 = HIGH priority (must have mitigation active before deploy)
```

---

## RISK-W5-01: EKF Divergence on Sharp FPV Drone Maneuver

```
RISK-ID:      RISK-W5-01
Title:        EKF diverges when FPV drone performs high-acceleration maneuver
              (e.g., roll reversal at 30m/s²) that violates constant-velocity model
Likelihood:   HIGH — FPV freestyle drones regularly exceed constant-velocity assumption
Impact:       HIGH — diverged EKF produces garbage trajectory and impact estimate;
              operator makes incorrect threat assessment
Score:        9 (HIGH — mitigation required before deploy)
Status:       OPEN
Owner:        EKFInstance implementation (P1 days 3-7)
```

### Root Cause
The constant-velocity model (F = [I₃ dt*I₃; 0₃ I₃]) assumes drone velocity is
approximately constant over the prediction interval (1-5 seconds). FPV freestyle
drones can change velocity by 10-30 m/s in under 0.5 seconds (roll reversals,
split-S maneuvers). The Singer noise model with q_c=0.1 is too small to absorb
this and the EKF will confidently track the wrong state.

### Detection
EKF divergence manifests as:
- Innovation |y| >> expected based on σ (normalized innovation squared > χ² threshold)
- Rapid growth in covariance trace (over 10× in 3 steps)
- Predicted position diverges from subsequent measurements by >50m

### Mitigation
```
Primary: Singer q_c inflation on maneuver detection
  - Monitor normalized innovation squared (NIS): NIS = yᵀ * S⁻¹ * y
    For 3D measurement: NIS ~ χ²(3), 95th percentile = 7.815
  - If NIS > 15 (2× 95th %ile): inflate Q → set q_c = 5.0 for 3 steps
    then revert to configured value
  - Implementation: EKFInstance.computeNIS() → if high, call inflateProcessNoise()
  - Logged as: [WARN] EKFInstance: maneuver detected trackId={X} NIS={Y}, inflating Q

Secondary: Covariance bound check
  - If covarianceTrace > 100× initial trace: reinitialize EKF from last measurement
  - Ensures EKF never produces unbounded state estimates

Tertiary: Per-class q_c configuration (post-W5 enhancement ENH-05)
  - FPV freestyle: q_c = 5.0
  - DJI consumer:  q_c = 0.1
  - Fixed-wing:    q_c = 0.01

Testing:
  TEST-W5-RISK-01: inject synthetic roll-reversal maneuver (velocity reversal in 0.2s)
  → EKF should detect NIS spike, inflate Q, and re-converge within 5 measurements
```

### Residual Risk
Even with NIS-based inflation, prediction accuracy degrades to ±50m during active
maneuver. This is acceptable: at those G-forces, drone location certainty is low
anyway. Impact estimate will be gated out (confidence < 0.4) during maneuver.

---

## RISK-W5-02: Numerical Instability in Matrix Inversion

```
RISK-ID:      RISK-W5-02
Title:        Innovation covariance S becomes singular or near-singular,
              causing matInv3x3 to throw or return garbage
Likelihood:   MEDIUM — occurs when multiple redundant sensors give identical readings
Impact:       HIGH — EKFInstance.update() throws, crashing the prediction loop
Score:        6 (HIGH — mitigation required)
Status:       OPEN
Owner:        MatrixOps (ART-W5-002), EKFInstance (ART-W5-001)
```

### Root Cause
Innovation covariance: S = H * P * Hᵀ + R
S can become near-singular when:
1. P position sub-block approaches zero (over-confident state, covariance collapsed)
2. R is set to unrealistically small values (misconfigured sigmaLatDeg)
3. Multiple measurements arrive with zero time between them (dt=0 edge case)

If det(S) ≈ 0, matInv3x3 throws. The EKFInstance.update() is not wrapped in
try-catch in the naive implementation.

### Mitigation
```
Primary: Epsilon regularization of S before inversion
  - Before calling matInv3x3(S): S[i][i] += 1e-9 for i=0,1,2
  - Prevents exact singularity without meaningfully affecting S for well-conditioned cases
  - Worst case: R_effective slightly larger than configured → slightly conservative Kalman gain

Secondary: matInv3x3 enhanced with pseudoinverse fallback
  - If det(S) < 1e-10: compute SVD-based pseudoinverse
  - Node.js: simple power iteration for 3×3 (no external library needed)
  - Alternative: Cholesky decomposition for symmetric positive-definite S

Tertiary: EKFInstance.update() wrapped in try-catch
  - If matrix inversion throws: skip update (coast instead), log ERROR
  - Service does not crash; track continues coasting
  - Logged as: [ERROR] EKFInstance update failed trackId={X}: {err.message} — coasting

Code change to MatrixOps.ts:
  export function matInv3x3Safe(A: number[][]): number[][] {
    // Add epsilon to diagonal
    const Areg = A.map((row, i) => row.map((v, j) => i===j ? v + 1e-9 : v));
    try { return matInv3x3(Areg); }
    catch { return matIdentity(3); }  // fallback: identity (no update applied)
  }

Testing:
  TEST-W5-RISK-02: inject near-zero sigma_lat (1e-20) → verify S regularized, no throw
  TEST-W5-RISK-02b: inject dt=0 → verify update does not divide by zero
```

---

## RISK-W5-03: NATS Consumer Lag Under High Event Rate

```
RISK-ID:      RISK-W5-03
Title:        NATS consumer lag grows beyond 100 messages when TdoaCorrelator
              publishes at high rate (mass detection event, multiple drones)
Likelihood:   MEDIUM — high-density drone swarm scenario possible
Impact:       MEDIUM — prediction latency grows; EKF processes stale data
              (old measurements fed into "current" prediction); not a crash
Score:        4 (MEDIUM)
Status:       OPEN
Owner:        TrackEnrichmentService pull consumer configuration
```

### Root Cause
NATS JetStream pull consumer configured with maxMessages=10 per fetch and
expires=1000ms. At 5Hz detection rate × 20 tracks = 100 messages/second.
Pull loop processes 10 messages/second maximum → lag grows at 90 msg/s.

### Mitigation
```
Primary: Tune pull consumer fetch parameters
  - Increase maxMessages from 10 to 50 per fetch
  - Reduce expires from 1000ms to 200ms
  - Parallel track processing: process all fetched messages concurrently
    (Promise.all over batch — EKFInstances are independent per track)
  - Expected throughput: 50 messages × 5 times/second = 250 msg/s

Secondary: NATS consumer lag alert
  - Health check exposes natsConsumerLag metric
  - Alert script (scripts/check-nats-lag.sh) fires if lag > 100
  - Alert triggers: service restart evaluation + rate tuning

Tertiary: Multi-consumer sharding (if batch tuning insufficient)
  - Create 2 consumers: ekf-predictor-A (trackId hash even) + ekf-predictor-B (odd)
  - Each consumer processes half the tracks
  - Implementation complexity: moderate — requires trackId routing at publisher

Monitoring:
  nats consumer info SENTINEL ekf-predictor --json | jq '.num_pending'
  # Alert threshold: > 100 messages
```

---

## RISK-W5-04: Polynomial Predictor Poor Accuracy for Non-Linear Trajectories

```
RISK-ID:      RISK-W5-04
Title:        Polynomial (quadratic) extrapolation has high error for FPV drone
              turning trajectories; predicted positions > 50m off at +10s horizon
Likelihood:   HIGH — turning flight is common; quadratic cannot model circular arc
Impact:       MEDIUM — prediction is visually wrong on dashboard; impact estimate
              may indicate wrong location. Not a safety failure (gate blocks publish
              if confidence < 0.4 after time-to-impact decays)
Score:        6 (HIGH priority — accepted as design limitation of W5 surrogate)
Status:       OPEN — accepted as known limitation pending ONNX model
Owner:        PolynomialPredictor (ART-W5-003)
```

### Root Cause
A drone in a steady banked turn has circular (or helical) lat/lon trajectory.
A degree-2 polynomial can approximate a short arc but extrapolation error grows
rapidly beyond 3-5 seconds. At 15m/s turn radius 20m, the drone travels 90° in
~2s. At +5s, polynomial error ≈ 30m; at +10s ≈ 80m.

### Mitigation
```
Primary: Accept limitation — this is explicitly the W5 polynomial surrogate trade-off.
  - ONNX LSTM model (post-W5 enhancement ENH-04) trained on real turn trajectories
    will reduce this error to ~15m at +10s.
  - Polynomial serves to exercise the prediction interface; accuracy is documented.

Secondary: Reduce N for fitting (use last 3 states instead of 5)
  - Shorter fitting window reduces stale data influence in turning flight
  - Configurable: EKF_PREDICTOR_WINDOW_SIZE env var (default 5, min 2)

Tertiary: Confidence decay naturally limits +10s impact estimate
  - λ=0.07 yields confidence(10s) = 0.497 ≈ 0.5 > gate (0.4)
  - Consider increasing λ to 0.12 for turning flight: confidence(10s) = 0.30 < gate
  - This prevents publishing low-accuracy impact estimates at long horizons
  - Configurable per-deployment via ekf_config table

Documentation:
  - README / HANDOFF documents polynomial ±50m at +10s horizon as known limitation
  - Dashboard polyline renders with alpha proportional to confidence (visual cue to operator)
```

---

## RISK-W5-05: Supabase Write Latency Slowing Prediction Loop

```
RISK-ID:      RISK-W5-05
Title:        Supabase upsert for tracks.predicted_trajectory has P99 > 100ms;
              synchronous write blocks prediction loop, causing NATS lag
Likelihood:   MEDIUM — Supabase eu-west-2 to fortress VM (London/Frankfurt) ~20ms RTT
              Under Supabase free plan, write latency spikes to >200ms under load
Impact:       MEDIUM — EKF prediction latency SLA (200ms) breached during Supabase spikes
Score:        4 (MEDIUM)
Status:       OPEN
Owner:        PredictionPublisher (ART-W5-006)
```

### Mitigation
```
Primary: Fire-and-forget Supabase writes (do NOT await)
  - Publish to NATS first (latency-critical path — awaited)
  - Supabase upsert launched as async background Promise (not awaited in main loop)
  - Errors logged from Promise rejection handler but do not affect NATS publish
  - Pattern:
      await publishToNats(trackId, result);           // latency-critical
      publishToSupabase(trackId, result).catch(err => // background, non-blocking
        logger.error('Supabase write failed', { trackId, err }));

Secondary: Batch upsert (reduce call count)
  - Group all track updates per processing cycle into single upsert call
  - Reduces Supabase API call overhead from N calls to 1

Tertiary: Circuit breaker on Supabase writes
  - If 5 consecutive writes fail or timeout (>2000ms): disable Supabase writes
    for 60s backoff, then retry. NATS publishing continues unaffected.
  - Logged as: [WARN] Supabase circuit breaker OPEN — writes suspended 60s

Monitoring:
  - Health endpoint exposes supabaseWriteLatencyMs (rolling P99)
  - get-ekf-health Edge Function aggregates this from recent ekf_track_events timestamps
```

---

## RISK-W5-06: systemd OOM Kill on Low-Memory Fortress VM

```
RISK-ID:      RISK-W5-06
Title:        fortress VM RAM 2GB shared with NATS, TdoaCorrelator, CoT relay;
              Linux OOM killer terminates apex-sentinel-ekf.service
Likelihood:   LOW — EKF state is tiny; risk only under 1000+ track scenario
Impact:       HIGH — service killed without warning; systemd restarts but NATS
              consumer lag grows during downtime
Score:        3 (LOW-MEDIUM)
Status:       OPEN
Owner:        systemd unit file (ART-W5-016)
```

### Mitigation
```
Primary: MemoryLimit in systemd unit
  [Service]
  MemoryLimit=256M     # EKF state tiny; 256M covers 10,000 tracks + JS heap
  # Linux OOM killer attacks this process specifically if it exceeds limit
  # Process receives SIGKILL from systemd, not OOM killer directly

Secondary: Track count alerting
  - Health endpoint exposes activeTracks count
  - If activeTracks > 500: log WARN (unusual scenario suggests ID collision or attack)
  - If activeTracks > 1000: log ERROR + trigger Supabase alert

Tertiary: Node.js heap size explicit flag
  ExecStart=timeout 300 node --max-old-space-size=200 dist/service/main.js
  # 200MB heap ceiling → Node.js GC more aggressive before OOM
  # If heap cannot be GC'd, Node throws OOM error → service exits cleanly → systemd
  # restarts (Restart=on-failure, RestartSec=10)

VM monitoring:
  free -h  # fortress: check available RAM
  # If total used > 1.5GB: investigate which service is growing
```

---

## RISK-W5-07: Clock Drift Between Nodes Affecting TDoA Input Quality

```
RISK-ID:      RISK-W5-07
Title:        Smartphone clocks drift ±50-200ms relative to each other;
              TdoaCorrelator receives timestamps with variable drift;
              EKFInstance.predict(dt) uses incorrect dt
Likelihood:   MEDIUM — smartphones without GPS disciplining drift 10-50ms/minute
Impact:       MEDIUM — EKF state transition uses wrong dt → position error ≈ vLat * Δt_error
              At v=20m/s and Δt=50ms: error ≈ 1m (within TDoA noise floor — acceptable)
              At Δt=500ms: error ≈ 10m (approaches TDoA noise floor — concerning)
Score:        4 (MEDIUM)
Status:       OPEN
Owner:        W2 TdoaCorrelator (timestamp handling) + W5 EKFInstance (dt computation)
```

### Mitigation
```
Primary: EKF uses measurement timestamps for dt computation
  - dt = (currentMeasurement.timestamp - previousMeasurement.timestamp) / 1000.0
  - This is the time between TDOA-correlated positions (server-side timestamps
    assigned by TdoaCorrelator at correlation time, not node-reported time)
  - TdoaCorrelator already corrects for inter-node clock differences using
    cross-correlation of audio fingerprints (W2 design)

Secondary: dt bounds checking in EKFInstance.predict()
  - If computed dt < 0.05s: use 0.05s minimum (prevents zero-dt numerical issue)
  - If computed dt > 5.0s: use coast step (no measurement update, dt capped at 5s)
  - Logged as: [WARN] EKFInstance abnormal dt: {dt}s — clamping to bounds

Tertiary: NTP enforcement on smartphone nodes (W3 mobile app)
  - Android: NTP sync enforced by OS — drift < 50ms typical on WiFi
  - Meshtastic BLE nodes: GPS-disciplined time when outdoors

Monitoring:
  - TdoaCorrelator should expose per-node time_delta metric in NODE_HEALTH NATS messages
  - EKF microservice reads NODE_HEALTH and logs if any node shows drift > 100ms
```

---

## RISK-W5-08: False Impact Estimates Causing Operational Panic

```
RISK-ID:      RISK-W5-08
Title:        ImpactEstimator publishes impact estimate for a drone that is not
              actually descending toward a target (e.g., FPV pilot descending to land);
              dashboard shows alarming impact point at populated area
Likelihood:   MEDIUM — normal FPV landings involve descent and look like impact
Impact:       HIGH — operator declares emergency for benign drone; erodes trust
Score:        6 (HIGH — mitigation required)
Status:       OPEN
Owner:        ImpactEstimator (ART-W5-004), PredictionPublisher (ART-W5-006)
```

### Root Cause
ImpactEstimator projects current velocity to alt=0 without context:
- A drone descending to its landing pad looks identical to an impact trajectory
- A drone descending behind an obstacle and then ascending is misclassified

### Mitigation
```
Primary: Confidence gate (already in design — EKF_CONFIDENCE_GATE = 0.4)
  - impact estimate confidence = exp(-0.07 * timeToImpact)
  - For safe landing at 2m/s descent from 50m: t = 25s, confidence = 0.17 < gate
    → impact estimate NOT published
  - For genuine fast impact at 5m/s from 50m: t = 10s, confidence = 0.50 > gate
    → impact estimate PUBLISHED (correct high-speed threat)
  - λ=0.07 creates natural discrimination between fast threatening descent and slow landing

Secondary: Minimum velocity magnitude gate
  - Only compute impact estimate if |vAlt| > 1.0 m/s (1 m/s descent minimum)
  - Slow hover-descent (landing approach): |vAlt| < 0.5 m/s → no impact estimate
  - This eliminates most benign landing scenarios from triggering alerts

Tertiary: Dashboard visual distinction (W4)
  - Impact estimate rendered as pulsing circle (not solid) with confidence percentage
  - Color: yellow for 0.4-0.6 confidence, red for >0.6 confidence
  - Tooltip: "Estimated impact at T-{X}s (confidence: {Y}%) — not a confirmed threat"
  - Operator training: confidence < 0.6 is preliminary, not action trigger

Quaternary (post-W5): Threat class filter
  - If tracks.threatClass = 'unknown' AND impact estimate: downgrade confidence 25%
  - Only publish if original confidence × 0.75 > gate
  - Requires tracks.threatClass populated by W1 detection pipeline

Testing:
  TEST-W5-RISK-08a: landing scenario (slow descent 1m/s) → confidence < gate → not published
  TEST-W5-RISK-08b: fast impact scenario (5m/s from 50m) → confidence > gate → published
  TEST-W5-RISK-08c: vAlt = -0.3 m/s (hover adjustment) → minimum velocity gate blocks
```

---

## RISK-W5-09: ONNX Runtime Not Available in Node.js 20

```
RISK-ID:      RISK-W5-09
Title:        onnxruntime-node fails to install or run on fortress VM Node.js 20;
              service refuses to start when ONNX_MODEL_PATH is set
Likelihood:   LOW — onnxruntime-node 1.17+ supports Node 20; W5 doesn't use ONNX anyway
Impact:       LOW — W5 ships polynomial surrogate; ONNX path is optional
Score:        1 (LOW — effectively MITIGATED by design)
Status:       MITIGATED
Owner:        PolynomialPredictor (ONNX slot)
```

### Mitigation (already implemented in design)
```
ONNX_MODEL_PATH env var:
  - If empty (default in W5): polynomial surrogate path taken unconditionally
  - If set but file not found: WARN log, fall back to polynomial
  - If set and file exists: attempt ONNX load; if onnxruntime-node throws: WARN, fallback
  - Service NEVER fails to start due to ONNX unavailability

Code pattern in PolynomialPredictor:
  constructor(config: PredictorConfig) {
    if (config.onnxModelPath) {
      try {
        this.onnxSession = await InferenceSession.create(config.onnxModelPath);
        logger.info('ONNX model loaded');
      } catch (err) {
        logger.warn('ONNX load failed — using polynomial surrogate', { err });
        this.onnxSession = null;
      }
    }
  }

Status: MITIGATED — no action required. Tracked for post-W5 ONNX deployment (ENH-04).
```

---

## RISK-W5-10: Track ID Collision Between TrackManager and EKFManager

```
RISK-ID:      RISK-W5-10
Title:        W2 TdoaCorrelator assigns track IDs (UUIDs); W5 EKF manager uses
              same IDs. If TdoaCorrelator re-uses a previously dropped ID for a
              new physical target, EKF manager inherits stale state.
Likelihood:   LOW — UUIDs have 2¹²² possible values; collision is astronomically unlikely
              Only practical risk: TdoaCorrelator re-uses an ID intentionally for
              track re-acquisition (same physical target re-appears after gap)
Impact:       MEDIUM — EKF initialized with wrong state for new target; converges
              after ~5 measurements but initial predictions are wrong
Score:        2 (LOW)
Status:       OPEN
Owner:        W2 TdoaCorrelator (track ID lifecycle), W5 EKFManager
```

### Mitigation
```
Primary: EKF dropout + fresh init on re-appearance
  - If track was dropped (> dropout threshold) and then a new detection arrives
    for the same trackId: EKF manager creates a fresh EKFInstance
  - State is NOT resurrected from before dropout
  - Implementation in MultiTrackEKFManager.processDetection():
    if dropped track re-appears: manager.createFreshEntry(trackId, measurement)
    → initialize EKF from measurement with zero velocity (cold start)

Secondary: W2 track re-acquisition protocol
  - TdoaCorrelator should NOT re-use dropped track IDs for new physical targets
  - If the same physical drone (same audio fingerprint) re-appears: assign new UUID
  - Cross-wave requirement: add to W2 TdoaCorrelator operational notes

Tertiary: Anomaly detection on EKF state jump
  - On first update after EKF init: compare measurement to last known position
  - If distance > 500m in < 15s: log WARN "Large state jump on track re-init"
    (500m/15s = 33 m/s — exceeds any drone, likely different physical target)
  - Flag track as 'suspect' for 3 measurements before publishing predictions

Testing:
  TEST-W5-RISK-10: simulate trackId reuse for different physical target
  → EKF converges to new target within 5 measurements
  → large-state-jump WARN logged on first measurement
```

---

## Risk Review Schedule

```
Pre-deploy review:
  [ ] RISK-W5-01: NIS-based Q inflation implemented and tested
  [ ] RISK-W5-02: matInv3x3Safe with epsilon regularization in use
  [ ] RISK-W5-08: confidence gate + minimum vAlt gate implemented and tested

Post-deploy review (D+7):
  [ ] Confirm NATS consumer lag stays < 100 under actual detection rate
  [ ] Confirm no false impact estimate alerts in first week of operation
  [ ] Confirm no OOM kills in systemd journal

Monthly review:
  [ ] RISK-W5-04: accuracy regression check (EKF RMSE benchmark run)
  [ ] RISK-W5-07: check fortress VM time drift vs. NTP
  [ ] Review ekf_track_events for patterns: high NIS count, repeated reinits
```
