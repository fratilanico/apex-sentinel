import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { DashboardIntegrationLayer } from '../../src/dashboard/dashboard-integration-layer.js';
import { DashboardStateStore } from '../../src/dashboard/dashboard-state-store.js';
import { SseStreamManager } from '../../src/dashboard/sse-stream-manager.js';
import { NodeHealthAggregator } from '../../src/dashboard/node-health-aggregator.js';
import { DetectionSerializer } from '../../src/dashboard/detection-serializer.js';

// Mock SSE response
function makeMockSseRes() {
  const emitter = new EventEmitter();
  const written: string[] = [];
  return {
    writeHead: vi.fn(),
    write: vi.fn((d: string) => { written.push(d); return true; }),
    end: vi.fn(),
    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter),
    get writableEnded() { return false; },
    socket: { remoteAddress: '127.0.0.1' } as any,
    _written: written,
  };
}

describe('FR-W14-08: DashboardIntegrationLayer — pipeline wiring', () => {
  let layer: DashboardIntegrationLayer;
  let store: DashboardStateStore;
  let sse: SseStreamManager;
  let nodes: NodeHealthAggregator;
  let serializer: DetectionSerializer;

  beforeEach(() => {
    store = new DashboardStateStore();
    sse = new SseStreamManager();
    nodes = new NodeHealthAggregator();
    serializer = new DetectionSerializer();
    layer = new DashboardIntegrationLayer(store, sse, nodes, serializer);
  });

  afterEach(() => {
    layer.stop();
  });

  it('INT-01: isRunning() is false before start', () => {
    expect(layer.isRunning()).toBe(false);
  });

  it('INT-02: isRunning() is true after start', () => {
    layer.start();
    expect(layer.isRunning()).toBe(true);
  });

  it('INT-03: isRunning() is false after stop', () => {
    layer.start();
    layer.stop();
    expect(layer.isRunning()).toBe(false);
  });

  it('INT-04: awning.alert event updates state store', () => {
    layer.start();
    const emitter = layer.getEmitter();
    emitter.emit('awning.alert', { level: 'YELLOW', reason: 'test surge' });
    expect(store.getCurrentAwningLevel()).toBe('YELLOW');
  });

  it('INT-05: awning.alert broadcasts SSE when level changes', () => {
    layer.start();
    const sseRes = makeMockSseRes();
    sse.addClient(sseRes as any);

    const emitter = layer.getEmitter();
    emitter.emit('awning.alert', { level: 'ORANGE', reason: 'escalation' });

    const broadcasts = sseRes._written.filter(w => w.includes('event: awning_update'));
    expect(broadcasts.length).toBeGreaterThan(0);
  });

  it('INT-06: awning.alert does NOT broadcast SSE if level unchanged', () => {
    layer.start();
    // Already GREEN, emit GREEN again
    const emitter = layer.getEmitter();
    emitter.emit('awning.alert', { level: 'GREEN', reason: 'no change' });

    const sseRes = makeMockSseRes();
    sse.addClient(sseRes as any);
    emitter.emit('awning.alert', { level: 'GREEN', reason: 'still green' });
    const broadcasts = sseRes._written.filter(w => w.includes('event: awning_update'));
    expect(broadcasts.length).toBe(0);
  });

  it('INT-07: detection.enriched Stage 3 updates store and broadcasts SSE', () => {
    layer.start();
    const sseRes = makeMockSseRes();
    sse.addClient(sseRes as any);
    const emitter = layer.getEmitter();

    emitter.emit('detection.enriched', {
      id: 'det-001',
      droneType: 'Shahed-136',
      awningLevel: 'RED',
      stage: 3,
      lat: 44.43,
      lon: 26.10,
      ts: Date.now(),
    });

    expect(store.getDetectionCount()).toBe(1);
    const broadcasts = sseRes._written.filter(w => w.includes('event: detection'));
    expect(broadcasts.length).toBeGreaterThan(0);
  });

  it('INT-08: detection.enriched Stage 1 updates store but does NOT broadcast SSE', () => {
    layer.start();
    const sseRes = makeMockSseRes();
    sse.addClient(sseRes as any);
    const emitter = layer.getEmitter();

    emitter.emit('detection.enriched', {
      id: 'det-002',
      droneType: 'Unknown',
      awningLevel: 'GREEN',
      stage: 1,
      ts: Date.now(),
    });

    expect(store.getDetectionCount()).toBe(1);
    const broadcasts = sseRes._written.filter(w => w.includes('event: detection'));
    expect(broadcasts.length).toBe(0);
  });

  it('INT-09: intel.brief event updates store and broadcasts', () => {
    layer.start();
    const sseRes = makeMockSseRes();
    sse.addClient(sseRes as any);
    const emitter = layer.getEmitter();

    const brief = { id: 'b1', summary: 'threat activity', threatLevel: 'HIGH', sources: ['OSINT'], ts: Date.now() };
    emitter.emit('intel.brief', brief);

    const snap = store.getSnapshot();
    expect(snap.latestIntel?.id).toBe('b1');
    const broadcasts = sseRes._written.filter(w => w.includes('event: intel_brief'));
    expect(broadcasts.length).toBeGreaterThan(0);
  });

  it('INT-10: node.health event updates node aggregator', () => {
    layer.start();
    const emitter = layer.getEmitter();

    emitter.emit('node.health', { nodeId: 'Node-RO-01', lat: 44.43, lon: 26.10, detectionCount: 3 });
    const node = nodes.getNode('Node-RO-01');
    expect(node?.detectionCount).toBe(3);
  });

  it('INT-11: stop() removes all event listeners', () => {
    layer.start();
    const emitter = layer.getEmitter();
    expect(emitter.listenerCount('awning.alert')).toBeGreaterThan(0);
    layer.stop();
    expect(emitter.listenerCount('awning.alert')).toBe(0);
  });

  it('INT-12: start() is idempotent (second call ignored)', () => {
    layer.start();
    layer.start(); // no error
    expect(layer.isRunning()).toBe(true);
  });

  it('INT-13: AWNING RED forces Stage 1 detection to broadcast', () => {
    layer.start();
    // First escalate to RED
    const emitter = layer.getEmitter();
    emitter.emit('awning.alert', { level: 'RED', reason: 'critical' });

    const sseRes = makeMockSseRes();
    sse.addClient(sseRes as any);

    emitter.emit('detection.enriched', {
      id: 'det-003',
      droneType: 'Unknown',
      awningLevel: 'RED',
      stage: 1,
      ts: Date.now(),
    });

    const broadcasts = sseRes._written.filter(w => w.includes('event: detection'));
    expect(broadcasts.length).toBeGreaterThan(0);
  });

  it('INT-14: connectNats wires NATS subscriptions', () => {
    const subscribed: string[] = [];
    const mockNats = {
      subscribe: (subject: string, _handler: unknown) => {
        subscribed.push(subject);
        return { unsubscribe: vi.fn() };
      },
    };
    layer.connectNats(mockNats);
    expect(subscribed).toContain('awning.alert');
    expect(subscribed).toContain('detection.enriched');
    expect(subscribed).toContain('intel.brief');
    expect(subscribed).toContain('node.health');
  });

  it('INT-15: multiple sequential AWNING escalations all recorded', () => {
    layer.start();
    const emitter = layer.getEmitter();
    emitter.emit('awning.alert', { level: 'YELLOW', reason: 'step 1' });
    emitter.emit('awning.alert', { level: 'ORANGE', reason: 'step 2' });
    emitter.emit('awning.alert', { level: 'RED', reason: 'step 3' });

    const snap = store.getSnapshot();
    expect(snap.awningTransitions.length).toBe(3);
    expect(snap.awningLevel).toBe('RED');
  });
});
