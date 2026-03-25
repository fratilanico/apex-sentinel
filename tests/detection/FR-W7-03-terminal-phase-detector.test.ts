// APEX-SENTINEL — W7 Terminal Phase Detector Tests
// FR-W7-03 | tests/detection/FR-W7-03-terminal-phase-detector.test.ts
// TDD RED phase — new module src/detection/terminal-phase-detector does not exist yet

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TerminalPhaseDetector,
  TerminalPhaseEvent,
} from '../../src/detection/terminal-phase-detector.js';
import type {
  TerminalPhaseConfig,
  TerminalPhaseState,
  EkfState,
} from '../../src/detection/terminal-phase-detector.js';

// Helper: build a minimal EKF state object
function makeEkfState(overrides: Partial<EkfState> = {}): EkfState {
  return {
    lat: 51.5,
    lon: 4.9,
    altMeters: 200,
    speedMps: 50,
    headingDeg: 270,
    verticalSpeedMps: -2,
    ...overrides,
  };
}

describe('FR-W7-03: TerminalPhaseDetector', () => {
  let detector: TerminalPhaseDetector;
  const defaultConfig: TerminalPhaseConfig = {
    speedThresholdMps: 80,
    descentRateThresholdMps: 5,
    headingLockToleranceDeg: 10,
    rfSilenceWindowMs: 2000,
  };

  beforeEach(() => {
    detector = new TerminalPhaseDetector(defaultConfig);
  });

  // --- Constructor and initial state ---

  it('FR-W7-03-01: GIVEN TerminalPhaseDetector constructed with config, THEN constructor does not throw', () => {
    expect(() => new TerminalPhaseDetector(defaultConfig)).not.toThrow();
  });

  it('FR-W7-03-02: GIVEN freshly constructed detector, WHEN getState called, THEN state is "CRUISE"', () => {
    expect(detector.getState()).toBe('CRUISE');
  });

  // --- Single indicator — insufficient for state change ---

  it('FR-W7-03-03: GIVEN only speedExceedsThreshold=true (other indicators false), WHEN assess called, THEN state remains "CRUISE"', () => {
    detector.assess({
      ekfState: makeEkfState({ speedMps: 100 }),
      headingLockedToTarget: false,
      altitudeDescentRate: false,
      rfLinkSilent: false,
    });
    expect(detector.getState()).toBe('CRUISE');
  });

  it('FR-W7-03-04: GIVEN only headingLockedToTarget=true (other indicators false), WHEN assess called, THEN state remains "CRUISE"', () => {
    detector.assess({
      ekfState: makeEkfState({ speedMps: 40 }),
      headingLockedToTarget: true,
      altitudeDescentRate: false,
      rfLinkSilent: false,
    });
    expect(detector.getState()).toBe('CRUISE');
  });

  it('FR-W7-03-05: GIVEN only altitudeDescentRate=true (other indicators false), WHEN assess called, THEN state remains "CRUISE"', () => {
    detector.assess({
      ekfState: makeEkfState({ verticalSpeedMps: -10 }),
      headingLockedToTarget: false,
      altitudeDescentRate: true,
      rfLinkSilent: false,
    });
    expect(detector.getState()).toBe('CRUISE');
  });

  it('FR-W7-03-06: GIVEN only rfLinkSilent=true (other indicators false), WHEN assess called, THEN state remains "CRUISE"', () => {
    detector.assess({
      ekfState: makeEkfState(),
      headingLockedToTarget: false,
      altitudeDescentRate: false,
      rfLinkSilent: true,
    });
    expect(detector.getState()).toBe('CRUISE');
  });

  // --- 3 of 4 indicators → APPROACH ---

  it('FR-W7-03-07: GIVEN 3 of 4 indicators true (rfLinkSilent=false), WHEN assess called, THEN state becomes "APPROACH"', () => {
    detector.assess({
      ekfState: makeEkfState({ speedMps: 100, verticalSpeedMps: -8 }),
      headingLockedToTarget: true,
      altitudeDescentRate: true,
      rfLinkSilent: false,
    });
    expect(detector.getState()).toBe('APPROACH');
  });

  // --- All 4 indicators → TERMINAL with high confidence ---

  it('FR-W7-03-08: GIVEN all 4 indicators true, WHEN assess called, THEN state becomes "TERMINAL" and confidence >= 0.9', () => {
    detector.assess({
      ekfState: makeEkfState({ speedMps: 100, verticalSpeedMps: -8 }),
      headingLockedToTarget: true,
      altitudeDescentRate: true,
      rfLinkSilent: true,
    });
    expect(detector.getState()).toBe('TERMINAL');
    expect(detector.getConfidence()).toBeGreaterThanOrEqual(0.9);
  });

  // --- getConfidence in TERMINAL ---

  it('FR-W7-03-09: GIVEN state is "TERMINAL", WHEN getConfidence called, THEN returns value >= 0.9', () => {
    detector.assess({
      ekfState: makeEkfState({ speedMps: 110, verticalSpeedMps: -10 }),
      headingLockedToTarget: true,
      altitudeDescentRate: true,
      rfLinkSilent: true,
    });
    expect(detector.getConfidence()).toBeGreaterThanOrEqual(0.9);
  });

  // --- reset() ---

  it('FR-W7-03-10: GIVEN detector in TERMINAL state, WHEN reset called, THEN state returns to "CRUISE"', () => {
    detector.assess({
      ekfState: makeEkfState({ speedMps: 110, verticalSpeedMps: -10 }),
      headingLockedToTarget: true,
      altitudeDescentRate: true,
      rfLinkSilent: true,
    });
    expect(detector.getState()).toBe('TERMINAL');
    detector.reset();
    expect(detector.getState()).toBe('CRUISE');
  });

  // --- IMPACT state when altitude <= 0 ---

  it('FR-W7-03-11: GIVEN EKF state with altMeters <= 0, WHEN assess called, THEN state is forced to "IMPACT"', () => {
    detector.assess({
      ekfState: makeEkfState({ altMeters: 0, speedMps: 110, verticalSpeedMps: -10 }),
      headingLockedToTarget: true,
      altitudeDescentRate: true,
      rfLinkSilent: true,
    });
    expect(detector.getState()).toBe('IMPACT');
  });

  // --- getState() ---

  it('FR-W7-03-12: GIVEN detector after multiple assessments, WHEN getState called, THEN returns current FSM state string', () => {
    const state: TerminalPhaseState = detector.getState();
    expect(['CRUISE', 'APPROACH', 'TERMINAL', 'IMPACT']).toContain(state);
  });

  // --- TerminalPhaseEvent emitted on TERMINAL transition ---

  it('FR-W7-03-13: GIVEN detector transitions to TERMINAL, WHEN event listener attached, THEN TerminalPhaseEvent is emitted with correct payload', () => {
    const listener = vi.fn();
    detector.on('terminal', listener);

    detector.assess({
      ekfState: makeEkfState({ speedMps: 110, verticalSpeedMps: -10 }),
      headingLockedToTarget: true,
      altitudeDescentRate: true,
      rfLinkSilent: true,
    });

    expect(listener).toHaveBeenCalledOnce();
    const event: TerminalPhaseEvent = listener.mock.calls[0][0];
    expect(event.state).toBe('TERMINAL');
    expect(event.confidence).toBeGreaterThanOrEqual(0.9);
    expect(event.timestampMs).toBeGreaterThan(0);
  });

  // --- Consecutive TERMINAL assessments increase confidence ---

  it('FR-W7-03-14: GIVEN detector in TERMINAL state, WHEN additional TERMINAL assessments made, THEN confidence increases toward 1.0', () => {
    const allTerminalInput = {
      ekfState: makeEkfState({ speedMps: 110, verticalSpeedMps: -10 }),
      headingLockedToTarget: true,
      altitudeDescentRate: true,
      rfLinkSilent: true,
    };

    detector.assess(allTerminalInput);
    const conf1 = detector.getConfidence();

    detector.assess(allTerminalInput);
    const conf2 = detector.getConfidence();

    detector.assess(allTerminalInput);
    const conf3 = detector.getConfidence();

    expect(conf3).toBeGreaterThanOrEqual(conf1);
    expect(conf3).toBeLessThanOrEqual(1.0);
  });

  // --- Valid FSM sequence ---

  it('FR-W7-03-15: GIVEN sequential assess calls with escalating indicators, WHEN state transitions checked, THEN CRUISE→APPROACH→TERMINAL is a valid sequence', () => {
    const states: TerminalPhaseState[] = [];

    // CRUISE: no indicators
    detector.assess({
      ekfState: makeEkfState({ speedMps: 40 }),
      headingLockedToTarget: false,
      altitudeDescentRate: false,
      rfLinkSilent: false,
    });
    states.push(detector.getState());

    // APPROACH: 3 indicators
    detector.assess({
      ekfState: makeEkfState({ speedMps: 100, verticalSpeedMps: -8 }),
      headingLockedToTarget: true,
      altitudeDescentRate: true,
      rfLinkSilent: false,
    });
    states.push(detector.getState());

    // TERMINAL: all 4 indicators
    detector.assess({
      ekfState: makeEkfState({ speedMps: 110, verticalSpeedMps: -10 }),
      headingLockedToTarget: true,
      altitudeDescentRate: true,
      rfLinkSilent: true,
    });
    states.push(detector.getState());

    expect(states[0]).toBe('CRUISE');
    expect(states[1]).toBe('APPROACH');
    expect(states[2]).toBe('TERMINAL');
  });
});
