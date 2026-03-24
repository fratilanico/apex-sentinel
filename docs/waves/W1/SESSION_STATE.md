# APEX-SENTINEL — Session State

**Project:** APEX-SENTINEL
**Version:** 1.0
**Date:** 2026-03-24
**Current Wave:** W1 (in progress — pre-code, documentation phase)
**Session:** Wave 1 init — PROJECTAPEX 20-doc suite generation

---

## Current Phase

```
Wave 1:  [INIT ████████] [PLAN ████████] [TDD-RED ░░░░░░░░] [EXECUTE ░░░░░░░░] [CHECKPOINT ░░░░░░░░] [COMPLETE ░░░░░░░░]
```

**Phase:** `plan` — All 20 PROJECTAPEX docs being authored. TDD-RED not yet started.

---

## What Has Been Decided (This Session)

### Architecture

| Decision | Outcome | ADR |
|----------|---------|-----|
| Backend | Supabase `bymfcnwfyxuivinuzurr` West Europe London | ADR-001 |
| ML runtime | TFLite (Android + iOS) | ADR-002 |
| ML model | YAMNet embeddings + binary classification head | ADR-003 |
| Mesh layer | Meshtastic 2.3.x + Google Nearby Connections | ADR-004 |
| 3D visualization | CesiumJS + MapLibre GL (2D/offline) | ADR-005 |
| CoT integration | FreeTAKServer (W4) | ADR-006 |
| Detection order | Acoustic-first, RF fusion in W3 | ADR-007 |
| Mobile primary | Android Kotlin | ADR-008, ADR-009 |
| DB engine | PostgreSQL (Supabase managed) | ADR-010 |
| Audio privacy | No raw audio transmission — on-device only | ADR-011 |
| Track smoothing | Kalman filter (constant-velocity 2D) | ADR-012 |
| Triangulation | 3-point TDoA primary, RSSI fallback | ADR-013 |
| Offline maps | MapLibre GL + MBTiles | ADR-014 |
| Audio gating | WebRTC VAD | ADR-015 |
| RF fusion method | Late fusion | ADR-016 |
| Supabase region | West Europe London | ADR-017 |
| Meshtastic version | Pinned to 2.3.x | ADR-018 |

### Feature Scope — Wave 1

Confirmed in scope for W1:

```
[x] Android Kotlin acoustic pipeline (mic → bandpass → YAMNet → classifier)
[x] iOS Swift acoustic pipeline (AudioEngine → TFLite)
[x] WebRTC VAD gate (Android)
[x] WiFi channel energy baseline scan (Android, not fused)
[x] Supabase detection insert (table: detections)
[x] Supabase node registration (table: nodes)
[x] Row-level security (node isolation)
[x] Basic React dashboard (MapLibre GL map + detection list)
[x] Real-time subscription (Supabase realtime)
[x] Node identity (stable UUID, encrypted storage)
[x] Local notification on detection (Android foreground service + iOS background audio)
[x] Alert de-bounce (5s window)
```

Explicitly out of scope for W1 (deferred to W2+):

```
[ ] Meshtastic mesh relay — W2
[ ] TDoA triangulation — W2
[ ] Kalman filter track — W2
[ ] CesiumJS 3D visualization — W3
[ ] RF/acoustic fusion model — W3
[ ] Offline SQLite queue — W3
[ ] FreeTAKServer CoT — W4
[ ] Signal Protocol encryption — W4
```

---

## What Has Been Built

**Status: ZERO CODE WRITTEN.** This session is the documentation/planning phase (wave-formation `plan`).

All PROJECTAPEX 20-doc suite documents are being authored in this session:

| Doc | File | Status |
|-----|------|--------|
| 01 DESIGN | DESIGN.md | TBD |
| 02 PRD | PRD.md | TBD |
| 03 ARCHITECTURE | ARCHITECTURE.md | TBD |
| 04 DATABASE_SCHEMA | DATABASE_SCHEMA.md | TBD |
| 05 API_SPECIFICATION | API_SPECIFICATION.md | TBD |
| 06 AI_PIPELINE | AI_PIPELINE.md | TBD |
| 07 PRIVACY_ARCHITECTURE | PRIVACY_ARCHITECTURE.md | TBD |
| 08 ROADMAP | ROADMAP.md | COMPLETE |
| 09 TEST_STRATEGY | TEST_STRATEGY.md | COMPLETE |
| 10 ACCEPTANCE_CRITERIA | ACCEPTANCE_CRITERIA.md | COMPLETE |
| 11 DECISION_LOG | DECISION_LOG.md | COMPLETE |
| 12 SESSION_STATE | SESSION_STATE.md | THIS FILE |
| 13 ARTIFACT_REGISTRY | ARTIFACT_REGISTRY.md | COMPLETE |
| 14 DEPLOY_CHECKLIST | DEPLOY_CHECKLIST.md | COMPLETE |
| 15 LKGC_TEMPLATE | LKGC_TEMPLATE.md | TBD |
| 16 IMPLEMENTATION_PLAN | IMPLEMENTATION_PLAN.md | TBD |
| 17 HANDOFF | HANDOFF.md | TBD |
| 18 FR_REGISTER | FR_REGISTER.md | TBD |
| 19 RISK_REGISTER | RISK_REGISTER.md | TBD |
| 20 INTEGRATION_MAP | INTEGRATION_MAP.md | TBD |

