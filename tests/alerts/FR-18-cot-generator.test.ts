// APEX-SENTINEL — TDD RED Tests
// FR-18: FreeTAKServer CoT Event Generation
// Status: RED — implementation in src/alerts/cot-generator.ts NOT_IMPLEMENTED

import { describe, it, expect, beforeEach } from 'vitest';
import { CotGenerator } from '../../src/alerts/cot-generator.js';
import { Track } from '../../src/tracking/types.js';

function makeConfirmedTrack(): Track {
  return {
    trackId: 'TRK-001',
    state: 'confirmed',
    threatClass: 'fpv_drone',
    position: {
      lat: 48.2255,
      lon: 24.3370,
      altM: 28,
      timestampUs: BigInt(1_711_234_567_000_000),
    },
    velocity: {
      vLatMs: -4.2,
      vLonMs: 8.7,
      vAltMs: -0.5,
    },
    confidence: 0.91,
    updateCount: 5,
    contributingGates: [1, 2, 3],
    lastUpdatedUs: BigInt(1_711_234_567_000_000),
    createdAt: BigInt(1_711_234_000_000_000),
  };
}

describe('FR-18-00: FreeTAKServer CoT Event Generator', () => {
  let gen: CotGenerator;

  beforeEach(() => {
    gen = new CotGenerator();
  });

  it('FR-18-01: generateFromTrack returns CotXmlEvent with uid matching trackId', () => {
    const track = makeConfirmedTrack();
    const cot = gen.generateFromTrack(track);
    expect(cot.uid).toContain('TRK-001');
  });

  it('FR-18-02: CoT type for fpv_drone is hostile aircraft (a-h-A-M-F)', () => {
    const track = makeConfirmedTrack();
    const cot = gen.generateFromTrack(track);
    expect(cot.type).toBe('a-h-A-M-F');
  });

  it('FR-18-03: CoT position matches track position', () => {
    const track = makeConfirmedTrack();
    const cot = gen.generateFromTrack(track);
    expect(cot.lat).toBeCloseTo(48.2255, 4);
    expect(cot.lon).toBeCloseTo(24.3370, 4);
    expect(cot.hae).toBeCloseTo(28, 1);
  });

  it('FR-18-04: stale time is 5 minutes after event time', () => {
    const track = makeConfirmedTrack();
    const cot = gen.generateFromTrack(track);
    const diffMs = cot.stale.getTime() - cot.time.getTime();
    expect(diffMs).toBe(5 * 60 * 1000); // 5 minutes
  });

  it('FR-18-05: remarks include confidence and threat class', () => {
    const track = makeConfirmedTrack();
    const cot = gen.generateFromTrack(track);
    expect(cot.remarks).toContain('fpv_drone');
    expect(cot.remarks).toContain('0.91');
  });

  it('FR-18-06: toXmlString produces valid XML with event element', () => {
    const track = makeConfirmedTrack();
    const cot = gen.generateFromTrack(track);
    const xml = gen.toXmlString(cot);
    expect(xml).toContain('<event');
    expect(xml).toContain('<point');
    expect(xml).toContain('<detail');
    expect(xml).toContain('</event>');
  });

  it('FR-18-07: toXmlString includes uid in event element', () => {
    const track = makeConfirmedTrack();
    const cot = gen.generateFromTrack(track);
    const xml = gen.toXmlString(cot);
    expect(xml).toContain('TRK-001');
  });

  it('FR-18-08: isValidCotXml returns true for well-formed CoT', () => {
    const track = makeConfirmedTrack();
    const cot = gen.generateFromTrack(track);
    const xml = gen.toXmlString(cot);
    expect(gen.isValidCotXml(xml)).toBe(true);
  });

  it('FR-18-09: isValidCotXml returns false for malformed XML', () => {
    expect(gen.isValidCotXml('<broken>no cot here')).toBe(false);
    expect(gen.isValidCotXml('')).toBe(false);
  });

  it('FR-18-10: ce (circular error) reflects confidence level', () => {
    const track = makeConfirmedTrack(); // confidence 0.91
    const cot = gen.generateFromTrack(track);
    // High confidence = smaller circular error (more precise)
    expect(cot.ce).toBeLessThan(100); // ±100m or better for 0.91 confidence
  });
});
