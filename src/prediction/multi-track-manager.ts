// APEX-SENTINEL — Multi-Track EKF Manager
// W5 | src/prediction/multi-track-manager.ts
//
// Manages one EKFInstance + PolynomialPredictor per active track.
// Tracks are pruned after dropoutSeconds of no detections (dropStale).
// bootstrapFromSupabase pre-seeds confirmed tracks on startup.

import { EKFInstance } from './ekf.js';
import { PolynomialPredictor } from './polynomial-predictor.js';
import { ImpactEstimator } from './impact-estimator.js';
import type {
  DetectionInput,
  EKFState,
  EKFStateSnapshot,
  PredictionResult,
} from './types.js';

interface TrackEntry {
  ekf: EKFInstance;
  predictor: PolynomialPredictor;
  lastSeen: number;      // wall-clock ms (Date.now())
  lastTimestamp: number; // detection.timestamp
}

export interface MultiTrackEKFManagerConfig {
  dropoutSeconds: number;
  supabaseClient: {
    from: (table: string) => {
      select: (cols: string) => {
        limit: (n: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
      };
    };
  };
}

const DEFAULT_QC = 0.1;
const CONFIDENCE_LAMBDA = 0.07;

export class MultiTrackEKFManager {
  private readonly tracks = new Map<string, TrackEntry>();
  private readonly dropoutMs: number;
  private readonly supabase: MultiTrackEKFManagerConfig['supabaseClient'];
  private readonly impactEstimator = new ImpactEstimator({ confidenceGate: 0.4 });

  constructor(config: MultiTrackEKFManagerConfig) {
    this.dropoutMs = config.dropoutSeconds * 1000;
    this.supabase = config.supabaseClient;
  }

  processDetection(det: DetectionInput): PredictionResult {
    let entry = this.tracks.get(det.trackId);

    if (!entry) {
      entry = {
        ekf: new EKFInstance({ qc: DEFAULT_QC }),
        predictor: new PolynomialPredictor({ lambda: CONFIDENCE_LAMBDA }),
        lastSeen: Date.now(),
        lastTimestamp: det.timestamp,
      };
      this.tracks.set(det.trackId, entry);

      // First detection: auto-initialize EKF, no predict step
      this.updateTrackWithMeasurement(entry, det);
      entry.predictor.addSnapshot(this.toSnapshot(entry, det));

      return this.buildResult(det.trackId, entry, det.confidence);
    }

    // Subsequent detection: predict forward then update
    const dt = Math.max(0, (det.timestamp - entry.lastTimestamp) / 1000);
    if (dt > 0) {
      entry.ekf.predict(dt);
    }
    this.updateTrackWithMeasurement(entry, det);
    entry.predictor.addSnapshot(this.toSnapshot(entry, det));
    entry.lastSeen = Date.now();
    entry.lastTimestamp = det.timestamp;

    return this.buildResult(det.trackId, entry, det.confidence);
  }

  /** Separated so FR-W5-11-03 spy can verify coast doesn't call it */
  private updateTrackWithMeasurement(entry: TrackEntry, det: DetectionInput): void {
    entry.ekf.update({ lat: det.lat, lon: det.lon, alt: det.alt });
    entry.lastSeen = Date.now();
    entry.lastTimestamp = det.timestamp;
  }

  coastTrack(trackId: string, dt: number): void {
    const entry = this.tracks.get(trackId);
    if (!entry) {
      console.warn(`coastTrack: unknown trackId ${trackId}`);
      return;
    }
    entry.ekf.predict(dt);
    // Advance lastTimestamp so subsequent processDetection doesn't double-predict
    entry.lastTimestamp += dt * 1000;
  }

  dropStale(): string[] {
    const now = Date.now();
    const dropped: string[] = [];
    for (const [id, entry] of this.tracks) {
      if (now - entry.lastSeen >= this.dropoutMs) {
        this.tracks.delete(id);
        dropped.push(id);
      }
    }
    return dropped;
  }

  getActiveTracks(): string[] {
    return Array.from(this.tracks.keys());
  }

  getTrackState(trackId: string): EKFStateSnapshot | null {
    const entry = this.tracks.get(trackId);
    if (!entry) return null;
    return { ...entry.ekf.getState(), timestamp: entry.lastTimestamp };
  }

  getTrackCovariance(trackId: string): number[][] | null {
    const entry = this.tracks.get(trackId);
    if (!entry) return null;
    return entry.ekf.getCovariance();
  }

  async bootstrapFromSupabase(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('tracks')
        .select('track_id,lat,lon,alt')
        .limit(1000);
      if (error || !data) return;
      for (const row of data) {
        const trackId = row.track_id as string;
        if (this.tracks.has(trackId)) continue;
        const det: DetectionInput = {
          trackId,
          lat: row.lat as number,
          lon: row.lon as number,
          alt: row.alt as number,
          timestamp: Date.now(),
          confidence: 0.9,
        };
        const entry: TrackEntry = {
          ekf: new EKFInstance({ qc: DEFAULT_QC }),
          predictor: new PolynomialPredictor({ lambda: CONFIDENCE_LAMBDA }),
          lastSeen: Date.now(),
          lastTimestamp: det.timestamp,
        };
        this.tracks.set(trackId, entry);
        this.updateTrackWithMeasurement(entry, det);
        entry.predictor.addSnapshot(this.toSnapshot(entry, det));
      }
    } catch {
      // Swallow — bootstrap is best-effort
    }
  }

  private toSnapshot(entry: TrackEntry, det: DetectionInput): EKFStateSnapshot {
    return {
      ...entry.ekf.getState(),
      timestamp: det.timestamp,
    };
  }

  private buildResult(
    trackId: string,
    entry: TrackEntry,
    detectionConfidence: number
  ): PredictionResult {
    const ekfRaw = entry.ekf.getState();
    const ekfState: EKFState = {
      ...ekfRaw,
      confidence: detectionConfidence,
      timestamp: entry.lastTimestamp,
    };
    const horizons = entry.predictor.predict();
    const impactEstimate = this.impactEstimator.estimate(ekfState);

    return {
      trackId,
      ekfState,
      horizons,
      impactEstimate,
      processedAt: Date.now(),
    };
  }
}
