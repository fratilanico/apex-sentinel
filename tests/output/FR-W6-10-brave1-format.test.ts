// APEX-SENTINEL — W6 BRAVE1 Format Tests
// FR-W6-10 | tests/output/FR-W6-10-brave1-format.test.ts
// NATO BRAVE-1 compatible tactical output format

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BRAVE1Format, BRAVE1ValidationError } from '../../src/output/brave1-format.js';
import type { BRAVE1Message, TacticalReport } from '../../src/output/brave1-format.js';

function makeTacticalReport(overrides: Partial<TacticalReport> = {}): TacticalReport {
  return {
    trackId: 'TRK-001',
    classification: 'shahed-136',
    confidence: 0.92,
    location: { lat: 51.5, lon: 4.9, coarsened: true },
    velocity: { speedKmh: 150, heading: 270, altitude: 200 },
    impactProjection: { timeToImpactSeconds: 30, lat: 51.51, lon: 4.87 },
    timestamp: '2026-03-25T06:00:00.000Z',
    nodeCount: 3,
    narrative: 'THREAT: Shahed-136 UAS inbound.',
    ...overrides,
  };
}

function makeValidBRAVE1(overrides: Partial<BRAVE1Message> = {}): BRAVE1Message {
  return {
    type: 'a-h-A-M-F-U',  // hostile air UAS
    uid: 'APEX-SENTINEL-TRK-001-1711346400000',
    time: '2026-03-25T06:00:00.000Z',
    stale: '2026-03-25T06:05:00.000Z',
    lat: 51.5,
    lon: 4.9,
    ce: 50.0,   // circular error (meters)
    hae: 200.0, // height above ellipsoid (meters)
    speed: 41.67, // m/s = 150 km/h
    course: 270.0,
    callsign: 'APEX-TRK-001',
    how: 'm-g', // machine-generated
    remarks: 'THREAT: Shahed-136 UAS inbound. Impact T-30s.',
    ...overrides,
  };
}

describe('FR-W6-10: BRAVE1Format', () => {
  let formatter: BRAVE1Format;
  let mockTransmitter: { post: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockTransmitter = {
      post: vi.fn().mockResolvedValue({ status: 200 }),
    };
    formatter = new BRAVE1Format({ transmitter: mockTransmitter });
  });

  // --- encode ---

  it('FR-W6-10-01: GIVEN TacticalReport, WHEN encode called, THEN returns BRAVE1Message with required fields', () => {
    const report = makeTacticalReport();
    const msg = formatter.encode(report);
    expect(msg.type).toBeTruthy();
    expect(msg.uid).toBeTruthy();
    expect(msg.time).toBe(report.timestamp);
    expect(msg.lat).toBeCloseTo(report.location.lat, 3);
    expect(msg.lon).toBeCloseTo(report.location.lon, 3);
    expect(msg.ce).toBeGreaterThan(0); // circular error
    expect(msg.hae).toBe(report.velocity.altitude);
    expect(msg.remarks).toContain('shahed-136');
    expect(msg.how).toBe('m-g'); // machine-generated
  });

  it('FR-W6-10-02: GIVEN TacticalReport with impact projection, WHEN encode called, THEN remarks include time-to-impact', () => {
    const report = makeTacticalReport({ impactProjection: { timeToImpactSeconds: 30, lat: 51.51, lon: 4.87 } });
    const msg = formatter.encode(report);
    expect(msg.remarks).toContain('30');
  });

  it('FR-W6-10-03: GIVEN TacticalReport with no impact, WHEN encode called, THEN stale time set to 5 minutes from now', () => {
    const report = makeTacticalReport({ impactProjection: null });
    const msg = formatter.encode(report);
    const staleTime = new Date(msg.stale).getTime();
    const msgTime = new Date(msg.time).getTime();
    expect(staleTime - msgTime).toBeCloseTo(5 * 60 * 1000, -3); // ±1s tolerance
  });

  it('FR-W6-10-04: GIVEN speed in km/h, WHEN encode called, THEN BRAVE1 speed is in m/s', () => {
    const report = makeTacticalReport({ velocity: { speedKmh: 144, heading: 180, altitude: 100 } });
    const msg = formatter.encode(report);
    expect(msg.speed).toBeCloseTo(40, 1); // 144 km/h = 40 m/s
  });

  // --- decode ---

  it('FR-W6-10-05: GIVEN BRAVE1Message, WHEN decode called, THEN returns TacticalReport-like structure', () => {
    const brave1 = makeValidBRAVE1();
    const decoded = formatter.decode(brave1);
    expect(decoded.location.lat).toBeCloseTo(brave1.lat, 3);
    expect(decoded.location.lon).toBeCloseTo(brave1.lon, 3);
    expect(decoded.timestamp).toBe(brave1.time);
  });

  it('FR-W6-10-06: GIVEN decoded BRAVE1, WHEN speed checked, THEN converted back from m/s to km/h', () => {
    const brave1 = makeValidBRAVE1({ speed: 40 }); // 40 m/s
    const decoded = formatter.decode(brave1);
    expect(decoded.velocity.speedKmh).toBeCloseTo(144, 1);
  });

  // --- validate ---

  it('FR-W6-10-07: GIVEN valid BRAVE1Message, WHEN validate called, THEN returns {valid:true, errors:[]}', () => {
    const msg = makeValidBRAVE1();
    const result = formatter.validate(msg);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('FR-W6-10-08: GIVEN BRAVE1 missing uid field, WHEN validate called, THEN returns {valid:false, errors includes "uid"}', () => {
    const msg = makeValidBRAVE1({ uid: '' });
    const result = formatter.validate(msg);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('uid'))).toBe(true);
  });

  it('FR-W6-10-09: GIVEN BRAVE1 with lat out of range [-90,90], WHEN validate called, THEN returns invalid', () => {
    const msg = makeValidBRAVE1({ lat: 200 });
    const result = formatter.validate(msg);
    expect(result.valid).toBe(false);
  });

  it('FR-W6-10-10: GIVEN BRAVE1 missing type field, WHEN validate called, THEN error mentions "type"', () => {
    const msg = makeValidBRAVE1({ type: '' });
    const result = formatter.validate(msg);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('type'))).toBe(true);
  });
});
