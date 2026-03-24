# APEX-SENTINEL — PRD.md
## Gate 4: EKF + LSTM Trajectory Prediction — Product Requirements
### Wave 5 | Project: APEX-SENTINEL | Version: 5.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. EXECUTIVE SUMMARY

### 1.1 Problem Statement

APEX-SENTINEL W1–W4 delivers confirmed drone tracks with real-time position, classification, and alert generation. However, a confirmed track without trajectory prediction gives the C2 commander only **10–15 seconds of warning** — the latency between acoustic detection and the drone reaching a potential target. This is insufficient for:

- Activating electronic countermeasures (requires 20–30s lead time)
- Issuing evacuation warnings to a sector (requires 45–60s)
- Vectoring an intercept asset (requires 60–120s)

### 1.2 Solution

Gate 4 (W5) adds **trajectory prediction** to every confirmed track:

- **EKF state estimation**: real-time position + velocity estimate from noisy TdoaCorrelator measurements, reducing position noise from ±15m (raw) to ±5m (filtered)
- **Polynomial/LSTM trajectory forecasting**: projects current state forward 1–10 seconds, yielding a 5-point predicted path
- **Impact point estimation**: projects trajectory to alt=0, returning a lat/lon with ±50m confidence radius and estimated time-to-impact

With W5, commander warning time extends to **30–45 seconds** for a typical FPV drone attack profile.

### 1.3 Scope

W5 is a **headless Node.js microservice**. No new UI. Predictions are consumed by the existing W4 CesiumJS dashboard (predicted polyline overlay + impact marker) and OpenMCT panel (EKF state timeline). W4 requires minimal code changes (see DESIGN.md §9).

### 1.4 Out of Scope

- UI changes beyond prediction overlay in W4 dashboard
- ONNX Runtime LSTM integration (W6)
- Android prediction display (W6)
- Terrain-corrected impact (W7)
- Maneuver detection / mode switching (W7)

---

## 2. USER ARCHETYPES

### UA-01: Sensor Operator (Unchanged from W3)
Deploys and monitors acoustic sensor nodes. Not a consumer of trajectory predictions directly. Passive beneficiary: better track quality from EKF reduces false alarms.

### UA-02: C2 Commander (PRIMARY — W5)
**Role:** Battlefield commander making real-time countermeasure decisions.
**Needs:**
- Predicted impact point within 2 seconds of track confirmation
- Confidence radius on impact point (distinguishes ±20m from ±200m estimates)
- Time-to-impact countdown
- Visual indication on map (red X at predicted impact)
**Pain point (pre-W5):** "I see the drone on the map but I don't know where it's going. By the time I decide to act it's already there."
**Success with W5:** Commander can issue sector alert 30s before potential impact, up from ~10s.

### UA-03: Electronic Warfare (EW) Operator (NEW — W5)
**Role:** Operates jamming systems on 2.4GHz / 5.8GHz drone control links.
**Needs:**
- Predicted track position at t+5s and t+10s for beam-steering pre-computation
- Confidence level to decide whether to commit expensive jamming energy
**Pain point:** Jamming a moving drone requires prediction — reacting to current position always lags.
**Success with W5:** EW operator receives predicted position 5–10s ahead, enabling pre-emptive jamming.

### UA-04: Civil Defense Coordinator
**Role:** Manages shelter-in-place and evacuation decisions for civilian areas.
**Needs:**
- Impact point estimate with confidence radius (must not cause false evacuations)
- Only receives impact estimates with confidence > 0.5
**Pain point:** Too many false alarms from un-validated predictions erode trust.
**Success with W5:** Impact estimates gated by confidence threshold (≥0.5) reduce false positives by >80% vs raw heading extrapolation.

### UA-05: Intelligence Analyst (SECONDARY — W5)
**Role:** Post-incident analysis of drone attack patterns, flight path reconstruction.
**Needs:**
- Full EKF state history (track_positions table) for each confirmed track
- Confidence history for trajectory assessment
- Export of historical predicted trajectories
**Pain point:** Current system provides only raw detection points — no smoothed trajectory history.
**Success with W5:** Full EKF state history in track_positions enables reconstruction of flight path with 5m precision.

---

## 3. PRODUCT REQUIREMENTS

### 3.1 Functional Requirements Summary

