# APEX-SENTINEL — ACCEPTANCE_CRITERIA.md
## Gate 4: EKF + LSTM Trajectory Prediction — Wave Exit Criteria
### Wave 5 | Project: APEX-SENTINEL | Version: 5.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. WAVE-FORMATION EXIT CRITERIA (UNIVERSAL)

All must be checked before `./wave-formation.sh complete W5`:

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| WF-01 | 11+ PROJECTAPEX docs written in `docs/waves/W5/` | OPEN | This file is doc #10 |
| WF-02 | TDD RED committed before any implementation | OPEN | — |
| WF-03 | All tests GREEN: `npx vitest run` exits 0 | OPEN | — |
| WF-04 | Coverage ≥ 80% branches/functions/lines/statements | OPEN | — |
| WF-05 | mind-the-gap dimensional checks 1–14 pass (8/8 on W5 dimensions) | OPEN | — |
| WF-06 | `npm run build` exits 0 (TypeScript compile clean) | OPEN | — |
| WF-07 | `npx tsc --noEmit` exits 0 (type check clean) | OPEN | — |
| WF-08 | MEMORY.md updated with W5 status | OPEN | — |
| WF-09 | W5 service running on fortress VM under systemd | OPEN | — |
| WF-10 | W4 dashboard updated: prediction overlay renders | OPEN | — |

---

## 2. FUNCTIONAL ACCEPTANCE CRITERIA

### FR-W5-01: EKF State Estimator

| # | Criterion | Target | Test |
|---|-----------|--------|------|
| AC-01-01 | EKF predict step advances lat/lon/alt by velocity × dt | Exact (numerical) | `EKFPredictor.test.ts` predict advances position |
| AC-01-02 | EKF preserves velocity during predict (constant-velocity model) | Exact | `EKFPredictor.test.ts` velocity unchanged |
| AC-01-03 | EKF initializes from first measurement with zero velocity | State = [lat,lon,alt,0,0,0] | `ekf-init.test.ts` |
| AC-01-04 | EKF handles dt=0 (duplicate timestamp) without crash | No state change | Edge case test |
| AC-01-05 | EKF getState() returns typed EKFStateVector | TypeScript compile | tsc --noEmit |

### FR-W5-02: EKF Measurement Update

| # | Criterion | Target | Test |
|---|-----------|--------|------|
| AC-02-01 | Update step moves state toward measurement | State between prior and measurement | `EKFPredictor.test.ts` update convergence |
| AC-02-02 | Update with perfect measurement (R→0) snaps state to measurement | State ≈ measurement | Numerical test |
| AC-02-03 | Update with R from errorM=8 correctly scales Kalman gain | K = P×H'×(H×P×H'+R)^-1 | Formula verification test |
| AC-02-04 | Innovation output = z - H×x_pred | Exact | Innovation test |
| AC-02-05 | Stale measurement (t < lastUpdate) skipped silently | State unchanged, no exception | Stale message test |

### FR-W5-03: EKF Covariance Propagation

| # | Criterion | Target | Test |
|---|-----------|--------|------|
| AC-03-01 | Covariance grows during predict (no measurement) | P_pred > P_prev (diagonal) | `EKFPredictor.test.ts` covariance grows |
| AC-03-02 | Covariance shrinks during update (good measurement) | P_upd < P_pred (diagonal) | Update reduces covariance test |
| AC-03-03 | Covariance positive-definite after 1000 predict cycles | All diagonal > 0, all finite | `ekf-stability.test.ts` 1000 predict PD |
| AC-03-04 | Covariance positive-definite after 1000 predict+update cycles | All diagonal > 0 | `ekf-stability.test.ts` 1000 full cycle PD |
| AC-03-05 | Joseph form used (not simplified) | Code review | Implementation review |

### FR-W5-04: LSTM / Polynomial Predictor

| # | Criterion | Target | Test |
|---|-----------|--------|------|
| AC-04-01 | Polynomial predictor accepts minimum 3 history points | No exception | `PolynomialPredictor.test.ts` 3-point input |
| AC-04-02 | Linear fallback for < 3 history points | Valid output | `PolynomialPredictor.test.ts` fallback |
| AC-04-03 | Polynomial fit passes through all 10 input points (R²≥0.99 for straight line) | Fit quality | Straight-line fit test |
| AC-04-04 | Predicted alt clamped to ≥ 0 | No negative altitude | Alt clamp test |
| AC-04-05 | Predictor interface: both polynomial and ONNX stub implement same interface | TypeScript | tsc --noEmit |

### FR-W5-05: Prediction Horizon

