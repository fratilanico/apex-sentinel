// APEX-SENTINEL — W9 ThreatContextEnricher
// FR-W9-07 | src/detection/threat-context-enricher.ts

import { EventEmitter } from 'events';
import { type DetectionEvent } from './detection-engine.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ThreatContext {
  nearestAircraftKm: number | null;
  activeAlertLevel: string | null;
  weatherSnapshot: unknown | null;
  osintEventCount: number;
  remoteIdBeaconsNearby: number;
}

export interface EnrichedDetection {
  originalDetection: DetectionEvent;
  context: ThreatContext;
  contextScore: number;
  enrichedAt: string;
}

interface NatsClient {
  publish(subject: string, data: unknown): void;
  subscribe(subject: string, handler: (msg: unknown) => void): void;
}

interface FeedBroker {
  getFeedSnapshot(feedType: string): Promise<unknown>;
}

interface FeedSnapshot {
  adsb?: Array<{ icao?: string; lat?: number; lon?: number; squawk?: string; altFt?: number }>;
  weather?: { visibilityMeters?: number; windSpeedMps?: number } | null;
  alerts?: Array<{ level?: string; areaKm?: number; activeSince?: string }>;
  osint?: Array<{ lat?: number; lon?: number; ts?: string }>;
  remoteId?: Array<{ lat?: number; lon?: number; beaconId?: string; distanceM?: number }>;
}

const DEG_TO_KM = 111.0;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_KM;
  const cosLat = Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  const dLon = (lon2 - lon1) * DEG_TO_KM * cosLat;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

// ── ThreatContextEnricher ────────────────────────────────────────────────────

type BrokerArg = NatsClient & FeedBroker & { publish?(s: string, d: unknown): void };

export class ThreatContextEnricher extends EventEmitter {
  private readonly nats: NatsClient;
  private readonly feedBroker: FeedBroker;

  constructor(natsOrBroker: NatsClient | BrokerArg, feedBroker?: FeedBroker) {
    super();
    if (feedBroker !== undefined) {
      // Positional form: (nats, feedBroker)
      this.nats = natsOrBroker as NatsClient;
      this.feedBroker = feedBroker;
    } else {
      // Single-arg form: broker is both nats and feedBroker
      const broker = natsOrBroker as BrokerArg;
      this.nats = {
        publish: broker.publish?.bind(broker) ?? (() => {}),
        subscribe: (broker as unknown as NatsClient).subscribe?.bind(broker) ?? (() => {}),
      };
      this.feedBroker = broker as unknown as FeedBroker;
    }
  }

  /** Alias for enrichDetection — integration-test-friendly. */
  async enrich(detection: DetectionEvent): Promise<EnrichedDetection> {
    return this.enrichDetection(detection);
  }

  async start(): Promise<void> {
    this.nats.subscribe('detection.*', async (msg: unknown) => {
      const detection = msg as DetectionEvent;
      await this.enrichDetection(detection);
    });
  }

  async enrichDetection(detection: DetectionEvent): Promise<EnrichedDetection> {
    const TIMEOUT_MS = 200;

    const emptyContext: ThreatContext = {
      nearestAircraftKm: null,
      activeAlertLevel: null,
      weatherSnapshot: null,
      osintEventCount: 0,
      remoteIdBeaconsNearby: 0,
    };

    try {
      const timeoutPromise = new Promise<EnrichedDetection>((resolve) =>
        setTimeout(() => {
          resolve({
            originalDetection: detection,
            context: emptyContext,
            contextScore: -1,
            enrichedAt: new Date().toISOString(),
          });
        }, TIMEOUT_MS)
      );

      const enrichPromise = this.doEnrich(detection);

      const result = await Promise.race([enrichPromise, timeoutPromise]);
      this.nats.publish('detection.enriched', result);
      this.emit('enriched', result);
      return result;
    } catch {
      const fallback: EnrichedDetection = {
        originalDetection: detection,
        context: emptyContext,
        contextScore: -1,
        enrichedAt: new Date().toISOString(),
      };
      this.nats.publish('detection.enriched', fallback);
      this.emit('enriched', fallback);
      return fallback;
    }
  }

  private async doEnrich(detection: DetectionEvent): Promise<EnrichedDetection> {
    const snapshot = (await this.feedBroker.getFeedSnapshot('all')) as FeedSnapshot | null ?? {};

    const detLat = detection.lat ?? 0;
    const detLon = detection.lon ?? 0;

    let contextScore = 0;
    const context: ThreatContext = {
      nearestAircraftKm: null,
      activeAlertLevel: null,
      weatherSnapshot: null,
      osintEventCount: 0,
      remoteIdBeaconsNearby: 0,
    };

    // ADS-B: nearest aircraft + squawk 7700 within 2km → +30
    const adsbList = snapshot.adsb ?? [];
    if (adsbList.length > 0) {
      let minDist = Infinity;
      for (const ac of adsbList) {
        if (ac.lat != null && ac.lon != null) {
          const dist = haversineKm(detLat, detLon, ac.lat, ac.lon);
          if (dist < minDist) minDist = dist;
          if (dist <= 2 && ac.squawk === '7700') {
            contextScore += 30;
          }
        }
      }
      if (minDist !== Infinity) {
        context.nearestAircraftKm = minDist;
      }
    }

    // Alerts: CRITICAL → +40 (normalize level/severity, case-insensitive)
    const alertsList = snapshot.alerts ?? [];
    if (alertsList.length > 0) {
      for (const alert of alertsList) {
        const rawLevel = ((alert as Record<string, unknown>).level ?? (alert as Record<string, unknown>).severity ?? '') as string;
        const lvl = rawLevel.toUpperCase();
        if (lvl === 'CRITICAL') {
          contextScore += 40;
          context.activeAlertLevel = 'CRITICAL';
          break;
        }
      }
      if (!context.activeAlertLevel) {
        const rawLevel = ((alertsList[0] as Record<string, unknown>).level ?? (alertsList[0] as Record<string, unknown>).severity ?? null) as string | null;
        context.activeAlertLevel = rawLevel ?? null;
      }
    }

    // Weather: visibility <500m → +5
    const weather = snapshot.weather ?? null;
    if (weather) {
      context.weatherSnapshot = weather;
      if (weather.visibilityMeters != null && weather.visibilityMeters < 500) {
        contextScore += 5;
      }
    }

    // OSINT: >3 events → +10
    const osintList = snapshot.osint ?? [];
    context.osintEventCount = osintList.length;
    if (osintList.length > 3) {
      contextScore += 10;
    }

    // Remote ID beacons within 500m → +20
    const remoteIdList = snapshot.remoteId ?? [];
    const nearby = remoteIdList.filter(b => {
      if (b.distanceM != null) return b.distanceM <= 500;
      if (b.lat != null && b.lon != null) {
        return haversineKm(detLat, detLon, b.lat, b.lon) * 1000 <= 500;
      }
      return false;
    });
    context.remoteIdBeaconsNearby = nearby.length;
    if (nearby.length > 0) {
      contextScore += 20;
    }

    // Clamp 0-100
    contextScore = Math.max(0, Math.min(100, contextScore));

    return {
      originalDetection: detection,
      context,
      contextScore,
      enrichedAt: new Date().toISOString(),
    };
  }
}
