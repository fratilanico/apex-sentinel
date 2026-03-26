# APEX-SENTINEL W17 — PRD

## Product Requirements Document

### Goal
Make APEX-SENTINEL demo-ready for EUDIS 2026 judges by March 28. Every deliverable must be runnable, verifiable, and self-documenting.

### User Stories

**US-W17-01 (Judge):** As a judge, I want to run a demo scenario and see AWNING escalation happen in real time, so I can evaluate the system's detection pipeline.

**US-W17-02 (Judge):** As a judge, I want a compliance scorecard that maps system capabilities to EUDIS Challenge 01 and 02 requirements, so I can verify all requirements are met.

**US-W17-03 (Judge):** As a judge, I want performance benchmark data (p50/p95/p99) for all critical operations, so I can assess production readiness.

**US-W17-04 (Judge):** As a judge, I want a coverage map showing sensor grid coverage over Romania, so I can assess system deployment density.

**US-W17-05 (Developer/Judge):** As a developer, I want /demo/* REST endpoints so I can integrate the demo into a presentation browser.

**US-W17-06 (Judge):** As a judge, I want a full implementation manifest listing all 17 waves, their FRs, and test counts, so I can assess development thoroughness.

**US-W17-07 (Submitter):** As the team submitting, I want a single JSON package combining compliance, performance, and implementation data, so I can include it in the official submission.

**US-W17-08 (Operator):** As the operator before the demo, I want a GO/NO-GO gate that checks all critical systems, so I can catch failures before judges arrive.

### Acceptance Criteria
- All 8 FRs implemented with ≥10 tests each
- 158+ W17 tests GREEN
- Full P2 regression ≥ 3097 tests GREEN
- generateReadme() ≥ 5000 characters
- Compliance scorecard: C01=100, C02=100, total=100
- All 6 demo scenarios emit correct event sequences
- /demo/* endpoints respond correctly to all valid requests
- FinalSystemVerification: ≥5 checks, at minimum config_valid and mind_the_gap PASS
