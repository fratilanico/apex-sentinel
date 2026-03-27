# W21 DATABASE SCHEMA — TypeScript Interfaces for UI State

## Overview

W21 is a frontend-only wave. There are no new Supabase migrations and no new database
tables. The interfaces in this document define the TypeScript contracts for:

1. Data received from W18-W20 backend engines via API routes
2. Component prop types
3. React state shape
4. SSE event payloads

All interfaces live in `lib/types/w21.ts`.

---

## Core Domain Types

### ProtectedZone

```typescript
export type AwningLevel = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';

export type ZoneType =
  | 'Airport CTR'
  | 'Nuclear Exclusion'
  | 'Military Restricted'
  | 'Government Protected';

export interface ProtectedZone {
  id: string;                    // e.g. "zone-lrop"
  name: string;                  // e.g. "Henri Coandă International"
  icaoCode: string;              // e.g. "LROP"
  type: ZoneType;
  lat: number;
  lng: number;
  radiusKm: number;
  awningLevel: AwningLevel;
  awningUpdatedAt: string;       // ISO 8601
  activeIncidentCount: number;
  activeNotamCount: number;
  sensorNodeIds: string[];
  lastDetectionAt: string | null; // ISO 8601 or null
}
```

### Aircraft

```typescript
export type DroneCategory =
  | 'Commercial UAS'
  | 'Modified UAS'
  | 'Surveillance UAS'
  | 'Unknown Contact';

export type AircraftSource = 'OpenSky' | 'ADS-B Exchange' | 'adsb.fi' | 'MLAT';

export interface Aircraft {
  icao24: string;                // e.g. "4b1a2c"
  callsign: string | null;       // e.g. "ROT401" or null if unknown
  lat: number;
  lng: number;
  altitudeM: number;             // AMSL
  groundSpeedKt: number;
  trackDeg: number;              // 0-360
  verticalRateMs: number;        // positive = climbing
  squawk: string | null;         // e.g. "7700"
  onGround: boolean;
  sources: AircraftSource[];
  lastSeenAt: string;            // ISO 8601
  threatScore: number;           // 0-100, from W19 ThreatFusionEngine
  droneCategory: DroneCategory | null; // null for conventional aircraft
  isConventionalAircraft: boolean;
}
```

### ThreatTrack

```typescript
export interface ThreatTrack {
  trackId: string;               // e.g. "TRK-2024-03-27-001"
  droneCategory: DroneCategory;
  confidence: number;            // 0.0-1.0
  lat: number;
  lng: number;
  altitudeM: number;
  bearingDeg: number;
  speedMs: number;
  detectedByNodeIds: string[];
  firstSeenAt: string;           // ISO 8601
  lastSeenAt: string;            // ISO 8601
  zoneId: string;                // which protected zone this track is in/near
  awningContribution: AwningLevel; // what AWNING level this track triggers
  rfSignaturePresent: boolean;
  acousticSignaturePresent: boolean;
  freqRangeHz: [number, number] | null;
}
```

### Alert

```typescript
export type AlertStatus = 'NEW' | 'ACKNOWLEDGED' | 'ESCALATED' | 'RESOLVED';
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface Alert {
  id: string;                    // UUID
  zoneId: string;
  zoneName: string;
  trackId: string | null;        // null for system alerts
  droneCategory: DroneCategory | null;
  awningLevel: AwningLevel;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  createdAt: string;             // ISO 8601
  acknowledgedAt: string | null; // ISO 8601
  acknowledgedByOperator: string | null;
  resolvedAt: string | null;     // ISO 8601
  slaSecs: number;               // SLA window in seconds
  slaBreached: boolean;
  escalatedAt: string | null;    // ISO 8601
  incidentId: string | null;     // grouped into incident if present
}
```

### Incident

