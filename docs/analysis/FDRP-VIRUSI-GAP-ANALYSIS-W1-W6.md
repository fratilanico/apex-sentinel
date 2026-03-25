# APEX-SENTINEL — FDRP + VIRUSI Gap Analysis
## W1 through W6 Complete | Post-Document-Analysis Edition
### Date: 2026-03-25 | Status: CONDITIONAL-GO (4 P0 blockers)

---

## CONTEXT

This report supersedes the W1-W5 version. W6 is now complete (629/629 tests, 130 unit/component
+ 15 journey, 95.66% stmt coverage). The analysis incorporates:
- Full W6 code review
- 10 documents from INDIGO AirGuard team (Cat/George/Manus AI)
- WhatsApp chat decisions (24-25 March 2026)
- Ukrainian and Russian UAV catalogs

---

## DIMENSION 1: Detection Accuracy

**VERDICT: AMBER → RED (new intelligence)**

### What's Working
- Shahed-136 (Geran-2) acoustic profile: frequency range, engine type, harmonics — correct
- Orlan-10 profile: ICE two-stroke, consistent with Russian UAV Catalog spec (12h, 18kg)
- Lancet-3 profile: electric motor pattern
- FalsePositiveGuard 3-gate: confidence + doppler + temporal-linear

### Critical Gaps Revealed by Document Analysis

**Gap 1: Three drone classes absent from AcousticProfileLibrary**
```
Gerbera (p.188 Ukrainian catalog) — Russian loitering munition, distinct engine
Shahed-131/Geran-1 (p.166) — smaller Shahed, higher RPM than 136
Shahed-238/Geran-3 (p.177) — JET POWERED (turbine, 3kHz-8kHz dominant)
```
The Shahed-238 is not a piston drone. A model trained on 50-250Hz Mado MD-550 harmonics
will MISS a turbine target entirely. This is the highest-severity detection gap.

**Gap 2: Sample rate mismatch with all training data sources**
- Every INDIGO document specifies 16kHz as the standard
- Our DatasetPipeline uses TARGET_SAMPLE_RATE = 22050
- Cat's 279 training segments are 16kHz
- Wild Hornets dataset (3000+ recordings) is 16kHz
- Upsampling 16→22050kHz does not add information; damages frequency boundary at 8kHz

**Gap 3: Motorcycle false positive rate unvalidated in Romanian urban context**
- Shahed-136 "motorbike-like" confirmed by Manus AI acoustic analysis
- Romanian urban noise augmentation not in our training data
- UrbanSound8K + TAU Urban Scenes 2022 (12 EU cities) not yet integrated

**Score: 3.5/10** (down from 6.0 due to missing profiles + sample rate breach)

---

## DIMENSION 2: Privacy Architecture

**VERDICT: GREEN (unchanged)**

- LocationCoarsener: ±50m GDPR coarsening — correct
- CursorOfTruth: 4dp + ±0.0009° jitter — validated
- BRAVE1: PII-stripped CoT
- EdgeDeployer: no raw audio transmitted
- Zero raw coordinates in NATS streams

**Score: 8.5/10**

---

## DIMENSION 3: Resilience

**VERDICT: AMBER**

### Working
- NATS JetStream 5-node Raft (R3/R5)
- Circuit breaker FSM + DLQ
- SentinelPipeline offline buffer (1000 frames)
- BatteryOptimizer 4-mode FSM
- NATS NatsClient FSM with reconnect

### Gaps
- SentinelPipeline offline buffer drain on reconnect: not implemented
- Buffer eviction is Array.shift() O(n) — should be circular buffer for 1000+ entries
- No field trial resilience data — all synthetic test scenarios

**Score: 7.0/10**

---

## DIMENSION 4: Test Architecture

**VERDICT: GREEN (W6 complete)**

- 629/629 tests GREEN
- 95.66% stmt / 89.22% branch / 97.19% funcs
- 44 test files, 51 source modules
- FR-named describe blocks — compliant
- Journey tests (15) cover cross-FR pipeline
- mind-the-gap: 14/14 PASS

**Score: 9.0/10**

---

## DIMENSION 5: Architecture Completeness

**VERDICT: AMBER (missing terminal phase + coordinate injection)**

