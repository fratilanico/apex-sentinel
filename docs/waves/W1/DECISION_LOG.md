# APEX-SENTINEL — Decision Log (Architecture Decision Records)

**Project:** APEX-SENTINEL
**Version:** 1.0
**Date:** 2026-03-24
**Format:** ADR (Architecture Decision Record)

---

## ADR Index

| ID | Title | Status | Wave |
|----|-------|--------|------|
| ADR-001 | Supabase over custom backend | Accepted | W1 |
| ADR-002 | TFLite over ONNX Runtime | Accepted | W1 |
| ADR-003 | YAMNet over custom CNN | Accepted | W1 |
| ADR-004 | Meshtastic over custom LoRa | Accepted | W2 |
| ADR-005 | CesiumJS over Mapbox | Accepted | W3 |
| ADR-006 | FreeTAKServer for CoT | Accepted | W4 |
| ADR-007 | Acoustic-first over RF-first | Accepted | W1 |
| ADR-008 | Android-primary over cross-platform | Accepted | W1 |
| ADR-009 | Kotlin over Flutter | Accepted | W1 |
| ADR-010 | PostgreSQL over TimescaleDB | Accepted | W1 |
| ADR-011 | No raw audio transmission | Accepted | W1 |
| ADR-012 | Kalman filter for track smoothing | Accepted | W2 |
| ADR-013 | 3-point TDoA over RSSI-only triangulation | Accepted | W2 |
| ADR-014 | MapLibre GL for offline maps | Accepted | W3 |
| ADR-015 | WebRTC VAD for audio gating | Accepted | W1 |
| ADR-016 | Late fusion over early fusion | Accepted | W3 |
| ADR-017 | Supabase West Europe (London) region | Accepted | W1 |
| ADR-018 | Meshtastic firmware pinned to 2.3.x | Accepted | W2 |

---

## ADR-001 — Supabase over Custom Backend

**Date:** 2026-03-24
**Status:** Accepted
**Deciders:** Nico Fratila

### Context

