# APEX-SENTINEL W11 — AI Pipeline

**Wave:** W11
**Date:** 2026-03-26

---

## AI/ML Components in W11

W11 does not introduce new ML models. It uses deterministic algorithms for fusion:

| Algorithm | Location | Type |
|-----------|----------|------|
| Haversine distance | OsintCorrelationEngine | Geometry |
| Temporal weight decay | OsintCorrelationEngine | Deterministic |
| Goldstein scale weighting | OsintCorrelationEngine | Rule-based |
| Transponder-off detection | AnomalyCorrelationEngine | Rule-based |
| Altitude drop terminal | AnomalyCorrelationEngine | Rule-based |
| Exponential decay | SectorThreatMap | Mathematical |
| Dempster-Shafer combination | MultiSourceConfidenceAggregator | Probabilistic |

---

## Fusion Pipeline (Non-ML)

```
Raw Events
    │
    ▼
[Spatial Filter]    haversine < 50km
    │
    ▼
[Temporal Filter]   age < 24h
    │
    ▼
[Weight Assignment] goldstein + temporal
    │
    ▼
[D-S Combination]   multi-source belief fusion
    │
    ▼
IntelBrief
```

---

## Future AI Integration Points (W12+)

- **Trajectory ML**: Replace Stage35TrajectoryPredictor rule-based logic with LSTM
- **Anomaly scoring**: Replace rule-based AnomalyCorrelationEngine with isolation forest
- **OSINT NLP**: Parse GDELT event descriptions with lightweight transformer for intent classification
- **Threat level ML**: Replace AWNING rule bands with gradient-boosted classifier trained on historical confirmed threat data