### Complete
- EKF (6D Singer Q, W5)
- MultiTrackEKFManager (W5)
- PredictionPublisher (NATS + Supabase, W5)
- MonteCarloPropagator (W6)
- MultiNodeFusion (IDW, W6)
- EdgeDeployer (RPi4/Jetson, W6)
- SentinelPipeline (W6)
- CursorOfTruth (W6)
- BRAVE1Format (W6)
- TdoaSolver (W1)

### Critical Missing
```
TerminalPhaseDetector — Cat's insight: speed increase + course correction + RF silence
RF module integration — ELRS 900MHz fingerprint (Foxeer TRX1003)
Coordinate injection — SentinelPipeline still hardcoded 51.5/4.9
```

**Score: 6.5/10**

---

## DIMENSION 6: Security (VIRUSI Matrix)

**VERDICT: AMBER — 6.3/10 (unchanged)**

| Vector | Score | Status | Notes |
|--------|-------|--------|-------|
| V — Vulnerability | 5/10 | AMBER | BRAVE1 uses timing oracle UID, mTLS not enforced end-to-end |
| I — Integrity | 7/10 | GREEN | SHA-256 model verification (ModelManager) |
| R — Resilience | 7/10 | GREEN | NATS Raft, circuit breaker, DLQ |
| U — User/Access | 6/10 | AMBER | No operator auth layer, no RBAC |
| S — Sensitivity | 8/10 | GREEN | GDPR coarsening, PII-stripped BRAVE1 |
| I — Incidents | 5/10 | AMBER | No security event logging, no anomaly detection |

**New Vector Opened (from AI paper):**
- Russian FPV drones use RK3588 NPU — can potentially be retasked to **detect and evade
  acoustic countermeasures** in future iterations. The adversary's AI is at 6 TOPS NPU onboard.
  This implies APEX-SENTINEL detection must achieve lower latency than adversary evasion (<200ms).

**Score: 6.3/10** (AMBER — P0 items for V and I vectors needed before field trial)

---

## DIMENSION 7: Operational Readiness

**VERDICT: RED**

### What's Missing for Field Trial
1. No demo UI — INDIGO has a running Flask dashboard; we have only API
2. No field-validated false positive rate — only synthetic test scenarios
3. No real sensor hardware integration — tests use mocks
4. No Gerbera or Shahed-238 acoustic data
5. No Romanian urban noise baseline established
6. Coordinate injection not done — pipeline uses hardcoded coordinates

**Score: 3.0/10** (down from prior estimate due to competitor having running system)

---

## DIMENSION 8: INDIGO Benchmark Alignment

**VERDICT: RED → AMBER (we are ahead architecturally, behind on data)**

### Their System (Cat/George prototype)
- 16kHz pipeline, YAMNet + RandomForest + Flask
- 279 Shahed-136 training segments
- 10-50 Monte Carlo paths (not physics-based)
- No EKF, no TDoA, no multi-node fusion
- Running demo: heatmap dashboard at localhost:5000

### APEX-SENTINEL Advantages
- 1000-sample MonteCarloPropagator (physics-based, with EKF state)
- 6D EKF (Singer Q) for track smoothing
- MultiNodeFusion (IDW, TDoA correlation)
- FalsePositiveGuard 3-gate (vs their single threshold=0.7)
- BRAVE1 NATO format output
- GDPR privacy coarsening
- NATS JetStream distributed messaging
- EdgeDeployer (INT8/FP16 optimization)

### APEX-SENTINEL Disadvantages
- No running demo
- 22050Hz vs their 16kHz — data incompatibility
- Missing Gerbera/Shahed-238/Shahed-131 profiles
- No Romanian field data

**Score: 6.5/10** (technically superior but operationally behind)

---

## FDRP OVERALL SCORES

| Dimension | W1-W5 | W1-W6 | Delta |
|-----------|-------|-------|-------|
| Detection Accuracy | 6.0 | 3.5 | ⬇ -2.5 (new threat classes revealed) |
| Privacy | 8.5 | 8.5 | = |
| Resilience | 6.5 | 7.0 | ⬆ +0.5 |
| Test Architecture | 7.5 | 9.0 | ⬆ +1.5 |
| Architecture Completeness | 5.5 | 6.5 | ⬆ +1.0 |
| Security (VIRUSI) | 6.3 | 6.3 | = |
| Operational Readiness | 4.0 | 3.0 | ⬇ -1.0 (competitor has demo) |
| INDIGO Alignment | 5.0 | 6.5 | ⬆ +1.5 |
| **WEIGHTED AVERAGE** | **6.0** | **6.3** | **⬆ +0.3** |

