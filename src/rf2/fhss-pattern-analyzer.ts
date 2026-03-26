// APEX-SENTINEL — FR-W12-01: FHSS Pattern Analyzer
// src/rf2/fhss-pattern-analyzer.ts
//
// Detects FHSS frequency hopping patterns for ELRS 900, DJI OcuSync 2.4G,
// and TBS Crossfire from raw frequency/time/RSSI samples.

export interface FrequencySample {
  frequencyMHz: number;
  ts: number;   // milliseconds
  rssi: number; // dBm
}

export interface FhssResult {
  protocol: string;
  hopInterval_ms: number;
  bandMHz: [number, number];
  confidence: number;
}

interface ProtocolTemplate {
  name: string;
  bandMin: number;
  bandMax: number;
  hopInterval_ms: number;
  hopTolerance_ms: number;
}

const PROTOCOL_TEMPLATES: ProtocolTemplate[] = [
  // TBS Crossfire must be checked BEFORE ELRS 900 because the band overlaps
  {
    name: 'crossfire',
    bandMin: 869.0,
    bandMax: 870.0,
    hopInterval_ms: 4,
    hopTolerance_ms: 1.5,
  },
  {
    name: 'elrs_900',
    bandMin: 863,
    bandMax: 928,
    hopInterval_ms: 1,
    hopTolerance_ms: 0.1,
  },
  {
    name: 'dji_ocusync_2g',
    bandMin: 2400,
    bandMax: 2483,
    hopInterval_ms: 10,
    hopTolerance_ms: 1,
  },
  {
    name: 'dji_ocusync_5g',
    bandMin: 5150,
    bandMax: 5850,
    hopInterval_ms: 10,
    hopTolerance_ms: 2,
  },
];

export class FhssPatternAnalyzer {
  analyze(samples: FrequencySample[]): FhssResult | null {
    if (samples.length < 3) return null;

    // Sort by timestamp
    const sorted = [...samples].sort((a, b) => a.ts - b.ts);

    const freqMin = Math.min(...sorted.map(s => s.frequencyMHz));
    const freqMax = Math.max(...sorted.map(s => s.frequencyMHz));
    const freqCenter = (freqMin + freqMax) / 2;

    // Compute median hop interval
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const dt = sorted[i]!.ts - sorted[i - 1]!.ts;
      if (dt > 0) intervals.push(dt);
    }
    if (intervals.length === 0) return null;
    const hopInterval = median(intervals);

    // Match against protocol templates
    for (const tmpl of PROTOCOL_TEMPLATES) {
      const inBand = freqCenter >= tmpl.bandMin && freqCenter <= tmpl.bandMax;
      const allInBand = sorted.every(
        s => s.frequencyMHz >= tmpl.bandMin && s.frequencyMHz <= tmpl.bandMax,
      );

      if (!inBand && !allInBand) continue;

      const hopMatch = Math.abs(hopInterval - tmpl.hopInterval_ms) <= tmpl.hopTolerance_ms;

      // Confidence: frequency match + hop interval match + RSSI stability
      const freqScore = allInBand ? 1.0 : (inBand ? 0.7 : 0);
      const hopScore = hopMatch ? 1.0 : Math.max(0, 1 - Math.abs(hopInterval - tmpl.hopInterval_ms) / tmpl.hopInterval_ms);
      const rssiStd = standardDeviation(sorted.map(s => s.rssi));
      const rssiScore = Math.max(0, 1 - rssiStd / 20);

      const confidence = 0.50 * freqScore + 0.35 * hopScore + 0.15 * rssiScore;

      if (confidence >= 0.50) {
        const observedMin = Math.min(...sorted.map(s => s.frequencyMHz));
        const observedMax = Math.max(...sorted.map(s => s.frequencyMHz));
        return {
          protocol: tmpl.name,
          hopInterval_ms: hopInterval,
          bandMHz: [
            Math.max(observedMin, tmpl.bandMin),
            Math.min(observedMax, tmpl.bandMax),
          ],
          confidence: Math.min(1, confidence),
        };
      }
    }

    return null;
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
