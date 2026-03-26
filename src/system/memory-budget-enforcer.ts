// APEX-SENTINEL — W16 MemoryBudgetEnforcer
// FR-W16-06 | src/system/memory-budget-enforcer.ts

// ── Types ────────────────────────────────────────────────────────────────────

export interface BudgetResult {
  ok: boolean;
  used: number;
  budget: number;
  componentName: string;
}

export interface PruneableComponent {
  pruneOld(): void;
}

// ── Default budgets (bytes) ───────────────────────────────────────────────────

const DEFAULT_BUDGETS: Record<string, number> = {
  'DataFeedBroker': 50 * 1024 * 1024,   // 50 MB
  'ThreatTimeline': 10 * 1024 * 1024,   // 10 MB
  'SectorThreatMap': 5 * 1024 * 1024,   // 5 MB
};

// ── MemoryBudgetEnforcer ──────────────────────────────────────────────────────

export class MemoryBudgetEnforcer {
  private budgets: Map<string, number> = new Map();

  constructor() {
    for (const [k, v] of Object.entries(DEFAULT_BUDGETS)) {
      this.budgets.set(k, v);
    }
  }

  registerBudget(componentName: string, budgetBytes: number): void {
    this.budgets.set(componentName, budgetBytes);
  }

  /**
   * Check whether estimatedBytes is within the registered budget for componentName.
   * Estimation: caller should use JSON.stringify(obj).length * 2 (UTF-16 heuristic).
   */
  checkBudget(componentName: string, estimatedBytes: number): BudgetResult {
    const budget = this.budgets.get(componentName) ?? DEFAULT_BUDGETS[componentName] ?? Infinity;
    return {
      ok: estimatedBytes <= budget,
      used: estimatedBytes,
      budget,
      componentName,
    };
  }

  /**
   * Trigger garbage collection on a cache-heavy component by calling pruneOld().
   */
  enforceGc(component: PruneableComponent): void {
    component.pruneOld();
  }

  /**
   * Estimate byte size of an object using UTF-16 heuristic.
   */
  static estimate(obj: unknown): number {
    try {
      return JSON.stringify(obj).length * 2;
    } catch {
      return 0;
    }
  }

  getBudget(componentName: string): number | undefined {
    return this.budgets.get(componentName);
  }

  listBudgets(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [k, v] of this.budgets) {
      result[k] = v;
    }
    return result;
  }
}
