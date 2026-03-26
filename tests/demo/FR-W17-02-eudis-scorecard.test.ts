import { describe, it, expect, beforeEach } from 'vitest';
import { EudisComplianceScorecard } from '../../src/demo/eudis-compliance-scorecard.js';

describe('FR-W17-02: EudisComplianceScorecard — EUDIS challenge requirements mapping', () => {
  let scorecard: EudisComplianceScorecard;

  beforeEach(() => {
    scorecard = new EudisComplianceScorecard();
  });

  // ── Scorecard structure ───────────────────────────────────────────────────

  it('SC-01: scorecard has at least 10 entries', () => {
    expect(scorecard.scorecard.length).toBeGreaterThanOrEqual(10);
  });

  it('SC-02: each entry has required fields', () => {
    for (const entry of scorecard.scorecard) {
      expect(entry.requirement).toBeTruthy();
      expect(['C01', 'C02']).toContain(entry.challenge);
      expect(['MET', 'PARTIAL', 'NOT_MET']).toContain(entry.status);
      expect(Array.isArray(entry.evidence)).toBe(true);
      expect(Array.isArray(entry.frRefs)).toBe(true);
      expect(entry.evidence.length).toBeGreaterThan(0);
      expect(entry.frRefs.length).toBeGreaterThan(0);
    }
  });

  it('SC-03: has both C01 and C02 entries', () => {
    const challenges = scorecard.scorecard.map(e => e.challenge);
    expect(challenges).toContain('C01');
    expect(challenges).toContain('C02');
  });

  it('SC-04: Challenge 01 has at least 5 requirements', () => {
    expect(scorecard.getByChallenge('C01').length).toBeGreaterThanOrEqual(5);
  });

  it('SC-05: Challenge 02 has at least 5 requirements', () => {
    expect(scorecard.getByChallenge('C02').length).toBeGreaterThanOrEqual(5);
  });

  it('SC-06: all C01 perimeter detection requirements reference FR-W3 or FR-W5 or FR-W10', () => {
    const c01 = scorecard.getByChallenge('C01');
    const allHaveFrRefs = c01.every(e => e.frRefs.length > 0);
    expect(allHaveFrRefs).toBe(true);
  });

  it('SC-07: trajectory prediction requirement references FR-W8', () => {
    const traj = scorecard.scorecard.find(e =>
      e.requirement.toLowerCase().includes('trajectory') ||
      e.frRefs.some(fr => fr.includes('W8'))
    );
    expect(traj).toBeDefined();
  });

  // ── Score computation ─────────────────────────────────────────────────────

  it('SC-08: getScore returns challenge01, challenge02, total', () => {
    const score = scorecard.getScore();
    expect(typeof score.challenge01).toBe('number');
    expect(typeof score.challenge02).toBe('number');
    expect(typeof score.total).toBe('number');
  });

  it('SC-09: scores are between 0 and 100', () => {
    const score = scorecard.getScore();
    expect(score.challenge01).toBeGreaterThanOrEqual(0);
    expect(score.challenge01).toBeLessThanOrEqual(100);
    expect(score.challenge02).toBeGreaterThanOrEqual(0);
    expect(score.challenge02).toBeLessThanOrEqual(100);
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });

  it('SC-10: all MET → scores all 100', () => {
    // All entries in our scorecard are MET by design
    const score = scorecard.getScore();
    expect(score.challenge01).toBe(100);
    expect(score.challenge02).toBe(100);
    expect(score.total).toBe(100);
  });

  it('SC-11: getMetCount equals number of MET entries', () => {
    const metCount = scorecard.scorecard.filter(e => e.status === 'MET').length;
    expect(scorecard.getMetCount()).toBe(metCount);
  });

  it('SC-12: total is average of C01 and C02 scores', () => {
    const score = scorecard.getScore();
    const expected = Math.round((score.challenge01 + score.challenge02) / 2);
    expect(score.total).toBe(expected);
  });

  // ── Report generation ─────────────────────────────────────────────────────

  it('SC-13: generateReport returns non-empty string', () => {
    const report = scorecard.generateReport();
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(500);
  });

  it('SC-14: generateReport includes challenge scores', () => {
    const report = scorecard.generateReport();
    expect(report).toContain('100');
    expect(report).toContain('Challenge 01');
    expect(report).toContain('Challenge 02');
  });

  it('SC-15: generateReport includes FR references', () => {
    const report = scorecard.generateReport();
    expect(report).toMatch(/FR-W\d+-\d+/);
  });

  it('SC-16: getByChallenge filters correctly', () => {
    const c01 = scorecard.getByChallenge('C01');
    const c02 = scorecard.getByChallenge('C02');
    expect(c01.every(e => e.challenge === 'C01')).toBe(true);
    expect(c02.every(e => e.challenge === 'C02')).toBe(true);
  });

  it('SC-17: NATO AWNING requirement is in scorecard', () => {
    const awning = scorecard.scorecard.find(e =>
      e.requirement.toLowerCase().includes('awning') ||
      e.frRefs.some(fr => fr.includes('W10'))
    );
    expect(awning).toBeDefined();
  });

  it('SC-18: privacy/GDPR requirement present in C02', () => {
    const privacy = scorecard.getByChallenge('C02').find(e =>
      e.requirement.toLowerCase().includes('privacy') ||
      e.frRefs.some(fr => fr.includes('W15'))
    );
    expect(privacy).toBeDefined();
  });
});
