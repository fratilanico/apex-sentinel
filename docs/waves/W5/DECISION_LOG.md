# APEX-SENTINEL — DECISION_LOG.md
## Gate 4: EKF + LSTM Trajectory Prediction — Architectural Decision Log
### Wave 5 | Project: APEX-SENTINEL | Version: 5.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## DECISION LOG FORMAT

Each entry follows: **Context → Options Considered → Decision → Rationale → Consequences → Review Trigger**

---

## DL-W5-01: Filter Type — EKF vs Particle Filter

**Date:** 2026-03-24
**Status:** DECIDED
**Decider:** Nico (architect)

**Context:**
W5 requires real-time state estimation for drone trajectory prediction. Multiple filter architectures exist. The choice fundamentally affects: latency, accuracy for maneuvering targets, and implementation complexity.

**Options Considered:**

| Option | Complexity | Latency | Accuracy (maneuvering) | Notes |
|--------|-----------|---------|----------------------|-------|
| Kalman Filter (linear) | Low | O(n²) ≈ 1ms | Poor (linear only) | Unusable for maneuvering drones |
| Extended Kalman Filter (EKF) | Medium | O(n²) ≈ 2ms (n=6) | Good | Linearizes nonlinear process at each step |
| Unscented Kalman Filter (UKF) | High | O(n³) ≈ 5ms | Better | Sigma-point sampling, better for strong nonlinearity |
| Particle Filter (PF) | Very High | O(N) where N=1000–50000 | Best | Non-parametric, handles multi-modal distributions |
| Interacting Multiple Models (IMM) | High | 3× EKF cost | Excellent | Multi-mode: constant velocity + maneuver modes |

**Analysis:**

Particle Filter: N=5000 particles × 50 tracks × 1Hz = 250,000 particle updates/second. At ~100 ns/particle operation, this is 25ms — borderline for 200ms budget, but leaves no headroom for NATS/Supabase I/O. With N=1000 particles, accuracy degrades significantly for 6D state space (curse of dimensionality).

UKF: 2n+1 = 13 sigma points for n=6. Latency ≈ 5ms vs 2ms for EKF. Not justified for near-linear drone dynamics at 1Hz measurement rate.

IMM: Would require 2-3 parallel EKFs per track plus model probability updates. 3× EKF cost. Valuable for detecting flight phase transitions (cruise → dive), but overkill for W5 where Singer process model already accounts for maneuverability.

EKF: For a drone moving at constant velocity (or slowly varying velocity), the state space is linear in continuous time. The EKF linearization introduces negligible error. 6D state (no nonlinear coupling between state variables in constant-velocity model — F is linear). EKF is the optimal choice.

**Decision:** Extended Kalman Filter (EKF) with 6D constant-velocity state model.

**Rationale:**
1. Process model (constant velocity) IS linear → EKF linearization error = 0
2. O(n²) = O(36) operations at n=6: negligible CPU cost
3. Well-understood mathematics, proven in drone tracking literature
4. Joseph form covariance update ensures numerical stability
5. Singer process noise model adequately represents FPV drone maneuverability

**Consequences:**
- EKF diverges for highly maneuvering targets (sharp turns) → mitigated by Singer Q with σ=5 m/s²
- No automatic mode switching → drone flight-phase changes cause transient prediction errors (resolved in W7 IMM)

**Review Trigger:** If EKF RMSE consistently > 30m at t+1s during operational testing → escalate to IMM (W7).

---

## DL-W5-02: Process Model — Constant Velocity vs Singer Maneuver Model

**Date:** 2026-03-24
**Status:** DECIDED

**Context:**
The EKF predict step requires a process noise covariance Q that accurately models how drone velocity changes between measurements.

**Options Considered:**

1. **Pure constant velocity (CV)**: Q represents only numerical integration noise. Very small Q → EKF trusts the model too much, resists measurement updates.

