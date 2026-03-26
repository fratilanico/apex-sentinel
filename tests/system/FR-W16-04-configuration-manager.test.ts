// APEX-SENTINEL W16 Tests — FR-W16-04: ConfigurationManager
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigurationManager } from '../../src/system/configuration-manager.js';

const TMP_CONFIG = join(tmpdir(), 'sentinel-test-config.json');

function writeConfig(obj: Record<string, unknown>): void {
  writeFileSync(TMP_CONFIG, JSON.stringify(obj), 'utf-8');
}

describe('FR-W16-04: ConfigurationManager', () => {
  beforeEach(() => {
    // Clean env overrides
    delete process.env['SENTINEL_NATS_URL'];
    delete process.env['SENTINEL_DEMO_MODE'];
    delete process.env['SENTINEL_LOG_LEVEL'];
    delete process.env['SENTINEL_AWNING_YELLOW'];
    delete process.env['SENTINEL_FEED_POLLING_MS'];
  });

  afterEach(() => {
    if (existsSync(TMP_CONFIG)) unlinkSync(TMP_CONFIG);
  });

  it('FR-W16-04-01: get() returns default when key not set', () => {
    const cm = new ConfigurationManager();
    expect(cm.get<string>('sentinel.natsUrl')).toBe('nats://localhost:4222');
  });

  it('FR-W16-04-02: get() with explicit default returns it when key missing', () => {
    const cm = new ConfigurationManager();
    expect(cm.get<string>('sentinel.unknownKey', 'fallback')).toBe('fallback');
  });

  it('FR-W16-04-03: ENV variable overrides defaults', () => {
    process.env['SENTINEL_NATS_URL'] = 'nats://custom:4222';
    const cm = new ConfigurationManager();
    expect(cm.get<string>('sentinel.natsUrl')).toBe('nats://custom:4222');
  });

  it('FR-W16-04-04: config file overrides defaults', () => {
    writeConfig({ sentinel: { logLevel: 'debug' } });
    const cm = new ConfigurationManager(TMP_CONFIG);
    expect(cm.get<string>('sentinel.logLevel')).toBe('debug');
  });

  it('FR-W16-04-05: ENV variable overrides config file (ENV > file > defaults)', () => {
    process.env['SENTINEL_NATS_URL'] = 'nats://env:4222';
    writeConfig({ sentinel: { natsUrl: 'nats://file:4222' } });
    const cm = new ConfigurationManager(TMP_CONFIG);
    expect(cm.get<string>('sentinel.natsUrl')).toBe('nats://env:4222');
  });

  it('FR-W16-04-06: validate() returns valid=true with defaults', () => {
    const cm = new ConfigurationManager();
    const result = cm.validate();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('FR-W16-04-07: validate() returns errors for out-of-range confidence thresholds', () => {
    process.env['SENTINEL_AWNING_YELLOW'] = '1.5';
    const cm = new ConfigurationManager();
    const result = cm.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('yellowConfidence'))).toBe(true);
  });

  it('FR-W16-04-08: getSentinelConfig() returns typed object with all fields', () => {
    const cm = new ConfigurationManager();
    const config = cm.getSentinelConfig();
    expect(config.natsUrl).toBe('nats://localhost:4222');
    expect(config.awningThresholds.yellowConfidence).toBe(0.6);
    expect(config.performanceBudgets.acousticInferenceP99Ms).toBe(200);
    expect(config.demoMode).toBe(false);
  });

  it('FR-W16-04-09: SENTINEL_DEMO_MODE=true sets demoMode=true', () => {
    process.env['SENTINEL_DEMO_MODE'] = 'true';
    const cm = new ConfigurationManager();
    expect(cm.getSentinelConfig().demoMode).toBe(true);
    expect(cm.isDemoMode()).toBe(true);
  });

  it('FR-W16-04-10: numeric ENV variables are coerced to numbers', () => {
    process.env['SENTINEL_FEED_POLLING_MS'] = '3000';
    const cm = new ConfigurationManager();
    expect(cm.get<number>('sentinel.feedPollingIntervalMs')).toBe(3000);
    expect(typeof cm.get<number>('sentinel.feedPollingIntervalMs')).toBe('number');
  });

  it('FR-W16-04-11: missing config file silently falls back to defaults', () => {
    const cm = new ConfigurationManager('/nonexistent/path/config.json');
    const result = cm.validate();
    expect(result.valid).toBe(true);
  });

  it('FR-W16-04-12: getSentinelConfig() returns empty nodePositions array by default', () => {
    const cm = new ConfigurationManager();
    const config = cm.getSentinelConfig();
    expect(Array.isArray(config.nodePositions)).toBe(true);
    expect(config.nodePositions).toHaveLength(0);
  });
});
