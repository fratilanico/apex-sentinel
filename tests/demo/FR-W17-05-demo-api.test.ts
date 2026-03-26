import { describe, it, expect, beforeEach } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { DemoApiExtensions } from '../../src/demo/demo-api-extensions.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(url: string, method = 'GET'): IncomingMessage {
  const req = new IncomingMessage(new Socket());
  req.url = url;
  req.method = method;
  return req;
}

function makeRes(): { res: ServerResponse; statusCode: () => number; body: () => string } {
  let captured = { statusCode: 200, body: '' };
  const res = {
    writeHead: (code: number) => { captured.statusCode = code; },
    end: (body: string) => { captured.body = body; },
    setHeader: () => {},
  } as unknown as ServerResponse;
  return {
    res,
    statusCode: () => captured.statusCode,
    body: () => captured.body,
  };
}

describe('FR-W17-05: DemoApiExtensions — /demo/* API endpoints', () => {
  let api: DemoApiExtensions;

  beforeEach(() => {
    api = new DemoApiExtensions();
  });

  // ── handles() ─────────────────────────────────────────────────────────────

  it('SC-01: handles GET /demo/scenarios', () => {
    expect(api.handles('/demo/scenarios', 'GET')).toBe(true);
  });

  it('SC-02: handles POST /demo/run/:name', () => {
    expect(api.handles('/demo/run/CHALLENGE_01_PERIMETER', 'POST')).toBe(true);
  });

  it('SC-03: handles GET /demo/scorecard', () => {
    expect(api.handles('/demo/scorecard', 'GET')).toBe(true);
  });

  it('SC-04: handles GET /demo/benchmark', () => {
    expect(api.handles('/demo/benchmark', 'GET')).toBe(true);
  });

  it('SC-05: handles GET /demo/coverage', () => {
    expect(api.handles('/demo/coverage', 'GET')).toBe(true);
  });

  it('SC-06: handles GET /demo/status', () => {
    expect(api.handles('/demo/status', 'GET')).toBe(true);
  });

  it('SC-07: does not handle /health', () => {
    expect(api.handles('/health', 'GET')).toBe(false);
  });

  // ── GET /demo/scenarios ───────────────────────────────────────────────────

  it('SC-08: GET /demo/scenarios returns 6 scenarios', async () => {
    const req = makeReq('/demo/scenarios');
    const { res, body } = makeRes();
    await api.handle(req, res);
    const json = JSON.parse(body());
    expect(json.count).toBe(6);
    expect(json.scenarios).toHaveLength(6);
  });

  // ── POST /demo/run/:name ──────────────────────────────────────────────────

  it('SC-09: POST /demo/run/CHALLENGE_01_PERIMETER returns 202', async () => {
    const req = makeReq('/demo/run/CHALLENGE_01_PERIMETER', 'POST');
    const { res, statusCode, body } = makeRes();
    await api.handle(req, res);
    expect(statusCode()).toBe(202);
    const json = JSON.parse(body());
    expect(json.accepted).toBe(true);
  });

  it('SC-10: POST /demo/run/UNKNOWN returns 400', async () => {
    const req = makeReq('/demo/run/UNKNOWN_SCENARIO', 'POST');
    const { res, statusCode } = makeRes();
    await api.handle(req, res);
    expect(statusCode()).toBe(400);
  });

  it('SC-11: POST /demo/run returns scenario name in response', async () => {
    const req = makeReq('/demo/run/NATO_AWNING_ESCALATION', 'POST');
    const { res, body } = makeRes();
    await api.handle(req, res);
    const json = JSON.parse(body());
    expect(json.scenario).toBe('NATO_AWNING_ESCALATION');
  });

  // ── GET /demo/scorecard ───────────────────────────────────────────────────

  it('SC-12: GET /demo/scorecard returns scorecard and score', async () => {
    const req = makeReq('/demo/scorecard');
    const { res, body } = makeRes();
    await api.handle(req, res);
    const json = JSON.parse(body());
    expect(Array.isArray(json.scorecard)).toBe(true);
    expect(typeof json.score.challenge01).toBe('number');
    expect(typeof json.score.challenge02).toBe('number');
    expect(typeof json.score.total).toBe('number');
  });

  it('SC-13: scorecard endpoint includes metCount', async () => {
    const req = makeReq('/demo/scorecard');
    const { res, body } = makeRes();
    await api.handle(req, res);
    const json = JSON.parse(body());
    expect(typeof json.metCount).toBe('number');
    expect(json.metCount).toBeGreaterThan(0);
  });

  // ── GET /demo/benchmark ───────────────────────────────────────────────────

  it('SC-14: GET /demo/benchmark runs and returns results', async () => {
    const req = makeReq('/demo/benchmark');
    const { res, body } = makeRes();
    await api.handle(req, res);
    const json = JSON.parse(body());
    expect(Array.isArray(json.results)).toBe(true);
    expect(json.results.length).toBeGreaterThan(0);
  }, 30000);

  // ── GET /demo/coverage ────────────────────────────────────────────────────

  it('SC-15: GET /demo/coverage returns geoJson and summary', async () => {
    const req = makeReq('/demo/coverage');
    const { res, body } = makeRes();
    await api.handle(req, res);
    const json = JSON.parse(body());
    expect(json.geoJson.type).toBe('FeatureCollection');
    expect(typeof json.summary.totalCells).toBe('number');
  });

  // ── GET /demo/status ──────────────────────────────────────────────────────

  it('SC-16: GET /demo/status returns system APEX-SENTINEL', async () => {
    const req = makeReq('/demo/status');
    const { res, body } = makeRes();
    await api.handle(req, res);
    const json = JSON.parse(body());
    expect(json.system).toBe('APEX-SENTINEL');
  });

  it('SC-17: GET /demo/status returns waveManifest stats', async () => {
    const req = makeReq('/demo/status');
    const { res, body } = makeRes();
    await api.handle(req, res);
    const json = JSON.parse(body());
    expect(typeof json.waveManifest.totalWaves).toBe('number');
    expect(json.waveManifest.totalWaves).toBeGreaterThanOrEqual(17);
  });

  it('SC-18: GET /demo/status returns eudisScore', async () => {
    const req = makeReq('/demo/status');
    const { res, body } = makeRes();
    await api.handle(req, res);
    const json = JSON.parse(body());
    expect(typeof json.eudisScore.total).toBe('number');
  });

  it('SC-19: GET /demo/status includes demoScenarios.available = 6', async () => {
    const req = makeReq('/demo/status');
    const { res, body } = makeRes();
    await api.handle(req, res);
    const json = JSON.parse(body());
    expect(json.demoScenarios.available).toBe(6);
  });

  it('SC-20: unknown path returns 404', async () => {
    const req = makeReq('/demo/unknown-path');
    const { res, statusCode } = makeRes();
    await api.handle(req, res);
    expect(statusCode()).toBe(404);
  });
});