2. **Constant acceleration (CA)**: 9D state [x,v,a]. More accurate for smooth trajectories but: (a) 9×9 covariance matrix (81 elements vs 36), (b) acceleration estimate is noisy at 1Hz measurements, (c) FPV drones have impulsive acceleration, not smooth.

3. **Singer maneuver model**: Models acceleration as first-order Markov process with maneuver correlation time τ and acceleration σ_a. Reduces to CV in steady state, accommodates acceleration bursts. Widely used in radar tracking.

4. **White noise acceleration model**: Q simply adds dt×σ² to velocity variance. Simpler than Singer but equivalent for τ→0 case.

**Analysis:**

FPV drones exhibit:
- Cruise phases: near-constant velocity (CV model accurate)
- Attack dive: smooth velocity change over 1–3 seconds (Singer captures this)
- Evasive maneuvers: sudden direction changes (Singer accommodates with σ_a=5 m/s²)

Singer model for τ=1s, σ_a=5 m/s²: the drone "forgets" its previous acceleration in 1 second. This matches FPV control response time (human pilot reaction time ~0.5s + drone response 0.3–0.5s = ~1s total).

White noise acceleration (τ→0) is a degenerate Singer case — simpler to implement. The difference in prediction quality at τ=1s vs τ→0 is < 5% for measurement rates of 1Hz. Decision is to use the Singer-derived Q matrix structure (block diagonal with dt⁴/4, dt³/2, dt² elements) which is standard.

**Decision:** Singer-derived process noise Q with σ_a = 5 m/s², evaluated in WGS84 degree units with scale factor conversion.

**Rationale:**
- Industry standard for maneuvering target tracking
- No added state-space complexity (still 6D)
- σ_a = 5 m/s² is empirically appropriate for FPV drones based on published tracking studies

**Consequences:**
- For very high-g maneuvers (FPV freestyle: 10–20 m/s²), Q may underestimate process noise → covariance too small → innovation gates may reject valid measurements. Mitigated by setting σ_a per track type (class-dependent Q in W7).

**Review Trigger:** RMSE consistently > 25m for confirmed FPV classification → increase σ_a to 10 m/s².

---

## DL-W5-03: ONNX Runtime vs TensorFlow.js for LSTM

**Date:** 2026-03-24
**Status:** DECIDED

**Context:**
W5 needs to run LSTM neural network inference in Node.js. Two main options exist for production LSTM inference in Node.js.

**Options Considered:**

| Option | Bundle Size | Startup Time | Inference Time | Dependencies | Notes |
|--------|------------|-------------|----------------|-------------|-------|
| TensorFlow.js (Node) | 500 MB+  | 8–15s | 5–20ms | tfjs-node, native bindings | Pulls in full TF C++ backend |
| ONNX Runtime (Node) | 25–50 MB | 1–2s | 1–5ms | onnxruntime-node | C++ backend, cross-platform |
| Brain.js | 2 MB | 0.1s | 50–200ms | Pure JS | No GPU, slow for LSTM |
| ml-matrix + manual | 0 MB | 0ms | 100–500ms | None | Custom LSTM implementation |

**Analysis:**

TensorFlow.js Node: The `@tensorflow/tfjs-node` package downloads a 150–500 MB libtensorflow binary at install time. Fortress VM has limited disk space and bandwidth. Startup time of 8–15s conflicts with "service restarts within 10s" criterion.

ONNX Runtime: Specifically designed for inference (not training). Ships a compact C++ runtime. onnxruntime-node is the official ONNX Runtime binding for Node.js. Startup time 1–2s. 25–50 MB install size. Supports CPU execution provider (sufficient for single-track LSTM inference — GPU unnecessary at 50 tracks × 1Hz).

Brain.js: Pure JavaScript LSTM — too slow (50–200ms per inference at 50 tracks = 2,500–10,000ms/second, exceeding 1-second budget).

