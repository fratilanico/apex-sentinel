# APEX-SENTINEL W8 — Test Strategy

> Wave: W8 | TDD RED before implementation | Date: 2026-03-26

---

## Test Count Target

| Wave | Tests | Cumulative |
|------|-------|------------|
| W1-W7 | 1619 | 1619 |
| W8 target | ≥181 | ≥1800 |

---

## FR Test Matrix

### FR-W8-01: Per-Profile Recall Oracle (16 tests)

```
tests/ml/FR-W8-01-recall-oracle.test.ts

TDD Stack:
  Unit (8):
    - loadDataset() returns correct sample counts per profile
    - classify() called for each recording in dataset
    - precision/recall/F1 computed correctly
    - gate passes when all thresholds met
    - gate fails when any single profile below threshold
    - failure report names the failing profile and gap
    - metrics written to Supabase per_profile_recall_metrics
    - oracle result includes dataset version string

  Integration (8):
    - Full pipeline: load BRAVE1-v2.3-16khz → classify → assert gates
    - Shahed-238 gate blocks export when recall < 0.95
    - Gerbera gate blocks export when recall < 0.92
    - Shahed-136 gate passes for valid dataset
    - Shahed-131 gate passes for valid dataset
    - Quad-rotor gate passes for valid dataset
    - npm run export-model blocked when any gate fails
    - Metrics persisted to Supabase after every oracle run
```

### FR-W8-02: Simpson's Paradox Consistency Oracle (12 tests)

```
tests/ml/FR-W8-02-simpsons-oracle.test.ts

Unit (6):
  - Weighted macro matches unweighted macro within 5% on balanced dataset
  - Weighted macro diverges >5% when minority class artificially inflated
  - Per-class recall reported independently (not averaged before gating)
  - Rare class (shahed_238) not diluted by high-volume quad_rotor samples
  - Stratified sampling produces correct class distribution
  - Oracle reports failing class name in failure message

Integration (6):
  - Full pipeline with imbalanced dataset triggers paradox detection
  - Full pipeline with balanced dataset passes oracle
  - Paradox oracle runs as part of recall oracle gate (not separate step)
  - Class count visible in oracle report
  - CI output includes per-class breakdown table
  - Gate blocked when paradox detected even if aggregate recall >90%
```

### FR-W8-03: PTZ Integration Test Suite (8 tests)

```
tests/hardware/FR-W8-03-ptz-integration.test.ts

Integration (8):
  - ONVIF command sent to simulator on bearing(270.5, 15.0)
  - ONVIF ACK received within 2000ms
  - Command timeout triggers return-to-home
  - Invalid bearing (>360°) rejected before ONVIF send
  - Multiple sequential commands execute in order
  - NATS ptz.command.bearing subscription triggers ONVIF send
  - NATS ptz.command.ack published after simulator ACK
  - Dashboard POST /api/ptz/bearing returns 202 with commandId
```

### FR-W8-04: ELRS RF Field Validation (10 tests)

```
tests/rf/FR-W8-04-elrs-field.test.ts

Unit (5):
  - FHSS burst pattern detected in 900MHz synthetic capture
  - Packet rate threshold tunable via config (default: 450pps)
  - Urban WiFi noise (2.4GHz) does not trigger ELRS detection
  - LoRa 868MHz traffic does not trigger ELRS detection
  - Field validation envelope returns FPR estimate

Integration (5):
  - ElrsRfFingerprint processes synthetic RTL-SDR IQ capture
  - FPR <2% on synthetic urban background (1000 non-ELRS samples)
  - Recall >95% on synthetic ELRS FHSS capture
  - Field tuning parameters persisted to NATS KV
  - Health check after field tuning validates parameters
```

### FR-W8-05: Mobile React Native UI (35 tests)

