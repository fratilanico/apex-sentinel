# APEX-SENTINEL W11 — Database Schema

**Wave:** W11
**Date:** 2026-03-26

---

## Note

W11 components are entirely in-memory. No new Supabase migrations are required for this wave.

The following structures exist as TypeScript interfaces and in-memory data stores only.

---

## In-Memory Structures

### GridCell (SectorThreatMap)
```typescript
interface GridCell {
  gridLat: number;       // floored to 0.1° resolution
  gridLon: number;
  threatCount: number;   // exponentially decayed float
  latestTs: number;      // Unix ms of last update
  dominantDroneType: string | null;
}
```

### TimelineEntry (ThreatTimelineBuilder)
```typescript
interface TimelineEntry {
  ts: number;
  eventType: 'acoustic_detection' | 'awning_escalation' | 'awning_de-escalation' | 'osint_event' | 'adsb_anomaly';
  severity: number;      // 0–100
  summary: string;
}
```

### AlertRecord (AlertDeduplicationEngine)
```typescript
interface AlertRecord {
  key: string;           // ${droneType}:${awningLevel}:${gridCell}:${bucketId}
  ts: number;
  droneType: string;
  awningLevel: string;
  sector: string;
}
```

### IntelBrief (IntelligencePackBuilder)
```typescript
interface IntelBrief {
  threatLevel: 'WHITE' | 'YELLOW' | 'RED';
  activeSectors: GridCell[];
  recentEvents: TimelineEntry[];
  osintSummary: string;
  ts: string;            // ISO-8601
}
```

---

## Future (W12)

- `intel_briefs` table: persist IntelBrief as JSONB with indexed ts
- `threat_sectors` table: grid cell snapshots for historical heatmap replay
