// APEX-SENTINEL — TDD RED Tests
// FR-W3-11: Calibration State Machine
// Status: RED — implementation in src/mobile/calibration.ts does NOT exist yet

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CalibrationStateMachine,
  type CalibrationStep,
  type CalibrationResult,
} from '../../src/mobile/calibration.js';

describe('FR-W3-11-00: Calibration State Machine', () => {

  describe('FR-W3-11-01: initial step is idle', () => {
    it('getCurrentStep() returns idle immediately after construction', () => {
      const sm = new CalibrationStateMachine();
      expect(sm.getCurrentStep()).toBe<CalibrationStep>('idle');
    });
  });

  describe('FR-W3-11-02: advance with passed=true from idle moves to mic_test', () => {
    it('transitions from idle to mic_test on successful advance', () => {
      const sm = new CalibrationStateMachine();
      const result: CalibrationResult = { step: 'idle', passed: true };
      const next = sm.advance(result);
      expect(next).toBe<CalibrationStep>('mic_test');
      expect(sm.getCurrentStep()).toBe<CalibrationStep>('mic_test');
    });
  });

  describe('FR-W3-11-03: advance with passed=true from mic_test moves to gps_lock', () => {
    it('transitions from mic_test to gps_lock on success', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: true });
      const next = sm.advance({ step: 'mic_test', passed: true });
      expect(next).toBe<CalibrationStep>('gps_lock');
    });
  });

  describe('FR-W3-11-04: advance with passed=true from gps_lock moves to nats_ping', () => {
    it('transitions from gps_lock to nats_ping on success', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: true });
      sm.advance({ step: 'mic_test', passed: true });
      const next = sm.advance({ step: 'gps_lock', passed: true });
      expect(next).toBe<CalibrationStep>('nats_ping');
    });
  });

  describe('FR-W3-11-05: advance with passed=true from nats_ping moves to test_detection', () => {
    it('transitions from nats_ping to test_detection on success', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: true });
      sm.advance({ step: 'mic_test', passed: true });
      sm.advance({ step: 'gps_lock', passed: true });
      const next = sm.advance({ step: 'nats_ping', passed: true });
      expect(next).toBe<CalibrationStep>('test_detection');
    });
  });

  describe('FR-W3-11-06: advance with passed=true from test_detection moves to complete', () => {
    it('transitions from test_detection to complete on success', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: true });
      sm.advance({ step: 'mic_test', passed: true });
      sm.advance({ step: 'gps_lock', passed: true });
      sm.advance({ step: 'nats_ping', passed: true });
      const next = sm.advance({ step: 'test_detection', passed: true });
      expect(next).toBe<CalibrationStep>('complete');
    });
  });

  describe('FR-W3-11-07: advance with passed=false from any step sets state to failed', () => {
    it('fails immediately from idle', () => {
      const sm = new CalibrationStateMachine();
      const next = sm.advance({ step: 'idle', passed: false, errorMessage: 'no mic' });
      expect(next).toBe<CalibrationStep>('failed');
      expect(sm.getCurrentStep()).toBe<CalibrationStep>('failed');
    });

    it('fails immediately from mic_test', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: true });
      const next = sm.advance({ step: 'mic_test', passed: false, errorMessage: 'mic broken' });
      expect(next).toBe<CalibrationStep>('failed');
    });

    it('fails immediately from gps_lock', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: true });
      sm.advance({ step: 'mic_test', passed: true });
      const next = sm.advance({ step: 'gps_lock', passed: false });
      expect(next).toBe<CalibrationStep>('failed');
    });

    it('fails immediately from nats_ping', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: true });
      sm.advance({ step: 'mic_test', passed: true });
      sm.advance({ step: 'gps_lock', passed: true });
      const next = sm.advance({ step: 'nats_ping', passed: false });
      expect(next).toBe<CalibrationStep>('failed');
    });

    it('fails immediately from test_detection', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: true });
      sm.advance({ step: 'mic_test', passed: true });
      sm.advance({ step: 'gps_lock', passed: true });
      sm.advance({ step: 'nats_ping', passed: true });
      const next = sm.advance({ step: 'test_detection', passed: false });
      expect(next).toBe<CalibrationStep>('failed');
    });
  });

  describe('FR-W3-11-08: isComplete returns true only when step is complete', () => {
    it('isComplete is false at initial idle state', () => {
      const sm = new CalibrationStateMachine();
      expect(sm.isComplete()).toBe(false);
    });

    it('isComplete is false mid-calibration', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: true });
      sm.advance({ step: 'mic_test', passed: true });
      expect(sm.isComplete()).toBe(false);
    });

    it('isComplete is true after all steps pass', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: true });
      sm.advance({ step: 'mic_test', passed: true });
      sm.advance({ step: 'gps_lock', passed: true });
      sm.advance({ step: 'nats_ping', passed: true });
      sm.advance({ step: 'test_detection', passed: true });
      expect(sm.isComplete()).toBe(true);
    });
  });

  describe('FR-W3-11-09: isFailed returns true when step is failed', () => {
    it('isFailed is false initially', () => {
      const sm = new CalibrationStateMachine();
      expect(sm.isFailed()).toBe(false);
    });

    it('isFailed is true after a failed advance', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: false });
      expect(sm.isFailed()).toBe(true);
    });
  });

  describe('FR-W3-11-10: canAdvance returns false when step is failed', () => {
    it('canAdvance is true in idle state', () => {
      const sm = new CalibrationStateMachine();
      expect(sm.canAdvance()).toBe(true);
    });

    it('canAdvance is false after failure', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: false });
      expect(sm.canAdvance()).toBe(false);
    });

    it('canAdvance is false after complete (no further steps)', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: true });
      sm.advance({ step: 'mic_test', passed: true });
      sm.advance({ step: 'gps_lock', passed: true });
      sm.advance({ step: 'nats_ping', passed: true });
      sm.advance({ step: 'test_detection', passed: true });
      expect(sm.canAdvance()).toBe(false);
    });
  });

  describe('FR-W3-11-11: reset returns state to idle with empty completedSteps', () => {
    it('resets to idle after partial calibration', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: true });
      sm.advance({ step: 'mic_test', passed: true });
      sm.reset();
      expect(sm.getCurrentStep()).toBe<CalibrationStep>('idle');
    });

    it('completedSteps is empty after reset', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: true });
      sm.advance({ step: 'mic_test', passed: true });
      sm.reset();
      expect(sm.getCompletedSteps()).toHaveLength(0);
    });

    it('resets to idle from failed state', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: false });
      sm.reset();
      expect(sm.getCurrentStep()).toBe<CalibrationStep>('idle');
      expect(sm.isFailed()).toBe(false);
    });
  });

  describe('FR-W3-11-12: getCompletedSteps accumulates steps that passed', () => {
    it('getCompletedSteps is empty initially', () => {
      const sm = new CalibrationStateMachine();
      expect(sm.getCompletedSteps()).toHaveLength(0);
    });

    it('accumulates each successfully passed step', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: true });
      sm.advance({ step: 'mic_test', passed: true });
      sm.advance({ step: 'gps_lock', passed: true });
      const completed = sm.getCompletedSteps();
      expect(completed).toHaveLength(3);
      expect(completed).toContain<CalibrationStep>('idle');
      expect(completed).toContain<CalibrationStep>('mic_test');
      expect(completed).toContain<CalibrationStep>('gps_lock');
    });

    it('does not include the failed step in completedSteps', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: true });
      sm.advance({ step: 'mic_test', passed: false });
      const completed = sm.getCompletedSteps();
      expect(completed).not.toContain<CalibrationStep>('mic_test');
    });

    it('accumulates all 5 steps on full pass', () => {
      const sm = new CalibrationStateMachine();
      sm.advance({ step: 'idle', passed: true });
      sm.advance({ step: 'mic_test', passed: true });
      sm.advance({ step: 'gps_lock', passed: true });
      sm.advance({ step: 'nats_ping', passed: true });
      sm.advance({ step: 'test_detection', passed: true });
      expect(sm.getCompletedSteps()).toHaveLength(5);
    });
  });

});
