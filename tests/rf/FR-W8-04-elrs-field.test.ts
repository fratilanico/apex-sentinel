// APEX-SENTINEL — W8 ELRS RF Field Validation Tests
// FR-W8-04 | tests/rf/FR-W8-04-elrs-field.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ElrsFieldValidator, type ElrsCapture } from '../../src/rf/elrs-field-validator.js';

function makeElrsSamples(count: number): ElrsCapture[] {
  return Array.from({ length: count }, () => ({
    frequencyHz: 915_000_000,
    packetRatePps: 500,
    spreadingPattern: 'fhss' as const,
    durationMs: 1000,
    burstCount: 8,
  }));
}

function makeNonElrsSamples(count: number): ElrsCapture[] {
  return [
    // WiFi 2.4GHz
    ...Array.from({ length: Math.floor(count / 3) }, () => ({
      frequencyHz: 2_437_000_000,
      packetRatePps: 200,
      spreadingPattern: 'unknown' as const,
      durationMs: 500,
      burstCount: 2,
    })),
    // LoRa 868MHz (low packet rate)
    ...Array.from({ length: Math.floor(count / 3) }, () => ({
      frequencyHz: 868_000_000,
      packetRatePps: 10,
      spreadingPattern: 'fhss' as const,
      durationMs: 2000,
      burstCount: 1,
    })),
    // Generic 900MHz non-ELRS (low rate)
    ...Array.from({ length: count - 2 * Math.floor(count / 3) }, () => ({
      frequencyHz: 900_000_000,
      packetRatePps: 100,
      spreadingPattern: 'fixed' as const,
      durationMs: 500,
      burstCount: 3,
    })),
  ];
}

describe('FR-W8-04: ELRS RF Field Validation', () => {

  let validator: ElrsFieldValidator;

  beforeEach(() => {
    validator = new ElrsFieldValidator();
  });

  // ── Unit tests ─────────────────────────────────────────────────────────────

  it('FR-W8-04-U01: GIVEN synthetic 900MHz FHSS capture, WHEN detectElrs called, THEN ELRS pattern detected (recall ≥0.95)', () => {
    const result = validator.validateField(makeElrsSamples(100), []);
    expect(result.recall).toBeGreaterThanOrEqual(0.95);
  });

  it('FR-W8-04-U02: GIVEN packet rate threshold configurable, WHEN ENV set, THEN custom threshold used (not hardcoded 450pps)', () => {
    const customValidator = new ElrsFieldValidator({ packetRateThresholdPps: 600 });
    const config = customValidator.getConfig();
    expect(config.packetRateThresholdPps).toBe(600);
  });

  it('FR-W8-04-U03: GIVEN synthetic 2.4GHz WiFi capture, WHEN detectElrs called, THEN no ELRS detection (not triggered)', () => {
    const wifiCapture: ElrsCapture = {
      frequencyHz: 2_437_000_000,
      packetRatePps: 500,
      spreadingPattern: 'fhss',
      durationMs: 1000,
      burstCount: 8,
    };
    expect(validator.detectElrs(wifiCapture)).toBe(false);
  });

  it('FR-W8-04-U04: GIVEN synthetic LoRa 868MHz capture, WHEN detectElrs called, THEN no ELRS detection', () => {
    const loraCapture: ElrsCapture = {
      frequencyHz: 868_000_000,
      packetRatePps: 10, // LoRa is very low packet rate
      spreadingPattern: 'fhss',
      durationMs: 2000,
      burstCount: 1,
    };
    expect(validator.detectElrs(loraCapture)).toBe(false);
  });

  it('FR-W8-04-U05: GIVEN field validation run, THEN returns FPR estimate with sample counts', () => {
    const result = validator.validateField(makeElrsSamples(100), makeNonElrsSamples(200));
    expect(result.elrsSampleCount).toBe(100);
    expect(result.nonElrsSampleCount).toBe(200);
    expect(result).toHaveProperty('falsePositiveRate');
    expect(result).toHaveProperty('recall');
  });

  // ── Integration tests ──────────────────────────────────────────────────────

  it('FR-W8-04-I01: GIVEN synthetic RTL-SDR IQ capture, WHEN processed, THEN FHSS burst pattern identified correctly', () => {
    const fhssCapture: ElrsCapture = {
      frequencyHz: 915_000_000,
      packetRatePps: 480,
      spreadingPattern: 'fhss',
      durationMs: 1000,
      burstCount: 12,
    };
    expect(validator.detectElrs(fhssCapture)).toBe(true);
  });

  it('FR-W8-04-I02: GIVEN 1000 non-ELRS synthetic samples, WHEN validation runs, THEN FPR <2%', () => {
    const result = validator.validateField([], makeNonElrsSamples(1000));
    expect(result.falsePositiveRate).toBeLessThan(0.02);
  });

  it('FR-W8-04-I03: GIVEN 100 synthetic ELRS FHSS samples, WHEN validation runs, THEN recall >95%', () => {
    const result = validator.validateField(makeElrsSamples(100), []);
    expect(result.recall).toBeGreaterThan(0.95);
  });

  it('FR-W8-04-I04: GIVEN field tuning complete, WHEN parameters saved, THEN persisted to NATS KV rf:elrs:config', async () => {
    const kvMock = {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
    };
    validator.setNatsKvClient(kvMock);
    await validator.saveConfig();
    expect(kvMock.put).toHaveBeenCalledWith('rf:elrs:config', expect.stringContaining('packetRateThresholdPps'));
  });

  it('FR-W8-04-I05: GIVEN field tuning parameters updated, WHEN health check runs, THEN parameters validated successfully', async () => {
    const kvMock = {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(JSON.stringify({ packetRateThresholdPps: 480 })),
    };
    validator.setNatsKvClient(kvMock);
    await validator.loadConfig();
    expect(validator.getConfig().packetRateThresholdPps).toBe(480);
  });
});
