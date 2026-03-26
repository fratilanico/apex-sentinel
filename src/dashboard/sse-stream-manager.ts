// FR-W14-02: SseStreamManager — Server-Sent Events fanout

import type { ServerResponse } from 'node:http';

export type SseEventType = 'awning_update' | 'detection' | 'intel_brief' | 'node_health' | 'heartbeat';

export interface SseClient {
  id: string;
  res: ServerResponse;
  connectedAt: number;
}

const MAX_CLIENTS = 100;
const HEARTBEAT_INTERVAL_MS = 5000;

export class SseStreamManager {
  private clients: SseClient[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private clientIdCounter = 0;

  start(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      this.broadcast('heartbeat', { ts: Date.now() });
    }, HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  addClient(res: ServerResponse): string {
    // Enforce max clients — drop oldest
    if (this.clients.length >= MAX_CLIENTS) {
      const oldest = this.clients.shift();
      if (oldest) {
        try {
          oldest.res.end();
        } catch {
          // ignore
        }
      }
    }

    const id = `sse-${++this.clientIdCounter}`;
    const client: SseClient = { id, res, connectedAt: Date.now() };
    this.clients.push(client);

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(':ok\n\n');

    // Cleanup on client disconnect
    res.on('close', () => {
      this.removeClient(id);
    });

    return id;
  }

  removeClient(id: string): void {
    this.clients = this.clients.filter(c => c.id !== id);
  }

  broadcast(eventType: SseEventType, data: unknown): void {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    const dead: string[] = [];

    for (const client of this.clients) {
      try {
        if (!client.res.writableEnded) {
          client.res.write(payload);
        } else {
          dead.push(client.id);
        }
      } catch {
        dead.push(client.id);
      }
    }

    // Cleanup dead clients
    for (const id of dead) {
      this.removeClient(id);
    }
  }

  getConnectionCount(): number {
    return this.clients.length;
  }

  closeAll(): void {
    for (const client of this.clients) {
      try {
        client.res.end();
      } catch {
        // ignore
      }
    }
    this.clients = [];
  }
}
