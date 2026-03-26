# APEX-SENTINEL W8 — AI Pipeline Document

> Wave: W8 | Date: 2026-03-26

---

## AI/ML Pipeline Overview (W7 baseline, W8 enhancements)

```
Field Audio (16kHz PCM mono)
         │
         ▼
┌────────────────────────────┐
│  VoiceActivityDetector     │  Gate: RMS > -40dBFS
│  Energy gate + ZCR heuristic│
└────────────┬───────────────┘
             │ VAD triggered
             ▼
┌────────────────────────────┐
│  FFTProcessor              │  1024-sample Hann window
│  Power spectral density    │  8 subbands: 0-2kHz, 2-4kHz…
└────────────┬───────────────┘
             │ PSD vector
             ▼
┌────────────────────────────┐
│  YAMNet surrogate (480KB)  │  Frame-level classification
│  16kHz input, 0.48s frames │  5 output classes
│  On-device inference only  │  No cloud call ever
└────────────┬───────────────┘
             │ class probabilities
             ▼
┌────────────────────────────┐
│  FalsePositiveGuard        │  W8: Wild Hornets calibrated
│  Confidence threshold gate │  Motorcycle/power-tool suppression
│  Rolling 3-frame smoother  │  FPR target: <5% (urban env)
└────────────┬───────────────┘
             │ confirmed detection
             ▼
┌────────────────────────────┐
│  AcousticProfileLibrary    │  5 profiles + W8: Simpson fix
│  Per-profile recall gates  │  W8: setActiveModel() safety gate
│  W8: recall oracle in CI   │  Promotion via promoteModel()
└────────────┬───────────────┘
             │ matched profile + confidence
             ▼
  (NATS → SentinelPipelineV2 → EKF → TerminalPhase → OUTPUT)
```

---

## W8 AI Enhancements

### 1. Per-Profile Recall Oracle (FR-W8-01)

Current state: CI tests use synthetic AudioSamples. No pinned real dataset.

W8 change:
- Download BRAVE1-v2.3-16khz dataset (pinned, versioned, stored in Supabase Storage)
- Load dataset in CI via `scripts/download-dataset.sh`
- Run `AcousticProfileLibrary.classify()` on every recording
- Assert per-profile gates (see API_SPECIFICATION.md for thresholds)
- Block `npm run export-model` if any gate fails
- Write metrics to `per_profile_recall_metrics` Supabase table

Gate thresholds (justified by threat severity):
- Shahed-238: recall ≥0.95 — turbine signature, highest lethality
- Gerbera: recall ≥0.92 — piston signature, well-characterised
- Shahed-136: recall ≥0.87 — piston/propwash mixed signature
- Shahed-131: recall ≥0.85 — higher RPM variant, more interference
- quad_rotor: recall ≥0.88 — commercial multi-rotor

### 2. Simpson's Paradox Prevention (FR-W8-02)

Problem: Aggregated accuracy (e.g. 91%) can mask class-level failure (e.g. Shahed-238 at 72%).

W8 test suite adds 12 consistency oracle tests:
- Stratified sampling: dataset split is class-balanced (not aggregate-balanced)
- Per-class recall reported independently
- Weighted macro-average must be within ±5% of unweighted macro-average
- If gap >5%: test fails with "Simpson's Paradox suspected — check class distribution"

Implementation:
```typescript
// tests/ml/FR-W8-02-simpsons-oracle.test.ts
describe('FR-W8-02: Simpson\'s Paradox Consistency Oracle', () => {
  it('weighted and unweighted macro recall must agree within 5%', ...)
  it('per-class recall must all exceed threshold independently', ...)
  it('minority class (shahed_238) recall not hidden by majority aggregation', ...)
})
```

### 3. Wild Hornets Dataset Integration (FR-W8-09)

Wild Hornets dataset: 3000+ field recordings of motorcycles, lawnmowers, chainsaws, power tools, and motorcycles in European urban environments. Source: acoustic ecology database (free for research).

Integration steps:
1. `DatasetPipeline.loadWildHornets(path)` — loads WAV files, resamples to 16kHz
2. `DatasetPipeline.augment()` — time-stretch ±20%, pitch-shift ±2 semitones, mix with background
3. Run augmented corpus through `AcousticProfileLibrary.classify()`
4. Target: FPR <5% (no more than 150 false positives in 3000+ recordings)
5. If FPR ≥5%: `FalsePositiveGuard.confidenceThreshold` raised by 0.02, test re-run

W8 does not retrain the model (YAMNet weights are frozen). It tunes the `FalsePositiveGuard` confidence gate on real-world urban false positive distribution.

### 4. Learning-Safety IEC 61508 Promotion Gate (FR-W8-10)

Context: YAMNetFineTuner allows field agents to fine-tune the model on new recordings. Without a promotion gate, anyone with NATS write access can overwrite the inference model in production.

IEC 61508 SIL-2 requirement: Safety-critical AI updates require:
1. Evidence-based gate (metrics above threshold)
2. Audit trail (who promoted, when, what metrics)
3. Separation of training from promotion authority

W8 implementation:
- `promoteModel()` validates EvalMetrics before weight swap
- Atomic write: model buffer swap happens as one operation (no partial state)
- Audit: written to `model_promotion_audit` table
- Bypass detection: if `AcousticProfileLibrary.setActiveModel()` called without handle, throws and logs `SAFETY_GATE_BYPASSED` with stack trace

The 15 `.todo()` tests from W7 resolve fully in W8-10.

---

## Model Version Management

```
Model versions:
  yamnet-w6-base              — original 22050Hz model
  yamnet-w7-promoted-<date>   — 16kHz + 4 profiles + terminal phase support
  yamnet-w8-promoted-<date>   — + Wild Hornets FPR calibration + safety gate

Promotion history stored in model_promotion_audit.
Active model version exposed via /health endpoint.
```
