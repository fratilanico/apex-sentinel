// APEX-SENTINEL — W10 StageClassifier
// FR-W10-02 | src/nato/stage-classifier.ts

// ── Types ────────────────────────────────────────────────────────────────────

export type Stage = 1 | 2 | 3;

export interface DetectionInput {
  acousticConfidence: number;    // 0.0 – 1.0
  rfFingerprintMatch: boolean;
  adsbCorrelated: boolean;
  remoteIdWithin500m: boolean;
}

export interface StageResult {
  stage: Stage | null;           // null = below threshold
  confidence: number;
  evidence: string[];
}

// ── StageClassifier ──────────────────────────────────────────────────────────

const ACOUSTIC_THRESHOLD = 0.75;

export class StageClassifier {
  /**
   * Classifies a detection into Stage 1, 2, or 3 using NATO rule-based logic.
   *
   * Stage 1: acoustic ≥ 0.75, no RF correlation
   * Stage 2: acoustic ≥ 0.75 AND RF fingerprint match
   * Stage 3: Stage 2 AND (ADS-B correlated OR RemoteID within 500m)
   */
  classify(detection: DetectionInput): StageResult {
    const { acousticConfidence, rfFingerprintMatch, adsbCorrelated, remoteIdWithin500m } = detection;

    if (acousticConfidence < ACOUSTIC_THRESHOLD) {
      return { stage: null, confidence: acousticConfidence, evidence: [] };
    }

    const evidence: string[] = [`acoustic: ${acousticConfidence.toFixed(2)}`];

    // Stage 2 check
    if (rfFingerprintMatch) {
      evidence.push('rf: fingerprint match');

      // Stage 3 check
      if (adsbCorrelated) {
        evidence.push('ads-b: correlated');
        return {
          stage: 3,
          confidence: Math.min(1.0, acousticConfidence * 1.1),
          evidence,
        };
      }
      if (remoteIdWithin500m) {
        evidence.push('remote-id: within 500m');
        return {
          stage: 3,
          confidence: Math.min(1.0, acousticConfidence * 1.05),
          evidence,
        };
      }

      return { stage: 2, confidence: acousticConfidence, evidence };
    }

    // Stage 1
    return { stage: 1, confidence: acousticConfidence, evidence };
  }
}