```typescript
export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'ESCALATED';

export interface IncidentTimelineEntry {
  timestamp: string;             // ISO 8601
  type: 'ALERT' | 'ACKNOWLEDGE' | 'ESCALATION' | 'NOTE' | 'RESOLUTION';
  actorId: string | null;
  description: string;
  alertId: string | null;
}

export interface EscalationChainEntry {
  level: number;                 // 1=supervisor, 2=manager, 3=AACR
  role: string;
  contactedAt: string;           // ISO 8601
  acknowledgedAt: string | null;
}

export interface Incident {
  id: string;                    // UUID
  zoneIds: string[];             // one or more zones involved
  alertIds: string[];            // grouped alert IDs
  status: IncidentStatus;
  peakAwningLevel: AwningLevel;
  openedAt: string;              // ISO 8601
  resolvedAt: string | null;     // ISO 8601
  durationSecs: number | null;   // null while open
  detectionCount: number;
  involvedAircraftIcao24: string[];
  escalationChain: EscalationChainEntry[];
  timeline: IncidentTimelineEntry[];
}
```

---

## Sensor & Feed Types

### SensorNode

```typescript
export type SensorStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN';

export interface SensorNode {
  id: string;                    // e.g. "SN-LROP-01"
  name: string;                  // e.g. "LROP Acoustic Array North"
  location: string;              // e.g. "Henri Coandă International"
  lat: number;
  lng: number;
  status: SensorStatus;
  lastHeartbeatAt: string;       // ISO 8601
  coverageRadiusKm: number;
  acousticActive: boolean;
  rfActive: boolean;
  opticalActive: boolean;
  zoneIds: string[];             // zones this node covers
}
```

### DataFeed

```typescript
export type FeedName =
  | 'OpenSky'
  | 'ADS-B Exchange'
  | 'adsb.fi'
  | 'NOTAM/LRBB'
  | 'EASA UAS Zones'
  | 'OpenWeatherMap'
  | 'ACLED'
  | 'FIRMS';

export interface DataFeed {
  name: FeedName;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  lastSuccessAt: string;         // ISO 8601
  latencyMs: number;
  requestsLast1h: number;
  errorsLast1h: number;
  errorRate: number;             // 0.0-1.0
}
```

### SystemHealth

```typescript
export interface SystemHealth {
  score: number;                 // 0-100 from W16 SystemHealthDashboard
  sensorNodesOnline: number;
  sensorNodesTotal: number;
  feedsHealthy: number;
  feedsTotal: number;
  lastUpdatedAt: string;         // ISO 8601
  breakdown: {
    sensors: number;             // 0-100
    feeds: number;               // 0-100
    processing: number;          // 0-100
    latency: number;             // 0-100
  };
}
```

---

## NOTAM Types

```typescript
export type NotamType =
  | 'UAS_RESTRICTION'
  | 'AIRSPACE_RESTRICTION'
  | 'MILITARY_EXERCISE'
  | 'AERODROME'
  | 'OBSTACLE'
  | 'OTHER';

export interface NotamGeometry {
  type: 'circle' | 'polygon';
  // circle:
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
  // polygon:
  coordinates?: [number, number][]; // [lng, lat] pairs
}

export interface Notam {
  notamId: string;               // e.g. "A1234/24"
  icaoLocation: string;          // e.g. "LROP"
  type: NotamType;
  validFrom: string;             // ISO 8601
  validTo: string;               // ISO 8601
  fullText: string;              // raw NOTAM text
  simplifiedText: string;        // human-readable summary
  geometry: NotamGeometry | null;
  affectsUas: boolean;           // true if drone-relevant
  altitude: { from: number; to: number; unit: 'FT' | 'M' } | null;
}
```

---

## Weather Types

