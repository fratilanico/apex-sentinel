// APEX-SENTINEL — Physical Intercept Coordinator
// FR-W7-08 | src/output/physical-intercept-coordinator.ts
//
// Selects the nearest SkyNet interceptor unit and generates fire commands
// based on EKF impact predictions. Integrates with 3-Layer Protection Stack.
//
// SkyNet = networked kinetic interceptors deployed around defended position.
// Fire timing: fireAtS = timeToImpactS - netFlightTimeS (default 2.0s).
// Confidence gate: < 0.6 → no command (too uncertain for kinetic engagement).

import type { ImpactEstimate } from '../prediction/types.js';

const DEG2RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6371000;

export interface SkyNetUnit {
  unitId: string;
  lat: number;
  lon: number;
}

export type SkyNetUnitRegistry = SkyNetUnit[];

export interface SkyNetFireCommand {
  unitId: string;
  bearingDeg: number;
  elevationDeg: number;
  fireAtS: number;
  warningFlag?: boolean;
}

export interface SkyNetActivationEvent {
  unitId: string;
  bearingDeg: number;
  timestampMs: number;
}

interface PlanOptions {
  /** Spatial uncertainty radius in meters. >500m sets warningFlag. */
  confidenceM?: number;
  /** Intercept flight time in seconds. Default: 2.0. */
  netFlightTimeS?: number;
}

type CoordEventName = 'activation';
type ActivationListener = (event: SkyNetActivationEvent) => void;

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const dLon = (toLon - fromLon) * DEG2RAD;
  const y = Math.sin(dLon) * Math.cos(toLat * DEG2RAD);
  const x =
    Math.cos(fromLat * DEG2RAD) * Math.sin(toLat * DEG2RAD) -
    Math.sin(fromLat * DEG2RAD) * Math.cos(toLat * DEG2RAD) * Math.cos(dLon);
  return ((Math.atan2(y, x) / DEG2RAD) + 360) % 360;
}

export class PhysicalInterceptCoordinator {
  private readonly registry: SkyNetUnitRegistry;
  private readonly listeners = new Map<CoordEventName, ActivationListener[]>();

  constructor(registry: SkyNetUnitRegistry) {
    this.registry = registry;
  }

  /**
   * Plan a fire command for the nearest SkyNet unit.
   * Returns null when: registry is empty, confidence < 0.6, or no valid unit exists.
   */
  plan(
    impact: ImpactEstimate & { timeToImpactS?: number },
    options: PlanOptions = {}
  ): SkyNetFireCommand | null {
    if (this.registry.length === 0) return null;
    if (impact.confidence < 0.6) return null;

    const netFlightTimeS = options.netFlightTimeS ?? 2.0;
    const timeToImpactS = impact.timeToImpactS ?? impact.timeToImpactSeconds;

    // Select nearest unit by haversine distance
    let nearest = this.registry[0];
    let nearestDist = haversineM(nearest.lat, nearest.lon, impact.lat, impact.lon);

    for (const unit of this.registry.slice(1)) {
      const dist = haversineM(unit.lat, unit.lon, impact.lat, impact.lon);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = unit;
      }
    }

    const bearing = bearingDeg(nearest.lat, nearest.lon, impact.lat, impact.lon);
    const fireAtS = Math.max(0, timeToImpactS - netFlightTimeS);
    const warningFlag = (options.confidenceM ?? 0) > 500;

    const cmd: SkyNetFireCommand = {
      unitId: nearest.unitId,
      bearingDeg: bearing,
      elevationDeg: 0, // elevation estimator not yet implemented
      fireAtS,
      ...(warningFlag ? { warningFlag: true } : {}),
    };

    this.emit('activation', {
      unitId: nearest.unitId,
      bearingDeg: bearing,
      timestampMs: Date.now(),
    });

    return cmd;
  }

  on(event: CoordEventName, listener: ActivationListener): void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);
  }

  private emit(event: CoordEventName, payload: SkyNetActivationEvent): void {
    const ls = this.listeners.get(event) ?? [];
    for (const l of ls) l(payload);
  }
}
