// APEX-SENTINEL — TDOA Correlation Engine
// FR-W2-08: Sliding-window multi-node detection correlator

export interface DetectionEvent {
  nodeId: string;
  timestampUs: bigint;
  droneConfidence: number;
  spectralPeakHz: number;
  lat: number;
  lon: number;
  altM: number;
  timePrecisionUs: number;
}

export interface CorrelationResult {
  trackId: string;
  lat: number;
  lon: number;
  altM: number;
  errorM: number;
  confidence: number;
  nodeCount: number;
  method: 'tdoa' | 'centroid';
  timestampUs: bigint;
  contributingNodes: string[];
}

export class TdoaCorrelator {
  private readonly windowMs: number;
  private readonly minNodes: number;
  // Map from nodeId → most recent event for that node within the window
  private pending: Map<string, DetectionEvent> = new Map();

  constructor(windowMs: number, minNodes: number) {
    this.windowMs = windowMs;
    this.minNodes = minNodes;
  }

  getWindowMs(): number {
    return this.windowMs;
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  ingest(event: DetectionEvent): CorrelationResult | null {
    // Expire events outside the window relative to the incoming event's timestamp
    const windowUs = BigInt(this.windowMs) * 1000n;
    for (const [nodeId, existing] of this.pending) {
      if (event.timestampUs - existing.timestampUs > windowUs) {
        this.pending.delete(nodeId);
      }
    }

    // Deduplicate: same nodeId replaces previous entry
    this.pending.set(event.nodeId, event);

    if (this.pending.size >= this.minNodes) {
      return this._computeResult();
    }

    return null;
  }

  flush(): CorrelationResult[] {
    if (this.pending.size >= this.minNodes) {
      const result = this._computeResult();
      this.pending.clear();
      return [result];
    }
    this.pending.clear();
    return [];
  }

  private _computeResult(): CorrelationResult {
    const events = Array.from(this.pending.values());
    const nodeCount = events.length;

    // Centroid of all node positions
    const lat = events.reduce((sum, e) => sum + e.lat, 0) / nodeCount;
    const lon = events.reduce((sum, e) => sum + e.lon, 0) / nodeCount;
    const altM = events.reduce((sum, e) => sum + e.altM, 0) / nodeCount;

    // Average drone confidence
    const confidence = events.reduce((sum, e) => sum + e.droneConfidence, 0) / nodeCount;

    // Error estimate: max timePrecisionUs * speed_of_sound_m_per_us (343e-6)
    const maxPrecisionUs = Math.max(...events.map((e) => e.timePrecisionUs));
    const errorM = maxPrecisionUs * 343e-6;

    // Method selection
    const method: 'tdoa' | 'centroid' = nodeCount >= 3 ? 'tdoa' : 'centroid';

    // Use the latest timestamp among contributing events
    const timestampUs = events.reduce(
      (max, e) => (e.timestampUs > max ? e.timestampUs : max),
      events[0].timestampUs,
    );

    const contributingNodes = events.map((e) => e.nodeId);

    return {
      trackId: `CORR-${Date.now()}`,
      lat,
      lon,
      altM,
      errorM,
      confidence,
      nodeCount,
      method,
      timestampUs,
      contributingNodes,
    };
  }
}
