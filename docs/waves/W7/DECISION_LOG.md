# APEX-SENTINEL — DECISION_LOG.md
## Wave 7: Hardware Integration + Data Pipeline Rectification + Terminal Phase Detection
### Project: APEX-SENTINEL | Version: 7.0.0
### Date: 2026-03-25 | Status: APPROVED

---

## Decision Log Format

Each ADR follows: **Status → Context → Options Considered → Decision → Rationale → Consequences → Review Trigger**

Statuses: `Accepted` | `Proposed` | `Superseded` | `Deprecated`

---

## ADR-W7-001: 16kHz Sample Rate Adoption (Supersedes 22050Hz)

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect), validated by INDIGO/Manus AI team
**Supersedes:** W6 DatasetPipeline assumption of 22050Hz implicit from AudioSet

### Context

W6 DatasetPipeline ingests audio and feeds the YAMNet fine-tuning pipeline. An implicit assumption was made that 22050Hz was the appropriate sample rate (half of standard 44.1kHz CD quality). Post-W6 analysis by the INDIGO/Manus AI team revealed this is incorrect and constitutes a data integrity problem. INDIGO's field recordings — including 3,000+ Wild Hornets clips — are all at 16kHz. YAMNet itself operates natively at 16kHz (16,000 Hz sample rate, 960ms window = 15,360 samples). Google's AudioSet, which YAMNet was pretrained on, uses 16kHz. Resampling from 22050Hz to 16kHz during inference introduces artifacts and reduces classification accuracy by an estimated 6–9% F1 on the Shahed-136 class.

INDIGO classified the 22050Hz pipeline as a data breach — meaning field data produced at 16kHz was being fed through a 22050Hz pipeline without explicit resampling, causing silent frequency domain distortions.

### Options Considered

| Option | YAMNet Compatibility | Wild Hornets Compat | INDIGO Compat | Resampling Overhead |
|--------|---------------------|---------------------|---------------|---------------------|
| Keep 22050Hz | Poor — requires resampling at inference | Incompatible | Incompatible | High (every inference) |
| 16kHz native | Native | Native | Native | None |
| 44100Hz | Poor — 4x oversample, no benefit | Incompatible | Incompatible | Very high |
| 48kHz | Poor | Incompatible | Incompatible | Very high |

### Decision

Adopt 16kHz as the canonical sample rate for all DatasetPipeline ingestion, YAMNet fine-tuning, AcousticProfileLibrary spectral profiles, and inference-time audio capture across all sensor nodes.

### Rationale

- YAMNet's native input is 16kHz/960ms windows (15,360 samples). No resampling overhead at inference time.
- Wild Hornets dataset (3,000+ field recordings of drone acoustic signatures) is natively 16kHz — direct ingestion without resampling.
- INDIGO AirGuard field data (Kherson, Zaporizhzhia) is at 16kHz — compatibility is mandatory for the integration.
- 16kHz captures all acoustically relevant drone harmonics: even the Shahed-238 jet turbine at 3–8kHz is well within the 8kHz Nyquist ceiling of 16kHz.
- The W6 acoustic profiles stored fundamental frequencies (38–180 Hz range) — these are unaffected by the 16kHz change at the profile level, but the mel spectrogram bins will be recalculated at the correct frequency resolution.

### Consequences

**Positive:**
- Eliminates inference-time resampling CPU overhead on RPi4 (estimated 15ms saved per frame).
- Direct compatibility with Wild Hornets, INDIGO, and YAMNet native format.
- Stored ONNX models (yamnet-16khz-v1.onnx) will be semantically correct without hidden resampling artifacts.

**Negative:**
- Existing W6 DatasetPipeline must be rewritten as `DatasetPipelineV2` (FR-W7-01) — breaking change.
- All previously ingested training clips must be re-processed through the 16kHz pipeline.
- RPi4 microphone capture configuration must be explicitly set to 16kHz (ALSA device config update).

### Review Trigger

If a future drone target operates above 8kHz as its primary detection frequency (unlikely — all known OPFOR drone acoustic signatures are below 4kHz), reconsider sample rate.

---

## ADR-W7-002: Shahed-238 Requires Separate Turbine ML Model

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect), INDIGO SIGINT team

### Context

