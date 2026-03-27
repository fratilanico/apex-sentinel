// FR-W19-07: RomatsaCoordinationInterface — TDD RED
// src/intel/romatsa-coordination-interface.ts does NOT exist yet — all tests will fail

import { describe, it, expect, afterEach, vi } from 'vitest';
import { RomatsaCoordinationInterface } from '../../src/intel/romatsa-coordination-interface.js';

// ---------------------------------------------------------------------------
// Inline types
// ---------------------------------------------------------------------------
type AwningLevel = 'CLEAR' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
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

interface RomatsaCoordinationMessage {
  affectedAerodrome: string;
  awningLevel: AwningLevel;
  classification: string; // TLP:RED | TLP:AMBER | TLP:GREEN
  notamCoverage: boolean;
  actionDowngradedByNotam: boolean;
  recommendedAction: string;
  aircraftSpeedKts: number;
  aircraftAltitudeFt: number;
}

// NOTAM fixture
interface ActiveNotam {
  type: string; // 'R' = restriction, 'C' = caution, etc.
  affectedIcao: string;
  validFrom: Date;
  validTo: Date;
}

// ---------------------------------------------------------------------------
// Zone fixtures
// ---------------------------------------------------------------------------
const LROP_ZONE = {
  id: 'RO-LROP-EXCLUSION',
  name: 'Henri Coandă Airport',
  type: 'airport' as const,
  icaoCode: 'LROP',
  lat: 44.5713,
  lon: 26.0849,
  radiusKm: 5,
};

const LRCL_ZONE = {
  id: 'RO-LRCL-EXCLUSION',
  name: 'Cluj-Napoca Airport',
  type: 'airport' as const,
  icaoCode: 'LRCL',
  lat: 46.7852,
  lon: 23.6862,
  radiusKm: 5,
};

const CERNAVODA_ZONE = {
  id: 'RO-NUCLEAR-CND',
  name: 'Cernavodă Nuclear',
  type: 'nuclear' as const,
  icaoCode: undefined,
  lat: 44.3267,
  lon: 28.0606,
  radiusKm: 10,
};

const MILITARY_ZONE = {
  id: 'RO-MIL-001',
  name: 'Military Zone Alpha',
  type: 'military' as const,
  icaoCode: undefined,
  lat: 45.0,
  lon: 25.0,
  radiusKm: 8,
};

const GOV_ZONE = {
  id: 'RO-GOV-001',
  name: 'Government Zone',
  type: 'government' as const,
  icaoCode: undefined,
  lat: 44.4,
  lon: 26.1,
  radiusKm: 3,
};

function makeBreach(overrides: Partial<ZoneBreach> = {}): ZoneBreach {
  return {
    zoneId: 'RO-LROP-EXCLUSION',
    breachType: 'INSIDE',
    distanceM: 500,
    ttBreachS: null,
    firstDetectedAt: '2026-03-27T14:00:00.000Z',
    aircraftIcao24: 'ROA001',
    severity: 'HIGH',
    ...overrides,
  };
}

