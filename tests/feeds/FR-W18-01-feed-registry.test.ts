// APEX-SENTINEL W18 — FR-W18-01: EuDataFeedRegistry
// TDD RED — src/feeds/eu-data-feed-registry.ts not yet written

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EuDataFeedRegistry } from '../../src/feeds/eu-data-feed-registry.js';
import type { FeedDescriptor, FeedHealth } from '../../src/feeds/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OPENSKY_DESCRIPTOR: FeedDescriptor = {
  feedId: 'opensky-ro',
  name: 'OpenSky Network Romania',
  type: 'aircraft',
  tier: 1,
  pollIntervalMs: 30_000,
  url: 'https://opensky-network.org/api/states/all',
};

const NOTAM_DESCRIPTOR: FeedDescriptor = {
  feedId: 'notam-lrop',
  name: 'NOTAM LROP',
  type: 'notam',
  tier: 2,
  pollIntervalMs: 300_000,
  url: 'https://external-api.faa.gov/notamapi/v1/notams',
};

const EASA_DESCRIPTOR: FeedDescriptor = {
  feedId: 'easa-uas-zones',
  name: 'EASA UAS Zones Romania',
  type: 'zone',
  tier: 3,
  pollIntervalMs: 1_800_000,
  url: 'https://drone.rules.eu/api/v1/uas-zones',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FR-W18-01: EuDataFeedRegistry', () => {
  let registry: EuDataFeedRegistry;

  beforeEach(() => {
    registry = new EuDataFeedRegistry();
  });

  it('01-01: constructor creates empty registry', () => {
    expect(registry.getAllHealth()).toEqual([]);
  });

  it('01-02: register() adds feed descriptor', () => {
    registry.register(OPENSKY_DESCRIPTOR);
    const health = registry.getHealth('opensky-ro');
    expect(health).toBeDefined();
    expect(health!.feedId).toBe('opensky-ro');
  });

  it('01-03: register() throws if duplicate feedId', () => {
    registry.register(OPENSKY_DESCRIPTOR);
    expect(() => registry.register(OPENSKY_DESCRIPTOR)).toThrow(
      /already registered/i,
    );
  });

  it('01-04: deregister() removes feed', () => {
    registry.register(OPENSKY_DESCRIPTOR);
    registry.deregister('opensky-ro');
    expect(registry.getHealth('opensky-ro')).toBeUndefined();
  });

  it('01-05: getHealth() returns FeedHealth with status unknown for newly registered feed', () => {
    registry.register(OPENSKY_DESCRIPTOR);
    const health = registry.getHealth('opensky-ro');
    expect(health).toMatchObject<Partial<FeedHealth>>({
      feedId: 'opensky-ro',
      status: 'unknown',
      errorCount: 0,
    });
    expect(health!.lastSuccessTs).toBeNull();
  });

  it('01-06: recordSuccess() sets status to healthy, updates lastSuccessTs, records latencyMs', () => {
    registry.register(OPENSKY_DESCRIPTOR);
    const before = Date.now();
    registry.recordSuccess('opensky-ro', 142);
    const health = registry.getHealth('opensky-ro');
    expect(health!.status).toBe('healthy');
    expect(health!.latencyMs).toBe(142);
    expect(health!.lastSuccessTs).toBeGreaterThanOrEqual(before);
  });

  it('01-07: recordError() increments errorCount', () => {
    registry.register(NOTAM_DESCRIPTOR);
    registry.recordError('notam-lrop', new Error('timeout'));
    const health = registry.getHealth('notam-lrop');
    expect(health!.errorCount).toBe(1);
  });

  it('01-08: recordError() 3 times sets status to degraded', () => {
    registry.register(NOTAM_DESCRIPTOR);
    registry.recordError('notam-lrop', new Error('timeout'));
    registry.recordError('notam-lrop', new Error('timeout'));
    registry.recordError('notam-lrop', new Error('timeout'));
    const health = registry.getHealth('notam-lrop');
    expect(health!.status).toBe('degraded');
    expect(health!.errorCount).toBe(3);
  });

  it('01-09: recordError() 5 times sets status to down', () => {
    registry.register(NOTAM_DESCRIPTOR);
    for (let i = 0; i < 5; i++) {
      registry.recordError('notam-lrop', new Error('connection refused'));
    }
    const health = registry.getHealth('notam-lrop');
    expect(health!.status).toBe('down');
    expect(health!.errorCount).toBe(5);
  });

  it('01-10: getAllHealth() returns array of all FeedHealth', () => {
    registry.register(OPENSKY_DESCRIPTOR);
    registry.register(NOTAM_DESCRIPTOR);
    registry.register(EASA_DESCRIPTOR);
    const all = registry.getAllHealth();
    expect(all).toHaveLength(3);
    const ids = all.map((h) => h.feedId);
    expect(ids).toContain('opensky-ro');
    expect(ids).toContain('notam-lrop');
    expect(ids).toContain('easa-uas-zones');
  });

  it('01-11: getHealthyFeeds() returns only healthy and degraded feeds', () => {
    registry.register(OPENSKY_DESCRIPTOR);
    registry.register(NOTAM_DESCRIPTOR);
    registry.register(EASA_DESCRIPTOR);

    registry.recordSuccess('opensky-ro', 88);
    // NOTAM: 3 errors → degraded
    for (let i = 0; i < 3; i++) {
      registry.recordError('notam-lrop', new Error('timeout'));
    }
    // EASA: 5 errors → down
    for (let i = 0; i < 5; i++) {
      registry.recordError('easa-uas-zones', new Error('502 Bad Gateway'));
    }

    const healthy = registry.getHealthyFeeds();
    expect(healthy.map((h) => h.feedId)).toEqual(
      expect.arrayContaining(['opensky-ro', 'notam-lrop']),
    );
    expect(healthy.map((h) => h.feedId)).not.toContain('easa-uas-zones');
  });

  it('01-12: reset() clears all health records', () => {
    registry.register(OPENSKY_DESCRIPTOR);
    registry.register(NOTAM_DESCRIPTOR);
    registry.recordSuccess('opensky-ro', 50);
    registry.reset();
    expect(registry.getAllHealth()).toEqual([]);
  });
});
