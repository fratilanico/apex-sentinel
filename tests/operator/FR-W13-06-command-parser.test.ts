// APEX-SENTINEL — W13
// FR-W13-06: OperatorCommandParser

import { describe, it, expect, beforeEach } from 'vitest';
import { OperatorCommandParser } from '../../src/operator/operator-command-parser.js';

describe('FR-W13-06: OperatorCommandParser', () => {
  let parser: OperatorCommandParser;

  beforeEach(() => {
    parser = new OperatorCommandParser();
  });

  it('/status is valid', () => {
    const result = parser.parse('/status');
    expect(result.valid).toBe(true);
    expect(result.command).toBe('/status');
  });

  it('/sitrep is valid', () => {
    const result = parser.parse('/sitrep');
    expect(result.valid).toBe(true);
    expect(result.command).toBe('/sitrep');
  });

  it('/awning is valid', () => {
    const result = parser.parse('/awning');
    expect(result.valid).toBe(true);
    expect(result.command).toBe('/awning');
  });

  it('/trajectory with valid coords is valid', () => {
    const result = parser.parse('/trajectory 48.5 23.1');
    expect(result.valid).toBe(true);
    expect(result.args.lat).toBe('48.5');
    expect(result.args.lon).toBe('23.1');
  });

  it('/trajectory without coords is invalid', () => {
    const result = parser.parse('/trajectory');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Usage');
  });

  it('/trajectory with non-numeric coords is invalid', () => {
    const result = parser.parse('/trajectory abc xyz');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid');
  });

  it('/trajectory with out-of-range lat is invalid', () => {
    const result = parser.parse('/trajectory 91.0 23.1');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('lat');
  });

  it('/trajectory with out-of-range lon is invalid', () => {
    const result = parser.parse('/trajectory 48.5 181.0');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('lon');
  });

  it('/silence 30 is valid', () => {
    const result = parser.parse('/silence 30');
    expect(result.valid).toBe(true);
    expect(result.args.minutes).toBe('30');
  });

  it('/silence 60 is valid (max)', () => {
    const result = parser.parse('/silence 60');
    expect(result.valid).toBe(true);
  });

  it('/silence 90 is invalid (over max)', () => {
    const result = parser.parse('/silence 90');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Max silence');
  });

  it('/silence without argument is invalid', () => {
    const result = parser.parse('/silence');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Usage');
  });

  it('unknown command returns valid=false', () => {
    const result = parser.parse('/unknown');
    expect(result.valid).toBe(false);
    expect(result.command).toBe('/unknown');
  });

  it('non-command text returns valid=false', () => {
    const result = parser.parse('hello world');
    expect(result.valid).toBe(false);
  });

  it('command with extra spaces is parsed correctly', () => {
    const result = parser.parse('/trajectory  48.5  23.1');
    expect(result.valid).toBe(true);
  });

  it('/status args is empty object', () => {
    const result = parser.parse('/status');
    expect(result.args).toEqual({});
  });
});
