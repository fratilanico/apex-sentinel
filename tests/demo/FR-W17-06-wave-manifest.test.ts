import { describe, it, expect, beforeEach } from 'vitest';
import { WaveManifestGenerator } from '../../src/demo/wave-manifest-generator.js';
import { join } from 'node:path';

describe('FR-W17-06: WaveManifestGenerator — W1-W17 implementation manifest', () => {
  let generator: WaveManifestGenerator;

  beforeEach(() => {
    generator = new WaveManifestGenerator(join(process.cwd(), 'src'));
  });

  // ── getStats ──────────────────────────────────────────────────────────────

  it('SC-01: getStats returns totalWaves, totalFRs, totalTests, totalSourceFiles', () => {
    const stats = generator.getStats();
    expect(typeof stats.totalWaves).toBe('number');
    expect(typeof stats.totalFRs).toBe('number');
    expect(typeof stats.totalTests).toBe('number');
    expect(typeof stats.totalSourceFiles).toBe('number');
  });

  it('SC-02: totalWaves is 17', () => {
    expect(generator.getStats().totalWaves).toBe(17);
  });

  it('SC-03: totalFRs is at least 40', () => {
    expect(generator.getStats().totalFRs).toBeGreaterThanOrEqual(40);
  });

  it('SC-04: totalTests is at least 2000', () => {
    expect(generator.getStats().totalTests).toBeGreaterThanOrEqual(2000);
  });

  it('SC-05: totalSourceFiles is at least 10', () => {
    expect(generator.getStats().totalSourceFiles).toBeGreaterThanOrEqual(10);
  });

  // ── getSourceDirectories ──────────────────────────────────────────────────

  it('SC-06: getSourceDirectories returns array of directory entries', () => {
    const dirs = generator.getSourceDirectories();
    expect(Array.isArray(dirs)).toBe(true);
    expect(dirs.length).toBeGreaterThan(0);
  });

  it('SC-07: each directory entry has name and fileCount', () => {
    const dirs = generator.getSourceDirectories();
    for (const d of dirs) {
      expect(typeof d.name).toBe('string');
      expect(typeof d.fileCount).toBe('number');
    }
  });

  it('SC-08: known domain directories present', () => {
    const dirs = generator.getSourceDirectories();
    const names = dirs.map(d => d.name);
    expect(names).toContain('detection');
    expect(names).toContain('dashboard');
    expect(names).toContain('nato');
  });

  it('SC-09: demo directory is included', () => {
    const dirs = generator.getSourceDirectories();
    const names = dirs.map(d => d.name);
    expect(names).toContain('demo');
  });

  // ── generateManifest ──────────────────────────────────────────────────────

  it('SC-10: generateManifest returns WaveManifest structure', () => {
    const manifest = generator.generateManifest();
    expect(manifest.system).toBe('APEX-SENTINEL');
    expect(manifest.version).toBe('W17');
    expect(typeof manifest.generatedAt).toBe('string');
    expect(Array.isArray(manifest.waves)).toBe(true);
    expect(Array.isArray(manifest.frRegistry)).toBe(true);
    expect(Array.isArray(manifest.sourceDirectories)).toBe(true);
  });

  it('SC-11: manifest has 17 waves', () => {
    expect(generator.generateManifest().waves).toHaveLength(17);
  });

  it('SC-12: each wave entry has wave, name, frCount, testCount, status', () => {
    for (const wave of generator.generateManifest().waves) {
      expect(typeof wave.wave).toBe('string');
      expect(typeof wave.name).toBe('string');
      expect(wave.frCount).toBeGreaterThan(0);
      expect(wave.testCount).toBeGreaterThan(0);
      expect(['COMPLETE', 'IN_PROGRESS', 'PLANNED']).toContain(wave.status);
    }
  });

  it('SC-13: W1-W16 waves are COMPLETE', () => {
    const manifest = generator.generateManifest();
    const completed = manifest.waves.filter(w => w.wave !== 'W17');
    expect(completed.every(w => w.status === 'COMPLETE')).toBe(true);
  });

  it('SC-14: W17 is IN_PROGRESS', () => {
    const w17 = generator.generateManifest().waves.find(w => w.wave === 'W17');
    expect(w17?.status).toBe('IN_PROGRESS');
  });

  it('SC-15: frRegistry entries have id, wave, description', () => {
    for (const fr of generator.generateManifest().frRegistry) {
      expect(fr.id).toMatch(/FR-W\d+-\d+/);
      expect(typeof fr.wave).toBe('string');
      expect(typeof fr.description).toBe('string');
    }
  });

  it('SC-16: W17 FRs are in registry', () => {
    const registry = generator.generateManifest().frRegistry;
    const w17Frs = registry.filter(fr => fr.wave === 'W17');
    expect(w17Frs.length).toBeGreaterThanOrEqual(8);
  });

  // ── generateReadme ────────────────────────────────────────────────────────

  it('SC-17: generateReadme returns string >5000 chars', () => {
    const readme = generator.generateReadme();
    expect(typeof readme).toBe('string');
    expect(readme.length).toBeGreaterThanOrEqual(5000);
  });

  it('SC-18: readme includes APEX-SENTINEL header', () => {
    expect(generator.generateReadme()).toContain('APEX-SENTINEL');
  });

  it('SC-19: readme includes key claims', () => {
    const readme = generator.generateReadme();
    expect(readme).toContain('IEC 61508');
    expect(readme).toContain('NATO AWNING');
  });

  it('SC-20: readme includes wave table with W1-W17', () => {
    const readme = generator.generateReadme();
    expect(readme).toContain('W1');
    expect(readme).toContain('W17');
  });
});
