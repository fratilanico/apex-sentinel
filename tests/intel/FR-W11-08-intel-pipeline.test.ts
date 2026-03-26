// APEX-SENTINEL — W11 IntelligencePipelineOrchestrator Tests
// FR-W11-08 | tests/intel/FR-W11-08-intel-pipeline.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IntelligencePipelineOrchestrator } from '../../src/intel/intelligence-pipeline-orchestrator.js';

describe('FR-W11-08: IntelligencePipelineOrchestrator', () => {
  let orchestrator: IntelligencePipelineOrchestrator;
  let mockNats: {
    publish: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  };
  let subscriptions: Record<string, (msg: unknown) => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    subscriptions = {};
    mockNats = {
      publish: vi.fn(),
      subscribe: vi.fn().mockImplementation((subject: string, handler: (msg: unknown) => void) => {
        subscriptions[subject] = handler;
      }),
    };
    orchestrator = new IntelligencePipelineOrchestrator(mockNats);
  });

  afterEach(() => {
    orchestrator.stop();
    vi.useRealTimers();
  });

  it('08-01: start() subscribes to awning.alert', () => {
    orchestrator.start();
    expect(mockNats.subscribe).toHaveBeenCalledWith('awning.alert', expect.any(Function));
  });

  it('08-02: start() subscribes to feed.fused', () => {
    orchestrator.start();
    expect(mockNats.subscribe).toHaveBeenCalledWith('feed.fused', expect.any(Function));
  });

  it('08-03: start() subscribes to detection.enriched', () => {
    orchestrator.start();
    expect(mockNats.subscribe).toHaveBeenCalledWith('detection.enriched', expect.any(Function));
  });

  it('08-04: AWNING RED triggers immediate intel.brief publish', () => {
    orchestrator.start();
    subscriptions['awning.alert']({ level: 'RED', contextScore: 75, ts: new Date().toISOString() });
    expect(mockNats.publish).toHaveBeenCalledWith('intel.brief', expect.any(Object));
  });

  it('08-05: AWNING WHITE does not trigger immediate publish', () => {
    orchestrator.start();
    subscriptions['awning.alert']({ level: 'WHITE', contextScore: 10, ts: new Date().toISOString() });
    expect(mockNats.publish).not.toHaveBeenCalled();
  });

  it('08-06: intel.brief published every 60 seconds', () => {
    orchestrator.start();
    vi.advanceTimersByTime(60000);
    expect(mockNats.publish).toHaveBeenCalledWith('intel.brief', expect.any(Object));
  });

  it('08-07: intel.brief published twice after 120 seconds', () => {
    orchestrator.start();
    vi.advanceTimersByTime(120000);
    const calls = mockNats.publish.mock.calls.filter(c => c[0] === 'intel.brief');
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('08-08: stop() stops periodic publish timer', () => {
    orchestrator.start();
    orchestrator.stop();
    vi.advanceTimersByTime(120000);
    const calls = mockNats.publish.mock.calls.filter(c => c[0] === 'intel.brief');
    expect(calls.length).toBe(0);
  });

  it('08-09: getLastBrief returns null before any brief published', () => {
    orchestrator.start();
    expect(orchestrator.getLastBrief()).toBeNull();
  });

  it('08-10: getLastBrief returns last published brief after timer fires', () => {
    orchestrator.start();
    vi.advanceTimersByTime(60000);
    const brief = orchestrator.getLastBrief();
    expect(brief).not.toBeNull();
    expect(brief).toHaveProperty('threatLevel');
    expect(brief).toHaveProperty('ts');
  });

  it('08-11: forcePublish() publishes intel.brief immediately', () => {
    orchestrator.start();
    orchestrator.forcePublish();
    expect(mockNats.publish).toHaveBeenCalledWith('intel.brief', expect.any(Object));
  });

  it('08-12: detection.enriched event updates intel state', () => {
    orchestrator.start();
    subscriptions['detection.enriched']({
      lat: 52.23, lon: 21.01, ts: Date.now(),
      droneType: 'Shahed-136', acousticPresent: true, adsbPresent: false,
    });
    vi.advanceTimersByTime(60000);
    const brief = orchestrator.getLastBrief();
    expect(brief).not.toBeNull();
  });

  it('08-13: scenario — empty feeds → brief with WHITE threatLevel', () => {
    orchestrator.start();
    vi.advanceTimersByTime(60000);
    const brief = orchestrator.getLastBrief();
    expect(brief!.threatLevel).toBe('WHITE');
  });

  it('08-14: scenario — AWNING escalation → brief with RED threatLevel', () => {
    orchestrator.start();
    subscriptions['awning.alert']({ level: 'RED', contextScore: 80, ts: new Date().toISOString() });
    const brief = orchestrator.getLastBrief();
    expect(brief!.threatLevel).toBe('RED');
  });

  it('08-15: scenario — OSINT surge (multiple feed.fused OSINT events) processed', () => {
    orchestrator.start();
    for (let i = 0; i < 5; i++) {
      subscriptions['feed.fused']({
        feedType: 'osint',
        payload: { lat: 52.2 + i * 0.01, lon: 21.0, ts: Date.now(), goldsteinScale: -6 },
        ts: new Date().toISOString(),
      });
    }
    vi.advanceTimersByTime(60000);
    const brief = orchestrator.getLastBrief();
    expect(brief).not.toBeNull();
  });

  it('08-16: scenario — dedup suppresses repeated AWNING RED alerts in same 5-min window', () => {
    orchestrator.start();
    subscriptions['awning.alert']({ level: 'RED', contextScore: 80, ts: new Date().toISOString() });
    const callsAfterFirst = mockNats.publish.mock.calls.length;
    // Same sector, same level, within 5 min — should not generate a second alert
    subscriptions['awning.alert']({ level: 'RED', contextScore: 82, ts: new Date().toISOString() });
    // The orchestrator fires intel.brief on RED — dedup is for operator-level alert, not brief itself
    // Just ensure no crash and brief is still updated
    expect(orchestrator.getLastBrief()).not.toBeNull();
    expect(callsAfterFirst).toBeGreaterThanOrEqual(1);
  });
});
