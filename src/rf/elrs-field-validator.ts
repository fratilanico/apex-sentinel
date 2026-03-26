// APEX-SENTINEL — W8 ELRS RF Field Validator
// FR-W8-04 | src/rf/elrs-field-validator.ts
//
// Validates ELRS 900MHz FHSS detection on field captures.
// Tunes packet rate threshold envelope against urban background noise.

export interface ElrsCapture {
  frequencyHz: number;   // center frequency
  packetRatePps: number; // packets per second
  spreadingPattern: 'fhss' | 'fixed' | 'unknown';
  durationMs: number;
  burstCount: number;
}

export interface FieldValidationResult {
  recall: number;
  falsePositiveRate: number;
  elrsSampleCount: number;
  nonElrsSampleCount: number;
  thresholdUsed: number;
  passed: boolean;
}

export interface ElrsConfig {
  packetRateThresholdPps: number;
  frequencyBandMinHz: number;
  frequencyBandMaxHz: number;
  requireFhss: boolean;
}

const DEFAULT_CONFIG: ElrsConfig = {
  packetRateThresholdPps: parseInt(process.env.ELRS_PACKET_RATE_PPS ?? '450', 10),
  frequencyBandMinHz: 868_000_000,
  frequencyBandMaxHz: 928_000_000,
  requireFhss: true,
};

export class ElrsFieldValidator {
  private config: ElrsConfig;
  private natsKvClient: { put: (key: string, value: string) => Promise<void>; get: (key: string) => Promise<string | null> } | null = null;

  constructor(config?: Partial<ElrsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...(config ?? {}) };
  }

  setNatsKvClient(client: { put: (key: string, value: string) => Promise<void>; get: (key: string) => Promise<string | null> }): void {
    this.natsKvClient = client;
  }

  detectElrs(capture: ElrsCapture): boolean {
    const inBand = capture.frequencyHz >= this.config.frequencyBandMinHz &&
                   capture.frequencyHz <= this.config.frequencyBandMaxHz;
    const highPacketRate = capture.packetRatePps >= this.config.packetRateThresholdPps;
    const isFhss = !this.config.requireFhss || capture.spreadingPattern === 'fhss';
    return inBand && highPacketRate && isFhss;
  }

  validateField(elrsCaptures: ElrsCapture[], nonElrsCaptures: ElrsCapture[]): FieldValidationResult {
    const truePositives = elrsCaptures.filter(c => this.detectElrs(c)).length;
    const falsePositives = nonElrsCaptures.filter(c => this.detectElrs(c)).length;

    const recall = elrsCaptures.length > 0 ? truePositives / elrsCaptures.length : 0;
    const fpr = nonElrsCaptures.length > 0 ? falsePositives / nonElrsCaptures.length : 0;

    return {
      recall: +recall.toFixed(4),
      falsePositiveRate: +fpr.toFixed(4),
      elrsSampleCount: elrsCaptures.length,
      nonElrsSampleCount: nonElrsCaptures.length,
      thresholdUsed: this.config.packetRateThresholdPps,
      passed: recall >= 0.95 && fpr < 0.02,
    };
  }

  async saveConfig(): Promise<void> {
    if (!this.natsKvClient) return;
    await this.natsKvClient.put('rf:elrs:config', JSON.stringify(this.config));
  }

  async loadConfig(): Promise<void> {
    if (!this.natsKvClient) return;
    const stored = await this.natsKvClient.get('rf:elrs:config');
    if (stored) {
      this.config = { ...this.config, ...JSON.parse(stored) };
    }
  }

  getConfig(): ElrsConfig {
    return { ...this.config };
  }

  setPacketRateThreshold(pps: number): void {
    this.config.packetRateThresholdPps = pps;
  }
}
