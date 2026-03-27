# APEX-SENTINEL W19 — ROADMAP

## Theme: Romania/EU Threat Intelligence Layer

---

## Wave Progression Context

```
W1  Node Registration + Alert Routing                  COMPLETE
W2  Detection Pipeline Core                            COMPLETE
W3  YAMNet Acoustic Classifier                         COMPLETE
W4  Acoustic Model Refinement                          COMPLETE
W5  RF Signature Classifier                            COMPLETE
W6  RF Fingerprint Database                            COMPLETE
W7  Multi-Modal Fusion Engine                          COMPLETE
W8  Threat Probability Engine                          COMPLETE
W9  Live Data Feed Integration                         COMPLETE
W10 AWNING Escalation Engine                           COMPLETE
W11 Multi-Node Mesh Networking                         COMPLETE
W12 Distributed Coordination                           COMPLETE
W13 Predictive Threat Analysis                         COMPLETE
W14 Operator Dashboard                                 COMPLETE
W15 Mobile + Field Operations                          COMPLETE
W16 Edge Deployment Optimization                       COMPLETE
W17 Hackathon Demo Readiness                           COMPLETE
W18 EU Data Integration Layer                          PLANNED → EXECUTING
W19 Romania/EU Threat Intelligence Layer               ← THIS WAVE
W20 Operator Workflow + Regulatory Dispatch            FUTURE
W21 NATO/SMAp Coordination Interface                   FUTURE
```

---

## W19 Scope

### What W19 Builds

| FR | Component | Purpose |
|----|-----------|---------|
| FR-W19-01 | EasaCategoryClassifier | EASA UAS category → threat category (cat-a/b/c/d) |
| FR-W19-02 | ProtectedZoneBreachDetector | Haversine breach detection, ENTERING/INSIDE/EXITING |
| FR-W19-03 | ThreatScoringEngine | 0–100 score with proximity + category + weather + security |
| FR-W19-04 | EuAwningLevelAssigner | Zone-type-calibrated AWNING level (airport/nuclear/military/govt thresholds) |
| FR-W19-05 | GdprTrackAnonymiser | GDPR Art.5/6/22 pseudonymisation, 30s Cat-A timer, Cat-D exemption |
| FR-W19-06 | AacrNotificationFormatter | SIRA template for Romanian Civil Aviation Authority |
| FR-W19-07 | RomatsaCoordinationInterface | ICAO Doc 4444 ATC coordination for ROMATSA |
| FR-W19-08 | W19ThreatIntelPipeline | Orchestrator, EventEmitter, NATS publisher |

### What W19 Does NOT Build

- Operator UI (W20)
- AACR SIRA API integration / actual dispatch (W20)
- ROMATSA secure channel integration (W20)
- Supabase audit log (W20)
- NATO coordination protocol (W21)
- SMAp (Romanian General Staff) notification (W21)
- UAS operator self-registration portal (W20)
- Real-time map display (W20)
- Mobile app (W15 done, W20 extends)

---

## W19 Test Targets

| FR | Tests |
|----|-------|
| FR-W19-01 | 14 |
| FR-W19-02 | 13 |
| FR-W19-03 | 15 |
| FR-W19-04 | 12 |
| FR-W19-05 | 11 |
| FR-W19-06 | 10 |
| FR-W19-07 | 10 |
| FR-W19-08 | 13 |
| **Total** | **98** |

Post-W19 test count: 3097 (W1–W18) + 98 (W19) = **3195 tests GREEN** (minimum; W18 likely completes with 3097+156=3253 before W19 begins).

---

## W20 Dependencies (What W20 Needs from W19)

W20 is the Operator Workflow + Regulatory Dispatch wave. It depends entirely on W19 outputs:

### Required W19 Interface Contracts

| W19 Output | W20 Use |
|-----------|---------|
| `ThreatIntelPicture` | Full data model for operator dashboard |
| `ZoneBreach[]` with `breachType`, `ttBreachS` | Real-time breach map overlay, ETA countdown |
| `ZoneAwningState` map | Zone colour coding on dashboard |
| `AacrNotification[]` with all 7 SIRA fields | Direct SIRA API submission payload |
| `RomatsaCoordinationMessage[]` with `TLP:RED` | Secure channel dispatch to ROMATSA |
| `AnonymisedTrack[]` with `privacyBreachFlag` | GDPR-compliant position display |
| NATS `sentinel.intel.*` subjects | Event-driven UI updates |
| `operatorConfirmationRequired` flag | Human approval workflow trigger |

