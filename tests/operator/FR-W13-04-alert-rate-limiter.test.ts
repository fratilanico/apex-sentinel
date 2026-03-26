// APEX-SENTINEL — W13
// FR-W13-04: AlertRateLimiter

import { describe, it, expect, beforeEach } from 'vitest';
import { AlertRateLimiter, type RateLimitInput } from '../../src/operator/alert-rate-limiter.js';

describe('FR-W13-04: AlertRateLimiter', () => {
  let limiter: AlertRateLimiter;
  const NOW = 1000000000000; // fixed clock

  const makeRed = (sector: string = 'GRID-A1'): RateLimitInput => ({
    alertId: 'A1',
    awningLevel: 'RED',
    sector,
    droneType: 'fpv_drone',
  });

  const makeYellow = (droneType: string = 'fpv_drone'): RateLimitInput => ({
    alertId: 'A2',
    awningLevel: 'YELLOW',
    sector: 'GRID-B2',
    droneType,
  });

  beforeEach(() => {
    limiter = new AlertRateLimiter();
  });

  it('first RED alert delivers', () => {
    const result = limiter.shouldDeliver(makeRed(), NOW);
    expect(result.deliver).toBe(true);
  });

  it('second and third RED alert in 5 min deliver', () => {
    limiter.shouldDeliver(makeRed(), NOW);
    limiter.shouldDeliver(makeRed(), NOW + 1000);
    const result = limiter.shouldDeliver(makeRed(), NOW + 2000);
    expect(result.deliver).toBe(true);
  });

  it('fourth RED alert in 5 min is suppressed', () => {
    limiter.shouldDeliver(makeRed(), NOW);
    limiter.shouldDeliver(makeRed(), NOW + 1000);
    limiter.shouldDeliver(makeRed(), NOW + 2000);
    const result = limiter.shouldDeliver(makeRed(), NOW + 3000);
    expect(result.deliver).toBe(false);
  });

  it('suppressed RED returns cooldownMs', () => {
    limiter.shouldDeliver(makeRed(), NOW);
    limiter.shouldDeliver(makeRed(), NOW + 1000);
    limiter.shouldDeliver(makeRed(), NOW + 2000);
    const result = limiter.shouldDeliver(makeRed(), NOW + 3000);
    expect(result.cooldownMs).toBeGreaterThan(0);
  });

  it('RED in different sector is independent', () => {
    limiter.shouldDeliver(makeRed('GRID-A1'), NOW);
    limiter.shouldDeliver(makeRed('GRID-A1'), NOW + 500);
    limiter.shouldDeliver(makeRed('GRID-A1'), NOW + 1000);
    // 4th in A1 suppressed, but B2 should pass
    limiter.shouldDeliver(makeRed('GRID-A1'), NOW + 1500); // suppressed
    const result = limiter.shouldDeliver(makeRed('GRID-B2'), NOW + 1500);
    expect(result.deliver).toBe(true);
  });

  it('RED alerts after 5 min window reset', () => {
    const FIVE_MIN = 5 * 60 * 1000;
    limiter.shouldDeliver(makeRed(), NOW);
    limiter.shouldDeliver(makeRed(), NOW + 1000);
    limiter.shouldDeliver(makeRed(), NOW + 2000);
    // Move past 5 min window
    const result = limiter.shouldDeliver(makeRed(), NOW + FIVE_MIN + 1000);
    expect(result.deliver).toBe(true);
  });

  it('first YELLOW alert delivers', () => {
    const result = limiter.shouldDeliver(makeYellow(), NOW);
    expect(result.deliver).toBe(true);
  });

  it('second YELLOW for same drone type within 2 min is suppressed', () => {
    limiter.shouldDeliver(makeYellow(), NOW);
    const result = limiter.shouldDeliver(makeYellow(), NOW + 60_000); // 1 min later
    expect(result.deliver).toBe(false);
  });

  it('YELLOW for different drone type is independent', () => {
    limiter.shouldDeliver(makeYellow('fpv_drone'), NOW);
    const result = limiter.shouldDeliver(makeYellow('shahed_136'), NOW + 60_000);
    expect(result.deliver).toBe(true);
  });

  it('WHITE alert always delivers', () => {
    const alert: RateLimitInput = { alertId: 'W1', awningLevel: 'WHITE', sector: 'A', droneType: 'x' };
    const r1 = limiter.shouldDeliver(alert, NOW);
    const r2 = limiter.shouldDeliver(alert, NOW + 100);
    expect(r1.deliver).toBe(true);
    expect(r2.deliver).toBe(true);
  });

  it('critical escalation bypasses rate limit', () => {
    limiter.shouldDeliver(makeRed(), NOW);
    limiter.shouldDeliver(makeRed(), NOW + 1000);
    limiter.shouldDeliver(makeRed(), NOW + 2000);
    // 4th would be suppressed, but critical=true
    const result = limiter.shouldDeliver(
      { ...makeRed(), isCriticalEscalation: true },
      NOW + 3000,
    );
    expect(result.deliver).toBe(true);
  });

  it('getAlertCooldown returns 0 when under limit', () => {
    const cooldown = limiter.getAlertCooldown('GRID-X', 'RED', NOW);
    expect(cooldown).toBe(0);
  });

  it('getAlertCooldown returns positive ms when over limit', () => {
    limiter.shouldDeliver(makeRed('GRID-X'), NOW);
    limiter.shouldDeliver(makeRed('GRID-X'), NOW + 100);
    limiter.shouldDeliver(makeRed('GRID-X'), NOW + 200);
    const cooldown = limiter.getAlertCooldown('GRID-X', 'RED', NOW + 300);
    expect(cooldown).toBeGreaterThan(0);
  });
});
