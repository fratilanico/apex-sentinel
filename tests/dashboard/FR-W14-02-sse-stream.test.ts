import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SseStreamManager } from '../../src/dashboard/sse-stream-manager.js';
import { EventEmitter } from 'node:events';

// Mock ServerResponse
function makeMockResponse() {
  const emitter = new EventEmitter();
  const written: string[] = [];
  let ended = false;
  const res = {
    writeHead: vi.fn(),
    write: vi.fn((data: string) => { written.push(data); return true; }),
    end: vi.fn(() => { ended = true; }),
    on: (event: string, fn: () => void) => emitter.on(event, fn),
    emit: (event: string) => emitter.emit(event),
    get writableEnded() { return ended; },
    _written: written,
    socket: { remoteAddress: '127.0.0.1' },
  };
  return res;
}

describe('FR-W14-02: SseStreamManager — SSE fanout', () => {
  let manager: SseStreamManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new SseStreamManager();
  });

  afterEach(() => {
    manager.stop();
    manager.closeAll();
    vi.useRealTimers();
  });

  it('SSE-01: addClient sends SSE headers', () => {
    const res = makeMockResponse();
    manager.addClient(res as any);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'Content-Type': 'text/event-stream',
    }));
  });

  it('SSE-02: addClient sends initial :ok comment', () => {
    const res = makeMockResponse();
    manager.addClient(res as any);
    expect(res.write).toHaveBeenCalledWith(':ok\n\n');
  });

  it('SSE-03: getConnectionCount returns 0 initially', () => {
    expect(manager.getConnectionCount()).toBe(0);
  });

  it('SSE-04: getConnectionCount reflects connected clients', () => {
    manager.addClient(makeMockResponse() as any);
    manager.addClient(makeMockResponse() as any);
    expect(manager.getConnectionCount()).toBe(2);
  });

  it('SSE-05: broadcast sends event to all clients', () => {
    const r1 = makeMockResponse();
    const r2 = makeMockResponse();
    manager.addClient(r1 as any);
    manager.addClient(r2 as any);
    manager.broadcast('detection', { id: 'det-001' });
    const payload = `event: detection\ndata: ${JSON.stringify({ id: 'det-001' })}\n\n`;
    expect(r1._written).toContain(payload);
    expect(r2._written).toContain(payload);
  });

  it('SSE-06: client removed on close event', () => {
    const res = makeMockResponse();
    manager.addClient(res as any);
    expect(manager.getConnectionCount()).toBe(1);
    res.emit('close');
    expect(manager.getConnectionCount()).toBe(0);
  });

  it('SSE-07: heartbeat fires every 5s', () => {
    const res = makeMockResponse();
    manager.addClient(res as any);
    manager.start();
    vi.advanceTimersByTime(5001);
    const heartbeats = res._written.filter(w => w.includes('event: heartbeat'));
    expect(heartbeats.length).toBeGreaterThanOrEqual(1);
  });

  it('SSE-08: stop() disables heartbeat', () => {
    const res = makeMockResponse();
    manager.addClient(res as any);
    manager.start();
    manager.stop();
    const countBeforeStop = res._written.length;
    vi.advanceTimersByTime(20_000);
    expect(res._written.length).toBe(countBeforeStop); // no new writes
  });

  it('SSE-09: max 100 clients enforced — oldest dropped', () => {
    for (let i = 0; i < 100; i++) {
      manager.addClient(makeMockResponse() as any);
    }
    expect(manager.getConnectionCount()).toBe(100);
    manager.addClient(makeMockResponse() as any);
    // Still 100 (oldest dropped, new added)
    expect(manager.getConnectionCount()).toBe(100);
  });

  it('SSE-10: oldest client is dropped when limit exceeded', () => {
    const clients = [];
    for (let i = 0; i < 100; i++) {
      const res = makeMockResponse();
      clients.push(res);
      manager.addClient(res as any);
    }
    const oldest = clients[0];
    const newClient = makeMockResponse();
    manager.addClient(newClient as any);
    // Oldest was ended
    expect(oldest.end).toHaveBeenCalled();
  });

  it('SSE-11: CORS header present on SSE response', () => {
    const res = makeMockResponse();
    manager.addClient(res as any);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'Access-Control-Allow-Origin': '*',
    }));
  });

  it('SSE-12: closeAll() ends all connections and resets count', () => {
    manager.addClient(makeMockResponse() as any);
    manager.addClient(makeMockResponse() as any);
    manager.closeAll();
    expect(manager.getConnectionCount()).toBe(0);
  });

  it('SSE-13: broadcast to empty client list is no-op', () => {
    expect(() => manager.broadcast('heartbeat', { ts: Date.now() })).not.toThrow();
  });
});
