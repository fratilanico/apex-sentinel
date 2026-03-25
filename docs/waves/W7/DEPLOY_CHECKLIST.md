# APEX-SENTINEL — DEPLOY_CHECKLIST.md
## Wave 7: Hardware Integration + Data Pipeline Rectification + Terminal Phase Detection
### Date: 2026-03-25 | Environment: Production (Supabase bymfcnwfyxuivinuzurr)

---

## Overview

W7 deployment introduces hardware actuator integration (PTZ cameras, RF jammers, SkyNet net-gun), the 16kHz data pipeline rectification, terminal phase detection FSM, ELRS RF fingerprinting, and bearing triangulation. This is the highest-consequence deployment wave to date — JammerActivation and PhysicalInterceptCoordinator write to physical hardware.

**Responsible:** Nico
**Estimated deployment window:** 120 minutes
**Rollback tag:** `w6-complete` (see LKGC_TEMPLATE.md)
**Hardware required for smoke tests:** ONVIF PTZ mock (software), ELRS synthetic fixture, jammer mock; real hardware optional for Phase 8

---

## Phase 1: Pre-Deployment Verification

### 1.1 Full Test Suite

```bash
cd /Users/nico/projects/apex-sentinel
npx vitest run --coverage
```

**Gate:** All ~729 tests must pass (629 W1-W6 + ~100 W7). Zero failures.

**Coverage gate (all metrics ≥ 80%):**
- [ ] Statement coverage ≥ 80%
- [ ] Branch coverage ≥ 80%
- [ ] Function coverage ≥ 80%
- [ ] Lines ≥ 80%
- [ ] ~729/~729 tests GREEN

### 1.2 TypeScript Strict Mode

```bash
npx tsc --noEmit
```

**Gate:** Zero TypeScript errors. Zero implicit `any`. No `@ts-ignore` added in W7 code.

- [ ] `tsc --noEmit` exits with code 0
- [ ] No `@ts-ignore` suppressions in W7 source files

### 1.3 Build Verification

```bash
npm run build
```

**Gate:** Build completes without errors. All imports resolve. New modules importable.

- [ ] Build exits with code 0

### 1.4 mind-the-gap Audit

```bash
./wave-formation.sh checkpoint W7
```

**Gate:** 14/14 dimensions PASS (same as W6 baseline).

- [ ] mind-the-gap 14/14 PASS

### 1.5 Git State

```bash
git status
git log --oneline -5
git tag | grep -E 'w6-complete|w7'
```

**Gate:** Working tree clean. W7 implementation commit is HEAD. Tag `w6-complete` exists (W6 rollback target).

- [ ] Working tree clean (no uncommitted changes)
- [ ] `git tag | grep w6-complete` shows the tag
- [ ] Pushed to origin/main (up to date with remote)

### 1.6 Coordinate Injection Verification

```bash
# Verify hardcoded coordinates have been eliminated
grep -r "51\.5\|4\.9" src/ --include="*.ts" | grep -v ".test.ts" | grep -v "node_modules"
```

**Gate:** Zero matches in production source code. The W6 hardcoded Amsterdam test coordinates must be gone from all non-test files.

- [ ] Zero hardcoded coordinate matches in production source

### 1.7 16kHz Pipeline Verification

```bash
# Verify no 22050 sample rate references in production code
grep -r "22050" src/ --include="*.ts" | grep -v ".test.ts"
```

**Gate:** Zero matches. All 22050Hz references in production code have been replaced with 16000.

- [ ] Zero 22050Hz references in production source

---

## Phase 2: Database Migration

### 2.1 Apply Migration 007

```bash
# Verify migration file exists
ls supabase/migrations/007_w7_hardware_integration.sql

# Apply via Supabase Management API (DDL requires PAT — NOT REST API)
supabase db push --db-url "postgresql://postgres.[ref]:[password]@aws-0-eu-west-2.pooler.supabase.com:6543/postgres"
```

**Supabase project:** bymfcnwfyxuivinuzurr (eu-west-2)

**Migration creates:**
- `terminal_phase_events` — FSM state transition log per track
- `jammer_commands` — Jammer activation command audit log
- `skynet_activations` — Physical intercept command audit log
- `bearing_reports` — Node-level bearing estimates for triangulation
- `ptz_command_log` — PTZ command history

