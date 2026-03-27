// FR-W19-04: EuAwningLevelAssigner — TDD RED
// src/intel/eu-awning-level-assigner.ts does NOT exist yet — all tests will fail

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EuAwningLevelAssigner } from '../../src/intel/eu-awning-level-assigner.js';

// ---------------------------------------------------------------------------
// Inline types
// ---------------------------------------------------------------------------
type AwningLevel = 'CLEAR' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';

interface NatsMock {
  publish: ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// Threshold reference (from W19 design):
// Airport:  GREEN<20, YELLOW<50, ORANGE<75, RED>=75
// Nuclear:  GREEN<15, YELLOW<30, ORANGE<50, RED>=50
// Military: same as nuclear
// Government: same as airport
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FR-W19-04: EuAwningLevelAssigner', () => {
  // 04-01: airport zone scores [19,49,74,75] → levels [GREEN,YELLOW,ORANGE,RED]
  it('04-01: airport zone scores [19,49,74,75] → levels [GREEN,YELLOW,ORANGE,RED]', () => {
    const assigner = new EuAwningLevelAssigner({ nats: { publish: vi.fn() } });
    const zone = { id: 'RO-LROP', type: 'airport' as const };
    const expected: AwningLevel[] = ['GREEN', 'YELLOW', 'ORANGE', 'RED'];
    const scores = [19, 49, 74, 75];
    for (let i = 0; i < scores.length; i++) {
      const result = assigner.assign(scores[i], zone);
      expect(result).toBe(expected[i]);
    }
  });

  // 04-02: nuclear score=45 → ORANGE; airport score=45 → YELLOW
  it('04-02: nuclear score=45 → ORANGE; airport score=45 → YELLOW', () => {
    const assigner = new EuAwningLevelAssigner({ nats: { publish: vi.fn() } });
    const nuclear = { id: 'RO-NUCLEAR-CND', type: 'nuclear' as const };
    const airport = { id: 'RO-LROP', type: 'airport' as const };
    expect(assigner.assign(45, nuclear)).toBe('ORANGE');
    expect(assigner.assign(45, airport)).toBe('YELLOW');
  });

  // 04-03: AWNING change GREEN→YELLOW → NATS publish on 'sentinel.intel.awning_change'
  it('04-03: GREEN→YELLOW change → NATS publish on sentinel.intel.awning_change', () => {
    const mockNats: NatsMock = { publish: vi.fn() };
    const assigner = new EuAwningLevelAssigner({ nats: mockNats });
    const zone = { id: 'RO-LROP', type: 'airport' as const };

    // First call establishes GREEN (score=10)
    assigner.assign(10, zone);
    // Reset mock after init call
    mockNats.publish.mockClear();

    // Second call: score=30 → YELLOW (change from GREEN)
    assigner.assign(30, zone);

    expect(mockNats.publish).toHaveBeenCalledWith(
      'sentinel.intel.awning_change',
      expect.anything()
    );
  });

  // 04-04: unchanged level YELLOW→YELLOW → NO NATS publish
  it('04-04: unchanged level YELLOW→YELLOW → no NATS publish', () => {
    const mockNats: NatsMock = { publish: vi.fn() };
    const assigner = new EuAwningLevelAssigner({ nats: mockNats });
    const zone = { id: 'RO-LROP', type: 'airport' as const };

    // Establish YELLOW (score=30)
    assigner.assign(30, zone);
    mockNats.publish.mockClear();

    // Same level again
    assigner.assign(40, zone); // still YELLOW (40 < 50)
    expect(mockNats.publish).not.toHaveBeenCalled();
  });

  // 04-05: assign() never throws for any input
  it('04-05: assign() never throws for any input', () => {
    const assigner = new EuAwningLevelAssigner({ nats: { publish: vi.fn() } });
    const zone = { id: 'RO-LROP', type: 'airport' as const };
    expect(() => assigner.assign(NaN, zone)).not.toThrow();
    expect(() => assigner.assign(-999, zone)).not.toThrow();
    expect(() => assigner.assign(Infinity, zone)).not.toThrow();
    expect(() => assigner.assign(0, null as unknown as typeof zone)).not.toThrow();
  });

  // 04-06: score=0 for any zone type → GREEN
  it('04-06: score=0 for any zone type → GREEN', () => {
    const assigner = new EuAwningLevelAssigner({ nats: { publish: vi.fn() } });
    const zones = [
      { id: 'z1', type: 'airport' as const },
      { id: 'z2', type: 'nuclear' as const },
      { id: 'z3', type: 'military' as const },
      { id: 'z4', type: 'government' as const },
    ];
    for (const z of zones) {
      expect(assigner.assign(0, z)).toBe('GREEN');
    }
  });

