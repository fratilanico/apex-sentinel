/**
 * FR-W15-01: InputSanitizationGateway
 * Validates and sanitizes all external inputs before processing.
 * Defends against: oversized payloads, prototype pollution, deep nesting, type violations.
 */

export interface FieldRule {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
}

export interface SanitizationSchema {
  maxDepth: number;
  maxSize: number;
  fields: Record<string, FieldRule>;
}

export interface SanitizationResult<T = unknown> {
  ok: boolean;
  value?: T;
  errors: string[];
}

const POISON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function measureDepth(value: unknown, depth = 0): number {
  if (depth > 50) return depth; // safety cap
  if (value === null || typeof value !== 'object') return depth;
  const obj = value as Record<string, unknown>;
  let maxChild = depth;
  for (const key of Object.keys(obj)) {
    const child = measureDepth(obj[key], depth + 1);
    if (child > maxChild) maxChild = child;
  }
  return maxChild;
}

function stripPoisonKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stripPoisonKeys);
  const obj = value as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (!POISON_KEYS.has(key)) {
      clean[key] = stripPoisonKeys(obj[key]);
    }
  }
  return clean;
}

function roughByteSize(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
  } catch {
    return Infinity;
  }
}

export class InputSanitizationGateway {
  sanitize<T = unknown>(raw: unknown, schema: SanitizationSchema): SanitizationResult<T> {
    // Step 1: must be an object
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, errors: ['input must be a plain object'] };
    }

    // Step 2: size check
    const size = roughByteSize(raw);
    if (size > schema.maxSize) {
      return { ok: false, errors: [`payload too large: ${size} bytes exceeds limit ${schema.maxSize}`] };
    }

    // Step 3: depth check
    const depth = measureDepth(raw);
    if (depth > schema.maxDepth) {
      return { ok: false, errors: [`object depth ${depth} exceeds maxDepth ${schema.maxDepth}`] };
    }

    // Step 4: strip poison keys
    const cleaned = stripPoisonKeys(raw) as Record<string, unknown>;

    // Step 5: field validation
    const errors: string[] = [];
    for (const [fieldName, rule] of Object.entries(schema.fields)) {
      const val = cleaned[fieldName];

      if (rule.required && (val === undefined || val === null)) {
        errors.push(`field '${fieldName}' is required`);
        continue;
      }

      if (val === undefined || val === null) continue;

      // Type check
      if (rule.type === 'array') {
        if (!Array.isArray(val)) {
          errors.push(`field '${fieldName}' must be an array`);
          continue;
        }
      } else if (typeof val !== rule.type) {
        errors.push(`field '${fieldName}' must be of type ${rule.type}, got ${typeof val}`);
        continue;
      }

      // Range checks for numbers
      if (rule.type === 'number' && typeof val === 'number') {
        if (rule.min !== undefined && val < rule.min) {
          errors.push(`field '${fieldName}' value ${val} is below minimum ${rule.min}`);
        }
        if (rule.max !== undefined && val > rule.max) {
          errors.push(`field '${fieldName}' value ${val} exceeds maximum ${rule.max}`);
        }
      }

      // Length check for strings
      if (rule.type === 'string' && typeof val === 'string') {
        if (rule.maxLength !== undefined && val.length > rule.maxLength) {
          errors.push(`field '${fieldName}' length ${val.length} exceeds maxLength ${rule.maxLength}`);
        }
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    return { ok: true, value: cleaned as T, errors: [] };
  }
}