INDIGO confirmed that the Shahed-238 is not a piston-engine variant like the Shahed-136 (MADO-20, 2-stroke). The Shahed-238 uses a jet turbine engine (turbojet/turbofan variant). The acoustic signature difference is fundamental:

- Shahed-136 (MADO-20): Fundamental 52 Hz, harmonics 100–260 Hz, typical 2-stroke combustion envelope, strong sub-200 Hz content
- Shahed-238 (turbine): Dominant frequency band 3,000–8,000 Hz, characteristic turbine whine + broadband noise, minimal sub-500 Hz content

This means the W6 YAMNet model fine-tuned on piston-drone data cannot generalize to jet turbine signatures. The frequency domains are entirely non-overlapping. Attempting to classify Shahed-238 with the piston model would produce near-zero confidence (silent false negative) — the most dangerous failure mode in a C-UAS system.

### Options Considered

| Option | Accuracy on Shahed-238 | Complexity | Deployment Cost |
|--------|------------------------|------------|-----------------|
| Extend piston model to include turbine class | Poor — model would need complete retraining on bimodal distribution | Medium | Low |
| Separate turbine model (yamnet-turbine-v1.onnx) | High — trained specifically on turbine audio | High | Medium |
| Multi-head model (shared backbone, separate output heads) | Good but requires significant architecture change | Very high | High |
| Rule-based turbine detector (no ML) | Moderate — frequency band energy thresholding | Low | Low |

### Decision

Train and deploy a separate ONNX model (`yamnet-turbine-v1.onnx`) specifically for jet turbine drone detection. AcousticProfileLibrary routes audio frames to the appropriate model based on frequency domain energy distribution (pre-screening step: if energy > -40 dBFS in 3–8kHz band, route to turbine model).

### Rationale

- Separation of concerns: the piston model and turbine model each trained on acoustically homogeneous data produce significantly higher F1 than a combined model.
- Pre-screening routing adds < 2ms overhead on RPi4 — negligible.
- Allows independent model versioning: piston model v2.0 can be released without touching turbine model and vice versa.
- Precedent in avionics: STANAG 4607 separates GMTI target classes explicitly; applying the same separation principle to acoustic classes is architecturally sound.

### Consequences

**Positive:** Shahed-238 detection coverage added without degrading Shahed-136/Lancet-3/Orlan-10 accuracy.
**Negative:** Two ONNX models on edge nodes — total model footprint doubles from ~7 MB to ~14 MB. RPi4 has sufficient RAM; SD card space plan must account for this.

### Review Trigger

If Shahed-238 jet turbine dataset proves insufficient for fine-tuning (< 500 labeled clips), fall back to rule-based turbine detector as interim measure.

---

## ADR-W7-003: BearingTriangulator Complements TdoaSolver (Not a Replacement)

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect), George (INDIGO field team)

### Context

W2 introduced the TdoaCorrelator for acoustic time-difference-of-arrival positioning. W3-W6 built on this foundation. TDOA positioning requires precise microsecond-level time synchronization between sensor nodes (GPS-disciplined clocks or PPS signals). In degraded field conditions (GPS jamming, node clock drift), TDOA accuracy degrades significantly.

George (INDIGO field team) proposed the "matchstick principle" — each node independently measures the bearing (azimuth angle) to the acoustic source using a microphone array or a directional microphone. Multiple bearing lines intersect at the source position. This approach is resilient to clock synchronization errors because it relies on spatial geometry, not time differences.

### Options Considered

| Option | Clock Sync Required | Node Hardware Req | Accuracy (4-node) | Degraded-Env Resilience |
|--------|--------------------|--------------------|-------------------|------------------------|
| TDOA only | Yes (< 1µs GPS PPS) | Omnidirectional mic | ±15m at 500m | Poor (GPS jamming) |
| Bearing only | No | Directional array | ±20m at 500m | High |
| TDOA + Bearing fusion | Minimal | Either | ±8m at 500m | Very high |

### Decision

Implement `BearingTriangulator` (FR-W7-05) as a parallel positioning algorithm to the existing TdoaSolver. SentinelPipeline fusion layer uses both outputs and produces a weighted position estimate. If TDOA is unavailable (clock sync failure), bearing-only triangulation takes over. If bearing data is unavailable (omnidirectional nodes), TDOA takes over. When both are available, weighted fusion improves accuracy.