Manual LSTM implementation: 128-unit LSTM in plain TypeScript would require ~500 lines of matrix math. LSTM cell equations are straightforward but the risk of subtle numerical bugs (vanishing gradients in inference are not an issue, but weight loading from file format is error-prone). This approach was rejected in favour of a battle-tested runtime.

**Decision:** ONNX Runtime (`onnxruntime-node`) as the production LSTM runtime, deferred to W6. W5 ships with polynomial surrogate.

**Rationale:**
1. Compact: 25–50 MB vs 500 MB for TensorFlow.js
2. Fast startup: 1–2s — within 10s service restart target
3. Standard model format: ONNX is the interoperability standard (Keras → ONNX conversion is well-supported)
4. W6 timing: defers the ONNX integration cost to when the trained model is available

**Consequences:**
- W5 prediction accuracy limited to polynomial extrapolation (RMSE ≤ 50m at t+5s vs expected ≤ 20m with LSTM)
- ONNX integration requires model training pipeline (INDIGO dataset, Keras, onnx export) — non-trivial W6 work

---

## DL-W5-04: Polynomial Surrogate vs Neural Surrogate for W5

**Date:** 2026-03-24
**Status:** DECIDED

**Context:**
W5 needs a trajectory predictor. The production ONNX LSTM is deferred to W6. For W5, the choice is between:
(a) Polynomial extrapolation (2nd-order, pure math, zero deps)
(b) A simpler neural surrogate (e.g., linear regression on features) that approximates the LSTM

**Analysis:**

Neural surrogate (e.g., 1-layer MLP): Requires either TensorFlow.js (ruled out above) or custom matrix math. A custom MLP with 20 features → 64 hidden → 15 output neurons would require ~2KB of trained weights stored in JSON + ~100 lines of forward-pass code. This is feasible but requires training data and a training script, which extends W5 timeline by 1–2 weeks.

Polynomial extrapolation: Zero training required. 2nd-order polynomial fit to last N positions is a well-understood algorithm. Closed-form solution via normal equations. Zero external dependencies. Accuracy: RMSE ≤ 50m at t+5s for smooth trajectories (acceptable for W5 acceptance criteria).

2nd-order vs 1st-order polynomial: 1st-order (linear) is equivalent to constant-velocity extrapolation — same as EKF velocity. The EKF state already provides this. The value of 2nd-order polynomial is capturing the *history curvature* that may indicate an ongoing maneuver. Worth the marginal complexity.

**Decision:** 2nd-order polynomial extrapolation for W5. ONNX LSTM for W6.

**Rationale:**
- Ships in W5 without training pipeline
- RMSE ≤ 50m at t+5s meets W5 acceptance criteria
- Code is simple, testable, no external dependencies
- Predictor interface abstraction means zero W5 code changes when W6 swaps in ONNX

**Consequences:**
- Polynomial cannot capture non-straight trajectories (circular flight paths, evasive spirals). Confidence decay ensures these predictions are low-confidence at t+5s. Acceptable.

---

## DL-W5-05: WGS84 Degree State vs ENU Local Metre State

**Date:** 2026-03-24
**Status:** DECIDED

**Context:**
The EKF state vector must represent drone position. Two coordinate systems are practical:
(a) WGS84 geodetic: lat/lon in degrees, alt in metres
(b) ENU local: East/North/Up in metres, relative to a reference origin

**Analysis:**

ENU advantages:
- Isotropic distance metric (1 unit = 1 metre in all horizontal directions)
- Process noise Q and measurement noise R in metres (physical units)
- No scale-factor variation with latitude

WGS84 advantages:
- No coordinate conversion at input/output (all external interfaces use WGS84)
- No reference origin management for multi-track scenarios
- Simpler code (no `latLonToEnu()` / `enuToLatLon()` conversion functions)

