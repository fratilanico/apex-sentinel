// APEX-SENTINEL — TDD RED Tests
// W4 C2 Dashboard — CoT Export
// Status: RED — implementation in src/dashboard/cot-export.ts NOT_IMPLEMENTED

import { describe, it, expect } from 'vitest';
import {
  exportTrackAsCot,
  exportBulkCot,
  validateExportedCot,
  buildCotFilename,
  stripPiiFromCot,
} from '../../src/dashboard/cot-export.js';
import type { DashboardTrack } from '../../src/dashboard/track-store.js';

function makeTrack(overrides: Partial<DashboardTrack> = {}): DashboardTrack {
  return {
    trackId: 'TRK-001',
    threatClass: 'fpv_drone',
    lat: 48.22481,
    lon: 24.33621,
    altM: 120,
    confidence: 0.85,
    speedMs: 15,
    headingDeg: 270,
    state: 'confirmed',
    nodeCount: 3,
    errorM: 8.5,
    firstSeenAt: Date.now() - 5000,
    lastUpdatedAt: Date.now(),
    ...overrides,
  };
}

describe('FR-W4-08: CoT Export — Serialisation, Validation, and OPSEC', () => {
  it('FR-W4-08-01: exportTrackAsCot returns non-empty string', () => {
    const result = exportTrackAsCot(makeTrack());
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('FR-W4-08-02: exported CoT contains "event" XML element', () => {
    const xml = exportTrackAsCot(makeTrack());
    expect(xml).toMatch(/<event\b/i);
    expect(xml).toMatch(/<\/event>/i);
  });

  it('FR-W4-08-03: exported CoT contains trackId in uid attribute', () => {
    const track = makeTrack({ trackId: 'TRK-ABC-007' });
    const xml = exportTrackAsCot(track);
    expect(xml).toContain('TRK-ABC-007');
    // uid attribute must carry the trackId
    expect(xml).toMatch(/uid=["'][^"']*TRK-ABC-007[^"']*["']/);
  });

  it('FR-W4-08-04: exported CoT contains threat type code a-h-A for hostile air', () => {
    const xml = exportTrackAsCot(makeTrack({ threatClass: 'fpv_drone' }));
    // CoT type "a-h-A" = atom / hostile / Air
    expect(xml).toMatch(/a-h-A/);
  });

  it('FR-W4-08-05: exported CoT does not contain pipe characters — OPSEC', () => {
    const xml = exportTrackAsCot(makeTrack());
    expect(xml).not.toContain('|');
  });

  it('FR-W4-08-06: exportBulkCot for 3 tracks returns string with 3 event elements', () => {
    const tracks = [
      makeTrack({ trackId: 'TRK-001' }),
      makeTrack({ trackId: 'TRK-002' }),
      makeTrack({ trackId: 'TRK-003' }),
    ];
    const xml = exportBulkCot(tracks);
    const eventMatches = xml.match(/<event\b/gi);
    expect(eventMatches).not.toBeNull();
    expect(eventMatches!.length).toBe(3);
  });

  it('FR-W4-08-07: validateExportedCot returns valid=true for well-formed CoT', () => {
    const xml = exportTrackAsCot(makeTrack());
    const result = validateExportedCot(xml);
    expect(result.valid).toBe(true);
  });

  it('FR-W4-08-08: validateExportedCot returns correct trackCount', () => {
    const tracks = [
      makeTrack({ trackId: 'TRK-001' }),
      makeTrack({ trackId: 'TRK-002' }),
    ];
    const xml = exportBulkCot(tracks);
    const result = validateExportedCot(xml);
    expect(result.valid).toBe(true);
    expect(result.trackCount).toBe(2);
  });

  it('FR-W4-08-09: buildCotFilename includes trackId and ends with .cot', () => {
    const filename = buildCotFilename('TRK-XYZ-99');
    expect(filename).toContain('TRK-XYZ-99');
    expect(filename.endsWith('.cot')).toBe(true);
  });

  it('FR-W4-08-10: stripPiiFromCot removes any "nodeId" attribute values', () => {
    const dirtyXml = `<event uid="TRK-001" nodeId="NODE-ALPHA-7" type="a-h-A"><point lat="48.22481" lon="24.33621" /></event>`;
    const clean = stripPiiFromCot(dirtyXml);
    expect(clean).not.toContain('NODE-ALPHA-7');
    // nodeId attribute itself should be removed or blanked
    expect(clean).not.toMatch(/nodeId=["'][^"']+["']/);
  });

  it('FR-W4-08-11: exportTrackAsCot lat/lon precision is at most 5 decimal places — privacy', () => {
    // Provide a track with high-precision coordinates
    const track = makeTrack({ lat: 48.224812345, lon: 24.336219876 });
    const xml = exportTrackAsCot(track);
    // Extract lat value from point element
    const latMatch = xml.match(/lat=["']([^"']+)["']/);
    const lonMatch = xml.match(/lon=["']([^"']+)["']/);
    expect(latMatch).not.toBeNull();
    expect(lonMatch).not.toBeNull();
    const latDecimals = (latMatch![1].split('.')[1] ?? '').length;
    const lonDecimals = (lonMatch![1].split('.')[1] ?? '').length;
    expect(latDecimals).toBeLessThanOrEqual(5);
    expect(lonDecimals).toBeLessThanOrEqual(5);
  });
});
