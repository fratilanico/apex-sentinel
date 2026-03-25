// APEX-SENTINEL — Bearing Triangulator
// FR-W7-05 | src/fusion/bearing-triangulator.ts
//
// Weighted least-squares bearing-line intersection from N sensor nodes.
// Used by MultiNodeFusion to merge acoustic bearing estimates from fixed + phone nodes.
// Phone nodes receive weight=0.4; fixed SENTINEL nodes receive weight=1.0.
//
// Math: each bearing θ from node (lat₀, lon₀) defines a line
//   cos(θ)·lon − sin(θ)·lat = cos(θ)·lon₀ − sin(θ)·lat₀
// WLS solution: (AᵀWA)⁻¹ AᵀWb

const DEG2RAD = Math.PI / 180;

export interface TriangulatorConfig {
  /** Minimum number of nodes required for triangulation. Default 3. */
  minNodes: number;
  /** Confidence threshold in meters — results above this are considered ambiguous. */
  maxConfidenceM: number;
}

export interface BearingNode {
  nodeId: string;
  lat: number;  // decimal degrees
  lon: number;  // decimal degrees
  bearingDeg: number; // 0–360° clockwise from north
  type: 'fixed' | 'phone';
  weight: number; // 1.0 for fixed, 0.4 for phone
}

export interface TriangulationResult {
  lat: number;
  lon: number;
  /** Estimated positional uncertainty (1-sigma) in metres. */
  confidenceM: number;
  nodeCount: number;
}

export class InvalidBearingError extends Error {
  constructor(nodeId: string, bearing: number) {
    super(`Invalid bearing ${bearing}° for node "${nodeId}" — must be in [0, 360)`);
    this.name = 'InvalidBearingError';
  }
}

export class BearingTriangulator {
  private readonly config: TriangulatorConfig;
  /** Persistent bearing overrides, keyed by nodeId */
  private readonly bearingOverrides = new Map<string, number>();
  /** Last nodes passed to triangulate() */
  private lastNodes: BearingNode[] = [];

  constructor(config: TriangulatorConfig) {
    this.config = config;
  }

  /**
   * Store a bearing override for a node ID.
   * When triangulate() encounters a node with this ID, the stored bearing is used.
   */
  updateBearing(nodeId: string, bearingDeg: number): void {
    this.bearingOverrides.set(nodeId, bearingDeg);
  }

  /** Return the last node set passed to triangulate(). */
  getActiveNodes(): BearingNode[] {
    return this.lastNodes;
  }

  /**
   * Compute a weighted least-squares intersection of all bearing lines.
   *
   * @returns null if fewer than minNodes provided, or if geometry is degenerate.
   *          Returns a TriangulationResult with high confidenceM if estimates diverge.
   */
  triangulate(nodes: BearingNode[]): TriangulationResult | null {
    // Validate bearings before anything else
    for (const node of nodes) {
      const bearing = this.bearingOverrides.get(node.nodeId) ?? node.bearingDeg;
      if (bearing < 0 || bearing >= 360) {
        throw new InvalidBearingError(node.nodeId, bearing);
      }
    }

    this.lastNodes = nodes;

    if (nodes.length < this.config.minNodes) {
      return null;
    }

    // Apply bearing overrides
    const effectiveNodes = nodes.map(n => ({
      ...n,
      bearingDeg: this.bearingOverrides.get(n.nodeId) ?? n.bearingDeg,
    }));

    // Build WLS system: A·[lon, lat]ᵀ = b
    // Row i: [cos(θ_i), -sin(θ_i)] · [lon, lat]ᵀ = cos(θ_i)·lon_i - sin(θ_i)·lat_i
    let a00 = 0, a01 = 0, a11 = 0;
    let b0 = 0, b1 = 0;

    for (const node of effectiveNodes) {
      const θ = node.bearingDeg * DEG2RAD;
      const c = Math.cos(θ);
      const s = Math.sin(θ);
      const w = node.weight;

      // A row: [c, -s]
      a00 += w * c * c;
      a01 += w * c * (-s);
      a11 += w * (-s) * (-s);
      // b component: c*lon_i - s*lat_i
      const bi = c * node.lon - s * node.lat;
      b0 += w * c * bi;
      b1 += w * (-s) * bi;
    }

    // Solve 2×2 WLS system: AᵀWA · x = AᵀWb
    const det = a00 * a11 - a01 * a01;

    // Degenerate geometry (collinear / parallel bearing lines)
    if (Math.abs(det) < 1e-12) {
      return null;
    }

    const lon = (b0 * a11 - a01 * b1) / det;
    const lat = (a00 * b1 - a01 * b0) / det;

    // Compute RMS residual in degrees (perpendicular distance from each bearing line)
    let sumSqResiduals = 0;
    for (const node of effectiveNodes) {
      const θ = node.bearingDeg * DEG2RAD;
      const c = Math.cos(θ);
      const s = Math.sin(θ);
      const residual = c * lon - s * lat - (c * node.lon - s * node.lat);
      sumSqResiduals += node.weight * residual * residual;
    }

    const totalWeight = effectiveNodes.reduce((sum, n) => sum + n.weight, 0);
    const rmsResidualDeg = Math.sqrt(sumSqResiduals / totalWeight);
    // Convert degrees to meters (1° ≈ 111km at the equator — close enough for SENTINEL scale)
    const confidenceM = rmsResidualDeg * 111000;

    return {
      lat,
      lon,
      confidenceM,
      nodeCount: nodes.length,
    };
  }
}
