// APEX-SENTINEL — Label Auditor Tests (TDD RED)
// FR-W7-15 | tests/ml/FR-W7-15-label-audit.test.ts
//
// P0 blocker: Wild Hornets dataset (3000+ recordings) may contain ~3.4% label errors
// (Northcutt et al. 2021). On a 200-sample shahed-238 holdout = 7 mislabeled samples
// = ±3.5% variance on the 97% recall gate — enough to flip acceptance.
// These tests must pass before any external dataset is used for fine-tuning.

import { describe, it, expect } from 'vitest';
import {
  LabelAuditor,
  UnknownLabelError,
  ALLOWED_LABELS,
  LABEL_FREQUENCY_BANDS,
  BACKGROUND_CENTROID_TURBINE_THRESHOLD_HZ,
} from '../../src/ml/label-auditor.js';
import type { LabeledSample } from '../../src/ml/label-auditor.js';

// --- helpers ---

const makeSample = (
  id: string,
  label: string,
  peakFrequencyHz: number,
  spectralCentroidHz: number
): LabeledSample => ({ id, label, peakFrequencyHz, spectralCentroidHz });

describe('FR-W7-15: LabelAuditor — Wild Hornets Dataset Label Integrity', () => {
  let auditor: LabelAuditor;

  beforeEach(() => {
    auditor = new LabelAuditor();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // §1 — ALLOWED_LABELS constant
  // ────────────────────────────────────────────────────────────────────────────

  describe('FR-W7-15-01: Allowed labels constant', () => {
    it('ALLOWED_LABELS includes all W7 required profiles', () => {
      const required = [
        'shahed-238', 'shahed-136', 'shahed-131', 'gerbera', 'fpv-quad', 'background',
      ];
      for (const label of required) {
        expect(ALLOWED_LABELS).toContain(label);
      }
    });

    it('ALLOWED_LABELS does NOT include unknown strings', () => {
      expect(ALLOWED_LABELS).not.toContain('helicopter');
      expect(ALLOWED_LABELS).not.toContain('bird');
      expect(ALLOWED_LABELS).not.toContain('');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // §2 — LABEL_FREQUENCY_BANDS contract
  // ────────────────────────────────────────────────────────────────────────────

  describe('FR-W7-15-02: Frequency band definitions', () => {
    it('shahed-238 turbine band is 3000–8000 Hz (not piston range)', () => {
      const [min, max] = LABEL_FREQUENCY_BANDS['shahed-238'];
      expect(min).toBeGreaterThanOrEqual(3000);
      expect(max).toBeLessThanOrEqual(8000);
    });

    it('piston profiles (shahed-136, shahed-131, gerbera) are all below 500 Hz', () => {
      for (const label of ['shahed-136', 'shahed-131', 'gerbera'] as const) {
        const [min, max] = LABEL_FREQUENCY_BANDS[label];
        expect(min).toBeLessThan(500);
        expect(max).toBeLessThan(500);
      }
    });

    it('shahed-238 and piston bands do NOT overlap', () => {
      const [turbineMin] = LABEL_FREQUENCY_BANDS['shahed-238'];
      const [, pistonMax136] = LABEL_FREQUENCY_BANDS['shahed-136'];
      const [, pistonMax131] = LABEL_FREQUENCY_BANDS['shahed-131'];
      const [, pistonMaxGerbera] = LABEL_FREQUENCY_BANDS['gerbera'];
      expect(turbineMin).toBeGreaterThan(pistonMax136);
      expect(turbineMin).toBeGreaterThan(pistonMax131);
      expect(turbineMin).toBeGreaterThan(pistonMaxGerbera);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // §3 — validateLabelConsistency: clean batches
  // ────────────────────────────────────────────────────────────────────────────

  describe('FR-W7-15-03: Clean batch passes with zero violations', () => {
    it('5 valid samples (correct labels + correct peak frequencies) produce zero violations', () => {
      const samples: LabeledSample[] = [
        makeSample('s1', 'shahed-136', 200, 250),
        makeSample('s2', 'shahed-238', 5000, 4800),
        makeSample('s3', 'gerbera', 190, 220),
        makeSample('s4', 'fpv-quad', 2000, 1800),
        makeSample('s5', 'background', 150, 180),
      ];

      const report = auditor.validateLabelConsistency(samples);

      expect(report.totalSamples).toBe(5);
      expect(report.violationCount).toBe(0);
      expect(report.violations).toHaveLength(0);
      expect(report.estimatedErrorRate).toBe(0);
      expect(report.exceedsNorthcuttBaseline).toBe(false);
      expect(report.cleanSampleIds).toHaveLength(5);
    });

    it('empty batch produces zero violations and zero error rate', () => {
      const report = auditor.validateLabelConsistency([]);
      expect(report.totalSamples).toBe(0);
      expect(report.violationCount).toBe(0);
      expect(report.estimatedErrorRate).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // §4 — Check 1: Unknown label detection
  // ────────────────────────────────────────────────────────────────────────────

  describe('FR-W7-15-04: Unknown label detection (batch label format integrity)', () => {
    it('sample with unknown label "helicopter" is flagged with violationType unknown_label', () => {
      const samples: LabeledSample[] = [
        makeSample('clean-1', 'shahed-136', 200, 250),
        makeSample('bad-1', 'helicopter', 200, 250),   // unknown
        makeSample('clean-2', 'gerbera', 190, 220),
      ];

      const report = auditor.validateLabelConsistency(samples);

      expect(report.violationCount).toBe(1);
      expect(report.violations[0].sampleId).toBe('bad-1');
      expect(report.violations[0].violationType).toBe('unknown_label');
      expect(report.cleanSampleIds).toContain('clean-1');
      expect(report.cleanSampleIds).toContain('clean-2');
      expect(report.cleanSampleIds).not.toContain('bad-1');
    });

    it('3 unknown labels out of 20 samples produces exceedsNorthcuttBaseline=false (below 3.4%)', () => {
      // 3/20 = 15% > 3.4% — should exceed
      const samples: LabeledSample[] = [
        ...Array.from({ length: 17 }, (_, i) => makeSample(`s${i}`, 'shahed-136', 200, 250)),
        makeSample('bad-1', 'helicopter', 200, 250),
        makeSample('bad-2', 'bird', 200, 250),
        makeSample('bad-3', 'unknown_type', 200, 250),
      ];

      const report = auditor.validateLabelConsistency(samples);

      expect(report.violationCount).toBe(3);
      expect(report.estimatedErrorRate).toBeCloseTo(0.15);
      expect(report.exceedsNorthcuttBaseline).toBe(true);
    });

    it('1 unknown label out of 50 samples: exceedsNorthcuttBaseline=false (2% < 3.4%)', () => {
      const samples: LabeledSample[] = [
        ...Array.from({ length: 49 }, (_, i) => makeSample(`s${i}`, 'shahed-136', 200, 250)),
        makeSample('bad', 'helicopter', 200, 250),
      ];

      const report = auditor.validateLabelConsistency(samples);
      expect(report.estimatedErrorRate).toBeCloseTo(0.02);
      expect(report.exceedsNorthcuttBaseline).toBe(false);
    });

    it('empty string label is flagged as unknown', () => {
      const samples = [makeSample('bad', '', 200, 250)];
      const report = auditor.validateLabelConsistency(samples);
      expect(report.violations[0].violationType).toBe('unknown_label');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // §5 — Check 2: Frequency band mismatch
  // ────────────────────────────────────────────────────────────────────────────

  describe('FR-W7-15-05: Frequency band label consistency (FFT-based)', () => {
    it('shahed-238 sample with 150Hz peak (piston range) is flagged as frequency_band_mismatch', () => {
      const samples = [
        makeSample('turbine-wrong', 'shahed-238', 150, 200), // piston freq, turbine label
      ];

      const report = auditor.validateLabelConsistency(samples);

      expect(report.violations).toHaveLength(1);
      expect(report.violations[0].violationType).toBe('frequency_band_mismatch');
      expect(report.violations[0].sampleId).toBe('turbine-wrong');
    });

    it('shahed-136 sample with 5000Hz peak (turbine range) is flagged as frequency_band_mismatch', () => {
      const samples = [
        makeSample('piston-wrong', 'shahed-136', 5000, 4500), // turbine freq, piston label
      ];

      const report = auditor.validateLabelConsistency(samples);

      expect(report.violations[0].violationType).toBe('frequency_band_mismatch');
    });

    it('5 synthetic samples with 1 frequency mismatch: only the mismatch is flagged', () => {
      const samples: LabeledSample[] = [
        makeSample('s1', 'shahed-136', 200, 250),
        makeSample('s2', 'shahed-238', 5000, 4800),
        makeSample('s3', 'shahed-238', 150, 200),   // ← mislabeled: piston peak on turbine label
        makeSample('s4', 'gerbera', 190, 220),
        makeSample('s5', 'background', 150, 180),
      ];

      const report = auditor.validateLabelConsistency(samples);

      expect(report.violationCount).toBe(1);
      expect(report.violations[0].sampleId).toBe('s3');
      expect(report.cleanSampleIds).toHaveLength(4);
    });

    it('shahed-136 at 200Hz (within [100, 400] band) is clean', () => {
      const samples = [makeSample('ok', 'shahed-136', 200, 250)];
      const report = auditor.validateLabelConsistency(samples);
      expect(report.violationCount).toBe(0);
    });

    it('gerbera at 190Hz (within [100, 300] band) is clean', () => {
      const samples = [makeSample('ok', 'gerbera', 190, 220)];
      const report = auditor.validateLabelConsistency(samples);
      expect(report.violationCount).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // §6 — Check 3: Background turbine bleed detection
  // ────────────────────────────────────────────────────────────────────────────

  describe('FR-W7-15-06: Background class turbine bleed detection', () => {
    it('background sample with spectral centroid 3500Hz is flagged as background_turbine_bleed', () => {
      const samples = [
        makeSample('bg-bleed', 'background', 150, 3500), // centroid in turbine band
      ];

      const report = auditor.validateLabelConsistency(samples);

      expect(report.violations).toHaveLength(1);
      expect(report.violations[0].violationType).toBe('background_turbine_bleed');
      expect(report.violations[0].sampleId).toBe('bg-bleed');
    });

    it('background sample with centroid 180Hz (urban noise floor) is clean', () => {
      const samples = [makeSample('bg-clean', 'background', 100, 180)];
      const report = auditor.validateLabelConsistency(samples);
      expect(report.violationCount).toBe(0);
    });

    it('BACKGROUND_CENTROID_TURBINE_THRESHOLD_HZ is set to 2000Hz', () => {
      expect(BACKGROUND_CENTROID_TURBINE_THRESHOLD_HZ).toBe(2000);
    });

    it('centroid exactly at threshold is NOT flagged (strict >)', () => {
      const samples = [
        makeSample('at-threshold', 'background', 100, BACKGROUND_CENTROID_TURBINE_THRESHOLD_HZ),
      ];
      const report = auditor.validateLabelConsistency(samples);
      expect(report.violationCount).toBe(0);
    });

    it('centroid 1Hz above threshold IS flagged', () => {
      const samples = [
        makeSample('just-above', 'background', 100, BACKGROUND_CENTROID_TURBINE_THRESHOLD_HZ + 1),
      ];
      const report = auditor.validateLabelConsistency(samples);
      expect(report.violationCount).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // §7 — detectBackgroundOutliers standalone method
  // ────────────────────────────────────────────────────────────────────────────

  describe('FR-W7-15-07: detectBackgroundOutliers — standalone centroid audit', () => {
    it('10 background samples with 1 high-centroid outlier: returns 1 outlier', () => {
      const samples: LabeledSample[] = [
        ...Array.from({ length: 9 }, (_, i) =>
          makeSample(`bg-${i}`, 'background', 100, 150 + i * 10)
        ),
        makeSample('bg-outlier', 'background', 100, 5500), // turbine centroid
      ];

      const result = auditor.detectBackgroundOutliers(samples);

      expect(result.outlierCount).toBe(1);
      expect(result.outlierIds).toContain('bg-outlier');
    });

    it('all clean background samples: outlierCount is 0', () => {
      const samples: LabeledSample[] = Array.from({ length: 5 }, (_, i) =>
        makeSample(`bg-${i}`, 'background', 100, 200)
      );

      const result = auditor.detectBackgroundOutliers(samples);

      expect(result.outlierCount).toBe(0);
      expect(result.outlierIds).toHaveLength(0);
    });

    it('non-background samples mixed in are ignored by detectBackgroundOutliers', () => {
      const samples: LabeledSample[] = [
        makeSample('not-bg', 'shahed-136', 200, 5500), // high centroid but not background
        makeSample('bg-clean', 'background', 100, 200),
      ];

      // detectBackgroundOutliers only checks label === 'background'
      const result = auditor.detectBackgroundOutliers(samples);
      expect(result.outlierCount).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // §8 — assertValidLabels: strict ingestion boundary guard
  // ────────────────────────────────────────────────────────────────────────────

  describe('FR-W7-15-08: assertValidLabels — batch ingestion boundary guard', () => {
    it('throws UnknownLabelError on first unknown label encountered', () => {
      const samples: LabeledSample[] = [
        makeSample('s1', 'shahed-136', 200, 250),
        makeSample('s2', 'helicopter', 200, 250),  // ← throws here
        makeSample('s3', 'gerbera', 190, 220),
      ];

      expect(() => auditor.assertValidLabels(samples)).toThrow(UnknownLabelError);
      expect(() => auditor.assertValidLabels(samples)).toThrow(/helicopter/);
    });

    it('returns the sample array unchanged when all labels are valid', () => {
      const samples: LabeledSample[] = [
        makeSample('s1', 'shahed-136', 200, 250),
        makeSample('s2', 'shahed-238', 5000, 4800),
        makeSample('s3', 'background', 100, 180),
      ];

      const result = auditor.assertValidLabels(samples);
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('s1');
    });

    it('throws UnknownLabelError with both label and sampleId in message', () => {
      const samples = [makeSample('sample-007', 'orlan-10', 700, 600)];

      expect(() => auditor.assertValidLabels(samples)).toThrow(/orlan-10/);
      expect(() => auditor.assertValidLabels(samples)).toThrow(/sample-007/);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // §9 — Northcutt 2021 threshold calibration
  // ────────────────────────────────────────────────────────────────────────────

  describe('FR-W7-15-09: Northcutt 2021 error rate threshold', () => {
    it('3.4% error rate is exactly at threshold — exceedsNorthcuttBaseline is false (not strictly above)', () => {
      // 34 violations / 1000 samples = 3.4%
      const samples: LabeledSample[] = [
        ...Array.from({ length: 966 }, (_, i) => makeSample(`ok-${i}`, 'shahed-136', 200, 250)),
        ...Array.from({ length: 34 }, (_, i) => makeSample(`bad-${i}`, 'helicopter', 200, 250)),
      ];

      const report = auditor.validateLabelConsistency(samples);
      // 34/1000 = 0.034 — must NOT exceed (is equal to baseline, not above)
      expect(report.estimatedErrorRate).toBeCloseTo(0.034);
      expect(report.exceedsNorthcuttBaseline).toBe(false);
    });

    it('3.5% error rate exceeds Northcutt baseline', () => {
      const samples: LabeledSample[] = [
        ...Array.from({ length: 965 }, (_, i) => makeSample(`ok-${i}`, 'shahed-136', 200, 250)),
        ...Array.from({ length: 35 }, (_, i) => makeSample(`bad-${i}`, 'helicopter', 200, 250)),
      ];

      const report = auditor.validateLabelConsistency(samples);
      expect(report.exceedsNorthcuttBaseline).toBe(true);
    });
  });
});
