# APEX-SENTINEL — DEPLOY_CHECKLIST.md
## Wave 6: Military Acoustic Intelligence + YAMNet Fine-tuning + Edge Deployment
### Date: 2026-03-25 | Environment: Production (Supabase bymfcnwfyxuivinuzurr)

---

## Overview

W6 deployment adds acoustic intelligence capabilities to APEX-SENTINEL: YAMNet fine-tuning pipeline, false positive guard, multi-node fusion, Monte Carlo impact propagation, CursorOfTruth, and BRAVE1 output. This checklist must be executed in order. No step may be skipped.

**Responsible:** Nico
**Estimated deployment window:** 90 minutes
**Rollback tag:** `w5-complete` (see LKGC_TEMPLATE.md)

---

## Phase 1: Pre-Deployment Verification

### 1.1 Full Test Suite

```bash
cd /Users/nico/projects/apex-sentinel
npx vitest run --coverage
```

**Gate:** All 614 tests must pass (484 W1-W5 + 130 W6). Zero failures.
**Coverage gate:** All metrics ≥ 80%
- Statements ≥ 80%
- Branches ≥ 80%
- Functions ≥ 80%
- Lines ≥ 80%

- [ ] 614/614 tests GREEN
- [ ] Statement coverage ≥ 80%
- [ ] Branch coverage ≥ 80%
- [ ] Function coverage ≥ 80%

### 1.2 TypeScript Strict Mode

```bash
npx tsc --noEmit
```

**Gate:** Zero TypeScript errors. Zero implicit `any`. Strict mode enabled in tsconfig.json.

- [ ] `tsc --noEmit` exits with code 0
- [ ] No `@ts-ignore` suppressions added in W6 code

### 1.3 Build Verification

```bash
npm run build
```

**Gate:** Build completes without errors. All imports resolve.

- [ ] Build exits with code 0

### 1.4 mind-the-gap Audit

```bash
./wave-formation.sh checkpoint W6
```

**Gate:** 14/14 dimensions PASS (same as W5 baseline).

- [ ] mind-the-gap 14/14 PASS

### 1.5 Git State

```bash
git status
git log --oneline -3
```

**Gate:** Working tree clean. W6 implementation commit is HEAD. Tag `w6-complete` exists.

- [ ] Working tree clean (no uncommitted changes)
- [ ] `git tag | grep w6-complete` shows the tag
- [ ] Pushed to origin/main: `git status` shows "up to date"

---

## Phase 2: Database Migration

### 2.1 Apply Migration 006

```bash
# Verify migration file exists
ls supabase/migrations/006_w6_acoustic_intelligence.sql

# Apply via Supabase Management API (DDL requires PAT — NOT REST API)
# Option A: via MCP tool
# Option B: via supabase CLI
supabase db push --db-url "postgresql://postgres.[ref]:[password]@aws-0-eu-west-2.pooler.supabase.com:6543/postgres"
```

**Supabase project:** bymfcnwfyxuivinuzurr (eu-west-2)

**Migration creates:**
- `acoustic_profiles` table — drone acoustic signature catalog
- `ml_model_versions` table — ONNX artifact registry with Supabase Storage references
- `dataset_clips` table — training data metadata (no audio blobs — references only)
- `fusion_events` table — multi-node correlation event log
- `monte_carlo_results` table — impact uncertainty history per track

**Migration creates storage bucket:**
- `ml-models` — public read, authenticated write, 50 MB max file size

- [ ] Migration 006 applied successfully
- [ ] `acoustic_profiles` table exists with correct columns
- [ ] `ml_model_versions` table exists
- [ ] `dataset_clips` table exists
- [ ] `fusion_events` table exists
- [ ] `monte_carlo_results` table exists
- [ ] `ml-models` storage bucket created

### 2.2 Verify Migration Applied

```sql
-- Run in Supabase SQL editor
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('acoustic_profiles','ml_model_versions','dataset_clips','fusion_events','monte_carlo_results')
ORDER BY table_name;
```

**Gate:** 5 rows returned.

- [ ] All 5 new tables visible in Supabase dashboard

---

## Phase 3: Seed Acoustic Profiles

### 3.1 Insert Baseline Drone Profiles

Insert 4 baseline acoustic profiles into `acoustic_profiles` table. These are the initial INDIGO AirGuard-sourced profiles:

```sql
INSERT INTO acoustic_profiles (drone_model, fundamental_hz, harmonic_ratios, modulation_rate_hz, source, confidence_threshold, notes)
VALUES
  ('Shahed-136', 52.0, ARRAY[1.0, 2.0, 3.0, 4.0, 5.0], 8.5, 'INDIGO-AirGuard-Kherson-2025', 0.72, 'MADO-20 engine, 2-stroke characteristic'),
  ('Lancet-3', 95.0, ARRAY[1.0, 2.0, 3.0], 12.0, 'OSINT-Telegram-2025', 0.68, 'Electric pusher motor, clean harmonic'),
  ('Mavic-Mini', 180.0, ARRAY[1.0, 1.5, 2.0, 3.0], 24.0, 'Commercial-baseline', 0.75, '4-rotor signature, GPS hover'),
  ('Orlan-10', 38.0, ARRAY[1.0, 2.0, 3.0, 4.0], 6.0, 'OSINT-field-2024', 0.65, 'Gasoline 2-stroke 6.5kW, lower fundamental');
```

