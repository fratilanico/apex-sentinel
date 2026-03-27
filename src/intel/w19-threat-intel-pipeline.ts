// APEX-SENTINEL — W19ThreatIntelPipeline
// FR-W19-08 | src/intel/w19-threat-intel-pipeline.ts
//
// Orchestrates: classify → detect breaches → score → AWNING → anonymise → AACR → ROMATSA

import { EasaCategoryClassifier } from './easa-category-classifier.js';
import { GdprTrackAnonymiser } from './gdpr-track-anonymiser.js';
import { AacrNotificationFormatter } from './aacr-notification-formatter.js';
import { RomatsaCoordinationInterface } from './romatsa-coordination-interface.js';
import type {
  AwningLevel,
  ZoneBreach,
  ThreatScore,
  AnonymisedTrack,
  AacrNotification,
  RomatsaCoordinationMessage,
  ThreatIntelPicture,
} from './types.js';

// ---------------------------------------------------------------------------
// Minimal internal stubs for FR01-03 components (used when not overridden)
// ---------------------------------------------------------------------------

interface AircraftState {
  icao24: string;
  callsign: string;
  lat: number;
  lon: number;
  altBaro?: number;
  altitudeM: number;
  velocityMs: number;
  headingDeg: number;
  onGround: boolean;
  timestampMs: number;
  source: string;
  cooperativeContact?: boolean;
  category?: string | null;
  squawk?: string | null;
  trackStartedAt?: number;
}

interface ZoneLike {
  id: string;
  name?: string;
  type?: string;
  lat: number;
  lon: number;
  radiusKm: number;
  icaoCode?: string;
  exclusionZones?: unknown[];
}

interface EuSituationalPicture {
  aircraft?: AircraftState[];
  zones?: ZoneLike[];
  conditions?: { flyabilityScore: number } | null;
  securityEvents?: unknown[];
  notams?: unknown[];
  feedHealth?: unknown[];
  generatedAt?: number;
}

interface BreachDetectorLike {
  detectBreaches(aircraft: AircraftState[], zones: ZoneLike[]): ZoneBreach[];
}

interface ScoringEngineLike {
  score?(breach: ZoneBreach, picture: unknown): ThreatScore;
  scoreBatch?(breaches: ZoneBreach[], picture: unknown): ThreatScore[];
}

interface AwningAssignerLike {
  assign(zones: ZoneLike[], scores: ThreatScore[], previousLevels?: Record<string, AwningLevel>): Record<string, AwningLevel>;
}

interface AacrFormatterLike {
  format(breach: ZoneBreach, level: AwningLevel, zone: ZoneLike): AacrNotification[];
}

interface RomatsaLike {
  generate(breach: ZoneBreach, level: AwningLevel, zone: ZoneLike, aircraft?: AircraftState | null, notams?: unknown[]): RomatsaCoordinationMessage[];
}

interface GdprAnonymiserLike {
  anonymise(aircraft: AircraftState[]): AnonymisedTrack[];
}

// ---------------------------------------------------------------------------
// Distance helper (Haversine, metres)
// ---------------------------------------------------------------------------
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Default BreachDetector stub
// ---------------------------------------------------------------------------
class DefaultBreachDetector implements BreachDetectorLike {
  detectBreaches(aircraft: AircraftState[], zones: ZoneLike[]): ZoneBreach[] {
    const breaches: ZoneBreach[] = [];
    for (const a of aircraft) {
      for (const z of zones) {
        try {
          const distKm = haversineKm(a.lat, a.lon, z.lat, z.lon);
          if (distKm <= z.radiusKm) {
            breaches.push({
              zoneId: z.id,
              breachType: 'INSIDE',
              distanceM: distKm * 1000,
              ttBreachS: null,
              firstDetectedAt: new Date().toISOString(),
              aircraftIcao24: a.icao24,
              severity: distKm < z.radiusKm * 0.25 ? 'CRITICAL' : distKm < z.radiusKm * 0.5 ? 'HIGH' : 'MEDIUM',
            });
          }
        } catch {
          // skip
        }
      }
    }
    return breaches;
  }
}

// ---------------------------------------------------------------------------
// Default ThreatScoringEngine stub
// ---------------------------------------------------------------------------
class DefaultThreatScoringEngine implements ScoringEngineLike {
  score(breach: ZoneBreach, _picture: unknown): ThreatScore {
    const proximityScore = Math.max(0, 1 - breach.distanceM / 5000);
    return {
      value: proximityScore * 100,
      components: { proximity: proximityScore, category: 0.5, flyability: 0.5, securityBonus: 0 },
      zoneId: breach.zoneId,
      aircraftIcao24: breach.aircraftIcao24,
      scoredAt: new Date().toISOString(),
    };
  }

