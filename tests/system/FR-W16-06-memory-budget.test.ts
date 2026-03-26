// APEX-SENTINEL W16 Tests — FR-W16-06: MemoryBudgetEnforcer
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryBudgetEnforcer, PruneableComponent } from '../../src/system/memory-budget-enforcer.js';

describe('FR-W16-06: MemoryBudgetEnforcer', () => {
  let enforcer: MemoryBudgetEnforcer;

  beforeEach(() => {
    enforcer = new MemoryBudgetEnforcer();
  });

  it('FR-W16-06-01: checkBudget returns ok=true when under budget', () => {
    const result = enforcer.checkBudget('DataFeedBroker', 1024);
    expect(result.ok).toBe(true);
    expect(result.componentName).toBe('DataFeedBroker');
  });

  it('FR-W16-06-02: checkBudget returns ok=false when over budget', () => {
    const overBudget = 51 * 1024 * 1024; // 51 MB > 50 MB DataFeedBroker limit
    const result = enforcer.checkBudget('DataFeedBroker', overBudget);
    expect(result.ok).toBe(false);
    expect(result.used).toBe(overBudget);
  });

  it('FR-W16-06-03: DataFeedBroker budget is 50 MB', () => {
    const budget = enforcer.getBudget('DataFeedBroker')!;
    expect(budget).toBe(50 * 1024 * 1024);
  });

  it('FR-W16-06-04: ThreatTimeline budget is 10 MB', () => {
    const budget = enforcer.getBudget('ThreatTimeline')!;
    expect(budget).toBe(10 * 1024 * 1024);
  });

  it('FR-W16-06-05: SectorThreatMap budget is 5 MB', () => {
    const budget = enforcer.getBudget('SectorThreatMap')!;
    expect(budget).toBe(5 * 1024 * 1024);
  });

  it('FR-W16-06-06: enforceGc() calls pruneOld() on component', () => {
    const mockComponent: PruneableComponent = { pruneOld: vi.fn() };
    enforcer.enforceGc(mockComponent);
    expect(mockComponent.pruneOld).toHaveBeenCalledOnce();
  });

  it('FR-W16-06-07: registerBudget() adds custom budget', () => {
    enforcer.registerBudget('CustomCache', 1024 * 1024);
    const result = enforcer.checkBudget('CustomCache', 500 * 1024);
    expect(result.ok).toBe(true);
    expect(result.budget).toBe(1024 * 1024);
  });

  it('FR-W16-06-08: checkBudget returns correct used and budget fields', () => {
    const estimatedBytes = 2 * 1024 * 1024; // 2 MB
    const result = enforcer.checkBudget('ThreatTimeline', estimatedBytes);
    expect(result.used).toBe(estimatedBytes);
    expect(result.budget).toBe(10 * 1024 * 1024);
    expect(result.ok).toBe(true);
  });

  it('FR-W16-06-09: MemoryBudgetEnforcer.estimate() returns 2x JSON length', () => {
    const obj = { key: 'value', num: 42 };
    const estimated = MemoryBudgetEnforcer.estimate(obj);
    const expected = JSON.stringify(obj).length * 2;
    expect(estimated).toBe(expected);
  });

  it('FR-W16-06-10: MemoryBudgetEnforcer.estimate() handles large arrays', () => {
    const arr = new Array(10000).fill({ id: 'test', ts: 12345 });
    const estimated = MemoryBudgetEnforcer.estimate(arr);
    expect(estimated).toBeGreaterThan(0);
  });

  it('FR-W16-06-11: listBudgets() returns all registered budgets', () => {
    const budgets = enforcer.listBudgets();
    expect(budgets['DataFeedBroker']).toBeDefined();
    expect(budgets['ThreatTimeline']).toBeDefined();
    expect(budgets['SectorThreatMap']).toBeDefined();
  });

  it('FR-W16-06-12: checkBudget with unknown component uses Infinity budget (always ok)', () => {
    const result = enforcer.checkBudget('UnknownComponent', 999 * 1024 * 1024);
    expect(result.ok).toBe(true);
    expect(result.budget).toBe(Infinity);
  });
});