| # | Criterion | Target | Test |
|---|-----------|--------|------|
| AC-05-01 | Output always contains exactly 5 PredictedPoint objects | len=5 | `PolynomialPredictor.test.ts` 5 points |
| AC-05-02 | horizonSeconds values are exactly {1, 2, 3, 5, 10} | Exact values | Horizon values test |
| AC-05-03 | sigmaM grows with horizon (later predictions less certain) | sigmaM(10) > sigmaM(1) | Sigma growth test |

### FR-W5-06: Impact Point Estimator

| # | Criterion | Target | Test |
|---|-----------|--------|------|
| AC-06-01 | Returns null for level or ascending flight | null for vAlt ≥ -0.5 | `ImpactEstimator.test.ts` |
| AC-06-02 | timeToImpact = alt / abs(vAlt) | Exact numerical | timeToImpact test |
| AC-06-03 | Impact lat/lon = current + velocity × tImpact | Exact | Position extrapolation test |
| AC-06-04 | Returns null for tImpact > 120s | null | Long-horizon cap test |
| AC-06-05 | confidenceRadius ≤ 500m | ≤ 500 | Cap test |
| AC-06-06 | False impact rate < 1% for confidence ≥ 0.5 on 100 synthetic trajectories | < 1 false per 100 | Batch accuracy test |

### FR-W5-07: Prediction Publisher (NATS)

| # | Criterion | Target | Test |
|---|-----------|--------|------|
| AC-07-01 | NATS subject = `sentinel.predictions.{trackId}` | Exact string | Publisher mock test |
| AC-07-02 | Impact subject = `sentinel.impacts.{trackId}` | Exact string | Impact publish test |
| AC-07-03 | Prediction published within 200ms of detection event (p95) | ≤ 200ms | Latency integration test |
| AC-07-04 | NATS reconnect within 30s after disconnect | Reconnects | Reconnect test (manual) |

### FR-W5-08: Track Enrichment (Supabase)

| # | Criterion | Target | Test |
|---|-----------|--------|------|
| AC-08-01 | `tracks.predicted_trajectory` updated within 500ms of prediction | ≤ 500ms | Integration test |
| AC-08-02 | `track_positions` row inserted for every EKF cycle | Row count increases | DB integration test |
| AC-08-03 | `predicted_trajectories` row inserted for every prediction batch | Row count increases | DB integration test |
| AC-08-04 | `impact_estimates` upserted when impact estimate available | Row present | DB integration test |
| AC-08-05 | Supabase failure does not crash service (NATS still publishes) | Service continues | Error resilience test |

### FR-W5-09: Confidence Decay

| # | Criterion | Target | Test |
|---|-----------|--------|------|
| AC-09-01 | confidence(t) = c₀ × exp(-0.15 × t) | Formula verification | Confidence formula test |
| AC-09-02 | Confidence at t+1s ≈ 0.86 × c₀ | ±0.01 | Numerical test |
| AC-09-03 | Confidence at t+10s ≈ 0.22 × c₀ | ±0.01 | Numerical test |
| AC-09-04 | Coasting penalty: 0.85 per coast cycle | Formula | Coast confidence test |
| AC-09-05 | Minimum confidence clamped to 0.1 | ≥ 0.1 always | Clamp test |

### FR-W5-10: Multi-Track EKF Management

| # | Criterion | Target | Test |
|---|-----------|--------|------|
| AC-10-01 | New detection creates EKFInstance if trackId not in Map | Map grows | Manager create test |
| AC-10-02 | Existing trackId reuses EKFInstance (no reset) | Same instance | Manager reuse test |
| AC-10-03 | 50 simultaneous tracks all processed at p95 ≤ 200ms | ≤ 200ms | Load test |
| AC-10-04 | New confirmed track via Supabase Realtime creates instance | Instance created | Realtime handler test |
| AC-10-05 | removeTrack(id) removes instance from Map | Map shrinks | Remove test |

### FR-W5-11: Coast / Dropout

| # | Criterion | Target | Test |
|---|-----------|--------|------|
| AC-11-01 | Coast cycle runs predict() only (no update) | Update not called | Coast cycle test |
| AC-11-02 | coastCount increments every coast cycle | +1 per cycle | Coast counter test |
| AC-11-03 | shouldDrop() returns true after 15 coast cycles | After 15 cycles | Drop threshold test |
| AC-11-04 | Dropped instance removed from Map | Map shrinks | Dropout full lifecycle test |
| AC-11-05 | tracks.status updated to LOST when dropped | Supabase write | Dropout DB write test |
| AC-11-06 | isCoasting flag in NATS output after 2 coast cycles | isCoasting=true | Coast flag test |

---

## 3. NUMERICAL ACCURACY CRITERIA

