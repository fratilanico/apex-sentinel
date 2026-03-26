# APEX-SENTINEL W11 — Design Document
## OSINT Deep Fusion + Multi-Source Threat Correlation

**Wave:** W11
**Status:** PLANNED
**Date:** 2026-03-26

---

## 1. Problem Statement

W9 delivered live feed clients (ADS-B, civil protection, OSINT, weather, remote ID). W10 added NATO AWNING framework. However, the system lacks cross-feed intelligence fusion. Individual signals exist in isolation; no engine correlates GDELT events with acoustic detections, anomalous ADS-B behaviour with RF fingerprints, or builds a temporal composite threat picture.

W11 closes this gap: 8 focused components that fuse all signals into a coherent IntelBrief.

---

## 2. System Context

```
ADS-B ──────────────────────────────┐
RemoteID ────────────────────────── │
Acoustic ────────────────────────── ├──► AnomalyCorrelationEngine
CivilProtection ─────────────────── │
                                     │
GDELT ──────────────────────────── ─┤──► OsintCorrelationEngine
                                     │
AwningLevelPublisher ───────────── ─┤──► ThreatTimelineBuilder
                                     │
All above ──────────────────────── ─┼──► SectorThreatMap
                                     │
All above ──────────────────────── ─┴──► IntelligencePackBuilder
                                     │
4 sources ──────────────────────── ─►  MultiSourceConfidenceAggregator
                                     │
Alert stream ────────────────────── ►  AlertDeduplicationEngine
                                     │
NATS bus ───────────────────────── ─►  IntelligencePipelineOrchestrator
```

---

## 3. Design Principles

1. **Stateless correlation**: OsintCorrelationEngine and AnomalyCorrelationEngine are pure functions — no DB writes.
2. **Temporal decay**: Threat relevance decays with time (exponential for SectorThreatMap, linear weight for OSINT).
3. **Dempster-Shafer fusion**: MultiSourceConfidenceAggregator uses D-S combination — mathematically sound uncertainty handling.
4. **Ring-buffer dedup**: AlertDeduplicationEngine uses bounded ring buffer (max 500) — no unbounded memory growth.
5. **Pipeline orchestration via NATS**: IntelligencePipelineOrchestrator is the integration seam; components are independently testable.
6. **No new dependencies**: All implementation uses `node:crypto`, `node:events`, and existing TypeScript types.

---

## 4. Data Flow

```
NATS feed.fused
    │
    ▼
ThreatContextEnricher (W9)
    │
    ▼
detection.enriched
    │
    ├──► OsintCorrelationEngine  ──────┐
    ├──► AnomalyCorrelationEngine ─────┤
    ├──► ThreatTimelineBuilder ────────┤
    ├──► SectorThreatMap ───────────── ├──► IntelligencePackBuilder
    │                                  │        │
awning.alert                           │        ▼
    │                                  │    IntelBrief
    ├──► ThreatTimelineBuilder ────────┘        │
    │                                           ▼
    │                                   AlertDeduplicationEngine
    │                                           │
    │                                           ▼
    └───────────────────────────────────  intel.brief (NATS)
```

---

## 5. Key Algorithms

### 5.1 Spatial Correlation (Haversine)
OSINT events within 50km of detection coordinates trigger elevated context. Uses haversine formula: `d = 2R·arcsin(√(sin²(Δφ/2) + cos(φ₁)·cos(φ₂)·sin²(Δλ/2)))`.

### 5.2 Temporal Weight
- Last 6h → weight 1.0
- 6-24h → weight 0.5
- >24h → weight 0.0

### 5.3 Goldstein Scale Weighting
GDELT Goldstein scale < −5 → conflict event → 3× multiplier on correlation score.

### 5.4 Exponential Decay (SectorThreatMap)
`count(t) = count(t₀) · 0.5^((t − t₀) / 900000)` — half-life 15 min.

### 5.5 Dempster-Shafer Combination
For two mass functions m1, m2:
`K = Σ_{A∩B=∅} m1(A)·m2(B)` (conflict mass)
`(m1⊕m2)(C) = Σ_{A∩B=C} m1(A)·m2(B) / (1 − K)`
If K > 0.5: irreconcilable — return `{ combined: null, conflict: K }`.
