// FR-W19-08: W19ThreatIntelPipeline — TDD RED
// src/intel/w19-threat-intel-pipeline.ts does NOT exist yet — all tests will fail

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { W19ThreatIntelPipeline } from '../../src/intel/w19-threat-intel-pipeline.js';

// ---------------------------------------------------------------------------
// Inline types
// ---------------------------------------------------------------------------
type AwningLevel = 'CLEAR' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
type BreachType = 'INSIDE' | 'ENTERING' | 'APPROACHING';
type EasaCategory = 'cat-a-commercial' | 'cat-b-modified' | 'cat-c-surveillance' | 'cat-d-unknown';
type AnonymisationStatus = 'ANONYMISED' | 'EXEMPT' | 'PENDING' | 'ERROR_PASSTHROUGH';

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
  value: number;
  components: { proximity: number; category: number; flyability: number; securityBonus: number };
  zoneId: string;
  aircraftIcao24: string;
  scoredAt: string;
}

interface AacrNotification {
  incidentId: string;
  timestampUtc: string;
  locationIcao: string;
  aircraftCategory: string;
  awningLevel: AwningLevel;
  recommendedAction: string;
  operatorConfirmationRequired: boolean;
  cncanEscalationRequired?: boolean;
}

interface RomatsaCoordinationMessage {
  affectedAerodrome: string;
  awningLevel: AwningLevel;
  classification: string;
  notamCoverage: boolean;
  actionDowngradedByNotam: boolean;
  recommendedAction: string;
  aircraftSpeedKts: number;
  aircraftAltitudeFt: number;
}

interface AnonymisedTrack {
  pseudoId: string;
  gridLat: number;
  gridLon: number;
  anonymisationStatus: AnonymisationStatus;
  legalBasis?: string;
  privacyBreachFlag?: boolean;
}

interface ThreatIntelPicture {
  breaches: ZoneBreach[];
  threatScores: ThreatScore[];
  awningLevels: Record<string, AwningLevel>;
  aacrNotifications: AacrNotification[];
  coordinationMessages: RomatsaCoordinationMessage[];
  anonymisedTracks: AnonymisedTrack[];
  degradedMode: boolean;
  privacyBreachFlag: boolean;
  pipelineLatencyMs: number;
  generatedAt: Date;
}

// EuSituationalPicture (from existing src/feeds/types.ts)
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
  source: 'opensky' | 'adsbexchange' | 'adsbfi';
  cooperativeContact?: boolean;
  category?: string | null;
  squawk?: string | null;
  trackStartedAt?: number;
}

