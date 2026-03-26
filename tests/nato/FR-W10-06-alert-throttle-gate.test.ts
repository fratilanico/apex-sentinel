// APEX-SENTINEL — W10 AlertThrottleGate Tests
// FR-W10-06 | tests/nato/FR-W10-06-alert-throttle-gate.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { AlertThrottleGate } from '../../src/nato/alert-throttle-gate.js';

describe('FR-W10-06: AlertThrottleGate', () => {
  let gate: AlertThrottleGate;
  const NOW = 1700000000000;

  beforeEach(() => {
    gate = new AlertThrottleGate(30000, 3); // 30s debounce, 3 de-escalation count
  });

  it('06-01: first level change always allowed', () => {
    expect(gate.shouldAllow('WHITE', NOW)).toBe(true);
  });

  it('06-02: same level change within 30s → blocked', () => {
    gate.record('WHITE', NOW);
    expect(gate.shouldAllow('YELLOW', NOW + 10000)).toBe(false); // 10s < 30s
  });

  it('06-03: level change after 30s → allowed', () => {
    gate.record('WHITE', NOW);
    expect(gate.shouldAllow('YELLOW', NOW + 31000)).toBe(true);
  });

  it('06-04: escalation to RED is always allowed (no debounce)', () => {
    gate.record('WHITE', NOW);
    // Even within 30s window, escalation to RED is immediate
    expect(gate.shouldAllow('RED', NOW + 5000)).toBe(true);
  });

  it('06-05: escalation from YELLOW to RED is always allowed', () => {
    gate.record('YELLOW', NOW);
    expect(gate.shouldAllow('RED', NOW + 1000)).toBe(true);
  });

  it('06-06: de-escalation from RED requires 3 consecutive non-RED', () => {
    gate.record('RED', NOW);
    // Only 2 non-RED readings
    gate.record('YELLOW', NOW + 31000);
    gate.record('YELLOW', NOW + 62000);
    expect(gate.shouldAllow('WHITE', NOW + 93000)).toBe(false);
  });

  it('06-07: de-escalation from RED allowed after 3 consecutive non-RED', () => {
    gate.record('RED', NOW);
    gate.record('YELLOW', NOW + 31000);
    gate.record('YELLOW', NOW + 62000);
    gate.record('YELLOW', NOW + 93000);
    expect(gate.shouldAllow('WHITE', NOW + 124000)).toBe(true);
  });

  it('06-08: RED interrupts de-escalation counter', () => {
    gate.record('RED', NOW);
    gate.record('YELLOW', NOW + 31000);
    gate.record('RED', NOW + 62000); // back to RED resets counter
    gate.record('YELLOW', NOW + 93000);
    gate.record('YELLOW', NOW + 124000);
    // Only 2 non-RED after last RED — not enough
    expect(gate.shouldAllow('WHITE', NOW + 155000)).toBe(false);
  });

  it('06-09: history ring buffer max 10 entries', () => {
    for (let i = 0; i < 15; i++) {
      gate.record('WHITE', NOW + i * 31000);
    }
    expect(gate.getHistory().length).toBeLessThanOrEqual(10);
  });

  it('06-10: getHistory returns recorded entries', () => {
    gate.record('WHITE', NOW);
    gate.record('YELLOW', NOW + 31000);
    const history = gate.getHistory();
    expect(history.length).toBe(2);
    expect(history[0].level).toBe('WHITE');
    expect(history[1].level).toBe('YELLOW');
  });

  it('06-11: record + shouldAllow sequence — WHITE→RED→WHITE requires 3 intermediates', () => {
    gate.record('WHITE', NOW);
    gate.record('RED', NOW + 1000); // escalation immediate
    // Now 3 YELLOW readings needed
    gate.record('YELLOW', NOW + 32000);
    gate.record('YELLOW', NOW + 63000);
    gate.record('YELLOW', NOW + 94000);
    expect(gate.shouldAllow('WHITE', NOW + 125000)).toBe(true);
  });

  it('06-12: debounceMs is configurable', () => {
    const shortGate = new AlertThrottleGate(5000, 3); // 5s debounce
    shortGate.record('WHITE', NOW);
    expect(shortGate.shouldAllow('YELLOW', NOW + 4000)).toBe(false);
    expect(shortGate.shouldAllow('YELLOW', NOW + 6000)).toBe(true);
  });
});