**Migration alters:**
- `nodes` table: adds `capabilities jsonb` column (default `{}`)
- `ml_model_versions` table: adds `frequency_domain text` column ('piston' or 'turbine')

- [ ] Migration 007 applied successfully
- [ ] `terminal_phase_events` table exists with correct schema
- [ ] `jammer_commands` table exists
- [ ] `skynet_activations` table exists
- [ ] `bearing_reports` table exists
- [ ] `ptz_command_log` table exists
- [ ] `nodes.capabilities` column exists
- [ ] `ml_model_versions.frequency_domain` column exists

### 2.2 Verify Migration Applied

```sql
-- Run in Supabase SQL editor
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'terminal_phase_events','jammer_commands','skynet_activations',
  'bearing_reports','ptz_command_log'
)
ORDER BY table_name;
```

**Gate:** 5 rows returned.

- [ ] All 5 new tables visible in Supabase dashboard

---

## Phase 3: Seed Updated Acoustic Profiles

### 3.1 Insert New Drone Profiles

Three new profiles not present in W6 baseline:

```sql
-- Gerbera FPV (piston, high-modulation)
INSERT INTO acoustic_profiles (drone_model, fundamental_hz, harmonic_ratios, modulation_rate_hz, frequency_domain, source, confidence_threshold, notes)
VALUES (
  'Gerbera', 120.0, ARRAY[1.0, 2.0, 3.0, 4.0], 28.0, 'piston',
  'INDIGO-field-2026', 0.70,
  'FPV piston motor, characteristic high-frequency modulation pattern'
);

-- Shahed-131 (piston, smaller displacement than Shahed-136)
INSERT INTO acoustic_profiles (drone_model, fundamental_hz, harmonic_ratios, modulation_rate_hz, frequency_domain, source, confidence_threshold, notes)
VALUES (
  'Shahed-131', 60.0, ARRAY[1.0, 2.0, 3.0, 4.0, 5.0], 9.0, 'piston',
  'INDIGO-SIGINT-2026', 0.68,
  'Smaller displacement than Shahed-136, similar MADO engine family'
);

-- Shahed-238 (jet turbine — SEPARATE MODEL PATH)
INSERT INTO acoustic_profiles (drone_model, fundamental_hz, harmonic_ratios, modulation_rate_hz, frequency_domain, turbine_freq_min_hz, turbine_freq_max_hz, source, confidence_threshold, notes)
VALUES (
  'Shahed-238', NULL, ARRAY[]::float[], 0.0, 'turbine', 3000.0, 8000.0,
  'INDIGO-SIGINT-2026', 0.73,
  'Jet turbine engine — dominant energy 3-8kHz; NULL fundamental_hz as not piston-family'
);
```

- [ ] Gerbera profile inserted
- [ ] Shahed-131 profile inserted
- [ ] Shahed-238 turbine profile inserted
- [ ] `SELECT COUNT(*) FROM acoustic_profiles` returns 7 (4 W6 + 3 W7)

### 3.2 Update W6 Profiles with frequency_domain Field

```sql
UPDATE acoustic_profiles
SET frequency_domain = 'piston'
WHERE drone_model IN ('Shahed-136', 'Lancet-3', 'Mavic-Mini', 'Orlan-10');
```

- [ ] All 4 W6 profiles now have `frequency_domain = 'piston'`

---

## Phase 4: ONNX Model Upload (16kHz Models)

### 4.1 Upload 16kHz Piston Model

Upload the fine-tuned 16kHz YAMNet model to Supabase Storage bucket `ml-models`:

```bash
# Upload yamnet-16khz-v1.onnx (FP32 base, 14 MB)
# Upload yamnet-16khz-v1-int8.onnx (RPi4, 3.5 MB)
# Upload yamnet-16khz-v1-fp16.onnx (Jetson, 7 MB)
```

