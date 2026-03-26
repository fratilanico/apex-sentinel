// APEX-SENTINEL — W11 SectorThreatMap Tests
// FR-W11-04 | tests/intel/FR-W11-04-sector-threat-map.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { SectorThreatMap } from '../../src/intel/sector-threat-map.js';
import type { SectorDetectionEvent } from '../../src/intel/sector-threat-map.js';

describe('FR-W11-04: SectorThreatMap', () => {
  let map: SectorThreatMap;
  const now = Date.now();

  beforeEach(() => {
    map = new SectorThreatMap();
  });

  it('04-01: update increments threatCount for correct grid cell', () => {
    const det: SectorDetectionEvent = { lat: 52.23, lon: 21.01, ts: now };
    map.update(det);
    const cell = map.getCell(52.23, 21.01);
    expect(cell).not.toBeNull();
    expect(cell!.threatCount).toBe(1);
  });

  it('04-02: grid cell key quantised to 0.1°', () => {
    // 52.23 → gridLat 52.2, 21.01 → gridLon 21.0
    const det: SectorDetectionEvent = { lat: 52.23, lon: 21.01, ts: now };
    map.update(det);
    const cell = map.getCell(52.23, 21.01);
    expect(cell!.gridLat).toBeCloseTo(52.2, 5);
    expect(cell!.gridLon).toBeCloseTo(21.0, 5);
  });

  it('04-03: two detections in same cell → threatCount 2', () => {
    map.update({ lat: 52.23, lon: 21.01, ts: now });
    map.update({ lat: 52.27, lon: 21.05, ts: now }); // same 0.1° cell
    const cell = map.getCell(52.23, 21.01);
    expect(cell!.threatCount).toBe(2);
  });

  it('04-04: decay halves count after 15 minutes', () => {
    map.update({ lat: 52.23, lon: 21.01, ts: now });
    // Simulate 15 minutes later
    map.decay(now + 15 * 60 * 1000);
    const cell = map.getCell(52.23, 21.01);
    expect(cell!.threatCount).toBeCloseTo(0.5, 1);
  });

  it('04-05: decay by 30 min → count ≈ 0.25 (two half-lives)', () => {
    map.update({ lat: 52.23, lon: 21.01, ts: now });
    map.decay(now + 30 * 60 * 1000);
    const cell = map.getCell(52.23, 21.01);
    expect(cell!.threatCount).toBeCloseTo(0.25, 1);
  });

  it('04-06: getHotspots returns only cells above threshold', () => {
    map.update({ lat: 52.23, lon: 21.01, ts: now });
    map.update({ lat: 52.23, lon: 21.01, ts: now }); // count 2
    map.update({ lat: 53.55, lon: 22.05, ts: now }); // count 1
    const hotspots = map.getHotspots(2);
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0].threatCount).toBeGreaterThanOrEqual(2);
  });

  it('04-07: getHotspots returns empty when no cells above threshold', () => {
    map.update({ lat: 52.23, lon: 21.01, ts: now });
    const hotspots = map.getHotspots(5);
    expect(hotspots).toHaveLength(0);
  });

  it('04-08: dominantDroneType reflects most recent drone type in cell', () => {
    map.update({ lat: 52.23, lon: 21.01, ts: now - 1000, droneType: 'Shahed-136' });
    map.update({ lat: 52.23, lon: 21.01, ts: now, droneType: 'Gerbera' });
    const cell = map.getCell(52.23, 21.01);
    expect(cell!.dominantDroneType).toBe('Gerbera');
  });

  it('04-09: getCell returns null for coordinate with no updates', () => {
    const cell = map.getCell(10.0, 10.0);
    expect(cell).toBeNull();
  });

  it('04-10: latestTs reflects timestamp of last update', () => {
    map.update({ lat: 52.23, lon: 21.01, ts: now - 5000 });
    map.update({ lat: 52.23, lon: 21.01, ts: now });
    const cell = map.getCell(52.23, 21.01);
    expect(cell!.latestTs).toBe(now);
  });

  it('04-11: different grid cells tracked independently', () => {
    map.update({ lat: 52.1, lon: 21.0, ts: now });
    map.update({ lat: 52.1, lon: 21.0, ts: now });
    map.update({ lat: 53.5, lon: 22.0, ts: now });
    const cell1 = map.getCell(52.1, 21.0);
    const cell2 = map.getCell(53.5, 22.0);
    expect(cell1!.threatCount).toBe(2);
    expect(cell2!.threatCount).toBe(1);
  });

  it('04-12: getHotspots(0) returns all non-zero cells', () => {
    map.update({ lat: 52.1, lon: 21.0, ts: now });
    map.update({ lat: 53.5, lon: 22.0, ts: now });
    const hotspots = map.getHotspots(0);
    expect(hotspots.length).toBeGreaterThanOrEqual(2);
  });
});
