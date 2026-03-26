// APEX-SENTINEL — Acoustic Profile Library (W7: Gerbera, Shahed-131, Shahed-238)
// FR-W7-02 | src/ml/acoustic-profile-library.ts
// W8: IEC 61508 SIL-2 setActiveModel() safety gate added
//
// Catalog of drone acoustic signatures.
// W7 adds: Gerbera (piston 167-217Hz), Shahed-131 (piston 150-400Hz),
//          Shahed-238 (jet turbine 3000-8000Hz).
// INDIGO team confirmation + acoustic profile library source.

import { isValidHandle } from './model-handle-registry.js';
import type { ModelHandle } from './model-handle-registry.js';

export interface DroneAcousticProfile {
  id: string;
  droneType: string;
  frequencyRange: [number, number]; // Hz [min, max]
  peakFrequency: number;            // Hz
  rpmRange: [number, number];       // RPM [min, max]
  /** Broad signal category. 'turbine' covers both piston and jet. */
  signalType: 'piston' | 'electric' | 'turbine';
  /**
   * W7 addition: precise engine class.
   * 'piston' = reciprocating engine (Shahed-136, Shahed-131, Gerbera)
   * 'turbine' = jet engine (Shahed-238)
   * 'electric' = brushless motor (FPV, Lancet)
   */
  engineType?: 'piston' | 'turbine' | 'electric';
  detectionRangeKm: number;
  falsePositiveRisk: 'high' | 'medium' | 'low';
  countermeasureNotes: string;
}

export class SafetyGateViolationError extends Error {
  constructor(message = 'SAFETY_GATE_VIOLATION: setActiveModel requires a valid ModelHandle issued by promoteModel()') {
    super(message);
    this.name = 'SafetyGateViolationError';
    // Log violation for IEC 61508 audit trail
    console.error(`[SAFETY_GATE_BYPASSED] ${message}`, new Error('Violation stack trace'));
  }
}

export class DroneProfileNotFoundError extends Error {
  constructor(id: string) {
    super(`Drone profile not found: ${id}`);
    this.name = 'DroneProfileNotFoundError';
  }
}

const DEFAULT_PROFILES: DroneAcousticProfile[] = [
  // --- Existing W6 profiles ---
  {
    id: 'shahed-136',
    droneType: 'shahed-136',
    frequencyRange: [100, 400],
    peakFrequency: 200,
    rpmRange: [7000, 9000],
    signalType: 'piston',
    engineType: 'piston',
    detectionRangeKm: 3.5,
    falsePositiveRisk: 'high',
    countermeasureNotes:
      'CRITICAL: 50cc motorcycle acoustic signature is IDENTICAL. Discriminate via Doppler + temporal pattern + RF 900MHz cross-correlation. Require all 3 gates.',
  },
  {
    id: 'lancet-3',
    droneType: 'lancet-3',
    frequencyRange: [1000, 4000],
    peakFrequency: 2500,
    rpmRange: [12000, 20000],
    signalType: 'electric',
    engineType: 'electric',
    detectionRangeKm: 1.5,
    falsePositiveRisk: 'low',
    countermeasureNotes: 'Electric motor signature is distinctive. Low false positive risk.',
  },
  {
    id: 'orlan-10',
    droneType: 'orlan-10',
    frequencyRange: [400, 1200],
    peakFrequency: 700,
    rpmRange: [4000, 6000],
    signalType: 'turbine',
    engineType: 'piston',
    detectionRangeKm: 8.0,
    falsePositiveRisk: 'medium',
    countermeasureNotes: 'Reconnaissance drone. Turbine signature. Confusion with small aircraft possible.',
  },
  {
    id: 'mavic-mini',
    droneType: 'mavic-mini',
    frequencyRange: [800, 3000],
    peakFrequency: 1800,
    rpmRange: [8000, 15000],
    signalType: 'electric',
    engineType: 'electric',
    detectionRangeKm: 0.5,
    falsePositiveRisk: 'medium',
    countermeasureNotes: 'Consumer FPV drone. Confusion with other multi-rotor electric drones.',
  },

  // --- W7 new profiles (INDIGO team confirmed) ---

  /**
   * Gerbera — piston kamikaze drone, larger displacement than Shahed-136.
   * Fundamental ~190Hz, band 167-217Hz. Prop-wash AM modulation ~4Hz.
   * INDIGO confirmed: operates at ~175-200RPM cruise.
   */
  {
    id: 'gerbera',
    droneType: 'gerbera',
    frequencyRange: [167, 217],
    peakFrequency: 190,
    rpmRange: [10500, 13000],
    signalType: 'piston',
    engineType: 'piston',
    detectionRangeKm: 4.0,
    falsePositiveRisk: 'medium',
    countermeasureNotes:
      'Piston ~190Hz. Narrow band 167-217Hz reduces motorcycle confusion vs Shahed-136. ' +
      'Cross-check RF: uses same ELRS 900MHz link in terminal phase. GPS 1575MHz jamming effective.',
  },

  /**
   * Shahed-131 — lighter piston variant, higher RPM than Shahed-136.
   * Fundamental ~130-150Hz, band 150-400Hz. 3-blade prop with ~7Hz wash.
   * INDIGO confirmed: lighter airframe, more agile terminal dive.
   */
  {
    id: 'shahed-131',
    droneType: 'shahed-131',
    frequencyRange: [150, 400],
    peakFrequency: 155,
    rpmRange: [9000, 12000],
    signalType: 'piston',
    engineType: 'piston',
    detectionRangeKm: 3.0,
    falsePositiveRisk: 'high',
    countermeasureNotes:
      'Lighter Shahed variant. Similar piston band to Shahed-136 but higher RPM range. ' +
      'Motorcycle confusion risk identical — require Doppler + RF gates. ' +
      'Terminal phase: faster descent rate than Shahed-136.',
  },

  /**
   * Shahed-238 — jet turbine variant (Geran-3 equivalent).
   * COMPLETELY DIFFERENT from piston class — turbine engine, BPF 3000-8000Hz.
   * Near-continuous broadband tone. No prop-wash AM. Rapid harmonic decay.
   * INDIGO confirmed: separate ML model required — cannot share piston classifier.
   * Recall gate: ≥0.97 (highest priority — faster, harder to intercept).
   */
  {
    id: 'shahed-238',
    droneType: 'shahed-238',
    frequencyRange: [3000, 8000],
    peakFrequency: 5000,
    rpmRange: [40000, 80000],
    signalType: 'turbine',
    engineType: 'turbine',
    detectionRangeKm: 8.0,
    falsePositiveRisk: 'low',
    countermeasureNotes:
      'JET TURBINE — requires separate model from piston class. ' +
      'BPF sub-harmonic dominant in 3000-8000Hz band. ' +
      'Rapid speed (500-800 km/h cruise) — terminal phase detection window is <30s. ' +
      'RF link silent during entire approach (pre-programmed). GPS 1575MHz jamming: UNKNOWN effectiveness. ' +
      'Recall gate: ≥0.97 (FNR ≤ 0.03). Simpson Paradox risk: aggregate accuracy hides shahed-238 recall=0%.',
  },
];

