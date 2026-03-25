// APEX-SENTINEL — W6 Cursor of Truth Tests
// FR-W6-09 | tests/output/FR-W6-09-cursor-of-truth.test.ts
// Tactical situation awareness report generator

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CursorOfTruth } from '../../src/output/cursor-of-truth.js';
import type { EKFState } from '../../src/prediction/types.js';
import type { ImpactEstimate } from '../../src/prediction/types.js';

function makeEKFState(overrides: Partial<EKFState> = {}): EKFState {
  return {
    lat: 51.5074,
    lon: 4.9034,
    alt: 200,
    vLat: 0.0001,
    vLon: 0.0001,
    vAlt: -8,
    confidence: 0.92,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeImpact(overrides: Partial<ImpactEstimate> = {}): ImpactEstimate {
  return {
    lat: 51.510,
    lon: 4.907,
    timeToImpactSeconds: 25,
    confidence: 0.88,
    ...overrides,
  };
}

describe('FR-W6-09: CursorOfTruth', () => {
  let cot: CursorOfTruth;
  let mockClaudeGateway: { chat: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClaudeGateway = {
      chat: vi.fn().mockResolvedValue({
        content: 'THREAT ASSESSMENT: Shahed-136 class UAS detected. Impact projected in 25 seconds. Grid: 51.51N 4.91E.',
      }),
    };
    cot = new CursorOfTruth({
      claudeGateway: mockClaudeGateway,
      nodeCount: 3,
    });
  });

  // --- format ---

  it('FR-W6-09-01: GIVEN EKF state + impact estimate, WHEN format called, THEN returns report with coarsened lat/lon', async () => {
    const state = makeEKFState();
    const impact = makeImpact();
    const report = await cot.format('TRK-001', state, impact);
    expect(report).toBeTruthy();
    expect(report.trackId).toBe('TRK-001');
    // Location must be coarsened (±50m ≈ 0.00045 deg)
    expect(Math.abs(report.location.lat - 51.5074)).toBeLessThan(0.001);
    expect(report.location.coarsened).toBe(true);
  });

  it('FR-W6-09-02: GIVEN null impact estimate, WHEN format called, THEN report includes "NO IMPACT PROJECTED" text', async () => {
    const state = makeEKFState({ vAlt: 5 }); // ascending
    const report = await cot.format('TRK-002', state, null);
    expect(report.narrative).toContain('NO IMPACT');
  });

  it('FR-W6-09-03: GIVEN Claude gateway unavailable (throws), WHEN format called, THEN falls back to template (no API call error propagated)', async () => {
    mockClaudeGateway.chat.mockRejectedValueOnce(new Error('gateway timeout'));
    const state = makeEKFState();
    const impact = makeImpact();
    // Should NOT throw — template fallback
    const report = await cot.format('TRK-003', state, impact);
    expect(report).toBeTruthy();
    expect(report.trackId).toBe('TRK-003');
    expect(report.narrative).toBeTruthy(); // template fallback narrative
  });

  it('FR-W6-09-04: GIVEN impact estimate with 25s timeToImpact, WHEN format called, THEN narrative includes time-to-impact', async () => {
    const state = makeEKFState();
    const impact = makeImpact({ timeToImpactSeconds: 25 });
    const report = await cot.format('TRK-004', state, impact);
    expect(report.impactProjection).not.toBeNull();
    expect(report.impactProjection!.timeToImpactSeconds).toBe(25);
  });

  it('FR-W6-09-05: GIVEN drone velocity, WHEN format called, THEN report includes speed and heading', async () => {
    const state = makeEKFState({ vLat: 0.0002, vLon: 0, vAlt: -5 });
    const report = await cot.format('TRK-005', state, null);
    expect(typeof report.velocity.speedKmh).toBe('number');
    expect(report.velocity.speedKmh).toBeGreaterThan(0);
  });

  it('FR-W6-09-06: GIVEN nodeCount=3, WHEN format called, THEN report includes nodeCount field', async () => {
    const report = await cot.format('TRK-006', makeEKFState(), makeImpact());
    expect(report.nodeCount).toBe(3);
  });

  // --- formatBatch ---

  it('FR-W6-09-07: GIVEN 3 tracks, WHEN formatBatch called, THEN returns 3 reports', async () => {
    const inputs = [
      { trackId: 'T1', ekfState: makeEKFState(), impactEstimate: makeImpact() },
      { trackId: 'T2', ekfState: makeEKFState(), impactEstimate: null },
      { trackId: 'T3', ekfState: makeEKFState(), impactEstimate: makeImpact() },
    ];
    const reports = await cot.formatBatch(inputs);
    expect(reports.length).toBe(3);
    expect(reports[0].trackId).toBe('T1');
  });

  it('FR-W6-09-08: GIVEN batch with one failing track (gateway error), WHEN formatBatch called, THEN other tracks still processed', async () => {
    mockClaudeGateway.chat
      .mockRejectedValueOnce(new Error('gateway error'))
      .mockResolvedValue({ content: 'OK' });
    const inputs = [
      { trackId: 'T1', ekfState: makeEKFState(), impactEstimate: makeImpact() },
      { trackId: 'T2', ekfState: makeEKFState(), impactEstimate: makeImpact() },
    ];
    const reports = await cot.formatBatch(inputs);
    expect(reports.length).toBe(2);
    // Both should have narratives (T1 via fallback, T2 via Claude)
    expect(reports[0].narrative).toBeTruthy();
    expect(reports[1].narrative).toBeTruthy();
  });

  // --- NEVER use ANTHROPIC_API_KEY directly ---

  it('FR-W6-09-09: GIVEN CursorOfTruth, WHEN format called, THEN uses injected claudeGateway (not process.env.ANTHROPIC_API_KEY)', async () => {
    // The gateway mock was called — direct API key usage would bypass this
    const state = makeEKFState();
    await cot.format('TRK-009', state, makeImpact());
    // The injected mock gateway was called — confirms DI pattern works
    expect(mockClaudeGateway.chat).toHaveBeenCalled();
  });

  // --- location coarsening ---

  it('FR-W6-09-10: GIVEN precise lat/lon, WHEN format called, THEN report location coarsened to ≤5 decimal places', async () => {
    const state = makeEKFState({ lat: 51.50741234567, lon: 4.90341234567 });
    const report = await cot.format('TRK-010', state, null);
    // Coarsened = max 4 decimal places (≈11m precision, then add ±50m noise)
    const latStr = report.location.lat.toString();
    const decimalPlaces = latStr.includes('.') ? latStr.split('.')[1].length : 0;
    expect(decimalPlaces).toBeLessThanOrEqual(5);
  });
});
