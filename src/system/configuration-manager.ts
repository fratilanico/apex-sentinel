// APEX-SENTINEL — W16 ConfigurationManager
// FR-W16-04 | src/system/configuration-manager.ts

import { readFileSync } from 'node:fs';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AwningThresholds {
  yellowConfidence: number;
  orangeConfidence: number;
  redConfidence: number;
}

export interface PerformanceBudgets {
  acousticInferenceP99Ms: number;
  enrichmentP99Ms: number;
  feedPollP99Ms: number;
}

export interface NodePosition {
  nodeId: string;
  lat: number;
  lon: number;
}

export interface SentinelConfig {
  nodePositions: NodePosition[];
  feedPollingIntervalMs: number;
  awningThresholds: AwningThresholds;
  performanceBudgets: PerformanceBudgets;
  natsUrl: string;
  demoMode: boolean;
  logLevel: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS: Record<string, unknown> = {
  'sentinel.natsUrl': 'nats://localhost:4222',
  'sentinel.feedPollingIntervalMs': 5000,
  'sentinel.logLevel': 'info',
  'sentinel.demoMode': false,
  'sentinel.awningThresholds.yellowConfidence': 0.6,
  'sentinel.awningThresholds.orangeConfidence': 0.75,
  'sentinel.awningThresholds.redConfidence': 0.9,
  'sentinel.performanceBudgets.acousticInferenceP99Ms': 200,
  'sentinel.performanceBudgets.enrichmentP99Ms': 200,
  'sentinel.performanceBudgets.feedPollP99Ms': 5000,
};

const REQUIRED_KEYS = [
  'sentinel.natsUrl',
  'sentinel.feedPollingIntervalMs',
  'sentinel.awningThresholds.yellowConfidence',
  'sentinel.awningThresholds.orangeConfidence',
  'sentinel.awningThresholds.redConfidence',
  'sentinel.performanceBudgets.acousticInferenceP99Ms',
  'sentinel.performanceBudgets.enrichmentP99Ms',
  'sentinel.performanceBudgets.feedPollP99Ms',
];

// ── ConfigurationManager ──────────────────────────────────────────────────────

export class ConfigurationManager {
  private envMap: Map<string, unknown> = new Map();
  private fileMap: Map<string, unknown> = new Map();

  constructor(configFilePath?: string) {
    this._loadEnv();
    if (configFilePath) {
      this._loadFile(configFilePath);
    }
  }

  private _loadEnv(): void {
    // Map env vars to config keys
    const envMappings: Record<string, string> = {
      'SENTINEL_NATS_URL': 'sentinel.natsUrl',
      'SENTINEL_FEED_POLLING_MS': 'sentinel.feedPollingIntervalMs',
      'SENTINEL_LOG_LEVEL': 'sentinel.logLevel',
      'SENTINEL_DEMO_MODE': 'sentinel.demoMode',
      'SENTINEL_AWNING_YELLOW': 'sentinel.awningThresholds.yellowConfidence',
      'SENTINEL_AWNING_ORANGE': 'sentinel.awningThresholds.orangeConfidence',
      'SENTINEL_AWNING_RED': 'sentinel.awningThresholds.redConfidence',
      'SENTINEL_PERF_ACOUSTIC_P99': 'sentinel.performanceBudgets.acousticInferenceP99Ms',
      'SENTINEL_PERF_ENRICHMENT_P99': 'sentinel.performanceBudgets.enrichmentP99Ms',
      'SENTINEL_PERF_FEED_POLL_P99': 'sentinel.performanceBudgets.feedPollP99Ms',
    };

    for (const [envKey, configKey] of Object.entries(envMappings)) {
      const val = process.env[envKey];
      if (val !== undefined) {
        // Type coercion
        if (val === 'true') this.envMap.set(configKey, true);
        else if (val === 'false') this.envMap.set(configKey, false);
        else if (!isNaN(Number(val))) this.envMap.set(configKey, Number(val));
        else this.envMap.set(configKey, val);
      }
    }
  }

  private _loadFile(filePath: string): void {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const obj = JSON.parse(raw) as Record<string, unknown>;
      this._flattenInto(obj, '', this.fileMap);
    } catch {
      // silently ignore missing/invalid config file
    }
  }

  private _flattenInto(obj: Record<string, unknown>, prefix: string, target: Map<string, unknown>): void {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        this._flattenInto(v as Record<string, unknown>, key, target);
      } else {
        target.set(key, v);
      }
    }
  }

  get<T>(key: string, defaultValue?: T): T {
    // ENV > file > DEFAULTS > provided default
    if (this.envMap.has(key)) return this.envMap.get(key) as T;
    if (this.fileMap.has(key)) return this.fileMap.get(key) as T;
    if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return DEFAULTS[key] as T;
    if (defaultValue !== undefined) return defaultValue;
    return undefined as unknown as T;
  }

  validate(): ValidationResult {
    const errors: string[] = [];

    for (const key of REQUIRED_KEYS) {
      const val = this.get<unknown>(key);
      if (val === undefined || val === null || val === '') {
        errors.push(`Missing required config key: ${key}`);
        continue;
      }
      // Range checks
      if (key.includes('Confidence')) {
        const n = Number(val);
        if (n < 0 || n > 1) errors.push(`${key} must be between 0 and 1, got ${n}`);
      }
      if (key.includes('P99Ms') || key.includes('PollingMs')) {
        const n = Number(val);
        if (n <= 0) errors.push(`${key} must be > 0, got ${n}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  getSentinelConfig(): SentinelConfig {
    const demoModeRaw = this.get<unknown>('sentinel.demoMode');
    return {
      nodePositions: this.get<NodePosition[]>('sentinel.nodePositions', []),
      feedPollingIntervalMs: this.get<number>('sentinel.feedPollingIntervalMs'),
      awningThresholds: {
        yellowConfidence: this.get<number>('sentinel.awningThresholds.yellowConfidence'),
        orangeConfidence: this.get<number>('sentinel.awningThresholds.orangeConfidence'),
        redConfidence: this.get<number>('sentinel.awningThresholds.redConfidence'),
      },
      performanceBudgets: {
        acousticInferenceP99Ms: this.get<number>('sentinel.performanceBudgets.acousticInferenceP99Ms'),
        enrichmentP99Ms: this.get<number>('sentinel.performanceBudgets.enrichmentP99Ms'),
        feedPollP99Ms: this.get<number>('sentinel.performanceBudgets.feedPollP99Ms'),
      },
      natsUrl: this.get<string>('sentinel.natsUrl'),
      demoMode: demoModeRaw === true || demoModeRaw === 'true',
      logLevel: this.get<string>('sentinel.logLevel'),
    };
  }

  isDemoMode(): boolean {
    const val = this.get<unknown>('sentinel.demoMode');
    return val === true || val === 'true';
  }
}
