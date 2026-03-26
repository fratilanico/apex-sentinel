import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WatchdogMonitor } from '../../src/resilience/watchdog-monitor.js';

describe('FR-W15-04: Watchdog Monitor', () => {
  let wdog: WatchdogMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    wdog = new WatchdogMonitor({ checkIntervalMs: 10000, failureThreshold: 3 });
  });

  afterEach(() => {
    wdog.stop();
    vi.useRealTimers();
  });

  const healthy = { isHealthy: async () => true };
  const unhealthy = { isHealthy: async () => false };

  it('WDG-01: register adds component to health report', () => {
    wdog.register('nats', healthy);
    const report = wdog.getHealthReport();
    expect(report).toHaveProperty('nats');
  });

  it('WDG-02: unregister removes component', () => {
    wdog.register('nats', healthy);
    wdog.unregister('nats');
    const report = wdog.getHealthReport();
    expect(report).not.toHaveProperty('nats');
  });

  it('WDG-03: healthy component shows healthy=true in report', async () => {
    wdog.register('nats', healthy);
    wdog.start();
    await vi.advanceTimersByTimeAsync(10001);
    const report = wdog.getHealthReport();
    expect(report['nats']!.healthy).toBe(true);
    expect(report['nats']!.consecutiveFailures).toBe(0);
  });

  it('WDG-04: unhealthy component increments consecutiveFailures', async () => {
    wdog.register('feed', unhealthy);
    wdog.start();
    await vi.advanceTimersByTimeAsync(10001);
    const report = wdog.getHealthReport();
    expect(report['feed']!.consecutiveFailures).toBeGreaterThanOrEqual(1);
  });

  it('WDG-05: emits restart event after 3 consecutive failures', async () => {
    const restartSpy = vi.fn();
    wdog.on('restart', restartSpy);
    wdog.register('feed', unhealthy);
    wdog.start();
    await vi.advanceTimersByTimeAsync(35000); // 3+ checks
    expect(restartSpy).toHaveBeenCalledWith('feed');
  });

  it('WDG-06: restart event includes component name', async () => {
    let restartedName = '';
    wdog.on('restart', (name: string) => { restartedName = name; });
    wdog.register('dashboard', unhealthy);
    wdog.start();
    await vi.advanceTimersByTimeAsync(35000);
    expect(restartedName).toBe('dashboard');
  });

  it('WDG-07: healthy component does not trigger restart', async () => {
    const restartSpy = vi.fn();
    wdog.on('restart', restartSpy);
    wdog.register('nats', healthy);
    wdog.start();
    await vi.advanceTimersByTimeAsync(60000);
    expect(restartSpy).not.toHaveBeenCalled();
  });

  it('WDG-08: multiple components tracked independently', async () => {
    wdog.register('nats', healthy);
    wdog.register('feed', unhealthy);
    wdog.start();
    await vi.advanceTimersByTimeAsync(10001);
    const report = wdog.getHealthReport();
    expect(report['nats']!.healthy).toBe(true);
    expect(report['feed']!.healthy).toBe(false);
  });

  it('WDG-09: getHealthReport returns all registered components', () => {
    wdog.register('a', healthy);
    wdog.register('b', healthy);
    wdog.register('c', unhealthy);
    const report = wdog.getHealthReport();
    expect(Object.keys(report)).toHaveLength(3);
  });

  it('WDG-10: stop prevents further health checks', async () => {
    const checkSpy = vi.fn().mockResolvedValue(true);
    wdog.register('x', { isHealthy: checkSpy });
    wdog.start();
    await vi.advanceTimersByTimeAsync(10001);
    const countBefore = checkSpy.mock.calls.length;
    wdog.stop();
    await vi.advanceTimersByTimeAsync(30000);
    expect(checkSpy.mock.calls.length).toBe(countBefore);
  });

  it('WDG-11: failure count resets after healthy check', async () => {
    let callCount = 0;
    const flaky = { isHealthy: async () => { callCount++; return callCount > 2; } };
    wdog.register('flaky', flaky);
    wdog.start();
    await vi.advanceTimersByTimeAsync(35000);
    const report = wdog.getHealthReport();
    expect(report['flaky']!.consecutiveFailures).toBe(0);
  });

  it('WDG-12: emits system_critical after 60s of no check response (dead-man)', async () => {
    const criticalSpy = vi.fn();
    wdog.on('system_critical', criticalSpy);
    const stuck = { isHealthy: () => new Promise<boolean>(() => {}) }; // never resolves
    wdog.register('stuck', stuck);
    wdog.start();
    await vi.advanceTimersByTimeAsync(70000);
    expect(criticalSpy).toHaveBeenCalled();
  });
});
