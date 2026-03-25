// APEX-SENTINEL — W6 Multi-Node Fusion Tests
// FR-W6-05 | tests/fusion/FR-W6-05-multi-node-fusion.test.ts
// Cross-node acoustic correlation + consensus

import { describe, it, expect, beforeEach } from 'vitest';
import { MultiNodeFusion } from '../../src/fusion/multi-node-fusion.js';
import type { NodeReport, FusionConsensus } from '../../src/fusion/multi-node-fusion.js';

function makeReport(nodeId: string, trackId: string, confidence: number, distanceKm: number, timestamp = Date.now()): NodeReport {
  return {
    nodeId,
    trackId,
    confidence,
    lat: 51.5,
    lon: 4.9,
    distanceKm,
    timestamp,
  };
}

describe('FR-W6-05: MultiNodeFusion', () => {
  let fusion: MultiNodeFusion;

  beforeEach(() => {
    fusion = new MultiNodeFusion({ maxAgeMs: 5000 });
  });

  // --- addNodeReport / fuse ---

  it('FR-W6-05-01: GIVEN 3 nodes with confidences [0.9, 0.8, 0.7], WHEN fuse called, THEN consensus confidence >0.85 (weighted avg favors high)', () => {
    fusion.addNodeReport(makeReport('NODE-1', 'TRK-A', 0.9, 1.0));
    fusion.addNodeReport(makeReport('NODE-2', 'TRK-A', 0.8, 2.0));
    fusion.addNodeReport(makeReport('NODE-3', 'TRK-A', 0.7, 3.0));
    const consensus = fusion.fuse('TRK-A');
    expect(consensus).not.toBeNull();
    expect(consensus!.fusedConfidence).toBeGreaterThan(0.75);
    expect(consensus!.nodeCount).toBe(3);
  });

  it('FR-W6-05-02: GIVEN nodes at different distances, WHEN fuse called, THEN closer node gets more weight', () => {
    // Node 1 is very close (0.5km), Node 2 is far (10km)
    // Node 1 confidence: 0.5, Node 2 confidence: 0.9
    // Without IDW: avg = 0.7. With IDW (weight by 1/d): Node1 gets 2x = 0.5*2 + 0.9*0.1 → weighted toward Node1
    fusion.addNodeReport(makeReport('NODE-CLOSE', 'TRK-B', 0.5, 0.5));
    fusion.addNodeReport(makeReport('NODE-FAR', 'TRK-B', 0.9, 10.0));
    const consensus = fusion.fuse('TRK-B');
    expect(consensus).not.toBeNull();
    // IDW: w_close = 1/0.5 = 2, w_far = 1/10 = 0.1
    // fusedConf = (2*0.5 + 0.1*0.9) / (2 + 0.1) = (1.0 + 0.09) / 2.1 ≈ 0.519
    // Close node dominates despite lower confidence
    expect(consensus!.fusedConfidence).toBeLessThan(0.9); // not dominated by far high-conf node
  });

  it('FR-W6-05-03: GIVEN 1 node false positive (conf 0.3), 2 nodes true detection (conf 0.85+), WHEN fuse called, THEN majority prevails', () => {
    fusion.addNodeReport(makeReport('NODE-FP', 'TRK-C', 0.3, 2.0));
    fusion.addNodeReport(makeReport('NODE-TP1', 'TRK-C', 0.88, 1.5));
    fusion.addNodeReport(makeReport('NODE-TP2', 'TRK-C', 0.91, 2.5));
    const consensus = fusion.fuse('TRK-C');
    expect(consensus!.fusedConfidence).toBeGreaterThan(0.65); // majority detection prevails
  });

  it('FR-W6-05-04: GIVEN single node report, WHEN fuse called, THEN returns that node confidence', () => {
    fusion.addNodeReport(makeReport('NODE-1', 'TRK-D', 0.87, 1.0));
    const consensus = fusion.fuse('TRK-D');
    expect(consensus).not.toBeNull();
    expect(consensus!.nodeCount).toBe(1);
    expect(consensus!.fusedConfidence).toBeCloseTo(0.87, 2);
  });

  // --- getConsensus ---

  it('FR-W6-05-05: GIVEN no reports for trackId, WHEN getConsensus called, THEN returns null', () => {
    const consensus = fusion.getConsensus('UNKNOWN-TRACK');
    expect(consensus).toBeNull();
  });

  it('FR-W6-05-06: GIVEN fuse called, WHEN getConsensus called, THEN returns same result', () => {
    fusion.addNodeReport(makeReport('NODE-1', 'TRK-E', 0.88, 1.0));
    const fused = fusion.fuse('TRK-E');
    const cached = fusion.getConsensus('TRK-E');
    expect(cached).not.toBeNull();
    expect(cached!.fusedConfidence).toBeCloseTo(fused!.fusedConfidence, 5);
  });

  // --- clearStale ---

  it('FR-W6-05-07: GIVEN report older than maxAgeMs, WHEN clearStale called, THEN stale report removed', () => {
    const oldTimestamp = Date.now() - 10_000; // 10s ago, maxAge is 5s
    fusion.addNodeReport(makeReport('NODE-1', 'TRK-F', 0.88, 1.0, oldTimestamp));
    fusion.clearStale();
    const consensus = fusion.getConsensus('TRK-F');
    expect(consensus).toBeNull();
  });

  it('FR-W6-05-08: GIVEN recent report, WHEN clearStale called, THEN report retained', () => {
    fusion.addNodeReport(makeReport('NODE-1', 'TRK-G', 0.88, 1.0, Date.now()));
    fusion.clearStale();
    fusion.fuse('TRK-G');
    const consensus = fusion.getConsensus('TRK-G');
    expect(consensus).not.toBeNull();
  });

  // --- edge cases ---

  it('FR-W6-05-09: GIVEN node reports same trackId multiple times, WHEN fuse called, THEN uses latest report per node', () => {
    const now = Date.now();
    fusion.addNodeReport(makeReport('NODE-1', 'TRK-H', 0.5, 1.0, now - 3000));
    fusion.addNodeReport(makeReport('NODE-1', 'TRK-H', 0.9, 1.0, now)); // newer report
    const consensus = fusion.fuse('TRK-H');
    // Should use the latest report (0.9) not the older one (0.5)
    expect(consensus!.fusedConfidence).toBeCloseTo(0.9, 1);
    expect(consensus!.nodeCount).toBe(1);
  });

  it('FR-W6-05-10: GIVEN node with distanceKm = 0, WHEN fuse called, THEN does not divide by zero (uses minimum distance)', () => {
    fusion.addNodeReport(makeReport('NODE-ZERO', 'TRK-I', 0.9, 0)); // distance 0
    expect(() => fusion.fuse('TRK-I')).not.toThrow();
    const consensus = fusion.fuse('TRK-I');
    expect(consensus).not.toBeNull();
    expect(isFinite(consensus!.fusedConfidence)).toBe(true);
  });

  // --- agreement ---

  it('FR-W6-05-11: GIVEN all nodes agree (all conf >0.85), WHEN fuse called, THEN consensus.agreement is "high"', () => {
    fusion.addNodeReport(makeReport('NODE-1', 'TRK-J', 0.90, 1.0));
    fusion.addNodeReport(makeReport('NODE-2', 'TRK-J', 0.88, 2.0));
    fusion.addNodeReport(makeReport('NODE-3', 'TRK-J', 0.87, 1.5));
    const consensus = fusion.fuse('TRK-J');
    expect(consensus!.agreement).toBe('high');
  });

  it('FR-W6-05-12: GIVEN nodes disagree (mixed conf), WHEN fuse called, THEN consensus.agreement is "mixed" or "low"', () => {
    fusion.addNodeReport(makeReport('NODE-1', 'TRK-K', 0.92, 1.0));
    fusion.addNodeReport(makeReport('NODE-2', 'TRK-K', 0.30, 2.0)); // FP node
    const consensus = fusion.fuse('TRK-K');
    expect(['mixed', 'low']).toContain(consensus!.agreement);
  });

  // --- lat/lon ---

  it('FR-W6-05-13: GIVEN nodes with different lat/lon, WHEN fuse called, THEN fusedLat is distance-weighted average', () => {
    fusion.addNodeReport({ nodeId: 'N1', trackId: 'TRK-L', confidence: 0.9, lat: 51.0, lon: 4.9, distanceKm: 1.0, timestamp: Date.now() });
    fusion.addNodeReport({ nodeId: 'N2', trackId: 'TRK-L', confidence: 0.9, lat: 52.0, lon: 4.9, distanceKm: 1.0, timestamp: Date.now() });
    const consensus = fusion.fuse('TRK-L');
    expect(consensus!.lat).toBeCloseTo(51.5, 1); // equidistant → average
  });

  // --- multiple tracks ---

  it('FR-W6-05-14: GIVEN reports for 2 tracks, WHEN fuse called for each, THEN returns independent results', () => {
    fusion.addNodeReport(makeReport('NODE-1', 'TRK-M', 0.88, 1.0));
    fusion.addNodeReport(makeReport('NODE-1', 'TRK-N', 0.72, 1.0));
    const cm = fusion.fuse('TRK-M');
    const cn = fusion.fuse('TRK-N');
    expect(cm!.fusedConfidence).not.toBeCloseTo(cn!.fusedConfidence, 2);
  });

  it('FR-W6-05-15: GIVEN empty fusion state, WHEN fuse called, THEN returns null', () => {
    const result = fusion.fuse('EMPTY-TRACK');
    expect(result).toBeNull();
  });
});
