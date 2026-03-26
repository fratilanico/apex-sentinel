// APEX-SENTINEL — FR-W12-07: RfPrivacyFilter Tests
// tests/rf2/FR-W12-07-rf-privacy.test.ts

import { describe, it, expect } from 'vitest';
import {
  RfPrivacyFilter,
  type RawRfEvent,
  type FilteredRfEvent,
} from '../../src/rf2/rf-privacy-filter.js';

describe('FR-W12-07: RfPrivacyFilter', () => {
  const filter = new RfPrivacyFilter();

  const rawEvent: RawRfEvent = {
    frequencyMHz: 900,
    rssi: -65,
    ts: Date.now(),
    macAddress: 'AA:BB:CC:DD:EE:FF',
    rawPacketContent: Buffer.from('deadbeef', 'hex'),
    bearingEstimate: { lat: 51.500, lon: 0.000 },
  };

  // ── MAC hashing ───────────────────────────────────────────────────────────

  it('FR-W12-07-T01: MAC address is not present in filtered output', () => {
    const result = filter.filter(rawEvent);
    expect((result as any).macAddress).toBeUndefined();
  });

  it('FR-W12-07-T02: MAC hash is present in filtered output', () => {
    const result = filter.filter(rawEvent);
    expect(result.macHash).toBeDefined();
    expect(typeof result.macHash).toBe('string');
  });

  it('FR-W12-07-T03: MAC hash is a 64-char hex string (SHA-256)', () => {
    const result = filter.filter(rawEvent);
    expect(result.macHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('FR-W12-07-T04: same MAC on same day produces same hash', () => {
    const r1 = filter.filter(rawEvent);
    const r2 = filter.filter({ ...rawEvent, ts: rawEvent.ts + 1000 });
    expect(r1.macHash).toBe(r2.macHash);
  });

  it('FR-W12-07-T05: different MACs produce different hashes', () => {
    const r1 = filter.filter(rawEvent);
    const r2 = filter.filter({ ...rawEvent, macAddress: '11:22:33:44:55:66' });
    expect(r1.macHash).not.toBe(r2.macHash);
  });

  // ── Raw packet content stripped ───────────────────────────────────────────

  it('FR-W12-07-T06: rawPacketContent is stripped from output', () => {
    const result = filter.filter(rawEvent);
    expect((result as any).rawPacketContent).toBeUndefined();
  });

  // ── Retained fields ───────────────────────────────────────────────────────

  it('FR-W12-07-T07: frequencyMHz is retained in output', () => {
    const result = filter.filter(rawEvent);
    expect(result.frequencyMHz).toBe(rawEvent.frequencyMHz);
  });

  it('FR-W12-07-T08: rssi is retained in output', () => {
    const result = filter.filter(rawEvent);
    expect(result.rssi).toBe(rawEvent.rssi);
  });

  it('FR-W12-07-T09: ts is retained in output', () => {
    const result = filter.filter(rawEvent);
    expect(result.ts).toBe(rawEvent.ts);
  });

  it('FR-W12-07-T10: bearingEstimate is retained in output', () => {
    const result = filter.filter(rawEvent);
    expect(result.bearingEstimate).toBeDefined();
    expect(result.bearingEstimate!.lat).toBe(rawEvent.bearingEstimate!.lat);
    expect(result.bearingEstimate!.lon).toBe(rawEvent.bearingEstimate!.lon);
  });

  // ── No MAC in input ───────────────────────────────────────────────────────

  it('FR-W12-07-T11: filter works when no macAddress present in raw event', () => {
    const noMac: RawRfEvent = { ...rawEvent, macAddress: undefined };
    const result = filter.filter(noMac);
    expect(result.macHash).toBeUndefined();
    expect(result.frequencyMHz).toBe(noMac.frequencyMHz);
  });
});
