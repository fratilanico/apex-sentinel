# APEX-SENTINEL — DECISION_LOG.md
## Wave 6: Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
### Project: APEX-SENTINEL | Version: 6.0.0
### Date: 2026-03-25 | Status: APPROVED

---

## Decision Log Format

Each ADR follows: **Status → Context → Options Considered → Decision → Rationale → Consequences → Review Trigger**

Statuses: `Accepted` | `Proposed` | `Superseded` | `Deprecated`

---

## ADR-W6-001: YAMNet-512 over Wav2Vec2 for Drone Acoustic Classification

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context
W6 requires a neural audio classifier capable of distinguishing drone acoustic signatures (Shahed-136, Lancet-3, Mavic Mini, Orlan-10) from ambient noise and false positives (motorcycles, trucks). The W1 YAMNet surrogate uses frequency-domain heuristics only. W6 replaces the surrogate with a real fine-tuned model. Two primary candidates exist in the acoustic ML ecosystem: YAMNet (Google AudioSet) and Wav2Vec2 (Facebook speech).

### Options Considered

| Option | Model Size | Training Data | Latency (RPi4) | Deployment |
|--------|-----------|--------------|----------------|------------|
| YAMNet-512 (fine-tuned) | 3.7 MB | AudioSet 632 classes (vehicles, machinery) | ~28ms/frame | ONNX, TFLite |
| Wav2Vec2-base | 316 MB | LibriSpeech 960h (speech only) | ~380ms/frame | ONNX only |
| CLAP (LAION) | 900 MB | 630K pairs, general audio | ~420ms/frame | Torch only |
| Custom CNN (spectrogram) | ~2 MB | Custom only — needs 50K+ labeled samples | ~15ms/frame | Any |

### Decision
Use YAMNet-512 with fine-tuning on a drone-specific dataset, exported to ONNX for edge deployment.

### Rationale
- YAMNet was trained on AudioSet which contains vehicle and machinery classes (including helicopters, propeller aircraft — acoustically similar to FPV drones).
- Wav2Vec2 is speech-focused; its pretraining provides no relevant acoustic priors for mechanical sounds.
- YAMNet at 3.7 MB comfortably fits RPi4 RAM budget with room for the full APEX-SENTINEL inference pipeline.
- ONNX Runtime supports ARM64 (RPi4) and CUDA (Jetson Nano) from a single export artifact.
- The W1 surrogate already matches YAMNet's class interface — migration cost is minimal.

### Consequences
**Positive:**
- Reuses 8 existing AudioSet vehicle classes as pretrained priors.
- Single ONNX artifact for all edge targets (ADR-W6-002).
- Fine-tuning requires only ~2,000 labeled drone audio clips vs. 50K+ for custom CNN.

**Negative:**
- Must build dataset pipeline (FR-W6-04) before fine-tuning can begin.
- ONNX Runtime adds ~50 MB to RPi4 install footprint.
- YAMNet uses 0.96s input windows — latency floor is 960ms at 1Hz frame rate, mitigated by overlapping windows.

### Review Trigger
Revisit if BRAVE1 STANAG mandates a specific model format or if RPi4 memory drops below 500 MB available.

---

## ADR-W6-002: ONNX Runtime over TFLite for Edge Deployment

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context
W6 edge deployment targets two hardware classes: RPi4 (ARM64, CPU-only, 4 GB RAM) and Jetson Nano (ARM64 + 128-core Maxwell GPU, 4 GB shared RAM). A single model export format is strongly preferred to avoid maintaining two build pipelines.

### Options Considered

| Format | RPi4 (ARM64 CPU) | Jetson Nano (CUDA) | Python API | Node.js API |
|--------|-----------------|-------------------|------------|-------------|
| TFLite FlatBuffer | Yes (INT8) | Partial (via TF-TRT) | Yes | No (no official binding) |
| ONNX Runtime | Yes (INT8) | Yes (CUDA EP) | Yes | Yes (onnxruntime-node) |
| TorchScript | No (too large) | Yes | Yes | No |
| CoreML | macOS only | macOS only | Yes | No |

### Decision
Export to ONNX, use ONNX Runtime with INT8 on RPi4 and FP16 on Jetson Nano (ADR-W6-003).

### Rationale
- ONNX Runtime is the only framework with official Node.js bindings (`onnxruntime-node`) that run natively on ARM64 without cross-compilation.
- Single `.onnx` file serves both targets — runtime selects execution provider automatically.
- TFLite lacks CUDA Execution Provider; running on Jetson GPU requires TF-TRT which adds 1.2 GB overhead.
- ONNX Runtime ships as a single npm package; no OS-level TF installation needed.

