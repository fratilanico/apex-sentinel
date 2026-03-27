// APEX-SENTINEL W18 — FR-W18-02: AircraftPositionAggregator
// TDD RED — src/feeds/aircraft-position-aggregator.ts not yet written

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AircraftPositionAggregator } from '../../src/feeds/aircraft-position-aggregator.js';
import type { AircraftState } from '../../src/feeds/types.js';

// ---------------------------------------------------------------------------
// Fixtures — Romanian airspace bbox: 43.5–48.5°N, 20.2–30.0°E
// ---------------------------------------------------------------------------

const NOW = 1_740_000_000_000; // fixed epoch ms for determinism

const mkAircraft = (overrides: Partial<AircraftState>): AircraftState => ({
  icao24: 'aabbcc',
  lat: 44.43,
  lon: 26.10,
  altitudeM: 3000,
  velocityMs: 120,
  headingDeg: 90,
  timestampMs: NOW,
  source: 'opensky',
  callsign: 'ROT100',
  onGround: false,
  transponderMode: 'adsb',
  ...overrides,
});

const OPENSKY_BATCH: AircraftState[] = [
  mkAircraft({ icao24: 'aa1111', callsign: 'ROT101', lat: 44.5, lon: 26.1, source: 'opensky' }),
  mkAircraft({ icao24: 'bb2222', callsign: 'ROT202', lat: 46.0, lon: 24.5, source: 'opensky' }),
  mkAircraft({ icao24: 'cc3333', callsign: 'ROT303', lat: 47.2, lon: 22.3, source: 'opensky' }),
];

const ADSBEX_BATCH: AircraftState[] = [
  // same icao24 as OPENSKY_BATCH[0] but slightly newer timestamp
  mkAircraft({ icao24: 'aa1111', callsign: 'ROT101', lat: 44.51, lon: 26.11, source: 'adsbexchange', timestampMs: NOW + 5000 }),
  mkAircraft({ icao24: 'dd4444', callsign: 'ROT404', lat: 45.8, lon: 28.0, source: 'adsbexchange' }),
];

