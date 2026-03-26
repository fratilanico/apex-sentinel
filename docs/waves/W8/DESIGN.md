# APEX-SENTINEL W8 — Design Document

> Wave: W8 | Theme: Field Trial Readiness + Operator UX
> Status: PLANNING | Date: 2026-03-26

---

## Vision

W8 transforms APEX-SENTINEL from a technically-complete prototype into a field-deployable defence intelligence platform. The system currently has 1619 tests and 96.19% coverage across 60 TypeScript modules. W8 closes the gap between "working in CI" and "working in a Romanian field trial against real drone threats".

The three pillars of W8:

**1. Detection Validation** — Per-profile recall oracle gates, Simpson's Paradox prevention, Wild Hornets false-positive suppression. Every threat profile must pass recall gates before a model export is accepted. The system must be defensible in front of NATO evaluators.

**2. Hardware Integration** — PTZ camera integration test suite (ONVIF simulator), ELRS 900MHz RF field validation against Foxeer TRX1003, firmware OTA controller for 16kHz migration of legacy nodes. Hardware mocks are replaced with integration contracts.

**3. Operator UX** — Demo Dashboard Next.js frontend wired to existing dashboard API, mobile React Native UI wired to existing mobile module layer. Operators gain a real interface, not a raw API.

---

## W8 Scope

### In Scope
- FR-W8-01: Per-Profile Recall Oracle Integration (P0)
- FR-W8-02: Simpson's Paradox Consistency Oracle (P1)
- FR-W8-03: PTZ Hardware Integration Test Suite (P1)
- FR-W8-04: ELRS RF Field Validation (P1)
- FR-W8-05: Mobile React Native UI (P2)
- FR-W8-06: Demo Dashboard Next.js Frontend (P2)
- FR-W8-07: Multi-Threat Simultaneous Tracking (P1)
- FR-W8-08: Firmware OTA Controller (P1)
- FR-W8-09: Wild Hornets Augmentation Pipeline (P2)
- FR-W8-10: Learning-Safety IEC 61508 Promotion Gate (P0)
- FR-W8-11: Chaos Engineering Test Suite (P2)
- FR-W8-12: Stryker Mutation Testing CI Integration (P2)

### Out of Scope
- GPS anti-jam (W9)
- Acoustic sensor hardware fabrication (field team)
- ATAK plugin native binaries (W9)
- Command authority escalation beyond PTZ/jammer (legal/MoD approval needed)

---

## Design Principles

### Real Data Over Synthetic
Every recall gate must run against a pinned dataset (BRAVE1-v2.3-16khz). Synthetic-only tests are insufficient for defence systems. Tests are only as good as the threats they represent.

### Fail-Operational by Default
W7 established this pattern. W8 extends it: firmware OTA must roll back automatically if health check fails post-upgrade. PTZ commands must fail safely (return to home position) if ONVIF command ACK is not received within 2 seconds.

### Privacy Preserved End-to-End
No raw audio ever leaves the detection node. The GDPR grid coarsening (±50m) must survive firmware OTA (regression test in W8-08). The Wild Hornets dataset must be processed locally; no audio uploads to external services.

### Operator-Centric UX
The dashboard is designed for a single operator under stress. One screen: threat list (left), map (center), alert log (right). Maximum 2 clicks to acknowledge a threat. Mobile UI mirrors desktop layout on portrait mode.

---

## Architecture Delta from W7

```
W7 (complete):
  AcousticProfileLibrary (16kHz, 4 profiles)
  TerminalPhaseDetector FSM
  PTZ/Jammer/Intercept output stubs
  SentinelPipelineV2 (live TdoaSolver)
  Demo Dashboard API (Node only)

W8 adds:
  Recall oracle gates (dataset → CI)
  promoteModel() safety gate (YAMNetFineTuner)
  PTZ ONVIF integration contract
  ELRS 900MHz field tuning envelope
  React Native mobile UI (→ NatsClientFSM)
  Next.js dashboard frontend (→ Dashboard API)
  OTA controller (→ ModelManager)
  Multi-threat track collision resolution
  Wild Hornets augmentation pipeline
  Chaos engineering test harness
```

---

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Mobile framework | React Native + Expo 51 | Mobile layer already uses TypeScript; Expo managed workflow matches existing node targets |
| Dashboard framework | Next.js 14 App Router | Server components for SSE track feed; existing dashboard API is plain HTTP |
| Map library | Leaflet.js (2D) + leaflet-heat | Minimal bundle, offline-capable, ATAK CoT compatible |
| OTA transport | NATS JetStream KV | Already in stack; key-value store for firmware version manifest |
| ONVIF testing | onvif-simulator npm package | No physical camera required in CI |
| Mutation testing | Stryker Mutator v8 | Already configured in stryker.config.json |

---

## Risk Register (Design-Level)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ELRS RF field validation blocked by RF permit | Medium | High | Use Foxeer TRX1003 as passive receiver only; transmit from APEX team drone |
| Wild Hornets dataset download stalls | Low | Medium | Mirror to Supabase storage bucket before W8 starts |
| React Native build fails on CI | Medium | Low | Expo EAS managed builds; decouple from main CI |
| ONVIF simulator latency not representative | Low | Medium | Add latency injection to simulator |
| 15 .todo() tests block mind-the-gap | Low | High | Implement promoteModel() gate in W8-10; other todos follow |
