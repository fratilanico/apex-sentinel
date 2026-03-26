import { describe, it, expect } from 'vitest';
import { DetectionSerializer, type RawDetection } from '../../src/dashboard/detection-serializer.js';

describe('FR-W14-03: DetectionSerializer — privacy-safe serialization', () => {
  const serializer = new DetectionSerializer();

  const base: RawDetection = {
    id: 'det-001',
    droneType: 'Shahed-136',
    awningLevel: 'GREEN',
    stage: 1,
    lat: 44.435678,
    lon: 26.102345,
    ts: 1711234567890,
    icao24: 'ABC123',
    uasId: 'UA-9999',
    rfSessionId: 'RF-SESSION-42',
  };

  it('DS-01: Stage 1 — no lat/lon in output', () => {
    const result = serializer.serialize({ ...base, stage: 1 });
    expect(result.approxLat).toBeUndefined();
    expect(result.approxLon).toBeUndefined();
  });

  it('DS-02: Stage 1 — no trajectory in output', () => {
    const result = serializer.serialize({
      ...base,
      stage: 1,
      trajectory: [{ lat: 44.4, lon: 26.1, altM: 100, ts: Date.now() }],
    });
    expect(result.trajectory).toBeUndefined();
  });

  it('DS-03: Stage 1 — strips ICAO24, UAS ID, RF session ID', () => {
    const result = serializer.serialize({ ...base, stage: 1 }) as Record<string, unknown>;
    expect(result['icao24']).toBeUndefined();
    expect(result['uasId']).toBeUndefined();
    expect(result['rfSessionId']).toBeUndefined();
  });

  it('DS-04: Stage 2 — approxLat/approxLon coarsened to 0.01°', () => {
    const result = serializer.serialize({ ...base, stage: 2 });
    expect(result.approxLat).toBe(44.44); // Math.round(44.435678 * 100) / 100
    expect(result.approxLon).toBe(26.10); // Math.round(26.102345 * 100) / 100
  });

  it('DS-05: Stage 2 — no trajectory', () => {
    const result = serializer.serialize({
      ...base,
      stage: 2,
      trajectory: [{ lat: 44.4, lon: 26.1, altM: 100, ts: Date.now() }],
    });
    expect(result.trajectory).toBeUndefined();
  });

  it('DS-06: Stage 3 — precise lat/lon included', () => {
    const result = serializer.serialize({ ...base, stage: 3 });
    expect(result.approxLat).toBe(44.435678);
    expect(result.approxLon).toBe(26.102345);
  });

  it('DS-07: Stage 3 — trajectory included if present', () => {
    const traj = [{ lat: 44.4, lon: 26.1, altM: 100, ts: Date.now() }];
    const result = serializer.serialize({ ...base, stage: 3, trajectory: traj });
    expect(result.trajectory).toEqual(traj);
  });

  it('DS-08: AWNING RED — trajectory always included regardless of stage', () => {
    const traj = [{ lat: 44.4, lon: 26.1, altM: 100, ts: Date.now() }];
    // Stage 3 with RED awning
    const result = serializer.serialize({ ...base, stage: 3, awningLevel: 'RED', trajectory: traj }, 'RED');
    expect(result.trajectory).toEqual(traj);
  });

  it('DS-09: output shape has required fields', () => {
    const result = serializer.serialize({ ...base, stage: 1 });
    expect(result).toHaveProperty('id', 'det-001');
    expect(result).toHaveProperty('droneType', 'Shahed-136');
    expect(result).toHaveProperty('awningLevel', 'GREEN');
    expect(result).toHaveProperty('stage', 1);
    expect(result).toHaveProperty('ts', 1711234567890);
  });

  it('DS-10: serializeMany processes array correctly', () => {
    const raws: RawDetection[] = [
      { ...base, id: 'det-001', stage: 1 },
      { ...base, id: 'det-002', stage: 2 },
      { ...base, id: 'det-003', stage: 3 },
    ];
    const results = serializer.serializeMany(raws);
    expect(results).toHaveLength(3);
    expect(results[0].approxLat).toBeUndefined();
    expect(results[1].approxLat).toBeDefined();
    expect(results[2].approxLat).toBe(44.435678);
  });

  it('DS-11: Stage 2 — no lat/lon in raw → no approxLat/Lon output', () => {
    const noPosition: RawDetection = { ...base, stage: 2, lat: undefined, lon: undefined };
    const result = serializer.serialize(noPosition);
    expect(result.approxLat).toBeUndefined();
    expect(result.approxLon).toBeUndefined();
  });

  it('DS-12: currentAwningLevel overrides raw awning level for trajectory decision', () => {
    const traj = [{ lat: 44.4, lon: 26.1, altM: 100, ts: Date.now() }];
    // Raw says ORANGE, but current is RED → should include trajectory for stage 3
    const result = serializer.serialize({ ...base, stage: 3, awningLevel: 'ORANGE', trajectory: traj }, 'RED');
    expect(result.trajectory).toEqual(traj);
  });
});
