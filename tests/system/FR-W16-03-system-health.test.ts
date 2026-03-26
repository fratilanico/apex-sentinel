// APEX-SENTINEL W16 Tests — FR-W16-03: SystemHealthDashboard
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SystemHealthDashboard, NatsPublishClient, FeedClientStatus } from '../../src/system/system-health-dashboard.js';

describe('FR-W16-03: SystemHealthDashboard', () => {
  let dashboard: SystemHealthDashboard;

  beforeEach(() => {
    dashboard = new SystemHealthDashboard();
    vi.useFakeTimers();
  });

  afterEach(() => {
    dashboard.stopPublishing();
    vi.useRealTimers();
  });

  it('FR-W16-03-01: getSystemScore() starts at 100 with all nominal', () => {
    expect(dashboard.getSystemScore()).toBe(100);
  });

  it('FR-W16-03-02: offline feed client deducts 20 points', () => {
    dashboard.setFeedClients([
      { name: 'adsb-exchange', status: 'offline' },
    ]);
    expect(dashboard.getSystemScore()).toBe(80);
  });

  it('FR-W16-03-03: two offline feed clients deduct 40 points', () => {
    dashboard.setFeedClients([
      { name: 'adsb-exchange', status: 'offline' },
      { name: 'civil-protection', status: 'offline' },
    ]);
    expect(dashboard.getSystemScore()).toBe(60);
  });

  it('FR-W16-03-04: NATS degraded deducts 40 points', () => {
    dashboard.setNatsStatus('degraded');
    expect(dashboard.getSystemScore()).toBe(60);
  });

  it('FR-W16-03-05: NATS offline deducts 40 points', () => {
    dashboard.setNatsStatus('offline');
    expect(dashboard.getSystemScore()).toBe(60);
  });

  it('FR-W16-03-06: >1 offline sensor node deducts 15 per additional node', () => {
    dashboard.setNodeAggregator({ getOfflineCount: () => 3 }); // 2 additional → -30
    expect(dashboard.getSystemScore()).toBe(70);
  });

  it('FR-W16-03-07: 1 offline node has no deduction (first is expected)', () => {
    dashboard.setNodeAggregator({ getOfflineCount: () => 1 });
    expect(dashboard.getSystemScore()).toBe(100);
  });

  it('FR-W16-03-08: score never goes below 0', () => {
    dashboard.setNatsStatus('degraded');
    dashboard.setFeedClients([
      { name: 'a', status: 'offline' },
      { name: 'b', status: 'offline' },
      { name: 'c', status: 'offline' },
      { name: 'd', status: 'offline' },
    ]);
    const score = dashboard.getSystemScore();
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('FR-W16-03-09: getHealthReport() includes components and degradations', () => {
    dashboard.setNatsStatus('degraded');
    dashboard.setFeedClients([{ name: 'adsb-exchange', status: 'offline' }]);

    const report = dashboard.getHealthReport();
    expect(report.score).toBeLessThan(100);
    expect(report.components.some(c => c.name === 'NATS')).toBe(true);
    expect(report.components.some(c => c.name === 'adsb-exchange')).toBe(true);
    expect(report.degradations.length).toBeGreaterThan(0);
  });

  it('FR-W16-03-10: startPublishing() calls natsClient.publish on interval', () => {
    const mockNats: NatsPublishClient = { publish: vi.fn() };
    dashboard.setNatsClient(mockNats);
    dashboard.startPublishing(30_000);

    vi.advanceTimersByTime(30_000);
    expect(mockNats.publish).toHaveBeenCalledWith('system.health', expect.objectContaining({ score: 100 }));
  });

  it('FR-W16-03-11: stopPublishing() stops interval', () => {
    const mockNats: NatsPublishClient = { publish: vi.fn() };
    dashboard.setNatsClient(mockNats);
    dashboard.startPublishing(30_000);
    dashboard.stopPublishing();

    vi.advanceTimersByTime(60_000);
    expect(mockNats.publish).not.toHaveBeenCalled();
  });

  it('FR-W16-03-12: publishNow() immediately publishes to system.health', () => {
    const mockNats: NatsPublishClient = { publish: vi.fn() };
    dashboard.setNatsClient(mockNats);
    dashboard.publishNow();

    expect(mockNats.publish).toHaveBeenCalledOnce();
    expect(mockNats.publish).toHaveBeenCalledWith('system.health', expect.objectContaining({ ts: expect.any(Number) }));
  });
});