```
tests/mobile/FR-W8-05-mobile-ui.test.ts

RTL Component (20):
  - CalibrationWizard renders all 5 steps
  - Step 1: node ID entry validates format
  - Step 2: GPS coordinates entry validates range
  - Step 3: audio capture test shows waveform
  - Step 4: NATS connection status indicator
  - Step 5: calibration submit fires FSM.startCalibration()
  - DetectionView renders empty state correctly
  - DetectionView renders track list with threat icons
  - Shahed icon renders for shahed profiles
  - Quad-rotor icon renders for quad_rotor profile
  - Alert badge increments on new detection
  - NodeHealthPanel shows 3 health metrics
  - OTA progress bar renders during firmware update
  - Calibration completed: success screen shown
  - Error state: network unavailable shows offline banner
  - (5 more component tests)

Integration (10):
  - Full calibration flow: wizard → FSM → NATS publish
  - Detection event arrives via NATS → UI updates within 1s
  - OTA notification arrives via NATS → progress bar starts
  - OTA completed → version string updates in health panel
  - JWT auth: expired token shows re-login prompt
  - Offline mode: shows cached detections, queued updates
  - (4 more integration tests)

E2E/Journey (5):
  - JOURNEY: Operator calibrates a new node in the field
  - JOURNEY: Operator monitors live detections during patrol
  - JOURNEY: Operator receives terminal phase alert
  - JOURNEY: OTA firmware update completes without node restart
  - JOURNEY: Operator reviews alert log from previous 24h
```

### FR-W8-06: Dashboard Next.js Frontend (25 tests)

```
tests/dashboard/FR-W8-06-dashboard-ui.test.ts

RTL Component (10):
  - MapPanel renders Leaflet map container
  - TrackList renders sorted by severity (critical first)
  - AlertLog renders latest alert at top
  - BearingControl sends POST /api/ptz/bearing on submit
  - Health widget shows nodes online/total
  - Track click centers map on track position
  - Alert dismissal removes from list (optimistic update)
  - Dashboard reconnects SSE after network drop
  - (2 more component tests)

Integration (10):
  - SSE /api/tracks streams track events to MapPanel
  - Track appears on map within 1s of detection
  - Alert appears in AlertLog within 1s of NATS event
  - PTZ bearing command returns 202
  - PTZ ACK timeout returns 408 with safe fail message
  - /health endpoint returns node count
  - JWT bearer required for /api/ptz/bearing
  - (3 more integration tests)

E2E/Journey (5):
  - JOURNEY: Operator views live drone track on map
  - JOURNEY: Operator sends PTZ bearing command to camera
  - JOURNEY: Operator reviews alert log from past hour
  - JOURNEY: Dashboard survives NATS reconnect
  - JOURNEY: Operator sees firmware OTA status in health widget
```

### FR-W8-07: Multi-Threat Simultaneous Tracking (20 tests)

```
tests/tracking/FR-W8-07-multi-threat.test.ts

Unit (10):
  - TrackManager handles 8 concurrent track updates
  - No track ID collision when 8 TDoA solves arrive simultaneously
  - Track collision alert when two tracks converge <10m
  - Track eviction after 30s stale timeout
  - Swarm detection triggers when ≥3 tracks active simultaneously
  - TDoA deconfliction: same position + different signature → new track ID
  - TDoA deconfliction: same position + same signature → existing track updated
  - Track priority: terminal phase tracks get highest priority slot
  - (2 more unit tests)

Integration (10):
  - 8 concurrent acoustic events → 8 independent tracks
  - 5 simultaneous terminal phase tracks → PTZ selects highest threat
  - Swarm event published to NATS track.swarm.detected
  - Collision event published to NATS track.multi.collision
  - multi_threat_sessions row created for swarm events
  - Track eviction removes from Supabase threat_tracks
  - Peak track count recorded in multi_threat_sessions
  - (3 more integration tests)
```

### FR-W8-08: Firmware OTA Controller (12 tests)

```
tests/node/FR-W8-08-ota-controller.test.ts

Unit (6):
  - checkForUpdate returns manifest when version differs
  - checkForUpdate returns null when version matches
  - downloadAndVerify validates SHA-256 before returning path
  - downloadAndVerify throws on SHA-256 mismatch
  - applyUpdate calls platform-specific installer
  - rollback reverts to previous version path

Integration (6):
  - Full OTA: manifest → download → verify → apply → health check → done
  - OTA log entry created in firmware_ota_log
  - Health check fails → rollback triggered → rollback log entry
  - GDPR grid coarsening still active after OTA (regression)
  - Audio capture sample rate is 16kHz after OTA (regression)
  - NATS firmware.node.<id>.status updates during OTA lifecycle
```