function makeAircraft(overrides: Record<string, unknown> = {}) {
  return {
    icao24: 'ROA001',
    callsign: 'ROA001',
    lat: 44.5800,
    lon: 26.0850,
    altBaro: 1000,    // metres
    altitudeM: 1000,
    velocityMs: 50,   // m/s
    headingDeg: 90,
    onGround: false,
    timestampMs: Date.now(),
    source: 'opensky' as const,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FR-W19-07: RomatsaCoordinationInterface', () => {
  // 07-01: RED at LROP, no active NOTAM → coordination message with correct fields
  it('07-01: RED airport LROP, no active NOTAM → message with affectedAerodrome=LROP, classification=TLP:RED', () => {
    const rci = new RomatsaCoordinationInterface();
    const breach = makeBreach();
    const aircraft = makeAircraft();
    const messages: RomatsaCoordinationMessage[] = rci.generate(breach, 'RED', LROP_ZONE, aircraft, []);
    expect(messages).toHaveLength(1);
    const msg = messages[0];
    expect(msg.affectedAerodrome).toBe('LROP');
    expect(msg.awningLevel).toBe('RED');
    expect(msg.classification).toBe('TLP:RED');
  });

  // 07-02: RED at LRCL + active NOTAM type R covering LRCL → notamCoverage=true, actionDowngradedByNotam=true
  it('07-02: RED at LRCL + active NOTAM type R → notamCoverage=true, actionDowngradedByNotam=true', () => {
    const rci = new RomatsaCoordinationInterface();
    const breach = makeBreach({ zoneId: 'RO-LRCL-EXCLUSION' });
    const aircraft = makeAircraft();
    const notam: ActiveNotam = {
      type: 'R',
      affectedIcao: 'LRCL',
      validFrom: new Date(Date.now() - 3600_000),
      validTo: new Date(Date.now() + 3600_000),
    };
    const messages: RomatsaCoordinationMessage[] = rci.generate(
      breach, 'RED', LRCL_ZONE, aircraft, [notam]
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].notamCoverage).toBe(true);
    expect(messages[0].actionDowngradedByNotam).toBe(true);
  });

  // 07-03: RED at Cernavodă nuclear → empty array (nuclear → AACR/CNCAN, not ROMATSA)
  it('07-03: RED at Cernavodă nuclear → empty array (not ROMATSA domain)', () => {
    const rci = new RomatsaCoordinationInterface();
    const breach = makeBreach({ zoneId: 'RO-NUCLEAR-CND', severity: 'CRITICAL' });
    const aircraft = makeAircraft();
    const messages = rci.generate(breach, 'RED', CERNAVODA_ZONE, aircraft, []);
    expect(messages).toHaveLength(0);
  });

  // 07-04: velocityMs=50, altBaro=1000 → aircraftSpeedKts≈97, aircraftAltitudeFt≈3281
  it('07-04: velocityMs=50, altBaro=1000 → aircraftSpeedKts≈97, aircraftAltitudeFt≈3281', () => {
    const rci = new RomatsaCoordinationInterface();
    const breach = makeBreach();
    const aircraft = makeAircraft({ velocityMs: 50, altBaro: 1000 });
    const messages: RomatsaCoordinationMessage[] = rci.generate(breach, 'RED', LROP_ZONE, aircraft, []);
    expect(messages).toHaveLength(1);
    // 50 m/s × 1.944 ≈ 97.2 kts
    expect(messages[0].aircraftSpeedKts).toBeCloseTo(97.2, 0);
    // 1000m × 3.281 ≈ 3281 ft
    expect(messages[0].aircraftAltitudeFt).toBeCloseTo(3281, 0);
  });

  // 07-05: generate() never throws for any input
  it('07-05: generate() never throws for any input', () => {
    const rci = new RomatsaCoordinationInterface();
    expect(() => rci.generate(null as unknown as ZoneBreach, 'RED', LROP_ZONE, makeAircraft(), [])).not.toThrow();
    expect(() => rci.generate(makeBreach(), null as unknown as AwningLevel, LROP_ZONE, makeAircraft(), [])).not.toThrow();
    expect(() => rci.generate(makeBreach(), 'RED', null as unknown as typeof LROP_ZONE, makeAircraft(), [])).not.toThrow();
    expect(() => rci.generate(makeBreach(), 'RED', LROP_ZONE, null as unknown as ReturnType<typeof makeAircraft>, [])).not.toThrow();
  });

  // 07-06: CLEAR or GREEN AWNING at airport → no coordination message
  it('07-06: CLEAR or GREEN AWNING at airport → empty array', () => {
    const rci = new RomatsaCoordinationInterface();
    const breach = makeBreach();
    const aircraft = makeAircraft();
    expect(rci.generate(breach, 'CLEAR' as AwningLevel, LROP_ZONE, aircraft, [])).toHaveLength(0);
    expect(rci.generate(breach, 'GREEN', LROP_ZONE, aircraft, [])).toHaveLength(0);
  });

  // 07-07: ORANGE airport → coordination message generated
  it('07-07: ORANGE at airport → coordination message generated', () => {
    const rci = new RomatsaCoordinationInterface();
    const breach = makeBreach();
    const aircraft = makeAircraft();
    const messages = rci.generate(breach, 'ORANGE', LROP_ZONE, aircraft, []);
    expect(messages.length).toBeGreaterThanOrEqual(1);
  });

  // 07-08: military zone RED → empty array (handled separately)
  it('07-08: military zone RED → empty array', () => {
    const rci = new RomatsaCoordinationInterface();
    const breach = makeBreach({ zoneId: 'RO-MIL-001' });
    const aircraft = makeAircraft();
    const messages = rci.generate(breach, 'RED', MILITARY_ZONE, aircraft, []);
    expect(messages).toHaveLength(0);
  });

  // 07-09: government zone RED → empty array (not ROMATSA domain)
  it('07-09: government zone RED → empty array', () => {
    const rci = new RomatsaCoordinationInterface();
    const breach = makeBreach({ zoneId: 'RO-GOV-001' });
    const aircraft = makeAircraft();
    const messages = rci.generate(breach, 'RED', GOV_ZONE, aircraft, []);
    expect(messages).toHaveLength(0);
  });

  // 07-10: classification='TLP:AMBER' for ORANGE AWNING (not RED)
  it('07-10: ORANGE AWNING at airport → classification=TLP:AMBER', () => {
    const rci = new RomatsaCoordinationInterface();
    const breach = makeBreach();
    const aircraft = makeAircraft();
    const messages: RomatsaCoordinationMessage[] = rci.generate(breach, 'ORANGE', LROP_ZONE, aircraft, []);
    expect(messages).toHaveLength(1);
    expect(messages[0].classification).toBe('TLP:AMBER');
  });
});
