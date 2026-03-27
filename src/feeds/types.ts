// APEX-SENTINEL W18 — Shared feed types

export type FeedId = string; // W18 uses arbitrary feedId strings like 'opensky-ro', 'notam-lrop'
export type FeedStatus = 'unknown' | 'healthy' | 'degraded' | 'down';
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export type ZoneType = 'airport' | 'nuclear' | 'military' | 'government';
export type UasThreatCategory = 'cat-a-commercial' | 'cat-b-modified' | 'cat-c-surveillance' | 'cat-d-unknown';
export type EasaZoneType = 'RESTRICTED' | 'PROHIBITED' | 'CONDITIONAL' | 'CTR' | 'RMZ';
export type AwningLevel = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';

export interface FeedDescriptor {
  feedId: FeedId;
  name: string;
  type: string;
  tier: 1 | 2 | 3 | 4;
  pollIntervalMs: number;
  url?: string;
  requiresAuth?: boolean;
  authEnvKey?: string;
}

export interface FeedHealth {
  feedId: FeedId;
  status: FeedStatus;
  lastSuccessTs: number | null;
  errorCount: number;
  latencyMs: number;
}

export interface AircraftState {
  icao24: string;
  callsign: string;
  lat: number;
  lon: number;
  altitudeM: number;
  velocityMs: number;
  headingDeg: number;
  onGround: boolean;
  timestampMs: number;
  source: 'opensky' | 'adsbexchange' | 'adsbfi';
  transponderMode?: string;
}

// ParsedNotam — rich NOTAM object produced by NotamParser (W18)
export interface ParsedNotam {
  raw: string;
  fir: string;
  subject: string;
  traffic: string;
  purpose: string;
  scope: string;
  lowerFl: number;
  upperFl: number;
  airport: string;
  validFrom: Date;
  validTo: Date;
  centerLat?: number;
  centerLon?: number;
  radiusNm?: number;
  freeText: string;
  isDroneRelevant: boolean;
}

// NotamRestriction — alias for ParsedNotam used in active-restriction lists
export type NotamRestriction = ParsedNotam;

export interface EasaUasZone {
  id: string;
  name: string;
  type: EasaZoneType;
  country: string;
  lowerLimitM: number;
  upperLimitM: number;
  geometry: object;
  validFrom: Date | null;
  validTo: Date | null;
}

export interface ProtectedZone {
  id: string;
  name: string;
  type: ZoneType;
  lat: number;
  lon: number;
  radiusKm: number;
  icaoCode?: string;
  exclusionZones?: Array<{ radiusKm: number; description: string }>;
}

export interface AtmosphericConditions {
  tempC: number;
  windSpeedMs: number;
  windDirectionDeg: number;
  visibilityM: number;
  precipitationMm: number;
  cloudCoverPct: number;
  timestampMs: number;
}

export interface DroneFlightConditions extends AtmosphericConditions {
  flyabilityScore: number;
}

export interface SecurityEvent {
  id: string;
  source: 'acled' | 'firms' | 'gdelt';
  lat: number;
  lon: number;
  timestampMs: number;
  type: string;
  description: string;
  distanceToNearestZoneKm: number;
  affectedZoneId: string | null;
}

export interface EuSituationalPicture {
  aircraft: AircraftState[];
  notams: NotamRestriction[];
  zones: ProtectedZone[];
  conditions: DroneFlightConditions;
  securityEvents: SecurityEvent[];
  feedHealth: FeedHealth[];
  generatedAt: number;
}