### FR-W8-09: Wild Hornets Augmentation (18 tests)

```
tests/ml/FR-W8-09-wild-hornets.test.ts

Unit (8):
  - loadWildHornets loads WAV files from directory
  - Resampling to 16kHz applied to all files
  - augment() applies time-stretch ±20%
  - augment() applies pitch-shift ±2 semitones
  - augment() generates ≥2x dataset size from original
  - FPR computed correctly on augmented corpus
  - FPR >5% triggers threshold auto-raise by 0.02
  - Auto-raise cap: threshold cannot exceed 0.95

Integration (10):
  - Full pipeline: loadWildHornets → augment → classify → FPR
  - FPR <5% on 3000-sample corpus with default threshold
  - Auto-raise converges within 3 iterations
  - No false positives on motorcycle recordings after tuning
  - No false positives on lawnmower recordings after tuning
  - No false positives on power-tool recordings
  - Drone recordings still correctly classified after threshold raise
  - (3 more integration tests)
```

### FR-W8-10: Learning-Safety Gate (16 tests)

```
tests/unit/FR-W8-10-learning-safety-gate.test.ts

Unit (10):
  - promoteModel() called with passing metrics returns promoted:true
  - promoteModel() called with failing metrics returns promoted:false
  - promoteModel() failure report names failing profile and gap
  - ModelHandle created only on success, not on failure
  - setActiveModel() with valid handle succeeds
  - setActiveModel() without valid handle throws SAFETY_GATE_VIOLATION
  - SAFETY_GATE_BYPASSED logged when violation detected
  - Audit record written to model_promotion_audit
  - Audit record includes operator_id, model_version, metrics
  - Concurrent promoteModel() calls are serialized (no race condition)

Integration (6):
  - Full promotion: train() → runRecallOracle() → promoteModel() → setActiveModel()
  - Blocked promotion: sub-threshold metrics → no model swap
  - Model swap is atomic: no partial weight state visible during swap
  - Audit appended to Supabase model_promotion_audit after every attempt
  - safety_gate_bypassed=true logged on violation
  - All 15 .todo() tests now pass after W8-10 implementation
```

### FR-W8-11: Chaos Engineering (20 tests)

```
tests/chaos/FR-W8-11-chaos.test.ts

All chaos:
  - NATS node failure mid-triangulation → TDoA solver degrades gracefully
  - NATS partition (2 of 5 nodes isolated) → Raft continues with quorum
  - Clock skew ±500ms injected → TDoA still within 10m accuracy
  - Node restart during OTA → OTA rollback triggers
  - YAMNet inference timeout → FalsePositiveGuard suppresses result
  - PTZ ONVIF timeout → return-to-home fires
  - Supabase connection drop → events queued in NATS DLQ
  - Audio capture hardware failure → node marks itself as degraded
  - 3 simultaneous node failures → mesh still functional with 2 nodes
  - Model promotion during swarm event → promotion deferred, swarm handled
  - (10 more chaos tests)
```

### FR-W8-12: Stryker Mutation Testing (0 new tests, CI gate)

```
stryker.config.json already exists. W8-12 adds:
  - npm run test:mutation → runs Stryker
  - CI gate: fail if mutation score < 85%
  - Mutation report artifact saved in CI

No new test files. Stryker generates mutants automatically.
Target modules for mutation testing priority:
  - src/ml/acoustic-profile-library.ts
  - src/detection/terminal-phase-detector.ts
  - src/tracking/track-manager.ts
  - src/ml/dataset-pipeline.ts
```

---

## TDD Protocol

All tests written RED before implementation. Commit message format:
```
test(W8): FR-W8-XX — <FR name> RED (N tests)
```

Then implementation:
```
feat(W8): FR-W8-XX — <FR name> GREEN (N tests)
```

Mind-the-gap run after every FR completion. 19/19 must remain green throughout W8.
