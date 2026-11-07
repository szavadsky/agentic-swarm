import fs from "node:fs";
import path from "node:path";
import type { PipelineBudget, StepMetaArtifact, StepUsage } from "./artifacts.js";
import type { Usage } from "../harness/types.js";
import { readYaml } from "./records/io.js";

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

/**
 * Tracks token and dollar budgets across task, iteration, and items (§12.5).
 * Enforces limits:
 * - perItemUsd exceeded: item -> consult
 * - perIterationUsd exceeded: iteration -> end
 * - perTaskUsd exceeded: task -> human-stop item + exit 10
 */
export class BudgetTracker {
  private taskSpend: SpendTotals = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  private iterationSpend = new Map<number, SpendTotals>();
  private itemSpend = new Map<string, SpendTotals>();

  constructor(public readonly budget?: PipelineBudget) {}

  public recordUsage(opts: {
    item?: string;
    iteration?: number;
    usage?: StepUsage | Usage;
  }): void {
    const { item, iteration, usage } = opts;
    if (!usage) return;

    const inTok = usage.inputTokens ?? 0;
    const outTok = usage.outputTokens ?? 0;
    const cost = usage.costUsd ?? 0;

    // Task total
    this.taskSpend.inputTokens += inTok;
    this.taskSpend.outputTokens += outTok;
    this.taskSpend.costUsd += cost;

    // Iteration total
    if (iteration !== undefined) {
      const cur = this.iterationSpend.get(iteration) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 };
      cur.inputTokens += inTok;
      cur.outputTokens += outTok;
      cur.costUsd += cost;
      this.iterationSpend.set(iteration, cur);
    }

    // Item total
    if (item) {
      const cur = this.itemSpend.get(item) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 };
      cur.inputTokens += inTok;
      cur.outputTokens += outTok;
      cur.costUsd += cost;
      this.itemSpend.set(item, cur);
    }
  }

  public getTaskSpend(): SpendTotals {
    return { ...this.taskSpend };
  }

  public getIterationSpend(iteration: number): SpendTotals {
    return { ...(this.iterationSpend.get(iteration) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 }) };
  }

  public getItemSpend(item: string): SpendTotals {
    return { ...(this.itemSpend.get(item) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 }) };
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
    return {
      exceeded: spent > limit,
      spent,
      limit,
    };
  }

  public checkItemBudget(item: string): BudgetCheckResult {
    const limit = this.budget?.perItemUsd;
    const spent = this.itemSpend.get(item)?.costUsd ?? 0;
    if (limit === undefined || limit <= 0) {
      return { exceeded: false, spent, limit };
    }
    return {
      exceeded: spent > limit,
      spent,
      limit,
    };
  }

  /**
   * Reconciles budget totals by scanning committed step record meta.yaml files.
   * Ensures restart safety across process runs.
   */
  public async reconcileFromDisk(taskDir: string): Promise<void> {
    // 1. Runs (orchestration steps)
    const runsDir = path.join(taskDir, "runs");
    if (fs.existsSync(runsDir)) {
      const entries = await fs.promises.readdir(runsDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory()) {
          const metaPath = path.join(runsDir, ent.name, "meta.yaml");
          if (fs.existsSync(metaPath)) {
            try {
              const meta = await readYaml<StepMetaArtifact>(metaPath);
              if (meta?.usage) {
                this.recordUsage({ usage: meta.usage });
              }
            } catch {
              // ignore malformed or unreadable meta
            }
          }
        }
      }
    }

    // 2. Items
    const itemsDir = path.join(taskDir, "items");
    if (fs.existsSync(itemsDir)) {
      const itemDirs = await fs.promises.readdir(itemsDir, { withFileTypes: true });
      for (const idir of itemDirs) {
        if (idir.isDirectory()) {
          const itemSlug = idir.name;
          const stepsDir = path.join(itemsDir, itemSlug, "steps");
          if (fs.existsSync(stepsDir)) {
            const stepDirs = await fs.promises.readdir(stepsDir, { withFileTypes: true });
            for (const sdir of stepDirs) {
              if (sdir.isDirectory()) {
                const metaPath = path.join(stepsDir, sdir.name, "meta.yaml");
                if (fs.existsSync(metaPath)) {
                  try {
                    const meta = await readYaml<StepMetaArtifact>(metaPath);
                    if (meta?.usage) {
                      this.recordUsage({ item: itemSlug, usage: meta.usage });
                    }
                  } catch {
                    // ignore
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