```sql
INSERT INTO ml_model_versions (model_name, version, variant, format, storage_path, size_bytes, sha256, is_active, frequency_domain, deployed_to)
VALUES
  ('yamnet-16khz', '1.0.0', 'fp32', 'onnx', 'models/yamnet-16khz-v1.onnx', 14680064, '<sha256>', true, 'piston', ARRAY['all']),
  ('yamnet-16khz', '1.0.0', 'int8', 'onnx', 'models/yamnet-16khz-v1-int8.onnx', 3670016, '<sha256>', true, 'piston', ARRAY['rpi4']),
  ('yamnet-16khz', '1.0.0', 'fp16', 'onnx', 'models/yamnet-16khz-v1-fp16.onnx', 7340032, '<sha256>', true, 'piston', ARRAY['jetson']);
```

- [ ] yamnet-16khz-v1.onnx (FP32) uploaded
- [ ] yamnet-16khz-v1-int8.onnx uploaded
- [ ] yamnet-16khz-v1-fp16.onnx uploaded
- [ ] 3 piston model records in ml_model_versions with `frequency_domain = 'piston'`

### 4.2 Upload Turbine Model (Shahed-238)

```bash
# Upload yamnet-turbine-v1.onnx (FP32 base, 14 MB)
# Upload yamnet-turbine-v1-int8.onnx (RPi4, 3.5 MB)
```

```sql
INSERT INTO ml_model_versions (model_name, version, variant, format, storage_path, size_bytes, sha256, is_active, frequency_domain, deployed_to)
VALUES
  ('yamnet-turbine', '1.0.0', 'fp32', 'onnx', 'models/yamnet-turbine-v1.onnx', 14680064, '<sha256>', true, 'turbine', ARRAY['all']),
  ('yamnet-turbine', '1.0.0', 'int8', 'onnx', 'models/yamnet-turbine-v1-int8.onnx', 3670016, '<sha256>', true, 'turbine', ARRAY['rpi4']);
```

- [ ] yamnet-turbine-v1.onnx (FP32) uploaded
- [ ] yamnet-turbine-v1-int8.onnx uploaded
- [ ] 2 turbine model records in ml_model_versions with `frequency_domain = 'turbine'`

---

## Phase 5: NATS Stream Creation

### 5.1 Create W7 JetStream Streams

```bash
# On NATS server (or via NATS CLI with admin credentials)

# JAMMER_COMMANDS — command audit, 7-day retention
nats stream add JAMMER_COMMANDS \
  --subjects "sentinel.jammer.>" \
  --replicas 3 \
  --retention limits \
  --max-age 7d \
  --storage file

# PTZ_BEARING — high-frequency bearing, 1-hour retention
nats stream add PTZ_BEARING \
  --subjects "sentinel.ptz.>" \
  --replicas 3 \
  --retention limits \
  --max-age 1h \
  --storage file

# SKYNET_ACTIVATION — intercept commands, 30-day retention, R5
nats stream add SKYNET_ACTIVATION \
  --subjects "sentinel.skynet.>" \
  --replicas 5 \
  --retention limits \
  --max-age 30d \
  --storage file

# TERMINAL_PHASE — FSM state events, 7-day retention
nats stream add TERMINAL_PHASE \
  --subjects "sentinel.terminal.>" \
  --replicas 3 \
  --retention limits \
  --max-age 7d \
  --storage file

# BEARING_REPORTS — ephemeral bearing data, 5-minute retention
nats stream add BEARING_REPORTS \
  --subjects "sentinel.bearing.>" \
  --replicas 3 \
  --retention limits \
  --max-age 5m \
  --storage file
```

- [ ] JAMMER_COMMANDS stream created (R3, 7d)
- [ ] PTZ_BEARING stream created (R3, 1h)
- [ ] SKYNET_ACTIVATION stream created (R5, 30d)
- [ ] TERMINAL_PHASE stream created (R3, 7d)
- [ ] BEARING_REPORTS stream created (R3, 5min)

### 5.2 Verify All Streams Healthy

```bash
nats stream ls
# Expected: DETECTIONS, NODE_HEALTH, ALERTS, COT_EVENTS (existing)
#           JAMMER_COMMANDS, PTZ_BEARING, SKYNET_ACTIVATION, TERMINAL_PHASE, BEARING_REPORTS (new)

nats stream info SKYNET_ACTIVATION
# Verify replicas: 5
# Verify max-age: 30 days
```

