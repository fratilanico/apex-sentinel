# APEX-SENTINEL W6 — Roadmap

> Wave: W6 — Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
> Last updated: 2026-03-25
> Status: PLANNING

---

## 1. Wave Timeline

```
W1  ████████████████████  COMPLETE — AcousticPipeline (VAD, FFT, YAMNet surrogate), W1 tests
W2  ████████████████████  COMPLETE — RF/RTL-SDR pipeline, signal classification
W3  ████████████████████  COMPLETE — TrackManager, EKF fusion
W4  ████████████████████  COMPLETE — PredictionPublisher, NATS JetStream
W5  ████████████████████  COMPLETE — EKF Singer Q 6D, PolynomialPredictor, ImpactEstimator, 484 tests
W6  ████░░░░░░░░░░░░░░░░  IN PLANNING — YAMNet fine-tuning, edge deployment, BRAVE1
W7  ░░░░░░░░░░░░░░░░░░░░  DEFERRED — LoRa BRAVE1, multi-language CoT
W8  ░░░░░░░░░░░░░░░░░░░░  DEFERRED — Federated learning, adversarial hardening
W9  ░░░░░░░░░░░░░░░░░░░░  DEFERRED — Romanian Air Force integration
```

---

## 2. W6 Scope (This Wave)

### 2.1 Functional Requirements

| FR | Component | Description | Est. Tests |
|---|---|---|---|
| FR-W6-01 | AcousticProfileLibrary | Drone taxonomy database: frequency ranges, RPM profiles, 10-class schema | 15 |
| FR-W6-02 | YAMNetFineTuner | Transfer learning pipeline: dataset → fine-tune → ONNX export | 15 |
| FR-W6-03 | FalsePositiveGuard | Motorcycle/Shahed discrimination via Doppler + RF + temporal pattern | 15 |
| FR-W6-04 | DatasetPipeline | OSINT data ingestion, augmentation, TFRecord export | 10 |
| FR-W6-05 | MultiNodeFusion | Multi-sensor consensus (inverse-distance weighted, majority vote) | 15 |
| FR-W6-06 | MonteCarloPropagator | 1000-sample impact ellipse from EKF state covariance | 15 |
| FR-W6-07 | EdgeDeployer | ONNX quantization (INT8 RPi4, FP16 Jetson), device manifest, latency validation | 10 |
| FR-W6-08 | SentinelPipeline | End-to-end orchestrator: audio → detection → track → output | 15 |
| FR-W6-09 | CursorOfTruth | Tactical CoT report via Claude API (claude-sonnet-4-6) with template fallback | 10 |
| FR-W6-10 | BRAVE1Format | NATO CoT-compatible message encode/decode/validate | 10 |

**Total W6 new tests: 130**
**Running total after W6: 484 + 130 = 614**

### 2.2 W6 Non-Goals (Explicitly Out of Scope)

- **Live BRAVE1 transmission over LoRa** → W7
- **On-device live training (continual learning)** → Too slow for RPi4; deferred indefinitely
- **Real-time data augmentation during inference** → Inference must be <200ms; augmentation during inference adds 50–100ms
- **LSTM layer in YAMNet head** → LSTM adds sequence modeling but increases model size 40%; deferred to W8
- **Multi-language CoT (Romanian/Ukrainian)** → W7 (requires translation layer)
- **Live integration with field-deployed hardware** → Validation on real devices is W6; actual field deployment is post-W6

---

## 3. W6 Feature Flags

All W6 features are gated. Production deployment can enable incrementally:

```typescript
// src/config/feature-flags.ts
export const FEATURE_FLAGS = {
  FEATURE_YAMNNET_FINETUNE: process.env.FEATURE_YAMNNET_FINETUNE === 'true',
  FEATURE_EDGE_DEPLOY: process.env.FEATURE_EDGE_DEPLOY === 'true',
  FEATURE_BRAVE1_TRANSMIT: process.env.FEATURE_BRAVE1_TRANSMIT === 'true',
  FEATURE_MULTI_NODE_FUSION: process.env.FEATURE_MULTI_NODE_FUSION === 'true',
  FEATURE_MONTE_CARLO: process.env.FEATURE_MONTE_CARLO === 'true',
  FEATURE_CURSOR_OF_TRUTH: process.env.FEATURE_CURSOR_OF_TRUTH === 'true',
} as const;
```

Default (all flags OFF): system runs W5 EKF pipeline unchanged. Flags enable W6 components as tested.

### 3.1 Flag Rollout Order

```
Phase 1 (W6 dev):     FEATURE_YAMNNET_FINETUNE=true (offline training only)
Phase 2 (staging):    FEATURE_EDGE_DEPLOY=true (RPi4 staging device)
Phase 3 (staging):    FEATURE_MULTI_NODE_FUSION=true + FEATURE_MONTE_CARLO=true
Phase 4 (staging):    FEATURE_CURSOR_OF_TRUTH=true (Claude API connected)
Phase 5 (production): FEATURE_BRAVE1_TRANSMIT=true (after operator sign-off)
```

---

## 4. Technical Debt Addressed in W6

| Debt Item | Origin Wave | W6 Resolution |
|---|---|---|
| YAMNet surrogate (AudioSet proxy) | W1 | Replaced by fine-tuned DroneNet-10 model |
| No false-positive handling for motorcycles | W1 | FalsePositiveGuard FR-W6-03 |
| Single-node acoustic decision | W1–W5 | MultiNodeFusion FR-W6-05 |
| Impact estimate is deterministic | W5 | MonteCarloPropagator FR-W6-06 adds probabilistic bounds |
| No edge hardware path | All waves | EdgeDeployer FR-W6-07 |
| No external alert output | All waves | BRAVE1Format FR-W6-10 |
| CoT report is template-only | W5 | CursorOfTruth FR-W6-09 uses Claude API |

