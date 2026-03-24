// APEX-SENTINEL — RF/EMF Detection Types
// W1 | src/rf/types.ts

export interface ChannelSample {
  channelNumber: number;
  band: '2.4GHz' | '5GHz';
  rssiDbm: number;
  timestampUs: bigint;
}

export interface ChannelBaseline {
  channelNumber: number;
  band: '2.4GHz' | '5GHz';
  meanRssiDbm: number;
  stdRssiDbm: number;
  sampleCount: number;
  windowStartUs: bigint;
}

export interface RfAnomalyEvent {
  eventId: string;
  nodeId: string;
  timestampUs: bigint;
  anomalousChannels: Array<{
    channel: ChannelSample;
    baseline: ChannelBaseline;
    deviationDbm: number;
    sigmaCount: number;
  }>;
  dualBandCorrelated: boolean;
  confidence: number;
}

export interface RssiBaseline {
  update(sample: ChannelSample): void;
  getBaseline(channel: number, band: '2.4GHz' | '5GHz'): ChannelBaseline | null;
  isAnomaly(sample: ChannelSample, sigmaThreshold?: number): boolean;
}
