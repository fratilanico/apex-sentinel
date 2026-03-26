// APEX-SENTINEL — W17 CoverageMapDataBuilder
// FR-W17-04 | src/demo/coverage-map-data-builder.ts

import { NodeHealthAggregator, type NodeStatus } from '../dashboard/node-health-aggregator.js';
import { PredictiveGapAnalyzer, type NodePosition } from '../nato/predictive-gap-analyzer.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type GapRisk = 'none' | 'low' | 'high';

export interface CoverageCell {
  gridLat: number;
  gridLon: number;
  covered: boolean;
  coveringNodes: string[];
  gapRisk: GapRisk;
}

export interface GeoJsonFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: [number, number][][];
  };
  properties: {
    gridLat: number;
    gridLon: number;
    covered: boolean;
    coveringNodes: string[];
    gapRisk: GapRisk;
  };
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

export interface CoverageSummary {
  totalCells: number;
  coveredCells: number;
  coveragePercent: number;
  highRiskGaps: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROMANIA_BBOX = {
  latMin: 43.6,
  latMax: 48.3,
  lonMin: 22.1,
  lonMax: 30.0,
};

const GRID_DEG = 0.1;
const COVERAGE_RADIUS_KM = 3.5;
const DEG_TO_KM = 111.0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_KM;
  const cosLat = Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  const dLon = (lon2 - lon1) * DEG_TO_KM * cosLat;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function cellPolygon(lat: number, lon: number, step: number): [number, number][][] {
  return [[
    [lon, lat],
    [lon + step, lat],
    [lon + step, lat + step],
    [lon, lat + step],
    [lon, lat],
  ]];
}

// ── CoverageMapDataBuilder ────────────────────────────────────────────────────

export class CoverageMapDataBuilder {
  private readonly nodeAggregator: NodeHealthAggregator;
  private readonly gapAnalyzer: PredictiveGapAnalyzer;

  constructor(nodeAggregator?: NodeHealthAggregator) {
    this.nodeAggregator = nodeAggregator ?? new NodeHealthAggregator();

    // Build gap analyzer from node grid
    const nodes = this._getNodePositions();
    this.gapAnalyzer = new PredictiveGapAnalyzer(nodes, ROMANIA_BBOX, GRID_DEG);
  }

  private _getNodePositions(): NodePosition[] {
    const grid = this.nodeAggregator.getNodeGrid();
    return grid.map((n: NodeStatus) => ({ lat: n.lat, lon: n.lon }));
  }

  buildCoverageGrid(): CoverageCell[] {
    const nodes = this.nodeAggregator.getNodeGrid();
    const cells: CoverageCell[] = [];

    for (let lat = ROMANIA_BBOX.latMin; lat < ROMANIA_BBOX.latMax; lat = Math.round((lat + GRID_DEG) * 1000) / 1000) {
      for (let lon = ROMANIA_BBOX.lonMin; lon < ROMANIA_BBOX.lonMax; lon = Math.round((lon + GRID_DEG) * 1000) / 1000) {
        const cellLat = Math.round(lat * 10) / 10;
        const cellLon = Math.round(lon * 10) / 10;

        const coveringNodes: string[] = [];

        for (const node of nodes) {
          const dist = distanceKm(cellLat, cellLon, node.lat, node.lon);
          if (dist <= COVERAGE_RADIUS_KM) {
            coveringNodes.push(node.nodeId);
          }
        }

        const covered = coveringNodes.length > 0;
        let gapRisk: GapRisk = 'none';
        if (!covered) gapRisk = 'high';
        else if (coveringNodes.length === 1) gapRisk = 'low';

        cells.push({ gridLat: cellLat, gridLon: cellLon, covered, coveringNodes, gapRisk });
      }
    }

    return cells;
  }

  getCoverageGeoJson(): GeoJsonFeatureCollection {
    const cells = this.buildCoverageGrid();
    const features: GeoJsonFeature[] = cells.map(cell => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: cellPolygon(cell.gridLat, cell.gridLon, GRID_DEG),
      },
      properties: {
        gridLat: cell.gridLat,
        gridLon: cell.gridLon,
        covered: cell.covered,
        coveringNodes: cell.coveringNodes,
        gapRisk: cell.gapRisk,
      },
    }));

    return { type: 'FeatureCollection', features };
  }

  getCoverageSummary(): CoverageSummary {
    const cells = this.buildCoverageGrid();
    const totalCells = cells.length;
    const coveredCells = cells.filter(c => c.covered).length;
    const highRiskGaps = cells.filter(c => c.gapRisk === 'high').length;
    const coveragePercent = totalCells > 0 ? Math.round((coveredCells / totalCells) * 100 * 10) / 10 : 0;

    return { totalCells, coveredCells, coveragePercent, highRiskGaps };
  }

  getBbox(): typeof ROMANIA_BBOX {
    return { ...ROMANIA_BBOX };
  }
}
