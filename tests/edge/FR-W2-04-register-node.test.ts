// APEX-SENTINEL — TDD RED Tests
// FR-W2-04: Edge Node Registration
// Status: RED — implementation in src/edge/register-node.ts NOT_IMPLEMENTED

import { describe, it, expect } from 'vitest';
import {
  validateRegisterNodeRequest,
  buildRegisterNodeResponse,
} from '../../src/edge/register-node.js';

function makeValidRequest() {
  return {
    nodeId: 'node-ua-001',
    lat: 48.2255,
    lon: 24.3370,
    altM: 320,
    timePrecisionUs: 50,
    tier: 1 as const,
    capabilities: ['acoustic', 'rf'],
    softwareVersion: '2.4.1',
  };
}

describe('FR-W2-04-01: validateRegisterNodeRequest returns valid for complete request', () => {
  it('should return valid=true with no errors for a well-formed request', () => {
    const result = validateRegisterNodeRequest(makeValidRequest());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('FR-W2-04-02: missing nodeId returns valid=false', () => {
  it('should return valid=false with an error mentioning nodeId', () => {
    const req = { ...makeValidRequest(), nodeId: '' };
    const result = validateRegisterNodeRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /nodeId/i.test(e))).toBe(true);
  });

  it('should return valid=false when nodeId is absent', () => {
    const { nodeId: _omit, ...req } = makeValidRequest();
    const result = validateRegisterNodeRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /nodeId/i.test(e))).toBe(true);
  });
});

describe('FR-W2-04-03: invalid tier returns valid=false', () => {
  it('should reject tier=0', () => {
    const req = { ...makeValidRequest(), tier: 0 };
    const result = validateRegisterNodeRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /tier/i.test(e))).toBe(true);
  });

  it('should reject tier=4', () => {
    const req = { ...makeValidRequest(), tier: 4 };
    const result = validateRegisterNodeRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /tier/i.test(e))).toBe(true);
  });
});

describe('FR-W2-04-04: lat out of range returns valid=false', () => {
  it('should reject lat > 90', () => {
    const req = { ...makeValidRequest(), lat: 91 };
    const result = validateRegisterNodeRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /lat/i.test(e))).toBe(true);
  });

  it('should reject lat < -90', () => {
    const req = { ...makeValidRequest(), lat: -91 };
    const result = validateRegisterNodeRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /lat/i.test(e))).toBe(true);
  });
});

describe('FR-W2-04-05: lon out of range returns valid=false', () => {
  it('should reject lon > 180', () => {
    const req = { ...makeValidRequest(), lon: 181 };
    const result = validateRegisterNodeRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /lon/i.test(e))).toBe(true);
  });

  it('should reject lon < -180', () => {
    const req = { ...makeValidRequest(), lon: -181 };
    const result = validateRegisterNodeRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /lon/i.test(e))).toBe(true);
  });
});

describe('FR-W2-04-06: empty capabilities array returns valid=false', () => {
  it('should return valid=false with capabilities error', () => {
    const req = { ...makeValidRequest(), capabilities: [] };
    const result = validateRegisterNodeRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /capabilities/i.test(e))).toBe(true);
  });
});

describe('FR-W2-04-07: missing softwareVersion returns valid=false', () => {
  it('should reject empty softwareVersion', () => {
    const req = { ...makeValidRequest(), softwareVersion: '' };
    const result = validateRegisterNodeRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /softwareVersion/i.test(e))).toBe(true);
  });

  it('should reject absent softwareVersion', () => {
    const { softwareVersion: _omit, ...req } = makeValidRequest();
    const result = validateRegisterNodeRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /softwareVersion/i.test(e))).toBe(true);
  });
});

describe('FR-W2-04-08: buildRegisterNodeResponse includes nodeId and registeredAt', () => {
  it('should echo the nodeId in the response', () => {
    const response = buildRegisterNodeResponse('node-ua-001', 'eu-central-1');
    expect(response.nodeId).toBe('node-ua-001');
  });

  it('should include registeredAt in the response', () => {
    const response = buildRegisterNodeResponse('node-ua-001', 'eu-central-1');
    expect(response.registeredAt).toBeDefined();
    expect(typeof response.registeredAt).toBe('string');
    expect(response.registeredAt.length).toBeGreaterThan(0);
  });

  it('should set success=true', () => {
    const response = buildRegisterNodeResponse('node-ua-001', 'eu-central-1');
    expect(response.success).toBe(true);
  });

  it('should include the assigned region', () => {
    const response = buildRegisterNodeResponse('node-ua-001', 'eu-central-1');
    expect(response.assignedRegion).toBe('eu-central-1');
  });
});

describe('FR-W2-04-09: registeredAt is a valid ISO 8601 timestamp', () => {
  it('should be parseable by the Date constructor', () => {
    const response = buildRegisterNodeResponse('node-ua-002', 'eu-east-1');
    const parsed = new Date(response.registeredAt);
    expect(parsed.getTime()).not.toBeNaN();
  });

  it('should contain a T separator (ISO 8601 format)', () => {
    const response = buildRegisterNodeResponse('node-ua-002', 'eu-east-1');
    expect(response.registeredAt).toContain('T');
  });
});

describe('FR-W2-04-10: response.natsCredentials.serverUrls has length 5', () => {
  it('should include exactly 5 server URLs in NATS credentials', () => {
    const response = buildRegisterNodeResponse('node-ua-003', 'eu-central-1');
    expect(response.natsCredentials).toBeDefined();
    expect(Array.isArray(response.natsCredentials.serverUrls)).toBe(true);
    expect(response.natsCredentials.serverUrls).toHaveLength(5);
  });

  it('should include a credentialsFile string in NATS credentials', () => {
    const response = buildRegisterNodeResponse('node-ua-003', 'eu-central-1');
    expect(typeof response.natsCredentials.credentialsFile).toBe('string');
    expect(response.natsCredentials.credentialsFile.length).toBeGreaterThan(0);
  });
});
