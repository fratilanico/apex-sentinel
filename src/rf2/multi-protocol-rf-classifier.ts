// APEX-SENTINEL — FR-W12-02: Multi-Protocol RF Classifier
// src/rf2/multi-protocol-rf-classifier.ts
//
// Classifies detected RF signals into drone control protocols.
// Returns ranked list of protocol matches with confidence ≥ 0.60.

export interface FrequencySample {
  frequencyMHz: number;
  ts: number;
  rssi: number;
}

export interface ClassifierResult {
  protocol: string;
  confidence: number;
  evidence: string[];
}

interface ProtocolProfile {
  name: string;
  bandMin: number;
  bandMax: number;
  centerMHz: number;
  hopInterval_ms: number;
  hopTolerance_ms: number;
}

const PROTOCOL_PROFILES: ProtocolProfile[] = [
  { name: 'elrs_900',       bandMin: 863,    bandMax: 928,    centerMHz: 895,    hopInterval_ms: 1,   hopTolerance_ms: 0.15 },
  { name: 'elrs_2400',      bandMin: 2400,   bandMax: 2500,   centerMHz: 2450,   hopInterval_ms: 1,   hopTolerance_ms: 0.2  },
  { name: 'dji_ocusync_2g', bandMin: 2400,   bandMax: 2483,   centerMHz: 2437,   hopInterval_ms: 10,  hopTolerance_ms: 1    },
  { name: 'dji_ocusync_5g', bandMin: 5150,   bandMax: 5850,   centerMHz: 5500,   hopInterval_ms: 10,  hopTolerance_ms: 2    },
  { name: 'crossfire',      bandMin: 869,    bandMax: 870,    centerMHz: 869.5,  hopInterval_ms: 4,   hopTolerance_ms: 1.5  },
  { name: 'wifi_24',        bandMin: 2400,   bandMax: 2500,   centerMHz: 2437,   hopInterval_ms: 100, hopTolerance_ms: 50   },
  { name: 'bt_classic',     bandMin: 2400,   bandMax: 2483.5, centerMHz: 2441,   hopInterval_ms: 0.625, hopTolerance_ms: 0.3 },
  { name: 'unknown',        bandMin: 0,      bandMax: 99999,  centerMHz: 0,      hopInterval_ms: 0,   hopTolerance_ms: 9999 },
];

const CONFIDENCE_THRESHOLD = 0.60;

export class MultiProtocolRfClassifier {
  classify(samples: FrequencySample[]): ClassifierResult[] {
    if (samples.length < 2) return [];

    const sorted = [...samples].sort((a, b) => a.ts - b.ts);
    const freqMin = Math.min(...sorted.map(s => s.frequencyMHz));
    const freqMax = Math.max(...sorted.map(s => s.frequencyMHz));
    const freqCenter = (freqMin + freqMax) / 2;

    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const dt = sorted[i]!.ts - sorted[i - 1]!.ts;
      if (dt > 0) intervals.push(dt);
    }
    const hopInterval = intervals.length > 0 ? median(intervals) : 0;
    const rssiValues = sorted.map(s => s.rssi);
    const rssiStd = standardDeviation(rssiValues);

    const results: ClassifierResult[] = [];

    for (const profile of PROTOCOL_PROFILES) {
      if (profile.name === 'unknown') continue;

      const inBand = freqCenter >= profile.bandMin && freqCenter <= profile.bandMax;
      if (!inBand) continue;

      const evidence: string[] = [];

      // Frequency match score — use band containment as primary signal,
      // not distance from center (wide bands like 5G span 700 MHz)
      const allSamplesInBand = sorted.every(
        s => s.frequencyMHz >= profile.bandMin && s.frequencyMHz <= profile.bandMax,
      );
      const freqScore = allSamplesInBand ? 1.0 : (inBand ? 0.6 : 0);
      if (freqScore > 0.5) evidence.push(`freq_match:${freqCenter.toFixed(1)}MHz`);

      // Hop interval match score
      let hopScore = 0;
      if (intervals.length > 0 && profile.hopInterval_ms > 0) {
        const hopDelta = Math.abs(hopInterval - profile.hopInterval_ms);
        hopScore = hopDelta <= profile.hopTolerance_ms
          ? 1.0
          : Math.max(0, 1 - hopDelta / profile.hopInterval_ms);
        if (hopScore > 0.5) evidence.push(`hop_interval:${hopInterval.toFixed(2)}ms`);
      }

      // RSSI stability
      const rssiScore = Math.max(0, 1 - rssiStd / 20);
      if (rssiScore > 0.7) evidence.push(`rssi_stable:std=${rssiStd.toFixed(1)}dBm`);

      const confidence = 0.50 * freqScore + 0.35 * hopScore + 0.15 * rssiScore;

      if (confidence >= CONFIDENCE_THRESHOLD) {
        // Prefer crossfire over elrs_900 when in narrow crossfire band
        results.push({ protocol: profile.name, confidence: Math.min(1, confidence), evidence });
      }
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);

    // Deduplicate: if crossfire and elrs_900 both matched and crossfire has higher confidence,
    // remove elrs_900 (crossfire band is subset of elrs_900 band)
    return deduplicateResults(results);
  }

  getSupportedProtocols(): string[] {
    return PROTOCOL_PROFILES.map(p => p.name);
  }
}

function deduplicateResults(results: ClassifierResult[]): ClassifierResult[] {
  const seen = new Set<string>();
  const out: ClassifierResult[] = [];
  for (const r of results) {
    if (!seen.has(r.protocol)) {
      seen.add(r.protocol);
      out.push(r);
    }
  }
  return out;
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
