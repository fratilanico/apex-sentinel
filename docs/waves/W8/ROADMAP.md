# APEX-SENTINEL W8 — Roadmap

> Wave: W8 | Theme: Field Trial Readiness + Operator UX
> Status: PLANNING | Date: 2026-03-26

---

## Timeline (2-week sprint target: April 10, 2026)

```
Week 1 (Mar 27 – Apr 2): Quality Gates + Hardware Integration
  Day 1-2:  FR-W8-01 Per-profile recall oracle (P0)
  Day 3:    FR-W8-02 Simpson's paradox oracle (P1)
  Day 4-5:  FR-W8-10 Learning-safety IEC 61508 gate (P0)
             → resolves all 15 .todo() tests
  Day 6-7:  FR-W8-12 Stryker mutation CI (P2, quick win)

Week 2 (Apr 3 – Apr 10): Hardware + Tracking + UX
  Day 1-2:  FR-W8-07 Multi-threat simultaneous tracking (P1)
  Day 3-4:  FR-W8-08 Firmware OTA controller (P1)
  Day 5-6:  FR-W8-03 PTZ integration test suite (P1)
  Day 7:    FR-W8-04 ELRS RF field validation envelope (P1)
             (field trial: separate scheduling with INDIGO team)

W8.2 (Apr 11 – Apr 25): Operator UX (deferred from W8 core)
  FR-W8-05: Mobile React Native UI
  FR-W8-06: Dashboard Next.js Frontend
  FR-W8-09: Wild Hornets augmentation pipeline
  FR-W8-11: Chaos engineering test suite
```

---

## Milestones

| Milestone | Target Date | Definition |
|-----------|-------------|------------|
| W8 init   | 2026-03-26  | Docs scaffold + FR_REGISTER |
| W8 plan   | 2026-03-27  | All 20 PROJECTAPEX docs complete |
| W8 tdd-red | 2026-03-28 | All test files written (RED) |
| W8 execute | 2026-04-08 | All core FRs implemented |
| W8 checkpoint | 2026-04-09 | All P0/P1 FRs passing |
| W8 complete | 2026-04-10 | mind-the-gap 19/19, ≥1800 tests |

---

## Post-W8 Roadmap

### W9 — Production Hardening (target: May 2026)
- Full learning-safety certification (IEC 61508 SIL-2 full audit)
- GPS anti-jam integration (RTK fallback)
- ATAK plugin native binaries
- Battlefield mesh resilience (NATS partition recovery upgrade)
- Multi-language dashboard (RO, EN, UA)

### W10 — NATO Integration Layer (target: June 2026)
- NATO ADatP-3 message format compliance
- STANAG 4586 interface layer
- VMF (Variable Message Format) relay
- Integration with Romanian Air Force radar correlation
- Blue force tracking (avoid PTZ/jammer on friendly assets)

### W11 — Deployment Package (target: July 2026)
- Containerised edge deployment (armhf/arm64 Docker)
- Ansible playbook for node provisioning
- Operator training materials (Romanian + English)
- Security audit + penetration test
- CE certification pathway (for commercial sale)

---

## EUDIS Hackathon Deliverable (March 26-28, 2026)

Current state: READY for demo.

Pitch deck talking points supported by W7 evidence:
1. "End-to-end drone detection in 500ms" — SentinelPipelineV2 integration test
2. "96.19% code coverage, 1619 tests" — vitest output
3. "INDIGO-validated threat profiles" — Gerbera, Shahed-131/238 signatures
4. "Privacy by design — no audio cloud upload" — GDPR audit log tests
5. "Hardware response: PTZ + jammer + intercept coordinator" — W7 output modules
6. "Distributed civilian sensor grid — no $50K military hardware" — architecture diagram

W8 (post-hackathon) adds the recall oracle gates, field hardware validation, and operator UI that judges may ask about in Q&A.
