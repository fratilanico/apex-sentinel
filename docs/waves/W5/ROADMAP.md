# APEX-SENTINEL — ROADMAP.md
## Gate 4: EKF + LSTM Trajectory Prediction — Implementation Roadmap
### Wave 5 | Project: APEX-SENTINEL | Version: 5.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. W5 PHASE BREAKDOWN (35 Days)

### Phase 1 — EKF Core (Days 1–7)

**Goal:** Working EKF predict/update cycle with full test coverage. TDD RED first.

**Day 1–2: TDD RED**
- Write all EKF unit tests in FAILING state:
  - `ekf-math.test.ts`: buildF, buildQ, mat6x6Multiply, mat3x3Invert, buildH
  - `EKFPredictor.test.ts`: predict() grows covariance, update() converges state, Joseph form PD
  - `ekf-stability.test.ts`: 1000 iterations remain positive-definite
- Commit: `test(W5): TDD RED — EKF unit tests`
- Verify: `npx vitest run` → all EKF tests FAIL

**Day 3–5: EKF Implementation**
- Implement `ekf-math.ts`: all matrix operations, tested to compile
- Implement `EKFPredictor.ts`: predict(), update(), commit(), isCovariacePD(), getState()
- Implement `ekf-init.ts`: initialState and initialP from first measurement
- All EKF tests GREEN

