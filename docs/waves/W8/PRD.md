# APEX-SENTINEL W8 — Product Requirements Document

> Wave: W8 | Theme: Field Trial Readiness + Operator UX
> Status: PLANNING | Date: 2026-03-26
> Stakeholders: Nicolae Fratila (Founder), INDIGO AirGuard team (Cat/George)

---

## Problem Statement

APEX-SENTINEL has 1619 tests passing and 96.19% coverage, but no field trial has been conducted. The system's recall guarantees exist only against synthetic test fixtures. Real threat profiles (Shahed-238 turbine, Gerbera piston, ELRS 900MHz FPV RF) have not been validated against physical hardware or field recordings.

Additionally, operators have no user interface. The system exposes a NATS mesh + HTTP dashboard API with no frontend. A field trial requires:
1. A UI for operators to monitor detections
2. Confidence that per-profile recall gates are production-worthy
3. Physical hardware (PTZ camera, RF jammer) responding correctly to threat detections
4. OTA mechanism to upgrade field nodes without downtime

---

## User Stories

### Operator Stories (Tier 1 — Field Trial Prerequisite)

**US-W8-01** [P0]
> As a field operator, I need confidence that the system detects Shahed-238 with ≥95% recall, so that I can trust alert escalation to the intercept layer.

Acceptance: CI pipeline proves recall ≥95% on pinned BRAVE1-v2.3-16khz dataset before any release.

**US-W8-02** [P0]
> As a INDIGO AirGuard team lead, I need a dashboard screen showing live drone tracks on a map, so that I can coordinate intercept response without reading raw JSON.

Acceptance: Next.js dashboard deployed on fortress. Track list refreshes within 1 second of detection event. Map shows lat/lng of last fix.

**US-W8-03** [P1]
> As a field operator, I need to control the PTZ camera bearing from the dashboard, so that I can visually confirm a detection without physically repositioning equipment.

Acceptance: Dashboard sends bearing command via NATS → PTZ slave output fires ONVIF command → ACK within 2 seconds.

**US-W8-04** [P1]
> As a node operator, I need to calibrate a detection node from my phone, so that I can set it up in the field without a laptop.

Acceptance: React Native mobile app shows calibration wizard. Steps match CalibrationStateMachine transitions. Calibration completes in <5 minutes.

**US-W8-05** [P1]
> As a system administrator, I need to push a 16kHz firmware update to all field nodes OTA, so that legacy 22050Hz nodes stop degrading detection accuracy.

Acceptance: OTA controller increments firmware version, pushes to NATS KV, nodes self-update. Health check runs post-upgrade. Rollback triggers if health check fails.

### Engineering Stories (Tier 2 — Quality Gates)

**US-W8-06** [P0]
> As a CI engineer, I need per-profile recall gates to block any model export that drops below threshold, so that model regression is caught before deployment.

Acceptance: CI pipeline blocks `npm run export-model` if any profile falls below its threshold gate.

**US-W8-07** [P2]
> As a QA engineer, I need mutation testing in CI with ≥85% kill rate, so that weak test assertions are caught before release.

Acceptance: `npm run test:mutation` runs Stryker; pipeline fails if mutation score <85%.

**US-W8-08** [P1]
> As a threat analyst, I need the system to track ≥5 simultaneous drone threats without track ID collision, so that coordinated swarm attacks can be monitored.

Acceptance: Integration test simulates 8 concurrent threats with distinct acoustic signatures; no track ID collisions; all 8 tracked independently.

**US-W8-09** [P2]
> As a training data engineer, I need motorcycle and power-tool recordings integrated into the training pipeline, so that urban-environment false positive rates drop below 5%.

Acceptance: DatasetPipeline downloads Wild Hornets dataset, augments it, and FalsePositiveGuard reaches FPR <5% on the augmented corpus.

---

## Non-Functional Requirements

### Latency
- Detection-to-alert: <500ms end-to-end (W1 target, unchanged)
- PTZ bearing command ACK: <2 seconds
- Dashboard track refresh: <1 second
- OTA rollout (single node): <30 seconds

### Reliability
- PTZ command failure → fail-safe return to home position
- OTA failure → automatic rollback, no node bricking
- Dashboard SSE disconnect → client reconnects automatically in <5 seconds

### Security
- Mobile app authenticates via JWT bearer (same issuer as dashboard)
- OTA firmware packages are SHA-256 signed; signature verified before application
- No change to existing GDPR coarsening guarantees

### Scalability
- Multi-threat tracking must handle ≥8 concurrent tracks (up from ≥3 in W7)
- Dashboard SSE must handle ≥10 concurrent operator sessions

---

## Success Metrics for W8

| Metric | Target | Measurement |
|--------|--------|-------------|
| Per-profile recall gates | All profiles pass | CI gate output |
| False positive rate (urban) | <5% | Wild Hornets test run |
| PTZ ONVIF ACK latency | <2000ms | Integration test |
| Multi-threat track isolation | 8/8 independent | Integration test |
| Dashboard load time | <3 seconds | Playwright test |
| Mobile calibration flow | <5 minutes | RTL component test |
| Mutation kill rate | ≥85% | Stryker report |
| Test count | ≥1800 tests | vitest output |
| Coverage | ≥96% stmt | vitest coverage |
| mind-the-gap | 19/19 | wave-formation.sh |
