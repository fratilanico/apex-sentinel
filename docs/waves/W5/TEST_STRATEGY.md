# APEX-SENTINEL — TEST_STRATEGY.md
## Gate 4: EKF + LSTM Trajectory Prediction — Test Strategy
### Wave 5 | Project: APEX-SENTINEL | Version: 5.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. TEST PHILOSOPHY

Wave-formation TDD law applies without exception:
- **TDD RED first**: all tests written and committed in FAILING state before implementation
- **Test pyramid**: unit → component → integration → e2e
- **Coverage gate**: ≥ 80% branches/functions/lines/statements (enforced in CI)
- **FR-named describe blocks**: `describe('FR-W5-01: EKF State Estimator', () => {})`
- **No mocking of business logic**: only I/O (NATS, Supabase) is mocked

---

## 2. TEST STACK

```
Vitest 1.6       — unit + integration tests
@vitest/coverage-v8 — coverage provider
nats-mock (custom) — NATS in-process mock
supabase-mock (custom) — Supabase client mock
```

No Playwright for W5 (headless service — no browser). E2E via integration tests against staging Supabase.

---

## 3. TEST FILES AND COVERAGE

### 3.1 EKF Math Unit Tests

**File:** `src/__tests__/ekf/ekf-math.test.ts`
**FR:** FR-W5-01, FR-W5-03

```typescript
describe('FR-W5-01: EKF Math Primitives', () => {

  describe('mat6x6Multiply', () => {
    it('identity × A = A', () => {
      const I = identity6();
      const A = buildF(1.0);
      expect(mat6x6Multiply(I, A)).toEqual(A);
    });

    it('A × identity = A', () => {
      const I = identity6();
      const A = buildF(0.5);
      expect(mat6x6Multiply(A, I)).toEqual(A);
    });

    it('F(1) × F(1) ≠ F(2) (not a flow property)', () => {
      // Constant velocity: F(1)×F(1) = F(2) — verify this property
      const F1 = buildF(1.0);
      const F2 = buildF(2.0);
      const F1F1 = mat6x6Multiply(F1, F1);
      expect(F1F1).toEqual(F2);
    });
  });

  describe('buildF', () => {
    it('F(0) = identity', () => {
      const F = buildF(0);
      expect(F).toEqual(identity6());
    });

    it('F(1) has dt in position-velocity coupling', () => {
      const F = buildF(1.0);
      // F[0][3] = dt = 1.0 (lat couples to vLat)
      expect(F[0 * 6 + 3]).toBeCloseTo(1.0);
      expect(F[1 * 6 + 4]).toBeCloseTo(1.0);
      expect(F[2 * 6 + 5]).toBeCloseTo(1.0);
      // Velocity rows unchanged: F[3][3] = 1
      expect(F[3 * 6 + 3]).toBeCloseTo(1.0);
    });

    it('F(dt) state prediction matches manual calculation', () => {
      const F = buildF(2.0);
      const state = [48.0, 24.0, 100.0, 0.001, 0.002, -1.0];
      const predicted = matVec6Multiply(F, state);
      expect(predicted[0]).toBeCloseTo(48.0 + 0.001 * 2.0, 10);  // lat + vLat*dt
      expect(predicted[1]).toBeCloseTo(24.0 + 0.002 * 2.0, 10);
      expect(predicted[2]).toBeCloseTo(100.0 + (-1.0) * 2.0, 10);  // alt + vAlt*dt
      expect(predicted[3]).toBeCloseTo(0.001, 10);  // velocity unchanged
    });
  });

  describe('buildQ', () => {
    it('Q is symmetric', () => {
      const Q = buildQ(1.0, 4.49e-5, 6.71e-5, 5.0);
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
          expect(Q[i * 6 + j]).toBeCloseTo(Q[j * 6 + i], 20);
        }
      }
    });

    it('Q diagonal elements are non-negative', () => {
      const Q = buildQ(1.0, 4.49e-5, 6.71e-5, 5.0);
      for (let i = 0; i < 6; i++) {
        expect(Q[i * 6 + i]).toBeGreaterThanOrEqual(0);
      }
    });

    it('Q scales with dt² for velocity, dt⁴ for position', () => {
      const Q1 = buildQ(1.0, 1.0, 1.0, 1.0);
      const Q2 = buildQ(2.0, 1.0, 1.0, 1.0);
      // Q[vLat,vLat] ∝ dt² → Q2[3][3] = 4 × Q1[3][3]
      expect(Q2[3 * 6 + 3]).toBeCloseTo(4 * Q1[3 * 6 + 3], 10);
      // Q[lat,lat] ∝ dt⁴ → Q2[0][0] = 16 × Q1[0][0]
      expect(Q2[0 * 6 + 0]).toBeCloseTo(16 * Q1[0 * 6 + 0], 10);
    });
  });

  describe('mat3x3Invert', () => {
    it('invert identity = identity', () => {
      const I = [1,0,0, 0,1,0, 0,0,1];
      expect(mat3x3Invert(I)).toEqual(I);
    });

    it('A × A⁻¹ = I', () => {
      const A = [4,7,2, 1,3,1, 5,6,3];
      const Ainv = mat3x3Invert(A);
      const product = mat3x3Multiply(A, Ainv);
      // Should be close to identity
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(product[i * 3 + j]).toBeCloseTo(i === j ? 1 : 0, 10);
        }
      }
    });

    it('throws on singular matrix', () => {
      const singular = [1,2,3, 4,5,6, 7,8,9];  // det = 0
      expect(() => mat3x3Invert(singular)).toThrow('Singular matrix');
    });
  });
});
```

