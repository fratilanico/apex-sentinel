// APEX-SENTINEL — Edge Event Ingestion
// FR-W2-05: Validates, sanitizes, and routes inbound detection events

export interface IngestEventRequest {
  nodeId: string;
  timestampUs: string;
  droneConfidence: number;
  helicopterConfidence: number;
  mechanicalConfidence: number;
  spectralPeakHz: number;
  rmsLevel: number;
  lat: number;
  lon: number;
  altM: number;
  timePrecisionUs: number;
  detectionType: 'acoustic' | 'rf' | 'fused';
}

const VALID_DETECTION_TYPES = new Set<string>(['acoustic', 'rf', 'fused']);

export function validateIngestEventRequest(
  req: unknown,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof req !== 'object' || req === null) {
    return { valid: false, errors: ['Request must be a non-null object'] };
  }

  const r = req as Record<string, unknown>;

  // nodeId: non-empty string
  if (typeof r['nodeId'] !== 'string' || r['nodeId'].trim() === '') {
    errors.push('nodeId must be a non-empty string');
  }

  // timestampUs: string parseable as BigInt
  if (typeof r['timestampUs'] !== 'string' || r['timestampUs'].trim() === '') {
    errors.push('timestampUs must be a non-empty numeric string');
  } else {
    try {
      BigInt(r['timestampUs']);
    } catch {
      errors.push('timestampUs must be a valid numeric string parseable as BigInt');
    }
  }

  // droneConfidence: 0.0–1.0
  if (typeof r['droneConfidence'] !== 'number' || r['droneConfidence'] < 0 || r['droneConfidence'] > 1) {
    errors.push('droneConfidence must be a number in the range [0.0, 1.0]');
  }

  // detectionType: must be 'acoustic' | 'rf' | 'fused'
  if (typeof r['detectionType'] !== 'string' || !VALID_DETECTION_TYPES.has(r['detectionType'])) {
    errors.push(`detectionType must be one of: acoustic, rf, fused`);
  }

  return { valid: errors.length === 0, errors };
}

export function sanitizeEvent(req: IngestEventRequest): IngestEventRequest {
  return {
    ...req,
    droneConfidence: Math.min(1, Math.max(0, req.droneConfidence)),
    lat: parseFloat(req.lat.toFixed(5)),
    lon: parseFloat(req.lon.toFixed(5)),
  };
}

export function buildNatsSubject(nodeId: string): string {
  // Replace spaces with '-', strip NATS wildcard chars '*' and '>'
  const sanitized = nodeId
    .replace(/ /g, '-')
    .replace(/\*/g, '')
    .replace(/>/g, '');

  return `sentinel.detections.${sanitized}`;
}
