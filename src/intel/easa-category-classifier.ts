// APEX-SENTINEL — W19 EasaCategoryClassifier
// FR-W19-01 | src/intel/easa-category-classifier.ts

import type { EasaCategory, ClassificationResult, MlSignalBundle } from './types.js';

const ADSB_CATEGORY_MAP: Record<string, EasaCategory> = {
  A1: 'cat-a-commercial',
  A2: 'cat-a-commercial',
  A3: 'cat-a-commercial',
  A4: 'cat-a-commercial',
  B1: 'cat-b-modified',
  B2: 'cat-b-modified',
  C1: 'cat-c-surveillance',
  C2: 'cat-c-surveillance',
  C3: 'cat-c-surveillance',
};

const EMERGENCY_SQUAWKS = new Set(['7700', '7600', '7500']);

export class EasaCategoryClassifier {
  classify(
    aircraft: Record<string, unknown>,
    mlSignals?: MlSignalBundle
  ): ClassificationResult {
    try {
      if (!aircraft) {
        return {
          category: 'cat-d-unknown',
          confidence: 0.90,
          classificationBasis: 'transponder-absent',
        };
      }

      const cooperative = aircraft.cooperativeContact === true;
      const category = typeof aircraft.category === 'string' && aircraft.category.trim() !== ''
        ? aircraft.category.trim()
        : null;
      const squawk = typeof aircraft.squawk === 'string' && aircraft.squawk.trim() !== ''
        ? aircraft.squawk.trim()
        : null;
      const altBaro = typeof aircraft.altBaro === 'number' ? aircraft.altBaro : null;
      const velocityMs = typeof aircraft.velocityMs === 'number' ? aircraft.velocityMs : null;

      const isEmergencySquawk = squawk !== null && EMERGENCY_SQUAWKS.has(squawk);

      // 1. ML signal path: check first for non-cooperative with high acoustic confidence
      if (
        !cooperative &&
        mlSignals &&
        typeof mlSignals.acousticDroneConfidence === 'number' &&
        mlSignals.acousticDroneConfidence >= 0.8
      ) {
        return {
          category: 'cat-d-unknown',
          confidence: Math.max(0.90, mlSignals.acousticDroneConfidence),
          classificationBasis: 'ml-signal-informed',
          ...(isEmergencySquawk ? { emergencySquawk: true } : {}),
        };
      }

      // 2. Cooperative contact OR squawk present → ADS-B category map path
      if (cooperative || squawk !== null) {
        if (category !== null && ADSB_CATEGORY_MAP[category] !== undefined) {
          const mapped = ADSB_CATEGORY_MAP[category];
          return {
            category: mapped,
            confidence: 0.95,
            classificationBasis: 'adsb-category-map',
            ...(isEmergencySquawk ? { emergencySquawk: true } : {}),
          };
        }
        // Cooperative but no mappable category — default to commercial via heuristic
        return {
          category: 'cat-a-commercial',
          confidence: 0.85,
          classificationBasis: 'heuristic-velocity',
          ...(isEmergencySquawk ? { emergencySquawk: true } : {}),
        };
      }

      // 3. Non-cooperative: check heuristic velocity/altitude
      if (
        altBaro !== null && !isNaN(altBaro) && altBaro <= 150 &&
        velocityMs !== null && !isNaN(velocityMs) && velocityMs <= 15
      ) {
        return {
          category: 'cat-a-commercial',
          confidence: 0.75,
          classificationBasis: 'heuristic-velocity',
        };
      }

      // 4. Fallback: transponder absent
      return {
        category: 'cat-d-unknown',
        confidence: 0.90,
        classificationBasis: 'transponder-absent',
        ...(isEmergencySquawk ? { emergencySquawk: true } : {}),
      };
    } catch {
      return {
        category: 'cat-d-unknown',
        confidence: 0.90,
        classificationBasis: 'transponder-absent',
      };
    }
  }
}
