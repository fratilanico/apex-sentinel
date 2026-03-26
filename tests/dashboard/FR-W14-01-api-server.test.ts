import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DashboardApiServer } from '../../src/dashboard/dashboard-api-server.js';
import { DashboardStateStore } from '../../src/dashboard/dashboard-state-store.js';
import { SseStreamManager } from '../../src/dashboard/sse-stream-manager.js';
import { NodeHealthAggregator } from '../../src/dashboard/node-health-aggregator.js';
import { ApiRateLimiter } from '../../src/dashboard/api-rate-limiter.js';

// Helper: create mock request
function makeReq(method: string, url: string, ip = '127.0.0.1'): Partial<IncomingMessage> {
  const emitter = new EventEmitter();
  return {
    method,
    url,
    headers: { 'x-forwarded-for': ip },
    socket: { remoteAddress: ip } as any,
    on: emitter.on.bind(emitter),
  };
}

// Helper: capture response
function makeRes(): { res: Partial<ServerResponse>; body: () => unknown; statusCode: () => number; headers: () => Record<string, string> } {
  let capturedStatus = 200;
  let capturedBody = '';
  const capturedHeaders: Record<string, string> = {};
  const res: Partial<ServerResponse> = {
    writeHead: (status: number, headers?: Record<string, string>) => {
      capturedStatus = status;
      if (headers) Object.assign(capturedHeaders, headers);
    },
    write: (data: string) => { capturedBody += data; return true; },
    end: (data?: string) => { if (data) capturedBody += data; },
    setHeader: (key: string, val: string) => { capturedHeaders[key] = val; },
    on: new EventEmitter().on.bind(new EventEmitter()),
    get writableEnded() { return false; },
    socket: { remoteAddress: '127.0.0.1' } as any,
  };
  return {
    res,
    body: () => { try { return JSON.parse(capturedBody); } catch { return capturedBody; } },
    statusCode: () => capturedStatus,
    headers: () => capturedHeaders,
  };
}

describe('FR-W14-01: DashboardApiServer — REST endpoints', () => {
  let server: DashboardApiServer;
  let store: DashboardStateStore;
  let sse: SseStreamManager;
  let nodes: NodeHealthAggregator;
  let rateLimiter: ApiRateLimiter;
  let handler: (req: IncomingMessage, res: ServerResponse) => void;

  beforeEach(() => {
    store = new DashboardStateStore();
    sse = new SseStreamManager();
    nodes = new NodeHealthAggregator();
    rateLimiter = new ApiRateLimiter(1000, 1000); // high limit for tests
    server = new DashboardApiServer(store, sse, nodes, rateLimiter, { port: 18080, version: '14.0.0-test' });
    handler = server.createRequestHandler();
  });

  it('API-01: GET /health returns status ok', () => {
    const req = makeReq('GET', '/health');
    const { res, body } = makeRes();
    handler(req as IncomingMessage, res as ServerResponse);
    const b = body() as Record<string, unknown>;
    expect(b['status']).toBe('ok');
  });

  it('API-02: GET /health returns version', () => {
    const req = makeReq('GET', '/health');
    const { res, body } = makeRes();
    handler(req as IncomingMessage, res as ServerResponse);
    const b = body() as Record<string, unknown>;
    expect(b['version']).toBe('14.0.0-test');
  });

  it('API-03: GET /health returns uptime_s as number', () => {
    const req = makeReq('GET', '/health');
    const { res, body } = makeRes();
    handler(req as IncomingMessage, res as ServerResponse);
    const b = body() as Record<string, unknown>;
    expect(typeof b['uptime_s']).toBe('number');
  });

  it('API-04: GET /awning returns level and transitions', () => {
    store.update({ type: 'awning_update', level: 'YELLOW', reason: 'test' });
    const req = makeReq('GET', '/awning');
    const { res, body } = makeRes();
    handler(req as IncomingMessage, res as ServerResponse);
    const b = body() as Record<string, unknown>;
    expect(b['level']).toBe('YELLOW');
    expect(Array.isArray(b['transitions'])).toBe(true);
  });

  it('API-05: GET /detections returns detections array and count', () => {
    const req = makeReq('GET', '/detections');
    const { res, body } = makeRes();
    handler(req as IncomingMessage, res as ServerResponse);
    const b = body() as Record<string, unknown>;
    expect(Array.isArray(b['detections'])).toBe(true);
    expect(typeof b['count']).toBe('number');
  });

  it('API-06: GET /intel returns brief field', () => {
    const req = makeReq('GET', '/intel');
    const { res, body } = makeRes();
    handler(req as IncomingMessage, res as ServerResponse);
    const b = body() as Record<string, unknown>;
    expect(b).toHaveProperty('brief');
  });

  it('API-07: GET /nodes returns nodes array', () => {
    const req = makeReq('GET', '/nodes');
    const { res, body } = makeRes();
    handler(req as IncomingMessage, res as ServerResponse);
    const b = body() as Record<string, unknown>;
    expect(Array.isArray(b['nodes'])).toBe(true);
    expect((b['nodes'] as unknown[]).length).toBe(3);
  });

  it('API-08: unknown route returns 404', () => {
    const req = makeReq('GET', '/unknown-route');
    const { res, statusCode, body } = makeRes();
    handler(req as IncomingMessage, res as ServerResponse);
    expect(statusCode()).toBe(404);
    const b = body() as Record<string, unknown>;
    expect(b['error']).toBe('Not Found');
  });

  it('API-09: POST to known route returns 405', () => {
    const req = makeReq('POST', '/health');
    const { res, statusCode, body } = makeRes();
    handler(req as IncomingMessage, res as ServerResponse);
    expect(statusCode()).toBe(405);
    const b = body() as Record<string, unknown>;
    expect(b['error']).toBe('Method Not Allowed');
  });

  it('API-10: CORS header present on all responses', () => {
    const req = makeReq('GET', '/health');
    const { res, headers } = makeRes();
    handler(req as IncomingMessage, res as ServerResponse);
    expect(headers()['Access-Control-Allow-Origin']).toBe('*');
  });

  it('API-11: OPTIONS returns 204', () => {
    const req = makeReq('OPTIONS', '/health');
    const { res, statusCode } = makeRes();
    handler(req as IncomingMessage, res as ServerResponse);
    expect(statusCode()).toBe(204);
  });

  it('API-12: rate limiter triggers 429 when limit exceeded', () => {
    const strictLimiter = new ApiRateLimiter(2, 1);
    const strictServer = new DashboardApiServer(store, sse, nodes, strictLimiter);
    const strictHandler = strictServer.createRequestHandler();
    const ip = '10.0.0.100';
    for (let i = 0; i < 2; i++) {
      const req = makeReq('GET', '/health', ip);
      const { res } = makeRes();
      strictHandler(req as IncomingMessage, res as ServerResponse);
    }
    const req = makeReq('GET', '/health', ip);
    const { res, statusCode } = makeRes();
    strictHandler(req as IncomingMessage, res as ServerResponse);
    expect(statusCode()).toBe(429);
  });
});
