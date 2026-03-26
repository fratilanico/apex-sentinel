# APEX-SENTINEL W8 — Acceptance Criteria

> Wave: W8 | Date: 2026-03-26

---

## FR-W8-01: Per-Profile Recall Oracle Integration

- AC-01: BRAVE1-v2.3-16khz dataset loaded by `RecallOracleGate` with ≥50 samples per profile
- AC-02: Shahed-238 recall ≥0.95 — CI blocks export if below
- AC-03: Gerbera recall ≥0.92 — CI blocks export if below
- AC-04: Shahed-136 recall ≥0.87 — CI blocks export if below
- AC-05: Shahed-131 recall ≥0.85 — CI blocks export if below
- AC-06: quad_rotor recall ≥0.88 — CI blocks export if below
- AC-07: Oracle failure report names failing profile and gap (e.g. "shahed_238: 0.91 < 0.95")
- AC-08: Metrics written to `per_profile_recall_metrics` after every oracle run
- AC-09: `npm run export-model` exits non-zero when any gate fails

---

## FR-W8-02: Simpson's Paradox Consistency Oracle

- AC-01: Weighted macro recall within ±5% of unweighted macro recall (balanced dataset)
- AC-02: Discrepancy >5% triggers PARADOX_DETECTED with failing class name
- AC-03: Per-class recall reported in oracle output (not just aggregate)
- AC-04: Stratified sampling used — not random sampling
- AC-05: Oracle integrated into FR-W8-01 pipeline (not separate step)

---

## FR-W8-03: PTZ Hardware Integration Test Suite

- AC-01: ONVIF bearing command fires within 200ms of NATS ptz.command.bearing event
- AC-02: ONVIF ACK received within 2000ms from simulator
- AC-03: ONVIF timeout (>2000ms): PTZ returns to home position (0°, 0°)
- AC-04: Invalid bearing (>360°) rejected pre-send with error response
- AC-05: Sequential commands execute in order without interleaving
- AC-06: Dashboard POST /api/ptz/bearing returns 202 Accepted with commandId
- AC-07: Dashboard returns 408 on ONVIF ACK timeout
- AC-08: 8 integration tests passing against ONVIF simulator

---

## FR-W8-04: ELRS RF Field Validation

- AC-01: FHSS burst pattern detected in synthetic 900MHz capture (recall ≥0.95)
- AC-02: Urban WiFi (2.4GHz) does not trigger ELRS detection (FPR <2%)
- AC-03: LoRa 868MHz traffic does not trigger ELRS detection
- AC-04: Packet rate threshold tunable via environment variable
- AC-05: Field tuning parameters persisted to NATS KV `rf:elrs:config`
- AC-06: Field validation report includes: recall, precision, FPR, sample counts

---

## FR-W8-05: Mobile React Native UI

- AC-01: CalibrationWizard renders all 5 steps without crashing
- AC-02: Node calibration completes end-to-end (wizard → FSM → NATS event) in <5 minutes (simulated)
- AC-03: Detection event from NATS updates UI within 1 second
- AC-04: OTA firmware notification shows progress bar
- AC-05: App works offline with cached detections (no crash)
- AC-06: Audio captured on-device only — no network upload of raw audio
- AC-07: JWT auth required — expired token shows re-login prompt
- AC-08: 35 tests passing (RTL + integration + 5 E2E journeys)

---

## FR-W8-06: Demo Dashboard Next.js Frontend

- AC-01: Track appears on Leaflet map within 1 second of NATS detection event
- AC-02: Alert log shows latest alert at top; auto-scrolls
- AC-03: PTZ bearing control sends POST and shows 202 confirmation
- AC-04: Dashboard reconnects SSE stream automatically within 5 seconds after disconnect
- AC-05: JWT bearer required for ptz.bearing endpoint
- AC-06: /health endpoint returns node count, firmware version, model version
- AC-07: Dashboard load time <3 seconds on localhost (measured by Playwright)
- AC-08: 25 tests passing (RTL + integration + 5 E2E journeys)

---

## FR-W8-07: Multi-Threat Simultaneous Tracking

- AC-01: 8 concurrent TDoA solve results produce 8 independent track IDs
- AC-02: No track ID collisions under 8-threat simultaneous load
- AC-03: Track collision event published when two tracks converge <10m separation
- AC-04: Swarm detection event published when ≥3 tracks active simultaneously
- AC-05: Stale tracks (30s no update) evicted from TrackManager
- AC-06: `multi_threat_sessions` row created for every swarm event
- AC-07: PTZ prioritizes highest-threat track when multiple compete

---

## FR-W8-08: Firmware OTA Controller

- AC-01: OTA detects version mismatch via NATS KV manifest
- AC-02: SHA-256 signature verified before firmware applied
- AC-03: SHA-256 mismatch → firmware discarded, OTA aborted, no rollback needed
- AC-04: Health check runs post-update: audio capture + YAMNet inference test
- AC-05: Health check failure → automatic rollback within 30 seconds
- AC-06: Rollback logged in `firmware_ota_log` with `status: rolled_back`
- AC-07: GDPR location coarsening active after OTA (regression test passes)
- AC-08: Audio capture sample rate = 16000Hz after OTA (regression test passes)

---

## FR-W8-09: Wild Hornets Augmentation Pipeline

- AC-01: `DatasetPipeline.loadWildHornets()` loads ≥3000 samples
- AC-02: Resampling to 16kHz applied before augmentation
- AC-03: Augmentation produces ≥2x dataset size
- AC-04: FPR <5% on augmented corpus with default threshold
- AC-05: Auto-raise mechanism converges within 3 iterations when FPR ≥5%
- AC-06: Drone recall not degraded below profile gate after threshold raise

---

## FR-W8-10: Learning-Safety IEC 61508 Promotion Gate

- AC-01: `promoteModel()` with all metrics above threshold returns `promoted: true`
- AC-02: `promoteModel()` with any metric below threshold returns `promoted: false` with reason
- AC-03: `setActiveModel()` without valid ModelHandle throws SAFETY_GATE_VIOLATION
- AC-04: SAFETY_GATE_VIOLATION logged with stack trace to Supabase
- AC-05: `model_promotion_audit` row written after every `promoteModel()` call
- AC-06: Weight swap is atomic — no partial state visible during transition
- AC-07: All 15 `.todo()` tests from W7 now pass (no more `.todo()` in test suite)

---

## FR-W8-11: Chaos Engineering Test Suite

- AC-01: NATS node failure mid-triangulation → TDoA degrades gracefully (no crash)
- AC-02: NATS partition (2/5 isolated) → system continues with 3-node quorum
- AC-03: Clock skew ±500ms → TDoA position error remains <10m
- AC-04: PTZ ONVIF timeout during chaos → return-to-home fires
- AC-05: 3 simultaneous node failures → mesh operational with 2 nodes
- AC-06: 20 chaos tests passing

---

## FR-W8-12: Stryker Mutation Testing CI

- AC-01: `npm run test:mutation` executes without error
- AC-02: Mutation score ≥85% on targeted modules
- AC-03: CI pipeline fails if score <85%
- AC-04: Mutation report artifact saved in CI

---

## Wave-Level Acceptance (W8 complete when):

- [ ] All 12 FRs: all AC items verified
- [ ] ≥1800 tests passing (0 failures)
- [ ] ≥96% statement coverage maintained
- [ ] mind-the-gap 19/19 PASS
- [ ] All 15 `.todo()` tests resolved (W8-10)
- [ ] `npm run export-model` gated by recall oracle
- [ ] FR_REGISTER: all W8 FRs marked DONE
