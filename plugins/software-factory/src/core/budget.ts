import type { Usage } from "../harness/types.js";

/** Process-config budget limits (dollar amounts). */
export interface BudgetLimits {
  perTaskUsd?: number;
  perIterationUsd?: number;
  perItemUsd?: number;
  perStepUsd?: number;
  expensiveRoles?: string[];
}

/** Token totals derived from harness Usage: cached input counts as input, reasoning as output. */
export interface SpendTotals {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface BudgetCheckResult {
  exceeded: boolean;
  spent: number;
  limit?: number;
}

function emptyTotals(): SpendTotals {
  return { inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

function addUsage(target: SpendTotals, usage: Usage): void {
  target.inputTokens +=
    usage.in + usage.cacheRead + usage.cacheWrite5m + usage.cacheWrite1h;
  target.outputTokens += usage.out + usage.reasoningOut;
  target.costUsd += usage.costUsd ?? 0;
}

/**
 * Tracks token and dollar budgets across task, iteration, and items.
 * Limits decide flow: an exceeded item/iteration/task budget is reported by
 * `check*Budget`; the caller chooses park or exit.
 */
export class BudgetTracker {
  private taskSpend: SpendTotals = emptyTotals();
  private iterationSpend = new Map<number, SpendTotals>();
  private itemSpend = new Map<string, SpendTotals>();
  private roleSpend = new Map<string, SpendTotals>();

  constructor(public readonly budget?: BudgetLimits) {}

  public recordUsage(opts: {
    item?: string;
    iteration?: number;
    role?: string;
    usage?: Usage;
  }): void {
    const { item, iteration, role, usage } = opts;
    if (!usage) return;

    addUsage(this.taskSpend, usage);
    if (iteration !== undefined) {
      const cur = this.iterationSpend.get(iteration) ?? emptyTotals();
      addUsage(cur, usage);
      this.iterationSpend.set(iteration, cur);
    }
    if (item) {
      const cur = this.itemSpend.get(item) ?? emptyTotals();
      addUsage(cur, usage);
      this.itemSpend.set(item, cur);
    }
    if (role) {
      const cur = this.roleSpend.get(role) ?? emptyTotals();
      addUsage(cur, usage);
      this.roleSpend.set(role, cur);
    }
  }

  public getTaskSpend(): SpendTotals {
    return { ...this.taskSpend };
  }

  public getIterationSpend(iteration: number): SpendTotals {
    return { ...(this.iterationSpend.get(iteration) ?? emptyTotals()) };
  }

  public getItemSpend(item: string): SpendTotals {
    return { ...(this.itemSpend.get(item) ?? emptyTotals()) };
  }

  public getRoleSpend(role: string): SpendTotals {
    return { ...(this.roleSpend.get(role) ?? emptyTotals()) };
  }

  public getAllItemSpend(): Map<string, SpendTotals> {
    return new Map([...this.itemSpend.entries()].map(([k, v]) => [k, { ...v }]));
  }

  public getAllRoleSpend(): Map<string, SpendTotals> {
    return new Map([...this.roleSpend.entries()].map(([k, v]) => [k, { ...v }]));
  }

  public checkTaskBudget(): BudgetCheckResult {
    const limit = this.budget?.perTaskUsd;
    if (limit === undefined || limit <= 0) {
      return { exceeded: false, spent: this.taskSpend.costUsd, limit };
    }
    return {
      exceeded: this.taskSpend.costUsd > limit,
      spent: this.taskSpend.costUsd,
      limit,
    };
  }

  public checkIterationBudget(iteration: number): BudgetCheckResult {
    const limit = this.budget?.perIterationUsd;
    const spent = this.iterationSpend.get(iteration)?.costUsd ?? 0;
    if (limit === undefined || limit <= 0) {
      return { exceeded: false, spent, limit };
    }
    return { exceeded: spent > limit, spent, limit };
  }

  public checkItemBudget(item: string): BudgetCheckResult {
    const limit = this.budget?.perItemUsd;
    const spent = this.itemSpend.get(item)?.costUsd ?? 0;
    if (limit === undefined || limit <= 0) {
      return { exceeded: false, spent, limit };
    }
    return { exceeded: spent > limit, spent, limit };
  }
}
