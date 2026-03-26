// FR-W14-01: DashboardApiServer — lightweight HTTP server

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { DashboardStateStore } from './dashboard-state-store.js';
import type { SseStreamManager } from './sse-stream-manager.js';
import type { NodeHealthAggregator } from './node-health-aggregator.js';
import type { ApiRateLimiter } from './api-rate-limiter.js';

export interface DashboardApiServerOptions {
  port?: number;
  version?: string;
}

const DEFAULT_PORT = 8080;
const VERSION = '14.0.0';

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? '127.0.0.1';
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

export class DashboardApiServer {
  private server: ReturnType<typeof createServer> | null = null;
  private readonly port: number;
  private readonly version: string;
  private startedAt: number | null = null;

  constructor(
    private readonly store: DashboardStateStore,
    private readonly sse: SseStreamManager,
    private readonly nodes: NodeHealthAggregator,
    private readonly rateLimiter: ApiRateLimiter,
    options: DashboardApiServerOptions = {},
  ) {
    this.port = options.port ?? DEFAULT_PORT;
    this.version = options.version ?? VERSION;
  }

  createRequestHandler() {
    return (req: IncomingMessage, res: ServerResponse): void => {
      this.handleRequest(req, res);
    };
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url?.split('?')[0] ?? '/';
    const method = req.method ?? 'GET';

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    // SSE stream exempt from rate limiting
    if (url === '/stream') {
      if (method !== 'GET') {
        sendJson(res, 405, { error: 'Method Not Allowed', method });
        return;
      }
      this.sse.addClient(res);
      return;
    }

    // Rate limit all other routes
    const ip = getClientIp(req);
    const rateResult = this.rateLimiter.checkRequest(ip);
    if (!rateResult.allowed) {
      res.setHeader('Retry-After', String(Math.ceil((rateResult.retryAfterMs ?? 1000) / 1000)));
      res.setHeader('Access-Control-Allow-Origin', '*');
      sendJson(res, 429, {
        error: 'Too Many Requests',
        retryAfterMs: rateResult.retryAfterMs,
      });
      return;
    }

    if (method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed', method });
      return;
    }

    switch (url) {
      case '/health':
        this.handleHealth(res);
        break;
      case '/awning':
        this.handleAwning(res);
        break;
      case '/detections':
        this.handleDetections(res);
        break;
      case '/intel':
        this.handleIntel(res);
        break;
      case '/nodes':
        this.handleNodes(res);
        break;
      default:
        sendJson(res, 404, { error: 'Not Found', path: url });
    }
  }

  private handleHealth(res: ServerResponse): void {
    const uptimeMs = this.startedAt ? Date.now() - this.startedAt : 0;
    sendJson(res, 200, {
      status: 'ok',
      uptime_s: uptimeMs / 1000,
      version: this.version,
    });
  }

  private handleAwning(res: ServerResponse): void {
    const snapshot = this.store.getSnapshot();
    sendJson(res, 200, {
      level: snapshot.awningLevel,
      transitions: snapshot.awningTransitions,
    });
  }

  private handleDetections(res: ServerResponse): void {
    const snapshot = this.store.getSnapshot();
    sendJson(res, 200, {
      detections: snapshot.detections,
      count: snapshot.detections.length,
    });
  }

  private handleIntel(res: ServerResponse): void {
    const snapshot = this.store.getSnapshot();
    sendJson(res, 200, { brief: snapshot.latestIntel });
  }

  private handleNodes(res: ServerResponse): void {
    const nodeGrid = this.nodes.getNodeGrid();
    sendJson(res, 200, { nodes: nodeGrid });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer(this.createRequestHandler());
      this.server.on('error', reject);
      this.server.listen(this.port, () => {
        this.startedAt = Date.now();
        this.sse.start();
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.sse.stop();
      this.sse.closeAll();
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  getPort(): number {
    return this.port;
  }
}
