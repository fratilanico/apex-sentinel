# AI_QUALITY_VECTOR — Wave 9

**Project:** APEX-SENTINEL
**Wave:** W9 — Live Data Feed Integration
**Date:** 2026-03-26
**Governed by:** `.agents/skills/apex-testing-protocol/SKILL.md` § AI System Testing Standards

---

## AI Components in This Wave

| Component | Type | Non-Determinism | Risk Level |
|-----------|------|----------------|------------|
| `ThreatContextEnricher` | Deterministic rule-based weighted scorer | None — deterministic | MEDIUM (scores feed alert decisions) |
| `DataFeedBroker` | Deterministic SHA-256 aggregator | None | LOW |
| `AdsbExchangeClient` | Deterministic data parser | None | MEDIUM (external untrusted data) |
| `CivilProtectionClient` | Deterministic alert normalizer | None | HIGH (AWNING level computation) |
| `RemoteIdReceiver` | Deterministic beacon parser | None | MEDIUM (ASTM F3411 data) |
| `AcousticProfileLibrary` (IEC 61508 gate) | Safety gate (deterministic) | None | CRITICAL (SIL-2) |

---

## Oracle Strategy (P5-01)

### Primary Oracle: Metamorphic Relations

ThreatContextEnricher is a deterministic scorer — ground truth is unknowable for live detections.
Metamorphic relations provide a rigorous oracle without requiring labeled ground truth.

**Implemented MRs** (all in `infra/__tests__/sentinel-w9-enricher-metamorphic.test.cjs`):

| MR | Relation | Type |
|----|----------|------|
| MR-01 | Adding CRITICAL alert never decreases score | Monotonicity |
| MR-02 | CRITICAL(40) > ADS-B(30) > RemoteID(20) > OSINT(10) | Dominance / Ordering |
| MR-03 | Score always in [0, 100] | Boundedness |
| MR-04 | Multiple CRITICAL alerts = single CRITICAL (no double-count) | Additivity |
| MR-05 | Same input → same score across 5 runs | Consistency oracle |
| MR-06 | Independent sources accumulate without interaction | Independence |
| MR-07 | Empty context produces score = 0 | Neutrality |
| MR-08 | Full evidence score ≥ partial evidence score | Subset constraint |

### Secondary Oracle: Adversarial Robustness (Implicit)

Adversarial inputs from `infra/__tests__/sentinel-w9-feeds-adversarial.test.cjs` serve as
implicit robustness oracle: the system must not crash, produce NaN/Infinity, or generate
phantom threat scores from adversarial feed data.

---

## Non-Determinism Tolerance (P5-04)

| Component | Non-Determinism? | SLA |
|-----------|-----------------|-----|
| ThreatContextEnricher | None — deterministic | 100% consistent (MR-05 verified) |
| DataFeedBroker (SHA-256 dedup) | None — deterministic hash | 100% idempotent (ADV-07 verified) |
| AcousticML classifier (W7-W8) | Deterministic stub in tests | Real model: run 10×, ≥90% within ±0.05 of median |
| TerminalPhaseDetector | Deterministic threshold | 100% consistent on same telemetry |

**Rule:** Safety-critical classifiers (TerminalPhaseDetector, AcousticML, IEC 61508 gate)
are deterministic or must be. No tolerance for non-determinism in safety paths.

---

## Adversarial Robustness Coverage (P5-05)

File: `infra/__tests__/sentinel-w9-feeds-adversarial.test.cjs`

| Test | Attack Vector | Coverage |
|------|--------------|----------|
| ADV-01 | NaN/Infinity ADS-B coordinates | Coordinate poisoning |
| ADV-02 | Non-octal squawk, SQL injection in squawk field | Fake emergency injection |
| ADV-03 | 1000 msg/s burst (5× bucket capacity) | DoS via oversized array |
| ADV-04 | Null/undefined alert level fields | NULL propagation |
| ADV-05 | XSS in ICAO24, undersized ICAO24 | Tracking data injection |
| ADV-06 | Cyrillic homoglyph in 'CRITICAL', whitespace-only level | Unicode spoofing |
| ADV-07 | Duplicate payload detection | Dedup bypass attempt |
| ADV-08 | Score > 100 via over-contribution | Score overflow |
| ADV-09 | Null bytes, oversized UAS ID, empty UAS ID | ASTM F3411 injection |
| ADV-10 | NaN/Infinity/0 weather values | Range calculator distortion |