| FR | Title | Priority | Complexity |
|----|-------|----------|-----------|
| FR-W5-01 | EKF state estimator | P0 | High |
| FR-W5-02 | EKF measurement update | P0 | High |
| FR-W5-03 | EKF covariance propagation | P0 | High |
| FR-W5-04 | LSTM/polynomial trajectory predictor | P0 | High |
| FR-W5-05 | 5-point prediction horizon | P0 | Medium |
| FR-W5-06 | Impact point estimator | P1 | Medium |
| FR-W5-07 | NATS prediction publisher | P0 | Low |
| FR-W5-08 | Supabase track enrichment | P0 | Low |
| FR-W5-09 | Confidence decay | P1 | Low |
| FR-W5-10 | Multi-track EKF management | P0 | Medium |
| FR-W5-11 | Coast/dropout handling | P1 | Low |

### 3.2 Non-Functional Requirements

| NFR | Requirement | Rationale |
|-----|-------------|-----------|
| NFR-01 | Prediction latency ≤ 200ms (p95) | Commander decision window is tight |
| NFR-02 | EKF RMSE ≤ 15m at t+1s | Minimum useful position accuracy |
| NFR-03 | Polynomial RMSE ≤ 50m at t+5s | Comparable to raw TdoaCorrelator accuracy |
| NFR-04 | EKF covariance positive-definite for 1000+ iterations | Numerical stability |
| NFR-05 | False impact rate < 1% for confidence > 0.5 | Trust with UA-04 civil defense |
| NFR-06 | Handles 50 simultaneous active tracks | Operational scale (up to 50 simultaneous threat objects) |
| NFR-07 | Test coverage ≥ 80% (branches/functions/lines/statements) | Wave-formation TDD law |
| NFR-08 | Service restarts within 10s via systemd | Operational availability |
| NFR-09 | Memory usage < 200 MB at 50 active tracks | Runs on existing fortress VM |
| NFR-10 | Zero additional npm production dependencies beyond NATS.js + Supabase | See DECISION_LOG §DL-W5-06 |

---

## 4. USER STORIES

### Epic 1: EKF State Estimation (FR-W5-01, FR-W5-02, FR-W5-03)

**US-W5-001**
As a C2 commander,
I want the system to produce a smooth, noise-filtered track position at every detection,
So that jitter from acoustic TDOA noise doesn't cause the track to jump erratically on the map.
*Acceptance: EKF filtered position has RMSE ≤ 15m vs ground truth in simulation.*

**US-W5-002**
As a C2 commander,
I want the EKF to estimate drone velocity in real time,
So that the system can project where the drone will be in the next 1–10 seconds.
*Acceptance: Velocity estimate converges within 5 measurements for a drone at constant velocity.*

**US-W5-003**
As an intelligence analyst,
I want to see the EKF state covariance over time for a given track,
So that I can assess the quality of the trajectory estimate and identify coast periods.
*Acceptance: track_positions table records covariance diagonal at every EKF cycle.*

**US-W5-004**
As a C2 commander,
I want the EKF to continue estimating position during brief measurement gaps (< 15 seconds),
So that a momentary node dropout does not cause the track to disappear from the map.
*Acceptance: EKF coasts for up to 15s with growing covariance, position extrapolated from velocity.*

**US-W5-005**
As a system operator,
I want the EKF to initialize correctly for a newly confirmed track with no velocity history,
So that predictions are available within 2 detection cycles (2 seconds).
*Acceptance: EKF accepts first measurement, initializes state at (lat, lon, alt, 0, 0, 0), first prediction published after second measurement.*

**US-W5-006**
As an EW operator,
I want velocity estimates in metres/second (not degrees/second),
So that I can compute range-rate for jamming system configuration.
*Acceptance: NATS prediction payload includes speed_ms (scalar ground speed) and heading_deg fields.*

**US-W5-007**
As an intelligence analyst,
I want the EKF state history archived for 7 days,
So that post-incident investigation can reconstruct the flight path.
*Acceptance: track_positions records survive 7 days; pg_cron job archives/deletes after 7 days.*

### Epic 2: Trajectory Prediction (FR-W5-04, FR-W5-05)

**US-W5-008**
As a C2 commander,
I want to see a dotted yellow-to-grey polyline on the CesiumJS globe showing where the drone will be in the next 10 seconds,
So that I can visually anticipate the threat trajectory.
*Acceptance: W4 dashboard renders 5-segment polyline when predicted_trajectory field populated on track.*

