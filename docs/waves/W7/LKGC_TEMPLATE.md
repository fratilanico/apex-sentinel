# APEX-SENTINEL — LKGC_TEMPLATE.md
## Last Known Good Configuration — Wave 6 Baseline + Wave 7 Target
### Date captured: 2026-03-25 | Purpose: W7 rollback reference and W7 LKGC definition

---

## What This Document Is

The LKGC (Last Known Good Configuration) has two sections:

1. **W6 LKGC** — the stable baseline before any W7 changes are applied. Use this for W7 rollback.
2. **W7 LKGC Target** — the configuration state that must be achieved for W7 to be declared complete. Populated during `wave-formation.sh complete W7`.

---

## Section 1: W6 LKGC (W7 Rollback Baseline)

### W6 LKGC Identity

| Field | Value |
|-------|-------|
| Tag | `w6-complete` (create before W7 tdd-red begins) |
| HEAD commit | `3bc44be679e42823486eac16a83e3f2e5e47dfee` |
| Commit message | `docs(analysis): surgical document analysis + FDRP W1-W6 final report` |
| Implementation commit | `a72f398...` — `feat(W6): execute — 10 source modules, 629/629 GREEN, 14/14 mind-the-gap` |
| Capture date | 2026-03-25 |
| Total tests | 629 |
| Passing tests | 629 (100%) |

**To pin W6 LKGC tag before starting W7:**

```bash
cd /Users/nico/projects/apex-sentinel
git tag w6-complete HEAD
git push origin w6-complete
```

---

### W6 Test Coverage (Rollback Baseline)

| Metric | Value | Gate |
|--------|-------|------|
| Statements | 95.66% | ≥ 80% ✓ |
| Branches | 89.22% | ≥ 80% ✓ |
| Functions | 97.19% | ≥ 80% ✓ |
| Lines | ~95% (estimated) | ≥ 80% ✓ |
| Total tests | 629 | — |
| mind-the-gap | 14/14 PASS | 14/14 ✓ |

---

### W6 Database State

**Last Migration Applied:** `006_w6_acoustic_intelligence.sql`
**Supabase project:** `bymfcnwfyxuivinuzurr` (eu-west-2)

#### Tables Present at W6 LKGC

| Table | Wave | Purpose |
|-------|------|---------|
| `nodes` | W1 | Sensor node registry |
| `detections` | W1 | Raw acoustic/RF detections |
| `tracks` | W2/W4 | Correlated drone tracks |
| `alerts` | W2 | Generated alerts |
| `cot_events` | W2 | CoT relay events |
| `node_health` | W3 | Node health history |
| `predictions` | W5 | EKF prediction results |
| `impact_estimates` | W5 | ImpactEstimator results |
| `acoustic_profiles` | W6 | Drone acoustic signature catalog |
| `ml_model_versions` | W6 | ONNX artifact registry |
| `dataset_clips` | W6 | Training data metadata |
| `fusion_events` | W6 | Multi-node correlation log |
| `monte_carlo_results` | W6 | Impact uncertainty history |

Tables NOT present at W6 LKGC (added in W7):
- `terminal_phase_events`
- `jammer_commands`
- `skynet_activations`
- `bearing_reports`
- `ptz_command_log`

Columns NOT present at W6 LKGC (added in W7):
- `nodes.capabilities`
- `ml_model_versions.frequency_domain`

---

### W6 NATS JetStream Configuration

| Stream | Subjects | Replicas | Retention | Max Age |
|--------|---------|---------|-----------|---------|
| DETECTIONS | `sentinel.detections.>` | 3 | limits | 24h |
| NODE_HEALTH | `sentinel.health.>` | 3 | limits | 5min |
| ALERTS | `sentinel.alerts.>` | 5 | limits | 7 days |
| COT_EVENTS | `sentinel.cot.>` | 3 | limits | 24h |

Streams NOT present at W6 LKGC (added in W7):
- `JAMMER_COMMANDS`
- `PTZ_BEARING`
- `SKYNET_ACTIVATION`
- `TERMINAL_PHASE`
- `BEARING_REPORTS`

