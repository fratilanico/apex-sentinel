// APEX-SENTINEL — W19 ThreatScoringEngine
// FR-W19-03 | src/intel/threat-scoring-engine.ts

import type { ThreatScore, ZoneBreach, EasaCategory } from './types.js';

type BreachType = 'INSIDE' | 'ENTERING' | 'APPROACHING';

interface SecurityEvent {
  id?: string;
  lat?: number;
  lon?: number;
  timestampMs?: number;
  distanceToNearestZoneKm?: number;
  affectedZoneId?: string | null;
}

interface Zone {
  id?: string;
  type?: 'airport' | 'nuclear' | 'military' | 'government' | string;
  lat?: number;
  lon?: number;
  radiusKm?: number;
}

interface PicContext {
  category?: EasaCategory;
  flyabilityScore?: number;
  zone?: Zone;
  securityEvents?: SecurityEvent[];
}

const CATEGORY_MULTIPLIER: Record<string, number> = {
  'cat-d-unknown': 1.2,
  'cat-c-surveillance': 1.1,
  'cat-b-modified': 1.0,
  'cat-a-commercial': 0.8,
};

const ZONE_TYPE_AMPLIFIER: Record<string, number> = {
  nuclear: 1.2,
  military: 1.1,
  airport: 1.0,
  government: 0.9,
};

export class ThreatScoringEngine {
  score(
    breach: ZoneBreach | ZoneBreach[],
    pic: PicContext
  ): ThreatScore | ThreatScore[] {
    if (Array.isArray(breach)) {
      return breach.map((b) => this._scoreSingle(b, pic));
    }
    return this._scoreSingle(breach, pic);
  }

  scoreBatch(breaches: ZoneBreach[], pic: PicContext): ThreatScore[] {
    return breaches.map((b) => this._scoreSingle(b, pic));
  }

  private _scoreSingle(breach: ZoneBreach, pic: PicContext): ThreatScore {
    try {
      const zone = pic.zone ?? { id: breach.zoneId, type: 'airport', radiusKm: 5 };
      const radiusKm = typeof zone.radiusKm === 'number' ? zone.radiusKm : 5;
      const radiusM = radiusKm * 1000;
      const zoneType = zone.type ?? 'airport';

      const distanceM = isNaN(breach.distanceM) || !isFinite(breach.distanceM)
        ? radiusM
        : breach.distanceM;

      // Proximity score: 100 * (1 - distanceM / radiusM), floored at 0
      let proximity: number;
      if (distanceM <= 0) {
        proximity = 100;
      } else {
        proximity = Math.max(0, 100 * (1 - distanceM / radiusM));
      }

      // Category multiplier
      const category = pic.category ?? 'cat-a-commercial';
      const catMult = CATEGORY_MULTIPLIER[category] ?? 1.0;

      // Flyability multiplier (score/100)
      const flyabilityScore = typeof pic.flyabilityScore === 'number' && !isNaN(pic.flyabilityScore)
        ? Math.max(0, Math.min(100, pic.flyabilityScore))
        : 75;
      const flyabilityMult = flyabilityScore / 100;

      // Security bonus: +15 if any SecurityEvent within 10km of zone
      let securityBonus = 0;
      if (pic.securityEvents && pic.securityEvents.length > 0) {
        const withinRange = pic.securityEvents.some(
          (ev) => typeof ev.distanceToNearestZoneKm === 'number' && ev.distanceToNearestZoneKm <= 10
        );
        if (withinRange) securityBonus = 15;
      }

      // Zone type amplifier
      const zoneAmp = ZONE_TYPE_AMPLIFIER[zoneType] ?? 1.0;

      // Formula: min(100, proximity * catMult * flyabilityMult * zoneAmp + securityBonus)
      const rawValue = proximity * catMult * flyabilityMult * zoneAmp + securityBonus;
      const value = Math.min(100, Math.max(0, rawValue));

      return {
        value: Math.round(value * 100) / 100, // keep precision
        components: {
          proximity,
          category: catMult,
          flyability: flyabilityMult,
          securityBonus,
        },
        zoneId: breach.zoneId,
        aircraftIcao24: breach.aircraftIcao24,
        scoredAt: new Date().toISOString(),
      };
    } catch {
      return {
        value: 0,
        components: { proximity: 0, category: 1.0, flyability: 0.75, securityBonus: 0 },
        zoneId: breach?.zoneId ?? 'UNKNOWN',
        aircraftIcao24: breach?.aircraftIcao24 ?? 'UNKNOWN',
        scoredAt: new Date().toISOString(),
      };
    }
  }
}
