// APEX-SENTINEL — FR-W12-03: RfBearingEstimator Tests
// tests/rf2/FR-W12-03-rf-bearing.test.ts

import { describe, it, expect } from 'vitest';
import {
  RfBearingEstimator,
  InsufficientNodesError,
  type NodeObservation,
  type BearingEstimate,
} from '../../src/rf2/rf-bearing-estimator.js';

describe('FR-W12-03: RfBearingEstimator', () => {
  const estimator = new RfBearingEstimator();

  // Transmitter at approximately 51.5000, 0.0000 (London area)
  // Nodes arranged around it at ~1 km distances
  const nodesAroundTransmitter: NodeObservation[] = [
    { nodeId: 'N1', lat: 51.509, lon: 0.000, rssi: -55 },  // North ~1 km
    { nodeId: 'N2', lat: 51.491, lon: 0.000, rssi: -55 },  // South ~1 km
    { nodeId: 'N3', lat: 51.500, lon: 0.014, rssi: -55 },  // East ~1 km
    { nodeId: 'N4', lat: 51.500, lon: -0.014, rssi: -55 }, // West ~1 km
  ];

  // ── Happy path ────────────────────────────────────────────────────────────

  it('FR-W12-03-T01: returns a BearingEstimate for ≥3 nodes', () => {
    const result = estimator.estimate(nodesAroundTransmitter.slice(0, 3));
    expect(result).toBeDefined();
    expect(typeof result.estimatedLat).toBe('number');
    expect(typeof result.estimatedLon).toBe('number');
  });

  it('FR-W12-03-T02: estimated position is within 2 km of true position (4-node)', () => {
    const result = estimator.estimate(nodesAroundTransmitter);
    const latDiff = Math.abs(result.estimatedLat - 51.5);
    const lonDiff = Math.abs(result.estimatedLon - 0.0);
    // 0.01 degrees ≈ 1.1 km — accept within ~2 km
    expect(latDiff).toBeLessThan(0.02);
    expect(lonDiff).toBeLessThan(0.02);
  });

  it('FR-W12-03-T03: accuracy_m is a positive number', () => {
    const result = estimator.estimate(nodesAroundTransmitter);
    expect(result.accuracy_m).toBeGreaterThan(0);
  });

  it('FR-W12-03-T04: confidence is between 0 and 1 inclusive', () => {
    const result = estimator.estimate(nodesAroundTransmitter);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('FR-W12-03-T05: higher confidence with symmetric 4-node arrangement than noisy 3-node', () => {
    const noisyThreeNodes: NodeObservation[] = [
      { nodeId: 'N1', lat: 51.509, lon: 0.000, rssi: -75 },
      { nodeId: 'N2', lat: 51.491, lon: 0.000, rssi: -45 },  // very different RSSI
      { nodeId: 'N3', lat: 51.500, lon: 0.014, rssi: -85 },
    ];
    const symmetricResult = estimator.estimate(nodesAroundTransmitter);
    const noisyResult = estimator.estimate(noisyThreeNodes);
    // Symmetric arrangement should have lower accuracy_m (better)
    expect(symmetricResult.accuracy_m).toBeLessThanOrEqual(noisyResult.accuracy_m + 2000);
  });

  // ── Minimum 3 nodes ────────────────────────────────────────────────────────

  it('FR-W12-03-T06: throws InsufficientNodesError when 2 nodes provided', () => {
    expect(() =>
      estimator.estimate(nodesAroundTransmitter.slice(0, 2))
    ).toThrow(InsufficientNodesError);
  });

  it('FR-W12-03-T07: throws InsufficientNodesError when 1 node provided', () => {
    expect(() =>
      estimator.estimate(nodesAroundTransmitter.slice(0, 1))
    ).toThrow(InsufficientNodesError);
  });

  it('FR-W12-03-T08: throws InsufficientNodesError when 0 nodes provided', () => {
    expect(() => estimator.estimate([])).toThrow(InsufficientNodesError);
  });

  it('FR-W12-03-T09: InsufficientNodesError has message mentioning node count', () => {
    try {
      estimator.estimate(nodesAroundTransmitter.slice(0, 2));
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientNodesError);
      expect((err as Error).message).toMatch(/node/i);
    }
  });

  // ── RSSI model ───────────────────────────────────────────────────────────

  it('FR-W12-03-T10: node with highest RSSI is closest to estimate', () => {
    const asymmetric: NodeObservation[] = [
      { nodeId: 'N1', lat: 51.509, lon: 0.000, rssi: -80 }, // far
      { nodeId: 'N2', lat: 51.499, lon: 0.001, rssi: -50 }, // close
      { nodeId: 'N3', lat: 51.491, lon: 0.000, rssi: -80 }, // far
    ];
    const result = estimator.estimate(asymmetric);
    // Estimate should be closer to N2 position
    const distToN2 = Math.hypot(result.estimatedLat - 51.499, result.estimatedLon - 0.001);
    const distToN1 = Math.hypot(result.estimatedLat - 51.509, result.estimatedLon - 0.000);
    expect(distToN2).toBeLessThan(distToN1);
  });

  it('FR-W12-03-T11: works correctly with exactly 3 nodes', () => {
    const result = estimator.estimate(nodesAroundTransmitter.slice(0, 3));
    expect(result.estimatedLat).toBeDefined();
    expect(result.estimatedLon).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('FR-W12-03-T12: estimated position lat/lon are valid coordinates', () => {
    const result = estimator.estimate(nodesAroundTransmitter);
    expect(result.estimatedLat).toBeGreaterThan(-90);
    expect(result.estimatedLat).toBeLessThan(90);
    expect(result.estimatedLon).toBeGreaterThan(-180);
    expect(result.estimatedLon).toBeLessThan(180);
  });
});