---

### W6 Active Source Modules (51 files)

#### Acoustic (5)
- `src/acoustic/fft.ts`, `pipeline.ts`, `types.ts`, `vad.ts`, `yamnet.ts`

#### Alerts (3)
- `src/alerts/cot-generator.ts`, `telegram-bot.ts`, `types.ts`

#### Correlation (1)
- `src/correlation/tdoa-correlator.ts`

#### Dashboard (5)
- `src/dashboard/alert-store.ts`, `cot-export.ts`, `keyboard-shortcuts.ts`, `stats.ts`, `track-store.ts`

#### Deploy (1)
- `src/deploy/edge-deployer.ts`

#### Edge Functions (2)
- `src/edge/ingest-event.ts`, `register-node.ts`

#### Fusion (1)
- `src/fusion/multi-node-fusion.ts`

#### Infrastructure (1)
- `src/infra/circuit-breaker.ts`

#### Integration (1)
- `src/integration/sentinel-pipeline.ts`

#### ML (4)
- `src/ml/acoustic-profile-library.ts`, `dataset-pipeline.ts`, `false-positive-guard.ts`, `yamnnet-finetuner.ts`

#### Mobile (5)
- `src/mobile/battery-optimizer.ts`, `calibration.ts`, `event-publisher.ts`, `model-manager.ts`, `nats-client.ts`

#### NATS (2)
- `src/nats/auth-config.ts`, `stream-config.ts`

#### Node (2)
- `src/node/registry.ts`, `types.ts`

#### Output (2)
- `src/output/brave1-format.ts`, `cursor-of-truth.ts`

#### Prediction (7)
- `src/prediction/ekf.ts`, `impact-estimator.ts`, `matrix-ops.ts`, `monte-carlo-propagator.ts`, `multi-track-manager.ts`, `polynomial-predictor.ts`, `prediction-publisher.ts`, `types.ts`

#### Privacy (2)
- `src/privacy/location-coarsener.ts`, `types.ts`

#### Relay (1)
- `src/relay/cot-relay.ts`

#### RF (2)
- `src/rf/rssi-baseline.ts`, `types.ts`

#### Tracking (3)
- `src/tracking/tdoa.ts`, `track-manager.ts`, `types.ts`

---

### W6 ONNX Model Artifacts

| Artifact | Variant | Storage Path | Purpose |
|----------|---------|-------------|---------|
| `yamnet-512-base-fp32.onnx` | FP32 | `models/yamnet-512-base-fp32.onnx` | W6 base model (22050Hz — DEPRECATED in W7) |

**NOTE:** The W6 yamnet-512-base-fp32.onnx used 22050Hz assumptions internally. It is NOT suitable for re-use in W7. The W7 rollback restores this model as the active model for W6 LKGC parity — it should not be used in new deployments.

---

### W6 Environment Variables

```bash
# Supabase
SUPABASE_URL=https://bymfcnwfyxuivinuzurr.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# NATS
NATS_URL=nats://localhost:4222
NATS_USER=apex_sentinel
NATS_PASSWORD=<nats-password>

# Telegram
TELEGRAM_BOT_TOKEN=<bot-token>
TELEGRAM_ALERT_CHAT_ID=<chat-id>

# Node identity
NODE_ID=<unique-node-id>
NODE_LAT=<latitude>
NODE_LON=<longitude>
NODE_ALT_M=<altitude-meters>

# Runtime
NODE_ENV=production
LOG_LEVEL=info

# W6 Feature flags
FEATURE_FALSE_POSITIVE_GUARD=true
FEATURE_MULTI_NODE_FUSION=true
FEATURE_MONTE_CARLO=true
FEATURE_CURSOR_OF_TRUTH=true
FEATURE_BRAVE1_FORMAT=true
CURSOR_OF_TRUTH_GATEWAY=http://4.231.218.96:7429/chat
```

---

## Section 2: W7 LKGC Target

This section defines what a fully complete, healthy W7 deployment looks like. Values marked `[TBD]` are filled in during `wave-formation.sh complete W7`.

---