- [ ] Shahed-136 profile inserted
- [ ] Lancet-3 profile inserted
- [ ] Mavic Mini profile inserted
- [ ] Orlan-10 profile inserted
- [ ] `SELECT COUNT(*) FROM acoustic_profiles` returns 4

---

## Phase 4: ONNX Model Upload

### 4.1 Upload Initial YAMNet ONNX Artifact

Upload the initial YAMNet-512 base model (pre-fine-tuning) to Supabase Storage. This is the fallback model until fine-tuning completes.

```bash
# Upload to ml-models bucket via Supabase Storage API
# File: yamnet-512-base-fp32.onnx (3.7 MB)
# Path in bucket: models/yamnet-512-base-fp32.onnx
```

**Note:** The fine-tuned INT8/FP16 models are generated by YAMNetFineTuner (FR-W6-02) after dataset collection. The base model is the deployment fallback.

### 4.2 Insert Model Version Record

```sql
INSERT INTO ml_model_versions (
  model_name, version, variant, format, storage_path,
  size_bytes, sha256, is_active, deployed_to
)
VALUES (
  'yamnet-512', '1.0.0-base', 'fp32', 'onnx',
  'models/yamnet-512-base-fp32.onnx',
  3876864, '<sha256-of-file>', true,
  ARRAY['all']
);
```

- [ ] Base ONNX model uploaded to Supabase Storage bucket `ml-models`
- [ ] Model version row inserted in `ml_model_versions`
- [ ] Storage URL accessible (test with public URL)

---

## Phase 5: Edge Device Setup

### 5.1 RPi4 Nodes — ONNX Runtime Installation

For each RPi4 acoustic sensor node:

```bash
# SSH to RPi4 node (adjust IP per node inventory)
ssh pi@<node-ip>

# Install ONNX Runtime for ARM64 (pre-built wheel)
pip3 install onnxruntime  # CPU-only, ARM64 compatible
# OR use community build for ARM64:
# pip3 install https://github.com/nknytk/built-onnxruntime-for-raspberrypi-linux/releases/download/v1.16.3/onnxruntime-1.16.3-cp311-cp311-linux_aarch64.whl

# Verify installation
python3 -c "import onnxruntime as ort; print(ort.__version__)"
```

**Gate:** ONNX Runtime version ≥ 1.16.0 installed on all RPi4 nodes.

- [ ] ONNX Runtime installed on RPi4 node 1
- [ ] ONNX Runtime installed on RPi4 node 2
- [ ] ONNX Runtime installed on RPi4 node N (all nodes)

### 5.2 Jetson Nano Nodes — ONNX Runtime + CUDA EP

```bash
# SSH to Jetson Nano node
ssh ubuntu@<jetson-ip>

# Install ONNX Runtime with CUDA Execution Provider
# Use Jetson Community pre-built wheel
pip3 install onnxruntime-gpu  # or jetson-community wheel

# Verify CUDA EP available
python3 -c "import onnxruntime as ort; print(ort.get_available_providers())"
# Expected: ['CUDAExecutionProvider', 'CPUExecutionProvider']
```

- [ ] ONNX Runtime with CUDA EP installed on Jetson Nano nodes
- [ ] CUDAExecutionProvider visible in available providers

### 5.3 Add onnxruntime-node to package.json

```bash
# Local development/Node.js deployment
npm install onnxruntime-node
```

- [ ] `onnxruntime-node` added to package.json dependencies
- [ ] `npm install` completes without errors on ARM64

---

## Phase 6: Feature Flags

### 6.1 Set Initial Feature Flags

W6 ships with YAMNet fine-tuning disabled — the base model (surrogate compatible) is used until a fine-tuned model is available from FR-W6-02.

```bash
# Set in environment / .env on each node
FEATURE_YAMNNET_FINETUNE=false          # Fine-tuning not yet complete
FEATURE_FALSE_POSITIVE_GUARD=true       # Enable FalsePositiveGuard
FEATURE_MULTI_NODE_FUSION=true          # Enable MultiNodeFusion (requires ≥3 nodes)
FEATURE_MONTE_CARLO=true                # Enable MonteCarloPropagator
FEATURE_CURSOR_OF_TRUTH=true            # Enable CursorOfTruth (Claude claude-sonnet-4-6)
FEATURE_BRAVE1_FORMAT=true              # Enable BRAVE1 output
CURSOR_OF_TRUTH_GATEWAY=http://4.231.218.96:7429/chat
```

