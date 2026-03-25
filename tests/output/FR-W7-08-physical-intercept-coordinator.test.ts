// APEX-SENTINEL — W7 Physical Intercept Coordinator Tests
// FR-W7-08 | tests/output/FR-W7-08-physical-intercept-coordinator.test.ts
// Selects nearest SkyNet unit and issues fire commands based on impact predictions

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PhysicalInterceptCoordinator,
  SkyNetFireCommand,
  SkyNetActivationEvent,
  SkyNetUnitRegistry,
} from '../../src/output/physical-intercept-coordinator.js';
import type { ImpactEstimate } from '../../src/prediction/types.js';

function makeImpact(overrides: Partial<ImpactEstimate & { timeToImpactS?: number }> = {}): ImpactEstimate & { timeToImpactS: number } {
  return {
    lat: 51.510,
    lon: 4.907,
    timeToImpactSeconds: 20,
    confidence: 0.85,
    timeToImpactS: 20,
    ...overrides,
  };
}

const REGISTRY_3_UNITS: SkyNetUnitRegistry = [
  { unitId: 'SKY-01', lat: 51.500, lon: 4.900 },
  { unitId: 'SKY-02', lat: 51.520, lon: 4.920 },
  { unitId: 'SKY-03', lat: 51.490, lon: 4.880 },
];

describe('FR-W7-08: PhysicalInterceptCoordinator', () => {
  let coordinator: PhysicalInterceptCoordinator;

  beforeEach(() => {
    coordinator = new PhysicalInterceptCoordinator(REGISTRY_3_UNITS);
  });

  // AC-01: constructor accepts SkyNetUnitRegistry
  it('AC-01: Constructor accepts SkyNetUnitRegistry (array of {unitId, lat, lon})', () => {
    const instance = new PhysicalInterceptCoordinator(REGISTRY_3_UNITS);
    expect(instance).toBeTruthy();
  });

  // AC-02: plan returns null when confidence < 0.6
  it('AC-02: plan(impactPrediction) returns null when confidence < 0.6', () => {
    const impact = makeImpact({ confidence: 0.55 });
    const result = coordinator.plan(impact);
    expect(result).toBeNull();
  });

  // AC-03: plan returns SkyNetFireCommand when confidence >= 0.6
  it('AC-03: plan(impactPrediction) returns SkyNetFireCommand when confidence >= 0.6', () => {
    const impact = makeImpact({ confidence: 0.60 });
    const result = coordinator.plan(impact);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('unitId');
    expect(result).toHaveProperty('bearingDeg');
    expect(result).toHaveProperty('elevationDeg');
    expect(result).toHaveProperty('fireAtS');
  });

  // AC-04: SkyNetFireCommand has required shape
  it('AC-04: SkyNetFireCommand has {unitId, bearingDeg, elevationDeg, fireAtS}', () => {
    const impact = makeImpact({ confidence: 0.80 });
    const cmd = coordinator.plan(impact) as SkyNetFireCommand;
    expect(typeof cmd.unitId).toBe('string');
    expect(typeof cmd.bearingDeg).toBe('number');
    expect(typeof cmd.elevationDeg).toBe('number');
    expect(typeof cmd.fireAtS).toBe('number');
  });

  // AC-05: fireAtS = timeToImpactS - netFlightTimeS
  it('AC-05: fireAtS = timeToImpactS - netFlightTimeS (default netFlightTime=2.0)', () => {
    const impact = makeImpact({ confidence: 0.90, timeToImpactS: 20, timeToImpactSeconds: 20 });
    const cmd = coordinator.plan(impact) as SkyNetFireCommand;
    // Default netFlightTime = 2.0 => fireAtS = 20 - 2 = 18
    expect(cmd.fireAtS).toBe(18);
  });

  // AC-06: fireAtS is never negative
  it('AC-06: fireAtS is never negative (clamped to 0) even when timeToImpactS < netFlightTimeS', () => {
    const impact = makeImpact({ confidence: 0.90, timeToImpactS: 1, timeToImpactSeconds: 1 });
    const cmd = coordinator.plan(impact) as SkyNetFireCommand;
    expect(cmd.fireAtS).toBeGreaterThanOrEqual(0);
  });

  // AC-07: nearest SkyNet unit selected by haversine distance
  it('AC-07: nearest SkyNet unit selected by haversine distance to impact zone', () => {
    // Impact is at 51.510, 4.907
    // SKY-01: 51.500, 4.900 — closest
    // SKY-02: 51.520, 4.920 — farther
    // SKY-03: 51.490, 4.880 — farther
    const impact = makeImpact({ lat: 51.510, lon: 4.907, confidence: 0.90 });
    const cmd = coordinator.plan(impact) as SkyNetFireCommand;
    expect(cmd.unitId).toBe('SKY-01');
  });

  // AC-08: SkyNetFireCommand.bearingDeg is bearing from unit to impact point (0-360)
  it('AC-08: SkyNetFireCommand.bearingDeg is bearing from unit to impact point (0-360)', () => {
    const impact = makeImpact({ lat: 51.510, lon: 4.907, confidence: 0.90 });
    const cmd = coordinator.plan(impact) as SkyNetFireCommand;
    expect(cmd.bearingDeg).toBeGreaterThanOrEqual(0);
    expect(cmd.bearingDeg).toBeLessThan(360);
  });

  // AC-09: plan with empty registry returns null
  it('AC-09: plan() with empty registry returns null', () => {
    const emptyCoordinator = new PhysicalInterceptCoordinator([]);
    const impact = makeImpact({ confidence: 0.90 });
    const result = emptyCoordinator.plan(impact);
    expect(result).toBeNull();
  });

  // AC-10: plan with single unit returns that unit
  it('AC-10: plan() with single unit returns that unit', () => {
    const singleUnit: SkyNetUnitRegistry = [{ unitId: 'SKY-ONLY', lat: 51.50, lon: 4.90 }];
    const singleCoordinator = new PhysicalInterceptCoordinator(singleUnit);
    const impact = makeImpact({ confidence: 0.90 });
    const cmd = singleCoordinator.plan(impact) as SkyNetFireCommand;
    expect(cmd.unitId).toBe('SKY-ONLY');
  });

  // AC-11: SkyNetActivationEvent emitted when fire command issued
  it('AC-11: SkyNetActivationEvent emitted when fire command issued', () => {
    const events: SkyNetActivationEvent[] = [];
    coordinator.on('activation', (evt: SkyNetActivationEvent) => events.push(evt));

    const impact = makeImpact({ confidence: 0.85 });
    coordinator.plan(impact);

    expect(events.length).toBe(1);
    expect(typeof events[0].unitId).toBe('string');
    expect(typeof events[0].bearingDeg).toBe('number');
    expect(typeof events[0].timestampMs).toBe('number');
  });

  // AC-12: confidenceM > 500m → command issued but warningFlag=true
  it('AC-12: confidenceM > 500m → command still issued but warningFlag=true', () => {
    const impact = makeImpact({ confidence: 0.90 });
    // confidenceM represents the spatial uncertainty radius
    const cmd = coordinator.plan(impact, { confidenceM: 600 }) as SkyNetFireCommand;
    expect(cmd).not.toBeNull();
    expect(cmd.warningFlag).toBe(true);
  });
});