### W7 LKGC Identity

| Field | Value |
|-------|-------|
| Tag | `w7-complete` [TBD — create at formal W7 sign-off] |
| HEAD commit | [TBD] |
| Commit message | `feat(W7): execute — 10 source modules, ~729/~729 GREEN, 14/14 mind-the-gap` |
| Capture date | [TBD] |
| Total tests | ~729 (629 W1-W6 + ~100 W7) |
| Passing tests | ~729 (100%) |

**To pin W7 LKGC tag at wave-complete:**

```bash
cd /Users/nico/projects/apex-sentinel
git tag w7-complete HEAD
git push origin w7-complete
```

---

### W7 Test Coverage Target

| Metric | Target | Gate |
|--------|--------|------|
| Statements | ≥ 95% | ≥ 80% |
| Branches | ≥ 85% | ≥ 80% |
| Functions | ≥ 95% | ≥ 80% |
| Lines | ≥ 95% | ≥ 80% |
| Total tests | ~729 | — |
| mind-the-gap | 14/14 PASS | 14/14 |

---

### W7 Model Versions at LKGC

| Model | Variant | Storage Path | Hardware | SHA256 |
|-------|---------|-------------|----------|--------|
| `yamnet-16khz-v1` | FP32 | `models/yamnet-16khz-v1.onnx` | All (base) | [TBD] |
| `yamnet-16khz-v1` | INT8 | `models/yamnet-16khz-v1-int8.onnx` | RPi4 ARM64 | [TBD] |
| `yamnet-16khz-v1` | FP16 | `models/yamnet-16khz-v1-fp16.onnx` | Jetson Nano CUDA | [TBD] |
| `yamnet-turbine-v1` | FP32 | `models/yamnet-turbine-v1.onnx` | All (base) | [TBD] |
| `yamnet-turbine-v1` | INT8 | `models/yamnet-turbine-v1-int8.onnx` | RPi4 ARM64 | [TBD] |

**SHA256 hashes must be recorded at time of model upload and verified at each edge node deployment.**

---

### W7 Hardware Configuration at LKGC

#### Node Type Enum

```typescript
type NodeType = 'rpi4' | 'jetson_nano' | 'jetson_orin' | 'x86_64';
```

#### ONVIF Endpoint Format

```
http://<camera-ip>/onvif/device_service
```

Authentication: HTTP Digest Auth with credentials in `ONVIF_CAMERA_USERNAME` / `ONVIF_CAMERA_PASSWORD` environment variables.

PTZ rate limit: 500ms minimum between commands per camera.

#### Jammer Channel Map

| Channel Key | Frequency | Target Protocol | Max Activation |
|-------------|-----------|----------------|----------------|
| `jammer.900mhz` | 868–915 MHz | ELRS FPV control links | 30 seconds |
| `jammer.1575mhz` | 1575.42 MHz | GPS L1 navigation | 30 seconds |

---

### W7 NATS Stream Configuration at LKGC

| Stream | Subjects | Replicas | Retention | Max Age |
|--------|---------|---------|-----------|---------|
| DETECTIONS | `sentinel.detections.>` | 3 | limits | 24h |
| NODE_HEALTH | `sentinel.health.>` | 3 | limits | 5min |
| ALERTS | `sentinel.alerts.>` | 5 | limits | 7 days |
| COT_EVENTS | `sentinel.cot.>` | 3 | limits | 24h |
| JAMMER_COMMANDS | `sentinel.jammer.>` | 3 | limits | 7 days |
| PTZ_BEARING | `sentinel.ptz.>` | 3 | limits | 1h |
| SKYNET_ACTIVATION | `sentinel.skynet.>` | **5** | limits | **30 days** |
| TERMINAL_PHASE | `sentinel.terminal.>` | 3 | limits | 7 days |
| BEARING_REPORTS | `sentinel.bearing.>` | 3 | limits | 5min |

**Total streams at W7 LKGC: 9**

---

### W7 Supabase Migration State at LKGC

