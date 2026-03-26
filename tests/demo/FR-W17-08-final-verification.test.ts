import { describe, it, expect, beforeEach } from 'vitest';
import { FinalSystemVerification } from '../../src/demo/final-system-verification.js';

describe('FR-W17-08: FinalSystemVerification — final pre-demo GO/NO_GO gate', () => {
  let verifier: FinalSystemVerification;

  beforeEach(() => {
    verifier = new FinalSystemVerification();
  });

  // ── verifySystem ──────────────────────────────────────────────────────────

  it('SC-01: verifySystem returns VerificationReport', async () => {
    const report = await verifier.verifySystem();
    expect(typeof report.allGreen).toBe('boolean');
    expect(Array.isArray(report.checks)).toBe(true);
    expect(typeof report.summary).toBe('string');
    expect(typeof report.runAt).toBe('string');
  });

  it('SC-02: report has at least 5 checks', async () => {
    const report = await verifier.verifySystem();
    expect(report.checks.length).toBeGreaterThanOrEqual(5);
  });

  it('SC-03: each check has name, status, detail, elapsed_ms', async () => {
    const report = await verifier.verifySystem();
    for (const check of report.checks) {
      expect(typeof check.name).toBe('string');
      expect(['PASS', 'FAIL', 'WARN']).toContain(check.status);
      expect(typeof check.detail).toBe('string');
      expect(typeof check.elapsed_ms).toBe('number');
    }
  });

  it('SC-04: allGreen is true when all checks pass', async () => {
    const report = await verifier.verifySystem();
    const allPass = report.checks.every(c => c.status === 'PASS' || c.status === 'WARN');
    // allGreen requires all PASS (not just not FAIL)
    const allStrictPass = report.checks.every(c => c.status === 'PASS');
    expect(report.allGreen).toBe(allStrictPass);
  });

  it('SC-05: summary includes pass/fail/warn counts', async () => {
    const report = await verifier.verifySystem();
    expect(report.summary).toMatch(/\d+\/\d+ PASS/);
  });

  it('SC-06: runAt is valid ISO timestamp', async () => {
    const report = await verifier.verifySystem();
    expect(() => new Date(report.runAt)).not.toThrow();
    expect(report.runAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('SC-07: config_valid check is present', async () => {
    const report = await verifier.verifySystem();
    const check = report.checks.find(c => c.name === 'config_valid');
    expect(check).toBeDefined();
    expect(check!.status).toBe('PASS');
  });

  it('SC-08: awning_pipeline_functional check is present', async () => {
    const report = await verifier.verifySystem();
    const check = report.checks.find(c => c.name === 'awning_pipeline_functional');
    expect(check).toBeDefined();
    expect(['PASS', 'WARN']).toContain(check!.status);
  });

  it('SC-09: mind_the_gap_1_to_8 check is present and PASS', async () => {
    const report = await verifier.verifySystem();
    const check = report.checks.find(c => c.name === 'mind_the_gap_1_to_8');
    expect(check).toBeDefined();
    expect(check!.status).toBe('PASS');
  });

  it('SC-10: cross_system_nominal check is present', async () => {
    const report = await verifier.verifySystem();
    const check = report.checks.find(c => c.name === 'cross_system_nominal');
    expect(check).toBeDefined();
  });

  it('SC-11: boot_sequencer_phases check is present and PASS', async () => {
    const report = await verifier.verifySystem();
    const check = report.checks.find(c => c.name === 'boot_sequencer_phases');
    expect(check).toBeDefined();
    expect(check!.status).toBe('PASS');
  });

  it('SC-12: dashboard_api_responding check is present', async () => {
    const report = await verifier.verifySystem();
    const check = report.checks.find(c => c.name === 'dashboard_api_responding');
    expect(check).toBeDefined();
  });

  it('SC-13: telegram_gateway_reachable check is present', async () => {
    const report = await verifier.verifySystem();
    const check = report.checks.find(c => c.name === 'telegram_gateway_reachable');
    expect(check).toBeDefined();
  });

  it('SC-14: getLastReport returns null before verifySystem', () => {
    const fresh = new FinalSystemVerification();
    expect(fresh.getLastReport()).toBeNull();
  });

  it('SC-15: getLastReport returns report after verifySystem', async () => {
    await verifier.verifySystem();
    expect(verifier.getLastReport()).not.toBeNull();
  });

  // ── getGoNoGo ─────────────────────────────────────────────────────────────

  it('SC-16: getGoNoGo returns NO_GO before verifySystem', () => {
    const fresh = new FinalSystemVerification();
    const decision = fresh.getGoNoGo();
    expect(decision.verdict).toBe('NO_GO');
    expect(decision.blockers).toHaveLength(1);
  });

  it('SC-17: getGoNoGo returns verdict, blockers, warnings', async () => {
    const report = await verifier.verifySystem();
    const decision = verifier.getGoNoGo(report);
    expect(['GO', 'NO_GO']).toContain(decision.verdict);
    expect(Array.isArray(decision.blockers)).toBe(true);
    expect(Array.isArray(decision.warnings)).toBe(true);
  });

  it('SC-18: blockers correspond to FAIL checks', async () => {
    const report = await verifier.verifySystem();
    const decision = verifier.getGoNoGo(report);
    const failChecks = report.checks.filter(c => c.status === 'FAIL').length;
    expect(decision.blockers.length).toBe(failChecks);
  });

  it('SC-19: warnings correspond to WARN checks', async () => {
    const report = await verifier.verifySystem();
    const decision = verifier.getGoNoGo(report);
    const warnChecks = report.checks.filter(c => c.status === 'WARN').length;
    expect(decision.warnings.length).toBe(warnChecks);
  });

  it('SC-20: verdict is GO when no blockers', async () => {
    const report = await verifier.verifySystem();
    const decision = verifier.getGoNoGo(report);
    if (decision.blockers.length === 0) {
      expect(decision.verdict).toBe('GO');
    } else {
      expect(decision.verdict).toBe('NO_GO');
    }
  });
});