---

## PRIORITY ACTION LIST

### P0 — Blockers (must resolve before any joint test with INDIGO)
1. **Sample rate: adopt 16kHz** — change DatasetPipeline TARGET_SAMPLE_RATE to 16000, update tests
2. **Gerbera acoustic profile** — source OSINT audio, add to AcousticProfileLibrary
3. **Shahed-131 acoustic profile** — higher RPM than Shahed-136, add profile
4. **Shahed-238/Geran-3 acoustic profile** — TURBINE (3kHz-8kHz) — entirely different model needed

### P1 — Field trial blockers
5. **TerminalPhaseDetector** — 4-indicator FSM: speed increase + course correction + altitude descent + RF silence
6. **ELRS 900MHz RF fingerprint** — add to RF module: detect Foxeer TRX1003 burst pattern
7. **Wild Hornets dataset** — integrate 3000+ field recordings into DatasetPipeline
8. **Coordinate injection** — TdoaSolver feeds SentinelPipeline (remove hardcoded 51.5/4.9)
9. **Romanian urban noise** — TAU Urban Scenes 2022 + Bucharest traffic augmentation

### P2 — Pre-Radisson meeting
10. **Demo dashboard** — minimal Flask/Next.js heatmap showing tracks + alerts
11. **Gerbera OSINT scraper** — Yahoo/Facebook/Telegram sources from Manus AI data doc
12. **BRAVE1 UUID v4** — replace timing oracle with crypto UUID

### P3 — Production hardening
13. **Mohajer-06/10 profiles** — Iranian drones in Russian inventory
14. **ZALA KUB acoustic** — near-silent electric quad (RF detection primary)
15. **Circular buffer** — replace Array.shift() in SentinelPipeline offline buffer

---

## WAVE PLAN

### W7: Data Pipeline Rectification + Terminal Phase
**Theme:** Fix the 16kHz breach, add missing threat profiles, implement TerminalPhaseDetector
**FRs:**
- FR-W7-01: DatasetPipeline 16kHz migration + resampling contract
- FR-W7-02: AcousticProfileLibrary expansion (Gerbera, Shahed-131, Shahed-238)
- FR-W7-03: TerminalPhaseDetector (4-indicator FSM)
- FR-W7-04: ELRS 900MHz RF module
- FR-W7-05: Wild Hornets dataset integration
- FR-W7-06: TdoaSolver → SentinelPipeline coordinate injection
- FR-W7-07: Romanian urban noise augmentation corpus
- FR-W7-08: Demo dashboard (heatmap + track list + alerts)
**Target:** 80+ tests, all P0+P1 items closed

### W8: Field Trial Readiness
**Theme:** Hardware integration, calibration, network deployment
- Acoustic node calibration protocol
- 5-node mesh deployment scripts
- Synthetic aperture array (TDoA precision improvement)
- Multi-threat simultaneous tracking (Lancet + Shahed-136 co-presence)
- BRAVE1 to INDIGO CoT gateway

### W9: Model Maturation
**Theme:** Fine-tune on Wild Hornets + field data
- Production YAMNet fine-tuning run (Gerbera + Shahed-131 + Shahed-136 + Shahed-238)
- Romanian false positive baseline measurement
- ModelManager OTA push to fleet

### W10: NATO Integration
**Theme:** BRAVE1 → ATAK → CoT relay integration
- Full CursorOfTruth → ATAK TAK Server bridge
- Multi-country node registry
- BRAVE1 v2 (signed, non-repudiation)

---

## CHAT DECISIONS NOT YET IN CODE (from 24-25 March 2026)

| Decision | Status | W7 FR |
|----------|--------|--------|
| Python↔TypeScript integration boundary | UNDEFINED | Needs contract doc |
| Marc's 22050Hz data contract | BREACHED — confirmed 16kHz | FR-W7-01 |
| Terminal phase behavioral signal (Cat) | Not implemented | FR-W7-03 |
| Shahed-238 jet engine (Cat) | Profile missing | FR-W7-02 |
| BRAVE1 as funder/data partner | No BRAVE1 API integration | P2 item |
| Radisson physical meeting | Need demo | FR-W7-08 |

---

*FDRP+VIRUSI Analysis — APEX OS Claude — 2026-03-25*
*Based on: 629 tests, W1-W6 code review, 10 external documents*
*Supersedes: FDRP-VIRUSI-GAP-ANALYSIS-W1-W5.md*
