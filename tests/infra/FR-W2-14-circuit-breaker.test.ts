// APEX-SENTINEL — TDD RED Tests
// FR-W2-14: Circuit Breaker + Dead Letter Queue
// Status: RED — implementation in src/infra/circuit-breaker.ts does NOT exist yet

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CircuitBreaker,
  DeadLetterQueue,
  type CircuitState,
  type CircuitBreakerOptions,
} from '../../src/infra/circuit-breaker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOptions(overrides: Partial<CircuitBreakerOptions> = {}): CircuitBreakerOptions {
  return {
    failureThreshold: 3,
    successThreshold: 2,
    timeoutMs: 1000,
    ...overrides,
  };
}

const alwaysOk = async () => 'ok';
const alwaysFail = async () => { throw new Error('service down'); };

// ---------------------------------------------------------------------------
// Circuit Breaker Tests
// ---------------------------------------------------------------------------

describe('FR-W2-14-00: Circuit Breaker + Dead Letter Queue', () => {

  describe('FR-W2-14-01: CircuitBreaker starts in "closed" state', () => {
    it('getState() returns "closed" on construction', () => {
      const cb = new CircuitBreaker('test-service', makeOptions());
      expect(cb.getState()).toBe<CircuitState>('closed');
    });

    it('getFailureCount() returns 0 on construction', () => {
      const cb = new CircuitBreaker('test-service', makeOptions());
      expect(cb.getFailureCount()).toBe(0);
    });
  });

  describe('FR-W2-14-02: successful execute() keeps circuit closed', () => {
    it('state remains "closed" after a successful call', async () => {
      const cb = new CircuitBreaker('test-service', makeOptions());
      await cb.execute(alwaysOk);
      expect(cb.getState()).toBe('closed');
    });

    it('execute() returns the resolved value from fn', async () => {
      const cb = new CircuitBreaker('test-service', makeOptions());
      const result = await cb.execute(async () => 42);
      expect(result).toBe(42);
    });
  });

  describe('FR-W2-14-03: failureThreshold failures open the circuit', () => {
    it('state transitions to "open" after failureThreshold consecutive failures', async () => {
      const cb = new CircuitBreaker('test-service', makeOptions({ failureThreshold: 3 }));
      for (let i = 0; i < 3; i++) {
        await cb.execute(alwaysFail).catch(() => {});
      }
      expect(cb.getState()).toBe('open');
    });

    it('failure count increments correctly', async () => {
      const cb = new CircuitBreaker('test-service', makeOptions({ failureThreshold: 5 }));
      for (let i = 0; i < 2; i++) {
        await cb.execute(alwaysFail).catch(() => {});
      }
      expect(cb.getFailureCount()).toBe(2);
    });
  });

  describe('FR-W2-14-04: execute() in "open" state throws without calling fn (fail-fast)', () => {
    it('rejects immediately without invoking fn when circuit is open', async () => {
      const cb = new CircuitBreaker('test-service', makeOptions({ failureThreshold: 1 }));
      await cb.execute(alwaysFail).catch(() => {});
      expect(cb.getState()).toBe('open');

      const spy = vi.fn(alwaysOk);
      await expect(cb.execute(spy)).rejects.toThrow();
      expect(spy).not.toHaveBeenCalled();
    });

    it('throws an error indicating the circuit is open', async () => {
      const cb = new CircuitBreaker('test-service', makeOptions({ failureThreshold: 1 }));
      await cb.execute(alwaysFail).catch(() => {});
      await expect(cb.execute(alwaysOk)).rejects.toThrow(/open/i);
    });
  });

  describe('FR-W2-14-05: after timeoutMs, circuit transitions to "half-open"', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('state becomes "half-open" after timeoutMs elapses', async () => {
      const cb = new CircuitBreaker('test-service', makeOptions({ failureThreshold: 1, timeoutMs: 500 }));
      await cb.execute(alwaysFail).catch(() => {});
      expect(cb.getState()).toBe('open');

      vi.advanceTimersByTime(500);

      // Triggering a call should probe the half-open state
      await cb.execute(alwaysOk).catch(() => {});
      // After the timeout fires, the circuit should have been in half-open before the call
      // The state after a successful probe in half-open will be 'closed' (tested in 14-06)
      // Here we just verify the transition happened (state is not still 'open')
      expect(cb.getState()).not.toBe('open');
    });
  });

  describe('FR-W2-14-06: successful call in "half-open" closes the circuit', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('transitions from "half-open" to "closed" on successThreshold successes', async () => {
      const cb = new CircuitBreaker(
        'test-service',
        makeOptions({ failureThreshold: 1, timeoutMs: 500, successThreshold: 1 }),
      );
      await cb.execute(alwaysFail).catch(() => {});
      vi.advanceTimersByTime(500);
      await cb.execute(alwaysOk).catch(() => {});
      expect(cb.getState()).toBe('closed');
    });
  });

  describe('FR-W2-14-07: failed call in "half-open" re-opens the circuit', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('transitions back to "open" if the probe call fails', async () => {
      const cb = new CircuitBreaker(
        'test-service',
        makeOptions({ failureThreshold: 1, timeoutMs: 500 }),
      );
      await cb.execute(alwaysFail).catch(() => {});
      vi.advanceTimersByTime(500);
      // Probe call fails — should re-open
      await cb.execute(alwaysFail).catch(() => {});
      expect(cb.getState()).toBe('open');
    });
  });

  describe('FR-W2-14-08: reset() returns circuit to "closed" with 0 failures', () => {
    it('resets state to "closed"', async () => {
      const cb = new CircuitBreaker('test-service', makeOptions({ failureThreshold: 1 }));
      await cb.execute(alwaysFail).catch(() => {});
      expect(cb.getState()).toBe('open');
      cb.reset();
      expect(cb.getState()).toBe('closed');
    });

    it('resets failure count to 0', async () => {
      const cb = new CircuitBreaker('test-service', makeOptions({ failureThreshold: 5 }));
      for (let i = 0; i < 3; i++) {
        await cb.execute(alwaysFail).catch(() => {});
      }
      expect(cb.getFailureCount()).toBe(3);
      cb.reset();
      expect(cb.getFailureCount()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Dead Letter Queue Tests
  // ---------------------------------------------------------------------------

  describe('FR-W2-14-09: DeadLetterQueue push/pop works correctly', () => {
    it('push() then pop() returns the same item', () => {
      const dlq = new DeadLetterQueue(10);
      const item = { subject: 'sentinel.detections.node-1', payload: { foo: 'bar' }, reason: 'parse error', timestamp: Date.now() };
      dlq.push(item);
      const popped = dlq.pop();
      expect(popped).toEqual(item);
    });

    it('pop() removes the item (size decreases)', () => {
      const dlq = new DeadLetterQueue(10);
      dlq.push({ subject: 'a', payload: null, reason: 'r', timestamp: 1 });
      dlq.pop();
      expect(dlq.size()).toBe(0);
    });
  });

  describe('FR-W2-14-10: DeadLetterQueue.isFull() when at maxSize', () => {
    it('isFull() returns false before reaching maxSize', () => {
      const dlq = new DeadLetterQueue(3);
      dlq.push({ subject: 'a', payload: null, reason: 'r', timestamp: 1 });
      dlq.push({ subject: 'b', payload: null, reason: 'r', timestamp: 2 });
      expect(dlq.isFull()).toBe(false);
    });

    it('isFull() returns true when size equals maxSize', () => {
      const dlq = new DeadLetterQueue(2);
      dlq.push({ subject: 'a', payload: null, reason: 'r', timestamp: 1 });
      dlq.push({ subject: 'b', payload: null, reason: 'r', timestamp: 2 });
      expect(dlq.isFull()).toBe(true);
    });
  });

  describe('FR-W2-14-11: DeadLetterQueue.pop() returns null when empty', () => {
    it('pop() on empty queue returns null', () => {
      const dlq = new DeadLetterQueue(10);
      expect(dlq.pop()).toBeNull();
    });

    it('size() returns 0 on empty queue', () => {
      const dlq = new DeadLetterQueue(10);
      expect(dlq.size()).toBe(0);
    });
  });

  describe('FR-W2-14-12: DLQ evicts oldest when full (FIFO overflow)', () => {
    it('oldest item is dropped when a new item is pushed to a full queue', () => {
      const dlq = new DeadLetterQueue(2);
      const first  = { subject: 'first',  payload: 1, reason: 'r', timestamp: 1000 };
      const second = { subject: 'second', payload: 2, reason: 'r', timestamp: 2000 };
      const third  = { subject: 'third',  payload: 3, reason: 'r', timestamp: 3000 };
      dlq.push(first);
      dlq.push(second);
      dlq.push(third); // should evict `first`
      expect(dlq.size()).toBe(2);
      const head = dlq.pop();
      expect(head?.subject).toBe('second'); // first was evicted
    });

    it('queue size never exceeds maxSize after overflow pushes', () => {
      const dlq = new DeadLetterQueue(3);
      for (let i = 0; i < 10; i++) {
        dlq.push({ subject: `s${i}`, payload: i, reason: 'overflow', timestamp: i });
      }
      expect(dlq.size()).toBe(3);
    });
  });

});
