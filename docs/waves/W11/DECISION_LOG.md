# APEX-SENTINEL W11 — Decision Log

**Wave:** W11
**Date:** 2026-03-26

---

## DL-W11-01: Haversine for Spatial Correlation (not PostGIS)

**Decision**: Use in-memory haversine formula for 50km proximity check.
**Rationale**: No Supabase call overhead; W11 is real-time (< 100ms). PostGIS would require async DB call per detection event.
**Trade-off**: Only accurate to ~0.5% at mid-latitudes — acceptable for 50km radius.

## DL-W11-02: Dempster-Shafer for Multi-Source Fusion (not Bayesian)

**Decision**: Use simplified D-S combination rule.
**Rationale**: D-S handles uncertainty and ignorance explicitly; doesn't require prior probability estimates. Bayesian would require calibrated priors per sensor type — not yet available.
**Trade-off**: D-S is not commutative with > 2 sources naively; we apply pairwise left-fold.

## DL-W11-03: Ring Buffer 500 for AlertDedup (not LRU Cache)

**Decision**: Fixed-size ring buffer.
**Rationale**: Bounded memory, O(1) insertion. LRU would require Map + doubly-linked list.
**Trade-off**: Oldest alerts evicted regardless of recency when full. Acceptable at 500 entries (≈41h of 1/5min alerts).

## DL-W11-04: 0.1° Grid Resolution for SectorThreatMap

**Decision**: Grid cells at 0.1° latitude × 0.1° longitude.
**Rationale**: ~11km resolution. Matches GDELT event precision. Coarser than exact lat/lon — prevents fingerprinting specific locations.
**Trade-off**: Two detections 9km apart may or may not share a cell depending on placement.

## DL-W11-05: 15-Minute Half-Life for SectorThreatMap Decay

**Decision**: Exponential decay with 15-minute half-life.
**Rationale**: Drone operations typically 20-30 minutes. After 30 min (2 half-lives) count drops to 25% — still visible but de-emphasised.
**Trade-off**: Rapid drone incursions may decay before operator acknowledgment in low-update scenarios.

## DL-W11-06: No New npm Packages

**Decision**: All implementation uses `node:crypto`, `node:events`, TypeScript only.
**Rationale**: Security posture — zero new supply chain attack surface. Haversine, D-S, exponential decay all implementable in < 20 lines each.