| Criterion | Target | Method |
|-----------|--------|--------|
| EKF state RMSE at t+1s | ≤ 15m | 100 synthetic constant-velocity trajectories, 15m TDOA noise |
| EKF state RMSE after convergence (>5 measurements) | ≤ 8m | Same trajectories, post-convergence only |
| Polynomial RMSE at t+5s | ≤ 50m | 100 synthetic FPV trajectories, evaluate t+5s prediction vs actual |
| Polynomial RMSE at t+1s | ≤ 20m | Same trajectories |
| Impact point error at 95th percentile | ≤ 50m | 100 synthetic descending trajectories |
| False impact (confidence ≥ 0.5, error > 100m) | < 1% | Same trajectories |
| EKF covariance positive-definite | 1000 iterations | Stability test (both predict-only and predict+update) |

---

## 4. PERFORMANCE CRITERIA

| Criterion | Target | Method |
|-----------|--------|--------|
| Detection → NATS publish latency (p95) | ≤ 200ms | Integration test with timing |
| Memory at 50 active tracks | ≤ 200 MB | process.memoryUsage() during load test |
| CPU at 50 active tracks, 1 Hz each | ≤ 20% single core | Load test profiling |
| Service startup time | ≤ 10s | systemd unit OnStarted timing |
| Supabase write rate under load | ≤ 10/s (token bucket enforced) | Rate counter during load test |

---

## 5. OPERATIONAL CRITERIA

| Criterion | Target |
|-----------|--------|
| Service running on fortress VM | `systemctl status apex-sentinel-w5` = active (running) |
| Service restarts on failure | `Restart=on-failure` in unit file |
| Systemd unit in git | `infra/apex-sentinel-w5.service` committed |
| Env file template in git | `infra/w5.env.template` committed (no secrets) |
| Logs structured JSON | `journalctl -u apex-sentinel-w5 \| jq` parses all lines |
| W4 prediction overlay visible | Manual test: active track shows yellow polyline in CesiumJS |
| W4 impact marker visible | Manual test: descending track shows red X marker with confidence circle |
| W4 OpenMCT EKF channels | Manual test: 6 EKF state channels visible for active track |

---

## 6. MIND-THE-GAP DIMENSIONAL CHECKS (W5)

Gate 4 requires 8/8 on the W5-specific mind-the-gap checks (FDRP dimensions):

| Dimension | Check | Pass Condition |
|-----------|-------|---------------|
| D1 — Functional Completeness | All 11 FRs have at least 1 passing test | 11/11 FRs have GREEN tests |
| D2 — State Machine Correctness | EKFInstance: NEW → ACTIVE → COASTING → DROPPED | State transitions tested |
| D3 — Numerical Stability | EKF covariance PD after 1000 cycles | Stability test GREEN |
| D4 — Latency | Detection → NATS publish ≤ 200ms (p95) | Latency integration test |
| D5 — Data Schema | PredictionOutput matches published interface (no extra/missing fields) | JSON schema validation test |
| D6 — Error Resilience | NATS disconnect + reconnect: EKF state preserved | Reconnect test |
| D7 — Security | Impact estimates behind operator role (not civil_defense at confidence < 0.5) | RLS tested |
| D8 — Deployment | Systemd unit active on fortress VM, service survives `systemctl restart` | Manual deploy check |

---

## 7. TEST VERIFICATION COMMANDS

Commands that must all exit 0 before wave:complete:

```bash
# Unit + integration tests
cd /opt/apex-sentinel/w5 && npx vitest run

# Coverage gate
npx vitest run --coverage
# Output must show: Branches: ≥80% | Functions: ≥80% | Lines: ≥80%

# TypeScript compile
npx tsc --noEmit

# Build
npm run build

# Linting
npm run lint

# Service health on fortress
ssh -i ~/.ssh/azure_apex_os root@100.68.152.56 \
  "systemctl is-active apex-sentinel-w5 && echo OK"

# DB migration applied
# (verify tables exist in Supabase MCP or via direct query)
```

---

## 8. SIGN-OFF CHECKLIST

| Sign-off item | Owner | Status |
|--------------|-------|--------|
| All ACCEPTANCE_CRITERIA.md criteria checked | Engineer | OPEN |
| DECISION_LOG.md has decision for every non-obvious choice | Architect | OPEN |
| TEST_STRATEGY.md tests match actual test file names | QA | OPEN |
| ARCHITECTURE.md systemd unit matches deployed unit file | DevOps | OPEN |
| DATABASE_SCHEMA.md migration matches applied migration SQL | DB | OPEN |
| W4 dashboard manual E2E test passed | Frontend | OPEN |
| MEMORY.md updated: W5 = COMPLETE | Nico | OPEN |
| wave-formation.sh complete W5 executed | Nico | OPEN |

---

*ACCEPTANCE_CRITERIA.md — APEX-SENTINEL W5 — Generated 2026-03-24*
*Total: 350+ lines | Status: APPROVED | Next: DECISION_LOG.md*
