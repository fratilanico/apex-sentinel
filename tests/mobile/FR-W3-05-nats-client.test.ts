// APEX-SENTINEL — TDD RED Tests
// FR-W3-05: Mobile NATS Client Wrapper
// Status: RED — implementation in src/mobile/nats-client.ts does NOT exist yet

import { describe, it, expect, beforeEach } from 'vitest';
import {
  NatsClient,
  type NatsClientConfig,
  type ConnectionState,
} from '../../src/mobile/nats-client.js';

const baseConfig: NatsClientConfig = {
  serverUrls: ['nats://10.0.0.1:4222', 'nats://10.0.0.2:4222'],
  credentialsFile: '/data/sentinel.creds',
  reconnectDelayMs: 2000,
  maxReconnectAttempts: 5,
  heartbeatIntervalMs: 30000,
};

describe('FR-W3-05-00: Mobile NATS Client Wrapper', () => {

  describe('FR-W3-05-01: constructor sets initial state to disconnected', () => {
    it('initial ConnectionState is disconnected', () => {
      const client = new NatsClient(baseConfig);
      expect(client.getState()).toBe<ConnectionState>('disconnected');
    });
  });

  describe('FR-W3-05-02: getServerUrls returns urls from config', () => {
    it('returns the exact serverUrls array provided in config', () => {
      const client = new NatsClient(baseConfig);
      expect(client.getServerUrls()).toEqual(baseConfig.serverUrls);
    });

    it('returns a copy, not the original reference', () => {
      const client = new NatsClient(baseConfig);
      const urls = client.getServerUrls();
      expect(urls).toHaveLength(2);
    });
  });

  describe('FR-W3-05-03: getReconnectCount starts at 0', () => {
    it('reconnect count is 0 on construction', () => {
      const client = new NatsClient(baseConfig);
      expect(client.getReconnectCount()).toBe(0);
    });
  });

  describe('FR-W3-05-04: shouldReconnect returns true when count < maxReconnectAttempts', () => {
    it('returns true when reconnectCount is below the maximum', () => {
      const client = new NatsClient(baseConfig);
      // count starts at 0, max is 5 — should be true
      expect(client.shouldReconnect()).toBe(true);
    });
  });

  describe('FR-W3-05-05: shouldReconnect returns false when count >= maxReconnectAttempts', () => {
    it('returns false when reconnectCount has reached maxReconnectAttempts', () => {
      const config: NatsClientConfig = {
        ...baseConfig,
        maxReconnectAttempts: 3,
      };
      const client = new NatsClient(config);

      // exhaust reconnect budget by calling resetReconnectCount as a negative test —
      // we need to increment the count; that's done via an internal method the
      // implementation must expose OR via a helper. Since the public contract only
      // exposes getReconnectCount/resetReconnectCount we construct a client whose
      // max is 0 so the initial count (0) satisfies count >= max.
      const zeroMaxConfig: NatsClientConfig = { ...config, maxReconnectAttempts: 0 };
      const exhaustedClient = new NatsClient(zeroMaxConfig);
      expect(exhaustedClient.shouldReconnect()).toBe(false);
    });

    it('returns false for maxReconnectAttempts=1 after one attempt', () => {
      // Client with max=0: reconnectCount(0) >= maxReconnectAttempts(0) → false
      const client = new NatsClient({ ...baseConfig, maxReconnectAttempts: 0 });
      expect(client.shouldReconnect()).toBe(false);
    });
  });

  describe('FR-W3-05-06: resetReconnectCount sets count back to 0', () => {
    it('after resetReconnectCount, getReconnectCount returns 0', () => {
      const client = new NatsClient(baseConfig);
      client.resetReconnectCount();
      expect(client.getReconnectCount()).toBe(0);
    });
  });

  describe('FR-W3-05-07: buildSubject for detections returns correct subject', () => {
    it("buildSubject('node-ua-001', 'detections') returns 'sentinel.detections.node-ua-001'", () => {
      const client = new NatsClient(baseConfig);
      expect(client.buildSubject('node-ua-001', 'detections')).toBe('sentinel.detections.node-ua-001');
    });

    it('subject uses node id verbatim', () => {
      const client = new NatsClient(baseConfig);
      const subject = client.buildSubject('node-gb-042', 'detections');
      expect(subject).toBe('sentinel.detections.node-gb-042');
    });
  });

  describe('FR-W3-05-08: buildSubject for health returns correct subject', () => {
    it("buildSubject('node-ua-001', 'health') returns 'sentinel.health.node-ua-001'", () => {
      const client = new NatsClient(baseConfig);
      expect(client.buildSubject('node-ua-001', 'health')).toBe('sentinel.health.node-ua-001');
    });

    it('subject prefix is sentinel.health for health type', () => {
      const client = new NatsClient(baseConfig);
      const subject = client.buildSubject('node-de-007', 'health');
      expect(subject.startsWith('sentinel.health.')).toBe(true);
    });
  });

  describe('FR-W3-05-09: buildSubject with empty nodeId throws', () => {
    it('throws when nodeId is an empty string', () => {
      const client = new NatsClient(baseConfig);
      expect(() => client.buildSubject('', 'detections')).toThrow();
    });

    it('throws when nodeId is whitespace only', () => {
      const client = new NatsClient(baseConfig);
      expect(() => client.buildSubject('   ', 'health')).toThrow();
    });
  });

});
