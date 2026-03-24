// APEX-SENTINEL — TDD RED Tests
// FR-W3-06: Mobile Event Publisher + Offline Buffer
// Status: RED — implementation in src/mobile/event-publisher.ts does NOT exist yet

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EventPublisher,
  type PublishResult,
  type PendingEvent,
} from '../../src/mobile/event-publisher.js';

describe('FR-W3-06-00: Mobile Event Publisher + Offline Buffer', () => {

  describe('FR-W3-06-01: buildDetectionPayload returns valid JSON string', () => {
    it('returns a string that parses as JSON without throwing', () => {
      const publisher = new EventPublisher(100);
      const payload = publisher.buildDetectionPayload('node-ua-001', 0.92, 48.85837, 2.29450, 120.5);
      expect(() => JSON.parse(payload)).not.toThrow();
    });
  });

  describe('FR-W3-06-02: parsed payload contains nodeId field', () => {
    it('parsed JSON has a nodeId property matching the argument', () => {
      const publisher = new EventPublisher(100);
      const payload = publisher.buildDetectionPayload('node-ua-001', 0.92, 48.85837, 2.29450, 120.5);
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      expect(parsed).toHaveProperty('nodeId', 'node-ua-001');
    });
  });

  describe('FR-W3-06-03: parsed payload droneConfidence is in [0, 1]', () => {
    it('droneConfidence value is between 0 and 1 inclusive', () => {
      const publisher = new EventPublisher(100);
      const payload = publisher.buildDetectionPayload('node-ua-001', 0.92, 48.85837, 2.29450, 120.5);
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      const conf = parsed['droneConfidence'] as number;
      expect(conf).toBeGreaterThanOrEqual(0);
      expect(conf).toBeLessThanOrEqual(1);
    });

    it('droneConfidence is a number', () => {
      const publisher = new EventPublisher(100);
      const payload = publisher.buildDetectionPayload('node-ua-001', 0.75, 48.0, 2.0, 50.0);
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      expect(typeof parsed['droneConfidence']).toBe('number');
    });
  });

  describe('FR-W3-06-04: parsed payload lat has at most 5 decimal places (privacy)', () => {
    it('latitude is truncated to ≤5 decimal places', () => {
      const publisher = new EventPublisher(100);
      // provide high-precision lat (8 decimal places)
      const payload = publisher.buildDetectionPayload('node-ua-001', 0.92, 48.85837123, 2.29450, 120.5);
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      const lat = parsed['lat'] as number;
      // convert to string and count decimals
      const decimalStr = lat.toString().split('.')[1] ?? '';
      expect(decimalStr.length).toBeLessThanOrEqual(5);
    });

    it('longitude is also truncated to ≤5 decimal places', () => {
      const publisher = new EventPublisher(100);
      const payload = publisher.buildDetectionPayload('node-ua-001', 0.92, 48.85837, 2.29450987, 120.5);
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      const lon = parsed['lon'] as number;
      const decimalStr = lon.toString().split('.')[1] ?? '';
      expect(decimalStr.length).toBeLessThanOrEqual(5);
    });
  });

  describe('FR-W3-06-05: validatePayload returns valid=true for well-formed payload', () => {
    it('accepts a correctly structured detection payload', () => {
      const publisher = new EventPublisher(100);
      const payload = publisher.buildDetectionPayload('node-ua-001', 0.92, 48.85837, 2.29450, 120.5);
      const result = publisher.validatePayload(payload);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('FR-W3-06-06: validatePayload returns valid=false for non-JSON string', () => {
    it('rejects a plain non-JSON string', () => {
      const publisher = new EventPublisher(100);
      const result = publisher.validatePayload('not json at all');
      expect(result.valid).toBe(false);
    });

    it('errors array is non-empty for invalid JSON', () => {
      const publisher = new EventPublisher(100);
      const result = publisher.validatePayload('{broken json');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('FR-W3-06-07: validatePayload returns valid=false for JSON missing nodeId', () => {
    it('rejects JSON without nodeId field', () => {
      const publisher = new EventPublisher(100);
      const noNodeId = JSON.stringify({ droneConfidence: 0.9, lat: 48.1, lon: 2.1, altM: 100 });
      const result = publisher.validatePayload(noNodeId);
      expect(result.valid).toBe(false);
    });

    it('includes nodeId in errors when missing', () => {
      const publisher = new EventPublisher(100);
      const noNodeId = JSON.stringify({ droneConfidence: 0.9 });
      const result = publisher.validatePayload(noNodeId);
      expect(result.errors.some((e) => e.toLowerCase().includes('nodeid'))).toBe(true);
    });
  });

  describe('FR-W3-06-08: bufferEvent increments getPendingCount', () => {
    it('pending count increases by 1 after bufferEvent', () => {
      const publisher = new EventPublisher(100);
      expect(publisher.getPendingCount()).toBe(0);
      publisher.bufferEvent('sentinel.detections.node-ua-001', JSON.stringify({ nodeId: 'node-ua-001' }));
      expect(publisher.getPendingCount()).toBe(1);
    });

    it('multiple buffered events accumulate', () => {
      const publisher = new EventPublisher(100);
      publisher.bufferEvent('subject.a', '{"nodeId":"a"}');
      publisher.bufferEvent('subject.b', '{"nodeId":"b"}');
      publisher.bufferEvent('subject.c', '{"nodeId":"c"}');
      expect(publisher.getPendingCount()).toBe(3);
    });
  });

  describe('FR-W3-06-09: flushPending returns all buffered events and resets count to 0', () => {
    it('returns all pending events', () => {
      const publisher = new EventPublisher(100);
      publisher.bufferEvent('subject.a', '{"nodeId":"a"}');
      publisher.bufferEvent('subject.b', '{"nodeId":"b"}');
      const events = publisher.flushPending();
      expect(events).toHaveLength(2);
    });

    it('resets pending count to 0 after flush', () => {
      const publisher = new EventPublisher(100);
      publisher.bufferEvent('subject.a', '{"nodeId":"a"}');
      publisher.flushPending();
      expect(publisher.getPendingCount()).toBe(0);
    });

    it('returns empty array when no events are buffered', () => {
      const publisher = new EventPublisher(100);
      expect(publisher.flushPending()).toEqual([]);
    });
  });

  describe('FR-W3-06-10: isBufferFull returns true at maxBufferSize', () => {
    it('isBufferFull is false before reaching maxBufferSize', () => {
      const publisher = new EventPublisher(3);
      publisher.bufferEvent('s', '{"nodeId":"x"}');
      publisher.bufferEvent('s', '{"nodeId":"x"}');
      expect(publisher.isBufferFull()).toBe(false);
    });

    it('isBufferFull is true when pendingCount equals maxBufferSize', () => {
      const publisher = new EventPublisher(2);
      publisher.bufferEvent('s', '{"nodeId":"x"}');
      publisher.bufferEvent('s', '{"nodeId":"x"}');
      expect(publisher.isBufferFull()).toBe(true);
    });

    it('isBufferFull is true when pendingCount exceeds maxBufferSize', () => {
      const publisher = new EventPublisher(1);
      publisher.bufferEvent('s', '{"nodeId":"x"}');
      publisher.bufferEvent('s', '{"nodeId":"x"}');
      expect(publisher.isBufferFull()).toBe(true);
    });
  });

  describe('FR-W3-06-11: pruneOldEvents removes events older than maxAgeMs and returns count removed', () => {
    it('removes events whose createdAt is older than maxAgeMs from now', async () => {
      const publisher = new EventPublisher(100);
      // buffer an event — it will be stamped with Date.now()
      publisher.bufferEvent('s', '{"nodeId":"x"}');
      // prune with maxAgeMs=0 meaning anything at all old should be pruned
      // wait 2ms so the event is definitely older than 0ms
      await new Promise((r) => setTimeout(r, 2));
      const removed = publisher.pruneOldEvents(0);
      expect(removed).toBeGreaterThanOrEqual(1);
    });

    it('does not remove events newer than maxAgeMs', () => {
      const publisher = new EventPublisher(100);
      publisher.bufferEvent('s', '{"nodeId":"x"}');
      // prune with a very large maxAgeMs — nothing should be pruned
      const removed = publisher.pruneOldEvents(60_000);
      expect(removed).toBe(0);
      expect(publisher.getPendingCount()).toBe(1);
    });

    it('returns 0 when buffer is empty', () => {
      const publisher = new EventPublisher(100);
      expect(publisher.pruneOldEvents(1000)).toBe(0);
    });
  });

});
