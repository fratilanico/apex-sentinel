import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from '../../src/resilience/circuit-breaker.js';

describe('FR-W15-03: Circuit Breaker', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('CB-01: starts in closed state', () => {
    const cb = new CircuitBreaker();
    expect(cb.getState().state).toBe('closed');
  });

  it('CB-02: executes function normally when closed', async () => {
    const cb = new CircuitBreaker();
    const result = await cb.execute(async () => 42);
    expect(result).toBe(42);
  });

  it('CB-03: opens after 5 consecutive failures', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 5 });
    const fail = async () => { throw new Error('fail'); };
    for (let i = 0; i < 5; i++) {
      await cb.execute(fail).catch(() => {});
    }
    expect(cb.getState().state).toBe('open');
  });

  it('CB-04: throws CircuitOpenError when open', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 5 });
    const fail = async () => { throw new Error('fail'); };
    for (let i = 0; i < 5; i++) {
      await cb.execute(fail).catch(() => {});
    }
    await expect(cb.execute(async () => 1)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('CB-05: getState reports failure count', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 5 });
    await cb.execute(async () => { throw new Error('x'); }).catch(() => {});
    await cb.execute(async () => { throw new Error('x'); }).catch(() => {});
    expect(cb.getState().failures).toBe(2);
  });

  it('CB-06: getState reports lastFailure timestamp', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 5 });
    const before = Date.now();
    await cb.execute(async () => { throw new Error('x'); }).catch(() => {});
    expect(cb.getState().lastFailure).toBeGreaterThanOrEqual(before);
  });

  it('CB-07: resets failure count on success', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 5 });
    await cb.execute(async () => { throw new Error('x'); }).catch(() => {});
    await cb.execute(async () => 'ok');
    expect(cb.getState().failures).toBe(0);
  });

  it('CB-08: transitions to half-open after openTimeout', async () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 5, openTimeout: 60000 });
    const fail = async () => { throw new Error('fail'); };
    for (let i = 0; i < 5; i++) {
      await cb.execute(fail).catch(() => {});
    }
    expect(cb.getState().state).toBe('open');
    vi.advanceTimersByTime(61000);
    expect(cb.getState().state).toBe('half-open');
  });

  it('CB-09: half-open probe success closes circuit', async () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 5, openTimeout: 60000 });
    const fail = async () => { throw new Error('fail'); };
    for (let i = 0; i < 5; i++) {
      await cb.execute(fail).catch(() => {});
    }
    vi.advanceTimersByTime(61000);
    await cb.execute(async () => 'probe-ok');
    expect(cb.getState().state).toBe('closed');
  });

  it('CB-10: half-open probe failure re-opens circuit', async () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 5, openTimeout: 60000 });
    const fail = async () => { throw new Error('fail'); };
    for (let i = 0; i < 5; i++) {
      await cb.execute(fail).catch(() => {});
    }
    vi.advanceTimersByTime(61000);
    await cb.execute(fail).catch(() => {});
    expect(cb.getState().state).toBe('open');
  });

  it('CB-11: getState reports nextProbeAt when open', async () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 5, openTimeout: 60000 });
    const fail = async () => { throw new Error('fail'); };
    for (let i = 0; i < 5; i++) {
      await cb.execute(fail).catch(() => {});
    }
    const state = cb.getState();
    expect(state.nextProbeAt).toBeDefined();
  });

  it('CB-12: CircuitOpenError has descriptive message', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 5 });
    const fail = async () => { throw new Error('fail'); };
    for (let i = 0; i < 5; i++) {
      await cb.execute(fail).catch(() => {});
    }
    let caught: Error | null = null;
    try {
      await cb.execute(async () => 1);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeInstanceOf(CircuitOpenError);
    expect(caught!.message).toMatch(/circuit/i);
  });

  it('CB-13: successive successes keep state closed', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 5 });
    for (let i = 0; i < 10; i++) {
      await cb.execute(async () => i);
    }
    expect(cb.getState().state).toBe('closed');
    expect(cb.getState().failures).toBe(0);
  });
});