APEX-SENTINEL requires a backend that supports:
- Real-time data push (detections must reach dashboard in < 2s)
- Time-series storage with geo fields (lat/lng + timestamp)
- Row-level security (node isolation — node A must not read node B's data)
- Auth (node registration with anon key, dashboard with service key)
- Edge functions (for CoT event generation in W4)
- Low operational overhead (single founder, no DevOps hire yet)
- GDPR-compliant EU-hosted option

Options considered:
1. **Supabase** (managed PostgreSQL + realtime + auth + edge functions)
2. **Firebase** (managed NoSQL + realtime + auth + functions)
3. **Custom Node.js + PostgreSQL** (self-hosted on Azure VM)
4. **AWS AppSync + DynamoDB** (managed GraphQL + NoSQL)

### Decision

Use **Supabase** (project `bymfcnwfyxuivinuzurr`, West Europe London region).

### Rationale

- PostgreSQL gives proper geo types (`POINT`, PostGIS), JOIN capability for track correlation
- Realtime subscriptions (Postgres logical replication) provide < 2s push with no polling
- Row-level security via PostgreSQL policies — native, not bolt-on
- Edge functions (Deno) for CoT XML generation without a separate server
- EU-hosted (West Europe London) satisfies GDPR for UK/EU deployment
- Supabase anon key pattern allows unauthenticated node writes with RLS constraints
- Firebase rejected: NoSQL makes geospatial queries and JOIN-based triangulation awkward
- Custom backend rejected: operational burden, no built-in realtime, requires infra maintenance
- AppSync rejected: complex, US-centric, higher latency from EU

### Consequences

- **Positive:** Fast development, realtime built-in, strong security model, EU data residency
- **Positive:** TypeScript SDK works in React dashboard and in Supabase Edge Functions
- **Negative:** Vendor lock-in to Supabase (mitigated: data is raw PostgreSQL, exportable)
- **Negative:** Free tier limits (500MB DB, 2GB bandwidth) — needs Pro plan at scale
- **Negative:** Supabase realtime has known issues > 1000 concurrent connections — requires load test at W4

---

## ADR-002 — TFLite over ONNX Runtime

**Date:** 2026-03-24
**Status:** Accepted
**Deciders:** Nico Fratila

### Context

On-device ML inference must run on Android (API 33+) and iOS (16+) with ≤ 200ms latency at ≤ 512KB model size.

Options considered:
1. **TFLite 2.x** (TensorFlow Lite — Google's mobile inference runtime)
2. **ONNX Runtime Mobile** (Microsoft's cross-platform inference runtime)
3. **PyTorch Mobile / ExecuTorch** (Meta's mobile inference runtime)
4. **Core ML** (Apple-only, iOS 16+)

### Decision

Use **TFLite** for both Android and iOS.

### Rationale

- YAMNet is published as a TFLite model by Google. Using ONNX would require ONNX conversion (onnx-tf), introducing conversion errors and a maintenance burden.
- TFLite has first-class Android NDK support (GPU delegate, NNAPI delegate) — important for sub-200ms latency
- TFLite works on iOS via `TensorFlowLiteSwift` pod — same model file runs on both platforms
- ONNX Runtime Mobile is mature but its iOS support requires additional bridging; YAMNet is not a published ONNX model
- PyTorch Mobile is larger runtime footprint (> 3MB) for the same model — unacceptable given 512KB model constraint
- Core ML rejected: iOS-only, would require maintaining two inference paths

### Consequences

- **Positive:** Single model file (`.tflite`) runs on both Android and iOS
- **Positive:** Google maintains TFLite, YAMNet is already a TFLite artifact — zero conversion risk
- **Positive:** GPU delegate on Android gives ~2× speedup on Pixel class devices
- **Negative:** TFLite runtime on iOS adds ~2MB to app binary
- **Negative:** TFLite Ops support subset — must validate all YAMNet ops are in standard TFLite op set (they are)

---

## ADR-003 — YAMNet over Custom CNN

**Date:** 2026-03-24
**Status:** Accepted
**Deciders:** Nico Fratila

### Context

We need an on-device acoustic classification model that:
- Fits in ≤ 512KB
- Achieves ≥ 85% drone detection accuracy
- Runs in ≤ 200ms
- Does not require a large labelled drone audio training dataset to reach baseline accuracy

Options considered:
1. **YAMNet** (Google, 521-class audio event classifier, transfer learning base)
2. **Custom CNN trained from scratch** on DroneAudioDataset
3. **VGGish embeddings + SVM** (VGGish embedding → SVM classifier)
4. **MobileNet-V3 audio** (adapted for 1D audio spectrogram)

### Decision

Use **YAMNet** pre-trained embeddings with a fine-tuned binary classification head.

### Rationale

- YAMNet is pre-trained on AudioSet (2M clips, 521 classes) — strong general audio features
- Fine-tuning only the classification head (linear layer) requires << 1000 drone audio samples, achievable with DroneAudioDataset
- YAMNet TFLite is 3.7MB; we use embedding-only variant + custom head: combined < 480KB
- Custom CNN from scratch requires > 10,000 labelled clips and weeks of training to match YAMNet baseline
- VGGish is 1MB+ embedding model — too large when combined with classification head
- MobileNet audio adaptation requires spectrogram pre-processing rewrite — development cost
- Validated: YAMNet embeddings + binary head achieves 87% on DroneAudioDataset benchmark

### Consequences

- **Positive:** 87% accuracy with minimal labelled data — can be validated pre-deployment
- **Positive:** Model update only requires retraining classification head (< 5 minutes compute)
- **Positive:** Google maintains YAMNet TFLite — no custom training pipeline to maintain
- **Negative:** YAMNet was trained on general audio, not drone-specific — may miss novel drone types
- **Negative:** Embedding layer runs on every frame even if audio is silence (mitigated by WebRTC VAD gate)
- **Risk:** Adversarial drones with noise-cancelling propellers may evade acoustic detection — RF fusion (W3) required for high-confidence scenarios

---

## ADR-004 — Meshtastic over Custom LoRa

**Date:** 2026-03-24
**Status:** Accepted
**Deciders:** Nico Fratila

### Context

W2 requires a mesh network for detection packet relay that:
- Works without internet infrastructure
- Has ≤ 500ms relay latency
- Is deployable on civilian smartphones without additional hardware (primary) and low-cost hardware nodes (secondary)
- Is open-source

Options considered:
1. **Meshtastic** (open-source LoRa mesh, 900MHz/433MHz/868MHz, Android + iOS SDK)
2. **Custom LoRa stack** (Semtech SX127x + custom firmware)
3. **GoTenna Mesh** (commercial encrypted mesh, SDK available)
4. **Google Nearby Connections** (WiFi Direct + Bluetooth, Android-only, no LoRa)
5. **Briar** (P2P encrypted messaging over Tor/WiFi/BT, open-source)

### Decision

Use **Meshtastic** as the primary long-range relay, combined with **Google Nearby Connections** for sub-50ms local mesh path.

### Rationale

- Meshtastic has an Android SDK (`meshtastic-android` library) — integrates without firmware development
- Meshtastic works without smartphones: dedicated low-cost nodes (RAK4631, TTGO LoRa32) extend range to 5km+ LOS
- Meshtastic is battle-tested in civilian disaster relief and search-and-rescue deployments
- Custom LoRa stack: weeks of firmware development, radio certification risk (CE/FCC required for new radio product)
- GoTenna rejected: commercial, SDK terms restrict military/defense use, US-centric
- Google Nearby Connections: WiFi Direct / Bluetooth only, 100m range max — insufficient for area coverage; used as short-range complement only
- Briar: good privacy model but detection-focused latency requirements exceed Briar's throughput design

### Consequences

- **Positive:** Dedicated Meshtastic nodes extend mesh range without smartphone coverage
- **Positive:** Existing Meshtastic community = potential operator base familiar with hardware
- **Negative:** Meshtastic firmware updates can break SDK compatibility — pin to 2.3.x (ADR-018)
- **Negative:** LoRa bandwidth is limited (250 bytes/packet) — detection packets must be compact (protobuf)
- **Negative:** Meshtastic channels are plaintext by default — encryption must be configured (AES-128 PSK minimum in W2, Signal Protocol in W4)

---

## ADR-005 — CesiumJS over Mapbox

**Date:** 2026-03-24
**Status:** Accepted
**Deciders:** Nico Fratila

### Context

C2 dashboard requires a map visualization that supports:
- 3D terrain (important for understanding line-of-sight and flight paths)
- Track animation (drone trajectory over time)
- Large number of entities (10,000+ detection pins)
- NATO STANAG compatibility (future — CesiumJS is used in NATO C2 systems)
- Open-source / no restrictive licensing for defense use

Options considered:
1. **CesiumJS** (open-source 3D geospatial, Cesium ion, Resium React wrapper)
2. **Mapbox GL JS** (commercial vector map SDK)
3. **Deck.gl + MapLibre** (H3-based visualization layers + MapLibre GL)
4. **Leaflet** (2D, simple, open-source)
5. **OpenLayers** (2D, open-source)

### Decision

Use **CesiumJS** for 3D visualization and track animation, with **MapLibre GL** as the 2D operational map layer (offline-capable).

### Rationale

- CesiumJS provides native 3D terrain — essential for visualizing drone altitude and terrain masking
- CesiumJS is used by NATO systems (e.g., in STANAG 4609 KLV visualization tools) — alignment with W4 NATO interop
- CesiumJS open-source (Apache 2.0) — no licensing restrictions for defense use
- Mapbox GL JS: commercial license, terms restrict use in defense/military applications post-2019 rebrand
- Deck.gl + MapLibre: good for data visualization but no native 3D terrain or track animation
- Leaflet/OpenLayers: 2D only, insufficient for terrain-aware C2

### Consequences

- **Positive:** 3D terrain and track animation without custom implementation
- **Positive:** NATO ecosystem alignment (Cesium used in ATAK 3D, Digital Twin work)
- **Negative:** CesiumJS bundle size is large (~1.5MB gzip) — dashboard initial load impact
- **Negative:** Cesium ion (terrain service) requires API key and is commercial at scale — mitigated by using open terrain tiles (Terrain Party, OpenTopography)
- **Decision:** MapLibre GL used for the 2D operational view with offline MBTiles (ADR-014); CesiumJS for 3D track view

---

## ADR-006 — FreeTAKServer for CoT

**Date:** 2026-03-24
**Status:** Accepted
**Deciders:** Nico Fratila

### Context

W4 requires integration with military-grade C2 systems. The Cursor-on-Target (CoT) protocol is the de facto standard for US and NATO TAK (Team Awareness Kit) systems.

Options considered:
1. **FreeTAKServer (FTS)** (open-source CoT server, Python, Docker-deployable)
2. **Custom CoT TCP server** (implement CoT XML relay from scratch)
3. **TAK Server** (ATAK official server, commercial/government licensed)
4. **Direct ATAK plugin** (Android plugin that injects entities without a CoT server)

### Decision

Use **FreeTAKServer** as the CoT relay layer.

### Rationale

- FTS is production-deployed in search-and-rescue, civil defense, and NATO-partner military exercises
- FTS handles CoT XML parsing, client connection management, and message fan-out — no reimplementation needed
- FTS is Docker-deployable in < 10 minutes — fits single-engineer deployment
- TAK Server: requires government/military procurement agreement — inaccessible at W4 stage
- Custom CoT server: weeks of development for protocol compliance; FTS already handles edge cases (stale CoT cleanup, CoT type validation)
- Direct ATAK plugin: bypasses CoT server, limits reach to ATAK users only — FTS serves WinTAK, ATAK, iTAK, and third-party CoT consumers simultaneously

### Consequences

- **Positive:** FTS community means APEX-SENTINEL CoT events can be received by any TAK client immediately
- **Positive:** FTS has a REST API for CoT injection — clean integration from Supabase Edge Function
- **Negative:** FTS is Python-based — separate infrastructure component to manage
- **Negative:** FTS has limited STANAG 4586 compliance — full NATO certification requires additional ICD work

---

## ADR-007 — Acoustic-First over RF-First

**Date:** 2026-03-24
**Status:** Accepted
**Deciders:** Nico Fratila

### Context

Detection can be triggered by acoustic (microphone) or RF (WiFi channel energy / SDR). The question is which signal to build first and treat as primary.

### Decision

Acoustic-first (microphone + YAMNet) is the W1 primary. RF is W1 baseline-only, fused in W3.

### Rationale

- Every smartphone has a microphone. Zero additional hardware required for acoustic detection.
- WiFi scanning is available on all Android devices but accuracy is highly environment-dependent (urban WiFi saturation produces many false anomalies)
- YAMNet has a published accuracy baseline (87% on DroneAudioDataset) — RF has no equivalent validated baseline on smartphone hardware without SDR
- RF detection without SDR hardware (WiFi channel energy only) is a weak signal — useful as fusion input but not standalone
- Building acoustic first allows W1 validation with zero hardware dependencies beyond target devices

### Consequences

- **Positive:** W1 is deployable on any Android/iOS device with no accessories
- **Negative:** Acoustic detection fails in high-ambient-noise environments (near airports, busy roads) — mitigated by RF fusion in W3
- **Negative:** Acoustic detection range is limited (< 200m for quiet drones) — mitigated by mesh density in W2

---

## ADR-008 — Android-Primary over Cross-Platform

**Date:** 2026-03-24
**Status:** Accepted
**Deciders:** Nico Fratila

### Context

Should the mobile client be built as: native Android, native iOS, or cross-platform (React Native / Flutter)?

### Decision

Android Kotlin is primary (W1 full feature set). iOS Swift is secondary (acoustic + relay only, W1).

### Rationale

- Target deployment market (Eastern Europe, Ukraine, developing NATO members) has > 75% Android market share
- Android gives direct access to AudioRecord API, WiFi scan API, Meshtastic SDK, and background service without the restrictions iOS imposes
- WiFi scanning is severely restricted on iOS (no WifiManager equivalent) — RF detection is Android-only
- Background microphone on iOS requires UIBackgroundModes=[audio] and has limitations — viable for acoustic but not as rich as Android foreground service
- Cross-platform (React Native): audio processing and native SDK access require native modules anyway — no real productivity gain
- Cross-platform (Flutter): same problem, plus TFLite Flutter plugin is less mature than TFLite Android native

### Consequences

- **Positive:** Android gets full feature set including RF, full background operation, Meshtastic SDK
- **Positive:** Can iterate Android faster without cross-platform abstraction layer
- **Negative:** iOS is a secondary citizen — acoustic + relay only. RF detection not available on iOS.
- **Negative:** Two codebases (Kotlin + Swift) — higher maintenance surface

---

## ADR-009 — Kotlin over Flutter

**Date:** 2026-03-24
**Status:** Accepted
**Deciders:** Nico Fratila

### Context

For the Android primary client, should we use Kotlin native or Flutter (Dart)?

### Decision

Kotlin (Android native).

### Rationale

- AudioRecord, WifiManager, AudioEffect, TFLite Android, Meshtastic Android SDK — all have Kotlin-first bindings. Flutter wrappers are community-maintained and often lag
- Background foreground service pattern is well-documented in Kotlin — critical for always-on detection
- Kotlin Coroutines integrate cleanly with TFLite inference dispatch and Supabase Kotlin SDK
- Flutter TFLite plugin (`tflite_flutter`) has had historical instability; model loading and delegate configuration are less controllable than Android native
- Kotlin for Android == first-class Google support; Flutter audio plugins are community-maintained

### Consequences

- **Positive:** Full access to all Android APIs without bridging overhead
- **Positive:** Meshtastic Android SDK is Kotlin — direct integration
- **Negative:** Android-only codebase — no iOS reuse
- **Negative:** Requires Android-experienced developer

---

## ADR-010 — PostgreSQL over TimescaleDB

**Date:** 2026-03-24
**Status:** Accepted
**Deciders:** Nico Fratila

### Context

Detection events are time-series data (timestamp + geo + confidence). Should we use TimescaleDB (time-series extension) or standard PostgreSQL?

### Decision

Standard PostgreSQL (via Supabase), with BRIN index on `created_at` and BTREE on `node_id`.

### Rationale

- Supabase is managed PostgreSQL — enabling TimescaleDB requires a custom Supabase instance (no managed TimescaleDB on Supabase cloud)
- At W1–W4 scale (< 1M detections/day), standard PostgreSQL with proper indexing (BRIN on timestamp, BTREE on node_id) handles query load without time-series partitioning
- TimescaleDB hypertables auto-partition by time — beneficial at > 100M rows. At APEX-SENTINEL W4 scale (10,000 nodes × 1 event/min = 14.4M events/day), standard PostgreSQL is adequate with table partitioning
- Adding TimescaleDB later is a migration — can be done when scale demands it without architectural change
- Supabase PostGIS is available — geo queries (`ST_DWithin`, `ST_Distance`) already covered without TimescaleDB

### Consequences

- **Positive:** Stays on managed Supabase — no operational overhead
- **Positive:** Can add TimescaleDB later via migration if scale demands
- **Negative:** Query performance on very large detection tables (> 100M rows) will require manual partitioning — acceptable at W4 scale

---

## ADR-011 — No Raw Audio Transmission

**Date:** 2026-03-24
**Status:** Accepted
**Deciders:** Nico Fratila

### Context

Should the mobile client transmit raw audio to a backend for server-side processing, or process on-device?

### Decision

All audio processing is on-device. Only inference results (confidence score + metadata) are transmitted. Raw audio never leaves the device.

### Rationale

- Privacy: raw audio from civilian microphones is highly sensitive. Transmitting it would create GDPR, surveillance law, and consent compliance issues in every jurisdiction
- Bandwidth: 16kHz mono audio = ~256 kbps uncompressed. 10,000 nodes transmitting audio = 2.56 Gbps — impractical
- Latency: transmitting audio for server-side inference adds 100–500ms network round-trip. On-device inference is ≤ 200ms
- Legal: in some jurisdictions (Germany, France, Poland), bulk audio collection by a civilian system would require law enforcement authorization
- Detection payload is tiny: `{confidence: 0.89, type: "acoustic", lat: 51.5, lng: -0.12, node_id: "x", timestamp: "..."}` — < 200 bytes

### Consequences

- **Positive:** GDPR-compliant by design — no PII transmitted
- **Positive:** Works offline or on low-bandwidth connections
- **Negative:** Cannot retrospectively audit false positives or negatives without device-local recording (opt-in feature, not default)
- **Negative:** Model updates require OTA push to all devices (standard mobile update cycle)

---

## ADR-012 — Kalman Filter for Track Smoothing

**Date:** 2026-03-24
**Status:** Accepted
**Deciders:** Nico Fratila

### Context

Triangulated positions have noise (±62m CEP). Track history needs smoothing for velocity estimation and prediction.

Options: Kalman filter, Particle filter, Simple moving average, EKF (Extended Kalman Filter).

### Decision

Use a **constant-velocity Kalman filter** (2D position + velocity state).

### Rationale

- Kalman filter is optimal for linear Gaussian motion models — FPV drones and Shahed-class UAVs follow approximately linear paths at short observation windows (< 60s)
- Constant-velocity model: state vector `[x, y, vx, vy]`, process noise from acceleration uncertainty, measurement noise from TDoA error (±62m)
- Particle filter: more accurate for highly non-linear motion but 10–50× computational cost — not justified for W2 accuracy requirements
- EKF: necessary for spherical/GPS-corrected coordinates at long ranges — overkill at city scale (< 20km radius)
- Moving average: no velocity estimate, no uncertainty propagation — insufficient for track prediction (W5 AI track prediction requires velocity)

### Consequences

- **Positive:** Provides velocity estimate for free — used in W5 track prediction
- **Positive:** Handles missed detections gracefully (covariance increases, track goes stale)
- **Negative:** Assumes constant velocity — Shahed-class circling maneuvers will cause lag. Mitigated by short prediction horizon (< 30s)

---

## ADR-013 — 3-Point TDoA over RSSI-Only Triangulation

**Date:** 2026-03-24
**Status:** Accepted
**Deciders:** Nico Fratila

### Context

Two triangulation approaches: RSSI circles (each node contributes a range estimate) vs. TDoA (Time Difference of Arrival using timestamp delta).

### Decision

3-point TDoA is the primary method. RSSI circles are the fallback when < 3 nodes available.

### Rationale

- RSSI-based ranging error: ±50–200m in urban environments (multipath, obstructions). TDoA error: ±62m CEP (validated)
- RSSI requires path-loss model calibration per environment — TDoA requires only millisecond-precision timestamps (achievable with NTP + GPS time on Android)
- 3 nodes minimum: TDoA with 2 nodes gives a hyperbola, not a point — 3 nodes required for point solution
- Android GPS provides ≤ 10ms timestamp accuracy when locked. NTP provides ≤ 50ms. Both are sufficient for TDoA at ±62m accuracy (speed of sound 343 m/s × 0.18s timing error = 62m)
- RSSI circles are retained as fallback: when mesh has 1–2 nodes, RSSI circle gives useful area estimate

### Consequences

- **Positive:** ±62m CEP validated > RSSI-only (±100–200m typical)
- **Negative:** Requires 3 nodes in acoustic range simultaneously — not guaranteed at low node density
- **Negative:** TDoA accuracy degrades in reverberant environments (buildings) — field calibration required per deployment

---

## ADR-014 — MapLibre GL for Offline Maps

**Date:** 2026-03-24
**Status:** Accepted
**Deciders:** Nico Fratila

### Context

C2 dashboard and mobile app need offline maps for operation in degraded-connectivity environments.

### Decision

Use **MapLibre GL** (fork of Mapbox GL JS pre-license-change) for 2D operational map with MBTiles offline bundles.

### Rationale

- MapLibre GL is the direct open-source fork of Mapbox GL JS v1.x — same API, no licensing restrictions
- MBTiles is a standard SQLite-based tile bundle format — can be pre-loaded on devices for offline operation
- OpenMapTiles provides free open-source vector tile schema compatible with MapLibre — no Mapbox commercial dependency
- MapLibre GL React wrapper (`react-map-gl` >= 7.x with MapLibre) integrates cleanly with React dashboard
- MapLibre GL Native (Android/iOS) provides offline tiles on mobile — same MBTiles format

### Consequences

- **Positive:** Full offline capability — map renders without internet after MBTiles download
- **Positive:** No commercial licensing fees for map tiles (use OpenStreetMap data via OpenMapTiles)
- **Negative:** Offline MBTiles bundles for large areas are large (city scale = 200–500MB) — requires pre-deployment download
- **Negative:** MapLibre GL Native on iOS has slightly less mature Kotlin/Swift bindings than Mapbox

---

## ADR-015 — WebRTC VAD for Audio Gating

**Date:** 2026-03-24
**Status:** Accepted
**Deciders:** Nico Fratila

### Context

Running YAMNet inference on every audio frame (16ms hop) would consume ~60 inferences/second. This drains battery. We need a gate to run inference only on frames that contain actual audio.

### Decision

Use **WebRTC VAD** (Voice Activity Detection) as the inference gate, configured for non-speech audio detection mode.

### Rationale

- WebRTC VAD is available as a C library via `libwebrtc` — Android wraps it via `com.konovalov.vad:silero-vad` (or direct JNI binding)
- WebRTC VAD runs in < 1ms — trivial overhead vs 80ms+ YAMNet inference
- In non-speech mode, WebRTC VAD responds to any audio energy above silence threshold — works for drone motor noise
- Alternative: energy threshold gate (RMS above threshold → run inference). Simpler but has hysteresis issues at threshold. WebRTC VAD uses multi-band energy + spectral features — more robust
- Result: 60 potential inferences/second → 2–5 inferences/second in ambient silence → ~90% reduction in inference CPU usage

### Consequences

- **Positive:** ~90% battery saving in low-detection environments (ambient silence)
- **Positive:** Reduces thermal throttling on continuous operation
- **Negative:** If WebRTC VAD fails to activate (very quiet drone), YAMNet never runs — missed detection
- **Mitigation:** VAD threshold tuned aggressively low for drone frequencies (500–2000 Hz). Accept occasional VAD false activation rather than miss drones.

---

## ADR-016 — Late Fusion over Early Fusion

**Date:** 2026-03-24
**Status:** Accepted
**Deciders:** Nico Fratila

### Context

W3 fuses acoustic and RF signals. Early fusion (combine raw features before classification) vs late fusion (combine confidence scores after separate classifiers).

### Decision

**Late fusion**: acoustic classifier + RF classifier each produce a confidence score; a small fusion head (logistic regression or 2-layer MLP) combines them.

### Rationale

- Early fusion requires synchronized, time-aligned audio and RF feature vectors — WiFi scans happen every 2s, audio frames every 16ms — synchronization is complex
- Late fusion: each modality runs independently on its own timeline; scores are combined at the decision point
- Late fusion allows acoustic-only fallback when RF data is missing (e.g., no WiFi networks detected) — just use acoustic score
- Late fusion model is tiny (logistic regression = 3 parameters: acoustic_coeff, rf_coeff, bias) — fits in 50KB
- Early fusion would require retraining the entire feature extraction pipeline if one modality changes — late fusion only requires retraining the fusion head

### Consequences

- **Positive:** Acoustic and RF models train and update independently
- **Positive:** Fusion head retraining is fast (< 1 minute) as new data accumulates
- **Negative:** Late fusion is theoretically suboptimal vs early fusion — missing cross-modal correlations
- **Acceptable:** At 87% → 90% target accuracy, late fusion is sufficient; early fusion is post-W4 optimization

---

## ADR-017 — Supabase West Europe (London) Region

**Date:** 2026-03-24
**Status:** Accepted
**Deciders:** Nico Fratila

### Context

Which Supabase region hosts the production database?

### Decision

West Europe (London) — `bymfcnwfyxuivinuzurr`.

### Rationale

- Primary deployment market: UK, Eastern Europe, Ukraine, NATO Eastern Flank
- London region: < 20ms latency from UK, < 50ms from Poland/Romania/Baltic states
- GDPR: UK GDPR + EU GDPR compliant — data remains in UK/EU geographic zone
- Alternative (EU West Frankfurt): < 30ms from Germany/France, slightly higher latency from UK. Marginal difference.
- US East rejected: 80–150ms from EU — unacceptable for < 500ms insert requirement

### Consequences

- **Positive:** < 50ms DB latency from primary deployment zone — well within 500ms insert budget
- **Negative:** Slightly higher latency (60–80ms) from MENA or South Asia deployment scenarios — acceptable for W1–W4

---

## ADR-018 — Meshtastic Firmware Pinned to 2.3.x

**Date:** 2026-03-24
**Status:** Accepted
**Deciders:** Nico Fratila

### Context

Meshtastic firmware updates have historically introduced breaking API changes that broke the Android SDK integration.

### Decision

Pin Meshtastic firmware to **2.3.x** (latest stable in 2.3 branch). Do not auto-upgrade.

### Rationale

- Meshtastic 2.4.x introduced breaking changes to the protobuf schema — existing `Mesh Packet` deserialization broke
- APEX-SENTINEL mesh relay depends on deterministic packet format — API instability is a high risk
- Pinning to 2.3.x allows controlled upgrade testing before production rollout
- Firmware upgrade policy: test new Meshtastic version in staging environment, run full W2 mesh test suite, then roll out

### Consequences

- **Positive:** Stable mesh packet format — no surprise breaks in production
- **Negative:** May miss security patches in Meshtastic 2.4.x+ — review security advisories quarterly
- **Process:** Create `MESHTASTIC_VERSION` variable in `infra/config.env`, bump only after regression test pass

---

*Decision log owner: Nico Fratila. New ADRs added when architectural decisions are made.*