- [ ] All 9 streams listed by `nats stream ls`
- [ ] SKYNET_ACTIVATION shows 5 replicas

---

## Phase 6: EdgeDeployer — Re-Deploy Edge Nodes

### 6.1 RPi4 Nodes — 16kHz Model Update

```bash
# On each RPi4 node — download and activate new 16kHz models
npx tsx -e "
import { EdgeDeployer } from './src/deploy/edge-deployer.js';
const deployer = new EdgeDeployer({ deviceType: 'rpi4', frequencyDomain: 'piston' });
const manifest = await deployer.downloadLatestModel();
console.log('Piston model:', manifest.modelPath, manifest.sha256);

const turbineDeployer = new EdgeDeployer({ deviceType: 'rpi4', frequencyDomain: 'turbine' });
const turbineManifest = await turbineDeployer.downloadLatestModel();
console.log('Turbine model:', turbineManifest.modelPath, turbineManifest.sha256);
"
```

**Gate:** Both piston (INT8) and turbine (INT8) models deployed to each RPi4 node.

- [ ] yamnet-16khz-v1-int8.onnx deployed to RPi4 nodes
- [ ] yamnet-turbine-v1-int8.onnx deployed to RPi4 nodes
- [ ] RPi4 audio capture configured at 16kHz (ALSA: `hw:0 rate 16000`)
- [ ] Old yamnet-512-base-fp32.onnx (W6) archived, not active

### 6.2 Jetson Nano Nodes — 16kHz FP16 Update

```bash
# On each Jetson node — download FP16 16kHz model
npx tsx -e "
import { EdgeDeployer } from './src/deploy/edge-deployer.js';
const deployer = new EdgeDeployer({ deviceType: 'jetson', frequencyDomain: 'piston' });
const manifest = await deployer.downloadLatestModel();
console.log('Jetson piston FP16:', manifest.modelPath, manifest.variant);
"
```

- [ ] yamnet-16khz-v1-fp16.onnx deployed to Jetson Nano nodes
- [ ] Jetson audio capture configured at 16kHz

---

## Phase 7: Node Capabilities Update

### 7.1 Update Node Registry with W7 Capabilities

```sql
-- Update each node with its W7 capabilities
-- Example: node with RTL-SDR and directional microphone array
UPDATE nodes
SET capabilities = jsonb_build_object(
  'bearingCapable', true,
  'hasDirectionalArray', true,
  'rtlSdrAvailable', true
)
WHERE node_id = '<node-id>';

-- Example: node with only omnidirectional microphone
UPDATE nodes
SET capabilities = jsonb_build_object(
  'bearingCapable', false,
  'hasDirectionalArray', false,
  'rtlSdrAvailable', false
)
WHERE node_id = '<node-id>';
```

- [ ] All deployed nodes have `capabilities` populated in Supabase
- [ ] At least 2 nodes have `bearingCapable = true` for triangulation to function

---

## Phase 8: Feature Flags

### 8.1 Set W7 Feature Flags

```bash
# On each sensor node — add to .env
FEATURE_TERMINAL_PHASE_DETECTOR=true
FEATURE_ELRS_FINGERPRINT=true          # only on nodes with RTL-SDR
FEATURE_BEARING_TRIANGULATOR=true
FEATURE_PTZ_SLAVE_OUTPUT=false         # enable only when PTZ hardware connected
FEATURE_JAMMER_ACTIVATION=false        # enable only with explicit operational authorization
FEATURE_PHYSICAL_INTERCEPT=false       # enable only with explicit operational authorization
FEATURE_DEMO_DASHBOARD=true

# Coordinate injection (REQUIRED — no defaults)
NODE_LAT=<latitude-decimal-degrees>
NODE_LON=<longitude-decimal-degrees>
NODE_ALT_M=<altitude-above-sea-level-meters>

# Model selection
ML_SAMPLE_RATE_HZ=16000
ML_PISTON_MODEL=yamnet-16khz-v1-int8.onnx   # RPi4
ML_TURBINE_MODEL=yamnet-turbine-v1-int8.onnx # RPi4

# PTZ (only if FEATURE_PTZ_SLAVE_OUTPUT=true)
ONVIF_CAMERA_ENDPOINT=http://<camera-ip>/onvif/device_service
ONVIF_CAMERA_USERNAME=<username>
ONVIF_CAMERA_PASSWORD=<password>
```

