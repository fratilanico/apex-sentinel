/**
 * FR-W15-06: ConfigSecretManager
 * Secure configuration and secret management.
 * Secrets from process.env only — never hardcoded, never logged.
 */

export interface StartupValidationResult {
  ok: boolean;
  missing: string[];
}

export class ConfigSecretManager {
  readonly requiredSecrets: ReadonlyArray<string> = [
    'TELEGRAM_BOT_TOKEN',
    'NATS_CREDS',
    'HMAC_MASTER_KEY',
  ];

  /**
   * Returns the value of a required secret from process.env.
   * Throws if the secret is not set or is empty.
   */
  getSecret(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Required secret '${name}' is not set in environment`);
    }
    return value;
  }

  /**
   * Returns a config value from process.env, or the defaultValue if absent.
   * Non-sensitive; does not throw.
   */
  getConfig<T extends string | number | boolean>(name: string, defaultValue: T): T {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return defaultValue;

    if (typeof defaultValue === 'number') {
      const parsed = Number(raw);
      return (isNaN(parsed) ? defaultValue : parsed) as T;
    }
    if (typeof defaultValue === 'boolean') {
      return (raw === 'true') as T;
    }
    return raw as T;
  }

  /**
   * Validates that all required secrets are present in process.env.
   * Should be called at system startup for fail-fast behaviour.
   */
  validateStartup(): StartupValidationResult {
    const missing: string[] = [];
    for (const name of this.requiredSecrets) {
      const value = process.env[name];
      if (!value) {
        missing.push(name);
      }
    }
    return { ok: missing.length === 0, missing };
  }
}
