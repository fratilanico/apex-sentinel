// APEX-SENTINEL — FR-W12-05: RF Fusion Engine
// src/rf2/rf-fusion-engine.ts
//
// Fuses RF bearing estimates with acoustic bearing estimates.
// Applies spatial and temporal agreement scoring.

export interface RfDetection {
  lat: number;
  lon: number;
  confidence: number;
  protocol: string;
  ts: number;
}

export interface AcousticDetection {
  lat: number;
  lon: number;
  confidence: number;
  ts: number;
}

export interface FusionResult {
  fusedConfidence: number;
  conflict: boolean;
  sources: string[];
}

const SPATIAL_AGREEMENT_THRESHOLD_M = 500;
const CONFLICT_THRESHOLD_M = 1000;
const TEMPORAL_AGREEMENT_THRESHOLD_MS = 5000;
const AGREEMENT_BONUS = 0.10;

export class RfFusionEngine {
  fuse(rf: RfDetection, acoustic: AcousticDetection): FusionResult {
    const distanceM = haversineMetres(rf.lat, rf.lon, acoustic.lat, acoustic.lon);
    const timeDeltaMs = Math.abs(rf.ts - acoustic.ts);

    const spatialAgreement = distanceM <= SPATIAL_AGREEMENT_THRESHOLD_M;
    const temporalAgreement = timeDeltaMs <= TEMPORAL_AGREEMENT_THRESHOLD_MS;
    const conflict = distanceM > CONFLICT_THRESHOLD_M;

    const baseMax = Math.max(rf.confidence, acoustic.confidence);

    let fusedConfidence: number;
    if (spatialAgreement && temporalAgreement) {
      fusedConfidence = Math.min(1.0, baseMax + AGREEMENT_BONUS);
    } else {
      // No bonus — just take the max
      fusedConfidence = baseMax;
    }

    return {
      fusedConfidence,
      conflict,
      sources: ['rf', 'acoustic'],
    };
  }
}

function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
