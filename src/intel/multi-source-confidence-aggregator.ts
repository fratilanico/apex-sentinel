// APEX-SENTINEL — W11 MultiSourceConfidenceAggregator
// FR-W11-06 | src/intel/multi-source-confidence-aggregator.ts

// ── Types ────────────────────────────────────────────────────────────────────

export interface SourceBelief {
  source: string;
  belief: number;       // m(hypothesis) — basic probability mass for threat
  plausibility: number; // upper bound: m(hypothesis) + m(unknown)
}

export interface CombinedBelief {
  combined: number | null;       // null = irreconcilable conflict
  plausibility: number | null;
  conflict: number;              // K: sum of mass products for conflicting events
}

// ── Constants ────────────────────────────────────────────────────────────────

const CONFLICT_THRESHOLD = 0.5;
const EPSILON = 1e-9;

// ── MultiSourceConfidenceAggregator ─────────────────────────────────────────

export class MultiSourceConfidenceAggregator {
  /**
   * Combines N independent source beliefs using simplified Dempster-Shafer.
   *
   * Each source has:
   *  m(threat) = belief
   *  m(no_threat) = 1 - plausibility   (upper bound on rejection)
   *  m(unknown) = plausibility - belief (uncommitted mass)
   *
   * Pairwise D-S combination rule applied left-to-right.
   * If K (conflict) > 0.5: irreconcilable → combined: null
   */
  combine(sources: SourceBelief[]): CombinedBelief {
    if (sources.length === 0) {
      return { combined: 0, plausibility: 0, conflict: 0 };
    }

    if (sources.length === 1) {
      return {
        combined: sources[0].belief,
        plausibility: sources[0].plausibility,
        conflict: 0,
      };
    }

    // Pairwise left-fold
    let current: CombinedBelief = {
      combined: sources[0].belief,
      plausibility: sources[0].plausibility,
      conflict: 0,
    };

    for (let i = 1; i < sources.length; i++) {
      if (current.combined === null) {
        // Already irreconcilable — propagate
        return current;
      }
      current = this._combine2(
        { belief: current.combined, plausibility: current.plausibility! },
        sources[i],
        current.conflict,
      );
    }

    return current;
  }

  private _combine2(
    a: { belief: number; plausibility: number },
    b: SourceBelief,
    prevConflict: number,
  ): CombinedBelief {
    // Mass functions:
    // m_a: {threat: a.belief, no_threat: 1-a.plausibility, unknown: a.plausibility-a.belief}
    // m_b: {threat: b.belief, no_threat: 1-b.plausibility, unknown: b.plausibility-b.belief}

    const mA_threat = a.belief;
    const mA_noThreat = Math.max(0, 1 - a.plausibility);
    const mA_unknown = Math.max(0, a.plausibility - a.belief);

    const mB_threat = b.belief;
    const mB_noThreat = Math.max(0, 1 - b.plausibility);
    const mB_unknown = Math.max(0, b.plausibility - b.belief);

    // Conflict: sum of products where focal elements are disjoint
    // threat ∩ no_threat = ∅  → conflict
    const K =
      mA_threat * mB_noThreat +
      mA_noThreat * mB_threat;

    const totalConflict = prevConflict + K * (1 - prevConflict); // accumulated

    if (K > CONFLICT_THRESHOLD) {
      return { combined: null, plausibility: null, conflict: K };
    }

    const normalizer = 1 - K;
    if (normalizer < EPSILON) {
      return { combined: null, plausibility: null, conflict: 1 };
    }

    // Combined belief for threat (all mass assignments that give {threat})
    const rawBelief =
      mA_threat * mB_threat +        // both say threat
      mA_threat * mB_unknown +        // a says threat, b uncommitted
      mA_unknown * mB_threat;         // a uncommitted, b says threat

    const combinedBelief = rawBelief / normalizer;

    // Combined plausibility (upper bound)
    const rawPlaus =
      rawBelief +
      mA_unknown * mB_unknown;        // both uncommitted → could be threat

    const combinedPlaus = rawPlaus / normalizer;

    return {
      combined: Math.min(1, Math.max(0, combinedBelief)),
      plausibility: Math.min(1, Math.max(0, combinedPlaus)),
      conflict: totalConflict,
    };
  }
}