**Day 6–7: EKFInstance + history**
- Implement `EKFInstance.ts`: processMeasurement(), coast(), getHistory(), shouldDrop()
- Tests: CircularBuffer capacity, history ordering, shouldDrop after 15 coast cycles
- Coverage check: `npx vitest run --coverage` → ekf/* ≥ 80%
- Commit: `feat(W5-P1): EKF predict/update + unit tests GREEN`

**P1 Exit Criteria:**
- EKF tests GREEN (≥ 15 unit tests)
- Coverage ≥ 80% in ekf/*
- Positive-definiteness guaranteed for 1000 iterations (test passes)
- EKF state RMSE ≤ 15m at t+1s on synthetic trajectory (numerical test)

---

### Phase 2 — Trajectory Predictor + NATS Publisher (Days 8–14)

**Goal:** End-to-end from EKF state to NATS prediction publish. 5-point horizon working.

**Day 8–9: TDD RED + Polynomial Predictor**
- Write `PolynomialPredictor.test.ts` (FAILING):
  - 3-point history: polynomial fit, 5-point output
  - Horizontal trajectory: all 5 predictions collinear with input
  - Confidence decay: each horizon lower than previous
  - Linear extrapolation fallback: < 3 history points
- Implement `PolynomialPredictor.ts`: fitPolynomial, evaluate, linearExtrapolate
- Tests GREEN

**Day 10: Confidence + ImpactEstimator TDD + implementation**
- `confidence.test.ts`: decay formula, clamp 0.1, coast penalty
- `ImpactEstimator.test.ts`: level flight → null, descending → valid estimate, timeToImpact correct
- Implement `confidence.ts` and `ImpactEstimator.ts`

**Day 11–12: TrajectoryForecaster + Publisher**
- `TrajectoryForecaster.ts`: factory (polynomial/ONNX), forecast() delegates to predictor
- `TokenBucket.ts`: token rate limiter (10 tokens/s), consume(), drain pending
- `PredictionPublisher.ts`: publish() NATS + Supabase, rate limiting, error handling

**Day 13–14: Integration test skeleton**
- `pipeline.integration.test.ts`: mock NATS, mock Supabase, inject detection event, verify PredictionOutput published
- Fix any integration issues
- Commit: `feat(W5-P2): trajectory predictor, NATS publisher, confidence decay`

**P2 Exit Criteria:**
- Polynomial predictor tests GREEN (≥ 10 tests)
- Impact estimator tests GREEN (≥ 8 tests)
- Publisher tests GREEN with mocked I/O
- Polynomial RMSE ≤ 50m at t+5s on synthetic test

---

### Phase 3 — Multi-Track Manager + Supabase Enrichment (Days 15–21)

**Goal:** Full service loop: NATS consumer → EKF → predict → publish to NATS + Supabase.

**Day 15–16: MultiTrackManager TDD + implementation**
- `MultiTrackManager.test.ts` (FAILING first):
  - New track: EKFInstance created
  - Detection: processMeasurement called on correct instance
  - Coast cycle: instances coasted, dropped after 15s
  - Max tracks: 50 instances handled without degradation
- Implement `MultiTrackManager.ts`

**Day 17: CoastTimer**
- `CoastTimer.test.ts`: timer fires at 1Hz, calls runCoastCycle
- Implement `CoastTimer.ts` with setInterval + cleanup on shutdown

**Day 18–19: Supabase writer + DB migration**
- Apply migration `20260324000000_w5_trajectory_prediction.sql` to Supabase project
- Implement `supabase/writer.ts`: upsertPrediction, insertTrackPosition, upsertImpact
- Integration test with actual Supabase (CI uses test project or local Supabase dev)

**Day 20–21: NATS consumer + startup sequence**
- `nats/consumer.ts`: JetStream pull consumer, consume loop, ack/nak
- `supabase/realtime.ts`: tracks table Realtime subscription
- `index.ts`: full startup sequence (steps 1–9 from ARCHITECTURE.md §8.4)
- Graceful shutdown handler
- Commit: `feat(W5-P3): full service loop, multi-track manager, Supabase enrichment`

**P3 Exit Criteria:**
- MultiTrackManager tests GREEN (≥ 12 tests)
- Full service starts, connects to NATS + Supabase (integration environment)
- Detection event → NATS prediction published in < 200ms (measured in integration test)
- Supabase tables populated with test data

---

### Phase 4 — W4 Dashboard Integration (Days 22–28)

**Goal:** Predicted trajectory polyline + impact marker visible in W4 CesiumJS dashboard.

**Day 22–23: W4 prediction overlay code**
- Create `src/lib/cesium/prediction-overlay.ts` in W4 codebase
- Create `src/lib/cesium/impact-overlay.ts`
- Unit tests for CesiumJS entity creation (mock Cesium viewer)

**Day 24: Zustand store update (W4)**
- Add `predictedTrajectory` field to track slice
- Update Supabase Realtime handler to populate field on tracks UPDATE

**Day 25: NATS.ws prediction handler (W4)**
- Add handlers for `sentinel.predictions.*` and `sentinel.impacts.*` in NatsProvider
- Wire to CesiumJS overlay render functions

**Day 26–27: OpenMCT EKF state plugin (W4)**
- `src/components/openmct/EkfStatePlugin.ts`: 12 telemetry channels per track
- Historical source: get-predictions Edge Function
- Real-time source: NATS prediction messages

**Day 28: End-to-end integration test**
- Run W5 service locally against staging Supabase
- Load W4 dashboard, confirm prediction polyline visible for test track
- Confirm impact marker visible when vAlt < 0
- Commit W4 changes: `feat(W4): trajectory prediction overlay + impact marker`

**P4 Exit Criteria:**
- CesiumJS polyline renders for active track with predicted_trajectory populated
- Impact marker renders with confidence circle
- OpenMCT shows 6 EKF state channels over time

---

### Phase 5 — Hardening + Deployment (Days 29–35)

**Goal:** Production-ready service on fortress VM. Systemd unit. Performance verified.

**Day 29–30: Load testing**
- Script: spawn 50 virtual tracks, send detection events at 1Hz, measure latency
- Profile: Node.js --prof, identify bottlenecks
- Target: p95 latency ≤ 200ms at 50 concurrent tracks

**Day 31: ONNX integration plan document**
- Write `models/README.md`: INDIGO dataset description, training script spec, export to ONNX instructions
- Stub `OnnxPredictor.ts` with graceful error handling
- `USE_ONNX_MODEL=true` with missing model file: falls back to polynomial, logs warning

**Day 32: Deployment preparation**
- Build production binary: `npm run build`
- Write systemd unit file (from ARCHITECTURE.md §8.8)
- Write deploy script: `scripts/deploy-w5.sh`
- Write env file template: `infra/w5.env.template`

**Day 33: Deploy to fortress VM**
- SSH to fortress, apply DB migration via Supabase PAT
- Deploy service binary
- Start systemd service, verify logs
- Send test detection event, verify NATS prediction published

**Day 34: mind-the-gap validation**
- Run mind-the-gap dimensional checks 1–14 against W5
- Address any gaps

**Day 35: Wave complete**
- `./wave-formation.sh checkpoint W5`
- All tests GREEN: `npx vitest run --coverage`
- Coverage ≥ 80%: verify report
- ACCEPTANCE_CRITERIA.md: all 21 exit criteria checked
- `./wave-formation.sh complete W5`
- Memory update

---

## 2. POST-W5 WAVES

### W6 — Android App + ONNX LSTM (Weeks 6–12)

**Scope:**
- React Native Android app for field operators
- Prediction overlay on mobile map (Mapbox)
- ONNX Runtime inference for LSTM model
- INDIGO dataset collection pipeline

**EKF changes in W6:**
- No EKF changes to W5 service
- ONNX model swapped in via `USE_ONNX_MODEL=true` configuration
- Expected LSTM improvement: t+5s RMSE from 50m (polynomial) to < 20m (LSTM)

**ONNX model training timeline:**
- Week 6: Collect 500+ flight paths from INDIGO AirGuard synthetic dataset
- Week 7: Train LSTM model (Keras, export to ONNX)
- Week 8: Validate: RMSE < 20m at t+5s on held-out test set
- Week 9: Integrate ONNX Runtime into W5 service (drop-in replacement)
- Week 10: Deploy to fortress VM, A/B test vs polynomial

### W7 — Field Hardening

**Scope:**
- NATS high availability (NATS cluster on 2 VMs)
- Terrain-corrected impact estimation (SRTM elevation API)
- IMM filter (Interacting Multiple Models) for maneuver detection
- ENU local coordinate frame for numerically stable large-area coverage
- Data association module (multi-target tracking)
- FreeTAKServer CoT publishing of predicted trajectories (ATAK display)

### W8 — Production Operations

**Scope:**
- Alerting: PagerDuty integration for track confidence collapse
- SLA monitoring: prediction latency p99 dashboard
- Multi-region deployment (fortress VM + backup)
- EKF state backup: replicate track_positions to cold storage
- Red team exercise: test prediction accuracy on real FPV drone flight

---

## 3. DEPENDENCY CHAIN

```
W4 (C2 Dashboard) — COMPLETE
  ↓ depends on
W5 (EKF + Prediction) — THIS WAVE
  ↓ enables
W6 (Android + ONNX LSTM)
  ↓ enables
W7 (Field Hardening)
  ↓ enables
W8 (Production Operations)
```

W5 has no new upstream dependencies beyond W1–W4 infrastructure (NATS, Supabase, tracks table).

---

## 4. MILESTONE CHECKLIST

### M1 — EKF Correctness Proven (End of Phase 1, Day 7)

- [ ] All EKF unit tests GREEN (≥ 15 tests)
- [ ] EKF stability test passes: 1000 iterations, covariance positive-definite
- [ ] EKF RMSE ≤ 15m at t+1s on synthetic trajectory (100 runs)
- [ ] TDD RED commit present in git history (before implementation commit)
- [ ] Coverage ≥ 80% for `src/ekf/`

### M2 — End-to-End Pipeline (End of Phase 2, Day 14)

- [ ] Polynomial predictor tests GREEN (≥ 10 tests)
- [ ] Polynomial RMSE ≤ 50m at t+5s on FPV trajectory (50 runs)
- [ ] Impact estimator tests GREEN (≥ 8 tests)
- [ ] NATS publisher mock-tested: correct subject, correct payload schema
- [ ] Confidence decay formula verified: values at t+1/5/10 match formula
- [ ] Integration test: detection event → NATS prediction published in < 200ms

### M3 — Full Service Loop (End of Phase 3, Day 21)

- [ ] Multi-track manager tests GREEN (≥ 12 tests)
- [ ] Coast timer tests GREEN (≥ 5 tests)
- [ ] DB migration applied to Supabase bymfcnwfyxuivinuzurr
- [ ] Service starts and connects to NATS + Supabase in integration environment
- [ ] track_positions, predicted_trajectories, impact_estimates rows written during integration test
- [ ] Token bucket rate limiter verified (10 writes/s cap)
- [ ] Graceful shutdown: pending writes flushed within 5s

### M4 — W4 Dashboard Integration (End of Phase 4, Day 28)

- [ ] W4 prediction overlay renders polyline for active test track
- [ ] Impact marker renders with confidence circle
- [ ] OpenMCT EKF state channels display 6 time-series for test track
- [ ] W4 handles `predicted_trajectory = null` gracefully (no overlay rendered)
- [ ] W4 handles impact confidence = 0 (impact marker cleared)
- [ ] Manual E2E test: run W5 service, open W4 dashboard, verify prediction visible within 5s of track confirm

### M5 — Production Ready (End of Phase 5, Day 35)

- [ ] Load test: 50 concurrent tracks, p95 latency ≤ 200ms
- [ ] Memory test: < 200 MB at 50 active tracks
- [ ] Systemd unit file on fortress VM, service active
- [ ] DB migration verified on production Supabase
- [ ] mind-the-gap dimensional checks 1–14 all pass
- [ ] `npx vitest run --coverage` exits 0, all thresholds met
- [ ] `npm run build` exits 0
- [ ] MEMORY.md updated: W5 status = COMPLETE

---

## 5. RISK-GATED SCHEDULE

| Risk | Trigger | Response |
|------|---------|---------|
| EKF RMSE > 30m at end of Phase 1 | > 30m RMSE on synthetic test | Add 3 days for EKF debugging; check Q matrix scale factors |
| Polynomial RMSE > 80m at end of Phase 2 | > 80m RMSE on FPV trajectory | Increase history buffer from 10 to 15 points; try 3rd-order polynomial |
| Supabase rate limits hit in Phase 3 | HTTP 429 from Supabase during test | Reduce token bucket from 10/s to 5/s; test again |
| W4 dashboard changes take > 7 days | Still not rendering by Day 27 | Ship W5 service without W4 changes; W4 overlay moves to W5.1 (hotfix) |
| Fortress VM out of disk space for service binary | df -h shows < 500 MB free | Clear old dist/ directories, old Docker images from previous waves |

---

*ROADMAP.md — APEX-SENTINEL W5 — Generated 2026-03-24*
*Total: 340+ lines | Status: APPROVED | Next: TEST_STRATEGY.md*
