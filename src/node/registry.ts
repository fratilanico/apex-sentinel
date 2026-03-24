// APEX-SENTINEL — Node Registry
// W1 | src/node/registry.ts
// STUB — implementation pending (TDD RED)

import { NodeRegistration, NodeHeartbeat, NodeRegistryEntry } from './types.js';

export class NodeRegistry {
  private nodes = new Map<string, NodeRegistryEntry>();

  register(_registration: NodeRegistration): void {
    throw new Error('NOT_IMPLEMENTED');
  }

  heartbeat(_heartbeat: NodeHeartbeat): void {
    throw new Error('NOT_IMPLEMENTED');
  }

  getNode(_nodeId: string): NodeRegistryEntry | null {
    throw new Error('NOT_IMPLEMENTED');
  }

  getOnlineNodes(): NodeRegistryEntry[] {
    throw new Error('NOT_IMPLEMENTED');
  }

  markOffline(_nodeId: string): void {
    throw new Error('NOT_IMPLEMENTED');
  }

  pruneStale(_maxMissedHeartbeats: number): number {
    throw new Error('NOT_IMPLEMENTED');
  }
}
