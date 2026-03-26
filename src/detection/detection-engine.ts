// APEX-SENTINEL — Detection Engine types
// FR-W9-07 dependency | src/detection/detection-engine.ts

export interface DetectionEvent {
  id: string;
  droneType: string;
  confidence: number;
  nodeId: string;
  detectedAt: string;
  lat?: number;
  lon?: number;
  altMeters?: number;
}
