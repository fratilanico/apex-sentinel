// APEX-SENTINEL — Node Registry
// W1 | src/node/registry.ts

import { NodeRegistration, NodeHeartbeat, NodeRegistryEntry } from './types.js';

export class NodeRegistry {
  private nodes = new Map<string, NodeRegistryEntry>();

  register(registration: NodeRegistration): void {
    const existing = this.nodes.get(registration.nodeId);
    const entry: NodeRegistryEntry = {
      ...registration,
      lastHeartbeatUs: existing?.lastHeartbeatUs ?? 0n,
      isOnline: existing?.isOnline ?? false,
      missedHeartbeats: existing?.missedHeartbeats ?? 0,
    };
    this.nodes.set(registration.nodeId, entry);
  }

  heartbeat(hb: NodeHeartbeat): void {
    const node = this.nodes.get(hb.nodeId);
    if (!node) return;
    node.lat = hb.lat;
    node.lon = hb.lon;
    node.lastHeartbeatUs = hb.timestampUs;
    node.isOnline = true;
    node.missedHeartbeats = 0;
    node.activeCapabilities = hb.activeCapabilities;
  }

  getNode(nodeId: string): NodeRegistryEntry | null {
    return this.nodes.get(nodeId) ?? null;
  }

  getOnlineNodes(): NodeRegistryEntry[] {
    return Array.from(this.nodes.values()).filter(n => n.isOnline);
  }

  markOffline(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    node.isOnline = false;
    node.missedHeartbeats++;
  }

  pruneStale(maxMissedHeartbeats: number): number {
    let count = 0;
    for (const [id, node] of this.nodes) {
      if (node.missedHeartbeats > maxMissedHeartbeats) {
        this.nodes.delete(id);
        count++;
      }
    }
    return count;
  }
}
