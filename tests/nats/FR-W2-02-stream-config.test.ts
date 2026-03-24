// APEX-SENTINEL — TDD RED Tests
// FR-W2-02: NATS JetStream Stream Configuration
// Status: RED — implementation in src/nats/stream-config.ts does NOT exist yet

import { describe, it, expect } from 'vitest';
import {
  getStreamConfigs,
  getStreamConfig,
  validateSubject,
  type NatsStreamConfig,
} from '../../src/nats/stream-config.js';

describe('FR-W2-02-00: NATS JetStream Stream Configuration', () => {

  describe('FR-W2-02-01: getStreamConfigs() returns exactly 4 streams', () => {
    it('returns an array of 4 stream configs', () => {
      const configs = getStreamConfigs();
      expect(configs).toHaveLength(4);
    });

    it('includes DETECTIONS, NODE_HEALTH, ALERTS, COT_EVENTS', () => {
      const configs = getStreamConfigs();
      const names = configs.map((c: NatsStreamConfig) => c.name);
      expect(names).toContain('DETECTIONS');
      expect(names).toContain('NODE_HEALTH');
      expect(names).toContain('ALERTS');
      expect(names).toContain('COT_EVENTS');
    });
  });

  describe('FR-W2-02-02: DETECTIONS stream configuration', () => {
    it('has subjects ["sentinel.detections.>"]', () => {
      const config = getStreamConfig('DETECTIONS');
      expect(config.subjects).toEqual(['sentinel.detections.>']);
    });

    it('has replicas=3', () => {
      const config = getStreamConfig('DETECTIONS');
      expect(config.replicas).toBe(3);
    });

    it('has storage="file"', () => {
      const config = getStreamConfig('DETECTIONS');
      expect(config.storage).toBe('file');
    });

    it('has retention="limits"', () => {
      const config = getStreamConfig('DETECTIONS');
      expect(config.retention).toBe('limits');
    });
  });

  describe('FR-W2-02-03: NODE_HEALTH stream configuration', () => {
    it('has maxAge <= 300 seconds (5 minutes)', () => {
      const config = getStreamConfig('NODE_HEALTH');
      expect(config.maxAge).toBeGreaterThan(0);
      expect(config.maxAge).toBeLessThanOrEqual(300);
    });

    it('has retention="limits"', () => {
      const config = getStreamConfig('NODE_HEALTH');
      expect(config.retention).toBe('limits');
    });
  });

  describe('FR-W2-02-04: ALERTS stream has highest durability', () => {
    it('has replicas=5 (all nodes)', () => {
      const config = getStreamConfig('ALERTS');
      expect(config.replicas).toBe(5);
    });
  });

  describe('FR-W2-02-05: COT_EVENTS stream subjects', () => {
    it('has subjects ["sentinel.cot.>"]', () => {
      const config = getStreamConfig('COT_EVENTS');
      expect(config.subjects).toEqual(['sentinel.cot.>']);
    });
  });

  describe('FR-W2-02-06: getStreamConfig() with unknown name', () => {
    it('throws an error for a nonexistent stream name', () => {
      expect(() => getStreamConfig('NONEXISTENT')).toThrow();
    });

    it('error message references the unknown stream name', () => {
      expect(() => getStreamConfig('NONEXISTENT')).toThrow(/NONEXISTENT/);
    });
  });

  describe('FR-W2-02-07: validateSubject() — valid subjects', () => {
    it('returns true for "sentinel.detections.node-abc123"', () => {
      expect(validateSubject('sentinel.detections.node-abc123')).toBe(true);
    });

    it('returns true for wildcard "sentinel.detections.>"', () => {
      expect(validateSubject('sentinel.detections.>')).toBe(true);
    });

    it('returns true for "sentinel.cot.node-xyz"', () => {
      expect(validateSubject('sentinel.cot.node-xyz')).toBe(true);
    });
  });

  describe('FR-W2-02-08: validateSubject() — empty trailing token', () => {
    it('returns false for "sentinel.detections." (empty token after dot)', () => {
      expect(validateSubject('sentinel.detections.')).toBe(false);
    });

    it('returns false for subject ending with double dot', () => {
      expect(validateSubject('sentinel..detections')).toBe(false);
    });
  });

  describe('FR-W2-02-09: validateSubject() — empty string', () => {
    it('returns false for empty string', () => {
      expect(validateSubject('')).toBe(false);
    });
  });

  describe('FR-W2-02-10: all streams have deduplication enabled', () => {
    it('every stream has dedupWindow > 0', () => {
      const configs = getStreamConfigs();
      for (const config of configs) {
        expect(config.dedupWindow).toBeGreaterThan(0);
      }
    });
  });

});