- [ ] `FEATURE_YAMNNET_FINETUNE=false` set on all nodes
- [ ] `FEATURE_CURSOR_OF_TRUTH=true` set on nodes with internet connectivity
- [ ] `CURSOR_OF_TRUTH_GATEWAY` points to VM gateway (never ANTHROPIC_API_KEY directly)

---

## Phase 7: NATS Verification

W6 adds no new NATS streams. Existing streams are reused:

| Stream | New Subjects Added |
|--------|-------------------|
| DETECTIONS | `sentinel.detections.acoustic.>` (new subject pattern) |
| ALERTS | `sentinel.alerts.brave1.>` (new subject pattern) |
| COT_EVENTS | `sentinel.cot.cursor.>` (new subject pattern) |

```bash
# Verify NATS streams still healthy
# On NATS server:
nats stream ls
nats stream info DETECTIONS
nats stream info ALERTS
nats stream info COT_EVENTS
```

- [ ] All existing NATS streams healthy (DETECTIONS, NODE_HEALTH, ALERTS, COT_EVENTS)
- [ ] New subject patterns accepted by existing streams (wildcard `>` covers them)

---

## Phase 8: Smoke Tests

### 8.1 SentinelPipeline Start

```typescript
// Run smoke test script
import { SentinelPipeline } from './src/integration/sentinel-pipeline.js';

const pipeline = new SentinelPipeline({ mode: 'smoke-test', nats: false });
await pipeline.start();
console.log('SentinelPipeline started:', pipeline.isRunning());
await pipeline.stop();
```

```bash
npx tsx scripts/smoke-test-pipeline.ts
```

- [ ] SentinelPipeline starts without errors
- [ ] SentinelPipeline stops cleanly

### 8.2 NATS Subject Verification

```bash
# Publish test message to detection subject
nats pub sentinel.predictions.test '{"test":true}'
# Verify SentinelPipeline receives it
```

- [ ] `sentinel.predictions.test` subject is reachable via NATS

### 8.3 AcousticProfileLibrary Initialization

```bash
npx tsx -e "
import { AcousticProfileLibrary } from './src/ml/acoustic-profile-library.js';
const lib = new AcousticProfileLibrary();
await lib.loadFromSupabase();
console.log('Profiles loaded:', lib.count());
"
```

**Gate:** 4 profiles loaded (Shahed-136, Lancet-3, Mavic Mini, Orlan-10).

- [ ] AcousticProfileLibrary loads 4 profiles from Supabase

### 8.4 EdgeDeployer Model Download

```bash
npx tsx -e "
import { EdgeDeployer } from './src/deploy/edge-deployer.js';
const deployer = new EdgeDeployer({ deviceType: 'rpi4' });
const manifest = await deployer.downloadLatestModel();
console.log('Model manifest:', manifest.modelPath, manifest.variant);
"
```

**Gate:** Model downloads successfully, `manifest.variant === 'int8'` for RPi4.

- [ ] EdgeDeployer downloads model successfully on RPi4 hardware type

---

## Phase 9: Post-Deployment Verification

### 9.1 mind-the-gap Re-run

```bash
./wave-formation.sh checkpoint W6
```

**Gate:** 14/14 PASS. Same result as pre-deployment.

- [ ] 14/14 PASS confirmed post-deployment

### 9.2 Full Test Suite Post-Deploy

```bash
npx vitest run --coverage
```

**Gate:** 614/614 GREEN. Coverage ≥ 80% all metrics.

- [ ] 614/614 GREEN post-deployment

### 9.3 Supabase Dashboard Verification

Navigate to Supabase dashboard → bymfcnwfyxuivinuzurr → Table Editor:

- [ ] `acoustic_profiles` shows 4 rows
- [ ] `ml_model_versions` shows 1 row (yamnet-512 base)
- [ ] `ml-models` storage bucket shows ONNX file
- [ ] No migration errors in Supabase logs

---

## Rollback Procedure

If any gate fails, execute rollback before retrying:

```bash
# 1. Revert to W5 tag
git checkout tags/w5-complete

# 2. Roll back database migration
# Apply rollback section of 006_w6_acoustic_intelligence.sql
# (migration file includes DOWN section)
supabase db reset --linked  # OR apply rollback SQL manually

# 3. Restore node environments (remove FEATURE flags added in Phase 6)

# 4. Verify W5 tests still pass
npx vitest run --coverage
# Gate: 484/484 GREEN
```

See LKGC_TEMPLATE.md for full rollback procedure and W5 LKGC state.

---

## Deployment Sign-off

| Check | Result | Notes |
|-------|--------|-------|
| 614/614 tests GREEN | | |
| TypeScript strict clean | | |
| Migration 006 applied | | |
| 4 acoustic profiles seeded | | |
| Base ONNX model uploaded | | |
| RPi4 ONNX Runtime installed | | |
| Feature flags set | | |
| NATS streams healthy | | |
| SentinelPipeline smoke test | | |
| mind-the-gap 14/14 | | |

**Signed off by:** _______________
**Date:** _______________