**CRITICAL: `NODE_LAT`, `NODE_LON`, `NODE_ALT_M` are REQUIRED. System produces wrong position estimates without them.**

- [ ] `NODE_LAT` / `NODE_LON` / `NODE_ALT_M` set on ALL nodes
- [ ] `ML_SAMPLE_RATE_HZ=16000` set on all nodes
- [ ] `FEATURE_JAMMER_ACTIVATION=false` (only enable with operational authorization)
- [ ] `FEATURE_PHYSICAL_INTERCEPT=false` (only enable with operational authorization)

---

## Phase 9: Hardware Integration Tests

### 9.1 TerminalPhaseDetector Smoke Test

```bash
npx tsx scripts/smoke-test-terminal-phase.ts
# Injects synthetic 4-indicator sequence
# Expected: FSM transitions CRUISE → MANEUVERING → SUSPECTED_TERMINAL → CONFIRMED_TERMINAL
# Expected: TERMINAL_PHASE stream event published
```

- [ ] FSM reaches CONFIRMED_TERMINAL on synthetic 4-indicator sequence
- [ ] NATS TERMINAL_PHASE event published and readable via `nats sub 'sentinel.terminal.>'`

### 9.2 ELRS Fingerprint Smoke Test (Synthetic Signal)

```bash
npx tsx scripts/smoke-test-elrs.ts --fixture tests/fixtures/elrs-900mhz-synthetic.json
# Expected: ElrsDetection output with confidence > 0.75
# Expected: DETECTIONS stream event on sentinel.detections.rf.elrs
```

- [ ] ELRS synthetic signal detected with confidence > 0.75
- [ ] DETECTIONS stream event published for RF detection

### 9.3 BearingTriangulator Smoke Test

```bash
npx tsx scripts/smoke-test-bearing.ts --nodes 3
# Injects 3 synthetic bearing reports (azimuth angles from 3 known positions)
# Expected: TriangulatedPosition output with known test coordinates (within 50m)
```

- [ ] BearingTriangulator produces position estimate within 50m of known test target
- [ ] BEARING_REPORTS stream subscription working

### 9.4 ONVIF PTZ Smoke Test (Mock Device)

```bash
npx tsx scripts/smoke-test-ptz.ts --mock
# Uses mock ONVIF device
# Sends PtzCommand with pan=45, tilt=15, zoom=0.5
# Expected: mock PTZ command log records the command
# Expected: PTZ_BEARING stream event published
```

- [ ] PTZ mock device accepts command
- [ ] PTZ_BEARING stream event published
- [ ] Rate limiter blocks second command within 500ms

### 9.5 JammerActivation Smoke Test (Dry Run — No Real Jammer)

```bash
npx tsx scripts/smoke-test-jammer.ts --dry-run
# Dry run: publishes JAMMER_COMMANDS event but does NOT activate real hardware
# Expected: JAMMER_COMMANDS stream event published
# Expected: jammer_commands table row inserted in Supabase
```

- [ ] JAMMER_COMMANDS stream event published
- [ ] Supabase `jammer_commands` row inserted

### 9.6 PhysicalInterceptCoordinator Smoke Test (Dry Run — No Real SkyNet)

```bash
npx tsx scripts/smoke-test-skynet.ts --dry-run
# Dry run: publishes SKYNET_ACTIVATION event but does NOT activate real hardware
# Pre-checklist: inject synthetic track with confidence 0.90, ellipse radius 30m, jammer ACK confirmed
# Expected: SKYNET_ACTIVATION stream event published with BRAVE1 extension block
```

- [ ] SKYNET_ACTIVATION stream event published
- [ ] Supabase `skynet_activations` row inserted
- [ ] BRAVE1 extension block contains all required fields

### 9.7 Demo Dashboard Smoke Test

```bash
cd src/ui/demo-dashboard
npm install
npm run dev
# Navigate to http://localhost:3000
```

- [ ] Demo dashboard loads without errors
- [ ] TrackListPanel renders (empty state acceptable for smoke test)
- [ ] ThreatHeatmap renders map layer
- [ ] TerminalPhaseIndicator shows CRUISE state
- [ ] JammerStatusPanel shows inactive

