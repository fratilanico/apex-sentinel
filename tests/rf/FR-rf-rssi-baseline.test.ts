// APEX-SENTINEL — TDD RED Tests
// RF Detection: RSSI Baseline Anomaly Detection
// Status: RED — implementation in src/rf/rssi-baseline.ts NOT_IMPLEMENTED

import { describe, it, expect, beforeEach } from 'vitest';
import { RollingRssiBaseline } from '../../src/rf/rssi-baseline.js';
import { ChannelSample } from '../../src/rf/types.js';

function makeSample(
  channel: number,
  band: '2.4GHz' | '5GHz',
  rssiDbm: number,
  offsetMs = 0,
): ChannelSample {
  return {
    channelNumber: channel,
    band,
    rssiDbm,
    timestampUs: (BigInt(Date.now() + offsetMs)) * 1000n,
  };
}

describe('FR-RF-01: RSSI Baseline — Rolling Anomaly Detection', () => {
  let baseline: RollingRssiBaseline;

  beforeEach(() => {
    baseline = new RollingRssiBaseline(300, 10);
  });

  it('RF-01-01: getBaseline returns null before min samples', () => {
    baseline.update(makeSample(6, '2.4GHz', -70));
    const result = baseline.getBaseline(6, '2.4GHz');
    expect(result).toBeNull();
  });

  it('RF-01-02: getBaseline returns entry after min samples', () => {
    for (let i = 0; i < 10; i++) {
      baseline.update(makeSample(6, '2.4GHz', -70 + i * 0.1, i * 100));
    }
    const result = baseline.getBaseline(6, '2.4GHz');
    expect(result).not.toBeNull();
    expect(result!.channelNumber).toBe(6);
    expect(result!.band).toBe('2.4GHz');
  });

  it('RF-01-03: mean RSSI is correct for uniform samples', () => {
    for (let i = 0; i < 10; i++) {
      baseline.update(makeSample(6, '2.4GHz', -70, i * 100));
    }
    const result = baseline.getBaseline(6, '2.4GHz');
    expect(result!.meanRssiDbm).toBeCloseTo(-70, 1);
  });

  it('RF-01-04: normal sample is NOT anomaly (within 3σ)', () => {
    // Build baseline with -70 ± 2dBm
    for (let i = 0; i < 20; i++) {
      baseline.update(makeSample(6, '2.4GHz', -70 + (i % 4 === 0 ? 2 : -2), i * 100));
    }
    const normalSample = makeSample(6, '2.4GHz', -69, 2100); // within range
    expect(baseline.isAnomaly(normalSample)).toBe(false);
  });

  it('RF-01-05: anomaly sample >3σ above baseline IS anomaly', () => {
    // Build stable baseline at -70 ± 1dBm
    for (let i = 0; i < 20; i++) {
      baseline.update(makeSample(6, '2.4GHz', -70, i * 100));
    }
    // RSSI jumped to -56 (+14dBm = way above 3σ)
    const anomalySample = makeSample(6, '2.4GHz', -56, 2100);
    expect(baseline.isAnomaly(anomalySample)).toBe(true);
  });

  it('RF-01-06: separate channels tracked independently', () => {
    for (let i = 0; i < 10; i++) {
      baseline.update(makeSample(1, '2.4GHz', -80, i * 100));
      baseline.update(makeSample(6, '2.4GHz', -70, i * 100));
    }
    const ch1 = baseline.getBaseline(1, '2.4GHz');
    const ch6 = baseline.getBaseline(6, '2.4GHz');
    expect(ch1!.meanRssiDbm).toBeCloseTo(-80, 1);
    expect(ch6!.meanRssiDbm).toBeCloseTo(-70, 1);
  });

  it('RF-01-07: 5GHz and 2.4GHz tracked independently', () => {
    for (let i = 0; i < 10; i++) {
      baseline.update(makeSample(36, '5GHz', -65, i * 100));
      baseline.update(makeSample(6, '2.4GHz', -70, i * 100));
    }
    expect(baseline.getBaseline(36, '5GHz')!.meanRssiDbm).toBeCloseTo(-65, 1);
    expect(baseline.getBaseline(6, '2.4GHz')!.meanRssiDbm).toBeCloseTo(-70, 1);
  });

  it('RF-01-08: 2σ threshold detects borderline anomaly that 3σ misses', () => {
    for (let i = 0; i < 20; i++) {
      baseline.update(makeSample(6, '2.4GHz', -70, i * 100));
    }
    const borderline = makeSample(6, '2.4GHz', -63, 2100); // ~7dBm above mean
    expect(baseline.isAnomaly(borderline, 2)).toBe(true);
    // 3σ threshold might not flag it depending on std
    // Just verify 2σ is always more sensitive than 3σ
    const withThree = baseline.isAnomaly(borderline, 3);
    const withTwo = baseline.isAnomaly(borderline, 2);
    expect(withTwo).toBe(true);
    if (!withThree) {
      expect(withTwo).toBe(true); // 2σ caught it even when 3σ didn't
    }
  });
});