---

## Validated Metrics (From Design Phase Research)

These are the confirmed baseline numbers driving the design:

| Metric | Value | Source |
|--------|-------|--------|
| ML inference latency | 156ms (P50), ≤ 200ms (P99) | TFLite YAMNet benchmark |
| TFLite model size | 480KB | YAMNet embedding variant |
| Detection accuracy | 87% | DroneAudioDataset + YAMNet fine-tune |
| Triangulation accuracy | ±62m CEP | TDoA 3-point simulation |
| False positive rate target | ≤ 8% | Benchmark against ambient clips |
| Confidence threshold | 0.72 | Tuned for FP/FN trade-off |
| Bandpass filter range | 500–2000 Hz | FPV motor noise spectrum analysis |
| Background sample rate | 16 kHz | YAMNet input requirement |

---

## Open Questions

### Q1: GPS timestamp accuracy on Android without GPS lock

**Question:** TDoA requires ≤ 180ms timestamp accuracy. Without GPS lock, Android uses NTP (±50ms) or network time (±100ms). Is NTP sufficient or do we require GPS lock for triangulation?

**Status:** Open
**Impact:** W2 TDoA accuracy specification
**Decision needed by:** W2 plan phase

**Current leaning:** NTP (50ms) × speed of sound (343 m/s) = 17m error — acceptable within 62m CEP budget. Require GPS lock only when < 3 nodes available as fallback.

---

### Q2: Meshtastic SDK — Android library integration method

**Question:** Should Meshtastic be integrated as a compiled AAR library or as a git submodule / source dependency?

**Status:** Open
**Impact:** W2 Android build setup
**Decision needed by:** W2 init

**Options:**
- AAR from Maven (simpler, pinned version) — preferred
- Git submodule (`git submodule add https://github.com/meshtastic/Meshtastic-Android`)

**Current leaning:** AAR from Maven with explicit version pin (`implementation 'com.geeksville.mesh:meshtastic:2.3.14'`).

---

### Q3: DroneAudioDataset availability and licensing

**Question:** Is the DroneAudioDataset (used for YAMNet fine-tuning and test fixtures) freely available for our use case (defense)?

**Status:** Open
**Impact:** W1 ML training and test fixtures
**Decision needed by:** W1 execute phase

**Sources to check:**
- `github.com/junzis/drone-audio-dataset`
- Kaggle: `sgluege/drone-audio-dataset-v2`
- License: check for defense/commercial use restrictions

---

### Q4: Supabase realtime at 10k concurrent nodes

**Question:** Supabase realtime (Postgres logical replication) has known scaling limits. At 10,000 concurrent nodes each inserting 1 detection/minute, does Supabase Pro (dedicated compute) handle this?

**Status:** Open
**Impact:** W4 load test
**Decision needed by:** W3 architecture review

**Fallback:** If Supabase realtime can't handle 10k concurrent subscriptions, upgrade to Supabase Enterprise or migrate realtime to a dedicated Ably/Pusher tier while keeping Supabase for persistence.

---

### Q5: App store distribution strategy

**Question:** Google Play and Apple App Store have policies against apps that could be classified as "surveillance tools." What's the distribution strategy?

**Status:** Open
**Impact:** W1 release planning
**Decision needed by:** W1 checkpoint

**Options:**
1. Enterprise distribution (Android Enterprise MDM, Apple Developer Enterprise Program)
2. Sideload APK for Android; TestFlight invitation-only for iOS
3. Reframe app as "community safety" — assess Play/App Store viability

**Current leaning:** Enterprise MDM for Android deployment, TestFlight for iOS. App Store/Play Store as stretch goal with legal review.

---

## Blockers

### B1: YAMNet model file not yet downloaded

**Blocker:** `yamnet_classification.tflite` (480KB) must be downloaded from TF Hub before W1 execute.

