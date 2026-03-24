// APEX-SENTINEL — TDD RED Tests
// FR-11: Node Registration and Discovery
// Status: RED — implementation in src/node/registry.ts NOT_IMPLEMENTED

import { describe, it, expect, beforeEach } from 'vitest';
import { NodeRegistry } from '../../src/node/registry.js';
import { NodeRegistration, NodeHeartbeat } from '../../src/node/types.js';

function makeRegistration(id: string, tier: 0 | 1 | 2 = 1): NodeRegistration {
  return {
    nodeId: id,
    tier,
    capabilities: ['acoustic', 'rf_wifi'],
    lat: 48.2200 + Math.random() * 0.05,
    lon: 24.3300 + Math.random() * 0.05,
    alt: 100,
    timePrecisionUs: tier === 0 ? 1 : 50_000,
    gateLevel: 3,
    registeredAt: BigInt(Date.now()) * 1000n,
  };
}

function makeHeartbeat(id: string, lat?: number, lon?: number): NodeHeartbeat {
  return {
    nodeId: id,
    timestampUs: BigInt(Date.now()) * 1000n,
    lat: lat ?? 48.2200,
    lon: lon ?? 24.3300,
    batteryPercent: 85,
    signalStrength: -60,
    activeCapabilities: ['acoustic', 'rf_wifi'],
  };
}

describe('FR-11-00: Node Registration and Discovery', () => {
  let registry: NodeRegistry;

  beforeEach(() => {
    registry = new NodeRegistry();
  });

  it('FR-11-01: register stores node and returns on getNode', () => {
    const reg = makeRegistration('test-node-01', 1);
    registry.register(reg);
    const found = registry.getNode('test-node-01');
    expect(found).not.toBeNull();
    expect(found!.nodeId).toBe('test-node-01');
    expect(found!.tier).toBe(1);
  });

  it('FR-11-02: getNode returns null for unknown node', () => {
    expect(registry.getNode('ghost-node')).toBeNull();
  });

  it('FR-11-03: registered node starts as online=false before heartbeat', () => {
    registry.register(makeRegistration('node-a'));
    const node = registry.getNode('node-a');
    expect(node!.isOnline).toBe(false);
  });

  it('FR-11-04: heartbeat marks node as online', () => {
    registry.register(makeRegistration('node-a'));
    registry.heartbeat(makeHeartbeat('node-a'));
    expect(registry.getNode('node-a')!.isOnline).toBe(true);
  });

  it('FR-11-05: heartbeat resets missedHeartbeats to 0', () => {
    registry.register(makeRegistration('node-a'));
    registry.markOffline('node-a');
    registry.heartbeat(makeHeartbeat('node-a'));
    expect(registry.getNode('node-a')!.missedHeartbeats).toBe(0);
  });

  it('FR-11-06: getOnlineNodes returns only online nodes', () => {
    registry.register(makeRegistration('node-a'));
    registry.register(makeRegistration('node-b'));
    registry.register(makeRegistration('node-c'));
    registry.heartbeat(makeHeartbeat('node-a'));
    registry.heartbeat(makeHeartbeat('node-c'));
    const online = registry.getOnlineNodes();
    expect(online).toHaveLength(2);
    expect(online.map(n => n.nodeId)).toContain('node-a');
    expect(online.map(n => n.nodeId)).toContain('node-c');
  });

  it('FR-11-07: markOffline sets isOnline=false', () => {
    registry.register(makeRegistration('node-a'));
    registry.heartbeat(makeHeartbeat('node-a'));
    registry.markOffline('node-a');
    expect(registry.getNode('node-a')!.isOnline).toBe(false);
  });

  it('FR-11-08: pruneStale removes nodes with missedHeartbeats > threshold', () => {
    registry.register(makeRegistration('old-node'));
    registry.markOffline('old-node');
    registry.markOffline('old-node');
    registry.markOffline('old-node');
    registry.markOffline('old-node'); // 4 missed
    const pruned = registry.pruneStale(3);
    expect(pruned).toBe(1);
    expect(registry.getNode('old-node')).toBeNull();
  });

  it('FR-11-09: re-registration updates node properties', () => {
    registry.register(makeRegistration('node-a', 1));
    const updated = makeRegistration('node-a', 0); // upgraded to Tier 0
    updated.capabilities = ['acoustic', 'rf_wifi', 'sdr_900mhz'];
    registry.register(updated);
    expect(registry.getNode('node-a')!.tier).toBe(0);
    expect(registry.getNode('node-a')!.capabilities).toContain('sdr_900mhz');
  });
});
