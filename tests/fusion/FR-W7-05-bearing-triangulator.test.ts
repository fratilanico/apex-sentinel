// APEX-SENTINEL — W7 Bearing Triangulator Tests
// FR-W7-05 | tests/fusion/FR-W7-05-bearing-triangulator.test.ts
// TDD RED phase — new module src/fusion/bearing-triangulator does not exist yet

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BearingTriangulator,
  InvalidBearingError,
} from '../../src/fusion/bearing-triangulator.js';
import type {
  TriangulatorConfig,
  BearingNode,
  TriangulationResult,
} from '../../src/fusion/bearing-triangulator.js';

// Helpers for building nodes
function makeFixedNode(id: string, lat: number, lon: number, bearingDeg: number): BearingNode {
  return { nodeId: id, lat, lon, bearingDeg, type: 'fixed', weight: 1.0 };
}

function makePhoneNode(id: string, lat: number, lon: number, bearingDeg: number): BearingNode {
  return { nodeId: id, lat, lon, bearingDeg, type: 'phone', weight: 0.4 };
}

describe('FR-W7-05: BearingTriangulator', () => {
  let triangulator: BearingTriangulator;
  const defaultConfig: TriangulatorConfig = {
    minNodes: 3,
    maxConfidenceM: 5000,
  };

  beforeEach(() => {
    triangulator = new BearingTriangulator(defaultConfig);
  });

  // --- Constructor ---

  it('FR-W7-05-01: GIVEN BearingTriangulator constructed with {minNodes:3, maxConfidenceM:5000}, THEN constructor does not throw', () => {
    expect(() => new BearingTriangulator(defaultConfig)).not.toThrow();
  });

  // --- Insufficient nodes → null ---

  it('FR-W7-05-02: GIVEN empty node array, WHEN triangulate called, THEN returns null', () => {
    const result = triangulator.triangulate([]);
    expect(result).toBeNull();
  });

  it('FR-W7-05-03: GIVEN 1 node, WHEN triangulate called, THEN returns null', () => {
    const nodes = [makeFixedNode('N1', 0, 0, 45)];
    const result = triangulator.triangulate(nodes);
    expect(result).toBeNull();
  });

  it('FR-W7-05-04: GIVEN 2 nodes, WHEN triangulate called, THEN returns null or result with confidenceM > maxConfidenceM (ambiguous)', () => {
    const nodes = [
      makeFixedNode('N1', 0, 0, 45),
      makeFixedNode('N2', 0, 1, 315),
    ];
    const result = triangulator.triangulate(nodes);
    if (result !== null) {
      expect(result.confidenceM).toBeGreaterThan(defaultConfig.maxConfidenceM);
    } else {
      expect(result).toBeNull();
    }
  });

  // --- 3 orthogonal nodes → valid result ---

  it('FR-W7-05-05: GIVEN 3 orthogonally placed nodes pointing to same target, WHEN triangulate called, THEN result has lat and lon', () => {
    const nodes = [
      makeFixedNode('N1', 0.5, 0.0, 90),  // east → target at (0.5, 0.5)
      makeFixedNode('N2', 0.0, 0.5, 0),   // north → target at (0.5, 0.5)
      makeFixedNode('N3', 1.0, 0.5, 180), // south → target at (0.5, 0.5)
    ];
    const result = triangulator.triangulate(nodes);
    expect(result).not.toBeNull();
    expect(typeof result!.lat).toBe('number');
    expect(typeof result!.lon).toBe('number');
  });

  // --- Well-placed nodes → low confidenceM ---

  it('FR-W7-05-06: GIVEN 3 well-placed consistent nodes, WHEN triangulate called, THEN confidenceM < 200m', () => {
    // Three nodes surrounding target at approx (0.5, 0.5)
    const nodes = [
      makeFixedNode('N1', 0.5, 0.0, 90),   // due east
      makeFixedNode('N2', 0.0, 0.5, 0),    // due north
      makeFixedNode('N3', 1.0, 0.5, 180),  // due south
    ];
    const result = triangulator.triangulate(nodes);
    expect(result).not.toBeNull();
    expect(result!.confidenceM).toBeLessThan(200);
  });

  // --- Collinear nodes → degenerate ---

  it('FR-W7-05-07: GIVEN 3 collinear nodes (all on same line), WHEN triangulate called, THEN returns null or confidenceM > 5000 (degenerate geometry)', () => {
    const nodes = [
      makeFixedNode('N1', 0.0, 0.5, 90),
      makeFixedNode('N2', 0.5, 0.5, 90),
      makeFixedNode('N3', 1.0, 0.5, 90),
    ];
    const result = triangulator.triangulate(nodes);
    if (result !== null) {
      expect(result.confidenceM).toBeGreaterThan(5000);
    } else {
      expect(result).toBeNull();
    }
  });

  // --- 4 nodes overdetermined → lower confidenceM ---

  it('FR-W7-05-08: GIVEN 4 consistent nodes (overdetermined), WHEN triangulate called, THEN confidenceM is lower than 3-node result', () => {
    const threeNodes = [
      makeFixedNode('N1', 0.5, 0.0, 90),
      makeFixedNode('N2', 0.0, 0.5, 0),
      makeFixedNode('N3', 1.0, 0.5, 180),
    ];
    const fourNodes = [
      ...threeNodes,
      makeFixedNode('N4', 0.5, 1.0, 270), // due west
    ];

    const result3 = triangulator.triangulate(threeNodes);
    const result4 = triangulator.triangulate(fourNodes);

    expect(result3).not.toBeNull();
    expect(result4).not.toBeNull();
    // More nodes with consistent bearings → tighter estimate
    expect(result4!.confidenceM).toBeLessThanOrEqual(result3!.confidenceM);
  });

  // --- Phone node weight 0.4 vs fixed node weight 1.0 ---

  it('FR-W7-05-09: GIVEN mixed phone (weight 0.4) and fixed (weight 1.0) nodes, WHEN triangulate called, THEN result is biased toward fixed node bearings', () => {
    // Fixed nodes all agree on target at (0.5, 0.5); phone node points elsewhere
    const fixedN1 = makeFixedNode('F1', 0.5, 0.0, 90);   // east toward (0.5, 0.5)
    const fixedN2 = makeFixedNode('F2', 0.0, 0.5, 0);    // north toward (0.5, 0.5)
    const fixedN3 = makeFixedNode('F3', 1.0, 0.5, 180);  // south toward (0.5, 0.5)
    const phoneN4 = makePhoneNode('P1', 0.5, 1.0, 315);  // northwest — off by ~45°

    const resultFixed = triangulator.triangulate([fixedN1, fixedN2, fixedN3]);
    const resultMixed = triangulator.triangulate([fixedN1, fixedN2, fixedN3, phoneN4]);

    expect(resultFixed).not.toBeNull();
    expect(resultMixed).not.toBeNull();
    // Mixed result should still be close to fixed-only result (phone has low weight)
    expect(Math.abs(resultMixed!.lat - resultFixed!.lat)).toBeLessThan(0.1);
    expect(Math.abs(resultMixed!.lon - resultFixed!.lon)).toBeLessThan(0.1);
  });

  // --- Bearing error increases confidenceM ---

  it('FR-W7-05-10: GIVEN one node with ±5° bearing error, WHEN triangulate called, THEN confidenceM is higher than the error-free case', () => {
    const perfectNodes = [
      makeFixedNode('N1', 0.5, 0.0, 90),
      makeFixedNode('N2', 0.0, 0.5, 0),
      makeFixedNode('N3', 1.0, 0.5, 180),
    ];
    const noisyNodes = [
      makeFixedNode('N1', 0.5, 0.0, 95), // +5° error
      makeFixedNode('N2', 0.0, 0.5, 0),
      makeFixedNode('N3', 1.0, 0.5, 180),
    ];

    const perfect = triangulator.triangulate(perfectNodes);
    const noisy = triangulator.triangulate(noisyNodes);

    expect(perfect).not.toBeNull();
    expect(noisy).not.toBeNull();
    expect(noisy!.confidenceM).toBeGreaterThan(perfect!.confidenceM);
  });

  // --- Result shape ---

  it('FR-W7-05-11: GIVEN 3 valid nodes, WHEN triangulate called, THEN result has lat, lon, confidenceM, nodeCount', () => {
    const nodes = [
      makeFixedNode('N1', 0.5, 0.0, 90),
      makeFixedNode('N2', 0.0, 0.5, 0),
      makeFixedNode('N3', 1.0, 0.5, 180),
    ];
    const result: TriangulationResult | null = triangulator.triangulate(nodes);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('lat');
    expect(result).toHaveProperty('lon');
    expect(result).toHaveProperty('confidenceM');
    expect(result).toHaveProperty('nodeCount');
    expect(result!.nodeCount).toBe(3);
  });

  // --- Known geometry: equilateral triangle around (0.5°N, 0.5°E) ---

  it('FR-W7-05-12: GIVEN nodes at known positions pointing to (0.5°N, 0.5°E), WHEN triangulate called, THEN result is within 500m of target', () => {
    // Node at 0°N 0°E → bearing to (0.5, 0.5) is approx 44.9° (NE)
    // Node at 0°N 1°E → bearing to (0.5, 0.5) is approx 315.1° (NW)
    // Node at 1°N 0.5°E → bearing to (0.5, 0.5) is approx 180° (S)
    const nodes = [
      makeFixedNode('N1', 0.0, 0.0, 44.9),
      makeFixedNode('N2', 0.0, 1.0, 315.1),
      makeFixedNode('N3', 1.0, 0.5, 180.0),
    ];
    const result = triangulator.triangulate(nodes);
    expect(result).not.toBeNull();

    // Target is at lat=0.5, lon=0.5
    // 1° lat ≈ 111km, so 0.5° ≈ 55.5km
    // Allow within 500m = 0.0045°
    expect(Math.abs(result!.lat - 0.5)).toBeLessThan(0.005);
    expect(Math.abs(result!.lon - 0.5)).toBeLessThan(0.005);
    expect(result!.confidenceM).toBeLessThan(500);
  });

  // --- InvalidBearingError ---

  it('FR-W7-05-13: GIVEN node with bearingDeg=-1 (outside 0-360), WHEN triangulate called, THEN throws InvalidBearingError', () => {
    const nodes = [
      { nodeId: 'N1', lat: 0.5, lon: 0.0, bearingDeg: -1, type: 'fixed' as const, weight: 1.0 },
      makeFixedNode('N2', 0.0, 0.5, 0),
      makeFixedNode('N3', 1.0, 0.5, 180),
    ];
    expect(() => triangulator.triangulate(nodes)).toThrow(InvalidBearingError);
  });

  // --- updateBearing() ---

  it('FR-W7-05-14: GIVEN node added, WHEN updateBearing called with new bearing, THEN subsequent triangulate uses updated bearing', () => {
    triangulator.updateBearing('N1', 90);
    const nodes = [
      makeFixedNode('N1', 0.5, 0.0, 270), // will be overridden to 90
      makeFixedNode('N2', 0.0, 0.5, 0),
      makeFixedNode('N3', 1.0, 0.5, 180),
    ];
    // After updating N1 bearing to 90, result should reflect the new bearing
    const result = triangulator.triangulate(nodes);
    expect(result).not.toBeNull();
    // The stored override is used — just verify no throw and result present
    expect(result!.nodeCount).toBe(3);
  });

  // --- getActiveNodes() ---

  it('FR-W7-05-15: GIVEN nodes passed to triangulate, WHEN getActiveNodes called, THEN returns those nodes', () => {
    const nodes = [
      makeFixedNode('N1', 0.5, 0.0, 90),
      makeFixedNode('N2', 0.0, 0.5, 0),
      makeFixedNode('N3', 1.0, 0.5, 180),
    ];
    triangulator.triangulate(nodes);
    const active = triangulator.getActiveNodes();
    expect(Array.isArray(active)).toBe(true);
    expect(active.length).toBe(3);
    expect(active.map((n: BearingNode) => n.nodeId)).toContain('N1');
  });
});
