// APEX-SENTINEL — Privacy Types
// W1 | src/privacy/types.ts

export interface RawLocation {
  lat: number;
  lon: number;
  altM?: number;
}

export interface CoarsenedLocation {
  lat: number;
  lon: number;
  altM?: number;
  precisionM: number;
}

export interface PseudonymousNodeId {
  nodeId: string;
  createdAt: Date;
  rotatable: boolean;
}

export interface AudioPrivacyAudit {
  rawAudioStored: boolean;
  rawAudioTransmitted: boolean;
  onDeviceInferenceOnly: boolean;
  transmittedFields: string[];
}
