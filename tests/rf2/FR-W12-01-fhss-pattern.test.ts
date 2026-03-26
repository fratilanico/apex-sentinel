// APEX-SENTINEL — FR-W12-01: FhssPatternAnalyzer Tests
// tests/rf2/FR-W12-01-fhss-pattern.test.ts

import { describe, it, expect } from 'vitest';
import { FhssPatternAnalyzer, type FrequencySample } from '../../src/rf2/fhss-pattern-analyzer.js';

describe('FR-W12-01: FhssPatternAnalyzer', () => {
  const analyzer = new FhssPatternAnalyzer();

  function makeSamples(
    centerMHz: number,
    spreadMHz: number,
    hopIntervalMs: number,
    count: number,
    startTs = 0,
    rssi = -65,
  ): FrequencySample[] {
    return Array.from({ length: count }, (_, i) => ({
      frequencyMHz: centerMHz + (Math.random() * spreadMHz - spreadMHz / 2),
      ts: startTs + i * hopIntervalMs,
      rssi,
    }));
  }

  // ── ELRS 900 MHz ──────────────────────────────────────────────────────────

  it('FR-W12-01-T01: detects ELRS 900 MHz from ideal samples', () => {
    const samples: FrequencySample[] = [
      { frequencyMHz: 868, ts: 0, rssi: -65 },
      { frequencyMHz: 890, ts: 1, rssi: -64 },
      { frequencyMHz: 910, ts: 2, rssi: -66 },
      { frequencyMHz: 875, ts: 3, rssi: -65 },
      { frequencyMHz: 895, ts: 4, rssi: -63 },
    ];
    const result = analyzer.analyze(samples);
    expect(result).not.toBeNull();
    expect(result!.protocol).toBe('elrs_900');
  });

  it('FR-W12-01-T02: ELRS 900 hop interval is approximately 1ms', () => {
    const samples: FrequencySample[] = [
      { frequencyMHz: 870, ts: 0, rssi: -65 },
      { frequencyMHz: 900, ts: 1, rssi: -64 },
      { frequencyMHz: 920, ts: 2, rssi: -66 },
    ];
    const result = analyzer.analyze(samples);
    expect(result).not.toBeNull();
    expect(result!.hopInterval_ms).toBeGreaterThanOrEqual(0.9);
    expect(result!.hopInterval_ms).toBeLessThanOrEqual(1.1);
  });

  it('FR-W12-01-T03: ELRS 900 band is within 863–928 MHz', () => {
    const samples: FrequencySample[] = [
      { frequencyMHz: 865, ts: 0, rssi: -65 },
      { frequencyMHz: 895, ts: 1, rssi: -64 },
      { frequencyMHz: 925, ts: 2, rssi: -66 },
    ];
    const result = analyzer.analyze(samples);
    expect(result).not.toBeNull();
    expect(result!.bandMHz[0]).toBeGreaterThanOrEqual(863);
    expect(result!.bandMHz[1]).toBeLessThanOrEqual(928);
  });

  it('FR-W12-01-T04: ELRS 900 confidence ≥ 0.80 on clean samples', () => {
    const samples: FrequencySample[] = [
      { frequencyMHz: 868, ts: 0, rssi: -65 },
      { frequencyMHz: 890, ts: 1, rssi: -64 },
      { frequencyMHz: 910, ts: 2, rssi: -66 },
      { frequencyMHz: 875, ts: 3, rssi: -65 },
    ];
    const result = analyzer.analyze(samples);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0.80);
  });

  // ── DJI OcuSync 2.4 GHz ──────────────────────────────────────────────────

  it('FR-W12-01-T05: detects DJI OcuSync 2.4 GHz from ideal samples', () => {
    const samples: FrequencySample[] = [
      { frequencyMHz: 2410, ts: 0, rssi: -70 },
      { frequencyMHz: 2440, ts: 10, rssi: -69 },
      { frequencyMHz: 2465, ts: 20, rssi: -71 },
    ];
    const result = analyzer.analyze(samples);
    expect(result).not.toBeNull();
    expect(result!.protocol).toBe('dji_ocusync_2g');
  });

  it('FR-W12-01-T06: DJI OcuSync hop interval is approximately 10 ms', () => {
    const samples: FrequencySample[] = [
      { frequencyMHz: 2410, ts: 0, rssi: -70 },
      { frequencyMHz: 2440, ts: 10, rssi: -69 },
      { frequencyMHz: 2465, ts: 20, rssi: -71 },
    ];
    const result = analyzer.analyze(samples);
    expect(result).not.toBeNull();
    expect(result!.hopInterval_ms).toBeGreaterThanOrEqual(9);
    expect(result!.hopInterval_ms).toBeLessThanOrEqual(11);
  });

  // ── TBS Crossfire 868 MHz ─────────────────────────────────────────────────

  it('FR-W12-01-T07: detects TBS Crossfire 868 MHz from ideal samples', () => {
    const samples: FrequencySample[] = [
      { frequencyMHz: 869.0, ts: 0, rssi: -60 },
      { frequencyMHz: 869.5, ts: 4, rssi: -61 },
      { frequencyMHz: 870.0, ts: 8, rssi: -60 },
    ];
    const result = analyzer.analyze(samples);
    expect(result).not.toBeNull();
    expect(result!.protocol).toBe('crossfire');
  });

  it('FR-W12-01-T08: Crossfire band is within 869–870 MHz', () => {
    const samples: FrequencySample[] = [
      { frequencyMHz: 869.0, ts: 0, rssi: -60 },
      { frequencyMHz: 869.5, ts: 4, rssi: -61 },
      { frequencyMHz: 870.0, ts: 8, rssi: -60 },
    ];
    const result = analyzer.analyze(samples);
    expect(result).not.toBeNull();
    expect(result!.bandMHz[0]).toBeGreaterThanOrEqual(869);
    expect(result!.bandMHz[1]).toBeLessThanOrEqual(870);
  });

  // ── Insufficient samples ──────────────────────────────────────────────────

  it('FR-W12-01-T09: returns null when fewer than 3 samples provided', () => {
    const result = analyzer.analyze([
      { frequencyMHz: 900, ts: 0, rssi: -65 },
      { frequencyMHz: 910, ts: 1, rssi: -65 },
    ]);
    expect(result).toBeNull();
  });

  it('FR-W12-01-T10: returns null for empty sample array', () => {
    expect(analyzer.analyze([])).toBeNull();
  });

  // ── Unknown band ──────────────────────────────────────────────────────────

  it('FR-W12-01-T11: returns unknown protocol for unrecognised frequency band', () => {
    const samples: FrequencySample[] = [
      { frequencyMHz: 400, ts: 0, rssi: -65 },
      { frequencyMHz: 420, ts: 5, rssi: -65 },
      { frequencyMHz: 440, ts: 10, rssi: -65 },
    ];
    const result = analyzer.analyze(samples);
    // Either null or unknown — implementation may return null for unmatched
    if (result !== null) {
      expect(result.protocol).toBe('unknown');
    }
  });

  it('FR-W12-01-T12: result has all required fields', () => {
    const samples: FrequencySample[] = [
      { frequencyMHz: 868, ts: 0, rssi: -65 },
      { frequencyMHz: 890, ts: 1, rssi: -64 },
      { frequencyMHz: 910, ts: 2, rssi: -66 },
    ];
    const result = analyzer.analyze(samples);
    expect(result).not.toBeNull();
    expect(typeof result!.protocol).toBe('string');
    expect(typeof result!.hopInterval_ms).toBe('number');
    expect(Array.isArray(result!.bandMHz)).toBe(true);
    expect(result!.bandMHz).toHaveLength(2);
    expect(typeof result!.confidence).toBe('number');
    expect(result!.confidence).toBeGreaterThan(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
  });
});
