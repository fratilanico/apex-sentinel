// APEX-SENTINEL — W6 False Positive Guard
// FR-W6-03 | src/ml/false-positive-guard.ts
//
// CRITICAL: 50cc motorcycle acoustic signature is IDENTICAL to Shahed-136 piston.
// Discrimination uses 3 independent gates:
//   1. YAMNet confidence < 0.85 → suppress (low-confidence)
//   2. Temporal window: linear track at >60km/h → vehicle (temporal-linear)
//   3. Doppler shift: approach speed >60km/h → vehicle (doppler-vehicle)

export interface TemporalSample {
  lat: number;
  lon: number;
  timestamp: number;
  speedKmh: number;
  heading: number;
}

export interface FalsePositiveAssessment {
  isFalsePositive: boolean;
  confidence: number;
  reason: 'low-confidence' | 'temporal-linear' | 'doppler-vehicle' | null;
}

export interface AssessInput {
  yamnetConfidence: number;
  hasRfSignal: boolean;
  trackId: string;
  dopplerShiftKmh?: number;
}

interface WindowEntry {
  samples: TemporalSample[];
  lastUpdated: number;
}

export interface FalsePositiveGuardConfig {
  temporalWindowMs: number;    // default 10000
  dopplerThresholdKmh: number; // default 60
  confidenceThreshold?: number; // default 0.85
}

const HEADING_VARIANCE_THRESHOLD = 45; // degrees — if heading spread < this, it's linear

export class FalsePositiveGuard {
  private readonly temporalWindowMs: number;
  private readonly dopplerThreshold: number;
  private readonly confidenceThreshold: number;
  private readonly windows = new Map<string, WindowEntry>();

  constructor(config: FalsePositiveGuardConfig) {
    this.temporalWindowMs = config.temporalWindowMs;
    this.dopplerThreshold = config.dopplerThresholdKmh;
    this.confidenceThreshold = config.confidenceThreshold ?? 0.85;
  }

  addTemporalSample(input: { trackId: string; sample: TemporalSample }): void {
    let entry = this.windows.get(input.trackId);
    if (!entry) {
      entry = { samples: [], lastUpdated: Date.now() };
      this.windows.set(input.trackId, entry);
    }
    // Prune samples older than temporal window
    const cutoff = input.sample.timestamp - this.temporalWindowMs;
    entry.samples = entry.samples.filter(s => s.timestamp >= cutoff);
    entry.samples.push(input.sample);
    entry.lastUpdated = Date.now();
  }

  assess(input: AssessInput): FalsePositiveAssessment {
    // Gate 1: low confidence
    if (input.yamnetConfidence < this.confidenceThreshold) {
      return { isFalsePositive: true, confidence: input.yamnetConfidence, reason: 'low-confidence' };
    }

    // Gate 2: Doppler shift indicates high-speed linear approach
    if (input.dopplerShiftKmh !== undefined && input.dopplerShiftKmh > this.dopplerThreshold) {
      return { isFalsePositive: true, confidence: input.yamnetConfidence, reason: 'doppler-vehicle' };
    }

    // Gate 3: temporal window analysis
    const entry = this.windows.get(input.trackId);
    if (entry && entry.samples.length >= 3) {
      if (this.isLinearVehiclePattern(entry.samples)) {
        return { isFalsePositive: true, confidence: input.yamnetConfidence, reason: 'temporal-linear' };
      }
    }

    return { isFalsePositive: false, confidence: input.yamnetConfidence, reason: null };
  }

  private isLinearVehiclePattern(samples: TemporalSample[]): boolean {
    // All samples at speed > threshold?
    const allFast = samples.every(s => s.speedKmh > this.dopplerThreshold);
    if (!allFast) return false;

    // Heading variance: linear track = small variance
    const headings = samples.map(s => s.heading);
    const meanHeading = headings.reduce((a, b) => a + b, 0) / headings.length;
    const variance = headings.reduce((sum, h) => sum + Math.pow(h - meanHeading, 2), 0) / headings.length;
    const stdDev = Math.sqrt(variance);

    return stdDev < HEADING_VARIANCE_THRESHOLD;
  }

  clearWindow(trackId: string): void {
    this.windows.delete(trackId);
  }

  getWindowStats(trackId: string): { count: number } {
    const entry = this.windows.get(trackId);
    return { count: entry ? entry.samples.length : 0 };
  }

  shouldSuppressAlert(trackId: string, assessment: FalsePositiveAssessment): boolean {
    return assessment.isFalsePositive;
  }
}
