# W14 DATABASE_SCHEMA

## In-Memory Only
W14 uses no database. All state is held in DashboardStateStore (Node.js process memory).
State resets on restart. Appropriate for hackathon demo.

## State Structures

### DashboardState
```typescript
interface DashboardState {
  awningLevel: AwningLevel;
  awningTransitions: AwningTransition[];  // last 10
  detections: SerializedDetection[];       // last 50
  latestIntel: IntelBrief | null;
  nodeHealth: Map<string, NodeStatus>;
  startedAt: number; // epoch ms
}
```

### AwningTransition
```typescript
interface AwningTransition {
  from: AwningLevel;
  to: AwningLevel;
  ts: number;
  reason: string;
}
```

### SerializedDetection
```typescript
interface SerializedDetection {
  id: string;
  droneType: string;
  awningLevel: string;
  stage: number;
  approxLat?: number;
  approxLon?: number;
  trajectory?: TrajectoryPoint[];
  ts: number;
}
```

### NodeStatus
```typescript
interface NodeStatus {
  nodeId: string;
  lat: number;
  lon: number;
  lastSeen: number;
  status: 'online' | 'degraded' | 'offline';
  detectionCount: number;
  batteryPct?: number;
  coverageRadiusKm: number;
}
```