### 3.2 EKF Predictor Unit Tests

**File:** `src/__tests__/ekf/EKFPredictor.test.ts`
**FR:** FR-W5-01, FR-W5-02, FR-W5-03

```typescript
describe('FR-W5-01 + FR-W5-03: EKFPredictor predict step', () => {
  let ekf: EKFPredictor;

  beforeEach(() => {
    ekf = new EKFPredictor({
      lat: 48.0, lon: 24.0, alt: 100.0,
      vLat: 0.001, vLon: 0.002, vAlt: -1.0
    });
  });

  it('predict() advances position by velocity × dt', () => {
    const { state } = ekf.predict(1.0);
    expect(state[0]).toBeCloseTo(48.0 + 0.001 * 1.0, 8);  // lat
    expect(state[2]).toBeCloseTo(100.0 + (-1.0) * 1.0, 5); // alt
  });

  it('predict() preserves velocity (constant velocity model)', () => {
    const { state } = ekf.predict(1.0);
    expect(state[3]).toBeCloseTo(0.001, 8);  // vLat unchanged
    expect(state[5]).toBeCloseTo(-1.0, 5);   // vAlt unchanged
  });

  it('predict() covariance grows by Q', () => {
    const P0 = ekf.getCovarianceDiag();
    ekf.commit(...Object.values(ekf.predict(1.0)));
    const P1 = ekf.getCovarianceDiag();
    // Position uncertainty should grow
    expect(P1[0]).toBeGreaterThan(P0[0]);  // P11 (lat)
    expect(P1[2]).toBeGreaterThan(P0[2]);  // P33 (alt)
  });

  it('predict() covariance grows monotonically over 10 cycles without update', () => {
    let prevP = ekf.getCovarianceDiag();
    for (let i = 0; i < 10; i++) {
      const result = ekf.predict(1.0);
      ekf.commit(result.state, result.covariance);
      const currP = ekf.getCovarianceDiag();
      expect(currP[0]).toBeGreaterThan(prevP[0]);  // position variance grows
      prevP = currP;
    }
  });
});

describe('FR-W5-02: EKFPredictor update step', () => {
  it('update() moves state toward measurement', () => {
    const ekf = new EKFPredictor({ lat: 48.0, lon: 24.0, alt: 100.0, vLat: 0, vLon: 0, vAlt: 0 });
    ekf.commit(...Object.values(ekf.predict(1.0)));

    // Measurement 10m north of predicted position
    const measLat = 48.0 + 10 / 111320;
    const result = ekf.update([measLat, 24.0, 100.0], [1e-8, 1e-8, 25]);
    // Updated lat should be between predicted and measured
    const updLat = result.state[0];
    expect(updLat).toBeGreaterThan(48.0);
    expect(updLat).toBeLessThan(measLat);
  });

  it('update() reduces position covariance', () => {
    const ekf = new EKFPredictor({ lat: 48.0, lon: 24.0, alt: 100.0, vLat: 0, vLon: 0, vAlt: 0 });
    const { state, covariance } = ekf.predict(1.0);
    ekf.commit(state, covariance);
    const P_before = ekf.getCovarianceDiag();

    const result = ekf.update([48.0, 24.0, 100.0], [1e-8, 1e-8, 25]);
    ekf.commit(result.state, result.covariance);
    const P_after = ekf.getCovarianceDiag();

    expect(P_after[0]).toBeLessThan(P_before[0]);  // lat covariance reduced
    expect(P_after[2]).toBeLessThan(P_before[2]);  // alt covariance reduced
  });

  it('update() with high-noise measurement barely moves state', () => {
    const ekf = new EKFPredictor({ lat: 48.0, lon: 24.0, alt: 100.0, vLat: 0, vLon: 0, vAlt: 0 });
    ekf.commit(...Object.values(ekf.predict(1.0)));

    const measLat = 48.0 + 1000 / 111320;  // 1km off
    // High measurement noise: R = diag(0.01², 0.01², 0.01²) — very noisy
    const highR: [number, number, number] = [1e-2, 1e-2, 1e4];
    const result = ekf.update([measLat, 24.0, 100.0], highR);
    // State should barely move toward noisy measurement
    expect(result.state[0]).toBeCloseTo(48.0, 3);
  });

  it('update() innovation is measurement minus prediction', () => {
    const ekf = new EKFPredictor({ lat: 48.0, lon: 24.0, alt: 100.0, vLat: 0, vLon: 0, vAlt: 0 });
    ekf.commit(...Object.values(ekf.predict(0.0)));  // dt=0, no change

    const measLat = 48.001;
    const result = ekf.update([measLat, 24.0, 100.0], [1e-8, 1e-8, 25]);
    expect(result.innovation[0]).toBeCloseTo(measLat - 48.0, 8);
  });
});
```