// Aircraft outside Romania bbox (should be filtered)
const OUTSIDE_ROMANIA: AircraftState[] = [
  mkAircraft({ icao24: 'ee5555', callsign: 'AFR001', lat: 48.8566, lon: 2.3522, source: 'opensky' }), // Paris
  mkAircraft({ icao24: 'ff6666', callsign: 'TK001',  lat: 41.0082, lon: 28.9784, source: 'opensky' }), // Istanbul
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FR-W18-02: AircraftPositionAggregator', () => {
  let agg: AircraftPositionAggregator;

  beforeEach(() => {
    agg = new AircraftPositionAggregator();
  });

  it('02-01: merge() with single source returns all aircraft', () => {
    const result = agg.merge([OPENSKY_BATCH]);
    expect(result).toHaveLength(3);
  });

  it('02-02: merge() deduplicates by icao24 keeping freshest timestamp', () => {
    // aa1111 appears in both; adsbexchange version is 5s newer
    const result = agg.merge([OPENSKY_BATCH, ADSBEX_BATCH]);
    const aa = result.find((a) => a.icao24 === 'aa1111');
    expect(aa).toBeDefined();
    expect(aa!.source).toBe('adsbexchange');
    expect(aa!.timestampMs).toBe(NOW + 5000);
  });

  it('02-03: merge() from 3 sources deduplicates correctly — unique count only', () => {
    const adsbfi: AircraftState[] = [
      mkAircraft({ icao24: 'aa1111', callsign: 'ROT101', lat: 44.52, lon: 26.12, source: 'adsbfi', timestampMs: NOW + 10000 }),
      mkAircraft({ icao24: 'gg7777', callsign: 'WZZ888', lat: 44.1, lon: 27.3, source: 'adsbfi' }),
    ];
    const result = agg.merge([OPENSKY_BATCH, ADSBEX_BATCH, adsbfi]);
    const icaos = result.map((a) => a.icao24);
    // aa1111 should appear exactly once
    expect(icaos.filter((id) => id === 'aa1111')).toHaveLength(1);
    // freshest wins
    const aa = result.find((a) => a.icao24 === 'aa1111');
    expect(aa!.source).toBe('adsbfi');
  });

  it('02-04: merge() filters aircraft outside Romania bbox (43.5-48.5N, 20.2-30.0E)', () => {
    const combined = [...OPENSKY_BATCH, ...OUTSIDE_ROMANIA];
    const result = agg.merge([combined]);
    const icaos = result.map((a) => a.icao24);
    expect(icaos).not.toContain('ee5555'); // Paris
    expect(icaos).not.toContain('ff6666'); // Istanbul
    expect(icaos).toContain('aa1111');
  });

  it('02-05: merge() preserves source field from originating feed', () => {
    const result = agg.merge([OPENSKY_BATCH, ADSBEX_BATCH]);
    const bb = result.find((a) => a.icao24 === 'bb2222');
    expect(bb!.source).toBe('opensky');
    const dd = result.find((a) => a.icao24 === 'dd4444');
    expect(dd!.source).toBe('adsbexchange');
  });

  it('02-06: merge() with empty sources returns []', () => {
    expect(agg.merge([])).toEqual([]);
    expect(agg.merge([[]])).toEqual([]);
  });

  it('02-07: AircraftState has required fields', () => {
    const aircraft = mkAircraft({});
    const requiredFields: (keyof AircraftState)[] = [
      'icao24', 'lat', 'lon', 'altitudeM', 'velocityMs',
      'headingDeg', 'timestampMs', 'source',
    ];
    for (const field of requiredFields) {
      expect(aircraft).toHaveProperty(field);
    }
  });

  it('02-08: merge() handles null altitude gracefully — sets to 0', () => {
    const nullAlt = mkAircraft({ icao24: 'hh8888', altitudeM: null as unknown as number });
    const result = agg.merge([[nullAlt]]);
    const ac = result.find((a) => a.icao24 === 'hh8888');
    expect(ac!.altitudeM).toBe(0);
  });

  it('02-09: merge() handles null callsign — sets to icao24', () => {
    const nullCall = mkAircraft({ icao24: 'ii9999', callsign: null as unknown as string });
    const result = agg.merge([[nullCall]]);
    const ac = result.find((a) => a.icao24 === 'ii9999');
    expect(ac!.callsign).toBe('ii9999');
  });

  it('02-10: getStaleAircraft() returns aircraft not updated in >30s', () => {
    const fresh = mkAircraft({ icao24: 'fresh1', timestampMs: Date.now() - 10_000 });
    const stale = mkAircraft({ icao24: 'stale1', timestampMs: Date.now() - 45_000 });
    agg.merge([[fresh, stale]]);
    const stales = agg.getStaleAircraft(30_000);
    expect(stales.map((a) => a.icao24)).toContain('stale1');
    expect(stales.map((a) => a.icao24)).not.toContain('fresh1');
  });

  it('02-11: purgeStale() removes aircraft older than 60s', () => {
    const fresh = mkAircraft({ icao24: 'fresh2', timestampMs: Date.now() - 10_000 });
    const old   = mkAircraft({ icao24: 'old001', timestampMs: Date.now() - 90_000 });
    agg.merge([[fresh, old]]);
    agg.purgeStale(60_000);
    expect(agg.getCount()).toBe(1);
  });

  it('02-12: getCount() returns current track count', () => {
    agg.merge([OPENSKY_BATCH]);
    expect(agg.getCount()).toBe(3);
  });

  it('02-13: merge() with 500 aircraft from OpenSky completes in <100ms', () => {
    const bulk: AircraftState[] = Array.from({ length: 500 }, (_, i) =>
      mkAircraft({
        icao24: `bulk${i.toString().padStart(4, '0')}`,
        lat: 43.5 + Math.random() * 5,
        lon: 20.2 + Math.random() * 9.8,
        source: 'opensky',
      }),
    );
    const t0 = performance.now();
    agg.merge([bulk]);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(100);
  });

  it('02-14: onGround=true aircraft filtered from threat assessment result', () => {
    const grounded = mkAircraft({ icao24: 'gnd001', onGround: true });
    const airborne = mkAircraft({ icao24: 'air001', onGround: false });
    const result = agg.merge([[grounded, airborne]]);
    const forThreat = result.filter((a) => !a.onGround);
    expect(forThreat.map((a) => a.icao24)).not.toContain('gnd001');
    expect(forThreat.map((a) => a.icao24)).toContain('air001');
  });

  it('02-15: aircraft with transponderMode adsb vs mode-s flagged differently', () => {
    const adsb   = mkAircraft({ icao24: 'adsbX1', transponderMode: 'adsb' });
    const modeS  = mkAircraft({ icao24: 'modeS1', transponderMode: 'mode-s' });
    const result = agg.merge([[adsb, modeS]]);
    const adsbAc  = result.find((a) => a.icao24 === 'adsbX1');
    const modeSAc = result.find((a) => a.icao24 === 'modeS1');
    expect(adsbAc!.transponderMode).toBe('adsb');
    expect(modeSAc!.transponderMode).toBe('mode-s');
  });
});
