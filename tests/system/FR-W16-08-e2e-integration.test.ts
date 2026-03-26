// APEX-SENTINEL W16 Tests — FR-W16-08: W16EndToEndIntegration
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { W16EndToEndIntegration } from '../../src/system/w16-end-to-end-integration.js';
import { createDefaultBootSequencer } from '../../src/system/sentinel-boot-sequencer.js';
import { EdgePerformanceProfiler } from '../../src/system/edge-performance-profiler.js';
import { SystemHealthDashboard } from '../../src/system/system-health-dashboard.js';
import { ConfigurationManager } from '../../src/system/configuration-manager.js';
import { CrossSystemIntegrationValidator } from '../../src/system/cross-system-integration-validator.js';
import { MemoryBudgetEnforcer } from '../../src/system/memory-budget-enforcer.js';
import { DeploymentPackager } from '../../src/system/deployment-packager.js';

describe('FR-W16-08: W16EndToEndIntegration', () => {
  let e2e: W16EndToEndIntegration;

  beforeEach(() => {
    delete process.env['SENTINEL_DEMO_MODE'];
    e2e = new W16EndToEndIntegration();
  });

  it('FR-W16-08-01: runFullPipeline() completes and returns result object', async () => {
    const result = await e2e.runFullPipeline();
    expect(result).toBeDefined();
    expect(typeof result.bootSuccess).toBe('boolean');
    expect(typeof result.slaCompliant).toBe('boolean');
    expect(typeof result.memoryCompliant).toBe('boolean');
    expect(typeof result.shutdownSuccess).toBe('boolean');
  });

  it('FR-W16-08-02: boot sequence completes all 8 phases', async () => {
    const result = await e2e.runFullPipeline();
    expect(result.bootSuccess).toBe(true);
    const manifest = e2e.getContext().bootSequencer.getBootManifest();
    expect(manifest?.phases).toHaveLength(8);
    expect(manifest?.phases.every(p => p.success)).toBe(true);
  });

  it('FR-W16-08-03: shutdown returns bootSuccess=false after shutdown', async () => {
    const result = await e2e.runFullPipeline();
    expect(result.shutdownSuccess).toBe(true);
    expect(e2e.getContext().bootSequencer.isBooted()).toBe(false);
  });

  it('FR-W16-08-04: NOMINAL validation passes', async () => {
    const result = await e2e.runFullPipeline();
    expect(result.validationResults.nominal).toBe(true);
  });

  it('FR-W16-08-05: DEGRADED validation passes', async () => {
    const result = await e2e.runFullPipeline();
    expect(result.validationResults.degraded).toBe(true);
  });

  it('FR-W16-08-06: CRITICAL validation passes', async () => {
    const result = await e2e.runFullPipeline();
    expect(result.validationResults.critical).toBe(true);
  });

  it('FR-W16-08-07: SLA compliance is true when no latency samples recorded', async () => {
    const result = await e2e.runFullPipeline();
    expect(result.slaCompliant).toBe(true);
  });

  it('FR-W16-08-08: memory compliance passes for empty component objects', async () => {
    const result = await e2e.runFullPipeline();
    expect(result.memoryCompliant).toBe(true);
  });

  it('FR-W16-08-09: SLA regression — p99 acoustic inference within 200ms', () => {
    const profiler = new EdgePerformanceProfiler();
    // Simulate 100 nominal latencies (50ms)
    for (let i = 0; i < 100; i++) {
      profiler.recordLatency('acoustic-inference', 50);
    }
    const result = profiler.checkSla('acoustic-inference');
    expect(result.pass).toBe(true);
    expect(result.p99).toBeLessThanOrEqual(200);
  });

  it('FR-W16-08-10: memory regression — DataFeedBroker 1MB object is within 50MB budget', () => {
    const enforcer = new MemoryBudgetEnforcer();
    const oneMb = 1 * 1024 * 1024;
    const result = enforcer.checkBudget('DataFeedBroker', oneMb);
    expect(result.ok).toBe(true);
  });

  it('FR-W16-08-11: security regression — prototype pollution key rejected by config manager', () => {
    const cm = new ConfigurationManager();
    // Attempting to read __proto__ key should return undefined/default, not throw
    expect(() => cm.get('__proto__', null)).not.toThrow();
    expect(cm.get('__proto__', null)).toBeNull();
  });

  it('FR-W16-08-12: config manager validates default config as valid', () => {
    const cm = new ConfigurationManager();
    const result = cm.validate();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('FR-W16-08-13: W16EndToEndIntegration accepts custom context modules', async () => {
    const customProfiler = new EdgePerformanceProfiler();
    customProfiler.recordLatency('acoustic-inference', 100);

    const customE2e = new W16EndToEndIntegration({ profiler: customProfiler });
    const result = await customE2e.runFullPipeline();
    // profiler has a sample now — SLA should still pass (100ms < 200ms)
    expect(result.slaCompliant).toBe(true);
  });

  it('FR-W16-08-14: boot failure marks bootSuccess=false', async () => {
    const failingBooter = createDefaultBootSequencer({
      1: async () => { throw new Error('config error'); },
    });
    const customE2e = new W16EndToEndIntegration({ bootSequencer: failingBooter });
    const result = await customE2e.runFullPipeline();
    expect(result.bootSuccess).toBe(false);
  });

  it('FR-W16-08-15: getContext() exposes all 7 W16 modules', () => {
    const ctx = e2e.getContext();
    expect(ctx.bootSequencer).toBeDefined();
    expect(ctx.profiler).toBeDefined();
    expect(ctx.healthDashboard).toBeDefined();
    expect(ctx.configManager).toBeDefined();
    expect(ctx.validator).toBeDefined();
    expect(ctx.memoryEnforcer).toBeDefined();
    expect(ctx.packager).toBeDefined();
  });
});
