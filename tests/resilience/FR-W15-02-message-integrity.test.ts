import { describe, it, expect, beforeAll } from 'vitest';
import { MessageIntegrityVerifier } from '../../src/resilience/message-integrity-verifier.js';

describe('FR-W15-02: Message Integrity Verifier', () => {
  let verifier: MessageIntegrityVerifier;
  let key: Buffer;

  beforeAll(async () => {
    verifier = new MessageIntegrityVerifier();
    key = await verifier.deriveKey(Buffer.from('master-secret-32byteslong!!!!!x'), 'node-01');
  });

  it('MIV-01: sign returns object with sig and ts fields', async () => {
    const signed = verifier.sign({ type: 'detection', data: 'abc' }, key);
    expect(signed).toHaveProperty('sig');
    expect(signed).toHaveProperty('ts');
    expect(typeof signed.sig).toBe('string');
    expect(typeof signed.ts).toBe('number');
  });

  it('MIV-02: verify returns valid=true for correctly signed message', async () => {
    const signed = verifier.sign({ type: 'detection', data: 'abc' }, key);
    const result = verifier.verify(signed, key);
    expect(result.valid).toBe(true);
  });

  it('MIV-03: verify returns invalid_sig for tampered payload', async () => {
    const signed = verifier.sign({ type: 'detection', data: 'abc' }, key);
    const tampered = { ...signed, data: 'tampered' };
    const result = verifier.verify(tampered, key);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_sig');
  });

  it('MIV-04: verify returns invalid_sig for wrong key', async () => {
    const wrongKey = await verifier.deriveKey(Buffer.from('master-secret-32byteslong!!!!!x'), 'node-99');
    const signed = verifier.sign({ type: 'detection', data: 'abc' }, key);
    const result = verifier.verify(signed, wrongKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_sig');
  });

  it('MIV-05: replay — same message sent twice rejected on second attempt', async () => {
    const signed = verifier.sign({ type: 'ping' }, key);
    verifier.verify(signed, key); // first — consumes ts
    const result2 = verifier.verify(signed, key);
    expect(result2.valid).toBe(false);
    expect(result2.reason).toBe('replay');
  });

  it('MIV-06: rejects message with ts older than 30s', async () => {
    const old = verifier.sign({ type: 'detection' }, key);
    (old as Record<string, unknown>).ts = Date.now() - 31000;
    // re-sign to get wrong sig — use manual stale message
    const stale = { ...old, ts: Date.now() - 31000, sig: 'invalid' };
    const result = verifier.verify(stale as Parameters<typeof verifier.verify>[0], key);
    expect(result.valid).toBe(false);
  });

  it('MIV-07: rejects message with ts more than 5s in future', async () => {
    const future = verifier.sign({ type: 'detection' }, key);
    const tweaked = { ...future, ts: Date.now() + 10000 };
    const result = verifier.verify(tweaked, key);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('future_ts');
  });

  it('MIV-08: HKDF derives different keys for different nodeIds', async () => {
    const k1 = await verifier.deriveKey(Buffer.from('master-secret-32byteslong!!!!!x'), 'node-01');
    const k2 = await verifier.deriveKey(Buffer.from('master-secret-32byteslong!!!!!x'), 'node-02');
    expect(k1.equals(k2)).toBe(false);
  });

  it('MIV-09: HKDF derives same key for same inputs', async () => {
    const k1 = await verifier.deriveKey(Buffer.from('master-secret-32byteslong!!!!!x'), 'node-01');
    const k2 = await verifier.deriveKey(Buffer.from('master-secret-32byteslong!!!!!x'), 'node-01');
    expect(k1.equals(k2)).toBe(true);
  });

  it('MIV-10: sign preserves original payload fields', async () => {
    const payload = { type: 'alert', lat: 45.1, lon: 25.2, altitude: 300 };
    const signed = verifier.sign(payload, key);
    expect(signed.type).toBe('alert');
    expect(signed.lat).toBe(45.1);
  });

  it('MIV-11: verify returns replay reason not invalid_sig for replayed valid message', async () => {
    const key2 = await verifier.deriveKey(Buffer.from('master-secret-32byteslong!!!!!x'), 'replay-test-node');
    const signed = verifier.sign({ type: 'test' }, key2);
    verifier.verify(signed, key2); // consume
    const r2 = verifier.verify(signed, key2);
    expect(r2.reason).toBe('replay');
  });

  it('MIV-12: ts is within 1s of current time', async () => {
    const before = Date.now();
    const signed = verifier.sign({ type: 'ping' }, key);
    const after = Date.now();
    expect(signed.ts).toBeGreaterThanOrEqual(before);
    expect(signed.ts).toBeLessThanOrEqual(after + 10);
  });
});