| Migration | Status |
|-----------|--------|
| 001_w1_initial_schema.sql | Applied |
| 002_w2_nats_schema.sql | Applied |
| 003_w3_mobile_schema.sql | Applied |
| 004_w4_dashboard_schema.sql | Applied |
| 005_w5_prediction_engine.sql | Applied |
| 006_w6_acoustic_intelligence.sql | Applied |
| 007_w7_hardware_integration.sql | **Applied at W7 LKGC** |

**Verify:**

```sql
SELECT version FROM schema_migrations ORDER BY version;
-- Must include '007' as the last entry
```

---

### W7 Environment Variables at LKGC

All W6 environment variables plus the following W7 additions:

```bash
# 16kHz pipeline (REQUIRED — replaces implicit 22050Hz)
ML_SAMPLE_RATE_HZ=16000
ML_PISTON_MODEL=yamnet-16khz-v1-int8.onnx       # RPi4
ML_TURBINE_MODEL=yamnet-turbine-v1-int8.onnx     # RPi4
ML_PISTON_MODEL_JETSON=yamnet-16khz-v1-fp16.onnx # Jetson
TURBINE_PRESCREEN_THRESHOLD_DBFS=-40.0            # energy threshold for turbine routing

# W7 Features
FEATURE_TERMINAL_PHASE_DETECTOR=true
FEATURE_ELRS_FINGERPRINT=true          # only on RTL-SDR nodes
FEATURE_BEARING_TRIANGULATOR=true
FEATURE_PTZ_SLAVE_OUTPUT=false         # enable with hardware only
FEATURE_JAMMER_ACTIVATION=false        # enable with operational authorization only
FEATURE_PHYSICAL_INTERCEPT=false       # enable with operational authorization only
FEATURE_DEMO_DASHBOARD=true

# PTZ (if FEATURE_PTZ_SLAVE_OUTPUT=true)
ONVIF_CAMERA_ENDPOINT=http://<camera-ip>/onvif/device_service
ONVIF_CAMERA_USERNAME=<username>
ONVIF_CAMERA_PASSWORD=<password>
PTZ_RATE_LIMIT_MS=500

# Terminal phase FSM thresholds (defaults shown)
TERMINAL_SPEED_DELTA_PCT=15.0
TERMINAL_BEARING_RATE_MAX_DEG_S=2.0
TERMINAL_ALTITUDE_RATE_MIN_M_S=-2.0
TERMINAL_RF_SILENCE_MIN_MS=2000
TERMINAL_CONFIRM_INDICATORS=3           # of 4 required for CONFIRMED_TERMINAL
```

---

## W7 Rollback Procedure

Execute if W7 deployment must be reversed.

### Step 1: Revert Code

```bash
cd /Users/nico/projects/apex-sentinel

# Option A: if w6-complete tag exists (preferred)
git checkout tags/w6-complete
git checkout -b rollback/w6-recovery

# Option B: revert to W6 implementation commit
git checkout a72f398
git checkout -b rollback/w6-recovery
```

### Step 2: Restore Dependencies

```bash
npm install
# Removes: onvif package (added in W7)
# Retains: onnxruntime-node (added in W6, still needed)
```

### Step 3: Roll Back Database

```bash
# Apply the DOWN section of 007_w7_hardware_integration.sql
# This drops: terminal_phase_events, jammer_commands, skynet_activations, bearing_reports, ptz_command_log
# This reverts: nodes.capabilities column, ml_model_versions.frequency_domain column
```

**WARNING:** Rolling back migration 007 destroys all data in:
- `terminal_phase_events` — operational logs (acceptable loss)
- `jammer_commands` — activation audit log (preserve backup before rollback if any activations occurred)
- `skynet_activations` — intercept audit log (preserve backup if any activations occurred)
- `bearing_reports` — ephemeral bearing data (acceptable loss)
- `ptz_command_log` — operational logs (acceptable loss)

**LEGAL NOTE:** If any `jammer_commands` or `skynet_activations` records exist (indicating real activations occurred), export them to a secure archive BEFORE rolling back. These may be required for after-action review.

