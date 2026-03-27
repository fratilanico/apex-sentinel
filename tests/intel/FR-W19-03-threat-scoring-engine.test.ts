// FR-W19-03: ThreatScoringEngine — TDD RED
// src/intel/threat-scoring-engine.ts does NOT exist yet — all tests will fail

import { describe, it, expect, afterEach, vi } from 'vitest';
import { ThreatScoringEngine } from '../../src/intel/threat-scoring-engine.js';

// ---------------------------------------------------------------------------
// Inline types
// ---------------------------------------------------------------------------
type EasaCategory = 'cat-a-commercial' | 'cat-b-modified' | 'cat-c-surveillance' | 'cat-d-unknown';
type BreachType = 'INSIDE' | 'ENTERING' | 'APPROACHING';

interface ZoneBreach {
  zoneId: string;
  breachType: BreachType;
  distanceM: number;
  ttBreachS?: number | null;
  firstDetectedAt: string;
  aircraftIcao24: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

interface ThreatScore {
  value: number; // 0-100
  components: {
    proximity: number;
    category: number;
    flyability: number;
    securityBonus: number;
  };
  zoneId: string;
  aircraftIcao24: string;
  scoredAt: string;
}

interface SecurityEvent {
  id: string;
  lat: number;
  lon: number;
  timestampMs: number;
  distanceToNearestZoneKm: number;
  affectedZoneId: string | null;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const LROP_ZONE = {
  id: 'RO-LROP-EXCLUSION',
  type: 'airport' as const,
  lat: 44.5713,
  lon: 26.0849,
  radiusKm: 5,
};

const NUCLEAR_ZONE = {
  id: 'RO-NUCLEAR-CND',
  type: 'nuclear' as const,
  lat: 44.3267,
  lon: 28.0606,
  radiusKm: 10,
};

function makeBreach(overrides: Partial<ZoneBreach> = {}): ZoneBreach {
  return {
    zoneId: 'RO-LROP-EXCLUSION',
    breachType: 'INSIDE',
    distanceM: 500,
    ttBreachS: null,
    firstDetectedAt: new Date().toISOString(),
    aircraftIcao24: 'ROA001',
    severity: 'HIGH',
    ...overrides,
  };
}

function makeSecurityEvent(overrides: Partial<SecurityEvent> = {}): SecurityEvent {
  return {
    id: 'evt-001',
    lat: 44.5750,
    lon: 26.0850,
    timestampMs: Date.now(),
    distanceToNearestZoneKm: 5,
    affectedZoneId: 'RO-LROP-EXCLUSION',
    ...overrides,
  };
}

interface PicContext {
  category: EasaCategory;
  flyabilityScore: number;
  zone: typeof LROP_ZONE | typeof NUCLEAR_ZONE;
  securityEvents?: SecurityEvent[];
}

function makePic(overrides: Partial<PicContext> = {}): PicContext {
  return {
    category: 'cat-a-commercial',
    flyabilityScore: 75,
    zone: LROP_ZONE,
    securityEvents: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FR-W19-03: ThreatScoringEngine', () => {
  // 03-01: distanceM=0, cat-d-unknown, flyability=80, security within 10km → value=100 (clamped)
  it('03-01: distanceM=0, cat-d-unknown, flyability=80, security within 10km → value=100 (clamped)', () => {
    const engine = new ThreatScoringEngine();
    const breach = makeBreach({ distanceM: 0, breachType: 'INSIDE', severity: 'CRITICAL' });
    const pic = makePic({
      category: 'cat-d-unknown',
      flyabilityScore: 80,
      securityEvents: [makeSecurityEvent({ distanceToNearestZoneKm: 5 })],
    });
    const result: ThreatScore = engine.score(breach, pic);
    expect(result.value).toBe(100);
  });

  // 03-02: distanceM=4999, cat-a-commercial, flyability=75, no security → value > 0
  it('03-02: distanceM=4999, cat-a-commercial, flyability=75, no security → value > 0', () => {
    const engine = new ThreatScoringEngine();
    const breach = makeBreach({ distanceM: 4999, breachType: 'INSIDE', zoneId: 'RO-LROP-EXCLUSION' });
    const pic = makePic({ category: 'cat-a-commercial', flyabilityScore: 75, securityEvents: [] });
    const result: ThreatScore = engine.score(breach, pic);
    expect(result.value).toBeGreaterThan(0);
  });

  // 03-03: no security event → score 15 points lower than same breach with security event at 8km
  it('03-03: no security event → score 15 points lower than with security event at 8km', () => {
    const engine = new ThreatScoringEngine();
    const breach = makeBreach({ distanceM: 1000 });
    const picNoSec = makePic({ category: 'cat-d-unknown', flyabilityScore: 60, securityEvents: [] });
    const picWithSec = makePic({
      category: 'cat-d-unknown',
      flyabilityScore: 60,
      securityEvents: [makeSecurityEvent({ distanceToNearestZoneKm: 8 })],
    });
    const scoreNoSec = engine.score(breach, picNoSec).value;
    const scoreWithSec = engine.score(breach, picWithSec).value;
    expect(scoreWithSec - scoreNoSec).toBeCloseTo(15, 0);
  });

  // 03-04: high flyability (>70) amplifies threat vs low flyability (<30)
  it('03-04: high flyability (>70) scores higher than low flyability (<30)', () => {
    const engine = new ThreatScoringEngine();
    const breach = makeBreach({ distanceM: 1000 });
    const picHigh = makePic({ flyabilityScore: 90, securityEvents: [] });
    const picLow = makePic({ flyabilityScore: 10, securityEvents: [] });
    const scoreHigh = engine.score(breach, picHigh).value;
    const scoreLow = engine.score(breach, picLow).value;
    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });

  // 03-05: determinism — identical inputs → identical outputs
  it('03-05: identical inputs → identical outputs (deterministic)', () => {
    const engine = new ThreatScoringEngine();
    const breach = makeBreach({ distanceM: 2000 });
    const pic = makePic({ category: 'cat-b-modified', flyabilityScore: 65 });
    const r1 = engine.score(breach, pic);
    const r2 = engine.score(breach, pic);
    expect(r1.value).toBe(r2.value);
    expect(r1.components).toEqual(r2.components);
  });

  // 03-06: score always clamped 0-100
  it('03-06: score value always clamped to 0-100', () => {
    const engine = new ThreatScoringEngine();
    const extremeBreaches = [
      makeBreach({ distanceM: 0, severity: 'CRITICAL' }),
      makeBreach({ distanceM: 999999, breachType: 'APPROACHING', severity: 'LOW' }),
    ];
    const extremePics = [
      makePic({ category: 'cat-d-unknown', flyabilityScore: 100 }),
      makePic({ category: 'cat-a-commercial', flyabilityScore: 0 }),
    ];
    for (const b of extremeBreaches) {
      for (const p of extremePics) {
        const result = engine.score(b, p);
        expect(result.value).toBeGreaterThanOrEqual(0);
        expect(result.value).toBeLessThanOrEqual(100);
      }
    }
  });

  // 03-07: cat-d-unknown scores higher than cat-a-commercial for same breach geometry
  it('03-07: cat-d-unknown scores higher than cat-a-commercial for same breach geometry', () => {
    const engine = new ThreatScoringEngine();
    const breach = makeBreach({ distanceM: 1500 });
    const picUnknown = makePic({ category: 'cat-d-unknown', flyabilityScore: 60 });
    const picCommercial = makePic({ category: 'cat-a-commercial', flyabilityScore: 60 });
    const scoreUnknown = engine.score(breach, picUnknown).value;
    const scoreCommercial = engine.score(breach, picCommercial).value;
    expect(scoreUnknown).toBeGreaterThan(scoreCommercial);
  });

  // 03-08: airport zone breach → components.proximity is primary driver
  it('03-08: airport zone breach → components.proximity >= other components', () => {
    const engine = new ThreatScoringEngine();
    const breach = makeBreach({ distanceM: 100 });
    const pic = makePic({ flyabilityScore: 50, securityEvents: [] });
    const result: ThreatScore = engine.score(breach, pic);
    expect(result.components.proximity).toBeGreaterThanOrEqual(result.components.category);
    expect(result.components.proximity).toBeGreaterThanOrEqual(result.components.flyability);
  });

  // 03-09: nuclear zone with same config as airport → nuclear score >= airport score
  it('03-09: nuclear zone → score >= airport zone score for same breach config', () => {
    const engine = new ThreatScoringEngine();
    const breachAirport = makeBreach({ distanceM: 500, zoneId: 'RO-LROP-EXCLUSION' });
    const breachNuclear = makeBreach({ distanceM: 500, zoneId: 'RO-NUCLEAR-CND', severity: 'CRITICAL' });
    const pic = makePic({ category: 'cat-d-unknown', flyabilityScore: 70 });
    const picNuclear = { ...pic, zone: NUCLEAR_ZONE };
    const scoreAirport = engine.score(breachAirport, pic).value;
    const scoreNuclear = engine.score(breachNuclear, picNuclear).value;
    expect(scoreNuclear).toBeGreaterThanOrEqual(scoreAirport);
  });

  // 03-10: score() returns ThreatScore with all required fields
  it('03-10: score() returns ThreatScore with all required fields populated', () => {
    const engine = new ThreatScoringEngine();
    const result: ThreatScore = engine.score(makeBreach(), makePic());
    expect(result).toHaveProperty('value');
    expect(result).toHaveProperty('components');
    expect(result).toHaveProperty('components.proximity');
    expect(result).toHaveProperty('components.category');
    expect(result).toHaveProperty('components.flyability');
    expect(result).toHaveProperty('components.securityBonus');
    expect(result).toHaveProperty('zoneId');
    expect(result).toHaveProperty('aircraftIcao24');
    expect(result).toHaveProperty('scoredAt');
    expect(typeof result.scoredAt).toBe('string');
  });

  // 03-11: score() never throws for any valid ZoneBreach
  it('03-11: score() never throws for any valid ZoneBreach', () => {
    const engine = new ThreatScoringEngine();
    const edgeCases = [
      makeBreach({ distanceM: 0 }),
      makeBreach({ distanceM: Infinity }),
      makeBreach({ distanceM: NaN }),
      makeBreach({ breachType: 'APPROACHING', ttBreachS: undefined }),
    ];
    for (const b of edgeCases) {
      expect(() => engine.score(b, makePic())).not.toThrow();
    }
  });

  // 03-12: batch score: score([breach1,breach2], pic) returns array of 2 ThreatScore
  it('03-12: score([breach1, breach2], pic) returns array of 2 ThreatScore', () => {
    const engine = new ThreatScoringEngine();
    const b1 = makeBreach({ aircraftIcao24: 'ROA001', distanceM: 500 });
    const b2 = makeBreach({ aircraftIcao24: 'ROA002', distanceM: 2000 });
    const results: ThreatScore[] = engine.score([b1, b2], makePic());
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(2);
    expect(results[0]).toHaveProperty('value');
    expect(results[1]).toHaveProperty('value');
  });

  // 03-13: distant approach (distanceM ≈ radiusKm*1000) → score in LOW range (0-25)
  it('03-13: distanceM close to radiusKm*1000 → score in LOW range (0-25)', () => {
    const engine = new ThreatScoringEngine();
    const breach = makeBreach({
      distanceM: 4900, // near 5km boundary
      breachType: 'APPROACHING',
      severity: 'LOW',
    });
    const pic = makePic({ category: 'cat-a-commercial', flyabilityScore: 30, securityEvents: [] });
    const result: ThreatScore = engine.score(breach, pic);
    expect(result.value).toBeLessThanOrEqual(25);
  });

  // 03-14: immediate breach (distanceM=100) → score in HIGH range (>75)
  it('03-14: distanceM=100 (immediate breach) → score > 75', () => {
    const engine = new ThreatScoringEngine();
    const breach = makeBreach({ distanceM: 100, breachType: 'INSIDE', severity: 'HIGH' });
    const pic = makePic({ category: 'cat-d-unknown', flyabilityScore: 80, securityEvents: [] });
    const result: ThreatScore = engine.score(breach, pic);
    expect(result.value).toBeGreaterThan(75);
  });

  // 03-15: securityBonus=15 when security within 10km, 0 when >10km
  it('03-15: securityBonus=15 when SecurityEvent within 10km, 0 when >10km', () => {
    const engine = new ThreatScoringEngine();
    const breach = makeBreach({ distanceM: 1000 });

    const picClose = makePic({
      securityEvents: [makeSecurityEvent({ distanceToNearestZoneKm: 8 })],
    });
    const picFar = makePic({
      securityEvents: [makeSecurityEvent({ distanceToNearestZoneKm: 15 })],
    });

    const rClose: ThreatScore = engine.score(breach, picClose);
    const rFar: ThreatScore = engine.score(breach, picFar);

    expect(rClose.components.securityBonus).toBe(15);
    expect(rFar.components.securityBonus).toBe(0);
  });
});
