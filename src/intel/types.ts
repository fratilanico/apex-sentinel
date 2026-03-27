// APEX-SENTINEL — W19 Shared Intel Types
// src/intel/types.ts

export type EasaCategory = 'cat-a-commercial' | 'cat-b-modified' | 'cat-c-surveillance' | 'cat-d-unknown';
export type BreachType = 'INSIDE' | 'ENTERING' | 'APPROACHING';
export type AwningLevel = 'CLEAR' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
export type AnonymisationStatus = 'ANONYMISED' | 'EXEMPT' | 'PENDING' | 'ERROR_PASSTHROUGH';

export interface MlSignalBundle {
  acousticDroneConfidence?: number;
  rfDroneConfidence?: number;
}

export interface ClassificationResult {
  category: EasaCategory;
  confidence: number;
  classificationBasis: 'transponder-absent' | 'heuristic-velocity' | 'ml-signal-informed' | 'adsb-category-map' | 'manual-override';
  emergencySquawk?: boolean;
}

export interface ZoneBreach {
  zoneId: string;
  breachType: BreachType;
  distanceM: number;
  ttBreachS?: number | null;
  firstDetectedAt: string;
  aircraftIcao24: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface ThreatScore {
  value: number;
  components: { proximity: number; category: number; flyability: number; securityBonus: number };
  zoneId: string;
  aircraftIcao24: string;
  scoredAt: string;
}

export interface ZoneAwningState {
  zoneId: string;
  level: AwningLevel;
  previousLevel: AwningLevel;
  changed: boolean;
  timestampMs: number;
}

export interface AnonymisedTrack {
  pseudoId: string;
  gridLat: number;
  gridLon: number;
  anonymisationStatus: AnonymisationStatus;
  legalBasis?: string;
  privacyBreachFlag?: boolean;
}

export interface AacrNotification {
  incidentId: string;
  timestampUtc: string;
  locationIcao: string;
  aircraftCategory: string;
  awningLevel: AwningLevel;
  recommendedAction: string;
  operatorConfirmationRequired: boolean;
  cncanEscalationRequired?: boolean;
}

export interface RomatsaCoordinationMessage {
  affectedAerodrome: string;
  awningLevel: AwningLevel;
  classification: string;
  notamCoverage: boolean;
  actionDowngradedByNotam: boolean;
  recommendedAction: string;
  aircraftSpeedKts: number;
  aircraftAltitudeFt: number;
}

export interface ThreatIntelPicture {
  breaches: ZoneBreach[];
  threatScores: ThreatScore[];
  awningLevels: Record<string, AwningLevel>;
  aacrNotifications: AacrNotification[];
  coordinationMessages: RomatsaCoordinationMessage[];
  anonymisedTracks: AnonymisedTrack[];
  degradedMode: boolean;
  privacyBreachFlag: boolean;
  pipelineLatencyMs: number;
  generatedAt: Date;
}
