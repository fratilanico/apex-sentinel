# APEX-SENTINEL W8 — Decision Log

> Wave: W8 | Date: 2026-03-26

---

## DEC-W8-001: Mobile Framework — Expo 51 Managed (not bare)

**Decision:** Use Expo 51 Managed Workflow, not bare React Native or Capacitor.

**Rationale:**
- Mobile logic already written in TypeScript (NatsClientFSM, CalibrationStateMachine, BatteryOptimizer) — Expo Managed allows reuse without native bridging overhead
- The only native module needed is audio capture; `expo-av` covers this without custom native code
- Managed workflow provides OTA capability for the mobile app itself via Expo Updates
- Bare workflow would add weeks of native build configuration for marginal gain

**Consequences:**
- Expo SDK constraints: must stay on APIs expo supports
- No custom native modules beyond expo-av
- EAS Build used for CI (not local Xcode/Android Studio)

---

## DEC-W8-002: Dashboard Map Library — Leaflet (not CesiumJS)

**Decision:** Leaflet.js + leaflet-heat for dashboard map. CesiumJS deferred to W9.

**Rationale:**
- Leaflet: 40KB bundle vs CesiumJS: 8MB+. Field operators may have limited bandwidth.
- 2D map sufficient for W8 field trial (lat/lng + altitude as marker size)
- CesiumJS 3D globe useful for NATO integration (W10) but premature for W8
- leaflet-heat provides heatmap density visualization needed for EUDIS demo

**Consequences:**
- 3D terrain view not available in W8 dashboard
- Altitude shown as overlay text, not spatial

---

## DEC-W8-003: OTA Transport — NATS JetStream KV (not HTTPS CDN)

**Decision:** Use existing NATS JetStream KV bucket for OTA firmware manifest distribution.

**Rationale:**
- NATS is already in the stack as core mesh transport
- KV store provides atomic updates, versioning, and watch subscriptions
- Firmware package itself downloaded from Supabase Storage (HTTPS) for bandwidth efficiency
- Avoids adding a separate CDN dependency

**Consequences:**
- Nodes must maintain NATS connectivity to receive OTA notifications
- Offline nodes only learn about updates when they reconnect
- Firmware package download is separate from manifest notification (hybrid approach)

---

## DEC-W8-004: IEC 61508 Safety Integrity Level — SIL-2

**Decision:** Target IEC 61508 SIL-2 for model promotion gate, not SIL-3 or SIL-4.

**Rationale:**
- SIL-2 appropriate for a system that recommends intercept (human confirms)
- SIL-3/4 required only for fully autonomous lethal force (which APEX-SENTINEL does not exercise)
- Jammer/PTZ commands still require operator send in W8 dashboard
- SIL-4 certification would require formal mathematical proof of model correctness — out of scope for W8

**Consequences:**
- Promotion gate requires metrics thresholds (SIL-2 compliant)
- Audit trail required (implemented in W8-10)
- Does NOT replace human-in-the-loop for lethal action
- W9 may reassess if autonomous intercept mode is added

---

## DEC-W8-005: Wild Hornets FPR Target — 5% (not 1%)

**Decision:** Target FPR <5% on Wild Hornets corpus, not <1%.

**Rationale:**
- 1% FPR would require precision that may suppress true positives (recall/precision tradeoff)
- 5% FPR means 150 false positives per 3000 urban sounds — at 500ms detection window, this is ~75 false positives per 1500 seconds = 1 false positive per 20 seconds in a dense urban environment
- In field deployment, operator watches dashboard: occasional false alerts are manageable
- Raising threshold beyond 5% target risks missing real Shahed-136 detections

**Review:** If field trial shows FPR >5%, revisit threshold or add secondary RF confirmation gate.

---

## DEC-W8-006: Chaos Testing Coverage — 20 Tests (not full Monte Carlo)

**Decision:** 20 deterministic chaos tests, not probabilistic chaos (Monte Carlo failure injection).

**Rationale:**
- Deterministic tests are reproducible in CI — Monte Carlo chaos tests create flaky CI
- W7's MonteCarloPropagator covers stochastic trajectory prediction
- Infrastructure chaos (NATS partition, node failure) should be deterministic simulation
- Full chaos monkey style testing deferred to W11 (pre-NATO certification)
