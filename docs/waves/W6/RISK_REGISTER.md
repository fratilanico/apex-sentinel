# APEX-SENTINEL W6 — Risk Register
# Wave: Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
# Last updated: 2026-03-25

---

## Risk Matrix Legend

| Probability | Impact | Severity Score |
|-------------|--------|---------------|
| LOW (0.1-0.3) | LOW | 1-3 |
| MEDIUM (0.4-0.6) | MEDIUM | 4-6 |
| HIGH (0.7-0.9) | HIGH | 7-9 |
| — | CRITICAL | 9-10 |

**Status:** OPEN / MITIGATED / CLOSED / ACCEPTED

---

## W6 Risk Register

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Status |
|---------|----------|-------------|-------------|--------|-------|------------|-------|--------|
| RISK-W6-01 | ML Quality | YAMNet accuracy <90% on drone dataset due to insufficient training data | MEDIUM | HIGH | 7 | Augmentation pipeline (speed/pitch/noise/reverb) + synthetic data generation from known profiles. Minimum 1000 samples per class before training. | W6 ML lead | OPEN |
| RISK-W6-02 | Operational Safety | 50cc motorcycle false positives bypass FalsePositiveGuard causing false threat alerts | HIGH | CRITICAL | 9 | ALL THREE checks required: (1) Doppler >60km/h gate, (2) temporal linearity over 30s window, (3) RF 900MHz cross-check if hardware available. Any single check alone is insufficient. Validated by motorcycle scenario test case. | W6 ML lead | OPEN |
| RISK-W6-03 | Infrastructure | ONNX Runtime not available on RPi4 (old Raspberry Pi OS / Debian Buster) | LOW | MEDIUM | 3 | Pre-built aarch64 wheels provided in deploy manifest. Document OS minimum: Raspberry Pi OS Bullseye (Debian 11). DEVICE_PROFILES.rpi4.onnxRuntimeVersion pinned to 1.16.3. | EdgeDeployer owner | OPEN |
| RISK-W6-04 | Performance | MonteCarloPropagator exceeds 5ms for 1000 samples on slower devices | MEDIUM | MEDIUM | 5 | Use diagonal covariance (not Cholesky). Benchmark on x86 and rpi4 in validateDeployment. If >5ms at 1000 samples: reduce to 500 via config (no code change). Target: 1000 samples <10ms x86, <20ms rpi4. | W6 prediction lead | OPEN |
| RISK-W6-05 | Infrastructure | NATS offline buffer memory leak on extended disconnection (>1 hour) | LOW | HIGH | 5 | Hard cap: buffer.length >= 1000 → shift() before push(). Oldest frames dropped. Memory ceiling: ~1000 * avg_frame_size ≈ 200MB worst case. Monitor via getStatus().bufferedFrames. | SentinelPipeline owner | OPEN |
| RISK-W6-06 | External Dependency | Claude VM gateway (4.231.218.96:7429) unavailable when CursorOfTruth called | LOW | MEDIUM | 3 | Template fallback designed and tested. fallbackToTemplate: true by default. Timeout 5000ms. All tests use injected HttpClient — gateway never called in CI. | CursorOfTruth owner | OPEN |
| RISK-W6-07 | Legal / Privacy | INDIGO AirGuard acoustic dataset contains incidental PII (speech audio from field recordings near populated areas) | MEDIUM | HIGH (legal) | 7 | Validate all dataset audio for speech content before training. Use automated speech detection (VAD + frequency analysis) to flag files with 300-3400Hz content longer than 3 seconds. Legal review required before training on INDIGO data. | Nico (founder) | OPEN |
| RISK-W6-08 | Interoperability | BRAVE1 format incompatibility with target C2 system version in use by INDIGO AirGuard | MEDIUM | MEDIUM | 5 | version field in BRAVE1Message ('1' or '2'). Decoder accepts both v1 and v2. Document version differences. Validate with INDIGO team before integration demo. | BRAVE1 owner | OPEN |
| RISK-W6-09 | Security | Dataset poisoning — malicious audio files labeled as 'benign' injected into training pipeline | MEDIUM | HIGH | 7 | Source validation: only ingest from 'telegram' channels on allowlist or 'field' recordings with GPS metadata. Outlier detection: samples with unusual mel-spectrogram statistics flagged before training. No anonymous submissions to DatasetPipeline. | DatasetPipeline owner | OPEN |
| RISK-W6-10 | Infrastructure | Multi-node clock skew causing TDoA errors in MultiNodeFusion — 1ms clock error = 340m position error | MEDIUM | MEDIUM | 5 | NTP sync required on all nodes (documented in DEPLOY_CHECKLIST.md). Maximum acceptable clock skew: 0.5ms. Check clock sync status in NodeRegistry health check. chrony preferred over ntpd. | NodeRegistry owner | OPEN |
| RISK-W6-11 | Operational Safety | FalsePositiveGuard heading variance algorithm fails at low speeds (< 5 km/h) where heading is undefined or noisy | HIGH | MEDIUM | 6 | Add speed gate: skip temporal-linearity check if max speed in window < 10 km/h (could be hovering drone). Only apply temporal-linear check when average speed > 20 km/h. Validated in test: hovering drone at 2km/h not flagged as vehicle. | FPG owner | OPEN |
| RISK-W6-12 | ML Quality | YAMNetFineTuner overfits to field recording conditions (specific microphones, deployment heights) rather than learning drone signatures | MEDIUM | HIGH | 7 | Augmentation: reverb + noise + speed ±20% mandatory in training pipeline. Validate on held-out recordings from different microphone models and heights (1m, 3m, 10m). Cross-validation across 3 recording environments. | W6 ML lead | OPEN |
| RISK-W6-13 | Edge Deployment | ONNX model file too large for RPi4 memory (>512MB combined model + runtime) | LOW | HIGH | 5 | int8 quantisation required for rpi4 (reduces model ~75% size). Validate model size before deploy: if quantized model > 200MB, reduce mel filterbank from 128 to 64. DeploymentManifest includes maxMemoryMB check. | EdgeDeployer owner | OPEN |
| RISK-W6-14 | Testing | SentinelPipeline integration tests require all 5 injected backends — high test setup complexity → tests not written | MEDIUM | MEDIUM | 5 | All backends use lightweight interfaces (ModelBackend, ONNXRunner, HttpClient, etc.). Mock factories exported from test utilities. Test setup should be < 20 lines with factory pattern. Document mock factories in test helpers. | Pipeline owner | OPEN |
| RISK-W6-15 | Data Quality | Field recordings from INDIGO AirGuard at variable distances causing inconsistent confidence scores — dataset skewed to short-range captures | MEDIUM | MEDIUM | 4 | Tag all dataset items with estimated recording distance in metadata. Balance dataset by distance bucket (0-500m, 500m-2km, 2km-5km). At least 100 samples per distance bucket per drone type. | DatasetPipeline owner | OPEN |