### Rationale

- Complementary failure modes: TDOA fails under GPS jamming; bearing fails if nodes only have omnidirectional microphones. Combining them means the system degrades gracefully rather than failing completely.
- Ukraine field reality: OPFOR extensively deploys GPS jammers. A positioning system dependent solely on TDOA is tactically fragile.
- George confirmed bearing-only triangulation was deployed successfully on INDIGO's 2025 Zaporizhzhia field trials with ±25m accuracy using 3 directional arrays at 300m spacing.
- Implementation complexity is bounded — BearingTriangulator shares the node geometry types already defined in TdoaCorrelator.

### Consequences

**Positive:** System resilience improves significantly in GPS-jammed environments.
**Negative:** BearingTriangulator requires directional microphone arrays or beamforming capability — nodes with single omnidirectional microphones cannot provide bearing data. Node capability registry (W4 `src/node/registry.ts`) must be extended with `capabilities.bearingCapable` field.

### Review Trigger

If field trials show bearing accuracy below ±50m consistently, consider adding 3-mic array beamforming to standard RPi4 node hardware spec.

---

## ADR-W7-004: ONVIF Protocol for PTZ Camera Slave Output

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context

FR-W7-06 (PtzSlaveOutput) drives PTZ (Pan-Tilt-Zoom) cameras to automatically aim at detected drone bearing/elevation angles. The primary hardware target identified is Dahua PTZ cameras (IPC-HDW series). Dahua publishes its own proprietary SDK (Dahua NetSDK/CGI API). However, the Dahua IPC-HDW series also supports ONVIF Profile S (PTZ control).

Two integration strategies: Dahua NetSDK (proprietary) or ONVIF Profile S (open standard).

### Options Considered

| Option | Vendor Lock-in | Documentation | Node.js Support | Future Hardware |
|--------|---------------|---------------|-----------------|-----------------|
| Dahua NetSDK | Full Dahua lock-in | Good (Chinese-market) | Unofficial wrappers only | None |
| ONVIF Profile S | None | Extensive (international standard) | `onvif` npm package | Any ONVIF-compliant PTZ |
| Raw HTTP CGI (Dahua) | Partial | Partial | Easy with fetch | Dahua only |
| RTSP PTZ (Pelco-D/P) | RS-485 serial bus | Good | Serial port library | Legacy hardware only |

### Decision

Implement PtzSlaveOutput using ONVIF Profile S PTZ control. Test against Dahua IPC-HDW mock; the implementation will work with any ONVIF-compliant PTZ camera.

### Rationale

- ONVIF is the global standard for IP camera interoperability. All major PTZ manufacturers (Dahua, Hikvision, Axis, Sony, Bosch) support ONVIF Profile S.
- The `onvif` npm package provides TypeScript-friendly SOAP/WSDL binding to the ONVIF device service — no native bindings needed.
- Operator feedback from INDIGO: field deployments use mixed camera fleets; a proprietary SDK locks them to one vendor.
- Future SkyNet net-gun integration (FR-W7-08) may use ONVIF-like command patterns for physical intercept targeting — ONVIF precedent simplifies that design.

### Consequences

**Positive:** PtzSlaveOutput works with any ONVIF camera purchased by future customers — not just Dahua. INDIGO AirGuard can deploy immediately with their existing Hikvision PTZ inventory.
**Negative:** ONVIF SOAP/WSDL is verbose and adds 12–15ms latency per PTZ command vs. raw HTTP CGI. For C-UAS at 100Hz bearing updates, ONVIF PTZ will be smoothed with a 500ms command rate limit to avoid saturating the camera.

### Review Trigger

If PTZ command latency exceeds 500ms over ONVIF due to SOAP overhead on a specific camera model, implement a vendor-specific fast path as an optional override.

---

## ADR-W7-005: SkyNet Activation via BRAVE1 Channel

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect), George (INDIGO field team)

### Context

FR-W7-08 (PhysicalInterceptCoordinator) activates the SkyNet net-gun intercept system. George (INDIGO) confirmed the SkyNet net-gun is Ukraine-tested and is the primary physical intercept mechanism for close-range threats. The question is how PhysicalInterceptCoordinator dispatches intercept commands to the SkyNet hardware.

