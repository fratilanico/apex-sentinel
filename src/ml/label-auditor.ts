// APEX-SENTINEL — Label Auditor
// FR-W7-15 | src/ml/label-auditor.ts
//
// Automated label error detection for incoming acoustic training datasets.
// Implements Northcutt 2021 mitigation: frequency-band consistency, spectral centroid
// outlier detection, and label format integrity checks.
//
// Rationale: 3.4% label error rate in popular ML benchmarks (Northcutt et al. 2021).
// On a 200-sample shahed-238 holdout: 7 mislabeled samples = ±3.5% variance on 97%
// recall gate — enough to flip acceptance. Must run before any Wild Hornets batch
// is used for fine-tuning or acceptance gating.

export const ALLOWED_LABELS = [
  'shahed-238',
  'shahed-136',
  'shahed-131',
  'gerbera',
  'fpv-quad',
  'background',
] as const;

export type AllowedLabel = (typeof ALLOWED_LABELS)[number];

// Expected dominant frequency band per label (Hz).
// Source: INDIGO team confirmation + acoustic profile library.
export const LABEL_FREQUENCY_BANDS: Record<AllowedLabel, [number, number]> = {
  'shahed-238':  [3000, 8000],   // jet turbine — BPF sub-harmonic
  'shahed-136':  [100,  400],    // piston ~200Hz fundamental
  'shahed-131':  [100,  400],    // piston ~130Hz, lighter variant
  'gerbera':     [100,  300],    // piston ~190Hz, larger displacement
  'fpv-quad':    [400,  4000],   // electric multi-rotor harmonics
  'background':  [0,    300],    // urban low-freq noise floor (soft bound, uses centroid)
};

// Background samples with spectral centroid above this Hz are flagged as potential
// cross-class bleed (e.g. unlabeled shahed-238 turbine audio in background class).
export const BACKGROUND_CENTROID_TURBINE_THRESHOLD_HZ = 2000;

export interface LabeledSample {
  id: string;
  label: string;          // raw string from dataset manifest
  /** Peak frequency in Hz extracted from FFT of the sample. */
  peakFrequencyHz: number;
  /** Spectral centroid in Hz. Used for background class outlier detection. */
  spectralCentroidHz: number;
}

export interface LabelViolation {
  sampleId: string;
  label: string;
  violationType:
    | 'unknown_label'
    | 'frequency_band_mismatch'
    | 'background_turbine_bleed';
  detail: string;
}

export interface LabelAuditReport {
  totalSamples: number;
  violationCount: number;
  violations: LabelViolation[];
  /** Estimated label error rate as a fraction [0, 1]. */
  estimatedErrorRate: number;
  /** True if the error rate exceeds the Northcutt 2021 benchmark baseline (3.4%). */
  exceedsNorthcuttBaseline: boolean;
  /** Samples that passed all checks. */
  cleanSampleIds: string[];
}

export class UnknownLabelError extends Error {
  constructor(label: string, sampleId: string) {
    super(`Unknown label "${label}" on sample "${sampleId}". Allowed: ${ALLOWED_LABELS.join(', ')}`);
    this.name = 'UnknownLabelError';
  }
}

export class LabelAuditor {
  /**
   * Validate label consistency across all samples in a dataset batch.
   *
   * Three checks per sample:
   * 1. Label string is in ALLOWED_LABELS.
   * 2. Peak frequency falls within the expected band for the label.
   * 3. Background samples with high spectral centroid are flagged as turbine bleed.
   *
   * Does NOT throw on violations — returns the full audit report so the caller
   * can decide whether to abort ingestion or quarantine flagged samples.
   */
  validateLabelConsistency(samples: LabeledSample[]): LabelAuditReport {
    const violations: LabelViolation[] = [];
    const cleanSampleIds: string[] = [];

    for (const sample of samples) {
      const sampleViolations: LabelViolation[] = [];

      // Check 1: label must be in allowed set
      if (!ALLOWED_LABELS.includes(sample.label as AllowedLabel)) {
        sampleViolations.push({
          sampleId: sample.id,
          label: sample.label,
          violationType: 'unknown_label',
          detail: `Label "${sample.label}" not in allowed set: [${ALLOWED_LABELS.join(', ')}]`,
        });
        // Skip frequency checks for unknown labels — band mapping doesn't exist
        violations.push(...sampleViolations);
        continue;
      }

      const allowedLabel = sample.label as AllowedLabel;
      const [bandMin, bandMax] = LABEL_FREQUENCY_BANDS[allowedLabel];

      // Check 2: peak frequency within expected band (skip for background — it's a soft bound)
      if (allowedLabel !== 'background') {
        if (sample.peakFrequencyHz < bandMin || sample.peakFrequencyHz > bandMax) {
          sampleViolations.push({
            sampleId: sample.id,
            label: sample.label,
            violationType: 'frequency_band_mismatch',
            detail:
              `Peak ${sample.peakFrequencyHz.toFixed(0)}Hz outside expected band ` +
              `[${bandMin}–${bandMax}Hz] for label "${allowedLabel}". ` +
              `Possible mislabel or engine variant outside known RPM range.`,
          });
        }
      }

      // Check 3: background turbine bleed
      if (
        allowedLabel === 'background' &&
        sample.spectralCentroidHz > BACKGROUND_CENTROID_TURBINE_THRESHOLD_HZ
      ) {
        sampleViolations.push({
          sampleId: sample.id,
          label: sample.label,
          violationType: 'background_turbine_bleed',
          detail:
            `Background sample has spectral centroid ${sample.spectralCentroidHz.toFixed(0)}Hz ` +
            `> ${BACKGROUND_CENTROID_TURBINE_THRESHOLD_HZ}Hz threshold. ` +
            `Possible unlabeled shahed-238 turbine audio in background class.`,
        });
      }

      if (sampleViolations.length > 0) {
        violations.push(...sampleViolations);
      } else {
        cleanSampleIds.push(sample.id);
      }
    }

    const estimatedErrorRate = samples.length > 0
      ? violations.length / samples.length
      : 0;

    return {
      totalSamples: samples.length,
      violationCount: violations.length,
      violations,
      estimatedErrorRate,
      exceedsNorthcuttBaseline: estimatedErrorRate > 0.034,
      cleanSampleIds,
    };
  }

  /**
   * Detect background samples with turbine-band spectral energy.
   * Subset of validateLabelConsistency — use when auditing background class only.
   *
   * @returns IDs of background samples suspected to contain turbine audio.
   */
  detectBackgroundOutliers(backgroundSamples: LabeledSample[]): {
    outlierIds: string[];
    outlierCount: number;
  } {
    const outlierIds = backgroundSamples
      .filter(
        s =>
          s.label === 'background' &&
          s.spectralCentroidHz > BACKGROUND_CENTROID_TURBINE_THRESHOLD_HZ
      )
      .map(s => s.id);

    return { outlierIds, outlierCount: outlierIds.length };
  }

  /**
   * Strict batch ingest guard: throws UnknownLabelError on the first unknown label.
   * Use at ingestion boundary (DatasetPipeline.ingestBatch) to enforce label contract
   * before any samples are written to the training corpus.
   *
   * Successfully-labeled samples are returned; unknown-labeled samples cause throw.
   */
  assertValidLabels(samples: LabeledSample[]): LabeledSample[] {
    for (const sample of samples) {
      if (!ALLOWED_LABELS.includes(sample.label as AllowedLabel)) {
        throw new UnknownLabelError(sample.label, sample.id);
      }
    }
    return samples;
  }
}