  scoreBatch(breaches: ZoneBreach[], picture: unknown): ThreatScore[] {
    return breaches.map((b) => this.score(b, picture));
  }
}

// ---------------------------------------------------------------------------
// Default AwningLevelAssigner stub
// ---------------------------------------------------------------------------
class DefaultAwningLevelAssigner implements AwningAssignerLike {
  assign(zones: ZoneLike[], scores: ThreatScore[], _previousLevels?: Record<string, AwningLevel>): Record<string, AwningLevel> {
    const levels: Record<string, AwningLevel> = {};
    for (const z of zones) {
      const zoneScores = scores.filter((s) => s.zoneId === z.id);
      const maxScore = zoneScores.reduce((m, s) => Math.max(m, s.value), 0);
      if (maxScore >= 80) levels[z.id] = 'RED';
      else if (maxScore >= 60) levels[z.id] = 'ORANGE';
      else if (maxScore >= 40) levels[z.id] = 'YELLOW';
      else if (maxScore >= 20) levels[z.id] = 'GREEN';
      else levels[z.id] = 'CLEAR';
    }
    return levels;
  }
}

// ---------------------------------------------------------------------------
// Pipeline constructor options / overrides
// ---------------------------------------------------------------------------
interface PipelineOverrides {
  breachDetector?: Partial<BreachDetectorLike>;
  threatScoringEngine?: Partial<ScoringEngineLike>;
  awningLevelAssigner?: Partial<AwningAssignerLike>;
  aacrNotificationFormatter?: Partial<AacrFormatterLike>;
  romatsaCoordinationInterface?: Partial<RomatsaLike>;
  gdprTrackAnonymiser?: Partial<GdprAnonymiserLike>;
}

interface PipelineOptions {
  nats?: { publish: (subject: string, data: unknown) => void } | null;
  deploySecret?: string;
  overrides?: PipelineOverrides;
}

// ---------------------------------------------------------------------------
// W19ThreatIntelPipeline
// ---------------------------------------------------------------------------
export class W19ThreatIntelPipeline {
  private nats: { publish: (subject: string, data: unknown) => void } | null;
  private deploySecret: string;
  private overrides: PipelineOverrides;

  // Stateful AWNING level tracking (for change detection)
  private previousAwningLevels: Record<string, AwningLevel> = {};

  constructor(opts: PipelineOptions) {
    this.nats = opts?.nats ?? null;
    this.deploySecret = opts?.deploySecret ?? '';
    this.overrides = opts?.overrides ?? {};
  }