SkyNet hardware (RPi-based firing controller) can accept commands over: a proprietary serial protocol, a custom MQTT-based channel, or an extended BRAVE1 message.

### Options Considered

| Option | Interoperability | Standard | Existing Infrastructure | Implementation |
|--------|-----------------|----------|------------------------|----------------|
| Proprietary serial protocol | None | No | No | New serial comms layer |
| Custom MQTT channel | APEX-internal only | Partial | Partial (NATS exists) | New MQTT broker |
| BRAVE1 JSON envelope (extended) | BRAVE1 ecosystem | BRAVE1 standard | Yes — W6 BRAVE1Format | Add fields to existing format |
| STANAG 4607 GMTI extended | NATO systems | STANAG | No | Full STANAG implementation |

### Decision

Dispatch SkyNet activation via BRAVE1 JSON command envelope over the existing NATS `SKYNET_ACTIVATION` stream (R5 replication). PhysicalInterceptCoordinator publishes a BRAVE1-formatted command with a `skynet_intercept` extension block. SkyNet hardware subscribes to `sentinel.skynet.command.>`.

### Rationale

- BRAVE1 JSON is already implemented (W6 FR-W6-10). Extending the schema costs one additional JSON block definition.
- Routing over NATS means the activation command inherits NATS JetStream's at-least-once delivery guarantee and audit log (stream replay).
- Ukrainian BRAVE1 C2 infrastructure can natively receive and audit intercept commands without a separate system.
- Proprietary serial protocol ties SkyNet controller to physical proximity — not viable for distributed deployment where the APEX-SENTINEL server node may be 100m from the SkyNet launcher.

### Consequences

**Positive:** SkyNet activation is auditable (NATS stream replay provides full command history). BRAVE1 C2 systems see activation events natively. NATS provides reliable delivery even if the SkyNet node temporarily loses connectivity.
**Negative:** SkyNet hardware must implement a NATS subscriber (small addition to its RPi firmware). BRAVE1 schema extension requires approval from BRAVE1 governance to maintain format compatibility.

### Review Trigger

If BRAVE1 governance rejects the `skynet_intercept` extension, fall back to a separate NATS subject with a custom command schema (non-BRAVE1).

---

## ADR-W7-006: React/Next.js for Demo Dashboard

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context

FR-W7-10 (Demo Dashboard) creates a visual interface for the Radisson dispatch center presentation and subsequent INDIGO AirGuard integration demonstrations. The dashboard must show: live track list, threat heatmap, acoustic confidence scores, terminal phase indicators, jammer activation status, and PTZ camera bearing feeds.

Three candidates: plain HTML/JavaScript, React with Next.js, or Vue.js.

### Options Considered

| Option | Dev Velocity | Extensibility | INDIGO Integration | Type Safety | Real-time Capable |
|--------|-------------|---------------|--------------------|-------------|-------------------|
| Plain HTML/JS | Medium | Poor | Manual | None | Basic (WebSocket) |
| React + Next.js | High | Excellent | React components reusable | Full (TSX) | Excellent (SWR/React Query) |
| Vue.js + Nuxt | Medium | Good | Less common in UA ecosystem | Good | Good |
| Svelte + SvelteKit | High | Good | Minimal ecosystem in context | Good | Good |

### Decision

React with Next.js App Router (TypeScript). Dashboard lives in `src/ui/demo-dashboard/` as a Next.js application. Real-time track updates via NATS WebSocket bridge or Supabase Realtime.

### Rationale

- FFMS (the APEX OS reference project) uses Next.js — reuse of components (MapGL, DataTable, HealthBadge) is immediately available via the Reuse-First protocol.
- INDIGO AirGuard's web frontend is React-based — demo dashboard components can be directly contributed to their integration layer.
- Next.js App Router supports streaming server components — useful for real-time track list rendering without full-page WebSocket management overhead.
- TypeScript coverage extends into the UI layer — dashboard types share the same sentinel-types package as backend, reducing schema drift.

### Consequences

**Positive:** Dashboard components reusable across APEX OS products. INDIGO integration velocity improves. Type-safe track data flows end-to-end.
**Negative:** Next.js adds ~200 MB to node_modules if installed in the same package. Recommend a separate package (`src/ui/demo-dashboard/package.json`) to isolate UI dependencies from the Node.js sensor pipeline.

