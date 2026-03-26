import { describe, it, expect, beforeEach } from 'vitest';
import { JudgePresentationPackage } from '../../src/demo/judge-presentation-package.js';

describe('FR-W17-07: JudgePresentationPackage — judge briefing materials', () => {
  let pkg: JudgePresentationPackage;

  beforeEach(() => {
    pkg = new JudgePresentationPackage();
  });

  // ── Key claims ────────────────────────────────────────────────────────────

  it('SC-01: getKeyClaims returns array', () => {
    expect(Array.isArray(pkg.getKeyClaims())).toBe(true);
  });

  it('SC-02: at least 5 key claims', () => {
    expect(pkg.getKeyClaims().length).toBeGreaterThanOrEqual(5);
  });

  it('SC-03: each claim has claim, evidence, verified', () => {
    for (const c of pkg.getKeyClaims()) {
      expect(typeof c.claim).toBe('string');
      expect(typeof c.evidence).toBe('string');
      expect(typeof c.verified).toBe('boolean');
    }
  });

  it('SC-04: all key claims are verified=true', () => {
    for (const c of pkg.getKeyClaims()) {
      expect(c.verified).toBe(true);
    }
  });

  it('SC-05: includes IEC 61508 claim', () => {
    const claims = pkg.getKeyClaims();
    expect(claims.some(c => c.claim.includes('IEC 61508') || c.evidence.includes('IEC 61508'))).toBe(true);
  });

  it('SC-06: includes test count claim (3000+)', () => {
    const claims = pkg.getKeyClaims();
    expect(claims.some(c => c.claim.includes('tests') || c.claim.includes('3000'))).toBe(true);
  });

  it('SC-07: includes NATO AWNING claim', () => {
    const claims = pkg.getKeyClaims();
    expect(claims.some(c => c.claim.toLowerCase().includes('nato') || c.evidence.toLowerCase().includes('awning'))).toBe(true);
  });

  it('SC-08: includes GDPR/privacy claim', () => {
    const claims = pkg.getKeyClaims();
    expect(claims.some(c => c.claim.toLowerCase().includes('gdpr') || c.evidence.toLowerCase().includes('pii'))).toBe(true);
  });

  // ── generatePackage ───────────────────────────────────────────────────────

  it('SC-09: generatePackage returns structured object', () => {
    const p = pkg.generatePackage();
    expect(p.systemName).toBe('APEX-SENTINEL');
    expect(p.version).toBe('W17');
    expect(p.hackathon).toContain('EUDIS');
    expect(typeof p.submittedAt).toBe('string');
  });

  it('SC-10: package includes compliance section', () => {
    const p = pkg.generatePackage();
    expect(Array.isArray(p.compliance.scorecard)).toBe(true);
    expect(p.compliance.scorecard.length).toBeGreaterThan(0);
    expect(typeof p.compliance.score.challenge01).toBe('number');
    expect(typeof p.compliance.score.challenge02).toBe('number');
    expect(typeof p.compliance.score.total).toBe('number');
  });

  it('SC-11: compliance score is all 100 (all MET)', () => {
    const p = pkg.generatePackage();
    expect(p.compliance.score.challenge01).toBe(100);
    expect(p.compliance.score.challenge02).toBe(100);
    expect(p.compliance.score.total).toBe(100);
  });

  it('SC-12: package includes implementation with waves', () => {
    const p = pkg.generatePackage();
    expect(typeof p.implementation.stats.totalWaves).toBe('number');
    expect(Array.isArray(p.implementation.waves)).toBe(true);
    expect(p.implementation.waves).toHaveLength(17);
  });

  it('SC-13: package includes keyClaims array', () => {
    const p = pkg.generatePackage();
    expect(Array.isArray(p.keyClaims)).toBe(true);
    expect(p.keyClaims.length).toBeGreaterThan(0);
  });

  it('SC-14: performance is null before benchmarks run', () => {
    const p = pkg.generatePackage();
    expect(p.performance).toBeNull();
  });

  it('SC-15: submittedAt is valid ISO date', () => {
    const p = pkg.generatePackage();
    expect(() => new Date(p.submittedAt)).not.toThrow();
    expect(p.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // ── generateTelegramBrief ─────────────────────────────────────────────────

  it('SC-16: generateTelegramBrief returns string', () => {
    const brief = pkg.generateTelegramBrief();
    expect(typeof brief).toBe('string');
    expect(brief.length).toBeGreaterThan(10);
  });

  it('SC-17: Telegram brief uses box-drawing chars', () => {
    const brief = pkg.generateTelegramBrief();
    expect(brief).toContain('╔');
    expect(brief).toContain('║');
    expect(brief).toContain('╚');
  });

  it('SC-18: Telegram brief mentions APEX-SENTINEL', () => {
    expect(pkg.generateTelegramBrief()).toContain('APEX-SENTINEL');
  });

  it('SC-19: Telegram brief is ≤10 lines', () => {
    const brief = pkg.generateTelegramBrief();
    const lines = brief.split('\n').filter(l => l.trim().length > 0);
    expect(lines.length).toBeLessThanOrEqual(10);
  });

  it('SC-20: Telegram brief includes IEC 61508', () => {
    expect(pkg.generateTelegramBrief()).toContain('IEC 61508');
  });
});