---

## Phase 10: Post-Deployment Verification

### 10.1 Full Test Suite Post-Deploy

```bash
npx vitest run --coverage
```

**Gate:** ~729/~729 GREEN. Coverage ≥ 80% all metrics.

- [ ] ~729/~729 GREEN post-deployment
- [ ] Coverage still ≥ 80% all metrics

### 10.2 mind-the-gap Re-run

```bash
./wave-formation.sh checkpoint W7
```

**Gate:** 14/14 PASS.

- [ ] 14/14 PASS confirmed post-deployment

### 10.3 Supabase Dashboard Verification

- [ ] `terminal_phase_events` table visible (empty — no live events yet)
- [ ] `acoustic_profiles` shows 7 rows (4 W6 + 3 W7)
- [ ] `ml_model_versions` shows 5+ rows (W6 base + W7 piston + turbine variants)
- [ ] `nodes.capabilities` column present in table schema
- [ ] No migration errors in Supabase logs

### 10.4 NATS Stream Verification Post-Deploy

```bash
nats stream ls
```

- [ ] All 9 streams listed
- [ ] SKYNET_ACTIVATION confirms R5 replication
- [ ] No stream errors or consumer lag backlog

---

## Rollback Procedure

If any gate fails, execute rollback before retrying:

```bash
# 1. Revert to W6 tag
git checkout tags/w6-complete

# 2. Roll back database migration
# Apply rollback section of 007_w7_hardware_integration.sql
# (migration file includes DOWN section)
# Drops: terminal_phase_events, jammer_commands, skynet_activations, bearing_reports, ptz_command_log
# Reverts: nodes.capabilities column, ml_model_versions.frequency_domain column

# 3. Delete W7 NATS streams
nats stream rm JAMMER_COMMANDS
nats stream rm PTZ_BEARING
nats stream rm SKYNET_ACTIVATION
nats stream rm TERMINAL_PHASE
nats stream rm BEARING_REPORTS

# 4. Revert edge node models to W6 yamnet-512-base-fp32.onnx
# (EdgeDeployer rollback to w6-model via ml_model_versions is_active flag)

# 5. Remove W7 environment variables from all nodes
# Remove NODE_LAT/LON/ALT if they were only added for W7 (unlikely — needed for W6 too)
# Set FEATURE_TERMINAL_PHASE_DETECTOR=false etc.

# 6. Verify W6 tests still pass
npx vitest run --coverage
# Gate: 629/629 GREEN
```

See LKGC_TEMPLATE.md for full rollback procedure and W6 LKGC state.

---

## Deployment Sign-off

| Check | Result | Date | Notes |
|-------|--------|------|-------|
| ~729/~729 tests GREEN | | | |
| TypeScript strict clean | | | |
| Migration 007 applied | | | |
| 7 acoustic profiles seeded | | | |
| 16kHz piston models uploaded | | | |
| Turbine model uploaded | | | |
| 5 NATS streams created | | | |
| Edge nodes re-deployed (16kHz) | | | |
| Coordinates injected (no hardcoded) | | | |
| ELRS fingerprint smoke test | | | |
| BearingTriangulator smoke test | | | |
| TerminalPhaseDetector smoke test | | | |
| PTZ mock smoke test | | | |
| JammerActivation dry-run | | | |
| SkyNet dry-run | | | |
| Demo dashboard loads | | | |
| mind-the-gap 14/14 | | | |

**Signed off by:** _______________
**Date:** _______________

---

## Operational Authorization Notes

JammerActivation (`FEATURE_JAMMER_ACTIVATION`) and PhysicalInterceptCoordinator (`FEATURE_PHYSICAL_INTERCEPT`) ship **disabled by default**. These features activate real-world hardware with kinetic consequences. Enabling them in production requires:

1. Explicit operational authorization from deployment commander
2. Jammer hardware connected and tested at the intended site
3. SkyNet net-gun physical presence and armed state confirmed
4. Rules of engagement (ROE) document signed and on file
5. BRAVE1 C2 system confirmation that intercept commands are routed correctly

Do not enable these flags based on this checklist alone.
