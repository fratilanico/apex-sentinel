# APEX-SENTINEL W10 — API Specification

> Wave: W10 | Theme: NATO AWNING Framework Publisher + Stage 3.5 Trajectory Prediction
> Status: PLAN | Date: 2026-03-26

---

## NATS Subjects

### Input: `detection.enriched`
Payload: `EnrichedDetection` (from W9 ThreatContextEnricher)

### Output: `awning.level`
```json
{
  "level": "WHITE" | "YELLOW" | "RED",
  "contextScore": 45,
  "ts": "2026-03-26T12:00:00.000Z"
}
```

### Output: `awning.alert`
```json
{
  "alertId": "AWNING-20260326-0001",
  "awningLevel": "RED",
  "stage": 3,
  "droneType": "Shahed-136",
  "trajectory": [
    { "lat": 45.123, "lon": 26.456, "altM": 150, "confidenceRadius_m": 120, "tSeconds": 30 },
    { "lat": 45.198, "lon": 26.521, "altM": 148, "confidenceRadius_m": 240, "tSeconds": 60 },
    { "lat": 45.349, "lon": 26.651, "altM": 144, "confidenceRadius_m": 480, "tSeconds": 120 }
  ],
  "ts": "2026-03-26T12:00:00.000Z",
  "summary": "AWNING RED | Stage 3 | Shahed-136 | ETA 30s, impact zone 45.123,26.456 ±120m"
}
```

---

## Class APIs

### AwningLevelPublisher
```typescript
constructor(nats: NatsClient)
deriveLevel(contextScore: number, civilProtectionLevel?: string): AwningLevel
publish(level: AwningLevel, contextScore: number): void
getHistory(): AwningLevel[]
```

### StageClassifier
```typescript
constructor()
classify(detection: DetectionInput): StageResult
```

### Stage35TrajectoryPredictor
```typescript
constructor()
update(fix: PositionFix): void
predict(horizons?: number[]): TrajectoryPrediction[]
reset(): void
```

### PredictiveGapAnalyzer
```typescript
constructor(nodes: NodePosition[])
computeGrid(bbox: BoundingBox, cellDeg?: number): GridCell[]
flagHighRiskGaps(grid: GridCell[], osintEvents: OsintEvent[]): GridCell[]
```

### NatoAlertFormatter
```typescript
constructor()
format(level: AwningLevel, stage: StageResult, droneType: string, trajectory?: TrajectoryPrediction[]): AwningAlert
formatSummary(alert: AwningAlert): string
reset(): void
```

### AlertThrottleGate
```typescript
constructor(debounceMs?: number, deEscalationCount?: number)
shouldAllow(newLevel: AwningLevel, nowMs?: number): boolean
record(level: AwningLevel, nowMs?: number): void
getHistory(): LevelHistoryEntry[]
```

### StageTransitionAudit
```typescript
constructor(maxEntries?: number)
record(from: Stage | null, to: Stage, evidence: string[], operatorId?: string): AuditEntry
replay(fromTs?: string, toTs?: string): AuditEntry[]
size(): number
```

### AwningIntegrationPipeline
```typescript
constructor(nats: NatsClient)
start(): void
stop(): void
processDetection(enriched: EnrichedDetection): AwningAlert | null
```
