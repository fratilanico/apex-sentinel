// APEX-SENTINEL — TDD RED Tests
// FR-W2-05: Edge Event Ingestion
// Status: RED — implementation in src/edge/ingest-event.ts NOT_IMPLEMENTED

import { describe, it, expect } from 'vitest';
import {
  validateIngestEventRequest,
  sanitizeEvent,
  buildNatsSubject,
} from '../../src/edge/ingest-event.js';

function makeValidRequest() {
  return {
    nodeId: 'node-ua-001',
    timestampUs: '1711234567000000',
    droneConfidence: 0.87,
    helicopterConfidence: 0.05,
    mechanicalConfidence: 0.08,
    spectralPeakHz: 480,
    rmsLevel: -38.2,
    lat: 48.2255,
    lon: 24.3370,
    altM: 320,
    timePrecisionUs: 50,
    detectionType: 'acoustic' as const,
  };
}

describe('FR-W2-05-01: valid request passes validation', () => {
  it('should return valid=true with no errors for a well-formed request', () => {
    const result = validateIngestEventRequest(makeValidRequest());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('FR-W2-05-02: droneConfidence > 1.0 returns valid=false', () => {
  it('should reject droneConfidence of 1.1', () => {
    const req = { ...makeValidRequest(), droneConfidence: 1.1 };
    const result = validateIngestEventRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /droneConfidence/i.test(e))).toBe(true);
  });
});

describe('FR-W2-05-03: droneConfidence < 0 returns valid=false', () => {
  it('should reject droneConfidence of -0.1', () => {
    const req = { ...makeValidRequest(), droneConfidence: -0.1 };
    const result = validateIngestEventRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /droneConfidence/i.test(e))).toBe(true);
  });
});

describe('FR-W2-05-04: invalid detectionType returns valid=false', () => {
  it('should reject an unknown detectionType string', () => {
    const req = { ...makeValidRequest(), detectionType: 'lidar' };
    const result = validateIngestEventRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /detectionType/i.test(e))).toBe(true);
  });

  it('should accept all valid detectionType values', () => {
    for (const dt of ['acoustic', 'rf', 'fused'] as const) {
      const req = { ...makeValidRequest(), detectionType: dt };
      const result = validateIngestEventRequest(req);
      expect(result.valid).toBe(true);
    }
  });
});

describe('FR-W2-05-05: missing nodeId returns valid=false', () => {
  it('should reject empty nodeId', () => {
    const req = { ...makeValidRequest(), nodeId: '' };
    const result = validateIngestEventRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /nodeId/i.test(e))).toBe(true);
  });

  it('should reject absent nodeId', () => {
    const { nodeId: _omit, ...req } = makeValidRequest();
    const result = validateIngestEventRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /nodeId/i.test(e))).toBe(true);
  });
});

describe('FR-W2-05-06: timestampUs as non-numeric string returns valid=false', () => {
  it('should reject "not-a-number" as timestampUs', () => {
    const req = { ...makeValidRequest(), timestampUs: 'not-a-number' };
    const result = validateIngestEventRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /timestampUs/i.test(e))).toBe(true);
  });

  it('should reject empty string as timestampUs', () => {
    const req = { ...makeValidRequest(), timestampUs: '' };
    const result = validateIngestEventRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /timestampUs/i.test(e))).toBe(true);
  });

  it('should accept a valid numeric string as timestampUs', () => {
    const req = { ...makeValidRequest(), timestampUs: '1711234567000000' };
    const result = validateIngestEventRequest(req);
    expect(result.valid).toBe(true);
  });
});

describe('FR-W2-05-07: sanitizeEvent clamps droneConfidence to [0, 1]', () => {
  it('should clamp droneConfidence > 1 down to 1', () => {
    const req = { ...makeValidRequest(), droneConfidence: 1.5 };
    const sanitized = sanitizeEvent(req);
    expect(sanitized.droneConfidence).toBeLessThanOrEqual(1.0);
  });

  it('should clamp droneConfidence < 0 up to 0', () => {
    const req = { ...makeValidRequest(), droneConfidence: -0.3 };
    const sanitized = sanitizeEvent(req);
    expect(sanitized.droneConfidence).toBeGreaterThanOrEqual(0);
  });

  it('should leave valid droneConfidence unchanged', () => {
    const req = { ...makeValidRequest(), droneConfidence: 0.75 };
    const sanitized = sanitizeEvent(req);
    expect(sanitized.droneConfidence).toBe(0.75);
  });
});

describe('FR-W2-05-08: buildNatsSubject returns correct subject', () => {
  it("should return 'sentinel.detections.node-abc' for nodeId 'node-abc'", () => {
    expect(buildNatsSubject('node-abc')).toBe('sentinel.detections.node-abc');
  });

  it('should include the nodeId in the subject', () => {
    const subject = buildNatsSubject('node-ua-007');
    expect(subject).toContain('node-ua-007');
  });
});

describe('FR-W2-05-09: buildNatsSubject with special chars in nodeId throws or sanitizes', () => {
  it('should throw or return a sanitized subject when nodeId contains spaces', () => {
    expect(() => {
      const subject = buildNatsSubject('node ua 001');
      // If it does not throw, it must not contain raw spaces (NATS subjects disallow spaces)
      expect(subject).not.toContain(' ');
    }).not.toThrow();
  });

  it('should throw or sanitize nodeId containing NATS wildcard chars', () => {
    let threw = false;
    let subject = '';
    try {
      subject = buildNatsSubject('node.*');
    } catch {
      threw = true;
    }
    if (!threw) {
      // sanitized path — must not contain raw wildcard
      expect(subject).not.toMatch(/\*/);
    }
  });
});

describe('FR-W2-05-10: lat/lon are coarsened to ≤5 decimal places after sanitize — privacy check', () => {
  it('should not retain more than 5 decimal places in lat', () => {
    const req = { ...makeValidRequest(), lat: 48.123456789 };
    const sanitized = sanitizeEvent(req);
    const decimalPlaces = (sanitized.lat.toString().split('.')[1] ?? '').length;
    expect(decimalPlaces).toBeLessThanOrEqual(5);
  });

  it('should not retain more than 5 decimal places in lon', () => {
    const req = { ...makeValidRequest(), lon: 24.987654321 };
    const sanitized = sanitizeEvent(req);
    const decimalPlaces = (sanitized.lon.toString().split('.')[1] ?? '').length;
    expect(decimalPlaces).toBeLessThanOrEqual(5);
  });
});
