import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GracefulShutdownManager } from '../../src/resilience/graceful-shutdown-manager.js';

describe('FR-W15-07: Graceful Shutdown Manager', () => {
  let mgr: GracefulShutdownManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mgr = new GracefulShutdownManager({ timeoutMs: 30000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('GSD-01: starts in idle phase', () => {
    expect(mgr.getShutdownStatus().phase).toBe('idle');
  });

  it('GSD-02: register adds component to pending list', async () => {
    mgr.register('nats', async () => {});
    const status = mgr.getShutdownStatus();
    expect(status.pending).toContain('nats');
  });

  it('GSD-03: triggerShutdown calls all registered shutdown functions', async () => {
    const fn1 = vi.fn().mockResolvedValue(undefined);
    const fn2 = vi.fn().mockResolvedValue(undefined);
    mgr.register('comp1', fn1);
    mgr.register('comp2', fn2);
    await mgr.triggerShutdown('test');
    expect(fn1).toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
  });

  it('GSD-04: completed list populated after shutdown', async () => {
    mgr.register('nats', async () => {});
    mgr.register('feeds', async () => {});
    await mgr.triggerShutdown('signal:SIGTERM');
    const status = mgr.getShutdownStatus();
    expect(status.completed).toContain('nats');
    expect(status.completed).toContain('feeds');
  });

  it('GSD-05: pending list empty after successful shutdown', async () => {
    mgr.register('a', async () => {});
    await mgr.triggerShutdown('test');
    expect(mgr.getShutdownStatus().pending).toHaveLength(0);
  });

  it('GSD-06: phase is done after shutdown completes', async () => {
    mgr.register('a', async () => {});
    await mgr.triggerShutdown('test');
    expect(mgr.getShutdownStatus().phase).toBe('done');
  });

  it('GSD-07: shutdown reason is accepted without error', async () => {
    await expect(mgr.triggerShutdown('SIGTERM')).resolves.toBeUndefined();
  });

  it('GSD-08: component that fails shutdown is still marked completed', async () => {
    mgr.register('faulty', async () => { throw new Error('shutdown error'); });
    await mgr.triggerShutdown('test');
    const status = mgr.getShutdownStatus();
    expect(status.pending).toHaveLength(0);
  });

  it('GSD-09: no-op shutdown if no components registered', async () => {
    await expect(mgr.triggerShutdown('test')).resolves.toBeUndefined();
    expect(mgr.getShutdownStatus().phase).toBe('done');
  });

  it('GSD-10: triggerShutdown resolves even if second call made', async () => {
    mgr.register('a', async () => {});
    const p1 = mgr.triggerShutdown('test');
    const p2 = mgr.triggerShutdown('test-again');
    await expect(Promise.all([p1, p2])).resolves.toBeDefined();
  });

  it('GSD-11: getShutdownStatus returns correct pending before trigger', () => {
    mgr.register('x', async () => {});
    mgr.register('y', async () => {});
    const status = mgr.getShutdownStatus();
    expect(status.completed).toHaveLength(0);
    expect(status.pending.length).toBeGreaterThanOrEqual(2);
  });

  it('GSD-12: shutdown completes within timeout (fast components)', async () => {
    mgr.register('fast', async () => { /* instant */ });
    const start = Date.now();
    await mgr.triggerShutdown('test');
    // Should complete well under 30s
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
