// APEX-SENTINEL — W8 Firmware OTA Controller
// FR-W8-08 | src/node/ota-controller.ts
//
// OTA firmware update via NATS JetStream KV manifest.
// SHA-256 verification before apply. Auto-rollback on health check failure.

import { createHash } from 'crypto';

export type OtaStatus = 'idle' | 'downloading' | 'applying' | 'health_check' | 'done' | 'failed' | 'rolled_back';

export interface OtaManifest {
  version: string;
  sha256: string;
  downloadUrl: string;
  releaseDate: string;
}

export interface OtaLogEntry {
  nodeId: string;
  fromVersion: string;
  toVersion: string;
  status: OtaStatus;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface NatsKvClient {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
}

export interface FileSystem {
  download: (url: string, destPath: string) => Promise<{ localPath: string; bytes: Buffer }>;
  apply: (localPath: string, targetPath: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  remove: (path: string) => Promise<void>;
}

export interface HealthChecker {
  check: () => Promise<boolean>;
}

export interface SupabaseOtaClient {
  insert: (table: string, row: object) => Promise<void>;
  update: (table: string, filter: object, row: object) => Promise<void>;
}

export class HashMismatchError extends Error {
  constructor(expected: string, actual: string) {
    super(`HASH_MISMATCH: expected ${expected}, got ${actual}`);
    this.name = 'HashMismatchError';
  }
}

export class OtaController {
  private currentVersion: string;
  private status: OtaStatus = 'idle';
  private natsKv: NatsKvClient;
  private fs: FileSystem;
  private healthChecker: HealthChecker;
  private supabase: SupabaseOtaClient | null = null;
  private previousVersionPath: string | null = null;
  private statusListeners: ((status: OtaStatus) => void)[] = [];
  private natsPublish: ((subject: string, payload: unknown) => void) | null = null;

  constructor(options: {
    currentVersion: string;
    natsKv: NatsKvClient;
    fs: FileSystem;
    healthChecker: HealthChecker;
  }) {
    this.currentVersion = options.currentVersion;
    this.natsKv = options.natsKv;
    this.fs = options.fs;
    this.healthChecker = options.healthChecker;
  }

  setSupabaseClient(client: SupabaseOtaClient): void {
    this.supabase = client;
  }

  setNatsPublish(fn: (subject: string, payload: unknown) => void): void {
    this.natsPublish = fn;
  }

  onStatusChange(listener: (status: OtaStatus) => void): void {
    this.statusListeners.push(listener);
  }

  private setStatus(s: OtaStatus): void {
    this.status = s;
    for (const l of this.statusListeners) l(s);
    this.natsPublish?.(`firmware.node.status`, { status: s, version: this.currentVersion });
  }

  async checkForUpdate(): Promise<OtaManifest | null> {
    const raw = await this.natsKv.get('firmware:manifest');
    if (!raw) return null;
    const manifest: OtaManifest = JSON.parse(raw);
    if (manifest.version === this.currentVersion) return null;
    return manifest;
  }

  async downloadAndVerify(manifest: OtaManifest): Promise<string> {
    this.setStatus('downloading');
    const { localPath, bytes } = await this.fs.download(manifest.downloadUrl, `/tmp/fw-${manifest.version}.bin`);

    const actualHash = createHash('sha256').update(bytes).digest('hex');
    if (actualHash !== manifest.sha256) {
      await this.fs.remove(localPath).catch(() => {});
      this.setStatus('failed');
      throw new HashMismatchError(manifest.sha256, actualHash);
    }
    return localPath;
  }

  async applyUpdate(localPath: string, manifest: OtaManifest): Promise<void> {
    this.setStatus('applying');
    this.previousVersionPath = `/opt/sentinel/firmware-${this.currentVersion}.bin`;
    await this.fs.apply(localPath, '/opt/sentinel/firmware.bin');

    this.setStatus('health_check');
    await this.runHealthCheck(manifest);
  }

  private async runHealthCheck(manifest: OtaManifest): Promise<void> {
    const healthy = await this.healthChecker.check();
    if (!healthy) {
      await this.rollback();
      return;
    }
    const prevVersion = this.currentVersion;
    this.currentVersion = manifest.version;
    this.setStatus('done');

    await this.supabase?.insert('firmware_ota_log', {
      node_id: 'self',
      from_version: prevVersion,
      to_version: manifest.version,
      status: 'done',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
  }

  async rollback(): Promise<void> {
    if (this.previousVersionPath) {
      await this.fs.apply(this.previousVersionPath, '/opt/sentinel/firmware.bin').catch(() => {});
    }
    this.setStatus('rolled_back');
    await this.supabase?.insert('firmware_ota_log', {
      node_id: 'self',
      status: 'rolled_back',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
  }

  getStatus(): OtaStatus {
    return this.status;
  }

  getCurrentVersion(): string {
    return this.currentVersion;
  }
}