```sql
-- Export before rollback if records exist
COPY jammer_commands TO '/tmp/jammer_commands_backup.csv' CSV HEADER;
COPY skynet_activations TO '/tmp/skynet_activations_backup.csv' CSV HEADER;
```

### Step 4: Remove W7 NATS Streams

```bash
nats stream rm JAMMER_COMMANDS
nats stream rm PTZ_BEARING
nats stream rm SKYNET_ACTIVATION
nats stream rm TERMINAL_PHASE
nats stream rm BEARING_REPORTS
```

**WARNING:** SKYNET_ACTIVATION and JAMMER_COMMANDS removal deletes their message history. If any activation commands exist in these streams, export them first.

### Step 5: Revert Edge Node Models

```bash
# On each edge node — re-activate W6 model
# Set ml_model_versions.is_active = true for yamnet-512-base-fp32.onnx
# Set is_active = false for yamnet-16khz-v1 variants

# Update ALSA audio capture back to allow any sample rate (W6 did not enforce 16kHz explicitly)
# Remove ML_SAMPLE_RATE_HZ from .env
```

### Step 6: Remove W7 Environment Variables

```bash
# On each node, remove or disable:
unset ML_SAMPLE_RATE_HZ
unset ML_PISTON_MODEL
unset ML_TURBINE_MODEL
unset FEATURE_TERMINAL_PHASE_DETECTOR
unset FEATURE_ELRS_FINGERPRINT
unset FEATURE_BEARING_TRIANGULATOR
unset FEATURE_PTZ_SLAVE_OUTPUT
unset FEATURE_JAMMER_ACTIVATION
unset FEATURE_PHYSICAL_INTERCEPT
unset ONVIF_CAMERA_ENDPOINT
unset ONVIF_CAMERA_USERNAME
unset ONVIF_CAMERA_PASSWORD
# Update .env file accordingly
# Keep NODE_LAT/NODE_LON/NODE_ALT_M — these were required in W6 too
```

### Step 7: Verify W6 LKGC Restored

```bash
npx vitest run --coverage
# Gate: 629/629 GREEN
# Gate: All coverage metrics ≥ 80%

./wave-formation.sh checkpoint W6
# Gate: mind-the-gap 14/14 PASS
```

### Step 8: Confirm Rollback Complete

- [ ] 629/629 tests GREEN
- [ ] No W7 tables in Supabase schema
- [ ] No W7 NATS streams (`nats stream ls` shows 4 streams only)
- [ ] W7 environment variables removed from all nodes
- [ ] Edge nodes using W6 models (not 16kHz W7 models)
- [ ] Jammer/SkyNet activation records archived if applicable

---

## W7 Forward Recovery Procedure

If W7 was rolled back accidentally and needs to be restored.

### Step 1: Restore Code

```bash
git checkout main
git log --oneline -3
# Ensure W7 implementation commit is at HEAD
```

### Step 2: Restore Dependencies

```bash
npm install
# Re-installs onvif package from package.json
```

### Step 3: Re-apply Migration 007

```bash
supabase db push
# Applies 007_w7_hardware_integration.sql
```

### Step 4: Re-seed W7 Profiles

Re-run Phase 3 of DEPLOY_CHECKLIST.md — insert Gerbera, Shahed-131, Shahed-238 profiles.

### Step 5: Re-create NATS Streams

Re-run Phase 5 of DEPLOY_CHECKLIST.md — create 5 new NATS streams.

### Step 6: Re-upload W7 ONNX Models

Re-run Phase 4 of DEPLOY_CHECKLIST.md — upload yamnet-16khz-v1 and yamnet-turbine-v1 variants.

### Step 7: Re-deploy Edge Nodes

Re-run Phase 6 of DEPLOY_CHECKLIST.md — EdgeDeployer downloads 16kHz models to RPi4/Jetson.

### Step 8: Re-set Environment Variables

Re-apply Phase 8 of DEPLOY_CHECKLIST.md.

### Step 9: Verify W7 Restored

```bash
npx vitest run --coverage
# Gate: ~729/~729 GREEN

./wave-formation.sh checkpoint W7
# Gate: mind-the-gap 14/14 PASS
```
