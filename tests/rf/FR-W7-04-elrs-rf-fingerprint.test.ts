// APEX-SENTINEL — W7 ELRS RF Fingerprint Tests
// FR-W7-04 | tests/rf/FR-W7-04-elrs-rf-fingerprint.test.ts
// TDD RED phase — new module src/rf/elrs-fingerprint does not exist yet
// ELRS 900MHz (Foxeer TRX1003) confirmed as Russian FPV RF link

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ElrsRfFingerprint,
  ElrsPacketLossEvent,
} from '../../src/rf/elrs-fingerprint.js';
import type {
  ElrsConfig,
  RfSample,
} from '../../src/rf/elrs-fingerprint.js';

describe('FR-W7-04: ElrsRfFingerprint', () => {
  let fingerprint: ElrsRfFingerprint;
  const defaultConfig: ElrsConfig = {
    frequencyMhz: 915,
    burstThresholdDbm: -80,
  };

  // Helper: generate a stream of periodic ELRS packets at 500Hz (every 2ms)
  function makePacketStream(count: number, startMs = 0, intervalMs = 2): RfSample[] {
    const samples: RfSample[] = [];
    for (let i = 0; i < count; i++) {
      samples.push({
        timestampMs: startMs + i * intervalMs,
        powerDbm: -70,
        frequencyMhz: 915,
      });
    }
    return samples;
  }

  beforeEach(() => {
    fingerprint = new ElrsRfFingerprint(defaultConfig);
  });

  // --- Constructor ---

  it('FR-W7-04-01: GIVEN ElrsRfFingerprint constructed with {frequencyMhz:915, burstThresholdDbm:-80}, THEN constructor does not throw', () => {
    expect(() => new ElrsRfFingerprint({ frequencyMhz: 915, burstThresholdDbm: -80 })).not.toThrow();
  });

  // --- processSample() API ---

  it('FR-W7-04-02: GIVEN a valid RfSample, WHEN processSample called, THEN does not throw', () => {
    const sample: RfSample = { timestampMs: Date.now(), powerDbm: -70, frequencyMhz: 915 };
    expect(() => fingerprint.processSample(sample)).not.toThrow();
  });

  // --- rfSilent initial state ---

  it('FR-W7-04-03: GIVEN freshly constructed fingerprint, THEN rfSilent is false', () => {
    expect(fingerprint.rfSilent).toBe(false);
  });

  // --- Steady packet stream → not silent ---

  it('FR-W7-04-04: GIVEN steady ELRS packet stream every 2ms (500Hz), WHEN 200 packets processed, THEN rfSilent is false', () => {
    const packets = makePacketStream(200, Date.now());
    for (const pkt of packets) {
      fingerprint.processSample(pkt);
    }
    expect(fingerprint.rfSilent).toBe(false);
  });

  // --- 2000ms silence → rfSilent=true ---

  it('FR-W7-04-05: GIVEN no packets received for 2000ms, WHEN isSilent checked after window, THEN rfSilent is true', () => {
    const now = Date.now();
    // Simulate last packet 2001ms ago
    fingerprint.processSample({ timestampMs: now - 2001, powerDbm: -70, frequencyMhz: 915 });
    fingerprint.tick(now); // advance time
    expect(fingerprint.rfSilent).toBe(true);
  });

  // --- Recovery after silence ---

  it('FR-W7-04-06: GIVEN rfSilent=true after 2000ms gap, WHEN packets resume and processSample called, THEN rfSilent returns to false', () => {
    const now = Date.now();
    // Make it silent
    fingerprint.processSample({ timestampMs: now - 2001, powerDbm: -70, frequencyMhz: 915 });
    fingerprint.tick(now);
    expect(fingerprint.rfSilent).toBe(true);

    // Resume packets
    const resumePackets = makePacketStream(50, now, 2);
    for (const pkt of resumePackets) {
      fingerprint.processSample(pkt);
    }
    fingerprint.tick(now + 100);
    expect(fingerprint.rfSilent).toBe(false);
  });

  // --- getPacketLossRate() normal ---

  it('FR-W7-04-07: GIVEN steady packet stream with no gaps, WHEN getPacketLossRate called, THEN returns 0.0', () => {
    const now = Date.now();
    const packets = makePacketStream(100, now - 200, 2); // 100 packets over 200ms (expected ~100)
    for (const pkt of packets) {
      fingerprint.processSample(pkt);
    }
    fingerprint.tick(now);
    expect(fingerprint.getPacketLossRate()).toBeCloseTo(0.0, 1);
  });

  // --- getPacketLossRate() = 1.0 when no packets in window ---

  it('FR-W7-04-08: GIVEN no packets in observation window, WHEN getPacketLossRate called, THEN returns 1.0', () => {
    // No packets processed at all — full loss
    const lossRate = fingerprint.getPacketLossRate();
    expect(lossRate).toBe(1.0);
  });

  // --- getPacketLossRate() = ~0.8 → rfSilent=true ---

  it('FR-W7-04-09: GIVEN 80% of expected packets missing, WHEN getPacketLossRate checked, THEN returns ~0.8 and rfSilent becomes true', () => {
    const now = Date.now();
    // Expected 100 packets in 200ms window @ 2ms interval; only send 20 (80% loss)
    const packets = makePacketStream(20, now - 200, 10); // sparse — 10ms apart
    for (const pkt of packets) {
      fingerprint.processSample(pkt);
    }
    fingerprint.tick(now);
    expect(fingerprint.getPacketLossRate()).toBeGreaterThanOrEqual(0.7);
    expect(fingerprint.rfSilent).toBe(true);
  });

  // --- Non-ELRS traffic does not trigger rfSilent ---

  it('FR-W7-04-10: GIVEN traffic at wrong frequency (2400MHz) or wrong burst timing, WHEN processSample called, THEN rfSilent is not set based on non-ELRS traffic', () => {
    const now = Date.now();
    // Wrong frequency — WiFi-like 2.4GHz
    const wrongFreqPackets: RfSample[] = Array.from({ length: 100 }, (_, i) => ({
      timestampMs: now - 200 + i * 2,
      powerDbm: -60,
      frequencyMhz: 2400, // not 915MHz
    }));
    for (const pkt of wrongFreqPackets) {
      fingerprint.processSample(pkt);
    }
    fingerprint.tick(now);
    // rfSilent should be based on ELRS (915MHz) packets only — none received
    expect(fingerprint.rfSilent).toBe(true); // no valid ELRS packets → silent
  });

  // --- ElrsPacketLossEvent emitted ---

  it('FR-W7-04-11: GIVEN packet loss rate crosses 0.8 threshold, WHEN event listener attached, THEN ElrsPacketLossEvent is emitted', () => {
    const listener = vi.fn();
    fingerprint.on('packetLoss', listener);

    const now = Date.now();
    // Sparse packets → high loss rate
    const sparsePackets = makePacketStream(5, now - 200, 40);
    for (const pkt of sparsePackets) {
      fingerprint.processSample(pkt);
    }
    fingerprint.tick(now);

    expect(listener).toHaveBeenCalled();
    const event: ElrsPacketLossEvent = listener.mock.calls[0][0];
    expect(event.lossRate).toBeGreaterThanOrEqual(0.8);
    expect(event.timestampMs).toBeGreaterThan(0);
  });

  // --- reset() ---

  it('FR-W7-04-12: GIVEN fingerprint with accumulated state (rfSilent=true), WHEN reset called, THEN rfSilent is false and packet history is cleared', () => {
    const now = Date.now();
    fingerprint.processSample({ timestampMs: now - 2001, powerDbm: -70, frequencyMhz: 915 });
    fingerprint.tick(now);
    expect(fingerprint.rfSilent).toBe(true);

    fingerprint.reset();

    expect(fingerprint.rfSilent).toBe(false);
    expect(fingerprint.getPacketLossRate()).toBe(1.0); // no history
  });
});