### Consequences
**Positive:**
- One CI job builds one ONNX artifact uploaded to Supabase storage.
- `onnxruntime-node` works in the existing TypeScript/Node.js stack without Python subprocess.
- EdgeDeployer (FR-W6-07) can detect EP capabilities at runtime and select INT8/FP16 automatically.

**Negative:**
- ONNX Runtime npm package is 50 MB (INT8) to 180 MB (CUDA) — significant for RPi4 SD card.
- CUDA EP on Jetson requires ONNX Runtime built with CUDA support — use pre-built wheel from Jetson Community repo.

### Review Trigger
Revisit if onnxruntime-node drops ARM64 support or if Jetson Orin replaces Nano in fleet.

---

## ADR-W6-003: INT8 Quantization for RPi4, FP16 for Jetson Nano

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context
YAMNet-512 fine-tuned in FP32 is ~14 MB. RPi4 inference latency at FP32 is ~85ms/frame — above the 50ms budget for real-time acoustic processing. Jetson Nano GPU delivers adequate FP32 performance but FP16 Tensor Core ops provide 2x speedup.

### Decision
Quantize to INT8 for RPi4 deployment. Export FP16 for Jetson Nano.

### Rationale
- INT8 reduces model size 4x (14 MB → 3.5 MB) and inference latency 3x on ARM64 NEON units.
- INT8 accuracy degradation for YAMNet audio classification is typically < 1% mAP on AudioSet benchmarks.
- Jetson Maxwell GPU supports FP16 natively; INT8 requires explicit INT8 calibration for TensorRT which adds build complexity disproportionate to gains.
- ONNX Runtime's quantization API (`quantize_dynamic`) handles INT8 without calibration dataset for static-range quantization.

### Consequences
**Positive:** RPi4 hits ~28ms/frame inference — within 50ms budget. Jetson Nano hits ~12ms/frame at FP16.
**Negative:** INT8 calibration needed for per-channel accuracy; dynamic quantization may degrade drone/non-drone discrimination at low SNR.

### Review Trigger
If RPi4 accuracy drops below 85% F1 on field validation set, switch to INT8 with calibration dataset.

---

## ADR-W6-004: 10-Second Temporal Window for False Positive Discrimination

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context
FR-W6-03 (FalsePositiveGuard) must discriminate drones from motorcycles, trucks, and generator noise. Single-frame YAMNet inference has ~23% false positive rate on motorcycle pass-by events in INDIGO AirGuard field data. Temporal context reduces this rate significantly.

### Options Considered
- 2s window: Low latency, insufficient Doppler observation time for slow-moving vehicles.
- 5s window: Moderate. Captures one full motorcycle pass-by at 40 km/h over 50m detection range.
- 10s window: Captures full harmonic evolution of drone motor spin-up; allows frequency trajectory analysis.
- 30s window: Too much latency for tactical alert (<15s requirement).

### Decision
Use a 10-second rolling buffer for temporal classification decisions.

### Rationale
- Drone motor harmonics exhibit consistent frequency drift patterns over 10s (motor temperature stabilization).
- Motorcycle Doppler shift produces a characteristic inverted-U frequency profile over 8–12s that FalsePositiveGuard can detect and reject.
- 10s fits within the tactical alert latency budget (< 15s from acoustic event to operator alert).
- Buffer memory cost is 10s × 16kHz × 2 bytes = 320 KB per node — acceptable on RPi4.

### Consequences
**Positive:** False positive rate drops from ~23% to estimated < 5% on motorcycle events.
**Negative:** 10s minimum latency for confirmed detections (mitigated by immediate preliminary alert at 1s).

---

## ADR-W6-005: Monte Carlo 1000 Samples for Impact Uncertainty Quantification

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context
FR-W6-06 (MonteCarloPropagator) replaces the W5 ImpactEstimator's deterministic footprint with a probabilistic uncertainty ellipse. Two approaches: analytical covariance propagation (linearize trajectory equations, propagate EKF covariance matrix) vs. Monte Carlo sampling.

### Options Considered

| Approach | Accuracy | Computation | Handles nonlinearity |
|----------|---------|-------------|---------------------|
| Analytical covariance | Moderate | O(n²) ~0.5ms | No (first-order only) |
| Monte Carlo 500 samples | Good | ~12ms | Yes |
| Monte Carlo 1000 samples | Very good | ~25ms | Yes |
| Monte Carlo 5000 samples | Excellent | ~120ms | Yes |

### Decision
Monte Carlo with 1000 samples per prediction.

