# W20 ROADMAP — Operator Workflow Engine

## Wave Sequence Context

```
W1–W8:   Sensor layer (RF, acoustic, mesh, feeds)
W9–W12:  Detection and tracking (RF mesh, ML, correlation)
W13–W15: Output layer (Telegram, Dashboard SSE, Audit Logger)
W16:     System hardening (boot, health, memory, OTA)
W17:     Audio sampling standards (22050Hz → 16kHz compliance)
W18:     Resilience (failover, reconnect, graceful degradation)
W19:     Threat intelligence synthesis (ThreatIntelPicture, AWNING, AACR notifications)
W20:     Operator Workflow Engine (THIS WAVE)
W21:     Production UI (browser-based operator dashboard)
W22:     Advanced analytics and ML-enhanced incident grouping
W23:     Customer portal and multi-tenant onboarding
```

---

## W20 Delivery Timeline

### Phase 1: Core FSM (Days 1–2)
- FR-W20-01 AlertAcknowledgmentEngine with full FSM
- FR-W20-05 SlaComplianceTracker
- 24 tests RED → GREEN
- Commit: `feat(W20): alert FSM + SLA tracker`

### Phase 2: Incident and Escalation (Days 3–4)
- FR-W20-02 IncidentManager with sliding window correlation
- FR-W20-03 EscalationMatrix with all 4 zone chains
- 26 tests RED → GREEN
- Commit: `feat(W20): incident manager + escalation matrix`

### Phase 3: Audit and Handover (Days 5–6)
- FR-W20-06 AuditTrailExporter with SHA-256 hash chain
- FR-W20-04 OperatorShiftHandover
- 21 tests RED → GREEN
- Commit: `feat(W20): audit trail exporter + shift handover`

### Phase 4: Multi-Site and Pipeline (Day 7)
- FR-W20-07 MultiSiteOperatorView
- FR-W20-08 W20OperatorWorkflowPipeline
- 25 tests RED → GREEN
- Commit: `feat(W20): multi-site view + workflow pipeline`

### Phase 5: Integration and Polish (Day 8)
- Integration tests with W19 ThreatIntelPicture mock
- W13/W14/W15 event wiring verification
- GDPR erasure implementation
- All 96 tests GREEN
- Commit: `feat(W20): wave complete — 96 tests GREEN`

---

## Milestone Gates

| Milestone | Criteria | Target Date |
|-----------|---------|-------------|
| W20 TDD-RED | 96 failing tests committed | Day 1 |
| Phase 1 GREEN | 24/96 tests passing | Day 2 |
| Phase 2 GREEN | 50/96 tests passing | Day 4 |
| Phase 3 GREEN | 71/96 tests passing | Day 6 |
| Phase 4 GREEN | 96/96 tests passing | Day 7 |
| W20 COMPLETE | All tests GREEN, W21 handoff ready | Day 8 |

---

## Dependencies

### Upstream (must be stable before W20)
| Dependency | Wave | What W20 needs |
|------------|------|---------------|
| ThreatIntelPicture type | W19 | ZoneBreach[], AwningLevel, AacrNotification[] |
| AuditEventLogger | W15 | appendEvent() interface |
| SystemHealthDashboard | W16 | NATS publish pattern (W20 adds workflow.state) |
| TelegramBot | W13 | sendMessage() for escalation and handover |
| DashboardSSE | W14 | event push for workflow state updates |

### Downstream (W20 must provide before these waves)
| Consumer | Wave | What they need |
|----------|------|---------------|
| Production UI | W21 | OperatorWorkflowState type, all API methods |
| Analytics | W22 | SlaRecord[], IncidentReport[], AuditEntry[] |

---

## Risk Timeline

| Risk | Impact | Mitigation | Deadline |
|------|--------|------------|---------|
| SLA computation drift due to clock skew on edge device | HIGH | Use monotonic Date.now() with NTP sync; add ±1s tolerance in tests | Phase 1 |
| Escalation Telegram delivery failure | HIGH | Event queue with retry; W18 resilience patterns | Phase 3 |
| Hash chain performance at scale | MEDIUM | Benchmark at 10k entries; use streaming SHA-256 if needed | Phase 3 |
| W21 UI interface contract mismatch | MEDIUM | Lock OperatorWorkflowState type before W21 starts | Phase 4 |

---

## Post-W20 Roadmap (W21+)

### W21: Production UI
- Browser-based operator dashboard
- Real-time OperatorWorkflowState rendered via W14 SSE
- Click-to-acknowledge, investigate, resolve
- Multi-site map view (Leaflet.js, Romanian protected zones)
- Export audit trail from UI (GDPR Art.15 self-service)

### W22: Analytics Layer
- Historical incident trend charts
- SLA compliance heatmap per zone
- Operator response time analytics (anonymized)
- ML-based incident cluster validation

### W23: Multi-Tenant Customer Portal
- Customer-facing dashboard (airport operators, nuclear supervisors)
- Role-based access control (RBAC) per zone
- White-label for DTaaS customers
- Billing integration with W0 subscription model

### W24 (post-hackathon): AI Enhancements
- LLM-generated incident narratives for AACR submissions
- Anomaly detection on operator response patterns (alert fatigue early warning)
- Predictive escalation (predict SLA breach before it happens)

---

## EUDIS Hackathon Demo Relevance

W20 is the primary demo layer for the EUDIS hackathon presentation (March 28, 2026). The live demo will show:
1. Simulated drone detection → Alert appears on operator terminal
2. 30-second SLA countdown → operator acknowledges
3. Incident groups two correlated alerts
4. AWNING RED → escalation chain triggers → AACR notification shown
5. Shift handover generated → Telegram message sent live
6. Audit trail exported → hash chain verified live

W20 must be GREEN before demo day (March 28, 2026).