### 3.3 EKF Numerical Stability Tests

**File:** `src/__tests__/ekf/ekf-stability.test.ts`
**FR:** FR-W5-03

```typescript
describe('FR-W5-03: EKF Numerical Stability', () => {
  it('covariance remains positive-definite after 1000 predict cycles (no measurement)', () => {
    const ekf = new EKFPredictor({ lat: 48.0, lon: 24.0, alt: 100.0, vLat: 0.001, vLon: 0.002, vAlt: -1.0 });

    for (let i = 0; i < 1000; i++) {
      const { state, covariance } = ekf.predict(1.0);
      ekf.commit(state, covariance);
      // Diagonal elements must remain positive and finite
      const diag = ekf.getCovarianceDiag();
      for (const d of diag) {
        expect(d).toBeGreaterThan(0);
        expect(isFinite(d)).toBe(true);
      }
    }
  });

  it('covariance remains positive-definite after 1000 predict+update cycles', () => {
    const ekf = new EKFPredictor({ lat: 48.0, lon: 24.0, alt: 100.0, vLat: 0.0005, vLon: 0.001, vAlt: -0.5 });

    for (let i = 0; i < 1000; i++) {
      const { state, covariance } = ekf.predict(1.0);
      ekf.commit(state, covariance);

      // Measurement near current state with 15m noise
      const noiseM = 15;
      const noiseDeg = noiseM / 111320;
      const z: [number, number, number] = [
        ekf.getState().lat + (Math.random() - 0.5) * 2 * noiseDeg,
        ekf.getState().lon + (Math.random() - 0.5) * 2 * noiseDeg,
        ekf.getState().alt + (Math.random() - 0.5) * 10,
      ];
      const R: [number, number, number] = [noiseDeg**2, noiseDeg**2, 25];
      const updateResult = ekf.update(z, R);
      ekf.commit(updateResult.state, updateResult.covariance);

      expect(ekf.isCovariacePD()).toBe(true);
    }
  });

  it('EKF state RMSE ≤ 15m at t+1s on constant-velocity trajectory', () => {
    // Generate 100 1-second detections along a straight 30 m/s path
    // Add 15m TDOA noise
    // Compare EKF filtered position to ground truth
    const speed = 30;  // m/s
    const speedDeg = speed / 111320;
    const noiseM = 15;
    const noiseDeg = noiseM / 111320;

    const ekf = new EKFPredictor({ lat: 48.0, lon: 24.0, alt: 100.0, vLat: speedDeg, vLon: 0, vAlt: 0 });
    let totalSquaredError = 0;
    let n = 0;

    for (let i = 0; i < 100; i++) {
      // Ground truth at t+1s
      const truthLat = 48.0 + speedDeg * (i + 1);

      // Noisy measurement
      const z: [number, number, number] = [
        truthLat + (Math.random() - 0.5) * 2 * noiseDeg,
        24.0,
        100.0,
      ];
      const R: [number, number, number] = [noiseDeg**2, noiseDeg**2, 25];

      const predicted = ekf.predict(1.0);
      ekf.commit(predicted.state, predicted.covariance);
      const updated = ekf.update(z, R);
      ekf.commit(updated.state, updated.covariance);

      // After at least 5 measurements (filter converged), compute RMSE
      if (i >= 5) {
        const errorM = (ekf.getState().lat - truthLat) * 111320;
        totalSquaredError += errorM * errorM;
        n++;
      }
    }

    const rmse = Math.sqrt(totalSquaredError / n);
    expect(rmse).toBeLessThanOrEqual(15.0);
  });
});
```

