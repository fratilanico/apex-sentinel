# APEX-SENTINEL — LKGC_TEMPLATE.md
## Last Known Good Configuration — Wave 5 Baseline
### Date captured: 2026-03-25 | Purpose: W6 rollback reference

---

## What This Document Is

The LKGC (Last Known Good Configuration) records the exact state of APEX-SENTINEL at W5 completion — the stable baseline before any W6 changes are applied. If W6 deployment fails or introduces regressions, this document provides the authoritative reference to restore the system to W5 LKGC.

---

## W5 LKGC Identity

| Field | Value |
|-------|-------|
| Tag | `w5-complete` (to be created at W5 formal sign-off — current HEAD is W5 implementation commit) |
| HEAD commit | `1c536c913d226317d86084a1413a151e17c3e1d8` |
| Commit message | `feat(W5): implement prediction engine — 76 RED tests go GREEN (484 total)` |
| Capture date | 2026-03-25 |
| Total tests | 484 |
| Passing tests | 484 (100%) |

**To pin LKGC tag at this commit:**
```bash
cd /Users/nico/projects/apex-sentinel
git tag w5-complete 1c536c913d226317d86084a1413a151e17c3e1d8
git push origin w5-complete
```

---

## W5 Test Coverage

| Metric | Value | Gate |
|--------|-------|------|
| Statements | 95.38% | ≥ 80% ✓ |
| Branches | 87.55% | ≥ 80% ✓ |
| Functions | 97.03% | ≥ 80% ✓ |
| Lines | ~95% (estimated) | ≥ 80% ✓ |
| Total tests | 484 | — |
| mind-the-gap | 14/14 PASS | 14/14 ✓ |

---

## W5 Database State

### Last Migration Applied
- **File:** `supabase/migrations/005_w5_prediction_engine.sql` (or equivalent — verify with `supabase migration list`)
- **Supabase project:** `bymfcnwfyxuivinuzurr` (eu-west-2)

### Tables Present at W5 LKGC

| Table | Wave Introduced | Purpose |
|-------|----------------|---------|
| `nodes` | W1 | Sensor node registry |
| `detections` | W1 | Raw acoustic/RF detections |
| `tracks` | W2/W4 | Correlated drone tracks |
| `alerts` | W2 | Generated alerts |
| `cot_events` | W2 | CoT relay events |
| `node_health` | W3 | Node health history |
| `predictions` | W5 | EKF prediction results |
| `impact_estimates` | W5 | ImpactEstimator results |

Tables NOT present at W5 LKGC (added in W6):
- `acoustic_profiles`
- `ml_model_versions`
- `dataset_clips`
- `fusion_events`
- `monte_carlo_results`

---

## W5 NATS JetStream Configuration

| Stream | Subjects | Replicas | Retention | Max Age |
|--------|---------|---------|-----------|---------|
| DETECTIONS | `sentinel.detections.>` | 3 | limits | 24h |
| NODE_HEALTH | `sentinel.health.>` | 3 | limits | 5min |
| ALERTS | `sentinel.alerts.>` | 5 | limits | 7 days |
| COT_EVENTS | `sentinel.cot.>` | 3 | limits | 24h |

NATS configuration unchanged in W6 — no new streams added.

---

## W5 Active Source Modules (41 files)

### Acoustic (5)
- `src/acoustic/fft.ts` — FFT with Hann windowing
- `src/acoustic/pipeline.ts` — AcousticPipeline orchestrator
- `src/acoustic/types.ts` — SpectralAnalysis, YamNetResult, AcousticDetection
- `src/acoustic/vad.ts` — Voice Activity Detection
- `src/acoustic/yamnet.ts` — YAMNet frequency-domain surrogate

### Alerts (3)
- `src/alerts/cot-generator.ts` — CoT XML generation
- `src/alerts/telegram-bot.ts` — Telegram alerting
- `src/alerts/types.ts` — Alert type definitions

### Correlation (1)
- `src/correlation/tdoa-correlator.ts` — TDOA multi-node correlation

