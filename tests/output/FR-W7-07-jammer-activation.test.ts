// APEX-SENTINEL — W7 Jammer Activation Tests
// FR-W7-07 | tests/output/FR-W7-07-jammer-activation.test.ts
// Controls RF jamming channels per drone class, respects false-positive suppression

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  JammerActivation,
  JammerActivationEvent,
  JammerDeactivationEvent,
} from '../../src/output/jammer-activation.js';

describe('FR-W7-07: JammerActivation', () => {
  let jammer: JammerActivation;

  beforeEach(() => {
    jammer = new JammerActivation({
      channels: {
        fpv: '900mhz',
        'shahed-136': '1575mhz',
      },
    });
  });

  // AC-01: constructor accepts channel map
  it('AC-01: Constructor accepts {channels: {fpv: "900mhz", "shahed-136": "1575mhz"}}', () => {
    const instance = new JammerActivation({
      channels: { fpv: '900mhz', 'shahed-136': '1575mhz' },
    });
    expect(instance).toBeTruthy();
  });

  // AC-02: getChannel fpv
  it('AC-02: getChannel("fpv") returns "900mhz"', () => {
    expect(jammer.getChannel('fpv')).toBe('900mhz');
  });

  // AC-03: getChannel shahed-136
  it('AC-03: getChannel("shahed-136") returns "1575mhz"', () => {
    expect(jammer.getChannel('shahed-136')).toBe('1575mhz');
  });

  // AC-04: getChannel unknown returns null
  it('AC-04: getChannel("unknown-drone") returns null (no channel configured)', () => {
    expect(jammer.getChannel('unknown-drone')).toBeNull();
  });

  // AC-05: activate non-FP emits JammerActivationEvent
  it('AC-05: activate({droneClass: "fpv", isFalsePositive: false}) emits JammerActivationEvent', () => {
    const events: JammerActivationEvent[] = [];
    jammer.on('activation', (evt: JammerActivationEvent) => events.push(evt));

    jammer.activate({ droneClass: 'fpv', isFalsePositive: false });

    expect(events.length).toBe(1);
    expect(events[0].droneClass).toBe('fpv');
    expect(events[0].channel).toBe('900mhz');
  });

  // AC-06: activate FP does NOT emit event
  it('AC-06: activate({droneClass: "fpv", isFalsePositive: true}) does NOT emit activation event', () => {
    const events: JammerActivationEvent[] = [];
    jammer.on('activation', (evt: JammerActivationEvent) => events.push(evt));

    jammer.activate({ droneClass: 'fpv', isFalsePositive: true });

    expect(events.length).toBe(0);
  });

  // AC-07: activate shahed-136 uses 1575MHz channel
  it('AC-07: activate({droneClass: "shahed-136", isFalsePositive: false}) uses 1575MHz channel', () => {
    const events: JammerActivationEvent[] = [];
    jammer.on('activation', (evt: JammerActivationEvent) => events.push(evt));

    jammer.activate({ droneClass: 'shahed-136', isFalsePositive: false });

    expect(events.length).toBe(1);
    expect(events[0].channel).toBe('1575mhz');
  });

  // AC-08: deactivate emits JammerDeactivationEvent
  it('AC-08: deactivate() emits JammerDeactivationEvent', () => {
    jammer.activate({ droneClass: 'fpv', isFalsePositive: false });

    const deactivationEvents: JammerDeactivationEvent[] = [];
    jammer.on('deactivation', (evt: JammerDeactivationEvent) => deactivationEvents.push(evt));

    jammer.deactivate();

    expect(deactivationEvents.length).toBe(1);
    expect(typeof deactivationEvents[0].timestampMs).toBe('number');
  });

  // AC-09: isActive returns false initially
  it('AC-09: isActive() returns false initially', () => {
    expect(jammer.isActive()).toBe(false);
  });

  // AC-10: isActive returns true after activate
  it('AC-10: isActive() returns true after activate()', () => {
    jammer.activate({ droneClass: 'fpv', isFalsePositive: false });
    expect(jammer.isActive()).toBe(true);
  });

  // AC-11: JammerActivationEvent contains required fields
  it('AC-11: JammerActivationEvent contains {channel, droneClass, timestampMs}', () => {
    const events: JammerActivationEvent[] = [];
    jammer.on('activation', (evt: JammerActivationEvent) => events.push(evt));

    jammer.activate({ droneClass: 'shahed-136', isFalsePositive: false });

    const evt = events[0];
    expect(typeof evt.channel).toBe('string');
    expect(typeof evt.droneClass).toBe('string');
    expect(typeof evt.timestampMs).toBe('number');
    expect(evt.channel).toBe('1575mhz');
    expect(evt.droneClass).toBe('shahed-136');
    expect(evt.timestampMs).toBeGreaterThan(0);
  });

  // AC-12: activationLog records all activations with timestamps
  it('AC-12: activationLog records all activations with timestamps', () => {
    jammer.activate({ droneClass: 'fpv', isFalsePositive: false });
    jammer.deactivate();
    jammer.activate({ droneClass: 'shahed-136', isFalsePositive: false });

    const log = jammer.activationLog;
    // 2 real activations (FP not logged)
    expect(log.length).toBe(2);
    expect(log[0].droneClass).toBe('fpv');
    expect(log[1].droneClass).toBe('shahed-136');
    expect(typeof log[0].timestampMs).toBe('number');
    expect(typeof log[1].timestampMs).toBe('number');
  });
});
