// APEX-SENTINEL — Demo Dashboard API
// FR-W7-10 | src/ui/demo-dashboard/api.ts
//
// Pure API layer for the APEX-SENTINEL operator dashboard.
// Provides: track queries, alert queries, heatmap generation, SSE event formatting,
// operator token authentication, system status.
// No React/DOM dependency — testable in pure Node/Vitest environment.

export interface DashboardConfig {
  refreshRateMs: number;
  maxTracksDisplayed: number;
  heatmapResolution: number; // degrees per grid cell
}

export interface TrackRecord {
  id: string;
  lat: number;
  lon: number;
  classification: string;
  confidence: number;
  timestamp: number;
}

export interface AlertRecord {
  id: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: number;
}

/** [lat, lon, weight] tuple for heatmap renderers (e.g. Leaflet.heat) */
export type HeatmapPoint = [number, number, number];

export interface SseEvent<T = unknown> {
  type: 'track_update' | 'alert' | 'system_status';
  data: T;
}

export interface SystemStatus {
  natsConnected: boolean;
  activeNodes: number;
  tracksLast60s: number;
}

export interface AuthResult {
  valid: boolean;
}

const RECENT_TRACK_WINDOW_MS = 60_000;

export class DemoDashboardApi {
  readonly config: DashboardConfig;
  private tracks: TrackRecord[] = [];
  private alerts: AlertRecord[] = [];
  private validTokens = new Set<string>();

  constructor(config: DashboardConfig) {
    this.config = config;
  }

  // --- Test seeding helpers (underscore prefix = test-only) ---

  _seedTracks(tracks: TrackRecord[]): void {
    this.tracks = [...tracks];
  }

  _seedAlerts(alerts: AlertRecord[]): void {
    this.alerts = [...alerts];
  }

  _registerToken(token: string): void {
    this.validTokens.add(token);
  }

  // --- Query APIs ---

  /** Return tracks from the last 60 seconds, newest first. */
  getRecentTracks(now = Date.now()): TrackRecord[] {
    return this.tracks
      .filter(t => now - t.timestamp <= RECENT_TRACK_WINDOW_MS)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, this.config.maxTracksDisplayed);
  }

  /** Return the N most recent alerts, newest first. */
  getRecentAlerts(limit: number): AlertRecord[] {
    return [...this.alerts]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /** Format a TrackRecord for Leaflet map rendering. */
  formatTrackForMap(track: TrackRecord): Pick<TrackRecord, 'lat' | 'lon' | 'classification' | 'confidence' | 'timestamp'> {
    return {
      lat: track.lat,
      lon: track.lon,
      classification: track.classification,
      confidence: track.confidence,
      timestamp: track.timestamp,
    };
  }

  /** Format an AlertRecord for the operator log display. */
  formatAlertForLog(alert: AlertRecord): Pick<AlertRecord, 'id' | 'message' | 'severity' | 'timestamp'> {
    return {
      id: alert.id,
      message: alert.message,
      severity: alert.severity,
      timestamp: alert.timestamp,
    };
  }

  /**
   * Build a heatmap dataset from a track array.
   * Bins tracks into grid cells of `heatmapResolution` degrees.
   * Returns [lat, lon, weight] tuples suitable for Leaflet.heat.
   */
  buildHeatmapData(tracks: TrackRecord[]): HeatmapPoint[] {
    const res = this.config.heatmapResolution;
    const cellMap = new Map<string, { lat: number; lon: number; weight: number }>();

    for (const t of tracks) {
      const cellLat = Math.round(t.lat / res) * res;
      const cellLon = Math.round(t.lon / res) * res;
      const key = `${cellLat.toFixed(6)},${cellLon.toFixed(6)}`;
      const existing = cellMap.get(key);
      if (existing) {
        existing.weight += t.confidence;
      } else {
        cellMap.set(key, { lat: cellLat, lon: cellLon, weight: t.confidence });
      }
    }

    return Array.from(cellMap.values()).map(
      ({ lat, lon, weight }) => [lat, lon, weight] as HeatmapPoint
    );
  }

  /** Validate an operator token. */
  authenticateOperator(params: { token: string }): AuthResult {
    return { valid: this.validTokens.has(params.token) };
  }

  /** Return high-level system health status. */
  getSystemStatus(now = Date.now()): SystemStatus {
    return {
      natsConnected: true, // mock: actual integration wired by NatsClient
      activeNodes: 0,
      tracksLast60s: this.getRecentTracks(now).length,
    };
  }

  /** Format a typed SSE event for streaming to browser clients. */
  buildSseEvent<T>(type: SseEvent['type'], data: T): SseEvent<T> {
    return { type, data };
  }
}
