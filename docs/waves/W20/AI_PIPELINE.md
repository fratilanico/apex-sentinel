# W20 AI PIPELINE — Operator Workflow Engine

## AI Role in W20

W20 is primarily a deterministic workflow engine. AI/ML components from W1–W19 feed into it as upstream producers; W20 itself does not perform inference. However, W20 interacts with AI outputs in two significant ways:

1. **Consuming AI outputs** from upstream waves (threat scores, AWNING levels, acoustic classifications)
2. **AI-assisted operator decision support** — future W21+ feature, but W20 lays the data foundation

---

## Upstream AI Pipeline Inputs to W20

### Input 1: ThreatScore (from W19 Fusion Engine)

```
W3 RF Fingerprinter  ──┐
W5 Acoustic Classifier ──┤──► W19 ThreatFusionEngine ──► ThreatScore (0.0–1.0)
W6 Payload Estimator ──┤
W11 ML ThreatMatrix  ──┘
```

**W20 usage:** ThreatScore populates `Alert.threatScore`. Thresholds for AWNING level are pre-computed by W19 — W20 does not re-evaluate. W20 trusts W19's output as ground truth.

**AI uncertainty handling:** W19 includes confidence intervals (p10/p50/p90). W20 stores the p50 as `threatScore` and tags alerts with `threatVector` metadata listing which sensors contributed.

### Input 2: AwningLevel (from W19)

AWNING levels (CLEAR/YELLOW/ORANGE/RED) are deterministic thresholds applied to ThreatScore by W19. W20 uses AwningLevel directly for:
- SLA deadline computation
- Escalation chain trigger evaluation
- Zone health score penalty

### Input 3: AacrNotification / RomatsaCoordinationMessage (from W19)

Pre-formatted regulatory notifications from W19 are attached to Alerts via `Alert.metadata`. W20 tracks whether these have been dispatched (via `Alert.aacrNotificationRequired` flag and SLA timer for 15min notification window).

---

## AI-Driven Components in W20

### Component 1: Alert Clustering (IncidentManager)

**Not ML** — deterministic sliding window algorithm. But note: the 10-minute window was derived from statistical analysis of W1–W16 test data showing 94th percentile of correlated drone events completing within 8.3 minutes. This is a data-driven parameter, not an arbitrary constant.

**Future AI hook:** IncidentManager.correlate() signature is designed to accept an optional `scoringFn: (alerts: Alert[]) => number` parameter for ML-based incident grouping in W22+.

### Component 2: Escalation Threshold Calibration

**Current:** Static thresholds (SLA breach durations) per zone type.

**Future AI hook (W22+):** EscalationMatrix could accept a `calibrator: EscalationCalibrator` interface for ML-driven threshold adjustment based on operator response history and false positive rate.

---

## AI Testing Interfaces (W_AI_TESTING_LAYER integration)

W20 workflow outputs feed directly into the AI testing infrastructure established in W_AI_TESTING_LAYER (March 2026):

### Metamorphic Testing Integration

W20 exposes `AlertAcknowledgmentEngine.getTransitionHistory()` for metamorphic test verification:
- MR1: Same alert acknowledged by operator A or operator B → same SlaRecord result (operator identity must not affect SLA computation)
- MR2: Increasing ThreatScore for identical zone → AWNING level monotonically non-decreasing
- MR3: Alert acknowledged after SLA deadline → always produces SLA_BREACH result

### Non-Determinism Tolerance

W20 FSM transitions are deterministic. However, shift handover timing depends on system clock. Tests use a `clockFn: () => number` injectable (default: `Date.now`) for deterministic test control.

### Regulatory Compliance Integration

W20 AuditTrailExporter is a primary data source for the `regulatory-compliance.test.cjs` suite (RC-01 through RC-10). The hash chain provides the tamper-evident audit trail required for GDPR Art.22 explanation capability and EU AI Act Art.13 transparency.

---

## AI Decision Transparency Requirements

Per EU AI Act Art.13 (transparency for high-risk AI systems), APEX-SENTINEL is classified as a **high-risk AI system** (Annex III, §6: AI systems used in law enforcement). W20 must:

1. **Record which AI models contributed** to each Alert's ThreatScore — stored in `Alert.metadata.threatVector`
2. **Provide human override capability** — operators can override any AI-generated AWNING level via the dashboard (logged in AuditEntry)
3. **Maintain model version tracking** — each Alert records the APEX-SENTINEL version at detection time (from ConfigurationManager W16)
4. **Explainable escalation** — EscalationMatrix.getEscalationChain() returns the full human-readable rationale for any escalation trigger

---

## AI Quality Metrics (from W_AI_TESTING_LAYER)

W20 consumes and tracks the following upstream AI quality metrics:

| Metric | Source | W20 usage |
|--------|--------|----------|
| ThreatScore precision | W11 ML | Alert.metadata validation |
| False positive rate | SlaComplianceTracker | outcome='FALSE_POSITIVE' count |
| Acoustic classification confidence | W5 | Alert.metadata.acousticConfidence |
| RF fingerprint match score | W3 | Alert.metadata.rfMatchScore |
| Fusion model version | W19 | Alert.metadata.fusionModelVersion |

---

## Post-W20 AI Enhancement Roadmap

| Wave | Enhancement |
|------|------------|
| W21 | Operator fatigue detection — alert acknowledgment latency drift detection |
| W22 | ML-based incident grouping (replace sliding window with learned clustering) |
| W23 | Escalation outcome prediction — which escalations lead to drone confirmed? |
| W24 | Natural language incident reports — LLM-generated AACR submission narratives |