```typescript
export interface WeatherConditions {
  lat: number;
  lng: number;
  location: string;
  tempC: number;
  windSpeedMs: number;
  windDirDeg: number;
  visibilityM: number;
  precipitationMmH: number;
  cloudCoverPct: number;
  updatedAt: string;             // ISO 8601
  flyabilityScore: number;       // 0-100, computed by W18 AtmosphericConditionProvider
  flyabilityLabel: 'EXCELLENT' | 'GOOD' | 'MARGINAL' | 'POOR' | 'PROHIBITED';
  forecast6h: WeatherForecastPoint[];
}

export interface WeatherForecastPoint {
  time: string;                  // ISO 8601
  tempC: number;
  windSpeedMs: number;
  visibilityM: number;
  precipitationMmH: number;
  flyabilityScore: number;
}

export interface ZoneWeather {
  zoneId: string;
  conditions: WeatherConditions;
  atmosphericRisk: 'LOW' | 'MEDIUM' | 'HIGH'; // computed per zone
}
```

---

## Compliance Types

```typescript
export interface GdprComplianceStatus {
  totalTracksStored: number;
  oldestTrackAgeHours: number;
  retentionLimitHours: number;   // always 48 per W19 GDPR policy
  tracksAnonymisedLast24h: number;
  auditLogEntries: number;
  lastAuditExportAt: string | null; // ISO 8601
  retentionCompliant: boolean;
  anonymisationCompliant: boolean;
}

export interface EasaComplianceStatus {
  uasZonesLoaded: number;
  uasZonesActive: number;
  lastZoneRefreshAt: string;     // ISO 8601
  categoryAccuracyPct: number;   // based on transponder data completeness
  categoryAccuracyBasis: number; // how many tracks had full transponder data
}

export interface SlaComplianceStatus {
  period: '24h' | '7d';
  totalAlerts: number;
  acknowledgedOnTime: number;
  slaBreaches: number;
  complianceRate: number;        // 0.0-1.0
  avgAcknowledgeTimeSecs: number;
  p95AcknowledgeTimeSecs: number;
}

export interface ComplianceStatus {
  gdpr: GdprComplianceStatus;
  easa: EasaComplianceStatus;
  sla: SlaComplianceStatus;
  lastRefreshedAt: string;       // ISO 8601
}
```

---

## SSE Event Payload Types

```typescript
export type SseEventType =
  | 'connected'
  | 'alert_new'
  | 'alert_updated'
  | 'alert_escalated'
  | 'incident_opened'
  | 'incident_updated'
  | 'incident_closed'
  | 'aircraft_update'
  | 'weather_update'
  | 'zone_update'
  | 'health_update'
  | 'keepalive';

export interface SseEvent<T = unknown> {
  type: SseEventType;
  payload: T;
  timestamp: string;             // ISO 8601
}
```

---

## Component Prop Types

### AlertCard Props

```typescript
export interface AlertCardProps {
  alert: Alert;
  onAcknowledge: (alertId: string) => Promise<void>;
  onViewIncident: (incidentId: string) => void;
  isAcknowledging: boolean;      // optimistic state
}
```

### ZoneDetailPanel Props

```typescript
export interface ZoneDetailPanelProps {
  zone: ProtectedZone;
  onViewIncidents: (zoneId: string) => void;
  onViewNotams: (icaoCode: string) => void;
  onClose: () => void;
}
```

### AlertFilters (UI state)

```typescript
export interface AlertFilters {
  zoneId: string | null;         // null = all zones
  severity: AlertSeverity | null; // null = all severities
  status: AlertStatus | null;    // null = all statuses (defaults to 'NEW')
}
```

### DashboardState (root reducer)

```typescript
export interface DashboardState {
  activeTab: 'ZONE_MAP' | 'INCIDENTS' | 'NETWORK' | 'COMPLIANCE';
  alerts: Alert[];
  incidents: Incident[];
  aircraft: Aircraft[];
  zones: ProtectedZone[];
  health: SystemHealth;
  weather: WeatherConditions | null;
  notams: Notam[];
  complianceStatus: ComplianceStatus | null;
  sseConnected: boolean;
  selectedZoneId: string | null;
  selectedAircraftId: string | null;
  openIncidentId: string | null;
  notamDrawerOpen: boolean;
  alertFilters: AlertFilters;
}
```

---

*Document version: W21-DATABASE_SCHEMA-v1.0*
*Status: APPROVED FOR IMPLEMENTATION*
