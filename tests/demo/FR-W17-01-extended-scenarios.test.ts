import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  ExtendedDemoScenarioEngine,
  type ExtendedScenarioName,
  type ScenarioEvent,
} from '../../src/demo/extended-demo-scenario-engine.js';

describe('FR-W17-01: ExtendedDemoScenarioEngine — 6 hackathon demo scenarios', () => {
  let engine: ExtendedDemoScenarioEngine;
  let emitter: EventEmitter;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = new ExtendedDemoScenarioEngine();
    emitter = new EventEmitter();
  });

  afterEach(() => {
    engine.cancelScenario();
    vi.useRealTimers();
  });

  // ── Manifest ──────────────────────────────────────────────────────────────

  it('SC-01: getScenarioManifest returns exactly 6 scenarios', () => {
    expect(engine.getScenarioManifest()).toHaveLength(6);
  });

  it('SC-02: all 6 scenario names present', () => {
    const names = engine.getScenarioManifest().map(s => s.name);
    const expected: ExtendedScenarioName[] = [
      'CHALLENGE_01_PERIMETER',
      'CHALLENGE_01_SWARM',
      'CHALLENGE_02_URBAN',
      'CHALLENGE_02_TRAJECTORY',
      'NATO_AWNING_ESCALATION',
      'FULL_PIPELINE',
    ];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });

  it('SC-03: each scenario has description, challenge, duration_s, coordinates', () => {
    for (const s of engine.getScenarioManifest()) {
      expect(s.description.length).toBeGreaterThan(10);
      expect(['C01', 'C02', 'NATO', 'FULL']).toContain(s.challenge);
      expect(s.duration_s).toBeGreaterThan(0);
      expect(s.coordinates.lat).toBeGreaterThanOrEqual(44.0);
      expect(s.coordinates.lat).toBeLessThanOrEqual(44.8);
      expect(s.coordinates.lon).toBeGreaterThanOrEqual(26.0);
      expect(s.coordinates.lon).toBeLessThanOrEqual(26.8);
    }
  });

  it('SC-04: Romania coordinates in range for all scenarios', () => {
    for (const s of engine.getScenarioManifest()) {
      expect(s.coordinates.lat).toBeGreaterThan(44.0);
      expect(s.coordinates.lon).toBeGreaterThan(26.0);
    }
  });

  it('SC-05: each scenario has expectedAwningTransitions', () => {
    for (const s of engine.getScenarioManifest()) {
      expect(s.expectedAwningTransitions.length).toBeGreaterThan(0);
    }
  });

  it('SC-06: getScenarioByName returns correct entry', () => {
    const s = engine.getScenarioByName('CHALLENGE_01_PERIMETER');
    expect(s).not.toBeNull();
    expect(s!.challenge).toBe('C01');
  });

  it('SC-07: getScenarioByName returns null for unknown', () => {
    expect(engine.getScenarioByName('NONEXISTENT' as ExtendedScenarioName)).toBeNull();
  });

  // ── CHALLENGE_01_PERIMETER ────────────────────────────────────────────────

  it('SC-08: CHALLENGE_01_PERIMETER emits detection event', () => {
    const events: ScenarioEvent[] = [];
    emitter.on('scenario_event', (e: ScenarioEvent) => events.push(e));
    engine.runScenario('CHALLENGE_01_PERIMETER', emitter, 1000);
    vi.advanceTimersByTime(10);
    expect(events.some(e => e['type'] === 'detection')).toBe(true);
  });

  it('SC-09: CHALLENGE_01_PERIMETER emits YELLOW then RED awning', () => {
    const awning: string[] = [];
    emitter.on('scenario_event', (e: ScenarioEvent) => {
      if (e['type'] === 'awning_update') awning.push(e['level'] as string);
    });
    engine.runScenario('CHALLENGE_01_PERIMETER', emitter, 1000);
    vi.advanceTimersByTime(20);
    expect(awning).toContain('YELLOW');
    expect(awning).toContain('RED');
  });

  it('SC-10: CHALLENGE_01_PERIMETER detection has Shahed-136 threat', () => {
    const detections: ScenarioEvent[] = [];
    emitter.on('scenario_event', (e: ScenarioEvent) => {
      if (e['type'] === 'detection') detections.push(e);
    });
    engine.runScenario('CHALLENGE_01_PERIMETER', emitter, 1000);
    vi.advanceTimersByTime(20);
    expect(detections.some(d => d['threat'] === 'Shahed-136')).toBe(true);
  });

  // ── CHALLENGE_01_SWARM ────────────────────────────────────────────────────

  it('SC-11: CHALLENGE_01_SWARM emits 3 drone detections', () => {
    const detections: ScenarioEvent[] = [];
    emitter.on('scenario_event', (e: ScenarioEvent) => {
      if (e['type'] === 'detection') detections.push(e);
    });
    engine.runScenario('CHALLENGE_01_SWARM', emitter, 1000);
    vi.advanceTimersByTime(30);
    expect(detections.length).toBeGreaterThanOrEqual(3);
  });

  it('SC-12: CHALLENGE_01_SWARM emits swarm_confirmation', () => {
    const events: ScenarioEvent[] = [];
    emitter.on('scenario_event', (e: ScenarioEvent) => events.push(e));
    engine.runScenario('CHALLENGE_01_SWARM', emitter, 1000);
    vi.advanceTimersByTime(30);
    const swarm = events.find(e => e['type'] === 'swarm_confirmation');
    expect(swarm).toBeDefined();
    expect(swarm!['droneCount']).toBe(3);
  });

  // ── CHALLENGE_02_URBAN ────────────────────────────────────────────────────

  it('SC-13: CHALLENGE_02_URBAN emits false_positive_suppression', () => {
    const events: ScenarioEvent[] = [];
    emitter.on('scenario_event', (e: ScenarioEvent) => events.push(e));
    engine.runScenario('CHALLENGE_02_URBAN', emitter, 1000);
    vi.advanceTimersByTime(20);
    const fp = events.find(e => e['type'] === 'false_positive_suppression');
    expect(fp).toBeDefined();
    expect(fp!['result']).toBe('CIVILIAN');
  });

  it('SC-14: CHALLENGE_02_URBAN returns AWNING to WHITE after false positive', () => {
    const awning: string[] = [];
    emitter.on('scenario_event', (e: ScenarioEvent) => {
      if (e['type'] === 'awning_update') awning.push(e['level'] as string);
    });
    engine.runScenario('CHALLENGE_02_URBAN', emitter, 1000);
    vi.advanceTimersByTime(25);
    expect(awning).toContain('WHITE');
  });

  // ── CHALLENGE_02_TRAJECTORY ───────────────────────────────────────────────

  it('SC-15: CHALLENGE_02_TRAJECTORY emits trajectory_prediction with 30s window', () => {
    const events: ScenarioEvent[] = [];
    emitter.on('scenario_event', (e: ScenarioEvent) => events.push(e));
    engine.runScenario('CHALLENGE_02_TRAJECTORY', emitter, 1000);
    vi.advanceTimersByTime(15);
    const traj = events.find(e => e['type'] === 'trajectory_prediction');
    expect(traj).toBeDefined();
    expect(traj!['intercept_window_s']).toBe(30);
    expect(traj!['stage']).toBe('3.5');
  });

  // ── NATO_AWNING_ESCALATION ────────────────────────────────────────────────

  it('SC-16: NATO_AWNING_ESCALATION emits full WHITE→YELLOW→RED→WHITE cycle', () => {
    const awning: string[] = [];
    emitter.on('scenario_event', (e: ScenarioEvent) => {
      if (e['type'] === 'awning_update') awning.push(e['level'] as string);
    });
    engine.runScenario('NATO_AWNING_ESCALATION', emitter, 1000);
    vi.advanceTimersByTime(60);
    expect(awning).toContain('YELLOW');
    expect(awning).toContain('RED');
    expect(awning[awning.length - 1]).toBe('WHITE');
  });

  // ── FULL_PIPELINE ─────────────────────────────────────────────────────────

  it('SC-17: FULL_PIPELINE emits feed_status all_active', () => {
    const events: ScenarioEvent[] = [];
    emitter.on('scenario_event', (e: ScenarioEvent) => events.push(e));
    engine.runScenario('FULL_PIPELINE', emitter, 1000);
    vi.advanceTimersByTime(5);
    const feedStatus = events.find(e => e['type'] === 'feed_status');
    expect(feedStatus).toBeDefined();
    expect(feedStatus!['status']).toBe('all_active');
  });

  it('SC-18: FULL_PIPELINE emits intel_brief', () => {
    const events: ScenarioEvent[] = [];
    emitter.on('scenario_event', (e: ScenarioEvent) => events.push(e));
    engine.runScenario('FULL_PIPELINE', emitter, 1000);
    vi.advanceTimersByTime(25);
    expect(events.some(e => e['type'] === 'intel_brief')).toBe(true);
  });

  // ── Cancel ────────────────────────────────────────────────────────────────

  it('SC-19: cancelScenario stops emission', () => {
    const events: ScenarioEvent[] = [];
    emitter.on('scenario_event', (e: ScenarioEvent) => events.push(e));
    engine.runScenario('FULL_PIPELINE', emitter, 1000);
    engine.cancelScenario();
    const countBefore = events.length;
    vi.advanceTimersByTime(100);
    expect(events.length).toBe(countBefore);
  });

  it('SC-20: getActiveScenario is null after cancel', () => {
    engine.runScenario('NATO_AWNING_ESCALATION', emitter, 1000);
    engine.cancelScenario();
    expect(engine.getActiveScenario()).toBeNull();
  });
});