export class AcousticProfileLibrary {
  private readonly profiles = new Map<string, DroneAcousticProfile>();

  constructor() {
    for (const p of DEFAULT_PROFILES) {
      this.profiles.set(p.droneType, p);
    }
  }

  getProfile(droneType: string): DroneAcousticProfile {
    const profile = this.profiles.get(droneType);
    if (!profile) throw new DroneProfileNotFoundError(droneType);
    return profile;
  }

  getAllProfiles(): DroneAcousticProfile[] {
    return Array.from(this.profiles.values());
  }

  matchFrequency(freqMin: number, freqMax: number): DroneAcousticProfile | null {
    let bestProfile: DroneAcousticProfile | null = null;
    let bestScore = 0;

    for (const profile of this.profiles.values()) {
      const [pMin, pMax] = profile.frequencyRange;
      // Intersection of query and profile ranges
      const intersectMin = Math.max(freqMin, pMin);
      const intersectMax = Math.min(freqMax, pMax);
      const intersection = Math.max(0, intersectMax - intersectMin);
      if (intersection === 0) continue;
      // Union of query and profile ranges
      const unionMin = Math.min(freqMin, pMin);
      const unionMax = Math.max(freqMax, pMax);
      const union = Math.max(1, unionMax - unionMin);
      // Jaccard similarity — prefers tightest matching profile
      const score = intersection / union;
      if (score > bestScore) {
        bestScore = score;
        bestProfile = profile;
      }
    }

    return bestProfile;
  }

  addProfile(profile: DroneAcousticProfile): void {
    this.profiles.set(profile.droneType, profile);
  }

  removeProfile(droneTypeOrId: string): void {
    if (!this.profiles.has(droneTypeOrId)) {
      throw new DroneProfileNotFoundError(droneTypeOrId);
    }
    this.profiles.delete(droneTypeOrId);
  }

  // ── W8: IEC 61508 SIL-2 Model Promotion Gate ─────────────────────────────
  // setActiveModel() ONLY accepts handles issued by YAMNetFineTuner.promoteModel().
  // Direct weight mutation without a registered handle throws SafetyGateViolationError.

  setActiveModel(handle: unknown): void {
    if (!isValidHandle(handle)) {
      throw new SafetyGateViolationError();
    }
    // In current architecture, AcousticProfileLibrary uses frequency-range matching
    // (no weight vector). The handle is validated and stored for audit purposes.
    // When YAMNet inference weights are integrated, they will be sourced from handle.metrics.
    this._activeModelHandle = handle as ModelHandle;
  }

  getActiveModelHandle(): ModelHandle | null {
    return this._activeModelHandle;
  }

  private _activeModelHandle: ModelHandle | null = null;
}
