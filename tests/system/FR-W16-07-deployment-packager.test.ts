// APEX-SENTINEL W16 Tests — FR-W16-07: DeploymentPackager
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DeploymentPackager, DeploymentManifest } from '../../src/system/deployment-packager.js';

const TMP_DIR = tmpdir();

function tmpFile(name: string, content: string): string {
  const path = join(TMP_DIR, name);
  writeFileSync(path, content, 'utf-8');
  return path;
}

describe('FR-W16-07: DeploymentPackager', () => {
  let packager: DeploymentPackager;
  const tmpFiles: string[] = [];

  beforeEach(() => {
    packager = new DeploymentPackager('1.0.0');
  });

  afterEach(() => {
    for (const f of tmpFiles) {
      if (existsSync(f)) unlinkSync(f);
    }
    tmpFiles.length = 0;
  });

  it('FR-W16-07-01: generateManifest() creates entry for each file', async () => {
    const f1 = tmpFile('sentinel-a.js', 'console.log("a")');
    const f2 = tmpFile('sentinel-b.js', 'console.log("b")');
    tmpFiles.push(f1, f2);

    const manifest = await packager.generateManifest([f1, f2]);
    expect(manifest.files).toHaveLength(2);
    expect(manifest.totalFiles).toBe(2);
  });

  it('FR-W16-07-02: generateManifest() computes correct SHA-256 per file', async () => {
    const content = 'sentinel deployment test content';
    const f = tmpFile('sentinel-hash-test.js', content);
    tmpFiles.push(f);

    const manifest = await packager.generateManifest([f]);
    const expectedHash = createHash('sha256').update(Buffer.from(content, 'utf-8')).digest('hex');
    expect(manifest.files[0].sha256).toBe(expectedHash);
  });

  it('FR-W16-07-03: manifest includes version and ISO-8601 timestamp', async () => {
    const f = tmpFile('sentinel-c.js', 'x');
    tmpFiles.push(f);

    const manifest = await packager.generateManifest([f]);
    expect(manifest.version).toBe('1.0.0');
    expect(() => new Date(manifest.ts)).not.toThrow();
    expect(manifest.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('FR-W16-07-04: verifyManifest() returns valid=true when all hashes match', async () => {
    const f = tmpFile('sentinel-verify.js', 'const x = 1;');
    tmpFiles.push(f);

    const manifest = await packager.generateManifest([f]);
    const result = await packager.verifyManifest(manifest, [f]);
    expect(result.valid).toBe(true);
    expect(result.mismatches).toHaveLength(0);
  });

  it('FR-W16-07-05: verifyManifest() detects hash mismatch after file modification', async () => {
    const f = tmpFile('sentinel-tampered.js', 'original content');
    tmpFiles.push(f);

    const manifest = await packager.generateManifest([f]);
    // Modify file after manifest generation
    writeFileSync(f, 'tampered content', 'utf-8');

    const result = await packager.verifyManifest(manifest, [f]);
    expect(result.valid).toBe(false);
    expect(result.mismatches.some(m => m.includes(f))).toBe(true);
  });

  it('FR-W16-07-06: verifyManifest() detects files missing from actualFiles', async () => {
    const f = tmpFile('sentinel-missing.js', 'data');
    tmpFiles.push(f);

    const manifest = await packager.generateManifest([f]);
    // Pass empty actualFiles
    const result = await packager.verifyManifest(manifest, []);
    expect(result.valid).toBe(false);
    expect(result.mismatches.some(m => m.includes('missing'))).toBe(true);
  });

  it('FR-W16-07-07: verifyManifest() detects actualFiles not in manifest', async () => {
    const f1 = tmpFile('sentinel-f1.js', 'file1');
    const f2 = tmpFile('sentinel-f2.js', 'file2');
    tmpFiles.push(f1, f2);

    const manifest = await packager.generateManifest([f1]);
    const result = await packager.verifyManifest(manifest, [f1, f2]);
    expect(result.valid).toBe(false);
    expect(result.mismatches.some(m => m.includes(f2))).toBe(true);
  });

  it('FR-W16-07-08: empty file list produces manifest with totalFiles=0', async () => {
    const manifest = await packager.generateManifest([]);
    expect(manifest.totalFiles).toBe(0);
    expect(manifest.files).toHaveLength(0);
  });

  it('FR-W16-07-09: different versions produce different version fields', async () => {
    const p1 = new DeploymentPackager('1.0.0');
    const p2 = new DeploymentPackager('2.0.0');
    const f = tmpFile('sentinel-ver.js', 'v');
    tmpFiles.push(f);

    const m1 = await p1.generateManifest([f]);
    const m2 = await p2.generateManifest([f]);
    expect(m1.version).toBe('1.0.0');
    expect(m2.version).toBe('2.0.0');
    // SHA-256 should be same (same file content)
    expect(m1.files[0].sha256).toBe(m2.files[0].sha256);
  });

  it('FR-W16-07-10: DeploymentPackager.sha256Buffer() computes correct hash for string input', () => {
    const data = 'test data for SHA-256';
    const expected = createHash('sha256').update(data).digest('hex');
    const actual = DeploymentPackager.sha256Buffer(data);
    expect(actual).toBe(expected);
  });

  it('FR-W16-07-11: verifyManifest() with empty manifest and empty actualFiles returns valid=true', async () => {
    const manifest: DeploymentManifest = {
      version: '1.0.0',
      ts: new Date().toISOString(),
      files: [],
      totalFiles: 0,
    };
    const result = await packager.verifyManifest(manifest, []);
    expect(result.valid).toBe(true);
  });

  it('FR-W16-07-12: manifest file path is stored as provided (no normalization)', async () => {
    const f = tmpFile('sentinel-path-test.js', 'path');
    tmpFiles.push(f);

    const manifest = await packager.generateManifest([f]);
    expect(manifest.files[0].path).toBe(f);
  });
});
