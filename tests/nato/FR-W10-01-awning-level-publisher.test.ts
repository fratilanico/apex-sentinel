// APEX-SENTINEL — W10 AwningLevelPublisher Tests
// FR-W10-01 | tests/nato/FR-W10-01-awning-level-publisher.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AwningLevelPublisher } from '../../src/nato/awning-level-publisher.js';

describe('FR-W10-01: AwningLevelPublisher', () => {
  let publisher: AwningLevelPublisher;
  let mockNats: { publish: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockNats = { publish: vi.fn(), subscribe: vi.fn() };
    publisher = new AwningLevelPublisher(mockNats);
  });

  it('01-01: contextScore 0 → WHITE', () => {
    expect(publisher.deriveLevel(0)).toBe('WHITE');
  });

  it('01-02: contextScore 29 → WHITE', () => {
    expect(publisher.deriveLevel(29)).toBe('WHITE');
  });

  it('01-03: contextScore 30 → YELLOW', () => {
    expect(publisher.deriveLevel(30)).toBe('YELLOW');
  });

  it('01-04: contextScore 59 → YELLOW', () => {
    expect(publisher.deriveLevel(59)).toBe('YELLOW');
  });

  it('01-05: contextScore 60 → RED', () => {
    expect(publisher.deriveLevel(60)).toBe('RED');
  });

  it('01-06: contextScore 100 → RED', () => {
    expect(publisher.deriveLevel(100)).toBe('RED');
  });

  it('01-07: CivilProtection CRITICAL → RED regardless of score', () => {
    expect(publisher.deriveLevel(5, 'CRITICAL')).toBe('RED');
  });

  it('01-08: CivilProtection non-CRITICAL does not override score', () => {
    expect(publisher.deriveLevel(5, 'WARNING')).toBe('WHITE');
  });

  it('01-09: publish sends to awning.level NATS subject', () => {
    publisher.publish('RED', 75);
    expect(mockNats.publish).toHaveBeenCalledWith('awning.level', expect.objectContaining({ level: 'RED' }));
  });

  it('01-10: publish payload includes contextScore and ts', () => {
    publisher.publish('YELLOW', 45);
    const call = mockNats.publish.mock.calls[0];
    expect(call[1]).toMatchObject({ level: 'YELLOW', contextScore: 45 });
    expect(typeof (call[1] as { ts: string }).ts).toBe('string');
  });

  it('01-11: hysteresis — de-escalation requires 2 consecutive elevated readings', () => {
    // Start elevated (YELLOW), then drop to WHITE — first drop should be held
    publisher.recordReading('YELLOW');
    publisher.recordReading('YELLOW');
    // First white reading — should NOT de-escalate yet (need 2 consecutive)
    expect(publisher.shouldDeEscalate('WHITE')).toBe(false);
    publisher.recordReading('WHITE');
    // Second white reading — now can de-escalate
    expect(publisher.shouldDeEscalate('WHITE')).toBe(true);
  });

  it('01-12: escalation is immediate (no hysteresis on way up)', () => {
    publisher.recordReading('WHITE');
    publisher.recordReading('WHITE');
    expect(publisher.shouldDeEscalate('RED')).toBe(true); // escalation always immediate
  });

  it('01-13: getHistory returns recorded levels', () => {
    publisher.recordReading('WHITE');
    publisher.recordReading('YELLOW');
    publisher.recordReading('RED');
    const history = publisher.getHistory();
    expect(history).toEqual(['WHITE', 'YELLOW', 'RED']);
  });
});
