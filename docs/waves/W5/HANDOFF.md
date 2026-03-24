# APEX-SENTINEL W5 — HANDOFF
## W5 | PROJECTAPEX Doc 18/20 | 2026-03-24

> Wave: W5 — EKF + LSTM Trajectory Prediction (Gate 4)
> This is the FINAL WAVE. System is complete at W5.
> Supabase: bymfcnwfyxuivinuzurr (eu-west-2)

---

## System Complete — Full Capability Summary

APEX-SENTINEL is a production-grade distributed civilian drone detection and tracking
network. Five waves, 35 days each, delivered a complete end-to-end system.

### End-to-End Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  1. Civilian smartphone (Android/iOS) — anywhere in the deployment area         │
│     - Passive acoustic listening: 22kHz sample rate, ring-buffer capture        │
│     - YAMNet INT8 TFLite inference: Gates 1-3 classification on-device          │
│       Gate 1: VAD (voice activity suppressor — ignore speech/vehicles)          │
│       Gate 2: Drone signature classifier (multirotor/fixed-wing/unknown)        │
│       Gate 3: Confidence threshold (>0.7 to publish)                            │
│     - Detection event published to NATS.ws: sentinel.detections.raw.{nodeId}   │
│     - Offline queue: events cached locally if connectivity drops                │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │ NATS.ws (WebSocket)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  2. NATS JetStream cluster (fortress VM, 5-node)                                │
│     - Durable streams: SENTINEL (all events), NODE_HEALTH, ALERTS               │
│     - Retention: work-queue (ack-then-delete)                                   │
│     - Replication: 3-replica (fault-tolerant at 1 node failure)                 │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │ JetStream pull consumer
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  3. TdoaCorrelator microservice (W2, fortress VM)                               │
│     - Buffers raw detection events per drone signature                          │
│     - Waits for ≥3 node detections with matching signature + timestamp          │
│     - Computes hyperbolic TDOA: iterative least-squares, WGS84 geometry         │
│     - Output: correlated track with position (CEP ~5m), confidence              │
│     - Publishes: sentinel.detections.correlated → NATS JetStream                │
│     - Upserts: Supabase tracks table (status=tentative if first, confirmed if ≥3│
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │ NATS JetStream
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  4. EKF Microservice (W5, fortress VM)                                          │
│     - Consumes correlated tracks from NATS                                      │
│     - Maintains per-track EKFInstance (6D state: lat,lon,alt,vLat,vLon,vAlt)   │
│     - Extended Kalman Filter: constant-velocity + Singer maneuver noise          │
│     - Polynomial trajectory prediction: 5 horizons (+1,+2,+3,+5,+10s)          │
│     - Impact point estimator: projects velocity vector to alt=0                 │
│     - Publishes: sentinel.predictions.{trackId} → NATS                         │
│     - Upserts: Supabase tracks.predicted_trajectory (JSONB)                     │
└────────────────────────────────┬────────────────────────────────────────────────┘
                         ┌───────┴────────┐
                         │                │
                         ▼                ▼
┌─────────────────┐   ┌──────────────────────────────────────────────────────────┐
│  5a. ATAK CoT   │   │  5b. C2 Dashboard (W4, Vercel — dashboard.apex-sentinel.io│
│  Relay (W2)     │   │                                                           │
│  CoT XML events │   │  - CesiumJS 3D globe: live track markers (color=threat)  │
│  → Android      │   │  - Prediction polylines: 5-horizon trajectory (W5)       │
│  ATAK clients   │   │  - NATS.ws: real-time alert stream (<200ms latency)       │
│  (<5s latency)  │   │  - Supabase Realtime: track updates (<100ms)              │
└─────────────────┘   │  - OpenMCT timeline: detections per node, 24hr window    │
                      │  - Node health overlay: coverage circles on globe         │
                      │  - RBAC: operator/analyst/admin (Supabase Auth)           │
                      │  - CoT export: .cot single / .zip time-range              │
                      └──────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  6. Commander Action                                                            │
│     - Dashboard: visual track with predicted trajectory + impact estimate       │
│     - ATAK: tactical display on Android tablet in the field                     │
│     - Mobile app: push notification with threat class + location                │
│     - Decision: intercept, alert evacuation, request air support                │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Wave Summary (All 5 Waves)

```
Wave  Component          Stack                      Tests  Duration  Status
──────────────────────────────────────────────────────────────────────────────
W1    On-device pipeline TFLite INT8, Android/iOS   102    35 days   COMPLETE
W2    NATS + TDoA + Edge NATS JetStream, Supabase   57     28 days   COMPLETE
W3    Mobile app         Expo 51, React Native       183    35 days   COMPLETE
W4    C2 Dashboard       Next.js 14, CesiumJS        55     28 days   COMPLETE
W5    EKF + Prediction   Node.js 20, TypeScript      ≥85    35 days   FINAL
──────────────────────────────────────────────────────────────────────────────
TOTAL                                               ≥482
```

---

## Production Infrastructure

```
Component                  Host                    Access
──────────────────────────────────────────────────────────────────────────────
NATS JetStream cluster     fortress VM             internal: nats1.apex-sentinel.internal:4222
TdoaCorrelator svc         fortress VM             systemd: apex-sentinel-tdoa.service
EKF microservice           fortress VM             systemd: apex-sentinel-ekf.service
CoT relay                  fortress VM             systemd: apex-sentinel-cot.service
C2 Dashboard               Vercel                  https://dashboard.apex-sentinel.io
Supabase (DB+Auth+Edge)    eu-west-2               bymfcnwfyxuivinuzurr.supabase.co
Mobile app (Android)       Google Play Store       com.apexsentinel.mobile
Mobile app (iOS)           App Store               (pending Apple review)
```

---

## Production Deployment Checklist (All Services, Post-W5)

```
All waves complete — run these final system checks:

NATS cluster:
[ ] nats server check cluster → all 5 nodes OK, leader elected
[ ] nats stream info SENTINEL → stream exists, retention=work-queue
[ ] NATS consumers: tdoa-correlator, ekf-predictor, cot-relay all present

Supabase:
[ ] All 7 migrations applied (001_baseline through 007_ekf_config)
[ ] RLS policies active on tracks, alerts, ekf_track_events
[ ] Edge Functions deployed: ingest-detection, resolve-track, publish-alert,
    health-check, get-track-predictions, get-ekf-health
[ ] Realtime enabled on tracks and alerts tables

Fortress VM services:
[ ] apex-sentinel-nats.service   → active (running), Restart=on-failure
[ ] apex-sentinel-tdoa.service   → active (running), Restart=on-failure
[ ] apex-sentinel-ekf.service    → active (running), Restart=on-failure
[ ] apex-sentinel-cot.service    → active (running), Restart=on-failure
[ ] All services enabled (survive reboot)

C2 Dashboard:
[ ] dashboard.apex-sentinel.io responds 200
[ ] Login with operator credentials → redirects to /dashboard
[ ] Globe loads (CesiumJS tiles render)
[ ] Prediction polylines visible for active tracks

Mobile app:
[ ] Android APK in Play Store (internal testing track)
[ ] Push notifications working (FCM test send)
[ ] Offline mode: detection queue accumulates while offline

System E2E:
[ ] Inject synthetic detection from 3 nodes on NATS
[ ] Verify: TdoaCorrelator → Supabase track upsert
[ ] Verify: EKF prediction published to sentinel.predictions.*
[ ] Verify: Dashboard shows track + polyline within 5 seconds
[ ] Verify: ATAK receives CoT XML within 5 seconds
```

---

## Ongoing Operations

### Model Retraining Cadence
```
YAMNet fine-tuning (W1):
  Trigger: false positive rate > 5% over 7-day rolling window
  Data source: Supabase detection_events with operator-confirmed labels
  Process: export labeled dataset → retrain on GPU → INT8 quantize → OTA push
  OTA: Expo Updates (over-the-air) for React Native bundle; TFLite model as asset

EKF q_c tuning:
  Trigger: EKF RMSE benchmark > 10m (checked weekly by capture-lkgc.sh)
  Process: update ekf_config table: maneuver_spectral_density
  No redeployment needed — service reads on next restart (or dynamic reload)

Polynomial predictor → ONNX upgrade (post-W5 enhancement):
  Trigger: when 3 months of real FPV track data accumulated in Supabase
  Process: train LSTM on ekf_track_events history → export ONNX → deploy to fortress
  Interface: zero change — set ONNX_MODEL_PATH env var, restart service
```

### LKGC Capture Schedule
```
Frequency: weekly (if stable)
Trigger:   any configuration change, any service restart, any model update
Script:    ./scripts/capture-lkgc.sh post-deploy
Storage:   Supabase lkgc_snapshots table (permanent)
Retention: all snapshots kept (small row size ~500 bytes each)
```

### Node Firmware Updates
```
Acoustic sensor nodes (smartphones):
  Update path: Expo OTA (background update on WiFi)
  Version tracking: app_version field in nodes table
  Rollback: Expo Updates rollback channel

NATS cluster:
  Update: nats-server binary replace on fortress VM
  Procedure: rolling update (one node at a time — 5-node cluster tolerates 1 down)
  Test: nats stream info SENTINEL after each node update

Supabase:
  Updates: automatic (managed service)
  Migration: supabase db push for schema changes
```

### Operational Monitoring Checklist (Daily)
```
[ ] journalctl -u apex-sentinel-ekf -n 50 --no-pager | grep -i error
[ ] nats consumer info SENTINEL ekf-predictor (lag < 100)
[ ] curl http://127.0.0.1:9090/health → status=ok
[ ] Supabase Dashboard: Edge Function error rate < 1%
[ ] Supabase Dashboard: Database connections < 80% of limit
```

---

## Post-W5 Enhancements (Not Waves — No wave-formation required)

These are backlog items requiring no new wave-formation ceremony. Each is a
targeted enhancement to the existing deployed system.

### ENH-01: Android Native App (replace Expo)
```
Priority: P1
Trigger:  Expo EAS build cost, TFLite native module instability
Stack:    Kotlin + TFLite Android API + WorkManager background service
Effort:   ~4 weeks
Owner:    Android developer
Impact:   30% reduction in inference latency, background service reliability
```

### ENH-02: OSINT Correlation
```
Priority: P2
Description: Cross-reference detected track coordinates with:
  - FAA DroneZone registration database (if US deployment)
  - DJI FlySafe geofence zones
  - OpenStreetMap sensitive infrastructure layer
Output: threat context tag added to track (e.g., "near airport", "registered operator")
Stack: Edge Function querying external APIs + Supabase tracks.context_tags JSONB
Effort: ~2 weeks
```

### ENH-03: Satellite Imagery Integration
```
Priority: P2
Description: When impact estimate confidence > 0.8, fetch satellite tile at
  impact coordinates from Maxar/Planet API → display in ATAK attachment
Stack: ATAK plugin extension + Planet API
Effort: ~3 weeks
```

### ENH-04: ONNX LSTM Model (replaces polynomial surrogate)
```
Priority: P1 (pending training data)
Trigger:  3+ months of labeled FPV track data in ekf_track_events
Stack:    PyTorch LSTM training → ONNX export → onnxruntime-node in production
Interface: zero code change — set ONNX_MODEL_PATH env var
Effort:   ~2 weeks (model training + validation + OTA deploy)
Expected improvement: prediction RMSE at +10s horizon: polynomial ~50m → LSTM ~15m
```

### ENH-05: Per-class EKF Tuning
```
Priority: P2
Description: q_c (maneuver spectral density) differs by drone class:
  FPV freestyle: q_c = 5.0 (high maneuverability)
  DJI consumer:  q_c = 0.1 (smooth GPS-controlled flight)
  Fixed-wing:    q_c = 0.01 (stable trajectory)
Stack: ekf_config table per threatClass + MultiTrackEKFManager lookup
Effort: ~1 week
```

### ENH-06: Multi-target Conflict Resolution
```
Priority: P3
Description: When two tracks are within 50m of each other (potential ID swap),
  flag for operator review. Prevent EKF manager from merging separate tracks.
Stack: MultiTrackEKFManager proximity check on each processDetection call
Effort: ~1 week
```

### ENH-07: Kubernetes Migration (fortress → AKS)
```
Priority: P3 (cost justified at >100 concurrent deployments)
Description: Containerize TdoaCorrelator + EKF microservice as Kubernetes Deployments
  NATS: NATS Helm chart with JetStream
  Supabase: no change (managed service)
  Scaling: HPA on NATS consumer lag metric
Effort: ~4 weeks
```

---

## System Limits and Known Constraints

```
Acoustic detection range:    ~100m in outdoor environments (wind <10km/h)
TDoA position accuracy:      ~5m CEP (3-node, 10m node spacing)
EKF state accuracy:          ~4-6m RMSE (constrained by TDoA noise floor)
Prediction horizon accuracy: +1s ~6m, +5s ~25m, +10s ~50m (polynomial surrogate)
Maximum simultaneous tracks: ~1000 (limited by EKF state memory: 576 bytes/track)
Detection latency:           on-device inference ~200ms, NATS publish ~50ms
TDoA correlation latency:    ~100-500ms (depends on node detection spread)
EKF prediction latency:      ~15ms per track (P99: <200ms full pipeline)
Dashboard update latency:    Supabase Realtime <100ms, NATS.ws <200ms
ATAK CoT latency:            <5 seconds from detection to ATAK display
```

---

## Security Notes

```
All internal NATS traffic: NATS TLS (nats-server TLS config)
Supabase: RLS enforced on all tables; service_role key in systemd EnvironmentFile (600 perms)
Dashboard: Supabase Auth (JWT), HTTPS only (Vercel enforced), no API keys in client bundle
Fortress VM: Tailscale only (fail2ban blocks public SSH — CLAUDE.md rule #8)
API keys: never hardcoded, never in git history, sourced from vault or EnvironmentFile
NATS consumer credentials: NATS NKeys (asymmetric auth)
```

---

## Handoff Sign-off

```
W5 complete when:
  [ ] All 85+ W5 tests pass
  [ ] Cumulative ≥482 tests pass
  [ ] EKF service deployed on fortress VM (systemd active, Restart=on-failure)
  [ ] LKGC captured: v5.0.0-w5-lkgc (SHA + benchmark results in Supabase)
  [ ] W4 dashboard shows prediction polylines for active tracks
  [ ] DEPLOY_CHECKLIST.md all items checked
  [ ] wave-formation.sh complete W5 executed
  [ ] Git tag v5.0.0-w5-lkgc pushed to origin

System declared PRODUCTION-GRADE at W5 complete.
No further wave-formation ceremonies required for the enhancements listed above.

Handoff author: Nico (Nicolae Fratila)
Date: 2026-03-24
APEX-SENTINEL revision: 5.0.0
```