**US-W5-009**
As a C2 commander,
I want the predicted trajectory to update every second,
So that the polyline stays current as the drone maneuvers.
*Acceptance: Prediction published to NATS and Supabase at each EKF cycle (≥ 1 Hz).*

**US-W5-010**
As an EW operator,
I want predicted positions at t+1s, t+2s, t+3s, t+5s, and t+10s,
So that I can choose the appropriate lead time for my jamming system.
*Acceptance: PredictedPoint[] array always has 5 elements with horizonSeconds ∈ {1,2,3,5,10}.*

**US-W5-011**
As a C2 commander,
I want the prediction confidence to visually decay from yellow (t+1s) to grey (t+10s),
So that I understand that long-range predictions are less reliable.
*Acceptance: CesiumJS polyline segment colours implement confidence gradient as per DESIGN.md §3.1.*

**US-W5-012**
As an intelligence analyst,
I want to query historical predicted trajectories for any track,
So that I can compare what the system predicted vs what actually happened.
*Acceptance: predicted_trajectories table stores every prediction batch; get-predictions Edge Function returns paginated results.*

**US-W5-013**
As a system architect,
I want the trajectory predictor to work without a trained neural network model,
So that the W5 service can be deployed immediately without model training infrastructure.
*Acceptance: Polynomial extrapolation surrogate produces valid predictions when ONNX model not loaded.*

**US-W5-014**
As a system architect,
I want the trajectory predictor to be swappable between polynomial and ONNX models,
So that W6 can upgrade to neural prediction without changing the rest of the pipeline.
*Acceptance: TrajectoryForecaster implements a Predictor interface; both polynomial and ONNX backends implement it.*

### Epic 3: Impact Point Estimation (FR-W5-06)

**US-W5-015**
As a C2 commander,
I want to see a red X on the map at the predicted drone impact point,
So that I know which sector is at risk and can issue warnings accordingly.
*Acceptance: ImpactEstimate published to NATS and Supabase when drone has negative vAlt (descending) and alt > 0.*

**US-W5-016**
As a civil defense coordinator,
I want the impact confidence radius displayed as a circle on the map,
So that I can assess whether my area is within the threat envelope.
*Acceptance: W4 CesiumJS renders impact confidence circle (ellipse entity) at ±confidenceRadius metres.*

**US-W5-017**
As a civil defense coordinator,
I want impact estimates with confidence < 0.5 filtered out from civil defense alerts,
So that uncertain predictions don't trigger unnecessary evacuations.
*Acceptance: civil defense notification handler checks impact.confidence ≥ 0.5 before triggering alert.*

**US-W5-018**
As an intelligence analyst,
I want to see the history of impact estimates for a track,
So that I can understand how the predicted impact point evolved as the drone approached.
*Acceptance: impact_estimates table records every estimate; keyed by (track_id, estimated_at).*

**US-W5-019**
As a C2 commander,
I want the time-to-impact displayed next to the impact marker,
So that I know how many seconds remain to take action.
*Acceptance: ImpactEstimate.timeToImpactSeconds computed as -alt / vAlt; displayed as "T-Xs" label in CesiumJS.*

**US-W5-020**
As a C2 commander,
I want the impact estimate to disappear when the track is lost or the drone is no longer descending,
So that stale impact markers don't clutter the display.
*Acceptance: Impact entity removed from CesiumJS when track status = LOST or vAlt ≥ 0.*

### Epic 4: Multi-Track Management (FR-W5-10, FR-W5-11)

**US-W5-021**
As a system operator,
I want the W5 service to handle up to 50 simultaneous active tracks within the 200ms latency budget,
So that mass-drone swarm scenarios (Shahed-type attacks with multiple waves) are handled.
*Acceptance: Load test with 50 concurrent tracks shows p95 latency ≤ 200ms.*

**US-W5-022**
As a system operator,
I want the W5 service to automatically create an EKF instance when a new confirmed track appears,
So that no manual configuration is required per track.
*Acceptance: Supabase Realtime INSERT event on tracks with status=CONFIRMED triggers EKF initialization.*

**US-W5-023**
As a system operator,
I want the W5 service to automatically clean up EKF instances when a track times out,
So that memory doesn't grow unbounded during long operations.
*Acceptance: EKF instance deleted after 15s with no measurement; tracks.status set to LOST in Supabase.*

