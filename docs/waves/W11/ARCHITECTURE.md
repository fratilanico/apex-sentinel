# APEX-SENTINEL W11 — Architecture Document
## OSINT Deep Fusion + Multi-Source Threat Correlation

**Wave:** W11
**Date:** 2026-03-26

---

## 1. Module Boundaries

All W11 source lives in `src/intel/`. No cross-module imports to `src/feeds/` or `src/nato/` except via interface types. NATS is injected via interface — no direct dependency on any NATS client package.

## 2. Component Architecture

```
src/intel/
├── osint-correlation-engine.ts      (pure function, no state)
├── anomaly-correlation-engine.ts    (pure function, no state)
├── threat-timeline-builder.ts       (stateful, in-memory ring)
├── sector-threat-map.ts             (stateful, Map<string, GridCell>)
├── intelligence-pack-builder.ts     (aggregator, depends on above 3)
├── multi-source-confidence-aggregator.ts (pure function)
├── alert-deduplication-engine.ts    (stateful, ring buffer 500)
└── intelligence-pipeline-orchestrator.ts (NATS subscriber/publisher)
```

## 3. Interface Contracts

### NatsClient (injected)
```typescript
interface NatsClient {
  publish(subject: string, data: unknown): void;
  subscribe(subject: string, handler: (msg: unknown) => void): void;
}
```

### OsintEvent (input)
```typescript
interface OsintEvent {
  lat: number; lon: number; ts: number;
  goldsteinScale?: number; eventType?: string;
}
```

### DetectionEvent (input)
```typescript
interface DetectionEvent {
  lat: number; lon: number; ts: number;
  droneType?: string; source?: string;
  altFt?: number; adsbPresent?: boolean;
  remoteIdPresent?: boolean; acousticPresent?: boolean;
}
```

## 4. Dependency Graph

```
IntelligencePipelineOrchestrator
    ├── IntelligencePackBuilder
    │       ├── OsintCorrelationEngine
    │       ├── AnomalyCorrelationEngine
    │       ├── ThreatTimelineBuilder
    │       └── SectorThreatMap
    ├── MultiSourceConfidenceAggregator
    └── AlertDeduplicationEngine
```

## 5. NATS Subjects

| Subject | Direction | Description |
|---------|-----------|-------------|
| `awning.alert` | Subscribe | AWNING level changes |
| `feed.fused` | Subscribe | All fused feed events |
| `detection.enriched` | Subscribe | Enriched detection events |
| `intel.brief` | Publish | Assembled IntelBrief |

## 6. State Management

- **ThreatTimelineBuilder**: ordered array of timeline entries, capped at 10,000
- **SectorThreatMap**: `Map<string, GridCell>` keyed by `${gridLat}:${gridLon}`
- **AlertDeduplicationEngine**: circular buffer of 500 alert keys with timestamps
- All state is in-memory; no persistence in W11

## 7. Error Handling

Each component method catches and logs internally. The orchestrator wraps all handlers in try/catch. Errors do not propagate to crash the pipeline.
