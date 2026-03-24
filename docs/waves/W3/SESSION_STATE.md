# APEX-SENTINEL W3 — SESSION STATE

> Wave: W3 — React Native Mobile App (Android + iOS)
> Phase: PLAN (active)
> Session: 2026-03-24
> Supabase: bymfcnwfyxuivinuzurr (eu-west-2)

---

## Current Phase Status

```
init        ████████████████████  COMPLETE  2026-03-20
plan        ████████████████░░░░  ACTIVE    2026-03-24
tdd-red     ░░░░░░░░░░░░░░░░░░░░  PENDING
execute     ░░░░░░░░░░░░░░░░░░░░  PENDING
checkpoint  ░░░░░░░░░░░░░░░░░░░░  PENDING
complete    ░░░░░░░░░░░░░░░░░░░░  PENDING
```

---

## Init Phase Outputs (COMPLETE)

### Decisions Locked (ADR-W3-001 to ADR-W3-020)
- Framework: React Native + Expo SDK 51 managed workflow
- Workflow: Expo managed + EAS Build + EAS Update (OTA)
- Inference (Android): TFLite Java API 2.14, INT8 quantized YAMNet
- Inference (iOS): TFLite + CoreML delegate (Neural Engine acceleration)
- Transport: NATS.ws via `nats.ws` official client, reusing W2 `@apex-sentinel/nats-client`
- State: Zustand + immer middleware
- Map: Mapbox GL via `@rnmapbox/maps` with offline tile packs
- Audio: Custom native module (expo-modules-core) — Kotlin + Swift
- Secrets: expo-secure-store (hardware-backed Keystore/Keychain)
- Background: Android Foreground Service + iOS `UIBackgroundModes: audio`
- Push: expo-notifications → Expo Push Service → FCM/APNs
- Persistence: expo-sqlite (WAL) + react-native-mmkv for fast KV
- Model OTA: CDN + SHA-256 hotswap via `model_versions` Supabase table
- E2E: Detox with Jest runner
- Crash/Perf: Sentry (same org as W2 backend)
- BLE: react-native-ble-plx + custom Meshtastic protobuf framing
- Build: EAS Build (cloud)
- Monorepo: npm workspaces — packages share `@apex-sentinel/core` and `@apex-sentinel/nats-client`
- Feature flags: Supabase `app_config` table via `get-node-config` Edge Function

### Tech Stack Locked

```
Runtime:          React Native 0.74.x / Expo SDK 51
Language:         TypeScript 5.4.x (strict mode)
Native (Android): Kotlin 1.9.x + Gradle 8.x
Native (iOS):     Swift 5.10 + Xcode 15.x
State:            Zustand 4.5.x
Navigation:       React Navigation 6.x (native stack)
Map:              @rnmapbox/maps 10.1.x
Inference:        TFLite (Android) + TFLite+CoreML delegate (iOS)
NATS:             nats.ws 1.28.x
DB:               expo-sqlite 14.x
Storage:          expo-secure-store 13.x, react-native-mmkv 2.x
Push:             expo-notifications 0.28.x
BLE:              react-native-ble-plx 3.1.x
Sentry:           @sentry/react-native 5.22.x
Build:            EAS Build / EAS Update
E2E:              Detox 20.x
Unit:             Jest 29.x + @testing-library/react-native 13.x
```

---

## Plan Phase Status

### Docs Remaining (this session)

| Doc | Status |
|-----|--------|
| DECISION_LOG.md | COMPLETE |
| SESSION_STATE.md | IN PROGRESS (this file) |
| ARTIFACT_REGISTRY.md | PENDING |
| DEPLOY_CHECKLIST.md | PENDING |
| LKGC_TEMPLATE.md | PENDING |
| IMPLEMENTATION_PLAN.md | PENDING |
| HANDOFF.md | PENDING |
| FR_REGISTER.md | PENDING |
| RISK_REGISTER.md | PENDING |
| INTEGRATION_MAP.md | PENDING |
| NETWORK_TOPOLOGY.md | PENDING |