### W20 New FRs (indicative)

- FR-W20-01: OperatorDashboardBackend — serve ThreatIntelPicture via REST/WebSocket to UI
- FR-W20-02: AacrDispatchQueue — queue and dispatch AacrNotification to SIRA API
- FR-W20-03: RomatsaSecureChannel — VPN-based dispatch of RomatsaCoordinationMessage
- FR-W20-04: SupabaseAuditLogger — persist ThreatIntelPicture snapshots, breach events, notifications
- FR-W20-05: HumanApprovalWorkflow — operator review/confirm for ORANGE/RED AWNING events
- FR-W20-06: OperatorDashboardUI — React frontend for real-time zone monitoring
- FR-W20-07: PrivacyNoticePortal — public-facing UAS operator data subject rights portal
- FR-W20-08: W20EndToEndIntegration — pipeline W18→W19→W20 full integration test

### W20 Estimated Tests: ~90

---

## W21 Dependencies (What W21 Needs from W19)

W21 is the NATO/SMAp Coordination Interface. It extends W19's military zone handling:

| W19 Output | W21 Extension |
|-----------|---------------|
| `ZoneBreach.natoSensitive=true` | Triggers NATO liaison protocol |
| `AacrNotification` for military zones | Cross-filed to SMAp (Romanian General Staff) |
| `RomatsaCoordinationMessage` for LRCK (Kogălniceanu) | NATO SOFA coordination |
| `ThreatScore` for Deveselu breaches | NATO Ballistic Missile Defense system security |

W21 is estimated at Wave 21 (post-hackathon, post-demo, commercial phase).

---

## Timeline

```
2026-03-27  W19 documentation complete (this document)
2026-03-28  W18 implementation complete (156 tests GREEN, unblocks W19)
2026-03-29  W19 TDD RED phase: write all 98 failing tests
2026-03-30  W19 Execute phase: implement FR-W19-01 through FR-W19-07
2026-03-31  W19 Execute phase: implement FR-W19-08 (pipeline orchestrator)
2026-04-01  W19 Checkpoint: all 98 tests GREEN, no W1-W18 regressions
2026-04-02  W19 Complete: commit, push, tag v0.19.0
2026-04-03  W20 Init: start operator workflow documentation
```

Note: Timeline assumes W18 implementation completes on schedule. W19 cannot begin test implementation until W18 provides the `EuSituationalPicture` interface.

---

## Risk-Adjusted Roadmap

| Risk | Likelihood | Impact | Contingency |
|------|------------|--------|-------------|
| W18 delayed by feed API issues | Medium | W19 delayed 1-2 days | W19 can write tests against W18 mocks; unblock test writing |
| GDPR legal basis challenge | Low | Privacy architecture rework | Document pre-assessment (this doc); defer DPIA to W20 |
| AWNING threshold calibration needs tuning | Medium | W19-04 test changes | Use configurable thresholds; tests parameterised |
| AACR SIRA format change | Low | W19-06 reformatting | SIRA format is stable since 2019; minor risk |
| ROMATSA coordination requirement changes | Low | W19-07 message format change | Defer actual API integration to W20; W19 generates the struct only |

---

## Long-Term Vision Beyond W21

```
W19  Threat intelligence (this wave) — RULE-BASED
W22  Threat prediction ML — time-series threat trajectory (extends W13)
W23  Cross-border EU threat correlation — Eurocontrol SWIM feed integration
W24  Automated operator identification — D-Flight EASA registry cross-match
W25  Commercial SaaS: White-label threat intel for other EU ATC providers
```

APEX-SENTINEL's long-term commercial roadmap is:
1. Romania production deployment (W19–W20 deliverables)
2. EU market expansion via Eurocontrol SWIM federation (W23)
3. Commercial licensing to European airport operators (post W25)