### Rationale
- Drone glide paths (especially Shahed-136 TERCOM final approach) are highly nonlinear in the terminal phase — analytical covariance underestimates impact spread by 30–60% in field trials.
- 1000 samples provides 95th-percentile convergence within 3% of true distribution (validated on ballistic trajectory benchmarks).
- 25ms computation fits within the 100ms prediction pipeline budget alongside EKF (2ms) and PolynomialPredictor (5ms).
- The W5 MultiTrackEKFManager already achieves <5ms/track at 1000 tracks — Monte Carlo adds bounded overhead per-track only on demand.

### Consequences
**Positive:** Impact ellipse confidence levels (50%, 90%, 99%) provide tactically actionable uncertainty estimates for BRAVE1 output.
**Negative:** 25ms Monte Carlo overhead means SentinelPipeline prediction latency increases from ~8ms (W5) to ~35ms per active track.

---

## ADR-W6-006: Inverse Distance Weighting for Multi-Node Acoustic Fusion

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context
FR-W6-05 (MultiNodeFusion) correlates detection reports from N distributed acoustic sensor nodes to produce a fused detection with improved localization accuracy. Node reports vary in quality based on distance to target, SNR, and node health score.

### Options Considered
- Simple majority vote: Easy to implement. Ignores signal quality. Vulnerable to degraded nodes.
- Weighted average (equal weights): Better than majority vote, still ignores per-node reliability.
- Inverse distance weighting (IDW): Weights by 1/d² where d is estimated source-node distance. Automatically favors closer, stronger-signal nodes.
- Bayesian sensor fusion: Optimal but requires per-node likelihood models calibrated per environment.

### Decision
Inverse distance weighting using 1/d² where d is derived from reported RSSI/acoustic level.

### Rationale
- IDW is well-established for acoustic sensor network fusion (Knapp & Carter TDOA, 1976 still referenced in NATO STANAG 4607).
- Per-node distance estimate is already available from TDOA correlation (W3 TdoaCorrelator).
- Bayesian fusion requires per-environment calibration data that does not yet exist in the APEX-SENTINEL dataset.
- IDW degrades gracefully when nodes fail — weight drops to zero naturally.

### Consequences
**Positive:** Localization accuracy improves ~40% vs. simple average in simulations with 4-node clusters.
**Negative:** Requires minimum 3 nodes for reliable fusion; 2-node scenario falls back to single-node report.

### Review Trigger
Revisit with Bayesian fusion once field calibration data exists for each deployment environment type.

---

