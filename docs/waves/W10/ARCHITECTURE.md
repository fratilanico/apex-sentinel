# APEX-SENTINEL W10 — Architecture Document

> Wave: W10 | Theme: NATO AWNING Framework Publisher + Stage 3.5 Trajectory Prediction
> Status: PLAN | Date: 2026-03-26

---

## Layer Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    NATS Message Bus                          │
│  detection.enriched ──► awning.level ──► awning.alert       │
└──────────────────────────────────────────────────────────────┘
         │                    │                   │
         ▼                    ▼                   ▼
  AwningIntegrationPipeline (FR-W10-08)
         │
         ├──► StageClassifier (FR-W10-02)
         │         └──► Stage35TrajectoryPredictor (FR-W10-03)
         │
         ├──► AwningLevelPublisher (FR-W10-01)
         │         └──► AlertThrottleGate (FR-W10-06)
         │
         ├──► NatoAlertFormatter (FR-W10-05)
         │         └──► PredictiveGapAnalyzer (FR-W10-04)
         │
         └──► StageTransitionAudit (FR-W10-07)
```

---

## Module Responsibilities

### src/nato/awning-level-publisher.ts
- Maps contextScore → AWNING level
- Handles CivilProtection CRITICAL override
- Hysteresis: 2-reading hold before de-escalation
- Publishes to `awning.level` NATS subject

### src/nato/stage-classifier.ts
- Stage 1/2/3 classification from detection event fields
- Returns stage + confidence + evidence list

### src/nato/stage35-trajectory-predictor.ts
- Extended Kalman Filter: state [lat, lon, alt, vLat, vLon, vAlt]
- Process: constant-velocity model
- Predicts at t+30s, t+60s, t+120s
- Returns confidence radius (grows with time and process noise)

### src/nato/predictive-gap-analyzer.ts
- Ingests node positions (lat/lon array)
- Generates 0.1° grid over bounding box
- Flags cells > 3.5km from nearest node (blind spot)
- Cross-references OSINT event list for high-risk gaps

### src/nato/nato-alert-formatter.ts
- Formats AWNING alert struct: { awningLevel, stage, droneType, trajectory?, alertId, ts }
- Alert ID: `AWNING-{YYYYMMDD}-{seq:04d}` (atomic counter per session)
- Human-readable Telegram summary string

### src/nato/alert-throttle-gate.ts
- Debounce: level change minimum 30s apart
- De-escalation: 3 consecutive non-RED required
- Escalation: immediate (no hold)
- Ring buffer of last 10 levels

### src/nato/stage-transition-audit.ts
- Ring buffer: 1000 entries max
- Entry: { from, to, ts, evidence, operatorId? }
- Entries frozen on write (Object.freeze)
- replay(fromTs, toTs): returns slice of audit log

### src/nato/awning-integration-pipeline.ts
- Subscribes detection.enriched
- Routes through classifier → publisher → formatter
- Publishes awning.alert
- 5+ end-to-end integration scenarios

---

## Data Flow

```
EnrichedDetection {
  contextScore: number       ──► AwningLevelPublisher
  acousticConfidence: number ──► StageClassifier
  rfFingerprintMatch: bool   ──► StageClassifier
  adsbCorrelated: bool       ──► StageClassifier
  remoteIdNearby: bool       ──► StageClassifier
  positions: PositionFix[]   ──► Stage35TrajectoryPredictor
  civilProtectionLevel: str  ──► AwningLevelPublisher (override)
}
```

---

## Interface Contracts

```typescript
interface NatsClient {
  publish(subject: string, data: unknown): void;
  subscribe(subject: string, handler: (msg: unknown) => void): void;
}

interface PositionFix {
  lat: number; lon: number; altMeters: number; ts: number; // epoch ms
}

interface TrajectoryPrediction {
  lat: number; lon: number; altM: number;
  confidenceRadius_m: number; tSeconds: number;
}

interface AwningAlert {
  alertId: string; awningLevel: 'WHITE' | 'YELLOW' | 'RED';
  stage: 1 | 2 | 3; droneType: string;
  trajectory?: TrajectoryPrediction[]; ts: string;
  summary: string;
}
```
