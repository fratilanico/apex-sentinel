// APEX-SENTINEL — W16 DeploymentPackager
// FR-W16-07 | src/system/deployment-packager.ts

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FileEntry {
  path: string;
  sha256: string;
}

export interface DeploymentManifest {
  version: string;
  ts: string;
  files: FileEntry[];
  totalFiles: number;
}

export interface VerifyResult {
  valid: boolean;
  mismatches: string[];
}

// ── DeploymentPackager ────────────────────────────────────────────────────────

export class DeploymentPackager {
  private version: string;

  constructor(version = '1.0.0') {
    this.version = version;
  }

  async generateManifest(files: string[]): Promise<DeploymentManifest> {
    const entries: FileEntry[] = [];

    for (const filePath of files) {
      const sha256 = await this._sha256File(filePath);
      entries.push({ path: filePath, sha256 });
    }

    return {
      version: this.version,
      ts: new Date().toISOString(),
      files: entries,
      totalFiles: entries.length,
    };
  }

  async verifyManifest(manifest: DeploymentManifest, actualFiles: string[]): Promise<VerifyResult> {
    const mismatches: string[] = [];

    // Build a lookup from manifest
    const manifestMap = new Map<string, string>();
    for (const entry of manifest.files) {
      manifestMap.set(entry.path, entry.sha256);
    }

    // Check every actualFile against manifest
    for (const filePath of actualFiles) {
      const expectedHash = manifestMap.get(filePath);
      if (expectedHash === undefined) {
        mismatches.push(`${filePath}: not in manifest`);
        continue;
      }
      const actualHash = await this._sha256File(filePath);
      if (actualHash !== expectedHash) {
        mismatches.push(`${filePath}: hash mismatch (expected ${expectedHash}, got ${actualHash})`);
      }
    }

    // Check for files in manifest not present in actualFiles
    for (const entry of manifest.files) {
      if (!actualFiles.includes(entry.path)) {
        mismatches.push(`${entry.path}: missing from actual files`);
      }
    }

    return {
      valid: mismatches.length === 0,
      mismatches,
    };
  }

  private async _sha256File(filePath: string): Promise<string> {
    const data = await readFile(filePath);
    return createHash('sha256').update(data).digest('hex');
  }

  static sha256Buffer(data: Buffer | string): string {
    return createHash('sha256').update(data).digest('hex');
  }
}
