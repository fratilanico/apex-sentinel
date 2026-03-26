import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NodeHealthAggregator } from '../../src/dashboard/node-health-aggregator.js';

describe('FR-W14-05: NodeHealthAggregator — sensor node health', () => {
  let agg: NodeHealthAggregator;

  beforeEach(() => {
    vi.useFakeTimers();
    agg = new NodeHealthAggregator();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('NH-01: 3 demo nodes pre-populated on construction', () => {
    expect(agg.getNodeCount()).toBe(3);
  });

  it('NH-02: demo nodes are Node-RO-01, Node-RO-02, Node-RO-03', () => {
    const nodes = agg.getNodeGrid();
    const ids = nodes.map(n => n.nodeId).sort();
    expect(ids).toEqual(['Node-RO-01', 'Node-RO-02', 'Node-RO-03']);
  });

  it('NH-03: fresh demo nodes are online', () => {
    const nodes = agg.getNodeGrid();
    for (const n of nodes) {
      expect(n.status).toBe('online');
    }
  });

  it('NH-04: node goes degraded after 60s silence', () => {
    vi.advanceTimersByTime(65_000);
    const nodes = agg.getNodeGrid();
    for (const n of nodes) {
      expect(n.status).toBe('degraded');
    }
  });

  it('NH-05: node goes offline after 120s silence', () => {
    vi.advanceTimersByTime(125_000);
    const nodes = agg.getNodeGrid();
    for (const n of nodes) {
      expect(n.status).toBe('offline');
    }
  });

  it('NH-06: updateHeartbeat resets node to online', () => {
    vi.advanceTimersByTime(130_000); // node offline
    agg.updateHeartbeat('Node-RO-01', { nodeId: 'Node-RO-01' });
    const node = agg.getNode('Node-RO-01');
    expect(node?.status).toBe('online');
  });

  it('NH-07: updateHeartbeat updates detectionCount', () => {
    agg.updateHeartbeat('Node-RO-01', { nodeId: 'Node-RO-01', detectionCount: 5 });
    const node = agg.getNode('Node-RO-01');
    expect(node?.detectionCount).toBe(5);
  });

  it('NH-08: updateHeartbeat updates batteryPct', () => {
    agg.updateHeartbeat('Node-RO-01', { nodeId: 'Node-RO-01', batteryPct: 72 });
    const node = agg.getNode('Node-RO-01');
    expect(node?.batteryPct).toBe(72);
  });

  it('NH-09: updateHeartbeat adds new node if not found', () => {
    agg.updateHeartbeat('Node-RO-99', { nodeId: 'Node-RO-99', lat: 44.5, lon: 26.2 });
    expect(agg.getNodeCount()).toBe(4);
    const node = agg.getNode('Node-RO-99');
    expect(node).toBeDefined();
    expect(node?.lat).toBe(44.5);
  });

  it('NH-10: coverage radius is 3.5km for all acoustic nodes', () => {
    const nodes = agg.getNodeGrid();
    for (const n of nodes) {
      expect(n.coverageRadiusKm).toBe(3.5);
    }
  });

  it('NH-11: getNode returns undefined for unknown nodeId', () => {
    expect(agg.getNode('Node-UNKNOWN')).toBeUndefined();
  });

  it('NH-12: reset() repopulates 3 demo nodes', () => {
    agg.updateHeartbeat('Node-RO-99', { nodeId: 'Node-RO-99' });
    expect(agg.getNodeCount()).toBe(4);
    agg.reset();
    expect(agg.getNodeCount()).toBe(3);
  });

  it('NH-13: Romania theater coordinates (lat ~44.4, lon ~26.1)', () => {
    const nodes = agg.getNodeGrid();
    for (const n of nodes) {
      expect(n.lat).toBeGreaterThan(44.0);
      expect(n.lat).toBeLessThan(45.0);
      expect(n.lon).toBeGreaterThan(25.5);
      expect(n.lon).toBeLessThan(27.0);
    }
  });
});
