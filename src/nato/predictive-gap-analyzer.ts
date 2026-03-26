// APEX-SENTINEL — W10 PredictiveGapAnalyzer
// FR-W10-04 | src/nato/predictive-gap-analyzer.ts

// ── Types ────────────────────────────────────────────────────────────────────

export interface NodePosition {
  lat: number;
  lon: number;
}

export interface BoundingBox {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

export interface OsintEvent {
  lat: number;
  lon: number;
  ts: string;
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface GridCell {
  lat: number;
  lon: number;
  nearestNodeKm: number;
  isBlindSpot: boolean;
  osintEventCount: number;
  riskLevel: RiskLevel;
}

// ── Constants ────────────────────────────────────────────────────────────────

const BLIND_SPOT_THRESHOLD_KM = 3.5;
const DEFAULT_CELL_DEG = 0.1;
const DEG_TO_KM = 111.0;

// ── Helpers ──────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_KM;
  const cosLat = Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  const dLon = (lon2 - lon1) * DEG_TO_KM * cosLat;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function computeRisk(isBlindSpot: boolean, osintCount: number): RiskLevel {
  if (!isBlindSpot || osintCount === 0) return 'LOW';
  if (osintCount > 2) return 'HIGH';
  return 'MEDIUM';
}

// ── PredictiveGapAnalyzer ────────────────────────────────────────────────────

export class PredictiveGapAnalyzer {
  private readonly nodes: NodePosition[];

  constructor(nodes: NodePosition[]) {
    this.nodes = nodes;
  }

  /**
   * Generates a grid of coverage cells for the given bounding box.
   * cellDeg defaults to 0.1°. If the bbox is smaller than one cell,
   * generates a single cell at the bbox center.
   */
  computeGrid(bbox: BoundingBox, cellDeg: number = DEFAULT_CELL_DEG): GridCell[] {
    const cells: GridCell[] = [];
    const latRange = bbox.latMax - bbox.latMin;
    const lonRange = bbox.lonMax - bbox.lonMin;

    // Determine step: if bbox smaller than one cell, use bbox size as step
    const latStep = latRange < cellDeg ? latRange : cellDeg;
    const lonStep = lonRange < cellDeg ? lonRange : cellDeg;

    // Generate cell centers
    let lat = bbox.latMin + latStep / 2;
    while (lat <= bbox.latMax + 1e-9) {
      let lon = bbox.lonMin + lonStep / 2;
      while (lon <= bbox.lonMax + 1e-9) {
        const nearestNodeKm = this.nearestNodeDistance(lat, lon);
        const isBlindSpot = nearestNodeKm > BLIND_SPOT_THRESHOLD_KM;
        cells.push({
          lat: parseFloat(lat.toFixed(4)),
          lon: parseFloat(lon.toFixed(4)),
          nearestNodeKm,
          isBlindSpot,
          osintEventCount: 0,
          riskLevel: computeRisk(isBlindSpot, 0),
        });
        lon += lonStep;
        if (lon > bbox.lonMax + 1e-9) break;
      }
      lat += latStep;
      if (lat > bbox.latMax + 1e-9) break;
    }

    return cells;
  }

  /**
   * Annotates grid cells with OSINT event counts and updates risk level.
   * OSINT event assigned to nearest cell center.
   */
  flagHighRiskGaps(grid: GridCell[], osintEvents: OsintEvent[]): GridCell[] {
    if (osintEvents.length === 0) return grid;

    // Count OSINT events per cell
    for (const event of osintEvents) {
      // Find nearest cell
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < grid.length; i++) {
        const dist = haversineKm(event.lat, event.lon, grid[i].lat, grid[i].lon);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        grid[bestIdx].osintEventCount++;
      }
    }

    // Recompute risk levels
    for (const cell of grid) {
      cell.riskLevel = computeRisk(cell.isBlindSpot, cell.osintEventCount);
    }

    return grid;
  }

  private nearestNodeDistance(lat: number, lon: number): number {
    if (this.nodes.length === 0) return Infinity;
    let minDist = Infinity;
    for (const node of this.nodes) {
      const dist = haversineKm(lat, lon, node.lat, node.lon);
      if (dist < minDist) minDist = dist;
    }
    return minDist;
  }
}
