import { getServerUrls } from '../nats/auth-config.js';

export interface RegisterNodeRequest {
  nodeId?: string;
  lat?: number;
  lon?: number;
  altM?: number;
  timePrecisionUs?: number;
  tier?: number;
  capabilities?: string[];
  softwareVersion?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface RegisterNodeResponse {
  success: boolean;
  nodeId: string;
  assignedRegion: string;
  registeredAt: string;
  natsCredentials: {
    credentialsFile: string;
    serverUrls: string[];
  };
}

export function validateRegisterNodeRequest(req: RegisterNodeRequest): ValidationResult {
  const errors: string[] = [];

  // nodeId must be a non-empty string
  if (!req.nodeId || typeof req.nodeId !== 'string' || req.nodeId.trim().length === 0) {
    errors.push('nodeId is required and must be a non-empty string');
  }

  // tier must be 1, 2, or 3
  if (req.tier === undefined || req.tier === null || ![1, 2, 3].includes(req.tier)) {
    errors.push('tier must be 1, 2, or 3');
  }

  // lat must be in [-90, 90]
  if (req.lat === undefined || req.lat === null || req.lat < -90 || req.lat > 90) {
    errors.push('lat must be between -90 and 90');
  }

  // lon must be in [-180, 180]
  if (req.lon === undefined || req.lon === null || req.lon < -180 || req.lon > 180) {
    errors.push('lon must be between -180 and 180');
  }

  // capabilities must be a non-empty array
  if (!req.capabilities || !Array.isArray(req.capabilities) || req.capabilities.length === 0) {
    errors.push('capabilities must be a non-empty array');
  }

  // softwareVersion must be a non-empty string
  if (!req.softwareVersion || typeof req.softwareVersion !== 'string' || req.softwareVersion.trim().length === 0) {
    errors.push('softwareVersion is required and must be a non-empty string');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function buildRegisterNodeResponse(nodeId: string, region: string): RegisterNodeResponse {
  return {
    success: true,
    nodeId,
    assignedRegion: region,
    registeredAt: new Date().toISOString(),
    natsCredentials: {
      credentialsFile: `/etc/apex-sentinel/creds/${nodeId}.creds`,
      serverUrls: getServerUrls(),
    },
  };
}
