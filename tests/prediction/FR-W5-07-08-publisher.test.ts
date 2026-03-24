// APEX-SENTINEL — TDD RED Tests
// FR-W5-07: Prediction Publisher (NATS)
// FR-W5-08: Track Enrichment (Supabase)
// Status: RED — src/prediction/prediction-publisher.ts not yet implemented

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PredictionPublisher } from '../../src/prediction/prediction-publisher.js';
import type { PredictionResult, EKFState } from '../../src/prediction/types.js';

// ── Mock NATS JetStream client ────────────────────────────────────────────────

const mockJsPublish = vi.fn().mockResolvedValue({ ack: async () => {} });
const mockNatsClient = {
  jsPublish: mockJsPublish,
  isConnected: vi.fn().mockReturnValue(true),
};

// ── Mock Supabase client ──────────────────────────────────────────────────────

const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  upsert: mockUpsert,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEkfState(overrides: Partial<EKFState> = {}): EKFState {
  return {
    lat: 51.5,
    lon: -0.1,
    alt: 80,
    vLat: 1e-4,
    vLon: 0,
    vAlt: -1.5,
    confidence: 0.85,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeHorizons() {
  const base = Date.now();
  return [1, 2, 3, 5, 10].map((h) => ({
    horizonSeconds: h,
    lat: 51.5 + h * 1e-4,
    lon: -0.1,
    alt: Math.max(0, 80 - h * 1.5),
    confidence: Math.exp(-0.07 * h),
    timestamp: base + h * 1000,
  }));
}

function makePredictionResult(overrides: Partial<PredictionResult> = {}): PredictionResult {
  return {
    trackId: 'TRK-W5-001',
    ekfState: makeEkfState(),
    horizons: makeHorizons(),
    impactEstimate: null,
    processedAt: Date.now(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FR-W5-07: Prediction Publisher (NATS)
// ─────────────────────────────────────────────────────────────────────────────

describe('FR-W5-07-00: Prediction Publisher NATS', () => {
  let publisher: PredictionPublisher;

  beforeEach(() => {
    vi.clearAllMocks();
    publisher = new PredictionPublisher({
      natsClient: mockNatsClient as never,
      supabaseClient: mockSupabase as never,
    });
  });

  it('FR-W5-07-01: subject format is sentinel.predictions.{trackId}', async () => {
    const result = makePredictionResult({ trackId: 'TRK-ALPHA' });
    await publisher.publishToNats(result);
    expect(mockJsPublish).toHaveBeenCalledWith(
      'sentinel.predictions.TRK-ALPHA',
      expect.any(String)
    );
  });

  it('FR-W5-07-02: payload contains all required fields', async () => {
    const result = makePredictionResult();
    await publisher.publishToNats(result);
    const payload = JSON.parse(mockJsPublish.mock.calls[0][1] as string);
    expect(payload).toHaveProperty('trackId');
    expect(payload).toHaveProperty('ekfState');
    expect(payload).toHaveProperty('horizons');
    expect(payload).toHaveProperty('impactEstimate');
    expect(payload).toHaveProperty('processedAt');
  });

  it('FR-W5-07-03: publishToNats awaits NATS ack before returning', async () => {
    let ackResolved = false;
    mockJsPublish.mockResolvedValueOnce({
      ack: async () => {
        await new Promise((r) => setTimeout(r, 5));
        ackResolved = true;
      },
    });
    const result = makePredictionResult();
    await publisher.publishToNats(result);
    expect(ackResolved).toBe(true);
  });

  it('FR-W5-07-04: NATS publish error caught — does not crash prediction loop', async () => {
    mockJsPublish.mockRejectedValueOnce(new Error('NATS_CONN_LOST'));
    const result = makePredictionResult();
    await expect(publisher.publishToNats(result)).resolves.not.toThrow();
  });

  it('FR-W5-07-05: empty horizons serialized as [] not undefined', async () => {
    const result = makePredictionResult({ horizons: [] });
    await publisher.publishToNats(result);
    const payload = JSON.parse(mockJsPublish.mock.calls[0][1] as string);
    expect(Array.isArray(payload.horizons)).toBe(true);
    expect(payload.horizons).toHaveLength(0);
  });

  it('FR-W5-07-06: publishBatch — one track error does not skip other tracks', async () => {
    mockJsPublish
      .mockRejectedValueOnce(new Error('TRK-A NATS error'))
      .mockResolvedValue({ ack: async () => {} });

    const batch = [
      makePredictionResult({ trackId: 'TRK-A' }),
      makePredictionResult({ trackId: 'TRK-B' }),
      makePredictionResult({ trackId: 'TRK-C' }),
    ];
    await publisher.publishBatch(batch);
    // All 3 were attempted despite TRK-A failing
    expect(mockJsPublish).toHaveBeenCalledTimes(3);
  });

  it('FR-W5-07-07: processedAt is stamped in the payload', async () => {
    const before = Date.now();
    const result = makePredictionResult({ processedAt: undefined as unknown as number });
    await publisher.publishToNats(result);
    const payload = JSON.parse(mockJsPublish.mock.calls[0][1] as string);
    expect(typeof payload.processedAt).toBe('number');
    expect(payload.processedAt).toBeGreaterThanOrEqual(before);
  });

  it('FR-W5-07-08: tracks with empty horizons still published to NATS', async () => {
    const result = makePredictionResult({ horizons: [] });
    await publisher.publishToNats(result);
    expect(mockJsPublish).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-W5-08: Track Enrichment (Supabase)
// ─────────────────────────────────────────────────────────────────────────────

describe('FR-W5-08-00: Track Enrichment Supabase', () => {
  let publisher: PredictionPublisher;

  beforeEach(() => {
    vi.clearAllMocks();
    publisher = new PredictionPublisher({
      natsClient: mockNatsClient as never,
      supabaseClient: mockSupabase as never,
    });
  });

  it('FR-W5-08-01: predicted_trajectory JSONB contains 5 horizons', async () => {
    const result = makePredictionResult();
    await publisher.publishToSupabase(result);
    const upsertArg = mockUpsert.mock.calls[0][0] as Record<string, unknown>;
    const row = Array.isArray(upsertArg) ? upsertArg[0] : upsertArg;
    expect(Array.isArray(row.predicted_trajectory)).toBe(true);
    expect((row.predicted_trajectory as unknown[]).length).toBe(5);
  });

  it('FR-W5-08-02: prediction_updated_at updated on upsert (not null)', async () => {
    const result = makePredictionResult();
    await publisher.publishToSupabase(result);
    const upsertArg = mockUpsert.mock.calls[0][0] as Record<string, unknown>;
    const row = Array.isArray(upsertArg) ? upsertArg[0] : upsertArg;
    expect(row.prediction_updated_at).toBeTruthy();
  });

  it('FR-W5-08-03: ekf_state JSONB contains all 6 state components', async () => {
    const result = makePredictionResult();
    await publisher.publishToSupabase(result);
    const upsertArg = mockUpsert.mock.calls[0][0] as Record<string, unknown>;
    const row = Array.isArray(upsertArg) ? upsertArg[0] : upsertArg;
    const ekf = row.ekf_state as Record<string, unknown>;
    expect(ekf).toHaveProperty('lat');
    expect(ekf).toHaveProperty('lon');
    expect(ekf).toHaveProperty('alt');
    expect(ekf).toHaveProperty('vLat');
    expect(ekf).toHaveProperty('vLon');
    expect(ekf).toHaveProperty('vAlt');
  });

  it('FR-W5-08-04: upsert uses trackId as conflict key (onConflict: track_id)', async () => {
    const result = makePredictionResult();
    await publisher.publishToSupabase(result);
    // The upsert call should include conflict resolution on track_id
    const call = mockUpsert.mock.calls[0];
    const options = call[1] as Record<string, unknown>;
    expect(options?.onConflict).toBe('track_id');
  });

  it('FR-W5-08-05: batch upsert issues single API call for multiple tracks', async () => {
    const batch = Array.from({ length: 10 }, (_, i) =>
      makePredictionResult({ trackId: `TRK-${i}` })
    );
    await publisher.publishBatchToSupabase(batch);
    // Single upsert call with array of 10 rows
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const rows = mockUpsert.mock.calls[0][0] as unknown[];
    expect(rows).toHaveLength(10);
  });

  it('FR-W5-08-06: Supabase error does not affect NATS publish', async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: 'DB_TIMEOUT', code: '500' } });
    const result = makePredictionResult();
    // Both calls — NATS should still succeed even when Supabase fails
    await publisher.publishToNats(result);
    await expect(publisher.publishToSupabase(result)).resolves.not.toThrow();
    expect(mockJsPublish).toHaveBeenCalledTimes(1); // NATS not affected
  });

  it('FR-W5-08-07: upsert creates row if trackId missing in tracks table', async () => {
    // onConflict upsert should handle INSERT path when row doesn't exist
    // Just verify the upsert payload includes all required fields for a new row
    const result = makePredictionResult({ trackId: 'TRK-NEW-UNKNOWN' });
    await publisher.publishToSupabase(result);
    const upsertArg = mockUpsert.mock.calls[0][0] as Record<string, unknown>;
    const row = Array.isArray(upsertArg) ? upsertArg[0] : upsertArg;
    expect(row.track_id).toBe('TRK-NEW-UNKNOWN');
    expect(row.ekf_state).toBeDefined();
  });
});
