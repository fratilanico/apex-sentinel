# APEX-SENTINEL W8 — Feature Requirements Register

> Wave: W8 | Theme: Field Trial Readiness + Operator UX
> Status: EXECUTE | Updated: 2026-03-26

---

## Summary

| Wave | FR Count | Status | Test Count |
|------|----------|--------|------------|
| W1-W7 | 55 | DONE | 1619 |
| W8 | 12 | 10/12 DONE (W8.2 deferred) | 241 |
| **TOTAL** | **67** | | **1860** |

---

## W8 Feature Requirements

| FR ID | Title | Status | Tests | Priority | Blocking |
|-------|-------|--------|-------|----------|---------|
| FR-W8-01 | Per-Profile Recall Oracle Integration | DONE | 16 | P0 | export-model |
| FR-W8-02 | Simpson's Paradox Consistency Oracle | DONE | 12 | P1 | W8-01 |
| FR-W8-03 | PTZ Hardware Integration Test Suite | DONE | 8 | P1 | none |
| FR-W8-04 | ELRS RF Field Validation | DONE | 10 | P1 | none |
| FR-W8-05 | Mobile React Native UI | DEFERRED W8.2 | 0 | P2 | mobile/*.ts |
| FR-W8-06 | Demo Dashboard Next.js Frontend | DEFERRED W8.2 | 0 | P2 | dashboard/api.ts |
| FR-W8-07 | Multi-Threat Simultaneous Tracking | DONE | 20 | P1 | W8-01 |
| FR-W8-08 | Firmware OTA Controller | DONE | 12 | P1 | none |
| FR-W8-09 | Wild Hornets Augmentation Pipeline | DONE | 18 | P2 | none |
| FR-W8-10 | Learning-Safety IEC 61508 Promotion Gate | DONE | 32 | P0 | W7 .todo() |
| FR-W8-11 | Chaos Engineering Test Suite | DONE | 20 | P2 | none |
| FR-W8-12 | Stryker Mutation Testing CI Integration | DONE | 0 | P2 | none |

---

## FR-W8-01 — Per-Profile Recall Oracle Integration

**Rationale:** CI currently validates on synthetic audio samples. Real deployment requires proof that every threat profile meets its recall threshold against pinned field recordings. A single model update that drops Shahed-238 recall from 0.97 to 0.89 could miss a terminal-phase threat — unacceptable.

**Acceptance:**
- BRAVE1-v2.3-16khz dataset loaded (≥50 samples per profile)
- Gate thresholds: shahed_238 ≥0.95, gerbera ≥0.92, shahed_136 ≥0.87, shahed_131 ≥0.85, quad_rotor ≥0.88
- `npm run export-model` blocked on gate failure
- Metrics persisted to `per_profile_recall_metrics` Supabase table

---

## FR-W8-02 — Simpson's Paradox Consistency Oracle

**Rationale:** Aggregate recall (e.g. 91%) can mask class-level failure (e.g. Shahed-238 at 72%) when majority classes dominate the dataset. Defence systems must not fall into Simpson's Paradox.

**Acceptance:**
- Weighted and unweighted macro recall agree within ±5%
- Per-class recall reported independently in oracle output
- Paradox detection triggers when gap >5% with failing class name

---

## FR-W8-03 — PTZ Hardware Integration Test Suite

**Rationale:** PTZ slave output was implemented in W7 but only tested against mocks. An operator trusting dashboard PTZ control needs confidence the ONVIF command actually moves the camera. Integration tests against simulator prove the end-to-end path.

**Acceptance:**
- 8 tests passing against `onvif-simulator` npm package
- ONVIF ACK within 2 seconds
- Timeout → return-to-home fires

---

## FR-W8-04 — ELRS RF Field Validation

**Rationale:** ELRS RF fingerprinting was tuned on synthetic data. Urban Romanian environments have dense LoRa/WiFi interference that could cause false positives. Field validation tunes the threshold envelope before the first real deployment.

**Acceptance:**
- FPR <2% on synthetic urban background
- Recall >95% on synthetic ELRS FHSS capture
- Threshold persisted to NATS KV

---

## FR-W8-05 — Mobile React Native UI

**Rationale:** Field operators need to calibrate nodes and monitor detections from their phones. The mobile business logic layer (W3) is complete in TypeScript. W8 wires the UI.

**Acceptance:**
- 35 tests (RTL + integration + 5 E2E)
- Calibration wizard completes end-to-end
- Audio never transmitted over network

---

## FR-W8-06 — Demo Dashboard Next.js Frontend

**Rationale:** The dashboard API was completed in W7 (pure Node HTTP). Operators need a browser UI. The EUDIS demo requires visual evidence of the pipeline working.

**Acceptance:**
- 25 tests (RTL + integration + 5 E2E journeys)
- Track appears on map within 1 second of detection
- PTZ bearing control functional

---

## FR-W8-07 — Multi-Threat Simultaneous Tracking

**Rationale:** Coordinated drone swarm attacks are the primary escalation threat (3+ drones simultaneously). The current TrackManager was designed for 3 tracks; W8 validates 8+ concurrent tracks.

**Acceptance:**
- 8 concurrent tracks without ID collision
- Swarm event published at ≥3 simultaneous tracks
- Track eviction at 30s stale timeout

---

## FR-W8-08 — Firmware OTA Controller

**Rationale:** W7 fixed the 22050Hz→16kHz bug but legacy nodes still run old firmware. Manual firmware updates in the field are error-prone. OTA ensures all nodes migrate automatically.

**Acceptance:**
- OTA via NATS KV manifest
- SHA-256 verified before apply
- Auto-rollback on health check failure
- GDPR + 16kHz regression tests pass after OTA

---

## FR-W8-09 — Wild Hornets Augmentation Pipeline

**Rationale:** FalsePositiveGuard is tuned on synthetic urban noise. Real European urban environments have motorcycle density, power tools, and industrial machinery that the current training data does not represent.

**Acceptance:**
- 3000+ samples processed
- FPR <5% on augmented corpus
- Drone recall maintained above gate thresholds

---

## FR-W8-10 — Learning-Safety IEC 61508 Promotion Gate

**Rationale:** W7 deliberately left 15 tests as `.todo()` — the IEC 61508 model promotion gates. These cannot be implemented without the promoteModel() method. W8-10 resolves all 15 outstanding todos and implements the safety gate.

**Acceptance:**
- promoteModel() gated on per-profile metrics
- setActiveModel() requires valid ModelHandle
- SAFETY_GATE_VIOLATION logged on bypass
- 15 `.todo()` tests now pass → 0 remaining

---

## FR-W8-11 — Chaos Engineering Test Suite

**Rationale:** The system operates in degraded environments (field nodes fail, network partitions, power interruptions). Chaos tests prove the fail-operational guarantee extends to infrastructure failures, not just software faults.

**Acceptance:**
- 20 deterministic chaos tests
- NATS partition, clock skew, node failure scenarios
- All fail safely (no crash, no data loss)

---

## FR-W8-12 — Stryker Mutation Testing CI Integration

**Rationale:** The test suite is extensive (1619+ tests) but does not measure test quality. Stryker mutations reveal weak assertions that let bugs slip through. CI gate ensures quality does not regress.

**Acceptance:**
- `npm run test:mutation` working
- Mutation score ≥85%
- CI fails if score drops below 85%