### Dashboard (5)
- `src/dashboard/alert-store.ts` — AlertStore (Supabase-backed)
- `src/dashboard/cot-export.ts` — CoT export for ATAK
- `src/dashboard/keyboard-shortcuts.ts` — Operator shortcuts
- `src/dashboard/stats.ts` — Live detection statistics
- `src/dashboard/track-store.ts` — TrackStore

### Edge Functions (2)
- `src/edge/ingest-event.ts` — Detection ingest
- `src/edge/register-node.ts` — Node registration

### Infrastructure (1)
- `src/infra/circuit-breaker.ts` — CircuitBreaker (CLOSED/OPEN/HALF_OPEN)

### Mobile (5)
- `src/mobile/battery-optimizer.ts` — Adaptive inference frequency
- `src/mobile/calibration.ts` — Acoustic calibration
- `src/mobile/event-publisher.ts` — Mobile event publisher
- `src/mobile/model-manager.ts` — On-device model lifecycle
- `src/mobile/nats-client.ts` — NatsClient with reconnection

### NATS (2)
- `src/nats/auth-config.ts` — NATS auth + TLS config
- `src/nats/stream-config.ts` — JetStream stream definitions

### Node (2)
- `src/node/registry.ts` — Node registry
- `src/node/types.ts` — Node type definitions

### Prediction (7)
- `src/prediction/ekf.ts` — ExtendedKalmanFilter (Singer Q, 6D)
- `src/prediction/impact-estimator.ts` — ImpactEstimator (deterministic)
- `src/prediction/matrix-ops.ts` — Matrix algebra (6×6)
- `src/prediction/multi-track-manager.ts` — MultiTrackEKFManager (1000 tracks)
- `src/prediction/polynomial-predictor.ts` — PolynomialPredictor (5 horizons)
- `src/prediction/prediction-publisher.ts` — PredictionPublisher (NATS + Supabase)
- `src/prediction/types.ts` — EKFState, PredictionResult, ImpactEstimate

### Privacy (2)
- `src/privacy/location-coarsener.ts` — GPS coarsening
- `src/privacy/types.ts` — Privacy type definitions

### Relay (1)
- `src/relay/cot-relay.ts` — CoT relay to ATAK

### RF (2)
- `src/rf/rssi-baseline.ts` — RSSI baseline computation
- `src/rf/types.ts` — RF type definitions

### Tracking (3)
- `src/tracking/tdoa.ts` — TDOA hyperbolic positioning
- `src/tracking/track-manager.ts` — TrackManager
- `src/tracking/types.ts` — Track type definitions

---

## W5 Environment Variables

All environment variables required for W5 LKGC state:

```bash
# Supabase
SUPABASE_URL=https://bymfcnwfyxuivinuzurr.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# NATS
NATS_URL=nats://localhost:4222           # or cluster URL
NATS_USER=apex_sentinel
NATS_PASSWORD=<nats-password>
NATS_TLS_CA=<path-to-ca.pem>            # if TLS enabled

# Telegram
TELEGRAM_BOT_TOKEN=<bot-token>
TELEGRAM_ALERT_CHAT_ID=<chat-id>

# Node identity
NODE_ID=<unique-node-id>                # e.g., "node-kherson-01"
NODE_LAT=<latitude>
NODE_LON=<longitude>
NODE_ALT_M=<altitude-meters>

# Runtime
NODE_ENV=production
LOG_LEVEL=info
```

Variables NOT present at W5 LKGC (added in W6):
```bash
FEATURE_YAMNNET_FINETUNE=<bool>
FEATURE_FALSE_POSITIVE_GUARD=<bool>
FEATURE_MULTI_NODE_FUSION=<bool>
FEATURE_MONTE_CARLO=<bool>
FEATURE_CURSOR_OF_TRUTH=<bool>
FEATURE_BRAVE1_FORMAT=<bool>
CURSOR_OF_TRUTH_GATEWAY=http://4.231.218.96:7429/chat
```

---

## W5 Runtime Requirements