**US-W5-024**
As a system operator,
I want the W5 service to survive transient NATS disconnections (< 30s) without losing track state,
So that network blips don't cause all EKF instances to reset.
*Acceptance: NATS reconnect preserves in-memory EKF state; service reconnects within 30s with exponential backoff.*

**US-W5-025**
As a system operator,
I want the W5 service to load existing active tracks from Supabase on startup,
So that a service restart during an active operation doesn't lose all track context.
*Acceptance: On startup, EKF instances initialized for all tracks with status CONFIRMED/ACTIVE and last_seen < 60s ago.*

### Epic 5: Publisher + Track Enrichment (FR-W5-07, FR-W5-08, FR-W5-09)

**US-W5-026**
As a W4 dashboard,
I need prediction data on NATS subject sentinel.predictions.{trackId},
So that the CesiumJS overlay can update without polling.
*Acceptance: NATS payload matches PredictionOutput interface; published within 200ms of detection event.*

**US-W5-027**
As a W4 dashboard,
I need the tracks table predicted_trajectory column updated in Supabase,
So that Supabase Realtime triggers a dashboard re-render with the new prediction polyline.
*Acceptance: tracks.predicted_trajectory JSONB column upserted within 500ms of prediction generation.*

**US-W5-028**
As a system architect,
I want confidence to decay with prediction horizon using exponential decay,
So that the confidence values reflect the true uncertainty growth of a Kalman filter projection.
*Acceptance: confidence(t) = confidence(0) × exp(-0.15 × t) where t is seconds ahead.*

**US-W5-029**
As a C2 commander,
I want low-confidence predictions (< 0.3) visually muted on the display,
So that uncertain predictions don't create false urgency.
*Acceptance: CesiumJS polyline segments with confidence < 0.3 rendered at 30% opacity.*

**US-W5-030**
As a system operator,
I want prediction publishing to be rate-limited to prevent Supabase write overload,
So that W5 does not exhaust Supabase free-tier rate limits during sustained operations.
*Acceptance: Supabase writes ≤ 10/second across all tracks via token bucket; NATS unlimited.*

---

## 5. SUCCESS METRICS

### 5.1 Quantitative Acceptance Criteria (Gate 4 Exit)

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| EKF state RMSE at t+1s | ≤ 15m | Synthetic test: 100 simulated drone trajectories, compare EKF estimate vs ground truth |
| Polynomial RMSE at t+5s | ≤ 50m | Synthetic test: 100 trajectories, compare t+5s prediction vs actual |
| Prediction latency (p95) | ≤ 200ms | Vitest performance test: detection event → NATS publish timing |
| False impact rate (confidence ≥ 0.5) | < 1% | Synthetic test: impact point vs actual ground impact across 100 trajectories |
| EKF covariance positive-definite | 1000 iterations | Numerical stability test: check all eigenvalues > 0 after 1000 predict cycles |
| Max active tracks | 50 concurrent | Load test: 50 simultaneous tracks, all under 200ms p95 |
| Memory usage at 50 tracks | < 200 MB | Process memory measurement during load test |

### 5.2 Operational Impact Metrics (Post-Deployment)

| Metric | Pre-W5 Baseline | W5 Target |
|--------|-----------------|-----------|
| Commander warning time | 10–15 seconds | 30–45 seconds |
| Track position noise (1-sigma) | ±15m (raw TDOA) | ±5m (EKF filtered) |
| Impact point accuracy (test range) | N/A | ±50m at 95th percentile |
| Trajectory data available for analysis | No | Yes (7-day history) |

---

## 6. CONSTRAINTS AND DEPENDENCIES

### 6.1 Hard Constraints

1. **W3 TdoaCorrelator must provide errorM field** — W5 uses this as measurement noise. If errorM not present, default R = diag(15², 15², 25) (15m horizontal, 5m vertical noise).
2. **NATS must be running on fortress VM** — W5 service depends on NATS connection for all input/output.
3. **Supabase project bymfcnwfyxuivinuzurr** — W5 migrations must be applied before service start.
4. **tracks.status column** — W5 depends on tracks.status ∈ {'CONFIRMED', 'ACTIVE', 'LOST'}. W3 must maintain this.

### 6.2 W4 Dashboard Dependency