Previously completed (separate session):
- DESIGN.md ✓
- PRD.md ✓
- ARCHITECTURE.md ✓
- DATABASE_SCHEMA.md ✓
- API_SPECIFICATION.md ✓
- AI_PIPELINE.md ✓
- PRIVACY_ARCHITECTURE.md ✓
- ROADMAP.md ✓
- TEST_STRATEGY.md ✓
- ACCEPTANCE_CRITERIA.md ✓

---

## W1 Dependencies (All Reused)

W1 produced `packages/core/` with the following exported modules:

```typescript
// packages/core/src/index.ts
export { VoiceActivityDetector }     from './vad/VoiceActivityDetector'
export { FFTProcessor }              from './fft/FFTProcessor'
export { YAMNetBridge }              from './yamnet/YAMNetBridge'       // native bridge interface
export { TDoACalculator }            from './tdoa/TDoACalculator'
export { TrackManager }              from './track/TrackManager'
export { CotSerializer }             from './cot/CotSerializer'
export { NodeRegistry }              from './registry/NodeRegistry'
export { LocationCoarsener }         from './location/LocationCoarsener'
export type {
  DetectionEvent,
  TrackRecord,
  CotXmlPayload,
  NodeInfo,
  VadConfig,
  YAMNetResult,
  TDoAResult,
} from './types'
```

**Status of each module in W3 context:**

| Module | W1 Status | W3 Usage | Notes |
|--------|-----------|----------|-------|
| VoiceActivityDetector | Production | Direct import | RMS + ZCR VAD, 10ms frames |
| FFTProcessor | Production | Direct import | 1024-point FFT on 0.5s buffer |
| YAMNetBridge | Production | Interface only | Android/iOS native module implements bridge |
| TDoACalculator | Production | Direct import | TDOA from W1, used if ≥2 nodes |
| TrackManager | Production | Direct import | Track state machine |
| CotSerializer | Production | Direct import | CoT XML for sharing |
| NodeRegistry | Production | Direct import | Node info management |
| LocationCoarsener | Production | Direct import | GPS coarsening for privacy |

---

## W2 Dependencies

W2 produced `packages/nats-client/` and 6 Edge Functions at Supabase `bymfcnwfyxuivinuzurr`.

**Edge Functions used by W3:**

| Function | URL | W3 Usage |
|----------|-----|----------|
| register-node | /functions/v1/register-node | Node registration on first launch |
| ingest-event | /functions/v1/ingest-event | Detection event submission (fallback, non-NATS) |
| get-node-config | /functions/v1/get-node-config | Feature flags + NATS credentials |
| send-alert | /functions/v1/send-alert | N/A (W2 publishes alerts, W3 subscribes) |
| push-register | /functions/v1/push-register | NEW in W3 — register Expo push token |
| model-version | /functions/v1/model-version | NEW in W3 — check for model updates |

**W2 NATS subjects used by W3:**

| Subject | Direction | Schema |
|---------|-----------|--------|
| `sentinel.detections.{nodeId}` | W3 → NATS | `IngestEventRequest` (W2 type) |
| `sentinel.alerts.>` | NATS → W3 | `AlertPayload` (W2 type) |
| `sentinel.nodes.heartbeat` | W3 → NATS | `HeartbeatPayload` |

**W2 CircuitBreaker integration:**
W3 NATS client uses W2 `CircuitBreaker` from `@apex-sentinel/nats-client` directly. When NATS.ws is unavailable, circuit opens → W3 falls back to HTTP Edge Function `ingest-event` for event submission.

---

## Blockers

### BLOCKER-W3-001: iOS CoreML Conversion Script

**Status:** OPEN
**Description:** Even though ADR-W3-017 selects TFLite+CoreML delegate (no pure CoreML), the conversion pipeline documentation requires a working `coremltools` Python script for:
1. Architecture documentation completeness
2. Fallback capability if TFLite CoreML delegate fails on edge iOS devices