  // 04-07: score=100 for any zone type → RED
  it('04-07: score=100 for any zone type → RED', () => {
    const assigner = new EuAwningLevelAssigner({ nats: { publish: vi.fn() } });
    const zones = [
      { id: 'z1', type: 'airport' as const },
      { id: 'z2', type: 'nuclear' as const },
      { id: 'z3', type: 'military' as const },
      { id: 'z4', type: 'government' as const },
    ];
    for (const z of zones) {
      expect(assigner.assign(100, z)).toBe('RED');
    }
  });

  // 04-08: NATS payload includes required fields
  it('04-08: NATS publish payload includes zoneId, level, previousLevel, changed, timestampMs', () => {
    const mockNats: NatsMock = { publish: vi.fn() };
    const assigner = new EuAwningLevelAssigner({ nats: mockNats });
    const zone = { id: 'RO-LROP', type: 'airport' as const };

    // GREEN → YELLOW change
    assigner.assign(10, zone); // GREEN
    assigner.assign(30, zone); // YELLOW

    const calls = mockNats.publish.mock.calls;
    const changeCall = calls.find((c) => c[0] === 'sentinel.intel.awning_change');
    expect(changeCall).toBeDefined();

    const payload = changeCall![1];
    // Payload may be a string (JSON) or object — handle both
    const obj = typeof payload === 'string' ? JSON.parse(payload) : payload;
    expect(obj).toHaveProperty('zoneId');
    expect(obj).toHaveProperty('level');
    expect(obj).toHaveProperty('previousLevel');
    expect(obj).toHaveProperty('changed');
    expect(obj).toHaveProperty('timestampMs');
  });

  // 04-09: military zone score=45 → ORANGE (same thresholds as nuclear)
  it('04-09: military zone score=45 → ORANGE', () => {
    const assigner = new EuAwningLevelAssigner({ nats: { publish: vi.fn() } });
    const zone = { id: 'RO-MIL-001', type: 'military' as const };
    expect(assigner.assign(45, zone)).toBe('ORANGE');
  });

  // 04-10: government zone score=45 → YELLOW (standard airport thresholds)
  it('04-10: government zone score=45 → YELLOW', () => {
    const assigner = new EuAwningLevelAssigner({ nats: { publish: vi.fn() } });
    const zone = { id: 'RO-GOV-001', type: 'government' as const };
    expect(assigner.assign(45, zone)).toBe('YELLOW');
  });

  // 04-11: assigner tracks previous level per zone independently
  it('04-11: zone A at RED does not affect zone B level tracking', () => {
    const mockNats: NatsMock = { publish: vi.fn() };
    const assigner = new EuAwningLevelAssigner({ nats: mockNats });
    const zoneA = { id: 'RO-LROP', type: 'airport' as const };
    const zoneB = { id: 'RO-LRCL', type: 'airport' as const };

    assigner.assign(90, zoneA); // RED for A
    mockNats.publish.mockClear();

    // Zone B starts at CLEAR, goes to GREEN — should fire change for B only
    assigner.assign(10, zoneB);
    const calls = mockNats.publish.mock.calls;
    const bCall = calls.find((c) => {
      const payload = typeof c[1] === 'string' ? JSON.parse(c[1]) : c[1];
      return payload?.zoneId === 'RO-LRCL';
    });
    expect(bCall).toBeDefined();
  });

  // 04-12: assign() for zone not seen before → previous level defaults to CLEAR
  it('04-12: zone not seen before → previousLevel defaults to CLEAR in NATS payload', () => {
    const mockNats: NatsMock = { publish: vi.fn() };
    const assigner = new EuAwningLevelAssigner({ nats: mockNats });
    const zone = { id: 'BRAND-NEW-ZONE', type: 'airport' as const };

    assigner.assign(30, zone); // GREEN for first time → change from CLEAR

    const calls = mockNats.publish.mock.calls;
    const changeCall = calls.find((c) => c[0] === 'sentinel.intel.awning_change');
    if (changeCall) {
      const payload = typeof changeCall[1] === 'string' ? JSON.parse(changeCall[1]) : changeCall[1];
      expect(payload.previousLevel).toBe('CLEAR');
    } else {
      // If no publish on first-ever CLEAR→GREEN, ensure assign returns GREEN
      expect(assigner.assign(30, zone)).toBe('GREEN');
    }
  });
});