W4 dashboard must be updated to render prediction overlay (DESIGN.md §9). This is a separate deployment but low-risk (additive changes only — if predicted_trajectory is null, dashboard renders as W4 today).

### 6.3 Node.js Version

Node.js 20 LTS required (Float64Array, built-in crypto for any hash operations). Node 18 may work but is unsupported.

---

## 7. RISK REGISTER (PRODUCT VIEW)

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| EKF diverges for fast-maneuvering drones | Medium | High | Singer process model accounts for maneuver uncertainty; coast detection resets diverged tracks |
| Polynomial extrapolation insufficient for sharp turns | High | Medium | Confidence decay ensures low-confidence predictions at t+5s, t+10s; ONNX upgrade in W6 |
| Supabase write rate limits hit during mass attack (50 drones) | Low | Medium | Token bucket limiter at 10 writes/s; NATS is primary real-time channel |
| NATS fortress VM unavailable | Low | Critical | Service fails gracefully; restarts via systemd with backoff; NATS HA (W7 scope) |
| EKF numerical instability (non-PD covariance) | Low | High | Joseph form covariance update; positive-definiteness check after each update |
| False impact alert triggers civilian panic | Low | Critical | Confidence gate ≥ 0.5 for civil defense channel; operator-only channel for lower confidence |

---

## 8. TIMELINE

| Phase | Days | Deliverables |
|-------|------|--------------|
| P1 — EKF Core | 1–7 | EKF predict/update, unit tests (TDD RED → GREEN) |
| P2 — Predictor + Publisher | 8–14 | Polynomial forecaster, NATS publisher, confidence decay |
| P3 — Impact + DB | 15–21 | Impact estimator, Supabase enrichment, multi-track manager |
| P4 — W4 Integration | 22–28 | CesiumJS overlay, impact marker, OpenMCT plugin |
| P5 — Hardening | 29–35 | Load test, performance profiling, ONNX plan, deployment |

Total: 35 days. See ROADMAP.md for full phase breakdown.

---

## 9. DETAILED USER STORY BREAKDOWN BY FR

### 9.1 FR-W5-01 — EKF State Estimator Stories

**US-W5-031**
As a signal analyst,
I want to see the EKF state converge after 5 measurements for a constant-velocity drone,
So that I can trust the velocity estimate for threat classification.
*Acceptance: EKFPredictor test shows velocity estimate within 10% of true value by t+5s.*

**US-W5-032**
As a C2 commander,
I want the EKF to not diverge when the TDOA measurement has a gross error (>50m spike),
So that one bad acoustic correlation doesn't derail the track.
*Acceptance: Single 50m outlier measurement: EKF state moves < 20m, covariance self-corrects within 3 measurements.*

**US-W5-033**
As a system operator,
I want EKF instances to be initialized from Supabase track records on service restart,
So that a W5 service restart during an operation does not lose all context.
*Acceptance: Startup loads tracks with last_seen < 60s, initializes EKF at (lat, lon, alt, 0, 0, 0) from latest track record.*

### 9.2 FR-W5-02 + FR-W5-03 — Covariance Stories

**US-W5-034**
As an intelligence analyst,
I want the EKF position uncertainty (sigma) displayed in metres in the OpenMCT panel,
So that I can distinguish a high-quality 5m sigma track from a poor 30m sigma track.
*Acceptance: track_positions.position_sigma_m column populated at every EKF cycle.*

**US-W5-035**
As a system operator,
I want an alert when EKF covariance becomes numerically invalid (non-positive-definite),
So that I know a track is degraded and should be investigated.
*Acceptance: isCovariacePD() check after every update; WARN log if false; covariance reset to large initial.*

### 9.3 FR-W5-04 — Predictor Stories

**US-W5-036**
As a system architect,
I want the predictor backend to be swappable via environment variable (USE_ONNX_MODEL),
So that W6 can enable the ONNX model on fortress VM without a code deploy.
*Acceptance: USE_ONNX_MODEL=false → PolynomialPredictor; USE_ONNX_MODEL=true + model file present → OnnxPredictor; USE_ONNX_MODEL=true + no model file → WARN log, fall back to PolynomialPredictor.*

**US-W5-037**
As an intelligence analyst,
I want to know which prediction model generated a trajectory (polynomial vs ONNX),
So that I can calibrate my confidence in the predictions during the ONNX rollout period.
*Acceptance: PredictionOutput.modelVersion field set to 'polynomial-v1' or 'onnx-lstm-v1'.*

