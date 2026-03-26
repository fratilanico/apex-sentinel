# APEX-SENTINEL W10 — Database Schema

> Wave: W10 | Theme: NATO AWNING Framework Publisher + Stage 3.5 Trajectory Prediction
> Status: PLAN | Date: 2026-03-26

---

## In-Memory Structures (No DB Migration Required)

W10 operates fully in-memory. No new Supabase migrations needed.

---

## StageTransitionAudit Ring Buffer Schema

```typescript
interface AuditEntry {
  readonly id: string;              // randomUUID
  readonly from: Stage | null;      // null for first entry
  readonly to: Stage;               // 1 | 2 | 3
  readonly ts: string;              // ISO-8601
  readonly evidence: string[];      // list of evidence strings
  readonly operatorId?: string;     // optional operator identifier
}
```

Ring buffer: max 1000 entries. Oldest evicted on overflow.
Entries are Object.frozen on insertion — immutable.

---

## AlertThrottleGate History Buffer

```typescript
interface LevelHistoryEntry {
  level: AwningLevel;     // 'WHITE' | 'YELLOW' | 'RED'
  ts: number;             // epoch ms
}
// Last 10 entries retained
```

---

## AWNING Alert ID Counter

```typescript
// Per-session atomic counter, resets on restart
// Format: AWNING-{YYYYMMDD}-{seq:04d}
// Stored in NatoAlertFormatter instance
private seq: number = 0;
```

---

## EKF State (Stage35TrajectoryPredictor)

```typescript
interface KalmanState {
  x: Float64Array;  // [lat, lon, alt, vLat, vLon, vAlt]
  P: number[][];    // 6x6 covariance matrix
}
```

Not persisted — computed fresh per prediction request.

---

## Coverage Grid (PredictiveGapAnalyzer)

```typescript
interface GridCell {
  lat: number;       // cell center
  lon: number;       // cell center
  nearestNodeKm: number;
  isBlindSpot: boolean;
  osintEventCount: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}
```

Grid computed on demand, not persisted.
