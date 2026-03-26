import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { DemoScenarioEngine } from '../../src/dashboard/demo-scenario-engine.js';

describe('FR-W14-06: DemoScenarioEngine — scripted hackathon scenarios', () => {
  let engine: DemoScenarioEngine;
  let emitter: EventEmitter;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = new DemoScenarioEngine();
    emitter = new EventEmitter();
  });

  afterEach(() => {
    engine.cancelScenario();
    vi.useRealTimers();
  });

  it('SC-01: getScenarioList returns 3 scenarios', () => {
    const list = engine.getScenarioList();
    expect(list).toHaveLength(3);
  });

  it('SC-02: scenario names are correct', () => {
    const names = engine.getScenarioList().map(s => s.name);
    expect(names).toContain('SCENARIO_OSINT_SURGE');
    expect(names).toContain('SCENARIO_SHAHED_APPROACH');
    expect(names).toContain('SCENARIO_TRAJECTORY_PREDICTION');
  });

  it('SC-03: each scenario has description and durationMs', () => {
    const list = engine.getScenarioList();
    for (const s of list) {
      expect(s.description).toBeTruthy();
      expect(s.durationMs).toBeGreaterThan(0);
    }
  });

  it('SC-04: SCENARIO_OSINT_SURGE emits osint events', () => {
    const events: unknown[] = [];
    emitter.on('scenario_event', e => events.push(e));
    engine.runScenario('SCENARIO_OSINT_SURGE', emitter, 1000);
    vi.advanceTimersByTime(100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('SC-05: SCENARIO_OSINT_SURGE emits awning_update to YELLOW', () => {
    const awningEvents: unknown[] = [];
    emitter.on('scenario_event', (e: Record<string, unknown>) => {
      if (e['type'] === 'awning_update') awningEvents.push(e);
    });
    engine.runScenario('SCENARIO_OSINT_SURGE', emitter, 1000);
    vi.advanceTimersByTime(10);
    expect(awningEvents.some((e: unknown) => (e as Record<string, unknown>)['level'] === 'YELLOW')).toBe(true);
  });

  it('SC-06: SCENARIO_SHAHED_APPROACH emits Stage 1 → Stage 2 → Stage 3 detections', () => {
    const detections: unknown[] = [];
    emitter.on('scenario_event', (e: Record<string, unknown>) => {
      if (e['type'] === 'detection') detections.push(e);
    });
    engine.runScenario('SCENARIO_SHAHED_APPROACH', emitter, 1000);
    vi.advanceTimersByTime(20);
    const stages = detections.map((d: unknown) => (d as Record<string, unknown>)['stage']);
    expect(stages).toContain(1);
    expect(stages).toContain(2);
    expect(stages).toContain(3);
  });

  it('SC-07: SCENARIO_SHAHED_APPROACH emits AWNING RED', () => {
    const awningEvents: unknown[] = [];
    emitter.on('scenario_event', (e: Record<string, unknown>) => {
      if (e['type'] === 'awning_update') awningEvents.push(e);
    });
    engine.runScenario('SCENARIO_SHAHED_APPROACH', emitter, 1000);
    vi.advanceTimersByTime(20);
    expect(awningEvents.some((e: unknown) => (e as Record<string, unknown>)['level'] === 'RED')).toBe(true);
  });

  it('SC-08: SCENARIO_TRAJECTORY_PREDICTION emits trajectory events', () => {
    const events: unknown[] = [];
    emitter.on('scenario_event', e => events.push(e));
    engine.runScenario('SCENARIO_TRAJECTORY_PREDICTION', emitter, 1000);
    vi.advanceTimersByTime(20);
    const types = events.map((e: unknown) => (e as Record<string, unknown>)['type']);
    expect(types).toContain('trajectory_prediction');
  });

  it('SC-09: cancelScenario() stops further events', () => {
    const events: unknown[] = [];
    emitter.on('scenario_event', e => events.push(e));
    engine.runScenario('SCENARIO_OSINT_SURGE', emitter, 1); // slow
    engine.cancelScenario();
    const countAfterCancel = events.length;
    vi.advanceTimersByTime(5000);
    expect(events.length).toBe(countAfterCancel);
  });

  it('SC-10: getActiveScenario returns null when idle', () => {
    expect(engine.getActiveScenario()).toBeNull();
  });

  it('SC-11: getActiveScenario returns name while running', () => {
    engine.runScenario('SCENARIO_OSINT_SURGE', emitter, 0.001);
    expect(engine.getActiveScenario()).toBe('SCENARIO_OSINT_SURGE');
  });

  it('SC-12: all Romania coordinates within expected bounds', () => {
    const positions: Array<{ lat: number; lon: number }> = [];
    emitter.on('scenario_event', (e: Record<string, unknown>) => {
      if (e['lat'] !== undefined) positions.push({ lat: e['lat'] as number, lon: e['lon'] as number });
    });
    engine.runScenario('SCENARIO_SHAHED_APPROACH', emitter, 1000);
    vi.advanceTimersByTime(20);
    for (const pos of positions) {
      expect(pos.lat).toBeGreaterThan(43.5);
      expect(pos.lat).toBeLessThan(45.5);
      expect(pos.lon).toBeGreaterThan(25.0);
      expect(pos.lon).toBeLessThan(27.5);
    }
  });

  it('SC-13: runScenario cancels previous scenario before starting', () => {
    const events: unknown[] = [];
    emitter.on('scenario_event', e => events.push(e));
    engine.runScenario('SCENARIO_OSINT_SURGE', emitter, 0.001);
    expect(engine.getActiveScenario()).toBe('SCENARIO_OSINT_SURGE');
    engine.runScenario('SCENARIO_SHAHED_APPROACH', emitter, 1000);
    expect(engine.getActiveScenario()).toBe('SCENARIO_SHAHED_APPROACH');
  });
});