### 9.4 FR-W5-06 — Impact Stories

**US-W5-038**
As a C2 commander,
I want the time-to-impact countdown to decrease in real time,
So that I can see the urgency change second by second.
*Acceptance: NATS impact message publishes updated timeToImpactSeconds at each 1Hz EKF cycle (not just when lat/lon changes significantly).*

**US-W5-039**
As an EW operator,
I want the impact estimate to show the drone's incoming speed and heading,
So that I can orient my jamming system correctly.
*Acceptance: ImpactMessage includes source EKF state with speedMs and headingDeg.*

**US-W5-040**
As a system operator,
I want impact estimates cleared from the C2 display within 2 seconds when a track is lost,
So that stale impact markers don't persist after the drone is gone.
*Acceptance: When track.status = LOST, W5 publishes impact message with confidence=0; W4 removes impact entity on confidence=0 message.*

---

## 10. OPERATIONAL SCENARIOS

### 10.1 Scenario A: Single FPV Drone Attack

```
T+0s:   Sensor nodes detect acoustic signature
T+2s:   W3 TdoaCorrelator confirms track TRACK-001
T+2s:   W5 creates EKFInstance for TRACK-001, publishes first prediction (low confidence — 1 measurement)
T+3s:   Second detection: EKF update, velocity estimated
T+5s:   Third detection: EKF converged (σ ≈ 8m), polynomial has 3 history points
         Prediction confidence at t+1s ≈ 0.89
         Impact estimate: lat/lon ±35m, confidence 0.61
         W4 shows yellow polyline + red X impact marker
T+15s:  Track descending at -8 m/s, impact in 12s
         EW operator pre-aims at predicted t+5s position
T+25s:  EW jammer activated at t+5s predicted position
T+27s:  Drone jammed / diverts or impacts at predicted ±40m location
T+27s:  W5 detects track lost (node dropout), coast timer starts
T+42s:  Coast timeout (15s), track status → LOST, EKF instance dropped
         Impact marker cleared from W4 display
```

### 10.2 Scenario B: Swarm Attack (10 Drones Simultaneously)

```
T+0s:   10 drones launched simultaneously
T+5s:   W3 confirms 10 separate tracks (TRACK-001 through TRACK-010)
T+5s:   W5 creates 10 EKFInstances, begins publishing 10 prediction streams
         NATS: 10 msg/s on sentinel.predictions.*
         Supabase: token bucket = 10 writes/s shared across all tracks
         (each track updated via Supabase once per second — acceptable)
T+10s:  All 10 tracks have converged EKF, predictions at ≤ 200ms latency
         Commander sees 10 impact markers on CesiumJS globe
T+15s:  3 drones jammed (EW), 7 continue
         W5 continues tracking remaining 7 (3 tracks coast then drop)
T+35s:  5 drones impact within ±50m of predicted impact points
         2 drones diverted by EW (trajectory changed, predictions update)
         After diversion: polynomial predictor captures new trajectory within 3 cycles
```

### 10.3 Scenario C: Shahed-Type Long-Range Cruise Missile

```
Note: Shahed-136 speed ≈ 185 km/h = 51 m/s

T+0s:   Shahed detected by 3+ acoustic nodes
T+2s:   W3 confirms track SHAHED-001
T+2s:   W5 EKF initialized, measurement noise R scaled for higher speed
         (σ_a may need tuning: Shahed maneuvers less than FPV → σ_a = 2 m/s²)
T+5s:   EKF converged: speed 51 m/s, heading consistent
T+10s:  Impact estimate: 8 minutes away (480s), t_impact > 120s → null (not reported)
T+100s: Drone descends to 500m MSL, t_impact = 100s → still null (> 120s)
T+160s: Drone at 400m MSL, vAlt = -3.3 m/s, t_impact = 121s → null
T+200s: Drone at 200m MSL, vAlt = -5 m/s, t_impact = 40s → impact published!
         Confidence ≈ 0.35 (large sigmaM due to 40s extrapolation)
         Commander receives 40s warning — actionable for area shelter-in-place
```

---

*PRD.md — APEX-SENTINEL W5 — Generated 2026-03-24*
*Total: 600+ lines | Status: APPROVED | Next: ARCHITECTURE.md*