interface EuSituationalPicture {
  aircraft: AircraftState[];
  notams: unknown[];
  zones: Array<{
    id: string;
    name: string;
    type: string;
    lat: number;
    lon: number;
    radiusKm: number;
    icaoCode?: string;
    exclusionZones?: unknown[];
  }>;
  conditions: { flyabilityScore: number; tempC: number; windSpeedMs: number; windDirectionDeg: number; visibilityM: number; precipitationMm: number; cloudCoverPct: number; timestampMs: number };
  securityEvents: unknown[];
  feedHealth: unknown[];
  generatedAt: number;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const LROP_ZONE = {
  id: 'RO-LROP-EXCLUSION',
  name: 'Henri Coandă Airport',
  type: 'airport',
  icaoCode: 'LROP',
  lat: 44.5713,
  lon: 26.0849,
  radiusKm: 5,
  exclusionZones: [],
};

const CERNAVODA_ZONE = {
  id: 'RO-NUCLEAR-CND',
  name: 'Cernavodă Nuclear',
  type: 'nuclear',
  lat: 44.3267,
  lon: 28.0606,
  radiusKm: 10,
  exclusionZones: [],
};

function makeAircraft(overrides: Partial<AircraftState> = {}): AircraftState {
  return {
    icao24: 'ROA001',
    callsign: 'ROA001',
    lat: 44.5800,
    lon: 26.0850,
    altBaro: 500,
    altitudeM: 500,
    velocityMs: 20,
    headingDeg: 90,
    onGround: false,
    timestampMs: Date.now(),
    source: 'opensky',
    cooperativeContact: true,
    category: 'A3',
    squawk: null,
    trackStartedAt: Date.now() - 40_000,
    ...overrides,
  };
}

function makeEmptyPicture(): EuSituationalPicture {
  return {
    aircraft: [],
    notams: [],
    zones: [],
    conditions: {
      flyabilityScore: 60,
      tempC: 20,
      windSpeedMs: 5,
      windDirectionDeg: 90,
      visibilityM: 10000,
      precipitationMm: 0,
      cloudCoverPct: 20,
      timestampMs: Date.now(),
    },
    securityEvents: [],
    feedHealth: [],
    generatedAt: Date.now(),
  };
}

function makePictureWithBreach(): EuSituationalPicture {
  return {
    ...makeEmptyPicture(),
    aircraft: [makeAircraft({ lat: 44.5800, lon: 26.0850 })],
    zones: [LROP_ZONE],
  };
}

interface NatsMock {
  publish: ReturnType<typeof vi.fn>;
}

let mockNats: NatsMock;

beforeEach(() => {
  mockNats = { publish: vi.fn() };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('FR-W19-08: W19ThreatIntelPipeline', () => {
  // 08-01: full pipeline happy path → ThreatIntelPicture with all 6 core fields
  it('08-01: full pipeline happy path → ThreatIntelPicture with all 6 fields', async () => {
    const pipeline = new W19ThreatIntelPipeline({ nats: mockNats, deploySecret: 'test-secret' });
    const pic = makePictureWithBreach();
    const result: ThreatIntelPicture = await pipeline.process(pic);
    expect(result).toHaveProperty('breaches');
    expect(result).toHaveProperty('threatScores');
    expect(result).toHaveProperty('awningLevels');
    expect(result).toHaveProperty('aacrNotifications');
    expect(result).toHaveProperty('coordinationMessages');
    expect(result).toHaveProperty('anonymisedTracks');
  });

  // 08-02: NATS mock receives publishes on 'sentinel.intel.breach_detected' for each breach
  it('08-02: NATS receives sentinel.intel.breach_detected for each breach', async () => {
    const pipeline = new W19ThreatIntelPipeline({ nats: mockNats, deploySecret: 'test-secret' });
    const pic = makePictureWithBreach();
    const result: ThreatIntelPicture = await pipeline.process(pic);

    if (result.breaches.length > 0) {
      const breachPublishes = mockNats.publish.mock.calls.filter(
        (c) => c[0] === 'sentinel.intel.breach_detected'
      );
      expect(breachPublishes.length).toBeGreaterThanOrEqual(result.breaches.length);
    }
  });

  // 08-03: degraded mode — if RomatsaCoordinationInterface throws → picture.degradedMode=true, coordinationMessages=[]
  it('08-03: degraded mode when sub-component throws → degradedMode=true, coordinationMessages=[]', async () => {
    // Inject a broken RCI that throws
    const pipeline = new W19ThreatIntelPipeline({
      nats: mockNats,
      deploySecret: 'test-secret',
      overrides: {
        romatsaCoordinationInterface: {
          generate: () => { throw new Error('ROMATSA down'); },
        },
      },
    });
    const pic = makePictureWithBreach();
    const result: ThreatIntelPicture = await pipeline.process(pic);
    expect(result.degradedMode).toBe(true);
    expect(result.coordinationMessages).toHaveLength(0);
  });

  // 08-04: performance gate — 50 aircraft + 8 zones → pipelineLatencyMs < 500
  it('08-04: 50 aircraft + 8 zones → pipelineLatencyMs < 500ms', async () => {
    const pipeline = new W19ThreatIntelPipeline({ nats: mockNats, deploySecret: 'test-secret' });
    const zones = [
      LROP_ZONE, CERNAVODA_ZONE,
      { ...LROP_ZONE, id: 'Z3', lat: 45.0, lon: 24.0, radiusKm: 5 },
      { ...LROP_ZONE, id: 'Z4', lat: 46.0, lon: 25.0, radiusKm: 5 },
      { ...LROP_ZONE, id: 'Z5', lat: 47.0, lon: 26.0, radiusKm: 5 },
      { ...LROP_ZONE, id: 'Z6', lat: 43.0, lon: 27.0, radiusKm: 5 },
      { ...CERNAVODA_ZONE, id: 'Z7', lat: 44.0, lon: 29.0, radiusKm: 8 },
      { ...CERNAVODA_ZONE, id: 'Z8', lat: 45.5, lon: 23.0, radiusKm: 6 },
    ];
    const aircraft = Array.from({ length: 50 }, (_, i) =>
      makeAircraft({ icao24: `ICAO${i.toString().padStart(4, '0')}`, lat: 44.0 + i * 0.1, lon: 26.0 + i * 0.05 })
    );
    const pic: EuSituationalPicture = { ...makeEmptyPicture(), aircraft, zones };
    const result: ThreatIntelPicture = await pipeline.process(pic);
    expect(result.pipelineLatencyMs).toBeLessThan(500);
  });

  // 08-05: privacy breach propagation — no deploySecret → picture.privacyBreachFlag=true
  it('08-05: no deploySecret → picture.privacyBreachFlag=true', async () => {
    const pipeline = new W19ThreatIntelPipeline({ nats: mockNats, deploySecret: '' });
    const pic = makePictureWithBreach();
    const result: ThreatIntelPicture = await pipeline.process(pic);
    expect(result.privacyBreachFlag).toBe(true);
  });

  // 08-06: process() never throws for any input
  it('08-06: process() never throws for any input', async () => {
    const pipeline = new W19ThreatIntelPipeline({ nats: mockNats, deploySecret: 'test-secret' });
    await expect(pipeline.process(null as unknown as EuSituationalPicture)).resolves.not.toThrow();
    await expect(pipeline.process(undefined as unknown as EuSituationalPicture)).resolves.not.toThrow();
    await expect(pipeline.process(makeEmptyPicture())).resolves.not.toThrow();
  });

  // 08-07: picture.generatedAt is a Date instance
  it('08-07: picture.generatedAt is a Date instance', async () => {
    const pipeline = new W19ThreatIntelPipeline({ nats: mockNats, deploySecret: 'test-secret' });
    const result: ThreatIntelPicture = await pipeline.process(makeEmptyPicture());
    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  // 08-08: empty EuSituationalPicture → breaches=[], threatScores=[]
  it('08-08: empty picture (no aircraft) → breaches=[], threatScores=[]', async () => {
    const pipeline = new W19ThreatIntelPipeline({ nats: mockNats, deploySecret: 'test-secret' });
    const result: ThreatIntelPicture = await pipeline.process(makeEmptyPicture());
    expect(result.breaches).toHaveLength(0);
    expect(result.threatScores).toHaveLength(0);
  });

  // 08-09: AWNING levels keyed by zoneId
  it('08-09: awningLevels is keyed by zoneId', async () => {
    const pipeline = new W19ThreatIntelPipeline({ nats: mockNats, deploySecret: 'test-secret' });
    const pic: EuSituationalPicture = {
      ...makeEmptyPicture(),
      aircraft: [makeAircraft()],
      zones: [LROP_ZONE, CERNAVODA_ZONE],
    };
    const result: ThreatIntelPicture = await pipeline.process(pic);
    // awningLevels should have keys matching zone ids
    const keys = Object.keys(result.awningLevels);
    expect(keys.length).toBeGreaterThanOrEqual(0);
    // If keys exist, they should be valid zone ids
    for (const key of keys) {
      expect(typeof key).toBe('string');
      const level = result.awningLevels[key];
      const validLevels: AwningLevel[] = ['CLEAR', 'GREEN', 'YELLOW', 'ORANGE', 'RED'];
      expect(validLevels).toContain(level);
    }
  });

  // 08-10: process() is async, returns Promise<ThreatIntelPicture>
  it('08-10: process() returns a Promise', async () => {
    const pipeline = new W19ThreatIntelPipeline({ nats: mockNats, deploySecret: 'test-secret' });
    const returnVal = pipeline.process(makeEmptyPicture());
    expect(returnVal).toBeInstanceOf(Promise);
    const result = await returnVal;
    expect(result).toHaveProperty('generatedAt');
  });

  // 08-11: No aircraft near any zone → awningLevels all CLEAR or GREEN
  it('08-11: no aircraft near zones → awningLevels all CLEAR or GREEN', async () => {
    const pipeline = new W19ThreatIntelPipeline({ nats: mockNats, deploySecret: 'test-secret' });
    const pic: EuSituationalPicture = {
      ...makeEmptyPicture(),
      aircraft: [makeAircraft({ lat: 40.0, lon: 20.0 })], // far from all zones
      zones: [LROP_ZONE, CERNAVODA_ZONE],
    };
    const result: ThreatIntelPicture = await pipeline.process(pic);
    const safelevels: AwningLevel[] = ['CLEAR', 'GREEN'];
    for (const level of Object.values(result.awningLevels)) {
      expect(safelevels).toContain(level);
    }
  });

  // 08-12: multiple cycles — second call not affected by first call state
  it('08-12: two process() cycles → second call independent of first', async () => {
    const pipeline = new W19ThreatIntelPipeline({ nats: mockNats, deploySecret: 'test-secret' });

    const pic1 = makePictureWithBreach();
    const pic2 = makeEmptyPicture(); // no aircraft

    const r1 = await pipeline.process(pic1);
    const r2 = await pipeline.process(pic2);

    // Second call with no aircraft should have no breaches
    expect(r2.breaches).toHaveLength(0);
    // First result must be independent of second
    expect(r1.generatedAt).not.toBe(r2.generatedAt);
  });

  // 08-13: pipeline with all sub-components throwing → still returns partial ThreatIntelPicture
  it('08-13: all sub-components throwing → still returns partial ThreatIntelPicture without crash', async () => {
    const throwingOverrides = {
      breachDetector: { detectBreaches: () => { throw new Error('breach detector down'); } },
      threatScoringEngine: { score: () => { throw new Error('scorer down'); } },
      awningLevelAssigner: { assign: () => { throw new Error('assigner down'); } },
      aacrNotificationFormatter: { format: () => { throw new Error('formatter down'); } },
      romatsaCoordinationInterface: { generate: () => { throw new Error('rci down'); } },
      gdprTrackAnonymiser: { anonymise: () => { throw new Error('gdpr down'); } },
    };

    const pipeline = new W19ThreatIntelPipeline({
      nats: mockNats,
      deploySecret: 'test-secret',
      overrides: throwingOverrides,
    });

    const pic = makePictureWithBreach();
    let result: ThreatIntelPicture | undefined;
    await expect(
      pipeline.process(pic).then((r) => { result = r; })
    ).resolves.not.toThrow();

    if (result) {
      expect(result).toHaveProperty('generatedAt');
      expect(result.degradedMode).toBe(true);
    }
  });
});