### Review Trigger

If INDIGO AirGuard adopts a different frontend framework for their production C2 dashboard, the demo components may need a port. Treat the demo as a spike until INDIGO confirms their production stack.

---

## ADR-W7-007: TerminalPhaseDetector as Rule-Based FSM (Not Pure ML)

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context

FR-W7-03 (TerminalPhaseDetector) must identify when a detected drone transitions to its terminal attack phase. This is the highest-priority detection event in the entire system — false negatives are catastrophic (drone strikes protected asset); false positives trigger unnecessary kinetic intercept activations. Two design philosophies: train an ML classifier on terminal phase indicators, or implement a deterministic finite-state machine (FSM) based on the 4 known terminal phase indicators.

Known terminal phase indicators (INDIGO SIGINT intelligence):
1. **Speed increase** — drone accelerates to attack velocity
2. **Course commitment** — bearing rate drops to near-zero (drone locked onto target azimuth)
3. **Altitude decrease** — terminal descent profile begins
4. **RF silence** — operator cuts control link 2–10 seconds before impact (confirmed across all Shahed-136 field observations)

### Options Considered

| Option | Auditability | False Positive Risk | Training Data | Deterministic |
|--------|-------------|---------------------|---------------|--------------|
| ML binary classifier | Low (black box) | Unknown (dependent on training set) | Requires labeled terminal events | No |
| Rule-based FSM (4 indicators) | Complete audit trail | Calibratable per indicator | None | Yes |
| Hybrid (ML + FSM) | Medium | Medium | Partial | Partial |
| Threshold-only (single indicator) | High | High (each indicator alone is noisy) | None | Yes |

### Decision

Implement TerminalPhaseDetector as a rule-based FSM with 5 states: `CRUISE`, `MANEUVERING`, `SUSPECTED_TERMINAL`, `CONFIRMED_TERMINAL`, `IMPACT_IMMINENT`. Transitions governed by the 4 indicators above, each with configurable thresholds and a temporal confirmation window (default 3s per indicator).

### Rationale

- Deterministic FSM produces a complete audit trail: every state transition is logged with which indicator triggered it. This is essential for post-incident analysis and rules of engagement compliance.
- The 4 indicators are well-characterized by INDIGO SIGINT data — no labeled ML training set needed for the FSM approach.
- Rules of engagement: activating kinetic intercept (JammerActivation, PhysicalInterceptCoordinator) based on ML black-box output is a tactical liability. A deterministic, auditable trigger is required for C-UAS operations.
- FSM with configurable thresholds allows field calibration per deployment environment without retraining a model.

### Consequences

**Positive:** Every intercept activation is fully auditable. False positive rate is predictable and controllable. Zero ML training data dependency.
**Negative:** FSM cannot generalize to novel terminal phase maneuvers not covered by the 4 known indicators. New threat profiles require explicit FSM extension.

### Review Trigger

If a new OPFOR drone exhibits a terminal phase pattern not captured by the 4 indicators (e.g., GPS-guided terminal glide with constant RF link — no RF silence), add a 5th indicator to the FSM rather than switching to ML.

---

## ADR-W7-008: JammerActivation via NATS (Async, Decoupled)

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context

FR-W7-07 (JammerActivation) activates two RF jammers: a 900MHz FPV jammer (targets ELRS-based FPV drone control links) and a 1575.42MHz GPS jammer (targets GPS navigation of loitering munitions). Jammer hardware has independent controllers. The question is how SentinelPipeline dispatches jammer activation commands.

Two architectures: synchronous in-pipeline call (JammerActivation is a pipeline stage that blocks until the jammer confirms activation), or asynchronous NATS message (JammerActivation publishes to `JAMMER_COMMANDS` and returns immediately).

### Options Considered

| Option | Pipeline Latency Impact | Reliability | Auditability | Failure Mode |
|--------|------------------------|-------------|--------------|-------------|
| Synchronous call (blocking) | High — adds jammer ACK latency to pipeline | Fragile — jammer timeout blocks pipeline | Via return value | Pipeline stalls on jammer failure |
| Synchronous fire-and-forget (no ACK) | None | Unreliable — no confirmation | None | Silent failure |
| NATS async (publish + separate ACK stream) | None | High — NATS at-least-once | Complete — NATS stream replay | Jammer failure visible but non-blocking |
| REST HTTP async | Low | Medium (HTTP retry) | Partial | Timeout handling required |