---

## 5. W7 — Deferred Features (Next Wave)

**Target: LoRa Mesh + Multi-Language CoT**

| Feature | Rationale for Deferral |
|---|---|
| Live BRAVE1 over LoRa | Requires LoRa hardware procurement; W6 produces the message format but not the RF transport |
| Multi-language CoT (Romanian/Ukrainian/English) | Requires translation layer and prompt templates tested in each language; scope risk |
| Satellite uplink backup | Hardware dependency: Iridium/Starlink integration; separate procurement track |
| Mesh network topology (node ↔ node direct) | NATS handles star topology; mesh requires custom routing protocol |

**W7 Pre-conditions:**
- W6 BRAVE1Format in production
- LoRa hardware (Dragino/RAK4630) procured
- Claude API latency <2s verified on field network (low-bandwidth 4G)

---

## 6. W8 — Federated Learning + Adversarial Hardening

**Target: Privacy-preserving distributed model updates**

| Feature | Description |
|---|---|
| Federated learning | Nodes compute local gradients; aggregate with differential privacy noise (ε=0.1) |
| Adversarial hardening | Defense against adversarial audio attacks (intentional jamming to fool classifier) |
| LSTM in YAMNet head | Replace Dense(64) with LSTM(64) for temporal sequence modeling across frames |
| Anomaly detection for model poisoning | Detect gradient anomalies from rogue nodes during federated update |

**W8 Pre-conditions:**
- W7 mesh network topology live (federated updates need node-to-node comms)
- ≥10 nodes deployed (minimum for meaningful federated aggregation)
- Differential privacy library integrated (TensorFlow Privacy or Opacus)

---

## 7. W9 — Romanian Air Force Integration

**Target: Official sovereign alert system integration**

| Feature | Description |
|---|---|
| ROAF API integration | Push BRAVE1 alerts to Romanian Air Force C2 system |
| Security clearance pipeline | Data handling for classified endpoints |
| Legal/compliance framework | Data sharing agreement with Romanian MApN |
| Live exercise integration | Participate in Romanian Air Force training exercises |

**W9 Pre-conditions:**
- W8 adversarial hardening (required for military-grade certification)
- Legal agreement with Romanian MApN signed
- System certified to NATO STANAG 4586 (UAS interoperability standard)
- At minimum SECRET-level data handling procedures documented

---

## 8. Dependency Map

```
W6 depends on:
  └── W5: EKFInstance, PolynomialPredictor, ImpactEstimator, PredictionPublisher
  └── W3: TrackManager, AcousticDetection types
  └── W1: AcousticPipeline (VAD, FFT) — being extended, not replaced
  └── External: ONNX Runtime (npm onnxruntime-node ≥1.17), TensorFlow.js
  └── External: Supabase bymfcnwfyxuivinuzurr (ml_model_versions table — NEW migration)
  └── External: NATS JetStream (existing, no changes to stream config)
  └── External: Claude API via VM gateway (http://4.231.218.96:7429/chat)

W7 depends on W6:
  └── BRAVE1Format (W6 FR-W6-10) — wire format reused for LoRa transmission
  └── CursorOfTruth (W6 FR-W6-09) — extended with language parameter

W8 depends on W7:
  └── Mesh topology (W7)
  └── DatasetPipeline (W6 FR-W6-04) — extended with federated gradient extraction

W9 depends on W8:
  └── Adversarial hardening (W8) — required for military certification
```

---

## 9. Milestones and Definition of Done

### W6 Definition of Done

- [ ] All 10 FRs implemented with TypeScript source files
- [ ] 130 new tests written (total 614)
- [ ] All 614 tests GREEN (`npx vitest run --coverage`)
- [ ] Coverage: ≥80% statements / branches / functions / lines
- [ ] Playwright E2E: 5 smoke tests pass
- [ ] `npm run build` — zero errors
- [ ] `npx tsc --noEmit` — zero type errors
- [ ] ONNX model export validated on RPi4 simulator (<200ms)
- [ ] BRAVE1 message format validated against CoT schema
- [ ] PRIVACY_ARCHITECTURE.md reviewed and approved
- [ ] All W6 Supabase migrations applied to `bymfcnwfyxuivinuzurr`
- [ ] Feature flags documented and tested (all flags OFF = W5 behavior unchanged)
- [ ] wave-formation.sh complete W6 checkpoint passed

### W6 Exit Criteria

```
npx vitest run --coverage         → 614 pass, ≥80% coverage
npx playwright test               → 5 pass
npm run build                     → 0 errors
npx tsc --noEmit                  → 0 type errors
EdgeDeployer.validateDeployment() → <200ms RPi4 (simulated)
BRAVE1Format.validate()           → 100% of test messages valid
```

---

## 10. Risk Register Summary

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| ONNX Runtime RPi4 INT8 <200ms not achievable | Medium | High | Fallback to FP16; target relaxed to <300ms |
| Insufficient training data (<1000 clips) | Medium | High | Synthetic augmentation fills gaps; model trained on 500 clips with heavy augmentation |
| Claude API latency >8s on field network | Medium | Medium | Template fallback always available (FR-W6-09 AC-41) |
| BRAVE1 schema change by INDIGO/NATO | Low | Medium | Schema version field in all messages; decoder is version-aware |
| YAMNet accuracy <90% on motorcycle class | Low-Medium | High | FalsePositiveGuard provides second-layer defense independent of model accuracy |

---

*Generated: 2026-03-25 | APEX-SENTINEL W6 | ROADMAP.md*