**Required:** Python 3.11 environment, `coremltools==7.x`, `tensorflow==2.14`, `yamnet_int8.tflite` model file.
**Owner:** Nico Fratila
**ETA:** Not blocking TDD-RED phase. Required before P5 (Detox E2E on real iOS devices).
**Workaround:** iOS tests run on simulator with CPU interpreter fallback.

### BLOCKER-W3-002: Mapbox Access Token

**Status:** OPEN
**Description:** EAS Build requires `MAPBOX_ACCESS_TOKEN` in EAS Secrets. Token not yet generated.
**Required:** Mapbox account, token with `styles:read tiles:read` scopes.
**Owner:** Nico Fratila
**ETA:** Required before P3 (Map screen implementation).

### BLOCKER-W3-003: APNs P8 Key Upload to EAS

**Status:** OPEN
**Description:** iOS push notifications require APNs authentication key (.p8 file) uploaded to Expo/EAS dashboard.
**Required:** Apple Developer account access, APNs key generation.
**Owner:** Nico Fratila
**ETA:** Required before P4 (alert subscription + push notifications).

### BLOCKER-W3-004: Android Keystore for Play Internal Track

**Status:** OPEN
**Description:** Google Play internal distribution requires signed APK. Android keystore not yet generated.
**Required:** `keytool` command, EAS credential storage.
**Owner:** Nico Fratila
**ETA:** Required before P5 (EAS build + beta distribution).

---

## Next Actions (Immediate)

1. Complete remaining 9 plan phase documents (this session)
2. Run `./wave-formation.sh tdd-red W3`
3. Create test files for all 18 FRs (failing state)
4. Commit RED test suite
5. Run `./wave-formation.sh execute W3`
6. P1: Expo init, folder structure, native TFLite module scaffolding

---

## Key Contacts

| Role | Contact | Notes |
|------|---------|-------|
| Project Owner | Nico Fratila (nicolae.fratila) | All decisions |
| Supabase | bymfcnwfyxuivinuzurr | eu-west-2 |
| EAS Team | expo.dev | Build + OTA |
| NATS cluster | fortress VM 100.68.152.56 | W2 NATS broker |
| Sentry Org | apex-sentinel.sentry.io | Same org as W2 |

---

## Repository State

```
Branch:        main
Last commit:   W2 complete — NATS mTLS + Edge Functions + TdoaCorrelator
W3 init:       2026-03-20
Monorepo root: /Users/nico/projects/apex-sentinel/
Packages:
  packages/core/          (W1 — all modules)
  packages/nats-client/   (W2 — NATS wrapper + CircuitBreaker)
  packages/mobile/        (W3 — React Native app — TO BE CREATED in P1)
```

---

## Environment Variables Required for W3

```bash
# EAS Secrets (set via `eas secret:create`)
MAPBOX_ACCESS_TOKEN=pk.eyJ1IjoiYXBleC1zZW50aW5lbCJ9...
SENTRY_DSN=https://...@sentry.io/...
SENTRY_AUTH_TOKEN=...  # for source map upload during EAS Build
NATS_WSS_URL=wss://nats.apex-sentinel.io:443
SUPABASE_URL=https://bymfcnwfyxuivinuzurr.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Local .env for development
EXPO_PUBLIC_NATS_WSS_URL=wss://nats-dev.apex-sentinel.io:443
EXPO_PUBLIC_SUPABASE_URL=https://bymfcnwfyxuivinuzurr.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_MAPBOX_TOKEN=...
```

---

## Session Log

```
2026-03-20  Wave init complete. ADRs drafted. Tech stack locked.
2026-03-21  FR_REGISTER outline reviewed. 18 FRs confirmed.
2026-03-22  RISK_REGISTER scoped. 14 risks identified.
2026-03-23  ARCHITECTURE.md and DATABASE_SCHEMA.md completed.
2026-03-24  Plan phase docs batch writing initiated (this session).
```
