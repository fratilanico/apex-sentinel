// APEX-SENTINEL — Battery Optimizer — Adaptive Sampling Modes
// FR-W3-12

export type BatteryMode = 'performance' | 'balanced' | 'saver' | 'critical';

export interface SamplingConfig {
  inferenceIntervalMs: number;
  publishIntervalMs: number;
  sampleRateHz: number;
}

const SAMPLING_CONFIGS: Record<BatteryMode, SamplingConfig> = {
  performance: { inferenceIntervalMs: 200, publishIntervalMs: 500, sampleRateHz: 16000 },
  balanced: { inferenceIntervalMs: 500, publishIntervalMs: 1000, sampleRateHz: 16000 },
  saver: { inferenceIntervalMs: 1000, publishIntervalMs: 2000, sampleRateHz: 16000 },
  critical: { inferenceIntervalMs: 2000, publishIntervalMs: 5000, sampleRateHz: 8000 },
};

export class BatteryOptimizer {
  getMode(batteryPercent: number, isCharging: boolean): BatteryMode {
    // Determine raw mode from battery level
    let mode: BatteryMode;
    if (batteryPercent > 50) {
      mode = 'performance';
    } else if (batteryPercent > 20) {
      mode = 'balanced';
    } else if (batteryPercent > 10) {
      mode = 'saver';
    } else {
      mode = 'critical';
    }

    // Charging overrides: minimum 'balanced'
    if (isCharging) {
      if (mode === 'saver' || mode === 'critical') {
        mode = 'balanced';
      }
    }

    return mode;
  }

  getSamplingConfig(mode: BatteryMode): SamplingConfig {
    return { ...SAMPLING_CONFIGS[mode] };
  }

  shouldDisableDetection(batteryPercent: number, isCharging: boolean): boolean {
    if (isCharging) {
      return false;
    }
    return batteryPercent <= 3;
  }
}