### 3.4 Polynomial Predictor Unit Tests

**File:** `src/__tests__/predictor/PolynomialPredictor.test.ts`
**FR:** FR-W5-04, FR-W5-05

```typescript
describe('FR-W5-04: PolynomialPredictor', () => {
  const predictor = new PolynomialPredictor();

  it('produces exactly 5 prediction points', () => {
    const history = generateConstantVelocityHistory(10, 1000);
    const predictions = predictor.predict(history, [1, 2, 3, 5, 10]);
    expect(predictions).toHaveLength(5);
  });

  it('horizon values match input', () => {
    const history = generateConstantVelocityHistory(10, 1000);
    const predictions = predictor.predict(history, [1, 2, 3, 5, 10]);
    expect(predictions.map(p => p.horizonSeconds)).toEqual([1, 2, 3, 5, 10]);
  });

  it('constant velocity: t+1 prediction matches extrapolation', () => {
    const speed = 30;  // m/s
    const history = generateConstantVelocityHistory(10, 1000, speed);
    const predictions = predictor.predict(history, [1, 2, 3, 5, 10]);

    // Expected: drone moves ~30m/s north
    const expectedDeltaLatPerS = speed / 111320;
    const lastState = history[history.length - 1].state;

    expect(predictions[0].lat).toBeCloseTo(lastState.lat + expectedDeltaLatPerS * 1, 5);
  });

  it('polynomial RMSE ≤ 50m at t+5s on FPV trajectory', () => {
    // Generate 10 history points from synthetic FPV trajectory
    // Predict t+5s, compare to actual (ground truth at t+5s)
    const history = generateFPVTrajectoryHistory(10, 1000);
    const predictions = predictor.predict(history, [1, 2, 3, 5, 10]);
    const actual = computeActualPositionAtHorizon(history, 5);

    const pred5 = predictions.find(p => p.horizonSeconds === 5)!;
    const errorM = haversineDistanceM(pred5.lat, pred5.lon, actual.lat, actual.lon);
    expect(errorM).toBeLessThanOrEqual(50);
  });

  it('confidence decays with horizon (each horizon has lower confidence)', () => {
    const history = generateConstantVelocityHistory(10, 1000);
    const predictions = predictor.predict(history, [1, 2, 3, 5, 10]);
    for (let i = 0; i < predictions.length - 1; i++) {
      expect(predictions[i].confidence).toBeGreaterThan(predictions[i + 1].confidence);
    }
  });

  it('all confidence values in [0, 1]', () => {
    const history = generateConstantVelocityHistory(10, 1000);
    const predictions = predictor.predict(history, [1, 2, 3, 5, 10]);
    for (const p of predictions) {
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('falls back to linear extrapolation with < 3 history points', () => {
    const history = generateConstantVelocityHistory(2, 1000);
    const predictions = predictor.predict(history, [1, 2, 3, 5, 10]);
    expect(predictions).toHaveLength(5);
    // All finite values
    for (const p of predictions) {
      expect(isFinite(p.lat)).toBe(true);
      expect(isFinite(p.lon)).toBe(true);
    }
  });

  it('predicted alt clamped to >= 0', () => {
    // Drone descending, alt will reach 0 before t+10
    const history = generateDescendingHistory(10, 1000, -15);  // 15 m/s descent, alt=100m
    const predictions = predictor.predict(history, [1, 2, 3, 5, 10]);
    for (const p of predictions) {
      expect(p.alt).toBeGreaterThanOrEqual(0);
    }
  });
});
```

