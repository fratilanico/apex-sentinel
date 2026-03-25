// APEX-SENTINEL — W5 Prediction Engine Types

export interface Position3D {
  lat: number;
  lon: number;
  alt: number;
}

export interface EKFStateSnapshot {
  lat: number;
  lon: number;
  alt: number;
  vLat: number;
  vLon: number;
  vAlt: number;
  timestamp: number;
}

export interface EKFState extends EKFStateSnapshot {
  confidence: number;
}

export interface PredictionHorizon {
  horizonSeconds: number;
  lat: number;
  lon: number;
  alt: number;
  confidence: number;
  timestamp: number;
}

export interface ImpactEstimate {
  lat: number;
  lon: number;
  timeToImpactSeconds: number;
  confidence: number;
}

export interface PredictionResult {
  trackId: string;
  ekfState: EKFState;
  horizons: PredictionHorizon[];
  impactEstimate: ImpactEstimate | null;
  processedAt: number;
}

export interface DetectionInput {
  trackId: string;
  lat: number;
  lon: number;
  alt: number;
  timestamp: number;
  confidence: number;
}