### Decision

JammerActivation publishes commands to the NATS `JAMMER_COMMANDS` stream (R3) asynchronously. Jammer hardware subscribes to `sentinel.jammer.command.>`. Activation confirmation is published back on `sentinel.jammer.ack.>`. PhysicalInterceptCoordinator monitors `JAMMER_COMMANDS` ACKs for coordination.

### Rationale

- Jammer activation must never block the main detection pipeline. If the jammer controller is offline, the detection and alert pipeline must continue operating — operators can still be alerted and SkyNet can still be activated.
- NATS JetStream provides durable delivery: if the jammer controller is temporarily offline, the command is delivered when it reconnects (within `maxAge` window).
- Async pattern is consistent with the existing event bus architecture (ADR-W6-012) — no architectural paradigm shift required.
- NATS stream replay provides complete command audit log — critical for post-incident analysis and rules of engagement review.

### Consequences

**Positive:** Main detection pipeline never blocked by jammer hardware issues. Full command audit log in NATS stream. At-least-once delivery guarantee.
**Negative:** Jammer activation has non-deterministic latency from command publish to jammer active state. For a 2–10s terminal phase window, typical NATS delivery latency (< 50ms) is acceptable. Edge case: if NATS cluster is unavailable, no jammer activation possible — mitigation: local NATS server on the SentinelPipeline node.

### Review Trigger

If terminal phase window shrinks below 500ms (indicating a faster threat profile), revisit whether NATS latency is still acceptable or whether a direct UDP command to the jammer controller is needed.

---

## ADR-W7-009: Wild Hornets 16kHz Dataset as Primary Fine-tuning Corpus

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect), INDIGO/Manus AI team

### Context

The W6 DatasetPipeline targeted Telegram OSINT clips as the primary training data source. Post-W6 analysis by INDIGO/Manus AI identified the Wild Hornets dataset as a far superior source: 3,000+ field recordings at 16kHz, professionally labeled by acoustic drone identification experts, covering Shahed-136, Lancet-3, FPV drones, and background noise (artillery, vehicles, wind). The Wild Hornets dataset is available to INDIGO partner organizations under a data sharing agreement.

### Decision

Use Wild Hornets as the primary fine-tuning corpus for the 16kHz YAMNet model. Telegram OSINT clips serve as supplementary augmentation only (low confidence labels, used for data augmentation after validation against Wild Hornets labels).

### Rationale

- Wild Hornets 3,000+ clips at 16kHz eliminates the sample rate mismatch issue (ADR-W7-001).
- Professional expert labels yield higher quality training signal than OSINT clips which may mislabel similar acoustic events.
- Stratified split (80/10/10) on Wild Hornets alone provides sufficient test set size for statistical significance (≥ 300 clips per class in test set).
- Telegram OSINT as augmentation only: run OSINT clips through AcousticProfileLibrary confidence scoring; only clips with confidence > 0.70 on a Wild Hornets-validated label are included in training.

### Consequences

**Positive:** Higher quality training data → better F1. Correct 16kHz alignment → no resampling artifacts.
**Negative:** Wild Hornets access depends on INDIGO data sharing agreement. Integration script must handle secure transfer protocol.

---

## ADR-W7-010: ELRS 900MHz as Primary FPV RF Fingerprinting Target

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect), INDIGO SIGINT team

### Context

FR-W7-04 (ELRS RF Fingerprinting) targets the RF control links of FPV drones. Multiple RC/FPV link protocols exist: ELRS (ExpressLRS, 900MHz or 2.4GHz), Crossfire (868MHz/915MHz), FrSky (2.4GHz), DJI OcuSync (2.4/5.8GHz). INDIGO SIGINT confirmed: OPFOR FPV drones in eastern Ukraine predominantly use ELRS on Foxeer TRX1003 receivers (900MHz band). The 900MHz band propagates farther with less obstruction than 2.4GHz — preferred for contested RF environments with obstacles.

### Decision

