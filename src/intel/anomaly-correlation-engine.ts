// APEX-SENTINEL — W11 AnomalyCorrelationEngine
// FR-W11-02 | src/intel/anomaly-correlation-engine.ts

// ── Types ────────────────────────────────────────────────────────────────────

export interface DetectionEvent {
  lat: number;
  lon: number;
  ts: number;
  altFt?: number;
  adsbPresent?: boolean;
  remoteIdPresent?: boolean;
  acousticPresent?: boolean;
  droneType?: string;
  source?: string;
}

export type AnomalyType =
  | 'transponder_off_pattern'
  | 'unusual_flight_path'
  | 'altitude_drop_terminal';

export interface AnomalyResult {
  anomalyType: AnomalyType;
  confidence: number;
  correlatedSources: string[];
  ts: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ALT_DROP_THRESHOLD_FT = 500;
const ALT_DROP_TIME_MS = 30000; // 30 seconds

// ── AnomalyCorrelationEngine ─────────────────────────────────────────────────

export class AnomalyCorrelationEngine {
  /**
   * Detects anomalies in a stream of detection events.
   * Returns array of AnomalyResult for each anomaly found.
   */
  detectAnomalies(events: DetectionEvent[]): AnomalyResult[] {
    const results: AnomalyResult[] = [];

    for (const event of events) {
      // Transponder-off pattern: acoustic or remoteID present but no ADS-B
      const hasPresence = event.acousticPresent === true || event.remoteIdPresent === true;
      const noAdsb = event.adsbPresent === false || event.adsbPresent === undefined;

      if (hasPresence && noAdsb) {
        const sources: string[] = [];
        if (event.acousticPresent) sources.push('acoustic');
        if (event.remoteIdPresent) sources.push('remote_id');

        // Higher confidence when multiple sensors agree
        const confidence = sources.length >= 2 ? 0.85 : 0.65;

        results.push({
          anomalyType: 'transponder_off_pattern',
          confidence,
          correlatedSources: sources,
          ts: event.ts,
        });
      }
    }

    // Altitude drop terminal: scan consecutive event pairs
    for (let i = 0; i < events.length - 1; i++) {
      const prev = events[i];
      const curr = events[i + 1];

      if (prev.altFt === undefined || curr.altFt === undefined) continue;

      const timeDeltaMs = curr.ts - prev.ts;
      if (timeDeltaMs <= 0 || timeDeltaMs > ALT_DROP_TIME_MS) continue;

      const altDrop = prev.altFt - curr.altFt;
      if (altDrop > ALT_DROP_THRESHOLD_FT) {
        results.push({
          anomalyType: 'altitude_drop_terminal',
          confidence: 0.90,
          correlatedSources: ['altitude'],
          ts: curr.ts,
        });
      }
    }

    return results;
  }
}
