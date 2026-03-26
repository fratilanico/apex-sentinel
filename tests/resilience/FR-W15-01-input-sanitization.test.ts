import { describe, it, expect } from 'vitest';
import { InputSanitizationGateway } from '../../src/resilience/input-sanitization-gateway.js';

describe('FR-W15-01: Input Sanitization Gateway', () => {
  const gw = new InputSanitizationGateway();

  const basicSchema = {
    maxDepth: 10,
    maxSize: 65536,
    fields: {
      name: { type: 'string' as const, required: true, maxLength: 100 },
      altitude: { type: 'number' as const, required: true, min: 0, max: 10000 },
    },
  };

  it('ISG-01: accepts valid payload', () => {
    const result = gw.sanitize({ name: 'drone-01', altitude: 500 }, basicSchema);
    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({ name: 'drone-01', altitude: 500 });
    expect(result.errors).toHaveLength(0);
  });

  it('ISG-02: rejects payload exceeding maxSize', () => {
    const big = { data: 'x'.repeat(70000) };
    const result = gw.sanitize(big, { ...basicSchema, maxSize: 65536, fields: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /too large/i.test(e))).toBe(true);
  });

  it('ISG-03: rejects object depth > maxDepth', () => {
    const deep: Record<string, unknown> = {};
    let cur = deep;
    for (let i = 0; i < 12; i++) {
      cur['child'] = {};
      cur = cur['child'] as Record<string, unknown>;
    }
    const result = gw.sanitize(deep, { ...basicSchema, maxDepth: 10, fields: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /depth/i.test(e))).toBe(true);
  });

  it('ISG-04: strips __proto__ key from object', () => {
    const polluted = JSON.parse('{"__proto__":{"isAdmin":true},"name":"drone","altitude":100}');
    const result = gw.sanitize(polluted, basicSchema);
    expect(result.ok).toBe(true);
    expect(result.value).not.toHaveProperty('__proto__');
  });

  it('ISG-05: strips constructor key from object', () => {
    const poisoned = { constructor: { prototype: { evil: true } }, name: 'x', altitude: 1 };
    const result = gw.sanitize(poisoned, basicSchema);
    expect(result.ok).toBe(true);
    expect(result.value).not.toHaveProperty('constructor');
  });

  it('ISG-06: strips prototype key from object', () => {
    const poisoned = { prototype: {}, name: 'x', altitude: 1 };
    const result = gw.sanitize(poisoned, basicSchema);
    expect(result.ok).toBe(true);
    expect(result.value).not.toHaveProperty('prototype');
  });

  it('ISG-07: rejects missing required field', () => {
    const result = gw.sanitize({ altitude: 500 }, basicSchema);
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /name/i.test(e))).toBe(true);
  });

  it('ISG-08: rejects wrong type for field', () => {
    const result = gw.sanitize({ name: 'drone', altitude: 'high' }, basicSchema);
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /altitude/i.test(e))).toBe(true);
  });

  it('ISG-09: rejects number below min', () => {
    const result = gw.sanitize({ name: 'drone', altitude: -1 }, basicSchema);
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /altitude/i.test(e))).toBe(true);
  });

  it('ISG-10: rejects string exceeding maxLength', () => {
    const result = gw.sanitize({ name: 'x'.repeat(200), altitude: 100 }, basicSchema);
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /name/i.test(e))).toBe(true);
  });

  it('ISG-11: rejects non-object input', () => {
    const result = gw.sanitize('just a string', basicSchema);
    expect(result.ok).toBe(false);
  });

  it('ISG-12: fast-fail — only first violation type returned, value is undefined on failure', () => {
    const result = gw.sanitize({ name: 'x'.repeat(200), altitude: -1 }, basicSchema);
    expect(result.ok).toBe(false);
    expect(result.value).toBeUndefined();
  });
});
