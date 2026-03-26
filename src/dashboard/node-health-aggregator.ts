// FR-W14-05: NodeHealthAggregator — sensor node health for dashboard

export type NodeStatusLevel = 'online' | 'degraded' | 'offline';

export interface NodeStatus {
  nodeId: string;
  lat: number;
  lon: number;
  lastSeen: number;
  status: NodeStatusLevel;
  detectionCount: number;
  batteryPct?: number;
  coverageRadiusKm: number;
}

export interface NodeHeartbeat {
  nodeId: string;
  lat?: number;
  lon?: number;
  detectionCount?: number;
  batteryPct?: number;
}

const ONLINE_THRESHOLD_MS = 60_000;
const DEGRADED_THRESHOLD_MS = 120_000;
const COVERAGE_RADIUS_KM = 3.5;

// Demo nodes: Romania theater
const DEMO_NODES: NodeStatus[] = [
  {
    nodeId: 'Node-RO-01',
    lat: 44.43,
    lon: 26.10,
    lastSeen: Date.now(),
    status: 'online',
    detectionCount: 0,
    coverageRadiusKm: COVERAGE_RADIUS_KM,
  },
  {
    nodeId: 'Node-RO-02',
    lat: 44.38,
    lon: 26.05,
    lastSeen: Date.now(),
    status: 'online',
    detectionCount: 0,
    coverageRadiusKm: COVERAGE_RADIUS_KM,
  },
  {
    nodeId: 'Node-RO-03',
    lat: 44.47,
    lon: 26.15,
    lastSeen: Date.now(),
    status: 'online',
    detectionCount: 0,
    coverageRadiusKm: COVERAGE_RADIUS_KM,
  },
];

export class NodeHealthAggregator {
  private nodes = new Map<string, NodeStatus>();

  constructor() {
    for (const n of DEMO_NODES) {
      this.nodes.set(n.nodeId, { ...n, lastSeen: Date.now() });
    }
  }

  updateHeartbeat(nodeId: string, stats: NodeHeartbeat): void {
    const existing = this.nodes.get(nodeId);
    if (existing) {
      existing.lastSeen = Date.now();
      if (stats.lat !== undefined) existing.lat = stats.lat;
      if (stats.lon !== undefined) existing.lon = stats.lon;
      if (stats.detectionCount !== undefined) existing.detectionCount = stats.detectionCount;
      if (stats.batteryPct !== undefined) existing.batteryPct = stats.batteryPct;
      existing.status = this.computeStatus(existing.lastSeen);
    } else {
      this.nodes.set(nodeId, {
        nodeId,
        lat: stats.lat ?? 0,
        lon: stats.lon ?? 0,
        lastSeen: Date.now(),
        status: 'online',
        detectionCount: stats.detectionCount ?? 0,
        batteryPct: stats.batteryPct,
        coverageRadiusKm: COVERAGE_RADIUS_KM,
      });
    }
  }

  getNodeGrid(): NodeStatus[] {
    const now = Date.now();
    // Recompute statuses before returning
    const result: NodeStatus[] = [];
    for (const node of this.nodes.values()) {
      result.push({
        ...node,
        status: this.computeStatus(node.lastSeen, now),
      });
    }
    return result;
  }

  getNode(nodeId: string): NodeStatus | undefined {
    const node = this.nodes.get(nodeId);
    if (!node) return undefined;
    return { ...node, status: this.computeStatus(node.lastSeen) };
  }

  private computeStatus(lastSeen: number, now = Date.now()): NodeStatusLevel {
    const age = now - lastSeen;
    if (age < ONLINE_THRESHOLD_MS) return 'online';
    if (age < DEGRADED_THRESHOLD_MS) return 'degraded';
    return 'offline';
  }

  getNodeCount(): number {
    return this.nodes.size;
  }

  reset(): void {
    this.nodes.clear();
    for (const n of DEMO_NODES) {
      this.nodes.set(n.nodeId, { ...n, lastSeen: Date.now() });
    }
  }
}
