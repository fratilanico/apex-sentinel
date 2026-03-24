// APEX-SENTINEL — RSSI Baseline Tracker
// W1 | src/rf/rssi-baseline.ts
// STUB — implementation pending (TDD RED)

import { ChannelSample, ChannelBaseline, RssiBaseline } from './types.js';

export class RollingRssiBaseline implements RssiBaseline {
  constructor(
    private readonly windowSeconds: number = 300,
    private readonly minSamples: number = 10,
  ) {}

  update(_sample: ChannelSample): void {
    throw new Error('NOT_IMPLEMENTED');
  }

  getBaseline(_channel: number, _band: '2.4GHz' | '5GHz'): ChannelBaseline | null {
    throw new Error('NOT_IMPLEMENTED');
  }

  isAnomaly(_sample: ChannelSample, _sigmaThreshold: number = 3): boolean {
    throw new Error('NOT_IMPLEMENTED');
  }
}
