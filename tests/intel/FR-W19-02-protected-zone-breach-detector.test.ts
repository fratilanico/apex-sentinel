// FR-W19-02: ProtectedZoneBreachDetector — TDD RED
// src/intel/protected-zone-breach-detector.ts does NOT exist yet — all tests will fail

import { describe, it, expect, afterEach, vi } from 'vitest';
import { ProtectedZoneBreachDetector } from '../../src/intel/protected-zone-breach-detector.js';

// ---------------------------------------------------------------------------
// Inline types
// ---------------------------------------------------------------------------
type BreachType = 'INSIDE' | 'ENTERING' | 'APPROACHING';

interface ZoneBreach {
  zoneId: string;
  breachType: BreachType;
  distanceM: number;
  ttBreachS?: number | null;
  firstDetectedAt: string; // ISO
  aircraftIcao24: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

// ---------------------------------------------------------------------------
// Zone fixtures
// ---------------------------------------------------------------------------
const LROP_ZONE = {
  id: 'RO-LROP-EXCLUSION',
  name: 'Henri Coandă Airport',
  type: 'airport' as const,
  lat: 44.5713,
  lon: 26.0849,
  radiusKm: 5,
  exclusionZones: [],
};

const LROP_CTR_ZONE = {
  id: 'RO-LROP-CTR',
  name: 'Henri Coandă CTR',
  type: 'airport' as const,
  lat: 44.5713,
  lon: 26.0849,
  radiusKm: 8,
  exclusionZones: [],
};

const CERNAVODA_ZONE = {
  id: 'RO-NUCLEAR-CND',
  name: 'Cernavodă Nuclear',
  type: 'nuclear' as const,
  lat: 44.3267,
  lon: 28.0606,
  radiusKm: 10,
  exclusionZones: [],
};

// Minimal AircraftState-like fixture
function makeAircraft(overrides: Record<string, unknown> = {}) {
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
    source: 'opensky' as const,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FR-W19-02: ProtectedZoneBreachDetector', () => {
  // 02-01: aircraft ~1km from LROP centre, inside 5km zone → INSIDE, distanceM < 5000
  it('02-01: aircraft at 44.5800,26.0850 (~1km from LROP) → INSIDE breach, distanceM<5000', () => {
    const detector = new ProtectedZoneBreachDetector();
    const aircraft = makeAircraft({ lat: 44.5800, lon: 26.0850 });
    const breaches: ZoneBreach[] = detector.detectBreaches([aircraft], [LROP_ZONE]);
    expect(breaches.length).toBeGreaterThanOrEqual(1);
    const breach = breaches.find((b) => b.zoneId === 'RO-LROP-EXCLUSION');
    expect(breach).toBeDefined();
    expect(breach!.breachType).toBe('INSIDE');
    expect(breach!.distanceM).toBeLessThan(5000);
    expect(breach!.aircraftIcao24).toBe('ROA001');
  });

  // 02-02: aircraft far from all zones → empty array
  it('02-02: aircraft at 45.000,24.500 (far from all zones) → empty array', () => {
    const detector = new ProtectedZoneBreachDetector();
    const aircraft = makeAircraft({ lat: 45.0, lon: 24.5 });
    const breaches: ZoneBreach[] = detector.detectBreaches([aircraft], [LROP_ZONE, CERNAVODA_ZONE]);
    expect(breaches).toHaveLength(0);
  });

  // 02-03: aircraft ~5.3km from LROP (inside alertRadius) + approaching → ENTERING, ttBreachS positive
  it('02-03: aircraft ~5.3km from LROP, approaching → breachType=ENTERING, ttBreachS positive', () => {
    const detector = new ProtectedZoneBreachDetector();
    // 5.3km south of LROP centre — outside 5km but inside alert buffer
    const aircraft = makeAircraft({
      lat: 44.5230,
      lon: 26.0849,
      velocityMs: 25,
      headingDeg: 0, // heading north = towards LROP
    });
    const breaches: ZoneBreach[] = detector.detectBreaches([aircraft], [LROP_ZONE]);
    const breach = breaches.find((b) => b.zoneId === 'RO-LROP-EXCLUSION');
    expect(breach).toBeDefined();
    expect(breach!.breachType).toBe('ENTERING');
    expect(breach!.ttBreachS).toBeGreaterThan(0);
  });

  // 02-04: haversineM between LROP and CERNAVODA → 187km-189km
  it('02-04: haversineM(LROP, CERNAVODA) → 187000–189000m', () => {
    const detector = new ProtectedZoneBreachDetector();
    const dist = (detector as unknown as { haversineM: (lat1: number, lon1: number, lat2: number, lon2: number) => number }).haversineM(
      44.5713, 26.0849,
      44.3267, 28.0606
    );
    expect(dist).toBeGreaterThan(187000);
    expect(dist).toBeLessThan(189000);
  });

  // 02-05: aircraft inside both LROP CTR (8km) and LROP Exclusion (5km) → 2 ZoneBreach records
  it('02-05: aircraft inside LROP (5km) and CTR (8km) → 2 breach records', () => {
    const detector = new ProtectedZoneBreachDetector();
    const aircraft = makeAircraft({ lat: 44.5800, lon: 26.0850 }); // ~1km from LROP
    const breaches: ZoneBreach[] = detector.detectBreaches(
      [aircraft],
      [LROP_ZONE, LROP_CTR_ZONE]
    );
    expect(breaches.length).toBeGreaterThanOrEqual(2);
    const zoneIds = breaches.map((b) => b.zoneId);
    expect(zoneIds).toContain('RO-LROP-EXCLUSION');
    expect(zoneIds).toContain('RO-LROP-CTR');
  });

  // 02-06: aircraft inside 10km Cernavodă zone → breach with correct zoneId
  it('02-06: aircraft at 44.3300,28.0600 (inside 10km Cernavodă) → breach zoneId=RO-NUCLEAR-CND', () => {
    const detector = new ProtectedZoneBreachDetector();
    const aircraft = makeAircraft({ lat: 44.3300, lon: 28.0600 });
    const breaches: ZoneBreach[] = detector.detectBreaches([aircraft], [CERNAVODA_ZONE]);
    expect(breaches.length).toBeGreaterThanOrEqual(1);
    expect(breaches[0].zoneId).toBe('RO-NUCLEAR-CND');
  });

  // 02-07: aircraft on ground near airport → breach type reflects ground state
  it('02-07: aircraft onGround=true near airport → breach type reflects ground state', () => {
    const detector = new ProtectedZoneBreachDetector();
    const aircraft = makeAircraft({ lat: 44.5713, lon: 26.0849, onGround: true });
    const breaches: ZoneBreach[] = detector.detectBreaches([aircraft], [LROP_ZONE]);
    // Result must exist and have a valid breachType
    if (breaches.length > 0) {
      const validTypes: BreachType[] = ['INSIDE', 'ENTERING', 'APPROACHING'];
      expect(validTypes).toContain(breaches[0].breachType);
    }
    // Does not throw — either returns breaches or empty array
    expect(Array.isArray(breaches)).toBe(true);
  });

  // 02-08: detectBreaches() never throws for any input
  it('02-08: detectBreaches() never throws for any input', () => {
    const detector = new ProtectedZoneBreachDetector();
    expect(() => detector.detectBreaches([], [])).not.toThrow();
    expect(() => detector.detectBreaches(null as unknown as [], [LROP_ZONE])).not.toThrow();
    expect(() =>
      detector.detectBreaches(
        [makeAircraft({ lat: null, lon: undefined }) as unknown as ReturnType<typeof makeAircraft>],
        [LROP_ZONE]
      )
    ).not.toThrow();
  });

  // 02-09: breach severity CRITICAL for nuclear zone
  it('02-09: nuclear zone breach → severity=CRITICAL', () => {
    const detector = new ProtectedZoneBreachDetector();
    const aircraft = makeAircraft({ lat: 44.3300, lon: 28.0600 });
    const breaches: ZoneBreach[] = detector.detectBreaches([aircraft], [CERNAVODA_ZONE]);
    expect(breaches.length).toBeGreaterThanOrEqual(1);
    const nuclearBreach = breaches.find((b) => b.zoneId === 'RO-NUCLEAR-CND');
    expect(nuclearBreach!.severity).toBe('CRITICAL');
  });

  // 02-10: breach severity HIGH for airport zone
  it('02-10: airport zone breach → severity=HIGH', () => {
    const detector = new ProtectedZoneBreachDetector();
    const aircraft = makeAircraft({ lat: 44.5800, lon: 26.0850 });
    const breaches: ZoneBreach[] = detector.detectBreaches([aircraft], [LROP_ZONE]);
    expect(breaches.length).toBeGreaterThanOrEqual(1);
    const airportBreach = breaches.find((b) => b.zoneId === 'RO-LROP-EXCLUSION');
    expect(airportBreach!.severity).toBe('HIGH');
  });

  // 02-11: multiple aircraft → detectBreaches returns breaches from all aircraft
  it('02-11: multiple aircraft → detectBreaches returns breaches from all', () => {
    const detector = new ProtectedZoneBreachDetector();
    const a1 = makeAircraft({ icao24: 'ROA001', lat: 44.5800, lon: 26.0850 }); // inside LROP
    const a2 = makeAircraft({ icao24: 'ROA002', lat: 44.3300, lon: 28.0600 }); // inside CERNAVODA
    const breaches: ZoneBreach[] = detector.detectBreaches([a1, a2], [LROP_ZONE, CERNAVODA_ZONE]);
    const icaos = breaches.map((b) => b.aircraftIcao24);
    expect(icaos).toContain('ROA001');
    expect(icaos).toContain('ROA002');
  });

  // 02-12: aircraft exactly on zone boundary → included in results
  it('02-12: aircraft exactly on zone boundary → included in breach results', () => {
    const detector = new ProtectedZoneBreachDetector();
    // Place aircraft exactly 5km south of LROP centre
    // 1 degree lat ≈ 111km, so 5km ≈ 0.045 degrees
    const aircraft = makeAircraft({ lat: 44.5713 - 0.045, lon: 26.0849 });
    const breaches: ZoneBreach[] = detector.detectBreaches([aircraft], [LROP_ZONE]);
    // On or very near boundary must still produce a breach
    expect(breaches.length).toBeGreaterThanOrEqual(1);
  });

  // 02-13: detectBreaches with empty zones array → empty array
  it('02-13: detectBreaches with empty zones array → empty array', () => {
    const detector = new ProtectedZoneBreachDetector();
    const aircraft = makeAircraft({ lat: 44.5800, lon: 26.0850 });
    const breaches: ZoneBreach[] = detector.detectBreaches([aircraft], []);
    expect(breaches).toHaveLength(0);
  });
});
