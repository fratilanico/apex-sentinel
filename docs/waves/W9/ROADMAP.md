# W9 — ROADMAP
Wave 9: Live Data Feed Integration | APEX-SENTINEL | 2026-03-26

---

## Completed Waves

| Wave | Theme | Tests | Status |
|---|---|---|---|
| W1 | Core acoustic pipeline, AcousticProfileLibrary | ~80 | COMPLETE |
| W2 | YAMNetFineTuner, FalsePositiveGuard | ~100 | COMPLETE |
| W3 | DatasetPipeline (22050Hz), MultiNodeFusion | ~120 | COMPLETE |
| W4 | MonteCarloPropagator, EdgeDeployer RPi4/Jetson | ~150 | COMPLETE |
| W5 | SentinelPipeline, CursorOfTruth | ~160 | COMPLETE |
| W6 | BRAVE1Format, W6 complete suite | 629 | COMPLETE |
| W7 | 16kHz pipeline migration, Gerbera/Shahed profiles, TerminalPhaseDetector | ~400 | COMPLETE |
| W8 | Backlinks + template layer, AI testing layer | 1860 | COMPLETE (10/12 FRs, W8.2 deferred) |

---

## W9 (Current Wave)

**Theme:** Live Data Feed Integration

**Scope:** 8 Functional Requirements, 128 tests target

**Modules:** AdsbExchangeClient, OpenMeteoClient, CivilProtectionClient, GdeltClient, RemoteIdReceiver, DataFeedBroker, ThreatContextEnricher, DemoDashboardApi live feed adapter

**Key deliverable:** First wave where APEX-SENTINEL ingests real-world operational data feeds and enriches detection events with external context.

---

## Future Waves

### W10 — OSINT Deepening
- GDELT NLP event classification (drone/UAV/attack taxonomy)
- Telegram monitoring (public channels, keyword alerts)
- Social corroboration layer: cross-reference GDELT + Telegram + civil alerts for convergence scoring
- Target: ~150 tests

### W11 — RF / Spectrum
- RTL-SDR pipeline integration (software-defined radio)
- ACARS message parsing (aircraft data link)
- Spectrum anomaly detection (jamming signatures, FPV frequency monitoring — ELRS 900MHz confirmed Russian FPV RF link)
- Target: ~160 tests

### W12 — Infrastructure Correlation
- GridStatus EU integration (power grid anomalies)
- ENTSO-E data feed (European grid operator data)
- FAA NOTAM parsing (Notice to Air Missions)
- Satellite pass correlation (for coverage gap analysis)
- Target: ~120 tests

### W13 — ML Fusion Layer
- Replace W9 deterministic ThreatContextEnricher scorer with trained classifier
- Multi-source confidence scoring
- Corroboration matrix: acoustic + RF + ADS-B + weather + OSINT joint probability
- Training data: `detection_enriched.feed_context_json` rows from W9+
- Target: ~200 tests

### W14 — AgentDB Persistent Memory
- Threat pattern library (persistent across sessions)
- Historical detection clustering
- Anomaly baseline learning per node per time-of-day
- Target: ~150 tests

### W15 — AWNING Publisher + C2 Interface
- AWNING WHITE/YELLOW/RED publisher (structured alert output)
- C2 JSON interface (command-and-control integration)
- Webhook delivery to operator dashboards
- Target: ~120 tests

### W16 — Stage 3.5 Trajectory-to-Zone
- Sensitive zone polygon registry (military, civilian infrastructure, protected areas)
- 30/60/90-second trajectory prediction to zone intersection
- Alert escalation based on projected zone entry time
- Target: ~180 tests

### W17 — Predictive Gap Analysis
- Dead zone modeling (acoustic + RF coverage gaps)
- Sensor placement optimization recommendations
- Coverage heatmap generation
- Target: ~100 tests

### W18 — NATO Compliance Audit + EUDIS Production Sign-off
- Full NATO STANAG compliance audit
- EUDIS production certification review
- Security penetration test scope
- Final documentation for operational deployment
- Target: ~60 tests + audit artifacts

---

## Test Count Trajectory

| Wave | Cumulative Tests |
|---|---|
| W8 complete | 1,860 |
| W9 (+128) | 1,988 |
| W10 (+150) | 2,138 |
| W11 (+160) | 2,298 |
| W12 (+120) | 2,418 |
| W13 (+200) | 2,618 |
| W14 (+150) | 2,768 |
| W15 (+120) | 2,888 |
| W16 (+180) | 3,068 |
| W17 (+100) | 3,168 |
| W18 (+60) | 3,228 |