### 3.5 Impact Estimator Unit Tests

**File:** `src/__tests__/impact/ImpactEstimator.test.ts`
**FR:** FR-W5-06

```typescript
describe('FR-W5-06: ImpactEstimator', () => {
  it('returns null for level flight (vAlt = 0)', () => {
    const state: EKFStateVector = { lat: 48.0, lon: 24.0, alt: 100.0, vLat: 0.001, vLon: 0.002, vAlt: 0 };
    expect(estimateImpact(state, 0, 5.0)).toBeNull();
  });

  it('returns null for ascending flight (vAlt > 0)', () => {
    const state: EKFStateVector = { lat: 48.0, lon: 24.0, alt: 100.0, vLat: 0.001, vLon: 0.002, vAlt: 1.5 };
    expect(estimateImpact(state, 0, 5.0)).toBeNull();
  });

  it('returns null for slow descent (vAlt = -0.3, below threshold)', () => {
    const state: EKFStateVector = { lat: 48.0, lon: 24.0, alt: 100.0, vLat: 0.001, vLon: 0.002, vAlt: -0.3 };
    expect(estimateImpact(state, 0, 5.0)).toBeNull();
  });

  it('timeToImpact = alt / abs(vAlt)', () => {
    const state: EKFStateVector = { lat: 48.0, lon: 24.0, alt: 100.0, vLat: 0, vLon: 0, vAlt: -10.0 };
    const result = estimateImpact(state, 0, 5.0);
    expect(result).not.toBeNull();
    expect(result!.timeToImpactSeconds).toBeCloseTo(10.0, 3);
  });

  it('impact lat/lon extrapolated by tImpact × velocity', () => {
    const vLat = 0.001;
    const vLon = 0.002;
    const alt = 100.0;
    const vAlt = -10.0;  // tImpact = 10s
    const state: EKFStateVector = { lat: 48.0, lon: 24.0, alt, vLat, vLon, vAlt };
    const result = estimateImpact(state, 0, 5.0);
    expect(result!.lat).toBeCloseTo(48.0 + vLat * 10.0, 6);
    expect(result!.lon).toBeCloseTo(24.0 + vLon * 10.0, 6);
  });

  it('confidence radius grows with time-to-impact', () => {
    const makeState = (alt: number) => ({
      lat: 48.0, lon: 24.0, alt, vLat: 0, vLon: 0, vAlt: -10.0
    });
    const r10 = estimateImpact(makeState(100), 0, 5.0)!;  // tImpact = 10s
    const r30 = estimateImpact(makeState(300), 0, 5.0)!;  // tImpact = 30s
    expect(r30.confidenceRadius).toBeGreaterThan(r10.confidenceRadius);
  });

  it('confidence radius capped at 500m', () => {
    const state: EKFStateVector = { lat: 48.0, lon: 24.0, alt: 1000.0, vLat: 0, vLon: 0, vAlt: -5.0 };
    // tImpact = 200s — well above 120s threshold, should return null
    const result = estimateImpact(state, 0, 5.0);
    expect(result).toBeNull();  // tImpact > 120s → null
  });

  it('coasting penalty reduces confidence', () => {
    const state: EKFStateVector = { lat: 48.0, lon: 24.0, alt: 100.0, vLat: 0, vLon: 0, vAlt: -10.0 };
    const r0 = estimateImpact(state, 0, 5.0)!;
    const r10 = estimateImpact(state, 10, 5.0)!;
    expect(r10.confidence).toBeLessThan(r0.confidence);
  });
});
```

### 3.6 MultiTrackManager Unit Tests

**File:** `src/__tests__/manager/MultiTrackManager.test.ts`
**FR:** FR-W5-10, FR-W5-11