---

## Risk Heat Map

```
Impact
CRITICAL |         | RISK-02 |         |
    HIGH | RISK-13 | RISK-07 | RISK-01 |
         |         | RISK-09 | RISK-12 |
         |         |         | RISK-11 |
  MEDIUM | RISK-03 | RISK-04 | RISK-08 |
         | RISK-06 | RISK-05 | RISK-10 |
         |         | RISK-14 | RISK-15 |
         |         |         |         |
     LOW |         |         |         |
         +---------+---------+---------+
              LOW     MEDIUM     HIGH
                      Probability
```

---

## Top 5 Risks by Score

| Rank | Risk ID | Score | Description |
|------|---------|-------|-------------|
| 1 | RISK-W6-02 | 9 | Motorcycle false positives bypass FalsePositiveGuard |
| 2 | RISK-W6-07 | 7 | PII in INDIGO AirGuard acoustic dataset |
| 3 | RISK-W6-09 | 7 | Dataset poisoning |
| 4 | RISK-W6-01 | 7 | YAMNet accuracy < 90% |
| 5 | RISK-W6-12 | 7 | YAMNet overfitting to recording conditions |

---

## Mitigation Actions Required Before W6 Execute Phase

1. **RISK-W6-02** — Write motorcycle discrimination test cases in FPG before implementing (TDD RED validates the guard logic exists)
2. **RISK-W6-07** — Legal review of INDIGO AirGuard data sharing agreement before any `DatasetPipeline.ingest()` call on their data
3. **RISK-W6-09** — Add source allowlist validation to `DatasetPipeline.ingest()` — reject items without recognised source
4. **RISK-W6-10** — Add chrony NTP check to DEPLOY_CHECKLIST.md before W6 integration test on real hardware

---

## Risks Inherited from Previous Waves (Monitored)

| Risk ID | Description | Wave Origin | Current Status |
|---------|-------------|-------------|----------------|
| RISK-W5-01 | EKF numerical instability at extreme velocities | W5 | CLOSED (bounds checking added) |
| RISK-W3-01 | NATS auto-reconnect storm under high failure rate | W3 | MITIGATED (exponential backoff, max 10 retries) |
| RISK-W2-01 | mTLS cert expiry causing silent auth failure | W2 | MITIGATED (cert expiry check in NatsClientFSM) |
| RISK-W1-01 | False negative (missed Shahed-136) when flying at extreme range (>4km) | W1 | ACCEPTED (detection range 3.5km, beyond that is radar domain) |
