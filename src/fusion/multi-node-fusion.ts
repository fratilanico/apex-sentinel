// APEX-SENTINEL — W6 Multi-Node Fusion
// FR-W6-05 | src/fusion/multi-node-fusion.ts
//
// Cross-node acoustic correlation and consensus.
// Uses inverse distance weighting (IDW) for confidence fusion.
// Retains latest report per nodeId per trackId.

export interface NodeReport {
  nodeId: string;
  trackId: string;
  confidence: number;
  lat: number;
  lon: number;
  distanceKm: number;
  timestamp: number;
}

export interface FusionConsensus {
  trackId: string;
  fusedConfidence: number;
  lat: number;
  lon: number;
  nodeCount: number;
  agreement: 'high' | 'mixed' | 'low';
}

export interface MultiNodeFusionConfig {
  maxAgeMs: number;
  minDistanceKm?: number; // clamp to prevent division by zero (default 0.01)
  highAgreementThreshold?: number; // default 0.8
}

const MIN_DISTANCE_KM = 0.01;

export class MultiNodeFusion {
  private readonly maxAgeMs: number;
  private readonly minDistanceKm: number;
  private readonly highAgreementThreshold: number;
  // trackId → nodeId → latest report
  private readonly reportsByTrack = new Map<string, Map<string, NodeReport>>();
  private readonly consensusCache = new Map<string, FusionConsensus>();

  constructor(config: MultiNodeFusionConfig) {
    this.maxAgeMs = config.maxAgeMs;
    this.minDistanceKm = config.minDistanceKm ?? MIN_DISTANCE_KM;
    this.highAgreementThreshold = config.highAgreementThreshold ?? 0.8;
  }

  addNodeReport(report: NodeReport): void {
    let nodeMap = this.reportsByTrack.get(report.trackId);
    if (!nodeMap) {
      nodeMap = new Map<string, NodeReport>();
      this.reportsByTrack.set(report.trackId, nodeMap);
    }
    // Keep only the latest per node
    const existing = nodeMap.get(report.nodeId);
    if (!existing || report.timestamp >= existing.timestamp) {
      nodeMap.set(report.nodeId, report);
    }
    // Invalidate consensus cache for this track
    this.consensusCache.delete(report.trackId);
  }

  fuse(trackId: string): FusionConsensus | null {
    const nodeMap = this.reportsByTrack.get(trackId);
    if (!nodeMap || nodeMap.size === 0) return null;

    const reports = Array.from(nodeMap.values());
    if (reports.length === 0) return null;

    // Inverse distance weighting
    let weightSum = 0;
    let confWeightedSum = 0;
    let latWeightedSum = 0;
    let lonWeightedSum = 0;

    for (const r of reports) {
      const d = Math.max(r.distanceKm, this.minDistanceKm);
      const w = 1 / d;
      weightSum += w;
      confWeightedSum += w * r.confidence;
      latWeightedSum += w * r.lat;
      lonWeightedSum += w * r.lon;
    }

    const fusedConfidence = confWeightedSum / weightSum;
    const lat = latWeightedSum / weightSum;
    const lon = lonWeightedSum / weightSum;
    const nodeCount = reports.length;

    // Agreement: high if all nodes confidence > threshold
    const allHigh = reports.every(r => r.confidence >= this.highAgreementThreshold);
    const allLow = reports.every(r => r.confidence < 0.5);
    const agreement: 'high' | 'mixed' | 'low' = allHigh ? 'high' : allLow ? 'low' : 'mixed';

    const consensus: FusionConsensus = {
      trackId,
      fusedConfidence,
      lat,
      lon,
      nodeCount,
      agreement,
    };
    this.consensusCache.set(trackId, consensus);
    return consensus;
  }

  getConsensus(trackId: string): FusionConsensus | null {
    return this.consensusCache.get(trackId) ?? null;
  }

  clearStale(): void {
    const now = Date.now();
    for (const [trackId, nodeMap] of this.reportsByTrack) {
      for (const [nodeId, report] of nodeMap) {
        if (now - report.timestamp >= this.maxAgeMs) {
          nodeMap.delete(nodeId);
        }
      }
      if (nodeMap.size === 0) {
        this.reportsByTrack.delete(trackId);
        this.consensusCache.delete(trackId);
      }
    }
  }
}
