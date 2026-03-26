// APEX-SENTINEL — W11 OsintCorrelationEngine
// FR-W11-01 | src/intel/osint-correlation-engine.ts

// ── Types ────────────────────────────────────────────────────────────────────

export interface OsintEvent {
  lat: number;
  lon: number;
  ts: number;
  goldsteinScale?: number;
  eventType?: string;
}

export interface DetectionEvent {
  lat: number;
  lon: number;
  ts: number;
  droneType?: string;
  source?: string;
  altFt?: number;
  adsbPresent?: boolean;
  remoteIdPresent?: boolean;
  acousticPresent?: boolean;
}

export interface OsintCorrelationResult {
  correlatedEvents: OsintEvent[];
  temporalWeight: number;   // max weight among correlated events (0, 0.5, or 1.0)
  spatialDensity: number;   // weighted sum of correlated event counts
}

// ── Constants ────────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;
const MAX_DISTANCE_KM = 50;
const H6 = 6 * 60 * 60 * 1000;    // 6 hours in ms
const H24 = 24 * 60 * 60 * 1000;  // 24 hours in ms
const CONFLICT_GOLDSTEIN_THRESHOLD = -5;
const CONFLICT_WEIGHT_MULTIPLIER = 3;

// ── Haversine ────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = EARTH_RADIUS_KM;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function temporalWeight(eventTs: number, nowTs: number): number {
  const age = nowTs - eventTs;
  if (age < 0) return 1.0;      // future events (clock skew) treated as current
  if (age <= H6) return 1.0;
  if (age <= H24) return 0.5;
  return 0.0;
}

// ── OsintCorrelationEngine ───────────────────────────────────────────────────

export class OsintCorrelationEngine {
  /**
   * Correlates OSINT events with a detection event.
   *
   * - Spatial: events within 50km (haversine) of detection
   * - Temporal: 0-6h → weight 1.0, 6-24h → weight 0.5, >24h → excluded
   * - Goldstein: scale < -5 → 3× weight multiplier
   */
  correlate(detection: DetectionEvent, osintEvents: OsintEvent[]): OsintCorrelationResult {
    const nowTs = detection.ts;
    const correlated: OsintEvent[] = [];
    let maxTemporalWeight = 0;
    let weightedSum = 0;

    for (const event of osintEvents) {
      const tw = temporalWeight(event.ts, nowTs);
      if (tw === 0) continue; // exclude >24h

      const distKm = haversineKm(detection.lat, detection.lon, event.lat, event.lon);
      if (distKm > MAX_DISTANCE_KM) continue;

      // Goldstein weight multiplier
      const goldsteinMultiplier =
        event.goldsteinScale !== undefined && event.goldsteinScale < CONFLICT_GOLDSTEIN_THRESHOLD
          ? CONFLICT_WEIGHT_MULTIPLIER
          : 1;

      correlated.push(event);

      if (tw > maxTemporalWeight) maxTemporalWeight = tw;
      weightedSum += tw * goldsteinMultiplier;
    }

    return {
      correlatedEvents: correlated,
      temporalWeight: maxTemporalWeight,
      spatialDensity: weightedSum,
    };
  }
}
