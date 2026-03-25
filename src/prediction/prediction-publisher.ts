// APEX-SENTINEL — Prediction Publisher
// W5 | src/prediction/prediction-publisher.ts
//
// Publishes PredictionResult to NATS JetStream + Supabase.
// NATS subject: sentinel.predictions.{trackId}
// Supabase: upsert to tracks table on conflict track_id.

import type { PredictionResult } from './types.js';

export interface PredictionPublisherConfig {
  natsClient: {
    jsPublish: (subject: string, payload: string) => Promise<{ ack: () => Promise<void> }>;
    isConnected: () => boolean;
  };
  supabaseClient: {
    from: (table: string) => {
      upsert: (data: unknown, options?: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  };
}

export class PredictionPublisher {
  private readonly nats: PredictionPublisherConfig['natsClient'];
  private readonly supabase: PredictionPublisherConfig['supabaseClient'];

  constructor(config: PredictionPublisherConfig) {
    this.nats = config.natsClient;
    this.supabase = config.supabaseClient;
  }

  async publishToNats(result: PredictionResult): Promise<void> {
    try {
      const processedAt = result.processedAt || Date.now();
      const payload = JSON.stringify({
        trackId: result.trackId,
        ekfState: result.ekfState,
        horizons: result.horizons ?? [],
        impactEstimate: result.impactEstimate,
        processedAt,
      });
      const pub = await this.nats.jsPublish(
        `sentinel.predictions.${result.trackId}`,
        payload
      );
      await pub.ack();
    } catch {
      // Swallow — prediction loop must not crash on NATS errors
    }
  }

  async publishToSupabase(result: PredictionResult): Promise<void> {
    try {
      const row = this.makeRow(result);
      await this.supabase.from('tracks').upsert(row, { onConflict: 'track_id' });
    } catch {
      // Swallow — NATS publish is independent
    }
  }

  async publishBatch(results: PredictionResult[]): Promise<void> {
    // Each publishToNats already swallows errors; one failure must not skip others
    for (const result of results) {
      await this.publishToNats(result);
    }
  }

  async publishBatchToSupabase(results: PredictionResult[]): Promise<void> {
    try {
      const rows = results.map((r) => this.makeRow(r));
      await this.supabase.from('tracks').upsert(rows, { onConflict: 'track_id' });
    } catch {
      // Swallow
    }
  }

  private makeRow(result: PredictionResult): Record<string, unknown> {
    return {
      track_id: result.trackId,
      ekf_state: result.ekfState,
      predicted_trajectory: result.horizons ?? [],
      prediction_updated_at: new Date().toISOString(),
    };
  }
}