---

## Bias and Fairness (P5-06 / P5-07)

**NOT APPLICABLE** — W9 components do not score, rank, or classify humans.
ThreatContextEnricher classifies airspace threat levels (drones, aircraft, alert zones),
not human subjects. EU AI Act Art.10 does not apply to this use case.
GDPR Art.22 automated decision-making does not apply.

---

## Production Drift Alert (P5-08)

W9 components are deterministic rule-based systems — concept drift is not applicable
in the ML sense. However, the following drift signals are monitored:

| Signal | Alert Threshold | Method |
|--------|----------------|--------|
| Feed availability (ADS-B lol API) | >5 consecutive failures | `AdsbExchangeClient` error counter |
| Alert API response time | >25s cache timeout exceeded | `CivilProtectionClient` cache miss rate |
| DataFeedBroker dedup rate | >80% duplicates in a 5min window | Suggests feed polling bug |
| ThreatContextEnricher timeout | >200ms enrichment → score=-1 | LiveFeedAdapter SSE event with `contextScore=-1` |

---

## Baseline Refresh Policy (P5-09)

W9 has no ML models with baselines (all deterministic). Refresh policy for upstream W7-W8 ML:

- When `AcousticProfileLibrary` model version changes → re-run sentinel-acoustic-ml.test.cjs
- When IEC 61508 `promoteModel()` gate produces a new ModelHandle → re-run W8-10 tests
- When INDIGO team provides new acoustic profiles → extend SA-02 spectral gate tests

---

## Automation Bias in UAT (P5-10)

SENTINEL presents enriched detections to human operators. The following automation bias
safeguards are documented for UAT:

1. **Human override path**: operators can override `intervention_required=true` from TerminalPhaseDetector
2. **AI error path**: `contextScore=-1` (enrichment timeout) must trigger operator review, not auto-dismiss
3. **Disagreement scenario**: when ThreatContextEnricher score conflicts with acoustic confidence → show both, require human decision at threshold 0.75

---

## Test File Inventory

| File | What it tests | P5 checks |
|------|--------------|-----------|
| `infra/__tests__/sentinel-acoustic-ml.test.cjs` | Acoustic ML pipeline SA-01–SA-10 (32 tests) | P5-01 (oracle), P5-04, P5-05 |
| `infra/__tests__/sentinel-w9-feeds-adversarial.test.cjs` | W9 feed adversarial ADV-01–ADV-10 (33 tests) | P5-05 |
| `infra/__tests__/sentinel-w9-enricher-metamorphic.test.cjs` | ThreatContextEnricher MR-01–MR-08 (19 tests) | P5-01, P5-04, P5-05 |
| `infra/__tests__/data-pipeline-integration.test.cjs` | Data pipeline DPI-01–DPI-10 (21 tests) | P5-03 |

**Total AI testing tests:** 32 + 33 + 19 + 21 = **105 tests — all GREEN**

---

## P5 Gate Status

| Check | Status | Evidence |
|-------|--------|---------|
| P5-01: Oracle strategy defined | ✅ PASS | MR-01–MR-08 metamorphic + SA adversarial implicit oracle |
| P5-02: Canary baselines present | ✅ PASS | sentinel-acoustic-ml.test.cjs SA-01–SA-10 are canary tests |
| P5-03: run_meta provenance logged | ✅ PASS | DPI-09 guards created_at invariant; run_meta schema validated |
| P5-04: Non-determinism tolerance documented | ✅ PASS | All W9 components deterministic; MR-05 consistency oracle |
| P5-05: Adversarial robustness tests present | ✅ PASS | ADV-01–ADV-10 (33 tests) cover all user-facing AI inputs |
| P5-06: BIAS_ANALYSIS.md | N/A | W9 does not score/classify humans |
| P5-07: Four-fifths rule | N/A | No employment-adjacent scoring |
| P5-08: Production drift alert configured | ✅ PASS | 4 drift signals documented + alerting patterns |
| P5-09: Baseline refresh policy documented | ✅ PASS | See section above |
| P5-10: Automation bias addressed in UAT | ✅ PASS | 3 UAT scenarios documented |

**PLANE 5 STATUS: GREEN (8/8 applicable checks pass)**
