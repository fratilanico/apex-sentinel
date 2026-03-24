// APEX-SENTINEL — RSSI Rolling Baseline Tracker
// W1 | src/rf/rssi-baseline.ts

import { ChannelSample, ChannelBaseline, RssiBaseline } from './types.js';

interface ChannelWindow {
  samples: number[];
  timestamps: bigint[];
}

function channelKey(channel: number, band: '2.4GHz' | '5GHz'): string {
  return `${band}-${channel}`;
}

export class RollingRssiBaseline implements RssiBaseline {
  private windows = new Map<string, ChannelWindow>();

  constructor(
    private readonly windowSeconds: number = 300,
    private readonly minSamples: number = 10,
  ) {}

  update(sample: ChannelSample): void {
    const key = channelKey(sample.channelNumber, sample.band);
    if (!this.windows.has(key)) {
      this.windows.set(key, { samples: [], timestamps: [] });
    }
    const window = this.windows.get(key)!;
    window.samples.push(sample.rssiDbm);
    window.timestamps.push(sample.timestampUs);
    this.evict(window, sample.timestampUs);
  }

  getBaseline(channel: number, band: '2.4GHz' | '5GHz'): ChannelBaseline | null {
    const key = channelKey(channel, band);
    const window = this.windows.get(key);
    if (!window || window.samples.length < this.minSamples) return null;

    const mean = this.mean(window.samples);
    const std = this.std(window.samples, mean);

    return {
      channelNumber: channel,
      band,
      meanRssiDbm: mean,
      stdRssiDbm: std,
      sampleCount: window.samples.length,
      windowStartUs: window.timestamps[0],
    };
  }

  isAnomaly(sample: ChannelSample, sigmaThreshold: number = 3): boolean {
    const baseline = this.getBaseline(sample.channelNumber, sample.band);
    if (!baseline) return false;
    const deviation = sample.rssiDbm - baseline.meanRssiDbm;
    return deviation > sigmaThreshold * Math.max(baseline.stdRssiDbm, 0.5);
  }

  private evict(window: ChannelWindow, nowUs: bigint): void {
    const cutoffUs = nowUs - BigInt(this.windowSeconds) * 1_000_000n;
    while (window.timestamps.length > 0 && window.timestamps[0] < cutoffUs) {
      window.timestamps.shift();
      window.samples.shift();
    }
  }

  private mean(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private std(values: number[], mean: number): number {
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }
}