  async process(picture: EuSituationalPicture | null | undefined): Promise<ThreatIntelPicture> {
    const startMs = Date.now();
    const safeNow = new Date();

    // Defaults for missing/null picture
    const safePicture = picture ?? ({} as EuSituationalPicture);
    const aircraft: AircraftState[] = safePicture.aircraft ?? [];
    const zones: ZoneLike[] = safePicture.zones ?? [];
    const conditions = safePicture.conditions ?? null;
    const notams: unknown[] = safePicture.notams ?? [];

    let breaches: ZoneBreach[] = [];
    let threatScores: ThreatScore[] = [];
    let awningLevels: Record<string, AwningLevel> = {};
    let anonymisedTracks: AnonymisedTrack[] = [];
    let aacrNotifications: AacrNotification[] = [];
    let coordinationMessages: RomatsaCoordinationMessage[] = [];
    let degradedMode = false;

    // Step 1: Classify aircraft (used downstream for anonymisation)
    const classifier = new EasaCategoryClassifier();
    const classifiedAircraft: Array<AircraftState & { _easaCategory?: string }> = aircraft.map((a) => {
      try {
        const cr = classifier.classify(a as Record<string, unknown>);
        return { ...a, category: cr.category };
      } catch {
        return a;
      }
    });

    // Step 2: Detect breaches
    try {
      const detector = (this.overrides.breachDetector as BreachDetectorLike | undefined) ?? new DefaultBreachDetector();
      breaches = detector.detectBreaches(classifiedAircraft, zones);
    } catch {
      degradedMode = true;
      breaches = [];
    }

    // Step 3: Score threats
    try {
      const scorer = (this.overrides.threatScoringEngine as ScoringEngineLike | undefined) ?? new DefaultThreatScoringEngine();
      if (scorer.scoreBatch) {
        threatScores = scorer.scoreBatch(breaches, { aircraft: classifiedAircraft, zones, conditions });
      } else if (scorer.score) {
        threatScores = breaches.map((b) => scorer.score!(b, { aircraft: classifiedAircraft, zones, conditions }));
      }
    } catch {
      degradedMode = true;
      threatScores = [];
    }

    // Step 4: Assign AWNING levels
    try {
      const assigner = (this.overrides.awningLevelAssigner as AwningAssignerLike | undefined) ?? new DefaultAwningLevelAssigner();
      awningLevels = assigner.assign(zones, threatScores, this.previousAwningLevels);

      // Publish AWNING changes
      for (const [zoneId, level] of Object.entries(awningLevels)) {
        const prev = this.previousAwningLevels[zoneId];
        if (prev !== level) {
          this.safePublish('sentinel.intel.awning_change', { zoneId, level, previousLevel: prev ?? 'CLEAR', timestampMs: Date.now() });
        }
      }
      this.previousAwningLevels = { ...awningLevels };
    } catch {
      degradedMode = true;
      awningLevels = {};
    }

    // Step 5: Anonymise tracks (GDPR)
    try {
      const anonymiser = (this.overrides.gdprTrackAnonymiser as GdprAnonymiserLike | undefined) ??
        new GdprTrackAnonymiser({ deploySecret: this.deploySecret });
      anonymisedTracks = anonymiser.anonymise(classifiedAircraft as unknown as AircraftState[]);
      if (!Array.isArray(anonymisedTracks)) {
        anonymisedTracks = [anonymisedTracks as unknown as AnonymisedTrack];
      }
    } catch {
      degradedMode = true;
      anonymisedTracks = [];
    }

    // Step 6: AACR notifications for RED/ORANGE zones
    try {
      const formatter = (this.overrides.aacrNotificationFormatter as AacrFormatterLike | undefined) ??
        new AacrNotificationFormatter();

      for (const breach of breaches) {
        const zone = zones.find((z) => z.id === breach.zoneId);
        if (!zone) continue;
        const level = awningLevels[breach.zoneId] ?? 'CLEAR';
        if (level === 'ORANGE' || level === 'RED') {
          const notifs = formatter.format(breach, level, zone as unknown as Parameters<AacrFormatterLike['format']>[2]);
          for (const n of notifs) {
            aacrNotifications.push(n);
            this.safePublish('sentinel.intel.aacr_notification', n);
          }
        }
      }
    } catch {
      degradedMode = true;
      aacrNotifications = [];
    }

    // Step 7: ROMATSA coordination for airport RED
    try {
      const rci = (this.overrides.romatsaCoordinationInterface as RomatsaLike | undefined) ??
        new RomatsaCoordinationInterface();

      for (const breach of breaches) {
        const zone = zones.find((z) => z.id === breach.zoneId);
        if (!zone) continue;
        const level = awningLevels[breach.zoneId] ?? 'CLEAR';
        const matchedAircraft = classifiedAircraft.find((a) => a.icao24 === breach.aircraftIcao24) ?? null;
        const msgs = rci.generate(breach, level, zone as unknown as Parameters<RomatsaLike['generate']>[2], matchedAircraft, notams);
        for (const m of msgs) {
          coordinationMessages.push(m);
          this.safePublish('sentinel.intel.romatsa_coordination', m);
        }
      }
    } catch {
      degradedMode = true;
      coordinationMessages = [];
    }

    // Publish breach events
    for (const breach of breaches) {
      this.safePublish('sentinel.intel.breach_detected', breach);
    }

    // Privacy breach flag propagation
    const privacyBreachFlag = anonymisedTracks.some((t) => t.privacyBreachFlag === true) ||
      (!this.deploySecret && aircraft.length > 0);

    const pipelineLatencyMs = Date.now() - startMs;

    return {
      breaches,
      threatScores,
      awningLevels,
      aacrNotifications,
      coordinationMessages,
      anonymisedTracks,
      degradedMode,
      privacyBreachFlag,
      pipelineLatencyMs,
      generatedAt: safeNow,
    };
  }

  private safePublish(subject: string, data: unknown): void {
    try {
      this.nats?.publish(subject, data);
    } catch {
      // NATS publish failure must not crash pipeline
    }
  }
}