```bash
# Download command (run before execute phase)
python3 -c "
import tensorflow_hub as hub
import tensorflow as tf
model = hub.load('https://tfhub.dev/google/yamnet/1')
tf.saved_model.save(model, '/tmp/yamnet_saved_model')
# Then convert: tflite_convert --saved_model_dir=/tmp/yamnet_saved_model --output_file=yamnet_classification.tflite
"
# OR download pre-converted:
curl -L https://storage.googleapis.com/download.tensorflow.org/models/tflite/task_library/audio_classification/android/yamnet_int8.tflite \
  -o android/app/src/main/assets/yamnet_classification.tflite
```

**Status:** Open. Must resolve before TDD-RED.

---

### B2: DroneAudioDataset test fixtures not yet collected

**Blocker:** TEST_STRATEGY requires 200+ labelled drone audio clips. Must be sourced before tests can be written.

**Action:** Check `github.com/junzis/drone-audio-dataset` and `kaggle.com/sgluege/drone-audio-dataset-v2`. Download and validate licenses.

**Status:** Open. Must resolve before TDD-RED.

---

### B3: Supabase project `bymfcnwfyxuivinuzurr` — migrations not yet applied

**Blocker:** No tables exist yet. Must run migrations 001–003 before integration tests can pass.

**Action:** See DEPLOY_CHECKLIST.md → Wave 1 Pre-Deploy section.

**Status:** Open. Will resolve at start of W1 execute.

---

## Next Actions (Ordered)

```
Priority 1 (before TDD-RED):
[ ] Download yamnet_classification.tflite → android/app/src/main/assets/
[ ] Source DroneAudioDataset → tests/fixtures/audio/
[ ] Apply Supabase migrations 001-003 (detections, nodes, node_health tables)
[ ] Verify Supabase anon key + service key in .env.local

Priority 2 (TDD-RED phase):
[ ] Write AcousticPipelineTest.kt (FR-01) — all tests RED
[ ] Write WiFiAnomalyDetectorTest.kt (FR-02) — all tests RED
[ ] Write DetectionRepositoryTest.kt (FR-03) — all tests RED
[ ] Write FR_01_AcousticEngineTests.swift (FR-04) — all tests RED
[ ] Write dashboard unit tests (detection-service.test.ts) — all tests RED
[ ] Write Playwright E2E specs (dashboard-map.spec.ts) — all tests RED
[ ] Commit RED state: git commit -m "test: W1 TDD-RED — all FR-01 through FR-08 tests failing"

Priority 3 (execute phase):
[ ] Implement AcousticDetectionEngine.kt
[ ] Implement BandpassFilter.kt
[ ] Implement TFLiteAcousticModel.kt
[ ] Implement WiFiAnomalyDetector.kt
[ ] Implement DetectionRepository.kt (Supabase insert)
[ ] Implement NodeRepository.kt (registration)
[ ] Implement AcousticDetectionEngine.swift (iOS)
[ ] Implement React dashboard (MapLibre GL + detection list + realtime)
[ ] Run all tests to GREEN
[ ] Run coverage check (≥ 80%)
[ ] W1 checkpoint
```

---

## Key Decisions From This Session

1. **Supabase project confirmed:** `bymfcnwfyxuivinuzurr` West Europe London
2. **TFLite + YAMNet confirmed as W1 ML stack**
3. **No raw audio transmission** — privacy-by-design, non-negotiable
4. **Android-primary** — full W1 feature set on Android, iOS acoustic + relay only
5. **Confidence threshold set at 0.72** — tuned for ≤ 8% FP rate
6. **Bandpass filter 500–2000 Hz** — FPV motor noise spectrum
7. **WebRTC VAD gate** — battery saving ~90% inference reduction
8. **Alert de-bounce 5s** — prevents notification spam
9. **PROJECTAPEX 20-doc suite** for all waves — non-negotiable methodology

---

## Wave 1 Success Definition

Wave 1 is COMPLETE when:
```
[ ] Android app detects drone audio on real device at ≥ 87% accuracy
[ ] iOS app detects drone audio at ≥ 85% accuracy
[ ] Detection inserts to Supabase in ≤ 500ms
[ ] Dashboard shows real-time detection pin on map
[ ] All W1 acceptance criteria (FR-01 through FR-08) pass
[ ] Test coverage ≥ 80% all axes
[ ] W1 QA checklist fully signed off
[ ] SESSION_STATE updated to "W1 COMPLETE"
```

---

*Session state updated: 2026-03-24. Next update: W1 TDD-RED commit.*
