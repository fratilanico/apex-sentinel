import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ApiRateLimiter } from '../../src/dashboard/api-rate-limiter.js';

describe('FR-W14-07: ApiRateLimiter — per-IP token bucket', () => {
  let limiter: ApiRateLimiter;

  beforeEach(() => {
    limiter = new ApiRateLimiter(60, 1);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('RL-01: first request is allowed', () => {
    const result = limiter.checkRequest('10.0.0.1');
    expect(result.allowed).toBe(true);
  });

  it('RL-02: remaining decrements on each allowed request', () => {
    const r1 = limiter.checkRequest('10.0.0.1');
    expect(r1.remaining).toBe(59);
    const r2 = limiter.checkRequest('10.0.0.1');
    expect(r2.remaining).toBe(58);
  });

  it('RL-03: 60 requests allowed, 61st blocked', () => {
    for (let i = 0; i < 60; i++) {
      const r = limiter.checkRequest('10.0.0.2');
      expect(r.allowed).toBe(true);
    }
    const r61 = limiter.checkRequest('10.0.0.2');
    expect(r61.allowed).toBe(false);
  });

  it('RL-04: blocked request has retryAfterMs > 0', () => {
    for (let i = 0; i < 60; i++) limiter.checkRequest('10.0.0.3');
    const r = limiter.checkRequest('10.0.0.3');
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it('RL-05: remaining is 0 when blocked', () => {
    for (let i = 0; i < 60; i++) limiter.checkRequest('10.0.0.4');
    const r = limiter.checkRequest('10.0.0.4');
    expect(r.remaining).toBe(0);
  });

  it('RL-06: token refill after 1 second allows new request', () => {
    for (let i = 0; i < 60; i++) limiter.checkRequest('10.0.0.5');
    const blocked = limiter.checkRequest('10.0.0.5');
    expect(blocked.allowed).toBe(false);

    vi.advanceTimersByTime(1500); // 1.5 seconds = 1.5 tokens refilled
    const allowed = limiter.checkRequest('10.0.0.5');
    expect(allowed.allowed).toBe(true);
  });

  it('RL-07: per-IP isolation — IP-A exhausted does not block IP-B', () => {
    for (let i = 0; i < 60; i++) limiter.checkRequest('10.0.0.6');
    const aBlocked = limiter.checkRequest('10.0.0.6');
    expect(aBlocked.allowed).toBe(false);

    const bAllowed = limiter.checkRequest('10.0.0.7');
    expect(bAllowed.allowed).toBe(true);
  });

  it('RL-08: reset(ip) restores full bucket for that IP', () => {
    for (let i = 0; i < 60; i++) limiter.checkRequest('10.0.0.8');
    limiter.reset('10.0.0.8');
    const r = limiter.checkRequest('10.0.0.8');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(59);
  });

  it('RL-09: resetAll() clears all buckets', () => {
    limiter.checkRequest('10.0.0.9');
    limiter.checkRequest('10.0.0.10');
    expect(limiter.getBucketCount()).toBe(2);
    limiter.resetAll();
    expect(limiter.getBucketCount()).toBe(0);
  });

  it('RL-10: tokens never exceed maxTokens after refill', () => {
    limiter.checkRequest('10.0.0.11'); // creates bucket
    vi.advanceTimersByTime(10_000); // 10 seconds — would be 10 tokens refilled
    const r = limiter.checkRequest('10.0.0.11');
    expect(r.remaining).toBeLessThanOrEqual(60);
  });

  it('RL-11: new IP starts with full bucket (maxTokens)', () => {
    const r = limiter.checkRequest('192.168.0.1');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(59); // 60 - 1
  });

  it('RL-12: custom maxTokens respected', () => {
    const smallLimiter = new ApiRateLimiter(5, 1);
    for (let i = 0; i < 5; i++) smallLimiter.checkRequest('1.2.3.4');
    const r = smallLimiter.checkRequest('1.2.3.4');
    expect(r.allowed).toBe(false);
  });
});