| Requirement | Value |
|-------------|-------|
| Node.js | ≥ 18.0.0 (ESM modules required) |
| npm | ≥ 9.0.0 |
| TypeScript | 5.8.2 |
| Vitest | 3.0.9 |
| OS | Linux (Ubuntu 22.04+) or macOS 14+ (development) |
| Architecture | x86_64 or ARM64 |
| RAM | ≥ 512 MB (RPi4 minimum) |
| Storage | ≥ 2 GB available |

**W6 additions:**
- `onnxruntime-node` (50 MB npm package)
- ONNX Runtime native binary (~80 MB on ARM64)

---

## W6 Rollback Procedure

Execute this procedure if W6 deployment must be reversed.

### Step 1: Revert Code

```bash
cd /Users/nico/projects/apex-sentinel

# Option A: if w5-complete tag exists
git checkout tags/w5-complete
# (creates detached HEAD — create branch if continuing work)
git checkout -b rollback/w5-recovery

# Option B: revert to specific commit
git checkout 1c536c913d226317d86084a1413a151e17c3e1d8
git checkout -b rollback/w5-recovery
```

### Step 2: Restore Dependencies

```bash
npm install
# Removes onnxruntime-node which is only in W6 package.json
```

### Step 3: Roll Back Database

```bash
# Apply W6 migration rollback (DOWN section in 006_w6_acoustic_intelligence.sql)
# This drops: acoustic_profiles, ml_model_versions, dataset_clips, fusion_events, monte_carlo_results
# And drops storage bucket: ml-models

# Via Supabase SQL editor or CLI:
# Run the DOWN section of 006_w6_acoustic_intelligence.sql
```

**WARNING:** Rolling back migration 006 destroys all data in:
- `acoustic_profiles` (seeded baseline profiles — can be re-seeded)
- `ml_model_versions` (ONNX artifact references — storage files remain, can be re-registered)
- `dataset_clips` (training metadata — if dataset collection was in progress, records are lost)
- `fusion_events` (operational logs — acceptable loss)
- `monte_carlo_results` (operational logs — acceptable loss)

### Step 4: Remove W6 Environment Variables

```bash
# On each edge node, remove W6-specific env vars:
unset FEATURE_YAMNNET_FINETUNE
unset FEATURE_FALSE_POSITIVE_GUARD
unset FEATURE_MULTI_NODE_FUSION
unset FEATURE_MONTE_CARLO
unset FEATURE_CURSOR_OF_TRUTH
unset FEATURE_BRAVE1_FORMAT
unset CURSOR_OF_TRUTH_GATEWAY
# Update .env file accordingly
```

### Step 5: Verify W5 LKGC Restored

```bash
npx vitest run --coverage
# Gate: 484/484 GREEN
# Gate: Statement coverage ≥ 80%

./wave-formation.sh checkpoint W5
# Gate: mind-the-gap 14/14 PASS
```

### Step 6: Confirm Rollback Complete

- [ ] 484/484 tests GREEN
- [ ] No W6 tables in Supabase
- [ ] W6 environment variables removed
- [ ] No onnxruntime-node in package.json

---

## W6 Forward Recovery Procedure

If W6 was rolled back accidentally and needs to be restored:

### Step 1: Restore Code

```bash
git checkout main
# Ensure main branch has W6 implementation
git log --oneline -3
```

### Step 2: Restore Dependencies

```bash
npm install
# Installs onnxruntime-node from package.json
```

### Step 3: Re-apply Migration 006

```bash
# Apply 006_w6_acoustic_intelligence.sql
# (UP section — creates all W6 tables + storage bucket)
```

### Step 4: Re-seed Acoustic Profiles

Re-run Phase 3 of DEPLOY_CHECKLIST.md — insert the 4 baseline drone profiles.

### Step 5: Re-upload ONNX Model

Re-run Phase 4 of DEPLOY_CHECKLIST.md — upload base ONNX model to Supabase Storage and insert `ml_model_versions` record.

### Step 6: Re-set Environment Variables

Re-apply Phase 6 of DEPLOY_CHECKLIST.md — set all W6 feature flags.

### Step 7: Verify W6 Restored

```bash
npx vitest run --coverage
# Gate: 614/614 GREEN

./wave-formation.sh checkpoint W6
# Gate: mind-the-gap 14/14 PASS
```
