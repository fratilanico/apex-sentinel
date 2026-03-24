// APEX-SENTINEL — OTA Model Manager
// FR-W3-15

import { createHash } from 'crypto';

export interface ModelMetadata {
  version: string;
  sha256: string;
  sizeBytes: number;
  downloadUrl: string;
  releasedAt: string;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  latestVersion: string;
  metadata?: ModelMetadata;
}

export class ModelManager {
  private readonly currentVersion: string;
  private readonly currentSha256: string;

  constructor(currentVersion: string, currentSha256: string) {
    this.currentVersion = currentVersion;
    this.currentSha256 = currentSha256;
  }

  getCurrentVersion(): string {
    return this.currentVersion;
  }

  getCurrentSha256(): string {
    return this.currentSha256;
  }

  needsUpdate(latest: ModelMetadata): boolean {
    return latest.version !== this.currentVersion;
  }

  verifyIntegrity(data: Uint8Array, expectedSha256: string): boolean {
    const actualHash = createHash('sha256').update(data).digest('hex');
    return actualHash === expectedSha256;
  }

  parseUpdateCheckResponse(response: unknown): UpdateCheckResult {
    try {
      if (
        response === null ||
        response === undefined ||
        typeof response !== 'object' ||
        Array.isArray(response)
      ) {
        return { updateAvailable: false, latestVersion: this.currentVersion };
      }

      const resp = response as Record<string, unknown>;

      const latestVersion = typeof resp['latestVersion'] === 'string'
        ? resp['latestVersion']
        : undefined;

      if (!latestVersion) {
        return { updateAvailable: false, latestVersion: this.currentVersion };
      }

      const updateAvailable = latestVersion !== this.currentVersion;
      const metadata = resp['metadata'] as ModelMetadata | undefined;

      return { updateAvailable, latestVersion, metadata };
    } catch {
      return { updateAvailable: false, latestVersion: this.currentVersion };
    }
  }
}
