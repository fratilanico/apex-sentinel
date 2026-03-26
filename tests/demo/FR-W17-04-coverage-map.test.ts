import { describe, it, expect, beforeEach } from 'vitest';
import { CoverageMapDataBuilder } from '../../src/demo/coverage-map-data-builder.js';

describe('FR-W17-04: CoverageMapDataBuilder — sensor coverage visualization data', () => {
  let builder: CoverageMapDataBuilder;

  beforeEach(() => {
    builder = new CoverageMapDataBuilder();
  });

  // ── Grid ──────────────────────────────────────────────────────────────────

  it('SC-01: buildCoverageGrid returns an array', () => {
    const grid = builder.buildCoverageGrid();
    expect(Array.isArray(grid)).toBe(true);
  });

  it('SC-02: grid has substantial cell count (Romania bbox 0.1° grid)', () => {
    const grid = builder.buildCoverageGrid();
    // (48.3-43.6)/0.1 * (30.0-22.1)/0.1 ≈ 47 * 79 ≈ 3713 cells
    expect(grid.length).toBeGreaterThan(100);
  });

  it('SC-03: each cell has gridLat, gridLon, covered, coveringNodes, gapRisk', () => {
    const grid = builder.buildCoverageGrid();
    const sample = grid[0];
    expect(typeof sample.gridLat).toBe('number');
    expect(typeof sample.gridLon).toBe('number');
    expect(typeof sample.covered).toBe('boolean');
    expect(Array.isArray(sample.coveringNodes)).toBe(true);
    expect(['none', 'low', 'high']).toContain(sample.gapRisk);
  });

  it('SC-04: lat values within Romania bbox', () => {
    const grid = builder.buildCoverageGrid();
    for (const cell of grid.slice(0, 50)) {
      expect(cell.gridLat).toBeGreaterThanOrEqual(43.5);
      expect(cell.gridLat).toBeLessThan(48.4);
    }
  });

  it('SC-05: lon values within Romania bbox', () => {
    const grid = builder.buildCoverageGrid();
    for (const cell of grid.slice(0, 50)) {
      expect(cell.gridLon).toBeGreaterThanOrEqual(22.0);
      expect(cell.gridLon).toBeLessThan(30.1);
    }
  });

  it('SC-06: cells near demo nodes are covered', () => {
    const grid = builder.buildCoverageGrid();
    // Demo nodes are at ~44.43/26.10, 44.38/26.05, 44.47/26.15
    const nearNode = grid.find(c =>
      Math.abs(c.gridLat - 44.4) < 0.05 && Math.abs(c.gridLon - 26.1) < 0.05
    );
    expect(nearNode).toBeDefined();
    expect(nearNode!.covered).toBe(true);
    expect(nearNode!.coveringNodes.length).toBeGreaterThan(0);
  });

  it('SC-07: uncovered cells have gapRisk high', () => {
    const grid = builder.buildCoverageGrid();
    const uncovered = grid.filter(c => !c.covered);
    for (const cell of uncovered) {
      expect(cell.gapRisk).toBe('high');
    }
  });

  it('SC-08: cells with single covering node have gapRisk low', () => {
    const grid = builder.buildCoverageGrid();
    const singleCover = grid.filter(c => c.coveringNodes.length === 1);
    for (const cell of singleCover) {
      expect(cell.gapRisk).toBe('low');
    }
  });

  it('SC-09: cells with multiple covering nodes have gapRisk none', () => {
    const grid = builder.buildCoverageGrid();
    const multiCover = grid.filter(c => c.coveringNodes.length > 1);
    for (const cell of multiCover) {
      expect(cell.gapRisk).toBe('none');
    }
  });

  // ── GeoJSON ───────────────────────────────────────────────────────────────

  it('SC-10: getCoverageGeoJson returns FeatureCollection', () => {
    const geoJson = builder.getCoverageGeoJson();
    expect(geoJson.type).toBe('FeatureCollection');
    expect(Array.isArray(geoJson.features)).toBe(true);
  });

  it('SC-11: each GeoJSON feature is a Polygon', () => {
    const geoJson = builder.getCoverageGeoJson();
    const sample = geoJson.features[0];
    expect(sample.type).toBe('Feature');
    expect(sample.geometry.type).toBe('Polygon');
    expect(Array.isArray(sample.geometry.coordinates)).toBe(true);
  });

  it('SC-12: GeoJSON feature properties match cell data', () => {
    const geoJson = builder.getCoverageGeoJson();
    const feature = geoJson.features[0];
    expect(typeof feature.properties.covered).toBe('boolean');
    expect(Array.isArray(feature.properties.coveringNodes)).toBe(true);
    expect(['none', 'low', 'high']).toContain(feature.properties.gapRisk);
  });

  it('SC-13: GeoJSON feature count matches grid count', () => {
    const grid = builder.buildCoverageGrid();
    const geoJson = builder.getCoverageGeoJson();
    expect(geoJson.features.length).toBe(grid.length);
  });

  it('SC-14: Polygon ring closes (first and last coordinate equal)', () => {
    const geoJson = builder.getCoverageGeoJson();
    const ring = geoJson.features[0].geometry.coordinates[0];
    const first = ring[0];
    const last = ring[ring.length - 1];
    expect(first[0]).toBe(last[0]);
    expect(first[1]).toBe(last[1]);
  });

  // ── Summary ───────────────────────────────────────────────────────────────

  it('SC-15: getCoverageSummary returns totalCells, coveredCells, coveragePercent, highRiskGaps', () => {
    const summary = builder.getCoverageSummary();
    expect(typeof summary.totalCells).toBe('number');
    expect(typeof summary.coveredCells).toBe('number');
    expect(typeof summary.coveragePercent).toBe('number');
    expect(typeof summary.highRiskGaps).toBe('number');
  });

  it('SC-16: coveredCells ≤ totalCells', () => {
    const summary = builder.getCoverageSummary();
    expect(summary.coveredCells).toBeLessThanOrEqual(summary.totalCells);
  });

  it('SC-17: coveragePercent is between 0 and 100', () => {
    const summary = builder.getCoverageSummary();
    expect(summary.coveragePercent).toBeGreaterThanOrEqual(0);
    expect(summary.coveragePercent).toBeLessThanOrEqual(100);
  });

  it('SC-18: highRiskGaps = uncovered cells', () => {
    const summary = builder.getCoverageSummary();
    expect(summary.highRiskGaps).toBe(summary.totalCells - summary.coveredCells);
  });

  it('SC-19: getBbox returns Romania bbox', () => {
    const bbox = builder.getBbox();
    expect(bbox.latMin).toBe(43.6);
    expect(bbox.latMax).toBe(48.3);
    expect(bbox.lonMin).toBe(22.1);
    expect(bbox.lonMax).toBe(30.0);
  });

  it('SC-20: demo nodes produce >0 covered cells', () => {
    const summary = builder.getCoverageSummary();
    expect(summary.coveredCells).toBeGreaterThan(0);
  });
});
