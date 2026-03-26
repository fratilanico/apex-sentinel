// APEX-SENTINEL — W8 Simpson's Paradox Consistency Oracle
// FR-W8-02 | src/ml/consistency-oracle-w8.ts
//
// Prevents aggregate recall masking per-class failure (Simpson's Paradox).
// IEC 61508 / "Defending Airspace" EUDIS requirement: every class must pass independently.

export interface ClassMetrics {
  profile: string;
  recall: number;
  sampleCount: number;
}

export interface ConsistencyResult {
  passed: boolean;
  paradoxDetected: boolean;
  weightedMacroRecall: number;
  unweightedMacroRecall: number;
  gap: number;
  failingClass: string | null;
  perClassMetrics: ClassMetrics[];
  report: string;
}

export class ConsistencyOracle {
  private readonly PARADOX_GAP_THRESHOLD = 0.05; // 5% max discrepancy between weighted and unweighted
  private readonly MIN_CLASS_RECALL = 0.85;       // floor: any class below this triggers paradox

  evaluate(classMetrics: ClassMetrics[]): ConsistencyResult {
    if (classMetrics.length === 0) {
      return {
        passed: false, paradoxDetected: false,
        weightedMacroRecall: 0, unweightedMacroRecall: 0, gap: 0,
        failingClass: null, perClassMetrics: [], report: 'No class metrics provided',
      };
    }

    const totalSamples = classMetrics.reduce((s, c) => s + c.sampleCount, 0);

    // Weighted macro recall (dominated by high-volume classes)
    const weightedMacroRecall = totalSamples > 0
      ? classMetrics.reduce((s, c) => s + c.recall * (c.sampleCount / totalSamples), 0)
      : 0;

    // Unweighted macro recall (each class equal weight)
    const unweightedMacroRecall =
      classMetrics.reduce((s, c) => s + c.recall, 0) / classMetrics.length;

    const gap = Math.abs(weightedMacroRecall - unweightedMacroRecall);

    // Find failing class: any class below MIN_CLASS_RECALL floor
    const failingClass = classMetrics.find(c => c.recall < this.MIN_CLASS_RECALL)?.profile ?? null;

    // Paradox detected: aggregate (weighted) looks healthy but a class is actually failing.
    // This captures the Simpson's Paradox scenario: high-volume classes mask rare-class failure.
    const paradoxDetected = (gap > this.PARADOX_GAP_THRESHOLD) ||
      (failingClass !== null && weightedMacroRecall > 0.90);

    const passed = !paradoxDetected && failingClass === null;

    const report = this.buildReport(classMetrics, weightedMacroRecall, unweightedMacroRecall, gap, paradoxDetected, failingClass);

    return {
      passed, paradoxDetected,
      weightedMacroRecall: +weightedMacroRecall.toFixed(4),
      unweightedMacroRecall: +unweightedMacroRecall.toFixed(4),
      gap: +gap.toFixed(4),
      failingClass, perClassMetrics: classMetrics, report,
    };
  }

  detectParadox(aggregateRecall: number, classMetrics: ClassMetrics[]): { detected: boolean; failingClass: string | null } {
    // Paradox: aggregate >90% but some class fails
    const failingClass = classMetrics.find(c => c.recall < 0.85)?.profile ?? null;
    const detected = aggregateRecall > 0.90 && failingClass !== null;
    return { detected, failingClass };
  }

  private buildReport(
    metrics: ClassMetrics[],
    weighted: number, unweighted: number, gap: number,
    paradoxDetected: boolean, failingClass: string | null
  ): string {
    const lines = [
      '┌─ Consistency Oracle Report ────────────────────────────────┐',
      `│ Weighted macro recall:   ${(weighted * 100).toFixed(1)}%`,
      `│ Unweighted macro recall: ${(unweighted * 100).toFixed(1)}%`,
      `│ Gap: ${(gap * 100).toFixed(2)}% (threshold: 5%)`,
      paradoxDetected ? `│ ⚠ PARADOX_DETECTED: ${failingClass} recall masked by aggregate` : '│ ✓ No paradox detected',
      '├──────────────────────────────────────────────────────────────┤',
      '│ Per-class recall:',
      ...metrics.map(c => `│   ${c.profile.padEnd(15)} recall=${(c.recall * 100).toFixed(1)}%  n=${c.sampleCount}`),
      '└──────────────────────────────────────────────────────────────┘',
    ];
    return lines.join('\n');
  }
}
