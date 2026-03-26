// APEX-SENTINEL — FR-W12-04: Spectrum Anomaly Detector
// src/rf2/spectrum-anomaly-detector.ts
//
// Detects jamming, GPS spoofing, and replay attacks from RF spectrum samples.

export interface SpectrumSample {
  frequencyMHz: number;
  powerDbm: number;
  ts: number;
  packetHash?: string;
}

export interface AnomalyResult {
  anomalyType: 'jamming' | 'gps_spoofing' | 'replay_attack' | 'none';
  severity: number;
  affectedBandMHz?: [number, number];
}

const JAMMING_ELEVATION_DB = 15;     // dB above background to flag jamming
const JAMMING_MIN_SPAN_MHZ = 50;    // minimum span of elevated frequencies
const GPS_L1_MHZ = 1575.42;
const GPS_L1_TOLERANCE_MHZ = 2;
const GPS_ANOMALY_DBM = -60;         // signal above this at GPS L1 is anomalous
const REPLAY_WINDOW_MS = 100;

export class SpectrumAnomalyDetector {
  detect(samples: SpectrumSample[]): AnomalyResult {
    if (samples.length === 0) return { anomalyType: 'none', severity: 0 };

    // Check replay attack first (cheapest)
    const replay = this.checkReplay(samples);
    if (replay) return replay;

    // Check GPS spoofing
    const gps = this.checkGpsSpoofing(samples);
    if (gps) return gps;

    // Check broadband jamming
    const jamming = this.checkJamming(samples);
    if (jamming) return jamming;

    return { anomalyType: 'none', severity: 0 };
  }

  private checkReplay(samples: SpectrumSample[]): AnomalyResult | null {
    const withHash = samples.filter(s => s.packetHash !== undefined);
    if (withHash.length < 2) return null;

    for (let i = 0; i < withHash.length; i++) {
      for (let j = i + 1; j < withHash.length; j++) {
        const s1 = withHash[i]!;
        const s2 = withHash[j]!;
        if (s1.packetHash === s2.packetHash) {
          const timeDelta = Math.abs(s2.ts - s1.ts);
          if (timeDelta <= REPLAY_WINDOW_MS) {
            return {
              anomalyType: 'replay_attack',
              severity: Math.min(1, 1 - timeDelta / REPLAY_WINDOW_MS),
            };
          }
        }
      }
    }
    return null;
  }

  private checkGpsSpoofing(samples: SpectrumSample[]): AnomalyResult | null {
    const gpsSamples = samples.filter(
      s => Math.abs(s.frequencyMHz - GPS_L1_MHZ) <= GPS_L1_TOLERANCE_MHZ,
    );
    if (gpsSamples.length === 0) return null;

    const maxPower = Math.max(...gpsSamples.map(s => s.powerDbm));
    if (maxPower > GPS_ANOMALY_DBM) {
      const severity = Math.min(1, (maxPower - GPS_ANOMALY_DBM) / 40);
      return { anomalyType: 'gps_spoofing', severity };
    }
    return null;
  }

  private checkJamming(samples: SpectrumSample[]): AnomalyResult | null {
    if (samples.length < 6) return null;

    // Compute background noise floor using lower quartile (25th percentile)
    // so that a jammed environment (where many samples are elevated) still
    // gives a meaningful baseline — median can be pulled up by jamming itself.
    const powers = samples.map(s => s.powerDbm).sort((a, b) => a - b);
    const background = powers[Math.floor(powers.length * 0.25)]!;

    // Find samples elevated above background by threshold
    const elevated = samples.filter(s => s.powerDbm > background + JAMMING_ELEVATION_DB);
    if (elevated.length < 3) return null;

    // Check if elevated samples span > JAMMING_MIN_SPAN_MHZ
    const freqs = elevated.map(s => s.frequencyMHz).sort((a, b) => a - b);
    const span = freqs[freqs.length - 1]! - freqs[0]!;

    if (span >= JAMMING_MIN_SPAN_MHZ) {
      const avgElevation = elevated.reduce((s, e) => s + (e.powerDbm - background), 0) / elevated.length;
      const severity = Math.min(1, avgElevation / 40);
      return {
        anomalyType: 'jamming',
        severity,
        affectedBandMHz: [freqs[0]!, freqs[freqs.length - 1]!],
      };
    }
    return null;
  }
}
