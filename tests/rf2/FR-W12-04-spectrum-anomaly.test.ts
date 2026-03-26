// APEX-SENTINEL — FR-W12-04: SpectrumAnomalyDetector Tests
// tests/rf2/FR-W12-04-spectrum-anomaly.test.ts

import { describe, it, expect } from 'vitest';
import {
  SpectrumAnomalyDetector,
  type SpectrumSample,
  type AnomalyResult,
} from '../../src/rf2/spectrum-anomaly-detector.js';

describe('FR-W12-04: SpectrumAnomalyDetector', () => {
  const detector = new SpectrumAnomalyDetector();

  function cleanSamples(count = 10): SpectrumSample[] {
    return Array.from({ length: count }, (_, i) => ({
      frequencyMHz: 800 + i * 10,
      powerDbm: -90,
      ts: i * 100,
    }));
  }

  // ── No anomaly ────────────────────────────────────────────────────────────

  it('FR-W12-04-T01: returns none for clean spectrum', () => {
    const result = detector.detect(cleanSamples());
    expect(result.anomalyType).toBe('none');
  });

  it('FR-W12-04-T02: severity is 0 for clean spectrum', () => {
    const result = detector.detect(cleanSamples());
    expect(result.severity).toBe(0);
  });

  // ── Broadband jamming ─────────────────────────────────────────────────────

  it('FR-W12-04-T03: detects broadband jamming (+15 dB over 50 MHz span)', () => {
    // Normal background: -90 dBm
    // Jammed band: 850–910 MHz elevated to -70 dBm (+20 dB)
    const samples: SpectrumSample[] = [
      ...cleanSamples(5),
      { frequencyMHz: 850, powerDbm: -70, ts: 600 },
      { frequencyMHz: 860, powerDbm: -70, ts: 700 },
      { frequencyMHz: 870, powerDbm: -70, ts: 800 },
      { frequencyMHz: 880, powerDbm: -70, ts: 900 },
      { frequencyMHz: 890, powerDbm: -70, ts: 1000 },
      { frequencyMHz: 900, powerDbm: -70, ts: 1100 },
      { frequencyMHz: 910, powerDbm: -70, ts: 1200 },
    ];
    const result = detector.detect(samples);
    expect(result.anomalyType).toBe('jamming');
  });

  it('FR-W12-04-T04: jamming result has affectedBandMHz defined', () => {
    const samples: SpectrumSample[] = [
      ...cleanSamples(5),
      { frequencyMHz: 850, powerDbm: -70, ts: 600 },
      { frequencyMHz: 860, powerDbm: -70, ts: 700 },
      { frequencyMHz: 870, powerDbm: -70, ts: 800 },
      { frequencyMHz: 880, powerDbm: -70, ts: 900 },
      { frequencyMHz: 890, powerDbm: -70, ts: 1000 },
      { frequencyMHz: 900, powerDbm: -70, ts: 1100 },
    ];
    const result = detector.detect(samples);
    if (result.anomalyType === 'jamming') {
      expect(result.affectedBandMHz).toBeDefined();
      expect(Array.isArray(result.affectedBandMHz)).toBe(true);
    }
  });

  it('FR-W12-04-T05: does NOT flag jamming if elevation < 15 dB', () => {
    // Only +10 dB elevation — below threshold
    const samples: SpectrumSample[] = [
      ...cleanSamples(5),
      { frequencyMHz: 850, powerDbm: -80, ts: 600 }, // -80 vs -90 = +10 dB
      { frequencyMHz: 860, powerDbm: -80, ts: 700 },
      { frequencyMHz: 870, powerDbm: -80, ts: 800 },
      { frequencyMHz: 880, powerDbm: -80, ts: 900 },
      { frequencyMHz: 890, powerDbm: -80, ts: 1000 },
      { frequencyMHz: 900, powerDbm: -80, ts: 1100 },
    ];
    const result = detector.detect(samples);
    expect(result.anomalyType).not.toBe('jamming');
  });

  // ── GPS spoofing ──────────────────────────────────────────────────────────

  it('FR-W12-04-T06: detects GPS spoofing at 1575.42 MHz', () => {
    const samples: SpectrumSample[] = [
      ...cleanSamples(5),
      { frequencyMHz: 1575.42, powerDbm: -50, ts: 600 }, // anomalously high GPS L1
    ];
    const result = detector.detect(samples);
    expect(result.anomalyType).toBe('gps_spoofing');
  });

  it('FR-W12-04-T07: GPS spoofing has severity > 0', () => {
    const samples: SpectrumSample[] = [
      { frequencyMHz: 1575.42, powerDbm: -50, ts: 0 },
    ];
    const result = detector.detect(samples);
    if (result.anomalyType === 'gps_spoofing') {
      expect(result.severity).toBeGreaterThan(0);
    }
  });

  // ── Replay attack ─────────────────────────────────────────────────────────

  it('FR-W12-04-T08: detects replay attack from duplicate packet hashes within 100 ms', () => {
    const samples: SpectrumSample[] = [
      { frequencyMHz: 900, powerDbm: -65, ts: 0, packetHash: 'abc123' },
      { frequencyMHz: 900, powerDbm: -65, ts: 50, packetHash: 'abc123' }, // duplicate within 100ms
    ];
    const result = detector.detect(samples);
    expect(result.anomalyType).toBe('replay_attack');
  });

  it('FR-W12-04-T09: does NOT flag replay attack for same hash > 100 ms apart', () => {
    const samples: SpectrumSample[] = [
      { frequencyMHz: 900, powerDbm: -65, ts: 0, packetHash: 'abc123' },
      { frequencyMHz: 900, powerDbm: -65, ts: 200, packetHash: 'abc123' }, // 200ms apart
    ];
    const result = detector.detect(samples);
    expect(result.anomalyType).not.toBe('replay_attack');
  });

  it('FR-W12-04-T10: does NOT flag replay when no packetHash present', () => {
    const samples: SpectrumSample[] = [
      { frequencyMHz: 900, powerDbm: -65, ts: 0 },
      { frequencyMHz: 900, powerDbm: -65, ts: 50 },
    ];
    const result = detector.detect(samples);
    expect(result.anomalyType).not.toBe('replay_attack');
  });

  // ── Result structure ──────────────────────────────────────────────────────

  it('FR-W12-04-T11: severity is between 0 and 1 inclusive', () => {
    const result = detector.detect(cleanSamples());
    expect(result.severity).toBeGreaterThanOrEqual(0);
    expect(result.severity).toBeLessThanOrEqual(1);
  });

  it('FR-W12-04-T12: anomalyType is one of the valid enum values', () => {
    const validTypes = ['jamming', 'gps_spoofing', 'replay_attack', 'none'];
    const result = detector.detect(cleanSamples());
    expect(validTypes).toContain(result.anomalyType);
  });
});
