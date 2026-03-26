import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConfigSecretManager } from '../../src/resilience/config-secret-manager.js';

describe('FR-W15-06: Config Secret Manager', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('CSM-01: getSecret returns value when env var is set', () => {
    vi.stubEnv('MY_SECRET', 'super-secret-value');
    const mgr = new ConfigSecretManager();
    expect(mgr.getSecret('MY_SECRET')).toBe('super-secret-value');
  });

  it('CSM-02: getSecret throws when env var is missing', () => {
    const mgr = new ConfigSecretManager();
    expect(() => mgr.getSecret('DEFINITELY_NOT_SET_XYZ')).toThrow();
  });

  it('CSM-03: getConfig returns env var value when set', () => {
    vi.stubEnv('MY_CONFIG', 'hello');
    const mgr = new ConfigSecretManager();
    expect(mgr.getConfig('MY_CONFIG', 'default')).toBe('hello');
  });

  it('CSM-04: getConfig returns defaultValue when env var absent', () => {
    const mgr = new ConfigSecretManager();
    expect(mgr.getConfig('ABSENT_CONFIG_XYZ', 'fallback')).toBe('fallback');
  });

  it('CSM-05: validateStartup returns ok=true when all required secrets present', () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tok');
    vi.stubEnv('NATS_CREDS', 'creds');
    vi.stubEnv('HMAC_MASTER_KEY', 'key');
    const mgr = new ConfigSecretManager();
    const result = mgr.validateStartup();
    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('CSM-06: validateStartup returns ok=false with missing names when secrets absent', () => {
    // ensure these are not set
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    vi.stubEnv('NATS_CREDS', '');
    vi.stubEnv('HMAC_MASTER_KEY', '');
    const mgr = new ConfigSecretManager();
    const result = mgr.validateStartup();
    expect(result.ok).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('CSM-07: getSecret error message includes secret name', () => {
    const mgr = new ConfigSecretManager();
    let msg = '';
    try { mgr.getSecret('MISSING_SECRET_NAME'); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain('MISSING_SECRET_NAME');
  });

  it('CSM-08: getConfig returns typed default value', () => {
    const mgr = new ConfigSecretManager();
    const val = mgr.getConfig('ABSENT_NUM_CONFIG', 42);
    expect(val).toBe(42);
  });

  it('CSM-09: validateStartup lists all missing secrets', () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    vi.stubEnv('NATS_CREDS', '');
    vi.stubEnv('HMAC_MASTER_KEY', '');
    const mgr = new ConfigSecretManager();
    const result = mgr.validateStartup();
    expect(result.missing).toContain('TELEGRAM_BOT_TOKEN');
    expect(result.missing).toContain('NATS_CREDS');
    expect(result.missing).toContain('HMAC_MASTER_KEY');
  });

  it('CSM-10: required secrets list is TELEGRAM_BOT_TOKEN, NATS_CREDS, HMAC_MASTER_KEY', () => {
    const mgr = new ConfigSecretManager();
    expect(mgr.requiredSecrets).toContain('TELEGRAM_BOT_TOKEN');
    expect(mgr.requiredSecrets).toContain('NATS_CREDS');
    expect(mgr.requiredSecrets).toContain('HMAC_MASTER_KEY');
  });
});
