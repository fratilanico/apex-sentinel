// APEX-SENTINEL — W6 Acoustic Profile Library
// FR-W6-01 | src/ml/acoustic-profile-library.ts
//
// Catalog of drone acoustic signatures.
// Supports profile lookup, frequency matching, and false positive risk assessment.

export interface DroneAcousticProfile {
  id: string;
  droneType: string;
  frequencyRange: [number, number]; // Hz [min, max]
  peakFrequency: number;            // Hz
  rpmRange: [number, number];       // RPM [min, max]
  signalType: 'piston' | 'electric' | 'turbine';
  detectionRangeKm: number;
  falsePositiveRisk: 'high' | 'medium' | 'low';
  countermeasureNotes: string;
}

export class DroneProfileNotFoundError extends Error {
  constructor(id: string) {
    super(`Drone profile not found: ${id}`);
    this.name = 'DroneProfileNotFoundError';
  }
}

const DEFAULT_PROFILES: DroneAcousticProfile[] = [
  {
    id: 'shahed-136',
    droneType: 'shahed-136',
    frequencyRange: [100, 400],
    peakFrequency: 200,
    rpmRange: [7000, 9000],
    signalType: 'piston',
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
    detectionRangeKm: 0.5,
    falsePositiveRisk: 'medium',
    countermeasureNotes: 'Consumer FPV drone. Confusion with other multi-rotor electric drones.',
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
    let bestOverlap = 0;

    for (const profile of this.profiles.values()) {
      const [pMin, pMax] = profile.frequencyRange;
      // Overlap = intersection of [freqMin,freqMax] and [pMin,pMax]
      const overlapMin = Math.max(freqMin, pMin);
      const overlapMax = Math.min(freqMax, pMax);
      const overlap = Math.max(0, overlapMax - overlapMin);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
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
}