Key test cases:
- New detection for unknown trackId creates EKFInstance
- Existing trackId reuses EKFInstance (no reset)
- 15 coast cycles marks instance for removal, removes on 16th
- handleNewTrack creates instance from Supabase track record
- removeTrack deletes instance from Map
- getActiveCount returns correct count after adds/removes
- 50 concurrent tracks all processed without error (performance test)

### 3.7 PredictionPublisher Unit Tests

**File:** `src/__tests__/publisher/PredictionPublisher.test.ts`
**FR:** FR-W5-07, FR-W5-08, FR-W5-09

Key test cases:
- NATS publish called with correct subject `sentinel.predictions.{trackId}`
- Supabase upsert called with correct table and payload
- Token bucket: 11th call within 1 second queued, not dropped
- Token bucket: queued write with new prediction replaces old (same trackId)
- Impact null: NATS `sentinel.impacts.*` NOT published
- Impact present: NATS `sentinel.impacts.*` published

---

## 4. INTEGRATION TESTS

**File:** `src/__tests__/integration/pipeline.integration.test.ts`
**FR:** All W5 FRs

```typescript
describe('W5 Pipeline Integration', () => {
  let manager: MultiTrackManager;
  let natsPublished: PredictionOutput[];
  let supabaseWritten: Record<string, unknown>[];

  beforeEach(() => {
    // Mock NATS and Supabase clients
    natsPublished = [];
    supabaseWritten = [];
    const mockPublisher = {
      publish: async (pred: PredictionOutput) => { natsPublished.push(pred); }
    };
    manager = createMultiTrackManager({ publisher: mockPublisher });
  });

  it('detection event → prediction published within 200ms', async () => {
    const event = createTestDetectionEvent({ lat: 48.0, lon: 24.0, alt: 100.0, errorM: 15 });
    const t0 = performance.now();
    await manager.handleDetection(event);
    await manager.handleDetection({ ...event, lat: 48.0001, timestamp: addMs(event.timestamp, 1000) });
    const latency = performance.now() - t0;

    expect(natsPublished).toHaveLength(2);
    expect(latency).toBeLessThan(200);
  });

  it('5 predictions produced with correct horizons', async () => {
    // Feed 5 detection events to build history
    for (let i = 0; i < 5; i++) {
      await manager.handleDetection(createDetectionAtT(i * 1000));
    }
    const lastPrediction = natsPublished[natsPublished.length - 1];
    expect(lastPrediction.predictions).toHaveLength(5);
    expect(lastPrediction.predictions.map(p => p.horizonSeconds)).toEqual([1, 2, 3, 5, 10]);
  });

  it('impact estimate present when drone descending', async () => {
    for (let i = 0; i < 10; i++) {
      await manager.handleDetection(createDescendingDetectionAtT(i * 1000));
    }
    const lastPrediction = natsPublished[natsPublished.length - 1];
    expect(lastPrediction.impactEstimate).not.toBeNull();
  });

  it('isCoasting=true after 2s without measurement', async () => {
    await manager.handleDetection(createTestDetectionEvent({}));
    await manager.handleDetection(createTestDetectionEvent({ timestamp: addMs(timestamp, 1000) }));
    // Advance coast timer 2 seconds
    await manager.runCoastCycle();
    await manager.runCoastCycle();
    const coastPrediction = natsPublished[natsPublished.length - 1];
    expect(coastPrediction.isCoasting).toBe(true);
  });
});
```

---

## 5. COVERAGE REQUIREMENTS

```bash
# Coverage gate (CI enforced):
npx vitest run --coverage

# Thresholds in vitest.config.ts:
coverage: {
  thresholds: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80
  },
  include: ['src/**/*.ts'],
  exclude: ['src/**/*.test.ts', 'src/types/**', 'src/__tests__/**']
}
```

Expected coverage by module:
| Module | Expected Coverage |
|--------|------------------|
| `ekf/*` | 90%+ (pure math, fully testable) |
| `predictor/*` | 85%+ |
| `impact/*` | 90%+ |
| `manager/*` | 80%+ |
| `publisher/*` | 80%+ |
| `nats/*` | 70%+ (I/O heavy, some paths hard to test) |
| `supabase/*` | 70%+ |

---

*TEST_STRATEGY.md — APEX-SENTINEL W5 — Generated 2026-03-24*
*Total: 415+ lines | Status: APPROVED | Next: ACCEPTANCE_CRITERIA.md*