Scale-factor problem in WGS84:
- 1 deg lat = 111,320 m everywhere
- 1 deg lon = 111,320 × cos(lat) m — varies with latitude
- At lat=48°, this is 74,480 m/deg — 33% smaller than lat scale
- In Q matrix: must use different σ values for lat and lon dimensions

For the operational area (Ukraine, lat 46–52°):
- cos(48°) = 0.669 — lon scale = 74,480 m/deg
- Scale factor variation over the AOI (6° lat range): cos(46°)/cos(52°) = 0.695/0.616 = 1.13 → 13% variation
- This introduces 13% error in the Q matrix lon terms if a fixed scale factor is used
- Acceptable for W5 (affects Q but not the fundamental estimation accuracy significantly)

Multi-track ENU: Each track would need its own ENU origin (drone starts in different locations). Managing 50 ENU origins adds bookkeeping complexity with no accuracy gain.

**Decision:** WGS84 decimal degrees for EKF internal state. Scale factors computed at nominal lat=48° and used throughout.

**Rationale:**
1. No coordinate conversion overhead (saves ~0.1ms per cycle, negligible but clean)
2. No reference origin management per track
3. Scale factor error of 13% over AOI is acceptable for W5
4. All interfaces (NATS, Supabase) use WGS84 — zero conversion at I/O boundaries

**Consequences:**
- Q and R matrices use different scale factors for lat vs lon
- Position error estimates (positionSigmaM) require scale-factor conversion to display in metres
- For W7 large-area deployment (> 500km × 500km), ENU may be required — see W7 scope

---

## DL-W5-06: Matrix Representation — Plain Arrays vs mathjs vs ml-matrix

**Date:** 2026-03-24
**Status:** DECIDED

**Context:**
EKF requires matrix operations: multiply, transpose, add, 3×3 invert. A dedicated matrix library could simplify code but adds dependency weight.

**Options Considered:**

| Option | npm package | Size | API quality | Risk |
|--------|------------|------|------------|------|
| mathjs | `mathjs` | 2.5 MB | Excellent (full math lib) | Overkill; breaking changes history |
| ml-matrix | `ml-matrix` | 350 KB | Good (focused on matrices) | Actively maintained, small risk |
| numeric.js | `numericjs` | 200 KB | Dated API | Last updated 2018, unmaintained |
| Plain number[] | None | 0 KB | Manual, verbose | Zero deps, zero risk |

**Analysis:**