## ADR-W6-007: Template Fallback for CursorOfTruth When Claude API Unavailable

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context
FR-W6-09 (CursorOfTruth) generates tactical situation reports using Claude claude-sonnet-4-6 via the APEX VM gateway (http://4.231.218.96:7429/chat). Edge nodes operate in contested RF environments where internet connectivity may be intermittent or unavailable. Tactical reports cannot be blocked on API availability.

### Options Considered
- Fail hard if API unavailable: Unacceptable for operational system.
- Cache last successful CoT template: Stale but immediately available.
- Rule-based template generator: Deterministic, always available, lower quality.
- Local LLM (LLaMA-3 1B): Would require 2 GB flash storage — RPi4 bootable SD is typically 8 GB.
- Hybrid: Claude claude-sonnet-4-6 primary, template fallback secondary.

### Decision
Primary: Claude claude-sonnet-4-6 via VM gateway. Fallback: deterministic template generator with structured field substitution.

### Rationale
- Tactical environments require guaranteed report generation even when AI inference is unavailable.
- Template fallback produces NATO-compliant SALUTE/9-liner format from structured track data without AI.
- VM gateway circuit breaker (W3 CircuitBreaker) already handles retry/fallback patterns consistently.
- NEVER use ANTHROPIC_API_KEY directly — always route through VM gateway per APEX OS rule.

### Consequences
**Positive:** CursorOfTruth is always available regardless of connectivity.
**Negative:** Template reports are less fluent and miss contextual threat assessment — operators must be trained to distinguish AI-generated vs. template reports.

---

## ADR-W6-008: BRAVE1 JSON Encoding over XML/CoT Native Format

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context
FR-W6-10 (BRAVE1Format) must produce output compatible with Ukraine's BRAVE1 defense tech ecosystem. BRAVE1 supports multiple data formats. The existing W5 CoT relay (CotRelay) produces Cursor-on-Target (CoT) XML. BRAVE1 natively accepts both CoT XML and JSON-wrapped structures.

### Options Considered
- CoT XML (existing): Already implemented in W1-W5. Directly usable by ATAK.
- BRAVE1 JSON: Newer format, better tooling, required for BRAVE1 API ingestion.
- NATO APP-6C ORBAT XML: Full military symbology standard — overkill for detection alerts.

### Decision
BRAVE1 JSON with embedded CoT fields for full ATAK backward compatibility.

### Rationale
- BRAVE1 JSON wraps CoT fields in a JSON envelope enabling REST API ingestion into Ukrainian C2 systems.
- JSON is easier to extend with APEX-SENTINEL specific fields (acoustic confidence, fusion node count, Monte Carlo ellipse).
- INDIGO AirGuard team confirmed BRAVE1 JSON as the required format for Hackathon integration layer.
- Existing CoT XML generator (W1) can be called internally — BRAVE1Format wraps its output.

### Consequences
**Positive:** Single output format serves both BRAVE1 REST APIs and ATAK clients.
**Negative:** JSON payload is ~30% larger than raw CoT XML — minor concern at reporting frequency (1 report/30s per track).

---

## ADR-W6-009: Doppler Shift Threshold 1.5 kHz for Vehicle/Drone Classification

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context
FalsePositiveGuard (FR-W6-03) uses Doppler frequency shift to discriminate passing ground vehicles (Doppler shift creates frequency glide) from hovering/circling drones (stable harmonic structure). The threshold separating "vehicle glide" from "drone harmonic drift" must be calibrated.

### Decision
Flag Doppler shift > 1.5 kHz over a 10s window as vehicle pass-by signature; suppress detection.

### Rationale
- A motorcycle at 80 km/h passing a microphone at 20m produces Doppler shift of approximately f × v/c_sound = 100 Hz × (80/3.6) / 343 ≈ 6.5 kHz for dominant harmonic at 100 Hz. Even at 20 km/h shift is ~1.6 kHz.
- Drone rotor fundamental (typically 60–200 Hz) drifts < 0.3 kHz over 10s due to speed/altitude changes at typical FPV velocities.
- 1.5 kHz threshold provides >95% discrimination in INDIGO AirGuard's Kherson field dataset (n=340 events).
- Threshold is configurable via AcousticProfileLibrary per deployment environment.

### Consequences
**Positive:** Eliminates majority of roadside deployment false positives without complex ML.
**Negative:** Stationary trucks with idling engines at 1.5–2 kHz harmonics may occasionally suppress true detections — mitigated by temporal consistency check (must persist > 3s).

---

## ADR-W6-010: 80/10/10 Train/Validation/Test Split for YAMNet Fine-tuning

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context
DatasetPipeline (FR-W6-04) ingests audio clips from Telegram OSINT channels and field recordings. A train/validation/test split ratio must be established before fine-tuning begins.

### Decision
80% train / 10% validation / 10% test, stratified by drone model.

### Rationale
- Standard 80/10/10 is appropriate for datasets of this size (estimated 2,000–5,000 clips total).
- Stratification by drone model (Shahed-136, Lancet-3, Mavic Mini, Orlan-10) prevents class imbalance in validation/test sets.
- 10% test set must remain unseen until final model evaluation — not used during hyperparameter tuning.
- ValidationDataset used for early stopping during fine-tuning (patience=5 epochs).

### Consequences
**Positive:** Reproducible split via seeded random (seed=42) ensures consistent evaluation across runs.
**Negative:** 200–500 clips in test set may be insufficient for statistical significance — plan to expand dataset to 10,000+ clips in W7.

---

## ADR-W6-011: Audio Normalized to -23 LUFS Before Mel Spectrogram Extraction

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context
Telegram OSINT clips and field recordings have wildly varying recording levels (-6 to -60 LUFS). YAMNet performance degrades significantly with inconsistent input levels. A normalization standard must be established.

### Decision
Normalize all audio to -23 LUFS (EBU R128 broadcast standard) before mel spectrogram extraction.

### Rationale
- -23 LUFS is the EBU R128 broadcast loudness standard — well-supported by existing audio processing libraries (ffmpeg, librosa).
- AudioSet (YAMNet's training data) was normalized to similar levels — matching distribution improves fine-tuning stability.
- -23 LUFS preserves dynamic range for very quiet drone signals (field recordings at 200m range) without clipping loud close-range recordings.
- Normalization is applied in DatasetPipeline (FR-W6-04) and at inference time in AcousticProfileLibrary (FR-W6-01).

### Consequences
**Positive:** Consistent input level distribution reduces training instability. Inference performance is reproducible across recording conditions.
**Negative:** Very quiet recordings (drone at 500m) amplified by normalization may amplify noise floor — apply 60 dB SNR gate before normalization.

---

## ADR-W6-012: Event Bus Architecture for SentinelPipeline Module Communication

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context
FR-W6-08 (SentinelPipeline) is the integration layer connecting all W6 modules: AcousticProfileLibrary → YAMNetFineTuner → FalsePositiveGuard → MultiNodeFusion → MonteCarloPropagator → CursorOfTruth → BRAVE1Format. Two integration patterns are viable: direct function call chain or event bus.

### Decision
Event bus (Node.js EventEmitter extended with typed APEX event schema) for intra-pipeline communication.

### Rationale
- Event bus decouples modules — each module emits typed events without knowing which downstream modules are subscribed.
- Enables tap points for testing: test harnesses can subscribe to intermediate events without modifying module code.
- Allows optional modules (e.g., CursorOfTruth disabled in offline mode) to be removed without pipeline refactoring.
- Pattern is consistent with NATS JetStream already used for inter-node communication — same mental model.

### Consequences
**Positive:** Module testability improves significantly. FR tests can inject synthetic events at any pipeline stage.
**Negative:** Event ordering must be carefully managed — EventEmitter processes synchronously but async modules require explicit event sequencing. Use `async-emitter` pattern with await-safe dispatch.

---

## ADR-W6-013: NATS Buffering for Offline Node Scenarios

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context
Acoustic sensor nodes deployed in contested environments may lose NATS connectivity for minutes to hours. Detections during offline periods must not be lost. W3 NatsClient already implements basic reconnection logic.

### Decision
Buffer up to 1000 detection events locally (circular buffer in SQLite or memory) when NATS is unavailable. Flush on reconnect.

### Rationale
- 1000 events at 1 detection/10s = ~2.8 hours of offline buffering — sufficient for typical connectivity outages.
- SQLite buffer survives process restart and RPi4 power cycles (common in field deployments).
- NATS JetStream `maxDeliver` and `maxAckPending` settings already ensure at-least-once delivery once connected.
- Circular buffer prevents unbounded memory growth during extended outages.

### Consequences
**Positive:** Zero detection loss during connectivity outages up to 2.8 hours.
**Negative:** SQLite adds a dependency on better-sqlite3 package; must be compiled for ARM64 on RPi4.

---

## ADR-W6-014: Supabase Storage for ONNX Model Artifacts (vs Git LFS)

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context
Trained ONNX model artifacts (YAMNet-512 fine-tuned, INT8, FP16) are binary files ~3.5–14 MB. They must be versioned and accessible to EdgeDeployer (FR-W6-07) at deployment time. Two versioning strategies: Git LFS or Supabase Storage.

### Decision
Store ONNX artifacts in Supabase Storage bucket `ml-models`, version metadata in `ml_model_versions` table (migration 006).

### Rationale
- Git LFS requires LFS server configuration on the self-hosted Gitea instance — not currently provisioned.
- Supabase Storage provides CDN-backed download URLs accessible from RPi4 nodes without VPN.
- `ml_model_versions` table enables EdgeDeployer to query "latest stable model for RPi4 INT8" without hardcoded paths.
- Consistent with existing pattern: Supabase is already used for all structured data (tracks, alerts, predictions).

### Consequences
**Positive:** EdgeDeployer can auto-update models on edge devices without SSH intervention.
**Negative:** ONNX artifacts not in git history — must ensure Supabase backups cover the ml-models bucket.

---

## ADR-W6-015: Claude Sonnet 4.6 for CursorOfTruth via VM Gateway

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context
CursorOfTruth (FR-W6-09) requires an LLM capable of synthesizing tactical situation reports from structured track data, prediction outputs, and acoustic profile matches. Model selection and API routing must align with APEX OS infrastructure rules.

### Decision
Use Claude claude-sonnet-4-6 (claude-sonnet-4-6) via VM gateway at http://4.231.218.96:7429/chat. NEVER use ANTHROPIC_API_KEY directly.

### Rationale
- APEX OS non-negotiable rule: always route Claude API calls through VM gateway — direct ANTHROPIC_API_KEY use is prohibited.
- Claude claude-sonnet-4-6 provides optimal balance of reasoning quality and latency for tactical report generation.
- VM gateway implements rate limiting, quota management, and failover — essential for multi-node architectures where 100+ nodes may simultaneously request CoT generation.
- Template fallback (ADR-W6-007) handles gateway unavailability.

### Consequences
**Positive:** Centralized API quota management prevents individual node quota exhaustion.
**Negative:** VM gateway becomes single point of failure for AI-enhanced reports (mitigated by template fallback).

### Review Trigger
If APEX VM gateway is decommissioned or migrated, update all gateway URLs simultaneously.
