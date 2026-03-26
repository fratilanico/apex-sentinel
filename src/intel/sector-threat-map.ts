// APEX-SENTINEL — W11 SectorThreatMap
// FR-W11-04 | src/intel/sector-threat-map.ts

// ── Types ────────────────────────────────────────────────────────────────────

export interface SectorDetectionEvent {
  lat: number;
  lon: number;
  ts: number;
  droneType?: string;
}

export interface GridCell {
  gridLat: number;
  gridLon: number;
  threatCount: number;
  latestTs: number;
  dominantDroneType: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const GRID_RESOLUTION = 0.1;            // degrees
const HALF_LIFE_MS = 15 * 60 * 1000;   // 15 minutes
const MAX_CELLS = 100_000;

// ── SectorThreatMap ──────────────────────────────────────────────────────────

export class SectorThreatMap {
  private readonly cells = new Map<string, GridCell>();

  private cellKey(lat: number, lon: number): string {
    const gridLat = Math.floor(lat / GRID_RESOLUTION) * GRID_RESOLUTION;
    const gridLon = Math.floor(lon / GRID_RESOLUTION) * GRID_RESOLUTION;
    return `${gridLat.toFixed(1)}:${gridLon.toFixed(1)}`;
  }

  private gridCoords(lat: number, lon: number): [number, number] {
    return [
      Math.floor(lat / GRID_RESOLUTION) * GRID_RESOLUTION,
      Math.floor(lon / GRID_RESOLUTION) * GRID_RESOLUTION,
    ];
  }

  /**
   * Increments threat count for the grid cell covering the detection.
   * Updates latestTs and dominantDroneType.
   */
  update(detection: SectorDetectionEvent): void {
    const key = this.cellKey(detection.lat, detection.lon);
    const [gridLat, gridLon] = this.gridCoords(detection.lat, detection.lon);

    if (this.cells.size >= MAX_CELLS && !this.cells.has(key)) {
      // Evict oldest cell
      let oldestKey: string | null = null;
      let oldestTs = Infinity;
      for (const [k, v] of this.cells.entries()) {
        if (v.latestTs < oldestTs) {
          oldestTs = v.latestTs;
          oldestKey = k;
        }
      }
      if (oldestKey) this.cells.delete(oldestKey);
    }

    const existing = this.cells.get(key);
    if (existing) {
      existing.threatCount += 1;
      if (detection.ts >= existing.latestTs) {
        existing.latestTs = detection.ts;
        if (detection.droneType !== undefined) {
          existing.dominantDroneType = detection.droneType;
        }
      }
    } else {
      this.cells.set(key, {
        gridLat,
        gridLon,
        threatCount: 1,
        latestTs: detection.ts,
        dominantDroneType: detection.droneType ?? null,
      });
    }
  }

  /**
   * Applies exponential decay to all cells based on time elapsed since last update.
   * Half-life = 15 minutes. Uses nowMs (or Date.now() if not provided).
   */
  decay(nowMs?: number): void {
    const now = nowMs ?? Date.now();
    for (const [key, cell] of this.cells.entries()) {
      const elapsed = now - cell.latestTs;
      if (elapsed > 0) {
        cell.threatCount = cell.threatCount * Math.pow(0.5, elapsed / HALF_LIFE_MS);
      }
      // Update latestTs to decay reference point
      cell.latestTs = now;

      // Remove effectively-zero cells
      if (cell.threatCount < 0.001) {
        this.cells.delete(key);
      }
    }
  }

  /**
   * Returns all cells with threatCount >= minCount.
   */
  getHotspots(minCount: number): GridCell[] {
    const result: GridCell[] = [];
    for (const cell of this.cells.values()) {
      if (cell.threatCount >= minCount) {
        result.push({ ...cell });
      }
    }
    return result;
  }

  /**
   * Returns the grid cell for the given coordinates, or null if not present.
   */
  getCell(lat: number, lon: number): GridCell | null {
    const key = this.cellKey(lat, lon);
    const cell = this.cells.get(key);
    return cell ? { ...cell } : null;
  }
}
