// APEX-SENTINEL — Tracking Types
// W1 | src/tracking/types.ts

export type TrackState = 'tentative' | 'confirmed' | 'coasted' | 'dropped';
export type ThreatClass = 'fpv_drone' | 'fixed_wing' | 'helicopter' | 'bird' | 'unknown';

export interface Position4D {
  lat: number;
  lon: number;
  altM: number;
  timestampUs: bigint;
}

export interface TrackVelocity {
  vLatMs: number;
  vLonMs: number;
  vAltMs: number;
}

export interface Track {
  trackId: string;
  state: TrackState;
  threatClass: ThreatClass;
  position: Position4D;
  velocity: TrackVelocity;
  confidence: number;
  updateCount: number;
  contributingGates: number[];
  lastUpdatedUs: bigint;
  createdAt: bigint;
}

export interface TdoaInput {
  nodeId: string;
  timestampUs: bigint;
  lat: number;
  lon: number;
  timePrecisionUs: number;
}

export interface TdoaResult {
  estimatedLat: number;
  estimatedLon: number;
  estimatedAltM: number;
  positionErrorM: number;
  contributingNodes: string[];
  solvable: boolean;
}
