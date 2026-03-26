# APEX-SENTINEL W10 — Design Document

> Wave: W10 | Theme: NATO AWNING Framework Publisher + Stage 3.5 Trajectory Prediction
> Status: PLAN | Date: 2026-03-26

---

## Vision

W10 closes the operational loop by publishing structured NATO-aligned threat levels to operators and command systems. W1-W9 built detection (acoustic/RF/ADS-B correlation, 1860+ tests, 96%+ coverage), enrichment (ThreatContextEnricher, contextScore 0-100), and live data feeds. W10 takes enriched detections and converts them into:

1. **AWNING Levels**: WHITE / YELLOW / RED — the NATO operational threat taxonomy for airspace defense.
2. **Stage Classification**: Stage 1 (acoustic only), Stage 2 (acoustic + RF), Stage 3 (multi-sensor confirmed).
3. **Stage 3.5 — Trajectory Prediction**: Extended Kalman Filter intercept-point prediction at 30s/60s/120s.
4. **Coverage Gap Analysis**: Predictive blind-spot identification against historical OSINT events.
5. **Alert Throttling + Audit**: De-bounce, hysteresis, immutable audit trail for after-action review.

---

## AWNING Framework

```
contextScore 0-29   → AWNING WHITE  (no threat)
contextScore 30-59  → AWNING YELLOW (potential threat, monitoring)
contextScore 60-100 → AWNING RED    (confirmed threat, intervention)

Override: CivilProtection alert CRITICAL → always AWNING RED
Hysteresis: must stay elevated 2 consecutive readings before de-escalation
```

---

## Stage Classification

```
Stage 1: acoustic confidence ≥ 0.75, no RF correlation
Stage 2: acoustic confidence ≥ 0.75 AND RF fingerprint match
Stage 3: Stage 2 + ADS-B correlation OR RemoteID beacon within 500m
```

---

## Stage 3.5 — EKF Trajectory Prediction

Input: sequence of (lat, lon, altMeters, ts) position fixes.

EKF state vector: [lat, lon, altM, vLat, vLon, vAlt]
- Process model: constant velocity
- Measurement: position only
- Output: predicted intercept point at t+30s, t+60s, t+120s
- Confidence radius grows with time horizon and process noise

Impact zone: circular area, radius = confidenceRadius_m.

---

## Component Map

```
detection.enriched (NATS)
        │
        ▼
  StageClassifier ──────────────────────────────────┐
        │                                            │
        ▼                                            ▼
AwningLevelPublisher                 Stage35TrajectoryPredictor
        │                                            │
        ▼                                            ▼
AlertThrottleGate              PredictiveGapAnalyzer
        │
        ▼
NatoAlertFormatter ──→ awning.alert (NATS)
        │
        ▼
StageTransitionAudit (ring buffer, immutable)
```

---

## Key Design Decisions

- No new npm dependencies: EventEmitter + crypto only.
- EKF implemented in pure TypeScript (no numeric library).
- Coverage grid: 0.1° cells, Haversine distance.
- Alert ID format: `AWNING-{YYYYMMDD}-{seq:04d}`.
- De-escalation: 3 consecutive non-RED readings (AlertThrottleGate).
- Audit ring buffer: 1000 entries, immutable after write.
