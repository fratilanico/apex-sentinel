// APEX-SENTINEL — ELRS RF Fingerprint
// FR-W7-04 | src/rf/elrs-fingerprint.ts
//
// Detects and fingerprints ELRS 900MHz transmissions (Foxeer TRX1003 / ExpressLRS).
// Confirmed as Russian FPV drone RF link (INDIGO team, 2026-03 meeting).
// Operators cut the ELRS link 2-10 seconds before terminal impact — detecting
// RF silence is a critical terminal-phase indicator for TerminalPhaseDetector.
//
// Protocol: ELRS at 900MHz band, burst rate ≈ 500Hz (2ms packet interval).
// Silence threshold: > 2000ms with no valid ELRS packets → rfSilent = true.
// Loss threshold:    packet loss rate > 75% in 200ms window → rfSilent = true.

export interface ElrsConfig {
  /** Target ELRS frequency band in MHz. Typically 915 (US/EU/UA field). */
  frequencyMhz: number;
  /** Minimum dBm for valid burst detection. Below this is treated as noise floor. */
  burstThresholdDbm: number;
}

export interface RfSample {
  timestampMs: number;
  powerDbm: number;
  frequencyMhz: number;
}

export interface ElrsPacketLossEvent {
  lossRate: number;
  timestampMs: number;
}

type ElrsEventName = 'packetLoss';
type ElrsListener = (event: ElrsPacketLossEvent) => void;

/** ELRS burst rate: 500 packets/second = 1 packet every 2ms */
const ELRS_BURST_RATE_HZ = 500;
const ELRS_PACKET_INTERVAL_MS = 1000 / ELRS_BURST_RATE_HZ; // 2ms
/** Observation window for packet loss computation */
const LOSS_WINDOW_MS = 200;
/** Silence window: no packets for this long → rfSilent */
const SILENCE_WINDOW_MS = 2000;
/** Packet loss threshold above which rfSilent becomes true */
const LOSS_THRESHOLD_SILENT = 0.75;
/** Packet loss threshold at which an event is emitted */
const LOSS_THRESHOLD_EVENT = 0.80;
/** Frequency tolerance in MHz — samples within ±10MHz of target are accepted */
const FREQ_TOLERANCE_MHZ = 10;

export class ElrsRfFingerprint {
  private readonly config: ElrsConfig;
  private readonly listeners = new Map<ElrsEventName, ElrsListener[]>();

  /** All received ELRS-band samples, kept in ascending timestamp order */
  private samples: RfSample[] = [];
  /** Simulated "current time" — updated by tick() or automatically from sample timestamps */
  private currentTimeMs = 0;
  /** Whether a high-loss event has been emitted for the current window (prevents repeated emissions) */
  private lastLossEventRate = 0;

  constructor(config: ElrsConfig) {
    this.config = config;
  }

  /** Advance the detector clock. Triggers rfSilent and loss-event recalculation. */
  tick(nowMs: number): void {
    this.currentTimeMs = nowMs;
    this.pruneOldSamples();
    this.checkAndEmitLossEvent();
  }

  /** Process a single RF sample. Updates internal state. */
  processSample(sample: RfSample): void {
    if (!this.isElrsSample(sample)) {
      return;
    }
    this.samples.push(sample);
    if (sample.timestampMs > this.currentTimeMs) {
      this.currentTimeMs = sample.timestampMs;
    }
    this.pruneOldSamples();
    this.checkAndEmitLossEvent();
  }

  /** True when the ELRS link is considered silent (operator cut link before impact). */
  get rfSilent(): boolean {
    // Uninitialized: no judgment possible until the first tick() or sample
    if (this.samples.length === 0 && this.currentTimeMs === 0) return false;

    // tick() was called but we have never seen any valid ELRS traffic → silent
    if (this.samples.length === 0) return true;

    const lastSample = this.samples[this.samples.length - 1];
    const silenceAge = this.currentTimeMs - lastSample.timestampMs;

    if (silenceAge > SILENCE_WINDOW_MS) return true;
    if (this.getPacketLossRate() > LOSS_THRESHOLD_SILENT) return true;

    return false;
  }

  /**
   * Packet loss rate in the last LOSS_WINDOW_MS milliseconds.
   * 0.0 = no loss, 1.0 = complete loss.
   */
  getPacketLossRate(): number {
    if (this.samples.length === 0) return 1.0;

    const windowStart = this.currentTimeMs - LOSS_WINDOW_MS;
    const windowSamples = this.samples.filter(s => s.timestampMs >= windowStart);

    if (windowSamples.length === 0) return 1.0;

    const expectedPackets = LOSS_WINDOW_MS / ELRS_PACKET_INTERVAL_MS; // 100
    const lossRate = Math.max(0, 1 - windowSamples.length / expectedPackets);
    return lossRate;
  }

  on(event: ElrsEventName, listener: ElrsListener): void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);
  }

  reset(): void {
    this.samples = [];
    this.currentTimeMs = 0;
    this.lastLossEventRate = 0;
  }

  private isElrsSample(sample: RfSample): boolean {
    const freqOk = Math.abs(sample.frequencyMhz - this.config.frequencyMhz) <= FREQ_TOLERANCE_MHZ;
    const powerOk = sample.powerDbm >= this.config.burstThresholdDbm;
    return freqOk && powerOk;
  }

  private pruneOldSamples(): void {
    // Keep only samples within the longer of the two windows (silence = 2000ms)
    const cutoff = this.currentTimeMs - Math.max(SILENCE_WINDOW_MS, LOSS_WINDOW_MS) - 100;
    this.samples = this.samples.filter(s => s.timestampMs >= cutoff);
  }

  private checkAndEmitLossEvent(): void {
    const lossRate = this.getPacketLossRate();
    if (lossRate >= LOSS_THRESHOLD_EVENT && lossRate > this.lastLossEventRate) {
      this.lastLossEventRate = lossRate;
      this.emit('packetLoss', { lossRate, timestampMs: this.currentTimeMs });
    } else if (lossRate < LOSS_THRESHOLD_EVENT) {
      this.lastLossEventRate = 0; // reset so it can fire again
    }
  }

  private emit(event: ElrsEventName, payload: ElrsPacketLossEvent): void {
    const ls = this.listeners.get(event) ?? [];
    for (const l of ls) l(payload);
  }
}
