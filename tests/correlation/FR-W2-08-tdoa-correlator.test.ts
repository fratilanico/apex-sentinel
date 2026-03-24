// APEX-SENTINEL — TDD RED Tests
// FR-W2-08: TDOA Correlation Engine
// Status: RED — implementation in src/correlation/tdoa-correlator.ts does NOT exist yet

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TdoaCorrelator,
  type DetectionEvent,
  type CorrelationResult,
} from '../../src/correlation/tdoa-correlator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _baseTimeUs = BigInt(1_700_000_000_000_000); // arbitrary epoch in µs

function makeEvent(
  nodeId: string,
  offsetUs = 0n,
  overrides: Partial<DetectionEvent> = {},
): DetectionEvent {
  return {
    nodeId,
    timestampUs: _baseTimeUs + offsetUs,
    droneConfidence: 0.9,
    spectralPeakHz: 2_400_000_000,
    lat: 51.5 + Math.random() * 0.01,
    lon: -0.1 + Math.random() * 0.01,
    altM: 100,
    timePrecisionUs: 10,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FR-W2-08-00: TDOA Correlation Engine', () => {

  describe('FR-W2-08-01: constructor sets windowMs', () => {
    it('getWindowMs() returns the value passed to constructor', () => {
      const correlator = new TdoaCorrelator(500, 3);
      expect(correlator.getWindowMs()).toBe(500);
    });

    it('different windowMs values are preserved independently', () => {
      const c1 = new TdoaCorrelator(100, 3);
      const c2 = new TdoaCorrelator(2000, 3);
      expect(c1.getWindowMs()).toBe(100);
      expect(c2.getWindowMs()).toBe(2000);
    });
  });

  describe('FR-W2-08-02: single event returns null (insufficient nodes)', () => {
    it('ingest() returns null for the first event', () => {
      const correlator = new TdoaCorrelator(1000, 3);
      const result = correlator.ingest(makeEvent('node-A'));
      expect(result).toBeNull();
    });
  });

  describe('FR-W2-08-03: two events below minNodes=3 return null', () => {
    it('ingest() returns null after second unique node (minNodes=3)', () => {
      const correlator = new TdoaCorrelator(1000, 3);
      correlator.ingest(makeEvent('node-A'));
      const result = correlator.ingest(makeEvent('node-B', 100n));
      expect(result).toBeNull();
    });
  });

  describe('FR-W2-08-04: three events within window produce CorrelationResult', () => {
    it('ingest() returns a CorrelationResult when third unique node is added', () => {
      const correlator = new TdoaCorrelator(1000, 3);
      correlator.ingest(makeEvent('node-A'));
      correlator.ingest(makeEvent('node-B', 100n));
      const result = correlator.ingest(makeEvent('node-C', 200n));
      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        trackId: expect.any(String),
        lat: expect.any(Number),
        lon: expect.any(Number),
        altM: expect.any(Number),
        errorM: expect.any(Number),
        confidence: expect.any(Number),
        nodeCount: expect.any(Number),
        method: expect.any(String),
        timestampUs: expect.any(BigInt),
        contributingNodes: expect.any(Array),
      });
    });
  });

  describe('FR-W2-08-05: method="tdoa" when 3+ nodes', () => {
    it('result.method is "tdoa" for 3-node correlation', () => {
      const correlator = new TdoaCorrelator(1000, 3);
      correlator.ingest(makeEvent('node-A'));
      correlator.ingest(makeEvent('node-B', 100n));
      const result = correlator.ingest(makeEvent('node-C', 200n));
      expect(result).not.toBeNull();
      expect((result as CorrelationResult).method).toBe('tdoa');
    });
  });

  describe('FR-W2-08-06: method="centroid" when exactly 2 nodes (minNodes=2)', () => {
    it('result.method is "centroid" for 2-node correlation', () => {
      const correlator = new TdoaCorrelator(1000, 2); // minNodes=2
      correlator.ingest(makeEvent('node-A'));
      const result = correlator.ingest(makeEvent('node-B', 100n));
      expect(result).not.toBeNull();
      expect((result as CorrelationResult).method).toBe('centroid');
    });
  });

  describe('FR-W2-08-07: duplicate nodeId within window is deduplicated', () => {
    it('second event from the same node does not count as a new node', () => {
      const correlator = new TdoaCorrelator(5000, 3);
      correlator.ingest(makeEvent('node-A', 0n));
      correlator.ingest(makeEvent('node-B', 100n));
      // Second event from node-A — should be ignored, still only 2 unique nodes
      const result = correlator.ingest(makeEvent('node-A', 200n));
      expect(result).toBeNull();
    });
  });

  describe('FR-W2-08-08: events outside window are expired', () => {
    it('old event at T=0 is gone after a new event at T=windowMs+1', () => {
      const windowMs = 500;
      const correlator = new TdoaCorrelator(windowMs, 3);

      const tOld = _baseTimeUs;
      const tNew = _baseTimeUs + BigInt((windowMs + 1) * 1000); // µs

      // Seed with two events close together
      correlator.ingest({ ...makeEvent('node-A'), timestampUs: tOld });
      correlator.ingest({ ...makeEvent('node-B'), timestampUs: tOld + 100n });

      // Advance time well past the window — old events should expire
      correlator.ingest({ ...makeEvent('node-C'), timestampUs: tNew });

      // node-A and node-B should have expired; only node-C remains → null
      const result = correlator.ingest({ ...makeEvent('node-D'), timestampUs: tNew + 100n });
      expect(result).toBeNull();
    });
  });

  describe('FR-W2-08-09: result.contributingNodes contains all node IDs', () => {
    it('contributingNodes has length 3 and contains all node IDs', () => {
      const correlator = new TdoaCorrelator(1000, 3);
      correlator.ingest(makeEvent('node-X'));
      correlator.ingest(makeEvent('node-Y', 100n));
      const result = correlator.ingest(makeEvent('node-Z', 200n)) as CorrelationResult;
      expect(result).not.toBeNull();
      expect(result.contributingNodes).toHaveLength(3);
      expect(result.contributingNodes).toContain('node-X');
      expect(result.contributingNodes).toContain('node-Y');
      expect(result.contributingNodes).toContain('node-Z');
    });
  });

  describe('FR-W2-08-10: result.confidence reflects average drone confidence', () => {
    it('confidence equals the mean of all contributing droneConfidence values', () => {
      const correlator = new TdoaCorrelator(1000, 3);
      correlator.ingest(makeEvent('node-A', 0n, { droneConfidence: 0.6 }));
      correlator.ingest(makeEvent('node-B', 100n, { droneConfidence: 0.8 }));
      const result = correlator.ingest(
        makeEvent('node-C', 200n, { droneConfidence: 1.0 }),
      ) as CorrelationResult;
      expect(result).not.toBeNull();
      // Average: (0.6 + 0.8 + 1.0) / 3 = 0.8
      expect(result.confidence).toBeCloseTo(0.8, 5);
    });
  });

  describe('FR-W2-08-11: getPendingCount() returns correct count', () => {
    it('returns 0 on fresh correlator', () => {
      const correlator = new TdoaCorrelator(1000, 3);
      expect(correlator.getPendingCount()).toBe(0);
    });

    it('returns 2 after two unique events that have not yet correlated', () => {
      const correlator = new TdoaCorrelator(1000, 3);
      correlator.ingest(makeEvent('node-A'));
      correlator.ingest(makeEvent('node-B', 100n));
      expect(correlator.getPendingCount()).toBe(2);
    });
  });

  describe('FR-W2-08-12: flush() returns pending correlations and clears state', () => {
    it('flush() returns empty array when no pending events', () => {
      const correlator = new TdoaCorrelator(1000, 3);
      expect(correlator.flush()).toEqual([]);
    });

    it('flush() clears pending events (getPendingCount returns 0 after flush)', () => {
      const correlator = new TdoaCorrelator(1000, 3);
      correlator.ingest(makeEvent('node-A'));
      correlator.ingest(makeEvent('node-B', 100n));
      expect(correlator.getPendingCount()).toBe(2);
      correlator.flush();
      expect(correlator.getPendingCount()).toBe(0);
    });

    it('flush() returns CorrelationResult array (may be empty if below threshold)', () => {
      const correlator = new TdoaCorrelator(1000, 2);
      correlator.ingest(makeEvent('node-A'));
      correlator.ingest(makeEvent('node-B', 100n));
      const results = correlator.flush();
      expect(Array.isArray(results)).toBe(true);
    });
  });

});
