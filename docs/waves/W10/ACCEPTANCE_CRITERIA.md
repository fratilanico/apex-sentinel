# APEX-SENTINEL W10 — Acceptance Criteria

> Wave: W10 | Theme: NATO AWNING Framework Publisher + Stage 3.5 Trajectory Prediction
> Status: PLAN | Date: 2026-03-26

---

## FR-W10-01: AwningLevelPublisher

- AC-01-1: contextScore 0 → WHITE
- AC-01-2: contextScore 29 → WHITE
- AC-01-3: contextScore 30 → YELLOW
- AC-01-4: contextScore 59 → YELLOW
- AC-01-5: contextScore 60 → RED
- AC-01-6: contextScore 100 → RED
- AC-01-7: CivilProtection CRITICAL → RED (regardless of score)
- AC-01-8: Hysteresis — must stay elevated 2 readings before de-escalating
- AC-01-9: Publishes to NATS `awning.level` subject

---

## FR-W10-02: StageClassifier

- AC-02-1: acoustic ≥ 0.75, no RF → Stage 1
- AC-02-2: acoustic < 0.75 → no stage (below threshold)
- AC-02-3: acoustic ≥ 0.75 + RF match → Stage 2
- AC-02-4: Stage 2 + ADS-B correlated → Stage 3
- AC-02-5: Stage 2 + RemoteID within 500m → Stage 3
- AC-02-6: Stage result includes confidence and evidence list

---

## FR-W10-03: Stage35TrajectoryPredictor

- AC-03-1: Returns predictions at 30s, 60s, 120s
- AC-03-2: Prediction struct has lat, lon, altM, confidenceRadius_m, tSeconds
- AC-03-3: confidenceRadius_m grows with horizon
- AC-03-4: EKF converges after 3+ position updates (radius < 500m)
- AC-03-5: reset() clears state
- AC-03-6: Linear trajectory reproduced correctly on constant-velocity input

---

## FR-W10-04: PredictiveGapAnalyzer

- AC-04-1: Grid cells are 0.1° resolution
- AC-04-2: Cell > 3.5km from nearest node → isBlindSpot=true
- AC-04-3: Blind spot + OSINT events > 0 → risk MEDIUM
- AC-04-4: Blind spot + OSINT events > 2 → risk HIGH
- AC-04-5: Cell within 3.5km of node → isBlindSpot=false

---

## FR-W10-05: NatoAlertFormatter

- AC-05-1: alertId matches `AWNING-{YYYYMMDD}-{seq:04d}` pattern
- AC-05-2: alertId increments monotonically per session
- AC-05-3: summary contains awningLevel, stage, droneType
- AC-05-4: trajectory format: "ETA {t}s, impact zone {lat},{lon} ±{r}m"
- AC-05-5: ts is ISO-8601

---

## FR-W10-06: AlertThrottleGate

- AC-06-1: Level change within 30s → blocked (shouldAllow=false)
- AC-06-2: Level change after 30s → allowed (shouldAllow=true)
- AC-06-3: RED requires 3 consecutive non-RED before de-escalation
- AC-06-4: Escalation to RED is immediate (no debounce)
- AC-06-5: History ring buffer max 10 entries

---

## FR-W10-07: StageTransitionAudit

- AC-07-1: Entries are Object.frozen (cannot mutate fields)
- AC-07-2: Ring buffer evicts oldest when > 1000 entries
- AC-07-3: replay() returns entries in chronological order
- AC-07-4: replay(fromTs, toTs) filters correctly
- AC-07-5: size() returns current entry count

---

## FR-W10-08: AwningIntegrationPipeline

- AC-08-1: HIGH contextScore detection → RED alert published to `awning.alert`
- AC-08-2: CivilProtection CRITICAL override fires correctly through pipeline
- AC-08-3: Trajectory included in alert when positions provided
- AC-08-4: De-escalation sequence produces WHITE after 3 low-score detections
- AC-08-5: Alert ID increments across pipeline calls

---

## Wave Completion Gate

- `npx vitest run --project p2` — all W10 tests GREEN
- Zero TypeScript errors (`npx tsc --noEmit`)
- Coverage ≥ 80% all metrics
- Git commit includes all 16 files (8 src + 8 test)
