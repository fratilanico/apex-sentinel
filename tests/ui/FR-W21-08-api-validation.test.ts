// APEX-SENTINEL — W21 Production Operator UI
// FR-W21-08 | tests/ui/FR-W21-08-api-validation.test.ts
// API input validation utilities — 13 tests

import { describe, it, expect } from 'vitest';
import {
  validateAcknowledgeBody,
  validateQueryParams,
  sanitiseStringParam,
  parseIntParam,
  buildErrorResponse,
} from '../../src/ui/api-validation.js';

describe('FR-W21-08: API Validation', () => {
  // ---------------------------------------------------------------------------
  // validateAcknowledgeBody
  // ---------------------------------------------------------------------------

  describe('validateAcknowledgeBody', () => {
    it('01: valid: { operatorId: "op-01" } → valid=true', () => {
      const result = validateAcknowledgeBody({ operatorId: 'op-01' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('02: invalid: missing operatorId → valid=false, errors non-empty', () => {
      const result = validateAcknowledgeBody({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('03: invalid: empty string operatorId → valid=false', () => {
      const result = validateAcknowledgeBody({ operatorId: '' });
      expect(result.valid).toBe(false);
    });

    it('04: invalid: non-object body → valid=false', () => {
      expect(validateAcknowledgeBody(null).valid).toBe(false);
      expect(validateAcknowledgeBody('string').valid).toBe(false);
      expect(validateAcknowledgeBody(42).valid).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // validateQueryParams
  // ---------------------------------------------------------------------------

  describe('validateQueryParams', () => {
    it('05: allowed=["zoneId","minThreatScore"], params={zoneId:"x"} → valid', () => {
      const result = validateQueryParams({ zoneId: 'x' }, ['zoneId', 'minThreatScore']);
      expect(result.valid).toBe(true);
    });

    it('06: unknown param "hack" → valid=false', () => {
      const result = validateQueryParams({ zoneId: 'x', hack: 'evil' }, ['zoneId']);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('hack'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // sanitiseStringParam
  // ---------------------------------------------------------------------------

  describe('sanitiseStringParam', () => {
    it('07: trims whitespace', () => {
      expect(sanitiseStringParam('  hello  ')).toBe('hello');
    });

    it('08: truncates to maxLength', () => {
      expect(sanitiseStringParam('abcdef', 3)).toBe('abc');
    });

    it('09: returns null for non-string', () => {
      expect(sanitiseStringParam(42)).toBeNull();
      expect(sanitiseStringParam(null)).toBeNull();
      expect(sanitiseStringParam(undefined)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // parseIntParam
  // ---------------------------------------------------------------------------

  describe('parseIntParam', () => {
    it('10: parseIntParam("42") → 42', () => {
      expect(parseIntParam('42')).toBe(42);
    });

    it('11: parseIntParam("abc") → null', () => {
      expect(parseIntParam('abc')).toBeNull();
    });

    it('12: parseIntParam("200", 0, 100) → null (exceeds max)', () => {
      expect(parseIntParam('200', 0, 100)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // buildErrorResponse
  // ---------------------------------------------------------------------------

  describe('buildErrorResponse', () => {
    it('13: includes timestamp as ISO string', () => {
      const result = buildErrorResponse('NOT_FOUND', 'Alert not found');
      expect(result.code).toBe('NOT_FOUND');
      expect(result.error).toBe('Alert not found');
      // ISO string: must parse cleanly and be a valid date
      const parsed = new Date(result.timestamp);
      expect(isNaN(parsed.getTime())).toBe(false);
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