Target ELRS 900MHz (868–915MHz band) as the primary fingerprinting protocol using RTL-SDR (broadband 100kHz–1.7GHz software-defined radio). The RF fingerprinting signature is ELRS's characteristic frequency-hopping pattern with ≥ 400Hz hop rate and 500ms burst timing.

### Rationale

- Foxeer TRX1003 (ELRS 900MHz) confirmed as the dominant FPV receiver in OPFOR inventory by INDIGO SIGINT.
- RTL-SDR (DVB-T dongle) is already in the sensor node hardware spec — no additional hardware required.
- ELRS 900MHz frequency-hopping pattern is machine-identifiable: ELRS protocol uses 80 channels at ≥ 400Hz hop rate with a specific timing signature that can be fingerprinted against a synthetic signal template.
- Detection of ELRS activity correlates with an FPV drone in operational range — used as a trigger to increase acoustic pipeline sensitivity.

### Consequences

**Positive:** RF fingerprint provides an earlier warning than acoustic detection (RF detectable at > 2km vs acoustic at < 1km). Combined acoustic+RF fusion improves detection confidence significantly.
**Negative:** ELRS 900MHz detection may produce false positives from non-OPFOR ELRS equipment (civilian FPV hobbyists in the same band). Require spatial correlation with acoustic track before escalating to alert.

---

## ADR-W7-011: TdoaSolver Coordinate Injection (Replaces Hardcoded 51.5/4.9)

**Date:** 2026-03-25
**Status:** Accepted
**Decider:** Nico (architect)

### Context

W1-W6 TdoaCorrelator and TdoaSolver used hardcoded coordinates (latitude 51.5, longitude 4.9 — Amsterdam area test coordinates) for all node positioning calculations. This was a known gap flagged in the W6 surgical analysis. Deploying to real nodes with these hardcoded coordinates produces completely wrong position estimates.

### Decision

Implement dynamic coordinate injection (FR-W7-09): node coordinates are read from environment variables (`NODE_LAT`, `NODE_LON`, `NODE_ALT_M`) at startup and injected into TdoaSolver. A `CoordinateRegistry` singleton holds live node positions updated via the NATS `NODE_HEALTH` stream. No hardcoded coordinates anywhere in production paths.

### Rationale

- Any deployment outside the Amsterdam test coordinates with the current hardcoded values produces position estimates with 10–10,000km error — a complete system failure that is not immediately obvious.
- Environment variables are already specified in the W5 LKGC_TEMPLATE (NODE_LAT, NODE_LON, NODE_ALT_M) but were never actually wired into TdoaSolver. W7 closes this gap.
- Dynamic coordinates via NATS `NODE_HEALTH` stream support mobile nodes (vehicle-mounted sensors) that update their GPS position as they move.

### Consequences

**Positive:** Real deployments produce accurate position estimates. Mobile node support added.
**Negative:** All existing tests that relied on hardcoded coordinates must be updated to inject explicit test coordinates. Test setup gains a required coordinate fixture.

### Review Trigger

None — this is a correctness fix, not a design decision.

---

## Summary Table

| ADR | Decision | Status | Date |
|-----|----------|--------|------|
| ADR-W7-001 | 16kHz adoption (supersedes 22050Hz) | Accepted | 2026-03-25 |
| ADR-W7-002 | Separate turbine model for Shahed-238 | Accepted | 2026-03-25 |
| ADR-W7-003 | BearingTriangulator alongside TdoaSolver | Accepted | 2026-03-25 |
| ADR-W7-004 | ONVIF for PTZ slave output | Accepted | 2026-03-25 |
| ADR-W7-005 | SkyNet activation via BRAVE1/NATS | Accepted | 2026-03-25 |
| ADR-W7-006 | React/Next.js for demo dashboard | Accepted | 2026-03-25 |
| ADR-W7-007 | TerminalPhaseDetector as rule-based FSM | Accepted | 2026-03-25 |
| ADR-W7-008 | JammerActivation via NATS async | Accepted | 2026-03-25 |
| ADR-W7-009 | Wild Hornets as primary fine-tuning corpus | Accepted | 2026-03-25 |
| ADR-W7-010 | ELRS 900MHz as primary RF fingerprint target | Accepted | 2026-03-25 |
| ADR-W7-011 | TdoaSolver coordinate injection (replaces hardcoded) | Accepted | 2026-03-25 |
