// APEX-SENTINEL — W10 PredictiveGapAnalyzer Tests
// FR-W10-04 | tests/nato/FR-W10-04-predictive-gap.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { PredictiveGapAnalyzer, type NodePosition, type OsintEvent, type BoundingBox } from '../../src/nato/predictive-gap-analyzer.js';

describe('FR-W10-04: PredictiveGapAnalyzer', () => {
  const singleNode: NodePosition[] = [{ lat: 45.0, lon: 26.0 }];

  const bbox: BoundingBox = {
    latMin: 44.9,
    latMax: 45.1,
    lonMin: 25.9,
    lonMax: 26.1,
  };

  it('04-01: computeGrid returns array of grid cells', () => {
    const analyzer = new PredictiveGapAnalyzer(singleNode);
    const grid = analyzer.computeGrid(bbox);
    expect(Array.isArray(grid)).toBe(true);
    expect(grid.length).toBeGreaterThan(0);
  });

  it('04-02: grid cells have required fields', () => {
    const analyzer = new PredictiveGapAnalyzer(singleNode);
    const [cell] = analyzer.computeGrid(bbox);
    expect(typeof cell.lat).toBe('number');
    expect(typeof cell.lon).toBe('number');
    expect(typeof cell.nearestNodeKm).toBe('number');
    expect(typeof cell.isBlindSpot).toBe('boolean');
    expect(typeof cell.osintEventCount).toBe('number');
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(cell.riskLevel);
  });

  it('04-03: cell directly at node position → not a blind spot', () => {
    const analyzer = new PredictiveGapAnalyzer([{ lat: 45.0, lon: 26.0 }]);
    const grid = analyzer.computeGrid({ latMin: 44.99, latMax: 45.01, lonMin: 25.99, lonMax: 26.01 });
    const center = grid.find(c => Math.abs(c.lat - 45.0) < 0.05 && Math.abs(c.lon - 26.0) < 0.05);
    expect(center?.isBlindSpot).toBe(false);
  });

  it('04-04: cell far from node (> 3.5km) → isBlindSpot=true', () => {
    // Node at 45.0, 26.0 — cell at 45.05, 26.05 is ~7km away
    const analyzer = new PredictiveGapAnalyzer([{ lat: 45.0, lon: 26.0 }]);
    const grid = analyzer.computeGrid({ latMin: 45.04, latMax: 45.06, lonMin: 26.04, lonMax: 26.06 });
    expect(grid.some(c => c.isBlindSpot)).toBe(true);
  });

  it('04-05: grid cell size defaults to 0.1°', () => {
    const analyzer = new PredictiveGapAnalyzer(singleNode);
    const grid = analyzer.computeGrid({ latMin: 45.0, latMax: 45.2, lonMin: 26.0, lonMax: 26.2 });
    // 0.2° / 0.1° = 2 steps each = 4 cells (2x2)
    expect(grid.length).toBe(4);
  });

  it('04-06: nearestNodeKm is non-negative', () => {
    const analyzer = new PredictiveGapAnalyzer(singleNode);
    const grid = analyzer.computeGrid(bbox);
    grid.forEach(c => expect(c.nearestNodeKm).toBeGreaterThanOrEqual(0));
  });

  it('04-07: osintEventCount defaults to 0 before flagHighRiskGaps', () => {
    const analyzer = new PredictiveGapAnalyzer(singleNode);
    const grid = analyzer.computeGrid(bbox);
    grid.forEach(c => expect(c.osintEventCount).toBe(0));
  });

  it('04-08: flagHighRiskGaps adds OSINT count to matching cells', () => {
    const analyzer = new PredictiveGapAnalyzer([{ lat: 45.0, lon: 26.0 }]);
    const farBbox: BoundingBox = { latMin: 45.04, latMax: 45.06, lonMin: 26.04, lonMax: 26.06 };
    const grid = analyzer.computeGrid(farBbox);
    const osint: OsintEvent[] = [{ lat: 45.05, lon: 26.05, ts: new Date().toISOString() }];
    const flagged = analyzer.flagHighRiskGaps(grid, osint);
    expect(flagged.some(c => c.osintEventCount > 0)).toBe(true);
  });

  it('04-09: blind spot + 1 OSINT event → MEDIUM risk', () => {
    const analyzer = new PredictiveGapAnalyzer([{ lat: 45.0, lon: 26.0 }]);
    const farBbox: BoundingBox = { latMin: 45.04, latMax: 45.06, lonMin: 26.04, lonMax: 26.06 };
    const grid = analyzer.computeGrid(farBbox);
    const osint: OsintEvent[] = [{ lat: 45.05, lon: 26.05, ts: new Date().toISOString() }];
    const flagged = analyzer.flagHighRiskGaps(grid, osint);
    const riskCell = flagged.find(c => c.osintEventCount > 0 && c.isBlindSpot);
    expect(riskCell?.riskLevel).toBe('MEDIUM');
  });

  it('04-10: blind spot + 3 OSINT events → HIGH risk', () => {
    const analyzer = new PredictiveGapAnalyzer([{ lat: 45.0, lon: 26.0 }]);
    const farBbox: BoundingBox = { latMin: 45.04, latMax: 45.06, lonMin: 26.04, lonMax: 26.06 };
    const grid = analyzer.computeGrid(farBbox);
    const osint: OsintEvent[] = [
      { lat: 45.05, lon: 26.05, ts: new Date().toISOString() },
      { lat: 45.05, lon: 26.05, ts: new Date().toISOString() },
      { lat: 45.05, lon: 26.05, ts: new Date().toISOString() },
    ];
    const flagged = analyzer.flagHighRiskGaps(grid, osint);
    const highRisk = flagged.find(c => c.riskLevel === 'HIGH');
    expect(highRisk).toBeDefined();
  });

  it('04-11: non-blind-spot cell with OSINT → stays LOW risk', () => {
    const analyzer = new PredictiveGapAnalyzer([{ lat: 45.0, lon: 26.0 }]);
    // Cell at 44.99,25.99 is close to node
    const closeBbox: BoundingBox = { latMin: 44.99, latMax: 45.01, lonMin: 25.99, lonMax: 26.01 };
    const grid = analyzer.computeGrid(closeBbox);
    const osint: OsintEvent[] = [{ lat: 45.0, lon: 26.0, ts: new Date().toISOString() }];
    const flagged = analyzer.flagHighRiskGaps(grid, osint);
    const nonBlind = flagged.filter(c => !c.isBlindSpot);
    nonBlind.forEach(c => expect(c.riskLevel).toBe('LOW'));
  });

  it('04-12: multiple nodes reduce blind spot count', () => {
    // Two nodes 5km apart — area between them has more coverage
    const twoNodes: NodePosition[] = [
      { lat: 45.0, lon: 26.0 },
      { lat: 45.05, lon: 26.05 },
    ];
    const oneNode: NodePosition[] = [{ lat: 45.0, lon: 26.0 }];
    const testBbox: BoundingBox = { latMin: 44.9, latMax: 45.1, lonMin: 25.9, lonMax: 26.1 };
    const analyzerTwo = new PredictiveGapAnalyzer(twoNodes);
    const analyzerOne = new PredictiveGapAnalyzer(oneNode);
    const gridTwo = analyzerTwo.computeGrid(testBbox);
    const gridOne = analyzerOne.computeGrid(testBbox);
    const blindTwo = gridTwo.filter(c => c.isBlindSpot).length;
    const blindOne = gridOne.filter(c => c.isBlindSpot).length;
    expect(blindTwo).toBeLessThanOrEqual(blindOne);
  });
});