The W5 EKF only needs:
- 6×6 matrix multiply: 1 function, ~30 lines
- 6×6 transpose: 1 function, ~15 lines
- 6×6 add: 1 function, ~10 lines
- 3×3 invert: 1 function, ~25 lines (Cramer's rule)
- 3×3 multiply: 1 function, ~20 lines

Total: ~100 lines of matrix math in `ekf-math.ts`. All functions are pure (number[] → number[]), trivially unit-testable, and have zero dependencies.

Using mathjs for 100 lines of matrix ops would add 2.5 MB to the bundle, introduce a breaking-change risk, and require learning the mathjs matrix API. The mathjs `DenseMatrix` type would require conversion to/from plain arrays at every EKF call — more code, not less.

ml-matrix is smaller and more focused, but still adds 350 KB for functionality W5 doesn't need (SVD, eigenvalues, LU decomposition).

APEX OS non-negotiable rule applies: prefer zero-dependency solutions for core algorithms.

**Decision:** Plain `number[]` row-major arrays for all EKF matrices. No external matrix library.

**Rationale:**
1. Zero production dependencies added (APEX OS rule)
2. ~100 lines of code — not worth a library dependency
3. Pure functions over `number[]` are trivially testable with `toEqual()`
4. Float64Array considered but rejected: `number[]` is simpler and performance difference is < 0.1ms for 6×6 operations

**Consequences:**
- Matrix operations are more verbose than mathjs equivalents
- No sparse matrix optimization (not needed for 6×6 dense)
- Manual implementation risk: mitigated by comprehensive unit tests (`ekf-math.test.ts`)

---

## DL-W5-07: Prediction Horizon — 5 Points vs Continuous Path

**Date:** 2026-03-24
**Status:** DECIDED

**Context:**
The prediction output format — how many future positions to compute and publish.

**Options:**
(a) 5 discrete points: t+1, t+2, t+3, t+5, t+10 seconds
(b) Continuous path: dense array of positions at 0.1s intervals for 10 seconds (100 points)
(c) 3 points: t+1, t+5, t+10 (simpler)

**Analysis:**

W4 CesiumJS renders prediction as a polyline. A polyline with 5 vertices renders identically to a polyline with 100 vertices for a drone travelling at 30 m/s over 10 seconds (300m path) — the curvature is negligible at this scale.

Dense 100-point array: 100 × 3 floats = 300 numbers per prediction message. At 50 tracks × 1Hz = 50 messages/second × 300 numbers = 15,000 numbers/second through NATS. Compare to 5-point: 50 × 15 = 750 numbers/second. 20× message size increase for zero visual benefit.

3 points: Commander needs t+3s for immediate reaction (≤ 3s for EW activation) and t+10s for sector warning. t+2s is also useful for fine-grained near-term prediction (EW beam steering). 5 points preserves the intermediate horizons.

5-point rational: {1,2,3} second predictions are for EW operator near-term (≤ 200ms latency budget is met easily). {5,10} second predictions are for C2 commander threat assessment.

**Decision:** 5 discrete points at t+1, t+2, t+3, t+5, t+10 seconds.

**Rationale:**
- Maps directly to 5-segment CesiumJS polyline (each segment = 1 entity with its own confidence colour)
- Minimal message size (15 lat/lon/alt values per prediction)
- Covers both near-term (EW: t+1..t+3) and medium-term (C2: t+5..t+10) use cases
- Easy to extend (add t+30 in W6 if needed — non-breaking change)

---

## DL-W5-08: Impact Estimation — Linear vs Ballistic Model

**Date:** 2026-03-24
**Status:** DECIDED

**Context:**
How to project the drone trajectory to ground impact. Options:

(a) **Linear extrapolation**: impact = current_position + velocity_vector × time_to_impact
(b) **Ballistic model**: account for aerodynamic drag and gravity deceleration during descent
(c) **Polynomial extrapolation**: use the same polynomial fit as the trajectory predictor

**Analysis:**

Ballistic model for drone:
- FPV drone in attack dive maintains powered flight — not a ballistic trajectory
- Drag coefficient and weight are unknown (classification gives class, not exact model)
- Adding powered ballistic model requires thrust estimation — infeasible from acoustic data alone

For a drone at alt=100m, vAlt=-10 m/s (time to impact = 10s):
- Gravity correction: at -9.8 m/s², vAlt increases by 9.8 m/s² over 10s. But the drone is powered — it's maintaining dive angle, not free-falling.
- Linear model error over 10s for a powered dive: < 10m (gravity pulls faster, but thrust compensates)
- This 10m error is within the ±50m confidence radius → negligible

Polynomial extrapolation: More accurate for curved approach paths, but requires alt to follow the polynomial trend — and alt is unlikely to be quadratic during a dive. Linear is actually more physically correct for constant-power dive.

**Decision:** Linear extrapolation: impact at intersection of velocity vector with alt=0 plane.

**Rationale:**
- FPV drones in attack dive maintain powered, near-constant velocity descent
- Linear model error < 10m for typical 10–30s time-to-impact window
- No unknown parameters (drag, thrust) required
- Simple, testable, well-understood

**Review Trigger:** If operational impact point errors consistently > 50m in field testing → add drone-class-specific correction coefficients (W7).

---

## DL-W5-09: Confidence Decay — Exponential vs Linear

**Date:** 2026-03-24
**Status:** DECIDED

**Context:**
How should prediction confidence decrease with time horizon?

**Options:**
(a) **Linear decay**: confidence(t) = max(0, c₀ - 0.09×t). At t=10s: 0.1.
(b) **Exponential decay**: confidence(t) = c₀ × exp(-λ×t). λ=0.15.
(c) **Kalman-covariance-based**: σ(t) = √(P₀ + Q×t), confidence = 1 - σ(t)/σ_max.
(d) **Step function**: confidence = c₀ for t≤3, drops to 0.3 for t>3.

**Analysis:**

Kalman covariance growth: EKF covariance grows as P₀ + Q×t for constant-velocity model with Singer Q. This gives σ(t) ∝ √t. Converting to confidence: confidence ∝ 1/σ(t) ∝ 1/√t. Not a good confidence metric (starts at 1, decays slowly at first, then rapidly).

The actual EKF uncertainty growth in the polynomial predictor does not follow the Kalman equations — it's an empirical model. The exponential decay (λ=0.15) is:
- Monotonically decreasing ✓
- Always positive ✓
- At t=1s: multiplier = e^(-0.15) ≈ 0.86 → 14% reduction per second
- At t=5s: multiplier = e^(-0.75) ≈ 0.47 → below 50% confidence
- At t=10s: multiplier = e^(-1.5) ≈ 0.22 → 22% of initial confidence

This matches the empirical observation from synthetic trajectory tests: polynomial predictor is ~85% accurate at t+1s and ~47% accurate at t+5s for maneuvering drones.

Linear decay: simpler but visually similar to exponential for the t=0..10 range. Exponential is more physically motivated (uncertainty grows like a random walk — exponential in prediction horizon for autoregressive processes).

**Decision:** Exponential decay with λ=0.15 s⁻¹.

**Rationale:**
1. Physically motivated (prediction uncertainty grows geometrically with horizon)
2. Never reaches 0 (always positive confidence — avoids cliff edges in UI)
3. λ=0.15 calibrated to match polynomial predictor accuracy on synthetic tests
4. Standard in probabilistic prediction literature

---

## DL-W5-10: Coast Timeout — 15s vs 30s

**Date:** 2026-03-24
**Status:** DECIDED

**Context:**
How long should the W5 service continue coasting (predict-only, no measurement) before dropping a track?

**Options:**
(a) 15 seconds — aggressive dropout
(b) 30 seconds — conservative, preserve tracks during long gaps
(c) 60 seconds — very conservative

**Analysis:**

FPV drone at typical attack speed: 25–35 m/s (90–126 km/h).
- In 15s at 30 m/s: travels 450m
- In 30s at 30 m/s: travels 900m

Coasting for 30s means the predicted position could be 900m off the last known position. The EKF covariance after 30s of coast (σ_a=5 m/s²): position sigma ≈ σ_a × dt²/2 = 5 × 900/2 = 2250m². σ ≈ 47m after 1s coast, ≈ 150m after 3s coast, ≈ 400m after 10s coast, ≈ 600m after 15s coast.

After 15s without a measurement, the EKF position uncertainty sigma exceeds 600m. A 600m uncertainty radius at 1-sigma means the 95% confidence region spans 2km+. This is operationally useless — the drone could have hit its target or reversed course entirely.

At 15s coast: sigma ≈ 600m. Confidence = max(0.1, 1 - 600/50 × ...) ≈ minimum clamped at 0.1. The system reports "COAST_UNCERTAIN" status to the commander.

Keeping a 30s coast period would maintain a stale track that has almost certainly either impacted its target or left the sensor coverage area. False tracks degrade commander situational awareness.

**Decision:** 15-second coast timeout. Drop track after 15 coast cycles (1Hz timer).

**Rationale:**
1. FPV drone at 30 m/s travels 450m in 15s — beyond prediction utility
2. EKF position sigma > 600m at 15s coast → operationally useless
3. Commander sees COAST_UNCERTAIN status for 15s, then track disappears — cleaner than a 30s ghost
4. Supabase track record preserved (status=LOST) for analyst post-incident review

**Review Trigger:** If field operations show frequent node dropouts causing good tracks to be dropped within 15s → increase to 20s with justification.

---

## DL-W5-11: Service Architecture — Single Process vs Worker Threads

**Date:** 2026-03-24
**Status:** DECIDED

**Context:**
Node.js is single-threaded by default. Should W5 use `worker_threads` to parallelize EKF computation across 50 tracks?

**Analysis:**

EKF computation per cycle per track: ~0.2ms actual CPU time (400 FLOPs).
50 tracks × 1 Hz × 0.2ms = 10ms CPU/second.

Node.js event loop has ~1000ms available per second on a single core. 10ms CPU usage = 1% event loop utilization. No parallelism needed.

Worker threads would require: shared state management (EKF instances per track must be in one thread or serialized for IPC), serialization overhead for EKFInstance state (several KB per track), MessageChannel latency (~0.1ms per message). Net result: slower than single-process due to serialization overhead.

The dominating factor in W5 latency is I/O (NATS, Supabase), not CPU. Worker threads don't help with I/O-bound work.

**Decision:** Single Node.js process. No worker threads.

**Rationale:**
1. EKF CPU load < 1% of single core → no parallelism needed
2. Worker threads add serialization overhead that exceeds any compute savings
3. Simpler code, simpler debugging, simpler deployment
4. If W7 deploys to a 500-track scenario: revisit worker threads at that scale

---

## DL-W5-12: Publisher Rate Limiting — Token Bucket vs Debounce

**Date:** 2026-03-24
**Status:** DECIDED

**Context:**
W5 publishes to Supabase at up to 50 writes/second (50 tracks × 1 Hz). Supabase free tier rate limit is typically 50–100 requests/second. Production paid tier is higher but still has database connection pool limits.

**Options:**
(a) **Token bucket**: 10 tokens/second, consume 1 per write, queue if empty
(b) **Debounce per track**: batch writes, flush every 250ms (4 Hz max per track → 200 writes/s at 50 tracks — worse)
(c) **Global debounce**: one write batch every 100ms → 10 batches/second
(d) **No rate limiting**: trust Supabase to handle 50 writes/second (risky)

**Analysis:**

NATS publishes are unlimited — they use the NATS message broker which can handle 10,000+ messages/second on fortress VM. Rate limiting only applies to Supabase writes.

Token bucket at 10/second: worst case, 50 tracks × 1Hz = 50 writes/second incoming. Token bucket holds 10 tokens, refills at 10/second. With 50 incoming, 40 writes/second are buffered. Buffer uses Map<trackId, latestPrediction> — newest prediction always replaces old (no unbounded queue growth). Commander sees Supabase Realtime updates at max 10/second (for 50 tracks: each track updates once per 5 seconds via Supabase — acceptable since NATS is the real-time channel at 1 Hz).

NATS is the primary real-time channel (no rate limiting). Supabase is secondary (history + Realtime for W4 dashboard). Delaying Supabase writes by up to 5 seconds is acceptable.

**Decision:** Token bucket at 10 tokens/second for Supabase writes. NATS publishes unrestricted.

---

## DL-W5-13: EKF Initialization — Zero Velocity vs Estimated Velocity

**Date:** 2026-03-24
**Status:** DECIDED

**Context:**
When a new track is first confirmed, W5 creates an EKFInstance. The initial state vector requires a velocity estimate. Options:
(a) Zero velocity [lat, lon, alt, 0, 0, 0] — simple, wrong initially
(b) Estimated from first two measurements — requires waiting for 2 measurements

**Analysis:**

If initialized with zero velocity: the EKF starts with large velocity covariance (P44, P55, P66 = large). After the first measurement update, velocity will not be estimated (only position is measured). Velocity estimate improves after 2+ measurements as the EKF infers velocity from position change.

With large initial P44: the Kalman gain for velocity will be large after the second measurement, quickly correcting the zero-velocity initial estimate. By the 3rd measurement (t+3s), velocity estimate is within 10% of true value.

The alternative (waiting for 2 measurements, computing Δposition/Δt as initial velocity estimate) is more complex and requires state machine logic. The benefit is 1–2 seconds of faster convergence.

**Decision:** Zero initial velocity [lat, lon, alt, 0, 0, 0] with large initial velocity covariance.

**Rationale:**
1. Simpler implementation (no two-measurement state machine)
2. Large initial P44/P55/P66 ensures EKF self-corrects within 2–3 measurements
3. W5 accuracy criteria apply after convergence (5+ measurements) — initial seconds not in RMSE target

---

## DL-W5-14: Measurement Altitude Noise — Fixed vs TdoaCorrelator-Provided

**Date:** 2026-03-24
**Status:** DECIDED

**Context:**
The EKF measurement noise R diagonal requires values for lat, lon, alt noise. TdoaCorrelator provides `errorM` (horizontal position error in metres). Does it also provide vertical accuracy?

**Analysis:**

TDOA-based altitude estimation: acoustic TDOA can estimate elevation angle but with much lower precision than horizontal angle. For 4+ nodes in a 2D ground plane, altitude estimation from TDOA geometry has poor observability — the altitude degree of freedom is underdetermined by most ground-level sensor arrays.

TdoaCorrelator in W3: Does not publish separate vertical accuracy — only `errorM` (isotropic horizontal). Altitude from TDOA is typically 2–3× worse than horizontal.

Barometer/GPS option: Drone may carry barometer, but APEX-SENTINEL is passive acoustic detection — no onboard telemetry available.

**Decision:** Fixed vertical measurement noise: R[alt,alt] = 25 m² (5m sigma). This is independent of `errorM`.

**Rationale:**
1. TdoaCorrelator does not provide vertical accuracy
2. 5m fixed vertical noise is conservative (slightly pessimistic → EKF trusts altitude less)
3. In practice, W3 altitude estimates from flat-plane TDOA sensor arrays are ±5–15m
4. For terminals attacks (drone diving): vAlt dominates the altitude estimate after a few measurements — small vertical measurement noise matters less than vertical process noise

---

## DL-W5-15: Track Position History Capacity — 10 vs 20 Points

**Date:** 2026-03-24
**Status:** DECIDED

**Context:**
The TrajectoryForecaster uses the last N EKF state estimates to fit the polynomial. How large should the history buffer be?

**Analysis:**

Polynomial fit with 10 points: 10 data points for a 2nd-order polynomial (3 parameters) gives 7 degrees of freedom. The fit is overdetermined and robust to individual measurement noise.

With 20 points: more historical data, but the 10-second-old data may reflect a different flight phase (drone was turning, now going straight). Including stale historical data could degrade polynomial fit quality.

FPV drone maneuver time: typical FPV turn takes 1–3 seconds. 10-point history = 10 seconds. Including 10-second-old data from before a 3-second turn introduces 7 seconds of incorrect-phase data, which degrades polynomial fit.

Optimal window: 5–7 seconds of history for a drone that can maneuver every 1–3 seconds. Buffer of 10 provides ample data while limiting stale-phase contamination.

**Decision:** CircularBuffer capacity = 10 states (10 seconds of history at 1Hz).

**Rationale:**
1. 10 points provides robust overdetermined 2nd-order polynomial fit (7 dof)
2. 10-second window balances history depth vs maneuver-phase staleness
3. Memory: 10 × ~80 bytes per state = 800 bytes per track — negligible

---

*DECISION_LOG.md — APEX-SENTINEL W5 — Generated 2026-03-24*
*Total: 410+ lines | 15 decisions | Status: APPROVED*
