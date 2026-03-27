// APEX-SENTINEL — W21 Production Operator UI
// src/ui/api-validation.ts
// Input validation and sanitisation utilities for API route handlers

// ---------------------------------------------------------------------------
// Core result type
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// validateAcknowledgeBody
// ---------------------------------------------------------------------------

/**
 * Validates the body of an acknowledge (PATCH /alerts/:id/acknowledge) request.
 * Requires: { operatorId: string (non-empty) }
 */
export function validateAcknowledgeBody(body: unknown): ValidationResult {
  const errors: string[] = [];

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    errors.push('Body must be a non-null object.');
    return { valid: false, errors };
  }

  const rec = body as Record<string, unknown>;

  if (!('operatorId' in rec)) {
    errors.push('Missing required field: operatorId.');
  } else if (typeof rec['operatorId'] !== 'string' || rec['operatorId'].trim() === '') {
    errors.push('operatorId must be a non-empty string.');
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// validateQueryParams
// ---------------------------------------------------------------------------

/**
 * Validates query parameters against an allowed list.
 * Returns invalid if any unknown params are present.
 */
export function validateQueryParams(
  params: Record<string, string | undefined>,
  allowed: string[],
): ValidationResult {
  const errors: string[] = [];
  const allowedSet = new Set(allowed);

  for (const key of Object.keys(params)) {
    if (!allowedSet.has(key)) {
      errors.push(`Unknown query parameter: ${key}.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// sanitiseStringParam
// ---------------------------------------------------------------------------

/**
 * Returns null for non-string values.
 * Trims whitespace and truncates to maxLength (default 200).
 */
export function sanitiseStringParam(value: unknown, maxLength = 200): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.slice(0, maxLength);
}

// ---------------------------------------------------------------------------
// parseIntParam
// ---------------------------------------------------------------------------

/**
 * Parses value as an integer.
 * Returns null if value is not a valid integer, or is outside [min, max].
 */
export function parseIntParam(value: unknown, min?: number, max?: number): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  if (min !== undefined && n < min) return null;
  if (max !== undefined && n > max) return null;
  return n;
}

// ---------------------------------------------------------------------------
// buildErrorResponse
// ---------------------------------------------------------------------------

export function buildErrorResponse(
  code: string,
  message: string,
): { error: string; code: string; timestamp: string } {
  return {
    error: message,
    code,
    timestamp: new Date().toISOString(),
  };
}
