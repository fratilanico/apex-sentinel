// APEX-SENTINEL — TDD RED Tests
// FR-14: TDOA Multi-Node Triangulation
// FR-16: Centroid Fallback for 2-Node Detection
// Status: RED — implementation in src/tracking/tdoa.ts NOT_IMPLEMENTED

import { describe, it, expect, beforeEach } from 'vitest';
import { TdoaSolver } from '../../src/tracking/tdoa.js';
import { TdoaInput } from '../../src/tracking/types.js';

const SPEED_OF_SOUND = 343; // m/s

// Simulate drone at (48.2248, 24.3362, alt=30)
// with 3 nodes detecting it at staggered timestamps

function makeInputs(dronePos: [number, number], nodePositions: [number, number][]): TdoaInput[] {
  // Simple: nodes at different positions, timestamps offset by distance/speed_of_sound
  // lat/lon differences converted roughly to meters (approx, equatorial)
  const DEG_TO_M = 111_000;
  return nodePositions.map((nodePos, i) => {
    const dLat = (dronePos[0] - nodePos[0]) * DEG_TO_M;
    const dLon = (dronePos[1] - nodePos[1]) * DEG_TO_M;
    const distM = Math.sqrt(dLat * dLat + dLon * dLon);
    const delayUs = BigInt(Math.round((distM / SPEED_OF_SOUND) * 1_000_000));
    return {
      nodeId: `node-${i.toString().padStart(2, '0')}`,
      timestampUs: BigInt(1_711_234_567_000_000) + delayUs,
      lat: nodePos[0],
      lon: nodePos[1],
      timePrecisionUs: i === 0 ? 1 : 50_000, // node-00 is GPS-PPS, rest are smartphones
    };
  });
}

describe('FR-14-00: TDOA Multi-Node Triangulation', () => {
  let solver: TdoaSolver;

  beforeEach(() => {
    solver = new TdoaSolver();
  });

  it('FR-14-01: requires minimum 2 nodes, throws with <2', () => {
    const singleNode: TdoaInput[] = [{
      nodeId: 'node-00',
      timestampUs: BigInt(1_711_234_567_000_000),
      lat: 48.2200,
      lon: 24.3300,
      timePrecisionUs: 1,
    }];
    expect(() => solver.solve(singleNode)).toThrow('INSUFFICIENT_NODES');
  });

  it('FR-14-02: 3 nodes produces solvable result', () => {
    const inputs = makeInputs([48.2248, 24.3362], [
      [48.2200, 24.3300],
      [48.2300, 24.3400],
      [48.2150, 24.3450],
    ]);
    const result = solver.solve(inputs);
    expect(result.solvable).toBe(true);
  });

  it('FR-14-03: estimated position within ±100m of actual (smartphone tier)', () => {
    const dronePos: [number, number] = [48.2248, 24.3362];
    const inputs = makeInputs(dronePos, [
      [48.2200, 24.3300],
      [48.2300, 24.3400],
      [48.2150, 24.3450],
    ]);
    const result = solver.solve(inputs);
    const DEG_TO_M = 111_000;
    const errorLat = Math.abs(result.estimatedLat - dronePos[0]) * DEG_TO_M;
    const errorLon = Math.abs(result.estimatedLon - dronePos[1]) * DEG_TO_M;
    const totalErrorM = Math.sqrt(errorLat * errorLat + errorLon * errorLon);
    expect(totalErrorM).toBeLessThan(100);
  });

  it('FR-14-04: positionErrorM reflects timing precision', () => {
    const inputs = makeInputs([48.2248, 24.3362], [
      [48.2200, 24.3300],
      [48.2300, 24.3400],
      [48.2150, 24.3450],
    ]);
    const result = solver.solve(inputs);
    // With mixed GPS-PPS + smartphones, error should be >10m but <150m
    expect(result.positionErrorM).toBeGreaterThan(10);
    expect(result.positionErrorM).toBeLessThan(150);
  });

  it('FR-14-05: contributingNodes lists all input nodes', () => {
    const inputs = makeInputs([48.2248, 24.3362], [
      [48.2200, 24.3300],
      [48.2300, 24.3400],
      [48.2150, 24.3450],
    ]);
    const result = solver.solve(inputs);
    expect(result.contributingNodes).toHaveLength(3);
    expect(result.contributingNodes).toContain('node-00');
  });

  it('FR-14-06: GPS-PPS nodes produce smaller error than smartphone-only', () => {
    const dronePos: [number, number] = [48.2248, 24.3362];

    const gpsPpsInputs = makeInputs(dronePos, [
      [48.2200, 24.3300],
      [48.2300, 24.3400],
      [48.2150, 24.3450],
    ]).map(n => ({ ...n, timePrecisionUs: 1 })); // all GPS-PPS

    const smartphoneInputs = makeInputs(dronePos, [
      [48.2200, 24.3300],
      [48.2300, 24.3400],
      [48.2150, 24.3450],
    ]).map(n => ({ ...n, timePrecisionUs: 50_000 })); // all smartphones

    const gpsResult = solver.solve(gpsPpsInputs);
    const phoneResult = solver.solve(smartphoneInputs);
    expect(gpsResult.positionErrorM).toBeLessThan(phoneResult.positionErrorM);
  });
});

describe('FR-16-00: Centroid Fallback for 2-Node Detection', () => {
  let solver: TdoaSolver;

  beforeEach(() => {
    solver = new TdoaSolver();
  });

  it('FR-16-01: 2 nodes produces centroid result', () => {
    const inputs: TdoaInput[] = [
      {
        nodeId: 'node-00',
        timestampUs: BigInt(1_711_234_567_000_000),
        lat: 48.2200,
        lon: 24.3300,
        timePrecisionUs: 1,
      },
      {
        nodeId: 'node-01',
        timestampUs: BigInt(1_711_234_567_100_000),
        lat: 48.2300,
        lon: 24.3400,
        timePrecisionUs: 50_000,
      },
    ];
    const result = solver.centroidFallback(inputs);
    expect(result.solvable).toBe(true);
    // Centroid = midpoint between two nodes
    expect(result.estimatedLat).toBeCloseTo(48.225, 2);
    expect(result.estimatedLon).toBeCloseTo(24.335, 2);
  });

  it('FR-16-02: centroid fallback has larger error than 3-node TDOA', () => {
    const twoNodeInputs: TdoaInput[] = [
      {
        nodeId: 'node-00',
        timestampUs: BigInt(1_711_234_567_000_000),
        lat: 48.2200,
        lon: 24.3300,
        timePrecisionUs: 1,
      },
      {
        nodeId: 'node-01',
        timestampUs: BigInt(1_711_234_567_100_000),
        lat: 48.2300,
        lon: 24.3400,
        timePrecisionUs: 1,
      },
    ];

    const threeNodeInputs: TdoaInput[] = [
      ...twoNodeInputs,
      {
        nodeId: 'node-02',
        timestampUs: BigInt(1_711_234_567_050_000),
        lat: 48.2150,
        lon: 24.3450,
        timePrecisionUs: 1,
      },
    ];

    const centroid = solver.centroidFallback(twoNodeInputs);
    const tdoa3 = solver.solve(threeNodeInputs);
    expect(centroid.positionErrorM).toBeGreaterThanOrEqual(tdoa3.positionErrorM);
  });
});
